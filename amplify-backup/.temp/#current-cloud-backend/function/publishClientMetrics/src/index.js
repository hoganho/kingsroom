// publishClientMetrics-enhanced/index.js
// Enhanced version that handles metrics from both frontend and Lambda functions

const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');

// Initialize clients
const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);
const cloudwatch = new CloudWatchClient({ 
    region: process.env.AWS_REGION || 'ap-southeast-2' 
});

// Get table name for storing operation logs (optional)
const getTableName = (modelName) => {
    const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
    const env = process.env.ENV;
    return `${modelName}-${apiId}-${env}`;
};

exports.handler = async (event) => {
    console.log('Event received:', JSON.stringify(event, null, 2));
    
    // Determine source - GraphQL call (frontend) or direct invocation (Lambda)
    const isDirectInvocation = event.source === 'LAMBDA' || event.Records;
    const isGraphQLCall = event.arguments?.metrics || event.fieldName;
    
    let metrics = [];
    let source = 'UNKNOWN';
    let userId = 'system';
    
    if (isGraphQLCall) {
        // Frontend metrics via GraphQL
        source = 'CLIENT';
        metrics = event.arguments?.metrics || [];
        userId = event.identity?.claims?.sub || event.identity?.sub || 'anonymous';
        const userEmail = event.identity?.claims?.email || 'unknown';
        const userName = event.identity?.claims?.name || 
                         event.identity?.claims?.['cognito:username'] || 
                         'unknown';
        
        console.log('Processing CLIENT metrics for user:', {
            userId,
            userName,
            metricsCount: metrics.length
        });
        
    } else if (isDirectInvocation) {
        // Lambda function metrics
        source = 'LAMBDA';
        
        // Handle different Lambda invocation patterns
        if (event.Records) {
            // From SQS/EventBridge/etc
            metrics = event.Records.map(record => {
                const body = typeof record.body === 'string' ? JSON.parse(record.body) : record.body;
                return body;
            }).flat();
        } else if (event.metrics) {
            // Direct invocation with metrics array
            metrics = event.metrics;
        } else if (event.operation) {
            // Single operation from Lambda
            metrics = [{
                metricName: `Lambda_Database_${event.operation}`,
                value: event.value || 1,
                unit: 'Count',
                dimensions: JSON.stringify({
                    Table: event.table,
                    Function: event.functionName || 'Unknown',
                    Source: 'LAMBDA',
                    ...event.dimensions
                }),
                metadata: JSON.stringify(event.metadata || {})
            }];
        }
        
        userId = event.functionName || 'lambda-function';
        
        console.log('Processing LAMBDA metrics:', {
            source: event.source,
            functionName: event.functionName,
            metricsCount: metrics.length
        });
    }
    
    if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
        console.warn('No valid metrics to process');
        return {
            success: false,
            message: 'No valid metrics provided',
            source: source,
            userId: userId
        };
    }
    
    try {
        // Process and validate metrics
        const validMetrics = [];
        const invalidMetrics = [];
        const operationLogs = []; // For optional database logging
        
        for (const m of metrics) {
            try {
                // Validate required fields
                if (!m.metricName || m.value === undefined || m.value === null) {
                    invalidMetrics.push({
                        metric: m,
                        reason: 'Missing metricName or value'
                    });
                    continue;
                }
                
                // Parse dimensions
                let dimensions = {};
                if (m.dimensions) {
                    try {
                        dimensions = typeof m.dimensions === 'string' 
                            ? JSON.parse(m.dimensions) 
                            : m.dimensions;
                    } catch (e) {
                        console.warn('Failed to parse dimensions:', m.dimensions);
                        dimensions = {};
                    }
                }
                
                // Parse metadata
                let metadata = {};
                if (m.metadata) {
                    try {
                        metadata = typeof m.metadata === 'string'
                            ? JSON.parse(m.metadata)
                            : m.metadata;
                    } catch (e) {
                        metadata = {};
                    }
                }
                
                // Determine namespace based on source
                const namespace = dimensions.Source === 'LAMBDA' 
                    ? 'ScraperSystem/Lambda' 
                    : 'ScraperSystem/Client';
                
                // Build CloudWatch metric dimensions
                const dimensionsList = [
                    { Name: 'Environment', Value: process.env.ENV || 'dev' },
                    { Name: 'Source', Value: dimensions.Source || source }
                ];
                
                // Add specific dimensions based on metric type
                if (m.metricName.includes('Database')) {
                    if (dimensions.Table) {
                        dimensionsList.push({ Name: 'Table', Value: dimensions.Table });
                    }
                    if (dimensions.Operation) {
                        dimensionsList.push({ Name: 'Operation', Value: dimensions.Operation });
                    }
                    if (dimensions.Function) {
                        dimensionsList.push({ Name: 'Function', Value: dimensions.Function });
                    }
                    
                    // Log database operations for audit trail (optional)
                    if (dimensions.Table && dimensions.Operation) {
                        operationLogs.push({
                            timestamp: m.timestamp || new Date().toISOString(),
                            source: dimensions.Source || source,
                            table: dimensions.Table,
                            operation: dimensions.Operation,
                            functionName: dimensions.Function,
                            recordId: metadata.recordId,
                            entityId: metadata.entityId,
                            userId: userId,
                            success: metadata.success !== false,
                            duration: metadata.duration
                        });
                    }
                } else {
                    // Custom dimensions for non-database metrics
                    Object.entries(dimensions).forEach(([key, value]) => {
                        if (key !== 'Source' && dimensionsList.length < 10) {
                            dimensionsList.push({
                                Name: key,
                                Value: String(value).substring(0, 255)
                            });
                        }
                    });
                }
                
                // Add user dimension for CLIENT source
                if (source === 'CLIENT' && userId !== 'anonymous') {
                    dimensionsList.push({ Name: 'UserId', Value: userId.substring(0, 255) });
                }
                
                // CloudWatch allows max 10 dimensions
                if (dimensionsList.length > 10) {
                    dimensionsList.splice(10);
                }
                
                validMetrics.push({
                    MetricName: m.metricName,
                    Value: parseFloat(m.value),
                    Unit: m.unit || 'Count',
                    Dimensions: dimensionsList,
                    Timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
                    Namespace: namespace
                });
                
            } catch (metricError) {
                console.error('Error processing metric:', m, metricError);
                invalidMetrics.push({
                    metric: m,
                    reason: metricError.message
                });
            }
        }
        
        // Log validation results
        if (invalidMetrics.length > 0) {
            console.warn(`${invalidMetrics.length} invalid metrics skipped:`, invalidMetrics);
        }
        
        if (validMetrics.length === 0) {
            return {
                success: false,
                message: `All ${metrics.length} metrics were invalid`,
                source: source,
                userId: userId
            };
        }
        
        // Group metrics by namespace for efficient sending
        const metricsByNamespace = {};
        validMetrics.forEach(metric => {
            const ns = metric.Namespace || 'ScraperSystem/Client';
            if (!metricsByNamespace[ns]) {
                metricsByNamespace[ns] = [];
            }
            metricsByNamespace[ns].push(metric);
        });
        
        // Send to CloudWatch (batch by namespace and chunk size)
        const results = [];
        const failures = [];
        
        for (const [namespace, namespaceMetrics] of Object.entries(metricsByNamespace)) {
            // CloudWatch accepts max 20 metrics per request
            for (let i = 0; i < namespaceMetrics.length; i += 20) {
                const chunk = namespaceMetrics.slice(i, i + 20);
                try {
                    const result = await cloudwatch.send(new PutMetricDataCommand({
                        Namespace: namespace,
                        MetricData: chunk.map(m => ({
                            MetricName: m.MetricName,
                            Value: m.Value,
                            Unit: m.Unit,
                            Dimensions: m.Dimensions,
                            Timestamp: m.Timestamp
                        }))
                    }));
                    results.push(result);
                    console.log(`Sent ${chunk.length} metrics to ${namespace}`);
                } catch (batchError) {
                    console.error(`Failed to send batch to ${namespace}:`, batchError);
                    failures.push({
                        namespace,
                        error: batchError.message
                    });
                }
            }
        }
        
        // Optional: Store operation logs in DynamoDB for detailed audit trail
        if (operationLogs.length > 0 && process.env.ENABLE_OPERATION_LOGGING === 'true') {
            try {
                const operationLogTable = getTableName('OperationLog');
                for (const log of operationLogs) {
                    await ddbDocClient.send(new PutCommand({
                        TableName: operationLogTable,
                        Item: {
                            id: `${log.timestamp}_${log.source}_${log.table}_${Math.random().toString(36).substr(2, 9)}`,
                            ...log,
                            ttl: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) // 30 days TTL
                        }
                    }));
                }
                console.log(`Stored ${operationLogs.length} operation logs`);
            } catch (logError) {
                console.error('Failed to store operation logs:', logError);
                // Don't fail the whole operation for logging failure
            }
        }
        
        // Track usage statistics
        try {
            await cloudwatch.send(new PutMetricDataCommand({
                Namespace: 'ScraperSystem/Usage',
                MetricData: [
                    {
                        MetricName: 'MetricsProcessed',
                        Value: validMetrics.length,
                        Unit: 'Count',
                        Dimensions: [
                            { Name: 'Source', Value: source },
                            { Name: 'Environment', Value: process.env.ENV || 'dev' }
                        ],
                        Timestamp: new Date()
                    }
                ]
            }));
        } catch (statsError) {
            console.error('Failed to track usage statistics:', statsError);
        }
        
        // Determine overall success
        const successRate = results.length / (results.length + failures.length);
        const success = successRate > 0.5; // Consider successful if more than 50% succeeded
        
        return {
            success: success,
            message: failures.length > 0 
                ? `Published ${validMetrics.length} metrics with ${failures.length} failures`
                : `Successfully published ${validMetrics.length} metrics`,
            source: source,
            userId: userId,
            stats: {
                received: metrics.length,
                valid: validMetrics.length,
                invalid: invalidMetrics.length,
                sent: results.length,
                failed: failures.length
            }
        };
        
    } catch (error) {
        console.error('Failed to publish metrics:', error);
        
        // Track error metric
        try {
            await cloudwatch.send(new PutMetricDataCommand({
                Namespace: 'ScraperSystem/Errors',
                MetricData: [
                    {
                        MetricName: 'MetricPublishFailure',
                        Value: 1,
                        Unit: 'Count',
                        Dimensions: [
                            { Name: 'Source', Value: source },
                            { Name: 'ErrorType', Value: error.name || 'Unknown' },
                            { Name: 'Environment', Value: process.env.ENV || 'dev' }
                        ],
                        Timestamp: new Date()
                    }
                ]
            }));
        } catch (metricError) {
            console.error('Failed to track error metric:', metricError);
        }
        
        return {
            success: false,
            message: `Error: ${error.message}`,
            source: source,
            userId: userId
        };
    }
};

// Helper function for Lambda functions to invoke this directly
exports.sendLambdaMetrics = async (operations) => {
    // This can be called from other Lambda functions directly
    return exports.handler({
        source: 'LAMBDA',
        metrics: operations
    });
};d