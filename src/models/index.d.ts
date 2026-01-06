import { ModelInit, MutableModel, __modelMeta__, ManagedIdentifier } from "@aws-amplify/datastore";
// @ts-ignore
import { LazyLoading, LazyLoadingDisabled, AsyncCollection, AsyncItem } from "@aws-amplify/datastore";

export enum DataSource {
  SCRAPE = "SCRAPE",
  API = "API",
  MANUAL = "MANUAL"
}

export enum AssetCondition {
  NEW = "NEW",
  GOOD = "GOOD",
  FAIR = "FAIR",
  POOR = "POOR",
  RETIRED = "RETIRED"
}

export enum VenueStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  PENDING = "PENDING"
}

export enum GameType {
  TOURNAMENT = "TOURNAMENT",
  CASH_GAME = "CASH_GAME"
}

export enum GameStatus {
  INITIATING = "INITIATING",
  SCHEDULED = "SCHEDULED",
  REGISTERING = "REGISTERING",
  RUNNING = "RUNNING",
  CANCELLED = "CANCELLED",
  FINISHED = "FINISHED",
  NOT_IN_USE = "NOT_IN_USE",
  NOT_PUBLISHED = "NOT_PUBLISHED",
  CLOCK_STOPPED = "CLOCK_STOPPED",
  UNKNOWN = "UNKNOWN"
}

export enum GameVariant {
  NOT_PUBLISHED = "NOT_PUBLISHED",
  NLHE = "NLHE",
  PLO = "PLO",
  PLOM = "PLOM",
  PL04 = "PL04",
  PLOM4 = "PLOM4",
  PLOM5 = "PLOM5",
  PLO5 = "PLO5",
  PLO6 = "PLO6",
  PLOM6 = "PLOM6",
  PLMIXED = "PLMIXED",
  PLDC = "PLDC",
  NLDC = "NLDC"
}

export enum GameFrequency {
  DAILY = "DAILY",
  WEEKLY = "WEEKLY",
  FORTNIGHTLY = "FORTNIGHTLY",
  MONTHLY = "MONTHLY",
  QUARTERLY = "QUARTERLY",
  YEARLY = "YEARLY",
  UNKNOWN = "UNKNOWN"
}

export enum RegistrationStatus {
  SCHEDULED = "SCHEDULED",
  OPEN = "OPEN",
  FINAL = "FINAL",
  CLOSED = "CLOSED",
  N_A = "N_A"
}

export enum TournamentType {
  FREEZEOUT = "FREEZEOUT",
  REENTRY = "REENTRY",
  RE_ENTRY = "RE_ENTRY",
  REBUY = "REBUY",
  BOUNTY = "BOUNTY",
  KNOCKOUT = "KNOCKOUT",
  SATELLITE = "SATELLITE",
  TURBO = "TURBO",
  HYPERTURBO = "HYPERTURBO",
  DEEPSTACK = "DEEPSTACK"
}

export enum PaymentSourceType {
  CASH = "CASH",
  SQUARE = "SQUARE",
  CREDIT_CARD = "CREDIT_CARD",
  INTERNAL_CREDIT = "INTERNAL_CREDIT",
  UNKNOWN = "UNKNOWN"
}

export enum PlayerAccountStatus {
  ACTIVE = "ACTIVE",
  SUSPENDED = "SUSPENDED",
  PENDING_VERIFICATION = "PENDING_VERIFICATION"
}

export enum PlayerAccountCategory {
  NEW = "NEW",
  RECREATIONAL = "RECREATIONAL",
  REGULAR = "REGULAR",
  VIP = "VIP",
  LAPSED = "LAPSED"
}

export enum SeriesStatus {
  LIVE = "LIVE",
  SCHEDULED = "SCHEDULED",
  COMPLETED = "COMPLETED"
}

export enum PlayerTargetingClassification {
  NOT_PLAYED = "NotPlayed",
  ACTIVE_EL = "Active_EL",
  ACTIVE = "Active",
  RETAIN_INACTIVE31_60D = "Retain_Inactive31_60d",
  RETAIN_INACTIVE61_90D = "Retain_Inactive61_90d",
  CHURNED_91_120D = "Churned_91_120d",
  CHURNED_121_180D = "Churned_121_180d",
  CHURNED_181_360D = "Churned_181_360d",
  CHURNED_361D = "Churned_361d"
}

export enum PlayerVenueTargetingClassification {
  ACTIVE_EL = "Active_EL",
  ACTIVE = "Active",
  RETAIN_INACTIVE31_60D = "Retain_Inactive31_60d",
  RETAIN_INACTIVE61_90D = "Retain_Inactive61_90d",
  CHURNED_91_120D = "Churned_91_120d",
  CHURNED_121_180D = "Churned_121_180d",
  CHURNED_181_360D = "Churned_181_360d",
  CHURNED_361D = "Churned_361d"
}

export enum TransactionType {
  BUY_IN = "BUY_IN",
  DEPOSIT = "DEPOSIT",
  TICKET_AWARD = "TICKET_AWARD",
  TICKET_REDEMPTION = "TICKET_REDEMPTION",
  CASH_AWARD = "CASH_AWARD",
  QUALIFICATION = "QUALIFICATION",
  WITHDRAWAL = "WITHDRAWAL"
}

export enum MessageStatus {
  SENT = "SENT",
  DELIVERED = "DELIVERED",
  FAILED = "FAILED",
  READ = "READ"
}

export enum UserRole {
  SUPER_ADMIN = "SUPER_ADMIN",
  ADMIN = "ADMIN",
  VENUE_MANAGER = "VENUE_MANAGER",
  TOURNAMENT_DIRECTOR = "TOURNAMENT_DIRECTOR",
  MARKETING = "MARKETING"
}

export enum StaffRole {
  DEALER = "DEALER",
  FLOOR_MANAGER = "FLOOR_MANAGER",
  SERVICE = "SERVICE",
  TOURNAMENT_DIRECTOR = "TOURNAMENT_DIRECTOR"
}

export enum TicketStatus {
  ACTIVE = "ACTIVE",
  EXPIRED = "EXPIRED",
  USED = "USED"
}

export enum PlayerEntryStatus {
  REGISTERED = "REGISTERED",
  VOIDED = "VOIDED",
  PLAYING = "PLAYING",
  ELIMINATED = "ELIMINATED",
  COMPLETED = "COMPLETED"
}

export enum CreditTransactionType {
  AWARD_PROMOTION = "AWARD_PROMOTION",
  AWARD_REFUND = "AWARD_REFUND",
  AWARD_MANUAL = "AWARD_MANUAL",
  REDEEM_GAME_BUY_IN = "REDEEM_GAME_BUY_IN",
  EXPIRED = "EXPIRED"
}

export enum PointsTransactionType {
  EARN_FROM_PLAY = "EARN_FROM_PLAY",
  EARN_FROM_PROMOTION = "EARN_FROM_PROMOTION",
  REDEEM_FOR_BUY_IN = "REDEEM_FOR_BUY_IN",
  REDEEM_FOR_MERCH = "REDEEM_FOR_MERCH",
  ADJUSTMENT_MANUAL = "ADJUSTMENT_MANUAL",
  EXPIRED = "EXPIRED"
}

export enum SeriesCategory {
  REGULAR = "REGULAR",
  SPECIAL = "SPECIAL",
  PROMOTIONAL = "PROMOTIONAL",
  CHAMPIONSHIP = "CHAMPIONSHIP",
  SEASONAL = "SEASONAL"
}

export enum HolidayType {
  NEW_YEAR = "NEW_YEAR",
  AUSTRALIA_DAY = "AUSTRALIA_DAY",
  EASTER = "EASTER",
  ANZAC_DAY = "ANZAC_DAY",
  QUEENS_BIRTHDAY = "QUEENS_BIRTHDAY",
  CHRISTMAS = "CHRISTMAS",
  BOXING_DAY = "BOXING_DAY",
  MELBOURNE_CUP = "MELBOURNE_CUP",
  LABOUR_DAY = "LABOUR_DAY",
  OTHER = "OTHER"
}

export enum VenueAssignmentStatus {
  AUTO_ASSIGNED = "AUTO_ASSIGNED",
  MANUALLY_ASSIGNED = "MANUALLY_ASSIGNED",
  PENDING_ASSIGNMENT = "PENDING_ASSIGNMENT",
  UNASSIGNED = "UNASSIGNED",
  RETROACTIVE_ASSIGNED = "RETROACTIVE_ASSIGNED"
}

export enum SeriesAssignmentStatus {
  AUTO_ASSIGNED = "AUTO_ASSIGNED",
  MANUALLY_ASSIGNED = "MANUALLY_ASSIGNED",
  PENDING_ASSIGNMENT = "PENDING_ASSIGNMENT",
  UNASSIGNED = "UNASSIGNED",
  NOT_SERIES = "NOT_SERIES"
}

export enum RecurringGameAssignmentStatus {
  AUTO_ASSIGNED = "AUTO_ASSIGNED",
  MANUALLY_ASSIGNED = "MANUALLY_ASSIGNED",
  PENDING_ASSIGNMENT = "PENDING_ASSIGNMENT",
  NOT_RECURRING = "NOT_RECURRING",
  DEVIATION_FLAGGED = "DEVIATION_FLAGGED"
}

export enum CostItemType {
  DEALER = "DEALER",
  TOURNAMENT_DIRECTOR = "TOURNAMENT_DIRECTOR",
  FLOOR_STAFF = "FLOOR_STAFF",
  SECURITY = "SECURITY",
  PRIZE_CONTRIBUTION = "PRIZE_CONTRIBUTION",
  JACKPOT_CONTRIBUTION = "JACKPOT_CONTRIBUTION",
  GUARANTEE_OVERLAY = "GUARANTEE_OVERLAY",
  ADDED_VALUE = "ADDED_VALUE",
  BOUNTY = "BOUNTY",
  VENUE_RENTAL = "VENUE_RENTAL",
  EQUIPMENT_RENTAL = "EQUIPMENT_RENTAL",
  FOOD_BEVERAGE = "FOOD_BEVERAGE",
  MARKETING = "MARKETING",
  STREAMING = "STREAMING",
  INSURANCE = "INSURANCE",
  LICENSING = "LICENSING",
  STAFF_TRAVEL = "STAFF_TRAVEL",
  PLAYER_ACCOMMODATION = "PLAYER_ACCOMMODATION",
  PROMOTION = "PROMOTION",
  OTHER = "OTHER"
}

export enum CostItemRateType {
  STANDARD = "STANDARD",
  OVERTIME = "OVERTIME",
  DOUBLE_TIME = "DOUBLE_TIME",
  PENALTY = "PENALTY",
  HOLIDAY = "HOLIDAY",
  SPECIAL = "SPECIAL",
  FLAT = "FLAT"
}

export enum CostStatus {
  PENDING = "PENDING",
  PARTIAL = "PARTIAL",
  COMPLETE = "COMPLETE",
  ESTIMATED = "ESTIMATED"
}

export enum SnapshotType {
  AUTO = "AUTO",
  MANUAL = "MANUAL",
  RECONCILED = "RECONCILED"
}

export enum EntryType {
  INITIAL = "INITIAL",
  REENTRY = "REENTRY",
  DIRECT_BUYIN = "DIRECT_BUYIN",
  QUALIFIED_CONTINUATION = "QUALIFIED_CONTINUATION",
  AGGREGATE_LISTING = "AGGREGATE_LISTING"
}

export enum ScraperJobTriggerSource {
  SCHEDULED = "SCHEDULED",
  MANUAL = "MANUAL",
  API = "API",
  CONTROL = "CONTROL",
  BULK = "BULK",
  ADMIN = "ADMIN"
}

export enum ScraperJobStatus {
  QUEUED = "QUEUED",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
  TIMEOUT = "TIMEOUT",
  STOPPED_TIMEOUT = "STOPPED_TIMEOUT",
  STOPPED_BLANKS = "STOPPED_BLANKS",
  STOPPED_NOT_FOUND = "STOPPED_NOT_FOUND",
  STOPPED_ERROR = "STOPPED_ERROR",
  STOPPED_MANUAL = "STOPPED_MANUAL",
  STOPPED_NO_VENUE = "STOPPED_NO_VENUE",
  STOPPED_MAX_ID = "STOPPED_MAX_ID"
}

export enum ScrapeUrlStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  DO_NOT_SCRAPE = "DO_NOT_SCRAPE",
  ERROR = "ERROR",
  ARCHIVED = "ARCHIVED"
}

export enum ScrapeAttemptStatus {
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
  ERROR = "ERROR",
  SKIPPED_DONOTSCRAPE = "SKIPPED_DONOTSCRAPE",
  SKIPPED_VENUE = "SKIPPED_VENUE",
  BLANK = "BLANK",
  NO_CHANGES = "NO_CHANGES",
  UPDATED = "UPDATED",
  SAVED = "SAVED",
  SUCCESS_EDITED = "SUCCESS_EDITED",
  SAVED_EDITED = "SAVED_EDITED",
  UPDATED_EDITED = "UPDATED_EDITED",
  NOT_FOUND = "NOT_FOUND",
  NOT_IN_USE = "NOT_IN_USE",
  NOT_PUBLISHED = "NOT_PUBLISHED"
}

export enum TimeRange {
  LAST_HOUR = "LAST_HOUR",
  LAST_24_HOURS = "LAST_24_HOURS",
  LAST_7_DAYS = "LAST_7_DAYS",
  LAST_30_DAYS = "LAST_30_DAYS",
  CUSTOM = "CUSTOM"
}

export enum ScraperOperation {
  START = "START",
  STOP = "STOP",
  ENABLE = "ENABLE",
  DISABLE = "DISABLE",
  STATUS = "STATUS",
  RESET = "RESET"
}

export enum ScraperJobMode {
  SINGLE = "single",
  BULK = "bulk",
  RANGE = "range",
  GAPS = "gaps",
  AUTO = "auto",
  REFRESH = "refresh",
  MULTI_ID = "multiId"
}

export enum SocialPlatform {
  FACEBOOK = "FACEBOOK",
  INSTAGRAM = "INSTAGRAM",
  TWITTER = "TWITTER",
  LINKEDIN = "LINKEDIN"
}

export enum SocialAccountStatus {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  PENDING_VERIFICATION = "PENDING_VERIFICATION",
  ERROR = "ERROR",
  RATE_LIMITED = "RATE_LIMITED"
}

export enum SocialPostType {
  TEXT = "TEXT",
  IMAGE = "IMAGE",
  VIDEO = "VIDEO",
  LINK = "LINK",
  EVENT = "EVENT",
  ALBUM = "ALBUM",
  LIVE = "LIVE"
}

export enum SocialScrapeStatus {
  RUNNING = "RUNNING",
  SUCCESS = "SUCCESS",
  FAILED = "FAILED",
  SKIPPED = "SKIPPED",
  RATE_LIMITED = "RATE_LIMITED",
  TIMEOUT = "TIMEOUT",
  NO_NEW_CONTENT = "NO_NEW_CONTENT",
  CANCELLED = "CANCELLED",
  ERROR_STOPPED = "ERROR_STOPPED"
}

export enum SocialPostStatus {
  ACTIVE = "ACTIVE",
  HIDDEN = "HIDDEN",
  ARCHIVED = "ARCHIVED",
  DELETED = "DELETED"
}

export enum ScheduledPostStatus {
  SCHEDULED = "SCHEDULED",
  PUBLISHED = "PUBLISHED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED"
}

export enum SyncEventStatus {
  STARTED = "STARTED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  RATE_LIMITED = "RATE_LIMITED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
  ERROR_STOPPED = "ERROR_STOPPED"
}

export enum SocialPostContentType {
  RESULT = "RESULT",
  PROMOTIONAL = "PROMOTIONAL",
  GENERAL = "GENERAL",
  COMMENT = "COMMENT"
}

export enum SocialPostProcessingStatus {
  PENDING = "PENDING",
  PROCESSING = "PROCESSING",
  EXTRACTED = "EXTRACTED",
  MATCHED = "MATCHED",
  LINKED = "LINKED",
  FAILED = "FAILED",
  SKIPPED = "SKIPPED",
  MANUAL_REVIEW = "MANUAL_REVIEW",
  PREVIEW = "PREVIEW"
}

export enum SocialPostLinkType {
  AUTO_MATCHED = "AUTO_MATCHED",
  MANUAL_LINKED = "MANUAL_LINKED",
  VERIFIED = "VERIFIED",
  REJECTED = "REJECTED",
  TOURNAMENT_ID = "TOURNAMENT_ID"
}

export enum NonCashPrizeType {
  ACCUMULATOR_TICKET = "ACCUMULATOR_TICKET",
  SATELLITE_TICKET = "SATELLITE_TICKET",
  BOUNTY_TICKET = "BOUNTY_TICKET",
  TOURNAMENT_ENTRY = "TOURNAMENT_ENTRY",
  SERIES_TICKET = "SERIES_TICKET",
  MAIN_EVENT_SEAT = "MAIN_EVENT_SEAT",
  VALUED_SEAT = "VALUED_SEAT",
  TRAVEL_PACKAGE = "TRAVEL_PACKAGE",
  ACCOMMODATION_PACKAGE = "ACCOMMODATION_PACKAGE",
  VOUCHER = "VOUCHER",
  FOOD_CREDIT = "FOOD_CREDIT",
  CASINO_CREDIT = "CASINO_CREDIT",
  MERCHANDISE = "MERCHANDISE",
  POINTS = "POINTS",
  OTHER = "OTHER"
}

export enum TicketAwardSource {
  SOCIAL_POST_RESULT = "SOCIAL_POST_RESULT",
  SOCIAL_POST_PROMO = "SOCIAL_POST_PROMO",
  SCRAPED_DATA = "SCRAPED_DATA",
  MANUAL_ENTRY = "MANUAL_ENTRY",
  RECURRING_GAME_DEFAULT = "RECURRING_GAME_DEFAULT"
}

export enum BackgroundTaskType {
  VENUE_REASSIGNMENT = "VENUE_REASSIGNMENT",
  BULK_VENUE_REASSIGNMENT = "BULK_VENUE_REASSIGNMENT",
  ENTITY_REASSIGNMENT = "ENTITY_REASSIGNMENT",
  VENUE_CLONE = "VENUE_CLONE",
  BULK_IMPORT = "BULK_IMPORT",
  DATA_MIGRATION = "DATA_MIGRATION",
  REPORT_GENERATION = "REPORT_GENERATION",
  VENUE_DETAILS_RECALC = "VENUE_DETAILS_RECALC",
  RECURRING_GAME_DETECTION = "RECURRING_GAME_DETECTION",
  METRICS_CALCULATION = "METRICS_CALCULATION"
}

export enum BackgroundTaskStatus {
  QUEUED = "QUEUED",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  CANCELLED = "CANCELLED",
  PARTIAL_SUCCESS = "PARTIAL_SUCCESS"
}

export enum SeriesResolutionStatus {
  MATCHED_EXISTING = "MATCHED_EXISTING",
  CREATED_NEW = "CREATED_NEW",
  NOT_SERIES = "NOT_SERIES",
  SKIPPED = "SKIPPED",
  PENDING_REVIEW = "PENDING_REVIEW",
  FAILED = "FAILED"
}

export enum RecurringResolutionStatus {
  MATCHED_EXISTING = "MATCHED_EXISTING",
  CREATED_NEW = "CREATED_NEW",
  NOT_RECURRING = "NOT_RECURRING",
  SKIPPED = "SKIPPED",
  PENDING_REVIEW = "PENDING_REVIEW",
  FAILED = "FAILED"
}

export enum SessionMode {
  CASH = "CASH",
  TOURNAMENT = "TOURNAMENT"
}

export enum PokerVariant {
  HOLD_EM = "HOLD_EM",
  HOLD_EM_SHORT_DECK = "HOLD_EM_SHORT_DECK",
  OMAHA_HI = "OMAHA_HI",
  OMAHA_HILO = "OMAHA_HILO",
  OMAHA5_HI = "OMAHA5_HI",
  OMAHA5_HILO = "OMAHA5_HILO",
  OMAHA6_HI = "OMAHA6_HI",
  OMAHA6_HILO = "OMAHA6_HILO",
  STUD_HI = "STUD_HI",
  STUD_HILO = "STUD_HILO",
  RAZZ = "RAZZ",
  DRAW_2_7_TRIPLE = "DRAW_2_7_TRIPLE",
  DRAW_2_7_SINGLE = "DRAW_2_7_SINGLE",
  DRAW_5_CARD = "DRAW_5_CARD",
  BADUGI = "BADUGI",
  MIXED_HORSE = "MIXED_HORSE",
  MIXED_8_GAME = "MIXED_8GAME",
  MIXED_HOSE = "MIXED_HOSE",
  MIXED_RASH = "MIXED_RASH",
  MIXED_DEALERS_CHOICE = "MIXED_DEALERS_CHOICE",
  MIXED_ROTATION = "MIXED_ROTATION",
  MIXED_OTHER = "MIXED_OTHER",
  COURCHEVEL = "COURCHEVEL",
  IRISH = "IRISH",
  PINEAPPLE = "PINEAPPLE",
  CRAZY_PINEAPPLE = "CRAZY_PINEAPPLE",
  OTHER = "OTHER",
  NOT_SPECIFIED = "NOT_SPECIFIED"
}

export enum BettingStructure {
  NO_LIMIT = "NO_LIMIT",
  POT_LIMIT = "POT_LIMIT",
  FIXED_LIMIT = "FIXED_LIMIT",
  SPREAD_LIMIT = "SPREAD_LIMIT",
  CAP_LIMIT = "CAP_LIMIT",
  MIXED_LIMIT = "MIXED_LIMIT"
}

export enum SpeedType {
  SLOW = "SLOW",
  REGULAR = "REGULAR",
  TURBO = "TURBO",
  HYPER = "HYPER",
  SUPER_TURBO = "SUPER_TURBO"
}

export enum TableSize {
  HEADS_UP = "HEADS_UP",
  SHORT_HANDED = "SHORT_HANDED",
  FULL_RING = "FULL_RING"
}

export enum DealType {
  LIVE_DEALER = "LIVE_DEALER",
  AUTO_SHUFFLER = "AUTO_SHUFFLER",
  ELECTRONIC = "ELECTRONIC",
  SELF_DEALT = "SELF_DEALT"
}

export enum BuyInTier {
  FREEROLL = "FREEROLL",
  MICRO = "MICRO",
  LOW = "LOW",
  MID = "MID",
  HIGH = "HIGH",
  SUPER_HIGH = "SUPER_HIGH",
  ULTRA_HIGH = "ULTRA_HIGH"
}

export enum EntryStructure {
  FREEZEOUT = "FREEZEOUT",
  SINGLE_REBUY = "SINGLE_REBUY",
  UNLIMITED_REBUY = "UNLIMITED_REBUY",
  RE_ENTRY = "RE_ENTRY",
  UNLIMITED_RE_ENTRY = "UNLIMITED_RE_ENTRY",
  ADD_ON_ONLY = "ADD_ON_ONLY",
  REBUY_ADDON = "REBUY_ADDON"
}

export enum BountyType {
  NONE = "NONE",
  STANDARD = "STANDARD",
  PROGRESSIVE = "PROGRESSIVE",
  MYSTERY = "MYSTERY",
  SUPER_KNOCKOUT = "SUPER_KNOCKOUT",
  TOTAL_KNOCKOUT = "TOTAL_KNOCKOUT"
}

export enum TournamentPurpose {
  STANDARD = "STANDARD",
  SATELLITE = "SATELLITE",
  MEGA_SATELLITE = "MEGA_SATELLITE",
  SUPER_SATELLITE = "SUPER_SATELLITE",
  QUALIFIER = "QUALIFIER",
  STEP_SATELLITE = "STEP_SATELLITE",
  FREEROLL = "FREEROLL",
  CHARITY = "CHARITY",
  LEAGUE_POINTS = "LEAGUE_POINTS",
  LAST_LONGER = "LAST_LONGER",
  PROMOTIONAL = "PROMOTIONAL"
}

export enum StackDepth {
  SHALLOW = "SHALLOW",
  STANDARD = "STANDARD",
  DEEP = "DEEP",
  MEGA = "MEGA",
  SUPER = "SUPER"
}

export enum LateRegistration {
  NONE = "NONE",
  STANDARD = "STANDARD",
  EXTENDED = "EXTENDED",
  UNLIMITED = "UNLIMITED"
}

export enum PayoutStructure {
  STANDARD = "STANDARD",
  FLAT = "FLAT",
  WINNER_TAKE_ALL = "WINNER_TAKE_ALL",
  FIFTY_FIFTY = "FIFTY_FIFTY",
  TOP_HEAVY = "TOP_HEAVY",
  SATELLITE_TICKETS = "SATELLITE_TICKETS",
  MILESTONE = "MILESTONE",
  PROGRESSIVE = "PROGRESSIVE"
}

export enum TournamentScheduleType {
  ONE_OFF = "ONE_OFF",
  RECURRING = "RECURRING",
  SERIES_EVENT = "SERIES_EVENT",
  SPECIAL_EVENT = "SPECIAL_EVENT",
  FESTIVAL_EVENT = "FESTIVAL_EVENT",
  AD_HOC = "AD_HOC"
}

export enum CashGameType {
  STANDARD = "STANDARD",
  CAPPED = "CAPPED",
  UNCAPPED = "UNCAPPED",
  BOMB_POT = "BOMB_POT",
  DOUBLE_BOARD = "DOUBLE_BOARD",
  MANDATORY_STRADDLE = "MANDATORY_STRADDLE",
  STRADDLE_OPTIONAL = "STRADDLE_OPTIONAL",
  ANTE_GAME = "ANTE_GAME",
  MUST_MOVE = "MUST_MOVE",
  SHORT_DECK = "SHORT_DECK"
}

export enum CashRakeType {
  NO_RAKE = "NO_RAKE",
  POT_PERCENTAGE = "POT_PERCENTAGE",
  POT_PERCENTAGE_CAPPED = "POT_PERCENTAGE_CAPPED",
  TIME_RAKE = "TIME_RAKE",
  JACKPOT_DROP = "JACKPOT_DROP",
  PROMOTIONAL = "PROMOTIONAL",
  SUBSCRIPTION = "SUBSCRIPTION"
}

export enum MixedGameComponent {
  NLHE = "NLHE",
  LHE = "LHE",
  PLO = "PLO",
  PLO8 = "PLO8",
  LO8 = "LO8",
  STUD = "STUD",
  STUD8 = "STUD8",
  RAZZ = "RAZZ",
  TRIPLE_DRAW = "TRIPLE_DRAW",
  SINGLE_DRAW = "SINGLE_DRAW",
  BADUGI = "BADUGI",
  NL_DRAW = "NL_DRAW",
  COURCHEVEL = "COURCHEVEL",
  SHORT_DECK = "SHORT_DECK",
  BIG_O = "BIG_O",
  OTHER = "OTHER"
}

export enum ClassificationSource {
  SCRAPED = "SCRAPED",
  DERIVED = "DERIVED",
  INFERRED = "INFERRED",
  INHERITED = "INHERITED",
  MANUAL = "MANUAL",
  MIGRATED = "MIGRATED"
}

export enum GameProcessedAction {
  CREATED = "CREATED",
  UPDATED = "UPDATED",
  SKIPPED = "SKIPPED",
  ERROR = "ERROR",
  NOT_FOUND = "NOT_FOUND",
  NOT_PUBLISHED = "NOT_PUBLISHED"
}

type EagerVenueMetricsResult = {
  readonly success: boolean;
  readonly venuesProcessed?: number | null;
  readonly results?: (VenueMetricsUpdateResult | null)[] | null;
  readonly error?: string | null;
}

type LazyVenueMetricsResult = {
  readonly success: boolean;
  readonly venuesProcessed?: number | null;
  readonly results?: (VenueMetricsUpdateResult | null)[] | null;
  readonly error?: string | null;
}

export declare type VenueMetricsResult = LazyLoading extends LazyLoadingDisabled ? EagerVenueMetricsResult : LazyVenueMetricsResult

export declare const VenueMetricsResult: (new (init: ModelInit<VenueMetricsResult>) => VenueMetricsResult)

type EagerVenueMetricsUpdateResult = {
  readonly venueId: string;
  readonly detailsId?: string | null;
  readonly success: boolean;
  readonly error?: string | null;
}

type LazyVenueMetricsUpdateResult = {
  readonly venueId: string;
  readonly detailsId?: string | null;
  readonly success: boolean;
  readonly error?: string | null;
}

export declare type VenueMetricsUpdateResult = LazyLoading extends LazyLoadingDisabled ? EagerVenueMetricsUpdateResult : LazyVenueMetricsUpdateResult

export declare const VenueMetricsUpdateResult: (new (init: ModelInit<VenueMetricsUpdateResult>) => VenueMetricsUpdateResult)

type EagerVenueMetricsPreview = {
  readonly success: boolean;
  readonly venueId?: string | null;
  readonly currentMetrics?: VenueMetricsSnapshot | null;
  readonly calculatedMetrics?: VenueMetricsSnapshot | null;
  readonly wouldChange?: boolean | null;
  readonly error?: string | null;
}

type LazyVenueMetricsPreview = {
  readonly success: boolean;
  readonly venueId?: string | null;
  readonly currentMetrics?: VenueMetricsSnapshot | null;
  readonly calculatedMetrics?: VenueMetricsSnapshot | null;
  readonly wouldChange?: boolean | null;
  readonly error?: string | null;
}

export declare type VenueMetricsPreview = LazyLoading extends LazyLoadingDisabled ? EagerVenueMetricsPreview : LazyVenueMetricsPreview

export declare const VenueMetricsPreview: (new (init: ModelInit<VenueMetricsPreview>) => VenueMetricsPreview)

type EagerVenueMatch = {
  readonly autoAssignedVenue?: ScrapedVenueMatchDetails | null;
  readonly suggestions?: (ScrapedVenueMatchDetails | null)[] | null;
}

type LazyVenueMatch = {
  readonly autoAssignedVenue?: ScrapedVenueMatchDetails | null;
  readonly suggestions?: (ScrapedVenueMatchDetails | null)[] | null;
}

export declare type VenueMatch = LazyLoading extends LazyLoadingDisabled ? EagerVenueMatch : LazyVenueMatch

export declare const VenueMatch: (new (init: ModelInit<VenueMatch>) => VenueMatch)

type EagerAllCountsResult = {
  readonly playerCount?: number | null;
  readonly playerSummaryCount?: number | null;
  readonly playerEntryCount?: number | null;
  readonly playerResultCount?: number | null;
  readonly playerVenueCount?: number | null;
  readonly playerTransactionCount?: number | null;
  readonly playerCreditsCount?: number | null;
  readonly playerPointsCount?: number | null;
  readonly playerTicketCount?: number | null;
  readonly playerMarketingPreferencesCount?: number | null;
  readonly playerMarketingMessageCount?: number | null;
  readonly gameCount?: number | null;
  readonly tournamentStructureCount?: number | null;
}

type LazyAllCountsResult = {
  readonly playerCount?: number | null;
  readonly playerSummaryCount?: number | null;
  readonly playerEntryCount?: number | null;
  readonly playerResultCount?: number | null;
  readonly playerVenueCount?: number | null;
  readonly playerTransactionCount?: number | null;
  readonly playerCreditsCount?: number | null;
  readonly playerPointsCount?: number | null;
  readonly playerTicketCount?: number | null;
  readonly playerMarketingPreferencesCount?: number | null;
  readonly playerMarketingMessageCount?: number | null;
  readonly gameCount?: number | null;
  readonly tournamentStructureCount?: number | null;
}

export declare type AllCountsResult = LazyLoading extends LazyLoadingDisabled ? EagerAllCountsResult : LazyAllCountsResult

export declare const AllCountsResult: (new (init: ModelInit<AllCountsResult>) => AllCountsResult)

type EagerVenueAssignmentResult = {
  readonly success: boolean;
  readonly gameId: string;
  readonly venueId: string;
  readonly affectedRecords?: AffectedRecords | null;
  readonly error?: string | null;
}

type LazyVenueAssignmentResult = {
  readonly success: boolean;
  readonly gameId: string;
  readonly venueId: string;
  readonly affectedRecords?: AffectedRecords | null;
  readonly error?: string | null;
}

export declare type VenueAssignmentResult = LazyLoading extends LazyLoadingDisabled ? EagerVenueAssignmentResult : LazyVenueAssignmentResult

export declare const VenueAssignmentResult: (new (init: ModelInit<VenueAssignmentResult>) => VenueAssignmentResult)

type EagerAffectedRecords = {
  readonly gameUpdated?: boolean | null;
  readonly playerEntriesUpdated?: number | null;
  readonly playerVenueRecordsCreated?: number | null;
  readonly playersWithRegistrationUpdated?: number | null;
  readonly playerSummariesUpdated?: number | null;
}

type LazyAffectedRecords = {
  readonly gameUpdated?: boolean | null;
  readonly playerEntriesUpdated?: number | null;
  readonly playerVenueRecordsCreated?: number | null;
  readonly playersWithRegistrationUpdated?: number | null;
  readonly playerSummariesUpdated?: number | null;
}

export declare type AffectedRecords = LazyLoading extends LazyLoadingDisabled ? EagerAffectedRecords : LazyAffectedRecords

export declare const AffectedRecords: (new (init: ModelInit<AffectedRecords>) => AffectedRecords)

type EagerBatchVenueAssignmentResult = {
  readonly successful?: (VenueAssignmentResult | null)[] | null;
  readonly failed?: (VenueAssignmentResult | null)[] | null;
  readonly totalProcessed?: number | null;
}

type LazyBatchVenueAssignmentResult = {
  readonly successful?: (VenueAssignmentResult | null)[] | null;
  readonly failed?: (VenueAssignmentResult | null)[] | null;
  readonly totalProcessed?: number | null;
}

export declare type BatchVenueAssignmentResult = LazyLoading extends LazyLoadingDisabled ? EagerBatchVenueAssignmentResult : LazyBatchVenueAssignmentResult

export declare const BatchVenueAssignmentResult: (new (init: ModelInit<BatchVenueAssignmentResult>) => BatchVenueAssignmentResult)

type EagerSaveVenueAssignmentInfo = {
  readonly venueId?: string | null;
  readonly venueName?: string | null;
  readonly status?: VenueAssignmentStatus | keyof typeof VenueAssignmentStatus | null;
  readonly confidence?: number | null;
}

type LazySaveVenueAssignmentInfo = {
  readonly venueId?: string | null;
  readonly venueName?: string | null;
  readonly status?: VenueAssignmentStatus | keyof typeof VenueAssignmentStatus | null;
  readonly confidence?: number | null;
}

export declare type SaveVenueAssignmentInfo = LazyLoading extends LazyLoadingDisabled ? EagerSaveVenueAssignmentInfo : LazySaveVenueAssignmentInfo

export declare const SaveVenueAssignmentInfo: (new (init: ModelInit<SaveVenueAssignmentInfo>) => SaveVenueAssignmentInfo)

type EagerVenueMetricsSnapshot = {
  readonly totalGamesHeld?: number | null;
  readonly averageUniquePlayersPerGame?: number | null;
  readonly averageEntriesPerGame?: number | null;
  readonly gameNights?: (string | null)[] | null;
  readonly gamesIncluded?: number | null;
  readonly gamesExcluded?: number | null;
  readonly exclusionReasons?: string | null;
  readonly status?: VenueStatus | keyof typeof VenueStatus | null;
}

type LazyVenueMetricsSnapshot = {
  readonly totalGamesHeld?: number | null;
  readonly averageUniquePlayersPerGame?: number | null;
  readonly averageEntriesPerGame?: number | null;
  readonly gameNights?: (string | null)[] | null;
  readonly gamesIncluded?: number | null;
  readonly gamesExcluded?: number | null;
  readonly exclusionReasons?: string | null;
  readonly status?: VenueStatus | keyof typeof VenueStatus | null;
}

export declare type VenueMetricsSnapshot = LazyLoading extends LazyLoadingDisabled ? EagerVenueMetricsSnapshot : LazyVenueMetricsSnapshot

export declare const VenueMetricsSnapshot: (new (init: ModelInit<VenueMetricsSnapshot>) => VenueMetricsSnapshot)

type EagerConsolidationPreviewResult = {
  readonly willConsolidate: boolean;
  readonly reason: string;
  readonly consolidation?: ConsolidationDetails | null;
  readonly warnings?: string[] | null;
  readonly detectedPattern?: DetectedMultiDayPattern | null;
}

type LazyConsolidationPreviewResult = {
  readonly willConsolidate: boolean;
  readonly reason: string;
  readonly consolidation?: ConsolidationDetails | null;
  readonly warnings?: string[] | null;
  readonly detectedPattern?: DetectedMultiDayPattern | null;
}

export declare type ConsolidationPreviewResult = LazyLoading extends LazyLoadingDisabled ? EagerConsolidationPreviewResult : LazyConsolidationPreviewResult

export declare const ConsolidationPreviewResult: (new (init: ModelInit<ConsolidationPreviewResult>) => ConsolidationPreviewResult)

type EagerConsolidationDetails = {
  readonly consolidationKey: string;
  readonly keyStrategy: string;
  readonly parentExists: boolean;
  readonly parentGameId?: string | null;
  readonly parentName: string;
  readonly siblingCount: number;
  readonly siblings?: ConsolidationSibling[] | null;
  readonly projectedTotals?: ProjectedConsolidationTotals | null;
}

type LazyConsolidationDetails = {
  readonly consolidationKey: string;
  readonly keyStrategy: string;
  readonly parentExists: boolean;
  readonly parentGameId?: string | null;
  readonly parentName: string;
  readonly siblingCount: number;
  readonly siblings?: ConsolidationSibling[] | null;
  readonly projectedTotals?: ProjectedConsolidationTotals | null;
}

export declare type ConsolidationDetails = LazyLoading extends LazyLoadingDisabled ? EagerConsolidationDetails : LazyConsolidationDetails

export declare const ConsolidationDetails: (new (init: ModelInit<ConsolidationDetails>) => ConsolidationDetails)

type EagerConsolidationSibling = {
  readonly id: string;
  readonly name: string;
  readonly dayNumber?: number | null;
  readonly flightLetter?: string | null;
  readonly gameStatus?: GameStatus | keyof typeof GameStatus | null;
  readonly gameStartDateTime?: string | null;
  readonly totalUniquePlayers?: number | null;
  readonly totalInitialEntries?: number | null;
  readonly totalEntries?: number | null;
  readonly finalDay?: boolean | null;
}

type LazyConsolidationSibling = {
  readonly id: string;
  readonly name: string;
  readonly dayNumber?: number | null;
  readonly flightLetter?: string | null;
  readonly gameStatus?: GameStatus | keyof typeof GameStatus | null;
  readonly gameStartDateTime?: string | null;
  readonly totalUniquePlayers?: number | null;
  readonly totalInitialEntries?: number | null;
  readonly totalEntries?: number | null;
  readonly finalDay?: boolean | null;
}

export declare type ConsolidationSibling = LazyLoading extends LazyLoadingDisabled ? EagerConsolidationSibling : LazyConsolidationSibling

export declare const ConsolidationSibling: (new (init: ModelInit<ConsolidationSibling>) => ConsolidationSibling)

type EagerProjectedConsolidationTotals = {
  readonly totalUniquePlayers?: number | null;
  readonly totalInitialEntries?: number | null;
  readonly totalEntries?: number | null;
  readonly totalRebuys?: number | null;
  readonly totalAddons?: number | null;
  readonly prizepoolPaid?: number | null;
  readonly prizepoolCalculated?: number | null;
  readonly earliestStart?: string | null;
  readonly latestEnd?: string | null;
  readonly projectedStatus?: GameStatus | keyof typeof GameStatus | null;
  readonly isPartialData?: boolean | null;
  readonly missingFlightCount?: number | null;
}

type LazyProjectedConsolidationTotals = {
  readonly totalUniquePlayers?: number | null;
  readonly totalInitialEntries?: number | null;
  readonly totalEntries?: number | null;
  readonly totalRebuys?: number | null;
  readonly totalAddons?: number | null;
  readonly prizepoolPaid?: number | null;
  readonly prizepoolCalculated?: number | null;
  readonly earliestStart?: string | null;
  readonly latestEnd?: string | null;
  readonly projectedStatus?: GameStatus | keyof typeof GameStatus | null;
  readonly isPartialData?: boolean | null;
  readonly missingFlightCount?: number | null;
}

export declare type ProjectedConsolidationTotals = LazyLoading extends LazyLoadingDisabled ? EagerProjectedConsolidationTotals : LazyProjectedConsolidationTotals

export declare const ProjectedConsolidationTotals: (new (init: ModelInit<ProjectedConsolidationTotals>) => ProjectedConsolidationTotals)

type EagerReScrapeResult = {
  readonly name?: string | null;
  readonly gameStartDateTime?: string | null;
  readonly gameEndDateTime?: string | null;
  readonly gameStatus?: GameStatus | keyof typeof GameStatus | null;
  readonly registrationStatus?: RegistrationStatus | keyof typeof RegistrationStatus | null;
  readonly gameType?: GameType | keyof typeof GameType | null;
  readonly gameVariant?: GameVariant | keyof typeof GameVariant | null;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly prizepoolPaid?: number | null;
  readonly prizepoolCalculated?: number | null;
  readonly buyIn?: number | null;
  readonly rake?: number | null;
  readonly startingStack?: number | null;
  readonly hasGuarantee?: boolean | null;
  readonly guaranteeAmount?: number | null;
  readonly totalUniquePlayers?: number | null;
  readonly totalInitialEntries?: number | null;
  readonly totalEntries?: number | null;
  readonly totalRebuys?: number | null;
  readonly totalAddons?: number | null;
  readonly totalDuration?: number | null;
  readonly playersRemaining?: number | null;
  readonly seriesName?: string | null;
  readonly gameTags?: (string | null)[] | null;
  readonly venueMatch?: VenueMatch | null;
  readonly existingGameId?: string | null;
  readonly doNotScrape?: boolean | null;
  readonly sourceUrl?: string | null;
  readonly tournamentId?: number | null;
  readonly entityId?: string | null;
  readonly s3Key?: string | null;
  readonly reScrapedAt?: string | null;
}

type LazyReScrapeResult = {
  readonly name?: string | null;
  readonly gameStartDateTime?: string | null;
  readonly gameEndDateTime?: string | null;
  readonly gameStatus?: GameStatus | keyof typeof GameStatus | null;
  readonly registrationStatus?: RegistrationStatus | keyof typeof RegistrationStatus | null;
  readonly gameType?: GameType | keyof typeof GameType | null;
  readonly gameVariant?: GameVariant | keyof typeof GameVariant | null;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly prizepoolPaid?: number | null;
  readonly prizepoolCalculated?: number | null;
  readonly buyIn?: number | null;
  readonly rake?: number | null;
  readonly startingStack?: number | null;
  readonly hasGuarantee?: boolean | null;
  readonly guaranteeAmount?: number | null;
  readonly totalUniquePlayers?: number | null;
  readonly totalInitialEntries?: number | null;
  readonly totalEntries?: number | null;
  readonly totalRebuys?: number | null;
  readonly totalAddons?: number | null;
  readonly totalDuration?: number | null;
  readonly playersRemaining?: number | null;
  readonly seriesName?: string | null;
  readonly gameTags?: (string | null)[] | null;
  readonly venueMatch?: VenueMatch | null;
  readonly existingGameId?: string | null;
  readonly doNotScrape?: boolean | null;
  readonly sourceUrl?: string | null;
  readonly tournamentId?: number | null;
  readonly entityId?: string | null;
  readonly s3Key?: string | null;
  readonly reScrapedAt?: string | null;
}

export declare type ReScrapeResult = LazyLoading extends LazyLoadingDisabled ? EagerReScrapeResult : LazyReScrapeResult

export declare const ReScrapeResult: (new (init: ModelInit<ReScrapeResult>) => ReScrapeResult)

type EagerEntityScrapingStatus = {
  readonly entityId: string;
  readonly entityName?: string | null;
  readonly lowestTournamentId?: number | null;
  readonly highestTournamentId?: number | null;
  readonly totalGamesStored: number;
  readonly unfinishedGameCount: number;
  readonly gaps: GapRange[];
  readonly gapSummary: GapSummary;
  readonly lastUpdated: string;
  readonly cacheAge?: number | null;
}

type LazyEntityScrapingStatus = {
  readonly entityId: string;
  readonly entityName?: string | null;
  readonly lowestTournamentId?: number | null;
  readonly highestTournamentId?: number | null;
  readonly totalGamesStored: number;
  readonly unfinishedGameCount: number;
  readonly gaps: GapRange[];
  readonly gapSummary: GapSummary;
  readonly lastUpdated: string;
  readonly cacheAge?: number | null;
}

export declare type EntityScrapingStatus = LazyLoading extends LazyLoadingDisabled ? EagerEntityScrapingStatus : LazyEntityScrapingStatus

export declare const EntityScrapingStatus: (new (init: ModelInit<EntityScrapingStatus>) => EntityScrapingStatus)

type EagerEntityVenueAssignmentSummary = {
  readonly entityId?: string | null;
  readonly entityName: string;
  readonly totalGames?: number | null;
  readonly gamesWithVenue?: number | null;
  readonly gamesNeedingVenue?: number | null;
}

type LazyEntityVenueAssignmentSummary = {
  readonly entityId?: string | null;
  readonly entityName: string;
  readonly totalGames?: number | null;
  readonly gamesWithVenue?: number | null;
  readonly gamesNeedingVenue?: number | null;
}

export declare type EntityVenueAssignmentSummary = LazyLoading extends LazyLoadingDisabled ? EagerEntityVenueAssignmentSummary : LazyEntityVenueAssignmentSummary

export declare const EntityVenueAssignmentSummary: (new (init: ModelInit<EntityVenueAssignmentSummary>) => EntityVenueAssignmentSummary)

type EagerVenueAssignmentSummary = {
  readonly totalGames?: number | null;
  readonly gamesWithVenue?: number | null;
  readonly gamesNeedingVenue?: number | null;
  readonly pendingAssignments?: number | null;
  readonly byEntity?: (EntityVenueAssignmentSummary | null)[] | null;
}

type LazyVenueAssignmentSummary = {
  readonly totalGames?: number | null;
  readonly gamesWithVenue?: number | null;
  readonly gamesNeedingVenue?: number | null;
  readonly pendingAssignments?: number | null;
  readonly byEntity?: (EntityVenueAssignmentSummary | null)[] | null;
}

export declare type VenueAssignmentSummary = LazyLoading extends LazyLoadingDisabled ? EagerVenueAssignmentSummary : LazyVenueAssignmentSummary

export declare const VenueAssignmentSummary: (new (init: ModelInit<VenueAssignmentSummary>) => VenueAssignmentSummary)

type EagerReassignGameVenueResult = {
  readonly success: boolean;
  readonly status: string;
  readonly message?: string | null;
  readonly gameId?: string | null;
  readonly taskId?: string | null;
  readonly oldVenueId?: string | null;
  readonly newVenueId?: string | null;
  readonly oldEntityId?: string | null;
  readonly newEntityId?: string | null;
  readonly venueCloned?: boolean | null;
  readonly clonedVenueId?: string | null;
  readonly recordsUpdated?: string | null;
}

type LazyReassignGameVenueResult = {
  readonly success: boolean;
  readonly status: string;
  readonly message?: string | null;
  readonly gameId?: string | null;
  readonly taskId?: string | null;
  readonly oldVenueId?: string | null;
  readonly newVenueId?: string | null;
  readonly oldEntityId?: string | null;
  readonly newEntityId?: string | null;
  readonly venueCloned?: boolean | null;
  readonly clonedVenueId?: string | null;
  readonly recordsUpdated?: string | null;
}

export declare type ReassignGameVenueResult = LazyLoading extends LazyLoadingDisabled ? EagerReassignGameVenueResult : LazyReassignGameVenueResult

export declare const ReassignGameVenueResult: (new (init: ModelInit<ReassignGameVenueResult>) => ReassignGameVenueResult)

type EagerBulkReassignGameVenuesResult = {
  readonly success: boolean;
  readonly status: string;
  readonly message?: string | null;
  readonly taskId?: string | null;
  readonly gameCount?: number | null;
  readonly newVenueId?: string | null;
  readonly reassignEntity?: boolean | null;
}

type LazyBulkReassignGameVenuesResult = {
  readonly success: boolean;
  readonly status: string;
  readonly message?: string | null;
  readonly taskId?: string | null;
  readonly gameCount?: number | null;
  readonly newVenueId?: string | null;
  readonly reassignEntity?: boolean | null;
}

export declare type BulkReassignGameVenuesResult = LazyLoading extends LazyLoadingDisabled ? EagerBulkReassignGameVenuesResult : LazyBulkReassignGameVenuesResult

export declare const BulkReassignGameVenuesResult: (new (init: ModelInit<BulkReassignGameVenuesResult>) => BulkReassignGameVenuesResult)

type EagerSaveGameResult = {
  readonly success: boolean;
  readonly gameId?: string | null;
  readonly action: string;
  readonly message?: string | null;
  readonly warnings?: (string | null)[] | null;
  readonly playerProcessingQueued?: boolean | null;
  readonly playerProcessingReason?: string | null;
  readonly venueAssignment?: SaveVenueAssignmentInfo | null;
  readonly seriesAssignment?: SaveSeriesAssignmentInfo | null;
  readonly recurringGameAssignment?: SaveRecurringAssignmentInfo | null;
  readonly fieldsUpdated?: (string | null)[] | null;
  readonly wasEdited?: boolean | null;
}

type LazySaveGameResult = {
  readonly success: boolean;
  readonly gameId?: string | null;
  readonly action: string;
  readonly message?: string | null;
  readonly warnings?: (string | null)[] | null;
  readonly playerProcessingQueued?: boolean | null;
  readonly playerProcessingReason?: string | null;
  readonly venueAssignment?: SaveVenueAssignmentInfo | null;
  readonly seriesAssignment?: SaveSeriesAssignmentInfo | null;
  readonly recurringGameAssignment?: SaveRecurringAssignmentInfo | null;
  readonly fieldsUpdated?: (string | null)[] | null;
  readonly wasEdited?: boolean | null;
}

export declare type SaveGameResult = LazyLoading extends LazyLoadingDisabled ? EagerSaveGameResult : LazySaveGameResult

export declare const SaveGameResult: (new (init: ModelInit<SaveGameResult>) => SaveGameResult)

type EagerSaveRecurringAssignmentInfo = {
  readonly recurringGameId?: string | null;
  readonly recurringGameName?: string | null;
  readonly status?: RecurringGameAssignmentStatus | keyof typeof RecurringGameAssignmentStatus | null;
  readonly confidence?: number | null;
  readonly wasCreated?: boolean | null;
  readonly inheritedGuarantee?: number | null;
}

type LazySaveRecurringAssignmentInfo = {
  readonly recurringGameId?: string | null;
  readonly recurringGameName?: string | null;
  readonly status?: RecurringGameAssignmentStatus | keyof typeof RecurringGameAssignmentStatus | null;
  readonly confidence?: number | null;
  readonly wasCreated?: boolean | null;
  readonly inheritedGuarantee?: number | null;
}

export declare type SaveRecurringAssignmentInfo = LazyLoading extends LazyLoadingDisabled ? EagerSaveRecurringAssignmentInfo : LazySaveRecurringAssignmentInfo

export declare const SaveRecurringAssignmentInfo: (new (init: ModelInit<SaveRecurringAssignmentInfo>) => SaveRecurringAssignmentInfo)

type EagerAssignGameResult = {
  readonly success: boolean;
  readonly game?: Game | null;
  readonly recurringGame?: RecurringGame | null;
  readonly message?: string | null;
  readonly confidence?: number | null;
}

type LazyAssignGameResult = {
  readonly success: boolean;
  readonly game: AsyncItem<Game | undefined>;
  readonly recurringGame: AsyncItem<RecurringGame | undefined>;
  readonly message?: string | null;
  readonly confidence?: number | null;
}

export declare type AssignGameResult = LazyLoading extends LazyLoadingDisabled ? EagerAssignGameResult : LazyAssignGameResult

export declare const AssignGameResult: (new (init: ModelInit<AssignGameResult>) => AssignGameResult)

type EagerDetectRecurringGamesResult = {
  readonly success: boolean;
  readonly message?: string | null;
  readonly gamesAnalyzed?: number | null;
  readonly recurringGamesCreated?: number | null;
  readonly recurringGamesUpdated?: number | null;
  readonly gamesAssigned?: number | null;
  readonly gamesPendingReview?: number | null;
  readonly newRecurringGames?: (RecurringGame | null)[] | null;
  readonly assignmentResults?: (AssignGameResult | null)[] | null;
  readonly preview?: string | null;
  readonly errors?: (string | null)[] | null;
}

type LazyDetectRecurringGamesResult = {
  readonly success: boolean;
  readonly message?: string | null;
  readonly gamesAnalyzed?: number | null;
  readonly recurringGamesCreated?: number | null;
  readonly recurringGamesUpdated?: number | null;
  readonly gamesAssigned?: number | null;
  readonly gamesPendingReview?: number | null;
  readonly newRecurringGames: AsyncCollection<RecurringGame>;
  readonly assignmentResults?: (AssignGameResult | null)[] | null;
  readonly preview?: string | null;
  readonly errors?: (string | null)[] | null;
}

export declare type DetectRecurringGamesResult = LazyLoading extends LazyLoadingDisabled ? EagerDetectRecurringGamesResult : LazyDetectRecurringGamesResult

export declare const DetectRecurringGamesResult: (new (init: ModelInit<DetectRecurringGamesResult>) => DetectRecurringGamesResult)

type EagerBulkAssignResult = {
  readonly success: boolean;
  readonly totalGames?: number | null;
  readonly successfulAssignments?: number | null;
  readonly failedAssignments?: number | null;
  readonly results?: (AssignGameResult | null)[] | null;
  readonly errors?: (string | null)[] | null;
}

type LazyBulkAssignResult = {
  readonly success: boolean;
  readonly totalGames?: number | null;
  readonly successfulAssignments?: number | null;
  readonly failedAssignments?: number | null;
  readonly results?: (AssignGameResult | null)[] | null;
  readonly errors?: (string | null)[] | null;
}

export declare type BulkAssignResult = LazyLoading extends LazyLoadingDisabled ? EagerBulkAssignResult : LazyBulkAssignResult

export declare const BulkAssignResult: (new (init: ModelInit<BulkAssignResult>) => BulkAssignResult)

type EagerRecurringGameWithStats = {
  readonly recurringGame?: RecurringGame | null;
  readonly totalInstances?: number | null;
  readonly avgEntries?: number | null;
  readonly avgProfit?: number | null;
  readonly recentTrend?: string | null;
  readonly recentGames?: (Game | null)[] | null;
  readonly consistency?: string | null;
  readonly profitability?: string | null;
  readonly attendanceHealth?: string | null;
  readonly topPlayers?: (RecurringGamePlayerSummary | null)[] | null;
}

type LazyRecurringGameWithStats = {
  readonly recurringGame: AsyncItem<RecurringGame | undefined>;
  readonly totalInstances?: number | null;
  readonly avgEntries?: number | null;
  readonly avgProfit?: number | null;
  readonly recentTrend?: string | null;
  readonly recentGames: AsyncCollection<Game>;
  readonly consistency?: string | null;
  readonly profitability?: string | null;
  readonly attendanceHealth?: string | null;
  readonly topPlayers?: (RecurringGamePlayerSummary | null)[] | null;
}

export declare type RecurringGameWithStats = LazyLoading extends LazyLoadingDisabled ? EagerRecurringGameWithStats : LazyRecurringGameWithStats

export declare const RecurringGameWithStats: (new (init: ModelInit<RecurringGameWithStats>) => RecurringGameWithStats)

type EagerRecurringGamePlayerSummary = {
  readonly playerId?: string | null;
  readonly playerName?: string | null;
  readonly appearances?: number | null;
  readonly avgFinish?: number | null;
  readonly totalWinnings?: number | null;
}

type LazyRecurringGamePlayerSummary = {
  readonly playerId?: string | null;
  readonly playerName?: string | null;
  readonly appearances?: number | null;
  readonly avgFinish?: number | null;
  readonly totalWinnings?: number | null;
}

export declare type RecurringGamePlayerSummary = LazyLoading extends LazyLoadingDisabled ? EagerRecurringGamePlayerSummary : LazyRecurringGamePlayerSummary

export declare const RecurringGamePlayerSummary: (new (init: ModelInit<RecurringGamePlayerSummary>) => RecurringGamePlayerSummary)

type EagerSearchRecurringGamesResult = {
  readonly items?: (RecurringGame | null)[] | null;
  readonly total?: number | null;
  readonly nextToken?: string | null;
}

type LazySearchRecurringGamesResult = {
  readonly items: AsyncCollection<RecurringGame>;
  readonly total?: number | null;
  readonly nextToken?: string | null;
}

export declare type SearchRecurringGamesResult = LazyLoading extends LazyLoadingDisabled ? EagerSearchRecurringGamesResult : LazySearchRecurringGamesResult

export declare const SearchRecurringGamesResult: (new (init: ModelInit<SearchRecurringGamesResult>) => SearchRecurringGamesResult)

type EagerEnrichGameDataOutput = {
  readonly success: boolean;
  readonly validation: EnrichmentValidationResult;
  readonly enrichedGame?: EnrichedGameData | null;
  readonly enrichmentMetadata: EnrichmentMetadata;
  readonly saveResult?: SaveGameResult | null;
}

type LazyEnrichGameDataOutput = {
  readonly success: boolean;
  readonly validation: EnrichmentValidationResult;
  readonly enrichedGame?: EnrichedGameData | null;
  readonly enrichmentMetadata: EnrichmentMetadata;
  readonly saveResult?: SaveGameResult | null;
}

export declare type EnrichGameDataOutput = LazyLoading extends LazyLoadingDisabled ? EagerEnrichGameDataOutput : LazyEnrichGameDataOutput

export declare const EnrichGameDataOutput: (new (init: ModelInit<EnrichGameDataOutput>) => EnrichGameDataOutput)

type EagerEnrichmentValidationResult = {
  readonly isValid: boolean;
  readonly errors: EnrichmentValidationError[];
  readonly warnings: EnrichmentValidationWarning[];
}

type LazyEnrichmentValidationResult = {
  readonly isValid: boolean;
  readonly errors: EnrichmentValidationError[];
  readonly warnings: EnrichmentValidationWarning[];
}

export declare type EnrichmentValidationResult = LazyLoading extends LazyLoadingDisabled ? EagerEnrichmentValidationResult : LazyEnrichmentValidationResult

export declare const EnrichmentValidationResult: (new (init: ModelInit<EnrichmentValidationResult>) => EnrichmentValidationResult)

type EagerEnrichmentValidationError = {
  readonly field: string;
  readonly message: string;
  readonly code?: string | null;
}

type LazyEnrichmentValidationError = {
  readonly field: string;
  readonly message: string;
  readonly code?: string | null;
}

export declare type EnrichmentValidationError = LazyLoading extends LazyLoadingDisabled ? EagerEnrichmentValidationError : LazyEnrichmentValidationError

export declare const EnrichmentValidationError: (new (init: ModelInit<EnrichmentValidationError>) => EnrichmentValidationError)

type EagerEnrichmentValidationWarning = {
  readonly field: string;
  readonly message: string;
  readonly code?: string | null;
}

type LazyEnrichmentValidationWarning = {
  readonly field: string;
  readonly message: string;
  readonly code?: string | null;
}

export declare type EnrichmentValidationWarning = LazyLoading extends LazyLoadingDisabled ? EagerEnrichmentValidationWarning : LazyEnrichmentValidationWarning

export declare const EnrichmentValidationWarning: (new (init: ModelInit<EnrichmentValidationWarning>) => EnrichmentValidationWarning)

type EagerEnrichedGameData = {
  readonly tournamentId?: number | null;
  readonly existingGameId?: string | null;
  readonly name: string;
  readonly gameType: GameType | keyof typeof GameType;
  readonly gameVariant?: GameVariant | keyof typeof GameVariant | null;
  readonly gameStatus: GameStatus | keyof typeof GameStatus;
  readonly registrationStatus?: RegistrationStatus | keyof typeof RegistrationStatus | null;
  readonly gameStartDateTime: string;
  readonly gameActualStartDateTime?: string | null;
  readonly gameEndDateTime?: string | null;
  readonly gameFrequency?: GameFrequency | keyof typeof GameFrequency | null;
  readonly buyIn?: number | null;
  readonly rake?: number | null;
  readonly venueFee?: number | null;
  readonly startingStack?: number | null;
  readonly hasGuarantee?: boolean | null;
  readonly guaranteeAmount?: number | null;
  readonly totalBuyInsCollected?: number | null;
  readonly rakeRevenue?: number | null;
  readonly prizepoolPlayerContributions?: number | null;
  readonly prizepoolAddedValue?: number | null;
  readonly prizepoolSurplus?: number | null;
  readonly guaranteeOverlayCost?: number | null;
  readonly gameProfit?: number | null;
  readonly prizepoolCalculated?: number | null;
  readonly hasJackpotContributions?: boolean | null;
  readonly jackpotContributionAmount?: number | null;
  readonly hasAccumulatorTickets?: boolean | null;
  readonly accumulatorTicketValue?: number | null;
  readonly numberOfAccumulatorTicketsPaid?: number | null;
  readonly totalUniquePlayers?: number | null;
  readonly totalInitialEntries?: number | null;
  readonly totalEntries?: number | null;
  readonly totalRebuys?: number | null;
  readonly totalAddons?: number | null;
  readonly prizepoolPaid?: number | null;
  readonly playersRemaining?: number | null;
  readonly totalChipsInPlay?: number | null;
  readonly averagePlayerStack?: number | null;
  readonly totalDuration?: number | null;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly isSeries?: boolean | null;
  readonly seriesName?: string | null;
  readonly isSatellite?: boolean | null;
  readonly isRegular?: boolean | null;
  readonly gameTags?: (string | null)[] | null;
  readonly venueId?: string | null;
  readonly venueAssignmentStatus?: VenueAssignmentStatus | keyof typeof VenueAssignmentStatus | null;
  readonly venueAssignmentConfidence?: number | null;
  readonly suggestedVenueName?: string | null;
  readonly tournamentSeriesId?: string | null;
  readonly seriesTitleId?: string | null;
  readonly seriesAssignmentStatus?: SeriesAssignmentStatus | keyof typeof SeriesAssignmentStatus | null;
  readonly seriesAssignmentConfidence?: number | null;
  readonly suggestedSeriesName?: string | null;
  readonly isMainEvent?: boolean | null;
  readonly eventNumber?: number | null;
  readonly dayNumber?: number | null;
  readonly flightLetter?: string | null;
  readonly finalDay?: boolean | null;
  readonly recurringGameId?: string | null;
  readonly recurringGameAssignmentStatus?: RecurringGameAssignmentStatus | keyof typeof RecurringGameAssignmentStatus | null;
  readonly recurringGameAssignmentConfidence?: number | null;
  readonly wasScheduledInstance?: boolean | null;
  readonly deviationNotes?: string | null;
  readonly instanceNumber?: number | null;
  readonly gameDayOfWeek?: string | null;
  readonly buyInBucket?: string | null;
  readonly venueScheduleKey?: string | null;
  readonly venueGameTypeKey?: string | null;
  readonly entityQueryKey?: string | null;
  readonly entityGameTypeKey?: string | null;
  readonly levels?: string | null;
}

type LazyEnrichedGameData = {
  readonly tournamentId?: number | null;
  readonly existingGameId?: string | null;
  readonly name: string;
  readonly gameType: GameType | keyof typeof GameType;
  readonly gameVariant?: GameVariant | keyof typeof GameVariant | null;
  readonly gameStatus: GameStatus | keyof typeof GameStatus;
  readonly registrationStatus?: RegistrationStatus | keyof typeof RegistrationStatus | null;
  readonly gameStartDateTime: string;
  readonly gameActualStartDateTime?: string | null;
  readonly gameEndDateTime?: string | null;
  readonly gameFrequency?: GameFrequency | keyof typeof GameFrequency | null;
  readonly buyIn?: number | null;
  readonly rake?: number | null;
  readonly venueFee?: number | null;
  readonly startingStack?: number | null;
  readonly hasGuarantee?: boolean | null;
  readonly guaranteeAmount?: number | null;
  readonly totalBuyInsCollected?: number | null;
  readonly rakeRevenue?: number | null;
  readonly prizepoolPlayerContributions?: number | null;
  readonly prizepoolAddedValue?: number | null;
  readonly prizepoolSurplus?: number | null;
  readonly guaranteeOverlayCost?: number | null;
  readonly gameProfit?: number | null;
  readonly prizepoolCalculated?: number | null;
  readonly hasJackpotContributions?: boolean | null;
  readonly jackpotContributionAmount?: number | null;
  readonly hasAccumulatorTickets?: boolean | null;
  readonly accumulatorTicketValue?: number | null;
  readonly numberOfAccumulatorTicketsPaid?: number | null;
  readonly totalUniquePlayers?: number | null;
  readonly totalInitialEntries?: number | null;
  readonly totalEntries?: number | null;
  readonly totalRebuys?: number | null;
  readonly totalAddons?: number | null;
  readonly prizepoolPaid?: number | null;
  readonly playersRemaining?: number | null;
  readonly totalChipsInPlay?: number | null;
  readonly averagePlayerStack?: number | null;
  readonly totalDuration?: number | null;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly isSeries?: boolean | null;
  readonly seriesName?: string | null;
  readonly isSatellite?: boolean | null;
  readonly isRegular?: boolean | null;
  readonly gameTags?: (string | null)[] | null;
  readonly venueId?: string | null;
  readonly venueAssignmentStatus?: VenueAssignmentStatus | keyof typeof VenueAssignmentStatus | null;
  readonly venueAssignmentConfidence?: number | null;
  readonly suggestedVenueName?: string | null;
  readonly tournamentSeriesId?: string | null;
  readonly seriesTitleId?: string | null;
  readonly seriesAssignmentStatus?: SeriesAssignmentStatus | keyof typeof SeriesAssignmentStatus | null;
  readonly seriesAssignmentConfidence?: number | null;
  readonly suggestedSeriesName?: string | null;
  readonly isMainEvent?: boolean | null;
  readonly eventNumber?: number | null;
  readonly dayNumber?: number | null;
  readonly flightLetter?: string | null;
  readonly finalDay?: boolean | null;
  readonly recurringGameId?: string | null;
  readonly recurringGameAssignmentStatus?: RecurringGameAssignmentStatus | keyof typeof RecurringGameAssignmentStatus | null;
  readonly recurringGameAssignmentConfidence?: number | null;
  readonly wasScheduledInstance?: boolean | null;
  readonly deviationNotes?: string | null;
  readonly instanceNumber?: number | null;
  readonly gameDayOfWeek?: string | null;
  readonly buyInBucket?: string | null;
  readonly venueScheduleKey?: string | null;
  readonly venueGameTypeKey?: string | null;
  readonly entityQueryKey?: string | null;
  readonly entityGameTypeKey?: string | null;
  readonly levels?: string | null;
}

export declare type EnrichedGameData = LazyLoading extends LazyLoadingDisabled ? EagerEnrichedGameData : LazyEnrichedGameData

export declare const EnrichedGameData: (new (init: ModelInit<EnrichedGameData>) => EnrichedGameData)

type EagerEnrichmentMetadata = {
  readonly seriesResolution?: SeriesResolutionMetadata | null;
  readonly recurringResolution?: RecurringResolutionMetadata | null;
  readonly venueResolution?: VenueResolutionMetadata | null;
  readonly queryKeysGenerated: boolean;
  readonly financialsCalculated: boolean;
  readonly fieldsCompleted: string[];
  readonly processingTimeMs?: number | null;
}

type LazyEnrichmentMetadata = {
  readonly seriesResolution?: SeriesResolutionMetadata | null;
  readonly recurringResolution?: RecurringResolutionMetadata | null;
  readonly venueResolution?: VenueResolutionMetadata | null;
  readonly queryKeysGenerated: boolean;
  readonly financialsCalculated: boolean;
  readonly fieldsCompleted: string[];
  readonly processingTimeMs?: number | null;
}

export declare type EnrichmentMetadata = LazyLoading extends LazyLoadingDisabled ? EagerEnrichmentMetadata : LazyEnrichmentMetadata

export declare const EnrichmentMetadata: (new (init: ModelInit<EnrichmentMetadata>) => EnrichmentMetadata)

type EagerSeriesResolutionMetadata = {
  readonly status: SeriesResolutionStatus | keyof typeof SeriesResolutionStatus;
  readonly confidence?: number | null;
  readonly matchedSeriesId?: string | null;
  readonly matchedSeriesName?: string | null;
  readonly matchedSeriesTitleId?: string | null;
  readonly wasCreated: boolean;
  readonly createdSeriesId?: string | null;
  readonly matchReason?: string | null;
}

type LazySeriesResolutionMetadata = {
  readonly status: SeriesResolutionStatus | keyof typeof SeriesResolutionStatus;
  readonly confidence?: number | null;
  readonly matchedSeriesId?: string | null;
  readonly matchedSeriesName?: string | null;
  readonly matchedSeriesTitleId?: string | null;
  readonly wasCreated: boolean;
  readonly createdSeriesId?: string | null;
  readonly matchReason?: string | null;
}

export declare type SeriesResolutionMetadata = LazyLoading extends LazyLoadingDisabled ? EagerSeriesResolutionMetadata : LazySeriesResolutionMetadata

export declare const SeriesResolutionMetadata: (new (init: ModelInit<SeriesResolutionMetadata>) => SeriesResolutionMetadata)

type EagerRecurringResolutionMetadata = {
  readonly status: RecurringResolutionStatus | keyof typeof RecurringResolutionStatus;
  readonly confidence?: number | null;
  readonly matchedRecurringGameId?: string | null;
  readonly matchedRecurringGameName?: string | null;
  readonly wasCreated: boolean;
  readonly createdRecurringGameId?: string | null;
  readonly inheritedFields?: string[] | null;
  readonly matchReason?: string | null;
}

type LazyRecurringResolutionMetadata = {
  readonly status: RecurringResolutionStatus | keyof typeof RecurringResolutionStatus;
  readonly confidence?: number | null;
  readonly matchedRecurringGameId?: string | null;
  readonly matchedRecurringGameName?: string | null;
  readonly wasCreated: boolean;
  readonly createdRecurringGameId?: string | null;
  readonly inheritedFields?: string[] | null;
  readonly matchReason?: string | null;
}

export declare type RecurringResolutionMetadata = LazyLoading extends LazyLoadingDisabled ? EagerRecurringResolutionMetadata : LazyRecurringResolutionMetadata

export declare const RecurringResolutionMetadata: (new (init: ModelInit<RecurringResolutionMetadata>) => RecurringResolutionMetadata)

type EagerVenueResolutionMetadata = {
  readonly status: VenueAssignmentStatus | keyof typeof VenueAssignmentStatus;
  readonly venueId?: string | null;
  readonly venueName?: string | null;
  readonly venueFee?: number | null;
  readonly confidence?: number | null;
  readonly matchReason?: string | null;
}

type LazyVenueResolutionMetadata = {
  readonly status: VenueAssignmentStatus | keyof typeof VenueAssignmentStatus;
  readonly venueId?: string | null;
  readonly venueName?: string | null;
  readonly venueFee?: number | null;
  readonly confidence?: number | null;
  readonly matchReason?: string | null;
}

export declare type VenueResolutionMetadata = LazyLoading extends LazyLoadingDisabled ? EagerVenueResolutionMetadata : LazyVenueResolutionMetadata

export declare const VenueResolutionMetadata: (new (init: ModelInit<VenueResolutionMetadata>) => VenueResolutionMetadata)

type EagerCalculateGameFinancialsOutput = {
  readonly success: boolean;
  readonly gameId?: string | null;
  readonly mode: string;
  readonly calculatedCost?: GameCostCalculation | null;
  readonly calculatedSnapshot?: GameFinancialSnapshotCalculation | null;
  readonly summary?: FinancialsSummary | null;
  readonly costSaveResult?: FinancialsSaveResult | null;
  readonly snapshotSaveResult?: FinancialsSaveResult | null;
  readonly processingTimeMs?: number | null;
  readonly error?: string | null;
}

type LazyCalculateGameFinancialsOutput = {
  readonly success: boolean;
  readonly gameId?: string | null;
  readonly mode: string;
  readonly calculatedCost?: GameCostCalculation | null;
  readonly calculatedSnapshot?: GameFinancialSnapshotCalculation | null;
  readonly summary?: FinancialsSummary | null;
  readonly costSaveResult?: FinancialsSaveResult | null;
  readonly snapshotSaveResult?: FinancialsSaveResult | null;
  readonly processingTimeMs?: number | null;
  readonly error?: string | null;
}

export declare type CalculateGameFinancialsOutput = LazyLoading extends LazyLoadingDisabled ? EagerCalculateGameFinancialsOutput : LazyCalculateGameFinancialsOutput

export declare const CalculateGameFinancialsOutput: (new (init: ModelInit<CalculateGameFinancialsOutput>) => CalculateGameFinancialsOutput)

type EagerGameCostCalculation = {
  readonly gameId?: string | null;
  readonly entityId?: string | null;
  readonly venueId?: string | null;
  readonly gameDate?: string | null;
  readonly totalDealerCost?: number | null;
  readonly totalTournamentDirectorCost?: number | null;
  readonly totalFloorStaffCost?: number | null;
  readonly totalSecurityCost?: number | null;
  readonly totalPrizeContribution?: number | null;
  readonly totalJackpotContribution?: number | null;
  readonly totalPromotionCost?: number | null;
  readonly totalOtherCost?: number | null;
  readonly totalCost?: number | null;
  readonly dealerRatePerEntry?: number | null;
  readonly entriesUsedForCalculation?: number | null;
}

type LazyGameCostCalculation = {
  readonly gameId?: string | null;
  readonly entityId?: string | null;
  readonly venueId?: string | null;
  readonly gameDate?: string | null;
  readonly totalDealerCost?: number | null;
  readonly totalTournamentDirectorCost?: number | null;
  readonly totalFloorStaffCost?: number | null;
  readonly totalSecurityCost?: number | null;
  readonly totalPrizeContribution?: number | null;
  readonly totalJackpotContribution?: number | null;
  readonly totalPromotionCost?: number | null;
  readonly totalOtherCost?: number | null;
  readonly totalCost?: number | null;
  readonly dealerRatePerEntry?: number | null;
  readonly entriesUsedForCalculation?: number | null;
}

export declare type GameCostCalculation = LazyLoading extends LazyLoadingDisabled ? EagerGameCostCalculation : LazyGameCostCalculation

export declare const GameCostCalculation: (new (init: ModelInit<GameCostCalculation>) => GameCostCalculation)

type EagerGameFinancialSnapshotCalculation = {
  readonly gameId?: string | null;
  readonly entityId?: string | null;
  readonly venueId?: string | null;
  readonly gameStartDateTime?: string | null;
  readonly totalUniquePlayers?: number | null;
  readonly totalEntries?: number | null;
  readonly guaranteeAmount?: number | null;
  readonly gameDurationMinutes?: number | null;
  readonly gameType?: GameType | keyof typeof GameType | null;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly totalBuyInsCollected?: number | null;
  readonly rakeRevenue?: number | null;
  readonly venueFee?: number | null;
  readonly totalRevenue?: number | null;
  readonly prizepoolPlayerContributions?: number | null;
  readonly prizepoolAddedValue?: number | null;
  readonly prizepoolTotal?: number | null;
  readonly prizepoolSurplus?: number | null;
  readonly prizepoolPaidDelta?: number | null;
  readonly prizepoolJackpotContributions?: number | null;
  readonly prizepoolAccumulatorTicketPayoutEstimate?: number | null;
  readonly prizepoolAccumulatorTicketPayoutActual?: number | null;
  readonly guaranteeOverlayCost?: number | null;
  readonly guaranteeCoverageRate?: number | null;
  readonly guaranteeMet?: boolean | null;
  readonly totalCost?: number | null;
  readonly totalDealerCost?: number | null;
  readonly totalStaffCost?: number | null;
  readonly gameProfit?: number | null;
  readonly netProfit?: number | null;
  readonly profitMargin?: number | null;
  readonly revenuePerPlayer?: number | null;
  readonly costPerPlayer?: number | null;
  readonly profitPerPlayer?: number | null;
  readonly rakePerEntry?: number | null;
  readonly staffCostPerPlayer?: number | null;
  readonly dealerCostPerHour?: number | null;
}

type LazyGameFinancialSnapshotCalculation = {
  readonly gameId?: string | null;
  readonly entityId?: string | null;
  readonly venueId?: string | null;
  readonly gameStartDateTime?: string | null;
  readonly totalUniquePlayers?: number | null;
  readonly totalEntries?: number | null;
  readonly guaranteeAmount?: number | null;
  readonly gameDurationMinutes?: number | null;
  readonly gameType?: GameType | keyof typeof GameType | null;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly totalBuyInsCollected?: number | null;
  readonly rakeRevenue?: number | null;
  readonly venueFee?: number | null;
  readonly totalRevenue?: number | null;
  readonly prizepoolPlayerContributions?: number | null;
  readonly prizepoolAddedValue?: number | null;
  readonly prizepoolTotal?: number | null;
  readonly prizepoolSurplus?: number | null;
  readonly prizepoolPaidDelta?: number | null;
  readonly prizepoolJackpotContributions?: number | null;
  readonly prizepoolAccumulatorTicketPayoutEstimate?: number | null;
  readonly prizepoolAccumulatorTicketPayoutActual?: number | null;
  readonly guaranteeOverlayCost?: number | null;
  readonly guaranteeCoverageRate?: number | null;
  readonly guaranteeMet?: boolean | null;
  readonly totalCost?: number | null;
  readonly totalDealerCost?: number | null;
  readonly totalStaffCost?: number | null;
  readonly gameProfit?: number | null;
  readonly netProfit?: number | null;
  readonly profitMargin?: number | null;
  readonly revenuePerPlayer?: number | null;
  readonly costPerPlayer?: number | null;
  readonly profitPerPlayer?: number | null;
  readonly rakePerEntry?: number | null;
  readonly staffCostPerPlayer?: number | null;
  readonly dealerCostPerHour?: number | null;
}

export declare type GameFinancialSnapshotCalculation = LazyLoading extends LazyLoadingDisabled ? EagerGameFinancialSnapshotCalculation : LazyGameFinancialSnapshotCalculation

export declare const GameFinancialSnapshotCalculation: (new (init: ModelInit<GameFinancialSnapshotCalculation>) => GameFinancialSnapshotCalculation)

type EagerFinancialsSummary = {
  readonly totalRevenue?: number | null;
  readonly rakeRevenue?: number | null;
  readonly totalBuyInsCollected?: number | null;
  readonly totalCost?: number | null;
  readonly totalDealerCost?: number | null;
  readonly prizepoolTotal?: number | null;
  readonly prizepoolPlayerContributions?: number | null;
  readonly prizepoolAddedValue?: number | null;
  readonly guaranteeMet?: boolean | null;
  readonly guaranteeOverlayCost?: number | null;
  readonly guaranteeCoverageRate?: number | null;
  readonly gameProfit?: number | null;
  readonly netProfit?: number | null;
  readonly profitMargin?: number | null;
  readonly revenuePerPlayer?: number | null;
  readonly costPerPlayer?: number | null;
  readonly profitPerPlayer?: number | null;
  readonly rakePerEntry?: number | null;
}

type LazyFinancialsSummary = {
  readonly totalRevenue?: number | null;
  readonly rakeRevenue?: number | null;
  readonly totalBuyInsCollected?: number | null;
  readonly totalCost?: number | null;
  readonly totalDealerCost?: number | null;
  readonly prizepoolTotal?: number | null;
  readonly prizepoolPlayerContributions?: number | null;
  readonly prizepoolAddedValue?: number | null;
  readonly guaranteeMet?: boolean | null;
  readonly guaranteeOverlayCost?: number | null;
  readonly guaranteeCoverageRate?: number | null;
  readonly gameProfit?: number | null;
  readonly netProfit?: number | null;
  readonly profitMargin?: number | null;
  readonly revenuePerPlayer?: number | null;
  readonly costPerPlayer?: number | null;
  readonly profitPerPlayer?: number | null;
  readonly rakePerEntry?: number | null;
}

export declare type FinancialsSummary = LazyLoading extends LazyLoadingDisabled ? EagerFinancialsSummary : LazyFinancialsSummary

export declare const FinancialsSummary: (new (init: ModelInit<FinancialsSummary>) => FinancialsSummary)

type EagerFinancialsSaveResult = {
  readonly action?: string | null;
  readonly costId?: string | null;
  readonly snapshotId?: string | null;
  readonly error?: string | null;
}

type LazyFinancialsSaveResult = {
  readonly action?: string | null;
  readonly costId?: string | null;
  readonly snapshotId?: string | null;
  readonly error?: string | null;
}

export declare type FinancialsSaveResult = LazyLoading extends LazyLoadingDisabled ? EagerFinancialsSaveResult : LazyFinancialsSaveResult

export declare const FinancialsSaveResult: (new (init: ModelInit<FinancialsSaveResult>) => FinancialsSaveResult)

type EagerGameDeletionCounts = {
  readonly deleted?: number | null;
  readonly error?: string | null;
  readonly success?: boolean | null;
}

type LazyGameDeletionCounts = {
  readonly deleted?: number | null;
  readonly error?: string | null;
  readonly success?: boolean | null;
}

export declare type GameDeletionCounts = LazyLoading extends LazyLoadingDisabled ? EagerGameDeletionCounts : LazyGameDeletionCounts

export declare const GameDeletionCounts: (new (init: ModelInit<GameDeletionCounts>) => GameDeletionCounts)

type EagerPlayerStatsUpdateCounts = {
  readonly summariesUpdated?: number | null;
  readonly venuesUpdated?: number | null;
}

type LazyPlayerStatsUpdateCounts = {
  readonly summariesUpdated?: number | null;
  readonly venuesUpdated?: number | null;
}

export declare type PlayerStatsUpdateCounts = LazyLoading extends LazyLoadingDisabled ? EagerPlayerStatsUpdateCounts : LazyPlayerStatsUpdateCounts

export declare const PlayerStatsUpdateCounts: (new (init: ModelInit<PlayerStatsUpdateCounts>) => PlayerStatsUpdateCounts)

type EagerGameDeletionDetails = {
  readonly gameCost?: GameDeletionCounts | null;
  readonly gameFinancialSnapshot?: GameDeletionCounts | null;
  readonly scrapeURL?: GameDeletionCounts | null;
  readonly scrapeAttempts?: GameDeletionCounts | null;
  readonly playerEntries?: GameDeletionCounts | null;
  readonly playerResults?: GameDeletionCounts | null;
  readonly playerTransactions?: GameDeletionCounts | null;
  readonly playerStats?: PlayerStatsUpdateCounts | null;
  readonly game?: GameDeletionCounts | null;
  readonly parentGame?: DeleteGameWithCleanupResult | null;
}

type LazyGameDeletionDetails = {
  readonly gameCost?: GameDeletionCounts | null;
  readonly gameFinancialSnapshot?: GameDeletionCounts | null;
  readonly scrapeURL?: GameDeletionCounts | null;
  readonly scrapeAttempts?: GameDeletionCounts | null;
  readonly playerEntries?: GameDeletionCounts | null;
  readonly playerResults?: GameDeletionCounts | null;
  readonly playerTransactions?: GameDeletionCounts | null;
  readonly playerStats?: PlayerStatsUpdateCounts | null;
  readonly game?: GameDeletionCounts | null;
  readonly parentGame?: DeleteGameWithCleanupResult | null;
}

export declare type GameDeletionDetails = LazyLoading extends LazyLoadingDisabled ? EagerGameDeletionDetails : LazyGameDeletionDetails

export declare const GameDeletionDetails: (new (init: ModelInit<GameDeletionDetails>) => GameDeletionDetails)

type EagerConsolidationCleanupResult = {
  readonly deleteParent?: boolean | null;
  readonly parentId?: string | null;
  readonly remainingSiblings?: number | null;
  readonly childrenUnlinked?: number | null;
  readonly noConsolidation?: boolean | null;
}

type LazyConsolidationCleanupResult = {
  readonly deleteParent?: boolean | null;
  readonly parentId?: string | null;
  readonly remainingSiblings?: number | null;
  readonly childrenUnlinked?: number | null;
  readonly noConsolidation?: boolean | null;
}

export declare type ConsolidationCleanupResult = LazyLoading extends LazyLoadingDisabled ? EagerConsolidationCleanupResult : LazyConsolidationCleanupResult

export declare const ConsolidationCleanupResult: (new (init: ModelInit<ConsolidationCleanupResult>) => ConsolidationCleanupResult)

type EagerDeleteGameWithCleanupResult = {
  readonly success: boolean;
  readonly message?: string | null;
  readonly error?: string | null;
  readonly gameId?: string | null;
  readonly gameName?: string | null;
  readonly entityId?: string | null;
  readonly venueId?: string | null;
  readonly dryRun?: boolean | null;
  readonly deletions?: GameDeletionDetails | null;
  readonly consolidation?: ConsolidationCleanupResult | null;
}

type LazyDeleteGameWithCleanupResult = {
  readonly success: boolean;
  readonly message?: string | null;
  readonly error?: string | null;
  readonly gameId?: string | null;
  readonly gameName?: string | null;
  readonly entityId?: string | null;
  readonly venueId?: string | null;
  readonly dryRun?: boolean | null;
  readonly deletions?: GameDeletionDetails | null;
  readonly consolidation?: ConsolidationCleanupResult | null;
}

export declare type DeleteGameWithCleanupResult = LazyLoading extends LazyLoadingDisabled ? EagerDeleteGameWithCleanupResult : LazyDeleteGameWithCleanupResult

export declare const DeleteGameWithCleanupResult: (new (init: ModelInit<DeleteGameWithCleanupResult>) => DeleteGameWithCleanupResult)

type EagerAwardTicketResult = {
  readonly success: boolean;
  readonly ticketId?: string | null;
  readonly playerId?: string | null;
  readonly ticketValue?: number | null;
  readonly error?: string | null;
}

type LazyAwardTicketResult = {
  readonly success: boolean;
  readonly ticketId?: string | null;
  readonly playerId?: string | null;
  readonly ticketValue?: number | null;
  readonly error?: string | null;
}

export declare type AwardTicketResult = LazyLoading extends LazyLoadingDisabled ? EagerAwardTicketResult : LazyAwardTicketResult

export declare const AwardTicketResult: (new (init: ModelInit<AwardTicketResult>) => AwardTicketResult)

type EagerBulkAwardTicketsResult = {
  readonly success: boolean;
  readonly totalAwarded: number;
  readonly totalFailed: number;
  readonly results: AwardTicketResult[];
}

type LazyBulkAwardTicketsResult = {
  readonly success: boolean;
  readonly totalAwarded: number;
  readonly totalFailed: number;
  readonly results: AwardTicketResult[];
}

export declare type BulkAwardTicketsResult = LazyLoading extends LazyLoadingDisabled ? EagerBulkAwardTicketsResult : LazyBulkAwardTicketsResult

export declare const BulkAwardTicketsResult: (new (init: ModelInit<BulkAwardTicketsResult>) => BulkAwardTicketsResult)

type EagerTicketAwardSummary = {
  readonly gameId: string;
  readonly gameName?: string | null;
  readonly ticketsAwarded: number;
  readonly ticketValue?: number | null;
  readonly totalTicketValue?: number | null;
  readonly programName?: string | null;
  readonly positions?: (number | null)[] | null;
}

type LazyTicketAwardSummary = {
  readonly gameId: string;
  readonly gameName?: string | null;
  readonly ticketsAwarded: number;
  readonly ticketValue?: number | null;
  readonly totalTicketValue?: number | null;
  readonly programName?: string | null;
  readonly positions?: (number | null)[] | null;
}

export declare type TicketAwardSummary = LazyLoading extends LazyLoadingDisabled ? EagerTicketAwardSummary : LazyTicketAwardSummary

export declare const TicketAwardSummary: (new (init: ModelInit<TicketAwardSummary>) => TicketAwardSummary)

type EagerPlayerTicketConnection = {
  readonly items: PlayerTicket[];
  readonly nextToken?: string | null;
}

type LazyPlayerTicketConnection = {
  readonly items: AsyncCollection<PlayerTicket>;
  readonly nextToken?: string | null;
}

export declare type PlayerTicketConnection = LazyLoading extends LazyLoadingDisabled ? EagerPlayerTicketConnection : LazyPlayerTicketConnection

export declare const PlayerTicketConnection: (new (init: ModelInit<PlayerTicketConnection>) => PlayerTicketConnection)

type EagerRefreshAllMetricsResult = {
  readonly success: boolean;
  readonly message?: string | null;
  readonly entityMetricsUpdated?: number | null;
  readonly venueMetricsUpdated?: number | null;
  readonly recurringGameMetricsUpdated?: number | null;
  readonly tournamentSeriesMetricsUpdated?: number | null;
  readonly entitiesProcessed?: number | null;
  readonly venuesProcessed?: number | null;
  readonly recurringGamesProcessed?: number | null;
  readonly tournamentSeriesProcessed?: number | null;
  readonly snapshotsAnalyzed?: number | null;
  readonly bySeriesType?: MetricsBySeriesType | null;
  readonly executionTimeMs?: number | null;
  readonly peakMemoryMB?: number | null;
  readonly entityResults?: (MetricsUpdateResult | null)[] | null;
  readonly venueResults?: (MetricsUpdateResult | null)[] | null;
  readonly recurringGameResults?: (MetricsUpdateResult | null)[] | null;
  readonly tournamentSeriesResults?: (MetricsUpdateResult | null)[] | null;
  readonly errors?: (string | null)[] | null;
  readonly warnings?: (string | null)[] | null;
  readonly refreshedAt?: string | null;
  readonly refreshedBy?: string | null;
}

type LazyRefreshAllMetricsResult = {
  readonly success: boolean;
  readonly message?: string | null;
  readonly entityMetricsUpdated?: number | null;
  readonly venueMetricsUpdated?: number | null;
  readonly recurringGameMetricsUpdated?: number | null;
  readonly tournamentSeriesMetricsUpdated?: number | null;
  readonly entitiesProcessed?: number | null;
  readonly venuesProcessed?: number | null;
  readonly recurringGamesProcessed?: number | null;
  readonly tournamentSeriesProcessed?: number | null;
  readonly snapshotsAnalyzed?: number | null;
  readonly bySeriesType?: MetricsBySeriesType | null;
  readonly executionTimeMs?: number | null;
  readonly peakMemoryMB?: number | null;
  readonly entityResults?: (MetricsUpdateResult | null)[] | null;
  readonly venueResults?: (MetricsUpdateResult | null)[] | null;
  readonly recurringGameResults?: (MetricsUpdateResult | null)[] | null;
  readonly tournamentSeriesResults?: (MetricsUpdateResult | null)[] | null;
  readonly errors?: (string | null)[] | null;
  readonly warnings?: (string | null)[] | null;
  readonly refreshedAt?: string | null;
  readonly refreshedBy?: string | null;
}

export declare type RefreshAllMetricsResult = LazyLoading extends LazyLoadingDisabled ? EagerRefreshAllMetricsResult : LazyRefreshAllMetricsResult

export declare const RefreshAllMetricsResult: (new (init: ModelInit<RefreshAllMetricsResult>) => RefreshAllMetricsResult)

type EagerMetricsBySeriesType = {
  readonly ALL?: SeriesTypeBreakdown | null;
  readonly SERIES?: SeriesTypeBreakdown | null;
  readonly REGULAR?: SeriesTypeBreakdown | null;
}

type LazyMetricsBySeriesType = {
  readonly ALL?: SeriesTypeBreakdown | null;
  readonly SERIES?: SeriesTypeBreakdown | null;
  readonly REGULAR?: SeriesTypeBreakdown | null;
}

export declare type MetricsBySeriesType = LazyLoading extends LazyLoadingDisabled ? EagerMetricsBySeriesType : LazyMetricsBySeriesType

export declare const MetricsBySeriesType: (new (init: ModelInit<MetricsBySeriesType>) => MetricsBySeriesType)

type EagerSeriesTypeBreakdown = {
  readonly entity?: number | null;
  readonly venue?: number | null;
  readonly recurringGame?: number | null;
  readonly tournamentSeries?: number | null;
}

type LazySeriesTypeBreakdown = {
  readonly entity?: number | null;
  readonly venue?: number | null;
  readonly recurringGame?: number | null;
  readonly tournamentSeries?: number | null;
}

export declare type SeriesTypeBreakdown = LazyLoading extends LazyLoadingDisabled ? EagerSeriesTypeBreakdown : LazySeriesTypeBreakdown

export declare const SeriesTypeBreakdown: (new (init: ModelInit<SeriesTypeBreakdown>) => SeriesTypeBreakdown)

type EagerMetricsUpdateResult = {
  readonly id?: string | null;
  readonly name?: string | null;
  readonly type?: string | null;
  readonly timeRange?: string | null;
  readonly seriesType?: string | null;
  readonly success?: boolean | null;
  readonly recordsCreated?: number | null;
  readonly recordsUpdated?: number | null;
  readonly error?: string | null;
  readonly durationMs?: number | null;
}

type LazyMetricsUpdateResult = {
  readonly id?: string | null;
  readonly name?: string | null;
  readonly type?: string | null;
  readonly timeRange?: string | null;
  readonly seriesType?: string | null;
  readonly success?: boolean | null;
  readonly recordsCreated?: number | null;
  readonly recordsUpdated?: number | null;
  readonly error?: string | null;
  readonly durationMs?: number | null;
}

export declare type MetricsUpdateResult = LazyLoading extends LazyLoadingDisabled ? EagerMetricsUpdateResult : LazyMetricsUpdateResult

export declare const MetricsUpdateResult: (new (init: ModelInit<MetricsUpdateResult>) => MetricsUpdateResult)

type EagerEntityDashboard = {
  readonly entity?: Entity | null;
  readonly metricsAll?: EntityMetrics | null;
  readonly metricsSeries?: EntityMetrics | null;
  readonly metricsRegular?: EntityMetrics | null;
  readonly venueBreakdown?: (VenueMetrics | null)[] | null;
  readonly topRecurringGames?: (RecurringGameMetrics | null)[] | null;
  readonly topTournamentSeries?: (TournamentSeriesMetrics | null)[] | null;
  readonly trends?: TrendAnalysis | null;
}

type LazyEntityDashboard = {
  readonly entity: AsyncItem<Entity | undefined>;
  readonly metricsAll: AsyncItem<EntityMetrics | undefined>;
  readonly metricsSeries: AsyncItem<EntityMetrics | undefined>;
  readonly metricsRegular: AsyncItem<EntityMetrics | undefined>;
  readonly venueBreakdown: AsyncCollection<VenueMetrics>;
  readonly topRecurringGames: AsyncCollection<RecurringGameMetrics>;
  readonly topTournamentSeries: AsyncCollection<TournamentSeriesMetrics>;
  readonly trends?: TrendAnalysis | null;
}

export declare type EntityDashboard = LazyLoading extends LazyLoadingDisabled ? EagerEntityDashboard : LazyEntityDashboard

export declare const EntityDashboard: (new (init: ModelInit<EntityDashboard>) => EntityDashboard)

type EagerVenueDashboard = {
  readonly venue?: Venue | null;
  readonly metricsAll?: VenueMetrics | null;
  readonly metricsSeries?: VenueMetrics | null;
  readonly metricsRegular?: VenueMetrics | null;
  readonly recurringGameBreakdown?: (RecurringGameMetrics | null)[] | null;
  readonly tournamentSeriesBreakdown?: (TournamentSeriesMetrics | null)[] | null;
  readonly recentGames?: (Game | null)[] | null;
  readonly trends?: TrendAnalysis | null;
}

type LazyVenueDashboard = {
  readonly venue: AsyncItem<Venue | undefined>;
  readonly metricsAll: AsyncItem<VenueMetrics | undefined>;
  readonly metricsSeries: AsyncItem<VenueMetrics | undefined>;
  readonly metricsRegular: AsyncItem<VenueMetrics | undefined>;
  readonly recurringGameBreakdown: AsyncCollection<RecurringGameMetrics>;
  readonly tournamentSeriesBreakdown: AsyncCollection<TournamentSeriesMetrics>;
  readonly recentGames: AsyncCollection<Game>;
  readonly trends?: TrendAnalysis | null;
}

export declare type VenueDashboard = LazyLoading extends LazyLoadingDisabled ? EagerVenueDashboard : LazyVenueDashboard

export declare const VenueDashboard: (new (init: ModelInit<VenueDashboard>) => VenueDashboard)

type EagerRecurringGameReport = {
  readonly recurringGame?: RecurringGame | null;
  readonly metricsAllTime?: RecurringGameMetrics | null;
  readonly metrics12M?: RecurringGameMetrics | null;
  readonly metrics6M?: RecurringGameMetrics | null;
  readonly metrics3M?: RecurringGameMetrics | null;
  readonly metrics1M?: RecurringGameMetrics | null;
  readonly recentInstances?: (Game | null)[] | null;
  readonly regularPlayers?: (PlayerSummary | null)[] | null;
  readonly trends?: TrendAnalysis | null;
  readonly recommendations?: (string | null)[] | null;
}

type LazyRecurringGameReport = {
  readonly recurringGame: AsyncItem<RecurringGame | undefined>;
  readonly metricsAllTime: AsyncItem<RecurringGameMetrics | undefined>;
  readonly metrics12M: AsyncItem<RecurringGameMetrics | undefined>;
  readonly metrics6M: AsyncItem<RecurringGameMetrics | undefined>;
  readonly metrics3M: AsyncItem<RecurringGameMetrics | undefined>;
  readonly metrics1M: AsyncItem<RecurringGameMetrics | undefined>;
  readonly recentInstances: AsyncCollection<Game>;
  readonly regularPlayers: AsyncCollection<PlayerSummary>;
  readonly trends?: TrendAnalysis | null;
  readonly recommendations?: (string | null)[] | null;
}

export declare type RecurringGameReport = LazyLoading extends LazyLoadingDisabled ? EagerRecurringGameReport : LazyRecurringGameReport

export declare const RecurringGameReport: (new (init: ModelInit<RecurringGameReport>) => RecurringGameReport)

type EagerTournamentSeriesReport = {
  readonly tournamentSeries?: TournamentSeries | null;
  readonly metricsAllTime?: TournamentSeriesMetrics | null;
  readonly metrics12M?: TournamentSeriesMetrics | null;
  readonly metrics6M?: TournamentSeriesMetrics | null;
  readonly metrics3M?: TournamentSeriesMetrics | null;
  readonly metrics1M?: TournamentSeriesMetrics | null;
  readonly events?: (Game | null)[] | null;
  readonly mainEvents?: (Game | null)[] | null;
  readonly topPlayers?: (PlayerSummary | null)[] | null;
  readonly trends?: TrendAnalysis | null;
  readonly recommendations?: (string | null)[] | null;
}

type LazyTournamentSeriesReport = {
  readonly tournamentSeries: AsyncItem<TournamentSeries | undefined>;
  readonly metricsAllTime: AsyncItem<TournamentSeriesMetrics | undefined>;
  readonly metrics12M: AsyncItem<TournamentSeriesMetrics | undefined>;
  readonly metrics6M: AsyncItem<TournamentSeriesMetrics | undefined>;
  readonly metrics3M: AsyncItem<TournamentSeriesMetrics | undefined>;
  readonly metrics1M: AsyncItem<TournamentSeriesMetrics | undefined>;
  readonly events: AsyncCollection<Game>;
  readonly mainEvents: AsyncCollection<Game>;
  readonly topPlayers: AsyncCollection<PlayerSummary>;
  readonly trends?: TrendAnalysis | null;
  readonly recommendations?: (string | null)[] | null;
}

export declare type TournamentSeriesReport = LazyLoading extends LazyLoadingDisabled ? EagerTournamentSeriesReport : LazyTournamentSeriesReport

export declare const TournamentSeriesReport: (new (init: ModelInit<TournamentSeriesReport>) => TournamentSeriesReport)

type EagerSeriesVsRegularComparison = {
  readonly entityId: string;
  readonly timeRange: string;
  readonly seriesMetrics?: EntityMetrics | null;
  readonly seriesCount?: number | null;
  readonly seriesProfit?: number | null;
  readonly seriesAvgEntries?: number | null;
  readonly regularMetrics?: EntityMetrics | null;
  readonly regularCount?: number | null;
  readonly regularProfit?: number | null;
  readonly regularAvgEntries?: number | null;
  readonly profitDifference?: number | null;
  readonly profitDifferencePercent?: number | null;
  readonly avgEntriesDifference?: number | null;
  readonly avgEntriesDifferencePercent?: number | null;
  readonly insights?: (string | null)[] | null;
}

type LazySeriesVsRegularComparison = {
  readonly entityId: string;
  readonly timeRange: string;
  readonly seriesMetrics: AsyncItem<EntityMetrics | undefined>;
  readonly seriesCount?: number | null;
  readonly seriesProfit?: number | null;
  readonly seriesAvgEntries?: number | null;
  readonly regularMetrics: AsyncItem<EntityMetrics | undefined>;
  readonly regularCount?: number | null;
  readonly regularProfit?: number | null;
  readonly regularAvgEntries?: number | null;
  readonly profitDifference?: number | null;
  readonly profitDifferencePercent?: number | null;
  readonly avgEntriesDifference?: number | null;
  readonly avgEntriesDifferencePercent?: number | null;
  readonly insights?: (string | null)[] | null;
}

export declare type SeriesVsRegularComparison = LazyLoading extends LazyLoadingDisabled ? EagerSeriesVsRegularComparison : LazySeriesVsRegularComparison

export declare const SeriesVsRegularComparison: (new (init: ModelInit<SeriesVsRegularComparison>) => SeriesVsRegularComparison)

type EagerTrendAnalysis = {
  readonly period?: string | null;
  readonly direction?: string | null;
  readonly percentChange?: number | null;
  readonly significance?: string | null;
  readonly insights?: (string | null)[] | null;
}

type LazyTrendAnalysis = {
  readonly period?: string | null;
  readonly direction?: string | null;
  readonly percentChange?: number | null;
  readonly significance?: string | null;
  readonly insights?: (string | null)[] | null;
}

export declare type TrendAnalysis = LazyLoading extends LazyLoadingDisabled ? EagerTrendAnalysis : LazyTrendAnalysis

export declare const TrendAnalysis: (new (init: ModelInit<TrendAnalysis>) => TrendAnalysis)

type EagerScraperControlResponse = {
  readonly success: boolean;
  readonly message?: string | null;
  readonly state?: ScraperStateData | null;
  readonly results?: ScraperResults | null;
}

type LazyScraperControlResponse = {
  readonly success: boolean;
  readonly message?: string | null;
  readonly state?: ScraperStateData | null;
  readonly results?: ScraperResults | null;
}

export declare type ScraperControlResponse = LazyLoading extends LazyLoadingDisabled ? EagerScraperControlResponse : LazyScraperControlResponse

export declare const ScraperControlResponse: (new (init: ModelInit<ScraperControlResponse>) => ScraperControlResponse)

type EagerScraperStateData = {
  readonly id: string;
  readonly isRunning: boolean;
  readonly lastScannedId: number;
  readonly lastRunStartTime?: string | null;
  readonly lastRunEndTime?: string | null;
  readonly consecutiveBlankCount: number;
  readonly totalScraped: number;
  readonly totalErrors: number;
  readonly enabled: boolean;
  readonly currentLog?: (ScraperLogData | null)[] | null;
  readonly lastGamesProcessed?: (ScrapedGameStatus | null)[] | null;
  readonly entityId?: string | null;
}

type LazyScraperStateData = {
  readonly id: string;
  readonly isRunning: boolean;
  readonly lastScannedId: number;
  readonly lastRunStartTime?: string | null;
  readonly lastRunEndTime?: string | null;
  readonly consecutiveBlankCount: number;
  readonly totalScraped: number;
  readonly totalErrors: number;
  readonly enabled: boolean;
  readonly currentLog?: (ScraperLogData | null)[] | null;
  readonly lastGamesProcessed?: (ScrapedGameStatus | null)[] | null;
  readonly entityId?: string | null;
}

export declare type ScraperStateData = LazyLoading extends LazyLoadingDisabled ? EagerScraperStateData : LazyScraperStateData

export declare const ScraperStateData: (new (init: ModelInit<ScraperStateData>) => ScraperStateData)

type EagerScraperResults = {
  readonly newGamesScraped: number;
  readonly gamesUpdated: number;
  readonly errors: number;
  readonly blanks: number;
}

type LazyScraperResults = {
  readonly newGamesScraped: number;
  readonly gamesUpdated: number;
  readonly errors: number;
  readonly blanks: number;
}

export declare type ScraperResults = LazyLoading extends LazyLoadingDisabled ? EagerScraperResults : LazyScraperResults

export declare const ScraperResults: (new (init: ModelInit<ScraperResults>) => ScraperResults)

type EagerScraperLogData = {
  readonly timestamp: string;
  readonly level: string;
  readonly message: string;
  readonly details?: string | null;
}

type LazyScraperLogData = {
  readonly timestamp: string;
  readonly level: string;
  readonly message: string;
  readonly details?: string | null;
}

export declare type ScraperLogData = LazyLoading extends LazyLoadingDisabled ? EagerScraperLogData : LazyScraperLogData

export declare const ScraperLogData: (new (init: ModelInit<ScraperLogData>) => ScraperLogData)

type EagerScrapedGameStatus = {
  readonly id: number;
  readonly name: string;
  readonly status: string;
}

type LazyScrapedGameStatus = {
  readonly id: number;
  readonly name: string;
  readonly status: string;
}

export declare type ScrapedGameStatus = LazyLoading extends LazyLoadingDisabled ? EagerScrapedGameStatus : LazyScrapedGameStatus

export declare const ScrapedGameStatus: (new (init: ModelInit<ScrapedGameStatus>) => ScrapedGameStatus)

type EagerScraperJobURLResult = {
  readonly url: string;
  readonly tournamentId: number;
  readonly status: ScrapeAttemptStatus | keyof typeof ScrapeAttemptStatus;
  readonly gameName?: string | null;
  readonly processingTime?: number | null;
  readonly error?: string | null;
}

type LazyScraperJobURLResult = {
  readonly url: string;
  readonly tournamentId: number;
  readonly status: ScrapeAttemptStatus | keyof typeof ScrapeAttemptStatus;
  readonly gameName?: string | null;
  readonly processingTime?: number | null;
  readonly error?: string | null;
}

export declare type ScraperJobURLResult = LazyLoading extends LazyLoadingDisabled ? EagerScraperJobURLResult : LazyScraperJobURLResult

export declare const ScraperJobURLResult: (new (init: ModelInit<ScraperJobURLResult>) => ScraperJobURLResult)

type EagerScraperMetrics = {
  readonly totalJobs: number;
  readonly successfulJobs: number;
  readonly failedJobs: number;
  readonly averageJobDuration: number;
  readonly totalURLsScraped: number;
  readonly successRate: number;
  readonly topErrors?: ErrorMetric[] | null;
  readonly hourlyActivity?: HourlyMetric[] | null;
  readonly byEntity?: (EntityScraperMetrics | null)[] | null;
}

type LazyScraperMetrics = {
  readonly totalJobs: number;
  readonly successfulJobs: number;
  readonly failedJobs: number;
  readonly averageJobDuration: number;
  readonly totalURLsScraped: number;
  readonly successRate: number;
  readonly topErrors?: ErrorMetric[] | null;
  readonly hourlyActivity?: HourlyMetric[] | null;
  readonly byEntity?: (EntityScraperMetrics | null)[] | null;
}

export declare type ScraperMetrics = LazyLoading extends LazyLoadingDisabled ? EagerScraperMetrics : LazyScraperMetrics

export declare const ScraperMetrics: (new (init: ModelInit<ScraperMetrics>) => ScraperMetrics)

type EagerScrapedGameSummary = {
  readonly id: string;
  readonly name?: string | null;
  readonly gameStatus?: string | null;
  readonly registrationStatus?: string | null;
  readonly gameStartDateTime?: string | null;
  readonly inDatabase?: boolean | null;
  readonly doNotScrape?: boolean | null;
  readonly error?: string | null;
}

type LazyScrapedGameSummary = {
  readonly id: string;
  readonly name?: string | null;
  readonly gameStatus?: string | null;
  readonly registrationStatus?: string | null;
  readonly gameStartDateTime?: string | null;
  readonly inDatabase?: boolean | null;
  readonly doNotScrape?: boolean | null;
  readonly error?: string | null;
}

export declare type ScrapedGameSummary = LazyLoading extends LazyLoadingDisabled ? EagerScrapedGameSummary : LazyScrapedGameSummary

export declare const ScrapedGameSummary: (new (init: ModelInit<ScrapedGameSummary>) => ScrapedGameSummary)

type EagerScrapedGameData = {
  readonly name: string;
  readonly gameStartDateTime?: string | null;
  readonly gameActualStartDateTime?: string | null;
  readonly gameEndDateTime?: string | null;
  readonly gameStatus?: GameStatus | keyof typeof GameStatus | null;
  readonly registrationStatus?: string | null;
  readonly gameType?: GameType | keyof typeof GameType | null;
  readonly gameVariant?: GameVariant | keyof typeof GameVariant | null;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly prizepoolPaid?: number | null;
  readonly prizepoolCalculated?: number | null;
  readonly buyIn?: number | null;
  readonly rake?: number | null;
  readonly startingStack?: number | null;
  readonly hasGuarantee?: boolean | null;
  readonly guaranteeAmount?: number | null;
  readonly totalUniquePlayers?: number | null;
  readonly totalInitialEntries?: number | null;
  readonly totalEntries?: number | null;
  readonly totalRebuys?: number | null;
  readonly totalAddons?: number | null;
  readonly totalDuration?: number | null;
  readonly playersRemaining?: number | null;
  readonly totalChipsInPlay?: number | null;
  readonly averagePlayerStack?: number | null;
  readonly seriesName?: string | null;
  readonly isRegular?: boolean | null;
  readonly isSeries?: boolean | null;
  readonly isSatellite?: boolean | null;
  readonly tournamentSeriesId?: string | null;
  readonly seriesTitleId?: string | null;
  readonly isMainEvent?: boolean | null;
  readonly eventNumber?: number | null;
  readonly dayNumber?: number | null;
  readonly flightLetter?: string | null;
  readonly finalDay?: boolean | null;
  readonly seriesYear?: number | null;
  readonly gameFrequency?: GameFrequency | keyof typeof GameFrequency | null;
  readonly gameTags?: (string | null)[] | null;
  readonly levels?: ScrapedTournamentLevel[] | null;
  readonly breaks?: ScrapedBreak[] | null;
  readonly entries?: ScrapedPlayerEntry[] | null;
  readonly seating?: ScrapedPlayerSeating[] | null;
  readonly results?: ScrapedPlayerResult[] | null;
  readonly tables?: ScrapedTable[] | null;
  readonly rawHtml?: string | null;
  readonly isNewStructure?: boolean | null;
  readonly structureLabel?: string | null;
  readonly foundKeys?: (string | null)[] | null;
  readonly venueMatch?: ScrapedVenueMatch | null;
  readonly existingGameId?: string | null;
  readonly doNotScrape?: boolean | null;
  readonly skipped?: boolean | null;
  readonly skipReason?: string | null;
  readonly tournamentId: number;
  readonly entityId?: string | null;
  readonly sourceUrl?: string | null;
  readonly s3Key?: string | null;
  readonly source?: string | null;
  readonly contentHash?: string | null;
  readonly fetchedAt?: string | null;
  readonly reScrapedAt?: string | null;
  readonly wasForced?: boolean | null;
  readonly totalBuyInsCollected?: number | null;
  readonly rakeRevenue?: number | null;
  readonly prizepoolPlayerContributions?: number | null;
  readonly prizepoolAddedValue?: number | null;
  readonly prizepoolSurplus?: number | null;
  readonly guaranteeOverlayCost?: number | null;
  readonly gameProfit?: number | null;
  readonly venueAssignmentStatus?: VenueAssignmentStatus | keyof typeof VenueAssignmentStatus | null;
  readonly error?: string | null;
  readonly errorMessage?: string | null;
  readonly status?: string | null;
  readonly httpStatus?: number | null;
}

type LazyScrapedGameData = {
  readonly name: string;
  readonly gameStartDateTime?: string | null;
  readonly gameActualStartDateTime?: string | null;
  readonly gameEndDateTime?: string | null;
  readonly gameStatus?: GameStatus | keyof typeof GameStatus | null;
  readonly registrationStatus?: string | null;
  readonly gameType?: GameType | keyof typeof GameType | null;
  readonly gameVariant?: GameVariant | keyof typeof GameVariant | null;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly prizepoolPaid?: number | null;
  readonly prizepoolCalculated?: number | null;
  readonly buyIn?: number | null;
  readonly rake?: number | null;
  readonly startingStack?: number | null;
  readonly hasGuarantee?: boolean | null;
  readonly guaranteeAmount?: number | null;
  readonly totalUniquePlayers?: number | null;
  readonly totalInitialEntries?: number | null;
  readonly totalEntries?: number | null;
  readonly totalRebuys?: number | null;
  readonly totalAddons?: number | null;
  readonly totalDuration?: number | null;
  readonly playersRemaining?: number | null;
  readonly totalChipsInPlay?: number | null;
  readonly averagePlayerStack?: number | null;
  readonly seriesName?: string | null;
  readonly isRegular?: boolean | null;
  readonly isSeries?: boolean | null;
  readonly isSatellite?: boolean | null;
  readonly tournamentSeriesId?: string | null;
  readonly seriesTitleId?: string | null;
  readonly isMainEvent?: boolean | null;
  readonly eventNumber?: number | null;
  readonly dayNumber?: number | null;
  readonly flightLetter?: string | null;
  readonly finalDay?: boolean | null;
  readonly seriesYear?: number | null;
  readonly gameFrequency?: GameFrequency | keyof typeof GameFrequency | null;
  readonly gameTags?: (string | null)[] | null;
  readonly levels?: ScrapedTournamentLevel[] | null;
  readonly breaks?: ScrapedBreak[] | null;
  readonly entries?: ScrapedPlayerEntry[] | null;
  readonly seating?: ScrapedPlayerSeating[] | null;
  readonly results?: ScrapedPlayerResult[] | null;
  readonly tables?: ScrapedTable[] | null;
  readonly rawHtml?: string | null;
  readonly isNewStructure?: boolean | null;
  readonly structureLabel?: string | null;
  readonly foundKeys?: (string | null)[] | null;
  readonly venueMatch?: ScrapedVenueMatch | null;
  readonly existingGameId?: string | null;
  readonly doNotScrape?: boolean | null;
  readonly skipped?: boolean | null;
  readonly skipReason?: string | null;
  readonly tournamentId: number;
  readonly entityId?: string | null;
  readonly sourceUrl?: string | null;
  readonly s3Key?: string | null;
  readonly source?: string | null;
  readonly contentHash?: string | null;
  readonly fetchedAt?: string | null;
  readonly reScrapedAt?: string | null;
  readonly wasForced?: boolean | null;
  readonly totalBuyInsCollected?: number | null;
  readonly rakeRevenue?: number | null;
  readonly prizepoolPlayerContributions?: number | null;
  readonly prizepoolAddedValue?: number | null;
  readonly prizepoolSurplus?: number | null;
  readonly guaranteeOverlayCost?: number | null;
  readonly gameProfit?: number | null;
  readonly venueAssignmentStatus?: VenueAssignmentStatus | keyof typeof VenueAssignmentStatus | null;
  readonly error?: string | null;
  readonly errorMessage?: string | null;
  readonly status?: string | null;
  readonly httpStatus?: number | null;
}

export declare type ScrapedGameData = LazyLoading extends LazyLoadingDisabled ? EagerScrapedGameData : LazyScrapedGameData

export declare const ScrapedGameData: (new (init: ModelInit<ScrapedGameData>) => ScrapedGameData)

type EagerScrapedTournamentLevel = {
  readonly levelNumber: number;
  readonly durationMinutes?: number | null;
  readonly smallBlind?: number | null;
  readonly bigBlind?: number | null;
  readonly ante?: number | null;
}

type LazyScrapedTournamentLevel = {
  readonly levelNumber: number;
  readonly durationMinutes?: number | null;
  readonly smallBlind?: number | null;
  readonly bigBlind?: number | null;
  readonly ante?: number | null;
}

export declare type ScrapedTournamentLevel = LazyLoading extends LazyLoadingDisabled ? EagerScrapedTournamentLevel : LazyScrapedTournamentLevel

export declare const ScrapedTournamentLevel: (new (init: ModelInit<ScrapedTournamentLevel>) => ScrapedTournamentLevel)

type EagerScrapedBreak = {
  readonly levelNumberBeforeBreak: number;
  readonly durationMinutes?: number | null;
}

type LazyScrapedBreak = {
  readonly levelNumberBeforeBreak: number;
  readonly durationMinutes?: number | null;
}

export declare type ScrapedBreak = LazyLoading extends LazyLoadingDisabled ? EagerScrapedBreak : LazyScrapedBreak

export declare const ScrapedBreak: (new (init: ModelInit<ScrapedBreak>) => ScrapedBreak)

type EagerScrapedPlayerEntry = {
  readonly name: string;
}

type LazyScrapedPlayerEntry = {
  readonly name: string;
}

export declare type ScrapedPlayerEntry = LazyLoading extends LazyLoadingDisabled ? EagerScrapedPlayerEntry : LazyScrapedPlayerEntry

export declare const ScrapedPlayerEntry: (new (init: ModelInit<ScrapedPlayerEntry>) => ScrapedPlayerEntry)

type EagerScrapedPlayerSeating = {
  readonly name: string;
  readonly table?: number | null;
  readonly seat?: number | null;
  readonly playerStack?: number | null;
}

type LazyScrapedPlayerSeating = {
  readonly name: string;
  readonly table?: number | null;
  readonly seat?: number | null;
  readonly playerStack?: number | null;
}

export declare type ScrapedPlayerSeating = LazyLoading extends LazyLoadingDisabled ? EagerScrapedPlayerSeating : LazyScrapedPlayerSeating

export declare const ScrapedPlayerSeating: (new (init: ModelInit<ScrapedPlayerSeating>) => ScrapedPlayerSeating)

type EagerScrapedPlayerResult = {
  readonly rank: number;
  readonly name: string;
  readonly winnings?: number | null;
  readonly points?: number | null;
  readonly isQualification?: boolean | null;
}

type LazyScrapedPlayerResult = {
  readonly rank: number;
  readonly name: string;
  readonly winnings?: number | null;
  readonly points?: number | null;
  readonly isQualification?: boolean | null;
}

export declare type ScrapedPlayerResult = LazyLoading extends LazyLoadingDisabled ? EagerScrapedPlayerResult : LazyScrapedPlayerResult

export declare const ScrapedPlayerResult: (new (init: ModelInit<ScrapedPlayerResult>) => ScrapedPlayerResult)

type EagerScrapedTable = {
  readonly tableName: string;
  readonly seats?: ScrapedTableSeatData[] | null;
}

type LazyScrapedTable = {
  readonly tableName: string;
  readonly seats?: ScrapedTableSeatData[] | null;
}

export declare type ScrapedTable = LazyLoading extends LazyLoadingDisabled ? EagerScrapedTable : LazyScrapedTable

export declare const ScrapedTable: (new (init: ModelInit<ScrapedTable>) => ScrapedTable)

type EagerScrapedTableSeatData = {
  readonly seat: number;
  readonly isOccupied: boolean;
  readonly playerName?: string | null;
  readonly playerStack?: number | null;
}

type LazyScrapedTableSeatData = {
  readonly seat: number;
  readonly isOccupied: boolean;
  readonly playerName?: string | null;
  readonly playerStack?: number | null;
}

export declare type ScrapedTableSeatData = LazyLoading extends LazyLoadingDisabled ? EagerScrapedTableSeatData : LazyScrapedTableSeatData

export declare const ScrapedTableSeatData: (new (init: ModelInit<ScrapedTableSeatData>) => ScrapedTableSeatData)

type EagerScrapedVenueMatch = {
  readonly autoAssignedVenue?: ScrapedVenueMatchDetails | null;
  readonly suggestions?: ScrapedVenueMatchDetails[] | null;
}

type LazyScrapedVenueMatch = {
  readonly autoAssignedVenue?: ScrapedVenueMatchDetails | null;
  readonly suggestions?: ScrapedVenueMatchDetails[] | null;
}

export declare type ScrapedVenueMatch = LazyLoading extends LazyLoadingDisabled ? EagerScrapedVenueMatch : LazyScrapedVenueMatch

export declare const ScrapedVenueMatch: (new (init: ModelInit<ScrapedVenueMatch>) => ScrapedVenueMatch)

type EagerScrapedVenueMatchDetails = {
  readonly id: string;
  readonly name: string;
  readonly score: number;
}

type LazyScrapedVenueMatchDetails = {
  readonly id: string;
  readonly name: string;
  readonly score: number;
}

export declare type ScrapedVenueMatchDetails = LazyLoading extends LazyLoadingDisabled ? EagerScrapedVenueMatchDetails : LazyScrapedVenueMatchDetails

export declare const ScrapedVenueMatchDetails: (new (init: ModelInit<ScrapedVenueMatchDetails>) => ScrapedVenueMatchDetails)

type EagerScraperJobsReport = {
  readonly items?: (ScraperJob | null)[] | null;
  readonly nextToken?: string | null;
  readonly totalCount?: number | null;
  readonly entitySummary?: (EntityJobSummary | null)[] | null;
}

type LazyScraperJobsReport = {
  readonly items: AsyncCollection<ScraperJob>;
  readonly nextToken?: string | null;
  readonly totalCount?: number | null;
  readonly entitySummary?: (EntityJobSummary | null)[] | null;
}

export declare type ScraperJobsReport = LazyLoading extends LazyLoadingDisabled ? EagerScraperJobsReport : LazyScraperJobsReport

export declare const ScraperJobsReport: (new (init: ModelInit<ScraperJobsReport>) => ScraperJobsReport)

type EagerGapRange = {
  readonly start: number;
  readonly end: number;
  readonly count: number;
}

type LazyGapRange = {
  readonly start: number;
  readonly end: number;
  readonly count: number;
}

export declare type GapRange = LazyLoading extends LazyLoadingDisabled ? EagerGapRange : LazyGapRange

export declare const GapRange: (new (init: ModelInit<GapRange>) => GapRange)

type EagerGapSummary = {
  readonly totalGaps: number;
  readonly totalMissingIds: number;
  readonly largestGapStart?: number | null;
  readonly largestGapEnd?: number | null;
  readonly largestGapCount?: number | null;
  readonly coveragePercentage: number;
}

type LazyGapSummary = {
  readonly totalGaps: number;
  readonly totalMissingIds: number;
  readonly largestGapStart?: number | null;
  readonly largestGapEnd?: number | null;
  readonly largestGapCount?: number | null;
  readonly coveragePercentage: number;
}

export declare type GapSummary = LazyLoading extends LazyLoadingDisabled ? EagerGapSummary : LazyGapSummary

export declare const GapSummary: (new (init: ModelInit<GapSummary>) => GapSummary)

type EagerS3VersionHistory = {
  readonly s3Key: string;
  readonly scrapedAt: string;
  readonly contentHash?: string | null;
  readonly uploadedBy?: string | null;
  readonly contentSize?: number | null;
}

type LazyS3VersionHistory = {
  readonly s3Key: string;
  readonly scrapedAt: string;
  readonly contentHash?: string | null;
  readonly uploadedBy?: string | null;
  readonly contentSize?: number | null;
}

export declare type S3VersionHistory = LazyLoading extends LazyLoadingDisabled ? EagerS3VersionHistory : LazyS3VersionHistory

export declare const S3VersionHistory: (new (init: ModelInit<S3VersionHistory>) => S3VersionHistory)

type EagerCachingStatsResponse = {
  readonly totalURLs: number;
  readonly urlsWithETags: number;
  readonly urlsWithLastModified: number;
  readonly totalCacheHits: number;
  readonly totalCacheMisses: number;
  readonly averageCacheHitRate: number;
  readonly storageUsedMB: number;
  readonly recentCacheActivity?: CacheActivityLog[] | null;
}

type LazyCachingStatsResponse = {
  readonly totalURLs: number;
  readonly urlsWithETags: number;
  readonly urlsWithLastModified: number;
  readonly totalCacheHits: number;
  readonly totalCacheMisses: number;
  readonly averageCacheHitRate: number;
  readonly storageUsedMB: number;
  readonly recentCacheActivity?: CacheActivityLog[] | null;
}

export declare type CachingStatsResponse = LazyLoading extends LazyLoadingDisabled ? EagerCachingStatsResponse : LazyCachingStatsResponse

export declare const CachingStatsResponse: (new (init: ModelInit<CachingStatsResponse>) => CachingStatsResponse)

type EagerS3ContentResponse = {
  readonly s3Key: string;
  readonly html: string;
  readonly metadata?: string | null;
  readonly size?: number | null;
  readonly lastModified?: string | null;
}

type LazyS3ContentResponse = {
  readonly s3Key: string;
  readonly html: string;
  readonly metadata?: string | null;
  readonly size?: number | null;
  readonly lastModified?: string | null;
}

export declare type S3ContentResponse = LazyLoading extends LazyLoadingDisabled ? EagerS3ContentResponse : LazyS3ContentResponse

export declare const S3ContentResponse: (new (init: ModelInit<S3ContentResponse>) => S3ContentResponse)

type EagerS3StorageHistoryResponse = {
  readonly items?: (S3Storage | null)[] | null;
  readonly nextToken?: string | null;
}

type LazyS3StorageHistoryResponse = {
  readonly items: AsyncCollection<S3Storage>;
  readonly nextToken?: string | null;
}

export declare type S3StorageHistoryResponse = LazyLoading extends LazyLoadingDisabled ? EagerS3StorageHistoryResponse : LazyS3StorageHistoryResponse

export declare const S3StorageHistoryResponse: (new (init: ModelInit<S3StorageHistoryResponse>) => S3StorageHistoryResponse)

type EagerS3StorageListResponse = {
  readonly items?: (S3Storage | null)[] | null;
  readonly nextToken?: string | null;
}

type LazyS3StorageListResponse = {
  readonly items: AsyncCollection<S3Storage>;
  readonly nextToken?: string | null;
}

export declare type S3StorageListResponse = LazyLoading extends LazyLoadingDisabled ? EagerS3StorageListResponse : LazyS3StorageListResponse

export declare const S3StorageListResponse: (new (init: ModelInit<S3StorageListResponse>) => S3StorageListResponse)

type EagerS3StorageConnection = {
  readonly items: S3Storage[];
  readonly nextToken?: string | null;
}

type LazyS3StorageConnection = {
  readonly items: AsyncCollection<S3Storage>;
  readonly nextToken?: string | null;
}

export declare type S3StorageConnection = LazyLoading extends LazyLoadingDisabled ? EagerS3StorageConnection : LazyS3StorageConnection

export declare const S3StorageConnection: (new (init: ModelInit<S3StorageConnection>) => S3StorageConnection)

type EagerScraperJobConnection = {
  readonly items?: ScraperJob[] | null;
  readonly nextToken?: string | null;
}

type LazyScraperJobConnection = {
  readonly items: AsyncCollection<ScraperJob>;
  readonly nextToken?: string | null;
}

export declare type ScraperJobConnection = LazyLoading extends LazyLoadingDisabled ? EagerScraperJobConnection : LazyScraperJobConnection

export declare const ScraperJobConnection: (new (init: ModelInit<ScraperJobConnection>) => ScraperJobConnection)

type EagerScrapeURLConnection = {
  readonly items?: (ScrapeURL | null)[] | null;
  readonly nextToken?: string | null;
  readonly totalCount?: number | null;
}

type LazyScrapeURLConnection = {
  readonly items: AsyncCollection<ScrapeURL>;
  readonly nextToken?: string | null;
  readonly totalCount?: number | null;
}

export declare type ScrapeURLConnection = LazyLoading extends LazyLoadingDisabled ? EagerScrapeURLConnection : LazyScrapeURLConnection

export declare const ScrapeURLConnection: (new (init: ModelInit<ScrapeURLConnection>) => ScrapeURLConnection)

type EagerGameProcessedEvent = {
  readonly jobId: string;
  readonly entityId: string;
  readonly tournamentId: number;
  readonly url?: string | null;
  readonly action: GameProcessedAction | keyof typeof GameProcessedAction;
  readonly message?: string | null;
  readonly errorMessage?: string | null;
  readonly processedAt: string;
  readonly durationMs?: number | null;
  readonly dataSource?: string | null;
  readonly s3Key?: string | null;
  readonly gameData?: GameProcessedData | null;
  readonly saveResult?: GameSaveResult | null;
}

type LazyGameProcessedEvent = {
  readonly jobId: string;
  readonly entityId: string;
  readonly tournamentId: number;
  readonly url?: string | null;
  readonly action: GameProcessedAction | keyof typeof GameProcessedAction;
  readonly message?: string | null;
  readonly errorMessage?: string | null;
  readonly processedAt: string;
  readonly durationMs?: number | null;
  readonly dataSource?: string | null;
  readonly s3Key?: string | null;
  readonly gameData?: GameProcessedData | null;
  readonly saveResult?: GameSaveResult | null;
}

export declare type GameProcessedEvent = LazyLoading extends LazyLoadingDisabled ? EagerGameProcessedEvent : LazyGameProcessedEvent

export declare const GameProcessedEvent: (new (init: ModelInit<GameProcessedEvent>) => GameProcessedEvent)

type EagerGameProcessedData = {
  readonly name?: string | null;
  readonly gameStatus?: string | null;
  readonly registrationStatus?: string | null;
  readonly gameStartDateTime?: string | null;
  readonly gameEndDateTime?: string | null;
  readonly buyIn?: number | null;
  readonly rake?: number | null;
  readonly guaranteeAmount?: number | null;
  readonly prizepoolPaid?: number | null;
  readonly totalEntries?: number | null;
  readonly totalUniquePlayers?: number | null;
  readonly totalRebuys?: number | null;
  readonly totalAddons?: number | null;
  readonly gameType?: string | null;
  readonly gameVariant?: string | null;
  readonly tournamentType?: string | null;
  readonly gameTags?: (string | null)[] | null;
  readonly venueId?: string | null;
  readonly venueName?: string | null;
  readonly doNotScrape?: boolean | null;
  readonly existingGameId?: string | null;
}

type LazyGameProcessedData = {
  readonly name?: string | null;
  readonly gameStatus?: string | null;
  readonly registrationStatus?: string | null;
  readonly gameStartDateTime?: string | null;
  readonly gameEndDateTime?: string | null;
  readonly buyIn?: number | null;
  readonly rake?: number | null;
  readonly guaranteeAmount?: number | null;
  readonly prizepoolPaid?: number | null;
  readonly totalEntries?: number | null;
  readonly totalUniquePlayers?: number | null;
  readonly totalRebuys?: number | null;
  readonly totalAddons?: number | null;
  readonly gameType?: string | null;
  readonly gameVariant?: string | null;
  readonly tournamentType?: string | null;
  readonly gameTags?: (string | null)[] | null;
  readonly venueId?: string | null;
  readonly venueName?: string | null;
  readonly doNotScrape?: boolean | null;
  readonly existingGameId?: string | null;
}

export declare type GameProcessedData = LazyLoading extends LazyLoadingDisabled ? EagerGameProcessedData : LazyGameProcessedData

export declare const GameProcessedData: (new (init: ModelInit<GameProcessedData>) => GameProcessedData)

type EagerGameSaveResult = {
  readonly success: boolean;
  readonly gameId?: string | null;
  readonly action?: string | null;
  readonly message?: string | null;
}

type LazyGameSaveResult = {
  readonly success: boolean;
  readonly gameId?: string | null;
  readonly action?: string | null;
  readonly message?: string | null;
}

export declare type GameSaveResult = LazyLoading extends LazyLoadingDisabled ? EagerGameSaveResult : LazyGameSaveResult

export declare const GameSaveResult: (new (init: ModelInit<GameSaveResult>) => GameSaveResult)

type EagerSyncActiveGameResult = {
  readonly success: boolean;
  readonly action: string;
  readonly activeGameId?: string | null;
  readonly gameStatus?: GameStatus | keyof typeof GameStatus | null;
  readonly message?: string | null;
}

type LazySyncActiveGameResult = {
  readonly success: boolean;
  readonly action: string;
  readonly activeGameId?: string | null;
  readonly gameStatus?: GameStatus | keyof typeof GameStatus | null;
  readonly message?: string | null;
}

export declare type SyncActiveGameResult = LazyLoading extends LazyLoadingDisabled ? EagerSyncActiveGameResult : LazySyncActiveGameResult

export declare const SyncActiveGameResult: (new (init: ModelInit<SyncActiveGameResult>) => SyncActiveGameResult)

type EagerRefreshRunningGamesResult = {
  readonly success: boolean;
  readonly gamesRefreshed: number;
  readonly gamesUpdated: number;
  readonly gamesFailed: number;
  readonly errors?: (string | null)[] | null;
  readonly executionTimeMs?: number | null;
}

type LazyRefreshRunningGamesResult = {
  readonly success: boolean;
  readonly gamesRefreshed: number;
  readonly gamesUpdated: number;
  readonly gamesFailed: number;
  readonly errors?: (string | null)[] | null;
  readonly executionTimeMs?: number | null;
}

export declare type RefreshRunningGamesResult = LazyLoading extends LazyLoadingDisabled ? EagerRefreshRunningGamesResult : LazyRefreshRunningGamesResult

export declare const RefreshRunningGamesResult: (new (init: ModelInit<RefreshRunningGamesResult>) => RefreshRunningGamesResult)

type EagerDashboardData = {
  readonly runningCount: number;
  readonly registeringCount: number;
  readonly clockStoppedCount: number;
  readonly finishedLast7dCount: number;
  readonly upcomingCount: number;
  readonly totalPrizepoolLast7d?: number | null;
  readonly runningGames?: (ActiveGame | null)[] | null;
  readonly registeringGames?: (ActiveGame | null)[] | null;
  readonly clockStoppedGames?: (ActiveGame | null)[] | null;
  readonly recentlyFinishedGames?: (RecentlyFinishedGame | null)[] | null;
  readonly upcomingGames?: (UpcomingGame | null)[] | null;
  readonly cachedAt?: string | null;
  readonly dataFreshness?: string | null;
}

type LazyDashboardData = {
  readonly runningCount: number;
  readonly registeringCount: number;
  readonly clockStoppedCount: number;
  readonly finishedLast7dCount: number;
  readonly upcomingCount: number;
  readonly totalPrizepoolLast7d?: number | null;
  readonly runningGames: AsyncCollection<ActiveGame>;
  readonly registeringGames: AsyncCollection<ActiveGame>;
  readonly clockStoppedGames: AsyncCollection<ActiveGame>;
  readonly recentlyFinishedGames: AsyncCollection<RecentlyFinishedGame>;
  readonly upcomingGames: AsyncCollection<UpcomingGame>;
  readonly cachedAt?: string | null;
  readonly dataFreshness?: string | null;
}

export declare type DashboardData = LazyLoading extends LazyLoadingDisabled ? EagerDashboardData : LazyDashboardData

export declare const DashboardData: (new (init: ModelInit<DashboardData>) => DashboardData)

type EagerJobProgressEvent = {
  readonly jobId: string;
  readonly entityId: string;
  readonly status: string;
  readonly stopReason?: string | null;
  readonly totalURLsProcessed: number;
  readonly newGamesScraped: number;
  readonly gamesUpdated: number;
  readonly gamesSkipped: number;
  readonly errors: number;
  readonly blanks: number;
  readonly currentId?: number | null;
  readonly startId?: number | null;
  readonly endId?: number | null;
  readonly startTime?: string | null;
  readonly durationSeconds: number;
  readonly successRate?: number | null;
  readonly averageScrapingTime?: number | null;
  readonly s3CacheHits?: number | null;
  readonly consecutiveNotFound?: number | null;
  readonly consecutiveErrors?: number | null;
  readonly consecutiveBlanks?: number | null;
  readonly lastErrorMessage?: string | null;
  readonly publishedAt: string;
}

type LazyJobProgressEvent = {
  readonly jobId: string;
  readonly entityId: string;
  readonly status: string;
  readonly stopReason?: string | null;
  readonly totalURLsProcessed: number;
  readonly newGamesScraped: number;
  readonly gamesUpdated: number;
  readonly gamesSkipped: number;
  readonly errors: number;
  readonly blanks: number;
  readonly currentId?: number | null;
  readonly startId?: number | null;
  readonly endId?: number | null;
  readonly startTime?: string | null;
  readonly durationSeconds: number;
  readonly successRate?: number | null;
  readonly averageScrapingTime?: number | null;
  readonly s3CacheHits?: number | null;
  readonly consecutiveNotFound?: number | null;
  readonly consecutiveErrors?: number | null;
  readonly consecutiveBlanks?: number | null;
  readonly lastErrorMessage?: string | null;
  readonly publishedAt: string;
}

export declare type JobProgressEvent = LazyLoading extends LazyLoadingDisabled ? EagerJobProgressEvent : LazyJobProgressEvent

export declare const JobProgressEvent: (new (init: ModelInit<JobProgressEvent>) => JobProgressEvent)

type EagerSocialFeedConnection = {
  readonly items: SocialPost[];
  readonly nextToken?: string | null;
  readonly totalCount?: number | null;
}

type LazySocialFeedConnection = {
  readonly items: AsyncCollection<SocialPost>;
  readonly nextToken?: string | null;
  readonly totalCount?: number | null;
}

export declare type SocialFeedConnection = LazyLoading extends LazyLoadingDisabled ? EagerSocialFeedConnection : LazySocialFeedConnection

export declare const SocialFeedConnection: (new (init: ModelInit<SocialFeedConnection>) => SocialFeedConnection)

type EagerSocialPostConnection = {
  readonly items: SocialPost[];
  readonly nextToken?: string | null;
}

type LazySocialPostConnection = {
  readonly items: AsyncCollection<SocialPost>;
  readonly nextToken?: string | null;
}

export declare type SocialPostConnection = LazyLoading extends LazyLoadingDisabled ? EagerSocialPostConnection : LazySocialPostConnection

export declare const SocialPostConnection: (new (init: ModelInit<SocialPostConnection>) => SocialPostConnection)

type EagerSocialAccountConnection = {
  readonly items: SocialAccount[];
  readonly nextToken?: string | null;
}

type LazySocialAccountConnection = {
  readonly items: AsyncCollection<SocialAccount>;
  readonly nextToken?: string | null;
}

export declare type SocialAccountConnection = LazyLoading extends LazyLoadingDisabled ? EagerSocialAccountConnection : LazySocialAccountConnection

export declare const SocialAccountConnection: (new (init: ModelInit<SocialAccountConnection>) => SocialAccountConnection)

type EagerSocialAccountMetrics = {
  readonly accountId: string;
  readonly totalPosts: number;
  readonly totalEngagement: number;
  readonly avgLikesPerPost?: number | null;
  readonly avgCommentsPerPost?: number | null;
  readonly avgSharesPerPost?: number | null;
  readonly postsThisPeriod?: number | null;
  readonly engagementGrowth?: number | null;
  readonly topPerformingPosts?: SocialPost[] | null;
}

type LazySocialAccountMetrics = {
  readonly accountId: string;
  readonly totalPosts: number;
  readonly totalEngagement: number;
  readonly avgLikesPerPost?: number | null;
  readonly avgCommentsPerPost?: number | null;
  readonly avgSharesPerPost?: number | null;
  readonly postsThisPeriod?: number | null;
  readonly engagementGrowth?: number | null;
  readonly topPerformingPosts: AsyncCollection<SocialPost>;
}

export declare type SocialAccountMetrics = LazyLoading extends LazyLoadingDisabled ? EagerSocialAccountMetrics : LazySocialAccountMetrics

export declare const SocialAccountMetrics: (new (init: ModelInit<SocialAccountMetrics>) => SocialAccountMetrics)

type EagerSocialScrapeResult = {
  readonly success: boolean;
  readonly message?: string | null;
  readonly postsFound?: number | null;
  readonly newPostsAdded?: number | null;
  readonly postsProcessed?: number | null;
  readonly rateLimited?: boolean | null;
  readonly timeout?: boolean | null;
  readonly oldestPostDate?: string | null;
  readonly attemptId?: string | null;
}

type LazySocialScrapeResult = {
  readonly success: boolean;
  readonly message?: string | null;
  readonly postsFound?: number | null;
  readonly newPostsAdded?: number | null;
  readonly postsProcessed?: number | null;
  readonly rateLimited?: boolean | null;
  readonly timeout?: boolean | null;
  readonly oldestPostDate?: string | null;
  readonly attemptId?: string | null;
}

export declare type SocialScrapeResult = LazyLoading extends LazyLoadingDisabled ? EagerSocialScrapeResult : LazySocialScrapeResult

export declare const SocialScrapeResult: (new (init: ModelInit<SocialScrapeResult>) => SocialScrapeResult)

type EagerSyncPageInfoResult = {
  readonly success: boolean;
  readonly message?: string | null;
  readonly logoUrl?: string | null;
}

type LazySyncPageInfoResult = {
  readonly success: boolean;
  readonly message?: string | null;
  readonly logoUrl?: string | null;
}

export declare type SyncPageInfoResult = LazyLoading extends LazyLoadingDisabled ? EagerSyncPageInfoResult : LazySyncPageInfoResult

export declare const SyncPageInfoResult: (new (init: ModelInit<SyncPageInfoResult>) => SyncPageInfoResult)

type EagerSocialSyncEvent = {
  readonly socialAccountId: string;
  readonly status: SyncEventStatus | keyof typeof SyncEventStatus;
  readonly message?: string | null;
  readonly postsFound?: number | null;
  readonly newPostsAdded?: number | null;
  readonly rateLimited?: boolean | null;
  readonly pagesCompleted?: number | null;
  readonly completedAt?: string | null;
}

type LazySocialSyncEvent = {
  readonly socialAccountId: string;
  readonly status: SyncEventStatus | keyof typeof SyncEventStatus;
  readonly message?: string | null;
  readonly postsFound?: number | null;
  readonly newPostsAdded?: number | null;
  readonly rateLimited?: boolean | null;
  readonly pagesCompleted?: number | null;
  readonly completedAt?: string | null;
}

export declare type SocialSyncEvent = LazyLoading extends LazyLoadingDisabled ? EagerSocialSyncEvent : LazySocialSyncEvent

export declare const SocialSyncEvent: (new (init: ModelInit<SocialSyncEvent>) => SocialSyncEvent)

type EagerSocialPostNonCashPrize = {
  readonly prizeType: NonCashPrizeType | keyof typeof NonCashPrizeType;
  readonly description?: string | null;
  readonly estimatedValue?: number | null;
  readonly rawText?: string | null;
  readonly targetTournamentName?: string | null;
  readonly targetTournamentBuyIn?: number | null;
  readonly targetTournamentId?: number | null;
  readonly ticketType?: string | null;
  readonly ticketQuantity?: number | null;
  readonly packageIncludes?: (string | null)[] | null;
  readonly extractionConfidence?: number | null;
}

type LazySocialPostNonCashPrize = {
  readonly prizeType: NonCashPrizeType | keyof typeof NonCashPrizeType;
  readonly description?: string | null;
  readonly estimatedValue?: number | null;
  readonly rawText?: string | null;
  readonly targetTournamentName?: string | null;
  readonly targetTournamentBuyIn?: number | null;
  readonly targetTournamentId?: number | null;
  readonly ticketType?: string | null;
  readonly ticketQuantity?: number | null;
  readonly packageIncludes?: (string | null)[] | null;
  readonly extractionConfidence?: number | null;
}

export declare type SocialPostNonCashPrize = LazyLoading extends LazyLoadingDisabled ? EagerSocialPostNonCashPrize : LazySocialPostNonCashPrize

export declare const SocialPostNonCashPrize: (new (init: ModelInit<SocialPostNonCashPrize>) => SocialPostNonCashPrize)

type EagerProcessSocialPostResult = {
  readonly success: boolean;
  readonly socialPostId?: string | null;
  readonly processingStatus?: SocialPostProcessingStatus | keyof typeof SocialPostProcessingStatus | null;
  readonly error?: string | null;
  readonly warnings?: string[] | null;
  readonly extractedGameData?: SocialPostGameData | null;
  readonly placementsExtracted?: number | null;
  readonly ticketSummary?: TicketExtractionSummary | null;
  readonly matchCandidates?: GameMatchCandidate[] | null;
  readonly primaryMatch?: GameMatchCandidate | null;
  readonly linksCreated?: number | null;
  readonly linksSkipped?: number | null;
  readonly linkDetails?: SocialPostGameLink[] | null;
  readonly reconciliationPreview?: SocialToGameReconciliation | null;
  readonly processingTimeMs?: number | null;
}

type LazyProcessSocialPostResult = {
  readonly success: boolean;
  readonly socialPostId?: string | null;
  readonly processingStatus?: SocialPostProcessingStatus | keyof typeof SocialPostProcessingStatus | null;
  readonly error?: string | null;
  readonly warnings?: string[] | null;
  readonly extractedGameData: AsyncItem<SocialPostGameData | undefined>;
  readonly placementsExtracted?: number | null;
  readonly ticketSummary?: TicketExtractionSummary | null;
  readonly matchCandidates?: GameMatchCandidate[] | null;
  readonly primaryMatch?: GameMatchCandidate | null;
  readonly linksCreated?: number | null;
  readonly linksSkipped?: number | null;
  readonly linkDetails: AsyncCollection<SocialPostGameLink>;
  readonly reconciliationPreview?: SocialToGameReconciliation | null;
  readonly processingTimeMs?: number | null;
}

export declare type ProcessSocialPostResult = LazyLoading extends LazyLoadingDisabled ? EagerProcessSocialPostResult : LazyProcessSocialPostResult

export declare const ProcessSocialPostResult: (new (init: ModelInit<ProcessSocialPostResult>) => ProcessSocialPostResult)

type EagerGameMatchCandidate = {
  readonly gameId: string;
  readonly gameName?: string | null;
  readonly gameDate?: string | null;
  readonly gameStatus?: GameStatus | keyof typeof GameStatus | null;
  readonly venueId?: string | null;
  readonly venueName?: string | null;
  readonly entityId?: string | null;
  readonly buyIn?: number | null;
  readonly guaranteeAmount?: number | null;
  readonly totalEntries?: number | null;
  readonly matchConfidence: number;
  readonly matchReason?: string | null;
  readonly matchSignals?: string | null;
  readonly rank?: number | null;
  readonly isPrimaryMatch?: boolean | null;
  readonly wouldAutoLink?: boolean | null;
  readonly rejectionReason?: string | null;
}

type LazyGameMatchCandidate = {
  readonly gameId: string;
  readonly gameName?: string | null;
  readonly gameDate?: string | null;
  readonly gameStatus?: GameStatus | keyof typeof GameStatus | null;
  readonly venueId?: string | null;
  readonly venueName?: string | null;
  readonly entityId?: string | null;
  readonly buyIn?: number | null;
  readonly guaranteeAmount?: number | null;
  readonly totalEntries?: number | null;
  readonly matchConfidence: number;
  readonly matchReason?: string | null;
  readonly matchSignals?: string | null;
  readonly rank?: number | null;
  readonly isPrimaryMatch?: boolean | null;
  readonly wouldAutoLink?: boolean | null;
  readonly rejectionReason?: string | null;
}

export declare type GameMatchCandidate = LazyLoading extends LazyLoadingDisabled ? EagerGameMatchCandidate : LazyGameMatchCandidate

export declare const GameMatchCandidate: (new (init: ModelInit<GameMatchCandidate>) => GameMatchCandidate)

type EagerProcessBatchResult = {
  readonly success: boolean;
  readonly totalProcessed: number;
  readonly successCount: number;
  readonly failedCount: number;
  readonly skippedCount: number;
  readonly results?: ProcessSocialPostResult[] | null;
  readonly totalLinksCreated?: number | null;
  readonly totalExtractionsDone?: number | null;
  readonly averageConfidence?: number | null;
  readonly totalTicketsExtracted?: number | null;
  readonly totalTicketValue?: number | null;
  readonly processingTimeMs?: number | null;
}

type LazyProcessBatchResult = {
  readonly success: boolean;
  readonly totalProcessed: number;
  readonly successCount: number;
  readonly failedCount: number;
  readonly skippedCount: number;
  readonly results?: ProcessSocialPostResult[] | null;
  readonly totalLinksCreated?: number | null;
  readonly totalExtractionsDone?: number | null;
  readonly averageConfidence?: number | null;
  readonly totalTicketsExtracted?: number | null;
  readonly totalTicketValue?: number | null;
  readonly processingTimeMs?: number | null;
}

export declare type ProcessBatchResult = LazyLoading extends LazyLoadingDisabled ? EagerProcessBatchResult : LazyProcessBatchResult

export declare const ProcessBatchResult: (new (init: ModelInit<ProcessBatchResult>) => ProcessBatchResult)

type EagerSocialPostMatchingStats = {
  readonly totalPosts: number;
  readonly processedPosts: number;
  readonly linkedPosts: number;
  readonly pendingPosts: number;
  readonly failedPosts: number;
  readonly resultPosts: number;
  readonly promotionalPosts: number;
  readonly generalPosts: number;
  readonly autoLinkedCount: number;
  readonly manualLinkedCount: number;
  readonly verifiedCount: number;
  readonly rejectedCount: number;
  readonly averageConfidence?: number | null;
  readonly topMatchReasons?: string | null;
}

type LazySocialPostMatchingStats = {
  readonly totalPosts: number;
  readonly processedPosts: number;
  readonly linkedPosts: number;
  readonly pendingPosts: number;
  readonly failedPosts: number;
  readonly resultPosts: number;
  readonly promotionalPosts: number;
  readonly generalPosts: number;
  readonly autoLinkedCount: number;
  readonly manualLinkedCount: number;
  readonly verifiedCount: number;
  readonly rejectedCount: number;
  readonly averageConfidence?: number | null;
  readonly topMatchReasons?: string | null;
}

export declare type SocialPostMatchingStats = LazyLoading extends LazyLoadingDisabled ? EagerSocialPostMatchingStats : LazySocialPostMatchingStats

export declare const SocialPostMatchingStats: (new (init: ModelInit<SocialPostMatchingStats>) => SocialPostMatchingStats)

type EagerUnlinkedPostsConnection = {
  readonly items: SocialPostWithMatchInfo[];
  readonly nextToken?: string | null;
  readonly totalCount?: number | null;
}

type LazyUnlinkedPostsConnection = {
  readonly items: SocialPostWithMatchInfo[];
  readonly nextToken?: string | null;
  readonly totalCount?: number | null;
}

export declare type UnlinkedPostsConnection = LazyLoading extends LazyLoadingDisabled ? EagerUnlinkedPostsConnection : LazyUnlinkedPostsConnection

export declare const UnlinkedPostsConnection: (new (init: ModelInit<UnlinkedPostsConnection>) => UnlinkedPostsConnection)

type EagerSocialPostWithMatchInfo = {
  readonly socialPost: SocialPost;
  readonly extractedData?: SocialPostGameData | null;
  readonly suggestedMatches?: GameMatchCandidate[] | null;
  readonly bestMatchConfidence?: number | null;
}

type LazySocialPostWithMatchInfo = {
  readonly socialPost: AsyncItem<SocialPost>;
  readonly extractedData: AsyncItem<SocialPostGameData | undefined>;
  readonly suggestedMatches?: GameMatchCandidate[] | null;
  readonly bestMatchConfidence?: number | null;
}

export declare type SocialPostWithMatchInfo = LazyLoading extends LazyLoadingDisabled ? EagerSocialPostWithMatchInfo : LazySocialPostWithMatchInfo

export declare const SocialPostWithMatchInfo: (new (init: ModelInit<SocialPostWithMatchInfo>) => SocialPostWithMatchInfo)

type EagerTicketExtractionSummary = {
  readonly totalPlacements: number;
  readonly placementsWithCash: number;
  readonly placementsWithTickets: number;
  readonly placementsWithBoth: number;
  readonly placementsWithTicketOnly: number;
  readonly totalCashPaid: number;
  readonly totalTicketValue: number;
  readonly totalCombinedValue: number;
  readonly ticketsByType: TicketTypeCount[];
  readonly topPlacements: PlacementPreview[];
}

type LazyTicketExtractionSummary = {
  readonly totalPlacements: number;
  readonly placementsWithCash: number;
  readonly placementsWithTickets: number;
  readonly placementsWithBoth: number;
  readonly placementsWithTicketOnly: number;
  readonly totalCashPaid: number;
  readonly totalTicketValue: number;
  readonly totalCombinedValue: number;
  readonly ticketsByType: TicketTypeCount[];
  readonly topPlacements: PlacementPreview[];
}

export declare type TicketExtractionSummary = LazyLoading extends LazyLoadingDisabled ? EagerTicketExtractionSummary : LazyTicketExtractionSummary

export declare const TicketExtractionSummary: (new (init: ModelInit<TicketExtractionSummary>) => TicketExtractionSummary)

type EagerTicketTypeCount = {
  readonly ticketType: NonCashPrizeType | keyof typeof NonCashPrizeType;
  readonly count: number;
  readonly totalValue?: number | null;
}

type LazyTicketTypeCount = {
  readonly ticketType: NonCashPrizeType | keyof typeof NonCashPrizeType;
  readonly count: number;
  readonly totalValue?: number | null;
}

export declare type TicketTypeCount = LazyLoading extends LazyLoadingDisabled ? EagerTicketTypeCount : LazyTicketTypeCount

export declare const TicketTypeCount: (new (init: ModelInit<TicketTypeCount>) => TicketTypeCount)

type EagerPlacementPreview = {
  readonly place: number;
  readonly playerName: string;
  readonly cashPrize?: number | null;
  readonly ticketType?: NonCashPrizeType | keyof typeof NonCashPrizeType | null;
  readonly ticketValue?: number | null;
  readonly ticketDescription?: string | null;
  readonly totalValue?: number | null;
  readonly rawText?: string | null;
}

type LazyPlacementPreview = {
  readonly place: number;
  readonly playerName: string;
  readonly cashPrize?: number | null;
  readonly ticketType?: NonCashPrizeType | keyof typeof NonCashPrizeType | null;
  readonly ticketValue?: number | null;
  readonly ticketDescription?: string | null;
  readonly totalValue?: number | null;
  readonly rawText?: string | null;
}

export declare type PlacementPreview = LazyLoading extends LazyLoadingDisabled ? EagerPlacementPreview : LazyPlacementPreview

export declare const PlacementPreview: (new (init: ModelInit<PlacementPreview>) => PlacementPreview)

type EagerSocialToGameReconciliation = {
  readonly socialPostId: string;
  readonly socialPostGameDataId?: string | null;
  readonly gameId?: string | null;
  readonly gameName?: string | null;
  readonly gameDate?: string | null;
  readonly social_totalCashPaid?: number | null;
  readonly social_totalTicketCount?: number | null;
  readonly social_totalTicketValue?: number | null;
  readonly social_accumulatorCount?: number | null;
  readonly social_accumulatorValue?: number | null;
  readonly social_totalPlacements?: number | null;
  readonly social_prizepoolTotal?: number | null;
  readonly game_prizepoolPaid?: number | null;
  readonly game_numberOfAccumulatorTicketsPaid?: number | null;
  readonly game_accumulatorTicketValue?: number | null;
  readonly game_totalEntries?: number | null;
  readonly game_hasAccumulatorTickets?: boolean | null;
  readonly cashDifference?: number | null;
  readonly ticketCountDifference?: number | null;
  readonly ticketValueDifference?: number | null;
  readonly hasDiscrepancy: boolean;
  readonly discrepancySeverity?: string | null;
  readonly discrepancyNotes?: (string | null)[] | null;
  readonly suggestedAction?: string | null;
  readonly reconciledAt?: string | null;
  readonly reconciledBy?: string | null;
}

type LazySocialToGameReconciliation = {
  readonly socialPostId: string;
  readonly socialPostGameDataId?: string | null;
  readonly gameId?: string | null;
  readonly gameName?: string | null;
  readonly gameDate?: string | null;
  readonly social_totalCashPaid?: number | null;
  readonly social_totalTicketCount?: number | null;
  readonly social_totalTicketValue?: number | null;
  readonly social_accumulatorCount?: number | null;
  readonly social_accumulatorValue?: number | null;
  readonly social_totalPlacements?: number | null;
  readonly social_prizepoolTotal?: number | null;
  readonly game_prizepoolPaid?: number | null;
  readonly game_numberOfAccumulatorTicketsPaid?: number | null;
  readonly game_accumulatorTicketValue?: number | null;
  readonly game_totalEntries?: number | null;
  readonly game_hasAccumulatorTickets?: boolean | null;
  readonly cashDifference?: number | null;
  readonly ticketCountDifference?: number | null;
  readonly ticketValueDifference?: number | null;
  readonly hasDiscrepancy: boolean;
  readonly discrepancySeverity?: string | null;
  readonly discrepancyNotes?: (string | null)[] | null;
  readonly suggestedAction?: string | null;
  readonly reconciledAt?: string | null;
  readonly reconciledBy?: string | null;
}

export declare type SocialToGameReconciliation = LazyLoading extends LazyLoadingDisabled ? EagerSocialToGameReconciliation : LazySocialToGameReconciliation

export declare const SocialToGameReconciliation: (new (init: ModelInit<SocialToGameReconciliation>) => SocialToGameReconciliation)

type EagerTicketReconciliationReport = {
  readonly totalGamesChecked: number;
  readonly gamesWithSocialData: number;
  readonly gamesWithDiscrepancies: number;
  readonly gamesMatched: number;
  readonly totalCashDifference?: number | null;
  readonly totalTicketCountDifference?: number | null;
  readonly totalTicketValueDifference?: number | null;
  readonly reconciliations: SocialToGameReconciliation[];
  readonly nextToken?: string | null;
}

type LazyTicketReconciliationReport = {
  readonly totalGamesChecked: number;
  readonly gamesWithSocialData: number;
  readonly gamesWithDiscrepancies: number;
  readonly gamesMatched: number;
  readonly totalCashDifference?: number | null;
  readonly totalTicketCountDifference?: number | null;
  readonly totalTicketValueDifference?: number | null;
  readonly reconciliations: SocialToGameReconciliation[];
  readonly nextToken?: string | null;
}

export declare type TicketReconciliationReport = LazyLoading extends LazyLoadingDisabled ? EagerTicketReconciliationReport : LazyTicketReconciliationReport

export declare const TicketReconciliationReport: (new (init: ModelInit<TicketReconciliationReport>) => TicketReconciliationReport)

type EagerReconcileResult = {
  readonly success: boolean;
  readonly socialPostGameDataId?: string | null;
  readonly gameId?: string | null;
  readonly fieldsUpdated?: (string | null)[] | null;
  readonly previousValues?: string | null;
  readonly newValues?: string | null;
  readonly message?: string | null;
  readonly error?: string | null;
}

type LazyReconcileResult = {
  readonly success: boolean;
  readonly socialPostGameDataId?: string | null;
  readonly gameId?: string | null;
  readonly fieldsUpdated?: (string | null)[] | null;
  readonly previousValues?: string | null;
  readonly newValues?: string | null;
  readonly message?: string | null;
  readonly error?: string | null;
}

export declare type ReconcileResult = LazyLoading extends LazyLoadingDisabled ? EagerReconcileResult : LazyReconcileResult

export declare const ReconcileResult: (new (init: ModelInit<ReconcileResult>) => ReconcileResult)

type EagerGameToSocialMatchResult = {
  readonly success: boolean;
  readonly gameId?: string | null;
  readonly gameName?: string | null;
  readonly gameDate?: string | null;
  readonly candidatesFound?: number | null;
  readonly candidatesScored?: number | null;
  readonly linksCreated?: number | null;
  readonly linksSkipped?: number | null;
  readonly existingLinks?: number | null;
  readonly matchedPosts?: SocialPostMatchCandidate[] | null;
  readonly linkDetails?: GameToSocialLinkDetail[] | null;
  readonly matchContext?: GameToSocialMatchContext | null;
  readonly processingTimeMs?: number | null;
  readonly error?: string | null;
}

type LazyGameToSocialMatchResult = {
  readonly success: boolean;
  readonly gameId?: string | null;
  readonly gameName?: string | null;
  readonly gameDate?: string | null;
  readonly candidatesFound?: number | null;
  readonly candidatesScored?: number | null;
  readonly linksCreated?: number | null;
  readonly linksSkipped?: number | null;
  readonly existingLinks?: number | null;
  readonly matchedPosts?: SocialPostMatchCandidate[] | null;
  readonly linkDetails?: GameToSocialLinkDetail[] | null;
  readonly matchContext?: GameToSocialMatchContext | null;
  readonly processingTimeMs?: number | null;
  readonly error?: string | null;
}

export declare type GameToSocialMatchResult = LazyLoading extends LazyLoadingDisabled ? EagerGameToSocialMatchResult : LazyGameToSocialMatchResult

export declare const GameToSocialMatchResult: (new (init: ModelInit<GameToSocialMatchResult>) => GameToSocialMatchResult)

type EagerSocialPostMatchCandidate = {
  readonly socialPostId: string;
  readonly postDate?: string | null;
  readonly contentType?: SocialPostContentType | keyof typeof SocialPostContentType | null;
  readonly extractedBuyIn?: number | null;
  readonly extractedVenueName?: string | null;
  readonly matchConfidence: number;
  readonly matchReason?: string | null;
  readonly matchSignals?: string | null;
  readonly rank?: number | null;
  readonly isPrimaryGame?: boolean | null;
  readonly mentionOrder?: number | null;
  readonly wouldLink?: boolean | null;
}

type LazySocialPostMatchCandidate = {
  readonly socialPostId: string;
  readonly postDate?: string | null;
  readonly contentType?: SocialPostContentType | keyof typeof SocialPostContentType | null;
  readonly extractedBuyIn?: number | null;
  readonly extractedVenueName?: string | null;
  readonly matchConfidence: number;
  readonly matchReason?: string | null;
  readonly matchSignals?: string | null;
  readonly rank?: number | null;
  readonly isPrimaryGame?: boolean | null;
  readonly mentionOrder?: number | null;
  readonly wouldLink?: boolean | null;
}

export declare type SocialPostMatchCandidate = LazyLoading extends LazyLoadingDisabled ? EagerSocialPostMatchCandidate : LazySocialPostMatchCandidate

export declare const SocialPostMatchCandidate: (new (init: ModelInit<SocialPostMatchCandidate>) => SocialPostMatchCandidate)

type EagerGameToSocialLinkDetail = {
  readonly socialPostId: string;
  readonly linkId?: string | null;
  readonly status: string;
  readonly reason?: string | null;
  readonly matchConfidence?: number | null;
  readonly error?: string | null;
}

type LazyGameToSocialLinkDetail = {
  readonly socialPostId: string;
  readonly linkId?: string | null;
  readonly status: string;
  readonly reason?: string | null;
  readonly matchConfidence?: number | null;
  readonly error?: string | null;
}

export declare type GameToSocialLinkDetail = LazyLoading extends LazyLoadingDisabled ? EagerGameToSocialLinkDetail : LazyGameToSocialLinkDetail

export declare const GameToSocialLinkDetail: (new (init: ModelInit<GameToSocialLinkDetail>) => GameToSocialLinkDetail)

type EagerGameToSocialMatchContext = {
  readonly matchMethod?: string | null;
  readonly venueId?: string | null;
  readonly venueName?: string | null;
  readonly searchRange?: DateRange | null;
  readonly candidatesScored?: number | null;
  readonly candidatesAboveMinimum?: number | null;
}

type LazyGameToSocialMatchContext = {
  readonly matchMethod?: string | null;
  readonly venueId?: string | null;
  readonly venueName?: string | null;
  readonly searchRange?: DateRange | null;
  readonly candidatesScored?: number | null;
  readonly candidatesAboveMinimum?: number | null;
}

export declare type GameToSocialMatchContext = LazyLoading extends LazyLoadingDisabled ? EagerGameToSocialMatchContext : LazyGameToSocialMatchContext

export declare const GameToSocialMatchContext: (new (init: ModelInit<GameToSocialMatchContext>) => GameToSocialMatchContext)

type EagerDateRange = {
  readonly searchStart?: string | null;
  readonly searchEnd?: string | null;
}

type LazyDateRange = {
  readonly searchStart?: string | null;
  readonly searchEnd?: string | null;
}

export declare type DateRange = LazyLoading extends LazyLoadingDisabled ? EagerDateRange : LazyDateRange

export declare const DateRange: (new (init: ModelInit<DateRange>) => DateRange)

type EagerBatchGameToSocialMatchResult = {
  readonly totalRequested: number;
  readonly processed: number;
  readonly totalLinksCreated: number;
  readonly totalLinksSkipped: number;
  readonly results?: GameToSocialMatchResult[] | null;
}

type LazyBatchGameToSocialMatchResult = {
  readonly totalRequested: number;
  readonly processed: number;
  readonly totalLinksCreated: number;
  readonly totalLinksSkipped: number;
  readonly results?: GameToSocialMatchResult[] | null;
}

export declare type BatchGameToSocialMatchResult = LazyLoading extends LazyLoadingDisabled ? EagerBatchGameToSocialMatchResult : LazyBatchGameToSocialMatchResult

export declare const BatchGameToSocialMatchResult: (new (init: ModelInit<BatchGameToSocialMatchResult>) => BatchGameToSocialMatchResult)

type EagerUserManagementResponse = {
  readonly success: boolean;
  readonly message?: string | null;
  readonly user?: User | null;
  readonly temporaryPassword?: string | null;
}

type LazyUserManagementResponse = {
  readonly success: boolean;
  readonly message?: string | null;
  readonly user: AsyncItem<User | undefined>;
  readonly temporaryPassword?: string | null;
}

export declare type UserManagementResponse = LazyLoading extends LazyLoadingDisabled ? EagerUserManagementResponse : LazyUserManagementResponse

export declare const UserManagementResponse: (new (init: ModelInit<UserManagementResponse>) => UserManagementResponse)

type EagerUsersConnection = {
  readonly items: User[];
  readonly nextToken?: string | null;
  readonly totalCount?: number | null;
}

type LazyUsersConnection = {
  readonly items: AsyncCollection<User>;
  readonly nextToken?: string | null;
  readonly totalCount?: number | null;
}

export declare type UsersConnection = LazyLoading extends LazyLoadingDisabled ? EagerUsersConnection : LazyUsersConnection

export declare const UsersConnection: (new (init: ModelInit<UsersConnection>) => UsersConnection)

type EagerDetectedMultiDayPattern = {
  readonly isMultiDay: boolean;
  readonly detectionSource?: string | null;
  readonly parsedDayNumber?: number | null;
  readonly parsedFlightLetter?: string | null;
  readonly isFinalDay?: boolean | null;
  readonly derivedParentName: string;
}

type LazyDetectedMultiDayPattern = {
  readonly isMultiDay: boolean;
  readonly detectionSource?: string | null;
  readonly parsedDayNumber?: number | null;
  readonly parsedFlightLetter?: string | null;
  readonly isFinalDay?: boolean | null;
  readonly derivedParentName: string;
}

export declare type DetectedMultiDayPattern = LazyLoading extends LazyLoadingDisabled ? EagerDetectedMultiDayPattern : LazyDetectedMultiDayPattern

export declare const DetectedMultiDayPattern: (new (init: ModelInit<DetectedMultiDayPattern>) => DetectedMultiDayPattern)

type EagerResetPasswordResponse = {
  readonly success: boolean;
  readonly message?: string | null;
  readonly temporaryPassword?: string | null;
}

type LazyResetPasswordResponse = {
  readonly success: boolean;
  readonly message?: string | null;
  readonly temporaryPassword?: string | null;
}

export declare type ResetPasswordResponse = LazyLoading extends LazyLoadingDisabled ? EagerResetPasswordResponse : LazyResetPasswordResponse

export declare const ResetPasswordResponse: (new (init: ModelInit<ResetPasswordResponse>) => ResetPasswordResponse)

type EagerErrorMetric = {
  readonly errorType: string;
  readonly count: number;
  readonly urls?: string[] | null;
}

type LazyErrorMetric = {
  readonly errorType: string;
  readonly count: number;
  readonly urls?: string[] | null;
}

export declare type ErrorMetric = LazyLoading extends LazyLoadingDisabled ? EagerErrorMetric : LazyErrorMetric

export declare const ErrorMetric: (new (init: ModelInit<ErrorMetric>) => ErrorMetric)

type EagerHourlyMetric = {
  readonly hour: string;
  readonly jobCount: number;
  readonly urlsScraped: number;
  readonly successRate: number;
}

type LazyHourlyMetric = {
  readonly hour: string;
  readonly jobCount: number;
  readonly urlsScraped: number;
  readonly successRate: number;
}

export declare type HourlyMetric = LazyLoading extends LazyLoadingDisabled ? EagerHourlyMetric : LazyHourlyMetric

export declare const HourlyMetric: (new (init: ModelInit<HourlyMetric>) => HourlyMetric)

type EagerEntityScraperMetrics = {
  readonly entityId?: string | null;
  readonly entityName: string;
  readonly totalJobs: number;
  readonly successfulJobs: number;
  readonly failedJobs: number;
  readonly totalURLsScraped: number;
}

type LazyEntityScraperMetrics = {
  readonly entityId?: string | null;
  readonly entityName: string;
  readonly totalJobs: number;
  readonly successfulJobs: number;
  readonly failedJobs: number;
  readonly totalURLsScraped: number;
}

export declare type EntityScraperMetrics = LazyLoading extends LazyLoadingDisabled ? EagerEntityScraperMetrics : LazyEntityScraperMetrics

export declare const EntityScraperMetrics: (new (init: ModelInit<EntityScraperMetrics>) => EntityScraperMetrics)

type EagerEntityJobSummary = {
  readonly entityId: string;
  readonly entityName?: string | null;
  readonly totalJobs?: number | null;
  readonly runningJobs?: number | null;
  readonly completedJobs?: number | null;
  readonly failedJobs?: number | null;
}

type LazyEntityJobSummary = {
  readonly entityId: string;
  readonly entityName?: string | null;
  readonly totalJobs?: number | null;
  readonly runningJobs?: number | null;
  readonly completedJobs?: number | null;
  readonly failedJobs?: number | null;
}

export declare type EntityJobSummary = LazyLoading extends LazyLoadingDisabled ? EagerEntityJobSummary : LazyEntityJobSummary

export declare const EntityJobSummary: (new (init: ModelInit<EntityJobSummary>) => EntityJobSummary)

type EagerTournamentIdBounds = {
  readonly entityId: string;
  readonly lowestId?: number | null;
  readonly highestId?: number | null;
  readonly totalCount: number;
  readonly lastUpdated: string;
}

type LazyTournamentIdBounds = {
  readonly entityId: string;
  readonly lowestId?: number | null;
  readonly highestId?: number | null;
  readonly totalCount: number;
  readonly lastUpdated: string;
}

export declare type TournamentIdBounds = LazyLoading extends LazyLoadingDisabled ? EagerTournamentIdBounds : LazyTournamentIdBounds

export declare const TournamentIdBounds: (new (init: ModelInit<TournamentIdBounds>) => TournamentIdBounds)

type EagerCacheActivityLog = {
  readonly url: string;
  readonly timestamp: string;
  readonly action: string;
  readonly reason?: string | null;
}

type LazyCacheActivityLog = {
  readonly url: string;
  readonly timestamp: string;
  readonly action: string;
  readonly reason?: string | null;
}

export declare type CacheActivityLog = LazyLoading extends LazyLoadingDisabled ? EagerCacheActivityLog : LazyCacheActivityLog

export declare const CacheActivityLog: (new (init: ModelInit<CacheActivityLog>) => CacheActivityLog)

type EagerTournamentLevel = {
  readonly levelNumber: number;
  readonly durationMinutes?: number | null;
  readonly smallBlind?: number | null;
  readonly bigBlind?: number | null;
  readonly ante?: number | null;
}

type LazyTournamentLevel = {
  readonly levelNumber: number;
  readonly durationMinutes?: number | null;
  readonly smallBlind?: number | null;
  readonly bigBlind?: number | null;
  readonly ante?: number | null;
}

export declare type TournamentLevel = LazyLoading extends LazyLoadingDisabled ? EagerTournamentLevel : LazyTournamentLevel

export declare const TournamentLevel: (new (init: ModelInit<TournamentLevel>) => TournamentLevel)

type EagerBreak = {
  readonly levelNumberBeforeBreak: number;
  readonly durationMinutes?: number | null;
}

type LazyBreak = {
  readonly levelNumberBeforeBreak: number;
  readonly durationMinutes?: number | null;
}

export declare type Break = LazyLoading extends LazyLoadingDisabled ? EagerBreak : LazyBreak

export declare const Break: (new (init: ModelInit<Break>) => Break)

type EagerGamesNeedingVenueResponse = {
  readonly items?: (Game | null)[] | null;
  readonly nextToken?: string | null;
  readonly totalCount?: number | null;
}

type LazyGamesNeedingVenueResponse = {
  readonly items: AsyncCollection<Game>;
  readonly nextToken?: string | null;
  readonly totalCount?: number | null;
}

export declare type GamesNeedingVenueResponse = LazyLoading extends LazyLoadingDisabled ? EagerGamesNeedingVenueResponse : LazyGamesNeedingVenueResponse

export declare const GamesNeedingVenueResponse: (new (init: ModelInit<GamesNeedingVenueResponse>) => GamesNeedingVenueResponse)

type EagerGetReassignmentStatusResult = {
  readonly success: boolean;
  readonly message?: string | null;
  readonly task?: BackgroundTaskInfo | null;
}

type LazyGetReassignmentStatusResult = {
  readonly success: boolean;
  readonly message?: string | null;
  readonly task?: BackgroundTaskInfo | null;
}

export declare type GetReassignmentStatusResult = LazyLoading extends LazyLoadingDisabled ? EagerGetReassignmentStatusResult : LazyGetReassignmentStatusResult

export declare const GetReassignmentStatusResult: (new (init: ModelInit<GetReassignmentStatusResult>) => GetReassignmentStatusResult)

type EagerBackgroundTaskInfo = {
  readonly id: string;
  readonly status: BackgroundTaskStatus | keyof typeof BackgroundTaskStatus;
  readonly taskType: BackgroundTaskType | keyof typeof BackgroundTaskType;
  readonly targetCount?: number | null;
  readonly processedCount?: number | null;
  readonly progressPercent?: number | null;
  readonly result?: string | null;
  readonly errorMessage?: string | null;
  readonly createdAt: string;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
}

type LazyBackgroundTaskInfo = {
  readonly id: string;
  readonly status: BackgroundTaskStatus | keyof typeof BackgroundTaskStatus;
  readonly taskType: BackgroundTaskType | keyof typeof BackgroundTaskType;
  readonly targetCount?: number | null;
  readonly processedCount?: number | null;
  readonly progressPercent?: number | null;
  readonly result?: string | null;
  readonly errorMessage?: string | null;
  readonly createdAt: string;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
}

export declare type BackgroundTaskInfo = LazyLoading extends LazyLoadingDisabled ? EagerBackgroundTaskInfo : LazyBackgroundTaskInfo

export declare const BackgroundTaskInfo: (new (init: ModelInit<BackgroundTaskInfo>) => BackgroundTaskInfo)

type EagerRefreshResponse = {
  readonly message: string;
  readonly status: string;
}

type LazyRefreshResponse = {
  readonly message: string;
  readonly status: string;
}

export declare type RefreshResponse = LazyLoading extends LazyLoadingDisabled ? EagerRefreshResponse : LazyRefreshResponse

export declare const RefreshResponse: (new (init: ModelInit<RefreshResponse>) => RefreshResponse)

type EagerSaveSeriesAssignmentInfo = {
  readonly tournamentSeriesId?: string | null;
  readonly seriesName?: string | null;
  readonly status?: SeriesAssignmentStatus | keyof typeof SeriesAssignmentStatus | null;
  readonly confidence?: number | null;
}

type LazySaveSeriesAssignmentInfo = {
  readonly tournamentSeriesId?: string | null;
  readonly seriesName?: string | null;
  readonly status?: SeriesAssignmentStatus | keyof typeof SeriesAssignmentStatus | null;
  readonly confidence?: number | null;
}

export declare type SaveSeriesAssignmentInfo = LazyLoading extends LazyLoadingDisabled ? EagerSaveSeriesAssignmentInfo : LazySaveSeriesAssignmentInfo

export declare const SaveSeriesAssignmentInfo: (new (init: ModelInit<SaveSeriesAssignmentInfo>) => SaveSeriesAssignmentInfo)

type EagerUnfinishedGamesConnection = {
  readonly items: Game[];
  readonly nextToken?: string | null;
  readonly totalCount: number;
}

type LazyUnfinishedGamesConnection = {
  readonly items: AsyncCollection<Game>;
  readonly nextToken?: string | null;
  readonly totalCount: number;
}

export declare type UnfinishedGamesConnection = LazyLoading extends LazyLoadingDisabled ? EagerUnfinishedGamesConnection : LazyUnfinishedGamesConnection

export declare const UnfinishedGamesConnection: (new (init: ModelInit<UnfinishedGamesConnection>) => UnfinishedGamesConnection)

type EagerEntity = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<Entity, 'id'>;
  };
  readonly id: string;
  readonly entityName: string;
  readonly gameUrlDomain: string;
  readonly gameUrlPath: string;
  readonly entityLogo?: string | null;
  readonly isActive: boolean;
  readonly defaultVenueId?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly gameCount?: number | null;
  readonly venueCount?: number | null;
  readonly lastGameAddedAt?: string | null;
  readonly lastDataRefreshedAt?: string | null;
  readonly seriesGameCount?: number | null;
  readonly lastSeriesGameAddedAt?: string | null;
  readonly scraperStates?: (ScraperState | null)[] | null;
  readonly scraperJobs?: (ScraperJob | null)[] | null;
  readonly scrapeURLs?: (ScrapeURL | null)[] | null;
  readonly venues?: (Venue | null)[] | null;
  readonly games?: (Game | null)[] | null;
  readonly assets?: (Asset | null)[] | null;
  readonly tournamentSeries?: (TournamentSeries | null)[] | null;
  readonly recurringGames?: (RecurringGame | null)[] | null;
  readonly entityMetrics?: (EntityMetrics | null)[] | null;
  readonly venueMetrics?: (VenueMetrics | null)[] | null;
  readonly recurringGameMetrics?: (RecurringGameMetrics | null)[] | null;
  readonly tournamentSeriesMetrics?: (TournamentSeriesMetrics | null)[] | null;
  readonly socialAccounts?: (SocialAccount | null)[] | null;
}

type LazyEntity = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<Entity, 'id'>;
  };
  readonly id: string;
  readonly entityName: string;
  readonly gameUrlDomain: string;
  readonly gameUrlPath: string;
  readonly entityLogo?: string | null;
  readonly isActive: boolean;
  readonly defaultVenueId?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly gameCount?: number | null;
  readonly venueCount?: number | null;
  readonly lastGameAddedAt?: string | null;
  readonly lastDataRefreshedAt?: string | null;
  readonly seriesGameCount?: number | null;
  readonly lastSeriesGameAddedAt?: string | null;
  readonly scraperStates: AsyncCollection<ScraperState>;
  readonly scraperJobs: AsyncCollection<ScraperJob>;
  readonly scrapeURLs: AsyncCollection<ScrapeURL>;
  readonly venues: AsyncCollection<Venue>;
  readonly games: AsyncCollection<Game>;
  readonly assets: AsyncCollection<Asset>;
  readonly tournamentSeries: AsyncCollection<TournamentSeries>;
  readonly recurringGames: AsyncCollection<RecurringGame>;
  readonly entityMetrics: AsyncCollection<EntityMetrics>;
  readonly venueMetrics: AsyncCollection<VenueMetrics>;
  readonly recurringGameMetrics: AsyncCollection<RecurringGameMetrics>;
  readonly tournamentSeriesMetrics: AsyncCollection<TournamentSeriesMetrics>;
  readonly socialAccounts: AsyncCollection<SocialAccount>;
}

export declare type Entity = LazyLoading extends LazyLoadingDisabled ? EagerEntity : LazyEntity

export declare const Entity: (new (init: ModelInit<Entity>) => Entity) & {
  copyOf(source: Entity, mutator: (draft: MutableModel<Entity>) => MutableModel<Entity> | void): Entity;
}

type EagerBackgroundTask = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<BackgroundTask, 'id'>;
    readOnlyFields: 'updatedAt';
  };
  readonly id: string;
  readonly entityId: string;
  readonly taskType: BackgroundTaskType | keyof typeof BackgroundTaskType;
  readonly status: BackgroundTaskStatus | keyof typeof BackgroundTaskStatus;
  readonly targetType: string;
  readonly targetId?: string | null;
  readonly targetIds?: (string | null)[] | null;
  readonly targetCount?: number | null;
  readonly payload?: string | null;
  readonly processedCount?: number | null;
  readonly progressPercent?: number | null;
  readonly result?: string | null;
  readonly errorMessage?: string | null;
  readonly createdAt: string;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
  readonly initiatedBy?: string | null;
  readonly updatedAt?: string | null;
}

type LazyBackgroundTask = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<BackgroundTask, 'id'>;
    readOnlyFields: 'updatedAt';
  };
  readonly id: string;
  readonly entityId: string;
  readonly taskType: BackgroundTaskType | keyof typeof BackgroundTaskType;
  readonly status: BackgroundTaskStatus | keyof typeof BackgroundTaskStatus;
  readonly targetType: string;
  readonly targetId?: string | null;
  readonly targetIds?: (string | null)[] | null;
  readonly targetCount?: number | null;
  readonly payload?: string | null;
  readonly processedCount?: number | null;
  readonly progressPercent?: number | null;
  readonly result?: string | null;
  readonly errorMessage?: string | null;
  readonly createdAt: string;
  readonly startedAt?: string | null;
  readonly completedAt?: string | null;
  readonly initiatedBy?: string | null;
  readonly updatedAt?: string | null;
}

export declare type BackgroundTask = LazyLoading extends LazyLoadingDisabled ? EagerBackgroundTask : LazyBackgroundTask

export declare const BackgroundTask: (new (init: ModelInit<BackgroundTask>) => BackgroundTask) & {
  copyOf(source: BackgroundTask, mutator: (draft: MutableModel<BackgroundTask>) => MutableModel<BackgroundTask> | void): BackgroundTask;
}

type EagerVenue = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<Venue, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly venueNumber: number;
  readonly name: string;
  readonly aliases?: (string | null)[] | null;
  readonly address?: string | null;
  readonly city?: string | null;
  readonly country?: string | null;
  readonly fee?: number | null;
  readonly isSpecial?: boolean | null;
  readonly details?: VenueDetails | null;
  readonly logo?: string | null;
  readonly gameCount?: number | null;
  readonly lastGameAddedAt?: string | null;
  readonly lastDataRefreshedAt?: string | null;
  readonly seriesGameCount?: number | null;
  readonly lastSeriesGameAddedAt?: string | null;
  readonly canonicalVenueId?: string | null;
  readonly assets?: (Asset | null)[] | null;
  readonly games?: (Game | null)[] | null;
  readonly series?: (TournamentSeries | null)[] | null;
  readonly playerMemberships?: (PlayerVenue | null)[] | null;
  readonly registeredPlayers?: (Player | null)[] | null;
  readonly recurringGames?: (RecurringGame | null)[] | null;
  readonly venueMetrics?: (VenueMetrics | null)[] | null;
  readonly recurringGameMetrics?: (RecurringGameMetrics | null)[] | null;
  readonly socialAccounts?: (SocialAccount | null)[] | null;
  readonly entityId?: string | null;
  readonly entity?: Entity | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
  readonly venueDetailsId?: string | null;
}

type LazyVenue = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<Venue, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly venueNumber: number;
  readonly name: string;
  readonly aliases?: (string | null)[] | null;
  readonly address?: string | null;
  readonly city?: string | null;
  readonly country?: string | null;
  readonly fee?: number | null;
  readonly isSpecial?: boolean | null;
  readonly details: AsyncItem<VenueDetails | undefined>;
  readonly logo?: string | null;
  readonly gameCount?: number | null;
  readonly lastGameAddedAt?: string | null;
  readonly lastDataRefreshedAt?: string | null;
  readonly seriesGameCount?: number | null;
  readonly lastSeriesGameAddedAt?: string | null;
  readonly canonicalVenueId?: string | null;
  readonly assets: AsyncCollection<Asset>;
  readonly games: AsyncCollection<Game>;
  readonly series: AsyncCollection<TournamentSeries>;
  readonly playerMemberships: AsyncCollection<PlayerVenue>;
  readonly registeredPlayers: AsyncCollection<Player>;
  readonly recurringGames: AsyncCollection<RecurringGame>;
  readonly venueMetrics: AsyncCollection<VenueMetrics>;
  readonly recurringGameMetrics: AsyncCollection<RecurringGameMetrics>;
  readonly socialAccounts: AsyncCollection<SocialAccount>;
  readonly entityId?: string | null;
  readonly entity: AsyncItem<Entity | undefined>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
  readonly venueDetailsId?: string | null;
}

export declare type Venue = LazyLoading extends LazyLoadingDisabled ? EagerVenue : LazyVenue

export declare const Venue: (new (init: ModelInit<Venue>) => Venue) & {
  copyOf(source: Venue, mutator: (draft: MutableModel<Venue>) => MutableModel<Venue> | void): Venue;
}

type EagerVenueDetails = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<VenueDetails, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly startDate: string;
  readonly status: VenueStatus | keyof typeof VenueStatus;
  readonly lastCustomerSuccessVisit?: string | null;
  readonly totalGamesHeld?: number | null;
  readonly averageUniquePlayersPerGame?: number | null;
  readonly averageEntriesPerGame?: number | null;
  readonly gameNights?: (string | null)[] | null;
  readonly venueId: string;
  readonly venue?: Venue | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyVenueDetails = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<VenueDetails, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly startDate: string;
  readonly status: VenueStatus | keyof typeof VenueStatus;
  readonly lastCustomerSuccessVisit?: string | null;
  readonly totalGamesHeld?: number | null;
  readonly averageUniquePlayersPerGame?: number | null;
  readonly averageEntriesPerGame?: number | null;
  readonly gameNights?: (string | null)[] | null;
  readonly venueId: string;
  readonly venue: AsyncItem<Venue | undefined>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type VenueDetails = LazyLoading extends LazyLoadingDisabled ? EagerVenueDetails : LazyVenueDetails

export declare const VenueDetails: (new (init: ModelInit<VenueDetails>) => VenueDetails) & {
  copyOf(source: VenueDetails, mutator: (draft: MutableModel<VenueDetails>) => MutableModel<VenueDetails> | void): VenueDetails;
}

type EagerGame = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<Game, 'id'>;
  };
  readonly id: string;
  readonly name: string;
  readonly gameType: GameType | keyof typeof GameType;
  readonly gameVariant: GameVariant | keyof typeof GameVariant;
  readonly gameStatus: GameStatus | keyof typeof GameStatus;
  readonly gameStartDateTime: string;
  readonly gameActualStartDateTime?: string | null;
  readonly gameEndDateTime?: string | null;
  readonly registrationStatus?: RegistrationStatus | keyof typeof RegistrationStatus | null;
  readonly totalDuration?: number | null;
  readonly gameFrequency?: GameFrequency | keyof typeof GameFrequency | null;
  readonly buyIn?: number | null;
  readonly rake?: number | null;
  readonly venueFee?: number | null;
  readonly startingStack?: number | null;
  readonly hasGuarantee?: boolean | null;
  readonly guaranteeAmount?: number | null;
  readonly prizepoolPaid?: number | null;
  readonly prizepoolCalculated?: number | null;
  readonly totalUniquePlayers?: number | null;
  readonly totalRebuys?: number | null;
  readonly totalAddons?: number | null;
  readonly totalInitialEntries?: number | null;
  readonly totalEntries?: number | null;
  readonly totalBuyInsCollected?: number | null;
  readonly rakeRevenue?: number | null;
  readonly prizepoolPlayerContributions?: number | null;
  readonly prizepoolAddedValue?: number | null;
  readonly prizepoolSurplus?: number | null;
  readonly guaranteeOverlayCost?: number | null;
  readonly gameProfit?: number | null;
  readonly hasJackpotContributions?: boolean | null;
  readonly jackpotContributionAmount?: number | null;
  readonly hasAccumulatorTickets?: boolean | null;
  readonly accumulatorTicketValue?: number | null;
  readonly numberOfAccumulatorTicketsPaid?: number | null;
  readonly playersRemaining?: number | null;
  readonly totalChipsInPlay?: number | null;
  readonly averagePlayerStack?: number | null;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly isRegular?: boolean | null;
  readonly isSatellite?: boolean | null;
  readonly gameTags?: (string | null)[] | null;
  readonly dealerDealt?: boolean | null;
  readonly isSeries?: boolean | null;
  readonly seriesName?: string | null;
  readonly isMainEvent?: boolean | null;
  readonly eventNumber?: number | null;
  readonly dayNumber?: number | null;
  readonly flightLetter?: string | null;
  readonly finalDay?: boolean | null;
  readonly parentGameId?: string | null;
  readonly parentGame?: Game | null;
  readonly childGames?: (Game | null)[] | null;
  readonly consolidationType?: string | null;
  readonly consolidationKey?: string | null;
  readonly isPartialData?: boolean | null;
  readonly missingFlightCount?: number | null;
  readonly expectedTotalEntries?: number | null;
  readonly gameDayOfWeek?: string | null;
  readonly gameYearMonth?: string | null;
  readonly buyInBucket?: string | null;
  readonly venueScheduleKey?: string | null;
  readonly venueGameTypeKey?: string | null;
  readonly entityQueryKey?: string | null;
  readonly entityGameTypeKey?: string | null;
  readonly sourceUrl?: string | null;
  readonly tournamentId?: number | null;
  readonly originalScrapedData?: string | null;
  readonly wasEdited?: boolean | null;
  readonly lastEditedAt?: string | null;
  readonly lastEditedBy?: string | null;
  readonly editHistory?: string | null;
  readonly contentHash?: string | null;
  readonly dataChangedAt?: string | null;
  readonly venueAssignmentStatus?: VenueAssignmentStatus | keyof typeof VenueAssignmentStatus | null;
  readonly requiresVenueAssignment?: boolean | null;
  readonly suggestedVenueName?: string | null;
  readonly venueAssignmentConfidence?: number | null;
  readonly seriesAssignmentStatus?: SeriesAssignmentStatus | keyof typeof SeriesAssignmentStatus | null;
  readonly seriesAssignmentConfidence?: number | null;
  readonly suggestedSeriesName?: string | null;
  readonly levels?: string | null;
  readonly sessionMode?: SessionMode | keyof typeof SessionMode | null;
  readonly variant?: PokerVariant | keyof typeof PokerVariant | null;
  readonly bettingStructure?: BettingStructure | keyof typeof BettingStructure | null;
  readonly speedType?: SpeedType | keyof typeof SpeedType | null;
  readonly tableSize?: TableSize | keyof typeof TableSize | null;
  readonly maxPlayers?: number | null;
  readonly dealType?: DealType | keyof typeof DealType | null;
  readonly buyInTier?: BuyInTier | keyof typeof BuyInTier | null;
  readonly entryStructure?: EntryStructure | keyof typeof EntryStructure | null;
  readonly bountyType?: BountyType | keyof typeof BountyType | null;
  readonly bountyAmount?: number | null;
  readonly bountyPercentage?: number | null;
  readonly tournamentPurpose?: TournamentPurpose | keyof typeof TournamentPurpose | null;
  readonly stackDepth?: StackDepth | keyof typeof StackDepth | null;
  readonly lateRegistration?: LateRegistration | keyof typeof LateRegistration | null;
  readonly payoutStructure?: PayoutStructure | keyof typeof PayoutStructure | null;
  readonly scheduleType?: TournamentScheduleType | keyof typeof TournamentScheduleType | null;
  readonly isShootout?: boolean | null;
  readonly isSurvivor?: boolean | null;
  readonly isFlipAndGo?: boolean | null;
  readonly isWinTheButton?: boolean | null;
  readonly isAnteOnly?: boolean | null;
  readonly isBigBlindAnte?: boolean | null;
  readonly cashGameType?: CashGameType | keyof typeof CashGameType | null;
  readonly cashRakeType?: CashRakeType | keyof typeof CashRakeType | null;
  readonly hasBombPots?: boolean | null;
  readonly hasRunItTwice?: boolean | null;
  readonly hasStraddle?: boolean | null;
  readonly mixedGameRotation?: (MixedGameComponent | null)[] | Array<keyof typeof MixedGameComponent> | null;
  readonly classificationSource?: ClassificationSource | keyof typeof ClassificationSource | null;
  readonly classificationConfidence?: number | null;
  readonly lastClassifiedAt?: string | null;
  readonly venueId?: string | null;
  readonly venue?: Venue | null;
  readonly tournamentSeriesId?: string | null;
  readonly tournamentSeries?: TournamentSeries | null;
  readonly structure?: TournamentStructure | null;
  readonly playerEntries?: (PlayerEntry | null)[] | null;
  readonly playerResults?: (PlayerResult | null)[] | null;
  readonly gameCostId?: string | null;
  readonly gameCost?: GameCost | null;
  readonly gameFinancialSnapshotId?: string | null;
  readonly gameFinancialSnapshot?: GameFinancialSnapshot | null;
  readonly linkedSocialPosts?: (SocialPost | null)[] | null;
  readonly socialPostLinks?: (SocialPostGameLink | null)[] | null;
  readonly linkedSocialPostCount?: number | null;
  readonly hasLinkedSocialPosts?: boolean | null;
  readonly primaryResultPostId?: string | null;
  readonly primaryResultPost?: SocialPost | null;
  readonly socialDataAggregation?: string | null;
  readonly socialDataAggregatedAt?: string | null;
  readonly ticketsAwarded?: (PlayerTicket | null)[] | null;
  readonly ticketsAwardedCount?: number | null;
  readonly ticketProgramName?: string | null;
  readonly entityId?: string | null;
  readonly entity?: Entity | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly recurringGameId?: string | null;
  readonly recurringGame?: RecurringGame | null;
  readonly recurringGameAssignmentConfidence?: number | null;
  readonly recurringGameAssignmentStatus?: RecurringGameAssignmentStatus | keyof typeof RecurringGameAssignmentStatus | null;
  readonly wasScheduledInstance?: boolean | null;
  readonly deviationNotes?: string | null;
  readonly instanceNumber?: number | null;
  readonly isReplacementInstance?: boolean | null;
  readonly replacementReason?: string | null;
  readonly gameStructureId?: string | null;
}

type LazyGame = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<Game, 'id'>;
  };
  readonly id: string;
  readonly name: string;
  readonly gameType: GameType | keyof typeof GameType;
  readonly gameVariant: GameVariant | keyof typeof GameVariant;
  readonly gameStatus: GameStatus | keyof typeof GameStatus;
  readonly gameStartDateTime: string;
  readonly gameActualStartDateTime?: string | null;
  readonly gameEndDateTime?: string | null;
  readonly registrationStatus?: RegistrationStatus | keyof typeof RegistrationStatus | null;
  readonly totalDuration?: number | null;
  readonly gameFrequency?: GameFrequency | keyof typeof GameFrequency | null;
  readonly buyIn?: number | null;
  readonly rake?: number | null;
  readonly venueFee?: number | null;
  readonly startingStack?: number | null;
  readonly hasGuarantee?: boolean | null;
  readonly guaranteeAmount?: number | null;
  readonly prizepoolPaid?: number | null;
  readonly prizepoolCalculated?: number | null;
  readonly totalUniquePlayers?: number | null;
  readonly totalRebuys?: number | null;
  readonly totalAddons?: number | null;
  readonly totalInitialEntries?: number | null;
  readonly totalEntries?: number | null;
  readonly totalBuyInsCollected?: number | null;
  readonly rakeRevenue?: number | null;
  readonly prizepoolPlayerContributions?: number | null;
  readonly prizepoolAddedValue?: number | null;
  readonly prizepoolSurplus?: number | null;
  readonly guaranteeOverlayCost?: number | null;
  readonly gameProfit?: number | null;
  readonly hasJackpotContributions?: boolean | null;
  readonly jackpotContributionAmount?: number | null;
  readonly hasAccumulatorTickets?: boolean | null;
  readonly accumulatorTicketValue?: number | null;
  readonly numberOfAccumulatorTicketsPaid?: number | null;
  readonly playersRemaining?: number | null;
  readonly totalChipsInPlay?: number | null;
  readonly averagePlayerStack?: number | null;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly isRegular?: boolean | null;
  readonly isSatellite?: boolean | null;
  readonly gameTags?: (string | null)[] | null;
  readonly dealerDealt?: boolean | null;
  readonly isSeries?: boolean | null;
  readonly seriesName?: string | null;
  readonly isMainEvent?: boolean | null;
  readonly eventNumber?: number | null;
  readonly dayNumber?: number | null;
  readonly flightLetter?: string | null;
  readonly finalDay?: boolean | null;
  readonly parentGameId?: string | null;
  readonly parentGame: AsyncItem<Game | undefined>;
  readonly childGames: AsyncCollection<Game>;
  readonly consolidationType?: string | null;
  readonly consolidationKey?: string | null;
  readonly isPartialData?: boolean | null;
  readonly missingFlightCount?: number | null;
  readonly expectedTotalEntries?: number | null;
  readonly gameDayOfWeek?: string | null;
  readonly gameYearMonth?: string | null;
  readonly buyInBucket?: string | null;
  readonly venueScheduleKey?: string | null;
  readonly venueGameTypeKey?: string | null;
  readonly entityQueryKey?: string | null;
  readonly entityGameTypeKey?: string | null;
  readonly sourceUrl?: string | null;
  readonly tournamentId?: number | null;
  readonly originalScrapedData?: string | null;
  readonly wasEdited?: boolean | null;
  readonly lastEditedAt?: string | null;
  readonly lastEditedBy?: string | null;
  readonly editHistory?: string | null;
  readonly contentHash?: string | null;
  readonly dataChangedAt?: string | null;
  readonly venueAssignmentStatus?: VenueAssignmentStatus | keyof typeof VenueAssignmentStatus | null;
  readonly requiresVenueAssignment?: boolean | null;
  readonly suggestedVenueName?: string | null;
  readonly venueAssignmentConfidence?: number | null;
  readonly seriesAssignmentStatus?: SeriesAssignmentStatus | keyof typeof SeriesAssignmentStatus | null;
  readonly seriesAssignmentConfidence?: number | null;
  readonly suggestedSeriesName?: string | null;
  readonly levels?: string | null;
  readonly sessionMode?: SessionMode | keyof typeof SessionMode | null;
  readonly variant?: PokerVariant | keyof typeof PokerVariant | null;
  readonly bettingStructure?: BettingStructure | keyof typeof BettingStructure | null;
  readonly speedType?: SpeedType | keyof typeof SpeedType | null;
  readonly tableSize?: TableSize | keyof typeof TableSize | null;
  readonly maxPlayers?: number | null;
  readonly dealType?: DealType | keyof typeof DealType | null;
  readonly buyInTier?: BuyInTier | keyof typeof BuyInTier | null;
  readonly entryStructure?: EntryStructure | keyof typeof EntryStructure | null;
  readonly bountyType?: BountyType | keyof typeof BountyType | null;
  readonly bountyAmount?: number | null;
  readonly bountyPercentage?: number | null;
  readonly tournamentPurpose?: TournamentPurpose | keyof typeof TournamentPurpose | null;
  readonly stackDepth?: StackDepth | keyof typeof StackDepth | null;
  readonly lateRegistration?: LateRegistration | keyof typeof LateRegistration | null;
  readonly payoutStructure?: PayoutStructure | keyof typeof PayoutStructure | null;
  readonly scheduleType?: TournamentScheduleType | keyof typeof TournamentScheduleType | null;
  readonly isShootout?: boolean | null;
  readonly isSurvivor?: boolean | null;
  readonly isFlipAndGo?: boolean | null;
  readonly isWinTheButton?: boolean | null;
  readonly isAnteOnly?: boolean | null;
  readonly isBigBlindAnte?: boolean | null;
  readonly cashGameType?: CashGameType | keyof typeof CashGameType | null;
  readonly cashRakeType?: CashRakeType | keyof typeof CashRakeType | null;
  readonly hasBombPots?: boolean | null;
  readonly hasRunItTwice?: boolean | null;
  readonly hasStraddle?: boolean | null;
  readonly mixedGameRotation?: (MixedGameComponent | null)[] | Array<keyof typeof MixedGameComponent> | null;
  readonly classificationSource?: ClassificationSource | keyof typeof ClassificationSource | null;
  readonly classificationConfidence?: number | null;
  readonly lastClassifiedAt?: string | null;
  readonly venueId?: string | null;
  readonly venue: AsyncItem<Venue | undefined>;
  readonly tournamentSeriesId?: string | null;
  readonly tournamentSeries: AsyncItem<TournamentSeries | undefined>;
  readonly structure: AsyncItem<TournamentStructure | undefined>;
  readonly playerEntries: AsyncCollection<PlayerEntry>;
  readonly playerResults: AsyncCollection<PlayerResult>;
  readonly gameCostId?: string | null;
  readonly gameCost: AsyncItem<GameCost | undefined>;
  readonly gameFinancialSnapshotId?: string | null;
  readonly gameFinancialSnapshot: AsyncItem<GameFinancialSnapshot | undefined>;
  readonly linkedSocialPosts: AsyncCollection<SocialPost>;
  readonly socialPostLinks: AsyncCollection<SocialPostGameLink>;
  readonly linkedSocialPostCount?: number | null;
  readonly hasLinkedSocialPosts?: boolean | null;
  readonly primaryResultPostId?: string | null;
  readonly primaryResultPost: AsyncItem<SocialPost | undefined>;
  readonly socialDataAggregation?: string | null;
  readonly socialDataAggregatedAt?: string | null;
  readonly ticketsAwarded: AsyncCollection<PlayerTicket>;
  readonly ticketsAwardedCount?: number | null;
  readonly ticketProgramName?: string | null;
  readonly entityId?: string | null;
  readonly entity: AsyncItem<Entity | undefined>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly recurringGameId?: string | null;
  readonly recurringGame: AsyncItem<RecurringGame | undefined>;
  readonly recurringGameAssignmentConfidence?: number | null;
  readonly recurringGameAssignmentStatus?: RecurringGameAssignmentStatus | keyof typeof RecurringGameAssignmentStatus | null;
  readonly wasScheduledInstance?: boolean | null;
  readonly deviationNotes?: string | null;
  readonly instanceNumber?: number | null;
  readonly isReplacementInstance?: boolean | null;
  readonly replacementReason?: string | null;
  readonly gameStructureId?: string | null;
}

export declare type Game = LazyLoading extends LazyLoadingDisabled ? EagerGame : LazyGame

export declare const Game: (new (init: ModelInit<Game>) => Game) & {
  copyOf(source: Game, mutator: (draft: MutableModel<Game>) => MutableModel<Game> | void): Game;
}

type EagerTournamentStructure = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<TournamentStructure, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly levels?: TournamentLevel[] | null;
  readonly breaks?: Break[] | null;
  readonly gameId: string;
  readonly game?: Game | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyTournamentStructure = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<TournamentStructure, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly levels?: TournamentLevel[] | null;
  readonly breaks?: Break[] | null;
  readonly gameId: string;
  readonly game: AsyncItem<Game | undefined>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type TournamentStructure = LazyLoading extends LazyLoadingDisabled ? EagerTournamentStructure : LazyTournamentStructure

export declare const TournamentStructure: (new (init: ModelInit<TournamentStructure>) => TournamentStructure) & {
  copyOf(source: TournamentStructure, mutator: (draft: MutableModel<TournamentStructure>) => MutableModel<TournamentStructure> | void): TournamentStructure;
}

type EagerTournamentLevelData = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<TournamentLevelData, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly levels?: TournamentLevel[] | null;
  readonly gameId: string;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyTournamentLevelData = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<TournamentLevelData, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly levels?: TournamentLevel[] | null;
  readonly gameId: string;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type TournamentLevelData = LazyLoading extends LazyLoadingDisabled ? EagerTournamentLevelData : LazyTournamentLevelData

export declare const TournamentLevelData: (new (init: ModelInit<TournamentLevelData>) => TournamentLevelData) & {
  copyOf(source: TournamentLevelData, mutator: (draft: MutableModel<TournamentLevelData>) => MutableModel<TournamentLevelData> | void): TournamentLevelData;
}

type EagerCashStructure = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<CashStructure, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly stakes: string;
  readonly minBuyIn?: number | null;
  readonly maxBuyIn?: number | null;
  readonly gameId: string;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyCashStructure = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<CashStructure, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly stakes: string;
  readonly minBuyIn?: number | null;
  readonly maxBuyIn?: number | null;
  readonly gameId: string;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type CashStructure = LazyLoading extends LazyLoadingDisabled ? EagerCashStructure : LazyCashStructure

export declare const CashStructure: (new (init: ModelInit<CashStructure>) => CashStructure) & {
  copyOf(source: CashStructure, mutator: (draft: MutableModel<CashStructure>) => MutableModel<CashStructure> | void): CashStructure;
}

type EagerRakeStructure = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<RakeStructure, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly rakePercentage?: number | null;
  readonly rakeCap?: number | null;
  readonly gameId: string;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyRakeStructure = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<RakeStructure, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly rakePercentage?: number | null;
  readonly rakeCap?: number | null;
  readonly gameId: string;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type RakeStructure = LazyLoading extends LazyLoadingDisabled ? EagerRakeStructure : LazyRakeStructure

export declare const RakeStructure: (new (init: ModelInit<RakeStructure>) => RakeStructure) & {
  copyOf(source: RakeStructure, mutator: (draft: MutableModel<RakeStructure>) => MutableModel<RakeStructure> | void): RakeStructure;
}

type EagerGameFinancialSnapshot = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<GameFinancialSnapshot, 'id'>;
  };
  readonly id: string;
  readonly gameId: string;
  readonly game?: Game | null;
  readonly gameCostId?: string | null;
  readonly entityId?: string | null;
  readonly venueId?: string | null;
  readonly gameStartDateTime?: string | null;
  readonly totalBuyInsCollected?: number | null;
  readonly rakeRevenue?: number | null;
  readonly venueFee?: number | null;
  readonly totalRevenue: number;
  readonly prizepoolPlayerContributions?: number | null;
  readonly prizepoolAddedValue?: number | null;
  readonly prizepoolTotal?: number | null;
  readonly prizepoolSurplus?: number | null;
  readonly prizepoolPaidDelta?: number | null;
  readonly prizepoolJackpotContributions?: number | null;
  readonly prizepoolAccumulatorTicketPayoutEstimate?: number | null;
  readonly prizepoolAccumulatorTicketPayoutActual?: number | null;
  readonly totalDealerCost?: number | null;
  readonly totalTournamentDirectorCost?: number | null;
  readonly totalFloorStaffCost?: number | null;
  readonly totalSecurityCost?: number | null;
  readonly totalStaffCost?: number | null;
  readonly totalPrizeContribution?: number | null;
  readonly totalJackpotContribution?: number | null;
  readonly totalGuaranteeOverlayCost?: number | null;
  readonly totalAddedValueCost?: number | null;
  readonly totalBountyCost?: number | null;
  readonly totalDirectGameCost?: number | null;
  readonly totalVenueRentalCost?: number | null;
  readonly totalEquipmentRentalCost?: number | null;
  readonly totalFoodBeverageCost?: number | null;
  readonly totalMarketingCost?: number | null;
  readonly totalStreamingCost?: number | null;
  readonly totalOperationsCost?: number | null;
  readonly totalInsuranceCost?: number | null;
  readonly totalLicensingCost?: number | null;
  readonly totalComplianceCost?: number | null;
  readonly totalStaffTravelCost?: number | null;
  readonly totalPlayerAccommodationCost?: number | null;
  readonly totalPromotionCost?: number | null;
  readonly totalOtherCost?: number | null;
  readonly totalCost: number;
  readonly gameProfit?: number | null;
  readonly netProfit: number;
  readonly profitMargin?: number | null;
  readonly revenuePerPlayer?: number | null;
  readonly costPerPlayer?: number | null;
  readonly profitPerPlayer?: number | null;
  readonly rakePerEntry?: number | null;
  readonly dealerCostPerHour?: number | null;
  readonly staffCostPerPlayer?: number | null;
  readonly promoSpendPerPlayer?: number | null;
  readonly guaranteeCoverageRate?: number | null;
  readonly guaranteeMet?: boolean | null;
  readonly totalUniquePlayers?: number | null;
  readonly totalEntries?: number | null;
  readonly guaranteeAmount?: number | null;
  readonly gameDurationMinutes?: number | null;
  readonly gameType?: GameType | keyof typeof GameType | null;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly isSeries?: boolean | null;
  readonly isSeriesParent?: boolean | null;
  readonly parentGameId?: string | null;
  readonly tournamentSeriesId?: string | null;
  readonly seriesName?: string | null;
  readonly recurringGameId?: string | null;
  readonly entitySeriesKey?: string | null;
  readonly venueSeriesKey?: string | null;
  readonly notes?: string | null;
  readonly snapshotType?: SnapshotType | keyof typeof SnapshotType | null;
  readonly isReconciled?: boolean | null;
  readonly reconciledAt?: string | null;
  readonly reconciledBy?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type LazyGameFinancialSnapshot = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<GameFinancialSnapshot, 'id'>;
  };
  readonly id: string;
  readonly gameId: string;
  readonly game: AsyncItem<Game | undefined>;
  readonly gameCostId?: string | null;
  readonly entityId?: string | null;
  readonly venueId?: string | null;
  readonly gameStartDateTime?: string | null;
  readonly totalBuyInsCollected?: number | null;
  readonly rakeRevenue?: number | null;
  readonly venueFee?: number | null;
  readonly totalRevenue: number;
  readonly prizepoolPlayerContributions?: number | null;
  readonly prizepoolAddedValue?: number | null;
  readonly prizepoolTotal?: number | null;
  readonly prizepoolSurplus?: number | null;
  readonly prizepoolPaidDelta?: number | null;
  readonly prizepoolJackpotContributions?: number | null;
  readonly prizepoolAccumulatorTicketPayoutEstimate?: number | null;
  readonly prizepoolAccumulatorTicketPayoutActual?: number | null;
  readonly totalDealerCost?: number | null;
  readonly totalTournamentDirectorCost?: number | null;
  readonly totalFloorStaffCost?: number | null;
  readonly totalSecurityCost?: number | null;
  readonly totalStaffCost?: number | null;
  readonly totalPrizeContribution?: number | null;
  readonly totalJackpotContribution?: number | null;
  readonly totalGuaranteeOverlayCost?: number | null;
  readonly totalAddedValueCost?: number | null;
  readonly totalBountyCost?: number | null;
  readonly totalDirectGameCost?: number | null;
  readonly totalVenueRentalCost?: number | null;
  readonly totalEquipmentRentalCost?: number | null;
  readonly totalFoodBeverageCost?: number | null;
  readonly totalMarketingCost?: number | null;
  readonly totalStreamingCost?: number | null;
  readonly totalOperationsCost?: number | null;
  readonly totalInsuranceCost?: number | null;
  readonly totalLicensingCost?: number | null;
  readonly totalComplianceCost?: number | null;
  readonly totalStaffTravelCost?: number | null;
  readonly totalPlayerAccommodationCost?: number | null;
  readonly totalPromotionCost?: number | null;
  readonly totalOtherCost?: number | null;
  readonly totalCost: number;
  readonly gameProfit?: number | null;
  readonly netProfit: number;
  readonly profitMargin?: number | null;
  readonly revenuePerPlayer?: number | null;
  readonly costPerPlayer?: number | null;
  readonly profitPerPlayer?: number | null;
  readonly rakePerEntry?: number | null;
  readonly dealerCostPerHour?: number | null;
  readonly staffCostPerPlayer?: number | null;
  readonly promoSpendPerPlayer?: number | null;
  readonly guaranteeCoverageRate?: number | null;
  readonly guaranteeMet?: boolean | null;
  readonly totalUniquePlayers?: number | null;
  readonly totalEntries?: number | null;
  readonly guaranteeAmount?: number | null;
  readonly gameDurationMinutes?: number | null;
  readonly gameType?: GameType | keyof typeof GameType | null;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly isSeries?: boolean | null;
  readonly isSeriesParent?: boolean | null;
  readonly parentGameId?: string | null;
  readonly tournamentSeriesId?: string | null;
  readonly seriesName?: string | null;
  readonly recurringGameId?: string | null;
  readonly entitySeriesKey?: string | null;
  readonly venueSeriesKey?: string | null;
  readonly notes?: string | null;
  readonly snapshotType?: SnapshotType | keyof typeof SnapshotType | null;
  readonly isReconciled?: boolean | null;
  readonly reconciledAt?: string | null;
  readonly reconciledBy?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type GameFinancialSnapshot = LazyLoading extends LazyLoadingDisabled ? EagerGameFinancialSnapshot : LazyGameFinancialSnapshot

export declare const GameFinancialSnapshot: (new (init: ModelInit<GameFinancialSnapshot>) => GameFinancialSnapshot) & {
  copyOf(source: GameFinancialSnapshot, mutator: (draft: MutableModel<GameFinancialSnapshot>) => MutableModel<GameFinancialSnapshot> | void): GameFinancialSnapshot;
}

type EagerGameCost = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<GameCost, 'id'>;
  };
  readonly id: string;
  readonly gameId: string;
  readonly game?: Game | null;
  readonly totalDealerCost?: number | null;
  readonly totalTournamentDirectorCost?: number | null;
  readonly totalFloorStaffCost?: number | null;
  readonly totalSecurityCost?: number | null;
  readonly totalPrizeContribution?: number | null;
  readonly totalJackpotContribution?: number | null;
  readonly totalGuaranteeOverlayCost?: number | null;
  readonly totalAddedValueCost?: number | null;
  readonly totalBountyCost?: number | null;
  readonly totalVenueRentalCost?: number | null;
  readonly totalEquipmentRentalCost?: number | null;
  readonly totalFoodBeverageCost?: number | null;
  readonly totalMarketingCost?: number | null;
  readonly totalStreamingCost?: number | null;
  readonly totalInsuranceCost?: number | null;
  readonly totalLicensingCost?: number | null;
  readonly totalStaffTravelCost?: number | null;
  readonly totalPlayerAccommodationCost?: number | null;
  readonly totalPromotionCost?: number | null;
  readonly totalOtherCost?: number | null;
  readonly totalStaffCost?: number | null;
  readonly totalDirectGameCost?: number | null;
  readonly totalOperationsCost?: number | null;
  readonly totalComplianceCost?: number | null;
  readonly totalCost: number;
  readonly lineItems?: (GameCostLineItem | null)[] | null;
  readonly entityId?: string | null;
  readonly venueId?: string | null;
  readonly gameDate?: string | null;
  readonly notes?: string | null;
  readonly isEstimate?: boolean | null;
  readonly costStatus?: CostStatus | keyof typeof CostStatus | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type LazyGameCost = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<GameCost, 'id'>;
  };
  readonly id: string;
  readonly gameId: string;
  readonly game: AsyncItem<Game | undefined>;
  readonly totalDealerCost?: number | null;
  readonly totalTournamentDirectorCost?: number | null;
  readonly totalFloorStaffCost?: number | null;
  readonly totalSecurityCost?: number | null;
  readonly totalPrizeContribution?: number | null;
  readonly totalJackpotContribution?: number | null;
  readonly totalGuaranteeOverlayCost?: number | null;
  readonly totalAddedValueCost?: number | null;
  readonly totalBountyCost?: number | null;
  readonly totalVenueRentalCost?: number | null;
  readonly totalEquipmentRentalCost?: number | null;
  readonly totalFoodBeverageCost?: number | null;
  readonly totalMarketingCost?: number | null;
  readonly totalStreamingCost?: number | null;
  readonly totalInsuranceCost?: number | null;
  readonly totalLicensingCost?: number | null;
  readonly totalStaffTravelCost?: number | null;
  readonly totalPlayerAccommodationCost?: number | null;
  readonly totalPromotionCost?: number | null;
  readonly totalOtherCost?: number | null;
  readonly totalStaffCost?: number | null;
  readonly totalDirectGameCost?: number | null;
  readonly totalOperationsCost?: number | null;
  readonly totalComplianceCost?: number | null;
  readonly totalCost: number;
  readonly lineItems: AsyncCollection<GameCostLineItem>;
  readonly entityId?: string | null;
  readonly venueId?: string | null;
  readonly gameDate?: string | null;
  readonly notes?: string | null;
  readonly isEstimate?: boolean | null;
  readonly costStatus?: CostStatus | keyof typeof CostStatus | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type GameCost = LazyLoading extends LazyLoadingDisabled ? EagerGameCost : LazyGameCost

export declare const GameCost: (new (init: ModelInit<GameCost>) => GameCost) & {
  copyOf(source: GameCost, mutator: (draft: MutableModel<GameCost>) => MutableModel<GameCost> | void): GameCost;
}

type EagerGameCostLineItem = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<GameCostLineItem, 'id'>;
  };
  readonly id: string;
  readonly gameCostId: string;
  readonly gameCost?: GameCost | null;
  readonly costItemId: string;
  readonly costItem?: GameCostItem | null;
  readonly costType: CostItemType | keyof typeof CostItemType;
  readonly rateType?: CostItemRateType | keyof typeof CostItemRateType | null;
  readonly amount: number;
  readonly quantity?: number | null;
  readonly rate?: number | null;
  readonly hours?: number | null;
  readonly staffMemberId?: string | null;
  readonly staffMemberName?: string | null;
  readonly description?: string | null;
  readonly notes?: string | null;
  readonly gameId?: string | null;
  readonly entityId?: string | null;
  readonly venueId?: string | null;
  readonly gameDate?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type LazyGameCostLineItem = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<GameCostLineItem, 'id'>;
  };
  readonly id: string;
  readonly gameCostId: string;
  readonly gameCost: AsyncItem<GameCost | undefined>;
  readonly costItemId: string;
  readonly costItem: AsyncItem<GameCostItem | undefined>;
  readonly costType: CostItemType | keyof typeof CostItemType;
  readonly rateType?: CostItemRateType | keyof typeof CostItemRateType | null;
  readonly amount: number;
  readonly quantity?: number | null;
  readonly rate?: number | null;
  readonly hours?: number | null;
  readonly staffMemberId?: string | null;
  readonly staffMemberName?: string | null;
  readonly description?: string | null;
  readonly notes?: string | null;
  readonly gameId?: string | null;
  readonly entityId?: string | null;
  readonly venueId?: string | null;
  readonly gameDate?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type GameCostLineItem = LazyLoading extends LazyLoadingDisabled ? EagerGameCostLineItem : LazyGameCostLineItem

export declare const GameCostLineItem: (new (init: ModelInit<GameCostLineItem>) => GameCostLineItem) & {
  copyOf(source: GameCostLineItem, mutator: (draft: MutableModel<GameCostLineItem>) => MutableModel<GameCostLineItem> | void): GameCostLineItem;
}

type EagerGameCostItem = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<GameCostItem, 'id'>;
  };
  readonly id: string;
  readonly name: string;
  readonly costType: CostItemType | keyof typeof CostItemType;
  readonly rateType?: CostItemRateType | keyof typeof CostItemRateType | null;
  readonly defaultRate?: number | null;
  readonly isPerHour?: boolean | null;
  readonly isActive?: boolean | null;
  readonly description?: string | null;
  readonly lineItems?: (GameCostLineItem | null)[] | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type LazyGameCostItem = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<GameCostItem, 'id'>;
  };
  readonly id: string;
  readonly name: string;
  readonly costType: CostItemType | keyof typeof CostItemType;
  readonly rateType?: CostItemRateType | keyof typeof CostItemRateType | null;
  readonly defaultRate?: number | null;
  readonly isPerHour?: boolean | null;
  readonly isActive?: boolean | null;
  readonly description?: string | null;
  readonly lineItems: AsyncCollection<GameCostLineItem>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type GameCostItem = LazyLoading extends LazyLoadingDisabled ? EagerGameCostItem : LazyGameCostItem

export declare const GameCostItem: (new (init: ModelInit<GameCostItem>) => GameCostItem) & {
  copyOf(source: GameCostItem, mutator: (draft: MutableModel<GameCostItem>) => MutableModel<GameCostItem> | void): GameCostItem;
}

type EagerRecurringGame = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<RecurringGame, 'id'>;
  };
  readonly id: string;
  readonly name: string;
  readonly displayName?: string | null;
  readonly description?: string | null;
  readonly aliases?: (string | null)[] | null;
  readonly entityId: string;
  readonly entity?: Entity | null;
  readonly venueId: string;
  readonly venue?: Venue | null;
  readonly dayOfWeek?: string | null;
  readonly startTime?: string | null;
  readonly endTime?: string | null;
  readonly frequency: GameFrequency | keyof typeof GameFrequency;
  readonly gameType: GameType | keyof typeof GameType;
  readonly gameVariant: GameVariant | keyof typeof GameVariant;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly typicalBuyIn?: number | null;
  readonly typicalRake?: number | null;
  readonly typicalStartingStack?: number | null;
  readonly typicalGuarantee?: number | null;
  readonly hasJackpotContributions?: boolean | null;
  readonly jackpotContributionAmount?: number | null;
  readonly hasAccumulatorTickets?: boolean | null;
  readonly accumulatorTicketValue?: number | null;
  readonly isActive: boolean;
  readonly isPaused?: boolean | null;
  readonly pausedReason?: string | null;
  readonly lastGameDate?: string | null;
  readonly nextScheduledDate?: string | null;
  readonly expectedInstanceCount?: number | null;
  readonly isSignature?: boolean | null;
  readonly isBeginnerFriendly?: boolean | null;
  readonly isBounty?: boolean | null;
  readonly tags?: (string | null)[] | null;
  readonly marketingDescription?: string | null;
  readonly imageUrl?: string | null;
  readonly socialMediaHashtags?: (string | null)[] | null;
  readonly autoDetectionConfidence?: number | null;
  readonly wasManuallyCreated?: boolean | null;
  readonly requiresReview?: boolean | null;
  readonly totalInstancesRun?: number | null;
  readonly avgAttendance?: number | null;
  readonly lastMonthAttendance?: number | null;
  readonly gameInstances?: (Game | null)[] | null;
  readonly metrics?: (RecurringGameMetrics | null)[] | null;
  readonly notes?: string | null;
  readonly adminNotes?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy?: string | null;
  readonly lastEditedBy?: string | null;
  readonly lastEditedAt?: string | null;
}

type LazyRecurringGame = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<RecurringGame, 'id'>;
  };
  readonly id: string;
  readonly name: string;
  readonly displayName?: string | null;
  readonly description?: string | null;
  readonly aliases?: (string | null)[] | null;
  readonly entityId: string;
  readonly entity: AsyncItem<Entity | undefined>;
  readonly venueId: string;
  readonly venue: AsyncItem<Venue | undefined>;
  readonly dayOfWeek?: string | null;
  readonly startTime?: string | null;
  readonly endTime?: string | null;
  readonly frequency: GameFrequency | keyof typeof GameFrequency;
  readonly gameType: GameType | keyof typeof GameType;
  readonly gameVariant: GameVariant | keyof typeof GameVariant;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly typicalBuyIn?: number | null;
  readonly typicalRake?: number | null;
  readonly typicalStartingStack?: number | null;
  readonly typicalGuarantee?: number | null;
  readonly hasJackpotContributions?: boolean | null;
  readonly jackpotContributionAmount?: number | null;
  readonly hasAccumulatorTickets?: boolean | null;
  readonly accumulatorTicketValue?: number | null;
  readonly isActive: boolean;
  readonly isPaused?: boolean | null;
  readonly pausedReason?: string | null;
  readonly lastGameDate?: string | null;
  readonly nextScheduledDate?: string | null;
  readonly expectedInstanceCount?: number | null;
  readonly isSignature?: boolean | null;
  readonly isBeginnerFriendly?: boolean | null;
  readonly isBounty?: boolean | null;
  readonly tags?: (string | null)[] | null;
  readonly marketingDescription?: string | null;
  readonly imageUrl?: string | null;
  readonly socialMediaHashtags?: (string | null)[] | null;
  readonly autoDetectionConfidence?: number | null;
  readonly wasManuallyCreated?: boolean | null;
  readonly requiresReview?: boolean | null;
  readonly totalInstancesRun?: number | null;
  readonly avgAttendance?: number | null;
  readonly lastMonthAttendance?: number | null;
  readonly gameInstances: AsyncCollection<Game>;
  readonly metrics: AsyncCollection<RecurringGameMetrics>;
  readonly notes?: string | null;
  readonly adminNotes?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy?: string | null;
  readonly lastEditedBy?: string | null;
  readonly lastEditedAt?: string | null;
}

export declare type RecurringGame = LazyLoading extends LazyLoadingDisabled ? EagerRecurringGame : LazyRecurringGame

export declare const RecurringGame: (new (init: ModelInit<RecurringGame>) => RecurringGame) & {
  copyOf(source: RecurringGame, mutator: (draft: MutableModel<RecurringGame>) => MutableModel<RecurringGame> | void): RecurringGame;
}

type EagerTournamentSeriesTitle = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<TournamentSeriesTitle, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly title: string;
  readonly aliases?: (string | null)[] | null;
  readonly seriesCategory?: SeriesCategory | keyof typeof SeriesCategory | null;
  readonly seriesInstances?: (TournamentSeries | null)[] | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyTournamentSeriesTitle = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<TournamentSeriesTitle, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly title: string;
  readonly aliases?: (string | null)[] | null;
  readonly seriesCategory?: SeriesCategory | keyof typeof SeriesCategory | null;
  readonly seriesInstances: AsyncCollection<TournamentSeries>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type TournamentSeriesTitle = LazyLoading extends LazyLoadingDisabled ? EagerTournamentSeriesTitle : LazyTournamentSeriesTitle

export declare const TournamentSeriesTitle: (new (init: ModelInit<TournamentSeriesTitle>) => TournamentSeriesTitle) & {
  copyOf(source: TournamentSeriesTitle, mutator: (draft: MutableModel<TournamentSeriesTitle>) => MutableModel<TournamentSeriesTitle> | void): TournamentSeriesTitle;
}

type EagerTournamentSeries = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<TournamentSeries, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly name: string;
  readonly year: number;
  readonly quarter?: number | null;
  readonly month?: number | null;
  readonly entityId?: string | null;
  readonly entity?: Entity | null;
  readonly seriesCategory: SeriesCategory | keyof typeof SeriesCategory;
  readonly holidayType?: HolidayType | keyof typeof HolidayType | null;
  readonly status: SeriesStatus | keyof typeof SeriesStatus;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly numberOfEvents?: number | null;
  readonly guaranteedPrizepool?: number | null;
  readonly estimatedPrizepool?: number | null;
  readonly actualPrizepool?: number | null;
  readonly tournamentSeriesTitleId: string;
  readonly title?: TournamentSeriesTitle | null;
  readonly venueId?: string | null;
  readonly venue?: Venue | null;
  readonly games?: (Game | null)[] | null;
  readonly metrics?: (TournamentSeriesMetrics | null)[] | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyTournamentSeries = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<TournamentSeries, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly name: string;
  readonly year: number;
  readonly quarter?: number | null;
  readonly month?: number | null;
  readonly entityId?: string | null;
  readonly entity: AsyncItem<Entity | undefined>;
  readonly seriesCategory: SeriesCategory | keyof typeof SeriesCategory;
  readonly holidayType?: HolidayType | keyof typeof HolidayType | null;
  readonly status: SeriesStatus | keyof typeof SeriesStatus;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly numberOfEvents?: number | null;
  readonly guaranteedPrizepool?: number | null;
  readonly estimatedPrizepool?: number | null;
  readonly actualPrizepool?: number | null;
  readonly tournamentSeriesTitleId: string;
  readonly title: AsyncItem<TournamentSeriesTitle | undefined>;
  readonly venueId?: string | null;
  readonly venue: AsyncItem<Venue | undefined>;
  readonly games: AsyncCollection<Game>;
  readonly metrics: AsyncCollection<TournamentSeriesMetrics>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type TournamentSeries = LazyLoading extends LazyLoadingDisabled ? EagerTournamentSeries : LazyTournamentSeries

export declare const TournamentSeries: (new (init: ModelInit<TournamentSeries>) => TournamentSeries) & {
  copyOf(source: TournamentSeries, mutator: (draft: MutableModel<TournamentSeries>) => MutableModel<TournamentSeries> | void): TournamentSeries;
}

type EagerPlayer = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<Player, 'id'>;
    readOnlyFields: 'createdAt';
  };
  readonly id: string;
  readonly primaryEntityId?: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly status: PlayerAccountStatus | keyof typeof PlayerAccountStatus;
  readonly category: PlayerAccountCategory | keyof typeof PlayerAccountCategory;
  readonly targetingClassification: PlayerTargetingClassification | keyof typeof PlayerTargetingClassification;
  readonly registrationDate: string;
  readonly firstGamePlayed?: string | null;
  readonly lastPlayedDate?: string | null;
  readonly creditBalance?: number | null;
  readonly pointsBalance?: number | null;
  readonly playerSummary?: PlayerSummary | null;
  readonly knownIdentities?: (KnownPlayerIdentity | null)[] | null;
  readonly marketingPreferences?: PlayerMarketingPreferences | null;
  readonly marketingMessages?: (PlayerMarketingMessage | null)[] | null;
  readonly playerVenues?: (PlayerVenue | null)[] | null;
  readonly playerEntries?: (PlayerEntry | null)[] | null;
  readonly playerResults?: (PlayerResult | null)[] | null;
  readonly playerTickets?: (PlayerTicket | null)[] | null;
  readonly playerTransactions?: (PlayerTransaction | null)[] | null;
  readonly playerCredits?: (PlayerCredits | null)[] | null;
  readonly playerPoints?: (PlayerPoints | null)[] | null;
  readonly venueAssignmentStatus?: VenueAssignmentStatus | keyof typeof VenueAssignmentStatus | null;
  readonly registrationVenueId?: string | null;
  readonly registrationVenue?: Venue | null;
  readonly updatedAt: string;
  readonly createdAt?: string | null;
}

type LazyPlayer = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<Player, 'id'>;
    readOnlyFields: 'createdAt';
  };
  readonly id: string;
  readonly primaryEntityId?: string | null;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone?: string | null;
  readonly email?: string | null;
  readonly status: PlayerAccountStatus | keyof typeof PlayerAccountStatus;
  readonly category: PlayerAccountCategory | keyof typeof PlayerAccountCategory;
  readonly targetingClassification: PlayerTargetingClassification | keyof typeof PlayerTargetingClassification;
  readonly registrationDate: string;
  readonly firstGamePlayed?: string | null;
  readonly lastPlayedDate?: string | null;
  readonly creditBalance?: number | null;
  readonly pointsBalance?: number | null;
  readonly playerSummary: AsyncItem<PlayerSummary | undefined>;
  readonly knownIdentities: AsyncCollection<KnownPlayerIdentity>;
  readonly marketingPreferences: AsyncItem<PlayerMarketingPreferences | undefined>;
  readonly marketingMessages: AsyncCollection<PlayerMarketingMessage>;
  readonly playerVenues: AsyncCollection<PlayerVenue>;
  readonly playerEntries: AsyncCollection<PlayerEntry>;
  readonly playerResults: AsyncCollection<PlayerResult>;
  readonly playerTickets: AsyncCollection<PlayerTicket>;
  readonly playerTransactions: AsyncCollection<PlayerTransaction>;
  readonly playerCredits: AsyncCollection<PlayerCredits>;
  readonly playerPoints: AsyncCollection<PlayerPoints>;
  readonly venueAssignmentStatus?: VenueAssignmentStatus | keyof typeof VenueAssignmentStatus | null;
  readonly registrationVenueId?: string | null;
  readonly registrationVenue: AsyncItem<Venue | undefined>;
  readonly updatedAt: string;
  readonly createdAt?: string | null;
}

export declare type Player = LazyLoading extends LazyLoadingDisabled ? EagerPlayer : LazyPlayer

export declare const Player: (new (init: ModelInit<Player>) => Player) & {
  copyOf(source: Player, mutator: (draft: MutableModel<Player>) => MutableModel<Player> | void): Player;
}

type EagerPlayerSummary = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerSummary, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly playerId: string;
  readonly gamesPlayedLast30Days?: number | null;
  readonly gamesPlayedLast90Days?: number | null;
  readonly gamesPlayedAllTime?: number | null;
  readonly averageFinishPosition?: number | null;
  readonly netBalance?: number | null;
  readonly player?: Player | null;
  readonly sessionsPlayed?: number | null;
  readonly tournamentsPlayed?: number | null;
  readonly cashGamesPlayed?: number | null;
  readonly venuesVisited?: number | null;
  readonly tournamentWinnings?: number | null;
  readonly tournamentBuyIns?: number | null;
  readonly tournamentITM?: number | null;
  readonly tournamentsCashed?: number | null;
  readonly cashGameWinnings?: number | null;
  readonly cashGameBuyIns?: number | null;
  readonly totalWinnings?: number | null;
  readonly totalBuyIns?: number | null;
  readonly lastPlayed: string;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyPlayerSummary = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerSummary, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly playerId: string;
  readonly gamesPlayedLast30Days?: number | null;
  readonly gamesPlayedLast90Days?: number | null;
  readonly gamesPlayedAllTime?: number | null;
  readonly averageFinishPosition?: number | null;
  readonly netBalance?: number | null;
  readonly player: AsyncItem<Player | undefined>;
  readonly sessionsPlayed?: number | null;
  readonly tournamentsPlayed?: number | null;
  readonly cashGamesPlayed?: number | null;
  readonly venuesVisited?: number | null;
  readonly tournamentWinnings?: number | null;
  readonly tournamentBuyIns?: number | null;
  readonly tournamentITM?: number | null;
  readonly tournamentsCashed?: number | null;
  readonly cashGameWinnings?: number | null;
  readonly cashGameBuyIns?: number | null;
  readonly totalWinnings?: number | null;
  readonly totalBuyIns?: number | null;
  readonly lastPlayed: string;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type PlayerSummary = LazyLoading extends LazyLoadingDisabled ? EagerPlayerSummary : LazyPlayerSummary

export declare const PlayerSummary: (new (init: ModelInit<PlayerSummary>) => PlayerSummary) & {
  copyOf(source: PlayerSummary, mutator: (draft: MutableModel<PlayerSummary>) => MutableModel<PlayerSummary> | void): PlayerSummary;
}

type EagerPlayerEntry = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerEntry, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly playerId: string;
  readonly gameId: string;
  readonly venueId?: string | null;
  readonly entityId?: string | null;
  readonly status: PlayerEntryStatus | keyof typeof PlayerEntryStatus;
  readonly registrationTime: string;
  readonly eliminationTime?: string | null;
  readonly gameStartDateTime: string;
  readonly lastKnownStackSize?: number | null;
  readonly tableNumber?: number | null;
  readonly seatNumber?: number | null;
  readonly numberOfReEntries?: number | null;
  readonly player?: Player | null;
  readonly game?: Game | null;
  readonly isMultiDayTournament?: boolean | null;
  readonly qualifyingGameId?: string | null;
  readonly entryType?: EntryType | keyof typeof EntryType | null;
  readonly recordType?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyPlayerEntry = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerEntry, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly playerId: string;
  readonly gameId: string;
  readonly venueId?: string | null;
  readonly entityId?: string | null;
  readonly status: PlayerEntryStatus | keyof typeof PlayerEntryStatus;
  readonly registrationTime: string;
  readonly eliminationTime?: string | null;
  readonly gameStartDateTime: string;
  readonly lastKnownStackSize?: number | null;
  readonly tableNumber?: number | null;
  readonly seatNumber?: number | null;
  readonly numberOfReEntries?: number | null;
  readonly player: AsyncItem<Player | undefined>;
  readonly game: AsyncItem<Game | undefined>;
  readonly isMultiDayTournament?: boolean | null;
  readonly qualifyingGameId?: string | null;
  readonly entryType?: EntryType | keyof typeof EntryType | null;
  readonly recordType?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type PlayerEntry = LazyLoading extends LazyLoadingDisabled ? EagerPlayerEntry : LazyPlayerEntry

export declare const PlayerEntry: (new (init: ModelInit<PlayerEntry>) => PlayerEntry) & {
  copyOf(source: PlayerEntry, mutator: (draft: MutableModel<PlayerEntry>) => MutableModel<PlayerEntry> | void): PlayerEntry;
}

type EagerPlayerResult = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerResult, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly finishingPlace?: number | null;
  readonly isMultiDayQualification?: boolean | null;
  readonly prizeWon?: boolean | null;
  readonly amountWon?: number | null;
  readonly totalRunners?: number | null;
  readonly pointsEarned?: number | null;
  readonly gameStartDateTime: string;
  readonly playerId: string;
  readonly player?: Player | null;
  readonly gameId: string;
  readonly game?: Game | null;
  readonly recordType?: string | null;
  readonly venueId?: string | null;
  readonly entityId?: string | null;
  readonly isConsolidatedRecord?: boolean | null;
  readonly sourceEntryCount?: number | null;
  readonly sourceBuyInCount?: number | null;
  readonly totalBuyInsPaid?: number | null;
  readonly netProfitLoss?: number | null;
  readonly consolidatedIntoGameId?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyPlayerResult = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerResult, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly finishingPlace?: number | null;
  readonly isMultiDayQualification?: boolean | null;
  readonly prizeWon?: boolean | null;
  readonly amountWon?: number | null;
  readonly totalRunners?: number | null;
  readonly pointsEarned?: number | null;
  readonly gameStartDateTime: string;
  readonly playerId: string;
  readonly player: AsyncItem<Player | undefined>;
  readonly gameId: string;
  readonly game: AsyncItem<Game | undefined>;
  readonly recordType?: string | null;
  readonly venueId?: string | null;
  readonly entityId?: string | null;
  readonly isConsolidatedRecord?: boolean | null;
  readonly sourceEntryCount?: number | null;
  readonly sourceBuyInCount?: number | null;
  readonly totalBuyInsPaid?: number | null;
  readonly netProfitLoss?: number | null;
  readonly consolidatedIntoGameId?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type PlayerResult = LazyLoading extends LazyLoadingDisabled ? EagerPlayerResult : LazyPlayerResult

export declare const PlayerResult: (new (init: ModelInit<PlayerResult>) => PlayerResult) & {
  copyOf(source: PlayerResult, mutator: (draft: MutableModel<PlayerResult>) => MutableModel<PlayerResult> | void): PlayerResult;
}

type EagerPlayerVenue = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerVenue, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly playerId: string;
  readonly player?: Player | null;
  readonly venueId: string;
  readonly venue?: Venue | null;
  readonly entityId: string;
  readonly visityKey?: string | null;
  readonly canonicalVenueId?: string | null;
  readonly totalGamesPlayed?: number | null;
  readonly averageBuyIn?: number | null;
  readonly totalBuyIns?: number | null;
  readonly totalWinnings?: number | null;
  readonly netProfit?: number | null;
  readonly firstPlayedDate?: string | null;
  readonly lastPlayedDate?: string | null;
  readonly targetingClassification: PlayerVenueTargetingClassification | keyof typeof PlayerVenueTargetingClassification;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyPlayerVenue = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerVenue, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly playerId: string;
  readonly player: AsyncItem<Player | undefined>;
  readonly venueId: string;
  readonly venue: AsyncItem<Venue | undefined>;
  readonly entityId: string;
  readonly visityKey?: string | null;
  readonly canonicalVenueId?: string | null;
  readonly totalGamesPlayed?: number | null;
  readonly averageBuyIn?: number | null;
  readonly totalBuyIns?: number | null;
  readonly totalWinnings?: number | null;
  readonly netProfit?: number | null;
  readonly firstPlayedDate?: string | null;
  readonly lastPlayedDate?: string | null;
  readonly targetingClassification: PlayerVenueTargetingClassification | keyof typeof PlayerVenueTargetingClassification;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type PlayerVenue = LazyLoading extends LazyLoadingDisabled ? EagerPlayerVenue : LazyPlayerVenue

export declare const PlayerVenue: (new (init: ModelInit<PlayerVenue>) => PlayerVenue) & {
  copyOf(source: PlayerVenue, mutator: (draft: MutableModel<PlayerVenue>) => MutableModel<PlayerVenue> | void): PlayerVenue;
}

type EagerPlayerTransaction = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerTransaction, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly type: TransactionType | keyof typeof TransactionType;
  readonly amount: number;
  readonly rake?: number | null;
  readonly paymentSource: PaymentSourceType | keyof typeof PaymentSourceType;
  readonly transactionDate: string;
  readonly notes?: string | null;
  readonly playerId: string;
  readonly player?: Player | null;
  readonly gameId?: string | null;
  readonly venueId?: string | null;
  readonly entityId?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyPlayerTransaction = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerTransaction, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly type: TransactionType | keyof typeof TransactionType;
  readonly amount: number;
  readonly rake?: number | null;
  readonly paymentSource: PaymentSourceType | keyof typeof PaymentSourceType;
  readonly transactionDate: string;
  readonly notes?: string | null;
  readonly playerId: string;
  readonly player: AsyncItem<Player | undefined>;
  readonly gameId?: string | null;
  readonly venueId?: string | null;
  readonly entityId?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type PlayerTransaction = LazyLoading extends LazyLoadingDisabled ? EagerPlayerTransaction : LazyPlayerTransaction

export declare const PlayerTransaction: (new (init: ModelInit<PlayerTransaction>) => PlayerTransaction) & {
  copyOf(source: PlayerTransaction, mutator: (draft: MutableModel<PlayerTransaction>) => MutableModel<PlayerTransaction> | void): PlayerTransaction;
}

type EagerPlayerCredits = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerCredits, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly type: CreditTransactionType | keyof typeof CreditTransactionType;
  readonly changeAmount: number;
  readonly balanceAfter: number;
  readonly transactionDate: string;
  readonly reason?: string | null;
  readonly expiryDate?: string | null;
  readonly playerId: string;
  readonly player?: Player | null;
  readonly relatedGameId?: string | null;
  readonly relatedTransactionId?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyPlayerCredits = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerCredits, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly type: CreditTransactionType | keyof typeof CreditTransactionType;
  readonly changeAmount: number;
  readonly balanceAfter: number;
  readonly transactionDate: string;
  readonly reason?: string | null;
  readonly expiryDate?: string | null;
  readonly playerId: string;
  readonly player: AsyncItem<Player | undefined>;
  readonly relatedGameId?: string | null;
  readonly relatedTransactionId?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type PlayerCredits = LazyLoading extends LazyLoadingDisabled ? EagerPlayerCredits : LazyPlayerCredits

export declare const PlayerCredits: (new (init: ModelInit<PlayerCredits>) => PlayerCredits) & {
  copyOf(source: PlayerCredits, mutator: (draft: MutableModel<PlayerCredits>) => MutableModel<PlayerCredits> | void): PlayerCredits;
}

type EagerPlayerPoints = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerPoints, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly type: PointsTransactionType | keyof typeof PointsTransactionType;
  readonly changeAmount: number;
  readonly balanceAfter: number;
  readonly transactionDate: string;
  readonly reason?: string | null;
  readonly expiryDate?: string | null;
  readonly playerId: string;
  readonly player?: Player | null;
  readonly relatedGameId?: string | null;
  readonly relatedTransactionId?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyPlayerPoints = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerPoints, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly type: PointsTransactionType | keyof typeof PointsTransactionType;
  readonly changeAmount: number;
  readonly balanceAfter: number;
  readonly transactionDate: string;
  readonly reason?: string | null;
  readonly expiryDate?: string | null;
  readonly playerId: string;
  readonly player: AsyncItem<Player | undefined>;
  readonly relatedGameId?: string | null;
  readonly relatedTransactionId?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type PlayerPoints = LazyLoading extends LazyLoadingDisabled ? EagerPlayerPoints : LazyPlayerPoints

export declare const PlayerPoints: (new (init: ModelInit<PlayerPoints>) => PlayerPoints) & {
  copyOf(source: PlayerPoints, mutator: (draft: MutableModel<PlayerPoints>) => MutableModel<PlayerPoints> | void): PlayerPoints;
}

type EagerKnownPlayerIdentity = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<KnownPlayerIdentity, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly sourceSystem: string;
  readonly identityValue: string;
  readonly identityType: string;
  readonly playerId: string;
  readonly player?: Player | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyKnownPlayerIdentity = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<KnownPlayerIdentity, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly sourceSystem: string;
  readonly identityValue: string;
  readonly identityType: string;
  readonly playerId: string;
  readonly player: AsyncItem<Player | undefined>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type KnownPlayerIdentity = LazyLoading extends LazyLoadingDisabled ? EagerKnownPlayerIdentity : LazyKnownPlayerIdentity

export declare const KnownPlayerIdentity: (new (init: ModelInit<KnownPlayerIdentity>) => KnownPlayerIdentity) & {
  copyOf(source: KnownPlayerIdentity, mutator: (draft: MutableModel<KnownPlayerIdentity>) => MutableModel<KnownPlayerIdentity> | void): KnownPlayerIdentity;
}

type EagerTicketTemplate = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<TicketTemplate, 'id'>;
  };
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
  readonly value: number;
  readonly validityDays: number;
  readonly originGameId?: string | null;
  readonly targetGameId?: string | null;
  readonly entityId?: string | null;
  readonly playerTickets?: (PlayerTicket | null)[] | null;
  readonly isActive?: boolean | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type LazyTicketTemplate = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<TicketTemplate, 'id'>;
  };
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
  readonly value: number;
  readonly validityDays: number;
  readonly originGameId?: string | null;
  readonly targetGameId?: string | null;
  readonly entityId?: string | null;
  readonly playerTickets: AsyncCollection<PlayerTicket>;
  readonly isActive?: boolean | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type TicketTemplate = LazyLoading extends LazyLoadingDisabled ? EagerTicketTemplate : LazyTicketTemplate

export declare const TicketTemplate: (new (init: ModelInit<TicketTemplate>) => TicketTemplate) & {
  copyOf(source: TicketTemplate, mutator: (draft: MutableModel<TicketTemplate>) => MutableModel<TicketTemplate> | void): TicketTemplate;
}

type EagerPlayerTicket = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerTicket, 'id'>;
  };
  readonly id: string;
  readonly playerId: string;
  readonly player?: Player | null;
  readonly ticketTemplateId: string;
  readonly ticketTemplate?: TicketTemplate | null;
  readonly wonFromGameId?: string | null;
  readonly wonFromGame?: Game | null;
  readonly wonFromPosition?: number | null;
  readonly entityId?: string | null;
  readonly venueId?: string | null;
  readonly status: TicketStatus | keyof typeof TicketStatus;
  readonly assignedAt: string;
  readonly expiryDate?: string | null;
  readonly usedInGameId?: string | null;
  readonly usedAt?: string | null;
  readonly ticketValue?: number | null;
  readonly programName?: string | null;
  readonly awardReason?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type LazyPlayerTicket = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerTicket, 'id'>;
  };
  readonly id: string;
  readonly playerId: string;
  readonly player: AsyncItem<Player | undefined>;
  readonly ticketTemplateId: string;
  readonly ticketTemplate: AsyncItem<TicketTemplate | undefined>;
  readonly wonFromGameId?: string | null;
  readonly wonFromGame: AsyncItem<Game | undefined>;
  readonly wonFromPosition?: number | null;
  readonly entityId?: string | null;
  readonly venueId?: string | null;
  readonly status: TicketStatus | keyof typeof TicketStatus;
  readonly assignedAt: string;
  readonly expiryDate?: string | null;
  readonly usedInGameId?: string | null;
  readonly usedAt?: string | null;
  readonly ticketValue?: number | null;
  readonly programName?: string | null;
  readonly awardReason?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type PlayerTicket = LazyLoading extends LazyLoadingDisabled ? EagerPlayerTicket : LazyPlayerTicket

export declare const PlayerTicket: (new (init: ModelInit<PlayerTicket>) => PlayerTicket) & {
  copyOf(source: PlayerTicket, mutator: (draft: MutableModel<PlayerTicket>) => MutableModel<PlayerTicket> | void): PlayerTicket;
}

type EagerMarketingMessage = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<MarketingMessage, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly name: string;
  readonly subject?: string | null;
  readonly emailBody?: string | null;
  readonly smsBody?: string | null;
  readonly sentMessages?: (PlayerMarketingMessage | null)[] | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyMarketingMessage = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<MarketingMessage, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly name: string;
  readonly subject?: string | null;
  readonly emailBody?: string | null;
  readonly smsBody?: string | null;
  readonly sentMessages: AsyncCollection<PlayerMarketingMessage>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type MarketingMessage = LazyLoading extends LazyLoadingDisabled ? EagerMarketingMessage : LazyMarketingMessage

export declare const MarketingMessage: (new (init: ModelInit<MarketingMessage>) => MarketingMessage) & {
  copyOf(source: MarketingMessage, mutator: (draft: MutableModel<MarketingMessage>) => MutableModel<MarketingMessage> | void): MarketingMessage;
}

type EagerPlayerMarketingMessage = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerMarketingMessage, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly status: MessageStatus | keyof typeof MessageStatus;
  readonly sentAt: string;
  readonly playerId: string;
  readonly marketingMessageId: string;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyPlayerMarketingMessage = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerMarketingMessage, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly status: MessageStatus | keyof typeof MessageStatus;
  readonly sentAt: string;
  readonly playerId: string;
  readonly marketingMessageId: string;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type PlayerMarketingMessage = LazyLoading extends LazyLoadingDisabled ? EagerPlayerMarketingMessage : LazyPlayerMarketingMessage

export declare const PlayerMarketingMessage: (new (init: ModelInit<PlayerMarketingMessage>) => PlayerMarketingMessage) & {
  copyOf(source: PlayerMarketingMessage, mutator: (draft: MutableModel<PlayerMarketingMessage>) => MutableModel<PlayerMarketingMessage> | void): PlayerMarketingMessage;
}

type EagerPlayerMarketingPreferences = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerMarketingPreferences, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly optOutSms?: boolean | null;
  readonly optOutEmail?: boolean | null;
  readonly playerId: string;
  readonly player?: Player | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyPlayerMarketingPreferences = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerMarketingPreferences, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly optOutSms?: boolean | null;
  readonly optOutEmail?: boolean | null;
  readonly playerId: string;
  readonly player: AsyncItem<Player | undefined>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type PlayerMarketingPreferences = LazyLoading extends LazyLoadingDisabled ? EagerPlayerMarketingPreferences : LazyPlayerMarketingPreferences

export declare const PlayerMarketingPreferences: (new (init: ModelInit<PlayerMarketingPreferences>) => PlayerMarketingPreferences) & {
  copyOf(source: PlayerMarketingPreferences, mutator: (draft: MutableModel<PlayerMarketingPreferences>) => MutableModel<PlayerMarketingPreferences> | void): PlayerMarketingPreferences;
}

type EagerEntityMetrics = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<EntityMetrics, 'id'>;
  };
  readonly id: string;
  readonly entityId: string;
  readonly entity?: Entity | null;
  readonly timeRange: string;
  readonly seriesType: string;
  readonly totalVenues: number;
  readonly activeVenues: number;
  readonly inactiveVenues: number;
  readonly totalGames: number;
  readonly totalSeriesGames: number;
  readonly totalRegularGames: number;
  readonly totalRecurringGames: number;
  readonly totalOneOffGames: number;
  readonly totalActiveRecurringGameTypes: number;
  readonly totalActiveTournamentSeries: number;
  readonly totalEntries: number;
  readonly totalUniquePlayers: number;
  readonly totalReentries: number;
  readonly totalAddons: number;
  readonly totalPrizepool: number;
  readonly totalRevenue: number;
  readonly totalCost: number;
  readonly totalProfit: number;
  readonly totalRakeRevenue: number;
  readonly totalVenueFees: number;
  readonly totalStaffCost: number;
  readonly totalVenueRentalCost: number;
  readonly totalMarketingCost: number;
  readonly totalOperationsCost: number;
  readonly avgEntriesPerGame?: number | null;
  readonly avgPrizepoolPerGame?: number | null;
  readonly avgProfitPerGame?: number | null;
  readonly avgRevenuePerGame?: number | null;
  readonly avgGamesPerVenue?: number | null;
  readonly avgPlayersPerVenue?: number | null;
  readonly profitMargin?: number | null;
  readonly rakeMarginPercent?: number | null;
  readonly firstGameDate?: string | null;
  readonly firstGameDaysAgo?: number | null;
  readonly latestGameDate?: string | null;
  readonly latestGameDaysAgo?: number | null;
  readonly profitTrend?: string | null;
  readonly profitTrendPercent?: number | null;
  readonly playerGrowthTrend?: string | null;
  readonly playerGrowthTrendPercent?: number | null;
  readonly revenueGrowthTrend?: string | null;
  readonly revenueGrowthTrendPercent?: number | null;
  readonly topVenuesByRevenue?: string | null;
  readonly topVenuesByAttendance?: string | null;
  readonly topRecurringGames?: string | null;
  readonly topTournamentSeries?: string | null;
  readonly calculatedAt: string;
  readonly calculatedBy?: string | null;
  readonly calculationDurationMs?: number | null;
  readonly snapshotsIncluded?: number | null;
  readonly venuesIncluded?: number | null;
  readonly recurringGamesIncluded?: number | null;
  readonly tournamentSeriesIncluded?: number | null;
  readonly dateRangeStart?: string | null;
  readonly dateRangeEnd?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type LazyEntityMetrics = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<EntityMetrics, 'id'>;
  };
  readonly id: string;
  readonly entityId: string;
  readonly entity: AsyncItem<Entity | undefined>;
  readonly timeRange: string;
  readonly seriesType: string;
  readonly totalVenues: number;
  readonly activeVenues: number;
  readonly inactiveVenues: number;
  readonly totalGames: number;
  readonly totalSeriesGames: number;
  readonly totalRegularGames: number;
  readonly totalRecurringGames: number;
  readonly totalOneOffGames: number;
  readonly totalActiveRecurringGameTypes: number;
  readonly totalActiveTournamentSeries: number;
  readonly totalEntries: number;
  readonly totalUniquePlayers: number;
  readonly totalReentries: number;
  readonly totalAddons: number;
  readonly totalPrizepool: number;
  readonly totalRevenue: number;
  readonly totalCost: number;
  readonly totalProfit: number;
  readonly totalRakeRevenue: number;
  readonly totalVenueFees: number;
  readonly totalStaffCost: number;
  readonly totalVenueRentalCost: number;
  readonly totalMarketingCost: number;
  readonly totalOperationsCost: number;
  readonly avgEntriesPerGame?: number | null;
  readonly avgPrizepoolPerGame?: number | null;
  readonly avgProfitPerGame?: number | null;
  readonly avgRevenuePerGame?: number | null;
  readonly avgGamesPerVenue?: number | null;
  readonly avgPlayersPerVenue?: number | null;
  readonly profitMargin?: number | null;
  readonly rakeMarginPercent?: number | null;
  readonly firstGameDate?: string | null;
  readonly firstGameDaysAgo?: number | null;
  readonly latestGameDate?: string | null;
  readonly latestGameDaysAgo?: number | null;
  readonly profitTrend?: string | null;
  readonly profitTrendPercent?: number | null;
  readonly playerGrowthTrend?: string | null;
  readonly playerGrowthTrendPercent?: number | null;
  readonly revenueGrowthTrend?: string | null;
  readonly revenueGrowthTrendPercent?: number | null;
  readonly topVenuesByRevenue?: string | null;
  readonly topVenuesByAttendance?: string | null;
  readonly topRecurringGames?: string | null;
  readonly topTournamentSeries?: string | null;
  readonly calculatedAt: string;
  readonly calculatedBy?: string | null;
  readonly calculationDurationMs?: number | null;
  readonly snapshotsIncluded?: number | null;
  readonly venuesIncluded?: number | null;
  readonly recurringGamesIncluded?: number | null;
  readonly tournamentSeriesIncluded?: number | null;
  readonly dateRangeStart?: string | null;
  readonly dateRangeEnd?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type EntityMetrics = LazyLoading extends LazyLoadingDisabled ? EagerEntityMetrics : LazyEntityMetrics

export declare const EntityMetrics: (new (init: ModelInit<EntityMetrics>) => EntityMetrics) & {
  copyOf(source: EntityMetrics, mutator: (draft: MutableModel<EntityMetrics>) => MutableModel<EntityMetrics> | void): EntityMetrics;
}

type EagerVenueMetrics = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<VenueMetrics, 'id'>;
  };
  readonly id: string;
  readonly entityId: string;
  readonly venueId: string;
  readonly venueName: string;
  readonly timeRange: string;
  readonly seriesType: string;
  readonly totalGames: number;
  readonly totalSeriesGames: number;
  readonly totalRegularGames: number;
  readonly totalRecurringGames: number;
  readonly totalOneOffGames: number;
  readonly totalActiveRecurringGameTypes: number;
  readonly totalActiveTournamentSeries: number;
  readonly totalTournaments: number;
  readonly totalCashGames: number;
  readonly totalNLHE: number;
  readonly totalPLO: number;
  readonly totalOther: number;
  readonly totalEntries: number;
  readonly totalUniquePlayers: number;
  readonly totalReentries: number;
  readonly totalAddons: number;
  readonly returningPlayers?: number | null;
  readonly newPlayers?: number | null;
  readonly totalPrizepool: number;
  readonly totalRevenue: number;
  readonly totalCost: number;
  readonly totalProfit: number;
  readonly totalRakeRevenue: number;
  readonly totalVenueFees: number;
  readonly totalStaffCost: number;
  readonly totalVenueRentalCost: number;
  readonly totalMarketingCost: number;
  readonly avgEntriesPerGame?: number | null;
  readonly avgUniquePlayersPerGame?: number | null;
  readonly avgPrizepoolPerGame?: number | null;
  readonly avgRevenuePerGame?: number | null;
  readonly avgProfitPerGame?: number | null;
  readonly profitMargin?: number | null;
  readonly rakeMarginPercent?: number | null;
  readonly firstGameDate?: string | null;
  readonly firstGameDaysAgo?: number | null;
  readonly latestGameDate?: string | null;
  readonly latestGameDaysAgo?: number | null;
  readonly daysSinceLastGame?: number | null;
  readonly gamesByDayOfWeek?: string | null;
  readonly peakAttendanceDay?: string | null;
  readonly topRecurringGames?: string | null;
  readonly topBuyInLevels?: string | null;
  readonly topTournamentSeries?: string | null;
  readonly profitTrend?: string | null;
  readonly profitTrendPercent?: number | null;
  readonly attendanceTrend?: string | null;
  readonly attendanceTrendPercent?: number | null;
  readonly revenueGrowthTrend?: string | null;
  readonly revenueGrowthTrendPercent?: number | null;
  readonly overallHealth?: string | null;
  readonly profitability?: string | null;
  readonly consistency?: string | null;
  readonly calculatedAt: string;
  readonly calculatedBy?: string | null;
  readonly calculationDurationMs?: number | null;
  readonly snapshotsIncluded?: number | null;
  readonly recurringGamesIncluded?: number | null;
  readonly tournamentSeriesIncluded?: number | null;
  readonly dateRangeStart?: string | null;
  readonly dateRangeEnd?: string | null;
  readonly venue?: Venue | null;
  readonly entity?: Entity | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type LazyVenueMetrics = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<VenueMetrics, 'id'>;
  };
  readonly id: string;
  readonly entityId: string;
  readonly venueId: string;
  readonly venueName: string;
  readonly timeRange: string;
  readonly seriesType: string;
  readonly totalGames: number;
  readonly totalSeriesGames: number;
  readonly totalRegularGames: number;
  readonly totalRecurringGames: number;
  readonly totalOneOffGames: number;
  readonly totalActiveRecurringGameTypes: number;
  readonly totalActiveTournamentSeries: number;
  readonly totalTournaments: number;
  readonly totalCashGames: number;
  readonly totalNLHE: number;
  readonly totalPLO: number;
  readonly totalOther: number;
  readonly totalEntries: number;
  readonly totalUniquePlayers: number;
  readonly totalReentries: number;
  readonly totalAddons: number;
  readonly returningPlayers?: number | null;
  readonly newPlayers?: number | null;
  readonly totalPrizepool: number;
  readonly totalRevenue: number;
  readonly totalCost: number;
  readonly totalProfit: number;
  readonly totalRakeRevenue: number;
  readonly totalVenueFees: number;
  readonly totalStaffCost: number;
  readonly totalVenueRentalCost: number;
  readonly totalMarketingCost: number;
  readonly avgEntriesPerGame?: number | null;
  readonly avgUniquePlayersPerGame?: number | null;
  readonly avgPrizepoolPerGame?: number | null;
  readonly avgRevenuePerGame?: number | null;
  readonly avgProfitPerGame?: number | null;
  readonly profitMargin?: number | null;
  readonly rakeMarginPercent?: number | null;
  readonly firstGameDate?: string | null;
  readonly firstGameDaysAgo?: number | null;
  readonly latestGameDate?: string | null;
  readonly latestGameDaysAgo?: number | null;
  readonly daysSinceLastGame?: number | null;
  readonly gamesByDayOfWeek?: string | null;
  readonly peakAttendanceDay?: string | null;
  readonly topRecurringGames?: string | null;
  readonly topBuyInLevels?: string | null;
  readonly topTournamentSeries?: string | null;
  readonly profitTrend?: string | null;
  readonly profitTrendPercent?: number | null;
  readonly attendanceTrend?: string | null;
  readonly attendanceTrendPercent?: number | null;
  readonly revenueGrowthTrend?: string | null;
  readonly revenueGrowthTrendPercent?: number | null;
  readonly overallHealth?: string | null;
  readonly profitability?: string | null;
  readonly consistency?: string | null;
  readonly calculatedAt: string;
  readonly calculatedBy?: string | null;
  readonly calculationDurationMs?: number | null;
  readonly snapshotsIncluded?: number | null;
  readonly recurringGamesIncluded?: number | null;
  readonly tournamentSeriesIncluded?: number | null;
  readonly dateRangeStart?: string | null;
  readonly dateRangeEnd?: string | null;
  readonly venue: AsyncItem<Venue | undefined>;
  readonly entity: AsyncItem<Entity | undefined>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type VenueMetrics = LazyLoading extends LazyLoadingDisabled ? EagerVenueMetrics : LazyVenueMetrics

export declare const VenueMetrics: (new (init: ModelInit<VenueMetrics>) => VenueMetrics) & {
  copyOf(source: VenueMetrics, mutator: (draft: MutableModel<VenueMetrics>) => MutableModel<VenueMetrics> | void): VenueMetrics;
}

type EagerRecurringGameMetrics = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<RecurringGameMetrics, 'id'>;
  };
  readonly id: string;
  readonly entityId: string;
  readonly venueId?: string | null;
  readonly recurringGameId: string;
  readonly recurringGame?: RecurringGame | null;
  readonly recurringGameName: string;
  readonly timeRange: string;
  readonly seriesType: string;
  readonly totalInstances: number;
  readonly scheduledInstances: number;
  readonly actualInstances: number;
  readonly missedInstances: number;
  readonly runRate?: number | null;
  readonly totalEntries: number;
  readonly totalUniquePlayers: number;
  readonly totalReentries: number;
  readonly totalAddons: number;
  readonly regularPlayers?: number | null;
  readonly occasionalPlayers?: number | null;
  readonly oneTimePlayers?: number | null;
  readonly totalPrizepool: number;
  readonly totalRevenue: number;
  readonly totalCost: number;
  readonly totalProfit: number;
  readonly avgEntries?: number | null;
  readonly avgUniquePlayers?: number | null;
  readonly avgPrizepool?: number | null;
  readonly avgRevenue?: number | null;
  readonly avgProfit?: number | null;
  readonly stdDevEntries?: number | null;
  readonly stdDevProfit?: number | null;
  readonly minEntries?: number | null;
  readonly maxEntries?: number | null;
  readonly medianEntries?: number | null;
  readonly entriesCV?: number | null;
  readonly firstInstanceDate?: string | null;
  readonly firstInstanceDaysAgo?: number | null;
  readonly latestInstanceDate?: string | null;
  readonly latestInstanceDaysAgo?: number | null;
  readonly daysSinceLastInstance?: number | null;
  readonly avgEntriesByMonth?: string | null;
  readonly peakMonth?: string | null;
  readonly lowMonth?: string | null;
  readonly attendanceHealth?: string | null;
  readonly profitability?: string | null;
  readonly consistency?: string | null;
  readonly overallHealth?: string | null;
  readonly attendanceTrend?: string | null;
  readonly attendanceTrendPercent?: number | null;
  readonly profitTrend?: string | null;
  readonly profitTrendPercent?: number | null;
  readonly recentAvgEntries?: number | null;
  readonly longtermAvgEntries?: number | null;
  readonly entriesTrendDirection?: string | null;
  readonly regularPlayersList?: string | null;
  readonly playerRetentionRate?: number | null;
  readonly rankAtVenue?: number | null;
  readonly totalRecurringGamesAtVenue?: number | null;
  readonly avgEntriesEntityWide?: number | null;
  readonly performanceVsEntityAvg?: string | null;
  readonly calculatedAt: string;
  readonly calculatedBy?: string | null;
  readonly calculationDurationMs?: number | null;
  readonly snapshotsIncluded?: number | null;
  readonly dateRangeStart?: string | null;
  readonly dateRangeEnd?: string | null;
  readonly venue?: Venue | null;
  readonly entity?: Entity | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type LazyRecurringGameMetrics = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<RecurringGameMetrics, 'id'>;
  };
  readonly id: string;
  readonly entityId: string;
  readonly venueId?: string | null;
  readonly recurringGameId: string;
  readonly recurringGame: AsyncItem<RecurringGame | undefined>;
  readonly recurringGameName: string;
  readonly timeRange: string;
  readonly seriesType: string;
  readonly totalInstances: number;
  readonly scheduledInstances: number;
  readonly actualInstances: number;
  readonly missedInstances: number;
  readonly runRate?: number | null;
  readonly totalEntries: number;
  readonly totalUniquePlayers: number;
  readonly totalReentries: number;
  readonly totalAddons: number;
  readonly regularPlayers?: number | null;
  readonly occasionalPlayers?: number | null;
  readonly oneTimePlayers?: number | null;
  readonly totalPrizepool: number;
  readonly totalRevenue: number;
  readonly totalCost: number;
  readonly totalProfit: number;
  readonly avgEntries?: number | null;
  readonly avgUniquePlayers?: number | null;
  readonly avgPrizepool?: number | null;
  readonly avgRevenue?: number | null;
  readonly avgProfit?: number | null;
  readonly stdDevEntries?: number | null;
  readonly stdDevProfit?: number | null;
  readonly minEntries?: number | null;
  readonly maxEntries?: number | null;
  readonly medianEntries?: number | null;
  readonly entriesCV?: number | null;
  readonly firstInstanceDate?: string | null;
  readonly firstInstanceDaysAgo?: number | null;
  readonly latestInstanceDate?: string | null;
  readonly latestInstanceDaysAgo?: number | null;
  readonly daysSinceLastInstance?: number | null;
  readonly avgEntriesByMonth?: string | null;
  readonly peakMonth?: string | null;
  readonly lowMonth?: string | null;
  readonly attendanceHealth?: string | null;
  readonly profitability?: string | null;
  readonly consistency?: string | null;
  readonly overallHealth?: string | null;
  readonly attendanceTrend?: string | null;
  readonly attendanceTrendPercent?: number | null;
  readonly profitTrend?: string | null;
  readonly profitTrendPercent?: number | null;
  readonly recentAvgEntries?: number | null;
  readonly longtermAvgEntries?: number | null;
  readonly entriesTrendDirection?: string | null;
  readonly regularPlayersList?: string | null;
  readonly playerRetentionRate?: number | null;
  readonly rankAtVenue?: number | null;
  readonly totalRecurringGamesAtVenue?: number | null;
  readonly avgEntriesEntityWide?: number | null;
  readonly performanceVsEntityAvg?: string | null;
  readonly calculatedAt: string;
  readonly calculatedBy?: string | null;
  readonly calculationDurationMs?: number | null;
  readonly snapshotsIncluded?: number | null;
  readonly dateRangeStart?: string | null;
  readonly dateRangeEnd?: string | null;
  readonly venue: AsyncItem<Venue | undefined>;
  readonly entity: AsyncItem<Entity | undefined>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type RecurringGameMetrics = LazyLoading extends LazyLoadingDisabled ? EagerRecurringGameMetrics : LazyRecurringGameMetrics

export declare const RecurringGameMetrics: (new (init: ModelInit<RecurringGameMetrics>) => RecurringGameMetrics) & {
  copyOf(source: RecurringGameMetrics, mutator: (draft: MutableModel<RecurringGameMetrics>) => MutableModel<RecurringGameMetrics> | void): RecurringGameMetrics;
}

type EagerTournamentSeriesMetrics = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<TournamentSeriesMetrics, 'id'>;
  };
  readonly id: string;
  readonly entityId: string;
  readonly tournamentSeriesId: string;
  readonly tournamentSeries?: TournamentSeries | null;
  readonly seriesName: string;
  readonly timeRange: string;
  readonly seriesType: string;
  readonly totalEvents: number;
  readonly totalFlights: number;
  readonly uniqueVenues: number;
  readonly mainEventCount: number;
  readonly totalEntries: number;
  readonly totalUniquePlayers: number;
  readonly totalReentries: number;
  readonly totalAddons: number;
  readonly mainEventTotalEntries: number;
  readonly regularSeriesPlayers?: number | null;
  readonly occasionalSeriesPlayers?: number | null;
  readonly oneTimeSeriesPlayers?: number | null;
  readonly totalPrizepool: number;
  readonly totalRevenue: number;
  readonly totalCost: number;
  readonly totalProfit: number;
  readonly avgEntriesPerEvent?: number | null;
  readonly avgUniquePlayersPerEvent?: number | null;
  readonly avgPrizepoolPerEvent?: number | null;
  readonly avgRevenuePerEvent?: number | null;
  readonly avgProfitPerEvent?: number | null;
  readonly mainEventAvgEntries?: number | null;
  readonly stdDevEntries?: number | null;
  readonly minEntries?: number | null;
  readonly maxEntries?: number | null;
  readonly medianEntries?: number | null;
  readonly entriesCV?: number | null;
  readonly profitMargin?: number | null;
  readonly firstEventDate?: string | null;
  readonly firstEventDaysAgo?: number | null;
  readonly latestEventDate?: string | null;
  readonly latestEventDaysAgo?: number | null;
  readonly seriesDurationDays?: number | null;
  readonly profitability?: string | null;
  readonly consistency?: string | null;
  readonly overallHealth?: string | null;
  readonly topEventsByEntries?: string | null;
  readonly topEventsByProfit?: string | null;
  readonly calculatedAt: string;
  readonly calculatedBy: string;
  readonly calculationDurationMs?: number | null;
  readonly snapshotsIncluded: number;
  readonly parentSnapshotsIncluded: number;
  readonly dateRangeStart?: string | null;
  readonly dateRangeEnd?: string | null;
  readonly entity?: Entity | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type LazyTournamentSeriesMetrics = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<TournamentSeriesMetrics, 'id'>;
  };
  readonly id: string;
  readonly entityId: string;
  readonly tournamentSeriesId: string;
  readonly tournamentSeries: AsyncItem<TournamentSeries | undefined>;
  readonly seriesName: string;
  readonly timeRange: string;
  readonly seriesType: string;
  readonly totalEvents: number;
  readonly totalFlights: number;
  readonly uniqueVenues: number;
  readonly mainEventCount: number;
  readonly totalEntries: number;
  readonly totalUniquePlayers: number;
  readonly totalReentries: number;
  readonly totalAddons: number;
  readonly mainEventTotalEntries: number;
  readonly regularSeriesPlayers?: number | null;
  readonly occasionalSeriesPlayers?: number | null;
  readonly oneTimeSeriesPlayers?: number | null;
  readonly totalPrizepool: number;
  readonly totalRevenue: number;
  readonly totalCost: number;
  readonly totalProfit: number;
  readonly avgEntriesPerEvent?: number | null;
  readonly avgUniquePlayersPerEvent?: number | null;
  readonly avgPrizepoolPerEvent?: number | null;
  readonly avgRevenuePerEvent?: number | null;
  readonly avgProfitPerEvent?: number | null;
  readonly mainEventAvgEntries?: number | null;
  readonly stdDevEntries?: number | null;
  readonly minEntries?: number | null;
  readonly maxEntries?: number | null;
  readonly medianEntries?: number | null;
  readonly entriesCV?: number | null;
  readonly profitMargin?: number | null;
  readonly firstEventDate?: string | null;
  readonly firstEventDaysAgo?: number | null;
  readonly latestEventDate?: string | null;
  readonly latestEventDaysAgo?: number | null;
  readonly seriesDurationDays?: number | null;
  readonly profitability?: string | null;
  readonly consistency?: string | null;
  readonly overallHealth?: string | null;
  readonly topEventsByEntries?: string | null;
  readonly topEventsByProfit?: string | null;
  readonly calculatedAt: string;
  readonly calculatedBy: string;
  readonly calculationDurationMs?: number | null;
  readonly snapshotsIncluded: number;
  readonly parentSnapshotsIncluded: number;
  readonly dateRangeStart?: string | null;
  readonly dateRangeEnd?: string | null;
  readonly entity: AsyncItem<Entity | undefined>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type TournamentSeriesMetrics = LazyLoading extends LazyLoadingDisabled ? EagerTournamentSeriesMetrics : LazyTournamentSeriesMetrics

export declare const TournamentSeriesMetrics: (new (init: ModelInit<TournamentSeriesMetrics>) => TournamentSeriesMetrics) & {
  copyOf(source: TournamentSeriesMetrics, mutator: (draft: MutableModel<TournamentSeriesMetrics>) => MutableModel<TournamentSeriesMetrics> | void): TournamentSeriesMetrics;
}

type EagerScraperJob = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<ScraperJob, 'id'>;
  };
  readonly id: string;
  readonly jobId: string;
  readonly triggerSource: ScraperJobTriggerSource | keyof typeof ScraperJobTriggerSource;
  readonly triggeredBy?: string | null;
  readonly startTime: string;
  readonly endTime?: string | null;
  readonly durationSeconds?: number | null;
  readonly maxGames?: number | null;
  readonly targetURLs?: (string | null)[] | null;
  readonly isFullScan?: boolean | null;
  readonly startId?: number | null;
  readonly endId?: number | null;
  readonly status: ScraperJobStatus | keyof typeof ScraperJobStatus;
  readonly totalURLsProcessed?: number | null;
  readonly newGamesScraped?: number | null;
  readonly gamesUpdated?: number | null;
  readonly gamesSkipped?: number | null;
  readonly errors?: number | null;
  readonly blanks?: number | null;
  readonly averageScrapingTime?: number | null;
  readonly successRate?: number | null;
  readonly errorMessages?: (string | null)[] | null;
  readonly failedURLs?: (string | null)[] | null;
  readonly urlResults?: (ScraperJobURLResult | null)[] | null;
  readonly currentId?: number | null;
  readonly stopReason?: string | null;
  readonly lastErrorMessage?: string | null;
  readonly notFoundCount?: number | null;
  readonly s3CacheHits?: number | null;
  readonly consecutiveNotFound?: number | null;
  readonly consecutiveErrors?: number | null;
  readonly consecutiveBlanks?: number | null;
  readonly scrapeAttempts?: (ScrapeAttempt | null)[] | null;
  readonly entityId?: string | null;
  readonly entity?: Entity | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type LazyScraperJob = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<ScraperJob, 'id'>;
  };
  readonly id: string;
  readonly jobId: string;
  readonly triggerSource: ScraperJobTriggerSource | keyof typeof ScraperJobTriggerSource;
  readonly triggeredBy?: string | null;
  readonly startTime: string;
  readonly endTime?: string | null;
  readonly durationSeconds?: number | null;
  readonly maxGames?: number | null;
  readonly targetURLs?: (string | null)[] | null;
  readonly isFullScan?: boolean | null;
  readonly startId?: number | null;
  readonly endId?: number | null;
  readonly status: ScraperJobStatus | keyof typeof ScraperJobStatus;
  readonly totalURLsProcessed?: number | null;
  readonly newGamesScraped?: number | null;
  readonly gamesUpdated?: number | null;
  readonly gamesSkipped?: number | null;
  readonly errors?: number | null;
  readonly blanks?: number | null;
  readonly averageScrapingTime?: number | null;
  readonly successRate?: number | null;
  readonly errorMessages?: (string | null)[] | null;
  readonly failedURLs?: (string | null)[] | null;
  readonly urlResults?: (ScraperJobURLResult | null)[] | null;
  readonly currentId?: number | null;
  readonly stopReason?: string | null;
  readonly lastErrorMessage?: string | null;
  readonly notFoundCount?: number | null;
  readonly s3CacheHits?: number | null;
  readonly consecutiveNotFound?: number | null;
  readonly consecutiveErrors?: number | null;
  readonly consecutiveBlanks?: number | null;
  readonly scrapeAttempts: AsyncCollection<ScrapeAttempt>;
  readonly entityId?: string | null;
  readonly entity: AsyncItem<Entity | undefined>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type ScraperJob = LazyLoading extends LazyLoadingDisabled ? EagerScraperJob : LazyScraperJob

export declare const ScraperJob: (new (init: ModelInit<ScraperJob>) => ScraperJob) & {
  copyOf(source: ScraperJob, mutator: (draft: MutableModel<ScraperJob>) => MutableModel<ScraperJob> | void): ScraperJob;
}

type EagerScrapeURL = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<ScrapeURL, 'id'>;
  };
  readonly id: string;
  readonly url: string;
  readonly tournamentId: number;
  readonly doNotScrape: boolean;
  readonly sourceDataIssue?: boolean | null;
  readonly gameDataVerified?: boolean | null;
  readonly missingKeysFromScrape?: (string | null)[] | null;
  readonly sourceSystem?: string | null;
  readonly status: ScrapeURLStatus | keyof typeof ScrapeURLStatus;
  readonly placedIntoDatabase: boolean;
  readonly firstScrapedAt: string;
  readonly lastScrapedAt: string;
  readonly lastSuccessfulScrapeAt?: string | null;
  readonly timesScraped: number;
  readonly timesSuccessful: number;
  readonly timesFailed: number;
  readonly consecutiveFailures?: number | null;
  readonly lastScrapeStatus?: ScrapeAttemptStatus | keyof typeof ScrapeAttemptStatus | null;
  readonly lastScrapeMessage?: string | null;
  readonly lastScrapeJobId?: string | null;
  readonly gameId?: string | null;
  readonly gameName?: string | null;
  readonly gameStatus?: GameStatus | keyof typeof GameStatus | null;
  readonly venueId?: string | null;
  readonly venueName?: string | null;
  readonly lastDataHash?: string | null;
  readonly hasDataChanges?: boolean | null;
  readonly lastFoundKeys?: (string | null)[] | null;
  readonly lastStructureLabel?: string | null;
  readonly averageScrapingTime?: number | null;
  readonly lastScrapingTime?: number | null;
  readonly attempts?: (ScrapeAttempt | null)[] | null;
  readonly entityId?: string | null;
  readonly entity?: Entity | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly etag?: string | null;
  readonly lastModifiedHeader?: string | null;
  readonly contentHash?: string | null;
  readonly s3StoragePrefix?: string | null;
  readonly latestS3Key?: string | null;
  readonly s3StorageEnabled?: boolean | null;
  readonly lastContentChangeAt?: string | null;
  readonly totalContentChanges?: number | null;
  readonly lastHeaderCheckAt?: string | null;
  readonly cachedContentUsedCount?: number | null;
  readonly lastCacheHitAt?: string | null;
  readonly contentSize?: number | null;
  readonly wasEdited?: boolean | null;
}

type LazyScrapeURL = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<ScrapeURL, 'id'>;
  };
  readonly id: string;
  readonly url: string;
  readonly tournamentId: number;
  readonly doNotScrape: boolean;
  readonly sourceDataIssue?: boolean | null;
  readonly gameDataVerified?: boolean | null;
  readonly missingKeysFromScrape?: (string | null)[] | null;
  readonly sourceSystem?: string | null;
  readonly status: ScrapeURLStatus | keyof typeof ScrapeURLStatus;
  readonly placedIntoDatabase: boolean;
  readonly firstScrapedAt: string;
  readonly lastScrapedAt: string;
  readonly lastSuccessfulScrapeAt?: string | null;
  readonly timesScraped: number;
  readonly timesSuccessful: number;
  readonly timesFailed: number;
  readonly consecutiveFailures?: number | null;
  readonly lastScrapeStatus?: ScrapeAttemptStatus | keyof typeof ScrapeAttemptStatus | null;
  readonly lastScrapeMessage?: string | null;
  readonly lastScrapeJobId?: string | null;
  readonly gameId?: string | null;
  readonly gameName?: string | null;
  readonly gameStatus?: GameStatus | keyof typeof GameStatus | null;
  readonly venueId?: string | null;
  readonly venueName?: string | null;
  readonly lastDataHash?: string | null;
  readonly hasDataChanges?: boolean | null;
  readonly lastFoundKeys?: (string | null)[] | null;
  readonly lastStructureLabel?: string | null;
  readonly averageScrapingTime?: number | null;
  readonly lastScrapingTime?: number | null;
  readonly attempts: AsyncCollection<ScrapeAttempt>;
  readonly entityId?: string | null;
  readonly entity: AsyncItem<Entity | undefined>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly etag?: string | null;
  readonly lastModifiedHeader?: string | null;
  readonly contentHash?: string | null;
  readonly s3StoragePrefix?: string | null;
  readonly latestS3Key?: string | null;
  readonly s3StorageEnabled?: boolean | null;
  readonly lastContentChangeAt?: string | null;
  readonly totalContentChanges?: number | null;
  readonly lastHeaderCheckAt?: string | null;
  readonly cachedContentUsedCount?: number | null;
  readonly lastCacheHitAt?: string | null;
  readonly contentSize?: number | null;
  readonly wasEdited?: boolean | null;
}

export declare type ScrapeURL = LazyLoading extends LazyLoadingDisabled ? EagerScrapeURL : LazyScrapeURL

export declare const ScrapeURL: (new (init: ModelInit<ScrapeURL>) => ScrapeURL) & {
  copyOf(source: ScrapeURL, mutator: (draft: MutableModel<ScrapeURL>) => MutableModel<ScrapeURL> | void): ScrapeURL;
}

type EagerScrapeAttempt = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<ScrapeAttempt, 'id'>;
  };
  readonly id: string;
  readonly url: string;
  readonly tournamentId: number;
  readonly attemptTime: string;
  readonly scraperJobId: string;
  readonly scraperJob?: ScraperJob | null;
  readonly scrapeURLId: string;
  readonly scrapeURL?: ScrapeURL | null;
  readonly status: ScrapeAttemptStatus | keyof typeof ScrapeAttemptStatus;
  readonly processingTime?: number | null;
  readonly gameName?: string | null;
  readonly gameStatus?: GameStatus | keyof typeof GameStatus | null;
  readonly registrationStatus?: RegistrationStatus | keyof typeof RegistrationStatus | null;
  readonly dataHash?: string | null;
  readonly hasChanges?: boolean | null;
  readonly errorMessage?: string | null;
  readonly errorType?: string | null;
  readonly gameId?: string | null;
  readonly wasNewGame?: boolean | null;
  readonly fieldsUpdated?: (string | null)[] | null;
  readonly foundKeys?: (string | null)[] | null;
  readonly structureLabel?: string | null;
  readonly wasEdited?: boolean | null;
  readonly scrapedAt?: string | null;
  readonly fieldsExtracted?: (string | null)[] | null;
  readonly entityId?: string | null;
  readonly contentHash?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type LazyScrapeAttempt = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<ScrapeAttempt, 'id'>;
  };
  readonly id: string;
  readonly url: string;
  readonly tournamentId: number;
  readonly attemptTime: string;
  readonly scraperJobId: string;
  readonly scraperJob: AsyncItem<ScraperJob | undefined>;
  readonly scrapeURLId: string;
  readonly scrapeURL: AsyncItem<ScrapeURL | undefined>;
  readonly status: ScrapeAttemptStatus | keyof typeof ScrapeAttemptStatus;
  readonly processingTime?: number | null;
  readonly gameName?: string | null;
  readonly gameStatus?: GameStatus | keyof typeof GameStatus | null;
  readonly registrationStatus?: RegistrationStatus | keyof typeof RegistrationStatus | null;
  readonly dataHash?: string | null;
  readonly hasChanges?: boolean | null;
  readonly errorMessage?: string | null;
  readonly errorType?: string | null;
  readonly gameId?: string | null;
  readonly wasNewGame?: boolean | null;
  readonly fieldsUpdated?: (string | null)[] | null;
  readonly foundKeys?: (string | null)[] | null;
  readonly structureLabel?: string | null;
  readonly wasEdited?: boolean | null;
  readonly scrapedAt?: string | null;
  readonly fieldsExtracted?: (string | null)[] | null;
  readonly entityId?: string | null;
  readonly contentHash?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type ScrapeAttempt = LazyLoading extends LazyLoadingDisabled ? EagerScrapeAttempt : LazyScrapeAttempt

export declare const ScrapeAttempt: (new (init: ModelInit<ScrapeAttempt>) => ScrapeAttempt) & {
  copyOf(source: ScrapeAttempt, mutator: (draft: MutableModel<ScrapeAttempt>) => MutableModel<ScrapeAttempt> | void): ScrapeAttempt;
}

type EagerScraperState = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<ScraperState, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly isRunning: boolean;
  readonly lastScannedId: number;
  readonly lastRunStartTime?: string | null;
  readonly lastRunEndTime?: string | null;
  readonly consecutiveBlankCount: number;
  readonly totalScraped: number;
  readonly totalErrors: number;
  readonly enabled: boolean;
  readonly currentLog?: (ScraperLogData | null)[] | null;
  readonly highestStoredId?: number | null;
  readonly lowestStoredId?: number | null;
  readonly knownGapRanges?: string | null;
  readonly lastGapScanAt?: string | null;
  readonly totalGamesInDatabase?: number | null;
  readonly lastGamesProcessed?: (ScrapedGameStatus | null)[] | null;
  readonly entityId?: string | null;
  readonly entity?: Entity | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyScraperState = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<ScraperState, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly isRunning: boolean;
  readonly lastScannedId: number;
  readonly lastRunStartTime?: string | null;
  readonly lastRunEndTime?: string | null;
  readonly consecutiveBlankCount: number;
  readonly totalScraped: number;
  readonly totalErrors: number;
  readonly enabled: boolean;
  readonly currentLog?: (ScraperLogData | null)[] | null;
  readonly highestStoredId?: number | null;
  readonly lowestStoredId?: number | null;
  readonly knownGapRanges?: string | null;
  readonly lastGapScanAt?: string | null;
  readonly totalGamesInDatabase?: number | null;
  readonly lastGamesProcessed?: (ScrapedGameStatus | null)[] | null;
  readonly entityId?: string | null;
  readonly entity: AsyncItem<Entity | undefined>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type ScraperState = LazyLoading extends LazyLoadingDisabled ? EagerScraperState : LazyScraperState

export declare const ScraperState: (new (init: ModelInit<ScraperState>) => ScraperState) & {
  copyOf(source: ScraperState, mutator: (draft: MutableModel<ScraperState>) => MutableModel<ScraperState> | void): ScraperState;
}

type EagerScrapeStructure = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<ScrapeStructure, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly fingerprint: string;
  readonly structureLabel: string;
  readonly foundKeys: (string | null)[];
  readonly keyCount?: number | null;
  readonly hitCount: number;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly exampleUrl?: string | null;
  readonly isActive?: boolean | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyScrapeStructure = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<ScrapeStructure, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly fingerprint: string;
  readonly structureLabel: string;
  readonly foundKeys: (string | null)[];
  readonly keyCount?: number | null;
  readonly hitCount: number;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly exampleUrl?: string | null;
  readonly isActive?: boolean | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type ScrapeStructure = LazyLoading extends LazyLoadingDisabled ? EagerScrapeStructure : LazyScrapeStructure

export declare const ScrapeStructure: (new (init: ModelInit<ScrapeStructure>) => ScrapeStructure) & {
  copyOf(source: ScrapeStructure, mutator: (draft: MutableModel<ScrapeStructure>) => MutableModel<ScrapeStructure> | void): ScrapeStructure;
}

type EagerDataSync = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<DataSync, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly syncedAt: string;
  readonly method: DataSource | keyof typeof DataSource;
  readonly sourceUrl?: string | null;
  readonly title?: string | null;
  readonly content?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyDataSync = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<DataSync, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly syncedAt: string;
  readonly method: DataSource | keyof typeof DataSource;
  readonly sourceUrl?: string | null;
  readonly title?: string | null;
  readonly content?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type DataSync = LazyLoading extends LazyLoadingDisabled ? EagerDataSync : LazyDataSync

export declare const DataSync: (new (init: ModelInit<DataSync>) => DataSync) & {
  copyOf(source: DataSync, mutator: (draft: MutableModel<DataSync>) => MutableModel<DataSync> | void): DataSync;
}

type EagerS3Storage = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<S3Storage, 'id'>;
  };
  readonly id: string;
  readonly scrapeURLId?: string | null;
  readonly url: string;
  readonly tournamentId: number;
  readonly entityId: string;
  readonly entityTournamentKey?: string | null;
  readonly s3Key: string;
  readonly s3Bucket: string;
  readonly scrapedAt: string;
  readonly contentSize?: number | null;
  readonly contentHash?: string | null;
  readonly etag?: string | null;
  readonly lastModified?: string | null;
  readonly headers?: string | null;
  readonly dataExtracted?: boolean | null;
  readonly gameId?: string | null;
  readonly isManualUpload?: boolean | null;
  readonly uploadedBy?: string | null;
  readonly notes?: string | null;
  readonly previousVersions?: (S3VersionHistory | null)[] | null;
  readonly gameStatus?: string | null;
  readonly registrationStatus?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly isParsed?: boolean | null;
  readonly parsedDataHash?: string | null;
  readonly extractedFields?: (string | null)[] | null;
  readonly lastParsedAt?: string | null;
  readonly parseCount?: number | null;
  readonly rescrapeCount?: number | null;
  readonly lastRescrapeAt?: string | null;
  readonly dataChangedAt?: string | null;
  readonly dataChangeCount?: number | null;
}

type LazyS3Storage = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<S3Storage, 'id'>;
  };
  readonly id: string;
  readonly scrapeURLId?: string | null;
  readonly url: string;
  readonly tournamentId: number;
  readonly entityId: string;
  readonly entityTournamentKey?: string | null;
  readonly s3Key: string;
  readonly s3Bucket: string;
  readonly scrapedAt: string;
  readonly contentSize?: number | null;
  readonly contentHash?: string | null;
  readonly etag?: string | null;
  readonly lastModified?: string | null;
  readonly headers?: string | null;
  readonly dataExtracted?: boolean | null;
  readonly gameId?: string | null;
  readonly isManualUpload?: boolean | null;
  readonly uploadedBy?: string | null;
  readonly notes?: string | null;
  readonly previousVersions?: (S3VersionHistory | null)[] | null;
  readonly gameStatus?: string | null;
  readonly registrationStatus?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly isParsed?: boolean | null;
  readonly parsedDataHash?: string | null;
  readonly extractedFields?: (string | null)[] | null;
  readonly lastParsedAt?: string | null;
  readonly parseCount?: number | null;
  readonly rescrapeCount?: number | null;
  readonly lastRescrapeAt?: string | null;
  readonly dataChangedAt?: string | null;
  readonly dataChangeCount?: number | null;
}

export declare type S3Storage = LazyLoading extends LazyLoadingDisabled ? EagerS3Storage : LazyS3Storage

export declare const S3Storage: (new (init: ModelInit<S3Storage>) => S3Storage) & {
  copyOf(source: S3Storage, mutator: (draft: MutableModel<S3Storage>) => MutableModel<S3Storage> | void): S3Storage;
}

type EagerActiveGame = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<ActiveGame, 'id'>;
  };
  readonly id: string;
  readonly gameId: string;
  readonly game?: Game | null;
  readonly entityId: string;
  readonly entity?: Entity | null;
  readonly venueId?: string | null;
  readonly venue?: Venue | null;
  readonly tournamentId?: number | null;
  readonly gameStatus: GameStatus | keyof typeof GameStatus;
  readonly registrationStatus?: RegistrationStatus | keyof typeof RegistrationStatus | null;
  readonly previousStatus?: GameStatus | keyof typeof GameStatus | null;
  readonly statusChangedAt?: string | null;
  readonly name: string;
  readonly venueName?: string | null;
  readonly venueLogoCached?: string | null;
  readonly entityName?: string | null;
  readonly gameStartDateTime: string;
  readonly gameEndDateTime?: string | null;
  readonly totalEntries?: number | null;
  readonly totalUniquePlayers?: number | null;
  readonly playersRemaining?: number | null;
  readonly totalChipsInPlay?: number | null;
  readonly averagePlayerStack?: number | null;
  readonly buyIn?: number | null;
  readonly prizepoolPaid?: number | null;
  readonly prizepoolCalculated?: number | null;
  readonly guaranteeAmount?: number | null;
  readonly hasGuarantee?: boolean | null;
  readonly gameType?: GameType | keyof typeof GameType | null;
  readonly gameVariant?: GameVariant | keyof typeof GameVariant | null;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly isSeries?: boolean | null;
  readonly seriesName?: string | null;
  readonly sourceUrl?: string | null;
  readonly refreshEnabled?: boolean | null;
  readonly refreshIntervalMinutes?: number | null;
  readonly lastRefreshedAt?: string | null;
  readonly nextRefreshAt?: string | null;
  readonly refreshCount?: number | null;
  readonly consecutiveRefreshFailures?: number | null;
  readonly lastRefreshError?: string | null;
  readonly isPriority?: boolean | null;
  readonly hasOverlay?: boolean | null;
  readonly isMainEvent?: boolean | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly activatedAt: string;
  readonly activatedBy?: string | null;
}

type LazyActiveGame = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<ActiveGame, 'id'>;
  };
  readonly id: string;
  readonly gameId: string;
  readonly game: AsyncItem<Game | undefined>;
  readonly entityId: string;
  readonly entity: AsyncItem<Entity | undefined>;
  readonly venueId?: string | null;
  readonly venue: AsyncItem<Venue | undefined>;
  readonly tournamentId?: number | null;
  readonly gameStatus: GameStatus | keyof typeof GameStatus;
  readonly registrationStatus?: RegistrationStatus | keyof typeof RegistrationStatus | null;
  readonly previousStatus?: GameStatus | keyof typeof GameStatus | null;
  readonly statusChangedAt?: string | null;
  readonly name: string;
  readonly venueName?: string | null;
  readonly venueLogoCached?: string | null;
  readonly entityName?: string | null;
  readonly gameStartDateTime: string;
  readonly gameEndDateTime?: string | null;
  readonly totalEntries?: number | null;
  readonly totalUniquePlayers?: number | null;
  readonly playersRemaining?: number | null;
  readonly totalChipsInPlay?: number | null;
  readonly averagePlayerStack?: number | null;
  readonly buyIn?: number | null;
  readonly prizepoolPaid?: number | null;
  readonly prizepoolCalculated?: number | null;
  readonly guaranteeAmount?: number | null;
  readonly hasGuarantee?: boolean | null;
  readonly gameType?: GameType | keyof typeof GameType | null;
  readonly gameVariant?: GameVariant | keyof typeof GameVariant | null;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly isSeries?: boolean | null;
  readonly seriesName?: string | null;
  readonly sourceUrl?: string | null;
  readonly refreshEnabled?: boolean | null;
  readonly refreshIntervalMinutes?: number | null;
  readonly lastRefreshedAt?: string | null;
  readonly nextRefreshAt?: string | null;
  readonly refreshCount?: number | null;
  readonly consecutiveRefreshFailures?: number | null;
  readonly lastRefreshError?: string | null;
  readonly isPriority?: boolean | null;
  readonly hasOverlay?: boolean | null;
  readonly isMainEvent?: boolean | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly activatedAt: string;
  readonly activatedBy?: string | null;
}

export declare type ActiveGame = LazyLoading extends LazyLoadingDisabled ? EagerActiveGame : LazyActiveGame

export declare const ActiveGame: (new (init: ModelInit<ActiveGame>) => ActiveGame) & {
  copyOf(source: ActiveGame, mutator: (draft: MutableModel<ActiveGame>) => MutableModel<ActiveGame> | void): ActiveGame;
}

type EagerRecentlyFinishedGame = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<RecentlyFinishedGame, 'id'>;
  };
  readonly id: string;
  readonly gameId: string;
  readonly game?: Game | null;
  readonly entityId: string;
  readonly entity?: Entity | null;
  readonly venueId?: string | null;
  readonly venue?: Venue | null;
  readonly tournamentId?: number | null;
  readonly name: string;
  readonly venueName?: string | null;
  readonly venueLogoCached?: string | null;
  readonly entityName?: string | null;
  readonly gameStartDateTime: string;
  readonly finishedAt: string;
  readonly totalDuration?: number | null;
  readonly totalEntries?: number | null;
  readonly totalUniquePlayers?: number | null;
  readonly prizepoolPaid?: number | null;
  readonly prizepoolCalculated?: number | null;
  readonly buyIn?: number | null;
  readonly gameType?: GameType | keyof typeof GameType | null;
  readonly isSeries?: boolean | null;
  readonly seriesName?: string | null;
  readonly isMainEvent?: boolean | null;
  readonly sourceUrl?: string | null;
  readonly ttl?: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type LazyRecentlyFinishedGame = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<RecentlyFinishedGame, 'id'>;
  };
  readonly id: string;
  readonly gameId: string;
  readonly game: AsyncItem<Game | undefined>;
  readonly entityId: string;
  readonly entity: AsyncItem<Entity | undefined>;
  readonly venueId?: string | null;
  readonly venue: AsyncItem<Venue | undefined>;
  readonly tournamentId?: number | null;
  readonly name: string;
  readonly venueName?: string | null;
  readonly venueLogoCached?: string | null;
  readonly entityName?: string | null;
  readonly gameStartDateTime: string;
  readonly finishedAt: string;
  readonly totalDuration?: number | null;
  readonly totalEntries?: number | null;
  readonly totalUniquePlayers?: number | null;
  readonly prizepoolPaid?: number | null;
  readonly prizepoolCalculated?: number | null;
  readonly buyIn?: number | null;
  readonly gameType?: GameType | keyof typeof GameType | null;
  readonly isSeries?: boolean | null;
  readonly seriesName?: string | null;
  readonly isMainEvent?: boolean | null;
  readonly sourceUrl?: string | null;
  readonly ttl?: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type RecentlyFinishedGame = LazyLoading extends LazyLoadingDisabled ? EagerRecentlyFinishedGame : LazyRecentlyFinishedGame

export declare const RecentlyFinishedGame: (new (init: ModelInit<RecentlyFinishedGame>) => RecentlyFinishedGame) & {
  copyOf(source: RecentlyFinishedGame, mutator: (draft: MutableModel<RecentlyFinishedGame>) => MutableModel<RecentlyFinishedGame> | void): RecentlyFinishedGame;
}

type EagerUpcomingGame = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<UpcomingGame, 'id'>;
  };
  readonly id: string;
  readonly gameId: string;
  readonly game?: Game | null;
  readonly entityId: string;
  readonly entity?: Entity | null;
  readonly venueId?: string | null;
  readonly venue?: Venue | null;
  readonly tournamentId?: number | null;
  readonly name: string;
  readonly venueName?: string | null;
  readonly venueLogoCached?: string | null;
  readonly entityName?: string | null;
  readonly gameStartDateTime: string;
  readonly buyIn?: number | null;
  readonly guaranteeAmount?: number | null;
  readonly hasGuarantee?: boolean | null;
  readonly gameType?: GameType | keyof typeof GameType | null;
  readonly gameVariant?: GameVariant | keyof typeof GameVariant | null;
  readonly isSeries?: boolean | null;
  readonly seriesName?: string | null;
  readonly isMainEvent?: boolean | null;
  readonly sourceUrl?: string | null;
  readonly scheduledToStartAt?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type LazyUpcomingGame = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<UpcomingGame, 'id'>;
  };
  readonly id: string;
  readonly gameId: string;
  readonly game: AsyncItem<Game | undefined>;
  readonly entityId: string;
  readonly entity: AsyncItem<Entity | undefined>;
  readonly venueId?: string | null;
  readonly venue: AsyncItem<Venue | undefined>;
  readonly tournamentId?: number | null;
  readonly name: string;
  readonly venueName?: string | null;
  readonly venueLogoCached?: string | null;
  readonly entityName?: string | null;
  readonly gameStartDateTime: string;
  readonly buyIn?: number | null;
  readonly guaranteeAmount?: number | null;
  readonly hasGuarantee?: boolean | null;
  readonly gameType?: GameType | keyof typeof GameType | null;
  readonly gameVariant?: GameVariant | keyof typeof GameVariant | null;
  readonly isSeries?: boolean | null;
  readonly seriesName?: string | null;
  readonly isMainEvent?: boolean | null;
  readonly sourceUrl?: string | null;
  readonly scheduledToStartAt?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type UpcomingGame = LazyLoading extends LazyLoadingDisabled ? EagerUpcomingGame : LazyUpcomingGame

export declare const UpcomingGame: (new (init: ModelInit<UpcomingGame>) => UpcomingGame) & {
  copyOf(source: UpcomingGame, mutator: (draft: MutableModel<UpcomingGame>) => MutableModel<UpcomingGame> | void): UpcomingGame;
}

type EagerDashboardCache = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<DashboardCache, 'id'>;
  };
  readonly id: string;
  readonly entityId?: string | null;
  readonly entity?: Entity | null;
  readonly isGlobal?: boolean | null;
  readonly runningCount: number;
  readonly registeringCount: number;
  readonly clockStoppedCount: number;
  readonly initiatingCount: number;
  readonly finishedLast24hCount: number;
  readonly finishedLast7dCount: number;
  readonly upcomingCount: number;
  readonly totalPrizepoolLast7d?: number | null;
  readonly totalEntriesLast7d?: number | null;
  readonly avgEntriesPerGameLast7d?: number | null;
  readonly runningGames?: string | null;
  readonly registeringGames?: string | null;
  readonly clockStoppedGames?: string | null;
  readonly recentlyFinished?: string | null;
  readonly upcomingGames?: string | null;
  readonly lastUpdatedAt: string;
  readonly nextUpdateAt?: string | null;
  readonly updateIntervalMinutes?: number | null;
  readonly version?: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type LazyDashboardCache = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<DashboardCache, 'id'>;
  };
  readonly id: string;
  readonly entityId?: string | null;
  readonly entity: AsyncItem<Entity | undefined>;
  readonly isGlobal?: boolean | null;
  readonly runningCount: number;
  readonly registeringCount: number;
  readonly clockStoppedCount: number;
  readonly initiatingCount: number;
  readonly finishedLast24hCount: number;
  readonly finishedLast7dCount: number;
  readonly upcomingCount: number;
  readonly totalPrizepoolLast7d?: number | null;
  readonly totalEntriesLast7d?: number | null;
  readonly avgEntriesPerGameLast7d?: number | null;
  readonly runningGames?: string | null;
  readonly registeringGames?: string | null;
  readonly clockStoppedGames?: string | null;
  readonly recentlyFinished?: string | null;
  readonly upcomingGames?: string | null;
  readonly lastUpdatedAt: string;
  readonly nextUpdateAt?: string | null;
  readonly updateIntervalMinutes?: number | null;
  readonly version?: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type DashboardCache = LazyLoading extends LazyLoadingDisabled ? EagerDashboardCache : LazyDashboardCache

export declare const DashboardCache: (new (init: ModelInit<DashboardCache>) => DashboardCache) & {
  copyOf(source: DashboardCache, mutator: (draft: MutableModel<DashboardCache>) => MutableModel<DashboardCache> | void): DashboardCache;
}

type EagerSocialAccount = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<SocialAccount, 'id'>;
  };
  readonly id: string;
  readonly platform: SocialPlatform | keyof typeof SocialPlatform;
  readonly platformAccountId: string;
  readonly accountName: string;
  readonly accountHandle?: string | null;
  readonly accountUrl: string;
  readonly businessLocation?: string | null;
  readonly tags?: (string | null)[] | null;
  readonly profileImageUrl?: string | null;
  readonly coverImageUrl?: string | null;
  readonly bio?: string | null;
  readonly followerCount?: number | null;
  readonly followingCount?: number | null;
  readonly postCount?: number | null;
  readonly hasFullHistory?: boolean | null;
  readonly fullSyncOldestPostDate?: string | null;
  readonly pageDescription?: string | null;
  readonly category?: string | null;
  readonly website?: string | null;
  readonly status: SocialAccountStatus | keyof typeof SocialAccountStatus;
  readonly isScrapingEnabled: boolean;
  readonly scrapeFrequencyMinutes?: number | null;
  readonly lastScrapedAt?: string | null;
  readonly lastSuccessfulScrapeAt?: string | null;
  readonly nextScheduledScrapeAt?: string | null;
  readonly consecutiveFailures?: number | null;
  readonly lastErrorMessage?: string | null;
  readonly hasPostAccess?: boolean | null;
  readonly accessTokenExpiry?: string | null;
  readonly permissionsGranted?: (string | null)[] | null;
  readonly entityId?: string | null;
  readonly entity?: Entity | null;
  readonly venueId?: string | null;
  readonly venue?: Venue | null;
  readonly posts?: (SocialPost | null)[] | null;
  readonly scrapeAttempts?: (SocialScrapeAttempt | null)[] | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy?: string | null;
}

type LazySocialAccount = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<SocialAccount, 'id'>;
  };
  readonly id: string;
  readonly platform: SocialPlatform | keyof typeof SocialPlatform;
  readonly platformAccountId: string;
  readonly accountName: string;
  readonly accountHandle?: string | null;
  readonly accountUrl: string;
  readonly businessLocation?: string | null;
  readonly tags?: (string | null)[] | null;
  readonly profileImageUrl?: string | null;
  readonly coverImageUrl?: string | null;
  readonly bio?: string | null;
  readonly followerCount?: number | null;
  readonly followingCount?: number | null;
  readonly postCount?: number | null;
  readonly hasFullHistory?: boolean | null;
  readonly fullSyncOldestPostDate?: string | null;
  readonly pageDescription?: string | null;
  readonly category?: string | null;
  readonly website?: string | null;
  readonly status: SocialAccountStatus | keyof typeof SocialAccountStatus;
  readonly isScrapingEnabled: boolean;
  readonly scrapeFrequencyMinutes?: number | null;
  readonly lastScrapedAt?: string | null;
  readonly lastSuccessfulScrapeAt?: string | null;
  readonly nextScheduledScrapeAt?: string | null;
  readonly consecutiveFailures?: number | null;
  readonly lastErrorMessage?: string | null;
  readonly hasPostAccess?: boolean | null;
  readonly accessTokenExpiry?: string | null;
  readonly permissionsGranted?: (string | null)[] | null;
  readonly entityId?: string | null;
  readonly entity: AsyncItem<Entity | undefined>;
  readonly venueId?: string | null;
  readonly venue: AsyncItem<Venue | undefined>;
  readonly posts: AsyncCollection<SocialPost>;
  readonly scrapeAttempts: AsyncCollection<SocialScrapeAttempt>;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly createdBy?: string | null;
}

export declare type SocialAccount = LazyLoading extends LazyLoadingDisabled ? EagerSocialAccount : LazySocialAccount

export declare const SocialAccount: (new (init: ModelInit<SocialAccount>) => SocialAccount) & {
  copyOf(source: SocialAccount, mutator: (draft: MutableModel<SocialAccount>) => MutableModel<SocialAccount> | void): SocialAccount;
}

type EagerSocialPost = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<SocialPost, 'id'>;
  };
  readonly id: string;
  readonly platformPostId: string;
  readonly postUrl?: string | null;
  readonly postType: SocialPostType | keyof typeof SocialPostType;
  readonly accountName?: string | null;
  readonly accountProfileImageUrl?: string | null;
  readonly platform?: string | null;
  readonly businessLocation?: string | null;
  readonly content?: string | null;
  readonly contentPreview?: string | null;
  readonly rawContent?: string | null;
  readonly mediaUrls?: (string | null)[] | null;
  readonly thumbnailUrl?: string | null;
  readonly mediaType?: string | null;
  readonly videoUrl?: string | null;
  readonly videoThumbnailUrl?: string | null;
  readonly videoWidth?: number | null;
  readonly videoHeight?: number | null;
  readonly videoTitle?: string | null;
  readonly videoDescription?: string | null;
  readonly likeCount?: number | null;
  readonly commentCount?: number | null;
  readonly shareCount?: number | null;
  readonly reactionCount?: number | null;
  readonly viewCount?: number | null;
  readonly postedAt: string;
  readonly scrapedAt: string;
  readonly lastUpdatedAt?: string | null;
  readonly status: SocialPostStatus | keyof typeof SocialPostStatus;
  readonly isPromotional?: boolean | null;
  readonly isPinned?: boolean | null;
  readonly isTournamentResult?: boolean | null;
  readonly isTournamentRelated?: boolean | null;
  readonly tags?: (string | null)[] | null;
  readonly sentiment?: string | null;
  readonly contentCategory?: string | null;
  readonly linkedGameId?: string | null;
  readonly linkedGame?: Game | null;
  readonly processingStatus?: SocialPostProcessingStatus | keyof typeof SocialPostProcessingStatus | null;
  readonly processedAt?: string | null;
  readonly processingError?: string | null;
  readonly processingVersion?: string | null;
  readonly contentType?: SocialPostContentType | keyof typeof SocialPostContentType | null;
  readonly contentTypeConfidence?: number | null;
  readonly extractedGameDataId?: string | null;
  readonly extractedGameData?: SocialPostGameData | null;
  readonly gameLinks?: (SocialPostGameLink | null)[] | null;
  readonly primaryLinkedGameId?: string | null;
  readonly linkedGameCount?: number | null;
  readonly hasUnverifiedLinks?: boolean | null;
  readonly postYearMonth?: string | null;
  readonly effectiveGameDate?: string | null;
  readonly effectiveGameDateSource?: string | null;
  readonly socialAccountId: string;
  readonly socialAccount?: SocialAccount | null;
  readonly entityId?: string | null;
  readonly venueId?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type LazySocialPost = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<SocialPost, 'id'>;
  };
  readonly id: string;
  readonly platformPostId: string;
  readonly postUrl?: string | null;
  readonly postType: SocialPostType | keyof typeof SocialPostType;
  readonly accountName?: string | null;
  readonly accountProfileImageUrl?: string | null;
  readonly platform?: string | null;
  readonly businessLocation?: string | null;
  readonly content?: string | null;
  readonly contentPreview?: string | null;
  readonly rawContent?: string | null;
  readonly mediaUrls?: (string | null)[] | null;
  readonly thumbnailUrl?: string | null;
  readonly mediaType?: string | null;
  readonly videoUrl?: string | null;
  readonly videoThumbnailUrl?: string | null;
  readonly videoWidth?: number | null;
  readonly videoHeight?: number | null;
  readonly videoTitle?: string | null;
  readonly videoDescription?: string | null;
  readonly likeCount?: number | null;
  readonly commentCount?: number | null;
  readonly shareCount?: number | null;
  readonly reactionCount?: number | null;
  readonly viewCount?: number | null;
  readonly postedAt: string;
  readonly scrapedAt: string;
  readonly lastUpdatedAt?: string | null;
  readonly status: SocialPostStatus | keyof typeof SocialPostStatus;
  readonly isPromotional?: boolean | null;
  readonly isPinned?: boolean | null;
  readonly isTournamentResult?: boolean | null;
  readonly isTournamentRelated?: boolean | null;
  readonly tags?: (string | null)[] | null;
  readonly sentiment?: string | null;
  readonly contentCategory?: string | null;
  readonly linkedGameId?: string | null;
  readonly linkedGame: AsyncItem<Game | undefined>;
  readonly processingStatus?: SocialPostProcessingStatus | keyof typeof SocialPostProcessingStatus | null;
  readonly processedAt?: string | null;
  readonly processingError?: string | null;
  readonly processingVersion?: string | null;
  readonly contentType?: SocialPostContentType | keyof typeof SocialPostContentType | null;
  readonly contentTypeConfidence?: number | null;
  readonly extractedGameDataId?: string | null;
  readonly extractedGameData: AsyncItem<SocialPostGameData | undefined>;
  readonly gameLinks: AsyncCollection<SocialPostGameLink>;
  readonly primaryLinkedGameId?: string | null;
  readonly linkedGameCount?: number | null;
  readonly hasUnverifiedLinks?: boolean | null;
  readonly postYearMonth?: string | null;
  readonly effectiveGameDate?: string | null;
  readonly effectiveGameDateSource?: string | null;
  readonly socialAccountId: string;
  readonly socialAccount: AsyncItem<SocialAccount | undefined>;
  readonly entityId?: string | null;
  readonly venueId?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type SocialPost = LazyLoading extends LazyLoadingDisabled ? EagerSocialPost : LazySocialPost

export declare const SocialPost: (new (init: ModelInit<SocialPost>) => SocialPost) & {
  copyOf(source: SocialPost, mutator: (draft: MutableModel<SocialPost>) => MutableModel<SocialPost> | void): SocialPost;
}

type EagerSocialScrapeAttempt = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<SocialScrapeAttempt, 'id'>;
    readOnlyFields: 'updatedAt';
  };
  readonly id: string;
  readonly status: SocialScrapeStatus | keyof typeof SocialScrapeStatus;
  readonly startedAt: string;
  readonly completedAt?: string | null;
  readonly durationMs?: number | null;
  readonly syncType?: string | null;
  readonly postsFound?: number | null;
  readonly newPostsAdded?: number | null;
  readonly postsUpdated?: number | null;
  readonly errorMessage?: string | null;
  readonly errorCode?: string | null;
  readonly triggerSource?: ScraperJobTriggerSource | keyof typeof ScraperJobTriggerSource | null;
  readonly triggeredBy?: string | null;
  readonly cancellationRequested?: boolean | null;
  readonly socialAccountId: string;
  readonly socialAccount?: SocialAccount | null;
  readonly createdAt: string;
  readonly updatedAt?: string | null;
}

type LazySocialScrapeAttempt = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<SocialScrapeAttempt, 'id'>;
    readOnlyFields: 'updatedAt';
  };
  readonly id: string;
  readonly status: SocialScrapeStatus | keyof typeof SocialScrapeStatus;
  readonly startedAt: string;
  readonly completedAt?: string | null;
  readonly durationMs?: number | null;
  readonly syncType?: string | null;
  readonly postsFound?: number | null;
  readonly newPostsAdded?: number | null;
  readonly postsUpdated?: number | null;
  readonly errorMessage?: string | null;
  readonly errorCode?: string | null;
  readonly triggerSource?: ScraperJobTriggerSource | keyof typeof ScraperJobTriggerSource | null;
  readonly triggeredBy?: string | null;
  readonly cancellationRequested?: boolean | null;
  readonly socialAccountId: string;
  readonly socialAccount: AsyncItem<SocialAccount | undefined>;
  readonly createdAt: string;
  readonly updatedAt?: string | null;
}

export declare type SocialScrapeAttempt = LazyLoading extends LazyLoadingDisabled ? EagerSocialScrapeAttempt : LazySocialScrapeAttempt

export declare const SocialScrapeAttempt: (new (init: ModelInit<SocialScrapeAttempt>) => SocialScrapeAttempt) & {
  copyOf(source: SocialScrapeAttempt, mutator: (draft: MutableModel<SocialScrapeAttempt>) => MutableModel<SocialScrapeAttempt> | void): SocialScrapeAttempt;
}

type EagerSocialScheduledPost = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<SocialScheduledPost, 'id'>;
  };
  readonly id: string;
  readonly content: string;
  readonly mediaUrls?: (string | null)[] | null;
  readonly linkUrl?: string | null;
  readonly scheduledFor: string;
  readonly publishedAt?: string | null;
  readonly status: ScheduledPostStatus | keyof typeof ScheduledPostStatus;
  readonly targetAccountIds: string[];
  readonly linkedGameId?: string | null;
  readonly templateType?: string | null;
  readonly entityId: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type LazySocialScheduledPost = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<SocialScheduledPost, 'id'>;
  };
  readonly id: string;
  readonly content: string;
  readonly mediaUrls?: (string | null)[] | null;
  readonly linkUrl?: string | null;
  readonly scheduledFor: string;
  readonly publishedAt?: string | null;
  readonly status: ScheduledPostStatus | keyof typeof ScheduledPostStatus;
  readonly targetAccountIds: string[];
  readonly linkedGameId?: string | null;
  readonly templateType?: string | null;
  readonly entityId: string;
  readonly createdBy: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type SocialScheduledPost = LazyLoading extends LazyLoadingDisabled ? EagerSocialScheduledPost : LazySocialScheduledPost

export declare const SocialScheduledPost: (new (init: ModelInit<SocialScheduledPost>) => SocialScheduledPost) & {
  copyOf(source: SocialScheduledPost, mutator: (draft: MutableModel<SocialScheduledPost>) => MutableModel<SocialScheduledPost> | void): SocialScheduledPost;
}

type EagerSocialPostGameLink = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<SocialPostGameLink, 'id'>;
  };
  readonly id: string;
  readonly socialPostId: string;
  readonly gameId: string;
  readonly linkType: SocialPostLinkType | keyof typeof SocialPostLinkType;
  readonly matchConfidence: number;
  readonly matchReason?: string | null;
  readonly matchSignals?: string | null;
  readonly isPrimaryGame?: boolean | null;
  readonly mentionOrder?: number | null;
  readonly extractedVenueName?: string | null;
  readonly extractedDate?: string | null;
  readonly extractedBuyIn?: number | null;
  readonly extractedGuarantee?: number | null;
  readonly effectiveGameDate?: string | null;
  readonly socialPostGameDataId?: string | null;
  readonly hasTicketData?: boolean | null;
  readonly ticketData?: string | null;
  readonly reconciliationPreview?: string | null;
  readonly hasReconciliationDiscrepancy?: boolean | null;
  readonly reconciliationDiscrepancySeverity?: string | null;
  readonly extractedWinnerName?: string | null;
  readonly extractedWinnerPrize?: number | null;
  readonly extractedTotalEntries?: number | null;
  readonly placementCount?: number | null;
  readonly contentType?: SocialPostContentType | keyof typeof SocialPostContentType | null;
  readonly linkedAt: string;
  readonly linkedBy?: string | null;
  readonly verifiedAt?: string | null;
  readonly verifiedBy?: string | null;
  readonly rejectedAt?: string | null;
  readonly rejectedBy?: string | null;
  readonly rejectionReason?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type LazySocialPostGameLink = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<SocialPostGameLink, 'id'>;
  };
  readonly id: string;
  readonly socialPostId: string;
  readonly gameId: string;
  readonly linkType: SocialPostLinkType | keyof typeof SocialPostLinkType;
  readonly matchConfidence: number;
  readonly matchReason?: string | null;
  readonly matchSignals?: string | null;
  readonly isPrimaryGame?: boolean | null;
  readonly mentionOrder?: number | null;
  readonly extractedVenueName?: string | null;
  readonly extractedDate?: string | null;
  readonly extractedBuyIn?: number | null;
  readonly extractedGuarantee?: number | null;
  readonly effectiveGameDate?: string | null;
  readonly socialPostGameDataId?: string | null;
  readonly hasTicketData?: boolean | null;
  readonly ticketData?: string | null;
  readonly reconciliationPreview?: string | null;
  readonly hasReconciliationDiscrepancy?: boolean | null;
  readonly reconciliationDiscrepancySeverity?: string | null;
  readonly extractedWinnerName?: string | null;
  readonly extractedWinnerPrize?: number | null;
  readonly extractedTotalEntries?: number | null;
  readonly placementCount?: number | null;
  readonly contentType?: SocialPostContentType | keyof typeof SocialPostContentType | null;
  readonly linkedAt: string;
  readonly linkedBy?: string | null;
  readonly verifiedAt?: string | null;
  readonly verifiedBy?: string | null;
  readonly rejectedAt?: string | null;
  readonly rejectedBy?: string | null;
  readonly rejectionReason?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type SocialPostGameLink = LazyLoading extends LazyLoadingDisabled ? EagerSocialPostGameLink : LazySocialPostGameLink

export declare const SocialPostGameLink: (new (init: ModelInit<SocialPostGameLink>) => SocialPostGameLink) & {
  copyOf(source: SocialPostGameLink, mutator: (draft: MutableModel<SocialPostGameLink>) => MutableModel<SocialPostGameLink> | void): SocialPostGameLink;
}

type EagerSocialPostGameData = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<SocialPostGameData, 'id'>;
  };
  readonly id: string;
  readonly socialPostId: string;
  readonly contentType: SocialPostContentType | keyof typeof SocialPostContentType;
  readonly contentTypeConfidence?: number | null;
  readonly resultScore?: number | null;
  readonly promoScore?: number | null;
  readonly extractedName?: string | null;
  readonly extractedTournamentUrl?: string | null;
  readonly extractedTournamentId?: number | null;
  readonly extractedVenueName?: string | null;
  readonly extractedVenueId?: string | null;
  readonly suggestedVenueId?: string | null;
  readonly venueMatchConfidence?: number | null;
  readonly venueMatchReason?: string | null;
  readonly venueMatchSource?: string | null;
  readonly extractedDate?: string | null;
  readonly extractedDayOfWeek?: string | null;
  readonly extractedStartTime?: string | null;
  readonly dateSource?: string | null;
  readonly effectiveGameDate?: string | null;
  readonly effectiveGameDateSource?: string | null;
  readonly extractedBuyIn?: number | null;
  readonly extractedGuarantee?: number | null;
  readonly extractedPrizePool?: number | null;
  readonly extractedFirstPlacePrize?: number | null;
  readonly extractedTotalPrizesPaid?: number | null;
  readonly extractedRake?: number | null;
  readonly extractedTotalEntries?: number | null;
  readonly extractedTotalUniquePlayers?: number | null;
  readonly extractedGameType?: GameType | keyof typeof GameType | null;
  readonly extractedTournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly extractedGameVariant?: GameVariant | keyof typeof GameVariant | null;
  readonly extractedGameTypes?: (string | null)[] | null;
  readonly extractedRecurringGameName?: string | null;
  readonly extractedSeriesName?: string | null;
  readonly extractedEventNumber?: number | null;
  readonly extractedDayNumber?: number | null;
  readonly extractedFlightLetter?: string | null;
  readonly isSeriesEvent?: boolean | null;
  readonly extractedWinnerName?: string | null;
  readonly extractedWinnerPrize?: number | null;
  readonly extractedWinnerHasTicket?: boolean | null;
  readonly extractedWinnerTicketType?: NonCashPrizeType | keyof typeof NonCashPrizeType | null;
  readonly extractedWinnerTicketValue?: number | null;
  readonly extractedWinnerTotalValue?: number | null;
  readonly placementCount?: number | null;
  readonly totalTicketsExtracted?: number | null;
  readonly totalTicketValue?: number | null;
  readonly ticketCountByType?: string | null;
  readonly ticketValueByType?: string | null;
  readonly totalCashPaid?: number | null;
  readonly totalPrizesWithTickets?: number | null;
  readonly totalTicketOnlyPrizes?: number | null;
  readonly hasAdvertisedTickets?: boolean | null;
  readonly advertisedTicketCount?: number | null;
  readonly advertisedTicketType?: NonCashPrizeType | keyof typeof NonCashPrizeType | null;
  readonly advertisedTicketValue?: number | null;
  readonly advertisedTicketDescription?: string | null;
  readonly advertisedTickets?: string | null;
  readonly reconciliation_accumulatorTicketCount?: number | null;
  readonly reconciliation_accumulatorTicketValue?: number | null;
  readonly reconciliation_totalPrizepoolPaid?: number | null;
  readonly reconciliation_cashPlusTotalTicketValue?: number | null;
  readonly hasReconciliationDiscrepancy?: boolean | null;
  readonly reconciliationNotes?: string | null;
  readonly reconciliationCheckedAt?: string | null;
  readonly suggestedGameId?: string | null;
  readonly matchCandidateCount?: number | null;
  readonly matchCandidates?: string | null;
  readonly patternMatches?: string | null;
  readonly extractedPrizes?: string | null;
  readonly extractedAt: string;
  readonly extractionVersion?: string | null;
  readonly extractionDurationMs?: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly placements?: (SocialPostPlacement | null)[] | null;
}

type LazySocialPostGameData = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<SocialPostGameData, 'id'>;
  };
  readonly id: string;
  readonly socialPostId: string;
  readonly contentType: SocialPostContentType | keyof typeof SocialPostContentType;
  readonly contentTypeConfidence?: number | null;
  readonly resultScore?: number | null;
  readonly promoScore?: number | null;
  readonly extractedName?: string | null;
  readonly extractedTournamentUrl?: string | null;
  readonly extractedTournamentId?: number | null;
  readonly extractedVenueName?: string | null;
  readonly extractedVenueId?: string | null;
  readonly suggestedVenueId?: string | null;
  readonly venueMatchConfidence?: number | null;
  readonly venueMatchReason?: string | null;
  readonly venueMatchSource?: string | null;
  readonly extractedDate?: string | null;
  readonly extractedDayOfWeek?: string | null;
  readonly extractedStartTime?: string | null;
  readonly dateSource?: string | null;
  readonly effectiveGameDate?: string | null;
  readonly effectiveGameDateSource?: string | null;
  readonly extractedBuyIn?: number | null;
  readonly extractedGuarantee?: number | null;
  readonly extractedPrizePool?: number | null;
  readonly extractedFirstPlacePrize?: number | null;
  readonly extractedTotalPrizesPaid?: number | null;
  readonly extractedRake?: number | null;
  readonly extractedTotalEntries?: number | null;
  readonly extractedTotalUniquePlayers?: number | null;
  readonly extractedGameType?: GameType | keyof typeof GameType | null;
  readonly extractedTournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly extractedGameVariant?: GameVariant | keyof typeof GameVariant | null;
  readonly extractedGameTypes?: (string | null)[] | null;
  readonly extractedRecurringGameName?: string | null;
  readonly extractedSeriesName?: string | null;
  readonly extractedEventNumber?: number | null;
  readonly extractedDayNumber?: number | null;
  readonly extractedFlightLetter?: string | null;
  readonly isSeriesEvent?: boolean | null;
  readonly extractedWinnerName?: string | null;
  readonly extractedWinnerPrize?: number | null;
  readonly extractedWinnerHasTicket?: boolean | null;
  readonly extractedWinnerTicketType?: NonCashPrizeType | keyof typeof NonCashPrizeType | null;
  readonly extractedWinnerTicketValue?: number | null;
  readonly extractedWinnerTotalValue?: number | null;
  readonly placementCount?: number | null;
  readonly totalTicketsExtracted?: number | null;
  readonly totalTicketValue?: number | null;
  readonly ticketCountByType?: string | null;
  readonly ticketValueByType?: string | null;
  readonly totalCashPaid?: number | null;
  readonly totalPrizesWithTickets?: number | null;
  readonly totalTicketOnlyPrizes?: number | null;
  readonly hasAdvertisedTickets?: boolean | null;
  readonly advertisedTicketCount?: number | null;
  readonly advertisedTicketType?: NonCashPrizeType | keyof typeof NonCashPrizeType | null;
  readonly advertisedTicketValue?: number | null;
  readonly advertisedTicketDescription?: string | null;
  readonly advertisedTickets?: string | null;
  readonly reconciliation_accumulatorTicketCount?: number | null;
  readonly reconciliation_accumulatorTicketValue?: number | null;
  readonly reconciliation_totalPrizepoolPaid?: number | null;
  readonly reconciliation_cashPlusTotalTicketValue?: number | null;
  readonly hasReconciliationDiscrepancy?: boolean | null;
  readonly reconciliationNotes?: string | null;
  readonly reconciliationCheckedAt?: string | null;
  readonly suggestedGameId?: string | null;
  readonly matchCandidateCount?: number | null;
  readonly matchCandidates?: string | null;
  readonly patternMatches?: string | null;
  readonly extractedPrizes?: string | null;
  readonly extractedAt: string;
  readonly extractionVersion?: string | null;
  readonly extractionDurationMs?: number | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly placements: AsyncCollection<SocialPostPlacement>;
}

export declare type SocialPostGameData = LazyLoading extends LazyLoadingDisabled ? EagerSocialPostGameData : LazySocialPostGameData

export declare const SocialPostGameData: (new (init: ModelInit<SocialPostGameData>) => SocialPostGameData) & {
  copyOf(source: SocialPostGameData, mutator: (draft: MutableModel<SocialPostGameData>) => MutableModel<SocialPostGameData> | void): SocialPostGameData;
}

type EagerSocialPostPlacement = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<SocialPostPlacement, 'id'>;
  };
  readonly id: string;
  readonly socialPostGameDataId: string;
  readonly socialPostId: string;
  readonly place: number;
  readonly playerName: string;
  readonly cashPrize?: number | null;
  readonly cashPrizeRaw?: string | null;
  readonly hasNonCashPrize?: boolean | null;
  readonly nonCashPrizes?: string | null;
  readonly primaryTicketType?: NonCashPrizeType | keyof typeof NonCashPrizeType | null;
  readonly primaryTicketValue?: number | null;
  readonly primaryTicketDescription?: string | null;
  readonly ticketCount?: number | null;
  readonly totalEstimatedValue?: number | null;
  readonly wasChop?: boolean | null;
  readonly wasICMDeal?: boolean | null;
  readonly chopDetails?: string | null;
  readonly rawText?: string | null;
  readonly linkedPlayerId?: string | null;
  readonly linkedPlayerTicketId?: string | null;
  readonly playerLinkConfidence?: number | null;
  readonly playerLinkMethod?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

type LazySocialPostPlacement = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<SocialPostPlacement, 'id'>;
  };
  readonly id: string;
  readonly socialPostGameDataId: string;
  readonly socialPostId: string;
  readonly place: number;
  readonly playerName: string;
  readonly cashPrize?: number | null;
  readonly cashPrizeRaw?: string | null;
  readonly hasNonCashPrize?: boolean | null;
  readonly nonCashPrizes?: string | null;
  readonly primaryTicketType?: NonCashPrizeType | keyof typeof NonCashPrizeType | null;
  readonly primaryTicketValue?: number | null;
  readonly primaryTicketDescription?: string | null;
  readonly ticketCount?: number | null;
  readonly totalEstimatedValue?: number | null;
  readonly wasChop?: boolean | null;
  readonly wasICMDeal?: boolean | null;
  readonly chopDetails?: string | null;
  readonly rawText?: string | null;
  readonly linkedPlayerId?: string | null;
  readonly linkedPlayerTicketId?: string | null;
  readonly playerLinkConfidence?: number | null;
  readonly playerLinkMethod?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type SocialPostPlacement = LazyLoading extends LazyLoadingDisabled ? EagerSocialPostPlacement : LazySocialPostPlacement

export declare const SocialPostPlacement: (new (init: ModelInit<SocialPostPlacement>) => SocialPostPlacement) & {
  copyOf(source: SocialPostPlacement, mutator: (draft: MutableModel<SocialPostPlacement>) => MutableModel<SocialPostPlacement> | void): SocialPostPlacement;
}

type EagerUser = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<User, 'id'>;
  };
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly role: UserRole | keyof typeof UserRole;
  readonly isActive?: boolean | null;
  readonly allowedPages?: (string | null)[] | null;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly phone?: string | null;
  readonly avatar?: string | null;
  readonly allowedEntityIds?: (string | null)[] | null;
  readonly allowedVenueIds?: (string | null)[] | null;
  readonly defaultEntityId?: string | null;
  readonly lastLoginAt?: string | null;
  readonly lastActiveAt?: string | null;
  readonly passwordLastChangedAt?: string | null;
  readonly mustChangePassword?: boolean | null;
  readonly loginAttempts?: number | null;
  readonly lockedUntil?: string | null;
  readonly createdBy?: string | null;
  readonly updatedBy?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly preferences?: (UserPreference | null)[] | null;
  readonly auditLogs?: (UserAuditLog | null)[] | null;
}

type LazyUser = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<User, 'id'>;
  };
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly role: UserRole | keyof typeof UserRole;
  readonly isActive?: boolean | null;
  readonly allowedPages?: (string | null)[] | null;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly phone?: string | null;
  readonly avatar?: string | null;
  readonly allowedEntityIds?: (string | null)[] | null;
  readonly allowedVenueIds?: (string | null)[] | null;
  readonly defaultEntityId?: string | null;
  readonly lastLoginAt?: string | null;
  readonly lastActiveAt?: string | null;
  readonly passwordLastChangedAt?: string | null;
  readonly mustChangePassword?: boolean | null;
  readonly loginAttempts?: number | null;
  readonly lockedUntil?: string | null;
  readonly createdBy?: string | null;
  readonly updatedBy?: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly preferences: AsyncCollection<UserPreference>;
  readonly auditLogs: AsyncCollection<UserAuditLog>;
}

export declare type User = LazyLoading extends LazyLoadingDisabled ? EagerUser : LazyUser

export declare const User: (new (init: ModelInit<User>) => User) & {
  copyOf(source: User, mutator: (draft: MutableModel<User>) => MutableModel<User> | void): User;
}

type EagerUserPreference = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<UserPreference, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly page: string;
  readonly widget: string;
  readonly preference?: string | null;
  readonly userId: string;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyUserPreference = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<UserPreference, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly page: string;
  readonly widget: string;
  readonly preference?: string | null;
  readonly userId: string;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type UserPreference = LazyLoading extends LazyLoadingDisabled ? EagerUserPreference : LazyUserPreference

export declare const UserPreference: (new (init: ModelInit<UserPreference>) => UserPreference) & {
  copyOf(source: UserPreference, mutator: (draft: MutableModel<UserPreference>) => MutableModel<UserPreference> | void): UserPreference;
}

type EagerUserAuditLog = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<UserAuditLog, 'id'>;
    readOnlyFields: 'updatedAt';
  };
  readonly id: string;
  readonly userId: string;
  readonly user?: User | null;
  readonly action: string;
  readonly resource?: string | null;
  readonly details?: string | null;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly createdAt: string;
  readonly updatedAt?: string | null;
}

type LazyUserAuditLog = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<UserAuditLog, 'id'>;
    readOnlyFields: 'updatedAt';
  };
  readonly id: string;
  readonly userId: string;
  readonly user: AsyncItem<User | undefined>;
  readonly action: string;
  readonly resource?: string | null;
  readonly details?: string | null;
  readonly ipAddress?: string | null;
  readonly userAgent?: string | null;
  readonly createdAt: string;
  readonly updatedAt?: string | null;
}

export declare type UserAuditLog = LazyLoading extends LazyLoadingDisabled ? EagerUserAuditLog : LazyUserAuditLog

export declare const UserAuditLog: (new (init: ModelInit<UserAuditLog>) => UserAuditLog) & {
  copyOf(source: UserAuditLog, mutator: (draft: MutableModel<UserAuditLog>) => MutableModel<UserAuditLog> | void): UserAuditLog;
}

type EagerStaff = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<Staff, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly firstName: string;
  readonly lastName?: string | null;
  readonly role: StaffRole | keyof typeof StaffRole;
  readonly assignedVenueId?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyStaff = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<Staff, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly firstName: string;
  readonly lastName?: string | null;
  readonly role: StaffRole | keyof typeof StaffRole;
  readonly assignedVenueId?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type Staff = LazyLoading extends LazyLoadingDisabled ? EagerStaff : LazyStaff

export declare const Staff: (new (init: ModelInit<Staff>) => Staff) & {
  copyOf(source: Staff, mutator: (draft: MutableModel<Staff>) => MutableModel<Staff> | void): Staff;
}

type EagerAsset = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<Asset, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly condition: AssetCondition | keyof typeof AssetCondition;
  readonly acquiredDate: string;
  readonly lastCheckedDate: string;
  readonly venueId: string;
  readonly venue?: Venue | null;
  readonly entityId?: string | null;
  readonly entity?: Entity | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyAsset = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<Asset, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly condition: AssetCondition | keyof typeof AssetCondition;
  readonly acquiredDate: string;
  readonly lastCheckedDate: string;
  readonly venueId: string;
  readonly venue: AsyncItem<Venue | undefined>;
  readonly entityId?: string | null;
  readonly entity: AsyncItem<Entity | undefined>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type Asset = LazyLoading extends LazyLoadingDisabled ? EagerAsset : LazyAsset

export declare const Asset: (new (init: ModelInit<Asset>) => Asset) & {
  copyOf(source: Asset, mutator: (draft: MutableModel<Asset>) => MutableModel<Asset> | void): Asset;
}