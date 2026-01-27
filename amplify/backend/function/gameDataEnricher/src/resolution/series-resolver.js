/**
 * series-resolver.js (ENHANCED v2.0)
 * 
 * MAJOR FIX: Proper series consolidation - all events in a series now share
 * ONE TournamentSeriesTitle and ONE TournamentSeries (per year).
 * 
 * KEY CHANGES:
 * 1. NEW: extractBaseSeriesName() - Extracts core series name from full tournament name
 *    - "CNY Lunar Series Event 4 - Mini Main" → "CNY Lunar Series"
 *    - "Kings Cup Event 10: MAIN EVENT Flight 1D" → "Kings Cup"
 * 
 * 2. ENHANCED: normalizeSeriesName() - Now uses base series extraction
 * 
 * 3. ENHANCED: findExistingSeriesTitle() - Uses base name for matching with lower threshold
 * 
 * 4. FIX: Explicit series names in tournament names now take priority over
 *    date-based holiday detection (e.g., "CNY Lunar Series" won't become "Valentine's Day Series")
 * 
 * 5. ENHANCED: resolveSeriesFromName() - Uses extracted base name for Title lookup
 * 
 * Location: amplify/backend/function/gameDataEnricher/src/resolution/series-resolver.js
 */

'use strict';

const { v4: uuidv4 } = require('uuid');
const stringSimilarity = require('string-similarity');
const { getDocClient, getTableName, QueryCommand, GetCommand, PutCommand, UpdateCommand, ScanCommand } = require('../utils/db-client');
const { 
  SERIES_KEYWORDS, 
  STRUCTURE_KEYWORDS, 
  HOLIDAY_PATTERNS, 
  VALIDATION_THRESHOLDS,
  detectHolidayFromName,
  detectHolidayFromDate,
  detectHoliday,
  getHolidayKeywords
} = require('../utils/constants');

// Series match threshold for fuzzy matching
const SERIES_MATCH_THRESHOLD = 0.7;

// Lower threshold for base series name matching (more lenient)
const BASE_SERIES_MATCH_THRESHOLD = 0.75;

// ===================================================================
// NEW: BASE SERIES NAME EXTRACTION
// ===================================================================

/**
 * Known series name patterns - these are recognized series "brands"
 * that should be extracted as the base name.
 * 
 * Order matters: more specific patterns first
 */
const KNOWN_SERIES_PATTERNS = [
  // Specific named series (add your venue-specific ones here)
  /\b(CNY\s+Lunar\s+Series)\b/i,
  /\b(Dragon\s+Lunar)\b/i,
  /\b(Kings?\s+Cup)\b/i,
  /\b(Sydney\s+Millions)\b/i,
  /\b(Colossus\s+Series)\b/i,
  /\b(Signature\s+Series)\b/i,
  /\b(Super\s+Series)\b/i,
  /\b(Kings?\s+Birthday\s+Series)\b/i,
  /\b(Melbourne\s+Cup\s+Series)\b/i,
  /\b(Easter\s+Series)\b/i,
  /\b(Christmas\s+Series)\b/i,
  /\b(Anzac\s+Day\s+Series)\b/i,
  /\b(Australia\s+Day\s+Series)\b/i,
  /\b(New\s+Years?\s+Series)\b/i,
  /\b(Valentines?\s+Day\s+Series)\b/i,
  /\b(Mothers?\s+Day\s+Series)\b/i,
  /\b(Fathers?\s+Day\s+Series)\b/i,
  /\b(Labour\s+Day\s+Series)\b/i,
  /\b(St\.?\s*Patricks?\s+Day\s+Series)\b/i,
  /\b(Public\s+Holiday\s+Events?)\b/i,
  
  // Major poker tours
  /\b(WSOP(?:\s+Circuit)?)\b/i,
  /\b(WPT)\b/i,
  /\b(EPT)\b/i,
  /\b(APT)\b/i,
  /\b(ANZPT)\b/i,
  /\b(APPT)\b/i,
  
  // Generic series patterns (last resort)
  /\b(\w+(?:\s+\w+)?\s+Championship(?:\s+Series)?)\b/i,
  /\b(\w+(?:\s+\w+)?\s+Festival)\b/i,
  /\b(\w+(?:\s+\w+)?\s+Classic)\b/i,
];

/**
 * Extract the base series name from a full tournament name.
 * 
 * This is the KEY function for proper series consolidation.
 * It strips event-specific details (event numbers, flight letters, buy-ins, etc.)
 * to get the core series name.
 * 
 * Examples:
 * - "CNY Lunar Series Event 4 - Mini Main" → "CNY Lunar Series"
 * - "Kings Cup Event 10: MAIN EVENT Flight 1D" → "Kings Cup"
 * - "Sydney Millions Event 1: Colossus Flight 1C" → "Sydney Millions"
 * - "Colossus Series Friday Mega Satty" → "Colossus Series"
 * - "Signature Series Event 15: Short Deck" → "Signature Series"
 * 
 * @param {string} tournamentName - Full tournament name
 * @returns {{ baseName: string, confidence: number, extractionMethod: string, eventDetails: object }}
 */
