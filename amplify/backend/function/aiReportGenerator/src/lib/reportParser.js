/**
 * Report Parser Module
 * ====================
 * Parses and validates AI-generated report responses.
 * 
 * VERSION: 2.0.0 - Updated for MetricsPack v4
 * 
 * Changes:
 * - Fixed venue structure (totalProfit not metrics.netProfit)
 * - Added validation for enhanced modules
 * - Improved fallback enrichment from pack data
 */

/**
 * Parse and validate the AI response into a structured report
 */
function parseAndValidateReport(aiContent, packData, reportType = 'WEEKLY_OPS') {
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
  
  // Validate and enrich based on report type
  reportData = validateAndEnrichReport(reportData, packData, reportType);
  
  return reportData;
}

/**
 * Validate report structure and add missing fields with defaults
 */
function validateAndEnrichReport(reportData, packData, reportType) {
  const strategic = packData.strategic || {};
  const venues = packData.venues || [];
  const alerts = packData.alerts || [];
  
  // ============================================================
  // COMMON VALIDATION (All Report Types)
  // ============================================================
  
  // Ensure executiveSummary or weekSummary exists
  if (reportType === 'WEEKLY_OPS') {
    reportData = validateWeeklyOpsReport(reportData, packData);
  } else if (reportType === 'MONTHLY_BOARD') {
    reportData = validateMonthlyBoardReport(reportData, packData);
  } else if (reportType.startsWith('SERIES_')) {
    reportData = validateSeriesReport(reportData, packData, reportType);
  }
  
  // Add metadata
  reportData._metadata = {
    validatedAt: new Date().toISOString(),
    reportType,
    packDataSummary: {
      hasStrategic: !!packData.strategic,
      venueCount: venues.length,
      alertCount: alerts.length,
      hasRankings: !!packData.rankings,
      hasPlayerInsights: !!packData.playerInsights,
      hasScheduleCompliance: packData.scheduleCompliance?.hasScheduleData || false,
      hasRecurringGameTrends: packData.recurringGameTrends?.hasRecurringGameData || false,
      hasCompetitorAnalysis: packData.competitorAnalysis?.hasCompetitorData || false,
      hasOpportunities: packData.opportunities?.hasOpportunities || false,
      hasSeriesLifecycle: packData.seriesLifecycle?.hasSeriesData || false,
    },
    enrichedFields: [],
  };
  
  return reportData;
}

/**
 * Validate Weekly Ops Report structure
 */
