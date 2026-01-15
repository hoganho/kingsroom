/**
 * ===================================================================
 * webScraperFunction - Entry Point
 * ===================================================================
 * 
 * VERSION: 2.2.0
 * 
 * CHANGELOG:
 * - v2.2.0: Added saveAfterFetch option passthrough to fetch handler
 *           This enables refreshRunningGames to fetch AND save in one call
 *           When saveAfterFetch=true, fetch-handler auto-invokes save-handler
 * - v2.1.0: Error message now encoded in 'name' field for GraphQL passthrough
 *           Format: "FETCH_ERROR: <actual error message>"
 *           This ensures scrapingEngine can detect and display real errors.
 *           Also: doNotScrape=false for transient errors (API key missing, etc.)
 * - v2.0.0: Removed lambda-monitoring dependency (no longer maintained)
 *           Uses raw ddbDocClient instead of monitored wrapper
 * 
 * RESPONSIBILITIES (Fetch + Parse ONLY):
 * - Fetch HTML from live site or S3 cache
 * - Parse HTML to extract tournament data
 * - Track scraping activity (ScrapeURL, ScrapeAttempt, S3Storage)
 * - Return parsed data to caller
 * - (v2.2.0) Optionally auto-save via saveAfterFetch flag
 * 
 * DOES NOT (unless saveAfterFetch=true):
 * - Write to Game table (delegated to gameDataEnricher -> saveGameFunction)
 * - Create/modify venues or series
 * - Process player data
 * 
 * TABLES UPDATED:
 * - ScrapeURL: Tracking scrape status and S3 cache links
 * - S3Storage: Metadata about cached HTML files
 * - ScrapeAttempt: Audit log of scrape attempts
 * - ScrapeStructure: HTML structure fingerprinting
 * 
 * OPERATIONS:
 * - fetchTournamentData: Fetch + parse a single tournament (+ optional save)
 * - saveTournamentData: Passthrough to gameDataEnricher Lambda
 * - fetchTournamentDataRange: Batch fetch multiple tournaments
 * - reScrapeFromCache: Re-parse existing S3 HTML with new strategies
 * 
 * ===================================================================
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { S3Client } = require('@aws-sdk/client-s3');
const { LambdaClient } = require('@aws-sdk/client-lambda');

// Core modules
const { resolveEntityId, getEntityIdFromUrl } = require('./core/entity-resolver');
const { getTableName } = require('./config/tables');

// Handlers
const { handleFetch } = require('./handlers/fetch-handler');
const { handleSave } = require('./handlers/save-handler');
const { handleFetchRange } = require('./handlers/range-handler');

// Initialize AWS clients (shared across invocations)
const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const s3Client = new S3Client({});
const lambdaClient = new LambdaClient({});

/**
 * Main Lambda Handler
 */
