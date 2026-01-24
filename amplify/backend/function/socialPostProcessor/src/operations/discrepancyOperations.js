/**
 * Scrape Discrepancy Operations
 * Version: 3.0.0
 * 
 * Handles detection and management of scrape discrepancies:
 * - Games referenced in social posts that don't exist in the database
 * - Games with problematic statuses (NOT_FOUND, NOT_PUBLISHED)
 * - Entity mismatches (game exists but belongs to different entity)
 * 
 * Uses extractedTournamentUrl (matches Game.sourceUrl) as the unique identifier
 * across all entities, NOT tournamentId which is only unique per-entity.
 */

const { DynamoDB } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocument } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');

const dynamoDB = DynamoDBDocument.from(new DynamoDB({}));

// Table names from environment
const GAME_TABLE = process.env.API_KINGSROOM_GAMETABLE_NAME;
const SOCIAL_POST_TABLE = process.env.API_KINGSROOM_SOCIALPOSTTABLE_NAME;
const SOCIAL_POST_GAME_LINK_TABLE = process.env.API_KINGSROOM_SOCIALPOSTGAMELINKTABLE_NAME;
const SOCIAL_POST_GAME_DATA_TABLE = process.env.API_KINGSROOM_SOCIALPOSTGAMEDATATABLE_NAME;
const ENTITY_TABLE = process.env.API_KINGSROOM_ENTITYTABLE_NAME;

// Discrepancy types
const DISCREPANCY_TYPES = {
  GAME_NOT_IN_DATABASE: 'GAME_NOT_IN_DATABASE',
  GAME_STATUS_NOT_FOUND: 'GAME_STATUS_NOT_FOUND',
  GAME_STATUS_NOT_PUBLISHED: 'GAME_STATUS_NOT_PUBLISHED',
  ENTITY_MISMATCH: 'ENTITY_MISMATCH',
  STATUS_MISMATCH: 'STATUS_MISMATCH'
};

// Resolution statuses
const RESOLUTION_STATUSES = {
  UNRESOLVED: 'UNRESOLVED',
  RESCRAPE_REQUESTED: 'RESCRAPE_REQUESTED',
  RESCRAPE_COMPLETED: 'RESCRAPE_COMPLETED',
  MANUALLY_RESOLVED: 'MANUALLY_RESOLVED',
  IGNORED: 'IGNORED',
  GAME_LINKED: 'GAME_LINKED'
};

/**
 * Query game by sourceUrl using GSI
 * @param {string} sourceUrl - The tournament URL to look up
 * @returns {Object|null} - Game record or null if not found
 */
async function queryGameBySourceUrl(sourceUrl) {
  if (!sourceUrl) return null;
  
  try {
    const result = await dynamoDB.query({
      TableName: GAME_TABLE,
      IndexName: 'bySourceUrl',
      KeyConditionExpression: 'sourceUrl = :url',
      ExpressionAttributeValues: {
        ':url': sourceUrl
      },
      Limit: 1
    });
    
    return result.Items?.[0] || null;
  } catch (error) {
    console.error('[DISCREPANCY] Error querying game by sourceUrl:', error);
    return null;
  }
}

/**
 * Query existing discrepancy link by tournament URL
 * @param {string} tournamentUrl - The tournament URL to look up
 * @returns {Object|null} - Existing link or null
 */
async function queryLinkByTournamentUrl(tournamentUrl) {
  if (!tournamentUrl) return null;
  
  try {
    const result = await dynamoDB.query({
      TableName: SOCIAL_POST_GAME_LINK_TABLE,
      IndexName: 'byExtractedTournamentUrl',
      KeyConditionExpression: 'extractedTournamentUrl = :url',
      ExpressionAttributeValues: {
        ':url': tournamentUrl
      },
      Limit: 1
    });
    
    return result.Items?.[0] || null;
  } catch (error) {
    console.error('[DISCREPANCY] Error querying link by tournamentUrl:', error);
    return null;
  }
}

