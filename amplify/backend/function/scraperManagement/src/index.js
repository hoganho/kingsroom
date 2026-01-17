/* Amplify Params - DO NOT EDIT
    API_KINGSROOM_GAMETABLE_ARN
    API_KINGSROOM_GAMETABLE_NAME
    API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
    API_KINGSROOM_GRAPHQLAPIIDOUTPUT
    API_KINGSROOM_SCRAPEATTEMPTTABLE_ARN
    API_KINGSROOM_SCRAPEATTEMPTTABLE_NAME
    API_KINGSROOM_SCRAPERJOBTABLE_ARN
    API_KINGSROOM_SCRAPERJOBTABLE_NAME
    API_KINGSROOM_SCRAPERSTATETABLE_ARN
    API_KINGSROOM_SCRAPERSTATETABLE_NAME
    API_KINGSROOM_SCRAPEURLTABLE_ARN
    API_KINGSROOM_SCRAPEURLTABLE_NAME
    API_KINGSROOM_VENUETABLE_ARN
    API_KINGSROOM_VENUETABLE_NAME
    ENV
    FUNCTION_AUTOSCRAPER_NAME
    FUNCTION_WEBSCRAPERFUNCTION_NAME
    REGION
Amplify Params - DO NOT EDIT */

// scraperManagement Lambda Function
// UPDATED: Async invocation of autoScraper with threshold passthrough
//
// Architecture:
// - scraperManagement: API layer, job CRUD, ScrapeURL management
// - autoScraper: Execution engine (invoked asynchronously)

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand, UpdateCommand, GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { randomUUID } = require('crypto');

// --- Lambda Monitoring ---
const { LambdaMonitoring } = require('./lambda-monitoring');

const client = new DynamoDBClient({});
const originalDdbDocClient = DynamoDBDocumentClient.from(client);
const lambdaClient = new LambdaClient({});

const monitoring = new LambdaMonitoring('scraperManagement', null);
const monitoredDdbDocClient = monitoring.wrapDynamoDBClient(originalDdbDocClient);

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

const getTableName = (modelName) => {
    const envVarName = `TABLE_${modelName.toUpperCase().replace(/-/g, '_')}`;
    if (process.env[envVarName]) {
        return process.env[envVarName];
    }
    
    const specialTables = {
        'ScraperState': process.env.API_KINGSROOM_SCRAPERSTATETABLE_NAME,
        'Game': process.env.API_KINGSROOM_GAMETABLE_NAME,
        'ScraperJob': process.env.API_KINGSROOM_SCRAPERJOBTABLE_NAME,
        'ScrapeURL': process.env.API_KINGSROOM_SCRAPEURLTABLE_NAME,
        'ScrapeAttempt': process.env.API_KINGSROOM_SCRAPEATTEMPTTABLE_NAME
    };
    
    if (specialTables[modelName]) return specialTables[modelName];
    
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    if (!apiId || !env) {
        throw new Error(`Cannot determine table name for ${modelName}: API ID or ENV not found`);
    }
    
    return `${modelName}-${apiId}-${env}`;
};

/**
 * Get all active entities that should be scraped on schedule
 */
async function getActiveEntities() {
    const tableName = getTableName('Entity');
    
    try {
        const result = await monitoredDdbDocClient.send(new ScanCommand({
            TableName: tableName,
            FilterExpression: 'isActive = :active',
            ExpressionAttributeValues: {
                ':active': true
            }
        }));
        
        console.log(`[getActiveEntities] Found ${result.Items?.length || 0} active entities`);
        return result.Items || [];
    } catch (error) {
        console.error('[getActiveEntities] Error:', error);
        return [];
    }
}

function getStartTimeForRange(timeRange, now) {
    const ranges = {
        'LAST_HOUR': 60 * 60 * 1000,
        'LAST_24_HOURS': 24 * 60 * 60 * 1000,
        'LAST_7_DAYS': 7 * 24 * 60 * 60 * 1000,
        'LAST_30_DAYS': 30 * 24 * 60 * 60 * 1000
    };
    const ms = ranges[timeRange] || ranges['LAST_24_HOURS'];
    return new Date(now.getTime() - ms);
}

