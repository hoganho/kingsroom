// scraperStrategies.js
// UPDATED: Simplified financial model (removed rakeSubsidy complexity)

const cheerio = require('cheerio');
const stringSimilarity = require('string-similarity');

const parseDurationToMilliseconds = (durationStr) => {
    if (!durationStr) return 0;
    let totalMilliseconds = 0;
    const hourMatch = durationStr.match(/(\d+)\s*h/);
    const minMatch = durationStr.match(/(\d+)\s*m/);
    if (hourMatch && hourMatch[1]) totalMilliseconds += parseInt(hourMatch[1], 10) * 60 * 60 * 1000;
    if (minMatch && minMatch[1]) totalMilliseconds += parseInt(minMatch[1], 10) * 60 * 1000;
    return totalMilliseconds;
};

const getTournamentId = (url) => {
    if (!url) return 1;
    try {
        if (url.includes('?id=')) {
            const match = url.match(/[?&]id=(\d+)/);
            if (match && match[1]) return parseInt(match[1], 10);
        } else if (/^\d+$/.test(url)) {
            return parseInt(url, 10);
        }
    } catch (e) {
        console.warn('Could not extract tournament ID from URL:', e.message);
    }
    return 1;
};

const AUTO_ASSIGN_THRESHOLD = 0.90;
const SUGGEST_THRESHOLD = 0.60;
const SERIES_MATCH_THRESHOLD = 0.80;

const cleanupNameForMatching = (name, context, options = {}) => {
    if (!name) return '';
    let cleanedName = ` ${name.replace(/[^a-zA-Z0-9\s]/g, '')} `;
    const jargonRegexes = [
        /\b(Event|Flight|Day)\s+[a-zA-Z0-9]*\d[a-zA-Z0-9]*\b/gi,
        /\bMain Event\b/gi,
        /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b/gi,
    ];
    jargonRegexes.forEach(regex => { cleanedName = cleanedName.replace(regex, ' '); });
    if (context === 'venue') {
        (options.seriesTitles || []).forEach(series => {
            [series.title, ...(series.aliases || [])].forEach(seriesName => {
                const cleanedSeriesName = seriesName.replace(/[^a-zA-Z0-9\s]/g, '');
                cleanedName = cleanedName.replace(new RegExp(`\b${cleanedSeriesName}\b`, 'gi'), ' ');
            });
        });
    } else if (context === 'series') {
        (options.venues || []).forEach(venue => {
            [venue.name, ...(venue.aliases || [])].forEach(venueName => {
                const cleanedVenueName = venueName.replace(/[^a-zA-Z0-9\s]/g, '');
                cleanedName = cleanedName.replace(new RegExp(`\b${cleanedVenueName}\b`, 'gi'), ' ');
            });
        });
    }
    return cleanedName.replace(/\s+/g, ' ').trim();
};

// ===================================================================
// SERIES MATCHING
// ===================================================================

