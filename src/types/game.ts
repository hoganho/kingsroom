// Updated type definitions to match the refactored schema

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
};

export type PlayerEntryData = {
    name: string;
};

// ✅ FIXED: Added the missing playerStack property
export type PlayerSeatingData = {
    name: string;
    table: number;
    seat: number;
    playerStack?: number | null; // This line was added
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
    status?: string | null;
    registrationStatus?: string | null;
    gameStartDateTime?: string | null;
    inDatabase?: boolean | null;
    doNotScrape?: boolean | null;
    error?: string | null;
};

// Tournament/Game status - what's happening with the actual game
export type GameStatus = 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';

export type GameData = {
    // Basic game information
    name: string;
    gameStartDateTime?: string;
    gameEndDateTime?: string;
    status: GameStatus;
    type?: 'TOURNAMENT' | 'CASH_GAME';
    variant?: string | null;
    
    // Game state and metadata
    registrationStatus?: string | null;
    gameVariant?: string | null;
    prizepool?: number | null;
    totalEntries?: number | null;
    playersRemaining?: number | null;
    totalRebuys?: number | null;
    totalAddons?: number | null;
    totalDuration?: string | null;
    gameTags?: (string | null)[] | null;
    seriesName?: string | null;
    revenueByEntries?: number | null;
    
    // Tournament-specific fields (now on Game model)
    tournamentType?: 'FREEZEOUT' | 'REBUY' | 'SATELLITE' | 'DEEPSTACK' | null;
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
    otherDetails: Record<string, string>;
    rawHtml?: string | null;

    // Scraper metadata
    structureLabel?: string;
    foundKeys?: string[];
    
    doNotScrape?: boolean;
};

export type MissingField = {
    model: string;
    field: string;
    reason: string;
};

export type DataSource = 'SCRAPE' | 'API';

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
    status: JobStatus;
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
}

export interface GameDataInput {
    name: string;
    gameStartDateTime?: string; 
    gameEndDateTime?: string; 
    status?: GameStatus;
    registrationStatus?: string;
    gameVariant?: string;
    prizepool?: number;
    totalEntries?: number;
    totalRebuys?: number;
    totalAddons?: number;
    totalDuration?: string;
    gameTags?: string[];
    
    // Tournament-specific fields (now directly in game input)
    tournamentType?: 'FREEZEOUT' | 'REBUY' | 'SATELLITE' | 'DEEPSTACK';
    buyIn?: number;
    rake?: number;
    startingStack?: number;
    hasGuarantee?: boolean;
    guaranteeAmount?: number;
    
    // Blind levels
    levels?: TournamentLevelInput[];
    
    doNotScrape?: boolean;
}

export interface TournamentLevelInput {
    levelNumber: number;
    durationMinutes?: number;
    smallBlind?: number;
    bigBlind?: number;
    ante?: number;
    breakMinutes?: number;
}