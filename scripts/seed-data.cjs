#!/usr/bin/env node
// ===================================================================
// Seed Data Script - Populates DynamoDB tables from CSV files
// ===================================================================

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { 
    DynamoDBDocumentClient, 
    BatchWriteCommand,
    ScanCommand,
    DeleteCommand 
} = require('@aws-sdk/lib-dynamodb');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

// ===================================================================
// CONFIGURATION
// ===================================================================

const CONFIG = {
    region: process.env.AWS_REGION || 'ap-southeast-2',
    tableSuffix: process.env.TABLE_SUFFIX || 'ht3nugt6lvddpeeuwj3x6mkite-dev',
    seedDataDir: process.env.SEED_DATA_DIR || path.join(__dirname, 'seed-data'),
    batchSize: 25, // DynamoDB batch write limit
    
    // Known tables and their key schemas
    tables: {
        'Entity': { partitionKey: 'id' },
        'SocialPost': { partitionKey: 'id' },
        'TournamentSeriesTitle': { partitionKey: 'id' },
        'SocialAccount': { partitionKey: 'id' },
        'TournamentSeries': { partitionKey: 'id' },
        'Venue': { partitionKey: 'id' },
    }
};

// ===================================================================
// ARGUMENT PARSING
// ===================================================================

const args = process.argv.slice(2);
const options = {
    dryRun: args.includes('--dry-run'),
    skipConfirm: args.includes('--skip-confirm'),
    clearFirst: args.includes('--clear-first'),
    table: null,
};

// Parse --table=<name> argument
const tableArg = args.find(arg => arg.startsWith('--table='));
if (tableArg) {
    options.table = tableArg.split('=')[1];
}

// ===================================================================
// AWS CLIENT SETUP
// ===================================================================

const dynamoClient = new DynamoDBClient({ region: CONFIG.region });
const docClient = DynamoDBDocumentClient.from(dynamoClient, {
    marshallOptions: {
        removeUndefinedValues: true,
        convertEmptyValues: true,
    },
});

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

function log(message, indent = 0) {
    const prefix = '  '.repeat(indent);
    console.log(`${prefix}${message}`);
}

function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        const nextChar = line[i + 1];
        
        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                // Escaped quote
                current += '"';
                i++;
            } else {
                // Toggle quote mode
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }
    values.push(current);
    
    return values;
}

// Fields that should always be treated as numbers (Int/Float in GraphQL)
const NUMERIC_FIELDS = new Set([
    // SocialPost Int fields
    'videoWidth', 'videoHeight', 'likeCount', 'commentCount', 'shareCount',
    'reactionCount', 'viewCount', 'linkedGameCount',
    // SocialPost Float fields
    'contentTypeConfidence',
    // SocialAccount Int fields
    'followerCount', 'followingCount', 'postCount', 'scrapeFrequencyMinutes',
    'consecutiveFailures',
    // SocialScrapeAttempt Int fields
    'durationMs', 'postsFound', 'newPostsAdded', 'postsUpdated',
    // Common Int fields across tables
    'buyIn', 'guarantee', 'entrants', 'prizePool', 'rake', 'fee',
    'order', 'position', 'amount', 'count', 'total', 'duration',
    'latitude', 'longitude', 'rating', 'score',
    // Amplify version field
    '_version', '__version'
]);

// Fields that should always be treated as strings (ID/String/AWSURL/AWSDateTime in GraphQL)
// Note: We also have a catch-all for fields ending in 'Id' below
const STRING_FIELDS = new Set([
    // All ID fields
    'id', 'entityId', 'venueId', 'seriesId', 'accountId', 'postId',
    'socialAccountId', 'linkedGameId', 'extractedGameDataId', 'primaryLinkedGameId',
    'targetAccountIds',
    // Platform-specific IDs (these are String! not ID! in schema)
    'platformPostId', 'platformAccountId', 'platformUserId',
    // Other String fields that might look like numbers
    'phone', 'postcode', 'zipCode', 'abn', 'acn',
    'postYearMonth', 'processingVersion',
    // DynamoDB/Amplify metadata
    '__typename'
]);

// Maximum safe integer in JavaScript
const MAX_SAFE_INTEGER = 9007199254740991;

