// src/pages/games/game-tabs/types.ts
// Shared types for GameDetails components
// =============================================================================

export type TabId = 'overview' | 'financials' | 'players' | 'results' | 'relations';

export interface Game {
  id: string;
  name: string;
  tournamentId?: number;
  gameType: string;
  gameVariant: string;
  gameStatus: string;
  registrationStatus?: string;
  gameStartDateTime: string;
  gameEndDateTime?: string;
  gameFrequency?: string;
  totalDuration?: string;
  
  // Financials
  buyIn?: number;
  rake?: number;
  venueFee?: number;
  startingStack?: number;
  hasGuarantee?: boolean;
  guaranteeAmount?: number;
  
  // Calculated Financial Metrics
  totalBuyInsCollected?: number;
  rakeRevenue?: number;
  prizepoolPlayerContributions?: number;
  prizepoolAddedValue?: number;
  prizepoolSurplus?: number;
  guaranteeOverlayCost?: number;
  gameProfit?: number;
  
  // Jackpot & Accumulator
  hasJackpotContributions?: boolean;
  jackpotContributionAmount?: number;
  hasAccumulatorTickets?: boolean;
  accumulatorTicketValue?: number;
  numberOfAccumulatorTicketsPaid?: number;
  
  // Aggregates & Results
  prizepoolPaid?: number;
  prizepoolCalculated?: number;
  totalUniquePlayers?: number;
  totalInitialEntries?: number;
  totalEntries?: number;
  totalRebuys?: number;
  totalAddons?: number;
  
  // Live Game Data
  playersRemaining?: number;
  totalChipsInPlay?: number;
  averagePlayerStack?: number;
  
  // Classification
  tournamentType?: string;
  isRegular?: boolean;
  isSatellite?: boolean;
  gameTags?: string[];
  dealerDealt?: boolean;
  
  // New Classification Fields
  sessionMode?: string;
  variant?: string;
  bettingStructure?: string;
  speedType?: string;
  tableSize?: string;
  maxPlayers?: number;
  dealType?: string;
  buyInTier?: string;
  entryStructure?: string;
  bountyType?: string;
  bountyAmount?: number;
  bountyPercentage?: number;
  tournamentPurpose?: string;
  stackDepth?: string;
  lateRegistration?: string;
  payoutStructure?: string;
  scheduleType?: string;
  classificationSource?: string;
  classificationConfidence?: number;
  
  // Series Reference Fields
  isSeries?: boolean;
  seriesName?: string;
  isMainEvent?: boolean;
  eventNumber?: number;
  dayNumber?: number;
  flightLetter?: string;
  finalDay?: boolean;
  
  // Multi-Day Consolidation
  parentGameId?: string;
  consolidationType?: string;
  consolidationKey?: string;
  isPartialData?: boolean;
  missingFlightCount?: number;
  expectedTotalEntries?: number;
  
  // Assignment Statuses
  venueAssignmentStatus?: string;
  seriesAssignmentStatus?: string;
  recurringGameAssignmentStatus?: string;
  recurringGameAssignmentConfidence?: number;
  wasScheduledInstance?: boolean;
  deviationNotes?: string;
  instanceNumber?: number;
  
  // Structure
  levels?: any;
  
  // Data Source
  sourceUrl?: string;
  wasEdited?: boolean;
  lastEditedAt?: string;
  lastEditedBy?: string;
  
  // Relationships
  venueId?: string;
  venue?: Venue;
  entityId?: string;
  entity?: Entity;
  tournamentSeriesId?: string;
  recurringGameId?: string;
  
  createdAt: string;
  updatedAt: string;
}

export interface Venue {
  id: string;
  name: string;
  address?: string;
  city?: string;
  country?: string;
  fee?: number;
}

export interface Entity {
  id: string;
  entityName: string;
  entityLogo?: string;
}

export interface TournamentStructure {
  id: string;
  levels?: TournamentLevel[];
  breaks?: Break[];
}

export interface TournamentLevel {
  levelNumber: number;
  duration: number;
  smallBlind: number;
  bigBlind: number;
  ante?: number;
  bigBlindAnte?: number;
}

export interface Break {
  levelNumberBeforeBreak: number;
  duration: number;
}

export interface PlayerEntry {
  id: string;
  status: string;
  registrationTime: string;
  eliminationTime?: string;
  gameStartDateTime: string;
  lastKnownStackSize?: number;
  tableNumber?: number;
  seatNumber?: number;
  numberOfReEntries?: number;
  entryType?: string;
  player?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface PlayerResult {
  id: string;
  finishingPlace?: number;
  prizeWon?: boolean;
  amountWon?: number;
  pointsEarned?: number;
  isMultiDayQualification?: boolean;
  totalRunners?: number;
  netProfitLoss?: number;
  totalBuyInsPaid?: number;
  player?: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface RecurringGame {
  id: string;
  name: string;
  displayName?: string;
  description?: string;
  dayOfWeek?: string;
  startTime?: string;
  frequency?: string;
  typicalBuyIn?: number;
  typicalGuarantee?: number;
  isActive?: boolean;
  isSignature?: boolean;
  totalInstancesRun?: number;
  avgAttendance?: number;
  hasJackpotContributions?: boolean;
  jackpotContributionAmount?: number;
  hasAccumulatorTickets?: boolean;
  accumulatorTicketValue?: number;
  venue?: Venue;
}

export interface TournamentSeries {
  id: string;
  name: string;
  year: number;
  seriesCategory?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  numberOfEvents?: number;
  guaranteedPrizepool?: number;
  estimatedPrizepool?: number;
  actualPrizepool?: number;
  title?: {
    id: string;
    title: string;
  };
  venue?: Venue;
}

export interface GameCost {
  id: string;
  totalDealerCost?: number;
  totalTournamentDirectorCost?: number;
  totalFloorStaffCost?: number;
  totalSecurityCost?: number;
  totalPrizeContribution?: number;
  totalJackpotContribution?: number;
  totalGuaranteeOverlayCost?: number;
  totalAddedValueCost?: number;
  totalBountyCost?: number;
  totalVenueRentalCost?: number;
  totalEquipmentRentalCost?: number;
  totalFoodBeverageCost?: number;
  totalMarketingCost?: number;
  totalStreamingCost?: number;
  totalInsuranceCost?: number;
  totalLicensingCost?: number;
  totalStaffTravelCost?: number;
  totalPlayerAccommodationCost?: number;
  totalPromotionCost?: number;
  totalOtherCost?: number;
  totalStaffCost?: number;
  totalDirectGameCost?: number;
  totalOperationsCost?: number;
  totalComplianceCost?: number;
  totalCost?: number;
  isEstimate?: boolean;
  costStatus?: string;
}

export interface GameFinancialSnapshot {
  id: string;
  totalRevenue?: number;
  totalCost?: number;
  netProfit?: number;
  profitMargin?: number;
  revenuePerPlayer?: number;
  costPerPlayer?: number;
  profitPerPlayer?: number;
  rakePerEntry?: number;
  guaranteeCoverageRate?: number;
  guaranteeMet?: boolean;
}

export interface SocialPost {
  id: string;
  platform: string;
  postType: string;
  textContent?: string;
  postedAt: string;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  postUrl?: string;
}

export interface GameData {
  game: Game;
  structure?: TournamentStructure;
  entries: PlayerEntry[];
  results: PlayerResult[];
  recurringGame?: RecurringGame;
  tournamentSeries?: TournamentSeries;
  parentGame?: Game;
  childGames: Game[];
  gameCost?: GameCost;
  financialSnapshot?: GameFinancialSnapshot;
  linkedSocialPosts: SocialPost[];
}
