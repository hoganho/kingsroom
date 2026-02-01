// pages/insights/AIInsightsDashboard.tsx
// AI Insights Dashboard - Main page for viewing and generating reports
// VERSION: 2.1.0 - Added prominent entity display indicator

import React, { useState, useEffect, useCallback, useMemo } from 'react';

// Project-specific imports
import { useEntity } from '../../contexts/EntityContext';
import { useAIInsights, parsePackData, parseReportData, ReportStatus, type GenerationStatus } from '../../hooks/useAIInsights';
import type { PeriodSelectionInput } from '../../API';
import { type PeriodSelectorState, selectorStateToPeriodInput, getPeriodLabel, getDefaultSelectorState, isValidSelection } from '../../types/periodSelection';
import { PeriodSelector } from '../../components/ui/PeriodSelector';

// Types
import { ReportType, isWeeklyOpsReport, isMonthlyBoardReport, type MetricsPack, type DirectorReport, type PackData, type WeeklyOpsReportData, type MonthlyBoardReportData } from '../../types/insights';

// Components
import { WeeklyOpsReport } from '../../components/insights/WeeklyOpsReport';
import { MonthlyBoardReport } from '../../components/insights/MonthlyBoardReport';
import { ReportDownloadButton } from '../../components/insights/ReportDownloadButton';
import { WeeklyMetricsGrid } from '../../components/insights/WeeklyMetricsGrid';
import { VenueQuickViewPanel } from '../../components/insights/VenueQuickViewPanel';

// Icons
import { FileText, RefreshCw, ChevronRight, ChevronDown, Calendar, BarChart3, Sparkles, Clock, CheckCircle2, AlertCircle, DollarSign, Zap, Database, History, Loader2, XCircle, Building2, MapPin, Gamepad2 } from 'lucide-react';

// ===================================================================
// MODEL CONFIGURATION
// ===================================================================

interface ModelOption {
  id: string;
  provider: 'openai' | 'anthropic';
  displayName: string;
  description: string;
  inputPrice: number;
  outputPrice: number;
  tier: 'economy' | 'standard' | 'premium';
  recommended: boolean;
}

const MODEL_OPTIONS: ModelOption[] = [
  { id: 'gpt-4o-mini', provider: 'openai', displayName: 'GPT-4o Mini', description: 'Fast, cheap, good quality', inputPrice: 0.15, outputPrice: 0.60, tier: 'standard', recommended: true },
  { id: 'gpt-4o', provider: 'openai', displayName: 'GPT-4o', description: 'Highest quality OpenAI', inputPrice: 2.50, outputPrice: 10.00, tier: 'premium', recommended: false },
  { id: 'gpt-4.1-mini', provider: 'openai', displayName: 'GPT-4.1 Mini', description: 'Latest mini, 1M context', inputPrice: 0.40, outputPrice: 1.60, tier: 'standard', recommended: false },
  { id: 'gpt-4.1-nano', provider: 'openai', displayName: 'GPT-4.1 Nano', description: 'Cheapest option', inputPrice: 0.10, outputPrice: 0.40, tier: 'economy', recommended: false },
  { id: 'claude-sonnet', provider: 'anthropic', displayName: 'Claude 4 Sonnet', description: 'Balanced quality & cost', inputPrice: 3.00, outputPrice: 15.00, tier: 'standard', recommended: false },
  { id: 'claude-haiku', provider: 'anthropic', displayName: 'Claude 4 Haiku', description: 'Fast and very cheap', inputPrice: 0.25, outputPrice: 1.25, tier: 'economy', recommended: false },
  { id: 'claude-opus', provider: 'anthropic', displayName: 'Claude 4 Opus', description: 'Most capable Claude', inputPrice: 15.00, outputPrice: 75.00, tier: 'premium', recommended: false },
];

const DEFAULT_MODEL = 'gpt-4o-mini';
const ESTIMATED_INPUT_TOKENS = 14000;
const ESTIMATED_OUTPUT_TOKENS = 4000;

const REPORT_TYPE_OPTIONS = [
  { value: ReportType.WEEKLY_OPS, label: 'Weekly Ops', description: 'Operational weekly review' },
  { value: ReportType.MONTHLY_BOARD, label: 'Monthly Board', description: 'Board-level monthly report' },
];

// ===================================================================
// HELPERS
// ===================================================================

