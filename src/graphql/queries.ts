/* tslint:disable */
/* eslint-disable */
// this is an auto generated file. This will be overwritten

import * as APITypes from "../API";
type GeneratedQuery<InputType, OutputType> = string & {
  __generatedQueryInput: InputType;
  __generatedQueryOutput: OutputType;
};

export const fetchTournamentDataRange = /* GraphQL */ `query FetchTournamentDataRange($startId: Int!, $endId: Int!) {
  fetchTournamentDataRange(startId: $startId, endId: $endId) {
    id
    name
    status
    registrationStatus
    gameStartDateTime
    inDatabase
    doNotScrape
    error
    __typename
  }
}
` as GeneratedQuery<
  APITypes.FetchTournamentDataRangeQueryVariables,
  APITypes.FetchTournamentDataRangeQuery
>;
export const getDataSync = /* GraphQL */ `query GetDataSync($id: ID!) {
  getDataSync(id: $id) {
    id
    syncedAt
    method
    sourceUrl
    title
    content
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GetDataSyncQueryVariables,
  APITypes.GetDataSyncQuery
>;
export const listDataSyncs = /* GraphQL */ `query ListDataSyncs(
  $filter: ModelDataSyncFilterInput
  $limit: Int
  $nextToken: String
) {
  listDataSyncs(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
      id
      syncedAt
      method
      sourceUrl
      title
      content
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListDataSyncsQueryVariables,
  APITypes.ListDataSyncsQuery
>;
export const syncDataSyncs = /* GraphQL */ `query SyncDataSyncs(
  $filter: ModelDataSyncFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncDataSyncs(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      syncedAt
      method
      sourceUrl
      title
      content
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncDataSyncsQueryVariables,
  APITypes.SyncDataSyncsQuery
>;
export const getScrapeStructure = /* GraphQL */ `query GetScrapeStructure($id: ID!) {
  getScrapeStructure(id: $id) {
    id
    fields
    structureLabel
    occurrenceCount
    firstSeenAt
    lastSeenAt
    exampleUrl
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GetScrapeStructureQueryVariables,
  APITypes.GetScrapeStructureQuery
>;
export const listScrapeStructures = /* GraphQL */ `query ListScrapeStructures(
  $filter: ModelScrapeStructureFilterInput
  $limit: Int
  $nextToken: String
) {
  listScrapeStructures(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
      id
      fields
      structureLabel
      occurrenceCount
      firstSeenAt
      lastSeenAt
      exampleUrl
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListScrapeStructuresQueryVariables,
  APITypes.ListScrapeStructuresQuery
>;
export const syncScrapeStructures = /* GraphQL */ `query SyncScrapeStructures(
  $filter: ModelScrapeStructureFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncScrapeStructures(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      fields
      structureLabel
      occurrenceCount
      firstSeenAt
      lastSeenAt
      exampleUrl
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncScrapeStructuresQueryVariables,
  APITypes.SyncScrapeStructuresQuery
>;
export const getAsset = /* GraphQL */ `query GetAsset($id: ID!) {
  getAsset(id: $id) {
    id
    name
    type
    condition
    acquiredDate
    lastCheckedDate
    venueId
    venue {
      id
      venueNumber
      name
      aliases
      address
      city
      country
      details {
        id
        venueId
        startDate
        status
        lastCustomerSuccessVisit
        totalGamesHeld
        averagePlayersPerGame
        gameNights
        venue {
          id
          venueNumber
          name
          aliases
          address
          city
          country
          details {
            id
            venueId
            startDate
            status
            lastCustomerSuccessVisit
            totalGamesHeld
            averagePlayersPerGame
            gameNights
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          assets {
            nextToken
            startedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          playerMemberships {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          venueDetailsId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      assets {
        items {
          id
          name
          type
          condition
          acquiredDate
          lastCheckedDate
          venueId
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      games {
        items {
          id
          name
          type
          status
          gameStartDateTime
          gameEndDateTime
          venueId
          sourceUrl
          doNotScrape
          sourceDataIssue
          seriesName
          isAdHoc
          isSeries
          isRecurring
          isSatellite
          registrationStatus
          gameVariant
          prizepool
          revenueByEntries
          totalEntries
          totalRebuys
          totalAddons
          totalDuration
          gameTags
          tournamentType
          buyIn
          rake
          startingStack
          hasGuarantee
          guaranteeAmount
          playersRemaining
          tournamentStructureId
          cashStructureId
          venue {
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
            venueDetailsId
            __typename
          }
          tournamentStructure {
            id
            name
            description
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          cashStructure {
            id
            name
            smallBlind
            bigBlind
            minBuyIn
            maxBuyIn
            rakeStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          playerResults {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      playerMemberships {
        items {
          id
          playerId
          venueId
          totalGamesPlayed
          averageBuyIn
          firstPlayedDate
          lastPlayedDate
          targetingClassification
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      venueDetailsId
      __typename
    }
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<APITypes.GetAssetQueryVariables, APITypes.GetAssetQuery>;
export const listAssets = /* GraphQL */ `query ListAssets(
  $filter: ModelAssetFilterInput
  $limit: Int
  $nextToken: String
) {
  listAssets(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
      id
      name
      type
      condition
      acquiredDate
      lastCheckedDate
      venueId
      venue {
        id
        venueNumber
        name
        aliases
        address
        city
        country
        details {
          id
          venueId
          startDate
          status
          lastCustomerSuccessVisit
          totalGamesHeld
          averagePlayersPerGame
          gameNights
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        assets {
          items {
            id
            name
            type
            condition
            acquiredDate
            lastCheckedDate
            venueId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        playerMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        venueDetailsId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListAssetsQueryVariables,
  APITypes.ListAssetsQuery
>;
export const syncAssets = /* GraphQL */ `query SyncAssets(
  $filter: ModelAssetFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncAssets(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      name
      type
      condition
      acquiredDate
      lastCheckedDate
      venueId
      venue {
        id
        venueNumber
        name
        aliases
        address
        city
        country
        details {
          id
          venueId
          startDate
          status
          lastCustomerSuccessVisit
          totalGamesHeld
          averagePlayersPerGame
          gameNights
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        assets {
          items {
            id
            name
            type
            condition
            acquiredDate
            lastCheckedDate
            venueId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        playerMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        venueDetailsId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncAssetsQueryVariables,
  APITypes.SyncAssetsQuery
>;
export const getVenue = /* GraphQL */ `query GetVenue($id: ID!) {
  getVenue(id: $id) {
    id
    venueNumber
    name
    aliases
    address
    city
    country
    details {
      id
      venueId
      startDate
      status
      lastCustomerSuccessVisit
      totalGamesHeld
      averagePlayersPerGame
      gameNights
      venue {
        id
        venueNumber
        name
        aliases
        address
        city
        country
        details {
          id
          venueId
          startDate
          status
          lastCustomerSuccessVisit
          totalGamesHeld
          averagePlayersPerGame
          gameNights
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        assets {
          items {
            id
            name
            type
            condition
            acquiredDate
            lastCheckedDate
            venueId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        playerMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        venueDetailsId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    assets {
      items {
        id
        name
        type
        condition
        acquiredDate
        lastCheckedDate
        venueId
        venue {
          id
          venueNumber
          name
          aliases
          address
          city
          country
          details {
            id
            venueId
            startDate
            status
            lastCustomerSuccessVisit
            totalGamesHeld
            averagePlayersPerGame
            gameNights
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          assets {
            nextToken
            startedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          playerMemberships {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          venueDetailsId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      nextToken
      startedAt
      __typename
    }
    games {
      items {
        id
        name
        type
        status
        gameStartDateTime
        gameEndDateTime
        venueId
        sourceUrl
        doNotScrape
        sourceDataIssue
        seriesName
        isAdHoc
        isSeries
        isRecurring
        isSatellite
        registrationStatus
        gameVariant
        prizepool
        revenueByEntries
        totalEntries
        totalRebuys
        totalAddons
        totalDuration
        gameTags
        tournamentType
        buyIn
        rake
        startingStack
        hasGuarantee
        guaranteeAmount
        playersRemaining
        tournamentStructureId
        cashStructureId
        venue {
          id
          venueNumber
          name
          aliases
          address
          city
          country
          details {
            id
            venueId
            startDate
            status
            lastCustomerSuccessVisit
            totalGamesHeld
            averagePlayersPerGame
            gameNights
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          assets {
            nextToken
            startedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          playerMemberships {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          venueDetailsId
          __typename
        }
        tournamentStructure {
          id
          name
          description
          levels {
            levelNumber
            durationMinutes
            smallBlind
            bigBlind
            ante
            breakMinutes
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        cashStructure {
          id
          name
          smallBlind
          bigBlind
          minBuyIn
          maxBuyIn
          rakeStructureId
          rakeStructure {
            id
            name
            rakePercentage
            maxRake
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        playerResults {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      nextToken
      startedAt
      __typename
    }
    playerMemberships {
      items {
        id
        playerId
        venueId
        totalGamesPlayed
        averageBuyIn
        firstPlayedDate
        lastPlayedDate
        targetingClassification
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        venue {
          id
          venueNumber
          name
          aliases
          address
          city
          country
          details {
            id
            venueId
            startDate
            status
            lastCustomerSuccessVisit
            totalGamesHeld
            averagePlayersPerGame
            gameNights
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          assets {
            nextToken
            startedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          playerMemberships {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          venueDetailsId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      nextToken
      startedAt
      __typename
    }
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    venueDetailsId
    __typename
  }
}
` as GeneratedQuery<APITypes.GetVenueQueryVariables, APITypes.GetVenueQuery>;
export const listVenues = /* GraphQL */ `query ListVenues(
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
      details {
        id
        venueId
        startDate
        status
        lastCustomerSuccessVisit
        totalGamesHeld
        averagePlayersPerGame
        gameNights
        venue {
          id
          venueNumber
          name
          aliases
          address
          city
          country
          details {
            id
            venueId
            startDate
            status
            lastCustomerSuccessVisit
            totalGamesHeld
            averagePlayersPerGame
            gameNights
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          assets {
            nextToken
            startedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          playerMemberships {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          venueDetailsId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      assets {
        items {
          id
          name
          type
          condition
          acquiredDate
          lastCheckedDate
          venueId
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      games {
        items {
          id
          name
          type
          status
          gameStartDateTime
          gameEndDateTime
          venueId
          sourceUrl
          doNotScrape
          sourceDataIssue
          seriesName
          isAdHoc
          isSeries
          isRecurring
          isSatellite
          registrationStatus
          gameVariant
          prizepool
          revenueByEntries
          totalEntries
          totalRebuys
          totalAddons
          totalDuration
          gameTags
          tournamentType
          buyIn
          rake
          startingStack
          hasGuarantee
          guaranteeAmount
          playersRemaining
          tournamentStructureId
          cashStructureId
          venue {
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
            venueDetailsId
            __typename
          }
          tournamentStructure {
            id
            name
            description
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          cashStructure {
            id
            name
            smallBlind
            bigBlind
            minBuyIn
            maxBuyIn
            rakeStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          playerResults {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      playerMemberships {
        items {
          id
          playerId
          venueId
          totalGamesPlayed
          averageBuyIn
          firstPlayedDate
          lastPlayedDate
          targetingClassification
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      venueDetailsId
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListVenuesQueryVariables,
  APITypes.ListVenuesQuery
>;
export const syncVenues = /* GraphQL */ `query SyncVenues(
  $filter: ModelVenueFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncVenues(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      venueNumber
      name
      aliases
      address
      city
      country
      details {
        id
        venueId
        startDate
        status
        lastCustomerSuccessVisit
        totalGamesHeld
        averagePlayersPerGame
        gameNights
        venue {
          id
          venueNumber
          name
          aliases
          address
          city
          country
          details {
            id
            venueId
            startDate
            status
            lastCustomerSuccessVisit
            totalGamesHeld
            averagePlayersPerGame
            gameNights
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          assets {
            nextToken
            startedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          playerMemberships {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          venueDetailsId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      assets {
        items {
          id
          name
          type
          condition
          acquiredDate
          lastCheckedDate
          venueId
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      games {
        items {
          id
          name
          type
          status
          gameStartDateTime
          gameEndDateTime
          venueId
          sourceUrl
          doNotScrape
          sourceDataIssue
          seriesName
          isAdHoc
          isSeries
          isRecurring
          isSatellite
          registrationStatus
          gameVariant
          prizepool
          revenueByEntries
          totalEntries
          totalRebuys
          totalAddons
          totalDuration
          gameTags
          tournamentType
          buyIn
          rake
          startingStack
          hasGuarantee
          guaranteeAmount
          playersRemaining
          tournamentStructureId
          cashStructureId
          venue {
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
            venueDetailsId
            __typename
          }
          tournamentStructure {
            id
            name
            description
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          cashStructure {
            id
            name
            smallBlind
            bigBlind
            minBuyIn
            maxBuyIn
            rakeStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          playerResults {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      playerMemberships {
        items {
          id
          playerId
          venueId
          totalGamesPlayed
          averageBuyIn
          firstPlayedDate
          lastPlayedDate
          targetingClassification
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      venueDetailsId
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncVenuesQueryVariables,
  APITypes.SyncVenuesQuery
>;
export const getVenueDetails = /* GraphQL */ `query GetVenueDetails($id: ID!) {
  getVenueDetails(id: $id) {
    id
    venueId
    startDate
    status
    lastCustomerSuccessVisit
    totalGamesHeld
    averagePlayersPerGame
    gameNights
    venue {
      id
      venueNumber
      name
      aliases
      address
      city
      country
      details {
        id
        venueId
        startDate
        status
        lastCustomerSuccessVisit
        totalGamesHeld
        averagePlayersPerGame
        gameNights
        venue {
          id
          venueNumber
          name
          aliases
          address
          city
          country
          details {
            id
            venueId
            startDate
            status
            lastCustomerSuccessVisit
            totalGamesHeld
            averagePlayersPerGame
            gameNights
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          assets {
            nextToken
            startedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          playerMemberships {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          venueDetailsId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      assets {
        items {
          id
          name
          type
          condition
          acquiredDate
          lastCheckedDate
          venueId
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      games {
        items {
          id
          name
          type
          status
          gameStartDateTime
          gameEndDateTime
          venueId
          sourceUrl
          doNotScrape
          sourceDataIssue
          seriesName
          isAdHoc
          isSeries
          isRecurring
          isSatellite
          registrationStatus
          gameVariant
          prizepool
          revenueByEntries
          totalEntries
          totalRebuys
          totalAddons
          totalDuration
          gameTags
          tournamentType
          buyIn
          rake
          startingStack
          hasGuarantee
          guaranteeAmount
          playersRemaining
          tournamentStructureId
          cashStructureId
          venue {
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
            venueDetailsId
            __typename
          }
          tournamentStructure {
            id
            name
            description
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          cashStructure {
            id
            name
            smallBlind
            bigBlind
            minBuyIn
            maxBuyIn
            rakeStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          playerResults {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      playerMemberships {
        items {
          id
          playerId
          venueId
          totalGamesPlayed
          averageBuyIn
          firstPlayedDate
          lastPlayedDate
          targetingClassification
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      venueDetailsId
      __typename
    }
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GetVenueDetailsQueryVariables,
  APITypes.GetVenueDetailsQuery
>;
export const listVenueDetails = /* GraphQL */ `query ListVenueDetails(
  $filter: ModelVenueDetailsFilterInput
  $limit: Int
  $nextToken: String
) {
  listVenueDetails(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
      id
      venueId
      startDate
      status
      lastCustomerSuccessVisit
      totalGamesHeld
      averagePlayersPerGame
      gameNights
      venue {
        id
        venueNumber
        name
        aliases
        address
        city
        country
        details {
          id
          venueId
          startDate
          status
          lastCustomerSuccessVisit
          totalGamesHeld
          averagePlayersPerGame
          gameNights
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        assets {
          items {
            id
            name
            type
            condition
            acquiredDate
            lastCheckedDate
            venueId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        playerMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        venueDetailsId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListVenueDetailsQueryVariables,
  APITypes.ListVenueDetailsQuery
>;
export const syncVenueDetails = /* GraphQL */ `query SyncVenueDetails(
  $filter: ModelVenueDetailsFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncVenueDetails(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      venueId
      startDate
      status
      lastCustomerSuccessVisit
      totalGamesHeld
      averagePlayersPerGame
      gameNights
      venue {
        id
        venueNumber
        name
        aliases
        address
        city
        country
        details {
          id
          venueId
          startDate
          status
          lastCustomerSuccessVisit
          totalGamesHeld
          averagePlayersPerGame
          gameNights
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        assets {
          items {
            id
            name
            type
            condition
            acquiredDate
            lastCheckedDate
            venueId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        playerMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        venueDetailsId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncVenueDetailsQueryVariables,
  APITypes.SyncVenueDetailsQuery
>;
export const getGame = /* GraphQL */ `query GetGame($id: ID!) {
  getGame(id: $id) {
    id
    name
    type
    status
    gameStartDateTime
    gameEndDateTime
    venueId
    sourceUrl
    doNotScrape
    sourceDataIssue
    seriesName
    isAdHoc
    isSeries
    isRecurring
    isSatellite
    registrationStatus
    gameVariant
    prizepool
    revenueByEntries
    totalEntries
    totalRebuys
    totalAddons
    totalDuration
    gameTags
    tournamentType
    buyIn
    rake
    startingStack
    hasGuarantee
    guaranteeAmount
    playersRemaining
    tournamentStructureId
    cashStructureId
    venue {
      id
      venueNumber
      name
      aliases
      address
      city
      country
      details {
        id
        venueId
        startDate
        status
        lastCustomerSuccessVisit
        totalGamesHeld
        averagePlayersPerGame
        gameNights
        venue {
          id
          venueNumber
          name
          aliases
          address
          city
          country
          details {
            id
            venueId
            startDate
            status
            lastCustomerSuccessVisit
            totalGamesHeld
            averagePlayersPerGame
            gameNights
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          assets {
            nextToken
            startedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          playerMemberships {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          venueDetailsId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      assets {
        items {
          id
          name
          type
          condition
          acquiredDate
          lastCheckedDate
          venueId
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      games {
        items {
          id
          name
          type
          status
          gameStartDateTime
          gameEndDateTime
          venueId
          sourceUrl
          doNotScrape
          sourceDataIssue
          seriesName
          isAdHoc
          isSeries
          isRecurring
          isSatellite
          registrationStatus
          gameVariant
          prizepool
          revenueByEntries
          totalEntries
          totalRebuys
          totalAddons
          totalDuration
          gameTags
          tournamentType
          buyIn
          rake
          startingStack
          hasGuarantee
          guaranteeAmount
          playersRemaining
          tournamentStructureId
          cashStructureId
          venue {
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
            venueDetailsId
            __typename
          }
          tournamentStructure {
            id
            name
            description
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          cashStructure {
            id
            name
            smallBlind
            bigBlind
            minBuyIn
            maxBuyIn
            rakeStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          playerResults {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      playerMemberships {
        items {
          id
          playerId
          venueId
          totalGamesPlayed
          averageBuyIn
          firstPlayedDate
          lastPlayedDate
          targetingClassification
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      venueDetailsId
      __typename
    }
    tournamentStructure {
      id
      name
      description
      levels {
        levelNumber
        durationMinutes
        smallBlind
        bigBlind
        ante
        breakMinutes
        __typename
      }
      games {
        items {
          id
          name
          type
          status
          gameStartDateTime
          gameEndDateTime
          venueId
          sourceUrl
          doNotScrape
          sourceDataIssue
          seriesName
          isAdHoc
          isSeries
          isRecurring
          isSatellite
          registrationStatus
          gameVariant
          prizepool
          revenueByEntries
          totalEntries
          totalRebuys
          totalAddons
          totalDuration
          gameTags
          tournamentType
          buyIn
          rake
          startingStack
          hasGuarantee
          guaranteeAmount
          playersRemaining
          tournamentStructureId
          cashStructureId
          venue {
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
            venueDetailsId
            __typename
          }
          tournamentStructure {
            id
            name
            description
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          cashStructure {
            id
            name
            smallBlind
            bigBlind
            minBuyIn
            maxBuyIn
            rakeStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          playerResults {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    cashStructure {
      id
      name
      smallBlind
      bigBlind
      minBuyIn
      maxBuyIn
      rakeStructureId
      rakeStructure {
        id
        name
        rakePercentage
        maxRake
        cashStructures {
          items {
            id
            name
            smallBlind
            bigBlind
            minBuyIn
            maxBuyIn
            rakeStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      games {
        items {
          id
          name
          type
          status
          gameStartDateTime
          gameEndDateTime
          venueId
          sourceUrl
          doNotScrape
          sourceDataIssue
          seriesName
          isAdHoc
          isSeries
          isRecurring
          isSatellite
          registrationStatus
          gameVariant
          prizepool
          revenueByEntries
          totalEntries
          totalRebuys
          totalAddons
          totalDuration
          gameTags
          tournamentType
          buyIn
          rake
          startingStack
          hasGuarantee
          guaranteeAmount
          playersRemaining
          tournamentStructureId
          cashStructureId
          venue {
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
            venueDetailsId
            __typename
          }
          tournamentStructure {
            id
            name
            description
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          cashStructure {
            id
            name
            smallBlind
            bigBlind
            minBuyIn
            maxBuyIn
            rakeStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          playerResults {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    playerResults {
      items {
        id
        playerId
        gameId
        finishingPlace
        isMultiDayQualification
        prizeWon
        amountWon
        totalRunners
        game {
          id
          name
          type
          status
          gameStartDateTime
          gameEndDateTime
          venueId
          sourceUrl
          doNotScrape
          sourceDataIssue
          seriesName
          isAdHoc
          isSeries
          isRecurring
          isSatellite
          registrationStatus
          gameVariant
          prizepool
          revenueByEntries
          totalEntries
          totalRebuys
          totalAddons
          totalDuration
          gameTags
          tournamentType
          buyIn
          rake
          startingStack
          hasGuarantee
          guaranteeAmount
          playersRemaining
          tournamentStructureId
          cashStructureId
          venue {
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
            venueDetailsId
            __typename
          }
          tournamentStructure {
            id
            name
            description
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          cashStructure {
            id
            name
            smallBlind
            bigBlind
            minBuyIn
            maxBuyIn
            rakeStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          playerResults {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      nextToken
      startedAt
      __typename
    }
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<APITypes.GetGameQueryVariables, APITypes.GetGameQuery>;
export const listGames = /* GraphQL */ `query ListGames(
  $filter: ModelGameFilterInput
  $limit: Int
  $nextToken: String
) {
  listGames(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
      id
      name
      type
      status
      gameStartDateTime
      gameEndDateTime
      venueId
      sourceUrl
      doNotScrape
      sourceDataIssue
      seriesName
      isAdHoc
      isSeries
      isRecurring
      isSatellite
      registrationStatus
      gameVariant
      prizepool
      revenueByEntries
      totalEntries
      totalRebuys
      totalAddons
      totalDuration
      gameTags
      tournamentType
      buyIn
      rake
      startingStack
      hasGuarantee
      guaranteeAmount
      playersRemaining
      tournamentStructureId
      cashStructureId
      venue {
        id
        venueNumber
        name
        aliases
        address
        city
        country
        details {
          id
          venueId
          startDate
          status
          lastCustomerSuccessVisit
          totalGamesHeld
          averagePlayersPerGame
          gameNights
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        assets {
          items {
            id
            name
            type
            condition
            acquiredDate
            lastCheckedDate
            venueId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        playerMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        venueDetailsId
        __typename
      }
      tournamentStructure {
        id
        name
        description
        levels {
          levelNumber
          durationMinutes
          smallBlind
          bigBlind
          ante
          breakMinutes
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      cashStructure {
        id
        name
        smallBlind
        bigBlind
        minBuyIn
        maxBuyIn
        rakeStructureId
        rakeStructure {
          id
          name
          rakePercentage
          maxRake
          cashStructures {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      playerResults {
        items {
          id
          playerId
          gameId
          finishingPlace
          isMultiDayQualification
          prizeWon
          amountWon
          totalRunners
          game {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<APITypes.ListGamesQueryVariables, APITypes.ListGamesQuery>;
export const syncGames = /* GraphQL */ `query SyncGames(
  $filter: ModelGameFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncGames(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      name
      type
      status
      gameStartDateTime
      gameEndDateTime
      venueId
      sourceUrl
      doNotScrape
      sourceDataIssue
      seriesName
      isAdHoc
      isSeries
      isRecurring
      isSatellite
      registrationStatus
      gameVariant
      prizepool
      revenueByEntries
      totalEntries
      totalRebuys
      totalAddons
      totalDuration
      gameTags
      tournamentType
      buyIn
      rake
      startingStack
      hasGuarantee
      guaranteeAmount
      playersRemaining
      tournamentStructureId
      cashStructureId
      venue {
        id
        venueNumber
        name
        aliases
        address
        city
        country
        details {
          id
          venueId
          startDate
          status
          lastCustomerSuccessVisit
          totalGamesHeld
          averagePlayersPerGame
          gameNights
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        assets {
          items {
            id
            name
            type
            condition
            acquiredDate
            lastCheckedDate
            venueId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        playerMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        venueDetailsId
        __typename
      }
      tournamentStructure {
        id
        name
        description
        levels {
          levelNumber
          durationMinutes
          smallBlind
          bigBlind
          ante
          breakMinutes
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      cashStructure {
        id
        name
        smallBlind
        bigBlind
        minBuyIn
        maxBuyIn
        rakeStructureId
        rakeStructure {
          id
          name
          rakePercentage
          maxRake
          cashStructures {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      playerResults {
        items {
          id
          playerId
          gameId
          finishingPlace
          isMultiDayQualification
          prizeWon
          amountWon
          totalRunners
          game {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<APITypes.SyncGamesQueryVariables, APITypes.SyncGamesQuery>;
export const getTournamentStructure = /* GraphQL */ `query GetTournamentStructure($id: ID!) {
  getTournamentStructure(id: $id) {
    id
    name
    description
    levels {
      levelNumber
      durationMinutes
      smallBlind
      bigBlind
      ante
      breakMinutes
      __typename
    }
    games {
      items {
        id
        name
        type
        status
        gameStartDateTime
        gameEndDateTime
        venueId
        sourceUrl
        doNotScrape
        sourceDataIssue
        seriesName
        isAdHoc
        isSeries
        isRecurring
        isSatellite
        registrationStatus
        gameVariant
        prizepool
        revenueByEntries
        totalEntries
        totalRebuys
        totalAddons
        totalDuration
        gameTags
        tournamentType
        buyIn
        rake
        startingStack
        hasGuarantee
        guaranteeAmount
        playersRemaining
        tournamentStructureId
        cashStructureId
        venue {
          id
          venueNumber
          name
          aliases
          address
          city
          country
          details {
            id
            venueId
            startDate
            status
            lastCustomerSuccessVisit
            totalGamesHeld
            averagePlayersPerGame
            gameNights
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          assets {
            nextToken
            startedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          playerMemberships {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          venueDetailsId
          __typename
        }
        tournamentStructure {
          id
          name
          description
          levels {
            levelNumber
            durationMinutes
            smallBlind
            bigBlind
            ante
            breakMinutes
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        cashStructure {
          id
          name
          smallBlind
          bigBlind
          minBuyIn
          maxBuyIn
          rakeStructureId
          rakeStructure {
            id
            name
            rakePercentage
            maxRake
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        playerResults {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      nextToken
      startedAt
      __typename
    }
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GetTournamentStructureQueryVariables,
  APITypes.GetTournamentStructureQuery
>;
export const listTournamentStructures = /* GraphQL */ `query ListTournamentStructures(
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
      name
      description
      levels {
        levelNumber
        durationMinutes
        smallBlind
        bigBlind
        ante
        breakMinutes
        __typename
      }
      games {
        items {
          id
          name
          type
          status
          gameStartDateTime
          gameEndDateTime
          venueId
          sourceUrl
          doNotScrape
          sourceDataIssue
          seriesName
          isAdHoc
          isSeries
          isRecurring
          isSatellite
          registrationStatus
          gameVariant
          prizepool
          revenueByEntries
          totalEntries
          totalRebuys
          totalAddons
          totalDuration
          gameTags
          tournamentType
          buyIn
          rake
          startingStack
          hasGuarantee
          guaranteeAmount
          playersRemaining
          tournamentStructureId
          cashStructureId
          venue {
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
            venueDetailsId
            __typename
          }
          tournamentStructure {
            id
            name
            description
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          cashStructure {
            id
            name
            smallBlind
            bigBlind
            minBuyIn
            maxBuyIn
            rakeStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          playerResults {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListTournamentStructuresQueryVariables,
  APITypes.ListTournamentStructuresQuery
>;
export const syncTournamentStructures = /* GraphQL */ `query SyncTournamentStructures(
  $filter: ModelTournamentStructureFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncTournamentStructures(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      name
      description
      levels {
        levelNumber
        durationMinutes
        smallBlind
        bigBlind
        ante
        breakMinutes
        __typename
      }
      games {
        items {
          id
          name
          type
          status
          gameStartDateTime
          gameEndDateTime
          venueId
          sourceUrl
          doNotScrape
          sourceDataIssue
          seriesName
          isAdHoc
          isSeries
          isRecurring
          isSatellite
          registrationStatus
          gameVariant
          prizepool
          revenueByEntries
          totalEntries
          totalRebuys
          totalAddons
          totalDuration
          gameTags
          tournamentType
          buyIn
          rake
          startingStack
          hasGuarantee
          guaranteeAmount
          playersRemaining
          tournamentStructureId
          cashStructureId
          venue {
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
            venueDetailsId
            __typename
          }
          tournamentStructure {
            id
            name
            description
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          cashStructure {
            id
            name
            smallBlind
            bigBlind
            minBuyIn
            maxBuyIn
            rakeStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          playerResults {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncTournamentStructuresQueryVariables,
  APITypes.SyncTournamentStructuresQuery
>;
export const getRakeStructure = /* GraphQL */ `query GetRakeStructure($id: ID!) {
  getRakeStructure(id: $id) {
    id
    name
    rakePercentage
    maxRake
    cashStructures {
      items {
        id
        name
        smallBlind
        bigBlind
        minBuyIn
        maxBuyIn
        rakeStructureId
        rakeStructure {
          id
          name
          rakePercentage
          maxRake
          cashStructures {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      nextToken
      startedAt
      __typename
    }
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GetRakeStructureQueryVariables,
  APITypes.GetRakeStructureQuery
>;
export const listRakeStructures = /* GraphQL */ `query ListRakeStructures(
  $filter: ModelRakeStructureFilterInput
  $limit: Int
  $nextToken: String
) {
  listRakeStructures(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
      id
      name
      rakePercentage
      maxRake
      cashStructures {
        items {
          id
          name
          smallBlind
          bigBlind
          minBuyIn
          maxBuyIn
          rakeStructureId
          rakeStructure {
            id
            name
            rakePercentage
            maxRake
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListRakeStructuresQueryVariables,
  APITypes.ListRakeStructuresQuery
>;
export const syncRakeStructures = /* GraphQL */ `query SyncRakeStructures(
  $filter: ModelRakeStructureFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncRakeStructures(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      name
      rakePercentage
      maxRake
      cashStructures {
        items {
          id
          name
          smallBlind
          bigBlind
          minBuyIn
          maxBuyIn
          rakeStructureId
          rakeStructure {
            id
            name
            rakePercentage
            maxRake
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncRakeStructuresQueryVariables,
  APITypes.SyncRakeStructuresQuery
>;
export const getCashStructure = /* GraphQL */ `query GetCashStructure($id: ID!) {
  getCashStructure(id: $id) {
    id
    name
    smallBlind
    bigBlind
    minBuyIn
    maxBuyIn
    rakeStructureId
    rakeStructure {
      id
      name
      rakePercentage
      maxRake
      cashStructures {
        items {
          id
          name
          smallBlind
          bigBlind
          minBuyIn
          maxBuyIn
          rakeStructureId
          rakeStructure {
            id
            name
            rakePercentage
            maxRake
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    games {
      items {
        id
        name
        type
        status
        gameStartDateTime
        gameEndDateTime
        venueId
        sourceUrl
        doNotScrape
        sourceDataIssue
        seriesName
        isAdHoc
        isSeries
        isRecurring
        isSatellite
        registrationStatus
        gameVariant
        prizepool
        revenueByEntries
        totalEntries
        totalRebuys
        totalAddons
        totalDuration
        gameTags
        tournamentType
        buyIn
        rake
        startingStack
        hasGuarantee
        guaranteeAmount
        playersRemaining
        tournamentStructureId
        cashStructureId
        venue {
          id
          venueNumber
          name
          aliases
          address
          city
          country
          details {
            id
            venueId
            startDate
            status
            lastCustomerSuccessVisit
            totalGamesHeld
            averagePlayersPerGame
            gameNights
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          assets {
            nextToken
            startedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          playerMemberships {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          venueDetailsId
          __typename
        }
        tournamentStructure {
          id
          name
          description
          levels {
            levelNumber
            durationMinutes
            smallBlind
            bigBlind
            ante
            breakMinutes
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        cashStructure {
          id
          name
          smallBlind
          bigBlind
          minBuyIn
          maxBuyIn
          rakeStructureId
          rakeStructure {
            id
            name
            rakePercentage
            maxRake
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        playerResults {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      nextToken
      startedAt
      __typename
    }
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GetCashStructureQueryVariables,
  APITypes.GetCashStructureQuery
>;
export const listCashStructures = /* GraphQL */ `query ListCashStructures(
  $filter: ModelCashStructureFilterInput
  $limit: Int
  $nextToken: String
) {
  listCashStructures(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
      id
      name
      smallBlind
      bigBlind
      minBuyIn
      maxBuyIn
      rakeStructureId
      rakeStructure {
        id
        name
        rakePercentage
        maxRake
        cashStructures {
          items {
            id
            name
            smallBlind
            bigBlind
            minBuyIn
            maxBuyIn
            rakeStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      games {
        items {
          id
          name
          type
          status
          gameStartDateTime
          gameEndDateTime
          venueId
          sourceUrl
          doNotScrape
          sourceDataIssue
          seriesName
          isAdHoc
          isSeries
          isRecurring
          isSatellite
          registrationStatus
          gameVariant
          prizepool
          revenueByEntries
          totalEntries
          totalRebuys
          totalAddons
          totalDuration
          gameTags
          tournamentType
          buyIn
          rake
          startingStack
          hasGuarantee
          guaranteeAmount
          playersRemaining
          tournamentStructureId
          cashStructureId
          venue {
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
            venueDetailsId
            __typename
          }
          tournamentStructure {
            id
            name
            description
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          cashStructure {
            id
            name
            smallBlind
            bigBlind
            minBuyIn
            maxBuyIn
            rakeStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          playerResults {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListCashStructuresQueryVariables,
  APITypes.ListCashStructuresQuery
>;
export const syncCashStructures = /* GraphQL */ `query SyncCashStructures(
  $filter: ModelCashStructureFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncCashStructures(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      name
      smallBlind
      bigBlind
      minBuyIn
      maxBuyIn
      rakeStructureId
      rakeStructure {
        id
        name
        rakePercentage
        maxRake
        cashStructures {
          items {
            id
            name
            smallBlind
            bigBlind
            minBuyIn
            maxBuyIn
            rakeStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      games {
        items {
          id
          name
          type
          status
          gameStartDateTime
          gameEndDateTime
          venueId
          sourceUrl
          doNotScrape
          sourceDataIssue
          seriesName
          isAdHoc
          isSeries
          isRecurring
          isSatellite
          registrationStatus
          gameVariant
          prizepool
          revenueByEntries
          totalEntries
          totalRebuys
          totalAddons
          totalDuration
          gameTags
          tournamentType
          buyIn
          rake
          startingStack
          hasGuarantee
          guaranteeAmount
          playersRemaining
          tournamentStructureId
          cashStructureId
          venue {
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
            venueDetailsId
            __typename
          }
          tournamentStructure {
            id
            name
            description
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          cashStructure {
            id
            name
            smallBlind
            bigBlind
            minBuyIn
            maxBuyIn
            rakeStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          playerResults {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncCashStructuresQueryVariables,
  APITypes.SyncCashStructuresQuery
>;
export const getPlayer = /* GraphQL */ `query GetPlayer($id: ID!) {
  getPlayer(id: $id) {
    id
    firstName
    givenName
    lastName
    email
    phone
    registrationVenueId
    creationDate
    lastPlayedDate
    status
    category
    targetingClassification
    tier
    transactions {
      items {
        id
        playerId
        type
        amount
        paymentSource
        transactionDate
        rake
        notes
        gameId
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      nextToken
      startedAt
      __typename
    }
    results {
      items {
        id
        playerId
        gameId
        finishingPlace
        isMultiDayQualification
        prizeWon
        amountWon
        totalRunners
        game {
          id
          name
          type
          status
          gameStartDateTime
          gameEndDateTime
          venueId
          sourceUrl
          doNotScrape
          sourceDataIssue
          seriesName
          isAdHoc
          isSeries
          isRecurring
          isSatellite
          registrationStatus
          gameVariant
          prizepool
          revenueByEntries
          totalEntries
          totalRebuys
          totalAddons
          totalDuration
          gameTags
          tournamentType
          buyIn
          rake
          startingStack
          hasGuarantee
          guaranteeAmount
          playersRemaining
          tournamentStructureId
          cashStructureId
          venue {
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
            venueDetailsId
            __typename
          }
          tournamentStructure {
            id
            name
            description
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          cashStructure {
            id
            name
            smallBlind
            bigBlind
            minBuyIn
            maxBuyIn
            rakeStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          playerResults {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      nextToken
      startedAt
      __typename
    }
    tickets {
      items {
        id
        playerId
        ticketTemplateId
        assignedAt
        expiryDate
        status
        usedInGameId
        ticketTemplate {
          id
          name
          description
          value
          validityDays
          originGameId
          targetGameId
          playerTickets {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      nextToken
      startedAt
      __typename
    }
    marketingPreferences {
      id
      playerId
      optOutSms
      optOutEmail
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    venueMemberships {
      items {
        id
        playerId
        venueId
        totalGamesPlayed
        averageBuyIn
        firstPlayedDate
        lastPlayedDate
        targetingClassification
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        venue {
          id
          venueNumber
          name
          aliases
          address
          city
          country
          details {
            id
            venueId
            startDate
            status
            lastCustomerSuccessVisit
            totalGamesHeld
            averagePlayersPerGame
            gameNights
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          assets {
            nextToken
            startedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          playerMemberships {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          venueDetailsId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      nextToken
      startedAt
      __typename
    }
    summary {
      id
      playerId
      venuesVisited
      sessionsPlayed
      tournamentsPlayed
      cashGamesPlayed
      tournamentWinnings
      tournamentBuyIns
      cashGameWinnings
      cashGameBuyIns
      totalWinnings
      totalBuyIns
      netBalance
      tournamentITM
      tournamentsCashed
      lastUpdated
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    playerMarketingPreferencesId
    playerSummaryId
    __typename
  }
}
` as GeneratedQuery<APITypes.GetPlayerQueryVariables, APITypes.GetPlayerQuery>;
export const listPlayers = /* GraphQL */ `query ListPlayers(
  $filter: ModelPlayerFilterInput
  $limit: Int
  $nextToken: String
) {
  listPlayers(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
      id
      firstName
      givenName
      lastName
      email
      phone
      registrationVenueId
      creationDate
      lastPlayedDate
      status
      category
      targetingClassification
      tier
      transactions {
        items {
          id
          playerId
          type
          amount
          paymentSource
          transactionDate
          rake
          notes
          gameId
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      results {
        items {
          id
          playerId
          gameId
          finishingPlace
          isMultiDayQualification
          prizeWon
          amountWon
          totalRunners
          game {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      tickets {
        items {
          id
          playerId
          ticketTemplateId
          assignedAt
          expiryDate
          status
          usedInGameId
          ticketTemplate {
            id
            name
            description
            value
            validityDays
            originGameId
            targetGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      marketingPreferences {
        id
        playerId
        optOutSms
        optOutEmail
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      venueMemberships {
        items {
          id
          playerId
          venueId
          totalGamesPlayed
          averageBuyIn
          firstPlayedDate
          lastPlayedDate
          targetingClassification
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      summary {
        id
        playerId
        venuesVisited
        sessionsPlayed
        tournamentsPlayed
        cashGamesPlayed
        tournamentWinnings
        tournamentBuyIns
        cashGameWinnings
        cashGameBuyIns
        totalWinnings
        totalBuyIns
        netBalance
        tournamentITM
        tournamentsCashed
        lastUpdated
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      playerMarketingPreferencesId
      playerSummaryId
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListPlayersQueryVariables,
  APITypes.ListPlayersQuery
>;
export const syncPlayers = /* GraphQL */ `query SyncPlayers(
  $filter: ModelPlayerFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncPlayers(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      firstName
      givenName
      lastName
      email
      phone
      registrationVenueId
      creationDate
      lastPlayedDate
      status
      category
      targetingClassification
      tier
      transactions {
        items {
          id
          playerId
          type
          amount
          paymentSource
          transactionDate
          rake
          notes
          gameId
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      results {
        items {
          id
          playerId
          gameId
          finishingPlace
          isMultiDayQualification
          prizeWon
          amountWon
          totalRunners
          game {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      tickets {
        items {
          id
          playerId
          ticketTemplateId
          assignedAt
          expiryDate
          status
          usedInGameId
          ticketTemplate {
            id
            name
            description
            value
            validityDays
            originGameId
            targetGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      marketingPreferences {
        id
        playerId
        optOutSms
        optOutEmail
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      venueMemberships {
        items {
          id
          playerId
          venueId
          totalGamesPlayed
          averageBuyIn
          firstPlayedDate
          lastPlayedDate
          targetingClassification
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      summary {
        id
        playerId
        venuesVisited
        sessionsPlayed
        tournamentsPlayed
        cashGamesPlayed
        tournamentWinnings
        tournamentBuyIns
        cashGameWinnings
        cashGameBuyIns
        totalWinnings
        totalBuyIns
        netBalance
        tournamentITM
        tournamentsCashed
        lastUpdated
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      playerMarketingPreferencesId
      playerSummaryId
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncPlayersQueryVariables,
  APITypes.SyncPlayersQuery
>;
export const getPlayerSummary = /* GraphQL */ `query GetPlayerSummary($id: ID!) {
  getPlayerSummary(id: $id) {
    id
    playerId
    venuesVisited
    sessionsPlayed
    tournamentsPlayed
    cashGamesPlayed
    tournamentWinnings
    tournamentBuyIns
    cashGameWinnings
    cashGameBuyIns
    totalWinnings
    totalBuyIns
    netBalance
    tournamentITM
    tournamentsCashed
    lastUpdated
    player {
      id
      firstName
      givenName
      lastName
      email
      phone
      registrationVenueId
      creationDate
      lastPlayedDate
      status
      category
      targetingClassification
      tier
      transactions {
        items {
          id
          playerId
          type
          amount
          paymentSource
          transactionDate
          rake
          notes
          gameId
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      results {
        items {
          id
          playerId
          gameId
          finishingPlace
          isMultiDayQualification
          prizeWon
          amountWon
          totalRunners
          game {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      tickets {
        items {
          id
          playerId
          ticketTemplateId
          assignedAt
          expiryDate
          status
          usedInGameId
          ticketTemplate {
            id
            name
            description
            value
            validityDays
            originGameId
            targetGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      marketingPreferences {
        id
        playerId
        optOutSms
        optOutEmail
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      venueMemberships {
        items {
          id
          playerId
          venueId
          totalGamesPlayed
          averageBuyIn
          firstPlayedDate
          lastPlayedDate
          targetingClassification
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      summary {
        id
        playerId
        venuesVisited
        sessionsPlayed
        tournamentsPlayed
        cashGamesPlayed
        tournamentWinnings
        tournamentBuyIns
        cashGameWinnings
        cashGameBuyIns
        totalWinnings
        totalBuyIns
        netBalance
        tournamentITM
        tournamentsCashed
        lastUpdated
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      playerMarketingPreferencesId
      playerSummaryId
      __typename
    }
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GetPlayerSummaryQueryVariables,
  APITypes.GetPlayerSummaryQuery
>;
export const listPlayerSummaries = /* GraphQL */ `query ListPlayerSummaries(
  $filter: ModelPlayerSummaryFilterInput
  $limit: Int
  $nextToken: String
) {
  listPlayerSummaries(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
      id
      playerId
      venuesVisited
      sessionsPlayed
      tournamentsPlayed
      cashGamesPlayed
      tournamentWinnings
      tournamentBuyIns
      cashGameWinnings
      cashGameBuyIns
      totalWinnings
      totalBuyIns
      netBalance
      tournamentITM
      tournamentsCashed
      lastUpdated
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListPlayerSummariesQueryVariables,
  APITypes.ListPlayerSummariesQuery
>;
export const syncPlayerSummaries = /* GraphQL */ `query SyncPlayerSummaries(
  $filter: ModelPlayerSummaryFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncPlayerSummaries(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      playerId
      venuesVisited
      sessionsPlayed
      tournamentsPlayed
      cashGamesPlayed
      tournamentWinnings
      tournamentBuyIns
      cashGameWinnings
      cashGameBuyIns
      totalWinnings
      totalBuyIns
      netBalance
      tournamentITM
      tournamentsCashed
      lastUpdated
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncPlayerSummariesQueryVariables,
  APITypes.SyncPlayerSummariesQuery
>;
export const getPlayerVenue = /* GraphQL */ `query GetPlayerVenue($id: ID!) {
  getPlayerVenue(id: $id) {
    id
    playerId
    venueId
    totalGamesPlayed
    averageBuyIn
    firstPlayedDate
    lastPlayedDate
    targetingClassification
    player {
      id
      firstName
      givenName
      lastName
      email
      phone
      registrationVenueId
      creationDate
      lastPlayedDate
      status
      category
      targetingClassification
      tier
      transactions {
        items {
          id
          playerId
          type
          amount
          paymentSource
          transactionDate
          rake
          notes
          gameId
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      results {
        items {
          id
          playerId
          gameId
          finishingPlace
          isMultiDayQualification
          prizeWon
          amountWon
          totalRunners
          game {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      tickets {
        items {
          id
          playerId
          ticketTemplateId
          assignedAt
          expiryDate
          status
          usedInGameId
          ticketTemplate {
            id
            name
            description
            value
            validityDays
            originGameId
            targetGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      marketingPreferences {
        id
        playerId
        optOutSms
        optOutEmail
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      venueMemberships {
        items {
          id
          playerId
          venueId
          totalGamesPlayed
          averageBuyIn
          firstPlayedDate
          lastPlayedDate
          targetingClassification
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      summary {
        id
        playerId
        venuesVisited
        sessionsPlayed
        tournamentsPlayed
        cashGamesPlayed
        tournamentWinnings
        tournamentBuyIns
        cashGameWinnings
        cashGameBuyIns
        totalWinnings
        totalBuyIns
        netBalance
        tournamentITM
        tournamentsCashed
        lastUpdated
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      playerMarketingPreferencesId
      playerSummaryId
      __typename
    }
    venue {
      id
      venueNumber
      name
      aliases
      address
      city
      country
      details {
        id
        venueId
        startDate
        status
        lastCustomerSuccessVisit
        totalGamesHeld
        averagePlayersPerGame
        gameNights
        venue {
          id
          venueNumber
          name
          aliases
          address
          city
          country
          details {
            id
            venueId
            startDate
            status
            lastCustomerSuccessVisit
            totalGamesHeld
            averagePlayersPerGame
            gameNights
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          assets {
            nextToken
            startedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          playerMemberships {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          venueDetailsId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      assets {
        items {
          id
          name
          type
          condition
          acquiredDate
          lastCheckedDate
          venueId
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      games {
        items {
          id
          name
          type
          status
          gameStartDateTime
          gameEndDateTime
          venueId
          sourceUrl
          doNotScrape
          sourceDataIssue
          seriesName
          isAdHoc
          isSeries
          isRecurring
          isSatellite
          registrationStatus
          gameVariant
          prizepool
          revenueByEntries
          totalEntries
          totalRebuys
          totalAddons
          totalDuration
          gameTags
          tournamentType
          buyIn
          rake
          startingStack
          hasGuarantee
          guaranteeAmount
          playersRemaining
          tournamentStructureId
          cashStructureId
          venue {
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
            venueDetailsId
            __typename
          }
          tournamentStructure {
            id
            name
            description
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          cashStructure {
            id
            name
            smallBlind
            bigBlind
            minBuyIn
            maxBuyIn
            rakeStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          playerResults {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      playerMemberships {
        items {
          id
          playerId
          venueId
          totalGamesPlayed
          averageBuyIn
          firstPlayedDate
          lastPlayedDate
          targetingClassification
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      venueDetailsId
      __typename
    }
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GetPlayerVenueQueryVariables,
  APITypes.GetPlayerVenueQuery
>;
export const listPlayerVenues = /* GraphQL */ `query ListPlayerVenues(
  $filter: ModelPlayerVenueFilterInput
  $limit: Int
  $nextToken: String
) {
  listPlayerVenues(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
      id
      playerId
      venueId
      totalGamesPlayed
      averageBuyIn
      firstPlayedDate
      lastPlayedDate
      targetingClassification
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      venue {
        id
        venueNumber
        name
        aliases
        address
        city
        country
        details {
          id
          venueId
          startDate
          status
          lastCustomerSuccessVisit
          totalGamesHeld
          averagePlayersPerGame
          gameNights
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        assets {
          items {
            id
            name
            type
            condition
            acquiredDate
            lastCheckedDate
            venueId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        playerMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        venueDetailsId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListPlayerVenuesQueryVariables,
  APITypes.ListPlayerVenuesQuery
>;
export const syncPlayerVenues = /* GraphQL */ `query SyncPlayerVenues(
  $filter: ModelPlayerVenueFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncPlayerVenues(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      playerId
      venueId
      totalGamesPlayed
      averageBuyIn
      firstPlayedDate
      lastPlayedDate
      targetingClassification
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      venue {
        id
        venueNumber
        name
        aliases
        address
        city
        country
        details {
          id
          venueId
          startDate
          status
          lastCustomerSuccessVisit
          totalGamesHeld
          averagePlayersPerGame
          gameNights
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        assets {
          items {
            id
            name
            type
            condition
            acquiredDate
            lastCheckedDate
            venueId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        playerMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        venueDetailsId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncPlayerVenuesQueryVariables,
  APITypes.SyncPlayerVenuesQuery
>;
export const getPlayerTransaction = /* GraphQL */ `query GetPlayerTransaction($id: ID!) {
  getPlayerTransaction(id: $id) {
    id
    playerId
    type
    amount
    paymentSource
    transactionDate
    rake
    notes
    gameId
    player {
      id
      firstName
      givenName
      lastName
      email
      phone
      registrationVenueId
      creationDate
      lastPlayedDate
      status
      category
      targetingClassification
      tier
      transactions {
        items {
          id
          playerId
          type
          amount
          paymentSource
          transactionDate
          rake
          notes
          gameId
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      results {
        items {
          id
          playerId
          gameId
          finishingPlace
          isMultiDayQualification
          prizeWon
          amountWon
          totalRunners
          game {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      tickets {
        items {
          id
          playerId
          ticketTemplateId
          assignedAt
          expiryDate
          status
          usedInGameId
          ticketTemplate {
            id
            name
            description
            value
            validityDays
            originGameId
            targetGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      marketingPreferences {
        id
        playerId
        optOutSms
        optOutEmail
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      venueMemberships {
        items {
          id
          playerId
          venueId
          totalGamesPlayed
          averageBuyIn
          firstPlayedDate
          lastPlayedDate
          targetingClassification
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      summary {
        id
        playerId
        venuesVisited
        sessionsPlayed
        tournamentsPlayed
        cashGamesPlayed
        tournamentWinnings
        tournamentBuyIns
        cashGameWinnings
        cashGameBuyIns
        totalWinnings
        totalBuyIns
        netBalance
        tournamentITM
        tournamentsCashed
        lastUpdated
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      playerMarketingPreferencesId
      playerSummaryId
      __typename
    }
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GetPlayerTransactionQueryVariables,
  APITypes.GetPlayerTransactionQuery
>;
export const listPlayerTransactions = /* GraphQL */ `query ListPlayerTransactions(
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
      playerId
      type
      amount
      paymentSource
      transactionDate
      rake
      notes
      gameId
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListPlayerTransactionsQueryVariables,
  APITypes.ListPlayerTransactionsQuery
>;
export const syncPlayerTransactions = /* GraphQL */ `query SyncPlayerTransactions(
  $filter: ModelPlayerTransactionFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncPlayerTransactions(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      playerId
      type
      amount
      paymentSource
      transactionDate
      rake
      notes
      gameId
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncPlayerTransactionsQueryVariables,
  APITypes.SyncPlayerTransactionsQuery
>;
export const getPlayerResult = /* GraphQL */ `query GetPlayerResult($id: ID!) {
  getPlayerResult(id: $id) {
    id
    playerId
    gameId
    finishingPlace
    isMultiDayQualification
    prizeWon
    amountWon
    totalRunners
    game {
      id
      name
      type
      status
      gameStartDateTime
      gameEndDateTime
      venueId
      sourceUrl
      doNotScrape
      sourceDataIssue
      seriesName
      isAdHoc
      isSeries
      isRecurring
      isSatellite
      registrationStatus
      gameVariant
      prizepool
      revenueByEntries
      totalEntries
      totalRebuys
      totalAddons
      totalDuration
      gameTags
      tournamentType
      buyIn
      rake
      startingStack
      hasGuarantee
      guaranteeAmount
      playersRemaining
      tournamentStructureId
      cashStructureId
      venue {
        id
        venueNumber
        name
        aliases
        address
        city
        country
        details {
          id
          venueId
          startDate
          status
          lastCustomerSuccessVisit
          totalGamesHeld
          averagePlayersPerGame
          gameNights
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        assets {
          items {
            id
            name
            type
            condition
            acquiredDate
            lastCheckedDate
            venueId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        playerMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        venueDetailsId
        __typename
      }
      tournamentStructure {
        id
        name
        description
        levels {
          levelNumber
          durationMinutes
          smallBlind
          bigBlind
          ante
          breakMinutes
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      cashStructure {
        id
        name
        smallBlind
        bigBlind
        minBuyIn
        maxBuyIn
        rakeStructureId
        rakeStructure {
          id
          name
          rakePercentage
          maxRake
          cashStructures {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      playerResults {
        items {
          id
          playerId
          gameId
          finishingPlace
          isMultiDayQualification
          prizeWon
          amountWon
          totalRunners
          game {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    player {
      id
      firstName
      givenName
      lastName
      email
      phone
      registrationVenueId
      creationDate
      lastPlayedDate
      status
      category
      targetingClassification
      tier
      transactions {
        items {
          id
          playerId
          type
          amount
          paymentSource
          transactionDate
          rake
          notes
          gameId
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      results {
        items {
          id
          playerId
          gameId
          finishingPlace
          isMultiDayQualification
          prizeWon
          amountWon
          totalRunners
          game {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      tickets {
        items {
          id
          playerId
          ticketTemplateId
          assignedAt
          expiryDate
          status
          usedInGameId
          ticketTemplate {
            id
            name
            description
            value
            validityDays
            originGameId
            targetGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      marketingPreferences {
        id
        playerId
        optOutSms
        optOutEmail
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      venueMemberships {
        items {
          id
          playerId
          venueId
          totalGamesPlayed
          averageBuyIn
          firstPlayedDate
          lastPlayedDate
          targetingClassification
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      summary {
        id
        playerId
        venuesVisited
        sessionsPlayed
        tournamentsPlayed
        cashGamesPlayed
        tournamentWinnings
        tournamentBuyIns
        cashGameWinnings
        cashGameBuyIns
        totalWinnings
        totalBuyIns
        netBalance
        tournamentITM
        tournamentsCashed
        lastUpdated
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      playerMarketingPreferencesId
      playerSummaryId
      __typename
    }
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GetPlayerResultQueryVariables,
  APITypes.GetPlayerResultQuery
>;
export const listPlayerResults = /* GraphQL */ `query ListPlayerResults(
  $filter: ModelPlayerResultFilterInput
  $limit: Int
  $nextToken: String
) {
  listPlayerResults(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
      id
      playerId
      gameId
      finishingPlace
      isMultiDayQualification
      prizeWon
      amountWon
      totalRunners
      game {
        id
        name
        type
        status
        gameStartDateTime
        gameEndDateTime
        venueId
        sourceUrl
        doNotScrape
        sourceDataIssue
        seriesName
        isAdHoc
        isSeries
        isRecurring
        isSatellite
        registrationStatus
        gameVariant
        prizepool
        revenueByEntries
        totalEntries
        totalRebuys
        totalAddons
        totalDuration
        gameTags
        tournamentType
        buyIn
        rake
        startingStack
        hasGuarantee
        guaranteeAmount
        playersRemaining
        tournamentStructureId
        cashStructureId
        venue {
          id
          venueNumber
          name
          aliases
          address
          city
          country
          details {
            id
            venueId
            startDate
            status
            lastCustomerSuccessVisit
            totalGamesHeld
            averagePlayersPerGame
            gameNights
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          assets {
            nextToken
            startedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          playerMemberships {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          venueDetailsId
          __typename
        }
        tournamentStructure {
          id
          name
          description
          levels {
            levelNumber
            durationMinutes
            smallBlind
            bigBlind
            ante
            breakMinutes
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        cashStructure {
          id
          name
          smallBlind
          bigBlind
          minBuyIn
          maxBuyIn
          rakeStructureId
          rakeStructure {
            id
            name
            rakePercentage
            maxRake
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        playerResults {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListPlayerResultsQueryVariables,
  APITypes.ListPlayerResultsQuery
>;
export const syncPlayerResults = /* GraphQL */ `query SyncPlayerResults(
  $filter: ModelPlayerResultFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncPlayerResults(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      playerId
      gameId
      finishingPlace
      isMultiDayQualification
      prizeWon
      amountWon
      totalRunners
      game {
        id
        name
        type
        status
        gameStartDateTime
        gameEndDateTime
        venueId
        sourceUrl
        doNotScrape
        sourceDataIssue
        seriesName
        isAdHoc
        isSeries
        isRecurring
        isSatellite
        registrationStatus
        gameVariant
        prizepool
        revenueByEntries
        totalEntries
        totalRebuys
        totalAddons
        totalDuration
        gameTags
        tournamentType
        buyIn
        rake
        startingStack
        hasGuarantee
        guaranteeAmount
        playersRemaining
        tournamentStructureId
        cashStructureId
        venue {
          id
          venueNumber
          name
          aliases
          address
          city
          country
          details {
            id
            venueId
            startDate
            status
            lastCustomerSuccessVisit
            totalGamesHeld
            averagePlayersPerGame
            gameNights
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          assets {
            nextToken
            startedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          playerMemberships {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          venueDetailsId
          __typename
        }
        tournamentStructure {
          id
          name
          description
          levels {
            levelNumber
            durationMinutes
            smallBlind
            bigBlind
            ante
            breakMinutes
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        cashStructure {
          id
          name
          smallBlind
          bigBlind
          minBuyIn
          maxBuyIn
          rakeStructureId
          rakeStructure {
            id
            name
            rakePercentage
            maxRake
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        playerResults {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncPlayerResultsQueryVariables,
  APITypes.SyncPlayerResultsQuery
>;
export const getPlayerMarketingMessage = /* GraphQL */ `query GetPlayerMarketingMessage($id: ID!) {
  getPlayerMarketingMessage(id: $id) {
    id
    playerId
    marketingMessageId
    status
    sentAt
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GetPlayerMarketingMessageQueryVariables,
  APITypes.GetPlayerMarketingMessageQuery
>;
export const listPlayerMarketingMessages = /* GraphQL */ `query ListPlayerMarketingMessages(
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
      playerId
      marketingMessageId
      status
      sentAt
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListPlayerMarketingMessagesQueryVariables,
  APITypes.ListPlayerMarketingMessagesQuery
>;
export const syncPlayerMarketingMessages = /* GraphQL */ `query SyncPlayerMarketingMessages(
  $filter: ModelPlayerMarketingMessageFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncPlayerMarketingMessages(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      playerId
      marketingMessageId
      status
      sentAt
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncPlayerMarketingMessagesQueryVariables,
  APITypes.SyncPlayerMarketingMessagesQuery
>;
export const getPlayerMarketingPreferences = /* GraphQL */ `query GetPlayerMarketingPreferences($id: ID!) {
  getPlayerMarketingPreferences(id: $id) {
    id
    playerId
    optOutSms
    optOutEmail
    player {
      id
      firstName
      givenName
      lastName
      email
      phone
      registrationVenueId
      creationDate
      lastPlayedDate
      status
      category
      targetingClassification
      tier
      transactions {
        items {
          id
          playerId
          type
          amount
          paymentSource
          transactionDate
          rake
          notes
          gameId
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      results {
        items {
          id
          playerId
          gameId
          finishingPlace
          isMultiDayQualification
          prizeWon
          amountWon
          totalRunners
          game {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      tickets {
        items {
          id
          playerId
          ticketTemplateId
          assignedAt
          expiryDate
          status
          usedInGameId
          ticketTemplate {
            id
            name
            description
            value
            validityDays
            originGameId
            targetGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      marketingPreferences {
        id
        playerId
        optOutSms
        optOutEmail
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      venueMemberships {
        items {
          id
          playerId
          venueId
          totalGamesPlayed
          averageBuyIn
          firstPlayedDate
          lastPlayedDate
          targetingClassification
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      summary {
        id
        playerId
        venuesVisited
        sessionsPlayed
        tournamentsPlayed
        cashGamesPlayed
        tournamentWinnings
        tournamentBuyIns
        cashGameWinnings
        cashGameBuyIns
        totalWinnings
        totalBuyIns
        netBalance
        tournamentITM
        tournamentsCashed
        lastUpdated
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      playerMarketingPreferencesId
      playerSummaryId
      __typename
    }
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GetPlayerMarketingPreferencesQueryVariables,
  APITypes.GetPlayerMarketingPreferencesQuery
>;
export const listPlayerMarketingPreferences = /* GraphQL */ `query ListPlayerMarketingPreferences(
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
      playerId
      optOutSms
      optOutEmail
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListPlayerMarketingPreferencesQueryVariables,
  APITypes.ListPlayerMarketingPreferencesQuery
>;
export const syncPlayerMarketingPreferences = /* GraphQL */ `query SyncPlayerMarketingPreferences(
  $filter: ModelPlayerMarketingPreferencesFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncPlayerMarketingPreferences(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      playerId
      optOutSms
      optOutEmail
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncPlayerMarketingPreferencesQueryVariables,
  APITypes.SyncPlayerMarketingPreferencesQuery
>;
export const getTicketTemplate = /* GraphQL */ `query GetTicketTemplate($id: ID!) {
  getTicketTemplate(id: $id) {
    id
    name
    description
    value
    validityDays
    originGameId
    targetGameId
    playerTickets {
      items {
        id
        playerId
        ticketTemplateId
        assignedAt
        expiryDate
        status
        usedInGameId
        ticketTemplate {
          id
          name
          description
          value
          validityDays
          originGameId
          targetGameId
          playerTickets {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      nextToken
      startedAt
      __typename
    }
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GetTicketTemplateQueryVariables,
  APITypes.GetTicketTemplateQuery
>;
export const listTicketTemplates = /* GraphQL */ `query ListTicketTemplates(
  $filter: ModelTicketTemplateFilterInput
  $limit: Int
  $nextToken: String
) {
  listTicketTemplates(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
      id
      name
      description
      value
      validityDays
      originGameId
      targetGameId
      playerTickets {
        items {
          id
          playerId
          ticketTemplateId
          assignedAt
          expiryDate
          status
          usedInGameId
          ticketTemplate {
            id
            name
            description
            value
            validityDays
            originGameId
            targetGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListTicketTemplatesQueryVariables,
  APITypes.ListTicketTemplatesQuery
>;
export const syncTicketTemplates = /* GraphQL */ `query SyncTicketTemplates(
  $filter: ModelTicketTemplateFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncTicketTemplates(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      name
      description
      value
      validityDays
      originGameId
      targetGameId
      playerTickets {
        items {
          id
          playerId
          ticketTemplateId
          assignedAt
          expiryDate
          status
          usedInGameId
          ticketTemplate {
            id
            name
            description
            value
            validityDays
            originGameId
            targetGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncTicketTemplatesQueryVariables,
  APITypes.SyncTicketTemplatesQuery
>;
export const getPlayerTicket = /* GraphQL */ `query GetPlayerTicket($id: ID!) {
  getPlayerTicket(id: $id) {
    id
    playerId
    ticketTemplateId
    assignedAt
    expiryDate
    status
    usedInGameId
    ticketTemplate {
      id
      name
      description
      value
      validityDays
      originGameId
      targetGameId
      playerTickets {
        items {
          id
          playerId
          ticketTemplateId
          assignedAt
          expiryDate
          status
          usedInGameId
          ticketTemplate {
            id
            name
            description
            value
            validityDays
            originGameId
            targetGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    player {
      id
      firstName
      givenName
      lastName
      email
      phone
      registrationVenueId
      creationDate
      lastPlayedDate
      status
      category
      targetingClassification
      tier
      transactions {
        items {
          id
          playerId
          type
          amount
          paymentSource
          transactionDate
          rake
          notes
          gameId
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      results {
        items {
          id
          playerId
          gameId
          finishingPlace
          isMultiDayQualification
          prizeWon
          amountWon
          totalRunners
          game {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      tickets {
        items {
          id
          playerId
          ticketTemplateId
          assignedAt
          expiryDate
          status
          usedInGameId
          ticketTemplate {
            id
            name
            description
            value
            validityDays
            originGameId
            targetGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      marketingPreferences {
        id
        playerId
        optOutSms
        optOutEmail
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      venueMemberships {
        items {
          id
          playerId
          venueId
          totalGamesPlayed
          averageBuyIn
          firstPlayedDate
          lastPlayedDate
          targetingClassification
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      summary {
        id
        playerId
        venuesVisited
        sessionsPlayed
        tournamentsPlayed
        cashGamesPlayed
        tournamentWinnings
        tournamentBuyIns
        cashGameWinnings
        cashGameBuyIns
        totalWinnings
        totalBuyIns
        netBalance
        tournamentITM
        tournamentsCashed
        lastUpdated
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      playerMarketingPreferencesId
      playerSummaryId
      __typename
    }
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GetPlayerTicketQueryVariables,
  APITypes.GetPlayerTicketQuery
>;
export const listPlayerTickets = /* GraphQL */ `query ListPlayerTickets(
  $filter: ModelPlayerTicketFilterInput
  $limit: Int
  $nextToken: String
) {
  listPlayerTickets(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
      id
      playerId
      ticketTemplateId
      assignedAt
      expiryDate
      status
      usedInGameId
      ticketTemplate {
        id
        name
        description
        value
        validityDays
        originGameId
        targetGameId
        playerTickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListPlayerTicketsQueryVariables,
  APITypes.ListPlayerTicketsQuery
>;
export const syncPlayerTickets = /* GraphQL */ `query SyncPlayerTickets(
  $filter: ModelPlayerTicketFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncPlayerTickets(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      playerId
      ticketTemplateId
      assignedAt
      expiryDate
      status
      usedInGameId
      ticketTemplate {
        id
        name
        description
        value
        validityDays
        originGameId
        targetGameId
        playerTickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncPlayerTicketsQueryVariables,
  APITypes.SyncPlayerTicketsQuery
>;
export const getUser = /* GraphQL */ `query GetUser($id: ID!) {
  getUser(id: $id) {
    id
    username
    email
    role
    preferences {
      items {
        id
        userId
        page
        widget
        preference
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      nextToken
      startedAt
      __typename
    }
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<APITypes.GetUserQueryVariables, APITypes.GetUserQuery>;
export const listUsers = /* GraphQL */ `query ListUsers(
  $filter: ModelUserFilterInput
  $limit: Int
  $nextToken: String
) {
  listUsers(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
      id
      username
      email
      role
      preferences {
        items {
          id
          userId
          page
          widget
          preference
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<APITypes.ListUsersQueryVariables, APITypes.ListUsersQuery>;
export const syncUsers = /* GraphQL */ `query SyncUsers(
  $filter: ModelUserFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncUsers(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      username
      email
      role
      preferences {
        items {
          id
          userId
          page
          widget
          preference
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<APITypes.SyncUsersQueryVariables, APITypes.SyncUsersQuery>;
export const getStaff = /* GraphQL */ `query GetStaff($id: ID!) {
  getStaff(id: $id) {
    id
    firstName
    lastName
    role
    assignedVenueId
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<APITypes.GetStaffQueryVariables, APITypes.GetStaffQuery>;
export const listStaff = /* GraphQL */ `query ListStaff(
  $filter: ModelStaffFilterInput
  $limit: Int
  $nextToken: String
) {
  listStaff(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
      id
      firstName
      lastName
      role
      assignedVenueId
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<APITypes.ListStaffQueryVariables, APITypes.ListStaffQuery>;
export const syncStaff = /* GraphQL */ `query SyncStaff(
  $filter: ModelStaffFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncStaff(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      firstName
      lastName
      role
      assignedVenueId
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<APITypes.SyncStaffQueryVariables, APITypes.SyncStaffQuery>;
export const getUserPreference = /* GraphQL */ `query GetUserPreference($id: ID!) {
  getUserPreference(id: $id) {
    id
    userId
    page
    widget
    preference
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GetUserPreferenceQueryVariables,
  APITypes.GetUserPreferenceQuery
>;
export const listUserPreferences = /* GraphQL */ `query ListUserPreferences(
  $filter: ModelUserPreferenceFilterInput
  $limit: Int
  $nextToken: String
) {
  listUserPreferences(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
      id
      userId
      page
      widget
      preference
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListUserPreferencesQueryVariables,
  APITypes.ListUserPreferencesQuery
>;
export const syncUserPreferences = /* GraphQL */ `query SyncUserPreferences(
  $filter: ModelUserPreferenceFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncUserPreferences(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      userId
      page
      widget
      preference
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncUserPreferencesQueryVariables,
  APITypes.SyncUserPreferencesQuery
>;
export const getSocialPost = /* GraphQL */ `query GetSocialPost($id: ID!) {
  getSocialPost(id: $id) {
    id
    socialAccountId
    content
    imageUrl
    postedAt
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GetSocialPostQueryVariables,
  APITypes.GetSocialPostQuery
>;
export const listSocialPosts = /* GraphQL */ `query ListSocialPosts(
  $filter: ModelSocialPostFilterInput
  $limit: Int
  $nextToken: String
) {
  listSocialPosts(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
      id
      socialAccountId
      content
      imageUrl
      postedAt
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListSocialPostsQueryVariables,
  APITypes.ListSocialPostsQuery
>;
export const syncSocialPosts = /* GraphQL */ `query SyncSocialPosts(
  $filter: ModelSocialPostFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncSocialPosts(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      socialAccountId
      content
      imageUrl
      postedAt
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncSocialPostsQueryVariables,
  APITypes.SyncSocialPostsQuery
>;
export const getSocialAccount = /* GraphQL */ `query GetSocialAccount($id: ID!) {
  getSocialAccount(id: $id) {
    id
    platform
    accountName
    apiKey
    apiSecret
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GetSocialAccountQueryVariables,
  APITypes.GetSocialAccountQuery
>;
export const listSocialAccounts = /* GraphQL */ `query ListSocialAccounts(
  $filter: ModelSocialAccountFilterInput
  $limit: Int
  $nextToken: String
) {
  listSocialAccounts(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
      id
      platform
      accountName
      apiKey
      apiSecret
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListSocialAccountsQueryVariables,
  APITypes.ListSocialAccountsQuery
>;
export const syncSocialAccounts = /* GraphQL */ `query SyncSocialAccounts(
  $filter: ModelSocialAccountFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncSocialAccounts(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      platform
      accountName
      apiKey
      apiSecret
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncSocialAccountsQueryVariables,
  APITypes.SyncSocialAccountsQuery
>;
export const getMarketingMessage = /* GraphQL */ `query GetMarketingMessage($id: ID!) {
  getMarketingMessage(id: $id) {
    id
    name
    subject
    emailBody
    smsBody
    sentMessages {
      items {
        id
        playerId
        marketingMessageId
        status
        sentAt
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      nextToken
      startedAt
      __typename
    }
    createdAt
    updatedAt
    _version
    _deleted
    _lastChangedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GetMarketingMessageQueryVariables,
  APITypes.GetMarketingMessageQuery
>;
export const listMarketingMessages = /* GraphQL */ `query ListMarketingMessages(
  $filter: ModelMarketingMessageFilterInput
  $limit: Int
  $nextToken: String
) {
  listMarketingMessages(filter: $filter, limit: $limit, nextToken: $nextToken) {
    items {
      id
      name
      subject
      emailBody
      smsBody
      sentMessages {
        items {
          id
          playerId
          marketingMessageId
          status
          sentAt
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.ListMarketingMessagesQueryVariables,
  APITypes.ListMarketingMessagesQuery
>;
export const syncMarketingMessages = /* GraphQL */ `query SyncMarketingMessages(
  $filter: ModelMarketingMessageFilterInput
  $limit: Int
  $nextToken: String
  $lastSync: AWSTimestamp
) {
  syncMarketingMessages(
    filter: $filter
    limit: $limit
    nextToken: $nextToken
    lastSync: $lastSync
  ) {
    items {
      id
      name
      subject
      emailBody
      smsBody
      sentMessages {
        items {
          id
          playerId
          marketingMessageId
          status
          sentAt
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SyncMarketingMessagesQueryVariables,
  APITypes.SyncMarketingMessagesQuery
>;
export const assetsByVenueId = /* GraphQL */ `query AssetsByVenueId(
  $venueId: ID!
  $sortDirection: ModelSortDirection
  $filter: ModelAssetFilterInput
  $limit: Int
  $nextToken: String
) {
  assetsByVenueId(
    venueId: $venueId
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      name
      type
      condition
      acquiredDate
      lastCheckedDate
      venueId
      venue {
        id
        venueNumber
        name
        aliases
        address
        city
        country
        details {
          id
          venueId
          startDate
          status
          lastCustomerSuccessVisit
          totalGamesHeld
          averagePlayersPerGame
          gameNights
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        assets {
          items {
            id
            name
            type
            condition
            acquiredDate
            lastCheckedDate
            venueId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        playerMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        venueDetailsId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.AssetsByVenueIdQueryVariables,
  APITypes.AssetsByVenueIdQuery
>;
export const venuesByVenueNumberAndName = /* GraphQL */ `query VenuesByVenueNumberAndName(
  $venueNumber: Int!
  $name: ModelStringKeyConditionInput
  $sortDirection: ModelSortDirection
  $filter: ModelVenueFilterInput
  $limit: Int
  $nextToken: String
) {
  venuesByVenueNumberAndName(
    venueNumber: $venueNumber
    name: $name
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
      details {
        id
        venueId
        startDate
        status
        lastCustomerSuccessVisit
        totalGamesHeld
        averagePlayersPerGame
        gameNights
        venue {
          id
          venueNumber
          name
          aliases
          address
          city
          country
          details {
            id
            venueId
            startDate
            status
            lastCustomerSuccessVisit
            totalGamesHeld
            averagePlayersPerGame
            gameNights
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          assets {
            nextToken
            startedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          playerMemberships {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          venueDetailsId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      assets {
        items {
          id
          name
          type
          condition
          acquiredDate
          lastCheckedDate
          venueId
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      games {
        items {
          id
          name
          type
          status
          gameStartDateTime
          gameEndDateTime
          venueId
          sourceUrl
          doNotScrape
          sourceDataIssue
          seriesName
          isAdHoc
          isSeries
          isRecurring
          isSatellite
          registrationStatus
          gameVariant
          prizepool
          revenueByEntries
          totalEntries
          totalRebuys
          totalAddons
          totalDuration
          gameTags
          tournamentType
          buyIn
          rake
          startingStack
          hasGuarantee
          guaranteeAmount
          playersRemaining
          tournamentStructureId
          cashStructureId
          venue {
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
            venueDetailsId
            __typename
          }
          tournamentStructure {
            id
            name
            description
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          cashStructure {
            id
            name
            smallBlind
            bigBlind
            minBuyIn
            maxBuyIn
            rakeStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          playerResults {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      playerMemberships {
        items {
          id
          playerId
          venueId
          totalGamesPlayed
          averageBuyIn
          firstPlayedDate
          lastPlayedDate
          targetingClassification
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      venueDetailsId
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.VenuesByVenueNumberAndNameQueryVariables,
  APITypes.VenuesByVenueNumberAndNameQuery
>;
export const venueDetailsByVenueId = /* GraphQL */ `query VenueDetailsByVenueId(
  $venueId: ID!
  $sortDirection: ModelSortDirection
  $filter: ModelVenueDetailsFilterInput
  $limit: Int
  $nextToken: String
) {
  venueDetailsByVenueId(
    venueId: $venueId
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      venueId
      startDate
      status
      lastCustomerSuccessVisit
      totalGamesHeld
      averagePlayersPerGame
      gameNights
      venue {
        id
        venueNumber
        name
        aliases
        address
        city
        country
        details {
          id
          venueId
          startDate
          status
          lastCustomerSuccessVisit
          totalGamesHeld
          averagePlayersPerGame
          gameNights
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        assets {
          items {
            id
            name
            type
            condition
            acquiredDate
            lastCheckedDate
            venueId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        playerMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        venueDetailsId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.VenueDetailsByVenueIdQueryVariables,
  APITypes.VenueDetailsByVenueIdQuery
>;
export const gamesByVenueIdAndGameStartDateTime = /* GraphQL */ `query GamesByVenueIdAndGameStartDateTime(
  $venueId: ID!
  $gameStartDateTime: ModelStringKeyConditionInput
  $sortDirection: ModelSortDirection
  $filter: ModelGameFilterInput
  $limit: Int
  $nextToken: String
) {
  gamesByVenueIdAndGameStartDateTime(
    venueId: $venueId
    gameStartDateTime: $gameStartDateTime
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      name
      type
      status
      gameStartDateTime
      gameEndDateTime
      venueId
      sourceUrl
      doNotScrape
      sourceDataIssue
      seriesName
      isAdHoc
      isSeries
      isRecurring
      isSatellite
      registrationStatus
      gameVariant
      prizepool
      revenueByEntries
      totalEntries
      totalRebuys
      totalAddons
      totalDuration
      gameTags
      tournamentType
      buyIn
      rake
      startingStack
      hasGuarantee
      guaranteeAmount
      playersRemaining
      tournamentStructureId
      cashStructureId
      venue {
        id
        venueNumber
        name
        aliases
        address
        city
        country
        details {
          id
          venueId
          startDate
          status
          lastCustomerSuccessVisit
          totalGamesHeld
          averagePlayersPerGame
          gameNights
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        assets {
          items {
            id
            name
            type
            condition
            acquiredDate
            lastCheckedDate
            venueId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        playerMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        venueDetailsId
        __typename
      }
      tournamentStructure {
        id
        name
        description
        levels {
          levelNumber
          durationMinutes
          smallBlind
          bigBlind
          ante
          breakMinutes
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      cashStructure {
        id
        name
        smallBlind
        bigBlind
        minBuyIn
        maxBuyIn
        rakeStructureId
        rakeStructure {
          id
          name
          rakePercentage
          maxRake
          cashStructures {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      playerResults {
        items {
          id
          playerId
          gameId
          finishingPlace
          isMultiDayQualification
          prizeWon
          amountWon
          totalRunners
          game {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GamesByVenueIdAndGameStartDateTimeQueryVariables,
  APITypes.GamesByVenueIdAndGameStartDateTimeQuery
>;
export const gameBySourceUrl = /* GraphQL */ `query GameBySourceUrl(
  $sourceUrl: AWSURL!
  $sortDirection: ModelSortDirection
  $filter: ModelGameFilterInput
  $limit: Int
  $nextToken: String
) {
  gameBySourceUrl(
    sourceUrl: $sourceUrl
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      name
      type
      status
      gameStartDateTime
      gameEndDateTime
      venueId
      sourceUrl
      doNotScrape
      sourceDataIssue
      seriesName
      isAdHoc
      isSeries
      isRecurring
      isSatellite
      registrationStatus
      gameVariant
      prizepool
      revenueByEntries
      totalEntries
      totalRebuys
      totalAddons
      totalDuration
      gameTags
      tournamentType
      buyIn
      rake
      startingStack
      hasGuarantee
      guaranteeAmount
      playersRemaining
      tournamentStructureId
      cashStructureId
      venue {
        id
        venueNumber
        name
        aliases
        address
        city
        country
        details {
          id
          venueId
          startDate
          status
          lastCustomerSuccessVisit
          totalGamesHeld
          averagePlayersPerGame
          gameNights
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        assets {
          items {
            id
            name
            type
            condition
            acquiredDate
            lastCheckedDate
            venueId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        playerMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        venueDetailsId
        __typename
      }
      tournamentStructure {
        id
        name
        description
        levels {
          levelNumber
          durationMinutes
          smallBlind
          bigBlind
          ante
          breakMinutes
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      cashStructure {
        id
        name
        smallBlind
        bigBlind
        minBuyIn
        maxBuyIn
        rakeStructureId
        rakeStructure {
          id
          name
          rakePercentage
          maxRake
          cashStructures {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      playerResults {
        items {
          id
          playerId
          gameId
          finishingPlace
          isMultiDayQualification
          prizeWon
          amountWon
          totalRunners
          game {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GameBySourceUrlQueryVariables,
  APITypes.GameBySourceUrlQuery
>;
export const gamesByTournamentStructureId = /* GraphQL */ `query GamesByTournamentStructureId(
  $tournamentStructureId: ID!
  $sortDirection: ModelSortDirection
  $filter: ModelGameFilterInput
  $limit: Int
  $nextToken: String
) {
  gamesByTournamentStructureId(
    tournamentStructureId: $tournamentStructureId
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      name
      type
      status
      gameStartDateTime
      gameEndDateTime
      venueId
      sourceUrl
      doNotScrape
      sourceDataIssue
      seriesName
      isAdHoc
      isSeries
      isRecurring
      isSatellite
      registrationStatus
      gameVariant
      prizepool
      revenueByEntries
      totalEntries
      totalRebuys
      totalAddons
      totalDuration
      gameTags
      tournamentType
      buyIn
      rake
      startingStack
      hasGuarantee
      guaranteeAmount
      playersRemaining
      tournamentStructureId
      cashStructureId
      venue {
        id
        venueNumber
        name
        aliases
        address
        city
        country
        details {
          id
          venueId
          startDate
          status
          lastCustomerSuccessVisit
          totalGamesHeld
          averagePlayersPerGame
          gameNights
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        assets {
          items {
            id
            name
            type
            condition
            acquiredDate
            lastCheckedDate
            venueId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        playerMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        venueDetailsId
        __typename
      }
      tournamentStructure {
        id
        name
        description
        levels {
          levelNumber
          durationMinutes
          smallBlind
          bigBlind
          ante
          breakMinutes
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      cashStructure {
        id
        name
        smallBlind
        bigBlind
        minBuyIn
        maxBuyIn
        rakeStructureId
        rakeStructure {
          id
          name
          rakePercentage
          maxRake
          cashStructures {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      playerResults {
        items {
          id
          playerId
          gameId
          finishingPlace
          isMultiDayQualification
          prizeWon
          amountWon
          totalRunners
          game {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GamesByTournamentStructureIdQueryVariables,
  APITypes.GamesByTournamentStructureIdQuery
>;
export const gamesByCashStructureId = /* GraphQL */ `query GamesByCashStructureId(
  $cashStructureId: ID!
  $sortDirection: ModelSortDirection
  $filter: ModelGameFilterInput
  $limit: Int
  $nextToken: String
) {
  gamesByCashStructureId(
    cashStructureId: $cashStructureId
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      name
      type
      status
      gameStartDateTime
      gameEndDateTime
      venueId
      sourceUrl
      doNotScrape
      sourceDataIssue
      seriesName
      isAdHoc
      isSeries
      isRecurring
      isSatellite
      registrationStatus
      gameVariant
      prizepool
      revenueByEntries
      totalEntries
      totalRebuys
      totalAddons
      totalDuration
      gameTags
      tournamentType
      buyIn
      rake
      startingStack
      hasGuarantee
      guaranteeAmount
      playersRemaining
      tournamentStructureId
      cashStructureId
      venue {
        id
        venueNumber
        name
        aliases
        address
        city
        country
        details {
          id
          venueId
          startDate
          status
          lastCustomerSuccessVisit
          totalGamesHeld
          averagePlayersPerGame
          gameNights
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        assets {
          items {
            id
            name
            type
            condition
            acquiredDate
            lastCheckedDate
            venueId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        playerMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        venueDetailsId
        __typename
      }
      tournamentStructure {
        id
        name
        description
        levels {
          levelNumber
          durationMinutes
          smallBlind
          bigBlind
          ante
          breakMinutes
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      cashStructure {
        id
        name
        smallBlind
        bigBlind
        minBuyIn
        maxBuyIn
        rakeStructureId
        rakeStructure {
          id
          name
          rakePercentage
          maxRake
          cashStructures {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      playerResults {
        items {
          id
          playerId
          gameId
          finishingPlace
          isMultiDayQualification
          prizeWon
          amountWon
          totalRunners
          game {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.GamesByCashStructureIdQueryVariables,
  APITypes.GamesByCashStructureIdQuery
>;
export const cashStructuresByRakeStructureId = /* GraphQL */ `query CashStructuresByRakeStructureId(
  $rakeStructureId: ID!
  $sortDirection: ModelSortDirection
  $filter: ModelCashStructureFilterInput
  $limit: Int
  $nextToken: String
) {
  cashStructuresByRakeStructureId(
    rakeStructureId: $rakeStructureId
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      name
      smallBlind
      bigBlind
      minBuyIn
      maxBuyIn
      rakeStructureId
      rakeStructure {
        id
        name
        rakePercentage
        maxRake
        cashStructures {
          items {
            id
            name
            smallBlind
            bigBlind
            minBuyIn
            maxBuyIn
            rakeStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      games {
        items {
          id
          name
          type
          status
          gameStartDateTime
          gameEndDateTime
          venueId
          sourceUrl
          doNotScrape
          sourceDataIssue
          seriesName
          isAdHoc
          isSeries
          isRecurring
          isSatellite
          registrationStatus
          gameVariant
          prizepool
          revenueByEntries
          totalEntries
          totalRebuys
          totalAddons
          totalDuration
          gameTags
          tournamentType
          buyIn
          rake
          startingStack
          hasGuarantee
          guaranteeAmount
          playersRemaining
          tournamentStructureId
          cashStructureId
          venue {
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
            venueDetailsId
            __typename
          }
          tournamentStructure {
            id
            name
            description
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          cashStructure {
            id
            name
            smallBlind
            bigBlind
            minBuyIn
            maxBuyIn
            rakeStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          playerResults {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.CashStructuresByRakeStructureIdQueryVariables,
  APITypes.CashStructuresByRakeStructureIdQuery
>;
export const playerByEmail = /* GraphQL */ `query PlayerByEmail(
  $email: String!
  $sortDirection: ModelSortDirection
  $filter: ModelPlayerFilterInput
  $limit: Int
  $nextToken: String
) {
  playerByEmail(
    email: $email
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      firstName
      givenName
      lastName
      email
      phone
      registrationVenueId
      creationDate
      lastPlayedDate
      status
      category
      targetingClassification
      tier
      transactions {
        items {
          id
          playerId
          type
          amount
          paymentSource
          transactionDate
          rake
          notes
          gameId
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      results {
        items {
          id
          playerId
          gameId
          finishingPlace
          isMultiDayQualification
          prizeWon
          amountWon
          totalRunners
          game {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      tickets {
        items {
          id
          playerId
          ticketTemplateId
          assignedAt
          expiryDate
          status
          usedInGameId
          ticketTemplate {
            id
            name
            description
            value
            validityDays
            originGameId
            targetGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      marketingPreferences {
        id
        playerId
        optOutSms
        optOutEmail
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      venueMemberships {
        items {
          id
          playerId
          venueId
          totalGamesPlayed
          averageBuyIn
          firstPlayedDate
          lastPlayedDate
          targetingClassification
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      summary {
        id
        playerId
        venuesVisited
        sessionsPlayed
        tournamentsPlayed
        cashGamesPlayed
        tournamentWinnings
        tournamentBuyIns
        cashGameWinnings
        cashGameBuyIns
        totalWinnings
        totalBuyIns
        netBalance
        tournamentITM
        tournamentsCashed
        lastUpdated
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      playerMarketingPreferencesId
      playerSummaryId
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.PlayerByEmailQueryVariables,
  APITypes.PlayerByEmailQuery
>;
export const playersByRegistrationVenueId = /* GraphQL */ `query PlayersByRegistrationVenueId(
  $registrationVenueId: ID!
  $sortDirection: ModelSortDirection
  $filter: ModelPlayerFilterInput
  $limit: Int
  $nextToken: String
) {
  playersByRegistrationVenueId(
    registrationVenueId: $registrationVenueId
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      firstName
      givenName
      lastName
      email
      phone
      registrationVenueId
      creationDate
      lastPlayedDate
      status
      category
      targetingClassification
      tier
      transactions {
        items {
          id
          playerId
          type
          amount
          paymentSource
          transactionDate
          rake
          notes
          gameId
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      results {
        items {
          id
          playerId
          gameId
          finishingPlace
          isMultiDayQualification
          prizeWon
          amountWon
          totalRunners
          game {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      tickets {
        items {
          id
          playerId
          ticketTemplateId
          assignedAt
          expiryDate
          status
          usedInGameId
          ticketTemplate {
            id
            name
            description
            value
            validityDays
            originGameId
            targetGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      marketingPreferences {
        id
        playerId
        optOutSms
        optOutEmail
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      venueMemberships {
        items {
          id
          playerId
          venueId
          totalGamesPlayed
          averageBuyIn
          firstPlayedDate
          lastPlayedDate
          targetingClassification
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        nextToken
        startedAt
        __typename
      }
      summary {
        id
        playerId
        venuesVisited
        sessionsPlayed
        tournamentsPlayed
        cashGamesPlayed
        tournamentWinnings
        tournamentBuyIns
        cashGameWinnings
        cashGameBuyIns
        totalWinnings
        totalBuyIns
        netBalance
        tournamentITM
        tournamentsCashed
        lastUpdated
        player {
          id
          firstName
          givenName
          lastName
          email
          phone
          registrationVenueId
          creationDate
          lastPlayedDate
          status
          category
          targetingClassification
          tier
          transactions {
            nextToken
            startedAt
            __typename
          }
          results {
            nextToken
            startedAt
            __typename
          }
          tickets {
            nextToken
            startedAt
            __typename
          }
          marketingPreferences {
            id
            playerId
            optOutSms
            optOutEmail
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          venueMemberships {
            nextToken
            startedAt
            __typename
          }
          summary {
            id
            playerId
            venuesVisited
            sessionsPlayed
            tournamentsPlayed
            cashGamesPlayed
            tournamentWinnings
            tournamentBuyIns
            cashGameWinnings
            cashGameBuyIns
            totalWinnings
            totalBuyIns
            netBalance
            tournamentITM
            tournamentsCashed
            lastUpdated
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          playerMarketingPreferencesId
          playerSummaryId
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      playerMarketingPreferencesId
      playerSummaryId
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.PlayersByRegistrationVenueIdQueryVariables,
  APITypes.PlayersByRegistrationVenueIdQuery
>;
export const playerSummariesByPlayerId = /* GraphQL */ `query PlayerSummariesByPlayerId(
  $playerId: ID!
  $sortDirection: ModelSortDirection
  $filter: ModelPlayerSummaryFilterInput
  $limit: Int
  $nextToken: String
) {
  playerSummariesByPlayerId(
    playerId: $playerId
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      playerId
      venuesVisited
      sessionsPlayed
      tournamentsPlayed
      cashGamesPlayed
      tournamentWinnings
      tournamentBuyIns
      cashGameWinnings
      cashGameBuyIns
      totalWinnings
      totalBuyIns
      netBalance
      tournamentITM
      tournamentsCashed
      lastUpdated
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.PlayerSummariesByPlayerIdQueryVariables,
  APITypes.PlayerSummariesByPlayerIdQuery
>;
export const playerVenuesByPlayerIdAndVenueId = /* GraphQL */ `query PlayerVenuesByPlayerIdAndVenueId(
  $playerId: ID!
  $venueId: ModelIDKeyConditionInput
  $sortDirection: ModelSortDirection
  $filter: ModelPlayerVenueFilterInput
  $limit: Int
  $nextToken: String
) {
  playerVenuesByPlayerIdAndVenueId(
    playerId: $playerId
    venueId: $venueId
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      playerId
      venueId
      totalGamesPlayed
      averageBuyIn
      firstPlayedDate
      lastPlayedDate
      targetingClassification
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      venue {
        id
        venueNumber
        name
        aliases
        address
        city
        country
        details {
          id
          venueId
          startDate
          status
          lastCustomerSuccessVisit
          totalGamesHeld
          averagePlayersPerGame
          gameNights
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        assets {
          items {
            id
            name
            type
            condition
            acquiredDate
            lastCheckedDate
            venueId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        playerMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        venueDetailsId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.PlayerVenuesByPlayerIdAndVenueIdQueryVariables,
  APITypes.PlayerVenuesByPlayerIdAndVenueIdQuery
>;
export const playerVenuesByVenueIdAndPlayerId = /* GraphQL */ `query PlayerVenuesByVenueIdAndPlayerId(
  $venueId: ID!
  $playerId: ModelIDKeyConditionInput
  $sortDirection: ModelSortDirection
  $filter: ModelPlayerVenueFilterInput
  $limit: Int
  $nextToken: String
) {
  playerVenuesByVenueIdAndPlayerId(
    venueId: $venueId
    playerId: $playerId
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      playerId
      venueId
      totalGamesPlayed
      averageBuyIn
      firstPlayedDate
      lastPlayedDate
      targetingClassification
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      venue {
        id
        venueNumber
        name
        aliases
        address
        city
        country
        details {
          id
          venueId
          startDate
          status
          lastCustomerSuccessVisit
          totalGamesHeld
          averagePlayersPerGame
          gameNights
          venue {
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
            venueDetailsId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        assets {
          items {
            id
            name
            type
            condition
            acquiredDate
            lastCheckedDate
            venueId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        games {
          items {
            id
            name
            type
            status
            gameStartDateTime
            gameEndDateTime
            venueId
            sourceUrl
            doNotScrape
            sourceDataIssue
            seriesName
            isAdHoc
            isSeries
            isRecurring
            isSatellite
            registrationStatus
            gameVariant
            prizepool
            revenueByEntries
            totalEntries
            totalRebuys
            totalAddons
            totalDuration
            gameTags
            tournamentType
            buyIn
            rake
            startingStack
            hasGuarantee
            guaranteeAmount
            playersRemaining
            tournamentStructureId
            cashStructureId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        playerMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        venueDetailsId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.PlayerVenuesByVenueIdAndPlayerIdQueryVariables,
  APITypes.PlayerVenuesByVenueIdAndPlayerIdQuery
>;
export const playerTransactionsByPlayerIdAndTransactionDate = /* GraphQL */ `query PlayerTransactionsByPlayerIdAndTransactionDate(
  $playerId: ID!
  $transactionDate: ModelStringKeyConditionInput
  $sortDirection: ModelSortDirection
  $filter: ModelPlayerTransactionFilterInput
  $limit: Int
  $nextToken: String
) {
  playerTransactionsByPlayerIdAndTransactionDate(
    playerId: $playerId
    transactionDate: $transactionDate
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      playerId
      type
      amount
      paymentSource
      transactionDate
      rake
      notes
      gameId
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.PlayerTransactionsByPlayerIdAndTransactionDateQueryVariables,
  APITypes.PlayerTransactionsByPlayerIdAndTransactionDateQuery
>;
export const playerTransactionsByGameId = /* GraphQL */ `query PlayerTransactionsByGameId(
  $gameId: ID!
  $sortDirection: ModelSortDirection
  $filter: ModelPlayerTransactionFilterInput
  $limit: Int
  $nextToken: String
) {
  playerTransactionsByGameId(
    gameId: $gameId
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      playerId
      type
      amount
      paymentSource
      transactionDate
      rake
      notes
      gameId
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.PlayerTransactionsByGameIdQueryVariables,
  APITypes.PlayerTransactionsByGameIdQuery
>;
export const playerResultsByPlayerId = /* GraphQL */ `query PlayerResultsByPlayerId(
  $playerId: ID!
  $sortDirection: ModelSortDirection
  $filter: ModelPlayerResultFilterInput
  $limit: Int
  $nextToken: String
) {
  playerResultsByPlayerId(
    playerId: $playerId
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      playerId
      gameId
      finishingPlace
      isMultiDayQualification
      prizeWon
      amountWon
      totalRunners
      game {
        id
        name
        type
        status
        gameStartDateTime
        gameEndDateTime
        venueId
        sourceUrl
        doNotScrape
        sourceDataIssue
        seriesName
        isAdHoc
        isSeries
        isRecurring
        isSatellite
        registrationStatus
        gameVariant
        prizepool
        revenueByEntries
        totalEntries
        totalRebuys
        totalAddons
        totalDuration
        gameTags
        tournamentType
        buyIn
        rake
        startingStack
        hasGuarantee
        guaranteeAmount
        playersRemaining
        tournamentStructureId
        cashStructureId
        venue {
          id
          venueNumber
          name
          aliases
          address
          city
          country
          details {
            id
            venueId
            startDate
            status
            lastCustomerSuccessVisit
            totalGamesHeld
            averagePlayersPerGame
            gameNights
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          assets {
            nextToken
            startedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          playerMemberships {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          venueDetailsId
          __typename
        }
        tournamentStructure {
          id
          name
          description
          levels {
            levelNumber
            durationMinutes
            smallBlind
            bigBlind
            ante
            breakMinutes
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        cashStructure {
          id
          name
          smallBlind
          bigBlind
          minBuyIn
          maxBuyIn
          rakeStructureId
          rakeStructure {
            id
            name
            rakePercentage
            maxRake
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        playerResults {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.PlayerResultsByPlayerIdQueryVariables,
  APITypes.PlayerResultsByPlayerIdQuery
>;
export const playerResultsByGameId = /* GraphQL */ `query PlayerResultsByGameId(
  $gameId: ID!
  $sortDirection: ModelSortDirection
  $filter: ModelPlayerResultFilterInput
  $limit: Int
  $nextToken: String
) {
  playerResultsByGameId(
    gameId: $gameId
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      playerId
      gameId
      finishingPlace
      isMultiDayQualification
      prizeWon
      amountWon
      totalRunners
      game {
        id
        name
        type
        status
        gameStartDateTime
        gameEndDateTime
        venueId
        sourceUrl
        doNotScrape
        sourceDataIssue
        seriesName
        isAdHoc
        isSeries
        isRecurring
        isSatellite
        registrationStatus
        gameVariant
        prizepool
        revenueByEntries
        totalEntries
        totalRebuys
        totalAddons
        totalDuration
        gameTags
        tournamentType
        buyIn
        rake
        startingStack
        hasGuarantee
        guaranteeAmount
        playersRemaining
        tournamentStructureId
        cashStructureId
        venue {
          id
          venueNumber
          name
          aliases
          address
          city
          country
          details {
            id
            venueId
            startDate
            status
            lastCustomerSuccessVisit
            totalGamesHeld
            averagePlayersPerGame
            gameNights
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          assets {
            nextToken
            startedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          playerMemberships {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          venueDetailsId
          __typename
        }
        tournamentStructure {
          id
          name
          description
          levels {
            levelNumber
            durationMinutes
            smallBlind
            bigBlind
            ante
            breakMinutes
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        cashStructure {
          id
          name
          smallBlind
          bigBlind
          minBuyIn
          maxBuyIn
          rakeStructureId
          rakeStructure {
            id
            name
            rakePercentage
            maxRake
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          games {
            nextToken
            startedAt
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        playerResults {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.PlayerResultsByGameIdQueryVariables,
  APITypes.PlayerResultsByGameIdQuery
>;
export const playerMarketingMessagesByPlayerIdAndSentAt = /* GraphQL */ `query PlayerMarketingMessagesByPlayerIdAndSentAt(
  $playerId: ID!
  $sentAt: ModelStringKeyConditionInput
  $sortDirection: ModelSortDirection
  $filter: ModelPlayerMarketingMessageFilterInput
  $limit: Int
  $nextToken: String
) {
  playerMarketingMessagesByPlayerIdAndSentAt(
    playerId: $playerId
    sentAt: $sentAt
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      playerId
      marketingMessageId
      status
      sentAt
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.PlayerMarketingMessagesByPlayerIdAndSentAtQueryVariables,
  APITypes.PlayerMarketingMessagesByPlayerIdAndSentAtQuery
>;
export const playerMarketingMessagesByMarketingMessageId = /* GraphQL */ `query PlayerMarketingMessagesByMarketingMessageId(
  $marketingMessageId: ID!
  $sortDirection: ModelSortDirection
  $filter: ModelPlayerMarketingMessageFilterInput
  $limit: Int
  $nextToken: String
) {
  playerMarketingMessagesByMarketingMessageId(
    marketingMessageId: $marketingMessageId
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      playerId
      marketingMessageId
      status
      sentAt
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.PlayerMarketingMessagesByMarketingMessageIdQueryVariables,
  APITypes.PlayerMarketingMessagesByMarketingMessageIdQuery
>;
export const playerMarketingPreferencesByPlayerId = /* GraphQL */ `query PlayerMarketingPreferencesByPlayerId(
  $playerId: ID!
  $sortDirection: ModelSortDirection
  $filter: ModelPlayerMarketingPreferencesFilterInput
  $limit: Int
  $nextToken: String
) {
  playerMarketingPreferencesByPlayerId(
    playerId: $playerId
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      playerId
      optOutSms
      optOutEmail
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.PlayerMarketingPreferencesByPlayerIdQueryVariables,
  APITypes.PlayerMarketingPreferencesByPlayerIdQuery
>;
export const playerTicketsByPlayerId = /* GraphQL */ `query PlayerTicketsByPlayerId(
  $playerId: ID!
  $sortDirection: ModelSortDirection
  $filter: ModelPlayerTicketFilterInput
  $limit: Int
  $nextToken: String
) {
  playerTicketsByPlayerId(
    playerId: $playerId
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      playerId
      ticketTemplateId
      assignedAt
      expiryDate
      status
      usedInGameId
      ticketTemplate {
        id
        name
        description
        value
        validityDays
        originGameId
        targetGameId
        playerTickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.PlayerTicketsByPlayerIdQueryVariables,
  APITypes.PlayerTicketsByPlayerIdQuery
>;
export const playerTicketsByTicketTemplateId = /* GraphQL */ `query PlayerTicketsByTicketTemplateId(
  $ticketTemplateId: ID!
  $sortDirection: ModelSortDirection
  $filter: ModelPlayerTicketFilterInput
  $limit: Int
  $nextToken: String
) {
  playerTicketsByTicketTemplateId(
    ticketTemplateId: $ticketTemplateId
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      playerId
      ticketTemplateId
      assignedAt
      expiryDate
      status
      usedInGameId
      ticketTemplate {
        id
        name
        description
        value
        validityDays
        originGameId
        targetGameId
        playerTickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        __typename
      }
      player {
        id
        firstName
        givenName
        lastName
        email
        phone
        registrationVenueId
        creationDate
        lastPlayedDate
        status
        category
        targetingClassification
        tier
        transactions {
          items {
            id
            playerId
            type
            amount
            paymentSource
            transactionDate
            rake
            notes
            gameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        results {
          items {
            id
            playerId
            gameId
            finishingPlace
            isMultiDayQualification
            prizeWon
            amountWon
            totalRunners
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        tickets {
          items {
            id
            playerId
            ticketTemplateId
            assignedAt
            expiryDate
            status
            usedInGameId
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        marketingPreferences {
          id
          playerId
          optOutSms
          optOutEmail
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        venueMemberships {
          items {
            id
            playerId
            venueId
            totalGamesPlayed
            averageBuyIn
            firstPlayedDate
            lastPlayedDate
            targetingClassification
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            __typename
          }
          nextToken
          startedAt
          __typename
        }
        summary {
          id
          playerId
          venuesVisited
          sessionsPlayed
          tournamentsPlayed
          cashGamesPlayed
          tournamentWinnings
          tournamentBuyIns
          cashGameWinnings
          cashGameBuyIns
          totalWinnings
          totalBuyIns
          netBalance
          tournamentITM
          tournamentsCashed
          lastUpdated
          player {
            id
            firstName
            givenName
            lastName
            email
            phone
            registrationVenueId
            creationDate
            lastPlayedDate
            status
            category
            targetingClassification
            tier
            createdAt
            updatedAt
            _version
            _deleted
            _lastChangedAt
            playerMarketingPreferencesId
            playerSummaryId
            __typename
          }
          createdAt
          updatedAt
          _version
          _deleted
          _lastChangedAt
          __typename
        }
        createdAt
        updatedAt
        _version
        _deleted
        _lastChangedAt
        playerMarketingPreferencesId
        playerSummaryId
        __typename
      }
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.PlayerTicketsByTicketTemplateIdQueryVariables,
  APITypes.PlayerTicketsByTicketTemplateIdQuery
>;
export const staffByAssignedVenueId = /* GraphQL */ `query StaffByAssignedVenueId(
  $assignedVenueId: ID!
  $sortDirection: ModelSortDirection
  $filter: ModelStaffFilterInput
  $limit: Int
  $nextToken: String
) {
  staffByAssignedVenueId(
    assignedVenueId: $assignedVenueId
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      firstName
      lastName
      role
      assignedVenueId
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.StaffByAssignedVenueIdQueryVariables,
  APITypes.StaffByAssignedVenueIdQuery
>;
export const userPreferencesByUserId = /* GraphQL */ `query UserPreferencesByUserId(
  $userId: ID!
  $sortDirection: ModelSortDirection
  $filter: ModelUserPreferenceFilterInput
  $limit: Int
  $nextToken: String
) {
  userPreferencesByUserId(
    userId: $userId
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      userId
      page
      widget
      preference
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.UserPreferencesByUserIdQueryVariables,
  APITypes.UserPreferencesByUserIdQuery
>;
export const socialPostsBySocialAccountIdAndPostedAt = /* GraphQL */ `query SocialPostsBySocialAccountIdAndPostedAt(
  $socialAccountId: ID!
  $postedAt: ModelStringKeyConditionInput
  $sortDirection: ModelSortDirection
  $filter: ModelSocialPostFilterInput
  $limit: Int
  $nextToken: String
) {
  socialPostsBySocialAccountIdAndPostedAt(
    socialAccountId: $socialAccountId
    postedAt: $postedAt
    sortDirection: $sortDirection
    filter: $filter
    limit: $limit
    nextToken: $nextToken
  ) {
    items {
      id
      socialAccountId
      content
      imageUrl
      postedAt
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
      __typename
    }
    nextToken
    startedAt
    __typename
  }
}
` as GeneratedQuery<
  APITypes.SocialPostsBySocialAccountIdAndPostedAtQueryVariables,
  APITypes.SocialPostsBySocialAccountIdAndPostedAtQuery
>;
