// src/graphql/scraperManagement.ts
// Complete GraphQL operations for scraper management including S3 operations
// Organized version with all queries, mutations, and subscriptions

export const scraperManagementQueries = {
  // ===================================================================
  // CUSTOM LAMBDA-BASED QUERIES (prefix with 'custom' to avoid conflicts)
  // ===================================================================
  
  getScraperJobsReport: /* GraphQL */ `
    query CustomGetScraperJobsReport($status: ScraperJobStatus, $limit: Int, $nextToken: String) {
      getScraperJobsReport(status: $status, limit: $limit, nextToken: $nextToken) {
        items {
          id
          jobId
          status
          triggerSource
          triggeredBy
          startTime
          endTime
          durationSeconds
          maxGames
          targetURLs
          isFullScan
          startId
          endId
          totalURLsProcessed
          newGamesScraped
          gamesUpdated
          gamesSkipped
          errors
          blanks
          averageScrapingTime
          successRate
          errorMessages
          failedURLs
          urlResults {
            url
            tournamentId
            status
            gameName
            processingTime
            error
          }
        }
        nextToken
      }
    }
  `,

  fetchScrapeURLDetails: /* GraphQL */ `
    query CustomFetchScrapeURLDetails($url: AWSURL!) {
      fetchScrapeURLDetails(url: $url) {
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
        consecutiveFailures
        lastScrapeStatus
        lastScrapeMessage
        lastScrapeJobId
        lastDataHash
        hasDataChanges
        doNotScrape
        sourceDataIssue
        gameDataVerified
        missingKeysFromScrape
        sourceSystem
        gameId
        gameName
        gameStatus
        venueId
        venueName
      }
    }
  `,

  searchScrapeURLs: /* GraphQL */ `
    query CustomSearchScrapeURLs($status: ScrapeURLStatus, $limit: Int, $nextToken: String) {
      searchScrapeURLs(status: $status, limit: $limit, nextToken: $nextToken) {
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
          lastScrapeMessage
          doNotScrape
          gameId
          gameName
          venueId
          venueName
        }
        nextToken
      }
    }
  `,

  getScraperMetrics: /* GraphQL */ `
    query CustomGetScraperMetrics($timeRange: TimeRange!) {
      getScraperMetrics(timeRange: $timeRange) {
        totalJobs
        successfulJobs
        failedJobs
        averageJobDuration
        totalURLsScraped
        successRate
        topErrors {
          errorType
          count
          urls
        }
        hourlyActivity {
          hour
          jobCount
          urlsScraped
          successRate
        }
      }
    }
  `,

  getUpdateCandidateURLs: /* GraphQL */ `
    query CustomGetUpdateCandidateURLs($limit: Int) {
      getUpdateCandidateURLs(limit: $limit) {
        id
        url
        tournamentId
        status
        lastScrapedAt
        doNotScrape
        gameId
      }
    }
  `,

  // ===================================================================
  // S3 STORAGE QUERIES  
  // ===================================================================

  getS3StorageHistory: /* GraphQL */ `
    query CustomGetS3StorageHistory($tournamentId: Int!, $entityId: ID!, $limit: Int) {
      getS3StorageHistory(tournamentId: $tournamentId, entityId: $entityId, limit: $limit) {
        items {
          id
          scrapeURLId
          url
          tournamentId
          entityId
          s3Key
          s3Bucket
          scrapedAt
          contentSize
          contentHash
          etag
          lastModified
          headers
          dataExtracted
          gameId
          isManualUpload
          uploadedBy
          notes
          createdAt
          updatedAt
        }
        nextToken
      }
    }
  `,

  viewS3Content: /* GraphQL */ `
    query CustomViewS3Content($s3Key: String!) {
      viewS3Content(s3Key: $s3Key) {
        s3Key
        html
        metadata
        size
        lastModified
      }
    }
  `,

  getCachingStats: /* GraphQL */ `
    query CustomGetCachingStats($entityId: ID!, $timeRange: TimeRange) {
      getCachingStats(entityId: $entityId, timeRange: $timeRange) {
        totalURLs
        urlsWithETags
        urlsWithLastModified
        totalCacheHits
        totalCacheMisses
        averageCacheHitRate
        storageUsedMB
        recentCacheActivity {
          url
          timestamp
          action
          reason
        }
      }
    }
  `,

  listStoredHTML: /* GraphQL */ `
    query CustomListStoredHTML($url: AWSURL!, $limit: Int) {
      listStoredHTML(url: $url, limit: $limit) {
        items {
          id
          scrapeURLId
          url
          tournamentId
          entityId
          s3Key
          s3Bucket
          scrapedAt
          contentSize
          contentHash
          isManualUpload
          uploadedBy
          notes
          dataExtracted
          createdAt
          updatedAt
        }
        nextToken
      }
    }
  `,

  // ===================================================================
  // AUTO-GENERATED QUERIES (use Amplify's names with Custom prefix)
  // ===================================================================
  
  // Get a single S3Storage by ID
  getS3Storage: /* GraphQL */ `
    query GetS3Storage($id: ID!) {
      getS3Storage(id: $id) {
        id
        scrapeURLId
        url
        tournamentId
        entityId
        s3Key
        s3Bucket
        scrapedAt
        contentSize
        contentHash
        etag
        lastModified
        headers
        dataExtracted
        gameId
        isManualUpload
        uploadedBy
        notes
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
      }
    }
  `,

  // List S3Storage items
  listS3Storages: /* GraphQL */ `
    query ListS3Storages(
      $filter: ModelS3StorageFilterInput
      $limit: Int
      $nextToken: String
    ) {
      listS3Storages(filter: $filter, limit: $limit, nextToken: $nextToken) {
        items {
          id
          scrapeURLId
          url
          tournamentId
          entityId
          s3Key
          s3Bucket
          scrapedAt
          contentSize
          contentHash
          etag
          lastModified
          headers
          dataExtracted
          gameId
          isManualUpload
          uploadedBy
          notes
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
        }
        nextToken
      }
    }
  `,

  // List S3Storage by tournamentId
  s3StoragesByTournamentIdAndScrapedAt: /* GraphQL */ `
    query S3StoragesByTournamentIdAndScrapedAt(
      $tournamentId: Int!
      $scrapedAt: ModelStringKeyConditionInput
      $sortDirection: ModelSortDirection
      $filter: ModelS3StorageFilterInput
      $limit: Int
      $nextToken: String
    ) {
      s3StoragesByTournamentIdAndScrapedAt(
        tournamentId: $tournamentId
        scrapedAt: $scrapedAt
        sortDirection: $sortDirection
        filter: $filter
        limit: $limit
        nextToken: $nextToken
      ) {
        items {
          id
          scrapeURLId
          url
          tournamentId
          entityId
          s3Key
          s3Bucket
          scrapedAt
          contentSize
          contentHash
          etag
          lastModified
          headers
          dataExtracted
          gameId
          isManualUpload
          uploadedBy
          notes
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
        }
        nextToken
      }
    }
  `,

  // List S3Storage by entityId
  s3StoragesByEntityAndScrapedAt: /* GraphQL */ `
    query S3StoragesByEntityAndScrapedAt(
      $entityId: ID!
      $scrapedAt: ModelStringKeyConditionInput
      $sortDirection: ModelSortDirection
      $filter: ModelS3StorageFilterInput
      $limit: Int
      $nextToken: String
    ) {
      s3StoragesByEntityAndScrapedAt(
        entityId: $entityId
        scrapedAt: $scrapedAt
        sortDirection: $sortDirection
        filter: $filter
        limit: $limit
        nextToken: $nextToken
      ) {
        items {
          id
          scrapeURLId
          url
          tournamentId
          entityId
          s3Key
          s3Bucket
          scrapedAt
          contentSize
          contentHash
          etag
          lastModified
          headers
          dataExtracted
          gameId
          isManualUpload
          uploadedBy
          notes
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
        }
        nextToken
      }
    }
  `,
  
  // Get a single ScrapeURL by ID (with S3 fields if they exist)
  getScrapeURL: /* GraphQL */ `
    query CustomGetScrapeURL($id: ID!) {
      getScrapeURL(id: $id) {
        id
        url
        tournamentId
        doNotScrape
        sourceDataIssue
        gameDataVerified
        missingKeysFromScrape
        sourceSystem
        status
        placedIntoDatabase
        firstScrapedAt
        lastScrapedAt
        lastSuccessfulScrapeAt
        timesScraped
        timesSuccessful
        timesFailed
        consecutiveFailures
        lastScrapeStatus
        lastScrapeMessage
        lastScrapeJobId
        gameId
        gameName
        gameStatus
        venueId
        venueName
        lastDataHash
        hasDataChanges
        lastScrapingTime
        # S3 fields
        etag
        lastModifiedHeader
        contentHash
        s3StoragePrefix
        latestS3Key
        s3StorageEnabled
        lastContentChangeAt
        totalContentChanges
        lastHeaderCheckAt
        cachedContentUsedCount
        entityId
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
      }
    }
  `,

  // List ScrapeAttempts by ScrapeURL ID
  listScrapeAttemptsByURL: /* GraphQL */ `
    query CustomListScrapeAttemptsByURL($scrapeURLId: ID!, $attemptTime: ModelStringKeyConditionInput, $sortDirection: ModelSortDirection, $filter: ModelScrapeAttemptFilterInput, $limit: Int, $nextToken: String) {
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
          scrapeURLId
          status
          processingTime
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
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
        }
        nextToken
      }
    }
  `,

  // List ScrapeAttempts by ScraperJob ID
  listScrapeAttemptsByJob: /* GraphQL */ `
    query CustomListScrapeAttemptsByJob($scraperJobId: ID!, $attemptTime: ModelStringKeyConditionInput, $sortDirection: ModelSortDirection, $filter: ModelScrapeAttemptFilterInput, $limit: Int, $nextToken: String) {
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
          scrapeURLId
          status
          processingTime
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
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
        }
        nextToken
      }
    }
  `,
};

