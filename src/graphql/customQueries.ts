/*
 * This file contains custom, lean GraphQL queries for specific components.
 * This avoids over-fetching data and prevents errors from the auto-generated
 * "greedy" queries that try to fetch all nested relationships.
 * 
 * QUERY NAMING CONVENTIONS:
 * - *Shallow  = Ultra-minimal fields (id, name only) for dropdowns/selects
 * - *Simple   = Core fields + stats, NO nested relationships (for tables/lists)
 * - *ForDebug = Development/debugging with some nested data
 * - *WithX    = Includes specific nested relationship X
 */

// ===================================================================
// SHALLOW QUERIES (Ultra-minimal for dropdowns/selects)
// ===================================================================

export const listEntitiesShallow = /* GraphQL */ `
  query ListEntitiesShallow(
    $filter: ModelEntityFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listEntities(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        entityName
      }
      nextToken
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
        address
        city
        country
        fee
        aliases
        entityId
        logo
        isSpecial
        _version
        _deleted
      }
      nextToken
    }
  }
`;

// Lean query for the Venues dropdown in GameCard
export const listVenuesForDropdown = /* GraphQL */ `
  query ListVenuesForDropdown(
    $filter: ModelVenueFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listVenues(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        name
        venueNumber
        entityId
      }
      nextToken
    }
  }
`;

export const listVenuesForDashboard = /* GraphQL */ `
  query ListVenuesForDashboard(
    $filter: ModelVenueFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listVenues(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        name
        entityId
        logo
      }
      nextToken
    }
  }
`;

// ===================================================================
// SIMPLE QUERIES (Core fields + stats, NO nested relationships)
// Use these for tables and list views to reduce AWS costs
// ===================================================================

export const listEntitiesSimple = /* GraphQL */ `
  query ListEntitiesSimple(
    $filter: ModelEntityFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listEntities(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        entityName
        gameUrlDomain
        gameUrlPath
        entityLogo
        isActive
        defaultVenueId
        gameCount
        venueCount
        lastGameAddedAt
        lastDataRefreshedAt
        seriesGameCount
        lastSeriesGameAddedAt
        createdAt
        updatedAt
        _version
        _lastChangedAt
      }
      nextToken
    }
  }
`;

export const getEntitySimple = /* GraphQL */ `
  query GetEntitySimple($id: ID!) {
    getEntity(id: $id) {
      id
      entityName
      gameUrlDomain
      gameUrlPath
      entityLogo
      isActive
      defaultVenueId
      gameCount
      venueCount
      lastGameAddedAt
      lastDataRefreshedAt
      seriesGameCount
      lastSeriesGameAddedAt
      createdAt
      updatedAt
      _version
      _lastChangedAt
    }
  }
`;

export const listVenuesSimple = /* GraphQL */ `
  query ListVenuesSimple(
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
        fee
        isSpecial
        logo
        gameCount
        lastGameAddedAt
        lastDataRefreshedAt
        seriesGameCount
        lastSeriesGameAddedAt
        canonicalVenueId
        entityId
        createdAt
        updatedAt
        _version
        _lastChangedAt
      }
      nextToken
    }
  }
`;

export const getVenueSimple = /* GraphQL */ `
  query GetVenueSimple($id: ID!) {
    getVenue(id: $id) {
      id
      venueNumber
      name
      aliases
      address
      city
      country
      fee
      isSpecial
      logo
      gameCount
      lastGameAddedAt
      lastDataRefreshedAt
      seriesGameCount
      lastSeriesGameAddedAt
      canonicalVenueId
      entityId
      createdAt
      updatedAt
      _version
      _lastChangedAt
    }
  }
`;

export const venuesByEntitySimple = /* GraphQL */ `
  query VenuesByEntitySimple(
    $entityId: ID!
    $sortDirection: ModelSortDirection
    $filter: ModelVenueFilterInput
    $limit: Int
    $nextToken: String
  ) {
    venuesByEntity(
      entityId: $entityId
      sortDirection: $sortDirection
      filter: $filter
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        venueNumber
        name
        aliases
        address
        city
        country
        fee
        isSpecial
        logo
        gameCount
        lastGameAddedAt
        entityId
        createdAt
        updatedAt
        _version
        _lastChangedAt
      }
      nextToken
    }
  }
`;

