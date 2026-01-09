/**
 * game-name-utils.ts (v2 - LESS AGGRESSIVE)
 * 
 * TypeScript version for frontend use.
 * Keep in sync with backend game-name-utils.js
 * 
 * Location: src/utils/game-name-utils.ts
 */

// ===================================================================
// TYPES
// ===================================================================

export interface NormalizeOptions {
    removeDays?: boolean;
    removeTimes?: boolean;
    removeFillerWords?: boolean;
    standardizePrizes?: boolean;
}

// ===================================================================
// NAME NORMALIZATION
// ===================================================================

/**
 * Normalize a game name for matching purposes.
 * 
 * Philosophy: Keep enough to distinguish different games, remove only noise.
 */
export const normalizeGameName = (name: string, options: NormalizeOptions = {}): string => {
    if (!name) return '';
    
    const {
        removeDays = true,
        removeTimes = true,
        removeFillerWords = true,
        standardizePrizes = true
    } = options;
    
    let normalized = name.toLowerCase().trim();
    
    // 1. STANDARDIZE PRIZE POOLS
    if (standardizePrizes) {
        normalized = normalized.replace(
            /\$([\d,]+)\s*k?\s*(g(?:ua)?r(?:an)?t(?:ee)?d?|gtd)?/gi,
            (match, amount, gtdPart) => {
                const num = parseInt(amount.replace(/,/g, ''), 10);
                if (isNaN(num)) return match;
                
                let result: string;
                if (num >= 1000) {
                    const k = Math.round(num / 1000);
                    result = `${k}k`;
                } else {
                    result = `${num}`;
                }
                
                if (gtdPart) {
                    result += ' gtd';
                } else {
                    result += ' ';
                }
                return result;
            }
        );
    }
    
    // 2. REMOVE DAY NAMES
    if (removeDays) {
        normalized = normalized
            .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)('?s)?\b/gi, '')
            .replace(/\b(mon|tue|wed|thu|fri|sat|sun)\b/gi, '');
    }
    
    // 3. REMOVE TIME PATTERNS
    if (removeTimes) {
        normalized = normalized
            .replace(/until\s+\d{1,2}:\d{2}\s*(am|pm)?/gi, '')
            .replace(/until\s+end\s+of\s+level\s+\d+/gi, '')
            .replace(/\d{1,2}:\d{2}\s*(am|pm)?/gi, '')
            .replace(/\b\d{1,2}\s*(am|pm)\b/gi, '')
            .replace(/\blate\s+rego?\b/gi, '')
            .replace(/\buntil\b/gi, '');
    }
    
    // 4. REMOVE DATE PATTERNS
    normalized = normalized
        .replace(/\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/g, '')
        .replace(/\d{1,2}(st|nd|rd|th)?\s*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*/gi, '')
        .replace(/(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s*\d{1,2}/gi, '')
        .replace(/on\s+\d{1,2}(st|nd|rd|th)?/gi, '');
    
    // 5. REMOVE FILLER WORDS
    if (removeFillerWords) {
        normalized = normalized
            .replace(/\b(weekly|daily|regular)\b/gi, '')
            .replace(/\b(at|on|the|a|an)\b/gi, ' ')
            .replace(/\bguaranteed\b/gi, 'gtd');
    }
    
    // 6. STANDARDIZE COMMON TERMS
    normalized = normalized
        .replace(/re-?entry/gi, 'reentry')
        .replace(/re-?buy/gi, 'rebuy')
        .replace(/freeze-?out/gi, 'freezeout')
        .replace(/deep-?stack/gi, 'deepstack')
        .replace(/knock-?out/gi, 'knockout')
        .replace(/hold'?em/gi, 'holdem')
        .replace(/\bnlhe?\b/gi, 'nlh')
        .replace(/\bplo\d?\b/gi, 'plo')
        .replace(/\bsatty\b/gi, 'satty')
        .replace(/\bsatellite\b/gi, 'satty');
    
    // 7. REMOVE VENUE SUFFIXES
    normalized = normalized
        .replace(/\b(leagues?\s+club|bowling\s+club|sports\s+club|rsl)\b/gi, '')
        .replace(/\bhotel\b/gi, '');
    
    // 8. CLEAN UP
    normalized = normalized
        .replace(/[^\w\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    normalized = normalized
        .replace(/^(gtd|and|or)\s+/gi, '')
        .replace(/\s+(gtd|and|or)$/gi, '');
    
    return normalized;
};

// ===================================================================
// STRING SIMILARITY
// ===================================================================

export const stringSimilarity = (str1: string, str2: string): number => {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;
    
    if (str1.length < 4 || str2.length < 4) {
        if (str1.includes(str2) || str2.includes(str1)) return 0.8;
        return str1 === str2 ? 1 : 0;
    }
    
    const getBigrams = (str: string): Map<string, number> => {
        const bigrams = new Map<string, number>();
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
            intersection += Math.min(count, bigrams2.get(bigram)!);
        }
    });
    
    const total1 = [...bigrams1.values()].reduce((a, b) => a + b, 0);
    const total2 = [...bigrams2.values()].reduce((a, b) => a + b, 0);
    
    return (2 * intersection) / (total1 + total2);
};

export const tokenSimilarity = (str1: string, str2: string): number => {
    if (!str1 || !str2) return 0;
    
    const getTokens = (str: string): Set<string> => {
        return new Set(
            str.toLowerCase()
                .split(/\s+/)
                .filter(t => t.length > 2)
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

export const calculateNameSimilarity = (name1: string, name2: string): number => {
    if (!name1 || !name2) return 0;
    if (name1 === name2) return 1.0;
    
    if (name1.includes(name2) || name2.includes(name1)) {
        const shorter = name1.length < name2.length ? name1 : name2;
        const longer = name1.length >= name2.length ? name1 : name2;
        const ratio = shorter.length / longer.length;
        return 0.7 + (ratio * 0.3);
    }
    
    const bigramSim = stringSimilarity(name1, name2);
    const tokenSim = tokenSimilarity(name1, name2);
    
    return (bigramSim * 0.5) + (tokenSim * 0.5);
};

// ===================================================================
// DISPLAY NAME GENERATION
// ===================================================================

export const generateDisplayName = (rawName: string): string => {
    if (!rawName) return 'Unnamed Game';
    
    let clean = rawName
        .replace(/\d{1,2}:\d{2}\s*(am|pm)?/gi, '')
        .replace(/until\s+[\d:apm]+/gi, '')
        .replace(/\b(weekly|daily)\b/gi, '')
        .replace(/[^\w\s$'-]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    
    clean = clean.replace(/\b\w/g, c => c.toUpperCase());
    
    if (clean.length < 3) {
        return 'Unnamed Game';
    }
    
    return clean;
};

// ===================================================================
// BUY-IN UTILITIES
// ===================================================================

export const buyInSimilar = (buyIn1: number, buyIn2: number, tolerance = 0.5): boolean => {
    if (!buyIn1 || !buyIn2 || buyIn1 <= 0 || buyIn2 <= 0) return true;
    const ratio = Math.max(buyIn1, buyIn2) / Math.min(buyIn1, buyIn2);
    return ratio <= (1 + tolerance);
};
