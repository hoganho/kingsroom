import { ModelInit, MutableModel, __modelMeta__, ManagedIdentifier } from "@aws-amplify/datastore";
// @ts-ignore
import { LazyLoading, LazyLoadingDisabled, AsyncItem, AsyncCollection } from "@aws-amplify/datastore";

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
  FINISHED = "FINISHED"
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
  CLOSED = "CLOSED"
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
  CREDIT = "CREDIT",
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
  readonly totalEntries?: number | null;
  readonly totalRebuys?: number | null;
  readonly totalAddons?: number | null;
  readonly playersRemaining?: number | null;
  readonly totalChipsInPlay?: number | null;
  readonly averagePlayerStack?: number | null;
  readonly totalDuration?: string | null;
  readonly gameTags?: (string | null)[] | null;
  readonly buyIn?: number | null;
  readonly rake?: number | null;
  readonly totalRake?: number | null;
  readonly startingStack?: number | null;
  readonly hasGuarantee?: boolean | null;
  readonly guaranteeAmount?: number | null;
  readonly guaranteeOverlay?: number | null;
  readonly guaranteeSurplus?: number | null;
  readonly seriesName?: string | null;
  readonly isRegular?: boolean | null;
  readonly isSeries?: boolean | null;
  readonly isRecurring?: boolean | null;
  readonly gameFrequency?: GameFrequency | keyof typeof GameFrequency | null;
  readonly isSatellite?: boolean | null;
  readonly levels?: ScrapedTournamentLevel[] | null;
  readonly breaks?: ScrapedBreak[] | null;
  readonly entries?: ScrapedPlayerEntries[] | null;
  readonly seating?: ScrapedPlayerSeating[] | null;
  readonly results?: ScrapedPlayerResult[] | null;
  readonly tables?: ScrapedTables[] | null;
  readonly rawHtml?: string | null;
  readonly isNewStructure?: boolean | null;
  readonly structureLabel?: string | null;
  readonly foundKeys?: (string | null)[] | null;
  readonly venueMatch?: ScrapedVenueMatch | null;
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
  readonly totalEntries?: number | null;
  readonly totalRebuys?: number | null;
  readonly totalAddons?: number | null;
  readonly playersRemaining?: number | null;
  readonly totalChipsInPlay?: number | null;
  readonly averagePlayerStack?: number | null;
  readonly totalDuration?: string | null;
  readonly gameTags?: (string | null)[] | null;
  readonly buyIn?: number | null;
  readonly rake?: number | null;
  readonly totalRake?: number | null;
  readonly startingStack?: number | null;
  readonly hasGuarantee?: boolean | null;
  readonly guaranteeAmount?: number | null;
  readonly guaranteeOverlay?: number | null;
  readonly guaranteeSurplus?: number | null;
  readonly seriesName?: string | null;
  readonly isRegular?: boolean | null;
  readonly isSeries?: boolean | null;
  readonly isRecurring?: boolean | null;
  readonly gameFrequency?: GameFrequency | keyof typeof GameFrequency | null;
  readonly isSatellite?: boolean | null;
  readonly levels?: ScrapedTournamentLevel[] | null;
  readonly breaks?: ScrapedBreak[] | null;
  readonly entries?: ScrapedPlayerEntries[] | null;
  readonly seating?: ScrapedPlayerSeating[] | null;
  readonly results?: ScrapedPlayerResult[] | null;
  readonly tables?: ScrapedTables[] | null;
  readonly rawHtml?: string | null;
  readonly isNewStructure?: boolean | null;
  readonly structureLabel?: string | null;
  readonly foundKeys?: (string | null)[] | null;
  readonly venueMatch?: ScrapedVenueMatch | null;
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
  readonly levelNumberAfterBreak: number;
  readonly durationMinutes?: number | null;
}

type LazyScrapedBreak = {
  readonly levelNumberBeforeBreak: number;
  readonly levelNumberAfterBreak: number;
  readonly durationMinutes?: number | null;
}