function extractErrorType(errorMessage) {
    if (!errorMessage) return 'UNKNOWN';
    if (errorMessage.includes('timeout')) return 'TIMEOUT';
    if (errorMessage.includes('ECONNREFUSED')) return 'CONNECTION_REFUSED';
    if (errorMessage.includes('404')) return 'NOT_FOUND';
    if (errorMessage.includes('500')) return 'SERVER_ERROR';
    if (errorMessage.includes('venue')) return 'VENUE_ERROR';
    if (errorMessage.includes('parse')) return 'PARSE_ERROR';
    if (errorMessage.includes('DynamoDB')) return 'DATABASE_ERROR';
    
    const colonIndex = errorMessage.indexOf(':');
    if (colonIndex > 0 && colonIndex < 50) {
        return errorMessage.substring(0, colonIndex).trim().toUpperCase().replace(/\s+/g, '_');
    }
    return 'OTHER';
}

// ===================================================================
// MAIN HANDLER
// ===================================================================

exports.handler = async (event, context) => {
    // ===== HANDLE CLOUDWATCH SCHEDULED EVENTS =====
    if (event['detail-type'] === 'Scheduled Event' && event.source === 'aws.events') {
        monitoring.trackOperation('SCHEDULED_EVENT', 'Handler', 'cloudwatch', { 
            ruleArn: event.resources?.[0] || 'unknown'
        });
        
        try {
            // Trigger auto-scraping for all active entities
            const activeEntities = await getActiveEntities();
            console.log(`[SCHEDULED] Found ${activeEntities.length} active entities to scrape`);
            
            const results = [];
            for (const entity of activeEntities) {
                try {
                    console.log(`[SCHEDULED] Starting scrape job for entity: ${entity.entityName || entity.id}`);
                    const job = await startScraperJob({ 
                        input: { 
                            entityId: entity.id, 
                            mode: 'bulk',
                            triggerSource: 'SCHEDULED',
                            triggeredBy: 'cloudwatch-schedule'
                        }
                    }, event);
                    results.push({ entityId: entity.id, jobId: job.id, status: 'started' });
                } catch (entityError) {
                    console.error(`[SCHEDULED] Failed to start job for ${entity.id}:`, entityError.message);
                    results.push({ entityId: entity.id, status: 'failed', error: entityError.message });
                }
            }
            
            return { 
                statusCode: 200, 
                body: 'Scheduled scrape jobs started',
                processedAt: new Date().toISOString(),
                entitiesProcessed: activeEntities.length,
                results
            };
        } catch (error) {
            monitoring.trackOperation('SCHEDULED_EVENT_ERROR', 'Handler', 'cloudwatch', { 
                error: error.message 
            });
            console.error('[SCHEDULED] Error:', error);
            return { 
                statusCode: 500, 
                body: `Scheduled event failed: ${error.message}` 
            };
        } finally {
            await monitoring.flush();
        }
    }
    
    // ===== HANDLE GRAPHQL RESOLVER EVENTS =====
    const { typeName, fieldName, arguments: args } = event;
    const operation = `${typeName}.${fieldName}`;
    
    const entityId = args?.entityId || args?.input?.entityId || null;
    monitoring.entityId = entityId;

    monitoring.trackOperation('HANDLER_START', 'Handler', operation, { 
        entityId, 
        operation,
        hasArgs: !!args 
    });

    try {
        try {
            switch (operation) {
                // ===== QUERIES =====
                case 'Query.getScraperJobsReport':
                    return await getScraperJobsReport(args);
                    
                case 'Query.searchScrapeURLs':
                    return await searchScrapeURLs(args);
                    
                case 'Query.getScraperMetrics':
                    return await getScraperMetrics(args);
                    
                case 'Query.getUpdateCandidateURLs':
                    return await getUpdateCandidateURLs(args);
                    
                case 'Query.fetchScrapeURLDetails':
                    return await fetchScrapeURLDetails(args);
                
                case 'Query.getScraperJob':
                    return await getScraperJob(args);
                    
                // ===== MUTATIONS =====
                case 'Mutation.startScraperJob':
                    return await startScraperJob(args, event);
                    
                case 'Mutation.cancelScraperJob':
                    return await cancelScraperJob(args);
                    
                case 'Mutation.modifyScrapeURLStatus':
                    return await modifyScrapeURLStatus(args);
                    
                case 'Mutation.bulkModifyScrapeURLs':
                    return await bulkModifyScrapeURLs(args);
                    
                default:
                    throw new Error(`Unknown operation: ${operation}`);
            }
        } catch (error) {
            monitoring.trackOperation('HANDLER_ERROR', 'Handler', 'fatal', { 
                error: error.message, 
                operationName: operation 
            });
            throw error;
        }
    } finally {
        if (monitoring) {
            await monitoring.flush();
        }
    }
};

