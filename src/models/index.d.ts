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
  CLOCK_STOPPED = "CLOCK_STOPPED",
  UNKNOWN = "UNKNOWN"
}

export enum GameVariant {
  NLHE = "NLHE",
  PLO = "PLO",
  PLO5 = "PLO5",
  PLO6 = "PLO6"
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
  REBUY = "REBUY",
  SATELLITE = "SATELLITE",
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

export enum VenueAssignmentStatus {
  AUTO_ASSIGNED = "AUTO_ASSIGNED",
  MANUALLY_ASSIGNED = "MANUALLY_ASSIGNED",
  PENDING_ASSIGNMENT = "PENDING_ASSIGNMENT",
  UNASSIGNED = "UNASSIGNED",
  RETROACTIVE_ASSIGNED = "RETROACTIVE_ASSIGNED"
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
  TIMEOUT = "TIMEOUT"
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
  SKIPPED_DONOTSCRAPE = "SKIPPED_DONOTSCRAPE",
  SKIPPED_VENUE = "SKIPPED_VENUE",
  BLANK = "BLANK",
  NO_CHANGES = "NO_CHANGES",
  UPDATED = "UPDATED",
  SAVED = "SAVED"
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

type EagerClientMetricResponse = {
  readonly success: boolean;
  readonly message?: string | null;
  readonly userId?: string | null;
}

type LazyClientMetricResponse = {
  readonly success: boolean;
  readonly message?: string | null;
  readonly userId?: string | null;
}

export declare type ClientMetricResponse = LazyLoading extends LazyLoadingDisabled ? EagerClientMetricResponse : LazyClientMetricResponse

export declare const ClientMetricResponse: (new (init: ModelInit<ClientMetricResponse>) => ClientMetricResponse)

type EagerUserMetricsSummary = {
  readonly userId: string;
  readonly userName?: string | null;
  readonly totalActions?: number | null;
  readonly totalPageViews?: number | null;
  readonly totalErrors?: number | null;
  readonly lastActive?: string | null;
  readonly mostUsedFeature?: string | null;
}

type LazyUserMetricsSummary = {
  readonly userId: string;
  readonly userName?: string | null;
  readonly totalActions?: number | null;
  readonly totalPageViews?: number | null;
  readonly totalErrors?: number | null;
  readonly lastActive?: string | null;
  readonly mostUsedFeature?: string | null;
}

export declare type UserMetricsSummary = LazyLoading extends LazyLoadingDisabled ? EagerUserMetricsSummary : LazyUserMetricsSummary

export declare const UserMetricsSummary: (new (init: ModelInit<UserMetricsSummary>) => UserMetricsSummary)

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
  readonly items?: ScrapeURL[] | null;
  readonly nextToken?: string | null;
}

type LazyScrapeURLConnection = {
  readonly items: AsyncCollection<ScrapeURL>;
  readonly nextToken?: string | null;
}

export declare type ScrapeURLConnection = LazyLoading extends LazyLoadingDisabled ? EagerScrapeURLConnection : LazyScrapeURLConnection

export declare const ScrapeURLConnection: (new (init: ModelInit<ScrapeURLConnection>) => ScrapeURLConnection)

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
  readonly gameEndDateTime?: string | null;
  readonly gameStatus?: GameStatus | keyof typeof GameStatus | null;
  readonly registrationStatus?: string | null;
  readonly gameType?: GameType | keyof typeof GameType | null;
  readonly gameVariant?: GameVariant | keyof typeof GameVariant | null;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly prizepool?: number | null;
  readonly revenueByBuyIns?: number | null;
  readonly profitLoss?: number | null;
  readonly buyIn?: number | null;
  readonly rake?: number | null;
  readonly totalRake?: number | null;
  readonly startingStack?: number | null;
  readonly hasGuarantee?: boolean | null;
  readonly guaranteeAmount?: number | null;
  readonly guaranteeOverlay?: number | null;
  readonly guaranteeSurplus?: number | null;
  readonly totalEntries?: number | null;
  readonly totalRebuys?: number | null;
  readonly totalAddons?: number | null;
  readonly totalDuration?: string | null;
  readonly playersRemaining?: number | null;
  readonly totalChipsInPlay?: number | null;
  readonly averagePlayerStack?: number | null;
  readonly seriesName?: string | null;
  readonly isRegular?: boolean | null;
  readonly isSeries?: boolean | null;
  readonly isSatellite?: boolean | null;
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
  readonly tournamentId: number;
  readonly entityId?: string | null;
}

