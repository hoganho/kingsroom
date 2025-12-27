/**
 * ===================================================================
 * webScraperFunction - Entry Point
 * ===================================================================
 * 
 * RESPONSIBILITIES (Fetch + Parse ONLY):
 * - Fetch HTML from live site or S3 cache
 * - Parse HTML to extract tournament data
 * - Track scraping activity (ScrapeURL, ScrapeAttempt, S3Storage)
 * - Return parsed data to caller
 * 
 * DOES NOT:
 * - Write to Game table (delegated to saveGameFunction)
 * - Create/modify venues or series
 * - Process player data
 * 
 * OPERATIONS:
 * - fetchTournamentData: Fetch + parse a single tournament
 * - saveTournamentData: Passthrough to saveGameFunction Lambda
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
const { LambdaMonitoring } = require('./utils/monitoring');
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
    
    // Initialize monitoring for this request
    const monitoring = new LambdaMonitoring('webScraperFunction', 'pending-entity');
    const monitoredDdbDocClient = monitoring.wrapDynamoDBClient(ddbDocClient);
    
    // Build shared context object
    const context = {
        ddbDocClient: monitoredDdbDocClient,
        s3Client,
        lambdaClient,
        monitoring,
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
        
        // Update monitoring with resolved entity
        monitoring.setEntityId(entityId);
        
        // Extract common options
        const options = {
            entityId,
            forceRefresh: args.forceRefresh || false,
            overrideDoNotScrape: args.overrideDoNotScrape || false,
            scraperJobId: args.scraperJobId || args.jobId || "MANUAL_RUN",
            scraperApiKey: args.scraperApiKey || process.env.SCRAPERAPI_KEY || null
        };
        
        console.log(`[Handler] Operation: ${fieldName}, EntityId: ${entityId}`);
        
        // Route to appropriate handler
        switch (fieldName) {
            // ───────────────────────────────────────────────────────────────
            // FETCH: Get HTML and parse tournament data
            // ───────────────────────────────────────────────────────────────
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
            
            // ───────────────────────────────────────────────────────────────
            // SAVE: Passthrough to saveGameFunction Lambda
            // ───────────────────────────────────────────────────────────────
            case 'saveTournamentData':
            case 'SAVE': {
                const input = args.input || args;
                
                // FIXED: Handle both old format (sourceUrl, data) and new format (source, game, players)
                // New format comes from scrapingEngine.buildSaveInput()
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
                    // URL: new format uses source.sourceId, old format uses sourceUrl/url
                    sourceUrl: isNewFormat ? input.source.sourceId : (input.sourceUrl || input.url),
                    
                    // VenueId: new format uses venue.venueId, old format uses venueId directly
                    venueId: isNewFormat ? input.venue?.venueId : input.venueId,
                    
                    // Data: new format has structured data, old format has raw scraped data
                    // For new format, reconstruct the data object that save-handler expects
                    data: isNewFormat ? {
                        ...input.game,
                        // Include player arrays so extractPlayerDataForProcessing can find them
                        results: input.players?.allPlayers?.filter(p => p.rank !== undefined) || [],
                        entries: input.players?.allPlayers || [],
                        // Pass through other fields
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
            
            // ───────────────────────────────────────────────────────────────
            // FETCH RANGE: Batch fetch multiple tournaments
            // ───────────────────────────────────────────────────────────────
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
            
            // ───────────────────────────────────────────────────────────────
            // RE-SCRAPE FROM CACHE: Parse existing S3 HTML
            // ───────────────────────────────────────────────────────────────
            case 'reScrapeFromCache': {
                const input = args.input || args;
                
                if (!input.s3Key) {
                    throw new Error('s3Key is required for reScrapeFromCache');
                }
                
                // Delegate to fetchTournamentData with s3Key
                return await handleFetch({
                    s3Key: input.s3Key,
                    url: input.url || null,
                    isRescrape: true,
                    ...options
                }, context);
            }
            
            // ───────────────────────────────────────────────────────────────
            // UNKNOWN OPERATION
            // ───────────────────────────────────────────────────────────────
            default:
                throw new Error(`Unknown operation: ${fieldName}`);
        }
        
    } catch (error) {
        console.error('[Handler] Error:', error);
        monitoring.trackOperation('HANDLER_ERROR', 'Handler', 'fatal', {
            error: error.message,
            stack: error.stack
        });
        
        // Return structured error for fetch operations
        // FIXED: Use gameStatus: 'ERROR' instead of 'SCHEDULED' so autoScraper
        // properly recognizes this as an error, not valid tournament data
        if (event.fieldName === 'fetchTournamentData' || event.fieldName === 'FETCH') {
            const args = event.arguments || event.args || event;
            const tournamentId = args.url ? extractTournamentIdFromUrl(args.url) : 0;
            
            return {
                tournamentId,
                name: 'Error processing tournament',
                gameStatus: 'ERROR',              // FIXED: Was 'SCHEDULED' - now properly indicates error
                hasGuarantee: false,
                doNotScrape: true,
                s3Key: '',
                error: error.message,
                errorMessage: error.message,      // ADDED: Explicit error message field
                status: 'ERROR',
                registrationStatus: 'N_A',
                entityId: args.entityId || null,
                source: 'ERROR'                   // ADDED: Indicate this came from error path
            };
        }
        
        throw error;
        
    } finally {
        // Always flush monitoring metrics
        const duration = Date.now() - handlerStartTime;
        console.log(`[Handler] Completed in ${duration}ms`);
        await monitoring.flush();
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