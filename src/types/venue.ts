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
}