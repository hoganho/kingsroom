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
  "NLHE": "NLHE",
  "PLO": "PLO",
  "PLOM": "PLOM",
  "PLO5": "PLO5",
  "PLO6": "PLO6"
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
  "REBUY": "REBUY",
  "SATELLITE": "SATELLITE",
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

const CostItemType = {
  "DEALER": "DEALER",
  "TOURNAMENT_DIRECTOR": "TOURNAMENT_DIRECTOR",
  "PRIZE_CONTRIBUTION": "PRIZE_CONTRIBUTION",
  "JACKPOT_CONTRIBUTION": "JACKPOT_CONTRIBUTION",
  "PROMOTION": "PROMOTION",
  "FLOOR_STAFF": "FLOOR_STAFF",
  "SECURITY": "SECURITY",
  "EQUIPMENT_RENTAL": "EQUIPMENT_RENTAL",
  "VENUE_RENTAL": "VENUE_RENTAL",
  "INSURANCE": "INSURANCE",
  "OTHER": "OTHER"
};

const CostItemRateType = {
  "STANDARD": "STANDARD",
  "PENALTY": "PENALTY",
  "OVERTIME": "OVERTIME",
  "HOLIDAY": "HOLIDAY",
  "SPECIAL": "SPECIAL"
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
  "TIMEOUT": "TIMEOUT"
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
  "SKIPPED_DONOTSCRAPE": "SKIPPED_DONOTSCRAPE",
  "SKIPPED_VENUE": "SKIPPED_VENUE",
  "BLANK": "BLANK",
  "NO_CHANGES": "NO_CHANGES",
  "UPDATED": "UPDATED",
  "SAVED": "SAVED",
  "SUCCESS_EDITED": "SUCCESS_EDITED",
  "SAVED_EDITED": "SAVED_EDITED",
  "UPDATED_EDITED": "UPDATED_EDITED"
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
  "NO_NEW_CONTENT": "NO_NEW_CONTENT"
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

const { Entity, Venue, VenueDetails, TournamentSeriesTitle, TournamentSeries, Game, TournamentStructure, TournamentLevelData, CashStructure, RakeStructure, GameFinancialSnapshot, GameCost, GameCostLineItem, GameCostItem, Player, PlayerSummary, PlayerEntry, PlayerResult, PlayerVenue, PlayerTransaction, PlayerCredits, PlayerPoints, KnownPlayerIdentity, ScraperJob, ScrapeURL, ScrapeAttempt, ScraperState, ScrapeStructure, DataSync, S3Storage, User, UserPreference, UserAuditLog, Staff, Asset, TicketTemplate, PlayerTicket, MarketingMessage, PlayerMarketingMessage, PlayerMarketingPreferences, SocialAccount, SocialPost, SocialScrapeAttempt, SocialScheduledPost, VenueMetricsResult, VenueMetricsUpdateResult, VenueMetricsPreview, VenueMetricsSnapshot, ConsolidationPreviewResult, ConsolidationDetails, ConsolidationSibling, ProjectedConsolidationTotals, DetectedMultiDayPattern, UserManagementResponse, ResetPasswordResponse, UsersConnection, ScraperControlResponse, ScraperStateData, ScraperResults, ScraperLogData, ScrapedGameStatus, ScraperJobURLResult, ScraperMetrics, ErrorMetric, HourlyMetric, EntityScraperMetrics, ScrapedGameSummary, ScrapedGameData, ScrapedTournamentLevel, ScrapedBreak, ScrapedPlayerEntry, ScrapedPlayerSeating, ScrapedPlayerResult, ScrapedTable, ScrapedTableSeatData, ScrapedVenueMatch, ScrapedVenueMatchDetails, VenueMatch, ReScrapeResult, GapRange, EntityScrapingStatus, GapSummary, TournamentIdBounds, S3VersionHistory, CachingStatsResponse, CacheActivityLog, S3ContentResponse, S3StorageHistoryResponse, S3StorageListResponse, TournamentLevel, Break, ClientMetricResponse, UserMetricsSummary, DatabaseMetric, DatabaseMetricsResponse, AllCountsResult, EntityVenueAssignmentSummary, VenueAssignmentSummary, VenueAssignmentResult, AffectedRecords, BatchVenueAssignmentResult, GamesNeedingVenueResponse, SocialFeedConnection, SocialPostConnection, SocialAccountConnection, SocialAccountMetrics, SocialScrapeResult, SyncPageInfoResult, RefreshResponse, SaveGameResult, SaveVenueAssignmentInfo, SaveSeriesAssignmentInfo, S3StorageConnection, ScraperJobConnection, ScrapeURLConnection, UnfinishedGamesConnection } = initSchema(schema);

export {
  Entity,
  Venue,
  VenueDetails,
  TournamentSeriesTitle,
  TournamentSeries,
  Game,
  TournamentStructure,
  TournamentLevelData,
  CashStructure,
  RakeStructure,
  GameFinancialSnapshot,
  GameCost,
  GameCostLineItem,
  GameCostItem,
  Player,
  PlayerSummary,
  PlayerEntry,
  PlayerResult,
  PlayerVenue,
  PlayerTransaction,
  PlayerCredits,
  PlayerPoints,
  KnownPlayerIdentity,
  ScraperJob,
  ScrapeURL,
  ScrapeAttempt,
  ScraperState,
  ScrapeStructure,
  DataSync,
  S3Storage,
  User,
  UserPreference,
  UserAuditLog,
  Staff,
  Asset,
  TicketTemplate,
  PlayerTicket,
  MarketingMessage,
  PlayerMarketingMessage,
  PlayerMarketingPreferences,
  SocialAccount,
  SocialPost,
  SocialScrapeAttempt,
  SocialScheduledPost,
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
  CostItemType,
  CostItemRateType,
  EntryType,
  ScraperJobTriggerSource,
  ScraperJobStatus,
  ScrapeURLStatus,
  ScrapeAttemptStatus,
  TimeRange,
  ScraperOperation,
  SocialPlatform,
  SocialAccountStatus,
  SocialPostType,
  SocialScrapeStatus,
  SocialPostStatus,
  ScheduledPostStatus,
  VenueMetricsResult,
  VenueMetricsUpdateResult,
  VenueMetricsPreview,
  VenueMetricsSnapshot,
  ConsolidationPreviewResult,
  ConsolidationDetails,
  ConsolidationSibling,
  ProjectedConsolidationTotals,
  DetectedMultiDayPattern,
  UserManagementResponse,
  ResetPasswordResponse,
  UsersConnection,
  ScraperControlResponse,
  ScraperStateData,
  ScraperResults,
  ScraperLogData,
  ScrapedGameStatus,
  ScraperJobURLResult,
  ScraperMetrics,
  ErrorMetric,
  HourlyMetric,
  EntityScraperMetrics,
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
  VenueMatch,
  ReScrapeResult,
  GapRange,
  EntityScrapingStatus,
  GapSummary,
  TournamentIdBounds,
  S3VersionHistory,
  CachingStatsResponse,
  CacheActivityLog,
  S3ContentResponse,
  S3StorageHistoryResponse,
  S3StorageListResponse,
  TournamentLevel,
  Break,
  ClientMetricResponse,
  UserMetricsSummary,
  DatabaseMetric,
  DatabaseMetricsResponse,
  AllCountsResult,
  EntityVenueAssignmentSummary,
  VenueAssignmentSummary,
  VenueAssignmentResult,
  AffectedRecords,
  BatchVenueAssignmentResult,
  GamesNeedingVenueResponse,
  SocialFeedConnection,
  SocialPostConnection,
  SocialAccountConnection,
  SocialAccountMetrics,
  SocialScrapeResult,
  SyncPageInfoResult,
  RefreshResponse,
  SaveGameResult,
  SaveVenueAssignmentInfo,
  SaveSeriesAssignmentInfo,
  S3StorageConnection,
  ScraperJobConnection,
  ScrapeURLConnection,
  UnfinishedGamesConnection
};