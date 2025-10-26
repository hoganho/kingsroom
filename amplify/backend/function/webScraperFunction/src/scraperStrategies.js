const cheerio = require('cheerio');

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

/**
 * A context class to hold the scraper state ($), data, and foundKeys.
 * This is passed to all strategy functions.
 */
class ScrapeContext {
    constructor(html) {
        this.$ = cheerio.load(html);
        this.data = {};
        this.foundKeys = new Set();
    }

    /**
     * Helper to get text from a selector and add the key if found.
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
     * Helper to parse a number from a selector and add the key if found.
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
     * Helper to add a key/value pair directly.
     */
    add(key, value) {
        if (value !== undefined && value !== null) {
            this.foundKeys.add(key);
            this.data[key] = value;
        }
    }
}

/**
 * ===================================================================
 * DEFAULT STRATEGY
 * ===================================================================
 * This strategy contains the "original" selectors. It is used as a fallback
 * and for finding the initial status to determine the structure label.
 */
const defaultStrategy = {
    getName(ctx) {
        ctx.getText('name', '.cw-game-title');
    },
    
    getGameStartDateTime(ctx) {
        ctx.getText('gameStartDateTime', '#cw_clock_start_date_time_local');
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
        ctx.getText('gameVariant', '#cw_clock_shortlimitgame');
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
                
                ctx.add('playersRemaining', playersRemaining);
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
        ctx.parseNumeric('buyIn', '#cw_clock_buyin');
    },
    
    getStartingStack(ctx) {
        ctx.parseNumeric('startingStack', '#cw_clock_startchips');
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
            
            const str = ctx.$('.cw-game-shortdesc').first().text().trim();
            const num = parseInt(str.replace(/[^0-9.-]+/g, ''), 10);
            if (!isNaN(num)) {
                 ctx.add('guaranteeAmount', num);
            }
        } else {
            ctx.add('hasGuarantee', false);
        }
    },
    
    getSeriesName(ctx) {
        ctx.getText('seriesName', '.your-selector-for-series-name');
    },
    
    getEntries(ctx) {
        const entries = [];
        ctx.$('your-selector-for-entries-list tr').each((i, el) => {
            const name = ctx.$(el).find('td:first-child').text().trim();
            if (name) {
                entries.push({ name });
            }
        });
        if (entries.length > 0) ctx.add('entries', entries);
    },

    getSeating(ctx) {
        const seating = [];
        ctx.$('your-selector-for-seating-chart tr').each((i, el) => {
            const $el = ctx.$(el);
            const name = $el.find('.player-name-selector').text().trim();
            const table = parseInt($el.find('.table-number-selector').text().trim(), 10);
            const seat = parseInt($el.find('.seat-number-selector').text().trim(), 10);
            
            if (name && !isNaN(table) && !isNaN(seat)) {
                seating.push({ name, table, seat });
            }
        });
        if (seating.length > 0) ctx.add('seating', seating);
    },

    // ✅ NEW: Scrape break information
    getBreaks(ctx) {
        const breaks = [];
        const breakScriptRegex = /const cw_tt_breaks = (\[.*?\]);/s;
        const match = ctx.$.html().match(breakScriptRegex);
        if (match && match[1]) {
            try {
                const parsedBreaks = JSON.parse(match[1]);
                parsedBreaks.forEach(breakInfo => {
                    breaks.push({
                        levelNumberBeforeBreak: breakInfo.afterlevel || 0,
                        durationMinutes: breakInfo.duration || 0,
                    });
                });
                if (breaks.length > 0) ctx.add('breaks', breaks);
            } catch (e) {
                console.warn('Could not parse breaks JSON:', e.message);
            }
        }
    },
    
    // ✅ NEW: Scrape live table and stack information
    getTables(ctx) {
        const tables = [];
        // This data is often in complex structures or loaded via JavaScript.
        // You will need to find the correct selector for a container of all tables.
        ctx.$('.table-container-selector').each((i, el) => {
            const $tableEl = ctx.$(el);
            const tableName = $tableEl.find('.table-name-selector').text().trim();
            const seats = [];

            $tableEl.find('.seat-row-selector').each((j, seatEl) => {
                const $seatEl = ctx.$(seatEl);
                const seatNumber = parseInt($seatEl.find('.seat-number-selector').text().trim(), 10);
                const playerName = $seatEl.find('.player-name-selector').text().trim();
                const playerStack = parseInt($seatEl.find('.player-stack-selector').text().replace(/,/g, ''), 10);
                
                seats.push({
                    seat: seatNumber,
                    isOccupied: !!playerName,
                    playerName: playerName || null,
                    playerStack: isNaN(playerStack) ? null : playerStack,
                });
            });

            if(tableName) {
                tables.push({ tableName, seats });
            }
        });
        if (tables.length > 0) ctx.add('tables', tables);
    },

    getLevels(ctx) {
        const levels = [];
        const levelsScriptRegex = /const cw_tt_levels = (\[.*?\]);/s;
        const match = ctx.$.html().match(levelsScriptRegex);
        if (match && match[1]) {
            try {
                const parsedLevels = JSON.parse(match[1]);
                parsedLevels.forEach(level => {
                    levels.push({
                        levelNumber: level.ID || 0,
                        durationMinutes: level.duration || 0,
                        smallBlind: level.smallblind || 0,
                        bigBlind: level.bigblind || 0,
                        ante: level.ante || 0,
                    });
                });
                if (levels.length > 0) ctx.add('levels', levels);
            } catch (e) {
                console.warn('Could not parse blind levels JSON:', e.message);
            }
        }
    },
    
    getResults(ctx) {
        const results = [];
        ctx.$('h4.cw-text-center:contains("Result")').next('table').find('tbody tr').each((i, el) => {
            const $el = ctx.$(el);
            const rank = parseInt($el.find('td').eq(0).text().trim(), 10);
            const name = $el.find('td').eq(2).text().trim();
            const winningsStr = $el.find('td').eq(3).text().trim();
            const winnings = parseInt(winningsStr.replace(/[^0-9.-]+/g, ''), 10) || 0;
            
            results.push({ rank, name, winnings });
        });
        if (results.length > 0) ctx.add('results', results);
    }
};

