// types/insights.ts
// AI Insights type definitions - matches backend WEEKLY_OPS and MONTHLY_BOARD output
// VERSION: 2.0.0 - Added ReportGenerationStatus for async generation

import { ReportType } from '../API';
export { ReportType };

// ===================================================================
// COMMON ENUMS & BASE TYPES
// ===================================================================

// Report generation status for async pattern
export type ReportGenerationStatus = 'PENDING' | 'GENERATING' | 'COMPLETED' | 'FAILED';

// Alias for backward compatibility with existing code using ReportStatus
export const ReportStatus = {
  PENDING: 'PENDING' as ReportGenerationStatus,
  GENERATING: 'GENERATING' as ReportGenerationStatus,
  COMPLETED: 'COMPLETED' as ReportGenerationStatus,
  FAILED: 'FAILED' as ReportGenerationStatus,
} as const;

export type ReportHealthStatus = 'EXCELLENT' | 'GOOD' | 'OK' | 'CONCERNING' | 'CRITICAL' | 'NEEDS_ATTENTION';
export type AlertSeverity = 'HIGH' | 'MEDIUM' | 'LOW';
export type AlertPriority = 'CRITICAL' | 'URGENT' | 'HIGH' | 'MEDIUM';
export type VenueTrendCategory = 'AT_RISK' | 'SOFTENING' | 'STEADY' | 'UPLIFT' | 'BREAKOUT';
export type VenueHealth = 'EXCELLENT' | 'GOOD' | 'NEEDS_ATTENTION' | 'CRITICAL';
export type EffortLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type PressureLevel = 'HIGH' | 'MEDIUM' | 'LOW' | 'MINIMAL';
export type Trajectory = 'IMPROVING' | 'STABLE' | 'DECLINING';
export type IssueType = 'OVERLAY' | 'LOW_TURNOUT' | 'HIGH_COSTS' | 'CANCELLED';

export type AlertType =
  | 'LOSS_MAKING_GAME' | 'LOSS_MAKING_VENUE' | 'LOW_GUARANTEE_COVERAGE' | 'NEGATIVE_TREND'
  | 'SOFTENING_TREND' | 'HIGH_OVERLAY' | 'LOW_FILL_RATE' | 'LOW_MARGIN' | 'PRIZEPOOL_DISCREPANCY'
  | 'CANCELLED_PATTERN' | 'COST_ANOMALY' | 'REVENUE_ANOMALY' | 'PLAYER_CHURN';

// ===================================================================
// METRICS PACK TYPES
// ===================================================================

export interface MetricsPack {
  id: string;
  entityId: string;
  reportType: ReportType;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  comparisonPeriodKey?: string | null;
  comparisonPeriodStart?: string | null;
  comparisonPeriodEnd?: string | null;
  comparisonPeriodLabel?: string | null;
  packData: string | PackData;
  socialPulseData?: string | null;
  generatedAt: string;
  generatedBy: string;
  generationDurationMs?: number | null;
  version: number;
  snapshotsIncluded: number;
  gamesIncluded: number;
  venuesIncluded: number;
  dataCompleteness?: number | null;
  enhancedModulesIncluded?: string[] | null;
  warnings?: string[] | null;
}

export interface PackData {
  strategic: StrategicMetrics;
  venues: VenueMetricsRaw[];
  alerts: PackAlert[];
  alertSummary?: AlertSummary;
  rankings: Rankings;
  playerInsights: PlayerInsights;
  scheduleCompliance?: ScheduleComplianceData | null;
  recurringGameTrends?: RecurringGameTrendsData | null;
  seriesLifecycle?: SeriesLifecycleData | null;
  competitorAnalysis?: CompetitorAnalysisData | null;
  opportunities?: OpportunitiesData | null;
}

