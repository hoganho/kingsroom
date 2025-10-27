const cheerio = require('cheerio');
const stringSimilarity = require('string-similarity');

/**
 * Parses duration strings (e.g., "1h 30m") into milliseconds.
 */
const parseDurationToMilliseconds = (durationStr) => {
    if (!durationStr) return 0;
    
    let totalMilliseconds = 0;
    const hourMatch = durationStr.match(/(\d+)\s*h/);
    const minMatch = durationStr.match(/(\d+)\s*m/);
    
    if (hourMatch && hourMatch[1]) {
        totalMilliseconds += parseInt(hourMatch[1], 10) * 60 * 60 * 1000;
    }
    if (minMatch && minMatch[1]) {
        totalMilliseconds += parseInt(minMatch[1], 10) * 60 * 1000;
    }
    
    return totalMilliseconds;
};

const AUTO_ASSIGN_THRESHOLD = 0.90; // 90% similarity - high confidence
const SUGGEST_THRESHOLD = 0.60;     // 60% similarity - medium confidence, suggest to user

const cleanupVenueName = (name) => {
    if (!name) return '';
    
    const wordsToRemove = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const regex = new RegExp(`\\b(${wordsToRemove.join('|')})\\b`, 'gi');
    return name.replace(regex, '').replace(/\s+/g, ' ').trim();
};

/**
 * A context class to hold the scraper state.
 */
class ScrapeContext {
    constructor(html) {
        this.$ = cheerio.load(html);
        this.data = {};
        this.foundKeys = new Set();
        this.gameData = null;
        this.levelData = null;
        this._parseEmbeddedData();
    }
    
    _parseEmbeddedData() {
        const html = this.$.html();
        try {
            const gameDataRegex = /const cw_tt = ({.*?});/;
            const gameMatch = html.match(gameDataRegex);
            if (gameMatch && gameMatch[1]) {
                this.gameData = JSON.parse(gameMatch[1]);
            }
        } catch (e) {
            console.warn('Could not parse embedded game data (cw_tt):', e.message);
        }

        try {
            const levelDataRegex = /const cw_tt_levels = (\[.*?\]);/;
            const levelMatch = html.match(levelDataRegex);
            if (levelMatch && levelMatch[1]) {
                this.levelData = JSON.parse(levelMatch[1]);
            }
        } catch (e) {
            console.warn('Could not parse embedded level data (cw_tt_levels):', e.message);
        }
    }

    getText(key, selector) {
        const text = this.$(selector).first().text().trim();
        if (text) {
            this.foundKeys.add(key);
            this.data[key] = text;
            return text;
        }
        return undefined;
    }

    parseNumeric(key, selector) {
        const str = this.$(selector).first().text().trim();
        if (!str) return undefined;
        
        const num = parseInt(str.replace(/[^0-9.-]+/g, ''), 10);
        if (!isNaN(num)) {
            this.foundKeys.add(key);
            this.data[key] = num;
            return num;
        }
        return undefined;
    }

    add(key, value) {
        if (value !== undefined && value !== null) {
            this.foundKeys.add(key);
            this.data[key] = value;
        }
    }
}

/**
 * ===================================================================
 * STRATEGY FUNCTIONS
 * ===================================================================
 */
