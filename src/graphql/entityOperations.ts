// graphql/entityOperations-fixed.ts
// Fixed version using correct auto-generated query names

// =========================================================================
// CONVENIENCE WRAPPERS (Using correct auto-generated operations)
// =========================================================================

export const entityQueries = {
  // Wrapper for listEntities with active filter
  listActiveEntities: /* GraphQL */ `
    query ListActiveEntities {
      listEntities(filter: { isActive: { eq: true } }) {
        items {
          id
          entityName
          gameUrlDomain
          gameUrlPath
          entityLogo
          isActive
        }
      }
    }
  `,

  // Get entity with nested relationship counts
  getEntityWithStats: /* GraphQL */ `
    query GetEntityWithStats($id: ID!) {
      getEntity(id: $id) {
        id
        entityName
        gameUrlDomain
        gameUrlPath
        entityLogo
        isActive
        games {
          items {
            id
          }
        }
        venues {
          items {
            id
          }
        }
        scraperStates {
          items {
            id
            isRunning
            lastRunEndTime
          }
        }
      }
    }
  `,

  // Get games for entity using filter (since gamesByEntity doesn't exist)
  getEntityGames: /* GraphQL */ `
    query GetEntityGames(
      $entityId: ID!
      $limit: Int
      $nextToken: String
    ) {
      listGames(
        filter: { entityId: { eq: $entityId } }
        limit: $limit
        nextToken: $nextToken
      ) {
        items {
          id
          name
          gameStartDateTime
          gameStatus
          registrationStatus
          gameType
          venueId
          venue {
            name
          }
          prizepool
          totalEntries
        }
        nextToken
      }
    }
  `,

  // Get venues for entity using filter
  getEntityVenues: /* GraphQL */ `
    query GetEntityVenues(
      $entityId: ID!
      $limit: Int
      $nextToken: String
    ) {
      listVenues(
        filter: { entityId: { eq: $entityId } }
        limit: $limit
        nextToken: $nextToken
      ) {
        items {
          id
          name
          aliases
          address
          city
          country
        }
        nextToken
      }
    }
  `,

  // Using the correct auto-generated query name
  getEntityScraperStates: /* GraphQL */ `
    query GetEntityScraperStates($entityId: ID!) {
      scraperStatesByEntityId(entityId: $entityId) {
        items {
          id
          isRunning
          lastScannedId
          lastRunStartTime
          lastRunEndTime
          consecutiveBlankCount
          totalScraped
          totalErrors
          enabled
        }
      }
    }
  `,

  // Using the correct auto-generated query name
  getEntityScrapeURLs: /* GraphQL */ `
    query GetEntityScrapeURLs($entityId: ID!) {
      scrapeURLSByEntityId(entityId: $entityId) {
        items {
          id
          url
          status
          doNotScrape
        }
      }
    }
  `
};

// =========================================================================
// CUSTOM OPERATIONS (Fixed to remove entityId from fetchTournamentData)
// =========================================================================

export const entityAwareOperations = {
  // Uses existing saveTournamentData mutation
  saveTournamentDataWithEntity: /* GraphQL */ `
    mutation SaveTournamentDataWithEntity($input: SaveTournamentInput!) {
      saveTournamentData(input: $input) {
        id
        name
        entityId
        gameStartDateTime
        gameStatus
        venueId
        venue {
          id
          name
        }
      }
    }
  `,

  // Fixed: fetchTournamentData doesn't accept entityId
  fetchTournamentDataForEntity: /* GraphQL */ `
    mutation FetchTournamentDataForEntity($url: AWSURL!) {
      fetchTournamentData(url: $url) {
        name
        tournamentId
        entityId
        gameStatus
        venueMatch {
          autoAssignedVenue {
            id
            name
            score
          }
          suggestions {
            id
            name
            score
          }
        }
      }
    }
  `
};

// =========================================================================
// HELPER FUNCTIONS (Fixed to use correct queries)
// =========================================================================

