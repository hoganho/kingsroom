// types/game.ts

// Updated type definitions to match the refactored schema
import type { DataSource, GameType, GameStatus, RegistrationStatus, TournamentType, GameVariant, GameFrequency } from '../API';

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
    gameStartDateTime?: string;
    gameEndDateTime?: string;
    gameStatus: GameStatus;
    gameType?: GameType;
    venueId?: string | null;
    gameVariant?: GameVariant;
    gameFrequency?: GameFrequency;
    isSeries?: boolean;
    isRegular?: boolean;
    isSatellite?: boolean;
    
    // Game state and metadata
    registrationStatus?: RegistrationStatus;
    prizepool?: number | null;
    totalEntries?: number | null;
    playersRemaining?: number | null;
    totalChipsInPlay?: number | null;
    averagePlayerStack?: number | null;
    totalRebuys?: number | null;
    totalAddons?: number | null;
    totalDuration?: string | null;
    gameTags?: (string | null)[] | null;
    seriesName?: string | null;
    revenueByBuyIns?: number | null;
    profitLoss?: number | null;

    // Tournament-specific fields (now on Game model)
    tournamentType?: TournamentType | null;
    buyIn?: number | null;
    rake?: number | null;
    totalRake?: number | null;
    startingStack?: number | null;
    hasGuarantee: boolean;
    guaranteeAmount?: number | null;
    guaranteeOverlay?: number | null;
    guaranteeSurplus?: number | null;

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
    otherDetails: Record<string, string>;
    rawHtml?: string | null;

    // Scraper metadata
    structureLabel?: string;
    foundKeys?: string[];
    doNotScrape?: boolean;
    venueMatch?: ScrapedVenueMatch | null;
};

export type MissingField = {
    model: string;
    field: string;
    reason: string;
};

// Job/Scraping status - what's happening with our data fetching process
export type JobStatus = 
    | 'IDLE'           // Not doing anything
    | 'FETCHING'       // Initial request to backend
    | 'SCRAPING'       // Axios is fetching the HTML
    | 'PARSING'        // Cheerio is parsing the HTML
    | 'READY_TO_SAVE'  // Data is ready, user can save
    | 'SAVING'         // Currently saving to database
    | 'DONE'           // Successfully saved
    | 'ERROR';         // Something went wrong

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
}

// Updated input types to match new schema
export interface SaveTournamentInput {
    id?: string;
    sourceUrl: string;
    venueId: string;
    data: GameDataInput;
    existingGameId?: string | null;
    doNotScrape?: boolean;
    originalScrapedData?: GameData;
}

export interface GameDataInput {
    name: string;
    gameStartDateTime?: string; 
    gameEndDateTime?: string; 
    gameStatus?: GameStatus;
    registrationStatus?: RegistrationStatus;
    gameVariant?: GameVariant;
    gameType?: GameType;
    prizepool?: number;
    totalEntries?: number;
    totalRebuys?: number;
    totalAddons?: number;
    totalDuration?: string;
    gameTags?: string[];
    
    // Tournament-specific fields (now directly in game input)
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

// ✅ NEW: Defines the shape of a single venue suggestion.
export type ScrapedVenueMatchDetails = {
  id: string;
  name: string;
  score: number;
};

// ✅ REVISED: This replaces the old VenueMatch type to align with the new backend response.
export type ScrapedVenueMatch = {
  autoAssignedVenue?: ScrapedVenueMatchDetails | null;
  suggestions?: ScrapedVenueMatchDetails[] | null;
};