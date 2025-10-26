// @ts-check
import { initSchema } from '@aws-amplify/datastore';
import { schema } from './schema';

const SyncMethod = {
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
  "SCHEDULED": "SCHEDULED",
  "LIVE": "LIVE",
  "COMPLETED": "COMPLETED",
  "CANCELLED": "CANCELLED",
  "FINISHED": "FINISHED"
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
  "CREDIT": "CREDIT",
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

const PlayerTargetingClassification = {
  "NOT_PLAYER": "NotPlayer",
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

const { DataSync, ScrapeStructure, Asset, Venue, VenueDetails, Game, TournamentStructure, RakeStructure, CashStructure, Player, PlayerSummary, PlayerVenue, PlayerTransaction, PlayerResult, PlayerMarketingMessage, PlayerMarketingPreferences, TicketTemplate, PlayerTicket, User, Staff, UserPreference, SocialPost, SocialAccount, MarketingMessage, ScrapedGameSummary, ScrapedGameData, ScrapedTournamentLevel, ScrapedBreak, ScrapedPlayerEntries, ScrapedPlayerSeating, ScrapedPlayerResult, ScrapedTables, ScrapedTableSeatsData, TournamentLevelData } = initSchema(schema);

export {
  DataSync,
  ScrapeStructure,
  Asset,
  Venue,
  VenueDetails,
  Game,
  TournamentStructure,
  RakeStructure,
  CashStructure,
  Player,
  PlayerSummary,
  PlayerVenue,
  PlayerTransaction,
  PlayerResult,
  PlayerMarketingMessage,
  PlayerMarketingPreferences,
  TicketTemplate,
  PlayerTicket,
  User,
  Staff,
  UserPreference,
  SocialPost,
  SocialAccount,
  MarketingMessage,
  SyncMethod,
  AssetCondition,
  VenueStatus,
  GameType,
  GameStatus,
  TournamentType,
  PaymentSourceType,
  PlayerAccountStatus,
  PlayerAccountCategory,
  PlayerTargetingClassification,
  PlayerVenueTargetingClassification,
  TransactionType,
  MessageStatus,
  UserRole,
  StaffRole,
  TicketStatus,
  ScrapedGameSummary,
  ScrapedGameData,
  ScrapedTournamentLevel,
  ScrapedBreak,
  ScrapedPlayerEntries,
  ScrapedPlayerSeating,
  ScrapedPlayerResult,
  ScrapedTables,
  ScrapedTableSeatsData,
  TournamentLevelData
};