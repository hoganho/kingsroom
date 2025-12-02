/* Amplify Params - DO NOT EDIT
    API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT
    API_KINGSROOM_GRAPHQLAPIIDOUTPUT
    API_KINGSROOM_GRAPHQLAPIKEYOUTPUT
    API_KINGSROOM_USERAUDITLOGTABLE_ARN
    API_KINGSROOM_USERAUDITLOGTABLE_NAME
    API_KINGSROOM_USERPREFERENCETABLE_ARN
    API_KINGSROOM_USERPREFERENCETABLE_NAME
    API_KINGSROOM_USERTABLE_ARN
    API_KINGSROOM_USERTABLE_NAME
    AUTH_KINGSROOMAUTH_USERPOOLID
    ENV
    REGION
Amplify Params - DO NOT EDIT */

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
const { LambdaMonitoring } = require('./lambda-monitoring');

// Initialize clients
const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION });
const dynamoClient = new DynamoDBClient({ region: process.env.REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);

// Initialize monitoring
const monitor = new LambdaMonitoring('userManagement');

// Wrap the DynamoDB client for automatic operation tracking
const monitoredDocClient = monitor.wrapDynamoDBClient(docClient);

// =====================================================================
// ENVIRONMENT VARIABLES & VALIDATION
// =====================================================================

// We check for the specific Amplify-injected variable names (from the header block above)
const USER_POOL_ID = process.env.USER_POOL_ID || process.env.AUTH_KINGSROOMAUTH_USERPOOLID;
const USER_TABLE = process.env.USER_TABLE || process.env.API_KINGSROOM_USERTABLE_NAME;
const AUDIT_LOG_TABLE = process.env.AUDIT_LOG_TABLE || process.env.API_KINGSROOM_USERAUDITLOGTABLE_NAME;

// Validation: Fail fast if variables are missing to prevent confusing "Parameter cannot be null" errors later
if (!USER_POOL_ID) {
  const availableEnv = Object.keys(process.env).filter(k => k.startsWith('AUTH_')).join(', ');
  throw new Error(`CRITICAL: Function is missing User Pool ID. Looked for AUTH_KINGSROOMAUTH_USERPOOLID. Available AUTH_ vars: [${availableEnv}]`);
}

if (!USER_TABLE) {
  const availableEnv = Object.keys(process.env).filter(k => k.startsWith('API_')).join(', ');
  throw new Error(`CRITICAL: Function is missing User Table Name. Looked for API_KINGSROOM_USERTABLE_NAME. Available API_ vars: [${availableEnv}]`);
}

// =====================================================================

// Map GraphQL UserRole to Cognito Group names
const ROLE_TO_COGNITO_GROUP = {
  'SUPER_ADMIN': 'SUPER_ADMIN',
  'ADMIN': 'ADMIN',
  'VENUE_MANAGER': 'VENUE_MANAGER',
  'TOURNAMENT_DIRECTOR': 'TOURNAMENT_DIRECTOR',
  'MARKETING': 'MARKETING',
};

// Audit action types
const AuditActions = {
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_DEACTIVATE: 'USER_DEACTIVATE',
  USER_REACTIVATE: 'USER_REACTIVATE',
  USER_PASSWORD_RESET: 'USER_PASSWORD_RESET',
};

/**
 * Create an audit log entry
 */
async function createAuditLog(adminUserId, action, targetUserId, details = {}) {
  if (!AUDIT_LOG_TABLE) {
    console.warn('AUDIT_LOG_TABLE not configured, skipping audit log');
    return;
  }

  try {
    const auditEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      userId: adminUserId,
      action,
      resource: `/admin/users/${targetUserId}`,
      details: JSON.stringify({
        targetUserId,
        ...details,
        timestamp: new Date().toISOString(),
      }),
      createdAt: new Date().toISOString(),
      __typename: 'UserAuditLog',
    };

    await monitoredDocClient.send(new PutCommand({
      TableName: AUDIT_LOG_TABLE,
      Item: auditEntry,
    }));

    console.log(`[AuditLog] ${action} by ${adminUserId} on ${targetUserId}`);
  } catch (error) {
    // Don't fail the operation if audit logging fails
    console.error('[AuditLog] Failed to create audit log:', error);
  }
}

/**
 * Main Lambda handler - routes to appropriate function based on GraphQL field
 */
