/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_ENTITYTABLE_ARN
	API_KINGSROOM_ENTITYTABLE_NAME
	API_KINGSROOM_GAMETABLE_ARN
	API_KINGSROOM_GAMETABLE_NAME
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_PLAYERENTRYTABLE_ARN
	API_KINGSROOM_PLAYERENTRYTABLE_NAME
	API_KINGSROOM_PLAYERTABLE_ARN
	API_KINGSROOM_PLAYERTABLE_NAME
	API_KINGSROOM_S3STORAGETABLE_ARN
	API_KINGSROOM_S3STORAGETABLE_NAME
	API_KINGSROOM_SCRAPEATTEMPTTABLE_ARN
	API_KINGSROOM_SCRAPEATTEMPTTABLE_NAME
	API_KINGSROOM_SCRAPERJOBTABLE_ARN
	API_KINGSROOM_SCRAPERJOBTABLE_NAME
	API_KINGSROOM_SCRAPESTRUCTURETABLE_ARN
	API_KINGSROOM_SCRAPESTRUCTURETABLE_NAME
	API_KINGSROOM_SCRAPEURLTABLE_ARN
	API_KINGSROOM_SCRAPEURLTABLE_NAME
	API_KINGSROOM_TOURNAMENTSERIESTITLETABLE_ARN
	API_KINGSROOM_TOURNAMENTSERIESTITLETABLE_NAME
	API_KINGSROOM_TOURNAMENTSTRUCTURETABLE_ARN
	API_KINGSROOM_TOURNAMENTSTRUCTURETABLE_NAME
	API_KINGSROOM_VENUETABLE_ARN
	API_KINGSROOM_VENUETABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */

/**
 * ===================================================================
 * WEB SCRAPER FUNCTION - REFACTORED
 * 
 * This version delegates all SAVE operations to the saveGameFunction Lambda.
 * The webScraperFunction now focuses ONLY on:
 * - Fetching HTML (live or from S3 cache)
 * - Parsing HTML to extract tournament data
 * - Returning parsed data to the caller
 * 
 * The saveGameFunction handles:
 * - Saving/updating games in DynamoDB
 * - Venue resolution
 * - ScrapeAttempt tracking
 * - PDP queueing
 * ===================================================================
 */

const axios = require('axios');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, QueryCommand, UpdateCommand, GetCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

// --- Lambda Monitoring ---
const { LambdaMonitoring } = require('./lambda-monitoring');

// Import the refactored modules
const { enhancedHandleFetch } = require('./enhanced-handleFetch');
const { runScraper, getTournamentId, getStatusAndReg } = require('./scraperStrategies');
const { updateS3StorageWithParsedData } = require('./update-s3storage-with-parsed-data');

// VENUE ASSIGNMENT CONSTANTS
const UNASSIGNED_VENUE_ID = "00000000-0000-0000-0000-000000000000";
const UNASSIGNED_VENUE_NAME = "Unassigned";

// DEFAULT ENTITY
const DEFAULT_ENTITY_ID = "42101695-1332-48e3-963b-3c6ad4e909a0"; 

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);
const s3Client = new S3Client({});
const lambdaClient = new LambdaClient({});

const S3_BUCKET = process.env.S3_BUCKET || 'pokerpro-scraper-storage';
const SAVE_GAME_FUNCTION_NAME = process.env.SAVE_GAME_FUNCTION_NAME || `saveGameFunction-${process.env.ENV}`;

// --- Lambda Monitoring Initialization ---
const monitoring = new LambdaMonitoring('webScraperFunction', DEFAULT_ENTITY_ID);
const monitoredDdbDocClient = monitoring.wrapDynamoDBClient(ddbDocClient);

// --- Entity Helper Functions ---
const getEntityIdFromUrl = async (url) => {
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        const entityTable = getTableName('Entity');
        const scanResult = await monitoredDdbDocClient.send(new ScanCommand({
            TableName: entityTable,
            FilterExpression: 'gameUrlDomain = :domain',
            ExpressionAttributeValues: { ':domain': domain }
        }));
        if (scanResult.Items && scanResult.Items.length > 0) {
            return scanResult.Items[0].id;
        }
        return DEFAULT_ENTITY_ID;
    } catch (error) {
        console.error('[Entity] Error determining entity from URL:', error);
        return DEFAULT_ENTITY_ID;
    }
};

const ensureDefaultEntity = async () => {
    const entityTable = getTableName('Entity');
    const entityId = DEFAULT_ENTITY_ID;
    try {
        const getResult = await monitoredDdbDocClient.send(new GetCommand({
            TableName: entityTable, Key: { id: entityId }
        }));
        if (!getResult.Item) {
            monitoring.trackOperation('DEFAULT_ENTITY_CREATE', 'Entity', entityId);
            const now = new Date().toISOString();
            const timestamp = Date.now();
            await monitoredDdbDocClient.send(new PutCommand({
                TableName: entityTable,
                Item: {
                    id: entityId, 
                    entityName: 'Default Entity', 
                    gameUrlDomain: 'default.com',
                    gameUrlPath: '/', 
                    isActive: true, 
                    createdAt: now, 
                    updatedAt: now,
                    _version: 1, 
                    _lastChangedAt: timestamp,
                    __typename: 'Entity'
                }
            }));
            console.log('[Entity] Created default entity');
        }
        return entityId;
    } catch (error) {
        console.error('[Entity] Error ensuring default entity:', error);
        return DEFAULT_ENTITY_ID;
    }
};

