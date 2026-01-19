// components/insights/WeeklyOpsReport.tsx
// Weekly Operations Report Renderer - Orchestrates all sections for WEEKLY_OPS reports

import React from 'react';
import { FileText, Calendar, Clock, Cpu, DollarSign, Database } from 'lucide-react';

import { WeekSummaryCard } from './WeekSummaryCard';
import { WeeklyMetricsGrid } from './WeeklyMetricsGrid';
import { ProblemGamesPanel } from './ProblemGamesPanel';
import { WinningGamesPanel } from './WinningGamesPanel';
import { OverlayReportPanel } from './OverlayReportPanel';
import { ScheduleHealthPanel } from './ScheduleHealthPanel';
import { RecurringGameHealthPanel } from './RecurringGameHealthPanel';
import { VenueQuickViewPanel } from './VenueQuickViewPanel';
import { CompetitorWatchPanel } from './CompetitorWatchPanel';
import { OpportunitiesPanel } from './OpportunitiesPanel';
import { AlertsPanel } from './AlertsPanel';
import { FocusActionsPanel } from './FocusActionsPanel';
import { NextWeekWatchPanel } from './NextWeekWatchPanel';

import type { WeeklyOpsReportData, DirectorReport, MetricsPack } from '../../types/insights';

interface WeeklyOpsReportProps {
  report: DirectorReport;
  reportData: WeeklyOpsReportData;
  metricsPack?: MetricsPack | null;
  showMetadata?: boolean;
  showInsights?: boolean;
}

const formatDate = (dateStr: string): string => new Date(dateStr).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
const formatDateTime = (dateStr: string): string => new Date(dateStr).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const formatCost = (cost: number): string => cost < 0.01 ? `${(cost * 100).toFixed(2)}¢` : `$${cost.toFixed(4)}`;

export const WeeklyOpsReport: React.FC<WeeklyOpsReportProps> = ({ report, reportData, metricsPack, showMetadata = true, showInsights = true }) => {
  if (!reportData) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
        <FileText className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <p className="text-gray-500">No report data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {showMetadata && (
        <div className="bg-gray-50 rounded-xl border border-gray-200 p-4">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500">Period:</span>
              <span className="font-medium">{metricsPack?.periodLabel || report.periodKey}</span>
            </div>
            {report.periodStart && report.periodEnd && (
              <div className="text-gray-500">{formatDate(report.periodStart)} - {formatDate(report.periodEnd)}</div>
            )}
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-gray-400" />
              <span className="text-gray-500">Generated:</span>
              <span className="font-medium">{formatDateTime(report.generatedAt)}</span>
            </div>
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-gray-400" />
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">{report.modelName}</span>
            </div>
            {report.totalCost !== undefined && (
              <div className="flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">Cost:</span>
                <span className="font-medium">{formatCost(report.totalCost)}</span>
              </div>
            )}
            {report.inputTokens && report.outputTokens && (
              <div className="text-gray-500">{report.inputTokens.toLocaleString()} in / {report.outputTokens.toLocaleString()} out</div>
            )}
            {metricsPack && (
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-gray-400" />
                <span className="text-gray-500">Data:</span>
                <span className="font-medium">{metricsPack.gamesIncluded} games, {metricsPack.venuesIncluded} venues</span>
              </div>
            )}
            <div className="text-gray-500">v{report.reportVersion}</div>
          </div>
          {report.enhancedModulesUsed && report.enhancedModulesUsed.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-200 flex flex-wrap items-center gap-2">
              <span className="text-xs text-gray-500">Enhanced modules:</span>
              {report.enhancedModulesUsed.map((mod, idx) => (
                <span key={idx} className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">{mod.replace(/([A-Z])/g, ' $1').trim()}</span>
              ))}
            </div>
          )}
        </div>
      )}

      {reportData.weekSummary && <WeekSummaryCard summary={reportData.weekSummary} />}
      {reportData.metrics && <WeeklyMetricsGrid metrics={reportData.metrics} showInsights={showInsights} />}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {reportData.problemGames && reportData.problemGames.length > 0 && <ProblemGamesPanel games={reportData.problemGames} />}
        {reportData.winningGames && reportData.winningGames.length > 0 && <WinningGamesPanel games={reportData.winningGames} />}
      </div>

      {reportData.overlayReport && <OverlayReportPanel report={reportData.overlayReport} />}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {reportData.scheduleHealth && <ScheduleHealthPanel health={reportData.scheduleHealth} />}
        {reportData.recurringGameHealth && <RecurringGameHealthPanel health={reportData.recurringGameHealth} />}
      </div>

      {reportData.venueQuickView && reportData.venueQuickView.length > 0 && <VenueQuickViewPanel venues={reportData.venueQuickView} />}
      {reportData.competitorWatch && <CompetitorWatchPanel watch={reportData.competitorWatch} />}
      {reportData.opportunities && <OpportunitiesPanel opportunities={reportData.opportunities} />}
      {reportData.alerts && reportData.alerts.length > 0 && <AlertsPanel alerts={reportData.alerts} />}
      {reportData.thisWeekActions && reportData.thisWeekActions.length > 0 && <FocusActionsPanel actions={reportData.thisWeekActions} />}
      {reportData.nextWeekWatch && <NextWeekWatchPanel watch={reportData.nextWeekWatch} />}
    </div>
  );
};

export default WeeklyOpsReport;
