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

/*
 * ===================================================================
 * DEBUG QUERIES FOR PlayersPage.tsx
 *
 * These queries fetch *all* fields for each model but do *not*
 * fetch nested relationships, keeping them fast and safe.
 * ===================================================================
 */

export const listPlayersForDebug = /* GraphQL */ `
  query ListPlayersForDebug {
    listPlayers {
      items {
        id
        firstName
        givenName
        lastName
        email
        phone
        creationDate
        status
        category
        tier
        lastPlayedDate
        targetingClassification
        creditBalance
        pointsBalance
        registrationVenueId
        _version
      }
    }
  }
`;

export const listPlayerSummariesForDebug = /* GraphQL */ `
  query ListPlayerSummariesForDebug {
    listPlayerSummaries {
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
        lastUpdated
        _version
      }
    }
  }
`;

export const listPlayerResultsForDebug = /* GraphQL */ `
  query ListPlayerResultsForDebug {
    listPlayerResults {
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
      }
    }
  }
`;

export const listPlayerVenuesForDebug = /* GraphQL */ `
  query ListPlayerVenuesForDebug {
    listPlayerVenues {
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
      }
    }
  }
`;

export const listPlayerTransactionsForDebug = /* GraphQL */ `
  query ListPlayerTransactionsForDebug {
    listPlayerTransactions {
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
      }
    }
  }
`;

export const listPlayerCreditsForDebug = /* GraphQL */ `
  query ListPlayerCreditsForDebug {
    listPlayerCredits {
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
    }
  }
`;

export const listPlayerPointsForDebug = /* GraphQL */ `
  query ListPlayerPointsForDebug {
    listPlayerPoints {
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
    }
  }
`;

export const listPlayerTicketsForDebug = /* GraphQL */ `
  query ListPlayerTicketsForDebug {
    listPlayerTickets {
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
    }
  }
`;

export const listPlayerMarketingPreferencesForDebug = /* GraphQL */ `
  query ListPlayerMarketingPreferencesForDebug {
    listPlayerMarketingPreferences {
      items {
        id
        optOutSms
        optOutEmail
        playerId
        _version
      }
    }
  }
`;

export const listPlayerMarketingMessagesForDebug = /* GraphQL */ `
  query ListPlayerMarketingMessagesForDebug {
    listPlayerMarketingMessages {
      items {
        id
        status
        sentAt
        playerId
        marketingMessageId
        _version
      }
    }
  }
`;

