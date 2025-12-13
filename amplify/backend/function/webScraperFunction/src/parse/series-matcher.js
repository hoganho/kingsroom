/**
 * ===================================================================
 * Series Matcher
 * ===================================================================
 * 
 * Detects tournament series from names and matches against database.
 * Extracts series details like day number, flight letter, etc.
 * 
 * ===================================================================
 */

const stringSimilarity = require('string-similarity');
const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName } = require('../config/tables');
const { SERIES_MATCH_THRESHOLD } = require('../config/constants');

/**
 * Clean name for series matching - removes venue names and jargon
 * 
 * @param {string} name - Name to clean
 * @param {array} venues - Venues to remove from series matching
 * @returns {string} Cleaned name
 */
const cleanupNameForSeriesMatching = (name, venues = []) => {
    if (!name) return '';
    
    let cleanedName = ` ${name.replace(/[^a-zA-Z0-9\s]/g, '')} `;
    
    // Remove poker jargon
    const jargonRegexes = [
        /\b(Event|Flight|Day)\s+[a-zA-Z0-9]*\d[a-zA-Z0-9]*\b/gi,
        /\bMain Event\b/gi,
        /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi,
    ];
    
    jargonRegexes.forEach(regex => {
        cleanedName = cleanedName.replace(regex, ' ');
    });
    
    // Remove venue names when matching series
    venues.forEach(venue => {
        [venue.name, ...(venue.aliases || [])].forEach(venueName => {
            const cleanedVenueName = venueName.replace(/[^a-zA-Z0-9\s]/g, '');
            cleanedName = cleanedName.replace(new RegExp(`\\b${cleanedVenueName}\\b`, 'gi'), ' ');
        });
    });
    
    return cleanedName.replace(/\s+/g, ' ').trim();
};

/**
 * Extract series details from tournament name
 * 
 * @param {string} tournamentName - Tournament name to analyze
 * @returns {object} Series details
 */
