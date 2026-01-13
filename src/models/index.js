// @ts-check
import { initSchema } from '@aws-amplify/datastore';
import { schema } from './schema';

const DataSource = {
  "SCRAPE": "SCRAPE",
  "API": "API",
  "MANUAL": "MANUAL"
};

const AssetCondition = {
  "NEW": "NEW",
  "GOOD": "GOOD",
  "FAIR": "FAIR",
  "POOR": "POOR",
  "RETIRED": "RETIRED"
};

const VenueStatus = {
  "ACTIVE": "ACTIVE",
  "INACTIVE": "INACTIVE",
  "PENDING": "PENDING"
};

const GameType = {
  "TOURNAMENT": "TOURNAMENT",
  "CASH_GAME": "CASH_GAME"
};

const GameStatus = {
  "INITIATING": "INITIATING",
  "SCHEDULED": "SCHEDULED",
  "REGISTERING": "REGISTERING",
  "RUNNING": "RUNNING",
  "CANCELLED": "CANCELLED",
  "FINISHED": "FINISHED",
  "NOT_IN_USE": "NOT_IN_USE",
  "NOT_PUBLISHED": "NOT_PUBLISHED",
  "CLOCK_STOPPED": "CLOCK_STOPPED",
  "UNKNOWN": "UNKNOWN"
};

const GameVariant = {
  "NOT_PUBLISHED": "NOT_PUBLISHED",
  "NLHE": "NLHE",
  "PLO": "PLO",
  "PLOM": "PLOM",
  "PL04": "PL04",
  "PLOM4": "PLOM4",
  "PLOM45": "PLOM45",
  "PLOM456": "PLOM456",
  "PLOM5": "PLOM5",
  "PLO5": "PLO5",
  "PLO6": "PLO6",
  "PLOM6": "PLOM6",
  "PLMIXED": "PLMIXED",
  "PLDC": "PLDC",
  "NLDC": "NLDC"
};

const GameFrequency = {
  "DAILY": "DAILY",
  "WEEKLY": "WEEKLY",
  "FORTNIGHTLY": "FORTNIGHTLY",
  "MONTHLY": "MONTHLY",
  "QUARTERLY": "QUARTERLY",
  "YEARLY": "YEARLY",
  "UNKNOWN": "UNKNOWN"
};

const RegistrationStatus = {
  "SCHEDULED": "SCHEDULED",
  "OPEN": "OPEN",
  "FINAL": "FINAL",
  "CLOSED": "CLOSED",
  "N_A": "N_A"
};

const TournamentType = {
  "FREEZEOUT": "FREEZEOUT",
  "REENTRY": "REENTRY",
  "RE_ENTRY": "RE_ENTRY",
  "REBUY": "REBUY",
  "BOUNTY": "BOUNTY",
  "KNOCKOUT": "KNOCKOUT",
  "SATELLITE": "SATELLITE",
  "TURBO": "TURBO",
  "HYPERTURBO": "HYPERTURBO",
  "DEEPSTACK": "DEEPSTACK"
};

const PaymentSourceType = {
  "CASH": "CASH",
  "SQUARE": "SQUARE",
  "CREDIT_CARD": "CREDIT_CARD",
  "INTERNAL_CREDIT": "INTERNAL_CREDIT",
  "UNKNOWN": "UNKNOWN"
};

const PlayerAccountStatus = {
  "ACTIVE": "ACTIVE",
  "SUSPENDED": "SUSPENDED",
  "PENDING_VERIFICATION": "PENDING_VERIFICATION"
};

const PlayerAccountCategory = {
  "NEW": "NEW",
  "RECREATIONAL": "RECREATIONAL",
  "REGULAR": "REGULAR",
  "VIP": "VIP",
  "LAPSED": "LAPSED"
};

const SeriesStatus = {
  "LIVE": "LIVE",
  "SCHEDULED": "SCHEDULED",
  "COMPLETED": "COMPLETED"
};

const PlayerTargetingClassification = {
  "NOT_PLAYED": "NotPlayed",
  "ACTIVE_EL": "Active_EL",
  "ACTIVE": "Active",
  "RETAIN_INACTIVE31_60D": "Retain_Inactive31_60d",
  "RETAIN_INACTIVE61_90D": "Retain_Inactive61_90d",
  "CHURNED_91_120D": "Churned_91_120d",
  "CHURNED_121_180D": "Churned_121_180d",
  "CHURNED_181_360D": "Churned_181_360d",
  "CHURNED_361D": "Churned_361d"
};

const PlayerVenueTargetingClassification = {
  "ACTIVE_EL": "Active_EL",
  "ACTIVE": "Active",
  "RETAIN_INACTIVE31_60D": "Retain_Inactive31_60d",
  "RETAIN_INACTIVE61_90D": "Retain_Inactive61_90d",
  "CHURNED_91_120D": "Churned_91_120d",
  "CHURNED_121_180D": "Churned_121_180d",
  "CHURNED_181_360D": "Churned_181_360d",
  "CHURNED_361D": "Churned_361d"
};

const TransactionType = {
  "BUY_IN": "BUY_IN",
  "DEPOSIT": "DEPOSIT",
  "TICKET_AWARD": "TICKET_AWARD",
  "TICKET_REDEMPTION": "TICKET_REDEMPTION",
  "CASH_AWARD": "CASH_AWARD",
  "QUALIFICATION": "QUALIFICATION",
  "WITHDRAWAL": "WITHDRAWAL"
};

const MessageStatus = {
  "SENT": "SENT",
  "DELIVERED": "DELIVERED",
  "FAILED": "FAILED",
  "READ": "READ"
};

