/**
 * Scraping Engine
 * 
 * Core scraping logic extracted from index.js for maintainability.
 * Handles bulk scraping, gap processing, and event streaming.
 * 
 * UPDATED v1.4.0:
 * - FIXED: Added ctx.onProgress() calls for real-time job stats via subscription
 * - Progress events now published alongside DynamoDB updates
 * - Stats panel in frontend now receives live updates during processing
 * 
 * v1.3.0:
 * - FIXED: NOT_PUBLISHED is now handled separately from NOT_FOUND
 *   - NOT_FOUND: Empty slot - increments consecutive counters, can stop scraper
 *   - NOT_PUBLISHED: Real tournament hidden - RESETS counters, does NOT stop scraper
 * - NO Game table placeholder saving - ScrapeURL handles tracking
 * - NEW: notPublishedCount metric for tracking
 * 
 * v1.2.0:
 * - FIXED: gapIds are now processed FIRST regardless of mode
 * - FIXED: Auto mode now respects options.startId if provided
 * - IMPROVED: Error messages now capture actual error
 * - FIXED: gameStatus uses 'UNKNOWN' instead of 'ERROR' (not in GraphQL enum)
 * 
 * v1.1.0:
 * - FIXED: GameStatus enum serialization errors now treated as NOT_PUBLISHED
 */

const { FETCH_TOURNAMENT_DATA, SAVE_TOURNAMENT_DATA } = require('../graphql/queries');
const { ScrapeURLPrefetchCache } = require('../lib/prefetchCache');

// ===================================================================
// RESPONSE VALIDATORS
// ===================================================================

function shouldSkipNotPublished(scrapeURLStatus, options) {
    if (!options.skipNotPublished) return false;
    return scrapeURLStatus.found && scrapeURLStatus.gameStatus === 'NOT_PUBLISHED';
}

function shouldSkipNotFoundGap(scrapeURLStatus, options) {
    if (!options.skipNotFoundGaps) return false;
    if (!scrapeURLStatus.found) return false;
    
    const status = (scrapeURLStatus.lastScrapeStatus || '').toUpperCase();
    return status === 'NOT_FOUND' || status === 'BLANK' || status === 'NOT_IN_USE';
}

/**
 * Check if response indicates an EMPTY tournament slot (NOT_FOUND)
 * These SHOULD increment consecutive counters and potentially stop scraper.
 * These slots may have new tournaments created soon - treat as gaps.
 * 
 * UPDATED v1.3.0: Removed NOT_PUBLISHED from this check!
 * NOT_PUBLISHED is a REAL tournament that's just hidden - not an empty slot.
 */
function isNotFoundResponse(parsedData) {
    if (!parsedData) return false;
    const status = parsedData.gameStatus;
    // Only true "not found" statuses - NOT including NOT_PUBLISHED!
    // NOT_FOUND is legacy, NOT_IN_USE is current
    return status === 'NOT_FOUND' || status === 'NOT_IN_USE';
}

/**
 * Check if response indicates a REAL but UNPUBLISHED tournament
 * These should NOT increment consecutive counters (treat like a found game).
 * These are real tournaments - just not visible yet.
 * ScrapeURL will be marked doNotScrape=true, re-check monthly/ad-hoc.
 * 
 * NEW in v1.3.0
 */
function isNotPublishedResponse(parsedData) {
    if (!parsedData) return false;
    return parsedData.gameStatus === 'NOT_PUBLISHED';
}

/**
 * Check if response indicates an error that should be retried
 * UNKNOWN status means something went wrong during parsing
 */
function isUnknownErrorResponse(parsedData) {
    if (!parsedData) return false;
    return parsedData.gameStatus === 'UNKNOWN';
}

/**
 * Check if the parsed data represents an error response from the scraper
 * This catches cases where the scraper returns structured "valid-looking" data
 * that actually represents a failure (e.g., "Error processing tournament")
 */
function isErrorResponse(parsedData) {
    if (!parsedData) return true;
    
    // Check for known error name patterns
    if (parsedData.name === 'Error processing tournament') return true;
    if (parsedData.name && parsedData.name.toLowerCase().includes('error')) return true;
    
    // Check for explicit error message
    if (parsedData.errorMessage) return true;
    if (parsedData.error) return true;
    
    return false;
}

// ===================================================================
// PLAYER DATA EXTRACTION
// ===================================================================

function extractPlayerData(parsedData) {
    if (!parsedData) {
        return undefined;
    }
    
    const playerMap = new Map();
    
    // Extract from results
    if (parsedData.results?.length) {
        parsedData.results.forEach(result => {
            if (result.name) {
                playerMap.set(result.name.toLowerCase(), {
                    name: result.name,
                    rank: result.rank ?? undefined,
                    winnings: result.winnings ?? 0,
                    points: result.points ?? undefined,
                    isQualification: result.isQualification ?? undefined
                });
            }
        });
    }
    
    // Extract from entries (if not already in results)
    if (parsedData.entries?.length) {
        parsedData.entries.forEach(entry => {
            const key = entry.name?.toLowerCase();
            if (key && !playerMap.has(key)) {
                playerMap.set(key, { name: entry.name });
            }
        });
    }
    
    // Extract from seating (if not already captured)
    if (parsedData.seating?.length) {
        parsedData.seating.forEach(seat => {
            const key = seat.name?.toLowerCase();
            if (key && !playerMap.has(key)) {
                playerMap.set(key, { name: seat.name });
            }
        });
    }
    
    const allPlayers = Array.from(playerMap.values());
    
    if (allPlayers.length === 0) {
        return undefined;
    }
    
    // Calculate total prizes paid from results
    const totalPrizesPaid = parsedData.results?.reduce((sum, r) => sum + (r.winnings || 0), 0) || 0;
    
    // Determine if we have complete results (all ranked players have names)
    const hasResults = parsedData.results?.length > 0;
    const hasCompleteResults = hasResults && parsedData.results.every(r => r.name && r.rank);
    
    // Return structure matching SavePlayerDataInput schema exactly
    return {
        allPlayers,
        totalUniquePlayers: allPlayers.length,
        totalInitialEntries: parsedData.totalInitialEntries || allPlayers.length,
        totalEntries: parsedData.totalEntries || parsedData.totalInitialEntries || allPlayers.length,
        hasCompleteResults: hasCompleteResults,
        totalPrizesPaid: totalPrizesPaid > 0 ? totalPrizesPaid : undefined,
        hasEntryList: (parsedData.entries?.length || 0) > 0,
        hasSeatingData: (parsedData.seating?.length || 0) > 0
    };
}

