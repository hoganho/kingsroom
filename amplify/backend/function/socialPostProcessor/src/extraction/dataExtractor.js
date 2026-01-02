/**
 * extraction/dataExtractor.js
 * Extract structured game data from social post content
 * 
 * ENHANCED (v2.0):
 * - Bad beat jackpot extraction
 * - Buy-in breakdown parsing (prizepool + rake)
 * - Tournament type from "Unlimited Re-Entries" etc.
 * - Starting stack extraction
 * - Blind level duration extraction
 * - Smarter first place / total prizes calculation
 * - Venue matching from database
 * - NaN/Infinity sanitization for DynamoDB compatibility
 * 
 * NEW (v3.0 - Ticket Integration):
 * - Comprehensive ticket extraction from placement lines
 * - Aggregate ticket statistics for reconciliation
 * - Promotional ticket extraction from promo posts
 * - Enhanced winner info with ticket details
 * - Reconciliation fields mapping to Game model
 */

const { 
  EXTRACTION_PATTERNS, 
  extractFirst, 
  extractAll, 
  parseDollarAmount 
} = require('../utils/patterns');
const { getDayOfWeek, inferGameDate, toAEST } = require('../utils/dateUtils');
const { getAllVenues } = require('../utils/graphql');

// Import ticket extraction functions from placementParser
const {
  parsePlacements,
  createPlacementRecords,
  extractTickets,
  hasTicketIndicator,
  extractTicketValue,
  extractPromoTickets,
  calculateTicketAggregates,
  generateTicketSummary,
  extractEnhancedWinnerInfo,
  cleanPlayerName,
  TICKET_PATTERNS,
  TICKET_TYPE_MAP
} = require('./placementParser');

// ===================================================================
// NUMERIC SANITIZATION HELPERS
// ===================================================================

/**
 * Safely parse an integer, returning null instead of NaN
 * @param {string|number} value - Value to parse
 * @param {number} radix - Radix for parseInt (default 10)
 * @returns {number|null} Parsed integer or null
 */
const safeParseInt = (value, radix = 10) => {
  if (value === null || value === undefined) return null;
  const parsed = parseInt(value, radix);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Safely parse a float, returning null instead of NaN
 * @param {string|number} value - Value to parse
 * @returns {number|null} Parsed float or null
 */
const safeParseFloat = (value) => {
  if (value === null || value === undefined) return null;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * Sanitize a numeric value - convert NaN/Infinity to null
 * @param {any} value - Value to sanitize
 * @returns {number|null} Sanitized value
 */
const sanitizeNumeric = (value) => {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'number') return value;
  return Number.isFinite(value) ? value : null;
};

/**
 * Recursively sanitize an object, removing NaN/Infinity values
 * Required because DynamoDB throws on NaN/Infinity
 * @param {Object} obj - Object to sanitize
 * @returns {Object} Sanitized object
 */
const sanitizeForDynamoDB = (obj) => {
  if (obj === null || obj === undefined) return obj;
  
  if (typeof obj === 'number') {
    if (!Number.isFinite(obj)) {
      console.error(`[DEBUG] ❌ NaN/Infinity detected, converting to null`);
      return null;
    }
    return obj;
  }
  
  if (typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForDynamoDB(item));
  }
  
  const sanitized = {};
  for (const [key, value] of Object.entries(obj)) {
    const sanitizedValue = sanitizeForDynamoDB(value);
    // Log if we're fixing a NaN/Infinity
    if (typeof value === 'number' && !Number.isFinite(value)) {
      console.error(`[DEBUG] ❌ NaN/Infinity at: ${key} = ${value}`);
    }
    sanitized[key] = sanitizedValue;
  }
  return sanitized;
};

// ===================================================================
// VENUE CACHE (like series-resolver.js)
// ===================================================================

let venueCache = null;
let venueCacheTimestamp = 0;
const VENUE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get all venues with caching
 */
const getVenuesWithCache = async () => {
  const now = Date.now();
  
  if (venueCache && (now - venueCacheTimestamp) < VENUE_CACHE_TTL) {
    return venueCache;
  }
  
  console.log('[EXTRACTOR] Refreshing venue cache...');
  
  try {
    venueCache = await getAllVenues();
    venueCacheTimestamp = now;
    console.log(`[EXTRACTOR] Cached ${venueCache?.length || 0} venues`);
    return venueCache || [];
  } catch (error) {
    console.error('[EXTRACTOR] Failed to fetch venues:', error);
    return venueCache || [];
  }
};

/**
 * Clear the venue cache (for testing)
 */
const clearVenueCache = () => {
  venueCache = null;
  venueCacheTimestamp = 0;
};

// ===================================================================
// ENHANCED EXTRACTION PATTERNS
// ===================================================================

