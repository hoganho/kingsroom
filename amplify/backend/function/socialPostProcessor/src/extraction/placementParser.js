/**
 * extraction/placementParser.js
 * Parse tournament placement/results lines from social posts
 */

const { MEDAL_TO_PLACE, parseDollarAmount } = require('../utils/patterns');
const { v4: uuidv4 } = require('uuid');

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
  
  // Pattern 4: "$500 - John Smith" (prize first)
  result = tryPrizeFirstPattern(trimmed);
  if (result) return result;
  
  return null;
};

/**
 * Try ordinal pattern: "1st - Name - $Prize"
 */
const tryOrdinalPattern = (line) => {
  // Match: 1st, 2nd, 3rd, 4th, etc.
  const pattern = /^(\d+)(?:st|nd|rd|th)\s*[-–—:.\s]+\s*([A-Za-z][A-Za-z\s.']+?)\s*[-–—:\s]+\s*(.+)$/i;
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
  
  // Check for non-cash prizes
  const nonCashPatterns = [
    { pattern: /accumulator\s*ticket/gi, type: 'ACCUMULATOR_TICKET', description: 'Accumulator Ticket' },
    { pattern: /\+\s*acc(?:umulator)?/gi, type: 'ACCUMULATOR_TICKET', description: 'Accumulator Ticket' },
    { pattern: /satellite\s*(?:seat|ticket|entry)/gi, type: 'SATELLITE_TICKET', description: 'Satellite Entry' },
    { pattern: /bounty\s*(?:ticket|entry)/gi, type: 'BOUNTY_TICKET', description: 'Bounty Entry' },
    { pattern: /free\s*entry/gi, type: 'TOURNAMENT_ENTRY', description: 'Free Entry' },
    { pattern: /\*+$/g, type: 'ACCUMULATOR_TICKET', description: 'Accumulator Ticket' }  // Asterisk often means accumulator
  ];
  
  for (const { pattern, type, description } of nonCashPatterns) {
    if (pattern.test(prizeSection)) {
      result.hasNonCashPrize = true;
      result.nonCashPrizes.push({
        prizeType: type,
        description,
        estimatedValue: null,  // Could be looked up from recurring game config
        rawText: prizeSection
      });
    }
  }
  
  // Calculate total estimated value
  result.totalEstimatedValue = result.cashPrize || 0;
  // Note: Non-cash prize values would need to be added from external config
  
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
      extractedWinnerPrize: firstPlace.cashPrize
    };
  }
  
  return {
    extractedWinnerName: null,
    extractedWinnerPrize: null
  };
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  parsePlacements,
  parsePlacementLine,
  parsePrizeSection,
  createPlacementRecords,
  extractWinnerInfo,
  cleanPlayerName
};
