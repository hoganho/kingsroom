/**
 * ONE-TIME BACKFILL SCRIPT
 * 
 * Run this once to fix existing parent Game records that are missing
 * required Amplify DataStore fields (_version, _lastChangedAt) and
 * other non-nullable fields.
 * 
 * Usage:
 *   node backfill-parent-records.js
 * 
 * Make sure to set the correct table name and AWS credentials/region.
 */

import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

// Configuration - UPDATE THESE VALUES
const GAME_TABLE = process.env.API_KINGSROOM_GAMETABLE_NAME || 'Game-sjyzke3u45golhnttlco6bpcua-dev';
const REGION = process.env.AWS_REGION || 'ap-southeast-2';

const client = new DynamoDBClient({ region: REGION });
const ddbDocClient = DynamoDBDocumentClient.from(client);

/**
 * Default values for missing fields on parent records
 */
const getDefaultFieldValues = () => ({
    // Amplify DataStore required fields
    _version: 1,
    _lastChangedAt: Date.now(),
    _deleted: null,
    
    // Game status fields
    registrationStatus: 'N_A',
    gameFrequency: 'UNKNOWN',
    
    // Boolean flags
    requiresVenueAssignment: false,
    wasEdited: false,
    isRegular: false,
    
    // Numeric fields
    totalRake: 0,
    profitLoss: 0,
    revenueByBuyIns: 0,
    guaranteeOverlay: 0,
    guaranteeSurplus: 0,
    seriesAssignmentConfidence: 0,
    
    // Array fields
    levels: [],
    gameTags: [],
    
    // Assignment status
    seriesAssignmentStatus: 'NOT_SERIES'
});

/**
 * Find all parent records that are missing required fields
 */
async function findBrokenParentRecords() {
    console.log('Scanning for parent records missing required fields...');
    
    const brokenRecords = [];
    let lastEvaluatedKey = undefined;
    
    do {
        const params = {
            TableName: GAME_TABLE,
            FilterExpression: 'consolidationType = :ptype',
            ExpressionAttributeValues: {
                ':ptype': { S: 'PARENT' }
            },
            ExclusiveStartKey: lastEvaluatedKey
        };
        
        const result = await client.send(new ScanCommand(params));
        
        for (const item of result.Items || []) {
            const record = unmarshall(item);
            
            // Check if missing critical fields
            const isMissing_version = record._version === undefined || record._version === null;
            const isMissing_lastChangedAt = record._lastChangedAt === undefined || record._lastChangedAt === null;
            const isMissingRegistrationStatus = !record.registrationStatus;
            const isMissingGameFrequency = !record.gameFrequency;
            
            if (isMissing_version || isMissing_lastChangedAt || isMissingRegistrationStatus || isMissingGameFrequency) {
                brokenRecords.push({
                    id: record.id,
                    name: record.name,
                    missing: {
                        _version: isMissing_version,
                        _lastChangedAt: isMissing_lastChangedAt,
                        registrationStatus: isMissingRegistrationStatus,
                        gameFrequency: isMissingGameFrequency
                    }
                });
            }
        }
        
        lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);
    
    return brokenRecords;
}

/**
 * Fix a single parent record by adding missing fields
 */
async function fixParentRecord(recordId) {
    const defaults = getDefaultFieldValues();
    
    // Build update expression for all potentially missing fields
    const updateParts = [];
    const expressionValues = {};
    const expressionNames = {};
    
    // Add each default field
    Object.entries(defaults).forEach(([key, value], index) => {
        const attrName = `#attr${index}`;
        const attrValue = `:val${index}`;
        
        expressionNames[attrName] = key;
        expressionValues[attrValue] = value;
        
        // Use if_not_exists to only set if missing
        updateParts.push(`${attrName} = if_not_exists(${attrName}, ${attrValue})`);
    });
    
    // Also update updatedAt
    expressionNames['#updatedAt'] = 'updatedAt';
    expressionValues[':updatedAt'] = new Date().toISOString();
    updateParts.push('#updatedAt = :updatedAt');
    
    const params = {
        TableName: GAME_TABLE,
        Key: { id: recordId },
        UpdateExpression: `SET ${updateParts.join(', ')}`,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues
    };
    
    await ddbDocClient.send(new UpdateCommand(params));
}

/**
 * Main execution
 */
async function main() {
    console.log('='.repeat(60));
    console.log('PARENT RECORD BACKFILL SCRIPT');
    console.log('='.repeat(60));
    console.log(`Table: ${GAME_TABLE}`);
    console.log(`Region: ${REGION}`);
    console.log('');
    
    try {
        // Find broken records
        const brokenRecords = await findBrokenParentRecords();
        
        if (brokenRecords.length === 0) {
            console.log('✅ No broken parent records found!');
            return;
        }
        
        console.log(`Found ${brokenRecords.length} parent record(s) with missing fields:`);
        console.log('');
        
        brokenRecords.forEach((record, index) => {
            console.log(`${index + 1}. ${record.name || 'Unnamed'} (${record.id})`);
            console.log(`   Missing: ${Object.entries(record.missing).filter(([,v]) => v).map(([k]) => k).join(', ')}`);
        });
        
        console.log('');
        console.log('Fixing records...');
        console.log('');
        
        // Fix each record
        let fixed = 0;
        let failed = 0;
        
        for (const record of brokenRecords) {
            try {
                await fixParentRecord(record.id);
                console.log(`✅ Fixed: ${record.name || record.id}`);
                fixed++;
            } catch (error) {
                console.error(`❌ Failed to fix ${record.id}: ${error.message}`);
                failed++;
            }
        }
        
        console.log('');
        console.log('='.repeat(60));
        console.log(`COMPLETE: ${fixed} fixed, ${failed} failed`);
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('Fatal error:', error);
        process.exit(1);
    }
}

main();