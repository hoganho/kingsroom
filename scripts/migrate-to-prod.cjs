/**
 * ===================================================================
 * PRODUCTION MIGRATION SCRIPT
 * ===================================================================
 * 
 * PURPOSE:
 * Migrate seed data from CSV files to production DynamoDB tables
 * and copy S3 data from dev to prod bucket.
 * 
 * USAGE:
 * node migrate-to-prod.cjs [options]
 * 
 * OPTIONS:
 * --dry-run          Preview changes without writing
 * --csv-only         Only import CSV data to DynamoDB
 * --s3-only          Only copy S3 data
 * --table=<name>     Only migrate specific table (e.g., --table=Entity)
 * --skip-confirm     Skip confirmation prompts
 * 
 * EXAMPLES:
 * node migrate-to-prod.cjs --dry-run
 * node migrate-to-prod.cjs --csv-only --table=Entity
 * node migrate-to-prod.cjs --s3-only
 * node migrate-to-prod.cjs
 * 
 * ===================================================================
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, BatchWriteCommand, ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { S3Client, ListObjectsV2Command, CopyObjectCommand, HeadBucketCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ===================================================================
// CONFIGURATION
// ===================================================================

const CONFIG = {
    region: process.env.AWS_REGION || 'ap-southeast-2',
    
    // Source (dev) identifiers
    sourceAppId: 'ht3nugt6lvddpeeuwj3x6mkite',
    sourceEnv: 'dev',
    
    // Target (prod) identifiers
    targetAppId: 'ynuahifnznb5zddz727oiqnicy',
    targetEnv: 'prod',
    
    // S3 Buckets
    sourceS3Bucket: 'pokerpro-scraper-storage',
    targetS3Bucket: 'kingsroom-storage-prod',
    
    // CSV directory (relative to script or absolute)
    csvDirectory: process.env.CSV_DIRECTORY || './',
    
    // Tables to migrate
    tables: [
        'Entity',
        'SocialPost',
        'TournamentSeriesTitle',
        'SocialAccount',
        'TournamentSeries',
        'Venue'
    ],
    
    // Batch settings
    batchSize: 25,
    batchDelayMs: 100,
    
    // S3 copy settings
    s3BatchSize: 100,
    s3MaxConcurrent: 10
};

// ===================================================================
// INITIALIZE CLIENTS
// ===================================================================

const ddbClient = new DynamoDBClient({ region: CONFIG.region });
const docClient = DynamoDBDocumentClient.from(ddbClient, {
    marshallOptions: { 
        removeUndefinedValues: true,
        convertEmptyValues: true
    }
});

const s3Client = new S3Client({ region: CONFIG.region });

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function getSourceTableName(tableName) {
    return `${tableName}-${CONFIG.sourceAppId}-${CONFIG.sourceEnv}`;
}

function getTargetTableName(tableName) {
    return `${tableName}-${CONFIG.targetAppId}-${CONFIG.targetEnv}`;
}

function getCsvFileName(tableName) {
    return `${tableName}-${CONFIG.sourceAppId}-${CONFIG.sourceEnv}.csv`;
}

/**
 * Fields that should ALWAYS be strings (even if they look like numbers)
 */
const STRING_FIELDS = new Set([
    'id', 'entityId', 'venueId', 'accountId', 'socialAccountId', 'postId',
    'seriesId', 'tournamentId', 'gameId', 'playerId', 'userId', 'owner',
    '__typename', 'sourceUrl', 'url', 'name', 'title', 'description',
    'content', 'caption', 'permalink', 'mediaUrl', 'thumbnailUrl',
    'platformId', 'platformPostId', 'externalId',
    // Status fields
    'status', 'processingStatus', 'gameStatus', 'registrationStatus',
    // Date/time partition keys
    'postYearMonth', 'yearMonth', 'dateKey', 'monthKey', 'yearKey',
    // Other string fields that might look numeric
    'postType', 'mediaType', 'platform', 'type', 'category'
]);

/**
 * Fields that should ALWAYS be numbers
 */