/**
 * Get entity name by ID
 * @param {string} entityId - Entity ID
 * @returns {string|null} - Entity name or null
 */
async function getEntityName(entityId) {
  if (!entityId || !ENTITY_TABLE) return null;
  
  try {
    const result = await dynamoDB.get({
      TableName: ENTITY_TABLE,
      Key: { id: entityId },
      ProjectionExpression: '#n',
      ExpressionAttributeNames: { '#n': 'name' }
    });
    return result.Item?.name || null;
  } catch (error) {
    console.error('[DISCREPANCY] Error getting entity name:', error);
    return null;
  }
}

/**
 * Get social post with account info
 * @param {string} socialPostId - Social post ID
 * @returns {Object|null} - Social post with entity info
 */
async function getSocialPostWithEntity(socialPostId) {
  if (!socialPostId) return null;
  
  try {
    const result = await dynamoDB.get({
      TableName: SOCIAL_POST_TABLE,
      Key: { id: socialPostId }
    });
    return result.Item || null;
  } catch (error) {
    console.error('[DISCREPANCY] Error getting social post:', error);
    return null;
  }
}

/**
 * Trigger re-scrape for a discrepancy
 * 
 * Supports two modes:
 * 1. Existing link: Provide linkId
 * 2. New discrepancy: Provide tournamentUrl + socialPostId
 * 
 * @param {Object} input - Input parameters
 * @returns {Object} - TriggerRescrapeResult
 */