const extractSeriesDetails = (tournamentName) => {
    const details = {};
    const yearMatch = tournamentName.match(/20\d{2}/);
    if (yearMatch) details.seriesYear = parseInt(yearMatch[0]);
    details.isMainEvent = /\bmain\s*event\b/i.test(tournamentName);
    
    for (const pattern of [/\bDay\s*(\d+)/i, /\bD(\d+)\b/, /\b(\d+)[A-Z]\b/]) {
        const match = tournamentName.match(pattern);
        if (match) { details.dayNumber = parseInt(match[1]); break; }
    }
    for (const pattern of [/\bFlight\s*([A-Z])/i, /\b\d+([A-Z])\b/, /\b([A-Z])\b(?=\s*(?:Flight|Starting))/i]) {
        const match = tournamentName.match(pattern);
        if (match) { details.flightLetter = match[1]; break; }
    }
    for (const pattern of [/\bEvent\s*#?\s*(\d+)/i, /\bEv(?:ent)?\.?\s*#?\s*(\d+)/i, /\b#(\d+)\s*[-:]/i]) {
        const match = tournamentName.match(pattern);
        if (match) { details.eventNumber = parseInt(match[1]); break; }
    }
    if (/\bFinal\s*(Day|Table)?\b/i.test(tournamentName)) {
        details.dayNumber = details.dayNumber || 99;
        details.isFinalDay = true;
    }
    return details;
};

const matchSeriesWithDatabase = (gameName, seriesTitles = [], venues = []) => {
    if (!gameName) return null;
    
    if (seriesTitles && seriesTitles.length > 0) {
        const upperCaseGameName = gameName.toUpperCase();
        for (const series of seriesTitles) {
            for (const seriesName of [series.title, ...(series.aliases || [])]) {
                if (upperCaseGameName.includes(seriesName.toUpperCase())) {
                    console.log(`[Series Match] Database exact match: "${series.title}"`);
                    return { isSeries: true, seriesName: series.title, seriesTitleId: series.id, tournamentSeriesId: null, isRegular: false, ...extractSeriesDetails(gameName) };
                }
            }
        }
        
        const cleanedGameName = cleanupNameForMatching(gameName, 'series', { venues });
        const allSeriesNamesToMatch = seriesTitles.flatMap(series => [series.title, ...(series.aliases || [])].map(name => ({ seriesId: series.id, seriesTitle: series.title, matchName: name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim() })));
        const { bestMatch } = stringSimilarity.findBestMatch(cleanedGameName, allSeriesNamesToMatch.map(s => s.matchName));
        
        if (bestMatch && bestMatch.rating >= SERIES_MATCH_THRESHOLD) {
            const matchedSeries = allSeriesNamesToMatch.find(s => s.matchName === bestMatch.target);
            if (matchedSeries) {
                console.log(`[Series Match] Database fuzzy match: "${bestMatch.target}" (score: ${bestMatch.rating})`);
                return { isSeries: true, seriesName: matchedSeries.seriesTitle, seriesTitleId: matchedSeries.seriesId, tournamentSeriesId: null, isRegular: false, ...extractSeriesDetails(gameName) };
            }
        }
    }
    
    const seriesPatterns = [/Spring\s+Championship\s+Series/i, /Summer\s+Series/i, /Fall\s+Series/i, /Winter\s+Series/i, /Championship\s+Series/i, /Festival\s+of\s+Poker/i, /Poker\s+Championships?/i, /\bWSOP\b/i, /\bWPT\b/i, /\bEPT\b/i, /\bAPT\b/i, /\bANZPT\b/i, /\bAPPT\b/i, /\b(Mini|Mega|Grand)\s+Series/i, /Masters\s+Series/i, /High\s+Roller\s+Series/i, /Super\s+Series/i];
    for (const pattern of seriesPatterns) {
        if (pattern.test(gameName)) {
            const match = gameName.match(pattern);
            const seriesName = match ? match[0] : gameName.replace(/\s*[-–]\s*Day\s*\d+[A-Z]?/gi, '').replace(/\s+/g, ' ').trim();
            console.log(`[Series Match] Pattern match: "${seriesName}"`);
            return { isSeries: true, seriesName, seriesId: null, isRegular: false, ...extractSeriesDetails(gameName) };
        }
    }
    return null;
};

// ===================================================================
// VENUE MATCHING
// ===================================================================

const getMatchingVenueEnhanced = (gameName, venues = [], seriesTitles = []) => {
    if (!gameName) return { autoAssignedVenue: null, suggestions: [], extractedVenueName: null, matchingFailed: true };
    
    if (venues && venues.length > 0) {
        const upperCaseGameName = gameName.toUpperCase();
        for (const venue of venues) {
            for (const venueName of [venue.name, ...(venue.aliases || [])]) {
                if (upperCaseGameName.includes(venueName.toUpperCase())) {
                    console.log(`[Venue Match] Database exact match: "${venue.name}"`);
                    return { autoAssignedVenue: { id: venue.id, name: venue.name, score: 1.0 }, suggestions: [{ id: venue.id, name: venue.name, score: 1.0 }], extractedVenueName: gameName, matchingFailed: false };
                }
            }
        }
        
        const cleanedScrapedName = cleanupNameForMatching(gameName, 'venue', { seriesTitles });
        const allNamesToMatch = venues.flatMap(venue => [venue.name, ...(venue.aliases || [])].map(name => ({ venueId: venue.id, venueName: venue.name, matchName: name.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, ' ').trim() })));
        const { ratings } = stringSimilarity.findBestMatch(cleanedScrapedName, allNamesToMatch.map(item => item.matchName));
        
        const bestScoresByVenue = new Map();
        ratings.forEach((rating, index) => {
            const { venueId, venueName } = allNamesToMatch[index];
            if (!bestScoresByVenue.has(venueId) || rating.rating > bestScoresByVenue.get(venueId).score)
                bestScoresByVenue.set(venueId, { id: venueId, name: venueName, score: rating.rating });
        });
        
        const sortedSuggestions = Array.from(bestScoresByVenue.values()).sort((a, b) => b.score - a.score).filter(v => v.score > 0).slice(0, 3);
        if (sortedSuggestions.length > 0) {
            const autoAssignedVenue = sortedSuggestions[0].score >= AUTO_ASSIGN_THRESHOLD ? sortedSuggestions[0] : null;
            if (autoAssignedVenue) console.log(`[Venue Match] Database fuzzy match: "${autoAssignedVenue.name}" (score: ${autoAssignedVenue.score})`);
            return { autoAssignedVenue, suggestions: sortedSuggestions, extractedVenueName: gameName, matchingFailed: autoAssignedVenue === null };
        }
    }
    
    const venuePatterns = [{ pattern: /The Star/i, venue: 'The Star' }, { pattern: /Crown/i, venue: 'Crown' }, { pattern: /Sky City/i, venue: 'Sky City' }, { pattern: /Treasury/i, venue: 'Treasury' }, { pattern: /Reef/i, venue: 'The Reef' }];
    for (const { pattern, venue } of venuePatterns) {
        if (pattern.test(gameName)) {
            console.log(`[Venue Match] Pattern match: "${venue}"`);
            return { autoAssignedVenue: null, suggestions: [{ id: null, name: venue, score: 0.6 }], extractedVenueName: gameName, matchingFailed: true };
        }
    }
    return { autoAssignedVenue: null, suggestions: [], extractedVenueName: gameName, matchingFailed: true };
};