const NUMBER_FIELDS = new Set([
    'likeCount', 'commentCount', 'shareCount', 'viewCount', 'repostCount',
    'followerCount', 'followingCount', 'postCount', 'engagementRate',
    'buyIn', 'prizepool', 'guaranteeAmount', 'totalEntries', 'playerCount',
    'sequence', 'order', 'sortOrder', 'position', 'rank'
]);

/**
 * Parse a CSV value, handling quoted strings and JSON
 */
function parseCSVValue(value, fieldName = '') {
    if (value === undefined || value === null || value === '') {
        return null;
    }
    
    // Remove surrounding quotes if present
    let cleaned = value.trim();
    if ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
        (cleaned.startsWith("'") && cleaned.endsWith("'"))) {
        cleaned = cleaned.slice(1, -1);
    }
    
    // Handle escaped quotes
    cleaned = cleaned.replace(/""/g, '"');
    
    // Check for special values
    if (cleaned === '' || cleaned === 'null' || cleaned === 'NULL') {
        return null;
    }
    
    if (cleaned === 'true' || cleaned === 'TRUE') {
        return true;
    }
    
    if (cleaned === 'false' || cleaned === 'FALSE') {
        return false;
    }
    
    // Force string fields to stay as strings
    if (STRING_FIELDS.has(fieldName) || fieldName.endsWith('Id') || fieldName.endsWith('ID')) {
        return cleaned;
    }
    
    // Force number fields to be numbers
    if (NUMBER_FIELDS.has(fieldName) || fieldName.endsWith('Count') || fieldName.endsWith('Amount')) {
        const num = parseFloat(cleaned);
        return isNaN(num) ? 0 : num;
    }
    
    // Try to parse as JSON (for arrays/objects)
    if ((cleaned.startsWith('[') && cleaned.endsWith(']')) ||
        (cleaned.startsWith('{') && cleaned.endsWith('}'))) {
        try {
            return JSON.parse(cleaned);
        } catch (e) {
            // Not valid JSON, return as string
        }
    }
    
    // For other fields, try to parse as number only if it looks like one
    if (/^-?\d+$/.test(cleaned)) {
        return parseInt(cleaned, 10);
    }
    
    if (/^-?\d+\.\d+$/.test(cleaned)) {
        return parseFloat(cleaned);
    }
    
    return cleaned;
}

/**
 * Parse CSV content handling multiline quoted fields
 * Returns array of rows, where each row is an array of field values
 */
