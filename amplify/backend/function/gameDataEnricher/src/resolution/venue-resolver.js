/**
 * venue-resolver.js
 * Venue resolution for games
 */

const { getDocClient, getTableName, GetCommand } = require('../utils/db-client');

// ===================================================================
// MAIN RESOLVER
// ===================================================================

/**
 * Resolve venue assignment for a game
 * 
 * This is simpler than series/recurring resolution because:
 * 1. venueId is often already provided from the scraper
 * 2. Venue matching happens in the scraper (pattern matching on HTML)
 * 3. This just validates and sets the status
 * 
 * @param {Object} venueInput - Venue input from enrichment request
 * @param {string} entityId - Entity ID for context
 * @returns {Object} { venueId, status, confidence, matchReason }
 */
const resolveVenue = async (venueInput, entityId) => {
  // If venueId already provided, just validate it exists
  if (venueInput?.venueId) {
    const venue = await validateVenueExists(venueInput.venueId);
    
    if (venue) {
      return {
        venueId: venueInput.venueId,
        venueName: venue.name,
        status: venueInput.assignmentStatus || 'MANUALLY_ASSIGNED',
        confidence: venueInput.confidence || 1.0,
        matchReason: 'provided_id'
      };
    } else {
      console.warn(`[VENUE] Provided venueId ${venueInput.venueId} not found in database`);
      return {
        venueId: null,
        status: 'PENDING_ASSIGNMENT',
        confidence: 0,
        matchReason: 'invalid_venue_id'
      };
    }
  }
  
  // If suggested venue from scraper match
  if (venueInput?.suggestedVenueId) {
    const venue = await validateVenueExists(venueInput.suggestedVenueId);
    
    if (venue) {
      const confidence = venueInput.confidence || 0.8;
      
      // High confidence - auto assign
      if (confidence >= 0.8) {
        return {
          venueId: venueInput.suggestedVenueId,
          venueName: venue.name,
          status: 'AUTO_ASSIGNED',
          confidence,
          matchReason: 'scraper_suggestion'
        };
      }
      
      // Lower confidence - pending
      return {
        venueId: venueInput.suggestedVenueId,
        venueName: venue.name,
        status: 'PENDING_ASSIGNMENT',
        confidence,
        matchReason: 'low_confidence_suggestion'
      };
    }
  }
  
  // No venue info - pending assignment
  return {
    venueId: null,
    venueName: venueInput?.venueName || null,
    status: 'PENDING_ASSIGNMENT',
    confidence: 0,
    matchReason: 'no_venue_info',
    suggestedVenueName: venueInput?.venueName
  };
};

/**
 * Validate that a venue exists in the database
 */
const validateVenueExists = async (venueId) => {
  if (!venueId) return null;
  
  const client = getDocClient();
  const tableName = getTableName('Venue');
  
  try {
    const result = await client.send(new GetCommand({
      TableName: tableName,
      Key: { id: venueId }
    }));
    return result.Item || null;
  } catch (error) {
    console.error('[VENUE] Error validating venue:', error);
    return null;
  }
};

/**
 * Get venue fee for a venue (to populate on game)
 */
const getVenueFee = async (venueId) => {
  if (!venueId) return null;
  
  const venue = await validateVenueExists(venueId);
  return venue?.fee || null;
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  resolveVenue,
  validateVenueExists,
  getVenueFee
};