export interface StrategicMetrics {
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
  profitMargin: number;
  totalEntries: number;
  totalUniquePlayers: number;
  totalGamesRun: number;
  totalGamesCancelled?: number;
  avgEntriesPerGame: number;
  avgProfitPerGame: number;
  avgRevenuePerPlayer?: number;
  staffCost?: number;
  dealerCost?: number;
  venueRentalCost?: number;
  marketingCost?: number;
  overlayCost?: number;
  otherCost?: number;
  gamesWithGuarantee?: number;
  gamesWithOverlay?: number;
  totalGuaranteeExposure?: number;
  totalOverlayCost?: number;
  avgGuaranteeCoverageRate?: number;
  revenueGrowth?: number;
  revenueGrowthPercent?: number;
  profitGrowth?: number;
  profitGrowthPercent?: number;
  entriesGrowth?: number;
  entriesGrowthPercent?: number;
  marginChange?: number;
  gamesGrowth?: number;
  playerGrowth?: number;
}

export interface VenueMetricsRaw {
  venueId: string;
  venueName: string;
  totalRevenue: number;
  totalCost: number;
  totalProfit: number;
  profitMargin: number;
  totalEntries: number;
  totalGames: number;
  avgProfitPerGame: number;
  overallHealth: string;
  trendCategory: VenueTrendCategory;
  profitTrendPercent?: number;
  topGames?: GameSummary[];
  bottomGames?: GameSummary[];
}

export interface GameSummary {
  gameId: string;
  gameName: string;
  profit: number;
  entries: number;
  date?: string;
}

export interface PackAlert {
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  recommendation?: string;
  metric?: string;
  currentValue?: number;
  threshold?: number;
  venueId?: string;
  venueName?: string;
  gameId?: string;
  gameName?: string;
  priority?: number;
}

export interface AlertSummary {
  total: number;
  bySeverity: { HIGH: number; MEDIUM: number; LOW: number };
  byType: Record<string, number>;
}

export interface Rankings {
  games?: { topByProfit?: RankingItem[]; topByMargin?: RankingItem[]; losses?: RankingItem[] };
  venues?: { topByProfit?: RankingItem[]; bottomByProfit?: RankingItem[] };
}

export interface RankingItem {
  id: string;
  name: string;
  value: number;
  secondaryValue?: number;
  venueId?: string;
  venueName?: string;
}

export interface PlayerInsights {
  totalUniquePlayers: number;
  newPlayers?: number;
  returningPlayers?: number;
  avgEntriesPerPlayer?: number;
  topPlayers?: PlayerSummary[];
}

export interface PlayerSummary {
  playerId: string;
  displayName?: string;
  entries: number;
  totalSpend: number;
}

export interface ScheduleComplianceData {
  hasScheduleData: boolean;
  compliance?: { rate: number; scheduled: number; run: number; cancelled: number };
  cancellations?: { byReason: Record<string, number>; byDayOfWeek: Record<string, number>; atRiskGames?: AtRiskGame[] };
}

export interface AtRiskGame {
  gameId: string;
  gameName: string;
  cancellationRate: number;
  occurrences: number;
  reasons: string[];
}

export interface RecurringGameTrendsData {
  hasRecurringData: boolean;
  summary?: { totalRecurring: number; growing: number; declining: number; stable: number };
  games?: RecurringGame[];
}

export interface RecurringGame {
  gameId: string;
  gameName: string;
  occurrences: number;
  trend: 'GROWING' | 'DECLINING' | 'STABLE';
  profitTrend: number;
  entriesTrend: number;
  avgProfit: number;
  avgEntries: number;
}

export interface SeriesLifecycleData {
  hasSeries: boolean;
  activeSeries?: SeriesInfo[];
  recentlyCompleted?: SeriesInfo[];
}

export interface SeriesInfo {
  seriesId: string;
  seriesName: string;
  status: string;
  progress?: number;
  totalEvents?: number;
  completedEvents?: number;
}

