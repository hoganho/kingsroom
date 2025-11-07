import { AmplifyApiGraphQlResourceStackTemplate } from '@aws-amplify/cli-extensibility-helper';
import { CfnResolver, CfnFunctionConfiguration } from 'aws-cdk-lib/aws-appsync';

// --- Configuration ---
const MODELS_TO_OVERRIDE = [
  // --- From PlayersDebug.tsx ---
  { model: "Player", plural: "Players", table: "Player-oi5oitkajrgtzm7feellfluriy-dev" },
  { model: "PlayerSummary", plural: "PlayerSummaries", table: "PlayerSummary-oi5oitkajrgtzm7feellfluriy-dev" },
  { model: "PlayerEntry", plural: "PlayerEntries", table: "PlayerEntry-oi5oitkajrgtzm7feellfluriy-dev" },
  { model: "PlayerResult", plural: "PlayerResults", table: "PlayerResult-oi5oitkajrgtzm7feellfluriy-dev" },
  { model: "PlayerVenue", plural: "PlayerVenues", table: "PlayerVenue-oi5oitkajrgtzm7feellfluriy-dev" },
  { model: "PlayerTransaction", plural: "PlayerTransactions", table: "PlayerTransaction-oi5oitkajrgtzm7feellfluriy-dev" },
  { model: "PlayerCredits", plural: "PlayerCredits", table: "PlayerCredits-oi5oitkajrgtzm7feellfluriy-dev" },
  { model: "PlayerPoints", plural: "PlayerPoints", table: "PlayerPoints-oi5oitkajrgtzm7feellfluriy-dev" },
  { model: "PlayerTicket", plural: "PlayerTickets", table: "PlayerTicket-oi5oitkajrgtzm7feellfluriy-dev" },
  { model: "PlayerMarketingPreferences", plural: "PlayerMarketingPreferences", table: "PlayerMarketingPreferences-oi5oitkajrgtzm7feellfluriy-dev" },
  
  // --- From GamesDebug.tsx ---
  { model: "Game", plural: "Games", table: "Game-oi5oitkajrgtzm7feellfluriy-dev" },
  { model: "TournamentStructure", plural: "TournamentStructures", table: "TournamentStructure-oi5oitkajrgtzm7feellfluriy-dev" },
];

/**
 * Simplified override using Amplify's structure
 */
export function override(resources: AmplifyApiGraphQlResourceStackTemplate) {
  
  // Get the GraphQL API reference
  const graphqlApi = resources.api.GraphQLAPI;
  const apiId = graphqlApi.attrApiId;
  
  console.log(`Found API ID: ${apiId}`);
  
  // Loop over every model
  for (const { model, plural, table } of MODELS_TO_OVERRIDE) {
    
    const listFieldName = `list${plural}`;
    
    try {
      // Use the model-based data source naming that Amplify generates
      // Amplify typically creates data sources with the pattern: {ModelName}Table
      const dataSourceName = `${model}Table`;
      
      console.log(`Processing ${model} with data source ${dataSourceName}`);
      
      // --- Create "GetList" Function ---
      const getListFunc = new CfnFunctionConfiguration(resources, `Get${model}ListFunc`, {
        apiId: apiId,
        name: `Get${model}ListFunc`,
        dataSourceName: dataSourceName,
        functionVersion: '2018-05-29',
        requestMappingTemplate: `
          #set($limit = $util.defaultIfNull($ctx.stash.limit, 50))
          {
            "version": "2018-05-29",
            "operation": "Scan",
            "tableName": "${table}",
            "limit": $limit
            #if($ctx.stash.nextToken)
              ,"nextToken": "$ctx.stash.nextToken"
            #end
            #if($ctx.stash.filter)
              ,"filter": $util.transform.toDynamoDBFilterExpression($ctx.stash.filter)
            #end
          }
        `,
        responseMappingTemplate: `$util.toJson($ctx.result)`
      });

      // --- Create "GetTotal" Function ---
      const getTotalFunc = new CfnFunctionConfiguration(resources, `Get${model}TotalFunc`, {
        apiId: apiId,
        name: `Get${model}TotalFunc`,
        dataSourceName: dataSourceName,
        functionVersion: '2018-05-29',
        requestMappingTemplate: `
          {
            "version": "2018-05-29",
            "operation": "Scan",
            "tableName": "${table}",
            "select": "COUNT"
            #if($ctx.stash.filter)
              ,"filter": $util.transform.toDynamoDBFilterExpression($ctx.stash.filter)
            #end
          }
        `,
        responseMappingTemplate: `$util.toJson($ctx.result.count)`
      });

      // --- Create Pipeline Resolver ---
      new CfnResolver(resources, `${model}ListPipelineResolver`, {
        apiId: apiId,
        typeName: 'Query',
        fieldName: listFieldName,
        kind: 'PIPELINE',
        pipelineConfig: {
          functions: [
            getListFunc.attrFunctionId,
            getTotalFunc.attrFunctionId
          ],
        },
        requestMappingTemplate: `
          ## Initialize the stash
          $util.qr($ctx.stash.put("limit", $util.defaultIfNull($ctx.args.limit, 50)))
          $util.qr($ctx.stash.put("nextToken", $util.defaultIfNull($ctx.args.nextToken, null)))
          $util.qr($ctx.stash.put("filter", $util.defaultIfNull($ctx.args.filter, null)))
          {}
        `,
        responseMappingTemplate: `
          ## Combine results from both functions
          #set($items = $util.defaultIfNull($ctx.prev.result.items, []))
          #set($nextToken = $ctx.prev.result.nextToken)
          #set($total = $util.defaultIfNull($ctx.result, 0))
          
          {
            "items": $util.toJson($items),
            "nextToken": #if($nextToken) "$nextToken" #else null #end,
            "total": $total
          }
        `
      });
      
      console.log(`✅ Created pipeline resolver for ${model}`);
      
    } catch (error) {
      console.error(`❌ Error creating override for ${model}:`, error);
    }
  }
}