// Updated query that includes fullSyncOldestPostDate for resumable syncs
export const listSocialAccountsSimple = /* GraphQL */ `
  query ListSocialAccountsSimple(
    $filter: ModelSocialAccountFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listSocialAccounts(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        platform
        platformAccountId
        accountName
        accountHandle
        accountUrl
        profileImageUrl
        followerCount
        postCount
        status
        lastErrorMessage
        isScrapingEnabled
        lastScrapedAt
        lastSuccessfulScrapeAt
        scrapeFrequencyMinutes
        consecutiveFailures
        hasFullHistory
        fullSyncOldestPostDate
        entityId
        venueId
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
      }
      nextToken
    }
  }
`;

// You can also add a getSocialAccount query if needed
export const getSocialAccountSimple = /* GraphQL */ `
  query GetSocialAccountSimple($id: ID!) {
    getSocialAccount(id: $id) {
      id
      platform
      platformAccountId
      accountName
      accountHandle
      accountUrl
      profileImageUrl
      followerCount
      postCount
      status
      lastErrorMessage
      isScrapingEnabled
      lastScrapedAt
      lastSuccessfulScrapeAt
      scrapeFrequencyMinutes
      consecutiveFailures
      hasFullHistory
      fullSyncOldestPostDate
      entityId
      venueId
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
    }
  }
`;


export const listScrapeURLsSimple = /* GraphQL */ `
  query ListScrapeURLsSimple(
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
        entityId
        tournamentId
        status
        latestS3Key
        lastScrapedAt
        doNotScrape
        placedIntoDatabase
        firstScrapedAt
        timesScraped
        timesSuccessful
        timesFailed
        createdAt
        updatedAt
        _version
        _lastChangedAt
      }
      nextToken
    }
  }
`;

export const listRecurringGamesSimple = /* GraphQL */ `
  query ListRecurringGamesSimple(
    $filter: ModelRecurringGameFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listRecurringGames(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        name
        displayName
        entityId
        venueId
        dayOfWeek
        startTime
        frequency
        gameType
        gameVariant
        typicalBuyIn
        typicalGuarantee
        typicalStartingStack
        typicalRake
        isActive
        isPaused
        isSignature
        isBeginnerFriendly
        isBounty
        wasManuallyCreated
        requiresReview
        totalInstancesRun
        avgAttendance
        createdAt
        updatedAt
        _version
        _lastChangedAt
      }
      nextToken
    }
  }
`;

export const listTournamentSeriesSimple = /* GraphQL */ `
  query ListTournamentSeriesSimple(
    $filter: ModelTournamentSeriesFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listTournamentSeries(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        name
        year
        quarter
        month
        entityId
        venueId
        tournamentSeriesTitleId
        seriesCategory
        holidayType
        status
        startDate
        endDate
        numberOfEvents
        guaranteedPrizepool
        estimatedPrizepool
        actualPrizepool
        createdAt
        updatedAt
        _version
        _lastChangedAt
      }
      nextToken
    }
  }
`;

export const listTournamentSeriesTitlesSimple = /* GraphQL */ `
  query ListTournamentSeriesTitlesSimple(
    $filter: ModelTournamentSeriesTitleFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listTournamentSeriesTitles(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        title
        aliases
        seriesCategory
        createdAt
        updatedAt
        _version
        _lastChangedAt
      }
      nextToken
    }
  }
`;

// ===================================================================
// QUERIES WITH SPECIFIC NESTED DATA
// ===================================================================

