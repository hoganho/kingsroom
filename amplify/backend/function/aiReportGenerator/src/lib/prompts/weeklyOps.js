/**
 * Weekly Operations Report Prompt Template
 * Generates tactical insights for venue managers
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
  return `You are an expert poker tournament business analyst generating weekly operations reports for poker room directors. Your reports should be:

1. ACTIONABLE - Focus on specific actions the director can take this week
2. DATA-DRIVEN - All insights must be backed by the metrics provided
3. CONCISE - Directors are busy; get to the point quickly
4. BALANCED - Highlight both successes and areas needing attention

You will receive a MetricsPack containing:
- Strategic KPIs (revenue, profit, entries, etc.) with period-over-period deltas
- Venue-level breakdowns with trend categories
- Alerts for threshold breaches
- Rankings and leaderboards
- Player insights

Your response MUST be valid JSON matching the exact structure specified. Do not include any text outside the JSON object.

TONE: Professional but approachable. Speak as a trusted advisor, not a robot. Use specific numbers to support observations.

IMPORTANT RULES:
1. Never invent data - only reference metrics explicitly provided
2. For percentage changes, always specify the comparison period
3. When something is missing data, acknowledge it don't guess
4. Focus alerts on the most impactful items (max 5 priority alerts)
5. Recommendations should be specific and achievable within a week`;
}

function buildUserPrompt(metricsPack, options = {}) {
  const { packData, periodLabel, periodStart, periodEnd, comparisonPeriodLabel } = metricsPack;
  
  // Parse packData if it's a string
  const data = typeof packData === 'string' ? JSON.parse(packData) : packData;
  
  return `Generate a Weekly Operations Report for the period: ${periodLabel}
Period: ${periodStart} to ${periodEnd}
${comparisonPeriodLabel ? `Compared to: ${comparisonPeriodLabel}` : ''}

=== METRICS PACK DATA ===

${JSON.stringify(data, null, 2)}

=== END METRICS PACK DATA ===

Generate a JSON response with this EXACT structure:

{
  "executiveSummary": {
    "headline": "One sentence capturing the week's performance (include key number)",
    "keyTakeaways": ["3-4 bullet points of most important insights"],
    "overallHealth": "EXCELLENT | GOOD | NEEDS_ATTENTION | CRITICAL",
    "healthRationale": "Brief explanation of health assessment"
  },
  
  "keyMetrics": {
    "revenue": {
      "value": <number>,
      "delta": <number>,
      "deltaPercent": <number>,
      "trend": "UP | DOWN | FLAT",
      "insight": "Brief insight about this metric"
    },
    "profit": {
      "value": <number>,
      "delta": <number>,
      "deltaPercent": <number>,
      "trend": "UP | DOWN | FLAT",
      "insight": "Brief insight about this metric"
    },
    "entries": {
      "value": <number>,
      "delta": <number>,
      "deltaPercent": <number>,
      "trend": "UP | DOWN | FLAT",
      "insight": "Brief insight about this metric"
    },
    "profitMargin": {
      "value": <number>,
      "delta": <number>,
      "trend": "UP | DOWN | FLAT",
      "insight": "Brief insight about this metric"
    },
    "runRate": {
      "value": <number>,
      "delta": <number>,
      "trend": "UP | DOWN | FLAT",
      "insight": "Brief insight about this metric"
    }
  },
  
  "alerts": [
    {
      "id": "<unique-id>",
      "type": "<AlertType from pack>",
      "severity": "HIGH | MEDIUM | LOW",
      "title": "Alert title",
      "description": "What happened and why it matters",
      "recommendation": "Specific action to address this",
      "affectedEntity": "Venue or game name if applicable",
      "metric": "<metric name>",
      "value": <current value>,
      "threshold": <threshold breached>
    }
  ],
  
  "opportunities": [
    {
      "title": "Opportunity title",
      "description": "What the data suggests",
      "potentialImpact": "Estimated impact if addressed",
      "effort": "LOW | MEDIUM | HIGH",
      "timeframe": "This week | Next 2 weeks | This month"
    }
  ],
  
  "focusActions": [
    {
      "action": "Specific action to take",
      "priority": "HIGH | MEDIUM | LOW",
      "owner": "Suggested role (e.g., 'Floor Manager', 'Marketing')",
      "dueBy": "Suggested timeframe",
      "rationale": "Why this matters based on the data"
    }
  ],
  
  "venueCallouts": [
    {
      "venueId": "<venue-id>",
      "venueName": "Venue name",
      "calloutType": "TOP_PERFORMER | NEEDS_ATTENTION | TREND_CHANGE | MILESTONE",
      "headline": "One-line summary",
      "details": "2-3 sentences with specific metrics",
      "trendCategory": "AT_RISK | SOFTENING | STEADY | UPLIFT | BREAKOUT",
      "recommendation": "Specific action for this venue"
    }
  ],
  
  "competitorInsights": {
    "summary": "Overview of competitive landscape this week",
    "threats": [
      {
        "competitor": "Competitor name",
        "threat": "What they're doing",
        "threatLevel": "LOW | MEDIUM | HIGH",
        "suggestedResponse": "How to respond"
      }
    ],
    "opportunities": [
      {
        "observation": "What we noticed",
        "suggestedAction": "How to capitalize"
      }
    ]
  },
  
  "weekAheadOutlook": {
    "keyEvents": ["Notable events or factors for next week"],
    "watchItems": ["Things to monitor closely"],
    "suggestedFocus": "Primary focus area for the coming week"
  }
}

Ensure all numeric values are actual numbers (not strings). Include at least 3 alerts if data supports it, maximum 5. Include 2-4 focus actions prioritized by impact. Only include venue callouts for venues with notable performance (good or bad).`;
}

/**
 * Get the JSON schema for OpenAI structured output
 * @returns {object}
 */
function getSchema() {
  return {
    name: 'weekly_ops_report',
    strict: true,
    schema: {
      type: 'object',
      required: ['executiveSummary', 'keyMetrics', 'alerts', 'focusActions'],
      properties: {
        executiveSummary: {
          type: 'object',
          required: ['headline', 'keyTakeaways', 'overallHealth', 'healthRationale'],
          properties: {
            headline: { type: 'string' },
            keyTakeaways: { type: 'array', items: { type: 'string' } },
            overallHealth: { type: 'string', enum: ['EXCELLENT', 'GOOD', 'NEEDS_ATTENTION', 'CRITICAL'] },
            healthRationale: { type: 'string' },
          },
        },
        keyMetrics: { type: 'object' },
        alerts: { type: 'array' },
        opportunities: { type: 'array' },
        focusActions: { type: 'array' },
        venueCallouts: { type: 'array' },
        competitorInsights: { type: 'object' },
        weekAheadOutlook: { type: 'object' },
      },
    },
  };
}

module.exports = {
  build,
  getSchema,
};
