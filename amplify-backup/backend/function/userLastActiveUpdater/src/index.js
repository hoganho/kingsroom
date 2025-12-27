/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_GRAPHQLAPIKEYOUTPUT
	API_KINGSROOM_USERAUDITLOGTABLE_ARN
	API_KINGSROOM_USERAUDITLOGTABLE_NAME
	API_KINGSROOM_USERTABLE_ARN
	API_KINGSROOM_USERTABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */// amplify/backend/function/userLastActiveUpdater/src/index.js
// 
// DynamoDB Stream Trigger: Updates User.lastActiveAt when UserAuditLog entries are created
// 
// Setup Instructions:
// 1. Create this Lambda function in your Amplify project
// 2. Add DynamoDB stream trigger on UserAuditLog table
// 3. Grant this Lambda permission to update the User table
// 4. Grant CloudWatch PutMetricData permission for monitoring

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { LambdaMonitoring } = require('./lambda-monitoring');

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

// Throttle: Only update lastActiveAt if more than X minutes have passed
const THROTTLE_MINUTES = 5;

// Get table names from environment variables (set these in Lambda config)
const USER_TABLE = process.env.USER_TABLE || process.env.API_KINGSROOM_USERTABLE_NAME;

// Initialize monitoring
const monitor = new LambdaMonitoring('userLastActiveUpdater');

// Wrap the DynamoDB client for automatic operation tracking
const monitoredDocClient = monitor.wrapDynamoDBClient(docClient);

exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));
  
  try {
    // Track incoming stream event
    monitor.trackOperation('STREAM_RECEIVE', 'UserAuditLog', null, {
      recordCount: event.Records?.length || 0
    });
    
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
        monitor.trackOperation('PROCESS_ERROR', 'UserAuditLog', null, {
          error: error.message
        });
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
    
    // Track overall results
    monitor.trackOperation('BATCH_COMPLETE', 'User', null, {
      processed: event.Records.length,
      uniqueUsers: usersToUpdate.size,
      updated: succeeded,
      throttled: throttled,
      failed: failed,
      success: failed === 0
    });
    
    // Flush all metrics before Lambda ends
    await monitor.flush();
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        processed: event.Records.length,
        usersUpdated: succeeded,
        usersThrottled: throttled,
        usersFailed: failed
      })
    };
    
  } catch (error) {
    console.error('Handler error:', error);
    monitor.trackOperation('HANDLER_ERROR', 'UserLastActiveUpdater', null, {
      error: error.message,
      success: false
    });
    
    // Ensure metrics are flushed even on error
    await monitor.flush();
    
    throw error;
  }
};

async function updateUserLastActive(userId, timestamp) {
  if (!USER_TABLE) {
    throw new Error('USER_TABLE environment variable not set');
  }
  
  try {
    // First, check if we should throttle
    const shouldUpdate = await shouldUpdateUser(userId);
    if (!shouldUpdate) {
      console.log(`Throttled update for user ${userId}`);
      monitor.trackOperation('THROTTLE', 'User', userId, {
        reason: 'RATE_LIMIT',
        throttleMinutes: THROTTLE_MINUTES
      });
      return false;
    }
    
    // Update the user's lastActiveAt (tracked automatically via wrapped client)
    const command = new UpdateCommand({
      TableName: USER_TABLE,
      Key: { id: userId },
      UpdateExpression: 'SET lastActiveAt = :timestamp, updatedAt = :updatedAt',
      ExpressionAttributeValues: {
        ':timestamp': timestamp,
        ':updatedAt': new Date().toISOString()
      },
      ConditionExpression: 'attribute_exists(id)',
      ReturnValues: 'NONE'
    });
    
    await monitoredDocClient.send(command);
    console.log(`Updated lastActiveAt for user ${userId}`);
    return true;
    
  } catch (error) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.log(`User ${userId} not found, skipping update`);
      monitor.trackOperation('USER_NOT_FOUND', 'User', userId, {
        success: false
      });
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
    
    // Use monitored client for automatic tracking
    const response = await monitoredDocClient.send(command);
    
    if (!response.Item?.lastActiveAt) {
      return true;
    }
    
    const lastActive = new Date(response.Item.lastActiveAt);
    const now = new Date();
    const minutesSinceLastUpdate = (now.getTime() - lastActive.getTime()) / (1000 * 60);
    
    return minutesSinceLastUpdate >= THROTTLE_MINUTES;
    
  } catch (error) {
    console.error('Error checking throttle:', error);
    return true;
  }
}