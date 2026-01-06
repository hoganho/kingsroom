/**
 * ===================================================================
 * Entity ID Resolver
 * ===================================================================
 * 
 * Resolves entityId using a priority chain:
 * 1. Explicitly provided entityId (from frontend/args)
 * 2. URL domain matching (lookup Entity table by gameUrlDomain)
 * 3. Existing record's entityId (for updates)
 * 4. Environment variable fallback (DEFAULT_ENTITY_ID)
 * 
 * ===================================================================
 */

const { ScanCommand } = require('@aws-sdk/lib-dynamodb');
const { getTableName } = require('../config/tables');

/**
 * Cache for URL domain -> entityId mappings
 * Avoids repeated database lookups for the same domain
 */
const domainEntityCache = new Map();

/**
 * Resolve entityId using priority chain
 * 
 * @param {string|null} providedEntityId - Explicitly provided entityId
 * @param {string|null} urlEntityId - EntityId resolved from URL domain
 * @param {string|null} existingEntityId - EntityId from existing record
 * @param {string} context - Description for logging
 * @returns {string} Resolved entityId
 * @throws {Error} If no entityId can be resolved
 */
const resolveEntityId = (providedEntityId, urlEntityId = null, existingEntityId = null, context = 'unknown') => {
    // Priority 1: Explicitly provided entityId (from frontend/args)
    if (providedEntityId) {
        return providedEntityId;
    }
    
    // Priority 2: URL domain matching
    if (urlEntityId) {
        console.log(`[EntityResolver] ${context}: Using entityId from URL domain matching`);
        return urlEntityId;
    }
    
    // Priority 3: Existing record's entityId (for updates)
    if (existingEntityId) {
        console.warn(`[EntityResolver] ${context}: Using existing record entityId (frontend should pass entityId)`);
        return existingEntityId;
    }
    
    // Priority 4: Environment variable fallback
    if (process.env.DEFAULT_ENTITY_ID) {
        console.warn(
            `[EntityResolver] ${context}: entityId missing from request, using DEFAULT_ENTITY_ID env var. ` +
            `Frontend should pass entityId from EntityContext.`
        );
        return process.env.DEFAULT_ENTITY_ID;
    }
    
    // No entityId available - throw error
    throw new Error(
        `[EntityResolver] ${context}: entityId is required but was not provided. ` +
        `Frontend must pass entityId from EntityContext, or set DEFAULT_ENTITY_ID environment variable.`
    );
};

/**
 * Get entityId by matching URL domain against Entity table
 * Matches gameUrlDomain stored as either:
 *   - Just domain: "kingsroom.com.au"
 *   - With https: "https://kingsroom.com.au"
 *   - With http: "http://kingsroom.com.au"
 * 
 * @param {string} url - URL to extract domain from
 * @param {object} context - Context object containing ddbDocClient
 * @returns {string|null} EntityId if found, null otherwise
 */
const getEntityIdFromUrl = async (url, context) => {
    if (!url) return null;
    
    try {
        const urlObj = new URL(url);
        const domain = urlObj.hostname;
        
        // Check cache first
        if (domainEntityCache.has(domain)) {
            const cachedEntityId = domainEntityCache.get(domain);
            console.log(`[EntityResolver] Cache hit for domain ${domain}: ${cachedEntityId}`);
            return cachedEntityId;
        }
        
        // Query Entity table - match domain with or without protocol
        const entityTable = getTableName('Entity');
        const { ddbDocClient } = context;
        
        const scanResult = await ddbDocClient.send(new ScanCommand({
            TableName: entityTable,
            FilterExpression: 'gameUrlDomain = :domain OR gameUrlDomain = :domainHttps OR gameUrlDomain = :domainHttp',
            ExpressionAttributeValues: { 
                ':domain': domain,
                ':domainHttps': `https://${domain}`,
                ':domainHttp': `http://${domain}`
            },
            ProjectionExpression: 'id, #name, gameUrlDomain',
            ExpressionAttributeNames: { '#name': 'name' }
        }));
        
        if (scanResult.Items && scanResult.Items.length > 0) {
            const entityId = scanResult.Items[0].id;
            const entityName = scanResult.Items[0].name;
            
            // Cache the result
            domainEntityCache.set(domain, entityId);
            
            console.log(`[EntityResolver] Found entity "${entityName}" (${entityId}) for domain ${domain}`);
            return entityId;
        }
        
        // No match found - cache null to avoid repeated lookups
        domainEntityCache.set(domain, null);
        console.log(`[EntityResolver] No entity found for domain ${domain}`);
        return null;
        
    } catch (error) {
        console.error('[EntityResolver] Error determining entity from URL:', error);
        return null;
    }
};

/**
 * Clear the domain entity cache (useful for testing)
 */
const clearDomainEntityCache = () => {
    domainEntityCache.clear();
};

/**
 * Get entity by ID
 * 
 * @param {string} entityId - Entity ID to look up
 * @param {object} context - Context object containing ddbDocClient
 * @returns {object|null} Entity record or null
 */
const getEntityById = async (entityId, context) => {
    if (!entityId) return null;
    
    try {
        const { GetCommand } = require('@aws-sdk/lib-dynamodb');
        const entityTable = getTableName('Entity');
        const { ddbDocClient } = context;
        
        const result = await ddbDocClient.send(new GetCommand({
            TableName: entityTable,
            Key: { id: entityId }
        }));
        
        return result.Item || null;
        
    } catch (error) {
        console.error(`[EntityResolver] Error fetching entity ${entityId}:`, error);
        return null;
    }
};

module.exports = {
    resolveEntityId,
    getEntityIdFromUrl,
    getEntityById,
    clearDomainEntityCache
};