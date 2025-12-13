// lib/fieldManifest.ts

export interface FieldDefinition {
  label: string;
  group: string;
  isBaselineExpected?: boolean;
  isBaselineOptional?: boolean;
  isProfileExpected?: string[];
  isProfileOptional?: string[];
}

export const profileDescriptions: Record<string, string> = {
  "STATUS: SCHEDULED | REG: OPEN": "A future game where registration is open.",
  "STATUS: RUNNING | REG: CLOSED": "A game currently in progress.",
  "STATUS: FINISHED | REG: CLOSED": "A standard completed tournament with results.",
};

export const fieldManifest: Record<string, FieldDefinition> = {
  // Core Game Details
  name: { label: 'Name', group: 'Core Game Details', isBaselineExpected: true },
  gameStartDateTime: { label: 'Start Time', group: 'Core Game Details', isBaselineExpected: true },
  gameEndDateTime: { label: 'End Time', group: 'Core Game Details', isProfileOptional: ["STATUS: FINISHED | REG: CLOSED"] },
  gameStatus: { label: 'Game Status', group: 'Core Game Details', isBaselineExpected: true },
  registrationStatus: { label: 'Registration', group: 'Core Game Details', isBaselineExpected: true },
  structureLabel: { label: 'Structure Label', group: 'Core Game Details', isBaselineExpected: true },
  gameVariant: { label: 'Game Variant', group: 'Core Game Details', isBaselineExpected: true },
  
  // Entity & Venue Details
  entityId: { label: 'Entity ID', group: 'Entity & Venue Details', isBaselineExpected: true },
  venueId: { label: 'Venue ID', group: 'Entity & Venue Details', isBaselineExpected: true },
  venueFee: { label: 'Venue Fee', group: 'Entity & Venue Details', isBaselineOptional: true },  // ✅ NEW
  
  // Derived and Manual Details
  seriesName: { label: 'Series Name', group: 'Derived and Manual Details', isBaselineOptional: true },
  venueName: { label: 'Venue Name', group: 'Derived and Manual Details', isBaselineOptional: true },
  isSeries: { label: 'Is Series', group: 'Derived and Manual Details', isBaselineExpected: true },
  isRegular: { label: 'Is Regular', group: 'Derived and Manual Details', isBaselineExpected: true },
  isSatellite: { label: 'Is Satellite', group: 'Derived and Manual Details', isBaselineExpected: true },
  gameFrequency: { label: 'Game Frequency', group: 'Core Game Details', isBaselineExpected: true },

  // Prize & Entry Details
  prizepoolPaid: { label: 'Prizepool Paid', group: 'Prize & Entry Details', isBaselineExpected: true },
  prizepoolCalculated: { label: 'Prizepool Calculated', group: 'Prize & Entry Details', isBaselineExpected: true },
  totalUniquePlayers: { label: 'Total Unique Players', group: 'Prize & Entry Details', isBaselineExpected: true },
  totalInitialEntries: { label: 'Total Initial Entries', group: 'Entry Details', isBaselineExpected: true },
  totalEntries: { label: 'Total Entries', group: 'Prize & Entry Details', isBaselineExpected: true },
  totalRebuys: { label: 'Total Rebuys', group: 'Prize & Entry Details', isBaselineOptional: true },
  totalAddons: { label: 'Total Add-ons', group: 'Prize & Entry Details', isBaselineOptional: true },
  totalDuration: { label: 'Total Duration', group: 'Prize & Entry Details', isBaselineOptional: true },
  gameTags: { label: 'Game Tags', group: 'Prize & Entry Details', isBaselineOptional: true },

  // Financial Metrics (Poker Economics)
  totalBuyInsCollected: { label: 'Total Buy-Ins Collected', group: 'Financial Metrics', isBaselineOptional: true },
  projectedRakeRevenue: { label: 'Projected Rake Revenue', group: 'Financial Metrics', isBaselineOptional: true },
  rakeSubsidy: { label: 'Rake Subsidy', group: 'Financial Metrics', isBaselineOptional: true },
  prizepoolPlayerContributions: { label: 'Player Contributions', group: 'Financial Metrics', isBaselineOptional: true },
  prizepoolAddedValue: { label: 'Prizepool Added Value', group: 'Financial Metrics', isBaselineOptional: true },
  prizepoolSurplus: { label: 'Prizepool Surplus', group: 'Financial Metrics', isBaselineOptional: true },
  guaranteeOverlayCost: { label: 'Guarantee Overlay Cost', group: 'Financial Metrics', isBaselineOptional: true },
  gameProfit: { label: 'Game Profit', group: 'Financial Metrics', isBaselineOptional: true },
  fullRakeRealized: { label: 'Full Rake Realized', group: 'Financial Metrics', isBaselineOptional: true },

  // Tournament Setup
  tournamentType: { label: 'Tournament Type', group: 'Tournament Setup', isBaselineOptional: true },
  tournamentId: { label: 'Tournament ID', group: 'Tournament Setup', isBaselineExpected: true },
  buyIn: { label: 'Buy-In', group: 'Tournament Setup', isBaselineExpected: true },
  rake: { label: 'Rake', group: 'Tournament Setup', isBaselineOptional: true },
  startingStack: { label: 'Starting Stack', group: 'Tournament Setup', isBaselineExpected: true },
  hasGuarantee: { label: 'Has Guarantee', group: 'Tournament Setup', isBaselineExpected: true },
  guaranteeAmount: { label: 'Guarantee Amt', group: 'Tournament Setup', isBaselineOptional: true },

  // Series Reference Fields
  tournamentSeriesId: { 
    label: 'Tournament Series', 
    group: 'Series Reference', 
    isProfileOptional: ["STATUS: SCHEDULED | REG: OPEN", "STATUS: RUNNING | REG: CLOSED", "STATUS: FINISHED | REG: CLOSED"] 
  },
  isMainEvent: { 
    label: 'Main Event', 
    group: 'Series Reference', 
    isBaselineOptional: true 
  },
  eventNumber: { 
    label: 'Event Number', 
    group: 'Series Reference', 
    isBaselineOptional: true 
  },
  dayNumber: { 
    label: 'Day Number', 
    group: 'Series Reference', 
    isBaselineOptional: true 
  },
  flightLetter: { 
    label: 'Flight Letter', 
    group: 'Series Reference', 
    isBaselineOptional: true 
  },
  finalDay: { 
    label: 'Final Day', 
    group: 'Series Reference', 
    isBaselineOptional: true 
  },
  
  // === NEW: Recurring Game Fields ===
  recurringGameId: { 
    label: 'Recurring Game', 
    group: 'Recurring Game', 
    isProfileOptional: ["STATUS: SCHEDULED | REG: OPEN", "STATUS: RUNNING | REG: CLOSED", "STATUS: FINISHED | REG: CLOSED"] 
  },
  recurringGameAssignmentStatus: { 
    label: 'Assignment Status', 
    group: 'Recurring Game', 
    isBaselineOptional: true 
  },
  recurringGameAssignmentConfidence: { 
    label: 'Confidence', 
    group: 'Recurring Game', 
    isBaselineOptional: true 
  },
  deviationNotes: { 
    label: 'Deviation Notes', 
    group: 'Recurring Game', 
    isBaselineOptional: true 
  },
  wasScheduledInstance: { 
    label: 'Scheduled Instance', 
    group: 'Recurring Game', 
    isBaselineOptional: true 
  },
  instanceNumber: { 
    label: 'Instance #', 
    group: 'Recurring Game', 
    isBaselineOptional: true 
  },
  
  // Structure & Player Data
  levels: { label: 'Levels', group: 'Structure & Player Data', isBaselineOptional: true },
  breaks: { label: 'Breaks', group: 'Structure & Player Data', isBaselineOptional: true },
  entries: { label: 'Entries', group: 'Structure & Player Data', isBaselineOptional: true },
  seating: { label: 'Seating', group: 'Structure & Player Data', isProfileOptional: ["STATUS: RUNNING | REG: CLOSED"] },
  results: { 
    label: 'Results', 
    group: 'Structure & Player Data', 
    isProfileExpected: ["STATUS: FINISHED | REG: CLOSED"],
    isProfileOptional: ["STATUS: RUNNING | REG: CLOSED"] 
  },

  // Data for Live Games
  tables: { label: 'Live Tables', group: 'Live Tournament Data', isBaselineOptional: true },
  playersRemaining: { label: 'Players Left', group: 'Live Tournament Data', isProfileExpected: ["STATUS: RUNNING | REG: CLOSED"] },
  totalChipsInPlay: { label: 'Total Chips In Play', group: 'Live Tournament Data', isProfileExpected: ["STATUS: RUNNING | REG: CLOSED"] },
  averagePlayerStack: { label: 'Average Stack', group: 'Live Tournament Data', isProfileExpected: ["STATUS: RUNNING | REG: CLOSED"] },

  // Game Type Classification
  gameType: { label: 'Game Type', group: 'Core Game Details', isBaselineOptional: true },

  // Additional metadata
  doNotScrape: { label: 'Do Not Scrape', group: 'System Fields', isBaselineOptional: true },
  foundKeys: { label: 'Found Keys', group: 'System Fields', isBaselineOptional: true },
  s3Key: { label: 'S3 Key', group: 'System Fields', isBaselineOptional: true },
};