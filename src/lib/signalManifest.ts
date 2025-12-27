// lib/signalManifest.ts
// Defines all possible matching signals and their weights
// Similar to fieldManifest.ts for game fields

export type SignalStatus = 
  | 'MATCHED'      // ✅ Signal matched (positive contribution)
  | 'NOT_MATCHED'  // ❌ Signal did not match (penalty or zero)
  | 'NOT_EVALUATED'// ⚪ Could not evaluate (missing data on one or both sides)
  | 'NOT_APPLICABLE'; // ➖ Not relevant for this match type

export interface SignalDefinition {
  key: string;
  label: string;
  description: string;
  category: 'identity' | 'financial' | 'temporal' | 'venue' | 'structure' | 'attributes' | 'content' | 'penalties';
  weight: number;           // Points when matched
  penaltyWeight?: number;   // Points when NOT matched (negative)
  importance: 'critical' | 'high' | 'medium' | 'low';
}

export interface SignalResult {
  key: string;
  status: SignalStatus;
  contribution: number;     // Actual points contributed
  extractedValue?: string | number | null;
  gameValue?: string | number | null;
  details?: string;         // Human-readable explanation
}

export interface SignalCategoryResult {
  category: string;
  label: string;
  icon: string;
  signals: SignalResult[];
  totalPossible: number;
  totalEarned: number;
  percentage: number;
}

// ===================================================================
// SIGNAL DEFINITIONS
// ===================================================================

export const signalManifest: SignalDefinition[] = [
  // === IDENTITY SIGNALS (Critical - Golden matches) ===
  {
    key: 'tournamentId',
    label: 'Tournament ID',
    description: 'Direct tournament ID match from URL',
    category: 'identity',
    weight: 100,
    importance: 'critical',
  },
  {
    key: 'recurringGameName',
    label: 'Recurring Game Name',
    description: 'Recurring game name match (e.g., "THURSDAY GRIND")',
    category: 'identity',
    weight: 15,
    importance: 'high',
  },
  
  // === FINANCIAL SIGNALS ===
  {
    key: 'buyInExact',
    label: 'Buy-in (Exact)',
    description: 'Buy-in amount exactly matches',
    category: 'financial',
    weight: 25,
    importance: 'high',
  },
  {
    key: 'buyInClose',
    label: 'Buy-in (Close)',
    description: 'Buy-in within 10% of game',
    category: 'financial',
    weight: 12,
    importance: 'medium',
  },
  {
    key: 'buyInMismatch',
    label: 'Buy-in Mismatch',
    description: 'Buy-in differs significantly',
    category: 'financial',
    weight: 0,
    penaltyWeight: -10,
    importance: 'high',
  },
  {
    key: 'guaranteeMatch',
    label: 'Guarantee Amount',
    description: 'Guarantee amount matches',
    category: 'financial',
    weight: 15,
    importance: 'medium',
  },
  {
    key: 'rakeMatch',
    label: 'Rake Amount',
    description: 'Rake amount matches (extracted from buy-in breakdown)',
    category: 'financial',
    weight: 8,
    importance: 'medium',
  },
  {
    key: 'prizepoolMatch',
    label: 'Prize Pool',
    description: 'Prize pool amount matches',
    category: 'financial',
    weight: 10,
    importance: 'medium',
  },
  
  // === TEMPORAL SIGNALS ===
  {
    key: 'dateExact',
    label: 'Date (Exact)',
    description: 'Game date exactly matches',
    category: 'temporal',
    weight: 20,
    importance: 'high',
  },
  {
    key: 'dateClose',
    label: 'Date (Close)',
    description: 'Game date within 1 day',
    category: 'temporal',
    weight: 10,
    importance: 'medium',
  },
  {
    key: 'dateMismatch',
    label: 'Date Mismatch',
    description: 'Date differs by more than 3 days',
    category: 'temporal',
    weight: 0,
    penaltyWeight: -15,
    importance: 'high',
  },
  {
    key: 'dayOfWeekMatch',
    label: 'Day of Week',
    description: 'Day of week matches (e.g., Thursday)',
    category: 'temporal',
    weight: 8,
    importance: 'low',
  },
  {
    key: 'startTimeMatch',
    label: 'Start Time',
    description: 'Start time matches within 1 hour',
    category: 'temporal',
    weight: 5,
    importance: 'low',
  },
  
  // === VENUE SIGNALS ===
  {
    key: 'venueExact',
    label: 'Venue (Exact)',
    description: 'Venue ID exactly matches',
    category: 'venue',
    weight: 20,
    importance: 'high',
  },
  {
    key: 'venuePartial',
    label: 'Venue (Suggested)',
    description: 'Suggested venue matches game',
    category: 'venue',
    weight: 10,
    importance: 'medium',
  },
  {
    key: 'venueMismatch',
    label: 'Venue Mismatch',
    description: 'Extracted venue differs from game',
    category: 'venue',
    weight: 0,
    penaltyWeight: -5,
    importance: 'medium',
  },
  
  // === STRUCTURE SIGNALS (NEW) ===
  {
    key: 'startingStackMatch',
    label: 'Starting Stack',
    description: 'Starting stack amount matches',
    category: 'structure',
    weight: 8,
    importance: 'medium',
  },
  {
    key: 'blindLevelMatch',
    label: 'Blind Levels',
    description: 'Blind level duration matches (e.g., 20-minute levels)',
    category: 'structure',
    weight: 6,
    importance: 'low',
  },
  {
    key: 'tournamentTypeMatch',
    label: 'Tournament Type',
    description: 'Tournament type matches (REBUY, FREEZEOUT, SATELLITE)',
    category: 'structure',
    weight: 10,
    importance: 'medium',
  },
  {
    key: 'tournamentTypeMismatch',
    label: 'Tournament Type Mismatch',
    description: 'Tournament type conflicts (e.g., REBUY vs FREEZEOUT)',
    category: 'structure',
    weight: 0,
    penaltyWeight: -8,
    importance: 'medium',
  },
  
  // === ATTRIBUTE SIGNALS ===
  {
    key: 'entriesMatch',
    label: 'Entry Count',
    description: 'Entry count matches within 5',
    category: 'attributes',
    weight: 10,
    importance: 'medium',
  },
  {
    key: 'gameVariantMatch',
    label: 'Game Variant',
    description: 'Game variant matches (NLH, PLO, etc.)',
    category: 'attributes',
    weight: 5,
    importance: 'low',
  },
  
  // === CONTENT TYPE SIGNALS ===
  {
    key: 'resultPostFinishedGame',
    label: 'Result → Finished',
    description: 'Result post matched to finished game',
    category: 'content',
    weight: 10,
    importance: 'medium',
  },
  {
    key: 'promoPostScheduledGame',
    label: 'Promo → Scheduled',
    description: 'Promo post matched to scheduled game',
    category: 'content',
    weight: 5,
    importance: 'low',
  },
  {
    key: 'contentStatusMismatch',
    label: 'Content/Status Mismatch',
    description: 'Post type conflicts with game status',
    category: 'content',
    weight: 0,
    penaltyWeight: -5,
    importance: 'low',
  },
];

