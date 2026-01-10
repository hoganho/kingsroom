/**
 * satellite-resolver.js
 * 
 * Satellite game detection and series linking
 * 
 * Detects if a game is a satellite tournament and attempts to link it
 * to its target series/event. This helps separate satellites from
 * regular/recurring games and enables series impact analysis.
 * 
 * DETECTION PATTERNS:
 * 1. Name keywords: "satellite", "satty", "sat "
 * 2. Seat allocations: "X seat(s) GTD", "X seats guaranteed", "X packages"
 * 3. Ratio patterns: "1 in X", "X per Y entries"
 * 4. tournamentType already set to "SATELLITE"
 * 
 * TARGET EXTRACTION:
 * - Extracts target event name from satellite game name
 * - Matches against TournamentSeries for linking
 * 
 * Location: amplify/backend/function/gameDataEnricher/src/resolution/satellite-resolver.js
 */

const stringSimilarity = require('string-similarity');
const { getDocClient, getTableName, QueryCommand, ScanCommand } = require('../utils/db-client');

// ===================================================================
// SATELLITE DETECTION PATTERNS
// ===================================================================

/**
 * Patterns that indicate a game is a satellite
 */
const SATELLITE_NAME_PATTERNS = [
  // Direct satellite keywords
  /\bsatellite\b/i,
  /\bsatty\b/i,
  /\bsat\b(?!\w)/i,         // "sat" but not "saturday"
  /\bsats\b/i,
  /\bqualifier\b/i,
  /\bstep\s*\d+\b/i,        // Step tournaments (step 1, step 2)
  
  // Seat allocation patterns
  /\d+\s*x?\s*seat/i,       // "2 seats", "2x seat", "5 seats"
  /seat\s*(?:per|every)\s*\d+/i,  // "seat per 10", "seat every 8"
  /\d+\s*packages?\s*(?:gtd|guaranteed)?/i,  // "4 packages GTD"
  
  // Ratio patterns
  /\b1\s*(?:in|per)\s*\d+\b/i,    // "1 in 6", "1 per 10"
  /\d+\s*(?:in|per)\s*\d+\b/i,    // "1 in 8", "2 in 10"
  
  // Target event indicators (when combined with other patterns)
  /\binto\s+(?:the\s+)?(?:main|me|event)/i,  // "into the main event"
  /\bfor\s+(?:the\s+)?(?:main|me|event)/i,   // "for the main event"
];

/**
 * Patterns to extract seat information
 */
const SEAT_EXTRACTION_PATTERNS = [
  // "X seats GTD", "X seats guaranteed"
  { pattern: /(\d+)\s*(?:x\s*)?seats?\s*(?:gtd|guaranteed)/i, group: 1 },
  // "X packages GTD"
  { pattern: /(\d+)\s*packages?\s*(?:gtd|guaranteed)?/i, group: 1 },
  // "1 seat per X entries"
  { pattern: /1\s*seat\s*(?:per|every)\s*(\d+)/i, group: 1, isRatio: true },
  // "1 in X"
  { pattern: /\b1\s*(?:in|per)\s*(\d+)\b/i, group: 1, isRatio: true },
  // "X in Y" (e.g., "3 in 10")
  { pattern: /(\d+)\s*(?:in|per)\s*(\d+)\b/i, groups: [1, 2], isRatio: true },
];

/**
 * Known target event/series name mappings
 * These help extract the target series from satellite names
 */
const TARGET_SERIES_ALIASES = {
  // Colossus variants
  'colossus': ['colossus', 'colosus', 'collossus', 'collosus'],
  'colossus series': ['colossus series', 'colosus series'],
  
  // Sydney Millions
  'sydney millions': ['sydney millions', 'sm', 'sm me', 'syd millions', 'sydney mill'],
  
  // Kings Room events
  'kings room championship': ['kings room champs', 'krc', 'kings room championship', 'kings champs', 'kr champs'],
  'kings room champs': ['kings room champs', 'krc'],
  
  // Signature Series
  'signature series': ['signature', 'sig series', 'kings sig'],
  
  // Behemoth
  'behemoth': ['behemoth', 'behomoth'],
  
  // Players Championship
  'players championship': ['players champs', 'players championship', 'player champs'],
  
  // Dragon Lunar
  'dragon lunar': ['dragon lunar', 'dragon', 'lunar'],
  
  // Highroller
  'highroller': ['highroller', 'high roller', 'hr', 'hi roller'],
  
  // Main Event (generic)
  'main event': ['main event', 'me', 'main'],
  
  // Mini Main
  'mini main': ['mini main', 'mini me'],
};

/**
 * Patterns to extract target event name from satellite name
 */
