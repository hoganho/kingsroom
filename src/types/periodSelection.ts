// types/periodSelection.ts
// Helper types and functions for period selection UI
// Uses Amplify-generated types from API.ts

import type {
  PeriodSelectionInput,
  PeriodType,
  RelativePeriod,
  ResolvedPeriod,
} from '../API';

// Re-export API types for convenience
export type { PeriodSelectionInput, PeriodType, RelativePeriod, ResolvedPeriod };

// ===================================================================
// UI STATE TYPE
// ===================================================================

/**
 * Internal UI state for the PeriodSelector component.
 * This is converted to PeriodSelectionInput when making API calls.
 */
export interface PeriodSelectorState {
  tab: 'quick' | 'week' | 'month' | 'quarter' | 'custom';
  
  // Quick presets
  relativePeriod?: RelativePeriod | null;
  
  // Week selection
  isoYear?: number;
  isoWeek?: number;
  
  // Month selection
  monthYear?: number;
  month?: number;
  
  // Quarter selection
  quarterYear?: number;
  quarter?: number;
  
  // Custom range
  customStartDate?: string;  // YYYY-MM-DD
  customEndDate?: string;    // YYYY-MM-DD
}

// ===================================================================
// DEFAULT STATE
// ===================================================================

export function getDefaultSelectorState(): PeriodSelectorState {
  return {
    tab: 'quick',
    relativePeriod: 'LAST_WEEK' as RelativePeriod,
  };
}

// ===================================================================
// VALIDATION
// ===================================================================

export function isValidSelection(state: PeriodSelectorState): boolean {
  switch (state.tab) {
    case 'quick':
      return !!state.relativePeriod;
    case 'week':
      return !!state.isoYear && !!state.isoWeek && state.isoWeek >= 1 && state.isoWeek <= 53;
    case 'month':
      return !!state.monthYear && !!state.month && state.month >= 1 && state.month <= 12;
    case 'quarter':
      return !!state.quarterYear && !!state.quarter && state.quarter >= 1 && state.quarter <= 4;
    case 'custom':
      return !!state.customStartDate && !!state.customEndDate && state.customStartDate <= state.customEndDate;
    default:
      return false;
  }
}

// ===================================================================
// CONVERT TO API INPUT
// ===================================================================

export function selectorStateToPeriodInput(state: PeriodSelectorState): PeriodSelectionInput | null {
  if (!isValidSelection(state)) return null;
  
  switch (state.tab) {
    case 'quick':
      return {
        periodType: 'RELATIVE' as PeriodType,
        relativePeriod: state.relativePeriod,
      };
    case 'week':
      return {
        periodType: 'ISO_WEEK' as PeriodType,
        isoYear: state.isoYear,
        isoWeek: state.isoWeek,
      };
    case 'month':
      return {
        periodType: 'MONTH' as PeriodType,
        monthYear: state.monthYear,
        month: state.month,
      };
    case 'quarter':
      return {
        periodType: 'QUARTER' as PeriodType,
        quarterYear: state.quarterYear,
        quarter: state.quarter,
      };
    case 'custom':
      return {
        periodType: 'CUSTOM' as PeriodType,
        customStartDate: state.customStartDate,
        customEndDate: state.customEndDate,
      };
    default:
      return null;
  }
}

// ===================================================================
// LABELS
// ===================================================================

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const RELATIVE_LABELS: Record<string, string> = {
  CURRENT_WEEK: 'This Week',
  LAST_WEEK: 'Last Week',
  CURRENT_MONTH: 'This Month',
  LAST_MONTH: 'Last Month',
  CURRENT_QUARTER: 'This Quarter',
  LAST_QUARTER: 'Last Quarter',
  CURRENT_YEAR: 'This Year',
  LAST_YEAR: 'Last Year',
  LAST_7_DAYS: 'Last 7 Days',
  LAST_30_DAYS: 'Last 30 Days',
  LAST_90_DAYS: 'Last 90 Days',
};

export function getPeriodLabel(state: PeriodSelectorState): string {
  switch (state.tab) {
    case 'quick':
      return state.relativePeriod ? RELATIVE_LABELS[state.relativePeriod] || state.relativePeriod : 'Select period';
    case 'week':
      return state.isoYear && state.isoWeek ? `Week ${state.isoWeek}, ${state.isoYear}` : 'Select week';
    case 'month':
      return state.monthYear && state.month ? `${MONTH_NAMES[state.month - 1]} ${state.monthYear}` : 'Select month';
    case 'quarter':
      return state.quarterYear && state.quarter ? `Q${state.quarter} ${state.quarterYear}` : 'Select quarter';
    case 'custom':
      if (state.customStartDate && state.customEndDate) {
        return `${formatShortDate(state.customStartDate)} - ${formatShortDate(state.customEndDate)}`;
      }
      return 'Select dates';
    default:
      return 'Select period';
  }
}

function formatShortDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
}

// ===================================================================
// UTILITIES
// ===================================================================

export function getCurrentISOWeek(): { year: number; week: number } {
  const now = new Date();
  const jan4 = new Date(now.getFullYear(), 0, 4);
  const dayOfYear = Math.floor((now.getTime() - jan4.getTime()) / 86400000) + jan4.getDay() + 1;
  const week = Math.ceil(dayOfYear / 7);
  
  // Handle year boundary
  if (week === 0) {
    return { year: now.getFullYear() - 1, week: 52 };
  }
  if (week > 52) {
    const dec31 = new Date(now.getFullYear(), 11, 31);
    if (dec31.getDay() < 4) {
      return { year: now.getFullYear() + 1, week: 1 };
    }
  }
  
  return { year: now.getFullYear(), week };
}

export function getISOWeeksInYear(year: number): number {
  const dec31 = new Date(year, 11, 31);
  const jan1 = new Date(year, 0, 1);
  
  // Check if Dec 31 is in week 53 or week 1 of next year
  const dec31Day = dec31.getDay() || 7; // Convert Sunday from 0 to 7
  const jan1Day = jan1.getDay() || 7;
  
  // Year has 53 weeks if Jan 1 is Thursday or Dec 31 is Thursday
  // Or if it's a leap year and Jan 1 is Wednesday or Dec 31 is Friday
  if (jan1Day === 4 || dec31Day === 4) {
    return 53;
  }
  
  return 52;
}