// ===================================================================
// NEW: getScraperJob - Get single job by ID
// ===================================================================

async function getScraperJob({ jobId, id }) {
    const targetId = jobId || id;
    monitoring.trackOperation('GET_JOB', 'ScraperJob', targetId, { jobId: targetId });

    try {
        const tableName = getTableName('ScraperJob');
        const result = await monitoredDdbDocClient.send(new GetCommand({
            TableName: tableName,
            Key: { id: targetId }
        }));
        
        return result.Item || null;
    } catch (error) {
        throw new Error(`Failed to get scraper job: ${error.message}`);
    }
}

// ===================================================================
// UPDATED: startScraperJob - Creates job record, invokes autoScraper async
// ===================================================================

async function startScraperJob({ input }, event) {
    const {
        entityId,
        mode = 'bulk',
        triggerSource = 'MANUAL',
        triggeredBy = 'user',
        
        // Scrape options
        useS3 = true,
        forceRefresh = false,
        skipNotPublished = true,
        skipNotFoundGaps = true,
        skipInProgress = false,
        ignoreDoNotScrape = false,
        
        // API Key for scraping
        scraperApiKey = null,
        
        // Save options
        saveToDatabase = true,
        defaultVenueId,
        
        // Mode-specific parameters
        bulkCount,
        startId,
        endId,
        maxId,
        gapIds,
        
        // Stopping thresholds (NEW - from frontend)
        maxConsecutiveNotFound = 10,
        maxConsecutiveErrors = 3,
        maxConsecutiveBlanks = 5,
        maxTotalErrors = 15,
    } = input;

    if (!entityId) {
        throw new Error('entityId is required');
    }

    monitoring.entityId = entityId;
    monitoring.trackOperation('START_JOB_REQUEST', 'ScraperJob', 'new', { 
        entityId,
        mode,
        triggerSource,
        thresholds: { maxConsecutiveNotFound, maxConsecutiveErrors, maxConsecutiveBlanks }
    });

    try {
        // =====================================================================
        // STEP 1: Create the ScraperJob record immediately
        // =====================================================================
        const jobId = randomUUID();
        const now = new Date().toISOString();
        const timestamp = Date.now();

        const jobRecord = {
            id: jobId,
            jobId: jobId,
            entityId,
            status: 'PENDING',
            mode,
            triggerSource,
            triggeredBy,
            
            // Configuration
            useS3,
            forceRefresh,
            skipNotPublished,
            skipNotFoundGaps,
            skipInProgress,
            ignoreDoNotScrape,
            saveToDatabase,
            defaultVenueId: defaultVenueId || null,
            scraperApiKey: scraperApiKey || null,
            
            // Mode-specific params
            bulkCount: bulkCount || null,
            startId: startId || null,
            endId: endId || null,
            maxId: maxId || null,
            gapIds: gapIds || null,
            
            // Thresholds (stored for reference)
            maxConsecutiveNotFound,
            maxConsecutiveErrors,
            maxConsecutiveBlanks,
            maxTotalErrors,
            
            // Progress counters (initialized)
            totalURLsProcessed: 0,
            currentId: null,
            newGamesScraped: 0,
            gamesUpdated: 0,
            gamesSkipped: 0,
            errors: 0,
            notFoundCount: 0,
            blanks: 0,
            s3CacheHits: 0,
            
            // Consecutive counters
            consecutiveNotFound: 0,
            consecutiveErrors: 0,
            consecutiveBlanks: 0,
            
            // Timing
            startTime: now,
            endTime: null,
            durationSeconds: null,
            
            // Stop info
            stopReason: null,
            lastErrorMessage: null,
            
            // DataStore fields
            createdAt: now,
            updatedAt: now,
            _version: 1,
            _lastChangedAt: timestamp,
            __typename: 'ScraperJob',
        };

        const jobTable = getTableName('ScraperJob');
        await monitoredDdbDocClient.send(new PutCommand({
            TableName: jobTable,
            Item: jobRecord,
        }));

        // =====================================================================
        // STEP 2: Invoke autoScraper ASYNCHRONOUSLY (Event type = fire-and-forget)
        // =====================================================================
        const autoScraperPayload = {
            operation: 'executeJob',
            jobId,
            entityId,
            
            // Pass all configuration
            mode,
            useS3,
            forceRefresh,
            skipNotPublished,
            skipNotFoundGaps,
            skipInProgress,
            ignoreDoNotScrape,
            saveToDatabase,
            defaultVenueId,
            scraperApiKey,
            
            // Mode params
            bulkCount,
            startId,
            endId,
            maxId,
            gapIds,
            
            // Thresholds (IMPORTANT: passed from frontend)
            maxConsecutiveNotFound,
            maxConsecutiveErrors,
            maxConsecutiveBlanks,
            maxTotalErrors,
        };

        const functionName = process.env.FUNCTION_AUTOSCRAPER_NAME 
            || process.env.AUTO_SCRAPER_FUNCTION 
            || `autoScraper-${process.env.ENV}`;

        monitoring.trackOperation('LAMBDA_INVOKE_ASYNC', 'Lambda', functionName, { 
            jobId,
            mode,
            invocationType: 'Event'
        });

        // ASYNC invocation - don't wait for completion
        await lambdaClient.send(new InvokeCommand({
            FunctionName: functionName,
            InvocationType: 'Event',  // Async! Returns immediately
            Payload: JSON.stringify(autoScraperPayload),
        }));

        // =====================================================================
        // STEP 3: Update job status to RUNNING
        // =====================================================================
        await monitoredDdbDocClient.send(new UpdateCommand({
            TableName: jobTable,
            Key: { id: jobId },
            UpdateExpression: 'SET #status = :status, updatedAt = :now, #lca = :lca',
            ExpressionAttributeNames: {
                '#status': 'status',
                '#lca': '_lastChangedAt',
            },
            ExpressionAttributeValues: {
                ':status': 'RUNNING',
                ':now': new Date().toISOString(),
                ':lca': Date.now(),
            },
        }));

        // =====================================================================
        // STEP 4: Return the job record immediately
        // Frontend will subscribe to updates via onScraperJobUpdate
        // =====================================================================
        return {
            ...jobRecord,
            status: 'RUNNING',
        };
        
    } catch (error) {
        monitoring.trackOperation('START_JOB_ERROR', 'ScraperJob', 'error', { 
            error: error.message 
        });
        throw new Error(`Failed to start scraper job: ${error.message}`);
    }
}