const UserRole = {
  "SUPER_ADMIN": "SUPER_ADMIN",
  "ADMIN": "ADMIN",
  "VENUE_MANAGER": "VENUE_MANAGER",
  "TOURNAMENT_DIRECTOR": "TOURNAMENT_DIRECTOR",
  "MARKETING": "MARKETING"
};

const StaffRole = {
  "DEALER": "DEALER",
  "FLOOR_MANAGER": "FLOOR_MANAGER",
  "SERVICE": "SERVICE",
  "TOURNAMENT_DIRECTOR": "TOURNAMENT_DIRECTOR"
};

const TicketStatus = {
  "ACTIVE": "ACTIVE",
  "EXPIRED": "EXPIRED",
  "USED": "USED"
};

const PlayerEntryStatus = {
  "REGISTERED": "REGISTERED",
  "VOIDED": "VOIDED",
  "PLAYING": "PLAYING",
  "ELIMINATED": "ELIMINATED",
  "COMPLETED": "COMPLETED"
};

const CreditTransactionType = {
  "AWARD_PROMOTION": "AWARD_PROMOTION",
  "AWARD_REFUND": "AWARD_REFUND",
  "AWARD_MANUAL": "AWARD_MANUAL",
  "REDEEM_GAME_BUY_IN": "REDEEM_GAME_BUY_IN",
  "EXPIRED": "EXPIRED"
};

const PointsTransactionType = {
  "EARN_FROM_PLAY": "EARN_FROM_PLAY",
  "EARN_FROM_PROMOTION": "EARN_FROM_PROMOTION",
  "REDEEM_FOR_BUY_IN": "REDEEM_FOR_BUY_IN",
  "REDEEM_FOR_MERCH": "REDEEM_FOR_MERCH",
  "ADJUSTMENT_MANUAL": "ADJUSTMENT_MANUAL",
  "EXPIRED": "EXPIRED"
};

const SeriesCategory = {
  "REGULAR": "REGULAR",
  "SPECIAL": "SPECIAL",
  "PROMOTIONAL": "PROMOTIONAL",
  "CHAMPIONSHIP": "CHAMPIONSHIP",
  "SEASONAL": "SEASONAL"
};

const HolidayType = {
  "NEW_YEAR": "NEW_YEAR",
  "AUSTRALIA_DAY": "AUSTRALIA_DAY",
  "EASTER": "EASTER",
  "ANZAC_DAY": "ANZAC_DAY",
  "QUEENS_BIRTHDAY": "QUEENS_BIRTHDAY",
  "CHRISTMAS": "CHRISTMAS",
  "BOXING_DAY": "BOXING_DAY",
  "MELBOURNE_CUP": "MELBOURNE_CUP",
  "LABOUR_DAY": "LABOUR_DAY",
  "OTHER": "OTHER"
};

const VenueAssignmentStatus = {
  "AUTO_ASSIGNED": "AUTO_ASSIGNED",
  "MANUALLY_ASSIGNED": "MANUALLY_ASSIGNED",
  "PENDING_ASSIGNMENT": "PENDING_ASSIGNMENT",
  "UNASSIGNED": "UNASSIGNED",
  "RETROACTIVE_ASSIGNED": "RETROACTIVE_ASSIGNED"
};

const SeriesAssignmentStatus = {
  "AUTO_ASSIGNED": "AUTO_ASSIGNED",
  "MANUALLY_ASSIGNED": "MANUALLY_ASSIGNED",
  "PENDING_ASSIGNMENT": "PENDING_ASSIGNMENT",
  "UNASSIGNED": "UNASSIGNED",
  "NOT_SERIES": "NOT_SERIES"
};

const RecurringGameAssignmentStatus = {
  "AUTO_ASSIGNED": "AUTO_ASSIGNED",
  "MANUALLY_ASSIGNED": "MANUALLY_ASSIGNED",
  "PENDING_ASSIGNMENT": "PENDING_ASSIGNMENT",
  "NOT_RECURRING": "NOT_RECURRING",
  "DEVIATION_FLAGGED": "DEVIATION_FLAGGED",
  "CANDIDATE_RECURRING": "CANDIDATE_RECURRING"
};

const CostItemType = {
  "DEALER": "DEALER",
  "TOURNAMENT_DIRECTOR": "TOURNAMENT_DIRECTOR",
  "FLOOR_STAFF": "FLOOR_STAFF",
  "SECURITY": "SECURITY",
  "PRIZE_CONTRIBUTION": "PRIZE_CONTRIBUTION",
  "JACKPOT_CONTRIBUTION": "JACKPOT_CONTRIBUTION",
  "GUARANTEE_OVERLAY": "GUARANTEE_OVERLAY",
  "ADDED_VALUE": "ADDED_VALUE",
  "BOUNTY": "BOUNTY",
  "VENUE_RENTAL": "VENUE_RENTAL",
  "EQUIPMENT_RENTAL": "EQUIPMENT_RENTAL",
  "FOOD_BEVERAGE": "FOOD_BEVERAGE",
  "MARKETING": "MARKETING",
  "STREAMING": "STREAMING",
  "INSURANCE": "INSURANCE",
  "LICENSING": "LICENSING",
  "STAFF_TRAVEL": "STAFF_TRAVEL",
  "PLAYER_ACCOMMODATION": "PLAYER_ACCOMMODATION",
  "PROMOTION": "PROMOTION",
  "OTHER": "OTHER"
};

const CostItemRateType = {
  "STANDARD": "STANDARD",
  "OVERTIME": "OVERTIME",
  "DOUBLE_TIME": "DOUBLE_TIME",
  "PENALTY": "PENALTY",
  "HOLIDAY": "HOLIDAY",
  "SPECIAL": "SPECIAL",
  "FLAT": "FLAT"
};

const CostStatus = {
  "PENDING": "PENDING",
  "PARTIAL": "PARTIAL",
  "COMPLETE": "COMPLETE",
  "ESTIMATED": "ESTIMATED"
};

