/**
 * matching/venueMatcher.js
 * Match extracted venue names to existing venue records
 * 
 * UPDATED: 
 * - matchVenueFromContent function for social post processing
 * - Queries venue aliases from database (like series-resolver.js)
 * - Supports both database aliases and hardcoded fallback aliases
 * - Caches venues for performance
 */

const stringSimilarity = require('string-similarity');
const { queryVenuesByEntity, getVenue, getAllVenues } = require('../utils/graphql');

// Similarity thresholds
const VENUE_MATCH_THRESHOLD = 0.6;
const VENUE_STRONG_MATCH = 0.85;
const VENUE_AUTO_ASSIGN_THRESHOLD = 0.75;

// Cached venues (refreshed periodically)
let venueCache = null;
let venueCacheTimestamp = 0;
const VENUE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get all venues with caching
 * Venues include: id, name, aliases, shortName, entityId
 * 
 * The aliases field on Venue records is the primary source for venue matching.
 * Add aliases like "STG" to the venue record in DynamoDB for best results.
 */
const getVenuesWithCache = async () => {
  const now = Date.now();
  
  if (venueCache && (now - venueCacheTimestamp) < VENUE_CACHE_TTL) {
    return venueCache;
  }
  
  console.log('[VENUE] Refreshing venue cache...');
  venueCache = await getAllVenues();
  venueCacheTimestamp = now;
  
  // Log aliases for debugging
  const venuesWithAliases = venueCache.filter(v => v.aliases?.length > 0);
  console.log(`[VENUE] Cached ${venueCache.length} venues (${venuesWithAliases.length} with aliases)`);
  
  if (venuesWithAliases.length > 0) {
    console.log('[VENUE] Venues with aliases:', venuesWithAliases.map(v => ({
      name: v.name,
      aliases: v.aliases
    })));
  }
  
  return venueCache;
};

/**
 * Normalize venue name for comparison
 * Handles common variations and abbreviations
 */
