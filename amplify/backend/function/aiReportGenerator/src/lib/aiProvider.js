/**
 * AI Provider Module
 * ==================
 * Abstracts AI model calls to support multiple providers:
 * - AWS Bedrock (Claude) - recommended for AWS-native deployments
 * - Direct Anthropic API - alternative option
 */

const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

// Initialize clients
const bedrockClient = new BedrockRuntimeClient({ region: process.env.REGION || 'ap-southeast-2' });
const secretsClient = new SecretsManagerClient({ region: process.env.REGION || 'ap-southeast-2' });

// Model configuration
const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || 'anthropic.claude-3-5-sonnet-20241022-v2:0';
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

// Pricing (per 1M tokens) - update as needed
const PRICING = {
  'anthropic.claude-3-5-sonnet-20241022-v2:0': { input: 3.00, output: 15.00 },
  'anthropic.claude-3-sonnet-20240229-v1:0': { input: 3.00, output: 15.00 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 }
};

/**
 * Generate report using AWS Bedrock (Claude)
 */
async function generateWithBedrock(systemPrompt, userPrompt) {
  console.log('Calling Bedrock with model:', BEDROCK_MODEL_ID);
  
  const requestBody = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 8000,
    temperature: 0.3,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt
      }
    ]
  };
  
  try {
    const command = new InvokeModelCommand({
      modelId: BEDROCK_MODEL_ID,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(requestBody)
    });
    
    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    
    console.log('Bedrock response:', {
      stopReason: responseBody.stop_reason,
      inputTokens: responseBody.usage?.input_tokens,
      outputTokens: responseBody.usage?.output_tokens
    });
    
    // Extract content
    const content = responseBody.content?.[0]?.text || '';
    
    // Calculate cost
    const pricing = PRICING[BEDROCK_MODEL_ID] || { input: 3.00, output: 15.00 };
    const inputTokens = responseBody.usage?.input_tokens || 0;
    const outputTokens = responseBody.usage?.output_tokens || 0;
    const cost = (inputTokens * pricing.input / 1_000_000) + (outputTokens * pricing.output / 1_000_000);
    
    return {
      content,
      inputTokens,
      outputTokens,
      cost,
      modelName: BEDROCK_MODEL_ID,
      modelVersion: responseBody.model || BEDROCK_MODEL_ID,
      stopReason: responseBody.stop_reason
    };
    
  } catch (error) {
    console.error('Bedrock error:', error);
    throw new Error(`Bedrock API error: ${error.message}`);
  }
}

/**
 * Generate report using direct Anthropic API
 */
async function generateWithAnthropic(systemPrompt, userPrompt) {
  console.log('Calling Anthropic API with model:', ANTHROPIC_MODEL);
  
  // Get API key from Secrets Manager
  const apiKey = await getAnthropicApiKey();
  
  const requestBody = {
    model: ANTHROPIC_MODEL,
    max_tokens: 8000,
    temperature: 0.3,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt
      }
    ]
  };
  
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(requestBody)
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Anthropic API error: ${response.status} - ${errorText}`);
    }
    
    const responseBody = await response.json();
    
    console.log('Anthropic response:', {
      stopReason: responseBody.stop_reason,
      inputTokens: responseBody.usage?.input_tokens,
      outputTokens: responseBody.usage?.output_tokens
    });
    
    // Extract content
    const content = responseBody.content?.[0]?.text || '';
    
    // Calculate cost
    const pricing = PRICING[ANTHROPIC_MODEL] || { input: 3.00, output: 15.00 };
    const inputTokens = responseBody.usage?.input_tokens || 0;
    const outputTokens = responseBody.usage?.output_tokens || 0;
    const cost = (inputTokens * pricing.input / 1_000_000) + (outputTokens * pricing.output / 1_000_000);
    
    return {
      content,
      inputTokens,
      outputTokens,
      cost,
      modelName: ANTHROPIC_MODEL,
      modelVersion: responseBody.model || ANTHROPIC_MODEL,
      stopReason: responseBody.stop_reason
    };
    
  } catch (error) {
    console.error('Anthropic API error:', error);
    throw new Error(`Anthropic API error: ${error.message}`);
  }
}

/**
 * Get Anthropic API key from Secrets Manager
 */
let cachedApiKey = null;

async function getAnthropicApiKey() {
  if (cachedApiKey) {
    return cachedApiKey;
  }
  
  const secretName = process.env.ANTHROPIC_API_KEY_SECRET || 'anthropic-api-key';
  
  try {
    const command = new GetSecretValueCommand({ SecretId: secretName });
    const response = await secretsClient.send(command);
    
    if (response.SecretString) {
      // Could be plain string or JSON
      try {
        const parsed = JSON.parse(response.SecretString);
        cachedApiKey = parsed.apiKey || parsed.api_key || parsed.ANTHROPIC_API_KEY || response.SecretString;
      } catch {
        cachedApiKey = response.SecretString;
      }
      return cachedApiKey;
    }
    
    throw new Error('No secret string found');
  } catch (error) {
    console.error('Error getting Anthropic API key:', error);
    
    // Fallback to environment variable (not recommended for production)
    if (process.env.ANTHROPIC_API_KEY) {
      console.warn('Using ANTHROPIC_API_KEY from environment variable');
      return process.env.ANTHROPIC_API_KEY;
    }
    
    throw new Error(`Failed to retrieve Anthropic API key: ${error.message}`);
  }
}

module.exports = {
  generateWithBedrock,
  generateWithAnthropic
};
