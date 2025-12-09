// series-resolution.js
// Comprehensive series detection, matching, and creation logic
// 
// LOGIC FLOW:
// 1. Detect series membership using TournamentSeriesTitle (via seriesTitleId from scraper)
// 2. Find best temporal match: month → quarter → year
// 3. Create new TournamentSeries if none exists
// 4. Handle cases where seriesTitleId is missing but series name exists
//
// FIX: Improved name normalization to strip temporal components before comparing

const { v4: uuidv4 } = require('uuid');
const { QueryCommand, GetCommand, ScanCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

// ===================================================================
// NAME NORMALIZATION HELPERS
// ===================================================================

/**
 * Normalize a series name by removing temporal components
 * This allows matching "Signature Series February 2023" with "Signature Series 2023"
 */
const normalizeSeriesName = (name) => {
    if (!name) return '';
    
    return name
        .toLowerCase()
        // Remove month names
        .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi, '')
        // Remove quarter references
        .replace(/\bq[1-4]\b/gi, '')
        // Remove years (2020-2030)
        .replace(/\b20[2-3][0-9]\b/g, '')
        // Remove common suffixes that shouldn't affect matching
        .replace(/\b(edition|series)\b/gi, 'series') // Normalize "edition" to "series"
        // Clean up whitespace
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Calculate similarity score between two series names
 * Returns 0-100 score
 */
const calculateNameSimilarity = (name1, name2) => {
    const norm1 = normalizeSeriesName(name1);
    const norm2 = normalizeSeriesName(name2);
    
    // Exact match after normalization
    if (norm1 === norm2) return 100;
    
    // One contains the other
    if (norm1.includes(norm2) || norm2.includes(norm1)) return 90;
    
    // Check word overlap
    const words1 = new Set(norm1.split(' ').filter(w => w.length > 2));
    const words2 = new Set(norm2.split(' ').filter(w => w.length > 2));
    
    if (words1.size === 0 || words2.size === 0) return 0;
    
    const intersection = [...words1].filter(w => words2.has(w));
    const union = new Set([...words1, ...words2]);
    
    // Jaccard similarity
    const jaccard = intersection.length / union.size;
    
    return Math.round(jaccard * 80); // Max 80 for partial word match
};

// ===================================================================
// TEMPORAL MATCHING HELPERS
// ===================================================================

/**
 * Extract temporal components from a date
 */
const extractTemporalComponents = (dateValue) => {
    if (!dateValue) return null;
    
    try {
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) return null;
        
        const year = date.getFullYear();
        const month = date.getMonth() + 1; // 1-12
        const quarter = Math.ceil(month / 3); // 1-4
        
        return { year, month, quarter, date };
    } catch (error) {
        console.error('[SERIES] Error extracting temporal components:', error);
        return null;
    }
};

/**
 * Calculate proximity score between game date and series date range
 * Higher score = closer match
 * 
 * Scoring:
 * - Within date range: 100 points
 * - Same month: 95 points
 * - Adjacent month: 85 points
 * - Within 2 months: 75 points
 * - Same quarter: 70 points  
 * - Adjacent quarter: 60 points
 * - Same year: 50 points
 * 
 * FIX: Relaxed scoring to be more lenient for multi-day tournaments
 * that may span month boundaries
 */
const calculateTemporalProximity = (gameDate, series) => {
    const game = extractTemporalComponents(gameDate);
    if (!game) return 0;
    
    const seriesYear = series.year;
    const seriesMonth = series.month;
    const seriesQuarter = series.quarter;
    
    // Must be same year or we return 0
    if (game.year !== seriesYear) return 0;
    
    // If series has startDate/endDate, check if game falls within range (with buffer)
    if (series.startDate && series.endDate) {
        const seriesStart = new Date(series.startDate);
        const seriesEnd = new Date(series.endDate);
        
        // Add 7-day buffer on each end for multi-day tournaments
        seriesStart.setDate(seriesStart.getDate() - 7);
        seriesEnd.setDate(seriesEnd.getDate() + 7);
        
        if (game.date >= seriesStart && game.date <= seriesEnd) {
            return 100; // Game falls within series date range - perfect match
        }
    }
    
    let score = 50; // Base score for same year
    
    // Month matching (highest priority)
    if (seriesMonth) {
        const monthDiff = Math.abs(game.month - seriesMonth);
        if (monthDiff === 0) {
            score = 95; // Exact month match
        } else if (monthDiff === 1) {
            score = Math.max(score, 85); // Adjacent month
        } else if (monthDiff <= 2) {
            score = Math.max(score, 75); // Within 2 months
        }
    }
    
    // Quarter matching (medium priority)
    if (seriesQuarter && score < 95) {
        const quarterDiff = Math.abs(game.quarter - seriesQuarter);
        if (quarterDiff === 0) {
            score = Math.max(score, 70); // Exact quarter match
        } else if (quarterDiff === 1) {
            score = Math.max(score, 60); // Adjacent quarter
        }
    }
    
    return score;
};

