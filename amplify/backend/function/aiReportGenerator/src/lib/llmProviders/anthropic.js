/**
 * Anthropic Provider Implementation
 * Supports Claude 4 Sonnet, Opus, and Haiku models
 * UPDATED: January 2025 - Added Claude 4 models with current pricing
 */

const https = require('https');

// Pricing per 1M tokens (as of January 2025)
const MODEL_PRICING = {
  // Claude 4 models (current)
  'claude-opus-4-20250514': { input: 15.00, output: 75.00, contextWindow: 200000, maxOutput: 32768 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00, contextWindow: 200000, maxOutput: 64000 },
  'claude-haiku-4-20250514': { input: 0.25, output: 1.25, contextWindow: 200000, maxOutput: 64000 },
  
  // Model aliases for convenience
  'claude-4-opus': { input: 15.00, output: 75.00, contextWindow: 200000, maxOutput: 32768 },
  'claude-4-sonnet': { input: 3.00, output: 15.00, contextWindow: 200000, maxOutput: 64000 },
  'claude-4-haiku': { input: 0.25, output: 1.25, contextWindow: 200000, maxOutput: 64000 },
  
  // Legacy Claude 3.5 models
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00, contextWindow: 200000, maxOutput: 8192 },
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00, contextWindow: 200000, maxOutput: 8192 },
  
  // Legacy Claude 3 models (still available)
  'claude-3-opus-20240229': { input: 15.00, output: 75.00, contextWindow: 200000, maxOutput: 4096 },
  'claude-3-sonnet-20240229': { input: 3.00, output: 15.00, contextWindow: 200000, maxOutput: 4096 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25, contextWindow: 200000, maxOutput: 4096 },
};

// Model metadata for UI display
const MODEL_METADATA = {
  'claude-opus-4-20250514': {
    displayName: 'Claude 4 Opus',
    description: 'Most capable, best for complex analysis',
    tier: 'premium',
    recommended: false,
    alias: 'claude-opus',
  },
  'claude-sonnet-4-20250514': {
    displayName: 'Claude 4 Sonnet',
    description: 'Balanced quality and cost - RECOMMENDED',
    tier: 'standard',
    recommended: true,
    alias: 'claude-sonnet',
  },
  'claude-haiku-4-20250514': {
    displayName: 'Claude 4 Haiku',
    description: 'Fast and cheap, good for simpler tasks',
    tier: 'economy',
    recommended: false,
    alias: 'claude-haiku',
  },
  'claude-3-5-sonnet-20241022': {
    displayName: 'Claude 3.5 Sonnet',
    description: 'Previous generation, still very capable',
    tier: 'standard',
    recommended: false,
    alias: 'claude-3.5-sonnet',
  },
  'claude-3-5-haiku-20241022': {
    displayName: 'Claude 3.5 Haiku',
    description: 'Previous generation mini model',
    tier: 'economy',
    recommended: false,
    alias: 'claude-3.5-haiku',
  },
};

