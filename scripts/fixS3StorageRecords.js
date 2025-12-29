// fixS3StorageRecords.js
// ================================================================
// ONE-TIME FIX: Backfill scrapedAt and url in S3Storage records
// ================================================================
//
// PROBLEM:
// The migration script created S3Storage records with:
// - Missing 'scrapedAt' (required for GSI sort key)
// - Missing 'url' (required for byURL GSI)
// - Wrong field name 'bucket' instead of 's3Bucket'
// - Wrong field name 'sizeBytes' instead of 'contentSize'
//
// This script fixes all existing records.
//
// Usage:
//   DRY_RUN=true node fixS3StorageRecords.js   # Preview changes
//   DRY_RUN=false node fixS3StorageRecords.js  # Apply changes
//
// ================================================================

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// ================================================================
// CONFIGURATION
// ================================================================
const CONFIG = {
  DRY_RUN: process.env.DRY_RUN !== 'false',
  TABLE_NAME: process.env.S3STORAGE_TABLE || 'S3Storage-ht3nugt6lvddpeeuwj3x6mkite-dev',
  REGION: process.env.AWS_REGION || 'ap-southeast-2',
  BATCH_SIZE: 100,
  
  // Entity URL mappings (same as migration script)
  ENTITY_DOMAINS: {
    '42101695-1332-48e3-963b-3c6ad4e909a0': 'https://kingsroom.com.au/tournament/?id=',
    'f6785dbb-ab2e-4e83-8ad8-3034e7f1947b': 'https://kingslive.com.au/76-2/?id=',
    '2e782b28-06b9-42e6-a66e-bfc17d68704f': 'https://kingspoker.au/tournament/?id=',
  },
};

// ================================================================
// SETUP
// ================================================================
const ddbClient = new DynamoDBClient({ region: CONFIG.REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: { removeUndefinedValues: true },
});

// ================================================================
// HELPER FUNCTIONS
// ================================================================

function buildUrl(entityId, tournamentId) {
  const urlBase = CONFIG.ENTITY_DOMAINS[entityId];
  if (!urlBase) {
    console.warn(`[WARN] Unknown entityId: ${entityId}`);
    return null;
  }
  return `${urlBase}${tournamentId}`;
}

// ================================================================
// MAIN FIX FUNCTION
// ================================================================
async function fixS3StorageRecords() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  FIX S3Storage RECORDS - Backfill Missing Fields');
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
      missingScrapedAt: 0,
      missingUrl: 0,
      wrongBucketField: 0,
      wrongSizeField: 0,
      missingS3Bucket: 0,
    },
  };

  let lastEvaluatedKey = null;

  do {
    // Scan for records
    const scanParams = {
      TableName: CONFIG.TABLE_NAME,
      // Get all fields we need to check/fix
      // Note: 'bucket' and 'url' are reserved keywords, use expression attribute names
      ProjectionExpression: 'id, scrapedAt, #url, lastModified, createdAt, entityId, tournamentId, #bucket, s3Bucket, sizeBytes, contentSize, s3Key',
      ExpressionAttributeNames: { 
        '#url': 'url',
        '#bucket': 'bucket'
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

      // Fix 1: Missing scrapedAt
      if (!item.scrapedAt) {
        const scrapedAtValue = item.lastModified || item.createdAt || new Date().toISOString();
        fixes.scrapedAt = scrapedAtValue;
        stats.issues.missingScrapedAt++;
        needsFix = true;
      }

      // Fix 2: Missing url
      if (!item.url && item.entityId && item.tournamentId) {
        const url = buildUrl(item.entityId, item.tournamentId);
        if (url) {
          fixes.url = url;
          stats.issues.missingUrl++;
          needsFix = true;
        }
      }

      // Fix 3: Wrong field name 'bucket' -> 's3Bucket'
      if (item.bucket && !item.s3Bucket) {
        fixes.s3Bucket = item.bucket;
        stats.issues.wrongBucketField++;
        needsFix = true;
      }

      // Fix 4: Missing s3Bucket entirely
      if (!item.bucket && !item.s3Bucket) {
        fixes.s3Bucket = 'pokerpro-scraper-storage';
        stats.issues.missingS3Bucket++;
        needsFix = true;
      }

      // Fix 5: Wrong field name 'sizeBytes' -> 'contentSize'
      if (item.sizeBytes && !item.contentSize) {
        fixes.contentSize = item.sizeBytes;
        stats.issues.wrongSizeField++;
        needsFix = true;
      }

      if (!needsFix) continue;

      stats.needsFixCount++;

      console.log(`[FIX] id: ${item.id.substring(0, 8)}... tournamentId: ${item.tournamentId}`);
      Object.entries(fixes).forEach(([key, value]) => {
        const displayValue = typeof value === 'string' && value.length > 50 
          ? value.substring(0, 50) + '...' 
          : value;
        console.log(`      ${key}: ${displayValue}`);
      });

      if (!CONFIG.DRY_RUN) {
        try {
          // Build update expression
          const updateParts = [];
          const exprAttrNames = { '#lca': '_lastChangedAt', '#v': '_version' };
          const exprAttrValues = { ':lca': Date.now(), ':zero': 0, ':one': 1 };

          Object.entries(fixes).forEach(([key, value]) => {
            if (key === 'url') {
              // 'url' is a reserved word
              exprAttrNames['#url'] = 'url';
              updateParts.push('#url = :url');
              exprAttrValues[':url'] = value;
            } else {
              updateParts.push(`${key} = :${key}`);
              exprAttrValues[`:${key}`] = value;
            }
          });

          updateParts.push('#lca = :lca');
          updateParts.push('#v = if_not_exists(#v, :zero) + :one');

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
      if (stats.scannedCount % 500 === 0) {
        console.log(`  ...scanned ${stats.scannedCount} records, found ${stats.needsFixCount} needing fixes`);
      }
    }
  } while (lastEvaluatedKey);

  // Summary
  console.log('');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  SUMMARY');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`Total records scanned: ${stats.scannedCount}`);
  console.log(`Records needing fixes: ${stats.needsFixCount}`);
  console.log('');
  console.log('Issues found:');
  console.log(`  - Missing scrapedAt: ${stats.issues.missingScrapedAt}`);
  console.log(`  - Missing url: ${stats.issues.missingUrl}`);
  console.log(`  - Wrong 'bucket' field: ${stats.issues.wrongBucketField}`);
  console.log(`  - Wrong 'sizeBytes' field: ${stats.issues.wrongSizeField}`);
  console.log(`  - Missing s3Bucket: ${stats.issues.missingS3Bucket}`);
  console.log('');

  if (CONFIG.DRY_RUN) {
    console.log(`[DRY_RUN] Would fix: ${stats.needsFixCount} records`);
    console.log('');
    console.log('To apply fixes, run: DRY_RUN=false node fixS3StorageRecords.js');
  } else {
    console.log(`Records fixed: ${stats.fixedCount}`);
    console.log(`Errors: ${stats.errorCount}`);
  }
  console.log('');
}

// ================================================================
// RUN
// ================================================================
fixS3StorageRecords()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
