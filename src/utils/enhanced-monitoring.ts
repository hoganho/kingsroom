// src/utils/enhanced-monitoring.ts
// Final version - No correlationId, no infinite recursion

import { generateClient } from 'aws-amplify/api';
import { Hub } from 'aws-amplify/utils';

interface DatabaseOperation {
    operation: 'INSERT' | 'UPDATE' | 'DELETE' | 'QUERY';
    table: string;
    recordId?: string;
    data?: any;
    timestamp: string;
    source: 'CLIENT' | 'LAMBDA';
    userId?: string;
}

interface MonitoringConfig {
    enabled: boolean;
    logToConsole: boolean;
    sendToCloudWatch: boolean;
    showUIMonitor: boolean;
    trackUserActions: boolean;
    trackDatabaseOps: boolean;
}

class EnhancedMonitoringSystem {
    private client: any;
    private operations: DatabaseOperation[] = [];
    private config: MonitoringConfig;
    private subscribers: Array<(op: DatabaseOperation) => void> = [];
    private isMonitoringCall = false; // Flag to prevent recursion
    private cloudWatchBatch: DatabaseOperation[] = [];
    private cloudWatchTimer: any = null;

    constructor(config?: Partial<MonitoringConfig>) {
        this.config = {
            enabled: true,
            logToConsole: true,
            sendToCloudWatch: true,
            showUIMonitor: true,
            trackUserActions: true,
            trackDatabaseOps: true,
            ...config
        };
        
        this.initializeClient();
        this.setupInterceptors();
        this.setupHubListener();
    }

    private initializeClient() {
        try {
            this.client = generateClient();
        } catch (error) {
            console.warn('[Monitoring] Client initialization deferred');
        }
    }

    private setupInterceptors() {
        if (this.client) {
            const originalGraphql = this.client.graphql;
            const self = this; // Capture this for closure
            
            this.client.graphql = async function(options: any) {
                // Skip monitoring for CloudWatch calls to prevent recursion
                const queryStr = options.query?.toString() || '';
                const isCloudWatchCall = queryStr.includes('publishClientMetrics');
                
                // If this is our own monitoring call, skip interception
                if (self.isMonitoringCall || isCloudWatchCall) {
                    return originalGraphql.call(this, options);
                }
                
                const startTime = Date.now();
                
                // Log the operation start (but not for monitoring calls)
                self.logOperation({
                    operation: self.detectOperationType(queryStr),
                    table: self.extractTableName(queryStr),
                    data: options.variables,
                    timestamp: new Date().toISOString(),
                    source: 'CLIENT'
                }, false); // Pass false to skip CloudWatch for this log

                try {
                    // Execute the original operation
                    const result = await originalGraphql.call(this, options);
                    
                    // Log success (skip CloudWatch to prevent recursion)
                    const duration = Date.now() - startTime;
                    if (self.config.logToConsole) {
                        console.log(`[GraphQL] Success: ${self.extractTableName(queryStr)} (${duration}ms)`);
                    }
                    
                    return result;
                } catch (error) {
                    // Log error
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    if (self.config.logToConsole) {
                        console.error(`[GraphQL] Error: ${self.extractTableName(queryStr)} - ${errorMessage}`);
                    }
                    throw error;
                }
            };
        }
    }

    private setupHubListener() {
        // Listen for API events
        Hub.listen('api', (data) => {
            const { payload } = data;
            // Skip monitoring for CloudWatch calls
            if (payload.event === 'GraphQLOperation' && 
                payload.data && 
                typeof payload.data === 'object' &&
                !this.isMonitoringCall) {
                
                const apiData = payload.data as any;
                // Skip if this is a CloudWatch metric call
                if (apiData.operationType === 'publishClientMetrics') {
                    return;
                }
                
                this.logOperation({
                    operation: apiData.operationType || 'QUERY',
                    table: apiData.table || 'Unknown',
                    recordId: apiData.id,
                    data: apiData,
                    timestamp: new Date().toISOString(),
                    source: 'CLIENT'
                }, false); // Skip CloudWatch for Hub events
            }
        });
    }

    private detectOperationType(query: string): 'INSERT' | 'UPDATE' | 'DELETE' | 'QUERY' {
        const queryStr = query.toString();
        if (queryStr.includes('create') || queryStr.includes('Create')) return 'INSERT';
        if (queryStr.includes('update') || queryStr.includes('Update')) return 'UPDATE';
        if (queryStr.includes('delete') || queryStr.includes('Delete')) return 'DELETE';
        return 'QUERY';
    }

    private extractTableName(query: string): string {
        const queryStr = query.toString();
        
        // Skip monitoring queries
        if (queryStr.includes('publishClientMetrics')) {
            return 'Monitoring';
        }
        
        // Try to extract table name from mutation/query name
        const patterns = [
            /create(\w+)/i,
            /update(\w+)/i,
            /delete(\w+)/i,
            /get(\w+)/i,
            /list(\w+)/i
        ];
        
        for (const pattern of patterns) {
            const match = queryStr.match(pattern);
            if (match) {
                return match[1];
            }
        }
        
        return 'Unknown';
    }