const SnapshotType = {
  "AUTO": "AUTO",
  "MANUAL": "MANUAL",
  "RECONCILED": "RECONCILED"
};

const EntryType = {
  "INITIAL": "INITIAL",
  "REENTRY": "REENTRY",
  "DIRECT_BUYIN": "DIRECT_BUYIN",
  "QUALIFIED_CONTINUATION": "QUALIFIED_CONTINUATION",
  "AGGREGATE_LISTING": "AGGREGATE_LISTING"
};

const ScraperJobTriggerSource = {
  "SCHEDULED": "SCHEDULED",
  "MANUAL": "MANUAL",
  "API": "API",
  "CONTROL": "CONTROL",
  "BULK": "BULK",
  "ADMIN": "ADMIN"
};

const ScraperJobStatus = {
  "QUEUED": "QUEUED",
  "RUNNING": "RUNNING",
  "COMPLETED": "COMPLETED",
  "FAILED": "FAILED",
  "CANCELLED": "CANCELLED",
  "TIMEOUT": "TIMEOUT",
  "STOPPED_TIMEOUT": "STOPPED_TIMEOUT",
  "STOPPED_BLANKS": "STOPPED_BLANKS",
  "STOPPED_NOT_FOUND": "STOPPED_NOT_FOUND",
  "STOPPED_ERROR": "STOPPED_ERROR",
  "STOPPED_MANUAL": "STOPPED_MANUAL",
  "STOPPED_NO_VENUE": "STOPPED_NO_VENUE",
  "STOPPED_MAX_ID": "STOPPED_MAX_ID"
};

const ScrapeUrlStatus = {
  "ACTIVE": "ACTIVE",
  "INACTIVE": "INACTIVE",
  "DO_NOT_SCRAPE": "DO_NOT_SCRAPE",
  "ERROR": "ERROR",
  "ARCHIVED": "ARCHIVED"
};

const ScrapeAttemptStatus = {
  "SUCCESS": "SUCCESS",
  "FAILED": "FAILED",
  "ERROR": "ERROR",
  "SKIPPED_DONOTSCRAPE": "SKIPPED_DONOTSCRAPE",
  "SKIPPED_VENUE": "SKIPPED_VENUE",
  "BLANK": "BLANK",
  "NO_CHANGES": "NO_CHANGES",
  "UPDATED": "UPDATED",
  "SAVED": "SAVED",
  "SUCCESS_EDITED": "SUCCESS_EDITED",
  "SAVED_EDITED": "SAVED_EDITED",
  "UPDATED_EDITED": "UPDATED_EDITED",
  "NOT_FOUND": "NOT_FOUND",
  "NOT_IN_USE": "NOT_IN_USE",
  "NOT_PUBLISHED": "NOT_PUBLISHED"
};

const TimeRange = {
  "LAST_HOUR": "LAST_HOUR",
  "LAST_24_HOURS": "LAST_24_HOURS",
  "LAST_7_DAYS": "LAST_7_DAYS",
  "LAST_30_DAYS": "LAST_30_DAYS",
  "CUSTOM": "CUSTOM"
};

const ScraperOperation = {
  "START": "START",
  "STOP": "STOP",
  "ENABLE": "ENABLE",
  "DISABLE": "DISABLE",
  "STATUS": "STATUS",
  "RESET": "RESET"
};

const ScraperJobMode = {
  "SINGLE": "single",
  "BULK": "bulk",
  "RANGE": "range",
  "GAPS": "gaps",
  "AUTO": "auto",
  "REFRESH": "refresh",
  "MULTI_ID": "multiId"
};

const SocialPlatform = {
  "FACEBOOK": "FACEBOOK",
  "INSTAGRAM": "INSTAGRAM",
  "TWITTER": "TWITTER",
  "LINKEDIN": "LINKEDIN"
};

const SocialAccountStatus = {
  "ACTIVE": "ACTIVE",
  "INACTIVE": "INACTIVE",
  "PENDING_VERIFICATION": "PENDING_VERIFICATION",
  "ERROR": "ERROR",
  "RATE_LIMITED": "RATE_LIMITED"
};

const SocialPostType = {
  "TEXT": "TEXT",
  "IMAGE": "IMAGE",
  "VIDEO": "VIDEO",
  "LINK": "LINK",
  "EVENT": "EVENT",
  "ALBUM": "ALBUM",
  "LIVE": "LIVE"
};

const SocialScrapeStatus = {
  "RUNNING": "RUNNING",
  "SUCCESS": "SUCCESS",
  "FAILED": "FAILED",
  "SKIPPED": "SKIPPED",
  "RATE_LIMITED": "RATE_LIMITED",
  "TIMEOUT": "TIMEOUT",
  "NO_NEW_CONTENT": "NO_NEW_CONTENT",
  "CANCELLED": "CANCELLED",
  "ERROR_STOPPED": "ERROR_STOPPED"
};

const SocialPostStatus = {
  "ACTIVE": "ACTIVE",
  "HIDDEN": "HIDDEN",
  "ARCHIVED": "ARCHIVED",
  "DELETED": "DELETED"
};

const ScheduledPostStatus = {
  "SCHEDULED": "SCHEDULED",
  "PUBLISHED": "PUBLISHED",
  "FAILED": "FAILED",
  "CANCELLED": "CANCELLED"
};

const SyncEventStatus = {
  "STARTED": "STARTED",
  "IN_PROGRESS": "IN_PROGRESS",
  "COMPLETED": "COMPLETED",
  "RATE_LIMITED": "RATE_LIMITED",
  "FAILED": "FAILED",
  "CANCELLED": "CANCELLED",
  "ERROR_STOPPED": "ERROR_STOPPED"
};

