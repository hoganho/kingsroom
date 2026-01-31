// src/types/dashboard.ts
// Dashboard-specific types for the HomePage and related components

export interface ActiveGameData {
  id: string;
  gameId: string;
  entityId: string;
  venueId?: string | null;
  tournamentId?: number | null;
  name: string;
  venueName?: string | null;
  venueLogoCached?: string | null;
  entityName?: string | null;
  gameStatus: string;
  registrationStatus?: string | null;
  gameStartDateTime: string;
  gameEndDateTime?: string | null;
  totalEntries?: number | null;
  totalUniquePlayers?: number | null;
  playersRemaining?: number | null;
  buyIn?: number | null;
  prizepoolPaid?: number | null;
  prizepoolCalculated?: number | null;
  guaranteeAmount?: number | null;
  hasGuarantee?: boolean | null;
  hasOverlay?: boolean | null;
  gameType?: string | null;
  gameVariant?: string | null;
  tournamentType?: string | null;
  isSeries?: boolean | null;
  seriesName?: string | null;
  isMainEvent?: boolean | null;
  isSatellite?: boolean | null;
  isRecurring?: boolean | null;
  recurringGameName?: string | null;
  sourceUrl?: string | null;
  lastRefreshedAt?: string | null;
  refreshCount?: number | null;
}

export interface FinishedGameData {
  id: string;
  gameId?: string | null;
  entityId?: string | null;
  venueId?: string | null;
  tournamentId?: number | null;
  name: string;
  venueName?: string | null;
  venueLogoCached?: string | null;
  entityName?: string | null;
  venue?: { name: string; logo?: string | null } | null;
  gameStartDateTime: string;
  gameEndDateTime?: string | null;
  finishedAt?: string | null;
  totalDuration?: number | null;
  totalEntries?: number | null;
  totalUniquePlayers?: number | null;
  prizepoolPaid?: number | null;
  prizepoolCalculated?: number | null;
  buyIn?: number | null;
  gameType?: string | null;
  isSeries?: boolean | null;
  seriesName?: string | null;
  isMainEvent?: boolean | null;
  isSatellite?: boolean | null;
  isRecurring?: boolean | null;
  recurringGameName?: string | null;
  sourceUrl?: string | null;
}

export interface UpcomingGameData {
  id: string;
  gameId?: string | null;
  entityId?: string | null;
  venueId?: string | null;
  tournamentId?: number | null;
  name: string;
  venueName?: string | null;
  venueLogoCached?: string | null;
  venue?: { name: string; logo?: string | null } | null;
  gameStartDateTime: string;
  buyIn?: number | null;
  guaranteeAmount?: number | null;
  hasGuarantee?: boolean | null;
  gameType?: string | null;
  gameVariant?: string | null;
  isSeries?: boolean | null;
  seriesName?: string | null;
  isMainEvent?: boolean | null;
  isSatellite?: boolean | null;
  isRecurring?: boolean | null;
  recurringGameName?: string | null;
  sourceUrl?: string | null;
}

export type GameVariant = 'running' | 'clockStopped' | 'startingSoon' | 'upcoming' | 'finished';

export type DashboardGameData = ActiveGameData | FinishedGameData | UpcomingGameData;

// GraphQL response types
export interface ActiveGamesByEntityData {
  activeGamesByEntity: {
    items: ActiveGameData[];
    nextToken?: string | null;
  };
}

export interface RecentlyFinishedByEntityData {
  recentlyFinishedByEntity: {
    items: FinishedGameData[];
    nextToken?: string | null;
  };
}

export interface UpcomingGamesByEntityData {
  upcomingGamesByEntity: {
    items: UpcomingGameData[];
    nextToken?: string | null;
  };
}

export interface GamesByStatusData {
  gamesByStatus: {
    items: Array<FinishedGameData & { entityId?: string }>;
    nextToken?: string | null;
  };
}

export interface OnActiveGameChangeData {
  onActiveGameChange: ActiveGameData;
}

export interface RefreshRunningGamesData {
  refreshRunningGames: {
    success: boolean;
    gamesRefreshed: number;
    gamesUpdated: number;
    gamesFailed: number;
    errors?: string[];
    executionTimeMs?: number;
  };
}

export interface AmplifySubscription {
  unsubscribe: () => void;
}

// Dashboard state interface
export interface DashboardState {
  runningGames: ActiveGameData[];
  clockStoppedGames: ActiveGameData[];
  startingSoonGames: (ActiveGameData | UpcomingGameData)[];
  upcomingGames: (ActiveGameData | UpcomingGameData)[];
  finishedGames: FinishedGameData[];
  loading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  isSubscribed: boolean;
}
