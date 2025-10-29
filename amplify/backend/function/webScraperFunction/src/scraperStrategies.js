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
const SERIES_MATCH_THRESHOLD = 0.80; // 80% similarity

const cleanupNameForMatching = (name) => {
    if (!name) return '';
    // This removes weekdays, which is useful for matching a game name to a series title.
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
    getName(ctx, seriesTitles = []) {
        // ✅ 1. Get the main and supplementary title parts from the HTML.
        const mainTitle = ctx.$('.cw-game-title').first().text().trim();
        const subTitle = ctx.$('.cw-game-shortdesc').first().text().trim();

        // ✅ 2. Combine them into a single name. 
        // This method filters out any empty parts before joining them with a space.
        const gameName = [mainTitle, subTitle].filter(Boolean).join(' ');
        
        // If no name found or empty, handle gracefully
        if (!gameName || gameName === '') {
            // Check if we already know this is an inactive/unknown tournament
            if (ctx.data.gameStatus === 'UNKNOWN_STATUS' || ctx.data.isInactive) {
                // Provide a placeholder name for inactive tournaments
                ctx.add('name', 'Tournament ID Not In Use');
                ctx.add('isSeries', false);
                ctx.add('isRegular', false);
                ctx.add('isInactive', true);
                return;
            } else {
                // If status is not unknown but name is missing, that's a different issue
                ctx.add('name', 'Unnamed Tournament');
                ctx.add('isSeries', false);
                ctx.add('isRegular', true);
                return;
            }
        }
        
        // ✅ 3. Normal processing continues with the full, combined name.
        ctx.add('name', gameName);

        if (!seriesTitles || seriesTitles.length === 0) {
            ctx.add('isSeries', false);
            ctx.add('isRegular', true);
            return;
        }

        // Clean the scraped game name to prepare it for matching.
        const cleanedGameName = cleanupNameForMatching(gameName);
        
        // Create a flat list of all possible series names and aliases to match against.
        const allSeriesNamesToMatch = seriesTitles.flatMap(series => {
            const names = [series.title, ...(series.aliases || [])];
            return names.map(name => ({
                seriesTitle: series.title, // The official title to use if matched
                matchName: name // The title or alias to compare against
            }));
        });

        // Find the best match between the cleaned game name and the list of series names.
        const { bestMatch } = stringSimilarity.findBestMatch(
            cleanedGameName,
            allSeriesNamesToMatch.map(s => s.matchName)
        );

        // Check if the best match meets our confidence threshold.
        if (bestMatch && bestMatch.rating >= SERIES_MATCH_THRESHOLD) {
            console.log(`[DEBUG-SERIES-MATCH] High confidence match found: "${bestMatch.target}" with rating ${bestMatch.rating}`);
            // Find the original series object to get its official title.
            const matchedSeries = allSeriesNamesToMatch.find(s => s.matchName === bestMatch.target);
            
            if (matchedSeries) {
                ctx.add('seriesName', matchedSeries.seriesTitle); // Always use the official title
                ctx.add('isSeries', true);
                ctx.add('isRegular', false);
            }
        } else {
            if (bestMatch) {
                 console.log(`[DEBUG-SERIES-MATCH] Low confidence match, ignoring: "${bestMatch.target}" with rating ${bestMatch.rating}`);
            }
            ctx.add('isSeries', false);
            ctx.add('isRegular', true);
        }
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

    getTournamentType(ctx) {
        // This function depends on getGameTags, so it must run after.
        const tags = ctx.data.gameTags || [];
        let tournamentType = 'FREEZEOUT'; // Set the default type

        // Define keywords for matching
        const rebuyKeywords = ['rebuy', 're-buy', 'reentry', 're-entry'];
        const satelliteKeywords = ['sat', 'satellite', 'satty'];

        // Create case-insensitive regular expressions
        const rebuyRegex = new RegExp(rebuyKeywords.join('|'), 'i');
        const satelliteRegex = new RegExp(satelliteKeywords.join('|'), 'i');

        // Check each tag for a match
        for (const tag of tags) {
            if (rebuyRegex.test(tag)) {
                tournamentType = 'REBUY';
                break; // A rebuy tournament was found, stop checking.
            }
            if (satelliteRegex.test(tag)) {
                tournamentType = 'SATELLITE';
                break; // A satellite tournament was found, stop checking.
            }
        }

        ctx.add('tournamentType', tournamentType);
        console.log(`[DEBUG-TYPE] Determined tournament type: ${tournamentType}`);
    },

    getGameStartDateTime(ctx) {
        if (ctx.gameData && ctx.gameData.start_local) {
            ctx.add('gameStartDateTime', new Date(ctx.gameData.start_local).toISOString());
        } else {
            ctx.getText('gameStartDateTime', '#cw_clock_start_date_time_local');
        }
    },
    
    getStatus(ctx) {
        // Get the status text - it might be empty or missing
        const statusElement = ctx.$('label:contains("Status")').first().next('strong');
        let gameStatus = statusElement.text().trim().toUpperCase();
        
        // If no status found or empty, mark as UNKNOWN_STATUS
        if (!gameStatus || gameStatus === '') {
            gameStatus = 'UNKNOWN_STATUS';
        }
        
        // Always add the gameStatus to the context, even if it's UNKNOWN_STATUS
        // This ensures we always have a status value
        if (gameStatus === 'UNKNOWN_STATUS') {
            // For unknown status, we'll handle this specially
            ctx.add('gameStatus', 'UNKNOWN_STATUS');
            // Also indicate this tournament ID is not in use
            ctx.add('isInactive', true);
        } else {
            // Map 'RUNNING' from scrape to correct status if needed
            const mappedStatus = gameStatus === 'RUNNING' ? 'RUNNING' : gameStatus;
            ctx.add('gameStatus', mappedStatus);
        }
        
        return gameStatus; // Return the raw scraped status for internal checks
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
        let variant = null;
        if (ctx.gameData && ctx.gameData.shortlimitgame) {
            variant = ctx.gameData.shortlimitgame;
        } else {
            variant = ctx.$('#cw_clock_shortlimitgame').first().text().trim();
        }

        if (variant) {
            const cleanedVariant = variant.replace(/\s/g, '');
            ctx.add('gameVariant', cleanedVariant);
        }
    },
    
    getPrizepool(ctx) {
        ctx.parseNumeric('prizepool', '#cw_clock_prizepool');
    },
    
    getTotalEntries(ctx) {
        // Simplified: Just extract total entries if available
        const selector = '#cw_clock_playersentries';
        const text = ctx.$(selector).first().text().trim();

        if (!text) return;

        let totalEntries = null;
        if (text.includes('/')) {
            const parts = text.split('/').map(part => parseInt(part.trim(), 10));
            if (parts.length === 2 && !isNaN(parts[1])) {
                totalEntries = parts[1];
            }
        } else {
            const num = parseInt(text.replace(/[^0-9.-]+/g, ''), 10);
            if (!isNaN(num)) {
                totalEntries = num;
            }
        }

        if (totalEntries !== null) {
            ctx.add('totalEntries', totalEntries);
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
    
    getSeating(ctx) { // Renamed from getSeatingAndPlayersRemaining
        const seating = [];
        const entriesTable = ctx.$('h4.cw-text-center:contains("Entries")').next('table').find('tbody tr');

        entriesTable.each((i, el) => {
            const $row = ctx.$(el);
            const $tds = $row.find('td');

            // Skip header rows or malformed rows
            if ($tds.length < 4 || $row.find('th').length > 0) return;

            const name = $tds.eq(1).text().trim();
            const tableSeatInfo = $tds.eq(2).text().trim();
            const chipsStr = $tds.eq(3).text().trim();

            // Only add players who have a table/seat listed AND a chip count (implies they are still in)
            if (chipsStr && tableSeatInfo.includes('Table')) {
                const tableSeatMatch = tableSeatInfo.match(/Table(\d+)\s*\/\s*(\d+)/);

                if (name && tableSeatMatch) {
                    const stack = parseInt(chipsStr.replace(/,/g, ''), 10);

                    seating.push({
                        name: name,
                        table: parseInt(tableSeatMatch[1], 10),
                        seat: parseInt(tableSeatMatch[2], 10),
                        playerStack: !isNaN(stack) ? stack : null
                    });
                }
            }
        });

        if (seating.length > 0) {
            ctx.add('seating', seating);
        }
        // playersRemaining will be calculated in getLiveData now based on seating count
    },

    getEntries(ctx) {
        const entries = [];
        // First, try the standard 'Entries' table, which is common for live games.
        let entriesTable = ctx.$('h4.cw-text-center:contains("Entries")').next('table').find('tbody tr');
        
        if (entriesTable.length > 0) {
            entriesTable.each((i, el) => {
                const $row = ctx.$(el);
                // Skip any header rows that might be in the tbody
                if ($row.find('th').length > 0) return; 

                // In the 'Entries' table, the player name is in the second cell.
                const name = $row.find('td').eq(1).text().trim();
                if (name) {
                    entries.push({ name: name });
                }
            });
        }

        // If no entries were found, it's likely a finished game. Try the 'Result' table.
        if (entries.length === 0) {
            const resultTable = ctx.$('h4.cw-text-center:contains("Result")').next('table').find('tbody tr');
            if (resultTable.length > 0) {
                console.log("[DEBUG-ENTRIES] 'Entries' table not found, parsing player list from 'Result' table.");
                resultTable.each((i, el) => {
                    const $row = ctx.$(el);
                    if ($row.find('th').length > 0) return; // Skip header rows

                    // In the 'Result' table, the name is in the third cell.
                    const name = $row.find('td').eq(2).text().trim();
                    if (name) {
                        entries.push({ name: name });
                    }
                });
            }
        }

        if (entries.length > 0) {
            ctx.add('entries', entries);
            console.log(`[DEBUG-ENTRIES] Found ${entries.length} total player entries.`);
        }
    },

    getLiveData(ctx) {
        // Get the status added by the getStatus function earlier
        const currentStatus = ctx.data.gameStatus;

        // Skip if the game is already finished
        if (currentStatus === 'FINISHED' || currentStatus === 'CANCELLED') {
            console.log(`[DEBUG-LIVE] Skipping live data scrape, game status is ${currentStatus}.`);
            return;
        }

        console.log(`[DEBUG-LIVE] Scraping live data, game status is ${currentStatus}.`);

        // 1. Players Remaining (derived from seating data)
        const playersRemaining = ctx.data.seating ? ctx.data.seating.length : 0;
        ctx.add('playersRemaining', playersRemaining);
        console.log(`[DEBUG-LIVE] -> Players Remaining: ${playersRemaining}`);

        // 2. Total Chips in Play
        const totalChips = ctx.parseNumeric('totalChipsInPlay', '#cw_clock_entire_stack');
        console.log(`[DEBUG-LIVE] -> Total Chips: ${totalChips !== undefined ? totalChips : 'Not Found'}`);

        // 3. Average Player Stack
        const avgStack = ctx.parseNumeric('averagePlayerStack', '#cw_clock_avg_stack');
        console.log(`[DEBUG-LIVE] -> Average Stack: ${avgStack !== undefined ? avgStack : 'Not Found'}`);
    },

    getResults(ctx) {
        const results = [];
        const resultTable = ctx.$('h4.cw-text-center:contains("Result")').next('table').find('tbody tr');

        if (resultTable.length > 0) {
            console.log("[DEBUG-RESULTS] Found 'Result' table, parsing as a finished game.");
            resultTable.each((i, el) => {
                const $row = ctx.$(el);
                const rank = parseInt($row.find('td').eq(0).text().trim(), 10);
                const name = $row.find('td').eq(2).text().trim();
                
                const winningsCellHtml = $row.find('td').eq(3).html();
                
                let winnings = 0;
                let points = 0;
                let isQualification = false;

                // ✅ UPDATED: Check for "QUALIFIED" text before parsing numbers
                if (winningsCellHtml && winningsCellHtml.toUpperCase().includes('QUALIFIED')) {
                    isQualification = true;
                    winnings = 0; // Qualification has no immediate cash value
                    points = 0; // Or parse points if they are still present
                } else {
                    let winningsStr = '';
                    let pointsStr = '';
                    if (winningsCellHtml && winningsCellHtml.includes('<br>')) {
                        const parts = winningsCellHtml.split('<br>');
                        winningsStr = parts[0] ? parts[0].trim() : '';
                        pointsStr = parts[1] ? parts[1].trim() : '';
                    } else {
                        winningsStr = winningsCellHtml ? winningsCellHtml.trim() : '';
                    }
                    winnings = winningsStr ? parseInt(winningsStr.replace(/[^0-9.-]+/g, ''), 10) : 0;
                    points = pointsStr ? parseInt(pointsStr.replace(/[^0-9.-]+/g, ''), 10) : 0;
                }

                if (name && !isNaN(rank)) {
                    results.push({
                        rank,
                        name,
                        winnings: isNaN(winnings) ? 0 : winnings,
                        points: isNaN(points) ? 0 : points,
                        isQualification: isQualification, // ✅ ADDED: Flag for qualifications
                    });
                }
            });
        } else {
            console.log("[DEBUG-RESULTS] No 'Result' table found. Could not parse results.");
        }

        if (results.length > 0) {
            ctx.add('results', results);
            console.log(`[DEBUG-RESULTS] Found ${results.length} results entries.`);
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

        const cleanedScrapedName = cleanupNameForMatching(ctx.data.name);

        // 1. Create a flattened list of all possible names (primary + aliases) to match against.
        const allNamesToMatch = venues.flatMap(venue => {
            const names = [venue.name, ...(venue.aliases || [])];
            return names.map(name => ({
                venueId: venue.id,
                venueName: venue.name, // Keep the original primary name for display
                matchName: cleanupNameForMatching(name)
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

            if (autoAssignedVenue) {
                ctx.add('venueName', autoAssignedVenue.name);
                console.log(`[DEBUG-MATCHING] Added 'venueName: ${autoAssignedVenue.name}' to data.`);
            }
        }

        // 6. Construct the final result object.
        const venueMatch = {
            autoAssignedVenue,
            suggestions: sortedSuggestions
        };
        
        console.log('[DEBUG-MATCHING] Final match result:', JSON.stringify(venueMatch, null, 2));
        ctx.add('venueMatch', venueMatch);
    },

    getTournamentFlags(ctx) {
        const name = ctx.data.name || '';
        const satelliteKeywords = ['satellite', 'satty'];
        const satelliteRegex = new RegExp(`\\b(${satelliteKeywords.join('|')})\\b`, 'i');

        if (satelliteRegex.test(name)) {
            ctx.add('isSatellite', true);
        } else {
            ctx.add('isSatellite', false);
        }
    },

    /**
     * ✅ NEW: Determines the game's frequency (Weekly, Monthly, etc.) from its name.
     */
    getGameFrequency(ctx) {
        const name = (ctx.data.name || '').toUpperCase();
        
        const weekdays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
        const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER', 'JAN', 'FEB', 'MAR', 'APR', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const quarterly = ['QUARTERLY', 'QTR', 'Q1', 'Q2', 'Q3', 'Q4'];
        const yearly = ['YEARLY'];

        if (weekdays.some(day => name.includes(day))) {
            ctx.add('gameFrequency', 'WEEKLY');
        } else if (months.some(month => name.includes(month))) {
            ctx.add('gameFrequency', 'MONTHLY');
        } else if (quarterly.some(term => name.includes(term))) {
            ctx.add('gameFrequency', 'QUARTERLY');
        } else if (yearly.some(term => name.includes(term))) {
            ctx.add('gameFrequency', 'YEARLY');
        } else {
            ctx.add('gameFrequency', 'UNKNOWN');
        }
    },

};

/**
 * ===================================================================
 * STRATEGY MAP & RUNNER
 * ===================================================================
 */
const strategyMap = {
     "STATUS: FINISHED | REG: CLOSED": defaultStrategy,
     "STATUS: RUNNING | REG: CLOSED": defaultStrategy,
     "STATUS: SCHEDULED | REG: OPEN": defaultStrategy,
};

const runScraper = (html, structureLabel, venues = [], seriesTitles = []) => {
    const ctx = new ScrapeContext(html);
    const strategy = defaultStrategy;
    console.log(`[Scraper] Using unified robust strategy.`);

    // Define the order, ensuring status is scraped before getLiveData
    const executionOrder = [
        'getName',
        'getTournamentFlags', // Depends on name
        'getGameFrequency',   // Depends on name
        'getStatus', // Run this first to determine game status
        'getGameTags',
        'getTournamentType',
        'getGameStartDateTime',
        'getRegistrationStatus',
        'getGameVariant',
        'getPrizepool',
        'getTotalEntries', // Scrape base numbers
        'getTotalRebuys',
        'getTotalAddons',
        'getBuyIn',
        'getRake',
        'getStartingStack',
        'getGuarantee',
        'calculateRevenueByBuyIns', // Calculate derived financials
        'calculateGuaranteeMetrics',
        'calculateTotalRake',
        'calculateProfitLoss',
        'getSeriesName',
        'getTotalDuration',
        'getEntries', // Scrape seating structure
        'getSeating', // Scrape seating structure
        'getResults', // Scrape results (if any)
        'getTables',  // Scrape table layout
        'getLevels',
        'getBreaks',
        'getMatchingVenue',
        'getLiveData', // Scrape live data *after* status and seating
    ];

    // Execute functions in defined order
    executionOrder.forEach(key => {
        if (typeof strategy[key] === 'function') {
             try {
                // ✅ UPDATED: Pass the seriesTitles list to the getName function.
                if (key === 'getName') {
                    strategy[key](ctx, seriesTitles);
                } else if (key === 'getMatchingVenue') {
                    strategy[key](ctx, venues);
                } else {
                    strategy[key](ctx);
                }
            } catch (e) {
                console.error(`[Scraper] Error running strategy function "${key}":`, e.message);
            }
        } else {
             console.warn(`[Scraper] Strategy function "${key}" not found in defaultStrategy.`);
        }
    });

    // Add raw HTML at the end
    ctx.add('rawHtml', html);
    return { data: ctx.data, foundKeys: Array.from(ctx.foundKeys) };
};

module.exports = {
    runScraper,
    getStatusAndReg: (html) => {
        const ctx = new ScrapeContext(html);
        // Call the updated getStatus function which adds 'gameStatus' to ctx.data
        defaultStrategy.getStatus(ctx);
        const registrationStatus = defaultStrategy.getRegistrationStatus(ctx);
        // Return the gameStatus from the context
        return { gameStatus: ctx.data.gameStatus, registrationStatus };
    }
};