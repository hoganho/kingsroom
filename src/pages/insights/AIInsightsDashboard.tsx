// pages/insights/AIInsightsDashboard.tsx
// AI Insights Dashboard - Main page for viewing and generating reports

import React, { useState, useEffect } from 'react';
import { useEntity } from '../../contexts/EntityContext';
import { useAIInsights, parsePackData, parseReportData } from '../../hooks/useAIInsights';
import { Card } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { LoadingState } from '../../components/ui/LoadingState';
import { ErrorAlert } from '../../components/ui/ErrorAlert';
import { PageHeader } from '../../components/ui/PageHeader';
import { 
  ReportType, 
  type MetricsPack, 
  type DirectorReport, 
  type PackData, 
  type DirectorReportData 
} from '../../types/insights';

// Components
import { ExecutiveSummary } from '../../components/insights/ExecutiveSummary';
import { KeyMetricsGrid } from '../../components/insights/KeyMetricsGrid';
import { AlertsPanel } from '../../components/insights/AlertsPanel';
import { FocusActionsPanel } from '../../components/insights/FocusActionsPanel';
import { VenueCallouts } from '../../components/insights/VenueCallouts';
import { ReportMetadata } from '../../components/insights/ReportMetadata';
import { OpportunitiesPanel } from '../../components/insights/OpportunitiesPanel';

const REPORT_TYPE_OPTIONS: { value: ReportType; label: string }[] = [
  { value: ReportType.WEEKLY_OPS, label: 'Weekly Operations' },
  { value: ReportType.MONTHLY_BOARD, label: 'Monthly Board' },
];

const MODEL_OPTIONS = [
  { value: 'gpt-4o', label: 'GPT-4o (Default)' },
  { value: 'gpt-4o-mini', label: 'GPT-4o Mini (Faster)' },
  { value: 'claude-sonnet', label: 'Claude Sonnet' },
  { value: 'claude-haiku', label: 'Claude Haiku (Fastest)' },
];

