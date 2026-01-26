// src/utils/playerHelpers.ts
// Utility functions for Player data formatting and calculations

import { format, formatDistanceToNow, isValid, parseISO } from 'date-fns';
import type {
  Player,
  PlayerListItem,
  PlayerSummary,
  PlayerVenue,
  StatusDisplay,
  CategoryDisplay,
  TargetingDisplay,
  PlayerPerformanceStats,
} from '../types/player';
import {
  PlayerAccountStatus,
  PlayerAccountCategory,
  PlayerTargetingClassification,
  PlayerEntryStatus,
  TicketStatus,
  TransactionType,
  CreditTransactionType,
  PointsTransactionType,
} from '../types/player';

// ============================================================================
// Name Formatting
// ============================================================================

export const formatPlayerName = (player: Pick<Player, 'firstName' | 'lastName'>): string => {
  return `${player.firstName} ${player.lastName}`;
};

export const formatPlayerInitials = (player: Pick<Player, 'firstName' | 'lastName'>): string => {
  return `${player.firstName[0] || ''}${player.lastName[0] || ''}`.toUpperCase();
};

export const formatPlayerNameShort = (player: Pick<Player, 'firstName' | 'lastName'>): string => {
  return `${player.firstName} ${player.lastName[0]}.`;
};

// ============================================================================
// Date Formatting
// ============================================================================

export const formatDate = (dateString?: string | null, formatStr = 'dd MMM yyyy'): string => {
  if (!dateString) return '-';
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) return '-';
    return format(date, formatStr);
  } catch {
    return '-';
  }
};

export const formatDateTime = (dateString?: string | null): string => {
  return formatDate(dateString, 'dd MMM yyyy HH:mm');
};

export const formatDateShort = (dateString?: string | null): string => {
  return formatDate(dateString, 'dd/MM/yy');
};

export const formatDateRelative = (dateString?: string | null): string => {
  if (!dateString) return '-';
  try {
    const date = parseISO(dateString);
    if (!isValid(date)) return '-';
    return formatDistanceToNow(date, { addSuffix: true });
  } catch {
    return '-';
  }
};

export const formatDateWithRelative = (dateString?: string | null): string => {
  if (!dateString) return '-';
  const absolute = formatDate(dateString);
  const relative = formatDateRelative(dateString);
  return `${absolute} (${relative})`;
};

// ============================================================================
// Status Formatting
// ============================================================================

export const formatStatus = (status: PlayerAccountStatus): StatusDisplay => {
  const statusMap: Record<PlayerAccountStatus, StatusDisplay> = {
    [PlayerAccountStatus.ACTIVE]: {
      label: 'Active',
      color: 'green',
      bgColor: 'bg-green-100',
      textColor: 'text-green-800',
    },
    [PlayerAccountStatus.SUSPENDED]: {
      label: 'Suspended',
      color: 'yellow',
      bgColor: 'bg-yellow-100',
      textColor: 'text-yellow-800',
    },
    [PlayerAccountStatus.PENDING_VERIFICATION]: {
      label: 'Pending',
      color: 'gray',
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-800',
    },
  };

  return statusMap[status] || {
    label: status,
    color: 'gray',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-800',
  };
};

export const formatCategory = (category: PlayerAccountCategory): CategoryDisplay => {
  const categoryMap: Record<PlayerAccountCategory, CategoryDisplay> = {
    [PlayerAccountCategory.NEW]: {
      label: 'New',
      color: 'green',
      bgColor: 'bg-green-100',
      textColor: 'text-green-800',
    },
    [PlayerAccountCategory.RECREATIONAL]: {
      label: 'Recreational',
      color: 'blue',
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-800',
    },
    [PlayerAccountCategory.REGULAR]: {
      label: 'Regular',
      color: 'indigo',
      bgColor: 'bg-indigo-100',
      textColor: 'text-indigo-800',
    },
    [PlayerAccountCategory.VIP]: {
      label: 'VIP',
      color: 'purple',
      bgColor: 'bg-purple-100',
      textColor: 'text-purple-800',
    },
    [PlayerAccountCategory.LAPSED]: {
      label: 'Lapsed',
      color: 'gray',
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-800',
    },
  };

  return categoryMap[category] || {
    label: category,
    color: 'gray',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-800',
  };
};

