// scraperStrategies.js
// ENHANCED VERSION: Adds database-aware matching while preserving all existing functionality

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

/**
 * Extract tournament ID from URL - centralized function
 */
const getTournamentId = (url) => {
    if (!url) return 1; // Default to 1 if no URL
    
    try {
        // Handle both full URLs and just the ID parameter
        if (url.includes('?id=')) {
            const match = url.match(/[?&]id=(\d+)/);
            if (match && match[1]) {
                return parseInt(match[1], 10);
            }
        } else if (/^\d+$/.test(url)) {
            // If it's just a number, that's the tournament ID
            return parseInt(url, 10);
        }
    } catch (e) {
        console.warn('Could not extract tournament ID from URL:', e.message);
    }
    
    return 1; // Default fallback
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

// ===================================================================
// ENHANCED SERIES MATCHING FUNCTIONS (NEW)
// ===================================================================

/**
 * Extract series details from tournament name
 * @param {string} tournamentName - Tournament name
 * @returns {Object} Series details (day, flight, main event, year)
 */
const extractSeriesDetails = (tournamentName) => {
    const details = {};
    
    // Extract year
    const yearMatch = tournamentName.match(/20\d{2}/);
    if (yearMatch) {
        details.seriesYear = parseInt(yearMatch[0]);
    }
    
    // Check if main event
    details.isMainEvent = /\bmain\s*event\b/i.test(tournamentName);
    
    // Extract day number
    const dayPatterns = [
        /\bDay\s*(\d+)/i,
        /\bD(\d+)\b/,
        /\b(\d+)[A-Z]\b/  // Matches "1A", "2B", etc.
    ];
    
    for (const pattern of dayPatterns) {
        const match = tournamentName.match(pattern);
        if (match) {
            details.dayNumber = parseInt(match[1]);
            break;
        }
    }
    
    // Extract flight letter
    const flightPatterns = [
        /\bFlight\s*([A-Z])/i,
        /\b\d+([A-Z])\b/,  // Matches letter part of "1A", "2B"
        /\b([A-Z])\b(?=\s*(?:Flight|Starting))/i
    ];
    
    for (const pattern of flightPatterns) {
        const match = tournamentName.match(pattern);
        if (match) {
            details.flightLetter = match[1];
            break;
        }
    }
    
    // Handle "Final Day" or "Final Table"
    if (/\bFinal\s*(Day|Table)?\b/i.test(tournamentName)) {
        details.dayNumber = details.dayNumber || 99;  // Use 99 to indicate final
        details.isFinalDay = true;
    }
    
    return details;
};

/**
 * Enhanced series matching that checks database first, then patterns
 * @param {string} gameName - Tournament name
 * @param {Array} seriesTitles - Database series titles
 * @param {Array} venues - Database venues (for cleanup)
 * @returns {Object|null} Series match info
 */
const matchSeriesWithDatabase = (gameName, seriesTitles = [], venues = []) => {
    if (!gameName) return null;
    
    // First, check database series titles
    if (seriesTitles && seriesTitles.length > 0) {
        // Try exact substring match first
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
            console.log(`[Series Match] Database exact match: "${exactMatchFound.title}"`);
            const details = extractSeriesDetails(gameName);
            return {
                isSeries: true,
                seriesName: exactMatchFound.title,
                seriesId: exactMatchFound.id,
                isRegular: false,
                ...details
            };
        }
        
        // Try fuzzy matching
        console.log('[Series Match] No exact match, trying fuzzy matching');
        const cleanedGameName = cleanupNameForMatching(gameName, 'series', { venues });
        
        const allSeriesNamesToMatch = seriesTitles.flatMap(series => {
            const names = [series.title, ...(series.aliases || [])];
            return names.map(name => ({
                seriesId: series.id,
                seriesTitle: series.title,
                matchName: name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
            }));
        });
        
        const { bestMatch } = stringSimilarity.findBestMatch(
            cleanedGameName,
            allSeriesNamesToMatch.map(s => s.matchName)
        );
        
        if (bestMatch && bestMatch.rating >= SERIES_MATCH_THRESHOLD) {
            console.log(`[Series Match] Database fuzzy match: "${bestMatch.target}" (score: ${bestMatch.rating})`);
            const matchedSeries = allSeriesNamesToMatch.find(s => s.matchName === bestMatch.target);
            
            if (matchedSeries) {
                const details = extractSeriesDetails(gameName);
                return {
                    isSeries: true,
                    seriesName: matchedSeries.seriesTitle,
                    seriesId: matchedSeries.seriesId,
                    isRegular: false,
                    ...details
                };
            }
        }
    }
    
    // Fall back to pattern matching
    console.log('[Series Match] No database match, trying patterns');
    const seriesPatterns = [
        /Spring\s+Championship\s+Series/i,
        /Summer\s+Series/i,
        /Fall\s+Series/i,
        /Winter\s+Series/i,
        /Autumn\s+Series/i,
        /Championship\s+Series/i,
        /Festival\s+of\s+Poker/i,
        /Poker\s+Championships?/i,
        /\bWSOP\b/i,
        /\bWPT\b/i,
        /\bEPT\b/i,
        /\bAPT\b/i,
        /\bANZPT\b/i,
        /\bAPPT\b/i,
        /\b(Mini|Mega|Grand)\s+Series/i,
        /Masters\s+Series/i,
        /High\s+Roller\s+Series/i,
        /Super\s+Series/i,
    ];
    
    for (const pattern of seriesPatterns) {
        if (pattern.test(gameName)) {
            // Extract clean series name
            let seriesName = gameName
                .replace(/\s*[-–]\s*Day\s*\d+[A-Z]?/gi, '')
                .replace(/\s*[-–]\s*Flight\s*[A-Z]/gi, '')
                .replace(/\s*\bDay\s*\d+[A-Z]?\b/gi, '')
                .replace(/\s*\bFlight\s*[A-Z]\b/gi, '')
                .replace(/\s*\b\d+[A-Z]\b/g, '')
                .replace(/\s*[-–]\s*Final/gi, '')
                .replace(/\s+/g, ' ')
                .trim();
            
            const match = gameName.match(pattern);
            if (match) {
                seriesName = match[0];
            }
            
            console.log(`[Series Match] Pattern match: "${seriesName}"`);
            const details = extractSeriesDetails(gameName);
            return {
                isSeries: true,
                seriesName: seriesName,
                seriesId: null,
                isRegular: false,
                ...details
            };
        }
    }
    
    return null;
};

