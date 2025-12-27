/**
 * extraction/contentClassifier.js
 * Classify social post content type (RESULT, PROMOTIONAL, GENERAL, COMMENT)
 */

const { RESULT_PATTERNS, PROMO_PATTERNS, scorePatterns } = require('../utils/patterns');

// Thresholds for classification
const THRESHOLDS = {
  RESULT_MIN: 40,         // Minimum score to be considered RESULT
  PROMO_MIN: 30,          // Minimum score to be considered PROMOTIONAL
  RESULT_STRONG: 80,      // High confidence RESULT
  PROMO_STRONG: 60,       // High confidence PROMOTIONAL
  AMBIGUOUS_MARGIN: 15    // If scores are within this margin, it's ambiguous
};

/**
 * Classify post content type
 * 
 * @param {Object} post - Social post object
 * @param {string} post.content - Post text content
 * @param {string} post.postType - Media type (TEXT, IMAGE, VIDEO, etc.)
 * @returns {Object} { contentType, confidence, resultScore, promoScore, matches }
 */
const classifyContent = (post) => {
  const content = post.content || '';
  
  // Empty content is GENERAL
  if (!content.trim()) {
    return {
      contentType: 'GENERAL',
      confidence: 1.0,
      resultScore: 0,
      promoScore: 0,
      matches: { result: [], promo: [] }
    };
  }
  
  // Score against both pattern sets
  const resultAnalysis = scorePatterns(content, RESULT_PATTERNS);
  const promoAnalysis = scorePatterns(content, PROMO_PATTERNS);
  
  const resultScore = resultAnalysis.score;
  const promoScore = promoAnalysis.score;
  
  // Determine content type
  let contentType;
  let confidence;
  
  // Check for RESULT first (results are more specific)
  if (resultScore >= THRESHOLDS.RESULT_MIN && resultScore > promoScore) {
    contentType = 'RESULT';
    
    // Calculate confidence
    if (resultScore >= THRESHOLDS.RESULT_STRONG) {
      confidence = 0.95;
    } else if (resultScore - promoScore > THRESHOLDS.AMBIGUOUS_MARGIN) {
      confidence = 0.8;
    } else {
      confidence = 0.6;
    }
  }
  // Check for PROMOTIONAL
  else if (promoScore >= THRESHOLDS.PROMO_MIN && promoScore > resultScore) {
    contentType = 'PROMOTIONAL';
    
    if (promoScore >= THRESHOLDS.PROMO_STRONG) {
      confidence = 0.9;
    } else if (promoScore - resultScore > THRESHOLDS.AMBIGUOUS_MARGIN) {
      confidence = 0.75;
    } else {
      confidence = 0.55;
    }
  }
  // Mixed signals or low scores
  else if (resultScore >= THRESHOLDS.RESULT_MIN || promoScore >= THRESHOLDS.PROMO_MIN) {
    // Something poker-related but unclear which type
    contentType = resultScore >= promoScore ? 'RESULT' : 'PROMOTIONAL';
    confidence = 0.4;
  }
  // Nothing matched strongly
  else {
    contentType = 'GENERAL';
    confidence = 0.7;
  }
  
  return {
    contentType,
    confidence,
    resultScore,
    promoScore,
    matches: {
      result: resultAnalysis.matches,
      promo: promoAnalysis.matches
    }
  };
};

/**
 * Quick check if content is likely a result post
 * Useful for filtering before full processing
 * 
 * @param {string} content - Post content text
 * @returns {boolean}
 */
const isLikelyResult = (content) => {
  if (!content) return false;
  
  // Quick patterns that strongly indicate results
  const quickPatterns = [
    /\b(1st|2nd|3rd)\s*[-–—:]/i,
    /[🥇🥈🥉]/,
    /\$[\d,]+\s*[-–—]\s*[A-Z]/i,
    /\bresults?\b/i
  ];
  
  return quickPatterns.some(p => p.test(content));
};

/**
 * Quick check if content is likely promotional
 * 
 * @param {string} content - Post content text
 * @returns {boolean}
 */
const isLikelyPromo = (content) => {
  if (!content) return false;
  
  const quickPatterns = [
    /\btonight\b/i,
    /\$[\d,]+\s*GTD/i,
    /\bregister\b/i,
    /kingsroomlive\.com\/event/i
  ];
  
  return quickPatterns.some(p => p.test(content));
};

/**
 * Determine if post should be skipped
 * 
 * @param {Object} post - Social post object
 * @returns {{ skip: boolean, reason: string | null }}
 */
const shouldSkipPost = (post) => {
  // Skip comments (if we can detect them)
  if (post.postType === 'COMMENT') {
    return { skip: true, reason: 'Post is a comment' };
  }
  
  // Skip very short content (likely not useful)
  if (post.content && post.content.trim().length < 20) {
    return { skip: true, reason: 'Content too short' };
  }
  
  // Skip if already fully processed and linked
  if (post.processingStatus === 'LINKED' && post.linkedGameCount > 0) {
    return { skip: true, reason: 'Already processed and linked' };
  }
  
  return { skip: false, reason: null };
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  classifyContent,
  isLikelyResult,
  isLikelyPromo,
  shouldSkipPost,
  THRESHOLDS
};
