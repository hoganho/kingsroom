// types/series.ts
// TypeScript interfaces for Tournament Series models with enhanced categorization

import { SeriesStatus, SeriesCategory, HolidayType } from '../API';

/**
 * Tournament Series Title (Template)
 * Defines reusable templates for series with categories
 */
export interface TournamentSeriesTitle {
  id: string;
  title: string;
  aliases?: string[] | null;
  seriesCategory?: SeriesCategory | null;  // NEW - Category determines series type
  _version?: number;
  _deleted?: boolean | null;
  _lastChangedAt?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Tournament Series Instance
 * Actual occurrence of a series with specific dates and venue
 */
export interface TournamentSeries {
  id: string;
  name: string;
  year: number;
  quarter?: number | null;              // NEW - Auto-calculated from dates (1-4)
  month?: number | null;                // NEW - Auto-calculated from dates (1-12)
  seriesCategory?: SeriesCategory | null; // NEW - Inherited from title or set manually
  holidayType?: HolidayType | null;       // NEW - Only for SPECIAL category series
  status: SeriesStatus;
  startDate?: string | null;
  endDate?: string | null;
  events?: string[] | null;
  numberOfEvents?: number | null;
  guaranteedPrizepool?: number | null;
  estimatedPrizepool?: number | null;
  actualPrizepool?: number | null;
  tournamentSeriesTitleId: string;
  title?: TournamentSeriesTitle | null;
  venueId?: string | null;
  venue?: {
    id: string;
    name: string;
    fee?: number | null;  // Venue fee if applicable
  } | null;
  _version?: number;
  _deleted?: boolean | null;
  _lastChangedAt?: number;
  createdAt?: string;
  updatedAt?: string;
}

/**
 * Form data for creating/updating series instances
 */
export interface TournamentSeriesFormData {
  name: string;
  year: number;
  quarter?: number | null;
  month?: number | null;
  seriesCategory?: SeriesCategory | null;
  holidayType?: HolidayType | null;
  status: SeriesStatus;
  startDate?: string | null;
  endDate?: string | null;
  numberOfEvents?: number | null;
  guaranteedPrizepool?: number | null;
  estimatedPrizepool?: number | null;
  actualPrizepool?: number | null;
  tournamentSeriesTitleId: string;
  venueId?: string | null;
}

/**
 * Form data for creating/updating series titles (templates)
 */
export interface TournamentSeriesTitleFormData {
  title: string;
  aliases?: string[];
  seriesCategory?: SeriesCategory | null;
}

/**
 * Series search/filter parameters
 */
export interface SeriesFilterParams {
  venueId?: string;
  year?: number;
  seriesCategory?: SeriesCategory;
  status?: SeriesStatus;
  holidayType?: HolidayType;
}

/**
 * Series statistics for reporting
 */
export interface SeriesStatistics {
  seriesId: string;
  totalEvents: number;
  completedEvents: number;
  totalPrizepoolPaid: number;
  totalPrizepoolCalculated: number;
  totalUniquePlayers: number;
  totalInitialEntries: number;
  totalEntries: number;
  averageBuyIn: number;
  venueRevenue: number;  // Based on venue fee
}