// ===================================================================
// SAVE INPUT BUILDER
// ===================================================================

function buildSaveInput(entityId, url, parsedData, venueId) {
    return {
        entityId: entityId,
        
        source: {
            type: 'SCRAPE',
            sourceId: url,
            entityId: entityId,
            fetchedAt: parsedData.fetchedAt || new Date().toISOString(),
            contentHash: parsedData.contentHash || undefined,
            wasEdited: false
        },
        
        game: {
            tournamentId: parsedData.tournamentId,
            name: parsedData.name,
            gameType: parsedData.gameType || 'TOURNAMENT',
            gameVariant: parsedData.gameVariant || undefined,
            gameStatus: parsedData.gameStatus,
            registrationStatus: parsedData.registrationStatus || undefined,
            gameStartDateTime: parsedData.gameStartDateTime,
            gameEndDateTime: parsedData.gameEndDateTime || undefined,
            gameFrequency: parsedData.gameFrequency || undefined,
            
            // Financials
            buyIn: parsedData.buyIn ?? 0,
            rake: parsedData.rake ?? 0,
            startingStack: parsedData.startingStack ?? 0,
            hasGuarantee: parsedData.hasGuarantee ?? false,
            guaranteeAmount: parsedData.guaranteeAmount ?? 0,
            
            // Entries
            totalUniquePlayers: parsedData.totalUniquePlayers ?? 0,
            totalInitialEntries: parsedData.totalInitialEntries ?? 0,
            totalEntries: parsedData.totalEntries ?? 0,
            totalRebuys: parsedData.totalRebuys ?? 0,
            totalAddons: parsedData.totalAddons ?? 0,
            
            // Results
            prizepoolPaid: parsedData.prizepoolPaid ?? 0,
            prizepoolCalculated: parsedData.prizepoolCalculated ?? 0,
            totalDuration: parsedData.totalDuration || undefined,
            
            // Classification
            tournamentType: parsedData.tournamentType || undefined,
            isSeries: parsedData.isSeries ?? false,
            seriesName: parsedData.seriesName || undefined,
            isSatellite: parsedData.isSatellite ?? false,
            isRegular: parsedData.isRegular ?? false,
            gameTags: parsedData.gameTags || [],
            
            // Series metadata
            isMainEvent: parsedData.isMainEvent ?? false,
            eventNumber: parsedData.eventNumber || undefined,
            dayNumber: parsedData.dayNumber || undefined,
            flightLetter: parsedData.flightLetter || undefined,
            finalDay: parsedData.finalDay ?? false,
            
            // Structure (stringify if present)
            levels: parsedData.levels ? JSON.stringify(parsedData.levels) : undefined
        },
        
        venue: {
            venueId: venueId,
            suggestedVenueId: parsedData.venueMatch?.autoAssignedVenue?.id || undefined,
            confidence: parsedData.venueMatch?.autoAssignedVenue?.score || 0
        },
        
        // Include series info if it's a series game
        series: parsedData.isSeries ? {
            tournamentSeriesId: parsedData.tournamentSeriesId || undefined,
            seriesTitleId: parsedData.seriesTitleId || undefined,
            seriesName: parsedData.seriesName || undefined,
            year: parsedData.seriesYear || new Date().getFullYear(),
            isMainEvent: parsedData.isMainEvent || false,
            eventNumber: parsedData.eventNumber || undefined,
            dayNumber: parsedData.dayNumber || undefined,
            flightLetter: parsedData.flightLetter || undefined,
            finalDay: parsedData.finalDay || false
        } : undefined,
        
        // Include player data if results exist
        players: extractPlayerData(parsedData),
        
        options: {
            saveToDatabase: true,
            autoCreateSeries: true,
            autoCreateRecurring: true
        }
    };
}

// ===================================================================
// RETRY HELPER FOR RATE LIMITING
// ===================================================================

/**
 * Retry a function with exponential backoff for 429 errors
 */
