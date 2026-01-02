// fix-datetime-format.cjs
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const REGION = "ap-southeast-2";
const TABLE_NAME = "SocialAccount-ht3nugt6lvddpeeuwj3x6mkite-dev";

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);

async function fixDateFormats() {
  console.log('Scanning for accounts with fullSyncOldestPostDate...');
  
  const result = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    FilterExpression: 'attribute_exists(fullSyncOldestPostDate)'
  }));
  
  console.log(`Found ${result.Items?.length || 0} accounts with fullSyncOldestPostDate`);
  
  for (const item of result.Items || []) {
    const oldValue = item.fullSyncOldestPostDate;
    
    // Check if it needs fixing (doesn't end with Z)
    if (oldValue && !oldValue.endsWith('Z')) {
      const newValue = new Date(oldValue).toISOString();
      console.log(`Fixing ${item.accountName}: "${oldValue}" -> "${newValue}"`);
      
      await docClient.send(new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { id: item.id },
        UpdateExpression: 'SET fullSyncOldestPostDate = :newDate',
        ExpressionAttributeValues: {
          ':newDate': newValue
        }
      }));
    } else {
      console.log(`${item.accountName}: OK (${oldValue})`);
    }
  }
  
  console.log('Done!');
}

fixDateFormats().catch(console.error);