export const formatTargetingClassification = (
  classification: PlayerTargetingClassification
): TargetingDisplay => {
  const classificationMap: Record<PlayerTargetingClassification, TargetingDisplay> = {
    [PlayerTargetingClassification.NotPlayed]: {
      label: 'Not Played',
      color: 'gray',
      description: 'Registered but never played',
    },
    [PlayerTargetingClassification.Active_EL]: {
      label: 'Active (Entry Level)',
      color: 'green',
      description: 'Recently active, entry-level player',
    },
    [PlayerTargetingClassification.Active]: {
      label: 'Active',
      color: 'green',
      description: 'Active in the last 30 days',
    },
    [PlayerTargetingClassification.Retain_Inactive31_60d]: {
      label: 'Retain (31-60d)',
      color: 'yellow',
      description: 'Inactive 31-60 days, retention opportunity',
    },
    [PlayerTargetingClassification.Retain_Inactive61_90d]: {
      label: 'Retain (61-90d)',
      color: 'orange',
      description: 'Inactive 61-90 days, at risk',
    },
    [PlayerTargetingClassification.Churned_91_120d]: {
      label: 'Churned (91-120d)',
      color: 'red',
      description: 'Churned 91-120 days ago',
    },
    [PlayerTargetingClassification.Churned_121_180d]: {
      label: 'Churned (121-180d)',
      color: 'red',
      description: 'Churned 121-180 days ago',
    },
    [PlayerTargetingClassification.Churned_181_360d]: {
      label: 'Churned (181-360d)',
      color: 'red',
      description: 'Churned 181-360 days ago',
    },
    [PlayerTargetingClassification.Churned_361d]: {
      label: 'Churned (361d+)',
      color: 'gray',
      description: 'Churned over 361 days ago',
    },
  };

  return classificationMap[classification] || {
    label: classification,
    color: 'gray',
    description: 'Unknown classification',
  };
};

export const formatEntryStatus = (status: PlayerEntryStatus): StatusDisplay => {
  const statusMap: Record<PlayerEntryStatus, StatusDisplay> = {
    [PlayerEntryStatus.REGISTERED]: {
      label: 'Registered',
      color: 'blue',
      bgColor: 'bg-blue-100',
      textColor: 'text-blue-800',
    },
    [PlayerEntryStatus.VOIDED]: {
      label: 'Voided',
      color: 'red',
      bgColor: 'bg-red-100',
      textColor: 'text-red-800',
    },
    [PlayerEntryStatus.PLAYING]: {
      label: 'Playing',
      color: 'green',
      bgColor: 'bg-green-100',
      textColor: 'text-green-800',
    },
    [PlayerEntryStatus.ELIMINATED]: {
      label: 'Eliminated',
      color: 'gray',
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-800',
    },
    [PlayerEntryStatus.COMPLETED]: {
      label: 'Completed',
      color: 'indigo',
      bgColor: 'bg-indigo-100',
      textColor: 'text-indigo-800',
    },
  };

  return statusMap[status] || {
    label: status,
    color: 'gray',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-800',
  };
};

export const formatTicketStatus = (status: TicketStatus): StatusDisplay => {
  const statusMap: Record<TicketStatus, StatusDisplay> = {
    [TicketStatus.ACTIVE]: {
      label: 'Active',
      color: 'green',
      bgColor: 'bg-green-100',
      textColor: 'text-green-800',
    },
    [TicketStatus.EXPIRED]: {
      label: 'Expired',
      color: 'red',
      bgColor: 'bg-red-100',
      textColor: 'text-red-800',
    },
    [TicketStatus.USED]: {
      label: 'Used',
      color: 'gray',
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-800',
    },
  };

  return statusMap[status] || {
    label: status,
    color: 'gray',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-800',
  };
};

export const formatTransactionType = (type: TransactionType): string => {
  const typeMap: Record<TransactionType, string> = {
    [TransactionType.BUY_IN]: 'Buy-in',
    [TransactionType.DEPOSIT]: 'Deposit',
    [TransactionType.TICKET_AWARD]: 'Ticket Award',
    [TransactionType.TICKET_REDEMPTION]: 'Ticket Redemption',
    [TransactionType.CASH_AWARD]: 'Cash Award',
    [TransactionType.QUALIFICATION]: 'Qualification',
    [TransactionType.WITHDRAWAL]: 'Withdrawal',
  };

  return typeMap[type] || type;
};