const formatDate = (dateStr: string | null | undefined): string => {
  if (!dateStr) return 'No date';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Invalid Date';
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
};
const formatDateTime = (dateStr: string | null | undefined): string => {
  if (!dateStr) return 'No date';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return 'Invalid Date';
  return date.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const formatCurrency = (value: number): string => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value);
const formatCost = (cost: number): string => cost < 0.01 ? `${(cost * 100).toFixed(2)}¢` : `$${cost.toFixed(4)}`;
const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
};

function estimateCost(model: ModelOption): { totalCost: number } {
  const inputCost = (ESTIMATED_INPUT_TOKENS / 1_000_000) * model.inputPrice;
  const outputCost = (ESTIMATED_OUTPUT_TOKENS / 1_000_000) * model.outputPrice;
  return { totalCost: inputCost + outputCost };
}

// ===================================================================
// ENTITY INDICATOR COMPONENT
// ===================================================================

interface EntityIndicatorProps {
  entityName: string;
  entityLogo?: string | null;
}

const EntityIndicator: React.FC<EntityIndicatorProps> = ({ entityName, entityLogo }) => {
  return (
    <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-xl">
      <div className="flex-shrink-0">
        {entityLogo ? (
          <img 
            src={entityLogo} 
            alt={entityName} 
            className="w-10 h-10 rounded-lg object-cover ring-2 ring-indigo-200"
          />
        ) : (
          <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center ring-2 ring-indigo-200">
            <Building2 className="w-5 h-5 text-indigo-600" />
          </div>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-indigo-600 uppercase tracking-wide">Generating Reports For</div>
        <div className="text-lg font-semibold text-gray-900 truncate">{entityName}</div>
      </div>
      <div className="flex-shrink-0">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
          <Database className="w-3 h-3" />
          Active
        </span>
      </div>
    </div>
  );
};

// ===================================================================
// PACK DETAILS EXPANDER COMPONENT
// ===================================================================

interface PackDetailsExpanderProps {
  packData: PackData | null;
  metricsPack: MetricsPack;
}

const PackDetailsExpander: React.FC<PackDetailsExpanderProps> = ({ packData, metricsPack }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [expandedVenues, setExpandedVenues] = useState<Set<string>>(new Set());

  const toggleVenue = (venueName: string) => {
    setExpandedVenues(prev => {
      const next = new Set(prev);
      if (next.has(venueName)) {
        next.delete(venueName);
      } else {
        next.add(venueName);
      }
      return next;
    });
  };

  // Get venues data - cast to allow flexible property access for different pack structures
  const packDataAny = packData as Record<string, unknown> | null;
  const venues = (packDataAny?.venues || []) as Array<{ venueName: string; totalProfit: number; totalGames: number; avgProfitPerGame?: number; overallHealth?: string; trendCategory?: string }>;
  const games = (packDataAny?.games || []) as Array<{ venueName?: string; venue?: string; gameName?: string; profit?: number; entries?: number }>;
  // Note: games array comes from rankings.games in packData, not top-level

  // Group games by venue if we have game-level data
  const gamesByVenue = useMemo(() => {
    const grouped: Record<string, any[]> = {};
    games.forEach((game: any) => {
      const venueName = game.venueName || game.venue || 'Unknown Venue';
      if (!grouped[venueName]) {
        grouped[venueName] = [];
      }
      grouped[venueName].push(game);
    });
    return grouped;
  }, [games]);

  // Combine venue data with games
  const venueDetails = useMemo(() => {
    return venues.map((venue: any) => ({
      ...venue,
      games: gamesByVenue[venue.venueName] || [],
    }));
  }, [venues, gamesByVenue]);

  // Always show the expander if we have pack metadata (even without detailed venue data)
  const hasAnyData = venues.length > 0 || metricsPack.venuesIncluded > 0;

  if (!hasAnyData) {
    return null;
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-gray-500" />
          <span className="font-medium text-gray-700">Data Included in Pack</span>
          <span className="text-sm text-gray-500">
            ({metricsPack.venuesIncluded} venues, {metricsPack.gamesIncluded} games)
          </span>
        </div>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
      </button>
      
      {isExpanded && (
        <div className="divide-y divide-gray-100">
          {/* Show venue details if we have them */}
          {venueDetails.length > 0 ? (
            venueDetails.map((venue: any, idx: number) => {
              const isVenueExpanded = expandedVenues.has(venue.venueName);
              const venueGames = venue.games || [];
              const gameCount = venue.totalGames || venueGames.length || 0;
              
              return (
                <div key={venue.venueName || idx} className="bg-white">
                  <button
                    onClick={() => toggleVenue(venue.venueName)}
                    className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                        <MapPin className="w-4 h-4 text-indigo-600" />
                      </div>
                      <div className="text-left">
                        <div className="font-medium text-gray-900">{venue.venueName}</div>
                        <div className="text-sm text-gray-500 flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Gamepad2 className="w-3 h-3" />
                            {gameCount} games
                          </span>
                          {venue.totalProfit !== undefined && (
                            <span className={venue.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}>
                              {formatCurrency(venue.totalProfit)}
                            </span>
                          )}
                          {venue.overallHealth && (
                            <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                              venue.overallHealth === 'EXCELLENT' ? 'bg-green-100 text-green-700' :
                              venue.overallHealth === 'GOOD' ? 'bg-blue-100 text-blue-700' :
                              venue.overallHealth === 'NEEDS_ATTENTION' ? 'bg-amber-100 text-amber-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {venue.overallHealth.replace('_', ' ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    {venueGames.length > 0 && (
                      <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isVenueExpanded ? 'rotate-90' : ''}`} />
                    )}
                  </button>
                  
                  {/* Games list for this venue */}
                  {isVenueExpanded && venueGames.length > 0 && (
                    <div className="bg-gray-50 px-4 py-2 border-t border-gray-100">
                      <div className="ml-11 space-y-1">
                        {venueGames.map((game: any, gameIdx: number) => (
                          <div 
                            key={game.id || game.gameId || gameIdx} 
                            className="flex items-center justify-between py-2 px-3 bg-white rounded-lg text-sm"
                          >
                            <div className="flex items-center gap-2">
                              <Gamepad2 className="w-3.5 h-3.5 text-gray-400" />
                              <span className="text-gray-700">
                                {game.gameName || game.name || `Game ${gameIdx + 1}`}
                              </span>
                              {game.gameDate && (
                                <span className="text-gray-400 text-xs">
                                  {formatDate(game.gameDate)}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs">
                              {game.entries !== undefined && (
                                <span className="text-gray-500">{game.entries} entries</span>
                              )}
                              {game.profit !== undefined && (
                                <span className={game.profit >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                                  {formatCurrency(game.profit)}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Show placeholder if no game-level data */}
                  {isVenueExpanded && venueGames.length === 0 && gameCount > 0 && (
                    <div className="bg-gray-50 px-4 py-3 border-t border-gray-100">
                      <div className="ml-11 text-sm text-gray-500 italic">
                        {gameCount} games included (detailed game list not available in pack data)
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          ) : (
            /* Fallback when we have counts but no detailed venue data */
            <div className="bg-white p-4">
              <div className="text-sm text-gray-600 space-y-2">
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-indigo-500" />
                  <span><strong>{metricsPack.venuesIncluded}</strong> venues included in this pack</span>
                </div>
                <div className="flex items-center gap-2">
                  <Gamepad2 className="w-4 h-4 text-indigo-500" />
                  <span><strong>{metricsPack.gamesIncluded}</strong> games included in this pack</span>
                </div>
                <p className="text-xs text-gray-400 mt-2 italic">
                  Detailed venue and game breakdown not available in pack data structure.
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ===================================================================
// GENERATION PROGRESS COMPONENT
// ===================================================================

interface GenerationProgressProps {
  status: GenerationStatus;
  onCancel?: () => void;
}

const GenerationProgress: React.FC<GenerationProgressProps> = ({ status, onCancel }) => {
  const getStatusColor = () => {
    switch (status.status) {
      case ReportStatus.PENDING: return 'text-amber-600 bg-amber-50 border-amber-200';
      case ReportStatus.GENERATING: return 'text-blue-600 bg-blue-50 border-blue-200';
      case ReportStatus.COMPLETED: return 'text-green-600 bg-green-50 border-green-200';
      case ReportStatus.FAILED: return 'text-red-600 bg-red-50 border-red-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const getStatusIcon = () => {
    switch (status.status) {
      case ReportStatus.PENDING: return <Clock className="w-5 h-5 animate-pulse" />;
      case ReportStatus.GENERATING: return <Loader2 className="w-5 h-5 animate-spin" />;
      case ReportStatus.COMPLETED: return <CheckCircle2 className="w-5 h-5" />;
      case ReportStatus.FAILED: return <XCircle className="w-5 h-5" />;
      default: return <Loader2 className="w-5 h-5" />;
    }
  };

  const getStatusLabel = () => {
    switch (status.status) {
      case ReportStatus.PENDING: return 'Queued';
      case ReportStatus.GENERATING: return 'Generating';
      case ReportStatus.COMPLETED: return 'Complete';
      case ReportStatus.FAILED: return 'Failed';
      default: return 'Processing';
    }
  };

  return (
    <div className={`rounded-xl border p-4 ${getStatusColor()}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {getStatusIcon()}
          <div>
            <div className="font-medium">{getStatusLabel()}</div>
            <div className="text-sm opacity-75">{status.statusMessage}</div>
          </div>
        </div>
        {onCancel && status.status !== ReportStatus.COMPLETED && status.status !== ReportStatus.FAILED && (
          <button
            onClick={onCancel}
            className="px-3 py-1 text-sm rounded-lg border border-current opacity-60 hover:opacity-100 transition-opacity"
          >
            Cancel
          </button>
        )}
      </div>
      
      {/* Progress bar */}
      {status.status !== ReportStatus.FAILED && (
        <div className="w-full bg-white/50 rounded-full h-2 mb-2">
          <div 
            className={`h-2 rounded-full transition-all duration-500 ${
              status.status === ReportStatus.COMPLETED ? 'bg-green-500' : 'bg-current opacity-50'
            }`}
            style={{ width: `${status.progress || 0}%` }}
          />
        </div>
      )}
      
      {/* Stats */}
      <div className="flex items-center gap-4 text-xs opacity-75">
        <span>Elapsed: {formatDuration(status.elapsedMs)}</span>
        {status.pollCount > 0 && <span>Checks: {status.pollCount}</span>}
      </div>
    </div>
  );
};

// ===================================================================
// MODEL SELECTOR
// ===================================================================

const ModelSelector: React.FC<{ value: string; onChange: (id: string) => void; className?: string; disabled?: boolean }> = ({ value, onChange, className = '', disabled = false }) => {
  const selectedModel = MODEL_OPTIONS.find(m => m.id === value) || MODEL_OPTIONS[0];
  const estimate = useMemo(() => estimateCost(selectedModel), [selectedModel]);

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-gray-700">AI Model:</label>
        <select 
          value={value} 
          onChange={(e) => onChange(e.target.value)} 
          disabled={disabled}
          className="flex-1 border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <optgroup label="OpenAI">
            {MODEL_OPTIONS.filter(m => m.provider === 'openai').map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.displayName} - {opt.description} {opt.recommended ? '⭐' : ''}</option>
            ))}
          </optgroup>
          <optgroup label="Anthropic Claude">
            {MODEL_OPTIONS.filter(m => m.provider === 'anthropic').map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.displayName} - {opt.description}</option>
            ))}
          </optgroup>
        </select>
      </div>
      <div className="flex items-center gap-4 p-2 bg-gray-50 rounded-lg text-sm">
        <div className="flex items-center gap-1 text-gray-600">
          <DollarSign className="w-4 h-4" />
          <span>Est. cost:</span>
          <span className="font-semibold text-gray-900">{formatCost(estimate.totalCost)}</span>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${selectedModel.tier === 'economy' ? 'bg-green-100 text-green-700' : selectedModel.tier === 'premium' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-700'}`}>
          {selectedModel.tier === 'economy' ? 'Budget' : selectedModel.tier === 'premium' ? 'Premium' : 'Standard'}
        </span>
        {selectedModel.recommended && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 flex items-center gap-1"><Zap className="w-3 h-3" />Recommended</span>}
      </div>
    </div>
  );
};

// ===================================================================
// REPORT RENDERER
// ===================================================================

const ReportRenderer: React.FC<{ 
  report: DirectorReport; 
  reportData: WeeklyOpsReportData | MonthlyBoardReportData | string; 
  metricsPack?: MetricsPack | null 
}> = ({ report, reportData, metricsPack }) => {
  // Parse the data if it's still a string
  const parsedData = typeof reportData === 'string' ? parseReportData(reportData) : reportData;
  
  if (!parsedData) {
    return <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">Failed to parse report data</div>;
  }

  const reportTypeStr = String(report.reportType);
  
  if (reportTypeStr === 'WEEKLY_OPS' && isWeeklyOpsReport(parsedData)) {
    return <WeeklyOpsReport report={report} reportData={parsedData} metricsPack={metricsPack} showMetadata={true} showInsights={true} />;
  }
  
  if (reportTypeStr === 'MONTHLY_BOARD' && isMonthlyBoardReport(parsedData)) {
    return <MonthlyBoardReport report={report} reportData={parsedData} metricsPack={metricsPack} showMetadata={true} />;
  }
  
  return <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">Unknown report type: {reportTypeStr}</div>;
};

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const AIInsightsDashboard: React.FC = () => {
  const { currentEntity: selectedEntity } = useEntity();
  const { 
    error, 
    generating, 
    generatingAI, 
    generationStatus,
    generatePack, 
    generateReport, 
    listPacks, 
    listReports,
    clearError,
    clearGenerationStatus,
    cancelPolling,
  } = useAIInsights();

  // State
  const [viewMode, setViewMode] = useState<'list' | 'generate'>('list');
  const [reportType, setReportType] = useState<ReportType>(ReportType.WEEKLY_OPS);
  const [selectedModel, setSelectedModel] = useState(DEFAULT_MODEL);
  const [periodState, setPeriodState] = useState<PeriodSelectorState>(getDefaultSelectorState());
  const [metricsPacks, setMetricsPacks] = useState<MetricsPack[]>([]);
  const [directorReports, setDirectorReports] = useState<DirectorReport[]>([]);
  const [loadingPacks, setLoadingPacks] = useState(false);

  const [selectedPack, setSelectedPack] = useState<MetricsPack | null>(null);
  const [selectedPackData, setSelectedPackData] = useState<PackData | null>(null);
  const [selectedReport, setSelectedReport] = useState<DirectorReport | null>(null);
  const [selectedReportData, setSelectedReportData] = useState<WeeklyOpsReportData | MonthlyBoardReportData | null>(null);

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  // Data Loading
  const loadData = useCallback(async () => {
    if (!selectedEntity?.id) return;
    setLoadingPacks(true);
    try {
      const packs = await listPacks(selectedEntity.id, 50);
      const filtered = packs
        .filter((p: MetricsPack) => p.reportType === reportType)
        .sort((a: MetricsPack, b: MetricsPack) => new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime());
      setMetricsPacks(filtered);
      const reports = await listReports(selectedEntity.id, 50);
      setDirectorReports(reports);
      if (selectedPack && !filtered.find((p: MetricsPack) => p.id === selectedPack.id)) {
        setSelectedPack(null);
        setSelectedPackData(null);
        setSelectedReport(null);
        setSelectedReportData(null);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoadingPacks(false);
    }
  }, [selectedEntity?.id, reportType, listPacks, listReports, selectedPack]);

  useEffect(() => { loadData(); }, [loadData]);

  // Clear status message after delay
  useEffect(() => {
    if (statusMessage?.type === 'success') {
      const timer = setTimeout(() => setStatusMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [statusMessage]);

  // Pack/Report Selection
  const handleSelectPack = (pack: MetricsPack) => {
    setSelectedPack(pack);
    setSelectedPackData(parsePackData(pack.packData));
    const existingReport = directorReports.find((r) => r.metricsPackId === pack.id || (r.entityId === pack.entityId && r.periodKey === pack.periodKey && r.reportType === pack.reportType));
    if (existingReport) {
      setSelectedReport(existingReport);
      setSelectedReportData(parseReportData(existingReport.reportData) as WeeklyOpsReportData | MonthlyBoardReportData | null);
    } else {
      setSelectedReport(null);
      setSelectedReportData(null);
    }
  };

  const getReportForPack = (pack: MetricsPack): DirectorReport | undefined => directorReports.find((r) => r.metricsPackId === pack.id || (r.entityId === pack.entityId && r.periodKey === pack.periodKey && r.reportType === pack.reportType));

  // Handlers
  const handleGenerateMetricsPack = async () => {
    if (!selectedEntity?.id) return;
    if (!isValidSelection(periodState)) { setStatusMessage({ type: 'error', message: 'Please select a valid period' }); return; }
    const periodInput = selectorStateToPeriodInput(periodState);
    setStatusMessage({ type: 'info', message: `Generating metrics pack for ${getPeriodLabel(periodState)}...` });
    const result = await generatePack(selectedEntity.id, reportType, { periodSelection: periodInput as PeriodSelectionInput | undefined, includeComparison: true });
    if (result.success) {
      const duration = result.generationDurationMs ? `${(result.generationDurationMs / 1000).toFixed(1)}s` : '';
      setStatusMessage({ type: 'success', message: `Metrics pack generated${duration ? ` in ${duration}` : ''}. ${result.metricsPack?.gamesIncluded || 0} games included.` });
      await loadData();
      if (result.metricsPack) handleSelectPack(result.metricsPack);
      setViewMode('list');
    } else {
      setStatusMessage({ type: 'error', message: result.error || 'Failed to generate metrics pack' });
    }
  };

  const handleGenerateAIReport = async () => {
    if (!selectedEntity?.id || !selectedPack) return;
    
    const modelInfo = MODEL_OPTIONS.find(m => m.id === selectedModel);
    const estimate = modelInfo ? estimateCost(modelInfo) : null;
    const costStr = estimate ? ` (est. ${formatCost(estimate.totalCost)})` : '';
    
    setStatusMessage({ type: 'info', message: `Generating AI report with ${modelInfo?.displayName || selectedModel}${costStr}...` });
    clearGenerationStatus();
    
    const result = await generateReport(selectedEntity.id, reportType, { 
      periodKey: selectedPack.periodKey, 
      metricsPackId: selectedPack.id, 
      model: selectedModel,
      onStatusUpdate: (status) => {
        // Optional: Log status updates
        console.log('Generation status:', status);
      },
    });
    
    if (result.success && result.directorReport) {
      setSelectedReport(result.directorReport);
      setSelectedReportData(parseReportData(result.directorReport.reportData) as WeeklyOpsReportData | MonthlyBoardReportData | null);
      const cost = result.tokenUsage?.totalCost ? ` (${formatCost(result.tokenUsage.totalCost)})` : '';
      const tokens = result.directorReport.inputTokens && result.directorReport.outputTokens 
        ? ` • ${result.directorReport.inputTokens.toLocaleString()} in / ${result.directorReport.outputTokens.toLocaleString()} out` 
        : '';
      const duration = result.generationDurationMs ? ` in ${formatDuration(result.generationDurationMs)}` : '';
      setStatusMessage({ type: 'success', message: `AI report generated${duration}${cost}${tokens}` });
      const reports = await listReports(selectedEntity.id, 50);
      setDirectorReports(reports);
    } else {
      setStatusMessage({ type: 'error', message: result.error || 'Failed to generate AI report' });
    }
    
    // Clear generation status after completion
    setTimeout(() => clearGenerationStatus(), 2000);
  };

  const handleCancelGeneration = () => {
    cancelPolling();
    clearGenerationStatus();
    setStatusMessage({ type: 'info', message: 'Generation cancelled. Note: The report may still complete in the background.' });
  };

  // Render
  if (!selectedEntity) {
    return (
      <div className="p-8 text-center">
        <div className="max-w-md mx-auto">
          <Building2 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Entity Selected</h3>
          <p className="text-gray-500">Please select an entity from the sidebar dropdown to view AI Insights and generate reports.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 space-y-6">
      {/* Header with Entity Indicator */}
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">AI Insights</h1>
            <p className="text-gray-500">{REPORT_TYPE_OPTIONS.find(o => o.value === reportType)?.label} Report</p>
          </div>
        </div>
        
        {/* Prominent Entity Indicator */}
        <EntityIndicator 
          entityName={selectedEntity.entityName} 
          entityLogo={selectedEntity.entityLogo}
        />
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Report Type:</label>
            <select value={reportType} onChange={(e) => setReportType(e.target.value as ReportType)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm">
              {REPORT_TYPE_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setViewMode('list')} className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1 ${viewMode === 'list' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}>
              <BarChart3 className="w-4 h-4" />View Packs
            </button>
            <button onClick={() => setViewMode('generate')} className={`px-3 py-1.5 text-sm rounded-lg flex items-center gap-1 ${viewMode === 'generate' ? 'bg-indigo-100 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-100'}`}>
              <Sparkles className="w-4 h-4" />Generate New
            </button>
          </div>
          <button onClick={loadData} disabled={loadingPacks} className="ml-auto flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            <RefreshCw className={`w-4 h-4 ${loadingPacks ? 'animate-spin' : ''}`} />Refresh
          </button>
        </div>

        {/* Status Messages */}
        {(error || statusMessage) && (
          <div className={`mt-4 px-4 py-3 rounded-lg text-sm ${error || statusMessage?.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : statusMessage?.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
            <div className="flex items-center justify-between">
              <span>{error || statusMessage?.message}</span>
              <button onClick={() => { clearError(); setStatusMessage(null); }} className="text-current opacity-50 hover:opacity-100">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Generation Progress (shown when generating) */}
      {generationStatus && (
        <GenerationProgress 
          status={generationStatus} 
          onCancel={handleCancelGeneration}
        />
      )}

      {/* Generate View */}
      {viewMode === 'generate' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            Generate New Metrics Pack for {selectedEntity.entityName}
          </h2>
          
          <div className="space-y-6">
            <PeriodSelector
              value={periodState}
              onChange={setPeriodState}
            />
            
            <div className="flex items-center gap-4">
              <button
                onClick={handleGenerateMetricsPack}
                disabled={generating || !isValidSelection(periodState)}
                className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Database className="w-5 h-5" />
                    Generate Metrics Pack
                  </>
                )}
              </button>
              
              <button
                onClick={() => setViewMode('list')}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Panel - Pack List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Metrics Packs</h3>
                <span className="text-sm text-gray-500">{metricsPacks.length} packs</span>
              </div>
              
              {loadingPacks ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
                </div>
              ) : metricsPacks.length === 0 ? (
                <div className="text-center py-8">
                  <Database className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-gray-500 text-sm">No metrics packs yet</p>
                  <button 
                    onClick={() => setViewMode('generate')} 
                    className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    Generate your first pack
                  </button>
                </div>
              ) : (
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {metricsPacks.map((pack) => {
                    const isSelected = selectedPack?.id === pack.id;
                    const report = getReportForPack(pack);
                    const packDataParsed = parsePackData(pack.packData);
                    
                    return (
                      <div
                        key={pack.id}
                        onClick={() => handleSelectPack(pack)}
                        className={`p-3 rounded-lg border cursor-pointer transition-all ${isSelected ? 'border-indigo-500 bg-indigo-50/50 ring-1 ring-indigo-500' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'}`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">{pack.periodLabel}</div>
                            {pack.periodStart && pack.periodEnd && !isNaN(new Date(pack.periodStart).getTime()) && (
                              <div className="text-xs text-gray-500 mt-0.5"><Calendar className="inline w-3 h-3 mr-1" />{formatDate(pack.periodStart)} - {formatDate(pack.periodEnd)}</div>
                            )}
                            <div className="flex items-center gap-2 mt-1.5"><span className="text-xs text-gray-600">{pack.gamesIncluded} games • {pack.venuesIncluded} venues</span></div>
                            {packDataParsed?.strategic?.totalRevenue && <div className="text-sm font-medium text-gray-700 mt-1">{formatCurrency(packDataParsed.strategic.totalRevenue)} revenue</div>}
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            {report ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />Report</span> : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 flex items-center gap-1"><AlertCircle className="w-3 h-3" />No Report</span>}
                            <ChevronRight className={`w-4 h-4 transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                          </div>
                        </div>
                        <div className="text-xs text-gray-400 mt-2"><Clock className="inline w-3 h-3 mr-1" />Generated {formatDateTime(pack.generatedAt)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel - Selected Pack Details */}
          <div className="lg:col-span-2">
            {!selectedPack && (
              <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
                <FileText className="w-16 h-16 mx-auto mb-4 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Select a Metrics Pack</h3>
                <p className="text-gray-500 mb-4">Choose a pack from the list to view details and generate or view the AI report.</p>
                <button onClick={() => setViewMode('generate')} className="px-4 py-2 text-sm font-medium text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50">Or Generate a New Pack</button>
              </div>
            )}

            {selectedPack && (
              <div className="space-y-4">
                {/* Pack Summary Card with Actions */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold">{selectedPack.periodLabel}</h3>
                      {selectedPack.periodStart && selectedPack.periodEnd && !isNaN(new Date(selectedPack.periodStart).getTime()) ? (
                        <p className="text-sm text-gray-500">{formatDate(selectedPack.periodStart)} - {formatDate(selectedPack.periodEnd)}{selectedPack.comparisonPeriodLabel && <span className="ml-2 text-gray-400">vs {selectedPack.comparisonPeriodLabel}</span>}</p>
                      ) : selectedPack.comparisonPeriodLabel ? (
                        <p className="text-sm text-gray-500">vs {selectedPack.comparisonPeriodLabel}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {selectedReport && selectedReportData && <ReportDownloadButton report={selectedReport} reportData={selectedReportData} metricsPack={selectedPack} />}
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${selectedReport ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}`}>{selectedReport ? 'Report Available' : 'Pack Only'}</span>
                    </div>
                  </div>

                  {/* Pack Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                    <div className="text-center p-3 bg-gray-50 rounded-lg"><div className="text-2xl font-bold text-gray-900">{selectedPack.gamesIncluded}</div><div className="text-xs text-gray-500">Games</div></div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg"><div className="text-2xl font-bold text-gray-900">{selectedPack.venuesIncluded}</div><div className="text-xs text-gray-500">Venues</div></div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg"><div className="text-2xl font-bold text-gray-900">{selectedPack.snapshotsIncluded}</div><div className="text-xs text-gray-500">Snapshots</div></div>
                    <div className="text-center p-3 bg-gray-50 rounded-lg"><div className="text-2xl font-bold text-gray-900">{selectedPack.dataCompleteness ? `${Math.round(selectedPack.dataCompleteness)}%` : '100%'}</div><div className="text-xs text-gray-500">Data Quality</div></div>
                  </div>

                  {/* Expandable Venues & Games Details */}
                  <div className="mb-4">
                    <PackDetailsExpander packData={selectedPackData} metricsPack={selectedPack} />
                  </div>

                  {/* Enhanced Modules Available */}
                  {selectedPack.enhancedModulesIncluded && selectedPack.enhancedModulesIncluded.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 mb-4 p-3 bg-green-50 rounded-lg">
                      <span className="text-sm text-green-700 font-medium">Enhanced Modules:</span>
                      {selectedPack.enhancedModulesIncluded.map((mod: string, idx: number) => <span key={idx} className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">{mod.replace(/([A-Z])/g, ' $1').trim()}</span>)}
                    </div>
                  )}

                  {/* Model Selection & Generate Button */}
                  <div className="border-t pt-4">
                    {selectedReport ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 flex-wrap"><span className="text-sm text-gray-500">Regenerate with a different model:</span></div>
                        <div className="flex items-center gap-3">
                          <ModelSelector value={selectedModel} onChange={setSelectedModel} className="flex-1" disabled={generatingAI} />
                          <button onClick={handleGenerateAIReport} disabled={generatingAI} className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50">
                            {generatingAI ? <><Loader2 className="w-4 h-4 animate-spin" />Generating...</> : <><History className="w-4 h-4" />Regenerate</>}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        <ModelSelector value={selectedModel} onChange={setSelectedModel} disabled={generatingAI} />
                        <button onClick={handleGenerateAIReport} disabled={generatingAI} className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50">
                          {generatingAI ? <><Loader2 className="w-4 h-4 animate-spin" />Generating AI Report...</> : <><Sparkles className="w-4 h-4" />Generate AI Report</>}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Report Content */}
                {selectedReport && selectedReportData && <ReportRenderer report={selectedReport} reportData={selectedReportData} metricsPack={selectedPack} />}

                {/* Raw Pack Data (when no report) */}
                {!selectedReportData && selectedPackData && (
                  <div className="space-y-4">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-2 text-amber-800">
                      <AlertCircle className="w-5 h-5" /><span className="font-medium">No AI report generated yet</span>
                      <span className="text-sm text-amber-700 ml-2">Select a model above and click "Generate AI Report" to create insights.</span>
                    </div>
                    {selectedPackData.strategic && <WeeklyMetricsGrid metrics={{ revenue: { value: selectedPackData.strategic.totalRevenue }, profit: { value: selectedPackData.strategic.netProfit }, margin: { value: selectedPackData.strategic.profitMargin }, entries: { value: selectedPackData.strategic.totalEntries }, gamesRun: { value: selectedPackData.strategic.totalGamesRun }, avgEntriesPerGame: { value: selectedPackData.strategic.avgEntriesPerGame } }} showInsights={false} />}
                    {selectedPackData.venues && selectedPackData.venues.length > 0 && <VenueQuickViewPanel venues={selectedPackData.venues.map((v) => ({ venueName: v.venueName, profit: v.totalProfit, games: v.totalGames, avgProfitPerGame: v.avgProfitPerGame, health: v.overallHealth as 'EXCELLENT' | 'GOOD' | 'NEEDS_ATTENTION' | 'CRITICAL', trend: v.trendCategory, keyIssue: '', oneAction: '' }))} />}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AIInsightsDashboard;