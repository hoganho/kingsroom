/**
 * Services Module Index
 * 
 * Re-exports all service modules for easy importing.
 */

const facebook = require('./facebook');
const s3 = require('./s3');
const appsync = require('./appsync');
const processor = require('./processor');

module.exports = {
  // Facebook API
  ...facebook,
  
  // S3 Storage
  ...s3,
  
  // AppSync
  ...appsync,
  
  // Post Processor
  ...processor,
};