// ===================================================================
// cancelScraperJob - Updated to handle async jobs
// ===================================================================

async function cancelScraperJob({ jobId }) {
    monitoring.trackOperation('CANCEL_JOB_REQUEST', 'ScraperJob', jobId, { jobId });

    try {
        const jobTable = getTableName('ScraperJob');
        const now = new Date().toISOString();
        const timestamp = Date.now();
        
        // Update job status to CANCELLED
        const updateParams = {
            TableName: jobTable,
            Key: { id: jobId },
            UpdateExpression: `SET 
                #status = :status, 
                stopReason = :stopReason,
                endTime = :endTime, 
                updatedAt = :updatedAt,
                #lca = :lastChangedAt,
                #v = if_not_exists(#v, :zero) + :one`,
            ExpressionAttributeNames: { 
                '#status': 'status',
                '#lca': '_lastChangedAt',
                '#v': '_version'
            },
            ExpressionAttributeValues: {
                ':status': 'STOPPED_MANUAL',
                ':stopReason': 'Cancelled by user',
                ':endTime': now,
                ':updatedAt': now,
                ':lastChangedAt': timestamp,
                ':zero': 0,
                ':one': 1
            },
            ReturnValues: 'ALL_NEW'
        };
        
        const result = await monitoredDdbDocClient.send(new UpdateCommand(updateParams));
        
        // Also signal autoScraper to stop (if it's checking)
        // This sets a flag that the running job can check
        const functionName = process.env.FUNCTION_AUTOSCRAPER_NAME 
            || process.env.AUTO_SCRAPER_FUNCTION 
            || `autoScraper-${process.env.ENV}`;
        
        monitoring.trackOperation('LAMBDA_INVOKE', 'Lambda', functionName, { 
            targetFunction: functionName,
            operation: 'cancelJob'
        });

        // Fire-and-forget cancellation signal
        await lambdaClient.send(new InvokeCommand({
            FunctionName: functionName,
            InvocationType: 'Event',
            Payload: JSON.stringify({
                operation: 'cancelJob',
                jobId,
            })
        }));
        
        return result.Attributes || { id: jobId, status: 'STOPPED_MANUAL' };
        
    } catch (error) {
        throw new Error(`Failed to cancel job: ${error.message}`);
    }
}