type LazyScrapedGameData = {
  readonly name: string;
  readonly gameStartDateTime?: string | null;
  readonly gameEndDateTime?: string | null;
  readonly gameStatus?: GameStatus | keyof typeof GameStatus | null;
  readonly registrationStatus?: string | null;
  readonly gameType?: GameType | keyof typeof GameType | null;
  readonly gameVariant?: GameVariant | keyof typeof GameVariant | null;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly prizepool?: number | null;
  readonly revenueByBuyIns?: number | null;
  readonly profitLoss?: number | null;
  readonly buyIn?: number | null;
  readonly rake?: number | null;
  readonly totalRake?: number | null;
  readonly startingStack?: number | null;
  readonly hasGuarantee?: boolean | null;
  readonly guaranteeAmount?: number | null;
  readonly guaranteeOverlay?: number | null;
  readonly guaranteeSurplus?: number | null;
  readonly totalEntries?: number | null;
  readonly totalRebuys?: number | null;
  readonly totalAddons?: number | null;
  readonly totalDuration?: string | null;
  readonly playersRemaining?: number | null;
  readonly totalChipsInPlay?: number | null;
  readonly averagePlayerStack?: number | null;
  readonly seriesName?: string | null;
  readonly isRegular?: boolean | null;
  readonly isSeries?: boolean | null;
  readonly isSatellite?: boolean | null;
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
  readonly tournamentId: number;
  readonly entityId?: string | null;
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
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly scraperStates?: (ScraperState | null)[] | null;
  readonly scraperJobs?: (ScraperJob | null)[] | null;
  readonly scrapeURLs?: (ScrapeURL | null)[] | null;
  readonly venues?: (Venue | null)[] | null;
  readonly games?: (Game | null)[] | null;
  readonly assets?: (Asset | null)[] | null;
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
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly scraperStates: AsyncCollection<ScraperState>;
  readonly scraperJobs: AsyncCollection<ScraperJob>;
  readonly scrapeURLs: AsyncCollection<ScrapeURL>;
  readonly venues: AsyncCollection<Venue>;
  readonly games: AsyncCollection<Game>;
  readonly assets: AsyncCollection<Asset>;
}

export declare type Entity = LazyLoading extends LazyLoadingDisabled ? EagerEntity : LazyEntity

export declare const Entity: (new (init: ModelInit<Entity>) => Entity) & {
  copyOf(source: Entity, mutator: (draft: MutableModel<Entity>) => MutableModel<Entity> | void): Entity;
}

type EagerScrapeStructure = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<ScrapeStructure, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly fields: (string | null)[];
  readonly structureLabel: string;
  readonly occurrenceCount: number;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly exampleUrl?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyScrapeStructure = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<ScrapeStructure, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly fields: (string | null)[];
  readonly structureLabel: string;
  readonly occurrenceCount: number;
  readonly firstSeenAt: string;
  readonly lastSeenAt: string;
  readonly exampleUrl?: string | null;
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
  readonly isSpecial?: boolean | null;
  readonly details?: VenueDetails | null;
  readonly assets?: (Asset | null)[] | null;
  readonly games?: (Game | null)[] | null;
  readonly series?: (TournamentSeries | null)[] | null;
  readonly playerMemberships?: (PlayerVenue | null)[] | null;
  readonly registeredPlayers?: (Player | null)[] | null;
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
  readonly isSpecial?: boolean | null;
  readonly details: AsyncItem<VenueDetails | undefined>;
  readonly assets: AsyncCollection<Asset>;
  readonly games: AsyncCollection<Game>;
  readonly series: AsyncCollection<TournamentSeries>;
  readonly playerMemberships: AsyncCollection<PlayerVenue>;
  readonly registeredPlayers: AsyncCollection<Player>;
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
  readonly averagePlayersPerGame?: number | null;
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
  readonly averagePlayersPerGame?: number | null;
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

