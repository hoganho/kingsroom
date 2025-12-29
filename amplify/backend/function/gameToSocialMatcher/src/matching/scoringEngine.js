/**
 * matching/scoringEngine.js
 * Score and rank game match candidates
 * 
 * UPDATED: 
 * - Evaluates ALL possible signals (not just matching ones)
 * - Returns complete breakdown showing matched, not matched, and not evaluated
 * - Similar to fieldManifest pattern for game field completeness
 */

// ===================================================================
// THRESHOLDS
// ===================================================================

const THRESHOLDS = {
  // Minimum score to be considered a candidate
  MINIMUM: 15,
  
  // Score required for auto-linking
  AUTO_LINK: 80,
  
  // High confidence match
  HIGH_CONFIDENCE: 90,
  
  // Medium confidence
  MEDIUM_CONFIDENCE: 60,
};

// ===================================================================
// SIGNAL DEFINITIONS (mirrors signalManifest.ts)
// ===================================================================

const SIGNAL_DEFINITIONS = {
  // Identity
  tournamentId: { weight: 100, penalty: 0, category: 'identity', label: 'Tournament ID' },
  recurringGameName: { weight: 15, penalty: 0, category: 'identity', label: 'Recurring Game Name' },  // NEW
  
  // Financial
  buyInExact: { weight: 25, penalty: 0, category: 'financial', label: 'Buy-in (Exact)' },
  buyInClose: { weight: 12, penalty: 0, category: 'financial', label: 'Buy-in (Close)' },
  buyInMismatch: { weight: 0, penalty: -10, category: 'financial', label: 'Buy-in Mismatch' },
  guaranteeMatch: { weight: 15, penalty: 0, category: 'financial', label: 'Guarantee Amount' },
  rakeMatch: { weight: 8, penalty: 0, category: 'financial', label: 'Rake Amount' },         // NEW
  
  // Temporal
  dateExact: { weight: 20, penalty: 0, category: 'temporal', label: 'Date (Exact)' },
  dateClose: { weight: 10, penalty: 0, category: 'temporal', label: 'Date (Close)' },
  dateMismatch: { weight: 0, penalty: -15, category: 'temporal', label: 'Date Mismatch' },
  dayOfWeekMatch: { weight: 8, penalty: 0, category: 'temporal', label: 'Day of Week' },
  
  // Venue
  venueExact: { weight: 20, penalty: 0, category: 'venue', label: 'Venue (Exact)' },
  venuePartial: { weight: 10, penalty: 0, category: 'venue', label: 'Venue (Suggested)' },
  
  // Structure (NEW category)
  startingStackMatch: { weight: 8, penalty: 0, category: 'structure', label: 'Starting Stack' },
  blindLevelMatch: { weight: 6, penalty: 0, category: 'structure', label: 'Blind Levels' },
  tournamentTypeMatch: { weight: 10, penalty: 0, category: 'structure', label: 'Tournament Type' },
  tournamentTypeMismatch: { weight: 0, penalty: -8, category: 'structure', label: 'Tournament Type Mismatch' },
  
  // Attributes
  entriesMatch: { weight: 10, penalty: 0, category: 'attributes', label: 'Entry Count' },
  
  // Content
  resultPostBonus: { weight: 10, penalty: 0, category: 'content', label: 'Result → Finished' },
  promoPostBonus: { weight: 5, penalty: 0, category: 'content', label: 'Promo → Scheduled' },
};

const CATEGORY_META = {
  identity: { label: 'Identity', icon: '🎯', maxPossible: 115 },    // Updated: +15 for recurring name
  financial: { label: 'Financial', icon: '💰', maxPossible: 60 },
  temporal: { label: 'Date/Time', icon: '📅', maxPossible: 38 },
  venue: { label: 'Venue', icon: '📍', maxPossible: 30 },
  structure: { label: 'Structure', icon: '🏗️', maxPossible: 24 },
  attributes: { label: 'Attributes', icon: '📊', maxPossible: 10 },
  content: { label: 'Content Type', icon: '📝', maxPossible: 15 },
  penalties: { label: 'Penalties', icon: '⚠️', maxPossible: 0 },
};

// ===================================================================
// SCORING FUNCTIONS
// ===================================================================

/**
 * Calculate match score between extracted data and a game
 * Returns complete breakdown of ALL signals
 * 
 * @param {Object} extracted - Extracted data from post
 * @param {Object} game - Game record
 * @param {Object} options - Additional context (contentType, postDate)
 * @returns {Object} Complete scoring result
 */