function parseCSVContent(content) {
    const rows = [];
    let currentRow = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;
    
    while (i < content.length) {
        const char = content[i];
        const nextChar = content[i + 1];
        
        if (inQuotes) {
            if (char === '"') {
                if (nextChar === '"') {
                    // Escaped quote
                    currentField += '"';
                    i += 2;
                    continue;
                } else {
                    // End of quoted field
                    inQuotes = false;
                    i++;
                    continue;
                }
            } else {
                // Regular character inside quotes (including newlines)
                currentField += char;
                i++;
                continue;
            }
        } else {
            // Not in quotes
            if (char === '"') {
                // Start of quoted field
                inQuotes = true;
                i++;
                continue;
            } else if (char === ',') {
                // Field separator
                currentRow.push(currentField);
                currentField = '';
                i++;
                continue;
            } else if (char === '\n' || (char === '\r' && nextChar === '\n')) {
                // End of row
                currentRow.push(currentField);
                if (currentRow.length > 1 || currentRow[0] !== '') {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
                i += (char === '\r' && nextChar === '\n') ? 2 : 1;
                continue;
            } else if (char === '\r') {
                // Standalone \r - treat as newline
                currentRow.push(currentField);
                if (currentRow.length > 1 || currentRow[0] !== '') {
                    rows.push(currentRow);
                }
                currentRow = [];
                currentField = '';
                i++;
                continue;
            } else {
                currentField += char;
                i++;
                continue;
            }
        }
    }
    
    // Don't forget the last field/row
    if (currentField || currentRow.length > 0) {
        currentRow.push(currentField);
        if (currentRow.length > 1 || currentRow[0] !== '') {
            rows.push(currentRow);
        }
    }
    
    return rows;
}

/**
 * Read and parse CSV file
 */
function readCSVFile(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    
    const content = fs.readFileSync(filePath, 'utf-8');
    const rows = parseCSVContent(content);
    
    if (rows.length < 2) {
        return { headers: [], records: [] };
    }
    
    const headers = rows[0].map(h => h.trim());
    const recordsMap = new Map(); // Use Map to deduplicate by id
    
    // Find id column index
    const idIndex = headers.indexOf('id');
    if (idIndex === -1) {
        console.log(`     ⚠️  No 'id' column found in CSV`);
        return { headers, records: [] };
    }
    
    for (let i = 1; i < rows.length; i++) {
        const values = rows[i];
        
        // Skip rows that don't have enough columns
        if (values.length < headers.length * 0.5) {
            continue;
        }
        
        const record = {};
        
        for (let j = 0; j < headers.length; j++) {
            const header = headers[j];
            const rawValue = values[j];
            const value = parseCSVValue(rawValue, header);
            
            if (value !== null) {
                record[header] = value;
            }
        }
        
        // Only add records that have an id
        if (record.id) {
            recordsMap.set(record.id, record);
        }
    }
    
    const records = Array.from(recordsMap.values());
    const totalRows = rows.length - 1; // exclude header
    const duplicatesRemoved = totalRows - records.length;
    
    if (duplicatesRemoved > 0) {
        console.log(`     ⚠️  ${duplicatesRemoved} rows skipped (duplicates or missing id)`);
    }
    
    return { headers, records };
}

/**
 * Batch write items to DynamoDB
 */
async function batchWriteItems(tableName, items, dryRun = false) {
    let success = 0;
    let failed = 0;
    
    // Deduplicate items by id before processing
    const uniqueItems = Array.from(
        new Map(items.map(item => [item.id, item])).values()
    );
    
    if (uniqueItems.length < items.length) {
        console.log(`    ⚠️  Removed ${items.length - uniqueItems.length} duplicates before write`);
    }
    
    for (let i = 0; i < uniqueItems.length; i += CONFIG.batchSize) {
        const batch = uniqueItems.slice(i, i + CONFIG.batchSize);
        
        // Double-check batch has no duplicates
        const batchIds = new Set();
        const dedupedBatch = batch.filter(item => {
            if (batchIds.has(item.id)) return false;
            batchIds.add(item.id);
            return true;
        });
        
        if (dryRun) {
            console.log(`    [DRY RUN] Would write batch of ${dedupedBatch.length} items`);
            success += dedupedBatch.length;
            continue;
        }
        
        const writeRequests = dedupedBatch.map(item => ({
            PutRequest: { Item: item }
        }));
        
        try {
            let unprocessed = writeRequests;
            let retries = 0;
            const maxRetries = 3;
            
            while (unprocessed.length > 0 && retries < maxRetries) {
                const response = await docClient.send(new BatchWriteCommand({
                    RequestItems: { [tableName]: unprocessed }
                }));
                
                if (response.UnprocessedItems?.[tableName]?.length > 0) {
                    unprocessed = response.UnprocessedItems[tableName];
                    retries++;
                    await sleep(100 * Math.pow(2, retries));
                } else {
                    unprocessed = [];
                }
            }
            
            if (unprocessed.length > 0) {
                failed += unprocessed.length;
                success += dedupedBatch.length - unprocessed.length;
            } else {
                success += dedupedBatch.length;
            }
            
        } catch (error) {
            console.error(`    ❌ Batch write error: ${error.message}`);
            failed += dedupedBatch.length;
        }
        
        process.stdout.write(`\r    Written ${success} items...`);
        
        if (i + CONFIG.batchSize < uniqueItems.length) {
            await sleep(CONFIG.batchDelayMs);
        }
    }
    
    console.log(`\r    Written ${success} items, ${failed} failed`);
    return { success, failed };
}

/**
 * List all objects in S3 bucket
 */
async function listAllS3Objects(bucket, prefix = '') {
    const objects = [];
    let continuationToken = null;
    
    do {
        const params = {
            Bucket: bucket,
            Prefix: prefix,
            MaxKeys: 1000
        };
        
        if (continuationToken) {
            params.ContinuationToken = continuationToken;
        }
        
        const response = await s3Client.send(new ListObjectsV2Command(params));
        
        if (response.Contents) {
            objects.push(...response.Contents);
        }
        
        continuationToken = response.IsTruncated ? response.NextContinuationToken : null;
        
        process.stdout.write(`\r    Found ${objects.length} objects...`);
        
    } while (continuationToken);
    
    console.log(`\r    Found ${objects.length} total objects`);
    return objects;
}

/**
 * Copy S3 objects from source to target bucket
 */
async function copyS3Objects(objects, dryRun = false) {
    let success = 0;
    let failed = 0;
    let skipped = 0;
    
    // Process in batches with concurrency
    for (let i = 0; i < objects.length; i += CONFIG.s3MaxConcurrent) {
        const batch = objects.slice(i, i + CONFIG.s3MaxConcurrent);
        
        const copyPromises = batch.map(async (obj) => {
            // Skip directory markers
            if (obj.Key.endsWith('/')) {
                skipped++;
                return { status: 'skipped' };
            }
            
            if (dryRun) {
                return { status: 'success' };
            }
            
            try {
                await s3Client.send(new CopyObjectCommand({
                    Bucket: CONFIG.targetS3Bucket,
                    CopySource: encodeURIComponent(`${CONFIG.sourceS3Bucket}/${obj.Key}`),
                    Key: obj.Key
                }));
                return { status: 'success' };
            } catch (error) {
                console.error(`\n    ❌ Failed to copy ${obj.Key}: ${error.message}`);
                return { status: 'failed', key: obj.Key };
            }
        });
        
        const results = await Promise.all(copyPromises);
        
        results.forEach(result => {
            if (result.status === 'success') success++;
            else if (result.status === 'failed') failed++;
        });
        
        process.stdout.write(`\r    Copied ${success} objects, ${failed} failed, ${skipped} skipped...`);
        
        if (i + CONFIG.s3MaxConcurrent < objects.length) {
            await sleep(50);
        }
    }
    
    console.log(`\r    Copied ${success} objects, ${failed} failed, ${skipped} skipped    `);
    return { success, failed, skipped };
}

/**
 * Check if S3 bucket is accessible
 */
async function checkS3Bucket(bucket) {
    try {
        await s3Client.send(new HeadBucketCommand({ Bucket: bucket }));
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Prompt for confirmation
 */
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

// ===================================================================
// MIGRATION FUNCTIONS
// ===================================================================

/**
 * Migrate a single table from CSV to DynamoDB
 */
async function migrateTable(tableName, dryRun = false) {
    const csvFileName = getCsvFileName(tableName);
    const csvPath = path.join(CONFIG.csvDirectory, csvFileName);
    const targetTable = getTargetTableName(tableName);
    
    console.log(`\n  📋 Migrating ${tableName}`);
    console.log(`     Source CSV: ${csvFileName}`);
    console.log(`     Target Table: ${targetTable}`);
    
    // Read CSV
    const csvData = readCSVFile(csvPath);
    
    if (!csvData) {
        console.log(`     ⚠️  CSV file not found: ${csvPath}`);
        return { table: tableName, total: 0, success: 0, failed: 0, status: 'not_found' };
    }
    
    console.log(`     Found ${csvData.records.length} records`);
    
    if (csvData.records.length === 0) {
        console.log(`     ⚠️  No records to migrate`);
        return { table: tableName, total: 0, success: 0, failed: 0, status: 'empty' };
    }
    
    // Add/update timestamps and apply table-specific transformations
    const now = new Date().toISOString();
    const records = csvData.records.map(record => {
        const transformed = {
            ...record,
            __typename: tableName,
            updatedAt: record.updatedAt || now,
            createdAt: record.createdAt || now
        };
        
        // Special handling for SocialPost: set processingStatus to PENDING for reprocessing
        if (tableName === 'SocialPost') {
            transformed.processingStatus = 'PENDING';
            // Clear processing-related fields so they get reprocessed
            delete transformed.extractedGameDataId;
            delete transformed.linkedGameId;
            delete transformed.primaryLinkedGameId;
            delete transformed.processedAt;
            delete transformed.processingError;
            transformed.linkedGameCount = 0;
            transformed.hasUnverifiedLinks = false;
        }
        
        return transformed;
    });
    
    if (tableName === 'SocialPost') {
        console.log(`     ℹ️  Setting all SocialPost records to processingStatus: PENDING`);
    }
    
    // Write to DynamoDB
    const result = await batchWriteItems(targetTable, records, dryRun);
    
    return { 
        table: tableName, 
        total: records.length, 
        ...result, 
        status: result.failed > 0 ? 'partial' : 'success' 
    };
}

/**
 * Migrate all CSV files to DynamoDB
 */
async function migrateCSVData(dryRun = false, specificTable = null) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  CSV TO DYNAMODB MIGRATION');
    console.log('═══════════════════════════════════════════════════════════════');
    
    const tablesToMigrate = specificTable 
        ? CONFIG.tables.filter(t => t.toLowerCase() === specificTable.toLowerCase())
        : CONFIG.tables;
    
    if (tablesToMigrate.length === 0) {
        console.log(`\n  ❌ Table "${specificTable}" not found in configuration`);
        return [];
    }
    
    console.log(`\n  Tables to migrate: ${tablesToMigrate.join(', ')}`);
    console.log(`  CSV Directory: ${path.resolve(CONFIG.csvDirectory)}`);
    
    const results = [];
    
    for (const tableName of tablesToMigrate) {
        try {
            const result = await migrateTable(tableName, dryRun);
            results.push(result);
        } catch (error) {
            console.error(`     ❌ Error migrating ${tableName}: ${error.message}`);
            results.push({ 
                table: tableName, 
                total: 0, 
                success: 0, 
                failed: 0, 
                status: 'error',
                error: error.message 
            });
        }
    }
    
    return results;
}

/**
 * Migrate S3 data from dev to prod bucket
 */
async function migrateS3Data(dryRun = false) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  S3 BUCKET MIGRATION');
    console.log('═══════════════════════════════════════════════════════════════');
    
    console.log(`\n  Source Bucket: ${CONFIG.sourceS3Bucket}`);
    console.log(`  Target Bucket: ${CONFIG.targetS3Bucket}`);
    
    // Check bucket access
    console.log('\n  Checking bucket access...');
    
    const sourceAccessible = await checkS3Bucket(CONFIG.sourceS3Bucket);
    if (!sourceAccessible) {
        console.log(`  ❌ Cannot access source bucket: ${CONFIG.sourceS3Bucket}`);
        return { total: 0, success: 0, failed: 0, status: 'source_inaccessible' };
    }
    console.log(`    ✓ Source bucket accessible`);
    
    const targetAccessible = await checkS3Bucket(CONFIG.targetS3Bucket);
    if (!targetAccessible) {
        console.log(`  ❌ Cannot access target bucket: ${CONFIG.targetS3Bucket}`);
        return { total: 0, success: 0, failed: 0, status: 'target_inaccessible' };
    }
    console.log(`    ✓ Target bucket accessible`);
    
    // List all objects in source bucket
    console.log('\n  Listing objects in source bucket...');
    const objects = await listAllS3Objects(CONFIG.sourceS3Bucket);
    
    if (objects.length === 0) {
        console.log('  ⚠️  No objects found in source bucket');
        return { total: 0, success: 0, failed: 0, skipped: 0, status: 'empty' };
    }
    
    // Calculate total size
    const totalSize = objects.reduce((sum, obj) => sum + (obj.Size || 0), 0);
    const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
    console.log(`  Total size: ${totalSizeMB} MB`);
    
    // Copy objects
    console.log('\n  Copying objects...');
    const result = await copyS3Objects(objects, dryRun);
    
    return { 
        total: objects.length, 
        totalSizeMB,
        ...result, 
        status: result.failed > 0 ? 'partial' : 'success' 
    };
}

// ===================================================================
// MAIN
// ===================================================================

async function main() {
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  PRODUCTION DATA MIGRATION SCRIPT');
    console.log('═══════════════════════════════════════════════════════════════');
    
    // Parse arguments
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const csvOnly = args.includes('--csv-only');
    const s3Only = args.includes('--s3-only');
    const skipConfirm = args.includes('--skip-confirm');
    
    // Parse specific table argument
    const tableArg = args.find(arg => arg.startsWith('--table='));
    const specificTable = tableArg ? tableArg.split('=')[1] : null;
    
    if (dryRun) {
        console.log('\n  🔍 DRY RUN MODE - No changes will be made');
    } else {
        console.log('\n  ⚠️  PRODUCTION MIGRATION - Changes will be permanent!');
    }
    
    console.log('\n  📋 Configuration:');
    console.log(`     Region: ${CONFIG.region}`);
    console.log(`     Source: ${CONFIG.sourceAppId}-${CONFIG.sourceEnv}`);
    console.log(`     Target: ${CONFIG.targetAppId}-${CONFIG.targetEnv}`);
    console.log(`     CSV Directory: ${path.resolve(CONFIG.csvDirectory)}`);
    
    // Confirmation for production writes
    if (!dryRun && !skipConfirm) {
        console.log('\n');
        const confirmed = await confirm('  Are you sure you want to proceed with production migration?');
        if (!confirmed) {
            console.log('\n  Migration cancelled.');
            process.exit(0);
        }
    }
    
    const results = {
        csv: null,
        s3: null
    };
    
    try {
        // CSV Migration
        if (!s3Only) {
            results.csv = await migrateCSVData(dryRun, specificTable);
        }
        
        // S3 Migration
        if (!csvOnly) {
            results.s3 = await migrateS3Data(dryRun);
        }
        
        // Summary
        console.log('\n═══════════════════════════════════════════════════════════════');
        console.log('  MIGRATION SUMMARY');
        console.log('═══════════════════════════════════════════════════════════════');
        
        if (results.csv) {
            console.log('\n  📋 CSV to DynamoDB:');
            let totalRecords = 0;
            let totalSuccess = 0;
            let totalFailed = 0;
            
            results.csv.forEach(r => {
                const icon = r.status === 'success' ? '✓' : 
                            r.status === 'not_found' ? '⚠' :
                            r.status === 'empty' ? '○' : '✗';
                console.log(`     ${icon} ${r.table}: ${r.success}/${r.total} records`);
                totalRecords += r.total;
                totalSuccess += r.success;
                totalFailed += r.failed;
            });
            
            console.log(`     ─────────────────────────────`);
            console.log(`     Total: ${totalSuccess}/${totalRecords} records migrated`);
            if (totalFailed > 0) {
                console.log(`     Failed: ${totalFailed} records`);
            }
        }
        
        if (results.s3) {
            console.log('\n  📦 S3 Migration:');
            console.log(`     Total objects: ${results.s3.total}`);
            console.log(`     Total size: ${results.s3.totalSizeMB || 0} MB`);
            console.log(`     Copied: ${results.s3.success}`);
            console.log(`     Failed: ${results.s3.failed}`);
            console.log(`     Skipped: ${results.s3.skipped || 0}`);
        }
        
        if (dryRun) {
            console.log('\n  🔍 This was a DRY RUN - no changes were made');
            console.log('  Run without --dry-run to apply changes');
        } else {
            console.log('\n  ✅ Migration complete!');
        }
        
    } catch (error) {
        console.error('\n  ❌ Fatal error:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

// Run if executed directly
main();
