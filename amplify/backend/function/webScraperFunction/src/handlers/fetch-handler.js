/**
 * ===================================================================
 * Fetch Handler (FIXED v2.3.0)
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
 * - Perform series detection (now handled by gameDataEnricher)
 * 
 * FIXES in v2.3.0:
 * - CRITICAL: Added entityId filtering to byTournamentId GSI queries
 *   to prevent cross-entity S3 cache collisions when multiple entities
 *   share the same tournament ID numbers (e.g., Kings Natan, Kings Newcastle)
 * 
 * FIXES in v2.2.0:
 * - Robust ScrapeURL record creation when records don't exist
 * - Looks up existing S3Storage to restore S3 cache links
 * - Better error handling that preserves S3 cache checking
 * - Graceful degradation when tracking tables are empty
 * 
 * GSI NAMES (from 80-scrapers.graphql):
 * - ScrapeURL: byURL, byTournamentId, byEntityScrapeURL
 * - S3Storage: byTournamentId, byURL, byS3Key, byScrapeURL
 * 
 * ===================================================================
 */

const { enhancedHandleFetch } = require('../fetch');
const { parseHtml } = require('../parse');
const { getScrapeURL, updateScrapeURLDoNotScrape } = require('../core/scrape-url-manager');
const { createScrapeAttempt } = require('../core/scrape-attempt-tracker');
const { updateS3StorageWithParsedData } = require('../storage/s3-storage-manager');
const { getAllVenues } = require('../parse/venue-matcher');
const { processStructureFingerprint } = require('../parse/structure-fingerprint');
const { getHtmlFromS3 } = require('../storage/s3-client');
const { DO_NOT_SCRAPE_STATUSES } = require('../config/constants');

