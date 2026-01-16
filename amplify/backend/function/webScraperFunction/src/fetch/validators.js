/**
 * ===================================================================
 * Validators (v1.1.0)
 * ===================================================================
 * 
 * URL and HTML validation utilities.
 * 
 * UPDATED v1.1.0:
 * - ADDED: isCaptchaOrBotBlock() to detect bot protection pages
 *   - Detects SiteGround sgcaptcha, Cloudflare challenges, etc.
 *   - Returns true for pages that are CAPTCHA/bot detection redirects
 *   - These should be treated as temporary fetch failures, not parsed
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
 * Detect CAPTCHA or bot protection pages
 * 
 * These are NOT actual tournament pages - they are security challenge pages
 * that should be treated as temporary fetch failures.
 * 
 * Common patterns:
 * - SiteGround: meta refresh to /.well-known/sgcaptcha/
 * - Cloudflare: __cf_chl_opt, cf-browser-verification
 * - Generic: captcha, challenge, bot detection
 * 
 * NEW in v1.1.0
 * 
 * @param {string} html - HTML content to check
 * @returns {object} { isBlocked: boolean, blockType: string|null }
 */
const isCaptchaOrBotBlock = (html) => {
    if (!html || typeof html !== 'string') {
        return { isBlocked: false, blockType: null };
    }
    
    const htmlLower = html.toLowerCase();
    
    // SiteGround CAPTCHA/bot protection
    // Pattern: <meta http-equiv="refresh" content="0;/.well-known/sgcaptcha/...">
    if (htmlLower.includes('/.well-known/sgcaptcha/') || 
        htmlLower.includes('sgcaptcha')) {
        return { isBlocked: true, blockType: 'SITEGROUND_CAPTCHA' };
    }
    
    // Cloudflare challenge
    if (htmlLower.includes('__cf_chl_opt') || 
        htmlLower.includes('cf-browser-verification') ||
        htmlLower.includes('cloudflare') && htmlLower.includes('challenge')) {
        return { isBlocked: true, blockType: 'CLOUDFLARE_CHALLENGE' };
    }
    
    // Generic CAPTCHA detection
    if ((htmlLower.includes('captcha') && htmlLower.includes('verify')) ||
        htmlLower.includes('bot detection') ||
        htmlLower.includes('are you human') ||
        htmlLower.includes('prove you are human')) {
        return { isBlocked: true, blockType: 'GENERIC_CAPTCHA' };
    }
    
    // Meta refresh to challenge URL (generic pattern)
    const metaRefreshMatch = html.match(/<meta[^>]*http-equiv=["']?refresh["']?[^>]*content=["']?[^"']*(?:captcha|challenge|verify|blocked)[^"']*["']?/i);
    if (metaRefreshMatch) {
        return { isBlocked: true, blockType: 'REDIRECT_CHALLENGE' };
    }
    
    // Very short HTML with just a redirect (suspicious - likely a challenge)
    // Normal pages have body content; challenge pages often don't
    if (html.length < 500 && !/<body/i.test(html) && /<meta[^>]*refresh/i.test(html)) {
        return { isBlocked: true, blockType: 'SUSPICIOUS_REDIRECT' };
    }
    
    return { isBlocked: false, blockType: null };
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
    if (isNotInUse(html)) return 'BLANK';
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
    isCaptchaOrBotBlock,  // NEW v1.1.0
    isTournamentNotFound,
    isNotPublished,
    isNotInUse,
    detectSpecialStatus,
    validateFetchOptions
};