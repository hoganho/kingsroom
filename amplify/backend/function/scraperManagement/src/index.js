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

// scraperManagement Lambda Function - Minimal Working Implementation
// This version is designed to work with your existing autoScraper and ScraperAdminPage

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);
const lambdaClient = new LambdaClient({});

// Helper function to get table names (matching your autoScraper pattern)
const getTableName = (modelName) => {
    // Check for environment variable first
    const envVarName = `TABLE_${modelName.toUpperCase().replace(/-/g, '_')}`;
    if (process.env[envVarName]) {
        return process.env[envVarName];
    }
    
    // Special tables that might have different naming
    const specialTables = {
        'ScraperState': process.env.API_KINGSROOM_SCRAPERSTATETABLE_NAME,
        'Game': process.env.API_KINGSROOM_GAMETABLE_NAME,
        'ScraperJob': process.env.API_KINGSROOM_SCRAPERJOBTABLE_NAME,
        'ScrapeURL': process.env.API_KINGSROOM_SCRAPEURLTABLE_NAME,
        'ScrapeAttempt': process.env.API_KINGSROOM_SCRAPEATTEMPTTABLE_NAME
    };
    
    if (specialTables[modelName]) return specialTables[modelName];
    
    // Default pattern
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    if (!apiId || !env) {
        throw new Error(`Cannot determine table name for ${modelName}: API ID or ENV not found`);
    }
    
    return `${modelName}-${apiId}-${env}`;
};

// Main handler
exports.handler = async (event, context) => {
    console.log('ScraperManagement invoked:', JSON.stringify(event));
    
    const { typeName, fieldName, arguments: args } = event;
    const operation = `${typeName}.${fieldName}`;
    
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
        console.error('ScraperManagement Error:', error);
        throw error;
    }
};

// ===================================================================
// QUERY IMPLEMENTATIONS
// ===================================================================

async function getScraperJobsReport({ status, limit = 20, nextToken }) {
    console.log('Getting scraper jobs report:', { status, limit, nextToken });
    
    try {
        const tableName = getTableName('ScraperJob');
        
        // If filtering by status and we have the index
        if (status) {
            // First try with index if it exists
            try {
                const params = {
                    TableName: tableName,
                    IndexName: 'byStatus',
                    KeyConditionExpression: '#status = :status',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: { ':status': status },
                    ScanIndexForward: false,
                    Limit: limit
                };
                
                if (nextToken) {
                    params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
                }
                
                const result = await ddbDocClient.send(new QueryCommand(params));
                
                return {
                    items: result.Items || [],
                    nextToken: result.LastEvaluatedKey ? 
                        Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : null
                };
            } catch (indexError) {
                console.log('Index not available, falling back to scan with filter');
            }
        }
        
        // Fallback to scan (works without index)
        const scanParams = {
            TableName: tableName,
            Limit: limit,
            ScanIndexForward: false
        };
        
        if (status) {
            scanParams.FilterExpression = '#status = :status';
            scanParams.ExpressionAttributeNames = { '#status': 'status' };
            scanParams.ExpressionAttributeValues = { ':status': status };
        }
        
        if (nextToken) {
            scanParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
        }
        
        const result = await ddbDocClient.send(new ScanCommand(scanParams));
        
        // Sort by startTime if available
        const items = (result.Items || []).sort((a, b) => {
            const aTime = new Date(a.startTime || 0).getTime();
            const bTime = new Date(b.startTime || 0).getTime();
            return bTime - aTime; // Newest first
        });
        
        return {
            items: items.slice(0, limit),
            nextToken: result.LastEvaluatedKey ? 
                Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : null
        };
        
    } catch (error) {
        console.error('Error getting scraper jobs:', error);
        return { items: [], nextToken: null };
    }
}

