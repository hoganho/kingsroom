/**
 * Migration Script: Convert NOT_IN_USE to NOT_FOUND
 * 
 * This script:
 * 1. Finds ScrapeURL records with NOT_IN_USE status and updates to NOT_FOUND
 * 2. Fixes any NOT_FOUND records that incorrectly have doNotScrape=true
 * 3. (Optional) Reports any Game records with NOT_IN_USE status for review
 * 
 * Run this ONCE after deploying the code changes.
 * 
 * Usage:
 *   DRY_RUN=true node migrate-not-in-use-to-not-found.js [entityId]
 *   DRY_RUN=false node migrate-not-in-use-to-not-found.js [entityId]
 */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand, QueryCommand } = require("@aws-sdk/lib-dynamodb");

// Configuration
const SCRAPE_URL_TABLE = process.env.API_KINGSROOM_SCRAPEURLTABLE_NAME || 'ScrapeURL-ynuahifnznb5zddz727oiqnicy-prod';
const GAME_TABLE = process.env.API_KINGSROOM_GAMETABLE_NAME || 'Game-ynuahifnznb5zddz727oiqnicy-prod';
const DRY_RUN = process.env.DRY_RUN !== 'false';  // Default to dry run

// Statuses to migrate
const LEGACY_STATUSES = ['NOT_IN_USE', 'BLANK'];

// Initialize clients
const ddbClient = new DynamoDBClient({});
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient);

// ===================================================================
// STEP 1: Find and fix ScrapeURL records
// ===================================================================

async function findScrapeURLsToFix(entityId) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('STEP 1: Finding ScrapeURL records to fix');
    console.log('='.repeat(60));
    
    const recordsToFix = [];
    let lastEvaluatedKey = null;
    let scannedCount = 0;
    
    do {
        const scanParams = {
            TableName: SCRAPE_URL_TABLE,
        };
        
        if (entityId) {
            scanParams.FilterExpression = 'entityId = :entityId';
            scanParams.ExpressionAttributeValues = { ':entityId': entityId };
        }
        
        if (lastEvaluatedKey) {
            scanParams.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const result = await ddbDocClient.send(new ScanCommand(scanParams));
        scannedCount += result.ScannedCount || 0;
        
        for (const item of (result.Items || [])) {
            const lastStatus = (item.lastScrapeStatus || '').toUpperCase();
            const gameStatus = (item.gameStatus || '').toUpperCase();
            
            const needsStatusUpdate = LEGACY_STATUSES.includes(lastStatus) || 
                                      LEGACY_STATUSES.includes(gameStatus);
            
            // Also check for NOT_FOUND with incorrect doNotScrape
            const isNotFound = lastStatus === 'NOT_FOUND' || gameStatus === 'NOT_FOUND' || needsStatusUpdate;
            const hasIncorrectDoNotScrape = isNotFound && item.doNotScrape === true;
            
            if (needsStatusUpdate || hasIncorrectDoNotScrape) {
                recordsToFix.push({
                    id: item.id,
                    url: item.url,
                    tournamentId: item.tournamentId,
                    entityId: item.entityId,
                    lastScrapeStatus: item.lastScrapeStatus,
                    gameStatus: item.gameStatus,
                    doNotScrape: item.doNotScrape,
                    needsStatusUpdate,
                    hasIncorrectDoNotScrape
                });
            }
        }
        
        lastEvaluatedKey = result.LastEvaluatedKey;
        
        if (scannedCount % 1000 === 0) {
            console.log(`  Scanned ${scannedCount} records, found ${recordsToFix.length} to fix...`);
        }
        
    } while (lastEvaluatedKey);
    
    console.log(`\nScan complete. Scanned ${scannedCount} ScrapeURL records.`);
    console.log(`Found ${recordsToFix.length} records to fix:`);
    console.log(`  - Status updates needed: ${recordsToFix.filter(r => r.needsStatusUpdate).length}`);
    console.log(`  - doNotScrape fixes needed: ${recordsToFix.filter(r => r.hasIncorrectDoNotScrape).length}`);
    
    return recordsToFix;
}