const ENHANCED_PATTERNS = {
  // Bad beat jackpot: "BADBEAT Jackpot: $16377.2" or "Bad Beat: $5,000"
  badBeatJackpot: [
    /bad\s*beat\s*(?:jackpot)?[:\s]+\$?([\d,]+(?:\.\d{1,2})?)/i,
    /jackpot[:\s]+\$?([\d,]+(?:\.\d{1,2})?)\s*(?:cash|guaranteed)?/i,
    /bbj[:\s]+\$?([\d,]+(?:\.\d{1,2})?)/i
  ],
  
  // Buy-in breakdown: "$120 ($98 + $22)" or "($98 + $22)" after buy-in
  buyInBreakdown: /\$?\s*([\d,]+)\s*\+\s*\$?\s*([\d,]+)/,
  
  // Full buy-in line: "Buy-in: $120 (Fully Dealt, $98 + $22)"
  buyInFull: /buy[- ]?in[:\s]+\$?([\d,]+)(?:\s*\([^)]*\$?\s*([\d,]+)\s*\+\s*\$?\s*([\d,]+)[^)]*\))?/i,
  
  // Starting stack: "Starting Stack: 30,000 chips" or "30k starting" or "30000ss"
  startingStack: [
    /starting\s*stack[:\s]+\$?([\d,]+)(?:k)?(?:\s*chips)?/i,
    /([\d,]+)(?:k)?\s*(?:chips?)?\s*starting/i,
    /start(?:ing)?\s*(?:with\s+)?([\d,]+)(?:k)?(?:\s*chips)?/i,
    /([\d,]+)(?:k)?\s*ss\b/i  // "30000ss" or "30kss" pattern
  ],
  
  // Blind levels: "20-minute levels" or "Blinds: 15 min" or "20min levels"
  blindLevels: [
    /(\d+)[- ]?min(?:ute)?s?\s*(?:blind\s*)?levels?/i,
    /blinds?[:\s]+(\d+)[- ]?min(?:ute)?s?(?:\s*levels?)?/i,
    /levels?[:\s]+(\d+)[- ]?min(?:ute)?s?/i
  ],
  
  // Re-entry indicators
  reEntry: [
    /unlimited\s*re[- ]?entr(?:y|ies)/i,
    /\bre[- ]?entr(?:y|ies)\s*(?:allowed|available|permitted)/i,
    /multiple\s*re[- ]?entr(?:y|ies)/i
  ],
  
  // Freezeout indicators
  freezeout: [
    /freeze[- ]?out/i,
    /no\s*re[- ]?entr(?:y|ies)/i,
    /single\s*entry\s*only/i
  ],
  
  // Late registration: "Late Registration: Until 9:40 PM" or "Late reg until level 8"
  lateReg: [
    /late\s*reg(?:istration)?[:\s]+(?:until\s+)?(\d{1,2}:\d{2}\s*(?:am|pm)?)/i,
    /late\s*reg(?:istration)?[:\s]+(?:until\s+)?level\s+(\d+)/i,
    /reg(?:istration)?\s*(?:closes?|ends?)[:\s]+(\d{1,2}:\d{2}\s*(?:am|pm)?)/i
  ],
  
  // Placement lines (for smart prize extraction)
  placementLine: /^(?:(\d+)(?:st|nd|rd|th)|([🥇🥈🥉]))\s*[-–—:.\s]+\s*([A-Za-z][A-Za-z\s.']+?)\s*[-–—:\s]+\s*\$?([\d,]+(?:\.\d{2})?)/gim
};

// Day keywords for recurring game detection (from recurring-resolver.js)
const DAY_KEYWORDS = {
  'monday': 'MONDAY', 'mon': 'MONDAY',
  'tuesday': 'TUESDAY', 'tue': 'TUESDAY', 'tues': 'TUESDAY',
  'wednesday': 'WEDNESDAY', 'wed': 'WEDNESDAY',
  'thursday': 'THURSDAY', 'thu': 'THURSDAY', 'thur': 'THURSDAY', 'thurs': 'THURSDAY',
  'friday': 'FRIDAY', 'fri': 'FRIDAY',
  'saturday': 'SATURDAY', 'sat': 'SATURDAY',
  'sunday': 'SUNDAY', 'sun': 'SUNDAY',
};

// ===================================================================
// MAIN EXTRACTION
// ===================================================================

/**
 * Extract all game-related data from a social post
 * 
 * @param {Object} post - Social post object
 * @param {Object} options - Extraction options
 * @param {string} options.socialPostId - ID of the social post (for placement records)
 * @param {string} options.socialPostGameDataId - ID of the game data record (for placement records)
 * @returns {Object} Extracted data (sanitized for DynamoDB)
 */
const extractGameData = async (post, options = {}) => {
  const content = post.content || '';
  const startTime = Date.now();
  
  const extracted = {
    // Tournament identity
    extractedName: null,
    extractedTournamentUrl: null,
    extractedTournamentId: null,
    
    // Recurring game detection (from first 2 lines)
    extractedRecurringGameName: null,
    extractedRecurringDayOfWeek: null,
    
    // Venue (now from DB match)
    extractedVenueName: null,
    extractedVenueId: null,
    venueMatchConfidence: 0,
    venueMatchSource: null,
    
    // Date/time
    extractedDate: null,
    extractedDayOfWeek: null,
    extractedStartTime: null,
    dateSource: null,
    
    // Effective game date (computed: extractedDate priority, postedAt fallback)
    effectiveGameDate: null,
    effectiveGameDateSource: null,       // "extracted" | "posted_at"
    
    // Financials
    extractedBuyIn: null,
    extractedBuyInPrizepool: null,
    extractedRake: null,
    extractedGuarantee: null,
    extractedPrizePool: null,
    extractedFirstPlacePrize: null,
    extractedTotalPrizesPaid: null,
    
    // Bad beat jackpot
    extractedBadBeatJackpot: null,
    
    // Entries
    extractedTotalEntries: null,
    extractedTotalUniquePlayers: null,
    
    // Game type
    extractedGameType: 'TOURNAMENT',
    extractedTournamentType: null,
    extractedGameVariant: null,
    extractedGameTypes: [],
    
    // Structure details
    extractedStartingStack: null,
    extractedBlindLevelMinutes: null,
    extractedLateRegTime: null,
    extractedLateRegLevel: null,
    
    // Series
    extractedSeriesName: null,
    extractedEventNumber: null,
    extractedDayNumber: null,
    extractedFlightLetter: null,
    isSeriesEvent: false,
    
    // ===================================================================
    // WINNER EXTRACTION (First Place - Quick Access)
    // ===================================================================
    extractedWinnerName: null,
    extractedWinnerPrize: null,           // Legacy: cash only
    extractedWinnerCashPrize: null,       // NEW: Just the cash portion
    extractedWinnerHasTicket: false,
    extractedWinnerTicketType: null,
    extractedWinnerTicketValue: null,
    extractedWinnerTotalValue: null,      // Cash + ticket combined
    placementCount: 0,
    
    // ===================================================================
    // TICKET AGGREGATION (NEW - For Reconciliation)
    // ===================================================================
    totalTicketsExtracted: 0,
    totalTicketValue: null,
    ticketCountByType: null,              // AWSJSON: { "ACCUMULATOR_TICKET": 5 }
    ticketValueByType: null,              // AWSJSON: { "ACCUMULATOR_TICKET": 750 }
    totalCashPaid: null,
    totalPrizesWithTickets: 0,
    totalTicketOnlyPrizes: 0,
    
    // ===================================================================
    // PROMOTIONAL TICKET INFO (NEW)
    // ===================================================================
    hasAdvertisedTickets: false,
    advertisedTicketCount: null,
    advertisedTicketType: null,
    advertisedTicketValue: null,
    advertisedTicketDescription: null,
    advertisedTickets: null,              // AWSJSON array
    
    // ===================================================================
    // RECONCILIATION FIELDS (NEW - Map to Game model)
    // ===================================================================
    reconciliation_accumulatorTicketCount: 0,
    reconciliation_accumulatorTicketValue: null,
    reconciliation_totalPrizepoolPaid: null,
    reconciliation_cashPlusTotalTicketValue: null,
    hasReconciliationDiscrepancy: false,
    reconciliationNotes: null,
    
    // Raw data for debugging
    patternMatches: {},
    extractedPrizes: [],
    extractedPlacements: [],              // Structured placement data (legacy format)
    placementRecords: []                  // NEW: Full placement records with ticket data
  };
  
  // === TOURNAMENT URL & ID ===
  const urlMatch = content.match(EXTRACTION_PATTERNS.tournamentUrl);
  if (urlMatch) {
    extracted.extractedTournamentUrl = urlMatch[1];
    
    const idMatch = extracted.extractedTournamentUrl.match(EXTRACTION_PATTERNS.tournamentId);
    if (idMatch) {
      extracted.extractedTournamentId = safeParseInt(idMatch[1]);
      if (extracted.extractedTournamentId) {
        console.log(`[EXTRACTOR] Found tournament ID: ${extracted.extractedTournamentId}`);
      }
    }
  }
  
  // === RECURRING GAME NAME (from first 2 lines only) ===
  const recurringInfo = extractRecurringGameName(content);
  if (recurringInfo) {
    extracted.extractedRecurringGameName = recurringInfo.name;
    extracted.extractedRecurringDayOfWeek = recurringInfo.dayOfWeek;
    extracted.extractedName = recurringInfo.name;
    console.log(`[EXTRACTOR] Recurring game: "${recurringInfo.name}" (${recurringInfo.dayOfWeek || 'no day detected'})`);
  }
  
  // === BUY-IN (Enhanced with breakdown) ===
  const buyInResult = extractBuyInWithBreakdown(content);
  if (buyInResult) {
    extracted.extractedBuyIn = sanitizeNumeric(buyInResult.total);
    extracted.extractedBuyInPrizepool = sanitizeNumeric(buyInResult.prizepool);
    extracted.extractedRake = sanitizeNumeric(buyInResult.rake);
    console.log(`[EXTRACTOR] Buy-in: $${buyInResult.total} (prizepool: $${buyInResult.prizepool || 'N/A'}, rake: $${buyInResult.rake || 'N/A'})`);
  }
  
  // === GUARANTEE ===
  const guaranteeStr = extractFirst(content, EXTRACTION_PATTERNS.guarantee);
  if (guaranteeStr) {
    extracted.extractedGuarantee = sanitizeNumeric(parseDollarAmount(guaranteeStr));
  }
  
  // === PRIZEPOOL ===
  const prizepoolStr = extractFirst(content, EXTRACTION_PATTERNS.prizepool);
  if (prizepoolStr) {
    extracted.extractedPrizePool = sanitizeNumeric(parseDollarAmount(prizepoolStr));
  }
  
  // === ENTRIES ===
  const entriesStr = extractFirst(content, EXTRACTION_PATTERNS.entries);
  if (entriesStr) {
    extracted.extractedTotalEntries = safeParseInt(entriesStr);
  }
  
  // === BAD BEAT JACKPOT ===
  const badBeatJackpot = extractBadBeatJackpot(content);
  if (badBeatJackpot) {
    extracted.extractedBadBeatJackpot = sanitizeNumeric(badBeatJackpot);
    console.log(`[EXTRACTOR] Bad beat jackpot: $${badBeatJackpot}`);
  }
  
  // === STARTING STACK ===
  const startingStack = extractStartingStack(content);
  if (startingStack) {
    extracted.extractedStartingStack = sanitizeNumeric(startingStack);
    console.log(`[EXTRACTOR] Starting stack: ${startingStack}`);
  }
  
  // === BLIND LEVELS ===
  const blindMinutes = extractBlindLevelMinutes(content);
  if (blindMinutes) {
    extracted.extractedBlindLevelMinutes = sanitizeNumeric(blindMinutes);
    console.log(`[EXTRACTOR] Blind levels: ${blindMinutes} minutes`);
  }
  
  // === LATE REGISTRATION ===
  const lateReg = extractLateRegistration(content);
  if (lateReg) {
    extracted.extractedLateRegTime = lateReg.time;
    extracted.extractedLateRegLevel = sanitizeNumeric(lateReg.level);
    console.log(`[EXTRACTOR] Late reg: ${lateReg.time || `level ${lateReg.level}`}`);
  }
  
  // ===================================================================
  // PLACEMENTS & PRIZES (Enhanced with Ticket Extraction)
  // ===================================================================
  
  // Parse placements using the new placementParser with ticket support
  const rawPlacements = parsePlacements(content);
  
  // Create full placement records (with ticket data)
  const placementRecords = createPlacementRecords(
    rawPlacements, 
    options.socialPostId || null,
    options.socialPostGameDataId || null
  );
  
  extracted.placementRecords = placementRecords;
  extracted.placementCount = placementRecords.length;
  
  // Legacy format for backward compatibility
  extracted.extractedPlacements = rawPlacements.map(p => ({
    place: p.place,
    name: p.playerName,
    prize: p.cashPrize,
    raw: p.rawText
  }));
  
  // Calculate legacy totals
  const firstPlace = placementRecords.find(p => p.place === 1);
  extracted.extractedFirstPlacePrize = sanitizeNumeric(firstPlace?.cashPrize || null);
  extracted.extractedTotalPrizesPaid = sanitizeNumeric(
    placementRecords.reduce((sum, p) => sum + (p.cashPrize || 0), 0) || null
  );
  
  if (placementRecords.length > 0) {
    console.log(`[EXTRACTOR] Found ${placementRecords.length} placements, total cash: $${extracted.extractedTotalPrizesPaid}`);
    
    // ===================================================================
    // NEW: Calculate ticket aggregates for reconciliation
    // ===================================================================
    const ticketAggregates = calculateTicketAggregates(placementRecords);
    
    // Merge aggregates into extracted object
    Object.assign(extracted, {
      totalTicketsExtracted: ticketAggregates.totalTicketsExtracted,
      totalTicketValue: ticketAggregates.totalTicketValue,
      ticketCountByType: ticketAggregates.ticketCountByType,
      ticketValueByType: ticketAggregates.ticketValueByType,
      totalCashPaid: ticketAggregates.totalCashPaid,
      totalPrizesWithTickets: ticketAggregates.totalPrizesWithTickets,
      totalTicketOnlyPrizes: ticketAggregates.totalTicketOnlyPrizes,
      reconciliation_accumulatorTicketCount: ticketAggregates.reconciliation_accumulatorTicketCount,
      reconciliation_accumulatorTicketValue: ticketAggregates.reconciliation_accumulatorTicketValue,
      reconciliation_totalPrizepoolPaid: ticketAggregates.reconciliation_totalPrizepoolPaid,
      reconciliation_cashPlusTotalTicketValue: ticketAggregates.reconciliation_cashPlusTotalTicketValue,
    });
    
    if (ticketAggregates.totalTicketsExtracted > 0) {
      console.log(`[EXTRACTOR] Tickets extracted: ${ticketAggregates.totalTicketsExtracted}, total value: $${ticketAggregates.totalTicketValue || 'unknown'}`);
    }
    
    // ===================================================================
    // NEW: Enhanced winner info with ticket details
    // ===================================================================
    const winnerInfo = extractEnhancedWinnerInfo(placementRecords);
    Object.assign(extracted, winnerInfo);
    
    // Also set legacy field
    extracted.extractedWinnerPrize = winnerInfo.extractedWinnerCashPrize;
  }
  
  // ===================================================================
  // NEW: Extract promotional ticket info (for promo posts)
  // ===================================================================
  const promoTicketInfo = extractPromoTickets(content);
  if (promoTicketInfo.hasTicketPrizes) {
    extracted.hasAdvertisedTickets = true;
    extracted.advertisedTickets = promoTicketInfo.ticketPrizes;
    extracted.advertisedTicketCount = promoTicketInfo.ticketSummary?.totalTicketCount || null;
    extracted.advertisedTicketValue = promoTicketInfo.ticketSummary?.totalEstimatedValue || null;
    
    // Get primary advertised ticket
    if (promoTicketInfo.ticketPrizes?.length > 0) {
      const primary = promoTicketInfo.ticketPrizes[0];
      extracted.advertisedTicketType = primary.prizeType;
      extracted.advertisedTicketDescription = primary.description;
    }
    
    console.log(`[EXTRACTOR] Promotional tickets found: ${extracted.advertisedTicketCount} ticket(s), value: $${extracted.advertisedTicketValue || 'unknown'}`);
  }
  
  // === VENUE NAME (FROM DATABASE) ===
  const venueMatch = await extractVenueFromDatabase(content);
  if (venueMatch) {
    extracted.extractedVenueName = venueMatch.venueName;
    extracted.extractedVenueId = venueMatch.venueId;
    extracted.venueMatchConfidence = sanitizeNumeric(venueMatch.confidence);
    extracted.venueMatchSource = venueMatch.matchSource;
  }
  
  // === DATE / DAY OF WEEK ===
  const dayMatch = content.match(EXTRACTION_PATTERNS.date[1]);
  if (dayMatch) {
    extracted.extractedDayOfWeek = dayMatch[0].toUpperCase();
    // inferGameDate now returns AEST-aware date
    extracted.extractedDate = inferGameDate(post.postedAt, extracted.extractedDayOfWeek).toISOString();
    extracted.dateSource = 'post_content';
  } else {
    // Use AEST day of week from the post date
    extracted.extractedDate = post.postedAt;
    extracted.extractedDayOfWeek = getDayOfWeek(post.postedAt); // Now returns AEST day
    extracted.dateSource = 'posted_at';
  }
  
  // === EFFECTIVE GAME DATE (Computed) ===
  // Priority: extractedDate (from content) > postedAt (fallback)
  // This provides a single canonical date for queries and sorting
  if (extracted.extractedDate && extracted.dateSource === 'post_content') {
    // Use the date extracted from post content (highest priority)
    extracted.effectiveGameDate = extracted.extractedDate;
    extracted.effectiveGameDateSource = 'extracted';
  } else if (post.postedAt) {
    // Fall back to when the post was published
    extracted.effectiveGameDate = post.postedAt;
    extracted.effectiveGameDateSource = 'posted_at';
  }
  
  console.log(`[EXTRACTOR] Effective game date: ${extracted.effectiveGameDate} (source: ${extracted.effectiveGameDateSource})`);
  
  // === START TIME ===
  const timeMatch = content.match(EXTRACTION_PATTERNS.time[0]);
  if (timeMatch) {
    extracted.extractedStartTime = timeMatch[0];
  }
  
  // === GAME VARIANT ===
  const variantMatch = content.match(EXTRACTION_PATTERNS.gameVariant[0]);
  if (variantMatch) {
    const variant = variantMatch[0].toUpperCase();
    if (variant.includes('NL') || variant.includes('HOLD')) {
      extracted.extractedGameVariant = 'NLHE';
    }
  } else {
    const ploMatch = content.match(EXTRACTION_PATTERNS.gameVariant[1]);
    if (ploMatch) {
      extracted.extractedGameVariant = 'PLO';
    }
  }
  
  // === TOURNAMENT TYPE (Enhanced) ===
  const tournamentType = extractTournamentType(content);
  extracted.extractedTournamentType = tournamentType.type;
  extracted.extractedGameTypes = tournamentType.indicators;
  
  if (tournamentType.type) {
    console.log(`[EXTRACTOR] Tournament type: ${tournamentType.type} (indicators: ${tournamentType.indicators.join(', ')})`);
  }
  
  // === SERIES INFO (with safe parseInt) ===
  const seriesPatterns = EXTRACTION_PATTERNS.series;
  
  const seriesNameMatch = content.match(seriesPatterns.name);
  if (seriesNameMatch) {
    extracted.extractedSeriesName = seriesNameMatch[0];
    extracted.isSeriesEvent = true;
  }
  
  const eventNumMatch = content.match(seriesPatterns.eventNumber);
  if (eventNumMatch && eventNumMatch[1]) {
    const parsedEventNum = safeParseInt(eventNumMatch[1]);
    if (parsedEventNum !== null) {
      extracted.extractedEventNumber = parsedEventNum;
      extracted.isSeriesEvent = true;
    }
  }
  
  const dayNumMatch = content.match(seriesPatterns.dayNumber);
  if (dayNumMatch && dayNumMatch[1]) {
    const parsedDayNum = safeParseInt(dayNumMatch[1]);
    if (parsedDayNum !== null) {
      extracted.extractedDayNumber = parsedDayNum;
    }
  }
  
  const flightMatch = content.match(seriesPatterns.flight);
  if (flightMatch) {
    extracted.extractedFlightLetter = flightMatch[1];
  }
  
  extracted.extractionDurationMs = Date.now() - startTime;
  
  // === FINAL SANITIZATION PASS ===
  // Ensure no NaN/Infinity values make it to DynamoDB
  const sanitized = sanitizeForDynamoDB(extracted);
  
  return sanitized;
};

// ===================================================================
// ENHANCED EXTRACTION FUNCTIONS
// ===================================================================

/**
 * Extract recurring game name from FIRST 2 LINES ONLY
 * This focuses on the headline/title where recurring names like "THURSDAY GRIND" appear
 * 
 * @param {string} content - Full post content
 * @returns {Object|null} { name, dayOfWeek } or null
 */
const extractRecurringGameName = (content) => {
  if (!content) return null;
  
  // Split into lines and take first 2 non-empty lines
  const lines = content.split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .slice(0, 2);
  
  if (lines.length === 0) return null;
  
  const headerText = lines.join(' ');
  
  // Try to extract a recurring game name pattern
  // Look for patterns like "THURSDAY GRIND", "MONDAY MADNESS", "SATURDAY SPECIAL"
  const patterns = [
    // Day + Event name: "THURSDAY GRIND", "MONDAY MADNESS"
    /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)\b/i,
    // Event name + Day: "GRIND THURSDAY", "SPECIAL SATURDAY"
    /\b([A-Z][A-Za-z]+(?:\s+[A-Z][A-Za-z]+)?)\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i,
    // Just event name in caps at start of header
    /^([A-Z]{2,}(?:\s+[A-Z]{2,})*)/
  ];
  
  for (const pattern of patterns) {
    const match = headerText.match(pattern);
    if (match) {
      let name = null;
      let dayOfWeek = null;
      
      // Check which capture groups matched
      if (match[1] && match[2]) {
        const first = match[1].toLowerCase();
        const second = match[2].toLowerCase();
        
        if (DAY_KEYWORDS[first]) {
          dayOfWeek = DAY_KEYWORDS[first];
          name = `${match[1].toUpperCase()} ${match[2].toUpperCase()}`;
        } else if (DAY_KEYWORDS[second]) {
          dayOfWeek = DAY_KEYWORDS[second];
          name = `${match[1].toUpperCase()} ${match[2].toUpperCase()}`;
        }
      } else if (match[1]) {
        name = match[1].trim();
        // Try to detect day from elsewhere in header
        for (const [key, value] of Object.entries(DAY_KEYWORDS)) {
          if (headerText.toLowerCase().includes(key)) {
            dayOfWeek = value;
            break;
          }
        }
      }
      
      if (name && name.length >= 3) {
        return { name, dayOfWeek };
      }
    }
  }
  
  return null;
};