export declare type ScrapedBreak = LazyLoading extends LazyLoadingDisabled ? EagerScrapedBreak : LazyScrapedBreak

export declare const ScrapedBreak: (new (init: ModelInit<ScrapedBreak>) => ScrapedBreak)

type EagerScrapedPlayerEntries = {
  readonly name: string;
}

type LazyScrapedPlayerEntries = {
  readonly name: string;
}

export declare type ScrapedPlayerEntries = LazyLoading extends LazyLoadingDisabled ? EagerScrapedPlayerEntries : LazyScrapedPlayerEntries

export declare const ScrapedPlayerEntries: (new (init: ModelInit<ScrapedPlayerEntries>) => ScrapedPlayerEntries)

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
}

type LazyScrapedPlayerResult = {
  readonly rank: number;
  readonly name: string;
  readonly winnings?: number | null;
  readonly points?: number | null;
}

export declare type ScrapedPlayerResult = LazyLoading extends LazyLoadingDisabled ? EagerScrapedPlayerResult : LazyScrapedPlayerResult

export declare const ScrapedPlayerResult: (new (init: ModelInit<ScrapedPlayerResult>) => ScrapedPlayerResult)

type EagerScrapedTables = {
  readonly tableName: string;
  readonly seats?: ScrapedTableSeatsData[] | null;
}

type LazyScrapedTables = {
  readonly tableName: string;
  readonly seats?: ScrapedTableSeatsData[] | null;
}

export declare type ScrapedTables = LazyLoading extends LazyLoadingDisabled ? EagerScrapedTables : LazyScrapedTables

export declare const ScrapedTables: (new (init: ModelInit<ScrapedTables>) => ScrapedTables)

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

type EagerScrapedTableSeatsData = {
  readonly seat: number;
  readonly isOccupied: boolean;
  readonly playerName?: string | null;
  readonly playerStack?: number | null;
}

type LazyScrapedTableSeatsData = {
  readonly seat: number;
  readonly isOccupied: boolean;
  readonly playerName?: string | null;
  readonly playerStack?: number | null;
}

export declare type ScrapedTableSeatsData = LazyLoading extends LazyLoadingDisabled ? EagerScrapedTableSeatsData : LazyScrapedTableSeatsData

export declare const ScrapedTableSeatsData: (new (init: ModelInit<ScrapedTableSeatsData>) => ScrapedTableSeatsData)

type EagerTournamentLevelData = {
  readonly levelNumber: number;
  readonly durationMinutes: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly ante?: number | null;
  readonly breakMinutes?: number | null;
}

type LazyTournamentLevelData = {
  readonly levelNumber: number;
  readonly durationMinutes: number;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly ante?: number | null;
  readonly breakMinutes?: number | null;
}

export declare type TournamentLevelData = LazyLoading extends LazyLoadingDisabled ? EagerTournamentLevelData : LazyTournamentLevelData

export declare const TournamentLevelData: (new (init: ModelInit<TournamentLevelData>) => TournamentLevelData)

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

type EagerScrapeStructure = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<ScrapeStructure, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly fields: (string | null)[];
  readonly structureLabel?: string | null;
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
  readonly structureLabel?: string | null;
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
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type Asset = LazyLoading extends LazyLoadingDisabled ? EagerAsset : LazyAsset

