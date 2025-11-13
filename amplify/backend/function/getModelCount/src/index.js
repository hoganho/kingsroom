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

// ✅ FIXED: Use modular AWS SDK v3
const { DynamoDBClient, DescribeTableCommand } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");

// Create a v3 DynamoDB Client
const client = new DynamoDBClient({});
// Create a v3 Document Client
const dynamodb = DynamoDBDocumentClient.from(client);
// The main client is used for non-DocumentClient commands like DescribeTable
const dynamodbService = client; 

// Map models to the environment variables provided by Amplify
const TABLE_MAPPINGS = {
  'Player': process.env.API_KINGSROOM_PLAYERTABLE_NAME,
  'PlayerSummary': process.env.API_KINGSROOM_PLAYERSUMMARYTABLE_NAME,
  'PlayerEntry': process.env.API_KINGSROOM_PLAYERENTRYTABLE_NAME,
  'PlayerResult': process.env.API_KINGSROOM_PLAYERRESULTTABLE_NAME,
  'PlayerVenue': process.env.API_KINGSROOM_PLAYERVENUETABLE_NAME,
  'PlayerTransaction': process.env.API_KINGSROOM_PLAYERTRANSACTIONTABLE_NAME,
  'PlayerCredits': process.env.API_KINGSROOM_PLAYERCREDITSTABLE_NAME,
  'PlayerPoints': process.env.API_KINGSROOM_PLAYERPOINTSTABLE_NAME,
  'PlayerTicket': process.env.API_KINGSROOM_PLAYERTICKETTABLE_NAME,
  'PlayerMarketingPreferences': process.env.API_KINGSROOM_PLAYERMARKETINGPREFERENCESTABLE_NAME,
  'PlayerMarketingMessage': process.env.API_KINGSROOM_PLAYERMARKETINGMESSAGETABLE_NAME,
  'Game': process.env.API_KINGSROOM_GAMETABLE_NAME,
  'TournamentStructure': process.env.API_KINGSROOM_TOURNAMENTSTRUCTURETABLE_NAME
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

/**
 * Gets the count for a single table using an (expensive) Scan.
 * This is accurate but slow.
 * ✅ FIXED: Updated to use v3 Document Client and ScanCommand
 */
const getAccurateCount = async (tableName) => {
  let totalCount = 0;
  let lastEvaluatedKey = null;

  do {
    const params = {
      TableName: tableName,
      Select: 'COUNT',
      ...(lastEvaluatedKey && { ExclusiveStartKey: lastEvaluatedKey })
    };

    // Use v3 .send() method with a Command
    const result = await dynamodb.send(new ScanCommand(params));
    totalCount += result.Count || 0;
    lastEvaluatedKey = result.LastEvaluatedKey;

  } while (lastEvaluatedKey);

  console.log(`Table ${tableName} has ${totalCount} items (from Scan)`);
  return totalCount;
};

/**
 * Gets the (stale) count for a single table using DescribeTable.
 * This is fast but can be up to 6 hours out of date.
 * ✅ FIXED: Updated to use v3 Client and DescribeTableCommand
 */
const getStaleCount = async (tableName) => {
  try {
    // Use v3 .send() method with a Command
    const tableInfo = await dynamodbService.send(new DescribeTableCommand({ TableName: tableName }));
    const itemCount = tableInfo.Table?.ItemCount || 0;
    console.log(`Table ${tableName} has ${itemCount} items (from DescribeTable)`);
    return itemCount;
  } catch (err) {
    console.error(`Error with DescribeTable for ${tableName}:`, err);
    return 0;
  }
};


exports.handler = async (event) => {
  console.log('Event received:', JSON.stringify(event, null, 2));
  
  const fieldName = event.fieldName;
  console.log('Field name:', fieldName);
  
  // Handle batch request for all counts
  if (fieldName === 'getAllCounts') {
    const counts = {};
    
    // For "getAllCounts", we use the FAST (but stale) DescribeTable method.
    const countPromises = Object.entries(QUERY_TO_MODEL_MAP).map(async ([field, model]) => {
      const tableName = TABLE_MAPPINGS[model];
      if (!tableName) {
        console.error(`No table mapping for ${model}`);
        counts[field] = 0;
        return;
      }
      counts[field] = await getStaleCount(tableName);
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
  
  console.log(`Getting ACCURATE count for: ${tableName}`);
  
  try {
    // For single count requests, we use the ACCURATE (but slow) Scan.
    return await getAccurateCount(tableName);
    
  } catch (error) {
    console.error('Error getting accurate count:', error);
    return 0;
  }
};