export interface CompetitorAnalysisData {
  hasCompetitorData: boolean;
  pressure?: { level: PressureLevel; score: number; description?: string };
  trends?: { trend: 'INCREASING' | 'STABLE' | 'DECREASING'; description?: string };
  summary?: { competitorPosts: number; postsWithExtractedData: number; directCompetitionClashes: number; sameDayClashes: number };
  clashes?: { high?: CompetitorClash[]; medium?: CompetitorClash[]; low?: CompetitorClash[] };
  topCompetitors?: CompetitorActivity[];
  highGuaranteeEvents?: CompetitorEvent[];
}

export interface CompetitorClash { ourGameId: string; ourGameName: string; ourGameDate: string; competitorAccountId: string; competitorAccountName: string; competitorEventDate: string; competitorBuyIn?: number; competitorGuarantee?: number; clashType: 'DIRECT_COMPETITION' | 'SAME_DAY'; }
export interface CompetitorActivity { accountId: string; accountName: string; postCount: number; eventsExtracted: number; }
export interface CompetitorEvent { accountName: string; eventDate: string; buyIn?: number; guarantee?: number; postId: string; }

export interface OpportunitiesData {
  hasOpportunities: boolean;
  summary?: { totalOpportunities: number; highPriority: number; byType: Record<string, number> };
  topOpportunities?: OpportunityItem[];
  byType?: { scheduleGaps?: OpportunityItem[]; buyInGaps?: OpportunityItem[]; expansionCandidates?: OpportunityItem[]; venueCapacity?: OpportunityItem[]; competitorWeaknesses?: OpportunityItem[] };
}

export interface OpportunityItem { type: string; title: string; description: string; potentialImpact?: string; recommendation?: string; priority: 'HIGH' | 'MEDIUM' | 'LOW'; evidence?: string; }

// ===================================================================
// DIRECTOR REPORT TYPES
// ===================================================================

export interface DirectorReport {
  id: string;
  entityId: string;
  reportType: ReportType;
  periodKey: string;
  periodLabel?: string;
  periodStart?: string;
  periodEnd?: string;
  metricsPackId: string;
  metricsPackVersion?: number;
  reportData: string | WeeklyOpsReportData | MonthlyBoardReportData;
  status: string;
  statusMessage?: string;
  requestedAt?: string;
  requestedModel?: string;
  requestedProvider?: string;
  generatedAt: string;
  generatedBy?: string;
  modelProvider: string;
  modelName: string;
  modelVersion?: string;
  promptVersion?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalCost?: number;
  generationDurationMs?: number;
  reportVersion: number;
  enhancedModulesUsed?: string[];
  dataCompleteness?: number;
  regeneratedAt?: string;
  regeneratedBy?: string;
  regenerationReason?: string;
}

// ===================================================================
// WEEKLY OPS REPORT DATA
// ===================================================================

export interface WeeklyOpsReportData {
  weekSummary: WeekSummary;
  metrics: WeeklyMetrics;
  problemGames: ProblemGame[];
  winningGames: WinningGame[];
  overlayReport: OverlayReport;
  scheduleHealth: ScheduleHealth;
  recurringGameHealth: RecurringGameHealth;
  venueQuickView: VenueQuickView[];
  competitorWatch: CompetitorWatch;
  opportunities: OpportunitiesReport;
  alerts: ReportAlert[];
  thisWeekActions: FocusAction[];
  nextWeekWatch: NextWeekWatch;
  _metadata?: ReportMetadata;
}

