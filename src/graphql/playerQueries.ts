// src/graphql/playerQueries.ts
// Centralized GraphQL queries for Player operations
// Matches schema from 50-players.graphql
//
// NOTE: Operation names (after 'query') must be UNIQUE across all .ts/.graphql files
// to avoid "There can be only one operation named" errors during codegen.
// Convention: Use descriptive suffixes like *Custom, *WithDetails, *ForComponent, etc.

// ============================================================================
// Fragment Definitions
// ============================================================================

export const PLAYER_CORE_FIELDS = /* GraphQL */ `
  fragment PlayerCoreFields on Player {
    id
    primaryEntityId
    firstName
    lastName
    phone
    email
    status
    category
    targetingClassification
    registrationDate
    firstGamePlayed
    lastPlayedDate
    creditBalance
    pointsBalance
    venueAssignmentStatus
    registrationVenueId
    createdAt
    updatedAt
  }
`;

export const PLAYER_SUMMARY_FIELDS = /* GraphQL */ `
  fragment PlayerSummaryFields on PlayerSummary {
    id
    playerId
    gamesPlayedLast30Days
    gamesPlayedLast90Days
    gamesPlayedAllTime
    averageFinishPosition
    netBalance
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
    lastPlayed
  }
`;

export const VENUE_FIELDS = /* GraphQL */ `
  fragment VenueFields on Venue {
    id
    name
    entityId
    entity {
      id
      entityName
    }
  }
`;

export const PLAYER_VENUE_FIELDS = /* GraphQL */ `
  fragment PlayerVenueFields on PlayerVenue {
    id
    playerId
    venueId
    entityId
    totalGamesPlayed
    averageBuyIn
    totalBuyIns
    totalWinnings
    netProfit
    firstPlayedDate
    lastPlayedDate
    targetingClassification
    venue {
      id
      name
      entityId
      entity {
        id
        entityName
      }
    }
  }
`;

export const PLAYER_ENTRY_FIELDS = /* GraphQL */ `
  fragment PlayerEntryFields on PlayerEntry {
    id
    playerId
    gameId
    venueId
    entityId
    status
    registrationTime
    eliminationTime
    gameStartDateTime
    lastKnownStackSize
    tableNumber
    seatNumber
    numberOfReEntries
    entryType
    recordType
    game {
      id
      name
      buyIn
      gameStartDateTime
      venue {
        id
        name
      }
    }
  }
`;

export const PLAYER_RESULT_FIELDS = /* GraphQL */ `
  fragment PlayerResultFields on PlayerResult {
    id
    playerId
    gameId
    venueId
    entityId
    finishingPlace
    isMultiDayQualification
    prizeWon
    amountWon
    totalRunners
    pointsEarned
    gameStartDateTime
    totalBuyInsPaid
    netProfitLoss
    recordType
    game {
      id
      name
      buyIn
      gameStartDateTime
      venue {
        id
        name
      }
    }
  }
`;

export const PLAYER_TRANSACTION_FIELDS = /* GraphQL */ `
  fragment PlayerTransactionFields on PlayerTransaction {
    id
    playerId
    type
    amount
    rake
    paymentSource
    transactionDate
    notes
    gameId
    venueId
    entityId
  }
`;

export const PLAYER_CREDITS_FIELDS = /* GraphQL */ `
  fragment PlayerCreditsFields on PlayerCredits {
    id
    playerId
    type
    changeAmount
    balanceAfter
    transactionDate
    reason
    expiryDate
    relatedGameId
    relatedTransactionId
  }
`;

export const PLAYER_POINTS_FIELDS = /* GraphQL */ `
  fragment PlayerPointsFields on PlayerPoints {
    id
    playerId
    type
    changeAmount
    balanceAfter
    transactionDate
    reason
    expiryDate
    relatedGameId
    relatedTransactionId
  }
`;

export const PLAYER_TICKET_FIELDS = /* GraphQL */ `
  fragment PlayerTicketFields on PlayerTicket {
    id
    playerId
    ticketTemplateId
    status
    assignedAt
    expiryDate
    usedInGameId
    usedAt
    ticketValue
    programName
    awardReason
    wonFromGameId
    wonFromPosition
    entityId
    venueId
    ticketTemplate {
      id
      name
      description
      value
      validityDays
    }
    wonFromGame {
      id
      name
      gameStartDateTime
    }
  }
`;