/**
 * Extract buy-in with optional breakdown (prizepool + rake)
 * 
 * @param {string} content - Post content
 * @returns {Object|null} { total, prizepool, rake } or null
 */
const extractBuyInWithBreakdown = (content) => {
  if (!content) return null;
  
  // Try full buy-in line first: "Buy-in: $120 (Fully Dealt, $98 + $22)"
  const fullMatch = content.match(ENHANCED_PATTERNS.buyInFull);
  if (fullMatch) {
    const total = sanitizeNumeric(parseDollarAmount(fullMatch[1]));
    const prizepool = fullMatch[2] ? sanitizeNumeric(parseDollarAmount(fullMatch[2])) : null;
    const rake = fullMatch[3] ? sanitizeNumeric(parseDollarAmount(fullMatch[3])) : null;
    
    if (total) {
      return { total, prizepool, rake };
    }
  }
  
  // Try basic buy-in pattern
  const basicMatch = extractFirst(content, EXTRACTION_PATTERNS.buyIn);
  if (basicMatch) {
    const total = sanitizeNumeric(parseDollarAmount(basicMatch));
    
    // Look for breakdown near the buy-in mention
    const breakdownMatch = content.match(ENHANCED_PATTERNS.buyInBreakdown);
    if (breakdownMatch) {
      const prizepool = sanitizeNumeric(parseDollarAmount(breakdownMatch[1]));
      const rake = sanitizeNumeric(parseDollarAmount(breakdownMatch[2]));
      return { total, prizepool, rake };
    }
    
    return { total, prizepool: null, rake: null };
  }
  
  return null;
};