const calculateMatchScore = (extracted, game, options = {}) => {
  const { contentType, postDate } = options;
  
  // Initialize all signals as NOT_EVALUATED
  const allSignals = {};
  Object.keys(SIGNAL_DEFINITIONS).forEach(key => {
    allSignals[key] = {
      key,
      status: 'NOT_EVALUATED',
      contribution: 0,
      extractedValue: null,
      gameValue: null,
      details: 'No data available',
      ...SIGNAL_DEFINITIONS[key]
    };
  });
  
  let totalScore = 0;
  
  console.log(`[SCORING] ========================================`);
  console.log(`[SCORING] Scoring game: ${game.name} (${game.id})`);
  console.log(`[SCORING] Extracted: buyIn=${extracted.extractedBuyIn}, date=${extracted.extractedDate}, venue=${extracted.extractedVenueName}`);
  console.log(`[SCORING] Game: buyIn=${game.buyIn}, date=${game.gameStartDateTime}, venueId=${game.venueId}`);
  
  // =========================================================================
  // EVALUATE IDENTITY SIGNALS
  // =========================================================================
  
  // Tournament ID
  if (extracted.extractedTournamentId || game.tournamentId) {
    allSignals.tournamentId.extractedValue = extracted.extractedTournamentId || null;
    allSignals.tournamentId.gameValue = game.tournamentId || null;
    
    if (!extracted.extractedTournamentId) {
      allSignals.tournamentId.status = 'NOT_EVALUATED';
      allSignals.tournamentId.details = 'No tournament ID extracted from post';
    } else if (!game.tournamentId) {
      allSignals.tournamentId.status = 'NOT_EVALUATED';
      allSignals.tournamentId.details = 'Game has no tournament ID';
    } else if (extracted.extractedTournamentId === game.tournamentId) {
      allSignals.tournamentId.status = 'MATCHED';
      allSignals.tournamentId.contribution = SIGNAL_DEFINITIONS.tournamentId.weight;
      allSignals.tournamentId.details = `Tournament ID ${extracted.extractedTournamentId} matches`;
      totalScore += SIGNAL_DEFINITIONS.tournamentId.weight;
      console.log(`[SCORING] ✅ Tournament ID match: +${SIGNAL_DEFINITIONS.tournamentId.weight}`);
    } else {
      allSignals.tournamentId.status = 'NOT_MATCHED';
      allSignals.tournamentId.details = `${extracted.extractedTournamentId} ≠ ${game.tournamentId}`;
    }
  }
  
  // === RECURRING GAME NAME MATCH (NEW) ===
  // Compare extracted recurring game name against game.name or recurring game template
  const extractedRecurringName = extracted.extractedRecurringGameName;
  const gameName = game.name;
  
  allSignals.recurringGameName.extractedValue = extractedRecurringName;
  allSignals.recurringGameName.gameValue = gameName;
  
  if (!extractedRecurringName) {
    allSignals.recurringGameName.status = 'NOT_EVALUATED';
    allSignals.recurringGameName.details = 'No recurring game name extracted';
  } else if (!gameName) {
    allSignals.recurringGameName.status = 'NOT_EVALUATED';
    allSignals.recurringGameName.details = 'Game has no name';
  } else {
    // Normalize both names for comparison
    const normalizedExtracted = extractedRecurringName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const normalizedGame = gameName.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    
    // Check for exact match or contains
    if (normalizedGame.includes(normalizedExtracted) || normalizedExtracted.includes(normalizedGame)) {
      allSignals.recurringGameName.status = 'MATCHED';
      allSignals.recurringGameName.contribution = SIGNAL_DEFINITIONS.recurringGameName.weight;
      allSignals.recurringGameName.details = `"${extractedRecurringName}" found in "${gameName}"`;
      totalScore += SIGNAL_DEFINITIONS.recurringGameName.weight;
      console.log(`[SCORING] ✅ Recurring game name match: +${SIGNAL_DEFINITIONS.recurringGameName.weight}`);
    } else {
      // Try fuzzy match - check if significant words overlap
      const extractedWords = normalizedExtracted.split(/\s+/).filter(w => w.length > 2);
      const gameWords = normalizedGame.split(/\s+/).filter(w => w.length > 2);
      const matchingWords = extractedWords.filter(w => gameWords.some(gw => gw.includes(w) || w.includes(gw)));
      
      if (matchingWords.length >= Math.min(2, extractedWords.length)) {
        allSignals.recurringGameName.status = 'MATCHED';
        allSignals.recurringGameName.contribution = Math.floor(SIGNAL_DEFINITIONS.recurringGameName.weight * 0.7);
        allSignals.recurringGameName.details = `Partial match: "${matchingWords.join(', ')}"`;
        totalScore += allSignals.recurringGameName.contribution;
        console.log(`[SCORING] ✅ Recurring game name partial: +${allSignals.recurringGameName.contribution}`);
      } else {
        allSignals.recurringGameName.status = 'NOT_MATCHED';
        allSignals.recurringGameName.details = `"${extractedRecurringName}" ≠ "${gameName}"`;
      }
    }
  }
  
  // =========================================================================
  // EVALUATE FINANCIAL SIGNALS
  // =========================================================================
  
  // Buy-in
  const extractedBuyIn = extracted.extractedBuyIn ? Number(extracted.extractedBuyIn) : null;
  const gameBuyIn = game.buyIn ? Number(game.buyIn) : null;
  
  allSignals.buyInExact.extractedValue = extractedBuyIn;
  allSignals.buyInExact.gameValue = gameBuyIn;
  allSignals.buyInClose.extractedValue = extractedBuyIn;
  allSignals.buyInClose.gameValue = gameBuyIn;
  allSignals.buyInMismatch.extractedValue = extractedBuyIn;
  allSignals.buyInMismatch.gameValue = gameBuyIn;
  
  if (extractedBuyIn === null) {
    allSignals.buyInExact.status = 'NOT_EVALUATED';
    allSignals.buyInExact.details = 'No buy-in extracted from post';
    allSignals.buyInClose.status = 'NOT_EVALUATED';
    allSignals.buyInClose.details = 'No buy-in extracted from post';
    allSignals.buyInMismatch.status = 'NOT_APPLICABLE';
    allSignals.buyInMismatch.details = 'No buy-in to compare';
  } else if (gameBuyIn === null) {
    allSignals.buyInExact.status = 'NOT_EVALUATED';
    allSignals.buyInExact.details = 'Game has no buy-in set';
    allSignals.buyInClose.status = 'NOT_EVALUATED';
    allSignals.buyInClose.details = 'Game has no buy-in set';
    allSignals.buyInMismatch.status = 'NOT_APPLICABLE';
    allSignals.buyInMismatch.details = 'Game has no buy-in to compare';
  } else {
    const diff = Math.abs(extractedBuyIn - gameBuyIn);
    const diffPercent = gameBuyIn > 0 ? (diff / gameBuyIn) * 100 : 100;
    
    if (extractedBuyIn === gameBuyIn) {
      allSignals.buyInExact.status = 'MATCHED';
      allSignals.buyInExact.contribution = SIGNAL_DEFINITIONS.buyInExact.weight;
      allSignals.buyInExact.details = `$${extractedBuyIn} = $${gameBuyIn}`;
      allSignals.buyInClose.status = 'NOT_APPLICABLE';
      allSignals.buyInClose.details = 'Exact match found';
      allSignals.buyInMismatch.status = 'NOT_APPLICABLE';
      allSignals.buyInMismatch.details = 'Values match';
      totalScore += SIGNAL_DEFINITIONS.buyInExact.weight;
      console.log(`[SCORING] ✅ Buy-in exact: +${SIGNAL_DEFINITIONS.buyInExact.weight} ($${gameBuyIn})`);
    } else if (diffPercent <= 10) {
      allSignals.buyInExact.status = 'NOT_MATCHED';
      allSignals.buyInExact.details = `$${extractedBuyIn} ≠ $${gameBuyIn}`;
      allSignals.buyInClose.status = 'MATCHED';
      allSignals.buyInClose.contribution = SIGNAL_DEFINITIONS.buyInClose.weight;
      allSignals.buyInClose.details = `$${extractedBuyIn} within ${diffPercent.toFixed(1)}% of $${gameBuyIn}`;
      allSignals.buyInMismatch.status = 'NOT_APPLICABLE';
      allSignals.buyInMismatch.details = 'Close match found';
      totalScore += SIGNAL_DEFINITIONS.buyInClose.weight;
      console.log(`[SCORING] ✅ Buy-in close: +${SIGNAL_DEFINITIONS.buyInClose.weight}`);
    } else {
      allSignals.buyInExact.status = 'NOT_MATCHED';
      allSignals.buyInExact.details = `$${extractedBuyIn} ≠ $${gameBuyIn}`;
      allSignals.buyInClose.status = 'NOT_MATCHED';
      allSignals.buyInClose.details = `${diffPercent.toFixed(1)}% difference exceeds 10% threshold`;
      allSignals.buyInMismatch.status = 'MATCHED';
      allSignals.buyInMismatch.contribution = SIGNAL_DEFINITIONS.buyInMismatch.penalty;
      allSignals.buyInMismatch.details = `$${extractedBuyIn} vs $${gameBuyIn} (${diffPercent.toFixed(0)}% diff)`;
      totalScore += SIGNAL_DEFINITIONS.buyInMismatch.penalty;
      console.log(`[SCORING] ❌ Buy-in mismatch: ${SIGNAL_DEFINITIONS.buyInMismatch.penalty}`);
    }
  }
  
  // Guarantee
  const extractedGtd = extracted.extractedGuarantee ? Number(extracted.extractedGuarantee) : null;
  const gameGtd = game.guaranteeAmount ? Number(game.guaranteeAmount) : null;
  
  allSignals.guaranteeMatch.extractedValue = extractedGtd;
  allSignals.guaranteeMatch.gameValue = gameGtd;
  
  if (extractedGtd === null) {
    allSignals.guaranteeMatch.status = 'NOT_EVALUATED';
    allSignals.guaranteeMatch.details = 'No guarantee extracted from post';
  } else if (gameGtd === null) {
    allSignals.guaranteeMatch.status = 'NOT_EVALUATED';
    allSignals.guaranteeMatch.details = 'Game has no guarantee set';
  } else {
    const gtdDiff = Math.abs(extractedGtd - gameGtd) / Math.max(gameGtd, 1);
    if (gtdDiff < 0.05) {
      allSignals.guaranteeMatch.status = 'MATCHED';
      allSignals.guaranteeMatch.contribution = SIGNAL_DEFINITIONS.guaranteeMatch.weight;
      allSignals.guaranteeMatch.details = `$${extractedGtd.toLocaleString()} ≈ $${gameGtd.toLocaleString()}`;
      totalScore += SIGNAL_DEFINITIONS.guaranteeMatch.weight;
      console.log(`[SCORING] ✅ Guarantee match: +${SIGNAL_DEFINITIONS.guaranteeMatch.weight}`);
    } else {
      allSignals.guaranteeMatch.status = 'NOT_MATCHED';
      allSignals.guaranteeMatch.details = `$${extractedGtd.toLocaleString()} ≠ $${gameGtd.toLocaleString()}`;
    }
  }
  
  // === RAKE MATCH (NEW) ===
  const extractedRake = extracted.extractedRake;
  const gameRake = game.rake;
  
  allSignals.rakeMatch.extractedValue = extractedRake ? `$${extractedRake}` : null;
  allSignals.rakeMatch.gameValue = gameRake ? `$${gameRake}` : null;
  
  if (!extractedRake) {
    allSignals.rakeMatch.status = 'NOT_EVALUATED';
    allSignals.rakeMatch.details = 'No rake extracted from post';
  } else if (!gameRake) {
    allSignals.rakeMatch.status = 'NOT_EVALUATED';
    allSignals.rakeMatch.details = 'Game has no rake set';
  } else {
    // Rake should match exactly or within $2
    const rakeDiff = Math.abs(extractedRake - gameRake);
    if (rakeDiff <= 2) {
      allSignals.rakeMatch.status = 'MATCHED';
      allSignals.rakeMatch.contribution = SIGNAL_DEFINITIONS.rakeMatch.weight;
      allSignals.rakeMatch.details = `$${extractedRake} ≈ $${gameRake}`;
      totalScore += SIGNAL_DEFINITIONS.rakeMatch.weight;
      console.log(`[SCORING] ✅ Rake match: +${SIGNAL_DEFINITIONS.rakeMatch.weight}`);
    } else {
      allSignals.rakeMatch.status = 'NOT_MATCHED';
      allSignals.rakeMatch.details = `$${extractedRake} ≠ $${gameRake}`;
    }
  }
  
  // =========================================================================
  // EVALUATE TEMPORAL SIGNALS
  // =========================================================================
  
  // Normalize dates to midnight UTC for comparison (ignore time component)
  const normalizeToDateOnly = (date) => {
    if (!date || isNaN(date.getTime())) return null;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  };
  
  const extractedDateRaw = extracted.extractedDate ? new Date(extracted.extractedDate) : null;
  const gameDateRaw = game.gameStartDateTime ? new Date(game.gameStartDateTime) : null;
  
  const extractedDate = normalizeToDateOnly(extractedDateRaw);
  const gameDate = normalizeToDateOnly(gameDateRaw);
  
  // Display values (date portion only)
  const extractedDateStr = extractedDateRaw?.toISOString()?.split('T')[0] || null;
  const gameDateStr = gameDateRaw?.toISOString()?.split('T')[0] || null;
  
  allSignals.dateExact.extractedValue = extractedDateStr;
  allSignals.dateExact.gameValue = gameDateStr;
  allSignals.dateClose.extractedValue = extractedDateStr;
  allSignals.dateClose.gameValue = gameDateStr;
  allSignals.dateMismatch.extractedValue = extractedDateStr;
  allSignals.dateMismatch.gameValue = gameDateStr;
  
  if (!extractedDate) {
    allSignals.dateExact.status = 'NOT_EVALUATED';
    allSignals.dateExact.details = 'No date extracted from post';
    allSignals.dateClose.status = 'NOT_EVALUATED';
    allSignals.dateClose.details = 'No date extracted from post';
    allSignals.dateMismatch.status = 'NOT_APPLICABLE';
    allSignals.dateMismatch.details = 'No date to compare';
  } else if (!gameDate) {
    allSignals.dateExact.status = 'NOT_EVALUATED';
    allSignals.dateExact.details = 'Game has no date set';
    allSignals.dateClose.status = 'NOT_EVALUATED';
    allSignals.dateClose.details = 'Game has no date set';
    allSignals.dateMismatch.status = 'NOT_APPLICABLE';
    allSignals.dateMismatch.details = 'Game has no date to compare';
  } else {
    // Calculate difference in days (comparing normalized dates)
    const daysDiff = Math.round(Math.abs(extractedDate - gameDate) / (1000 * 60 * 60 * 24));
    
    if (daysDiff === 0) {
      allSignals.dateExact.status = 'MATCHED';
      allSignals.dateExact.contribution = SIGNAL_DEFINITIONS.dateExact.weight;
      allSignals.dateExact.details = `Same date: ${gameDateStr}`;
      allSignals.dateClose.status = 'NOT_APPLICABLE';
      allSignals.dateClose.details = 'Exact match found';
      allSignals.dateMismatch.status = 'NOT_APPLICABLE';
      allSignals.dateMismatch.details = 'Dates match';
      totalScore += SIGNAL_DEFINITIONS.dateExact.weight;
      console.log(`[SCORING] ✅ Date exact: +${SIGNAL_DEFINITIONS.dateExact.weight}`);
    } else if (daysDiff === 1) {
      allSignals.dateExact.status = 'NOT_MATCHED';
      allSignals.dateExact.details = `${daysDiff} day difference`;
      allSignals.dateClose.status = 'MATCHED';
      allSignals.dateClose.contribution = SIGNAL_DEFINITIONS.dateClose.weight;
      allSignals.dateClose.details = `1 day apart (${extractedDateStr} vs ${gameDateStr})`;
      allSignals.dateMismatch.status = 'NOT_APPLICABLE';
      allSignals.dateMismatch.details = 'Close match found';
      totalScore += SIGNAL_DEFINITIONS.dateClose.weight;
      console.log(`[SCORING] ✅ Date close: +${SIGNAL_DEFINITIONS.dateClose.weight}`);
    } else if (daysDiff <= 3) {
      allSignals.dateExact.status = 'NOT_MATCHED';
      allSignals.dateExact.details = `${daysDiff} days difference`;
      allSignals.dateClose.status = 'NOT_MATCHED';
      allSignals.dateClose.details = `${daysDiff} days apart (threshold is 1)`;
      allSignals.dateMismatch.status = 'NOT_APPLICABLE';
      allSignals.dateMismatch.details = 'Within tolerance';
    } else {
      allSignals.dateExact.status = 'NOT_MATCHED';
      allSignals.dateExact.details = `${daysDiff} days difference`;
      allSignals.dateClose.status = 'NOT_MATCHED';
      allSignals.dateClose.details = `${daysDiff} days apart`;
      allSignals.dateMismatch.status = 'MATCHED';
      allSignals.dateMismatch.contribution = SIGNAL_DEFINITIONS.dateMismatch.penalty;
      allSignals.dateMismatch.details = `${daysDiff} days apart (${extractedDateStr} vs ${gameDateStr})`;
      totalScore += SIGNAL_DEFINITIONS.dateMismatch.penalty;
      console.log(`[SCORING] ❌ Date mismatch: ${SIGNAL_DEFINITIONS.dateMismatch.penalty}`);
    }
  }
  
  // Day of week
  const extractedDayOfWeek = extracted.extractedDayOfWeek?.toUpperCase() || null;
  const gameDayOfWeek = gameDate ? gameDate.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase() : null;
  
  allSignals.dayOfWeekMatch.extractedValue = extractedDayOfWeek;
  allSignals.dayOfWeekMatch.gameValue = gameDayOfWeek;
  
  if (!extractedDayOfWeek) {
    allSignals.dayOfWeekMatch.status = 'NOT_EVALUATED';
    allSignals.dayOfWeekMatch.details = 'No day of week extracted';
  } else if (!gameDayOfWeek) {
    allSignals.dayOfWeekMatch.status = 'NOT_EVALUATED';
    allSignals.dayOfWeekMatch.details = 'Game has no date';
  } else if (gameDayOfWeek.includes(extractedDayOfWeek) || extractedDayOfWeek.includes(gameDayOfWeek.slice(0, 3))) {
    allSignals.dayOfWeekMatch.status = 'MATCHED';
    allSignals.dayOfWeekMatch.contribution = SIGNAL_DEFINITIONS.dayOfWeekMatch.weight;
    allSignals.dayOfWeekMatch.details = `${extractedDayOfWeek} matches ${gameDayOfWeek}`;
    totalScore += SIGNAL_DEFINITIONS.dayOfWeekMatch.weight;
    console.log(`[SCORING] ✅ Day of week: +${SIGNAL_DEFINITIONS.dayOfWeekMatch.weight}`);
  } else {
    allSignals.dayOfWeekMatch.status = 'NOT_MATCHED';
    allSignals.dayOfWeekMatch.details = `${extractedDayOfWeek} ≠ ${gameDayOfWeek}`;
  }
  
  // =========================================================================
  // EVALUATE VENUE SIGNALS
  // =========================================================================
  
  const extractedVenueId = extracted.extractedVenueId || extracted.suggestedVenueId || null;
  const gameVenueId = game.venueId || null;
  
  allSignals.venueExact.extractedValue = extracted.extractedVenueName || extractedVenueId;
  allSignals.venueExact.gameValue = gameVenueId;
  allSignals.venuePartial.extractedValue = extracted.extractedVenueName;
  allSignals.venuePartial.gameValue = gameVenueId;
  
  if (!extractedVenueId && !extracted.extractedVenueName) {
    allSignals.venueExact.status = 'NOT_EVALUATED';
    allSignals.venueExact.details = 'No venue extracted from post';
    allSignals.venuePartial.status = 'NOT_EVALUATED';
    allSignals.venuePartial.details = 'No venue extracted from post';
  } else if (!gameVenueId) {
    allSignals.venueExact.status = 'NOT_EVALUATED';
    allSignals.venueExact.details = 'Game has no venue set';
    allSignals.venuePartial.status = 'NOT_EVALUATED';
    allSignals.venuePartial.details = 'Game has no venue set';
  } else if (extracted.extractedVenueId && extracted.extractedVenueId === gameVenueId) {
    allSignals.venueExact.status = 'MATCHED';
    allSignals.venueExact.contribution = SIGNAL_DEFINITIONS.venueExact.weight;
    allSignals.venueExact.details = `Venue ID matches: ${gameVenueId}`;
    allSignals.venuePartial.status = 'NOT_APPLICABLE';
    allSignals.venuePartial.details = 'Exact match found';
    totalScore += SIGNAL_DEFINITIONS.venueExact.weight;
    console.log(`[SCORING] ✅ Venue exact: +${SIGNAL_DEFINITIONS.venueExact.weight}`);
  } else if (extracted.suggestedVenueId && extracted.suggestedVenueId === gameVenueId) {
    allSignals.venueExact.status = 'NOT_MATCHED';
    allSignals.venueExact.details = 'No exact venue ID from extraction';
    allSignals.venuePartial.status = 'MATCHED';
    allSignals.venuePartial.contribution = SIGNAL_DEFINITIONS.venuePartial.weight;
    allSignals.venuePartial.details = `Suggested venue "${extracted.extractedVenueName}" matches game`;
    totalScore += SIGNAL_DEFINITIONS.venuePartial.weight;
    console.log(`[SCORING] ✅ Venue partial: +${SIGNAL_DEFINITIONS.venuePartial.weight}`);
  } else {
    allSignals.venueExact.status = 'NOT_MATCHED';
    allSignals.venueExact.details = `Extracted venue ≠ game venue`;
    allSignals.venuePartial.status = 'NOT_MATCHED';
    allSignals.venuePartial.details = `"${extracted.extractedVenueName}" ≠ game venue`;
  }
  
  // =========================================================================
  // EVALUATE ATTRIBUTE SIGNALS
  // =========================================================================
  
  // Entry count
  const extractedEntries = extracted.extractedTotalEntries ? Number(extracted.extractedTotalEntries) : null;
  const gameEntries = game.totalEntries ? Number(game.totalEntries) : null;
  
  allSignals.entriesMatch.extractedValue = extractedEntries;
  allSignals.entriesMatch.gameValue = gameEntries;
  
  if (extractedEntries === null) {
    allSignals.entriesMatch.status = 'NOT_EVALUATED';
    allSignals.entriesMatch.details = 'No entry count extracted';
  } else if (gameEntries === null) {
    allSignals.entriesMatch.status = 'NOT_EVALUATED';
    allSignals.entriesMatch.details = 'Game has no entry count';
  } else if (Math.abs(extractedEntries - gameEntries) <= 5) {
    allSignals.entriesMatch.status = 'MATCHED';
    allSignals.entriesMatch.contribution = SIGNAL_DEFINITIONS.entriesMatch.weight;
    allSignals.entriesMatch.details = `${extractedEntries} ≈ ${gameEntries} (within 5)`;
    totalScore += SIGNAL_DEFINITIONS.entriesMatch.weight;
    console.log(`[SCORING] ✅ Entries match: +${SIGNAL_DEFINITIONS.entriesMatch.weight}`);
  } else {
    allSignals.entriesMatch.status = 'NOT_MATCHED';
    allSignals.entriesMatch.details = `${extractedEntries} ≠ ${gameEntries}`;
  }
  
  // =========================================================================
  // EVALUATE STRUCTURE SIGNALS (NEW)
  // =========================================================================
  
  // === STARTING STACK ===
  const extractedStack = extracted.extractedStartingStack ? Number(extracted.extractedStartingStack) : null;
  const gameStack = game.startingStack ? Number(game.startingStack) : null;
  
  allSignals.startingStackMatch.extractedValue = extractedStack ? extractedStack.toLocaleString() : null;
  allSignals.startingStackMatch.gameValue = gameStack ? gameStack.toLocaleString() : null;
  
  if (!extractedStack) {
    allSignals.startingStackMatch.status = 'NOT_EVALUATED';
    allSignals.startingStackMatch.details = 'No starting stack extracted';
  } else if (!gameStack) {
    allSignals.startingStackMatch.status = 'NOT_EVALUATED';
    allSignals.startingStackMatch.details = 'Game has no starting stack set';
  } else {
    // Allow 10% tolerance for stacks
    const stackDiff = Math.abs(extractedStack - gameStack) / Math.max(gameStack, 1);
    if (stackDiff <= 0.1) {
      allSignals.startingStackMatch.status = 'MATCHED';
      allSignals.startingStackMatch.contribution = SIGNAL_DEFINITIONS.startingStackMatch.weight;
      allSignals.startingStackMatch.details = `${extractedStack.toLocaleString()} ≈ ${gameStack.toLocaleString()}`;
      totalScore += SIGNAL_DEFINITIONS.startingStackMatch.weight;
      console.log(`[SCORING] ✅ Starting stack match: +${SIGNAL_DEFINITIONS.startingStackMatch.weight}`);
    } else {
      allSignals.startingStackMatch.status = 'NOT_MATCHED';
      allSignals.startingStackMatch.details = `${extractedStack.toLocaleString()} ≠ ${gameStack.toLocaleString()}`;
    }
  }
  
  // === BLIND LEVEL DURATION ===
  // Note: Game.levels is AWSJSON that may contain level duration info
  const extractedBlindMins = extracted.extractedBlindLevelMinutes ? Number(extracted.extractedBlindLevelMinutes) : null;
  let gameBlindMins = null;
  
  // Try to extract blind duration from game.levels if it exists
  if (game.levels) {
    try {
      const levels = typeof game.levels === 'string' ? JSON.parse(game.levels) : game.levels;
      if (Array.isArray(levels) && levels.length > 0 && levels[0].duration) {
        gameBlindMins = Number(levels[0].duration);
      }
    } catch (e) {
      // Ignore parse errors
    }
  }
  
  allSignals.blindLevelMatch.extractedValue = extractedBlindMins ? `${extractedBlindMins} min` : null;
  allSignals.blindLevelMatch.gameValue = gameBlindMins ? `${gameBlindMins} min` : null;
  
  if (!extractedBlindMins) {
    allSignals.blindLevelMatch.status = 'NOT_EVALUATED';
    allSignals.blindLevelMatch.details = 'No blind level duration extracted';
  } else if (!gameBlindMins) {
    allSignals.blindLevelMatch.status = 'NOT_EVALUATED';
    allSignals.blindLevelMatch.details = 'Game has no blind level info';
  } else {
    // Exact match or within 5 minutes
    const blindDiff = Math.abs(extractedBlindMins - gameBlindMins);
    if (blindDiff <= 5) {
      allSignals.blindLevelMatch.status = 'MATCHED';
      allSignals.blindLevelMatch.contribution = SIGNAL_DEFINITIONS.blindLevelMatch.weight;
      allSignals.blindLevelMatch.details = `${extractedBlindMins} min ≈ ${gameBlindMins} min`;
      totalScore += SIGNAL_DEFINITIONS.blindLevelMatch.weight;
      console.log(`[SCORING] ✅ Blind level match: +${SIGNAL_DEFINITIONS.blindLevelMatch.weight}`);
    } else {
      allSignals.blindLevelMatch.status = 'NOT_MATCHED';
      allSignals.blindLevelMatch.details = `${extractedBlindMins} min ≠ ${gameBlindMins} min`;
    }
  }
  
  // === TOURNAMENT TYPE ===
  const extractedTournType = extracted.extractedTournamentType;
  const gameTournType = game.tournamentType;
  
  allSignals.tournamentTypeMatch.extractedValue = extractedTournType;
  allSignals.tournamentTypeMatch.gameValue = gameTournType;
  allSignals.tournamentTypeMismatch.extractedValue = extractedTournType;
  allSignals.tournamentTypeMismatch.gameValue = gameTournType;
  
  if (!extractedTournType) {
    allSignals.tournamentTypeMatch.status = 'NOT_EVALUATED';
    allSignals.tournamentTypeMatch.details = 'No tournament type extracted';
    allSignals.tournamentTypeMismatch.status = 'NOT_APPLICABLE';
    allSignals.tournamentTypeMismatch.details = 'No type to compare';
  } else if (!gameTournType) {
    allSignals.tournamentTypeMatch.status = 'NOT_EVALUATED';
    allSignals.tournamentTypeMatch.details = 'Game has no tournament type set';
    allSignals.tournamentTypeMismatch.status = 'NOT_APPLICABLE';
    allSignals.tournamentTypeMismatch.details = 'Game has no type to compare';
  } else if (extractedTournType === gameTournType) {
    allSignals.tournamentTypeMatch.status = 'MATCHED';
    allSignals.tournamentTypeMatch.contribution = SIGNAL_DEFINITIONS.tournamentTypeMatch.weight;
    allSignals.tournamentTypeMatch.details = `Both are ${gameTournType}`;
    allSignals.tournamentTypeMismatch.status = 'NOT_APPLICABLE';
    allSignals.tournamentTypeMismatch.details = 'Types match';
    totalScore += SIGNAL_DEFINITIONS.tournamentTypeMatch.weight;
    console.log(`[SCORING] ✅ Tournament type match: +${SIGNAL_DEFINITIONS.tournamentTypeMatch.weight}`);
  } else {
    // Check for compatible types (e.g., REBUY indicators on a DEEPSTACK game might still be ok)
    allSignals.tournamentTypeMatch.status = 'NOT_MATCHED';
    allSignals.tournamentTypeMatch.details = `${extractedTournType} ≠ ${gameTournType}`;
    
    // Apply penalty for clear mismatch (e.g., FREEZEOUT vs REBUY)
    const incompatiblePairs = [
      ['FREEZEOUT', 'REBUY'],
      ['SATELLITE', 'REBUY'],
      ['SATELLITE', 'FREEZEOUT']
    ];
    const isMismatch = incompatiblePairs.some(([a, b]) => 
      (extractedTournType === a && gameTournType === b) ||
      (extractedTournType === b && gameTournType === a)
    );
    
    if (isMismatch) {
      allSignals.tournamentTypeMismatch.status = 'MATCHED';
      allSignals.tournamentTypeMismatch.contribution = SIGNAL_DEFINITIONS.tournamentTypeMismatch.penalty;
      allSignals.tournamentTypeMismatch.details = `${extractedTournType} incompatible with ${gameTournType}`;
      totalScore += SIGNAL_DEFINITIONS.tournamentTypeMismatch.penalty;
      console.log(`[SCORING] ❌ Tournament type mismatch: ${SIGNAL_DEFINITIONS.tournamentTypeMismatch.penalty}`);
    } else {
      allSignals.tournamentTypeMismatch.status = 'NOT_APPLICABLE';
      allSignals.tournamentTypeMismatch.details = 'Types different but compatible';
    }
  }
  
  // =========================================================================
  // EVALUATE CONTENT TYPE SIGNALS
  // =========================================================================
  
  allSignals.resultPostBonus.extractedValue = contentType;
  allSignals.resultPostBonus.gameValue = game.gameStatus;
  allSignals.promoPostBonus.extractedValue = contentType;
  allSignals.promoPostBonus.gameValue = game.gameStatus;
  
  if (contentType === 'RESULT') {
    if (['FINISHED', 'COMPLETED'].includes(game.gameStatus)) {
      allSignals.resultPostBonus.status = 'MATCHED';
      allSignals.resultPostBonus.contribution = SIGNAL_DEFINITIONS.resultPostBonus.weight;
      allSignals.resultPostBonus.details = `Result post + ${game.gameStatus} game`;
      totalScore += SIGNAL_DEFINITIONS.resultPostBonus.weight;
      console.log(`[SCORING] ✅ Result post bonus: +${SIGNAL_DEFINITIONS.resultPostBonus.weight}`);
    } else {
      allSignals.resultPostBonus.status = 'NOT_MATCHED';
      allSignals.resultPostBonus.details = `Result post but game is ${game.gameStatus}`;
    }
    allSignals.promoPostBonus.status = 'NOT_APPLICABLE';
    allSignals.promoPostBonus.details = 'Post is a result, not promo';
  } else if (contentType === 'PROMOTIONAL') {
    allSignals.resultPostBonus.status = 'NOT_APPLICABLE';
    allSignals.resultPostBonus.details = 'Post is promotional, not result';
    if (['SCHEDULED', 'REGISTERING'].includes(game.gameStatus)) {
      allSignals.promoPostBonus.status = 'MATCHED';
      allSignals.promoPostBonus.contribution = SIGNAL_DEFINITIONS.promoPostBonus.weight;
      allSignals.promoPostBonus.details = `Promo post + ${game.gameStatus} game`;
      totalScore += SIGNAL_DEFINITIONS.promoPostBonus.weight;
      console.log(`[SCORING] ✅ Promo post bonus: +${SIGNAL_DEFINITIONS.promoPostBonus.weight}`);
    } else {
      allSignals.promoPostBonus.status = 'NOT_MATCHED';
      allSignals.promoPostBonus.details = `Promo post but game is ${game.gameStatus}`;
    }
  } else {
    allSignals.resultPostBonus.status = 'NOT_APPLICABLE';
    allSignals.resultPostBonus.details = `Post is ${contentType}`;
    allSignals.promoPostBonus.status = 'NOT_APPLICABLE';
    allSignals.promoPostBonus.details = `Post is ${contentType}`;
  }
  
  // =========================================================================
  // CALCULATE FINAL CONFIDENCE
  // =========================================================================
  
  const maxPossibleScore = 100;
  const confidence = Math.min(100, Math.max(0, Math.round((totalScore / maxPossibleScore) * 100)));
  
  const meetsMinimum = confidence >= THRESHOLDS.MINIMUM;
  const wouldAutoLink = confidence >= THRESHOLDS.AUTO_LINK;
  
  // Determine primary reason
  let reason = 'multiple_signals';
  if (allSignals.tournamentId.status === 'MATCHED') {
    reason = 'tournament_id_match';
  } else if (allSignals.buyInExact.status === 'MATCHED' && allSignals.dateExact.status === 'MATCHED') {
    reason = 'buyin_date_match';
  } else if (allSignals.venueExact.status === 'MATCHED') {
    reason = 'venue_match';
  } else if (allSignals.dateExact.status === 'MATCHED') {
    reason = 'date_match';
  } else if (allSignals.buyInExact.status === 'MATCHED') {
    reason = 'buyin_match';
  }
  
  console.log(`[SCORING] ----------------------------------------`);
  console.log(`[SCORING] Total raw score: ${totalScore}`);
  console.log(`[SCORING] Confidence: ${confidence}%`);
  console.log(`[SCORING] Meets minimum (${THRESHOLDS.MINIMUM}%): ${meetsMinimum}`);
  console.log(`[SCORING] Would auto-link (${THRESHOLDS.AUTO_LINK}%): ${wouldAutoLink}`);
  console.log(`[SCORING] Primary reason: ${reason}`);
  console.log(`[SCORING] ========================================`);
  
  return {
    confidence,
    rawScore: totalScore,
    signals: allSignals,
    meetsMinimum,
    wouldAutoLink,
    reason,
    thresholds: THRESHOLDS
  };
};