function parseValue(value, header) {
    if (value === '' || value === null || value === undefined) {
        return null;
    }
    
    const trimmedValue = value.trim();
    
    // Handle JSON arrays and objects
    if ((trimmedValue.startsWith('[') && trimmedValue.endsWith(']')) || 
        (trimmedValue.startsWith('{') && trimmedValue.endsWith('}'))) {
        try {
            return JSON.parse(trimmedValue);
        } catch {
            return trimmedValue;
        }
    }
    
    // Handle booleans
    if (trimmedValue.toLowerCase() === 'true') return true;
    if (trimmedValue.toLowerCase() === 'false') return false;
    
    // Force string for known string fields
    if (STRING_FIELDS.has(header)) {
        return trimmedValue;
    }
    
    // Any field ending in 'Id' should be a string
    if (header.endsWith('Id')) {
        return trimmedValue;
    }
    
    // Force number for known numeric fields
    if (NUMERIC_FIELDS.has(header)) {
        // Check string length first for integers (MAX_SAFE_INTEGER has 16 digits)
        if (/^-?\d+$/.test(trimmedValue)) {
            const digits = trimmedValue.replace('-', '');
            if (digits.length > 15) {
                return trimmedValue;
            }
        }
        const num = Number(trimmedValue);
        if (!isNaN(num) && isFinite(num)) {
            // Keep as string if too large for safe integer
            if (Math.abs(num) > MAX_SAFE_INTEGER) {
                return trimmedValue;
            }
            return num;
        }
        // If it can't be parsed as number, return 0 for numeric fields
        return 0;
    }
    
    // For other fields, try to detect numbers
    // Match integers and decimals, including negative numbers
    if (/^-?\d+$/.test(trimmedValue)) {
        // Integer - check string length first (MAX_SAFE_INTEGER has 16 digits)
        // If more than 15 digits, keep as string to avoid precision loss
        const digits = trimmedValue.replace('-', '');
        if (digits.length > 15) {
            return trimmedValue;
        }
        const num = parseInt(trimmedValue, 10);
        if (!isNaN(num) && isFinite(num)) {
            // Double-check it's within safe range
            if (Math.abs(num) > MAX_SAFE_INTEGER) {
                return trimmedValue;
            }
            return num;
        }
    } else if (/^-?\d+\.\d+$/.test(trimmedValue)) {
        // Decimal
        const num = parseFloat(trimmedValue);
        if (!isNaN(num) && isFinite(num)) {
            return num;
        }
    }
    
    return trimmedValue;
}

async function readCSV(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    
    // Parse CSV properly handling multi-line quoted fields
    const records = [];
    let currentLine = '';
    let inQuotes = false;
    let headers = null;
    
    for (let i = 0; i < content.length; i++) {
        const char = content[i];
        
        if (char === '"') {
            // Check for escaped quote
            if (inQuotes && content[i + 1] === '"') {
                currentLine += '""';
                i++;
            } else {
                inQuotes = !inQuotes;
                currentLine += char;
            }
        } else if (char === '\n' && !inQuotes) {
            // End of record
            if (currentLine.trim()) {
                if (!headers) {
                    headers = parseCSVLine(currentLine);
                } else {
                    const values = parseCSVLine(currentLine);
                    const record = {};
                    
                    for (let j = 0; j < headers.length; j++) {
                        const header = headers[j].trim();
                        const value = parseValue(values[j], header);
                        
                        if (value !== null && value !== '') {
                            record[header] = value;
                        }
                    }
                    
                    if (record.id) {
                        records.push(record);
                    }
                }
            }
            currentLine = '';
        } else if (char === '\r') {
            // Skip carriage returns
            continue;
        } else {
            currentLine += char;
        }
    }
    
    // Handle last line if no trailing newline
    if (currentLine.trim() && headers) {
        const values = parseCSVLine(currentLine);
        const record = {};
        
        for (let j = 0; j < headers.length; j++) {
            const header = headers[j].trim();
            const value = parseValue(values[j], header);
            
            if (value !== null && value !== '') {
                record[header] = value;
            }
        }
        
        if (record.id) {
            records.push(record);
        }
    }
    
    // Deduplicate by ID (keep last occurrence)
    const seen = new Map();
    for (const record of records) {
        seen.set(record.id, record);
    }
    
    const dedupedRecords = Array.from(seen.values());
    
    if (dedupedRecords.length < records.length) {
        log(`   ⚠️  Removed ${records.length - dedupedRecords.length} duplicate records`);
    }
    
    return dedupedRecords;
}

