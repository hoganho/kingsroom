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
 * UPDATED: v2.3.0
 * - REFACTORED: NOT_FOUND handling
 *   - Use NOT_FOUND (not NOT _IN_USE) for empty tournament slots
 *   - NOT_FOUND is a URL/scrape status, NOT a game status
 *   - Games should NEVER be created for NOT_FOUND URLs
 *   - doNotScrape is NEVER set for NOT_FOUND (must always re-check)
 *   - Only NOT_PUBLISHED sets doNotScrape=true
 * - ADDED: scrapeStatus field to distinguish URL status from game status
 * 
 * v2.2.0:
 * - FIXED: gameStatus now uses only valid GraphQL GameStatus enum values
 * - Changed 'ERROR' to 'UNKNOWN' (ERROR not in enum)
 * 
 * v2.1.0:
 * - Removed series matching (now handled by gameDataEnricher)
 * - Fixed getTournamentType() bug (BOUNTY/TURBO not valid enum values)
 * - Added getClassification() for new multi-dimensional taxonomy
 * - Added variant/bettingStructure derivation from gameVariant
 * - Uses entryStructure (not tournamentStructure) to avoid @model conflict
 * - Uses cashRakeType (not rakeStructure) to avoid @model conflict
 * 
 * NOTE: Series detection (isSeries, seriesName, tournamentSeriesId, etc.)
 * is now handled by gameDataEnricher's series-resolver module.
 * The scraper only extracts the raw tournament name.
 * 
 * ===================================================================
 */

const cheerio = require('cheerio');
const { parseAESTToUTC } = require('../utils/dates');

// ===================================================================
// VARIANT MAPPING (GameVariant -> PokerVariant + BettingStructure)
// ===================================================================

const VARIANT_MAPPING = {
    NOT_PUBLISHED: { variant: 'NOT_SPECIFIED', bettingStructure: null },
    NLHE: { variant: 'HOLD_EM', bettingStructure: 'NO_LIMIT' },
    PLO: { variant: 'OMAHA_HI', bettingStructure: 'POT_LIMIT' },
    PLOM: { variant: 'OMAHA_HILO', bettingStructure: 'POT_LIMIT' },
    PL04: { variant: 'OMAHA_HI', bettingStructure: 'POT_LIMIT' },
    PLOM4: { variant: 'OMAHA_HILO', bettingStructure: 'POT_LIMIT' },
    PLO5: { variant: 'OMAHA5_HI', bettingStructure: 'POT_LIMIT' },
    PLOM5: { variant: 'OMAHA5_HILO', bettingStructure: 'POT_LIMIT' },
    PLO6: { variant: 'OMAHA6_HI', bettingStructure: 'POT_LIMIT' },
    PLOM6: { variant: 'OMAHA6_HILO', bettingStructure: 'POT_LIMIT' },
    PLMIXED: { variant: 'MIXED_ROTATION', bettingStructure: 'POT_LIMIT' },
    PLDC: { variant: 'MIXED_DEALERS_CHOICE', bettingStructure: 'POT_LIMIT' },
    NLDC: { variant: 'MIXED_DEALERS_CHOICE', bettingStructure: 'NO_LIMIT' }
};

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

const cwTimestampToISO = (cwTimestamp) => {
    if (!cwTimestamp) return null;
    try {
        const isoStr = cwTimestamp.trim().replace(' ', 'T') + '.000Z';
        const date = new Date(isoStr);
        if (isNaN(date.getTime())) return null;
        return date.toISOString();
    } catch (e) {
        return null;
    }
};

const formatSecondsToHHMMSS = (totalSeconds) => {
    if (!totalSeconds || totalSeconds <= 0) return '00:00:00';
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    return [
        hours.toString().padStart(2, '0'),
        minutes.toString().padStart(2, '0'),
        seconds.toString().padStart(2, '0')
    ].join(':');
};

