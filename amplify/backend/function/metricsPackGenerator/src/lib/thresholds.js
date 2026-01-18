/**
 * Alert Thresholds
 * ================
 * Configurable thresholds for alert generation.
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand } = require('@aws-sdk/lib-dynamodb');

const ddbClient = new DynamoDBClient({ region: process.env.REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// Helper to construct table name: {TableName}-{apiId}-{env}
const getTableName = (baseName) => {
  const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
  const env = process.env.ENV;
  return `${baseName}-${apiId}-${env}`;
};

// Use env var if available (set by CloudFormation import), otherwise construct dynamically
const ALERT_THRESHOLD_TABLE = process.env.API_KINGSROOM_ALERTTHRESHOLDCONFIGTABLE_NAME || getTableName('AlertThresholdConfig');

const DEFAULT_THRESHOLDS = {
  lossThreshold: 0,                  // Any loss triggers alert
  lowMarginThreshold: 20,            // Below 20% margin
  highOverlayThreshold: 500,         // Overlay above $500
  guaranteeCoverageThreshold: 80,    // Coverage below 80%
  lowFillRatePercent: 50,            // Fill rate below 50%
  cancelledPatternCount: 2,          // 2+ cancellations triggers pattern alert
  staffCostAnomalyPercent: 150,      // Staff cost 150% above normal
  negativeTrendPercent: -15,         // Profit decline > 15% = HIGH alert
  softeningTrendPercent: -5          // Profit decline 5-15% = MEDIUM alert
};

/**
 * Get alert thresholds for an entity.
 * Falls back to global thresholds, then defaults.
 */
async function getAlertThresholds(entityId) {
  try {
    // Try entity-specific thresholds first
    if (entityId) {
      const entityResult = await docClient.send(new GetCommand({
        TableName: ALERT_THRESHOLD_TABLE,
        Key: { id: entityId }
      }));
      
      if (entityResult.Item && entityResult.Item.isActive !== false) {
        return {
          ...DEFAULT_THRESHOLDS,
          ...entityResult.Item
        };
      }
    }
    
    // Try global thresholds
    const globalResult = await docClient.send(new GetCommand({
      TableName: ALERT_THRESHOLD_TABLE,
      Key: { id: 'GLOBAL' }
    }));
    
    if (globalResult.Item && globalResult.Item.isActive !== false) {
      return {
        ...DEFAULT_THRESHOLDS,
        ...globalResult.Item
      };
    }
  } catch (error) {
    console.warn('Failed to fetch thresholds, using defaults:', error.message);
  }
  
  return DEFAULT_THRESHOLDS;
}

module.exports = {
  DEFAULT_THRESHOLDS,
  getAlertThresholds
};
