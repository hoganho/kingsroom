// resetSocialPostForReprocessing.js
//
// Resets social posts for reprocessing by:
// 1. Deleting all SocialPostGameData records
// 2. Deleting all SocialPostGameLink records
// 3. Deleting all SocialPostPlacement records
// 4. Resetting the SocialPost record to PENDING status
//
// Usage: node resetSocialPostForReprocessing.js <socialPostId>
//        node resetSocialPostForReprocessing.js --batch <id1,id2,id3>
//        node resetSocialPostForReprocessing.js --all

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand, QueryCommand, BatchWriteCommand, ScanCommand, GetCommand } from '@aws-sdk/lib-dynamodb';
import readline from 'readline';

// ============================================================================
// CONFIGURATION
// ============================================================================

const API_ID = 'ht3nugt6lvddpeeuwj3x6mkite';
const ENV = 'dev';

// Required fields that must exist on a SocialPost record
const REQUIRED_FIELDS = ['platformPostId', 'postType', 'postedAt', 'socialAccountId', 'createdAt'];

// ============================================================================
// CLIENT SETUP
// ============================================================================

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'ap-southeast-2' }),
  {
    marshallOptions: { removeUndefinedValues: true }
  }
);

// ============================================================================
// TABLE NAMES
// ============================================================================

const TABLES = {
  socialPost: `SocialPost-${API_ID}-${ENV}`,
  gameData: `SocialPostGameData-${API_ID}-${ENV}`,
  gameLink: `SocialPostGameLink-${API_ID}-${ENV}`,
  placement: `SocialPostPlacement-${API_ID}-${ENV}`,
};

// ============================================================================
// HELPERS
// ============================================================================

const batchDelete = async (tableName, items) => {
  if (!items || items.length === 0) return 0;

  const batches = [];
  for (let i = 0; i < items.length; i += 25) {
    batches.push(items.slice(i, i + 25));
  }

  let deletedCount = 0;

  for (const batch of batches) {
    const deleteRequests = batch.map(item => ({
      DeleteRequest: { Key: { id: item.id } }
    }));

    await client.send(new BatchWriteCommand({
      RequestItems: {
        [tableName]: deleteRequests
      }
    }));

    deletedCount += batch.length;
  }

  return deletedCount;
};

const queryAllByIndex = async (tableName, indexName, keyCondition, keyValues) => {
  const allItems = [];
  let lastEvaluatedKey = null;

  do {
    const params = {
      TableName: tableName,
      IndexName: indexName,
      KeyConditionExpression: keyCondition,
      ExpressionAttributeValues: keyValues,
      ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey })
    };

    const result = await client.send(new QueryCommand(params));
    allItems.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return allItems;
};

const scanAllPosts = async () => {
  const allItems = [];
  let lastEvaluatedKey = null;

  console.log('Scanning all social posts...');

  do {
    const params = {
      TableName: TABLES.socialPost,
      ProjectionExpression: 'id, processingStatus, platformPostId, postType, postedAt, socialAccountId, createdAt',
      ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey })
    };

    const result = await client.send(new ScanCommand(params));
    allItems.push(...(result.Items || []));
    lastEvaluatedKey = result.LastEvaluatedKey;
    
    process.stdout.write(`\r  Found ${allItems.length} posts...`);
  } while (lastEvaluatedKey);

  console.log(`\n  Total: ${allItems.length} posts`);
  return allItems;
};

const confirm = async (message) => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
    });
  });
};

/**
 * Verify a SocialPost exists and has all required fields
 */
const verifySocialPost = async (socialPostId) => {
  const result = await client.send(new GetCommand({
    TableName: TABLES.socialPost,
    Key: { id: socialPostId }
  }));

  if (!result.Item) {
    return { valid: false, error: 'Post not found', post: null };
  }

  const post = result.Item;
  const missingFields = REQUIRED_FIELDS.filter(f => !post[f]);

  if (missingFields.length > 0) {
    return { 
      valid: false, 
      error: `Missing required fields: ${missingFields.join(', ')}`,
      post,
      missingFields
    };
  }

  return { valid: true, error: null, post };
};

// ============================================================================
// RESET SINGLE POST
// ============================================================================

