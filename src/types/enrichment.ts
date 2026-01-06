// types/enrichment.ts
// ===================================================================
// ENRICHMENT & FINANCIALS TYPES
// ===================================================================
// 
// These types mirror the GraphQL schema for gameDataEnricher and
// gameFinancialsProcessor lambdas. Used for preview/save workflows.
//
// REPLACES: Parts of game.ts (SaveGameInput, SaveTournamentInput)
// USED BY: enrichmentService.ts, financialsService.ts, hooks, components
// ===================================================================

import type {
  GameType,
  GameVariant,
  GameStatus,
  RegistrationStatus,
  GameFrequency,
  TournamentType,
  VenueAssignmentStatus,
  SeriesAssignmentStatus,
} from '../API';

import type { ScrapedVenueMatch } from '../types/game';

// ===================================================================
// COMMON TYPES
// ===================================================================

export type RecurringGameAssignmentStatus = 
  | 'AUTO_ASSIGNED' 
  | 'MANUALLY_ASSIGNED' 
  | 'PENDING_ASSIGNMENT' 
  | 'NOT_RECURRING' 
  | 'DEVIATION_FLAGGED';

export type SeriesResolutionStatus =
  | 'MATCHED_EXISTING'
  | 'CREATED_NEW'
  | 'SKIPPED'
  | 'NOT_SERIES'
  | 'FAILED';

export type RecurringResolutionStatus =
  | 'MATCHED_EXISTING'
  | 'CREATED_NEW'
  | 'SKIPPED'
  | 'NOT_RECURRING'
  | 'FAILED';

// ===================================================================
// ENRICHMENT INPUT TYPES
// ===================================================================

/**
 * Main input for enrichGameData mutation
 * Use this for both preview (saveToDatabase: false) and save (saveToDatabase: true)
 */
export interface EnrichGameDataInput {
  /** Core game data */
  game: EnrichGameInput;
  
  /** Required: Entity context */
  entityId: string;
  
  /** Source information (required for saveToDatabase: true) */
  source?: DataSourceInput;
  
  /** Venue information for resolution */
  venue?: EnrichVenueInput;
  
  /** Series information for resolution */
  series?: EnrichSeriesInput;
  
  /** Player data (passed through to save) */
  players?: EnrichPlayerDataInput;
  
  /** Control options */
  options?: EnrichmentOptionsInput;
}

/**
 * Game data input for enrichment
 * More permissive than SaveGameInput since we're enriching raw/partial data
 */
export interface EnrichGameInput {
  // Identity
  tournamentId?: number;
  existingGameId?: string | null;
  name: string;
  gameType?: GameType;
  gameVariant?: GameVariant;
  
  // Status
  gameStatus?: GameStatus;
  registrationStatus?: RegistrationStatus;
  
  // Schedule
  gameStartDateTime?: string;
  gameEndDateTime?: string | null;
  gameFrequency?: GameFrequency;
  
  // Financials (raw - will be calculated by enricher)
  buyIn?: number;
  rake?: number;
  venueFee?: number | null;
  startingStack?: number;
  hasGuarantee?: boolean;
  guaranteeAmount?: number;
  
  // Entries
  totalUniquePlayers?: number;
  totalInitialEntries?: number;
  totalEntries?: number;
  totalRebuys?: number;
  totalAddons?: number;
  
  // Results
  prizepoolPaid?: number;
  prizepoolCalculated?: number;
  playersRemaining?: number | null;
  totalChipsInPlay?: number | null;
  averagePlayerStack?: number | null;
  totalDuration?: number | null;
  
  // Classification
  tournamentType?: TournamentType | null;
  isSeries?: boolean;
  seriesName?: string | null;
  isSatellite?: boolean;
  isRegular?: boolean;
  gameTags?: string[];
  
  // Series metadata (from name parsing)
  isMainEvent?: boolean;
  eventNumber?: number | null;
  dayNumber?: number | null;
  flightLetter?: string | null;
  finalDay?: boolean;
  
  // Recurring (if already known)
  recurringGameId?: string | null;
  recurringGameAssignmentStatus?: RecurringGameAssignmentStatus;
  recurringGameAssignmentConfidence?: number;
  
  // Structure
  levels?: any; // JSON string or array
}

/**
 * Data source information
 */
export interface DataSourceInput {
  type: 'SCRAPE' | 'MANUAL';
  sourceId: string;
  entityId: string;
  fetchedAt: string;
  contentHash?: string | null;
  wasEdited?: boolean;
}

