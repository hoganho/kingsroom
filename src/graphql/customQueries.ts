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

// --- 1. Players ---
export const listPlayersForDebug = /* GraphQL */ `
  query ListPlayersForDebug($limit: Int, $nextToken: String) {
    listPlayers(limit: $limit, nextToken: $nextToken) {
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
      nextToken
    }
  }
`;

// --- 2. Summaries ---
export const listPlayerSummariesForDebug = /* GraphQL */ `
  query ListPlayerSummariesForDebug($limit: Int, $nextToken: String) {
    listPlayerSummaries(limit: $limit, nextToken: $nextToken) {
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

// --- 3. Entries ---
export const listPlayerEntriesForDebug = /* GraphQL */ `
  query ListPlayerEntriesForDebug($limit: Int, $nextToken: String) {
    listPlayerEntries(limit: $limit, nextToken: $nextToken) {
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

// --- 4. Results ---
export const listPlayerResultsForDebug = /* GraphQL */ `
  query ListPlayerResultsForDebug($limit: Int, $nextToken: String) {
    listPlayerResults(limit: $limit, nextToken: $nextToken) {
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

// --- 5. Venues ---
export const listPlayerVenuesForDebug = /* GraphQL */ `
  query ListPlayerVenuesForDebug($limit: Int, $nextToken: String) {
    listPlayerVenues(limit: $limit, nextToken: $nextToken) {
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

// --- 6. Transactions ---
export const listPlayerTransactionsForDebug = /* GraphQL */ `
  query ListPlayerTransactionsForDebug($limit: Int, $nextToken: String) {
    listPlayerTransactions(limit: $limit, nextToken: $nextToken) {
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

// --- 7. Credits ---
export const listPlayerCreditsForDebug = /* GraphQL */ `
  query ListPlayerCreditsForDebug($limit: Int, $nextToken: String) {
    listPlayerCredits(limit: $limit, nextToken: $nextToken) {
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

// --- 8. Points ---
export const listPlayerPointsForDebug = /* GraphQL */ `
  query ListPlayerPointsForDebug($limit: Int, $nextToken: String) {
    listPlayerPoints(limit: $limit, nextToken: $nextToken) {
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

// --- 9. Tickets ---
export const listPlayerTicketsForDebug = /* GraphQL */ `
  query ListPlayerTicketsForDebug($limit: Int, $nextToken: String) {
    listPlayerTickets(limit: $limit, nextToken: $nextToken) {
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

// --- 10. Preferences ---
export const listPlayerMarketingPreferencesForDebug = /* GraphQL */ `
  query ListPlayerMarketingPreferencesForDebug($limit: Int, $nextToken: String) {
    listPlayerMarketingPreferences(limit: $limit, nextToken: $nextToken) {
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

// --- 11. Messages ---
export const listPlayerMarketingMessagesForDebug = /* GraphQL */ `
  query ListPlayerMarketingMessagesForDebug($limit: Int, $nextToken: String) {
    listPlayerMarketingMessages(limit: $limit, nextToken: $nextToken) {
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

