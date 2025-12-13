/**
 * ===================================================================
 * Lambda Monitoring
 * ===================================================================
 * 
 * Provides monitoring, metrics, and DynamoDB client wrapping
 * for observability and debugging.
 * 
 * ===================================================================
 */

/**
 * Lambda Monitoring class
 * Tracks operations, timing, and provides DynamoDB client wrapping
 */
class LambdaMonitoring {
    constructor(functionName, entityId = 'unknown') {
        this.functionName = functionName;
        this.entityId = entityId;
        this.startTime = Date.now();
        this.operations = [];
        this.metrics = {
            ddbReads: 0,
            ddbWrites: 0,
            s3Operations: 0,
            lambdaInvokes: 0,
            errors: 0
        };
    }
    
    /**
     * Set entity ID (can be updated after initialization)
     */
    setEntityId(entityId) {
        this.entityId = entityId;
    }
    
    /**
     * Track an operation
     * 
     * @param {string} operationType - Type of operation
     * @param {string} resource - Resource being operated on
     * @param {string} resourceId - ID of the resource
     * @param {object} metadata - Additional metadata
     */
    trackOperation(operationType, resource, resourceId, metadata = {}) {
        const operation = {
            type: operationType,
            resource,
            resourceId,
            timestamp: Date.now(),
            elapsed: Date.now() - this.startTime,
            ...metadata
        };
        
        this.operations.push(operation);
        
        // Update metrics based on operation type
        if (operationType.includes('ERROR')) {
            this.metrics.errors++;
        }
        
        // Log significant operations
        if (process.env.VERBOSE_LOGGING === 'true' || operationType.includes('ERROR')) {
            console.log(`[Monitor] ${operationType} ${resource}:${resourceId}`, metadata);
        }
    }
    
    /**
     * Wrap a DynamoDB DocumentClient to track operations
     * 
     * @param {object} ddbDocClient - DynamoDB DocumentClient
     * @returns {object} Wrapped client
     */
    wrapDynamoDBClient(ddbDocClient) {
        const self = this;
        
        return new Proxy(ddbDocClient, {
            get(target, prop) {
                if (prop === 'send') {
                    return async (command) => {
                        const commandName = command.constructor.name;
                        const startTime = Date.now();
                        
                        // Track read vs write
                        const isWrite = ['PutCommand', 'UpdateCommand', 'DeleteCommand', 'BatchWriteCommand']
                            .includes(commandName);
                        
                        if (isWrite) {
                            self.metrics.ddbWrites++;
                        } else {
                            self.metrics.ddbReads++;
                        }
                        
                        try {
                            const result = await target.send(command);
                            
                            const duration = Date.now() - startTime;
                            if (duration > 1000) {
                                console.warn(`[Monitor] Slow DDB operation: ${commandName} took ${duration}ms`);
                            }
                            
                            return result;
                            
                        } catch (error) {
                            self.metrics.errors++;
                            self.trackOperation('DDB_ERROR', commandName, 'error', {
                                error: error.message
                            });
                            throw error;
                        }
                    };
                }
                return target[prop];
            }
        });
    }
    
    /**
     * Get current metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            totalDuration: Date.now() - this.startTime,
            operationCount: this.operations.length,
            functionName: this.functionName,
            entityId: this.entityId
        };
    }
    
    /**
     * Get operation summary
     */
    getSummary() {
        const operationTypes = {};
        
        this.operations.forEach(op => {
            operationTypes[op.type] = (operationTypes[op.type] || 0) + 1;
        });
        
        return {
            metrics: this.getMetrics(),
            operationTypes,
            recentOperations: this.operations.slice(-10)
        };
    }
    
    /**
     * Flush metrics (log and clear)
     */
    async flush() {
        const metrics = this.getMetrics();
        
        if (metrics.errors > 0 || process.env.VERBOSE_LOGGING === 'true') {
            console.log(`[Monitor] Flush:`, {
                function: this.functionName,
                entity: this.entityId,
                duration: metrics.totalDuration,
                ddbReads: metrics.ddbReads,
                ddbWrites: metrics.ddbWrites,
                errors: metrics.errors,
                operations: metrics.operationCount
            });
        }
        
        // Could send to CloudWatch, DataDog, etc. here
        
        // Clear operations to free memory
        this.operations = [];
    }
}

/**
 * Create a simple timer for measuring durations
 */
const createTimer = (label) => {
    const startTime = Date.now();
    
    return {
        elapsed: () => Date.now() - startTime,
        log: (message = '') => {
            const elapsed = Date.now() - startTime;
            console.log(`[Timer] ${label}: ${elapsed}ms ${message}`);
            return elapsed;
        }
    };
};

/**
 * Rate limiter for API calls
 */
class RateLimiter {
    constructor(maxRequests, windowMs) {
        this.maxRequests = maxRequests;
        this.windowMs = windowMs;
        this.requests = [];
    }
    
    async acquire() {
        const now = Date.now();
        
        // Remove old requests outside window
        this.requests = this.requests.filter(t => now - t < this.windowMs);
        
        if (this.requests.length >= this.maxRequests) {
            // Calculate wait time
            const oldestRequest = this.requests[0];
            const waitTime = this.windowMs - (now - oldestRequest);
            
            if (waitTime > 0) {
                console.log(`[RateLimiter] Waiting ${waitTime}ms`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }
        }
        
        this.requests.push(Date.now());
    }
}

module.exports = {
    LambdaMonitoring,
    createTimer,
    RateLimiter
};
