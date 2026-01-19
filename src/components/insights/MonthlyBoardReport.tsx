// components/insights/MonthlyBoardReport.tsx
// Monthly Board Report Renderer - Orchestrates all sections for MONTHLY_BOARD reports

import React from 'react';
import { FileText, Calendar, Clock, Cpu, DollarSign, Database, TrendingUp, TrendingDown, Minus, AlertTriangle, Target, Building2, Swords, Lightbulb } from 'lucide-react';
import type { MonthlyBoardReportData, DirectorReport, MetricsPack, ReportHealthStatus, VenueHealth, VenueTrendCategory, Trajectory } from '../../types/insights';

interface MonthlyBoardReportProps {
  report: DirectorReport;
  reportData: MonthlyBoardReportData;
  metricsPack?: MetricsPack | null;
  showMetadata?: boolean;
}

const formatCurrency = (value: number): string => {
  const isNegative = value < 0;
  const formatted = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(value));
  return isNegative ? `-${formatted}` : formatted;
};
const formatPercent = (value: number): string => `${value.toFixed(1)}%`;
const formatDateTime = (dateStr: string): string => new Date(dateStr).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const healthConfig: Record<ReportHealthStatus, { color: string; bg: string }> = {
  EXCELLENT: { color: 'text-green-700', bg: 'bg-green-100' },
  GOOD: { color: 'text-green-700', bg: 'bg-green-100' },
  OK: { color: 'text-gray-700', bg: 'bg-gray-100' },
  CONCERNING: { color: 'text-amber-700', bg: 'bg-amber-100' },
  NEEDS_ATTENTION: { color: 'text-amber-700', bg: 'bg-amber-100' },
  CRITICAL: { color: 'text-red-700', bg: 'bg-red-100' },
};

const trajectoryConfig: Record<Trajectory, { icon: React.ReactNode; color: string }> = {
  IMPROVING: { icon: <TrendingUp className="w-4 h-4" />, color: 'text-green-600' },
  STABLE: { icon: <Minus className="w-4 h-4" />, color: 'text-gray-600' },
  DECLINING: { icon: <TrendingDown className="w-4 h-4" />, color: 'text-red-600' },
};

const venueHealthConfig: Record<VenueHealth, { color: string }> = {
  EXCELLENT: { color: 'bg-green-100 text-green-700' },
  GOOD: { color: 'bg-green-100 text-green-700' },
  NEEDS_ATTENTION: { color: 'bg-amber-100 text-amber-700' },
  CRITICAL: { color: 'bg-red-100 text-red-700' },
};

const trendConfig: Record<VenueTrendCategory, { color: string; label: string }> = {
  BREAKOUT: { color: 'text-green-600', label: '↑ Breakout' },
  UPLIFT: { color: 'text-blue-600', label: '↗ Uplift' },
  STEADY: { color: 'text-gray-600', label: '→ Steady' },
  SOFTENING: { color: 'text-amber-600', label: '↘ Softening' },
  AT_RISK: { color: 'text-red-600', label: '↓ At Risk' },
};

