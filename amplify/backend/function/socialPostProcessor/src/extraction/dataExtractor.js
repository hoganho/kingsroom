/**
 * extraction/dataExtractor.js
 * Extract structured game data from social post content
 * 
 * ENHANCED:
 * - Bad beat jackpot extraction
 * - Buy-in breakdown parsing (prizepool + rake)
 * - Tournament type from "Unlimited Re-Entries" etc.
 * - Starting stack extraction
 * - Blind level duration extraction
 * - Smarter first place / total prizes calculation
 * - Venue matching from database
 */

const { 
  EXTRACTION_PATTERNS, 
  extractFirst, 
  extractAll, 
  parseDollarAmount 
} = require('../utils/patterns');
const { getDayOfWeek, parseTimeString, inferGameDate } = require('../utils/dateUtils');
const { getAllVenues } = require('../utils/graphql');

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
// NEW: ENHANCED EXTRACTION PATTERNS
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
    /([\d,]+)(?:k)?\s*ss\b/i  // NEW: "30000ss" or "30kss" pattern
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
 * @returns {Object} Extracted data
 */
const extractGameData = async (post) => {
  const content = post.content || '';
  const startTime = Date.now();
  
  const extracted = {
    // Tournament identity
    extractedName: null,
    extractedTournamentUrl: null,
    extractedTournamentId: null,
    
    // NEW: Recurring game detection (from first 2 lines)
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
    
    // Financials
    extractedBuyIn: null,
    extractedBuyInPrizepool: null,    // NEW: Amount going to prizepool
    extractedRake: null,               // NEW: Rake portion of buy-in
    extractedGuarantee: null,
    extractedPrizePool: null,
    extractedFirstPlacePrize: null,
    extractedTotalPrizesPaid: null,
    
    // NEW: Bad beat jackpot
    extractedBadBeatJackpot: null,
    
    // Entries
    extractedTotalEntries: null,
    extractedTotalUniquePlayers: null,
    
    // Game type
    extractedGameType: 'TOURNAMENT',
    extractedTournamentType: null,
    extractedGameVariant: null,
    extractedGameTypes: [],
    
    // NEW: Structure details
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
    
    // Raw data for debugging
    patternMatches: {},
    extractedPrizes: [],
    extractedPlacements: []           // NEW: Structured placement data
  };
  
  // === TOURNAMENT URL & ID ===
  const urlMatch = content.match(EXTRACTION_PATTERNS.tournamentUrl);
  if (urlMatch) {
    extracted.extractedTournamentUrl = urlMatch[1];
    
    const idMatch = extracted.extractedTournamentUrl.match(EXTRACTION_PATTERNS.tournamentId);
    if (idMatch) {
      extracted.extractedTournamentId = parseInt(idMatch[1], 10);
      console.log(`[EXTRACTOR] Found tournament ID: ${extracted.extractedTournamentId}`);
    }
  }
  
  // === RECURRING GAME NAME (from first 2 lines only) ===
  const recurringInfo = extractRecurringGameName(content);
  if (recurringInfo) {
    extracted.extractedRecurringGameName = recurringInfo.name;
    extracted.extractedRecurringDayOfWeek = recurringInfo.dayOfWeek;
    extracted.extractedName = recurringInfo.name; // Also set as primary name
    console.log(`[EXTRACTOR] Recurring game: "${recurringInfo.name}" (${recurringInfo.dayOfWeek || 'no day detected'})`);
  }
  
  // === BUY-IN (Enhanced with breakdown) ===
  const buyInResult = extractBuyInWithBreakdown(content);
  if (buyInResult) {
    extracted.extractedBuyIn = buyInResult.total;
    extracted.extractedBuyInPrizepool = buyInResult.prizepool;
    extracted.extractedRake = buyInResult.rake;
    console.log(`[EXTRACTOR] Buy-in: $${buyInResult.total} (prizepool: $${buyInResult.prizepool || 'N/A'}, rake: $${buyInResult.rake || 'N/A'})`);
  }
  
  // === GUARANTEE ===
  const guaranteeStr = extractFirst(content, EXTRACTION_PATTERNS.guarantee);
  if (guaranteeStr) {
    extracted.extractedGuarantee = parseDollarAmount(guaranteeStr);
  }
  
  // === PRIZEPOOL ===
  const prizepoolStr = extractFirst(content, EXTRACTION_PATTERNS.prizepool);
  if (prizepoolStr) {
    extracted.extractedPrizePool = parseDollarAmount(prizepoolStr);
  }
  
  // === ENTRIES ===
  const entriesStr = extractFirst(content, EXTRACTION_PATTERNS.entries);
  if (entriesStr) {
    extracted.extractedTotalEntries = parseInt(entriesStr, 10);
  }
  
  // === BAD BEAT JACKPOT (NEW) ===
  const badBeatJackpot = extractBadBeatJackpot(content);
  if (badBeatJackpot) {
    extracted.extractedBadBeatJackpot = badBeatJackpot;
    console.log(`[EXTRACTOR] Bad beat jackpot: $${badBeatJackpot}`);
  }
  
  // === STARTING STACK (NEW) ===
  const startingStack = extractStartingStack(content);
  if (startingStack) {
    extracted.extractedStartingStack = startingStack;
    console.log(`[EXTRACTOR] Starting stack: ${startingStack}`);
  }
  
  // === BLIND LEVELS (NEW) ===
  const blindMinutes = extractBlindLevelMinutes(content);
  if (blindMinutes) {
    extracted.extractedBlindLevelMinutes = blindMinutes;
    console.log(`[EXTRACTOR] Blind levels: ${blindMinutes} minutes`);
  }
  
  // === LATE REGISTRATION (NEW) ===
  const lateReg = extractLateRegistration(content);
  if (lateReg) {
    extracted.extractedLateRegTime = lateReg.time;
    extracted.extractedLateRegLevel = lateReg.level;
    console.log(`[EXTRACTOR] Late reg: ${lateReg.time || `level ${lateReg.level}`}`);
  }
  
  // === PLACEMENTS & PRIZES (Enhanced - only from placement lines) ===
  const placementResult = extractPlacementsAndPrizes(content);
  extracted.extractedPlacements = placementResult.placements;
  extracted.extractedFirstPlacePrize = placementResult.firstPlacePrize;
  extracted.extractedTotalPrizesPaid = placementResult.totalPrizesPaid;
  
  if (placementResult.placements.length > 0) {
    console.log(`[EXTRACTOR] Found ${placementResult.placements.length} placements, total: $${placementResult.totalPrizesPaid}`);
  }
  
  // === VENUE NAME (FROM DATABASE) ===
  const venueMatch = await extractVenueFromDatabase(content);
  if (venueMatch) {
    extracted.extractedVenueName = venueMatch.venueName;
    extracted.extractedVenueId = venueMatch.venueId;
    extracted.venueMatchConfidence = venueMatch.confidence;
    extracted.venueMatchSource = venueMatch.matchSource;
  }
  
  // === DATE / DAY OF WEEK ===
  const dayMatch = content.match(EXTRACTION_PATTERNS.date[1]);
  if (dayMatch) {
    extracted.extractedDayOfWeek = dayMatch[0].toUpperCase();
    extracted.extractedDate = inferGameDate(post.postedAt, extracted.extractedDayOfWeek).toISOString();
    extracted.dateSource = 'post_content';
  } else {
    extracted.extractedDate = post.postedAt;
    extracted.extractedDayOfWeek = getDayOfWeek(post.postedAt);
    extracted.dateSource = 'posted_at';
  }
  
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
  
  // === SERIES INFO ===
  const seriesPatterns = EXTRACTION_PATTERNS.series;
  
  const seriesNameMatch = content.match(seriesPatterns.name);
  if (seriesNameMatch) {
    extracted.extractedSeriesName = seriesNameMatch[0];
    extracted.isSeriesEvent = true;
  }
  
  const eventNumMatch = content.match(seriesPatterns.eventNumber);
  if (eventNumMatch) {
    extracted.extractedEventNumber = parseInt(eventNumMatch[1], 10);
    extracted.isSeriesEvent = true;
  }
  
  const dayNumMatch = content.match(seriesPatterns.dayNumber);
  if (dayNumMatch) {
    extracted.extractedDayNumber = parseInt(dayNumMatch[1], 10);
  }
  
  const flightMatch = content.match(seriesPatterns.flight);
  if (flightMatch) {
    extracted.extractedFlightLetter = flightMatch[1];
  }
  
  extracted.extractionDurationMs = Date.now() - startTime;
  
  return extracted;
};

