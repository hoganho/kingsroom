// src/contexts/AuthContext.tsx - Updated to fix race conditions and double mounting
import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
  useRef, // Added useRef
} from 'react';
// Correct Amplify v6 import paths
import {
  getCurrentUser,
  signOut as amplifySignOut,
  fetchUserAttributes,
  type AuthUser,
} from '@aws-amplify/auth';
import { generateClient } from '@aws-amplify/api';
// Import GQL operations
import { getUser } from '../graphql/queries';
import { createUser as createUserMutation } from '../graphql/mutations';
// Import UserRole from your generated API file
import { UserRole } from '../API';

// Export UserRole so components can use it
export { UserRole };

/**
 * Simple user type for the Kings Room app
 */
export interface AppUser {
  id: string; // Cognito sub / User ID
  email: string;
  username: string;
  role: UserRole;
  isAuthenticated: boolean;
}

/**
 * AuthContext type definition - Enhanced for new sidebar
 */
export interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  // User's role directly from Cognito group / UserRole enum
  userRole: UserRole | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Ref to prevent double execution of checkUser on mount (React.StrictMode issue)
  const checkUserCalled = useRef(false);

  // Define handleSignOut useCallback *before* checkUser useCallback
  const handleSignOut = useCallback(async () => {
    try {
      console.log('[AuthContext] handleSignOut: Attempting sign out...');
      await amplifySignOut({ global: true });
      setUser(null); // Clear user state immediately
      console.log('[AuthContext] handleSignOut: Sign out successful.');
      // Clear non-essential localStorage items
      const keysToPreserve = ['theme', 'language'];
      Object.keys(localStorage).forEach((key) => {
        if (!keysToPreserve.includes(key)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('[AuthContext] handleSignOut: Sign out error:', error);
      setUser(null); // Ensure user is null even on error
    }
  }, []);

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
          authMode: 'userPool',
        });

        const existingUser = result.data?.getUser;
        if (existingUser) {
          if (existingUser._deleted) return null;
          return existingUser;
        }
      } catch (getError: any) {
        // Log but continue to creation
        console.warn(`[AuthContext] Initial fetch failed or empty. Proceeding to create.`);
      }

      // --- 2. If not found, attempt to create user ---
      try {
        console.log(`[AuthContext] Attempting to create user ${userId} (${username}, ${email}).`);
        const newUserInput = {
          id: userId,
          username: username,
          email: email,
          role: UserRole.VENUE_MANAGER,
        };

        const createResult = await client.graphql({
          query: createUserMutation,
          variables: { input: newUserInput },
          authMode: 'userPool',
        });

        if (createResult.data?.createUser) {
          return createResult.data.createUser;
        }
      } catch (mutationError: any) {
        // --- RACE CONDITION HANDLING ---
        const isConditionalCheckFailed = mutationError?.errors?.some(
          (e: any) => e.errorType === 'ConditionalCheckFailedException'
        );

        if (isConditionalCheckFailed) {
          console.warn('[AuthContext] User already created by another process. Retrying fetch.');
          
          try {
            const retryResult = await client.graphql({
              query: getUser,
              variables: { id: userId },
              authMode: 'userPool',
            });
            return retryResult.data?.getUser || null;
          } catch (retryError: any) {
             console.error('[AuthContext] Recovery fetch failed:', retryError);

             // === FIX: Handle Schema/Metadata Mismatches ===
             const isSchemaError = retryError?.errors?.some((e: any) => 
                e.message?.includes('Cannot return null for non-nullable type')
             );

             if (isSchemaError) {
                console.warn('[AuthContext] Schema mismatch detected (missing _version). Returning fallback user object.');
                // Return a constructed user object to allow login to proceed
                return {
                    id: userId,
                    username: username,
                    email: email,
                    role: UserRole.VENUE_MANAGER, // Fallback role
                    isAuthenticated: true,
                    // Add any other strictly required fields from your User type here
                };
             }
             return null;
          }
        }
        
        console.error('[AuthContext] Create mutation failed:', mutationError);
        return null;
      }
      return null;
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
      const cognitoUser = await getCurrentUser();
      console.log('[AuthContext] checkUser: Cognito session active:', cognitoUser);

      console.log('[AuthContext] checkUser: Fetching Cognito attributes...');
      let attributes;
      try {
        attributes = await fetchUserAttributes();
        console.log('[AuthContext] checkUser: Cognito attributes fetched:', attributes);
      } catch (attrError: any) {
        console.error('[AuthContext] checkUser: Failed to fetch Cognito attributes:', attrError);
        if (attrError.name === 'NotAuthorizedException' || attrError.message.includes('token')) {
          console.log('[AuthContext] checkUser: Invalid session detected. Signing out.');
          await handleSignOut();
        }
        setUser(null);
        return;
      }

      console.log('[AuthContext] checkUser: Fetching/Creating DynamoDB user...');
      const dynamoDbUserObject = await fetchOrCreateDynamoUser(cognitoUser, attributes);

      if (dynamoDbUserObject && dynamoDbUserObject.id) {
        console.log('[AuthContext] checkUser: Valid DynamoDB user object received:', dynamoDbUserObject);
        setUser({
          id: dynamoDbUserObject.id,
          email: dynamoDbUserObject.email || '',
          username: dynamoDbUserObject.username || cognitoUser.username,
          role: dynamoDbUserObject.role || UserRole.VENUE_MANAGER,
          isAuthenticated: true,
        });
        console.log('[AuthContext] checkUser: User state set successfully.');
      } else {
        console.error('[AuthContext] checkUser: Failed to get/create valid user in DynamoDB. User state NOT set.');
        setUser(null);
      }

    } catch (error) {
      console.warn('[AuthContext] checkUser: Auth check failed (likely no active Cognito session).');
      setUser(null);
    } finally {
      setLoading(false);
      console.log('[AuthContext] checkUser: Loading finished.');
    }
  }, [fetchOrCreateDynamoUser, handleSignOut]);

  /** Initial auth check */
  useEffect(() => {
    // Only run if we haven't checked yet
    if (!checkUserCalled.current) {
        checkUserCalled.current = true;
        console.log('[AuthContext] Initial mount: Triggering checkUser.');
        checkUser();
    } else {
        console.log('[AuthContext] Initial mount: Skipping duplicate checkUser call.');
    }
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

  const value: AuthContextType = { 
    user, 
    loading, 
    signOut: handleSignOut, 
    refreshUser: checkUser,
    // Return the actual UserRole enum value directly
    userRole: user?.role ?? null
  };

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