// ============================================================================
// Basic Player Queries
// RENAMED: GetPlayer -> GetPlayerCustom to avoid conflict with auto-generated
// ============================================================================

export const GET_PLAYER = /* GraphQL */ `
  query GetPlayerCustom($id: ID!) {
    getPlayer(id: $id) {
      id
      primaryEntityId
      firstName
      lastName
      phone
      email
      status
      category
      targetingClassification
      registrationDate
      firstGamePlayed
      lastPlayedDate
      creditBalance
      pointsBalance
      venueAssignmentStatus
      registrationVenueId
      registrationVenue {
        id
        name
        entityId
        entity {
          id
          entityName
        }
      }
      createdAt
      updatedAt
    }
  }
`;

export const GET_PLAYER_WITH_SUMMARY = /* GraphQL */ `
  query GetPlayerWithSummaryCustom($id: ID!) {
    getPlayer(id: $id) {
      id
      primaryEntityId
      firstName
      lastName
      phone
      email
      status
      category
      targetingClassification
      registrationDate
      firstGamePlayed
      lastPlayedDate
      creditBalance
      pointsBalance
      venueAssignmentStatus
      registrationVenueId
      registrationVenue {
        id
        name
        entityId
      }
      playerSummary {
        id
        playerId
        gamesPlayedLast30Days
        gamesPlayedLast90Days
        gamesPlayedAllTime
        averageFinishPosition
        netBalance
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
        lastPlayed
      }
      createdAt
      updatedAt
    }
  }
`;

// Full player profile with all relationships for profile page
export const GET_PLAYER_FULL_PROFILE = /* GraphQL */ `
  query GetPlayerFullProfileCustom($id: ID!) {
    getPlayer(id: $id) {
      id
      primaryEntityId
      firstName
      lastName
      phone
      email
      status
      category
      targetingClassification
      registrationDate
      firstGamePlayed
      lastPlayedDate
      creditBalance
      pointsBalance
      venueAssignmentStatus
      registrationVenueId
      registrationVenue {
        id
        name
        entityId
        entity {
          id
          entityName
        }
      }
      playerSummary {
        id
        playerId
        gamesPlayedLast30Days
        gamesPlayedLast90Days
        gamesPlayedAllTime
        averageFinishPosition
        netBalance
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
        lastPlayed
      }
      marketingPreferences {
        id
        playerId
        optOutSms
        optOutEmail
      }
      createdAt
      updatedAt
    }
  }
`;

// ============================================================================
// Player List Queries
// RENAMED: ListPlayers -> ListPlayersCustom to avoid conflict
// ============================================================================

export const LIST_PLAYERS = /* GraphQL */ `
  query ListPlayersCustom(
    $filter: ModelPlayerFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listPlayers(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        firstName
        lastName
        email
        phone
        status
        category
        targetingClassification
        registrationDate
        lastPlayedDate
        creditBalance
        pointsBalance
        registrationVenue {
          id
          name
        }
        updatedAt
      }
      nextToken
    }
  }
`;

export const LIST_PLAYERS_WITH_SUMMARY = /* GraphQL */ `
  query ListPlayersWithSummaryCustom(
    $filter: ModelPlayerFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listPlayers(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        firstName
        lastName
        email
        phone
        status
        category
        targetingClassification
        registrationDate
        firstGamePlayed
        lastPlayedDate
        creditBalance
        pointsBalance
        primaryEntityId
        registrationVenue {
          id
          name
        }
        playerSummary {
          id
          gamesPlayedLast30Days
          gamesPlayedLast90Days
          gamesPlayedAllTime
          averageFinishPosition
          netBalance
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          venuesVisited
          tournamentWinnings
          tournamentBuyIns
          totalWinnings
          totalBuyIns
          lastPlayed
        }
        updatedAt
      }
      nextToken
    }
  }
`;