const extractBaseSeriesName = (tournamentName) => {
  if (!tournamentName) {
    return { baseName: null, confidence: 0, extractionMethod: 'NONE', eventDetails: {} };
  }
  
  const name = tournamentName.trim();
  const eventDetails = {};
  
  // ===== METHOD 1: Known series pattern matching (highest confidence) =====
  for (const pattern of KNOWN_SERIES_PATTERNS) {
    const match = name.match(pattern);
    if (match) {
      const baseName = match[1].trim();
      
      // Extract event details from the remainder
      const remainder = name.replace(match[0], '').trim();
      Object.assign(eventDetails, extractEventDetailsFromRemainder(remainder));
      
      console.log(`[SERIES] Base name extracted via KNOWN_PATTERN: "${baseName}" from "${name}"`);
      return {
        baseName,
        confidence: 0.95,
        extractionMethod: 'KNOWN_PATTERN',
        eventDetails
      };
    }
  }
  
  // ===== METHOD 2: Event number pattern detection =====
  // Patterns like "X Event 4: Y" or "X Event 4 - Y"
  const eventPatterns = [
    // "Series Name Event 4: Description" or "Series Name Event 4 - Description"
    /^(.+?)\s+Event\s*#?\s*\d+\s*[:\-]\s*.+$/i,
    // "Series Name Event 4" (no description)
    /^(.+?)\s+Event\s*#?\s*\d+$/i,
    // "Series Name #4: Description"
    /^(.+?)\s+#\d+\s*[:\-]\s*.+$/i,
  ];
  
  for (const pattern of eventPatterns) {
    const match = name.match(pattern);
    if (match) {
      let baseName = match[1].trim();
      
      // Clean up the base name - remove trailing year if present
      baseName = baseName.replace(/\s+20[2-3]\d$/, '').trim();
      
      // Extract event number
      const eventNumMatch = name.match(/Event\s*#?\s*(\d+)/i);
      if (eventNumMatch) {
        eventDetails.eventNumber = parseInt(eventNumMatch[1]);
      }
      
      // Only accept if the base name contains series-related keywords or is substantial
      if (baseName.length >= 5 && (
        containsSeriesKeyword(baseName) || 
        baseName.split(/\s+/).length >= 2
      )) {
        console.log(`[SERIES] Base name extracted via EVENT_PATTERN: "${baseName}" from "${name}"`);
        return {
          baseName,
          confidence: 0.85,
          extractionMethod: 'EVENT_PATTERN',
          eventDetails
        };
      }
    }
  }
  
  // ===== METHOD 3: Series keyword extraction =====
  // Find series keywords and extract the phrase containing them
  const seriesKeywordPatterns = [
    /^(.+?\s+Series)\b/i,
    /^(.+?\s+Championship)\b/i,
    /^(.+?\s+Festival)\b/i,
    /^(.+?\s+Classic)\b/i,
    /^(.+?\s+Cup)\b/i,
    /^(.+?\s+Open)\b/i,
    /^(.+?\s+Tour)\b/i,
  ];
  
  for (const pattern of seriesKeywordPatterns) {
    const match = name.match(pattern);
    if (match) {
      let baseName = match[1].trim();
      
      // Clean up - remove year suffix
      baseName = baseName.replace(/\s+20[2-3]\d$/, '').trim();
      
      if (baseName.length >= 5) {
        console.log(`[SERIES] Base name extracted via KEYWORD_PATTERN: "${baseName}" from "${name}"`);
        return {
          baseName,
          confidence: 0.80,
          extractionMethod: 'KEYWORD_PATTERN',
          eventDetails
        };
      }
    }
  }
  
  // ===== METHOD 4: Fallback - strip common suffixes =====
  let baseName = name
    // Remove event number and description
    .replace(/\s+Event\s*#?\s*\d+\s*[:\-]?\s*.*/i, '')
    // Remove flight info
    .replace(/\s+Flight\s*\d*[A-Z]?\b.*/i, '')
    // Remove day info
    .replace(/\s+Day\s*\d+.*/i, '')
    // Remove "- Description" suffix
    .replace(/\s+[-–]\s+.+$/, '')
    // Remove GTD/Guaranteed amounts
    .replace(/\s+\$[\d,]+[kK]?\s*(GTD|Guaranteed).*/i, '')
    // Remove year
    .replace(/\s+20[2-3]\d$/, '')
    .trim();
  
  if (baseName && baseName.length >= 5) {
    console.log(`[SERIES] Base name extracted via FALLBACK: "${baseName}" from "${name}"`);
    return {
      baseName,
      confidence: 0.60,
      extractionMethod: 'FALLBACK',
      eventDetails
    };
  }
  
  // No extraction possible
  return {
    baseName: name,
    confidence: 0.30,
    extractionMethod: 'ORIGINAL',
    eventDetails
  };
};

/**
 * Extract event details (event number, flight, day, etc.) from the remainder
 * of a tournament name after removing the base series name.
 */
const extractEventDetailsFromRemainder = (remainder) => {
  const details = {};
  
  if (!remainder) return details;
  
  // Event number
  const eventMatch = remainder.match(/Event\s*#?\s*(\d+)/i);
  if (eventMatch) {
    details.eventNumber = parseInt(eventMatch[1]);
  }
  
  // Flight letter
  const flightMatch = remainder.match(/Flight\s*\d*([A-Z])/i) || remainder.match(/\b(\d[A-Z])\b/);
  if (flightMatch) {
    details.flightLetter = flightMatch[1].slice(-1).toUpperCase();
  }
  
  // Day number
  const dayMatch = remainder.match(/Day\s*(\d+)/i);
  if (dayMatch) {
    details.dayNumber = parseInt(dayMatch[1]);
  }
  
  // Main event indicator
  if (/\bMain\s*Event\b/i.test(remainder)) {
    details.isMainEvent = true;
  }
  
  // Mini main indicator  
  if (/\bMini\s*Main\b/i.test(remainder)) {
    details.isMiniMain = true;
  }
  
  return details;
};

/**
 * Check if a string contains any series-related keywords
 */
const containsSeriesKeyword = (str) => {
  if (!str) return false;
  const lower = str.toLowerCase();
  return SERIES_KEYWORDS.some(keyword => lower.includes(keyword));
};

// ===================================================================
// SERIES DETAIL EXTRACTION (existing, enhanced)
// ===================================================================

/**
 * Extract series details from tournament name
 * Parses dayNumber, flightLetter, eventNumber, isMainEvent, finalDay, seriesYear
 */
const extractSeriesDetails = (tournamentName) => {
  if (!tournamentName) return {};
  
  const details = {};
  
  // Extract year (2020-2029)
  const yearMatch = tournamentName.match(/20[2-3]\d/);
  if (yearMatch) {
    details.seriesYear = parseInt(yearMatch[0]);
  }
  
  // Detect main event
  details.isMainEvent = /\bmain\s*event\b/i.test(tournamentName);
  
  // Extract day number
  for (const pattern of [/\bDay\s*(\d+)/i, /\bD(\d+)\b/, /\b(\d+)[A-Z]\b/]) {
    const match = tournamentName.match(pattern);
    if (match) {
      details.dayNumber = parseInt(match[1]);
      break;
    }
  }
  
  // Extract flight letter
  for (const pattern of [/\bFlight\s*([A-Z])/i, /\b\d+([A-Z])\b/, /\b([A-Z])\b(?=\s*(?:Flight|Starting))/i]) {
    const match = tournamentName.match(pattern);
    if (match) {
      details.flightLetter = match[1].toUpperCase();
      break;
    }
  }
  
  // Extract event number
  for (const pattern of [/\bEvent\s*#?\s*(\d+)/i, /\bEv(?:ent)?\.?\s*#?\s*(\d+)/i, /\b#(\d+)\s*[-:]/i]) {
    const match = tournamentName.match(pattern);
    if (match) {
      details.eventNumber = parseInt(match[1]);
      break;
    }
  }
  
  // Detect final day
  if (/\bFinal\s*(Day|Table)?\b/i.test(tournamentName)) {
    details.dayNumber = details.dayNumber || 99;
    details.finalDay = true;
  }
  
  if (/\bFT\b/.test(tournamentName)) {
    details.finalDay = true;
  }
  
  // Day 2+ without flight letter typically means final day
  if (details.dayNumber && details.dayNumber >= 2 && !details.flightLetter) {
    if (!/Flight/i.test(tournamentName)) {
      details.finalDay = true;
    }
  }
  
  return details;
};

/**
 * Clean name for series matching - removes venue names and poker jargon
 */
const cleanupNameForSeriesMatching = (name, venues = []) => {
  if (!name) return '';
  
  let cleanedName = ` ${name.replace(/[^a-zA-Z0-9\s]/g, '')} `;
  
  // Remove poker jargon
  const jargonRegexes = [
    /\b(Event|Flight|Day)\s+[a-zA-Z0-9]*\d[a-zA-Z0-9]*\b/gi,
    /\bMain Event\b/gi,
    /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi,
    /\b\d+\s*x\s*Re-?entry\b/gi,
    /\$\d+[kK]?\s*(GTD|Guaranteed)?\b/gi,
  ];
  
  jargonRegexes.forEach(regex => {
    cleanedName = cleanedName.replace(regex, ' ');
  });
  
  // Remove venue names when matching series
  venues.forEach(venue => {
    [venue.name, ...(venue.aliases || [])].forEach(venueName => {
      const cleanedVenueName = venueName.replace(/[^a-zA-Z0-9\s]/g, '');
      cleanedName = cleanedName.replace(new RegExp(`\\b${cleanedVenueName}\\b`, 'gi'), ' ');
    });
  });
  
  return cleanedName.replace(/\s+/g, ' ').trim();
};

// ===================================================================
// DATABASE MATCHING (ENHANCED)
// ===================================================================

/**
 * Get all series titles from database
 */
const getAllSeriesTitles = async () => {
  const client = getDocClient();
  const tableName = getTableName('TournamentSeriesTitle');
  
  try {
    const result = await client.send(new ScanCommand({
      TableName: tableName,
      ProjectionExpression: 'id, title, aliases, seriesCategory'
    }));
    return result.Items || [];
  } catch (error) {
    console.error('[SERIES] Error fetching series titles:', error);
    return [];
  }
};

/**
 * Match tournament name against TournamentSeriesTitle database
 * 
 * ENHANCED: Now extracts base series name first for better matching
 */
const matchAgainstDatabase = (gameName, seriesTitles = [], venues = []) => {
  if (!gameName || !seriesTitles.length) return null;
  
  // First, extract the base series name
  const { baseName, confidence: extractionConfidence, extractionMethod } = extractBaseSeriesName(gameName);
  
  const namesToMatch = [gameName];
  if (baseName && baseName !== gameName) {
    namesToMatch.unshift(baseName); // Try base name first
  }
  
  for (const nameToMatch of namesToMatch) {
    const upperCaseName = nameToMatch.toUpperCase();
    
    // Step 1: Exact substring matching
    for (const series of seriesTitles) {
      const titlesToCheck = [series.title, ...(series.aliases || [])];
      
      for (const seriesName of titlesToCheck) {
        // Check if the series title is contained in the game name
        if (upperCaseName.includes(seriesName.toUpperCase())) {
          console.log(`[SERIES] Database exact match: "${series.title}" in "${gameName}"`);
          return {
            matched: true,
            seriesTitle: series.title,
            seriesTitleId: series.id,
            seriesCategory: series.seriesCategory || 'REGULAR',
            confidence: 1.0,
            matchType: 'DATABASE_EXACT',
            extractedBaseName: baseName
          };
        }
        
        // Also check if game name is contained in series title (for short game names)
        if (seriesName.toUpperCase().includes(upperCaseName) && nameToMatch.length >= 8) {
          console.log(`[SERIES] Database reverse match: "${series.title}" contains "${nameToMatch}"`);
          return {
            matched: true,
            seriesTitle: series.title,
            seriesTitleId: series.id,
            seriesCategory: series.seriesCategory || 'REGULAR',
            confidence: 0.95,
            matchType: 'DATABASE_REVERSE',
            extractedBaseName: baseName
          };
        }
      }
    }
  }
  
  // Step 2: Fuzzy matching using base name (more lenient threshold)
  if (baseName) {
    const cleanedBaseName = baseName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    
    const allNamesToMatch = seriesTitles.flatMap(series =>
      [series.title, ...(series.aliases || [])].map(name => ({
        seriesId: series.id,
        seriesTitle: series.title,
        seriesCategory: series.seriesCategory,
        matchName: name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
      }))
    );
    
    if (allNamesToMatch.length > 0) {
      const { bestMatch } = stringSimilarity.findBestMatch(
        cleanedBaseName,
        allNamesToMatch.map(s => s.matchName)
      );
      
      // Use lower threshold for base name matching
      if (bestMatch && bestMatch.rating >= BASE_SERIES_MATCH_THRESHOLD) {
        const matchedSeries = allNamesToMatch.find(s => s.matchName === bestMatch.target);
        
        if (matchedSeries) {
          console.log(`[SERIES] Database fuzzy match on base name: "${matchedSeries.seriesTitle}" (base: "${baseName}", score: ${bestMatch.rating.toFixed(2)})`);
          return {
            matched: true,
            seriesTitle: matchedSeries.seriesTitle,
            seriesTitleId: matchedSeries.seriesId,
            seriesCategory: matchedSeries.seriesCategory || 'REGULAR',
            confidence: bestMatch.rating,
            matchType: 'DATABASE_FUZZY_BASE',
            extractedBaseName: baseName
          };
        }
      }
    }
  }
  
  // Step 3: Fuzzy matching on cleaned full name (original behavior, fallback)
  const cleanedGameName = cleanupNameForSeriesMatching(gameName, venues);
  
  const allNamesToMatch = seriesTitles.flatMap(series =>
    [series.title, ...(series.aliases || [])].map(name => ({
      seriesId: series.id,
      seriesTitle: series.title,
      seriesCategory: series.seriesCategory,
      matchName: name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim().toLowerCase()
    }))
  );
  
  if (allNamesToMatch.length === 0) return null;
  
  const { bestMatch } = stringSimilarity.findBestMatch(
    cleanedGameName.toLowerCase(),
    allNamesToMatch.map(s => s.matchName)
  );
  
  if (bestMatch && bestMatch.rating >= SERIES_MATCH_THRESHOLD) {
    const matchedSeries = allNamesToMatch.find(s => s.matchName === bestMatch.target);
    
    if (matchedSeries) {
      console.log(`[SERIES] Database fuzzy match: "${matchedSeries.seriesTitle}" (score: ${bestMatch.rating.toFixed(2)})`);
      return {
        matched: true,
        seriesTitle: matchedSeries.seriesTitle,
        seriesTitleId: matchedSeries.seriesId,
        seriesCategory: matchedSeries.seriesCategory || 'REGULAR',
        confidence: bestMatch.rating,
        matchType: 'DATABASE_FUZZY',
        extractedBaseName: baseName
      };
    }
  }
  
  return null;
};

// ===================================================================
// PATTERN-BASED DETECTION
// ===================================================================

/**
 * Known series patterns - major poker tours and common series names
 */
const SERIES_PATTERNS = [
  // Major tours
  /\bWSOP\b/i,
  /\bWPT\b/i,
  /\bEPT\b/i,
  /\bAPT\b/i,
  /\bANZPT\b/i,
  /\bAPPT\b/i,
  /\bWSOPC\b/i,
  
  // Common series names
  /\bChampionship\s+Series\b/i,
  /\bSpring\s+Championship/i,
  /\bSummer\s+Series\b/i,
  /\bFall\s+Series\b/i,
  /\bWinter\s+Series\b/i,
  /\bFestival\s+of\s+Poker\b/i,
  /\bPoker\s+Championships?\b/i,
  /\b(Mini|Mega|Grand)\s+Series\b/i,
  /\bMasters\s+Series\b/i,
  /\bHigh\s+Roller\s+Series\b/i,
  /\bSuper\s+Series\b/i,
  /\bDeepstack\s+Series\b/i,
  /\bClassic\s+Series\b/i,
];

/**
 * Detect series from known patterns
 * 
 * ENHANCED: Now extracts base series name
 */
const matchAgainstPatterns = (gameName) => {
  if (!gameName) return null;
  
  // First try to extract base name
  const { baseName, confidence: extractionConfidence, extractionMethod } = extractBaseSeriesName(gameName);
  
  // If we extracted a meaningful base name, use it
  if (baseName && extractionMethod !== 'ORIGINAL' && extractionConfidence >= 0.60) {
    console.log(`[SERIES] Pattern match via extraction: "${baseName}"`);
    return {
      matched: true,
      seriesName: baseName,
      seriesTitleId: null,
      confidence: extractionConfidence,
      matchType: 'PATTERN_EXTRACTED'
    };
  }
  
  // Fall back to regex pattern matching
  for (const pattern of SERIES_PATTERNS) {
    if (pattern.test(gameName)) {
      const match = gameName.match(pattern);
      const seriesName = match ? match[0] : null;
      
      console.log(`[SERIES] Pattern match: "${seriesName}"`);
      return {
        matched: true,
        seriesName,
        seriesTitleId: null,
        confidence: 0.9,
        matchType: 'PATTERN'
      };
    }
  }
  
  return null;
};

// ===================================================================
// HEURISTIC DETECTION (ENHANCED - explicit names take priority)
// ===================================================================

/**
 * Check if the game name contains an EXPLICIT series name
 * This should take priority over date-based holiday detection
 */
const detectExplicitSeriesName = (gameName) => {
  if (!gameName) return null;
  
  const { baseName, confidence, extractionMethod } = extractBaseSeriesName(gameName);
  
  // If we extracted a meaningful base name with good confidence, use it
  if (baseName && extractionMethod !== 'ORIGINAL' && confidence >= 0.70) {
    return {
      seriesName: baseName,
      confidence,
      extractionMethod
    };
  }
  
  return null;
};

/**
 * Detect series signal from keywords, structure, and holidays
 * 
 * ENHANCED: Explicit series names in tournament name now take priority
 * over date-based holiday detection
 */
const detectSeriesSignal = (name, dateObj = null) => {
  if (!name) return { isSeries: false, confidence: 0 };
  
  const lowerName = name.toLowerCase();
  
  // ===== 1. Structural indicators (definitive) =====
  if (STRUCTURE_KEYWORDS && STRUCTURE_KEYWORDS.some(k => lowerName.includes(k))) {
    return { isSeries: true, confidence: 1.0, reason: 'STRUCTURE_INDICATOR' };
  }
  
  // ===== 2. Explicit series name in tournament name =====
  // This MUST come before holiday detection to prevent "CNY Lunar Series" 
  // from becoming "Valentine's Day Series"
  const explicitSeries = detectExplicitSeriesName(name);
  if (explicitSeries) {
    console.log(`[SERIES] Explicit series name detected: "${explicitSeries.seriesName}" (confidence: ${explicitSeries.confidence.toFixed(2)})`);
    return {
      isSeries: true,
      confidence: explicitSeries.confidence,
      reason: 'EXPLICIT_SERIES_NAME',
      explicitSeriesName: explicitSeries.seriesName
    };
  }
  
  // ===== 3. Series keyword match =====
  if (SERIES_KEYWORDS && SERIES_KEYWORDS.some(k => lowerName.includes(k))) {
    return { isSeries: true, confidence: 0.9, reason: 'KEYWORD_MATCH' };
  }
  
  // ===== 4. Holiday detection (name + date) =====
  // Only use this if NO explicit series name was found
  const holidayNameMatch = detectHolidayFromName ? detectHolidayFromName(name) : null;
  
  if (holidayNameMatch) {
    console.log(`[SERIES] Holiday detected in name: "${holidayNameMatch.name}" (confidence: ${holidayNameMatch.confidence.toFixed(2)}, type: ${holidayNameMatch.matchType})`);
    
    // If we also have a date, check for combined match
    if (dateObj) {
      const combinedMatch = detectHoliday ? detectHoliday(name, dateObj) : holidayNameMatch;
      if (combinedMatch && combinedMatch.matchType === 'NAME_AND_DATE') {
        console.log(`[SERIES] Holiday dual match (name + date): "${combinedMatch.name}" - boosted confidence`);
        return {
          isSeries: true,
          confidence: combinedMatch.confidence,
          reason: 'HOLIDAY_NAME_AND_DATE',
          holidayMatch: combinedMatch
        };
      }
    }
    
    return {
      isSeries: true,
      confidence: holidayNameMatch.confidence,
      reason: 'HOLIDAY_NAME',
      holidayMatch: holidayNameMatch
    };
  }
  
  // ===== 5. Date-only holiday detection =====
  // Lower priority - only if name doesn't indicate anything
  // NOTE: We now DON'T use date-only detection to name the series
  // (it caused "CNY Lunar Series" to become "Valentine's Day Series")
  
  // ===== 6. High guarantee (>$30k, not weekly) =====
  const guaranteeMatch = lowerName.match(/\$([0-9]+)k/);
  if (guaranteeMatch) {
    const amount = parseInt(guaranteeMatch[1]);
    if (amount >= 30 && !lowerName.includes('weekly')) {
      return { isSeries: true, confidence: 0.85, reason: 'HIGH_GUARANTEE' };
    }
  }
  
  return { isSeries: false, confidence: 0 };
};

// ===================================================================
// NAME NORMALIZATION & SIMILARITY (ENHANCED)
// ===================================================================

/**
 * Normalize series name for comparison
 * 
 * ENHANCED: Now uses base series name extraction
 */
const normalizeSeriesName = (name) => {
  if (!name) return '';
  
  // First try to extract base series name
  const { baseName, extractionMethod } = extractBaseSeriesName(name);
  
  // Use base name if extraction was successful
  const nameToNormalize = (extractionMethod !== 'ORIGINAL' && baseName) ? baseName : name;
  
  return nameToNormalize
    .toLowerCase()
    .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi, '')
    .replace(/\bq[1-4]\b/gi, '')
    .replace(/\b20[2-3][0-9]\b/g, '')
    .replace(/flight\s+[0-9a-z]+/gi, '')
    .replace(/day\s+[0-9]+/gi, '')
    .replace(/event\s*#?\s*\d+/gi, '')  // NEW: Remove event numbers
    .replace(/\$[0-9]+k\s*gtd/gi, '')
    .replace(/\b(edition|series)\b/gi, 'series')
    .replace(/\s+/g, ' ')
    .trim();
};

const calculateNameSimilarity = (name1, name2) => {
  const norm1 = normalizeSeriesName(name1);
  const norm2 = normalizeSeriesName(name2);
  
  if (norm1 === norm2) return 100;
  if (norm1.includes(norm2) || norm2.includes(norm1)) return 90;
  
  const words1 = new Set(norm1.split(' ').filter(w => w.length > 2));
  const words2 = new Set(norm2.split(' ').filter(w => w.length > 2));
  
  if (words1.size === 0 || words2.size === 0) return 0;
  
  const intersection = [...words1].filter(w => words2.has(w));
  const union = new Set([...words1, ...words2]);
  
  const jaccard = intersection.length / union.size;
  return Math.round(jaccard * 80);
};

// ===================================================================
// TEMPORAL MATCHING
// ===================================================================

const extractTemporalComponents = (dateValue) => {
  if (!dateValue) return null;
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return null;
    
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const quarter = Math.ceil(month / 3);
    
    return { year, month, quarter, date };
  } catch (error) {
    console.error('[SERIES] Error extracting temporal components:', error);
    return null;
  }
};

const calculateTemporalProximity = (gameDate, series) => {
  const game = extractTemporalComponents(gameDate);
  if (!game) return 0;
  
  if (game.year !== series.year) return 0;
  
  // Check strict date range if available
  if (series.startDate && series.endDate) {
    const seriesStart = new Date(series.startDate);
    const seriesEnd = new Date(series.endDate);
    seriesStart.setDate(seriesStart.getDate() - 7);
    seriesEnd.setDate(seriesEnd.getDate() + 7);
    
    if (game.date >= seriesStart && game.date <= seriesEnd) {
      return 100;
    }
  }
  
  let score = 50;
  
  if (series.month) {
    const monthDiff = Math.abs(game.month - series.month);
    if (monthDiff === 0) score = 95;
    else if (monthDiff === 1) score = Math.max(score, 85);
    else if (monthDiff <= 2) score = Math.max(score, 75);
  }
  
  if (series.quarter && score < 95) {
    const quarterDiff = Math.abs(game.quarter - series.quarter);
    if (quarterDiff === 0) score = Math.max(score, 70);
    else if (quarterDiff === 1) score = Math.max(score, 60);
  }
  
  return score;
};

const findBestTemporalMatch = (seriesList, gameStartDateTime, venueId = null, inputSeriesName = null) => {
  if (!seriesList || seriesList.length === 0) return null;
  
  let bestMatch = null;
  let bestScore = 0;
  
  for (const series of seriesList) {
    let score = calculateTemporalProximity(gameStartDateTime, series);
    
    if (inputSeriesName && series.name) {
      const nameSimilarity = calculateNameSimilarity(inputSeriesName, series.name);
      if (nameSimilarity >= 90) score += 15;
      else if (nameSimilarity >= 70) score += 10;
      else if (nameSimilarity >= 50) score += 5;
    }
    
    if (venueId && series.venueId === venueId) {
      score += 10;
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = series;
    }
  }
  
  if (bestScore >= 60) {
    return {
      series: bestMatch,
      score: bestScore,
      confidence: Math.min(bestScore / 100, 1.0)
    };
  }
  
  return null;
};

// ===================================================================
// DATABASE OPERATIONS
// ===================================================================

const getSeriesInstancesByTitleId = async (seriesTitleId) => {
  const client = getDocClient();
  const tableName = getTableName('TournamentSeries');
  
  try {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      IndexName: 'byTournamentSeriesTitle',
      KeyConditionExpression: 'tournamentSeriesTitleId = :titleId',
      ExpressionAttributeValues: { ':titleId': seriesTitleId }
    }));
    return result.Items || [];
  } catch (error) {
    console.error('[SERIES] Error fetching series by title ID:', error);
    return [];
  }
};

