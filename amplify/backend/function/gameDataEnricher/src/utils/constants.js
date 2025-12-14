/**
 * constants.js
 * Shared constants, enums, and default values for the enricher
 */

// ===================================================================
// GAME STATUS ENUMS
// ===================================================================

const GameStatus = {
  INITIATING: 'INITIATING',
  SCHEDULED: 'SCHEDULED',
  REGISTERING: 'REGISTERING',
  RUNNING: 'RUNNING',
  CANCELLED: 'CANCELLED',
  FINISHED: 'FINISHED',
  NOT_IN_USE: 'NOT_IN_USE',
  NOT_PUBLISHED: 'NOT_PUBLISHED',
  CLOCK_STOPPED: 'CLOCK_STOPPED',
  UNKNOWN: 'UNKNOWN'
};

const RegistrationStatus = {
  SCHEDULED: 'SCHEDULED',
  OPEN: 'OPEN',
  FINAL: 'FINAL',
  CLOSED: 'CLOSED',
  N_A: 'N_A'
};

const GameType = {
  TOURNAMENT: 'TOURNAMENT',
  CASH_GAME: 'CASH_GAME'
};

const GameVariant = {
  NLHE: 'NLHE',
  PLO: 'PLO',
  PLOM: 'PLOM',
  NOT_PUBLISHED: 'NOT_PUBLISHED'
};

const GameFrequency = {
  DAILY: 'DAILY',
  WEEKLY: 'WEEKLY',
  FORTNIGHTLY: 'FORTNIGHTLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  YEARLY: 'YEARLY',
  UNKNOWN: 'UNKNOWN'
};

// ===================================================================
// ASSIGNMENT STATUS ENUMS
// ===================================================================

const VenueAssignmentStatus = {
  AUTO_ASSIGNED: 'AUTO_ASSIGNED',
  MANUALLY_ASSIGNED: 'MANUALLY_ASSIGNED',
  PENDING_ASSIGNMENT: 'PENDING_ASSIGNMENT',
  UNASSIGNED: 'UNASSIGNED',
  RETROACTIVE_ASSIGNED: 'RETROACTIVE_ASSIGNED'
};

const SeriesAssignmentStatus = {
  AUTO_ASSIGNED: 'AUTO_ASSIGNED',
  MANUALLY_ASSIGNED: 'MANUALLY_ASSIGNED',
  PENDING_ASSIGNMENT: 'PENDING_ASSIGNMENT',
  UNASSIGNED: 'UNASSIGNED',
  NOT_SERIES: 'NOT_SERIES'
};

const RecurringGameAssignmentStatus = {
  AUTO_ASSIGNED: 'AUTO_ASSIGNED',
  MANUALLY_ASSIGNED: 'MANUALLY_ASSIGNED',
  PENDING_ASSIGNMENT: 'PENDING_ASSIGNMENT',
  NOT_RECURRING: 'NOT_RECURRING',
  DEVIATION_FLAGGED: 'DEVIATION_FLAGGED'
};

// ===================================================================
// RESOLUTION STATUS ENUMS (Enricher-specific)
// ===================================================================

const SeriesResolutionStatus = {
  MATCHED_EXISTING: 'MATCHED_EXISTING',
  CREATED_NEW: 'CREATED_NEW',
  NOT_SERIES: 'NOT_SERIES',
  SKIPPED: 'SKIPPED',
  FAILED: 'FAILED'
};

const RecurringResolutionStatus = {
  MATCHED_EXISTING: 'MATCHED_EXISTING',
  CREATED_NEW: 'CREATED_NEW',
  NOT_RECURRING: 'NOT_RECURRING',
  SKIPPED: 'SKIPPED',
  FAILED: 'FAILED'
};

// ===================================================================
// DEFAULT VALUES
// ===================================================================

