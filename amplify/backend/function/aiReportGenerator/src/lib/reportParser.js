/**
 * Report Parser Module
 * ====================
 * Parses and validates AI-generated report responses.
 */

/**
 * Parse and validate the AI response into a structured report
 */
function parseAndValidateReport(aiContent, packData) {
  console.log('Parsing AI response, length:', aiContent.length);
  
  // Try to extract JSON from the response
  let reportData;
  
  try {
    // First, try direct parsing
    reportData = JSON.parse(aiContent);
  } catch (e) {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = aiContent.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        reportData = JSON.parse(jsonMatch[1].trim());
      } catch (e2) {
        console.error('Failed to parse JSON from code block:', e2);
      }
    }
    
    // Try to find JSON object in the response
    if (!reportData) {
      const objectMatch = aiContent.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        try {
          reportData = JSON.parse(objectMatch[0]);
        } catch (e3) {
          console.error('Failed to parse extracted JSON:', e3);
        }
      }
    }
    
    if (!reportData) {
      throw new Error('Failed to parse AI response as JSON');
    }
  }
  
  // Validate required fields
  reportData = validateAndEnrichReport(reportData, packData);
  
  return reportData;
}

/**
 * Validate report structure and add missing fields with defaults
 */
function validateAndEnrichReport(reportData, packData) {
  // Ensure executiveSummary exists
  if (!reportData.executiveSummary) {
    reportData.executiveSummary = {
      headline: 'Report generated - please review data',
      keyHighlights: [],
      overallHealth: 'GOOD',
      profitStatement: 'See key metrics for details'
    };
  }
  
  // Validate overallHealth enum
  const validHealthValues = ['EXCELLENT', 'GOOD', 'NEEDS_ATTENTION', 'CRITICAL'];
  if (!validHealthValues.includes(reportData.executiveSummary.overallHealth)) {
    reportData.executiveSummary.overallHealth = 'GOOD';
  }
  
  // Ensure keyHighlights is an array
  if (!Array.isArray(reportData.executiveSummary.keyHighlights)) {
    reportData.executiveSummary.keyHighlights = [];
  }
  
  // Ensure keyMetrics exists with proper structure
  if (!reportData.keyMetrics) {
    reportData.keyMetrics = {};
  }
  
  // Enrich keyMetrics with pack data if not present
  const strategic = packData.strategic || {};
  const metricsDefaults = {
    totalRevenue: { value: strategic.totalRevenue || 0, trend: 'flat', change: 0, insight: '' },
    netProfit: { value: strategic.netProfit || 0, trend: 'flat', change: 0, insight: '' },
    profitMargin: { value: strategic.profitMargin || 0, trend: 'flat', change: 0, insight: '' },
    totalPlayers: { value: strategic.totalUniquePlayers || 0, trend: 'flat', change: 0, insight: '' },
    revenuePerPlayer: { value: strategic.revenuePerPlayer || 0, trend: 'flat', change: 0, insight: '' },
    gamesRun: { value: strategic.totalGamesRun || 0, trend: 'flat', change: 0, insight: '' },
    runRate: { value: strategic.runRate || 0, trend: 'flat', change: 0, insight: '' }
  };
  
  Object.keys(metricsDefaults).forEach(key => {
    if (!reportData.keyMetrics[key]) {
      reportData.keyMetrics[key] = metricsDefaults[key];
    }
    // Ensure proper structure
    if (typeof reportData.keyMetrics[key] !== 'object') {
      reportData.keyMetrics[key] = { value: reportData.keyMetrics[key], trend: 'flat', change: 0, insight: '' };
    }
  });
  
  // Ensure alerts is an array with proper structure
  if (!Array.isArray(reportData.alerts)) {
    reportData.alerts = [];
  }
  
  // Enrich alerts from pack data if empty
  if (reportData.alerts.length === 0 && packData.alerts?.length > 0) {
    reportData.alerts = packData.alerts.map((alert, index) => ({
      id: alert.id || `alert_${index + 1}`,
      severity: alert.severity || 'MEDIUM',
      type: alert.type || 'GENERAL',
      title: alert.title || 'Alert',
      description: alert.description || '',
      evidence: alert.metric ? `${alert.metric}: ${alert.value}` : '',
      recommendation: alert.recommendation || 'Review and take appropriate action',
      affectedVenue: alert.venueName || null,
      priority: alert.severity === 'HIGH' ? 8 : alert.severity === 'MEDIUM' ? 5 : 3
    }));
  }
  
  // Validate alert severities
  reportData.alerts = reportData.alerts.map(alert => ({
    ...alert,
    severity: ['HIGH', 'MEDIUM', 'LOW'].includes(alert.severity) ? alert.severity : 'MEDIUM',
    priority: typeof alert.priority === 'number' ? alert.priority : 5
  }));
  
  // Ensure opportunities is an array
  if (!Array.isArray(reportData.opportunities)) {
    reportData.opportunities = [];
  }
  
  // Ensure focusActions is an array
  if (!Array.isArray(reportData.focusActions)) {
    reportData.focusActions = [];
  }
  
  // Ensure focusActions have required fields
  reportData.focusActions = reportData.focusActions.map((action, index) => ({
    priority: action.priority || index + 1,
    action: action.action || 'Review report details',
    rationale: action.rationale || '',
    owner: action.owner || 'Operations Team',
    deadline: action.deadline || 'This week',
    expectedOutcome: action.expectedOutcome || ''
  }));
  
  // Ensure venueCallouts is an array
  if (!Array.isArray(reportData.venueCallouts)) {
    reportData.venueCallouts = [];
  }
  
  // Enrich venueCallouts from pack data if empty
  if (reportData.venueCallouts.length === 0 && packData.venues?.length > 0) {
    // Add top performer
    const sorted = [...packData.venues].sort((a, b) => 
      (b.metrics?.netProfit || 0) - (a.metrics?.netProfit || 0)
    );
    
    if (sorted.length > 0) {
      const top = sorted[0];
      reportData.venueCallouts.push({
        venueId: top.venueId,
        venueName: top.venueName,
        calloutType: 'TOP_PERFORMER',
        headline: `Top performer with $${(top.metrics?.netProfit || 0).toLocaleString()} profit`,
        details: `Leading venue this period`,
        metrics: {
          profit: top.metrics?.netProfit || 0,
          profitChange: top.metrics?.deltas?.netProfit || 0,
          trendCategory: top.trendCategory || 'STEADY'
        },
        recommendation: 'Analyze success factors for replication'
      });
    }
    
    // Add needs attention if any venue is AT_RISK or SOFTENING
    const atRisk = packData.venues.filter(v => 
      v.trendCategory === 'AT_RISK' || v.trendCategory === 'SOFTENING'
    );
    
    atRisk.forEach(venue => {
      reportData.venueCallouts.push({
        venueId: venue.venueId,
        venueName: venue.venueName,
        calloutType: 'NEEDS_ATTENTION',
        headline: `${venue.trendCategory === 'AT_RISK' ? 'At risk' : 'Softening'} - requires review`,
        details: `Trend category: ${venue.trendCategory}`,
        metrics: {
          profit: venue.metrics?.netProfit || 0,
          profitChange: venue.metrics?.deltas?.netProfit || 0,
          trendCategory: venue.trendCategory
        },
        recommendation: 'Investigate root causes and develop improvement plan'
      });
    });
  }
  
  // Validate venueCallout types
  const validCalloutTypes = ['TOP_PERFORMER', 'NEEDS_ATTENTION', 'TREND_CHANGE', 'MILESTONE'];
  reportData.venueCallouts = reportData.venueCallouts.map(callout => ({
    ...callout,
    calloutType: validCalloutTypes.includes(callout.calloutType) ? callout.calloutType : 'NEEDS_ATTENTION'
  }));
  
  // Ensure competitorInsights exists
  if (!reportData.competitorInsights) {
    reportData.competitorInsights = {
      marketPosition: 'Market position data not available',
      threatLevel: 'LOW',
      shareOfVoice: null,
      keyObservations: [],
      threats: [],
      recommendations: []
    };
  }
  
  // Validate threatLevel enum
  const validThreatLevels = ['LOW', 'MEDIUM', 'HIGH'];
  if (!validThreatLevels.includes(reportData.competitorInsights.threatLevel)) {
    reportData.competitorInsights.threatLevel = 'LOW';
  }
  
  // Ensure trendAnalysis exists
  if (!reportData.trendAnalysis) {
    reportData.trendAnalysis = {
      revenueDirection: 'STABLE',
      playerBaseHealth: 'STABLE',
      keyDrivers: [],
      riskFactors: [],
      outlook: 'See detailed metrics for trend analysis'
    };
  }
  
  // Validate trend directions
  const validDirections = ['GROWING', 'STABLE', 'DECLINING'];
  const validHealth = ['EXPANDING', 'STABLE', 'CONTRACTING'];
  
  if (!validDirections.includes(reportData.trendAnalysis.revenueDirection)) {
    reportData.trendAnalysis.revenueDirection = 'STABLE';
  }
  if (!validHealth.includes(reportData.trendAnalysis.playerBaseHealth)) {
    reportData.trendAnalysis.playerBaseHealth = 'STABLE';
  }
  
  // Add metadata
  reportData._metadata = {
    validatedAt: new Date().toISOString(),
    packDataSummary: {
      hasStrategic: !!packData.strategic,
      venueCount: packData.venues?.length || 0,
      alertCount: packData.alerts?.length || 0,
      hasRankings: !!packData.rankings,
      hasPlayerInsights: !!packData.playerInsights
    }
  };
  
  return reportData;
}

/**
 * Extract a clean number from various formats
 */
function extractNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[$,%\s]/g, '');
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

module.exports = {
  parseAndValidateReport,
  validateAndEnrichReport,
  extractNumber
};