export const AIInsightsDashboard: React.FC = () => {
  const { currentEntity: selectedEntity } = useEntity();
  const {
    loading,
    error,
    generating,
    generatingAI,
    generatePack,
    generateReport,
    getLatestPack,
    listReports,
    clearError,
  } = useAIInsights();

  // State
  const [reportType, setReportType] = useState<ReportType>(ReportType.WEEKLY_OPS);
  const [selectedModel, setSelectedModel] = useState('gpt-4o');
  const [metricsPack, setMetricsPack] = useState<MetricsPack | null>(null);
  const [directorReport, setDirectorReport] = useState<DirectorReport | null>(null);
  const [packData, setPackData] = useState<PackData | null>(null);
  const [reportData, setReportData] = useState<DirectorReportData | null>(null);
  const [recentReports, setRecentReports] = useState<DirectorReport[]>([]);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Load data when entity or report type changes
  useEffect(() => {
    if (selectedEntity?.id) {
      loadData();
    }
  }, [selectedEntity?.id, reportType]);

  const loadData = async () => {
    if (!selectedEntity?.id) return;

    // Load latest metrics pack
    const pack = await getLatestPack(selectedEntity.id, reportType);
    if (pack) {
      setMetricsPack(pack);
      setPackData(parsePackData(pack.packData));
    } else {
      setMetricsPack(null);
      setPackData(null);
    }

    // Load recent reports
    const reports = await listReports(selectedEntity.id, 10);
    const filtered = reports.filter(r => r.reportType === reportType);
    setRecentReports(filtered);
    
    // Set most recent report if exists
    if (filtered.length > 0) {
      const latest = filtered[0];
      setDirectorReport(latest);
      setReportData(parseReportData(latest.reportData));
    } else {
      setDirectorReport(null);
      setReportData(null);
    }
  };

  // Generate new MetricsPack
  const handleGenerateMetricsPack = async () => {
    if (!selectedEntity?.id) return;
    
    setStatusMessage({ type: 'info', message: 'Generating metrics pack...' });
    
    const result = await generatePack(selectedEntity.id, reportType);
    
    if (result.success) {
      if (result.metricsPack) {
        setMetricsPack(result.metricsPack);
        setPackData(parsePackData(result.metricsPack.packData));
      }
      const duration = result.generationDurationMs ? `${(result.generationDurationMs / 1000).toFixed(1)}s` : '';
      setStatusMessage({ 
        type: 'success', 
        message: `Metrics pack generated${duration ? ` in ${duration}` : ''}. ${result.metricsPack?.gamesIncluded || 0} games included.`
      });
    } else {
      setStatusMessage({ type: 'error', message: result.error || 'Failed to generate metrics pack' });
    }
  };

  // Generate AI Director Report
  const handleGenerateAIReport = async () => {
    if (!selectedEntity?.id || !metricsPack) return;
    
    setStatusMessage({ type: 'info', message: 'Generating AI report (this may take 30-60 seconds)...' });
    
    const result = await generateReport(
      selectedEntity.id,
      reportType,
      metricsPack.periodKey,
      {
        metricsPackId: metricsPack.id,
        model: selectedModel,
      }
    );
    
    if (result.success) {
      if (result.directorReport) {
        setDirectorReport(result.directorReport);
        setReportData(parseReportData(result.directorReport.reportData));
      }
      const duration = result.generationDurationMs ? `${(result.generationDurationMs / 1000).toFixed(1)}s` : '';
      const cost = result.tokenUsage?.totalCost?.toFixed(4) || '0';
      setStatusMessage({ 
        type: 'success', 
        message: `AI report generated${duration ? ` in ${duration}` : ''} (cost: $${cost})`
      });
      loadData(); // Refresh list
    } else {
      setStatusMessage({ type: 'error', message: result.error || 'Failed to generate AI report' });
    }
  };

  // Handle selecting a previous report
  const handleSelectReport = (report: DirectorReport) => {
    setDirectorReport(report);
    setReportData(parseReportData(report.reportData));
  };

  // No entity selected
  if (!selectedEntity) {
    return (
      <div className="p-6">
        <PageHeader title="AI Insights" />
        <Card className="p-8 text-center">
          <p className="text-gray-500">Please select an entity to view insights.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <PageHeader 
        title="AI Insights" 
        subtitle={`Intelligence reports for ${selectedEntity.entityName}`}
      />

      {/* Controls Bar */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Report Type Selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Report Type:</label>
            <select
              value={reportType}
              onChange={(e) => setReportType(e.target.value as ReportType)}
              className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            >
              {REPORT_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          
          {/* Model Selector */}
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">AI Model:</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            >
              {MODEL_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 ml-auto">
            <Button 
              variant="secondary" 
              onClick={handleGenerateMetricsPack} 
              disabled={generating}
            >
              {generating ? 'Generating...' : 'Generate Metrics Pack'}
            </Button>
            <Button 
              onClick={handleGenerateAIReport} 
              disabled={generatingAI || !metricsPack}
            >
              {generatingAI ? 'Generating AI Report...' : 'Generate AI Report'}
            </Button>
          </div>
        </div>
        
        {/* Status message */}
        {statusMessage && (
          <div className={`mt-3 text-sm px-3 py-2 rounded ${
            statusMessage.type === 'error' 
              ? 'bg-red-50 text-red-700 border border-red-200' 
              : statusMessage.type === 'success'
              ? 'bg-green-50 text-green-700 border border-green-200'
              : 'bg-blue-50 text-blue-700 border border-blue-200'
          }`}>
            {statusMessage.message}
          </div>
        )}
      </Card>

      {/* Error display */}
      {error && <ErrorAlert message={error} onDismiss={clearError} />}

      {/* Loading state */}
      {loading && !packData && !reportData && (
        <LoadingState message="Loading insights data..." />
      )}

      {/* No data state */}
      {!loading && !packData && !reportData && (
        <Card className="p-8 text-center">
          <div className="max-w-md mx-auto">
            <div className="text-6xl mb-4">📊</div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Reports Yet</h3>
            <p className="text-gray-500 mb-6">
              Generate a metrics pack to calculate KPIs from your GameFinancialSnapshot data,
              then generate an AI report for narrative insights and recommendations.
            </p>
            <Button onClick={handleGenerateMetricsPack} disabled={generating}>
              Generate Metrics Pack
            </Button>
          </div>
        </Card>
      )}

      {/* Metrics Pack Ready but no AI Report */}
      {packData && !reportData && (
        <div className="space-y-6">
          <Card className="p-4 bg-blue-50 border-blue-200">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-blue-900">✅ Metrics Pack Ready</h3>
                <p className="text-sm text-blue-700">
                  Period: {metricsPack?.periodLabel} • 
                  {packData.strategic?.totalGamesRun || 0} games • 
                  {packData.venues?.length || 0} venues •
                  ${(packData.strategic?.totalRevenue || 0).toLocaleString()} revenue
                </p>
              </div>
              <Button onClick={handleGenerateAIReport} disabled={generatingAI}>
                Generate AI Report
              </Button>
            </div>
          </Card>
          
          {/* Show raw metrics while waiting for AI report */}
          <KeyMetricsGrid metrics={packData.strategic} showInsights={false} />
          
          {packData.alerts && packData.alerts.length > 0 && (
            <AlertsPanel alerts={packData.alerts} showRecommendations={false} />
          )}
          
          {packData.venues && packData.venues.length > 0 && (
            <VenueCallouts venues={packData.venues} isRawData />
          )}
        </div>
      )}

      {/* Full AI Report */}
      {reportData && (
        <div className="space-y-6">
          {/* Report Metadata */}
          <ReportMetadata 
            report={directorReport}
            metricsPack={metricsPack}
          />
          
          {/* Executive Summary */}
          {reportData.executiveSummary && (
            <ExecutiveSummary summary={reportData.executiveSummary} />
          )}
          
          {/* Key Metrics */}
          {reportData.keyMetrics && (
            <KeyMetricsGrid 
              metrics={reportData.keyMetrics} 
              showInsights 
            />
          )}
          
          {/* Alerts */}
          {reportData.alerts && reportData.alerts.length > 0 && (
            <AlertsPanel 
              alerts={reportData.alerts}
              showRecommendations
            />
          )}
          
          {/* Focus Actions */}
          {reportData.focusActions && reportData.focusActions.length > 0 && (
            <FocusActionsPanel actions={reportData.focusActions} />
          )}
          
          {/* Venue Callouts */}
          {reportData.venueCallouts && reportData.venueCallouts.length > 0 && (
            <VenueCallouts venues={reportData.venueCallouts} />
          )}
          
          {/* Opportunities */}
          {reportData.opportunities && reportData.opportunities.length > 0 && (
            <OpportunitiesPanel opportunities={reportData.opportunities} />
          )}
          
          {/* Competitor Insights */}
          {reportData.competitorInsights && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Competitor Insights</h3>
              <p className="text-gray-700 mb-4">{reportData.competitorInsights.summary}</p>
              
              {reportData.competitorInsights.threats && reportData.competitorInsights.threats.length > 0 && (
                <div className="mb-4">
                  <h4 className="font-medium text-gray-900 mb-2">Threats</h4>
                  <div className="space-y-2">
                    {reportData.competitorInsights.threats.map((threat, idx) => (
                      <div key={idx} className="p-3 bg-red-50 rounded border border-red-200">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{threat.competitor}</span>
                          <Badge variant={threat.threatLevel === 'HIGH' ? 'error' : threat.threatLevel === 'MEDIUM' ? 'warning' : 'default'}>
                            {threat.threatLevel}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-700 mt-1">{threat.threat}</p>
                        <p className="text-sm text-blue-600 mt-1">
                          <strong>Response:</strong> {threat.suggestedResponse}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
          
          {/* Week Ahead Outlook */}
          {reportData.weekAheadOutlook && (
            <Card className="p-6">
              <h3 className="text-lg font-semibold mb-4">Week Ahead Outlook</h3>
              <p className="text-gray-700 mb-4">
                <strong>Focus:</strong> {reportData.weekAheadOutlook.suggestedFocus}
              </p>
              
              {reportData.weekAheadOutlook.watchItems && reportData.weekAheadOutlook.watchItems.length > 0 && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Watch Items</h4>
                  <ul className="list-disc list-inside space-y-1 text-gray-600">
                    {reportData.weekAheadOutlook.watchItems.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
        </div>
      )}

      {/* Recent Reports List */}
      {recentReports.length > 0 && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Recent Reports</h3>
          <div className="space-y-2">
            {recentReports.map((report) => (
              <div 
                key={report.id}
                className={`p-3 rounded border cursor-pointer transition-colors ${
                  directorReport?.id === report.id 
                    ? 'bg-indigo-50 border-indigo-300' 
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                }`}
                onClick={() => handleSelectReport(report)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{report.periodKey}</span>
                    <Badge variant="default">v{report.reportVersion}</Badge>
                    <span className="text-gray-500 text-sm">{report.modelName}</span>
                  </div>
                  <div className="text-sm text-gray-500">
                    {new Date(report.generatedAt).toLocaleDateString()}
                    {report.totalCost && ` • $${report.totalCost.toFixed(4)}`}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
};

export default AIInsightsDashboard;