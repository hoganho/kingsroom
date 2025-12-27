/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_GRAPHQLAPIKEYOUTPUT
	API_KINGSROOM_SCRAPEURLTABLE_ARN
	API_KINGSROOM_SCRAPEURLTABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT *//* Amplify Params - DO NOT EDIT
    API_KINGSROOM_SCRAPEURLTABLE_ARN
    API_KINGSROOM_SCRAPEURLTABLE_NAME
    API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
    API_KINGSROOM_GRAPHQLAPIIDOUTPUT
    ENV
    REGION
Amplify Params - DO NOT EDIT */

// scrapeURLQuery Lambda Function
// Provides the listScrapeURLs query with filtering support

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

// --- Lambda Monitoring (optional - uncomment if you have the module) ---
// const { LambdaMonitoring } = require('./lambda-monitoring');
// --- End Lambda Monitoring ---

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

// --- Lambda Monitoring Initialization (optional) ---
// const monitoring = new LambdaMonitoring('scrapeURLQuery', null);
// const monitoredDdbDocClient = monitoring.wrapDynamoDBClient(ddbDocClient);
// --- End Lambda Monitoring ---

// For now, use the unwrapped client
const docClient = ddbDocClient;

// Helper function to get table names (matching your existing pattern)
const getTableName = (modelName) => {
    // Check for environment variable first
    const envVarName = `TABLE_${modelName.toUpperCase().replace(/-/g, '_')}`;
    if (process.env[envVarName]) {
        return process.env[envVarName];
    }
    
    // Special tables
    const specialTables = {
        'ScrapeURL': process.env.API_KINGSROOM_SCRAPEURLTABLE_NAME
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
    console.log('scrapeURLQuery invoked:', JSON.stringify(event));
    
    const { arguments: args } = event;
    const { entityId, status, limit = 50, nextToken } = args || {};
    
    const effectiveLimit = Math.min(limit || 50, 100); // Cap at 100
    
    try {
        const tableName = getTableName('ScrapeURL');
        let items = [];
        let responseNextToken = null;
        
        // Strategy 1: Query by entityId using byEntityScrapeURL GSI
        if (entityId) {
            console.log('Querying by entityId:', entityId);
            
            try {
                const params = {
                    TableName: tableName,
                    IndexName: 'byEntityScrapeURL',
                    KeyConditionExpression: 'entityId = :entityId',
                    ExpressionAttributeValues: {
                        ':entityId': entityId
                    },
                    ScanIndexForward: false,
                    Limit: effectiveLimit
                };
                
                // Add status as filter expression
                if (status) {
                    params.FilterExpression = '#status = :status';
                    params.ExpressionAttributeNames = { '#status': 'status' };
                    params.ExpressionAttributeValues[':status'] = status;
                }
                
                if (nextToken) {
                    params.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
                }
                
                const result = await docClient.send(new QueryCommand(params));
                items = result.Items || [];
                
                if (result.LastEvaluatedKey) {
                    responseNextToken = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
                }
                
            } catch (indexError) {
                console.log('byEntityScrapeURL index query failed, falling back to scan:', indexError.message);
                items = [];
            }
        }
        
        // Strategy 2: Scan with status filter (no status GSI on ScrapeURL)
        if (items.length === 0 && !entityId) {
            console.log('Using scan', status ? `with status filter: ${status}` : '(no filters)');
            
            const scanParams = {
                TableName: tableName,
                Limit: effectiveLimit
            };
            
            if (status) {
                scanParams.FilterExpression = '#status = :status';
                scanParams.ExpressionAttributeNames = { '#status': 'status' };
                scanParams.ExpressionAttributeValues = { ':status': status };
            }
            
            if (nextToken) {
                scanParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
            }
            
            const result = await docClient.send(new ScanCommand(scanParams));
            items = result.Items || [];
            
            if (result.LastEvaluatedKey) {
                responseNextToken = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
            }
        }
        
        // Sort by lastScrapedAt descending for consistent ordering
        items.sort((a, b) => {
            const aTime = a.lastScrapedAt ? new Date(a.lastScrapedAt).getTime() : 0;
            const bTime = b.lastScrapedAt ? new Date(b.lastScrapedAt).getTime() : 0;
            return bTime - aTime;
        });
        
        console.log(`Returning ${items.length} ScrapeURL items`);
        
        return {
            items,
            nextToken: responseNextToken
        };
        
    } catch (error) {
        console.error('scrapeURLQuery Error:', error);
        throw new Error(`Failed to list ScrapeURLs: ${error.message}`);
    }
};