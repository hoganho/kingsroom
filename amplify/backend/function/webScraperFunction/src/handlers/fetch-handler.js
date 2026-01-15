/**
 * ===================================================================
 * Fetch Handler (v2.7.0)
 * ===================================================================
 * 
 * Handles the fetchTournamentData operation.
 * 
 * VERSION: 2.7.0
 * 
 * CHANGELOG:
 * - v2.7.0: Added saveAfterFetch option for auto-saving after fetch
 *           This enables refreshRunningGames to fetch AND save in one call
 *           When saveAfterFetch=true, automatically invokes save-handler
 *           after successful fetch (skips NOT_FOUND, NOT_PUBLISHED, ERROR)
 * - v2.6.0: Standardized on NOT_FOUND for empty tournament slots
 *           Added scrapeStatus field to results (from html-parser v2.3.0)
 *           NOT_FOUND = URL exists but no tournament assigned (empty slot)
 *           NOT_PUBLISHED = URL has real tournament but it's hidden
 *           Neither should create Game records
 *           Clarified comments to distinguish URL status from game status
 * - v2.5.0: NOT_FOUND/NOT _IN_USE no longer set doNotScrape=true
 *           These are empty tournament slots that need to keep being checked
 *           Only NOT_PUBLISHED (hidden tournament) sets doNotScrape=true
 * - v2.4.0: Removed lambda-monitoring dependency (no longer maintained)
 * - v2.3.0: Added entityId filtering to byTournamentId GSI queries
 * - v2.2.0: Robust ScrapeURL record creation, S3 cache link restoration
 * 
 * RESPONSIBILITIES:
 * - Orchestrate HTML retrieval (cache or live)
 * - Parse HTML to extract tournament data
 * - Track scraping activity
 * - Return parsed data to caller
 * - (v2.7.0) Optionally auto-save via saveAfterFetch flag
 * 
 * DOES NOT (unless saveAfterFetch=true):
 * - Save to Game table (caller must invoke saveTournamentData separately)
 * - Perform series detection (now handled by gameDataEnricher)
 * 
 * STATUS TERMINOLOGY (v2.6.0):
 * - scrapeStatus: URL/scrape-level status (NOT_FOUND, NOT_PUBLISHED, ERROR)
 *   These indicate the URL's state, NOT a game's state
 *   Games should NOT be created for NOT_FOUND or NOT_PUBLISHED URLs
 * - gameStatus: Actual game status (SCHEDULED, RUNNING, COMPLETED, etc.)
 *   Only meaningful when scrapeStatus indicates a real tournament exists
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

// ===================================================================
// STATUSES THAT SHOULD NOT TRIGGER AUTO-SAVE
// ===================================================================
const SKIP_SAVE_STATUSES = ['NOT_FOUND', 'NOT_PUBLISHED', 'ERROR', 'UNKNOWN'];

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
 */