export interface WeekSummary { headline: string; health: ReportHealthStatus; healthRationale: string; topWin: string; topProblem: string; vsLastWeek: string; }
export interface WeeklyMetrics { revenue: MetricDetail; profit: MetricDetail; margin: MetricDetail; entries: MetricDetail; gamesRun: MetricDetail; avgEntriesPerGame: MetricDetail; }
export interface MetricDetail { value: number; change?: number; changePercent?: number; trend?: 'UP' | 'DOWN' | 'FLAT'; insight?: string; }
export interface ProblemGame { gameName: string; venueName: string; date: string; profit: number; entries: number; issue: IssueType; details: string; fix: string; }
export interface WinningGame { gameName: string; venueName: string; profit: number; entries: number; margin: number; successFactor: string; }
export interface OverlayReport { totalOverlayCost: number; gamesWithOverlay: number; overlayAsPercentOfLoss: number | null; avgCoverageRate: number; worstOverlays: OverlayDetail[]; guaranteesNeedingReview: string[]; recommendation: string; }
export interface OverlayDetail { gameName: string; venueName: string; overlay: number; guarantee: number; entries: number; coverageRate: number; }
export interface ScheduleHealth { complianceRate: number | null; cancellationRate: number | null; gamesCancelled: number; cancellationReasons: string[]; atRiskGames: AtRiskGameReport[]; recommendation: string; }
export interface AtRiskGameReport { gameName: string; cancellationRate: number; recommendation: 'Keep' | 'Remove' | 'Reposition'; }
export interface RecurringGameHealth { summary: string; growing: RecurringGameReport[]; declining: RecurringGameReport[]; recommendation: string; }
export interface RecurringGameReport { gameName: string; trend: string; action: string; }
export interface VenueQuickView { venueName: string; profit: number; games: number; avgProfitPerGame: number; health: VenueHealth; trend: VenueTrendCategory; keyIssue: string; oneAction: string; }
export interface CompetitorWatch { pressureLevel: PressureLevel; pressureScore: number; directClashes: number; impactedGames: string[]; competitorHighlights: string[]; defensiveActions: string[]; }
export interface OpportunitiesReport { quickWins: QuickWin[]; scheduleGaps: string[]; expansionCandidates: string[]; }
export interface QuickWin { opportunity: string; potentialImpact: string; action: string; deadline: string; }
export interface ReportAlert { priority: AlertPriority; type: string; title: string; description: string; evidence: string; action: string; deadline: string; owner: string; }
export interface FocusAction { priority: number; action: string; rationale: string; expectedImpact: string; owner: string; deadline: string; completed?: boolean; }
export interface NextWeekWatch { gamesAtRisk: GameRisk[]; opportunities: GameOpportunity[]; competitorEvents: string[]; focusAreas: string[]; }
export interface GameRisk { game: string; risk: string; mitigation: string; }
export interface GameOpportunity { game: string; opportunity: string; action: string; }
export interface ReportMetadata { validatedAt: string; reportType: string; packDataSummary: { hasStrategic: boolean; venueCount: number; alertCount: number; hasRankings: boolean; hasPlayerInsights: boolean; hasScheduleCompliance: boolean; hasRecurringGameTrends: boolean; hasCompetitorAnalysis: boolean; hasOpportunities: boolean; hasSeriesLifecycle: boolean }; enrichedFields: string[]; }

// ===================================================================
// MONTHLY BOARD REPORT DATA
// ===================================================================

export interface MonthlyBoardReportData {
  executiveSummary: ExecutiveSummary;
  financialPerformance: FinancialPerformance;
  guaranteeAnalysis: GuaranteeAnalysis;
  venuePerformance: VenuePerformanceDetail[];
  portfolioHealth: PortfolioHealth;
  competitivePosition: CompetitivePosition;
  alerts: ReportAlert[];
  strategicRecommendations: StrategicRecommendation[];
  outlook: Outlook;
  _metadata?: ReportMetadata;
}

