// types/gameEditor.ts
// Editor-specific types that EXTEND existing types from game.ts and API.ts
// Does NOT duplicate GameData - imports it instead

import type { GameData } from './game';
import type { DataSource, GameType, GameStatus, RegistrationStatus, GameVariant } from '../API';

// ===================================================================
// EDITOR MODES & STEPS
// ===================================================================

export type GameEditorMode = 
  | 'create'    // Manual game creation - starts with defaults
  | 'edit'      // Editing existing game from database
  | 'confirm';  // Confirming scraped game before save

export type GameEditorStep = 
  | 'form'      // Data entry/editing
  | 'preview'   // Validation & review
  | 'saving'    // API call in progress
  | 'success'   // Save completed
  | 'error';    // Save failed

// ===================================================================
// DROPDOWN OPTIONS (for entity/venue/recurring selectors)
// ===================================================================

export interface EntityOption {
  id: string;
  entityName: string;
  isActive?: boolean;
}

export interface VenueOption {
  id: string;
  name: string;
  entityId: string;
  entityName?: string;
  isSpecial?: boolean;
}

export interface RecurringGameOption {
  id: string;
  name: string;
  venueId: string;
  venueName?: string;
  entityId?: string;
  dayOfWeek: string;
  startTime: string;
  // Template values for auto-populate
  buyIn?: number;
  rake?: number;
  startingStack?: number;
  guaranteeAmount?: number;
  gameVariant?: string;
  gameType?: string;
  isSignature?: boolean;
  isBounty?: boolean;
}

export interface SeriesOption {
  id: string;
  name: string;
  year?: number;
  venueId?: string;
  status?: string;
}

// ===================================================================
// EDITOR CONFIGURATION
// ===================================================================

export interface GameEditorConfig {
  mode: GameEditorMode;
  
  // Initial data (for edit/confirm modes)
  initialData?: Partial<GameData>;
  existingGameId?: string;
  
  // Pre-selected context
  entityId?: string;
  venueId?: string;
  
  // Data source info (for confirm mode from scraper)
  dataSource?: {
    type: DataSource;
    sourceId: string;
    entityId: string;
    fetchedAt?: string;
    contentHash?: string;
    wasEdited?: boolean;
  };
  
  // Callbacks
  onSaveSuccess?: (result: SaveGameResult) => void;
  onSaveError?: (error: Error) => void;
  onCancel?: () => void;
}

// ===================================================================
// SAVE RESULT (matches your GraphQL SaveGameResult)
// ===================================================================

export interface SaveGameResult {
  success: boolean;
  gameId?: string;
  action: 'CREATED' | 'UPDATED' | 'NO_CHANGES';
  message?: string;
  warnings?: string[];
  playerProcessingQueued?: boolean;
  playerProcessingReason?: string;
  venueAssignment?: {
    venueId?: string;
    status?: string;
    confidence?: number;
  };
  seriesAssignment?: {
    tournamentSeriesId?: string;
    seriesName?: string;
    status?: string;
    confidence?: number;
  };
  fieldsUpdated?: string[];
  wasEdited?: boolean;
}

// ===================================================================
// FIELD GROUP CONFIGURATION (for form organization)
// ===================================================================

export interface FieldGroupConfig {
  id: string;
  title: string;
  fields: (keyof GameData)[];
  priority: 'critical' | 'important' | 'standard' | 'optional';
  defaultExpanded: boolean;
  showInModes?: GameEditorMode[];
  showWhen?: (data: Partial<GameData>) => boolean;
}

// ===================================================================
// DEFAULT VALUES
// ===================================================================

export const DEFAULT_GAME_VALUES: Partial<GameData> = {
  gameType: 'TOURNAMENT' as GameType,
  gameStatus: 'SCHEDULED' as GameStatus,
  registrationStatus: 'SCHEDULED' as RegistrationStatus,
  gameVariant: 'NLHE' as GameVariant,
  hasGuarantee: false,
  isSeries: false,
  isRegular: true,
  isSatellite: false,
  totalRebuys: 0,
  totalAddons: 0,
  levels: [],
};

// Helper to get sensible default start time (next hour)
export const getDefaultStartTime = (): string => {
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  return now.toISOString();
};

export const getDefaultDataForMode = (
  mode: GameEditorMode, 
  config: GameEditorConfig
): Partial<GameData> => {
  switch (mode) {
    case 'create':
      return {
        ...DEFAULT_GAME_VALUES,
        entityId: config.entityId,
        venueId: config.venueId,
        gameStartDateTime: getDefaultStartTime(),
      };
    
    case 'edit':
    case 'confirm':
      return config.initialData || {};
    
    default:
      return DEFAULT_GAME_VALUES;
  }
};