// src/utils/apiClient.ts

import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api-graphql';

let clientInstance: ReturnType<typeof generateClient> | null = null;

/**
 * Get or create the GraphQL client instance.
 * This ensures the client is only created after Amplify has been configured.
 */
export const getClient = () => {
  if (!clientInstance) {
    clientInstance = generateClient();
  }
  return clientInstance;
};

// Optional: Export a typed version for better TypeScript support
export const apiClient = {
  graphql: <T = any>(options: any): Promise<GraphQLResult<T>> => {
    return getClient().graphql(options);
  }
};