export const formatCreditTransactionType = (type: CreditTransactionType): string => {
  const typeMap: Record<CreditTransactionType, string> = {
    [CreditTransactionType.AWARD_PROMOTION]: 'Promotion Award',
    [CreditTransactionType.AWARD_REFUND]: 'Refund',
    [CreditTransactionType.AWARD_MANUAL]: 'Manual Award',
    [CreditTransactionType.REDEEM_GAME_BUY_IN]: 'Game Buy-in',
    [CreditTransactionType.EXPIRED]: 'Expired',
  };

  return typeMap[type] || type;
};

export const formatPointsTransactionType = (type: PointsTransactionType): string => {
  const typeMap: Record<PointsTransactionType, string> = {
    [PointsTransactionType.EARN_FROM_PLAY]: 'Earned from Play',
    [PointsTransactionType.EARN_FROM_PROMOTION]: 'Promotion Bonus',
    [PointsTransactionType.REDEEM_FOR_BUY_IN]: 'Redeemed for Buy-in',
    [PointsTransactionType.REDEEM_FOR_MERCH]: 'Redeemed for Merchandise',
    [PointsTransactionType.ADJUSTMENT_MANUAL]: 'Manual Adjustment',
    [PointsTransactionType.EXPIRED]: 'Expired',
  };

  return typeMap[type] || type;
};

// ============================================================================
// Calculations
// ============================================================================

export const calculateROI = (winnings?: number | null, buyIns?: number | null): number | null => {
  if (buyIns === null || buyIns === undefined || buyIns === 0) return null;
  if (winnings === null || winnings === undefined) return null;
  return ((winnings - buyIns) / buyIns) * 100;
};

export const formatROI = (winnings?: number | null, buyIns?: number | null): string => {
  const roi = calculateROI(winnings, buyIns);
  if (roi === null) return '-';
  const sign = roi >= 0 ? '+' : '';
  return `${sign}${roi.toFixed(1)}%`;
};

export const calculateCashRate = (cashed?: number | null, played?: number | null): number | null => {
  if (played === null || played === undefined || played === 0) return null;
  if (cashed === null || cashed === undefined) return null;
  return (cashed / played) * 100;
};

export const formatCashRate = (cashed?: number | null, played?: number | null): string => {
  const rate = calculateCashRate(cashed, played);
  if (rate === null) return '-';
  return `${rate.toFixed(1)}%`;
};

export const calculatePerformanceStats = (summary: PlayerSummary | null): PlayerPerformanceStats => {
  if (!summary) {
    return {
      tournamentsPlayed: 0,
      tournamentsCashed: 0,
      cashRate: 0,
      avgFinishPosition: 0,
      totalWinnings: 0,
      totalBuyIns: 0,
      netBalance: 0,
      roi: 0,
    };
  }

  const cashRate = calculateCashRate(summary.tournamentsCashed, summary.tournamentsPlayed) || 0;
  const roi = calculateROI(summary.totalWinnings, summary.totalBuyIns) || 0;

  return {
    tournamentsPlayed: summary.tournamentsPlayed || 0,
    tournamentsCashed: summary.tournamentsCashed || 0,
    cashRate,
    avgFinishPosition: summary.averageFinishPosition || 0,
    totalWinnings: summary.totalWinnings || 0,
    totalBuyIns: summary.totalBuyIns || 0,
    netBalance: summary.netBalance || 0,
    roi,
  };
};

// ============================================================================
// Venue Helpers
// ============================================================================

export const getPrimaryVenue = (player: PlayerListItem): string => {
  const venues = player.playerVenues?.items?.filter(Boolean) || [];
  if (venues.length === 0) return 'No venue';

  // Find the venue with most games played
  const primaryVenue = venues.reduce((prev, current) => {
    if (!current || !prev) return prev || current;
    return (current.totalGamesPlayed || 0) > (prev.totalGamesPlayed || 0) ? current : prev;
  }, null as PlayerVenue | null);

  return primaryVenue?.venue?.name || 'Unknown venue';
};

export const getVenueCount = (player: PlayerListItem): number => {
  return player.playerVenues?.items?.filter(Boolean).length || 0;
};