// --- Date Helper Functions ---
const ensureISODate = (dateValue, fallback = null) => {
    if (!dateValue) return fallback || new Date().toISOString();
    if (typeof dateValue === 'string' && dateValue.includes('T')) {
        try {
            const testDate = new Date(dateValue);
            if (!isNaN(testDate.getTime())) return dateValue;
        } catch (e) {}
    }
    if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
        return `${dateValue}T00:00:00.000Z`;
    }
    try {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) return date.toISOString();
    } catch (error) {
        console.error(`Failed to parse date: ${dateValue}`, error);
    }
    return fallback || new Date().toISOString();
};

const getTableName = (modelName) => {
    const specialTables = {
        'Entity': process.env.API_KINGSROOM_ENTITYTABLE_NAME,
        'ScraperJob': process.env.API_KINGSROOM_SCRAPERJOBTABLE_NAME,
        'ScrapeURL': process.env.API_KINGSROOM_SCRAPEURLTABLE_NAME,
        'ScrapeAttempt': process.env.API_KINGSROOM_SCRAPEATTEMPTTABLE_NAME,
        'ScraperState': process.env.API_KINGSROOM_SCRAPERSTATETABLE_NAME,
        'Game': process.env.API_KINGSROOM_GAMETABLE_NAME,
        'Venue': process.env.API_KINGSROOM_VENUETABLE_NAME,
        'TournamentStructure': process.env.API_KINGSROOM_TOURNAMENTSTRUCTURETABLE_NAME,
        'TournamentSeries': process.env.API_KINGSROOM_TOURNAMENTSERIESTABLE_NAME,
        'TournamentSeriesTitle': process.env.API_KINGSROOM_TOURNAMENTSERIESTITLETABLE_NAME,
        'PlayerEntry': process.env.API_KINGSROOM_PLAYERENTRYTABLE_NAME,
        'PlayerResult': process.env.API_KINGSROOM_PLAYERRESULTTABLE_NAME,
        'PlayerSummary': process.env.API_KINGSROOM_PLAYERSUMMARYTABLE_NAME,
        'Player': process.env.API_KINGSROOM_PLAYERTABLE_NAME,
        'PlayerTransaction': process.env.API_KINGSROOM_PLAYERTRANSACTIONTABLE_NAME,
        'PlayerVenue': process.env.API_KINGSROOM_PLAYERVENUETABLE_NAME,
        'ScrapeStructure': process.env.API_KINGSROOM_SCRAPESTRUCTURETABLE_NAME,
        'S3Storage': process.env.API_KINGSROOM_S3STORAGETABLE_NAME,
    };
    if (specialTables[modelName]) return specialTables[modelName];
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    if (!apiId || !env) throw new Error(`API ID or environment name not found.`);
    return `${modelName}-${apiId}-${env}`;
};

const getAllVenues = async () => {
    const venueTable = getTableName('Venue');
    try {
        const command = new ScanCommand({
            TableName: venueTable,
            ProjectionExpression: 'id, #name, aliases',
            ExpressionAttributeNames: { '#name': 'name' }
        });
        const response = await monitoredDdbDocClient.send(command);
        return response.Items || [];
    } catch (error) {
        console.error('Error fetching venues from DynamoDB:', error);
        return [];
    }
};

const getAllSeriesTitles = async () => {
    const seriesTitleTable = getTableName('TournamentSeriesTitle');
    try {
        const command = new ScanCommand({
            TableName: seriesTitleTable,
            ProjectionExpression: 'id, title, aliases'
        });
        const response = await monitoredDdbDocClient.send(command);
        return response.Items || [];
    } catch (error) {
        console.error('Error fetching series titles from DynamoDB:', error);
        return [];
    }
};

/**
 * Get or create ScrapeURL record
 */