// ===================================================================
// QUERY IMPLEMENTATIONS (unchanged, included for completeness)
// ===================================================================

async function getScraperJobsReport({ entityId, status, limit = 20, nextToken }) {
    monitoring.trackOperation('GET_JOBS_REPORT', 'ScraperJob', status || 'all', { status, limit });

    try {
        const tableName = getTableName('ScraperJob');
        
        // Build scan/query params
        const params = {
            TableName: tableName,
            Limit: limit,
        };

        const filterExpressions = [];
        const expressionAttributeValues = {};
        const expressionAttributeNames = {};

        if (entityId) {
            filterExpressions.push('entityId = :entityId');
            expressionAttributeValues[':entityId'] = entityId;
        }

        if (status) {
            filterExpressions.push('#status = :status');
            expressionAttributeNames['#status'] = 'status';
            expressionAttributeValues[':status'] = status;
        }

        if (filterExpressions.length > 0) {
            params.FilterExpression = filterExpressions.join(' AND ');
        }
        if (Object.keys(expressionAttributeValues).length > 0) {
            params.ExpressionAttributeValues = expressionAttributeValues;
        }
        if (Object.keys(expressionAttributeNames).length > 0) {
            params.ExpressionAttributeNames = expressionAttributeNames;
        }
        
        if (nextToken) {
            params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
        }
        
        const result = await monitoredDdbDocClient.send(new ScanCommand(params));
        
        // Sort by startTime (newest first)
        const items = (result.Items || []).sort((a, b) => {
            const aTime = new Date(a.startTime || 0).getTime();
            const bTime = new Date(b.startTime || 0).getTime();
            return bTime - aTime;
        });
        
        return {
            items: items.slice(0, limit),
            nextToken: result.LastEvaluatedKey ? 
                Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : null
        };
        
    } catch (error) {
        return { items: [], nextToken: null };
    }
}

