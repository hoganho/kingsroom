// scraperStrategies.js

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

const cleanupNameForMatching = (name, context, options = {}) => {
    if (!name) return '';
    let cleanedName = ` ${name.replace(/[^a-zA-Z0-9\s]/g, '')} `;
    const jargonRegexes = [
        /\b(Event|Flight|Day)\s+[a-zA-Z0-9]*\d[a-zA-Z0-9]*\b/gi,
        /\bMain Event\b/gi,
        /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi,
    ];
    jargonRegexes.forEach(regex => {
        cleanedName = cleanedName.replace(regex, ' ');
    });
    if (context === 'venue') {
        (options.seriesTitles || []).forEach(series => {
            [series.title, ...(series.aliases || [])].forEach(seriesName => {
                const cleanedSeriesName = seriesName.replace(/[^a-zA-Z0-9\s]/g, '');
                const seriesRegex = new RegExp(`\\b${cleanedSeriesName}\\b`, 'gi');
                cleanedName = cleanedName.replace(seriesRegex, ' ');
            });
        });
    } else if (context === 'series') {
        (options.venues || []).forEach(venue => {
            [venue.name, ...(venue.aliases || [])].forEach(venueName => {
                const cleanedVenueName = venueName.replace(/[^a-zA-Z0-9\s]/g, '');
                const venueRegex = new RegExp(`\\b${cleanedVenueName}\\b`, 'gi');
                cleanedName = cleanedName.replace(venueRegex, ' ');
            });
        });
    }
    return cleanedName.replace(/\s+/g, ' ').trim();
};

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