const SocialPostContentType = {
  "RESULT": "RESULT",
  "PROMOTIONAL": "PROMOTIONAL",
  "GENERAL": "GENERAL",
  "COMMENT": "COMMENT"
};

const SocialPostProcessingStatus = {
  "PENDING": "PENDING",
  "PROCESSING": "PROCESSING",
  "EXTRACTED": "EXTRACTED",
  "MATCHED": "MATCHED",
  "LINKED": "LINKED",
  "FAILED": "FAILED",
  "SKIPPED": "SKIPPED",
  "MANUAL_REVIEW": "MANUAL_REVIEW",
  "PREVIEW": "PREVIEW"
};

const SocialPostLinkType = {
  "AUTO_MATCHED": "AUTO_MATCHED",
  "MANUAL_LINKED": "MANUAL_LINKED",
  "VERIFIED": "VERIFIED",
  "REJECTED": "REJECTED",
  "TOURNAMENT_ID": "TOURNAMENT_ID"
};

const NonCashPrizeType = {
  "ACCUMULATOR_TICKET": "ACCUMULATOR_TICKET",
  "SATELLITE_TICKET": "SATELLITE_TICKET",
  "BOUNTY_TICKET": "BOUNTY_TICKET",
  "TOURNAMENT_ENTRY": "TOURNAMENT_ENTRY",
  "SERIES_TICKET": "SERIES_TICKET",
  "MAIN_EVENT_SEAT": "MAIN_EVENT_SEAT",
  "VALUED_SEAT": "VALUED_SEAT",
  "TRAVEL_PACKAGE": "TRAVEL_PACKAGE",
  "ACCOMMODATION_PACKAGE": "ACCOMMODATION_PACKAGE",
  "VOUCHER": "VOUCHER",
  "FOOD_CREDIT": "FOOD_CREDIT",
  "CASINO_CREDIT": "CASINO_CREDIT",
  "MERCHANDISE": "MERCHANDISE",
  "POINTS": "POINTS",
  "OTHER": "OTHER"
};

const TicketAwardSource = {
  "SOCIAL_POST_RESULT": "SOCIAL_POST_RESULT",
  "SOCIAL_POST_PROMO": "SOCIAL_POST_PROMO",
  "SCRAPED_DATA": "SCRAPED_DATA",
  "MANUAL_ENTRY": "MANUAL_ENTRY",
  "RECURRING_GAME_DEFAULT": "RECURRING_GAME_DEFAULT"
};

const BackgroundTaskType = {
  "VENUE_REASSIGNMENT": "VENUE_REASSIGNMENT",
  "BULK_VENUE_REASSIGNMENT": "BULK_VENUE_REASSIGNMENT",
  "ENTITY_REASSIGNMENT": "ENTITY_REASSIGNMENT",
  "VENUE_CLONE": "VENUE_CLONE",
  "BULK_IMPORT": "BULK_IMPORT",
  "DATA_MIGRATION": "DATA_MIGRATION",
  "REPORT_GENERATION": "REPORT_GENERATION",
  "VENUE_DETAILS_RECALC": "VENUE_DETAILS_RECALC",
  "RECURRING_GAME_DETECTION": "RECURRING_GAME_DETECTION",
  "METRICS_CALCULATION": "METRICS_CALCULATION"
};

const BackgroundTaskStatus = {
  "QUEUED": "QUEUED",
  "RUNNING": "RUNNING",
  "COMPLETED": "COMPLETED",
  "FAILED": "FAILED",
  "CANCELLED": "CANCELLED",
  "PARTIAL_SUCCESS": "PARTIAL_SUCCESS"
};

const SeriesResolutionStatus = {
  "MATCHED_EXISTING": "MATCHED_EXISTING",
  "CREATED_NEW": "CREATED_NEW",
  "NOT_SERIES": "NOT_SERIES",
  "SKIPPED": "SKIPPED",
  "PENDING_REVIEW": "PENDING_REVIEW",
  "FAILED": "FAILED",
  "NO_MATCH": "NO_MATCH",
  "DEFERRED": "DEFERRED"
};

const RecurringResolutionStatus = {
  "MATCHED_EXISTING": "MATCHED_EXISTING",
  "CREATED_NEW": "CREATED_NEW",
  "NOT_RECURRING": "NOT_RECURRING",
  "SKIPPED": "SKIPPED",
  "PENDING_REVIEW": "PENDING_REVIEW",
  "FAILED": "FAILED",
  "NO_MATCH": "NO_MATCH",
  "DEFERRED": "DEFERRED"
};

const SessionMode = {
  "CASH": "CASH",
  "TOURNAMENT": "TOURNAMENT"
};

const PokerVariant = {
  "HOLD_EM": "HOLD_EM",
  "HOLD_EM_SHORT_DECK": "HOLD_EM_SHORT_DECK",
  "OMAHA_HI": "OMAHA_HI",
  "OMAHA_HILO": "OMAHA_HILO",
  "OMAHA5_HI": "OMAHA5_HI",
  "OMAHA5_HILO": "OMAHA5_HILO",
  "OMAHA6_HI": "OMAHA6_HI",
  "OMAHA6_HILO": "OMAHA6_HILO",
  "STUD_HI": "STUD_HI",
  "STUD_HILO": "STUD_HILO",
  "RAZZ": "RAZZ",
  "DRAW_2_7_TRIPLE": "DRAW_2_7_TRIPLE",
  "DRAW_2_7_SINGLE": "DRAW_2_7_SINGLE",
  "DRAW_5_CARD": "DRAW_5_CARD",
  "BADUGI": "BADUGI",
  "MIXED_HORSE": "MIXED_HORSE",
  "MIXED_8_GAME": "MIXED_8GAME",
  "MIXED_HOSE": "MIXED_HOSE",
  "MIXED_RASH": "MIXED_RASH",
  "MIXED_DEALERS_CHOICE": "MIXED_DEALERS_CHOICE",
  "MIXED_ROTATION": "MIXED_ROTATION",
  "MIXED_OTHER": "MIXED_OTHER",
  "COURCHEVEL": "COURCHEVEL",
  "IRISH": "IRISH",
  "PINEAPPLE": "PINEAPPLE",
  "CRAZY_PINEAPPLE": "CRAZY_PINEAPPLE",
  "OTHER": "OTHER",
  "NOT_SPECIFIED": "NOT_SPECIFIED"
};