async function searchScrapeURLs({ status, limit = 50, nextToken }) {
    console.log('Searching scrape URLs:', { status, limit, nextToken });
    
    try {
        const tableName = getTableName('ScrapeURL');
        
        const params = {
            TableName: tableName,
            Limit: limit
        };
        
        if (status) {
            params.FilterExpression = '#status = :status';
            params.ExpressionAttributeNames = { '#status': 'status' };
            params.ExpressionAttributeValues = { ':status': status };
        }
        
        if (nextToken) {
            params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
        }
        
        const result = await ddbDocClient.send(new ScanCommand(params));
        
        return {
            items: result.Items || [],
            nextToken: result.LastEvaluatedKey ? 
                Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64') : null
        };
        
    } catch (error) {
        console.error('Error searching URLs:', error);
        return { items: [], nextToken: null };
    }
}

async function getScraperMetrics({ timeRange }) {
    console.log('Getting scraper metrics for:', timeRange);
    
    try {
        const now = new Date();
        const startTime = getStartTimeForRange(timeRange, now);
        
        // Get jobs in the time range
        const tableName = getTableName('ScraperJob');
        const jobParams = {
            TableName: tableName,
            FilterExpression: '#startTime >= :startTime',
            ExpressionAttributeNames: { '#startTime': 'startTime' },
            ExpressionAttributeValues: { ':startTime': startTime.toISOString() }
        };
        
        const jobResult = await ddbDocClient.send(new ScanCommand(jobParams));
        const jobs = jobResult.Items || [];
        
        // Calculate basic metrics
        const totalJobs = jobs.length;
        const successfulJobs = jobs.filter(j => j.status === 'COMPLETED').length;
        const failedJobs = jobs.filter(j => j.status === 'FAILED').length;
        const cancelledJobs = jobs.filter(j => j.status === 'CANCELLED').length;
        
        // Calculate URL and timing metrics
        const totalURLsScraped = jobs.reduce((sum, j) => sum + (j.totalURLsProcessed || 0), 0);
        const totalNewGames = jobs.reduce((sum, j) => sum + (j.newGamesScraped || 0), 0);
        const totalUpdatedGames = jobs.reduce((sum, j) => sum + (j.gamesUpdated || 0), 0);
        const totalErrors = jobs.reduce((sum, j) => sum + (j.errors || 0), 0);
        
        // Calculate duration metrics
        const completedJobs = jobs.filter(j => j.durationSeconds);
        const totalDuration = completedJobs.reduce((sum, j) => sum + j.durationSeconds, 0);
        const averageJobDuration = completedJobs.length > 0 ? totalDuration / completedJobs.length : 0;
        
        // Success rate
        const successRate = totalJobs > 0 ? (successfulJobs / totalJobs) * 100 : 0;
        
        // Group errors from job error messages
        const errorMap = {};
        jobs.forEach(job => {
            if (job.errorMessages && Array.isArray(job.errorMessages)) {
                job.errorMessages.forEach(error => {
                    const errorType = extractErrorType(error);
                    if (!errorMap[errorType]) {
                        errorMap[errorType] = { count: 0, urls: [] };
                    }
                    errorMap[errorType].count++;
                    if (job.failedURLs && job.failedURLs.length > 0) {
                        errorMap[errorType].urls = [...new Set([...errorMap[errorType].urls, ...job.failedURLs])].slice(0, 5);
                    }
                });
            }
        });
        
        const topErrors = Object.entries(errorMap)
            .map(([errorType, data]) => ({ 
                errorType, 
                count: data.count, 
                urls: data.urls 
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
        
        // Calculate hourly activity
        const hourlyMap = {};
        jobs.forEach(job => {
            if (job.startTime) {
                const hour = new Date(job.startTime).getHours();
                const hourKey = `${hour}:00`;
                
                if (!hourlyMap[hourKey]) {
                    hourlyMap[hourKey] = {
                        hour: hourKey,
                        jobCount: 0,
                        urlsScraped: 0,
                        successful: 0
                    };
                }
                
                hourlyMap[hourKey].jobCount++;
                hourlyMap[hourKey].urlsScraped += job.totalURLsProcessed || 0;
                if (job.status === 'COMPLETED') {
                    hourlyMap[hourKey].successful++;
                }
            }
        });
        
        const hourlyActivity = Object.values(hourlyMap).map(h => ({
            ...h,
            successRate: h.jobCount > 0 ? (h.successful / h.jobCount) * 100 : 0
        }));
        
        return {
            totalJobs,
            successfulJobs,
            failedJobs,
            averageJobDuration: Math.round(averageJobDuration),
            totalURLsScraped,
            successRate: Math.round(successRate * 100) / 100,
            topErrors,
            hourlyActivity,
            // Additional useful metrics
            totalNewGames,
            totalUpdatedGames,
            totalErrors,
            cancelledJobs,
            averageURLsPerJob: totalJobs > 0 ? Math.round(totalURLsScraped / totalJobs) : 0
        };
        
    } catch (error) {
        console.error('Error calculating metrics:', error);
        // Return empty metrics on error
        return {
            totalJobs: 0,
            successfulJobs: 0,
            failedJobs: 0,
            averageJobDuration: 0,
            totalURLsScraped: 0,
            successRate: 0,
            topErrors: [],
            hourlyActivity: []
        };
    }
}

async function getUpdateCandidateURLs({ limit = 50 }) {
    console.log('Getting update candidate URLs, limit:', limit);
    
    try {
        const tableName = getTableName('ScrapeURL');
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
        
        // Get active URLs that haven't been scraped recently
        const params = {
            TableName: tableName,
            FilterExpression: `#status = :active 
                AND doNotScrape <> :true
                AND (attribute_not_exists(lastScrapedAt) OR lastScrapedAt < :cutoff)`,
            ExpressionAttributeNames: {
                '#status': 'status'
            },
            ExpressionAttributeValues: {
                ':active': 'ACTIVE',
                ':true': true,
                ':cutoff': oneHourAgo
            },
            Limit: limit * 2 // Get extra to allow for sorting
        };
        
        const result = await ddbDocClient.send(new ScanCommand(params));
        const urls = result.Items || [];
        
        // Score and sort URLs by priority
        const scoredUrls = urls.map(url => {
            let score = 0;
            const now = Date.now();
            const lastScraped = url.lastScrapedAt ? new Date(url.lastScrapedAt).getTime() : 0;
            const hoursSinceLastScrape = lastScraped ? (now - lastScraped) / (1000 * 60 * 60) : 999;
            
            // Priority by game status
            if (url.gameStatus === 'REGISTERING') score += 10;
            else if (url.gameStatus === 'RUNNING') score += 8;
            else if (url.gameStatus === 'SCHEDULED') score += 5;
            
            // Priority by time since last scrape
            if (hoursSinceLastScrape > 24) score += 5;
            else if (hoursSinceLastScrape > 6) score += 3;
            else if (hoursSinceLastScrape > 2) score += 1;
            
            // Penalty for failures
            if (url.consecutiveFailures > 3) score -= 3;
            
            // Bonus for reliable URLs
            if (url.timesSuccessful > 10 && url.successRate > 0.9) score += 2;
            
            return { ...url, priorityScore: score };
        });
        
        // Sort by priority and return top N
        scoredUrls.sort((a, b) => b.priorityScore - a.priorityScore);
        
        return scoredUrls.slice(0, limit);
        
    } catch (error) {
        console.error('Error getting update candidates:', error);
        return [];
    }
}

async function fetchScrapeURLDetails({ url }) {
    console.log('Fetching scrape URL details for:', url);
    
    try {
        const tableName = getTableName('ScrapeURL');
        
        const params = {
            TableName: tableName,
            Key: { id: url }
        };
        
        const result = await ddbDocClient.send(new GetCommand(params));
        return result.Item || null;
        
    } catch (error) {
        console.error('Error fetching URL details:', error);
        return null;
    }
}

// ===================================================================
// MUTATION IMPLEMENTATIONS
// ===================================================================

async function startScraperJob({ input }, event) {
    console.log('Starting scraper job with input:', input);
    
    try {
        // Create the request for autoScraper
        const payload = {
            typeName: 'Mutation',
            fieldName: 'triggerAutoScraping',
            arguments: {
                maxGames: input.maxGames || 10
            },
            identity: event.identity || {
                claims: {
                    'custom:triggerSource': input.triggerSource || 'MANUAL',
                    'custom:triggeredBy': input.triggeredBy || 'scraperManagement',
                    'custom:targetURLs': input.targetURLs,
                    'custom:isFullScan': input.isFullScan,
                    'custom:startId': input.startId,
                    'custom:endId': input.endId
                }
            }
        };
        
        // Get the function name from environment or construct it
        const functionName = process.env.AUTO_SCRAPER_FUNCTION || `autoScraper-${process.env.ENV}`;
        
        console.log('Invoking autoScraper with payload:', JSON.stringify(payload));
        
        const response = await lambdaClient.send(new InvokeCommand({
            FunctionName: functionName,
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify(payload)
        }));
        
        const textDecoder = new TextDecoder();
        const result = JSON.parse(textDecoder.decode(response.Payload));
        
        console.log('AutoScraper response:', result);
        
        // Helper function to ensure all required fields are present
        const ensureRequiredFields = (job) => {
            const now = new Date().toISOString();
            const timestamp = Date.now();
            
            return {
                ...job,
                // Ensure these required fields are always present
                createdAt: job.createdAt || now,
                updatedAt: job.updatedAt || now,
                _version: job._version || 1,
                _lastChangedAt: job._lastChangedAt || timestamp,
                __typename: 'ScraperJob',
                // Ensure other required fields have defaults
                startTime: job.startTime || now,
                status: job.status || 'QUEUED',
                triggerSource: job.triggerSource || input.triggerSource || 'MANUAL',
                triggeredBy: job.triggeredBy || input.triggeredBy || 'scraperManagement',
                totalURLsProcessed: job.totalURLsProcessed || 0,
                newGamesScraped: job.newGamesScraped || 0,
                gamesUpdated: job.gamesUpdated || 0,
                gamesSkipped: job.gamesSkipped || 0,
                errors: job.errors || 0,
                blanks: job.blanks || 0
            };
        };
        
        // Check for jobId from the autoScraper response (seen in logs) OR the old state path
        const realJobId = result.jobId || (result.state && result.state.currentJobId);
        
        // If the autoScraper created a job, fetch and return it
        if (realJobId) {
            const jobTable = getTableName('ScraperJob');
            const jobResult = await ddbDocClient.send(new GetCommand({
                TableName: jobTable,
                Key: { id: realJobId }
            }));
            
            if (jobResult.Item) {
                // Return the fetched job with all required fields ensured
                return ensureRequiredFields(jobResult.Item);
            } else {
                // If we can't fetch the job, create a proper response
                // Use the realJobId
                return ensureRequiredFields({
                    id: realJobId,
                    jobId: realJobId,
                    status: result.success ? 'COMPLETED' : 'RUNNING',
                    triggerSource: input.triggerSource,
                    startTime: new Date().toISOString(),
                    maxGames: input.maxGames || 10,
                    startId: input.startId,
                    endId: input.endId,
                    isFullScan: input.isFullScan || false,
                    targetURLs: input.targetURLs || []
                });
            }
        }   
        
        // Return a minimal job object if we don't get job details
        // But ensure ALL required fields are present
        const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        return ensureRequiredFields({
            id: jobId,
            jobId: jobId,
            status: 'QUEUED',
            triggerSource: input.triggerSource || 'MANUAL',
            triggeredBy: input.triggeredBy || 'scraperManagement',
            startTime: new Date().toISOString(),
            maxGames: input.maxGames || 10,
            startId: input.startId,
            endId: input.endId,
            isFullScan: input.isFullScan || false,
            targetURLs: input.targetURLs || []
        });
        
    } catch (error) {
        console.error('Error starting scraper job:', error);
        throw new Error(`Failed to start scraper job: ${error.message}`);
    }
}

async function cancelScraperJob({ jobId }) {
    console.log('Cancelling scraper job:', jobId);
    
    try {
        // Update the job status
        const jobTable = getTableName('ScraperJob');
        const now = new Date().toISOString();
        
        const updateParams = {
            TableName: jobTable,
            Key: { id: jobId },
            UpdateExpression: 'SET #status = :status, endTime = :endTime, updatedAt = :updatedAt',
            ExpressionAttributeNames: { '#status': 'status' },
            ExpressionAttributeValues: {
                ':status': 'CANCELLED',
                ':endTime': now,
                ':updatedAt': now
            },
            ReturnValues: 'ALL_NEW'
        };
        
        const result = await ddbDocClient.send(new UpdateCommand(updateParams));
        
        // Also stop the autoScraper
        const functionName = process.env.AUTO_SCRAPER_FUNCTION || `autoScraper-${process.env.ENV}`;
        
        await lambdaClient.send(new InvokeCommand({
            FunctionName: functionName,
            InvocationType: 'RequestResponse',
            Payload: JSON.stringify({
                typeName: 'Mutation',
                fieldName: 'controlScraperOperation',
                arguments: { operation: 'STOP' }
            })
        }));
        
        return result.Attributes || { id: jobId, status: 'CANCELLED' };
        
    } catch (error) {
        console.error('Error cancelling job:', error);
        throw new Error(`Failed to cancel job: ${error.message}`);
    }
}

async function modifyScrapeURLStatus({ url, status, doNotScrape }) {
    console.log('Modifying URL status:', { url, status, doNotScrape });
    
    try {
        const tableName = getTableName('ScrapeURL');
        const updates = {};
        const now = new Date().toISOString();
        
        if (status !== undefined && status !== null) {
            updates.status = status;
        }
        
        if (doNotScrape !== undefined && doNotScrape !== null) {
            updates.doNotScrape = doNotScrape;
            // If setting doNotScrape to true, also set status
            if (doNotScrape === true) {
                updates.status = 'DO_NOT_SCRAPE';
            }
        }
        
        updates.updatedAt = now;
        updates._lastChangedAt = Date.now();
        
        const updateExpression = 'SET ' + Object.keys(updates)
            .map(k => `#${k} = :${k}`).join(', ');
        
        const params = {
            TableName: tableName,
            Key: { id: url },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: Object.keys(updates)
                .reduce((acc, k) => ({...acc, [`#${k}`]: k}), {}),
            ExpressionAttributeValues: Object.keys(updates)
                .reduce((acc, k) => ({...acc, [`:${k}`]: updates[k]}), {}),
            ReturnValues: 'ALL_NEW'
        };
        
        const result = await ddbDocClient.send(new UpdateCommand(params));
        return result.Attributes;
        
    } catch (error) {
        console.error('Error modifying URL status:', error);
        throw new Error(`Failed to modify URL status: ${error.message}`);
    }
}

async function bulkModifyScrapeURLs({ urls, status, doNotScrape }) {
    console.log('Bulk modifying URLs:', { urlCount: urls.length, status, doNotScrape });
    
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
            console.warn('Some URLs failed to update:', failed);
        }
        
        return successful;
        
    } catch (error) {
        console.error('Error in bulk modify:', error);
        throw new Error(`Bulk modify failed: ${error.message}`);
    }
}

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

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
    
    // Common error patterns
    if (errorMessage.includes('timeout')) return 'TIMEOUT';
    if (errorMessage.includes('ECONNREFUSED')) return 'CONNECTION_REFUSED';
    if (errorMessage.includes('404')) return 'NOT_FOUND';
    if (errorMessage.includes('500')) return 'SERVER_ERROR';
    if (errorMessage.includes('venue')) return 'VENUE_ERROR';
    if (errorMessage.includes('parse')) return 'PARSE_ERROR';
    if (errorMessage.includes('DynamoDB')) return 'DATABASE_ERROR';
    
    // Try to extract first word/phrase before colon
    const colonIndex = errorMessage.indexOf(':');
    if (colonIndex > 0 && colonIndex < 50) {
        return errorMessage.substring(0, colonIndex).trim().toUpperCase().replace(/\s+/g, '_');
    }
    
    return 'OTHER';
}