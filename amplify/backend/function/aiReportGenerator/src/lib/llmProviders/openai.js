/**
 * OpenAI Provider Implementation
 * Supports GPT-4o, GPT-4o-mini, GPT-4.1 family, and other OpenAI models
 * UPDATED: January 2025 - Added more models, updated pricing
 */

const https = require('https');

// Pricing per 1M tokens (as of January 2025)
const MODEL_PRICING = {
  // GPT-4o family
  'gpt-4o': { input: 2.50, output: 10.00, contextWindow: 128000, maxOutput: 16384 },
  'gpt-4o-mini': { input: 0.15, output: 0.60, contextWindow: 128000, maxOutput: 16384 },
  
  // GPT-4.1 family (latest, 1M context)
  'gpt-4.1': { input: 2.00, output: 8.00, contextWindow: 1000000, maxOutput: 32768 },
  'gpt-4.1-mini': { input: 0.40, output: 1.60, contextWindow: 1000000, maxOutput: 32768 },
  'gpt-4.1-nano': { input: 0.10, output: 0.40, contextWindow: 1000000, maxOutput: 32768 },
  
  // Legacy models (still available)
  'gpt-4-turbo': { input: 10.00, output: 30.00, contextWindow: 128000, maxOutput: 4096 },
  'gpt-4': { input: 30.00, output: 60.00, contextWindow: 8192, maxOutput: 4096 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50, contextWindow: 16385, maxOutput: 4096 },
  
  // Reasoning models (o-series) - higher cost but better for complex tasks
  'o3-mini': { input: 1.10, output: 4.40, contextWindow: 128000, maxOutput: 65536 },
  'o4-mini': { input: 1.10, output: 4.40, contextWindow: 128000, maxOutput: 65536 },
};

// Model metadata for UI display
const MODEL_METADATA = {
  'gpt-4o': {
    displayName: 'GPT-4o',
    description: 'Most capable, best quality',
    tier: 'premium',
    recommended: false,
  },
  'gpt-4o-mini': {
    displayName: 'GPT-4o Mini',
    description: 'Fast, cheap, good quality - RECOMMENDED',
    tier: 'standard',
    recommended: true,
  },
  'gpt-4.1': {
    displayName: 'GPT-4.1',
    description: 'Latest model, 1M context',
    tier: 'premium',
    recommended: false,
  },
  'gpt-4.1-mini': {
    displayName: 'GPT-4.1 Mini',
    description: 'New mini model, 1M context',
    tier: 'standard',
    recommended: false,
  },
  'gpt-4.1-nano': {
    displayName: 'GPT-4.1 Nano',
    description: 'Fastest, cheapest OpenAI option',
    tier: 'economy',
    recommended: false,
  },
  'o3-mini': {
    displayName: 'o3-mini (Reasoning)',
    description: 'Deep reasoning for complex analysis',
    tier: 'reasoning',
    recommended: false,
  },
  'o4-mini': {
    displayName: 'o4-mini (Reasoning)',
    description: 'Latest reasoning model',
    tier: 'reasoning',
    recommended: false,
  },
};

class OpenAIProvider {
  constructor(config = {}) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'api.openai.com';
    this.defaultModel = config.model || 'gpt-4o-mini'; // Changed default to mini
    this.timeout = config.timeout || 120000; // Increased timeout for reasoning models
  }

  /**
   * Get estimated cost for a request before making it
   * @param {string} model - Model name
   * @param {number} inputTokens - Estimated input tokens
   * @param {number} outputTokens - Expected output tokens
   * @returns {{ inputCost: number, outputCost: number, totalCost: number }}
   */
  static estimateCost(model, inputTokens, outputTokens = 4096) {
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini'];
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
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini'];
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
    return Object.entries(MODEL_PRICING).map(([id, pricing]) => ({
      id,
      ...pricing,
      ...(MODEL_METADATA[id] || { displayName: id, description: '', tier: 'standard', recommended: false }),
    }));
  }

  /**
   * Generate a director report from a metrics pack
   * @param {object} params
   * @param {string} params.systemPrompt - System instructions
   * @param {string} params.userPrompt - User message with metrics data
   * @param {string} params.model - Model to use (default: gpt-4o-mini)
   * @param {number} params.maxTokens - Max output tokens (default: 4096)
   * @param {number} params.temperature - Temperature (default: 0.3)
   * @param {object} params.responseFormat - JSON schema for structured output
   * @returns {Promise<object>} Generated report with metadata
   */
  async generateReport(params) {
    const {
      systemPrompt,
      userPrompt,
      model = this.defaultModel,
      maxTokens = 4096,
      temperature = 0.3,
      responseFormat = null,
    } = params;

    const startTime = Date.now();

    const requestBody = {
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature,
    };

    // Add response format for structured output if provided
    // Note: reasoning models (o-series) don't support response_format
    const isReasoningModel = model.startsWith('o3') || model.startsWith('o4') || model.startsWith('o1');
    if (!isReasoningModel) {
      if (responseFormat) {
        requestBody.response_format = {
          type: 'json_schema',
          json_schema: responseFormat,
        };
      } else {
        // Default to JSON mode
        requestBody.response_format = { type: 'json_object' };
      }
    }

    try {
      const response = await this._makeRequest('/v1/chat/completions', requestBody);
      
      const endTime = Date.now();
      const durationMs = endTime - startTime;

      // Parse the response
      const content = response.choices[0]?.message?.content;
      let parsedContent;
      
      try {
        // Try to extract JSON from reasoning model responses (may have thinking text)
        let jsonContent = content;
        if (isReasoningModel) {
          const jsonMatch = content.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            jsonContent = jsonMatch[0];
          }
        }
        parsedContent = JSON.parse(jsonContent);
      } catch (parseError) {
        console.error('Failed to parse OpenAI response as JSON:', content);
        throw new Error(`Failed to parse response as JSON: ${parseError.message}`);
      }

      // Calculate costs
      const inputTokens = response.usage?.prompt_tokens || 0;
      const outputTokens = response.usage?.completion_tokens || 0;
      const cost = this._calculateCost(model, inputTokens, outputTokens);

      return {
        success: true,
        content: parsedContent,
        rawContent: content,
        metadata: {
          provider: 'openai',
          model,
          modelVersion: response.model,
          inputTokens,
          outputTokens,
          totalTokens: inputTokens + outputTokens,
          cost,
          durationMs,
          finishReason: response.choices[0]?.finish_reason,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        metadata: {
          provider: 'openai',
          model,
          durationMs: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Make an HTTP request to the OpenAI API
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
          'Authorization': `Bearer ${this.apiKey}`,
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
              reject(new Error(`OpenAI API error (${res.statusCode}): ${parsed.error?.message || data}`));
              return;
            }
            
            resolve(parsed);
          } catch (e) {
            reject(new Error(`Failed to parse OpenAI response: ${data}`));
          }
        });
      });

      req.on('error', (error) => {
        reject(new Error(`OpenAI request failed: ${error.message}`));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('OpenAI request timed out'));
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
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o-mini'];
    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    return Math.round((inputCost + outputCost) * 10000) / 10000; // Round to 4 decimal places
  }

  /**
   * Get provider name
   */
  getName() {
    return 'openai';
  }

  /**
   * Check if API key is configured
   */
  isConfigured() {
    return !!this.apiKey;
  }
}

module.exports = OpenAIProvider;
module.exports.MODEL_PRICING = MODEL_PRICING;
module.exports.MODEL_METADATA = MODEL_METADATA;