// ===================================================================
// ENHANCED VENUE MATCHING (UPDATED)
// ===================================================================

/**
 * Enhanced venue matching that checks database first
 * @param {Object} ctx - Scraping context
 * @param {Array} venues - Database venues
 * @param {Array} seriesTitles - Series titles for cleanup
 * @returns {Object} Venue match result
 */
const getMatchingVenueEnhanced = (gameName, venues = [], seriesTitles = []) => {
    if (!gameName) {
        return { 
            autoAssignedVenue: null, 
            suggestions: [],
            extractedVenueName: null,
            matchingFailed: true 
        };
    }
    
    // First, try database venues
    if (venues && venues.length > 0) {
        // Try exact substring match
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
            console.log(`[Venue Match] Database exact match: "${exactVenueMatch.name}"`);
            const matchResult = { 
                id: exactVenueMatch.id, 
                name: exactVenueMatch.name, 
                score: 1.0 
            };
            return { 
                autoAssignedVenue: matchResult, 
                suggestions: [matchResult],
                extractedVenueName: gameName,
                matchingFailed: false
            };
        }
        
        // Try fuzzy matching with database venues
        console.log('[Venue Match] No exact match, trying fuzzy matching');
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
        
        if (sortedSuggestions.length > 0) {
            let autoAssignedVenue = null;
            if (sortedSuggestions[0].score >= AUTO_ASSIGN_THRESHOLD) {
                autoAssignedVenue = sortedSuggestions[0];
                console.log(`[Venue Match] Database fuzzy match: "${autoAssignedVenue.name}" (score: ${autoAssignedVenue.score})`);
            }
            
            return { 
                autoAssignedVenue, 
                suggestions: sortedSuggestions,
                extractedVenueName: gameName,
                matchingFailed: autoAssignedVenue === null
            };
        }
    }
    
    // Fall back to pattern matching
    console.log('[Venue Match] No database match, trying patterns');
    const venuePatterns = [
        { pattern: /The Star/i, venue: 'The Star' },
        { pattern: /Crown/i, venue: 'Crown' },
        { pattern: /Sky City/i, venue: 'Sky City' },
        { pattern: /Treasury/i, venue: 'Treasury' },
        { pattern: /Reef/i, venue: 'The Reef' },
        { pattern: /Adelaide Casino/i, venue: 'Adelaide Casino' },
        { pattern: /Perth Casino/i, venue: 'Perth Casino' },
        { pattern: /Gold Coast/i, venue: 'Gold Coast Casino' },
        { pattern: /Townsville/i, venue: 'Townsville Casino' },
        { pattern: /Darwin/i, venue: 'Darwin Casino' },
    ];
    
    for (const { pattern, venue } of venuePatterns) {
        if (pattern.test(gameName)) {
            console.log(`[Venue Match] Pattern match: "${venue}"`);
            return {
                autoAssignedVenue: null,
                suggestions: [{
                    id: null,
                    name: venue,
                    score: 0.6
                }],
                extractedVenueName: gameName,
                matchingFailed: true  // Pattern matches don't auto-assign
            };
        }
    }
    
    // No match at all
    return { 
        autoAssignedVenue: null,
        suggestions: [],
        extractedVenueName: gameName,
        matchingFailed: true
    };
};

