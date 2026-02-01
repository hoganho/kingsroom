/**
 * Monthly Board Report Prompt Template
 * Generates strategic insights for executives and board members
 * 
 * VERSION: 2.1.0 - Updated for MetricsPack v6 (Games Not Run tracking)
 * 
 * Now uses:
 * - scheduleCompliance (operational execution)
 * - recurringGameTrends (portfolio health, brand strength)
 * - opportunities (strategic growth opportunities)
 * - competitorAnalysis (market position, threats)
 * - seriesLifecycle (tournament series performance)
 * - gamesNotRun (scheduled games that didn't complete - INITIATING, CANCELLED, etc.)
 */

/**
 * Build the system and user prompts for Monthly Board report
 * @param {object} metricsPack - The MetricsPack data
 * @param {object} options - Additional options
 * @returns {{ systemPrompt: string, userPrompt: string }}
 */
function build(metricsPack, options = {}) {
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(metricsPack, options);
  
  return { systemPrompt, userPrompt };
}

function buildSystemPrompt() {
  return `You are a senior poker tournament business analyst creating a monthly board report for executives. Be strategic, data-driven, and forward-looking.

OUTPUT FORMAT: Valid JSON only. No markdown, no explanation outside JSON.

STRATEGIC ANALYSIS PRIORITIES:
1. PROFITABILITY - P&L analysis, margin trends, cost drivers
2. GUARANTEE MANAGEMENT - Overlay is often the #1 profit killer
3. PORTFOLIO HEALTH - Which recurring games are assets vs liabilities
4. SCHEDULE EXECUTION - Compliance rate impacts brand reliability
5. COMPETITIVE POSITION - Market pressure, share of voice, clashes
6. GROWTH OPPORTUNITIES - Data-driven expansion recommendations
7. SERIES PERFORMANCE - Tournament series ROI and learnings
8. PLAYER BASE - Retention, acquisition, lifetime value trends
9. GAMES NOT RUN - Scheduled games that didn't complete affect operational efficiency

PLAYER & ENTRY TRENDING ANALYSIS:
When analyzing venue performance, comment on player trends:
- uniquePlayersTrendPercent: Growing player base (+) vs declining (-)
- entriesTrendPercent: Total entries trend - indicates demand health
- entriesPerPlayer: Higher = more engaged players, lower = casual attendance
- entriesPerPlayerChange: If declining, players are less engaged; if rising, strong retention
Example insights:
- "+15% unique players with +8% entries/player = healthy growth + strong retention"
- "-10% unique players but +20% entries/player = fewer players but more engaged core"
- "-5% entries/player = engagement declining, may need promotional refresh"

GAME STATUS INTERPRETATION:
When reporting on games that didn't run, use appropriate business language:
- INITIATING_STALE: Game was set up but never started - likely insufficient registrations, operational issue, or venue problem. Report as "cancelled before start" or "didn't proceed".
- CANCELLED: Explicitly cancelled - may indicate consistent demand issues if recurring.
- SCHEDULED: Game scheduled but period ended before it ran - only relevant for very recent games.
- NOT_FOUND / NOT_PUBLISHED: System/data issues - flag as operational gaps.

VENUE STATUS NOTES:
- Venues with "hadScheduledGamesOnly: true" had games planned but none ran - this is an operational concern.
- These venues still count as "active relationships" but had 0 financial contribution.
- Distinguish between new venues (ramping up) vs existing venues with execution problems.

BOARD-LEVEL STANDARDS:
- Lead with the bottom line (profit/loss) and trend direction
- Every insight needs supporting data
- Recommendations must include expected ROI/impact
- Flag material risks with quantified exposure
- Compare to prior period AND identify trajectory
- Strategic recommendations should span 30-90 days

CRITICAL RULES:
- Use ONLY numbers from the data - never invent figures
- All currency in AUD ($X,XXX format)
- Name specific venues and games - boards hate vagueness
- If data sections show "hasXxxData: false", note the gap
- Distinguish between one-off issues and systemic problems
- Report games not run as operational metrics, NOT as financial losses`;
}