const getOrCreateScrapeURL = async (url, tournamentId, entityId) => {
    const scrapeURLTable = getTableName('ScrapeURL');
    try {
        const response = await monitoredDdbDocClient.send(new GetCommand({ 
            TableName: scrapeURLTable, 
            Key: { id: url } 
        }));
        
        if (response.Item) {
            return response.Item;
        }
        
        // Create new record if doesn't exist
        const now = new Date().toISOString();
        const timestamp = Date.now();
        
        const newRecord = {
            id: url, 
            url, 
            tournamentId: parseInt(tournamentId, 10), 
            entityId: entityId || DEFAULT_ENTITY_ID,
            status: 'ACTIVE', 
            doNotScrape: false,
            placedIntoDatabase: false, 
            firstScrapedAt: now, 
            lastScrapedAt: now,
            timesScraped: 0, 
            timesSuccessful: 0, 
            timesFailed: 0, 
            consecutiveFailures: 0, 
            sourceSystem: "KINGSROOM_WEB",
            s3StorageEnabled: true, 
            createdAt: now, 
            updatedAt: now, 
            __typename: 'ScrapeURL', 
            _version: 1,
            _lastChangedAt: timestamp,
            _deleted: null
        };
        
        await monitoredDdbDocClient.send(new PutCommand({ 
            TableName: scrapeURLTable, 
            Item: newRecord 
        }));
        
        return newRecord;
    } catch (error) {
        console.error('[getOrCreateScrapeURL] Error:', error);
        return { 
            id: url, 
            tournamentId: parseInt(tournamentId, 10), 
            s3StorageEnabled: false,
            doNotScrape: false
        };
    }
};

/**
 * Process structure fingerprint
 */
const processStructureFingerprint = async (foundKeys, structureLabel, sourceUrl) => {
    const structureTable = getTableName('ScrapeStructure');
    const sortedKeys = [...foundKeys].sort();
    const structureId = crypto.createHash('sha256').update(sortedKeys.join(',')).digest('hex').substring(0, 16);
    const now = new Date().toISOString();
    const timestamp = Date.now();

    try {
        const getResponse = await monitoredDdbDocClient.send(new QueryCommand({
            TableName: structureTable, KeyConditionExpression: 'id = :id', ExpressionAttributeValues: { ':id': structureId }
        }));
        const isNew = getResponse.Items.length === 0;
        if (isNew) {
            monitoring.trackOperation('FINGERPRINT_NEW', 'ScrapeStructure', structureId, { structureLabel, sourceUrl });
            console.log(`Saving new structure fingerprint: ${structureId}`);
            await monitoredDdbDocClient.send(new PutCommand({
                TableName: structureTable,
                Item: {
                    id: structureId, fields: foundKeys, structureLabel: structureLabel,
                    occurrenceCount: 1, firstSeenAt: now, lastSeenAt: now, exampleUrl: sourceUrl,
                    __typename: "ScrapeStructure", createdAt: now, updatedAt: now, 
                    _version: 1, _lastChangedAt: timestamp
                }
            }));
            return { isNewStructure: true, structureLabel };
        } else {
            await monitoredDdbDocClient.send(new UpdateCommand({
                TableName: structureTable, Key: { id: structureId },
                UpdateExpression: 'SET lastSeenAt = :now, occurrenceCount = occurrenceCount + :inc, updatedAt = :now, #lca = :timestamp',
                ExpressionAttributeNames: { '#lca': '_lastChangedAt' },
                ExpressionAttributeValues: { ':now': now, ':inc': 1, ':timestamp': timestamp }
            }));
            return { isNewStructure: false, structureLabel: structureLabel }; 
        }
    } catch (error) {
        console.error('Error processing structure fingerprint:', error);
        return { isNewStructure: false, structureLabel };
    }
};

/**
 * Scrape data from HTML
 */
const scrapeDataFromHtml = async (html, venues, seriesTitles, url, forceRefresh = false) => {
    const { data, foundKeys } = runScraper(html, null, venues, seriesTitles, url, forceRefresh);
    
    if (!data.tournamentId) {
        data.tournamentId = getTournamentId(url);
    }
    
    if (!data.structureLabel) {
        data.structureLabel = `STATUS: ${data.gameStatus || 'UNKNOWN'} | REG: ${data.registrationStatus || 'UNKNOWN'}`;
    }
    if (!foundKeys.includes('structureLabel')) foundKeys.push('structureLabel');

    const { isNewStructure } = await processStructureFingerprint(foundKeys, data.structureLabel, url);
    data.isNewStructure = isNewStructure;

    console.log(`[DEBUG-SCRAPER] Scraped status: ${data.gameStatus}, doNotScrape: ${data.doNotScrape}, tournamentId: ${data.tournamentId}, forceRefresh: ${forceRefresh}`);
    return { data, foundKeys };
};

/**
 * Download HTML from S3
 */
const downloadHtmlFromS3 = async (s3Key) => {
    console.log(`[S3_CACHE] Downloading HTML from S3: ${s3Key}`);
    
    try {
        const command = new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: s3Key
        });
        
        const response = await s3Client.send(command);
        
        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        const html = Buffer.concat(chunks).toString('utf8');
        
        console.log(`[S3_CACHE] Downloaded ${html.length} bytes of HTML from S3`);
        return html;
        
    } catch (error) {
        console.error(`[S3_CACHE] Error downloading from S3:`, error);
        throw new Error(`Failed to download HTML from S3: ${error.message}`);
    }
};

/**
 * Extract player data for processing
 */
