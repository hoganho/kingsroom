/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	AUTH_KINGSROOMC05D6627_USERPOOLID
	ENV
	REGION
Amplify Params - DO NOT EDIT */

// amplify/backend/function/publishClientMetrics/src/index.js
// Lambda function to publish client metrics with user context

const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');

exports.handler = async (event) => {
    console.log('Event received:', JSON.stringify(event, null, 2));
    
    const cloudwatch = new CloudWatchClient({ 
        region: process.env.AWS_REGION || 'ap-southeast-2' 
    });
    
    // Extract user information from the event
    // Amplify provides user info in event.identity
    const userId = event.identity?.claims?.sub || 'anonymous';
    const userEmail = event.identity?.claims?.email || 'unknown';
    const userName = event.identity?.claims?.name || 
                     event.identity?.claims?.['cognito:username'] || 
                     'unknown';
    
    // Get metrics from the GraphQL mutation arguments
    const metrics = event.arguments.metrics;
    
    // Log user context
    console.log('Processing metrics for user:', {
        userId,
        userName,
        metricsCount: metrics.length
    });
    
    try {
        // Process and enrich metrics with user context
        const metricData = metrics.map(m => {
            // Parse dimensions from JSON string
            const dimensions = JSON.parse(m.dimensions || '{}');
            
            // Add user dimensions
            const enrichedDimensions = [
                { Name: 'UserId', Value: userId },
                { Name: 'UserName', Value: userName },
                // Add any custom dimensions from the client
                ...Object.entries(dimensions)
                    .filter(([key]) => key !== 'UserId' && key !== 'UserName') // Avoid duplicates
                    .map(([name, value]) => ({
                        Name: name,
                        Value: String(value)
                    }))
            ];
            
            return {
                MetricName: m.metricName,
                Value: parseFloat(m.value),
                Unit: m.unit || 'Count',
                Dimensions: enrichedDimensions,
                Timestamp: m.timestamp ? new Date(m.timestamp) : new Date()
            };
        });
        
        // Batch send to CloudWatch (max 20 metrics per request)
        const chunks = [];
        for (let i = 0; i < metricData.length; i += 20) {
            chunks.push(metricData.slice(i, i + 20));
        }
        
        const results = await Promise.all(chunks.map(chunk => 
            cloudwatch.send(new PutMetricDataCommand({
                Namespace: 'ScraperSystem/Client',
                MetricData: chunk
            }))
        ));
        
        // Store user activity metadata in CloudWatch Logs
        if (metrics.some(m => m.metadata)) {
            console.log('User Activity Metadata:', {
                userId,
                userName,
                timestamp: new Date().toISOString(),
                metrics: metrics
                    .filter(m => m.metadata)
                    .map(m => ({
                        metricName: m.metricName,
                        metadata: JSON.parse(m.metadata || '{}')
                    }))
            });
        }
        
        // Track usage statistics per user
        await cloudwatch.send(new PutMetricDataCommand({
            Namespace: 'ScraperSystem/Client',
            MetricData: [
                {
                    MetricName: 'UserAPICallsPerSession',
                    Value: metrics.length,
                    Unit: 'Count',
                    Dimensions: [
                        { Name: 'UserId', Value: userId },
                        { Name: 'UserName', Value: userName }
                    ],
                    Timestamp: new Date()
                }
            ]
        }));
        
        return {
            success: true,
            message: `Published ${metrics.length} metrics for user ${userName}`,
            userId: userId
        };
        
    } catch (error) {
        console.error('Failed to publish metrics:', error);
        
        // Track metric publishing failures per user
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
                            { Name: 'ErrorType', Value: error.name || 'Unknown' }
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
            message: error.message,
            userId: userId
        };
    }
};