function validateWeeklyOpsReport(reportData, packData) {
  const strategic = packData.strategic || {};
  const venues = packData.venues || [];
  const alerts = packData.alerts || [];
  
  // Ensure weekSummary exists
  if (!reportData.weekSummary) {
    reportData.weekSummary = {
      headline: 'Report generated - please review data',
      health: 'OK',
      healthRationale: 'Unable to assess - data validation required',
      topWin: 'See detailed metrics',
      topProblem: 'Review alerts section',
      vsLastWeek: 'Comparison requires prior period data',
    };
  }
  
  // Validate health enum
  const validHealthValues = ['EXCELLENT', 'GOOD', 'OK', 'CONCERNING', 'CRITICAL'];
  if (!validHealthValues.includes(reportData.weekSummary.health)) {
    reportData.weekSummary.health = 'OK';
  }
  
  // Ensure metrics exists with proper structure
  if (!reportData.metrics) {
    reportData.metrics = {};
  }
  
  const metricsDefaults = {
    revenue: { value: strategic.totalRevenue || 0, change: strategic.revenueGrowth || 0, changePercent: strategic.revenueGrowthPercent || 0, insight: '' },
    profit: { value: strategic.netProfit || 0, change: strategic.profitGrowth || 0, changePercent: strategic.profitGrowthPercent || 0, insight: '' },
    margin: { value: strategic.profitMargin || 0, change: strategic.marginChange || 0, insight: '' },
    entries: { value: strategic.totalEntries || 0, change: strategic.entriesGrowth || 0, changePercent: strategic.entriesGrowthPercent || 0, insight: '' },
    gamesRun: { value: strategic.totalGamesRun || 0, change: strategic.gamesGrowth || 0, insight: '' },
    avgEntriesPerGame: { value: strategic.avgEntriesPerGame || 0, insight: '' },
  };
  
  Object.keys(metricsDefaults).forEach(key => {
    if (!reportData.metrics[key]) {
      reportData.metrics[key] = metricsDefaults[key];
    }
  });
  
  // Ensure arrays exist
  if (!Array.isArray(reportData.problemGames)) {
    reportData.problemGames = [];
  }
  if (!Array.isArray(reportData.winningGames)) {
    reportData.winningGames = [];
  }
  if (!Array.isArray(reportData.alerts)) {
    reportData.alerts = [];
  }
  if (!Array.isArray(reportData.thisWeekActions)) {
    reportData.thisWeekActions = [];
  }
  
  // Enrich alerts from pack data if empty
  if (reportData.alerts.length === 0 && alerts.length > 0) {
    reportData.alerts = enrichAlertsFromPack(alerts);
  }
  
  // Ensure overlayReport exists
  if (!reportData.overlayReport) {
    reportData.overlayReport = {
      totalOverlayCost: strategic.overlayCost || 0,
      gamesWithOverlay: strategic.gamesWithOverlay || 0,
      avgCoverageRate: strategic.avgGuaranteeCoverageRate || 0,
      worstOverlays: [],
      recommendation: 'Review guarantee settings',
    };
  }
  
  // Ensure venueQuickView exists
  if (!Array.isArray(reportData.venueQuickView) || reportData.venueQuickView.length === 0) {
    reportData.venueQuickView = venues.map(v => ({
      venueName: v.venueName,
      profit: v.totalProfit || 0,
      games: v.totalGames || 0,
      avgProfitPerGame: v.avgProfitPerGame || 0,
      health: v.overallHealth || 'good',
      trend: v.trendCategory || 'STEADY',
      keyIssue: v.bottomGames?.[0]?.gameName || 'No specific issues identified',
      oneAction: 'Review venue performance details',
    }));
  }
  
  // Ensure scheduleHealth exists (from enhanced modules)
  if (!reportData.scheduleHealth) {
    const sc = packData.scheduleCompliance || {};
    reportData.scheduleHealth = {
      complianceRate: sc.summary?.complianceRate || null,
      cancellationRate: sc.summary?.cancellationRate || null,
      gamesCancelled: sc.summary?.cancelled || 0,
      cancellationReasons: [],
      atRiskGames: sc.atRiskRecurringGames?.slice(0, 3).map(g => ({
        gameName: g.name || g.gameName,
        cancellationRate: g.cancellationRate,
        recommendation: g.recommendation || 'Review game viability',
      })) || [],
      recommendation: sc.hasScheduleData ? 'Monitor at-risk games' : 'Enable schedule tracking for insights',
    };
  }
  
  // Ensure competitorWatch exists (from enhanced modules)
  if (!reportData.competitorWatch) {
    const ca = packData.competitorAnalysis || {};
    reportData.competitorWatch = {
      pressureLevel: ca.pressure?.level || 'UNKNOWN',
      pressureScore: ca.pressure?.score || 0,
      directClashes: ca.summary?.directCompetitionClashes || 0,
      impactedGames: ca.clashes?.high?.slice(0, 3).map(c => c.ourGameName) || [],
      competitorHighlights: ca.topCompetitors?.slice(0, 3).map(c => `${c.accountName}: ${c.postCount} posts`) || [],
      defensiveActions: [],
    };
  }
  
  // Ensure opportunities exists (from enhanced modules)
  if (!reportData.opportunities) {
    const opp = packData.opportunities || {};
    reportData.opportunities = {
      quickWins: opp.topOpportunities?.filter(o => o.priority === 'HIGH').slice(0, 3).map(o => ({
        opportunity: o.title,
        potentialImpact: o.potentialImpact,
        action: o.recommendation,
        deadline: 'This week',
      })) || [],
      scheduleGaps: opp.byType?.scheduleGaps?.slice(0, 3).map(g => g.title) || [],
      expansionCandidates: opp.byType?.expansionOpportunities?.slice(0, 3).map(e => e.title) || [],
    };
  }
  
  return reportData;
}

/**
 * Validate Monthly Board Report structure
 */