async function fixScrapeURLRecord(record) {
    const now = new Date();
    
    const updateExpression = [];
    const expressionValues = {
        ':now': now.toISOString(),
        ':timestamp': now.getTime(),
        ':zero': 0,
        ':one': 1
    };
    const expressionNames = {
        '#lca': '_lastChangedAt',
        '#v': '_version'
    };
    
    // Update status if needed
    if (record.needsStatusUpdate) {
        updateExpression.push('lastScrapeStatus = :notFound');
        expressionValues[':notFound'] = 'NOT_FOUND';
        
        // Also update gameStatus if it was the legacy value
        if (LEGACY_STATUSES.includes((record.gameStatus || '').toUpperCase())) {
            updateExpression.push('gameStatus = :notFoundGame');
            expressionValues[':notFoundGame'] = 'NOT_FOUND';
        }
    }
    
    // Fix doNotScrape if needed
    if (record.hasIncorrectDoNotScrape) {
        updateExpression.push('doNotScrape = :false');
        expressionValues[':false'] = false;
    }
    
    // Add metadata updates
    updateExpression.push('updatedAt = :now');
    updateExpression.push('#lca = :timestamp');
    updateExpression.push('#v = if_not_exists(#v, :zero) + :one');
    updateExpression.push('migrationNote = :note');
    expressionValues[':note'] = `Migrated from ${record.lastScrapeStatus || record.gameStatus} to NOT_FOUND at ${now.toISOString()}`;
    
    try {
        await ddbDocClient.send(new UpdateCommand({
            TableName: SCRAPE_URL_TABLE,
            Key: { id: record.id },
            UpdateExpression: `SET ${updateExpression.join(', ')}`,
            ExpressionAttributeNames: expressionNames,
            ExpressionAttributeValues: expressionValues
        }));
        
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// ===================================================================
// STEP 2: Find Game records with legacy status (for review only)
// ===================================================================

async function findGamesWithLegacyStatus(entityId) {
    console.log(`\n${'='.repeat(60)}`);
    console.log('STEP 2: Finding Game records with legacy status (for review)');
    console.log('='.repeat(60));
    
    const gamesFound = [];
    let lastEvaluatedKey = null;
    let scannedCount = 0;
    
    do {
        const scanParams = {
            TableName: GAME_TABLE,
        };
        
        if (entityId) {
            scanParams.FilterExpression = 'entityId = :entityId';
            scanParams.ExpressionAttributeValues = { ':entityId': entityId };
        }
        
        if (lastEvaluatedKey) {
            scanParams.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        const result = await ddbDocClient.send(new ScanCommand(scanParams));
        scannedCount += result.ScannedCount || 0;
        
        for (const item of (result.Items || [])) {
            const gameStatus = (item.gameStatus || '').toUpperCase();
            
            if (LEGACY_STATUSES.includes(gameStatus) || gameStatus === 'NOT_FOUND') {
                gamesFound.push({
                    id: item.id,
                    tournamentId: item.tournamentId,
                    entityId: item.entityId,
                    name: item.name,
                    gameStatus: item.gameStatus
                });
            }
        }
        
        lastEvaluatedKey = result.LastEvaluatedKey;
        
        if (scannedCount % 1000 === 0) {
            console.log(`  Scanned ${scannedCount} Game records...`);
        }
        
    } while (lastEvaluatedKey);
    
    console.log(`\nScan complete. Scanned ${scannedCount} Game records.`);
    console.log(`Found ${gamesFound.length} Game records with legacy/NOT_FOUND status.`);
    
    if (gamesFound.length > 0) {
        console.log('\n⚠️  WARNING: These Game records should not exist for NOT_FOUND URLs.');
        console.log('Review these and consider deleting them manually:');
        gamesFound.slice(0, 20).forEach((g, i) => {
            console.log(`  ${i + 1}. ID ${g.tournamentId}: "${g.name}" (${g.gameStatus})`);
        });
        if (gamesFound.length > 20) {
            console.log(`  ... and ${gamesFound.length - 20} more`);
        }
    }
    
    return gamesFound;
}

// ===================================================================
// MAIN
// ===================================================================

async function main() {
    const entityId = process.argv[2] || null;
    
    console.log('='.repeat(60));
    console.log('NOT_IN_USE to NOT_FOUND Migration Script');
    console.log('='.repeat(60));
    console.log(`Entity: ${entityId || 'ALL'}`);
    console.log(`ScrapeURL Table: ${SCRAPE_URL_TABLE}`);
    console.log(`Game Table: ${GAME_TABLE}`);
    console.log(`Dry Run: ${DRY_RUN}`);
    
    // Step 1: Find and fix ScrapeURL records
    const scrapeURLsToFix = await findScrapeURLsToFix(entityId);
    
    if (scrapeURLsToFix.length > 0) {
        console.log('\nSample of ScrapeURL records to fix:');
        scrapeURLsToFix.slice(0, 10).forEach((r, i) => {
            const fixes = [];
            if (r.needsStatusUpdate) fixes.push(`${r.lastScrapeStatus || r.gameStatus} → NOT_FOUND`);
            if (r.hasIncorrectDoNotScrape) fixes.push('doNotScrape=true → false');
            console.log(`  ${i + 1}. ID ${r.tournamentId}: ${fixes.join(', ')}`);
        });
        if (scrapeURLsToFix.length > 10) {
            console.log(`  ... and ${scrapeURLsToFix.length - 10} more`);
        }
        
        if (!DRY_RUN) {
            console.log(`\nFixing ${scrapeURLsToFix.length} ScrapeURL records...`);
            
            let fixed = 0;
            let failed = 0;
            
            for (const record of scrapeURLsToFix) {
                const result = await fixScrapeURLRecord(record);
                if (result.success) {
                    fixed++;
                } else {
                    failed++;
                    console.error(`  ❌ Failed to fix ${record.id}: ${result.error}`);
                }
                
                if ((fixed + failed) % 100 === 0) {
                    console.log(`  Progress: ${fixed + failed}/${scrapeURLsToFix.length}`);
                }
            }
            
            console.log(`\nScrapeURL fixes complete:`);
            console.log(`  ✅ Fixed: ${fixed}`);
            console.log(`  ❌ Failed: ${failed}`);
        } else {
            console.log('\n⚠️  DRY RUN - No ScrapeURL changes made.');
        }
    } else {
        console.log('\n✅ No ScrapeURL records need fixing.');
    }
    
    // Step 2: Find Game records (for review only)
    const gamesWithLegacyStatus = await findGamesWithLegacyStatus(entityId);
    
    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('Migration Summary');
    console.log('='.repeat(60));
    console.log(`ScrapeURL records to fix: ${scrapeURLsToFix.length}`);
    console.log(`Game records with legacy status: ${gamesWithLegacyStatus.length}`);
    
    if (DRY_RUN) {
        console.log('\n⚠️  This was a DRY RUN. No changes were made.');
        console.log('Run with DRY_RUN=false to apply changes.');
    }
    
    if (gamesWithLegacyStatus.length > 0) {
        console.log('\n⚠️  Action required: Review and delete Game records with legacy status.');
        console.log('These should not exist for NOT_FOUND URLs.');
    }
}

main().catch(error => {
    console.error('\nMigration failed:', error);
    process.exit(1);
});