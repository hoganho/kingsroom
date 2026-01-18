/**
 * Prompt Template System
 * Builds prompts for different report types
 */

const weeklyOpsPrompt = require('./weeklyOps');
const monthlyBoardPrompt = require('./monthlyBoard');
const seriesPrompts = require('./seriesReports');

// Registry of prompt builders
const promptBuilders = {
  WEEKLY_OPS: weeklyOpsPrompt,
  MONTHLY_BOARD: monthlyBoardPrompt,
  SERIES_PRE: seriesPrompts.seriesPre,
  SERIES_MID: seriesPrompts.seriesMid,
  SERIES_POST: seriesPrompts.seriesPost,
};

// Current prompt version - increment when making significant changes
const PROMPT_VERSION = '1.0.0';

/**
 * Build prompts for a given report type
 * @param {string} reportType - WEEKLY_OPS, MONTHLY_BOARD, etc.
 * @param {object} metricsPack - The MetricsPack data
 * @param {object} options - Additional options
 * @returns {{ systemPrompt: string, userPrompt: string, promptVersion: string }}
 */
function buildPrompts(reportType, metricsPack, options = {}) {
  const builder = promptBuilders[reportType];
  
  if (!builder) {
    throw new Error(`Unknown report type: ${reportType}. Supported: ${Object.keys(promptBuilders).join(', ')}`);
  }
  
  const { systemPrompt, userPrompt } = builder.build(metricsPack, options);
  
  return {
    systemPrompt,
    userPrompt,
    promptVersion: `${PROMPT_VERSION}-${reportType}`,
  };
}

/**
 * Get the JSON schema for structured output
 * @param {string} reportType 
 * @returns {object} JSON schema
 */
function getResponseSchema(reportType) {
  const builder = promptBuilders[reportType];
  return builder?.getSchema ? builder.getSchema() : null;
}

/**
 * List available report types
 * @returns {string[]}
 */
function listReportTypes() {
  return Object.keys(promptBuilders);
}

/**
 * Get current prompt version
 * @returns {string}
 */
function getPromptVersion() {
  return PROMPT_VERSION;
}

module.exports = {
  buildPrompts,
  getResponseSchema,
  listReportTypes,
  getPromptVersion,
};