function buildUserPrompt(metricsPack, options = {}) {
  const { 
    packData, 
    periodLabel, 
    periodStart, 
    periodEnd, 
    comparisonPeriodLabel,
    comparisonPeriodStart,
    comparisonPeriodEnd,
    dataCompleteness,
    warnings,
    version,
    gamesNotRunCount,
    venuesWithGamesRun,
    venuesScheduledOnly
  } = metricsPack;
  
  // Parse packData if it's a string
  const data = typeof packData === 'string' ? JSON.parse(packData) : packData;
  
  // Extract all sections
  const s = data.strategic || {};
  const venues = data.venues || [];
  const alerts = data.alerts || [];
  const alertSummary = data.alertSummary || {};
  const rankings = data.rankings || {};
  const playerInsights = data.playerInsights || {};
  const scheduleCompliance = data.scheduleCompliance || {};
  const recurringGameTrends = data.recurringGameTrends || {};
  const competitorAnalysis = data.competitorAnalysis || {};
  const opportunities = data.opportunities || {};
  const seriesLifecycle = data.seriesLifecycle || {};
  const gamesNotRun = data.gamesNotRun || {};
  
  // Pre-calculate key ratios
  const overlayImpact = s.netProfit < 0 && s.overlayCost > 0 
    ? Math.round((s.overlayCost / Math.abs(s.netProfit)) * 100) 
    : 0;
  const costPerEntry = s.totalEntries > 0 ? (s.totalCost / s.totalEntries).toFixed(2) : 0;
  const revenuePerEntry = s.totalEntries > 0 ? (s.totalRevenue / s.totalEntries).toFixed(2) : 0;
  
  // Separate venues into active vs scheduled-only
  const activeVenues = venues.filter(v => !v.hadScheduledGamesOnly);
  const scheduledOnlyVenues = venues.filter(v => v.hadScheduledGamesOnly);
  
  return `Create a Monthly Board Report for: ${periodLabel}
Period: ${periodStart} to ${periodEnd}
Comparison: ${comparisonPeriodLabel || 'Prior Period'} (${comparisonPeriodStart || 'N/A'} to ${comparisonPeriodEnd || 'N/A'})
Data Quality: ${dataCompleteness || 100}% complete | Pack Version: ${version || 'unknown'}
${warnings?.length ? `⚠️ Data Warnings: ${warnings.join(', ')}` : ''}

════════════════════════════════════════════════════════════════════════════════
SECTION 1: EXECUTIVE FINANCIAL SUMMARY
════════════════════════════════════════════════════════════════════════════════
REVENUE:     $${(s.totalRevenue || 0).toLocaleString()}  (${s.revenueGrowthPercent >= 0 ? '+' : ''}${(s.revenueGrowthPercent || 0).toFixed(1)}% | ${s.revenueGrowth >= 0 ? '+' : ''}$${(s.revenueGrowth || 0).toLocaleString()})
COSTS:       $${(s.totalCost || 0).toLocaleString()}
NET PROFIT:  $${(s.netProfit || 0).toLocaleString()}  (${s.profitGrowthPercent >= 0 ? '+' : ''}${(s.profitGrowthPercent || 0).toFixed(1)}% | ${s.profitGrowth >= 0 ? '+' : ''}$${(s.profitGrowth || 0).toLocaleString()})
MARGIN:      ${(s.profitMargin || 0).toFixed(1)}%  (${s.marginChange >= 0 ? '+' : ''}${(s.marginChange || 0).toFixed(1)}pp change)

Revenue Breakdown:
- Rake Revenue: $${(s.rakeRevenue || 0).toLocaleString()}
- Venue Fees: $${(s.venueFeeRevenue || 0).toLocaleString()}
- Other Revenue: $${(s.otherRevenue || 0).toLocaleString()}

Cost Breakdown:
- Staff/Dealer: $${(s.staffCost || 0).toLocaleString()} + $${(s.dealerCost || 0).toLocaleString()}
- Venue Rental: $${(s.venueRentalCost || 0).toLocaleString()}
- Marketing: $${(s.marketingCost || 0).toLocaleString()}
- OVERLAY: $${(s.overlayCost || 0).toLocaleString()} ${overlayImpact > 0 ? `⚠️ (${overlayImpact}% of losses)` : ''}
- Other: $${(s.otherCost || 0).toLocaleString()}

Unit Economics:
- Revenue per Entry: $${revenuePerEntry}
- Cost per Entry: $${costPerEntry}
- Profit per Entry: $${(s.profitPerEntry || 0).toFixed(2)}
- Avg Profit per Game: $${(s.avgProfitPerGame || 0).toLocaleString()}

════════════════════════════════════════════════════════════════════════════════
SECTION 2: VOLUME & PLAYER METRICS
════════════════════════════════════════════════════════════════════════════════
Games Run: ${s.totalGamesRun || 0} (${s.gamesGrowthPercent >= 0 ? '+' : ''}${(s.gamesGrowthPercent || 0).toFixed(1)}%)
Total Entries: ${s.totalEntries || 0} (${s.entriesGrowthPercent >= 0 ? '+' : ''}${(s.entriesGrowthPercent || 0).toFixed(1)}%)
Rebuys: ${s.rebuys || 0} | Add-ons: ${s.addons || 0}
Unique Players: ${s.totalUniquePlayers || 0} (${s.playerGrowthPercent >= 0 ? '+' : ''}${(s.playerGrowthPercent || 0).toFixed(1)}%)

Avg Entries per Game: ${(s.avgEntriesPerGame || 0).toFixed(1)}
Entries per Player: ${(s.entriesPerPlayer || 0).toFixed(2)}
Revenue per Player: $${(s.revenuePerPlayer || 0).toLocaleString()}
Profit per Player: $${(s.profitPerPlayer || 0).toLocaleString()}

PLAYER INSIGHTS:
${JSON.stringify(playerInsights, null, 2)}

════════════════════════════════════════════════════════════════════════════════
SECTION 3: GUARANTEE & OVERLAY ANALYSIS (Critical)
════════════════════════════════════════════════════════════════════════════════
Games with Guarantees: ${s.gamesWithGuarantee || 0}
Games that Overlaid: ${s.gamesWithOverlay || 0}
Overlay Rate: ${s.gamesWithGuarantee > 0 ? ((s.gamesWithOverlay / s.gamesWithGuarantee) * 100).toFixed(0) : 0}%
Total Guarantee Exposure: $${(s.totalGuaranteeExposure || 0).toLocaleString()}
Total Overlay Cost: $${(s.totalOverlayCost || 0).toLocaleString()}
Guarantee Exposure Rate: ${(s.guaranteeExposureRate || 0).toFixed(1)}%
Average Coverage Rate: ${(s.avgGuaranteeCoverageRate || 0).toFixed(1)}%

Prizepool Metrics:
- Total Prizepool Generated: $${(s.totalPrizepool || 0).toLocaleString()}
- Average Prizepool: $${(s.avgPrizepool || 0).toLocaleString()}
- Prizepool Surplus: $${(s.prizepoolSurplus || 0).toLocaleString()}

════════════════════════════════════════════════════════════════════════════════
SECTION 4: SCHEDULE COMPLIANCE & EXECUTION
════════════════════════════════════════════════════════════════════════════════
${scheduleCompliance.hasScheduleData ? `
COMPLIANCE RATE: ${scheduleCompliance.summary?.complianceRate || 0}%
Cancellation Rate: ${scheduleCompliance.summary?.cancellationRate || 0}%
Expected Games: ${scheduleCompliance.summary?.totalExpected || 0}
Confirmed (Ran): ${scheduleCompliance.summary?.confirmed || 0}
Cancelled: ${scheduleCompliance.summary?.cancelled || 0}
Needs Review: ${scheduleCompliance.summary?.needsReviewCount || 0}

AT-RISK RECURRING GAMES (high cancellation):
${JSON.stringify(scheduleCompliance.atRiskRecurringGames || [], null, 2)}

CANCELLATION BREAKDOWN BY VENUE:
${JSON.stringify(scheduleCompliance.byVenue || {}, null, 2)}

RECENT CANCELLATIONS:
${JSON.stringify(scheduleCompliance.recentCancellations?.slice(0, 10) || [], null, 2)}
` : '⚠️ Schedule compliance data not available for this period.'}

════════════════════════════════════════════════════════════════════════════════
SECTION 4B: GAMES NOT RUN (Operational Efficiency)
════════════════════════════════════════════════════════════════════════════════
${gamesNotRun.total > 0 ? `
⚠️ ${gamesNotRun.total} scheduled games did not complete during this period.
These are EXCLUDED from financial calculations above.

BREAKDOWN BY REASON:
${Object.entries(gamesNotRun.byReason || {}).map(([reason, count]) => {
  const descriptions = {
    'INITIATING_STALE': 'Set up but never started (likely insufficient registrations or operational issues)',
    'CANCELLED': 'Explicitly cancelled',
    'SCHEDULED': 'Scheduled but period ended before game ran',
    'NOT_FOUND': 'Game record not found (data issue)',
    'NOT_PUBLISHED': 'Game not published (operational issue)',
    'UNKNOWN': 'Unknown status'
  };
  return `- ${reason}: ${count} games - ${descriptions[reason] || reason}`;
}).join('\n')}

BY VENUE:
${JSON.stringify(gamesNotRun.byVenue || [], null, 2)}

GAMES NOT RUN LIST (showing first 15):
${JSON.stringify(gamesNotRun.gamesList?.slice(0, 15) || [], null, 2)}
` : '✓ All scheduled games ran successfully this period.'}

VENUES WITH ONLY SCHEDULED GAMES (no games completed):
${scheduledOnlyVenues.length > 0 ? `
⚠️ ${scheduledOnlyVenues.length} venue(s) had games scheduled but none ran:
${JSON.stringify(scheduledOnlyVenues.map(v => ({
  venueName: v.venueName,
  gamesNotRun: v.gamesNotRun,
  details: v.gamesNotRunDetails
})), null, 2)}
` : '✓ All venues with scheduled games had at least one game run.'}

════════════════════════════════════════════════════════════════════════════════
SECTION 5: RECURRING GAME PORTFOLIO HEALTH
════════════════════════════════════════════════════════════════════════════════
${recurringGameTrends.hasRecurringGameData ? `
PORTFOLIO SUMMARY:
- Total Recurring Games: ${recurringGameTrends.summary?.totalRecurringGames || 0}
- Excellent Health: ${recurringGameTrends.summary?.excellent || 0}
- Good Health: ${recurringGameTrends.summary?.good || 0}
- Needs Attention: ${recurringGameTrends.summary?.needsAttention || 0}
- Critical: ${recurringGameTrends.summary?.critical || 0}
- Growing: ${recurringGameTrends.summary?.growingCount || 0}
- Declining: ${recurringGameTrends.summary?.decliningCount || 0}

TOP PERFORMERS (by profit):
${JSON.stringify(recurringGameTrends.topPerformers?.slice(0, 10) || [], null, 2)}

GROWING GAMES (positive attendance trend):
${JSON.stringify(recurringGameTrends.growingGames || [], null, 2)}

DECLINING GAMES (negative attendance trend):
${JSON.stringify(recurringGameTrends.decliningGames || [], null, 2)}

NEEDS ATTENTION (intervention required):
${JSON.stringify(recurringGameTrends.needsAttention?.slice(0, 10) || [], null, 2)}

STRONG BRANDS (reliable performers):
${JSON.stringify(recurringGameTrends.strongBrands || [], null, 2)}
` : '⚠️ Recurring game trend data not available.'}

════════════════════════════════════════════════════════════════════════════════
SECTION 6: COMPETITIVE LANDSCAPE
════════════════════════════════════════════════════════════════════════════════
${competitorAnalysis.hasCompetitorData ? `
COMPETITIVE PRESSURE: ${competitorAnalysis.pressure?.level || 'UNKNOWN'} (Score: ${competitorAnalysis.pressure?.score || 0}/10)
${competitorAnalysis.pressure?.description || ''}

Market Activity:
- Competitor Accounts Tracked: ${competitorAnalysis.summary?.competitorAccounts || 0}
- Competitor Posts This Period: ${competitorAnalysis.summary?.competitorPosts || 0}
- Posts with Event Data: ${competitorAnalysis.summary?.postsWithExtractedData || 0}
- Events Detected: ${competitorAnalysis.summary?.eventsDetected || 0}
- Activity Trend: ${competitorAnalysis.trends?.trend || 'UNKNOWN'}
- Posts per Week: ${competitorAnalysis.trends?.postsPerWeek || 0}

Schedule Clashes:
- Direct Competition Clashes: ${competitorAnalysis.summary?.directCompetitionClashes || 0}
- Same-Day Clashes: ${competitorAnalysis.summary?.sameDayClashes || 0}

HIGH-SEVERITY CLASHES (Direct Competition):
${JSON.stringify(competitorAnalysis.clashes?.high || [], null, 2)}

TOP COMPETITORS BY ACTIVITY:
${JSON.stringify(competitorAnalysis.topCompetitors || [], null, 2)}

HIGH GUARANTEE COMPETITOR EVENTS:
${JSON.stringify(competitorAnalysis.highGuaranteeEvents || [], null, 2)}

RECENT COMPETITOR EVENTS:
${JSON.stringify(competitorAnalysis.recentCompetitorEvents?.slice(0, 10) || [], null, 2)}
` : '⚠️ Competitor analysis not available for this location.'}

════════════════════════════════════════════════════════════════════════════════
SECTION 7: TOURNAMENT SERIES STATUS
════════════════════════════════════════════════════════════════════════════════
${seriesLifecycle.hasSeriesData ? `
Total Series: ${seriesLifecycle.summary?.totalSeries || 0}
Active Series: ${seriesLifecycle.summary?.activeSeries || 0}
Upcoming (60 days): ${seriesLifecycle.summary?.upcomingSeries || 0}
Recently Completed: ${seriesLifecycle.summary?.recentlyCompleted || 0}

ACTIVE SERIES:
${JSON.stringify(seriesLifecycle.active || [], null, 2)}

UPCOMING SERIES:
${JSON.stringify(seriesLifecycle.upcoming || [], null, 2)}

RECENTLY COMPLETED:
${JSON.stringify(seriesLifecycle.recentlyCompleted || [], null, 2)}
` : 'No tournament series data available.'}

════════════════════════════════════════════════════════════════════════════════
SECTION 8: GROWTH OPPORTUNITIES
════════════════════════════════════════════════════════════════════════════════
${opportunities.hasOpportunities ? `
OPPORTUNITY SUMMARY:
- Total Opportunities: ${opportunities.summary?.totalOpportunities || 0}
- High Priority: ${opportunities.summary?.highPriority || 0}
- Medium Priority: ${opportunities.summary?.mediumPriority || 0}
- Low Priority: ${opportunities.summary?.lowPriority || 0}

By Type:
- Schedule Gaps: ${opportunities.summary?.byType?.scheduleGaps || 0}
- Buy-in Gaps: ${opportunities.summary?.byType?.buyInGaps || 0}
- Expansion Opportunities: ${opportunities.summary?.byType?.expansion || 0}
- Venue Capacity: ${opportunities.summary?.byType?.venueCapacity || 0}
- Market Opportunities: ${opportunities.summary?.byType?.market || 0}

TOP OPPORTUNITIES:
${JSON.stringify(opportunities.topOpportunities || [], null, 2)}

SCHEDULE GAPS (profitable venues with missing days):
${JSON.stringify(opportunities.byType?.scheduleGaps || [], null, 2)}

EXPANSION OPPORTUNITIES (strong games to grow):
${JSON.stringify(opportunities.byType?.expansionOpportunities || [], null, 2)}

VENUE CAPACITY (underutilized venues):
${JSON.stringify(opportunities.byType?.venueCapacity || [], null, 2)}
` : 'No growth opportunities detected this period.'}

════════════════════════════════════════════════════════════════════════════════
SECTION 9: VENUE PERFORMANCE DETAIL
════════════════════════════════════════════════════════════════════════════════
Active Venues (with games run): ${activeVenues.length}
Scheduled-Only Venues (no games ran): ${scheduledOnlyVenues.length}

${JSON.stringify(venues.map(v => ({
  venueName: v.venueName,
  venueId: v.venueId,
  // Status
  hadScheduledGamesOnly: v.hadScheduledGamesOnly || false,
  
  // Financial metrics (will be 0 for scheduled-only venues)
  totalRevenue: v.totalRevenue,
  totalCost: v.totalCost,
  totalProfit: v.totalProfit,
  profitMargin: v.profitMargin,
  avgProfitPerGame: v.avgProfitPerGame,
  
  // Volume metrics
  gamesRun: v.gamesRun || v.totalGames || 0,
  gamesNotRun: v.gamesNotRun || 0,
  totalEntries: v.totalEntries,
  avgEntriesPerGame: v.avgEntriesPerGame,
  
  // Player metrics (NEW)
  totalUniquePlayers: v.totalUniquePlayers || 0,
  avgPlayersPerGame: v.avgPlayersPerGame || 0,
  entriesPerPlayer: v.entriesPerPlayer || 0,
  
  // Trending - Financial
  profitTrendPercent: v.profitTrendPercent,
  revenueTrendPercent: v.revenueTrendPercent,
  trendCategory: v.trendCategory,
  
  // Trending - Volume/Players (NEW)
  entriesTrendPercent: v.entriesTrendPercent,
  uniquePlayersTrendPercent: v.uniquePlayersTrendPercent,
  gamesTrendPercent: v.gamesTrendPercent,
  entriesPerPlayerChange: v.entriesPerPlayerChange,
  
  // Prior period comparison
  priorPeriodProfit: v.priorPeriodProfit,
  priorPeriodEntries: v.priorPeriodEntries,
  priorPeriodUniquePlayers: v.priorPeriodUniquePlayers,
  priorPeriodGames: v.priorPeriodGames,
  
  // Health indicators
  overallHealth: v.overallHealth,
  profitability: v.profitability,
  
  // Guarantee info
  totalOverlayCost: v.totalOverlayCost,
  avgCoverageRate: v.avgCoverageRate,
  
  // Breakdowns
  gameTypeBreakdown: v.gameTypeBreakdown,
  dayBreakdown: v.dayBreakdown,
  
  // Games summary
  topGames: v.topGames,
  bottomGames: v.bottomGames,
  
  // Full games list (all games with details)
  gamesList: v.gamesList || [],
  
  // Games not run details (if any)
  gamesNotRunDetails: v.gamesNotRunDetails || null
})), null, 2)}

════════════════════════════════════════════════════════════════════════════════
SECTION 10: ALERTS & RANKINGS
════════════════════════════════════════════════════════════════════════════════
ALERT SUMMARY: ${alertSummary.total || 0} total
- HIGH: ${alertSummary.bySeverity?.HIGH || 0}
- MEDIUM: ${alertSummary.bySeverity?.MEDIUM || 0}
- LOW: ${alertSummary.bySeverity?.LOW || 0}

By Type: ${JSON.stringify(alertSummary.byType || {}, null, 2)}

ALL ALERTS:
${JSON.stringify(alerts, null, 2)}

RANKINGS:
${JSON.stringify(rankings, null, 2)}

════════════════════════════════════════════════════════════════════════════════
REQUIRED JSON OUTPUT
════════════════════════════════════════════════════════════════════════════════
{
  "executiveSummary": {
    "headline": "One sentence: profit/loss with trend direction and primary driver",
    "overallHealth": "CRITICAL | NEEDS_ATTENTION | STABLE | GOOD | EXCELLENT",
    "healthRationale": "Data-backed justification for rating",
    "profitStatement": "Clear P&L statement: '$X profit/loss, Y% margin, Z% vs prior period'",
    "keyHighlights": ["3-5 most material findings with numbers"],
    "keyRisks": ["Top 2-3 risks with quantified exposure"],
    "trajectory": "IMPROVING | STABLE | DECLINING"
  },
  
  "financialPerformance": {
    "revenue": {
      "actual": <number>,
      "priorPeriod": <number>,
      "change": <number>,
      "changePercent": <number>,
      "drivers": ["What drove revenue up/down"]
    },
    "costs": {
      "total": <number>,
      "breakdown": {
        "staff": <number>,
        "venue": <number>,
        "marketing": <number>,
        "overlay": <number>,
        "other": <number>
      },
      "biggestDriver": "Which cost category had most impact",
      "costPerEntry": <number>
    },
    "profit": {
      "actual": <number>,
      "priorPeriod": <number>,
      "change": <number>,
      "changePercent": <number>,
      "margin": <number>,
      "marginChange": <number>,
      "analysis": "What drove profit performance"
    }
  },
  
  "guaranteeAnalysis": {
    "summary": "Overall assessment of guarantee strategy",
    "totalExposure": <number>,
    "totalOverlayCost": <number>,
    "overlayRate": <number>,
    "avgCoverageRate": <number>,
    "overlayAsPercentOfLoss": <number or null>,
    "problemGuarantees": [
      { "gameName": "Name", "venueName": "Venue", "overlay": <number>, "coverageRate": <number>, "recommendation": "Action" }
    ],
    "strategicRecommendation": "Guarantee strategy adjustment"
  },
  
  "scheduleExecution": {
    "complianceRate": <number or null>,
    "cancellationRate": <number or null>,
    "assessment": "Schedule reliability assessment",
    "atRiskGames": [
      { "gameName": "Name", "cancellationRate": <number>, "recommendation": "Keep/Remove/Reposition" }
    ],
    "recommendation": "Schedule reliability action"
  },
  
  "portfolioHealth": {
    "summary": "Overall recurring game portfolio assessment",
    "healthDistribution": { "excellent": <number>, "good": <number>, "needsAttention": <number>, "critical": <number> },
    "growthOpportunities": [
      { "gameName": "Name", "trend": "+X%", "brandStrength": "STRONG/GROWING", "recommendation": "Expansion action" }
    ],
    "interventionRequired": [
      { "gameName": "Name", "trend": "-X%", "issue": "What's wrong", "recommendation": "Fix/Cut/Reposition" }
    ],
    "portfolioActions": ["Strategic actions for game lineup"]
  },
  
  "venuePerformance": [
    {
      "venueName": "Name",
      "profit": <number>,
      "profitChange": <number>,
      "profitChangePercent": <number>,
      "margin": <number>,
      "gamesRun": <number>,
      "gamesNotRun": <number or 0>,
      "hadScheduledGamesOnly": <boolean>,
      "health": "EXCELLENT | GOOD | NEEDS_ATTENTION | CRITICAL | SCHEDULED_ONLY",
      "trend": "UPLIFT | STEADY | SOFTENING | AT_RISK | NO_DATA",
      "playerMetrics": {
        "uniquePlayers": <number>,
        "uniquePlayersTrend": "<+/-X%>",
        "entriesPerPlayer": <number>,
        "entriesPerPlayerChange": "<+/-X%>",
        "playerTrendAssessment": "Growing player base | Stable | Declining - need retention focus"
      },
      "keyDrivers": ["What's driving performance"],
      "risks": ["Venue-specific risks"],
      "operationalNotes": "Any notes about games not run or scheduled-only status",
      "recommendation": "Strategic action for this venue"
    }
  ],
  
  "operationalExecution": {
    "summary": "Overall operational efficiency assessment",
    "gamesRun": <number>,
    "gamesNotRun": <number>,
    "executionRate": <number as percentage>,
    "gamesNotRunBreakdown": {
      "initiatingStale": <number>,
      "cancelled": <number>,
      "other": <number>
    },
    "venuesWithNoGamesRun": [
      { "venueName": "Name", "gamesScheduled": <number>, "reason": "Why games didn't run", "recommendation": "Action" }
    ],
    "systemic Issues": ["Recurring problems causing games not to run"],
    "recommendation": "Operational improvement action"
  },
  
  "competitivePosition": {
    "pressureLevel": "HIGH | MEDIUM | LOW | MINIMAL",
    "pressureScore": <number>,
    "marketAssessment": "Our competitive position",
    "activityTrend": "INCREASING | STABLE | DECREASING",
    "directThreats": [
      { "competitor": "Name", "threat": "What they're doing", "ourResponse": "How to respond" }
    ],
    "clashImpact": {
      "directClashes": <number>,
      "estimatedRevenueImpact": "Estimated impact",
      "affectedGames": ["Games affected"]
    },
    "strategicResponse": "Competitive strategy recommendation"
  },
  
  "seriesPerformance": {
    "activeSeries": [
      { "name": "Name", "progress": "X%", "status": "AHEAD | ON_TRACK | BEHIND", "action": "What's needed" }
    ],
    "upcomingSeries": [
      { "name": "Name", "startDate": "Date", "readiness": "Assessment" }
    ],
    "completedLearnings": ["Key learnings from completed series"]
  },
  
  "growthOpportunities": {
    "summary": "Overall opportunity landscape",
    "totalOpportunities": <number>,
    "topOpportunities": [
      {
        "opportunity": "Description",
        "type": "SCHEDULE_GAP | EXPANSION | VENUE_CAPACITY | MARKET",
        "potentialImpact": "$X/period",
        "investment": "What's required",
        "timeline": "SHORT_TERM | MEDIUM_TERM | LONG_TERM",
        "priority": "HIGH | MEDIUM | LOW"
      }
    ],
    "quickWins": ["Opportunities actionable within 30 days"]
  },
  
  "alerts": [
    {
      "severity": "CRITICAL | HIGH | MEDIUM | LOW",
      "type": "Alert type",
      "title": "Short title",
      "description": "What's happening",
      "evidence": "Supporting data",
      "financialImpact": "$X impact or exposure",
      "recommendation": "Action to take",
      "owner": "Who should handle",
      "deadline": "When"
    }
  ],
  
  "strategicRecommendations": [
    {
      "priority": 1,
      "recommendation": "Specific strategic action",
      "rationale": "Data-backed justification",
      "expectedImpact": "$ or % improvement",
      "investment": "Resources/cost required",
      "timeline": "This month | Next quarter | 6 months",
      "owner": "Operations | Marketing | Executive",
      "successMetrics": "How to measure success"
    }
  ],
  
  "outlook": {
    "trajectory": "IMPROVING | STABLE | DECLINING",
    "confidence": "HIGH | MEDIUM | LOW",
    "nextPeriodFocus": "Primary strategic focus",
    "keyRisksToMonitor": ["Risks requiring attention"],
    "targetMetrics": {
      "revenue": "Target or direction",
      "profit": "Target or direction",
      "margin": "Target or direction",
      "compliance": "Target or direction"
    },
    "catalysts": ["Events that could change trajectory"]
  }
}`;
}

/**
 * Get the JSON schema for OpenAI structured output
 * @returns {object}
 */
function getSchema() {
  return {
    name: 'monthly_board_report_v3',
    strict: false,
    schema: {
      type: 'object',
      required: ['executiveSummary', 'financialPerformance', 'guaranteeAnalysis', 'alerts', 'strategicRecommendations', 'outlook'],
      properties: {
        executiveSummary: { type: 'object' },
        financialPerformance: { type: 'object' },
        guaranteeAnalysis: { type: 'object' },
        scheduleExecution: { type: 'object' },
        operationalExecution: { type: 'object' },
        portfolioHealth: { type: 'object' },
        venuePerformance: { type: 'array' },
        competitivePosition: { type: 'object' },
        seriesPerformance: { type: 'object' },
        growthOpportunities: { type: 'object' },
        alerts: { type: 'array' },
        strategicRecommendations: { type: 'array' },
        outlook: { type: 'object' },
      },
    },
  };
}

module.exports = {
  build,
  getSchema,
};