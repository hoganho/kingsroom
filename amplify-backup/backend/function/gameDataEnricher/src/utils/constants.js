/**
 * constants.js
 * Shared constants, enums, and default values for the enricher
 * 
 * UPDATED: Synced with GraphQL schema + new classification taxonomy
 */

// ===================================================================
// GAME STATUS ENUMS (Existing - unchanged)
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

// ===================================================================
// LEGACY GAME TYPE/VARIANT ENUMS (Keep for backward compatibility)
// ===================================================================

const GameType = {
  TOURNAMENT: 'TOURNAMENT',
  CASH_GAME: 'CASH_GAME'
};

// FIXED: Now includes ALL values from schema
const GameVariant = {
  NOT_PUBLISHED: 'NOT_PUBLISHED',
  NLHE: 'NLHE',
  PLO: 'PLO',
  PLOM: 'PLOM',
  PL04: 'PL04',
  PLOM4: 'PLOM4',
  PLOM5: 'PLOM5',
  PLO5: 'PLO5',
  PLO6: 'PLO6',
  PLOM6: 'PLOM6',
  PLMIXED: 'PLMIXED',
  PLDC: 'PLDC',
  NLDC: 'NLDC'
};

const TournamentType = {
  FREEZEOUT: 'FREEZEOUT',
  REBUY: 'REBUY',
  SATELLITE: 'SATELLITE',
  DEEPSTACK: 'DEEPSTACK'
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
// NEW CLASSIFICATION ENUMS
// ===================================================================

// Primary session type - replaces GameType
const SessionMode = {
  CASH: 'CASH',
  TOURNAMENT: 'TOURNAMENT'
};

// Core poker variant - the base game being played
const PokerVariant = {
  // Hold'em family
  HOLD_EM: 'HOLD_EM',
  HOLD_EM_SHORT_DECK: 'HOLD_EM_SHORT_DECK',
  // Omaha family - 4 card
  OMAHA_HI: 'OMAHA_HI',
  OMAHA_HILO: 'OMAHA_HILO',
  // Omaha family - 5 card
  OMAHA5_HI: 'OMAHA5_HI',
  OMAHA5_HILO: 'OMAHA5_HILO',
  // Omaha family - 6 card
  OMAHA6_HI: 'OMAHA6_HI',
  OMAHA6_HILO: 'OMAHA6_HILO',
  // Stud family
  STUD_HI: 'STUD_HI',
  STUD_HILO: 'STUD_HILO',
  RAZZ: 'RAZZ',
  // Draw family
  DRAW_2_7_TRIPLE: 'DRAW_2_7_TRIPLE',
  DRAW_2_7_SINGLE: 'DRAW_2_7_SINGLE',
  DRAW_5_CARD: 'DRAW_5_CARD',
  BADUGI: 'BADUGI',
  // Mixed games
  MIXED_HORSE: 'MIXED_HORSE',
  MIXED_8GAME: 'MIXED_8GAME',
  MIXED_HOSE: 'MIXED_HOSE',
  MIXED_RASH: 'MIXED_RASH',
  MIXED_DEALERS_CHOICE: 'MIXED_DEALERS_CHOICE',
  MIXED_ROTATION: 'MIXED_ROTATION',
  MIXED_OTHER: 'MIXED_OTHER',
  // Specialty
  COURCHEVEL: 'COURCHEVEL',
  IRISH: 'IRISH',
  PINEAPPLE: 'PINEAPPLE',
  CRAZY_PINEAPPLE: 'CRAZY_PINEAPPLE',
  // Fallback
  OTHER: 'OTHER',
  NOT_SPECIFIED: 'NOT_SPECIFIED'
};

// Betting structure
const BettingStructure = {
  NO_LIMIT: 'NO_LIMIT',
  POT_LIMIT: 'POT_LIMIT',
  FIXED_LIMIT: 'FIXED_LIMIT',
  SPREAD_LIMIT: 'SPREAD_LIMIT',
  CAP_LIMIT: 'CAP_LIMIT',
  MIXED_LIMIT: 'MIXED_LIMIT'
};

// Speed of play
const SpeedType = {
  SLOW: 'SLOW',
  REGULAR: 'REGULAR',
  TURBO: 'TURBO',
  HYPER: 'HYPER',
  SUPER_TURBO: 'SUPER_TURBO'
};

// Table size
const TableSize = {
  HEADS_UP: 'HEADS_UP',
  SHORT_HANDED: 'SHORT_HANDED',
  FULL_RING: 'FULL_RING'
};

// Deal type
const DealType = {
  LIVE_DEALER: 'LIVE_DEALER',
  AUTO_SHUFFLER: 'AUTO_SHUFFLER',
  ELECTRONIC: 'ELECTRONIC',
  SELF_DEALT: 'SELF_DEALT'
};

// Buy-in tier
const BuyInTier = {
  FREEROLL: 'FREEROLL',
  MICRO: 'MICRO',
  LOW: 'LOW',
  MID: 'MID',
  HIGH: 'HIGH',
  SUPER_HIGH: 'SUPER_HIGH',
  ULTRA_HIGH: 'ULTRA_HIGH'
};

// Tournament structure
const TournamentStructure = {
  FREEZEOUT: 'FREEZEOUT',
  SINGLE_REBUY: 'SINGLE_REBUY',
  UNLIMITED_REBUY: 'UNLIMITED_REBUY',
  RE_ENTRY: 'RE_ENTRY',
  UNLIMITED_RE_ENTRY: 'UNLIMITED_RE_ENTRY',
  ADD_ON_ONLY: 'ADD_ON_ONLY',
  REBUY_ADDON: 'REBUY_ADDON'
};

// Bounty type
const BountyType = {
  NONE: 'NONE',
  STANDARD: 'STANDARD',
  PROGRESSIVE: 'PROGRESSIVE',
  MYSTERY: 'MYSTERY',
  SUPER_KNOCKOUT: 'SUPER_KNOCKOUT',
  TOTAL_KNOCKOUT: 'TOTAL_KNOCKOUT'
};

// Tournament purpose
const TournamentPurpose = {
  STANDARD: 'STANDARD',
  SATELLITE: 'SATELLITE',
  MEGA_SATELLITE: 'MEGA_SATELLITE',
  SUPER_SATELLITE: 'SUPER_SATELLITE',
  QUALIFIER: 'QUALIFIER',
  STEP_SATELLITE: 'STEP_SATELLITE',
  FREEROLL: 'FREEROLL',
  CHARITY: 'CHARITY',
  LEAGUE_POINTS: 'LEAGUE_POINTS',
  LAST_LONGER: 'LAST_LONGER',
  PROMOTIONAL: 'PROMOTIONAL'
};

// Stack depth
const StackDepth = {
  SHALLOW: 'SHALLOW',
  STANDARD: 'STANDARD',
  DEEP: 'DEEP',
  MEGA: 'MEGA',
  SUPER: 'SUPER'
};

// Late registration
const LateRegistration = {
  NONE: 'NONE',
  STANDARD: 'STANDARD',
  EXTENDED: 'EXTENDED',
  UNLIMITED: 'UNLIMITED'
};

// Payout structure
const PayoutStructure = {
  STANDARD: 'STANDARD',
  FLAT: 'FLAT',
  WINNER_TAKE_ALL: 'WINNER_TAKE_ALL',
  FIFTY_FIFTY: 'FIFTY_FIFTY',
  TOP_HEAVY: 'TOP_HEAVY',
  SATELLITE_TICKETS: 'SATELLITE_TICKETS',
  MILESTONE: 'MILESTONE',
  PROGRESSIVE: 'PROGRESSIVE'
};

// Tournament schedule type
const TournamentScheduleType = {
  ONE_OFF: 'ONE_OFF',
  RECURRING: 'RECURRING',
  SERIES_EVENT: 'SERIES_EVENT',
  SPECIAL_EVENT: 'SPECIAL_EVENT',
  FESTIVAL_EVENT: 'FESTIVAL_EVENT',
  AD_HOC: 'AD_HOC'
};

// Cash game type
const CashGameType = {
  STANDARD: 'STANDARD',
  CAPPED: 'CAPPED',
  UNCAPPED: 'UNCAPPED',
  BOMB_POT: 'BOMB_POT',
  DOUBLE_BOARD: 'DOUBLE_BOARD',
  MANDATORY_STRADDLE: 'MANDATORY_STRADDLE',
  STRADDLE_OPTIONAL: 'STRADDLE_OPTIONAL',
  ANTE_GAME: 'ANTE_GAME',
  MUST_MOVE: 'MUST_MOVE',
  SHORT_DECK: 'SHORT_DECK'
};

// Rake structure
const RakeStructure = {
  NO_RAKE: 'NO_RAKE',
  POT_PERCENTAGE: 'POT_PERCENTAGE',
  POT_PERCENTAGE_CAPPED: 'POT_PERCENTAGE_CAPPED',
  TIME_RAKE: 'TIME_RAKE',
  JACKPOT_DROP: 'JACKPOT_DROP',
  PROMOTIONAL: 'PROMOTIONAL',
  SUBSCRIPTION: 'SUBSCRIPTION'
};

// Classification source
const ClassificationSource = {
  SCRAPED: 'SCRAPED',
  DERIVED: 'DERIVED',
  INFERRED: 'INFERRED',
  INHERITED: 'INHERITED',
  MANUAL: 'MANUAL',
  MIGRATED: 'MIGRATED'
};

// ===================================================================
// VARIANT MAPPING: Old GameVariant -> New (PokerVariant, BettingStructure)
// ===================================================================

const VARIANT_MAPPING = {
  NOT_PUBLISHED: { variant: PokerVariant.NOT_SPECIFIED, bettingStructure: null },
  NLHE: { variant: PokerVariant.HOLD_EM, bettingStructure: BettingStructure.NO_LIMIT },
  PLO: { variant: PokerVariant.OMAHA_HI, bettingStructure: BettingStructure.POT_LIMIT },
  PLOM: { variant: PokerVariant.OMAHA_HILO, bettingStructure: BettingStructure.POT_LIMIT },
  PL04: { variant: PokerVariant.OMAHA_HI, bettingStructure: BettingStructure.POT_LIMIT },
  PLOM4: { variant: PokerVariant.OMAHA_HILO, bettingStructure: BettingStructure.POT_LIMIT },
  PLO5: { variant: PokerVariant.OMAHA5_HI, bettingStructure: BettingStructure.POT_LIMIT },
  PLOM5: { variant: PokerVariant.OMAHA5_HILO, bettingStructure: BettingStructure.POT_LIMIT },
  PLO6: { variant: PokerVariant.OMAHA6_HI, bettingStructure: BettingStructure.POT_LIMIT },
  PLOM6: { variant: PokerVariant.OMAHA6_HILO, bettingStructure: BettingStructure.POT_LIMIT },
  PLMIXED: { variant: PokerVariant.MIXED_ROTATION, bettingStructure: BettingStructure.POT_LIMIT },
  PLDC: { variant: PokerVariant.MIXED_DEALERS_CHOICE, bettingStructure: BettingStructure.POT_LIMIT },
  NLDC: { variant: PokerVariant.MIXED_DEALERS_CHOICE, bettingStructure: BettingStructure.NO_LIMIT }
};

/**
 * Get new classification from old GameVariant
 * @param {string} gameVariant - Old GameVariant value
 * @returns {{ variant: string, bettingStructure: string|null }}
 */
const getNewVariantFromOld = (gameVariant) => {
  return VARIANT_MAPPING[gameVariant] || { variant: PokerVariant.OTHER, bettingStructure: null };
};

/**
 * Get old GameVariant from new classification (best match)
 * @param {string} variant - New PokerVariant value
 * @param {string} bettingStructure - New BettingStructure value
 * @returns {string} Old GameVariant value
 */
const getOldVariantFromNew = (variant, bettingStructure) => {
  // Direct matches
  if (variant === PokerVariant.HOLD_EM && bettingStructure === BettingStructure.NO_LIMIT) return GameVariant.NLHE;
  if (variant === PokerVariant.HOLD_EM_SHORT_DECK && bettingStructure === BettingStructure.NO_LIMIT) return GameVariant.NLHE;
  if (variant === PokerVariant.OMAHA_HI && bettingStructure === BettingStructure.POT_LIMIT) return GameVariant.PLO;
  if (variant === PokerVariant.OMAHA_HILO && bettingStructure === BettingStructure.POT_LIMIT) return GameVariant.PLOM;
  if (variant === PokerVariant.OMAHA5_HI && bettingStructure === BettingStructure.POT_LIMIT) return GameVariant.PLO5;
  if (variant === PokerVariant.OMAHA5_HILO && bettingStructure === BettingStructure.POT_LIMIT) return GameVariant.PLOM5;
  if (variant === PokerVariant.OMAHA6_HI && bettingStructure === BettingStructure.POT_LIMIT) return GameVariant.PLO6;
  if (variant === PokerVariant.OMAHA6_HILO && bettingStructure === BettingStructure.POT_LIMIT) return GameVariant.PLOM6;
  if (variant === PokerVariant.MIXED_DEALERS_CHOICE && bettingStructure === BettingStructure.POT_LIMIT) return GameVariant.PLDC;
  if (variant === PokerVariant.MIXED_DEALERS_CHOICE && bettingStructure === BettingStructure.NO_LIMIT) return GameVariant.NLDC;
  
  // Mixed games default to PLMIXED
  if (variant && variant.startsWith('MIXED_')) return GameVariant.PLMIXED;
  
  // Default fallback
  return GameVariant.NOT_PUBLISHED;
};

// ===================================================================
// ASSIGNMENT STATUS ENUMS (Existing - unchanged)
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
  // Legacy fields (keep for backward compat)
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
  recurringGameAssignmentStatus: RecurringGameAssignmentStatus.PENDING_ASSIGNMENT,
  
  // New classification defaults
  // NOTE: entryStructure (not tournamentStructure) to avoid @model conflict
  // NOTE: cashRakeType (not rakeStructure) to avoid @model conflict
  sessionMode: SessionMode.TOURNAMENT,
  variant: PokerVariant.HOLD_EM,
  bettingStructure: BettingStructure.NO_LIMIT,
  speedType: SpeedType.REGULAR,
  tableSize: TableSize.FULL_RING,
  buyInTier: BuyInTier.LOW,
  entryStructure: TournamentStructure.FREEZEOUT,
  bountyType: BountyType.NONE,
  tournamentPurpose: TournamentPurpose.STANDARD,
  stackDepth: StackDepth.STANDARD,
  scheduleType: TournamentScheduleType.RECURRING,
  cashGameType: CashGameType.STANDARD,
  cashRakeType: RakeStructure.POT_PERCENTAGE_CAPPED
};