const defaultStrategy = {
    getName(ctx) {
        ctx.getText('name', '.cw-game-title');
    },
    
    getGameTags(ctx) {
        const tags = [];
        const selector = '.cw-game-buyins .cw-badge';

        ctx.$(selector).each((i, el) => {
            const tagText = ctx.$(el).text().trim();
            if (tagText) {
                tags.push(tagText);
            }
        });

        if (tags.length > 0) {
            ctx.add('gameTags', tags);
        }
    },

    getGameStartDateTime(ctx) {
        if (ctx.gameData && ctx.gameData.start_local) {
            ctx.add('gameStartDateTime', new Date(ctx.gameData.start_local).toISOString());
        } else {
            ctx.getText('gameStartDateTime', '#cw_clock_start_date_time_local');
        }
    },
    
    getStatus(ctx) {
        const status = (ctx.$('label:contains("Status")').first().next('strong').text().trim().toUpperCase() || 'UNKNOWN_STATUS');
        if (status !== 'UNKNOWN_STATUS') {
            ctx.add('status', status);
        }
        return status;
    },
    
    getRegistrationStatus(ctx) {
        const registrationDiv = ctx.$('label:contains("Registration")').parent();
        const registrationStatus = registrationDiv.text().replace(/Registration/gi, '').trim() || 'UNKNOWN_REG_STATUS';
        if (registrationStatus !== 'UNKNOWN_REG_STATUS') {
             ctx.add('registrationStatus', registrationStatus);
        }
        return registrationStatus;
    },
    
    getGameVariant(ctx) {
        if (ctx.gameData && ctx.gameData.shortlimitgame) {
            ctx.add('gameVariant', ctx.gameData.shortlimitgame);
        } else {
            ctx.getText('gameVariant', '#cw_clock_shortlimitgame');
        }
    },
    
    getPrizepool(ctx) {
        ctx.parseNumeric('prizepool', '#cw_clock_prizepool');
    },
    
    getTotalEntries(ctx) {
        const selector = '#cw_clock_playersentries';
        const text = ctx.$(selector).first().text().trim();
        const currentStatus = ctx.data.status;

        if (!text) return;

        if (currentStatus === 'RUNNING' && text.includes('/')) {
            const parts = text.split('/').map(part => parseInt(part.trim(), 10));
            
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                const playersRemaining = parts[0];
                const totalEntries = parts[1];
                
                // This value is now derived in getSeatingAndPlayersRemaining to be more accurate
                // ctx.add('playersRemaining', playersRemaining); 
                ctx.add('totalEntries', totalEntries);
            }
        } else {
            const num = parseInt(text.replace(/[^0-9.-]+/g, ''), 10);
            if (!isNaN(num)) {
                ctx.add('totalEntries', num);
            }
        }
    },

    getTotalRebuys(ctx) {
        ctx.parseNumeric('totalRebuys', '#cw_clock_rebuys');
    },
    
    getTotalAddons(ctx) {
        ctx.parseNumeric('totalAddons', 'div.cw-clock-label:contains("Add-Ons")');
    },

    getTotalDuration(ctx) {
        ctx.getText('totalDuration', 'div.cw-clock-label:contains("Total Time")');
    },
    
    getBuyIn(ctx) {
        if (ctx.gameData && ctx.gameData.costspb0 && ctx.gameData.costspb0.cost) {
            const buyIn = ctx.gameData.costspb0.cost + (ctx.gameData.costspb0.fee || 0);
            ctx.add('buyIn', buyIn);
        } else {
            ctx.parseNumeric('buyIn', '#cw_clock_buyin');
        }
    },
    
    getRake(ctx) {
        if (ctx.gameData && ctx.gameData.costspb0 && ctx.gameData.costspb0.fee) {
            ctx.add('rake', ctx.gameData.costspb0.fee);
        }
    },
    
    getStartingStack(ctx) {
        if (ctx.gameData && ctx.gameData.costspb0 && ctx.gameData.costspb0.chips) {
            ctx.add('startingStack', ctx.gameData.costspb0.chips);
        } else {
            ctx.parseNumeric('startingStack', '#cw_clock_startchips');
        }
    },
    
    getGuarantee(ctx) {
        const text = ctx.$('.cw-game-shortdesc').text().trim();
        if (!text) {
            ctx.add('hasGuarantee', false);
            return;
        }

        const guaranteeRegex = /(gtd|guaranteed|g'teed)/i;
        if (guaranteeRegex.test(text)) {
            ctx.add('hasGuarantee', true);
            
            let guaranteeAmount = null;

            // Regex for 1-2 digits followed by 'M' (e.g., "1M", "25M")
            const millionMatch = text.match(/\b(\d{1,2})M\b/i);
            
            // Regex for 1-3 digits followed by 'K' (e.g., "5K", "100K")
            const thousandMatch = text.match(/\b(\d{1,3})K\b/i);

            if (millionMatch && millionMatch[1]) {
                // Case 1: Handle millions (e.g., "1M")
                guaranteeAmount = parseInt(millionMatch[1], 10) * 1000000;
            
            } else if (thousandMatch && thousandMatch[1]) {
                // Case 2: Handle thousands (e.g., "5K")
                guaranteeAmount = parseInt(thousandMatch[1], 10) * 1000;
            
            } else {
                // Case 3: Fallback for plain numbers (e.g., "5000")
                const num = parseInt(text.replace(/[^0-9.-]+/g, ''), 10);
                if (!isNaN(num)) {
                    guaranteeAmount = num;
                }
            }
            
            // Only add the value if one of the cases found a number
            if (guaranteeAmount !== null) {
                ctx.add('guaranteeAmount', guaranteeAmount);
            }

        } else {
            ctx.add('hasGuarantee', false);
        }
    },

    calculateRevenueByBuyIns(ctx) {
        const entries = ctx.data.totalEntries || 0;
        const rebuys = ctx.data.totalRebuys || 0;
        const addons = ctx.data.totalAddons || 0;
        const buyIn = ctx.data.buyIn || 0;
        
        // =================================================================
        // ✅ DEBUG LOGGING START
        // =================================================================
        console.log('[DEBUG-REVENUE] Calculating Revenue...');
        console.log(`[DEBUG-REVENUE] -> Entries: ${entries}, Rebuys: ${rebuys}, Addons: ${addons}`);
        console.log(`[DEBUG-REVENUE] -> Buy-In: ${buyIn}`);
        // =================================================================

        if (buyIn <= 0) {
            // ✅ Log why the calculation is being skipped
            console.log('[DEBUG-REVENUE] Skipping calculation: Buy-In is zero or missing.');
            return;
        }

        const totalTransactions = entries + rebuys + addons;
        const revenue = totalTransactions * buyIn;
        
        // ✅ Log the final calculated values
        console.log(`[DEBUG-REVENUE] -> Total Transactions: ${totalTransactions}`);
        console.log(`[DEBUG-REVENUE] -> Calculated Revenue: ${revenue}`);

        ctx.add('revenueByBuyIns', revenue);
    },

    getSeriesName(ctx) {
        ctx.getText('seriesName', '.your-selector-for-series-name');
    },

    /**
     * Calculates the guarantee surplus or overlay.
     * This depends on hasGuarantee, prizepool, and guaranteeAmount.
     */
    calculateGuaranteeMetrics(ctx) {
        // Step 1: Check if there is a guarantee. If not, we can't calculate anything.
        if (!ctx.data.hasGuarantee) {
            // ✅ Log why the calculation is being skipped
            console.log('[DEBUG-GUARANTEE] Skipping metrics: Game has no guarantee.');
            return; 
        }

        const prizepool = ctx.data.prizepool || 0;
        const guarantee = ctx.data.guaranteeAmount || 0;

        // ✅ Log the inputs being used for the calculation
        console.log('[DEBUG-GUARANTEE] Calculating metrics...');
        console.log(`[DEBUG-GUARANTEE] -> Prizepool: ${prizepool}, Guarantee: ${guarantee}`);

        // Step 2: Ensure we have the necessary numbers to work with.
        if (prizepool <= 0 || guarantee <= 0) {
            console.log('[DEBUG-GUARANTEE] Skipping metrics: Missing prizepool or guarantee amount.');
            return;
        }

        const difference = prizepool - guarantee;
        // ✅ Log the calculated difference
        console.log(`[DEBUG-GUARANTEE] -> Difference (Prizepool - Guarantee): ${difference}`);

        // Step 3: Determine if it's a surplus or overlay.
        if (difference > 0) {
            // The prizepool exceeded the guarantee.
            ctx.add('guaranteeSurplus', difference);
            ctx.add('guaranteeOverlay', 0);
            // ✅ Log the final result
            console.log(`[DEBUG-GUARANTEE] -> Result: Surplus=${difference}, Overlay=0`);
        } else {
            // The prizepool did not meet the guarantee.
            ctx.add('guaranteeSurplus', 0);
            ctx.add('guaranteeOverlay', Math.abs(difference)); // Overlay is a positive number
            // ✅ Log the final result
            console.log(`[DEBUG-GUARANTEE] -> Result: Surplus=0, Overlay=${Math.abs(difference)}`);
        }
    },

    /**
     * Calculates the total rake collected from entries and rebuys.
     * This depends on totalEntries, totalRebuys, and rake.
     */
    calculateTotalRake(ctx) {
        const rake = ctx.data.rake;

        // Step 1: Check if the rake amount is known.
        if (rake === undefined || rake === null || rake <= 0) {
            console.log('[DEBUG-RAKE] Skipping total rake calculation: Rake is unknown or zero.');
            return;
        }

        const entries = ctx.data.totalEntries || 0;
        const rebuys = ctx.data.totalRebuys || 0;

        // ✅ Log the inputs being used for the calculation
        console.log('[DEBUG-RAKE] Calculating total rake...');
        console.log(`[DEBUG-RAKE] -> Rake per transaction: ${rake}, Entries: ${entries}, Rebuys: ${rebuys}`);
        
        // Step 2: Get the number of transactions that include rake.
        // Add-ons typically do not have a rake component.
        const totalRakedTransactions = entries + rebuys;
        console.log(`[DEBUG-RAKE] -> Total Raked Transactions: ${totalRakedTransactions}`);
        
        // Step 3: Calculate and add the total rake.
        const totalRake = totalRakedTransactions * rake;
        ctx.add('totalRake', totalRake);
        // ✅ Log the final result
        console.log(`[DEBUG-RAKE] -> Final Total Rake: ${totalRake}`);
    },

    /**
     * Calculates the profit or loss for the game operator.
     * This is determined by revenueByBuyIns - prizepool.
     */
    calculateProfitLoss(ctx) {
        const revenue = ctx.data.revenueByBuyIns;
        const prizepool = ctx.data.prizepool;

        // Step 1: Check if the necessary values are available to calculate.
        if (revenue === undefined || revenue === null || prizepool === undefined || prizepool === null) {
            console.log('[DEBUG-PROFIT] Skipping profit/loss calculation: Missing revenue or prizepool data.');
            return;
        }

        // Log the inputs for debugging.
        console.log('[DEBUG-PROFIT] Calculating profit/loss...');
        console.log(`[DEBUG-PROFIT] -> Revenue By Buy-Ins: ${revenue}`);
        console.log(`[DEBUG-PROFIT] -> Prizepool: ${prizepool}`);

        // Step 2: Perform the calculation.
        const profitLoss = revenue - prizepool;
        
        // Step 3: Add the result to the scraped data and log the final value.
        ctx.add('profitLoss', profitLoss);
        console.log(`[DEBUG-PROFIT] -> Final Profit/Loss: ${profitLoss}`);
    },
    
    getSeatingAndPlayersRemaining(ctx) {
        const seating = [];
        // This selector correctly finds the "Entries" table which lists players still in the game.
        const entriesTable = ctx.$('h4.cw-text-center:contains("Entries")').next('table').find('tbody tr');
        
        entriesTable.each((i, el) => {
            const $row = ctx.$(el);
            const $tds = $row.find('td');

            if ($tds.length < 4) return;

            const name = $tds.eq(1).text().trim();
            const tableSeatInfo = $tds.eq(2).text().trim();
            // This variable holds the stack as a string (e.g., "30,000")
            const chipsStr = $tds.eq(3).text().trim();

            // A player is considered "seated" if they have a chip count.
            if (chipsStr && tableSeatInfo.includes('Table')) {
                const tableSeatMatch = tableSeatInfo.match(/Table(\d+)\s*\/\s*(\d+)/);
                
                if (name && tableSeatMatch) {
                    // Convert the chip string to a number for the stack.
                    const stack = parseInt(chipsStr.replace(/,/g, ''), 10);

                    seating.push({
                        name: name,
                        table: parseInt(tableSeatMatch[1], 10),
                        seat: parseInt(tableSeatMatch[2], 10),
                        // ✅ THE FIX: Add the parsed playerStack here.
                        playerStack: !isNaN(stack) ? stack : null
                    });
                }
            }
        });

        if (seating.length > 0) {
            ctx.add('seating', seating);
        }
        // This also ensures playersRemaining is accurate.
        ctx.add('playersRemaining', seating.length);
    },

    getResults(ctx) {
        const results = [];
        const entriesTable = ctx.$('h4.cw-text-center:contains("Entries")').next('table').find('tbody tr');
        
        entriesTable.each((i, el) => {
            const $el = ctx.$(el);
            const rankText = $el.find('td').eq(2).text().trim();
            
            if (rankText.toLowerCase().includes('out')) {
                const name = $el.find('td').eq(1).text().trim();
                const rank = parseInt(rankText.replace(/\D/g, ''), 10);
                
                if (name && !isNaN(rank)) {
                    results.push({ rank, name, winnings: 0 });
                }
            }
        });

        if (results.length > 0) {
            ctx.add('results', results);
        }
    },

    getTables(ctx) {
        const tables = [];
        const tablesContainer = ctx.$('h4.cw-text-center:contains("Tables")').next('table').find('tbody');
        let currentTableName = null;
        let currentSeats = [];

        tablesContainer.find('tr.cw-tr').each((i, el) => {
            const $row = ctx.$(el);
            
            if ($row.find('td[colspan="4"]').length > 0) {
                if (currentTableName && currentSeats.length > 0) {
                    tables.push({ tableName: currentTableName, seats: currentSeats });
                }
                currentTableName = $row.find('td').text().trim();
                currentSeats = [];
            } else {
                const seatNumber = parseInt($row.find('td').eq(0).text().trim(), 10);
                const playerName = $row.find('td').eq(2).text().trim();
                const playerStackStr = $row.find('td').eq(3).text().trim().replace(/,/g, '');
                const playerStack = playerStackStr ? parseInt(playerStackStr, 10) : null;
                
                if (!isNaN(seatNumber)) {
                    currentSeats.push({
                        seat: seatNumber,
                        isOccupied: !!playerName,
                        playerName: playerName || null,
                        playerStack: isNaN(playerStack) ? null : playerStack,
                    });
                }
            }
        });

        if (currentTableName && currentSeats.length > 0) {
            tables.push({ tableName: currentTableName, seats: currentSeats });
        }

        if (tables.length > 0) {
            ctx.add('tables', tables);
        }
    },
    
    getTotalChipsInPlay(ctx) {
        ctx.parseNumeric('totalChipsInPlay', '#cw_clock_entire_stack');
    },
    
    getAveragePlayerStack(ctx) {
        ctx.parseNumeric('averagePlayerStack', '#cw_clock_avg_stack');
    },

    getLevels(ctx) {
        if (!ctx.levelData) return;
        const levels = ctx.levelData.map(level => ({
            levelNumber: level.ID || 0,
            durationMinutes: level.duration || 0,
            smallBlind: level.smallblind || 0,
            bigBlind: level.bigblind || 0,
            ante: level.ante || 0,
        }));
        if (levels.length > 0) ctx.add('levels', levels);
    },

    getBreaks(ctx) {
        if (!ctx.levelData) return;
        const breaks = [];

        for (let i = 0; i < ctx.levelData.length; i++) {
            const currentLevel = ctx.levelData[i];

            if (currentLevel.breakduration > 0) {
                const levelBefore = currentLevel.ID || 0;
                let levelAfter = 0;

                if (i + 1 < ctx.levelData.length) {
                    levelAfter = ctx.levelData[i + 1].ID || 0;
                } else {
                    levelAfter = levelBefore + 1;
                }

                breaks.push({
                    levelNumberBeforeBreak: levelBefore,
                    levelNumberAfterBreak: levelAfter,
                    durationMinutes: currentLevel.breakduration || 0,
                });
            }
        }

        if (breaks.length > 0) ctx.add('breaks', breaks);
    },

    getMatchingVenue(ctx, venues) {
        if (!ctx.data.name || !venues || venues.length === 0) {
            console.log('[DEBUG-MATCHING] Skipped: Missing scraped name or venue list.');
            return;
        }

        const cleanedScrapedName = cleanupVenueName(ctx.data.name);

        // 1. Create a flattened list of all possible names (primary + aliases) to match against.
        const allNamesToMatch = venues.flatMap(venue => {
            const names = [venue.name, ...(venue.aliases || [])];
            return names.map(name => ({
                venueId: venue.id,
                venueName: venue.name, // Keep the original primary name for display
                matchName: cleanupVenueName(name)
            }));
        });
        
        console.log(`[DEBUG-MATCHING] Cleaned scraped name: "${cleanedScrapedName}"`);

        // 2. Get ratings for the scraped name against all possible venue names/aliases.
        const { ratings } = stringSimilarity.findBestMatch(
            cleanedScrapedName,
            allNamesToMatch.map(item => item.matchName)
        );

        // 3. Process ratings to find the single best score for each unique venue.
        const bestScoresByVenue = new Map();
        ratings.forEach((rating, index) => {
            const { venueId, venueName } = allNamesToMatch[index];
            const score = rating.rating;

            if (!bestScoresByVenue.has(venueId) || score > bestScoresByVenue.get(venueId).score) {
                bestScoresByVenue.set(venueId, {
                    id: venueId,
                    name: venueName,
                    score: score
                });
            }
        });

        // 4. Sort the unique venues by their best score and take the top 3.
        const sortedSuggestions = Array.from(bestScoresByVenue.values())
            .sort((a, b) => b.score - a.score)
            .filter(v => v.score > 0) // Exclude venues with 0 score
            .slice(0, 3);
            
        if (sortedSuggestions.length === 0) {
            console.log('[DEBUG-MATCHING] No suggestions found after processing.');
            ctx.add('venueMatch', { suggestions: [] });
            return;
        }

        // 5. Determine if the top match qualifies for auto-assignment.
        let autoAssignedVenue = null;
        if (sortedSuggestions[0].score >= AUTO_ASSIGN_THRESHOLD) {
            autoAssignedVenue = sortedSuggestions[0];
        }

        // 6. Construct the final result object.
        const venueMatch = {
            autoAssignedVenue,
            suggestions: sortedSuggestions
        };
        
        console.log('[DEBUG-MATCHING] Final match result:', JSON.stringify(venueMatch, null, 2));
        ctx.add('venueMatch', venueMatch);
    }
};

