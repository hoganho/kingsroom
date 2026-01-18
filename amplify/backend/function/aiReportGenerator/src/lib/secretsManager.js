/**
 * AWS SSM Parameter Store Helper
 * Securely retrieves API keys for LLM providers (FREE tier)
 */

const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');

// Cache for parameters (Lambda warm start optimization)
const parameterCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Parameter names in SSM Parameter Store
const PARAMETER_NAMES = {
  openai: process.env.OPENAI_PARAM_NAME || '/pokerpro/openai-api-key',
  anthropic: process.env.ANTHROPIC_PARAM_NAME || '/pokerpro/anthropic-api-key',
};

// Initialize SSM client
const client = new SSMClient({
  region: process.env.AWS_REGION || 'ap-southeast-2',
});

/**
 * Get an API key from SSM Parameter Store
 * @param {string} provider - 'openai' or 'anthropic'
 * @returns {Promise<string>} The API key
 */
async function getApiKey(provider) {
  const paramName = PARAMETER_NAMES[provider.toLowerCase()];
  
  if (!paramName) {
    throw new Error(`Unknown provider: ${provider}. Configure PARAMETER_NAMES for this provider.`);
  }
  
  // Check cache first
  const cached = parameterCache.get(paramName);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    console.log(`Using cached parameter for ${provider}`);
    return cached.value;
  }
  
  try {
    console.log(`Fetching parameter for ${provider} from SSM Parameter Store...`);
    
    const command = new GetParameterCommand({
      Name: paramName,
      WithDecryption: true, // Decrypt SecureString parameters
    });
    
    const response = await client.send(command);
    
    const apiKey = response.Parameter?.Value;
    
    if (!apiKey) {
      throw new Error(`Parameter ${paramName} has no value`);
    }
    
    // Validate the key format
    if (provider === 'openai' && !apiKey.startsWith('sk-')) {
      console.warn('OpenAI API key does not start with sk- prefix');
    }
    
    // Cache the result
    parameterCache.set(paramName, {
      value: apiKey,
      timestamp: Date.now(),
    });
    
    return apiKey;
    
  } catch (error) {
    console.error(`Failed to retrieve parameter ${paramName}:`, error.message);
    
    // Check if it's a "not found" error
    if (error.name === 'ParameterNotFound') {
      throw new Error(`Parameter '${paramName}' not found in SSM Parameter Store. Create it with:\n  aws ssm put-parameter --name "${paramName}" --value "your-api-key" --type SecureString`);
    }
    
    throw new Error(`Failed to get ${provider} API key: ${error.message}`);
  }
}

/**
 * Check if a provider's API key is configured
 * @param {string} provider 
 * @returns {Promise<boolean>}
 */
async function isProviderConfigured(provider) {
  try {
    const key = await getApiKey(provider);
    return !!key && key.length > 10;
  } catch {
    return false;
  }
}

/**
 * Clear the parameter cache (useful for testing or forced refresh)
 */
function clearCache() {
  parameterCache.clear();
}

/**
 * Get the parameter name for a provider (useful for setup instructions)
 * @param {string} provider 
 * @returns {string}
 */
function getParameterName(provider) {
  return PARAMETER_NAMES[provider.toLowerCase()] || `/pokerpro/${provider}-api-key`;
}

module.exports = {
  getApiKey,
  isProviderConfigured,
  clearCache,
  getParameterName,
};
