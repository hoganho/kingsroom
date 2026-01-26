// src/types/player.types.ts
// Centralized TypeScript interfaces for Player-related types
// Matches GraphQL schema from 50-players.graphql and 00-enums.graphql

import type {
  PlayerAccountStatus,
  PlayerAccountCategory,
  PlayerTargetingClassification,
  PlayerVenueTargetingClassification,
  PlayerEntryStatus,
  TicketStatus,
  TransactionType,
  PaymentSourceType,
  CreditTransactionType,
  PointsTransactionType,
  VenueAssignmentStatus,
} from '../API';

// Re-export enums for convenience
export {
  PlayerAccountStatus,
  PlayerAccountCategory,
  PlayerTargetingClassification,
  PlayerVenueTargetingClassification,
  PlayerEntryStatus,
  TicketStatus,
  TransactionType,
  PaymentSourceType,
  CreditTransactionType,
  PointsTransactionType,
  VenueAssignmentStatus,
} from '../API';

// ============================================================================
// Core Player Types
// ============================================================================

export interface PlayerSummary {
  id: string;
  playerId: string;
  gamesPlayedLast30Days?: number | null;
  gamesPlayedLast90Days?: number | null;
  gamesPlayedAllTime?: number | null;
  averageFinishPosition?: number | null;
  netBalance?: number | null;
  sessionsPlayed?: number | null;
  tournamentsPlayed?: number | null;
  cashGamesPlayed?: number | null;
  venuesVisited?: number | null;
  tournamentWinnings?: number | null;
  tournamentBuyIns?: number | null;
  tournamentITM?: number | null;
  tournamentsCashed?: number | null;
  cashGameWinnings?: number | null;
  cashGameBuyIns?: number | null;
  totalWinnings?: number | null;
  totalBuyIns?: number | null;
  lastPlayed?: string | null;
}

export interface Venue {
  id: string;
  name: string;
  entityId?: string | null;
  entity?: {
    id: string;
    entityName: string;
  } | null;
}

export interface Game {
  id: string;
  name?: string | null;
  buyIn?: number | null;
  gameStartDateTime?: string | null;
  gameType?: string | null;
  venue?: Venue | null;
  entityId?: string | null;
  entity?: {
    id: string;
    entityName: string;
  } | null;
}

export interface PlayerVenue {
  id: string;
  playerId: string;
  venueId: string;
  entityId: string;
  venue?: Venue | null;
  totalGamesPlayed?: number | null;
  averageBuyIn?: number | null;
  totalBuyIns?: number | null;
  totalWinnings?: number | null;
  netProfit?: number | null;
  firstPlayedDate?: string | null;
  lastPlayedDate?: string | null;
  targetingClassification: PlayerVenueTargetingClassification;
}

export interface PlayerEntry {
  id: string;
  playerId: string;
  gameId: string;
  venueId?: string | null;
  entityId?: string | null;
  status: PlayerEntryStatus;
  registrationTime: string;
  eliminationTime?: string | null;
  gameStartDateTime: string;
  lastKnownStackSize?: number | null;
  tableNumber?: number | null;
  seatNumber?: number | null;
  numberOfReEntries?: number | null;
  game?: Game | null;
  entryType?: string | null;
}

export interface PlayerResult {
  id: string;
  playerId: string;
  gameId: string;
  venueId?: string | null;
  entityId?: string | null;
  finishingPlace?: number | null;
  isMultiDayQualification?: boolean | null;
  prizeWon?: boolean | null;
  amountWon?: number | null;
  totalRunners?: number | null;
  pointsEarned?: number | null;
  gameStartDateTime: string;
  game?: Game | null;
  totalBuyInsPaid?: number | null;
  netProfitLoss?: number | null;
}

export interface PlayerTransaction {
  id: string;
  playerId: string;
  type: TransactionType;
  amount: number;
  rake?: number | null;
  paymentSource: PaymentSourceType;
  transactionDate: string;
  notes?: string | null;
  gameId?: string | null;
  venueId?: string | null;
  entityId?: string | null;
  game?: Game | null;
}

export interface PlayerCredits {
  id: string;
  playerId: string;
  type: CreditTransactionType;
  changeAmount: number;
  balanceAfter: number;
  transactionDate: string;
  reason?: string | null;
  expiryDate?: string | null;
  relatedGameId?: string | null;
  relatedTransactionId?: string | null;
}

export interface PlayerPoints {
  id: string;
  playerId: string;
  type: PointsTransactionType;
  changeAmount: number;
  balanceAfter: number;
  transactionDate: string;
  reason?: string | null;
  expiryDate?: string | null;
  relatedGameId?: string | null;
  relatedTransactionId?: string | null;
}

export interface PlayerTicket {
  id: string;
  playerId: string;
  ticketTemplateId: string;
  status: TicketStatus;
  assignedAt: string;
  expiryDate?: string | null;
  usedInGameId?: string | null;
  usedAt?: string | null;
  ticketValue?: number | null;
  programName?: string | null;
  awardReason?: string | null;
  wonFromGameId?: string | null;
  wonFromPosition?: number | null;
  wonFromGame?: Game | null;
  ticketTemplate?: {
    id: string;
    name: string;
    description?: string | null;
    value: number;
    validityDays: number;
  } | null;
}

export interface KnownPlayerIdentity {
  id: string;
  playerId: string;
  sourceSystem: string;
  identityValue: string;
  identityType: string;
}

