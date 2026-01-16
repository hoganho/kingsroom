#!/usr/bin/env node
/**
 * fix-total-duration.mjs
 * 
 * Fixes the totalDuration field in the Game table where it was incorrectly
 * stored as a String instead of an Int. This causes GraphQL serialization errors:
 * "Can't serialize value (/getGame/totalDuration): Expected type 'Int' but was 'String'."
 * 
 * The script will:
 * - Convert numeric strings (e.g., "3600") to integers
 * - Convert empty strings ("") to null
 * - Convert non-numeric strings to null
 * - Leave valid integers and null values unchanged
 * 
 * Run: node fix-total-duration.mjs [--dry-run] [--entity-id ID]
 * 
 * Options:
 *   --dry-run     Show what would be done without making changes
 *   --entity-id   Only process games for a specific entity
 *   --limit       Maximum number of games to process (default: all)
 *   --verbose     Show detailed progress
 * 
 * Prerequisites:
 * - AWS credentials configured
 * - npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name) => {
    const idx = args.indexOf(`--${name}`);
    return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
};

const CONFIG = {
    region: getArg('region') || process.env.AWS_REGION || 'ap-southeast-2',
    apiId: getArg('api-id') || process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT || 'ynuahifnznb5zddz727oiqnicy',
    env: getArg('env') || process.env.ENV || 'prod',
};

const ENTITY_ID = getArg('entity-id') || null;
const LIMIT = getArg('limit') ? parseInt(getArg('limit'), 10) : null;
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose') || args.includes('-v');

const getTableName = (modelName) => `${modelName}-${CONFIG.apiId}-${CONFIG.env}`;

const client = new DynamoDBClient({ region: CONFIG.region });
const docClient = DynamoDBDocumentClient.from(client);

// Stats
const stats = {
    gamesScanned: 0,
    gamesWithStringDuration: 0,
    convertedToInt: 0,
    convertedToNull: 0,
    alreadyCorrect: 0,
    errors: 0
};

// Track specific conversions for summary
const conversions = {
    emptyStringToNull: 0,
    numericStringToInt: 0,
    invalidStringToNull: 0
};

/**
 * Determines if a value needs fixing and what the fixed value should be
 */
function analyzeTotalDuration(value) {
    // null is correct
    if (value === null || value === undefined) {
        return { needsFix: false, newValue: null, reason: 'already_null' };
    }
    
    // Valid integer is correct
    if (typeof value === 'number' && Number.isInteger(value)) {
        return { needsFix: false, newValue: value, reason: 'already_int' };
    }
    
    // String needs fixing
    if (typeof value === 'string') {
        // Empty string -> null
        if (value === '' || value.trim() === '') {
            return { needsFix: true, newValue: null, reason: 'empty_string' };
        }
        
        // Numeric string -> integer
        const parsed = parseInt(value, 10);
        if (!isNaN(parsed) && parsed.toString() === value.trim()) {
            return { needsFix: true, newValue: parsed, reason: 'numeric_string' };
        }
        
        // Non-numeric string -> null
        return { needsFix: true, newValue: null, reason: 'invalid_string' };
    }
    
    // Float -> round to integer
    if (typeof value === 'number') {
        return { needsFix: true, newValue: Math.round(value), reason: 'float_to_int' };
    }
    
    // Unknown type -> null
    return { needsFix: true, newValue: null, reason: 'unknown_type' };
}

/**
 * Updates a game record with the fixed totalDuration value
 */
async function fixGameDuration(game, analysis) {
    const tableName = getTableName('Game');
    const now = new Date().toISOString();
    
    try {
        if (!DRY_RUN) {
            if (analysis.newValue === null) {
                // Remove the attribute entirely for null values
                await docClient.send(new UpdateCommand({
                    TableName: tableName,
                    Key: { id: game.id },
                    UpdateExpression: 'REMOVE totalDuration SET updatedAt = :now',
                    ExpressionAttributeValues: {
                        ':now': now
                    }
                }));
            } else {
                // Set the integer value
                await docClient.send(new UpdateCommand({
                    TableName: tableName,
                    Key: { id: game.id },
                    UpdateExpression: 'SET totalDuration = :duration, updatedAt = :now',
                    ExpressionAttributeValues: {
                        ':duration': analysis.newValue,
                        ':now': now
                    }
                }));
            }
        }
        
        // Update stats
        if (analysis.newValue === null) {
            stats.convertedToNull++;
            if (analysis.reason === 'empty_string') conversions.emptyStringToNull++;
            else if (analysis.reason === 'invalid_string') conversions.invalidStringToNull++;
        } else {
            stats.convertedToInt++;
            if (analysis.reason === 'numeric_string') conversions.numericStringToInt++;
        }
        
        if (VERBOSE) {
            const oldVal = JSON.stringify(game.totalDuration);
            const newVal = analysis.newValue === null ? 'null' : analysis.newValue;
            console.log(`   ✅ ${game.id.slice(0, 8)} | ${oldVal} → ${newVal} (${analysis.reason})`);
        }
        
        return true;
    } catch (error) {
        console.error(`   ❌ Error updating ${game.id}: ${error.message}`);
        stats.errors++;
        return false;
    }
}

