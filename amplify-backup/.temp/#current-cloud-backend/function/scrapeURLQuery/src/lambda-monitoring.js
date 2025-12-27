// lambda-monitoring.js
// Database monitoring utility for Lambda functions
// Place this in your Lambda function directories or as a Lambda layer

const { CloudWatchClient, PutMetricDataCommand } = require('@aws-sdk/client-cloudwatch');

class LambdaMonitoring {
    constructor(functionName, entityId = null) {
        this.functionName = functionName;
        this.entityId = entityId;
        this.cloudwatch = new CloudWatchClient({ 
            region: process.env.AWS_REGION || 'ap-southeast-2' 
        });
        this.operations = [];
        this.batchTimer = null;
        this.batchSize = 20; // CloudWatch max is 20 metrics per call
        this.debug = process.env.MONITORING_DEBUG === 'true';
    }

    /**
     * Track a database operation
     */
    trackOperation(operation, table, recordId = null, metadata = {}) {
        const op = {
            operation: operation.toUpperCase(),
            table,
            recordId,
            metadata,
            timestamp: new Date().toISOString(),
            source: 'LAMBDA',
            functionName: this.functionName,
            entityId: this.entityId
        };

        if (this.debug) {
            console.log(`[Monitor] ${op.operation} ${table} ${recordId || ''}`);
        }

        this.operations.push(op);
        
        // Batch operations for CloudWatch
        this.scheduleBatch();
        
        return op;
    }

    /**
     * Track DynamoDB operations automatically
     */
    wrapDynamoDBClient(ddbDocClient) {
        const self = this;
        const originalSend = ddbDocClient.send.bind(ddbDocClient);
        
        ddbDocClient.send = async function(command) {
            const commandName = command.constructor.name;
            let operation = 'UNKNOWN';
            let table = 'Unknown';
            let recordId = null;
            
            // Extract operation type and table from command
            try {
                const input = command.input || {};
                table = input.TableName || 'Unknown';
                
                // Determine operation type
                if (commandName.includes('Put')) {
                    operation = 'INSERT';
                    recordId = input.Item?.id;
                } else if (commandName.includes('Update')) {
                    operation = 'UPDATE';
                    recordId = input.Key?.id;
                } else if (commandName.includes('Delete')) {
                    operation = 'DELETE';
                    recordId = input.Key?.id;
                } else if (commandName.includes('Get') || commandName.includes('Query') || commandName.includes('Scan')) {
                    operation = 'QUERY';
                    recordId = input.Key?.id;
                } else if (commandName.includes('BatchWrite')) {
                    operation = 'BATCH_WRITE';
                }
                
                // Clean table name (remove environment suffixes)
                const tableMatch = table.match(/^([A-Za-z]+)-/);
                if (tableMatch) {
                    table = tableMatch[1];
                }
            } catch (e) {
                // Silently handle extraction errors
            }
            
            const startTime = Date.now();
            
            try {
                // Execute the actual operation
                const result = await originalSend.call(this, command);
                
                // Track successful operation
                self.trackOperation(operation, table, recordId, {
                    duration: Date.now() - startTime,
                    success: true
                });
                
                return result;
            } catch (error) {
                // Track failed operation
                self.trackOperation(operation, table, recordId, {
                    duration: Date.now() - startTime,
                    success: false,
                    error: error.message
                });
                
                throw error; // Re-throw the error
            }
        };
        
        return ddbDocClient;
    }

    /**
     * Track GraphQL operations
     */
    async trackGraphQLOperation(operationType, args, result = null, error = null) {
        let table = 'GraphQL';
        let operation = 'MUTATION';
        
        // Extract table from operation name
        const patterns = [
            /create(\w+)/i,
            /update(\w+)/i,
            /delete(\w+)/i,
            /get(\w+)/i,
            /list(\w+)/i,
            /fetch(\w+)/i,
            /save(\w+)/i
        ];
        
        for (const pattern of patterns) {
            const match = operationType.match(pattern);
            if (match) {
                table = match[1];
                break;
            }
        }
        
        // Determine operation type
        if (operationType.toLowerCase().includes('create') || operationType.toLowerCase().includes('save')) {
            operation = 'INSERT';
        } else if (operationType.toLowerCase().includes('update')) {
            operation = 'UPDATE';
        } else if (operationType.toLowerCase().includes('delete')) {
            operation = 'DELETE';
        } else if (operationType.toLowerCase().includes('get') || operationType.toLowerCase().includes('list')) {
            operation = 'QUERY';
        }
        
        this.trackOperation(operation, table, args?.id || args?.input?.id, {
            operationType,
            success: !error,
            error: error?.message
        });
    }