export interface ExecutiveSummary { headline: string; overallHealth: ReportHealthStatus; healthRationale: string; trajectory: Trajectory; keyTakeaways: string[]; criticalIssues: string[]; }
export interface FinancialPerformance { revenue: FinancialMetric; profit: FinancialMetric; topLineInsight: string; bottomLineInsight: string; marginAnalysis: string; }
export interface FinancialMetric { actual: number; budget?: number; priorPeriod?: number; change?: number; changePercent?: number; margin?: number; marginChange?: number; analysis?: string; }
export interface GuaranteeAnalysis { summary: string; totalExposure: number; totalOverlayCost: number; overlayRate: number; avgCoverageRate: number; problemGuarantees: ProblemGuarantee[]; strategicRecommendation: string; }
export interface ProblemGuarantee { gameName: string; venueName: string; avgCoverage: number; totalOverlay: number; occurrences: number; recommendation: string; }
export interface VenuePerformanceDetail { venueName: string; profit: number; profitChange?: number; profitChangePercent?: number; margin: number; games: number; health: VenueHealth; trend: VenueTrendCategory; keyDrivers: string[]; risks: string[]; recommendation: string; }
export interface PortfolioHealth { summary: string; healthDistribution: { excellent: number; good: number; needsAttention: number; critical: number }; growthOpportunities: PortfolioGame[]; interventionRequired: PortfolioGame[]; portfolioActions: string[]; }
export interface PortfolioGame { gameName: string; trend: string; brandStrength?: string; issue?: string; recommendation: string; }
export interface CompetitivePosition { pressureLevel: PressureLevel; pressureScore: number; marketAssessment: string; activityTrend: string; directThreats: CompetitorThreat[]; clashImpact: { directClashes: number; estimatedRevenueImpact: string; affectedGames: string[] }; strategicResponse: string; }
export interface CompetitorThreat { competitor: string; threat: string; threatLevel: 'HIGH' | 'MEDIUM' | 'LOW'; suggestedResponse: string; }
export interface StrategicRecommendation { priority: number; recommendation: string; rationale: string; expectedOutcome: string; timeframe: string; owner: string; resources?: string; }
export interface Outlook { trajectory: Trajectory; confidence: 'HIGH' | 'MEDIUM' | 'LOW'; nextPeriodFocus: string; keyRisksToMonitor: string[]; targetMetrics: { revenue?: number; profit?: number; margin?: number }; catalysts: string[]; }

// ===================================================================
// RESOLVED PERIOD (from GraphQL)
// ===================================================================

export interface ResolvedPeriod {
  periodKey: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  comparisonPeriodKey?: string | null;
  comparisonPeriodLabel?: string | null;
  comparisonStartDate?: string | null;
  comparisonEndDate?: string | null;
}

// ===================================================================
// API RESPONSE TYPES
// ===================================================================

export interface GenerateMetricsPackResult { 
  success: boolean; 
  metricsPackId?: string; 
  metricsPack?: MetricsPack; 
  wasExisting?: boolean; 
  generationDurationMs?: number; 
  error?: string; 
  warnings?: string[]; 
}

export interface GenerateDirectorReportResult { 
  success: boolean; 
  directorReportId?: string; 
  directorReport?: DirectorReport; 
  // Async generation status
  status?: ReportGenerationStatus;
  statusMessage?: string;
  wasRegenerated?: boolean; 
  generationDurationMs?: number; 
  tokenUsage?: TokenUsage; 
  packValidation?: PackValidation; 
  enhancedModulesUsed?: string[]; 
  error?: string; 
}

export interface DirectorReportStatusResult {
  success: boolean;
  id?: string;
  status: ReportGenerationStatus;
  statusMessage?: string;
  error?: string;
  requestedAt?: string;
  generatedAt?: string;
  generationDurationMs?: number;
  directorReport?: DirectorReport;
}

export interface TokenUsage { 
  inputTokens: number; 
  outputTokens: number; 
  totalCost: number; 
}

export interface PackValidation { 
  isValid: boolean; 
  issues: string[]; 
  enhancedModulesAvailable: Record<string, boolean>; 
  enhancedModuleCount: number; 
}

// ===================================================================
// TYPE GUARDS
// ===================================================================

export function isWeeklyOpsReport(data: unknown): data is WeeklyOpsReportData {
  return typeof data === 'object' && data !== null && 'weekSummary' in data && 'metrics' in data;
}

export function isMonthlyBoardReport(data: unknown): data is MonthlyBoardReportData {
  return typeof data === 'object' && data !== null && 'executiveSummary' in data && 'financialPerformance' in data;
}

// Type alias for hook compatibility
export type DirectorReportData = WeeklyOpsReportData | MonthlyBoardReportData;