function validateMonthlyBoardReport(reportData, packData) {
  const strategic = packData.strategic || {};
  const venues = packData.venues || [];
  const alerts = packData.alerts || [];
  
  // Ensure executiveSummary exists
  if (!reportData.executiveSummary) {
    reportData.executiveSummary = {
      headline: 'Report generated - review required',
      overallHealth: 'STABLE',
      healthRationale: 'Unable to fully assess',
      profitStatement: `Net profit: $${(strategic.netProfit || 0).toLocaleString()}`,
      keyHighlights: [],
      keyRisks: [],
      trajectory: 'STABLE',
    };
  }
  
  // Validate overallHealth enum
  const validHealthValues = ['CRITICAL', 'NEEDS_ATTENTION', 'STABLE', 'GOOD', 'EXCELLENT'];
  if (!validHealthValues.includes(reportData.executiveSummary.overallHealth)) {
    reportData.executiveSummary.overallHealth = 'STABLE';
  }
  
  // Validate trajectory enum
  const validTrajectories = ['IMPROVING', 'STABLE', 'DECLINING'];
  if (!validTrajectories.includes(reportData.executiveSummary.trajectory)) {
    reportData.executiveSummary.trajectory = 'STABLE';
  }
  
  // Ensure financialPerformance exists
  if (!reportData.financialPerformance) {
    reportData.financialPerformance = {
      revenue: {
        actual: strategic.totalRevenue || 0,
        priorPeriod: (strategic.totalRevenue || 0) - (strategic.revenueGrowth || 0),
        change: strategic.revenueGrowth || 0,
        changePercent: strategic.revenueGrowthPercent || 0,
        drivers: [],
      },
      costs: {
        total: strategic.totalCost || 0,
        breakdown: {
          staff: strategic.staffCost || 0,
          venue: strategic.venueRentalCost || 0,
          marketing: strategic.marketingCost || 0,
          overlay: strategic.overlayCost || 0,
          other: strategic.otherCost || 0,
        },
        biggestDriver: 'See cost breakdown',
        costPerEntry: strategic.costPerEntry || 0,
      },
      profit: {
        actual: strategic.netProfit || 0,
        priorPeriod: (strategic.netProfit || 0) - (strategic.profitGrowth || 0),
        change: strategic.profitGrowth || 0,
        changePercent: strategic.profitGrowthPercent || 0,
        margin: strategic.profitMargin || 0,
        marginChange: strategic.marginChange || 0,
        analysis: '',
      },
    };
  }
  
  // Ensure guaranteeAnalysis exists
  if (!reportData.guaranteeAnalysis) {
    reportData.guaranteeAnalysis = {
      summary: 'Review guarantee performance',
      totalExposure: strategic.totalGuaranteeExposure || 0,
      totalOverlayCost: strategic.overlayCost || 0,
      overlayRate: strategic.gamesWithGuarantee > 0 
        ? (strategic.gamesWithOverlay / strategic.gamesWithGuarantee) * 100 
        : 0,
      avgCoverageRate: strategic.avgGuaranteeCoverageRate || 0,
      problemGuarantees: [],
      strategicRecommendation: 'Review games with consistent overlay',
    };
  }
  
  // Ensure venuePerformance is populated
  if (!Array.isArray(reportData.venuePerformance) || reportData.venuePerformance.length === 0) {
    // Use CORRECT structure - totalProfit not metrics.netProfit
    reportData.venuePerformance = venues.map(v => ({
      venueName: v.venueName,
      profit: v.totalProfit || 0,
      profitChange: v.profitTrendPercent || 0,
      profitChangePercent: v.profitTrendPercent || 0,
      margin: v.profitMargin || 0,
      games: v.totalGames || 0,
      health: mapHealthToEnum(v.overallHealth),
      trend: v.trendCategory || 'STEADY',
      keyDrivers: [],
      risks: [],
      recommendation: '',
    }));
  }
  
  // Ensure alerts array
  if (!Array.isArray(reportData.alerts)) {
    reportData.alerts = [];
  }
  if (reportData.alerts.length === 0 && alerts.length > 0) {
    reportData.alerts = enrichAlertsFromPack(alerts);
  }
  
  // Ensure strategicRecommendations array
  if (!Array.isArray(reportData.strategicRecommendations)) {
    reportData.strategicRecommendations = [];
  }
  
  // Ensure portfolioHealth exists (from recurringGameTrends)
  if (!reportData.portfolioHealth) {
    const rgt = packData.recurringGameTrends || {};
    reportData.portfolioHealth = {
      summary: rgt.hasRecurringGameData ? 'See recurring game analysis' : 'Recurring game tracking not enabled',
      healthDistribution: {
        excellent: rgt.summary?.excellent || 0,
        good: rgt.summary?.good || 0,
        needsAttention: rgt.summary?.needsAttention || 0,
        critical: rgt.summary?.critical || 0,
      },
      growthOpportunities: rgt.growingGames?.slice(0, 5).map(g => ({
        gameName: g.name,
        trend: `+${g.attendanceTrendPercent || 0}%`,
        brandStrength: g.brandStrength,
        recommendation: g.recommendation || 'Consider expansion',
      })) || [],
      interventionRequired: rgt.decliningGames?.slice(0, 5).map(g => ({
        gameName: g.name,
        trend: `${g.attendanceTrendPercent || 0}%`,
        issue: g.overallHealth,
        recommendation: g.recommendation || 'Investigate root cause',
      })) || [],
      portfolioActions: [],
    };
  }
  
  // Ensure competitivePosition exists
  if (!reportData.competitivePosition) {
    const ca = packData.competitorAnalysis || {};
    reportData.competitivePosition = {
      pressureLevel: ca.pressure?.level || 'UNKNOWN',
      pressureScore: ca.pressure?.score || 0,
      marketAssessment: ca.pressure?.description || 'Competitor data not available',
      activityTrend: ca.trends?.trend || 'UNKNOWN',
      directThreats: [],
      clashImpact: {
        directClashes: ca.summary?.directCompetitionClashes || 0,
        estimatedRevenueImpact: 'Not calculated',
        affectedGames: ca.clashes?.high?.slice(0, 5).map(c => c.ourGameName) || [],
      },
      strategicResponse: '',
    };
  }
  
  // Ensure outlook exists
  if (!reportData.outlook) {
    reportData.outlook = {
      trajectory: reportData.executiveSummary?.trajectory || 'STABLE',
      confidence: 'MEDIUM',
      nextPeriodFocus: 'Review strategic recommendations',
      keyRisksToMonitor: [],
      targetMetrics: {},
      catalysts: [],
    };
  }
  
  return reportData;
}

