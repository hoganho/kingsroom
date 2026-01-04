/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_GRAPHQLAPIKEYOUTPUT
	API_KINGSROOM_SOCIALACCOUNTTABLE_ARN
	API_KINGSROOM_SOCIALACCOUNTTABLE_NAME
	API_KINGSROOM_SOCIALPOSTTABLE_ARN
	API_KINGSROOM_SOCIALPOSTTABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */

// amplify/backend/function/socialPostStreamHandler/src/index.js

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const SOCIAL_ACCOUNT_TABLE = process.env.SOCIAL_ACCOUNT_TABLE || process.env.API_KINGSROOM_SOCIALACCOUNTTABLE_NAME;

exports.handler = async (event) => {
  // Aggregate changes by socialAccountId
  const accountDeltas = new Map(); // socialAccountId -> delta count
  
  for (const record of event.Records) {
    // Only process INSERT and REMOVE events
    if (record.eventName !== 'INSERT' && record.eventName !== 'REMOVE') {
      continue;
    }
    
    // Get socialAccountId from the appropriate image
    const image = record.eventName === 'REMOVE' 
      ? record.dynamodb.OldImage 
      : record.dynamodb.NewImage;
    
    const socialAccountId = image?.socialAccountId?.S;
    
    if (!socialAccountId) {
      console.log('Skipping record without socialAccountId:', record.eventID);
      continue;
    }
    
    // Calculate delta: +1 for INSERT, -1 for REMOVE
    const delta = record.eventName === 'INSERT' ? 1 : -1;
    
    // Aggregate deltas by account
    const currentDelta = accountDeltas.get(socialAccountId) || 0;
    accountDeltas.set(socialAccountId, currentDelta + delta);
  }
  
  // Apply atomic updates to each affected account
  const updatePromises = [];
  
  for (const [accountId, delta] of accountDeltas) {
    if (delta === 0) continue; // No net change
    
    console.log(`Updating postCount for account ${accountId}: delta=${delta}`);
    
    updatePromises.push(
      docClient.send(new UpdateCommand({
        TableName: SOCIAL_ACCOUNT_TABLE,
        Key: { id: accountId },
        UpdateExpression: 'ADD postCount :delta SET updatedAt = :now',
        ExpressionAttributeValues: {
          ':delta': delta,
          ':now': new Date().toISOString(),
        },
        // Ensure postCount doesn't go negative
        ConditionExpression: 'attribute_not_exists(postCount) OR postCount >= :minVal',
        ExpressionAttributeValues: {
          ':delta': delta,
          ':now': new Date().toISOString(),
          ':minVal': delta < 0 ? Math.abs(delta) : 0,
        },
      })).catch(err => {
        // If condition fails (would go negative), set to 0
        if (err.name === 'ConditionalCheckFailedException') {
          console.warn(`postCount would go negative for ${accountId}, setting to 0`);
          return docClient.send(new UpdateCommand({
            TableName: SOCIAL_ACCOUNT_TABLE,
            Key: { id: accountId },
            UpdateExpression: 'SET postCount = :zero, updatedAt = :now',
            ExpressionAttributeValues: {
              ':zero': 0,
              ':now': new Date().toISOString(),
            },
          }));
        }
        throw err;
      })
    );
  }
  
  await Promise.all(updatePromises);
  
  console.log(`Updated postCount for ${accountDeltas.size} accounts`);
  
  return { 
    statusCode: 200, 
    body: `Processed ${event.Records.length} records, updated ${accountDeltas.size} accounts` 
  };
};