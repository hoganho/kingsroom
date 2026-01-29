#!/usr/bin/env node

/**
 * migrate-backfill-firstGameDate.mjs
 * 
 * One-time migration script to populate firstGameDate on all RecurringGame records.
 * 
 * This script:
 * 1. Scans all active RecurringGame records
 * 2. For each, queries all assigned Game records
 * 3. Finds the earliest gameStartDateTime
 * 4. Updates the RecurringGame with firstGameDate (and lastGameDate if needed)
 * 
 * Usage:
 *   node migrate-backfill-firstGameDate.mjs                    # Interactive env selection + preview
 *   node migrate-backfill-firstGameDate.mjs --execute          # Interactive env selection + execute
 *   node migrate-backfill-firstGameDate.mjs --venue <id>       # Single venue
 *   node migrate-backfill-firstGameDate.mjs --entity <id>      # Single entity
 * 
 * Prerequisites:
 *   - AWS credentials configured
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
    DynamoDBDocumentClient, 
    ScanCommand, 
    QueryCommand, 
    UpdateCommand 
} from '@aws-sdk/lib-dynamodb';
import readline from 'readline';

// ============================================================================
// ENVIRONMENT CONFIGURATIONS
// ============================================================================

const ENVIRONMENTS = {
  dev: {
    API_ID: 'ht3nugt6lvddpeeuwj3x6mkite',
    ENV_SUFFIX: 'dev',
  },
  prod: {
    API_ID: 'ynuahifnznb5zddz727oiqnicy',
    ENV_SUFFIX: 'prod',
  },
};

const REGION = 'ap-southeast-2';

// ============================================================================
// RUNTIME STATE
// ============================================================================

let SELECTED_ENV = null;
let CONFIG = null;

// ============================================================================
// HELPERS
// ============================================================================

function askQuestion(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(query, (ans) => {
      rl.close();
      resolve(ans);
    })
  );
}

const getTableName = (modelName) => {
  return `${modelName}-${CONFIG.API_ID}-${CONFIG.ENV_SUFFIX}`;
};

// ===================================================================
// DYNAMODB CLIENT
// ===================================================================

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true }
});

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

const parseArgs = () => {
    const args = process.argv.slice(2);
    const config = {
        preview: true,
        venueId: null,
        entityId: null,
    };
    
    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--execute':
            case '-e':
                config.preview = false;
                break;
            case '--preview':
            case '-p':
                config.preview = true;
                break;
            case '--venue':
            case '-v':
                config.venueId = args[++i];
                break;
            case '--entity':
                config.entityId = args[++i];
                break;
            case '--help':
            case '-h':
                console.log(`
Usage: node migrate-backfill-firstGameDate.mjs [options]

Options:
  --preview, -p     Dry run - show what would be updated (default)
  --execute, -e     Apply changes to database
  --venue, -v <id>  Process only a specific venue
  --entity <id>     Process only a specific entity
  --help, -h        Show this help message

Examples:
  node migrate-backfill-firstGameDate.mjs --preview
  node migrate-backfill-firstGameDate.mjs --execute
  node migrate-backfill-firstGameDate.mjs --venue abc123 --execute
`);
                process.exit(0);
        }
    }
    
    return config;
};

const log = (message, data = null) => {
    const timestamp = new Date().toISOString();
    if (data) {
        console.log(`[${timestamp}] ${message}`, JSON.stringify(data, null, 2));
    } else {
        console.log(`[${timestamp}] ${message}`);
    }
};

// ===================================================================
// DATABASE OPERATIONS
// ===================================================================

/**
 * Get all recurring games, optionally filtered
 */
const getAllRecurringGames = async ({ venueId, entityId }) => {
    const items = [];
    let lastKey = null;
    const tableName = getTableName('RecurringGame');
    
    log('Fetching recurring games...');
    
    do {
        let params;
        
        if (venueId) {
            params = {
                TableName: tableName,
                IndexName: 'byVenueRecurringGame',
                KeyConditionExpression: 'venueId = :vid',
                ExpressionAttributeValues: { ':vid': venueId }
            };
        } else if (entityId) {
            params = {
                TableName: tableName,
                IndexName: 'byEntityRecurringGame',
                KeyConditionExpression: 'entityId = :eid',
                ExpressionAttributeValues: { ':eid': entityId }
            };
        } else {
            params = {
                TableName: tableName
            };
        }
        
        if (lastKey) {
            params.ExclusiveStartKey = lastKey;
        }
        
        const command = (venueId || entityId) ? new QueryCommand(params) : new ScanCommand(params);
        const result = await docClient.send(command);
        
        items.push(...(result.Items || []));
        lastKey = result.LastEvaluatedKey;
        
        log(`  Fetched ${items.length} recurring games so far...`);
    } while (lastKey);
    
    // Filter to active only
    const activeItems = items.filter(rg => rg.isActive !== false);
    log(`Found ${activeItems.length} active recurring games (${items.length} total)`);
    
    return activeItems;
};