// ===================================================================
// SCRAPE CONTEXT
// ===================================================================

class ScrapeContext {
    constructor(html, url = null) {
        this.$ = cheerio.load(html);
        this.url = url;
        this.data = {};
        this.foundKeys = new Set();
        this.gameData = null;
        this.levelData = null;
        this.abortScrape = false;
        if (url) this.data.tournamentId = getTournamentId(url);
        this._parseEmbeddedData();
    }
    
    _parseEmbeddedData() {
        const html = this.$.html();
        try { const m = html.match(/const cw_tt = ({.*?});/); if (m && m[1]) this.gameData = JSON.parse(m[1]); } catch (e) {}
        try { const m = html.match(/const cw_tt_levels = (\[.*?\]);/); if (m && m[1]) this.levelData = JSON.parse(m[1]); } catch (e) {}
    }
    
    getText(key, selector) { const text = this.$(selector).first().text().trim(); if (text) { this.foundKeys.add(key); this.data[key] = text; return text; } return undefined; }
    parseNumeric(key, selector) { const str = this.$(selector).first().text().trim(); if (!str) return undefined; const num = parseInt(str.replace(/[^0-9.-]+/g, ''), 10); if (!isNaN(num)) { this.foundKeys.add(key); this.data[key] = num; return num; } return undefined; }
    add(key, value) { if (value !== undefined && value !== null) { this.foundKeys.add(key); this.data[key] = value; } }
}

// ===================================================================
// DEFAULT STRATEGY
// ===================================================================