async function searchScrapeURLs({ entityId, entityIds, status, limit = 100, nextToken }) {
    monitoring.trackOperation('SEARCH_URLS', 'ScrapeURL', 'search', { 
        entityId,
        entityIdsCount: entityIds?.length || 0,
        status 
    });

    try {
        const tableName = getTableName('ScrapeURL');
        
        let effectiveEntityIds = [];
        if (entityId) {
            effectiveEntityIds = [entityId];
        } else if (entityIds && entityIds.length > 0) {
            effectiveEntityIds = entityIds;
        }
        
        // Single entity - use GSI query
        if (effectiveEntityIds.length === 1) {
            try {
                const params = {
                    TableName: tableName,
                    IndexName: 'byEntityScrapeURL',
                    KeyConditionExpression: 'entityId = :entityId',
                    ExpressionAttributeValues: { ':entityId': effectiveEntityIds[0] },
                    Limit: limit
                };
                
                if (status) {
                    params.FilterExpression = '#status = :status';
                    params.ExpressionAttributeNames = { '#status': 'status' };
                    params.ExpressionAttributeValues[':status'] = status;
                }
                
                if (nextToken) {
                    try {
                        params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
                    } catch (e) {
                        // Invalid nextToken, ignore
                    }
                }
                
                const result = await monitoredDdbDocClient.send(new QueryCommand(params));
                
                const sortedItems = (result.Items || []).sort((a, b) => 
                    (b.tournamentId || 0) - (a.tournamentId || 0)
                );
                
                return {
                    items: sortedItems,
                    nextToken: result.LastEvaluatedKey 
                        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') 
                        : null
                };
                
            } catch (indexError) {
                // GSI query failed, falling back to scan
            }
        }
        
        // Fallback to scan
        const scanParams = {
            TableName: tableName,
            Limit: Math.min(limit * 3, 1000)
        };
        
        const filterExpressions = [];
        const expressionAttributeValues = {};
        const expressionAttributeNames = {};
        
        if (effectiveEntityIds.length > 0) {
            if (effectiveEntityIds.length === 1) {
                filterExpressions.push('entityId = :entityId');
                expressionAttributeValues[':entityId'] = effectiveEntityIds[0];
            } else {
                const entityPlaceholders = effectiveEntityIds.map((_, i) => `:entityId${i}`);
                filterExpressions.push(`entityId IN (${entityPlaceholders.join(', ')})`);
                effectiveEntityIds.forEach((id, i) => {
                    expressionAttributeValues[`:entityId${i}`] = id;
                });
            }
        }
        
        if (status) {
            filterExpressions.push('#status = :status');
            expressionAttributeNames['#status'] = 'status';
            expressionAttributeValues[':status'] = status;
        }
        
        if (filterExpressions.length > 0) {
            scanParams.FilterExpression = filterExpressions.join(' AND ');
        }
        if (Object.keys(expressionAttributeValues).length > 0) {
            scanParams.ExpressionAttributeValues = expressionAttributeValues;
        }
        if (Object.keys(expressionAttributeNames).length > 0) {
            scanParams.ExpressionAttributeNames = expressionAttributeNames;
        }
        
        if (nextToken) {
            try {
                scanParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
            } catch (e) {
                // Invalid nextToken, ignore
            }
        }
        
        const result = await monitoredDdbDocClient.send(new ScanCommand(scanParams));
        
        const sortedItems = (result.Items || [])
            .sort((a, b) => (b.tournamentId || 0) - (a.tournamentId || 0))
            .slice(0, limit);
        
        return {
            items: sortedItems,
            nextToken: result.LastEvaluatedKey 
                ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') 
                : null
        };
        
    } catch (error) {
        throw new Error(`Failed to search ScrapeURLs: ${error.message}`);
    }
}

