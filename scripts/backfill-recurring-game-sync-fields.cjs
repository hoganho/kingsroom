#!/usr/bin/env node
// scripts/backfill-recurring-game-sync-fields.js
// 
// This script backfills missing _version and _lastChangedAt fields in the RecurringGame table.
// These fields are required by AppSync/DataStore for sync operations.
//
// Usage:
//   node scripts/backfill-recurring-game-sync-fields.js [--dry-run]
//
// Options:
//   --dry-run    Show what would be updated without making changes
//
// Environment:
//   Requires AWS credentials with DynamoDB access
//   Set AWS_REGION if not using default

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

// ============================================================================
// CONFIGURATION
// ============================================================================

// Table name - update this to match your environment
const TABLE_NAME = process.env.RECURRING_GAME_TABLE || 'RecurringGame-ht3nugt6lvddpeeuwj3x6mkite-dev';

// Check for dry run flag
const isDryRun = process.argv.includes('--dry-run');

// ============================================================================
// INITIALIZE CLIENTS
// ============================================================================

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(client);

// ============================================================================
// MAIN FUNCTIONS
// ============================================================================

async function scanAllRecurringGames() {
    const items = [];
    let lastEvaluatedKey = undefined;

    do {
        const command = new ScanCommand({
            TableName: TABLE_NAME,
            ExclusiveStartKey: lastEvaluatedKey
        });

        const response = await docClient.send(command);
        items.push(...(response.Items || []));
        lastEvaluatedKey = response.LastEvaluatedKey;

        console.log(`Scanned ${items.length} items so far...`);
    } while (lastEvaluatedKey);

    return items;
}

async function updateRecord(id, updates) {
    const now = Date.now();
    
    const command = new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id },
        UpdateExpression: 'SET #version = :version, #lastChangedAt = :lastChangedAt, #updatedAt = :updatedAt',
        ExpressionAttributeNames: {
            '#version': '_version',
            '#lastChangedAt': '_lastChangedAt',
            '#updatedAt': 'updatedAt'
        },
        ExpressionAttributeValues: {
            ':version': updates._version,
            ':lastChangedAt': updates._lastChangedAt,
            ':updatedAt': new Date(now).toISOString()
        },
        ReturnValues: 'ALL_NEW'
    });

    return docClient.send(command);
}

async function backfillSyncFields() {
    console.log('='.repeat(60));
    console.log('RecurringGame Sync Fields Backfill Script');
    console.log('='.repeat(60));
    console.log(`Table: ${TABLE_NAME}`);
    console.log(`Mode: ${isDryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
    console.log('');

    // Step 1: Scan all records
    console.log('Scanning all RecurringGame records...');
    const allGames = await scanAllRecurringGames();
    console.log(`Found ${allGames.length} total records\n`);

    // Step 2: Find records missing sync fields
    const recordsToFix = allGames.filter(game => {
        const missingVersion = game._version === undefined || game._version === null || game._version === '';
        const missingLastChanged = game._lastChangedAt === undefined || game._lastChangedAt === null || game._lastChangedAt === '';
        return missingVersion || missingLastChanged;
    });

    console.log(`Found ${recordsToFix.length} records with missing sync fields:\n`);

    if (recordsToFix.length === 0) {
        console.log('✅ All records already have sync fields populated!');
        return;
    }

    // Step 3: Display records to be fixed
    console.log('Records to be updated:');
    console.log('-'.repeat(60));
    recordsToFix.forEach((game, idx) => {
        console.log(`${idx + 1}. ${game.name || 'Unnamed'}`);
        console.log(`   ID: ${game.id}`);
        console.log(`   Current _version: ${game._version || '(empty)'}`);
        console.log(`   Current _lastChangedAt: ${game._lastChangedAt || '(empty)'}`);
        console.log(`   Venue: ${game.venueId || 'None'}`);
        console.log('');
    });

    // Step 4: Perform updates
    if (isDryRun) {
        console.log('\n🔍 DRY RUN - No changes made.');
        console.log('Run without --dry-run to apply changes.');
        return;
    }

    console.log('\nApplying updates...');
    console.log('-'.repeat(60));

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const game of recordsToFix) {
        const now = Date.now();
        
        try {
            await updateRecord(game.id, {
                _version: 1,
                _lastChangedAt: now
            });

            successCount++;
            console.log(`✅ Updated: ${game.name || game.id}`);
        } catch (error) {
            errorCount++;
            errors.push({ id: game.id, name: game.name, error: error.message });
            console.log(`❌ Failed: ${game.name || game.id} - ${error.message}`);
        }
    }

    // Step 5: Summary
    console.log('\n' + '='.repeat(60));
    console.log('SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total records scanned: ${allGames.length}`);
    console.log(`Records needing update: ${recordsToFix.length}`);
    console.log(`Successfully updated: ${successCount}`);
    console.log(`Failed: ${errorCount}`);

    if (errors.length > 0) {
        console.log('\nErrors:');
        errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
    }

    console.log('\n✅ Backfill complete!');
}

// ============================================================================
// RUN SCRIPT
// ============================================================================

backfillSyncFields()
    .then(() => {
        console.log('\nScript finished.');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script failed:', error);
        process.exit(1);
    });
