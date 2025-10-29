// src/context/AuthContext.tsx
import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
} from 'react';
// Correct Amplify v6 import paths
import {
  getCurrentUser,
  signOut as amplifySignOut,
  fetchUserAttributes,
  type AuthUser, // Use 'type' import for types
} from '@aws-amplify/auth';
import { generateClient } from '@aws-amplify/api';
// Import GQL operations normally - ensure `amplify codegen` has run
import { getUser } from '../graphql/queries';
import { createUser as createUserMutation } from '../graphql/mutations';
// Import UserRole from your generated API file (assuming API.ts is in src/)
import { UserRole } from '../API';

// Export UserRole so ProtectedRoute can grab it
export { UserRole };

/**
 * Simple user type for the Kings Room app - aligning more closely with User model
 */
export interface AppUser {
  id: string; // Cognito sub / User ID
  email: string;
  username: string; // Matches schema and Cognito data
  role: UserRole;
  isAuthenticated: boolean;
}

/**
 * AuthContext type definition
 */
export interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  // Define handleSignOut useCallback *before* checkUser useCallback
  const handleSignOut = useCallback(async () => {
    try {
      console.log('[AuthContext] handleSignOut: Attempting sign out...');
      await amplifySignOut({ global: true });
      setUser(null); // Clear user state immediately
      console.log('[AuthContext] handleSignOut: Sign out successful.');
      // Clear non-essential localStorage items
      const keysToPreserve = ['theme', 'language']; // Example: preserve theme setting
      Object.keys(localStorage).forEach((key) => {
        if (!keysToPreserve.includes(key)) {
          localStorage.removeItem(key);
        }
      });
      // Optionally redirect here, e.g., navigate('/login');
    } catch (error) {
      console.error('[AuthContext] handleSignOut: Sign out error:', error);
      setUser(null); // Ensure user is null even on error
    }
  }, []); // Empty dependency array

  /**
   * Fetch or create user in DynamoDB
   */
  const fetchOrCreateDynamoUser = useCallback(
    async (cognitoUser: AuthUser, attributes: any) => {
      const client = generateClient();
      const userId = cognitoUser.userId;
      const username = cognitoUser.username;
      const email = attributes?.email || '';

      // --- 1. Attempt to fetch existing user ---
      try {
        console.log(`[AuthContext] Attempting to fetch user ${userId} from DynamoDB.`);
        const result = await client.graphql({
          query: getUser,
          variables: { id: userId },
        });

        const existingUser = result.data?.getUser;
        if (existingUser) {
          console.log(`[AuthContext] Found existing user:`, existingUser);
          if (existingUser._deleted) {
            console.warn(`[AuthContext] User ${userId} is marked as deleted.`);
            return null; // Treat deleted user as non-existent
          } else {
            return existingUser; // Return valid existing user
          }
        } else {
          console.log(`[AuthContext] User ${userId} not found in DynamoDB (expected for new user).`);
        }
      } catch (getError: any) {
        const isNotFoundError = getError?.errors?.some((e: any) => e.message?.includes('Cannot return null') || e.errorType?.includes('NotFound'));
        if (!isNotFoundError) {
          console.error(`[AuthContext] Unexpected error fetching user ${userId}:`, JSON.stringify(getError, null, 2));
          // If fetch fails unexpectedly (not just 'not found'), maybe stop here?
          // return null; // Or rethrow, depending on desired behavior
        } else {
          console.warn(`[AuthContext] User ${userId} not found (expected).`);
        }
      }

      // --- 2. If not found, attempt to create user ---
      try {
        console.log(`[AuthContext] Attempting to create user ${userId} (${username}, ${email}).`);
        const newUserInput = {
          id: userId,
          username: username,
          email: email,
          role: UserRole.VENUE_MANAGER, // Default role - VERIFY THIS IS CORRECT
        };

        console.log('[AuthContext] Sending createUser input:', JSON.stringify(newUserInput, null, 2));

        const createResult = await client.graphql({
          query: createUserMutation,
          variables: { input: newUserInput },
        });

        if (createResult.data?.createUser && !createResult.errors) {
          console.log(`[AuthContext] Successfully created user:`, createResult.data.createUser);
          return createResult.data.createUser;
        } else {
          // *** THIS IS LIKELY WHERE YOUR ERROR IS BEING LOGGED ***
          console.error('[AuthContext] Create user mutation failed. Response:', JSON.stringify(createResult, null, 2));
          // Log the specific GraphQL errors if available
          if (createResult.errors) {
            createResult.errors.forEach((err: any) => console.error(`[AuthContext] GraphQL Error: ${err.message}`, err));
          }
          return null; // Indicate creation failed
        }
      } catch (mutationError: any) {
        // Catch network errors or unexpected exceptions during the GraphQL call itself
        console.error('[AuthContext] Exception during createUser mutation call:', JSON.stringify(mutationError, null, 2));
        return null; // Indicate creation failed
      }
    },
    []
  );

  /**
   * Check current user status (Cognito + DynamoDB)
   */
  const checkUser = useCallback(async () => {
    setLoading(true);
    try {
      console.log('[AuthContext] checkUser: Checking Cognito session...');
      const cognitoUser = await getCurrentUser(); // Throws if no session
      console.log('[AuthContext] checkUser: Cognito session active:', cognitoUser);

      console.log('[AuthContext] checkUser: Fetching Cognito attributes...');
      let attributes;
      try {
        attributes = await fetchUserAttributes();
        console.log('[AuthContext] checkUser: Cognito attributes fetched:', attributes);
      } catch (attrError: any) {
         // ✅ Handle the specific "Invalid login token" error
         console.error('[AuthContext] checkUser: Failed to fetch Cognito attributes:', attrError);
         // If it's a NotAuthorizedException, the session is truly invalid.
         if (attrError.name === 'NotAuthorizedException' || attrError.message.includes('token')) {
            console.log('[AuthContext] checkUser: Invalid session detected. Signing out.');
            await handleSignOut(); // Force sign out
         }
         // For other errors, maybe just prevent further processing
         setUser(null); // Ensure user state is cleared on attribute error
         return; // Stop processing this checkUser call
      }

      console.log('[AuthContext] checkUser: Fetching/Creating DynamoDB user...');
      const dynamoDbUserObject = await fetchOrCreateDynamoUser(cognitoUser, attributes);

      if (dynamoDbUserObject && dynamoDbUserObject.id) {
        console.log('[AuthContext] checkUser: Valid DynamoDB user object received:', dynamoDbUserObject);
        setUser({
          id: dynamoDbUserObject.id,
          email: dynamoDbUserObject.email || '',
          username: dynamoDbUserObject.username || cognitoUser.username,
          // Ensure role comes from DB object, falling back to default ONLY if missing
          role: dynamoDbUserObject.role || UserRole.VENUE_MANAGER,
          isAuthenticated: true,
        });
        console.log('[AuthContext] checkUser: User state set successfully.');
      } else {
         console.error('[AuthContext] checkUser: Failed to get/create valid user in DynamoDB. User state NOT set.');
         setUser(null); // Critical: Ensure user is null if DB sync fails
         // Optional: Sign out if DB record is mandatory for app functionality
         // console.log('[AuthContext] checkUser: Signing out because DynamoDB user sync failed.');
         // await handleSignOut();
      }

    } catch (error) {
      // Catch errors from getCurrentUser (no active Cognito session)
      console.warn('[AuthContext] checkUser: Auth check failed (likely no active Cognito session).');
      setUser(null); // No session, so no user
    } finally {
      setLoading(false);
       console.log('[AuthContext] checkUser: Loading finished.');
    }
  }, [fetchOrCreateDynamoUser, handleSignOut]); // Dependencies

  /** Initial auth check */
  useEffect(() => {
    console.log('[AuthContext] Initial mount: Triggering checkUser.');
    checkUser();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Re-check on tab visibility */
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !loading && !user) {
        console.log('[AuthContext] Tab became visible and no user, re-checking auth.');
        checkUser();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      console.log('[AuthContext] Cleaning up visibility listener.');
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkUser, loading, user]);

  const value: AuthContextType = { user, loading, signOut: handleSignOut, refreshUser: checkUser };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// --- Hooks ---
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};

export const useRole = () => {
  const { user } = useAuth();
  return {
    isAdmin: user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.ADMIN,
    isSuperAdmin: user?.role === UserRole.SUPER_ADMIN,
    isVenueManager: user?.role === UserRole.VENUE_MANAGER,
    isTournamentDirector: user?.role === UserRole.TOURNAMENT_DIRECTOR,
    isMarketing: user?.role === UserRole.MARKETING,
    hasRole: (role: UserRole) => user?.role === role,
    hasAnyRole: (roles: UserRole[]) => (user ? roles.includes(user.role) : false),
  };
};

export { AuthContext };