const resetSocialPost = async (socialPostId, options = {}) => {
  const { quiet = false } = options;

  if (!quiet) {
    console.log('═'.repeat(60));
    console.log(`Resetting social post: ${socialPostId}`);
    console.log('═'.repeat(60));
  }

  const summary = {
    gameDataDeleted: 0,
    linksDeleted: 0,
    placementsDeleted: 0,
    gameIds: []
  };

  try {
    // =========================================================================
    // SAFETY CHECK: Verify post exists and has required fields
    // =========================================================================
    if (!quiet) {
      console.log('\n[0/4] Verifying SocialPost exists and is valid...');
    }

    const verification = await verifySocialPost(socialPostId);

    if (!verification.valid) {
      const errorMsg = `Cannot reset: ${verification.error}`;
      if (!quiet) {
        console.error(`  ❌ ${errorMsg}`);
        if (verification.post) {
          console.error(`  Current record:`, JSON.stringify(verification.post, null, 2));
        }
      }
      return { success: false, error: errorMsg };
    }

    if (!quiet) {
      console.log('  ✓ Post verified');
    }

    // =========================================================================
    // 1. Delete SocialPostGameData
    // =========================================================================
    if (!quiet) {
      console.log('\n[1/4] Querying SocialPostGameData...');
    }

    const gameDataItems = await queryAllByIndex(
      TABLES.gameData,
      'bySocialPostExtraction',
      'socialPostId = :pid',
      { ':pid': socialPostId }
    );

    const gameDataIds = gameDataItems.map(item => item.id);

    if (!quiet) {
      console.log(`  Found ${gameDataItems.length} SocialPostGameData record(s)`);
    }

    if (gameDataItems.length > 0) {
      summary.gameDataDeleted = await batchDelete(TABLES.gameData, gameDataItems);
      if (!quiet) {
        console.log(`  ✓ Deleted ${summary.gameDataDeleted} SocialPostGameData record(s)`);
      }
    }

    // =========================================================================
    // 2. Delete SocialPostGameLink
    // =========================================================================
    if (!quiet) {
      console.log('\n[2/4] Querying SocialPostGameLink...');
    }

    const linkItems = await queryAllByIndex(
      TABLES.gameLink,
      'bySocialPostGameLink',
      'socialPostId = :pid',
      { ':pid': socialPostId }
    );

    summary.gameIds = [...new Set(linkItems.map(l => l.gameId).filter(Boolean))];

    if (!quiet) {
      console.log(`  Found ${linkItems.length} SocialPostGameLink record(s)`);
    }

    if (linkItems.length > 0) {
      summary.linksDeleted = await batchDelete(TABLES.gameLink, linkItems);
      if (!quiet) {
        console.log(`  ✓ Deleted ${summary.linksDeleted} SocialPostGameLink record(s)`);
      }
    }

    // =========================================================================
    // 3. Delete SocialPostPlacement
    // =========================================================================
    if (!quiet) {
      console.log('\n[3/4] Querying SocialPostPlacement...');
    }

    let allPlacements = [];

    for (const gameDataId of gameDataIds) {
      const placements = await queryAllByIndex(
        TABLES.placement,
        'byGameDataPlacement',
        'socialPostGameDataId = :gdid',
        { ':gdid': gameDataId }
      );
      allPlacements.push(...placements);
    }

    try {
      const directPlacements = await queryAllByIndex(
        TABLES.placement,
        'bySocialPostPlacement',
        'socialPostId = :pid',
        { ':pid': socialPostId }
      );

      const existingIds = new Set(allPlacements.map(p => p.id));
      for (const p of directPlacements) {
        if (!existingIds.has(p.id)) {
          allPlacements.push(p);
        }
      }
    } catch (e) {
      // Index might not exist
    }

    if (!quiet) {
      console.log(`  Found ${allPlacements.length} SocialPostPlacement record(s)`);
    }

    if (allPlacements.length > 0) {
      summary.placementsDeleted = await batchDelete(TABLES.placement, allPlacements);
      if (!quiet) {
        console.log(`  ✓ Deleted ${summary.placementsDeleted} SocialPostPlacement record(s)`);
      }
    }

    // =========================================================================
    // 4. Reset SocialPost record
    // =========================================================================
    if (!quiet) {
      console.log('\n[4/4] Resetting SocialPost record...');
    }

    // NOTE: linkedGameId and primaryLinkedGameId are GSI keys, so we REMOVE them
    // instead of setting to null (DynamoDB doesn't allow null GSI partition keys)
    // ConditionExpression ensures the record still exists
    await client.send(new UpdateCommand({
      TableName: TABLES.socialPost,
      Key: { id: socialPostId },
      UpdateExpression: `
        SET processingStatus = :status,
            linkedGameCount = :zero,
            hasUnverifiedLinks = :false,
            updatedAt = :now
        REMOVE extractedGameDataId, linkedGameId, primaryLinkedGameId, processedAt, processingError
      `.replace(/\s+/g, ' ').trim(),
      ExpressionAttributeValues: {
        ':status': 'PENDING',
        ':zero': 0,
        ':false': false,
        ':now': new Date().toISOString()
      },
      ConditionExpression: 'attribute_exists(id) AND attribute_exists(platformPostId)'
    }));

    if (!quiet) {
      console.log('  ✓ SocialPost reset to PENDING');

      console.log('\n' + '═'.repeat(60));
      console.log('✅ RESET COMPLETE');
      console.log('═'.repeat(60));
      console.log(`  SocialPostGameData deleted: ${summary.gameDataDeleted}`);
      console.log(`  SocialPostGameLink deleted:  ${summary.linksDeleted}`);
      console.log(`  SocialPostPlacement deleted: ${summary.placementsDeleted}`);
      console.log(`  SocialPost status:           PENDING`);

      if (summary.gameIds.length > 0) {
        console.log('\n⚠️  NOTE: The following games may have stale aggregation data:');
        summary.gameIds.forEach(gid => console.log(`    - ${gid}`));
      }

      console.log('\n📍 Post is ready for reprocessing!');
    }

    return { success: true, ...summary };

  } catch (error) {
    if (!quiet) {
      console.error('❌ ERROR:', error.message);
    }
    return { success: false, error: error.message };
  }
};

