/**
 * game-name-utils.js (v2 - LESS AGGRESSIVE)
 * 
 * FIXED: Previous version was too aggressive, normalizing names to meaningless strings.
 * 
 * Key changes:
 * 1. DON'T strip venue name - it removes too much when the game IS at that venue
 * 2. KEEP prize pool amounts (standardized) - "$5000 GTD" vs "$2000 GTD" matters!
 * 3. KEEP tournament identifiers - "Bankroll Builder", "Satty", "Champs"
 * 4. Only strip truly redundant info: day names, times, dates, "weekly/daily"
 * 
 * Location: amplify/backend/function/recurringGameAdmin/src/game-name-utils.js
 */

// ===================================================================
// NAME NORMALIZATION
// ===================================================================

/**
 * Normalize a game name for matching purposes.
 * 
 * Philosophy: Keep enough to distinguish different games, remove only noise.
 * 
 * KEEP:
 * - Prize amounts (standardized): "$5000 GTD" → "5k gtd"
 * - Tournament identifiers: "Bankroll Builder", "Satty", "Champs"
 * - Structure types: "rebuy", "freezeout", "re-entry"
 * - Venue identifiers within name: "Kings Room", "St George"
 * 
 * REMOVE:
 * - Day names (already filtered by day)
 * - Times: "9:40pm", "until 9:10pm"
 * - Dates: "10th May", "01/15"
 * - Filler words: "weekly", "daily", "at", "on"
 * 
 * @param {string} name - Raw game name
 * @param {Object} options - Normalization options
 * @returns {string} Normalized name
 */
