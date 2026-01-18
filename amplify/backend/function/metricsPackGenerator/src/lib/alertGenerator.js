/**
 * Alert Generator
 * ===============
 * Generates alerts based on thresholds from snapshots and venue data.
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
    
    alerts.push({
      id: `loss_game_${game.gameId || game.id}`,
      type: 'LOSS_MAKING_GAME',
      severity,
      entityId: game.entityId,
      venueId: game.venueId,
      gameId: game.gameId || game.id,
      gameName: game.gameName || game.gameTitle,
      metric: 'netProfit',
      currentValue: game.netProfit || 0,
      threshold: thresholds.lossThreshold,
      title: `Loss-Making Game: ${game.gameName || game.gameTitle || 'Unknown'}`,
      description: `Game generated a loss of $${loss.toFixed(0)}`,
      evidence: `Revenue: $${(game.totalRevenue || 0).toFixed(0)}, Cost: $${(game.totalCost || 0).toFixed(0)}, Entries: ${game.totalEntries || 0}`,
      recommendation: 'Review pricing structure, staffing costs, and guarantee levels.',
      priority: loss > 1000 ? 10 : (loss > 500 ? 8 : 6),
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
    
    alerts.push({
      id: `low_coverage_${game.gameId || game.id}`,
      type: 'LOW_GUARANTEE_COVERAGE',
      severity,
      entityId: game.entityId,
      venueId: game.venueId,
      gameId: game.gameId || game.id,
      gameName: game.gameName || game.gameTitle,
      metric: 'guaranteeCoverageRate',
      currentValue: coverageRate,
      threshold: thresholds.guaranteeCoverageThreshold,
      title: `Guarantee Risk: ${game.gameName || game.gameTitle || 'Unknown'}`,
      description: `Guarantee coverage at ${coverageRate.toFixed(1)}%`,
      evidence: `${game.totalEntries || 0} entries vs $${(game.guaranteeAmount || 0).toFixed(0)} guarantee`,
      recommendation: 'Consider reducing guarantee or increasing marketing.',
      priority: coverageRate < 50 ? 9 : 7,
      createdAt: now
    });
  }
  
  // === HIGH OVERLAY ===
  const highOverlayGames = snapshots.filter(s => 
    (s.totalGuaranteeOverlayCost || 0) > thresholds.highOverlayThreshold
  );
  for (const game of highOverlayGames) {
    const overlay = game.totalGuaranteeOverlayCost || 0;
    
    alerts.push({
      id: `high_overlay_${game.gameId || game.id}`,
      type: 'HIGH_OVERLAY',
      severity: overlay > 1000 ? 'HIGH' : 'MEDIUM',
      entityId: game.entityId,
      venueId: game.venueId,
      gameId: game.gameId || game.id,
      gameName: game.gameName || game.gameTitle,
      metric: 'totalGuaranteeOverlayCost',
      currentValue: overlay,
      threshold: thresholds.highOverlayThreshold,
      title: `High Overlay: ${game.gameName || game.gameTitle || 'Unknown'}`,
      description: `Overlay cost of $${overlay.toFixed(0)}`,
      evidence: `Guarantee: $${(game.guaranteeAmount || 0).toFixed(0)}, Entries: ${game.totalEntries || 0}`,
      recommendation: 'Review guarantee levels for this game type.',
      priority: overlay > 1000 ? 8 : 6,
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
      venueName: venue.venueName,
      metric: 'totalProfit',
      currentValue: venue.totalProfit || 0,
      threshold: thresholds.lossThreshold,
      title: `Loss-Making Venue: ${venue.venueName}`,
      description: `Venue generated a net loss of $${loss.toFixed(0)}`,
      evidence: `Revenue: $${(venue.totalRevenue || 0).toFixed(0)}, Games: ${venue.totalGames || 0}`,
      recommendation: 'Conduct venue performance review.',
      priority: loss > 2000 ? 10 : 7,
      createdAt: now
    });
  }
  
  // === NEGATIVE TREND ===
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
      description: `Showing ${venue.profitTrendPercent.toFixed(1)}% profit decline`,
      evidence: `Current: $${(venue.totalProfit || 0).toFixed(0)}, Prior: $${(venue.priorPeriodProfit || 0).toFixed(0)}`,
      recommendation: 'Immediate venue review required.',
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
      description: `Performance declining ${Math.abs(venue.profitTrendPercent).toFixed(1)}%`,
      evidence: `Current: $${(venue.totalProfit || 0).toFixed(0)}, Prior: $${(venue.priorPeriodProfit || 0).toFixed(0)}`,
      recommendation: 'Monitor closely and consider proactive measures.',
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
      recommendation: 'Review cost structure and pricing.',
      priority: venue.profitMargin < 10 ? 7 : 5,
      createdAt: now
    });
  }
  
  // Sort by priority (highest first)
  return alerts.sort((a, b) => b.priority - a.priority);
}

module.exports = {
  generateAlerts
};
