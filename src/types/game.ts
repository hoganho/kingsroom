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

export type GameData = {
    // Basic game information
    name: string;
    gameDateTime: string;
    status: string;
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
};

export type MissingField = {
    model: string;
    field: string;
    reason: string;
};

export type DataSource = 'SCRAPE' | 'API';
export type JobStatus = 'IDLE' | 'FETCHING' | 'READY_TO_SAVE' | 'LIVE' | 'DONE' | 'ERROR' | 'SAVING';

export interface GameState {
    id: string;
    source: DataSource;
    status: JobStatus;
    data?: GameData;
    missingFields?: MissingField[];
    lastFetched?: string;
    errorMessage?: string;
    saveResult?: any;
}

// Updated input types to match new schema
export interface SaveTournamentInput {
    id?: string;
    sourceUrl: string;
    venueId: string;
    data: GameDataInput;
}

export interface GameDataInput {
    name: string;
    gameDateTime?: string;
    status?: string;
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
}

export interface TournamentLevelInput {
    levelNumber: number;
    durationMinutes?: number;
    smallBlind?: number;
    bigBlind?: number;
    ante?: number;
    breakMinutes?: number;
}