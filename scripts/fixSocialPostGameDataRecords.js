// fixSocialPostGameDataRecords.js
// ================================================================
// ONE-TIME FIX: Backfill _version and _lastChangedAt in SocialPostGameData records
// ================================================================
//
// PROBLEM:
// Some SocialPostGameData records have null values for required DataStore fields:
// - Missing '_version' (required Int, non-nullable)
// - Missing '_lastChangedAt' (required AWSTimestamp, non-nullable)
//
// This causes GraphQL errors when fetching nested relationships:
// "Cannot return null for non-nullable type: 'Int' within parent 'SocialPostGameData'"
//
// Usage:
//   DRY_RUN=true node fixSocialPostGameDataRecords.js   # Preview changes
//   DRY_RUN=false node fixSocialPostGameDataRecords.js  # Apply changes
//
// ================================================================

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// ================================================================
// CONFIGURATION
// ================================================================
const CONFIG = {
  DRY_RUN: process.env.DRY_RUN !== 'false',
  TABLE_NAME: process.env.TABLE_NAME || 'SocialPostGameData-ht3nugt6lvddpeeuwj3x6mkite-dev',
  REGION: process.env.AWS_REGION || 'ap-southeast-2',
  BATCH_SIZE: 100,
};

// ================================================================
// SETUP
// ================================================================
const ddbClient = new DynamoDBClient({ region: CONFIG.REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// ================================================================
// MAIN FIX FUNCTION
// ================================================================
async function fixSocialPostGameDataRecords() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  FIX SocialPostGameData RECORDS - Backfill DataStore Fields');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Table: ${CONFIG.TABLE_NAME}`);
  console.log(`DRY_RUN: ${CONFIG.DRY_RUN}`);
  console.log('');

  const stats = {
    scannedCount: 0,
    needsFixCount: 0,
    fixedCount: 0,
    errorCount: 0,
    issues: {
      missingVersion: 0,
      missingLastChangedAt: 0,
      missingBoth: 0,
    },
  };

  let lastEvaluatedKey = null;

  do {
    // Scan for records with missing _version or _lastChangedAt
    const scanParams = {
      TableName: CONFIG.TABLE_NAME,
      FilterExpression: 'attribute_not_exists(#v) OR attribute_not_exists(#lca) OR #v = :null OR #lca = :null',
      ExpressionAttributeNames: {
        '#v': '_version',
        '#lca': '_lastChangedAt',
      },
      ExpressionAttributeValues: {
        ':null': null,
      },
      Limit: CONFIG.BATCH_SIZE,
    };

    if (lastEvaluatedKey) {
      scanParams.ExclusiveStartKey = lastEvaluatedKey;
    }

    const scanResult = await ddbDocClient.send(new ScanCommand(scanParams));
    lastEvaluatedKey = scanResult.LastEvaluatedKey;

    for (const item of scanResult.Items || []) {
      stats.scannedCount++;

      // Determine what needs to be fixed
      const fixes = {};
      let needsFix = false;

      const missingVersion = item._version === undefined || item._version === null;
      const missingLastChangedAt = item._lastChangedAt === undefined || item._lastChangedAt === null;

      // Fix 1: Missing _version
      if (missingVersion) {
        fixes._version = 1;
        stats.issues.missingVersion++;
        needsFix = true;
      }

      // Fix 2: Missing _lastChangedAt
      if (missingLastChangedAt) {
        // Use createdAt or updatedAt if available, otherwise use current timestamp
        let timestamp = Date.now();
        if (item.createdAt) {
          timestamp = new Date(item.createdAt).getTime();
        } else if (item.updatedAt) {
          timestamp = new Date(item.updatedAt).getTime();
        }
        fixes._lastChangedAt = timestamp;
        stats.issues.missingLastChangedAt++;
        needsFix = true;
      }

      // Track records missing both
      if (missingVersion && missingLastChangedAt) {
        stats.issues.missingBoth++;
      }

      if (!needsFix) continue;

      stats.needsFixCount++;

      console.log(`[FIX] id: ${item.id}`);
      console.log(`      socialPostId: ${item.socialPostId || 'N/A'}`);
      Object.entries(fixes).forEach(([key, value]) => {
        console.log(`      ${key}: ${value}`);
      });

      if (!CONFIG.DRY_RUN) {
        try {
          // Build update expression
          const updateParts = [];
          const exprAttrNames = {};
          const exprAttrValues = {};

          if (fixes._version !== undefined) {
            exprAttrNames['#v'] = '_version';
            exprAttrValues[':v'] = fixes._version;
            updateParts.push('#v = :v');
          }

          if (fixes._lastChangedAt !== undefined) {
            exprAttrNames['#lca'] = '_lastChangedAt';
            exprAttrValues[':lca'] = fixes._lastChangedAt;
            updateParts.push('#lca = :lca');
          }

          await ddbDocClient.send(new UpdateCommand({
            TableName: CONFIG.TABLE_NAME,
            Key: { id: item.id },
            UpdateExpression: `SET ${updateParts.join(', ')}`,
            ExpressionAttributeNames: exprAttrNames,
            ExpressionAttributeValues: exprAttrValues,
          }));

          stats.fixedCount++;
        } catch (error) {
          console.error(`[ERROR] Failed to fix ${item.id}: ${error.message}`);
          stats.errorCount++;
        }
      }

      // Progress indicator
      if (stats.scannedCount % 100 === 0) {
        console.log(`  ...scanned ${stats.scannedCount} records needing fixes`);
      }
    }
  } while (lastEvaluatedKey);

  // Summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Records needing fixes found: ${stats.needsFixCount}`);
  console.log('');
  console.log('Issues found:');
  console.log(`  - Missing _version: ${stats.issues.missingVersion}`);
  console.log(`  - Missing _lastChangedAt: ${stats.issues.missingLastChangedAt}`);
  console.log(`  - Missing both fields: ${stats.issues.missingBoth}`);
  console.log('');

  if (CONFIG.DRY_RUN) {
    console.log(`[DRY_RUN] Would fix: ${stats.needsFixCount} records`);
    console.log('');
    console.log('To apply fixes, run: DRY_RUN=false node fixSocialPostGameDataRecords.js');
  } else {
    console.log(`Records fixed: ${stats.fixedCount}`);
    console.log(`Errors: ${stats.errorCount}`);
  }
  console.log('');
}

// ================================================================
// RUN
// ================================================================
fixSocialPostGameDataRecords()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