type EagerTournamentSeriesTitle = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<TournamentSeriesTitle, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly title: string;
  readonly aliases?: (string | null)[] | null;
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
  readonly status: SeriesStatus | keyof typeof SeriesStatus;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly events?: (string | null)[] | null;
  readonly numberOfEvents?: number | null;
  readonly guaranteedPrizepool?: number | null;
  readonly estimatedPrizepool?: number | null;
  readonly actualPrizepool?: number | null;
  readonly tournamentSeriesTitleId: string;
  readonly title?: TournamentSeriesTitle | null;
  readonly venueId?: string | null;
  readonly venue?: Venue | null;
  readonly games?: (Game | null)[] | null;
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
  readonly status: SeriesStatus | keyof typeof SeriesStatus;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly events?: (string | null)[] | null;
  readonly numberOfEvents?: number | null;
  readonly guaranteedPrizepool?: number | null;
  readonly estimatedPrizepool?: number | null;
  readonly actualPrizepool?: number | null;
  readonly tournamentSeriesTitleId: string;
  readonly title: AsyncItem<TournamentSeriesTitle | undefined>;
  readonly venueId?: string | null;
  readonly venue: AsyncItem<Venue | undefined>;
  readonly games: AsyncCollection<Game>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type TournamentSeries = LazyLoading extends LazyLoadingDisabled ? EagerTournamentSeries : LazyTournamentSeries