// ===================================================================
// NEW: ENHANCED EXTRACTION FUNCTIONS
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
  // Look for: "DAY_NAME + WORD(S)" like "THURSDAY GRIND", "FRIDAY SHOT CLOCK", "MONDAY MADNESS"
  
  let detectedDay = null;
  let gameName = null;
  
  // Check for day keywords
  for (const [keyword, day] of Object.entries(DAY_KEYWORDS)) {
    const regex = new RegExp(`\\b(${keyword})\\s+([A-Za-z]+(?:\\s+[A-Za-z]+)?)\\b`, 'i');
    const match = headerText.match(regex);
    
    if (match) {
      detectedDay = day;
      // Combine day + following words as the game name
      gameName = match[0].toUpperCase();
      break;
    }
  }
  
  // If no day-prefixed name found, try to extract a prominent name
  // Look for ALL CAPS phrases or quoted names
  if (!gameName) {
    // Pattern for ALL CAPS words (at least 2 characters, possibly with spaces)
    const allCapsMatch = headerText.match(/\b([A-Z]{2,}(?:\s+[A-Z]{2,})*)\b/);
    if (allCapsMatch && allCapsMatch[1].length >= 4) {
      gameName = allCapsMatch[1];
      
      // Try to detect day from the full header even if not adjacent
      for (const [keyword, day] of Object.entries(DAY_KEYWORDS)) {
        const dayRegex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (dayRegex.test(headerText)) {
          detectedDay = day;
          break;
        }
      }
    }
  }
  
  // Clean up the name - remove emojis, special chars, but keep spaces
  if (gameName) {
    gameName = gameName
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Must be at least 4 chars to be meaningful
    if (gameName.length >= 4) {
      return {
        name: gameName,
        dayOfWeek: detectedDay,
        sourceLines: lines
      };
    }
  }
  
  return null;
};

