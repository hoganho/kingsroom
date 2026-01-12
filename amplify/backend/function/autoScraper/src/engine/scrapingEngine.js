/**
 * Scraping Engine
 * 
 * Core scraping logic extracted from index.js for maintainability.
 * Handles bulk scraping, gap processing, and event streaming.
 * 
 * VERSION: 1.10.1
 * 
 * UPDATED v1.10.1:
 * - FIX: Only force refresh for NOT_FOUND gaps, not all gaps (prevents Lambda timeout)
 *   - v1.10.0 forced web refresh for ALL gaps when skipNotFoundGaps=false
 *   - This caused Lambda timeouts when processing many gaps (305 gaps × 3.7s = 19 min)
 *   - Now uses prefetch cache to check each gap's ScrapeURL status
 *   - NOT_FOUND/BLANK/NOT_IN_USE -> force refresh (S3 has useless "not found" HTML)
 *   - NOT_PUBLISHED -> use S3 cache (valid data, ~200ms vs ~3s)
 *
 * UPDATED v1.10.0:
 * - FIX: NOT_FOUND gaps now bypass S3 cache when skipNotFoundGaps=false
 *   - When re-scraping NOT_FOUND gaps, S3 cache contains useless "not found" HTML
 *   - New isNotFoundGapStatus() helper to detect NOT_FOUND/BLANK/NOT_IN_USE in ScrapeURL
 *   - Sets forceRefresh=true for these URLs to always fetch from web
 *   - Applies in both main loop AND processGapIds()
 *
 * UPDATED v1.9.0:
 * - FIX: "Tournament not found" is now treated as NOT_FOUND, not an error
 *   - "Tournament not found" is a valid status from the scraper API indicating
 *     the tournament ID doesn't exist (similar to NOT_IN_USE)
 *   - Previously this was wrapped in FETCH_ERROR and caused immediate stop
 *   - Now increments consecutiveNotFound and uses threshold logic
 *   - Only genuine errors (network failures, API key issues) stop immediately
 * - NEW: isTournamentNotFoundStatus() helper to detect this status
 *
 * UPDATED v1.8.0:
 * - SIMPLIFIED: Stop immediately on ANY error - no threshold checking
 *   - Removed all MAX_TOTAL_ERRORS and MAX_CONSECUTIVE_ERRORS logic
 *   - First error = immediate stop, period
 *   - This is much simpler and easier to reason about
 * - REMOVED: consecutiveErrors tracking (not needed with immediate stop)
 * - KEPT: consecutiveNotFound for auto mode end-of-range detection
 * - Includes all fixes from v1.7.1 (UNKNOWN status handling in gap processing)
 * 
 * UPDATED v1.7.1:
 * - CRITICAL FIX: Gap processing now also handles gameStatus 'UNKNOWN' as ERROR
 *   - Previously only the main auto mode loop checked for UNKNOWN
 *   - Gap IDs with fetch errors were falling through and not stopping the job
 *   - Now gap processing checks isUnknownErrorResponse() alongside isErrorResponse()
 * 
 * UPDATED v1.7.0:
 * - CRITICAL FIX: gameStatus 'UNKNOWN' now treated as ERROR, not NOT_FOUND!
 *   - When fetch fails (API key missing, network error, timeout, etc.), the response
 *     has gameStatus='UNKNOWN'. Previously this was grouped with NOT_FOUND, hiding errors.
 *   - Now UNKNOWN increments error counters and can stop the job immediately.
 *   - User will see "ERROR" in the UI, not misleading "NOT_FOUND".
 * - NEW: Separate code path for UNKNOWN vs NOT_FOUND handling
 * - NEW: Error message extraction from parsedData.error/errorMessage/name
 * 
 * UPDATED v1.5.1:
 * - FIXED: Added progressPublisher to ctx destructuring (was causing "progressPublisher is not defined" crash)
 * - FIXED: Typo in gap results merge: gapsSkipped -> gamesSkipped (was causing Skipped=0)
 * - FIXED: Added || 0 safety to all numeric merges to prevent NaN in DynamoDB
 * - FIXED: buildProgressStats now returns 0 instead of null for successRate
 * - FIXED: Gap processing DynamoDB update now includes all stats (blanks, skipped, etc.)
 * - IMPROVED: Timeout handler includes better error messages and safe progressPublisher call
 * - NEW: isUnparseableResponse() - separates "Error processing tournament" from real errors
 *   - "Error processing tournament" now treated as NOT_FOUND (not an error)
 *   - These pages exist but don't have tournament data - that's normal, not an error
 *   - Increments notFoundCount/blanks instead of errors counter
 * 
 * UPDATED v1.5.0:
 * - NEW: Implemented 'refresh' mode for re-fetching unfinished games
 * - NEW: queryUnfinishedGames() helper for refresh mode
 * - NEW: Auto mode per-game forceRefresh for in-progress games
 * - In-progress games (RUNNING, REGISTERING, SCHEDULED, LATE_REGISTRATION) 
 *   now get fresh data even when S3 cache is enabled
 * 
 * v1.4.0:
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
// IN-PROGRESS GAME STATUS CONSTANTS (NEW v1.5.0)
// ===================================================================

/**
 * Game statuses that indicate a game is still in progress.
 * These games benefit from fresh data fetches (not S3 cache).
 */
const IN_PROGRESS_GAME_STATUSES = [
    'RUNNING',
    'REGISTERING', 
    'SCHEDULED',
    'LATE_REGISTRATION',
];

/**
 * Check if a game status indicates the game is still in progress
 */
