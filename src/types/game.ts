// This file defines the shared data structures for our game data feature.

export type PlayerResultData = {
    rank: number;
    name: string;
    winnings: number; // The hook will handle potential null/undefined values
};

export type GameData = {
    name: string;
    gameDateTime: string;
    status: string;
    // ✅ FIX: Add all the new fields as optional properties
    registrationStatus?: string;
    gameVariant?: string;
    prizepool?: number;
    totalEntries?: number;
    totalRebuys?: number;
    totalAddons?: number;
    totalDuration?: string;
    gameTags?: string[];
    seriesName?: string;
    tournamentType?: string;
    buyIn?: number;
    rake?: number;
    startingStack?: number;
    hasGuarantee: boolean;
    guaranteeAmount?: number;
    levels: {
        // ✅ FIX: Make properties optional to match backend response
        levelNumber: number;
        durationMinutes?: number;
        smallBlind?: number;
        bigBlind?: number;
        ante?: number;
    }[];
    results?: PlayerResultData[];
    otherDetails: Record<string, string>;
    rawHtml?: string;
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