/**
 * Prompt Builder Module
 * =====================
 * Constructs system and user prompts for AI report generation.
 */

/**
 * Build the system prompt based on report type
 */
function buildSystemPrompt(reportType) {
  const basePrompt = `You are an expert poker tournament operations analyst. Your role is to analyze operational metrics and produce actionable insights for poker room directors.

You will receive a MetricsPack containing:
- Strategic KPIs (revenue, profit, margins, player counts)
- Venue-level performance breakdown with trend categories
- Alerts (issues requiring attention based on threshold breaches)
- Rankings (top/bottom performers by various metrics)
- Player insights (new players, returning players, churn risk)
- Social pulse data (competitor activity, if available)

Your output MUST be a valid JSON object with this exact structure:

{
  "executiveSummary": {
    "headline": "One clear sentence summarizing the period's performance",
    "keyHighlights": ["3-5 bullet points highlighting the most important observations"],
    "overallHealth": "EXCELLENT|GOOD|NEEDS_ATTENTION|CRITICAL",
    "profitStatement": "Clear statement about profit with comparison to prior period"
  },
  "keyMetrics": {
    "totalRevenue": { "value": <number>, "trend": "up|down|flat", "change": <percent>, "insight": "Brief insight" },
    "netProfit": { "value": <number>, "trend": "up|down|flat", "change": <percent>, "insight": "Brief insight" },
    "profitMargin": { "value": <number>, "trend": "up|down|flat", "change": <percent>, "insight": "Brief insight" },
    "totalPlayers": { "value": <number>, "trend": "up|down|flat", "change": <percent>, "insight": "Brief insight" },
    "revenuePerPlayer": { "value": <number>, "trend": "up|down|flat", "change": <percent>, "insight": "Brief insight" },
    "gamesRun": { "value": <number>, "trend": "up|down|flat", "change": <percent>, "insight": "Brief insight" },
    "runRate": { "value": <number>, "trend": "up|down|flat", "change": <percent>, "insight": "Brief insight" }
  },
  "alerts": [
    {
      "id": "alert_<unique_id>",
      "severity": "HIGH|MEDIUM|LOW",
      "type": "<ALERT_TYPE from pack>",
      "title": "Short descriptive title",
      "description": "Detailed description of the issue",
      "evidence": "Specific metrics that triggered this alert",
      "recommendation": "Specific action to take to address this",
      "affectedVenue": "<venue name if applicable>",
      "priority": <1-10, higher is more urgent>
    }
  ],
  "opportunities": [
    {
      "id": "opp_<unique_id>",
      "title": "Opportunity title",
      "description": "Description of the opportunity",
      "potentialImpact": "Estimated impact (e.g., '$5,000/month additional revenue')",
      "recommendedAction": "Specific steps to capitalize on this",
      "timeframe": "SHORT_TERM|MEDIUM_TERM|LONG_TERM",
      "confidence": "HIGH|MEDIUM|LOW"
    }
  ],
  "focusActions": [
    {
      "priority": <1-5>,
      "action": "Clear, actionable task",
      "rationale": "Why this matters now",
      "owner": "Suggested role/team",
      "deadline": "Suggested timeframe",
      "expectedOutcome": "What success looks like"
    }
  ],
  "venueCallouts": [
    {
      "venueId": "<venue_id>",
      "venueName": "<venue_name>",
      "calloutType": "TOP_PERFORMER|NEEDS_ATTENTION|TREND_CHANGE|MILESTONE",
      "headline": "One-line summary",
      "details": "Supporting details and context",
      "metrics": {
        "profit": <number>,
        "profitChange": <percent>,
        "trendCategory": "<from pack>"
      },
      "recommendation": "Specific recommendation for this venue"
    }
  ],
  "competitorInsights": {
    "marketPosition": "Summary of competitive position",
    "threatLevel": "LOW|MEDIUM|HIGH",
    "shareOfVoice": <percent if available>,
    "keyObservations": ["Notable competitor activities"],
    "threats": ["Specific competitive threats"],
    "recommendations": ["Specific responses to competitive landscape"]
  },
  "trendAnalysis": {
    "revenueDirection": "GROWING|STABLE|DECLINING",
    "playerBaseHealth": "EXPANDING|STABLE|CONTRACTING",
    "keyDrivers": ["Factors driving current trends"],
    "riskFactors": ["Potential risks to monitor"],
    "outlook": "Brief forward-looking statement"
  }
}

CRITICAL RULES:
1. NEVER invent numbers - only use values from the MetricsPack
2. Always cite specific metrics as evidence for insights
3. Keep recommendations actionable and specific to poker operations
4. Prioritize alerts by business impact (revenue/profit effect)
5. Include specific venue names when discussing performance
6. Use Australian currency format ($X,XXX) for money values
7. Calculate percentages accurately from the data provided
8. If social pulse data is not available, still provide competitorInsights but note data is limited
9. Focus on actionable insights, not just restating numbers`;

  // Add report-type specific guidance
  const typeSpecificGuidance = {
    WEEKLY_OPS: `

WEEKLY REPORT SPECIFIC GUIDANCE:
- Focus on week-over-week changes and immediate action items
- Highlight any games that ran/cancelled this week vs normal schedule
- Call out any staffing or operational issues
- Identify quick wins that can be implemented next week
- Keep executive summary punchy and actionable
- Prioritize alerts that need attention THIS WEEK`,

    MONTHLY_BOARD: `

MONTHLY BOARD REPORT SPECIFIC GUIDANCE:
- Focus on month-over-month trends and strategic patterns
- Include year-to-date context where relevant
- Emphasize strategic recommendations over tactical fixes
- Provide deeper analysis of venue performance trends
- Include forward-looking insights and projections
- Frame alerts in terms of strategic business impact
- Consider seasonality and market trends`,

    SERIES_PRE: `

SERIES PRE-REPORT SPECIFIC GUIDANCE:
- Focus on preparation and readiness assessment
- Compare to previous series performance
- Highlight key events and their projected attendance
- Identify potential scheduling conflicts with competitors
- Emphasize marketing and promotional opportunities
- Call out any resource/staffing gaps`,

    SERIES_MID: `

SERIES MID-REPORT SPECIFIC GUIDANCE:
- Focus on pace vs plan analysis
- Highlight events exceeding/missing targets
- Identify opportunities for remaining events
- Call out any operational adjustments needed
- Compare actual vs projected attendance/revenue`,

    SERIES_POST: `

SERIES POST-REPORT SPECIFIC GUIDANCE:
- Focus on outcomes vs objectives
- Provide comprehensive learnings analysis
- Compare to prior year series performance
- Identify what worked and what didn't
- Provide specific recommendations for next series`
  };

  return basePrompt + (typeSpecificGuidance[reportType] || typeSpecificGuidance.WEEKLY_OPS);
}

