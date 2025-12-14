// types/game.ts
// UPDATED: Simplified financial metrics (removed rakeSubsidy complexity)

import type { DataSource, GameType, GameStatus, RegistrationStatus, TournamentType, GameVariant, GameFrequency, VenueAssignmentStatus } from '../API';

export type RecurringGameAssignmentStatus = 'AUTO_ASSIGNED' | 'MANUALLY_ASSIGNED' | 'PENDING_ASSIGNMENT' | 'NOT_RECURRING' | 'DEVIATION_FLAGGED';

export type TournamentLevelData = {
    levelNumber: number;
    durationMinutes: number;
    smallBlind: number;
    bigBlind: number;
    ante?: number | null;
    breakMinutes?: number | null;
};

export type PlayerResultData = {
    rank: number;
    name: string;
    winnings: number;
    points?: number | null;
    isQualification?: boolean;
};

export type PlayerEntryData = {
    name: string;
};

export type PlayerSeatingData = {
    name: string;
    table: number;
    seat: number;
    playerStack?: number | null;
};

export type BreakData = {
    levelNumberBeforeBreak: number;
    durationMinutes: number;
};

export type TableSeatData = {
    seat: number;
    isOccupied: boolean;
    playerName?: string | null;
    playerStack?: number | null;
};

export type TableData = {
    tableName: string;
    seats: TableSeatData[];
};

export type BulkGameSummary = {
    id: string;
    name?: string | null;
    gameStatus?: GameStatus | 'NOT_IN_USE' | null;
    registrationStatus?: RegistrationStatus | 'N_A' | null;
    gameStartDateTime?: string | null;
    inDatabase?: boolean | null;
    doNotScrape?: boolean | null;
    error?: string | null;
};

export type GameData = {
    // Basic game information
    name: string;
    tournamentId: number;
    gameStartDateTime?: string;
    gameEndDateTime?: string;
    gameStatus: GameStatus;
    gameType?: GameType;
    venueId?: string | null;
    entityId?: string | null;
    gameVariant?: GameVariant;
    gameFrequency?: GameFrequency;
    isRegular?: boolean;
    isSatellite?: boolean;
    
    // Venue fee (populated from venue.fee when game is created)
    venueFee?: number | null;
    
    // Series state and metadata
    isSeries?: boolean;
    tournamentSeriesId?: string | null;
    seriesTitleId?: string | null;  // Direct link to TournamentSeriesTitle for queries
    isMainEvent?: boolean;
    eventNumber?: number | null;
    dayNumber?: number | null;
    flightLetter?: string | null;
    finalDay?: boolean;

    // Game state and metadata
    registrationStatus?: RegistrationStatus;
    prizepoolPaid?: number | null;
    prizepoolCalculated?: number | null;
    totalUniquePlayers?: number | null;
    totalInitialEntries?: number | null;
    totalEntries?: number | null;
    playersRemaining?: number | null;
    totalChipsInPlay?: number | null;
    averagePlayerStack?: number | null;
    totalRebuys?: number | null;
    totalAddons?: number | null;
    totalDuration?: string | null;
    gameTags?: (string | null)[] | null;
    seriesName?: string | null;
    gameDayOfWeek?: string | null;
    buyInBucket?: string | null;

    // === NEW RECURRING GAME FIELDS (ADD THESE) ===
    recurringGameId?: string | null;
    recurringGameAssignmentStatus?: RecurringGameAssignmentStatus;
    recurringGameAssignmentConfidence?: number;
    wasScheduledInstance?: boolean;
    deviationNotes?: string | null;
    instanceNumber?: number | null;
    isReplacementInstance?: boolean;
    replacementReason?: string | null;

    // Revenue
    totalBuyInsCollected?: number | null;         // Total money from players: buyIn × totalEntries
    rakeRevenue?: number | null;                  // Rake we collect: rake × entriesForRake
    
    // Prizepool
    prizepoolPlayerContributions?: number | null; // From players: (buyIn - rake) × entries
    prizepoolAddedValue?: number | null;          // From house: guaranteeOverlayCost
    prizepoolSurplus?: number | null;             // Excess above guarantee (bonus to players)
    
    // Cost
    guaranteeOverlayCost?: number | null;         // Shortfall we pay: max(0, guarantee - playerContributions)
    
    // Profit
    gameProfit?: number | null;                   // Simple: rakeRevenue - guaranteeOverlayCost

    // Tournament-specific fields (now on Game model)
    tournamentType?: TournamentType | null;
    buyIn?: number | null;
    rake?: number | null;
    startingStack?: number | null;
    hasGuarantee: boolean;
    guaranteeAmount?: number | null;

    // Blind structure (embedded)
    levels: TournamentLevelData[];
    
    // Player results
    results?: PlayerResultData[] | null;
    
    // Add entries, seating, breaks, and tables
    entries?: PlayerEntryData[] | null;
    seating?: PlayerSeatingData[] | null;
    breaks?: BreakData[] | null;
    tables?: TableData[] | null;

    // Additional data
    rawHtml?: string | null;

    // Scraper metadata
    structureLabel?: string;
    foundKeys?: string[];
    doNotScrape?: boolean;
    venueMatch?: ScrapedVenueMatch | null;
    s3Key?: string;
    venueAssignmentStatus?: VenueAssignmentStatus | null;
};