const TARGET_EXTRACTION_PATTERNS = [
  // "X Satty" - extract what comes before
  /^(.+?)\s+sat(?:ty|ellite|s)?\b/i,
  
  // "X Satellite" - extract what comes before
  /^(.+?)\s+satellite\b/i,
  
  // "Satty for X" - extract what comes after
  /sat(?:ty|ellite)?\s+(?:for|to|into)\s+(.+?)(?:\s*[-–]\s*|\s*$)/i,
  
  // "X seat(s) into Y"
  /\d+\s*seats?\s*(?:into|for|to)\s+(?:the\s+)?(.+?)(?:\s*[-–]\s*|\s*$)/i,
  
  // After "ME" or "Main Event" keyword - extract what comes before
  /^(.+?)\s+(?:me|main\s*event)\s+sat/i,
  
  // "X + Players Satty" pattern
  /^(.+?)\s*\+?\s*players?\s+sat/i,
];

// ===================================================================
// DETECTION FUNCTIONS
// ===================================================================

/**
 * Detect if a game is a satellite tournament
 * 
 * @param {Object} game - Game data
 * @returns {Object} { isSatellite, confidence, matchReason, patterns }
 */
const detectSatellite = (game) => {
  const result = {
    isSatellite: false,
    confidence: 0,
    matchReason: null,
    matchedPatterns: [],
    satelliteType: null,  // SATELLITE, MEGA_SATELLITE, SUPER_SATELLITE, QUALIFIER
    seatsAwarded: null,
    seatRatio: null
  };
  
  // Check if already marked as satellite by tournamentType
  if (game.tournamentType === 'SATELLITE') {
    result.isSatellite = true;
    result.confidence = 0.95;
    result.matchReason = 'tournamentType_satellite';
    result.matchedPatterns.push('tournamentType=SATELLITE');
    result.satelliteType = 'SATELLITE';
  }
  
  // Check name patterns
  const gameName = game.name || '';
  
  for (const pattern of SATELLITE_NAME_PATTERNS) {
    if (pattern.test(gameName)) {
      result.isSatellite = true;
      result.matchedPatterns.push(pattern.toString());
      
      // Set confidence based on pattern specificity
      if (/satellite/i.test(gameName)) {
        result.confidence = Math.max(result.confidence, 0.95);
        result.matchReason = result.matchReason || 'name_contains_satellite';
      } else if (/satty/i.test(gameName)) {
        result.confidence = Math.max(result.confidence, 0.90);
        result.matchReason = result.matchReason || 'name_contains_satty';
      } else if (/\d+\s*seats?\s*(?:gtd|guaranteed)/i.test(gameName)) {
        result.confidence = Math.max(result.confidence, 0.85);
        result.matchReason = result.matchReason || 'name_contains_seats_gtd';
      } else if (/qualifier/i.test(gameName)) {
        result.confidence = Math.max(result.confidence, 0.90);
        result.matchReason = result.matchReason || 'name_contains_qualifier';
        result.satelliteType = 'QUALIFIER';
      } else if (/step\s*\d+/i.test(gameName)) {
        result.confidence = Math.max(result.confidence, 0.85);
        result.matchReason = result.matchReason || 'name_contains_step';
        result.satelliteType = 'STEP_SATELLITE';
      } else {
        result.confidence = Math.max(result.confidence, 0.75);
        result.matchReason = result.matchReason || 'name_pattern_match';
      }
    }
  }
  
  // Extract seat information
  for (const { pattern, group, groups, isRatio } of SEAT_EXTRACTION_PATTERNS) {
    const match = gameName.match(pattern);
    if (match) {
      if (isRatio) {
        if (groups) {
          result.seatRatio = { winners: parseInt(match[groups[0]]), per: parseInt(match[groups[1]]) };
        } else {
          result.seatRatio = { winners: 1, per: parseInt(match[group]) };
        }
      } else {
        result.seatsAwarded = parseInt(match[group]);
      }
    }
  }
  
  // Determine satellite type based on seats
  if (result.seatsAwarded && !result.satelliteType) {
    if (result.seatsAwarded >= 10) {
      result.satelliteType = 'MEGA_SATELLITE';
    } else if (result.seatsAwarded >= 5) {
      result.satelliteType = 'SUPER_SATELLITE';
    } else {
      result.satelliteType = 'SATELLITE';
    }
  }
  
  return result;
};

/**
 * Extract the target event/series name from a satellite game name
 * 
 * @param {string} gameName - Satellite game name
 * @returns {Object} { targetName, normalizedName, confidence }
 */
