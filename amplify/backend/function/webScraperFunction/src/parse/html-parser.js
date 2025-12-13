/**
 * ===================================================================
 * HTML Parser
 * ===================================================================
 * 
 * Main HTML parsing logic using Cheerio.
 * Extracts tournament data from HTML content.
 * 
 * Extracted from: scraperStrategies.js
 * 
 * ===================================================================
 */

const cheerio = require('cheerio');

/**
 * Parse duration string to milliseconds
 * e.g., "2h 30m" -> 9000000
 */
const parseDurationToMilliseconds = (durationStr) => {
    if (!durationStr) return 0;
    let totalMilliseconds = 0;
    const hourMatch = durationStr.match(/(\d+)\s*h/);
    const minMatch = durationStr.match(/(\d+)\s*m/);
    if (hourMatch && hourMatch[1]) totalMilliseconds += parseInt(hourMatch[1], 10) * 60 * 60 * 1000;
    if (minMatch && minMatch[1]) totalMilliseconds += parseInt(minMatch[1], 10) * 60 * 1000;
    return totalMilliseconds;
};

/**
 * Extract tournament ID from URL
 */
const getTournamentIdFromUrl = (url) => {
    if (!url) return 0;
    try {
        if (url.includes('?id=')) {
            const match = url.match(/[?&]id=(\d+)/);
            if (match && match[1]) return parseInt(match[1], 10);
        } else if (/^\d+$/.test(url)) {
            return parseInt(url, 10);
        }
    } catch (e) {
        console.warn('[HtmlParser] Could not extract tournament ID from URL:', e.message);
    }
    return 0;
};

/**
 * Scrape Context - holds parsing state
 */
class ScrapeContext {
    constructor(html, url = null) {
        this.$ = cheerio.load(html);
        this.url = url;
        this.data = {};
        this.foundKeys = new Set();
        this.gameData = null;      // Embedded cw_tt JSON
        this.levelData = null;     // Embedded cw_tt_levels JSON
        this.abortScrape = false;
        
        if (url) {
            this.data.tournamentId = getTournamentIdFromUrl(url);
        }
        
        this._parseEmbeddedData();
    }
    
    /**
     * Extract embedded JSON data from script tags
     */
    _parseEmbeddedData() {
        const html = this.$.html();
        
        // Extract cw_tt (tournament data)
        try {
            const match = html.match(/const cw_tt = ({.*?});/);
            if (match && match[1]) {
                this.gameData = JSON.parse(match[1]);
            }
        } catch (e) {
            // Embedded data not available
        }
        
        // Extract cw_tt_levels (level structure)
        try {
            const match = html.match(/const cw_tt_levels = (\[.*?\]);/);
            if (match && match[1]) {
                this.levelData = JSON.parse(match[1]);
            }
        } catch (e) {
            // Level data not available
        }
    }
    
    /**
     * Get text from selector and add to data
     */
    getText(key, selector) {
        const text = this.$(selector).first().text().trim();
        if (text) {
            this.foundKeys.add(key);
            this.data[key] = text;
            return text;
        }
        return undefined;
    }
    
    /**
     * Parse numeric value from selector
     */
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
    
    /**
     * Add value to data if not null/undefined
     */
    add(key, value) {
        if (value !== undefined && value !== null) {
            this.foundKeys.add(key);
            this.data[key] = value;
        }
    }
}

/**
 * Default parsing strategy
 */
