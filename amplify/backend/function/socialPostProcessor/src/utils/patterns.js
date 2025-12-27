/**
 * utils/patterns.js
 * Regex patterns for content classification and data extraction
 * 
 * UPDATED: Fixed tournament URL pattern to handle kingsroom.com.au/tournament
 */

// ===================================================================
// RESULT POST PATTERNS
// ===================================================================

/**
 * Patterns that indicate a post contains tournament results
 * Higher weight = stronger indicator
 */
const RESULT_PATTERNS = [
  // Placement lines (1st, 2nd, 3rd, etc.)
  { pattern: /\b(1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\s*[-–—:]\s*[\w\s]+\s*[-–—$]/gi, weight: 30, name: 'placement_line' },
  
  // Place emoji patterns (🥇, 🥈, 🥉)
  { pattern: /[🥇🥈🥉]\s*[\w\s]+/g, weight: 25, name: 'medal_emoji' },
  
  // Dollar amounts with names (common in results)
  { pattern: /\$[\d,]+(?:\.\d{2})?\s*[-–—]\s*[\w\s]+/g, weight: 20, name: 'prize_with_name' },
  { pattern: /[\w\s]+\s*[-–—]\s*\$[\d,]+/g, weight: 20, name: 'name_with_prize' },
  
  // Results header keywords
  { pattern: /\b(results?|winners?|payouts?|final\s*table|cashed?|ITM)\b/gi, weight: 15, name: 'result_keyword' },
  
  // Congratulations patterns
  { pattern: /\b(congrat(ulation)?s?|well\s*done|great\s*job)\b/gi, weight: 10, name: 'congrats' },
  
  // Entry count patterns in results context
  { pattern: /(\d+)\s*(entries|entrants|players|runners)/gi, weight: 10, name: 'entry_count' },
  
  // Prizepool announcement
  { pattern: /prize\s*pool\s*:?\s*\$[\d,]+/gi, weight: 15, name: 'prizepool' },
  
  // Chop/deal language
  { pattern: /\b(chop|chopped?|dealt?|ICM\s*deal)\b/gi, weight: 15, name: 'deal_language' },
  
  // Multiple numbered placements (1., 2., 3.)
  { pattern: /^\s*\d+[.)\s]+[\w\s]+[-–—:$]/gm, weight: 25, name: 'numbered_placement' },
  
  // "took down" / "took out" 
  { pattern: /\btook\s*(down|out|it\s*down)\b/gi, weight: 12, name: 'took_down' }
];

// ===================================================================
// PROMOTIONAL POST PATTERNS
// ===================================================================

/**
 * Patterns that indicate a post is promoting an upcoming tournament
 */