const extractTargetFromName = (gameName) => {
  if (!gameName) return null;
  
  let targetName = null;
  let confidence = 0;
  
  // First, try known aliases
  const lowerName = gameName.toLowerCase();
  for (const [canonicalName, aliases] of Object.entries(TARGET_SERIES_ALIASES)) {
    for (const alias of aliases) {
      if (lowerName.includes(alias)) {
        // Find the actual case from the original name
        const aliasRegex = new RegExp(alias.replace(/\s+/g, '\\s+'), 'i');
        const match = gameName.match(aliasRegex);
        if (match) {
          targetName = canonicalName;
          confidence = 0.9;
          break;
        }
      }
    }
    if (targetName) break;
  }
  
  // If no known alias, try extraction patterns
  if (!targetName) {
    for (const pattern of TARGET_EXTRACTION_PATTERNS) {
      const match = gameName.match(pattern);
      if (match && match[1]) {
        targetName = cleanTargetName(match[1]);
        confidence = 0.7;
        break;
      }
    }
  }
  
  if (!targetName) return null;
  
  // Normalize the target name
  const normalizedName = normalizeTargetName(targetName);
  
  return {
    targetName,
    normalizedName,
    confidence
  };
};

/**
 * Clean extracted target name
 */
const cleanTargetName = (name) => {
  if (!name) return '';
  
  return name
    // Remove common suffixes
    .replace(/\s*[-–]\s*\d+\s*seats?\s*gtd.*/i, '')
    .replace(/\s*\(\d+.*?\)$/i, '')
    .replace(/\s+(?:re-?entr(?:y|ies)|rebuy|freezeout).*$/i, '')
    // Remove dates
    .replace(/\s+\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g, '')
    // Remove dollar amounts
    .replace(/\s*\$[\d,]+k?/gi, '')
    // Clean whitespace
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Normalize target name for matching
 */
const normalizeTargetName = (name) => {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
};

// ===================================================================
// SERIES MATCHING
// ===================================================================

/**
 * Find matching TournamentSeries for a satellite's target
 * 
 * @param {string} targetName - Extracted target name
 * @param {string} venueId - Venue ID for filtering
 * @param {Date} gameDate - Game date for temporal matching
 * @returns {Object|null} Matched series or null
 */
const findTargetSeries = async (targetName, venueId, gameDate) => {
  if (!targetName) return null;
  
  const normalizedTarget = normalizeTargetName(targetName);
  const client = getDocClient();
  const tableName = getTableName('TournamentSeries');
  
  try {
    // Get series for the venue (or all if no venue filter)
    const params = {
      TableName: tableName
    };
    
    // If we have a venue, filter by it
    if (venueId) {
      params.FilterExpression = 'venueId = :vid';
      params.ExpressionAttributeValues = { ':vid': venueId };
    }
    
    const result = await client.send(new ScanCommand(params));
    const series = result.Items || [];
    
    if (series.length === 0) return null;
    
    // Score each series
    const scored = series.map(s => {
      const normalizedSeriesName = normalizeTargetName(s.name || '');
      
      // Calculate name similarity
      const similarity = stringSimilarity.compareTwoStrings(normalizedTarget, normalizedSeriesName);
      
      // Check for substring match
      const substringMatch = normalizedSeriesName.includes(normalizedTarget) || 
                            normalizedTarget.includes(normalizedSeriesName);
      
      // Check alias matches
      let aliasMatch = false;
      for (const [canonical, aliases] of Object.entries(TARGET_SERIES_ALIASES)) {
        if (aliases.some(a => normalizedTarget.includes(a))) {
          if (normalizedSeriesName.includes(normalizeTargetName(canonical)) ||
              aliases.some(a => normalizedSeriesName.includes(a))) {
            aliasMatch = true;
            break;
          }
        }
      }
      
      // Calculate temporal proximity (satellites should be before/during series)
      let temporalScore = 0;
      if (gameDate && s.startDate) {
        const seriesStart = new Date(s.startDate);
        const daysBefore = (seriesStart - gameDate) / (1000 * 60 * 60 * 24);
        
        // Satellites typically run 0-60 days before series start
        if (daysBefore >= -7 && daysBefore <= 60) {
          temporalScore = 0.2;
        } else if (daysBefore > 60 && daysBefore <= 120) {
          temporalScore = 0.1;
        }
      }
      
      // Calculate total score
      let score = similarity;
      if (substringMatch) score += 0.2;
      if (aliasMatch) score += 0.3;
      score += temporalScore;
      
      return {
        series: s,
        score,
        similarity,
        substringMatch,
        aliasMatch,
        temporalScore
      };
    });
    
    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);
    
    // Return best match if score is above threshold
    const best = scored[0];
    if (best && best.score >= 0.6) {
      console.log(`[SATELLITE] Found target series: "${best.series.name}" (score: ${best.score.toFixed(2)})`);
      return {
        series: best.series,
        confidence: Math.min(best.score, 1.0),
        matchDetails: {
          similarity: best.similarity,
          substringMatch: best.substringMatch,
          aliasMatch: best.aliasMatch,
          temporalScore: best.temporalScore
        }
      };
    }
    
    return null;
    
  } catch (error) {
    console.error('[SATELLITE] Error finding target series:', error);
    return null;
  }
};

