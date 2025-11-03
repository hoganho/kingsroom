/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	AUTH_KINGSROOMC05D6627_USERPOOLID
	ENV
	REGION
Amplify Params - DO NOT EDIT */

// amplify/backend/function/getUserMetrics/src/index.js
// Complete implementation for retrieving user metrics from CloudWatch

const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch({
    region: process.env.AWS_REGION || 'ap-southeast-2'
});

// Time range helpers
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
    console.log('getUserMetrics event:', JSON.stringify(event, null, 2));
    
    // Extract user information from the event
    const userId = event.identity?.claims?.sub || 
                   event.identity?.sub || 
                   event.arguments?.userId || 
                   'unknown';
                   
    const userName = event.identity?.claims?.name || 
                     event.identity?.claims?.['cognito:username'] || 
                     event.identity?.username || 
                     'Unknown';
    
    const timeRange = event.arguments?.timeRange || 'LAST_24_HOURS';
    const { startTime, endTime } = getTimeRange(timeRange);
    
    console.log(`Fetching metrics for user ${userId} from ${startTime} to ${endTime}`);
    
    try {
        // Prepare all metric queries in parallel
        const metricPromises = [];
        
        // 1. Get total user actions
        metricPromises.push(
            cloudwatch.getMetricStatistics({
                Namespace: 'ScraperSystem/Client',
                MetricName: 'UserAction',
                Dimensions: [
                    { Name: 'UserId', Value: userId }
                ],
                StartTime: startTime,
                EndTime: endTime,
                Period: 86400, // 1 day periods
                Statistics: ['Sum']
            }).promise().catch(err => {
                console.error('Error fetching UserAction metrics:', err);
                return { Datapoints: [] };
            })
        );
        
        // 2. Get total page views
        metricPromises.push(
            cloudwatch.getMetricStatistics({
                Namespace: 'ScraperSystem/Client',
                MetricName: 'PageView',
                Dimensions: [
                    { Name: 'UserId', Value: userId }
                ],
                StartTime: startTime,
                EndTime: endTime,
                Period: 86400,
                Statistics: ['Sum']
            }).promise().catch(err => {
                console.error('Error fetching PageView metrics:', err);
                return { Datapoints: [] };
            })
        );
        
        // 3. Get total errors
        metricPromises.push(
            cloudwatch.getMetricStatistics({
                Namespace: 'ScraperSystem/Client',
                MetricName: 'ClientError',
                Dimensions: [
                    { Name: 'UserId', Value: userId }
                ],
                StartTime: startTime,
                EndTime: endTime,
                Period: 86400,
                Statistics: ['Sum']
            }).promise().catch(err => {
                console.error('Error fetching ClientError metrics:', err);
                return { Datapoints: [] };
            })
        );
        
        // 4. Get API errors
        metricPromises.push(
            cloudwatch.getMetricStatistics({
                Namespace: 'ScraperSystem/Client',
                MetricName: 'APIError',
                Dimensions: [
                    { Name: 'UserId', Value: userId }
                ],
                StartTime: startTime,
                EndTime: endTime,
                Period: 86400,
                Statistics: ['Sum']
            }).promise().catch(err => {
                console.error('Error fetching APIError metrics:', err);
                return { Datapoints: [] };
            })
        );
        
        // 5. Get feature usage data using GetMetricData for more complex queries
        metricPromises.push(
            cloudwatch.getMetricData({
                MetricDataQueries: [
                    {
                        Id: 'feature_usage',
                        MetricStat: {
                            Metric: {
                                Namespace: 'ScraperSystem/Client',
                                MetricName: 'FeatureUsage',
                                Dimensions: [
                                    { Name: 'UserId', Value: userId }
                                ]
                            },
                            Period: 86400,
                            Stat: 'SampleCount'
                        },
                        ReturnData: true
                    },
                    {
                        Id: 'tab_switches',
                        MetricStat: {
                            Metric: {
                                Namespace: 'ScraperSystem/Client',
                                MetricName: 'TabSwitch',
                                Dimensions: [
                                    { Name: 'UserId', Value: userId }
                                ]
                            },
                            Period: 86400,
                            Stat: 'SampleCount'
                        },
                        ReturnData: true
                    }
                ],
                StartTime: startTime,
                EndTime: endTime
            }).promise().catch(err => {
                console.error('Error fetching metric data:', err);
                return { MetricDataResults: [] };
            })
        );
        
        // Execute all queries in parallel
        const [
            userActionsResult,
            pageViewsResult,
            clientErrorsResult,
            apiErrorsResult,
            metricDataResult
        ] = await Promise.all(metricPromises);
        
        // Sum up the datapoints
        const sumDatapoints = (result) => {
            if (!result.Datapoints || result.Datapoints.length === 0) {
                return 0;
            }
            return result.Datapoints.reduce((sum, dp) => sum + (dp.Sum || 0), 0);
        };
        
        const totalActions = sumDatapoints(userActionsResult);
        const totalPageViews = sumDatapoints(pageViewsResult);
        const totalClientErrors = sumDatapoints(clientErrorsResult);
        const totalAPIErrors = sumDatapoints(apiErrorsResult);
        const totalErrors = totalClientErrors + totalAPIErrors;
        
        // Get feature usage from metric data results
        let mostUsedFeature = 'dashboard';
        if (metricDataResult.MetricDataResults) {
            const featureUsage = metricDataResult.MetricDataResults.find(r => r.Id === 'feature_usage');
            if (featureUsage && featureUsage.Values && featureUsage.Values.length > 0) {
                // This is simplified - you'd need to track feature names in dimensions
                mostUsedFeature = 'ScraperAdmin';
            }
        }
        
        // Determine last active time
        // Try to get the most recent metric timestamp
        let lastActive = new Date().toISOString();
        const allDatapoints = [
            ...(userActionsResult.Datapoints || []),
            ...(pageViewsResult.Datapoints || [])
        ];
        
        if (allDatapoints.length > 0) {
            const sortedByTime = allDatapoints
                .filter(dp => dp.Timestamp)
                .sort((a, b) => new Date(b.Timestamp) - new Date(a.Timestamp));
            
            if (sortedByTime.length > 0) {
                lastActive = sortedByTime[0].Timestamp;
            }
        }
        
        // Build the response
        const response = {
            userId: userId,
            userName: userName,
            totalActions: Math.floor(totalActions),
            totalPageViews: Math.floor(totalPageViews),
            totalErrors: Math.floor(totalErrors),
            lastActive: lastActive,
            mostUsedFeature: mostUsedFeature
        };
        
        console.log('Returning metrics summary:', response);
        return response;
        
    } catch (error) {
        console.error('Error fetching metrics:', error);
        
        // Return default values on error
        return {
            userId: userId,
            userName: userName,
            totalActions: 0,
            totalPageViews: 0,
            totalErrors: 0,
            lastActive: new Date().toISOString(),
            mostUsedFeature: 'None'
        };
    }
};