async function getScraperMetrics({ timeRange, entityId }) {
    monitoring.trackOperation('GET_METRICS', 'ScraperJob', timeRange, { timeRange, entityId });

    try {
        const now = new Date();
        const startTime = getStartTimeForRange(timeRange, now);
        
        const tableName = getTableName('ScraperJob');
        const jobParams = {
            TableName: tableName,
            FilterExpression: '#startTime >= :startTime',
            ExpressionAttributeNames: { '#startTime': 'startTime' },
            ExpressionAttributeValues: { ':startTime': startTime.toISOString() }
        };

        if (entityId) {
            jobParams.FilterExpression += ' AND entityId = :entityId';
            jobParams.ExpressionAttributeValues[':entityId'] = entityId;
        }
        
        const jobResult = await monitoredDdbDocClient.send(new ScanCommand(jobParams));
        const jobs = jobResult.Items || [];
        
        // Calculate metrics
        const totalJobs = jobs.length;
        const completedJobs = jobs.filter(j => j.status === 'COMPLETED').length;
        const failedJobs = jobs.filter(j => j.status === 'FAILED' || j.status === 'TIMEOUT' || j.status?.startsWith('STOPPED')).length;
        const runningJobs = jobs.filter(j => j.status === 'QUEUED').length;
        
        const totalURLsProcessed = jobs.reduce((sum, j) => sum + (j.totalURLsProcessed || 0), 0);
        const totalNewGames = jobs.reduce((sum, j) => sum + (j.newGamesScraped || 0), 0);
        const totalUpdatedGames = jobs.reduce((sum, j) => sum + (j.gamesUpdated || 0), 0);
        const totalErrors = jobs.reduce((sum, j) => sum + (j.errors || 0), 0);
        const totalS3Hits = jobs.reduce((sum, j) => sum + (j.s3CacheHits || 0), 0);
        
        const finishedJobs = jobs.filter(j => j.durationSeconds);
        const totalDuration = finishedJobs.reduce((sum, j) => sum + j.durationSeconds, 0);
        const averageJobDuration = finishedJobs.length > 0 ? totalDuration / finishedJobs.length : 0;
        
        const successRate = totalJobs > 0 ? (completedJobs / totalJobs) * 100 : 0;
        const s3CacheRate = totalURLsProcessed > 0 ? (totalS3Hits / totalURLsProcessed) * 100 : 0;
        
        // Return fields matching GraphQL ScraperMetrics type
        return {
            timeRange,
            entityId: entityId || null,
            totalJobs,
            successfulJobs: completedJobs,      // Schema expects 'successfulJobs'
            failedJobs,
            runningJobs,
            totalURLsScraped: totalURLsProcessed,   // Schema expects 'totalURLsScraped'
            totalNewGames,
            totalUpdatedGames,
            totalErrors,
            totalS3Hits,
            averageJobDuration: Math.round(averageJobDuration),
            successRate: Math.round(successRate * 10) / 10,
            s3CacheRate: Math.round(s3CacheRate * 10) / 10,
        };
        
    } catch (error) {
        // Return empty metrics instead of null to satisfy non-nullable fields
        return {
            timeRange: timeRange || 'LAST_24_HOURS',
            entityId: entityId || null,
            totalJobs: 0,
            successfulJobs: 0,
            failedJobs: 0,
            runningJobs: 0,
            totalURLsScraped: 0,
            totalNewGames: 0,
            totalUpdatedGames: 0,
            totalErrors: 0,
            totalS3Hits: 0,
            averageJobDuration: 0,
            successRate: 0,
            s3CacheRate: 0,
        };
    }
}

async function getUpdateCandidateURLs({ entityId, limit = 50 }) {
    monitoring.trackOperation('GET_UPDATE_CANDIDATES', 'ScrapeURL', entityId || 'all', { limit });

    try {
        const tableName = getTableName('ScrapeURL');
        const cutoffTime = new Date(Date.now() - 3600000).toISOString(); // 1 hour ago
        
        const params = {
            TableName: tableName,
            FilterExpression: `
                gameStatus = :running 
                AND doNotScrape = :false 
                AND (lastInteractionAt < :cutoff OR attribute_not_exists(lastInteractionAt))
            `,
            ExpressionAttributeValues: {
                ':running': 'RUNNING',
                ':false': false,
                ':cutoff': cutoffTime
            },
            Limit: limit * 3
        };

        if (entityId) {
            params.FilterExpression = 'entityId = :entityId AND ' + params.FilterExpression;
            params.ExpressionAttributeValues[':entityId'] = entityId;
        }
        
        const result = await monitoredDdbDocClient.send(new ScanCommand(params));
        const urls = result.Items || [];
        
        // Score and sort candidates
        const scoredUrls = urls.map(url => {
            let score = 0;
            const now = Date.now();
            const lastScraped = url.lastScrapedAt ? new Date(url.lastScrapedAt).getTime() : 0;
            const hoursSinceLastScrape = lastScraped ? (now - lastScraped) / (1000 * 60 * 60) : 999;
            
            if (url.gameStatus === 'REGISTERING') score += 10;
            else if (url.gameStatus === 'RUNNING') score += 8;
            else if (url.gameStatus === 'SCHEDULED') score += 5;
            
            if (hoursSinceLastScrape > 24) score += 5;
            else if (hoursSinceLastScrape > 6) score += 3;
            else if (hoursSinceLastScrape > 2) score += 1;
            
            if (url.consecutiveFailures > 3) score -= 3;
            if (url.timesSuccessful > 10 && url.successRate > 0.9) score += 2;
            
            return { ...url, priorityScore: score };
        });
        
        scoredUrls.sort((a, b) => b.priorityScore - a.priorityScore);
        
        return scoredUrls.slice(0, limit);
        
    } catch (error) {
        return [];
    }
}