const extractPlayerDataForProcessing = (scrapedData) => {
    if (!scrapedData) return { 
        allPlayers: [], 
        totalPlayers: 0, 
        hasCompleteResults: false 
    };
    
    const results = scrapedData.results || [];
    const entries = scrapedData.entries || [];
    const seating = scrapedData.seating || [];
    const playerMap = new Map();
    
    if (results.length > 0) {
        results.forEach(result => {
            if (result.name) {
                playerMap.set(result.name, { 
                    name: result.name, 
                    rank: result.rank, 
                    winnings: result.winnings || 0, 
                    points: result.points || 0, 
                    isQualification: result.isQualification || false 
                });
            }
        });
    } else {
        entries.forEach(entry => {
            if (entry.name && !playerMap.has(entry.name)) {
                playerMap.set(entry.name, { name: entry.name });
            }
        });
        seating.forEach(seat => {
            if (seat.name && !playerMap.has(seat.name)) {
                playerMap.set(seat.name, { name: seat.name });
            }
        });
    }
    
    const allPlayers = Array.from(playerMap.values());
    const hasCompleteResults = results.length > 0 && results.some(r => r.rank);
    
    return {
        allPlayers,
        totalPlayers: allPlayers.length,
        hasCompleteResults
    };
};

/**
 * ===================================================================
 * REFACTORED: handleSave now invokes saveGameFunction Lambda
 * ===================================================================
 */