    public logOperation(operation: DatabaseOperation, sendToCloud: boolean = true) {
        if (!this.config.enabled) return;
        
        // Add to internal buffer
        this.operations.push(operation);
        if (this.operations.length > 1000) {
            this.operations.shift(); // Keep only last 1000 operations
        }
        
        // Console logging with color coding
        if (this.config.logToConsole) {
            const colors = {
                'INSERT': '\x1b[32m', // Green
                'UPDATE': '\x1b[33m', // Yellow
                'DELETE': '\x1b[31m', // Red
                'QUERY': '\x1b[36m'   // Cyan
            };
            const color = colors[operation.operation] || '\x1b[0m';
            const reset = '\x1b[0m';
            
            console.log(
                `${color}[${operation.operation}]${reset} ${operation.table}`,
                operation.recordId ? `ID: ${operation.recordId}` : '',
                operation.data ? operation.data : ''
            );
        }
        
        // Send to CloudWatch (but skip if this would cause recursion)
        if (this.config.sendToCloudWatch && sendToCloud && !this.isMonitoringCall) {
            // Batch CloudWatch calls to reduce API calls
            this.batchCloudWatchCall(operation);
        }
        
        // Notify subscribers (for UI components)
        this.subscribers.forEach(callback => callback(operation));
    }

    private batchCloudWatchCall(operation: DatabaseOperation) {
        this.cloudWatchBatch.push(operation);
        
        // Clear existing timer
        if (this.cloudWatchTimer) {
            clearTimeout(this.cloudWatchTimer);
        }
        
        // Set new timer to batch operations (send after 1 second of no new operations)
        this.cloudWatchTimer = setTimeout(() => {
            this.flushCloudWatchBatch();
        }, 1000);
        
        // Also flush if batch gets too large
        if (this.cloudWatchBatch.length >= 10) {
            this.flushCloudWatchBatch();
        }
    }

    private async flushCloudWatchBatch() {
        if (this.cloudWatchBatch.length === 0 || !this.client) return;
        
        const batch = [...this.cloudWatchBatch];
        this.cloudWatchBatch = [];
        
        // Set flag to prevent recursion
        this.isMonitoringCall = true;
        
        try {
            // Group operations by type for summary metrics
            const summary: Record<string, number> = {};
            batch.forEach(op => {
                const key = `${op.table}_${op.operation}`;
                summary[key] = (summary[key] || 0) + 1;
            });
            
            // Send summary metrics instead of individual operations
            const metrics = Object.entries(summary).map(([key, count]) => {
                const [table, operation] = key.split('_');
                return {
                    metricName: `Database_${operation}`,
                    value: count,
                    unit: 'Count',
                    timestamp: new Date().toISOString(),
                    dimensions: JSON.stringify({
                        Table: table,
                        Source: 'CLIENT',
                        BatchSize: String(batch.length)
                    })
                };
            });
            
            if (metrics.length > 0) {
                await this.client.graphql({
                    query: /* GraphQL */ `
                        mutation PublishClientMetrics($metrics: [ClientMetricInput!]!) {
                            publishClientMetrics(metrics: $metrics) {
                                success
                                message
                                userId
                            }
                        }
                    `,
                    variables: { metrics }
                });
            }
        } catch (error) {
            // Silently fail CloudWatch calls to prevent disrupting the app
            if (this.config.logToConsole) {
                console.warn('[Monitoring] CloudWatch batch send failed (non-critical):', error);
            }
        } finally {
            // Always reset the flag
            this.isMonitoringCall = false;
        }
    }

    public trackMetric(
        metricName: string,
        value: number,
        unit: string = 'Count',
        dimensions?: Record<string, string>
    ) {
        // Skip if CloudWatch is disabled or we're already in a monitoring call
        if (!this.config.enabled || !this.config.sendToCloudWatch || this.isMonitoringCall) {
            return;
        }
        
        // Just log it as an operation, it will be batched with others
        this.logOperation({
            operation: 'QUERY',
            table: 'Metric',
            data: { metricName, value, unit, dimensions },
            timestamp: new Date().toISOString(),
            source: 'CLIENT'
        }, false); // Don't send to CloudWatch again
    }

    public subscribe(callback: (op: DatabaseOperation) => void): () => void {
        this.subscribers.push(callback);
        return () => {
            this.subscribers = this.subscribers.filter(cb => cb !== callback);
        };
    }

    public getOperations(filter?: {
        table?: string;
        operation?: string;
        since?: Date;
    }): DatabaseOperation[] {
        let filtered = [...this.operations];
        
        if (filter?.table) {
            filtered = filtered.filter(op => op.table === filter.table);
        }
        if (filter?.operation) {
            filtered = filtered.filter(op => op.operation === filter.operation);
        }
        if (filter?.since) {
            filtered = filtered.filter(op => 
                new Date(op.timestamp) > filter.since!
            );
        }
        
        return filtered;
    }

    public getStats() {
        const stats: Record<string, Record<string, number>> = {};
        
        this.operations.forEach(op => {
            if (!stats[op.table]) {
                stats[op.table] = {
                    INSERT: 0,
                    UPDATE: 0,
                    DELETE: 0,
                    QUERY: 0
                };
            }
            stats[op.table][op.operation]++;
        });
        
        return stats;
    }

    public clear() {
        this.operations = [];
        this.cloudWatchBatch = [];
        if (this.cloudWatchTimer) {
            clearTimeout(this.cloudWatchTimer);
        }
    }
    
    // Clean up on destroy
    public destroy() {
        if (this.cloudWatchTimer) {
            clearTimeout(this.cloudWatchTimer);
        }
        this.flushCloudWatchBatch();
    }
}

// Create singleton instance
let monitoringInstance: EnhancedMonitoringSystem | null = null;

export const getMonitoring = (config?: Partial<MonitoringConfig>) => {
    if (!monitoringInstance) {
        monitoringInstance = new EnhancedMonitoringSystem(config);
    }
    return monitoringInstance;
};

// Export for use in components
export type { DatabaseOperation, MonitoringConfig };
export { EnhancedMonitoringSystem };