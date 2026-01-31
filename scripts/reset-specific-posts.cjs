// reset-specific-posts.cjs
// ============================================================================
// Resets processing status for specific posts by ID
// ============================================================================

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, QueryCommand, ScanCommand, UpdateCommand, DeleteCommand, BatchWriteCommand } = require("@aws-sdk/lib-dynamodb");

const REGION = process.env.AWS_REGION || "ap-southeast-2";
const API_ID = process.env.API_ID || "ynuahifnznb5zddz727oiqnicy";  // prod
const ENV = process.env.ENV_SUFFIX || "prod";

// Table names
const SOCIAL_POST_TABLE = `SocialPost-${API_ID}-${ENV}`;
const SOCIAL_POST_GAME_DATA_TABLE = `SocialPostGameData-${API_ID}-${ENV}`;
const SOCIAL_POST_GAME_LINK_TABLE = `SocialPostGameLink-${API_ID}-${ENV}`;

// ============================================================================
// GAME ID TO FIND RELATED POSTS (Tournament 1280)
// ============================================================================
const TARGET_GAME_ID = '06c7cd9c-036a-4aee-8526-d7ccbc6a8810';

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: { removeUndefinedValues: true },
});

const DRY_RUN = process.argv.includes('--dry-run');
const DELETE_RELATED = process.argv.includes('--delete-related');

// Fields to reset on SocialPost
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
// MAIN
// ============================================================================