exports.handler = async (event) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  const { fieldName, arguments: args, identity } = event;
  
  // Get admin user ID from identity
  const adminUserId = identity?.sub || identity?.username || 'system';
  
  // Track incoming request
  monitor.trackOperation('REQUEST', 'UserManagement', null, {
    fieldName,
    caller: adminUserId
  });
  
  try {
    let result;
    
    switch (fieldName) {
      case 'adminCreateUser':
        result = await createUser(args.input, identity, adminUserId);
        break;
      case 'adminUpdateUser':
        result = await updateUser(args.input, identity, adminUserId);
        break;
      case 'adminResetPassword':
        result = await resetPassword(args.input, identity, adminUserId);
        break;
      case 'adminDeactivateUser':
        result = await deactivateUser(args.userId, identity, adminUserId);
        break;
      case 'adminReactivateUser':
        result = await reactivateUser(args.userId, identity, adminUserId);
        break;
      default:
        throw new Error(`Unknown field: ${fieldName}`);
    }
    
    // Track successful completion
    monitor.trackOperation('RESPONSE', 'UserManagement', null, {
      fieldName,
      success: result.success
    });
    
    // Flush metrics before returning
    await monitor.flush();
    
    return result;
    
  } catch (error) {
    console.error('Error:', error);
    
    // Track error
    monitor.trackOperation('ERROR', 'UserManagement', null, {
      fieldName,
      error: error.message,
      success: false
    });
    
    await monitor.flush();
    
    return {
      success: false,
      message: error.message || 'An error occurred',
      user: null,
    };
  }
};

/**
 * Track Cognito operations for monitoring
 */
async function trackCognitoOperation(operation, email, action) {
  const startTime = Date.now();
  try {
    const result = await action();
    monitor.trackOperation(operation, 'Cognito', email, {
      duration: Date.now() - startTime,
      success: true
    });
    return result;
  } catch (error) {
    monitor.trackOperation(operation, 'Cognito', email, {
      duration: Date.now() - startTime,
      success: false,
      error: error.message
    });
    throw error;
  }
}

/**
 * Create a new user in Cognito and DynamoDB
 */
async function createUser(input, identity, adminUserId) {
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
    MessageAction: 'SUPPRESS',
    DesiredDeliveryMediums: ['EMAIL'],
  });
  
  let cognitoUser;
  try {
    cognitoUser = await trackCognitoOperation('CREATE_USER', email, async () => {
      return await cognitoClient.send(createUserCommand);
    });
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
    await trackCognitoOperation('ADD_TO_GROUP', email, async () => {
      return await cognitoClient.send(new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        GroupName: cognitoGroup,
      }));
    });
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
  
  await monitoredDocClient.send(new PutCommand({
    TableName: USER_TABLE,
    Item: user,
  }));
  
  console.log(`Created user: ${email} with role: ${role}`);
  
  // 4. Create audit log entry
  await createAuditLog(adminUserId, AuditActions.USER_CREATE, cognitoSub, {
    email,
    role,
    firstName,
    lastName,
  });
  
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
async function updateUser(input, identity, adminUserId) {
  const { id, role, ...updates } = input;
  const now = new Date().toISOString();
  
  // Get current user to check for role change
  const currentUser = await monitoredDocClient.send(new GetCommand({
    TableName: USER_TABLE,
    Key: { id },
  }));
  
  if (!currentUser.Item) {
    throw new Error('User not found');
  }
  
  const oldRole = currentUser.Item.role;
  const email = currentUser.Item.email;
  
  // Track changes for audit log
  const changes = {};
  
  // If role changed, update Cognito groups
  if (role && role !== oldRole) {
    changes.role = { from: oldRole, to: role };
    
    // Remove from old group
    const oldGroup = ROLE_TO_COGNITO_GROUP[oldRole];
    if (oldGroup) {
      try {
        await trackCognitoOperation('REMOVE_FROM_GROUP', email, async () => {
          return await cognitoClient.send(new AdminRemoveUserFromGroupCommand({
            UserPoolId: USER_POOL_ID,
            Username: email,
            GroupName: oldGroup,
          }));
        });
      } catch (error) {
        console.warn(`Could not remove from group ${oldGroup}:`, error.message);
      }
    }
    
    // Add to new group
    const newGroup = ROLE_TO_COGNITO_GROUP[role];
    if (newGroup) {
      await trackCognitoOperation('ADD_TO_GROUP', email, async () => {
        return await cognitoClient.send(new AdminAddUserToGroupCommand({
          UserPoolId: USER_POOL_ID,
          Username: email,
          GroupName: newGroup,
        }));
      });
    }
  }
  
  // Update Cognito user attributes if name/phone changed
  const cognitoAttributeUpdates = [];
  if (updates.firstName) {
    cognitoAttributeUpdates.push({ Name: 'given_name', Value: updates.firstName });
    if (updates.firstName !== currentUser.Item.firstName) {
      changes.firstName = { from: currentUser.Item.firstName, to: updates.firstName };
    }
  }
  if (updates.lastName) {
    cognitoAttributeUpdates.push({ Name: 'family_name', Value: updates.lastName });
    if (updates.lastName !== currentUser.Item.lastName) {
      changes.lastName = { from: currentUser.Item.lastName, to: updates.lastName };
    }
  }
  if (updates.phone) {
    cognitoAttributeUpdates.push({ Name: 'phone_number', Value: updates.phone });
    if (updates.phone !== currentUser.Item.phone) {
      changes.phone = { from: currentUser.Item.phone, to: updates.phone };
    }
  }
  
  if (cognitoAttributeUpdates.length > 0) {
    await trackCognitoOperation('UPDATE_ATTRIBUTES', email, async () => {
      return await cognitoClient.send(new AdminUpdateUserAttributesCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        UserAttributes: cognitoAttributeUpdates,
      }));
    });
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
      
      // Track other changes for audit
      if (updates[field] !== currentUser.Item[field] && !changes[field]) {
        changes[field] = { from: currentUser.Item[field], to: updates[field] };
      }
    }
  }
  
  const updateResult = await monitoredDocClient.send(new UpdateCommand({
    TableName: USER_TABLE,
    Key: { id },
    UpdateExpression: `SET ${updateExpressionParts.join(', ')}`,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW',
  }));
  
  console.log(`Updated user: ${id}`);
  
  // Create audit log entry with changes
  await createAuditLog(adminUserId, AuditActions.USER_UPDATE, id, {
    email,
    changes,
  });
  
  return {
    success: true,
    message: 'User updated successfully',
    user: updateResult.Attributes,
  };
}