export const scraperManagementMutations = {
  // ===================================================================
  // CUSTOM LAMBDA-BASED MUTATIONS (prefix with 'custom')
  // ===================================================================
  
  startScraperJob: /* GraphQL */ `
    mutation CustomStartScraperJob($input: StartScraperJobInput!) {
      startScraperJob(input: $input) {
        id
        jobId
        status
        triggerSource
        triggeredBy
        startTime
        endTime
        durationSeconds
        maxGames
        isFullScan
        startId
        endId
        totalURLsProcessed
        newGamesScraped
        gamesUpdated
        gamesSkipped
        errors
        blanks
        averageScrapingTime
        successRate
        errorMessages
        failedURLs
        urlResults {
          url
          tournamentId
          status
          gameName
          processingTime
          error
        }
      }
    }
  `,

  cancelScraperJob: /* GraphQL */ `
    mutation CustomCancelScraperJob($jobId: String!) {
      cancelScraperJob(jobId: $jobId) {
        id
        jobId
        status
        triggerSource
        startTime
        endTime
        totalURLsProcessed
        newGamesScraped
        gamesUpdated
        errors
        successRate
      }
    }
  `,

  modifyScrapeURLStatus: /* GraphQL */ `
    mutation CustomModifyScrapeURLStatus($url: AWSURL!, $status: ScrapeURLStatus, $doNotScrape: Boolean) {
      modifyScrapeURLStatus(url: $url, status: $status, doNotScrape: $doNotScrape) {
        id
        url
        tournamentId
        status
        lastScrapedAt
        lastSuccessfulScrapeAt
        timesScraped
        timesSuccessful
        timesFailed
        lastScrapeMessage
        doNotScrape
        gameId
      }
    }
  `,

  bulkModifyScrapeURLs: /* GraphQL */ `
    mutation CustomBulkModifyScrapeURLs($urls: [AWSURL!]!, $status: ScrapeURLStatus, $doNotScrape: Boolean) {
      bulkModifyScrapeURLs(urls: $urls, status: $status, doNotScrape: $doNotScrape) {
        id
        url
        tournamentId
        status
        doNotScrape
        gameId
      }
    }
  `,

  // ===================================================================
  // EXISTING SCRAPER MUTATIONS
  // ===================================================================
  
  fetchTournamentData: /* GraphQL */ `
    mutation CustomFetchTournamentData($url: AWSURL!) {
      fetchTournamentData(url: $url) {
        name
        gameStartDateTime
        gameEndDateTime
        gameStatus
        registrationStatus
        gameType
        gameVariant
        tournamentType
        prizepool
        revenueByBuyIns
        profitLoss
        buyIn
        rake
        totalRake
        startingStack
        hasGuarantee
        guaranteeAmount
        guaranteeOverlay
        guaranteeSurplus
        totalEntries
        totalRebuys
        totalAddons
        totalDuration
        playersRemaining
        totalChipsInPlay
        averagePlayerStack
        seriesName
        isRegular
        isSeries
        isSatellite
        gameFrequency
        gameTags
        rawHtml
        isNewStructure
        structureLabel
        foundKeys
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
        existingGameId
        doNotScrape
      }
    }
  `,

  saveTournamentData: /* GraphQL */ `
    mutation CustomSaveTournamentData($input: SaveTournamentInput!) {
      saveTournamentData(input: $input) {
        id
        name
        gameType
        gameVariant
        gameStatus
        gameStartDateTime
        gameEndDateTime
        venueId
        sourceUrl
        tournamentId
        venueAssignmentStatus
        requiresVenueAssignment
      }
    }
  `,

  controlScraperOperation: /* GraphQL */ `
    mutation CustomControlScraperOperation($operation: ScraperOperation!) {
      controlScraperOperation(operation: $operation) {
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
        results {
          newGamesScraped
          gamesUpdated
          errors
          blanks
        }
      }
    }
  `,

  triggerAutoScraping: /* GraphQL */ `
    mutation CustomTriggerAutoScraping($maxGames: Int) {
      triggerAutoScraping(maxGames: $maxGames) {
        success
        message
        state {
          id
          isRunning
          lastScannedId
          enabled
        }
        results {
          newGamesScraped
          gamesUpdated
          errors
          blanks
        }
      }
    }
  `,

  // ===================================================================
  // S3 STORAGE MUTATIONS
  // ===================================================================

  uploadManualHTML: /* GraphQL */ `
    mutation CustomUploadManualHTML($input: ManualHTMLUploadInput!) {
      uploadManualHTML(input: $input) {
        id
        scrapeURLId
        url
        tournamentId
        entityId
        s3Key
        s3Bucket
        scrapedAt
        contentSize
        contentHash
        etag
        lastModified
        headers
        dataExtracted
        gameId
        isManualUpload
        uploadedBy
        notes
        createdAt
        updatedAt
      }
    }
  `,

  reScrapeFromCache: /* GraphQL */ `
    mutation CustomReScrapeFromCache($input: ReScrapeFromCacheInput!) {
      reScrapeFromCache(input: $input) {
        name
        gameStartDateTime
        gameEndDateTime
        gameStatus
        registrationStatus
        gameType
        gameVariant
        tournamentType
        prizepool
        revenueByBuyIns
        profitLoss
        buyIn
        rake
        totalRake
        startingStack
        hasGuarantee
        guaranteeAmount
        guaranteeOverlay
        guaranteeSurplus
        totalEntries
        totalRebuys
        totalAddons
        totalDuration
        playersRemaining
        totalChipsInPlay
        averagePlayerStack
        seriesName
        isRegular
        isSeries
        isSatellite
        gameFrequency
        gameTags
        rawHtml
        isNewStructure
        structureLabel
        foundKeys
        existingGameId
        doNotScrape
      }
    }
  `,

  // ===================================================================
  // AUTO-GENERATED S3STORAGE MUTATIONS
  // ===================================================================

  createS3Storage: /* GraphQL */ `
    mutation CreateS3Storage(
      $input: CreateS3StorageInput!
      $condition: ModelS3StorageConditionInput
    ) {
      createS3Storage(input: $input, condition: $condition) {
        id
        scrapeURLId
        url
        tournamentId
        entityId
        s3Key
        s3Bucket
        scrapedAt
        contentSize
        contentHash
        etag
        lastModified
        headers
        dataExtracted
        gameId
        isManualUpload
        uploadedBy
        notes
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
      }
    }
  `,

  updateS3Storage: /* GraphQL */ `
    mutation UpdateS3Storage(
      $input: UpdateS3StorageInput!
      $condition: ModelS3StorageConditionInput
    ) {
      updateS3Storage(input: $input, condition: $condition) {
        id
        scrapeURLId
        url
        tournamentId
        entityId
        s3Key
        s3Bucket
        scrapedAt
        contentSize
        contentHash
        etag
        lastModified
        headers
        dataExtracted
        gameId
        isManualUpload
        uploadedBy
        notes
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
      }
    }
  `,

  deleteS3Storage: /* GraphQL */ `
    mutation DeleteS3Storage(
      $input: DeleteS3StorageInput!
      $condition: ModelS3StorageConditionInput
    ) {
      deleteS3Storage(input: $input, condition: $condition) {
        id
        scrapeURLId
        url
        tournamentId
        entityId
        s3Key
        s3Bucket
        scrapedAt
        contentSize
        contentHash
        etag
        lastModified
        headers
        dataExtracted
        gameId
        isManualUpload
        uploadedBy
        notes
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
      }
    }
  `,


};