/**
 * Extract buy-in with prizepool/rake breakdown
 * ENHANCED: Scans ALL parentheses in content for breakdown patterns
 * Handles: "$120 ($98 + $22)" or "Buy-in: $120 (Fully Dealt, $98 + $22)"
 */
const extractBuyInWithBreakdown = (content) => {
  // First, extract the total buy-in
  let total = null;
  
  const fullMatch = content.match(ENHANCED_PATTERNS.buyInFull);
  if (fullMatch) {
    total = parseDollarAmount(fullMatch[1]);
  } else {
    const buyInStr = extractFirst(content, EXTRACTION_PATTERNS.buyIn);
    if (buyInStr) {
      total = parseDollarAmount(buyInStr);
    }
  }
  
  if (!total) return null;
  
  // Now scan ALL parentheses in content for breakdown patterns
  // Pattern: any (... $X + $Y ...) or (... X + Y ...)
  const parenPattern = /\(([^)]+)\)/g;
  let parenMatch;
  
  while ((parenMatch = parenPattern.exec(content)) !== null) {
    const parenContent = parenMatch[1];
    
    // Look for X + Y pattern inside parentheses
    const breakdownMatch = parenContent.match(/\$?\s*([\d,]+)\s*\+\s*\$?\s*([\d,]+)/);
    if (breakdownMatch) {
      const amount1 = parseDollarAmount(breakdownMatch[1]);
      const amount2 = parseDollarAmount(breakdownMatch[2]);
      
      // Skip if amounts seem too large (probably not buy-in breakdown)
      if (amount1 > 5000 || amount2 > 5000) continue;
      
      // Validate that sum equals or is close to total buy-in
      const sum = amount1 + amount2;
      if (Math.abs(sum - total) <= 5) {
        // Larger amount is typically prizepool, smaller is rake
        const prizepool = Math.max(amount1, amount2);
        const rake = Math.min(amount1, amount2);
        
        console.log(`[EXTRACTOR] Found buy-in breakdown in parentheses: $${prizepool} + $${rake} = $${sum}`);
        return { total, prizepool, rake };
      }
    }
  }
  
  // No breakdown found
  return { total, prizepool: null, rake: null };
};

/**
 * Extract bad beat jackpot amount
 */
const extractBadBeatJackpot = (content) => {
  for (const pattern of ENHANCED_PATTERNS.badBeatJackpot) {
    const match = content.match(pattern);
    if (match) {
      return parseDollarAmount(match[1]);
    }
  }
  return null;
};

/**
 * Extract starting stack
 * ENHANCED: 
 * - "ss" suffix indicates starting stack (e.g., "30000ss", "30kss")
 * - Starting stacks are typically >= 10,000 (buy-ins rarely > 5,000)
 * - Numbers followed by "k" or in the 10k-100k range are likely stacks
 */
const extractStartingStack = (content) => {
  // Try each pattern
  for (const pattern of ENHANCED_PATTERNS.startingStack) {
    const match = content.match(pattern);
    if (match) {
      let value = match[1].replace(/,/g, '');
      let stack = parseInt(value, 10);
      
      // Handle "k" suffix (30k = 30000)
      const hasK = /k/i.test(match[0]);
      if (hasK && stack < 1000) {
        stack *= 1000;
      }
      
      // Sanity check - starting stacks are typically 10k-500k
      // This helps distinguish from buy-ins (typically < $5000)
      if (stack >= 10000 && stack <= 500000) {
        return stack;
      }
      
      // Lower bound exception: if "ss" suffix is present, trust it more
      if (/ss\b/i.test(match[0]) && stack >= 5000) {
        return stack;
      }
    }
  }
  
  // Additional heuristic: Look for standalone large numbers that are likely stacks
  // Pattern: number >= 10000 followed by "chips" or near "stack" context
  const contextPattern = /\b(\d{2,3})[,.]?(\d{3})\s*(?:chips?|stack)/i;
  const contextMatch = content.match(contextPattern);
  if (contextMatch) {
    const stack = parseInt(contextMatch[1] + contextMatch[2], 10);
    if (stack >= 10000 && stack <= 500000) {
      return stack;
    }
  }
  
  return null;
};