/**
 * Find the best matching TournamentSeries from a list based on temporal proximity and name similarity
 * 
 * FIX: Now considers both temporal AND name similarity for better matching
 */
const findBestTemporalMatch = (seriesList, gameStartDateTime, venueId = null, inputSeriesName = null) => {
    if (!seriesList || seriesList.length === 0) return null;
    
    let bestMatch = null;
    let bestScore = 0;
    
    for (const series of seriesList) {
        let score = calculateTemporalProximity(gameStartDateTime, series);
        
        // FIX: Add name similarity bonus
        if (inputSeriesName && series.name) {
            const nameSimilarity = calculateNameSimilarity(inputSeriesName, series.name);
            // High name similarity can boost a temporal match significantly
            if (nameSimilarity >= 90) {
                score += 15; // Strong name match bonus
            } else if (nameSimilarity >= 70) {
                score += 10; // Good name match bonus
            } else if (nameSimilarity >= 50) {
                score += 5; // Partial name match bonus
            }
        }
        
        // Bonus points for venue match
        if (venueId && series.venueId === venueId) {
            score += 10;
        }
        
        console.log(`[SERIES] Candidate "${series.name}" (${series.id}): temporal=${calculateTemporalProximity(gameStartDateTime, series)}, total=${score}`);
        
        if (score > bestScore) {
            bestScore = score;
            bestMatch = series;
        }
    }
    
    // FIX: Lowered threshold from 75 to 60 to allow same-year matches
    // when temporal components are less precise
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

/**
 * Get all TournamentSeries for a given TournamentSeriesTitle
 */
const getSeriesInstancesByTitleId = async (ddbDocClient, tableName, seriesTitleId) => {
    try {
        const result = await ddbDocClient.send(new QueryCommand({
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

/**
 * Get TournamentSeries by year (fallback for name-based matching)
 */
const getSeriesByYear = async (ddbDocClient, tableName, year) => {
    try {
        const result = await ddbDocClient.send(new QueryCommand({
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

/**
 * Get TournamentSeriesTitle by ID
 */
const getSeriesTitleById = async (ddbDocClient, tableName, titleId) => {
    try {
        const result = await ddbDocClient.send(new GetCommand({
            TableName: tableName,
            Key: { id: titleId }
        }));
        return result.Item;
    } catch (error) {
        console.error('[SERIES] Error fetching series title:', error);
        return null;
    }
};

/**
 * Search TournamentSeriesTitle by name (for cases where we don't have seriesTitleId)
 * FIX: Uses normalized name matching
 */
const findSeriesTitleByName = async (ddbDocClient, tableName, seriesName) => {
    if (!seriesName) return null;
    
    const normalizedInput = normalizeSeriesName(seriesName);
    
    try {
        // Scan the TournamentSeriesTitle table
        const result = await ddbDocClient.send(new ScanCommand({
            TableName: tableName
        }));
        
        const titles = result.Items || [];
        
        // Score all titles and find best match
        let bestMatch = null;
        let bestScore = 0;
        
        for (const title of titles) {
            // Check title
            const titleScore = calculateNameSimilarity(seriesName, title.title);
            if (titleScore > bestScore) {
                bestScore = titleScore;
                bestMatch = title;
            }
            
            // Check aliases
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
        
        // Require at least 70% similarity
        if (bestScore >= 70) {
            console.log(`[SERIES] Title match: "${bestMatch.title}" with score ${bestScore}`);
            return bestMatch;
        }
        
        return null;
    } catch (error) {
        console.error('[SERIES] Error searching series title by name:', error);
        return null;
    }
};

/**
 * Create a new TournamentSeries
 */
const createTournamentSeries = async (ddbDocClient, tableName, seriesData) => {
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
    
    // Only add quarter if it has a value (GSI key can't be null)
    if (seriesData.quarter) {
        newSeries.quarter = seriesData.quarter;
    }
    
    // Only add month if it has a value (GSI key can't be null)
    if (seriesData.month) {
        newSeries.month = seriesData.month;
    }
    
    // Optional fields - only add if they have values
    if (seriesData.holidayType) {
        newSeries.holidayType = seriesData.holidayType;
    }
    if (seriesData.startDate) {
        newSeries.startDate = seriesData.startDate;
    }
    if (seriesData.endDate) {
        newSeries.endDate = seriesData.endDate;
    }
    if (seriesData.venueId) {
        newSeries.venueId = seriesData.venueId;
    }
    
    try {
        await ddbDocClient.send(new PutCommand({
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

/**
 * Generate a descriptive name for a new TournamentSeries
 */
const generateSeriesName = (titleName, year, month = null, quarter = null) => {
    const monthNames = ['', 'January', 'February', 'March', 'April', 'May', 'June', 
                        'July', 'August', 'September', 'October', 'November', 'December'];
    const quarterNames = ['', 'Q1', 'Q2', 'Q3', 'Q4'];
    
    let name = titleName;
    
    if (month) {
        name += ` ${monthNames[month]} ${year}`;
    } else if (quarter) {
        name += ` ${quarterNames[quarter]} ${year}`;
    } else {
        name += ` ${year}`;
    }
    
    return name;
};

// ===================================================================
// MAIN SERIES RESOLUTION FUNCTION
// ===================================================================

/**
 * Comprehensive series resolution
 * 
 * @param {Object} seriesRef - Series reference from scraper (seriesName, seriesTitleId, etc.)
 * @param {String} entityId - Entity ID
 * @param {String} gameStartDateTime - Game start date/time (ISO string)
 * @param {String} venueId - Venue ID (optional)
 * @param {Object} ddbDocClient - DynamoDB Document Client
 * @param {Function} getTableName - Function to get table name
 * @param {Object} monitoring - Monitoring instance (optional)
 * @param {Object} options - Additional options
 * @returns {Object} Resolution result
 */
const resolveSeriesComprehensive = async (
    seriesRef,
    entityId,
    gameStartDateTime,
    venueId,
    ddbDocClient,
    getTableName,
    monitoring = null,
    options = {}
) => {
    const { autoCreate = true } = options;
    
    // Not a series - return early
    if (!seriesRef || (!seriesRef.seriesName && !seriesRef.seriesTitleId)) {
        return {
            tournamentSeriesId: null,
            seriesName: null,
            seriesCategory: null,
            holidayType: null,
            status: 'NOT_SERIES',
            confidence: 0,
            wasCreated: false
        };
    }
    
    const seriesTable = getTableName('TournamentSeries');
    const seriesTitleTable = getTableName('TournamentSeriesTitle');
    
    // Extract temporal components from game date
    const temporal = extractTemporalComponents(gameStartDateTime);
    if (!temporal) {
        console.warn('[SERIES] Could not extract temporal components from game date');
        return {
            tournamentSeriesId: null,
            seriesName: seriesRef.seriesName,
            seriesCategory: null,
            holidayType: null,
            status: 'PENDING_ASSIGNMENT',
            confidence: 0,
            reason: 'Invalid game date',
            wasCreated: false
        };
    }
    
    const { year, month, quarter } = temporal;
    
    // Track operation
    if (monitoring) {
        monitoring.trackOperation('SERIES_RESOLVE', 'TournamentSeries', seriesRef.seriesName || 'unknown', {
            seriesTitleId: seriesRef.seriesTitleId,
            year,
            month,
            quarter
        });
    }
    
    console.log(`[SERIES] Resolving series: "${seriesRef.seriesName}" for ${year}-${month} (Q${quarter})`);
    
    // ===================================================================
    // STEP 1: Get or find TournamentSeriesTitle
    // ===================================================================
    
    let seriesTitle = null;
    
    if (seriesRef.seriesTitleId) {
        // We have a title ID from the scraper
        seriesTitle = await getSeriesTitleById(ddbDocClient, seriesTitleTable, seriesRef.seriesTitleId);
        console.log(`[SERIES] Found series title by ID: ${seriesTitle?.title}`);
    }
    
    if (!seriesTitle && seriesRef.seriesName) {
        // Try to find by name
        seriesTitle = await findSeriesTitleByName(ddbDocClient, seriesTitleTable, seriesRef.seriesName);
        console.log(`[SERIES] Found series title by name search: ${seriesTitle?.title}`);
    }
    
    // ===================================================================
    // STEP 2: Find existing TournamentSeries instances
    // ===================================================================
    
    let candidateSeries = [];
    
    if (seriesTitle) {
        // Get all series instances for this title
        candidateSeries = await getSeriesInstancesByTitleId(ddbDocClient, seriesTable, seriesTitle.id);
        console.log(`[SERIES] Found ${candidateSeries.length} series instances for title "${seriesTitle.title}"`);
    }
    
    // FIX: Always search by year AND use improved name matching
    // This catches cases where we have series instances that might match
    if (seriesRef.seriesName) {
        const yearSeries = await getSeriesByYear(ddbDocClient, seriesTable, year);
        console.log(`[SERIES] Found ${yearSeries.length} series for year ${year}`);
        
        // FIX: Use normalized name matching instead of simple includes
        const nameCandidates = yearSeries.filter(s => {
            const similarity = calculateNameSimilarity(seriesRef.seriesName, s.name);
            if (similarity >= 70) {
                console.log(`[SERIES] Name match: "${s.name}" similarity=${similarity}`);
                return true;
            }
            return false;
        });
        
        // Merge unique candidates
        for (const candidate of nameCandidates) {
            if (!candidateSeries.find(c => c.id === candidate.id)) {
                candidateSeries.push(candidate);
            }
        }
        console.log(`[SERIES] After name search: ${candidateSeries.length} total candidates`);
    }
    
    // ===================================================================
    // STEP 3: Find best temporal match
    // FIX: Pass inputSeriesName to findBestTemporalMatch for name similarity scoring
    // ===================================================================
    
    const match = findBestTemporalMatch(candidateSeries, gameStartDateTime, venueId, seriesRef.seriesName);
    
    // FIX: Lowered threshold from 75 to 60 to allow matches across month boundaries
    if (match && match.score >= 60) {
        // Good match found
        console.log(`[SERIES] Found temporal match: "${match.series.name}" (score: ${match.score})`);
        
        return {
            tournamentSeriesId: match.series.id,
            seriesName: match.series.name,
            seriesCategory: match.series.seriesCategory,
            holidayType: match.series.holidayType,
            status: 'AUTO_ASSIGNED',
            confidence: match.confidence,
            wasCreated: false,
            matchScore: match.score
        };
    }
    
    // ===================================================================
    // STEP 4: Check if we should create a new series
    // ===================================================================
    
    if (!autoCreate || !seriesTitle) {
        // Can't or shouldn't create - return pending
        console.log('[SERIES] No match found and auto-create disabled or no title found');
        
        return {
            tournamentSeriesId: null,
            seriesName: seriesRef.seriesName,
            seriesCategory: seriesTitle?.seriesCategory || null,
            holidayType: null,
            status: 'PENDING_ASSIGNMENT',
            confidence: 0,
            reason: !seriesTitle ? 'No matching TournamentSeriesTitle found' : 'Auto-create disabled',
            wasCreated: false,
            suggestedName: generateSeriesName(seriesRef.seriesName, year, month)
        };
    }
    
    // ===================================================================
    // STEP 5: Create new TournamentSeries
    // FIX: Don't create if we have ANY candidates for the same year - just use the best one
    // ===================================================================
    
    // Last check: if we have candidates but they didn't meet the threshold,
    // use the best one anyway rather than creating a duplicate
    if (candidateSeries.length > 0) {
        // Find best candidate regardless of score
        let bestCandidate = null;
        let bestScore = -1;
        
        for (const candidate of candidateSeries) {
            let score = calculateTemporalProximity(gameStartDateTime, candidate);
            const nameSimilarity = calculateNameSimilarity(seriesRef.seriesName, candidate.name);
            score += (nameSimilarity / 10); // Add some name weight
            
            if (score > bestScore) {
                bestScore = score;
                bestCandidate = candidate;
            }
        }
        
        if (bestCandidate) {
            console.log(`[SERIES] Using existing series "${bestCandidate.name}" to avoid duplicate (score: ${bestScore})`);
            return {
                tournamentSeriesId: bestCandidate.id,
                seriesName: bestCandidate.name,
                seriesCategory: bestCandidate.seriesCategory,
                holidayType: bestCandidate.holidayType,
                status: 'AUTO_ASSIGNED',
                confidence: Math.min(bestScore / 100, 0.8), // Cap at 0.8 for lower-confidence match
                wasCreated: false,
                matchScore: bestScore,
                note: 'Used existing series to avoid duplicate'
            };
        }
    }
    
    console.log(`[SERIES] Creating new TournamentSeries for "${seriesTitle.title}" ${year}-${month}`);
    
    // Track creation
    if (monitoring) {
        monitoring.trackOperation('SERIES_CREATE', 'TournamentSeries', seriesTitle.title, {
            year,
            month,
            quarter
        });
    }
    
    // Determine if we should scope by month, quarter, or year
    // Use month if there are multiple series in the same year
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
        const newSeries = await createTournamentSeries(ddbDocClient, seriesTable, {
            name: newSeriesName,
            year,
            quarter: useQuarter || useMonth ? quarter : null,
            month: useMonth ? month : null,
            seriesCategory: seriesTitle.seriesCategory || 'REGULAR',
            tournamentSeriesTitleId: seriesTitle.id,
            venueId: venueId || null,
            startDate: gameStartDateTime // Use game date as initial start date
        });
        
        return {
            tournamentSeriesId: newSeries.id,
            seriesName: newSeries.name,
            seriesCategory: newSeries.seriesCategory,
            holidayType: newSeries.holidayType,
            status: 'AUTO_ASSIGNED',
            confidence: 0.9,
            wasCreated: true,
            seriesTitleId: seriesTitle.id
        };
        
    } catch (error) {
        console.error('[SERIES] Failed to create TournamentSeries:', error);
        
        return {
            tournamentSeriesId: null,
            seriesName: seriesRef.seriesName,
            seriesCategory: seriesTitle?.seriesCategory || null,
            holidayType: null,
            status: 'PENDING_ASSIGNMENT',
            confidence: 0,
            error: error.message,
            wasCreated: false
        };
    }
};

/**
 * Update TournamentSeries date range when a game is assigned
 * Call this after successfully saving a game to a series
 */
const updateSeriesDateRange = async (ddbDocClient, tableName, seriesId, gameStartDateTime) => {
    try {
        // Get current series
        const result = await ddbDocClient.send(new GetCommand({
            TableName: tableName,
            Key: { id: seriesId }
        }));
        
        if (!result.Item) return;
        
        const series = result.Item;
        const gameDate = new Date(gameStartDateTime);
        const now = new Date().toISOString();
        const timestamp = Date.now();
        
        let needsUpdate = false;
        const updates = {};
        
        // Check if we need to expand the date range
        if (!series.startDate || gameDate < new Date(series.startDate)) {
            updates.startDate = gameStartDateTime;
            needsUpdate = true;
        }
        
        if (!series.endDate || gameDate > new Date(series.endDate)) {
            updates.endDate = gameStartDateTime;
            needsUpdate = true;
        }
        
        // Update status if game is in the past
        if (new Date() > gameDate && series.status === 'SCHEDULED') {
            updates.status = 'LIVE';
            needsUpdate = true;
        }
        
        if (!needsUpdate) return;
        
        updates.updatedAt = now;
        updates._lastChangedAt = timestamp;
        
        const updateExpression = 'SET ' + Object.keys(updates).map(k => `#${k} = :${k}`).join(', ');
        const expressionAttributeNames = Object.fromEntries(Object.keys(updates).map(k => [`#${k}`, k]));
        const expressionAttributeValues = Object.fromEntries(Object.keys(updates).map(k => [`:${k}`, updates[k]]));
        
        await ddbDocClient.send(new UpdateCommand({
            TableName: tableName,
            Key: { id: seriesId },
            UpdateExpression: updateExpression,
            ExpressionAttributeNames: expressionAttributeNames,
            ExpressionAttributeValues: expressionAttributeValues
        }));
        
        console.log(`[SERIES] Updated series ${seriesId} date range`);
        
    } catch (error) {
        console.error('[SERIES] Error updating series date range:', error);
        // Non-critical error - don't throw
    }
};

/**
 * Increment event count on TournamentSeries
 */
const incrementSeriesEventCount = async (ddbDocClient, tableName, seriesId) => {
    try {
        const timestamp = Date.now();
        
        await ddbDocClient.send(new UpdateCommand({
            TableName: tableName,
            Key: { id: seriesId },
            UpdateExpression: 'SET numberOfEvents = if_not_exists(numberOfEvents, :zero) + :one, updatedAt = :now, #lca = :lca',
            ExpressionAttributeNames: { '#lca': '_lastChangedAt' },
            ExpressionAttributeValues: {
                ':zero': 0,
                ':one': 1,
                ':now': new Date().toISOString(),
                ':lca': timestamp
            }
        }));
        
        console.log(`[SERIES] Incremented event count for series ${seriesId}`);
        
    } catch (error) {
        console.error('[SERIES] Error incrementing event count:', error);
        // Non-critical error - don't throw
    }
};

module.exports = {
    resolveSeriesComprehensive,
    extractTemporalComponents,
    calculateTemporalProximity,
    findBestTemporalMatch,
    generateSeriesName,
    updateSeriesDateRange,
    incrementSeriesEventCount,
    // NEW: Export name helpers for testing
    normalizeSeriesName,
    calculateNameSimilarity,
    // Export helpers for testing
    getSeriesInstancesByTitleId,
    getSeriesByYear,
    getSeriesTitleById,
    findSeriesTitleByName,
    createTournamentSeries
};