export const scraperManagementSubscriptions = {
  // ===================================================================
  // CUSTOM SUBSCRIPTIONS (prefix with 'custom')
  // ===================================================================
  
  onScraperJobUpdate: /* GraphQL */ `
    subscription CustomOnScraperJobUpdate($jobId: String) {
      onScraperJobUpdate(jobId: $jobId) {
        id
        jobId
        status
        triggerSource
        startTime
        endTime
        durationSeconds
        maxGames
        isFullScan
        startId
        endId
        totalURLsProcessed
        newGamesScraped
        gamesUpdated
        gamesSkipped
        errors
        blanks
        successRate
        errorMessages
      }
    }
  `,

  onScrapeURLStatusChange: /* GraphQL */ `
    subscription CustomOnScrapeURLStatusChange($url: AWSURL) {
      onScrapeURLStatusChange(url: $url) {
        id
        url
        tournamentId
        status
        lastScrapedAt
        doNotScrape
        gameId
      }
    }
  `,

  // ===================================================================
  // AUTO-GENERATED S3STORAGE SUBSCRIPTIONS
  // ===================================================================

  onCreateS3Storage: /* GraphQL */ `
    subscription OnCreateS3Storage($filter: ModelSubscriptionS3StorageFilterInput) {
      onCreateS3Storage(filter: $filter) {
        id
        scrapeURLId
        url
        tournamentId
        entityId
        s3Key
        s3Bucket
        scrapedAt
        contentSize
        contentHash
        etag
        lastModified
        headers
        dataExtracted
        gameId
        isManualUpload
        uploadedBy
        notes
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
      }
    }
  `,

  onUpdateS3Storage: /* GraphQL */ `
    subscription OnUpdateS3Storage($filter: ModelSubscriptionS3StorageFilterInput) {
      onUpdateS3Storage(filter: $filter) {
        id
        scrapeURLId
        url
        tournamentId
        entityId
        s3Key
        s3Bucket
        scrapedAt
        contentSize
        contentHash
        etag
        lastModified
        headers
        dataExtracted
        gameId
        isManualUpload
        uploadedBy
        notes
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
      }
    }
  `,

  onDeleteS3Storage: /* GraphQL */ `
    subscription OnDeleteS3Storage($filter: ModelSubscriptionS3StorageFilterInput) {
      onDeleteS3Storage(filter: $filter) {
        id
        scrapeURLId
        url
        tournamentId
        entityId
        s3Key
        s3Bucket
        scrapedAt
        contentSize
        contentHash
        etag
        lastModified
        headers
        dataExtracted
        gameId
        isManualUpload
        uploadedBy
        notes
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
      }
    }
  `
};