class AnthropicProvider {
  constructor(config = {}) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'api.anthropic.com';
    this.defaultModel = config.model || 'claude-sonnet-4-20250514';
    this.timeout = config.timeout || 120000; // 2 minutes
    this.apiVersion = config.apiVersion || '2023-06-01';
  }

  /**
   * Get estimated cost for a request before making it
   * @param {string} model - Model name
   * @param {number} inputTokens - Estimated input tokens
   * @param {number} outputTokens - Expected output tokens
   * @returns {{ inputCost: number, outputCost: number, totalCost: number }}
   */
  static estimateCost(model, inputTokens, outputTokens = 4096) {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-20250514'];
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return {
      inputCost: Math.round(inputCost * 10000) / 10000,
      outputCost: Math.round(outputCost * 10000) / 10000,
      totalCost: Math.round((inputCost + outputCost) * 10000) / 10000,
    };
  }

  /**
   * Get model info including pricing
   * @param {string} model 
   * @returns {object}
   */
  static getModelInfo(model) {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-20250514'];
    const metadata = MODEL_METADATA[model] || {
      displayName: model,
      description: 'Unknown model',
      tier: 'standard',
      recommended: false,
    };
    return { ...pricing, ...metadata };
  }

  /**
   * Get all available models with their info
   * @returns {object[]}
   */
  static getAvailableModels() {
    // Only return main Claude 4 models for simplicity
    const mainModels = [
      'claude-sonnet-4-20250514',
      'claude-haiku-4-20250514',
      'claude-opus-4-20250514',
    ];
    
    return mainModels.map(id => ({
      id,
      ...MODEL_PRICING[id],
      ...(MODEL_METADATA[id] || { displayName: id, description: '', tier: 'standard', recommended: false }),
    }));
  }

  /**
   * Generate a director report from a metrics pack
   * @param {object} params
   * @param {string} params.systemPrompt - System instructions
   * @param {string} params.userPrompt - User message with metrics data
   * @param {string} params.model - Model to use (default: claude-sonnet-4-20250514)
   * @param {number} params.maxTokens - Max output tokens (default: 4096)
   * @param {number} params.temperature - Temperature (default: 0.3)
   * @param {object} params.responseFormat - JSON schema for structured output (not used by Anthropic, but kept for interface compatibility)
   * @returns {Promise<object>} Generated report with metadata
   */
  async generateReport(params) {
    const {
      systemPrompt,
      userPrompt,
      model = this.defaultModel,
      maxTokens = 4096,
      temperature = 0.3,
    } = params;

    const startTime = Date.now();

    // For Claude, we embed JSON instructions in the system prompt
    const enhancedSystemPrompt = `${systemPrompt}

IMPORTANT: You MUST respond with valid JSON only. No markdown code blocks, no explanatory text before or after the JSON. Start your response with { and end with }.`;

    const requestBody = {
      model,
      max_tokens: maxTokens,
      temperature,
      system: enhancedSystemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
      ],
    };

    try {
      const response = await this._makeRequest('/v1/messages', requestBody);
      
      const endTime = Date.now();
      const durationMs = endTime - startTime;

      // Extract text content from response
      const textBlock = response.content?.find(block => block.type === 'text');
      const content = textBlock?.text || '';
      
      let parsedContent;
      try {
        // Clean up potential markdown code blocks
        let cleanContent = content.trim();
        if (cleanContent.startsWith('```json')) {
          cleanContent = cleanContent.slice(7);
        } else if (cleanContent.startsWith('```')) {
          cleanContent = cleanContent.slice(3);
        }
        if (cleanContent.endsWith('```')) {
          cleanContent = cleanContent.slice(0, -3);
        }
        cleanContent = cleanContent.trim();
        
        parsedContent = JSON.parse(cleanContent);
      } catch (parseError) {
        console.error('Failed to parse Anthropic response as JSON:', content);
        throw new Error(`Failed to parse response as JSON: ${parseError.message}`);
      }

      // Calculate costs
      const inputTokens = response.usage?.input_tokens || 0;
      const outputTokens = response.usage?.output_tokens || 0;
      const cost = this._calculateCost(model, inputTokens, outputTokens);

      return {
        success: true,
        content: parsedContent,
        rawContent: content,
        metadata: {
          provider: 'anthropic',
          model,
          modelVersion: response.model,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          cost,
          durationMs,
          finishReason: response.stop_reason,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        metadata: {
          provider: 'anthropic',
          model,
          durationMs: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Make an HTTP request to the Anthropic API
   * @private
   */
  async _makeRequest(path, body) {
    return new Promise((resolve, reject) => {
      const postData = JSON.stringify(body);

      const options = {
        hostname: this.baseUrl,
        port: 443,
        path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': this.apiVersion,
          'Content-Length': Buffer.byteLength(postData),
        },
        timeout: this.timeout,
      };

      const req = https.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            
            if (res.statusCode >= 400) {
              reject(new Error(`Anthropic API error (${res.statusCode}): ${parsed.error?.message || data}`));
              return;
            }
            
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Failed to parse Anthropic response: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`Anthropic request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Anthropic request timed out'));
      });

      req.write(postData);
      req.end();
    });
  }

  /**
   * Calculate the cost of a request
   * @private
   */
  _calculateCost(model, inputTokens, outputTokens) {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['claude-sonnet-4-20250514'];
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return Math.round((inputCost + outputCost) * 10000) / 10000; // Round to 4 decimal places
  }

  /**
   * Get provider name
   */
  getName() {
    return 'anthropic';
  }

  /**
   * Check if API key is configured
   */
  isConfigured() {
    return !!this.apiKey;
  }
}

module.exports = AnthropicProvider;
module.exports.MODEL_PRICING = MODEL_PRICING;
module.exports.MODEL_METADATA = MODEL_METADATA;