// Dashboard query with venues and entries for cross-entity stats
export const LIST_PLAYERS_FOR_DASHBOARD = /* GraphQL */ `
  query ListPlayersForDashboardCustom(
    $filter: ModelPlayerFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listPlayers(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        firstName
        lastName
        email
        phone
        status
        category
        targetingClassification
        registrationDate
        firstGamePlayed
        lastPlayedDate
        creditBalance
        pointsBalance
        primaryEntityId
        playerSummary {
          id
          gamesPlayedLast30Days
          gamesPlayedLast90Days
          gamesPlayedAllTime
          averageFinishPosition
          netBalance
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          venuesVisited
          tournamentWinnings
          tournamentBuyIns
          totalWinnings
          totalBuyIns
          lastPlayed
        }
        playerVenues(limit: 5) {
          items {
            id
            totalGamesPlayed
            averageBuyIn
            lastPlayedDate
            venue {
              id
              name
              entityId
              entity {
                id
                entityName
              }
            }
          }
        }
        playerEntries(limit: 10, sortDirection: DESC) {
          items {
            id
            gameStartDateTime
            status
            game {
              id
              name
              entityId
              entity {
                id
                entityName
              }
              venue {
                id
                name
              }
            }
          }
        }
      }
      nextToken
    }
  }
`;

// ============================================================================
// Player Index Queries (using GSIs)
// RENAMED: PlayersByEntity -> PlayersByEntityCustom to avoid conflict
// ============================================================================

export const PLAYERS_BY_ENTITY = /* GraphQL */ `
  query PlayersByEntityCustom(
    $primaryEntityId: ID!
    $limit: Int
    $nextToken: String
  ) {
    playersByEntity(
      primaryEntityId: $primaryEntityId
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        firstName
        lastName
        email
        status
        category
        targetingClassification
        registrationDate
        lastPlayedDate
        creditBalance
        pointsBalance
        playerSummary {
          gamesPlayedAllTime
          netBalance
          lastPlayed
        }
      }
      nextToken
    }
  }
`;

// RENAMED: PlayerByEmail -> PlayerByEmailCustom to avoid conflict
export const PLAYER_BY_EMAIL = /* GraphQL */ `
  query PlayerByEmailCustom($email: String!) {
    playerByEmail(email: $email) {
      items {
        id
        firstName
        lastName
        email
        phone
        status
        category
      }
    }
  }
`;

// RENAMED: PlayerByPhone -> PlayerByPhoneCustom to avoid conflict
export const PLAYER_BY_PHONE = /* GraphQL */ `
  query PlayerByPhoneCustom($phone: String!) {
    playerByPhone(phone: $phone) {
      items {
        id
        firstName
        lastName
        email
        phone
        status
        category
      }
    }
  }
`;

// ============================================================================
// Player Relationship Queries
// ============================================================================

export const GET_PLAYER_RESULTS = /* GraphQL */ `
  query GetPlayerResultsCustom(
    $playerId: ID!
    $sortDirection: ModelSortDirection
    $limit: Int
    $nextToken: String
  ) {
    playerResultsByPlayerIdAndGameStartDateTime(
      playerId: $playerId
      sortDirection: $sortDirection
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        playerId
        gameId
        venueId
        entityId
        finishingPlace
        isMultiDayQualification
        prizeWon
        amountWon
        totalRunners
        pointsEarned
        gameStartDateTime
        totalBuyInsPaid
        netProfitLoss
        recordType
        game {
          id
          name
          buyIn
          gameStartDateTime
          venue {
            id
            name
          }
        }
      }
      nextToken
    }
  }
`;

export const GET_PLAYER_ENTRIES = /* GraphQL */ `
  query GetPlayerEntriesCustom(
    $playerId: ID!
    $sortDirection: ModelSortDirection
    $limit: Int
    $nextToken: String
  ) {
    playerEntriesByPlayerIdAndGameStartDateTime(
      playerId: $playerId
      sortDirection: $sortDirection
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        playerId
        gameId
        venueId
        entityId
        status
        registrationTime
        eliminationTime
        gameStartDateTime
        lastKnownStackSize
        tableNumber
        seatNumber
        numberOfReEntries
        entryType
        game {
          id
          name
          buyIn
          gameStartDateTime
          venue {
            id
            name
          }
        }
      }
      nextToken
    }
  }
`;

export const GET_PLAYER_VENUES = /* GraphQL */ `
  query GetPlayerVenuesCustom($playerId: ID!, $limit: Int, $nextToken: String) {
    listPlayerVenues(
      filter: { playerId: { eq: $playerId } }
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        playerId
        venueId
        entityId
        totalGamesPlayed
        averageBuyIn
        totalBuyIns
        totalWinnings
        netProfit
        firstPlayedDate
        lastPlayedDate
        targetingClassification
        venue {
          id
          name
          entityId
          entity {
            id
            entityName
          }
        }
      }
      nextToken
    }
  }
`;