/**
 * ===================================================================
 * STRATEGY MAP
 * ===================================================================
 */
const strategyMap = {
     "STATUS: COMPLETED | REG: CLOSED": defaultStrategy,
     "STATUS: RUNNING | REG: CLOSED": defaultStrategy,
     "STATUS: SCHEDULED | REG: OPEN": defaultStrategy,
};


/**
 * Runs the scraper using the appropriate strategy.
 */
const runScraper = (html, structureLabel) => {
    const ctx = new ScrapeContext(html);

    let strategy = defaultStrategy;
    if (structureLabel && strategyMap[structureLabel]) {
        console.log(`[Scraper] Using strategy for: ${structureLabel}`);
        strategy = strategyMap[structureLabel];
    } else {
        console.log(`[Scraper] Using DEFAULT strategy.`);
    }
    
    for (const key in defaultStrategy) {
        const func = (strategy[key] || defaultStrategy[key]);
        if (typeof func === 'function') {
            try {
                func(ctx);
            } catch (e) {
                console.error(`[Scraper] Error running strategy function "${key}":`, e.message);
            }
        }
    }

    if (ctx.data.gameStartDateTime && ctx.data.totalDuration) {
        try {
            const startDate = new Date(ctx.data.gameStartDateTime);
            const durationMs = parseDurationToMilliseconds(ctx.data.totalDuration);
            if (!isNaN(startDate.getTime()) && durationMs > 0) {
                const endDate = new Date(startDate.getTime() + durationMs);
                ctx.add('gameEndDateTime', endDate.toISOString());
            }
        } catch (e) {
            console.warn('Could not parse gameStartDateTime or totalDuration:', e.message);
        }
    }
    
    // Post-processing: Use break data to populate breakMinutes in levels array
    if (ctx.data.breaks && ctx.data.levels) {
        ctx.data.breaks.forEach(breakInfo => {
            const levelBeforeBreak = ctx.data.levels.find(
                level => level.levelNumber === breakInfo.levelNumberBeforeBreak
            );
            if (levelBeforeBreak) {
                levelBeforeBreak.breakMinutes = breakInfo.durationMinutes;
            }
        });
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