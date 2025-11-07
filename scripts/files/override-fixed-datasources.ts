import { AmplifyApiGraphQlResourceStackTemplate } from '@aws-amplify/cli-extensibility-helper';
import { CfnResolver, CfnFunctionConfiguration, CfnDataSource } from 'aws-cdk-lib/aws-appsync';

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
 * This function overrides the default Amplify-generated resolvers
 * to add a 'total' count to all list operations.
 */
export function override(resources: AmplifyApiGraphQlResourceStackTemplate) {
  
  // Cast resources to 'any' to bypass faulty type definitions
  const stack = resources as any;

  // --- Get the API ID ---
  let apiId: string;
  
  // Common paths for the GraphQL API ID in Amplify
  if (stack.api?.GraphQLAPI?.attrApiId) {
    apiId = stack.api.GraphQLAPI.attrApiId;
  } else if (stack.api?.graphqlApi?.attrApiId) {
    apiId = stack.api.graphqlApi.attrApiId;
  } else if (stack.graphqlApi?.attrApiId) {
    apiId = stack.graphqlApi.attrApiId;
  } else if (stack.GraphQLAPI?.attrApiId) {
    apiId = stack.GraphQLAPI.attrApiId;
  } else {
    // Alternative: Try to find the GraphQL API in the stack's children
    const graphqlApiChild = stack.node?.tryFindChild('GraphQLAPI') || 
                           stack.node?.tryFindChild('graphqlApi') ||
                           stack.node?.tryFindChild('api');
    
    if (graphqlApiChild?.attrApiId) {
      apiId = graphqlApiChild.attrApiId;
    } else {
      // Last resort: Look through all L1 constructs for an AppSync API
      const allChildren = stack.node?.findAll() || [];
      const appSyncApi = allChildren.find((child: any) => 
        child.constructor?.name === 'CfnGraphQLApi' || 
        child.attrApiId !== undefined
      );
      
      if (appSyncApi?.attrApiId) {
        apiId = appSyncApi.attrApiId;
      } else {
        throw new Error('Could not find GraphQL API ID.');
      }
    }
  }

  console.log(`Found API ID: ${apiId}`);

  // --- Find all data sources ---
  // Data sources might be in different locations depending on Amplify version
  let dataSources: Map<string, any> = new Map();
  
  // Method 1: Try the dataSources map
  if (stack.dataSources && stack.dataSources instanceof Map) {
    dataSources = stack.dataSources;
    console.log('Found dataSources as Map with keys:', Array.from(dataSources.keys()));
  } 
  // Method 2: Try as an object
  else if (stack.dataSources && typeof stack.dataSources === 'object') {
    // Convert object to Map
    Object.keys(stack.dataSources).forEach(key => {
      dataSources.set(key, stack.dataSources[key]);
    });
    console.log('Found dataSources as object with keys:', Object.keys(stack.dataSources));
  }
  // Method 3: Find data sources in the node tree
  else {
    console.log('Looking for data sources in node tree...');
    const allNodes = stack.node?.findAll() || [];
    
    // Find all CfnDataSource nodes
    const dataSourceNodes = allNodes.filter((node: any) => 
      node.constructor?.name === 'CfnDataSource' ||
      node.name?.includes('DataSource') ||
      node.attrDataSourceArn !== undefined
    );
    
    console.log(`Found ${dataSourceNodes.length} data source nodes`);
    
    // Build map from found nodes
    dataSourceNodes.forEach((ds: any) => {
      // Try to extract the model name from the data source
      const dsName = ds.name || ds.node?.id || '';
      
      // Try different patterns to extract model name
      let modelName = '';
      if (dsName.includes('Table')) {
        modelName = dsName.replace('Table', '');
      } else if (dsName.includes('DataSource')) {
        modelName = dsName.replace('DataSource', '');
      } else {
        modelName = dsName;
      }
      
      // Store both with and without 'Table' suffix
      dataSources.set(dsName, ds);
      dataSources.set(`${modelName}Table`, ds);
      dataSources.set(`${modelName}DataSource`, ds);
      
      console.log(`Added data source: ${dsName} (model: ${modelName})`);
    });
  }

  // If still no data sources found, try to access them directly
  if (dataSources.size === 0) {
    console.log('Attempting direct access to data sources...');
    
    // Try to find them as direct children of the stack
    MODELS_TO_OVERRIDE.forEach(({ model }) => {
      const possibleNames = [
        `${model}Table`,
        `${model}DataSource`,
        `${model}TableDataSource`,
        model
      ];
      
      for (const name of possibleNames) {
        const ds = stack.node?.tryFindChild(name) || stack[name];
        if (ds) {
          dataSources.set(`${model}Table`, ds);
          console.log(`Found data source for ${model} as ${name}`);
          break;
        }
      }
    });
  }

  console.log(`Total data sources found: ${dataSources.size}`);
  
  // Loop over every model defined in the config map
  for (const { model, plural, table } of MODELS_TO_OVERRIDE) {
    
    // --- 1. Define Resource Names ---
    const dataSourceName = `${model}Table`;
    const listFieldName = `list${plural}`;
    const originalResolverId = `Query${listFieldName.charAt(0).toUpperCase() + listFieldName.slice(1)}Resolver`;

    // --- 2. Get the Data Source ---
    let dataSource = dataSources.get(dataSourceName);
    
    // Try alternative names if not found
    if (!dataSource) {
      const alternativeNames = [
        `${model}DataSource`,
        `${model}TableDataSource`,
        model,
        `${model.toLowerCase()}Table`,
        `${model.toLowerCase()}DataSource`
      ];
      
      for (const altName of alternativeNames) {
        dataSource = dataSources.get(altName);
        if (dataSource) {
          console.log(`Found data source for ${model} using alternative name: ${altName}`);
          break;
        }
      }
    }
    
    // If still not found, create a new data source
    if (!dataSource) {
      console.log(`Creating new data source for ${model} with table ${table}`);
      
      // Create a new DynamoDB data source
      dataSource = new CfnDataSource(resources, `${model}TableDataSource`, {
        apiId: apiId,
        name: `${model}TableDataSource`,
        type: 'AMAZON_DYNAMODB',
        dynamoDbConfig: {
          tableName: table,
          awsRegion: stack.region || 'us-east-1'
        },
        serviceRoleArn: stack.api?.GraphQLAPIDefaultServiceRole?.attrArn || 
                        stack.GraphQLAPIDefaultServiceRole?.attrArn ||
                        stack.serviceRole?.attrArn ||
                        `arn:aws:iam::${stack.account}:role/amplify-kingsroom-dev-GraphQLAPIRole`
      });
    }
    
    const dataSourceNameToUse = dataSource.name || dataSource.attrName || `${model}TableDataSource`;
    
    try {
      // --- 3. Create "GetList" Function ---
      const getListFunc = new CfnFunctionConfiguration(resources, `Get${model}ListFunc`, {
        apiId: apiId,
        name: `Get${model}ListFunc`,
        dataSourceName: dataSourceNameToUse,
        functionVersion: '2018-05-29',
        requestMappingTemplate: `
          {
            "version": "2018-05-29",
            "operation": "Scan",
            "tableName": "${table}",
            #if($ctx.stash.limit)
              "limit": $ctx.stash.limit,
            #else
              "limit": 50,
            #end
            #if($ctx.stash.nextToken)
              "nextToken": "$ctx.stash.nextToken",
            #end
            #if($ctx.stash.filter)
              "filter": $util.transform.toDynamoDBFilterExpression($ctx.stash.filter)
            #end
          }
        `,
        responseMappingTemplate: `$util.toJson($ctx.result)`
      });

      // --- 4. Create "GetTotal" Function ---
      const getTotalFunc = new CfnFunctionConfiguration(resources, `Get${model}TotalFunc`, {
        apiId: apiId,
        name: `Get${model}TotalFunc`,
        dataSourceName: dataSourceNameToUse,
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
        responseMappingTemplate: `
          #if($ctx.result.count)
            $ctx.result.count
          #else
            0
          #end
        `
      });

      // --- 5. Create the New Pipeline Resolver ---
      const pipelineResolver = new CfnResolver(resources, `${listFieldName}PipelineResolver`, {
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
          $util.qr($ctx.stash.put("limit", $util.defaultIfNull($ctx.args.limit, 50)))
          #if($ctx.args.nextToken)
            $util.qr($ctx.stash.put("nextToken", $ctx.args.nextToken))
          #end
          #if($ctx.args.filter)
            $util.qr($ctx.stash.put("filter", $ctx.args.filter))
          #end
          {}
        `,
        responseMappingTemplate: `
          #set($items = $util.defaultIfNull($ctx.prev.result.items, []))
          #set($nextToken = $util.defaultIfNullOrEmpty($ctx.prev.result.nextToken, null))
          #set($total = $util.defaultIfNull($ctx.result, 0))
          {
            "items": $util.toJson($items),
            "nextToken": #if($nextToken) "$nextToken" #else null #end,
            "total": $total
          }
        `
      });

      // --- 6. Try to remove the old resolver ---
      try {
        const oldResolver = stack.node?.tryFindChild(originalResolverId);
        if (oldResolver) {
          stack.node.tryRemoveChild(originalResolverId);
          console.log(`Removed old resolver: ${originalResolverId}`);
        }
      } catch (e) {
        console.log(`Could not remove old resolver ${originalResolverId}, it may not exist yet`);
      }
      
      console.log(`✅ Successfully created pipeline resolver for ${model}`);
      
    } catch (error) {
      console.error(`❌ Error creating override for ${model}:`, error);
    }
  }
  
  console.log('Override complete!');
}