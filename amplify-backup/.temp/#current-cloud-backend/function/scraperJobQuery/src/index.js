/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_GRAPHQLAPIKEYOUTPUT
	API_KINGSROOM_SCRAPERJOBTABLE_ARN
	API_KINGSROOM_SCRAPERJOBTABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT *//* Amplify Params - DO NOT EDIT
    API_KINGSROOM_SCRAPERJOBTABLE_ARN
    API_KINGSROOM_SCRAPERJOBTABLE_NAME
    API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
    API_KINGSROOM_GRAPHQLAPIIDOUTPUT
    ENV
    REGION
Amplify Params - DO NOT EDIT */

// scraperJobQuery Lambda Function
// Provides the listScraperJobs query with filtering support

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, QueryCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');

// --- Lambda Monitoring (optional - uncomment if you have the module) ---
// const { LambdaMonitoring } = require('./lambda-monitoring');
// --- End Lambda Monitoring ---

const client = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(client);

// --- Lambda Monitoring Initialization (optional) ---
// const monitoring = new LambdaMonitoring('scraperJobQuery', null);
// const monitoredDdbDocClient = monitoring.wrapDynamoDBClient(ddbDocClient);
// --- End Lambda Monitoring ---

// For now, use the unwrapped client (add monitoring wrapper later if desired)
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
        'ScraperJob': process.env.API_KINGSROOM_SCRAPERJOBTABLE_NAME
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
    console.log('scraperJobQuery invoked:', JSON.stringify(event));
    
    const { arguments: args } = event;
    const { entityId, status, startTime, endTime, limit = 50, nextToken } = args || {};
    
    const effectiveLimit = Math.min(limit || 50, 100); // Cap at 100
    
    try {
        const tableName = getTableName('ScraperJob');
        let items = [];
        let responseNextToken = null;
        
        // Strategy 1: Query by entityId using byEntityScraperJob GSI
        if (entityId) {
            console.log('Querying by entityId:', entityId);
            
            try {
                const params = {
                    TableName: tableName,
                    IndexName: 'byEntityScraperJob',
                    KeyConditionExpression: 'entityId = :entityId',
                    ExpressionAttributeValues: {
                        ':entityId': entityId
                    },
                    ScanIndexForward: false, // Most recent first
                    Limit: effectiveLimit
                };
                
                // Add time range to key condition (startTime is sort key)
                if (startTime && endTime) {
                    params.KeyConditionExpression += ' AND startTime BETWEEN :startTime AND :endTime';
                    params.ExpressionAttributeValues[':startTime'] = startTime;
                    params.ExpressionAttributeValues[':endTime'] = endTime;
                } else if (startTime) {
                    params.KeyConditionExpression += ' AND startTime >= :startTime';
                    params.ExpressionAttributeValues[':startTime'] = startTime;
                } else if (endTime) {
                    params.KeyConditionExpression += ' AND startTime <= :endTime';
                    params.ExpressionAttributeValues[':endTime'] = endTime;
                }
                
                // Add status as filter (not key condition)
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
                console.log('byEntityScraperJob index query failed, falling back to scan:', indexError.message);
                // Fall through to scan
                items = [];
            }
        }
        
        // Strategy 2: Query by status using byStatus GSI
        if (items.length === 0 && status && !entityId) {
            console.log('Querying by status:', status);
            
            try {
                const params = {
                    TableName: tableName,
                    IndexName: 'byStatus',
                    KeyConditionExpression: '#status = :status',
                    ExpressionAttributeNames: { '#status': 'status' },
                    ExpressionAttributeValues: {
                        ':status': status
                    },
                    ScanIndexForward: false,
                    Limit: effectiveLimit
                };
                
                // Add time range to key condition if startTime is the sort key
                if (startTime && endTime) {
                    params.KeyConditionExpression += ' AND startTime BETWEEN :startTime AND :endTime';
                    params.ExpressionAttributeValues[':startTime'] = startTime;
                    params.ExpressionAttributeValues[':endTime'] = endTime;
                } else if (startTime) {
                    params.KeyConditionExpression += ' AND startTime >= :startTime';
                    params.ExpressionAttributeValues[':startTime'] = startTime;
                } else if (endTime) {
                    params.KeyConditionExpression += ' AND startTime <= :endTime';
                    params.ExpressionAttributeValues[':endTime'] = endTime;
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
                console.log('byStatus index query failed, falling back to scan:', indexError.message);
                items = [];
            }
        }
        
        // Strategy 3: Fall back to scan if no index queries worked
        if (items.length === 0 && !entityId && !status) {
            console.log('Using scan (no filters or index queries failed)');
            
            const scanParams = {
                TableName: tableName,
                Limit: effectiveLimit
            };
            
            const filterExpressions = [];
            const expressionAttributeValues = {};
            const expressionAttributeNames = {};
            
            if (status) {
                filterExpressions.push('#status = :status');
                expressionAttributeNames['#status'] = 'status';
                expressionAttributeValues[':status'] = status;
            }
            
            if (startTime) {
                filterExpressions.push('startTime >= :startTime');
                expressionAttributeValues[':startTime'] = startTime;
            }
            
            if (endTime) {
                filterExpressions.push('startTime <= :endTime');
                expressionAttributeValues[':endTime'] = endTime;
            }
            
            if (filterExpressions.length > 0) {
                scanParams.FilterExpression = filterExpressions.join(' AND ');
                scanParams.ExpressionAttributeValues = expressionAttributeValues;
                if (Object.keys(expressionAttributeNames).length > 0) {
                    scanParams.ExpressionAttributeNames = expressionAttributeNames;
                }
            }
            
            if (nextToken) {
                scanParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
            }
            
            const result = await docClient.send(new ScanCommand(scanParams));
            items = result.Items || [];
            
            // Sort by startTime descending (scan doesn't guarantee order)
            items.sort((a, b) => {
                const aTime = new Date(a.startTime || 0).getTime();
                const bTime = new Date(b.startTime || 0).getTime();
                return bTime - aTime;
            });
            
            if (result.LastEvaluatedKey) {
                responseNextToken = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
            }
        }
        
        console.log(`Returning ${items.length} ScraperJob items`);
        
        return {
            items,
            nextToken: responseNextToken
        };
        
    } catch (error) {
        console.error('scraperJobQuery Error:', error);
        throw new Error(`Failed to list ScraperJobs: ${error.message}`);
    }
};