// ===================================================================
// BUY-IN TIER THRESHOLDS
// ===================================================================

const BUY_IN_TIER_THRESHOLDS = {
  FREEROLL_MAX: 0,
  MICRO_MAX: 30,
  LOW_MAX: 100,
  MID_MAX: 300,
  HIGH_MAX: 1000,
  SUPER_HIGH_MAX: 5000
  // Above SUPER_HIGH_MAX = ULTRA_HIGH
};

/**
 * Derive buy-in tier from amount
 * @param {number} buyIn - Buy-in amount
 * @returns {string} BuyInTier value
 */
const deriveBuyInTier = (buyIn) => {
  const amount = buyIn || 0;
  if (amount <= BUY_IN_TIER_THRESHOLDS.FREEROLL_MAX) return BuyInTier.FREEROLL;
  if (amount <= BUY_IN_TIER_THRESHOLDS.MICRO_MAX) return BuyInTier.MICRO;
  if (amount <= BUY_IN_TIER_THRESHOLDS.LOW_MAX) return BuyInTier.LOW;
  if (amount <= BUY_IN_TIER_THRESHOLDS.MID_MAX) return BuyInTier.MID;
  if (amount <= BUY_IN_TIER_THRESHOLDS.HIGH_MAX) return BuyInTier.HIGH;
  if (amount <= BUY_IN_TIER_THRESHOLDS.SUPER_HIGH_MAX) return BuyInTier.SUPER_HIGH;
  return BuyInTier.ULTRA_HIGH;
};

