/**
 * GraphQL Queries and Mutations for autoScraper
 * 
 * Extracted from index.js for maintainability
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
            results { rank }
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

module.exports = {
    FETCH_TOURNAMENT_DATA,
    SAVE_TOURNAMENT_DATA,
    PUBLISH_GAME_PROCESSED
};
