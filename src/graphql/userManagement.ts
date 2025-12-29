// src/graphql/userManagement.ts
// GraphQL operations for User Management

/*
  NOTE: Standard CRUD operations (ListUsers, GetUser, UpdateUser, DeleteUser) 
  have been removed from this file to avoid conflicts with Amplify's auto-generated 
  'src/graphql/queries.ts' and 'src/graphql/mutations.ts'.
  
  Please update your React components (like UserManagement.tsx) to import 
  standard operations from those generated files.
*/

// --- MUTATIONS (Lambda-backed for Cognito + DynamoDB sync) ---

// Creates user in Cognito AND DynamoDB
// Renamed operation to 'AdminCreateUserCustom' to avoid conflict with auto-generated code
export const adminCreateUserMutation = /* GraphQL */ `
  mutation AdminCreateUserCustom($input: CreateUserInput!) {
    adminCreateUser(input: $input) {
      success
      message
      temporaryPassword
      user {
        id
        username
        email
        role
        isActive
        firstName
        lastName
        phone
        allowedPages
        allowedEntityIds
        allowedVenueIds
        defaultEntityId
        createdAt
        updatedAt
      }
    }
  }
`;

// Updates user in Cognito AND DynamoDB
// Renamed operation to 'AdminUpdateUserCustom' to avoid conflict with auto-generated code
export const adminUpdateUserMutation = /* GraphQL */ `
  mutation AdminUpdateUserCustom($input: UpdateUserInput!) {
    adminUpdateUser(input: $input) {
      success
      message
      user {
        id
        username
        email
        role
        isActive
        firstName
        lastName
        phone
        avatar
        allowedPages
        allowedEntityIds
        allowedVenueIds
        defaultEntityId
        mustChangePassword
        updatedAt
        updatedBy
      }
    }
  }
`;

// Reset password in Cognito
// Renamed operation to 'AdminResetPasswordCustom' to avoid conflict with auto-generated code
export const adminResetPasswordMutation = /* GraphQL */ `
  mutation AdminResetPasswordCustom($input: ResetUserPasswordInput!) {
    adminResetPassword(input: $input) {
      success
      message
      temporaryPassword
    }
  }
`;

// Deactivate user in Cognito AND DynamoDB
// Renamed operation to 'AdminDeactivateUserCustom' to avoid conflict with auto-generated code
export const adminDeactivateUserMutation = /* GraphQL */ `
  mutation AdminDeactivateUserCustom($userId: ID!) {
    adminDeactivateUser(userId: $userId) {
      success
      message
      user {
        id
        isActive
      }
    }
  }
`;

// Reactivate user in Cognito AND DynamoDB
// Renamed operation to 'AdminReactivateUserCustom' to avoid conflict with auto-generated code
export const adminReactivateUserMutation = /* GraphQL */ `
  mutation AdminReactivateUserCustom($userId: ID!) {
    adminReactivateUser(userId: $userId) {
      success
      message
      user {
        id
        isActive
      }
    }
  }
`;

// --- TYPES ---

export interface User {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  isActive?: boolean;
  firstName?: string | null;
  lastName?: string | null;
  phone?: string | null;
  avatar?: string | null;
  allowedPages?: string[] | null;
  allowedEntityIds?: string[] | null;
  allowedVenueIds?: string[] | null;
  defaultEntityId?: string | null;
  lastLoginAt?: string | null;
  passwordLastChangedAt?: string | null;
  mustChangePassword?: boolean;
  loginAttempts?: number;
  lockedUntil?: string | null;
  createdAt: string;
  updatedAt: string;
  createdBy?: string | null;
  updatedBy?: string | null;
  
  // Amplify DataStore internal fields
  // These are used for optimistic concurrency control
  _version?: number;
  _lastChangedAt?: number;
  _deleted?: boolean;
}

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'VENUE_MANAGER' | 'TOURNAMENT_DIRECTOR' | 'MARKETING';

export interface CreateUserInput {
  username: string;
  email: string;
  role: UserRole;
  firstName?: string;
  lastName?: string;
  phone?: string;
  allowedPages?: string[];
  allowedEntityIds?: string[];
  allowedVenueIds?: string[];
  defaultEntityId?: string;
  isActive?: boolean;
}

export interface UpdateUserInput {
  id: string;
  username?: string;
  email?: string;
  role?: UserRole;
  firstName?: string;
  lastName?: string;
  phone?: string;
  avatar?: string;
  allowedPages?: string[];
  allowedEntityIds?: string[];
  allowedVenueIds?: string[];
  defaultEntityId?: string;
  isActive?: boolean;
  mustChangePassword?: boolean;
  lastLoginAt?: string;
  lastActiveAt?: string;
}

export interface ResetUserPasswordInput {
  userId: string;
  newPassword?: string;
  permanent?: boolean;
}

export interface UserManagementResponse {
  success: boolean;
  message: string;
  user?: User | null;
  temporaryPassword?: string | null;
}

export interface ResetPasswordResponse {
  success: boolean;
  message: string;
  temporaryPassword?: string | null;
}

export interface ListUsersResponse {
  listUsers: {
    items: User[];
    nextToken: string | null;
  };
}

export interface GetUserResponse {
  getUser: User | null;
}