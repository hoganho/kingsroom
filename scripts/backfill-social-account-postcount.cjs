/**
 * MIGRATION SCRIPT: Backfill postCount on SocialAccount
 * 
 * Problem: SocialAccount.postCount is 0 for all accounts, but posts exist
 * in the SocialPost table linked via socialAccountId.
 * 
 * Solution: For each SocialAccount, count the posts in SocialPost table
 * using the bySocialAccount GSI and update the postCount field.
 * 
 * Usage:
 *   1. Update the TABLE_NAMES below with your actual table names
 *   2. Run: node backfill-social-account-postcount.cjs
 * 
 * Prerequisites:
 *   - AWS credentials configured (via AWS CLI, env vars, or IAM role)
 *   - @aws-sdk/client-dynamodb and @aws-sdk/lib-dynamodb installed
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { 
  DynamoDBDocumentClient, 
  ScanCommand, 
  QueryCommand,
  UpdateCommand 
} = require("@aws-sdk/lib-dynamodb");

// ==============================================
// CONFIGURATION - Update these!
// ==============================================

const REGION = "ap-southeast-2";
const API_ID = "ht3nugt6lvddpeeuwj3x6mkite";
const ENV = "dev";

// Table names
const TABLE_NAMES = {
  SocialAccount: `SocialAccount-${API_ID}-${ENV}`,
  SocialPost: `SocialPost-${API_ID}-${ENV}`
};

// GSI name for querying posts by account
const SOCIAL_POST_BY_ACCOUNT_INDEX = "bySocialAccount";

// Set to true to see what would happen without making changes
const DRY_RUN = false;

// ==============================================
// SETUP
// ==============================================

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);

// ==============================================
// HELPER FUNCTIONS
// ==============================================

async function scanAllItems(tableName) {
  const items = [];
  let lastKey = undefined;
  
  do {
    const response = await docClient.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastKey
    }));
    items.push(...(response.Items || []));
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);
  
  return items;
}

/**
 * Count posts for a given social account using the GSI
 * Uses SELECT: COUNT to efficiently count without fetching all records
 */
async function countPostsForAccount(socialAccountId) {
  let totalCount = 0;
  let lastKey = undefined;
  
  do {
    const response = await docClient.send(new QueryCommand({
      TableName: TABLE_NAMES.SocialPost,
      IndexName: SOCIAL_POST_BY_ACCOUNT_INDEX,
      KeyConditionExpression: 'socialAccountId = :accountId',
      ExpressionAttributeValues: {
        ':accountId': socialAccountId
      },
      Select: 'COUNT',
      ExclusiveStartKey: lastKey
    }));
    
    totalCount += response.Count || 0;
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);
  
  return totalCount;
}

/**
 * Update the postCount field on a SocialAccount
 */
async function updateAccountPostCount(accountId, postCount, currentVersion) {
  const now = new Date().toISOString();
  
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAMES.SocialAccount,
    Key: { id: accountId },
    UpdateExpression: 'SET postCount = :count, updatedAt = :now, #lca = :lastChanged ADD #v :inc',
    ExpressionAttributeNames: {
      '#lca': '_lastChangedAt',
      '#v': '_version'
    },
    ExpressionAttributeValues: {
      ':count': postCount,
      ':now': now,
      ':lastChanged': Date.now(),
      ':inc': 1
    }
  }));
}

// ==============================================
// MAIN MIGRATION
// ==============================================

async function runMigration() {
  console.log('='.repeat(60));
  console.log('SOCIAL ACCOUNT POSTCOUNT BACKFILL MIGRATION');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes will be made)' : '🔴 LIVE RUN'}`);
  console.log(`Tables:`);
  console.log(`  SocialAccount: ${TABLE_NAMES.SocialAccount}`);
  console.log(`  SocialPost: ${TABLE_NAMES.SocialPost}`);
  console.log(`  Index: ${SOCIAL_POST_BY_ACCOUNT_INDEX}`);
  console.log('');
  
  // Step 1: Fetch all SocialAccounts
  console.log('📋 Fetching all SocialAccount records...');
  const allAccounts = await scanAllItems(TABLE_NAMES.SocialAccount);
  console.log(`   Found ${allAccounts.length} SocialAccount records`);
  console.log('');
  
  if (allAccounts.length === 0) {
    console.log('⚠️ No SocialAccount records found. Nothing to do!');
    return;
  }
  
  // Step 2: Process each account
  console.log('🔄 Counting posts for each account...');
  console.log('');
  
  const results = {
    updated: 0,
    unchanged: 0,
    errors: 0,
    totalPostsCounted: 0
  };
  
  const updates = []; // Track what we'll update for summary
  
  for (const account of allAccounts) {
    const accountName = account.accountName || account.id;
    const currentCount = account.postCount || 0;
    
    try {
      // Count actual posts
      const actualCount = await countPostsForAccount(account.id);
      results.totalPostsCounted += actualCount;
      
      // Check if update is needed
      if (actualCount === currentCount) {
        console.log(`   ✓ "${accountName}": ${actualCount} posts (already correct)`);
        results.unchanged++;
        continue;
      }
      
      updates.push({
        id: account.id,
        name: accountName,
        oldCount: currentCount,
        newCount: actualCount
      });
      
      if (DRY_RUN) {
        console.log(`   [DRY RUN] "${accountName}": ${currentCount} -> ${actualCount} posts`);
        results.updated++;
      } else {
        await updateAccountPostCount(account.id, actualCount, account._version);
        console.log(`   ✓ Updated "${accountName}": ${currentCount} -> ${actualCount} posts`);
        results.updated++;
      }
      
    } catch (error) {
      console.error(`   ❌ ERROR processing "${accountName}":`, error.message);
      results.errors++;
    }
  }
  
  // Step 3: Summary
  console.log('');
  console.log('='.repeat(60));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(60));
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Total SocialAccounts: ${allAccounts.length}`);
  console.log(`Already correct: ${results.unchanged}`);
  console.log(`Updated: ${results.updated}`);
  console.log(`Errors: ${results.errors}`);
  console.log(`Total posts counted: ${results.totalPostsCounted}`);
  console.log('');
  
  if (updates.length > 0) {
    console.log('Updates:');
    for (const u of updates) {
      console.log(`  - ${u.name}: ${u.oldCount} -> ${u.newCount}`);
    }
    console.log('');
  }
  
  if (DRY_RUN && results.updated > 0) {
    console.log('💡 To apply changes, set DRY_RUN = false and run again.');
  } else if (!DRY_RUN && results.updated > 0) {
    console.log('✅ Migration complete! Post counts have been updated.');
  }
}

// ==============================================
// RUN
// ==============================================

runMigration()
  .then(() => {
    console.log('\nDone.');
    process.exit(0);
  })
  .catch(err => {
    console.error('\n❌ Migration failed:', err);
    process.exit(1);
  });
