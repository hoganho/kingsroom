// amplify/backend/function/userLastActiveUpdater/src/index.js
// 
// DynamoDB Stream Trigger: Updates User.lastActiveAt when UserAuditLog entries are created
// 
// Setup Instructions:
// 1. Create this Lambda function in your Amplify project
// 2. Add DynamoDB stream trigger on UserAuditLog table
// 3. Grant this Lambda permission to update the User table

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Throttle: Only update lastActiveAt if more than X minutes have passed
const THROTTLE_MINUTES = 5;

// Get table names from environment variables (set these in Lambda config)
const USER_TABLE = process.env.USER_TABLE || process.env.API_KINGSROOM_USERTABLE_NAME;

exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  // Track unique users to update (deduplicate within batch)
  const usersToUpdate = new Map();
  
  for (const record of event.Records) {
    // Only process INSERT events (new audit log entries)
    if (record.eventName !== 'INSERT') {
      continue;
    }
    
    try {
      // Extract the new image (the inserted record)
      const newImage = record.dynamodb?.NewImage;
      if (!newImage) {
        console.log('No NewImage found, skipping record');
        continue;
      }
      
      // Parse the userId from the DynamoDB record format
      const userId = newImage.userId?.S;
      const createdAt = newImage.createdAt?.S;
      
      if (!userId) {
        console.log('No userId found in record, skipping');
        continue;
      }
      
      // Use the latest timestamp for each user
      const existingTimestamp = usersToUpdate.get(userId);
      if (!existingTimestamp || createdAt > existingTimestamp) {
        usersToUpdate.set(userId, createdAt || new Date().toISOString());
      }
      
    } catch (error) {
      console.error('Error processing record:', error);
      // Continue processing other records
    }
  }
  
  // Update each unique user
  const updatePromises = [];
  
  for (const [userId, timestamp] of usersToUpdate) {
    updatePromises.push(updateUserLastActive(userId, timestamp));
  }
  
  const results = await Promise.allSettled(updatePromises);
  
  // Log summary
  const succeeded = results.filter(r => r.status === 'fulfilled' && r.value === true).length;
  const throttled = results.filter(r => r.status === 'fulfilled' && r.value === false).length;
  const failed = results.filter(r => r.status === 'rejected').length;
  
  console.log(`Update summary: ${succeeded} updated, ${throttled} throttled, ${failed} failed`);
  
  return {
    statusCode: 200,
    body: JSON.stringify({
      processed: event.Records.length,
      usersUpdated: succeeded,
      usersThrottled: throttled,
      usersFailed: failed
    })
  };
};

async function updateUserLastActive(userId, timestamp) {
  if (!USER_TABLE) {
    throw new Error('USER_TABLE environment variable not set');
  }
  
  try {
    // First, check if we should throttle (optional - remove if you want every update)
    const shouldUpdate = await shouldUpdateUser(userId);
    if (!shouldUpdate) {
      console.log(`Throttled update for user ${userId}`);
      return false;
    }
    
    // Update the user's lastActiveAt
    const command = new UpdateCommand({
      TableName: USER_TABLE,
      Key: { id: userId },
      UpdateExpression: 'SET lastActiveAt = :timestamp, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':timestamp': timestamp,
        ':updatedAt': new Date().toISOString()
      },
      ConditionExpression: 'attribute_exists(id)', // Only update if user exists
      ReturnValues: 'NONE'
    });
    
    await docClient.send(command);
    console.log(`Updated lastActiveAt for user ${userId}`);
    return true;
    
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.log(`User ${userId} not found, skipping update`);
      return false;
    }
    throw error;
  }
}

async function shouldUpdateUser(userId) {
  if (!USER_TABLE) return true;
  
  try {
    const command = new GetCommand({
      TableName: USER_TABLE,
      Key: { id: userId },
      ProjectionExpression: 'lastActiveAt'
    });
    
    const response = await docClient.send(command);
    
    if (!response.Item?.lastActiveAt) {
      return true; // No previous timestamp, should update
    }
    
    const lastActive = new Date(response.Item.lastActiveAt);
    const now = new Date();
    const minutesSinceLastUpdate = (now.getTime() - lastActive.getTime()) / (1000 * 60);
    
    return minutesSinceLastUpdate >= THROTTLE_MINUTES;
    
  } catch (error) {
    console.error('Error checking throttle:', error);
    return true; // If check fails, allow the update
  }
}