const parseHHMMSSToSeconds = (hhmmss) => {
    if (!hhmmss) return 0;
    const match = hhmmss.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (!match) return 0;
    return parseInt(match[1], 10) * 3600 + parseInt(match[2], 10) * 60 + parseInt(match[3], 10);
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
     * 
     * UPDATED v2.3.0:
     * - NOT_FOUND = empty tournament slot (URL exists, no tournament)
     *   - This is a URL/scrape status, NOT a game status
     *   - Games should NEVER be created for NOT_FOUND URLs
     *   - doNotScrape = false (ALWAYS re-check on next scrape)
     * 
     * - NOT_PUBLISHED = real tournament that exists but is hidden
     *   - doNotScrape = true (check manually/monthly)
     */
    detectPageState(ctx, forceRefresh = false) {
        const tournamentId = ctx.data.tournamentId || getTournamentIdFromUrl(ctx.url) || 0;
        const warningBadge = ctx.$('.cw-badge.cw-bg-warning').first();
        
        if (warningBadge.length) {
            const warningText = warningBadge.text().trim().toLowerCase();
            console.log(`[HtmlParser] Warning badge: "${warningText}"`);
            
            // Determine if this is NOT_FOUND or NOT_PUBLISHED
            if (warningText.includes('not published')) {
                // NOT_PUBLISHED = Real tournament that exists but is hidden
                // This SHOULD set doNotScrape=true (check manually/monthly)
                ctx.add('tournamentId', tournamentId);
                ctx.add('scrapeStatus', 'NOT_PUBLISHED');  // URL/scrape status
                ctx.add('name', 'Tournament Not Published');
                ctx.add('doNotScrape', true);  // Don't auto-scrape hidden tournaments
                ctx.add('hasGuarantee', false);
                ctx.add('s3Key', '');
                ctx.add('registrationStatus', 'N_A');
                
                console.log(`[HtmlParser] URL Status: NOT_PUBLISHED (doNotScrape=true)`);
                
                if (!forceRefresh) {
                    ctx.abortScrape = true;
                    console.log(`[HtmlParser] Aborting scrape - NOT_PUBLISHED`);
                }
                return;
            }
            
            // All other warnings = empty tournament slot (NOT_FOUND)
            // "not found", "not in use", "not available", etc.
            ctx.add('tournamentId', tournamentId);
            ctx.add('scrapeStatus', 'NOT_FOUND');  // URL/scrape status (NOT game status)
            ctx.add('name', null);  // No name - this isn't a real tournament
            ctx.add('doNotScrape', false);  // NEVER set true - must always re-check!
            ctx.add('hasGuarantee', false);
            ctx.add('s3Key', '');
            ctx.add('registrationStatus', 'N_A');
            
            console.log(`[HtmlParser] URL Status: NOT_FOUND (empty slot, doNotScrape=false)`);
            
            if (!forceRefresh) {
                ctx.abortScrape = true;
                console.log(`[HtmlParser] Aborting scrape - NOT_FOUND (empty slot)`);
            }
            return;
        }
        
        // Check page title/h1 for errors
        const pageTitle = ctx.$('title').text().toLowerCase();
        const h1Text = ctx.$('h1').first().text().toLowerCase();
        
        if (pageTitle.includes('not found') || h1Text.includes('not found')) {
            // Empty tournament slot
            ctx.add('tournamentId', tournamentId);
            ctx.add('scrapeStatus', 'NOT_FOUND');  // URL status
            ctx.add('name', null);
            ctx.add('doNotScrape', false);  // NEVER set true for empty slots!
            ctx.add('hasGuarantee', false);
            ctx.add('registrationStatus', 'N_A');
            
            console.log(`[HtmlParser] URL Status: NOT_FOUND (from page title/h1)`);
            
            if (!forceRefresh) ctx.abortScrape = true;
            return;
        }
        
        if (pageTitle.includes('error') || h1Text.includes('error')) {
            // Actual error - use UNKNOWN for game status
            ctx.add('tournamentId', tournamentId);
            ctx.add('scrapeStatus', 'ERROR');  // URL status
            ctx.add('gameStatus', 'UNKNOWN');  // GraphQL-valid game status
            ctx.add('name', 'Tournament Error');
            ctx.add('doNotScrape', false);  // Errors should be retried
            ctx.add('hasGuarantee', false);
            ctx.add('registrationStatus', 'N_A');
            
            console.log(`[HtmlParser] URL Status: ERROR (doNotScrape=false)`);
            
            if (!forceRefresh) ctx.abortScrape = true;
            return;
        }
        
        if (!ctx.data.tournamentId) {
            ctx.add('tournamentId', tournamentId);
        }
    },

    /**
     * Initialize default flags
     * 
     * NOTE: isSeries and seriesName are no longer set here.
     * Series detection is handled by gameDataEnricher's series-resolver.
     */
    initializeDefaultFlags(ctx) {
        ctx.add('isSatellite', false);
        ctx.add('isRegular', true);
        ctx.add('hasGuarantee', false);
        ctx.add('doNotScrape', false);
    },

    /**
     * Get tournament name
     * 
     * UPDATED: Removed seriesMatchFn parameter.
     * Series detection (isSeries, seriesName, dayNumber, flightLetter, eventNumber, etc.)
     * is now handled by gameDataEnricher's series-resolver module.
     */
    getName(ctx) {
        // Skip if this is a NOT_FOUND URL (no tournament to get name from)
        if (ctx.data.scrapeStatus === 'NOT_FOUND') {
            return;
        }
        
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
        
        // NOTE: Series matching removed - now handled by gameDataEnricher
        // The enricher will use series-resolver to:
        // - Match against TournamentSeriesTitle database
        // - Extract dayNumber, flightLetter, eventNumber from name
        // - Resolve to TournamentSeries instance
        // - Set isSeries, seriesName, tournamentSeriesId, etc.
    },
    
    /**
     * Detect game type (TOURNAMENT vs CASH_GAME)
     * 
     * Scans game name for "CASH GAME" indicator.
     * Must be called AFTER getName() since we need the name.
     * 
     * This sets both:
     * - gameType (legacy field): TOURNAMENT or CASH_GAME
     * - sessionMode (new taxonomy): TOURNAMENT or CASH
     */
    detectGameType(ctx) {
        // Skip for NOT_FOUND URLs
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        
        const name = ctx.data.name || '';
        const gameTags = ctx.data.gameTags || [];
        const allText = [name, ...gameTags].join(' ');
        
        // Check for "CASH GAME" or "CASH-GAME" in the name/tags (case insensitive)
        // Uses word boundary to avoid false positives like "CASHBACK"
        const isCashGame = /\bCASH[\s-]*GAME\b/i.test(allText);
        
        if (isCashGame) {
            ctx.add('gameType', 'CASH_GAME');
            ctx.add('sessionMode', 'CASH');
            console.log(`[HtmlParser] ✅ Detected CASH GAME from: "${name}"`);
            
            // Cash games don't have tournament-specific fields
            ctx.add('isSeries', false);
            ctx.add('isSatellite', false);
            // Note: isRegular for cash games could be handled differently
            // For now, leave it to the enricher to determine based on recurring match
        } else {
            ctx.add('gameType', 'TOURNAMENT');
            ctx.add('sessionMode', 'TOURNAMENT');
        }
    },

    /**
     * Get game tags (badges)
     */
    getGameTags(ctx) {
        // Skip for NOT_FOUND URLs
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        
        const tags = [];
        ctx.$('.cw-game-buyins .cw-badge').each((i, el) => {
            const t = ctx.$(el).text().trim();
            if (t) tags.push(t);
        });
        if (tags.length > 0) ctx.add('gameTags', tags);
    },

    /**
     * Determine tournament type from tags and name
     * 
     * FIXED: Now only returns valid TournamentType enum values:
     * FREEZEOUT, REBUY, SATELLITE, DEEPSTACK
     * 
     * Bounty and speed info are now captured in getClassification()
     */
    getTournamentType(ctx) {
        // Skip for NOT_FOUND URLs
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        
        const tags = ctx.data.gameTags || [];
        const name = ctx.data.name || '';
        const allText = [...tags, name].join(' ');
        
        // Default
        let tournamentType = 'FREEZEOUT';
        
        // Check for satellite first (highest priority for old enum)
        if (/(satellite|satty|\bsat\b)/i.test(allText)) {
            tournamentType = 'SATELLITE';
            ctx.add('isSatellite', true);
        }
        // Check for rebuy/re-entry
        else if (/(rebuy|re-buy|reentry|re-entry)/i.test(allText)) {
            tournamentType = 'REBUY';
        }
        // Check for deepstack
        else if (/(deepstack|deep\s*stack|\bdeep\b)/i.test(allText)) {
            tournamentType = 'DEEPSTACK';
        }
        // Note: BOUNTY and TURBO are NOT valid TournamentType values
        // They are now captured in bountyType and speedType via getClassification()
        
        ctx.add('tournamentType', tournamentType);
    },

    /**
     * Get game start date/time
     */
    getGameStartDateTime(ctx) {
        // Skip for NOT_FOUND URLs
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        
        // Primary source: embedded JSON data
        if (ctx.gameData && ctx.gameData.start_local) {
            const utcIso = parseAESTToUTC(ctx.gameData.start_local);
            if (utcIso) {
                ctx.add('gameStartDateTime', utcIso);
                console.log(`[HtmlParser] Parsed start_local "${ctx.gameData.start_local}" (AEST) → "${utcIso}" (UTC)`);
                return;
            }
        }
        
        // Fallback: DOM element
        const dateText = ctx.$('#cw_clock_start_date_time_local').first().text().trim();
        if (dateText) {
            const utcIso = parseAESTToUTC(dateText);
            if (utcIso) {
                ctx.foundKeys.add('gameStartDateTime');
                ctx.data.gameStartDateTime = utcIso;
                console.log(`[HtmlParser] Parsed DOM date "${dateText}" (AEST) → "${utcIso}" (UTC)`);
                return;
            }
            
            // Last resort fallback
            console.warn(`[HtmlParser] Could not parse AEST date: ${dateText}`);
            try {
                const d = new Date(dateText);
                if (!isNaN(d.getTime())) {
                    ctx.foundKeys.add('gameStartDateTime');
                    ctx.data.gameStartDateTime = d.toISOString();
                    console.warn(`[HtmlParser] FALLBACK: Using JS Date parser - time may be incorrect!`);
                }
            } catch (e) {}
        }
    },
    
    /**
     * Get game status
     */
    getStatus(ctx) {
        // Skip if this is a NOT_FOUND or NOT_PUBLISHED URL
        // These are URL statuses, not game statuses - no Game record to create
        if (ctx.data.scrapeStatus === 'NOT_FOUND' || ctx.data.scrapeStatus === 'NOT_PUBLISHED') {
            return;
        }
        
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
        // Skip for NOT_FOUND URLs
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        
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
        // Skip for NOT_FOUND URLs
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        
        let variant = ctx.gameData?.shortlimitgame || 
            ctx.$('#cw_clock_shortlimitgame').first().text().trim();
        if (variant) {
            ctx.add('gameVariant', variant.replace(/[\s\/]/g, ''));
        }
    },

    /**
     * NEW: Extract multi-dimensional classification fields
     * 
     * UPDATED: Now checks for cash games first and skips tournament-specific
     * classification fields for cash games.
     * 
     * This extracts the new taxonomy fields from scraped data:
     * - variant + bettingStructure (from gameVariant)
     * - sessionMode (from gameType) - NOW PROPERLY DETECTED
     * - bountyType (from name/tags)
     * - speedType (from name/tags)
     * - stackDepth (from name/tags)
     * - entryStructure (from name/tags) - NOTE: not tournamentStructure
     * - tournamentPurpose (from name/tags + isSatellite)
     * - scheduleType (from isSeries/isRegular)
     * 
     * Should be called AFTER detectGameType(), getGameVariant(), getTournamentType(), getName()
     */
    getClassification(ctx) {
        // Skip for NOT_FOUND URLs - no tournament to classify
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        
        const name = ctx.data.name || '';
        const tags = ctx.data.gameTags || [];
        const allText = [...tags, name].join(' ');
        const gameVariant = ctx.data.gameVariant;
        
        // === SESSION MODE ===
        // Respect already-detected values from detectGameType()
        // This should already be set, but fallback just in case
        if (!ctx.data.sessionMode) {
            const gameType = ctx.data.gameType || 'TOURNAMENT';
            ctx.add('sessionMode', gameType === 'CASH_GAME' ? 'CASH' : 'TOURNAMENT');
        }
        
        // === VARIANT + BETTING STRUCTURE (from gameVariant) ===
        // This applies to both cash and tournament games
        if (gameVariant && VARIANT_MAPPING[gameVariant]) {
            const mapping = VARIANT_MAPPING[gameVariant];
            ctx.add('variant', mapping.variant);
            if (mapping.bettingStructure) {
                ctx.add('bettingStructure', mapping.bettingStructure);
            }
        } else if (gameVariant) {
            // Unknown variant - log and set as OTHER
            console.log(`[HtmlParser] Unknown gameVariant: ${gameVariant}`);
            ctx.add('variant', 'OTHER');
        }
        
        // === CASH GAME: Skip tournament-specific classification ===
        if (ctx.data.sessionMode === 'CASH') {
            console.log(`[HtmlParser] Cash game detected - skipping tournament classification fields`);
            
            // Set cash-game appropriate nulls/defaults for tournament fields
            ctx.add('bountyType', null);        // N/A for cash
            ctx.add('speedType', null);         // N/A for cash
            ctx.add('entryStructure', null);    // N/A for cash
            ctx.add('tournamentPurpose', null); // N/A for cash
            ctx.add('stackDepth', null);        // Could be relevant but typically N/A
            ctx.add('scheduleType', null);      // Cash games use different scheduling model
            
            // Cash game specific fields (future expansion)
            // Default to common values - enricher can refine based on RecurringGame template
            if (!ctx.data.cashGameType) {
                ctx.add('cashGameType', 'STANDARD');
            }
            if (!ctx.data.cashRakeType) {
                ctx.add('cashRakeType', 'POT_PERCENTAGE_CAPPED');
            }
            
            ctx.add('classificationSource', 'SCRAPED');
            
            console.log(`[HtmlParser] Cash game classification: variant=${ctx.data.variant}, betting=${ctx.data.bettingStructure}`);
            return;
        }
        
        // === TOURNAMENT: Continue with full classification ===
        
        // === BOUNTY TYPE ===
        if (/MYSTERY\s*BOUNTY/i.test(allText)) {
            ctx.add('bountyType', 'MYSTERY');
        } else if (/PKO|PROGRESSIVE\s*(KO|KNOCKOUT)/i.test(allText)) {
            ctx.add('bountyType', 'PROGRESSIVE');
        } else if (/SUPER\s*(KO|KNOCKOUT)/i.test(allText)) {
            ctx.add('bountyType', 'SUPER_KNOCKOUT');
        } else if (/TOTAL\s*(KO|KNOCKOUT)|TKO/i.test(allText)) {
            ctx.add('bountyType', 'TOTAL_KNOCKOUT');
        } else if (/BOUNTY|KNOCKOUT|\bKO\b/i.test(allText)) {
            ctx.add('bountyType', 'STANDARD');
        } else {
            ctx.add('bountyType', 'NONE');
        }
        
        // === SPEED TYPE ===
        if (/SUPER\s*TURBO|SUPERTURBO/i.test(allText)) {
            ctx.add('speedType', 'SUPER_TURBO');
        } else if (/HYPER\s*TURBO|HYPERTURBO|HYPER/i.test(allText)) {
            ctx.add('speedType', 'HYPER');
        } else if (/TURBO/i.test(allText)) {
            ctx.add('speedType', 'TURBO');
        } else if (/SLOW\s*(STRUCTURE|BLIND)/i.test(allText)) {
            ctx.add('speedType', 'SLOW');
        } else {
            ctx.add('speedType', 'REGULAR');
        }
        
        // === STACK DEPTH ===
        if (/SUPER\s*STACK|SUPERSTACK/i.test(allText)) {
            ctx.add('stackDepth', 'SUPER');
        } else if (/MEGA\s*STACK|MEGASTACK/i.test(allText)) {
            ctx.add('stackDepth', 'MEGA');
        } else if (/DEEP\s*STACK|DEEPSTACK|\bDEEP\b/i.test(allText)) {
            ctx.add('stackDepth', 'DEEP');
        } else if (/SHALLOW|SHORT\s*STACK/i.test(allText)) {
            ctx.add('stackDepth', 'SHALLOW');
        } else {
            ctx.add('stackDepth', 'STANDARD');
        }
        
        // === ENTRY STRUCTURE (renamed from tournamentStructure) ===
        if (/UNLIMITED\s*RE-?ENTRY/i.test(allText)) {
            ctx.add('entryStructure', 'UNLIMITED_RE_ENTRY');
        } else if (/SINGLE\s*RE-?ENTRY/i.test(allText)) {
            ctx.add('entryStructure', 'RE_ENTRY');
        } else if (/RE-?ENTRY/i.test(allText)) {
            ctx.add('entryStructure', 'RE_ENTRY');
        } else if (/REBUY.*ADD-?ON|ADD-?ON.*REBUY/i.test(allText)) {
            ctx.add('entryStructure', 'REBUY_ADDON');
        } else if (/UNLIMITED\s*REBUY/i.test(allText)) {
            ctx.add('entryStructure', 'UNLIMITED_REBUY');
        } else if (/SINGLE\s*REBUY|ONE\s*REBUY|1\s*REBUY/i.test(allText)) {
            ctx.add('entryStructure', 'SINGLE_REBUY');
        } else if (/REBUY|RE-?BUY/i.test(allText)) {
            ctx.add('entryStructure', 'UNLIMITED_REBUY');
        } else if (/ADD-?ON\s*ONLY/i.test(allText)) {
            ctx.add('entryStructure', 'ADD_ON_ONLY');
        } else if (/FREEZE-?OUT/i.test(allText)) {
            ctx.add('entryStructure', 'FREEZEOUT');
        } else {
            // Default based on old tournamentType if available
            const oldType = ctx.data.tournamentType;
            if (oldType === 'REBUY') {
                ctx.add('entryStructure', 'UNLIMITED_REBUY');
            } else {
                ctx.add('entryStructure', 'FREEZEOUT');
            }
        }
        
        // === TOURNAMENT PURPOSE ===
        if (ctx.data.isSatellite || /SATELLITE|SATTY|\bSAT\b/i.test(allText)) {
            if (/MEGA\s*SAT/i.test(allText)) {
                ctx.add('tournamentPurpose', 'MEGA_SATELLITE');
            } else if (/SUPER\s*SAT/i.test(allText)) {
                ctx.add('tournamentPurpose', 'SUPER_SATELLITE');
            } else if (/STEP/i.test(allText)) {
                ctx.add('tournamentPurpose', 'STEP_SATELLITE');
            } else {
                ctx.add('tournamentPurpose', 'SATELLITE');
            }
        } else if (/QUALIFIER|QUALIFYING/i.test(allText)) {
            ctx.add('tournamentPurpose', 'QUALIFIER');
        } else if (/FREEROLL|FREE\s*ROLL/i.test(allText)) {
            ctx.add('tournamentPurpose', 'FREEROLL');
        } else if (/CHARITY/i.test(allText)) {
            ctx.add('tournamentPurpose', 'CHARITY');
        } else if (/LEAGUE|POINTS/i.test(allText)) {
            ctx.add('tournamentPurpose', 'LEAGUE_POINTS');
        } else {
            ctx.add('tournamentPurpose', 'STANDARD');
        }
        
        // === SCHEDULE TYPE ===
        // NOTE: isSeries detection moved to gameDataEnricher
        // Default to RECURRING here; enricher will update to SERIES_EVENT if needed
        if (ctx.data.isRegular) {
            ctx.add('scheduleType', 'RECURRING');
        } else {
            ctx.add('scheduleType', 'ONE_OFF');
        }
        
        // === CLASSIFICATION SOURCE ===
        ctx.add('classificationSource', 'SCRAPED');
        
        // Log classification for debugging
        console.log(`[HtmlParser] Classification: sessionMode=${ctx.data.sessionMode}, variant=${ctx.data.variant}, betting=${ctx.data.bettingStructure}, ` +
            `bounty=${ctx.data.bountyType}, speed=${ctx.data.speedType}, stack=${ctx.data.stackDepth}, ` +
            `entry=${ctx.data.entryStructure}, purpose=${ctx.data.tournamentPurpose}`);
    },

    /**
     * Get prizepool paid
     */
    getPrizepoolPaid(ctx) {
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        ctx.parseNumeric('prizepoolPaid', '#cw_clock_prizepool');
    },
    
    /**
     * Get total unique players
     */
    getTotalUniquePlayers(ctx) {
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        
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

    getTotalRebuys(ctx) { 
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        ctx.parseNumeric('totalRebuys', '#cw_clock_rebuys'); 
    },
    
    getTotalAddons(ctx) { 
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        ctx.parseNumeric('totalAddons', 'div.cw-clock-label:contains("Add-Ons")'); 
    },
    
    getTotalInitialEntries(ctx) { 
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        ctx.add('totalInitialEntries', ctx.data.totalUniquePlayers || 0); 
    },
    
    /**
     * Calculate total entries
     */
    getTotalEntries(ctx) {
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        
        const totalInitialEntries = ctx.data.totalInitialEntries || 0;
        const totalRebuys = ctx.data.totalRebuys || 0;
        const totalAddons = ctx.data.totalAddons || 0;
        ctx.add('totalEntries', totalInitialEntries + totalRebuys + totalAddons);
    },

    getTotalDuration(ctx) { 
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        ctx.getText('totalDuration', 'div.cw-clock-label:contains("Total Time")'); 
    },
    
    /**
     * Get buy-in amount
     */
    getBuyIn(ctx) {
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        
        if (ctx.gameData?.costspb0?.cost) {
            ctx.add('buyIn', ctx.gameData.costspb0.cost + (ctx.gameData.costspb0.fee || 0));
        } else {
            ctx.parseNumeric('buyIn', '#cw_clock_buyin');
        }
    },
    
    getRake(ctx) { 
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        if (ctx.gameData?.costspb0?.fee) ctx.add('rake', ctx.gameData.costspb0.fee); 
    },
    
    /**
     * Get starting stack
     */
    getStartingStack(ctx) {
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        
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
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        
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
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        
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
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        
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
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        
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
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
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
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        
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
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        
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
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
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
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
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
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        const name = ctx.data.name || '';
        if (/(satellite|satty)/i.test(name)) ctx.add('isSatellite', true);
    },

    /**
     * Determine game frequency
     */
    getGameFrequency(ctx) {
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        
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
    
    /**
     * Get total duration (enhanced version with embedded data)
     */
    getTotalDurationEnhanced(ctx) {
        if (ctx.data.scrapeStatus === 'NOT_FOUND') return;
        
        if (ctx.gameData) {
            // Extract duration in seconds
            if (ctx.gameData.ttime !== undefined && ctx.gameData.ttime > 0) {
                ctx.add('totalDuration', ctx.gameData.ttime);
                console.log(`[HtmlParser] Duration: ${ctx.gameData.ttime} seconds`);
            }
            
            // Extract actual start time
            if (ctx.gameData.started_utc) {
                const actualStartIso = cwTimestampToISO(ctx.gameData.started_utc);
                if (actualStartIso) {
                    ctx.add('gameActualStartDateTime', actualStartIso);
                    console.log(`[HtmlParser] Actual start: ${actualStartIso}`);
                }
            }
            
            // Extract end time (direct - preferred over calculation)
            if (ctx.gameData.finished_utc) {
                const finishedIso = cwTimestampToISO(ctx.gameData.finished_utc);
                if (finishedIso) {
                    ctx.add('gameEndDateTime', finishedIso);
                    console.log(`[HtmlParser] End time: ${finishedIso}`);
                }
            }
            
            // Calculate duration if we have timestamps but no ttime
            if (!ctx.data.totalDuration && ctx.data.gameActualStartDateTime && ctx.data.gameEndDateTime) {
                const startMs = new Date(ctx.data.gameActualStartDateTime).getTime();
                const endMs = new Date(ctx.data.gameEndDateTime).getTime();
                if (!isNaN(startMs) && !isNaN(endMs) && endMs > startMs) {
                    ctx.add('totalDuration', Math.floor((endMs - startMs) / 1000));
                }
            }
            return;
        }
        
        // Fallback: Parse from HTML
        try {
            const totalTimeLabel = ctx.$('.cw-clock-label').filter((i, el) => 
                ctx.$(el).text().trim().toLowerCase() === 'total time'
            );
            if (totalTimeLabel.length > 0) {
                const rawValue = totalTimeLabel.siblings('.cw-clock-value-side').text().trim();
                if (/^\d{1,2}:\d{2}:\d{2}$/.test(rawValue)) {
                    ctx.add('totalDuration', parseHHMMSSToSeconds(rawValue));
                }
            }
        } catch (err) {
            console.warn('[HtmlParser] Error parsing Total Time:', err.message);
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
        scrapeStatus: ctx.data.scrapeStatus,    // URL status (NOT_FOUND, NOT_PUBLISHED, ERROR, etc.)
        gameStatus: ctx.data.gameStatus,         // Game status (only for real tournaments)
        registrationStatus: ctx.data.registrationStatus,
        tournamentId: ctx.data.tournamentId
    };
};

module.exports = {
    ScrapeContext,
    defaultStrategy,
    getTournamentIdFromUrl,
    parseDurationToMilliseconds,
    formatSecondsToHHMMSS,
    parseHHMMSSToSeconds,
    getStatusAndReg,
    VARIANT_MAPPING
};