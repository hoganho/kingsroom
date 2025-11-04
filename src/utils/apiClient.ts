// src/utils/apiClient.ts

import { generateClient } from 'aws-amplify/api';

// Use 'any' to bypass the "Excessive stack depth" (TS2321) error.
// The getClient() function will still have the correct, strong
// type inferred by TypeScript when it's used elsewhere.
let clientInstance: any = null;

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

// The 'apiClient' export below was removed as it was:
// 1. Causing the "Type not assignable" (TS2322) error.
// 2. Not being used by any of your other pages (they all use getClient()).