export declare const Asset: (new (init: ModelInit<Asset>) => Asset) & {
  copyOf(source: Asset, mutator: (draft: MutableModel<Asset>) => MutableModel<Asset> | void): Asset;
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
  readonly details?: VenueDetails | null;
  readonly assets?: (Asset | null)[] | null;
  readonly games?: (Game | null)[] | null;
  readonly series?: (TournamentSeries | null)[] | null;
  readonly playerMemberships?: (PlayerVenue | null)[] | null;
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
  readonly details: AsyncItem<VenueDetails | undefined>;
  readonly assets: AsyncCollection<Asset>;
  readonly games: AsyncCollection<Game>;
  readonly series: AsyncCollection<TournamentSeries>;
  readonly playerMemberships: AsyncCollection<PlayerVenue>;
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
  readonly venueId: string;
  readonly startDate: string;
  readonly status: VenueStatus | keyof typeof VenueStatus;
  readonly lastCustomerSuccessVisit?: string | null;
  readonly totalGamesHeld?: number | null;
  readonly averagePlayersPerGame?: number | null;
  readonly gameNights?: (string | null)[] | null;
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
  readonly venueId: string;
  readonly startDate: string;
  readonly status: VenueStatus | keyof typeof VenueStatus;
  readonly lastCustomerSuccessVisit?: string | null;
  readonly totalGamesHeld?: number | null;
  readonly averagePlayersPerGame?: number | null;
  readonly gameNights?: (string | null)[] | null;
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
  readonly year: number;
  readonly name: string;
  readonly aliases?: (string | null)[] | null;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly events?: (string | null)[] | null;
  readonly numberOfEvents?: number | null;
  readonly guaranteedPrizepool?: number | null;
  readonly estimatedPrizepool?: number | null;
  readonly actualPrizepool?: number | null;
  readonly status: SeriesStatus | keyof typeof SeriesStatus;
  readonly tournamentSeriesTitleId: string;
  readonly title?: TournamentSeriesTitle | null;
  readonly venueId: string;
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
  readonly year: number;
  readonly name: string;
  readonly aliases?: (string | null)[] | null;
  readonly startDate?: string | null;
  readonly endDate?: string | null;
  readonly events?: (string | null)[] | null;
  readonly numberOfEvents?: number | null;
  readonly guaranteedPrizepool?: number | null;
  readonly estimatedPrizepool?: number | null;
  readonly actualPrizepool?: number | null;
  readonly status: SeriesStatus | keyof typeof SeriesStatus;
  readonly tournamentSeriesTitleId: string;
  readonly title: AsyncItem<TournamentSeriesTitle | undefined>;
  readonly venueId: string;
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
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly name: string;
  readonly gameType: GameType | keyof typeof GameType;
  readonly gameVariant: GameVariant | keyof typeof GameVariant;
  readonly gameStatus: GameStatus | keyof typeof GameStatus;
  readonly gameStartDateTime: string;
  readonly gameEndDateTime?: string | null;
  readonly venueId: string;
  readonly sourceUrl?: string | null;
  readonly doNotScrape: boolean;
  readonly sourceDataIssue: boolean;
  readonly gameDataVerified: boolean;
  readonly seriesName?: string | null;
  readonly isRegular?: boolean | null;
  readonly isSeries?: boolean | null;
  readonly isRecurring?: boolean | null;
  readonly gameFrequency?: GameFrequency | keyof typeof GameFrequency | null;
  readonly isSatellite?: boolean | null;
  readonly registrationStatus?: string | null;
  readonly prizepool?: number | null;
  readonly revenueByBuyIns?: number | null;
  readonly totalEntries?: number | null;
  readonly totalRebuys?: number | null;
  readonly totalAddons?: number | null;
  readonly totalDuration?: string | null;
  readonly gameTags?: (string | null)[] | null;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly buyIn?: number | null;
  readonly rake?: number | null;
  readonly totalRake?: number | null;
  readonly profitLoss?: number | null;
  readonly startingStack?: number | null;
  readonly hasGuarantee?: boolean | null;
  readonly guaranteeAmount?: number | null;
  readonly guaranteeOverlay?: number | null;
  readonly guaranteeSurplus?: number | null;
  readonly playersRemaining?: number | null;
  readonly totalChipsInPlay?: number | null;
  readonly averagePlayerStack?: number | null;
  readonly tournamentStructureId?: string | null;
  readonly cashStructureId?: string | null;
  readonly venue?: Venue | null;
  readonly tournamentStructure?: TournamentStructure | null;
  readonly cashStructure?: CashStructure | null;
  readonly playerResults?: (PlayerResult | null)[] | null;
  readonly tournamentSeriesId?: string | null;
  readonly tournamentSeries?: TournamentSeries | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyGame = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<Game, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly name: string;
  readonly gameType: GameType | keyof typeof GameType;
  readonly gameVariant: GameVariant | keyof typeof GameVariant;
  readonly gameStatus: GameStatus | keyof typeof GameStatus;
  readonly gameStartDateTime: string;
  readonly gameEndDateTime?: string | null;
  readonly venueId: string;
  readonly sourceUrl?: string | null;
  readonly doNotScrape: boolean;
  readonly sourceDataIssue: boolean;
  readonly gameDataVerified: boolean;
  readonly seriesName?: string | null;
  readonly isRegular?: boolean | null;
  readonly isSeries?: boolean | null;
  readonly isRecurring?: boolean | null;
  readonly gameFrequency?: GameFrequency | keyof typeof GameFrequency | null;
  readonly isSatellite?: boolean | null;
  readonly registrationStatus?: string | null;
  readonly prizepool?: number | null;
  readonly revenueByBuyIns?: number | null;
  readonly totalEntries?: number | null;
  readonly totalRebuys?: number | null;
  readonly totalAddons?: number | null;
  readonly totalDuration?: string | null;
  readonly gameTags?: (string | null)[] | null;
  readonly tournamentType?: TournamentType | keyof typeof TournamentType | null;
  readonly buyIn?: number | null;
  readonly rake?: number | null;
  readonly totalRake?: number | null;
  readonly profitLoss?: number | null;
  readonly startingStack?: number | null;
  readonly hasGuarantee?: boolean | null;
  readonly guaranteeAmount?: number | null;
  readonly guaranteeOverlay?: number | null;
  readonly guaranteeSurplus?: number | null;
  readonly playersRemaining?: number | null;
  readonly totalChipsInPlay?: number | null;
  readonly averagePlayerStack?: number | null;
  readonly tournamentStructureId?: string | null;
  readonly cashStructureId?: string | null;
  readonly venue: AsyncItem<Venue | undefined>;
  readonly tournamentStructure: AsyncItem<TournamentStructure | undefined>;
  readonly cashStructure: AsyncItem<CashStructure | undefined>;
  readonly playerResults: AsyncCollection<PlayerResult>;
  readonly tournamentSeriesId?: string | null;
  readonly tournamentSeries: AsyncItem<TournamentSeries | undefined>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
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
  readonly name: string;
  readonly description?: string | null;
  readonly levels?: (TournamentLevelData | null)[] | null;
  readonly games?: (Game | null)[] | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyTournamentStructure = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<TournamentStructure, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly name: string;
  readonly description?: string | null;
  readonly levels?: (TournamentLevelData | null)[] | null;
  readonly games: AsyncCollection<Game>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type TournamentStructure = LazyLoading extends LazyLoadingDisabled ? EagerTournamentStructure : LazyTournamentStructure

export declare const TournamentStructure: (new (init: ModelInit<TournamentStructure>) => TournamentStructure) & {
  copyOf(source: TournamentStructure, mutator: (draft: MutableModel<TournamentStructure>) => MutableModel<TournamentStructure> | void): TournamentStructure;
}

type EagerRakeStructure = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<RakeStructure, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly name: string;
  readonly rakePercentage: number;
  readonly maxRake: number;
  readonly cashStructures?: (CashStructure | null)[] | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyRakeStructure = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<RakeStructure, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly name: string;
  readonly rakePercentage: number;
  readonly maxRake: number;
  readonly cashStructures: AsyncCollection<CashStructure>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type RakeStructure = LazyLoading extends LazyLoadingDisabled ? EagerRakeStructure : LazyRakeStructure

export declare const RakeStructure: (new (init: ModelInit<RakeStructure>) => RakeStructure) & {
  copyOf(source: RakeStructure, mutator: (draft: MutableModel<RakeStructure>) => MutableModel<RakeStructure> | void): RakeStructure;
}

type EagerCashStructure = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<CashStructure, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly name: string;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly minBuyIn: number;
  readonly maxBuyIn: number;
  readonly rakeStructureId: string;
  readonly rakeStructure?: RakeStructure | null;
  readonly games?: (Game | null)[] | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyCashStructure = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<CashStructure, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly name: string;
  readonly smallBlind: number;
  readonly bigBlind: number;
  readonly minBuyIn: number;
  readonly maxBuyIn: number;
  readonly rakeStructureId: string;
  readonly rakeStructure: AsyncItem<RakeStructure | undefined>;
  readonly games: AsyncCollection<Game>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type CashStructure = LazyLoading extends LazyLoadingDisabled ? EagerCashStructure : LazyCashStructure

export declare const CashStructure: (new (init: ModelInit<CashStructure>) => CashStructure) & {
  copyOf(source: CashStructure, mutator: (draft: MutableModel<CashStructure>) => MutableModel<CashStructure> | void): CashStructure;
}

type EagerPlayer = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<Player, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly firstName: string;
  readonly givenName?: string | null;
  readonly lastName?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly registrationVenueId: string;
  readonly creationDate: string;
  readonly lastPlayedDate?: string | null;
  readonly status: PlayerAccountStatus | keyof typeof PlayerAccountStatus;
  readonly category: PlayerAccountCategory | keyof typeof PlayerAccountCategory;
  readonly targetingClassification: PlayerTargetingClassification | keyof typeof PlayerTargetingClassification;
  readonly tier?: string | null;
  readonly transactions?: (PlayerTransaction | null)[] | null;
  readonly results?: (PlayerResult | null)[] | null;
  readonly tickets?: (PlayerTicket | null)[] | null;
  readonly marketingPreferences?: PlayerMarketingPreferences | null;
  readonly venueMemberships?: (PlayerVenue | null)[] | null;
  readonly summary?: PlayerSummary | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
  readonly playerMarketingPreferencesId?: string | null;
  readonly playerSummaryId?: string | null;
}

