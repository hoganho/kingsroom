// src/graphql/scraperManagement.ts
// Custom GraphQL operations for scraper management
// Uses correct field names from deployed schema and avoids name conflicts

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
  // AUTO-GENERATED QUERIES (use different names to avoid conflicts)
  // ===================================================================
  
  // Get a single ScrapeURL by ID
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
  `
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
  // EXISTING SCRAPER MUTATIONS (prefix with 'custom')
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
  `
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
  `
};