/**
 * Validate Series Report structure
 */
function validateSeriesReport(reportData, packData, reportType) {
  const seriesLifecycle = packData.seriesLifecycle || {};
  
  // Ensure seriesSummary or seriesOverview exists
  if (!reportData.seriesSummary && !reportData.seriesOverview) {
    if (reportType === 'SERIES_PRE') {
      reportData.seriesOverview = {
        seriesName: 'Series name required',
        venue: 'Venue TBD',
        dates: { start: 'TBD', end: 'TBD' },
        totalEvents: 0,
        flagshipEvent: 'TBD',
        totalGuarantees: 0,
        dataConfidence: 'LOW',
      };
    } else {
      reportData.seriesSummary = {
        seriesName: seriesLifecycle.active?.[0]?.seriesName || 'Series',
        overallVerdict: 'UNKNOWN',
        headlineResult: 'Review series data',
      };
    }
  }
  
  return reportData;
}

/**
 * Enrich alerts from pack data
 */
function enrichAlertsFromPack(packAlerts) {
  return packAlerts.slice(0, 15).map((alert, index) => ({
    severity: alert.severity || 'MEDIUM',
    type: alert.type || 'GENERAL',
    title: alert.title || 'Alert',
    description: alert.description || '',
    evidence: alert.evidence || (alert.metric ? `${alert.metric}: ${alert.currentValue}` : ''),
    financialImpact: alert.currentValue ? `$${alert.currentValue.toLocaleString()}` : null,
    recommendation: alert.recommendation || 'Review and take appropriate action',
    owner: alert.severity === 'HIGH' ? 'Management' : 'Operations',
    deadline: alert.severity === 'HIGH' ? 'Immediate' : 'This week',
    priority: alert.priority || (alert.severity === 'HIGH' ? 8 : alert.severity === 'MEDIUM' ? 5 : 3),
  }));
}

/**
 * Map health string to standardized enum
 */
function mapHealthToEnum(health) {
  const mapping = {
    'excellent': 'EXCELLENT',
    'good': 'GOOD',
    'needs-attention': 'NEEDS_ATTENTION',
    'critical': 'CRITICAL',
  };
  return mapping[health?.toLowerCase()] || 'GOOD';
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

/**
 * Validate that required pack data sections exist
 */
function validatePackData(packData) {
  const issues = [];
  
  if (!packData.strategic) {
    issues.push('Missing strategic KPIs');
  }
  
  if (!packData.venues || packData.venues.length === 0) {
    issues.push('No venue data');
  }
  
  if (!packData.alerts) {
    issues.push('No alerts data');
  }
  
  // Check enhanced modules
  const enhancedModules = {
    scheduleCompliance: packData.scheduleCompliance?.hasScheduleData,
    recurringGameTrends: packData.recurringGameTrends?.hasRecurringGameData,
    competitorAnalysis: packData.competitorAnalysis?.hasCompetitorData,
    opportunities: packData.opportunities?.hasOpportunities,
    seriesLifecycle: packData.seriesLifecycle?.hasSeriesData,
  };
  
  return {
    isValid: issues.length === 0,
    issues,
    enhancedModulesAvailable: enhancedModules,
    enhancedModuleCount: Object.values(enhancedModules).filter(Boolean).length,
  };
}

module.exports = {
  parseAndValidateReport,
  validateAndEnrichReport,
  validatePackData,
  extractNumber,
  mapHealthToEnum,
};