const getSeriesByYear = async (year) => {
  const client = getDocClient();
  const tableName = getTableName('TournamentSeries');
  
  try {
    const result = await client.send(new QueryCommand({
      TableName: tableName,
      IndexName: 'byYear',
      KeyConditionExpression: '#year = :year',
      ExpressionAttributeNames: { '#year': 'year' },
      ExpressionAttributeValues: { ':year': year }
    }));
    return result.Items || [];
  } catch (error) {
    console.error('[SERIES] Error fetching series by year:', error);
    return [];
  }
};

const getSeriesTitleById = async (titleId) => {
  const client = getDocClient();
  const tableName = getTableName('TournamentSeriesTitle');
  
  try {
    const result = await client.send(new GetCommand({
      TableName: tableName,
      Key: { id: titleId }
    }));
    return result.Item;
  } catch (error) {
    console.error('[SERIES] Error fetching series title:', error);
    return null;
  }
};

// ===================================================================
// TOURNAMENT SERIES TITLE MANAGEMENT (ENHANCED)
// ===================================================================

/**
 * Create a TournamentSeriesTitle
 * 
 * ENHANCED: Now cleans up the title name more thoroughly
 */
const createTournamentSeriesTitle = async (titleName, seriesCategory = 'SPECIAL') => {
  const client = getDocClient();
  const tableName = getTableName('TournamentSeriesTitle');
  
  // Extract base series name for cleaner title
  const { baseName } = extractBaseSeriesName(titleName);
  
  // Clean up title name
  const cleanTitle = (baseName || titleName)
    .replace(/\s+20[2-3]\d$/, '')  // Remove trailing year
    .replace(/\s+Event\s*#?\s*\d+.*/i, '')  // Remove event info
    .replace(/\s+/g, ' ')
    .trim();
  
  const now = new Date().toISOString();
  const newTitle = {
    id: uuidv4(),
    title: cleanTitle,
    aliases: [],
    seriesCategory: seriesCategory,
    createdAt: now,
    updatedAt: now,
    __typename: 'TournamentSeriesTitle',
    _version: 1,
    _lastChangedAt: Date.now(),
  };
  
  await client.send(new PutCommand({
    TableName: tableName,
    Item: newTitle
  }));
  
  console.log(`[SERIES] Created TournamentSeriesTitle: "${cleanTitle}" (${newTitle.id}) [${seriesCategory}]`);
  return newTitle;
};

/**
 * Find an existing TournamentSeriesTitle by name similarity
 * 
 * ENHANCED: Uses base series name extraction for better matching
 */
const findExistingSeriesTitle = async (titleName, seriesCategory = null) => {
  const allTitles = await getAllSeriesTitles();
  
  if (allTitles.length === 0) return null;
  
  // Extract base series name
  const { baseName } = extractBaseSeriesName(titleName);
  const searchName = baseName || titleName;
  
  // Clean up the input name for matching
  const cleanInput = searchName
    .replace(/\s+20[2-3]\d$/, '')  // Remove trailing year
    .replace(/\s+Event\s*#?\s*\d+.*/i, '')  // Remove event info
    .toLowerCase()
    .trim();
  
  console.log(`[SERIES] Searching for existing title: "${cleanInput}" (from "${titleName}")`);
  
  // First try exact match
  for (const title of allTitles) {
    const cleanTitle = title.title.toLowerCase().trim();
    if (cleanTitle === cleanInput) {
      if (seriesCategory && title.seriesCategory !== seriesCategory) continue;
      console.log(`[SERIES] Found existing title by exact match: "${title.title}" (${title.id})`);
      return title;
    }
    
    // Check aliases
    for (const alias of (title.aliases || [])) {
      if (alias.toLowerCase().trim() === cleanInput) {
        if (seriesCategory && title.seriesCategory !== seriesCategory) continue;
        console.log(`[SERIES] Found existing title by alias: "${title.title}" (${title.id})`);
        return title;
      }
    }
  }
  
  // Try fuzzy matching with lower threshold for base name
  const similarity = stringSimilarity.findBestMatch(
    cleanInput,
    allTitles.map(t => t.title.toLowerCase().trim())
  );
  
  // Use lower threshold (0.75) for base name matching
  if (similarity.bestMatch && similarity.bestMatch.rating >= 0.75) {
    const matchedTitle = allTitles.find(
      t => t.title.toLowerCase().trim() === similarity.bestMatch.target
    );
    if (matchedTitle) {
      if (seriesCategory && matchedTitle.seriesCategory !== seriesCategory) return null;
      console.log(`[SERIES] Found existing title by fuzzy match: "${matchedTitle.title}" (score: ${similarity.bestMatch.rating.toFixed(2)})`);
      return matchedTitle;
    }
  }
  
  return null;
};

/**
 * Find or create a TournamentSeriesTitle
 */
const findOrCreateSeriesTitle = async (titleName, seriesCategory = 'SPECIAL') => {
  // First try to find existing
  const existing = await findExistingSeriesTitle(titleName, seriesCategory);
  
  if (existing) {
    return { title: existing, wasCreated: false };
  }
  
  // Create new title
  const newTitle = await createTournamentSeriesTitle(titleName, seriesCategory);
  return { title: newTitle, wasCreated: true };
};

// ===================================================================
// VENUE LOOKUP FOR ENTITY ID
// ===================================================================

const getEntityIdFromVenue = async (venueId) => {
  if (!venueId) return null;
  
  const client = getDocClient();
  const tableName = getTableName('Venue');
  
  try {
    const result = await client.send(new GetCommand({
      TableName: tableName,
      Key: { id: venueId },
      ProjectionExpression: 'entityId'
    }));
    
    return result.Item?.entityId || null;
  } catch (error) {
    console.error('[SERIES] Error fetching entityId from venue:', error);
    return null;
  }
};

// ===================================================================
// CREATE TOURNAMENT SERIES
// ===================================================================

/**
 * Create a new TournamentSeries record
 */
const createTournamentSeries = async (seriesData) => {
  const client = getDocClient();
  const tableName = getTableName('TournamentSeries');
  
  // Ensure entityId is populated
  let entityId = seriesData.entityId;
  
  if (!entityId && seriesData.venueId) {
    console.log(`[SERIES] Looking up entityId from venue ${seriesData.venueId}`);
    entityId = await getEntityIdFromVenue(seriesData.venueId);
    
    if (entityId) {
      console.log(`[SERIES] Found entityId: ${entityId}`);
    } else {
      console.warn(`[SERIES] WARNING: Could not find entityId for venue ${seriesData.venueId}`);
    }
  }
  
  if (!entityId) {
    console.warn('[SERIES] WARNING: Creating TournamentSeries without entityId - metrics will not work!');
  }
  
  const now = new Date().toISOString();
  const newSeries = {
    id: uuidv4(),
    ...seriesData,
    entityId,
    status: 'SCHEDULED',
    numberOfEvents: 0,
    createdAt: now,
    updatedAt: now,
    __typename: 'TournamentSeries',
    _version: 1,
    _lastChangedAt: Date.now(),
    _deleted: null
  };
  
  // Remove null/undefined/empty values
  const cleanedSeries = Object.fromEntries(
    Object.entries(newSeries).filter(([key, v]) => {
      if (key === 'tournamentSeriesTitleId') {
        if (!v) {
          console.error('[SERIES] WARNING: Attempting to create TournamentSeries without tournamentSeriesTitleId!');
        }
        return !!v;
      }
      if (key === 'entityId') {
        return !!v;
      }
      if (v === null || v === undefined) return false;
      if (v === '') return false;
      return true;
    })
  );
  
  await client.send(new PutCommand({
    TableName: tableName,
    Item: cleanedSeries
  }));
  
  console.log(`[SERIES] Created new TournamentSeries: ${newSeries.name} (${newSeries.id}) -> Title: ${seriesData.tournamentSeriesTitleId}, Entity: ${entityId || 'NONE'}`);
  return newSeries;
};

const generateSeriesName = (titleName, year, month = null, quarter = null) => {
  const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const quarterNames = ['', 'Q1', 'Q2', 'Q3', 'Q4'];
  
  // Extract base name for cleaner series name
  const { baseName } = extractBaseSeriesName(titleName);
  const cleanName = baseName || titleName;
  
  let name = cleanName;
  if (month) name += ` ${monthNames[month]} ${year}`;
  else if (quarter) name += ` ${quarterNames[quarter]} ${year}`;
  else name += ` ${year}`;
  
  return name;
};

// ===================================================================
// MAIN RESOLVER (ENHANCED)
// ===================================================================

/**
 * Resolve series assignment for a game
 * 
 * ENHANCED: Better base series name extraction and consolidation
 */
const resolveSeriesAssignment = async ({ game, entityId, seriesInput = {}, autoCreate = true, venues = [] }) => {
  const gameStartDateTime = game.gameStartDateTime;
  const venueId = game.venueId;
  const gameName = game.name;
  const inputSeriesName = seriesInput.seriesName || game.seriesName;
  const inputSeriesTitleId = seriesInput.seriesTitleId;
  const providedSeriesId = seriesInput.tournamentSeriesId;
  
  console.log(`[SERIES] Resolving series for: "${gameName}"`);
  
  // ===== STEP 1: If series ID already provided, use it =====
  if (providedSeriesId) {
    console.log(`[SERIES] Using provided tournamentSeriesId: ${providedSeriesId}`);
    const details = extractSeriesDetails(gameName);
    
    return {
      gameUpdates: {
        tournamentSeriesId: providedSeriesId,
        seriesAssignmentStatus: 'MANUALLY_ASSIGNED',
        seriesAssignmentConfidence: 1.0,
        isSeries: true,
        ...details
      },
      metadata: {
        status: 'MATCHED_EXISTING',
        confidence: 1.0,
        matchedSeriesId: providedSeriesId,
        wasCreated: false,
        matchReason: 'provided_id'
      }
    };
  }
  
  // Extract temporal components
  const temporal = extractTemporalComponents(gameStartDateTime);
  if (!temporal) {
    console.log('[SERIES] Invalid date, cannot resolve series');
    return {
      gameUpdates: {
        seriesAssignmentStatus: 'PENDING_ASSIGNMENT',
        seriesAssignmentConfidence: 0,
        isSeries: false
      },
      metadata: {
        status: 'FAILED',
        confidence: 0,
        wasCreated: false,
        matchReason: 'invalid_date'
      }
    };
  }
  
  const { year, month, quarter } = temporal;
  
  // ===== STEP 2: Extract base series name first =====
  const { baseName, confidence: extractionConfidence, extractionMethod, eventDetails } = extractBaseSeriesName(gameName);
  console.log(`[SERIES] Base name extraction: "${baseName}" (method: ${extractionMethod}, confidence: ${extractionConfidence.toFixed(2)})`);
  
  // ===== STEP 3: Database matching against TournamentSeriesTitle =====
  console.log('[SERIES] Step 3: Trying database matching...');
  const seriesTitles = await getAllSeriesTitles();
  const dbMatch = matchAgainstDatabase(gameName, seriesTitles, venues);
  
  if (dbMatch && dbMatch.matched) {
    console.log(`[SERIES] Database match found: ${dbMatch.seriesTitle}`);
    
    // Find or create the specific TournamentSeries instance
    const result = await resolveSeriesInstance({
      seriesTitleId: dbMatch.seriesTitleId,
      seriesTitle: dbMatch.seriesTitle,
      seriesCategory: dbMatch.seriesCategory,
      gameName,
      gameStartDateTime,
      venueId,
      entityId,
      year,
      month,
      quarter,
      autoCreate,
      matchConfidence: dbMatch.confidence,
      matchType: dbMatch.matchType
    });
    
    return result;
  }
  
  // ===== STEP 4: Pattern-based detection =====
  console.log('[SERIES] Step 4: Trying pattern detection...');
  const patternMatch = matchAgainstPatterns(gameName);
  
  if (patternMatch && patternMatch.matched) {
    console.log(`[SERIES] Pattern match found: ${patternMatch.seriesName}`);
    
    // Use extracted base name if available and better
    const seriesNameToUse = (baseName && extractionConfidence > patternMatch.confidence) 
      ? baseName 
      : patternMatch.seriesName;
    
    const result = await resolveSeriesFromName({
      seriesName: seriesNameToUse,
      gameName,
      gameStartDateTime,
      venueId,
      entityId,
      year,
      month,
      quarter,
      autoCreate,
      matchConfidence: Math.max(patternMatch.confidence, extractionConfidence),
      matchType: patternMatch.matchType
    });
    
    return result;
  }
  
  // ===== STEP 5: Keyword heuristics (ENHANCED) =====
  console.log('[SERIES] Step 5: Trying keyword heuristics...');
  
  const heuristicSignal = detectSeriesSignal(inputSeriesName || gameName, temporal.date);
  
  if (heuristicSignal.isSeries) {
    console.log(`[SERIES] Heuristic signal detected: ${heuristicSignal.reason}`);
    
    let generatedSeriesName;
    let category = 'SPECIAL';
    
    // PRIORITY 1: Use explicit series name from tournament name
    if (heuristicSignal.explicitSeriesName) {
      generatedSeriesName = heuristicSignal.explicitSeriesName;
      console.log(`[SERIES] Using explicit series name: "${generatedSeriesName}"`);
    }
    // PRIORITY 2: Use extracted base name
    else if (baseName && extractionMethod !== 'ORIGINAL') {
      generatedSeriesName = baseName;
      console.log(`[SERIES] Using extracted base name: "${generatedSeriesName}"`);
    }
    // PRIORITY 3: Holiday-based naming (only if no explicit name found)
    else if (heuristicSignal.holidayMatch) {
      const holidayMatch = heuristicSignal.holidayMatch;
      console.log(`[SERIES] Holiday context: "${holidayMatch.name}" (type: ${holidayMatch.matchType})`);
      generatedSeriesName = `${holidayMatch.name} Series`;
      category = 'SEASONAL';
    }
    // PRIORITY 4: Fallback to normalized input
    else {
      generatedSeriesName = normalizeSeriesName(inputSeriesName || gameName);
      if (generatedSeriesName.includes('championship')) {
        category = 'CHAMPIONSHIP';
      }
    }
    
    const result = await resolveSeriesFromName({
      seriesName: generatedSeriesName,
      seriesCategory: category,
      gameName,
      gameStartDateTime,
      venueId,
      entityId,
      year,
      month,
      quarter,
      autoCreate,
      matchConfidence: heuristicSignal.confidence,
      matchType: heuristicSignal.reason
    });
    
    return result;
  }
  
  // ===== STEP 6: No match found =====
  console.log('[SERIES] No series detected');
  return {
    gameUpdates: {
      seriesAssignmentStatus: 'NOT_SERIES',
      seriesAssignmentConfidence: 0,
      isSeries: false
    },
    metadata: {
      status: 'NOT_SERIES',
      confidence: 0,
      wasCreated: false,
      matchReason: 'no_match_found'
    }
  };
};

/**
 * Resolve to a specific TournamentSeries instance when we have a seriesTitleId
 */
const resolveSeriesInstance = async ({
  seriesTitleId,
  seriesTitle,
  seriesCategory,
  gameName,
  gameStartDateTime,
  venueId,
  entityId,
  year,
  month,
  quarter,
  autoCreate,
  matchConfidence,
  matchType
}) => {
  const details = extractSeriesDetails(gameName);
  
  // Find existing instances for this title
  const seriesInstances = await getSeriesInstancesByTitleId(seriesTitleId);
  
  // Find best temporal match
  const temporalMatch = findBestTemporalMatch(seriesInstances, gameStartDateTime, venueId, seriesTitle);
  
  if (temporalMatch && temporalMatch.score >= 60) {
    console.log(`[SERIES] Matched to existing instance: ${temporalMatch.series.name}`);
    return {
      gameUpdates: {
        tournamentSeriesId: temporalMatch.series.id,
        seriesName: temporalMatch.series.name,
        tournamentSeriesTitleId: seriesTitleId,
        seriesAssignmentStatus: 'AUTO_ASSIGNED',
        seriesAssignmentConfidence: Math.min(matchConfidence, temporalMatch.confidence),
        isSeries: true,
        isRegular: false,
        ...details
      },
      metadata: {
        status: 'MATCHED_EXISTING',
        confidence: temporalMatch.confidence,
        matchedSeriesId: temporalMatch.series.id,
        matchedSeriesName: temporalMatch.series.name,
        matchedSeriesTitleId: seriesTitleId,
        wasCreated: false,
        matchReason: `${matchType.toLowerCase()}_temporal_match`
      }
    };
  }
  
  // Auto-create new instance if enabled
  if (autoCreate) {
    const newSeriesName = generateSeriesName(seriesTitle, year);
    
    try {
      const newSeries = await createTournamentSeries({
        name: newSeriesName,
        year,
        seriesCategory: seriesCategory || 'REGULAR',
        tournamentSeriesTitleId: seriesTitleId,
        venueId: venueId || null,
        entityId: entityId || null,
        startDate: gameStartDateTime
      });
      
      return {
        gameUpdates: {
          tournamentSeriesId: newSeries.id,
          seriesName: newSeries.name,
          tournamentSeriesTitleId: seriesTitleId,
          seriesAssignmentStatus: 'AUTO_ASSIGNED',
          seriesAssignmentConfidence: matchConfidence * 0.95,
          isSeries: true,
          isRegular: false,
          ...details
        },
        metadata: {
          status: 'CREATED_NEW',
          confidence: matchConfidence * 0.95,
          matchedSeriesId: newSeries.id,
          matchedSeriesName: newSeries.name,
          matchedSeriesTitleId: seriesTitleId,
          wasCreated: true,
          createdSeriesId: newSeries.id,
          matchReason: `${matchType.toLowerCase()}_new_instance`
        }
      };
    } catch (error) {
      console.error('[SERIES] Failed to create series instance:', error);
    }
  }
  
  // Could not create - return pending
  return {
    gameUpdates: {
      seriesName: seriesTitle,
      tournamentSeriesTitleId: seriesTitleId,
      seriesAssignmentStatus: 'PENDING_ASSIGNMENT',
      seriesAssignmentConfidence: matchConfidence,
      suggestedSeriesName: `${seriesTitle} ${year}`,
      isSeries: true,
      isRegular: false,
      ...details
    },
    metadata: {
      status: 'PENDING',
      confidence: matchConfidence,
      matchedSeriesTitleId: seriesTitleId,
      wasCreated: false,
      matchReason: `${matchType.toLowerCase()}_no_instance`
    }
  };
};

/**
 * Resolve series when we only have a name (no seriesTitleId)
 * 
 * ENHANCED: Uses base series name extraction for better title matching
 */
const resolveSeriesFromName = async ({
  seriesName,
  seriesCategory = 'SPECIAL',
  gameName,
  gameStartDateTime,
  venueId,
  entityId,
  year,
  month,
  quarter,
  autoCreate,
  matchConfidence,
  matchType
}) => {
  const details = extractSeriesDetails(gameName);
  
  // Extract base name from the series name for better matching
  const { baseName } = extractBaseSeriesName(seriesName);
  const searchName = baseName || seriesName;
  
  console.log(`[SERIES] resolveSeriesFromName: searching for "${searchName}" (from "${seriesName}")`);
  
  // Search for existing series by year and name similarity
  const yearSeries = await getSeriesByYear(year);
  let bestCandidate = null;
  let bestScore = 0;
  
  for (const s of yearSeries) {
    // Compare using normalized names
    const sim = calculateNameSimilarity(searchName, s.name);
    if (sim > bestScore) {
      bestScore = sim;
      bestCandidate = s;
    }
  }
  
  if (bestCandidate && bestScore >= 70) {
    console.log(`[SERIES] Matched to existing by name: ${bestCandidate.name} (score: ${bestScore})`);
    return {
      gameUpdates: {
        tournamentSeriesId: bestCandidate.id,
        seriesName: bestCandidate.name,
        ...(bestCandidate.tournamentSeriesTitleId && {
          tournamentSeriesTitleId: bestCandidate.tournamentSeriesTitleId
        }),
        seriesAssignmentStatus: 'AUTO_ASSIGNED',
        seriesAssignmentConfidence: Math.min(matchConfidence, bestScore / 100),
        isSeries: true,
        isRegular: false,
        ...details
      },
      metadata: {
        status: 'MATCHED_EXISTING',
        confidence: bestScore / 100,
        matchedSeriesId: bestCandidate.id,
        matchedSeriesName: bestCandidate.name,
        matchedSeriesTitleId: bestCandidate.tournamentSeriesTitleId || null,
        wasCreated: false,
        matchReason: `${matchType.toLowerCase()}_name_match`
      }
    };
  }
  
  // Auto-create if enabled
  if (autoCreate) {
    // Use the base/cleaned name for display
    const displaySeriesName = (baseName || seriesName).charAt(0).toUpperCase() + (baseName || seriesName).slice(1);
    
    try {
      // Find or create a TournamentSeriesTitle using the BASE name
      console.log(`[SERIES] Finding or creating TournamentSeriesTitle for: "${displaySeriesName}"`);
      
      const { title: seriesTitle, wasCreated: titleWasCreated } = await findOrCreateSeriesTitle(
        displaySeriesName,
        seriesCategory
      );
      
      if (titleWasCreated) {
        console.log(`[SERIES] Created new TournamentSeriesTitle: "${seriesTitle.title}" (${seriesTitle.id})`);
      } else {
        console.log(`[SERIES] Using existing TournamentSeriesTitle: "${seriesTitle.title}" (${seriesTitle.id})`);
      }
      
      // Generate the year-specific series name
      const fullSeriesName = generateSeriesName(seriesTitle.title, year);
      
      // Check if a series with this title already exists for this year
      const existingSeriesForTitle = await getSeriesInstancesByTitleId(seriesTitle.id);
      const existingYearSeries = existingSeriesForTitle.find(s => s.year === year);
      
      if (existingYearSeries) {
        console.log(`[SERIES] Found existing series for title+year: ${existingYearSeries.name}`);
        return {
          gameUpdates: {
            tournamentSeriesId: existingYearSeries.id,
            seriesName: existingYearSeries.name,
            tournamentSeriesTitleId: seriesTitle.id,
            seriesAssignmentStatus: 'AUTO_ASSIGNED',
            seriesAssignmentConfidence: matchConfidence * 0.95,
            isSeries: true,
            isRegular: false,
            ...details
          },
          metadata: {
            status: 'MATCHED_EXISTING',
            confidence: matchConfidence * 0.95,
            matchedSeriesId: existingYearSeries.id,
            matchedSeriesName: existingYearSeries.name,
            matchedSeriesTitleId: seriesTitle.id,
            wasCreated: false,
            matchReason: `${matchType.toLowerCase()}_title_year_match`
          }
        };
      }
      
      // Create new TournamentSeries WITH the title ID
      const newSeries = await createTournamentSeries({
        name: fullSeriesName,
        year,
        seriesCategory,
        tournamentSeriesTitleId: seriesTitle.id,
        venueId: venueId || null,
        entityId: entityId || null,
        startDate: gameStartDateTime
      });
      
      return {
        gameUpdates: {
          tournamentSeriesId: newSeries.id,
          seriesName: newSeries.name,
          tournamentSeriesTitleId: seriesTitle.id,
          seriesAssignmentStatus: 'AUTO_ASSIGNED',
          seriesAssignmentConfidence: matchConfidence * 0.9,
          isSeries: true,
          isRegular: false,
          ...details
        },
        metadata: {
          status: 'CREATED_NEW',
          confidence: matchConfidence * 0.9,
          matchedSeriesId: newSeries.id,
          matchedSeriesName: newSeries.name,
          matchedSeriesTitleId: seriesTitle.id,
          wasCreated: true,
          createdSeriesId: newSeries.id,
          createdSeriesTitleId: titleWasCreated ? seriesTitle.id : null,
          matchReason: `${matchType.toLowerCase()}_creation`
        }
      };
    } catch (err) {
      console.error('[SERIES] Creation failed:', err);
    }
  }
  
  // Could not create - return pending
  return {
    gameUpdates: {
      seriesName: seriesName,
      seriesAssignmentStatus: 'PENDING_ASSIGNMENT',
      seriesAssignmentConfidence: matchConfidence,
      suggestedSeriesName: seriesName,
      isSeries: true,
      isRegular: false,
      ...details
    },
    metadata: {
      status: 'PENDING',
      confidence: matchConfidence,
      wasCreated: false,
      matchReason: `${matchType.toLowerCase()}_no_create`
    }
  };
};

/**
 * Legacy function for backward compatibility
 */
const detectHolidayContext = (dateObj) => {
  if (!dateObj || !HOLIDAY_PATTERNS) return null;
  
  const month = dateObj.getMonth();
  const day = dateObj.getDate();
  
  for (const h of HOLIDAY_PATTERNS) {
    if (h.month === month) {
      if (h.day) {
        const diff = Math.abs(day - h.day);
        if (diff <= h.window) return h.name;
      } else {
        return h.name;
      }
    }
  }
  return null;
};

/**
 * Enhanced holiday context detection
 */
const detectHolidayContextEnhanced = (gameName, dateObj) => {
  if (detectHoliday) {
    return detectHoliday(gameName, dateObj);
  }
  
  const legacyResult = detectHolidayContext(dateObj);
  if (legacyResult) {
    return {
      name: legacyResult,
      confidence: 0.7,
      matchType: 'DATE_LEGACY'
    };
  }
  
  return null;
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  // Main resolver
  resolveSeriesAssignment,
  
  // NEW: Base series name extraction
  extractBaseSeriesName,
  extractEventDetailsFromRemainder,
  containsSeriesKeyword,
  
  // Detection functions
  detectSeriesSignal,
  detectExplicitSeriesName,
  matchAgainstDatabase,
  matchAgainstPatterns,
  extractSeriesDetails,
  
  // Holiday detection
  detectHolidayContext,
  detectHolidayContextEnhanced,
  
  // Utilities
  normalizeSeriesName,
  calculateNameSimilarity,
  extractTemporalComponents,
  cleanupNameForSeriesMatching,
  
  // Database operations
  getAllSeriesTitles,
  getSeriesInstancesByTitleId,
  getSeriesByYear,
  createTournamentSeries,
  
  // Title management
  createTournamentSeriesTitle,
  findExistingSeriesTitle,
  findOrCreateSeriesTitle
};