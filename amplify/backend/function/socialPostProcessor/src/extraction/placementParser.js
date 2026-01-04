/**
 * extraction/placementParser.js
 * Parse tournament placement/results lines from social posts
 * 
 * ENHANCED:
 * - Comprehensive ticket/non-cash prize extraction
 * - Support for various ticket formats (satellite, accumulator, main event seats, etc.)
 * - Ticket-only placements (no cash prize)
 * - Prizepool ticket extraction for promotional posts
 */

const { MEDAL_TO_PLACE, parseDollarAmount } = require('../utils/patterns');
const { v4: uuidv4 } = require('uuid');

// ===================================================================
// TICKET PATTERNS - Comprehensive list of non-cash prize indicators
// ===================================================================

const TICKET_PATTERNS = {
  // Accumulator tickets (very common in Australian poker)
  accumulator: [
    /accumulator\s*ticket/i,
    /\bacc\s*ticket/i,
    /\+\s*acc(?:umulator)?(?:\s*ticket)?/i,
    /acc(?:umulator)?\s*(?:seat|entry)/i,
    /\*+$/,  // Asterisks at end of line often indicate accumulator
    /\(\s*acc\s*\)/i,
  ],
  
  // Satellite tickets
  satellite: [
    /satellite\s*(?:seat|ticket|entry)/i,
    /sat(?:ellite)?\s*(?:seat|ticket|entry)/i,
    /\bsat\s*ticket/i,
    /satellite\s*to\s*/i,
  ],
  
  // Main event / major event seats
  mainEvent: [
    /main\s*event\s*(?:seat|ticket|entry|package)/i,
    /ME\s*(?:seat|ticket|entry)/i,
    /championship\s*(?:seat|ticket|entry)/i,
    /\$[\d,]+\s*(?:main|ME)\s*(?:seat|ticket)?/i,
    /seat\s*(?:to|into)\s*(?:the\s*)?main/i,
  ],
  
  // Package deals
  package: [
    /travel\s*package/i,
    /accommodation\s*package/i,
    /hotel\s*package/i,
    /\bpackage\b/i,
    /all[- ]?inclusive/i,
  ],
  
  // Bounty tickets
  bounty: [
    /bounty\s*(?:ticket|entry|seat)/i,
    /bounty\s*hunter\s*(?:ticket|entry)/i,
    /PKO\s*(?:ticket|entry|seat)/i,
    /knockout\s*(?:ticket|entry|seat)/i,
  ],
  
  // Free entry / reentry
  freeEntry: [
    /free\s*(?:entry|seat|ticket)/i,
    /complimentary\s*(?:entry|seat|ticket)/i,
    /free\s*re[- ]?entry/i,
    /bonus\s*(?:entry|seat|ticket)/i,
    /added\s*(?:entry|seat|ticket)/i,
  ],
  
  // Generic tickets
  genericTicket: [
    /\bticket\s*(?:to|for|into)/i,
    /\bseat\s*(?:to|for|into)/i,
    /\bentry\s*(?:to|for|into)/i,
    /tournament\s*(?:ticket|entry|seat)/i,
    /event\s*(?:ticket|entry|seat)/i,
  ],
  
  // Vouchers and credits
  voucher: [
    /\bvoucher/i,
    /\bcredit/i,
    /gift\s*card/i,
    /casino\s*(?:credit|voucher)/i,
    /food\s*(?:credit|voucher)/i,
    /bar\s*(?:credit|voucher)/i,
  ],
  
  // Series-specific tickets
  series: [
    /WSOP\s*(?:seat|ticket|entry)/i,
    /APT\s*(?:seat|ticket|entry)/i,
    /APPT\s*(?:seat|ticket|entry)/i,
    /WPT\s*(?:seat|ticket|entry)/i,
    /series\s*(?:seat|ticket|entry)/i,
  ],
  
  // Value indicators (e.g., "$550 seat" or "seat valued at $1100")
  valueIndicators: [
    /\$[\d,]+\s*(?:seat|ticket|entry)/i,
    /(?:seat|ticket|entry)\s*(?:valued?\s*(?:at)?|worth)\s*\$?[\d,]+/i,
    /\([\d,]+\s*value\)/i,
  ],
};