exports.handler = async (event) => {
    const handlerStartTime = Date.now();
    
    // Build shared context object (no monitoring wrapper)
    const context = {
        ddbDocClient,
        s3Client,
        lambdaClient,
        getTableName
    };
    
    try {
        // Extract operation details from event
        const fieldName = event.fieldName || event.operation;
        const args = event.arguments || event.args || event;
        const identity = event.identity;
        
        // Resolve entity ID early (needed for all operations)
        const urlEntityId = args.url ? await getEntityIdFromUrl(args.url, context) : null;
        const entityId = resolveEntityId(
            args.entityId,
            urlEntityId,
            null,
            `handler(${fieldName})`
        );
        
        // Extract common options
        const options = {
            entityId,
            forceRefresh: args.forceRefresh || false,
            overrideDoNotScrape: args.overrideDoNotScrape || false,
            scraperJobId: args.scraperJobId || args.jobId || "MANUAL_RUN",
            scraperApiKey: args.scraperApiKey || process.env.SCRAPERAPI_KEY || null,
            // v2.2.0: New saveAfterFetch option for auto-save after fetch
            saveAfterFetch: args.saveAfterFetch || false
        };
        
        console.log(`[Handler] v2.2.0 Operation: ${fieldName}, EntityId: ${entityId}, saveAfterFetch: ${options.saveAfterFetch}`);
        
        // Route to appropriate handler
        switch (fieldName) {
            // ═══════════════════════════════════════════════════════════════════
            // FETCH: Get HTML and parse tournament data
            // v2.2.0: When saveAfterFetch=true, also saves to Game table
            // ═══════════════════════════════════════════════════════════════════
            case 'fetchTournamentData':
            case 'FETCH': {
                // Support both URL fetch and S3 cache re-parse
                if (args.s3Key && !args.url) {
                    // Re-scrape from cache (parse existing HTML with new strategies)
                    return await handleFetch({
                        s3Key: args.s3Key,
                        url: args.url || null,
                        ...options
                    }, context);
                }
                
                // Standard URL fetch
                if (!args.url) {
                    throw new Error('URL is required for fetchTournamentData');
                }
                
                return await handleFetch({
                    url: args.url,
                    ...options
                }, context);
            }
            
            // ═══════════════════════════════════════════════════════════════════
            // SAVE: Passthrough to gameDataEnricher Lambda
            // ═══════════════════════════════════════════════════════════════════
            case 'saveTournamentData':
            case 'SAVE': {
                const input = args.input || args;
                
                // Handle both old format (sourceUrl, data) and new format (source, game, players)
                const isNewFormat = !!(input.source && input.game);
                
                if (isNewFormat) {
                    console.log('[Handler] Detected new EnrichGameDataInput format with players:', {
                        hasPlayers: !!input.players,
                        playerCount: input.players?.allPlayers?.length || 0,
                        hasSource: !!input.source,
                        hasGame: !!input.game
                    });
                }
                
                return await handleSave({
                    sourceUrl: isNewFormat ? input.source.sourceId : (input.sourceUrl || input.url),
                    venueId: isNewFormat ? input.venue?.venueId : input.venueId,
                    data: isNewFormat ? {
                        ...input.game,
                        results: input.players?.allPlayers?.filter(p => p.rank !== undefined) || [],
                        entries: input.players?.allPlayers || [],
                        isSeries: !!input.series,
                        seriesName: input.series?.seriesName,
                        tournamentSeriesId: input.series?.seriesId,
                        venueMatch: input.venue?.suggestedVenueId ? {
                            autoAssignedVenue: { id: input.venue.suggestedVenueId, score: input.venue.confidence }
                        } : undefined
                    } : (input.originalScrapedData || input.data),
                    existingGameId: isNewFormat ? input.game?.existingGameId : input.existingGameId,
                    doNotScrape: isNewFormat ? (input.options?.doNotScrape || false) : (input.doNotScrape || false),
                    entityId: input.entityId || input.source?.entityId || entityId,
                    scraperJobId: isNewFormat ? input.options?.scraperJobId : options.scraperJobId
                }, context);
            }
            
            // ═══════════════════════════════════════════════════════════════════
            // FETCH RANGE: Batch fetch multiple tournaments
            // ═══════════════════════════════════════════════════════════════════
            case 'fetchTournamentDataRange': {
                if (!args.startId || !args.endId) {
                    throw new Error('startId and endId are required for fetchTournamentDataRange');
                }
                
                return await handleFetchRange({
                    startId: args.startId,
                    endId: args.endId,
                    ...options
                }, context);
            }
            
            // ═══════════════════════════════════════════════════════════════════
            // RE-SCRAPE FROM CACHE: Parse existing S3 HTML
            // ═══════════════════════════════════════════════════════════════════
            case 'reScrapeFromCache': {
                const input = args.input || args;
                
                if (!input.s3Key) {
                    throw new Error('s3Key is required for reScrapeFromCache');
                }
                
                return await handleFetch({
                    s3Key: input.s3Key,
                    url: input.url || null,
                    isRescrape: true,
                    ...options
                }, context);
            }
            
            // ═══════════════════════════════════════════════════════════════════
            // UNKNOWN OPERATION
            // ═══════════════════════════════════════════════════════════════════
            default:
                throw new Error(`Unknown operation: ${fieldName}`);
        }
        
    } catch (error) {
        console.error('[Handler] Error:', error);
        
        // Return structured error for fetch operations
        // v2.1.0: Encode error message in 'name' field so it passes through GraphQL
        // The error/errorMessage fields may be stripped by GraphQL schema validation,
        // but 'name' always passes through. scrapingEngine checks for "FETCH_ERROR:" prefix.
        if (event.fieldName === 'fetchTournamentData' || event.fieldName === 'FETCH') {
            const args = event.arguments || event.args || event;
            const tournamentId = args.url ? extractTournamentIdFromUrl(args.url) : 0;
            
            const errorMsg = error.message || 'Unknown fetch error';
            
            return {
                tournamentId,
                // v2.1.0: Encode error in name field with prefix for detection
                name: `FETCH_ERROR: ${errorMsg}`,
                gameStatus: 'UNKNOWN',
                hasGuarantee: false,
                // v2.1.0: Don't set doNotScrape for transient errors like missing API key
                doNotScrape: false,
                s3Key: '',
                // These fields may be stripped by GraphQL, but we include them anyway
                error: errorMsg,
                errorMessage: errorMsg,
                status: 'ERROR',
                registrationStatus: 'N_A',
                entityId: args.entityId || null,
                source: 'ERROR',
                // v2.2.0: Auto-save would have failed too
                autoSaved: false,
                autoSaveError: errorMsg
            };
        }
        
        throw error;
        
    } finally {
        const duration = Date.now() - handlerStartTime;
        console.log(`[Handler] Completed in ${duration}ms`);
    }
};

/**
 * Extract tournament ID from URL (inline helper)
 */
const extractTournamentIdFromUrl = (url) => {
    if (!url) return 0;
    try {
        const match = url.match(/[?&]id=(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
    } catch {
        return 0;
    }
};