#!/usr/bin/env node
/**
 * Quick diagnostic to find invalid gameStatus values
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';

const CONFIG = {
  region: 'ap-southeast-2',
  apiId: process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT || 'ynuahifnznb5zddz727oiqnicy',
  env: process.env.ENV || 'prod',
};

const getTableName = (modelName) => `${modelName}-${CONFIG.apiId}-${CONFIG.env}`;

const VALID_GAME_STATUSES = new Set([
  'INITIATING', 'SCHEDULED', 'REGISTERING', 'RUNNING', 'CANCELLED',
  'FINISHED', 'NOT_FOUND', 'NOT_PUBLISHED', 'CLOCK_STOPPED', 'UNKNOWN',
]);

const client = new DynamoDBClient({ region: CONFIG.region });
const docClient = DynamoDBDocumentClient.from(client);

async function scanTable(tableName, statusField = 'gameStatus') {
  const invalid = [];
  const statusCounts = {};
  let lastKey = undefined;
  let total = 0;

  do {
    const response = await docClient.send(new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastKey,
    }));

    for (const item of response.Items || []) {
      total++;
      const status = item[statusField];
      
      // Count all statuses
      const key = status === undefined ? '(undefined)' : status === null ? '(null)' : status;
      statusCounts[key] = (statusCounts[key] || 0) + 1;
      
      // Track invalid ones
      if (status !== undefined && status !== null && !VALID_GAME_STATUSES.has(status)) {
        invalid.push({
          id: item.id,
          tournamentId: item.tournamentId,
          status: status,
          name: item.name?.substring(0, 50),
        });
      }
    }
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);

  return { total, invalid, statusCounts };
}

async function main() {
  console.log('Scanning ScrapeURL table...');
  const scrapeURL = await scanTable(getTableName('ScrapeURL'));
  
  console.log(`\n=== ScrapeURL Table ===`);
  console.log(`Total records: ${scrapeURL.total}`);
  console.log(`Invalid gameStatus values found: ${scrapeURL.invalid.length}`);
  
  console.log('\nAll gameStatus values in ScrapeURL:');
  for (const [status, count] of Object.entries(scrapeURL.statusCounts).sort((a,b) => b[1] - a[1])) {
    const isValid = VALID_GAME_STATUSES.has(status) || status === '(undefined)' || status === '(null)';
    console.log(`  ${isValid ? '✓' : '✗'} "${status}": ${count}`);
  }

  if (scrapeURL.invalid.length > 0) {
    console.log('\nInvalid ScrapeURL records:');
    scrapeURL.invalid.slice(0, 20).forEach(r => {
      console.log(`  ID: ${r.id}, tournamentId: ${r.tournamentId}, status: "${r.status}"`);
    });
  }

  console.log('\n\nScanning Game table...');
  const game = await scanTable(getTableName('Game'));
  
  console.log(`\n=== Game Table ===`);
  console.log(`Total records: ${game.total}`);
  console.log(`Invalid gameStatus values found: ${game.invalid.length}`);
  
  if (game.invalid.length > 0) {
    console.log('\nInvalid Game records:');
    game.invalid.slice(0, 10).forEach(r => {
      console.log(`  "${r.name}" - status: "${r.status}"`);
    });
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  
  const totalInvalid = scrapeURL.invalid.length + game.invalid.length;
  if (totalInvalid === 0) {
    console.log('✅ No invalid gameStatus values found!');
  } else {
    console.log(`❌ Found ${totalInvalid} records with invalid gameStatus values`);
    console.log('\nTo fix, run: node fix-invalid-gamestatus.mjs --execute');
  }
}

main().catch(console.error);