/**
 * Venue information for resolution
 */
export interface EnrichVenueInput {
  venueId?: string | null;
  venueName?: string | null;
  suggestedVenueId?: string | null;
  assignmentStatus?: VenueAssignmentStatus;
  confidence?: number;
}

/**
 * Series information for resolution
 */
export interface EnrichSeriesInput {
  tournamentSeriesId?: string | null;
  seriesTitleId?: string | null;
  seriesName?: string | null;
  year?: number;
  isMainEvent?: boolean;
  eventNumber?: number | null;
  dayNumber?: number | null;
  flightLetter?: string | null;
  finalDay?: boolean;
}

/**
 * Player data for enrichment/save
 */
export interface EnrichPlayerDataInput {
  allPlayers: EnrichPlayerInput[];
  totalInitialEntries: number;
  totalEntries: number;
  totalUniquePlayers: number;
  hasCompleteResults: boolean;
  totalPrizesPaid?: number;
  hasEntryList?: boolean;
  hasSeatingData?: boolean;
}

export interface EnrichPlayerInput {
  name: string;
  rank?: number | null;
  winnings?: number | null;
  points?: number | null;
  isQualification?: boolean | null;
  rebuys?: number | null;
  addons?: number | null;
}

/**
 * Enrichment control options
 */
export interface EnrichmentOptionsInput {
  /** If true, invoke saveGameFunction after enrichment */
  saveToDatabase?: boolean;
  
  /** Force update even if no changes detected */
  forceUpdate?: boolean;
  
  /** Create TournamentSeries if not found (default: true) */
  autoCreateSeries?: boolean;
  
  /** Create RecurringGame if not found (default: false) */
  autoCreateRecurring?: boolean;
  
  /** Only validate, don't resolve */
  validateOnly?: boolean;
  
  /** Skip series resolution */
  skipSeriesResolution?: boolean;
  
  /** Skip recurring game resolution */
  skipRecurringResolution?: boolean;
  
  /** Skip query key computation */
  skipQueryKeys?: boolean;
  
  /** Skip financial calculations */
  skipFinancials?: boolean;
  
  /** Mark URL as do not scrape */
  doNotScrape?: boolean;
  
  /** Associated scraper job ID */
  scraperJobId?: string | null;
}

// ===================================================================
// ENRICHMENT OUTPUT TYPES
// ===================================================================

/**
 * Main output from enrichGameData mutation
 */
export interface EnrichGameDataOutput {
  success: boolean;
  
  /** Validation results */
  validation: EnrichmentValidationResult;
  
  /** The fully enriched game data */
  enrichedGame?: EnrichedGameData | null;
  
  /** Metadata about what enrichment did */
  enrichmentMetadata: EnrichmentMetadata;
  
  /** Save result (only when saveToDatabase: true) */
  saveResult?: EnrichmentSaveResult | null;
}

/**
 * Validation result from enrichment
 */
export interface EnrichmentValidationResult {
  isValid: boolean;
  errors: EnrichmentValidationError[];
  warnings: EnrichmentValidationWarning[];
}

export interface EnrichmentValidationError {
  field: string;
  message: string;
  code?: string;
}

export interface EnrichmentValidationWarning {
  field: string;
  message: string;
  code?: string;
}

/**
 * Fully enriched game data - ready for display or save
 */
export interface EnrichedGameData {
  // Identity
  tournamentId?: number;
  existingGameId?: string | null;
  name: string;
  gameType: GameType;
  gameVariant?: GameVariant;
  
  // Status
  gameStatus: GameStatus;
  registrationStatus?: RegistrationStatus;
  
  // Schedule
  gameStartDateTime: string;
  gameEndDateTime?: string | null;
  gameFrequency?: GameFrequency;
  
  // Financial (Input)
  buyIn?: number;
  rake?: number;
  venueFee?: number | null;
  startingStack?: number;
  hasGuarantee?: boolean;
  guaranteeAmount?: number;
  
  // Financial (Calculated by enricher)
  totalBuyInsCollected?: number | null;
  rakeRevenue?: number | null;
  prizepoolPlayerContributions?: number | null;
  prizepoolAddedValue?: number | null;
  prizepoolSurplus?: number | null;
  guaranteeOverlayCost?: number | null;
  gameProfit?: number | null;
  prizepoolCalculated?: number | null;
  
  // Entries
  totalUniquePlayers?: number;
  totalInitialEntries?: number;
  totalEntries?: number;
  totalRebuys?: number;
  totalAddons?: number;
  
