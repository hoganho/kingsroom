/**
 * LLM Provider Factory
 * Supports multiple LLM providers with a unified interface
 * UPDATED: January 2025 - Added more models, cost estimation, unified API
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
  openai: 'gpt-4o-mini',  // Changed from gpt-4o - better for rate limits and cost
  anthropic: 'claude-sonnet-4-20250514',
};

// Model aliases for convenience - maps friendly names to provider/model
const modelAliases = {
  // OpenAI models
  'gpt-4o': { provider: 'openai', model: 'gpt-4o' },
  'gpt-4o-mini': { provider: 'openai', model: 'gpt-4o-mini' },
  'gpt-4.1': { provider: 'openai', model: 'gpt-4.1' },
  'gpt-4.1-mini': { provider: 'openai', model: 'gpt-4.1-mini' },
  'gpt-4.1-nano': { provider: 'openai', model: 'gpt-4.1-nano' },
  'gpt-4-turbo': { provider: 'openai', model: 'gpt-4-turbo' },
  'o3-mini': { provider: 'openai', model: 'o3-mini' },
  'o4-mini': { provider: 'openai', model: 'o4-mini' },
  
  // Anthropic Claude 4 models (primary)
  'claude-sonnet': { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
  'claude-opus': { provider: 'anthropic', model: 'claude-opus-4-20250514' },
  'claude-haiku': { provider: 'anthropic', model: 'claude-haiku-4-20250514' },
  
  // Full model names as aliases
  'claude-sonnet-4-20250514': { provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
  'claude-opus-4-20250514': { provider: 'anthropic', model: 'claude-opus-4-20250514' },
  'claude-haiku-4-20250514': { provider: 'anthropic', model: 'claude-haiku-4-20250514' },
  
  // Legacy Claude 3.5 aliases
  'claude-3.5-sonnet': { provider: 'anthropic', model: 'claude-3-5-sonnet-20241022' },
  'claude-3.5-haiku': { provider: 'anthropic', model: 'claude-3-5-haiku-20241022' },
};

// All available models with metadata for UI
const ALL_MODELS = [
  // OpenAI - Recommended
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    displayName: 'GPT-4o Mini',
    description: 'Fast, cheap, good quality',
    inputPrice: 0.15,
    outputPrice: 0.60,
    contextWindow: 128000,
    tier: 'standard',
    recommended: true,
  },
  // OpenAI - Premium
  {
    id: 'gpt-4o',
    provider: 'openai',
    displayName: 'GPT-4o',
    description: 'Most capable OpenAI model',
    inputPrice: 2.50,
    outputPrice: 10.00,
    contextWindow: 128000,
    tier: 'premium',
    recommended: false,
  },
  // OpenAI - Latest
  {
    id: 'gpt-4.1-mini',
    provider: 'openai',
    displayName: 'GPT-4.1 Mini',
    description: 'Latest mini, 1M context',
    inputPrice: 0.40,
    outputPrice: 1.60,
    contextWindow: 1000000,
    tier: 'standard',
    recommended: false,
  },
  {
    id: 'gpt-4.1-nano',
    provider: 'openai',
    displayName: 'GPT-4.1 Nano',
    description: 'Cheapest OpenAI option',
    inputPrice: 0.10,
    outputPrice: 0.40,
    contextWindow: 1000000,
    tier: 'economy',
    recommended: false,
  },
  {
    id: 'gpt-4.1',
    provider: 'openai',
    displayName: 'GPT-4.1',
    description: 'Latest full model, 1M context',
    inputPrice: 2.00,
    outputPrice: 8.00,
    contextWindow: 1000000,
    tier: 'premium',
    recommended: false,
  },
  // Anthropic - Recommended
  {
    id: 'claude-sonnet',
    provider: 'anthropic',
    displayName: 'Claude 4 Sonnet',
    description: 'Balanced quality and cost',
    inputPrice: 3.00,
    outputPrice: 15.00,
    contextWindow: 200000,
    tier: 'standard',
    recommended: true,
  },
  // Anthropic - Economy
  {
    id: 'claude-haiku',
    provider: 'anthropic',
    displayName: 'Claude 4 Haiku',
    description: 'Fast and very cheap',
    inputPrice: 0.25,
    outputPrice: 1.25,
    contextWindow: 200000,
    tier: 'economy',
    recommended: false,
  },
  // Anthropic - Premium
  {
    id: 'claude-opus',
    provider: 'anthropic',
    displayName: 'Claude 4 Opus',
    description: 'Most capable Claude model',
    inputPrice: 15.00,
    outputPrice: 75.00,
    contextWindow: 200000,
    tier: 'premium',
    recommended: false,
  },
];

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
  if (modelString.startsWith('gpt-') || modelString.startsWith('o1-') || modelString.startsWith('o3-') || modelString.startsWith('o4-')) {
    return { provider: 'openai', model: modelString };
  }
  
  if (modelString.startsWith('claude-')) {
    return { provider: 'anthropic', model: modelString };
  }
  
  // Default to OpenAI's recommended model
  console.warn(`Unknown model: ${modelString}, defaulting to gpt-4o-mini`);
  return { provider: 'openai', model: 'gpt-4o-mini' };
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

/**
 * Get all available models with full metadata
 * @returns {object[]}
 */
function getAllModels() {
  return [...ALL_MODELS];
}

/**
 * Get model info by ID
 * @param {string} modelId 
 * @returns {object | null}
 */
function getModelInfo(modelId) {
  // First check ALL_MODELS
  const model = ALL_MODELS.find(m => m.id === modelId);
  if (model) return model;
  
  // Try resolving alias
  const resolved = resolveModel(modelId);
  return ALL_MODELS.find(m => m.id === resolved.model || m.id === modelId) || null;
}

/**
 * Estimate cost for a request
 * @param {string} modelId - Model ID or alias
 * @param {number} inputTokens - Estimated input tokens
 * @param {number} outputTokens - Expected output tokens (default 4096)
 * @returns {{ inputCost: number, outputCost: number, totalCost: number, model: object }}
 */
function estimateCost(modelId, inputTokens, outputTokens = 4096) {
  const model = getModelInfo(modelId);
  
  if (!model) {
    // Fallback to gpt-4o-mini pricing
    const inputCost = (inputTokens / 1_000_000) * 0.15;
    const outputCost = (outputTokens / 1_000_000) * 0.60;
    return {
      inputCost: Math.round(inputCost * 10000) / 10000,
      outputCost: Math.round(outputCost * 10000) / 10000,
      totalCost: Math.round((inputCost + outputCost) * 10000) / 10000,
      model: null,
    };
  }
  
  const inputCost = (inputTokens / 1_000_000) * model.inputPrice;
  const outputCost = (outputTokens / 1_000_000) * model.outputPrice;
  
  return {
    inputCost: Math.round(inputCost * 10000) / 10000,
    outputCost: Math.round(outputCost * 10000) / 10000,
    totalCost: Math.round((inputCost + outputCost) * 10000) / 10000,
    model,
  };
}

/**
 * Get the globally recommended model
 * @returns {object}
 */
function getRecommendedModel() {
  return ALL_MODELS.find(m => m.id === 'gpt-4o-mini') || ALL_MODELS[0];
}

module.exports = {
  getProvider,
  resolveModel,
  getDefaultModel,
  listProviders,
  listModelAliases,
  getAllModels,
  getModelInfo,
  estimateCost,
  getRecommendedModel,
  ALL_MODELS,
};