async function resetSpecificPosts() {
  console.log('');
  console.log('='.repeat(70));
  console.log('  RESET POSTS BY GAME ID');
  console.log('='.repeat(70));
  console.log('');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Delete related: ${DELETE_RELATED ? 'YES' : 'NO'}`);
  console.log('');
  console.log('Tables being queried:');
  console.log(`  SocialPost:         ${SOCIAL_POST_TABLE}`);
  console.log(`  SocialPostGameData: ${SOCIAL_POST_GAME_DATA_TABLE}`);
  console.log(`  SocialPostGameLink: ${SOCIAL_POST_GAME_LINK_TABLE}`);
  console.log('');
  console.log(`Target Game ID: ${TARGET_GAME_ID}`);
  console.log('');
  console.log('-'.repeat(70));

  let stats = {
    postsReset: 0,
    gameDataDeleted: 0,
    linksDeleted: 0,
    errors: 0,
  };

  // Step 1: Find all SocialPostGameLink records by gameId
  console.log('\nStep 1: Finding SocialPostGameLink records by gameId...');
  const linkRecords = await findLinksByGameId(TARGET_GAME_ID);
  console.log(`  Found ${linkRecords.length} link records`);
  
  if (linkRecords.length === 0) {
    console.log('\nNo link records found. Exiting.');
    return;
  }

  // Extract unique socialPostIds
  const socialPostIds = [...new Set(linkRecords.map(r => r.socialPostId))];
  console.log(`  Unique socialPostIds: ${socialPostIds.length}`);
  socialPostIds.forEach(id => console.log(`    - ${id}`));

  // Step 2: Delete SocialPostGameLink records
  if (DELETE_RELATED) {
    console.log('\nStep 2: Deleting SocialPostGameLink records...');
    for (const record of linkRecords) {
      if (!DRY_RUN) {
        try {
          await docClient.send(new DeleteCommand({
            TableName: SOCIAL_POST_GAME_LINK_TABLE,
            Key: { id: record.id }
          }));
          console.log(`  ✓ Deleted Link: ${record.id}`);
          stats.linksDeleted++;
        } catch (err) {
          console.log(`  ✗ Error: ${err.message}`);
          stats.errors++;
        }
      } else {
        console.log(`  [DRY RUN] Would delete Link: ${record.id}`);
        stats.linksDeleted++;
      }
    }
  }

  // Step 3: Find and delete SocialPostGameData records for each post
  if (DELETE_RELATED) {
    console.log('\nStep 3: Finding and deleting SocialPostGameData records...');
    for (const postId of socialPostIds) {
      const gameDataRecords = await findGameDataBySocialPostId(postId);
      for (const record of gameDataRecords) {
        if (!DRY_RUN) {
          try {
            await docClient.send(new DeleteCommand({
              TableName: SOCIAL_POST_GAME_DATA_TABLE,
              Key: { id: record.id }
            }));
            console.log(`  ✓ Deleted GameData: ${record.id}`);
            stats.gameDataDeleted++;
          } catch (err) {
            console.log(`  ✗ Error: ${err.message}`);
            stats.errors++;
          }
        } else {
          console.log(`  [DRY RUN] Would delete GameData: ${record.id}`);
          stats.gameDataDeleted++;
        }
      }
    }
  }

  // Step 4: Reset SocialPost records
  console.log('\nStep 4: Resetting SocialPost records to PENDING...');
  const { updateExpression, expressionAttributeNames, expressionAttributeValues } = buildUpdateExpression();
  
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
        console.log(`  ✓ Reset: ${postId}`);
        stats.postsReset++;
      } catch (err) {
        console.log(`  ✗ Error resetting ${postId}: ${err.message}`);
        stats.errors++;
      }
    } else {
      console.log(`  [DRY RUN] Would reset: ${postId}`);
      stats.postsReset++;
    }
  }

  // Summary
  console.log('\n');
  console.log('='.repeat(70));
  console.log('  SUMMARY');
  console.log('='.repeat(70));
  console.log(`  Posts ${DRY_RUN ? 'to reset' : 'reset'}: ${stats.postsReset}`);
  if (DELETE_RELATED) {
    console.log(`  GameData ${DRY_RUN ? 'to delete' : 'deleted'}: ${stats.gameDataDeleted}`);
    console.log(`  Links ${DRY_RUN ? 'to delete' : 'deleted'}: ${stats.linksDeleted}`);
  }
  if (stats.errors > 0) {
    console.log(`  Errors: ${stats.errors}`);
  }
  console.log('');
  
  if (DRY_RUN) {
    console.log('This was a DRY RUN. Run without --dry-run to apply changes.');
  }
  
  console.log('\nDone!');
}

// ============================================================================
// FIND FUNCTIONS
// ============================================================================

async function findLinksByGameId(gameId) {
  // Use the byGameSocialPostLink GSI
  try {
    console.log(`  Querying GSI byGameSocialPostLink for gameId: ${gameId}`);
    const result = await docClient.send(new QueryCommand({
      TableName: SOCIAL_POST_GAME_LINK_TABLE,
      IndexName: 'byGameSocialPostLink',
      KeyConditionExpression: 'gameId = :gid',
      ExpressionAttributeValues: { ':gid': gameId }
    }));
    return result.Items || [];
  } catch (err) {
    console.log(`  GSI query error: ${err.message}, trying scan...`);
  }
  
  // Fallback: Scan with filter
  try {
    const scanResult = await docClient.send(new ScanCommand({
      TableName: SOCIAL_POST_GAME_LINK_TABLE,
      FilterExpression: 'gameId = :gid',
      ExpressionAttributeValues: { ':gid': gameId }
    }));
    return scanResult.Items || [];
  } catch (err) {
    console.log(`  Scan error: ${err.message}`);
    return [];
  }
}

async function findGameDataBySocialPostId(socialPostId) {
  // Try GSI query first
  try {
    console.log(`    Querying GSI bySocialPostExtraction for: ${socialPostId}`);
    const result = await docClient.send(new QueryCommand({
      TableName: SOCIAL_POST_GAME_DATA_TABLE,
      IndexName: 'bySocialPostExtraction',
      KeyConditionExpression: 'socialPostId = :pid',
      ExpressionAttributeValues: { ':pid': socialPostId }
    }));
    if (result.Items && result.Items.length > 0) {
      return result.Items;
    }
    console.log(`    GSI returned 0 results, trying scan...`);
  } catch (err) {
    console.log(`    GSI query error: ${err.message}`);
  }
  
  // Fallback: Scan with filter
  try {
    const scanResult = await docClient.send(new ScanCommand({
      TableName: SOCIAL_POST_GAME_DATA_TABLE,
      FilterExpression: 'socialPostId = :pid',
      ExpressionAttributeValues: { ':pid': socialPostId }
    }));
    console.log(`    Scan found ${scanResult.Items?.length || 0} records`);
    return scanResult.Items || [];
  } catch (err) {
    console.log(`    Scan error: ${err.message}`);
    return [];
  }
}

async function findLinksBySocialPostId(socialPostId) {
  // Try GSI query first
  try {
    console.log(`    Querying GSI bySocialPostGameLink for: ${socialPostId}`);
    const result = await docClient.send(new QueryCommand({
      TableName: SOCIAL_POST_GAME_LINK_TABLE,
      IndexName: 'bySocialPostGameLink',
      KeyConditionExpression: 'socialPostId = :pid',
      ExpressionAttributeValues: { ':pid': socialPostId }
    }));
    if (result.Items && result.Items.length > 0) {
      return result.Items;
    }
    console.log(`    GSI returned 0 results, trying scan...`);
  } catch (err) {
    console.log(`    GSI query error: ${err.message}`);
  }
  
  // Fallback: Scan with filter
  try {
    const scanResult = await docClient.send(new ScanCommand({
      TableName: SOCIAL_POST_GAME_LINK_TABLE,
      FilterExpression: 'socialPostId = :pid',
      ExpressionAttributeValues: { ':pid': socialPostId }
    }));
    console.log(`    Scan found ${scanResult.Items?.length || 0} records`);
    return scanResult.Items || [];
  } catch (err) {
    console.log(`    Scan error: ${err.message}`);
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

  expressionAttributeNames['#updatedAt'] = 'updatedAt';
  expressionAttributeValues[':updatedAt'] = new Date().toISOString();
  setClauses.push('#updatedAt = :updatedAt');

  Object.entries(SET_FIELDS).forEach(([field, value], index) => {
    const nameKey = `#set${index}`;
    const valueKey = `:set${index}`;
    expressionAttributeNames[nameKey] = field;
    expressionAttributeValues[valueKey] = value;
    setClauses.push(`${nameKey} = ${valueKey}`);
  });

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

resetSpecificPosts().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