  // Results
  prizepoolPaid?: number;
  playersRemaining?: number | null;
  totalChipsInPlay?: number | null;
  averagePlayerStack?: number | null;
  totalDuration?: number | null;
  
  // Classification
  tournamentType?: TournamentType | null;
  isSeries?: boolean;
  seriesName?: string | null;
  isSatellite?: boolean;
  isRegular?: boolean;
  gameTags?: string[];
  
  // Venue Assignment (resolved by enricher)
  venueId?: string | null;
  venueAssignmentStatus?: VenueAssignmentStatus;
  venueAssignmentConfidence?: number;
  suggestedVenueName?: string | null;
  
  // Series Assignment (resolved by enricher)
  tournamentSeriesId?: string | null;
  seriesTitleId?: string | null;
  seriesAssignmentStatus?: SeriesAssignmentStatus;
  seriesAssignmentConfidence?: number;
  suggestedSeriesName?: string | null;
  isMainEvent?: boolean;
  eventNumber?: number | null;
  dayNumber?: number | null;
  flightLetter?: string | null;
  finalDay?: boolean;
  
  // Recurring Game Assignment (resolved by enricher)
  recurringGameId?: string | null;
  recurringGameAssignmentStatus?: RecurringGameAssignmentStatus;
  recurringGameAssignmentConfidence?: number;
  wasScheduledInstance?: boolean;
  deviationNotes?: string | null;
  instanceNumber?: number | null;
  
  // Query Keys (computed by enricher)
  gameDayOfWeek?: string;
  buyInBucket?: string;
  venueScheduleKey?: string;
  venueGameTypeKey?: string;
  entityQueryKey?: string;
  entityGameTypeKey?: string;
  
  // Structure
  levels?: any;
}

/**
 * Metadata about what the enricher did
 */
export interface EnrichmentMetadata {
  seriesResolution?: SeriesResolutionMetadata | null;
  recurringResolution?: RecurringResolutionMetadata | null;
  venueResolution?: VenueResolutionMetadata | null;
  queryKeysGenerated: boolean;
  financialsCalculated: boolean;
  fieldsCompleted: string[];
  processingTimeMs?: number;
}

export interface SeriesResolutionMetadata {
  status: SeriesResolutionStatus;
  confidence?: number;
  matchedSeriesId?: string | null;
  matchedSeriesName?: string | null;
  matchedSeriesTitleId?: string | null;
  wasCreated: boolean;
  createdSeriesId?: string | null;
  matchReason?: string | null;
}

export interface RecurringResolutionMetadata {
  status: RecurringResolutionStatus;
  confidence?: number;
  matchedRecurringGameId?: string | null;
  matchedRecurringGameName?: string | null;
  wasCreated: boolean;
  createdRecurringGameId?: string | null;
  inheritedFields?: string[];
  matchReason?: string | null;
}

export interface VenueResolutionMetadata {
  status: VenueAssignmentStatus;
  venueId?: string | null;
  venueName?: string | null;
  venueFee?: number | null;
  confidence?: number;
  matchReason?: string | null;
}

/**
 * Save result (when saveToDatabase: true)
 */
export interface EnrichmentSaveResult {
  success: boolean;
  gameId?: string;
  action: 'CREATED' | 'UPDATED' | 'NO_CHANGES';
  message?: string;
  warnings?: string[];
  playerProcessingQueued?: boolean;
  playerProcessingReason?: string;
  venueAssignment?: {
    venueId?: string;
    venueName?: string;
    status?: string;
    confidence?: number;
  };
  fieldsUpdated?: string[];
}

// ===================================================================
// FINANCIALS INPUT TYPES
// ===================================================================

/**
 * Main input for calculateGameFinancials mutation
 */
export interface CalculateGameFinancialsInput {
  /** Option 1: Provide full game data (for preview before save) */
  game?: GameFinancialsGameInput;
  
  /** Option 2: Provide gameId (fetch from DB and calculate) */
  gameId?: string;
  
  /** Control options */
  options?: GameFinancialsOptionsInput;
}

/**
 * Game data subset needed for financial calculations
 */
export interface GameFinancialsGameInput {
  id: string;
  entityId: string;
  venueId?: string | null;
  
  // Entry data
  totalEntries?: number;
  totalUniquePlayers?: number;
  totalInitialEntries?: number;
  totalRebuys?: number;
  totalAddons?: number;
  
