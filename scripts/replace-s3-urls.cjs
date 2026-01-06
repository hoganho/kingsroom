/**
 * ===================================================================
 * REPLACE S3 BUCKET URLS IN DYNAMODB TABLES
 * ===================================================================
 * 
 * Scans specified DynamoDB tables and replaces old S3 bucket URLs
 * with new bucket URLs in all string fields.
 * 
 * USAGE:
 *   node replace-s3-urls.cjs [--dry-run] [--table=TableName]
 * 
 * ===================================================================
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const readline = require('readline');

// ================================================================
// CONFIGURATION
// ================================================================

const CONFIG = {
    REGION: process.env.AWS_REGION || 'ap-southeast-2',
    
    // URL patterns to replace
    OLD_BUCKET_URL: 'https://pokerpro-scraper-storage.s3.ap-southeast-2.amazonaws.com',
    NEW_BUCKET_URL: 'https://kingsroom-storage-prod.s3.ap-southeast-2.amazonaws.com',
    
    // Also handle the s3:// format if present
    OLD_BUCKET_S3: 's3://pokerpro-scraper-storage',
    NEW_BUCKET_S3: 's3://kingsroom-storage-prod',
    
    // Environment suffix for prod tables
    ENV_SUFFIX: '-ynuahifnznb5zddz727oiqnicy-prod',
    
    // Tables to scan (add more as needed)
    TABLES: [
        'Entity',
        'Venue', 
        'SocialAccount',
        'SocialPost',
        'TournamentSeries',
        'TournamentSeriesTitle',
    ],
    
    // Rate limiting
    BATCH_DELAY_MS: 50,
};

// ================================================================
// SETUP CLIENTS
// ================================================================

const ddbClient = new DynamoDBClient({ region: CONFIG.REGION });
const docClient = DynamoDBDocumentClient.from(ddbClient, {
    marshallOptions: { removeUndefinedValues: true },
});

// ================================================================
// UTILITY FUNCTIONS
// ================================================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getTableName(baseName) {
    return `${baseName}${CONFIG.ENV_SUFFIX}`;
}

async function confirm(message) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise(resolve => {
        rl.question(`${message} (y/N): `, answer => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}

/**
 * Check if a value contains old bucket URL
 */
function containsOldUrl(value) {
    if (typeof value !== 'string') return false;
    return value.includes(CONFIG.OLD_BUCKET_URL) || value.includes(CONFIG.OLD_BUCKET_S3);
}

/**
 * Replace old bucket URL with new one
 */
function replaceUrl(value) {
    if (typeof value !== 'string') return value;
    return value
        .replace(new RegExp(escapeRegex(CONFIG.OLD_BUCKET_URL), 'g'), CONFIG.NEW_BUCKET_URL)
        .replace(new RegExp(escapeRegex(CONFIG.OLD_BUCKET_S3), 'g'), CONFIG.NEW_BUCKET_S3);
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Find all fields in a record that contain old URLs
 */
function findFieldsToUpdate(record) {
    const updates = {};
    
    for (const [key, value] of Object.entries(record)) {
        // Skip key fields
        if (key === 'id') continue;
        
        if (typeof value === 'string' && containsOldUrl(value)) {
            updates[key] = {
                oldValue: value,
                newValue: replaceUrl(value)
            };
        } else if (Array.isArray(value)) {
            // Check arrays of strings
            const hasOldUrl = value.some(item => typeof item === 'string' && containsOldUrl(item));
            if (hasOldUrl) {
                updates[key] = {
                    oldValue: value,
                    newValue: value.map(item => typeof item === 'string' ? replaceUrl(item) : item)
                };
            }
        }
    }
    
    return updates;
}

/**
 * Update a single record with new URLs
 */
async function updateRecord(tableName, recordId, updates, dryRun = false) {
    if (Object.keys(updates).length === 0) return false;
    
    if (dryRun) {
        return true;
    }
    
    // Build update expression
    const updateParts = [];
    const expressionNames = {};
    const expressionValues = {};
    
    let i = 0;
    for (const [field, { newValue }] of Object.entries(updates)) {
        const nameKey = `#f${i}`;
        const valueKey = `:v${i}`;
        
        updateParts.push(`${nameKey} = ${valueKey}`);
        expressionNames[nameKey] = field;
        expressionValues[valueKey] = newValue;
        i++;
    }
    
    // Add updatedAt
    updateParts.push('#updatedAt = :updatedAt');
    expressionNames['#updatedAt'] = 'updatedAt';
    expressionValues[':updatedAt'] = new Date().toISOString();
    
    try {
        await docClient.send(new UpdateCommand({
            TableName: tableName,
            Key: { id: recordId },
            UpdateExpression: `SET ${updateParts.join(', ')}`,
            ExpressionAttributeNames: expressionNames,
            ExpressionAttributeValues: expressionValues,
        }));
        return true;
    } catch (error) {
        console.error(`    ❌ Failed to update ${recordId}: ${error.message}`);
        return false;
    }
}

/**
 * Process a single table
 */
async function processTable(baseName, dryRun = false) {
    const tableName = getTableName(baseName);
    console.log(`\n📋 Processing ${baseName}`);
    console.log(`   Table: ${tableName}`);
    
    let scannedCount = 0;
    let recordsWithUrls = 0;
    let fieldsUpdated = 0;
    let updatesFailed = 0;
    let lastEvaluatedKey = null;
    
    const affectedRecords = [];
    
    do {
        const params = {
            TableName: tableName,
            Limit: 100,
        };
        
        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }
        
        try {
            const result = await docClient.send(new ScanCommand(params));
            
            for (const record of result.Items || []) {
                scannedCount++;
                
                const updates = findFieldsToUpdate(record);
                
                if (Object.keys(updates).length > 0) {
                    recordsWithUrls++;
                    fieldsUpdated += Object.keys(updates).length;
                    
                    affectedRecords.push({
                        id: record.id,
                        fields: Object.keys(updates),
                        updates
                    });
                    
                    const success = await updateRecord(tableName, record.id, updates, dryRun);
                    if (!success && !dryRun) {
                        updatesFailed++;
                    }
                }
            }
            
            lastEvaluatedKey = result.LastEvaluatedKey;
            
            process.stdout.write(`\r   Scanned ${scannedCount} records, found ${recordsWithUrls} with old URLs...`);
            
            await sleep(CONFIG.BATCH_DELAY_MS);
            
        } catch (error) {
            console.error(`\n   ❌ Scan error: ${error.message}`);
            break;
        }
        
    } while (lastEvaluatedKey);
    
    console.log(`\r   Scanned ${scannedCount} records                                    `);
    console.log(`   Records with old URLs: ${recordsWithUrls}`);
    console.log(`   Fields to update: ${fieldsUpdated}`);
    
    if (dryRun && affectedRecords.length > 0) {
        console.log(`\n   Sample affected records:`);
        affectedRecords.slice(0, 3).forEach(r => {
            console.log(`     - ${r.id}`);
            Object.entries(r.updates).forEach(([field, { oldValue, newValue }]) => {
                const oldShort = oldValue.length > 60 ? oldValue.substring(0, 60) + '...' : oldValue;
                console.log(`       ${field}: ${oldShort}`);
            });
        });
        if (affectedRecords.length > 3) {
            console.log(`     ... and ${affectedRecords.length - 3} more`);
        }
    }
    
    if (!dryRun && updatesFailed > 0) {
        console.log(`   ⚠️  Failed updates: ${updatesFailed}`);
    }
    
    return {
        table: baseName,
        scanned: scannedCount,
        recordsUpdated: recordsWithUrls,
        fieldsUpdated,
        failed: updatesFailed
    };
}

