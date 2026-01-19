/**
 * Configuration Module
 * 
 * Centralizes all configuration, environment variables, and constants.
 * Import this module to get access to table names, API settings, etc.
 */

// ============================================
// AWS SDK Clients (Lazy Initialization)
// ============================================
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { S3Client } = require('@aws-sdk/client-s3');
const { LambdaClient } = require('@aws-sdk/client-lambda');

const REGION = process.env.REGION || 'ap-southeast-2';

// Singleton clients - initialized once on cold start
let _ddbClient = null;
let _docClient = null;
let _s3Client = null;
let _lambdaClient = null;

const getDocClient = () => {
  if (!_docClient) {
    _ddbClient = new DynamoDBClient({ region: REGION });
    _docClient = DynamoDBDocumentClient.from(_ddbClient);
  }
  return _docClient;
};

const getS3Client = () => {
  if (!_s3Client) {
    _s3Client = new S3Client({ region: REGION });
  }
  return _s3Client;
};

const getLambdaClient = () => {
  if (!_lambdaClient) {
    _lambdaClient = new LambdaClient({ region: REGION });
  }
  return _lambdaClient;
};

// ============================================
// Environment Variables
// ============================================
const config = {
  // Region
  region: REGION,
  env: process.env.ENV || 'dev',
  
  // DynamoDB Table Names
  tables: {
    socialAccount: process.env.API_KINGSROOM_SOCIALACCOUNTTABLE_NAME,
    socialPost: process.env.API_KINGSROOM_SOCIALPOSTTABLE_NAME,
    socialScrapeAttempt: process.env.API_KINGSROOM_SOCIALSCRAPEATTEMPTTABLE_NAME,
    socialScheduledPost: process.env.API_KINGSROOM_SOCIALSCHEDULEDPOSTTABLE_NAME,
  },
  
  // AppSync
  appsync: {
    endpoint: process.env.API_KINGSROOM_GRAPHQLAPIENDPOINTOUTPUT || process.env.APPSYNC_ENDPOINT,
    apiId: process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT,
  },
  
  // S3
  s3: {
    bucket: process.env.SOCIAL_MEDIA_BUCKET || '',
    pageLogosPrefix: 'social-media/page-logos/',
    postAttachmentsPrefix: 'social-media/post-attachments/',
  },
  
  // Facebook API
  facebook: {
    accessToken: process.env.FB_ACCESS_TOKEN,
    apiVersion: process.env.FB_API_VERSION || 'v19.0',
  },
  
  // Post Processor Lambda
  processor: {
    functionName: process.env.SOCIAL_POST_PROCESSOR_FUNCTION,
    autoProcess: process.env.AUTO_PROCESS_POSTS !== 'false',
    maxParallel: parseInt(process.env.MAX_PARALLEL_PROCESSING || '5', 10),
  },
  
  // Notifications
  notifications: {
    enabled: process.env.NOTIFICATIONS_ENABLED !== 'false',
    senderEmail: process.env.NOTIFICATION_SENDER_EMAIL || 'notifications@kingsroom.pokerprolive.com',
    recipientEmail: process.env.NOTIFICATION_RECIPIENT_EMAIL || 'hogan.ho@gmail.com',
  },
};

// ============================================
// Scraping Configuration
// ============================================
const scrapeConfig = {
  // Pagination
  maxPostsPerPage: 100,
  maxPagesToFetch: 50,
  
  // Progress Updates
  progressUpdateFrequency: 3,  // Publish every N pages
  
  // Cancellation
  cancellationCheckFrequency: 2,  // Check every N pages
  
  // Error Handling
  maxConsecutiveErrors: 3,
  
  // Download Progress Throttling
  downloadProgressThrottleMs: 500,
};

// ============================================
// Stop Reason Enum
// ============================================
const StopReason = {
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  RATE_LIMITED: 'RATE_LIMITED',
  TIMEOUT: 'TIMEOUT',
  ERROR: 'ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
};

// ============================================
// Validation
// ============================================
const validateConfig = () => {
  const errors = [];
  
  if (!config.tables.socialAccount) {
    errors.push('Missing SOCIAL_ACCOUNT_TABLE environment variable');
  }
  if (!config.tables.socialPost) {
    errors.push('Missing SOCIAL_POST_TABLE environment variable');
  }
  if (!config.facebook.accessToken) {
    errors.push('Missing FB_ACCESS_TOKEN environment variable');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
};

module.exports = {
  config,
  scrapeConfig,
  StopReason,
  validateConfig,
  getDocClient,
  getS3Client,
  getLambdaClient,
  REGION,
};
