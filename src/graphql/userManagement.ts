// src/graphql/userManagement.ts
// GraphQL operations for User Management

// --- QUERIES ---

export const listUsersQuery = /* GraphQL */ `
  query ListUsers(
    $filter: ModelUserFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listUsers(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
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
        lastLoginAt
        passwordLastChangedAt
        mustChangePassword
        loginAttempts
        lockedUntil
        createdAt
        updatedAt
        createdBy
        updatedBy
      }
      nextToken
    }
  }
`;

export const getUserQuery = /* GraphQL */ `
  query GetUser($id: ID!) {
    getUser(id: $id) {
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
      lastLoginAt
      passwordLastChangedAt
      mustChangePassword
      loginAttempts
      lockedUntil
      createdAt
      updatedAt
      createdBy
      updatedBy
      preferences {
        items {
          id
          page
          widget
          preference
        }
      }
    }
  }
`;

export const getUserByEmailQuery = /* GraphQL */ `
  query UserByEmail($email: String!) {
    userByEmail(email: $email) {
      items {
        id
        username
        email
        role
        isActive
        firstName
        lastName
        allowedPages
      }
    }
  }
`;

// --- MUTATIONS (Lambda-backed for Cognito + DynamoDB sync) ---

// Creates user in Cognito AND DynamoDB
export const adminCreateUserMutation = /* GraphQL */ `
  mutation AdminCreateUser($input: CreateUserInput!) {
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
export const adminUpdateUserMutation = /* GraphQL */ `
  mutation AdminUpdateUser($input: UpdateUserInput!) {
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
export const adminResetPasswordMutation = /* GraphQL */ `
  mutation AdminResetPassword($input: ResetUserPasswordInput!) {
    adminResetPassword(input: $input) {
      success
      message
      temporaryPassword
    }
  }
`;

// Deactivate user in Cognito AND DynamoDB
export const adminDeactivateUserMutation = /* GraphQL */ `
  mutation AdminDeactivateUser($userId: ID!) {
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
export const adminReactivateUserMutation = /* GraphQL */ `
  mutation AdminReactivateUser($userId: ID!) {
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

// --- LEGACY MUTATIONS (DynamoDB only - for non-Cognito updates) ---

export const updateUserMutation = /* GraphQL */ `
  mutation UpdateUser($input: UpdateUserInput!) {
    updateUser(input: $input) {
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
`;

export const deleteUserMutation = /* GraphQL */ `
  mutation DeleteUser($input: DeleteUserInput!) {
    deleteUser(input: $input) {
      id
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