// ================================================================
// MAIN
// ================================================================

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    
    // Parse specific table argument
    const tableArg = args.find(arg => arg.startsWith('--table='));
    const specificTable = tableArg ? tableArg.split('=')[1] : null;
    
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║     REPLACE S3 BUCKET URLS IN DYNAMODB                        ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    
    console.log('\n  URL Replacement:');
    console.log(`    Old: ${CONFIG.OLD_BUCKET_URL}`);
    console.log(`    New: ${CONFIG.NEW_BUCKET_URL}`);
    
    if (dryRun) {
        console.log('\n  🔍 DRY RUN MODE - No changes will be made');
    } else {
        console.log('\n  ⚠️  This will modify PRODUCTION data!');
        const confirmed = await confirm('\n  Are you sure you want to proceed?');
        if (!confirmed) {
            console.log('\n  Cancelled.');
            process.exit(0);
        }
    }
    
    const tablesToProcess = specificTable 
        ? CONFIG.TABLES.filter(t => t.toLowerCase() === specificTable.toLowerCase())
        : CONFIG.TABLES;
    
    if (tablesToProcess.length === 0) {
        console.log(`\n  ❌ Table "${specificTable}" not found in configuration`);
        process.exit(1);
    }
    
    console.log(`\n  Tables to process: ${tablesToProcess.join(', ')}`);
    
    const results = [];
    
    for (const table of tablesToProcess) {
        try {
            const result = await processTable(table, dryRun);
            results.push(result);
        } catch (error) {
            console.error(`\n  ❌ Error processing ${table}: ${error.message}`);
            results.push({
                table,
                scanned: 0,
                recordsUpdated: 0,
                fieldsUpdated: 0,
                failed: 0,
                error: error.message
            });
        }
    }
    
    // Summary
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    
    let totalRecords = 0;
    let totalFields = 0;
    let totalFailed = 0;
    
    results.forEach(r => {
        const status = r.error ? '✗' : (r.recordsUpdated > 0 ? '✓' : '○');
        console.log(`  ${status} ${r.table}: ${r.recordsUpdated} records, ${r.fieldsUpdated} fields`);
        totalRecords += r.recordsUpdated;
        totalFields += r.fieldsUpdated;
        totalFailed += r.failed;
    });
    
    console.log(`  ─────────────────────────────────`);
    console.log(`  Total: ${totalRecords} records, ${totalFields} fields`);
    
    if (totalFailed > 0) {
        console.log(`  Failed: ${totalFailed}`);
    }
    
    if (dryRun) {
        console.log('\n  🔍 This was a DRY RUN - no changes were made');
        console.log('  Run without --dry-run to apply changes');
    } else {
        console.log('\n  ✅ URL replacement complete!');
    }
}

main().catch(error => {
    console.error('\n  ❌ Fatal error:', error);
    process.exit(1);
});