// Map ticket type to standardized enum
const TICKET_TYPE_MAP = {
  accumulator: 'ACCUMULATOR_TICKET',
  satellite: 'SATELLITE_TICKET',
  mainEvent: 'MAIN_EVENT_SEAT',
  package: 'TRAVEL_PACKAGE',
  bounty: 'BOUNTY_TICKET',
  freeEntry: 'TOURNAMENT_ENTRY',
  genericTicket: 'TOURNAMENT_TICKET',
  voucher: 'VOUCHER',
  series: 'SERIES_TICKET',
  valueIndicators: 'VALUED_SEAT',
};

// ===================================================================
// TICKET EXTRACTION FUNCTIONS
// ===================================================================

/**
 * Extract all ticket/non-cash prize information from text
 * 
 * @param {string} text - Text to analyze
 * @returns {Array} Array of ticket objects
 */
const extractTickets = (text) => {
  if (!text) return [];
  
  const tickets = [];
  const foundTypes = new Set();
  
  for (const [ticketType, patterns] of Object.entries(TICKET_PATTERNS)) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && !foundTypes.has(ticketType)) {
        foundTypes.add(ticketType);
        
        const ticket = {
          prizeType: TICKET_TYPE_MAP[ticketType] || 'UNKNOWN_TICKET',
          description: getTicketDescription(ticketType, match[0]),
          matchedText: match[0],
          estimatedValue: extractTicketValue(text),
          rawText: text
        };
        
        tickets.push(ticket);
      }
    }
  }
  
  return tickets;
};

/**
 * Get human-readable description for ticket type
 */
const getTicketDescription = (ticketType, matchedText) => {
  const descriptions = {
    accumulator: 'Accumulator Ticket',
    satellite: 'Satellite Entry',
    mainEvent: 'Main Event Seat',
    package: 'Travel/Accommodation Package',
    bounty: 'Bounty Tournament Entry',
    freeEntry: 'Free Tournament Entry',
    genericTicket: 'Tournament Ticket',
    voucher: 'Voucher/Credit',
    series: 'Series Event Ticket',
    valueIndicators: 'Valued Seat',
  };
  
  return descriptions[ticketType] || matchedText;
};

/**
 * Extract estimated value from ticket description
 * Looks for "$X seat" or "valued at $X" patterns
 */
const extractTicketValue = (text) => {
  if (!text) return null;
  
  // Pattern: "$550 seat" or "$1,100 ticket"
  const valuePrefixMatch = text.match(/\$?([\d,]+)\s*(?:seat|ticket|entry)/i);
  if (valuePrefixMatch) {
    return parseDollarAmount(valuePrefixMatch[1]);
  }
  
  // Pattern: "valued at $550" or "worth $1100"
  const valueSuffixMatch = text.match(/(?:valued?\s*(?:at)?|worth)\s*\$?([\d,]+)/i);
  if (valueSuffixMatch) {
    return parseDollarAmount(valueSuffixMatch[1]);
  }
  
  // Pattern: "(550 value)" or "($550)"
  const parenthesesMatch = text.match(/\([\$]?([\d,]+)\s*(?:value)?\)/i);
  if (parenthesesMatch) {
    return parseDollarAmount(parenthesesMatch[1]);
  }
  
  return null;
};

/**
 * Check if text contains any ticket indicators
 */
const hasTicketIndicator = (text) => {
  if (!text) return false;
  
  for (const patterns of Object.values(TICKET_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(text)) {
        return true;
      }
    }
  }
  
  return false;
};

// ===================================================================
// PLACEMENT PARSING
// ===================================================================

/**
 * Parse placement lines from post content
 * 
 * @param {string} content - Post content text
 * @returns {Array} Array of placement objects
 */
const parsePlacements = (content) => {
  if (!content) return [];
  
  const placements = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    const placement = parsePlacementLine(line);
    if (placement) {
      placements.push(placement);
    }
  }
  
  // Sort by place
  placements.sort((a, b) => a.place - b.place);
  
  // Deduplicate by place (keep first occurrence)
  const seen = new Set();
  const uniquePlacements = placements.filter(p => {
    if (seen.has(p.place)) return false;
    seen.add(p.place);
    return true;
  });
  
  return uniquePlacements;
};

/**
 * Parse a single line for placement info
 * 
 * @param {string} line - Single line of text
 * @returns {Object|null} Placement object or null
 */
