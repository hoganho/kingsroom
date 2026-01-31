// reset-tournament-1280-posts.cjs
// ============================================================================
// Resets processing status for posts related to tournament 1280
// ============================================================================
// This script:
// 1. Finds SocialPostGameData records with extractedTournamentId = 1280
// 2. Gets the associated socialPostIds
// 3. Resets those SocialPost records to PENDING
// 4. Optionally deletes related SocialPostGameData and SocialPostGameLink records
// ============================================================================

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand, ScanCommand, UpdateCommand, DeleteCommand } = require("@aws-sdk/lib-dynamodb");

const REGION = process.env.AWS_REGION || "ap-southeast-2";
const API_ID = process.env.API_ID || "ht3nugt6lvddpeeuwj3x6mkite";
const ENV = process.env.ENV_SUFFIX || "dev";

// Table names
const SOCIAL_POST_TABLE = `SocialPost-${API_ID}-${ENV}`;
const SOCIAL_POST_GAME_DATA_TABLE = `SocialPostGameData-${API_ID}-${ENV}`;
const SOCIAL_POST_GAME_LINK_TABLE = `SocialPostGameLink-${API_ID}-${ENV}`;

// Tournament ID to reset
const TARGET_TOURNAMENT_ID = 1280;

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

// Dry run mode - set to false to actually update records
const DRY_RUN = process.argv.includes('--dry-run');
const DELETE_RELATED = process.argv.includes('--delete-related');

// ============================================================================
// FIELDS TO RESET ON SOCIALPOST
// ============================================================================

const SET_FIELDS = {
  processingStatus: 'PENDING',
  linkedGameCount: 0,
  hasUnverifiedLinks: false,
};

const REMOVE_FIELDS = [
  'processedAt',
  'processingError',
  'processingVersion',
  'contentType',
  'contentTypeConfidence',
  'isTournamentResult',
  'isTournamentRelated',
  'linkedGameId',
  'extractedGameDataId',
  'primaryLinkedGameId',
  'effectiveGameDate',
  'effectiveGameDateSource',
];

// ============================================================================
// MAIN FUNCTION
// ============================================================================

