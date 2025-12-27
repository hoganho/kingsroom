// infrastructure/cloudwatch-monitoring.ts
// CloudWatch monitoring and alerting configuration for scraper system

import { 
    CloudWatchClient, 
    PutMetricDataCommand,
    PutMetricAlarmCommand,
    PutDashboardCommand
} from '@aws-sdk/client-cloudwatch';

// ===================================================================
// CloudWatch Metrics Publisher
// ===================================================================

export class ScraperMetricsPublisher {
    private cloudwatch: CloudWatchClient;
    private namespace = 'ScraperSystem';

    constructor(region: string = process.env.AWS_REGION || 'ap-southeast-2') {
        this.cloudwatch = new CloudWatchClient({ region });
    }

    /**
     * Publish job completion metrics
     */
    async publishJobMetrics(job: any): Promise<void> {
        const metrics = [
            {
                MetricName: 'JobCompleted',
                Value: 1,
                Unit: 'Count',
                Dimensions: [
                    { Name: 'Status', Value: job.status },
                    { Name: 'TriggerSource', Value: job.triggerSource }
                ],
                Timestamp: new Date()
            },
            {
                MetricName: 'JobDuration',
                Value: job.durationSeconds || 0,
                Unit: 'Seconds',
                Dimensions: [
                    { Name: 'TriggerSource', Value: job.triggerSource }
                ],
                Timestamp: new Date()
            },
            {
                MetricName: 'URLsProcessed',
                Value: job.totalURLsProcessed || 0,
                Unit: 'Count',
                Dimensions: [
                    { Name: 'TriggerSource', Value: job.triggerSource }
                ],
                Timestamp: new Date()
            },
            {
                MetricName: 'JobSuccessRate',
                Value: job.successRate || 0,
                Unit: 'Percent',
                Dimensions: [
                    { Name: 'TriggerSource', Value: job.triggerSource }
                ],
                Timestamp: new Date()
            },
            {
                MetricName: 'JobErrors',
                Value: job.errors || 0,
                Unit: 'Count',
                Dimensions: [
                    { Name: 'TriggerSource', Value: job.triggerSource }
                ],
                Timestamp: new Date()
            }
        ];

        try {
            await this.cloudwatch.send(new PutMetricDataCommand({
                Namespace: this.namespace,
                MetricData: metrics
            }));
        } catch (error) {
            console.error('Failed to publish job metrics:', error);
        }
    }

    /**
     * Publish URL processing metrics
     */
    async publishURLMetrics(url: string, status: string, processingTime: number): Promise<void> {
        const metrics = [
            {
                MetricName: 'URLProcessed',
                Value: 1,
                Unit: 'Count',
                Dimensions: [
                    { Name: 'Status', Value: status }
                ],
                Timestamp: new Date()
            },
            {
                MetricName: 'URLProcessingTime',
                Value: processingTime,
                Unit: 'Seconds',
                Dimensions: [
                    { Name: 'Status', Value: status }
                ],
                Timestamp: new Date()
            }
        ];

        if (status === 'FAILED' || status === 'ERROR') {
            metrics.push({
                MetricName: 'URLError',
                Value: 1,
                Unit: 'Count',
                Dimensions: [
                    { Name: 'URL', Value: url.substring(0, 255) } // Dimension value limit
                ],
                Timestamp: new Date()
            });
        }

        try {
            await this.cloudwatch.send(new PutMetricDataCommand({
                Namespace: this.namespace,
                MetricData: metrics
            }));
        } catch (error) {
            console.error('Failed to publish URL metrics:', error);
        }
    }

