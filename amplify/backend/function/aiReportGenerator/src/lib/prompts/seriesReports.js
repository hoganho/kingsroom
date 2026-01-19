/**
 * Series Report Prompt Templates
 * Pre-series, Mid-series, and Post-series reports
 * 
 * VERSION: 2.0.0 - Updated for MetricsPack v4
 * 
 * Now properly uses seriesLifecycle data:
 * - SERIES_PRE: Uses seriesLifecycle.upcoming[]
 * - SERIES_MID: Uses seriesLifecycle.active[] with progress tracking
 * - SERIES_POST: Uses seriesLifecycle.recentlyCompleted[] with metrics
 */

// ============================================================
// SERIES PRE REPORT
// ============================================================

const seriesPre = {
  build(metricsPack, options = {}) {
    const systemPrompt = `You are an expert poker tournament analyst generating a pre-series preparation report. This report helps operations teams prepare for an upcoming tournament series.

OUTPUT FORMAT: Valid JSON only. No markdown, no text outside JSON.

FOCUS AREAS:
1. READINESS - Is everything in place for a successful series?
2. BENCHMARKS - What are the targets based on historical performance?
3. COMPETITIVE LANDSCAPE - What competitor events overlap?
4. RISKS - What could go wrong and how to mitigate?
5. MARKETING - Is promotional activity sufficient?
6. OPERATIONS - Are staffing and logistics sorted?

TONE: Practical and action-oriented. This is a working document for the ops team.

RULES:
- Use ONLY data provided - never invent figures
- Currency in AUD ($X,XXX format)
- Be specific about dates, venues, and buy-ins
- Flag any data gaps that need manual verification`;

    const { packData, periodLabel } = metricsPack;
    const data = typeof packData === 'string' ? JSON.parse(packData) : packData;
    
    // Extract series-specific data
    const seriesLifecycle = data.seriesLifecycle || {};
    const competitorAnalysis = data.competitorAnalysis || {};
    const recurringGameTrends = data.recurringGameTrends || {};
    const venues = data.venues || [];
    const s = data.strategic || {};
    
    // Find the relevant upcoming series
    const upcomingSeries = seriesLifecycle.upcoming || [];

    const userPrompt = `Generate a Pre-Series Preparation Report for: ${periodLabel}

════════════════════════════════════════════════════════════════════════════════
SECTION 1: UPCOMING SERIES DATA
════════════════════════════════════════════════════════════════════════════════
${seriesLifecycle.hasSeriesData ? `
Total Upcoming Series (within 60 days): ${seriesLifecycle.summary?.upcomingSeries || 0}

UPCOMING SERIES DETAILS:
${JSON.stringify(upcomingSeries, null, 2)}
` : '⚠️ No series lifecycle data available. Series details may need manual input.'}

════════════════════════════════════════════════════════════════════════════════
SECTION 2: HISTORICAL PERFORMANCE (Baseline for Targets)
════════════════════════════════════════════════════════════════════════════════
Recent Period Performance:
- Total Revenue: $${(s.totalRevenue || 0).toLocaleString()}
- Net Profit: $${(s.netProfit || 0).toLocaleString()}
- Profit Margin: ${(s.profitMargin || 0).toFixed(1)}%
- Total Entries: ${s.totalEntries || 0}
- Unique Players: ${s.totalUniquePlayers || 0}
- Avg Entries per Game: ${(s.avgEntriesPerGame || 0).toFixed(1)}

Guarantee Performance:
- Avg Coverage Rate: ${(s.avgGuaranteeCoverageRate || 0).toFixed(1)}%
- Overlay Cost: $${(s.overlayCost || 0).toLocaleString()}

════════════════════════════════════════════════════════════════════════════════
SECTION 3: VENUE READINESS
════════════════════════════════════════════════════════════════════════════════
${JSON.stringify(venues.map(v => ({
  venueName: v.venueName,
  recentProfit: v.totalProfit,
  recentGames: v.totalGames,
  avgEntriesPerGame: v.avgEntriesPerGame,
  overallHealth: v.overallHealth,
  avgCoverageRate: v.avgCoverageRate
})), null, 2)}

════════════════════════════════════════════════════════════════════════════════
SECTION 4: COMPETITIVE LANDSCAPE
════════════════════════════════════════════════════════════════════════════════
${competitorAnalysis.hasCompetitorData ? `
Competitive Pressure: ${competitorAnalysis.pressure?.level || 'UNKNOWN'} (Score: ${competitorAnalysis.pressure?.score || 0}/10)
Activity Trend: ${competitorAnalysis.trends?.trend || 'UNKNOWN'}

POTENTIAL SCHEDULING CONFLICTS:
${JSON.stringify(competitorAnalysis.recentCompetitorEvents || [], null, 2)}

HIGH GUARANTEE COMPETITOR EVENTS (Threats):
${JSON.stringify(competitorAnalysis.highGuaranteeEvents || [], null, 2)}

TOP COMPETITORS:
${JSON.stringify(competitorAnalysis.topCompetitors || [], null, 2)}
` : '⚠️ Competitor data not available. Manual market research recommended.'}

════════════════════════════════════════════════════════════════════════════════
SECTION 5: RECURRING GAME INSIGHTS (Satellite/Feeder Performance)
════════════════════════════════════════════════════════════════════════════════
${recurringGameTrends.hasRecurringGameData ? `
Strong Brands (Reliable Feeders):
${JSON.stringify(recurringGameTrends.strongBrands?.slice(0, 5) || [], null, 2)}

Growing Games (Momentum):
${JSON.stringify(recurringGameTrends.growingGames?.slice(0, 5) || [], null, 2)}

Top Performers:
${JSON.stringify(recurringGameTrends.topPerformers?.slice(0, 5) || [], null, 2)}
` : 'Recurring game data not available.'}

════════════════════════════════════════════════════════════════════════════════
REQUIRED JSON OUTPUT
════════════════════════════════════════════════════════════════════════════════
{
  "seriesOverview": {
    "seriesName": "Series name or 'TBD - Requires Input'",
    "venue": "Primary venue",
    "dates": { "start": "Start date", "end": "End date" },
    "totalEvents": <number>,
    "flagshipEvent": "Main event description with buy-in and guarantee",
    "totalGuarantees": <number>,
    "dataConfidence": "HIGH | MEDIUM | LOW - based on available data"
  },
  
  "targets": {
    "methodology": "How targets were derived",
    "totalEntries": { "target": <number>, "basis": "How calculated" },
    "totalRevenue": { "target": <number>, "basis": "How calculated" },
    "totalProfit": { "target": <number>, "basis": "How calculated" },
    "uniquePlayers": { "target": <number>, "basis": "How calculated" },
    "coverageRate": { "target": <number>, "basis": "How calculated" }
  },
  
  "readinessChecklist": [
    {
      "category": "STAFFING | MARKETING | LOGISTICS | SYSTEMS | COMPLIANCE | VENUE",
      "item": "Checklist item",
      "status": "COMPLETE | IN_PROGRESS | NOT_STARTED | AT_RISK | UNKNOWN",
      "owner": "Responsible person/team",
      "dueDate": "When needed",
      "notes": "Context or blockers"
    }
  ],
  
  "competitorAnalysis": {
    "pressureLevel": "HIGH | MEDIUM | LOW",
    "conflictingEvents": [
      { "competitor": "Name", "event": "Event", "dates": "Dates", "buyIn": <number>, "guarantee": <number>, "threatLevel": "HIGH | MEDIUM | LOW" }
    ],
    "marketConditions": "Assessment",
    "defensiveActions": ["How to respond to competition"]
  },
  
  "riskAssessment": [
    {
      "risk": "Risk description",
      "category": "OPERATIONAL | FINANCIAL | COMPETITIVE | WEATHER | STAFFING",
      "likelihood": "LOW | MEDIUM | HIGH",
      "impact": "LOW | MEDIUM | HIGH",
      "financialExposure": "$X potential loss",
      "mitigation": "Prevention strategy",
      "contingency": "If it happens, do this"
    }
  ],
  
  "marketingRecommendations": {
    "currentAssessment": "Marketing readiness assessment",
    "targetAudience": "Who to focus on",
    "channels": [
      { "channel": "Channel name", "priority": "HIGH | MEDIUM | LOW", "action": "What to do" }
    ],
    "keyMessages": ["Core marketing messages"],
    "timeline": [
      { "week": "Week -X", "actions": ["Marketing actions"] }
    ]
  },
  
  "operationalPlan": {
    "staffingNeeds": "Assessment of staffing requirements",
    "equipmentChecklist": ["Equipment needed"],
    "venueSetup": "Venue preparation requirements",
    "registrationProcess": "How registration will work",
    "contingencies": ["Backup plans"]
  },
  
  "keyActions": [
    {
      "action": "Specific action",
      "owner": "Who",
      "deadline": "When",
      "priority": "CRITICAL | HIGH | MEDIUM",
      "dependencies": "What must happen first"
    }
  ],
  
  "successCriteria": [
    { "metric": "What to measure", "target": "Target value", "measurement": "How to track" }
  ],
  
  "dataGaps": [
    "Information that needs to be gathered manually"
  ]
}`;

    return { systemPrompt, userPrompt };
  },
  
  getSchema() {
    return {
      name: 'series_pre_report_v2',
      strict: false,
      schema: { type: 'object' },
    };
  },
};