  // Financial inputs
  buyIn?: number;
  rake?: number;
  venueFee?: number | null;
  guaranteeAmount?: number;
  hasGuarantee?: boolean;
  
  // Pre-calculated financials (from enricher)
  rakeRevenue?: number | null;
  totalBuyInsCollected?: number | null;
  prizepoolPlayerContributions?: number | null;
  prizepoolAddedValue?: number | null;
  prizepoolSurplus?: number | null;
  guaranteeOverlayCost?: number | null;
  gameProfit?: number | null;
  
  // Results
  prizepoolPaid?: number;
  prizepoolCalculated?: number;
  
  // Timing
  gameStartDateTime?: string;
  gameEndDateTime?: string | null;
  
  // Classification
  gameType?: GameType;
  tournamentType?: TournamentType | null;
  gameStatus?: GameStatus;
}

export interface GameFinancialsOptionsInput {
  /** If true, save to GameCost and GameFinancialSnapshot tables */
  saveToDatabase?: boolean;
}

// ===================================================================
// FINANCIALS OUTPUT TYPES
// ===================================================================

/**
 * Main output from calculateGameFinancials mutation
 */
export interface CalculateGameFinancialsOutput {
  success: boolean;
  gameId?: string;
  mode: 'PREVIEW' | 'SAVE';
  
  /** Calculated cost data */
  calculatedCost?: GameCostCalculation | null;
  
  /** Calculated snapshot data */
  calculatedSnapshot?: GameFinancialSnapshotCalculation | null;
  
  /** Summary for quick FE display */
  summary?: FinancialsSummary | null;
  
  /** Save results (when saveToDatabase: true) */
  costSaveResult?: FinancialsSaveResult | null;
  snapshotSaveResult?: FinancialsSaveResult | null;
  
  processingTimeMs?: number;
  error?: string;
}

/**
 * Calculated GameCost data
 */
export interface GameCostCalculation {
  gameId?: string;
  entityId?: string;
  venueId?: string | null;
  gameDate?: string;
  
  // Cost breakdown
  totalDealerCost?: number;
  totalTournamentDirectorCost?: number;
  totalFloorStaffCost?: number;
  totalSecurityCost?: number;
  totalPrizeContribution?: number;
  totalJackpotContribution?: number;
  totalPromotionCost?: number;
  totalOtherCost?: number;
  totalCost?: number;
  
  // Calculation metadata
  dealerRatePerEntry?: number;
  entriesUsedForCalculation?: number;
}

/**
 * Calculated GameFinancialSnapshot data
 */
export interface GameFinancialSnapshotCalculation {
  gameId?: string;
  entityId?: string;
  venueId?: string | null;
  gameStartDateTime?: string;
  
  // Denormalized game data
  totalUniquePlayers?: number;
  totalEntries?: number;
  guaranteeAmount?: number;
  gameDurationMinutes?: number;
  gameType?: GameType;
  tournamentType?: TournamentType | null;
  
  // Revenue
  totalBuyInsCollected?: number;
  rakeRevenue?: number;
  venueFee?: number;
  totalRevenue?: number;
  
  // Prizepool
  prizepoolPlayerContributions?: number;
  prizepoolAddedValue?: number;
  prizepoolTotal?: number;
  prizepoolSurplus?: number | null;
  
  // Guarantee
  guaranteeOverlayCost?: number;
  guaranteeCoverageRate?: number | null;
  guaranteeMet?: boolean;
  
  // Costs
  totalCost?: number;
  totalDealerCost?: number;
  totalStaffCost?: number;
  totalTournamentDirectorCost?: number;
  totalFloorStaffCost?: number;
  totalPromotionCost?: number;
  totalOtherCost?: number;
  
  // Profit
  gameProfit?: number;
  netProfit?: number;
  profitMargin?: number | null;
  
  // Per-player metrics
  revenuePerPlayer?: number | null;
  costPerPlayer?: number | null;
  profitPerPlayer?: number | null;
  rakePerEntry?: number | null;
  staffCostPerPlayer?: number | null;
  dealerCostPerHour?: number | null;
}

/**
 * Summary for quick FE display
 */
export interface FinancialsSummary {
  // Revenue
  totalRevenue?: number;
  rakeRevenue?: number;
  totalBuyInsCollected?: number;
  
  // Costs
  totalCost?: number;
  totalDealerCost?: number;
  
  // Prizepool
  prizepoolTotal?: number;
  prizepoolPlayerContributions?: number;
  prizepoolAddedValue?: number;
  