const handleSave = async (sourceUrl, venueId, data, existingGameId, doNotScrape = false, entityId, scraperJobId = null) => {
    const effectiveEntityId = entityId || DEFAULT_ENTITY_ID;
    
    console.log(`[handleSave] Delegating save to saveGameFunction for ${sourceUrl}`);
    
    let parsedData;
    try {
        parsedData = typeof data === 'string' ? JSON.parse(data) : data;
    } catch (error) {
        console.error('[handleSave] Failed to parse data:', error);
        parsedData = {};
    }
    
    const tournamentId = parsedData.tournamentId || getTournamentId(sourceUrl);
    
    // Extract player data
    const playerData = extractPlayerDataForProcessing(parsedData);
    
    // Build SaveGameInput for saveGameFunction
    const saveGameInput = {
        source: {
            type: 'SCRAPE',
            sourceId: sourceUrl,
            entityId: effectiveEntityId,
            fetchedAt: new Date().toISOString(),
            contentHash: parsedData.contentHash || null
        },
        game: {
            tournamentId: tournamentId,
            existingGameId: existingGameId || null,
            name: parsedData.name || `Tournament ${tournamentId}`,
            gameType: parsedData.gameType || 'TOURNAMENT',
            gameStatus: parsedData.gameStatus || 'SCHEDULED',
            gameVariant: parsedData.gameVariant || 'NLHE',
            gameStartDateTime: ensureISODate(parsedData.gameStartDateTime),
            gameEndDateTime: parsedData.gameEndDateTime ? ensureISODate(parsedData.gameEndDateTime) : null,
            registrationStatus: parsedData.registrationStatus || null,
            buyIn: parsedData.buyIn || 0,
            rake: parsedData.rake || 0,
            startingStack: parsedData.startingStack || 0,
            hasGuarantee: parsedData.hasGuarantee || false,
            guaranteeAmount: parsedData.guaranteeAmount || 0,
            prizepool: parsedData.prizepool || 0,
            totalEntries: parsedData.totalEntries || 0,
            playersRemaining: parsedData.playersRemaining || null,
            totalRebuys: parsedData.totalRebuys || 0,
            totalAddons: parsedData.totalAddons || 0,
            totalDuration: parsedData.totalDuration || null,
            isSatellite: parsedData.isSatellite || false,
            isSeries: parsedData.isSeries || false,
            isRegular: parsedData.isRegular || false,
            seriesName: parsedData.seriesName || null,
            gameFrequency: parsedData.gameFrequency || null,
            gameTags: parsedData.gameTags || [],
            levels: parsedData.levels || [],
            revenueByBuyIns: parsedData.revenueByBuyIns || null,
            profitLoss: parsedData.profitLoss || null,
            guaranteeSurplus: parsedData.guaranteeSurplus || null,
            guaranteeOverlay: parsedData.guaranteeOverlay || null,
            totalRake: parsedData.totalRake || null
        },
        series: parsedData.isSeries ? {
            seriesId: parsedData.tournamentSeriesId || null,  // Manual override
            seriesName: parsedData.seriesName || null,
            suggestedSeriesId: parsedData.seriesMatch?.autoAssignedSeries?.id || null,  // From scraper
            confidence: parsedData.seriesMatch?.autoAssignedSeries?.score || 0,
            // Include structure fields
            isMainEvent: parsedData.isMainEvent || false,
            eventNumber: parsedData.eventNumber || null,
            dayNumber: parsedData.dayNumber || null,
            flightLetter: parsedData.flightLetter || null,
            finalDay: parsedData.finalDay || false,
            year: parsedData.seriesYear || new Date(parsedData.gameStartDateTime || new Date()).getFullYear()
        } : null,
        players: playerData.totalPlayers > 0 ? {
            allPlayers: playerData.allPlayers,
            totalPlayers: playerData.totalPlayers,
            hasCompleteResults: playerData.hasCompleteResults
        } : null,
        venue: {
            venueId: venueId || null,
            venueName: parsedData.venueName || null,
            suggestedVenueId: parsedData.venueMatch?.autoAssignedVenue?.id || null,
            confidence: parsedData.venueMatch?.suggestions?.[0]?.score || 0
        },
        options: {
            skipPlayerProcessing: false,
            forceUpdate: !!existingGameId,
            doNotScrape: doNotScrape,
            scraperJobId: scraperJobId
        }
    };
    
    // Invoke saveGameFunction Lambda
    try {
        monitoring.trackOperation('INVOKE_SAVE_GAME', 'Game', tournamentId.toString(), { entityId: effectiveEntityId });
        
        const invokeCommand = new InvokeCommand({
            FunctionName: SAVE_GAME_FUNCTION_NAME,
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify({ input: saveGameInput })
        });
        
        const response = await lambdaClient.send(invokeCommand);
        
        // Parse response
        const responsePayload = JSON.parse(Buffer.from(response.Payload).toString());
        
        if (responsePayload.errorMessage) {
            throw new Error(responsePayload.errorMessage);
        }
        
        console.log(`[handleSave] saveGameFunction response:`, {
            success: responsePayload.success,
            action: responsePayload.action,
            gameId: responsePayload.gameId,
            playerProcessingQueued: responsePayload.playerProcessingQueued
        });
        
        if (!responsePayload.success) {
            throw new Error(responsePayload.message || 'saveGameFunction failed');
        }

        if (responsePayload.success && responsePayload.gameId && parsedData.s3Key) {
            try {
                const s3StorageTable = getTableName('S3Storage');
                
                // Find the S3Storage record by tournamentId + entityId
                const queryResult = await monitoredDdbDocClient.send(new QueryCommand({
                    TableName: s3StorageTable,
                    IndexName: 'byTournamentId',
                    KeyConditionExpression: 'tournamentId = :tid',
                    FilterExpression: 'entityId = :eid',
                    ExpressionAttributeValues: { 
                        ':tid': tournamentId,
                        ':eid': effectiveEntityId
                    },
                    ScanIndexForward: false,
                    Limit: 1
                }));
            
                if (queryResult.Items && queryResult.Items.length > 0) {
                    const s3Record = queryResult.Items[0];
                    const now = new Date().toISOString();
                    const timestamp = Date.now();
                    
                    await monitoredDdbDocClient.send(new UpdateCommand({
                        TableName: s3StorageTable,
                        Key: { id: s3Record.id },
                        UpdateExpression: `
                            SET gameId = :gameId,
                                wasGameCreated = :created,
                                wasGameUpdated = :updated,
                                updatedAt = :now,
                                #lca = :timestamp
                        `,
                        ExpressionAttributeNames: { '#lca': '_lastChangedAt' },
                        ExpressionAttributeValues: {
                            ':gameId': responsePayload.gameId,
                            ':created': responsePayload.action === 'CREATED',
                            ':updated': responsePayload.action === 'UPDATED',
                            ':now': now,
                            ':timestamp': timestamp
                        }
                    }));
                    
                    console.log(`[handleSave] Linked S3Storage ${s3Record.id} to game ${responsePayload.gameId}`);
                }
            } catch (linkError) {
                console.warn('[handleSave] Failed to link S3Storage to game:', linkError.message);
            }
        }
        
        // Return a compatible response structure
        return {
            id: responsePayload.gameId,
            name: parsedData.name,
            gameStatus: parsedData.gameStatus,
            venueId: responsePayload.venueAssignment?.venueId,
            entityId: effectiveEntityId,
            sourceUrl: sourceUrl,
            action: responsePayload.action,
            playerProcessingQueued: responsePayload.playerProcessingQueued,
            playerProcessingReason: responsePayload.playerProcessingReason,
            fieldsUpdated: responsePayload.fieldsUpdated || []
        };
        
    } catch (error) {
        console.error(`[handleSave] Error invoking saveGameFunction:`, error);
        monitoring.trackOperation('SAVE_GAME_ERROR', 'Game', tournamentId.toString(), { 
            error: error.message, 
            entityId: effectiveEntityId 
        });
        throw error;
    }
};

/**
 * Handle Fetch Range
 */