/**
 * Get all games assigned to a recurring game
 */
const getGamesByRecurringGameId = async (recurringGameId) => {
    const items = [];
    let lastKey = null;
    const tableName = getTableName('Game');
    
    do {
        try {
            // Try using the byRecurringGame index first
            const params = {
                TableName: tableName,
                IndexName: 'byRecurringGame',
                KeyConditionExpression: 'recurringGameId = :rgid',
                ExpressionAttributeValues: { ':rgid': recurringGameId }
            };
            
            if (lastKey) {
                params.ExclusiveStartKey = lastKey;
            }
            
            const result = await docClient.send(new QueryCommand(params));
            items.push(...(result.Items || []));
            lastKey = result.LastEvaluatedKey;
        } catch (error) {
            // Fall back to scan if index doesn't exist
            if (error.name === 'ValidationException' || error.name === 'ResourceNotFoundException') {
                log(`  Index not available for ${recurringGameId}, using scan...`);
                const scanResult = await docClient.send(new ScanCommand({
                    TableName: tableName,
                    FilterExpression: 'recurringGameId = :rgid',
                    ExpressionAttributeValues: { ':rgid': recurringGameId }
                }));
                return scanResult.Items || [];
            }
            throw error;
        }
    } while (lastKey);
    
    return items;
};

/**
 * Update recurring game with firstGameDate only
 * NOTE: We don't update lastGameDate here because it's AWSDateTime in the schema
 *       and is already maintained by recurring-game-stats.js in the correct format
 */
const updateRecurringGameDates = async (recurringGameId, firstGameDate) => {
    if (!firstGameDate) {
        return;
    }
    
    const tableName = getTableName('RecurringGame');
    
    await docClient.send(new UpdateCommand({
        TableName: tableName,
        Key: { id: recurringGameId },
        UpdateExpression: 'SET #firstGameDate = :firstGameDate, updatedAt = :now',
        ExpressionAttributeNames: {
            '#firstGameDate': 'firstGameDate'
        },
        ExpressionAttributeValues: {
            ':firstGameDate': firstGameDate,
            ':now': new Date().toISOString()
        }
    }));
};

// ============================================================================
// ENVIRONMENT SELECTION
// ============================================================================

async function selectEnvironment() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║        BACKFILL FIRSTGAMEDATE ON RECURRINGGAME                    ║');
  console.log('║        Populates firstGameDate from earliest Game record          ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  console.log('Available environments:\n');
  console.log('  [1] dev  - Development environment');
  console.log(`        API ID: ${ENVIRONMENTS.dev.API_ID}`);
  console.log('');
  console.log('  [2] prod - Production environment');
  console.log(`        API ID: ${ENVIRONMENTS.prod.API_ID}`);
  console.log('');

  const answer = await askQuestion('Select environment (dev/prod or 1/2): ');
  const normalizedAnswer = answer.toLowerCase().trim();

  if (normalizedAnswer === 'dev' || normalizedAnswer === '1') {
    return 'dev';
  } else if (normalizedAnswer === 'prod' || normalizedAnswer === '2') {
    return 'prod';
  } else {
    console.error(`Invalid selection: "${answer}". Please enter "dev", "prod", "1", or "2".`);
    process.exit(1);
  }
}

// ===================================================================
// MAIN MIGRATION FUNCTION
// ===================================================================

