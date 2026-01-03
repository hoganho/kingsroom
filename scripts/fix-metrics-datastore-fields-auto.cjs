// fix-metrics-datastore-fields-auto.cjs
// Run with: node fix-metrics-datastore-fields-auto.cjs

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const REGION = "ap-southeast-2";

// Your Amplify API ID and environment
const API_ID = "ht3nugt6lvddpeeuwj3x6mkite";
const ENV = "dev";

// Metrics tables to fix
const METRICS_MODELS = [
  "EntityMetrics",
  "VenueMetrics", 
  "RecurringGameMetrics",
  "TournamentSeriesMetrics"
];

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

async function fixMetricsDataStoreFields() {
  console.log('='.repeat(60));
  console.log('Fixing DataStore fields (_version, _lastChangedAt, _deleted)');
  console.log('='.repeat(60));
  console.log(`API ID: ${API_ID}`);
  console.log(`Environment: ${ENV}`);
  console.log('');
  
  const summary = {
    totalScanned: 0,
    totalFixed: 0,
    totalAlreadyValid: 0,
    errors: []
  };

  for (const model of METRICS_MODELS) {
    const tableName = `${model}-${API_ID}-${ENV}`;
    
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`[${model}] Processing: ${tableName}`);
    console.log('─'.repeat(60));
    
    try {
      const result = await fixTable(model, tableName);
      summary.totalScanned += result.scanned;
      summary.totalFixed += result.fixed;
      summary.totalAlreadyValid += result.alreadyValid;
      if (result.errors.length > 0) {
        summary.errors.push(...result.errors);
      }
    } catch (err) {
      if (err.name === 'ResourceNotFoundException') {
        console.log(`  ⚠ Table does not exist - skipping`);
      } else {
        console.error(`  ✗ ERROR:`, err.name, err.message);
        summary.errors.push(`${model}: ${err.message}`);
      }
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Total records scanned: ${summary.totalScanned}`);
  console.log(`Total records fixed:   ${summary.totalFixed}`);
  console.log(`Already valid:         ${summary.totalAlreadyValid}`);
  
  if (summary.errors.length > 0) {
    console.log(`\n⚠ Errors (${summary.errors.length}):`);
    summary.errors.forEach(e => console.log(`  - ${e}`));
  } else {
    console.log('\n✓ All records processed successfully!');
  }
}

async function fixTable(name, tableName) {
  const result = {
    scanned: 0,
    fixed: 0,
    alreadyValid: 0,
    errors: []
  };

  let lastEvaluatedKey = undefined;
  let batchNum = 0;

  do {
    batchNum++;
    
    // Simple scan - just get all items
    const scanParams = {
      TableName: tableName,
    };
    
    if (lastEvaluatedKey) {
      scanParams.ExclusiveStartKey = lastEvaluatedKey;
    }

    console.log(`  Scanning batch ${batchNum}...`);
    
    const scanResponse = await docClient.send(new ScanCommand(scanParams));
    
    // Handle empty or missing Items
    const items = scanResponse.Items || [];
    result.scanned += items.length;
    lastEvaluatedKey = scanResponse.LastEvaluatedKey;

    console.log(`  Batch ${batchNum}: Found ${items.length} records`);

    for (const item of items) {
      // Check if fields are missing or null
      const missingVersion = item._version === null || item._version === undefined;
      const missingLastChanged = item._lastChangedAt === null || item._lastChangedAt === undefined;
      const needsFix = missingVersion || missingLastChanged;

      if (needsFix) {
        try {
          await fixRecord(tableName, item.id);
          result.fixed++;
          
          const missing = [];
          if (missingVersion) missing.push('_version');
          if (missingLastChanged) missing.push('_lastChangedAt');
          
          // Truncate long IDs for display
          const displayId = item.id.length > 50 ? item.id.substring(0, 50) + '...' : item.id;
          console.log(`    ✓ Fixed: ${displayId} (${missing.join(', ')})`);
        } catch (err) {
          console.error(`    ✗ Failed: ${item.id}: ${err.message}`);
          result.errors.push(`${name}/${item.id}: ${err.message}`);
        }
      } else {
        result.alreadyValid++;
      }
    }

  } while (lastEvaluatedKey);

  const icon = result.fixed > 0 ? '🔧' : '✓';
  console.log(`\n  ${icon} ${name}: ${result.scanned} scanned, ${result.fixed} fixed, ${result.alreadyValid} valid`);
  return result;
}

async function fixRecord(tableName, id) {
  const now = Date.now();
  
  await docClient.send(new UpdateCommand({
    TableName: tableName,
    Key: { id: id },
    UpdateExpression: 'SET #ver = if_not_exists(#ver, :ver), #lca = if_not_exists(#lca, :lca), #del = if_not_exists(#del, :del)',
    ExpressionAttributeNames: {
      '#ver': '_version',
      '#lca': '_lastChangedAt',
      '#del': '_deleted'
    },
    ExpressionAttributeValues: {
      ':ver': 1,
      ':lca': now,
      ':del': null
    }
  }));
}

// Run
fixMetricsDataStoreFields().catch(err => {
  console.error('\nFATAL ERROR:', err);
  process.exit(1);
});