export const GET_PLAYER_TRANSACTIONS = /* GraphQL */ `
  query GetPlayerTransactionsCustom(
    $playerId: ID!
    $sortDirection: ModelSortDirection
    $limit: Int
    $nextToken: String
  ) {
    playerTransactionsByPlayerIdAndTransactionDate(
      playerId: $playerId
      sortDirection: $sortDirection
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        playerId
        type
        amount
        rake
        paymentSource
        transactionDate
        notes
        gameId
        venueId
        entityId
      }
      nextToken
    }
  }
`;

// RENAMED: GetPlayerCredits -> GetPlayerCreditsCustom to avoid conflict
export const GET_PLAYER_CREDITS = /* GraphQL */ `
  query GetPlayerCreditsCustom(
    $playerId: ID!
    $sortDirection: ModelSortDirection
    $limit: Int
    $nextToken: String
  ) {
    playerCreditsByPlayerIdAndTransactionDate(
      playerId: $playerId
      sortDirection: $sortDirection
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        playerId
        type
        changeAmount
        balanceAfter
        transactionDate
        reason
        expiryDate
        relatedGameId
        relatedTransactionId
      }
      nextToken
    }
  }
`;

// RENAMED: GetPlayerPoints -> GetPlayerPointsCustom to avoid conflict
export const GET_PLAYER_POINTS = /* GraphQL */ `
  query GetPlayerPointsCustom(
    $playerId: ID!
    $sortDirection: ModelSortDirection
    $limit: Int
    $nextToken: String
  ) {
    playerPointsByPlayerIdAndTransactionDate(
      playerId: $playerId
      sortDirection: $sortDirection
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        playerId
        type
        changeAmount
        balanceAfter
        transactionDate
        reason
        expiryDate
        relatedGameId
        relatedTransactionId
      }
      nextToken
    }
  }
`;

export const GET_PLAYER_TICKETS = /* GraphQL */ `
  query GetPlayerTicketsCustom(
    $playerId: ID!
    $sortDirection: ModelSortDirection
    $limit: Int
    $nextToken: String
  ) {
    playerTicketsByPlayerIdAndAssignedAt(
      playerId: $playerId
      sortDirection: $sortDirection
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        playerId
        ticketTemplateId
        status
        assignedAt
        expiryDate
        usedInGameId
        usedAt
        ticketValue
        programName
        awardReason
        wonFromGameId
        wonFromPosition
        entityId
        venueId
        ticketTemplate {
          id
          name
          description
          value
          validityDays
        }
        wonFromGame {
          id
          name
          gameStartDateTime
        }
      }
      nextToken
    }
  }
`;

// ============================================================================
// Search Queries
// ============================================================================

export const SEARCH_PLAYERS = /* GraphQL */ `
  query SearchPlayersCustom($searchTerm: String!, $limit: Int) {
    listPlayers(
      filter: {
        or: [
          { firstName: { contains: $searchTerm } }
          { lastName: { contains: $searchTerm } }
          { email: { contains: $searchTerm } }
        ]
      }
      limit: $limit
    ) {
      items {
        id
        firstName
        lastName
        email
        phone
        status
        category
        registrationDate
        lastPlayedDate
        creditBalance
        pointsBalance
        registrationVenue {
          id
          name
        }
        playerSummary {
          gamesPlayedAllTime
          netBalance
          lastPlayed
        }
      }
      nextToken
    }
  }
`;

// ============================================================================
// Top Players Query
// ============================================================================

export const LIST_TOP_PLAYERS = /* GraphQL */ `
  query ListTopPlayersCustom($filter: ModelPlayerFilterInput, $limit: Int) {
    listPlayers(filter: $filter, limit: $limit) {
      items {
        id
        firstName
        lastName
        email
        status
        category
        playerSummary {
          totalWinnings
          totalBuyIns
          netBalance
          gamesPlayedAllTime
          tournamentsPlayed
          tournamentsCashed
          averageFinishPosition
        }
        playerVenues(limit: 3) {
          items {
            totalGamesPlayed
            venue {
              id
              name
              entity {
                id
                entityName
              }
            }
          }
        }
      }
    }
  }
`;
