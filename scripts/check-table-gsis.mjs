#!/usr/bin/env node
/**
 * check-table-gsis.mjs
 * 
 * Verifies that all required GSIs exist on your projection tables.
 * Run: node check-table-gsis.mjs
 * 
 * Prerequisites:
 * - AWS credentials configured (via env vars, ~/.aws/credentials, or IAM role)
 * - npm install @aws-sdk/client-dynamodb
 */

import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';

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

const getTableName = (modelName) => `${modelName}-${CONFIG.apiId}-${CONFIG.env}`;

const client = new DynamoDBClient({ region: CONFIG.region });

// Tables and their required GSIs
const REQUIRED_GSIS = {
    'ActiveGame': [
        'byGameIdActive',           // Used by syncActiveGame to find existing records
        'byEntityStatus',           // Used by HomePage queries (activeGamesByEntity)
    ],
    'UpcomingGame': [
        'byGameIdUpcoming',         // Used by syncActiveGame to find existing records
        'byEntityUpcoming',         // Used by HomePage queries (upcomingGamesByEntity)
    ],
    'RecentlyFinishedGame': [
        'byEntityFinished',         // Used by HomePage queries (recentlyFinishedByEntity)
    ],
    'Game': [
        'bySourceUrl',              // Used by saveGameFunction to find existing games
        'byEntityAndTournamentId',  // Used by saveGameFunction
        'byEntityStatus',           // Used by refresh queries
    ],
    'ScrapeURL': [
        'byURL',                    // Used by refreshRunningGames doNotScrape check
    ],
};

async function describeTable(tableName) {
    const fullTableName = getTableName(tableName);
    
    try {
        const response = await client.send(new DescribeTableCommand({
            TableName: fullTableName
        }));
        return response.Table;
    } catch (error) {
        if (error.name === 'ResourceNotFoundException') {
            return null;
        }
        throw error;
    }
}

async function checkTable(tableName, requiredGsis) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📋 Table: ${tableName}`);
    console.log(`${'═'.repeat(60)}`);
    
    const table = await describeTable(tableName);
    
    if (!table) {
        console.log(`   ❌ TABLE NOT FOUND: ${getTableName(tableName)}`);
        return { tableName, exists: false, missingGsis: requiredGsis, extraGsis: [] };
    }
    
    console.log(`   ✅ Table exists: ${table.TableName}`);
    console.log(`   📊 Item count: ${table.ItemCount || 0}`);
    console.log(`   📈 Status: ${table.TableStatus}`);
    
    // Get existing GSIs
    const existingGsis = (table.GlobalSecondaryIndexes || []).map(gsi => gsi.IndexName);
    
    console.log(`\n   GSIs found (${existingGsis.length}):`);
    existingGsis.forEach(gsi => {
        const isRequired = requiredGsis.includes(gsi);
        console.log(`      ${isRequired ? '✅' : '➖'} ${gsi}`);
    });
    
    // Check for missing required GSIs
    const missingGsis = requiredGsis.filter(gsi => !existingGsis.includes(gsi));
    
    if (missingGsis.length > 0) {
        console.log(`\n   ⚠️  MISSING REQUIRED GSIs:`);
        missingGsis.forEach(gsi => {
            console.log(`      ❌ ${gsi}`);
        });
    } else {
        console.log(`\n   ✅ All required GSIs present`);
    }
    
    return { 
        tableName, 
        exists: true, 
        missingGsis, 
        existingGsis,
        itemCount: table.ItemCount || 0
    };
}

async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║         DynamoDB Table & GSI Diagnostic Tool               ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log(`\n🔧 Configuration:`);
    console.log(`   Environment: ${CONFIG.env}`);
    console.log(`   API ID: ${CONFIG.apiId}`);
    console.log(`   Region: ${CONFIG.region}`);
    
    const results = [];
    
    for (const [tableName, requiredGsis] of Object.entries(REQUIRED_GSIS)) {
        try {
            const result = await checkTable(tableName, requiredGsis);
            results.push(result);
        } catch (error) {
            console.log(`\n   ❌ Error checking ${tableName}: ${error.message}`);
            results.push({ tableName, exists: false, error: error.message });
        }
    }
    
    // Summary
    console.log(`\n${'═'.repeat(60)}`);
    console.log('📊 SUMMARY');
    console.log(`${'═'.repeat(60)}`);
    
    const missingTables = results.filter(r => !r.exists);
    const tablesWithMissingGsis = results.filter(r => r.exists && r.missingGsis?.length > 0);
    const healthyTables = results.filter(r => r.exists && (!r.missingGsis || r.missingGsis.length === 0));
    
    console.log(`\n✅ Healthy tables: ${healthyTables.length}`);
    healthyTables.forEach(t => console.log(`   - ${t.tableName} (${t.itemCount} items)`));
    
    if (missingTables.length > 0) {
        console.log(`\n❌ Missing tables: ${missingTables.length}`);
        missingTables.forEach(t => console.log(`   - ${t.tableName}`));
    }
    
    if (tablesWithMissingGsis.length > 0) {
        console.log(`\n⚠️  Tables with missing GSIs: ${tablesWithMissingGsis.length}`);
        tablesWithMissingGsis.forEach(t => {
            console.log(`   - ${t.tableName}: missing ${t.missingGsis.join(', ')}`);
        });
    }
    
    // Exit code
    const hasIssues = missingTables.length > 0 || tablesWithMissingGsis.length > 0;
    
    console.log(`\n${'═'.repeat(60)}`);
    if (hasIssues) {
        console.log('❌ ISSUES FOUND - See above for details');
        console.log('\nTo fix missing GSIs, update your Amplify schema or manually add them in AWS Console.');
        process.exit(1);
    } else {
        console.log('✅ ALL CHECKS PASSED - Tables and GSIs are properly configured');
        process.exit(0);
    }
}

main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
});