// DynamoDB imports for fallback record creation
const { PutCommand, GetCommand, QueryCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

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
 * Look up existing S3Storage record for a tournament
 * This restores the S3 cache link when ScrapeURL was deleted but S3Storage exists
 * 
 * GSI Names (from updated schema):
 * - byEntityTournament: entityId (partition) + tournamentId (sort) ← NEW! PREFERRED
 * - byTournamentId: tournamentId (partition) + scrapedAt (sort)
 * - byURL: url (partition) + scrapedAt (sort)
 * - byS3Key: s3Key (partition)
 * 
 * UPDATED v2.4.0: Now uses byEntityTournament GSI as primary method.
 * This GSI doesn't require scrapedAt, so it finds records that were
 * migrated without scrapedAt.
 * 
 * @param {string} url - Tournament URL
 * @param {string} entityId - Entity ID (REQUIRED for correct filtering)
 * @param {number} tournamentId - Tournament ID
 * @param {object} context - Shared context
 * @returns {object|null} S3Storage record or null
 */
const findExistingS3Storage = async (url, entityId, tournamentId, context) => {
    const { ddbDocClient, getTableName } = context;
    const tableName = getTableName('S3Storage');
    
    console.log(`[FetchHandler] Looking for existing S3Storage for tournamentId: ${tournamentId}, entityId: ${entityId}`);
    
    // ─────────────────────────────────────────────────────────────────
    // Method 1: NEW! Query by entityId + tournamentId GSI (PREFERRED)
    // GSI: byEntityTournament (entityId + tournamentId)
    // 
    // This is now the preferred method because:
    // 1. It directly queries by both entityId AND tournamentId
    // 2. No FilterExpression needed (both are key conditions)
    // 3. Works even if scrapedAt is missing (unlike byTournamentId)
    // ─────────────────────────────────────────────────────────────────
    if (entityId && tournamentId) {
        try {
            const queryResult = await ddbDocClient.send(new QueryCommand({
                TableName: tableName,
                IndexName: 'byEntityTournament',
                KeyConditionExpression: 'entityId = :eid AND tournamentId = :tid',
                ExpressionAttributeValues: { 
                    ':eid': entityId,
                    ':tid': tournamentId
                },
                Limit: 1
            }));
            
            if (queryResult.Items && queryResult.Items.length > 0) {
                const item = queryResult.Items[0];
                console.log(`[FetchHandler] ✅ Found S3Storage via byEntityTournament GSI: ${item.s3Key}`);
                return item;
            }
            console.log(`[FetchHandler] No S3Storage found via byEntityTournament GSI`);
        } catch (gsiError) {
            console.log(`[FetchHandler] byEntityTournament GSI query failed: ${gsiError.message}`);
            // Fall through to other methods
        }
    }
    
    // ─────────────────────────────────────────────────────────────────
    // Method 2: Query by URL GSI (FALLBACK)
    // GSI: byURL (url + scrapedAt)
    // Note: Won't find records missing scrapedAt
    // ─────────────────────────────────────────────────────────────────
    if (url) {
        try {
            const queryResult = await ddbDocClient.send(new QueryCommand({
                TableName: tableName,
                IndexName: 'byURL',
                KeyConditionExpression: '#url = :url',
                ExpressionAttributeNames: { '#url': 'url' },
                ExpressionAttributeValues: { ':url': url },
                ScanIndexForward: false, // Most recent first
                Limit: 1
            }));
            
            if (queryResult.Items && queryResult.Items.length > 0) {
                const item = queryResult.Items[0];
                console.log(`[FetchHandler] ✅ Found S3Storage via byURL GSI: ${item.s3Key} (entityId: ${item.entityId})`);
                return item;
            }
        } catch (gsiError) {
            console.log(`[FetchHandler] byURL GSI query failed: ${gsiError.message}`);
        }
    }
    
    // ─────────────────────────────────────────────────────────────────
    // Method 3: Query by tournamentId GSI WITH entityId filter (LEGACY)
    // GSI: byTournamentId (tournamentId + scrapedAt)
    // 
    // NOTE: This method won't find records missing scrapedAt!
    // Keeping for backwards compatibility.
    // ─────────────────────────────────────────────────────────────────
    if (entityId) {
        try {
            const queryResult = await ddbDocClient.send(new QueryCommand({
                TableName: tableName,
                IndexName: 'byTournamentId',
                KeyConditionExpression: 'tournamentId = :tid',
                FilterExpression: 'entityId = :eid',
                ExpressionAttributeValues: { 
                    ':tid': tournamentId,
                    ':eid': entityId
                },
                ScanIndexForward: false, // Get most recent first (descending scrapedAt)
                Limit: 20 // Query more to account for FilterExpression being applied after Limit
            }));
            
            if (queryResult.Items && queryResult.Items.length > 0) {
                const item = queryResult.Items[0];
                console.log(`[FetchHandler] ✅ Found S3Storage via byTournamentId GSI: ${item.s3Key} (entityId: ${item.entityId})`);
                return item;
            }
        } catch (gsiError) {
            console.log(`[FetchHandler] byTournamentId GSI query failed: ${gsiError.message}`);
        }
    } else {
        console.warn(`[FetchHandler] ⚠️ No entityId provided - skipping byTournamentId query to avoid cross-entity collision`);
    }
    
    console.log(`[FetchHandler] No existing S3Storage found for tournamentId: ${tournamentId}, entityId: ${entityId}`);
    return null;
};

/**
 * Fallback function to get or create ScrapeURL record
 * Also restores S3 cache links from existing S3Storage records
 * 
 * GSI Names (from schema):
 * - byURL: url (partition)
 * - byTournamentId: tournamentId (partition)
 * 
 * IMPORTANT: When querying by tournamentId, we MUST also filter by entityId
 * because multiple entities can have the same tournament IDs (1, 2, 3, etc.)
 * 
 * @param {string} url - Tournament URL
 * @param {string} entityId - Entity ID (REQUIRED for correct filtering)
 * @param {number} tournamentId - Tournament ID
 * @param {object} context - Shared context
 * @returns {object} ScrapeURL record with S3 cache link restored if available
 */
const getOrCreateScrapeURLFallback = async (url, entityId, tournamentId, context) => {
    const { ddbDocClient, getTableName } = context;
    const tableName = getTableName('ScrapeURL');
    
    console.log(`[FetchHandler] getOrCreateScrapeURLFallback for tournamentId: ${tournamentId}, entityId: ${entityId}`);
    
    // ═══════════════════════════════════════════════════════════════════
    // STEP 1: Try to find existing ScrapeURL record
    // ═══════════════════════════════════════════════════════════════════
    
    // Method 1: Try GSI byURL (PREFERRED - URL is unique per entity)
    try {
        const queryResult = await ddbDocClient.send(new QueryCommand({
            TableName: tableName,
            IndexName: 'byURL',
            KeyConditionExpression: '#url = :url',
            ExpressionAttributeNames: { '#url': 'url' },
            ExpressionAttributeValues: { ':url': url },
            Limit: 1
        }));
        
        if (queryResult.Items && queryResult.Items.length > 0) {
            const record = queryResult.Items[0];
            console.log(`[FetchHandler] Found existing ScrapeURL via byURL GSI: ${record.id} (entityId: ${record.entityId})`);
            
            // Check if we need to restore S3 link
            if (!record.latestS3Key) {
                const s3Storage = await findExistingS3Storage(url, entityId, tournamentId, context);
                if (s3Storage && s3Storage.s3Key) {
                    console.log(`[FetchHandler] Restoring S3 link: ${s3Storage.s3Key}`);
                    record.latestS3Key = s3Storage.s3Key;
                    
                    // Update in DB (fire and forget)
                    updateScrapeURLWithS3Link(record.id, s3Storage.s3Key, s3Storage.id, context)
                        .catch(err => console.warn(`S3 link update failed: ${err.message}`));
                }
            }
            
            return record;
        }
    } catch (gsiError) {
        console.log(`[FetchHandler] byURL GSI query failed: ${gsiError.message}`);
    }
    
    // ─────────────────────────────────────────────────────────────────
    // Method 2: Try GSI byTournamentId WITH entityId filter
    // 
    // CRITICAL FIX (v2.3.0): Must filter by entityId because multiple
    // entities share the same tournament ID numbers!
    // ─────────────────────────────────────────────────────────────────
    if (entityId) {
        try {
            const queryResult = await ddbDocClient.send(new QueryCommand({
                TableName: tableName,
                IndexName: 'byTournamentId',
                KeyConditionExpression: 'tournamentId = :tid',
                FilterExpression: 'entityId = :eid',
                ExpressionAttributeValues: { 
                    ':tid': tournamentId,
                    ':eid': entityId
                },
                Limit: 20 // Query more to account for FilterExpression being applied after Limit
            }));
            
            if (queryResult.Items && queryResult.Items.length > 0) {
                const record = queryResult.Items[0];
                console.log(`[FetchHandler] Found existing ScrapeURL via byTournamentId GSI: ${record.id} (entityId: ${record.entityId})`);
                
                // Check if we need to restore S3 link
                if (!record.latestS3Key) {
                    const s3Storage = await findExistingS3Storage(url, entityId, tournamentId, context);
                    if (s3Storage && s3Storage.s3Key) {
                        console.log(`[FetchHandler] Restoring S3 link: ${s3Storage.s3Key}`);
                        record.latestS3Key = s3Storage.s3Key;
                        
                        updateScrapeURLWithS3Link(record.id, s3Storage.s3Key, s3Storage.id, context)
                            .catch(err => console.warn(`S3 link update failed: ${err.message}`));
                    }
                }
                
                return record;
            }
        } catch (gsiError2) {
            console.log(`[FetchHandler] byTournamentId GSI query failed: ${gsiError2.message}`);
        }
    } else {
        console.warn(`[FetchHandler] ⚠️ No entityId provided - skipping byTournamentId query to avoid cross-entity collision`);
    }
    
    // Method 3: Direct get by URL as ID (if that's how IDs are structured)
    try {
        const getResult = await ddbDocClient.send(new GetCommand({
            TableName: tableName,
            Key: { id: url }
        }));
        
        if (getResult.Item) {
            console.log(`[FetchHandler] Found existing ScrapeURL by URL-as-ID (entityId: ${getResult.Item.entityId})`);
            const record = getResult.Item;
            
            if (!record.latestS3Key) {
                const s3Storage = await findExistingS3Storage(url, entityId, tournamentId, context);
                if (s3Storage && s3Storage.s3Key) {
                    record.latestS3Key = s3Storage.s3Key;
                    updateScrapeURLWithS3Link(record.id, s3Storage.s3Key, s3Storage.id, context)
                        .catch(err => console.warn(`S3 link update failed: ${err.message}`));
                }
            }
            
            return record;
        }
    } catch (getError) {
        console.log(`[FetchHandler] Get by URL-as-ID failed: ${getError.message}`);
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // STEP 2: No existing record - check for S3Storage first
    // ═══════════════════════════════════════════════════════════════════
    const existingS3Storage = await findExistingS3Storage(url, entityId, tournamentId, context);
    
    // ═══════════════════════════════════════════════════════════════════
    // STEP 3: Create new ScrapeURL record with S3 link if available
    // ═══════════════════════════════════════════════════════════════════
    console.log(`[FetchHandler] Creating new ScrapeURL record for tournamentId: ${tournamentId}, entityId: ${entityId}`);
    
    const now = new Date().toISOString();
    const timestamp = Date.now();
    const recordId = url; // Use URL as ID for consistency
    
    const newRecord = {
        id: recordId,
        url: url,
        entityId: entityId,
        tournamentId: tournamentId,
        
        // Status tracking
        status: existingS3Storage ? 'CACHED' : 'PENDING',
        lastScrapeStatus: existingS3Storage ? 'SUCCESS' : null,
        gameStatus: existingS3Storage?.gameStatus || null,
        gameName: existingS3Storage?.gameName || null,
        
        // Flags
        doNotScrape: false,
        sourceDataIssue: false,
        gameDataVerified: false,
        placedIntoDatabase: existingS3Storage?.gameId ? true : false,
        
        // Scrape statistics (restore from S3Storage if available)
        timesScraped: existingS3Storage ? 1 : 0,
        timesSuccessful: existingS3Storage ? 1 : 0,
        timesFailed: 0,
        consecutiveFailures: 0,
        
        // S3 integration - CRITICAL: restore link from S3Storage
        s3StorageEnabled: true,
        latestS3Key: existingS3Storage?.s3Key || null,
        s3StoragePrefix: existingS3Storage ? `${entityId}/${tournamentId}/` : null,
        
        // HTTP caching headers
        etag: existingS3Storage?.etag || null,
        lastModifiedHeader: existingS3Storage?.lastModified || null,
        contentHash: existingS3Storage?.contentHash || null,
        contentSize: existingS3Storage?.contentSize || null,
        
        // Timestamps
        firstScrapedAt: existingS3Storage?.scrapedAt || now,
        lastScrapedAt: existingS3Storage?.scrapedAt || now,
        lastSuccessfulScrapeAt: existingS3Storage?.scrapedAt || null,
        createdAt: now,
        updatedAt: now,
        
        // DataStore fields
        _version: 1,
        _lastChangedAt: timestamp,
        __typename: 'ScrapeURL'
    };
    
    if (existingS3Storage) {
        console.log(`[FetchHandler] ✅ Restored S3 cache link: ${existingS3Storage.s3Key}`);
    }
    
    try {
        await ddbDocClient.send(new PutCommand({
            TableName: tableName,
            Item: newRecord,
            ConditionExpression: 'attribute_not_exists(id)'
        }));
        
        console.log(`[ScrapeURLManager] Created new ScrapeURL record for ${url}`);
        return newRecord;
        
    } catch (putError) {
        if (putError.name === 'ConditionalCheckFailedException') {
            console.log(`[FetchHandler] Record created by another process, fetching...`);
            try {
                const getResult = await ddbDocClient.send(new GetCommand({
                    TableName: tableName,
                    Key: { id: recordId }
                }));
                return getResult.Item || newRecord;
            } catch {
                return newRecord;
            }
        }
        
        console.error(`[FetchHandler] Failed to create ScrapeURL: ${putError.message}`);
        return newRecord; // Return in-memory record to allow scraping to continue
    }
};

/**
 * Update ScrapeURL record with S3 link
 */
const updateScrapeURLWithS3Link = async (scrapeURLId, s3Key, s3StorageId, context) => {
    const { ddbDocClient, getTableName } = context;
    const tableName = getTableName('ScrapeURL');
    
    try {
        await ddbDocClient.send(new UpdateCommand({
            TableName: tableName,
            Key: { id: scrapeURLId },
            UpdateExpression: 'SET latestS3Key = :s3Key, updatedAt = :now, #version = if_not_exists(#version, :zero) + :one',
            ExpressionAttributeNames: {
                '#version': '_version'
            },
            ExpressionAttributeValues: {
                ':s3Key': s3Key,
                ':now': new Date().toISOString(),
                ':zero': 0,
                ':one': 1
            }
        }));
        console.log(`[FetchHandler] Updated ScrapeURL with S3 link: ${s3Key}`);
    } catch (error) {
        console.warn(`[FetchHandler] Failed to update ScrapeURL with S3 link: ${error.message}`);
    }
};

/**
 * Robust wrapper around getScrapeURL that handles failures gracefully
 * and restores S3 cache links from S3Storage
 */
const robustGetScrapeURL = async (url, entityId, tournamentId, context) => {
    try {
        // First, try the standard getScrapeURL function
        const record = await getScrapeURL(url, entityId, tournamentId, context);
        
        if (record && record.id) {
            // Check if S3 link needs restoration
            if (!record.latestS3Key) {
                console.log(`[FetchHandler] ScrapeURL exists but missing S3 link, checking S3Storage...`);
                const s3Storage = await findExistingS3Storage(url, entityId, tournamentId, context);
                
                if (s3Storage && s3Storage.s3Key) {
                    console.log(`[FetchHandler] Restoring S3 link: ${s3Storage.s3Key}`);
                    record.latestS3Key = s3Storage.s3Key;
                    
                    // Update in DB (fire and forget)
                    updateScrapeURLWithS3Link(record.id, s3Storage.s3Key, s3Storage.id, context)
                        .catch(err => console.warn(`[FetchHandler] S3 link update failed: ${err.message}`));
                }
            }
            return record;
        }
        
        // getScrapeURL returned but no valid record, use fallback
        console.log(`[FetchHandler] getScrapeURL returned invalid record, using fallback`);
        return await getOrCreateScrapeURLFallback(url, entityId, tournamentId, context);
        
    } catch (error) {
        // getScrapeURL threw an error - use fallback
        console.warn(`[FetchHandler] getScrapeURL failed: ${error.message}, using fallback`);
        return await getOrCreateScrapeURLFallback(url, entityId, tournamentId, context);
    }
};

/**
 * Handle fetchTournamentData operation
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
    
    // ─────────────────────────────────────────────────────────────────
    // GET OR CREATE ScrapeURL WITH S3 CACHE LINK RESTORATION
    // This is the FIXED version that:
    // 1. Creates ScrapeURL if missing
    // 2. Restores latestS3Key from S3Storage if available
    // 3. CRITICAL: Filters by entityId to prevent cross-entity collisions
    // ─────────────────────────────────────────────────────────────────
    const scrapeURLRecord = await robustGetScrapeURL(url, entityId, tournamentId, context);
    
    console.log(`[FetchHandler] Using ScrapeURL: ${scrapeURLRecord.id?.substring(0, 50)}..., hasS3Key: ${!!scrapeURLRecord.latestS3Key}`);
    if (scrapeURLRecord.latestS3Key) {
        console.log(`[FetchHandler] S3 cache key: ${scrapeURLRecord.latestS3Key}`);
    }
    
    // Check doNotScrape flag
    if (scrapeURLRecord.doNotScrape && !forceRefresh && !overrideDoNotScrape) {
        console.log(`[FetchHandler] Skipping ${url} - marked as doNotScrape`);
        
        // Track attempt (don't fail if tracking fails)
        createScrapeAttempt({
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
        }, context).catch(err => console.warn(`[FetchHandler] Attempt tracking failed: ${err.message}`));
        
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
    const venues = await getAllVenues(context);
    console.log(`[FetchHandler] Loaded ${venues.length} venues for matching`);
    
    // ─────────────────────────────────────────────────────────────────
    // FETCH HTML (cache or live)
    // Now that scrapeURLRecord has latestS3Key restored, cache check works!
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
        createScrapeAttempt({
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
        }, context).catch(err => console.warn(`[FetchHandler] Attempt tracking failed: ${err.message}`));
        
        throw new Error(fetchResult.error || 'Fetch failed');
    }
    
    console.log(`[FetchHandler] Fetch succeeded, source: ${fetchResult.source}, usedCache: ${fetchResult.usedCache}`);
    
    // ─────────────────────────────────────────────────────────────────
    // PARSE HTML
    // ─────────────────────────────────────────────────────────────────
    const { data: scrapedData, foundKeys } = parseHtml(fetchResult.html, {
        url,
        venues,
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
    
    // Process structure fingerprint (non-critical)
    let isNewStructure = false;
    try {
        const fpResult = await processStructureFingerprint(foundKeys, scrapedData.structureLabel, url, context);
        isNewStructure = fpResult.isNewStructure;
    } catch (fpError) {
        console.warn(`[FetchHandler] Structure fingerprint failed: ${fpError.message}`);
    }
    scrapedData.isNewStructure = isNewStructure;
    
    // ─────────────────────────────────────────────────────────────────
    // UPDATE doNotScrape IF NEEDED
    // ─────────────────────────────────────────────────────────────────
    const shouldMarkDoNotScrape = DO_NOT_SCRAPE_STATUSES.includes(scrapedData.gameStatus) ||
                                   scrapedData.doNotScrape === true;
    
    if (shouldMarkDoNotScrape && !scrapeURLRecord.doNotScrape) {
        console.log(`[FetchHandler] Marking as doNotScrape: ${scrapedData.gameStatus}`);
        updateScrapeURLDoNotScrape(url, true, scrapedData.gameStatus, context)
            .catch(err => console.warn(`[FetchHandler] doNotScrape update failed: ${err.message}`));
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
        wasForced: forceRefresh || overrideDoNotScrape,
        usedCache: fetchResult.usedCache || false
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
            console.warn('[FetchHandler] S3Storage update failed:', s3UpdateError.message);
        }
    }
    
    // ─────────────────────────────────────────────────────────────────
    // TRACK SUCCESSFUL ATTEMPT
    // ─────────────────────────────────────────────────────────────────
    createScrapeAttempt({
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
    }, context).catch(err => console.warn(`[FetchHandler] Attempt tracking failed: ${err.message}`));
    
    monitoring.trackOperation('FETCH_SUCCESS', 'Tournament', tournamentId.toString(), {
        entityId,
        source: fetchResult.source,
        gameStatus: scrapedData.gameStatus,
        usedCache: fetchResult.usedCache
    });
    
    return result;
};

/**
 * Handle re-scrape from S3 cache
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
        const venues = await getAllVenues(context);
        
        // Parse HTML
        const { data: scrapedData, foundKeys } = parseHtml(s3Result.html, {
            url,
            venues,
            forceRefresh: true
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
            console.warn('[FetchHandler] S3Storage update during rescrape failed:', updateError.message);
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
    extractErrorType,
    // Export for testing
    robustGetScrapeURL,
    getOrCreateScrapeURLFallback,
    findExistingS3Storage
};