/**
 * Process a single game record
 */
async function processGame(game) {
    stats.gamesScanned++;
    
    const analysis = analyzeTotalDuration(game.totalDuration);
    
    if (!analysis.needsFix) {
        stats.alreadyCorrect++;
        if (VERBOSE && game.totalDuration !== null && game.totalDuration !== undefined) {
            console.log(`   ⏭️  ${game.id.slice(0, 8)} | Already correct: ${game.totalDuration}`);
        }
        return;
    }
    
    stats.gamesWithStringDuration++;
    await fixGameDuration(game, analysis);
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         Fix totalDuration Field Type Migration             ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n🔧 Configuration:`);
    console.log(`   Environment: ${CONFIG.env}`);
    console.log(`   API ID: ${CONFIG.apiId}`);
    console.log(`   Region: ${CONFIG.region}`);
    console.log(`   Entity filter: ${ENTITY_ID || '(all entities)'}`);
    console.log(`   Limit: ${LIMIT || '(no limit)'}`);
    console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN (no changes)' : '⚡ LIVE (will update records)'}`);
    
    if (!DRY_RUN) {
        console.log('\n⚠️  WARNING: This will update records in your Game table!');
        console.log('   Press Ctrl+C within 5 seconds to cancel...\n');
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Scan Game table
    console.log(`\n📥 Scanning Game table for totalDuration issues...`);
    
    const tableName = getTableName('Game');
    let lastKey = null;
    let totalProcessed = 0;
    
    do {
        const params = {
            TableName: tableName,
            ProjectionExpression: 'id, #name, totalDuration, entityId',
            ExpressionAttributeNames: { '#name': 'name' },
            Limit: 100
        };
        
        if (ENTITY_ID) {
            params.FilterExpression = 'entityId = :entityId';
            params.ExpressionAttributeValues = { ':entityId': ENTITY_ID };
        }
        
        if (lastKey) {
            params.ExclusiveStartKey = lastKey;
        }
        
        try {
            const result = await docClient.send(new ScanCommand(params));
            const games = result.Items || [];
            
            for (const game of games) {
                await processGame(game);
                totalProcessed++;
                
                if (LIMIT && totalProcessed >= LIMIT) break;
                
                if (totalProcessed % 100 === 0) {
                    process.stdout.write(`   Processed ${totalProcessed} games...\r`);
                }
            }
            
            lastKey = result.LastEvaluatedKey;
            
            if (LIMIT && totalProcessed >= LIMIT) break;
            
        } catch (error) {
            console.error(`\n❌ Error scanning: ${error.message}`);
            break;
        }
    } while (lastKey);
    
    // Summary
    console.log(`\n\n${'═'.repeat(60)}`);
    console.log(`📊 MIGRATION ${DRY_RUN ? 'PREVIEW' : 'RESULTS'}`);
    console.log(`${'═'.repeat(60)}`);
    
    console.log(`\n📈 Summary:`);
    console.log(`   Games scanned: ${stats.gamesScanned}`);
    console.log(`   Already correct: ${stats.alreadyCorrect}`);
    console.log(`   Needed fixing: ${stats.gamesWithStringDuration}`);
    
    if (stats.gamesWithStringDuration > 0) {
        console.log(`\n🔄 Conversions:`);
        console.log(`   Empty string → null: ${conversions.emptyStringToNull}`);
        console.log(`   Numeric string → int: ${conversions.numericStringToInt}`);
        console.log(`   Invalid string → null: ${conversions.invalidStringToNull}`);
        console.log(`\n   Total converted to null: ${stats.convertedToNull}`);
        console.log(`   Total converted to int: ${stats.convertedToInt}`);
    }
    
    if (stats.errors > 0) {
        console.log(`\n❌ Errors: ${stats.errors}`);
    }
    
    console.log(`\n${'═'.repeat(60)}`);
    if (DRY_RUN) {
        console.log(`🔍 DRY RUN complete. ${stats.gamesWithStringDuration} records would be updated.`);
        console.log(`   Run without --dry-run to apply changes.`);
    } else {
        console.log(`✅ MIGRATION complete. ${stats.convertedToNull + stats.convertedToInt} records updated.`);
    }
    console.log(`${'═'.repeat(60)}`);
    
    process.exit(stats.errors > 0 ? 1 : 0);
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