const DEFAULT_GAME_VALUES = {
  gameType: GameType.TOURNAMENT,
  gameStatus: GameStatus.SCHEDULED,
  registrationStatus: RegistrationStatus.SCHEDULED,
  gameVariant: GameVariant.NLHE,
  hasGuarantee: false,
  isSeries: false,
  isRegular: true,
  isSatellite: false,
  totalRebuys: 0,
  totalAddons: 0,
  venueAssignmentStatus: VenueAssignmentStatus.PENDING_ASSIGNMENT,
  seriesAssignmentStatus: SeriesAssignmentStatus.NOT_SERIES,
  recurringGameAssignmentStatus: RecurringGameAssignmentStatus.PENDING_ASSIGNMENT
};

// ===================================================================
// QUERY KEY CONSTANTS
// ===================================================================

const DAYS_OF_WEEK = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

const BUY_IN_BUCKETS = [
  { max: 25, label: '0000-0025' },
  { max: 50, label: '0026-0050' },
  { max: 100, label: '0051-0100' },
  { max: 200, label: '0101-0200' },
  { max: 500, label: '0201-0500' },
  { max: 1000, label: '0501-1000' },
  { max: Infinity, label: '1001-PLUS' }
];

const GAME_CLASSIFICATION_TYPES = ['REGULAR', 'SERIES', 'SATELLITE', 'STANDARD'];

// ===================================================================
// SERIES DETECTION CONSTANTS
// ===================================================================

const SERIES_KEYWORDS = [
  'championship', 'festival', 'series', 'classic', 'open',
  'cup', 'challenge', 'state', 'annual', 'invitational',
  'platinum', 'diamond', 'gold', 'prestige', 'tour'
];

const STRUCTURE_KEYWORDS = [
  'flight 1', 'flight a', 'flight b', 'flight c', 'flight d',
  'day 2', 'day 3', 'final day', 'main event', 'high roller'
];

// NSW/Australian Major Holidays (Month 0-11)
const HOLIDAY_PATTERNS = [
  { name: 'New Years', month: 0, day: 1, window: 3 },
  { name: 'Australia Day', month: 0, day: 26, window: 4 },
  { name: 'Anzac Day', month: 3, day: 25, window: 5 },
  { name: 'Kings Birthday', month: 5, window: 7 },
  { name: 'Labour Day', month: 9, window: 7 },
  { name: 'Christmas', month: 11, day: 25, window: 7 },
  { name: 'Easter', month: 2, window: 14 },
  { name: 'Easter', month: 3, window: 14 }
];

// ===================================================================
// VALIDATION THRESHOLDS
// ===================================================================

const VALIDATION_THRESHOLDS = {
  MIN_BUY_IN: 0,
  MAX_BUY_IN: 100000,
  MIN_RAKE: 0,
  MAX_RAKE_PERCENTAGE: 0.5, // Rake should not exceed 50% of buy-in
  MIN_GUARANTEE: 0,
  MAX_GUARANTEE: 10000000,
  MIN_ENTRIES: 0,
  MAX_ENTRIES: 10000,
  SERIES_NAME_SIMILARITY_THRESHOLD: 70,
  RECURRING_MATCH_THRESHOLD: 75
};

module.exports = {
  // Enums
  GameStatus,
  RegistrationStatus,
  GameType,
  GameVariant,
  GameFrequency,
  VenueAssignmentStatus,
  SeriesAssignmentStatus,
  RecurringGameAssignmentStatus,
  SeriesResolutionStatus,
  RecurringResolutionStatus,
  
  // Defaults
  DEFAULT_GAME_VALUES,
  
  // Query Keys
  DAYS_OF_WEEK,
  BUY_IN_BUCKETS,
  GAME_CLASSIFICATION_TYPES,
  
  // Series Detection
  SERIES_KEYWORDS,
  STRUCTURE_KEYWORDS,
  HOLIDAY_PATTERNS,
  
  // Validation
  VALIDATION_THRESHOLDS
};
