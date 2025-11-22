// src/types/venue.ts

/**
 * Represents the data captured in the venue add/edit form.
 * This is simpler than the full API Venue type and doesn't include
 * read-only fields like createdAt, _version, etc.
 */
export interface VenueFormData {
  id?: string;
  name: string;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  aliases: string[];
  entityId: string | null;
  fee?: number | null;  // NEW - Venue fee per game
}

/**
 * Complete venue type matching the GraphQL schema
 */
export interface Venue {
  id: string;
  name: string;
  venueNumber?: number | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  aliases?: string[] | null;
  entityId?: string | null;
  entity?: {
    id: string;
    entityName: string;
  } | null;
  fee?: number | null;  // NEW - Venue fee per game
  _version?: number;
  _deleted?: boolean | null;
  _lastChangedAt?: number;
  createdAt?: string;
  updatedAt?: string;
}