const BettingStructure = {
  "NO_LIMIT": "NO_LIMIT",
  "POT_LIMIT": "POT_LIMIT",
  "FIXED_LIMIT": "FIXED_LIMIT",
  "SPREAD_LIMIT": "SPREAD_LIMIT",
  "CAP_LIMIT": "CAP_LIMIT",
  "MIXED_LIMIT": "MIXED_LIMIT"
};

const SpeedType = {
  "SLOW": "SLOW",
  "REGULAR": "REGULAR",
  "TURBO": "TURBO",
  "HYPER": "HYPER",
  "SUPER_TURBO": "SUPER_TURBO"
};

const TableSize = {
  "HEADS_UP": "HEADS_UP",
  "SHORT_HANDED": "SHORT_HANDED",
  "FULL_RING": "FULL_RING"
};

const DealType = {
  "LIVE_DEALER": "LIVE_DEALER",
  "AUTO_SHUFFLER": "AUTO_SHUFFLER",
  "ELECTRONIC": "ELECTRONIC",
  "SELF_DEALT": "SELF_DEALT"
};

const BuyInTier = {
  "FREEROLL": "FREEROLL",
  "MICRO": "MICRO",
  "LOW": "LOW",
  "MID": "MID",
  "HIGH": "HIGH",
  "SUPER_HIGH": "SUPER_HIGH",
  "ULTRA_HIGH": "ULTRA_HIGH"
};

const EntryStructure = {
  "FREEZEOUT": "FREEZEOUT",
  "SINGLE_REBUY": "SINGLE_REBUY",
  "UNLIMITED_REBUY": "UNLIMITED_REBUY",
  "RE_ENTRY": "RE_ENTRY",
  "UNLIMITED_RE_ENTRY": "UNLIMITED_RE_ENTRY",
  "ADD_ON_ONLY": "ADD_ON_ONLY",
  "REBUY_ADDON": "REBUY_ADDON"
};

const BountyType = {
  "NONE": "NONE",
  "STANDARD": "STANDARD",
  "PROGRESSIVE": "PROGRESSIVE",
  "MYSTERY": "MYSTERY",
  "SUPER_KNOCKOUT": "SUPER_KNOCKOUT",
  "TOTAL_KNOCKOUT": "TOTAL_KNOCKOUT"
};

const TournamentPurpose = {
  "STANDARD": "STANDARD",
  "SATELLITE": "SATELLITE",
  "MEGA_SATELLITE": "MEGA_SATELLITE",
  "SUPER_SATELLITE": "SUPER_SATELLITE",
  "QUALIFIER": "QUALIFIER",
  "STEP_SATELLITE": "STEP_SATELLITE",
  "FREEROLL": "FREEROLL",
  "CHARITY": "CHARITY",
  "LEAGUE_POINTS": "LEAGUE_POINTS",
  "LAST_LONGER": "LAST_LONGER",
  "PROMOTIONAL": "PROMOTIONAL"
};

const StackDepth = {
  "SHALLOW": "SHALLOW",
  "STANDARD": "STANDARD",
  "DEEP": "DEEP",
  "MEGA": "MEGA",
  "SUPER": "SUPER"
};

const LateRegistration = {
  "NONE": "NONE",
  "STANDARD": "STANDARD",
  "EXTENDED": "EXTENDED",
  "UNLIMITED": "UNLIMITED"
};

const PayoutStructure = {
  "STANDARD": "STANDARD",
  "FLAT": "FLAT",
  "WINNER_TAKE_ALL": "WINNER_TAKE_ALL",
  "FIFTY_FIFTY": "FIFTY_FIFTY",
  "TOP_HEAVY": "TOP_HEAVY",
  "SATELLITE_TICKETS": "SATELLITE_TICKETS",
  "MILESTONE": "MILESTONE",
  "PROGRESSIVE": "PROGRESSIVE"
};

const TournamentScheduleType = {
  "ONE_OFF": "ONE_OFF",
  "RECURRING": "RECURRING",
  "SERIES_EVENT": "SERIES_EVENT",
  "SPECIAL_EVENT": "SPECIAL_EVENT",
  "FESTIVAL_EVENT": "FESTIVAL_EVENT",
  "AD_HOC": "AD_HOC"
};

const CashGameType = {
  "STANDARD": "STANDARD",
  "CAPPED": "CAPPED",
  "UNCAPPED": "UNCAPPED",
  "BOMB_POT": "BOMB_POT",
  "DOUBLE_BOARD": "DOUBLE_BOARD",
  "MANDATORY_STRADDLE": "MANDATORY_STRADDLE",
  "STRADDLE_OPTIONAL": "STRADDLE_OPTIONAL",
  "ANTE_GAME": "ANTE_GAME",
  "MUST_MOVE": "MUST_MOVE",
  "SHORT_DECK": "SHORT_DECK"
};

