// scheduleTypes.ts
// Type definitions for recurring game schedule operations
// VERSION: 3.1.0 - Added firstGameDate field

// NOTE: These types should match the auto-generated API.ts from amplify codegen
// If using the generated types, replace these with:
// import { RecurringGameInstanceStatus, GameFrequency } from './API';

export type RecurringGameInstanceStatus =
  | 'CONFIRMED'
  | 'CANCELLED'
  | 'SKIPPED'
  | 'REPLACED'
  | 'UNKNOWN'
  | 'NO_SHOW';

export type GameFrequency =
  | 'DAILY'
  | 'WEEKLY'
  | 'FORTNIGHTLY'
  | 'MONTHLY'
  | 'QUARTERLY'
  | 'YEARLY'
  | 'UNKNOWN';

// ===================================================================
// INPUT TYPES
// ===================================================================

export interface DetectGapsInput {
  venueId: string;
  startDate: string; // AWSDate format: YYYY-MM-DD
  endDate: string;
  createInstances?: boolean;
}

export interface ReconcileInstancesInput {
  venueId: string;
  startDate: string;
  endDate: string;
  preview?: boolean;
}

export interface VenueComplianceReportInput {
  venueId: string;
  startDate: string;
  endDate: string;
}

export interface RecordMissedInstanceInput {
  recurringGameId: string;
  expectedDate: string;
  status: 'CANCELLED' | 'SKIPPED' | 'NO_SHOW';
  reason?: string;
  adminNotes?: string;
}

// ===================================================================
// RESULT TYPES
// ===================================================================

export interface GapInfo {
  recurringGameId: string;
  recurringGameName: string;
  venueId: string;
  expectedDate: string;
  dayOfWeek: string;
  weekKey: string;
}

export interface DetectGapsResult {
  success: boolean;
  venueId: string;
  startDate: string;
  endDate: string;
  recurringGamesChecked: number;
  totalExpectedInstances: number;
  gapsFound: number;
  gaps: GapInfo[];
  instancesCreated?: number;
  error?: string;
}

export interface ReconcileAction {
  recurringGameId: string;
  recurringGameName: string;
  expectedDate: string;
  action: string;
  gameId?: string;
  gameName?: string;
  status?: RecurringGameInstanceStatus;
  details?: string;
}

export interface ReconcileInstancesResult {
  success: boolean;
  venueId: string;
  startDate: string;
  endDate: string;
  preview: boolean;
  recurringGamesProcessed: number;
  totalExpectedInstances: number;
  existingInstancesFound: number;
  gamesMatchedToInstances: number;
  newInstancesCreated: number;
  orphanedGamesFound: number;
  actions: ReconcileAction[];
  error?: string;
}

export interface RecurringGameCompliance {
  recurringGameId: string;
  recurringGameName: string;
  dayOfWeek: string;
  frequency: GameFrequency;
  expectedInstances: number;
  confirmedInstances: number;
  cancelledInstances: number;
  skippedInstances: number;
  unknownInstances: number;
  complianceRate: number;
  lastConfirmedDate?: string;
  lastCancelledDate?: string;
  consecutiveMisses: number;
}

export interface VenueComplianceReport {
  success: boolean;
  venueId: string;
  venueName?: string;
  startDate: string;
  endDate: string;
  generatedAt: string;
  totalRecurringGames: number;
  totalExpected: number;
  totalConfirmed: number;
  totalCancelled: number;
  totalSkipped: number;
  totalUnknown: number;
  overallComplianceRate: number;
  gameCompliance: RecurringGameCompliance[];
  gamesWithLowCompliance: RecurringGameCompliance[];
  gamesWithConsecutiveMisses: RecurringGameCompliance[];
  error?: string;
}

export interface RecordMissedInstanceResult {
  success: boolean;
  instanceId?: string;
  recurringGameId: string;
  expectedDate: string;
  status: RecurringGameInstanceStatus;
  wasCreated: boolean;
  error?: string;
}

export interface DateRangeFromFirstGameResult {
  success: boolean;
  startDate: string;
  endDate: string;
  error?: string;
}

// ===================================================================
// INTERNAL TYPES
// ===================================================================

export interface RecurringGameRecord {
  id: string;
  name: string;
  displayName?: string;
  venueId: string;
  entityId: string;
  dayOfWeek: string;
  frequency: GameFrequency;
  isActive: boolean;
  isPaused?: boolean;
  startTime?: string;
  firstGameDate?: string;  // AWSDateTime: ISO datetime of earliest assigned game
  lastGameDate?: string;   // AWSDateTime: ISO datetime of most recent assigned game
  nextScheduledDate?: string;
}

export interface RecurringGameInstanceRecord {
  id: string;
  recurringGameId: string;
  gameId?: string;
  expectedDate: string;
  dayOfWeek: string;
  weekKey: string;
  venueId: string;
  entityId: string;
  recurringGameName?: string;
  status: RecurringGameInstanceStatus;
  hasDeviation?: boolean;
  deviationType?: string;
  deviationDetails?: string;
  notes?: string;
  adminNotes?: string;
  cancellationReason?: string;
  needsReview?: boolean;
  reviewReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GameRecord {
  id: string;
  name: string;
  venueId: string;
  entityId: string;
  gameStartDateTime: string;
  gameDayOfWeek?: string;
  recurringGameId?: string;
  recurringGameAssignmentStatus?: string;
  gameStatus: string;
}

export interface CreateInstanceInput {
  recurringGameId: string;
  gameId?: string;
  expectedDate: string;
  dayOfWeek: string;
  weekKey: string;
  venueId: string;
  entityId: string;
  recurringGameName?: string;
  status: RecurringGameInstanceStatus;
  cancellationReason?: string;
  adminNotes?: string;
}

export interface UpdateInstanceInput {
  gameId?: string;
  status?: RecurringGameInstanceStatus;
  cancellationReason?: string;
  adminNotes?: string;
  hasDeviation?: boolean;
  deviationType?: string;
  deviationDetails?: string;
  needsReview?: boolean;
  reviewReason?: string;
  notes?: string;
}