export const MonthlyBoardReport: React.FC<MonthlyBoardReportProps> = ({ report, reportData, metricsPack, showMetadata = true }) => {
  if (!reportData) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <p className="text-gray-500">No report data available</p>
      </div>
    );
  }

  const health = healthConfig[reportData.executiveSummary?.overallHealth] || healthConfig.OK;
  const trajectory = trajectoryConfig[reportData.executiveSummary?.trajectory] || trajectoryConfig.STABLE;

  return (
    <div className="space-y-6">
      {showMetadata && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-gray-400" /><span className="font-medium">{metricsPack?.periodLabel || report.periodKey}</span></div>
            <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /><span className="font-medium">{formatDateTime(report.generatedAt)}</span></div>
            <div className="flex items-center gap-2"><Cpu className="w-4 h-4 text-gray-400" /><span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{report.modelName}</span></div>
            {metricsPack && <div className="flex items-center gap-2"><Database className="w-4 h-4 text-gray-400" /><span className="font-medium">{metricsPack.gamesIncluded} games, {metricsPack.venuesIncluded} venues</span></div>}
          </div>
        </div>
      )}

      {/* Executive Summary */}
      {reportData.executiveSummary && (
        <div className={`rounded-xl border p-6 ${health.bg} border-l-4 ${health.color === 'text-green-700' ? 'border-l-green-500' : health.color === 'text-amber-700' ? 'border-l-amber-500' : health.color === 'text-red-700' ? 'border-l-red-500' : 'border-l-gray-400'}`}>
          <div className="flex items-start justify-between mb-4">
            <div><h2 className="text-xl font-bold text-gray-900">Executive Summary</h2><p className="text-sm text-gray-500">Monthly Board Report</p></div>
            <div className="flex items-center gap-3">
              <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${health.bg} ${health.color}`}>{reportData.executiveSummary.overallHealth}</span>
              <div className={`flex items-center gap-1 ${trajectory.color}`}>{trajectory.icon}<span className="text-sm font-medium">{reportData.executiveSummary.trajectory}</span></div>
            </div>
          </div>
          <p className="text-lg text-gray-800 font-medium mb-4">{reportData.executiveSummary.headline}</p>
          {reportData.executiveSummary.healthRationale && <p className="text-sm text-gray-600 mb-4 border-l-2 border-gray-300 pl-3 italic">{reportData.executiveSummary.healthRationale}</p>}
          {reportData.executiveSummary.keyTakeaways && reportData.executiveSummary.keyTakeaways.length > 0 && (
            <div className="mb-4"><h4 className="text-sm font-semibold text-gray-700 mb-2">Key Takeaways</h4><ul className="space-y-1">{reportData.executiveSummary.keyTakeaways.map((item, idx) => <li key={idx} className="flex items-start gap-2 text-sm text-gray-700"><span className="text-green-500 mt-0.5">✓</span>{item}</li>)}</ul></div>
          )}
          {reportData.executiveSummary.criticalIssues && reportData.executiveSummary.criticalIssues.length > 0 && (
            <div className="p-3 bg-red-50 rounded-lg border border-red-200"><h4 className="text-sm font-semibold text-red-800 mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" />Critical Issues</h4><ul className="space-y-1">{reportData.executiveSummary.criticalIssues.map((issue, idx) => <li key={idx} className="text-sm text-red-700">• {issue}</li>)}</ul></div>
          )}
        </div>
      )}

      {/* Financial Performance */}
      {reportData.financialPerformance && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><DollarSign className="w-5 h-5 text-green-500" />Financial Performance</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-sm text-blue-600 font-medium mb-1">Revenue</div>
              <div className="text-3xl font-bold text-blue-900">{formatCurrency(reportData.financialPerformance.revenue.actual)}</div>
              {reportData.financialPerformance.revenue.changePercent !== undefined && <div className={`text-sm mt-1 ${reportData.financialPerformance.revenue.changePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{reportData.financialPerformance.revenue.changePercent >= 0 ? '↑' : '↓'} {Math.abs(reportData.financialPerformance.revenue.changePercent).toFixed(1)}% vs prior</div>}
            </div>
            <div className={`p-4 rounded-lg border ${(reportData.financialPerformance.profit.actual || 0) >= 0 ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
              <div className={`text-sm font-medium mb-1 ${(reportData.financialPerformance.profit.actual || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>Profit</div>
              <div className={`text-3xl font-bold ${(reportData.financialPerformance.profit.actual || 0) >= 0 ? 'text-green-900' : 'text-red-900'}`}>{formatCurrency(reportData.financialPerformance.profit.actual)}</div>
              {reportData.financialPerformance.profit.margin !== undefined && <div className="text-sm text-gray-600 mt-1">Margin: {formatPercent(reportData.financialPerformance.profit.margin)}</div>}
            </div>
          </div>
          {reportData.financialPerformance.topLineInsight && <p className="text-sm text-gray-700 mb-2"><strong>Revenue:</strong> {reportData.financialPerformance.topLineInsight}</p>}
          {reportData.financialPerformance.bottomLineInsight && <p className="text-sm text-gray-700"><strong>Profit:</strong> {reportData.financialPerformance.bottomLineInsight}</p>}
        </div>
      )}

      {/* Guarantee Analysis */}
      {reportData.guaranteeAnalysis && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Target className="w-5 h-5 text-amber-500" />Guarantee Analysis</h3>
          <p className="text-gray-700 mb-4">{reportData.guaranteeAnalysis.summary}</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-3 bg-gray-50 rounded-lg"><div className="text-xl font-bold text-gray-900">{formatCurrency(reportData.guaranteeAnalysis.totalExposure)}</div><div className="text-xs text-gray-500">Total Exposure</div></div>
            <div className="text-center p-3 bg-gray-50 rounded-lg"><div className={`text-xl font-bold ${reportData.guaranteeAnalysis.totalOverlayCost > 0 ? 'text-red-600' : 'text-green-600'}`}>{formatCurrency(reportData.guaranteeAnalysis.totalOverlayCost)}</div><div className="text-xs text-gray-500">Overlay Cost</div></div>
            <div className="text-center p-3 bg-gray-50 rounded-lg"><div className={`text-xl font-bold ${reportData.guaranteeAnalysis.overlayRate > 20 ? 'text-red-600' : 'text-gray-900'}`}>{formatPercent(reportData.guaranteeAnalysis.overlayRate)}</div><div className="text-xs text-gray-500">Overlay Rate</div></div>
            <div className="text-center p-3 bg-gray-50 rounded-lg"><div className={`text-xl font-bold ${reportData.guaranteeAnalysis.avgCoverageRate >= 100 ? 'text-green-600' : 'text-amber-600'}`}>{formatPercent(reportData.guaranteeAnalysis.avgCoverageRate)}</div><div className="text-xs text-gray-500">Avg Coverage</div></div>
          </div>
          {reportData.guaranteeAnalysis.strategicRecommendation && <div className="p-3 bg-blue-50 rounded-lg border border-blue-200"><div className="flex items-start gap-2"><Lightbulb className="w-4 h-4 text-blue-500 mt-0.5" /><p className="text-sm text-blue-700">{reportData.guaranteeAnalysis.strategicRecommendation}</p></div></div>}
        </div>
      )}

      {/* Venue Performance */}
      {reportData.venuePerformance && reportData.venuePerformance.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Building2 className="w-5 h-5 text-indigo-500" />Venue Performance</h3>
          <div className="space-y-4">
            {reportData.venuePerformance.map((venue, idx) => {
              const venueHealth = venueHealthConfig[venue.health] || venueHealthConfig.GOOD;
              const trend = trendConfig[venue.trend] || trendConfig.STEADY;
              return (
                <div key={idx} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex items-start justify-between mb-3">
                    <div><h4 className="font-semibold text-gray-900">{venue.venueName}</h4><div className="flex items-center gap-2 mt-1"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${venueHealth.color}`}>{venue.health}</span><span className={`text-sm ${trend.color}`}>{trend.label}</span></div></div>
                    <div className="text-right"><div className={`text-xl font-bold ${venue.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(venue.profit)}</div>{venue.profitChangePercent !== undefined && <div className={`text-sm ${venue.profitChangePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>{venue.profitChangePercent >= 0 ? '+' : ''}{formatPercent(venue.profitChangePercent)}</div>}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-4 text-sm mb-3"><div><span className="text-gray-500">Margin:</span><span className="ml-2 font-medium">{formatPercent(venue.margin)}</span></div><div><span className="text-gray-500">Games:</span><span className="ml-2 font-medium">{venue.games}</span></div></div>
                  {venue.recommendation && <div className="text-sm text-blue-600"><strong>Action:</strong> {venue.recommendation}</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Competitive Position */}
      {reportData.competitivePosition && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Swords className="w-5 h-5 text-red-500" />Competitive Position</h3>
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="p-3 bg-gray-50 rounded-lg"><div className="text-sm text-gray-500">Pressure Level</div><div className={`font-bold ${reportData.competitivePosition.pressureLevel === 'HIGH' ? 'text-red-600' : reportData.competitivePosition.pressureLevel === 'MEDIUM' ? 'text-amber-600' : 'text-green-600'}`}>{reportData.competitivePosition.pressureLevel}</div></div>
            <div className="p-3 bg-gray-50 rounded-lg"><div className="text-sm text-gray-500">Pressure Score</div><div className="font-bold">{reportData.competitivePosition.pressureScore}/10</div></div>
          </div>
          <p className="text-gray-700 mb-4">{reportData.competitivePosition.marketAssessment}</p>
          {reportData.competitivePosition.strategicResponse && <div className="p-3 bg-blue-50 rounded-lg border border-blue-200"><div className="flex items-start gap-2"><Target className="w-4 h-4 text-blue-500 mt-0.5" /><p className="text-sm text-blue-700">{reportData.competitivePosition.strategicResponse}</p></div></div>}
        </div>
      )}

      {/* Strategic Recommendations */}
      {reportData.strategicRecommendations && reportData.strategicRecommendations.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Lightbulb className="w-5 h-5 text-yellow-500" />Strategic Recommendations</h3>
          <div className="space-y-4">
            {reportData.strategicRecommendations.map((rec, idx) => (
              <div key={idx} className={`p-4 rounded-lg border ${rec.priority === 1 ? 'bg-red-50 border-red-200' : rec.priority === 2 ? 'bg-amber-50 border-amber-200' : 'bg-blue-50 border-blue-200'}`}>
                <div className="flex items-start justify-between mb-2"><h4 className="font-medium text-gray-900">{rec.recommendation}</h4><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${rec.priority === 1 ? 'bg-red-100 text-red-700' : rec.priority === 2 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>Priority {rec.priority}</span></div>
                <p className="text-sm text-gray-700 mb-2">{rec.rationale}</p>
                <div className="grid grid-cols-2 gap-4 text-sm"><div><span className="text-gray-500">Expected Outcome:</span><p className="font-medium">{rec.expectedOutcome}</p></div><div><span className="text-gray-500">Timeframe:</span><p className="font-medium">{rec.timeframe}</p></div></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Outlook */}
      {reportData.outlook && (
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl border border-indigo-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2"><Calendar className="w-5 h-5 text-indigo-500" />Outlook</h3>
          <div className="flex items-center gap-4 mb-4">
            <div className={`flex items-center gap-2 ${trajectoryConfig[reportData.outlook.trajectory]?.color || 'text-gray-600'}`}>{trajectoryConfig[reportData.outlook.trajectory]?.icon}<span className="font-medium">{reportData.outlook.trajectory}</span></div>
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${reportData.outlook.confidence === 'HIGH' ? 'bg-green-100 text-green-700' : reportData.outlook.confidence === 'LOW' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>{reportData.outlook.confidence} Confidence</span>
          </div>
          {reportData.outlook.nextPeriodFocus && <p className="text-gray-700 mb-4"><strong>Focus:</strong> {reportData.outlook.nextPeriodFocus}</p>}
          {reportData.outlook.keyRisksToMonitor && reportData.outlook.keyRisksToMonitor.length > 0 && (
            <div className="mb-4"><h4 className="text-sm font-semibold text-gray-700 mb-2">Risks to Monitor</h4><ul className="space-y-1">{reportData.outlook.keyRisksToMonitor.map((risk, idx) => <li key={idx} className="flex items-start gap-2 text-sm text-gray-700"><AlertTriangle className="w-3 h-3 text-amber-500 mt-1" />{risk}</li>)}</ul></div>
          )}
          {reportData.outlook.catalysts && reportData.outlook.catalysts.length > 0 && (
            <div><h4 className="text-sm font-semibold text-gray-700 mb-2">Growth Catalysts</h4><ul className="space-y-1">{reportData.outlook.catalysts.map((catalyst, idx) => <li key={idx} className="flex items-start gap-2 text-sm text-gray-700"><TrendingUp className="w-3 h-3 text-green-500 mt-1" />{catalyst}</li>)}</ul></div>
          )}
        </div>
      )}
    </div>
  );
};

export default MonthlyBoardReport;