async function triggerDiscrepancyRescrape(input) {
  const startTime = Date.now();
  console.log('[DISCREPANCY] triggerDiscrepancyRescrape called with:', JSON.stringify(input, null, 2));
  
  const {
    linkId,
    tournamentUrl,
    tournamentId,
    socialPostId,
    entityId,
    forceRefresh = false,
    priority,
    notes
  } = input;
  
  try {
    let link = null;
    let linkCreated = false;
    let deduplicated = false;
    
    // =========================================================================
    // MODE 1: Existing link by linkId
    // =========================================================================
    if (linkId) {
      const result = await dynamoDB.get({
        TableName: SOCIAL_POST_GAME_LINK_TABLE,
        Key: { id: linkId }
      });
      
      if (!result.Item) {
        return {
          success: false,
          error: `Link not found: ${linkId}`
        };
      }
      
      link = result.Item;
      
      // Check if already pending rescrape
      if (link.rescrapeRequested && !forceRefresh) {
        return {
          success: true,
          linkId: link.id,
          tournamentUrl: link.extractedTournamentUrl,
          tournamentId: link.extractedTournamentId,
          rescrapeJobId: link.rescrapeJobId,
          deduplicated: true,
          message: 'Rescrape already pending for this link'
        };
      }
    }
    
    // =========================================================================
    // MODE 2: New discrepancy by tournamentUrl
    // =========================================================================
    else if (tournamentUrl && socialPostId) {
      // Check if link already exists for this URL
      const existingLink = await queryLinkByTournamentUrl(tournamentUrl);
      
      if (existingLink) {
        link = existingLink;
        
        // Check if already pending
        if (link.rescrapeRequested && !forceRefresh) {
          return {
            success: true,
            linkId: link.id,
            tournamentUrl: link.extractedTournamentUrl,
            tournamentId: link.extractedTournamentId,
            rescrapeJobId: link.rescrapeJobId,
            deduplicated: true,
            linkCreated: false,
            message: 'Rescrape already pending for this URL'
          };
        }
      } else {
        // Create new PENDING_SCRAPE link
        const now = new Date().toISOString();
        const newLinkId = uuidv4();
        
        // Determine discrepancy type by checking if game exists
        const existingGame = await queryGameBySourceUrl(tournamentUrl);
        let discrepancyType = DISCREPANCY_TYPES.GAME_NOT_IN_DATABASE;
        let detectedGameStatus = null;
        let detectedGameEntityId = null;
        
        if (existingGame) {
          // Game exists - check status and entity
          if (entityId && existingGame.entityId !== entityId) {
            discrepancyType = DISCREPANCY_TYPES.ENTITY_MISMATCH;
            detectedGameEntityId = existingGame.entityId;
          } else if (existingGame.gameStatus === 'NOT_FOUND') {
            discrepancyType = DISCREPANCY_TYPES.GAME_STATUS_NOT_FOUND;
          } else if (existingGame.gameStatus === 'NOT_PUBLISHED') {
            discrepancyType = DISCREPANCY_TYPES.GAME_STATUS_NOT_PUBLISHED;
          }
          detectedGameStatus = existingGame.gameStatus;
        }
        
        const newLink = {
          id: newLinkId,
          socialPostId,
          gameId: 'PENDING_SCRAPE', // Sentinel value
          linkType: 'PENDING_SCRAPE',
          matchConfidence: 0,
          matchReason: 'scrape_discrepancy_detected',
          extractedTournamentUrl: tournamentUrl,
          extractedTournamentId: tournamentId,
          entityId,
          hasScrapeDiscrepancy: true,
          scrapeDiscrepancyType: discrepancyType,
          scrapeDiscrepancyDetectedAt: now,
          detectedGameStatus,
          detectedGameEntityId,
          discrepancyResolution: RESOLUTION_STATUSES.UNRESOLVED,
          linkedAt: now,
          linkedBy: 'SYSTEM',
          createdAt: now,
          updatedAt: now,
          __typename: 'SocialPostGameLink'
        };
        
        await dynamoDB.put({
          TableName: SOCIAL_POST_GAME_LINK_TABLE,
          Item: newLink
        });
        
        link = newLink;
        linkCreated = true;
        console.log(`[DISCREPANCY] Created new PENDING_SCRAPE link: ${newLinkId}`);
      }
    } else {
      return {
        success: false,
        error: 'Invalid input: either linkId or (tournamentUrl + socialPostId) required'
      };
    }
    
    // =========================================================================
    // Update link with rescrape request
    // =========================================================================
    const now = new Date().toISOString();
    const rescrapeJobId = `rescrape-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    await dynamoDB.update({
      TableName: SOCIAL_POST_GAME_LINK_TABLE,
      Key: { id: link.id },
      UpdateExpression: `
        SET rescrapeRequested = :true,
            rescrapeRequestedAt = :now,
            rescrapeRequestedBy = :by,
            rescrapeJobId = :jobId,
            discrepancyResolution = :resolution,
            discrepancyResolutionNotes = :notes,
            updatedAt = :now
      `,
      ExpressionAttributeValues: {
        ':true': true,
        ':now': now,
        ':by': 'USER', // TODO: Get actual user from context
        ':jobId': rescrapeJobId,
        ':resolution': RESOLUTION_STATUSES.RESCRAPE_REQUESTED,
        ':notes': notes || null
      }
    });
    
    // TODO: Trigger actual scraper job here
    // This would invoke the scraper Lambda or add to SQS queue
    console.log(`[DISCREPANCY] Would trigger scraper job: ${rescrapeJobId} for URL: ${link.extractedTournamentUrl}`);
    
    return {
      success: true,
      linkId: link.id,
      rescrapeJobId,
      tournamentUrl: link.extractedTournamentUrl,
      tournamentId: link.extractedTournamentId,
      linkCreated,
      deduplicated,
      message: linkCreated 
        ? 'Created new discrepancy link and triggered rescrape'
        : 'Triggered rescrape for existing link'
    };
    
  } catch (error) {
    console.error('[DISCREPANCY] Error in triggerDiscrepancyRescrape:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Manually resolve a discrepancy
 * 
 * @param {Object} input - Input parameters
 * @returns {Object} - ResolveDiscrepancyResult
 */
async function resolveDiscrepancy(input) {
  console.log('[DISCREPANCY] resolveDiscrepancy called with:', JSON.stringify(input, null, 2));
  
  const { linkId, resolution, gameId, notes } = input;
  
  try {
    // Get existing link
    const result = await dynamoDB.get({
      TableName: SOCIAL_POST_GAME_LINK_TABLE,
      Key: { id: linkId }
    });
    
    if (!result.Item) {
      return {
        success: false,
        error: `Link not found: ${linkId}`
      };
    }
    
    const link = result.Item;
    const previousResolution = link.discrepancyResolution;
    const now = new Date().toISOString();
    
    // Build update expression
    const updateExpressions = [
      'discrepancyResolution = :resolution',
      'discrepancyResolvedAt = :now',
      'discrepancyResolvedBy = :by',
      'updatedAt = :now'
    ];
    
    const expressionValues = {
      ':resolution': resolution,
      ':now': now,
      ':by': 'USER' // TODO: Get actual user from context
    };
    
    if (notes) {
      updateExpressions.push('discrepancyResolutionNotes = :notes');
      expressionValues[':notes'] = notes;
    }
    
    // If linking to a game, update the link
    if (gameId && resolution === RESOLUTION_STATUSES.GAME_LINKED) {
      updateExpressions.push('gameId = :gameId');
      updateExpressions.push('linkType = :linkType');
      updateExpressions.push('hasScrapeDiscrepancy = :false');
      expressionValues[':gameId'] = gameId;
      expressionValues[':linkType'] = 'MANUAL';
      expressionValues[':false'] = false;
    }
    
    await dynamoDB.update({
      TableName: SOCIAL_POST_GAME_LINK_TABLE,
      Key: { id: linkId },
      UpdateExpression: `SET ${updateExpressions.join(', ')}`,
      ExpressionAttributeValues: expressionValues
    });
    
    return {
      success: true,
      linkId,
      previousResolution,
      newResolution: resolution,
      gameId: gameId || link.gameId,
      message: `Discrepancy resolved as ${resolution}`
    };
    
  } catch (error) {
    console.error('[DISCREPANCY] Error in resolveDiscrepancy:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Scan posts to find new discrepancies
 * 
 * Checks extractedTournamentUrl against Game.sourceUrl
 * 
 * @param {Object} input - Input parameters
 * @returns {Object} - ScanForDiscrepanciesResult
 */
async function scanForDiscrepancies(input = {}) {
  const startTime = Date.now();
  console.log('[DISCREPANCY] scanForDiscrepancies called with:', JSON.stringify(input, null, 2));
  
  const {
    entityId,
    socialAccountId,
    postedAfter,
    postedBefore,
    limit = 1000,
    createLinks = true,
    autoTriggerRescrape = false
  } = input;
  
  try {
    // =========================================================================
    // Step 1: Fetch all SocialPostGameData with extractedTournamentUrl
    // =========================================================================
    let scanParams = {
      TableName: SOCIAL_POST_GAME_DATA_TABLE,
      FilterExpression: 'attribute_exists(extractedTournamentUrl)',
      Limit: limit
    };
    
    const extractions = [];
    let lastEvaluatedKey = null;
    
    do {
      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }
      
      const result = await dynamoDB.scan(scanParams);
      extractions.push(...(result.Items || []));
      lastEvaluatedKey = result.LastEvaluatedKey;
      
    } while (lastEvaluatedKey && extractions.length < limit);
    
    console.log(`[DISCREPANCY] Found ${extractions.length} extractions with tournament URLs`);
    
    // =========================================================================
    // Step 2: Group by unique tournament URL
    // =========================================================================
    const urlMap = new Map();
    for (const extraction of extractions) {
      const url = extraction.extractedTournamentUrl;
      if (!url) continue;
      
      if (!urlMap.has(url)) {
        urlMap.set(url, {
          url,
          tournamentId: extraction.extractedTournamentId,
          extractions: []
        });
      }
      urlMap.get(url).extractions.push(extraction);
    }
    
    console.log(`[DISCREPANCY] ${urlMap.size} unique tournament URLs to check`);
    
    // =========================================================================
    // Step 3: Check each URL for discrepancies
    // =========================================================================
    const discrepancies = [];
    const byType = {};
    let linksCreated = 0;
    let rescrapesTriggered = 0;
    
    for (const [url, data] of urlMap) {
      // Check if link already exists for this URL
      const existingLink = await queryLinkByTournamentUrl(url);
      if (existingLink) {
        // Already tracked
        continue;
      }
      
      // Get entity from first extraction's social post
      const firstExtraction = data.extractions[0];
      const socialPost = await getSocialPostWithEntity(firstExtraction.socialPostId);
      const postEntityId = socialPost?.entityId || entityId;
      
      // Filter by entity if specified
      if (entityId && postEntityId !== entityId) {
        continue;
      }
      
      // Query game by sourceUrl
      const game = await queryGameBySourceUrl(url);
      
      let discrepancyType = null;
      let detectedGameStatus = null;
      let detectedGameEntityId = null;
      
      if (!game) {
        // No game exists with this URL
        discrepancyType = DISCREPANCY_TYPES.GAME_NOT_IN_DATABASE;
      } else {
        // Game exists - check entity and status
        if (postEntityId && game.entityId !== postEntityId) {
          discrepancyType = DISCREPANCY_TYPES.ENTITY_MISMATCH;
          detectedGameEntityId = game.entityId;
        } else if (game.gameStatus === 'NOT_FOUND') {
          discrepancyType = DISCREPANCY_TYPES.GAME_STATUS_NOT_FOUND;
        } else if (game.gameStatus === 'NOT_PUBLISHED') {
          discrepancyType = DISCREPANCY_TYPES.GAME_STATUS_NOT_PUBLISHED;
        }
        detectedGameStatus = game.gameStatus;
      }
      
      // If no discrepancy, skip
      if (!discrepancyType) {
        continue;
      }
      
      // Track by type
      byType[discrepancyType] = (byType[discrepancyType] || 0) + 1;
      
      // Create link if requested
      let linkId = null;
      if (createLinks) {
        const now = new Date().toISOString();
        linkId = uuidv4();
        
        const newLink = {
          id: linkId,
          socialPostId: firstExtraction.socialPostId,
          gameId: 'PENDING_SCRAPE',
          linkType: 'PENDING_SCRAPE',
          matchConfidence: 0,
          matchReason: 'scan_discrepancy_detected',
          extractedTournamentUrl: url,
          extractedTournamentId: data.tournamentId,
          entityId: postEntityId,
          hasScrapeDiscrepancy: true,
          scrapeDiscrepancyType: discrepancyType,
          scrapeDiscrepancyDetectedAt: now,
          detectedGameStatus,
          detectedGameEntityId,
          discrepancyResolution: RESOLUTION_STATUSES.UNRESOLVED,
          linkedAt: now,
          linkedBy: 'SYSTEM',
          createdAt: now,
          updatedAt: now,
          __typename: 'SocialPostGameLink'
        };
        
        await dynamoDB.put({
          TableName: SOCIAL_POST_GAME_LINK_TABLE,
          Item: newLink
        });
        
        linksCreated++;
        
        // Trigger rescrape if requested
        if (autoTriggerRescrape) {
          await triggerDiscrepancyRescrape({
            linkId,
            forceRefresh: false
          });
          rescrapesTriggered++;
        }
      }
      
      // Build discrepancy info
      const entityName = postEntityId ? await getEntityName(postEntityId) : null;
      const gameEntityName = detectedGameEntityId ? await getEntityName(detectedGameEntityId) : null;
      
      discrepancies.push({
        linkId,
        socialPostId: firstExtraction.socialPostId,
        extractedTournamentId: data.tournamentId,
        extractedTournamentUrl: url,
        scrapeDiscrepancyType: discrepancyType,
        detectedAt: new Date().toISOString(),
        entityId: postEntityId,
        entityName,
        gameId: game?.id,
        gameStatus: detectedGameStatus,
        gameName: game?.name,
        detectedGameEntityId,
        detectedGameEntityName: gameEntityName,
        rescrapeRequested: autoTriggerRescrape,
        resolution: RESOLUTION_STATUSES.UNRESOLVED
      });
    }
    
    const processingTimeMs = Date.now() - startTime;
    
    return {
      success: true,
      extractionsScanned: extractions.length,
      uniqueUrlsChecked: urlMap.size,
      discrepanciesFound: discrepancies.length,
      linksCreated,
      rescrapesTriggered,
      byType,
      discrepancies,
      processingTimeMs
    };
    
  } catch (error) {
    console.error('[DISCREPANCY] Error in scanForDiscrepancies:', error);
    return {
      success: false,
      extractionsScanned: 0,
      uniqueUrlsChecked: 0,
      discrepanciesFound: 0,
      linksCreated: 0,
      rescrapesTriggered: 0,
      error: error.message,
      processingTimeMs: Date.now() - startTime
    };
  }
}

/**
 * Get all scrape discrepancies (paginated, filtered)
 * 
 * @param {Object} input - Filter and pagination parameters
 * @returns {Object} - ScrapeDiscrepancyConnection
 */
async function getScrapeDiscrepancies(input = {}) {
  console.log('[DISCREPANCY] getScrapeDiscrepancies called with:', JSON.stringify(input, null, 2));
  
  const {
    entityId,
    scrapeDiscrepancyType,
    rescrapeRequested,
    discrepancyResolution,
    detectedAfter,
    detectedBefore,
    limit = 50,
    nextToken
  } = input;
  
  try {
    // Build filter expression
    const filterParts = ['hasScrapeDiscrepancy = :true'];
    const expressionValues = { ':true': true };
    const expressionNames = {};
    
    if (entityId) {
      filterParts.push('entityId = :entityId');
      expressionValues[':entityId'] = entityId;
    }
    
    if (scrapeDiscrepancyType) {
      filterParts.push('scrapeDiscrepancyType = :discType');
      expressionValues[':discType'] = scrapeDiscrepancyType;
    }
    
    if (rescrapeRequested !== undefined) {
      filterParts.push('rescrapeRequested = :rescrapeReq');
      expressionValues[':rescrapeReq'] = rescrapeRequested;
    }
    
    if (discrepancyResolution) {
      filterParts.push('discrepancyResolution = :resolution');
      expressionValues[':resolution'] = discrepancyResolution;
    }
    
    if (detectedAfter) {
      filterParts.push('scrapeDiscrepancyDetectedAt >= :detectedAfter');
      expressionValues[':detectedAfter'] = detectedAfter;
    }
    
    if (detectedBefore) {
      filterParts.push('scrapeDiscrepancyDetectedAt <= :detectedBefore');
      expressionValues[':detectedBefore'] = detectedBefore;
    }
    
    const scanParams = {
      TableName: SOCIAL_POST_GAME_LINK_TABLE,
      FilterExpression: filterParts.join(' AND '),
      ExpressionAttributeValues: expressionValues,
      Limit: limit
    };
    
    if (Object.keys(expressionNames).length > 0) {
      scanParams.ExpressionAttributeNames = expressionNames;
    }
    
    if (nextToken) {
      scanParams.ExclusiveStartKey = JSON.parse(Buffer.from(nextToken, 'base64').toString());
    }
    
    const result = await dynamoDB.scan(scanParams);
    
    // Enrich with entity names
    const items = await Promise.all((result.Items || []).map(async (link) => {
      const entityName = link.entityId ? await getEntityName(link.entityId) : null;
      const gameEntityName = link.detectedGameEntityId ? await getEntityName(link.detectedGameEntityId) : null;
      
      return {
        linkId: link.id,
        socialPostId: link.socialPostId,
        extractedTournamentId: link.extractedTournamentId,
        extractedTournamentUrl: link.extractedTournamentUrl,
        scrapeDiscrepancyType: link.scrapeDiscrepancyType,
        detectedAt: link.scrapeDiscrepancyDetectedAt,
        entityId: link.entityId,
        entityName,
        gameId: link.gameId !== 'PENDING_SCRAPE' ? link.gameId : null,
        gameStatus: link.detectedGameStatus,
        detectedGameEntityId: link.detectedGameEntityId,
        detectedGameEntityName: gameEntityName,
        rescrapeRequested: link.rescrapeRequested,
        rescrapeRequestedAt: link.rescrapeRequestedAt,
        rescrapeJobId: link.rescrapeJobId,
        rescrapeResult: link.rescrapeResult,
        resolution: link.discrepancyResolution,
        resolvedAt: link.discrepancyResolvedAt,
        resolvedBy: link.discrepancyResolvedBy,
        resolutionNotes: link.discrepancyResolutionNotes
      };
    }));
    
    // Calculate counts by type and resolution
    const byType = {};
    const byResolution = {};
    
    for (const item of items) {
      byType[item.scrapeDiscrepancyType] = (byType[item.scrapeDiscrepancyType] || 0) + 1;
      byResolution[item.resolution || 'UNRESOLVED'] = (byResolution[item.resolution || 'UNRESOLVED'] || 0) + 1;
    }
    
    return {
      items,
      nextToken: result.LastEvaluatedKey 
        ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
        : null,
      totalCount: items.length,
      byType,
      byResolution
    };
    
  } catch (error) {
    console.error('[DISCREPANCY] Error in getScrapeDiscrepancies:', error);
    return {
      items: [],
      nextToken: null,
      totalCount: 0,
      byType: {},
      byResolution: {}
    };
  }
}

/**
 * Get a single discrepancy by link ID
 * 
 * @param {string} linkId - Link ID
 * @returns {Object} - ScrapeDiscrepancyInfo
 */
async function getScrapeDiscrepancy(linkId) {
  console.log('[DISCREPANCY] getScrapeDiscrepancy called for:', linkId);
  
  try {
    const result = await dynamoDB.get({
      TableName: SOCIAL_POST_GAME_LINK_TABLE,
      Key: { id: linkId }
    });
    
    if (!result.Item) {
      return null;
    }
    
    const link = result.Item;
    
    // Get entity names
    const entityName = link.entityId ? await getEntityName(link.entityId) : null;
    const gameEntityName = link.detectedGameEntityId ? await getEntityName(link.detectedGameEntityId) : null;
    
    // Get social post
    const socialPost = await getSocialPostWithEntity(link.socialPostId);
    
    return {
      linkId: link.id,
      socialPostId: link.socialPostId,
      socialPost,
      extractedTournamentId: link.extractedTournamentId,
      extractedTournamentUrl: link.extractedTournamentUrl,
      scrapeDiscrepancyType: link.scrapeDiscrepancyType,
      detectedAt: link.scrapeDiscrepancyDetectedAt,
      entityId: link.entityId,
      entityName,
      gameId: link.gameId !== 'PENDING_SCRAPE' ? link.gameId : null,
      gameStatus: link.detectedGameStatus,
      gameName: null, // Would need to fetch game
      detectedGameEntityId: link.detectedGameEntityId,
      detectedGameEntityName: gameEntityName,
      rescrapeRequested: link.rescrapeRequested,
      rescrapeRequestedAt: link.rescrapeRequestedAt,
      rescrapeJobId: link.rescrapeJobId,
      rescrapeResult: link.rescrapeResult,
      resolution: link.discrepancyResolution,
      resolvedAt: link.discrepancyResolvedAt,
      resolvedBy: link.discrepancyResolvedBy,
      resolutionNotes: link.discrepancyResolutionNotes
    };
    
  } catch (error) {
    console.error('[DISCREPANCY] Error in getScrapeDiscrepancy:', error);
    return null;
  }
}

/**
 * Get discrepancy statistics
 * 
 * @param {string} entityId - Optional entity filter
 * @returns {Object} - ScrapeDiscrepancyStats
 */
async function getScrapeDiscrepancyStats(entityId = null) {
  console.log('[DISCREPANCY] getScrapeDiscrepancyStats called for entity:', entityId);
  
  try {
    // Scan all discrepancy links
    const filterParts = ['hasScrapeDiscrepancy = :true'];
    const expressionValues = { ':true': true };
    
    if (entityId) {
      filterParts.push('entityId = :entityId');
      expressionValues[':entityId'] = entityId;
    }
    
    const scanParams = {
      TableName: SOCIAL_POST_GAME_LINK_TABLE,
      FilterExpression: filterParts.join(' AND '),
      ExpressionAttributeValues: expressionValues,
      ProjectionExpression: 'scrapeDiscrepancyType, discrepancyResolution, rescrapeRequested, entityId'
    };
    
    const items = [];
    let lastEvaluatedKey = null;
    
    do {
      if (lastEvaluatedKey) {
        scanParams.ExclusiveStartKey = lastEvaluatedKey;
      }
      
      const result = await dynamoDB.scan(scanParams);
      items.push(...(result.Items || []));
      lastEvaluatedKey = result.LastEvaluatedKey;
      
    } while (lastEvaluatedKey);
    
    // Calculate stats
    let totalDiscrepancies = items.length;
    let unresolvedCount = 0;
    let resolvingCount = 0;
    let resolvedCount = 0;
    let gameNotInDatabaseCount = 0;
    let gameStatusNotFoundCount = 0;
    let gameStatusNotPublishedCount = 0;
    let entityMismatchCount = 0;
    let statusMismatchCount = 0;
    let pendingRescrapes = 0;
    const byEntity = {};
    
    for (const item of items) {
      // Count by resolution
      const resolution = item.discrepancyResolution || 'UNRESOLVED';
      if (resolution === 'UNRESOLVED') {
        unresolvedCount++;
      } else if (resolution === 'RESCRAPE_REQUESTED') {
        resolvingCount++;
      } else {
        resolvedCount++;
      }
      
      // Count by type
      switch (item.scrapeDiscrepancyType) {
        case DISCREPANCY_TYPES.GAME_NOT_IN_DATABASE:
          gameNotInDatabaseCount++;
          break;
        case DISCREPANCY_TYPES.GAME_STATUS_NOT_FOUND:
          gameStatusNotFoundCount++;
          break;
        case DISCREPANCY_TYPES.GAME_STATUS_NOT_PUBLISHED:
          gameStatusNotPublishedCount++;
          break;
        case DISCREPANCY_TYPES.ENTITY_MISMATCH:
          entityMismatchCount++;
          break;
        case DISCREPANCY_TYPES.STATUS_MISMATCH:
          statusMismatchCount++;
          break;
      }
      
      // Count pending rescrapes
      if (item.rescrapeRequested) {
        pendingRescrapes++;
      }
      
      // Count by entity
      if (item.entityId) {
        byEntity[item.entityId] = (byEntity[item.entityId] || 0) + 1;
      }
    }
    
    return {
      totalDiscrepancies,
      unresolvedCount,
      resolvingCount,
      resolvedCount,
      gameNotInDatabaseCount,
      gameStatusNotFoundCount,
      gameStatusNotPublishedCount,
      entityMismatchCount,
      statusMismatchCount,
      pendingRescrapes,
      byEntity
    };
    
  } catch (error) {
    console.error('[DISCREPANCY] Error in getScrapeDiscrepancyStats:', error);
    return {
      totalDiscrepancies: 0,
      unresolvedCount: 0,
      resolvingCount: 0,
      resolvedCount: 0,
      gameNotInDatabaseCount: 0,
      gameStatusNotFoundCount: 0,
      gameStatusNotPublishedCount: 0,
      entityMismatchCount: 0,
      statusMismatchCount: 0,
      pendingRescrapes: 0,
      byEntity: {}
    };
  }
}

module.exports = {
  triggerDiscrepancyRescrape,
  resolveDiscrepancy,
  scanForDiscrepancies,
  getScrapeDiscrepancies,
  getScrapeDiscrepancy,
  getScrapeDiscrepancyStats,
  // Export constants for use elsewhere
  DISCREPANCY_TYPES,
  RESOLUTION_STATUSES
};
