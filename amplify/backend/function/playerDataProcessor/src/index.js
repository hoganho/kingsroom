/* Amplify Params - DO NOT EDIT
	API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
	API_KINGSROOM_GRAPHQLAPIIDOUTPUT
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
	ENV
	REGION
Amplify Params - DO NOT EDIT */

/**
 * @type {import('@types/aws-lambda').SQSHandler}
 */
exports.handler = async (event) => {
    console.log(`[playerDataProcessor] Function triggered with ${event.Records.length} message(s).`);

    for (const record of event.Records) {
        try {
            const messageBody = record.body;
            console.log('[playerDataProcessor] Received raw message body:', messageBody);

            // The body is a JSON string, so we parse it into an object
            const gameData = JSON.parse(messageBody);

            console.log('--- Successfully Parsed Game Data ---');
            console.log(`Game ID: ${gameData.id}`);
            console.log(`Game Name: ${gameData.name}`);
            console.log(`Status: ${gameData.gameStatus}`);
            console.log(`Total Results to Process: ${gameData.results?.length || 0}`);
            
            // For detailed inspection in CloudWatch, you can log the whole object
            // console.log('Full game data object:', JSON.stringify(gameData, null, 2));

            // In the future, your player processing logic will go here.
            // For now, we're just logging.

        } catch (error) {
            console.error('[playerDataProcessor] Error processing a message:', error);
            // Throwing the error will cause SQS to retry the message later
            throw error;
        }
    }

    return {
        statusCode: 200,
        body: 'Successfully processed messages.',
    };
};