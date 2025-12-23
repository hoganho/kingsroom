/**
 * Scraping Engine
 * 
 * Core scraping logic extracted from index.js for maintainability.
 * Handles bulk scraping, gap processing, and event streaming.
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

function isNotFoundResponse(parsedData) {
    if (!parsedData) return false;
    const status = parsedData.gameStatus;
    return status === 'NOT_FOUND' || status === 'NOT_IN_USE' || status === 'NOT_PUBLISHED';
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
    if (!parsedData) return undefined;
    
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
    
    return {
        allPlayers,
        totalUniquePlayers: allPlayers.length,
        totalInitialEntries: parsedData.totalInitialEntries || allPlayers.length,
        totalRebuys: parsedData.totalRebuys || 0,
        totalAddons: parsedData.totalAddons || 0
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
            autoCreateRecurring: false
        }
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
        DEFAULT_MAX_TOTAL_ERRORS
    } = ctx;
    
    const startTime = Date.now();
    
    // Extract thresholds from options (passed from scraperManagement) with defaults
    const MAX_CONSECUTIVE_NOT_FOUND = options.maxConsecutiveNotFound || DEFAULT_MAX_CONSECUTIVE_NOT_FOUND;
    const MAX_CONSECUTIVE_ERRORS = options.maxConsecutiveErrors || DEFAULT_MAX_CONSECUTIVE_ERRORS;
    const MAX_CONSECUTIVE_BLANKS = options.maxConsecutiveBlanks || DEFAULT_MAX_CONSECUTIVE_BLANKS;
    const MAX_TOTAL_ERRORS = options.maxTotalErrors || DEFAULT_MAX_TOTAL_ERRORS;
    
    console.log(`[ScrapingEngine] Using thresholds: NOT_FOUND=${MAX_CONSECUTIVE_NOT_FOUND}, ERRORS=${MAX_CONSECUTIVE_ERRORS}, BLANKS=${MAX_CONSECUTIVE_BLANKS}, TOTAL_ERRORS=${MAX_TOTAL_ERRORS}`);
    
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
        currentId: null,
        lastProcessedId: scraperState.lastScannedId,
        stopReason: STOP_REASON.COMPLETED,
        lastErrorMessage: null,
    };
    
    // Determine ID range based on mode
    let currentId, endId;
    const mode = options.mode || 'bulk';
    
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
            currentId = scraperState.lastScannedId + 1;
            endId = options.maxId || currentId + 10000;
            break;
        case 'gaps':
        case 'multiId':
            // Special handling below - uses gapIds array
            break;
        case 'refresh':
            // TODO: Implement refresh mode
            break;
        default:
            currentId = scraperState.lastScannedId + 1;
            endId = currentId + (options.maxGames || 100);
    }
    
    const maxId = options.maxId || null;
    
    // Handle gaps/multiId mode specially - both use the gapIds array
    if ((mode === 'gaps' || mode === 'multiId') && options.gapIds?.length > 0) {
        return await processGapIds(entityId, jobId, options.gapIds, options, startTime, ctx);
    }
    
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
        
        // Check timeout
        if (Date.now() - startTime > (LAMBDA_TIMEOUT - LAMBDA_TIMEOUT_BUFFER)) {
            console.log(`[ScrapingEngine] Approaching timeout at ID ${currentId}`);
            results.stopReason = STOP_REASON.TIMEOUT;
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
                        action: 'NOT_PUBLISHED',
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
                        action: 'NOT_FOUND',
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
            // Fetch via AppSync
            const fetchData = await callGraphQL(FETCH_TOURNAMENT_DATA, {
                url: url,
                forceRefresh: options.forceRefresh || false,
                entityId: entityId
            });
            const parsedData = fetchData.fetchTournamentData;

            // Determine data source for event
            const dataSource = (parsedData.source === 'S3_CACHE' || parsedData.source === 'HTTP_304_CACHE') ? 's3' : 'web';
            
            if (parsedData.source === 'S3_CACHE' || parsedData.source === 'HTTP_304_CACHE') {
                results.s3CacheHits++;
            }

            // Check for error responses that look like valid data
            if (isErrorResponse(parsedData)) {
                console.warn(`[ScrapingEngine] Error response for ID ${currentId}: ${parsedData.errorMessage || parsedData.name || 'Unknown error'}`);
                results.errors++;
                results.consecutiveErrors++;
                results.consecutiveNotFound = 0;
                results.consecutiveBlanks = 0;
                
                publishGameProcessedEvent(jobId, entityId, currentId, url, {
                    action: 'ERROR',
                    message: 'Scraper returned error',
                    errorMessage: parsedData.errorMessage || parsedData.name || 'Error processing tournament',
                    durationMs: Date.now() - gameStartTime,
                    dataSource: dataSource,
                    s3Key: parsedData.s3Key || null,
                    parsedData: {
                        gameStatus: 'ERROR',
                        name: parsedData.name,
                        doNotScrape: parsedData.doNotScrape,
                    },
                    saveResult: null,
                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                
                if (results.consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                    console.log(`[ScrapingEngine] ERRORS threshold reached: ${results.consecutiveErrors}`);
                    results.stopReason = STOP_REASON.ERROR;
                    results.lastErrorMessage = 'Consecutive scraper errors';
                    break;
                }
                
                if (results.errors >= MAX_TOTAL_ERRORS) {
                    console.log(`[ScrapingEngine] TOTAL ERRORS threshold reached: ${results.errors}`);
                    results.stopReason = STOP_REASON.ERROR;
                    results.lastErrorMessage = `Total errors exceeded: ${results.errors}`;
                    break;
                }
                
                currentId++;
                continue;
            }

            // Check response type
            const isNotFound = isNotFoundResponse(parsedData);
            
            if (isNotFound) {
                results.consecutiveBlanks++;
                results.consecutiveNotFound++;
                results.blanks++;
                results.notFoundCount++;
                results.consecutiveErrors = 0;
                
                console.log(`[ScrapingEngine] ID ${currentId}: ${parsedData.gameStatus} (consecutive: ${results.consecutiveNotFound}/${MAX_CONSECUTIVE_NOT_FOUND})`);
                
                publishGameProcessedEvent(jobId, entityId, currentId, url, {
                    action: parsedData.gameStatus === 'NOT_PUBLISHED' ? 'NOT_PUBLISHED' : 'NOT_FOUND',
                    message: parsedData.gameStatus || 'Not Found',
                    durationMs: Date.now() - gameStartTime,
                    dataSource: dataSource,
                    s3Key: parsedData.s3Key,
                    parsedData: { gameStatus: parsedData.gameStatus },
                    saveResult: null,
                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                
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
                
            } else {
                // Valid game data
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
                            
                            const saveResult = await callGraphQL(SAVE_TOURNAMENT_DATA, {
                                input: saveInput
                            });
                            
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
                } else {
                    // Scrape-only mode
                    results.newGamesScraped++;
                    
                    publishGameProcessedEvent(jobId, entityId, currentId, url, {
                        action: 'CREATED',
                        message: 'Scraped (not saved)',
                        durationMs: Date.now() - gameStartTime,
                        dataSource: dataSource,
                        s3Key: parsedData.s3Key,
                        parsedData: parsedData,
                        saveResult: null,
                    }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                }
            }
            
        } catch (error) {
            console.error(`[ScrapingEngine] Error at ID ${currentId}:`, error.message);
            results.errors++;
            results.consecutiveErrors++;
            results.lastErrorMessage = error.message;
            
            results.consecutiveNotFound = 0;
            results.consecutiveBlanks = 0;
            
            publishGameProcessedEvent(jobId, entityId, currentId, url, {
                action: 'ERROR',
                message: 'Processing error',
                errorMessage: error.message,
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

        // Publish progress update to job record
        if (results.totalProcessed % PROGRESS_UPDATE_FREQUENCY === 0) {
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
    });
    
    return results;
}

// ===================================================================
// GAP PROCESSING
// ===================================================================

/**
 * Process specific gap IDs (with event streaming)
 */
