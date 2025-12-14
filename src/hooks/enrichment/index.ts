// src/hooks/enrichment/index.ts
// ===================================================================
// ENRICHMENT HOOKS - Barrel Export
// ===================================================================

export {
  useEnrichmentPreview,
  formatSeriesResolutionStatus,
  formatRecurringResolutionStatus,
  getConfidenceColorClass,
  type UseEnrichmentPreviewOptions,
  type UseEnrichmentPreviewReturn,
  type EnrichGameDataOutput,
  type EnrichedGameData,
  type EnrichmentMetadata,
  type EnrichmentValidationResult,
  type SeriesResolutionMetadata,
  type RecurringResolutionMetadata,
  type VenueResolutionMetadata,
} from './useEnrichmentPreview';

export {
  useFinancialsPreview,
  formatCurrency,
  formatPercentage,
  getProfitStatus,
  getGuaranteeStatus,
  type UseFinancialsPreviewOptions,
  type UseFinancialsPreviewReturn,
  type CalculateGameFinancialsOutput,
  type FinancialsSummary,
  type GameCostCalculation,
  type GameFinancialSnapshotCalculation,
} from './useFinancialsPreview';