// ============================================================
// SERIES MID REPORT
// ============================================================

const seriesMid = {
  build(metricsPack, options = {}) {
    const systemPrompt = `You are an expert poker tournament analyst generating a mid-series progress report. This report enables real-time adjustments during an ongoing tournament series.

OUTPUT FORMAT: Valid JSON only. No markdown, no text outside JSON.

FOCUS AREAS:
1. PACE vs PLAN - Are we on track? Quantify the gap.
2. EVENT PERFORMANCE - Which events exceeded/missed targets?
3. CONVERSION FUNNEL - Satellites feeding main events?
4. OPERATIONAL ISSUES - What's gone wrong and how to fix?
5. REMAINING EVENTS - Adjustments for what's left
6. COMPETITOR RESPONSE - Are they affecting our numbers?

TONE: Urgent but measured. Real-time decision support.

RULES:
- Use ONLY data provided
- Currency in AUD
- Focus on actionable insights
- Quantify variances in $ and %`;

    const { packData, periodLabel } = metricsPack;
    const data = typeof packData === 'string' ? JSON.parse(packData) : packData;
    
    // Extract all relevant data
    const seriesLifecycle = data.seriesLifecycle || {};
    const competitorAnalysis = data.competitorAnalysis || {};
    const s = data.strategic || {};
    const venues = data.venues || [];
    const alerts = data.alerts || [];
    
    // Find active series with progress data
    const activeSeries = seriesLifecycle.active || [];

    const userPrompt = `Generate a Mid-Series Progress Report for: ${periodLabel}

════════════════════════════════════════════════════════════════════════════════
SECTION 1: ACTIVE SERIES STATUS
════════════════════════════════════════════════════════════════════════════════
${seriesLifecycle.hasSeriesData && activeSeries.length > 0 ? `
ACTIVE SERIES WITH PROGRESS:
${JSON.stringify(activeSeries.map(s => ({
  seriesName: s.seriesName,
  phase: s.phase,
  eventsCompleted: s.eventsCompleted,
  eventsPlanned: s.eventsPlanned,
  eventsRemaining: s.eventsRemaining,
  eventProgress: s.eventProgress,
  actualPrizepool: s.actualPrizepool,
  guaranteedPrizepool: s.guaranteedPrizepool,
  estimatedPrizepool: s.estimatedPrizepool,
  prizepoolProgress: s.prizepoolProgress,
  progressStatus: s.progressStatus,
  totalEntries: s.totalEntries,
  avgEntriesPerEvent: s.avgEntriesPerEvent,
  metrics: s.metrics
})), null, 2)}
` : '⚠️ No active series data available. Progress tracking requires series setup.'}

════════════════════════════════════════════════════════════════════════════════
SECTION 2: PERIOD PERFORMANCE (Series Period)
════════════════════════════════════════════════════════════════════════════════
Revenue: $${(s.totalRevenue || 0).toLocaleString()}
Profit: $${(s.netProfit || 0).toLocaleString()}
Margin: ${(s.profitMargin || 0).toFixed(1)}%
Games Run: ${s.totalGamesRun || 0}
Total Entries: ${s.totalEntries || 0}
Unique Players: ${s.totalUniquePlayers || 0}
Avg Entries/Game: ${(s.avgEntriesPerGame || 0).toFixed(1)}

Guarantee Performance:
- Coverage Rate: ${(s.avgGuaranteeCoverageRate || 0).toFixed(1)}%
- Overlay Cost: $${(s.overlayCost || 0).toLocaleString()}

════════════════════════════════════════════════════════════════════════════════
SECTION 3: VENUE PERFORMANCE (Series Venues)
════════════════════════════════════════════════════════════════════════════════
${JSON.stringify(venues.map(v => ({
  venueName: v.venueName,
  profit: v.totalProfit,
  games: v.totalGames,
  entries: v.totalEntries,
  avgEntriesPerGame: v.avgEntriesPerGame,
  health: v.overallHealth,
  topGames: v.topGames?.slice(0, 3),
  bottomGames: v.bottomGames?.slice(0, 3)
})), null, 2)}

════════════════════════════════════════════════════════════════════════════════
SECTION 4: COMPETITIVE IMPACT
════════════════════════════════════════════════════════════════════════════════
${competitorAnalysis.hasCompetitorData ? `
Pressure Level: ${competitorAnalysis.pressure?.level || 'UNKNOWN'}
Direct Clashes: ${competitorAnalysis.summary?.directCompetitionClashes || 0}

CLASH IMPACT ON OUR EVENTS:
${JSON.stringify(competitorAnalysis.clashes?.high || [], null, 2)}

COMPETITOR EVENTS DURING SERIES:
${JSON.stringify(competitorAnalysis.recentCompetitorEvents?.slice(0, 10) || [], null, 2)}
` : 'Competitor data not available.'}

════════════════════════════════════════════════════════════════════════════════
SECTION 5: ALERTS & ISSUES
════════════════════════════════════════════════════════════════════════════════
${JSON.stringify(alerts.slice(0, 15), null, 2)}

════════════════════════════════════════════════════════════════════════════════
REQUIRED JSON OUTPUT
════════════════════════════════════════════════════════════════════════════════
{
  "seriesStatus": {
    "seriesName": "Name",
    "currentDay": "Day X of Y",
    "eventsCompleted": <number>,
    "eventsRemaining": <number>,
    "overallStatus": "AHEAD | ON_TRACK | SLIGHTLY_BEHIND | SIGNIFICANTLY_BEHIND | AT_RISK",
    "statusRationale": "Why this status"
  },
  
  "paceVsPlan": {
    "attendance": {
      "actual": <number>,
      "projected": <number>,
      "variance": <number>,
      "variancePercent": <number>,
      "trend": "IMPROVING | STABLE | DECLINING",
      "analysis": "What's driving attendance"
    },
    "revenue": {
      "actual": <number>,
      "projected": <number>,
      "variance": <number>,
      "variancePercent": <number>,
      "analysis": "Revenue drivers"
    },
    "profit": {
      "actual": <number>,
      "projected": <number>,
      "variance": <number>,
      "analysis": "Profit drivers"
    },
    "prizepool": {
      "actual": <number>,
      "guaranteed": <number>,
      "coverage": <number>,
      "overlayRisk": "HIGH | MEDIUM | LOW | NONE"
    }
  },
  
  "eventHighlights": {
    "exceeded": [
      { "eventName": "Name", "entries": <number>, "vsTarget": "+X%", "profit": <number>, "successFactor": "Why it worked" }
    ],
    "missed": [
      { "eventName": "Name", "entries": <number>, "vsTarget": "-X%", "profit": <number>, "issue": "What went wrong", "lesson": "Learning" }
    ],
    "upcoming": [
      { "eventName": "Name", "date": "Date", "preRegistrations": <number>, "outlook": "Assessment" }
    ]
  },
  
  "conversionAnalysis": {
    "satellitePerformance": {
      "totalSatellites": <number>,
      "totalSatelliteEntries": <number>,
      "avgEntriesPerSatellite": <number>,
      "assessment": "Satellite health"
    },
    "mainEventFeeding": {
      "targetQualifiers": <number>,
      "actualQualifiers": <number>,
      "conversionRate": <number>,
      "directBuyins": <number>
    },
    "funnelHealth": "STRONG | ADEQUATE | WEAK",
    "recommendations": ["Satellite/feeder adjustments"]
  },
  
  "operationalIssues": [
    {
      "issue": "What happened",
      "severity": "CRITICAL | HIGH | MEDIUM | LOW",
      "impact": "Effect on series",
      "resolution": "How handled",
      "prevention": "Avoid repeat for remaining events"
    }
  ],
  
  "competitorImpact": {
    "clashesIdentified": <number>,
    "estimatedAttendanceLoss": <number>,
    "affectedEvents": ["Events impacted"],
    "defensiveActions": ["What we did/should do"]
  },
  
  "adjustments": [
    {
      "area": "MARKETING | STAFFING | SCHEDULE | PRICING | GUARANTEES | OPERATIONS",
      "adjustment": "Specific change",
      "rationale": "Why, with data",
      "expectedImpact": "What it should achieve",
      "implementBy": "When - be specific"
    }
  ],
  
  "remainingEventsOutlook": {
    "keyEvents": [
      { "eventName": "Name", "date": "Date", "currentOutlook": "Assessment", "keyRisk": "Main risk", "keyAction": "Priority action" }
    ],
    "projectedFinalNumbers": {
      "totalEntries": <number>,
      "totalRevenue": <number>,
      "totalProfit": <number>,
      "prizepoolTotal": <number>,
      "projectedOverlay": <number>
    },
    "confidenceLevel": "HIGH | MEDIUM | LOW"
  },
  
  "immediateActions": [
    {
      "action": "Specific task",
      "owner": "Who",
      "deadline": "When (hours/days)",
      "priority": "CRITICAL | URGENT | HIGH",
      "expectedOutcome": "What success looks like"
    }
  ],
  
  "communicationPoints": {
    "forTeam": ["Key messages for operations team"],
    "forMarketing": ["Key messages for marketing"],
    "forStakeholders": ["Key messages for executives/board"]
  }
}`;

    return { systemPrompt, userPrompt };
  },
  
  getSchema() {
    return {
      name: 'series_mid_report_v2',
      strict: false,
      schema: { type: 'object' },
    };
  },
};

