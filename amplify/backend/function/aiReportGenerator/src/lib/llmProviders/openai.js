/**
 * OpenAI Provider Implementation
 * Supports GPT-4o, GPT-4-turbo, and other OpenAI models
 */

const https = require('https');

// Pricing per 1M tokens (as of Jan 2026)
const MODEL_PRICING = {
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-4': { input: 30.00, output: 60.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
};

class OpenAIProvider {
  constructor(config = {}) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl || 'api.openai.com';
    this.defaultModel = config.model || 'gpt-4o';
    this.timeout = config.timeout || 60000;
  }

  /**
   * Generate a director report from a metrics pack
   * @param {object} params
   * @param {string} params.systemPrompt - System instructions
   * @param {string} params.userPrompt - User message with metrics data
   * @param {string} params.model - Model to use (default: gpt-4o)
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
    if (responseFormat) {
      requestBody.response_format = {
        type: 'json_schema',
        json_schema: responseFormat,
      };
    } else {
      // Default to JSON mode
      requestBody.response_format = { type: 'json_object' };
    }

    try {
      const response = await this._makeRequest('/v1/chat/completions', requestBody);
      
      const endTime = Date.now();
      const durationMs = endTime - startTime;

      // Parse the response
      const content = response.choices[0]?.message?.content;
      let parsedContent;
      
      try {
        parsedContent = JSON.parse(content);
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
    const pricing = MODEL_PRICING[model] || MODEL_PRICING['gpt-4o'];
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
