// series-resolution.js
// Comprehensive series detection, matching, and creation logic
// 
// LOGIC FLOW:
// 1. Check heuristics (Signals) - Detects "Flight 1A", "Championship", etc.
// 2. Detect series membership using TournamentSeriesTitle (via ID)
// 3. Find best temporal match: month → quarter → year
// 4. Create new TournamentSeries if none exists

const { v4: uuidv4 } = require('uuid');
const { QueryCommand, GetCommand, ScanCommand, PutCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

// ===================================================================
// CONFIGURATION & CONSTANTS
// ===================================================================

const SERIES_KEYWORDS = [
    'championship', 'festival', 'series', 'classic', 'open', 
    'cup', 'challenge', 'state', 'annual', 'invitational', 
    'platinum', 'diamond', 'gold', 'prestige', 'tour'
];

const STRUCTURE_KEYWORDS = [
    'flight 1', 'flight a', 'flight b', 'flight c', 'flight d',
    'day 2', 'day 3', 'final day', 'main event', 'high roller'
];

// NSW/Australian Major Holidays (Month 0-11)
const HOLIDAY_PATTERNS = [
    { name: 'New Years', month: 0, day: 1, window: 3 },
    { name: 'Australia Day', month: 0, day: 26, window: 4 },
    { name: 'Anzac Day', month: 3, day: 25, window: 5 },
    { name: 'Kings Birthday', month: 5, window: 7 }, // Moveable
    { name: 'Labour Day', month: 9, window: 7 },     // Oct in NSW
    { name: 'Christmas', month: 11, day: 25, window: 7 },
    { name: 'Easter', month: 2, window: 14 },        // Broad window
    { name: 'Easter', month: 3, window: 14 }
];

// ===================================================================
// HEURISTIC HELPERS
// ===================================================================

/**
 * Determines if a game is definitively a series based on name/structure 
 * This overrides standard scraper defaults (like "Weekly").
 */
const detectSeriesSignal = (name) => {
    if (!name) return { isSeries: false, confidence: 0 };
    
    const lowerName = name.toLowerCase();

    // 1. Structural Check (Definitive)
    // Regular weekly games NEVER have Flights or Day 2s
    if (STRUCTURE_KEYWORDS.some(k => lowerName.includes(k))) {
        return { isSeries: true, confidence: 1.0, reason: 'STRUCTURE_INDICATOR' };
    }

    // 2. Prestige/Keyword Check
    if (SERIES_KEYWORDS.some(k => lowerName.includes(k))) {
        return { isSeries: true, confidence: 0.9, reason: 'KEYWORD_MATCH' };
    }

    // 3. High Guarantee Check
    // FIX: Threshold set to 30k to avoid "Big Friday $20k" regular games
    // FIX: Explicitly ignore if the name contains "weekly"
    const guaranteeMatch = lowerName.match(/\$([0-9]+)k/);
    if (guaranteeMatch) {
        const amount = parseInt(guaranteeMatch[1]);
        if (amount >= 30 && !lowerName.includes('weekly')) {
            return { isSeries: true, confidence: 0.85, reason: 'HIGH_GUARANTEE' };
        }
    }

    return { isSeries: false, confidence: 0 };
};

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
                return h.name; // Loose match for moveable holidays
            }
        }
    }
    return null;
};

// ===================================================================
// NAME NORMALIZATION HELPERS
// ===================================================================

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
        // Remove structure info
        .replace(/flight\s+[0-9a-z]+/gi, '')
        .replace(/day\s+[0-9]+/gi, '')
        .replace(/\$[0-9]+k\s+gtd/gi, '')
        // Remove common suffixes
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
// TEMPORAL MATCHING HELPERS
// ===================================================================

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

