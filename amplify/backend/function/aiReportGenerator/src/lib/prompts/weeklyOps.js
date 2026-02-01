/**
 * Weekly Operations Report Prompt Template
 * Generates tactical insights for venue managers
 * 
 * VERSION: 2.1.0 - Updated for MetricsPack v6 (Games Not Run tracking)
 * 
 * Now uses:
 * - scheduleCompliance (cancellation analysis)
 * - recurringGameTrends (game health, brand strength)
 * - opportunities (schedule gaps, expansion)
 * - competitorAnalysis (clashes, market pressure)
 * - gamesNotRun (scheduled games that didn't complete - INITIATING, etc.)
 */

/**
 * Build the system and user prompts for Weekly Ops report
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
  return `You are a poker operations analyst creating a weekly report for floor managers. Be practical, specific, and action-oriented.

OUTPUT FORMAT: Valid JSON only. No markdown, no text outside JSON.

ANALYSIS PRIORITIES:
1. THIS WEEK'S NUMBERS - What happened and why
2. PROBLEM GAMES - Which games lost money and what to do
3. OVERLAY COSTS - The biggest controllable cost - analyze every overlay
4. SCHEDULE COMPLIANCE - Cancelled games cost money and reputation
5. GAMES NOT RUN - Games that were scheduled but didn't complete
6. RECURRING GAME HEALTH - Which regular games are growing vs declining
7. PLAYER TRENDS - Are unique players growing/declining? Is engagement changing?
8. COMPETITOR ACTIVITY - Schedule clashes and market pressure
9. QUICK WINS - Opportunities that can be actioned THIS WEEK

PLAYER & ENTRY TRENDING (Key for Ops):
When analyzing venues, look at player metrics to spot issues early:
- uniquePlayersTrendPercent: Is player base growing (+) or shrinking (-)?
- entriesTrendPercent: Total entries - indicates overall demand
- entriesPerPlayer: Higher = players entering multiple games = engaged
- entriesPerPlayerChange: Falling = players are less engaged, need action

Operational insights from player trends:
- If unique players declining but entries/player rising = core players strong, need acquisition focus
- If unique players growing but entries/player falling = attracting casuals, need engagement programs  
- Both declining = urgent action needed - check marketing, promotions, competitor activity
- Both growing = healthy venue, consider expansion

GAME STATUS INTERPRETATION:
When discussing games that didn't run, be specific about what happened:
- INITIATING_STALE: "Set up but didn't start" - often means insufficient registrations or last-minute operational issues
- CANCELLED: "Cancelled" - explicitly stopped, may indicate demand problems
- SCHEDULED: Still scheduled - just didn't happen yet in the period
- NOT_FOUND/NOT_PUBLISHED: Data/system issues - flag for IT

VENUE STATUS NOTES:
- Venues with "hadScheduledGamesOnly: true" had games planned but none ran
- This is an operational red flag - investigate why
- Report as "scheduled activity, no completed games" not as "inactive"

TONE: Direct and operational. Managers need actions, not strategy.

CRITICAL RULES:
- Only use numbers from the data provided - NEVER invent figures
- Currency in AUD ($X,XXX format)
- Name specific games and venues when discussing issues
- Use the ACTUAL venue names and game names provided (not "Unknown")
- Recommendations must be achievable within 1 week
- Prioritize by profit impact
- If a data section shows "hasXxxData: false", acknowledge the gap
- Report games not run as operational issues, NOT as financial losses`;
}

function buildUserPrompt(metricsPack, options = {}) {
  const { 
    packData, 
    periodLabel, 
    periodStart, 
    periodEnd, 
    comparisonPeriodLabel,
    dataCompleteness,
    warnings,
    gamesNotRunCount,
    venuesWithGamesRun,
    venuesScheduledOnly
  } = metricsPack;
  
  // Parse packData if it's a string
  const data = typeof packData === 'string' ? JSON.parse(packData) : packData;
  
  // Extract all sections with safe defaults
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
  const gamesNotRun = data.gamesNotRun || {};
  
  // Separate venues into active vs scheduled-only
  const activeVenues = venues.filter(v => !v.hadScheduledGamesOnly);
  const scheduledOnlyVenues = venues.filter(v => v.hadScheduledGamesOnly);
  
  // Pre-calculate key metrics for clarity
  const overlayImpact = s.netProfit < 0 && s.overlayCost > 0 
    ? Math.round((s.overlayCost / Math.abs(s.netProfit)) * 100) 
    : 0;
  
  return `Create a Weekly Operations Report for: ${periodLabel}
Period: ${periodStart} to ${periodEnd}
${comparisonPeriodLabel ? `Compared to: ${comparisonPeriodLabel}` : ''}
Data Quality: ${dataCompleteness || 100}% complete
${warnings?.length ? `⚠️ Data Warnings: ${warnings.join(', ')}` : ''}

══════════════════════════════════════════════════════════════
SECTION 1: HEADLINE NUMBERS
══════════════════════════════════════════════════════════════
Revenue: $${(s.totalRevenue || 0).toLocaleString()} (${s.revenueGrowthPercent >= 0 ? '+' : ''}${(s.revenueGrowthPercent || 0).toFixed(1)}% vs prior)
Profit: $${(s.netProfit || 0).toLocaleString()} (${s.profitGrowthPercent >= 0 ? '+' : ''}${(s.profitGrowthPercent || 0).toFixed(1)}% vs prior)
Margin: ${(s.profitMargin || 0).toFixed(1)}% (${s.marginChange >= 0 ? '+' : ''}${(s.marginChange || 0).toFixed(1)}pp change)

Games Run: ${s.totalGamesRun || 0} (${s.gamesGrowth >= 0 ? '+' : ''}${s.gamesGrowth || 0})
Total Entries: ${s.totalEntries || 0} (${s.entriesGrowthPercent >= 0 ? '+' : ''}${(s.entriesGrowthPercent || 0).toFixed(1)}%)
Unique Players: ${s.totalUniquePlayers || 0} (${s.playerGrowth >= 0 ? '+' : ''}${s.playerGrowth || 0})
Avg Entries/Game: ${(s.avgEntriesPerGame || 0).toFixed(1)}

══════════════════════════════════════════════════════════════
SECTION 2: COST BREAKDOWN
══════════════════════════════════════════════════════════════
Staff Cost: $${(s.staffCost || 0).toLocaleString()}
Dealer Cost: $${(s.dealerCost || 0).toLocaleString()}
Venue Rental: $${(s.venueRentalCost || 0).toLocaleString()}
Marketing: $${(s.marketingCost || 0).toLocaleString()}
OVERLAY COST: $${(s.overlayCost || 0).toLocaleString()} ⚠️ ${overlayImpact > 50 ? 'MAJOR PROFIT DRAIN' : overlayImpact > 0 ? 'Contributing to losses' : ''}
Other: $${(s.otherCost || 0).toLocaleString()}
TOTAL COST: $${(s.totalCost || 0).toLocaleString()}

══════════════════════════════════════════════════════════════
SECTION 3: GUARANTEE ANALYSIS (Critical for Profitability)
══════════════════════════════════════════════════════════════
Games with Guarantees: ${s.gamesWithGuarantee || 0}
Games that Overlaid: ${s.gamesWithOverlay || 0} (${s.gamesWithGuarantee > 0 ? ((s.gamesWithOverlay / s.gamesWithGuarantee) * 100).toFixed(0) : 0}% overlay rate)
Total Guarantee Exposure: $${(s.totalGuaranteeExposure || 0).toLocaleString()}
Total Overlay Cost: $${(s.totalOverlayCost || 0).toLocaleString()}
Average Coverage Rate: ${(s.avgGuaranteeCoverageRate || 0).toFixed(1)}%
${overlayImpact > 0 ? `⚠️ Overlay represents ${overlayImpact}% of total losses` : ''}

══════════════════════════════════════════════════════════════
SECTION 4: SCHEDULE COMPLIANCE
══════════════════════════════════════════════════════════════
${scheduleCompliance.hasScheduleData ? `
Schedule Compliance Rate: ${scheduleCompliance.summary?.complianceRate || 'N/A'}%
Cancellation Rate: ${scheduleCompliance.summary?.cancellationRate || 0}%
Games Expected: ${scheduleCompliance.summary?.totalExpected || 0}
Games Confirmed (ran): ${scheduleCompliance.summary?.confirmed || 0}
Games Cancelled: ${scheduleCompliance.summary?.cancelled || 0}
Needs Review: ${scheduleCompliance.summary?.needsReviewCount || 0}

AT-RISK RECURRING GAMES (high cancellation rate):
${JSON.stringify(scheduleCompliance.atRiskRecurringGames?.slice(0, 5) || [], null, 2)}

RECENT CANCELLATIONS:
${JSON.stringify(scheduleCompliance.recentCancellations?.slice(0, 5) || [], null, 2)}
` : 'Schedule compliance data not available for this period.'}

══════════════════════════════════════════════════════════════
SECTION 4B: GAMES NOT RUN (Operational Issues)
══════════════════════════════════════════════════════════════
${gamesNotRun.total > 0 ? `
⚠️ ${gamesNotRun.total} scheduled games did not complete this period.
These are EXCLUDED from financial calculations - no revenue or costs attributed.

BREAKDOWN BY REASON:
${Object.entries(gamesNotRun.byReason || {}).map(([reason, count]) => {
  const descriptions = {
    'INITIATING_STALE': 'Set up but never started',
    'CANCELLED': 'Explicitly cancelled',
    'SCHEDULED': 'Still scheduled (period ended)',
    'NOT_FOUND': 'Game record not found',
    'NOT_PUBLISHED': 'Not published',
    'UNKNOWN': 'Unknown status'
  };
  return `- ${reason}: ${count} - ${descriptions[reason] || reason}`;
}).join('\n')}

BY VENUE:
${JSON.stringify(gamesNotRun.byVenue || [], null, 2)}

GAMES NOT RUN LIST:
${JSON.stringify(gamesNotRun.gamesList?.slice(0, 10) || [], null, 2)}
` : '✓ All scheduled games ran this period.'}

VENUES WITH ONLY SCHEDULED GAMES (no games completed):
${scheduledOnlyVenues.length > 0 ? `
⚠️ ${scheduledOnlyVenues.length} venue(s) had scheduled games but none ran:
${JSON.stringify(scheduledOnlyVenues.map(v => ({
  venueName: v.venueName,
  gamesNotRun: v.gamesNotRun,
  details: v.gamesNotRunDetails?.slice(0, 3)
})), null, 2)}
ACTION REQUIRED: Investigate why games at these venues didn't proceed.
` : '✓ All venues with scheduled games had at least one game run.'}

══════════════════════════════════════════════════════════════
SECTION 5: RECURRING GAME HEALTH
══════════════════════════════════════════════════════════════
${recurringGameTrends.hasRecurringGameData ? `
Total Recurring Games Tracked: ${recurringGameTrends.summary?.totalRecurringGames || 0}
Excellent Health: ${recurringGameTrends.summary?.excellent || 0}
Good Health: ${recurringGameTrends.summary?.good || 0}
Needs Attention: ${recurringGameTrends.summary?.needsAttention || 0}
Critical: ${recurringGameTrends.summary?.critical || 0}

GROWING GAMES (attendance trending up):
${JSON.stringify(recurringGameTrends.growingGames?.slice(0, 5) || [], null, 2)}

DECLINING GAMES (need intervention):
${JSON.stringify(recurringGameTrends.decliningGames?.slice(0, 5) || [], null, 2)}

STRONG BRANDS (reliable performers):
${JSON.stringify(recurringGameTrends.strongBrands?.slice(0, 3) || [], null, 2)}

HIGH CANCELLATION GAMES:
${JSON.stringify(recurringGameTrends.highCancellation?.slice(0, 3) || [], null, 2)}
` : 'Recurring game trend data not available.'}

══════════════════════════════════════════════════════════════
SECTION 6: COMPETITOR ANALYSIS
══════════════════════════════════════════════════════════════
${competitorAnalysis.hasCompetitorData ? `
COMPETITIVE PRESSURE: ${competitorAnalysis.pressure?.level || 'UNKNOWN'} (score: ${competitorAnalysis.pressure?.score || 0}/10)
${competitorAnalysis.pressure?.description || ''}

Activity Trend: ${competitorAnalysis.trends?.trend || 'UNKNOWN'}
Competitor Posts This Period: ${competitorAnalysis.summary?.competitorPosts || 0}
Posts with Event Data: ${competitorAnalysis.summary?.postsWithExtractedData || 0}

DIRECT COMPETITION CLASHES (same day + similar buy-in):
${JSON.stringify(competitorAnalysis.clashes?.high?.slice(0, 5) || [], null, 2)}

SAME-DAY EVENTS (awareness):
${JSON.stringify(competitorAnalysis.clashes?.medium?.slice(0, 5) || [], null, 2)}

TOP COMPETITORS BY ACTIVITY:
${JSON.stringify(competitorAnalysis.topCompetitors?.slice(0, 5) || [], null, 2)}

HIGH GUARANTEE COMPETITOR EVENTS:
${JSON.stringify(competitorAnalysis.highGuaranteeEvents?.slice(0, 3) || [], null, 2)}
` : 'Competitor analysis data not available for this location.'}

══════════════════════════════════════════════════════════════
SECTION 7: OPPORTUNITIES DETECTED
══════════════════════════════════════════════════════════════
${opportunities.hasOpportunities ? `
Total Opportunities: ${opportunities.summary?.totalOpportunities || 0}
High Priority: ${opportunities.summary?.highPriority || 0}
Medium Priority: ${opportunities.summary?.mediumPriority || 0}

TOP OPPORTUNITIES:
${JSON.stringify(opportunities.topOpportunities?.slice(0, 5) || [], null, 2)}

SCHEDULE GAPS (days without games at profitable venues):
${JSON.stringify(opportunities.byType?.scheduleGaps?.slice(0, 3) || [], null, 2)}

EXPANSION OPPORTUNITIES (strong games to grow):
${JSON.stringify(opportunities.byType?.expansionOpportunities?.slice(0, 3) || [], null, 2)}
` : 'No opportunities detected this period.'}

══════════════════════════════════════════════════════════════
SECTION 8: VENUE PERFORMANCE
══════════════════════════════════════════════════════════════
Active Venues (with games run): ${activeVenues.length}
Scheduled-Only Venues (no games ran): ${scheduledOnlyVenues.length}

${JSON.stringify(venues.map(v => ({
  venueName: v.venueName,
  // Status
  hadScheduledGamesOnly: v.hadScheduledGamesOnly || false,
  // Financial (will be 0 for scheduled-only)
  totalProfit: v.totalProfit,
  totalRevenue: v.totalRevenue,
  // Volume
  gamesRun: v.gamesRun || v.totalGames || 0,
  gamesNotRun: v.gamesNotRun || 0,
  totalEntries: v.totalEntries,
  avgProfitPerGame: v.avgProfitPerGame,
  profitMargin: v.profitMargin,
  // Player metrics (NEW)
  totalUniquePlayers: v.totalUniquePlayers || 0,
  entriesPerPlayer: v.entriesPerPlayer || 0,
  // Trending
  profitTrendPercent: v.profitTrendPercent,
  entriesTrendPercent: v.entriesTrendPercent,
  uniquePlayersTrendPercent: v.uniquePlayersTrendPercent,
  entriesPerPlayerChange: v.entriesPerPlayerChange,
  // Health
  overallHealth: v.overallHealth,
  trendCategory: v.trendCategory,
  totalOverlayCost: v.totalOverlayCost,
  // Top/bottom games
  topGames: v.topGames?.slice(0, 2),
  bottomGames: v.bottomGames?.slice(0, 2),
  // Full games list (for detailed view)
  gamesList: v.gamesList || [],
  // Games not run details
  gamesNotRunDetails: v.gamesNotRunDetails?.slice(0, 3) || null
})), null, 2)}

══════════════════════════════════════════════════════════════
SECTION 9: ALERTS
══════════════════════════════════════════════════════════════
Alert Summary: ${alertSummary.total || 0} total (HIGH: ${alertSummary.bySeverity?.HIGH || 0}, MEDIUM: ${alertSummary.bySeverity?.MEDIUM || 0}, LOW: ${alertSummary.bySeverity?.LOW || 0})

TOP ALERTS:
${JSON.stringify(alerts.slice(0, 10), null, 2)}

══════════════════════════════════════════════════════════════
SECTION 10: RANKINGS
══════════════════════════════════════════════════════════════
Top Games by Profit: ${JSON.stringify(rankings.games?.topByProfit?.slice(0, 5) || [], null, 2)}
Loss-Making Games: ${JSON.stringify(rankings.games?.losses?.slice(0, 5) || [], null, 2)}
Day of Week Performance: ${JSON.stringify(rankings.dayOfWeek || [], null, 2)}
Game Type Performance: ${JSON.stringify(rankings.gameTypes || [], null, 2)}

══════════════════════════════════════════════════════════════
REQUIRED JSON OUTPUT
══════════════════════════════════════════════════════════════
{
  "weekSummary": {
    "headline": "One sentence: profit/loss amount + primary driver",
    "health": "EXCELLENT | GOOD | OK | CONCERNING | CRITICAL",
    "healthRationale": "Why this rating",
    "topWin": "Best thing this week with specific numbers",
    "topProblem": "Biggest issue with specific numbers",
    "vsLastWeek": "Better/Worse/Same with key difference"
  },
  
  "metrics": {
    "revenue": { "value": <number>, "change": <number>, "changePercent": <number>, "insight": "What drove this" },
    "profit": { "value": <number>, "change": <number>, "changePercent": <number>, "insight": "What drove this" },
    "margin": { "value": <number>, "change": <number>, "insight": "Margin health" },
    "entries": { "value": <number>, "change": <number>, "changePercent": <number>, "insight": "Player demand signal" },
    "gamesRun": { "value": <number>, "change": <number>, "insight": "Schedule execution" },
    "avgEntriesPerGame": { "value": <number>, "insight": "Game health indicator" }
  },
  
  "problemGames": [
    {
      "gameName": "Actual game name from data",
      "venueName": "Actual venue name",
      "date": "Game date",
      "profit": <number>,
      "entries": <number>,
      "issue": "OVERLAY | LOW_TURNOUT | HIGH_COSTS | CANCELLED",
      "details": "Specific numbers: overlay amount, expected vs actual entries, etc.",
      "fix": "Concrete action for next occurrence"
    }
  ],
  
  "winningGames": [
    {
      "gameName": "Actual game name",
      "venueName": "Actual venue name", 
      "profit": <number>,
      "entries": <number>,
      "margin": <number>,
      "successFactor": "Why it worked - be specific"
    }
  ],
  
  "overlayReport": {
    "totalOverlayCost": <number>,
    "gamesWithOverlay": <number>,
    "overlayAsPercentOfLoss": <number or null>,
    "avgCoverageRate": <number>,
    "worstOverlays": [
      { "gameName": "Name", "venueName": "Venue", "overlay": <number>, "guarantee": <number>, "entries": <number>, "coverageRate": <number> }
    ],
    "guaranteesNeedingReview": ["List specific games where guarantee should be adjusted"],
    "recommendation": "Specific guarantee adjustment recommendation"
  },
  
  "scheduleHealth": {
    "complianceRate": <number or null>,
    "cancellationRate": <number or null>,
    "gamesCancelled": <number>,
    "cancellationReasons": ["Top reasons for cancellations"],
    "atRiskGames": [
      { "gameName": "Name", "cancellationRate": <number>, "recommendation": "Keep/Remove/Reposition" }
    ],
    "recommendation": "Schedule health action"
  },
  
  "gamesNotRun": {
    "total": <number>,
    "breakdown": {
      "initiatingStale": <number>,
      "cancelled": <number>,
      "other": <number>
    },
    "byVenue": [
      { "venueName": "Name", "count": <number>, "reason": "Why games didn't run" }
    ],
    "operationalAssessment": "Analysis of why games didn't run - systemic issue or one-off?",
    "actionRequired": ["Specific actions to prevent this next week"]
  },
  
  "recurringGameHealth": {
    "summary": "Overall health of regular game lineup",
    "growing": [{ "gameName": "Name", "trend": "+X%", "action": "What to do" }],
    "declining": [{ "gameName": "Name", "trend": "-X%", "action": "What to do" }],
    "recommendation": "Game lineup action"
  },
  
  "venueQuickView": [
    {
      "venueName": "Actual venue name",
      "profit": <number>,
      "gamesRun": <number>,
      "gamesNotRun": <number or 0>,
      "hadScheduledGamesOnly": <boolean>,
      "avgProfitPerGame": <number>,
      "health": "EXCELLENT | GOOD | NEEDS_ATTENTION | CRITICAL | SCHEDULED_ONLY",
      "trend": "UPLIFT | STEADY | SOFTENING | AT_RISK | NO_DATA",
      "playerTrend": {
        "uniquePlayers": <number>,
        "uniquePlayersTrend": "<+/-X%> or null",
        "entriesPerPlayer": <number>,
        "assessment": "Growing | Stable | Needs attention"
      },
      "keyIssue": "Main issue or success factor (mention player trends if significant)",
      "oneAction": "Single most important action"
    }
  ],
  
  "competitorWatch": {
    "pressureLevel": "HIGH | MEDIUM | LOW | MINIMAL",
    "pressureScore": <number>,
    "directClashes": <number>,
    "impactedGames": ["Games affected by competitor clashes"],
    "competitorHighlights": ["Notable competitor activities"],
    "defensiveActions": ["How to respond"]
  },
  
  "opportunities": {
    "quickWins": [
      { "opportunity": "Description", "potentialImpact": "$X", "action": "Specific step", "deadline": "This week" }
    ],
    "scheduleGaps": ["Days/times that could add profitable games"],
    "expansionCandidates": ["Strong games that could run more often"]
  },
  
  "alerts": [
    {
      "priority": "CRITICAL | URGENT | HIGH | MEDIUM",
      "type": "Alert type from data",
      "title": "Short title",
      "description": "What's happening with numbers",
      "evidence": "Specific metrics",
      "action": "What to do",
      "deadline": "Today | Tomorrow | This week | Before next [game]",
      "owner": "Who should handle this"
    }
  ],
  
  "thisWeekActions": [
    {
      "priority": 1,
      "action": "Specific, actionable task",
      "rationale": "Why - with supporting data",
      "expectedImpact": "What it should achieve",
      "owner": "Operations | Marketing | Management",
      "deadline": "Specific day or 'Before X game'"
    }
  ],
  
  "nextWeekWatch": {
    "gamesAtRisk": [{ "game": "Name", "risk": "What could go wrong", "mitigation": "How to prevent" }],
    "opportunities": [{ "game": "Name", "opportunity": "Why it could do better", "action": "How to capitalize" }],
    "competitorEvents": ["Competitor events to monitor"],
    "focusAreas": ["Top 2-3 things to monitor"]
  }
}`;
}

/**
 * Get the JSON schema for OpenAI structured output
 * @returns {object}
 */
function getSchema() {
  return {
    name: 'weekly_ops_report_v3',
    strict: false,
    schema: {
      type: 'object',
      required: ['weekSummary', 'metrics', 'problemGames', 'overlayReport', 'alerts', 'thisWeekActions'],
      properties: {
        weekSummary: { type: 'object' },
        metrics: { type: 'object' },
        problemGames: { type: 'array' },
        winningGames: { type: 'array' },
        overlayReport: { type: 'object' },
        scheduleHealth: { type: 'object' },
        gamesNotRun: { type: 'object' },
        recurringGameHealth: { type: 'object' },
        venueQuickView: { type: 'array' },
        competitorWatch: { type: 'object' },
        opportunities: { type: 'object' },
        alerts: { type: 'array' },
        thisWeekActions: { type: 'array' },
        nextWeekWatch: { type: 'object' },
      },
    },
  };
}

module.exports = {
  build,
  getSchema,
};