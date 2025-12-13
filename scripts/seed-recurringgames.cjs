const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// CSV Parsing Helper
const parseCSV = (content) => {
    const lines = content.split('\n').filter(l => l.trim());
    const headers = lines[0].split(',').map(h => h.trim());
    
    return lines.slice(1).map(line => {
        // Handle commas inside quotes (simple version)
        const parts = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
        // Fallback for simple split if regex fails or simple CSV
        const simpleParts = line.split(',');
        
        // Map to object
        const row = {};
        headers.forEach((h, i) => {
            let val = simpleParts[i];
            if (val) val = val.replace(/^"|"$/g, ''); // strip quotes
            row[h] = val;
        });
        return row;
    });
};

// Name Cleaner
const cleanName = (name) => {
    if (!name) return 'Unknown Game';
    return name
        .replace(/\$[0-9,]+(k)?\s*(gtd|guaranteed)?/gi, '') // Remove $ money
        .replace(/gtd|guaranteed/gi, '')
        .replace(/weekly/gi, '')
        .replace(/rebuy.*$/gi, '')
        .replace(/re-entry.*$/gi, '')
        .replace(/\s+/g, ' ') // Collapse spaces
        .trim();
};

const run = () => {
    const csvContent = fs.readFileSync('./KingsRooom-Recurring.csv', 'utf-8');
    const games = parseCSV(csvContent);
    
    // Grouping Map
    const recurringMap = new Map();

    games.forEach(game => {
        if (!game.venueId || !game.gameDayOfWeek) return;

        const clean = cleanName(game.name);
        
        // Key: Venue + Day + CleanName (Unique definition of a recurring game)
        const key = `${game.venueId}|${game.gameDayOfWeek}|${clean}`;

        if (!recurringMap.has(key)) {
            recurringMap.set(key, {
                id: uuidv4(),
                name: clean, // The normalized name (e.g., "Wenty's Wednesdays")
                venueId: game.venueId,
                entityId: game.entityId,
                dayOfWeek: game.gameDayOfWeek,
                frequency: 'WEEKLY', // Default from CSV context
                gameType: game.gameType || 'TOURNAMENT',
                gameVariant: game.gameVariant || 'NLHE',
                typicalBuyIn: parseFloat(game.buyIn || 0),
                typicalGuarantee: parseFloat(game.guaranteeAmount || 0),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                isActive: true,
                __typename: 'RecurringGame'
            });
        }
    });

    const result = Array.from(recurringMap.values());
    console.log(`Found ${result.length} unique recurring games.`);
    
    // Output
    fs.writeFileSync('recurring_games_seed.json', JSON.stringify(result, null, 2));
    console.log('Saved to recurring_games_seed.json');
};

run();