// ===================================================================
// CATEGORY METADATA
// ===================================================================

export const categoryMeta: Record<string, { label: string; icon: string; maxPossible: number }> = {
  identity: { label: 'Identity', icon: '🎯', maxPossible: 115 },    // Updated: +15 for recurring name
  financial: { label: 'Financial', icon: '💰', maxPossible: 60 },
  temporal: { label: 'Date/Time', icon: '📅', maxPossible: 43 },
  venue: { label: 'Venue', icon: '📍', maxPossible: 30 },
  structure: { label: 'Structure', icon: '🏗️', maxPossible: 24 },
  attributes: { label: 'Attributes', icon: '📊', maxPossible: 15 },
  content: { label: 'Content Type', icon: '📝', maxPossible: 15 },
  penalties: { label: 'Penalties', icon: '⚠️', maxPossible: 0 },
};

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

export const getSignalsByCategory = (category: string): SignalDefinition[] => {
  return signalManifest.filter(s => s.category === category);
};

export const getSignalByKey = (key: string): SignalDefinition | undefined => {
  return signalManifest.find(s => s.key === key);
};

export const getAllCategories = (): string[] => {
  return Object.keys(categoryMeta);
};

/**
 * Calculate the maximum possible score
 * (sum of all positive weights, excluding penalties)
 */
export const getMaxPossibleScore = (): number => {
  return signalManifest
    .filter(s => s.weight > 0)
    .reduce((sum, s) => sum + s.weight, 0);
};

/**
 * Format a signal result for display
 */
export const formatSignalStatus = (status: SignalStatus): { icon: string; color: string; label: string } => {
  switch (status) {
    case 'MATCHED':
      return { icon: '✅', color: 'text-green-600', label: 'Matched' };
    case 'NOT_MATCHED':
      return { icon: '❌', color: 'text-red-500', label: 'Not Matched' };
    case 'NOT_EVALUATED':
      return { icon: '⚪', color: 'text-gray-400', label: 'No Data' };
    case 'NOT_APPLICABLE':
      return { icon: '➖', color: 'text-gray-300', label: 'N/A' };
    default:
      return { icon: '❓', color: 'text-gray-400', label: 'Unknown' };
  }
};