const handleFetchRange = async (startId, endId, entityId) => {
    monitoring.trackOperation('FETCH_RANGE_START', 'Game', `${startId}-${endId}`, { entityId });
    console.log(`[handleFetchRange] Processing ${startId} to ${endId}`);
    if (startId > endId || endId - startId + 1 > 100) throw new Error('Invalid range (max 100).');

    const allResults = [];
    const chunkSize = 10;
    const effectiveEntityId = entityId || DEFAULT_ENTITY_ID;

    for (let i = startId; i <= endId; i += chunkSize) {
        const chunkEnd = Math.min(i + chunkSize - 1, endId);
        const chunkPromises = [];
        for (let j = i; j <= chunkEnd; j++) {
            const url = `https://kingsroom.com.au/tournament/?id=${j}`;
            chunkPromises.push((async () => {
                try {
                    const scrapeURLRecord = await getOrCreateScrapeURL(url, j, effectiveEntityId);
                    const result = await enhancedHandleFetch(url, scrapeURLRecord, effectiveEntityId, j, false, monitoredDdbDocClient);
                    
                    if (!result.success) throw new Error(result.error);
                    
                    const { data } = await scrapeDataFromHtml(result.html, [], [], url);
                    
                    return { ...data, id: j.toString(), rawHtml: null };
                } catch (error) {
                    return { id: j.toString(), error: error.message };
                }
            })());
        }
        const settled = await Promise.allSettled(chunkPromises);
        allResults.push(...settled.map(r => r.status === 'fulfilled' ? r.value : { error: r.reason }));
    }
    
    monitoring.trackOperation('FETCH_RANGE_COMPLETE', 'Game', `${startId}-${endId}`, { resultsCount: allResults.length, entityId });
    return allResults;
};

// Helper function to update ScrapeURL doNotScrape status
const updateScrapeURLDoNotScrape = async (url, doNotScrape, gameStatus) => {
    const scrapeURLTable = getTableName('ScrapeURL');
    try {
        await monitoredDdbDocClient.send(new UpdateCommand({
            TableName: scrapeURLTable,
            Key: { id: url },
            UpdateExpression: 'SET doNotScrape = :dns, gameStatus = :gs, lastScrapeStatus = :lss, updatedAt = :now',
            ExpressionAttributeValues: {
                ':dns': doNotScrape,
                ':gs': gameStatus,
                ':lss': doNotScrape ? 'SKIPPED_DONOTSCRAPE' : 'SUCCESS',
                ':now': new Date().toISOString()
            }
        }));
        console.log(`[UpdateScrapeURL] Set doNotScrape=${doNotScrape} for ${url}`);
    } catch (error) {
        console.error('[UpdateScrapeURL] Error updating doNotScrape:', error);
    }
};

