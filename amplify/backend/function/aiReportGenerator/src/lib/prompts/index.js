/**
 * Prompt Template System
 * Builds prompts for different report types
 * 
 * VERSION: 2.2.0 - Updated for MetricsPack v7 (Player Activity Trends)
 * 
 * Changes:
 * - v2.2.0: Added playerActivityTrends module support for WoW/MoM trending analysis
 *           - Targeting classification trends (week-on-week)
 *           - Account category trends (month-on-month)
 *           - VIP threshold changes
 * - v2.1.0: Added gamesNotRun module support for reporting on scheduled games that didn't complete
 * - v2.0.0: Enhanced module detection and graceful degradation
 * - Pre-flight pack validation
 * - Better error messages for missing data
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
const PROMPT_VERSION = '2.2.0';

/**
 * Build prompts for a given report type
 * @param {string} reportType - WEEKLY_OPS, MONTHLY_BOARD, etc.
 * @param {object} metricsPack - The MetricsPack data
 * @param {object} options - Additional options
 * @returns {{ systemPrompt: string, userPrompt: string, promptVersion: string, packValidation: object }}
 */
function buildPrompts(reportType, metricsPack, options = {}) {
  const builder = promptBuilders[reportType];
  
  if (!builder) {
    throw new Error(`Unknown report type: ${reportType}. Supported: ${Object.keys(promptBuilders).join(', ')}`);
  }
  
  // Pre-flight validation
  const packValidation = validateMetricsPack(metricsPack, reportType);
  
  if (!packValidation.canGenerate) {
    throw new Error(`Cannot generate ${reportType} report: ${packValidation.blockers.join(', ')}`);
  }
  
  // Parse packData if it's a string
  const processedPack = {
    ...metricsPack,
    packData: typeof metricsPack.packData === 'string' 
      ? JSON.parse(metricsPack.packData) 
      : metricsPack.packData,
  };
  
  // Note: We no longer use socialPulseData separately - competitorAnalysis contains
  // the rich extracted data from SocialPostGameData
  
  const { systemPrompt, userPrompt } = builder.build(processedPack, options);
  
  return {
    systemPrompt,
    userPrompt,
    promptVersion: `${PROMPT_VERSION}-${reportType}`,
    packValidation,
  };
}

/**
 * Validate MetricsPack has required data for report type
 * @param {object} metricsPack 
 * @param {string} reportType 
 * @returns {object} Validation result
 */
