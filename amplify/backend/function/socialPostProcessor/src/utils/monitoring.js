/**
 * utils/monitoring.js
 * Simple monitoring/logging utility for the Lambda
 */

class LambdaMonitoring {
  constructor(lambdaName, entityId = null) {
    this.lambdaName = lambdaName;
    this.entityId = entityId;
    this.startTime = Date.now();
    this.metrics = [];
  }

  trackOperation(type, category, operation, metadata = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      type,
      category,
      operation,
      elapsedMs: Date.now() - this.startTime,
      ...metadata
    };
    
    this.metrics.push(entry);
    
    // Also log for CloudWatch
    console.log(`[${this.lambdaName}] ${type}:`, JSON.stringify(entry));
  }

  async flush() {
    // Could send to CloudWatch metrics here
    // For now, just log summary
    const totalMs = Date.now() - this.startTime;
    console.log(`[${this.lambdaName}] Completed in ${totalMs}ms with ${this.metrics.length} tracked operations`);
  }
}

module.exports = { LambdaMonitoring };