const PROMO_PATTERNS = [
  // Future tense / upcoming
  { pattern: /\b(tonight|tomorrow|this\s*(week|weekend)|coming\s*up|upcoming|next)\b/gi, weight: 15, name: 'future_tense' },
  
  // Registration language
  { pattern: /\b(register|sign\s*up|entries?\s*open|seats?\s*available)\b/gi, weight: 15, name: 'registration' },
  
  // Time announcements
  { pattern: /\b(starts?\s*at|kicks?\s*off|begins?)\s*\d{1,2}(:\d{2})?\s*(am|pm)?/gi, weight: 12, name: 'start_time' },
  
  // Day of week + time
  { pattern: /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*@?\s*\d{1,2}/gi, weight: 12, name: 'day_time' },
  
  // Guarantee language
  { pattern: /\$[\d,]+\s*GTD/gi, weight: 20, name: 'guarantee' },
  { pattern: /guarantee[d]?\s*:?\s*\$[\d,]+/gi, weight: 20, name: 'guarantee_explicit' },
  
  // Buy-in announcements
  { pattern: /buy[-\s]?in\s*:?\s*\$[\d,]+/gi, weight: 15, name: 'buyin' },
  
  // "Don't miss" / "Join us"
  { pattern: /\b(don'?t\s*miss|join\s*us|see\s*you)\b/gi, weight: 10, name: 'call_to_action' },
  
  // Event links - UPDATED to handle both URL formats
  { pattern: /kingsroom(?:live)?\.com(?:\.au)?\/(?:event|tournament)/gi, weight: 25, name: 'event_link' },
  
  // Series announcement
  { pattern: /\b(series|festival|championship)\b/gi, weight: 8, name: 'series_keyword' }
];

// ===================================================================
// EXTRACTION PATTERNS
// ===================================================================

/**
 * Patterns for extracting specific data from posts
 */
const EXTRACTION_PATTERNS = {
  // Tournament ID from URL
  tournamentId: /[?&]id=(\d+)/i,
  
  // Tournament URL - FIXED: handle both kingsroomlive.com/event AND kingsroom.com.au/tournament
  tournamentUrl: /(https?:\/\/[^\s]*kingsroom(?:live)?\.com(?:\.au)?\/(?:event|tournament)[^\s]*)/i,
  
  // Buy-in amount
  buyIn: [
    /buy[-\s]?in\s*:?\s*\$?([\d,]+)/i,
    /\$([\d,]+)\s*(?:buy[-\s]?in|entry|tournament)/i,
    /\$([\d,]+)\s*(?:NLH?|PLO|poker)/i
  ],
  
  // Guarantee amount
  guarantee: [
    /\$([\d,]+)\s*GTD/i,
    /guarantee[d]?\s*:?\s*\$([\d,]+)/i,
    /GTD\s*:?\s*\$([\d,]+)/i
  ],
  
  // Prizepool
  prizepool: [
    /prize\s*pool\s*:?\s*\$([\d,]+)/i,
    /total\s*prize[s]?\s*:?\s*\$([\d,]+)/i
  ],
  
  // Entry count
  entries: [
    /(\d+)\s*(?:total\s*)?(?:entries|entrants|players|runners)/i,
    /field\s*(?:of\s*)(\d+)/i
  ],
  
  // Placement line - captures place, name, prize
  placementLine: [
    // 1st - John Smith - $500
    /^[\s🥇🥈🥉]*(\d+)(?:st|nd|rd|th)?\s*[-–—:.\s]+([A-Za-z][A-Za-z\s.']+?)\s*[-–—:\s]+\s*\$?([\d,]+(?:\.\d{2})?)/gm,
    
    // 1. John Smith $500
    /^\s*(\d+)[.)]\s*([A-Za-z][A-Za-z\s.']+?)\s+\$?([\d,]+(?:\.\d{2})?)/gm,
    
    // 🥇 John Smith - $500
    /([🥇🥈🥉])\s*([A-Za-z][A-Za-z\s.']+?)\s*[-–—:\s]+\s*\$?([\d,]+(?:\.\d{2})?)/gm
  ],
  
  // Non-cash prize patterns
  nonCashPrize: [
    /accumulator\s*ticket/gi,
    /\+\s*(?:acc(?:umulator)?|ticket)/gi,
    /(?:free\s*)?entry\s*(?:to|into)\s+(.+)/gi,
    /satellite\s*(?:seat|ticket|entry)/gi
  ],
  
  // Venue names - UPDATED with more flexible patterns
  venueName: [
    // "at [Venue Name]" or "@ [Venue Name]"
    /(?:at|@)\s+([A-Z][A-Za-z\s&']+(?:Hotel|Club|Casino|Pub|Bar|Room|Lounge|Leagues?))/gi,
    // "Kings Room - [Venue]" or "KR @ [Venue]"
    /(?:Kings?\s*Room|KR)\s*[-–—@]\s*([A-Za-z][A-Za-z\s&'.]+)/gi,
    // "Venue: [Name]"
    /venue\s*:?\s*([A-Z][A-Za-z\s&',]+)/gi,
    // Common venue patterns - St George, Star, Crown, etc.
    /(St\.?\s*George\s*Leagues?\s*(?:Club)?|The\s*Star|Crown\s*(?:Casino|Sydney|Melbourne)?|Treasury)/gi
  ],
  
  // Date patterns
  date: [
    /(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/,  // DD/MM/YYYY or MM/DD/YYYY
    /(monday|tuesday|wednesday|thursday|friday|saturday|sunday)/gi
  ],
  
  // Time patterns
  time: [
    /(\d{1,2}):?(\d{2})?\s*(am|pm)/gi,
    /starts?\s*(?:at\s*)?(\d{1,2}):?(\d{2})?\s*(am|pm)?/gi
  ],
  
  // Game variant
  gameVariant: [
    /\bNL(?:HE?)?\b/gi,                    // NLHE, NLH, NL
    /\bPL(?:O[456]?|Omaha)\b/gi,           // PLO, PLO4, PLO5, etc
    /\bNo\s*Limit\s*Hold'?e?m?\b/gi,
    /\bPot\s*Limit\s*Omaha\b/gi
  ],
  
  // Tournament type indicators
  tournamentType: {
    bounty: /\b(bounty|knockout|KO|PKO|progressive\s*knockout)\b/gi,
    satellite: /\b(satellite|sat|qualifier)\b/gi,
    deepstack: /\b(deep\s*stack|deepstack)\b/gi,
    turbo: /\b(turbo|hyper[-\s]?turbo)\b/gi,
    freezeout: /\b(freezeout|freeze[-\s]?out)\b/gi,
    rebuy: /\b(re[-\s]?buy|unlimited\s*re[-\s]?entry)\b/gi
  },
  
  // Series patterns
  series: {
    name: /\b((?:[\w\s]+)?(?:series|festival|championship|open|classic))\b/gi,
    eventNumber: /\bevent\s*#?\s*(\d+)\b/gi,
    dayNumber: /\bday\s*(\d+)\b/gi,
    flight: /\bflight\s*([A-Z])\b/gi
  }
};

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

/**
 * Score content against a pattern set
 * @param {string} content - The text content to analyze
 * @param {Array} patterns - Array of {pattern, weight, name} objects
 * @returns {Object} { score, matches }
 */
const scorePatterns = (content, patterns) => {
  let score = 0;
  const matches = [];
  
  for (const { pattern, weight, name } of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    const found = content.match(regex);
    
    if (found && found.length > 0) {
      score += weight * Math.min(found.length, 3); // Cap at 3x weight per pattern
      matches.push({
        name,
        count: found.length,
        weight: weight * Math.min(found.length, 3),
        samples: found.slice(0, 3)
      });
    }
  }
  
  return { score, matches };
};

/**
 * Extract first match from content using multiple patterns
 * @param {string} content - Text to search
 * @param {RegExp|RegExp[]} patterns - Pattern(s) to try
 * @returns {string|null} First captured group or null
 */
const extractFirst = (content, patterns) => {
  const patternList = Array.isArray(patterns) ? patterns : [patterns];
  
  for (const pattern of patternList) {
    const regex = new RegExp(pattern.source, pattern.flags.replace('g', ''));
    const match = content.match(regex);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  
  return null;
};

/**
 * Extract all matches from content
 * @param {string} content - Text to search
 * @param {RegExp} pattern - Pattern with groups
 * @returns {Array} Array of match arrays
 */
const extractAll = (content, pattern) => {
  const regex = new RegExp(pattern.source, pattern.flags);
  const matches = [];
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    matches.push([...match]);
  }
  
  return matches;
};

/**
 * Parse dollar amount string to number
 * @param {string} str - String like "$1,500" or "1500"
 * @returns {number|null}
 */
const parseDollarAmount = (str) => {
  if (!str) return null;
  const cleaned = str.replace(/[$,\s]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
};

/**
 * Medal emoji to place number
 */
const MEDAL_TO_PLACE = {
  '🥇': 1,
  '🥈': 2,
  '🥉': 3
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  RESULT_PATTERNS,
  PROMO_PATTERNS,
  EXTRACTION_PATTERNS,
  MEDAL_TO_PLACE,
  scorePatterns,
  extractFirst,
  extractAll,
  parseDollarAmount
};