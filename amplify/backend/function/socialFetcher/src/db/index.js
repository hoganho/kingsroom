/**
 * Database Module Index
 * 
 * Re-exports all database operations for easy importing.
 */

const accounts = require('./accounts');
const posts = require('./posts');
const attempts = require('./attempts');

module.exports = {
  // Account operations
  getSocialAccount: accounts.getSocialAccount,
  getAccountsDueForScrape: accounts.getAccountsDueForScrape,
  getAccountsByIds: accounts.getAccountsByIds,
  updateAccountAfterScrape: accounts.updateAccountAfterScrape,
  incrementFailures: accounts.incrementFailures,
  resetFailures: accounts.resetFailures,
  calculateNextScrapeTime: accounts.calculateNextScrapeTime,
  aestHourToUTC: accounts.aestHourToUTC,
  utcHourToAEST: accounts.utcHourToAEST,
  
  // Post operations
  getExistingPost: posts.getExistingPost,
  savePost: posts.savePost,
  getPostDateRange: posts.getPostDateRange,
  generatePostId: posts.generatePostId,
  getPostYearMonth: posts.getPostYearMonth,
  
  // Attempt operations
  createScrapeAttempt: attempts.createScrapeAttempt,
  updateScrapeAttempt: attempts.updateScrapeAttempt,
  completeScrapeAttempt: attempts.completeScrapeAttempt,
  checkCancellationRequested: attempts.checkCancellationRequested,
  clearCancellationFlag: attempts.clearCancellationFlag,
};