    /**
     * Publish system health metrics
     */
    async publishHealthMetrics(
        activeJobs: number,
        queuedJobs: number,
        errorRate: number,
        averageProcessingTime: number
    ): Promise<void> {
        const metrics = [
            {
                MetricName: 'ActiveJobs',
                Value: activeJobs,
                Unit: 'Count',
                Timestamp: new Date()
            },
            {
                MetricName: 'QueuedJobs',
                Value: queuedJobs,
                Unit: 'Count',
                Timestamp: new Date()
            },
            {
                MetricName: 'SystemErrorRate',
                Value: errorRate,
                Unit: 'Percent',
                Timestamp: new Date()
            },
            {
                MetricName: 'AverageProcessingTime',
                Value: averageProcessingTime,
                Unit: 'Seconds',
                Timestamp: new Date()
            }
        ];

        try {
            await this.cloudwatch.send(new PutMetricDataCommand({
                Namespace: this.namespace,
                MetricData: metrics
            }));
        } catch (error) {
            console.error('Failed to publish health metrics:', error);
        }
    }
}

// ===================================================================
// CloudWatch Alarms Configuration
// ===================================================================

export class ScraperAlarmsConfig {
    private cloudwatch: CloudWatchClient;
    private namespace = 'ScraperSystem';
    private snsTopicArn: string;

    constructor(
        snsTopicArn: string,
        region: string = process.env.AWS_REGION || 'ap-southeast-2'
    ) {
        this.cloudwatch = new CloudWatchClient({ region });
        this.snsTopicArn = snsTopicArn;
    }

    /**
     * Create all recommended alarms
     */
    async createAllAlarms(): Promise<void> {
        await Promise.all([
            this.createHighErrorRateAlarm(),
            this.createJobFailureAlarm(),
            this.createSlowProcessingAlarm(),
            this.createStuckJobAlarm(),
            this.createHighConsecutiveFailuresAlarm()
        ]);
    }

    /**
     * High error rate alarm
     */
    async createHighErrorRateAlarm(): Promise<void> {
        const command = new PutMetricAlarmCommand({
            AlarmName: 'ScraperSystem-HighErrorRate',
            AlarmDescription: 'Alert when scraper error rate exceeds 20%',
            ActionsEnabled: true,
            AlarmActions: [this.snsTopicArn],
            ComparisonOperator: 'GreaterThanThreshold',
            DatapointsToAlarm: 2,
            EvaluationPeriods: 3,
            MetricName: 'SystemErrorRate',
            Namespace: this.namespace,
            Period: 300, // 5 minutes
            Statistic: 'Average',
            Threshold: 20,
            TreatMissingData: 'notBreaching'
        });

        try {
            await this.cloudwatch.send(command);
            console.log('Created high error rate alarm');
        } catch (error) {
            console.error('Failed to create alarm:', error);
        }
    }

    /**
     * Job failure alarm
     */
    async createJobFailureAlarm(): Promise<void> {
        const command = new PutMetricAlarmCommand({
            AlarmName: 'ScraperSystem-JobFailures',
            AlarmDescription: 'Alert when multiple jobs fail consecutively',
            ActionsEnabled: true,
            AlarmActions: [this.snsTopicArn],
            ComparisonOperator: 'GreaterThanThreshold',
            DatapointsToAlarm: 3,
            Dimensions: [
                { Name: 'Status', Value: 'FAILED' }
            ],
            EvaluationPeriods: 3,
            MetricName: 'JobCompleted',
            Namespace: this.namespace,
            Period: 600, // 10 minutes
            Statistic: 'Sum',
            Threshold: 2,
            TreatMissingData: 'notBreaching'
        });

        try {
            await this.cloudwatch.send(command);
            console.log('Created job failure alarm');
        } catch (error) {
            console.error('Failed to create alarm:', error);
        }
    }

    /**
     * Slow processing alarm
     */
    async createSlowProcessingAlarm(): Promise<void> {
        const command = new PutMetricAlarmCommand({
            AlarmName: 'ScraperSystem-SlowProcessing',
            AlarmDescription: 'Alert when average processing time exceeds 10 seconds',
            ActionsEnabled: true,
            AlarmActions: [this.snsTopicArn],
            ComparisonOperator: 'GreaterThanThreshold',
            DatapointsToAlarm: 2,
            EvaluationPeriods: 3,
            MetricName: 'AverageProcessingTime',
            Namespace: this.namespace,
            Period: 900, // 15 minutes
            Statistic: 'Average',
            Threshold: 10,
            TreatMissingData: 'notBreaching'
        });

        try {
            await this.cloudwatch.send(command);
            console.log('Created slow processing alarm');
        } catch (error) {
            console.error('Failed to create alarm:', error);
        }
    }

