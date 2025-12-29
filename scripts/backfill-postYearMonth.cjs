/**
 * ===================================================================
 * BACKFILL SCRIPT: Populate postYearMonth on existing SocialPost records
 * ===================================================================
 * 
 * Run this script once after deploying the schema update to populate
 * the postYearMonth field on all existing SocialPost records.
 * 
 * Usage:
 *   node backfill-postYearMonth.js
 * 
 * Or invoke as a Lambda function with event:
 *   { "dryRun": true }  - Preview mode, no updates
 *   { "dryRun": false } - Actually update records
 *   { "limit": 100 }    - Limit number of records to process
 * 
 * ===================================================================
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

// Initialize clients
const ddbClient = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(ddbClient);

// Table name - update this to match your environment
const SOCIAL_POST_TABLE = process.env.API_KINGSROOM_SOCIALPOSTTABLE_NAME || 'SocialPost-ht3nugt6lvddpeeuwj3x6mkite-dev';

/**
 * Calculate postYearMonth from a date string
 * Format: "YYYY-MM" (e.g., "2025-01" for January 2025)
 */
function getPostYearMonth(dateString) {
  if (!dateString) return null;
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  } catch {
    return null;
  }
}

/**
 * Scan for posts missing postYearMonth
 */
async function scanPostsMissingYearMonth(limit = 1000, lastKey = null) {
  const params = {
    TableName: SOCIAL_POST_TABLE,
    FilterExpression: 'attribute_not_exists(postYearMonth) AND attribute_exists(postedAt)',
    Limit: limit,
  };
  
  if (lastKey) {
    params.ExclusiveStartKey = lastKey;
  }
  
  const result = await docClient.send(new ScanCommand(params));
  
  return {
    items: result.Items || [],
    lastKey: result.LastEvaluatedKey,
  };
}

/**
 * Update a single post with postYearMonth
 */
async function updatePostYearMonth(postId, postYearMonth) {
  await docClient.send(new UpdateCommand({
    TableName: SOCIAL_POST_TABLE,
    Key: { id: postId },
    UpdateExpression: 'SET postYearMonth = :ym, updatedAt = :now',
    ExpressionAttributeValues: {
      ':ym': postYearMonth,
      ':now': new Date().toISOString(),
    },
  }));
}

/**
 * Main backfill function
 */
async function backfillPostYearMonth(options = {}) {
  const { dryRun = false, limit = null } = options;
  
  console.log('='.repeat(60));
  console.log('BACKFILL: postYearMonth for SocialPost records');
  console.log('='.repeat(60));
  console.log(`Table: ${SOCIAL_POST_TABLE}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will update records)'}`);
  console.log(`Limit: ${limit || 'none'}`);
  console.log('');
  
  const stats = {
    scanned: 0,
    needsUpdate: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
  };
  
  let lastKey = null;
  let continueScanning = true;
  
  while (continueScanning) {
    // Scan for posts missing postYearMonth
    const batchLimit = limit ? Math.min(100, limit - stats.scanned) : 100;
    const { items, lastKey: nextKey } = await scanPostsMissingYearMonth(batchLimit, lastKey);
    
    stats.scanned += items.length;
    
    console.log(`Scanned batch of ${items.length} posts (total: ${stats.scanned})`);
    
    for (const post of items) {
      if (!post.postedAt) {
        console.log(`  [SKIP] Post ${post.id} - no postedAt`);
        stats.skipped++;
        continue;
      }
      
      const postYearMonth = getPostYearMonth(post.postedAt);
      
      if (!postYearMonth) {
        console.log(`  [SKIP] Post ${post.id} - invalid postedAt: ${post.postedAt}`);
        stats.skipped++;
        continue;
      }
      
      stats.needsUpdate++;
      
      if (dryRun) {
        console.log(`  [DRY RUN] Would update ${post.id}: postYearMonth = ${postYearMonth}`);
      } else {
        try {
          await updatePostYearMonth(post.id, postYearMonth);
          stats.updated++;
          
          if (stats.updated % 50 === 0) {
            console.log(`  [PROGRESS] Updated ${stats.updated} posts...`);
          }
        } catch (error) {
          console.error(`  [ERROR] Failed to update ${post.id}:`, error.message);
          stats.errors++;
        }
      }
    }
    
    // Check if we should continue
    lastKey = nextKey;
    
    if (!lastKey) {
      continueScanning = false;
    }
    
    if (limit && stats.scanned >= limit) {
      continueScanning = false;
    }
    
    // Small delay to avoid throttling
    if (continueScanning) {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  
  console.log('');
  console.log('='.repeat(60));
  console.log('BACKFILL COMPLETE');
  console.log('='.repeat(60));
  console.log(`Scanned: ${stats.scanned}`);
  console.log(`Needs update: ${stats.needsUpdate}`);
  console.log(`Updated: ${stats.updated}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Errors: ${stats.errors}`);
  console.log('');
  
  return stats;
}

// ===================================================================
// LAMBDA HANDLER
// ===================================================================

exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const options = {
    dryRun: event.dryRun !== false, // Default to dry run for safety
    limit: event.limit || null,
  };
  
  const stats = await backfillPostYearMonth(options);
  
  return {
    success: true,
    stats,
  };
};

// ===================================================================
// CLI ENTRY POINT
// ===================================================================

if (require.main === module) {
  // Running from command line
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--live');
  const limitArg = args.find(a => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : null;
  
  console.log('');
  console.log('Running backfill from CLI...');
  console.log(`Use --live to actually update records (default is dry run)`);
  console.log(`Use --limit=N to limit number of records`);
  console.log('');
  
  backfillPostYearMonth({ dryRun, limit })
    .then(stats => {
      console.log('Done!');
      process.exit(stats.errors > 0 ? 1 : 0);
    })
    .catch(error => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

module.exports = {
  backfillPostYearMonth,
  getPostYearMonth,
};