export type MissingField = {
    model: string;
    field: string;
    reason: string;
};

// Job/Scraping status
export type JobStatus = 
    | 'IDLE'
    | 'FETCHING'
    | 'SCRAPING'
    | 'PARSING'
    | 'READY_TO_SAVE'
    | 'SAVING'
    | 'DONE'
    | 'ERROR';

export interface GameState {
    id: string;
    source: DataSource;
    jobStatus: JobStatus;
    data?: GameData;
    missingFields?: MissingField[];
    lastFetched?: string;
    errorMessage?: string;
    saveResult?: any;
    isNewStructure?: boolean;
    autoRefresh?: boolean;
    fetchCount: number;
    existingGameId?: string | null;
    entityId?: string | null;
}

export interface SaveTournamentInput {
    id?: string;
    sourceUrl: string;
    venueId?: string | null;
    entityId?: string | null;
    data: GameDataInput;
    existingGameId?: string | null;
    doNotScrape?: boolean;
    originalScrapedData?: any;
    venueAssignmentStatus?: VenueAssignmentStatus | null;
    requiresVenueAssignment?: boolean | null;
    suggestedVenueName?: string | null;
    venueAssignmentConfidence?: number | null;
}

export interface GameDataInput {
    name: string;
    entityId?: string;
    gameStartDateTime?: string; 
    gameEndDateTime?: string; 
    gameStatus?: GameStatus;
    registrationStatus?: RegistrationStatus;
    gameVariant?: GameVariant;
    gameType?: GameType;
    prizepoolPaid?: number;
    prizepoolCalculated?: number;
    totalUniquePlayers?: number;
    totalInitialEntries?: number;
    totalEntries?: number;
    totalRebuys?: number;
    totalAddons?: number;
    totalDuration?: string;
    gameTags?: string[];
    venueFee?: number;
    
    // Tournament-specific fields
    tournamentType?: TournamentType;
    buyIn?: number;
    rake?: number;
    startingStack?: number;
    hasGuarantee?: boolean;
    guaranteeAmount?: number;
    
    // Blind levels
    levels?: TournamentLevelInput[];
}

export interface TournamentLevelInput {
    levelNumber: number;
    durationMinutes?: number;
    smallBlind?: number;
    bigBlind?: number;
    ante?: number;
    breakMinutes?: number;
}

export type ScrapedVenueMatchDetails = {
  id: string;
  name: string;
  score: number;
};

export type ScrapedVenueMatch = {
  autoAssignedVenue?: ScrapedVenueMatchDetails | null;
  suggestions?: ScrapedVenueMatchDetails[] | null;
};

export interface EntityConfig {
    id: string;
    entityName: string;
    gameUrlDomain: string;
    gameUrlPath: string;
    entityLogo?: string | null;
    isActive: boolean;
}

export interface SeriesReferenceData {
  tournamentSeriesId?: string | null;
  seriesName?: string | null;
  isSeries?: boolean;
  isMainEvent?: boolean;
  eventNumber?: number | null;
  dayNumber?: number | null;
  flightLetter?: string | null;
  finalDay?: boolean;
}

export interface SaveGameInput {
  source: {
    type: 'SCRAPE' | 'MANUAL';
    sourceId: string;
    entityId: string;
    fetchedAt: string;
    wasEdited?: boolean;
  };
  game: GameDataInput;
  venue?: {
    venueId: string;
    venueName?: string;
  };
  series?: {
    seriesId: string;
    seriesName: string;
    seriesTitleId?: string;
    year: number;
    isMainEvent?: boolean;
    eventNumber?: number;
    dayNumber?: number;
    flightLetter?: string;
    finalDay?: boolean;
  };
  players?: any[];
  options?: {
    skipPlayerProcessing?: boolean;
    forceUpdate?: boolean;
    validateOnly?: boolean;
  };
}