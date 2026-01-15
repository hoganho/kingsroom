// src/utils/scraperErrorUtils.ts
// Error classification and handling utilities for the scraper
// ENHANCED: Added shouldPauseForDecision and enum error detection
//
// v1.1.0:
// - FIXED: hasEnumErrors() no longer flags NOT_FOUND responses as having enum errors
//   - null gameVariant is expected for NOT_FOUND/NOT _IN_USE/NOT_PUBLISHED responses
// - NEW: isNotPublishedResponse() - separate helper for hidden tournaments
// - NEW: isInactiveResponse() - combined check for NOT_FOUND or NOT_PUBLISHED
// - CHANGED: isNotFoundResponse() no longer includes NOT_PUBLISHED (different status)

import { ErrorType, ErrorCounters, AutoProcessingConfig } from '../types/scraper';

/**
 * Classify an error into a type for handling decisions
 */
export const classifyError = (error: any, parsedData?: any): ErrorType => {
  const message = (error?.message || error || '').toString().toLowerCase();
  
  // Auth errors - stop immediately
  if (message.includes('401') || 
      message.includes('403') ||
      message.includes('unauthorized') || 
      message.includes('forbidden') ||
      message.includes('scraperapi') ||
      message.includes('api key') ||
      message.includes('invalid key')) {
    return 'AUTH';
  }
  
  // Not found / blank - tournament doesn't exist
  if (message.includes('404') ||
      message.includes('not found') ||
      message.includes('blank') ||
      message.includes('no data') ||
      message.includes('empty response') ||
      (parsedData?.gameStatus === 'NOT_PUBLISHED' && !parsedData?.name)) {
    return 'NOT_FOUND';
  }
  
  // Network errors - transient, can retry
  if (message.includes('timeout') || 
      message.includes('network') ||
      message.includes('econnrefused') ||
      message.includes('enotfound') ||
      message.includes('socket') ||
      message.includes('econnreset') ||
      message.includes('fetch failed')) {
    return 'NETWORK';
  }
  
  // Rate limiting - transient, wait and retry
  if (message.includes('429') || 
      message.includes('rate limit') ||
      message.includes('too many requests') ||
      message.includes('throttl') ||
      message.includes('quota')) {
    return 'RATE_LIMIT';
  }
  
  // Enum validation errors - specific handling
  if (message.includes('enum') ||
      message.includes('invalid value') ||
      parsedData?._enumErrors?.length > 0 ||
      parsedData?._enumErrorMessage) {
    return 'ENUM_VALIDATION';
  }
  
  // Parse errors
  if (message.includes('parse') || 
      message.includes('json') ||
      message.includes('unexpected token') ||
      message.includes('syntax error') ||
      (parsedData?.name === 'Error processing tournament')) {
    return 'PARSE';
  }
  
  // Validation errors
  if (message.includes('validation') || 
      message.includes('required field') ||
      message.includes('invalid') ||
      message.includes('constraint')) {
    return 'VALIDATION';
  }
  
  // Save/DB errors
  if (message.includes('dynamodb') || 
      message.includes('database') ||
      message.includes('save failed') ||
      message.includes('put item') ||
      message.includes('update item') ||
      message.includes('conditional check')) {
    return 'SAVE';
  }
  
  return 'UNKNOWN';
};

/**
 * Check if an error type is transient (worth auto-retrying)
 */
export const isTransientError = (errorType: ErrorType): boolean => {
  return errorType === 'NETWORK' || errorType === 'RATE_LIMIT';
};

/**
 * Check if an error should immediately stop processing
 */
export const shouldStopImmediately = (errorType: ErrorType): boolean => {
  return errorType === 'AUTH';
};

/**
 * Determine if we should pause for user decision based on counters and config
 * Used by the processing loop to know when to show error modal
 */
export const shouldPauseForDecision = (
  counters: ErrorCounters,
  config: AutoProcessingConfig,
  errorType: ErrorType,
  isAutoMode: boolean
): boolean => {
  // Auth errors always stop, not pause
  if (errorType === 'AUTH') {
    return false;
  }
  
  // In auto mode, check all thresholds
  if (isAutoMode) {
    return (
      counters.consecutiveErrors >= config.maxConsecutiveErrors ||
      counters.totalErrors >= config.maxTotalErrors ||
      counters.consecutiveNotFound >= config.maxConsecutiveNotFound ||
      (errorType === 'UNKNOWN' && config.pauseOnUnknownError)
    );
  }
  
  // In non-auto mode, only pause on unknown errors if configured
  return errorType === 'UNKNOWN' && config.pauseOnUnknownError;
};

/**
 * Determine if a response indicates an empty tournament slot (NOT_FOUND)
 * Used for consecutive NOT_FOUND tracking
 * 
 * v1.1.0: Separated from NOT_PUBLISHED handling
 * - NOT_FOUND/NOT _IN_USE = empty slot, no tournament exists
 * - NOT_PUBLISHED = tournament exists but is hidden (different handling)
 */
export const isNotFoundResponse = (parsedData: any, errorMsg?: string): boolean => {
  // Check parsedData gameStatus - only true "not found" statuses
  if (parsedData?.gameStatus === 'NOT_FOUND') {
    return true;
  }
  
  // Check error message
  if (errorMsg) {
    const msg = errorMsg.toLowerCase();
    return msg.includes('not found') || 
           msg.includes('404') || 
           msg.includes('blank') ||
           msg.includes('no data') ||
           msg.includes('empty');
  }
  
  return false;
};