export const entityHelpers = {
  /**
   * Build filter for entity-scoped queries
   */
  buildEntityFilter: (entityId: string, additionalFilters?: any) => {
    return {
      and: [
        { entityId: { eq: entityId } },
        ...(additionalFilters ? [additionalFilters] : [])
      ]
    };
  },

  /**
   * Get entity statistics using correct queries
   */
  getEntityStats: async (entityId: string, client: any) => {
    try {
      const [gamesResult, venuesResult] = await Promise.all([
        // Use listGames with filter instead of gamesByEntity
        client.graphql({
          query: /* GraphQL */ `
            query CountEntityGames($entityId: ID!) {
              listGames(
                filter: { entityId: { eq: $entityId } }
                limit: 1000
              ) {
                items { id }
              }
            }
          `,
          variables: { entityId }
        }),
        // Use listVenues with filter instead of venuesByEntity
        client.graphql({
          query: /* GraphQL */ `
            query CountEntityVenues($entityId: ID!) {
              listVenues(
                filter: { entityId: { eq: $entityId } }
                limit: 100
              ) {
                items { id }
              }
            }
          `,
          variables: { entityId }
        })
      ]);

      // Note: Can't filter players by primaryEntityId until it's added to schema
      // For now, return 0 for player count
      
      return {
        gamesCount: gamesResult.data.listGames?.items?.length || 0,
        venuesCount: venuesResult.data.listVenues?.items?.length || 0,
        playersCount: 0 // Will be fixed once primaryEntityId is added to schema
      };
    } catch (error) {
      console.error('Error getting entity stats:', error);
      return {
        gamesCount: 0,
        venuesCount: 0,
        playersCount: 0
      };
    }
  },

  /**
   * Extract entity ID from URL
   */
  extractEntityFromUrl: async (url: string, entities: any[]) => {
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname;
      
      const matchingEntity = entities.find(e => 
        e.gameUrlDomain === domain || 
        domain.includes(e.gameUrlDomain)
      );
      
      return matchingEntity?.id || null;
    } catch (error) {
      console.error('Error extracting entity from URL:', error);
      return null;
    }
  },

  /**
   * Validate entity access permissions
   */
  validateEntityAccess: (userEntityIds: string[], targetEntityId: string): boolean => {
    return userEntityIds.includes(targetEntityId) || userEntityIds.includes('*');
  }
};

// =========================================================================
// TYPE DEFINITIONS
// =========================================================================

export interface EntityInput {
  entityName: string;
  gameUrlDomain: string;
  gameUrlPath: string;
  entityLogo?: string;
  isActive?: boolean;
}

export interface EntityUpdateInput {
  id: string;
  entityName?: string;
  gameUrlDomain?: string;
  gameUrlPath?: string;
  entityLogo?: string;
  isActive?: boolean;
  _version?: number;
}

export interface EntityStats {
  gamesCount: number;
  venuesCount: number;
  playersCount: number;
  assetsCount?: number;
  scrapeURLsCount?: number;
}

export interface EntityWithStats {
  id: string;
  entityName: string;
  gameUrlDomain: string;
  gameUrlPath: string;
  entityLogo?: string;
  isActive: boolean;
  stats: EntityStats;
}

// =========================================================================
// USAGE NOTES
// =========================================================================

/**
 * IMPORTANT: Query names that actually work:
 * 
 * ✅ Auto-generated from @model:
 * - getEntity(id)
 * - listEntities(filter, limit, nextToken)
 * - createEntity(input)
 * - updateEntity(input)
 * - deleteEntity(input)
 * 
 * ✅ Auto-generated from indexes:
 * - scraperStatesByEntityId(entityId)
 * - scrapeURLsByEntityId(entityId)
 * 
 * ❌ These DON'T exist (use listGames/listVenues with filters):
 * - gamesByEntity
 * - venuesByEntity
 * 
 * ❌ Player filtering by primaryEntityId won't work until schema is updated
 */