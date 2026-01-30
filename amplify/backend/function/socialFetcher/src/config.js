/**
 * Configuration Module
 * 
 * Centralizes all configuration, environment variables, and constants.
 * Import this module to get access to table names, API settings, etc.
 * 
 * VERSION: 2.0.0
 * 
 * CHANGES:
 * - Added fallback env var names for processor function
 * - Added scraper function config for discrepancy resolution
 * - Added cold-start logging to help diagnose missing config
 */

// ============================================
// AWS SDK Clients (Lazy Initialization)
// ============================================
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const { S3Client } = require('@aws-sdk/client-s3');
const { LambdaClient } = require('@aws-sdk/client-lambda');

const REGION = process.env.REGION || process.env.AWS_REGION || 'ap-southeast-2';

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
// Helper: Get first defined env var from list
// ============================================
const getEnvVar = (...names) => {
  for (const name of names) {
    if (process.env[name]) {
      return process.env[name];
    }
  }
  return undefined;
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
  // UPDATED: Added fallback env var names
  processor: {
    functionName: getEnvVar(
      'SOCIAL_POST_PROCESSOR_FUNCTION',      // Primary (your custom name)
      'FUNCTION_SOCIALPOSTPROCESSOR_NAME'    // Amplify auto-generated format
    ),
    autoProcess: process.env.AUTO_PROCESS_POSTS !== 'false',
    maxParallel: parseInt(process.env.MAX_PARALLEL_PROCESSING || '5', 10),
  },
  
  // Tournament Scraper Lambda (NEW - for discrepancy resolution)
  scraper: {
    functionName: getEnvVar(
      'SCRAPER_FUNCTION_NAME',
      'FUNCTION_SCRAPERJOB_NAME'
    ),
  },
  
  // Notifications
  notifications: {
    enabled: process.env.NOTIFICATIONS_ENABLED !== 'false',
    senderEmail: process.env.NOTIFICATION_SENDER_EMAIL || 'notifications@kingsroom.pokerprolive.com',
    recipientEmail: process.env.NOTIFICATION_RECIPIENT_EMAIL || 'hogan.ho@gmail.com',
  },
};

// ============================================
// Cold Start Logging (helps diagnose issues)
// ============================================
console.log('[Config] ========================================');
console.log('[Config] socialFetcher Configuration');
console.log('[Config] ========================================');
console.log('[Config] Region:', REGION);
console.log('[Config] Processor Function:', config.processor.functionName || '❌ NOT SET');
console.log('[Config] Auto Process:', config.processor.autoProcess);
if (!config.processor.functionName) {
  console.warn('[Config] ⚠️ WARNING: Processor function not configured!');
  console.warn('[Config] Posts will NOT be auto-processed after fetching.');
  console.warn('[Config] Set SOCIAL_POST_PROCESSOR_FUNCTION environment variable.');
}
console.log('[Config] ========================================');

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
  const warnings = [];
  
  if (!config.tables.socialAccount) {
    errors.push('Missing API_KINGSROOM_SOCIALACCOUNTTABLE_NAME environment variable');
  }
  if (!config.tables.socialPost) {
    errors.push('Missing API_KINGSROOM_SOCIALPOSTTABLE_NAME environment variable');
  }
  if (!config.facebook.accessToken) {
    errors.push('Missing FB_ACCESS_TOKEN environment variable');
  }
  
  // Warnings (won't fail validation but should be addressed)
  if (!config.processor.functionName) {
    warnings.push('SOCIAL_POST_PROCESSOR_FUNCTION not set - posts will not be auto-processed');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
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
  getEnvVar,
  REGION,
};