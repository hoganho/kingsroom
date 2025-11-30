// amplify/backend/function/userManagement/src/index.js
const {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
  AdminSetUserPasswordCommand,
  AdminGetUserCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
  AdminUpdateUserAttributesCommand,
  ListGroupsCommand,
} = require('@aws-sdk/client-cognito-identity-provider');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

// Initialize clients
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Environment variables (set these in Lambda configuration)
const USER_POOL_ID = process.env.USER_POOL_ID;
const USER_TABLE = process.env.USER_TABLE;

// Map GraphQL UserRole to Cognito Group names
const ROLE_TO_COGNITO_GROUP = {
  'SUPER_ADMIN': 'SUPER_ADMIN',
  'ADMIN': 'ADMIN',
  'VENUE_MANAGER': 'VENUE_MANAGER',
  'TOURNAMENT_DIRECTOR': 'TOURNAMENT_DIRECTOR',
  'MARKETING': 'MARKETING',
};

/**
 * Main Lambda handler - routes to appropriate function based on GraphQL field
 */
exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const { fieldName, arguments: args, identity } = event;
  
  try {
    switch (fieldName) {
      case 'adminCreateUser':
        return await createUser(args.input, identity);
      case 'adminUpdateUser':
        return await updateUser(args.input, identity);
      case 'adminResetPassword':
        return await resetPassword(args.input, identity);
      case 'adminDeactivateUser':
        return await deactivateUser(args.userId, identity);
      case 'adminReactivateUser':
        return await reactivateUser(args.userId, identity);
      default:
        throw new Error(`Unknown field: ${fieldName}`);
    }
  } catch (error) {
    console.error('Error:', error);
    return {
      success: false,
      message: error.message || 'An error occurred',
      user: null,
    };
  }
};

/**
 * Create a new user in Cognito and DynamoDB
 */
async function createUser(input, identity) {
  const {
    email,
    username,
    role,
    firstName,
    lastName,
    phone,
    allowedPages,
    allowedEntityIds,
    allowedVenueIds,
    defaultEntityId,
    isActive = true,
  } = input;
  
  const now = new Date().toISOString();
  const tempPassword = generateTempPassword();
  
  // 1. Create user in Cognito
  const createUserCommand = new AdminCreateUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: email,
    UserAttributes: [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
      ...(firstName ? [{ Name: 'given_name', Value: firstName }] : []),
      ...(lastName ? [{ Name: 'family_name', Value: lastName }] : []),
      ...(phone ? [{ Name: 'phone_number', Value: phone }] : []),
    ],
    TemporaryPassword: tempPassword,
    MessageAction: 'SUPPRESS', // Don't send email - we'll handle it ourselves
    DesiredDeliveryMediums: ['EMAIL'],
  });
  
  let cognitoUser;
  try {
    cognitoUser = await cognitoClient.send(createUserCommand);
  } catch (error) {
    if (error.name === 'UsernameExistsException') {
      throw new Error('A user with this email already exists');
    }
    throw error;
  }
  
  // Get the Cognito sub (user ID)
  const cognitoSub = cognitoUser.User.Attributes.find(attr => attr.Name === 'sub')?.Value;
  
  if (!cognitoSub) {
    throw new Error('Failed to get Cognito user ID');
  }
  
  // 2. Add user to Cognito group based on role
  const cognitoGroup = ROLE_TO_COGNITO_GROUP[role];
  if (cognitoGroup) {
    await cognitoClient.send(new AdminAddUserToGroupCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      GroupName: cognitoGroup,
    }));
  }
  
  // 3. Create user record in DynamoDB
  const user = {
    id: cognitoSub,
    username: username || email.split('@')[0],
    email: email.toLowerCase(),
    role,
    isActive,
    firstName: firstName || null,
    lastName: lastName || null,
    phone: phone || null,
    avatar: null,
    allowedPages: allowedPages || null,
    allowedEntityIds: allowedEntityIds || null,
    allowedVenueIds: allowedVenueIds || null,
    defaultEntityId: defaultEntityId || null,
    lastLoginAt: null,
    passwordLastChangedAt: null,
    mustChangePassword: true,
    loginAttempts: 0,
    lockedUntil: null,
    createdAt: now,
    updatedAt: now,
    createdBy: identity?.username || 'system',
    updatedBy: identity?.username || 'system',
    __typename: 'User',
  };
  
  await docClient.send(new PutCommand({
    TableName: USER_TABLE,
    Item: user,
  }));
  
  console.log(`Created user: ${email} with role: ${role}`);
  
  return {
    success: true,
    message: `User created successfully. Temporary password: ${tempPassword}`,
    user,
    temporaryPassword: tempPassword,
  };
}

