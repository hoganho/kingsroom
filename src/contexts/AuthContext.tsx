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
import { createStandaloneLogger } from '../hooks/useActivityLogger';

// ============================================
// TYPES
// ============================================

/**
 * User roles matching the GraphQL schema
 */
export enum UserRole {
  SUPER_ADMIN = 'SUPER_ADMIN',
  ADMIN = 'ADMIN',
  VENUE_MANAGER = 'VENUE_MANAGER',
  TOURNAMENT_DIRECTOR = 'TOURNAMENT_DIRECTOR',
  MARKETING = 'MARKETING',
}

/**
 * Application user object - combines Cognito auth with DynamoDB user data
 */
export interface AppUser {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  isAuthenticated: boolean;
  firstName?: string | null;
  lastName?: string | null;
  avatar?: string | null;
  // Page permissions - controls which routes user can access
  allowedPages?: string[] | null;
  // Entity permissions - controls which business data user can see
  allowedEntityIds?: string[] | null;
  allowedVenueIds?: string[] | null;
  defaultEntityId?: string | null;
  // Internal tracking
  _version?: number;
}

/**
 * DynamoDB user record shape (subset we care about)
 */
interface DynamoDBUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  firstName?: string | null;
  lastName?: string | null;
  avatar?: string | null;
  isActive?: boolean | null;
  allowedPages?: string[] | null;
  allowedEntityIds?: string[] | null;
  allowedVenueIds?: string[] | null;
  defaultEntityId?: string | null;
  _version?: number;
  _deleted?: boolean | null;
  _lastChangedAt?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
  userRole: UserRole | null;
}

// ============================================
// CUSTOM GRAPHQL OPERATIONS
// ============================================
// Using custom queries to avoid fetching nested relationships
// that may have corrupted/large data (like auditLogs)

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
      allowedVenueIds
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
      allowedVenueIds
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

// Custom mutation that includes lastLoginAt (not in standard UpdateUserInput)
const customUpdateUserLogin = /* GraphQL */ `
  mutation UpdateUserLogin($input: UpdateUserInput!) {
    updateUser(input: $input) {
      id
      _version
    }
  }
`;

// ============================================
// CONTEXT
// ============================================

