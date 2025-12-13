/**
 * ===================================================================
 * Fetch Handler
 * ===================================================================
 * 
 * Handles the fetchTournamentData operation.
 * 
 * RESPONSIBILITIES:
 * - Orchestrate HTML retrieval (cache or live)
 * - Parse HTML to extract tournament data
 * - Track scraping activity
 * - Return parsed data to caller
 * 
 * DOES NOT:
 * - Save to Game table (caller must invoke saveTournamentData separately)
 * 
 * ===================================================================
 */

const { enhancedHandleFetch } = require('../fetch');
const { parseHtml } = require('../parse');
const { getScrapeURL, updateScrapeURLDoNotScrape } = require('../core/scrape-url-manager');
const { createScrapeAttempt } = require('../core/scrape-attempt-tracker');
const { updateS3StorageWithParsedData } = require('../storage/s3-storage-manager');
const { getAllVenues } = require('../parse/venue-matcher');
const { getAllSeriesTitles } = require('../parse/series-matcher');
const { processStructureFingerprint } = require('../parse/structure-fingerprint');
const { getHtmlFromS3 } = require('../storage/s3-client');
const { DO_NOT_SCRAPE_STATUSES } = require('../config/constants');

/**
 * Extract tournament ID from URL
 */
const getTournamentIdFromUrl = (url) => {
    if (!url) return 0;
    try {
        const match = url.match(/[?&]id=(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    } catch {
        return 0;
    }
};

/**
 * Handle fetchTournamentData operation
 * 
 * @param {object} options - Fetch options
 * @param {string} options.url - Tournament URL (optional if s3Key provided)
 * @param {string} options.s3Key - S3 key for cached HTML (optional)
 * @param {string} options.entityId - Entity ID
 * @param {boolean} options.forceRefresh - Force live fetch
 * @param {boolean} options.overrideDoNotScrape - Override doNotScrape flag
 * @param {boolean} options.isRescrape - Whether this is a re-scrape from cache
 * @param {string} options.scraperJobId - Scraper job ID for tracking
 * @param {string} options.scraperApiKey - ScraperAPI key
 * @param {object} context - Shared context (ddbDocClient, s3Client, etc.)
 * @returns {object} Parsed tournament data
 */
const handleFetch = async (options, context) => {
    const {
        url,
        s3Key,
        entityId,
        forceRefresh = false,
        overrideDoNotScrape = false,
        isRescrape = false,
        scraperJobId = null,
        scraperApiKey = null
    } = options;
    
    const { ddbDocClient, monitoring, getTableName } = context;
    const startTime = Date.now();
    
    // ─────────────────────────────────────────────────────────────────
    // CASE 1: Re-scrape from S3 cache (no live fetch)
    // ─────────────────────────────────────────────────────────────────
    if (s3Key && !url) {
        return await handleRescrapeFromCache(s3Key, options, context);
    }
    
    // ─────────────────────────────────────────────────────────────────
    // CASE 2: Standard URL fetch
    // ─────────────────────────────────────────────────────────────────
    if (!url) {
        throw new Error('URL is required for fetchTournamentData');
    }
    
    const tournamentId = getTournamentIdFromUrl(url);
    monitoring.trackOperation('FETCH_START', 'Tournament', tournamentId.toString(), { entityId });
    
    // Get or create ScrapeURL record
    const scrapeURLRecord = await getScrapeURL(url, entityId, tournamentId, context);
    
    // Check doNotScrape flag
    if (scrapeURLRecord.doNotScrape && !forceRefresh && !overrideDoNotScrape) {
        console.log(`[FetchHandler] Skipping ${url} - marked as doNotScrape`);
        
        await createScrapeAttempt({
            url,
            tournamentId,
            entityId,
            scrapeURLId: scrapeURLRecord.id,
            scraperJobId,
            status: 'SKIPPED_DONOTSCRAPE',
            processingTime: Date.now() - startTime,
            gameName: scrapeURLRecord.gameName,
            gameStatus: scrapeURLRecord.gameStatus || 'NOT_IN_USE',
            source: 'SINGLE_SCRAPE'
        }, context);
        
        return {
            tournamentId,
            name: 'Skipped - Do Not Scrape',
            gameStatus: scrapeURLRecord.gameStatus || 'NOT_IN_USE',
            hasGuarantee: false,
            doNotScrape: true,
            s3Key: '',
            skipped: true,
            skipReason: 'DO_NOT_SCRAPE',
            entityId
        };
    }
    
    // Fetch reference data for parsing
    const [venues, seriesTitles] = await Promise.all([
        getAllVenues(context),
        getAllSeriesTitles(context)
    ]);
    
    // ─────────────────────────────────────────────────────────────────
    // FETCH HTML (cache or live)
    // ─────────────────────────────────────────────────────────────────
    const fetchResult = await enhancedHandleFetch(url, {
        scrapeURLRecord,
        entityId,
        tournamentId,
        forceRefresh,
        scraperApiKey
    }, context);
    
    if (!fetchResult.success) {
        // Track failed attempt
        await createScrapeAttempt({
            url,
            tournamentId,
            entityId,
            scrapeURLId: scrapeURLRecord.id,
            scraperJobId,
            status: 'FAILED',
            processingTime: Date.now() - startTime,
            errorMessage: fetchResult.error,
            errorType: extractErrorType(fetchResult.error),
            source: 'SINGLE_SCRAPE'
        }, context);
        
        throw new Error(fetchResult.error || 'Fetch failed');
    }
    
    // ─────────────────────────────────────────────────────────────────
    // PARSE HTML
    // ─────────────────────────────────────────────────────────────────
    const { data: scrapedData, foundKeys } = parseHtml(fetchResult.html, {
        url,
        venues,
        seriesTitles,
        forceRefresh
    });
    
    // Ensure tournamentId is set
    if (!scrapedData.tournamentId) {
        scrapedData.tournamentId = tournamentId;
    }
    
    // Generate structure label if not present
    if (!scrapedData.structureLabel) {
        scrapedData.structureLabel = `STATUS: ${scrapedData.gameStatus || 'UNKNOWN'} | REG: ${scrapedData.registrationStatus || 'UNKNOWN'}`;
    }
    if (!foundKeys.includes('structureLabel')) {
        foundKeys.push('structureLabel');
    }
    
    // Process structure fingerprint
    const { isNewStructure } = await processStructureFingerprint(foundKeys, scrapedData.structureLabel, url, context);
    scrapedData.isNewStructure = isNewStructure;
    
    // ─────────────────────────────────────────────────────────────────
    // UPDATE doNotScrape IF NEEDED
    // ─────────────────────────────────────────────────────────────────
    const shouldMarkDoNotScrape = DO_NOT_SCRAPE_STATUSES.includes(scrapedData.gameStatus) ||
                                   scrapedData.doNotScrape === true;
    
    if (shouldMarkDoNotScrape && !scrapeURLRecord.doNotScrape) {
        console.log(`[FetchHandler] Marking tournament as doNotScrape due to status: ${scrapedData.gameStatus}`);
        await updateScrapeURLDoNotScrape(url, true, scrapedData.gameStatus, context);
    }
    
    // ─────────────────────────────────────────────────────────────────
    // BUILD RESULT
    // ─────────────────────────────────────────────────────────────────
    const result = {
        tournamentId: scrapedData.tournamentId || tournamentId,
        name: scrapedData.name || 'Unnamed Tournament',
        gameStatus: scrapedData.gameStatus || 'SCHEDULED',
        hasGuarantee: scrapedData.hasGuarantee || false,
        doNotScrape: scrapedData.doNotScrape || false,
        s3Key: fetchResult.s3Key || '',
        ...scrapedData,
        rawHtml: fetchResult.html,
        source: fetchResult.source,
        contentHash: fetchResult.contentHash,
        fetchedAt: new Date().toISOString(),
        entityId,
        wasForced: forceRefresh || overrideDoNotScrape
    };
    
    // ─────────────────────────────────────────────────────────────────
    // UPDATE S3Storage WITH PARSED DATA
    // ─────────────────────────────────────────────────────────────────
    if (fetchResult.s3Key) {
        try {
            const updateResult = await updateS3StorageWithParsedData(
                fetchResult.s3Key,
                scrapedData,
                foundKeys,
                {
                    isRescrape: false,
                    url,
                    tournamentId: scrapedData.tournamentId || tournamentId,
                    entityId
                },
                context
            );
            
            result.s3StorageUpdated = updateResult.success;
            result.dataChanged = updateResult.dataChanged;
            
        } catch (s3UpdateError) {
            console.warn('[FetchHandler] Failed to update S3Storage with parsed data:', s3UpdateError.message);
        }
    }
    
    // ─────────────────────────────────────────────────────────────────
    // TRACK SUCCESSFUL ATTEMPT
    // ─────────────────────────────────────────────────────────────────
    await createScrapeAttempt({
        url,
        tournamentId: scrapedData.tournamentId || tournamentId,
        entityId,
        scrapeURLId: scrapeURLRecord.id,
        scraperJobId,
        status: 'SUCCESS',
        processingTime: Date.now() - startTime,
        gameName: scrapedData.name,
        gameStatus: scrapedData.gameStatus,
        registrationStatus: scrapedData.registrationStatus,
        dataHash: fetchResult.contentHash,
        hasChanges: result.dataChanged || false,
        foundKeys,
        structureLabel: scrapedData.structureLabel,
        s3Key: fetchResult.s3Key,
        source: 'SINGLE_SCRAPE'
    }, context);
    
    monitoring.trackOperation('FETCH_SUCCESS', 'Tournament', tournamentId.toString(), {
        entityId,
        source: fetchResult.source,
        gameStatus: scrapedData.gameStatus
    });
    
    return result;
};

/**
 * Handle re-scrape from S3 cache
 * Re-parses existing HTML with current scraper strategies
 */
const handleRescrapeFromCache = async (s3Key, options, context) => {
    const { entityId, scraperJobId } = options;
    const { monitoring } = context;
    const startTime = Date.now();
    
    monitoring.trackOperation('RESCRAPE_FROM_CACHE', 'S3Storage', s3Key, { entityId });
    
    try {
        // Get HTML from S3
        const s3Result = await getHtmlFromS3(s3Key, context);
        
        if (!s3Result || !s3Result.html) {
            throw new Error(`No HTML found in S3 at key: ${s3Key}`);
        }
        
        // Extract metadata
        const tournamentId = parseInt(s3Result.metadata?.tournamentid || '0', 10);
        const url = s3Result.metadata?.url || null;
        
        // Fetch reference data
        const [venues, seriesTitles] = await Promise.all([
            getAllVenues(context),
            getAllSeriesTitles(context)
        ]);
        
        // Parse HTML
        const { data: scrapedData, foundKeys } = parseHtml(s3Result.html, {
            url,
            venues,
            seriesTitles,
            forceRefresh: true // Always treat as fresh parse for re-scrape
        });
        
        // Ensure tournamentId
        if (!scrapedData.tournamentId) {
            scrapedData.tournamentId = tournamentId;
        }
        
        // Update S3Storage with new parsed data
        try {
            await updateS3StorageWithParsedData(
                s3Key,
                scrapedData,
                foundKeys,
                {
                    isRescrape: true,
                    url,
                    tournamentId: scrapedData.tournamentId,
                    entityId
                },
                context
            );
        } catch (updateError) {
            console.warn('[FetchHandler] Failed to update S3Storage during rescrape:', updateError.message);
        }
        
        monitoring.trackOperation('RESCRAPE_SUCCESS', 'S3Storage', s3Key, {
            entityId,
            tournamentId: scrapedData.tournamentId,
            processingTime: Date.now() - startTime
        });
        
        return {
            tournamentId: scrapedData.tournamentId,
            name: scrapedData.name || 'Unnamed Tournament',
            gameStatus: scrapedData.gameStatus || 'SCHEDULED',
            hasGuarantee: scrapedData.hasGuarantee || false,
            doNotScrape: scrapedData.doNotScrape || false,
            s3Key,
            ...scrapedData,
            source: 'RESCRAPE_CACHE',
            entityId,
            isRescrape: true
        };
        
    } catch (error) {
        monitoring.trackOperation('RESCRAPE_ERROR', 'S3Storage', s3Key, {
            entityId,
            error: error.message
        });
        throw error;
    }
};

/**
 * Extract error type from error message
 */
const extractErrorType = (errorMessage) => {
    if (!errorMessage) return 'UNKNOWN';
    
    const message = errorMessage.toLowerCase();
    
    if (message.includes('timeout')) return 'TIMEOUT';
    if (message.includes('network')) return 'NETWORK';
    if (message.includes('404') || message.includes('not found')) return 'NOT_FOUND';
    if (message.includes('403') || message.includes('forbidden')) return 'FORBIDDEN';
    if (message.includes('429') || message.includes('rate limit')) return 'RATE_LIMITED';
    if (message.includes('500') || message.includes('server error')) return 'SERVER_ERROR';
    if (message.includes('parse') || message.includes('html')) return 'PARSE_ERROR';
    
    return 'UNKNOWN';
};

module.exports = {
    handleFetch,
    handleRescrapeFromCache,
    getTournamentIdFromUrl,
    extractErrorType
};
