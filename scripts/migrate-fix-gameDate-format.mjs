#!/usr/bin/env node

/**
 * migrate-fix-gameDate-format.mjs
 * 
 * Quick fix script to convert firstGameDate and lastGameDate values from YYYY-MM-DD 
 * to ISO datetime format. Both fields are now AWSDateTime in the schema.
 * 
 * Usage:
 *   node migrate-fix-gameDate-format.mjs --preview
 *   node migrate-fix-gameDate-format.mjs --execute
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
    DynamoDBDocumentClient, 
    ScanCommand, 
    UpdateCommand 
} from '@aws-sdk/lib-dynamodb';

// ===================================================================
// CONFIGURATION
// ===================================================================

const AWS_REGION = process.env.AWS_REGION || 'ap-southeast-2';
const TABLE_NAME = process.env.API_KINGSROOM_RECURRINGGAMETABLE_NAME || 'RecurringGame-ynuahifnznb5zddz727oiqnicy-prod';

// ===================================================================
// DYNAMODB CLIENT
// ===================================================================

const client = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true }
});

// ===================================================================
// HELPERS
// ===================================================================

const parseArgs = () => {
    const args = process.argv.slice(2);
    let preview = true;
    
    for (const arg of args) {
        if (arg === '--execute' || arg === '-e') preview = false;
        if (arg === '--help' || arg === '-h') {
            console.log(`
Usage: node migrate-fix-gameDate-format.mjs [options]

Options:
  --preview, -p     Dry run (default)
  --execute, -e     Apply changes
  --help, -h        Show this help
`);
            process.exit(0);
        }
    }
    return { preview };
};

const log = (msg, data) => {
    const ts = new Date().toISOString();
    if (data) console.log(`[${ts}] ${msg}`, JSON.stringify(data, null, 2));
    else console.log(`[${ts}] ${msg}`);
};

/**
 * Check if a string is in YYYY-MM-DD format (not ISO datetime)
 */
const isDateOnly = (str) => {
    if (!str) return false;
    return /^\d{4}-\d{2}-\d{2}$/.test(str);
};

/**
 * Convert YYYY-MM-DD to ISO datetime
 */
const toISODateTime = (dateStr) => {
    return `${dateStr}T00:00:00.000Z`;
};

// ===================================================================
// MAIN
// ===================================================================

const run = async ({ preview }) => {
    log('='.repeat(60));
    log('FIX: Convert firstGameDate/lastGameDate to ISO datetime format');
    log('='.repeat(60));
    log(`Mode: ${preview ? 'PREVIEW' : 'EXECUTE'}`);
    log(`Table: ${TABLE_NAME}`);
    log('');
    
    const stats = { scanned: 0, needsFix: 0, fixed: 0, errors: 0 };
    
    try {
        // Scan all records
        let lastKey = null;
        const itemsToFix = [];
        
        do {
            const params = { TableName: TABLE_NAME };
            if (lastKey) params.ExclusiveStartKey = lastKey;
            
            const result = await docClient.send(new ScanCommand(params));
            
            for (const item of (result.Items || [])) {
                stats.scanned++;
                
                const fixes = {};
                
                // Check if firstGameDate needs fixing
                if (isDateOnly(item.firstGameDate)) {
                    fixes.firstGameDate = {
                        old: item.firstGameDate,
                        new: toISODateTime(item.firstGameDate)
                    };
                }
                
                // Check if lastGameDate needs fixing
                if (isDateOnly(item.lastGameDate)) {
                    fixes.lastGameDate = {
                        old: item.lastGameDate,
                        new: toISODateTime(item.lastGameDate)
                    };
                }
                
                if (Object.keys(fixes).length > 0) {
                    itemsToFix.push({
                        id: item.id,
                        name: item.name,
                        fixes
                    });
                }
            }
            
            lastKey = result.LastEvaluatedKey;
            log(`  Scanned ${stats.scanned} records...`);
        } while (lastKey);
        
        stats.needsFix = itemsToFix.length;
        log('');
        log(`Found ${stats.needsFix} records needing fix out of ${stats.scanned} scanned`);
        log('');
        
        // Apply fixes
        for (const item of itemsToFix) {
            try {
                if (!preview) {
                    const updateExpressions = ['updatedAt = :now'];
                    const expressionValues = { ':now': new Date().toISOString() };
                    const expressionNames = {};
                    
                    if (item.fixes.firstGameDate) {
                        updateExpressions.push('#firstGameDate = :firstGameDate');
                        expressionNames['#firstGameDate'] = 'firstGameDate';
                        expressionValues[':firstGameDate'] = item.fixes.firstGameDate.new;
                    }
                    
                    if (item.fixes.lastGameDate) {
                        updateExpressions.push('#lastGameDate = :lastGameDate');
                        expressionNames['#lastGameDate'] = 'lastGameDate';
                        expressionValues[':lastGameDate'] = item.fixes.lastGameDate.new;
                    }
                    
                    await docClient.send(new UpdateCommand({
                        TableName: TABLE_NAME,
                        Key: { id: item.id },
                        UpdateExpression: `SET ${updateExpressions.join(', ')}`,
                        ExpressionAttributeNames: expressionNames,
                        ExpressionAttributeValues: expressionValues
                    }));
                }
                stats.fixed++;
                
                const fixDetails = Object.entries(item.fixes)
                    .map(([field, { old, new: newVal }]) => `${field}: ${old} → ${newVal}`)
                    .join(', ');
                log(`  ${preview ? 'Would fix' : 'Fixed'}: ${item.name} (${fixDetails})`);
            } catch (err) {
                stats.errors++;
                log(`  ERROR fixing ${item.id}: ${err.message}`);
            }
        }
        
        log('');
        log('='.repeat(60));
        log('COMPLETE');
        log('='.repeat(60));
        log(`Scanned: ${stats.scanned}`);
        log(`Needed fix: ${stats.needsFix}`);
        log(`Fixed: ${stats.fixed}`);
        log(`Errors: ${stats.errors}`);
        
        if (preview && stats.needsFix > 0) {
            log('');
            log('Run with --execute to apply fixes');
        }
        
    } catch (err) {
        log('FATAL ERROR:', err.message);
        console.error(err);
        process.exit(1);
    }
};

// Validate table name
if (TABLE_NAME.includes('XXXXXX')) {
    console.error('ERROR: Set API_KINGSROOM_RECURRINGGAMETABLE_NAME environment variable');
    process.exit(1);
}

const config = parseArgs();
run(config).then(() => process.exit(0));
