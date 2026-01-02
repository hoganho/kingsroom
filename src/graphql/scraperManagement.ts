// src/graphql/scraperManagement.ts
// Minimal version - only custom Lambda queries that won't conflict

export const scraperManagementQueries = {
  // ===================================================================
  // CUSTOM LAMBDA QUERIES - These use Lambda resolvers, not auto-generated
  // ===================================================================
  
  // These are Lambda-based queries defined in your schema
  getScraperControlStateCustom: /* GraphQL */ `
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
  `,

  // Lambda-based list query for scraper jobs
  listScraperJobsCustom: /* GraphQL */ `
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
  `,

  // Lambda-based list query for scrape URLs
  listScrapeURLsCustom: /* GraphQL */ `
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
  `,

  // ===================================================================
  // MINIMAL SCRAPER JOBS REPORT QUERY
  // This avoids the deeply nested entity relations that cause null errors
  // ===================================================================
  
  getScraperJobsReportMinimal: /* GraphQL */ `
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
          createdAt
          updatedAt
        }
        nextToken
        totalCount
      }
    }
  `,

  // ===================================================================
  // QUERIES FOR SCRAPE ATTEMPTS - Fixed with correct fields from schema
  // ===================================================================
  
  // Query for listing scrape attempts by job
  listScrapeAttemptsByJob: /* GraphQL */ `
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
  `,

  // Query for listing scrape attempts by URL
  listScrapeAttemptsByURL: /* GraphQL */ `
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
  `,
};

// ===================================================================
// FOR S3Storage - Use auto-generated operations from other files
// ===================================================================

// Instead of duplicating S3Storage operations here, import them:
/*
import { 
  getS3Storage, 
  listS3Storages,
  getScrapeURL,
  getScraperState
} from '../graphql/queries';

import { 
  createS3Storage,
  updateS3Storage,
  deleteS3Storage,
  updateScrapeURL,
  createScraperJob,
  updateScraperJob,
  updateScraperState
} from '../graphql/mutations';

import {
  onCreateS3Storage,
  onUpdateS3Storage,
  onDeleteS3Storage,
  onCreateScraperJob,
  onUpdateScraperJob,
  onUpdateScraperState
} from '../graphql/subscriptions';
*/

// Export for backwards compatibility
export default {
  queries: scraperManagementQueries,
};