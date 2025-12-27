/* Amplify Params - DO NOT EDIT
	ENV
	REGION
Amplify Params - DO NOT EDIT */

// amplify/backend/function/getDatabaseMetrics/src/index.js
// OPTIMIZED VERSION - Uses GetMetricData for batch queries and parallel processing

const { 
    CloudWatchClient, 
    GetMetricDataCommand, 
    ListMetricsCommand 
} = require("@aws-sdk/client-cloudwatch");

const cloudwatch = new CloudWatchClient({ 
    region: process.env.AWS_REGION || 'ap-southeast-2' 
});

// Time range helper with appropriate period selection
const getTimeRange = (timeRangeStr) => {
    const now = new Date();
    const ranges = {
        'LAST_HOUR': { ms: 60 * 60 * 1000, period: 60 },           // 1 min granularity
        'LAST_24_HOURS': { ms: 24 * 60 * 60 * 1000, period: 300 }, // 5 min granularity
        'LAST_7_DAYS': { ms: 7 * 24 * 60 * 60 * 1000, period: 3600 }, // 1 hour granularity
        'LAST_30_DAYS': { ms: 30 * 24 * 60 * 60 * 1000, period: 86400 } // 1 day granularity
    };
    
    const config = ranges[timeRangeStr] || ranges['LAST_24_HOURS'];
    return {
        startTime: new Date(now.getTime() - config.ms),
        endTime: now,
        period: config.period
    };
};

// Helper to chunk arrays for batch processing
const chunkArray = (array, size) => {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
};

exports.handler = async (event) => {
    console.log('getDatabaseMetrics event:', JSON.stringify(event, null, 2));
    const startExecution = Date.now();

    const timeRange = event.arguments?.timeRange || 'LAST_24_HOURS';
    const { startTime, endTime, period } = getTimeRange(timeRange);
    
    try {
        // Step 1: List all available metrics in parallel (limit to key metric types)
        const metricNames = [
            'Lambda_Database_Success',
            'Lambda_Database_Failure',
            'Lambda_Database_Duration',
            'Lambda_Database_INSERT',
            'Lambda_Database_UPDATE',
            'Lambda_Database_DELETE',
            'Lambda_Database_QUERY'
        ];
        
        console.log(`Listing metrics for ${metricNames.length} metric types...`);
        
        // Fetch all metric listings in parallel
        const listPromises = metricNames.map(metricName => 
            cloudwatch.send(new ListMetricsCommand({
                Namespace: 'ScraperSystem/Lambda',
                MetricName: metricName
            })).catch(err => {
                console.log(`No metrics found for ${metricName}`);
                return { Metrics: [] };
            })
        );
        
        const listResponses = await Promise.all(listPromises);
        console.log(`Listed metrics in ${Date.now() - startExecution}ms`);
        
        // Step 2: Build metric queries for GetMetricData
        // GetMetricData can fetch up to 500 metrics in a single call
        const metricQueries = [];
        const metricMetadata = new Map(); // Store metadata for each query ID
        
        listResponses.forEach((response, idx) => {
            const metricName = metricNames[idx];
            (response.Metrics || []).forEach((metricConfig, configIdx) => {
                const dimensions = {};
                metricConfig.Dimensions?.forEach(dim => {
                    dimensions[dim.Name] = dim.Value;
                });
                
                // Create a unique query ID (alphanumeric only, max 255 chars)
                const queryId = `m${idx}_${configIdx}`.replace(/[^a-zA-Z0-9_]/g, '');
                
                metricQueries.push({
                    Id: queryId,
                    MetricStat: {
                        Metric: {
                            Namespace: 'ScraperSystem/Lambda',
                            MetricName: metricName,
                            Dimensions: metricConfig.Dimensions
                        },
                        Period: period,
                        Stat: metricName === 'Lambda_Database_Duration' ? 'Average' : 'Sum'
                    },
                    ReturnData: true
                });
                
                metricMetadata.set(queryId, {
                    metricName,
                    dimensions,
                    functionName: dimensions.Function || 'unknown',
                    operation: dimensions.Operation || metricName.replace('Lambda_Database_', ''),
                    table: dimensions.Table || 'unknown'
                });
            });
        });
        
        console.log(`Built ${metricQueries.length} metric queries`);
        
        if (metricQueries.length === 0) {
            console.log('No metrics found, returning empty result');
            return { metrics: [] };
        }
        
        // Step 3: Execute GetMetricData in batches (max 500 per call)
        const operationMap = new Map();
        const queryChunks = chunkArray(metricQueries, 500);
        
        console.log(`Executing ${queryChunks.length} GetMetricData batch(es)...`);
        
        const dataPromises = queryChunks.map(chunk => 
            cloudwatch.send(new GetMetricDataCommand({
                MetricDataQueries: chunk,
                StartTime: startTime,
                EndTime: endTime
            }))
        );
        
        const dataResponses = await Promise.all(dataPromises);
        console.log(`Fetched metric data in ${Date.now() - startExecution}ms`);
        
        // Step 4: Process results
        dataResponses.forEach(response => {
            (response.MetricDataResults || []).forEach(result => {
                const metadata = metricMetadata.get(result.Id);
                if (!metadata) return;
                
                const { metricName, functionName, operation, table } = metadata;
                
                // Process each timestamp/value pair
                (result.Timestamps || []).forEach((timestamp, i) => {
                    const value = result.Values?.[i] || 0;
                    const timestampStr = timestamp.toISOString();
                    const key = `${functionName}-${operation}-${table}-${timestampStr}`;
                    
                    if (!operationMap.has(key)) {
                        operationMap.set(key, {
                            functionName,
                            operation,
                            table,
                            timestamp: timestampStr,
                            success: true,
                            count: 0,
                            duration: null
                        });
                    }
                    
                    const op = operationMap.get(key);
                    
                    // Update based on metric type
                    if (metricName === 'Lambda_Database_Success' || 
                        metricName.includes('INSERT') || 
                        metricName.includes('UPDATE') ||
                        metricName.includes('DELETE') ||
                        metricName.includes('QUERY')) {
                        op.count += value;
                    } else if (metricName === 'Lambda_Database_Failure') {
                        if (value > 0) {
                            op.success = false;
                            op.count += value;
                        }
                    } else if (metricName === 'Lambda_Database_Duration') {
                        op.duration = value;
                    }
                });
            });
        });
        
        // Step 5: Sort and return results
        const metrics = Array.from(operationMap.values())
            .filter(m => m.count > 0 || m.duration !== null) // Only include metrics with actual data
            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
            .slice(0, 1000); // Limit to 1000 most recent
        
        const totalTime = Date.now() - startExecution;
        console.log(`Returning ${metrics.length} metrics (processed in ${totalTime}ms)`);
        
        if (metrics.length > 0) {
            console.log('Sample metrics:', JSON.stringify(metrics.slice(0, 3), null, 2));
        }
        
        return { metrics };

    } catch (error) {
        console.error('Error fetching database metrics:', error);
        console.error('Error details:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        return { metrics: [] };
    }
};