const defaultStrategy = {
    /**
     * ✅ NEW: Sets the default values for key flags at the beginning of the scrape.
     * This ensures these fields are always present in the final data object.
     */
    initializeDefaultFlags(ctx) {
        ctx.add('isSeries', false);
        ctx.add('seriesName', null); // Use null for "no value"
        ctx.add('isSatellite', false);
        ctx.add('isRegular', true);
    },

    /**
     * ✅ REFACTORED: Now relies on initializeDefaultFlags for defaults.
     * This function now only *overrides* the default values if a series is detected.
     */
    getName(ctx, seriesTitles = [], venues = []) {
        const mainTitle = ctx.$('.cw-game-title').first().text().trim();
        const subTitle = ctx.$('.cw-game-shortdesc').first().text().trim();
        const gameName = [mainTitle, subTitle].filter(Boolean).join(' ');
        
        if (!gameName || gameName === '') {
            if (ctx.data.gameStatus === 'UNKNOWN_STATUS' || ctx.data.isInactive) {
                ctx.add('name', 'Tournament ID Not In Use'); 
                ctx.add('isInactive', true); 
                return;
            } else {
                ctx.add('name', 'Unnamed Tournament');
                return;
            }
        }
        
        ctx.add('name', gameName);

        if (!seriesTitles || seriesTitles.length === 0) {
            return; // No series to check against, defaults will remain.
        }

        // START: STEP 1 - Exact Substring Match
        let exactMatchFound = null;
        const upperCaseGameName = gameName.toUpperCase();

        for (const series of seriesTitles) {
            const allSeriesNames = [series.title, ...(series.aliases || [])];
            for (const seriesName of allSeriesNames) {
                if (upperCaseGameName.includes(seriesName.toUpperCase())) {
                    exactMatchFound = series;
                    break;
                }
            }
            if (exactMatchFound) break;
        }

        if (exactMatchFound) {
            console.log(`[DEBUG-SERIES-MATCH] Found exact substring match: "${exactMatchFound.title}"`);
            ctx.add('seriesName', exactMatchFound.title);
            ctx.add('isSeries', true);
            ctx.add('isRegular', false); // Override default
            return; 
        }

        // STEP 2 - Fallback to Fuzzy Matching
        console.log('[DEBUG-SERIES-MATCH] No exact match found. Falling back to fuzzy matching.');
        const cleanedGameNameForSeriesMatch = cleanupNameForMatching(gameName, 'series', { venues });
        
        const allSeriesNamesToMatch = seriesTitles.flatMap(series => {
            const names = [series.title, ...(series.aliases || [])];
            return names.map(name => ({
                seriesTitle: series.title,
                matchName: name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
            }));
        });

        const { bestMatch } = stringSimilarity.findBestMatch(
            cleanedGameNameForSeriesMatch,
            allSeriesNamesToMatch.map(s => s.matchName)
        );

        if (bestMatch && bestMatch.rating >= SERIES_MATCH_THRESHOLD) {
            console.log(`[DEBUG-SERIES-MATCH] High confidence fuzzy match found: "${bestMatch.target}" with rating ${bestMatch.rating}`);
            const matchedSeries = allSeriesNamesToMatch.find(s => s.matchName === bestMatch.target);
            
            if (matchedSeries) {
                ctx.add('seriesName', matchedSeries.seriesTitle);
                ctx.add('isSeries', true);
                ctx.add('isRegular', false); // Override default
            }
        } else if (bestMatch) {
             console.log(`[DEBUG-SERIES-MATCH] Low confidence fuzzy match, ignoring: "${bestMatch.target}" with rating ${bestMatch.rating}`);
        }
        // ✅ REMOVED: No need for a final 'else' block, as defaults are already set.
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
        const tags = ctx.data.gameTags || [];
        let tournamentType = 'FREEZEOUT'; 
        const rebuyKeywords = ['rebuy', 're-buy', 'reentry', 're-entry'];
        const satelliteKeywords = ['sat', 'satellite', 'satty'];
        const rebuyRegex = new RegExp(rebuyKeywords.join('|'), 'i');
        const satelliteRegex = new RegExp(satelliteKeywords.join('|'), 'i');

        for (const tag of tags) {
            if (rebuyRegex.test(tag)) {
                tournamentType = 'REBUY';
                break; 
            }
            if (satelliteRegex.test(tag)) {
                tournamentType = 'SATELLITE';
                break; 
            }
        }
        ctx.add('tournamentType', tournamentType);
        console.log(`[DEBUG-TYPE] Determined tournament type: ${tournamentType}`);
    },

    getGameStartDateTime(ctx) {
        if (ctx.gameData && ctx.gameData.start_local) {
            ctx.add('gameStartDateTime', new Date(ctx.gameData.start_local).toISOString());
        } else {
            const dateText = ctx.getText('gameStartDateTime', '#cw_clock_start_date_time_local');
            if (dateText) {
                // Ensure the scraped date is in ISO format
                try {
                    const date = new Date(dateText);
                    if (!isNaN(date.getTime())) {
                        ctx.data.gameStartDateTime = date.toISOString();
                    }
                } catch (e) {
                    console.warn('Could not parse gameStartDateTime:', dateText);
                }
            }
        }
    },
    
    getStatus(ctx) {
        const statusElement = ctx.$('label:contains("Status")').first().next('strong');
        let gameStatus = statusElement.text().trim().toUpperCase();
        
        if (!gameStatus || gameStatus === '') {
            gameStatus = 'UNKNOWN_STATUS';
        }
        
        let mappedStatus = gameStatus;

        if (gameStatus.includes('CLOCK STOPPED')) {
            mappedStatus = 'CLOCK_STOPPED';
        } else if (mappedStatus === 'UNKNOWN_STATUS') {
            ctx.add('isInactive', true);
        }
        
        ctx.add('gameStatus', mappedStatus);
        return mappedStatus;
    },
    
    getRegistrationStatus(ctx) {
        const registrationDiv = ctx.$('label:contains("Registration")').parent();
        let registrationStatus = registrationDiv.text().replace(/Registration/gi, '').trim() || 'UNKNOWN_REG_STATUS';
        
        if (registrationStatus.toUpperCase().startsWith('OPEN')) {
            registrationStatus = registrationStatus.replace(/\s*\(.*\)/, '').trim();
            registrationStatus = 'OPEN'; // Force to exact enum value
        }
        
        if (registrationStatus !== 'UNKNOWN_REG_STATUS') {
             ctx.add('registrationStatus', registrationStatus.toUpperCase());
        }
        return registrationStatus.toUpperCase();
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
            const millionMatch = text.match(/\b(\d{1,2})M\b/i);
            const thousandMatch = text.match(/\b(\d{1,3})K\b/i);
            if (millionMatch && millionMatch[1]) {
                guaranteeAmount = parseInt(millionMatch[1], 10) * 1000000;
            } else if (thousandMatch && thousandMatch[1]) {
                guaranteeAmount = parseInt(thousandMatch[1], 10) * 1000;
            } else {
                const num = parseInt(text.replace(/[^0-9.-]+/g, ''), 10);
                if (!isNaN(num)) {
                    guaranteeAmount = num;
                }
            }
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
        console.log('[DEBUG-REVENUE] Calculating Revenue...');
        console.log(`[DEBUG-REVENUE] -> Entries: ${entries}, Rebuys: ${rebuys}, Addons: ${addons}`);
        console.log(`[DEBUG-REVENUE] -> Buy-In: ${buyIn}`);
        if (buyIn <= 0) {
            console.log('[DEBUG-REVENUE] Skipping calculation: Buy-In is zero or missing.');
            return;
        }
        const totalTransactions = entries + rebuys + addons;
        const revenue = totalTransactions * buyIn;
        console.log(`[DEBUG-REVENUE] -> Total Transactions: ${totalTransactions}`);
        console.log(`[DEBUG-REVENUE] -> Calculated Revenue: ${revenue}`);
        ctx.add('revenueByBuyIns', revenue);
    },

    getSeriesName(ctx) {
        ctx.getText('seriesName', '.your-selector-for-series-name');
    },

    calculateGuaranteeMetrics(ctx) {
        if (!ctx.data.hasGuarantee) {
            console.log('[DEBUG-GUARANTEE] Skipping metrics: Game has no guarantee.');
            return; 
        }
        const prizepool = ctx.data.prizepool || 0;
        const guarantee = ctx.data.guaranteeAmount || 0;
        console.log('[DEBUG-GUARANTEE] Calculating metrics...');
        console.log(`[DEBUG-GUARANTEE] -> Prizepool: ${prizepool}, Guarantee: ${guarantee}`);
        if (prizepool <= 0 || guarantee <= 0) {
            console.log('[DEBUG-GUARANTEE] Skipping metrics: Missing prizepool or guarantee amount.');
            return;
        }
        const difference = prizepool - guarantee;
        console.log(`[DEBUG-GUARANTEE] -> Difference (Prizepool - Guarantee): ${difference}`);
        if (difference > 0) {
            ctx.add('guaranteeSurplus', difference);
            ctx.add('guaranteeOverlay', 0);
            console.log(`[DEBUG-GUARANTEE] -> Result: Surplus=${difference}, Overlay=0`);
        } else {
            ctx.add('guaranteeSurplus', 0);
            ctx.add('guaranteeOverlay', Math.abs(difference));
            console.log(`[DEBUG-GUARANTEE] -> Result: Surplus=0, Overlay=${Math.abs(difference)}`);
        }
    },

    calculateTotalRake(ctx) {
        const rake = ctx.data.rake;
        if (rake === undefined || rake === null || rake <= 0) {
            console.log('[DEBUG-RAKE] Skipping total rake calculation: Rake is unknown or zero.');
            return;
        }
        const entries = ctx.data.totalEntries || 0;
        const rebuys = ctx.data.totalRebuys || 0;
        console.log('[DEBUG-RAKE] Calculating total rake...');
        console.log(`[DEBUG-RAKE] -> Rake per transaction: ${rake}, Entries: ${entries}, Rebuys: ${rebuys}`);
        const totalRakedTransactions = entries + rebuys;
        console.log(`[DEBUG-RAKE] -> Total Raked Transactions: ${totalRakedTransactions}`);
        const totalRake = totalRakedTransactions * rake;
        ctx.add('totalRake', totalRake);
        console.log(`[DEBUG-RAKE] -> Final Total Rake: ${totalRake}`);
    },

    calculateProfitLoss(ctx) {
        const revenue = ctx.data.revenueByBuyIns;
        const prizepool = ctx.data.prizepool;
        if (revenue === undefined || revenue === null || prizepool === undefined || prizepool === null) {
            console.log('[DEBUG-PROFIT] Skipping profit/loss calculation: Missing revenue or prizepool data.');
            return;
        }
        console.log('[DEBUG-PROFIT] Calculating profit/loss...');
        console.log(`[DEBUG-PROFIT] -> Revenue By Buy-Ins: ${revenue}`);
        console.log(`[DEBUG-PROFIT] -> Prizepool: ${prizepool}`);
        const profitLoss = revenue - prizepool;
        ctx.add('profitLoss', profitLoss);
        console.log(`[DEBUG-PROFIT] -> Final Profit/Loss: ${profitLoss}`);
    },
    
    getSeating(ctx) {
        const seating = [];
        const entriesTable = ctx.$('h4.cw-text-center:contains("Entries")').next('table').find('tbody tr');
        entriesTable.each((i, el) => {
            const $row = ctx.$(el);
            const $tds = $row.find('td');
            if ($tds.length < 4 || $row.find('th').length > 0) return;
            const name = $tds.eq(1).text().trim();
            const tableSeatInfo = $tds.eq(2).text().trim();
            const chipsStr = $tds.eq(3).text().trim();
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
    },

    getEntries(ctx) {
        const entries = [];
        let entriesTable = ctx.$('h4.cw-text-center:contains("Entries")').next('table').find('tbody tr');
        if (entriesTable.length > 0) {
            entriesTable.each((i, el) => {
                const $row = ctx.$(el);
                if ($row.find('th').length > 0) return; 
                const name = $row.find('td').eq(1).text().trim();
                if (name) {
                    entries.push({ name: name });
                }
            });
        }
        if (entries.length === 0) {
            const resultTable = ctx.$('h4.cw-text-center:contains("Result")').next('table').find('tbody tr');
            if (resultTable.length > 0) {
                console.log("[DEBUG-ENTRIES] 'Entries' table not found, parsing player list from 'Result' table.");
                resultTable.each((i, el) => {
                    const $row = ctx.$(el);
                    if ($row.find('th').length > 0) return;
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
        const currentStatus = ctx.data.gameStatus;
        if (currentStatus === 'FINISHED' || currentStatus === 'CANCELLED') {
            console.log(`[DEBUG-LIVE] Skipping live data scrape, game status is ${currentStatus}.`);
            return;
        }
        console.log(`[DEBUG-LIVE] Scraping live data, game status is ${currentStatus}.`);
        const playersRemaining = ctx.data.seating ? ctx.data.seating.length : 0;
        ctx.add('playersRemaining', playersRemaining);
        console.log(`[DEBUG-LIVE] -> Players Remaining: ${playersRemaining}`);
        const totalChips = ctx.parseNumeric('totalChipsInPlay', '#cw_clock_entire_stack');
        console.log(`[DEBUG-LIVE] -> Total Chips: ${totalChips !== undefined ? totalChips : 'Not Found'}`);
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
                const parsedRank = parseInt($row.find('td').eq(0).text().trim(), 10);
                const name = $row.find('td').eq(2).text().trim();
                const winningsCellHtml = $row.find('td').eq(3).html();
                let winnings = 0;
                let points = 0;
                let isQualification = false;
                if (winningsCellHtml && winningsCellHtml.toUpperCase().includes('QUALIFIED')) {
                    isQualification = true;
                    winnings = 0;
                    points = 0;
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
                    const parsedWinnings = winningsStr ? parseInt(winningsStr.replace(/[^0-9.-]+/g, ''), 10) : NaN;
                    const parsedPoints = pointsStr ? parseInt(pointsStr.replace(/[^0-9.-]+/g, ''), 10) : NaN;
                    winnings = isNaN(parsedWinnings) ? 0 : parsedWinnings;
                    points = isNaN(parsedPoints) ? 0 : parsedPoints;
                }
                let finalRank;
                if (!isNaN(parsedRank)) {
                    finalRank = parsedRank;
                } else {
                    if (isQualification) {
                        finalRank = 1;
                    } else {
                        finalRank = 0;
                    }
                }
                if (name) {
                    results.push({
                        rank: finalRank,
                        name: name,
                        winnings: winnings,
                        points: points,
                        isQualification: isQualification,
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

    getMatchingVenue(ctx, venues, seriesTitles = []) {
        const gameName = ctx.data.name;
        if (!gameName || !venues || venues.length === 0) {
            console.log('[DEBUG-VENUE-MATCH] Skipped: Missing scraped name or venue list.');
            return;
        }
        let exactVenueMatch = null;
        const upperCaseGameName = gameName.toUpperCase();
        for (const venue of venues) {
            const allVenueNames = [venue.name, ...(venue.aliases || [])];
            for (const venueName of allVenueNames) {
                if (upperCaseGameName.includes(venueName.toUpperCase())) {
                    exactVenueMatch = venue;
                    break;
                }
            }
            if (exactVenueMatch) break;
        }
        if (exactVenueMatch) {
            console.log(`[DEBUG-VENUE-MATCH] Found exact substring match: "${exactVenueMatch.name}"`);
            const matchResult = { id: exactVenueMatch.id, name: exactVenueMatch.name, score: 1.0 };
            const venueMatch = { autoAssignedVenue: matchResult, suggestions: [matchResult] };
            ctx.add('venueMatch', venueMatch);
            ctx.add('venueName', exactVenueMatch.name);
            return;
        }
        console.log('[DEBUG-VENUE-MATCH] No exact match found. Falling back to fuzzy matching.');
        const cleanedScrapedName = cleanupNameForMatching(gameName, 'venue', { seriesTitles });
        const allNamesToMatch = venues.flatMap(venue => {
            const names = [venue.name, ...(venue.aliases || [])];
            return names.map(name => ({
                venueId: venue.id,
                venueName: venue.name,
                matchName: name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
            }));
        });
        console.log(`[DEBUG-VENUE-MATCH] Cleaned scraped name for fuzzy venue match: "${cleanedScrapedName}"`);
        const { ratings } = stringSimilarity.findBestMatch(
            cleanedScrapedName,
            allNamesToMatch.map(item => item.matchName)
        );
        const bestScoresByVenue = new Map();
        ratings.forEach((rating, index) => {
            const { venueId, venueName } = allNamesToMatch[index];
            const score = rating.rating;
            if (!bestScoresByVenue.has(venueId) || score > bestScoresByVenue.get(venueId).score) {
                bestScoresByVenue.set(venueId, { id: venueId, name: venueName, score: score });
            }
        });
        const sortedSuggestions = Array.from(bestScoresByVenue.values())
            .sort((a, b) => b.score - a.score)
            .filter(v => v.score > 0)
            .slice(0, 3);
        if (sortedSuggestions.length === 0) {
            ctx.add('venueMatch', { suggestions: [] });
            return;
        }
        let autoAssignedVenue = null;
        if (sortedSuggestions[0].score >= AUTO_ASSIGN_THRESHOLD) {
            autoAssignedVenue = sortedSuggestions[0];
            if (autoAssignedVenue) {
                ctx.add('venueName', autoAssignedVenue.name);
            }
        }
        const venueMatch = { autoAssignedVenue, suggestions: sortedSuggestions };
        ctx.add('venueMatch', venueMatch);
    },

    /**
     * ✅ REFACTORED: Now only overrides the isSatellite flag if keywords are found.
     * The default (false) is set by initializeDefaultFlags.
     */
    getTournamentFlags(ctx) {
        const name = ctx.data.name || '';
        const satelliteKeywords = ['satellite', 'satty'];
        const satelliteRegex = new RegExp(`\\b(${satelliteKeywords.join('|')})\\b`, 'i');

        if (satelliteRegex.test(name)) {
            ctx.add('isSatellite', true); // Override the default
        }
        // ✅ REMOVED: No 'else' block needed, as the default is already false.
    },

    getGameFrequency(ctx) {
        // ... (no changes in this function)
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

const runScraper = (html, structureLabel, venues = [], seriesTitles = []) => {
    const ctx = new ScrapeContext(html);
    const strategy = defaultStrategy;
    console.log(`[Scraper] Using unified robust strategy.`);

    // ✅ UPDATED: Added initializeDefaultFlags as the first step.
    const executionOrder = [
        'initializeDefaultFlags',
        'getName',
        'getTournamentFlags',
        'getGameFrequency',
        'getStatus',
        'getGameTags',
        'getTournamentType',
        'getGameStartDateTime',
        'getRegistrationStatus',
        'getGameVariant',
        'getPrizepool',
        'getTotalEntries',
        'getTotalRebuys',
        'getTotalAddons',
        'getBuyIn',
        'getRake',
        'getStartingStack',
        'getGuarantee',
        'calculateRevenueByBuyIns',
        'calculateGuaranteeMetrics',
        'calculateTotalRake',
        'calculateProfitLoss',
        'getSeriesName',
        'getTotalDuration',
        'getEntries',
        'getSeating',
        'getResults',
        'getTables',
        'getLevels',
        'getBreaks',
        'getMatchingVenue',
        'getLiveData',
    ];

    executionOrder.forEach(key => {
        if (typeof strategy[key] === 'function') {
             try {
                if (key === 'getName') {
                    strategy[key](ctx, seriesTitles, venues);
                } else if (key === 'getMatchingVenue') {
                    strategy[key](ctx, venues, seriesTitles);
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

    ctx.add('rawHtml', html);
    return { data: ctx.data, foundKeys: Array.from(ctx.foundKeys) };
};

module.exports = {
    runScraper,
    getStatusAndReg: (html) => {
        const ctx = new ScrapeContext(html);
        defaultStrategy.getStatus(ctx);
        const registrationStatus = defaultStrategy.getRegistrationStatus(ctx);
        return { gameStatus: ctx.data.gameStatus, registrationStatus };
    }
};