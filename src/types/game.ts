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

// Tournament/Game status - what's happening with the actual game
export type GameStatus = 'SCHEDULED' | 'RUNNING' | 'COMPLETED' | 'CANCELLED';

export type GameData = {
    // Basic game information
    name: string;
    gameStartDateTime?: string; // ✅ UPDATED: Now optional
    gameEndDateTime?: string; // ✅ NEW
    status: GameStatus; // Changed to use specific type
    type?: 'TOURNAMENT' | 'CASH_GAME';
    variant?: string | null;
    
    // Game state and metadata
    registrationStatus?: string | null;
    gameVariant?: string | null;
    prizepool?: number | null;
    totalEntries?: number | null;
    totalRebuys?: number | null;
    totalAddons?: number | null;
    totalDuration?: string | null;
    gameTags?: (string | null)[] | null;
    seriesName?: string | null;
    revenueByEntries?: number | null; // ✅ NEW
    
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
    
    // Additional data
    otherDetails: Record<string, string>;
    rawHtml?: string | null;

    // Scraper metadata
    structureLabel?: string;
    foundKeys?: string[];
    
    // ✅ NEW: Flag to control scraping
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
    // Track if we should auto-refresh (for RUNNING tournaments)
    autoRefresh?: boolean;
    // ✅ NEW: Track number of fetches
    fetchCount: number;
    // ✅ NEW: Track if game exists in DB
    existingGameId?: string | null;
}

// Updated input types to match new schema
export interface SaveTournamentInput {
    id?: string;
    sourceUrl: string;
    venueId: string;
    data: GameDataInput;
    // ✅ NEW: Add existingGameId for update logic
    existingGameId?: string | null;
    // ✅ NEW: Add doNotScrape flag
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
    
    // ✅ NEW: Flag to control scraping
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