async function fetchScrapeURLDetails({ url, id }) {
    const targetId = url || id;
    monitoring.trackOperation('GET_URL_DETAILS', 'ScrapeURL', targetId, { url: targetId });

    try {
        const tableName = getTableName('ScrapeURL');
        const result = await monitoredDdbDocClient.send(new GetCommand({
            TableName: tableName,
            Key: { id: targetId }
        }));
        return result.Item || null;
    } catch (error) {
        return null;
    }
}

async function modifyScrapeURLStatus({ url, status, doNotScrape }) {
    monitoring.trackOperation('MODIFY_URL_STATUS', 'ScrapeURL', url, { url, status, doNotScrape });

    try {
        const tableName = getTableName('ScrapeURL');
        const updates = {};
        const now = new Date().toISOString();
        
        if (status !== undefined && status !== null) {
            updates.status = status;
        }
        
        if (doNotScrape !== undefined && doNotScrape !== null) {
            updates.doNotScrape = doNotScrape;
            if (doNotScrape === true) {
                updates.status = 'DO_NOT_SCRAPE';
            }
        }
        
        updates.updatedAt = now;
        
        const updateExpressionParts = Object.keys(updates).map(k => `#${k} = :${k}`);
        
        const params = {
            TableName: tableName,
            Key: { id: url },
            UpdateExpression: 'SET ' + updateExpressionParts.join(', ') + ', #lca = :lca, #v = if_not_exists(#v, :zero) + :one',
            ExpressionAttributeNames: {
                ...Object.keys(updates).reduce((acc, k) => ({...acc, [`#${k}`]: k}), {}),
                '#lca': '_lastChangedAt',
                '#v': '_version'
            },
            ExpressionAttributeValues: {
                ...Object.keys(updates).reduce((acc, k) => ({...acc, [`:${k}`]: updates[k]}), {}),
                ':lca': Date.now(),
                ':zero': 0,
                ':one': 1
            },
            ReturnValues: 'ALL_NEW'
        };
        
        const result = await monitoredDdbDocClient.send(new UpdateCommand(params));
        return result.Attributes;
        
    } catch (error) {
        throw new Error(`Failed to modify URL status: ${error.message}`);
    }
}

async function bulkModifyScrapeURLs({ urls, status, doNotScrape }) {
    monitoring.trackOperation('BULK_MODIFY_URLS', 'ScrapeURL', 'bulk', { 
        count: urls.length, 
        status, 
        doNotScrape 
    });

    try {
        const results = await Promise.allSettled(
            urls.map(url => modifyScrapeURLStatus({ url, status, doNotScrape }))
        );
        
        const successful = results
            .filter(r => r.status === 'fulfilled')
            .map(r => r.value);
        
        const failed = results
            .filter(r => r.status === 'rejected')
            .map((r, i) => ({ url: urls[i], error: r.reason?.message }));
        
        if (failed.length > 0) {
            monitoring.trackOperation('BULK_MODIFY_PARTIAL_FAILURE', 'ScrapeURL', 'bulk', { 
                failedCount: failed.length,
                successCount: successful.length
            });
        }
        
        return successful;
        
    } catch (error) {
        throw new Error(`Bulk modify failed: ${error.message}`);
    }
}