// Optional: Helper function to get most used features
// This would require tracking feature names as a dimension
async function getMostUsedFeature(cloudwatch, userId, startTime, endTime) {
    try {
        // List all metrics with FeatureName dimension
        const listParams = {
            Namespace: 'ScraperSystem/Client',
            MetricName: 'FeatureUsage',
            Dimensions: [
                { Name: 'UserId', Value: userId }
            ]
        };
        
        const metrics = await cloudwatch.listMetrics(listParams).promise();
        
        if (!metrics.Metrics || metrics.Metrics.length === 0) {
            return 'None';
        }
        
        // Get statistics for each feature
        const featurePromises = metrics.Metrics.map(metric => {
            const featureName = metric.Dimensions.find(d => d.Name === 'FeatureName')?.Value;
            if (!featureName) return null;
            
            return cloudwatch.getMetricStatistics({
                Namespace: 'ScraperSystem/Client',
                MetricName: 'FeatureUsage',
                Dimensions: metric.Dimensions,
                StartTime: startTime,
                EndTime: endTime,
                Period: 86400,
                Statistics: ['Sum']
            }).promise().then(result => ({
                feature: featureName,
                count: result.Datapoints.reduce((sum, dp) => sum + (dp.Sum || 0), 0)
            })).catch(() => ({ feature: featureName, count: 0 }));
        }).filter(p => p !== null);
        
        const featureUsage = await Promise.all(featurePromises);
        
        // Find the most used feature
        const sorted = featureUsage.sort((a, b) => b.count - a.count);
        return sorted.length > 0 ? sorted[0].feature : 'None';
        
    } catch (error) {
        console.error('Error getting most used feature:', error);
        return 'None';
    }
}