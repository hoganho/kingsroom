// src/types/entity.ts
// TypeScript types for Entity management

export interface Entity {
  id: string;
  entityName: string;
  gameUrlDomain: string;
  gameUrlPath: string;
  entityLogo?: string | null;
  isActive: boolean;
  createdAt?: string;
  updatedAt?: string;
  _version?: number;
  _deleted?: boolean | null;
  _lastChangedAt?: number;
}

export interface EntityFormData {
  entityName: string;
  gameUrlDomain: string;
  gameUrlPath: string;
  entityLogo?: string;
  isActive: boolean;
}

export interface EntityStats {
  gamesCount: number;
  venuesCount: number;
  assetsCount: number;
  scrapeURLsCount: number;
}

export interface EntityWithStats extends Entity {
  stats?: EntityStats;
}
