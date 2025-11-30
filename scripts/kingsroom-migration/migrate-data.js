#!/usr/bin/env node
/**
 * KingsRoom Data Migration Script
 * 
 * Migrates data from CSV exports to new DynamoDB tables.
 * Preserves original IDs to maintain relationships.
 * 
 * Usage:
 *   node migrate-data.js
 * 
 * Prerequisites:
 *   - AWS CLI configured with appropriate credentials
 *   - Node.js installed
 *   - CSV files in same directory or update paths below
 */

const { DynamoDBClient, PutItemCommand, BatchWriteItemCommand } = require('@aws-sdk/client-dynamodb');
const { marshall } = require('@aws-sdk/util-dynamodb');
const fs = require('fs');
const path = require('path');

// ============================================
// CONFIGURATION - UPDATE THESE VALUES
// ============================================

const CONFIG = {
  region: 'ap-southeast-2',
  
  // Table names using your GraphQL API ID: sjyzke3u45golhnttlco6bpcua
  tables: {
    Entity: 'Entity-sjyzke3u45golhnttlco6bpcua-dev',
    Venue: 'Venue-sjyzke3u45golhnttlco6bpcua-dev',
    TournamentSeriesTitle: 'TournamentSeriesTitle-sjyzke3u45golhnttlco6bpcua-dev',
    SocialAccount: 'SocialAccount-sjyzke3u45golhnttlco6bpcua-dev',
    S3Storage: 'S3Storage-sjyzke3u45golhnttlco6bpcua-dev',
  },
  
  // CSV file paths
  csvFiles: {
    Entity: './Entity-oi5oitkajrgtzm7feellfluriy-dev.csv',
    Venue: './Venue-oi5oitkajrgtzm7feellfluriy-dev.csv',
    TournamentSeriesTitle: './TournamentSeriesTitle-oi5oitkajrgtzm7feellfluriy-dev.csv',
    SocialAccount: './SocialAccount-oi5oitkajrgtzm7feellfluriy-dev.csv',
    S3Storage: './S3Storage-oi5oitkajrgtzm7feellfluriy-dev.csv',
  },
  
  // Dry run mode - set to false to actually write data
  dryRun: false,
  
  // Batch size for writes (max 25 for DynamoDB)
  batchSize: 25,
};

// ============================================
// CSV PARSER
// ============================================

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) return [];
  
  // Parse header
  const headers = parseCSVLine(lines[0]);
  
  // Parse data rows
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length !== headers.length) {
      console.warn(`Skipping malformed row ${i + 1}: expected ${headers.length} columns, got ${values.length}`);
      continue;
    }
    
    const row = {};
    headers.forEach((header, index) => {
      row[header] = values[index];
    });
    rows.push(row);
  }
  
  return rows;
}

function parseCSVLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // Skip next quote
      } else {
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

// ============================================
// DATA TRANSFORMATION
// ============================================

function transformForDynamoDB(row, modelType) {
  const item = {};
  const now = new Date().toISOString();
  
  for (const [key, value] of Object.entries(row)) {
    // Skip empty values
    if (value === '' || value === undefined || value === null) continue;
    
    // Skip old internal fields (we'll add new ones)
    if (key === '__typename' || key === '_lastChangedAt') continue;
    
    // Handle special fields
    if (key === '_version') {
      // Reset version to 1 for new records
      item['_version'] = 1;
    } else if (key === 'isActive' || key === 'isSpecial' || key === 'isScrapingEnabled' || 
               key === 'hasFullHistory' || key === 'hasPostAccess' || key === 'isManualUpload' ||
               key === 'dataExtracted' || key === 'isParsed') {
      // Boolean fields
      item[key] = value.toLowerCase() === 'true';
    } else if (key === 'venueNumber' || key === 'followerCount' || key === 'scrapeFrequencyMinutes' ||
               key === 'consecutiveFailures' || key === 'postCount' || key === 'tournamentId' ||
               key === 'contentSize' || key === 'dataChangeCount' || key === 'parseCount') {
      // Integer fields
      const num = parseInt(value, 10);
      if (!isNaN(num)) {
        item[key] = num;
      }
    } else if (key === 'aliases') {
      // Array fields stored as JSON string
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          item[key] = parsed;
        }
      } catch (e) {
        // If not valid JSON, skip
      }
    } else if (key === 'previousVersions' || key === 'extractedFields') {
      // Array fields - skip if empty
      try {
        const parsed = JSON.parse(value);
        if (Array.isArray(parsed) && parsed.length > 0) {
          item[key] = parsed;
        }
      } catch (e) {
        // Skip
      }
    } else {
      // String fields
      item[key] = value;
    }
  }
  
  // Add __typename
  item['__typename'] = modelType;
  
  // Add _lastChangedAt (epoch milliseconds)
  item['_lastChangedAt'] = Date.now();
  
  // Ensure _version is set
  if (!item['_version']) {
    item['_version'] = 1;
  }
  
  // Ensure timestamps
  if (!item['createdAt']) {
    item['createdAt'] = now;
  }
  if (!item['updatedAt']) {
    item['updatedAt'] = now;
  }
  
  return item;
}

