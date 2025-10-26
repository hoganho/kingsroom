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
  structureLabel: { label: 'Structure Label', group: 'Core Game Details', isBaselineOptional: true },
  seriesName: { label: 'Series Name', group: 'Core Game Details', isBaselineOptional: true },
  variant: { label: 'Variant', group: 'Core Game Details', isBaselineOptional: true },
  gameVariant: { label: 'Game Variant', group: 'Core Game Details', isBaselineExpected: true },

  // Prize & Entry Details
  prizepool: { label: 'Prizepool', group: 'Prize & Entry Details', isBaselineExpected: true },
  totalEntries: { label: 'Total Entries', group: 'Prize & Entry Details', isBaselineExpected: true },
  playersRemaining: { label: 'Players Left', group: 'Prize & Entry Details', isProfileExpected: ["STATUS: RUNNING | REG: CLOSED"] },
  totalRebuys: { label: 'Total Rebuys', group: 'Prize & Entry Details', isBaselineOptional: true },
  totalAddons: { label: 'Total Add-ons', group: 'Prize & Entry Details', isBaselineOptional: true },
  revenueByEntries: { label: 'Revenue', group: 'Prize & Entry Details', isBaselineOptional: true },
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
  tables: { label: 'Live Tables', group: 'Structure & Player Data', isBaselineOptional: true },
  rawHtml: { label: 'Raw HTML', group: 'Structure & Player Data', isBaselineOptional: true },
};