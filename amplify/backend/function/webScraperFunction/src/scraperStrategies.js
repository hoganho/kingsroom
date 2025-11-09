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
                const seriesRegex = new RegExp(`\b${cleanedSeriesName}\b`, 'gi');
                cleanedName = cleanedName.replace(seriesRegex, ' ');
            });
        });
    } else if (context === 'series') {
        (options.venues || []).forEach(venue => {
            [venue.name, ...(venue.aliases || [])].forEach(venueName => {
                const cleanedVenueName = venueName.replace(/[^a-zA-Z0-9\s]/g, '');
                const venueRegex = new RegExp(`\b${cleanedVenueName}\b`, 'gi');
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
        this.abortScrape = false; // Added flag to stop scraping early
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
     * ✅ NEW: Robust page state detection.
     * Uses specific CSS classes (.cw-badge.cw-bg-warning) to identify
     * "Tournament Not Found" and "Tournament Not Published" states precisely.
     */
    detectPageState(ctx) {
        // Look for the specific warning badge used by the platform for errors
        const warningBadge = ctx.$('.cw-badge.cw-bg-warning').first();
        
        if (warningBadge.length > 0) {
            const warningText = warningBadge.text().trim().toLowerCase();
            console.log(`[Scraper] Detected warning badge: "${warningText}"`);

            // Case 1: Tournament Not Found (Req #3, #5)
            // Treat as functionally identical to 'BLANK' for auto-scraper.
            // Do NOT mark as doNotScrape=true, so it can be retried later.
            if (warningText.includes('not found')) {
                 console.log('[Scraper] State detected: Tournament Not Found');
                 ctx.add('gameStatus', 'NOT_FOUND');
                 ctx.add('name', 'Tournament Not Found');
                 ctx.add('doNotScrape', false); // Important: Allow rescraping later
                 ctx.abortScrape = true;
                 return;
            }

            // Case 2: Tournament Not Published (Req #4)
            // Exists but is hidden by publisher.
            // MARK as doNotScrape=true to stop wasting resources on it.
            if (warningText.includes('not published')) {
                 console.log('[Scraper] State detected: Tournament Not Published');
                 ctx.add('gameStatus', 'NOT_PUBLISHED');
                 ctx.add('name', 'Tournament Not Published');
                 ctx.add('doNotScrape', true); // Critical: Prevent future scrapes until manual reset
                 ctx.abortScrape = true;
                 return;
            }
        }
    },

    initializeDefaultFlags(ctx) {
        ctx.add('isSeries', false);
        ctx.add('seriesName', null);
        ctx.add('isSatellite', false);
        ctx.add('isRegular', true);
    },

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
            return; 
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
            ctx.add('isRegular', false); 
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
                ctx.add('isRegular', false); 
            }
        } else if (bestMatch) {
             console.log(`[DEBUG-SERIES-MATCH] Low confidence fuzzy match, ignoring: "${bestMatch.target}" with rating ${bestMatch.rating}`);
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
    },

    getGameStartDateTime(ctx) {
        if (ctx.gameData && ctx.gameData.start_local) {
            ctx.add('gameStartDateTime', new Date(ctx.gameData.start_local).toISOString());
        } else {
            const dateText = ctx.getText('gameStartDateTime', '#cw_clock_start_date_time_local');
            if (dateText) {
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
        // If already set by detectPageState, skip
        if (ctx.data.gameStatus) return ctx.data.gameStatus;

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
            registrationStatus = 'OPEN'; 
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
        if (buyIn <= 0) {
            return;
        }
        const totalTransactions = entries + rebuys + addons;
        const revenue = totalTransactions * buyIn;
        ctx.add('revenueByBuyIns', revenue);
    },

    getSeriesName(ctx) {
        ctx.getText('seriesName', '.your-selector-for-series-name');
    },

    calculateGuaranteeMetrics(ctx) {
        if (!ctx.data.hasGuarantee) {
            return; 
        }
        const prizepool = ctx.data.prizepool || 0;
        const guarantee = ctx.data.guaranteeAmount || 0;
        if (prizepool <= 0 || guarantee <= 0) {
            return;
        }
        const difference = prizepool - guarantee;
        if (difference > 0) {
            ctx.add('guaranteeSurplus', difference);
            ctx.add('guaranteeOverlay', 0);
        } else {
            ctx.add('guaranteeSurplus', 0);
            ctx.add('guaranteeOverlay', Math.abs(difference));
        }
    },

    calculateTotalRake(ctx) {
        const rake = ctx.data.rake;
        if (rake === undefined || rake === null || rake <= 0) {
            return;
        }
        const entries = ctx.data.totalEntries || 0;
        const rebuys = ctx.data.totalRebuys || 0;
        const totalRakedTransactions = entries + rebuys;
        const totalRake = totalRakedTransactions * rake;
        ctx.add('totalRake', totalRake);
    },

    calculateProfitLoss(ctx) {
        const revenue = ctx.data.revenueByBuyIns;
        const prizepool = ctx.data.prizepool;
        if (revenue === undefined || revenue === null || prizepool === undefined || prizepool === null) {
            return;
        }
        const profitLoss = revenue - prizepool;
        ctx.add('profitLoss', profitLoss);
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
        }
    },

    getLiveData(ctx) {
        const currentStatus = ctx.data.gameStatus;
        if (currentStatus === 'FINISHED' || currentStatus === 'CANCELLED') {
            return;
        }
        
        // Enhanced players remaining detection
        let playersRemaining = 0;
        
        // Method 1: Try to get from seating data (players with current seats)
        if (ctx.data.seating && ctx.data.seating.length > 0) {
            playersRemaining = ctx.data.seating.length;
        }
        
        // Method 2: Parse from the playersentries text (format: "remaining/total")
        if (playersRemaining === 0) {
            const selector = '#cw_clock_playersentries';
            const entriesText = ctx.$(selector).first().text().trim();
            
            if (entriesText && entriesText.includes('/')) {
                const parts = entriesText.split('/');
                const remaining = parseInt(parts[0].trim(), 10);
                if (!isNaN(remaining)) {
                    playersRemaining = remaining;
                }
            }
        }
        
        // Method 3: If still 0, check if there's embedded game data
        if (playersRemaining === 0 && ctx.gameData) {
            if (ctx.gameData.players_remaining !== undefined) {
                playersRemaining = ctx.gameData.players_remaining;
            }
        }
        
        ctx.add('playersRemaining', playersRemaining);
        
        ctx.parseNumeric('totalChipsInPlay', '#cw_clock_entire_stack');
        ctx.parseNumeric('averagePlayerStack', '#cw_clock_avg_stack');
    },

    getResults(ctx) {
        const results = [];
        const resultTable = ctx.$('h4.cw-text-center:contains("Result")').next('table').find('tbody tr');
        if (resultTable.length > 0) {
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
        }
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
            // Return null match instead of undefined
            ctx.add('venueMatch', { 
                autoAssignedVenue: null, 
                suggestions: [],
                extractedVenueName: gameName || null,
                matchingFailed: true 
            });
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
            const venueMatch = { 
                autoAssignedVenue: matchResult, 
                suggestions: [matchResult],
                extractedVenueName: gameName,
                matchingFailed: false
            };
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
            ctx.add('venueMatch', { 
                autoAssignedVenue: null,
                suggestions: [],
                extractedVenueName: gameName,
                matchingFailed: true
            });
            return;
        }
        let autoAssignedVenue = null;
        if (sortedSuggestions[0].score >= AUTO_ASSIGN_THRESHOLD) {
            autoAssignedVenue = sortedSuggestions[0];
            if (autoAssignedVenue) {
                ctx.add('venueName', autoAssignedVenue.name);
            }
        }
        const venueMatch = { 
            autoAssignedVenue, 
            suggestions: sortedSuggestions,
            extractedVenueName: gameName,
            matchingFailed: autoAssignedVenue === null
        };
        ctx.add('venueMatch', venueMatch);
    },

    getTournamentFlags(ctx) {
        const name = ctx.data.name || '';
        const satelliteKeywords = ['satellite', 'satty'];
        const satelliteRegex = new RegExp(`\\b(${satelliteKeywords.join('|')})\\b`, 'i');

        if (satelliteRegex.test(name)) {
            ctx.add('isSatellite', true); 
        }
    },

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

    getTournamentId(ctx, url) {
        if (!url) return;
        
        try {
            // Handle both full URLs and just the ID parameter
            if (url.includes('?id=')) {
                const match = url.match(/[?&]id=(\d+)/);
                if (match && match[1]) {
                    ctx.add('tournamentId', match[1]);
                }
            } else if (/^\d+$/.test(url)) {
                // If it's just a number, that's the tournament ID
                ctx.add('tournamentId', url);
            }
        } catch (e) {
            console.warn('Could not extract tournament ID from URL:', e.message);
        }
    },
};

const runScraper = (html, structureLabel, venues = [], seriesTitles = [], url = null) => {
    const ctx = new ScrapeContext(html);
    const strategy = defaultStrategy;
    console.log(`[Scraper] Using unified robust strategy.`);

    // Execution order with detectPageState FIRST
    const executionOrder = [
        'detectPageState', // <-- NEW: Runs first to detect special states
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
        'getTournamentId',
    ];

    for (const key of executionOrder) {
        // If detectPageState set the abort flag, stop processing immediately
        if (ctx.abortScrape) {
            console.log(`[Scraper] Aborting scrape early due to detected page state: ${ctx.data.gameStatus}`);
            break;
        }

        if (typeof strategy[key] === 'function') {
             try {
                if (key === 'getName') {
                    strategy[key](ctx, seriesTitles, venues);
                } else if (key === 'getMatchingVenue') {
                    strategy[key](ctx, venues, seriesTitles);
                } else if (key === 'getTournamentId') {
                    strategy[key](ctx, url);
                } else {                    
                    strategy[key](ctx);
                }
            } catch (e) {
                console.error(`[Scraper] Error running strategy function "${key}":`, e.message);
            }
        } else {
             console.warn(`[Scraper] Strategy function "${key}" not found in defaultStrategy.`);
        }
    }

    ctx.add('rawHtml', html);
    return { data: ctx.data, foundKeys: Array.from(ctx.foundKeys) };
};

module.exports = {
    runScraper,
    getStatusAndReg: (html) => {
        const ctx = new ScrapeContext(html);
        // Check page state first here too for quick status checks
        defaultStrategy.detectPageState(ctx);
        if (!ctx.abortScrape) {
             defaultStrategy.getStatus(ctx);
             defaultStrategy.getRegistrationStatus(ctx);
        }
        return { gameStatus: ctx.data.gameStatus, registrationStatus: ctx.data.registrationStatus };
    }
};