/**
 * Update an existing user
 */
async function updateUser(input, identity) {
  const { id, role, ...updates } = input;
  const now = new Date().toISOString();
  
  // Get current user to check for role change
  const currentUser = await docClient.send(new GetCommand({
    TableName: USER_TABLE,
    Key: { id },
  }));
  
  if (!currentUser.Item) {
    throw new Error('User not found');
  }
  
  const oldRole = currentUser.Item.role;
  
  // If role changed, update Cognito groups
  if (role && role !== oldRole) {
    const email = currentUser.Item.email;
    
    // Remove from old group
    const oldGroup = ROLE_TO_COGNITO_GROUP[oldRole];
    if (oldGroup) {
      try {
        await cognitoClient.send(new AdminRemoveUserFromGroupCommand({
          UserPoolId: USER_POOL_ID,
          Username: email,
          GroupName: oldGroup,
        }));
      } catch (error) {
        console.warn(`Could not remove from group ${oldGroup}:`, error.message);
      }
    }
    
    // Add to new group
    const newGroup = ROLE_TO_COGNITO_GROUP[role];
    if (newGroup) {
      await cognitoClient.send(new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        GroupName: newGroup,
      }));
    }
  }
  
  // Update Cognito user attributes if name/phone changed
  const cognitoAttributeUpdates = [];
  if (updates.firstName) cognitoAttributeUpdates.push({ Name: 'given_name', Value: updates.firstName });
  if (updates.lastName) cognitoAttributeUpdates.push({ Name: 'family_name', Value: updates.lastName });
  if (updates.phone) cognitoAttributeUpdates.push({ Name: 'phone_number', Value: updates.phone });
  
  if (cognitoAttributeUpdates.length > 0) {
    await cognitoClient.send(new AdminUpdateUserAttributesCommand({
      UserPoolId: USER_POOL_ID,
      Username: currentUser.Item.email,
      UserAttributes: cognitoAttributeUpdates,
    }));
  }
  
  // Build DynamoDB update expression
  const updateExpressionParts = ['#updatedAt = :updatedAt', '#updatedBy = :updatedBy'];
  const expressionAttributeNames = {
    '#updatedAt': 'updatedAt',
    '#updatedBy': 'updatedBy',
  };
  const expressionAttributeValues = {
    ':updatedAt': now,
    ':updatedBy': identity?.username || 'system',
  };
  
  // Add role if changed
  if (role) {
    updateExpressionParts.push('#role = :role');
    expressionAttributeNames['#role'] = 'role';
    expressionAttributeValues[':role'] = role;
  }
  
  // Add other fields
  const allowedFields = [
    'username', 'firstName', 'lastName', 'phone', 'avatar',
    'allowedPages', 'allowedEntityIds', 'allowedVenueIds', 
    'defaultEntityId', 'isActive', 'mustChangePassword'
  ];
  
  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      updateExpressionParts.push(`#${field} = :${field}`);
      expressionAttributeNames[`#${field}`] = field;
      expressionAttributeValues[`:${field}`] = updates[field];
    }
  }
  
  const updateResult = await docClient.send(new UpdateCommand({
    TableName: USER_TABLE,
    Key: { id },
    UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  }));
  
  console.log(`Updated user: ${id}`);
  
  return {
    success: true,
    message: 'User updated successfully',
    user: updateResult.Attributes,
  };
}

/**
 * Reset a user's password
 */