// ============================================================
// SERIES POST REPORT
// ============================================================

const seriesPost = {
  build(metricsPack, options = {}) {
    const systemPrompt = `You are an expert poker tournament analyst generating a post-series retrospective report. This report captures learnings and informs future series planning.

OUTPUT FORMAT: Valid JSON only. No markdown, no text outside JSON.

FOCUS AREAS:
1. RESULTS vs TARGETS - How did we actually perform?
2. ROOT CAUSE ANALYSIS - What drove success/failure?
3. LEARNINGS - What should we do differently?
4. PLAYER INSIGHTS - What did we learn about our audience?
5. FINANCIAL ANALYSIS - Complete P&L with ROI
6. RECOMMENDATIONS - Concrete changes for next series

TONE: Reflective and constructive. Honest about failures, celebrate successes.

RULES:
- Use ONLY data provided
- Currency in AUD
- Be specific about what worked and what didn't
- Recommendations must be actionable`;

    const { packData, periodLabel } = metricsPack;
    const data = typeof packData === 'string' ? JSON.parse(packData) : packData;
    
    // Extract all relevant data
    const seriesLifecycle = data.seriesLifecycle || {};
    const s = data.strategic || {};
    const venues = data.venues || [];
    const playerInsights = data.playerInsights || {};
    const rankings = data.rankings || {};
    const competitorAnalysis = data.competitorAnalysis || {};
    
    // Find completed series with metrics
    const completedSeries = seriesLifecycle.recentlyCompleted || [];

    const userPrompt = `Generate a Post-Series Retrospective Report for: ${periodLabel}

════════════════════════════════════════════════════════════════════════════════
SECTION 1: COMPLETED SERIES DATA
════════════════════════════════════════════════════════════════════════════════
${seriesLifecycle.hasSeriesData && completedSeries.length > 0 ? `
RECENTLY COMPLETED SERIES:
${JSON.stringify(completedSeries.map(s => ({
  seriesName: s.seriesName,
  startDate: s.startDate,
  endDate: s.endDate,
  daysSinceEnd: s.daysSinceEnd,
  numberOfEvents: s.numberOfEvents,
  actualPrizepool: s.actualPrizepool,
  guaranteedPrizepool: s.guaranteedPrizepool,
  metrics: s.metrics
})), null, 2)}
` : '⚠️ No completed series data with metrics. Using period performance as proxy.'}

════════════════════════════════════════════════════════════════════════════════
SECTION 2: FINANCIAL PERFORMANCE
════════════════════════════════════════════════════════════════════════════════
Revenue: $${(s.totalRevenue || 0).toLocaleString()}
Total Costs: $${(s.totalCost || 0).toLocaleString()}
Net Profit: $${(s.netProfit || 0).toLocaleString()}
Profit Margin: ${(s.profitMargin || 0).toFixed(1)}%

Cost Breakdown:
- Staff: $${(s.staffCost || 0).toLocaleString()}
- Dealers: $${(s.dealerCost || 0).toLocaleString()}
- Venue: $${(s.venueRentalCost || 0).toLocaleString()}
- Marketing: $${(s.marketingCost || 0).toLocaleString()}
- Overlay: $${(s.overlayCost || 0).toLocaleString()}
- Other: $${(s.otherCost || 0).toLocaleString()}

Revenue Breakdown:
- Rake: $${(s.rakeRevenue || 0).toLocaleString()}
- Venue Fees: $${(s.venueFeeRevenue || 0).toLocaleString()}
- Other: $${(s.otherRevenue || 0).toLocaleString()}

Prizepool:
- Total Generated: $${(s.totalPrizepool || 0).toLocaleString()}
- Average per Event: $${(s.avgPrizepool || 0).toLocaleString()}
- Surplus: $${(s.prizepoolSurplus || 0).toLocaleString()}

════════════════════════════════════════════════════════════════════════════════
SECTION 3: VOLUME METRICS
════════════════════════════════════════════════════════════════════════════════
Events Run: ${s.totalGamesRun || 0}
Total Entries: ${s.totalEntries || 0}
Rebuys: ${s.rebuys || 0}
Add-ons: ${s.addons || 0}
Unique Players: ${s.totalUniquePlayers || 0}
Avg Entries per Event: ${(s.avgEntriesPerGame || 0).toFixed(1)}
Entries per Player: ${(s.entriesPerPlayer || 0).toFixed(2)}

vs Prior Period:
- Entries: ${s.entriesGrowthPercent >= 0 ? '+' : ''}${(s.entriesGrowthPercent || 0).toFixed(1)}%
- Players: ${s.playerGrowthPercent >= 0 ? '+' : ''}${(s.playerGrowthPercent || 0).toFixed(1)}%
- Revenue: ${s.revenueGrowthPercent >= 0 ? '+' : ''}${(s.revenueGrowthPercent || 0).toFixed(1)}%
- Profit: ${s.profitGrowthPercent >= 0 ? '+' : ''}${(s.profitGrowthPercent || 0).toFixed(1)}%

════════════════════════════════════════════════════════════════════════════════
SECTION 4: PLAYER INSIGHTS
════════════════════════════════════════════════════════════════════════════════
${JSON.stringify(playerInsights, null, 2)}

════════════════════════════════════════════════════════════════════════════════
SECTION 5: VENUE PERFORMANCE
════════════════════════════════════════════════════════════════════════════════
${JSON.stringify(venues.map(v => ({
  venueName: v.venueName,
  profit: v.totalProfit,
  revenue: v.totalRevenue,
  margin: v.profitMargin,
  events: v.totalGames,
  entries: v.totalEntries,
  avgEntriesPerGame: v.avgEntriesPerGame,
  overlayCost: v.totalOverlayCost,
  health: v.overallHealth,
  topGames: v.topGames,
  bottomGames: v.bottomGames
})), null, 2)}

════════════════════════════════════════════════════════════════════════════════
SECTION 6: EVENT RANKINGS
════════════════════════════════════════════════════════════════════════════════
Top Events by Profit:
${JSON.stringify(rankings.games?.topByProfit || [], null, 2)}

Loss-Making Events:
${JSON.stringify(rankings.games?.losses || [], null, 2)}

By Event Type:
${JSON.stringify(rankings.gameTypes || [], null, 2)}

By Day of Week:
${JSON.stringify(rankings.dayOfWeek || [], null, 2)}

════════════════════════════════════════════════════════════════════════════════
SECTION 7: COMPETITIVE CONTEXT
════════════════════════════════════════════════════════════════════════════════
${competitorAnalysis.hasCompetitorData ? `
Competitive Pressure During Series: ${competitorAnalysis.pressure?.level || 'UNKNOWN'}
Direct Clashes: ${competitorAnalysis.summary?.directCompetitionClashes || 0}

Clash Details:
${JSON.stringify(competitorAnalysis.clashes?.high || [], null, 2)}
` : 'Competitor data not available.'}

════════════════════════════════════════════════════════════════════════════════
REQUIRED JSON OUTPUT
════════════════════════════════════════════════════════════════════════════════
{
  "seriesSummary": {
    "seriesName": "Name",
    "venue": "Primary venue",
    "dates": { "start": "Date", "end": "Date", "totalDays": <number> },
    "totalEvents": <number>,
    "overallVerdict": "EXCEEDED_EXPECTATIONS | MET_EXPECTATIONS | BELOW_EXPECTATIONS | DISAPPOINTING",
    "headlineResult": "One sentence: profit/loss + key driver",
    "dataConfidence": "HIGH | MEDIUM | LOW"
  },
  
  "resultsVsTargets": {
    "entries": { "actual": <number>, "target": <number or null>, "variance": <number>, "assessment": "Met/Exceeded/Missed" },
    "revenue": { "actual": <number>, "target": <number or null>, "variance": <number>, "assessment": "Met/Exceeded/Missed" },
    "profit": { "actual": <number>, "target": <number or null>, "variance": <number>, "assessment": "Met/Exceeded/Missed" },
    "uniquePlayers": { "actual": <number>, "target": <number or null>, "variance": <number>, "assessment": "Met/Exceeded/Missed" },
    "prizepool": { "actual": <number>, "guaranteed": <number>, "surplus": <number>, "overlay": <number> },
    "overallAssessment": "Summary of performance vs expectations"
  },
  
  "eventBreakdown": {
    "totalEvents": <number>,
    "exceededTarget": <number>,
    "metTarget": <number>,
    "missedTarget": <number>,
    "topEvents": [
      { "eventName": "Name", "entries": <number>, "profit": <number>, "successFactors": ["Why it worked"] }
    ],
    "bottomEvents": [
      { "eventName": "Name", "entries": <number>, "profit": <number>, "issues": ["What went wrong"], "lessons": ["What we learned"] }
    ]
  },
  
  "financialAnalysis": {
    "grossRevenue": <number>,
    "totalCosts": <number>,
    "netProfit": <number>,
    "profitMargin": <number>,
    "costBreakdown": {
      "staffing": { "amount": <number>, "percentOfCost": <number>, "assessment": "Appropriate/High/Low" },
      "marketing": { "amount": <number>, "percentOfCost": <number>, "roi": "Assessment" },
      "venue": { "amount": <number>, "percentOfCost": <number>, "assessment": "Appropriate/High/Low" },
      "overlay": { "amount": <number>, "percentOfCost": <number>, "assessment": "Acceptable/Concerning/Critical" }
    },
    "revenuePerEntry": <number>,
    "costPerEntry": <number>,
    "profitPerEntry": <number>,
    "roiAnalysis": "Return on investment assessment"
  },
  
  "playerAnalysis": {
    "totalUniquePlayers": <number>,
    "newPlayers": <number>,
    "newPlayerPercent": <number>,
    "returningPlayers": <number>,
    "retentionRate": <number or null>,
    "avgEntriesPerPlayer": <number>,
    "topPlayerSegments": ["Key player segments"],
    "acquisitionInsights": "Where players came from",
    "recommendations": ["Player-focused recommendations"]
  },
  
  "competitiveAnalysis": {
    "marketContext": "Competitive environment during series",
    "clashImpact": "Effect of competitor events",
    "lessonsLearned": ["Competitive learnings"],
    "defensiveSuccesses": ["What worked against competition"],
    "futureThreats": ["Competitive threats to address"]
  },
  
  "whatWorked": [
    {
      "item": "What worked",
      "evidence": "Data supporting this",
      "impact": "Quantified impact",
      "recommendation": "Do more of this"
    }
  ],
  
  "whatDidntWork": [
    {
      "item": "What didn't work",
      "evidence": "Data supporting this",
      "rootCause": "Why it failed",
      "impact": "Quantified impact",
      "recommendation": "How to fix"
    }
  ],
  
  "recommendations": [
    {
      "category": "SCHEDULE | PRICING | MARKETING | OPERATIONS | FORMAT | STAFFING | GUARANTEES",
      "recommendation": "Specific recommendation",
      "rationale": "Why, based on data",
      "expectedImpact": "$ or % improvement",
      "priority": "CRITICAL | HIGH | MEDIUM | LOW",
      "timeline": "Next series | 3 months | 6 months"
    }
  ],
  
  "nextSeriesPlanning": {
    "suggestedDates": "Recommended dates",
    "dateRationale": "Why these dates",
    "formatChanges": [
      { "change": "What to change", "rationale": "Why" }
    ],
    "guaranteeAdjustments": [
      { "event": "Event type", "current": <number>, "recommended": <number>, "rationale": "Why" }
    ],
    "budgetGuidance": {
      "marketing": "Recommended budget",
      "staffing": "Recommended budget",
      "overall": "Total budget guidance"
    },
    "keyFocusAreas": ["Top 3 priorities for next series"]
  },
  
  "executiveSummary": {
    "oneLineResult": "Single sentence summary",
    "keyWins": ["Top 3 successes"],
    "keyLearnings": ["Top 3 learnings"],
    "topRecommendations": ["Top 3 recommendations for next time"]
  }
}`;

    return { systemPrompt, userPrompt };
  },
  
  getSchema() {
    return {
      name: 'series_post_report_v2',
      strict: false,
      schema: { type: 'object' },
    };
  },
};

module.exports = {
  seriesPre,
  seriesMid,
  seriesPost,
};
