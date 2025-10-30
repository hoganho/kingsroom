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
 * ===================================================================
 */

export const listPlayersForDebug = /* GraphQL */ `
  query ListPlayersForDebug {
    listPlayers {
      items {
        id
        firstName
        lastName
        creationDate
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
        lastPlayed
        _version
      }
    }
  }
`;

export const listPlayerEntriesForDebug = /* GraphQL */ `
  query ListPlayerEntriesForDebug {
    listPlayerEntries(limit: 100) {
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