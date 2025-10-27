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
  "STATUS: COMPLETED | REG: CLOSED": "A standard completed tournament with results.",
};

export const fieldManifest: Record<string, FieldDefinition> = {
  // Core Game Details
  name: { label: 'Name', group: 'Core Game Details', isBaselineExpected: true },
  gameStartDateTime: { label: 'Start Time', group: 'Core Game Details', isBaselineExpected: true },
  gameEndDateTime: { label: 'End Time', group: 'Core Game Details', isProfileExpected: ["STATUS: COMPLETED | REG: CLOSED"] },
  status: { label: 'Status', group: 'Core Game Details', isBaselineExpected: true },
  registrationStatus: { label: 'Registration', group: 'Core Game Details', isBaselineExpected: true },
  structureLabel: { label: 'Structure Label', group: 'Core Game Details', isBaselineExpected: true },
  gameVariant: { label: 'Game Variant', group: 'Core Game Details', isBaselineExpected: true },
  
  // Derived and Manual Details
  seriesName: { label: 'Series Name', group: 'Derived and Manual Details', isBaselineOptional: true },
  venueName: { label: 'Venue Name', group: 'Derived and Manual Details', isBaselineOptional: true },
  isAdHoc: { label: 'Is Adhoc', group: 'Derived and Manual Details', isBaselineExpected: true },
  isSeries: { label: 'Is Series', group: 'Derived and Manual Details', isBaselineExpected: true },
  isRecurring: { label: 'Is Recurring', group: 'Derived and Manual Details', isBaselineExpected: true },
  isSatellite: { label: 'Is Satellite', group: 'Derived and Manual Details', isBaselineExpected: true },

  // Prize & Entry Details
  prizepool: { label: 'Prizepool', group: 'Prize & Entry Details', isBaselineExpected: true },
  totalEntries: { label: 'Total Entries', group: 'Prize & Entry Details', isBaselineExpected: true },
  totalRebuys: { label: 'Total Rebuys', group: 'Prize & Entry Details', isBaselineOptional: true },
  totalAddons: { label: 'Total Add-ons', group: 'Prize & Entry Details', isBaselineOptional: true },
  totalRake: { label: 'Total Rake', group: 'Prize & Entry Details', isBaselineOptional: true },
  profitLoss: { label: 'Profit/Loss', group: 'Prize & Entry Details', isBaselineOptional: true },
  revenueByBuyIns: { label: 'Revenue', group: 'Prize & Entry Details', isBaselineOptional: true },
  guaranteeOverlay: { label: 'Overlay', group: 'Prize & Entry Details', isBaselineOptional: true },
  guaranteeSurplus: { label: 'Surplus', group: 'Prize & Entry Details', isBaselineOptional: true },
  totalDuration: { label: 'Total Duration', group: 'Prize & Entry Details', isBaselineOptional: true },
  gameTags: { label: 'Game Tags', group: 'Prize & Entry Details', isBaselineOptional: true },

  // Tournament Setup
  tournamentType: { label: 'Tournament Type', group: 'Tournament Setup', isBaselineOptional: true },
  buyIn: { label: 'Buy-In', group: 'Tournament Setup', isBaselineExpected: true },
  rake: { label: 'Rake', group: 'Tournament Setup', isBaselineOptional: true },
  startingStack: { label: 'Starting Stack', group: 'Tournament Setup', isBaselineExpected: true },
  hasGuarantee: { label: 'Has Guarantee', group: 'Tournament Setup', isBaselineExpected: true },
  guaranteeAmount: { label: 'Guarantee Amt', group: 'Tournament Setup', isBaselineOptional: true },
  
  // Structure & Player Data
  levels: { label: 'Levels', group: 'Structure & Player Data', isBaselineExpected: true },
  breaks: { label: 'Breaks', group: 'Structure & Player Data', isBaselineOptional: true },
  entries: { label: 'Entries', group: 'Structure & Player Data', isBaselineOptional: true },
  seating: { label: 'Seating', group: 'Structure & Player Data', isProfileExpected: ["STATUS: RUNNING | REG: CLOSED"] },
  results: { 
    label: 'Results', 
    group: 'Structure & Player Data', 
    isProfileExpected: ["STATUS: COMPLETED | REG: CLOSED"],
    isProfileOptional: ["STATUS: RUNNING | REG: CLOSED"] 
  },

  // Data for Live Games
  tables: { label: 'Live Tables', group: 'Live Tournament Data', isBaselineOptional: true },
  playersRemaining: { label: 'Players Left', group: 'Live Tournament Data', isProfileExpected: ["STATUS: RUNNING | REG: CLOSED"] },
  totalChipsInPlay: { label: 'Total Chips In Play', group: 'Live Tournament Data', isProfileExpected: ["STATUS: RUNNING | REG: CLOSED"] },
  averagePlayerStack: { label: 'Average Stack', group: 'Live Tournament Data', isProfileExpected: ["STATUS: RUNNING | REG: CLOSED"] },

//  rawHtml: { label: 'Raw HTML', group: 'Structure & Player Data', isBaselineOptional: true },
};