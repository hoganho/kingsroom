/**
 * ===================================================================
 * Secrets Manager (v1.0.0)
 * ===================================================================
 * 
 * Secure retrieval of secrets from AWS SSM Parameter Store.
 * 
 * Benefits over environment variables:
 * - Encrypted at rest with KMS (SecureString)
 * - IAM-controlled access
 * - Rotate without redeploying
 * - Audit trail via CloudTrail
 * - Different values per environment
 * 
 * Usage:
 *   const { getScraperApiKey } = require('./config/secrets');
 *   const apiKey = await getScraperApiKey();
 * 
 * SSM Parameter naming convention:
 *   /pokerpro/{env}/scraperapi-key
 *   e.g., /pokerpro/prod/scraperapi-key
 *         /pokerpro/dev/scraperapi-key
 * 
 * ===================================================================
 */

const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

// Initialize SSM client (reused across invocations)
const ssmClient = new SSMClient({
    region: process.env.REGION || 'ap-southeast-2'
});

// ═══════════════════════════════════════════════════════════════════════
// IN-MEMORY CACHE
// Lambda containers are reused, so we cache secrets to avoid repeated
// SSM calls. Cache is cleared when container is recycled.
// ═══════════════════════════════════════════════════════════════════════

const secretsCache = {
    scraperApiKey: null,
    // Add other secrets here as needed
};

// Cache TTL (optional - set to 0 to cache forever within container lifecycle)
const CACHE_TTL_MS = 0; // 0 = no expiry (recommended for Lambda)
const cacheTimestamps = {};

/**
 * Check if cached value is still valid
 */
const isCacheValid = (key) => {
    if (!secretsCache[key]) return false;
    if (CACHE_TTL_MS === 0) return true;
    
    const timestamp = cacheTimestamps[key] || 0;
    return (Date.now() - timestamp) < CACHE_TTL_MS;
};

// ═══════════════════════════════════════════════════════════════════════
// SSM PARAMETER RETRIEVAL
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get a parameter from SSM Parameter Store
 * 
 * @param {string} parameterName - Full parameter name (e.g., /pokerpro/prod/scraperapi-key)
 * @param {boolean} withDecryption - Whether to decrypt SecureString (default: true)
 * @returns {Promise<string>} Parameter value
 */
const getParameter = async (parameterName, withDecryption = true) => {
    try {
        const response = await ssmClient.send(new GetParameterCommand({
            Name: parameterName,
            WithDecryption: withDecryption
        }));
        
        return response.Parameter.Value;
        
    } catch (error) {
        if (error.name === 'ParameterNotFound') {
            throw new Error(`SSM parameter not found: ${parameterName}`);
        }
        if (error.name === 'AccessDeniedException') {
            throw new Error(`Access denied to SSM parameter: ${parameterName}. Check IAM permissions.`);
        }
        throw error;
    }
};

/**
 * Build environment-specific parameter name
 * 
 * @param {string} secretName - Base secret name (e.g., 'scraperapi-key')
 * @returns {string} Full parameter path
 */
const buildParameterName = (secretName) => {
    const env = process.env.ENV || 'dev';
    const prefix = process.env.SSM_PREFIX || '/pokerpro';
    return `${prefix}/${env}/${secretName}`;
};

// ═══════════════════════════════════════════════════════════════════════
// SECRET GETTERS
// ═══════════════════════════════════════════════════════════════════════

/**
 * Get ScraperAPI key from SSM Parameter Store
 * 
 * Caches the value for the lifetime of the Lambda container.
 * Falls back to environment variable for local development.
 * 
 * @returns {Promise<string>} ScraperAPI key
 * @throws {Error} If key not found in SSM or environment
 */
const getScraperApiKey = async () => {
    // Return cached value if valid
    if (isCacheValid('scraperApiKey')) {
        return secretsCache.scraperApiKey;
    }
    
    // Try SSM Parameter Store first
    try {
        // Allow override of parameter name via environment variable
        const parameterName = process.env.SCRAPERAPI_KEY_PARAM || buildParameterName('scraperapi-key');
        
        console.log(`[Secrets] Fetching ScraperAPI key from SSM: ${parameterName}`);
        
        const apiKey = await getParameter(parameterName);
        
        // Cache the value
        secretsCache.scraperApiKey = apiKey;
        cacheTimestamps.scraperApiKey = Date.now();
        
        console.log(`[Secrets] ✅ ScraperAPI key loaded from SSM (${apiKey.substring(0, 8)}...)`);
        return apiKey;
        
    } catch (ssmError) {
        console.warn(`[Secrets] SSM lookup failed: ${ssmError.message}`);
        
        // Fallback to environment variable (for local dev or migration period)
        if (process.env.SCRAPERAPI_KEY) {
            console.warn('[Secrets] ⚠️ Using fallback SCRAPERAPI_KEY from environment variable');
            console.warn('[Secrets] ⚠️ This should only be used for local development!');
            
            secretsCache.scraperApiKey = process.env.SCRAPERAPI_KEY;
            cacheTimestamps.scraperApiKey = Date.now();
            
            return process.env.SCRAPERAPI_KEY;
        }
        
        // No fallback available
        throw new Error(
            `ScraperAPI key not configured. ` +
            `Expected SSM parameter: ${buildParameterName('scraperapi-key')} ` +
            `or environment variable: SCRAPERAPI_KEY`
        );
    }
};

/**
 * Clear the secrets cache
 * Useful for testing or forcing a refresh
 */
const clearSecretsCache = () => {
    Object.keys(secretsCache).forEach(key => {
        secretsCache[key] = null;
        delete cacheTimestamps[key];
    });
    console.log('[Secrets] Cache cleared');
};

/**
 * Preload all secrets into cache
 * Call this at Lambda cold start to avoid latency on first request
 */
const preloadSecrets = async () => {
    console.log('[Secrets] Preloading secrets...');
    
    try {
        await getScraperApiKey();
        // Add other secrets here as needed
        console.log('[Secrets] ✅ All secrets preloaded');
    } catch (error) {
        console.error('[Secrets] ❌ Failed to preload secrets:', error.message);
        // Don't throw - let individual calls fail with specific errors
    }
};

module.exports = {
    getScraperApiKey,
    clearSecretsCache,
    preloadSecrets,
    // Export for testing
    buildParameterName,
    getParameter
};