async function withRetry(fn, maxRetries = 3, baseDelayMs = 500) {
    let lastError;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            const errorStr = error.message || String(error);
            const is429 = errorStr.includes('429') || 
                          errorStr.includes('Rate Exceeded') || 
                          errorStr.includes('TooManyRequests');
            
            if (!is429 || attempt === maxRetries) {
                throw error;
            }
            
            const delayMs = baseDelayMs * Math.pow(2, attempt);
            console.log(`[ScrapingEngine] Rate limited, retrying in ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
    throw lastError;
}

// ===================================================================
// PROGRESS STATS BUILDER (NEW in v1.4.0)
// ===================================================================

/**
 * Build stats object for onProgress callback
 * Ensures consistent structure for real-time subscription updates
 */
function buildProgressStats(results, startTime) {
    const totalSuccessful = results.newGamesScraped + results.gamesUpdated;
    const successRate = results.totalProcessed > 0 
        ? Math.round((totalSuccessful / results.totalProcessed) * 100 * 10) / 10
        : null;
    
    return {
        totalProcessed: results.totalProcessed,
        newGamesScraped: results.newGamesScraped,
        gamesUpdated: results.gamesUpdated,
        gamesSkipped: results.gamesSkipped,
        errors: results.errors,
        blanks: results.blanks,
        notFoundCount: results.notFoundCount,
        s3CacheHits: results.s3CacheHits,
        successRate: successRate,
        consecutiveNotFound: results.consecutiveNotFound,
        consecutiveErrors: results.consecutiveErrors,
        consecutiveBlanks: results.consecutiveBlanks,
        notPublishedCount: results.notPublishedCount,
    };
}

// ===================================================================
// MAIN SCRAPING ENGINE
// ===================================================================

/**
 * Main scraping engine with configurable thresholds and event streaming
 * 
 * @param {string} entityId - Entity to scrape for
 * @param {object} scraperState - Current scraper state from DynamoDB
 * @param {string} jobId - Job ID for progress tracking
 * @param {object} options - Scraping options (mode, thresholds, etc.)
 * @param {object} ctx - Context with dependencies (callGraphQL, getEntity, etc.)
 */
async function performScrapingEnhanced(entityId, scraperState, jobId, options = {}, ctx) {
    const {
        callGraphQL,
        getEntity,
        buildTournamentUrl,
        getScraperJob,
        updateScraperJob,
        updateScraperState,
        publishGameProcessedEvent,
        ddbDocClient,
        scrapeURLTable,
        STOP_REASON,
        LAMBDA_TIMEOUT,
        LAMBDA_TIMEOUT_BUFFER,
        PROGRESS_UPDATE_FREQUENCY,
        DEFAULT_MAX_CONSECUTIVE_NOT_FOUND,
        DEFAULT_MAX_CONSECUTIVE_ERRORS,
        DEFAULT_MAX_CONSECUTIVE_BLANKS,
        DEFAULT_MAX_TOTAL_ERRORS,
        // Self-continuation support (optional)
        invokeContinuation,
        // NEW v1.4.0: Real-time progress callback for subscription updates
        onProgress,
        invocationStartTime
    } = ctx;
    
    const startTime = invocationStartTime || Date.now();
    
    // Extract thresholds from options (passed from scraperManagement) with defaults
    const MAX_CONSECUTIVE_NOT_FOUND = options.maxConsecutiveNotFound || DEFAULT_MAX_CONSECUTIVE_NOT_FOUND;
    const MAX_CONSECUTIVE_ERRORS = options.maxConsecutiveErrors || DEFAULT_MAX_CONSECUTIVE_ERRORS;
    const MAX_CONSECUTIVE_BLANKS = options.maxConsecutiveBlanks || DEFAULT_MAX_CONSECUTIVE_BLANKS;
    const MAX_TOTAL_ERRORS = options.maxTotalErrors || DEFAULT_MAX_TOTAL_ERRORS;
    
    console.log(`[ScrapingEngine] Using thresholds: NOT_FOUND=${MAX_CONSECUTIVE_NOT_FOUND}, ERRORS=${MAX_CONSECUTIVE_ERRORS}, BLANKS=${MAX_CONSECUTIVE_BLANKS}, TOTAL_ERRORS=${MAX_TOTAL_ERRORS}`);
    
    // Initialize results - merge with accumulated results from previous invocation if continuing
    const accumulated = options.accumulatedResults || {};
    const results = {
        totalProcessed: accumulated.totalProcessed || 0,
        newGamesScraped: accumulated.newGamesScraped || 0,
        gamesUpdated: accumulated.gamesUpdated || 0,
        gamesSkipped: accumulated.gamesSkipped || 0,
        errors: accumulated.errors || 0,
        blanks: accumulated.blanks || 0,
        notFoundCount: accumulated.notFoundCount || 0,
        s3CacheHits: accumulated.s3CacheHits || 0,
        consecutiveBlanks: 0,
        consecutiveNotFound: 0,
        consecutiveErrors: 0,
        currentId: null,
        lastProcessedId: scraperState.lastScannedId,
        stopReason: STOP_REASON.COMPLETED,
        lastErrorMessage: null,
        // NEW v1.3.0: NOT_PUBLISHED tracking (no Game save, just count)
        notPublishedCount: accumulated.notPublishedCount || 0,
    };
    
    if (accumulated.totalProcessed) {
        console.log(`[ScrapingEngine] Continuing from previous invocation, accumulated: ${accumulated.totalProcessed} processed`);
    }
    
    // Determine ID range based on mode
    let currentId, endId;
    const mode = options.mode || 'bulk';
    
    // ─────────────────────────────────────────────────────────────────
    // IMPROVED: Process gapIds FIRST if provided, regardless of mode
    // ─────────────────────────────────────────────────────────────────
    if (options.gapIds?.length > 0) {
        console.log(`[ScrapingEngine] Processing ${options.gapIds.length} gap IDs first (mode: ${mode})`);
        
        const gapResults = await processGapIds(entityId, jobId, options.gapIds, options, startTime, ctx);
        
        // If mode is 'gaps' or 'multiId', return after processing gaps only
        if (mode === 'gaps' || mode === 'multiId') {
            return gapResults;
        }
        
        // Otherwise, merge gap results and continue with normal scanning
        results.totalProcessed += gapResults.totalProcessed;
        results.newGamesScraped += gapResults.newGamesScraped;
        results.gamesUpdated += gapResults.gamesUpdated;
        results.gamesSkipped += gapResults.gapsSkipped;
        results.errors += gapResults.errors;
        results.blanks += gapResults.blanks;
        results.notFoundCount += gapResults.notFoundCount;
        results.s3CacheHits += gapResults.s3CacheHits;
        results.notPublishedCount += gapResults.notPublishedCount || 0;
        
        // If gaps processing hit error threshold, stop early
        if (gapResults.stopReason && gapResults.stopReason !== STOP_REASON.COMPLETED) {
            console.log(`[ScrapingEngine] Gap processing stopped: ${gapResults.stopReason}`);
            results.stopReason = gapResults.stopReason;
            results.lastErrorMessage = gapResults.lastErrorMessage;
            return results;
        }
        
        console.log(`[ScrapingEngine] Gap processing complete, continuing with ${mode} mode...`);
    }
    
    switch (mode) {
        case 'bulk':
            currentId = (options.startId || scraperState.lastScannedId) + 1;
            const validBulkCount = (options.bulkCount > 0) ? options.bulkCount : 10;
            endId = currentId + validBulkCount - 1;
            break;
        case 'range':
            currentId = options.startId || scraperState.lastScannedId + 1;
            endId = options.endId || currentId + 100;
            break;
        case 'auto':
            currentId = options.startId || scraperState.lastScannedId + 1;
            endId = options.maxId || currentId + 10000;
            break;
        case 'gaps':
        case 'multiId':
            // Already handled above - should not reach here
            return results;
        case 'refresh':
            // TODO: Implement refresh mode
            break;
        default:
            currentId = scraperState.lastScannedId + 1;
            endId = currentId + (options.maxGames || 100);
    }
    
    const maxId = options.maxId || null;
    
    // Log entity URL pattern
    const entity = await getEntity(entityId);
    console.log(`[ScrapingEngine] Entity: ${entity.entityName}, URL pattern: ${entity.gameUrlDomain}${entity.gameUrlPath}{id}`);
    
    // Initialize prefetch cache
    let prefetchCache = null;
    if (options.skipNotPublished || options.skipNotFoundGaps) {
        prefetchCache = new ScrapeURLPrefetchCache(entityId, ddbDocClient, scrapeURLTable);
    }
    
    console.log(`[ScrapingEngine] Starting ${mode} mode: ID ${currentId} to ${endId}${maxId ? `, maxId: ${maxId}` : ''}`);
    
    // Main scraping loop
    while (currentId <= endId) {
        results.currentId = currentId;
        
        // Track timing for this individual game
        const gameStartTime = Date.now();
        
        // Check cancellation (job status changed to STOPPED_MANUAL)
        if (results.totalProcessed % 10 === 0) {
            const job = await getScraperJob(jobId);
            if (job?.status === 'STOPPED_MANUAL') {
                console.log(`[ScrapingEngine] Job cancelled by user at ID ${currentId}`);
                results.stopReason = STOP_REASON.MANUAL;
                break;
            }
        }
        
        // Check Max ID
        if (maxId && currentId > maxId) {
            console.log(`[ScrapingEngine] Reached Max ID (${maxId})`);
            results.stopReason = STOP_REASON.MAX_ID;
            break;
        }
        
        // Check timeout - trigger self-continuation if available
        if (Date.now() - startTime > (LAMBDA_TIMEOUT - LAMBDA_TIMEOUT_BUFFER)) {
            console.log(`[ScrapingEngine] Approaching timeout at ID ${currentId}`);
            
            // Try to continue in new invocation
            if (invokeContinuation && currentId < endId) {
                try {
                    await invokeContinuation(currentId, endId, results);
                    results.stopReason = STOP_REASON.CONTINUING || 'CONTINUING';
                    console.log(`[ScrapingEngine] Self-continuation triggered, stopping current invocation`);
                } catch (contErr) {
                    console.error(`[ScrapingEngine] Failed to invoke continuation:`, contErr.message);
                    results.stopReason = STOP_REASON.TIMEOUT;
                }
            } else {
                results.stopReason = STOP_REASON.TIMEOUT;
            }
            break;
        }
        
        const url = await buildTournamentUrl(entityId, currentId);
        results.lastProcessedId = currentId;

        // Skip checks using prefetch cache
        if (prefetchCache) {
            try {
                const scrapeURLStatus = await prefetchCache.getStatus(currentId);
                
                if (shouldSkipNotPublished(scrapeURLStatus, options)) {
                    results.gamesSkipped++;
                    
                    publishGameProcessedEvent(jobId, entityId, currentId, url, {
                        action: 'SKIPPED',
                        message: 'Skipped (prefetch: NOT_PUBLISHED)',
                        durationMs: Date.now() - gameStartTime,
                        dataSource: 'none',
                        parsedData: { gameStatus: 'NOT_PUBLISHED' },
                    }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                    
                    currentId++;
                    continue;
                }
                
                if (shouldSkipNotFoundGap(scrapeURLStatus, options)) {
                    results.gamesSkipped++;
                    
                    publishGameProcessedEvent(jobId, entityId, currentId, url, {
                        action: 'SKIPPED',
                        message: 'Skipped (prefetch: NOT_FOUND gap)',
                        durationMs: Date.now() - gameStartTime,
                        dataSource: 'none',
                        parsedData: { gameStatus: scrapeURLStatus.lastScrapeStatus },
                    }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                    
                    currentId++;
                    continue;
                }
            } catch (error) {
                console.warn(`[ScrapingEngine] Prefetch error, continuing: ${error.message}`);
            }
        }
        
        results.totalProcessed++;

        try {
            // Fetch via AppSync with retry for rate limiting
            const fetchData = await withRetry(async () => {
                return await callGraphQL(FETCH_TOURNAMENT_DATA, {
                    url: url,
                    forceRefresh: options.forceRefresh || false,
                    entityId: entityId,
                    scraperApiKey: options.scraperApiKey || null
                });
            }, 3, 500);
            const parsedData = fetchData.fetchTournamentData;

            // Determine data source for event
            const dataSource = (parsedData.source === 'S3_CACHE' || parsedData.source === 'HTTP_304_CACHE') ? 's3' : 'web';
            
            if (parsedData.source === 'S3_CACHE' || parsedData.source === 'HTTP_304_CACHE') {
                results.s3CacheHits++;
            }

            // Check for error responses that look like valid data
            if (isErrorResponse(parsedData)) {
                const actualErrorMessage = parsedData.errorMessage || parsedData.error || parsedData.name || 'Unknown error';
                console.warn(`[ScrapingEngine] Error response for ID ${currentId}: ${actualErrorMessage}`);
                results.errors++;
                results.consecutiveErrors++;
                results.consecutiveNotFound = 0;
                results.consecutiveBlanks = 0;
                
                if (!results.lastErrorMessage || results.lastErrorMessage === 'Consecutive scraper errors') {
                    results.lastErrorMessage = actualErrorMessage;
                }
                
                publishGameProcessedEvent(jobId, entityId, currentId, url, {
                    action: 'ERROR',
                    message: actualErrorMessage,
                    errorMessage: actualErrorMessage,
                    durationMs: Date.now() - gameStartTime,
                    dataSource: dataSource,
                    s3Key: parsedData.s3Key || null,
                    parsedData: {
                        gameStatus: 'UNKNOWN',
                        name: parsedData.name,
                        doNotScrape: parsedData.doNotScrape,
                    },
                    saveResult: null,
                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                
                if (results.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                    console.log(`[ScrapingEngine] ERRORS threshold reached: ${results.consecutiveErrors}`);
                    results.stopReason = STOP_REASON.ERROR;
                    if (!results.lastErrorMessage) {
                        results.lastErrorMessage = `Consecutive errors (${results.consecutiveErrors})`;
                    }
                    break;
                }
                
                if (results.errors >= MAX_TOTAL_ERRORS) {
                    console.log(`[ScrapingEngine] TOTAL ERRORS threshold reached: ${results.errors}`);
                    results.stopReason = STOP_REASON.ERROR;
                    if (!results.lastErrorMessage) {
                        results.lastErrorMessage = `Total errors exceeded: ${results.errors}`;
                    }
                    break;
                }
                
                currentId++;
                continue;
            }

            // ═══════════════════════════════════════════════════════════════
            // UPDATED v1.3.0: Separate handling for NOT_FOUND vs NOT_PUBLISHED
            // ═══════════════════════════════════════════════════════════════
            
            const isNotFound = isNotFoundResponse(parsedData);
            const isNotPublished = isNotPublishedResponse(parsedData);
            const isUnknownError = isUnknownErrorResponse(parsedData);
            
            if (isNotFound || isUnknownError) {
                // ─────────────────────────────────────────────────────────────
                // NOT_FOUND / NOT_IN_USE / UNKNOWN: Empty slot or error
                // INCREMENT consecutive counters - can stop scraper
                // These are gaps that need frequent re-checking
                // ScrapeURL: doNotScrape = false (set by fetch-handler)
                // ─────────────────────────────────────────────────────────────
                results.consecutiveBlanks++;
                results.consecutiveNotFound++;
                results.blanks++;
                results.notFoundCount++;
                results.consecutiveErrors = 0;
                
                console.log(`[ScrapingEngine] ID ${currentId}: ${parsedData.gameStatus} (consecutive: ${results.consecutiveNotFound}/${MAX_CONSECUTIVE_NOT_FOUND})`);
                
                publishGameProcessedEvent(jobId, entityId, currentId, url, {
                    action: 'NOT_FOUND',
                    message: parsedData.gameStatus || 'Not Found',
                    durationMs: Date.now() - gameStartTime,
                    dataSource: dataSource,
                    s3Key: parsedData.s3Key,
                    parsedData: { gameStatus: parsedData.gameStatus },
                    saveResult: null,
                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                
                // Check thresholds - these SHOULD stop for consecutive NOT_FOUNDs
                if (results.consecutiveNotFound >= MAX_CONSECUTIVE_NOT_FOUND && mode !== 'gaps') {
                    console.log(`[ScrapingEngine] NOT_FOUND threshold reached: ${results.consecutiveNotFound}`);
                    results.stopReason = STOP_REASON.NOT_FOUND;
                    break;
                }
                
                if (results.consecutiveBlanks >= MAX_CONSECUTIVE_BLANKS && mode !== 'gaps') {
                    console.log(`[ScrapingEngine] BLANKS threshold reached: ${results.consecutiveBlanks}`);
                    results.stopReason = STOP_REASON.BLANKS;
                    break;
                }
                
            } else if (isNotPublished) {
                // ─────────────────────────────────────────────────────────────
                // NOT_PUBLISHED: Real tournament, just hidden
                // RESET consecutive counters - treat like a found game!
                // Does NOT stop the scraper - continue to next ID
                // NO Game table save - ScrapeURL tracks this
                // ScrapeURL: doNotScrape = true (set by fetch-handler)
                // ─────────────────────────────────────────────────────────────
                results.consecutiveErrors = 0;
                results.consecutiveBlanks = 0;      // RESET - this is a real tournament
                results.consecutiveNotFound = 0;    // RESET - this is a real tournament
                results.notPublishedCount++;
                
                console.log(`[ScrapingEngine] ID ${currentId}: NOT_PUBLISHED (counters reset, no Game save)`);
                
                publishGameProcessedEvent(jobId, entityId, currentId, url, {
                    action: 'NOT_PUBLISHED',
                    message: 'Tournament not published (tracked in ScrapeURL)',
                    durationMs: Date.now() - gameStartTime,
                    dataSource: dataSource,
                    s3Key: parsedData.s3Key,
                    parsedData: { gameStatus: 'NOT_PUBLISHED' },
                    saveResult: null,  // No Game save for NOT_PUBLISHED
                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                
                // Continue to next ID - do NOT save to Game table
                
            } else {
                // ─────────────────────────────────────────────────────────────
                // Valid published game data - existing handling
                // ─────────────────────────────────────────────────────────────
                results.consecutiveBlanks = 0;
                results.consecutiveNotFound = 0;
                results.consecutiveErrors = 0;
                
                // Save if enabled
                if (options.saveToDatabase !== false) {
                    const venueId = parsedData.venueMatch?.autoAssignedVenue?.id || options.defaultVenueId;
                    
                    if (!venueId) {
                        console.warn(`[ScrapingEngine] No venue for ID ${currentId}, skipping save`);
                        results.gamesSkipped++;
                        
                        publishGameProcessedEvent(jobId, entityId, currentId, url, {
                            action: 'SKIPPED',
                            message: 'No venue available',
                            durationMs: Date.now() - gameStartTime,
                            dataSource: dataSource,
                            s3Key: parsedData.s3Key,
                            parsedData: parsedData,
                            saveResult: null,
                        }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                        
                    } else if (!parsedData.gameStartDateTime) {
                        console.warn(`[ScrapingEngine] No gameStartDateTime for ID ${currentId}, skipping save`);
                        results.gamesSkipped++;
                        
                        publishGameProcessedEvent(jobId, entityId, currentId, url, {
                            action: 'SKIPPED',
                            message: 'No gameStartDateTime',
                            durationMs: Date.now() - gameStartTime,
                            dataSource: dataSource,
                            s3Key: parsedData.s3Key,
                            parsedData: parsedData,
                            saveResult: null,
                        }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                        
                    } else if (!parsedData.name) {
                        console.warn(`[ScrapingEngine] No name for ID ${currentId}, skipping save`);
                        results.gamesSkipped++;
                        
                        publishGameProcessedEvent(jobId, entityId, currentId, url, {
                            action: 'SKIPPED',
                            message: 'No game name',
                            durationMs: Date.now() - gameStartTime,
                            dataSource: dataSource,
                            s3Key: parsedData.s3Key,
                            parsedData: parsedData,
                            saveResult: null,
                        }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                        
                    } else {
                        try {
                            const saveInput = buildSaveInput(entityId, url, parsedData, venueId);
                            
                            const saveResult = await withRetry(async () => {
                                return await callGraphQL(SAVE_TOURNAMENT_DATA, {
                                    input: saveInput
                                });
                            }, 3, 500);
                            
                            if (saveResult?.enrichGameData?.success) {
                                const action = saveResult.enrichGameData.saveResult?.action;
                                if (action === 'CREATED') {
                                    results.newGamesScraped++;
                                } else if (action === 'UPDATED') {
                                    results.gamesUpdated++;
                                } else {
                                    results.gamesSkipped++;
                                }
                                
                                publishGameProcessedEvent(jobId, entityId, currentId, url, {
                                    action: action || 'SKIPPED',
                                    message: `${action || 'Processed'}: ${saveResult.enrichGameData.saveResult?.gameId?.slice(0, 8) || 'unknown'}`,
                                    durationMs: Date.now() - gameStartTime,
                                    dataSource: dataSource,
                                    s3Key: parsedData.s3Key,
                                    parsedData: parsedData,
                                    saveResult: {
                                        success: true,
                                        gameId: saveResult.enrichGameData.saveResult?.gameId,
                                        action: action,
                                        message: saveResult.enrichGameData.saveResult?.message,
                                    },
                                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                                
                            } else {
                                const errorMsg = saveResult?.enrichGameData?.saveResult?.message || 
                                    saveResult?.enrichGameData?.validation?.errors?.[0]?.message ||
                                    'Enrichment failed';
                                console.warn(`[ScrapingEngine] Enrichment failed for ID ${currentId}: ${errorMsg}`);
                                results.gamesSkipped++;
                                
                                publishGameProcessedEvent(jobId, entityId, currentId, url, {
                                    action: 'SKIPPED',
                                    message: errorMsg,
                                    durationMs: Date.now() - gameStartTime,
                                    dataSource: dataSource,
                                    s3Key: parsedData.s3Key,
                                    parsedData: parsedData,
                                    saveResult: null,
                                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                            }
                        } catch (saveError) {
                            console.error(`[ScrapingEngine] Save error for ID ${currentId}:`, saveError);
                            results.errors++;
                            
                            publishGameProcessedEvent(jobId, entityId, currentId, url, {
                                action: 'ERROR',
                                message: 'Save error',
                                errorMessage: saveError.message,
                                durationMs: Date.now() - gameStartTime,
                                dataSource: dataSource,
                                s3Key: parsedData.s3Key,
                                parsedData: parsedData,
                                saveResult: null,
                            }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                        }
                    }
                }
            }
            
        } catch (error) {
            const errorMessage = error.message || String(error);
            console.error(`[ScrapingEngine] Error at ID ${currentId}:`, errorMessage);
            
            // SPECIAL HANDLING: GraphQL enum serialization errors for gameStatus
            const isEnumError = errorMessage.includes("Invalid input for Enum 'GameStatus'") ||
                                (errorMessage.includes("Can't serialize value") && errorMessage.includes("gameStatus"));
            
            if (isEnumError) {
                // Treat enum errors as NOT_PUBLISHED - reset counters, no save
                console.log(`[ScrapingEngine] ID ${currentId}: GameStatus enum error - treating as NOT_PUBLISHED`);
                results.notPublishedCount++;
                results.consecutiveBlanks = 0;
                results.consecutiveNotFound = 0;
                results.consecutiveErrors = 0;
                
                publishGameProcessedEvent(jobId, entityId, currentId, url, {
                    action: 'NOT_PUBLISHED',
                    message: 'NOT_PUBLISHED (enum serialization)',
                    durationMs: Date.now() - gameStartTime,
                    dataSource: 'web',
                    parsedData: { gameStatus: 'NOT_PUBLISHED' },
                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
            } else {
                // Regular error handling
                results.errors++;
                results.consecutiveErrors++;
                results.consecutiveBlanks = 0;
                results.consecutiveNotFound = 0;
                
                if (!results.lastErrorMessage) {
                    results.lastErrorMessage = errorMessage;
                }
                
                publishGameProcessedEvent(jobId, entityId, currentId, url, {
                    action: 'ERROR',
                    message: 'Processing error',
                    errorMessage: errorMessage,
                    durationMs: Date.now() - gameStartTime,
                    dataSource: 'none',
                    s3Key: null,
                    parsedData: null,
                    saveResult: null,
                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                
                if (results.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                    console.log(`[ScrapingEngine] ERRORS threshold reached: ${results.consecutiveErrors}`);
                    results.stopReason = STOP_REASON.ERROR;
                    break;
                }
                
                if (results.errors >= MAX_TOTAL_ERRORS) {
                    console.log(`[ScrapingEngine] TOTAL ERRORS threshold reached: ${results.errors}`);
                    results.stopReason = STOP_REASON.ERROR;
                    results.lastErrorMessage = `Total errors exceeded: ${results.errors}`;
                    break;
                }
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // UPDATED v1.4.0: Publish progress to BOTH DynamoDB AND subscription
        // ═══════════════════════════════════════════════════════════════
        if (results.totalProcessed % PROGRESS_UPDATE_FREQUENCY === 0) {
            // Update DynamoDB (existing behavior)
            await updateScraperJob(jobId, {
                totalURLsProcessed: results.totalProcessed,
                currentId: currentId,
                newGamesScraped: results.newGamesScraped,
                gamesUpdated: results.gamesUpdated,
                gamesSkipped: results.gamesSkipped,
                errors: results.errors,
                notFoundCount: results.notFoundCount,
                blanks: results.blanks,
                s3CacheHits: results.s3CacheHits,
                consecutiveNotFound: results.consecutiveNotFound,
                consecutiveErrors: results.consecutiveErrors,
                consecutiveBlanks: results.consecutiveBlanks,
            });
            
            // NEW v1.4.0: Publish to real-time subscription for live UI updates
            if (onProgress) {
                try {
                    const progressStats = buildProgressStats(results, startTime);
                    await onProgress(progressStats, currentId);
                    console.log(`[ScrapingEngine] Progress published: ${results.totalProcessed} processed, ID ${currentId}`);
                } catch (progressError) {
                    // Don't fail the job if progress publishing fails
                    console.warn(`[ScrapingEngine] Progress publish failed:`, progressError.message);
                }
            }
        }

        currentId++;
    }
    
    // Update scraper state
    await updateScraperState(scraperState.id, {
        lastScannedId: results.lastProcessedId,
        consecutiveBlankCount: results.consecutiveBlanks,
        consecutiveNotFoundCount: results.consecutiveNotFound,
        totalScraped: (scraperState.totalScraped || 0) + results.newGamesScraped,
        totalErrors: (scraperState.totalErrors || 0) + results.errors
    });
    
    if (prefetchCache) {
        console.log(`[ScrapingEngine] Prefetch stats:`, prefetchCache.getStats());
    }
    
    console.log(`[ScrapingEngine] Processing loop finished:`, {
        lastCurrentId: results.lastProcessedId,
        targetEndId: endId,
        stopReason: results.stopReason,
        totalProcessed: results.totalProcessed,
        newGamesScraped: results.newGamesScraped,
        gamesUpdated: results.gamesUpdated,
        gamesSkipped: results.gamesSkipped,
        errors: results.errors,
        blanks: results.blanks,
        notPublishedCount: results.notPublishedCount,
    });
    
    return results;
}

// ===================================================================
// GAP PROCESSING
// ===================================================================

/**
 * Process specific gap IDs (with event streaming)
 * 
 * UPDATED v1.4.0: Added onProgress callback for real-time stats
 * UPDATED v1.3.0: Separate NOT_FOUND vs NOT_PUBLISHED handling
 */
async function processGapIds(entityId, jobId, gapIds, options, startTime, ctx) {
    const {
        callGraphQL,
        getEntity,
        buildTournamentUrl,
        updateScraperJob,
        publishGameProcessedEvent,
        STOP_REASON,
        PROGRESS_UPDATE_FREQUENCY,
        DEFAULT_MAX_CONSECUTIVE_ERRORS = 3,
        DEFAULT_MAX_TOTAL_ERRORS = 15,
        // NEW v1.4.0: Real-time progress callback
        onProgress
    } = ctx;
    
    const MAX_CONSECUTIVE_ERRORS = options.maxConsecutiveErrors || DEFAULT_MAX_CONSECUTIVE_ERRORS;
    const MAX_TOTAL_ERRORS = options.maxTotalErrors || DEFAULT_MAX_TOTAL_ERRORS;
    
    console.log(`[ScrapingEngine] Processing ${gapIds.length} gap IDs`);
    
    const entity = await getEntity(entityId);
    console.log(`[ScrapingEngine] Entity: ${entity.entityName}, URL pattern: ${entity.gameUrlDomain}${entity.gameUrlPath}{id}`);
    
    const results = {
        totalProcessed: 0,
        newGamesScraped: 0,
        gamesUpdated: 0,
        gamesSkipped: 0,
        errors: 0,
        blanks: 0,
        notFoundCount: 0,
        s3CacheHits: 0,
        consecutiveBlanks: 0,
        consecutiveNotFound: 0,
        consecutiveErrors: 0,
        stopReason: STOP_REASON.COMPLETED,
        lastErrorMessage: null,
        notPublishedCount: 0,
    };
    
    for (const tournamentId of gapIds) {
        const gameStartTime = Date.now();
        const url = await buildTournamentUrl(entityId, tournamentId);
        
        results.totalProcessed++;
        results.currentId = tournamentId;
        
        try {
            const fetchData = await withRetry(async () => {
                return await callGraphQL(FETCH_TOURNAMENT_DATA, {
                    url: url,
                    forceRefresh: options.forceRefresh || false,
                    entityId: entityId,
                    scraperApiKey: options.scraperApiKey || null
                });
            }, 3, 500);
            const parsedData = fetchData.fetchTournamentData;
            
            const dataSource = (parsedData.source === 'S3_CACHE' || parsedData.source === 'HTTP_304_CACHE') ? 's3' : 'web';
            
            if (parsedData.source === 'S3_CACHE' || parsedData.source === 'HTTP_304_CACHE') {
                results.s3CacheHits++;
            }
            
            // Check for error responses
            if (isErrorResponse(parsedData)) {
                const actualErrorMessage = parsedData.errorMessage || parsedData.error || parsedData.name || 'Unknown error';
                console.warn(`[ScrapingEngine] Gap error response for ID ${tournamentId}: ${actualErrorMessage}`);
                results.errors++;
                results.consecutiveErrors++;
                results.consecutiveBlanks = 0;
                results.consecutiveNotFound = 0;
                
                if (!results.lastErrorMessage) {
                    results.lastErrorMessage = actualErrorMessage;
                }
                
                publishGameProcessedEvent(jobId, entityId, tournamentId, url, {
                    action: 'ERROR',
                    message: actualErrorMessage,
                    errorMessage: actualErrorMessage,
                    durationMs: Date.now() - gameStartTime,
                    dataSource: dataSource,
                    parsedData: { gameStatus: 'UNKNOWN' },
                    saveResult: null,
                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                
                if (results.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                    results.stopReason = STOP_REASON.ERROR;
                    break;
                }
                continue;
            }
            
            const isNotFound = isNotFoundResponse(parsedData);
            const isNotPublished = isNotPublishedResponse(parsedData);
            
            if (isNotFound) {
                results.blanks++;
                results.notFoundCount++;
                results.consecutiveBlanks++;
                results.consecutiveNotFound++;
                results.consecutiveErrors = 0;
                
                console.log(`[ScrapingEngine] Gap ID ${tournamentId}: ${parsedData.gameStatus}`);
                
                publishGameProcessedEvent(jobId, entityId, tournamentId, url, {
                    action: 'NOT_FOUND',
                    message: parsedData.gameStatus || 'Not Found',
                    durationMs: Date.now() - gameStartTime,
                    dataSource: dataSource,
                    s3Key: parsedData.s3Key,
                    parsedData: { gameStatus: parsedData.gameStatus },
                    saveResult: null,
                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                
            } else if (isNotPublished) {
                results.notPublishedCount++;
                results.consecutiveBlanks = 0;
                results.consecutiveNotFound = 0;
                results.consecutiveErrors = 0;
                
                console.log(`[ScrapingEngine] Gap ID ${tournamentId}: NOT_PUBLISHED (counters reset)`);
                
                publishGameProcessedEvent(jobId, entityId, tournamentId, url, {
                    action: 'NOT_PUBLISHED',
                    message: 'Tournament not published',
                    durationMs: Date.now() - gameStartTime,
                    dataSource: dataSource,
                    s3Key: parsedData.s3Key,
                    parsedData: { gameStatus: 'NOT_PUBLISHED' },
                    saveResult: null,
                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                
            } else if (options.saveToDatabase !== false) {
                // Valid game - reset counters and save
                results.consecutiveErrors = 0;
                results.consecutiveBlanks = 0;
                results.consecutiveNotFound = 0;
                
                const venueId = parsedData.venueMatch?.autoAssignedVenue?.id || options.defaultVenueId;
                
                if (!venueId) {
                    console.warn(`[ScrapingEngine] Gap ID ${tournamentId}: No venue, skipping`);
                    results.gamesSkipped++;
                    
                    publishGameProcessedEvent(jobId, entityId, tournamentId, url, {
                        action: 'SKIPPED',
                        message: 'No venue available',
                        durationMs: Date.now() - gameStartTime,
                        dataSource: dataSource,
                        parsedData: parsedData,
                    }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                    
                } else if (!parsedData.gameStartDateTime) {
                    console.warn(`[ScrapingEngine] Gap ID ${tournamentId}: No gameStartDateTime, skipping`);
                    results.gamesSkipped++;
                    
                    publishGameProcessedEvent(jobId, entityId, tournamentId, url, {
                        action: 'SKIPPED',
                        message: 'No gameStartDateTime',
                        durationMs: Date.now() - gameStartTime,
                        dataSource: dataSource,
                        parsedData: parsedData,
                    }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                    
                } else if (!parsedData.name) {
                    console.warn(`[ScrapingEngine] Gap ID ${tournamentId}: No name, skipping`);
                    results.gamesSkipped++;
                    
                    publishGameProcessedEvent(jobId, entityId, tournamentId, url, {
                        action: 'SKIPPED',
                        message: 'No game name',
                        durationMs: Date.now() - gameStartTime,
                        dataSource: dataSource,
                        parsedData: parsedData,
                    }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                    
                } else {
                    const saveInput = buildSaveInput(entityId, url, parsedData, venueId);
                    
                    const saveResult = await withRetry(async () => {
                        return await callGraphQL(SAVE_TOURNAMENT_DATA, { input: saveInput });
                    }, 3, 500);
                    
                    if (saveResult?.enrichGameData?.success) {
                        const action = saveResult.enrichGameData.saveResult?.action;
                        if (action === 'CREATED') {
                            results.newGamesScraped++;
                        } else if (action === 'UPDATED') {
                            results.gamesUpdated++;
                        } else {
                            results.gamesSkipped++;
                        }
                        
                        publishGameProcessedEvent(jobId, entityId, tournamentId, url, {
                            action: action || 'SKIPPED',
                            message: `${action || 'Processed'}: ${saveResult.enrichGameData.saveResult?.gameId?.slice(0, 8) || 'unknown'}`,
                            durationMs: Date.now() - gameStartTime,
                            dataSource: dataSource,
                            s3Key: parsedData.s3Key,
                            parsedData: parsedData,
                            saveResult: {
                                success: true,
                                gameId: saveResult.enrichGameData.saveResult?.gameId,
                                action: action,
                                message: saveResult.enrichGameData.saveResult?.message,
                            },
                        }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                        
                    } else {
                        console.warn(`[ScrapingEngine] Gap enrichment failed for ID ${tournamentId}`);
                        results.gamesSkipped++;
                        
                        publishGameProcessedEvent(jobId, entityId, tournamentId, url, {
                            action: 'SKIPPED',
                            message: 'Enrichment failed',
                            durationMs: Date.now() - gameStartTime,
                            dataSource: dataSource,
                            parsedData: parsedData,
                        }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                    }
                }
            }
            
        } catch (error) {
            const errorMessage = error.message || String(error);
            console.error(`[ScrapingEngine] Gap error at ID ${tournamentId}:`, errorMessage);
            
            const isEnumError = errorMessage.includes("Invalid input for Enum 'GameStatus'") ||
                                (errorMessage.includes("Can't serialize value") && errorMessage.includes("gameStatus"));
            
            if (isEnumError) {
                console.log(`[ScrapingEngine] Gap ID ${tournamentId}: GameStatus enum error - treating as NOT_PUBLISHED`);
                results.notPublishedCount++;
                results.consecutiveBlanks = 0;
                results.consecutiveNotFound = 0;
                results.consecutiveErrors = 0;
                
                publishGameProcessedEvent(jobId, entityId, tournamentId, url, {
                    action: 'NOT_PUBLISHED',
                    message: 'NOT_PUBLISHED (enum serialization)',
                    durationMs: Date.now() - gameStartTime,
                    dataSource: 'web',
                    parsedData: { gameStatus: 'NOT_PUBLISHED' },
                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
            } else {
                results.errors++;
                results.consecutiveErrors++;
                results.consecutiveBlanks = 0;
                results.consecutiveNotFound = 0;
                
                if (!results.lastErrorMessage) {
                    results.lastErrorMessage = errorMessage;
                }
                
                publishGameProcessedEvent(jobId, entityId, tournamentId, url, {
                    action: 'ERROR',
                    message: errorMessage,
                    errorMessage: errorMessage,
                    durationMs: Date.now() - gameStartTime,
                    dataSource: 'none',
                    parsedData: null,
                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                
                if (results.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                    console.log(`[ScrapingEngine] Gap processing: ERRORS threshold reached: ${results.consecutiveErrors}`);
                    results.stopReason = STOP_REASON.ERROR;
                    break;
                }
                
                if (results.errors >= MAX_TOTAL_ERRORS) {
                    console.log(`[ScrapingEngine] Gap processing: TOTAL ERRORS threshold reached: ${results.errors}`);
                    results.stopReason = STOP_REASON.ERROR;
                    break;
                }
            }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // UPDATED v1.4.0: Publish progress to BOTH DynamoDB AND subscription
        // ═══════════════════════════════════════════════════════════════
        if (results.totalProcessed % PROGRESS_UPDATE_FREQUENCY === 0) {
            // Update DynamoDB (existing behavior)
            await updateScraperJob(jobId, {
                totalURLsProcessed: results.totalProcessed,
                currentId: tournamentId,
                newGamesScraped: results.newGamesScraped,
                errors: results.errors,
                notFoundCount: results.notFoundCount,
            });
            
            // NEW v1.4.0: Publish to real-time subscription for live UI updates
            if (onProgress) {
                try {
                    const progressStats = buildProgressStats(results, startTime);
                    await onProgress(progressStats, tournamentId);
                    console.log(`[ScrapingEngine] Gap progress published: ${results.totalProcessed} processed, ID ${tournamentId}`);
                } catch (progressError) {
                    console.warn(`[ScrapingEngine] Gap progress publish failed:`, progressError.message);
                }
            }
        }
    }
    
    console.log(`[ScrapingEngine] Gap processing finished:`, {
        totalProcessed: results.totalProcessed,
        newGamesScraped: results.newGamesScraped,
        gamesUpdated: results.gamesUpdated,
        notFoundCount: results.notFoundCount,
        notPublishedCount: results.notPublishedCount,
        errors: results.errors,
        stopReason: results.stopReason,
    });
    
    return results;
}

module.exports = {
    performScrapingEnhanced,
    processGapIds,
    // Export helpers for testing
    isNotFoundResponse,
    isNotPublishedResponse,
    isUnknownErrorResponse,
    isErrorResponse,
    shouldSkipNotPublished,
    shouldSkipNotFoundGap,
    extractPlayerData,
    buildSaveInput,
    // NEW v1.4.0: Export for testing
    buildProgressStats
};