/**
 * ===================================================================
 * Venue Matcher
 * ===================================================================
 * 
 * Matches tournament names to venues using exact matching and
 * fuzzy string similarity.
 * 
 * ===================================================================
 */

const stringSimilarity = require('string-similarity');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName } = require('../config/tables');
const { AUTO_ASSIGN_THRESHOLD, SUGGEST_THRESHOLD } = require('../config/constants');

/**
 * Clean name for matching - removes jargon and non-essential text
 * 
 * @param {string} name - Name to clean
 * @param {array} seriesTitles - Series titles to remove from venue matching
 * @returns {string} Cleaned name
 */
const cleanupNameForVenueMatching = (name, seriesTitles = []) => {
    if (!name) return '';
    
    let cleanedName = ` ${name.replace(/[^a-zA-Z0-9\s]/g, '')} `;
    
    // Remove poker jargon
    const jargonRegexes = [
        /\b(Event|Flight|Day)\s+[a-zA-Z0-9]*\d[a-zA-Z0-9]*\b/gi,
        /\bMain Event\b/gi,
        /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi,
    ];
    
    jargonRegexes.forEach(regex => {
        cleanedName = cleanedName.replace(regex, ' ');
    });
    
    // Remove series names when matching venues
    seriesTitles.forEach(series => {
        [series.title, ...(series.aliases || [])].forEach(seriesName => {
            const cleanedSeriesName = seriesName.replace(/[^a-zA-Z0-9\s]/g, '');
            cleanedName = cleanedName.replace(new RegExp(`\\b${cleanedSeriesName}\\b`, 'gi'), ' ');
        });
    });
    
    return cleanedName.replace(/\s+/g, ' ').trim();
};

/**
 * Get all venues from database
 * 
 * @param {object} context - Shared context with ddbDocClient
 * @returns {array} Array of venue objects
 */
const getAllVenues = async (context) => {
    const { ddbDocClient } = context;
    
    try {
        const venueTable = getTableName('Venue');
        const result = await ddbDocClient.send(new ScanCommand({
            TableName: venueTable,
            ProjectionExpression: 'id, #name, aliases, city, #state',
            ExpressionAttributeNames: {
                '#name': 'name',
                '#state': 'state'
            }
        }));
        
        return result.Items || [];
        
    } catch (error) {
        console.error('[VenueMatcher] Error fetching venues:', error);
        return [];
    }
};

/**
 * Match a tournament name to a venue
 * Uses exact matching first, then fuzzy matching
 * 
 * @param {string} gameName - Tournament name to match
 * @param {array} venues - Array of venue objects
 * @param {array} seriesTitles - Series titles for cleanup
 * @returns {object} Match result
 */
const matchVenue = (gameName, venues = [], seriesTitles = []) => {
    const result = {
        autoAssignedVenue: null,
        suggestions: [],
        extractedVenueName: gameName,
        matchingFailed: true
    };
    
    if (!gameName) return result;
    
    if (!venues || venues.length === 0) {
        return result;
    }
    
    const upperCaseGameName = gameName.toUpperCase();
    
    // Step 1: Exact matching (venue name or alias found in game name)
    for (const venue of venues) {
        const namesToCheck = [venue.name, ...(venue.aliases || [])];
        
        for (const venueName of namesToCheck) {
            if (upperCaseGameName.includes(venueName.toUpperCase())) {
                console.log(`[VenueMatcher] Exact match: "${venue.name}"`);
                
                return {
                    autoAssignedVenue: { id: venue.id, name: venue.name, score: 1.0 },
                    suggestions: [{ id: venue.id, name: venue.name, score: 1.0 }],
                    extractedVenueName: gameName,
                    matchingFailed: false
                };
            }
        }
    }
    
    // Step 2: Fuzzy matching
    const cleanedScrapedName = cleanupNameForVenueMatching(gameName, seriesTitles);
    
    // Build list of all venue names to match against
    const allNamesToMatch = venues.flatMap(venue =>
        [venue.name, ...(venue.aliases || [])].map(name => ({
            venueId: venue.id,
            venueName: venue.name,
            matchName: name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
        }))
    );
    
    const { ratings } = stringSimilarity.findBestMatch(
        cleanedScrapedName,
        allNamesToMatch.map(item => item.matchName)
    );
    
    // Group by venue and keep best score per venue
    const bestScoresByVenue = new Map();
    
    ratings.forEach((rating, index) => {
        const { venueId, venueName } = allNamesToMatch[index];
        if (!bestScoresByVenue.has(venueId) || rating.rating > bestScoresByVenue.get(venueId).score) {
            bestScoresByVenue.set(venueId, { id: venueId, name: venueName, score: rating.rating });
        }
    });
    
    // Sort by score and take top 3
    const sortedSuggestions = Array.from(bestScoresByVenue.values())
        .sort((a, b) => b.score - a.score)
        .filter(v => v.score > SUGGEST_THRESHOLD)
        .slice(0, 3);
    
    if (sortedSuggestions.length > 0) {
        const autoAssignedVenue = sortedSuggestions[0].score >= AUTO_ASSIGN_THRESHOLD 
            ? sortedSuggestions[0] 
            : null;
        
        if (autoAssignedVenue) {
            console.log(`[VenueMatcher] Fuzzy match: "${autoAssignedVenue.name}" (score: ${autoAssignedVenue.score.toFixed(2)})`);
        }
        
        return {
            autoAssignedVenue,
            suggestions: sortedSuggestions,
            extractedVenueName: gameName,
            matchingFailed: autoAssignedVenue === null
        };
    }
    
    // Step 3: Pattern matching (fallback for known venues)
    const venuePatterns = [
        { pattern: /The Star/i, venue: 'The Star' },
        { pattern: /Crown/i, venue: 'Crown' },
        { pattern: /Sky City/i, venue: 'Sky City' },
        { pattern: /Treasury/i, venue: 'Treasury' },
        { pattern: /Reef/i, venue: 'The Reef' }
    ];
    
    for (const { pattern, venue } of venuePatterns) {
        if (pattern.test(gameName)) {
            console.log(`[VenueMatcher] Pattern match: "${venue}"`);
            return {
                autoAssignedVenue: null,
                suggestions: [{ id: null, name: venue, score: 0.6 }],
                extractedVenueName: gameName,
                matchingFailed: true
            };
        }
    }
    
    return result;
};

/**
 * Get venue match result for a tournament name
 * High-level function that combines matching with context
 * 
 * @param {string} gameName - Tournament name
 * @param {array} venues - Venues array
 * @param {array} seriesTitles - Series titles for cleanup
 * @returns {object} Venue match result
 */
const getMatchingVenue = (gameName, venues = [], seriesTitles = []) => {
    return matchVenue(gameName, venues, seriesTitles);
};

module.exports = {
    getAllVenues,
    matchVenue,
    getMatchingVenue,
    cleanupNameForVenueMatching
};
