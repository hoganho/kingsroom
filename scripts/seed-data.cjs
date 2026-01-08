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

function parseValue(value, header) {
    if (value === '' || value === null || value === undefined) {
        return null;
    }
    
    // Handle JSON arrays and objects
    if ((value.startsWith('[') && value.endsWith(']')) || 
        (value.startsWith('{') && value.endsWith('}'))) {
        try {
            return JSON.parse(value);
        } catch {
            return value;
        }
    }
    
    // Handle booleans
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    
    // Handle numbers (but not strings that look like numbers with leading zeros)
    if (/^-?\d+\.?\d*$/.test(value) && !value.startsWith('0') || value === '0') {
        const num = Number(value);
        if (!isNaN(num) && isFinite(num)) {
            return num;
        }
    }
    
    return value;
}

async function readCSV(filePath) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
        return [];
    }
    
    const headers = parseCSVLine(lines[0]);
    const records = [];
    
    for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        const record = {};
        
        for (let j = 0; j < headers.length; j++) {
            const header = headers[j].trim();
            const value = parseValue(values[j], header);
            
            if (value !== null && value !== '') {
                record[header] = value;
            }
        }
        
        // Only add records that have at least an id
        if (record.id) {
            records.push(record);
        }
    }
    
    return records;
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
    const batches = [];
    
    for (let i = 0; i < items.length; i += CONFIG.batchSize) {
        batches.push(items.slice(i, i + CONFIG.batchSize));
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
            process.stdout.write(`\r    Progress: ${totalWritten}/${items.length} items written...`);
            
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
