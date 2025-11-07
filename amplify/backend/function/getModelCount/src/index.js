/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_GAMETABLE_ARN
	API_KINGSROOM_GAMETABLE_NAME
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
	API_KINGSROOM_MARKETINGMESSAGETABLE_ARN
	API_KINGSROOM_MARKETINGMESSAGETABLE_NAME
	API_KINGSROOM_PLAYERCREDITSTABLE_ARN
	API_KINGSROOM_PLAYERCREDITSTABLE_NAME
	API_KINGSROOM_PLAYERENTRYTABLE_ARN
	API_KINGSROOM_PLAYERENTRYTABLE_NAME
	API_KINGSROOM_PLAYERMARKETINGMESSAGETABLE_ARN
	API_KINGSROOM_PLAYERMARKETINGMESSAGETABLE_NAME
	API_KINGSROOM_PLAYERPOINTSTABLE_ARN
	API_KINGSROOM_PLAYERPOINTSTABLE_NAME
	API_KINGSROOM_PLAYERRESULTTABLE_ARN
	API_KINGSROOM_PLAYERRESULTTABLE_NAME
	API_KINGSROOM_PLAYERSUMMARYTABLE_ARN
	API_KINGSROOM_PLAYERSUMMARYTABLE_NAME
	API_KINGSROOM_PLAYERTABLE_ARN
	API_KINGSROOM_PLAYERTABLE_NAME
	API_KINGSROOM_PLAYERTICKETTABLE_ARN
	API_KINGSROOM_PLAYERTICKETTABLE_NAME
	API_KINGSROOM_PLAYERTRANSACTIONTABLE_ARN
	API_KINGSROOM_PLAYERTRANSACTIONTABLE_NAME
	API_KINGSROOM_PLAYERVENUETABLE_ARN
	API_KINGSROOM_PLAYERVENUETABLE_NAME
	API_KINGSROOM_TOURNAMENTSTRUCTURETABLE_ARN
	API_KINGSROOM_TOURNAMENTSTRUCTURETABLE_NAME
	ENV
	REGION
Amplify Params - DO NOT EDIT */

// Corrected Lambda function - fieldName is at event.fieldName, not event.info.fieldName
// Place in amplify/backend/function/getModelCount/src/index.js

const AWS = require('aws-sdk');
const dynamodb = new AWS.DynamoDB.DocumentClient();
const dynamodbService = new AWS.DynamoDB();

// Map field names to DynamoDB table names
const TABLE_MAPPINGS = {
  'Player': 'Player-oi5oitkajrgtzm7feellfluriy-dev',
  'PlayerSummary': 'PlayerSummary-oi5oitkajrgtzm7feellfluriy-dev',
  'PlayerEntry': 'PlayerEntry-oi5oitkajrgtzm7feellfluriy-dev',
  'PlayerResult': 'PlayerResult-oi5oitkajrgtzm7feellfluriy-dev',
  'PlayerVenue': 'PlayerVenue-oi5oitkajrgtzm7feellfluriy-dev',
  'PlayerTransaction': 'PlayerTransaction-oi5oitkajrgtzm7feellfluriy-dev',
  'PlayerCredits': 'PlayerCredits-oi5oitkajrgtzm7feellfluriy-dev',
  'PlayerPoints': 'PlayerPoints-oi5oitkajrgtzm7feellfluriy-dev',
  'PlayerTicket': 'PlayerTicket-oi5oitkajrgtzm7feellfluriy-dev',
  'PlayerMarketingPreferences': 'PlayerMarketingPreferences-oi5oitkajrgtzm7feellfluriy-dev',
  'PlayerMarketingMessage': 'PlayerMarketingMessage-oi5oitkajrgtzm7feellfluriy-dev',
  'Game': 'Game-oi5oitkajrgtzm7feellfluriy-dev',
  'TournamentStructure': 'TournamentStructure-oi5oitkajrgtzm7feellfluriy-dev'
};

// Map query field names to model names
const QUERY_TO_MODEL_MAP = {
  'playerCount': 'Player',
  'playerSummaryCount': 'PlayerSummary',
  'playerEntryCount': 'PlayerEntry',
  'playerResultCount': 'PlayerResult',
  'playerVenueCount': 'PlayerVenue',
  'playerTransactionCount': 'PlayerTransaction',
  'playerCreditsCount': 'PlayerCredits',
  'playerPointsCount': 'PlayerPoints',
  'playerTicketCount': 'PlayerTicket',
  'playerMarketingPreferencesCount': 'PlayerMarketingPreferences',
  'playerMarketingMessageCount': 'PlayerMarketingMessage',
  'gameCount': 'Game',
  'tournamentStructureCount': 'TournamentStructure'
};

exports.handler = async (event) => {
  console.log('Event received:', JSON.stringify(event, null, 2));
  
  // FIXED: Get the field name from event.fieldName (not event.info.fieldName)
  const fieldName = event.fieldName;
  console.log('Field name:', fieldName);
  
    // Handle batch request for all counts
  if (fieldName === 'getAllCounts') {
    const counts = {};
    
    // Get all counts in parallel (within Lambda's execution context)
    const countPromises = Object.entries(QUERY_TO_MODEL_MAP).map(async ([field, model]) => {
      const tableName = TABLE_MAPPINGS[model];
      try {
        const tableInfo = await dynamodbService.describeTable({ TableName: tableName }).promise();
        counts[field] = tableInfo.Table?.ItemCount || 0;
      } catch (err) {
        console.error(`Error counting ${model}:`, err);
        counts[field] = 0;
      }
    });
    
    await Promise.all(countPromises);
    return counts;
  }
  
  // Handle single count requests
  const modelName = QUERY_TO_MODEL_MAP[fieldName];
  if (!modelName) {
    console.error('Unknown field name:', fieldName);
    return 0;
  }
  
  const tableName = TABLE_MAPPINGS[modelName];
  if (!tableName) {
    console.error('No table mapping found for model:', modelName);
    return 0;
  }
  
  console.log(`Counting items in table: ${tableName}`);
  
  try {
    // Try DescribeTable first for efficient count (might be stale)
    try {
      const tableInfo = await dynamodbService.describeTable({ TableName: tableName }).promise();
      const itemCount = tableInfo.Table?.ItemCount || 0;
      console.log(`Table ${tableName} has ${itemCount} items (from DescribeTable)`);
      
      // Note: ItemCount is updated approximately every 6 hours
      // For real-time accuracy, comment out this return and let it fall through to Scan
      return itemCount;
      
    } catch (describeError) {
      console.log('DescribeTable failed, falling back to Scan:', describeError.message);
    }
    
    // Fallback to Scan for accurate count
    let totalCount = 0;
    let lastEvaluatedKey = null;
    
    do {
      const params = {
        TableName: tableName,
        Select: 'COUNT',
        ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey })
      };
      
      const result = await dynamodb.scan(params).promise();
      totalCount += result.Count || 0;
      lastEvaluatedKey = result.LastEvaluatedKey;
      
    } while (lastEvaluatedKey);
    
    console.log(`Table ${tableName} has ${totalCount} items (from Scan)`);
    return totalCount;
    
  } catch (error) {
    console.error('Error getting count:', error);
    return 0;
  }
};