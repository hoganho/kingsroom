/**
 * ===================================================================
 * Parse Orchestrator
 * ===================================================================
 * 
 * Main entry point for HTML parsing.
 * Coordinates all parsing modules to extract tournament data.
 * 
 * ===================================================================
 */

const { ScrapeContext, defaultStrategy, getTournamentIdFromUrl } = require('./html-parser');
const { matchVenue, getAllVenues } = require('./venue-matcher');
const { matchSeries, getAllSeriesTitles } = require('./series-matcher');
const { processStructureFingerprint, generateStructureLabel } = require('./structure-fingerprint');

/**
 * Parse HTML and extract tournament data
 * 
 * @param {string} html - HTML content to parse
 * @param {object} options - Parse options
 * @param {string} options.url - Source URL
 * @param {array} options.venues - Venue list for matching
 * @param {array} options.seriesTitles - Series titles for matching
 * @param {boolean} options.forceRefresh - Force parse even on abort conditions
 * @returns {object} { data, foundKeys }
 */
const parseHtml = (html, options = {}) => {
    const {
        url = null,
        venues = [],
        seriesTitles = [],
        forceRefresh = false
    } = options;
    
    // Create parsing context
    const ctx = new ScrapeContext(html, url);
    
    console.log(`[ParseOrchestrator] Starting parse for tournament ${ctx.data.tournamentId}, forceRefresh: ${forceRefresh}`);
    console.log(`[ParseOrchestrator] Reference data: ${venues.length} venues, ${seriesTitles.length} series titles`);
    
    // Step 1: Detect page state (not found, not published, etc.)
    defaultStrategy.detectPageState(ctx, forceRefresh);
    
    if (ctx.abortScrape) {
        console.log(`[ParseOrchestrator] Aborting - page state: ${ctx.data.gameStatus}`);
        return {
            data: ctx.data,
            foundKeys: Array.from(ctx.foundKeys)
        };
    }
    
    // Step 2: Initialize defaults and extract basic data
    defaultStrategy.initializeDefaultFlags(ctx);
    
    // Step 3: Get name with series matching
    const seriesMatchFn = (gameName) => matchSeries(gameName, seriesTitles, venues);
    defaultStrategy.getName(ctx, seriesMatchFn);
    
    // Step 4: Extract tournament details
    defaultStrategy.getGameTags(ctx);
    defaultStrategy.getTournamentType(ctx);
    defaultStrategy.getGameStartDateTime(ctx);
    defaultStrategy.getStatus(ctx);
    defaultStrategy.getRegistrationStatus(ctx);
    defaultStrategy.getGameVariant(ctx);
    
    // Step 5: Extract financial data
    defaultStrategy.getPrizepoolPaid(ctx);
    defaultStrategy.getTotalUniquePlayers(ctx);
    defaultStrategy.getTotalInitialEntries(ctx);
    defaultStrategy.getTotalRebuys(ctx);
    defaultStrategy.getTotalAddons(ctx);
    defaultStrategy.getTotalEntries(ctx);
    defaultStrategy.getTotalDuration(ctx);
    defaultStrategy.getBuyIn(ctx);
    defaultStrategy.getRake(ctx);
    defaultStrategy.getStartingStack(ctx);
    defaultStrategy.getGuarantee(ctx);
    
    // Step 6: Extract player and table data
    defaultStrategy.getTournamentFlags(ctx);
    defaultStrategy.getGameFrequency(ctx);
    defaultStrategy.getSeating(ctx);
    defaultStrategy.getEntries(ctx);
    defaultStrategy.getLiveData(ctx);
    defaultStrategy.getResults(ctx);
    defaultStrategy.getTables(ctx);
    defaultStrategy.getLevels(ctx);
    defaultStrategy.getBreaks(ctx);
    
    // Step 7: Venue matching
    if (ctx.data.name) {
        const venueMatch = matchVenue(ctx.data.name, venues, seriesTitles);
        ctx.add('venueMatch', venueMatch);
        if (venueMatch?.autoAssignedVenue) {
            ctx.add('venueName', venueMatch.autoAssignedVenue.name);
        }
    }
    
    // Step 8: Calculate economics
    defaultStrategy.calculatePokerEconomics(ctx);
    
    // Step 9: Generate structure label
    const foundKeys = Array.from(ctx.foundKeys);
    const structureLabel = generateStructureLabel(ctx.data, foundKeys);
    ctx.add('structureLabel', structureLabel);
    
    console.log(`[ParseOrchestrator] Completed. Found ${ctx.foundKeys.size} keys, Status: ${ctx.data.gameStatus}, DoNotScrape: ${ctx.data.doNotScrape}`);
    
    return {
        data: ctx.data,
        foundKeys
    };
};

/**
 * Quick parse for status and registration only
 * Used when we just need basic status info
 * 
 * @param {string} html - HTML content
 * @returns {object} { gameStatus, registrationStatus, tournamentId }
 */
const parseStatusOnly = (html) => {
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

/**
 * Scrape data from HTML with all matching
 * Wrapper function for backwards compatibility
 * 
 * @param {string} html - HTML content
 * @param {array} venues - Venues for matching
 * @param {array} seriesTitles - Series titles for matching
 * @param {string} url - Source URL
 * @param {boolean} forceRefresh - Force parse
 * @returns {object} { data, foundKeys }
 */
const scrapeDataFromHtml = (html, venues = [], seriesTitles = [], url = '', forceRefresh = false) => {
    return parseHtml(html, {
        url,
        venues,
        seriesTitles,
        forceRefresh
    });
};

// Re-export for convenience
module.exports = {
    parseHtml,
    parseStatusOnly,
    scrapeDataFromHtml,
    
    // Sub-modules
    getAllVenues,
    getAllSeriesTitles,
    matchVenue,
    matchSeries,
    processStructureFingerprint,
    generateStructureLabel,
    
    // Utilities
    getTournamentIdFromUrl,
    ScrapeContext
};