// ===================================================================
// QUERY KEY CONSTANTS (Existing - unchanged)
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
// SERIES DETECTION CONSTANTS (Existing - unchanged)
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
// VALIDATION THRESHOLDS (Existing - unchanged)
// ===================================================================

const VALIDATION_THRESHOLDS = {
  MIN_BUY_IN: 0,
  MAX_BUY_IN: 100000,
  MIN_RAKE: 0,
  MAX_RAKE_PERCENTAGE: 0.5,
  MIN_GUARANTEE: 0,
  MAX_GUARANTEE: 10000000,
  MIN_ENTRIES: 0,
  MAX_ENTRIES: 10000,
  SERIES_NAME_SIMILARITY_THRESHOLD: 70,
  RECURRING_MATCH_THRESHOLD: 75
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  // Legacy enums (keep for backward compat)
  GameStatus,
  RegistrationStatus,
  GameType,
  GameVariant,
  TournamentType,
  GameFrequency,
  
  // New classification enums
  SessionMode,
  PokerVariant,
  BettingStructure,
  SpeedType,
  TableSize,
  DealType,
  BuyInTier,
  TournamentStructure,
  BountyType,
  TournamentPurpose,
  StackDepth,
  LateRegistration,
  PayoutStructure,
  TournamentScheduleType,
  CashGameType,
  RakeStructure,
  ClassificationSource,
  
  // Assignment status enums
  VenueAssignmentStatus,
  SeriesAssignmentStatus,
  RecurringGameAssignmentStatus,
  SeriesResolutionStatus,
  RecurringResolutionStatus,
  
  // Mapping utilities
  VARIANT_MAPPING,
  getNewVariantFromOld,
  getOldVariantFromNew,
  
  // Buy-in tier utilities
  BUY_IN_TIER_THRESHOLDS,
  deriveBuyInTier,
  
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