const calculateTemporalProximity = (gameDate, series) => {
    const game = extractTemporalComponents(gameDate);
    if (!game) return 0;
    
    const seriesYear = series.year;
    const seriesMonth = series.month;
    const seriesQuarter = series.quarter;
    
    if (game.year !== seriesYear) return 0;
    
    // Check strict date range if available
    if (series.startDate && series.endDate) {
        const seriesStart = new Date(series.startDate);
        const seriesEnd = new Date(series.endDate);
        // Buffer for multi-day events
        seriesStart.setDate(seriesStart.getDate() - 7);
        seriesEnd.setDate(seriesEnd.getDate() + 7);
        
        if (game.date >= seriesStart && game.date <= seriesEnd) {
            return 100; 
        }
    }
    
    let score = 50; // Base score for same year
    
    if (seriesMonth) {
        const monthDiff = Math.abs(game.month - seriesMonth);
        if (monthDiff === 0) score = 95;
        else if (monthDiff === 1) score = Math.max(score, 85);
        else if (monthDiff <= 2) score = Math.max(score, 75);
    }
    
    if (seriesQuarter && score < 95) {
        const quarterDiff = Math.abs(game.quarter - seriesQuarter);
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
    
    // Threshold set to 60 to allow same-year matches
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

const findSeriesTitleByName = async (ddbDocClient, tableName, seriesName) => {
    if (!seriesName) return null;
    const normalizedInput = normalizeSeriesName(seriesName);
    
    try {
        const result = await ddbDocClient.send(new ScanCommand({ TableName: tableName }));
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

const createTournamentSeries = async (ddbDocClient, tableName, seriesData) => {
    const now = new Date().toISOString();
    const timestamp = Date.now();
    
    const newSeries = {
        id: uuidv4(),
        name: seriesData.name,
        year: seriesData.year,
        seriesCategory: seriesData.seriesCategory || 'REGULAR',
        status: 'SCHEDULED',
        tournamentSeriesTitleId: seriesData.tournamentSeriesTitleId, // Can be null if heuristic creation
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
    if (seriesData.endDate) newSeries.endDate = seriesData.endDate;
    if (seriesData.venueId) newSeries.venueId = seriesData.venueId;
    
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
// MAIN SERIES RESOLUTION FUNCTION
// ===================================================================

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
    const seriesTable = getTableName('TournamentSeries');
    const seriesTitleTable = getTableName('TournamentSeriesTitle');
    
    // Extract temporal components
    const temporal = extractTemporalComponents(gameStartDateTime);
    if (!temporal) {
        return {
            tournamentSeriesId: null,
            status: 'PENDING_ASSIGNMENT',
            confidence: 0,
            reason: 'Invalid game date',
            wasCreated: false
        };
    }
    const { year, month, quarter } = temporal;

    // -------------------------------------------------------------
    // PRIORITY 1: HEURISTIC CHECK (Signals)
    // -------------------------------------------------------------
    
    const heuristicSignal = detectSeriesSignal(seriesRef.seriesName);
    
    if (heuristicSignal.isSeries) {
        console.log(`[SERIES] Detected Heuristic Signal: ${heuristicSignal.reason}`);
        
        const holidayName = detectHolidayContext(new Date(gameStartDateTime));
        let generatedSeriesName = normalizeSeriesName(seriesRef.seriesName); 
        let category = 'SPECIAL';

        if (holidayName) {
            generatedSeriesName = `${holidayName} Series ${year}`;
            category = 'HOLIDAY';
        } else if (generatedSeriesName.includes('championship')) {
            generatedSeriesName = generatedSeriesName.replace(/\d{4}/, '').trim() + ` ${year}`;
            category = 'CHAMPIONSHIP';
        } else {
            generatedSeriesName = `${generatedSeriesName} ${year}`;
            category = 'SEASONAL';
        }

        // Search for existing Series by name
        const yearSeries = await getSeriesByYear(ddbDocClient, seriesTable, year);
        
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
                tournamentSeriesId: bestCandidate.id,
                seriesName: bestCandidate.name,
                seriesCategory: bestCandidate.seriesCategory,
                status: 'AUTO_ASSIGNED',
                confidence: 0.95,
                wasCreated: false,
                note: 'Heuristic Match'
            };
        }
        
        if (autoCreate) {
             try {
                const displaySeriesName = generatedSeriesName.charAt(0).toUpperCase() + generatedSeriesName.slice(1);
                const newSeries = await createTournamentSeries(ddbDocClient, seriesTable, {
                    name: displaySeriesName,
                    year,
                    seriesCategory: category,
                    tournamentSeriesTitleId: null,
                    venueId: venueId || null,
                    startDate: gameStartDateTime
                });

                return {
                    tournamentSeriesId: newSeries.id,
                    seriesName: newSeries.name,
                    seriesCategory: newSeries.seriesCategory,
                    status: 'AUTO_ASSIGNED',
                    confidence: 0.9,
                    wasCreated: true,
                    note: 'Heuristic Creation'
                };
            } catch (err) {
                console.error('[SERIES] Heuristic creation failed:', err);
            }
        }
    }

    // -------------------------------------------------------------
    // PRIORITY 2: STANDARD TITLE ID / NAME LOOKUP
    // -------------------------------------------------------------
    
    if (!seriesRef || (!seriesRef.seriesName && !seriesRef.seriesTitleId)) {
        return { tournamentSeriesId: null, status: 'NOT_SERIES', confidence: 0 };
    }

    let seriesTitle = null;

    if (seriesRef.seriesTitleId) {
        seriesTitle = await getSeriesTitleById(ddbDocClient, seriesTitleTable, seriesRef.seriesTitleId);
    }
    
    if (!seriesTitle && seriesRef.seriesName) {
        seriesTitle = await findSeriesTitleByName(ddbDocClient, seriesTitleTable, seriesRef.seriesName);
    }

    let candidateSeries = [];
    if (seriesTitle) {
        candidateSeries = await getSeriesInstancesByTitleId(ddbDocClient, seriesTable, seriesTitle.id);
    }

    if (seriesRef.seriesName) {
        const yearSeries = await getSeriesByYear(ddbDocClient, seriesTable, year);
        const nameCandidates = yearSeries.filter(s => {
            const sim = calculateNameSimilarity(seriesRef.seriesName, s.name);
            return sim >= 70;
        });
        
        for (const c of nameCandidates) {
            if (!candidateSeries.find(existing => existing.id === c.id)) {
                candidateSeries.push(c);
            }
        }
    }

    const match = findBestTemporalMatch(candidateSeries, gameStartDateTime, venueId, seriesRef.seriesName);

    if (match && match.score >= 60) {
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

    // -------------------------------------------------------------
    // LOGIC RESTORED HERE: Check for duplicate avoidance
    // -------------------------------------------------------------

    if (autoCreate && seriesTitle) {
        // If we have candidates but score was low, force match to best one to avoid dupe
        // This prevents creating "Summer Series 2024" if "Summer Series 2024" exists but dates were slightly off
        if (candidateSeries.length > 0) {
             let bestCandidate = null;
             let bestScore = -1;
             
             for (const candidate of candidateSeries) {
                 // Recalculate basic proximity without strict threshold
                 let score = calculateTemporalProximity(gameStartDateTime, candidate);
                 
                 // If names are very similar, boost score heavily
                 if (seriesRef.seriesName) {
                    const sim = calculateNameSimilarity(seriesRef.seriesName, candidate.name);
                    score += (sim / 5); // Add up to 20 points for name match
                 }

                 if (score > bestScore) { 
                     bestScore = score; 
                     bestCandidate = candidate; 
                 }
             }

             // If we found a candidate in the same year, use it
             if (bestCandidate && bestCandidate.year === year) {
                 console.log(`[SERIES] Avoided duplicate. Matched to ${bestCandidate.name} (Score: ${bestScore})`);
                 return {
                     tournamentSeriesId: bestCandidate.id,
                     seriesName: bestCandidate.name,
                     seriesCategory: bestCandidate.seriesCategory,
                     status: 'AUTO_ASSIGNED',
                     confidence: 0.75, 
                     wasCreated: false,
                     note: 'Forced match to existing candidate to avoid duplicate'
                 };
             }
        }

        // If no viable candidate, proceed to create
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
                startDate: gameStartDateTime
            });
            
            return {
                tournamentSeriesId: newSeries.id,
                seriesName: newSeries.name,
                seriesCategory: newSeries.seriesCategory,
                status: 'AUTO_ASSIGNED',
                confidence: 0.9,
                wasCreated: true,
                seriesTitleId: seriesTitle.id
            };
        } catch (error) {
            console.error('[SERIES] Failed to create:', error);
            // Fallthrough
        }
    }

    return {
        tournamentSeriesId: null,
        seriesName: seriesRef.seriesName,
        status: 'PENDING_ASSIGNMENT',
        confidence: 0,
        wasCreated: false
    };
};

const updateSeriesDateRange = async (ddbDocClient, tableName, seriesId, gameStartDateTime) => {
    try {
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
        
        if (!series.startDate || gameDate < new Date(series.startDate)) {
            updates.startDate = gameStartDateTime;
            needsUpdate = true;
        }
        if (!series.endDate || gameDate > new Date(series.endDate)) {
            updates.endDate = gameStartDateTime;
            needsUpdate = true;
        }
        if (new Date() > gameDate && series.status === 'SCHEDULED') {
            updates.status = 'LIVE';
            needsUpdate = true;
        }
        
        if (needsUpdate) {
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
        }
    } catch (error) {
        console.error('[SERIES] Error updating series date range:', error);
    }
};

const incrementSeriesEventCount = async (ddbDocClient, tableName, seriesId) => {
    try {
        const timestamp = Date.now();
        await ddbDocClient.send(new UpdateCommand({
            TableName: tableName,
            Key: { id: seriesId },
            UpdateExpression: 'SET numberOfEvents = if_not_exists(numberOfEvents, :zero) + :one, updatedAt = :now, #lca = :lca',
            ExpressionAttributeNames: { '#lca': '_lastChangedAt' },
            ExpressionAttributeValues: {
                ':zero': 0, ':one': 1, ':now': new Date().toISOString(), ':lca': timestamp
            }
        }));
        console.log(`[SERIES] Incremented event count for series ${seriesId}`);
    } catch (error) {
        console.error('[SERIES] Error incrementing event count:', error);
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
    normalizeSeriesName,
    calculateNameSimilarity,
    getSeriesInstancesByTitleId,
    getSeriesByYear,
    getSeriesTitleById,
    findSeriesTitleByName,
    createTournamentSeries
};