/**
 * Extract bad beat jackpot amount
 * 
 * @param {string} content - Post content
 * @returns {number|null} Jackpot amount or null
 */
const extractBadBeatJackpot = (content) => {
  if (!content) return null;
  
  for (const pattern of ENHANCED_PATTERNS.badBeatJackpot) {
    const match = content.match(pattern);
    if (match && match[1]) {
      return sanitizeNumeric(parseDollarAmount(match[1]));
    }
  }
  
  return null;
};

/**
 * Extract starting stack amount
 * 
 * @param {string} content - Post content
 * @returns {number|null} Starting stack or null
 */
const extractStartingStack = (content) => {
  if (!content) return null;
  
  for (const pattern of ENHANCED_PATTERNS.startingStack) {
    const match = content.match(pattern);
    if (match && match[1]) {
      let value = match[1].replace(/,/g, '');
      let stack = safeParseInt(value);
      
      // Handle 'k' suffix (30k = 30000)
      if (stack && match[0].toLowerCase().includes('k') && stack < 1000) {
        stack = stack * 1000;
      }
      
      // Reasonable stack range
      if (stack && stack >= 1000 && stack <= 1000000) {
        return sanitizeNumeric(stack);
      }
    }
  }
  
  return null;
};

/**
 * Extract blind level duration in minutes
 * 
 * @param {string} content - Post content
 * @returns {number|null} Minutes per level or null
 */