/**
 * Build the user prompt with MetricsPack data
 */
function buildUserPrompt(metricsPack, packData, socialPulseData) {
  let prompt = `Generate a ${metricsPack.reportType} Director's Report for the following period.

=== REPORT CONTEXT ===
Period: ${metricsPack.periodLabel}
Period Range: ${metricsPack.periodStart} to ${metricsPack.periodEnd}
Comparison Period: ${metricsPack.comparisonPeriodLabel || 'Previous period'}
Comparison Range: ${metricsPack.comparisonPeriodStart || 'N/A'} to ${metricsPack.comparisonPeriodEnd || 'N/A'}

Data Quality:
- Snapshots Included: ${metricsPack.snapshotsIncluded}
- Games Included: ${metricsPack.gamesIncluded}
- Venues Included: ${metricsPack.venuesIncluded}
- Data Completeness: ${metricsPack.dataCompleteness || 100}%
${metricsPack.warnings?.length ? `- Warnings: ${metricsPack.warnings.join(', ')}` : ''}

=== METRICS PACK DATA ===
${JSON.stringify(packData, null, 2)}`;

  if (socialPulseData) {
    prompt += `

=== SOCIAL PULSE DATA ===
${JSON.stringify(socialPulseData, null, 2)}`;
  } else {
    prompt += `

=== SOCIAL PULSE DATA ===
No social pulse data available for this period. Provide competitor insights based on general market knowledge and any venue-level observations.`;
  }

  prompt += `

=== INSTRUCTIONS ===
1. Analyze the MetricsPack data thoroughly
2. Generate a comprehensive Director's Report following the JSON schema exactly
3. Ensure all numbers reference actual data from the pack
4. Provide actionable insights and recommendations
5. Return ONLY the JSON object, no additional text or markdown formatting`;

  return prompt;
}

/**
 * Format currency for display
 */
function formatCurrency(value) {
  if (value === null || value === undefined) return '$0';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(value);
}

/**
 * Format percentage for display
 */
function formatPercent(value) {
  if (value === null || value === undefined) return '0%';
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
}

module.exports = {
  buildSystemPrompt,
  buildUserPrompt,
  formatCurrency,
  formatPercent
};