const AuthContext = createContext<AuthContextType | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  const checkUserCalled = useRef(false);

  /**
   * Sign out the current user
   */
  const handleSignOut = useCallback(async () => {
    try {
      console.log('[AuthContext] Signing out...');
      
      // Log logout BEFORE destroying the session (while credentials still valid)
      if (user?.id) {
        try {
          const logger = createStandaloneLogger(user.id);
          await logger('LOGOUT', '/auth', { 
            loggedOutAt: new Date().toISOString() 
          });
        } catch (logError) {
          // Don't block sign out if logging fails
          console.warn('[AuthContext] Failed to log logout:', logError);
        }
      }
      
      await amplifySignOut({ global: true });
      setUser(null);
      
      // Clear localStorage except for preserved keys
      const keysToPreserve = ['theme', 'language'];
      Object.keys(localStorage).forEach((key) => {
        if (!keysToPreserve.includes(key)) {
          localStorage.removeItem(key);
        }
      });
      
      console.log('[AuthContext] Sign out complete');
    } catch (error) {
      console.error('[AuthContext] Sign out error:', error);
      setUser(null);
    }
  }, [user?.id]);

  /**
   * Fetch existing user from DynamoDB or create new one
   */
  const fetchOrCreateDynamoUser = useCallback(
    async (cognitoUser: AuthUser, attributes: Record<string, string>): Promise<DynamoDBUser | null> => {
      const client = generateClient();
      const userId = cognitoUser.userId;
      const username = cognitoUser.username;
      const email = attributes?.email || '';

      // Try to fetch existing user
      try {
        console.log(`[AuthContext] Fetching user ${userId} from DynamoDB...`);
        
        const result = await client.graphql({
          query: customGetUser,
          variables: { id: userId },
          authMode: 'userPool',
        }) as { data?: { getUser?: DynamoDBUser } };

        const existingUser = result.data?.getUser;
        
        if (existingUser && !existingUser._deleted) {
          console.log('[AuthContext] Found existing user');
          return existingUser;
        }
      } catch (getError) {
        console.warn('[AuthContext] User fetch failed, will attempt to create');
      }

      // Create new user
      try {
        console.log(`[AuthContext] Creating user ${userId}...`);
        
        const newUserInput = {
          id: userId,
          username: username,
          email: email,
          role: UserRole.VENUE_MANAGER, // Default role for new users
        };

        const createResult = await client.graphql({
          query: customCreateUser,
          variables: { input: newUserInput },
          authMode: 'userPool',
        }) as { data?: { createUser?: DynamoDBUser } };

        if (createResult.data?.createUser) {
          console.log('[AuthContext] User created successfully');
          return createResult.data.createUser;
        }
      } catch (mutationError: unknown) {
        // Handle race condition where user was created by another process
        const error = mutationError as { errors?: Array<{ errorType?: string }> };
        const isConditionalCheckFailed = error?.errors?.some(
          (e) => e.errorType === 'ConditionalCheckFailedException'
        );

        if (isConditionalCheckFailed) {
          console.warn('[AuthContext] User already exists, retrying fetch...');
          
          try {
            const retryResult = await client.graphql({
              query: customGetUser,
              variables: { id: userId },
              authMode: 'userPool',
            }) as { data?: { getUser?: DynamoDBUser } };
            
            return retryResult.data?.getUser || null;
          } catch (retryError) {
            console.warn('[AuthContext] Retry fetch failed, using fallback');
          }
        }

        console.error('[AuthContext] User creation failed:', mutationError);
        
        // Fallback: return minimal user object to prevent app crash
        // This user won't have _version so updates will be skipped
        return {
          id: userId,
          username: username,
          email: email,
          role: UserRole.VENUE_MANAGER,
        };
      }
      
      return null;
    },
    []
  );

  /**
   * Check authentication state and load user data
   */
  const checkUser = useCallback(async () => {
    setLoading(true);
    
    try {
      console.log('[AuthContext] Checking Cognito session...');
      const cognitoUser = await getCurrentUser();

      console.log('[AuthContext] Fetching user attributes...');
      let attributes: Record<string, string>;
      
      try {
        attributes = await fetchUserAttributes() as Record<string, string>;
      } catch (attrError) {
        console.error('[AuthContext] Failed to fetch attributes - session may be stale');
        setUser(null);
        return;
      }

      console.log('[AuthContext] Loading DynamoDB user...');
      const dynamoUser = await fetchOrCreateDynamoUser(cognitoUser, attributes);

      if (dynamoUser?.id) {
        const appUser: AppUser = {
          id: dynamoUser.id,
          email: dynamoUser.email || '',
          username: dynamoUser.username || cognitoUser.username,
          role: dynamoUser.role || UserRole.VENUE_MANAGER,
          isAuthenticated: true,
          firstName: dynamoUser.firstName,
          lastName: dynamoUser.lastName,
          avatar: dynamoUser.avatar,
          allowedPages: dynamoUser.allowedPages,
          allowedEntityIds: dynamoUser.allowedEntityIds,
          allowedVenueIds: dynamoUser.allowedVenueIds,
          defaultEntityId: dynamoUser.defaultEntityId,
          _version: dynamoUser._version,
        };

        setUser(appUser);
        console.log('[AuthContext] User loaded:', {
          id: appUser.id,
          role: appUser.role,
          hasCustomPages: Array.isArray(appUser.allowedPages),
          allowedPagesCount: appUser.allowedPages?.length ?? 'default',
        });

        // Update last login timestamp (fire and forget)
        if (dynamoUser._version) {
          const client = generateClient();
          (async () => {
            try {
              await client.graphql({
                query: customUpdateUserLogin,
                variables: {
                  input: {
                    id: dynamoUser.id,
                    lastLoginAt: new Date().toISOString(),
                    _version: dynamoUser._version,
                  },
                },
                authMode: 'userPool',
              });
            } catch {
              // Silently ignore - non-critical operation
            }
          })();
        }
      } else {
        console.error('[AuthContext] Failed to load user from DynamoDB');
        setUser(null);
      }
    } catch (error) {
      console.warn('[AuthContext] No active session');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, [fetchOrCreateDynamoUser]);

  // Initial auth check
  useEffect(() => {
    if (!checkUserCalled.current) {
      checkUserCalled.current = true;
      checkUser();
    }
  }, [checkUser]);

  // Re-check auth when tab becomes visible (if no user)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !loading && !user) {
        console.log('[AuthContext] Tab visible, re-checking auth...');
        checkUser();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [checkUser, loading, user]);

  const value: AuthContextType = {
    user,
    loading,
    signOut: handleSignOut,
    refreshUser: checkUser,
    userRole: user?.role ?? null,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// ============================================
// HOOKS
// ============================================

/**
 * Main auth hook - provides user state and auth methods
 */
export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

/**
 * Role-based permission checks
 */
export const useRole = () => {
  const { user } = useAuth();
  
  return {
    isAdmin: user?.role === UserRole.SUPER_ADMIN || user?.role === UserRole.ADMIN,
    isSuperAdmin: user?.role === UserRole.SUPER_ADMIN,
    isVenueManager: user?.role === UserRole.VENUE_MANAGER,
    isTournamentDirector: user?.role === UserRole.TOURNAMENT_DIRECTOR,
    isMarketing: user?.role === UserRole.MARKETING,
    hasRole: (role: UserRole) => user?.role === role,
    hasAnyRole: (roles: UserRole[]) => user ? roles.includes(user.role) : false,
  };
};

export { AuthContext };