const runMigration = async (argsConfig) => {
    // Select environment first
    SELECTED_ENV = await selectEnvironment();
    CONFIG = ENVIRONMENTS[SELECTED_ENV];
    
    const { preview, venueId, entityId } = argsConfig;
    
    console.log('\n' + '─'.repeat(70));
    console.log(`Selected environment: ${SELECTED_ENV.toUpperCase()}`);
    console.log(`API ID: ${CONFIG.API_ID}`);
    console.log(`Mode: ${preview ? '👁️  PREVIEW (dry run)' : '🔧 EXECUTE (applying changes)'}`);
    console.log(`RecurringGame table: ${getTableName('RecurringGame')}`);
    console.log(`Game table: ${getTableName('Game')}`);
    if (venueId) console.log(`Filtering by venueId: ${venueId}`);
    if (entityId) console.log(`Filtering by entityId: ${entityId}`);
    console.log('─'.repeat(70) + '\n');
    
    // Production safety check
    if (SELECTED_ENV === 'prod' && !preview) {
      log('⚠️  You are about to MODIFY PRODUCTION data!');
      const confirm = await askQuestion('Type "fix prod" to confirm: ');
      if (confirm.toLowerCase().trim() !== 'fix prod') {
        log('Aborted by user.');
        return;
      }
      console.log('');
    }
    
    const stats = {
        processed: 0,
        updated: 0,
        skipped: 0,
        noGames: 0,
        errors: 0,
        alreadySet: 0,
    };
    
    const details = [];
    
    try {
        // Get all recurring games
        const recurringGames = await getAllRecurringGames({ venueId, entityId });
        
        log('');
        log(`Processing ${recurringGames.length} recurring games...`);
        log('');
        
        for (const rg of recurringGames) {
            stats.processed++;
            
            try {
                // Get all games for this recurring game
                const games = await getGamesByRecurringGameId(rg.id);
                
                if (games.length === 0) {
                    stats.noGames++;
                    details.push({
                        id: rg.id,
                        name: rg.name,
                        status: 'NO_GAMES',
                        gameCount: 0
                    });
                    continue;
                }
                
                // Find earliest game datetime (use full ISO datetime)
                const gameDateTimes = games
                    .map(g => g.gameStartDateTime)
                    .filter(d => d)
                    .sort();
                
                if (gameDateTimes.length === 0) {
                    stats.skipped++;
                    details.push({
                        id: rg.id,
                        name: rg.name,
                        status: 'NO_VALID_DATES',
                        gameCount: games.length
                    });
                    continue;
                }
                
                const firstGameDate = gameDateTimes[0];
                
                // Check if update is needed (only for firstGameDate)
                // Compare by extracting date portion for comparison
                const existingFirst = rg.firstGameDate?.split('T')[0];
                const newFirst = firstGameDate.split('T')[0];
                const needsUpdate = !existingFirst || existingFirst > newFirst;
                
                if (!needsUpdate) {
                    stats.alreadySet++;
                    details.push({
                        id: rg.id,
                        name: rg.name,
                        status: 'ALREADY_SET',
                        existingFirst: rg.firstGameDate,
                        gameCount: games.length
                    });
                    continue;
                }
                
                // Apply update if not preview
                if (!preview) {
                    await updateRecurringGameDates(rg.id, firstGameDate);
                }
                
                stats.updated++;
                details.push({
                    id: rg.id,
                    name: rg.name,
                    status: 'UPDATED',
                    firstGameDate,
                    previousFirst: rg.firstGameDate || null,
                    gameCount: games.length
                });
                
                // Log progress every 10 updates
                if (stats.updated % 10 === 0) {
                    log(`  Progress: ${stats.updated} updated, ${stats.processed}/${recurringGames.length} processed`);
                }
                
            } catch (error) {
                stats.errors++;
                details.push({
                    id: rg.id,
                    name: rg.name,
                    status: 'ERROR',
                    error: error.message
                });
                log(`  ERROR processing ${rg.id} (${rg.name}): ${error.message}`);
            }
        }
        
        // Print summary
        log('');
        log('='.repeat(60));
        log('MIGRATION COMPLETE');
        log('='.repeat(60));
        log(`Mode: ${preview ? 'PREVIEW' : 'EXECUTED'}`);
        log('');
        log('Summary:');
        log(`  Total processed:    ${stats.processed}`);
        log(`  Updated:            ${stats.updated}`);
        log(`  Already set:        ${stats.alreadySet}`);
        log(`  Skipped (no dates): ${stats.skipped}`);
        log(`  No games:           ${stats.noGames}`);
        log(`  Errors:             ${stats.errors}`);
        log('');
        
        // Print sample of updates
        const updatedRecords = details.filter(d => d.status === 'UPDATED');
        if (updatedRecords.length > 0) {
            log('Sample of updated records:');
            updatedRecords.slice(0, 10).forEach(d => {
                log(`  ${d.name}: firstGameDate=${d.firstGameDate} (${d.gameCount} games)`);
            });
            if (updatedRecords.length > 10) {
                log(`  ... and ${updatedRecords.length - 10} more`);
            }
        }
        
        // Print errors if any
        const errorRecords = details.filter(d => d.status === 'ERROR');
        if (errorRecords.length > 0) {
            log('');
            log('Errors:');
            errorRecords.forEach(d => {
                log(`  ${d.id} (${d.name}): ${d.error}`);
            });
        }
        
        if (preview) {
            log('');
            log('This was a PREVIEW. Run with --execute to apply changes.');
        }
        
        return { stats, details };
        
    } catch (error) {
        log('FATAL ERROR:', error.message);
        console.error(error);
        process.exit(1);
    }
};

// ===================================================================
// ENTRY POINT
// ===================================================================

const argsConfig = parseArgs();

runMigration(argsConfig)
    .then(() => {
        log('');
        log('Done.');
        process.exit(0);
    })
    .catch(error => {
        log('Unexpected error:', error.message);
        console.error(error);
        process.exit(1);
    });