// ===================================================================
// SCRAPE CONTEXT (UNCHANGED)
// ===================================================================

class ScrapeContext {
    constructor(html, url = null) {
        this.$ = cheerio.load(html);
        this.url = url;
        this.data = {};
        this.foundKeys = new Set();
        this.gameData = null;
        this.levelData = null;
        this.abortScrape = false;
        
        // Initialize with tournament ID from URL
        if (url) {
            this.data.tournamentId = getTournamentId(url);
        }
        
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

// ===================================================================
// DEFAULT STRATEGY (ENHANCED WITH DATABASE MATCHING)
// ===================================================================

const defaultStrategy = {
    /**
     * UNCHANGED: Robust page state detection
     */
    detectPageState(ctx, forceRefresh = false) {
        const tournamentId = ctx.data.tournamentId || getTournamentId(ctx.url) || 1;
        
        // Look for the specific warning badge used by the platform for errors
        const warningBadge = ctx.$('.cw-badge.cw-bg-warning').first();
        
        if (warningBadge.length) {
            const warningText = warningBadge.text().trim().toLowerCase();
            console.log(`[Scraper] Warning badge detected: "${warningText}"`);

            // Case 1: Tournament Not Found
            if (warningText.includes('not found')) {
                console.log('[Scraper] State detected: Tournament Not Found');
                ctx.add('tournamentId', tournamentId);
                ctx.add('gameStatus', 'UNKNOWN');
                ctx.add('name', 'Tournament Not Found');
                ctx.add('doNotScrape', true); // Set to true, as "not found" is usually permanent
                ctx.add('hasGuarantee', false);
                ctx.add('s3Key', '');
                ctx.add('registrationStatus', 'N_A');
                
                if (!forceRefresh) {
                    ctx.abortScrape = true;
                    console.log('[Scraper] Aborting scrape due to UNKNOWN Game status');
                }
                return;
            }

            // Case 2: Tournament Not Published
            if (warningText.includes('not published')) {
                console.log('[Scraper] State detected: Tournament Not Published');
                ctx.add('tournamentId', tournamentId);
                ctx.add('gameStatus', 'NOT_PUBLISHED');
                ctx.add('name', 'Tournament Not Published');
                ctx.add('doNotScrape', true); // Prevent future scrapes
                ctx.add('hasGuarantee', false);
                ctx.add('s3Key', '');
                ctx.add('registrationStatus', 'N_A');
                if (!forceRefresh) {
                    ctx.abortScrape = true;
                    console.log('[Scraper] Aborting scrape due to NOT_PUBLISHED status');
                }
                return;
            }

            // Case 3: Tournament Not In Use
            if (warningText.includes('not in use') || warningText.includes('not available')) {
                console.log('[Scraper] State detected: Tournament Not In Use');
                ctx.add('tournamentId', tournamentId);
                ctx.add('gameStatus', 'NOT_IN_USE');
                ctx.add('name', 'Tournament Not In Use');
                ctx.add('doNotScrape', true);
                ctx.add('hasGuarantee', false);
                ctx.add('s3Key', '');
                ctx.add('registrationStatus', 'N_A');
                if (!forceRefresh) {
                    ctx.abortScrape = true;
                    console.log('[Scraper] Aborting scrape due to NOT_IN_USE status');
                }
                return;
            }
            
            // Case 4: Any other warning (generic handler)
            else {
                console.log(`[Scraper] Unknown warning state: ${warningText}`);
                ctx.add('tournamentId', tournamentId);
                ctx.add('gameStatus', 'UNKNOWN');
                ctx.add('name', warningText || 'Tournament Status Unknown');
                ctx.add('doNotScrape', true);
                ctx.add('hasGuarantee', false);
                ctx.add('s3Key', '');
                ctx.add('registrationStatus', 'N_A');
                if (!forceRefresh) {
                    ctx.abortScrape = true;
                    console.log('[Scraper] Aborting scrape due to unknown warning status');
                }
                return;
            }
        }
        
        // Check other indicators if no badge was found
        const pageTitle = ctx.$('title').text().toLowerCase();
        const h1Text = ctx.$('h1').first().text().toLowerCase();
        
        if (pageTitle.includes('not found') || h1Text.includes('not found')) {
            console.log('[Scraper] State detected from page title/h1: Not Found');
            ctx.add('tournamentId', tournamentId);
            ctx.add('gameStatus', 'UNKNOWN');
            ctx.add('name', 'Tournament Not Found');
            ctx.add('doNotScrape', true);
            ctx.add('hasGuarantee', false);
            ctx.add('s3Key', '');
            ctx.add('registrationStatus', 'N_A');
            
            if (!forceRefresh) {
                ctx.abortScrape = true;
            }
            return;
        }
        
        if (pageTitle.includes('error') || h1Text.includes('error')) {
            console.log('[Scraper] State detected: Error Page');
            ctx.add('tournamentId', tournamentId);
            ctx.add('gameStatus', 'ERROR');
            ctx.add('name', 'Tournament Error');
            ctx.add('doNotScrape', true);
            ctx.add('hasGuarantee', false);
            ctx.add('s3Key', '');
            ctx.add('registrationStatus', 'N_A');
            
            if (!forceRefresh) {
                ctx.abortScrape = true;
            }
            return;
        }
        
        // Make sure tournamentId is always set even if no special state
        if (!ctx.data.tournamentId) {
            ctx.add('tournamentId', tournamentId);
        }
    },

    initializeDefaultFlags(ctx) {
        ctx.add('isSeries', false);
        ctx.add('seriesName', null);
        ctx.add('isSatellite', false);
        ctx.add('isRegular', true);
        ctx.add('hasGuarantee', false); // Default value for required field
        ctx.add('doNotScrape', false); // Default value for required field
    },

    /**
     * ENHANCED: getName now also handles series detection using database
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

        // ENHANCED: Use database-aware series matching
        const seriesInfo = matchSeriesWithDatabase(gameName, seriesTitles, venues);
        
        if (seriesInfo) {
            ctx.add('isSeries', seriesInfo.isSeries);
            ctx.add('seriesName', seriesInfo.seriesName);
            ctx.add('isRegular', !seriesInfo.isSeries);
            
            // ENHANCE: Add a seriesMatch object similar to venueMatch
            if (seriesInfo.seriesId) {
                ctx.add('seriesMatch', {
                    autoAssignedSeries: {
                        id: seriesInfo.seriesId,
                        name: seriesInfo.seriesName,
                        score: seriesInfo.confidence || 0.85  // Add confidence scoring
                    },
                    suggestions: seriesInfo.suggestions || [],  // Add alternative matches
                    matchedBy: seriesInfo.matchedBy || 'database'  // 'database' or 'pattern'
                });
                
                // Keep individual fields for backward compatibility
                ctx.add('seriesId', seriesInfo.seriesId);
                ctx.add('tournamentSeriesId', seriesInfo.seriesId);  // Add this!
            }
            
            // Add series structure fields
            if (seriesInfo.dayNumber) ctx.add('dayNumber', seriesInfo.dayNumber);
            if (seriesInfo.flightLetter) ctx.add('flightLetter', seriesInfo.flightLetter);
            if (seriesInfo.isMainEvent) ctx.add('isMainEvent', seriesInfo.isMainEvent);
            if (seriesInfo.eventNumber) ctx.add('eventNumber', seriesInfo.eventNumber);
            if (seriesInfo.finalDay) ctx.add('finalDay', seriesInfo.finalDay);
        }
    },
    
    // All other methods remain UNCHANGED
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
        // If already set by detectPageState, skip
        if (ctx.data.registrationStatus) return ctx.data.registrationStatus;

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
        // This is now handled by getName with enhanced matching
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
        
        let playersRemaining = 0;
        
        if (ctx.data.seating && ctx.data.seating.length > 0) {
            playersRemaining = ctx.data.seating.length;
        }
        
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

    /**
     * ENHANCED: Now uses database venues first, then falls back to fuzzy/pattern matching
     */
    getMatchingVenue(ctx, venues, seriesTitles = []) {
        const gameName = ctx.data.name;
        
        if (!gameName) {
            ctx.add('venueMatch', { 
                autoAssignedVenue: null, 
                suggestions: [],
                extractedVenueName: null,
                matchingFailed: true 
            });
            return;
        }
        
        // Use enhanced venue matching
        const venueMatch = getMatchingVenueEnhanced(gameName, venues, seriesTitles);
        ctx.add('venueMatch', venueMatch);
        
        // Also set venueName if we have an auto-assigned venue
        if (venueMatch && venueMatch.autoAssignedVenue) {
            ctx.add('venueName', venueMatch.autoAssignedVenue.name);
        }
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

    // This is redundant now since we set tournamentId in context constructor
    // but keeping for backward compatibility
    getTournamentId(ctx, url) {
        if (ctx.data.tournamentId) return; // Already set
        
        const tournamentId = getTournamentId(url || ctx.url);
        ctx.add('tournamentId', tournamentId);
    },
};

// ===================================================================
// MAIN SCRAPER FUNCTION (UNCHANGED EXCEPT PARAMETERS)
// ===================================================================

const runScraper = (html, ctx = null, venues = [], seriesTitles = [], url = '', forceRefresh = false) => {
    
    // 1. Initialize context if not provided
    if (!ctx) {
        ctx = new ScrapeContext(html, url); 
    }
    
    console.log(`[runScraper] Starting run for tournament ${ctx.data.tournamentId}, forceRefresh: ${forceRefresh}`);
    console.log(`[runScraper] Database data: ${venues.length} venues, ${seriesTitles.length} series titles`);

    // 2. Run the strategy steps
    // Pass forceRefresh to detectPageState
    defaultStrategy.detectPageState(ctx, forceRefresh);
    
    // If state detection aborts (e.g., "Not Found"), return immediately
    // We check forceRefresh here, as a forced scrape should ignore aborts
    if (ctx.abortScrape) {
         console.log(`[runScraper] Aborting scrape due to page state: ${ctx.data.gameStatus}`);
         return { data: ctx.data, foundKeys: Array.from(ctx.foundKeys) };
    }

    // 3. Run all other parsers from the strategy
    defaultStrategy.initializeDefaultFlags(ctx);
    defaultStrategy.getName(ctx, seriesTitles, venues);  // Enhanced with database series matching
    defaultStrategy.getGameTags(ctx);
    defaultStrategy.getTournamentType(ctx);
    defaultStrategy.getGameStartDateTime(ctx);
    defaultStrategy.getStatus(ctx);
    defaultStrategy.getRegistrationStatus(ctx);
    defaultStrategy.getGameVariant(ctx);
    defaultStrategy.getPrizepool(ctx);
    defaultStrategy.getTotalEntries(ctx);
    defaultStrategy.getTotalRebuys(ctx);
    defaultStrategy.getTotalAddons(ctx);
    defaultStrategy.getTotalDuration(ctx);
    defaultStrategy.getBuyIn(ctx);
    defaultStrategy.getRake(ctx);
    defaultStrategy.getStartingStack(ctx);
    defaultStrategy.getGuarantee(ctx);
    defaultStrategy.getSeriesName(ctx);
    defaultStrategy.getTournamentFlags(ctx);
    defaultStrategy.getGameFrequency(ctx);

    // Live Data & Results
    defaultStrategy.getSeating(ctx);
    defaultStrategy.getEntries(ctx);
    defaultStrategy.getLiveData(ctx);
    defaultStrategy.getResults(ctx);
    defaultStrategy.getTables(ctx);
    
    // Structure
    defaultStrategy.getLevels(ctx);
    defaultStrategy.getBreaks(ctx);

    // Venue Matching - Enhanced with database matching
    defaultStrategy.getMatchingVenue(ctx, venues, seriesTitles);

    // Calculations (run last)
    defaultStrategy.calculateRevenueByBuyIns(ctx);
    defaultStrategy.calculateGuaranteeMetrics(ctx);
    defaultStrategy.calculateTotalRake(ctx);
    defaultStrategy.calculateProfitLoss(ctx);

    // 4. Return results
    console.log(`[runScraper] Completed. Found keys: ${ctx.foundKeys.size}, Status: ${ctx.data.gameStatus}, DoNotScrape: ${ctx.data.doNotScrape}`);
    
    return { 
        data: ctx.data, 
        foundKeys: Array.from(ctx.foundKeys) // Convert Set to Array
    };
};

module.exports = {
    runScraper,
    getTournamentId, // Export for use in other modules
    getStatusAndReg: (html) => {
        const ctx = new ScrapeContext(html);
        // Pass a default forceRefresh=false
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
    }
};