async function prompt(question) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            resolve(answer.toLowerCase());
        });
    });
}

// ===================================================================
// DYNAMODB OPERATIONS
// ===================================================================

async function clearTable(tableName, keySchema) {
    log(`Clearing existing data from ${tableName}...`, 1);
    
    let totalDeleted = 0;
    let lastEvaluatedKey = undefined;
    
    do {
        // Scan for items
        const scanResult = await docClient.send(new ScanCommand({
            TableName: tableName,
            ProjectionExpression: 'id',
            ExclusiveStartKey: lastEvaluatedKey,
        }));
        
        const items = scanResult.Items || [];
        lastEvaluatedKey = scanResult.LastEvaluatedKey;
        
        // Delete items in batches
        for (const item of items) {
            await docClient.send(new DeleteCommand({
                TableName: tableName,
                Key: { [keySchema.partitionKey]: item.id },
            }));
            totalDeleted++;
        }
        
        if (items.length > 0) {
            process.stdout.write(`\r    Deleted ${totalDeleted} items...`);
        }
    } while (lastEvaluatedKey);
    
    if (totalDeleted > 0) {
        console.log(); // New line after progress
    }
    
    log(`✓ Cleared ${totalDeleted} items`, 1);
    return totalDeleted;
}

async function batchWriteItems(tableName, items) {
    // Ensure no duplicates in the entire set (defensive)
    const uniqueItems = [];
    const seenIds = new Set();
    for (const item of items) {
        if (!seenIds.has(item.id)) {
            seenIds.add(item.id);
            uniqueItems.push(item);
        }
    }
    
    if (uniqueItems.length < items.length) {
        log(`   ⚠️  Removed ${items.length - uniqueItems.length} duplicates before writing`, 0);
    }
    
    const batches = [];
    
    for (let i = 0; i < uniqueItems.length; i += CONFIG.batchSize) {
        batches.push(uniqueItems.slice(i, i + CONFIG.batchSize));
    }
    
    let totalWritten = 0;
    let failedItems = [];
    
    for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const putRequests = batch.map(item => ({
            PutRequest: { Item: item }
        }));
        
        try {
            const result = await docClient.send(new BatchWriteCommand({
                RequestItems: {
                    [tableName]: putRequests
                }
            }));
            
            // Handle unprocessed items
            if (result.UnprocessedItems && result.UnprocessedItems[tableName]) {
                const unprocessed = result.UnprocessedItems[tableName];
                failedItems.push(...unprocessed.map(r => r.PutRequest.Item));
            }
            
            totalWritten += batch.length;
            process.stdout.write(`\r    Progress: ${totalWritten}/${uniqueItems.length} items written...`);
            
            // Small delay to avoid throttling
            if (i < batches.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        } catch (error) {
            log(`\n    ⚠️  Batch write error: ${error.message}`, 1);
            failedItems.push(...batch);
        }
    }
    
    console.log(); // New line after progress
    
    // Retry failed items once
    if (failedItems.length > 0) {
        log(`⚠️  Retrying ${failedItems.length} failed items...`, 1);
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        for (const item of failedItems) {
            try {
                await docClient.send(new BatchWriteCommand({
                    RequestItems: {
                        [tableName]: [{ PutRequest: { Item: item } }]
                    }
                }));
            } catch (error) {
                log(`✗ Failed to write item ${item.id}: ${error.message}`, 2);
            }
        }
    }
    
    return totalWritten;
}

// ===================================================================
// MAIN SEEDING LOGIC
// ===================================================================

async function seedTable(tableName, records) {
    const fullTableName = `${tableName}-${CONFIG.tableSuffix}`;
    const keySchema = CONFIG.tables[tableName];
    
    log(`\n📊 Seeding ${tableName}`, 0);
    log(`Table: ${fullTableName}`, 1);
    log(`Records: ${records.length}`, 1);
    
    if (options.dryRun) {
        log(`[DRY RUN] Would write ${records.length} records`, 1);
        
        // Show sample record
        if (records.length > 0) {
            log(`Sample record:`, 1);
            const sample = records[0];
            const keys = Object.keys(sample).slice(0, 5);
            keys.forEach(key => {
                const value = typeof sample[key] === 'object' 
                    ? JSON.stringify(sample[key]).substring(0, 50) 
                    : String(sample[key]).substring(0, 50);
                log(`${key}: ${value}`, 2);
            });
            if (Object.keys(sample).length > 5) {
                log(`... and ${Object.keys(sample).length - 5} more fields`, 2);
            }
        }
        return { success: true, count: records.length };
    }
    
    try {
        // Clear table if requested
        if (options.clearFirst) {
            await clearTable(fullTableName, keySchema);
        }
        
        // Write records
        log(`Writing ${records.length} records...`, 1);
        const written = await batchWriteItems(fullTableName, records);
        
        log(`✓ Successfully seeded ${written} records`, 1);
        return { success: true, count: written };
    } catch (error) {
        log(`✗ Error seeding ${tableName}: ${error.message}`, 1);
        return { success: false, error: error.message };
    }
}