type LazyPlayer = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<Player, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly firstName: string;
  readonly givenName?: string | null;
  readonly lastName?: string | null;
  readonly email?: string | null;
  readonly phone?: string | null;
  readonly registrationVenueId: string;
  readonly creationDate: string;
  readonly lastPlayedDate?: string | null;
  readonly status: PlayerAccountStatus | keyof typeof PlayerAccountStatus;
  readonly category: PlayerAccountCategory | keyof typeof PlayerAccountCategory;
  readonly targetingClassification: PlayerTargetingClassification | keyof typeof PlayerTargetingClassification;
  readonly tier?: string | null;
  readonly transactions: AsyncCollection<PlayerTransaction>;
  readonly results: AsyncCollection<PlayerResult>;
  readonly tickets: AsyncCollection<PlayerTicket>;
  readonly marketingPreferences: AsyncItem<PlayerMarketingPreferences | undefined>;
  readonly venueMemberships: AsyncCollection<PlayerVenue>;
  readonly summary: AsyncItem<PlayerSummary | undefined>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
  readonly playerMarketingPreferencesId?: string | null;
  readonly playerSummaryId?: string | null;
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
  readonly venuesVisited?: (string | null)[] | null;
  readonly sessionsPlayed?: number | null;
  readonly tournamentsPlayed?: number | null;
  readonly cashGamesPlayed?: number | null;
  readonly tournamentWinnings?: number | null;
  readonly tournamentBuyIns?: number | null;
  readonly cashGameWinnings?: number | null;
  readonly cashGameBuyIns?: number | null;
  readonly totalWinnings?: number | null;
  readonly totalBuyIns?: number | null;
  readonly netBalance?: number | null;
  readonly tournamentITM?: number | null;
  readonly tournamentsCashed?: number | null;
  readonly lastUpdated: string;
  readonly player?: Player | null;
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
  readonly venuesVisited?: (string | null)[] | null;
  readonly sessionsPlayed?: number | null;
  readonly tournamentsPlayed?: number | null;
  readonly cashGamesPlayed?: number | null;
  readonly tournamentWinnings?: number | null;
  readonly tournamentBuyIns?: number | null;
  readonly cashGameWinnings?: number | null;
  readonly cashGameBuyIns?: number | null;
  readonly totalWinnings?: number | null;
  readonly totalBuyIns?: number | null;
  readonly netBalance?: number | null;
  readonly tournamentITM?: number | null;
  readonly tournamentsCashed?: number | null;
  readonly lastUpdated: string;
  readonly player: AsyncItem<Player | undefined>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type PlayerSummary = LazyLoading extends LazyLoadingDisabled ? EagerPlayerSummary : LazyPlayerSummary