export declare const TournamentSeries: (new (init: ModelInit<TournamentSeries>) => TournamentSeries) & {
  copyOf(source: TournamentSeries, mutator: (draft: MutableModel<TournamentSeries>) => MutableModel<TournamentSeries> | void): TournamentSeries;
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
  readonly gameEndDateTime?: string | null;
  readonly registrationStatus?: string | null;
  readonly totalDuration?: string | null;
  readonly gameFrequency?: GameFrequency | keyof typeof GameFrequency | null;
  readonly buyIn?: number | null;
  readonly rake?: number | null;
  readonly startingStack?: number | null;
  readonly hasGuarantee?: boolean | null;
  readonly guaranteeAmount?: number | null;
  readonly prizepool?: number | null;
  readonly totalEntries?: number | null;
  readonly totalRebuys?: number | null;
  readonly totalAddons?: number | null;
  readonly revenueByBuyIns?: number | null;
  readonly totalRake?: number | null;
  readonly profitLoss?: number | null;
  readonly guaranteeOverlay?: number | null;
  readonly guaranteeSurplus?: number | null;
  readonly playersRemaining?: number | null;
  readonly totalChipsInPlay?: number | null;
  readonly averagePlayerStack?: number | null;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly isRegular?: boolean | null;
  readonly isSeries?: boolean | null;
  readonly isSatellite?: boolean | null;
  readonly seriesName?: string | null;
  readonly gameTags?: (string | null)[] | null;
  readonly sourceUrl?: string | null;
  readonly tournamentId?: number | null;
  readonly dataSource?: DataSource | keyof typeof DataSource | null;
  readonly originalScrapedData?: string | null;
  readonly venueAssignmentStatus?: VenueAssignmentStatus | keyof typeof VenueAssignmentStatus | null;
  readonly requiresVenueAssignment?: boolean | null;
  readonly suggestedVenueName?: string | null;
  readonly venueAssignmentConfidence?: number | null;
  readonly venueId?: string | null;
  readonly venue?: Venue | null;
  readonly tournamentSeriesId?: string | null;
  readonly tournamentSeries?: TournamentSeries | null;
  readonly structure?: TournamentStructure | null;
  readonly playerEntries?: (PlayerEntry | null)[] | null;
  readonly playerResults?: (PlayerResult | null)[] | null;
  readonly entityId?: string | null;
  readonly entity?: Entity | null;
  readonly createdAt: string;
  readonly updatedAt: string;
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
  readonly gameEndDateTime?: string | null;
  readonly registrationStatus?: string | null;
  readonly totalDuration?: string | null;
  readonly gameFrequency?: GameFrequency | keyof typeof GameFrequency | null;
  readonly buyIn?: number | null;
  readonly rake?: number | null;
  readonly startingStack?: number | null;
  readonly hasGuarantee?: boolean | null;
  readonly guaranteeAmount?: number | null;
  readonly prizepool?: number | null;
  readonly totalEntries?: number | null;
  readonly totalRebuys?: number | null;
  readonly totalAddons?: number | null;
  readonly revenueByBuyIns?: number | null;
  readonly totalRake?: number | null;
  readonly profitLoss?: number | null;
  readonly guaranteeOverlay?: number | null;
  readonly guaranteeSurplus?: number | null;
  readonly playersRemaining?: number | null;
  readonly totalChipsInPlay?: number | null;
  readonly averagePlayerStack?: number | null;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly isRegular?: boolean | null;
  readonly isSeries?: boolean | null;
  readonly isSatellite?: boolean | null;
  readonly seriesName?: string | null;
  readonly gameTags?: (string | null)[] | null;
  readonly sourceUrl?: string | null;
  readonly tournamentId?: number | null;
  readonly dataSource?: DataSource | keyof typeof DataSource | null;
  readonly originalScrapedData?: string | null;
  readonly venueAssignmentStatus?: VenueAssignmentStatus | keyof typeof VenueAssignmentStatus | null;
  readonly requiresVenueAssignment?: boolean | null;
  readonly suggestedVenueName?: string | null;
  readonly venueAssignmentConfidence?: number | null;
  readonly venueId?: string | null;
  readonly venue: AsyncItem<Venue | undefined>;
  readonly tournamentSeriesId?: string | null;
  readonly tournamentSeries: AsyncItem<TournamentSeries | undefined>;
  readonly structure: AsyncItem<TournamentStructure | undefined>;
  readonly playerEntries: AsyncCollection<PlayerEntry>;
  readonly playerResults: AsyncCollection<PlayerResult>;
  readonly entityId?: string | null;
  readonly entity: AsyncItem<Entity | undefined>;
  readonly createdAt: string;
  readonly updatedAt: string;
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
  readonly status: PlayerEntryStatus | keyof typeof PlayerEntryStatus;
  readonly registrationTime: string;
  readonly eliminationTime?: string | null;
  readonly gameStartDateTime: string;
  readonly lastKnownStackSize?: number | null;
  readonly tableNumber?: number | null;
  readonly seatNumber?: number | null;
  readonly numberOfReEntries?: number | null;
  readonly isMultiDayTournament?: boolean | null;
  readonly player?: Player | null;
  readonly game?: Game | null;
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
  readonly status: PlayerEntryStatus | keyof typeof PlayerEntryStatus;
  readonly registrationTime: string;
  readonly eliminationTime?: string | null;
  readonly gameStartDateTime: string;
  readonly lastKnownStackSize?: number | null;
  readonly tableNumber?: number | null;
  readonly seatNumber?: number | null;
  readonly numberOfReEntries?: number | null;
  readonly isMultiDayTournament?: boolean | null;
  readonly player: AsyncItem<Player | undefined>;
  readonly game: AsyncItem<Game | undefined>;
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
  readonly playerId: string;
  readonly player?: Player | null;
  readonly gameId: string;
  readonly game?: Game | null;
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
  readonly playerId: string;
  readonly player: AsyncItem<Player | undefined>;
  readonly gameId: string;
  readonly game: AsyncItem<Game | undefined>;
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
  readonly totalGamesPlayed?: number | null;
  readonly averageBuyIn?: number | null;
  readonly firstPlayedDate?: string | null;
  readonly lastPlayedDate?: string | null;
  readonly targetingClassification: PlayerVenueTargetingClassification | keyof typeof PlayerVenueTargetingClassification;
  readonly playerId: string;
  readonly player?: Player | null;
  readonly venueId: string;
  readonly venue?: Venue | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyPlayerVenue = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerVenue, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly totalGamesPlayed?: number | null;
  readonly averageBuyIn?: number | null;
  readonly firstPlayedDate?: string | null;
  readonly lastPlayedDate?: string | null;
  readonly targetingClassification: PlayerVenueTargetingClassification | keyof typeof PlayerVenueTargetingClassification;
  readonly playerId: string;
  readonly player: AsyncItem<Player | undefined>;
  readonly venueId: string;
  readonly venue: AsyncItem<Venue | undefined>;
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
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
  readonly value: number;
  readonly validityDays: number;
  readonly originGameId?: string | null;
  readonly targetGameId?: string | null;
  readonly playerTickets?: (PlayerTicket | null)[] | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyTicketTemplate = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<TicketTemplate, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
  readonly value: number;
  readonly validityDays: number;
  readonly originGameId?: string | null;
  readonly targetGameId?: string | null;
  readonly playerTickets: AsyncCollection<PlayerTicket>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type TicketTemplate = LazyLoading extends LazyLoadingDisabled ? EagerTicketTemplate : LazyTicketTemplate

export declare const TicketTemplate: (new (init: ModelInit<TicketTemplate>) => TicketTemplate) & {
  copyOf(source: TicketTemplate, mutator: (draft: MutableModel<TicketTemplate>) => MutableModel<TicketTemplate> | void): TicketTemplate;
}

type EagerPlayerTicket = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerTicket, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly assignedAt: string;
  readonly expiryDate: string;
  readonly status: TicketStatus | keyof typeof TicketStatus;
  readonly usedInGameId?: string | null;
  readonly playerId: string;
  readonly player?: Player | null;
  readonly ticketTemplateId: string;
  readonly ticketTemplate?: TicketTemplate | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyPlayerTicket = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerTicket, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly assignedAt: string;
  readonly expiryDate: string;
  readonly status: TicketStatus | keyof typeof TicketStatus;
  readonly usedInGameId?: string | null;
  readonly playerId: string;
  readonly player: AsyncItem<Player | undefined>;
  readonly ticketTemplateId: string;
  readonly ticketTemplate: AsyncItem<TicketTemplate | undefined>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
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

type EagerUser = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<User, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly role: UserRole | keyof typeof UserRole;
  readonly preferences?: (UserPreference | null)[] | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyUser = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<User, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly username: string;
  readonly email: string;
  readonly role: UserRole | keyof typeof UserRole;
  readonly preferences: AsyncCollection<UserPreference>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
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

type EagerSocialAccount = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<SocialAccount, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly platform: string;
  readonly accountName: string;
  readonly apiKey?: string | null;
  readonly apiSecret?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazySocialAccount = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<SocialAccount, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly platform: string;
  readonly accountName: string;
  readonly apiKey?: string | null;
  readonly apiSecret?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type SocialAccount = LazyLoading extends LazyLoadingDisabled ? EagerSocialAccount : LazySocialAccount

export declare const SocialAccount: (new (init: ModelInit<SocialAccount>) => SocialAccount) & {
  copyOf(source: SocialAccount, mutator: (draft: MutableModel<SocialAccount>) => MutableModel<SocialAccount> | void): SocialAccount;
}

type EagerSocialPost = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<SocialPost, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly content: string;
  readonly imageUrl?: string | null;
  readonly postedAt: string;
  readonly socialAccountId: string;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazySocialPost = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<SocialPost, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly content: string;
  readonly imageUrl?: string | null;
  readonly postedAt: string;
  readonly socialAccountId: string;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type SocialPost = LazyLoading extends LazyLoadingDisabled ? EagerSocialPost : LazySocialPost

export declare const SocialPost: (new (init: ModelInit<SocialPost>) => SocialPost) & {
  copyOf(source: SocialPost, mutator: (draft: MutableModel<SocialPost>) => MutableModel<SocialPost> | void): SocialPost;
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
  readonly sourceSystem: string;
  readonly status: ScrapeURLStatus | keyof typeof ScrapeURLStatus;
  readonly placedIntoDatabase: boolean;
  readonly firstScrapedAt: string;
  readonly lastScrapedAt: string;
  readonly lastSuccessfulScrapeAt?: string | null;
  readonly timesScraped: number;
  readonly timesSuccessful: number;
  readonly timesFailed: number;
  readonly consecutiveFailures: number;
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
  readonly sourceSystem: string;
  readonly status: ScrapeURLStatus | keyof typeof ScrapeURLStatus;
  readonly placedIntoDatabase: boolean;
  readonly firstScrapedAt: string;
  readonly lastScrapedAt: string;
  readonly lastSuccessfulScrapeAt?: string | null;
  readonly timesScraped: number;
  readonly timesSuccessful: number;
  readonly timesFailed: number;
  readonly consecutiveFailures: number;
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
  readonly createdAt: string;
  readonly updatedAt: string;
}

export declare type ScrapeAttempt = LazyLoading extends LazyLoadingDisabled ? EagerScrapeAttempt : LazyScrapeAttempt

export declare const ScrapeAttempt: (new (init: ModelInit<ScrapeAttempt>) => ScrapeAttempt) & {
  copyOf(source: ScrapeAttempt, mutator: (draft: MutableModel<ScrapeAttempt>) => MutableModel<ScrapeAttempt> | void): ScrapeAttempt;
}