/**
 * Extract blind level duration in minutes
 */
const extractBlindLevelMinutes = (content) => {
  for (const pattern of ENHANCED_PATTERNS.blindLevels) {
    const match = content.match(pattern);
    if (match) {
      const minutes = parseInt(match[1], 10);
      // Sanity check - blind levels are typically 10-60 minutes
      if (minutes >= 5 && minutes <= 120) {
        return minutes;
      }
    }
  }
  return null;
};

/**
 * Extract late registration info
 */
const extractLateRegistration = (content) => {
  for (const pattern of ENHANCED_PATTERNS.lateReg) {
    const match = content.match(pattern);
    if (match) {
      const value = match[1];
      
      // Check if it's a time or level
      if (/\d{1,2}:\d{2}/.test(value)) {
        return { time: value, level: null };
      } else {
        return { time: null, level: parseInt(value, 10) };
      }
    }
  }
  return null;
};

/**
 * Extract tournament type from indicators
 */
const extractTournamentType = (content) => {
  const indicators = [];
  let type = null;
  
  // Check for re-entry (REBUY)
  for (const pattern of ENHANCED_PATTERNS.reEntry) {
    if (pattern.test(content)) {
      indicators.push('RE-ENTRY');
      type = 'REBUY';
      break;
    }
  }
  
  // Check for freezeout
  for (const pattern of ENHANCED_PATTERNS.freezeout) {
    if (pattern.test(content)) {
      indicators.push('FREEZEOUT');
      type = 'FREEZEOUT';
      break;
    }
  }
  
  // Check other patterns from EXTRACTION_PATTERNS
  const typePatterns = EXTRACTION_PATTERNS.tournamentType;
  
  if (typePatterns.bounty && typePatterns.bounty.test(content)) {
    indicators.push('BOUNTY');
    if (!type) type = 'REBUY'; // Bounty tournaments are typically rebuy
  }
  if (typePatterns.satellite && typePatterns.satellite.test(content)) {
    indicators.push('SATELLITE');
    if (!type) type = 'SATELLITE';
  }
  if (typePatterns.deepstack && typePatterns.deepstack.test(content)) {
    indicators.push('DEEPSTACK');
    if (!type) type = 'DEEPSTACK';
  }
  if (typePatterns.turbo && typePatterns.turbo.test(content)) {
    indicators.push('TURBO');
  }
  if (typePatterns.rebuy && typePatterns.rebuy.test(content)) {
    indicators.push('REBUY');
    if (!type) type = 'REBUY';
  }
  
  return { type, indicators };
};

/**
 * Extract placements and calculate prizes ONLY from placement lines
 * This prevents adding up random dollar amounts in the content
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
      const place = parseInt(match[1], 10);
      const name = cleanPlayerName(match[2]);
      const prize = parseDollarAmount(match[3]);
      
      if (place > 0 && place <= 100 && name && prize > 0) {
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
      const prize = parseDollarAmount(match[3]);
      
      if (place && name && prize > 0) {
        placements.push({ place, name, prize, raw: trimmed });
        continue;
      }
    }
    
    // Pattern 3: "1. Name - $500"
    match = trimmed.match(/^(\d+)[.)]\s+([A-Za-z][A-Za-z\s.']+?)\s*[-–—:\s]+\s*\$?([\d,]+(?:\.\d{2})?)/);
    
    if (match) {
      const place = parseInt(match[1], 10);
      const name = cleanPlayerName(match[2]);
      const prize = parseDollarAmount(match[3]);
      
      if (place > 0 && place <= 100 && name && prize > 0) {
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
    firstPlacePrize,
    totalPrizesPaid: totalPrizesPaid > 0 ? totalPrizesPaid : null
  };
};

/**
 * Clean player name
 */
const cleanPlayerName = (name) => {
  if (!name) return null;
  
  let cleaned = name
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[-–—:.,]+$/, '')
    .replace(/^\s*[-–—:.,]+/, '')
    .trim();
  
  if (cleaned.length < 2 || cleaned.length > 50) return null;
  if (!/^[A-Za-z]/.test(cleaned)) return null;
  
  return cleaned;
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
// EXPORTS
// ===================================================================

module.exports = {
  extractGameData,
  extractRecurringGameName,
  extractBuyInWithBreakdown,
  extractBadBeatJackpot,
  extractStartingStack,
  extractBlindLevelMinutes,
  extractTournamentType,
  extractPlacementsAndPrizes,
  extractVenueFromDatabase,
  extractVenueFromPatterns,
  getVenuesWithCache,
  clearVenueCache,
  ENHANCED_PATTERNS,
  DAY_KEYWORDS
};