const CashRakeType = {
  "NO_RAKE": "NO_RAKE",
  "POT_PERCENTAGE": "POT_PERCENTAGE",
  "POT_PERCENTAGE_CAPPED": "POT_PERCENTAGE_CAPPED",
  "TIME_RAKE": "TIME_RAKE",
  "JACKPOT_DROP": "JACKPOT_DROP",
  "PROMOTIONAL": "PROMOTIONAL",
  "SUBSCRIPTION": "SUBSCRIPTION"
};

const MixedGameComponent = {
  "NLHE": "NLHE",
  "LHE": "LHE",
  "PLO": "PLO",
  "PLO8": "PLO8",
  "LO8": "LO8",
  "STUD": "STUD",
  "STUD8": "STUD8",
  "RAZZ": "RAZZ",
  "TRIPLE_DRAW": "TRIPLE_DRAW",
  "SINGLE_DRAW": "SINGLE_DRAW",
  "BADUGI": "BADUGI",
  "NL_DRAW": "NL_DRAW",
  "COURCHEVEL": "COURCHEVEL",
  "SHORT_DECK": "SHORT_DECK",
  "BIG_O": "BIG_O",
  "OTHER": "OTHER"
};

const ClassificationSource = {
  "SCRAPED": "SCRAPED",
  "DERIVED": "DERIVED",
  "INFERRED": "INFERRED",
  "INHERITED": "INHERITED",
  "MANUAL": "MANUAL",
  "MIGRATED": "MIGRATED"
};

const RecurringGameInstanceStatus = {
  "CONFIRMED": "CONFIRMED",
  "CANCELLED": "CANCELLED",
  "SKIPPED": "SKIPPED",
  "REPLACED": "REPLACED",
  "UNKNOWN": "UNKNOWN",
  "NO_SHOW": "NO_SHOW"
};

const InstanceDeviationType = {
  "NONE": "NONE",
  "TIME_CHANGE": "TIME_CHANGE",
  "BUYIN_CHANGE": "BUYIN_CHANGE",
  "GUARANTEE_CHANGE": "GUARANTEE_CHANGE",
  "FORMAT_CHANGE": "FORMAT_CHANGE",
  "SPECIAL_EDITION": "SPECIAL_EDITION",
  "MULTIPLE": "MULTIPLE"
};

const GameProcessedAction = {
  "CREATED": "CREATED",
  "UPDATED": "UPDATED",
  "SKIPPED": "SKIPPED",
  "ERROR": "ERROR",
  "NOT_FOUND": "NOT_FOUND",
  "NOT_PUBLISHED": "NOT_PUBLISHED"
};

const { Entity, BackgroundTask, Venue, VenueDetails, Game, TournamentStructure, TournamentLevelData, CashStructure, RakeStructure, GameFinancialSnapshot, GameCost, GameCostLineItem, GameCostItem, RecurringGame, RecurringGameInstance, TournamentSeriesTitle, TournamentSeries, Player, PlayerSummary, PlayerEntry, PlayerResult, PlayerVenue, PlayerTransaction, PlayerCredits, PlayerPoints, KnownPlayerIdentity, TicketTemplate, PlayerTicket, MarketingMessage, PlayerMarketingMessage, PlayerMarketingPreferences, EntityMetrics, VenueMetrics, RecurringGameMetrics, TournamentSeriesMetrics, ScraperJob, ScrapeURL, ScrapeAttempt, ScraperState, ScrapeStructure, DataSync, ScraperSettings, S3Storage, ActiveGame, RecentlyFinishedGame, UpcomingGame, DashboardCache, SocialAccount, SocialPost, SocialScrapeAttempt, SocialScheduledPost, SocialPostGameLink, SocialPostGameData, SocialPostPlacement, User, UserPreference, UserAuditLog, Staff, Asset, VenueMetricsResult, VenueMetricsUpdateResult, VenueMetricsPreview, VenueMatch, AllCountsResult, VenueAssignmentResult, AffectedRecords, BatchVenueAssignmentResult, SaveVenueAssignmentInfo, VenueMetricsSnapshot, ConsolidationPreviewResult, ConsolidationDetails, ConsolidationSibling, ProjectedConsolidationTotals, ReScrapeResult, EntityScrapingStatus, EntityVenueAssignmentSummary, VenueAssignmentSummary, ReassignGameVenueResult, BulkReassignGameVenuesResult, SaveGameResult, SaveRecurringAssignmentInfo, ProcessedGameDetail, PotentialTemplate, ProcessUnassignedGamesResult, UnassignedGamesStats, PatternSampleGame, CandidatePattern, PreviewPatternsResult, RecurringGameVenueStats, OrphanedRecurringGame, UnassignedGameSample, RecurringGameDistribution, DuplicateEntry, DuplicateGroup, FindDuplicatesResult, MergeDetail, MergeDuplicatesResult, CleanupOrphansResult, MatchDetails, GameActionDetail, ActionSummary, ReResolveGameResult, ReResolveVenueResult, RecurringGameWithStats, RecurringGamePlayerSummary, SearchRecurringGamesResult, EnrichGameDataOutput, EnrichmentValidationResult, EnrichmentValidationError, EnrichmentValidationWarning, EnrichedGameData, EnrichmentMetadata, SeriesResolutionMetadata, RecurringResolutionMetadata, VenueResolutionMetadata, CalculateGameFinancialsOutput, GameCostCalculation, GameFinancialSnapshotCalculation, FinancialsSummary, FinancialsSaveResult, GameDeletionCounts, PlayerStatsUpdateCounts, GameDeletionDetails, ConsolidationCleanupResult, DeleteGameWithCleanupResult, GapInfo, DetectGapsResult, ReconcileInstanceDetail, ReconcileInstancesResult, InstanceSummary, WeekSummary, VenueComplianceReport, RecurringGameInstanceResult, RecordMissedInstanceResult, UpdateInstanceStatusResult, WeekInstancesResult, InstanceNeedingReview, InstancesNeedingReviewResult, AwardTicketResult, BulkAwardTicketsResult, TicketAwardSummary, PlayerTicketConnection, RefreshAllMetricsResult, MetricsBySeriesType, SeriesTypeBreakdown, MetricsUpdateResult, EntityDashboard, VenueDashboard, RecurringGameReport, TournamentSeriesReport, SeriesVsRegularComparison, TrendAnalysis, ScraperControlResponse, ScraperStateData, ScraperResults, ScraperLogData, ScrapedGameStatus, ScraperJobURLResult, ScraperMetrics, ScrapedGameSummary, ScrapedGameData, ScrapedTournamentLevel, ScrapedBreak, ScrapedPlayerEntry, ScrapedPlayerSeating, ScrapedPlayerResult, ScrapedTable, ScrapedTableSeatData, ScrapedVenueMatch, ScrapedVenueMatchDetails, ScraperJobsReport, GapRange, GapSummary, S3VersionHistory, CachingStatsResponse, S3ContentResponse, S3StorageHistoryResponse, S3StorageListResponse, S3StorageConnection, ScraperJobConnection, ScrapeURLConnection, GameProcessedEvent, GameProcessedData, GameSaveResult, SyncActiveGameResult, RefreshRunningGamesResult, DashboardData, JobProgressEvent, SocialFeedConnection, SocialPostConnection, SocialAccountConnection, SocialAccountMetrics, SocialScrapeResult, SyncPageInfoResult, SocialSyncEvent, SocialPostNonCashPrize, ProcessSocialPostResult, GameMatchCandidate, ProcessBatchResult, SocialPostMatchingStats, UnlinkedPostsConnection, SocialPostWithMatchInfo, TicketExtractionSummary, TicketTypeCount, PlacementPreview, SocialToGameReconciliation, TicketReconciliationReport, ReconcileResult, GameToSocialMatchResult, SocialPostMatchCandidate, GameToSocialLinkDetail, GameToSocialMatchContext, DateRange, BatchGameToSocialMatchResult, UserManagementResponse, UsersConnection, DetectedMultiDayPattern, ResetPasswordResponse, ErrorMetric, HourlyMetric, EntityScraperMetrics, EntityJobSummary, TournamentIdBounds, CacheActivityLog, TournamentLevel, Break, GamesNeedingVenueResponse, GetReassignmentStatusResult, BackgroundTaskInfo, RefreshResponse, SaveSeriesAssignmentInfo, UnfinishedGamesConnection } = initSchema(schema);

