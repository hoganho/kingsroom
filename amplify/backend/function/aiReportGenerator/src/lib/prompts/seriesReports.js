/**
 * Series Report Prompt Templates
 * Pre-series, Mid-series, and Post-series reports
 */

// ============================================================
// SERIES PRE REPORT
// ============================================================

const seriesPre = {
  build(metricsPack, options = {}) {
    const systemPrompt = `You are an expert poker tournament analyst generating a pre-series preparation report. This report helps operations teams prepare for an upcoming tournament series.

Focus on:
1. READINESS - Is everything in place for a successful series?
2. BENCHMARKS - What are the targets and how do they compare to prior years?
3. RISKS - What could go wrong and how to mitigate?
4. MARKETING - Is the promotional plan adequate?
5. OPERATIONS - Are staffing and logistics sorted?

Your response MUST be valid JSON. No text outside the JSON object.

TONE: Practical and action-oriented. This is a working document for the team, not a board presentation.`;

    const { packData, periodLabel } = metricsPack;
    const data = typeof packData === 'string' ? JSON.parse(packData) : packData;

    const userPrompt = `Generate a Pre-Series Report for: ${periodLabel}

=== SERIES DATA ===
${JSON.stringify(data, null, 2)}
=== END DATA ===

Generate JSON with this structure:

{
  "seriesOverview": {
    "seriesName": "Name",
    "venue": "Location",
    "dates": { "start": "date", "end": "date" },
    "totalEvents": <number>,
    "flagshipEvent": "Main event name and details",
    "totalGuarantees": <number>
  },
  
  "targets": {
    "totalEntries": { "target": <number>, "priorYear": <number>, "growthTarget": <percent> },
    "totalRevenue": { "target": <number>, "priorYear": <number>, "growthTarget": <percent> },
    "totalProfit": { "target": <number>, "priorYear": <number> },
    "uniquePlayers": { "target": <number>, "priorYear": <number> }
  },
  
  "readinessChecklist": [
    {
      "category": "STAFFING | MARKETING | LOGISTICS | SYSTEMS | COMPLIANCE",
      "item": "Checklist item",
      "status": "COMPLETE | IN_PROGRESS | NOT_STARTED | AT_RISK",
      "owner": "Responsible person/team",
      "dueDate": "When it needs to be done",
      "notes": "Additional context"
    }
  ],
  
  "riskAssessment": [
    {
      "risk": "Risk description",
      "likelihood": "LOW | MEDIUM | HIGH",
      "impact": "LOW | MEDIUM | HIGH",
      "mitigation": "How to prevent or respond",
      "contingency": "Backup plan if it happens"
    }
  ],
  
  "competitorWatch": {
    "conflictingEvents": [
      { "competitor": "Name", "event": "Event", "dates": "Dates", "estimatedImpact": "Impact" }
    ],
    "marketConditions": "Assessment of market state"
  },
  
  "marketingStatus": {
    "campaignSummary": "Overview of marketing plan",
    "channelBreakdown": [
      { "channel": "Channel name", "budget": <number>, "status": "Status", "expectedReach": "Reach" }
    ],
    "earlyBirdStatus": { "deadline": "Date", "currentSignups": <number>, "targetSignups": <number> }
  },
  
  "keyActions": [
    {
      "action": "What needs to happen",
      "owner": "Who",
      "deadline": "When",
      "priority": "CRITICAL | HIGH | MEDIUM"
    }
  ],
  
  "successCriteria": [
    "What success looks like for this series"
  ]
}`;

    return { systemPrompt, userPrompt };
  },
  
  getSchema() {
    return {
      name: 'series_pre_report',
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
    const systemPrompt = `You are an expert poker tournament analyst generating a mid-series progress report. This report helps teams make real-time adjustments during an ongoing tournament series.

Focus on:
1. PACE - Are we on track vs targets?
2. VARIANCES - What's different from plan and why?
3. ADJUSTMENTS - What changes should be made right now?
4. MOMENTUM - Is energy building or flagging?
5. CONVERSION - Are satellites feeding the main events?

Your response MUST be valid JSON. No text outside the JSON object.

TONE: Urgent but not panicked. Real-time decision support.`;

    const { packData, periodLabel } = metricsPack;
    const data = typeof packData === 'string' ? JSON.parse(packData) : packData;

    const userPrompt = `Generate a Mid-Series Report for: ${periodLabel}

=== SERIES DATA ===
${JSON.stringify(data, null, 2)}
=== END DATA ===

Generate JSON with this structure:

{
  "seriesStatus": {
    "seriesName": "Name",
    "dayNumber": <number>,
    "eventsCompleted": <number>,
    "eventsRemaining": <number>,
    "overallStatus": "AHEAD | ON_TRACK | BEHIND | AT_RISK"
  },
  
  "paceVsPlan": {
    "attendance": {
      "actual": <number>,
      "projected": <number>,
      "variance": <number>,
      "variancePercent": <number>,
      "trend": "Improving | Stable | Declining"
    },
    "revenue": {
      "actual": <number>,
      "projected": <number>,
      "variance": <number>,
      "variancePercent": <number>
    },
    "analysis": "What's driving the variance"
  },
  
  "eventHighlights": [
    {
      "eventName": "Name",
      "result": "EXCEEDED | MET | MISSED",
      "entries": <number>,
      "entriesVsTarget": <number>,
      "highlight": "Notable aspect"
    }
  ],
  
  "conversionFunnel": {
    "satelliteEntries": <number>,
    "satelliteConversions": <number>,
    "conversionRate": <percent>,
    "directBuyins": <number>,
    "analysis": "Funnel health assessment"
  },
  
  "operationalIssues": [
    {
      "issue": "What happened",
      "impact": "Effect on series",
      "resolution": "How it was/is being handled",
      "preventionForRemaining": "How to avoid repeat"
    }
  ],
  
  "adjustments": [
    {
      "area": "MARKETING | STAFFING | SCHEDULE | PRICING | OPERATIONS",
      "adjustment": "What to change",
      "rationale": "Why",
      "expectedImpact": "What it should achieve",
      "implementBy": "When"
    }
  ],
  
  "remainingEventsOutlook": {
    "flagshipEventStatus": "Preview of main event readiness",
    "projectedFinalNumbers": {
      "entries": <number>,
      "revenue": <number>,
      "profit": <number>
    },
    "keyRisks": ["Remaining risks"],
    "keyOpportunities": ["Opportunities to capture"]
  },
  
  "immediateActions": [
    {
      "action": "Do this now",
      "owner": "Who",
      "deadline": "When (be specific - hours/days)",
      "priority": "CRITICAL | HIGH"
    }
  ]
}`;

    return { systemPrompt, userPrompt };
  },
  
  getSchema() {
    return {
      name: 'series_mid_report',
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

Focus on:
1. RESULTS - How did we do vs targets and prior years?
2. ANALYSIS - What drove the results (good and bad)?
3. LEARNINGS - What should we do differently next time?
4. PLAYER INSIGHTS - What did we learn about our player base?
5. RECOMMENDATIONS - Specific changes for future series

Your response MUST be valid JSON. No text outside the JSON object.

TONE: Reflective and constructive. Honest about failures, celebratory about successes. Forward-looking.`;

    const { packData, periodLabel } = metricsPack;
    const data = typeof packData === 'string' ? JSON.parse(packData) : packData;

    const userPrompt = `Generate a Post-Series Report for: ${periodLabel}

=== SERIES DATA ===
${JSON.stringify(data, null, 2)}
=== END DATA ===

Generate JSON with this structure:

{
  "seriesSummary": {
    "seriesName": "Name",
    "venue": "Location",
    "dates": { "start": "date", "end": "date" },
    "overallVerdict": "EXCEEDED_EXPECTATIONS | MET_EXPECTATIONS | BELOW_EXPECTATIONS | DISAPPOINTING",
    "headlineResult": "One sentence summary"
  },
  
  "resultsVsTargets": {
    "entries": { "actual": <number>, "target": <number>, "variance": <percent>, "priorYear": <number>, "yoyChange": <percent> },
    "revenue": { "actual": <number>, "target": <number>, "variance": <percent>, "priorYear": <number>, "yoyChange": <percent> },
    "profit": { "actual": <number>, "target": <number>, "variance": <percent>, "priorYear": <number>, "yoyChange": <percent> },
    "uniquePlayers": { "actual": <number>, "target": <number>, "variance": <percent>, "priorYear": <number>, "yoyChange": <percent> }
  },
  
  "eventBreakdown": [
    {
      "eventName": "Name",
      "entries": <number>,
      "prizepool": <number>,
      "profit": <number>,
      "vsTarget": <percent>,
      "verdict": "EXCEEDED | MET | MISSED",
      "notes": "Notable aspects"
    }
  ],
  
  "mainEventResults": {
    "entries": <number>,
    "prizepool": <number>,
    "winner": "Winner name",
    "notableFinishes": ["Notable player finishes"],
    "mediaHighlights": ["Media coverage moments"]
  },
  
  "whatWorked": [
    {
      "item": "What worked well",
      "evidence": "Data supporting this",
      "recommendation": "Do more of this"
    }
  ],
  
  "whatDidntWork": [
    {
      "item": "What didn't work",
      "evidence": "Data supporting this",
      "rootCause": "Why it failed",
      "recommendation": "How to fix next time"
    }
  ],
  
  "playerInsights": {
    "totalUniquePlayers": <number>,
    "newPlayers": <number>,
    "newPlayerPercent": <percent>,
    "topPlayersByEntries": [{ "name": "Name", "entries": <number>, "spend": <number> }],
    "geographicBreakdown": "Where players came from",
    "acquisitionChannels": "How players heard about the series"
  },
  
  "financialAnalysis": {
    "grossRevenue": <number>,
    "totalCosts": <number>,
    "netProfit": <number>,
    "profitMargin": <percent>,
    "guaranteeOverlay": <number>,
    "costBreakdown": {
      "staffing": <number>,
      "marketing": <number>,
      "venue": <number>,
      "other": <number>
    },
    "roiAnalysis": "Return on marketing/operational investment"
  },
  
  "recommendations": [
    {
      "category": "SCHEDULE | PRICING | MARKETING | OPERATIONS | FORMAT | VENUE",
      "recommendation": "Specific recommendation",
      "rationale": "Why, based on data",
      "expectedImpact": "What it should achieve",
      "priority": "HIGH | MEDIUM | LOW",
      "implementBy": "Next series | 6 months | 1 year"
    }
  ],
  
  "nextSeriesPlanning": {
    "suggestedDates": "Recommended dates for next year",
    "formatChanges": ["Suggested event format changes"],
    "budgetRecommendations": "Budget guidance for next year",
    "keyFocusAreas": ["Primary improvement areas"]
  }
}`;

    return { systemPrompt, userPrompt };
  },
  
  getSchema() {
    return {
      name: 'series_post_report',
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
