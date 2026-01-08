// reset-socialpost-processing-status.cjs
// ============================================================================
// Resets ALL SocialPost records for reprocessing
// ============================================================================
// This script:
// 1. Sets processingStatus to "PENDING" for ALL posts
// 2. Clears all processing-related fields (processedAt, processingError, etc.)
// 3. Clears all link-related fields (linkedGameId, extractedGameDataId, etc.)
// 4. Resets classification fields (contentType, isTournamentResult, etc.)
//
// NOTE: This does NOT delete related records from SocialPostGameLink,
// SocialPostGameData, etc. Run clearDevData-social-enhanced.js for full cleanup.
// ============================================================================

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const REGION = process.env.AWS_REGION || "ap-southeast-2";
const API_ID = process.env.API_ID || "ht3nugt6lvddpeeuwj3x6mkite";
const ENV = process.env.ENV_SUFFIX || "dev";
const TABLE_NAME = `SocialPost-${API_ID}-${ENV}`;

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// Dry run mode - set to false to actually update records
const DRY_RUN = process.argv.includes('--dry-run');

// ============================================================================
// FIELDS TO RESET
// ============================================================================

// Fields to SET to specific values
const SET_FIELDS = {
  processingStatus: 'PENDING',
  linkedGameCount: 0,
  hasUnverifiedLinks: false,
};

// Fields to REMOVE entirely (set to null/undefined)
const REMOVE_FIELDS = [
  // Processing fields
  'processedAt',
  'processingError',
  'processingVersion',
  
  // Content classification
  'contentType',
  'contentTypeConfidence',
  
  // Tournament classification
  'isTournamentResult',
  'isTournamentRelated',
  
  // Link fields (legacy single link)
  'linkedGameId',
  
  // Link fields (new multi-link)
  'extractedGameDataId',
  'primaryLinkedGameId',
  
  // Computed date fields
  'effectiveGameDate',
  'effectiveGameDateSource',
];

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function resetProcessingStatus() {
  console.log('');
  console.log('='.repeat(70));
  console.log('  RESET SOCIALPOST PROCESSING STATUS');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Table: ${TABLE_NAME}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : 'LIVE (records will be updated)'}`);
  console.log('');
  console.log('Fields to SET:');
  Object.entries(SET_FIELDS).forEach(([key, value]) => {
    console.log(`  • ${key} = ${JSON.stringify(value)}`);
  });
  console.log('');
  console.log('Fields to REMOVE:');
  REMOVE_FIELDS.forEach(field => {
    console.log(`  • ${field}`);
  });
  console.log('');
  console.log('-'.repeat(70));
  console.log('');
  
  let totalScanned = 0;
  let totalUpdated = 0;
  let totalErrors = 0;
  let lastEvaluatedKey = undefined;
  
  // Build the update expression once
  const { updateExpression, expressionAttributeNames, expressionAttributeValues } = buildUpdateExpression();
  
  do {
    // Scan ALL records (no filter)
    const result = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      ProjectionExpression: 'id, processingStatus, linkedGameId, primaryLinkedGameId',
      ExclusiveStartKey: lastEvaluatedKey
    }));
    
    totalScanned += result.ScannedCount || 0;
    const items = result.Items || [];
    
    console.log(`Scanned ${result.ScannedCount} records in this batch`);
    
    for (const item of items) {
      const postId = item.id;
      const currentStatus = item.processingStatus || '(none)';
      const hasLinks = item.linkedGameId || item.primaryLinkedGameId;
      
      if (!DRY_RUN) {
        try {
          await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { id: item.id },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues,
          }));
          totalUpdated++;
          
          // Show progress every 100 records
          if (totalUpdated % 100 === 0) {
            process.stdout.write(`\r  Updated ${totalUpdated} records...`);
          }
        } catch (error) {
          totalErrors++;
          console.error(`\n  ERROR updating ${postId}: ${error.message}`);
        }
      } else {
        // In dry run, show what would be updated
        if (hasLinks || currentStatus !== 'PENDING') {
          console.log(`  [${postId}] status: ${currentStatus} -> PENDING${hasLinks ? ', clearing links' : ''}`);
        }
        totalUpdated++;
      }
    }
    
    lastEvaluatedKey = result.LastEvaluatedKey;
    
    if (lastEvaluatedKey && !DRY_RUN) {
      // Brief pause between pages to avoid throttling
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
  } while (lastEvaluatedKey);
  
  console.log('\n');
  console.log('='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Total records scanned: ${totalScanned}`);
  console.log(`  Records ${DRY_RUN ? 'to be updated' : 'updated'}: ${totalUpdated}`);
  if (totalErrors > 0) {
    console.log(`  Errors: ${totalErrors}`);
  }
  console.log('');
  
  if (DRY_RUN) {
    console.log('This was a DRY RUN. Run without --dry-run to apply changes.');
    console.log('');
  }
  
  console.log('Done!');
}

// ============================================================================
// BUILD UPDATE EXPRESSION
// ============================================================================

function buildUpdateExpression() {
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  const setClauses = [];
  const removeClauses = [];
  
  // Add updatedAt to SET
  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = new Date().toISOString();
  setClauses.push('#updatedAt = :updatedAt');
  
  // Build SET clauses
  Object.entries(SET_FIELDS).forEach(([field, value], index) => {
    const nameKey = `#set${index}`;
    const valueKey = `:set${index}`;
    expressionAttributeNames[nameKey] = field;
    expressionAttributeValues[valueKey] = value;
    setClauses.push(`${nameKey} = ${valueKey}`);
  });
  
  // Build REMOVE clauses
  REMOVE_FIELDS.forEach((field, index) => {
    const nameKey = `#rem${index}`;
    expressionAttributeNames[nameKey] = field;
    removeClauses.push(nameKey);
  });
  
  // Combine into update expression
  let updateExpression = `SET ${setClauses.join(', ')}`;
  if (removeClauses.length > 0) {
    updateExpression += ` REMOVE ${removeClauses.join(', ')}`;
  }
  
  return { updateExpression, expressionAttributeNames, expressionAttributeValues };
}

// ============================================================================
// EXECUTE
// ============================================================================

resetProcessingStatus().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