  // Guarantee
  guaranteeMet?: boolean;
  guaranteeOverlayCost?: number;
  guaranteeCoverageRate?: number | null;
  
  // Profit
  gameProfit?: number;
  netProfit?: number;
  profitMargin?: number | null;
  
  // Per-player
  revenuePerPlayer?: number | null;
  costPerPlayer?: number | null;
  profitPerPlayer?: number | null;
  rakePerEntry?: number | null;
}

export interface FinancialsSaveResult {
  action?: 'CREATED' | 'UPDATED' | 'ERROR';
  costId?: string;
  snapshotId?: string;
  error?: string;
}

// ===================================================================
// WORKFLOW TYPES (for UI state management)
// ===================================================================

/**
 * Unified workflow step for game save flow
 */
export type GameSaveWorkflowStep = 
  | 'fetching'       // Scraping/loading data
  | 'editing'        // User editing data
  | 'enrichPreview'  // Showing enrichment preview
  | 'financialPreview' // Showing financial preview
  | 'confirming'     // User confirming save
  | 'saving'         // Save in progress
  | 'success'        // Save completed
  | 'error';         // Error occurred

/**
 * Combined preview state for FE display
 */
export interface GamePreviewState {
  /** Current workflow step */
  step: GameSaveWorkflowStep;
  
  /** Raw scraped/input data */
  rawData?: any;
  
  /** Enrichment preview result */
  enrichmentResult?: EnrichGameDataOutput | null;
  
  /** Financial preview result */
  financialsResult?: CalculateGameFinancialsOutput | null;
  
  /** Loading states */
  isEnriching: boolean;
  isCalculatingFinancials: boolean;
  isSaving: boolean;
  
  /** Error state */
  error?: string | null;
}

/**
 * Preview panel display data (computed from results)
 */
export interface GamePreviewDisplay {
  // Enrichment summary
  enrichment: {
    venueResolved: boolean;
    venueName?: string;
    venueConfidence?: number;
    
    seriesResolved: boolean;
    seriesName?: string;
    seriesConfidence?: number;
    seriesWasCreated?: boolean;
    
    recurringResolved: boolean;
    recurringName?: string;
    recurringConfidence?: number;
    
    queryKeysGenerated: boolean;
    financialsCalculated: boolean;
    
    validationErrors: EnrichmentValidationError[];
    validationWarnings: EnrichmentValidationWarning[];
  };
  
  // Financial summary
  financials: {
    totalRevenue?: number;
    totalCost?: number;
    netProfit?: number;
    profitMargin?: number | null;
    guaranteeMet?: boolean;
    guaranteeOverlayCost?: number;
    dealerCost?: number;
    rakePerEntry?: number | null;
    profitPerPlayer?: number | null;
  };
}

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

/**
 * Create empty enrichment input with defaults
 */
export const createDefaultEnrichmentInput = (
  entityId: string,
  name: string = ''
): EnrichGameDataInput => ({
  entityId,
  game: {
    name,
    gameType: 'TOURNAMENT' as GameType,
    gameStatus: 'SCHEDULED' as GameStatus,
    hasGuarantee: false,
    isSeries: false,
    isRegular: true,
    isSatellite: false,
    totalRebuys: 0,
    totalAddons: 0,
  },
  options: {
    saveToDatabase: false,
    autoCreateSeries: true,
    autoCreateRecurring: true,
  },
});

/**
 * Convert EnrichedGameData to GameFinancialsGameInput
 */
export const enrichedGameToFinancialsInput = (
  enrichedGame: EnrichedGameData,
  gameId: string
): GameFinancialsGameInput => ({
  id: gameId,
  entityId: enrichedGame.venueId ? enrichedGame.venueId : '', // Will be resolved
  venueId: enrichedGame.venueId,
  totalEntries: enrichedGame.totalEntries,
  totalUniquePlayers: enrichedGame.totalUniquePlayers,
  totalInitialEntries: enrichedGame.totalInitialEntries,
  totalRebuys: enrichedGame.totalRebuys,
  totalAddons: enrichedGame.totalAddons,
  buyIn: enrichedGame.buyIn,
  rake: enrichedGame.rake,
  venueFee: enrichedGame.venueFee,
  guaranteeAmount: enrichedGame.guaranteeAmount,
  hasGuarantee: enrichedGame.hasGuarantee,
  rakeRevenue: enrichedGame.rakeRevenue,
  totalBuyInsCollected: enrichedGame.totalBuyInsCollected,
  prizepoolPlayerContributions: enrichedGame.prizepoolPlayerContributions,
  prizepoolAddedValue: enrichedGame.prizepoolAddedValue,
  prizepoolSurplus: enrichedGame.prizepoolSurplus,
  guaranteeOverlayCost: enrichedGame.guaranteeOverlayCost,
  gameProfit: enrichedGame.gameProfit,
  prizepoolPaid: enrichedGame.prizepoolPaid,
  prizepoolCalculated: enrichedGame.prizepoolCalculated ?? undefined,
  gameStartDateTime: enrichedGame.gameStartDateTime,
  gameEndDateTime: enrichedGame.gameEndDateTime,
  gameType: enrichedGame.gameType,
  tournamentType: enrichedGame.tournamentType,
  gameStatus: enrichedGame.gameStatus,
});

