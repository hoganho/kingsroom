import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';

// Robust CSV Parser that handles quoted fields with commas
const parseCSV = (content) => {
    const lines = content.split('\n').filter(l => l.trim());
    // Remove BOM if present
    const headerLine = lines[0].replace(/^\uFEFF/, '');
    const headers = parseCSVLine(headerLine);
    
    return lines.slice(1).map(line => {
        const values = parseCSVLine(line);
        const row = {};
        headers.forEach((h, i) => {
            row[h] = values[i] || '';
        });
        return row;
    });
};

// Parse a single CSV line, handling quoted fields
const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    result.push(current.trim());
    
    return result.map(val => val.replace(/^"|"$/g, '')); // Strip surrounding quotes
};

// Aggressive name cleaner - normalize to a base name
const cleanName = (name) => {
    if (!name) return 'Unknown Game';
    
    return name
        // Remove dollar amounts and guarantees
        .replace(/\$[\d,]+\s*(k)?\s*(gtd|guaranteed|est|estimate)?/gi, '')
        // Remove standalone GTD/Guaranteed
        .replace(/\b(gtd|guaranteed|est|estimate)\b/gi, '')
        // Remove day names (we track day separately)
        .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)'?s?\b/gi, '')
        // Remove weekly/monthly
        .replace(/\b(weekly|monthly|daily)\b/gi, '')
        // Remove rebuy/re-entry info
        .replace(/\b(rebuy|re-entry|reentry).*$/gi, '')
        // Remove time references
        .replace(/until\s+[\d:]+\s*(am|pm)?/gi, '')
        .replace(/\d{1,2}:\d{2}\s*(am|pm)?/gi, '')
        .replace(/late\s*rego?/gi, '')
        // Remove "at Kings Room" or similar venue references
        .replace(/at\s+(kings\s*room|kr|stg)/gi, '')
        // Remove common suffixes
        .replace(/'s\s*$/i, 's') // Normalize apostrophe-s
        // Remove special characters and extra spaces
        .replace(/['"]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/[.\s]+$/g, '') // Remove trailing dots/spaces
        .trim();
};

// Create a display-friendly name from the raw name
const createDisplayName = (name, dayOfWeek) => {
    if (!name) return `${dayOfWeek} Game`;
    
    let cleaned = name
        // Remove dollar amounts but keep the GTD context
        .replace(/\$[\d,]+\s*(k)?\s*/gi, '')
        // Clean up GTD variations
        .replace(/\bgtd\b/gi, 'GTD')
        .replace(/\bguaranteed\b/gi, 'GTD')
        // Remove rebuy/re-entry details
        .replace(/\b(rebuy|re-entry|reentry)\s*(until\s+[\d:]+\s*(am|pm)?)?.*$/gi, '')
        .replace(/late\s*rego?\s*[\d:]+\s*(am|pm)?/gi, '')
        // Clean up day references but keep venue names
        .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s+(weekly)?\s*/gi, '')
        // Clean up extra spaces and trailing punctuation
        .replace(/\s+/g, ' ')
        .replace(/[.\s]+$/g, '')
        .trim();
    
    // If too short or generic, fall back to day-based name
    if (!cleaned || cleaned.length < 3) {
        return `${dayOfWeek.charAt(0) + dayOfWeek.slice(1).toLowerCase()} Game`;
    }
    
    return cleaned;
};

// Create a normalized key for grouping similar names
const normalizeForGrouping = (name) => {
    return cleanName(name)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, ''); // Remove all non-alphanumeric
};