    /**
     * Stuck job detection
     */
    async createStuckJobAlarm(): Promise<void> {
        const command = new PutMetricAlarmCommand({
            AlarmName: 'ScraperSystem-StuckJob',
            AlarmDescription: 'Alert when job duration exceeds 15 minutes',
            ActionsEnabled: true,
            AlarmActions: [this.snsTopicArn],
            ComparisonOperator: 'GreaterThanThreshold',
            DatapointsToAlarm: 1,
            EvaluationPeriods: 1,
            MetricName: 'JobDuration',
            Namespace: this.namespace,
            Period: 300, // 5 minutes
            Statistic: 'Maximum',
            Threshold: 900, // 15 minutes
            TreatMissingData: 'notBreaching'
        });

        try {
            await this.cloudwatch.send(command);
            console.log('Created stuck job alarm');
        } catch (error) {
            console.error('Failed to create alarm:', error);
        }
    }

    /**
     * High consecutive failures alarm
     */
    async createHighConsecutiveFailuresAlarm(): Promise<void> {
        const command = new PutMetricAlarmCommand({
            AlarmName: 'ScraperSystem-ConsecutiveFailures',
            AlarmDescription: 'Alert when URL errors exceed threshold',
            ActionsEnabled: true,
            AlarmActions: [this.snsTopicArn],
            ComparisonOperator: 'GreaterThanThreshold',
            DatapointsToAlarm: 1,
            EvaluationPeriods: 1,
            MetricName: 'URLError',
            Namespace: this.namespace,
            Period: 3600, // 1 hour
            Statistic: 'Sum',
            Threshold: 50,
            TreatMissingData: 'notBreaching'
        });

        try {
            await this.cloudwatch.send(command);
            console.log('Created consecutive failures alarm');
        } catch (error) {
            console.error('Failed to create alarm:', error);
        }
    }
}

// ===================================================================
// CloudWatch Dashboard Configuration
// ===================================================================

export class ScraperDashboard {
    private cloudwatch: CloudWatchClient;
    private namespace = 'ScraperSystem';
    private region: string;

    constructor(region: string = process.env.AWS_REGION || 'ap-southeast-2') {
        this.cloudwatch = new CloudWatchClient({ region });
        this.region = region;
    }

