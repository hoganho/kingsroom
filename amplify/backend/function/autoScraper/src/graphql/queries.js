/**
 * GraphQL Queries and Mutations for autoScraper
 * 
 * Extracted from index.js for maintainability
 * 
 * UPDATED: v1.2.0
 * - Added PUBLISH_JOB_PROGRESS mutation for real-time job monitoring
 *   This triggers the onJobProgress subscription for live UI updates
 * 
 * FIXED: v1.1.0
 * - Added full results fields (name, winnings, points, isQualification) 
 * - Added entries array
 * - Added seating array
 * These are required for player data to flow through to saveGameFunction
 */

const FETCH_TOURNAMENT_DATA = /* GraphQL */ `
    mutation FetchTournamentData($url: AWSURL, $forceRefresh: Boolean, $entityId: ID, $scraperApiKey: String) {
        fetchTournamentData(url: $url, forceRefresh: $forceRefresh, entityId: $entityId, scraperApiKey: $scraperApiKey) {
            name
            gameStatus
            tournamentId
            sourceUrl
            existingGameId
            doNotScrape
            venueMatch {
                autoAssignedVenue {
                    id
                    name
                }
            }
            # FIXED: Request full player result data (was: results { rank })
            results {
                rank
                name
                winnings
                points
                isQualification
            }
            # FIXED: Request entries array (was missing entirely)
            entries {
                name
            }
            # FIXED: Request seating array (was missing entirely)
            seating {
                name
                table
                seat
                playerStack
            }
            gameStartDateTime
            gameEndDateTime
            registrationStatus
            gameType
            gameVariant
            tournamentType
            prizepoolPaid
            prizepoolCalculated
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            totalUniquePlayers
            totalInitialEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            entityId
            s3Key
            source
            contentHash
            fetchedAt
        }
    }
`;

const SAVE_TOURNAMENT_DATA = /* GraphQL */ `
    mutation EnrichGameData($input: EnrichGameDataInput!) {
        enrichGameData(input: $input) {
            success
            saveResult {
                gameId
                action
                message
            }
            validation {
                isValid
                errors { field message }
                warnings { field message }
            }
        }
    }
`;

const PUBLISH_GAME_PROCESSED = /* GraphQL */ `
    mutation PublishGameProcessed($jobId: ID!, $event: GameProcessedEventInput!) {
        publishGameProcessed(jobId: $jobId, event: $event) {
            jobId
            entityId
            tournamentId
            url
            action
            message
            errorMessage
            processedAt
            durationMs
            dataSource
            s3Key
            gameData {
                name
                gameStatus
                registrationStatus
                gameStartDateTime
                gameEndDateTime
                buyIn
                rake
                guaranteeAmount
                prizepoolPaid
                totalEntries
                totalUniquePlayers
                totalRebuys
                totalAddons
                gameType
                gameVariant
                tournamentType
                gameTags
                venueId
                venueName
                doNotScrape
                existingGameId
            }
            saveResult {
                success
                gameId
                action
                message
            }
        }
    }
`;

/**
 * NEW in v1.2.0: Publish job progress events for real-time monitoring
 * 
 * This mutation triggers the onJobProgress subscription, allowing the frontend
 * to receive live updates about job status without polling.
 * 
 * Called by JobProgressPublisher in index.js:
 * - On job start (RUNNING status)
 * - Periodically during processing (~every 1 second, rate-limited)
 * - On job completion (COMPLETED, FAILED, STOPPED_*, etc.)
 */
const PUBLISH_JOB_PROGRESS = /* GraphQL */ `
    mutation PublishJobProgress($jobId: ID!, $event: JobProgressEventInput!) {
        publishJobProgress(jobId: $jobId, event: $event) {
            jobId
            entityId
            status
            stopReason
            totalURLsProcessed
            newGamesScraped
            gamesUpdated
            gamesSkipped
            errors
            blanks
            currentId
            startId
            endId
            startTime
            durationSeconds
            successRate
            averageScrapingTime
            s3CacheHits
            consecutiveNotFound
            consecutiveErrors
            consecutiveBlanks
            lastErrorMessage
            publishedAt
        }
    }
`;

module.exports = {
    FETCH_TOURNAMENT_DATA,
    SAVE_TOURNAMENT_DATA,
    PUBLISH_GAME_PROCESSED,
    PUBLISH_JOB_PROGRESS
};