/**
 * Determine if a response indicates a hidden tournament (NOT_PUBLISHED)
 * These are real tournaments that exist but aren't publicly visible
 * 
 * v1.1.0: Separated from NOT_FOUND handling
 */
export const isNotPublishedResponse = (parsedData: any): boolean => {
  return parsedData?.gameStatus === 'NOT_PUBLISHED';
};

/**
 * Determine if a response indicates any non-active tournament status
 * Includes both empty slots (NOT_FOUND) and hidden tournaments (NOT_PUBLISHED)
 */
export const isInactiveResponse = (parsedData: any): boolean => {
  return isNotFoundResponse(parsedData) || isNotPublishedResponse(parsedData);
};

/**
 * Check if parsed data has enum validation errors
 * v1.1.0: Only considers null gameVariant an error for REAL tournament responses
 * NOT_FOUND/NOT _IN_USE/NOT_PUBLISHED responses are expected to have null gameVariant
 */
export const hasEnumErrors = (parsedData: any): boolean => {
  // Check for explicit enum errors first
  if (parsedData?._enumErrors?.length > 0 || parsedData?._enumErrorMessage) {
    return true;
  }
  
  // null gameVariant often indicates enum issue, BUT only for real tournament responses
  // For NOT_FOUND/NOT _IN_USE/NOT_PUBLISHED, null gameVariant is expected
  if (parsedData?.gameVariant === null) {
    const isEmptySlot = parsedData?.gameStatus === 'NOT_FOUND' ||
                        parsedData?.gameStatus === 'NOT_PUBLISHED';
    return !isEmptySlot;  // Only flag as enum error if NOT an empty slot
  }
  
  return false;
};

/**
 * Extract enum error details from parsed data
 */
export const getEnumErrorDetails = (parsedData: any): { field: string; enumType: string; path?: string }[] => {
  if (!parsedData?._enumErrors) return [];
  return parsedData._enumErrors;
};

/**
 * Get user-friendly error description
 */
export const getErrorDescription = (errorType: ErrorType, message: string): string => {
  switch (errorType) {
    case 'AUTH':
      return `Authentication failed: ${message}\n\nYour API key may be invalid, expired, or out of credits. Processing cannot continue.`;
    case 'NETWORK':
      return `Network error: ${message}\n\nThis may be a temporary connectivity issue. You can retry or skip this tournament.`;
    case 'RATE_LIMIT':
      return `Rate limited: ${message}\n\nToo many requests sent. Wait a moment before retrying.`;
    case 'NOT_FOUND':
      return `Tournament not found: ${message}\n\nThis tournament ID may not exist yet or the page is blank.`;
    case 'PARSE':
      return `Failed to parse data: ${message}\n\nThe tournament page has an unexpected format or structure.`;
    case 'VALIDATION':
      return `Data validation failed: ${message}\n\nThe scraped data doesn't meet the required format.`;
    case 'ENUM_VALIDATION':
      return `Invalid enum value: ${message}\n\nThe scraped data contains a value that doesn't match expected options. This data cannot be saved until the schema is updated.`;
    case 'SAVE':
      return `Database error: ${message}\n\nFailed to save to the database. This may be a temporary issue.`;
    default:
      return `Unexpected error: ${message}\n\nThis error type wasn't recognized. You may want to investigate.`;
  }
};

/**
 * Get color scheme for error type
 */
export const getErrorColorScheme = (errorType: ErrorType): { border: string; bg: string; text: string } => {
  switch (errorType) {
    case 'AUTH':
      return { border: 'border-red-500', bg: 'bg-red-50', text: 'text-red-700' };
    case 'RATE_LIMIT':
      return { border: 'border-orange-500', bg: 'bg-orange-50', text: 'text-orange-700' };
    case 'NETWORK':
      return { border: 'border-yellow-500', bg: 'bg-yellow-50', text: 'text-yellow-700' };
    case 'NOT_FOUND':
      return { border: 'border-gray-400', bg: 'bg-gray-50', text: 'text-gray-600' };
    case 'ENUM_VALIDATION':
      return { border: 'border-amber-500', bg: 'bg-amber-50', text: 'text-amber-700' };
    case 'PARSE':
      return { border: 'border-purple-400', bg: 'bg-purple-50', text: 'text-purple-700' };
    case 'SAVE':
      return { border: 'border-red-400', bg: 'bg-red-50', text: 'text-red-700' };
    default:
      return { border: 'border-red-400', bg: 'bg-red-50', text: 'text-red-700' };
  }
};

/**
 * Get recommended action for error type
 */
export const getRecommendedAction = (errorType: ErrorType): 'stop' | 'retry' | 'skip' | 'review' => {
  switch (errorType) {
    case 'AUTH':
      return 'stop';
    case 'NETWORK':
    case 'RATE_LIMIT':
      return 'retry';
    case 'NOT_FOUND':
      return 'skip';
    case 'ENUM_VALIDATION':
    case 'PARSE':
    case 'VALIDATION':
      return 'review';
    case 'SAVE':
      return 'retry';
    default:
      return 'review';
  }
};

/**
 * Format error for display in UI
 */
export const formatErrorForDisplay = (errorType: ErrorType, message: string): {
  title: string;
  description: string;
  canRetry: boolean;
  canSkip: boolean;
  shouldStop: boolean;
} => {
  return {
    title: errorType.replace(/_/g, ' '),
    description: getErrorDescription(errorType, message),
    canRetry: isTransientError(errorType) || errorType === 'SAVE',
    canSkip: errorType !== 'AUTH',
    shouldStop: errorType === 'AUTH',
  };
};;