const normalizeName = (name) => {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .trim()
    .replace(/[''`]/g, "'")           // Normalize quotes
    .replace(/[&]/g, 'and')           // Normalize ampersands
    .replace(/\s+/g, ' ')             // Normalize whitespace
    .replace(/[^a-z0-9\s']/g, '');    // Remove special chars
};

/**
 * Escape special regex characters
 */
const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Match venue name from post content to existing venues
 * This is the main function for social post processing
 * 
 * Matching is done against database Venue records:
 * - venue.name (primary name)
 * - venue.shortName (e.g., "STG")
 * - venue.aliases (array of alternative names)
 * 
 * @param {string} extractedName - Venue name extracted from post content
 * @returns {Object} { venueId, venueName, confidence, matchReason, entityId }
 */
const matchVenueFromContent = async (extractedName) => {
  if (!extractedName) {
    return { venueId: null, venueName: null, confidence: 0, matchReason: 'no_input' };
  }
  
  console.log(`[VENUE] Matching venue from content: "${extractedName}"`);
  
  // Get all venues from database
  const venues = await getVenuesWithCache();
  
  if (!venues || venues.length === 0) {
    console.log('[VENUE] No venues in database');
    return { venueId: null, venueName: null, confidence: 0, matchReason: 'no_venues' };
  }
  
  const normalizedExtracted = normalizeName(extractedName);
  let bestMatch = null;
  let bestScore = 0;
  let matchReason = null;
  
  for (const venue of venues) {
    const venueName = venue.name || '';
    const venueAliases = venue.aliases || [];
    const venueShortName = venue.shortName || '';
    
    // All names to check for this venue (from database)
    const namesToCheck = [venueName, venueShortName, ...venueAliases].filter(Boolean);
    
    for (const nameToCheck of namesToCheck) {
      const normalizedVenue = normalizeName(nameToCheck);
      
      // === EXACT MATCH ===
      if (normalizedExtracted === normalizedVenue) {
        console.log(`[VENUE] Exact match: "${venue.name}" via "${nameToCheck}"`);
        return {
          venueId: venue.id,
          venueName: venue.name,
          confidence: 1.0,
          matchReason: nameToCheck === venueName ? 'exact_name' : 
                       nameToCheck === venueShortName ? 'exact_shortName' : 'exact_alias',
          entityId: venue.entityId
        };
      }
      
      // === CONTAINS MATCH ===
      // Check if extracted name contains venue name or vice versa
      if (normalizedExtracted.includes(normalizedVenue) && normalizedVenue.length >= 3) {
        const containsScore = 0.9;
        if (containsScore > bestScore) {
          bestScore = containsScore;
          bestMatch = venue;
          matchReason = 'contains_match';
        }
      } else if (normalizedVenue.includes(normalizedExtracted) && normalizedExtracted.length >= 3) {
        const containsScore = 0.85;
        if (containsScore > bestScore) {
          bestScore = containsScore;
          bestMatch = venue;
          matchReason = 'contained_in_match';
        }
      }
      
      // === FUZZY MATCH ===
      const similarity = stringSimilarity.compareTwoStrings(normalizedExtracted, normalizedVenue);
      if (similarity > bestScore && similarity >= VENUE_MATCH_THRESHOLD) {
        bestScore = similarity;
        bestMatch = venue;
        matchReason = 'fuzzy_match';
      }
    }
  }
  
  // Check if match is good enough
  if (bestMatch && bestScore >= VENUE_MATCH_THRESHOLD) {
    console.log(`[VENUE] Matched: "${bestMatch.name}" (score: ${bestScore.toFixed(2)}, reason: ${matchReason})`);
    return {
      venueId: bestMatch.id,
      venueName: bestMatch.name,
      confidence: bestScore,
      matchReason,
      entityId: bestMatch.entityId
    };
  }
  
  console.log(`[VENUE] No match found (best score: ${bestScore.toFixed(2)})`);
  return { 
    venueId: null, 
    venueName: null, 
    confidence: bestScore, 
    matchReason: 'below_threshold' 
  };
};

/**
 * Match venue name to existing venues within an entity
 * Used when entity context is already known
 * 
 * @param {string} extractedName - Venue name from post
 * @param {string} entityId - Entity ID to search within
 * @returns {Object} { venueId, venueName, confidence, matchReason }
 */
const matchVenue = async (extractedName, entityId) => {
  if (!extractedName || !entityId) {
    return { venueId: null, venueName: null, confidence: 0, matchReason: 'no_input' };
  }
  
  // Get venues for this entity
  const venues = await queryVenuesByEntity(entityId);
  
  if (!venues || venues.length === 0) {
    return { venueId: null, venueName: null, confidence: 0, matchReason: 'no_venues' };
  }
  
  const normalizedExtracted = normalizeName(extractedName);
  let bestMatch = null;
  let bestScore = 0;
  let matchReason = null;
  
  for (const venue of venues) {
    const venueName = venue.name || venue.displayName || '';
    const venueAliases = venue.aliases || [];
    const venueShortName = venue.shortName || '';
    
    // All names to check for this venue (from database)
    const namesToCheck = [venueName, venueShortName, ...venueAliases].filter(Boolean);
    
    for (const nameToCheck of namesToCheck) {
      const normalizedVenue = normalizeName(nameToCheck);
      
      // Exact match
      if (normalizedExtracted === normalizedVenue) {
        return {
          venueId: venue.id,
          venueName: venueName,
          confidence: 1.0,
          matchReason: nameToCheck === venueName ? 'exact_name' : 
                       nameToCheck === venueShortName ? 'exact_shortName' : 'exact_alias'
        };
      }
      
      // Fuzzy match
      const similarity = stringSimilarity.compareTwoStrings(normalizedExtracted, normalizedVenue);
      if (similarity > bestScore && similarity >= VENUE_MATCH_THRESHOLD) {
        bestScore = similarity;
        bestMatch = venue;
        matchReason = nameToCheck === venueName ? 'fuzzy_name' : 
                      nameToCheck === venueShortName ? 'fuzzy_shortName' : 'fuzzy_alias';
      }
    }
  }
  
  // Check if match is good enough
  if (bestMatch && bestScore >= VENUE_MATCH_THRESHOLD) {
    return {
      venueId: bestMatch.id,
      venueName: bestMatch.name || bestMatch.displayName,
      confidence: bestScore,
      matchReason
    };
  }
  
  return { venueId: null, venueName: null, confidence: bestScore, matchReason: 'below_threshold' };
};

/**
 * Get venue from social account
 * Social accounts are often linked to specific venues
 * 
 * @param {Object} socialAccount - Social account record
 * @returns {Object|null} Venue or null
 */
const getVenueFromSocialAccount = async (socialAccount) => {
  if (!socialAccount) return null;
  
  if (socialAccount.venueId) {
    const venue = await getVenue(socialAccount.venueId);
    return venue;
  }
  
  return null;
};

/**
 * Clear venue cache (useful for testing or after venue updates)
 */
const clearVenueCache = () => {
  venueCache = null;
  venueCacheTimestamp = 0;
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  matchVenue,
  matchVenueFromContent,
  normalizeName,
  getVenueFromSocialAccount,
  clearVenueCache,
  getVenuesWithCache,
  VENUE_MATCH_THRESHOLD,
  VENUE_STRONG_MATCH,
  VENUE_AUTO_ASSIGN_THRESHOLD
};