// Calculate median value from array
const median = (arr) => {
    if (!arr.length) return 0;
    const sorted = [...arr].filter(v => v > 0).sort((a, b) => a - b);
    if (!sorted.length) return 0;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

// Get most common value from array
const mode = (arr) => {
    if (!arr.length) return null;
    const counts = {};
    arr.forEach(v => {
        if (v) counts[v] = (counts[v] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
};

const run = () => {
    const csvContent = fs.readFileSync('./KingsRooom-Recurring.csv', 'utf-8');
    const games = parseCSV(csvContent);
    
    console.log(`Parsed ${games.length} games from CSV`);
    console.log(`Sample row fields:`, Object.keys(games[0]).slice(0, 10));
    
    // Debug: Check what fields we're getting
    const sample = games[0];
    console.log('\nSample data:');
    console.log('  venueId:', sample.venueId);
    console.log('  gameDayOfWeek:', sample.gameDayOfWeek);
    console.log('  name:', sample.name);
    console.log('  buyIn:', sample.buyIn);
    console.log('  guaranteeAmount:', sample.guaranteeAmount);
    
    // Group by venue + day (one recurring game per day per venue)
    const recurringMap = new Map();

    games.forEach(game => {
        const venueId = game.venueId;
        const dayOfWeek = game.gameDayOfWeek;
        
        // Skip invalid entries
        if (!venueId || !dayOfWeek || venueId.includes('#')) {
            return; // Skip rows with compound keys in venueId
        }
        
        // Validate day of week
        const validDays = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];
        if (!validDays.includes(dayOfWeek.toUpperCase())) {
            return;
        }
        
        // Key: just venue + day (one recurring game per day per venue)
        const key = `${venueId}|${dayOfWeek.toUpperCase()}`;
        
        if (!recurringMap.has(key)) {
            recurringMap.set(key, {
                venueId,
                entityId: game.entityId,
                dayOfWeek: dayOfWeek.toUpperCase(),
                names: [],
                buyIns: [],
                guarantees: [],
                gameTypes: [],
                gameVariants: [],
                instanceCount: 0
            });
        }
        
        const entry = recurringMap.get(key);
        entry.names.push(game.name);
        entry.buyIns.push(parseFloat(game.buyIn) || 0);
        entry.guarantees.push(parseFloat(game.guaranteeAmount) || 0);
        entry.gameTypes.push(game.gameType);
        entry.gameVariants.push(game.gameVariant);
        entry.instanceCount++;
    });

    // Transform aggregated data into final format
    const result = Array.from(recurringMap.values()).map(entry => {
        // Pick the best representative name
        // Strategy: find the most common cleaned name, but prefer longer/more descriptive ones
        const cleanedNames = entry.names.map(cleanName).filter(n => n && n !== 'Unknown Game' && n.length > 2);
        
        // Group names and count occurrences
        const nameCounts = {};
        cleanedNames.forEach(n => {
            const normalized = n.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!nameCounts[normalized]) {
                nameCounts[normalized] = { original: n, count: 0 };
            }
            nameCounts[normalized].count++;
        });
        
        // Sort by count (desc), then by length (desc) to prefer longer descriptive names
        const sortedNames = Object.values(nameCounts)
            .sort((a, b) => {
                if (b.count !== a.count) return b.count - a.count;
                return b.original.length - a.original.length;
            });
        
        // Get the best name, or create a display name from the most common raw name
        let representativeName;
        if (sortedNames.length > 0 && sortedNames[0].original.length > 3) {
            representativeName = sortedNames[0].original;
        } else {
            // Fall back to creating a nice display name from the mode of raw names
            const rawMode = mode(entry.names);
            representativeName = createDisplayName(rawMode, entry.dayOfWeek);
        }
        
        return {
            id: uuidv4(),
            name: representativeName,
            venueId: entry.venueId,
            entityId: entry.entityId,
            dayOfWeek: entry.dayOfWeek,
            frequency: 'WEEKLY',
            gameType: mode(entry.gameTypes) || 'TOURNAMENT',
            gameVariant: mode(entry.gameVariants) || 'NLHE',
            typicalBuyIn: median(entry.buyIns),
            typicalGuarantee: median(entry.guarantees),
            instanceCount: entry.instanceCount, // How many historical games
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isActive: true,
            __typename: 'RecurringGame'
        };
    });

    // Sort by venue then day
    const dayOrder = { MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5, SATURDAY: 6, SUNDAY: 7 };
    result.sort((a, b) => {
        if (a.venueId !== b.venueId) return a.venueId.localeCompare(b.venueId);
        return dayOrder[a.dayOfWeek] - dayOrder[b.dayOfWeek];
    });

    console.log(`\nConsolidated to ${result.length} unique recurring games (1 per venue per day)`);
    console.log('\nResults:');
    result.forEach(r => {
        console.log(`  ${r.dayOfWeek.padEnd(10)} @ ${r.venueId.slice(0, 8)}... : "${r.name}" ($${r.typicalBuyIn} buy-in, ${r.instanceCount} instances)`);
    });
    
    // Output
    fs.writeFileSync('recurring_games_seed.json', JSON.stringify(result, null, 2));
    console.log('\nSaved to recurring_games_seed.json');
};

run();
