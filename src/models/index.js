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
  "CHURN_91_120D": "Churn_91_120d",
  "CHURN_121_180D": "Churn_121_180d",
  "CHURN_181_360D": "Churn_181_360d",
  "CHURN_361D": "Churn_361d"
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

const VenueAssignmentStatus = {
  "AUTO_ASSIGNED": "AUTO_ASSIGNED",
  "MANUALLY_ASSIGNED": "MANUALLY_ASSIGNED",
  "PENDING_ASSIGNMENT": "PENDING_ASSIGNMENT",
  "UNASSIGNED": "UNASSIGNED",
  "RETROACTIVE_ASSIGNED": "RETROACTIVE_ASSIGNED"
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
  "SAVED": "SAVED"
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

const { Entity, ScrapeStructure, DataSync, ScraperState, Venue, VenueDetails, TournamentSeriesTitle, TournamentSeries, Game, TournamentStructure, TournamentLevelData, CashStructure, RakeStructure, Player, PlayerSummary, PlayerEntry, PlayerResult, PlayerVenue, PlayerTransaction, PlayerCredits, PlayerPoints, KnownPlayerIdentity, TicketTemplate, PlayerTicket, MarketingMessage, PlayerMarketingMessage, PlayerMarketingPreferences, User, UserPreference, Staff, Asset, SocialAccount, SocialPost, ScraperJob, ScrapeURL, ScrapeAttempt, S3Storage, ScraperControlResponse, ScraperStateData, ScraperResults, ScraperLogData, ScrapedGameStatus, S3VersionHistory, TournamentLevel, Break, ClientMetricResponse, UserMetricsSummary, S3StorageConnection, CachingStatsResponse, CacheActivityLog, DatabaseMetric, DatabaseMetricsResponse, S3StorageHistoryResponse, S3ContentResponse, CachingStats, CacheActivity, S3StorageListResponse, RefreshResponse, ReScrapeResult, EntityVenueAssignmentSummary, EntityScraperMetrics, GamesNeedingVenueResponse, VenueAssignmentSummary, VenueAssignmentResult, AffectedRecords, BatchVenueAssignmentResult, ScraperJobURLResult, ScraperMetrics, ErrorMetric, HourlyMetric, ScraperJobConnection, ScrapeURLConnection, ScrapedGameSummary, ScrapedGameData, ScrapedTournamentLevel, ScrapedBreak, ScrapedPlayerEntry, ScrapedPlayerSeating, ScrapedPlayerResult, ScrapedTable, ScrapedTableSeatData, ScrapedVenueMatch, ScrapedVenueMatchDetails, AllCountsResult, VenueMatch, GapRange, EntityScrapingStatus, GapSummary, UnfinishedGamesConnection, TournamentIdBounds } = initSchema(schema);

export {
  Entity,
  ScrapeStructure,
  DataSync,
  ScraperState,
  Venue,
  VenueDetails,
  TournamentSeriesTitle,
  TournamentSeries,
  Game,
  TournamentStructure,
  TournamentLevelData,
  CashStructure,
  RakeStructure,
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
  User,
  UserPreference,
  Staff,
  Asset,
  SocialAccount,
  SocialPost,
  ScraperJob,
  ScrapeURL,
  ScrapeAttempt,
  S3Storage,
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
  VenueAssignmentStatus,
  ScraperJobTriggerSource,
  ScraperJobStatus,
  ScrapeURLStatus,
  ScrapeAttemptStatus,
  TimeRange,
  ScraperOperation,
  ScraperControlResponse,
  ScraperStateData,
  ScraperResults,
  ScraperLogData,
  ScrapedGameStatus,
  S3VersionHistory,
  TournamentLevel,
  Break,
  ClientMetricResponse,
  UserMetricsSummary,
  S3StorageConnection,
  CachingStatsResponse,
  CacheActivityLog,
  DatabaseMetric,
  DatabaseMetricsResponse,
  S3StorageHistoryResponse,
  S3ContentResponse,
  CachingStats,
  CacheActivity,
  S3StorageListResponse,
  RefreshResponse,
  ReScrapeResult,
  EntityVenueAssignmentSummary,
  EntityScraperMetrics,
  GamesNeedingVenueResponse,
  VenueAssignmentSummary,
  VenueAssignmentResult,
  AffectedRecords,
  BatchVenueAssignmentResult,
  ScraperJobURLResult,
  ScraperMetrics,
  ErrorMetric,
  HourlyMetric,
  ScraperJobConnection,
  ScrapeURLConnection,
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
  AllCountsResult,
  VenueMatch,
  GapRange,
  EntityScrapingStatus,
  GapSummary,
  UnfinishedGamesConnection,
  TournamentIdBounds
};