async function processGapIds(entityId, jobId, gapIds, options, startTime, ctx) {
    const {
        callGraphQL,
        getEntity,
        buildTournamentUrl,
        updateScraperJob,
        publishGameProcessedEvent,
        STOP_REASON,
        PROGRESS_UPDATE_FREQUENCY
    } = ctx;
    
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
        consecutiveErrors: 0,
        // FIXED: Added missing fields that executeJob expects
        consecutiveBlanks: 0,
        consecutiveNotFound: 0,
        stopReason: STOP_REASON.COMPLETED,
        lastErrorMessage: null,
        lastProcessedId: null
    };
    
    for (const tournamentId of gapIds) {
        const gameStartTime = Date.now();
        const url = await buildTournamentUrl(entityId, tournamentId);
        results.totalProcessed++;
        results.lastProcessedId = tournamentId;
        
        try {
            const fetchData = await callGraphQL(FETCH_TOURNAMENT_DATA, {
                url: url,
                forceRefresh: options.forceRefresh || false,
                entityId: entityId
            });
            const parsedData = fetchData.fetchTournamentData;
            
            const dataSource = (parsedData.source === 'S3_CACHE' || parsedData.source === 'HTTP_304_CACHE') ? 's3' : 'web';
            
            if (parsedData.source === 'S3_CACHE' || parsedData.source === 'HTTP_304_CACHE') {
                results.s3CacheHits++;
            }
            
            if (isNotFoundResponse(parsedData)) {
                results.notFoundCount++;
                results.blanks++;
                
                publishGameProcessedEvent(jobId, entityId, tournamentId, url, {
                    action: parsedData.gameStatus === 'NOT_PUBLISHED' ? 'NOT_PUBLISHED' : 'NOT_FOUND',
                    message: parsedData.gameStatus || 'Not Found',
                    durationMs: Date.now() - gameStartTime,
                    dataSource: dataSource,
                    s3Key: parsedData.s3Key,
                    parsedData: { gameStatus: parsedData.gameStatus },
                    saveResult: null,
                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                
            } else if (options.saveToDatabase !== false) {
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
                    
                    const saveResult = await callGraphQL(SAVE_TOURNAMENT_DATA, { input: saveInput });
                    
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
            
            results.consecutiveErrors = 0;
            
        } catch (error) {
            console.error(`[ScrapingEngine] Gap error at ID ${tournamentId}:`, error.message);
            results.errors++;
            results.consecutiveErrors++;
            
            publishGameProcessedEvent(jobId, entityId, tournamentId, url, {
                action: 'ERROR',
                message: 'Processing error',
                errorMessage: error.message,
                durationMs: Date.now() - gameStartTime,
                dataSource: 'none',
                parsedData: null,
            }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
        }
        
        // Progress update
        if (results.totalProcessed % PROGRESS_UPDATE_FREQUENCY === 0) {
            await updateScraperJob(jobId, {
                totalURLsProcessed: results.totalProcessed,
                currentId: tournamentId,
                newGamesScraped: results.newGamesScraped,
                errors: results.errors,
                notFoundCount: results.notFoundCount,
            });
        }
    }
    
    return results;
}

module.exports = {
    performScrapingEnhanced,
    processGapIds,
    // Export helpers for testing
    isNotFoundResponse,
    isErrorResponse,
    shouldSkipNotPublished,
    shouldSkipNotFoundGap,
    extractPlayerData,
    buildSaveInput
};