/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	AUTH_KINGSROOMC05D6627_USERPOOLID
	ENV
	REGION
Amplify Params - DO NOT EDIT */

// amplify/backend/function/publishClientMetrics/src/index.js
// FIXED Lambda function with improved error handling and validation

const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');

exports.handler = async (event) => {
    console.log('Event received:', JSON.stringify(event, null, 2));
    
    const cloudwatch = new CloudWatchClient({ 
        region: process.env.AWS_REGION || 'ap-southeast-2' 
    });
    
    // VALIDATION: Check if metrics exist and is an array
    const metrics = event.arguments?.metrics;
    
    if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
        console.error('Invalid metrics input:', metrics);
        return {
            success: false,
            message: 'Invalid or empty metrics array',
            userId: event.identity?.claims?.sub || 'unknown'
        };
    }
    
    // Extract user information safely
    const userId = event.identity?.claims?.sub || event.identity?.sub || 'anonymous';
    const userEmail = event.identity?.claims?.email || event.identity?.email || 'unknown';
    const userName = event.identity?.claims?.name || 
                     event.identity?.claims?.['cognito:username'] || 
                     event.identity?.username ||
                     'unknown';
    
    // Log user context
    console.log('Processing metrics for user:', {
        userId,
        userName,
        metricsCount: metrics.length
    });
    
    try {
        // Validate and process metrics
        const validMetrics = [];
        const invalidMetrics = [];
        
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
                
                // Parse dimensions safely
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
                
                // Build CloudWatch metric dimensions
                const dimensionsList = [
                    { Name: 'UserId', Value: userId },
                    { Name: 'UserName', Value: userName.substring(0, 255) }, // CloudWatch has 256 char limit
                    { Name: 'Environment', Value: process.env.ENV || 'dev' }
                ];
                
                // Add custom dimensions (filter out duplicates and invalid ones)
                for (const [key, value] of Object.entries(dimensions)) {
                    if (key !== 'UserId' && key !== 'UserName' && key !== 'Environment') {
                        // CloudWatch dimension value must be a string and max 256 chars
                        const stringValue = String(value).substring(0, 255);
                        if (stringValue && key.length <= 255) {
                            dimensionsList.push({
                                Name: key,
                                Value: stringValue
                            });
                        }
                    }
                }
                
                // CloudWatch allows max 10 dimensions per metric
                if (dimensionsList.length > 10) {
                    dimensionsList.splice(10);
                }
                
                validMetrics.push({
                    MetricName: m.metricName,
                    Value: parseFloat(m.value),
                    Unit: m.unit || 'Count',
                    Dimensions: dimensionsList,
                    Timestamp: m.timestamp ? new Date(m.timestamp) : new Date()
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
                userId: userId
            };
        }
        
        // Batch send to CloudWatch (max 20 metrics per request)
        const chunks = [];
        for (let i = 0; i < validMetrics.length; i += 20) {
            chunks.push(validMetrics.slice(i, i + 20));
        }
        
        const results = [];
        const failures = [];
        
        for (const [index, chunk] of chunks.entries()) {
            try {
                const result = await cloudwatch.send(new PutMetricDataCommand({
                    Namespace: 'ScraperSystem/Client',
                    MetricData: chunk
                }));
                results.push(result);
                console.log(`Batch ${index + 1}/${chunks.length} sent successfully`);
            } catch (batchError) {
                console.error(`Failed to send batch ${index + 1}:`, batchError);
                failures.push({
                    batch: index + 1,
                    error: batchError.message
                });
            }
        }
        
        // Store user activity metadata in CloudWatch Logs
        const metadataMetrics = metrics.filter(m => m.metadata);
        if (metadataMetrics.length > 0) {
            console.log('User Activity Metadata:', {
                userId,
                userName,
                timestamp: new Date().toISOString(),
                metrics: metadataMetrics.map(m => {
                    try {
                        return {
                            metricName: m.metricName,
                            metadata: typeof m.metadata === 'string' 
                                ? JSON.parse(m.metadata) 
                                : m.metadata
                        };
                    } catch (e) {
                        return {
                            metricName: m.metricName,
                            metadata: m.metadata
                        };
                    }
                })
            });
        }
        
        // Track usage statistics
        try {
            await cloudwatch.send(new PutMetricDataCommand({
                Namespace: 'ScraperSystem/Client',
                MetricData: [
                    {
                        MetricName: 'UserAPICallsPerSession',
                        Value: validMetrics.length,
                        Unit: 'Count',
                        Dimensions: [
                            { Name: 'UserId', Value: userId },
                            { Name: 'UserName', Value: userName.substring(0, 255) },
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
        const successRate = results.length / chunks.length;
        const success = successRate > 0.5; // Consider successful if more than 50% of batches succeeded
        
        return {
            success: success,
            message: failures.length > 0 
                ? `Published ${validMetrics.length} metrics with ${failures.length} batch failures`
                : `Successfully published ${validMetrics.length} metrics`,
            userId: userId
        };
        
    } catch (error) {
        console.error('Failed to publish metrics:', error);
        
        // Track metric publishing failures
        try {
            await cloudwatch.send(new PutMetricDataCommand({
                Namespace: 'ScraperSystem/Client',
                MetricData: [
                    {
                        MetricName: 'MetricPublishFailure',
                        Value: 1,
                        Unit: 'Count',
                        Dimensions: [
                            { Name: 'UserId', Value: userId },
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
            userId: userId
        };
    }
};