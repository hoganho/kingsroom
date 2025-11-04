/*
 * This file contains custom, lean GraphQL queries for specific components.
 * This avoids over-fetching data and prevents errors from the auto-generated
 * "greedy" queries that try to fetch all nested relationships.
 */

// Lean query for the Venues dropdown in GameCard
export const listVenuesForDropdown = /* GraphQL */ `
  query ListVenuesForDropdown {
    listVenues {
      items {
        id
        name
        venueNumber
      }
    }
  }
`;

export const listVenuesShallow = /* GraphQL */ `
  query ListVenuesShallow(
    $filter: ModelVenueFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listVenues(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        venueNumber
        name
        aliases
        address
        city
        country
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
      }
      nextToken
      startedAt
    }
  }
`;

/*
 * ===================================================================
 * DEBUG QUERIES FOR PlayersPage.tsx
 * * All queries have been updated to support pagination variables
 * ($limit and $nextToken) and to return the nextToken.
 * ===================================================================
 */

export const listPlayersForDebug = /* GraphQL */ `
  query ListPlayersForDebug(
    $filter: ModelPlayerFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listPlayers(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        firstName
        lastName
        registrationDate
        lastPlayedDate
        targetingClassification
        creditBalance
        pointsBalance
        registrationVenueId
        registrationVenue {
          id
          name
        }
        _version
      }
      nextToken
    }
  }
`;

export const listPlayerSummariesForDebug = /* GraphQL */ `
  query ListPlayerSummariesForDebug(
    $filter: ModelPlayerSummaryFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listPlayerSummaries(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        playerId
        sessionsPlayed
        tournamentsPlayed
        cashGamesPlayed
        venuesVisited
        tournamentWinnings
        tournamentBuyIns
        tournamentITM
        tournamentsCashed
        cashGameWinnings
        cashGameBuyIns
        totalWinnings
        totalBuyIns
        netBalance
        lastPlayed
        _version
      }
      nextToken
    }
  }
`;

export const listPlayerEntriesForDebug = /* GraphQL */ `
  query ListPlayerEntriesForDebug(
    $filter: ModelPlayerEntryFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listPlayerEntries(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        status
        registrationTime
        lastKnownStackSize
        tableNumber
        seatNumber
        player {
          id
          firstName
          lastName
        }
        game {
          id
          name
        }
      }
      nextToken
    }
  }
`;

export const listPlayerResultsForDebug = /* GraphQL */ `
  query ListPlayerResultsForDebug(
    $filter: ModelPlayerResultFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listPlayerResults(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        finishingPlace
        isMultiDayQualification
        prizeWon
        amountWon
        totalRunners
        pointsEarned
        playerId
        gameId
        _version
        player {
          id
          firstName
          lastName
        }
        game {
            id
            name
            buyIn
        }
      }
      nextToken
    }
  }
`;

export const listPlayerVenuesForDebug = /* GraphQL */ `
  query ListPlayerVenuesForDebug(
    $filter: ModelPlayerVenueFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listPlayerVenues(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        totalGamesPlayed
        averageBuyIn
        firstPlayedDate
        lastPlayedDate
        targetingClassification
        playerId
        venueId
        _version
        player {
          id
          firstName
          lastName
        }
        venue {
          id
          name
        }
      }
      nextToken
    }
  }
`;

export const listPlayerTransactionsForDebug = /* GraphQL */ `
  query ListPlayerTransactionsForDebug(
    $filter: ModelPlayerTransactionFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listPlayerTransactions(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        type
        amount
        rake
        paymentSource
        transactionDate
        notes
        playerId
        gameId
        _version
        player {
          id
          firstName
          lastName
        }
      }
      nextToken
    }
  }
`;

export const listPlayerCreditsForDebug = /* GraphQL */ `
  query ListPlayerCreditsForDebug(
    $filter: ModelPlayerCreditsFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listPlayerCredits(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        type
        changeAmount
        balanceAfter
        transactionDate
        reason
        expiryDate
        playerId
        relatedGameId
        relatedTransactionId
        _version
      }
      nextToken
    }
  }
`;

export const listPlayerPointsForDebug = /* GraphQL */ `
  query ListPlayerPointsForDebug(
    $filter: ModelPlayerPointsFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listPlayerPoints(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        type
        changeAmount
        balanceAfter
        transactionDate
        reason
        expiryDate
        playerId
        relatedGameId
        relatedTransactionId
        _version
      }
      nextToken
    }
  }
`;

export const listPlayerTicketsForDebug = /* GraphQL */ `
  query ListPlayerTicketsForDebug(
    $filter: ModelPlayerTicketFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listPlayerTickets(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        assignedAt
        expiryDate
        status
        usedInGameId
        playerId
        ticketTemplateId
        _version
      }
      nextToken
    }
  }
`;

export const listPlayerMarketingPreferencesForDebug = /* GraphQL */ `
  query ListPlayerMarketingPreferencesForDebug(
    $filter: ModelPlayerMarketingPreferencesFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listPlayerMarketingPreferences(
      filter: $filter
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        optOutSms
        optOutEmail
        playerId
        _version
      }
      nextToken
    }
  }
`;

export const listPlayerMarketingMessagesForDebug = /* GraphQL */ `
  query ListPlayerMarketingMessagesForDebug(
    $filter: ModelPlayerMarketingMessageFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listPlayerMarketingMessages(
      filter: $filter
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        status
        sentAt
        playerId
        marketingMessageId
        _version
      }
      nextToken
    }
  }
`;


/*
 * ===================================================================
 * NEW: DEBUG QUERIES FOR GamesPage.tsx
 * ===================================================================
 */

export const listGamesForDebug = /* GraphQL */ `
  query ListGamesForDebug(
    $filter: ModelGameFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listGames(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        name
        gameType
        gameStatus
        gameStartDateTime
        venueId
        tournamentId
        venue {
          id
          name
        }
        _version
      }
      nextToken
    }
  }
`;

export const listTournamentStructuresForDebug = /* GraphQL */ `
  query ListTournamentStructuresForDebug(
    $filter: ModelTournamentStructureFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listTournamentStructures(
      filter: $filter
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        gameId
        levels {
          levelNumber
        }
        breaks {
          levelNumberBeforeBreak
        }
        game {
          id
          name
        }
        _version
      }
      nextToken
    }
  }
`;