/**
 * Rank candidates by score
 */
const rankCandidates = (scoredCandidates) => {
  const sorted = [...scoredCandidates].sort((a, b) => b.score.confidence - a.score.confidence);
  return sorted.map((candidate, index) => ({
    ...candidate,
    rank: index + 1,
    isPrimaryMatch: index === 0
  }));
};

/**
 * Format signals for API response
 * Groups by category and includes all signals
 */
const formatSignalsForResponse = (score) => {
  // Initialize ALL categories upfront (so gameMatcher can access them)
  const categories = {};
  Object.keys(CATEGORY_META).forEach(cat => {
    const maxVal = CATEGORY_META[cat]?.maxPossible || 0;
    categories[cat] = {
      ...CATEGORY_META[cat],
      signals: [],
      score: 0,
      max: maxVal,           // gameMatcher uses 'max'
      maxPossible: maxVal,   // alias
      percentage: 0,
      penalties: 0,
      // Also add aliases for UI compatibility
      earned: 0,
      possible: maxVal,
    };
  });
  
  // Group signals by category
  Object.values(score.signals).forEach(signal => {
    const cat = signal.category;
    if (!categories[cat]) {
      // Shouldn't happen, but safety fallback
      categories[cat] = {
        label: cat,
        icon: '📋',
        signals: [],
        score: 0,
        max: 0,
        maxPossible: 0,
        percentage: 0,
        penalties: 0,
        earned: 0,
        possible: 0,
      };
    }
    
    categories[cat].signals.push({
      key: signal.key,
      label: signal.label,
      status: signal.status,
      contribution: signal.contribution,
      extractedValue: signal.extractedValue,
      gameValue: signal.gameValue,
      details: signal.details,
      weight: signal.weight,
      penalty: signal.penalty,
    });
    
    if (signal.contribution > 0) {
      categories[cat].score += signal.contribution;
      categories[cat].earned += signal.contribution;
    } else if (signal.contribution < 0) {
      categories[cat].penalties += signal.contribution;
      // Also add to the penalties category for the breakdown view
      categories.penalties.signals.push({
        key: signal.key,
        label: signal.label,
        status: signal.status,
        contribution: signal.contribution,
        extractedValue: signal.extractedValue,
        gameValue: signal.gameValue,
        details: signal.details,
        weight: signal.weight,
        penalty: signal.penalty,
      });
      categories.penalties.score += signal.contribution;
      categories.penalties.earned += signal.contribution;
    }
  });
  
  // Calculate percentages
  Object.values(categories).forEach(cat => {
    cat.percentage = cat.maxPossible > 0 ? Math.round((cat.score / cat.maxPossible) * 100) : 0;
  });
  
  return {
    confidence: score.confidence,
    rawScore: score.rawScore,
    reason: score.reason,
    meetsMinimum: score.meetsMinimum,
    wouldAutoLink: score.wouldAutoLink,
    thresholds: score.thresholds,
    breakdown: categories,
    allSignals: Object.values(score.signals),
  };
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  calculateMatchScore,
  rankCandidates,
  formatSignalsForResponse,
  THRESHOLDS,
  SIGNAL_DEFINITIONS,
  CATEGORY_META
};