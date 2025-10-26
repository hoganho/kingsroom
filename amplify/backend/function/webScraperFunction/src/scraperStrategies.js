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
 * A context class to hold the scraper state.
 */
class ScrapeContext {
    constructor(html) {
        this.$ = cheerio.load(html);
        this.data = {};
        this.foundKeys = new Set();
        // ✅ NEW: Properties to hold parsed JSON data from the script tags.
        this.gameData = null;
        this.levelData = null;
        this._parseEmbeddedData();
    }
    
    /**
     * ✅ NEW: A private helper method to find and parse the embedded JSON
     * data from the script tags upon initialization. This is more robust.
     */
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

    /** Helper to get text from a selector and add the key if found. */
    getText(key, selector) {
        const text = this.$(selector).first().text().trim();
        if (text) {
            this.foundKeys.add(key);
            this.data[key] = text;
            return text;
        }
        return undefined;
    }

    /** Helper to parse a number from a selector and add the key if found. */
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

    /** Helper to add a key/value pair directly. */
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
    
    // ✅ MODIFIED: Pulls from the reliable embedded JSON data first.
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
    
    // ✅ MODIFIED: Pulls from embedded JSON data.
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
        // This selector is a placeholder; the provided HTML does not contain Add-Ons.
        ctx.parseNumeric('totalAddons', 'div.cw-clock-label:contains("Add-Ons")');
    },

    getTotalDuration(ctx) {
        // This selector is a placeholder; this info isn't in the running game HTML.
        ctx.getText('totalDuration', 'div.cw-clock-label:contains("Total Time")');
    },
    
    // ✅ MODIFIED: Pulls from embedded JSON data.
    getBuyIn(ctx) {
        if (ctx.gameData && ctx.gameData.costspb0 && ctx.gameData.costspb0.cost) {
            const buyIn = ctx.gameData.costspb0.cost + (ctx.gameData.costspb0.fee || 0);
            ctx.add('buyIn', buyIn);
        } else {
            ctx.parseNumeric('buyIn', '#cw_clock_buyin');
        }
    },
    
    // ✅ NEW: Function to get rake from embedded JSON data.
    getRake(ctx) {
        if (ctx.gameData && ctx.gameData.costspb0 && ctx.gameData.costspb0.fee) {
            ctx.add('rake', ctx.gameData.costspb0.fee);
        }
    },
    
    // ✅ MODIFIED: Pulls from embedded JSON data.
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
            
            const str = ctx.$('.cw-game-shortdesc').first().text().trim();
            const num = parseInt(str.replace(/[^0-9.-]+/g, ''), 10);
            if (!isNaN(num)) {
                 ctx.add('guaranteeAmount', num * 1000); // Handle 'k' for thousand if needed
            }
        } else {
            ctx.add('hasGuarantee', false);
        }
    },
    
    getSeriesName(ctx) {
        // Placeholder, no clear series name in the provided HTML.
        ctx.getText('seriesName', '.your-selector-for-series-name');
    },

    // ✅ MODIFIED: Extracts results from the complex "Entries" table.
    getResults(ctx) {
        const results = [];
        const entriesTable = ctx.$('h4.cw-text-center:contains("Entries")').next('table').find('tbody tr');
        
        entriesTable.each((i, el) => {
            const $el = ctx.$(el);
            const rankText = $el.find('td').eq(2).text().trim(); // Rank is in the 3rd column for eliminated players
            
            // We identify a result row by the presence of "Out" in the rank text
            if (rankText.toLowerCase().includes('out')) {
                const name = $el.find('td').eq(1).text().trim();
                const rank = parseInt(rankText.replace(/\D/g, ''), 10);
                
                // Winnings are not present in this HTML for eliminated players, default to 0
                if (name && !isNaN(rank)) {
                    results.push({ rank, name, winnings: 0 });
                }
            }
        });

        if (results.length > 0) {
            ctx.add('results', results);
        }
    },

    // ✅ NEW: Scrapes live table and stack information.
    getTables(ctx) {
        const tables = [];
        const tablesContainer = ctx.$('h4.cw-text-center:contains("Tables")').next('table').find('tbody');
        let currentTableName = null;
        let currentSeats = [];

        tablesContainer.find('tr.cw-tr').each((i, el) => {
            const $row = ctx.$(el);
            
            // Check if this is a table header row (e.g., "Table4")
            if ($row.find('td[colspan="4"]').length > 0) {
                // If we were processing a previous table, save it first.
                if (currentTableName && currentSeats.length > 0) {
                    tables.push({ tableName: currentTableName, seats: currentSeats });
                }
                // Start a new table
                currentTableName = $row.find('td').text().trim();
                currentSeats = [];
            } else { // This is a player/seat row
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

        // Add the last processed table
        if (currentTableName && currentSeats.length > 0) {
            tables.push({ tableName: currentTableName, seats: currentSeats });
        }

        if (tables.length > 0) {
            ctx.add('tables', tables);
        }
    },
    
    // ✅ NEW: Scrape total chips from the clock display.
    getTotalChipsInPlay(ctx) {
        ctx.parseNumeric('totalChipsInPlay', '#cw_clock_entire_stack');
    },
    
    // ✅ NEW: Scrape average stack from the clock display.
    getAveragePlayerStack(ctx) {
        ctx.parseNumeric('averagePlayerStack', '#cw_clock_avg_stack');
    },

    // ✅ MODIFIED: Uses the parsed `levelData` which is much more reliable.
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

    // ✅ MODIFIED: Creates the breaks array from the `breakduration` property
    // found within the `levelData` object.
    getBreaks(ctx) {
        if (!ctx.levelData) return;
        const breaks = [];
        ctx.levelData.forEach(level => {
            if (level.breakduration > 0) {
                breaks.push({
                    levelNumberBeforeBreak: level.ID || 0,
                    durationMinutes: level.breakduration || 0,
                });
            }
        });
        if (breaks.length > 0) ctx.add('breaks', breaks);
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

const runScraper = (html, structureLabel) => {
    const ctx = new ScrapeContext(html);

    // Use the default strategy for all structures for now, as it's now robust.
    const strategy = defaultStrategy; 
    console.log(`[Scraper] Using unified robust strategy.`);
    
    for (const key in strategy) {
        if (typeof strategy[key] === 'function') {
            try {
                strategy[key](ctx);
            } catch (e) {
                console.error(`[Scraper] Error running strategy function "${key}":`, e.message);
            }
        }
    }

    if (ctx.data.gameStartDateTime && ctx.data.totalDuration) {
        // This logic remains for completed games that have a duration string
    }
    
    // The post-processing logic in index.js will handle merging breaks, so no changes needed here.
    
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