// ===================================================================
// MAIN RESOLVER
// ===================================================================

/**
 * Resolve satellite status and target series for a game
 * 
 * @param {Object} params - Resolution parameters
 * @param {Object} params.game - Game data
 * @param {string} params.venueId - Venue ID
 * @param {boolean} params.autoLink - Whether to auto-link to target series (default: true)
 * @returns {Object} Resolution result with gameUpdates and metadata
 */
const resolveSatellite = async ({ game, venueId, autoLink = true }) => {
  const startTime = Date.now();
  
  // Step 1: Detect if this is a satellite
  const detection = detectSatellite(game);
  
  if (!detection.isSatellite) {
    return {
      gameUpdates: {
        isSatellite: false
      },
      metadata: {
        status: 'NOT_SATELLITE',
        processingTimeMs: Date.now() - startTime
      }
    };
  }
  
  console.log(`[SATELLITE] Detected satellite: "${game.name}" (${detection.matchReason})`);
  
  // Step 2: Extract target event/series
  const target = extractTargetFromName(game.name);
  
  // Step 3: Try to find matching series
  let seriesMatch = null;
  if (target && autoLink) {
    const gameDate = game.gameStartDateTime ? new Date(game.gameStartDateTime) : null;
    seriesMatch = await findTargetSeries(target.targetName, venueId, gameDate);
  }
  
  // Build game updates - ONLY satellite-specific fields
  // Series assignment is handled by series-resolver, not here
  const gameUpdates = {
    isSatellite: true,
    tournamentPurpose: detection.satelliteType || 'SATELLITE'
  };
  
  // Add seat information if extracted
  if (detection.seatsAwarded) {
    gameUpdates.satelliteSeatsAwarded = detection.seatsAwarded;
  }
  if (detection.seatRatio) {
    gameUpdates.satelliteSeatRatio = JSON.stringify(detection.seatRatio);
  }
  
  // Add target series link if found
  // NOTE: This is the TARGET series (what the satellite feeds INTO)
  // This is DIFFERENT from tournamentSeriesId (what series this game is PART OF)
  // A satellite can be PART OF "Colossus Series" AND feed INTO "Colossus Main Event"
  if (seriesMatch) {
    gameUpdates.satelliteTargetSeriesId = seriesMatch.series.id;
    gameUpdates.satelliteTargetSeriesName = seriesMatch.series.name;
    gameUpdates.satelliteTargetConfidence = seriesMatch.confidence;
  } else if (target) {
    // Store suggested target for manual review
    gameUpdates.suggestedSatelliteTarget = target.targetName;
  }
  
  // Build metadata
  const metadata = {
    status: seriesMatch ? 'LINKED_TO_SERIES' : (target ? 'TARGET_EXTRACTED' : 'DETECTED_NO_TARGET'),
    detection,
    extractedTarget: target,
    linkedSeries: seriesMatch ? {
      seriesId: seriesMatch.series.id,
      seriesName: seriesMatch.series.name,
      confidence: seriesMatch.confidence,
      matchDetails: seriesMatch.matchDetails
    } : null,
    processingTimeMs: Date.now() - startTime
  };
  
  console.log(`[SATELLITE] Resolution complete:`, {
    isSatellite: true,
    target: target?.targetName || 'none',
    linkedSeries: seriesMatch?.series.name || 'none',
    confidence: seriesMatch?.confidence || 0
  });
  
  return {
    gameUpdates,
    metadata
  };
};

/**
 * Batch detect satellites in a list of games (for bulk processing)
 * Does not do database lookups - just detection
 * 
 * @param {Array} games - Array of game objects
 * @returns {Array} Array of { game, detection } results
 */
const batchDetectSatellites = (games) => {
  return games.map(game => ({
    game,
    detection: detectSatellite(game),
    extractedTarget: extractTargetFromName(game.name)
  }));
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  // Main resolver
  resolveSatellite,
  
  // Detection functions
  detectSatellite,
  extractTargetFromName,
  batchDetectSatellites,
  
  // Series matching
  findTargetSeries,
  
  // Utility functions
  cleanTargetName,
  normalizeTargetName,
  
  // Constants for external use
  SATELLITE_NAME_PATTERNS,
  TARGET_SERIES_ALIASES,
  SEAT_EXTRACTION_PATTERNS
};