async function discoverCSVFiles() {
    const files = [];
    
    if (!fs.existsSync(CONFIG.seedDataDir)) {
        log(`❌ Seed data directory not found: ${CONFIG.seedDataDir}`);
        return files;
    }
    
    const entries = fs.readdirSync(CONFIG.seedDataDir);
    
    for (const tableName of Object.keys(CONFIG.tables)) {
        // Skip if specific table requested and this isn't it
        if (options.table && options.table !== tableName) {
            continue;
        }
        
        const csvFileName = `${tableName}-${CONFIG.tableSuffix}.csv`;
        const csvPath = path.join(CONFIG.seedDataDir, csvFileName);
        
        if (fs.existsSync(csvPath)) {
            files.push({
                tableName,
                csvFileName,
                csvPath,
            });
        }
    }
    
    return files;
}

async function main() {
    console.log('');
    
    // Display options
    if (options.dryRun) {
        log('🔍 DRY RUN MODE - No data will be written\n');
    }
    if (options.clearFirst) {
        log('⚠️  CLEAR FIRST MODE - Existing data will be deleted\n');
    }
    if (options.table) {
        log(`📋 Single table mode: ${options.table}\n`);
    }
    
    // Discover CSV files
    const csvFiles = await discoverCSVFiles();
    
    if (csvFiles.length === 0) {
        log('❌ No CSV files found to seed');
        log(`   Expected location: ${CONFIG.seedDataDir}`);
        log(`   Expected format: <TableName>-${CONFIG.tableSuffix}.csv`);
        process.exit(1);
    }
    
    log(`Found ${csvFiles.length} CSV file(s) to process:\n`);
    csvFiles.forEach(f => log(`  • ${f.csvFileName}`, 0));
    console.log('');
    
    // Confirmation prompt
    if (!options.skipConfirm && !options.dryRun) {
        const answer = await prompt('Proceed with seeding? (yes/no): ');
        if (answer !== 'yes' && answer !== 'y') {
            log('\n❌ Seeding cancelled');
            process.exit(0);
        }
    }
    
    // Process each CSV file
    const results = [];
    
    for (const file of csvFiles) {
        try {
            log(`\n📖 Reading ${file.csvFileName}...`);
            const records = await readCSV(file.csvPath);
            
            if (records.length === 0) {
                log(`   ⚠️  No records found in ${file.csvFileName}`);
                results.push({ table: file.tableName, success: false, error: 'No records' });
                continue;
            }
            
            log(`   Found ${records.length} records`);
            
            const result = await seedTable(file.tableName, records);
            results.push({ table: file.tableName, ...result });
        } catch (error) {
            log(`   ✗ Error processing ${file.csvFileName}: ${error.message}`);
            results.push({ table: file.tableName, success: false, error: error.message });
        }
    }
    
    // Summary
    console.log('\n');
    log('═══════════════════════════════════════════════════════════════');
    log('                        SUMMARY                                 ');
    log('═══════════════════════════════════════════════════════════════\n');
    
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);
    
    if (successful.length > 0) {
        log('✓ Successfully seeded:');
        successful.forEach(r => {
            log(`  • ${r.table}: ${r.count} records`, 0);
        });
    }
    
    if (failed.length > 0) {
        log('\n✗ Failed:');
        failed.forEach(r => {
            log(`  • ${r.table}: ${r.error}`, 0);
        });
    }
    
    console.log('\n');
    
    if (options.dryRun) {
        log('🔍 This was a DRY RUN - no data was written');
        log('   Remove --dry-run to execute the seeding\n');
    }
    
    process.exit(failed.length > 0 ? 1 : 0);
}

// Run
main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