export declare const PlayerSummary: (new (init: ModelInit<PlayerSummary>) => PlayerSummary) & {
  copyOf(source: PlayerSummary, mutator: (draft: MutableModel<PlayerSummary>) => MutableModel<PlayerSummary> | void): PlayerSummary;
}

type EagerPlayerVenue = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerVenue, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly playerId: string;
  readonly venueId: string;
  readonly totalGamesPlayed?: number | null;
  readonly averageBuyIn?: number | null;
  readonly firstPlayedDate?: string | null;
  readonly lastPlayedDate?: string | null;
  readonly targetingClassification: PlayerVenueTargetingClassification | keyof typeof PlayerVenueTargetingClassification;
  readonly player?: Player | null;
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
  readonly playerId: string;
  readonly venueId: string;
  readonly totalGamesPlayed?: number | null;
  readonly averageBuyIn?: number | null;
  readonly firstPlayedDate?: string | null;
  readonly lastPlayedDate?: string | null;
  readonly targetingClassification: PlayerVenueTargetingClassification | keyof typeof PlayerVenueTargetingClassification;
  readonly player: AsyncItem<Player | undefined>;
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
  readonly playerId: string;
  readonly type: TransactionType | keyof typeof TransactionType;
  readonly amount: number;
  readonly paymentSource: PaymentSourceType | keyof typeof PaymentSourceType;
  readonly transactionDate: string;
  readonly rake?: number | null;
  readonly notes?: string | null;
  readonly gameId?: string | null;
  readonly player?: Player | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyPlayerTransaction = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerTransaction, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly playerId: string;
  readonly type: TransactionType | keyof typeof TransactionType;
  readonly amount: number;
  readonly paymentSource: PaymentSourceType | keyof typeof PaymentSourceType;
  readonly transactionDate: string;
  readonly rake?: number | null;
  readonly notes?: string | null;
  readonly gameId?: string | null;
  readonly player: AsyncItem<Player | undefined>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type PlayerTransaction = LazyLoading extends LazyLoadingDisabled ? EagerPlayerTransaction : LazyPlayerTransaction