/**
 * Reset a user's password
 */
async function resetPassword(input, identity, adminUserId) {
  const { userId, newPassword, permanent = false } = input;
  
  // Get user from DynamoDB
  const userResult = await monitoredDocClient.send(new GetCommand({
    TableName: USER_TABLE,
    Key: { id: userId },
  }));
  
  if (!userResult.Item) {
    throw new Error('User not found');
  }
  
  const email = userResult.Item.email;
  const tempPassword = newPassword || generateTempPassword();
  
  // Set the password in Cognito
  await trackCognitoOperation('SET_PASSWORD', email, async () => {
    return await cognitoClient.send(new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
      Password: tempPassword,
      Permanent: permanent,
    }));
  });
  
  // Update DynamoDB
  const now = new Date().toISOString();
  await monitoredDocClient.send(new UpdateCommand({
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
  
  // Create audit log entry
  await createAuditLog(adminUserId, AuditActions.USER_PASSWORD_RESET, userId, {
    email,
    permanent,
  });
  
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
async function deactivateUser(userId, identity, adminUserId) {
  // Get user from DynamoDB
  const userResult = await monitoredDocClient.send(new GetCommand({
    TableName: USER_TABLE,
    Key: { id: userId },
  }));
  
  if (!userResult.Item) {
    throw new Error('User not found');
  }
  
  const email = userResult.Item.email;
  
  // Disable in Cognito
  await trackCognitoOperation('DISABLE_USER', email, async () => {
    return await cognitoClient.send(new AdminDisableUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
    }));
  });
  
  // Update DynamoDB
  const now = new Date().toISOString();
  const updateResult = await monitoredDocClient.send(new UpdateCommand({
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
  
  // Create audit log entry
  await createAuditLog(adminUserId, AuditActions.USER_DEACTIVATE, userId, {
    email,
    previouslyActive: userResult.Item.isActive,
  });
  
  return {
    success: true,
    message: 'User deactivated successfully',
    user: updateResult.Attributes,
  };
}

/**
 * Reactivate a user
 */
async function reactivateUser(userId, identity, adminUserId) {
  // Get user from DynamoDB
  const userResult = await monitoredDocClient.send(new GetCommand({
    TableName: USER_TABLE,
    Key: { id: userId },
  }));
  
  if (!userResult.Item) {
    throw new Error('User not found');
  }
  
  const email = userResult.Item.email;
  
  // Enable in Cognito
  await trackCognitoOperation('ENABLE_USER', email, async () => {
    return await cognitoClient.send(new AdminEnableUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: email,
    }));
  });
  
  // Update DynamoDB
  const now = new Date().toISOString();
  const updateResult = await monitoredDocClient.send(new UpdateCommand({
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
  
  // Create audit log entry
  await createAuditLog(adminUserId, AuditActions.USER_REACTIVATE, userId, {
    email,
  });
  
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