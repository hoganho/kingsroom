/**
 * ===================================================================
 * Table Name Resolution
 * ===================================================================
 * 
 * Centralized table name resolution for all DynamoDB tables.
 * Supports both environment variable mapping and dynamic construction.
 * 
 * ===================================================================
 */

/**
 * Environment variable mappings for table names
 */
const TABLE_ENV_MAPPINGS = {
    Entity: 'API_KINGSROOM_ENTITYTABLE_NAME',
    Game: 'API_KINGSROOM_GAMETABLE_NAME',
    Venue: 'API_KINGSROOM_VENUETABLE_NAME',
    Player: 'API_KINGSROOM_PLAYERTABLE_NAME',
    PlayerEntry: 'API_KINGSROOM_PLAYERENTRYTABLE_NAME',
    PlayerResult: 'API_KINGSROOM_PLAYERRESULTTABLE_NAME',
    PlayerSummary: 'API_KINGSROOM_PLAYERSUMMARYTABLE_NAME',
    PlayerTransaction: 'API_KINGSROOM_PLAYERTRANSACTIONTABLE_NAME',
    PlayerVenue: 'API_KINGSROOM_PLAYERVENUETABLE_NAME',
    ScrapeURL: 'API_KINGSROOM_SCRAPEURLTABLE_NAME',
    ScrapeAttempt: 'API_KINGSROOM_SCRAPEATTEMPTTABLE_NAME',
    ScraperJob: 'API_KINGSROOM_SCRAPERJOBTABLE_NAME',
    ScraperState: 'API_KINGSROOM_SCRAPERSTATETABLE_NAME',
    ScrapeStructure: 'API_KINGSROOM_SCRAPESTRUCTURETABLE_NAME',
    S3Storage: 'API_KINGSROOM_S3STORAGETABLE_NAME',
    TournamentStructure: 'API_KINGSROOM_TOURNAMENTSTRUCTURETABLE_NAME',
    TournamentSeries: 'API_KINGSROOM_TOURNAMENTSERIESTABLE_NAME',
    TournamentSeriesTitle: 'API_KINGSROOM_TOURNAMENTSERIESTITLETABLE_NAME'
};

/**
 * Cache for resolved table names
 */
const tableNameCache = new Map();

/**
 * Get DynamoDB table name for a model
 * 
 * Priority:
 * 1. Cached value
 * 2. Environment variable (e.g., API_KINGSROOM_GAMETABLE_NAME)
 * 3. Constructed from API ID + ENV (e.g., Game-abc123-dev)
 * 
 * @param {string} modelName - Model name (e.g., 'Game', 'ScrapeURL')
 * @returns {string} Full table name
 * @throws {Error} If table name cannot be resolved
 */
const getTableName = (modelName) => {
    // Check cache first
    if (tableNameCache.has(modelName)) {
        return tableNameCache.get(modelName);
    }
    
    let tableName;
    
    // Try environment variable mapping
    const envKey = TABLE_ENV_MAPPINGS[modelName];
    if (envKey && process.env[envKey]) {
        tableName = process.env[envKey];
    } else {
        // Fall back to constructed name
        const apiId = process.env.API_KINGSROOM_GRAPHQLAPIIDOUTPUT;
        const env = process.env.ENV;
        
        if (!apiId || !env) {
            throw new Error(
                `Cannot resolve table name for ${modelName}. ` +
                `Set ${envKey || 'API_KINGSROOM_GRAPHQLAPIIDOUTPUT and ENV'} environment variable.`
            );
        }
        
        tableName = `${modelName}-${apiId}-${env}`;
    }
    
    // Cache and return
    tableNameCache.set(modelName, tableName);
    return tableName;
};

/**
 * Clear the table name cache (useful for testing)
 */
const clearTableNameCache = () => {
    tableNameCache.clear();
};

/**
 * Get all configured table names (for debugging/logging)
 */
const getAllTableNames = () => {
    const tables = {};
    for (const modelName of Object.keys(TABLE_ENV_MAPPINGS)) {
        try {
            tables[modelName] = getTableName(modelName);
        } catch (e) {
            tables[modelName] = `ERROR: ${e.message}`;
        }
    }
    return tables;
};

module.exports = {
    getTableName,
    clearTableNameCache,
    getAllTableNames,
    TABLE_ENV_MAPPINGS
};