const extractBlindLevelMinutes = (content) => {
  if (!content) return null;
  
  for (const pattern of ENHANCED_PATTERNS.blindLevels) {
    const match = content.match(pattern);
    if (match && match[1]) {
      const minutes = safeParseInt(match[1]);
      // Reasonable range: 5 to 60 minutes
      if (minutes && minutes >= 5 && minutes <= 60) {
        return sanitizeNumeric(minutes);
      }
    }
  }
  
  return null;
};

/**
 * Extract late registration info
 * 
 * @param {string} content - Post content
 * @returns {Object|null} { time, level } or null
 */
const extractLateRegistration = (content) => {
  if (!content) return null;
  
  for (const pattern of ENHANCED_PATTERNS.lateReg) {
    const match = content.match(pattern);
    if (match && match[1]) {
      // Check if it's a time or a level
      if (match[1].includes(':')) {
        return { time: match[1], level: null };
      } else {
        return { time: null, level: safeParseInt(match[1]) };
      }
    }
  }
  
  return null;
};

// Valid TournamentType enum values from GraphQL schema
const VALID_TOURNAMENT_TYPES = [
  'FREEZEOUT',
  'REENTRY', 
  'RE_ENTRY',
  'REBUY',
  'BOUNTY',
  'KNOCKOUT',
  'SATELLITE',
  'TURBO',
  'HYPER_TURBO',
  'HYPERTURBO',
  'DEEPSTACK',
  'DEEP_STACK',
  'SHOOTOUT',
  'HEADS_UP',
  'SIT_AND_GO',
  'MTT',
  'STANDARD',
];

