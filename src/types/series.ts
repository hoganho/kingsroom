// types/series.ts
// TypeScript interfaces for Tournament Series models

import { SeriesStatus } from '../API';

export interface TournamentSeriesTitle {
  id: string;
  title: string;
  aliases?: string[] | null;
  _version?: number;
  _deleted?: boolean | null;
  _lastChangedAt?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TournamentSeries {
  id: string;
  name: string;
  year: number;
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
  } | null;
  _version?: number;
  _deleted?: boolean | null;
  _lastChangedAt?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface TournamentSeriesFormData {
  name: string;
  year: number;
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

export interface TournamentSeriesTitleFormData {
  title: string;
  aliases?: string[];
}