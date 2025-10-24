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
        // This is the selector we know is failing, but we keep it here
        // as the default. A new strategy can override this.
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
        const currentStatus = ctx.data.status; // Get status from the context

        // ✅ DEBUG LOG 1: See initial values
        console.log(`[DEBUG-getTotalEntries] Raw text found: "${text}" | Status at runtime: "${currentStatus}"`);

        if (!text) {
            console.log('[DEBUG-getTotalEntries] No text found for selector. Exiting function.');
            return;
        }

        // Check for "RUNNING" game logic
        if (currentStatus === 'RUNNING' && text.includes('/')) {
            // ✅ DEBUG LOG 2: Confirming which logic path is taken
            console.log('[DEBUG-getTotalEntries] Condition MET. Entering RUNNING game parsing logic.');

            const parts = text.split('/').map(part => parseInt(part.trim(), 10));
            
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
                const playersRemaining = parts[0];
                const totalEntries = parts[1];
                
                // ✅ DEBUG LOG 3: Show the final parsed values
                console.log(`[DEBUG-getTotalEntries] Successfully parsed -> playersRemaining: ${playersRemaining}, totalEntries: ${totalEntries}`);
                
                ctx.add('playersRemaining', playersRemaining);
                ctx.add('totalEntries', totalEntries);
            } else {
                 console.error('[DEBUG-getTotalEntries] ERROR: Failed to parse parts into numbers.', parts);
            }

        } else {
            // ✅ DEBUG LOG 4: Confirming the fallback path is taken
            console.log('[DEBUG-getTotalEntries] Condition NOT MET. Using fallback parsing logic.');
            const num = parseInt(text.replace(/[^0-9.-]+/g, ''), 10);

            if (!isNaN(num)) {
                ctx.add('totalEntries', num);
                console.log(`[DEBUG-getTotalEntries] Fallback parsed -> totalEntries: ${num}`);
            } else {
                console.error(`[DEBUG-getTotalEntries] ERROR: Fallback failed to parse "${text}" into a number.`);
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
    
    getLevels(ctx) {
        const levelsScriptRegex = /const cw_tt_levels = (\[.*?\]);/s;
        const match = ctx.$.html().match(levelsScriptRegex);
        let levels = [];
        if (match && match[1]) {
            try {
                levels = JSON.parse(match[1]).map(level => ({
                    levelNumber: level.ID || 0,
                    durationMinutes: level.duration || 0,
                    smallBlind: level.smallblind || 0,
                    bigBlind: level.bigblind || 0,
                    ante: level.ante || 0,
                }));
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
 * Maps a structureLabel to a specific strategy object.
 * We can add new strategies here for different structures.
 *
 * EXAMPLE: If 'gameStartDateTime' had a different selector for RUNNING games:
 *
 * const runningStrategy = {
 * ...defaultStrategy, // Inherit all default functions
 * getGameStartDateTime(ctx) {
 * // Override with the new selector
 * ctx.getText('gameStartDateTime', '.new-running-game-start-time-selector');
 * }
 * };
 */
 
 // For now, we only have the default strategy.
const strategyMap = {
     "STATUS: COMPLETED | REG: CLOSED": defaultStrategy,
     "STATUS: RUNNING | REG: CLOSED": defaultStrategy,
     "STATUS: SCHEDULED | REG: OPEN": defaultStrategy,
};


/**
 * Runs the scraper using the appropriate strategy.
 * @param {string} html The raw HTML content.
 * @param {string | null} structureLabel The structure label (e.g., "STATUS: RUNNING | REG: CLOSED").
 * If null, runs the default strategy.
 */
const runScraper = (html, structureLabel) => {
    const ctx = new ScrapeContext(html);

    // 1. Determine which strategy to use
    let strategy = defaultStrategy;
    if (structureLabel && strategyMap[structureLabel]) {
        console.log(`[Scraper] Using strategy for: ${structureLabel}`);
        strategy = strategyMap[structureLabel];
    } else {
        console.log(`[Scraper] Using DEFAULT strategy.`);
    }
    
    // 2. Run all functions from the chosen strategy
    // This ensures all data fields are attempted
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

    // 3. Post-processing (Calculated fields)
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
    
    // 4. Add raw HTML
    ctx.add('rawHtml', html);
    
    console.log('[DEBUG-SCRAPER] Final set of found keys:', ctx.foundKeys);
    
    // 5. Return the populated data and keys
    return { data: ctx.data, foundKeys: Array.from(ctx.foundKeys) };
};

// Export the main runScraper function and helpers for the main index.js
module.exports = {
    runScraper,
    getStatusAndReg: (html) => {
        const ctx = new ScrapeContext(html);
        const status = defaultStrategy.getStatus(ctx);
        const registrationStatus = defaultStrategy.getRegistrationStatus(ctx);
        return { status, registrationStatus };
    }
};
