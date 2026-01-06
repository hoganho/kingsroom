/**
 * series-resolver.js (MERGED)
 * 
 * Complete series detection, matching, and resolution logic.
 * 
 * MERGED FROM:
 * - series-matcher.js (database matching, pattern detection, detail extraction)
 * - series-resolver.js (temporal matching, series creation, assignment)
 * 
 * UPDATED: Now auto-creates TournamentSeriesTitle for pattern/heuristic detected series
 * to ensure tournamentSeriesTitleId is always populated.
 * 
 * FIX (2026-01-01): Now includes entityId when creating TournamentSeries records.
 * This is required for refreshAllMetrics to find series when querying by entity.
 * entityId is passed through the chain: resolveSeriesAssignment -> resolveSeriesInstance/
 * resolveSeriesFromName -> createTournamentSeries. If entityId is not provided directly,
 * createTournamentSeries will look it up from the venue.
 * 
 * ENHANCED (2026-01-06): Holiday detection now checks BOTH game name AND date.
 * - detectSeriesSignal() now checks for holiday keywords in game names
 * - New detectHolidayFromName() function for name-based holiday detection
 * - Combined detection gives higher confidence when both name and date match
 * 
 * DETECTION ORDER:
 * 1. Database matching against TournamentSeriesTitle (exact + fuzzy)
 * 2. Pattern-based detection (WSOP, WPT, etc.)
 * 3. Keyword heuristics (championship, series, festival, etc.)
 * 4. Holiday detection (name + date based) - ENHANCED
 * 5. Temporal matching to find/create TournamentSeries instance
 * 6. Extract series details (dayNumber, flightLetter, eventNumber, etc.)
 */

const { v4: uuidv4 } = require('uuid');
const stringSimilarity = require('string-similarity');
const { getDocClient, getTableName, QueryCommand, GetCommand, PutCommand, UpdateCommand, ScanCommand } = require('../utils/db-client');
const { 
  SERIES_KEYWORDS, 
  STRUCTURE_KEYWORDS, 
  HOLIDAY_PATTERNS, 
  VALIDATION_THRESHOLDS,
  // NEW: Import enhanced holiday detection functions
  detectHolidayFromName,
  detectHolidayFromDate,
  detectHoliday,
  getHolidayKeywords
} = require('../utils/constants');

// Series match threshold for fuzzy matching
const SERIES_MATCH_THRESHOLD = 0.7;

// ===================================================================
// SERIES DETAIL EXTRACTION (from series-matcher.js)
// ===================================================================

/**
 * Extract series details from tournament name
 * Parses dayNumber, flightLetter, eventNumber, isMainEvent, finalDay, seriesYear
 * 
 * @param {string} tournamentName - Tournament name to analyze
 * @returns {object} Extracted series details
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
 * 
 * @param {string} name - Name to clean
 * @param {array} venues - Venues to remove from matching
 * @returns {string} Cleaned name
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
// DATABASE MATCHING (from series-matcher.js)
// ===================================================================

/**
 * Get all series titles from database
 * 
 * @returns {array} Array of TournamentSeriesTitle objects
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
 * Uses exact substring matching first, then fuzzy matching
 * 
 * @param {string} gameName - Tournament name to match
 * @param {array} seriesTitles - Array of TournamentSeriesTitle objects
 * @param {array} venues - Array of venue objects for cleanup
 * @returns {object|null} Match result or null
 */
const matchAgainstDatabase = (gameName, seriesTitles = [], venues = []) => {
  if (!gameName || !seriesTitles.length) return null;
  
  const upperCaseGameName = gameName.toUpperCase();
  
  // Step 1: Exact substring matching
  for (const series of seriesTitles) {
    const namesToCheck = [series.title, ...(series.aliases || [])];
    
    for (const seriesName of namesToCheck) {
      if (upperCaseGameName.includes(seriesName.toUpperCase())) {
        console.log(`[SERIES] Database exact match: "${series.title}"`);
        return {
          matched: true,
          seriesTitle: series.title,
          seriesTitleId: series.id,
          seriesCategory: series.seriesCategory || 'REGULAR',
          confidence: 1.0,
          matchType: 'DATABASE_EXACT'
        };
      }
    }
  }
  
  // Step 2: Fuzzy matching
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
        matchType: 'DATABASE_FUZZY'
      };
    }
  }
  
  return null;
};