export interface PlayerMarketingPreferences {
  id: string;
  playerId: string;
  optOutSms?: boolean | null;
  optOutEmail?: boolean | null;
}

// ============================================================================
// Player - Main Entity
// ============================================================================

export interface Player {
  id: string;
  primaryEntityId?: string | null;
  firstName: string;
  lastName: string;
  phone?: string | null;
  email?: string | null;
  status: PlayerAccountStatus;
  category: PlayerAccountCategory;
  targetingClassification: PlayerTargetingClassification;
  registrationDate: string;
  firstGamePlayed?: string | null;
  lastPlayedDate?: string | null;
  creditBalance?: number | null;
  pointsBalance?: number | null;
  venueAssignmentStatus?: VenueAssignmentStatus | null;
  registrationVenueId?: string | null;
  registrationVenue?: Venue | null;
  createdAt?: string | null;
  updatedAt?: string | null;
}

// ============================================================================
// Extended Player Types with Relationships
// ============================================================================

export interface PlayerWithSummary extends Player {
  playerSummary?: PlayerSummary | null;
}

export interface PlayerWithVenues extends Player {
  playerVenues?: {
    items: (PlayerVenue | null)[];
    nextToken?: string | null;
  } | null;
}

export interface PlayerWithEntries extends Player {
  playerEntries?: {
    items: (PlayerEntry | null)[];
    nextToken?: string | null;
  } | null;
}

export interface PlayerWithResults extends Player {
  playerResults?: {
    items: (PlayerResult | null)[];
    nextToken?: string | null;
  } | null;
}

export interface PlayerWithTickets extends Player {
  playerTickets?: {
    items: (PlayerTicket | null)[];
    nextToken?: string | null;
  } | null;
}

export interface PlayerWithTransactions extends Player {
  playerTransactions?: {
    items: (PlayerTransaction | null)[];
    nextToken?: string | null;
  } | null;
}

export interface PlayerWithCredits extends Player {
  playerCredits?: {
    items: (PlayerCredits | null)[];
    nextToken?: string | null;
  } | null;
}

export interface PlayerWithPoints extends Player {
  playerPoints?: {
    items: (PlayerPoints | null)[];
    nextToken?: string | null;
  } | null;
}

// Full player profile with all relationships
export interface PlayerFull extends Player {
  playerSummary?: PlayerSummary | null;
  playerVenues?: {
    items: (PlayerVenue | null)[];
    nextToken?: string | null;
  } | null;
  playerEntries?: {
    items: (PlayerEntry | null)[];
    nextToken?: string | null;
  } | null;
  playerResults?: {
    items: (PlayerResult | null)[];
    nextToken?: string | null;
  } | null;
  playerTickets?: {
    items: (PlayerTicket | null)[];
    nextToken?: string | null;
  } | null;
  playerTransactions?: {
    items: (PlayerTransaction | null)[];
    nextToken?: string | null;
  } | null;
  playerCredits?: {
    items: (PlayerCredits | null)[];
    nextToken?: string | null;
  } | null;
  playerPoints?: {
    items: (PlayerPoints | null)[];
    nextToken?: string | null;
  } | null;
  knownIdentities?: {
    items: (KnownPlayerIdentity | null)[];
    nextToken?: string | null;
  } | null;
  marketingPreferences?: PlayerMarketingPreferences | null;
}

// Convenient type for dashboard/list views
export interface PlayerListItem extends PlayerWithSummary {
  playerVenues?: {
    items: (PlayerVenue | null)[];
  } | null;
  playerEntries?: {
    items: (PlayerEntry | null)[];
  } | null;
}

// ============================================================================
// Component Props Types
// ============================================================================

export interface PlayerCardProps {
  player: PlayerListItem;
  showEntityInfo?: boolean;
  onClick?: (player: PlayerListItem) => void;
}

export interface PlayerProfileData {
  player: Player;
  summary: PlayerSummary | null;
  recentResults: PlayerResult[];
  recentEntries: PlayerEntry[];
  venues: PlayerVenue[];
  transactions: PlayerTransaction[];
  credits: PlayerCredits[];
  points: PlayerPoints[];
  tickets: PlayerTicket[];
}

// ============================================================================
// Filter and Search Types
// ============================================================================

export interface PlayerFilters {
  status?: PlayerAccountStatus | 'ALL';
  category?: PlayerAccountCategory | 'ALL';
  targetingClassification?: PlayerTargetingClassification | 'ALL';
  entityId?: string;
  venueId?: string;
  searchTerm?: string;
}

export interface PlayerSearchResult {
  players: PlayerListItem[];
  nextToken: string | null;
  totalCount?: number;
}

// ============================================================================
// Statistics Types
// ============================================================================

export interface PlayerDashboardStats {
  totalPlayers: number;
  activePlayers: number;
  totalGamesPlayed: number;
  totalNetBalance: number;
  uniqueEntities: Set<string>;
  uniqueVenues: Set<string>;
}

export interface PlayerPerformanceStats {
  tournamentsPlayed: number;
  tournamentsCashed: number;
  cashRate: number;
  avgFinishPosition: number;
  totalWinnings: number;
  totalBuyIns: number;
  netBalance: number;
  roi: number;
}

// ============================================================================
// Status/Category Display Types
// ============================================================================

export interface StatusDisplay {
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
}

export interface CategoryDisplay {
  label: string;
  color: string;
  bgColor: string;
  textColor: string;
}

export interface TargetingDisplay {
  label: string;
  color: string;
  description: string;
}