function validateMetricsPack(metricsPack, reportType) {
  const result = {
    canGenerate: true,
    blockers: [],
    warnings: [],
    enhancedModulesAvailable: [],
    enhancedModulesMissing: [],
    dataCompleteness: 0,
  };
  
  // Parse packData if needed
  const packData = typeof metricsPack.packData === 'string' 
    ? JSON.parse(metricsPack.packData) 
    : (metricsPack.packData || {});
  
  // Check core required data
  if (!packData.strategic) {
    result.blockers.push('Missing strategic KPIs');
    result.canGenerate = false;
  }
  
  if (!packData.venues || packData.venues.length === 0) {
    result.warnings.push('No venue data - report will have limited venue insights');
  }
  
  if (!packData.alerts) {
    result.warnings.push('No alerts data');
  }
  
  // Check enhanced modules
  const enhancedModules = [
    { name: 'scheduleCompliance', check: packData.scheduleCompliance?.hasScheduleData, requiredFor: ['WEEKLY_OPS', 'MONTHLY_BOARD'] },
    { name: 'recurringGameTrends', check: packData.recurringGameTrends?.hasRecurringGameData, requiredFor: ['WEEKLY_OPS', 'MONTHLY_BOARD'] },
    { name: 'competitorAnalysis', check: packData.competitorAnalysis?.hasCompetitorData, requiredFor: ['WEEKLY_OPS', 'MONTHLY_BOARD'] },
    { name: 'opportunities', check: packData.opportunities?.hasOpportunities, requiredFor: ['WEEKLY_OPS', 'MONTHLY_BOARD'] },
    { name: 'seriesLifecycle', check: packData.seriesLifecycle?.hasSeriesData, requiredFor: ['SERIES_PRE', 'SERIES_MID', 'SERIES_POST', 'MONTHLY_BOARD'] },
    { name: 'gamesNotRun', check: packData.gamesNotRun?.total > 0, requiredFor: ['WEEKLY_OPS', 'MONTHLY_BOARD'] },
    { name: 'playerActivityTrends', check: packData.playerActivityTrends?.weekly?.available || packData.playerActivityTrends?.monthly?.available, requiredFor: ['WEEKLY_OPS', 'MONTHLY_BOARD'] },
  ];
  
  for (const module of enhancedModules) {
    if (module.check) {
      result.enhancedModulesAvailable.push(module.name);
    } else {
      result.enhancedModulesMissing.push(module.name);
      
      // Add warning if this module is relevant for the report type
      if (module.requiredFor.includes(reportType)) {
        result.warnings.push(`${module.name} not available - related insights will be limited`);
      }
    }
  }
  
  // Player Activity Trends specific validation
  if (reportType === 'WEEKLY_OPS' && !packData.playerActivityTrends?.weekly?.available) {
    result.warnings.push('Week-on-week player activity trends not available - targeting classification deltas will be limited');
  }
  
  if (reportType === 'MONTHLY_BOARD' && !packData.playerActivityTrends?.monthly?.available) {
    result.warnings.push('Month-on-month player activity trends not available - account category deltas will be limited');
  }
  
  // Series-specific validation
  if (reportType === 'SERIES_MID' && !packData.seriesLifecycle?.active?.length) {
    result.warnings.push('No active series found - report may have limited progress data');
  }
  
  if (reportType === 'SERIES_POST' && !packData.seriesLifecycle?.recentlyCompleted?.length) {
    result.warnings.push('No recently completed series found - using period data as proxy');
  }
  
  // Calculate completeness
  const totalModules = enhancedModules.length;
  const availableModules = result.enhancedModulesAvailable.length;
  const coreDataScore = packData.strategic ? 50 : 0;
  const moduleScore = (availableModules / totalModules) * 50;
  result.dataCompleteness = Math.round(coreDataScore + moduleScore);
  
  return result;
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

/**
 * Get report type metadata
 * @param {string} reportType 
 * @returns {object}
 */
function getReportTypeInfo(reportType) {
  const info = {
    WEEKLY_OPS: {
      name: 'Weekly Operations Report',
      audience: 'Floor managers, operations team',
      frequency: 'Weekly',
      focusAreas: ['Tactical issues', 'Problem games', 'Overlay analysis', 'Games not run', 'Quick wins', 'Player activity trends'],
      requiredModules: ['strategic', 'venues', 'alerts'],
      enhancedModules: ['scheduleCompliance', 'recurringGameTrends', 'competitorAnalysis', 'opportunities', 'gamesNotRun', 'playerActivityTrends'],
    },
    MONTHLY_BOARD: {
      name: 'Monthly Board Report',
      audience: 'Executives, board members',
      frequency: 'Monthly',
      focusAreas: ['Strategic trends', 'Portfolio health', 'Competitive position', 'Operational execution', 'Growth opportunities', 'Player lifecycle trends'],
      requiredModules: ['strategic', 'venues', 'alerts'],
      enhancedModules: ['scheduleCompliance', 'recurringGameTrends', 'competitorAnalysis', 'opportunities', 'seriesLifecycle', 'gamesNotRun', 'playerActivityTrends'],
    },
    SERIES_PRE: {
      name: 'Pre-Series Preparation Report',
      audience: 'Tournament directors, operations',
      frequency: 'Per series',
      focusAreas: ['Readiness', 'Risk assessment', 'Competitive landscape', 'Marketing plan'],
      requiredModules: ['strategic', 'venues'],
      enhancedModules: ['seriesLifecycle', 'competitorAnalysis', 'recurringGameTrends'],
    },
    SERIES_MID: {
      name: 'Mid-Series Progress Report',
      audience: 'Tournament directors, operations',
      frequency: 'During series',
      focusAreas: ['Pace vs plan', 'Event performance', 'Adjustments needed'],
      requiredModules: ['strategic', 'venues'],
      enhancedModules: ['seriesLifecycle', 'competitorAnalysis'],
    },
    SERIES_POST: {
      name: 'Post-Series Retrospective Report',
      audience: 'All stakeholders',
      frequency: 'Per series',
      focusAreas: ['Results vs targets', 'Learnings', 'Recommendations'],
      requiredModules: ['strategic', 'venues', 'playerInsights'],
      enhancedModules: ['seriesLifecycle', 'competitorAnalysis'],
    },
  };
  
  return info[reportType] || null;
}

module.exports = {
  buildPrompts,
  getResponseSchema,
  listReportTypes,
  getPromptVersion,
  getReportTypeInfo,
  validateMetricsPack,
};