export declare const PlayerTransaction: (new (init: ModelInit<PlayerTransaction>) => PlayerTransaction) & {
  copyOf(source: PlayerTransaction, mutator: (draft: MutableModel<PlayerTransaction>) => MutableModel<PlayerTransaction> | void): PlayerTransaction;
}

type EagerPlayerResult = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerResult, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly playerId: string;
  readonly gameId: string;
  readonly finishingPlace?: number | null;
  readonly isMultiDayQualification?: boolean | null;
  readonly prizeWon?: boolean | null;
  readonly amountWon?: number | null;
  readonly totalRunners?: number | null;
  readonly game?: Game | null;
  readonly player?: Player | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyPlayerResult = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerResult, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly playerId: string;
  readonly gameId: string;
  readonly finishingPlace?: number | null;
  readonly isMultiDayQualification?: boolean | null;
  readonly prizeWon?: boolean | null;
  readonly amountWon?: number | null;
  readonly totalRunners?: number | null;
  readonly game: AsyncItem<Game | undefined>;
  readonly player: AsyncItem<Player | undefined>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type PlayerResult = LazyLoading extends LazyLoadingDisabled ? EagerPlayerResult : LazyPlayerResult

export declare const PlayerResult: (new (init: ModelInit<PlayerResult>) => PlayerResult) & {
  copyOf(source: PlayerResult, mutator: (draft: MutableModel<PlayerResult>) => MutableModel<PlayerResult> | void): PlayerResult;
}

