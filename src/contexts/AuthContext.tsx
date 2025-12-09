// src/contexts/AuthContext.tsx
import React, {
  createContext,
  useState,
  useEffect,
  useContext,
  useCallback,
  useRef,
} from 'react';
import {
  getCurrentUser,
  signOut as amplifySignOut,
  fetchUserAttributes,
  type AuthUser,
} from '@aws-amplify/auth';
import { generateClient } from '@aws-amplify/api';
// We remove the standard imports that cause the over-fetching
// import { getUser } from '../graphql/queries'; 
// import { createUser as createUserMutation } from '../graphql/mutations';
import { UserRole } from '../API';
import { updateUser } from '../graphql/mutations';

export { UserRole };

// --- CUSTOM GRAPHQL OPERATIONS (To avoid fetching corrupted auditLogs) ---

const customGetUser = /* GraphQL */ `
  query GetUser($id: ID!) {
    getUser(id: $id) {
      id
      username
      email
      role
      firstName
      lastName
      avatar
      isActive
      allowedEntityIds
      defaultEntityId
      allowedPages
      _version
      _deleted
      _lastChangedAt
      createdAt
      updatedAt
    }
  }
`;

const customCreateUser = /* GraphQL */ `
  mutation CreateUser($input: CreateUserInput!, $condition: ModelUserConditionInput) {
    createUser(input: $input, condition: $condition) {
      id
      username
      email
      role
      firstName
      lastName
      avatar
      isActive
      allowedEntityIds
      defaultEntityId
      allowedPages
      _version
      _deleted
      _lastChangedAt
      createdAt
      updatedAt
    }
  }
`;

// ---------------------------------------------------------------------

export interface AppUser {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  isAuthenticated: boolean;
  firstName?: string | null;
  lastName?: string | null;
  avatar?: string | null; 
  allowedPages?: string[] | null;
  allowedEntityIds?: string[] | null; // Added field
  defaultEntityId?: string | null;    // Added field
  _version?: number; // Needed for updates
}

export interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  userRole: UserRole | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const checkUserCalled = useRef(false);

  const handleSignOut = useCallback(async () => {
    try {
      console.log('[AuthContext] handleSignOut: Attempting sign out...');
      await amplifySignOut({ global: true });
      setUser(null);
      console.log('[AuthContext] handleSignOut: Sign out successful.');
      const keysToPreserve = ['theme', 'language'];
      Object.keys(localStorage).forEach((key) => {
        if (!keysToPreserve.includes(key)) {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.error('[AuthContext] handleSignOut: Sign out error:', error);
      setUser(null);
    }
  }, []);

  const fetchOrCreateDynamoUser = useCallback(
    async (cognitoUser: AuthUser, attributes: any) => {
      const client = generateClient();
      const userId = cognitoUser.userId;
      const username = cognitoUser.username;
      const email = attributes?.email || '';

      try {
        console.log(`[AuthContext] Attempting to fetch user ${userId} from DynamoDB.`);
        
        // FIX 1: Use customGetUser to avoid fetching corrupted 'auditLogs' relationships
        const result: any = await client.graphql({
          query: customGetUser,
          variables: { id: userId },
          authMode: 'userPool',
        });

        const existingUser = result.data?.getUser;
        if (existingUser) {
          if (existingUser._deleted) return null;
          return existingUser;
        }
      } catch (getError: any) {
        console.warn(`[AuthContext] Initial fetch failed or empty. Proceeding to create.`);
      }

      try {
        console.log(`[AuthContext] Attempting to create user ${userId} (${username}, ${email}).`);
        const newUserInput = {
          id: userId,
          username: username,
          email: email,
          role: UserRole.VENUE_MANAGER,
        };

        // FIX 2: Use customCreateUser for the same reason (avoid over-fetching on return)
        const createResult: any = await client.graphql({
          query: customCreateUser,
          variables: { input: newUserInput },
          authMode: 'userPool',
        });

        if (createResult.data?.createUser) {
          return createResult.data.createUser;
        }
      } catch (mutationError: any) {
        // Handle Race Condition (User existed but fetch failed or created in parallel)
        const isConditionalCheckFailed = mutationError?.errors?.some(
          (e: any) => e.errorType === 'ConditionalCheckFailedException'
        );

        if (isConditionalCheckFailed) {
          console.warn('[AuthContext] User already created by another process. Retrying fetch.');
          
          try {
            // Retry with custom query
            const retryResult: any = await client.graphql({
              query: customGetUser,
              variables: { id: userId },
              authMode: 'userPool',
            });
            return retryResult.data?.getUser || null;
          } catch (retryError: any) {
             console.warn('[AuthContext] Recovery fetch encountered an issue:', retryError);
             
             // Fallback construction to prevent app crash
             return {
                id: userId,
                username: username,
                email: email,
                role: UserRole.VENUE_MANAGER,
                isAuthenticated: true,
                firstName: null,
                lastName: null,
                avatar: null,
                _version: undefined
            };
          }
        }
        
        console.error('[AuthContext] Create mutation failed:', mutationError);
        return null;
      }
      return null;
    },
    []
  );

  const checkUser = useCallback(async () => {
    setLoading(true);
    try {
      console.log('[AuthContext] checkUser: Checking Cognito session...');
      const cognitoUser = await getCurrentUser();
      
      console.log('[AuthContext] checkUser: Fetching Cognito attributes...');
      let attributes;
      try {
        attributes = await fetchUserAttributes();
        console.log('[AuthContext] checkUser: Cognito attributes fetched:', attributes);
      } catch (attrError: any) {
        console.error('[AuthContext] checkUser: Failed to fetch Cognito attributes:', attrError);
        // If we can't get attributes, the session is likely stale
        setUser(null);
        return;
      }

      console.log('[AuthContext] checkUser: Fetching/Creating DynamoDB user...');
      const dynamoDbUserObject = await fetchOrCreateDynamoUser(cognitoUser, attributes);

      if (dynamoDbUserObject && dynamoDbUserObject.id) {
        console.log('[AuthContext] checkUser: Valid DynamoDB user object received:', dynamoDbUserObject);
        
        // Cast to any to access system fields like _version
        const userData = dynamoDbUserObject as any;

        setUser({
          id: userData.id,
          email: userData.email || '',
          username: userData.username || cognitoUser.username,
          role: userData.role || UserRole.VENUE_MANAGER,
          isAuthenticated: true,
          firstName: userData.firstName,
          lastName: userData.lastName,
          avatar: userData.avatar,
          allowedPages: userData.allowedPages,
          allowedEntityIds: userData.allowedEntityIds, // Mapped field
          defaultEntityId: userData.defaultEntityId,   // Mapped field
          _version: userData._version // Capture version for optimistic locking
        });
        console.log('[AuthContext] checkUser: User state set successfully.');

        // FIX 3: Check for version before attempting update to avoid errors on fallback objects
        if (userData._version) {
          try {
            const client = generateClient();
            await client.graphql({
              query: updateUser,
              variables: {
                // FIX 4: Cast input 'as any' to fix TypeScript error regarding 'lastLoginAt'
                input: {
                  id: userData.id,
                  lastLoginAt: new Date().toISOString(),
                  _version: userData._version
                } as any 
              },
              authMode: 'userPool'
            });
            console.log('[AuthContext] Audit: Login timestamp updated.');
          } catch (setupError) {
            console.debug('[AuthContext] Audit: Timestamp update skipped (minor).');
          }
        } else {
             console.warn('[AuthContext] Skipping LastLogin update (Fallback User / No Version detected)');
        }

      } else {
        console.error('[AuthContext] checkUser: Failed to get/create valid user in DynamoDB.');
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

  useEffect(() => {
    if (!checkUserCalled.current) {
        checkUserCalled.current = true;
        console.log('[AuthContext] Initial mount: Triggering checkUser.');
        checkUser();
    }
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !loading && !user) {
        console.log('[AuthContext] Tab became visible and no user, re-checking auth.');
        checkUser();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkUser, loading, user]);

  const value: AuthContextType = { 
    user, 
    loading, 
    signOut: handleSignOut, 
    refreshUser: checkUser,
    userRole: user?.role ?? null
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

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