/**
 * Build preview display from enrichment and financial results
 */
export const buildPreviewDisplay = (
  enrichmentResult?: EnrichGameDataOutput | null,
  financialsResult?: CalculateGameFinancialsOutput | null
): GamePreviewDisplay => {
  const meta = enrichmentResult?.enrichmentMetadata;
  const summary = financialsResult?.summary;
  
  return {
    enrichment: {
      venueResolved: meta?.venueResolution?.status === 'AUTO_ASSIGNED' || 
                     meta?.venueResolution?.status === 'MANUALLY_ASSIGNED',
      venueName: meta?.venueResolution?.venueName ?? undefined,
      venueConfidence: meta?.venueResolution?.confidence ?? undefined,
      
      seriesResolved: meta?.seriesResolution?.status === 'MATCHED_EXISTING' || 
                      meta?.seriesResolution?.status === 'CREATED_NEW',
      seriesName: meta?.seriesResolution?.matchedSeriesName ?? undefined,
      seriesConfidence: meta?.seriesResolution?.confidence ?? undefined,
      seriesWasCreated: meta?.seriesResolution?.wasCreated ?? false,
      
      recurringResolved: meta?.recurringResolution?.status === 'MATCHED_EXISTING',
      recurringName: meta?.recurringResolution?.matchedRecurringGameName ?? undefined,
      recurringConfidence: meta?.recurringResolution?.confidence ?? undefined,
      
      queryKeysGenerated: meta?.queryKeysGenerated ?? false,
      financialsCalculated: meta?.financialsCalculated ?? false,
      
      validationErrors: enrichmentResult?.validation?.errors ?? [],
      validationWarnings: enrichmentResult?.validation?.warnings ?? [],
    },
    financials: {
      totalRevenue: summary?.totalRevenue,
      totalCost: summary?.totalCost,
      netProfit: summary?.netProfit,
      profitMargin: summary?.profitMargin,
      guaranteeMet: summary?.guaranteeMet,
      guaranteeOverlayCost: summary?.guaranteeOverlayCost,
      dealerCost: summary?.totalDealerCost,
      rakePerEntry: summary?.rakePerEntry,
      profitPerPlayer: summary?.profitPerPlayer,
    },
  };
};

/**
 * Extended EnrichedGameData with scraper context fields.
 * Used when passing enriched data through the scraper pipeline.
 * Allows null for fields that come from ScrapedGameData.
 */
export type EnrichedGameDataWithContext = Omit<EnrichedGameData, 'hasGuarantee'> & {
  sourceUrl?: string;
  entityId?: string;
  venueMatch?: ScrapedVenueMatch | null;
  // Override to allow null from scraped data
  hasGuarantee?: boolean | null;
  s3Key?: string | null;
  doNotScrape?: boolean | null;
  entries?: unknown[] | null;
  results?: unknown[] | null;
  seating?: unknown[] | null;
};

/**
 * Result type for pipeline enrichment.
 * Returned by enrichForPipeline() in enrichmentService.
 * 
 * ADD THIS TYPE if it doesn't exist in your types/enrichment.ts
 */
export interface PipelineEnrichmentResult {
  success: boolean;
  enrichedGame: EnrichedGameDataWithContext;
  metadata: {
    recurringResolution: {
      status: string;
      confidence: number;
      matchedRecurringGameId?: string | null;
      matchedRecurringGameName?: string | null;
    };
    seriesResolution: {
      status: string;
      confidence: number;
      matchedSeriesId?: string | null;
      matchedSeriesName?: string | null;
    };
    processingTimeMs: number;
  };
  validation: {
    isValid: boolean;
    errors: Array<{ field: string; message: string }>;
    warnings: Array<{ field: string; message: string }>;
  };
}