async function resetTournamentPosts() {
  console.log('');
  console.log('='.repeat(70));
  console.log(`  RESET POSTS FOR TOURNAMENT ${TARGET_TOURNAMENT_ID}`);
  console.log('='.repeat(70));
  console.log('');
  console.log(`Tables:`);
  console.log(`  SocialPost:         ${SOCIAL_POST_TABLE}`);
  console.log(`  SocialPostGameData: ${SOCIAL_POST_GAME_DATA_TABLE}`);
  console.log(`  SocialPostGameLink: ${SOCIAL_POST_GAME_LINK_TABLE}`);
  console.log('');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (no changes)' : 'LIVE (will update)'}`);
  console.log(`Delete related records: ${DELETE_RELATED ? 'YES' : 'NO (use --delete-related to enable)'}`);
  console.log('');
  console.log('-'.repeat(70));
  
  // Step 1: Find SocialPostGameData records for this tournament
  console.log('\nStep 1: Finding SocialPostGameData records...');
  const gameDataRecords = await findGameDataByTournamentId(TARGET_TOURNAMENT_ID);
  console.log(`  Found ${gameDataRecords.length} SocialPostGameData records`);
  
  if (gameDataRecords.length === 0) {
    console.log('\nNo records found. Exiting.');
    return;
  }
  
  // Get unique socialPostIds
  const socialPostIds = [...new Set(gameDataRecords.map(r => r.socialPostId))];
  console.log(`  Unique socialPostIds: ${socialPostIds.length}`);
  
  // Show the posts we'll reset
  console.log('\n  Posts to reset:');
  for (const postId of socialPostIds) {
    console.log(`    - ${postId}`);
  }
  
  // Step 2: Find SocialPostGameLink records for these posts
  console.log('\nStep 2: Finding SocialPostGameLink records...');
  const linkRecords = [];
  for (const postId of socialPostIds) {
    const links = await findLinksBySocialPostId(postId);
    linkRecords.push(...links);
  }
  console.log(`  Found ${linkRecords.length} SocialPostGameLink records`);
  
  // Step 3: Delete related records (if enabled)
  if (DELETE_RELATED) {
    console.log('\nStep 3: Deleting related records...');
    
    // Delete SocialPostGameData records
    console.log(`  Deleting ${gameDataRecords.length} SocialPostGameData records...`);
    for (const record of gameDataRecords) {
      if (!DRY_RUN) {
        try {
          await docClient.send(new DeleteCommand({
            TableName: SOCIAL_POST_GAME_DATA_TABLE,
            Key: { id: record.id }
          }));
          console.log(`    ✓ Deleted SocialPostGameData: ${record.id}`);
        } catch (err) {
          console.log(`    ✗ Error deleting ${record.id}: ${err.message}`);
        }
      } else {
        console.log(`    [DRY RUN] Would delete SocialPostGameData: ${record.id}`);
      }
    }
    
    // Delete SocialPostGameLink records
    console.log(`  Deleting ${linkRecords.length} SocialPostGameLink records...`);
    for (const record of linkRecords) {
      if (!DRY_RUN) {
        try {
          await docClient.send(new DeleteCommand({
            TableName: SOCIAL_POST_GAME_LINK_TABLE,
            Key: { id: record.id }
          }));
          console.log(`    ✓ Deleted SocialPostGameLink: ${record.id}`);
        } catch (err) {
          console.log(`    ✗ Error deleting ${record.id}: ${err.message}`);
        }
      } else {
        console.log(`    [DRY RUN] Would delete SocialPostGameLink: ${record.id}`);
      }
    }
  } else {
    console.log('\nStep 3: Skipping related record deletion (use --delete-related to enable)');
  }
  
  // Step 4: Reset SocialPost records
  console.log('\nStep 4: Resetting SocialPost records...');
  const { updateExpression, expressionAttributeNames, expressionAttributeValues } = buildUpdateExpression();
  
  let updated = 0;
  let errors = 0;
  
  for (const postId of socialPostIds) {
    if (!DRY_RUN) {
      try {
        await docClient.send(new UpdateCommand({
          TableName: SOCIAL_POST_TABLE,
          Key: { id: postId },
          UpdateExpression: updateExpression,
          ExpressionAttributeNames: expressionAttributeNames,
          ExpressionAttributeValues: expressionAttributeValues,
        }));
        console.log(`  ✓ Reset SocialPost: ${postId}`);
        updated++;
      } catch (err) {
        console.log(`  ✗ Error resetting ${postId}: ${err.message}`);
        errors++;
      }
    } else {
      console.log(`  [DRY RUN] Would reset SocialPost: ${postId}`);
      updated++;
    }
  }
  
  // Summary
  console.log('\n');
  console.log('='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Tournament ID: ${TARGET_TOURNAMENT_ID}`);
  console.log(`  SocialPost records ${DRY_RUN ? 'to reset' : 'reset'}: ${updated}`);
  if (DELETE_RELATED) {
    console.log(`  SocialPostGameData records ${DRY_RUN ? 'to delete' : 'deleted'}: ${gameDataRecords.length}`);
    console.log(`  SocialPostGameLink records ${DRY_RUN ? 'to delete' : 'deleted'}: ${linkRecords.length}`);
  }
  if (errors > 0) {
    console.log(`  Errors: ${errors}`);
  }
  console.log('');
  
  if (DRY_RUN) {
    console.log('This was a DRY RUN. Run without --dry-run to apply changes.');
    console.log('');
  }
  
  console.log('Done!');
}

// ============================================================================
// FIND FUNCTIONS
// ============================================================================

async function findGameDataByTournamentId(tournamentId) {
  const records = [];
  
  // Try using the byTournamentId GSI
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: SOCIAL_POST_GAME_DATA_TABLE,
      IndexName: 'byTournamentId',
      KeyConditionExpression: 'extractedTournamentId = :tid',
      ExpressionAttributeValues: {
        ':tid': tournamentId
      }
    }));
    return result.Items || [];
  } catch (err) {
    console.log(`  GSI query failed: ${err.message}`);
    console.log('  Falling back to scan...');
  }
  
  // Fallback: Scan with filter
  let lastKey = undefined;
  do {
    const result = await docClient.send(new ScanCommand({
      TableName: SOCIAL_POST_GAME_DATA_TABLE,
      FilterExpression: 'extractedTournamentId = :tid',
      ExpressionAttributeValues: {
        ':tid': tournamentId
      },
      ExclusiveStartKey: lastKey
    }));
    
    records.push(...(result.Items || []));
    lastKey = result.LastEvaluatedKey;
  } while (lastKey);
  
  return records;
}

async function findLinksBySocialPostId(socialPostId) {
  // Try using the bySocialPostGameLink GSI
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: SOCIAL_POST_GAME_LINK_TABLE,
      IndexName: 'bySocialPostGameLink',
      KeyConditionExpression: 'socialPostId = :pid',
      ExpressionAttributeValues: {
        ':pid': socialPostId
      }
    }));
    return result.Items || [];
  } catch (err) {
    console.log(`  Link query failed for ${socialPostId}: ${err.message}`);
    return [];
  }
}

// ============================================================================
// BUILD UPDATE EXPRESSION
// ============================================================================

function buildUpdateExpression() {
  const expressionAttributeNames = {};
  const expressionAttributeValues = {};
  const setClauses = [];
  const removeClauses = [];
  
  // Add updatedAt
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
  
  let updateExpression = `SET ${setClauses.join(', ')}`;
  if (removeClauses.length > 0) {
    updateExpression += ` REMOVE ${removeClauses.join(', ')}`;
  }
  
  return { updateExpression, expressionAttributeNames, expressionAttributeValues };
}

// ============================================================================
// EXECUTE
// ============================================================================

resetTournamentPosts().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