const parsePlacementLine = (line) => {
  if (!line || line.trim().length < 5) return null;
  
  const trimmed = line.trim();
  
  // Try different patterns
  let result = null;
  
  // Pattern 1: "1st - John Smith - $500" or "1st: John Smith $500"
  result = tryOrdinalPattern(trimmed);
  if (result) return result;
  
  // Pattern 2: "1. John Smith - $500" or "1) John Smith $500"
  result = tryNumberedPattern(trimmed);
  if (result) return result;
  
  // Pattern 3: "🥇 John Smith - $500"
  result = tryMedalPattern(trimmed);
  if (result) return result;
  
  // Pattern 4: "1st - John Smith - Satellite Ticket" (ticket only, no cash)
  result = tryTicketOnlyPattern(trimmed);
  if (result) return result;
  
  // Pattern 5: "$500 - John Smith" (prize first)
  result = tryPrizeFirstPattern(trimmed);
  if (result) return result;
  
  return null;
};

/**
 * Try ordinal pattern: "1st - Name - $Prize" or "1st - Name - Ticket"
 */
const tryOrdinalPattern = (line) => {
  // Match: 1st, 2nd, 3rd, 4th, etc.
  const pattern = /^(\d+)(?:st|nd|rd|th)\s*[-–—:.\s]+\s*([A-Za-z][A-Za-z\s.']+)\s*[-–—:\s]+\s*(.+)$/i;
  const match = line.match(pattern);
  
  if (match) {
    const place = parseInt(match[1], 10);
    const playerName = cleanPlayerName(match[2]);
    const prizeInfo = parsePrizeSection(match[3]);
    
    if (place > 0 && place <= 100 && playerName) {
      return {
        place,
        playerName,
        ...prizeInfo,
        rawText: line
      };
    }
  }
  
  return null;
};

/**
 * Try numbered pattern: "1. Name - $Prize" or "1) Name $Prize"
 */
const tryNumberedPattern = (line) => {
  const pattern = /^(\d+)[.)]\s+([A-Za-z][A-Za-z\s.']+?)\s*[-–—:\s]+?\s*(.+)$/;
  const match = line.match(pattern);
  
  if (match) {
    const place = parseInt(match[1], 10);
    const playerName = cleanPlayerName(match[2]);
    const prizeInfo = parsePrizeSection(match[3]);
    
    if (place > 0 && place <= 100 && playerName) {
      return {
        place,
        playerName,
        ...prizeInfo,
        rawText: line
      };
    }
  }
  
  return null;
};

/**
 * Try medal emoji pattern: "🥇 Name - $Prize"
 */
const tryMedalPattern = (line) => {
  const pattern = /^([🥇🥈🥉])\s*([A-Za-z][A-Za-z\s.']+?)\s*[-–—:\s]+\s*(.+)$/;
  const match = line.match(pattern);
  
  if (match) {
    const medal = match[1];
    const place = MEDAL_TO_PLACE[medal];
    const playerName = cleanPlayerName(match[2]);
    const prizeInfo = parsePrizeSection(match[3]);
    
    if (place && playerName) {
      return {
        place,
        playerName,
        ...prizeInfo,
        rawText: line
      };
    }
  }
  
  return null;
};

/**
 * Try ticket-only pattern: "1st - Name - Satellite Ticket" (no dollar amount)
 * This catches placements where the prize is only a ticket, no cash
 */
const tryTicketOnlyPattern = (line) => {
  // Match lines with ordinal but no dollar sign in prize section
  const pattern = /^(\d+)(?:st|nd|rd|th)\s*[-–—:.\s]+\s*([A-Za-z][A-Za-z\s.']+?)\s*[-–—:\s]+\s*([^$\d].+)$/i;
  const match = line.match(pattern);
  
  if (match) {
    const place = parseInt(match[1], 10);
    const playerName = cleanPlayerName(match[2]);
    const prizePart = match[3].trim();
    
    // Check if it actually contains ticket indicators
    if (place > 0 && place <= 100 && playerName && hasTicketIndicator(prizePart)) {
      const tickets = extractTickets(prizePart);
      
      return {
        place,
        playerName,
        cashPrize: null,
        cashPrizeRaw: null,
        hasNonCashPrize: tickets.length > 0,
        nonCashPrizes: tickets,
        totalEstimatedValue: tickets.reduce((sum, t) => sum + (t.estimatedValue || 0), 0) || null,
        wasChop: false,
        wasICMDeal: false,
        rawText: line
      };
    }
  }
  
  return null;
};

/**
 * Try prize-first pattern: "$500 - John Smith"
 */
const tryPrizeFirstPattern = (line) => {
  const pattern = /^\$?([\d,]+(?:\.\d{2})?)\s*[-–—:]\s*([A-Za-z][A-Za-z\s.']+)$/;
  const match = line.match(pattern);
  
  if (match) {
    const cashPrize = parseDollarAmount(match[1]);
    const playerName = cleanPlayerName(match[2]);
    
    // We don't know the place, so skip unless context provides it
    // This pattern is less reliable
    return null;
  }
  
  return null;
};

/**
 * Clean up player name
 */
const cleanPlayerName = (name) => {
  if (!name) return null;
  
  let cleaned = name
    .trim()
    .replace(/\s+/g, ' ')           // Normalize whitespace
    .replace(/[-–—:.,]+$/, '')      // Remove trailing punctuation
    .replace(/^\s*[-–—:.,]+/, '')   // Remove leading punctuation
    .trim();
  
  // Validate: must have at least 2 chars, likely a name
  if (cleaned.length < 2 || cleaned.length > 50) return null;
  
  // Must start with a letter
  if (!/^[A-Za-z]/.test(cleaned)) return null;
  
  return cleaned;
};

/**
 * Parse the prize section of a placement line
 * Handles both cash and non-cash prizes
 * 
 * @param {string} prizeSection - The prize portion of the line
 * @returns {Object} { cashPrize, cashPrizeRaw, hasNonCashPrize, nonCashPrizes, totalEstimatedValue, wasChop }
 */
const parsePrizeSection = (prizeSection) => {
  const result = {
    cashPrize: null,
    cashPrizeRaw: null,
    hasNonCashPrize: false,
    nonCashPrizes: [],
    totalEstimatedValue: null,
    wasChop: false,
    wasICMDeal: false
  };
  
  if (!prizeSection) return result;
  
  // Check for chop/deal indicators
  if (/\b(chop|chopped?)\b/i.test(prizeSection)) {
    result.wasChop = true;
  }
  if (/\bICM\b/i.test(prizeSection)) {
    result.wasICMDeal = true;
  }
  
  // Extract cash prize
  const cashMatch = prizeSection.match(/\$?([\d,]+(?:\.\d{2})?)/);
  if (cashMatch) {
    result.cashPrizeRaw = cashMatch[0];
    result.cashPrize = parseDollarAmount(cashMatch[1]);
  }
  
  // Extract all ticket/non-cash prizes using comprehensive patterns
  const tickets = extractTickets(prizeSection);
  if (tickets.length > 0) {
    result.hasNonCashPrize = true;
    result.nonCashPrizes = tickets;
  }
  
  // Calculate total estimated value
  let totalValue = result.cashPrize || 0;
  for (const ticket of result.nonCashPrizes) {
    if (ticket.estimatedValue) {
      totalValue += ticket.estimatedValue;
    }
  }
  result.totalEstimatedValue = totalValue > 0 ? totalValue : null;
  
  return result;
};

/**
 * Create placement records ready for database insertion
 * 
 * @param {Array} placements - Parsed placements
 * @param {string} socialPostId - Parent post ID
 * @param {string} socialPostGameDataId - Parent extraction ID
 * @returns {Array} Placement records with IDs
 */
const createPlacementRecords = (placements, socialPostId, socialPostGameDataId) => {
  return placements.map(p => ({
    id: uuidv4(),
    socialPostId,
    socialPostGameDataId,
    place: p.place,
    playerName: p.playerName,
    cashPrize: p.cashPrize,
    cashPrizeRaw: p.cashPrizeRaw,
    hasNonCashPrize: p.hasNonCashPrize,
    nonCashPrizes: p.nonCashPrizes.length > 0 ? JSON.stringify(p.nonCashPrizes) : null,
    totalEstimatedValue: p.totalEstimatedValue,
    wasChop: p.wasChop,
    wasICMDeal: p.wasICMDeal,
    rawText: p.rawText
  }));
};

/**
 * Extract winner info from placements
 * 
 * @param {Array} placements - Parsed placements
 * @returns {Object} { winnerName, winnerPrize }
 */
const extractWinnerInfo = (placements) => {
  const firstPlace = placements.find(p => p.place === 1);
  
  if (firstPlace) {
    return {
      extractedWinnerName: firstPlace.playerName,
      extractedWinnerPrize: firstPlace.cashPrize,
      extractedWinnerHasTicket: firstPlace.hasNonCashPrize,
      extractedWinnerTotalValue: firstPlace.totalEstimatedValue
    };
  }
  
  return {
    extractedWinnerName: null,
    extractedWinnerPrize: null,
    extractedWinnerHasTicket: false,
    extractedWinnerTotalValue: null
  };
};

// ===================================================================
// PROMOTIONAL POST TICKET EXTRACTION
// ===================================================================

/**
 * Extract ticket information from promotional post content
 * This is for posts advertising tournaments that include ticket prizes
 * 
 * @param {string} content - Full post content
 * @returns {Object} { hasTicketPrizes, ticketPrizes, ticketSummary }
 */
const extractPromoTickets = (content) => {
  if (!content) {
    return {
      hasTicketPrizes: false,
      ticketPrizes: [],
      ticketSummary: null
    };
  }
  
  // Patterns for promotional ticket announcements
  const promoTicketPatterns = [
    // "Win a $1100 Main Event Seat!"
    /win\s*(?:a\s*)?\$?([\d,]+)\s*(?:main\s*event\s*)?(?:seat|ticket|entry)/gi,
    // "Satellite to $2500 Championship"
    /satellite\s*(?:to|for|into)\s*\$?([\d,]+)\s*(\w+)/gi,
    // "Accumulator tickets for top 5"
    /(?:accumulator|acc)\s*tickets?\s*(?:for|to)\s*(?:top\s*)?(\d+)/gi,
    // "$550 seat added to prize pool"
    /\$?([\d,]+)\s*(?:seat|ticket)\s*(?:added|awarded)/gi,
    // "Plus accumulator tickets"
    /plus\s*(?:accumulator|acc|satellite|bounty)\s*tickets?/gi,
    // "Tickets to Main Event included"
    /tickets?\s*(?:to|for|into)\s*(?:the\s*)?(\w+\s*\w*)\s*(?:included|awarded|added)/gi,
    // "X accumulator tickets in the prize pool"
    /(\d+)\s*(?:accumulator|acc|satellite)\s*tickets?\s*(?:in|added)/gi,
  ];
  
  const ticketPrizes = [];
  const foundMatches = new Set();
  
  for (const pattern of promoTicketPatterns) {
    let match;
    // Reset lastIndex for global patterns
    pattern.lastIndex = 0;
    
    while ((match = pattern.exec(content)) !== null) {
      const matchKey = match[0].toLowerCase();
      if (!foundMatches.has(matchKey)) {
        foundMatches.add(matchKey);
        
        // Try to extract value from match
        const valueMatch = match[0].match(/\$?([\d,]+)/);
        const value = valueMatch ? parseDollarAmount(valueMatch[1]) : null;
        
        // Try to extract quantity
        const qtyMatch = match[0].match(/(\d+)\s*(?:accumulator|acc|satellite|ticket)/i);
        const quantity = qtyMatch ? parseInt(qtyMatch[1], 10) : 1;
        
        ticketPrizes.push({
          matchedText: match[0],
          estimatedValue: value,
          quantity,
          tickets: extractTickets(match[0])
        });
      }
    }
  }
  
  // Generate summary
  let ticketSummary = null;
  if (ticketPrizes.length > 0) {
    const totalValue = ticketPrizes.reduce((sum, t) => sum + (t.estimatedValue || 0), 0);
    const totalQty = ticketPrizes.reduce((sum, t) => sum + t.quantity, 0);
    ticketSummary = {
      totalTicketCount: totalQty,
      totalEstimatedValue: totalValue || null,
      ticketTypes: [...new Set(ticketPrizes.flatMap(t => t.tickets.map(tk => tk.prizeType)))]
    };
  }
  
  return {
    hasTicketPrizes: ticketPrizes.length > 0,
    ticketPrizes,
    ticketSummary
  };
};

// ===================================================================
// AGGREGATE TICKET EXTRACTION FOR RECONCILIATION
// ===================================================================

/**
 * Calculate aggregate ticket statistics from placements
 * Used for populating SocialPostGameData reconciliation fields
 * 
 * @param {Array} placements - Parsed placements from parsePlacements()
 * @returns {Object} Aggregate statistics for database storage
 */
const calculateTicketAggregates = (placements) => {
  if (!placements || placements.length === 0) {
    return {
      totalTicketsExtracted: 0,
      totalTicketValue: null,
      ticketCountByType: {},
      ticketValueByType: {},
      totalCashPaid: null,
      totalPrizesWithTickets: 0,
      totalTicketOnlyPrizes: 0,
      reconciliation_accumulatorTicketCount: 0,
      reconciliation_accumulatorTicketValue: null,
      reconciliation_totalPrizepoolPaid: null,
      reconciliation_cashPlusTotalTicketValue: null,
    };
  }
  
  let totalTickets = 0;
  let totalTicketValue = 0;
  let totalCash = 0;
  let prizesWithTickets = 0;
  let ticketOnlyPrizes = 0;
  const countByType = {};
  const valueByType = {};
  let accumulatorCount = 0;
  let accumulatorValue = 0;
  
  // =====================================================
  // FIX: Added missing for loop!
  // =====================================================
  for (const placement of placements) {
    // Cash tracking
    if (placement.cashPrize) {
      totalCash += placement.cashPrize;
    }
    
    // Ticket tracking
    if (placement.hasNonCashPrize && placement.nonCashPrizes) {
      // Parse JSON string if necessary
      let ticketsArray = placement.nonCashPrizes;
      
      if (typeof ticketsArray === 'string') {
        try {
          ticketsArray = JSON.parse(ticketsArray);
        } catch (e) {
          console.error(`[TICKETS] Failed to parse nonCashPrizes JSON: ${e.message}`);
          ticketsArray = [];
        }
      }
      
      // Now safely check if it's an array with items
      if (Array.isArray(ticketsArray) && ticketsArray.length > 0) {
        prizesWithTickets++;
        
        // Check if ticket-only (no cash)
        if (!placement.cashPrize || placement.cashPrize === 0) {
          ticketOnlyPrizes++;
        }
        
        for (const ticket of ticketsArray) {
          totalTickets++;
          const ticketType = ticket.prizeType || 'OTHER';
          const ticketVal = ticket.estimatedValue || 0;
          
          // Count by type
          countByType[ticketType] = (countByType[ticketType] || 0) + 1;
          
          // Value by type
          if (ticketVal > 0) {
            valueByType[ticketType] = (valueByType[ticketType] || 0) + ticketVal;
            totalTicketValue += ticketVal;
          }
          
          // Special tracking for accumulators (most common for reconciliation)
          if (ticketType === 'ACCUMULATOR_TICKET') {
            accumulatorCount++;
            accumulatorValue += ticketVal;
          }
        }
      }
    }
  } // <-- End of for loop
  
  const cashPlusTotalTicketValue = (totalCash || 0) + (totalTicketValue || 0);
  
  return {
    totalTicketsExtracted: totalTickets,
    totalTicketValue: totalTicketValue > 0 ? totalTicketValue : null,
    ticketCountByType: Object.keys(countByType).length > 0 ? countByType : null,
    ticketValueByType: Object.keys(valueByType).length > 0 ? valueByType : null,
    totalCashPaid: totalCash > 0 ? totalCash : null,
    totalPrizesWithTickets: prizesWithTickets,
    totalTicketOnlyPrizes: ticketOnlyPrizes,
    reconciliation_accumulatorTicketCount: accumulatorCount,
    reconciliation_accumulatorTicketValue: accumulatorValue > 0 ? accumulatorValue : null,
    reconciliation_totalPrizepoolPaid: totalCash > 0 ? totalCash : null,
    reconciliation_cashPlusTotalTicketValue: cashPlusTotalTicketValue > 0 ? cashPlusTotalTicketValue : null,
  };
};

/**
 * Generate ticket extraction summary for API response
 * 
 * @param {Array} placements - Parsed placements
 * @returns {Object} TicketExtractionSummary compatible object
 */
const generateTicketSummary = (placements) => {
  if (!placements || placements.length === 0) {
    return {
      totalPlacements: 0,
      placementsWithCash: 0,
      placementsWithTickets: 0,
      placementsWithBoth: 0,
      placementsWithTicketOnly: 0,
      totalCashPaid: 0,
      totalTicketValue: 0,
      totalCombinedValue: 0,
      ticketsByType: [],
      topPlacements: []
    };
  }
  
  let withCash = 0;
  let withTickets = 0;
  let withBoth = 0;
  let ticketOnly = 0;
  let totalCash = 0;
  let totalTicketVal = 0;
  const typeCountMap = {};
  
  for (const p of placements) {
    const hasCash = p.cashPrize && p.cashPrize > 0;
    const hasTicket = p.hasNonCashPrize && p.nonCashPrizes?.length > 0;
    
    if (hasCash) {
      withCash++;
      totalCash += p.cashPrize;
    }
    
    if (hasTicket) {
      withTickets++;
      for (const t of p.nonCashPrizes) {
        const type = t.prizeType || 'OTHER';
        if (!typeCountMap[type]) {
          typeCountMap[type] = { count: 0, value: 0 };
        }
        typeCountMap[type].count++;
        if (t.estimatedValue) {
          typeCountMap[type].value += t.estimatedValue;
          totalTicketVal += t.estimatedValue;
        }
      }
    }
    
    if (hasCash && hasTicket) withBoth++;
    if (!hasCash && hasTicket) ticketOnly++;
  }
  
  // Convert type map to array
  const ticketsByType = Object.entries(typeCountMap).map(([type, data]) => ({
    ticketType: type,
    count: data.count,
    totalValue: data.value > 0 ? data.value : null
  }));
  
  // Top placements (first 5)
  const topPlacements = placements.slice(0, 5).map(p => {
    const primaryTicket = p.nonCashPrizes?.[0];
    return {
      place: p.place,
      playerName: p.playerName,
      cashPrize: p.cashPrize,
      ticketType: primaryTicket?.prizeType || null,
      ticketValue: primaryTicket?.estimatedValue || null,
      totalValue: p.totalEstimatedValue
    };
  });
  
  return {
    totalPlacements: placements.length,
    placementsWithCash: withCash,
    placementsWithTickets: withTickets,
    placementsWithBoth: withBoth,
    placementsWithTicketOnly: ticketOnly,
    totalCashPaid: totalCash,
    totalTicketValue: totalTicketVal,
    totalCombinedValue: totalCash + totalTicketVal,
    ticketsByType,
    topPlacements
  };
};

/**
 * Enhanced winner info that includes full ticket details
 * 
 * @param {Array} placements - Parsed placements
 * @returns {Object} Winner info with ticket details
 */
const extractEnhancedWinnerInfo = (placements) => {
  const firstPlace = placements.find(p => p.place === 1);
  
  if (!firstPlace) {
    return {
      extractedWinnerName: null,
      extractedWinnerCashPrize: null,
      extractedWinnerHasTicket: false,
      extractedWinnerTicketType: null,
      extractedWinnerTicketValue: null,
      extractedWinnerTotalValue: null
    };
  }
  
  const primaryTicket = firstPlace.nonCashPrizes?.[0];
  
  return {
    extractedWinnerName: firstPlace.playerName,
    extractedWinnerCashPrize: firstPlace.cashPrize,
    extractedWinnerHasTicket: firstPlace.hasNonCashPrize || false,
    extractedWinnerTicketType: primaryTicket?.prizeType || null,
    extractedWinnerTicketValue: primaryTicket?.estimatedValue || null,
    extractedWinnerTotalValue: firstPlace.totalEstimatedValue
  };
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  // Main parsing functions
  parsePlacements,
  parsePlacementLine,
  parsePrizeSection,
  createPlacementRecords,
  extractWinnerInfo,
  cleanPlayerName,
  
  // Ticket extraction
  extractTickets,
  hasTicketIndicator,
  extractTicketValue,
  extractPromoTickets,
  
  // NEW: Aggregate functions for reconciliation
  calculateTicketAggregates,
  generateTicketSummary,
  extractEnhancedWinnerInfo,
  
  // Pattern exports for testing
  TICKET_PATTERNS,
  TICKET_TYPE_MAP
};