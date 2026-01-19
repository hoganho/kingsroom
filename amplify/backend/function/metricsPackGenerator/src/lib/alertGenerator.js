/**
 * Alert Generator (Improved)
 * ==========================
 * Generates alerts based on thresholds from snapshots and venue data.
 * 
 * IMPORTANT: This expects snapshots to have venueName and gameName already
 * resolved by nameResolver. Alert titles will show real names.
 */

const { DEFAULT_THRESHOLDS } = require('./thresholds');

function generateAlerts(snapshots, venues, thresholds = DEFAULT_THRESHOLDS) {
  const alerts = [];
  const now = new Date().toISOString();
  
  // === LOSS-MAKING GAMES ===
  const lossGames = snapshots.filter(s => (s.netProfit || 0) < thresholds.lossThreshold);
  for (const game of lossGames) {
    const loss = Math.abs(game.netProfit || 0);
    const severity = loss > 1000 ? 'HIGH' : (loss > 500 ? 'MEDIUM' : 'LOW');
    
    // Use enriched gameName - no more "Unknown" fallback
    const gameName = game.gameName || game.gameTitle || `Game on ${formatDate(game.gameStartDateTime)}`;
    
    alerts.push({
      id: `loss_game_${game.gameId || game.id}`,
      type: 'LOSS_MAKING_GAME',
      severity,
      entityId: game.entityId,
      venueId: game.venueId,
      venueName: game.venueName,  // Added venue name for context
      gameId: game.gameId || game.id,
      gameName,
      recurringGameId: game.recurringGameId,
      metric: 'netProfit',
      currentValue: game.netProfit || 0,
      threshold: thresholds.lossThreshold,
      title: `Loss-Making Game: ${gameName}`,
      description: `Game at ${game.venueName || 'venue'} generated a loss of $${loss.toFixed(0)}`,
      evidence: `Revenue: $${(game.totalRevenue || 0).toFixed(0)}, Cost: $${(game.totalCost || 0).toFixed(0)}, Entries: ${game.totalEntries || 0}`,
      recommendation: loss > 500 
        ? 'Review guarantee levels and staffing costs for this game type.'
        : 'Monitor this game - consider adjustments if losses continue.',
      priority: loss > 1000 ? 10 : (loss > 500 ? 8 : 6),
      gameDate: game.gameStartDateTime,
      createdAt: now
    });
  }
  
  // === LOW GUARANTEE COVERAGE ===
  const lowCoverageGames = snapshots.filter(s => 
    (s.guaranteeAmount || 0) > 0 && 
    (s.guaranteeCoverageRate || 0) < thresholds.guaranteeCoverageThreshold
  );
  for (const game of lowCoverageGames) {
    const coverageRate = game.guaranteeCoverageRate || 0;
    const severity = coverageRate < 50 ? 'HIGH' : 'MEDIUM';
    const gameName = game.gameName || game.gameTitle || `Game on ${formatDate(game.gameStartDateTime)}`;
    
    alerts.push({
      id: `low_coverage_${game.gameId || game.id}`,
      type: 'LOW_GUARANTEE_COVERAGE',
      severity,
      entityId: game.entityId,
      venueId: game.venueId,
      venueName: game.venueName,
      gameId: game.gameId || game.id,
      gameName,
      recurringGameId: game.recurringGameId,
      metric: 'guaranteeCoverageRate',
      currentValue: coverageRate,
      threshold: thresholds.guaranteeCoverageThreshold,
      title: `Guarantee Risk: ${gameName}`,
      description: `${game.venueName || 'Venue'} - Coverage at ${coverageRate.toFixed(1)}%`,
      evidence: `${game.totalEntries || 0} entries vs $${(game.guaranteeAmount || 0).toFixed(0)} guarantee`,
      recommendation: coverageRate < 50 
        ? 'Consider reducing guarantee or significantly increasing marketing for this game.'
        : 'Monitor closely - consider marketing push or guarantee adjustment.',
      priority: coverageRate < 50 ? 9 : 7,
      gameDate: game.gameStartDateTime,
      createdAt: now
    });
  }
  
  // === HIGH OVERLAY ===
  const highOverlayGames = snapshots.filter(s => 
    (s.totalGuaranteeOverlayCost || 0) > thresholds.highOverlayThreshold
  );
  for (const game of highOverlayGames) {
    const overlay = game.totalGuaranteeOverlayCost || 0;
    const gameName = game.gameName || game.gameTitle || `Game on ${formatDate(game.gameStartDateTime)}`;
    
    alerts.push({
      id: `high_overlay_${game.gameId || game.id}`,
      type: 'HIGH_OVERLAY',
      severity: overlay > 1000 ? 'HIGH' : 'MEDIUM',
      entityId: game.entityId,
      venueId: game.venueId,
      venueName: game.venueName,
      gameId: game.gameId || game.id,
      gameName,
      recurringGameId: game.recurringGameId,
      metric: 'totalGuaranteeOverlayCost',
      currentValue: overlay,
      threshold: thresholds.highOverlayThreshold,
      title: `High Overlay: ${gameName}`,
      description: `${game.venueName || 'Venue'} - Overlay cost of $${overlay.toFixed(0)}`,
      evidence: `Guarantee: $${(game.guaranteeAmount || 0).toFixed(0)}, Entries: ${game.totalEntries || 0}`,
      recommendation: 'Review guarantee levels for this game type. Consider reducing guarantee or boosting promotion.',
      priority: overlay > 1000 ? 8 : 6,
      gameDate: game.gameStartDateTime,
      createdAt: now
    });
  }
  
  // === LOSS-MAKING VENUES ===
  const lossVenues = venues.filter(v => (v.totalProfit || 0) < thresholds.lossThreshold);
  for (const venue of lossVenues) {
    const loss = Math.abs(venue.totalProfit || 0);
    
    alerts.push({
      id: `loss_venue_${venue.venueId}`,
      type: 'LOSS_MAKING_VENUE',
      severity: loss > 2000 ? 'HIGH' : 'MEDIUM',
      entityId: venue.entityId,
      venueId: venue.venueId,
      venueName: venue.venueName,  // Now properly resolved
      metric: 'totalProfit',
      currentValue: venue.totalProfit || 0,
      threshold: thresholds.lossThreshold,
      title: `Loss-Making Venue: ${venue.venueName}`,
      description: `Venue generated a net loss of $${loss.toFixed(0)} across ${venue.totalGames || 0} games`,
      evidence: `Revenue: $${(venue.totalRevenue || 0).toFixed(0)}, Cost: $${(venue.totalCost || 0).toFixed(0)}`,
      recommendation: 'Conduct comprehensive venue performance review. Evaluate game mix, guarantees, and staffing costs.',
      priority: loss > 2000 ? 10 : 7,
      createdAt: now
    });
  }
  
  // === NEGATIVE TREND (AT RISK) ===
  const negativeTrendVenues = venues.filter(v => 
    v.profitTrendPercent != null && v.profitTrendPercent < thresholds.negativeTrendPercent
  );
  for (const venue of negativeTrendVenues) {
    alerts.push({
      id: `negative_trend_${venue.venueId}`,
      type: 'NEGATIVE_TREND',
      severity: 'HIGH',
      entityId: venue.entityId,
      venueId: venue.venueId,
      venueName: venue.venueName,
      metric: 'profitTrend',
      currentValue: venue.profitTrendPercent,
      priorValue: venue.priorPeriodProfit,
      threshold: thresholds.negativeTrendPercent,
      title: `At-Risk Venue: ${venue.venueName}`,
      description: `Showing ${venue.profitTrendPercent.toFixed(1)}% profit decline vs prior period`,
      evidence: `Current: $${(venue.totalProfit || 0).toFixed(0)}, Prior: $${(venue.priorPeriodProfit || 0).toFixed(0)}`,
      recommendation: 'Immediate venue review required. Identify causes of decline and implement corrective actions.',
      priority: 9,
      createdAt: now
    });
  }
  
  // === SOFTENING TREND ===
  const softeningVenues = venues.filter(v => 
    v.profitTrendPercent != null && 
    v.profitTrendPercent < thresholds.softeningTrendPercent &&
    v.profitTrendPercent >= thresholds.negativeTrendPercent
  );
  for (const venue of softeningVenues) {
    alerts.push({
      id: `softening_trend_${venue.venueId}`,
      type: 'SOFTENING_TREND',
      severity: 'MEDIUM',
      entityId: venue.entityId,
      venueId: venue.venueId,
      venueName: venue.venueName,
      metric: 'profitTrend',
      currentValue: venue.profitTrendPercent,
      threshold: thresholds.softeningTrendPercent,
      title: `Softening Venue: ${venue.venueName}`,
      description: `Performance declining ${Math.abs(venue.profitTrendPercent).toFixed(1)}% vs prior period`,
      evidence: `Current: $${(venue.totalProfit || 0).toFixed(0)}, Prior: $${(venue.priorPeriodProfit || 0).toFixed(0)}`,
      recommendation: 'Monitor closely and consider proactive measures to reverse trend.',
      priority: 6,
      createdAt: now
    });
  }
  
  // === LOW MARGIN ===
  const lowMarginVenues = venues.filter(v => 
    (v.profitMargin || 0) < thresholds.lowMarginThreshold && (v.profitMargin || 0) >= 0
  );
  for (const venue of lowMarginVenues) {
    alerts.push({
      id: `low_margin_${venue.venueId}`,
      type: 'LOW_MARGIN',
      severity: venue.profitMargin < 10 ? 'HIGH' : 'MEDIUM',
      entityId: venue.entityId,
      venueId: venue.venueId,
      venueName: venue.venueName,
      metric: 'profitMargin',
      currentValue: venue.profitMargin || 0,
      threshold: thresholds.lowMarginThreshold,
      title: `Low Margin: ${venue.venueName}`,
      description: `Profit margin at ${(venue.profitMargin || 0).toFixed(1)}%`,
      evidence: `Revenue: $${(venue.totalRevenue || 0).toFixed(0)}, Profit: $${(venue.totalProfit || 0).toFixed(0)}`,
      recommendation: 'Review cost structure and pricing. Consider reducing expenses or adjusting rake/fees.',
      priority: venue.profitMargin < 10 ? 7 : 5,
      createdAt: now
    });
  }
  
  // Sort by priority (highest first), then by severity
  return alerts.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    const severityOrder = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1 };
    return severityOrder[b.severity] - severityOrder[a.severity];
  });
}

/**
 * Format date for display
 */
function formatDate(dateStr) {
  if (!dateStr) return 'Unknown Date';
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-AU', { 
    weekday: 'short', 
    day: 'numeric', 
    month: 'short' 
  });
}

/**
 * Generate a summary of alerts by type and severity
 */
function generateAlertSummary(alerts) {
  const summary = {
    total: alerts.length,
    bySeverity: { HIGH: 0, MEDIUM: 0, LOW: 0 },
    byType: {},
    topPriority: alerts.slice(0, 5).map(a => ({
      id: a.id,
      type: a.type,
      severity: a.severity,
      title: a.title,
      venueName: a.venueName,
      gameName: a.gameName
    }))
  };
  
  for (const alert of alerts) {
    summary.bySeverity[alert.severity] = (summary.bySeverity[alert.severity] || 0) + 1;
    summary.byType[alert.type] = (summary.byType[alert.type] || 0) + 1;
  }
  
  return summary;
}

module.exports = {
  generateAlerts,
  generateAlertSummary
};