/**
 * Extract tournament type (FREEZEOUT, REENTRY, REBUY, etc.)
 * 
 * @param {string} content - Post content
 * @returns {Object} { type, indicators }
 */
const extractTournamentType = (content) => {
  if (!content) return { type: null, indicators: [] };
  
  const indicators = [];
  let type = null;
  
  // Check for freezeout
  for (const pattern of ENHANCED_PATTERNS.freezeout) {
    if (pattern.test(content)) {
      indicators.push('FREEZEOUT');
      if (!type) type = 'FREEZEOUT';
      break;
    }
  }
  
  // Check for re-entry (takes precedence over freezeout if both found)
  for (const pattern of ENHANCED_PATTERNS.reEntry) {
    if (pattern.test(content)) {
      indicators.push('REENTRY');
      type = 'REENTRY'; // Re-entry takes precedence
      break;
    }
  }
  
  // Check for rebuy/addon
  if (/\brebuy\b/i.test(content)) {
    indicators.push('REBUY');
    if (!type) type = 'REBUY';
  }
  
  if (/\badd[- ]?on\b/i.test(content)) {
    indicators.push('ADDON');
  }
  
  // Check for bounty/knockout
  if (/\b(bounty|knockout|ko)\b/i.test(content)) {
    indicators.push('BOUNTY');
    if (!type) type = 'BOUNTY';
  }
  
  // Check for satellite
  if (/\bsatellite\b/i.test(content)) {
    indicators.push('SATELLITE');
    if (!type) type = 'SATELLITE';
  }
  
  // Check for turbo/hyper
  if (/\bhyper[- ]?turbo\b/i.test(content)) {
    indicators.push('HYPERTURBO');
    if (!type) type = 'HYPERTURBO';
  } else if (/\bturbo\b/i.test(content)) {
    indicators.push('TURBO');
    if (!type) type = 'TURBO';
  }
  
  // Check for deepstack
  if (/\bdeep[- ]?stack\b/i.test(content)) {
    indicators.push('DEEPSTACK');
    if (!type) type = 'DEEPSTACK';
  }
  
  // Only return type if it's a valid enum value
  const validatedType = type && VALID_TOURNAMENT_TYPES.includes(type) ? type : null;
  
  return { type: validatedType, indicators };
};

/**
 * LEGACY: Extract placements and calculate prizes ONLY from placement lines
 * This is kept for backward compatibility - new code should use parsePlacements()
 * 
 * @deprecated Use parsePlacements() from placementParser.js instead
 */
