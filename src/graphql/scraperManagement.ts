// src/graphql/scraperManagement.ts
// Consolidated minimal GraphQL queries and mutations for scraper management
//
// WHY MINIMAL QUERIES?
// ====================
// The auto-generated Amplify queries fetch deeply nested relationships like:
// entity.entityMetrics, entity.venueMetrics, entity.tournamentSeriesMetrics, etc.
// Some records in these metrics tables have NULL _version and _lastChangedAt fields
// (due to Lambda functions writing directly to DynamoDB without these fields).
// This causes GraphQL errors like:
//   "Cannot return null for non-nullable type: 'Int' within parent 'EntityMetrics'"
//
// These minimal queries avoid fetching those problematic nested relationships.

// ===================================================================
// MINIMAL SCRAPER JOB QUERIES
// ===================================================================

/**
 * Minimal query for fetching scraper jobs report
 * Avoids deeply nested entity.entityMetrics, entity.venueMetrics, etc.
 */
export const getScraperJobsReportMinimal = /* GraphQL */ `
  query GetScraperJobsReportMinimal(
    $entityId: ID
    $status: ScraperJobStatus
    $limit: Int
    $nextToken: String
  ) {
    getScraperJobsReport(
      entityId: $entityId
      status: $status
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        jobId
        entityId
        triggerSource
        triggeredBy
        startTime
        endTime
        status
        stopReason
        startId
        endId
        currentId
        totalURLsProcessed
        newGamesScraped
        gamesUpdated
        gamesSkipped
        errors
        blanks
        notFoundCount
        consecutiveNotFound
        consecutiveErrors
        consecutiveBlanks
        s3CacheHits
        successRate
        averageScrapingTime
        durationSeconds
        isFullScan
        maxGames
        lastErrorMessage
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        entity {
          id
          entityName
          gameUrlDomain
          gameUrlPath
          entityLogo
        }
      }
      nextToken
      totalCount
    }
  }
`;

/**
 * Minimal query for single scraper job by ID
 */
export const getScraperJobMinimal = /* GraphQL */ `
  query GetScraperJobMinimal($id: ID!) {
    getScraperJob(id: $id) {
      id
      jobId
      entityId
      triggerSource
      triggeredBy
      startTime
      endTime
      status
      stopReason
      startId
      endId
      currentId
      totalURLsProcessed
      newGamesScraped
      gamesUpdated
      gamesSkipped
      errors
      blanks
      notFoundCount
      consecutiveNotFound
      consecutiveErrors
      consecutiveBlanks
      s3CacheHits
      successRate
      averageScrapingTime
      durationSeconds
      isFullScan
      maxGames
      lastErrorMessage
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      entity {
        id
        entityName
        gameUrlDomain
        gameUrlPath
        entityLogo
      }
    }
  }
`;

// ===================================================================
// MINIMAL SCRAPER JOB MUTATIONS
// ===================================================================

/**
 * Minimal mutation for starting a scraper job
 * Avoids returning deeply nested entity metrics
 * Note: errorMessages, targetURLs, urlResults, failedURLs removed as they require sub-selections
 */
export const startScraperJobMinimal = /* GraphQL */ `
  mutation StartScraperJobMinimal($input: StartScraperJobInput!) {
    startScraperJob(input: $input) {
      id
      jobId
      entityId
      triggerSource
      triggeredBy
      startTime
      endTime
      status
      stopReason
      startId
      endId
      currentId
      totalURLsProcessed
      newGamesScraped
      gamesUpdated
      gamesSkipped
      errors
      blanks
      notFoundCount
      consecutiveNotFound
      consecutiveErrors
      consecutiveBlanks
      s3CacheHits
      successRate
      averageScrapingTime
      durationSeconds
      isFullScan
      maxGames
      lastErrorMessage
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      entity {
        id
        entityName
        gameUrlDomain
        gameUrlPath
        entityLogo
      }
    }
  }
`;

/**
 * Minimal mutation for cancelling a scraper job
 */
export const cancelScraperJobMinimal = /* GraphQL */ `
  mutation CancelScraperJobMinimal($jobId: ID!) {
    cancelScraperJob(jobId: $jobId) {
      id
      jobId
      status
      stopReason
      endTime
      totalURLsProcessed
      errors
      lastErrorMessage
      _version
    }
  }
`;

// ===================================================================
// MINIMAL ENTITY QUERIES
// ===================================================================

/**
 * Get entity without nested metrics relationships
 */
export const getEntityMinimal = /* GraphQL */ `
  query GetEntityMinimal($id: ID!) {
    getEntity(id: $id) {
      id
      entityName
      gameUrlDomain
      gameUrlPath
      entityLogo
      isActive
      defaultVenueId
      gameCount
      venueCount
      lastGameAddedAt
      lastDataRefreshedAt
      seriesGameCount
      lastSeriesGameAddedAt
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
    }
  }
`;