// ===================================================================
// PATTERN-BASED DETECTION (from series-matcher.js)
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
 * @param {string} gameName - Tournament name to check
 * @returns {object|null} Match result or null
 */
const matchAgainstPatterns = (gameName) => {
  if (!gameName) return null;
  
  for (const pattern of SERIES_PATTERNS) {
    if (pattern.test(gameName)) {
      const match = gameName.match(pattern);
      const seriesName = match ? match[0] : null;
      
      console.log(`[SERIES] Pattern match: "${seriesName}"`);
      return {
        matched: true,
        seriesName,
        seriesTitleId: null, // No database entry
        confidence: 0.9,
        matchType: 'PATTERN'
      };
    }
  }
  
  return null;
};

// ===================================================================
// HEURISTIC DETECTION (ENHANCED with holiday name detection)
// ===================================================================

/**
 * Detect series signal from keywords, structure, and holidays
 * 
 * ENHANCED: Now also checks for holiday names in game title
 * 
 * @param {string} name - Tournament name
 * @param {Date} dateObj - Optional game date for holiday context
 * @returns {object} Detection result with isSeries, confidence, reason, and holidayMatch
 */
const detectSeriesSignal = (name, dateObj = null) => {
  if (!name) return { isSeries: false, confidence: 0 };
  
  const lowerName = name.toLowerCase();
  
  // ===== 1. Structural indicators (definitive) =====
  if (STRUCTURE_KEYWORDS && STRUCTURE_KEYWORDS.some(k => lowerName.includes(k))) {
    return { isSeries: true, confidence: 1.0, reason: 'STRUCTURE_INDICATOR' };
  }
  
  // ===== 2. Series keyword match =====
  if (SERIES_KEYWORDS && SERIES_KEYWORDS.some(k => lowerName.includes(k))) {
    return { isSeries: true, confidence: 0.9, reason: 'KEYWORD_MATCH' };
  }
  
  // ===== 3. ENHANCED: Holiday detection (name + date) =====
  // Check if game name contains holiday keywords
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
  
  // ===== 4. Date-only holiday detection (fallback) =====
  if (dateObj) {
    const holidayDateMatch = detectHolidayFromDate ? detectHolidayFromDate(dateObj) : null;
    if (holidayDateMatch) {
      console.log(`[SERIES] Holiday detected from date: "${holidayDateMatch.name}" (confidence: ${holidayDateMatch.confidence.toFixed(2)})`);
      // Date-only match has lower priority - don't automatically mark as series
      // but return the info for potential use downstream
      // (This preserves original behavior - date alone doesn't trigger series)
    }
  }
  
  // ===== 5. High guarantee (>$30k, not weekly) =====
  const guaranteeMatch = lowerName.match(/\$([0-9]+)k/);
  if (guaranteeMatch) {
    const amount = parseInt(guaranteeMatch[1]);
    if (amount >= 30 && !lowerName.includes('weekly')) {
      return { isSeries: true, confidence: 0.85, reason: 'HIGH_GUARANTEE' };
    }
  }
  
  return { isSeries: false, confidence: 0 };
};

/**
 * Detect holiday context from date (LEGACY - kept for backward compatibility)
 * 
 * @deprecated Use detectHoliday() or detectHolidayFromDate() instead
 * @param {Date} dateObj - Date to check
 * @returns {string|null} Holiday name or null
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
 * Checks BOTH game name AND date for holiday indicators
 * 
 * @param {string} gameName - Tournament name
 * @param {Date} dateObj - Game date
 * @returns {object|null} { name, confidence, matchType, ... } or null
 */