    /**
     * Create comprehensive dashboard
     */
    async createDashboard(dashboardName: string = 'ScraperSystem'): Promise<void> {
        const dashboardBody = JSON.stringify({
            widgets: [
                // Job Success Rate
                {
                    type: 'metric',
                    x: 0,
                    y: 0,
                    width: 12,
                    height: 6,
                    properties: {
                        metrics: [
                            [this.namespace, 'JobSuccessRate', { stat: 'Average' }]
                        ],
                        period: 300,
                        stat: 'Average',
                        region: this.region,
                        title: 'Job Success Rate',
                        yAxis: { left: { min: 0, max: 100 } }
                    }
                },
                // URLs Processed
                {
                    type: 'metric',
                    x: 12,
                    y: 0,
                    width: 12,
                    height: 6,
                    properties: {
                        metrics: [
                            [this.namespace, 'URLsProcessed', { stat: 'Sum' }]
                        ],
                        period: 300,
                        stat: 'Sum',
                        region: this.region,
                        title: 'URLs Processed'
                    }
                },
                // Job Duration
                {
                    type: 'metric',
                    x: 0,
                    y: 6,
                    width: 12,
                    height: 6,
                    properties: {
                        metrics: [
                            [this.namespace, 'JobDuration', { stat: 'Average' }],
                            ['.', '.', { stat: 'Maximum' }]
                        ],
                        period: 300,
                        stat: 'Average',
                        region: this.region,
                        title: 'Job Duration (seconds)'
                    }
                },
                // Error Rate
                {
                    type: 'metric',
                    x: 12,
                    y: 6,
                    width: 12,
                    height: 6,
                    properties: {
                        metrics: [
                            [this.namespace, 'SystemErrorRate', { stat: 'Average' }]
                        ],
                        period: 300,
                        stat: 'Average',
                        region: this.region,
                        title: 'System Error Rate',
                        yAxis: { left: { min: 0, max: 100 } }
                    }
                },
                // Job Status Distribution
                {
                    type: 'metric',
                    x: 0,
                    y: 12,
                    width: 8,
                    height: 6,
                    properties: {
                        metrics: [
                            [this.namespace, 'JobCompleted', { stat: 'Sum', dimensions: { Status: 'COMPLETED' } }],
                            ['.', '.', { stat: 'Sum', dimensions: { Status: 'FAILED' } }],
                            ['.', '.', { stat: 'Sum', dimensions: { Status: 'CANCELLED' } }]
                        ],
                        period: 3600,
                        stat: 'Sum',
                        region: this.region,
                        title: 'Jobs by Status (Hourly)',
                        stacked: true
                    }
                },
                // Processing Time Distribution
                {
                    type: 'metric',
                    x: 8,
                    y: 12,
                    width: 8,
                    height: 6,
                    properties: {
                        metrics: [
                            [this.namespace, 'URLProcessingTime', { stat: 'Average' }],
                            ['.', '.', { stat: 'p50' }],
                            ['.', '.', { stat: 'p90' }],
                            ['.', '.', { stat: 'p99' }]
                        ],
                        period: 300,
                        stat: 'Average',
                        region: this.region,
                        title: 'URL Processing Time Distribution'
                    }
                },
                // Active and Queued Jobs
                {
                    type: 'metric',
                    x: 16,
                    y: 12,
                    width: 8,
                    height: 6,
                    properties: {
                        metrics: [
                            [this.namespace, 'ActiveJobs', { stat: 'Average' }],
                            [this.namespace, 'QueuedJobs', { stat: 'Average' }]
                        ],
                        period: 300,
                        stat: 'Average',
                        region: this.region,
                        title: 'Job Queue Status'
                    }
                },
                // Recent Logs
                {
                    type: 'log',
                    x: 0,
                    y: 18,
                    width: 24,
                    height: 6,
                    properties: {
                        query: `SOURCE '/aws/lambda/autoScraper'
                            | fields @timestamp, @message
                            | filter @message like /ERROR/
                            | sort @timestamp desc
                            | limit 20`,
                        region: this.region,
                        title: 'Recent Errors'
                    }
                }
            ]
        });

        const command = new PutDashboardCommand({
            DashboardName: dashboardName,
            DashboardBody: dashboardBody
        });

        try {
            await this.cloudwatch.send(command);
            console.log(`Created dashboard: ${dashboardName}`);
        } catch (error) {
            console.error('Failed to create dashboard:', error);
        }
    }
}

// ===================================================================
// Lambda Function Integration
// ===================================================================

/**
 * Helper function to integrate metrics in Lambda
 */
export const publishMetricsFromLambda = async (
    event: string,
    data: any
): Promise<void> => {
    const publisher = new ScraperMetricsPublisher();

    switch (event) {
        case 'JOB_COMPLETED':
            await publisher.publishJobMetrics(data);
            break;
        case 'URL_PROCESSED':
            await publisher.publishURLMetrics(
                data.url,
                data.status,
                data.processingTime
            );
            break;
        case 'HEALTH_CHECK':
            await publisher.publishHealthMetrics(
                data.activeJobs,
                data.queuedJobs,
                data.errorRate,
                data.averageProcessingTime
            );
            break;
    }
};

// ===================================================================
// Setup Script
// ===================================================================

export const setupCloudWatchMonitoring = async (
    snsTopicArn: string,
    region?: string
): Promise<void> => {
    console.log('Setting up CloudWatch monitoring...');

    // Create alarms
    const alarmsConfig = new ScraperAlarmsConfig(snsTopicArn, region);
    await alarmsConfig.createAllAlarms();

    // Create dashboard
    const dashboard = new ScraperDashboard(region);
    await dashboard.createDashboard();

    console.log('CloudWatch monitoring setup complete');
};