const normalizeGameName = (name, options = {}) => {
    if (!name) return '';
    
    const {
        removeDays = true,
        removeTimes = true,
        removeFillerWords = true,
        standardizePrizes = true
    } = options;
    
    let normalized = name.toLowerCase().trim();
    
    // 1. STANDARDIZE PRIZE POOLS (keep them, just normalize format)
    if (standardizePrizes) {
        // "$5,000 GTD" or "$5000 GTD" → "5k gtd"
        // "$2,500 GTD" → "3k gtd" (round to avoid decimal issues)
        // "$500 GTD" → "500 gtd" (don't add k for small amounts)
        // "$120 rebuy" → "120 rebuy" (preserve following text)
        normalized = normalized.replace(
            /\$([\d,]+)\s*k?\s*(g(?:ua)?r(?:an)?t(?:ee)?d?|gtd)?/gi,
            (match, amount, gtdPart) => {
                const num = parseInt(amount.replace(/,/g, ''), 10);
                if (isNaN(num)) return match;
                
                let result;
                if (num >= 1000) {
                    // Round to nearest k (2500 → 3k, 2000 → 2k)
                    const k = Math.round(num / 1000);
                    result = `${k}k`;
                } else {
                    result = `${num}`;
                }
                
                // Add gtd if it was present, otherwise add space to separate from next word
                if (gtdPart) {
                    result += ' gtd';
                } else {
                    result += ' ';
                }
                return result;
            }
        );
        
    }
    
    // 2. REMOVE DAY NAMES (we filter by day separately)
    if (removeDays) {
        normalized = normalized
            .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)('?s)?\b/gi, '')
            .replace(/\b(mon|tue|wed|thu|fri|sat|sun)\b/gi, '');
    }
    
    // 3. REMOVE TIME PATTERNS (careful order to preserve "rebuy")
    if (removeTimes) {
        // First, remove complete time phrases
        normalized = normalized
            .replace(/until\s+\d{1,2}:\d{2}\s*(am|pm)?/gi, '')   // "until 9:40pm"
            .replace(/until\s+end\s+of\s+level\s+\d+/gi, '')     // "until end of level 9"
            .replace(/\d{1,2}:\d{2}\s*(am|pm)?/gi, '')           // "9:40pm"
            .replace(/\b\d{1,2}\s*(am|pm)\b/gi, '')              // "9pm"
            .replace(/\blate\s+rego?\b/gi, '')                   // "late rego"
            .replace(/\buntil\b/gi, '');                         // leftover "until"
    }
    
    // 4. REMOVE DATE PATTERNS
    normalized = normalized
        .replace(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g, '')                    // "01/15/2024"
        .replace(/\d{1,2}(st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*/gi, '')  // "15th May"
        .replace(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*\d{1,2}/gi, '')   // "May 15"
        .replace(/on\s+\d{1,2}(st|nd|rd|th)?/gi, '');                         // "on 10th"
    
    // 5. REMOVE FILLER WORDS
    if (removeFillerWords) {
        normalized = normalized
            .replace(/\b(weekly|daily|regular)\b/gi, '')
            .replace(/\b(at|on|the|a|an)\b/gi, ' ')
            .replace(/\bguaranteed\b/gi, 'gtd');
    }
    
    // 6. STANDARDIZE COMMON TERMS (but keep them!)
    normalized = normalized
        // Keep structure types, just standardize spelling
        .replace(/re-?entry/gi, 'reentry')
        .replace(/re-?buy/gi, 'rebuy')
        .replace(/freeze-?out/gi, 'freezeout')
        .replace(/deep-?stack/gi, 'deepstack')
        .replace(/knock-?out/gi, 'knockout')
        // Standardize poker terms
        .replace(/hold'?em/gi, 'holdem')
        .replace(/\bnlhe?\b/gi, 'nlh')
        .replace(/\bplo\d?\b/gi, 'plo')
        // Keep satellite indicators
        .replace(/\bsatty\b/gi, 'satty')
        .replace(/\bsatellite\b/gi, 'satty');
    
    // 7. REMOVE VENUE SUFFIXES (but keep venue names!)
    // Only remove generic suffixes, not the actual venue identifier
    normalized = normalized
        .replace(/\b(leagues?\s+club|bowling\s+club|sports\s+club|rsl)\b/gi, '')
        .replace(/\bhotel\b/gi, '');
    
    // 8. CLEAN UP
    normalized = normalized
        .replace(/[^\w\s]/g, ' ')  // Remove punctuation
        .replace(/\s+/g, ' ')       // Collapse whitespace
        .trim();
    
    // 9. Remove leading/trailing common words that add no value
    normalized = normalized
        .replace(/^(gtd|and|or)\s+/gi, '')
        .replace(/\s+(gtd|and|or)$/gi, '');
    
    return normalized;
};

// ===================================================================
// STRING SIMILARITY
// ===================================================================

/**
 * Calculate string similarity using Dice coefficient (bigram overlap).
 */
const stringSimilarity = (str1, str2) => {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;
    
    // Handle very short strings - use exact/contains matching
    if (str1.length < 4 || str2.length < 4) {
        if (str1.includes(str2) || str2.includes(str1)) return 0.8;
        return str1 === str2 ? 1 : 0;
    }
    
    const getBigrams = (str) => {
        const bigrams = new Map();
        const s = str.toLowerCase();
        for (let i = 0; i < s.length - 1; i++) {
            const bigram = s.slice(i, i + 2);
            bigrams.set(bigram, (bigrams.get(bigram) || 0) + 1);
        }
        return bigrams;
    };
    
    const bigrams1 = getBigrams(str1);
    const bigrams2 = getBigrams(str2);
    
    let intersection = 0;
    bigrams1.forEach((count, bigram) => {
        if (bigrams2.has(bigram)) {
            intersection += Math.min(count, bigrams2.get(bigram));
        }
    });
    
    const total1 = [...bigrams1.values()].reduce((a, b) => a + b, 0);
    const total2 = [...bigrams2.values()].reduce((a, b) => a + b, 0);
    
    return (2 * intersection) / (total1 + total2);
};

/**
 * Calculate token-based Jaccard similarity.
 * Good for matching games where words might be in different order.
 */
const tokenSimilarity = (str1, str2) => {
    if (!str1 || !str2) return 0;
    
    // Get tokens (words longer than 2 chars)
    const getTokens = (str) => {
        return new Set(
            str.toLowerCase()
                .split(/\s+/)
                .filter(t => t.length > 2)
                // Remove very common tokens that don't help distinguish
                .filter(t => !['gtd', 'the', 'and', 'for'].includes(t))
        );
    };
    
    const tokens1 = getTokens(str1);
    const tokens2 = getTokens(str2);
    
    if (tokens1.size === 0 || tokens2.size === 0) return 0;
    
    const intersection = [...tokens1].filter(t => tokens2.has(t)).length;
    const union = new Set([...tokens1, ...tokens2]).size;
    
    return intersection / union;
};

/**
 * Calculate combined similarity using multiple strategies.
 * 
 * @param {string} name1 - First name (already normalized)
 * @param {string} name2 - Second name (already normalized)  
 * @returns {number} Combined similarity score from 0 to 1
 */
const calculateNameSimilarity = (name1, name2) => {
    if (!name1 || !name2) return 0;
    if (name1 === name2) return 1.0;
    
    // One contains the other (usually good match)
    if (name1.includes(name2) || name2.includes(name1)) {
        // Bonus if the contained string is substantial
        const shorter = name1.length < name2.length ? name1 : name2;
        const longer = name1.length >= name2.length ? name1 : name2;
        const ratio = shorter.length / longer.length;
        return 0.7 + (ratio * 0.3); // 0.7 to 1.0 based on how much is contained
    }
    
    // Calculate both similarities
    const bigramSim = stringSimilarity(name1, name2);
    const tokenSim = tokenSimilarity(name1, name2);
    
    // Weight: 50% bigram, 50% token
    // Token similarity helps with word reordering
    return (bigramSim * 0.5) + (tokenSim * 0.5);
};

// ===================================================================
// TEMPLATE NAME GENERATION
// ===================================================================

/**
 * Generate template name from a cluster of games.
 * Extracts the most distinctive/common features.
 */
const generateTemplateName = (gameNames, dayOfWeek, venueName = null) => {
    if (!gameNames || gameNames.length === 0) {
        return `${formatDay(dayOfWeek)} Tournament`;
    }
    
    const day = formatDay(dayOfWeek);
    
    // Extract features from all game names
    const features = {
        prizes: {},      // "5k", "10k", etc
        identifiers: {}, // "Bankroll Builder", "Champs", etc
        types: {},       // "rebuy", "satty", etc
        venues: {}       // "Kings Room", "St George", etc
    };
    
    // Common tournament identifiers to look for
    const identifierPatterns = [
        /bankroll\s*builder/i,
        /champs?/i,
        /grind/i,
        /behemoth/i,
        /coloss?us/i,
        /milestone/i,
        /highroller/i,
        /big\s*friday/i,
        /shotclock/i,
        /mega/i
    ];
    
    // Tournament types
    const typePatterns = [
        /\b(satty|satellite)\b/i,
        /\b(rebuy)\b/i,
        /\b(freezeout)\b/i,
        /\b(reentry)\b/i,
        /\b(plo\d?)\b/i,
        /\b(bounty|knockout)\b/i,
        /\b(turbo)\b/i,
        /\b(deepstack)\b/i
    ];
    
    // Venue/room identifiers
    const venuePatterns = [
        /kings?\s*room/i,
        /st\.?\s*george/i
    ];
    
    gameNames.forEach(name => {
        const lower = name.toLowerCase();
        
        // Extract prize amount
        const prizeMatch = lower.match(/\$?\s*([\d,]+)\s*k?\s*(?:gtd|guaranteed)/i);
        if (prizeMatch) {
            const amount = parseInt(prizeMatch[1].replace(/,/g, ''), 10);
            const key = amount >= 1000 ? `$${Math.round(amount/1000)}k` : `$${amount}`;
            features.prizes[key] = (features.prizes[key] || 0) + 1;
        }
        
        // Extract identifiers
        identifierPatterns.forEach(pattern => {
            const match = lower.match(pattern);
            if (match) {
                const key = match[0].toLowerCase().replace(/\s+/g, ' ');
                features.identifiers[key] = (features.identifiers[key] || 0) + 1;
            }
        });
        
        // Extract types
        typePatterns.forEach(pattern => {
            const match = lower.match(pattern);
            if (match) {
                const key = match[1].toLowerCase();
                features.types[key] = (features.types[key] || 0) + 1;
            }
        });
        
        // Extract venue mentions
        venuePatterns.forEach(pattern => {
            if (pattern.test(lower)) {
                const match = lower.match(pattern);
                const key = match[0];
                features.venues[key] = (features.venues[key] || 0) + 1;
            }
        });
    });
    
    // Build name from most common features
    const parts = [day];
    const threshold = gameNames.length * 0.4; // Feature must appear in 40%+ of games
    
    // Add most common identifier (most distinctive)
    const topIdentifier = getTopFeature(features.identifiers, threshold);
    if (topIdentifier) {
        parts.push(capitalize(topIdentifier));
    }
    
    // Add type if no identifier
    if (!topIdentifier) {
        const topType = getTopFeature(features.types, threshold);
        if (topType) {
            parts.push(capitalize(topType));
        }
    }
    
    // Add prize if distinctive
    const topPrize = getTopFeature(features.prizes, threshold);
    if (topPrize && !topIdentifier) {
        parts.push(`${topPrize} GTD`);
    }
    
    // Add venue if nothing else distinctive
    if (parts.length === 1) {
        const topVenue = getTopFeature(features.venues, 1);
        if (topVenue) {
            parts.push(capitalize(topVenue));
        } else if (venueName) {
            // Use first 2 words of venue name
            const shortVenue = venueName.split(/\s+/).slice(0, 2).join(' ');
            parts.push(shortVenue);
        }
    }
    
    // Fallback
    if (parts.length === 1) {
        parts.push('Tournament');
    }
    
    return parts.join(' ');
};

// Helper functions
const formatDay = (day) => {
    if (!day) return '';
    return day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
};

const capitalize = (str) => {
    return str.split(/\s+/)
        .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join(' ');
};

const getTopFeature = (features, minCount) => {
    const sorted = Object.entries(features)
        .filter(([_, count]) => count >= minCount)
        .sort((a, b) => b[1] - a[1]);
    return sorted.length > 0 ? sorted[0][0] : null;
};

// ===================================================================
// DISPLAY NAME GENERATION
// ===================================================================

/**
 * Generate a clean display name for a recurring game template.
 */
const generateDisplayName = (rawName) => {
    if (!rawName) return 'Unnamed Game';
    
    let clean = rawName
        // Keep more than matching normalization
        .replace(/\d{1,2}:\d{2}\s*(am|pm)?/gi, '')  // Remove times
        .replace(/until\s+[\d:apm]+/gi, '')          // Remove "until X"
        .replace(/\b(weekly|daily)\b/gi, '')         // Remove frequency
        .replace(/[^\w\s$'-]/g, ' ')                 // Keep $ for prizes
        .replace(/\s+/g, ' ')
        .trim();
    
    // Title case
    clean = clean.replace(/\b\w/g, c => c.toUpperCase());
    
    if (clean.length < 3) {
        return 'Unnamed Game';
    }
    
    return clean;
};

// ===================================================================
// BUY-IN UTILITIES
// ===================================================================

/**
 * Check if two buy-ins are similar enough to be the same game.
 */
const buyInSimilar = (buyIn1, buyIn2, tolerance = 0.5) => {
    if (!buyIn1 || !buyIn2 || buyIn1 <= 0 || buyIn2 <= 0) return true;
    const ratio = Math.max(buyIn1, buyIn2) / Math.min(buyIn1, buyIn2);
    return ratio <= (1 + tolerance);
};

// ===================================================================
// EXPORTS  
// ===================================================================

module.exports = {
    normalizeGameName,
    stringSimilarity,
    tokenSimilarity,
    calculateNameSimilarity,
    generateTemplateName,
    generateDisplayName,
    buyInSimilar,
    // Helpers (for testing)
    formatDay,
    capitalize,
    getTopFeature
};