export const sortVenuesByGamesPlayed = (venues: (PlayerVenue | null)[]): PlayerVenue[] => {
  return venues
    .filter((v): v is PlayerVenue => v !== null)
    .sort((a, b) => (b.totalGamesPlayed || 0) - (a.totalGamesPlayed || 0));
};

// ============================================================================
// Sorting Helpers
// ============================================================================

export const sortPlayersByLastPlayed = <T extends PlayerListItem>(
  players: T[],
  direction: 'asc' | 'desc' = 'desc'
): T[] => {
  return [...players].sort((a, b) => {
    const dateA = a.playerSummary?.lastPlayed || a.lastPlayedDate || a.updatedAt || '';
    const dateB = b.playerSummary?.lastPlayed || b.lastPlayedDate || b.updatedAt || '';
    const comparison = dateA.localeCompare(dateB);
    return direction === 'desc' ? -comparison : comparison;
  });
};

export const sortPlayersByNetBalance = <T extends PlayerListItem>(
  players: T[],
  direction: 'asc' | 'desc' = 'desc'
): T[] => {
  return [...players].sort((a, b) => {
    const balanceA = a.playerSummary?.netBalance || 0;
    const balanceB = b.playerSummary?.netBalance || 0;
    return direction === 'desc' ? balanceB - balanceA : balanceA - balanceB;
  });
};

export const sortPlayersByGamesPlayed = <T extends PlayerListItem>(
  players: T[],
  direction: 'asc' | 'desc' = 'desc'
): T[] => {
  return [...players].sort((a, b) => {
    const gamesA = a.playerSummary?.gamesPlayedAllTime || 0;
    const gamesB = b.playerSummary?.gamesPlayedAllTime || 0;
    return direction === 'desc' ? gamesB - gamesA : gamesA - gamesB;
  });
};

// ============================================================================
// Filter Helpers
// ============================================================================

export const filterActivePlayersOnly = <T extends Player>(players: T[]): T[] => {
  return players.filter((p) => p.status === PlayerAccountStatus.ACTIVE);
};

export const filterByCategory = <T extends Player>(
  players: T[],
  category: PlayerAccountCategory
): T[] => {
  return players.filter((p) => p.category === category);
};

export const filterByTargetingClassification = <T extends Player>(
  players: T[],
  classification: PlayerTargetingClassification
): T[] => {
  return players.filter((p) => p.targetingClassification === classification);
};

// ============================================================================
// Contact Formatting
// ============================================================================

export const formatPhone = (phone?: string | null): string => {
  if (!phone) return '-';
  // Basic formatting - could be enhanced for different regions
  return phone;
};

export const formatEmail = (email?: string | null): string => {
  if (!email) return '-';
  return email;
};

export const hasContactInfo = (player: Pick<Player, 'email' | 'phone'>): boolean => {
  return !!(player.email || player.phone);
};

// ============================================================================
// Finishing Position Formatting
// ============================================================================

export const formatFinishingPosition = (
  position?: number | null,
  totalRunners?: number | null
): string => {
  if (position === null || position === undefined) return '-';
  
  const suffix = getOrdinalSuffix(position);
  const positionStr = `${position}${suffix}`;
  
  if (totalRunners !== null && totalRunners !== undefined) {
    return `${positionStr}/${totalRunners}`;
  }
  
  return positionStr;
};

export const getOrdinalSuffix = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
};

// ============================================================================
// Badge/Color Helpers
// ============================================================================

export const getNetBalanceColor = (netBalance?: number | null): string => {
  if (netBalance === null || netBalance === undefined) return 'text-gray-500';
  return netBalance >= 0 ? 'text-green-600' : 'text-red-600';
};

export const getNetBalanceBgColor = (netBalance?: number | null): string => {
  if (netBalance === null || netBalance === undefined) return 'bg-gray-100';
  return netBalance >= 0 ? 'bg-green-100' : 'bg-red-100';
};

export const getRankBadgeColor = (rank: number): string => {
  switch (rank) {
    case 1:
      return 'bg-yellow-400 text-white'; // Gold
    case 2:
      return 'bg-gray-300 text-gray-800'; // Silver
    case 3:
      return 'bg-orange-400 text-white'; // Bronze
    default:
      return 'bg-gray-200 text-gray-600';
  }
};
