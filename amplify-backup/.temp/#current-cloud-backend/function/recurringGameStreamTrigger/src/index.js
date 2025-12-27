/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_GRAPHQLAPIKEYOUTPUT
	API_KINGSROOM_RECURRINGGAMETABLE_ARN
	API_KINGSROOM_RECURRINGGAMETABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */

/**
 * recurringGameStreamTrigger/index.js
 * 
 * DynamoDB Stream Trigger for RecurringGame table
 * 
 * Automatically computes the `dayOfWeek#name` composite key whenever a
 * RecurringGame record is created or updated. This ensures the GSI
 * (byVenueRecurringGame) works correctly for the recurring game resolver.
 * 
 * Setup:
 * 1. Create this Lambda in Amplify: amplify add function
 * 2. Enable DynamoDB Streams on RecurringGame table (NEW_AND_OLD_IMAGES)
 * 3. Add this Lambda as a trigger on the stream
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

// Initialize DynamoDB client
const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-southeast-2' });
const docClient = DynamoDBDocumentClient.from(client);

// Get table name from environment or construct it
const getTableName = () => {
    // Try explicit env var first
    if (process.env.RECURRING_GAME_TABLE_NAME) {
        return process.env.RECURRING_GAME_TABLE_NAME;
    }
    // Fall back to Amplify-style env var
    if (process.env.API_KINGSROOM_RECURRINGGAMETABLE_NAME) {
        return process.env.API_KINGSROOM_RECURRINGGAMETABLE_NAME;
    }
    throw new Error('RECURRING_GAME_TABLE_NAME environment variable not set');
};

/**
 * Build the composite key for the GSI
 * Format: "DAYOFWEEK#GameName" (e.g., "TUESDAY#Tuesday Night NLHE")
 */
const buildCompositeKey = (dayOfWeek, name) => {
    if (!dayOfWeek || !name) {
        return null;
    }
    return `${dayOfWeek}#${name}`;
};

/**
 * Extract string value from DynamoDB stream record attribute
 * Handles both marshalled (stream) and unmarshalled formats
 */
const getStringValue = (attr) => {
    if (!attr) return null;
    // Marshalled format from stream: { S: "value" }
    if (typeof attr === 'object' && attr.S) return attr.S;
    // Unmarshalled format: "value"
    if (typeof attr === 'string') return attr;
    return null;
};

/**
 * Main handler for DynamoDB Stream events
 */
exports.handler = async (event) => {
    console.log('[RecurringGameStream] Processing', event.Records?.length || 0, 'records');
    
    const tableName = getTableName();
    const results = {
        processed: 0,
        updated: 0,
        skipped: 0,
        errors: []
    };
    
    for (const record of event.Records) {
        try {
            // Only process INSERT and MODIFY events
            if (record.eventName !== 'INSERT' && record.eventName !== 'MODIFY') {
                console.log(`[RecurringGameStream] Skipping ${record.eventName} event`);
                results.skipped++;
                continue;
            }
            
            const newImage = record.dynamodb?.NewImage;
            const oldImage = record.dynamodb?.OldImage;
            
            if (!newImage) {
                console.log('[RecurringGameStream] No NewImage in record, skipping');
                results.skipped++;
                continue;
            }
            
            // Extract values
            const id = getStringValue(newImage.id);
            const dayOfWeek = getStringValue(newImage.dayOfWeek);
            const name = getStringValue(newImage.name);
            const existingKey = getStringValue(newImage['dayOfWeek#name']);
            
            if (!id) {
                console.log('[RecurringGameStream] No id in record, skipping');
                results.skipped++;
                continue;
            }
            
            // Compute what the key should be
            const expectedKey = buildCompositeKey(dayOfWeek, name);
            
            if (!expectedKey) {
                console.log(`[RecurringGameStream] Cannot compute key for ${id} - missing dayOfWeek or name`);
                results.skipped++;
                continue;
            }
            
            // Check if key needs to be set or updated
            if (existingKey === expectedKey) {
                console.log(`[RecurringGameStream] Key already correct for ${id}: ${expectedKey}`);
                results.skipped++;
                continue;
            }
            
            // For MODIFY events, check if dayOfWeek or name actually changed
            if (record.eventName === 'MODIFY' && oldImage) {
                const oldDayOfWeek = getStringValue(oldImage.dayOfWeek);
                const oldName = getStringValue(oldImage.name);
                const oldKey = getStringValue(oldImage['dayOfWeek#name']);
                
                // If neither dayOfWeek nor name changed, and we have a key, skip
                if (oldDayOfWeek === dayOfWeek && oldName === name && oldKey) {
                    console.log(`[RecurringGameStream] No relevant changes for ${id}, skipping`);
                    results.skipped++;
                    continue;
                }
            }
            
            // Update the record with the computed composite key
            console.log(`[RecurringGameStream] Updating ${id}: ${existingKey || '(none)'} -> ${expectedKey}`);
            
            await docClient.send(new UpdateCommand({
                TableName: tableName,
                Key: { id },
                UpdateExpression: 'SET #compositeKey = :keyValue',
                ExpressionAttributeNames: {
                    '#compositeKey': 'dayOfWeek#name'
                },
                ExpressionAttributeValues: {
                    ':keyValue': expectedKey
                },
                // Prevent infinite loop - only update if key is different
                ConditionExpression: 'attribute_not_exists(#compositeKey) OR #compositeKey <> :keyValue'
            }));
            
            console.log(`[RecurringGameStream] Successfully updated ${id}`);
            results.updated++;
            
        } catch (error) {
            // ConditionalCheckFailedException means key is already correct (race condition)
            if (error.name === 'ConditionalCheckFailedException') {
                console.log(`[RecurringGameStream] Key already set (race condition), skipping`);
                results.skipped++;
                continue;
            }
            
            const errorMsg = `Error processing record: ${error.message}`;
            console.error(`[RecurringGameStream] ${errorMsg}`, error);
            results.errors.push(errorMsg);
        }
        
        results.processed++;
    }
    
    console.log('[RecurringGameStream] Complete:', JSON.stringify(results));
    
    // Don't throw on errors - we don't want to block the stream
    // Errors are logged for CloudWatch alerting
    return results;
};