export {
  Entity,
  BackgroundTask,
  Venue,
  VenueDetails,
  Game,
  TournamentStructure,
  TournamentLevelData,
  CashStructure,
  RakeStructure,
  GameFinancialSnapshot,
  GameCost,
  GameCostLineItem,
  GameCostItem,
  RecurringGame,
  RecurringGameInstance,
  TournamentSeriesTitle,
  TournamentSeries,
  Player,
  PlayerSummary,
  PlayerEntry,
  PlayerResult,
  PlayerVenue,
  PlayerTransaction,
  PlayerCredits,
  PlayerPoints,
  KnownPlayerIdentity,
  TicketTemplate,
  PlayerTicket,
  MarketingMessage,
  PlayerMarketingMessage,
  PlayerMarketingPreferences,
  EntityMetrics,
  VenueMetrics,
  RecurringGameMetrics,
  TournamentSeriesMetrics,
  ScraperJob,
  ScrapeURL,
  ScrapeAttempt,
  ScraperState,
  ScrapeStructure,
  DataSync,
  ScraperSettings,
  S3Storage,
  ActiveGame,
  RecentlyFinishedGame,
  UpcomingGame,
  DashboardCache,
  SocialAccount,
  SocialPost,
  SocialScrapeAttempt,
  SocialScheduledPost,
  SocialPostGameLink,
  SocialPostGameData,
  SocialPostPlacement,
  User,
  UserPreference,
  UserAuditLog,
  Staff,
  Asset,
  DataSource,
  AssetCondition,
  VenueStatus,
  GameType,
  GameStatus,
  GameVariant,
  GameFrequency,
  RegistrationStatus,
  TournamentType,
  PaymentSourceType,
  PlayerAccountStatus,
  PlayerAccountCategory,
  SeriesStatus,
  PlayerTargetingClassification,
  PlayerVenueTargetingClassification,
  TransactionType,
  MessageStatus,
  UserRole,
  StaffRole,
  TicketStatus,
  PlayerEntryStatus,
  CreditTransactionType,
  PointsTransactionType,
  SeriesCategory,
  HolidayType,
  VenueAssignmentStatus,
  SeriesAssignmentStatus,
  RecurringGameAssignmentStatus,
  CostItemType,
  CostItemRateType,
  CostStatus,
  SnapshotType,
  EntryType,
  ScraperJobTriggerSource,
  ScraperJobStatus,
  ScrapeURLStatus,
  ScrapeAttemptStatus,
  TimeRange,
  ScraperOperation,
  ScraperJobMode,
  SocialPlatform,
  SocialAccountStatus,
  SocialPostType,
  SocialScrapeStatus,
  SocialPostStatus,
  ScheduledPostStatus,
  SyncEventStatus,
  SocialPostContentType,
  SocialPostProcessingStatus,
  SocialPostLinkType,
  NonCashPrizeType,
  TicketAwardSource,
  BackgroundTaskType,
  BackgroundTaskStatus,
  SeriesResolutionStatus,
  RecurringResolutionStatus,
  SessionMode,
  PokerVariant,
  BettingStructure,
  SpeedType,
  TableSize,
  DealType,
  BuyInTier,
  EntryStructure,
  BountyType,
  TournamentPurpose,
  StackDepth,
  LateRegistration,
  PayoutStructure,
  TournamentScheduleType,
  CashGameType,
  CashRakeType,
  MixedGameComponent,
  ClassificationSource,
  RecurringGameInstanceStatus,
  InstanceDeviationType,
  GameProcessedAction,
  VenueMetricsResult,
  VenueMetricsUpdateResult,
  VenueMetricsPreview,
  VenueMatch,
  AllCountsResult,
  VenueAssignmentResult,
  AffectedRecords,
  BatchVenueAssignmentResult,
  SaveVenueAssignmentInfo,
  VenueMetricsSnapshot,
  ConsolidationPreviewResult,
  ConsolidationDetails,
  ConsolidationSibling,
  ProjectedConsolidationTotals,
  ReScrapeResult,
  EntityScrapingStatus,
  EntityVenueAssignmentSummary,
  VenueAssignmentSummary,
  ReassignGameVenueResult,
  BulkReassignGameVenuesResult,
  SaveGameResult,
  SaveRecurringAssignmentInfo,
  ProcessedGameDetail,
  PotentialTemplate,
  ProcessUnassignedGamesResult,
  UnassignedGamesStats,
  PatternSampleGame,
  CandidatePattern,
  PreviewPatternsResult,
  RecurringGameVenueStats,
  OrphanedRecurringGame,
  UnassignedGameSample,
  RecurringGameDistribution,
  DuplicateEntry,
  DuplicateGroup,
  FindDuplicatesResult,
  MergeDetail,
  MergeDuplicatesResult,
  CleanupOrphansResult,
  MatchDetails,
  GameActionDetail,
  ActionSummary,
  ReResolveGameResult,
  ReResolveVenueResult,
  RecurringGameWithStats,
  RecurringGamePlayerSummary,
  SearchRecurringGamesResult,
  EnrichGameDataOutput,
  EnrichmentValidationResult,
  EnrichmentValidationError,
  EnrichmentValidationWarning,
  EnrichedGameData,
  EnrichmentMetadata,
  SeriesResolutionMetadata,
  RecurringResolutionMetadata,
  VenueResolutionMetadata,
  CalculateGameFinancialsOutput,
  GameCostCalculation,
  GameFinancialSnapshotCalculation,
  FinancialsSummary,
  FinancialsSaveResult,
  GameDeletionCounts,
  PlayerStatsUpdateCounts,
  GameDeletionDetails,
  ConsolidationCleanupResult,
  DeleteGameWithCleanupResult,
  GapInfo,
  DetectGapsResult,
  ReconcileInstanceDetail,
  ReconcileInstancesResult,
  InstanceSummary,
  WeekSummary,
  VenueComplianceReport,
  RecurringGameInstanceResult,
  RecordMissedInstanceResult,
  UpdateInstanceStatusResult,
  WeekInstancesResult,
  InstanceNeedingReview,
  InstancesNeedingReviewResult,
  AwardTicketResult,
  BulkAwardTicketsResult,
  TicketAwardSummary,
  PlayerTicketConnection,
  RefreshAllMetricsResult,
  MetricsBySeriesType,
  SeriesTypeBreakdown,
  MetricsUpdateResult,
  EntityDashboard,
  VenueDashboard,
  RecurringGameReport,
  TournamentSeriesReport,
  SeriesVsRegularComparison,
  TrendAnalysis,
  ScraperControlResponse,
  ScraperStateData,
  ScraperResults,
  ScraperLogData,
  ScrapedGameStatus,
  ScraperJobURLResult,
  ScraperMetrics,
  ScrapedGameSummary,
  ScrapedGameData,
  ScrapedTournamentLevel,
  ScrapedBreak,
  ScrapedPlayerEntry,
  ScrapedPlayerSeating,
  ScrapedPlayerResult,
  ScrapedTable,
  ScrapedTableSeatData,
  ScrapedVenueMatch,
  ScrapedVenueMatchDetails,
  ScraperJobsReport,
  GapRange,
  GapSummary,
  S3VersionHistory,
  CachingStatsResponse,
  S3ContentResponse,
  S3StorageHistoryResponse,
  S3StorageListResponse,
  S3StorageConnection,
  ScraperJobConnection,
  ScrapeURLConnection,
  GameProcessedEvent,
  GameProcessedData,
  GameSaveResult,
  SyncActiveGameResult,
  RefreshRunningGamesResult,
  DashboardData,
  JobProgressEvent,
  SocialFeedConnection,
  SocialPostConnection,
  SocialAccountConnection,
  SocialAccountMetrics,
  SocialScrapeResult,
  SyncPageInfoResult,
  SocialSyncEvent,
  SocialPostNonCashPrize,
  ProcessSocialPostResult,
  GameMatchCandidate,
  ProcessBatchResult,
  SocialPostMatchingStats,
  UnlinkedPostsConnection,
  SocialPostWithMatchInfo,
  TicketExtractionSummary,
  TicketTypeCount,
  PlacementPreview,
  SocialToGameReconciliation,
  TicketReconciliationReport,
  ReconcileResult,
  GameToSocialMatchResult,
  SocialPostMatchCandidate,
  GameToSocialLinkDetail,
  GameToSocialMatchContext,
  DateRange,
  BatchGameToSocialMatchResult,
  UserManagementResponse,
  UsersConnection,
  DetectedMultiDayPattern,
  ResetPasswordResponse,
  ErrorMetric,
  HourlyMetric,
  EntityScraperMetrics,
  EntityJobSummary,
  TournamentIdBounds,
  CacheActivityLog,
  TournamentLevel,
  Break,
  GamesNeedingVenueResponse,
  GetReassignmentStatusResult,
  BackgroundTaskInfo,
  RefreshResponse,
  SaveSeriesAssignmentInfo,
  UnfinishedGamesConnection
};