// ============================================
// DYNAMODB OPERATIONS
// ============================================

async function putItem(client, tableName, item) {
  const command = new PutItemCommand({
    TableName: tableName,
    Item: marshall(item, { removeUndefinedValues: true }),
  });
  
  return client.send(command);
}

async function batchWriteItems(client, tableName, items) {
  // Split into batches of 25
  const batches = [];
  for (let i = 0; i < items.length; i += CONFIG.batchSize) {
    batches.push(items.slice(i, i + CONFIG.batchSize));
  }
  
  let totalWritten = 0;
  
  for (const batch of batches) {
    const putRequests = batch.map(item => ({
      PutRequest: {
        Item: marshall(item, { removeUndefinedValues: true }),
      },
    }));
    
    const command = new BatchWriteItemCommand({
      RequestItems: {
        [tableName]: putRequests,
      },
    });
    
    await client.send(command);
    totalWritten += batch.length;
    console.log(`  Written ${totalWritten}/${items.length} items`);
  }
  
  return totalWritten;
}

// ============================================
// MIGRATION FUNCTIONS
// ============================================

async function migrateModel(client, modelType) {
  const tableName = CONFIG.tables[modelType];
  const csvPath = CONFIG.csvFiles[modelType];
  
  if (!tableName || !csvPath) {
    console.log(`Skipping ${modelType}: not configured`);
    return { success: 0, failed: 0 };
  }
  
  if (!fs.existsSync(csvPath)) {
    console.log(`Skipping ${modelType}: CSV file not found at ${csvPath}`);
    return { success: 0, failed: 0 };
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Migrating ${modelType}`);
  console.log(`  Source: ${csvPath}`);
  console.log(`  Target: ${tableName}`);
  console.log(`${'='.repeat(50)}`);
  
  // Parse CSV
  const rows = parseCSV(csvPath);
  console.log(`  Found ${rows.length} records`);
  
  if (rows.length === 0) {
    return { success: 0, failed: 0 };
  }
  
  // Transform data
  const items = rows.map(row => transformForDynamoDB(row, modelType));
  
  // Show sample
  console.log(`  Sample transformed item:`);
  console.log(JSON.stringify(items[0], null, 2).split('\n').map(l => '    ' + l).join('\n'));
  
  if (CONFIG.dryRun) {
    console.log(`  [DRY RUN] Would write ${items.length} items`);
    return { success: items.length, failed: 0 };
  }
  
  // Write to DynamoDB
  let success = 0;
  let failed = 0;
  
  try {
    // Use batch write for efficiency
    success = await batchWriteItems(client, tableName, items);
  } catch (error) {
    console.error(`  Error during batch write:`, error.message);
    
    // Fall back to individual writes
    console.log(`  Falling back to individual writes...`);
    for (const item of items) {
      try {
        await putItem(client, tableName, item);
        success++;
      } catch (itemError) {
        console.error(`  Failed to write item ${item.id}:`, itemError.message);
        failed++;
      }
    }
  }
  
  console.log(`  Completed: ${success} success, ${failed} failed`);
  return { success, failed };
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log('KingsRoom Data Migration');
  console.log('========================\n');
  
  if (CONFIG.dryRun) {
    console.log('⚠️  DRY RUN MODE - No data will be written');
    console.log('   Set CONFIG.dryRun = false to perform actual migration\n');
  }
  
  // Initialize DynamoDB client
  const client = new DynamoDBClient({ region: CONFIG.region });
  
  // Migration order matters - parent entities first
  const migrationOrder = [
    'Entity',           // No dependencies
    'TournamentSeriesTitle', // No dependencies
    'Venue',            // Depends on Entity
    'SocialAccount',    // Depends on Entity
    'S3Storage',        // Depends on Entity
  ];
  
  const results = {};
  
  for (const modelType of migrationOrder) {
    results[modelType] = await migrateModel(client, modelType);
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('MIGRATION SUMMARY');
  console.log('='.repeat(50));
  
  let totalSuccess = 0;
  let totalFailed = 0;
  
  for (const [model, result] of Object.entries(results)) {
    console.log(`${model}: ${result.success} success, ${result.failed} failed`);
    totalSuccess += result.success;
    totalFailed += result.failed;
  }
  
  console.log('-'.repeat(50));
  console.log(`TOTAL: ${totalSuccess} success, ${totalFailed} failed`);
  
  if (CONFIG.dryRun) {
    console.log('\n⚠️  This was a DRY RUN - no data was written');
    console.log('   To perform actual migration:');
    console.log('   1. Update CONFIG.tables with your actual table names');
    console.log('   2. Set CONFIG.dryRun = false');
    console.log('   3. Run the script again');
  }
}

main().catch(console.error);