/**
 * List entities without nested metrics relationships
 */
export const listEntitiesMinimal = /* GraphQL */ `
  query ListEntitiesMinimal(
    $filter: ModelEntityFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listEntities(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        entityName
        gameUrlDomain
        gameUrlPath
        entityLogo
        isActive
        defaultVenueId
        gameCount
        venueCount
        lastGameAddedAt
        lastDataRefreshedAt
        seriesGameCount
        lastSeriesGameAddedAt
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
      }
      nextToken
    }
  }
`;

// ===================================================================
// SCRAPE ATTEMPTS QUERIES
// ===================================================================

/**
 * Query for listing scrape attempts by job
 */
export const listScrapeAttemptsByJob = /* GraphQL */ `
  query ListScrapeAttemptsByJob(
    $scraperJobId: ID!
    $attemptTime: ModelStringKeyConditionInput
    $sortDirection: ModelSortDirection
    $filter: ModelScrapeAttemptFilterInput
    $limit: Int
    $nextToken: String
  ) {
    scrapeAttemptsByScraperJobIdAndAttemptTime(
      scraperJobId: $scraperJobId
      attemptTime: $attemptTime
      sortDirection: $sortDirection
      filter: $filter
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        url
        tournamentId
        attemptTime
        scraperJobId
        status
        gameName
        gameStatus
        registrationStatus
        dataHash
        hasChanges
        errorMessage
        errorType
        gameId
        wasNewGame
        fieldsUpdated
        foundKeys
        structureLabel
        processingTime
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;

/**
 * Query for listing scrape attempts by URL
 */
export const listScrapeAttemptsByURL = /* GraphQL */ `
  query ListScrapeAttemptsByURL(
    $scrapeURLId: ID!
    $attemptTime: ModelStringKeyConditionInput
    $sortDirection: ModelSortDirection
    $filter: ModelScrapeAttemptFilterInput
    $limit: Int
    $nextToken: String
  ) {
    scrapeAttemptsByScrapeURLIdAndAttemptTime(
      scrapeURLId: $scrapeURLId
      attemptTime: $attemptTime
      sortDirection: $sortDirection
      filter: $filter
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        url
        tournamentId
        attemptTime
        scraperJobId
        status
        gameName
        gameStatus
        registrationStatus
        dataHash
        hasChanges
        errorMessage
        errorType
        gameId
        wasNewGame
        fieldsUpdated
        foundKeys
        structureLabel
        processingTime
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;

// ===================================================================
// CUSTOM LAMBDA QUERIES
// ===================================================================

export const getScraperControlStateCustom = /* GraphQL */ `
  query GetScraperControlStateCustom($entityId: ID) {
    getScraperControlState(entityId: $entityId) {
      success
      message
      state {
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
`;

export const listScraperJobsCustom = /* GraphQL */ `
  query ListScraperJobsCustom(
    $entityId: ID
    $status: ScraperJobStatus
    $startTime: AWSDateTime
    $endTime: AWSDateTime
    $limit: Int
    $nextToken: String
  ) {
    listScraperJobs(
      entityId: $entityId
      status: $status
      startTime: $startTime
      endTime: $endTime
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        jobId
        status
        triggerSource
        triggeredBy
        startTime
        endTime
        durationSeconds
        totalURLsProcessed
        newGamesScraped
        gamesUpdated
        gamesSkipped
        errors
        blanks
        successRate
        entityId
      }
      nextToken
    }
  }
`;

export const listScrapeURLsCustom = /* GraphQL */ `
  query ListScrapeURLsCustom(
    $entityId: ID
    $status: ScrapeURLStatus
    $limit: Int
    $nextToken: String
  ) {
    listScrapeURLs(
      entityId: $entityId
      status: $status
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        url
        tournamentId
        status
        placedIntoDatabase
        firstScrapedAt
        lastScrapedAt
        lastSuccessfulScrapeAt
        timesScraped
        timesSuccessful
        timesFailed
        lastScrapeStatus
        gameName
        gameStatus
        entityId
      }
      nextToken
    }
  }
`;

// ===================================================================
// CONVENIENCE OBJECT FOR BACKWARDS COMPATIBILITY
// ===================================================================

export const scraperManagementQueries = {
  // Minimal queries (avoid nested metrics)
  getScraperJobsReportMinimal,
  getScraperJobMinimal,
  getEntityMinimal,
  listEntitiesMinimal,
  
  // Scrape attempts
  listScrapeAttemptsByJob,
  listScrapeAttemptsByURL,
  
  // Custom Lambda queries
  getScraperControlStateCustom,
  listScraperJobsCustom,
  listScrapeURLsCustom,
};

export const scraperManagementMutations = {
  startScraperJobMinimal,
  cancelScraperJobMinimal,
};

export default {
  queries: scraperManagementQueries,
  mutations: scraperManagementMutations,
};