const defaultStrategy = {
    detectPageState(ctx, forceRefresh = false) {
        const tournamentId = ctx.data.tournamentId || getTournamentId(ctx.url) || 1;
        const warningBadge = ctx.$('.cw-badge.cw-bg-warning').first();
        
        if (warningBadge.length) {
            const warningText = warningBadge.text().trim().toLowerCase();
            console.log(`[Scraper] Warning badge detected: "${warningText}"`);
            
            let status = 'UNKNOWN', name = 'Tournament Status Unknown';
            if (warningText.includes('not found')) { status = 'UNKNOWN'; name = 'Tournament Not Found'; }
            else if (warningText.includes('not published')) { status = 'NOT_PUBLISHED'; name = 'Tournament Not Published'; }
            else if (warningText.includes('not in use') || warningText.includes('not available')) { status = 'NOT_IN_USE'; name = 'Tournament Not In Use'; }
            
            ctx.add('tournamentId', tournamentId);
            ctx.add('gameStatus', status);
            ctx.add('name', name);
            ctx.add('doNotScrape', true);
            ctx.add('hasGuarantee', false);
            ctx.add('s3Key', '');
            ctx.add('registrationStatus', 'N_A');
            if (!forceRefresh) { ctx.abortScrape = true; console.log(`[Scraper] Aborting scrape due to ${status} status`); }
            return;
        }
        
        const pageTitle = ctx.$('title').text().toLowerCase();
        const h1Text = ctx.$('h1').first().text().toLowerCase();
        if (pageTitle.includes('not found') || h1Text.includes('not found') || pageTitle.includes('error') || h1Text.includes('error')) {
            ctx.add('tournamentId', tournamentId);
            ctx.add('gameStatus', pageTitle.includes('error') ? 'ERROR' : 'UNKNOWN');
            ctx.add('name', pageTitle.includes('error') ? 'Tournament Error' : 'Tournament Not Found');
            ctx.add('doNotScrape', true);
            ctx.add('hasGuarantee', false);
            ctx.add('registrationStatus', 'N_A');
            if (!forceRefresh) ctx.abortScrape = true;
            return;
        }
        if (!ctx.data.tournamentId) ctx.add('tournamentId', tournamentId);
    },

    initializeDefaultFlags(ctx) {
        ctx.add('isSeries', false); ctx.add('seriesName', null); ctx.add('isSatellite', false);
        ctx.add('isRegular', true); ctx.add('hasGuarantee', false); ctx.add('doNotScrape', false);
    },

    getName(ctx, seriesTitles = [], venues = []) {
        const mainTitle = ctx.$('.cw-game-title').first().text().trim();
        const subTitle = ctx.$('.cw-game-shortdesc').first().text().trim();
        const gameName = [mainTitle, subTitle].filter(Boolean).join(' ');
        
        if (!gameName || gameName === '') {
            ctx.add('name', ctx.data.gameStatus === 'UNKNOWN_STATUS' || ctx.data.isInactive ? 'Tournament ID Not In Use' : 'Unnamed Tournament');
            if (ctx.data.gameStatus === 'UNKNOWN_STATUS' || ctx.data.isInactive) ctx.add('isInactive', true);
            return;
        }
        ctx.add('name', gameName);

        const seriesInfo = matchSeriesWithDatabase(gameName, seriesTitles, venues);
        if (seriesInfo) {
            ctx.add('isSeries', seriesInfo.isSeries);
            ctx.add('seriesName', seriesInfo.seriesName);
            ctx.add('isRegular', !seriesInfo.isSeries);
            if (seriesInfo.seriesId) { ctx.add('seriesId', seriesInfo.seriesId); ctx.add('tournamentSeriesId', seriesInfo.seriesId); }
            if (seriesInfo.seriesTitleId) {
                ctx.add('seriesMatch', { seriesTitleId: seriesInfo.seriesTitleId, seriesName: seriesInfo.seriesName, score: 0.85 });
                ctx.add('seriesTitleId', seriesInfo.seriesTitleId);
            }
            if (seriesInfo.dayNumber) ctx.add('dayNumber', seriesInfo.dayNumber);
            if (seriesInfo.flightLetter) ctx.add('flightLetter', seriesInfo.flightLetter);
            if (seriesInfo.isMainEvent) ctx.add('isMainEvent', seriesInfo.isMainEvent);
            if (seriesInfo.eventNumber) ctx.add('eventNumber', seriesInfo.eventNumber);
            if (seriesInfo.finalDay) ctx.add('finalDay', seriesInfo.finalDay);
        }
    },
    
    getGameTags(ctx) {
        const tags = [];
        ctx.$('.cw-game-buyins .cw-badge').each((i, el) => { const t = ctx.$(el).text().trim(); if (t) tags.push(t); });
        if (tags.length > 0) ctx.add('gameTags', tags);
    },

    getTournamentType(ctx) {
        const tags = ctx.data.gameTags || [];
        let tournamentType = 'FREEZEOUT';
        for (const tag of tags) {
            if (/(rebuy|re-buy|reentry|re-entry)/i.test(tag)) { tournamentType = 'REBUY'; break; }
            if (/(sat|satellite|satty)/i.test(tag)) { tournamentType = 'SATELLITE'; break; }
        }
        ctx.add('tournamentType', tournamentType);
    },

    getGameStartDateTime(ctx) {
        if (ctx.gameData && ctx.gameData.start_local) ctx.add('gameStartDateTime', new Date(ctx.gameData.start_local).toISOString());
        else {
            const dateText = ctx.getText('gameStartDateTime', '#cw_clock_start_date_time_local');
            if (dateText) { try { const d = new Date(dateText); if (!isNaN(d.getTime())) ctx.data.gameStartDateTime = d.toISOString(); } catch (e) {} }
        }
    },
    
    getStatus(ctx) {
        if (ctx.data.gameStatus) return ctx.data.gameStatus;
        let gameStatus = ctx.$('label:contains("Status")').first().next('strong').text().trim().toUpperCase() || 'UNKNOWN_STATUS';
        if (gameStatus.includes('CLOCK STOPPED')) gameStatus = 'CLOCK_STOPPED';
        else if (gameStatus === 'UNKNOWN_STATUS') ctx.add('isInactive', true);
        ctx.add('gameStatus', gameStatus);
        return gameStatus;
    },
    
    getRegistrationStatus(ctx) {
        if (ctx.data.registrationStatus) return ctx.data.registrationStatus;
        let regStatus = ctx.$('label:contains("Registration")').parent().text().replace(/Registration/gi, '').trim() || 'UNKNOWN_REG_STATUS';
        if (regStatus.toUpperCase().startsWith('OPEN')) regStatus = 'OPEN';
        if (regStatus !== 'UNKNOWN_REG_STATUS') ctx.add('registrationStatus', regStatus.toUpperCase());
        return regStatus.toUpperCase();
    },
    
    getGameVariant(ctx) {
        let variant = ctx.gameData?.shortlimitgame || ctx.$('#cw_clock_shortlimitgame').first().text().trim();
        if (variant) ctx.add('gameVariant', variant.replace(/\s/g, ''));
    },

    getPrizepoolPaid(ctx) { ctx.parseNumeric('prizepoolPaid', '#cw_clock_prizepool'); },
    
    getTotalUniquePlayers(ctx) {
        const text = ctx.$('#cw_clock_playersentries').first().text().trim();
        if (!text) return;
        let totalUniquePlayers = null;
        if (text.includes('/')) { const parts = text.split('/').map(p => parseInt(p.trim(), 10)); if (parts.length === 2 && !isNaN(parts[1])) totalUniquePlayers = parts[1]; }
        else { const num = parseInt(text.replace(/[^0-9.-]+/g, ''), 10); if (!isNaN(num)) totalUniquePlayers = num; }
        if (totalUniquePlayers !== null) ctx.add('totalUniquePlayers', totalUniquePlayers);
    },

    getTotalRebuys(ctx) { ctx.parseNumeric('totalRebuys', '#cw_clock_rebuys'); },
    getTotalAddons(ctx) { ctx.parseNumeric('totalAddons', 'div.cw-clock-label:contains("Add-Ons")'); },
    getTotalInitialEntries(ctx) { ctx.add('totalInitialEntries', ctx.data.totalUniquePlayers || 0); },
    
    getTotalEntries(ctx) {
        // totalEntries = totalInitialEntries + totalRebuys + totalAddons
        const totalInitialEntries = ctx.data.totalInitialEntries || 0;
        const totalRebuys = ctx.data.totalRebuys || 0;
        const totalAddons = ctx.data.totalAddons || 0;
        ctx.add('totalEntries', totalInitialEntries + totalRebuys + totalAddons);
    },

    getTotalDuration(ctx) { ctx.getText('totalDuration', 'div.cw-clock-label:contains("Total Time")'); },
    
    getBuyIn(ctx) {
        if (ctx.gameData?.costspb0?.cost) ctx.add('buyIn', ctx.gameData.costspb0.cost + (ctx.gameData.costspb0.fee || 0));
        else ctx.parseNumeric('buyIn', '#cw_clock_buyin');
    },
    
    getRake(ctx) { if (ctx.gameData?.costspb0?.fee) ctx.add('rake', ctx.gameData.costspb0.fee); },
    
    getStartingStack(ctx) {
        if (ctx.gameData?.costspb0?.chips) ctx.add('startingStack', ctx.gameData.costspb0.chips);
        else ctx.parseNumeric('startingStack', '#cw_clock_startchips');
    },
    
    getGuarantee(ctx) {
        const text = ctx.$('.cw-game-shortdesc').text().trim();
        if (!text) { ctx.add('hasGuarantee', false); return; }
        if (/(gtd|guaranteed|g'teed)/i.test(text)) {
            ctx.add('hasGuarantee', true);
            let guaranteeAmount = null;
            const millionMatch = text.match(/\b(\d{1,2})M\b/i);
            const thousandMatch = text.match(/\b(\d{1,3})K\b/i);
            if (millionMatch) guaranteeAmount = parseInt(millionMatch[1], 10) * 1000000;
            else if (thousandMatch) guaranteeAmount = parseInt(thousandMatch[1], 10) * 1000;
            else { const num = parseInt(text.replace(/[^0-9.-]+/g, ''), 10); if (!isNaN(num)) guaranteeAmount = num; }
            if (guaranteeAmount !== null) ctx.add('guaranteeAmount', guaranteeAmount);
        } else ctx.add('hasGuarantee', false);
    },

    getSeriesName(ctx) { /* Handled by getName */ },

    /**
     * SIMPLIFIED POKER ECONOMICS
     * 
     * Revenue: rakeRevenue = rake × entriesForRake
     * Cost: guaranteeOverlayCost = max(0, guarantee - playerContributions)
     * Profit: gameProfit = rakeRevenue - guaranteeOverlayCost
     */
    calculatePokerEconomics(ctx) {
        const buyIn = ctx.data.buyIn || 0;
        const rake = ctx.data.rake || 0;
        const totalInitialEntries = ctx.data.totalInitialEntries || 0;
        const totalRebuys = ctx.data.totalRebuys || 0;
        const totalAddons = ctx.data.totalAddons || 0;
        const guaranteeAmount = ctx.data.guaranteeAmount || 0;
        const hasGuarantee = ctx.data.hasGuarantee && guaranteeAmount > 0;
        
        if (buyIn <= 0) return;
        
        // Entries that pay rake (initial + rebuys, NOT addons)
        const entriesForRake = totalInitialEntries + totalRebuys;
        const totalEntries = totalInitialEntries + totalRebuys + totalAddons;
        
        // REVENUE
        const rakeRevenue = rake * entriesForRake;
        const totalBuyInsCollected = buyIn * totalEntries;
        
        // PRIZEPOOL
        const prizepoolFromEntriesAndRebuys = (buyIn - rake) * entriesForRake;
        const prizepoolFromAddons = buyIn * totalAddons;
        const prizepoolPlayerContributions = prizepoolFromEntriesAndRebuys + prizepoolFromAddons;
        
        // GUARANTEE IMPACT
        let guaranteeOverlayCost = 0;
        let prizepoolSurplus = null;
        let prizepoolAddedValue = 0;
        
        if (hasGuarantee) {
            const shortfall = guaranteeAmount - prizepoolPlayerContributions;
            if (shortfall > 0) {
                guaranteeOverlayCost = shortfall;
                prizepoolAddedValue = shortfall;
            } else {
                prizepoolSurplus = -shortfall;
            }
        }
        
        // PROFIT
        const gameProfit = rakeRevenue - guaranteeOverlayCost;
        
        // SET VALUES
        ctx.add('totalBuyInsCollected', totalBuyInsCollected);
        ctx.add('rakeRevenue', rakeRevenue);
        ctx.add('prizepoolPlayerContributions', prizepoolPlayerContributions);
        ctx.add('prizepoolCalculated', prizepoolPlayerContributions);
        ctx.add('prizepoolAddedValue', prizepoolAddedValue);
        ctx.add('prizepoolSurplus', prizepoolSurplus);
        ctx.add('guaranteeOverlayCost', guaranteeOverlayCost);
        ctx.add('gameProfit', gameProfit);
    },

    getSeating(ctx) {
        const seating = [];
        ctx.$('h4.cw-text-center:contains("Entries")').next('table').find('tbody tr').each((i, el) => {
            const $row = ctx.$(el);
            const $tds = $row.find('td');
            if ($tds.length < 4 || $row.find('th').length > 0) return;
            const name = $tds.eq(1).text().trim();
            const tableSeatInfo = $tds.eq(2).text().trim();
            const chipsStr = $tds.eq(3).text().trim();
            if (chipsStr && tableSeatInfo.includes('Table')) {
                const match = tableSeatInfo.match(/Table(\d+)\s*\/\s*(\d+)/);
                if (name && match) {
                    const stack = parseInt(chipsStr.replace(/,/g, ''), 10);
                    seating.push({ name, table: parseInt(match[1], 10), seat: parseInt(match[2], 10), playerStack: !isNaN(stack) ? stack : null });
                }
            }
        });
        if (seating.length > 0) ctx.add('seating', seating);
    },

    getEntries(ctx) {
        const entries = [];
        let entriesTable = ctx.$('h4.cw-text-center:contains("Entries")').next('table').find('tbody tr');
        if (entriesTable.length > 0) {
            entriesTable.each((i, el) => {
                const $row = ctx.$(el);
                if ($row.find('th').length > 0) return;
                const name = $row.find('td').eq(1).text().trim();
                if (name) entries.push({ name });
            });
        }
        if (entries.length === 0) {
            ctx.$('h4.cw-text-center:contains("Result")').next('table').find('tbody tr').each((i, el) => {
                const $row = ctx.$(el);
                if ($row.find('th').length > 0) return;
                const name = $row.find('td').eq(2).text().trim();
                if (name) entries.push({ name });
            });
        }
        if (entries.length > 0) ctx.add('entries', entries);
    },

    getLiveData(ctx) {
        if (ctx.data.gameStatus === 'FINISHED' || ctx.data.gameStatus === 'CANCELLED') return;
        
        let playersRemaining = ctx.data.seating?.length || 0;
        if (playersRemaining === 0) {
            const entriesText = ctx.$('#cw_clock_playersentries').first().text().trim();
            if (entriesText && entriesText.includes('/')) {
                const remaining = parseInt(entriesText.split('/')[0].trim(), 10);
                if (!isNaN(remaining)) playersRemaining = remaining;
            }
        }
        if (playersRemaining === 0 && ctx.gameData?.players_remaining !== undefined) playersRemaining = ctx.gameData.players_remaining;
        
        ctx.add('playersRemaining', playersRemaining);
        ctx.parseNumeric('totalChipsInPlay', '#cw_clock_entire_stack');
        ctx.parseNumeric('averagePlayerStack', '#cw_clock_avg_stack');
    },

    getResults(ctx) {
        const results = [];
        ctx.$('h4.cw-text-center:contains("Result")').next('table').find('tbody tr').each((i, el) => {
            const $row = ctx.$(el);
            const parsedRank = parseInt($row.find('td').eq(0).text().trim(), 10);
            const name = $row.find('td').eq(2).text().trim();
            const winningsCellHtml = $row.find('td').eq(3).html();
            let winnings = 0, points = 0, isQualification = false;
            
            if (winningsCellHtml?.toUpperCase().includes('QUALIFIED')) {
                isQualification = true;
            } else {
                let winningsStr = '', pointsStr = '';
                if (winningsCellHtml?.includes('<br>')) {
                    const parts = winningsCellHtml.split('<br>');
                    winningsStr = parts[0]?.trim() || '';
                    pointsStr = parts[1]?.trim() || '';
                } else {
                    winningsStr = winningsCellHtml?.trim() || '';
                }
                const parsedWinnings = winningsStr ? parseInt(winningsStr.replace(/[^0-9.-]+/g, ''), 10) : NaN;
                const parsedPoints = pointsStr ? parseInt(pointsStr.replace(/[^0-9.-]+/g, ''), 10) : NaN;
                winnings = isNaN(parsedWinnings) ? 0 : parsedWinnings;
                points = isNaN(parsedPoints) ? 0 : parsedPoints;
            }
            
            const finalRank = !isNaN(parsedRank) ? parsedRank : (isQualification ? 1 : 0);
            if (name) results.push({ rank: finalRank, name, winnings, points, isQualification });
        });
        if (results.length > 0) ctx.add('results', results);
    },

    getTables(ctx) {
        const tables = [];
        const tablesContainer = ctx.$('h4.cw-text-center:contains("Tables")').next('table').find('tbody');
        let currentTableName = null, currentSeats = [];
        
        tablesContainer.find('tr.cw-tr').each((i, el) => {
            const $row = ctx.$(el);
            if ($row.find('td[colspan="4"]').length > 0) {
                if (currentTableName && currentSeats.length > 0) tables.push({ tableName: currentTableName, seats: currentSeats });
                currentTableName = $row.find('td').text().trim();
                currentSeats = [];
            } else {
                const seatNumber = parseInt($row.find('td').eq(0).text().trim(), 10);
                const playerName = $row.find('td').eq(2).text().trim();
                const playerStackStr = $row.find('td').eq(3).text().trim().replace(/,/g, '');
                const playerStack = playerStackStr ? parseInt(playerStackStr, 10) : null;
                if (!isNaN(seatNumber)) currentSeats.push({ seat: seatNumber, isOccupied: !!playerName, playerName: playerName || null, playerStack: isNaN(playerStack) ? null : playerStack });
            }
        });
        if (currentTableName && currentSeats.length > 0) tables.push({ tableName: currentTableName, seats: currentSeats });
        if (tables.length > 0) ctx.add('tables', tables);
    },
    
    getLevels(ctx) {
        if (!ctx.levelData) return;
        const levels = ctx.levelData.map(level => ({ levelNumber: level.ID || 0, durationMinutes: level.duration || 0, smallBlind: level.smallblind || 0, bigBlind: level.bigblind || 0, ante: level.ante || 0 }));
        if (levels.length > 0) ctx.add('levels', levels);
    },

    getBreaks(ctx) {
        if (!ctx.levelData) return;
        const breaks = [];
        for (let i = 0; i < ctx.levelData.length; i++) {
            const currentLevel = ctx.levelData[i];
            if (currentLevel.breakduration > 0) {
                const levelBefore = currentLevel.ID || 0;
                const levelAfter = (i + 1 < ctx.levelData.length) ? (ctx.levelData[i + 1].ID || 0) : levelBefore + 1;
                breaks.push({ levelNumberBeforeBreak: levelBefore, levelNumberAfterBreak: levelAfter, durationMinutes: currentLevel.breakduration || 0 });
            }
        }
        if (breaks.length > 0) ctx.add('breaks', breaks);
    },

    getMatchingVenue(ctx, venues, seriesTitles = []) {
        const gameName = ctx.data.name;
        if (!gameName) { ctx.add('venueMatch', { autoAssignedVenue: null, suggestions: [], extractedVenueName: null, matchingFailed: true }); return; }
        const venueMatch = getMatchingVenueEnhanced(gameName, venues, seriesTitles);
        ctx.add('venueMatch', venueMatch);
        if (venueMatch?.autoAssignedVenue) ctx.add('venueName', venueMatch.autoAssignedVenue.name);
    },

    getTournamentFlags(ctx) {
        const name = ctx.data.name || '';
        if (/(satellite|satty)/i.test(name)) ctx.add('isSatellite', true);
    },

    getGameFrequency(ctx) {
        const name = (ctx.data.name || '').toUpperCase();
        const weekdays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
        const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER', 'JAN', 'FEB', 'MAR', 'APR', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        
        if (weekdays.some(day => name.includes(day))) ctx.add('gameFrequency', 'WEEKLY');
        else if (months.some(month => name.includes(month))) ctx.add('gameFrequency', 'MONTHLY');
        else if (['QUARTERLY', 'QTR', 'Q1', 'Q2', 'Q3', 'Q4'].some(term => name.includes(term))) ctx.add('gameFrequency', 'QUARTERLY');
        else if (['YEARLY'].some(term => name.includes(term))) ctx.add('gameFrequency', 'YEARLY');
        else ctx.add('gameFrequency', 'UNKNOWN');
    },

    getTournamentId(ctx, url) { if (!ctx.data.tournamentId) ctx.add('tournamentId', getTournamentId(url || ctx.url)); },
};

// ===================================================================
// MAIN SCRAPER FUNCTION
// ===================================================================

const runScraper = (html, ctx = null, venues = [], seriesTitles = [], url = '', forceRefresh = false) => {
    if (!ctx) ctx = new ScrapeContext(html, url);
    
    console.log(`[runScraper] Starting run for tournament ${ctx.data.tournamentId}, forceRefresh: ${forceRefresh}`);
    console.log(`[runScraper] Database data: ${venues.length} venues, ${seriesTitles.length} series titles`);

    defaultStrategy.detectPageState(ctx, forceRefresh);
    if (ctx.abortScrape) { console.log(`[runScraper] Aborting scrape due to page state: ${ctx.data.gameStatus}`); return { data: ctx.data, foundKeys: Array.from(ctx.foundKeys) }; }

    defaultStrategy.initializeDefaultFlags(ctx);
    defaultStrategy.getName(ctx, seriesTitles, venues);
    defaultStrategy.getGameTags(ctx);
    defaultStrategy.getTournamentType(ctx);
    defaultStrategy.getGameStartDateTime(ctx);
    defaultStrategy.getStatus(ctx);
    defaultStrategy.getRegistrationStatus(ctx);
    defaultStrategy.getGameVariant(ctx);
    defaultStrategy.getPrizepoolPaid(ctx);
    defaultStrategy.getTotalUniquePlayers(ctx);
    defaultStrategy.getTotalInitialEntries(ctx);
    defaultStrategy.getTotalRebuys(ctx);
    defaultStrategy.getTotalAddons(ctx);
    defaultStrategy.getTotalEntries(ctx);
    defaultStrategy.getTotalDuration(ctx);
    defaultStrategy.getBuyIn(ctx);
    defaultStrategy.getRake(ctx);
    defaultStrategy.getStartingStack(ctx);
    defaultStrategy.getGuarantee(ctx);
    defaultStrategy.getSeriesName(ctx);
    defaultStrategy.getTournamentFlags(ctx);
    defaultStrategy.getGameFrequency(ctx);
    defaultStrategy.getSeating(ctx);
    defaultStrategy.getEntries(ctx);
    defaultStrategy.getLiveData(ctx);
    defaultStrategy.getResults(ctx);
    defaultStrategy.getTables(ctx);
    defaultStrategy.getLevels(ctx);
    defaultStrategy.getBreaks(ctx);
    defaultStrategy.getMatchingVenue(ctx, venues, seriesTitles);
    defaultStrategy.calculatePokerEconomics(ctx);

    console.log(`[runScraper] Completed. Found keys: ${ctx.foundKeys.size}, Status: ${ctx.data.gameStatus}, DoNotScrape: ${ctx.data.doNotScrape}`);
    return { data: ctx.data, foundKeys: Array.from(ctx.foundKeys) };
};

module.exports = {
    runScraper,
    getTournamentId,
    getStatusAndReg: (html) => {
        const ctx = new ScrapeContext(html);
        defaultStrategy.detectPageState(ctx, false);
        if (!ctx.abortScrape) { defaultStrategy.getStatus(ctx); defaultStrategy.getRegistrationStatus(ctx); }
        return { gameStatus: ctx.data.gameStatus, registrationStatus: ctx.data.registrationStatus, tournamentId: ctx.data.tournamentId };
    }
};