const defaultStrategy = {
    /**
     * Detect page state (not found, not published, etc.)
     */
    detectPageState(ctx, forceRefresh = false) {
        const tournamentId = ctx.data.tournamentId || getTournamentIdFromUrl(ctx.url) || 0;
        const warningBadge = ctx.$('.cw-badge.cw-bg-warning').first();
        
        if (warningBadge.length) {
            const warningText = warningBadge.text().trim().toLowerCase();
            console.log(`[HtmlParser] Warning badge: "${warningText}"`);
            
            let status = 'UNKNOWN';
            let name = 'Tournament Status Unknown';
            
            if (warningText.includes('not found')) {
                status = 'NOT_FOUND';
                name = 'Tournament Not Found';
            } else if (warningText.includes('not published')) {
                status = 'NOT_PUBLISHED';
                name = 'Tournament Not Published';
            } else if (warningText.includes('not in use') || warningText.includes('not available')) {
                status = 'NOT_IN_USE';
                name = 'Tournament Not In Use';
            }
            
            ctx.add('tournamentId', tournamentId);
            ctx.add('gameStatus', status);
            ctx.add('name', name);
            ctx.add('doNotScrape', true);
            ctx.add('hasGuarantee', false);
            ctx.add('s3Key', '');
            ctx.add('registrationStatus', 'N_A');
            
            if (!forceRefresh) {
                ctx.abortScrape = true;
                console.log(`[HtmlParser] Aborting scrape - ${status}`);
            }
            return;
        }
        
        // Check page title/h1 for errors
        const pageTitle = ctx.$('title').text().toLowerCase();
        const h1Text = ctx.$('h1').first().text().toLowerCase();
        
        if (pageTitle.includes('not found') || h1Text.includes('not found') ||
            pageTitle.includes('error') || h1Text.includes('error')) {
            ctx.add('tournamentId', tournamentId);
            ctx.add('gameStatus', pageTitle.includes('error') ? 'ERROR' : 'NOT_FOUND');
            ctx.add('name', pageTitle.includes('error') ? 'Tournament Error' : 'Tournament Not Found');
            ctx.add('doNotScrape', true);
            ctx.add('hasGuarantee', false);
            ctx.add('registrationStatus', 'N_A');
            
            if (!forceRefresh) ctx.abortScrape = true;
            return;
        }
        
        if (!ctx.data.tournamentId) {
            ctx.add('tournamentId', tournamentId);
        }
    },

    /**
     * Initialize default flags
     */
    initializeDefaultFlags(ctx) {
        ctx.add('isSeries', false);
        ctx.add('seriesName', null);
        ctx.add('isSatellite', false);
        ctx.add('isRegular', true);
        ctx.add('hasGuarantee', false);
        ctx.add('doNotScrape', false);
    },

    /**
     * Get tournament name
     */
    getName(ctx, seriesMatchFn = null, venueMatchFn = null) {
        const mainTitle = ctx.$('.cw-game-title').first().text().trim();
        const subTitle = ctx.$('.cw-game-shortdesc').first().text().trim();
        const gameName = [mainTitle, subTitle].filter(Boolean).join(' ');
        
        if (!gameName || gameName === '') {
            ctx.add('name', ctx.data.gameStatus === 'UNKNOWN_STATUS' || ctx.data.isInactive 
                ? 'Tournament ID Not In Use' 
                : 'Unnamed Tournament');
            if (ctx.data.gameStatus === 'UNKNOWN_STATUS' || ctx.data.isInactive) {
                ctx.add('isInactive', true);
            }
            return;
        }
        
        ctx.add('name', gameName);
        
        // Series matching is handled by caller passing in a match function
        if (seriesMatchFn) {
            const seriesInfo = seriesMatchFn(gameName);
            if (seriesInfo) {
                ctx.add('isSeries', seriesInfo.isSeries);
                ctx.add('seriesName', seriesInfo.seriesName);
                ctx.add('isRegular', !seriesInfo.isSeries);
                
                if (seriesInfo.seriesId) {
                    ctx.add('seriesId', seriesInfo.seriesId);
                    ctx.add('tournamentSeriesId', seriesInfo.seriesId);
                }
                if (seriesInfo.seriesTitleId) {
                    ctx.add('seriesMatch', {
                        seriesTitleId: seriesInfo.seriesTitleId,
                        seriesName: seriesInfo.seriesName,
                        score: 0.85
                    });
                    ctx.add('seriesTitleId', seriesInfo.seriesTitleId);
                }
                if (seriesInfo.dayNumber) ctx.add('dayNumber', seriesInfo.dayNumber);
                if (seriesInfo.flightLetter) ctx.add('flightLetter', seriesInfo.flightLetter);
                if (seriesInfo.isMainEvent) ctx.add('isMainEvent', seriesInfo.isMainEvent);
                if (seriesInfo.eventNumber) ctx.add('eventNumber', seriesInfo.eventNumber);
                if (seriesInfo.finalDay) ctx.add('finalDay', seriesInfo.finalDay);
            }
        }
    },
    
    /**
     * Get game tags (badges)
     */
    getGameTags(ctx) {
        const tags = [];
        ctx.$('.cw-game-buyins .cw-badge').each((i, el) => {
            const t = ctx.$(el).text().trim();
            if (t) tags.push(t);
        });
        if (tags.length > 0) ctx.add('gameTags', tags);
    },

    /**
     * Determine tournament type from tags and name
     */
    getTournamentType(ctx) {
        const tags = ctx.data.gameTags || [];
        const name = ctx.data.name || '';
        const allText = [...tags, name].join(' ');
        
        let tournamentType = 'FREEZEOUT';
        
        if (/(satellite|satty|\bsat\b)/i.test(allText)) {
            tournamentType = 'SATELLITE';
            ctx.add('isSatellite', true);
        } else if (/(rebuy|re-buy|reentry|re-entry)/i.test(allText)) {
            tournamentType = 'REBUY';
        } else if (/(bounty|knockout|ko\b|pko|progressive\s*knockout)/i.test(allText)) {
            tournamentType = 'BOUNTY';
        } else if (/(hyper|turbo)/i.test(allText)) {
            tournamentType = 'TURBO';
        }
        
        ctx.add('tournamentType', tournamentType);
    },

    /**
     * Get game start date/time
     */
    getGameStartDateTime(ctx) {
        if (ctx.gameData && ctx.gameData.start_local) {
            ctx.add('gameStartDateTime', new Date(ctx.gameData.start_local).toISOString());
        } else {
            const dateText = ctx.getText('gameStartDateTime', '#cw_clock_start_date_time_local');
            if (dateText) {
                try {
                    const d = new Date(dateText);
                    if (!isNaN(d.getTime())) {
                        ctx.data.gameStartDateTime = d.toISOString();
                    }
                } catch (e) {}
            }
        }
    },
    
    /**
     * Get game status
     */
    getStatus(ctx) {
        if (ctx.data.gameStatus) return ctx.data.gameStatus;
        
        let gameStatus = ctx.$('label:contains("Status")').first().next('strong').text().trim().toUpperCase() || 'UNKNOWN_STATUS';
        
        if (gameStatus.includes('CLOCK STOPPED')) {
            gameStatus = 'CLOCK_STOPPED';
        } else if (gameStatus === 'UNKNOWN_STATUS') {
            ctx.add('isInactive', true);
        }
        
        ctx.add('gameStatus', gameStatus);
        return gameStatus;
    },
    
    /**
     * Get registration status
     */
    getRegistrationStatus(ctx) {
        if (ctx.data.registrationStatus) return ctx.data.registrationStatus;
        
        let regStatus = ctx.$('label:contains("Registration")').parent().text()
            .replace(/Registration/gi, '').trim() || 'UNKNOWN_REG_STATUS';
        
        if (regStatus.toUpperCase().startsWith('OPEN')) {
            regStatus = 'OPEN';
        }
        
        if (regStatus !== 'UNKNOWN_REG_STATUS') {
            ctx.add('registrationStatus', regStatus.toUpperCase());
        }
        
        return regStatus.toUpperCase();
    },
    
    /**
     * Get game variant (NLHE, PLO, etc.)
     */
    getGameVariant(ctx) {
        let variant = ctx.gameData?.shortlimitgame || 
            ctx.$('#cw_clock_shortlimitgame').first().text().trim();
        if (variant) {
            ctx.add('gameVariant', variant.replace(/\s/g, ''));
        }
    },

    /**
     * Get prizepool paid
     */
    getPrizepoolPaid(ctx) {
        ctx.parseNumeric('prizepoolPaid', '#cw_clock_prizepool');
    },
    
    /**
     * Get total unique players
     */
    getTotalUniquePlayers(ctx) {
        const text = ctx.$('#cw_clock_playersentries').first().text().trim();
        if (!text) return;
        
        let totalUniquePlayers = null;
        
        if (text.includes('/')) {
            // Format: "remaining/total"
            const parts = text.split('/').map(p => parseInt(p.trim(), 10));
            if (parts.length === 2 && !isNaN(parts[1])) {
                totalUniquePlayers = parts[1];
            }
        } else {
            const num = parseInt(text.replace(/[^0-9.-]+/g, ''), 10);
            if (!isNaN(num)) totalUniquePlayers = num;
        }
        
        if (totalUniquePlayers !== null) {
            ctx.add('totalUniquePlayers', totalUniquePlayers);
        }
    },

    getTotalRebuys(ctx) { ctx.parseNumeric('totalRebuys', '#cw_clock_rebuys'); },
    getTotalAddons(ctx) { ctx.parseNumeric('totalAddons', 'div.cw-clock-label:contains("Add-Ons")'); },
    getTotalInitialEntries(ctx) { ctx.add('totalInitialEntries', ctx.data.totalUniquePlayers || 0); },
    
    /**
     * Calculate total entries
     */
    getTotalEntries(ctx) {
        const totalInitialEntries = ctx.data.totalInitialEntries || 0;
        const totalRebuys = ctx.data.totalRebuys || 0;
        const totalAddons = ctx.data.totalAddons || 0;
        ctx.add('totalEntries', totalInitialEntries + totalRebuys + totalAddons);
    },

    getTotalDuration(ctx) { ctx.getText('totalDuration', 'div.cw-clock-label:contains("Total Time")'); },
    
    /**
     * Get buy-in amount
     */
    getBuyIn(ctx) {
        if (ctx.gameData?.costspb0?.cost) {
            ctx.add('buyIn', ctx.gameData.costspb0.cost + (ctx.gameData.costspb0.fee || 0));
        } else {
            ctx.parseNumeric('buyIn', '#cw_clock_buyin');
        }
    },
    
    getRake(ctx) { 
        if (ctx.gameData?.costspb0?.fee) ctx.add('rake', ctx.gameData.costspb0.fee); 
    },
    
    /**
     * Get starting stack
     */
    getStartingStack(ctx) {
        if (ctx.gameData?.costspb0?.chips) {
            ctx.add('startingStack', ctx.gameData.costspb0.chips);
        } else {
            ctx.parseNumeric('startingStack', '#cw_clock_startchips');
        }
    },
    
    /**
     * Detect guarantee and extract amount
     */
    getGuarantee(ctx) {
        const shortDesc = ctx.$('.cw-game-shortdesc').text().trim();
        const mainTitle = ctx.$('.cw-game-title').text().trim();
        const combinedName = ctx.data.name || '';
        
        const textSources = [combinedName, mainTitle, shortDesc].filter(Boolean);
        const allText = textSources.join(' ');
        
        if (!allText) {
            ctx.add('hasGuarantee', false);
            return;
        }
        
        // Guarantee detection patterns
        const guaranteePatterns = [
            /gtd/i,
            /guaranteed/i,
            /g'teed/i,
            /guarantee/i,
            /\$[\d,]+\s*gtd/i,
            /\$[\d,]+\s*guaranteed/i,
        ];
        
        const hasGuaranteeMatch = guaranteePatterns.some(pattern => pattern.test(allText));
        
        if (hasGuaranteeMatch) {
            ctx.add('hasGuarantee', true);
            let guaranteeAmount = null;
            
            // Pattern 1: $X,XXX GTD
            const dollarGtdMatch = allText.match(/\$([\d,]+(?:\.\d{2})?)\s*(?:GTD|Guaranteed|G'teed|Guarantee)/i);
            if (dollarGtdMatch) {
                guaranteeAmount = parseInt(dollarGtdMatch[1].replace(/,/g, ''), 10);
            }
            
            // Pattern 2: $XM (millions)
            if (!guaranteeAmount) {
                const millionDollarMatch = allText.match(/\$(\d+(?:\.\d+)?)\s*M\b/i);
                if (millionDollarMatch) {
                    guaranteeAmount = parseFloat(millionDollarMatch[1]) * 1000000;
                }
            }
            
            // Pattern 3: $XK (thousands)
            if (!guaranteeAmount) {
                const thousandDollarMatch = allText.match(/\$(\d+(?:\.\d+)?)\s*K\b/i);
                if (thousandDollarMatch) {
                    guaranteeAmount = parseFloat(thousandDollarMatch[1]) * 1000;
                }
            }
            
            // Pattern 4: XM GTD (without dollar sign)
            if (!guaranteeAmount) {
                const millionMatch = allText.match(/\b(\d+(?:\.\d+)?)\s*M\s*(?:GTD|Guaranteed)/i);
                if (millionMatch) {
                    guaranteeAmount = parseFloat(millionMatch[1]) * 1000000;
                }
            }
            
            if (!guaranteeAmount) {
                const thousandMatch = allText.match(/\b(\d+(?:\.\d+)?)\s*K\s*(?:GTD|Guaranteed)/i);
                if (thousandMatch) {
                    guaranteeAmount = parseFloat(thousandMatch[1]) * 1000;
                }
            }
            
            // Pattern 5: Any dollar amount (fallback)
            if (!guaranteeAmount) {
                const nearbyDollarMatch = allText.match(/\$([\d,]+)/);
                if (nearbyDollarMatch && /(gtd|guaranteed|g'teed|guarantee)/i.test(allText)) {
                    guaranteeAmount = parseInt(nearbyDollarMatch[1].replace(/,/g, ''), 10);
                }
            }
            
            if (guaranteeAmount !== null && !isNaN(guaranteeAmount) && guaranteeAmount > 0) {
                ctx.add('guaranteeAmount', guaranteeAmount);
                console.log(`[HtmlParser] Guarantee: $${guaranteeAmount.toLocaleString()}`);
            }
        } else {
            ctx.add('hasGuarantee', false);
        }
    },

    /**
     * Calculate poker economics (simplified model)
     */
    calculatePokerEconomics(ctx) {
        const buyIn = ctx.data.buyIn || 0;
        const rake = ctx.data.rake || 0;
        const totalInitialEntries = ctx.data.totalInitialEntries || 0;
        const totalRebuys = ctx.data.totalRebuys || 0;
        const totalAddons = ctx.data.totalAddons || 0;
        const guaranteeAmount = ctx.data.guaranteeAmount || 0;
        const hasGuarantee = ctx.data.hasGuarantee && guaranteeAmount > 0;
        
        if (buyIn <= 0) return;
        
        // Entries that pay rake (initial + rebuys, NOT addons)
        const entriesForRake = totalInitialEntries + totalRebuys;
        const totalEntries = totalInitialEntries + totalRebuys + totalAddons;
        
        // REVENUE
        const rakeRevenue = rake * entriesForRake;
        const totalBuyInsCollected = buyIn * totalEntries;
        
        // PRIZEPOOL
        const prizepoolFromEntriesAndRebuys = (buyIn - rake) * entriesForRake;
        const prizepoolFromAddons = buyIn * totalAddons;
        const prizepoolPlayerContributions = prizepoolFromEntriesAndRebuys + prizepoolFromAddons;
        
        // GUARANTEE IMPACT
        let guaranteeOverlayCost = 0;
        let prizepoolSurplus = null;
        let prizepoolAddedValue = 0;
        
        if (hasGuarantee) {
            const shortfall = guaranteeAmount - prizepoolPlayerContributions;
            if (shortfall > 0) {
                guaranteeOverlayCost = shortfall;
                prizepoolAddedValue = shortfall;
            } else {
                prizepoolSurplus = -shortfall;
            }
        }
        
        // PROFIT
        const gameProfit = rakeRevenue - guaranteeOverlayCost;
        
        // SET VALUES
        ctx.add('totalBuyInsCollected', totalBuyInsCollected);
        ctx.add('rakeRevenue', rakeRevenue);
        ctx.add('prizepoolPlayerContributions', prizepoolPlayerContributions);
        ctx.add('prizepoolCalculated', prizepoolPlayerContributions);
        ctx.add('prizepoolAddedValue', prizepoolAddedValue);
        ctx.add('prizepoolSurplus', prizepoolSurplus);
        ctx.add('guaranteeOverlayCost', guaranteeOverlayCost);
        ctx.add('gameProfit', gameProfit);
    },

    /**
     * Get seating data
     */
    getSeating(ctx) {
        const seating = [];
        ctx.$('h4.cw-text-center:contains("Entries")').next('table').find('tbody tr').each((i, el) => {
            const $row = ctx.$(el);
            const $tds = $row.find('td');
            if ($tds.length < 4 || $row.find('th').length > 0) return;
            
            const name = $tds.eq(1).text().trim();
            const tableSeatInfo = $tds.eq(2).text().trim();
            const chipsStr = $tds.eq(3).text().trim();
            
            if (chipsStr && tableSeatInfo.includes('Table')) {
                const match = tableSeatInfo.match(/Table(\d+)\s*\/\s*(\d+)/);
                if (name && match) {
                    const stack = parseInt(chipsStr.replace(/,/g, ''), 10);
                    seating.push({
                        name,
                        table: parseInt(match[1], 10),
                        seat: parseInt(match[2], 10),
                        playerStack: !isNaN(stack) ? stack : null
                    });
                }
            }
        });
        if (seating.length > 0) ctx.add('seating', seating);
    },

    /**
     * Get entries list
     */
    getEntries(ctx) {
        const entries = [];
        let entriesTable = ctx.$('h4.cw-text-center:contains("Entries")').next('table').find('tbody tr');
        
        if (entriesTable.length > 0) {
            entriesTable.each((i, el) => {
                const $row = ctx.$(el);
                if ($row.find('th').length > 0) return;
                const name = $row.find('td').eq(1).text().trim();
                if (name) entries.push({ name });
            });
        }
        
        // Fallback to results table
        if (entries.length === 0) {
            ctx.$('h4.cw-text-center:contains("Result")').next('table').find('tbody tr').each((i, el) => {
                const $row = ctx.$(el);
                if ($row.find('th').length > 0) return;
                const name = $row.find('td').eq(2).text().trim();
                if (name) entries.push({ name });
            });
        }
        
        if (entries.length > 0) ctx.add('entries', entries);
    },

    /**
     * Get live tournament data
     */
    getLiveData(ctx) {
        if (ctx.data.gameStatus === 'FINISHED' || ctx.data.gameStatus === 'CANCELLED') return;
        
        let playersRemaining = ctx.data.seating?.length || 0;
        
        if (playersRemaining === 0) {
            const entriesText = ctx.$('#cw_clock_playersentries').first().text().trim();
            if (entriesText && entriesText.includes('/')) {
                const remaining = parseInt(entriesText.split('/')[0].trim(), 10);
                if (!isNaN(remaining)) playersRemaining = remaining;
            }
        }
        
        if (playersRemaining === 0 && ctx.gameData?.players_remaining !== undefined) {
            playersRemaining = ctx.gameData.players_remaining;
        }
        
        ctx.add('playersRemaining', playersRemaining);
        ctx.parseNumeric('totalChipsInPlay', '#cw_clock_entire_stack');
        ctx.parseNumeric('averagePlayerStack', '#cw_clock_avg_stack');
    },

    /**
     * Get results/payouts
     */
    getResults(ctx) {
        const results = [];
        ctx.$('h4.cw-text-center:contains("Result")').next('table').find('tbody tr').each((i, el) => {
            const $row = ctx.$(el);
            const parsedRank = parseInt($row.find('td').eq(0).text().trim(), 10);
            const name = $row.find('td').eq(2).text().trim();
            const winningsCellHtml = $row.find('td').eq(3).html();
            
            let winnings = 0;
            let points = 0;
            let isQualification = false;
            
            if (winningsCellHtml?.toUpperCase().includes('QUALIFIED')) {
                isQualification = true;
            } else {
                let winningsStr = '';
                let pointsStr = '';
                
                if (winningsCellHtml?.includes('<br>')) {
                    const parts = winningsCellHtml.split('<br>');
                    winningsStr = parts[0]?.trim() || '';
                    pointsStr = parts[1]?.trim() || '';
                } else {
                    winningsStr = winningsCellHtml?.trim() || '';
                }
                
                const parsedWinnings = winningsStr ? parseInt(winningsStr.replace(/[^0-9.-]+/g, ''), 10) : NaN;
                const parsedPoints = pointsStr ? parseInt(pointsStr.replace(/[^0-9.-]+/g, ''), 10) : NaN;
                winnings = isNaN(parsedWinnings) ? 0 : parsedWinnings;
                points = isNaN(parsedPoints) ? 0 : parsedPoints;
            }
            
            const finalRank = !isNaN(parsedRank) ? parsedRank : (isQualification ? 1 : 0);
            if (name) results.push({ rank: finalRank, name, winnings, points, isQualification });
        });
        
        if (results.length > 0) ctx.add('results', results);
    },

    /**
     * Get tables data
     */
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
                        playerStack: isNaN(playerStack) ? null : playerStack
                    });
                }
            }
        });
        
        if (currentTableName && currentSeats.length > 0) {
            tables.push({ tableName: currentTableName, seats: currentSeats });
        }
        if (tables.length > 0) ctx.add('tables', tables);
    },
    
    /**
     * Get blind levels
     */
    getLevels(ctx) {
        if (!ctx.levelData) return;
        
        const levels = ctx.levelData.map(level => ({
            levelNumber: level.ID || 0,
            durationMinutes: level.duration || 0,
            smallBlind: level.smallblind || 0,
            bigBlind: level.bigblind || 0,
            ante: level.ante || 0
        }));
        
        if (levels.length > 0) ctx.add('levels', levels);
    },

    /**
     * Get scheduled breaks
     */
    getBreaks(ctx) {
        if (!ctx.levelData) return;
        
        const breaks = [];
        for (let i = 0; i < ctx.levelData.length; i++) {
            const currentLevel = ctx.levelData[i];
            if (currentLevel.breakduration > 0) {
                const levelBefore = currentLevel.ID || 0;
                const levelAfter = (i + 1 < ctx.levelData.length) 
                    ? (ctx.levelData[i + 1].ID || 0) 
                    : levelBefore + 1;
                breaks.push({
                    levelNumberBeforeBreak: levelBefore,
                    levelNumberAfterBreak: levelAfter,
                    durationMinutes: currentLevel.breakduration || 0
                });
            }
        }
        
        if (breaks.length > 0) ctx.add('breaks', breaks);
    },

    /**
     * Get tournament flags
     */
    getTournamentFlags(ctx) {
        const name = ctx.data.name || '';
        if (/(satellite|satty)/i.test(name)) ctx.add('isSatellite', true);
    },

    /**
     * Determine game frequency
     */
    getGameFrequency(ctx) {
        const name = (ctx.data.name || '').toUpperCase();
        const weekdays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
        const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER', 'JAN', 'FEB', 'MAR', 'APR', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        
        if (weekdays.some(day => name.includes(day))) {
            ctx.add('gameFrequency', 'WEEKLY');
        } else if (months.some(month => name.includes(month))) {
            ctx.add('gameFrequency', 'MONTHLY');
        } else if (['QUARTERLY', 'QTR', 'Q1', 'Q2', 'Q3', 'Q4'].some(term => name.includes(term))) {
            ctx.add('gameFrequency', 'QUARTERLY');
        } else if (['YEARLY'].some(term => name.includes(term))) {
            ctx.add('gameFrequency', 'YEARLY');
        } else {
            ctx.add('gameFrequency', 'UNKNOWN');
        }
    },
};

/**
 * Quick status and registration extraction (used by other modules)
 */
const getStatusAndReg = (html) => {
    const ctx = new ScrapeContext(html);
    defaultStrategy.detectPageState(ctx, false);
    if (!ctx.abortScrape) {
        defaultStrategy.getStatus(ctx);
        defaultStrategy.getRegistrationStatus(ctx);
    }
    return {
        gameStatus: ctx.data.gameStatus,
        registrationStatus: ctx.data.registrationStatus,
        tournamentId: ctx.data.tournamentId
    };
};

module.exports = {
    ScrapeContext,
    defaultStrategy,
    getTournamentIdFromUrl,
    parseDurationToMilliseconds,
    getStatusAndReg
};
