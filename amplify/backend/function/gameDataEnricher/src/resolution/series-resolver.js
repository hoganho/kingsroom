/**
 * series-resolver.js
 * Series detection, matching, and creation logic
 * Adapted from existing series-resolution.js
 */

const { v4: uuidv4 } = require('uuid');
const { getDocClient, getTableName, QueryCommand, GetCommand, PutCommand, UpdateCommand, ScanCommand } = require('../utils/db-client');
const { SERIES_KEYWORDS, STRUCTURE_KEYWORDS, HOLIDAY_PATTERNS, VALIDATION_THRESHOLDS } = require('../utils/constants');

// ===================================================================
// HEURISTIC HELPERS
// ===================================================================

/**
 * Determines if a game is definitively a series based on name/structure
 */
const detectSeriesSignal = (name) => {
  if (!name) return { isSeries: false, confidence: 0 };
  
  const lowerName = name.toLowerCase();
  
  // Structural indicators (definitive)
  if (STRUCTURE_KEYWORDS.some(k => lowerName.includes(k))) {
    return { isSeries: true, confidence: 1.0, reason: 'STRUCTURE_INDICATOR' };
  }
  
  // Keyword match
  if (SERIES_KEYWORDS.some(k => lowerName.includes(k))) {
    return { isSeries: true, confidence: 0.9, reason: 'KEYWORD_MATCH' };
  }
  
  // High guarantee (>$30k, not weekly)
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
 * Detect holiday context from date
 */
const detectHolidayContext = (dateObj) => {
  if (!dateObj) return null;
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

// ===================================================================
// NAME NORMALIZATION
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

const findSeriesTitleByName = async (seriesName) => {
  if (!seriesName) return null;
  
  const client = getDocClient();
  const tableName = getTableName('TournamentSeriesTitle');
  
  try {
    const result = await client.send(new ScanCommand({ TableName: tableName }));
    const titles = result.Items || [];
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const title of titles) {
      const titleScore = calculateNameSimilarity(seriesName, title.title);
      if (titleScore > bestScore) {
        bestScore = titleScore;
        bestMatch = title;
      }
      if (title.aliases && Array.isArray(title.aliases)) {
        for (const alias of title.aliases) {
          const aliasScore = calculateNameSimilarity(seriesName, alias);
          if (aliasScore > bestScore) {
            bestScore = aliasScore;
            bestMatch = title;
          }
        }
      }
    }
    
    if (bestScore >= VALIDATION_THRESHOLDS.SERIES_NAME_SIMILARITY_THRESHOLD) {
      console.log(`[SERIES] Title match: "${bestMatch.title}" with score ${bestScore}`);
      return bestMatch;
    }
    return null;
  } catch (error) {
    console.error('[SERIES] Error searching series title by name:', error);
    return null;
  }
};

const createTournamentSeries = async (seriesData) => {
  const client = getDocClient();
  const tableName = getTableName('TournamentSeries');
  
  const now = new Date().toISOString();
  const timestamp = Date.now();
  
  const newSeries = {
    id: uuidv4(),
    name: seriesData.name,
    year: seriesData.year,
    seriesCategory: seriesData.seriesCategory || 'REGULAR',
    status: 'SCHEDULED',
    tournamentSeriesTitleId: seriesData.tournamentSeriesTitleId,
    numberOfEvents: 0,
    createdAt: now,
    updatedAt: now,
    _version: 1,
    _lastChangedAt: timestamp,
    __typename: 'TournamentSeries'
  };
  
  if (seriesData.quarter) newSeries.quarter = seriesData.quarter;
  if (seriesData.month) newSeries.month = seriesData.month;
  if (seriesData.holidayType) newSeries.holidayType = seriesData.holidayType;
  if (seriesData.startDate) newSeries.startDate = seriesData.startDate;
  if (seriesData.venueId) newSeries.venueId = seriesData.venueId;
  
  try {
    await client.send(new PutCommand({
      TableName: tableName,
      Item: newSeries
    }));
    console.log(`[SERIES] Created new TournamentSeries: ${newSeries.name} (${newSeries.id})`);
    return newSeries;
  } catch (error) {
    console.error('[SERIES] Error creating TournamentSeries:', error);
    throw error;
  }
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
// MAIN RESOLVER
// ===================================================================

/**
 * Resolve series assignment for a game
 * 
 * @param {Object} params
 * @param {Object} params.game - Game data
 * @param {string} params.entityId - Entity ID
 * @param {Object} params.seriesInput - Series input from caller
 * @param {boolean} params.autoCreate - Whether to auto-create series
 * @returns {Object} { gameUpdates, metadata }
 */
const resolveSeriesAssignment = async ({ game, entityId, seriesInput = {}, autoCreate = true }) => {
  const gameStartDateTime = game.gameStartDateTime;
  const venueId = game.venueId;
  const seriesName = seriesInput.seriesName || game.seriesName;
  const seriesTitleId = seriesInput.seriesTitleId;
  const providedSeriesId = seriesInput.tournamentSeriesId;
  
  // If series ID already provided, just use it
  if (providedSeriesId) {
    return {
      gameUpdates: {
        tournamentSeriesId: providedSeriesId,
        seriesAssignmentStatus: 'MANUALLY_ASSIGNED',
        seriesAssignmentConfidence: 1.0
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
    return {
      gameUpdates: {
        seriesAssignmentStatus: 'PENDING_ASSIGNMENT',
        seriesAssignmentConfidence: 0
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
  
  // Check heuristic signals
  const heuristicSignal = detectSeriesSignal(seriesName || game.name);
  
  if (heuristicSignal.isSeries) {
    console.log(`[SERIES] Detected Heuristic Signal: ${heuristicSignal.reason}`);
    
    const holidayName = detectHolidayContext(new Date(gameStartDateTime));
    let generatedSeriesName = normalizeSeriesName(seriesName || game.name);
    let category = 'SPECIAL';
    
    if (holidayName) {
      generatedSeriesName = `${holidayName} Series ${year}`;
      category = 'SEASONAL';
    } else if (generatedSeriesName.includes('championship')) {
      generatedSeriesName = generatedSeriesName.replace(/\d{4}/, '').trim() + ` ${year}`;
      category = 'CHAMPIONSHIP';
    } else {
      generatedSeriesName = `${generatedSeriesName} ${year}`;
      category = 'SPECIAL';
    }
    
    // Search for existing series
    const yearSeries = await getSeriesByYear(year);
    let bestCandidate = null;
    let bestScore = 0;
    
    for (const s of yearSeries) {
      const sim = calculateNameSimilarity(generatedSeriesName, s.name);
      if (sim > bestScore) {
        bestScore = sim;
        bestCandidate = s;
      }
    }
    
    if (bestCandidate && bestScore >= 75) {
      return {
        gameUpdates: {
          tournamentSeriesId: bestCandidate.id,
          seriesName: bestCandidate.name,
          seriesAssignmentStatus: 'AUTO_ASSIGNED',
          seriesAssignmentConfidence: 0.95,
          isSeries: true
        },
        metadata: {
          status: 'MATCHED_EXISTING',
          confidence: 0.95,
          matchedSeriesId: bestCandidate.id,
          matchedSeriesName: bestCandidate.name,
          wasCreated: false,
          matchReason: 'heuristic_match'
        }
      };
    }
    
    // Auto-create if enabled
    if (autoCreate) {
      try {
        const displaySeriesName = generatedSeriesName.charAt(0).toUpperCase() + generatedSeriesName.slice(1);
        const newSeries = await createTournamentSeries({
          name: displaySeriesName,
          year,
          seriesCategory: category,
          tournamentSeriesTitleId: null,
          venueId: venueId || null,
          startDate: gameStartDateTime
        });
        
        return {
          gameUpdates: {
            tournamentSeriesId: newSeries.id,
            seriesName: newSeries.name,
            seriesAssignmentStatus: 'AUTO_ASSIGNED',
            seriesAssignmentConfidence: 0.9,
            isSeries: true
          },
          metadata: {
            status: 'CREATED_NEW',
            confidence: 0.9,
            matchedSeriesId: newSeries.id,
            matchedSeriesName: newSeries.name,
            wasCreated: true,
            createdSeriesId: newSeries.id,
            matchReason: 'heuristic_creation'
          }
        };
      } catch (err) {
        console.error('[SERIES] Heuristic creation failed:', err);
      }
    }
  }
  
  // Standard title/name lookup
  if (!seriesName && !seriesTitleId) {
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
        matchReason: 'no_series_info'
      }
    };
  }
  
  // Find series title
  let seriesTitle = null;
  if (seriesTitleId) {
    seriesTitle = await getSeriesTitleById(seriesTitleId);
  }
  if (!seriesTitle && seriesName) {
    seriesTitle = await findSeriesTitleByName(seriesName);
  }
  
  // Get candidate series
  let candidateSeries = [];
  if (seriesTitle) {
    candidateSeries = await getSeriesInstancesByTitleId(seriesTitle.id);
  }
  
  if (seriesName) {
    const yearSeries = await getSeriesByYear(year);
    const nameCandidates = yearSeries.filter(s => {
      const sim = calculateNameSimilarity(seriesName, s.name);
      return sim >= 70;
    });
    
    for (const c of nameCandidates) {
      if (!candidateSeries.find(existing => existing.id === c.id)) {
        candidateSeries.push(c);
      }
    }
  }
  
  // Find best temporal match
  const match = findBestTemporalMatch(candidateSeries, gameStartDateTime, venueId, seriesName);
  
  if (match && match.score >= 60) {
    return {
      gameUpdates: {
        tournamentSeriesId: match.series.id,
        seriesName: match.series.name,
        seriesAssignmentStatus: 'AUTO_ASSIGNED',
        seriesAssignmentConfidence: match.confidence,
        isSeries: true
      },
      metadata: {
        status: 'MATCHED_EXISTING',
        confidence: match.confidence,
        matchedSeriesId: match.series.id,
        matchedSeriesName: match.series.name,
        matchedSeriesTitleId: seriesTitle?.id,
        wasCreated: false,
        matchReason: 'temporal_match'
      }
    };
  }
  
  // Auto-create if we have a title
  if (autoCreate && seriesTitle) {
    // Check for same-year candidate first to avoid duplicates
    if (candidateSeries.length > 0) {
      let bestCandidate = null;
      let bestScore = -1;
      
      for (const candidate of candidateSeries) {
        let score = calculateTemporalProximity(gameStartDateTime, candidate);
        if (seriesName) {
          const sim = calculateNameSimilarity(seriesName, candidate.name);
          score += (sim / 5);
        }
        if (score > bestScore) {
          bestScore = score;
          bestCandidate = candidate;
        }
      }
      
      if (bestCandidate && bestCandidate.year === year) {
        console.log(`[SERIES] Avoided duplicate. Matched to ${bestCandidate.name} (Score: ${bestScore})`);
        return {
          gameUpdates: {
            tournamentSeriesId: bestCandidate.id,
            seriesName: bestCandidate.name,
            seriesAssignmentStatus: 'AUTO_ASSIGNED',
            seriesAssignmentConfidence: 0.75,
            isSeries: true
          },
          metadata: {
            status: 'MATCHED_EXISTING',
            confidence: 0.75,
            matchedSeriesId: bestCandidate.id,
            matchedSeriesName: bestCandidate.name,
            wasCreated: false,
            matchReason: 'duplicate_avoidance'
          }
        };
      }
    }
    
    // Create new series
    const sameYearSeries = candidateSeries.filter(s => s.year === year);
    const useMonth = sameYearSeries.length > 0;
    const useQuarter = !useMonth && candidateSeries.length > 0;
    
    const newSeriesName = generateSeriesName(
      seriesTitle.title,
      year,
      useMonth ? month : null,
      useQuarter ? quarter : null
    );
    
    try {
      const newSeries = await createTournamentSeries({
        name: newSeriesName,
        year,
        quarter: useQuarter || useMonth ? quarter : null,
        month: useMonth ? month : null,
        seriesCategory: seriesTitle.seriesCategory || 'REGULAR',
        tournamentSeriesTitleId: seriesTitle.id,
        venueId: venueId || null,
        startDate: gameStartDateTime
      });
      
      return {
        gameUpdates: {
          tournamentSeriesId: newSeries.id,
          seriesName: newSeries.name,
          seriesAssignmentStatus: 'AUTO_ASSIGNED',
          seriesAssignmentConfidence: 0.9,
          isSeries: true
        },
        metadata: {
          status: 'CREATED_NEW',
          confidence: 0.9,
          matchedSeriesId: newSeries.id,
          matchedSeriesName: newSeries.name,
          matchedSeriesTitleId: seriesTitle.id,
          wasCreated: true,
          createdSeriesId: newSeries.id,
          matchReason: 'title_based_creation'
        }
      };
    } catch (error) {
      console.error('[SERIES] Failed to create:', error);
    }
  }
  
  // Fallback - pending assignment
  return {
    gameUpdates: {
      seriesName: seriesName,
      seriesAssignmentStatus: 'PENDING_ASSIGNMENT',
      seriesAssignmentConfidence: 0,
      suggestedSeriesName: seriesName,
      isSeries: true
    },
    metadata: {
      status: 'FAILED',
      confidence: 0,
      wasCreated: false,
      matchReason: 'no_match_found'
    }
  };
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  resolveSeriesAssignment,
  detectSeriesSignal,
  normalizeSeriesName,
  calculateNameSimilarity,
  extractTemporalComponents
};
