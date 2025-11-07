import { AmplifyApiGraphQlResourceStackTemplate } from '@aws-amplify/cli-extensibility-helper';

/**
 * Diagnostic override to understand the structure of the Amplify stack
 */
export function override(resources: AmplifyApiGraphQlResourceStackTemplate) {
  
  const stack = resources as any;
  
  console.log('\n=== DIAGNOSTIC OUTPUT ===\n');
  
  // 1. Check top-level properties
  console.log('Top-level stack properties:');
  console.log(Object.keys(stack).filter(k => !k.startsWith('_')));
  
  // 2. Check api properties
  if (stack.api) {
    console.log('\nstack.api properties:');
    console.log(Object.keys(stack.api));
  }
  
  // 3. Check for data sources
  console.log('\nChecking for dataSources:');
  console.log('- stack.dataSources exists?', !!stack.dataSources);
  if (stack.dataSources) {
    console.log('- dataSources type:', typeof stack.dataSources);
    if (stack.dataSources instanceof Map) {
      console.log('- dataSources Map keys:', Array.from(stack.dataSources.keys()));
    } else if (typeof stack.dataSources === 'object') {
      console.log('- dataSources object keys:', Object.keys(stack.dataSources));
    }
  }
  
  // 4. Find all children nodes
  console.log('\nAll child nodes:');
  if (stack.node) {
    const children = stack.node.findAll();
    const relevantChildren = children.filter((child: any) => {
      const name = child.node?.id || child.constructor?.name || '';
      return name.includes('Player') || 
             name.includes('Game') || 
             name.includes('Tournament') ||
             name.includes('DataSource') ||
             name.includes('Table') ||
             name === 'CfnDataSource';
    });
    
    relevantChildren.forEach((child: any) => {
      console.log(`- ${child.node?.id || 'Unknown'} (${child.constructor?.name})`);
      
      // If it's a data source, show more details
      if (child.constructor?.name === 'CfnDataSource' || child.name?.includes('DataSource')) {
        console.log(`  - name: ${child.name}`);
        console.log(`  - attrName: ${child.attrName}`);
        console.log(`  - dynamoDbConfig: ${JSON.stringify(child.dynamoDbConfig)}`);
      }
    });
  }
  
  // 5. Check for models
  console.log('\nLooking for model-related objects:');
  const modelNames = ['Player', 'PlayerSummary', 'PlayerEntry', 'Game', 'TournamentStructure'];
  
  modelNames.forEach(model => {
    const possibleNames = [
      model,
      `${model}Table`,
      `${model}DataSource`,
      `${model}TableDataSource`
    ];
    
    possibleNames.forEach(name => {
      if (stack[name]) {
        console.log(`Found stack.${name}`);
      }
      if (stack.node?.tryFindChild(name)) {
        console.log(`Found node child: ${name}`);
      }
    });
  });
  
  // 6. Check resolvers
  console.log('\nLooking for resolvers:');
  if (stack.resolvers) {
    console.log('- stack.resolvers exists');
    if (stack.resolvers instanceof Map) {
      console.log('- Resolver keys:', Array.from(stack.resolvers.keys()));
    } else if (typeof stack.resolvers === 'object') {
      console.log('- Resolver keys:', Object.keys(stack.resolvers));
    }
  }
  
  // 7. Try to find API ID
  console.log('\nAPI ID locations:');
  const apiIdLocations = [
    { path: 'stack.api.GraphQLAPI.attrApiId', value: stack.api?.GraphQLAPI?.attrApiId },
    { path: 'stack.api.graphqlApi.attrApiId', value: stack.api?.graphqlApi?.attrApiId },
    { path: 'stack.graphqlApi.attrApiId', value: stack.graphqlApi?.attrApiId },
    { path: 'stack.GraphQLAPI.attrApiId', value: stack.GraphQLAPI?.attrApiId }
  ];
  
  apiIdLocations.forEach(loc => {
    if (loc.value) {
      console.log(`✓ Found at ${loc.path}: ${loc.value}`);
    }
  });
  
  console.log('\n=== END DIAGNOSTIC OUTPUT ===\n');
  
  // Don't make any actual changes
  console.log('This is a diagnostic run only - no overrides applied.');
}