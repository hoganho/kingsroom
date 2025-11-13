/* Amplify Params - DO NOT EDIT
	ENV
	REGION
Amplify Params - DO NOT EDIT */

// amplify/backend/function/getDatabaseMetrics/src/index.js
// FIXED VERSION - Properly retrieves and processes CloudWatch metrics

const { CloudWatchClient, GetMetricStatisticsCommand, ListMetricsCommand } = require("@aws-sdk/client-cloudwatch");

const cloudwatch = new CloudWatchClient({ 
    region: process.env.AWS_REGION || 'ap-southeast-2' 
});

// Time range helper
const getTimeRange = (timeRangeStr) => {
    const now = new Date();
    const ranges = {
        'LAST_HOUR': 60 * 60 * 1000,
        'LAST_24_HOURS': 24 * 60 * 60 * 1000,
        'LAST_7_DAYS': 7 * 24 * 60 * 60 * 1000,
        'LAST_30_DAYS': 30 * 24 * 60 * 60 * 1000
    };
    
    const milliseconds = ranges[timeRangeStr] || ranges['LAST_24_HOURS'];
    return {
        startTime: new Date(now.getTime() - milliseconds),
        endTime: now
    };
};

exports.handler = async (event) => {
    console.log('getDatabaseMetrics event:', JSON.stringify(event, null, 2));

    const timeRange = event.arguments?.timeRange || 'LAST_24_HOURS';
    const { startTime, endTime } = getTimeRange(timeRange);
    
    try {
        // First, list all available metrics to see what dimensions we have
        const listCommand = new ListMetricsCommand({
            Namespace: 'ScraperSystem/Lambda',
            MetricName: 'Lambda_Database_Success' // Start with success metrics
        });
        
        const listResponse = await cloudwatch.send(listCommand);
        console.log(`Found ${listResponse.Metrics?.length || 0} metric configurations`);
        
        // Collect all unique dimension combinations
        const operationMap = new Map();
        
        // For each metric configuration, get the actual data points
        for (const metricConfig of (listResponse.Metrics || [])) {
            const dimensions = {};
            metricConfig.Dimensions?.forEach(dim => {
                dimensions[dim.Name] = dim.Value;
            });
            
            // Get success metrics
            const successCommand = new GetMetricStatisticsCommand({
                Namespace: 'ScraperSystem/Lambda',
                MetricName: 'Lambda_Database_Success',
                Dimensions: metricConfig.Dimensions,
                StartTime: startTime,
                EndTime: endTime,
                Period: 300, // 5 minutes
                Statistics: ['Sum']
            });
            
            const successResponse = await cloudwatch.send(successCommand);
            
            // Get failure metrics
            const failureCommand = new GetMetricStatisticsCommand({
                Namespace: 'ScraperSystem/Lambda',
                MetricName: 'Lambda_Database_Failure',
                Dimensions: metricConfig.Dimensions,
                StartTime: startTime,
                EndTime: endTime,
                Period: 300,
                Statistics: ['Sum']
            });
            
            const failureResponse = await cloudwatch.send(failureCommand);
            
            // Get duration metrics
            const durationCommand = new GetMetricStatisticsCommand({
                Namespace: 'ScraperSystem/Lambda',
                MetricName: 'Lambda_Database_Duration',
                Dimensions: metricConfig.Dimensions,
                StartTime: startTime,
                EndTime: endTime,
                Period: 300,
                Statistics: ['Average']
            });
            
            const durationResponse = await cloudwatch.send(durationCommand);
            
            // Process the datapoints
            successResponse.Datapoints?.forEach(dp => {
                const key = `${dimensions.Function || 'unknown'}-${dimensions.Operation || 'unknown'}-${dimensions.Table || 'unknown'}-${dp.Timestamp.toISOString()}`;
                
                if (!operationMap.has(key)) {
                    operationMap.set(key, {
                        functionName: dimensions.Function || 'unknown',
                        operation: dimensions.Operation || 'unknown',
                        table: dimensions.Table || 'unknown',
                        timestamp: dp.Timestamp.toISOString(),
                        success: true,
                        count: 0,
                        duration: null
                    });
                }
                
                const op = operationMap.get(key);
                op.count += dp.Sum || 0;
            });
            
            failureResponse.Datapoints?.forEach(dp => {
                const key = `${dimensions.Function || 'unknown'}-${dimensions.Operation || 'unknown'}-${dimensions.Table || 'unknown'}-${dp.Timestamp.toISOString()}`;
                
                if (!operationMap.has(key)) {
                    operationMap.set(key, {
                        functionName: dimensions.Function || 'unknown',
                        operation: dimensions.Operation || 'unknown',
                        table: dimensions.Table || 'unknown',
                        timestamp: dp.Timestamp.toISOString(),
                        success: false,
                        count: 0,
                        duration: null
                    });
                }
                
                const op = operationMap.get(key);
                op.success = false;
                op.count += dp.Sum || 0;
            });
            
            durationResponse.Datapoints?.forEach(dp => {
                const key = `${dimensions.Function || 'unknown'}-${dimensions.Operation || 'unknown'}-${dimensions.Table || 'unknown'}-${dp.Timestamp.toISOString()}`;
                
                if (operationMap.has(key)) {
                    const op = operationMap.get(key);
                    op.duration = dp.Average || 0;
                }
            });
        }
        
        // Also check for metrics with different dimension combinations
        const metricNames = [
            'Lambda_Database_INSERT',
            'Lambda_Database_UPDATE', 
            'Lambda_Database_DELETE',
            'Lambda_Database_QUERY'
        ];
        
        for (const metricName of metricNames) {
            try {
                const listCmd = new ListMetricsCommand({
                    Namespace: 'ScraperSystem/Lambda',
                    MetricName: metricName
                });
                
                const metricsResponse = await cloudwatch.send(listCmd);
                
                for (const metricConfig of (metricsResponse.Metrics || [])) {
                    const dimensions = {};
                    metricConfig.Dimensions?.forEach(dim => {
                        dimensions[dim.Name] = dim.Value;
                    });
                    
                    const statsCommand = new GetMetricStatisticsCommand({
                        Namespace: 'ScraperSystem/Lambda',
                        MetricName: metricName,
                        Dimensions: metricConfig.Dimensions,
                        StartTime: startTime,
                        EndTime: endTime,
                        Period: 300,
                        Statistics: ['Sum']
                    });
                    
                    const statsResponse = await cloudwatch.send(statsCommand);
                    const operation = metricName.replace('Lambda_Database_', '');
                    
                    statsResponse.Datapoints?.forEach(dp => {
                        const key = `${dimensions.Function || 'unknown'}-${operation}-${dimensions.Table || 'unknown'}-${dp.Timestamp.toISOString()}`;
                        
                        if (!operationMap.has(key)) {
                            operationMap.set(key, {
                                functionName: dimensions.Function || 'unknown',
                                operation: operation,
                                table: dimensions.Table || 'unknown',
                                timestamp: dp.Timestamp.toISOString(),
                                success: true, // Assume success if no explicit failure metric
                                count: dp.Sum || 0,
                                duration: null
                            });
                        }
                    });
                }
            } catch (err) {
                console.log(`No metrics found for ${metricName}`);
            }
        }
        
        const metrics = Array.from(operationMap.values())
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        
        console.log(`Returning ${metrics.length} aggregated metric data points`);
        
        // Log sample metrics for debugging
        if (metrics.length > 0) {
            console.log('Sample metrics:', JSON.stringify(metrics.slice(0, 3), null, 2));
        }
        
        return {
            metrics: metrics
        };

    } catch (error) {
        console.error('Error fetching database metrics:', error);
        return {
            metrics: []
        };
    }
};