// ============================================================================
// RESET ALL POSTS
// ============================================================================

const resetAllSocialPosts = async () => {
  console.log('═'.repeat(60));
  console.log('RESET ALL SOCIAL POSTS');
  console.log(`Environment: ${ENV}`);
  console.log('═'.repeat(60));

  const allPosts = await scanAllPosts();

  if (allPosts.length === 0) {
    console.log('\nNo social posts found.');
    return;
  }

  // Check for invalid posts first
  const invalidPosts = allPosts.filter(post => {
    const missingFields = REQUIRED_FIELDS.filter(f => !post[f]);
    return missingFields.length > 0;
  });

  if (invalidPosts.length > 0) {
    console.log(`\n⚠️  Found ${invalidPosts.length} INVALID post(s) that will be skipped:`);
    for (const post of invalidPosts) {
      const missing = REQUIRED_FIELDS.filter(f => !post[f]);
      console.log(`  - ${post.id} (missing: ${missing.join(', ')})`);
    }
  }

  const validPosts = allPosts.filter(post => {
    const missingFields = REQUIRED_FIELDS.filter(f => !post[f]);
    return missingFields.length === 0;
  });

  const byStatus = {};
  for (const post of validPosts) {
    const status = post.processingStatus || 'UNKNOWN';
    byStatus[status] = (byStatus[status] || 0) + 1;
  }

  console.log('\nValid posts by status:');
  Object.entries(byStatus).sort().forEach(([status, count]) => {
    console.log(`  ${status}: ${count}`);
  });

  console.log('');
  const confirmed = await confirm(`⚠️  This will reset ${validPosts.length} valid posts. Are you sure? (y/N): `);

  if (!confirmed) {
    console.log('Cancelled.');
    return;
  }

  console.log('\n' + '─'.repeat(60));
  console.log('Starting reset...\n');

  const results = {
    success: 0,
    failed: 0,
    skipped: invalidPosts.length,
    totalGameData: 0,
    totalLinks: 0,
    totalPlacements: 0
  };

  for (let i = 0; i < validPosts.length; i++) {
    const post = validPosts[i];
    process.stdout.write(`\r[${i + 1}/${validPosts.length}] Resetting ${post.id}...`);

    const result = await resetSocialPost(post.id, { quiet: true });

    if (result.success) {
      results.success++;
      results.totalGameData += result.gameDataDeleted || 0;
      results.totalLinks += result.linksDeleted || 0;
      results.totalPlacements += result.placementsDeleted || 0;
    } else {
      results.failed++;
      console.log(`\n  ❌ Failed: ${result.error}`);
    }
  }

  console.log('\n\n' + '═'.repeat(60));
  console.log('✅ ALL POSTS RESET COMPLETE');
  console.log('═'.repeat(60));
  console.log(`  Posts reset:        ${results.success}`);
  console.log(`  Posts failed:       ${results.failed}`);
  console.log(`  Posts skipped:      ${results.skipped}`);
  console.log(`  GameData deleted:   ${results.totalGameData}`);
  console.log(`  Links deleted:      ${results.totalLinks}`);
  console.log(`  Placements deleted: ${results.totalPlacements}`);
  console.log('\n📍 All valid posts are ready for reprocessing!');
};

// ============================================================================
// BATCH RESET
// ============================================================================

const resetMultipleSocialPosts = async (socialPostIds) => {
  console.log(`\nResetting ${socialPostIds.length} social post(s)...\n`);

  const results = { success: 0, failed: 0 };

  for (const postId of socialPostIds) {
    const result = await resetSocialPost(postId);
    result.success ? results.success++ : results.failed++;
    console.log('');
  }

  console.log('═'.repeat(60));
  console.log(`BATCH COMPLETE: ${results.success} success, ${results.failed} failed`);
  console.log('═'.repeat(60));
};

// ============================================================================
// CLI
// ============================================================================

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log(`
Usage: node resetSocialPostForReprocessing.js <socialPostId>
       node resetSocialPostForReprocessing.js --batch id1,id2,id3
       node resetSocialPostForReprocessing.js --all

Examples:
  node resetSocialPostForReprocessing.js abc123
  node resetSocialPostForReprocessing.js --batch abc123,def456,ghi789
  node resetSocialPostForReprocessing.js --all
  `);
  process.exit(1);
}

if (args[0] === '--all') {
  resetAllSocialPosts();
} else if (args[0] === '--batch') {
  const ids = args[1]?.split(',').map(id => id.trim()).filter(Boolean);
  if (!ids || ids.length === 0) {
    console.error('Error: No post IDs provided');
    process.exit(1);
  }
  resetMultipleSocialPosts(ids);
} else {
  resetSocialPost(args[0]);
}