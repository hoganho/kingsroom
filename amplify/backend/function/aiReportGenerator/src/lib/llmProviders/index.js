/**
 * LLM Provider Factory
 * Supports multiple LLM providers with a unified interface
 */

const OpenAIProvider = require('./openai');
const AnthropicProvider = require('./anthropic');

// Provider registry
const providers = {
  openai: OpenAIProvider,
  anthropic: AnthropicProvider,
};

// Default models per provider
const defaultModels = {
  openai: 'gpt-4o',
  anthropic: 'claude-sonnet-4-20250514',
};

// Model aliases for convenience
const modelAliases = {
  'gpt-4o': { provider: 'openai', model: 'gpt-4o' },
  'gpt-4o-mini': { provider: 'openai', model: 'gpt-4o-mini' },
  'gpt-4-turbo': { provider: 'openai', model: 'gpt-4-turbo' },
  'claude-sonnet': { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
  'claude-opus': { provider: 'anthropic', model: 'claude-opus-4-20250514' },
  'claude-haiku': { provider: 'anthropic', model: 'claude-haiku-4-20250514' },
};

/**
 * Get an LLM provider instance
 * @param {string} providerName - 'openai' or 'anthropic'
 * @param {object} config - Provider-specific config (apiKey, etc.)
 * @returns {object} Provider instance with generateReport method
 */
function getProvider(providerName, config = {}) {
  const ProviderClass = providers[providerName.toLowerCase()];
  
  if (!ProviderClass) {
    throw new Error(`Unknown LLM provider: ${providerName}. Supported: ${Object.keys(providers).join(', ')}`);
  }
  
  return new ProviderClass(config);
}

/**
 * Resolve a model string to provider and model name
 * @param {string} modelString - Model name or alias (e.g., 'gpt-4o', 'claude-sonnet')
 * @returns {{ provider: string, model: string }}
 */
function resolveModel(modelString) {
  // Check if it's an alias
  if (modelAliases[modelString]) {
    return modelAliases[modelString];
  }
  
  // Try to infer provider from model name
  if (modelString.startsWith('gpt-') || modelString.startsWith('o1-')) {
    return { provider: 'openai', model: modelString };
  }
  
  if (modelString.startsWith('claude-')) {
    return { provider: 'anthropic', model: modelString };
  }
  
  // Default to OpenAI
  return { provider: 'openai', model: modelString };
}

/**
 * Get the default model for a provider
 * @param {string} providerName 
 * @returns {string} Default model name
 */
function getDefaultModel(providerName) {
  return defaultModels[providerName.toLowerCase()] || defaultModels.openai;
}

/**
 * List available providers
 * @returns {string[]}
 */
function listProviders() {
  return Object.keys(providers);
}

/**
 * List available model aliases
 * @returns {object}
 */
function listModelAliases() {
  return { ...modelAliases };
}

module.exports = {
  getProvider,
  resolveModel,
  getDefaultModel,
  listProviders,
  listModelAliases,
};