    /**
     * Schedule batch send to CloudWatch
     */
    scheduleBatch() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
        }
        
        this.batchTimer = setTimeout(() => {
            this.flushToCloudWatch();
        }, 1000); // Send after 1 second
        
        // Also flush immediately if batch is full
        if (this.operations.length >= this.batchSize) {
            this.flushToCloudWatch();
        }
    }

    /**
     * Send metrics to CloudWatch
     */
    async flushToCloudWatch() {
        if (this.operations.length === 0) return;
        
        const batch = this.operations.splice(0, this.batchSize);
        
        try {
            // Group operations for summary metrics
            const summary = {};
            batch.forEach(op => {
                const key = `${op.table}_${op.operation}`;
                if (!summary[key]) {
                    summary[key] = {
                        count: 0,
                        successCount: 0,
                        failureCount: 0,
                        totalDuration: 0
                    };
                }
                summary[key].count++;
                if (op.metadata.success) {
                    summary[key].successCount++;
                } else if (op.metadata.success === false) {
                    summary[key].failureCount++;
                }
                if (op.metadata.duration) {
                    summary[key].totalDuration += op.metadata.duration;
                }
            });
            
            // Create CloudWatch metrics
            const metricData = [];
            
            // Add summary metrics
            Object.entries(summary).forEach(([key, stats]) => {
                const [table, operation] = key.split('_');
                
                // Operation count metric
                metricData.push({
                    MetricName: `Lambda_Database_${operation}`,
                    Value: stats.count,
                    Unit: 'Count',
                    Dimensions: [
                        { Name: 'Table', Value: table },
                        { Name: 'Function', Value: this.functionName },
                        { Name: 'Source', Value: 'LAMBDA' }
                    ],
                    Timestamp: new Date()
                });
                
                // Success/failure metrics
                if (stats.successCount > 0) {
                    metricData.push({
                        MetricName: 'Lambda_Database_Success',
                        Value: stats.successCount,
                        Unit: 'Count',
                        Dimensions: [
                            { Name: 'Table', Value: table },
                            { Name: 'Operation', Value: operation },
                            { Name: 'Function', Value: this.functionName }
                        ],
                        Timestamp: new Date()
                    });
                }
                
                if (stats.failureCount > 0) {
                    metricData.push({
                        MetricName: 'Lambda_Database_Failure',
                        Value: stats.failureCount,
                        Unit: 'Count',
                        Dimensions: [
                            { Name: 'Table', Value: table },
                            { Name: 'Operation', Value: operation },
                            { Name: 'Function', Value: this.functionName }
                        ],
                        Timestamp: new Date()
                    });
                }
                
                // Duration metric (average)
                if (stats.totalDuration > 0) {
                    metricData.push({
                        MetricName: 'Lambda_Database_Duration',
                        Value: stats.totalDuration / stats.count,
                        Unit: 'Milliseconds',
                        Dimensions: [
                            { Name: 'Table', Value: table },
                            { Name: 'Operation', Value: operation },
                            { Name: 'Function', Value: this.functionName }
                        ],
                        Timestamp: new Date()
                    });
                }
            });
            
            // Send to CloudWatch (max 20 metrics per call)
            for (let i = 0; i < metricData.length; i += 20) {
                const chunk = metricData.slice(i, i + 20);
                await this.cloudwatch.send(new PutMetricDataCommand({
                    Namespace: 'ScraperSystem/Lambda',
                    MetricData: chunk
                }));
            }
            
            if (this.debug) {
                console.log(`[Monitor] Sent ${metricData.length} metrics to CloudWatch`);
            }
            
        } catch (error) {
            console.error('[Monitor] Failed to send to CloudWatch:', error);
            // Don't re-throw - monitoring should not break the Lambda
        }
    }

    /**
     * Ensure all metrics are sent before Lambda ends
     */
    async flush() {
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
        }
        await this.flushToCloudWatch();
    }

    /**
     * Get operation statistics
     */
    getStats() {
        const stats = {};
        this.operations.forEach(op => {
            if (!stats[op.table]) {
                stats[op.table] = {
                    INSERT: 0,
                    UPDATE: 0,
                    DELETE: 0,
                    QUERY: 0,
                    total: 0
                };
            }
            stats[op.table][op.operation] = (stats[op.table][op.operation] || 0) + 1;
            stats[op.table].total++;
        });
        return stats;
    }
}

module.exports = { LambdaMonitoring };