/**
 * ===================================================================
 * STRATEGY MAP & RUNNER
 * ===================================================================
 */
const strategyMap = {
     "STATUS: COMPLETED | REG: CLOSED": defaultStrategy,
     "STATUS: RUNNING | REG: CLOSED": defaultStrategy,
     "STATUS: SCHEDULED | REG: OPEN": defaultStrategy,
};

// ✅ FIXED: The function signature was updated to accept the 'venues' parameter.
const runScraper = (html, structureLabel, venues = []) => {
    const ctx = new ScrapeContext(html);
    const strategy = defaultStrategy; 
    console.log(`[Scraper] Using unified robust strategy.`);
    
    for (const key in strategy) {
        if (typeof strategy[key] === 'function') {
            try {
                // Pass the venues list to the matching function
                if (key === 'getMatchingVenue') {
                    strategy[key](ctx, venues);
                } else {
                    strategy[key](ctx);
                }
            } catch (e) {
                console.error(`[Scraper] Error running strategy function "${key}":`, e.message);
            }
        }
    }
    ctx.add('rawHtml', html);
    return { data: ctx.data, foundKeys: Array.from(ctx.foundKeys) };
};

module.exports = {
    runScraper,
    getStatusAndReg: (html) => {
        const ctx = new ScrapeContext(html);
        const status = defaultStrategy.getStatus(ctx);
        const registrationStatus = defaultStrategy.getRegistrationStatus(ctx);
        return { status, registrationStatus };
    }
};