const findExistingS3Storage = async (url, entityId, tournamentId, context) => {
    const { ddbDocClient, getTableName } = context;
    const tableName = getTableName('S3Storage');
    
    console.log(`[FetchHandler] Looking for existing S3Storage for tournamentId: ${tournamentId}, entityId: ${entityId}`);
    
    // Method 1: Query by entityTournamentKey composite GSI (PREFERRED)
    if (entityId && tournamentId) {
        try {
            const compositeKey = `${entityId}#${tournamentId}`;
            const queryResult = await ddbDocClient.send(new QueryCommand({
                TableName: tableName,
                IndexName: 'byEntityTournament',
                KeyConditionExpression: 'entityTournamentKey = :key',
                ExpressionAttributeValues: { 
                    ':key': compositeKey
                },
                Limit: 1
            }));
            
            if (queryResult.Items && queryResult.Items.length > 0) {
                const item = queryResult.Items[0];
                console.log(`[FetchHandler] ✅ Found S3Storage via byEntityTournament GSI: ${item.s3Key}`);
                return item;
            }
            console.log(`[FetchHandler] No S3Storage found via byEntityTournament GSI (key: ${compositeKey})`);
        } catch (gsiError) {
            console.log(`[FetchHandler] byEntityTournament GSI query failed: ${gsiError.message}`);
        }
    }
    
    // Method 2: Query by URL GSI (FALLBACK)
    if (url) {
        try {
            const queryResult = await ddbDocClient.send(new QueryCommand({
                TableName: tableName,
                IndexName: 'byURL',
                KeyConditionExpression: '#url = :url',
                ExpressionAttributeNames: { '#url': 'url' },
                ExpressionAttributeValues: { ':url': url },
                ScanIndexForward: false,
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
    
    // Method 3: Query by tournamentId GSI WITH entityId filter (LEGACY)
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
                ScanIndexForward: false,
                Limit: 20
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
 */
const getOrCreateScrapeURLFallback = async (url, entityId, tournamentId, context) => {
    const { ddbDocClient, getTableName } = context;
    const tableName = getTableName('ScrapeURL');
    
    console.log(`[FetchHandler] getOrCreateScrapeURLFallback for tournamentId: ${tournamentId}, entityId: ${entityId}`);
    
    // Method 1: Try GSI byURL (PREFERRED)
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
            console.log(`[FetchHandler] Found existing ScrapeURL via byURL GSI: ${record.id}`);
            
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
    } catch (gsiError) {
        console.log(`[FetchHandler] byURL GSI query failed: ${gsiError.message}`);
    }
    
    // Method 2: Try GSI byTournamentId WITH entityId filter
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
                Limit: 20
            }));
            
            if (queryResult.Items && queryResult.Items.length > 0) {
                const record = queryResult.Items[0];
                console.log(`[FetchHandler] Found existing ScrapeURL via byTournamentId GSI: ${record.id}`);
                
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
    }
    
    // Method 3: Direct get by URL as ID
    try {
        const getResult = await ddbDocClient.send(new GetCommand({
            TableName: tableName,
            Key: { id: url }
        }));
        
        if (getResult.Item) {
            console.log(`[FetchHandler] Found existing ScrapeURL by URL-as-ID`);
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
    
    // Check for S3Storage first
    const existingS3Storage = await findExistingS3Storage(url, entityId, tournamentId, context);
    
    // Create new ScrapeURL record
    console.log(`[FetchHandler] Creating new ScrapeURL record for tournamentId: ${tournamentId}, entityId: ${entityId}`);
    
    const now = new Date().toISOString();
    const timestamp = Date.now();
    const recordId = url;
    
    const newRecord = {
        id: recordId,
        url: url,
        entityId: entityId,
        tournamentId: tournamentId,
        status: existingS3Storage ? 'CACHED' : 'PENDING',
        lastScrapeStatus: existingS3Storage ? 'SUCCESS' : null,
        gameStatus: existingS3Storage?.gameStatus || null,
        gameName: existingS3Storage?.gameName || null,
        doNotScrape: false,
        sourceDataIssue: false,
        gameDataVerified: false,
        placedIntoDatabase: existingS3Storage?.gameId ? true : false,
        timesScraped: existingS3Storage ? 1 : 0,
        timesSuccessful: existingS3Storage ? 1 : 0,
        timesFailed: 0,
        consecutiveFailures: 0,
        s3StorageEnabled: true,
        latestS3Key: existingS3Storage?.s3Key || null,
        s3StoragePrefix: existingS3Storage ? `${entityId}/${tournamentId}/` : null,
        etag: existingS3Storage?.etag || null,
        lastModifiedHeader: existingS3Storage?.lastModified || null,
        contentHash: existingS3Storage?.contentHash || null,
        contentSize: existingS3Storage?.contentSize || null,
        firstScrapedAt: existingS3Storage?.scrapedAt || now,
        lastScrapedAt: existingS3Storage?.scrapedAt || now,
        lastSuccessfulScrapeAt: existingS3Storage?.scrapedAt || null,
        createdAt: now,
        updatedAt: now,
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
        
        console.log(`[FetchHandler] Created new ScrapeURL record for ${url}`);
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
        return newRecord;
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
 * Robust wrapper around getScrapeURL
 */
const robustGetScrapeURL = async (url, entityId, tournamentId, context) => {
    try {
        const record = await getScrapeURL(url, entityId, tournamentId, context);
        
        if (record && record.id) {
            if (!record.latestS3Key) {
                console.log(`[FetchHandler] ScrapeURL exists but missing S3 link, checking S3Storage...`);
                const s3Storage = await findExistingS3Storage(url, entityId, tournamentId, context);
                
                if (s3Storage && s3Storage.s3Key) {
                    console.log(`[FetchHandler] Restoring S3 link: ${s3Storage.s3Key}`);
                    record.latestS3Key = s3Storage.s3Key;
                    
                    updateScrapeURLWithS3Link(record.id, s3Storage.s3Key, s3Storage.id, context)
                        .catch(err => console.warn(`[FetchHandler] S3 link update failed: ${err.message}`));
                }
            }
            return record;
        }
        
        console.log(`[FetchHandler] getScrapeURL returned invalid record, using fallback`);
        return await getOrCreateScrapeURLFallback(url, entityId, tournamentId, context);
        
    } catch (error) {
        console.warn(`[FetchHandler] getScrapeURL failed: ${error.message}, using fallback`);
        return await getOrCreateScrapeURLFallback(url, entityId, tournamentId, context);
    }
};

/**
 * Handle fetchTournamentData operation
 * 
 * @param {object} options - Fetch options
 * @param {string} options.url - Tournament URL to fetch
 * @param {string} options.s3Key - S3 key for re-scrape (alternative to URL)
 * @param {string} options.entityId - Entity ID
 * @param {boolean} options.forceRefresh - Force live fetch (skip cache)
 * @param {boolean} options.overrideDoNotScrape - Override doNotScrape flag
 * @param {boolean} options.isRescrape - Is this a re-scrape from cache
 * @param {string} options.scraperJobId - Job ID for tracking
 * @param {string} options.scraperApiKey - API key for scraper service
 * @param {boolean} options.saveAfterFetch - (v2.7.0) Auto-save after successful fetch
 * @param {object} context - Shared context with AWS clients
 * @returns {object} Fetch result with parsed tournament data
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
        scraperApiKey = null,
        saveAfterFetch = false  // v2.7.0: New option for auto-save
    } = options;
    
    const { ddbDocClient, getTableName } = context;
    const startTime = Date.now();
    
    // CASE 1: Re-scrape from S3 cache
    if (s3Key && !url) {
        return await handleRescrapeFromCache(s3Key, options, context);
    }
    
    // CASE 2: Standard URL fetch
    if (!url) {
        throw new Error('URL is required for fetchTournamentData');
    }
    
    const tournamentId = getTournamentIdFromUrl(url);
    console.log(`[FetchHandler] v2.7.0 Starting fetch for tournament ${tournamentId}, entityId: ${entityId}, saveAfterFetch: ${saveAfterFetch}`);
    
    // Get or create ScrapeURL with S3 cache link restoration
    const scrapeURLRecord = await robustGetScrapeURL(url, entityId, tournamentId, context);
    
    console.log(`[FetchHandler] Using ScrapeURL: ${scrapeURLRecord.id?.substring(0, 50)}..., hasS3Key: ${!!scrapeURLRecord.latestS3Key}`);
    if (scrapeURLRecord.latestS3Key) {
        console.log(`[FetchHandler] S3 cache key: ${scrapeURLRecord.latestS3Key}`);
    }
    
    // Check doNotScrape flag
    if (scrapeURLRecord.doNotScrape && !forceRefresh && !overrideDoNotScrape) {
        console.log(`[FetchHandler] Skipping ${url} - marked as doNotScrape`);
        
        createScrapeAttempt({
            url,
            tournamentId,
            entityId,
            scrapeURLId: scrapeURLRecord.id,
            scraperJobId,
            status: 'SKIPPED_DONOTSCRAPE',
            processingTime: Date.now() - startTime,
            gameName: scrapeURLRecord.gameName,
            gameStatus: scrapeURLRecord.gameStatus || 'NOT_FOUND',
            source: 'SINGLE_SCRAPE'
        }, context).catch(err => console.warn(`[FetchHandler] Attempt tracking failed: ${err.message}`));
        
        return {
            tournamentId,
            name: 'Skipped - Do Not Scrape',
            scrapeStatus: 'NOT_FOUND',
            gameStatus: scrapeURLRecord.gameStatus || 'NOT_FOUND',
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
    
    // Fetch HTML (cache or live)
    const fetchResult = await enhancedHandleFetch(url, {
        scrapeURLRecord,
        entityId,
        tournamentId,
        forceRefresh,
        scraperApiKey
    }, context);
    
    if (!fetchResult.success) {
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
    
    // Parse HTML
    const { data: scrapedData, foundKeys } = parseHtml(fetchResult.html, {
        url,
        venues,
        forceRefresh
    });
    
    if (!scrapedData.tournamentId) {
        scrapedData.tournamentId = tournamentId;
    }
    
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
    
    // ═══════════════════════════════════════════════════════════════════════
    // v2.6.0: Determine scrapeStatus (URL-level status) vs gameStatus
    // ═══════════════════════════════════════════════════════════════════════
    
    const isNotFoundStatus = scrapedData.gameStatus === 'NOT_FOUND' || 
                             scrapedData.scrapeStatus === 'NOT_FOUND';
    
    const isNotPublishedStatus = scrapedData.gameStatus === 'NOT_PUBLISHED' ||
                                  scrapedData.scrapeStatus === 'NOT_PUBLISHED';
    
    if (isNotFoundStatus) {
        scrapedData.scrapeStatus = 'NOT_FOUND';
        scrapedData.gameStatus = 'NOT_FOUND';
    } else if (isNotPublishedStatus) {
        scrapedData.scrapeStatus = 'NOT_PUBLISHED';
        scrapedData.gameStatus = 'NOT_PUBLISHED';
    }
    
    // Update doNotScrape if needed
    const shouldMarkDoNotScrape = !isNotFoundStatus && (
        DO_NOT_SCRAPE_STATUSES.includes(scrapedData.gameStatus) ||
        scrapedData.doNotScrape === true
    );
    
    if (shouldMarkDoNotScrape && !scrapeURLRecord.doNotScrape) {
        console.log(`[FetchHandler] Marking as doNotScrape: ${scrapedData.gameStatus} (hidden tournament)`);
        updateScrapeURLDoNotScrape(url, true, scrapedData.gameStatus, context)
            .catch(err => console.warn(`[FetchHandler] doNotScrape update failed: ${err.message}`));
    }
    
    // v2.5.0/v2.6.0: Ensure NOT_FOUND has doNotScrape=false in the result
    if (isNotFoundStatus) {
        scrapedData.doNotScrape = false;
    }
    
    // Build result with both scrapeStatus and gameStatus
    const result = {
        tournamentId: scrapedData.tournamentId || tournamentId,
        name: scrapedData.name || 'Unnamed Tournament',
        scrapeStatus: scrapedData.scrapeStatus,
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
    
    // Update S3Storage with parsed data
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
    
    // Track successful attempt
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
    
    // ═══════════════════════════════════════════════════════════════════════
    // v2.7.0: AUTO-SAVE AFTER FETCH
    // When saveAfterFetch=true, automatically invoke save-handler
    // This enables refreshRunningGames to fetch AND save in a single call
    // ═══════════════════════════════════════════════════════════════════════
    if (saveAfterFetch) {
        // Check if we should skip saving (NOT_FOUND, NOT_PUBLISHED, ERROR, etc.)
        const effectiveStatus = scrapedData.scrapeStatus || scrapedData.gameStatus;
        const shouldSkipSave = SKIP_SAVE_STATUSES.includes(effectiveStatus);
        
        if (shouldSkipSave) {
            console.log(`[FetchHandler] Skipping auto-save: status is ${effectiveStatus}`);
            result.autoSaved = false;
            result.autoSaveSkipped = true;
            result.autoSaveSkipReason = effectiveStatus;
        } else {
            console.log(`[FetchHandler] 🔄 Auto-saving after fetch (saveAfterFetch=true)`);
            
            try {
                // Import save-handler dynamically to avoid circular dependency
                const { handleSave } = require('./save-handler');
                
                const saveResult = await handleSave({
                    sourceUrl: url,
                    data: result,
                    entityId,
                    scraperJobId,
                    doNotScrape: scrapedData.doNotScrape || false
                }, context);
                
                result.autoSaved = true;
                result.autoSaveResult = {
                    success: true,
                    gameId: saveResult.id,
                    action: saveResult.action,
                    fieldsUpdated: saveResult.fieldsUpdated
                };
                
                console.log(`[FetchHandler] ✅ Auto-save completed: ${saveResult.action} game ${saveResult.id}`);
                
            } catch (saveError) {
                console.error('[FetchHandler] ❌ Auto-save failed:', saveError.message);
                result.autoSaved = false;
                result.autoSaveError = saveError.message;
            }
        }
    }
    
    // Log completion
    const statusLog = scrapedData.scrapeStatus 
        ? `scrapeStatus: ${scrapedData.scrapeStatus}` 
        : `gameStatus: ${scrapedData.gameStatus}`;
    const autoSaveLog = saveAfterFetch ? `, autoSaved: ${result.autoSaved}` : '';
    console.log(`[FetchHandler] ✅ Fetch complete for tournament ${tournamentId}, ${statusLog}${autoSaveLog}`);
    
    return result;
};

/**
 * Handle re-scrape from S3 cache
 */
const handleRescrapeFromCache = async (s3Key, options, context) => {
    const { entityId, scraperJobId, saveAfterFetch = false } = options;
    const startTime = Date.now();
    
    console.log(`[FetchHandler] Re-scrape from cache: ${s3Key}, saveAfterFetch: ${saveAfterFetch}`);
    
    try {
        // Get HTML from S3
        const s3Result = await getHtmlFromS3(s3Key, context);
        
        if (!s3Result || !s3Result.html) {
            throw new Error(`No HTML found in S3 at key: ${s3Key}`);
        }
        
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
        
        if (!scrapedData.tournamentId) {
            scrapedData.tournamentId = tournamentId;
        }
        
        // Determine scrapeStatus for rescrape results
        const isNotFoundStatus = scrapedData.gameStatus === 'NOT_FOUND' || 
                                 scrapedData.scrapeStatus === 'NOT_FOUND';
        
        const isNotPublishedStatus = scrapedData.gameStatus === 'NOT_PUBLISHED' ||
                                      scrapedData.scrapeStatus === 'NOT_PUBLISHED';
        
        if (isNotFoundStatus) {
            scrapedData.scrapeStatus = 'NOT_FOUND';
            scrapedData.gameStatus = 'NOT_FOUND';
        } else if (isNotPublishedStatus) {
            scrapedData.scrapeStatus = 'NOT_PUBLISHED';
            scrapedData.gameStatus = 'NOT_PUBLISHED';
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
        
        const result = {
            tournamentId: scrapedData.tournamentId,
            name: scrapedData.name || 'Unnamed Tournament',
            scrapeStatus: scrapedData.scrapeStatus,
            gameStatus: scrapedData.gameStatus || 'SCHEDULED',
            hasGuarantee: scrapedData.hasGuarantee || false,
            doNotScrape: scrapedData.doNotScrape || false,
            s3Key,
            ...scrapedData,
            source: 'RESCRAPE_CACHE',
            entityId,
            isRescrape: true,
            processingTimeMs: Date.now() - startTime
        };
        
        // v2.7.0: Auto-save for rescrape if requested
        if (saveAfterFetch && url) {
            const effectiveStatus = scrapedData.scrapeStatus || scrapedData.gameStatus;
            const shouldSkipSave = SKIP_SAVE_STATUSES.includes(effectiveStatus);
            
            if (shouldSkipSave) {
                console.log(`[FetchHandler] Skipping auto-save (rescrape): status is ${effectiveStatus}`);
                result.autoSaved = false;
                result.autoSaveSkipped = true;
            } else {
                console.log(`[FetchHandler] 🔄 Auto-saving after rescrape`);
                
                try {
                    const { handleSave } = require('./save-handler');
                    
                    const saveResult = await handleSave({
                        sourceUrl: url,
                        data: result,
                        entityId,
                        scraperJobId,
                        doNotScrape: scrapedData.doNotScrape || false
                    }, context);
                    
                    result.autoSaved = true;
                    result.autoSaveResult = {
                        success: true,
                        gameId: saveResult.id,
                        action: saveResult.action
                    };
                    
                    console.log(`[FetchHandler] ✅ Rescrape auto-save completed: ${saveResult.action}`);
                    
                } catch (saveError) {
                    console.error('[FetchHandler] ❌ Rescrape auto-save failed:', saveError.message);
                    result.autoSaved = false;
                    result.autoSaveError = saveError.message;
                }
            }
        }
        
        const statusLog = scrapedData.scrapeStatus 
            ? `scrapeStatus: ${scrapedData.scrapeStatus}` 
            : `gameStatus: ${scrapedData.gameStatus}`;
        console.log(`[FetchHandler] ✅ Re-scrape complete, tournamentId: ${scrapedData.tournamentId}, ${statusLog}`);
        
        return result;
        
    } catch (error) {
        console.error(`[FetchHandler] Re-scrape error: ${error.message}`);
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
    robustGetScrapeURL,
    getOrCreateScrapeURLFallback,
    findExistingS3Storage
};