const extractSeriesDetails = (tournamentName) => {
    const details = {};
    
    // Extract year (2020-2029)
    const yearMatch = tournamentName.match(/20\d{2}/);
    if (yearMatch) {
        details.seriesYear = parseInt(yearMatch[0]);
    }
    
    // Detect main event
    details.isMainEvent = /\bmain\s*event\b/i.test(tournamentName);
    
    // Extract day number
    for (const pattern of [/\bDay\s*(\d+)/i, /\bD(\d+)\b/, /\b(\d+)[A-Z]\b/]) {
        const match = tournamentName.match(pattern);
        if (match) {
            details.dayNumber = parseInt(match[1]);
            break;
        }
    }
    
    // Extract flight letter
    for (const pattern of [/\bFlight\s*([A-Z])/i, /\b\d+([A-Z])\b/, /\b([A-Z])\b(?=\s*(?:Flight|Starting))/i]) {
        const match = tournamentName.match(pattern);
        if (match) {
            details.flightLetter = match[1];
            break;
        }
    }
    
    // Extract event number
    for (const pattern of [/\bEvent\s*#?\s*(\d+)/i, /\bEv(?:ent)?\.?\s*#?\s*(\d+)/i, /\b#(\d+)\s*[-:]/i]) {
        const match = tournamentName.match(pattern);
        if (match) {
            details.eventNumber = parseInt(match[1]);
            break;
        }
    }
    
    // Detect final day
    // Method 1: Explicit "Final Day" or "Final Table"
    if (/\bFinal\s*(Day|Table)?\b/i.test(tournamentName)) {
        details.dayNumber = details.dayNumber || 99;
        details.finalDay = true;
    }
    
    // Method 2: "FT" abbreviation
    if (/\bFT\b/.test(tournamentName)) {
        details.finalDay = true;
    }
    
    // Method 3: Day 2+ without flight letter
    if (details.dayNumber && details.dayNumber >= 2 && !details.flightLetter) {
        if (!/Flight/i.test(tournamentName)) {
            details.finalDay = true;
            console.log(`[SeriesMatcher] Detected finalDay from Day ${details.dayNumber} without flight`);
        }
    }
    
    return details;
};

/**
 * Get all series titles from database
 * 
 * @param {object} context - Shared context with ddbDocClient
 * @returns {array} Array of series title objects
 */
const getAllSeriesTitles = async (context) => {
    const { ddbDocClient } = context;
    
    try {
        const seriesTitleTable = getTableName('TournamentSeriesTitle');
        const result = await ddbDocClient.send(new ScanCommand({
            TableName: seriesTitleTable,
            ProjectionExpression: 'id, title, aliases'
        }));
        
        return result.Items || [];
        
    } catch (error) {
        console.error('[SeriesMatcher] Error fetching series titles:', error);
        return [];
    }
};

/**
 * Match a tournament name to a series
 * 
 * @param {string} gameName - Tournament name to match
 * @param {array} seriesTitles - Array of series title objects
 * @param {array} venues - Array of venue objects (for cleanup)
 * @returns {object|null} Series match result or null
 */
const matchSeries = (gameName, seriesTitles = [], venues = []) => {
    if (!gameName) return null;
    
    // Step 1: Database exact matching
    if (seriesTitles && seriesTitles.length > 0) {
        const upperCaseGameName = gameName.toUpperCase();
        
        for (const series of seriesTitles) {
            const namesToCheck = [series.title, ...(series.aliases || [])];
            
            for (const seriesName of namesToCheck) {
                if (upperCaseGameName.includes(seriesName.toUpperCase())) {
                    console.log(`[SeriesMatcher] Exact match: "${series.title}"`);
                    
                    return {
                        isSeries: true,
                        seriesName: series.title,
                        seriesTitleId: series.id,
                        tournamentSeriesId: null,
                        isRegular: false,
                        ...extractSeriesDetails(gameName)
                    };
                }
            }
        }
        
        // Step 2: Database fuzzy matching
        const cleanedGameName = cleanupNameForSeriesMatching(gameName, venues);
        
        const allSeriesNamesToMatch = seriesTitles.flatMap(series =>
            [series.title, ...(series.aliases || [])].map(name => ({
                seriesId: series.id,
                seriesTitle: series.title,
                matchName: name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim()
            }))
        );
        
        const { bestMatch } = stringSimilarity.findBestMatch(
            cleanedGameName,
            allSeriesNamesToMatch.map(s => s.matchName)
        );
        
        if (bestMatch && bestMatch.rating >= SERIES_MATCH_THRESHOLD) {
            const matchedSeries = allSeriesNamesToMatch.find(s => s.matchName === bestMatch.target);
            
            if (matchedSeries) {
                console.log(`[SeriesMatcher] Fuzzy match: "${bestMatch.target}" (score: ${bestMatch.rating.toFixed(2)})`);
                
                return {
                    isSeries: true,
                    seriesName: matchedSeries.seriesTitle,
                    seriesTitleId: matchedSeries.seriesId,
                    tournamentSeriesId: null,
                    isRegular: false,
                    ...extractSeriesDetails(gameName)
                };
            }
        }
    }
    
    // Step 3: Pattern-based detection (no database match)
    const seriesPatterns = [
        /Spring\s+Championship\s+Series/i,
        /Summer\s+Series/i,
        /Fall\s+Series/i,
        /Winter\s+Series/i,
        /Championship\s+Series/i,
        /Festival\s+of\s+Poker/i,
        /Poker\s+Championships?/i,
        /\bWSOP\b/i,
        /\bWPT\b/i,
        /\bEPT\b/i,
        /\bAPT\b/i,
        /\bANZPT\b/i,
        /\bAPPT\b/i,
        /\b(Mini|Mega|Grand)\s+Series/i,
        /Masters\s+Series/i,
        /High\s+Roller\s+Series/i,
        /Super\s+Series/i
    ];
    
    for (const pattern of seriesPatterns) {
        if (pattern.test(gameName)) {
            const match = gameName.match(pattern);
            const seriesName = match 
                ? match[0] 
                : gameName.replace(/\s*[-–]\s*Day\s*\d+[A-Z]?/gi, '').replace(/\s+/g, ' ').trim();
            
            console.log(`[SeriesMatcher] Pattern match: "${seriesName}"`);
            
            return {
                isSeries: true,
                seriesName,
                seriesId: null,
                seriesTitleId: null,
                isRegular: false,
                ...extractSeriesDetails(gameName)
            };
        }
    }
    
    return null;
};

/**
 * Match series and return full result with auto-assigned series
 * 
 * @param {string} gameName - Tournament name
 * @param {array} seriesTitles - Series titles
 * @param {array} venues - Venues for cleanup
 * @returns {object} Series match result with autoAssignedSeries
 */
const getSeriesMatch = (gameName, seriesTitles = [], venues = []) => {
    const match = matchSeries(gameName, seriesTitles, venues);
    
    if (!match) {
        return {
            isSeries: false,
            seriesName: null,
            autoAssignedSeries: null,
            suggestions: []
        };
    }
    
    return {
        isSeries: match.isSeries,
        seriesName: match.seriesName,
        autoAssignedSeries: match.seriesTitleId ? {
            id: match.seriesTitleId,
            name: match.seriesName,
            score: 0.85
        } : null,
        seriesTitleId: match.seriesTitleId,
        dayNumber: match.dayNumber,
        flightLetter: match.flightLetter,
        eventNumber: match.eventNumber,
        isMainEvent: match.isMainEvent,
        finalDay: match.finalDay,
        seriesYear: match.seriesYear
    };
};

module.exports = {
    getAllSeriesTitles,
    matchSeries,
    getSeriesMatch,
    extractSeriesDetails,
    cleanupNameForSeriesMatching
};
