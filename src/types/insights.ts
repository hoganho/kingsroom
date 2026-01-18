// types/insights.ts
// AI Insights type definitions

// Import and re-export ReportType enum from Amplify-generated API
// This allows both: ReportType.WEEKLY_OPS (enum value) and ReportType (as a type)
import { ReportType } from '../API';
export { ReportType };

export type ReportHealthStatus = 'EXCELLENT' | 'GOOD' | 'NEEDS_ATTENTION' | 'CRITICAL';

export type AlertSeverity = 'HIGH' | 'MEDIUM' | 'LOW';

export type AlertType = 
  | 'LOSS_MAKING_GAME'
  | 'LOSS_MAKING_VENUE'
  | 'LOW_GUARANTEE_COVERAGE'
  | 'NEGATIVE_TREND'
  | 'SOFTENING_TREND'
  | 'HIGH_OVERLAY'
  | 'LOW_FILL_RATE'
  | 'PRIZEPOOL_DISCREPANCY'
  | 'CANCELLED_PATTERN'
  | 'COST_ANOMALY'
  | 'REVENUE_ANOMALY'
  | 'PLAYER_CHURN';

export type VenueTrendCategory = 'AT_RISK' | 'SOFTENING' | 'STEADY' | 'UPLIFT' | 'BREAKOUT';

export type CalloutType = 'TOP_PERFORMER' | 'NEEDS_ATTENTION' | 'TREND_CHANGE' | 'MILESTONE';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalCost: number;
}

// MetricsPack types
export interface MetricsPack {
  id: string;
  entityId: string;
  reportType: ReportType;
  periodKey: string;
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  comparisonPeriodKey?: string;
  comparisonPeriodLabel?: string;
  packData: string | PackData;
  socialPulseData?: string;
  generatedAt: string;
  generatedBy: string;
  generationDurationMs?: number;
  version: number;
  snapshotsIncluded: number;
  gamesIncluded: number;
  venuesIncluded: number;
  dataCompleteness?: number;
  warnings?: string[];
}

export interface PackData {
  strategic: StrategicMetrics;
  venues: VenueMetrics[];
  alerts: Alert[];
  rankings: Rankings;
  playerInsights: PlayerInsights;
}

export interface StrategicMetrics {
  totalRevenue: number;
  totalCost: number;
  netProfit: number;
  profitMargin: number;
  totalEntries: number;
  totalUniquePlayers: number;
  totalGamesRun: number;
  totalGamesCancelled: number;
  runRate: number;
  revenuePerPlayer: number;
  profitPerPlayer: number;
  rakeRevenue: number;
  guaranteeOverlayCost: number;
  gamesWithOverlay: number;
  guaranteeCoverageRate: number;
  staffCost: number;
  avgDealerCostPerHour: number;
  deltas?: {
    totalRevenue?: number;
    totalRevenuePercent?: number;
    netProfit?: number;
    netProfitPercent?: number;
    totalEntries?: number;
    totalEntriesPercent?: number;
    profitMargin?: number;
    runRate?: number;
  };
}

export interface VenueMetrics {
  venueId: string;
  venueName: string;
  metrics: {
    revenue: number;
    cost: number;
    profit: number;
    profitMargin: number;
    entries: number;
    gamesRun: number;
    gamesCancelled: number;
    runRate: number;
  };
  trendCategory: VenueTrendCategory;
  deltas?: {
    revenue?: number;
    revenuePercent?: number;
    profit?: number;
    profitPercent?: number;
    entries?: number;
    entriesPercent?: number;
  };
}

export interface Alert {
  id?: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  recommendation?: string;
  metric?: string;
  value?: number;
  threshold?: number;
  venueId?: string;
  venueName?: string;
  gameId?: string;
  gameName?: string;
}

export interface Rankings {
  topVenuesByProfit: RankingItem[];
  topVenuesByVolume: RankingItem[];
  mostImproved: RankingItem[];
  needsAttention: RankingItem[];
}

export interface RankingItem {
  venueId: string;
  venueName: string;
  value: number;
  delta?: number;
  deltaPercent?: number;
}

export interface PlayerInsights {
  newPlayers: PlayerInsightItem[];
  returningPlayers: PlayerInsightItem[];
  churnRisk: PlayerInsightItem[];
  topPlayersBySpend?: PlayerInsightItem[];
}

export interface PlayerInsightItem {
  playerId: string;
  playerName: string;
  value?: number;
  metric?: string;
}

// DirectorReport types
export interface DirectorReport {
  id: string;
  entityId: string;
  reportType: ReportType;
  periodKey: string;
  metricsPackId: string;
  reportData: string | DirectorReportData;
  status: string;
  generatedAt: string;
  generatedBy: string;
  modelProvider: string;
  modelName: string;
  modelVersion?: string;
  promptVersion: string;
  inputTokens?: number;
  outputTokens?: number;
  totalCost?: number;
  generationDurationMs?: number;
  reportVersion: number;
  regeneratedAt?: string;
  regeneratedBy?: string;
  regenerationReason?: string;
}

export interface DirectorReportData {
  executiveSummary: ExecutiveSummary;
  keyMetrics: KeyMetrics;
  alerts: ReportAlert[];
  opportunities: Opportunity[];
  focusActions: FocusAction[];
  venueCallouts: VenueCallout[];
  competitorInsights?: CompetitorInsights;
  weekAheadOutlook?: WeekAheadOutlook;
}

export interface ExecutiveSummary {
  headline: string;
  keyTakeaways: string[];
  overallHealth: ReportHealthStatus;
  healthRationale: string;
}

export interface KeyMetrics {
  revenue: MetricDetail;
  profit: MetricDetail;
  entries: MetricDetail;
  profitMargin: MetricDetail;
  runRate: MetricDetail;
}

export interface MetricDetail {
  value: number;
  delta?: number;
  deltaPercent?: number;
  trend: 'UP' | 'DOWN' | 'FLAT';
  insight: string;
}

export interface ReportAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  recommendation: string;
  affectedEntity?: string;
  metric?: string;
  value?: number;
  threshold?: number;
}

export interface Opportunity {
  title: string;
  description: string;
  potentialImpact: string;
  effort: 'LOW' | 'MEDIUM' | 'HIGH';
  timeframe: string;
}

export interface FocusAction {
  action: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  owner: string;
  dueBy: string;
  rationale: string;
  completed?: boolean;
}

export interface VenueCallout {
  venueId: string;
  venueName: string;
  calloutType: CalloutType;
  headline: string;
  details: string;
  trendCategory: VenueTrendCategory;
  recommendation: string;
}

export interface CompetitorInsights {
  summary: string;
  threats: CompetitorThreat[];
  opportunities: CompetitorOpportunity[];
}

export interface CompetitorThreat {
  competitor: string;
  threat: string;
  threatLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  suggestedResponse: string;
}

export interface CompetitorOpportunity {
  observation: string;
  suggestedAction: string;
}

export interface WeekAheadOutlook {
  keyEvents: string[];
  watchItems: string[];
  suggestedFocus: string;
}

// API Response types
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
  wasRegenerated?: boolean;
  generationDurationMs?: number;
  tokenUsage?: TokenUsage;
  error?: string;
}