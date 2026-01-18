/**
 * Monthly Board Report Prompt Template
 * Generates strategic insights for executives and board members
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
  return `You are an expert poker tournament business analyst generating monthly board reports for executives and investors. Your reports should be:

1. STRATEGIC - Focus on high-level trends and business health
2. COMPARATIVE - Emphasize month-over-month and year-over-year changes
3. FORWARD-LOOKING - Include projections and strategic recommendations
4. EXECUTIVE-FRIENDLY - Avoid operational minutiae; focus on what matters at board level

You will receive a MetricsPack containing:
- Strategic KPIs with deltas vs prior period
- Venue-level performance aggregated for the month
- Alerts and risk indicators
- Market/competitive intelligence from social pulse

Your response MUST be valid JSON matching the exact structure specified. Do not include any text outside the JSON object.

TONE: Formal and professional. Suitable for board presentation. Use precise language and avoid jargon unless industry-standard.

IMPORTANT RULES:
1. Lead with the most significant insights
2. Frame challenges as risks with mitigation strategies
3. Quantify impact wherever possible ($, %, player counts)
4. Include strategic recommendations, not just operational tasks
5. Consider competitive positioning and market trends`;
}

function buildUserPrompt(metricsPack, options = {}) {
  const { packData, periodLabel, periodStart, periodEnd, comparisonPeriodLabel } = metricsPack;
  
  // Parse packData if it's a string
  const data = typeof packData === 'string' ? JSON.parse(packData) : packData;
  
  return `Generate a Monthly Board Report for: ${periodLabel}
Period: ${periodStart} to ${periodEnd}
${comparisonPeriodLabel ? `Compared to: ${comparisonPeriodLabel}` : ''}

=== METRICS PACK DATA ===

${JSON.stringify(data, null, 2)}

=== END METRICS PACK DATA ===

Generate a JSON response with this EXACT structure:

{
  "executiveSummary": {
    "headline": "Board-level summary in one impactful sentence",
    "performanceRating": "EXCEEDING_TARGETS | ON_TRACK | BELOW_TARGETS | REQUIRES_INTERVENTION",
    "keyHighlights": ["3-5 most significant achievements or milestones"],
    "keyRisks": ["2-3 most significant risks or concerns"],
    "strategicOutlook": "2-3 sentences on trajectory and strategic position"
  },
  
  "financialPerformance": {
    "revenue": {
      "actual": <number>,
      "priorPeriod": <number>,
      "variance": <number>,
      "variancePercent": <number>,
      "ytdActual": <number if available or null>,
      "ytdTarget": <number if available or null>,
      "commentary": "Brief analysis of revenue performance"
    },
    "profit": {
      "actual": <number>,
      "priorPeriod": <number>,
      "variance": <number>,
      "variancePercent": <number>,
      "margin": <number>,
      "marginTrend": "IMPROVING | STABLE | DECLINING",
      "commentary": "Brief analysis of profitability"
    },
    "costAnalysis": {
      "totalCosts": <number>,
      "costBreakdown": {
        "staffCosts": <number>,
        "guaranteeOverlay": <number>,
        "otherCosts": <number>
      },
      "costTrend": "IMPROVING | STABLE | CONCERNING",
      "commentary": "Analysis of cost structure"
    }
  },
  
  "operationalMetrics": {
    "volume": {
      "totalEntries": <number>,
      "totalGames": <number>,
      "runRate": <number>,
      "avgEntriesPerGame": <number>,
      "commentary": "Volume analysis"
    },
    "playerMetrics": {
      "uniquePlayers": <number>,
      "newPlayers": <number>,
      "returningPlayerRate": <number>,
      "revenuePerPlayer": <number>,
      "commentary": "Player base health analysis"
    },
    "venuePerformance": {
      "topPerformers": [
        {
          "venueName": "Name",
          "highlight": "Key achievement",
          "metrics": "Supporting numbers"
        }
      ],
      "underperformers": [
        {
          "venueName": "Name",
          "concern": "Key issue",
          "recommendation": "Suggested action"
        }
      ]
    }
  },
  
  "riskAssessment": {
    "overallRiskLevel": "LOW | MODERATE | ELEVATED | HIGH",
    "risks": [
      {
        "category": "FINANCIAL | OPERATIONAL | COMPETITIVE | REGULATORY | REPUTATIONAL",
        "description": "Risk description",
        "likelihood": "LOW | MEDIUM | HIGH",
        "impact": "LOW | MEDIUM | HIGH",
        "mitigationStrategy": "How to address",
        "owner": "Suggested responsible party"
      }
    ]
  },
  
  "competitivePosition": {
    "marketShare": "Assessment of market position",
    "competitorActivity": "Summary of competitor movements",
    "threats": ["Key competitive threats"],
    "opportunities": ["Competitive opportunities to pursue"],
    "recommendedActions": ["Strategic actions to maintain/improve position"]
  },
  
  "strategicRecommendations": [
    {
      "recommendation": "Strategic recommendation",
      "rationale": "Why this matters based on the data",
      "expectedImpact": "Quantified expected benefit",
      "investmentRequired": "LOW | MEDIUM | HIGH",
      "timeframe": "SHORT_TERM | MEDIUM_TERM | LONG_TERM",
      "priority": "CRITICAL | HIGH | MEDIUM | LOW"
    }
  ],
  
  "nextMonthOutlook": {
    "projectedRevenue": <number or null>,
    "keyInitiatives": ["Planned initiatives for next month"],
    "expectedChallenges": ["Anticipated challenges"],
    "successMetrics": ["What success looks like"]
  },
  
  "appendix": {
    "dataQuality": "Assessment of data completeness",
    "assumptions": ["Key assumptions made in this report"],
    "limitedDataAreas": ["Areas where data was insufficient"]
  }
}

Focus on strategic insights suitable for board-level discussion. Use actual numbers from the data - do not fabricate or estimate figures that aren't provided.`;
}

/**
 * Get the JSON schema for OpenAI structured output
 * @returns {object}
 */
function getSchema() {
  return {
    name: 'monthly_board_report',
    strict: true,
    schema: {
      type: 'object',
      required: ['executiveSummary', 'financialPerformance', 'operationalMetrics', 'riskAssessment', 'strategicRecommendations'],
      properties: {
        executiveSummary: {
          type: 'object',
          required: ['headline', 'performanceRating', 'keyHighlights', 'keyRisks'],
          properties: {
            headline: { type: 'string' },
            performanceRating: { type: 'string', enum: ['EXCEEDING_TARGETS', 'ON_TRACK', 'BELOW_TARGETS', 'REQUIRES_INTERVENTION'] },
            keyHighlights: { type: 'array', items: { type: 'string' } },
            keyRisks: { type: 'array', items: { type: 'string' } },
            strategicOutlook: { type: 'string' },
          },
        },
        financialPerformance: { type: 'object' },
        operationalMetrics: { type: 'object' },
        riskAssessment: { type: 'object' },
        competitivePosition: { type: 'object' },
        strategicRecommendations: { type: 'array' },
        nextMonthOutlook: { type: 'object' },
        appendix: { type: 'object' },
      },
    },
  };
}

module.exports = {
  build,
  getSchema,
};