// --- MAIN LAMBDA HANDLER ---
exports.handler = async (event) => {
    console.log('[HANDLER] Incoming event:', JSON.stringify(event, null, 2));
    
    let entityId = DEFAULT_ENTITY_ID;
    let jobId = null;
    let triggerSource = 'MANUAL';
    
    const operationName = event.fieldName || event.operationType || event.operation || 'fetchTournamentData';
    const args = event.arguments || event || {};
    
    if (args.jobId) jobId = args.jobId;
    if (args.triggerSource) triggerSource = args.triggerSource;
    
    await ensureDefaultEntity();
    
    try {
        if (operationName === 'fetchTournamentData' || operationName === 'FETCH') {
            const url = args.url;
            if (url) {
                const urlEntityId = await getEntityIdFromUrl(url);
                if (urlEntityId) entityId = urlEntityId;
            }
        }
        
        entityId = args.entityId || DEFAULT_ENTITY_ID;
        
        monitoring.entityId = entityId; 
        
        monitoring.trackOperation('HANDLER_START', 'Handler', operationName, { entityId, jobId, triggerSource });
        console.log(`[HANDLER] Op: ${operationName}. Job: ${jobId || 'N/A'}, Entity: ${entityId}`);
        
        try {
            switch (operationName) {
                case 'fetchTournamentData':
                case 'FETCH':
                    const fetchUrl = args.url;
                    const s3KeyParam = args.s3Key;
                    const forceRefresh = args.forceRefresh || false;
                    const overrideDoNotScrape = args.overrideDoNotScrape || false;
                    
                    // Handle S3 cache scenario
                    if (s3KeyParam) {
                        console.log(`[FETCH] 🔒 S3 CACHE MODE - Using cached HTML`);
                        console.log(`[FETCH] 🔒 S3 key: ${s3KeyParam}`);
                        console.log(`[FETCH] 🔒 This path should NEVER create new S3 files`);
                        
                        monitoring.trackOperation('FETCH_FROM_CACHE', 'Game', 'cached', { 
                            s3Key: s3KeyParam, 
                            entityId 
                        });
                        
                        try {
                            // Download HTML from S3
                            const cachedHtml = await downloadHtmlFromS3(s3KeyParam);
                            
                            // Get venues and series titles for parsing
                            const [venues, seriesTitles] = await Promise.all([
                                getAllVenues(), 
                                getAllSeriesTitles()
                            ]);
                            
                            // Parse using existing scrapeDataFromHtml function
                            const { data: scrapedData, foundKeys } = await scrapeDataFromHtml(
                                cachedHtml,
                                venues,
                                seriesTitles,
                                fetchUrl || 'cached',
                                false
                            );
                            
                            // Get S3Storage metadata
                            let s3StorageRecord = null;
                            try {
                                const s3StorageTable = getTableName('S3Storage');
                                const queryCommand = new QueryCommand({
                                    TableName: s3StorageTable,
                                    IndexName: 'byS3Key',
                                    KeyConditionExpression: 's3Key = :key',
                                    ExpressionAttributeValues: { ':key': s3KeyParam },
                                    Limit: 1
                                });
                                const queryResult = await monitoredDdbDocClient.send(queryCommand);
                                s3StorageRecord = queryResult.Items?.[0];
                                
                                if (!s3StorageRecord) {
                                    console.warn('[FETCH] ⚠️ No S3Storage record found for s3Key:', s3KeyParam);
                                }
                            } catch (metadataError) {
                                console.warn('[FETCH] Could not fetch S3Storage metadata:', metadataError.message);
                            }
                            
                            // Build response with S3_CACHE source
                            const result = {
                                tournamentId: scrapedData.tournamentId || s3StorageRecord?.tournamentId || 1,
                                name: scrapedData.name || 'Unnamed Tournament',
                                gameStatus: scrapedData.gameStatus || 'SCHEDULED',
                                hasGuarantee: scrapedData.hasGuarantee || false,
                                doNotScrape: scrapedData.doNotScrape || false,
                                s3Key: s3KeyParam,
                                ...scrapedData,
                                source: 'S3_CACHE',
                                sourceUrl: s3StorageRecord?.url || fetchUrl || null,
                                reScrapedAt: new Date().toISOString(),
                                contentHash: s3StorageRecord?.contentHash || null,
                                entityId: entityId || s3StorageRecord?.entityId || DEFAULT_ENTITY_ID
                            };
                            
                            // ✅ Update S3Storage with parsed data (even if HTML unchanged)
                            // This captures improvements from evolved scraper strategies
                            try {
                                const s3StorageTable = getTableName('S3Storage');
                                const updateResult = await updateS3StorageWithParsedData(
                                    s3KeyParam,
                                    scrapedData,
                                    foundKeys,
                                    monitoredDdbDocClient,
                                    s3StorageTable,
                                    true, // isRescrape = true (from cache)
                                    s3StorageRecord?.url || fetchUrl, // URL for fallback lookup
                                    scrapedData.tournamentId || s3StorageRecord?.tournamentId, // tournamentId for primary lookup
                                    entityId || s3StorageRecord?.entityId // entityId for primary lookup
                                );
                                
                                console.log(`[FETCH] S3Storage update result:`, {
                                    source: 'S3_CACHE',
                                    dataChanged: updateResult.dataChanged,
                                    gameStatus: updateResult.gameStatus,
                                    registrationStatus: updateResult.registrationStatus,
                                    fieldsExtracted: updateResult.extractedFields?.length
                                });
                                
                                // Add update info to result
                                result.s3StorageUpdated = updateResult.success;
                                result.dataChanged = updateResult.dataChanged;
                                
                            } catch (s3UpdateError) {
                                console.warn('[FETCH] Failed to update S3Storage with parsed data:', s3UpdateError.message);
                                // Don't fail the whole operation if S3Storage update fails
                            }
                            
                            console.log(`[FETCH] ✅ Successfully parsed cached HTML for tournament ${result.tournamentId}`);
                            console.log(`[FETCH] ✅ NO NEW S3 FILE CREATED (cache mode)`);
                            
                            monitoring.trackOperation('CACHE_PARSE_SUCCESS', 'Game', result.tournamentId, {
                                s3Key: s3KeyParam,
                                entityId: result.entityId
                            });
                            
                            // CRITICAL: Return here to prevent falling through to live fetch
                            return result;
                            
                        } catch (cacheError) {
                            console.error('[FETCH] Error processing S3 cache:', cacheError);
                            throw new Error(`Failed to process cached HTML: ${cacheError.message}`);
                        }
                    }
                    
                    // Live fetch
                    if (!fetchUrl) {
                        throw new Error('No URL or s3Key provided for fetch operation');
                    }
                    
                    monitoring.trackOperation('FETCH_START', 'Game', getTournamentId(fetchUrl).toString(), { entityId });
                    
                    const tournamentId = getTournamentId(fetchUrl);
                    const scrapeURLRecord = await getOrCreateScrapeURL(fetchUrl, tournamentId, entityId);
                    
                    // Check doNotScrape
                    if (scrapeURLRecord.doNotScrape && !forceRefresh && !overrideDoNotScrape) {
                        console.log(`[FETCH] Skipping ${fetchUrl} - marked as doNotScrape`);
                        return {
                            tournamentId: tournamentId,
                            name: 'Skipped - Do Not Scrape',
                            gameStatus: scrapeURLRecord.gameStatus || 'NOT_IN_USE',
                            hasGuarantee: false,
                            doNotScrape: true,
                            s3Key: '',
                            skipped: true,
                            skipReason: 'DO_NOT_SCRAPE',
                            entityId: entityId
                        };
                    }
                    
                    const [venues, seriesTitles] = await Promise.all([
                        getAllVenues(), 
                        getAllSeriesTitles()
                    ]);
                    
                    const fetchResult = await enhancedHandleFetch(
                        fetchUrl, 
                        scrapeURLRecord, 
                        entityId, 
                        tournamentId, 
                        forceRefresh, 
                        monitoredDdbDocClient
                    );
                    
                    if (!fetchResult.success) {
                        throw new Error(fetchResult.error || 'Fetch failed');
                    }
                    
                    const { data: scrapedData, foundKeys } = await scrapeDataFromHtml(
                        fetchResult.html, 
                        venues, 
                        seriesTitles, 
                        fetchUrl,
                        forceRefresh
                    );
                    
                    const shouldMarkDoNotScrape = scrapedData.gameStatus === 'NOT_PUBLISHED' || 
                                                 scrapedData.gameStatus === 'NOT_IN_USE' ||
                                                 scrapedData.doNotScrape === true;
                    
                    if (shouldMarkDoNotScrape && !scrapeURLRecord.doNotScrape) {
                        console.log(`[HANDLER] Marking tournament as doNotScrape due to status: ${scrapedData.gameStatus}`);
                        await updateScrapeURLDoNotScrape(fetchUrl, true, scrapedData.gameStatus);
                    }

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
                        entityId: entityId,
                        wasForced: forceRefresh || overrideDoNotScrape
                    };
                    
                    // Update S3Storage with parsed data
                    if (fetchResult.s3Key) {
                        try {
                            const s3StorageTable = getTableName('S3Storage');
                            const updateResult = await updateS3StorageWithParsedData(
                                fetchResult.s3Key,
                                scrapedData,
                                foundKeys,
                                monitoredDdbDocClient,
                                s3StorageTable,
                                false,
                                fetchUrl,
                                scrapedData.tournamentId || tournamentId,
                                entityId
                            );
                            
                            result.s3StorageUpdated = updateResult.success;
                            result.dataChanged = updateResult.dataChanged;
                            
                        } catch (s3UpdateError) {
                            console.warn('[FETCH] Failed to update S3Storage with parsed data:', s3UpdateError.message);
                        }
                    }
                    
                    return result;

                case 'saveTournamentData':
                case 'SAVE': {
                    monitoring.trackOperation('SAVE_DATA', 'Game', args.input?.existingGameId || args.existingGameId || 'new', { entityId });
                    
                    const input = args.input || args;
                    const fullScrapedData = input.originalScrapedData || input.data;

                    return await handleSave(
                        input.sourceUrl, 
                        input.venueId, 
                        fullScrapedData,
                        input.existingGameId,
                        input.doNotScrape, 
                        input.entityId || entityId,
                        jobId
                    );
                }
                
                case 'fetchTournamentDataRange': {
                    monitoring.trackOperation('FETCH_RANGE', 'Game', `${args.startId}-${args.endId}`, { entityId });
                    const rangeForceRefresh = args.forceRefresh || false;
                    return await handleFetchRange(args.startId, args.endId, entityId, rangeForceRefresh);
                }
                
                case 'reScrapeFromCache': {
                    console.log('[HANDLER] reScrapeFromCache invoked');
                    monitoring.trackOperation('RESCRAPE_CACHE', 'Game', 'cached', { entityId });
                    
                    const input = args.input || args;
                    if (!input.s3Key) {
                        throw new Error('s3Key is required for reScrapeFromCache');
                    }
                    
                    return await exports.handler({
                        fieldName: 'fetchTournamentData',
                        arguments: {
                            s3Key: input.s3Key,
                            url: input.url || null
                        },
                        identity: event.identity
                    });
                }
                
                default:
                    throw new Error(`Unknown operation: ${operationName}.`);
            }
        } catch (error) {
            console.error('[HANDLER] CRITICAL Error:', error);
            monitoring.trackOperation('HANDLER_ERROR', 'Handler', 'fatal', { 
                error: error.message, 
                operationName, 
                entityId 
            });

            if (operationName === 'fetchTournamentData' || operationName === 'FETCH') {
                const url = args.url || '';
                const tournamentId = getTournamentId(url) || 1;
                
                return {
                    tournamentId: tournamentId,
                    name: 'Error processing tournament',
                    gameStatus: 'SCHEDULED', 
                    hasGuarantee: false,
                    doNotScrape: true,
                    s3Key: '',
                    error: error.message || 'Internal Lambda Error',
                    status: 'ERROR',
                    registrationStatus: 'N_A',
                    entityId: entityId
                };
            }
            
            return { errorMessage: error.message || 'Internal Lambda Error' };
        }
    } finally {
        if (monitoring) {
            console.log('[HANDLER] Flushing monitoring metrics...');
            await monitoring.flush();
            console.log('[HANDLER] Monitoring flush complete.');
        }
    }
};