// ===================================================================
// TYPE DEFINITIONS FOR S3 OPERATIONS
// ===================================================================

export interface UploadManualHTMLInput {
  htmlContent: string;
  url: string;
  tournamentId: number;
  entityId: string;
  notes?: string;
  uploadedBy?: string;
}

export interface ReScrapeFromCacheInput {
  s3Key: string;
  saveToDatabase?: boolean;
}

export enum TimeRange {
  LAST_HOUR = 'LAST_HOUR',
  LAST_24_HOURS = 'LAST_24_HOURS',
  LAST_7_DAYS = 'LAST_7_DAYS',
  LAST_30_DAYS = 'LAST_30_DAYS'
}

export interface S3StorageItem {
  id: string;
  scrapeURLId?: string;
  url: string;
  tournamentId: number;
  entityId: string;
  s3Key: string;
  s3Bucket: string;
  scrapedAt: string;
  contentSize: number;
  contentHash: string;
  isManualUpload: boolean;
  uploadedBy?: string;
  notes?: string;
  dataExtracted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface S3ContentResponse {
  s3Key: string;
  html: string;
  metadata: any;
  size: number;
  lastModified: string;
}

export interface CacheActivity {
  url: string;
  timestamp: string;
  action: 'HIT' | 'MISS';
  reason: string;
}

export interface CachingStats {
  totalURLs: number;
  urlsWithETags: number;
  urlsWithLastModified: number;
  totalCacheHits: number;
  totalCacheMisses: number;
  averageCacheHitRate: number;
  storageUsedMB: number;
  recentCacheActivity: CacheActivity[];
}

export interface S3StorageHistoryResponse {
  items: S3StorageItem[];
  nextToken?: string;
}

export interface S3StorageListResponse {
  items: S3StorageItem[];
  nextToken?: string;
}

export interface RefreshResponse {
  message: string;
  status: string;
}


// ===================================================================
// EXPORT ALL OPERATIONS AS DEFAULT
// ===================================================================

const scraperManagement = {
  queries: scraperManagementQueries,
  mutations: scraperManagementMutations,
  subscriptions: scraperManagementSubscriptions,
};

export default scraperManagement;