type EagerPlayerMarketingMessage = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerMarketingMessage, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly playerId: string;
  readonly marketingMessageId: string;
  readonly status: MessageStatus | keyof typeof MessageStatus;
  readonly sentAt: string;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyPlayerMarketingMessage = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerMarketingMessage, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly playerId: string;
  readonly marketingMessageId: string;
  readonly status: MessageStatus | keyof typeof MessageStatus;
  readonly sentAt: string;
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
  readonly playerId: string;
  readonly optOutSms?: boolean | null;
  readonly optOutEmail?: boolean | null;
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
  readonly playerId: string;
  readonly optOutSms?: boolean | null;
  readonly optOutEmail?: boolean | null;
  readonly player: AsyncItem<Player | undefined>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type PlayerMarketingPreferences = LazyLoading extends LazyLoadingDisabled ? EagerPlayerMarketingPreferences : LazyPlayerMarketingPreferences

export declare const PlayerMarketingPreferences: (new (init: ModelInit<PlayerMarketingPreferences>) => PlayerMarketingPreferences) & {
  copyOf(source: PlayerMarketingPreferences, mutator: (draft: MutableModel<PlayerMarketingPreferences>) => MutableModel<PlayerMarketingPreferences> | void): PlayerMarketingPreferences;
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
  readonly playerId: string;
  readonly ticketTemplateId: string;
  readonly assignedAt: string;
  readonly expiryDate: string;
  readonly status: TicketStatus | keyof typeof TicketStatus;
  readonly usedInGameId?: string | null;
  readonly ticketTemplate?: TicketTemplate | null;
  readonly player?: Player | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyPlayerTicket = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<PlayerTicket, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly playerId: string;
  readonly ticketTemplateId: string;
  readonly assignedAt: string;
  readonly expiryDate: string;
  readonly status: TicketStatus | keyof typeof TicketStatus;
  readonly usedInGameId?: string | null;
  readonly ticketTemplate: AsyncItem<TicketTemplate | undefined>;
  readonly player: AsyncItem<Player | undefined>;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type PlayerTicket = LazyLoading extends LazyLoadingDisabled ? EagerPlayerTicket : LazyPlayerTicket

export declare const PlayerTicket: (new (init: ModelInit<PlayerTicket>) => PlayerTicket) & {
  copyOf(source: PlayerTicket, mutator: (draft: MutableModel<PlayerTicket>) => MutableModel<PlayerTicket> | void): PlayerTicket;
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

type EagerUserPreference = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<UserPreference, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly userId: string;
  readonly page: string;
  readonly widget: string;
  readonly preference?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazyUserPreference = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<UserPreference, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly userId: string;
  readonly page: string;
  readonly widget: string;
  readonly preference?: string | null;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type UserPreference = LazyLoading extends LazyLoadingDisabled ? EagerUserPreference : LazyUserPreference

export declare const UserPreference: (new (init: ModelInit<UserPreference>) => UserPreference) & {
  copyOf(source: UserPreference, mutator: (draft: MutableModel<UserPreference>) => MutableModel<UserPreference> | void): UserPreference;
}

type EagerSocialPost = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<SocialPost, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly socialAccountId: string;
  readonly content: string;
  readonly imageUrl?: string | null;
  readonly postedAt: string;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

type LazySocialPost = {
  readonly [__modelMeta__]: {
    identifier: ManagedIdentifier<SocialPost, 'id'>;
    readOnlyFields: 'createdAt' | 'updatedAt';
  };
  readonly id: string;
  readonly socialAccountId: string;
  readonly content: string;
  readonly imageUrl?: string | null;
  readonly postedAt: string;
  readonly createdAt?: string | null;
  readonly updatedAt?: string | null;
}

export declare type SocialPost = LazyLoading extends LazyLoadingDisabled ? EagerSocialPost : LazySocialPost

export declare const SocialPost: (new (init: ModelInit<SocialPost>) => SocialPost) & {
  copyOf(source: SocialPost, mutator: (draft: MutableModel<SocialPost>) => MutableModel<SocialPost> | void): SocialPost;
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