async function resetPassword(input, identity) {
  const { userId, newPassword, permanent = false } = input;
  
  // Get user from DynamoDB
  const userResult = await docClient.send(new GetCommand({
    TableName: USER_TABLE,
    Key: { id: userId },
  }));
  
  if (!userResult.Item) {
    throw new Error('User not found');
  }
  
  const email = userResult.Item.email;
  const tempPassword = newPassword || generateTempPassword();
  
  // Set the password in Cognito
  await cognitoClient.send(new AdminSetUserPasswordCommand({
    UserPoolId: USER_POOL_ID,
    Username: email,
    Password: tempPassword,
    Permanent: permanent,
  }));
  
  // Update DynamoDB
  const now = new Date().toISOString();
  await docClient.send(new UpdateCommand({
    TableName: USER_TABLE,
    Key: { id: userId },
    UpdateExpression: 'SET #pwChanged = :pwChanged, #mustChange = :mustChange, #updatedAt = :updatedAt',
    ExpressionAttributeNames: {
      '#pwChanged': 'passwordLastChangedAt',
      '#mustChange': 'mustChangePassword',
      '#updatedAt': 'updatedAt',
    },
    ExpressionAttributeValues: {
      ':pwChanged': now,
      ':mustChange': !permanent,
      ':updatedAt': now,
    },
  }));
  
  console.log(`Reset password for user: ${userId}`);
  
  return {
    success: true,
    message: permanent 
      ? 'Password has been set' 
      : `Temporary password: ${tempPassword}`,
    temporaryPassword: permanent ? null : tempPassword,
  };
}

/**
 * Deactivate a user
 */
async function deactivateUser(userId, identity) {
  // Get user from DynamoDB
  const userResult = await docClient.send(new GetCommand({
    TableName: USER_TABLE,
    Key: { id: userId },
  }));
  
  if (!userResult.Item) {
    throw new Error('User not found');
  }
  
  const email = userResult.Item.email;
  
  // Disable in Cognito
  await cognitoClient.send(new AdminDisableUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: email,
  }));
  
  // Update DynamoDB
  const now = new Date().toISOString();
  const updateResult = await docClient.send(new UpdateCommand({
    TableName: USER_TABLE,
    Key: { id: userId },
    UpdateExpression: 'SET #isActive = :isActive, #updatedAt = :updatedAt, #updatedBy = :updatedBy',
    ExpressionAttributeNames: {
      '#isActive': 'isActive',
      '#updatedAt': 'updatedAt',
      '#updatedBy': 'updatedBy',
    },
    ExpressionAttributeValues: {
      ':isActive': false,
      ':updatedAt': now,
      ':updatedBy': identity?.username || 'system',
    },
    ReturnValues: 'ALL_NEW',
  }));
  
  console.log(`Deactivated user: ${userId}`);
  
  return {
    success: true,
    message: 'User deactivated successfully',
    user: updateResult.Attributes,
  };
}

/**
 * Reactivate a user
 */
async function reactivateUser(userId, identity) {
  // Get user from DynamoDB
  const userResult = await docClient.send(new GetCommand({
    TableName: USER_TABLE,
    Key: { id: userId },
  }));
  
  if (!userResult.Item) {
    throw new Error('User not found');
  }
  
  const email = userResult.Item.email;
  
  // Enable in Cognito
  await cognitoClient.send(new AdminEnableUserCommand({
    UserPoolId: USER_POOL_ID,
    Username: email,
  }));
  
  // Update DynamoDB
  const now = new Date().toISOString();
  const updateResult = await docClient.send(new UpdateCommand({
    TableName: USER_TABLE,
    Key: { id: userId },
    UpdateExpression: 'SET #isActive = :isActive, #updatedAt = :updatedAt, #updatedBy = :updatedBy, #loginAttempts = :loginAttempts, #lockedUntil = :lockedUntil',
    ExpressionAttributeNames: {
      '#isActive': 'isActive',
      '#updatedAt': 'updatedAt',
      '#updatedBy': 'updatedBy',
      '#loginAttempts': 'loginAttempts',
      '#lockedUntil': 'lockedUntil',
    },
    ExpressionAttributeValues: {
      ':isActive': true,
      ':updatedAt': now,
      ':updatedBy': identity?.username || 'system',
      ':loginAttempts': 0,
      ':lockedUntil': null,
    },
    ReturnValues: 'ALL_NEW',
  }));
  
  console.log(`Reactivated user: ${userId}`);
  
  return {
    success: true,
    message: 'User reactivated successfully',
    user: updateResult.Attributes,
  };
}

/**
 * Generate a temporary password
 */
function generateTempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const specials = '!@#$%';
  let password = '';
  
  // Add required characters
  password += chars.charAt(Math.floor(Math.random() * 26)); // Uppercase
  password += chars.charAt(26 + Math.floor(Math.random() * 24)); // Lowercase
  password += chars.charAt(50 + Math.floor(Math.random() * 8)); // Number
  password += specials.charAt(Math.floor(Math.random() * specials.length)); // Special
  
  // Fill the rest
  for (let i = password.length; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  
  // Shuffle
  return password.split('').sort(() => Math.random() - 0.5).join('');
}