function isInProgressGameStatus(status) {
    if (!status) return false;
    return IN_PROGRESS_GAME_STATUSES.includes(status.toUpperCase());
}

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
 * Check if a ScrapeURL status indicates a NOT_FOUND gap
 * Used to determine if we should force refresh (bypass S3 cache)
 * when re-scraping these URLs.
 * 
 * NEW in v1.10.0
 * 
 * @param {object} scrapeURLStatus - Status from prefetch cache
 * @returns {boolean} True if this is a NOT_FOUND/BLANK/NOT_IN_USE status
 */
function isNotFoundGapStatus(scrapeURLStatus) {
    if (!scrapeURLStatus || !scrapeURLStatus.found) return false;
    
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
 * NEW v1.9.0: Check if the UNKNOWN response is actually a "Tournament not found" status
 * 
 * "Tournament not found" is a valid status from the scraper API indicating the
 * tournament ID doesn't exist on the source site. This is NOT an error - it's
 * similar to NOT_FOUND/NOT_IN_USE and should use threshold logic.
 * 
 * The fetch handler wraps this in FETCH_ERROR format for transport, but it's
 * actually a normal status response that should be handled like NOT_FOUND.
 * 
 * @param {object} parsedData - The parsed tournament data
 * @returns {boolean} True if this is a "Tournament not found" status (not a real error)
 */
function isTournamentNotFoundStatus(parsedData) {
    if (!parsedData) return false;
    
    // Check for "Tournament not found" in various fields
    const errorMsg = parsedData.errorMessage || parsedData.error || '';
    const name = parsedData.name || '';
    
    // Common patterns for "tournament not found" status
    const notFoundPatterns = [
        'tournament not found',
        'event not found',
        'no tournament',
        'does not exist',
        'invalid tournament',
    ];
    
    const combinedText = `${errorMsg} ${name}`.toLowerCase();
    
    return notFoundPatterns.some(pattern => combinedText.includes(pattern));
}

/**
 * Check if the page exists but couldn't be parsed into tournament data.
 * This is NOT an error - it's just an empty/unparseable slot.
 * Treat these like NOT_FOUND (don't increment error counters).
 * 
 * Examples:
 * - "Error processing tournament" - page exists but no valid tournament structure
 * - Page with error-like name but valid HTTP response
 * 
 * UPDATED v1.5.2: MUST check for explicit errors FIRST!
 * If there's an error/errorMessage/status='ERROR'/source='ERROR', this is a REAL error.
 * This fixes the bug where "ScraperAPI key is not configured" was counted as NOT_FOUND.
 * 
 * UPDATED v1.5.1: Separated from isErrorResponse to avoid counting these as errors
 */
function isUnparseableResponse(parsedData) {
    if (!parsedData) return false;
    
    // ═══════════════════════════════════════════════════════════════════════
    // v1.5.2 FIX: Check for REAL errors FIRST
    // If there's an explicit error, this is NOT unparseable - let isErrorResponse handle it
    // ═══════════════════════════════════════════════════════════════════════
    if (parsedData.error) return false;
    if (parsedData.errorMessage) return false;
    if (parsedData.status === 'ERROR') return false;
    if (parsedData.source === 'ERROR') return false;
    
    // "Error processing tournament" WITH NO explicit error means the scraper found the page 
    // but couldn't extract data. This is normal for empty tournament slots - NOT an error.
    if (parsedData.name === 'Error processing tournament') return true;
    
    // Generic "error" in name without explicit error fields = unparseable, not error
    if (parsedData.name && 
        parsedData.name.toLowerCase().includes('error')) {
        return true;
    }
    
    return false;
}

/**
 * Check if the parsed data represents an ACTUAL error response from the scraper.
 * These are real failures that should increment error counters.
 * 
 * UPDATED v1.9.0: "Tournament not found" is NOT a real error - check isTournamentNotFoundStatus first
 * 
 * UPDATED v1.5.2: Also checks status and source fields for 'ERROR' value
 * 
 * UPDATED v1.5.1: Only true errors - unparseable pages moved to isUnparseableResponse
 * 
 * Examples of REAL errors:
 * - Network/HTTP failures
 * - Scraper API configuration errors (e.g., "ScraperAPI key is not configured")
 * - Explicit error messages from backend
 */
function isErrorResponse(parsedData) {
    // No data at all = something went wrong
    if (!parsedData) return true;
    
    // v1.9.0: "Tournament not found" is a status, not an error
    // Check this BEFORE checking error fields
    if (isTournamentNotFoundStatus(parsedData)) return false;
    
    // Explicit error message from scraper/backend = real error
    if (parsedData.errorMessage) return true;
    if (parsedData.error) return true;
    
    // v1.5.2: Check status and source fields for ERROR
    if (parsedData.status === 'ERROR') return true;
    if (parsedData.source === 'ERROR') return true;
    
    // HTTP error status codes
    if (parsedData.httpStatus && parsedData.httpStatus >= 400) return true;
    
    // Note: "Error processing tournament" is handled by isUnparseableResponse
    // and should NOT be treated as an error (when no explicit error fields exist)
    
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
    const totalProcessed = results.totalProcessed || 0;
    const newGames = results.newGamesScraped || 0;
    const updated = results.gamesUpdated || 0;
    const totalSuccessful = newGames + updated;
    const successRate = totalProcessed > 0 
        ? Math.round((totalSuccessful / totalProcessed) * 100 * 10) / 10
        : 0;  // Changed from null to 0 to prevent DynamoDB NaN issues
    
    return {
        totalProcessed: totalProcessed,
        newGamesScraped: newGames,
        gamesUpdated: updated,
        gamesSkipped: results.gamesSkipped || 0,
        errors: results.errors || 0,
        blanks: results.blanks || 0,
        notFoundCount: results.notFoundCount || 0,
        s3CacheHits: results.s3CacheHits || 0,
        successRate: successRate,
        consecutiveNotFound: results.consecutiveNotFound || 0,
        // v1.8.0: Removed consecutiveErrors - we stop on first error
        consecutiveBlanks: results.consecutiveBlanks || 0,
        notPublishedCount: results.notPublishedCount || 0,
    };
}

// ===================================================================
// QUERY UNFINISHED GAMES (NEW v1.5.0)
// ===================================================================

/**
 * Query for unfinished games (RUNNING, REGISTERING, SCHEDULED, LATE_REGISTRATION)
 * Used by refresh mode to find games that need fresh data.
 * Returns array of tournament IDs.
 * 
 * NEW in v1.5.0
 * 
 * @param {string} entityId - Entity to query for
 * @param {object} ctx - Context with ddbDocClient and table names
 * @returns {Promise<number[]>} Array of tournament IDs for unfinished games
 */
async function queryUnfinishedGames(entityId, ctx) {
    const { ddbDocClient, getTableName, scrapeURLTable } = ctx;
    
    // Try using ScrapeURL table first (it has gameStatus from last scrape)
    // This is more reliable since Game table might not have the right GSI
    if (scrapeURLTable && ddbDocClient) {
        try {
            const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
            
            const tournamentIds = [];
            
            // ScrapeURL stores gameStatus from last scrape
            const result = await ddbDocClient.send(new ScanCommand({
                TableName: scrapeURLTable,
                FilterExpression: 'entityId = :entityId AND gameStatus IN (:s1, :s2, :s3, :s4) AND (doNotScrape = :false OR attribute_not_exists(doNotScrape))',
                ExpressionAttributeValues: {
                    ':entityId': entityId,
                    ':s1': 'RUNNING',
                    ':s2': 'REGISTERING',
                    ':s3': 'SCHEDULED',
                    ':s4': 'LATE_REGISTRATION',
                    ':false': false
                },
                ProjectionExpression: 'tournamentId',
                Limit: 1000
            }));
            
            if (result.Items) {
                result.Items.forEach(item => {
                    if (item.tournamentId && typeof item.tournamentId === 'number') {
                        tournamentIds.push(item.tournamentId);
                    }
                });
            }
            
            // Remove duplicates and sort
            const uniqueIds = [...new Set(tournamentIds)].sort((a, b) => a - b);
            console.log(`[ScrapingEngine] Refresh mode: Found ${uniqueIds.length} unfinished games from ScrapeURL table`);
            
            return uniqueIds;
            
        } catch (error) {
            console.warn('[ScrapingEngine] ScrapeURL query failed, trying Game table:', error.message);
        }
    }
    
    // Fallback: Try Game table with GSI (if available)
    if (ddbDocClient && getTableName) {
        try {
            const { QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
            const gameTable = getTableName('Game');
            
            const tournamentIds = [];
            
            // Try GSI first for each status
            for (const status of IN_PROGRESS_GAME_STATUSES) {
                try {
                    const result = await ddbDocClient.send(new QueryCommand({
                        TableName: gameTable,
                        IndexName: 'byEntityAndStatus',
                        KeyConditionExpression: 'entityId = :entityId AND gameStatus = :status',
                        ExpressionAttributeValues: {
                            ':entityId': entityId,
                            ':status': status
                        },
                        ProjectionExpression: 'tournamentId',
                        Limit: 250
                    }));
                    
                    if (result.Items) {
                        result.Items.forEach(item => {
                            if (item.tournamentId) {
                                tournamentIds.push(item.tournamentId);
                            }
                        });
                    }
                } catch (queryError) {
                    // GSI might not exist, try scan as last resort
                    if (queryError.name === 'ValidationException' || queryError.message?.includes('GSI')) {
                        console.log(`[ScrapingEngine] GSI not available, will use scan for status ${status}`);
                    } else {
                        console.warn(`[ScrapingEngine] Query for ${status} games failed:`, queryError.message);
                    }
                }
            }
            
            if (tournamentIds.length > 0) {
                const uniqueIds = [...new Set(tournamentIds)].sort((a, b) => a - b);
                console.log(`[ScrapingEngine] Refresh mode: Found ${uniqueIds.length} unfinished games from Game table GSI`);
                return uniqueIds;
            }
            
            // Last resort: Scan with filter (expensive but works without GSI)
            console.log('[ScrapingEngine] Falling back to scan for unfinished games');
            const scanResult = await ddbDocClient.send(new ScanCommand({
                TableName: gameTable,
                FilterExpression: 'entityId = :entityId AND gameStatus IN (:s1, :s2, :s3, :s4)',
                ExpressionAttributeValues: {
                    ':entityId': entityId,
                    ':s1': 'RUNNING',
                    ':s2': 'REGISTERING',
                    ':s3': 'SCHEDULED',
                    ':s4': 'LATE_REGISTRATION'
                },
                ProjectionExpression: 'tournamentId',
                Limit: 500
            }));
            
            if (scanResult.Items) {
                scanResult.Items.forEach(item => {
                    if (item.tournamentId) {
                        tournamentIds.push(item.tournamentId);
                    }
                });
            }
            
            const uniqueIds = [...new Set(tournamentIds)].sort((a, b) => a - b);
            console.log(`[ScrapingEngine] Refresh mode: Found ${uniqueIds.length} unfinished games via scan`);
            return uniqueIds;
            
        } catch (error) {
            console.error('[ScrapingEngine] Failed to query unfinished games from Game table:', error.message);
        }
    }
    
    console.warn('[ScrapingEngine] No database client available for unfinished games query');
    return [];
}

// ===================================================================
// MAIN SCRAPING ENGINE
// ===================================================================

/**
 * Main scraping engine with configurable thresholds and event streaming
 * 
 * UPDATED v1.5.0: Added refresh mode and auto mode per-game forceRefresh
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
        getTableName,
        STOP_REASON,
        LAMBDA_TIMEOUT,
        LAMBDA_TIMEOUT_BUFFER,
        PROGRESS_UPDATE_FREQUENCY,
        DEFAULT_MAX_CONSECUTIVE_NOT_FOUND,
        // v1.8.0: Removed DEFAULT_MAX_CONSECUTIVE_ERRORS - we stop on first error
        DEFAULT_MAX_CONSECUTIVE_BLANKS,
        // Self-continuation support (optional)
        invokeContinuation,
        // NEW v1.4.0: Real-time progress callback for subscription updates
        onProgress,
        invocationStartTime,
        // v1.5.1: Progress publisher for timeout/continuation status
        progressPublisher,
    } = ctx;
    
    const startTime = invocationStartTime || Date.now();
    
    // v1.8.0: Simplified thresholds - only NOT_FOUND and BLANKS for auto mode end detection
    // Errors now cause immediate stop - no threshold checking needed
    const MAX_CONSECUTIVE_NOT_FOUND = options.maxConsecutiveNotFound || DEFAULT_MAX_CONSECUTIVE_NOT_FOUND || 10;
    const MAX_CONSECUTIVE_BLANKS = options.maxConsecutiveBlanks || DEFAULT_MAX_CONSECUTIVE_BLANKS || 5;
    
    console.log(`[ScrapingEngine] v1.10.1: Stop on first error (except "Tournament not found"). NOT_FOUND threshold=${MAX_CONSECUTIVE_NOT_FOUND}, BLANKS threshold=${MAX_CONSECUTIVE_BLANKS}`);
    
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
        // v1.8.0: Removed consecutiveErrors - we stop on first error
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
        
        // If mode is 'gaps', 'multiId', or 'refresh', return after processing gaps only
        if (mode === 'gaps' || mode === 'multiId' || mode === 'refresh') {
            return gapResults;
        }
        
        // Otherwise, merge gap results and continue with normal scanning
        results.totalProcessed += gapResults.totalProcessed || 0;
        results.newGamesScraped += gapResults.newGamesScraped || 0;
        results.gamesUpdated += gapResults.gamesUpdated || 0;
        results.gamesSkipped += gapResults.gamesSkipped || 0;  // FIXED: was gapsSkipped (typo)
        results.errors += gapResults.errors || 0;
        results.blanks += gapResults.blanks || 0;
        results.notFoundCount += gapResults.notFoundCount || 0;
        results.s3CacheHits += gapResults.s3CacheHits || 0;
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
            // ═══════════════════════════════════════════════════════════════
            // NEW v1.5.0: Refresh mode implementation
            // Re-fetch and update unfinished games (RUNNING, REGISTERING, SCHEDULED)
            // These games need fresh data to update standings, player counts, etc.
            // ═══════════════════════════════════════════════════════════════
            
            // If gapIds already provided (from frontend or scraperManagement), they were processed above
            if (options.gapIds?.length > 0) {
                console.log(`[ScrapingEngine] Refresh mode: Already processed ${options.gapIds.length} pre-provided game IDs`);
                return results;
            }
            
            // Otherwise, query for unfinished games
            console.log(`[ScrapingEngine] Refresh mode: Querying for unfinished games...`);
            const unfinishedGameIds = await queryUnfinishedGames(entityId, {
                ddbDocClient: ctx.ddbDocClient,
                getTableName: ctx.getTableName,
                scrapeURLTable: ctx.scrapeURLTable
            });
            
            if (!unfinishedGameIds || unfinishedGameIds.length === 0) {
                console.log(`[ScrapingEngine] Refresh mode: No unfinished games found to refresh`);
                results.stopReason = STOP_REASON.COMPLETED;
                return results;
            }
            
            console.log(`[ScrapingEngine] Refresh mode: Processing ${unfinishedGameIds.length} unfinished games`);
            console.log(`[ScrapingEngine] Refresh forceRefresh=${options.forceRefresh}, will ${options.forceRefresh ? 'bypass S3 cache' : 'use S3 cache if available'}`);
            
            // Process these IDs through the gap processor
            // Note: forceRefresh in options will be respected by processGapIds -> callGraphQL
            const refreshResults = await processGapIds(
                entityId, 
                jobId, 
                unfinishedGameIds, 
                {
                    ...options,
                    // Ensure we're updating, not skipping
                    skipNotPublished: false,
                    skipNotFoundGaps: false,
                }, 
                startTime, 
                ctx
            );
            
            console.log(`[ScrapingEngine] Refresh mode complete:`, {
                totalProcessed: refreshResults.totalProcessed,
                gamesUpdated: refreshResults.gamesUpdated,
                newGamesScraped: refreshResults.newGamesScraped,
                errors: refreshResults.errors
            });
            
            return refreshResults;
            
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
    if (options.skipNotPublished || options.skipNotFoundGaps || mode === 'auto') {
        // v1.5.0: Also init prefetch for auto mode to check game status for per-game forceRefresh
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
            console.log(`[ScrapingEngine] Approaching timeout at ID ${currentId}, processed so far: ${results.totalProcessed}`);
            
            // Publish timeout status if publisher available
            if (progressPublisher) {
                try {
                    await progressPublisher.publishProgress(results, 'RUNNING', {
                        currentId,
                        stopReason: 'TIMEOUT',
                        message: `Timeout at ID ${currentId}, attempting continuation`
                    });
                } catch (pubErr) {
                    console.warn(`[ScrapingEngine] Timeout progress publish failed:`, pubErr.message);
                }
            }
            
            // Try to continue in new invocation
            if (invokeContinuation && currentId < endId) {
                try {
                    await invokeContinuation(currentId, endId, results);
                    results.stopReason = STOP_REASON.CONTINUING || 'CONTINUING';
                    console.log(`[ScrapingEngine] Self-continuation triggered, stopping current invocation`);
                } catch (contErr) {
                    console.error(`[ScrapingEngine] Failed to invoke continuation:`, contErr.message);
                    results.stopReason = STOP_REASON.TIMEOUT;
                    results.lastErrorMessage = `Continuation failed: ${contErr.message}`;
                }
            } else {
                results.stopReason = STOP_REASON.TIMEOUT;
                results.lastErrorMessage = invokeContinuation 
                    ? 'Timeout: Already at end of range' 
                    : 'Timeout: No continuation handler available';
            }
            break;
        }
        
        const url = await buildTournamentUrl(entityId, currentId);
        results.lastProcessedId = currentId;

        // ═══════════════════════════════════════════════════════════════
        // v1.5.0: Determine per-game forceRefresh for auto mode
        // In-progress games should always get fresh data
        // ═══════════════════════════════════════════════════════════════
        let gameForceRefresh = options.forceRefresh || false;
        let scrapeURLStatus = null;
        
        // Skip checks and per-game forceRefresh using prefetch cache
        if (prefetchCache) {
            try {
                scrapeURLStatus = await prefetchCache.getStatus(currentId);
                
                // Check skip conditions first
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
                
                // ═══════════════════════════════════════════════════════════════
                // v1.10.0: Force refresh for NOT_FOUND gaps when re-scraping them
                // When skipNotFoundGaps=false, user wants to re-check these URLs.
                // S3 cache contains useless "not found" HTML, so bypass it.
                // ═══════════════════════════════════════════════════════════════
                if (!options.skipNotFoundGaps && isNotFoundGapStatus(scrapeURLStatus) && !gameForceRefresh) {
                    gameForceRefresh = true;
                    console.log(`[ScrapingEngine] ID ${currentId} was NOT_FOUND - forcing web refresh to check for new tournament`);
                }
                
                // v1.5.0: Auto mode per-game forceRefresh for in-progress games
                // If game exists with an in-progress status, force refresh to get latest data
                if (mode === 'auto' && scrapeURLStatus.found && !gameForceRefresh) {
                    const existingStatus = scrapeURLStatus.gameStatus;
                    if (isInProgressGameStatus(existingStatus)) {
                        gameForceRefresh = true;
                        console.log(`[ScrapingEngine] Auto mode: ID ${currentId} has in-progress status "${existingStatus}", forcing refresh`);
                    }
                }
                
            } catch (error) {
                console.warn(`[ScrapingEngine] Prefetch error, continuing: ${error.message}`);
            }
        }
        
        results.totalProcessed++;

        try {
            // Fetch via AppSync with retry for rate limiting
            // v1.5.0: Use per-game forceRefresh for auto mode
            const fetchData = await withRetry(async () => {
                return await callGraphQL(FETCH_TOURNAMENT_DATA, {
                    url: url,
                    forceRefresh: gameForceRefresh,
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

            // ═══════════════════════════════════════════════════════════════
            // v1.5.2 FIX: Check for REAL errors FIRST (before unparseable)
            // This ensures configuration/network errors are properly counted
            // ═══════════════════════════════════════════════════════════════
            if (isErrorResponse(parsedData)) {
                const actualErrorMessage = parsedData.errorMessage || parsedData.error || parsedData.name || 'Unknown error';
                console.error(`[ScrapingEngine] ID ${currentId}: ERROR - ${actualErrorMessage} - STOPPING IMMEDIATELY`);
                results.errors++;
                results.consecutiveNotFound = 0;
                results.consecutiveBlanks = 0;
                results.lastErrorMessage = actualErrorMessage;
                
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
                
                // v1.8.0: IMMEDIATE STOP on any error - no threshold checking
                results.stopReason = STOP_REASON.ERROR;
                break;
            }

            // ═══════════════════════════════════════════════════════════════
            // v1.5.1: Check for unparseable pages (not errors!)
            // v1.5.2: This now only triggers if isErrorResponse is false
            // These are pages that exist but don't have tournament data
            // Treat like NOT_FOUND - don't increment error counters
            // ═══════════════════════════════════════════════════════════════
            if (isUnparseableResponse(parsedData)) {
                console.log(`[ScrapingEngine] ID ${currentId}: Unparseable page (${parsedData.name || 'no name'}) - treating as NOT_FOUND`);
                results.consecutiveBlanks++;
                results.consecutiveNotFound++;
                results.blanks++;
                results.notFoundCount++;
                
                publishGameProcessedEvent(jobId, entityId, currentId, url, {
                    action: 'NOT_FOUND',
                    message: `Unparseable: ${parsedData.name || 'No tournament data'}`,
                    durationMs: Date.now() - gameStartTime,
                    dataSource: dataSource,
                    s3Key: parsedData.s3Key || null,
                    parsedData: { 
                        gameStatus: 'NOT_FOUND',
                        name: parsedData.name,
                    },
                    saveResult: null,
                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                
                // Check NOT_FOUND thresholds (NOT error thresholds)
                if (results.consecutiveNotFound >= MAX_CONSECUTIVE_NOT_FOUND && mode !== 'gaps') {
                    console.log(`[ScrapingEngine] NOT_FOUND threshold reached: ${results.consecutiveNotFound}`);
                    results.stopReason = STOP_REASON.NOT_FOUND;
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
            
            // ═══════════════════════════════════════════════════════════════
            // v1.9.0 FIX: Check if UNKNOWN is actually "Tournament not found" status
            // "Tournament not found" is NOT an error - treat like NOT_FOUND
            // Only genuine errors (network failures, API key issues) stop immediately
            // ═══════════════════════════════════════════════════════════════
            if (isUnknownError) {
                // Extract error message for logging
                let errorMsg = parsedData.errorMessage || parsedData.error;
                if (!errorMsg && parsedData.name?.startsWith('FETCH_ERROR:')) {
                    errorMsg = parsedData.name.substring('FETCH_ERROR:'.length).trim();
                }
                errorMsg = errorMsg || parsedData.name || 'Fetch failed (UNKNOWN status)';
                
                // v1.9.0: Check if this is actually a "Tournament not found" status
                if (isTournamentNotFoundStatus(parsedData)) {
                    // ─────────────────────────────────────────────────────────────
                    // "Tournament not found" = NOT_FOUND status, not an error
                    // Use threshold logic like other NOT_FOUND responses
                    // ─────────────────────────────────────────────────────────────
                    results.consecutiveBlanks++;
                    results.consecutiveNotFound++;
                    results.blanks++;
                    results.notFoundCount++;
                    
                    console.log(`[ScrapingEngine] ID ${currentId}: Tournament not found (consecutive: ${results.consecutiveNotFound}/${MAX_CONSECUTIVE_NOT_FOUND})`);
                    
                    publishGameProcessedEvent(jobId, entityId, currentId, url, {
                        action: 'NOT_FOUND',
                        message: errorMsg,
                        durationMs: Date.now() - gameStartTime,
                        dataSource: dataSource,
                        s3Key: parsedData.s3Key,
                        parsedData: { gameStatus: 'NOT_FOUND', originalStatus: 'UNKNOWN' },
                        saveResult: null,
                    }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                    
                    // Check NOT_FOUND thresholds
                    if (results.consecutiveNotFound >= MAX_CONSECUTIVE_NOT_FOUND && mode !== 'gaps') {
                        console.log(`[ScrapingEngine] NOT_FOUND threshold reached: ${results.consecutiveNotFound}`);
                        results.stopReason = STOP_REASON.NOT_FOUND;
                        break;
                    }
                    
                } else {
                    // ─────────────────────────────────────────────────────────────
                    // Genuine error (network failure, API key issue, etc.)
                    // v1.8.0: IMMEDIATE STOP
                    // ─────────────────────────────────────────────────────────────
                    results.errors++;
                    results.consecutiveBlanks = 0;
                    results.consecutiveNotFound = 0;
                    results.lastErrorMessage = errorMsg;
                    
                    console.error(`[ScrapingEngine] ID ${currentId}: FETCH ERROR - ${errorMsg} - STOPPING IMMEDIATELY`);
                    
                    publishGameProcessedEvent(jobId, entityId, currentId, url, {
                        action: 'ERROR',
                        message: errorMsg,
                        errorMessage: errorMsg,
                        durationMs: Date.now() - gameStartTime,
                        dataSource: dataSource,
                        s3Key: parsedData.s3Key,
                        parsedData: { gameStatus: 'UNKNOWN', error: errorMsg },
                        saveResult: null,
                    }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                    
                    // v1.8.0: IMMEDIATE STOP on any error
                    results.stopReason = STOP_REASON.ERROR;
                    break;
                }
                
            } else if (isNotFound) {
                // ─────────────────────────────────────────────────────────────
                // NOT_FOUND / NOT_IN_USE: Empty tournament slot
                // INCREMENT consecutive counters - can stop scraper in auto mode
                // ─────────────────────────────────────────────────────────────
                results.consecutiveBlanks++;
                results.consecutiveNotFound++;
                results.blanks++;
                results.notFoundCount++;
                
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
                
                // Check NOT_FOUND thresholds - these SHOULD stop for consecutive NOT_FOUNDs in auto mode
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
                // Treat enum errors as NOT_PUBLISHED - not a real error
                console.log(`[ScrapingEngine] ID ${currentId}: GameStatus enum error - treating as NOT_PUBLISHED`);
                results.notPublishedCount++;
                results.consecutiveBlanks = 0;
                results.consecutiveNotFound = 0;
                
                publishGameProcessedEvent(jobId, entityId, currentId, url, {
                    action: 'NOT_PUBLISHED',
                    message: 'NOT_PUBLISHED (enum serialization)',
                    durationMs: Date.now() - gameStartTime,
                    dataSource: 'web',
                    parsedData: { gameStatus: 'NOT_PUBLISHED' },
                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
            } else {
                // v1.8.0: IMMEDIATE STOP on any real error
                results.errors++;
                results.consecutiveBlanks = 0;
                results.consecutiveNotFound = 0;
                results.lastErrorMessage = errorMessage;
                
                console.error(`[ScrapingEngine] Error at ID ${currentId}: ${errorMessage} - STOPPING IMMEDIATELY`);
                
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
                
                results.stopReason = STOP_REASON.ERROR;
                break;
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
                // v1.8.0: Removed consecutiveErrors - we stop on first error
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
 * v1.10.1: FIX - Only force refresh for NOT_FOUND gaps, not all gaps
 *   - Added prefetch cache to check each gap's status
 *   - NOT_FOUND/BLANK/NOT_IN_USE -> force refresh (S3 has useless "not found" HTML)
 *   - NOT_PUBLISHED -> use S3 cache (valid data)
 *   - This prevents Lambda timeout when processing many gaps
 * v1.10.0: Force web refresh when skipNotFoundGaps=false (S3 cache contains useless data)
 * v1.8.0: Stop immediately on any error - no threshold checking
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
        ddbDocClient,
        scrapeURLTable,
        STOP_REASON,
        PROGRESS_UPDATE_FREQUENCY,
        // NEW v1.4.0: Real-time progress callback
        onProgress
    } = ctx;
    
    // v1.8.0: No error thresholds - we stop on first error
    console.log(`[ScrapingEngine] Processing ${gapIds.length} gap IDs (stop on first error)`);
    
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
        // v1.8.0: Removed consecutiveErrors - we stop on first error
        stopReason: STOP_REASON.COMPLETED,
        lastErrorMessage: null,
        notPublishedCount: 0,
    };
    
    // v1.10.1: Initialize prefetch cache to check status of each gap ID
    // Only force refresh for NOT_FOUND gaps (S3 has useless data)
    // NOT_PUBLISHED gaps can use S3 cache (valid data)
    let prefetchCache = null;
    const shouldCheckStatus = !options.skipNotFoundGaps && !options.forceRefresh;
    
    if (shouldCheckStatus && ddbDocClient && scrapeURLTable) {
        prefetchCache = new ScrapeURLPrefetchCache(entityId, ddbDocClient, scrapeURLTable);
        console.log(`[ScrapingEngine] Gap processing: Using prefetch cache to selectively force refresh only NOT_FOUND gaps`);
    } else if (!options.skipNotFoundGaps && !options.forceRefresh) {
        console.log(`[ScrapingEngine] Gap processing: skipNotFoundGaps=false but no prefetch cache available, using S3 cache`);
    }
    
    for (const tournamentId of gapIds) {
        const gameStartTime = Date.now();
        const url = await buildTournamentUrl(entityId, tournamentId);
        
        results.totalProcessed++;
        results.currentId = tournamentId;
        
        // v1.10.1: Determine per-gap forceRefresh based on ScrapeURL status
        let gapForceRefresh = options.forceRefresh || false;
        
        if (prefetchCache && !gapForceRefresh) {
            try {
                const scrapeURLStatus = await prefetchCache.getStatus(tournamentId);
                if (isNotFoundGapStatus(scrapeURLStatus)) {
                    gapForceRefresh = true;
                    console.log(`[ScrapingEngine] Gap ID ${tournamentId}: Was NOT_FOUND, forcing web refresh`);
                }
                // NOT_PUBLISHED and other statuses use S3 cache (faster)
            } catch (prefetchError) {
                // If prefetch fails, use S3 cache (safer/faster)
                console.warn(`[ScrapingEngine] Gap ID ${tournamentId}: Prefetch failed, using S3 cache`);
            }
        }
        
        try {
            const fetchData = await withRetry(async () => {
                return await callGraphQL(FETCH_TOURNAMENT_DATA, {
                    url: url,
                    forceRefresh: gapForceRefresh,
                    entityId: entityId,
                    scraperApiKey: options.scraperApiKey || null
                });
            }, 3, 500);
            const parsedData = fetchData.fetchTournamentData;
            
            const dataSource = (parsedData.source === 'S3_CACHE' || parsedData.source === 'HTTP_304_CACHE') ? 's3' : 'web';
            
            if (parsedData.source === 'S3_CACHE' || parsedData.source === 'HTTP_304_CACHE') {
                results.s3CacheHits++;
            }
            
            // ═══════════════════════════════════════════════════════════════
            // v1.5.2 FIX: Check for REAL errors FIRST (before unparseable)
            // This ensures configuration/network errors are properly counted
            // v1.7.1 FIX: Also check for UNKNOWN status - this is a FETCH error!
            // v1.8.0: IMMEDIATE STOP on any error - no threshold checking
            // v1.9.0 FIX: "Tournament not found" is NOT an error - treat as NOT_FOUND
            // ═══════════════════════════════════════════════════════════════
            const isUnknownError = isUnknownErrorResponse(parsedData);
            
            // v1.9.0: Check if UNKNOWN is actually "Tournament not found" first
            if (isUnknownError && isTournamentNotFoundStatus(parsedData)) {
                // "Tournament not found" = NOT_FOUND status, not an error
                let errorMsg = parsedData.errorMessage || parsedData.error;
                if (!errorMsg && parsedData.name?.startsWith('FETCH_ERROR:')) {
                    errorMsg = parsedData.name.substring('FETCH_ERROR:'.length).trim();
                }
                errorMsg = errorMsg || parsedData.name || 'Tournament not found';
                
                console.log(`[ScrapingEngine] Gap ID ${tournamentId}: Tournament not found - treating as NOT_FOUND`);
                results.blanks++;
                results.notFoundCount++;
                results.consecutiveBlanks++;
                results.consecutiveNotFound++;
                
                publishGameProcessedEvent(jobId, entityId, tournamentId, url, {
                    action: 'NOT_FOUND',
                    message: errorMsg,
                    durationMs: Date.now() - gameStartTime,
                    dataSource: dataSource,
                    parsedData: { gameStatus: 'NOT_FOUND', originalStatus: 'UNKNOWN' },
                    saveResult: null,
                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                
                continue;  // Continue to next gap ID, don't stop
            }
            
            if (isErrorResponse(parsedData) || isUnknownError) {
                // Extract error message, including from FETCH_ERROR: prefix
                let actualErrorMessage = parsedData.errorMessage || parsedData.error;
                if (!actualErrorMessage && parsedData.name?.startsWith('FETCH_ERROR:')) {
                    actualErrorMessage = parsedData.name.substring('FETCH_ERROR:'.length).trim();
                }
                actualErrorMessage = actualErrorMessage || parsedData.name || 'Fetch failed (UNKNOWN status)';
                
                console.error(`[ScrapingEngine] Gap ID ${tournamentId}: ${isUnknownError ? 'FETCH ERROR' : 'ERROR'} - ${actualErrorMessage} - STOPPING IMMEDIATELY`);
                results.errors++;
                results.consecutiveBlanks = 0;
                results.consecutiveNotFound = 0;
                results.lastErrorMessage = actualErrorMessage;
                
                publishGameProcessedEvent(jobId, entityId, tournamentId, url, {
                    action: 'ERROR',
                    message: actualErrorMessage,
                    errorMessage: actualErrorMessage,
                    durationMs: Date.now() - gameStartTime,
                    dataSource: dataSource,
                    parsedData: { gameStatus: isUnknownError ? 'UNKNOWN' : parsedData.gameStatus, error: actualErrorMessage },
                    saveResult: null,
                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                
                // v1.8.0: IMMEDIATE STOP on any error
                results.stopReason = STOP_REASON.ERROR;
                break;
            }
            
            // ═══════════════════════════════════════════════════════════════
            // v1.5.1: Check for unparseable pages (not errors!)
            // v1.5.2: This now only triggers if isErrorResponse is false
            // These are pages that exist but don't have tournament data
            // Treat like NOT_FOUND - don't increment error counters
            // ═══════════════════════════════════════════════════════════════
            if (isUnparseableResponse(parsedData)) {
                console.log(`[ScrapingEngine] Gap ID ${tournamentId}: Unparseable page (${parsedData.name || 'no name'}) - treating as NOT_FOUND`);
                results.blanks++;
                results.notFoundCount++;
                results.consecutiveBlanks++;
                results.consecutiveNotFound++;
                
                publishGameProcessedEvent(jobId, entityId, tournamentId, url, {
                    action: 'NOT_FOUND',
                    message: `Unparseable: ${parsedData.name || 'No tournament data'}`,
                    durationMs: Date.now() - gameStartTime,
                    dataSource: dataSource,
                    s3Key: parsedData.s3Key || null,
                    parsedData: { 
                        gameStatus: 'NOT_FOUND',
                        name: parsedData.name,
                    },
                    saveResult: null,
                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                
                continue;  // Don't count as error, continue to next ID
            }
            
            const isNotFound = isNotFoundResponse(parsedData);
            const isNotPublished = isNotPublishedResponse(parsedData);
            
            if (isNotFound) {
                results.blanks++;
                results.notFoundCount++;
                results.consecutiveBlanks++;
                results.consecutiveNotFound++;
                
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
                // Treat enum errors as NOT_PUBLISHED - not a real error
                console.log(`[ScrapingEngine] Gap ID ${tournamentId}: GameStatus enum error - treating as NOT_PUBLISHED`);
                results.notPublishedCount++;
                results.consecutiveBlanks = 0;
                results.consecutiveNotFound = 0;
                
                publishGameProcessedEvent(jobId, entityId, tournamentId, url, {
                    action: 'NOT_PUBLISHED',
                    message: 'NOT_PUBLISHED (enum serialization)',
                    durationMs: Date.now() - gameStartTime,
                    dataSource: 'web',
                    parsedData: { gameStatus: 'NOT_PUBLISHED' },
                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
            } else {
                // v1.8.0: IMMEDIATE STOP on any real error
                results.errors++;
                results.consecutiveBlanks = 0;
                results.consecutiveNotFound = 0;
                results.lastErrorMessage = errorMessage;
                
                console.error(`[ScrapingEngine] Gap error at ID ${tournamentId}: ${errorMessage} - STOPPING IMMEDIATELY`);
                
                publishGameProcessedEvent(jobId, entityId, tournamentId, url, {
                    action: 'ERROR',
                    message: errorMessage,
                    errorMessage: errorMessage,
                    durationMs: Date.now() - gameStartTime,
                    dataSource: 'none',
                    parsedData: null,
                }).catch(err => console.warn(`[ScrapingEngine] Event publish failed:`, err.message));
                
                results.stopReason = STOP_REASON.ERROR;
                break;
            }
        }
        
        // ═══════════════════════════════════════════════════════════════
        // UPDATED v1.4.0: Publish progress to BOTH DynamoDB AND subscription
        // ═══════════════════════════════════════════════════════════════
        if (results.totalProcessed % PROGRESS_UPDATE_FREQUENCY === 0) {
            // Update DynamoDB with ALL stats
            await updateScraperJob(jobId, {
                totalURLsProcessed: results.totalProcessed,
                currentId: tournamentId,
                newGamesScraped: results.newGamesScraped,
                gamesUpdated: results.gamesUpdated,
                gamesSkipped: results.gamesSkipped,
                errors: results.errors,
                blanks: results.blanks,
                notFoundCount: results.notFoundCount,
                s3CacheHits: results.s3CacheHits,
                notPublishedCount: results.notPublishedCount,
            });
            
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
    // NEW v1.5.0: Export for refresh mode
    queryUnfinishedGames,
    isInProgressGameStatus,
    IN_PROGRESS_GAME_STATUSES,
    // Export helpers for testing
    isNotFoundResponse,
    isNotPublishedResponse,
    isUnknownErrorResponse,
    isUnparseableResponse,  // NEW v1.5.1
    isErrorResponse,
    isTournamentNotFoundStatus,  // NEW v1.9.0
    isNotFoundGapStatus,  // NEW v1.10.0
    shouldSkipNotPublished,
    shouldSkipNotFoundGap,
    extractPlayerData,
    buildSaveInput,
    // NEW v1.4.0: Export for testing
    buildProgressStats
};