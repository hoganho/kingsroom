/**
 * ===================================================================
 * Validators
 * ===================================================================
 * 
 * URL and HTML validation utilities.
 * 
 * ===================================================================
 */

const { URL } = require('url');

/**
 * Validate URL format
 * 
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid HTTP/HTTPS URL
 */
const isValidUrl = (url) => {
    if (!url || typeof url !== 'string') return false;
    
    try {
        const urlObj = new URL(url);
        return urlObj.protocol === 'http:' || urlObj.protocol === 'https:';
    } catch {
        return false;
    }
};

/**
 * Basic HTML validation
 * Checks for minimum length and basic HTML structure
 * 
 * @param {string} html - HTML content to validate
 * @returns {boolean} True if appears to be valid HTML
 */
const isValidHtml = (html) => {
    if (!html || typeof html !== 'string') return false;
    if (html.trim().length < 100) return false;
    
    // Check for basic HTML structure
    const hasHtmlTag = /<html/i.test(html) || /<\/html>/i.test(html);
    const hasBodyTag = /<body/i.test(html) || /<\/body>/i.test(html);
    const hasContent = html.length > 500;
    
    return hasContent && (hasHtmlTag || hasBodyTag);
};

/**
 * Check if HTML indicates "Tournament Not Found"
 * 
 * @param {string} html - HTML content to check
 * @returns {boolean} True if tournament not found page
 */
const isTournamentNotFound = (html) => {
    if (!html) return false;
    
    // Match the specific badge class and text used by the site
    const notFoundRegex = /class=["']cw-badge\s+cw-bg-warning["'][^>]*>\s*Tournament\s+not\s+found/i;
    return notFoundRegex.test(html);
};

/**
 * Check if HTML indicates "Not Published" tournament
 * 
 * @param {string} html - HTML content to check
 * @returns {boolean} True if not published page
 */
const isNotPublished = (html) => {
    if (!html) return false;
    
    // Common patterns for unpublished tournaments
    const patterns = [
        /not\s+published/i,
        /tournament\s+is\s+not\s+available/i,
        /this\s+tournament\s+has\s+not\s+been\s+published/i
    ];
    
    return patterns.some(pattern => pattern.test(html));
};

/**
 * Check if HTML indicates "Not In Use" tournament
 * 
 * @param {string} html - HTML content to check
 * @returns {boolean} True if not in use page
 */
const isNotInUse = (html) => {
    if (!html) return false;
    
    const patterns = [
        /not\s+in\s+use/i,
        /tournament\s+id\s+is\s+not\s+in\s+use/i
    ];
    
    return patterns.some(pattern => pattern.test(html));
};

/**
 * Determine the game status from HTML content
 * Returns the appropriate status for non-standard pages
 * 
 * @param {string} html - HTML content to check
 * @returns {string|null} Status string or null if normal tournament
 */
const detectSpecialStatus = (html) => {
    if (isTournamentNotFound(html)) return 'NOT_FOUND';
    if (isNotPublished(html)) return 'NOT_PUBLISHED';
    if (isNotInUse(html)) return 'NOT_IN_USE';
    return null;
};

/**
 * Validate fetch options
 * 
 * @param {object} options - Options to validate
 * @throws {Error} If options are invalid
 */
const validateFetchOptions = (options) => {
    const { url, s3Key, entityId } = options;
    
    // Must have either URL or S3 key
    if (!url && !s3Key) {
        throw new Error('Either url or s3Key is required for fetch operation');
    }
    
    // Validate URL if provided
    if (url && !isValidUrl(url)) {
        throw new Error(`Invalid URL provided: ${url}`);
    }
    
    // Entity ID is required
    if (!entityId) {
        throw new Error('Entity ID is required for fetch operation');
    }
};

module.exports = {
    isValidUrl,
    isValidHtml,
    isTournamentNotFound,
    isNotPublished,
    isNotInUse,
    detectSpecialStatus,
    validateFetchOptions
};
