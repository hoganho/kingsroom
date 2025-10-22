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
    registrationStatus?: string | null;
    gameVariant?: string | null;
    prizepool?: number | null;
    totalEntries?: number | null;
    totalRebuys?: number | null;
    totalAddons?: number | null;
    totalDuration?: string | null;
    gameTags?: (string | null)[] | null;
    seriesName?: string | null;
    tournamentType?: string | null;
    buyIn?: number | null;
    rake?: number | null;
    startingStack?: number | null;
    hasGuarantee: boolean;
    guaranteeAmount?: number | null;
    levels: {
        levelNumber: number;
        durationMinutes?: number | null;
        smallBlind?: number | null;
        bigBlind?: number | null;
        ante?: number | null;
    }[];
    results?: {
        rank: number;
        name: string;
        winnings: number;
    }[] | null;
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