// Entity with venues only (no deep nesting)
export const getEntityWithVenues = /* GraphQL */ `
  query GetEntityWithVenues($id: ID!) {
    getEntity(id: $id) {
      id
      entityName
      gameUrlDomain
      gameUrlPath
      entityLogo
      isActive
      defaultVenueId
      gameCount
      venueCount
      createdAt
      updatedAt
      _version
      _lastChangedAt
      venues {
        items {
          id
          name
          venueNumber
          city
          isSpecial
          logo
          gameCount
          lastGameAddedAt
        }
        nextToken
      }
    }
  }
`;

export const getVenueWithLogo = /* GraphQL */ `
  query GetVenueWithLogo($id: ID!) {
    getVenue(id: $id) {
      id
      venueNumber
      name
      address
      city
      country
      fee
      aliases
      entityId
      logo
      isSpecial
      gameCount
      lastGameAddedAt
      lastDataRefreshedAt
      canonicalVenueId
      _version
      _deleted
    }
  }
`;

// ===================================================================
// LEAN SCRAPE URL QUERIES FOR CACHING
// ===================================================================

// Lean query for ScrapeOptionsModal - only fetches cache-related fields
export const getScrapeURLForCache = /* GraphQL */ `
  query GetScrapeURLForCache($id: ID!) {
    getScrapeURL(id: $id) {
      id
      url
      latestS3Key
      lastScrapedAt
      contentHash
      etag
      lastModifiedHeader
      s3StorageEnabled
      lastContentChangeAt
      lastCacheHitAt
    }
  }
`;


// ===================================================================
// DEBUG QUERIES FOR PlayersPage.tsx
// All queries have been updated to remove the 'total' field.
// ===================================================================

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
        firstGamePlayed
        lastPlayedDate
        targetingClassification
        registrationDate
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
        isMultiDayTournament
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
          buyIn
          gameStartDateTime
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
          gameStartDateTime
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
    listPlayerTransactions(
      filter: $filter
      limit: $limit
      nextToken: $nextToken
    ) {
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

// ===================================================================
// DEBUG QUERIES FOR GamesPage.tsx
// All queries have been updated to remove the 'total' field.
// ===================================================================

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
        gameVariant
        gameStatus
        gameStartDateTime
        registrationStatus
        buyIn
        venueId
        tournamentId
        entityId
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

// ===================================================================
// DEDICATED COUNT QUERIES
// ===================================================================

export const getPlayerCount = /* GraphQL */ `
  query GetPlayerCount {
    playerCount
  }
`;

export const getPlayerSummaryCount = /* GraphQL */ `
  query GetPlayerSummaryCount {
    playerSummaryCount
  }
`;

export const getPlayerEntryCount = /* GraphQL */ `
  query GetPlayerEntryCount {
    playerEntryCount
  }
`;

export const getPlayerResultCount = /* GraphQL */ `
  query GetPlayerResultCount {
    playerResultCount
  }
`;

export const getPlayerVenueCount = /* GraphQL */ `
  query GetPlayerVenueCount {
    playerVenueCount
  }
`;

export const getPlayerTransactionCount = /* GraphQL */ `
  query GetPlayerTransactionCount {
    playerTransactionCount
  }
`;

export const getPlayerCreditsCount = /* GraphQL */ `
  query GetPlayerCreditsCount {
    playerCreditsCount
  }
`;

export const getPlayerPointsCount = /* GraphQL */ `
  query GetPlayerPointsCount {
    playerPointsCount
  }
`;

export const getPlayerTicketCount = /* GraphQL */ `
  query GetPlayerTicketCount {
    playerTicketCount
  }
`;

export const getPlayerMarketingPreferencesCount = /* GraphQL */ `
  query GetPlayerMarketingPreferencesCount {
    playerMarketingPreferencesCount
  }
`;

export const getPlayerMarketingMessageCount = /* GraphQL */ `
  query GetPlayerMarketingMessageCount {
    playerMarketingMessageCount
  }
`;

export const getGameCount = /* GraphQL */ `
  query GetGameCount {
    gameCount
  }
`;

export const getTournamentStructureCount = /* GraphQL */ `
  query GetTournamentStructureCount {
    tournamentStructureCount
  }
`;