const extractPlacementsAndPrizes = (content) => {
  const placements = [];
  const lines = content.split('\n');
  
  // Medal emoji to place mapping
  const medalToPlace = {
    '🥇': 1,
    '🥈': 2,
    '🥉': 3
  };
  
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length < 5) continue;
    
    // Pattern 1: "1st - Name - $500" or "1st: Name $500"
    let match = trimmed.match(/^(\d+)(?:st|nd|rd|th)\s*[-–—:.\s]+\s*([A-Za-z][A-Za-z\s.']+?)\s*[-–—:\s]+\s*\$?([\d,]+(?:\.\d{2})?)/i);
    
    if (match) {
      const place = safeParseInt(match[1]);
      const name = cleanPlayerName(match[2]);
      const prize = sanitizeNumeric(parseDollarAmount(match[3]));
      
      if (place && place > 0 && place <= 100 && name && prize && prize > 0) {
        placements.push({ place, name, prize, raw: trimmed });
        continue;
      }
    }
    
    // Pattern 2: "🥇 Name - $500"
    match = trimmed.match(/^([🥇🥈🥉])\s*([A-Za-z][A-Za-z\s.']+?)\s*[-–—:\s]+\s*\$?([\d,]+(?:\.\d{2})?)/);
    
    if (match) {
      const medal = match[1];
      const place = medalToPlace[medal];
      const name = cleanPlayerName(match[2]);
      const prize = sanitizeNumeric(parseDollarAmount(match[3]));
      
      if (place && name && prize && prize > 0) {
        placements.push({ place, name, prize, raw: trimmed });
        continue;
      }
    }
    
    // Pattern 3: "1. Name - $500"
    match = trimmed.match(/^(\d+)[.)]\s+([A-Za-z][A-Za-z\s.']+?)\s*[-–—:\s]+\s*\$?([\d,]+(?:\.\d{2})?)/);
    
    if (match) {
      const place = safeParseInt(match[1]);
      const name = cleanPlayerName(match[2]);
      const prize = sanitizeNumeric(parseDollarAmount(match[3]));
      
      if (place && place > 0 && place <= 100 && name && prize && prize > 0) {
        placements.push({ place, name, prize, raw: trimmed });
      }
    }
  }
  
  // Sort by place and dedupe
  placements.sort((a, b) => a.place - b.place);
  const seen = new Set();
  const uniquePlacements = placements.filter(p => {
    if (seen.has(p.place)) return false;
    seen.add(p.place);
    return true;
  });
  
  // Calculate totals
  const firstPlace = uniquePlacements.find(p => p.place === 1);
  const firstPlacePrize = firstPlace?.prize || null;
  const totalPrizesPaid = uniquePlacements.reduce((sum, p) => sum + (p.prize || 0), 0);
  
  return {
    placements: uniquePlacements,
    firstPlacePrize: sanitizeNumeric(firstPlacePrize),
    totalPrizesPaid: totalPrizesPaid > 0 ? sanitizeNumeric(totalPrizesPaid) : null
  };
};

// ===================================================================
// VENUE EXTRACTION FROM DATABASE
// ===================================================================

/**
 * Extract venue by matching against database
 */
const extractVenueFromDatabase = async (content) => {
  if (!content) return null;
  
  const venues = await getVenuesWithCache();
  if (!venues || venues.length === 0) {
    console.log('[EXTRACTOR] No venues in cache, falling back to patterns');
    return extractVenueFromPatterns(content);
  }
  
  const contentUpper = content.toUpperCase();
  const contentNormalized = normalizeForMatching(content);
  
  for (const venue of venues) {
    const namesToCheck = [];
    
    if (venue.name) {
      namesToCheck.push({ name: venue.name, type: 'name', priority: 1 });
    }
    if (venue.shortName) {
      namesToCheck.push({ name: venue.shortName, type: 'shortName', priority: 2 });
    }
    if (venue.aliases && Array.isArray(venue.aliases)) {
      venue.aliases.forEach(alias => {
        namesToCheck.push({ name: alias, type: 'alias', priority: 3 });
      });
    }
    
    for (const { name, type } of namesToCheck) {
      if (!name) continue;
      
      const nameUpper = name.toUpperCase();
      const nameNormalized = normalizeForMatching(name);
      
      if (contentUpper.includes(nameUpper)) {
        const wordBoundaryPattern = new RegExp(`\\b${escapeRegex(name)}\\b`, 'i');
        if (wordBoundaryPattern.test(content)) {
          console.log(`[EXTRACTOR] Database exact match: "${venue.name}" via ${type}: "${name}"`);
          return {
            venueId: venue.id,
            venueName: venue.name,
            confidence: type === 'name' ? 1.0 : type === 'shortName' ? 0.95 : 0.9,
            matchSource: `database_${type}`,
            entityId: venue.entityId
          };
        }
      }
      
      if (contentNormalized.includes(nameNormalized) && nameNormalized.length >= 3) {
        console.log(`[EXTRACTOR] Database normalized match: "${venue.name}" via ${type}: "${name}"`);
        return {
          venueId: venue.id,
          venueName: venue.name,
          confidence: type === 'name' ? 0.9 : type === 'shortName' ? 0.85 : 0.8,
          matchSource: `database_${type}_normalized`,
          entityId: venue.entityId
        };
      }
    }
  }
  
  console.log('[EXTRACTOR] No database venue match, trying pattern extraction');
  return extractVenueFromPatterns(content);
};

/**
 * Normalize text for fuzzy matching
 */
const normalizeForMatching = (text) => {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[''`]/g, '')
    .replace(/[.,-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

/**
 * Escape special regex characters
 */
const escapeRegex = (string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

/**
 * Fallback: Extract venue from patterns
 */
const extractVenueFromPatterns = (content) => {
  if (!content) return null;
  
  const patterns = [
    { pattern: /(?:at|@)\s+([A-Z][A-Za-z\s&'.]+(?:Hotel|Club|Casino|Pub|Bar|Room|Lounge|Leagues?))/i, confidence: 0.7 },
    { pattern: /venue\s*:?\s*([A-Z][A-Za-z\s&',]+(?:Hotel|Club|Casino|Pub|Bar|Room|Lounge|Leagues?)?)/i, confidence: 0.75 },
    { pattern: /Kings?\s*Room[,\s\-–—@]+([A-Za-z][A-Za-z\s&'.]+(?:Club|Leagues?)?)/i, confidence: 0.7 },
    { pattern: /📍\s*(?:Venue:?\s*)?([^📍\n]{3,50})/i, confidence: 0.6 }
  ];
  
  for (const { pattern, confidence } of patterns) {
    const match = content.match(pattern);
    if (match && match[1]) {
      const venueName = match[1].trim()
        .replace(/[-–—,]+$/, '')
        .replace(/\s+/g, ' ')
        .trim();
      
      if (venueName.length > 2 && venueName.length < 100) {
        console.log(`[EXTRACTOR] Pattern-extracted venue: "${venueName}"`);
        return {
          venueId: null,
          venueName,
          confidence,
          matchSource: 'pattern'
        };
      }
    }
  }
  
  return null;
};

// ===================================================================
// NEW: TICKET SUMMARY GENERATION (for API responses)
// ===================================================================

/**
 * Generate a TicketExtractionSummary for API response
 * Wraps the generateTicketSummary from placementParser for convenience
 * 
 * @param {Array} placementRecords - Placement records from extractGameData
 * @returns {Object} TicketExtractionSummary compatible object
 */
const buildTicketSummary = (placementRecords) => {
  return generateTicketSummary(placementRecords);
};

// ===================================================================
// NEW: RECONCILIATION HELPER
// ===================================================================

/**
 * Compare extracted data with a Game record and identify discrepancies
 * 
 * @param {Object} extracted - Extracted data from extractGameData
 * @param {Object} game - Game record from database
 * @returns {Object} SocialToGameReconciliation compatible object
 */
const compareWithGame = (extracted, game) => {
  const reconciliation = {
    social_totalCashPaid: extracted.totalCashPaid,
    social_totalTicketCount: extracted.totalTicketsExtracted,
    social_totalTicketValue: extracted.totalTicketValue,
    social_accumulatorCount: extracted.reconciliation_accumulatorTicketCount,
    social_accumulatorValue: extracted.reconciliation_accumulatorTicketValue,
    social_totalPlacements: extracted.placementCount,
    social_prizepoolTotal: extracted.reconciliation_cashPlusTotalTicketValue,
    
    game_prizepoolPaid: game?.prizepoolPaid || null,
    game_numberOfAccumulatorTicketsPaid: game?.numberOfAccumulatorTicketsPaid || null,
    game_accumulatorTicketValue: game?.accumulatorTicketValue || null,
    game_totalEntries: game?.totalEntries || null,
    game_hasAccumulatorTickets: game?.hasAccumulatorTickets || false,
    
    cashDifference: null,
    ticketCountDifference: null,
    ticketValueDifference: null,
    hasDiscrepancy: false,
    discrepancySeverity: 'NONE',
    discrepancyNotes: [],
    suggestedAction: null
  };
  
  if (!game) {
    return reconciliation;
  }
  
  // Calculate differences
  reconciliation.cashDifference = (extracted.totalCashPaid || 0) - (game.prizepoolPaid || 0);
  reconciliation.ticketCountDifference = (extracted.reconciliation_accumulatorTicketCount || 0) - (game.numberOfAccumulatorTicketsPaid || 0);
  reconciliation.ticketValueDifference = (extracted.reconciliation_accumulatorTicketValue || 0) - (game.accumulatorTicketValue || 0);
  
  // Determine if there's a discrepancy
  const hasCashDiscrepancy = Math.abs(reconciliation.cashDifference) > 1; // $1 tolerance
  const hasTicketCountDiscrepancy = reconciliation.ticketCountDifference !== 0;
  
  reconciliation.hasDiscrepancy = hasCashDiscrepancy || hasTicketCountDiscrepancy;
  
  if (reconciliation.hasDiscrepancy) {
    if (hasCashDiscrepancy) {
      reconciliation.discrepancyNotes.push(
        `Cash: Social=$${extracted.totalCashPaid || 0}, Game=$${game.prizepoolPaid || 0}`
      );
    }
    if (hasTicketCountDiscrepancy) {
      reconciliation.discrepancyNotes.push(
        `Tickets: Social=${extracted.reconciliation_accumulatorTicketCount || 0}, Game=${game.numberOfAccumulatorTicketsPaid || 0}`
      );
    }
    
    reconciliation.discrepancySeverity = Math.abs(reconciliation.cashDifference) > 100 ? 'MAJOR' : 'MINOR';
    reconciliation.suggestedAction = 'MANUAL_REVIEW';
  }
  
  return reconciliation;
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  // Main extraction
  extractGameData,
  
  // Sub-extractors
  extractRecurringGameName,
  extractBuyInWithBreakdown,
  extractBadBeatJackpot,
  extractStartingStack,
  extractBlindLevelMinutes,
  extractLateRegistration,
  extractTournamentType,
  extractPlacementsAndPrizes, // Legacy - kept for backward compatibility
  
  // Venue extraction
  extractVenueFromDatabase,
  extractVenueFromPatterns,
  getVenuesWithCache,
  clearVenueCache,
  
  // Numeric utilities
  safeParseInt,
  safeParseFloat,
  sanitizeNumeric,
  sanitizeForDynamoDB,
  
  // NEW: Ticket extraction (re-exported from placementParser)
  parsePlacements,
  createPlacementRecords,
  extractTickets,
  hasTicketIndicator,
  extractTicketValue,
  extractPromoTickets,
  calculateTicketAggregates,
  generateTicketSummary,
  extractEnhancedWinnerInfo,
  
  // NEW: API helpers
  buildTicketSummary,
  compareWithGame,
  
  // Constants
  ENHANCED_PATTERNS,
  DAY_KEYWORDS,
  TICKET_PATTERNS,
  TICKET_TYPE_MAP
};