const detectHolidayContextEnhanced = (gameName, dateObj) => {
  // Use the new combined detection from constants
  if (detectHoliday) {
    return detectHoliday(gameName, dateObj);
  }
  
  // Fallback to legacy detection
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
// NAME NORMALIZATION & SIMILARITY
// ===================================================================

const normalizeSeriesName = (name) => {
  if (!name) return '';
  
  return name
    .toLowerCase()
    .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi, '')
    .replace(/\bq[1-4]\b/gi, '')
    .replace(/\b20[2-3][0-9]\b/g, '')
    .replace(/flight\s+[0-9a-z]+/gi, '')
    .replace(/day\s+[0-9]+/gi, '')
    .replace(/\$[0-9]+k\s+gtd/gi, '')
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
// NEW: CREATE TOURNAMENT SERIES TITLE
// ===================================================================

/**
 * Create a TournamentSeriesTitle for pattern/heuristic-detected series
 * This ensures every TournamentSeries has a valid tournamentSeriesTitleId
 * 
 * @param {string} titleName - The base title name (without year)
 * @param {string} seriesCategory - Category (REGULAR, SEASONAL, CHAMPIONSHIP, SPECIAL)
 * @returns {Object} The created TournamentSeriesTitle
 */
const createTournamentSeriesTitle = async (titleName, seriesCategory = 'SPECIAL') => {
  const client = getDocClient();
  const tableName = getTableName('TournamentSeriesTitle');
  
  // Clean up title name - remove year suffix if present
  const cleanTitle = titleName
    .replace(/\s+20[2-3]\d$/, '')  // Remove trailing year
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
 * @param {string} titleName - The title name to search for
 * @param {string} seriesCategory - Optional category filter
 * @returns {Object|null} Matching title or null
 */
const findExistingSeriesTitle = async (titleName, seriesCategory = null) => {
  const allTitles = await getAllSeriesTitles();
  
  if (allTitles.length === 0) return null;
  
  // Clean up the input name for matching
  const cleanInput = titleName
    .replace(/\s+20[2-3]\d$/, '')  // Remove trailing year
    .toLowerCase()
    .trim();
  
  // First try exact match
  for (const title of allTitles) {
    const cleanTitle = title.title.toLowerCase().trim();
    if (cleanTitle === cleanInput) {
      // If category filter specified, check it matches
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
  
  // Try fuzzy matching
  const similarity = stringSimilarity.findBestMatch(
    cleanInput,
    allTitles.map(t => t.title.toLowerCase().trim())
  );
  
  if (similarity.bestMatch && similarity.bestMatch.rating >= 0.85) {
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
 * 
 * @param {string} titleName - The title name
 * @param {string} seriesCategory - Category (REGULAR, SEASONAL, CHAMPIONSHIP, SPECIAL)
 * @returns {Object} { title: TournamentSeriesTitle, wasCreated: boolean }
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
// CREATE TOURNAMENT SERIES (UPDATED - Now includes entityId)
// ===================================================================

/**
 * Create a new TournamentSeries record
 * 
 * UPDATED: Now includes entityId, either from direct parameter or looked up from venue.
 * This is REQUIRED for refreshAllMetrics to find series when querying by entity.
 * 
 * @param {Object} seriesData - Series data to create
 * @param {string} seriesData.name - Series name (required)
 * @param {number} seriesData.year - Year (required)
 * @param {string} seriesData.seriesCategory - Category (optional, defaults to REGULAR)
 * @param {string} seriesData.tournamentSeriesTitleId - Title ID (should always be provided)
 * @param {string} seriesData.venueId - Venue ID (optional)
 * @param {string} seriesData.entityId - Entity ID (optional, will be looked up from venue if not provided)
 * @param {string} seriesData.startDate - Start date (optional)
 * @returns {Object} Created series record
 */
const createTournamentSeries = async (seriesData) => {
  const client = getDocClient();
  const tableName = getTableName('TournamentSeries');
  
  // =====================================================
  // FIX: Ensure entityId is populated
  // =====================================================
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
  // =====================================================
  
  const now = new Date().toISOString();
  const newSeries = {
    id: uuidv4(),
    ...seriesData,
    entityId,  // FIX: Include entityId in the record
    status: 'SCHEDULED',
    numberOfEvents: 0,
    createdAt: now,
    updatedAt: now,
    __typename: 'TournamentSeries',
    _version: 1,
    _lastChangedAt: Date.now(),
    _deleted: null
  };
  
  // Remove null/undefined/empty values to keep DynamoDB clean
  // But KEEP tournamentSeriesTitleId and entityId even if they would be filtered
  const cleanedSeries = Object.fromEntries(
    Object.entries(newSeries).filter(([key, v]) => {
      // Never filter out tournamentSeriesTitleId - it should always be present now
      if (key === 'tournamentSeriesTitleId') {
        if (!v) {
          console.error('[SERIES] WARNING: Attempting to create TournamentSeries without tournamentSeriesTitleId!');
        }
        return !!v;  // Only include if truthy
      }
      // Keep entityId if present
      if (key === 'entityId') {
        return !!v;  // Only include if truthy
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
  
  let name = titleName;
  if (month) name += ` ${monthNames[month]} ${year}`;
  else if (quarter) name += ` ${quarterNames[quarter]} ${year}`;
  else name += ` ${year}`;
  
  return name;
};

// ===================================================================
// MAIN RESOLVER (MERGED + ENHANCED)
// ===================================================================

/**
 * Resolve series assignment for a game
 * 
 * ENHANCED DETECTION ORDER:
 * 1. If tournamentSeriesId provided → Use it
 * 2. Database matching against TournamentSeriesTitle
 * 3. Pattern-based detection (WSOP, WPT, etc.)
 * 4. Keyword heuristics (now includes holiday name detection)
 * 5. Temporal matching to find/create instance
 * 6. Extract series details (dayNumber, flightLetter, etc.)
 * 
 * @param {Object} params
 * @param {Object} params.game - Game data
 * @param {string} params.entityId - Entity ID
 * @param {Object} params.seriesInput - Series input from caller
 * @param {boolean} params.autoCreate - Whether to auto-create series
 * @param {array} params.venues - Venues for name cleanup (optional)
 * @returns {Object} { gameUpdates, metadata }
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
  
  // ===== STEP 2: Database matching against TournamentSeriesTitle =====
  console.log('[SERIES] Step 2: Trying database matching...');
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
      entityId,  // FIX: Pass entityId to resolveSeriesInstance
      year,
      month,
      quarter,
      autoCreate,
      matchConfidence: dbMatch.confidence,
      matchType: dbMatch.matchType
    });
    
    return result;
  }
  
  // ===== STEP 3: Pattern-based detection =====
  console.log('[SERIES] Step 3: Trying pattern detection...');
  const patternMatch = matchAgainstPatterns(gameName);
  
  if (patternMatch && patternMatch.matched) {
    console.log(`[SERIES] Pattern match found: ${patternMatch.seriesName}`);
    
    // Try to find existing series by name
    const result = await resolveSeriesFromName({
      seriesName: patternMatch.seriesName,
      gameName,
      gameStartDateTime,
      venueId,
      entityId,  // FIX: Pass entityId to resolveSeriesFromName
      year,
      month,
      quarter,
      autoCreate,
      matchConfidence: patternMatch.confidence,
      matchType: 'PATTERN'
    });
    
    return result;
  }
  
  // ===== STEP 4: Keyword heuristics (ENHANCED with holiday detection) =====
  console.log('[SERIES] Step 4: Trying keyword heuristics (with holiday detection)...');
  
  // ENHANCED: Pass date to detectSeriesSignal for combined holiday detection
  const heuristicSignal = detectSeriesSignal(inputSeriesName || gameName, temporal.date);
  
  if (heuristicSignal.isSeries) {
    console.log(`[SERIES] Heuristic signal detected: ${heuristicSignal.reason}`);
    
    // ENHANCED: Use the improved holiday detection
    const holidayMatch = heuristicSignal.holidayMatch || detectHolidayContextEnhanced(gameName, temporal.date);
    
    let generatedSeriesName = normalizeSeriesName(inputSeriesName || gameName);
    let category = 'SPECIAL';
    
    // Holiday-based series naming
    if (holidayMatch) {
      console.log(`[SERIES] Holiday context: "${holidayMatch.name}" (type: ${holidayMatch.matchType}, confidence: ${holidayMatch.confidence?.toFixed(2) || 'N/A'})`);
      generatedSeriesName = `${holidayMatch.name} Series ${year}`;
      category = 'SEASONAL';
    } else if (generatedSeriesName.includes('championship')) {
      generatedSeriesName = generatedSeriesName.replace(/\d{4}/, '').trim() + ` ${year}`;
      category = 'CHAMPIONSHIP';
    } else {
      generatedSeriesName = `${generatedSeriesName} ${year}`;
      category = 'SPECIAL';
    }
    
    const result = await resolveSeriesFromName({
      seriesName: generatedSeriesName,
      seriesCategory: category,
      gameName,
      gameStartDateTime,
      venueId,
      entityId,  // FIX: Pass entityId to resolveSeriesFromName
      year,
      month,
      quarter,
      autoCreate,
      matchConfidence: heuristicSignal.confidence,
      matchType: heuristicSignal.holidayMatch ? 'HOLIDAY' : 'HEURISTIC'
    });
    
    return result;
  }
  
  // ===== STEP 5: No match found =====
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
  entityId,  // FIX: Added entityId parameter
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
        isRegular: false,  // Series games are NOT regular recurring games
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
        entityId: entityId || null,  // FIX: Pass entityId to createTournamentSeries
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
          isRegular: false,  // Series games are NOT regular recurring games
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
      isRegular: false,  // Series games are NOT regular recurring games
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
 * UPDATED: Now auto-creates a TournamentSeriesTitle before creating the series
 * to ensure tournamentSeriesTitleId is always populated.
 */
const resolveSeriesFromName = async ({
  seriesName,
  seriesCategory = 'SPECIAL',
  gameName,
  gameStartDateTime,
  venueId,
  entityId,  // FIX: Added entityId parameter
  year,
  month,
  quarter,
  autoCreate,
  matchConfidence,
  matchType
}) => {
  const details = extractSeriesDetails(gameName);
  
  // Search for existing series by year and name similarity
  const yearSeries = await getSeriesByYear(year);
  let bestCandidate = null;
  let bestScore = 0;
  
  for (const s of yearSeries) {
    const sim = calculateNameSimilarity(seriesName, s.name);
    if (sim > bestScore) {
      bestScore = sim;
      bestCandidate = s;
    }
  }
  
  if (bestCandidate && bestScore >= 75) {
    console.log(`[SERIES] Matched to existing by name: ${bestCandidate.name} (score: ${bestScore})`);
    return {
      gameUpdates: {
        tournamentSeriesId: bestCandidate.id,
        seriesName: bestCandidate.name,
        // Include tournamentSeriesTitleId if the matched series has one
        ...(bestCandidate.tournamentSeriesTitleId && {
          tournamentSeriesTitleId: bestCandidate.tournamentSeriesTitleId
        }),
        seriesAssignmentStatus: 'AUTO_ASSIGNED',
        seriesAssignmentConfidence: Math.min(matchConfidence, bestScore / 100),
        isSeries: true,
        isRegular: false,  // Series games are NOT regular recurring games
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
    const displaySeriesName = seriesName.charAt(0).toUpperCase() + seriesName.slice(1);
    
    try {
      // =====================================================
      // FIX: First find or create a TournamentSeriesTitle
      // =====================================================
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
      
      // Now create the TournamentSeries WITH the title ID
      const newSeries = await createTournamentSeries({
        name: displaySeriesName,
        year,
        seriesCategory,
        tournamentSeriesTitleId: seriesTitle.id,  // NOW ALWAYS POPULATED
        venueId: venueId || null,
        entityId: entityId || null,  // FIX: Pass entityId to createTournamentSeries
        startDate: gameStartDateTime
      });
      
      return {
        gameUpdates: {
          tournamentSeriesId: newSeries.id,
          seriesName: newSeries.name,
          tournamentSeriesTitleId: seriesTitle.id,  // Include in game updates
          seriesAssignmentStatus: 'AUTO_ASSIGNED',
          seriesAssignmentConfidence: matchConfidence * 0.9,
          isSeries: true,
          isRegular: false,  // Series games are NOT regular recurring games
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
  
  // Could not create - return pending (no tournamentSeriesTitleId in this case)
  return {
    gameUpdates: {
      seriesName,
      seriesAssignmentStatus: 'PENDING_ASSIGNMENT',
      seriesAssignmentConfidence: matchConfidence,
      suggestedSeriesName: seriesName,
      isSeries: true,
      isRegular: false,  // Series games are NOT regular recurring games
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

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  // Main resolver
  resolveSeriesAssignment,
  
  // Detection functions
  detectSeriesSignal,
  matchAgainstDatabase,
  matchAgainstPatterns,
  extractSeriesDetails,
  
  // Holiday detection (NEW + ENHANCED)
  detectHolidayContext,           // Legacy - kept for backward compatibility
  detectHolidayContextEnhanced,   // NEW - combined name + date detection
  
  // Utilities
  normalizeSeriesName,
  calculateNameSimilarity,
  extractTemporalComponents,
  cleanupNameForSeriesMatching,
  
  // Database operations (for testing)
  getAllSeriesTitles,
  getSeriesInstancesByTitleId,
  getSeriesByYear,
  createTournamentSeries,
  
  // NEW: Title management
  createTournamentSeriesTitle,
  findExistingSeriesTitle,
  findOrCreateSeriesTitle
};