// reset-socialpost-processing-status.cjs
// Sets processingStatus to "PENDING" for all SocialPost records where isTournamentResult is null/empty
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const REGION = "ap-southeast-2";
const TABLE_NAME = "SocialPost-ht3nugt6lvddpeeuwj3x6mkite-dev";

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);

// Dry run mode - set to false to actually update records
const DRY_RUN = false;

async function resetProcessingStatus() {
  console.log('Scanning for SocialPost records without isTournamentResult...');
  console.log(`DRY_RUN: ${DRY_RUN}`);
  console.log('');
  
  let totalScanned = 0;
  let totalToUpdate = 0;
  let totalUpdated = 0;
  let lastEvaluatedKey = undefined;
  
  do {
    // Scan for records where isTournamentResult doesn't exist OR is empty string
    const result = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
      FilterExpression: 'attribute_not_exists(isTournamentResult) OR isTournamentResult = :empty',
      ExpressionAttributeValues: {
        ':empty': ''
      },
      ExclusiveStartKey: lastEvaluatedKey
    }));
    
    totalScanned += result.ScannedCount || 0;
    const items = result.Items || [];
    totalToUpdate += items.length;
    
    console.log(`Scanned ${result.ScannedCount} records, found ${items.length} matching records in this batch`);
    
    for (const item of items) {
      const currentStatus = item.processingStatus || '(none)';
      const postId = item.id;
      const postDate = item.postedAt || item.createdAt || 'unknown date';
      
      console.log(`  [${postId}] postedAt: ${postDate}, current status: ${currentStatus} -> PENDING`);
      
      if (!DRY_RUN) {
        try {
          await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { id: item.id },
            UpdateExpression: 'SET processingStatus = :status',
            ExpressionAttributeValues: {
              ':status': 'PENDING'
            }
          }));
          totalUpdated++;
        } catch (error) {
          console.error(`  ERROR updating ${postId}:`, error.message);
        }
      } else {
        totalUpdated++;
      }
    }
    
    lastEvaluatedKey = result.LastEvaluatedKey;
    
    if (lastEvaluatedKey) {
      console.log('Fetching next page...');
    }
    
  } while (lastEvaluatedKey);
  
  console.log('');
  console.log('=== Summary ===');
  console.log(`Total records scanned: ${totalScanned}`);
  console.log(`Records without isTournamentResult: ${totalToUpdate}`);
  console.log(`Records ${DRY_RUN ? 'to be updated' : 'updated'}: ${totalUpdated}`);
  
  if (DRY_RUN) {
    console.log('');
    console.log('This was a DRY RUN. Set DRY_RUN = false to actually update records.');
  }
  
  console.log('Done!');
}

resetProcessingStatus().catch(console.error);
