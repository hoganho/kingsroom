/* tslint:disable */
/* eslint-disable */
// this is an auto generated file. This will be overwritten

import * as APITypes from "../API";
type GeneratedMutation<InputType, OutputType> = string & {
  __generatedMutationInput: InputType;
  __generatedMutationOutput: OutputType;
};

export const fetchTournamentData = /* GraphQL */ `mutation FetchTournamentData($url: AWSURL!) {
  fetchTournamentData(url: $url) {
    name
    gameStartDateTime
    gameEndDateTime
    status
    registrationStatus
    gameVariant
    prizepool
    totalEntries
    totalRebuys
    totalAddons
    totalDuration
    gameTags
    buyIn
    startingStack
    hasGuarantee
    guaranteeAmount
    levels {
      levelNumber
      durationMinutes
      smallBlind
      bigBlind
      ante
      __typename
    }
    results {
      rank
      name
      winnings
      __typename
    }
    rawHtml
    isNewStructure
    __typename
  }
}
` as GeneratedMutation<
  APITypes.FetchTournamentDataMutationVariables,
  APITypes.FetchTournamentDataMutation
>;
export const saveTournamentData = /* GraphQL */ `mutation SaveTournamentData($input: SaveTournamentInput!) {
  saveTournamentData(input: $input) {
    id
    name
    type
    variant
    status
    gameStartDateTime
    gameEndDateTime
    venueId
    sourceUrl
    seriesName
    isAdHoc
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
    tournamentStructureId
    cashStructureId
    venue {
      id
      name
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
}
` as GeneratedMutation<
  APITypes.SaveTournamentDataMutationVariables,
  APITypes.SaveTournamentDataMutation
>;
export const createDataSync = /* GraphQL */ `mutation CreateDataSync(
  $input: CreateDataSyncInput!
  $condition: ModelDataSyncConditionInput
) {
  createDataSync(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.CreateDataSyncMutationVariables,
  APITypes.CreateDataSyncMutation
>;
export const updateDataSync = /* GraphQL */ `mutation UpdateDataSync(
  $input: UpdateDataSyncInput!
  $condition: ModelDataSyncConditionInput
) {
  updateDataSync(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.UpdateDataSyncMutationVariables,
  APITypes.UpdateDataSyncMutation
>;
export const deleteDataSync = /* GraphQL */ `mutation DeleteDataSync(
  $input: DeleteDataSyncInput!
  $condition: ModelDataSyncConditionInput
) {
  deleteDataSync(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.DeleteDataSyncMutationVariables,
  APITypes.DeleteDataSyncMutation
>;
export const createScrapeStructure = /* GraphQL */ `mutation CreateScrapeStructure(
  $input: CreateScrapeStructureInput!
  $condition: ModelScrapeStructureConditionInput
) {
  createScrapeStructure(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.CreateScrapeStructureMutationVariables,
  APITypes.CreateScrapeStructureMutation
>;
export const updateScrapeStructure = /* GraphQL */ `mutation UpdateScrapeStructure(
  $input: UpdateScrapeStructureInput!
  $condition: ModelScrapeStructureConditionInput
) {
  updateScrapeStructure(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.UpdateScrapeStructureMutationVariables,
  APITypes.UpdateScrapeStructureMutation
>;
export const deleteScrapeStructure = /* GraphQL */ `mutation DeleteScrapeStructure(
  $input: DeleteScrapeStructureInput!
  $condition: ModelScrapeStructureConditionInput
) {
  deleteScrapeStructure(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.DeleteScrapeStructureMutationVariables,
  APITypes.DeleteScrapeStructureMutation
>;
export const createAsset = /* GraphQL */ `mutation CreateAsset(
  $input: CreateAssetInput!
  $condition: ModelAssetConditionInput
) {
  createAsset(input: $input, condition: $condition) {
    id
    name
    type
    condition
    acquiredDate
    lastCheckedDate
    venueId
    venue {
      id
      name
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
}
` as GeneratedMutation<
  APITypes.CreateAssetMutationVariables,
  APITypes.CreateAssetMutation
>;
export const updateAsset = /* GraphQL */ `mutation UpdateAsset(
  $input: UpdateAssetInput!
  $condition: ModelAssetConditionInput
) {
  updateAsset(input: $input, condition: $condition) {
    id
    name
    type
    condition
    acquiredDate
    lastCheckedDate
    venueId
    venue {
      id
      name
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
}
` as GeneratedMutation<
  APITypes.UpdateAssetMutationVariables,
  APITypes.UpdateAssetMutation
>;
export const deleteAsset = /* GraphQL */ `mutation DeleteAsset(
  $input: DeleteAssetInput!
  $condition: ModelAssetConditionInput
) {
  deleteAsset(input: $input, condition: $condition) {
    id
    name
    type
    condition
    acquiredDate
    lastCheckedDate
    venueId
    venue {
      id
      name
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
}
` as GeneratedMutation<
  APITypes.DeleteAssetMutationVariables,
  APITypes.DeleteAssetMutation
>;
export const createVenue = /* GraphQL */ `mutation CreateVenue(
  $input: CreateVenueInput!
  $condition: ModelVenueConditionInput
) {
  createVenue(input: $input, condition: $condition) {
    id
    name
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
}
` as GeneratedMutation<
  APITypes.CreateVenueMutationVariables,
  APITypes.CreateVenueMutation
>;
export const updateVenue = /* GraphQL */ `mutation UpdateVenue(
  $input: UpdateVenueInput!
  $condition: ModelVenueConditionInput
) {
  updateVenue(input: $input, condition: $condition) {
    id
    name
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
}
` as GeneratedMutation<
  APITypes.UpdateVenueMutationVariables,
  APITypes.UpdateVenueMutation
>;
export const deleteVenue = /* GraphQL */ `mutation DeleteVenue(
  $input: DeleteVenueInput!
  $condition: ModelVenueConditionInput
) {
  deleteVenue(input: $input, condition: $condition) {
    id
    name
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
}
` as GeneratedMutation<
  APITypes.DeleteVenueMutationVariables,
  APITypes.DeleteVenueMutation
>;
export const createVenueDetails = /* GraphQL */ `mutation CreateVenueDetails(
  $input: CreateVenueDetailsInput!
  $condition: ModelVenueDetailsConditionInput
) {
  createVenueDetails(input: $input, condition: $condition) {
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
      name
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
}
` as GeneratedMutation<
  APITypes.CreateVenueDetailsMutationVariables,
  APITypes.CreateVenueDetailsMutation
>;
export const updateVenueDetails = /* GraphQL */ `mutation UpdateVenueDetails(
  $input: UpdateVenueDetailsInput!
  $condition: ModelVenueDetailsConditionInput
) {
  updateVenueDetails(input: $input, condition: $condition) {
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
      name
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
}
` as GeneratedMutation<
  APITypes.UpdateVenueDetailsMutationVariables,
  APITypes.UpdateVenueDetailsMutation
>;
export const deleteVenueDetails = /* GraphQL */ `mutation DeleteVenueDetails(
  $input: DeleteVenueDetailsInput!
  $condition: ModelVenueDetailsConditionInput
) {
  deleteVenueDetails(input: $input, condition: $condition) {
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
      name
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
}
` as GeneratedMutation<
  APITypes.DeleteVenueDetailsMutationVariables,
  APITypes.DeleteVenueDetailsMutation
>;
export const createGame = /* GraphQL */ `mutation CreateGame(
  $input: CreateGameInput!
  $condition: ModelGameConditionInput
) {
  createGame(input: $input, condition: $condition) {
    id
    name
    type
    variant
    status
    gameStartDateTime
    gameEndDateTime
    venueId
    sourceUrl
    seriesName
    isAdHoc
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
    tournamentStructureId
    cashStructureId
    venue {
      id
      name
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
}
` as GeneratedMutation<
  APITypes.CreateGameMutationVariables,
  APITypes.CreateGameMutation
>;
export const updateGame = /* GraphQL */ `mutation UpdateGame(
  $input: UpdateGameInput!
  $condition: ModelGameConditionInput
) {
  updateGame(input: $input, condition: $condition) {
    id
    name
    type
    variant
    status
    gameStartDateTime
    gameEndDateTime
    venueId
    sourceUrl
    seriesName
    isAdHoc
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
    tournamentStructureId
    cashStructureId
    venue {
      id
      name
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
}
` as GeneratedMutation<
  APITypes.UpdateGameMutationVariables,
  APITypes.UpdateGameMutation
>;
export const deleteGame = /* GraphQL */ `mutation DeleteGame(
  $input: DeleteGameInput!
  $condition: ModelGameConditionInput
) {
  deleteGame(input: $input, condition: $condition) {
    id
    name
    type
    variant
    status
    gameStartDateTime
    gameEndDateTime
    venueId
    sourceUrl
    seriesName
    isAdHoc
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
    tournamentStructureId
    cashStructureId
    venue {
      id
      name
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
}
` as GeneratedMutation<
  APITypes.DeleteGameMutationVariables,
  APITypes.DeleteGameMutation
>;
export const createTournamentStructure = /* GraphQL */ `mutation CreateTournamentStructure(
  $input: CreateTournamentStructureInput!
  $condition: ModelTournamentStructureConditionInput
) {
  createTournamentStructure(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.CreateTournamentStructureMutationVariables,
  APITypes.CreateTournamentStructureMutation
>;
export const updateTournamentStructure = /* GraphQL */ `mutation UpdateTournamentStructure(
  $input: UpdateTournamentStructureInput!
  $condition: ModelTournamentStructureConditionInput
) {
  updateTournamentStructure(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.UpdateTournamentStructureMutationVariables,
  APITypes.UpdateTournamentStructureMutation
>;
export const deleteTournamentStructure = /* GraphQL */ `mutation DeleteTournamentStructure(
  $input: DeleteTournamentStructureInput!
  $condition: ModelTournamentStructureConditionInput
) {
  deleteTournamentStructure(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.DeleteTournamentStructureMutationVariables,
  APITypes.DeleteTournamentStructureMutation
>;
export const createRakeStructure = /* GraphQL */ `mutation CreateRakeStructure(
  $input: CreateRakeStructureInput!
  $condition: ModelRakeStructureConditionInput
) {
  createRakeStructure(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.CreateRakeStructureMutationVariables,
  APITypes.CreateRakeStructureMutation
>;
export const updateRakeStructure = /* GraphQL */ `mutation UpdateRakeStructure(
  $input: UpdateRakeStructureInput!
  $condition: ModelRakeStructureConditionInput
) {
  updateRakeStructure(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.UpdateRakeStructureMutationVariables,
  APITypes.UpdateRakeStructureMutation
>;
export const deleteRakeStructure = /* GraphQL */ `mutation DeleteRakeStructure(
  $input: DeleteRakeStructureInput!
  $condition: ModelRakeStructureConditionInput
) {
  deleteRakeStructure(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.DeleteRakeStructureMutationVariables,
  APITypes.DeleteRakeStructureMutation
>;
export const createCashStructure = /* GraphQL */ `mutation CreateCashStructure(
  $input: CreateCashStructureInput!
  $condition: ModelCashStructureConditionInput
) {
  createCashStructure(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.CreateCashStructureMutationVariables,
  APITypes.CreateCashStructureMutation
>;
export const updateCashStructure = /* GraphQL */ `mutation UpdateCashStructure(
  $input: UpdateCashStructureInput!
  $condition: ModelCashStructureConditionInput
) {
  updateCashStructure(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.UpdateCashStructureMutationVariables,
  APITypes.UpdateCashStructureMutation
>;
export const deleteCashStructure = /* GraphQL */ `mutation DeleteCashStructure(
  $input: DeleteCashStructureInput!
  $condition: ModelCashStructureConditionInput
) {
  deleteCashStructure(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.DeleteCashStructureMutationVariables,
  APITypes.DeleteCashStructureMutation
>;
export const createPlayer = /* GraphQL */ `mutation CreatePlayer(
  $input: CreatePlayerInput!
  $condition: ModelPlayerConditionInput
) {
  createPlayer(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.CreatePlayerMutationVariables,
  APITypes.CreatePlayerMutation
>;
export const updatePlayer = /* GraphQL */ `mutation UpdatePlayer(
  $input: UpdatePlayerInput!
  $condition: ModelPlayerConditionInput
) {
  updatePlayer(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.UpdatePlayerMutationVariables,
  APITypes.UpdatePlayerMutation
>;
export const deletePlayer = /* GraphQL */ `mutation DeletePlayer(
  $input: DeletePlayerInput!
  $condition: ModelPlayerConditionInput
) {
  deletePlayer(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.DeletePlayerMutationVariables,
  APITypes.DeletePlayerMutation
>;
export const createPlayerSummary = /* GraphQL */ `mutation CreatePlayerSummary(
  $input: CreatePlayerSummaryInput!
  $condition: ModelPlayerSummaryConditionInput
) {
  createPlayerSummary(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.CreatePlayerSummaryMutationVariables,
  APITypes.CreatePlayerSummaryMutation
>;
export const updatePlayerSummary = /* GraphQL */ `mutation UpdatePlayerSummary(
  $input: UpdatePlayerSummaryInput!
  $condition: ModelPlayerSummaryConditionInput
) {
  updatePlayerSummary(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.UpdatePlayerSummaryMutationVariables,
  APITypes.UpdatePlayerSummaryMutation
>;
export const deletePlayerSummary = /* GraphQL */ `mutation DeletePlayerSummary(
  $input: DeletePlayerSummaryInput!
  $condition: ModelPlayerSummaryConditionInput
) {
  deletePlayerSummary(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.DeletePlayerSummaryMutationVariables,
  APITypes.DeletePlayerSummaryMutation
>;
export const createPlayerVenue = /* GraphQL */ `mutation CreatePlayerVenue(
  $input: CreatePlayerVenueInput!
  $condition: ModelPlayerVenueConditionInput
) {
  createPlayerVenue(input: $input, condition: $condition) {
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
      name
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
}
` as GeneratedMutation<
  APITypes.CreatePlayerVenueMutationVariables,
  APITypes.CreatePlayerVenueMutation
>;
export const updatePlayerVenue = /* GraphQL */ `mutation UpdatePlayerVenue(
  $input: UpdatePlayerVenueInput!
  $condition: ModelPlayerVenueConditionInput
) {
  updatePlayerVenue(input: $input, condition: $condition) {
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
      name
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
}
` as GeneratedMutation<
  APITypes.UpdatePlayerVenueMutationVariables,
  APITypes.UpdatePlayerVenueMutation
>;
export const deletePlayerVenue = /* GraphQL */ `mutation DeletePlayerVenue(
  $input: DeletePlayerVenueInput!
  $condition: ModelPlayerVenueConditionInput
) {
  deletePlayerVenue(input: $input, condition: $condition) {
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
      name
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
}
` as GeneratedMutation<
  APITypes.DeletePlayerVenueMutationVariables,
  APITypes.DeletePlayerVenueMutation
>;
export const createPlayerTransaction = /* GraphQL */ `mutation CreatePlayerTransaction(
  $input: CreatePlayerTransactionInput!
  $condition: ModelPlayerTransactionConditionInput
) {
  createPlayerTransaction(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.CreatePlayerTransactionMutationVariables,
  APITypes.CreatePlayerTransactionMutation
>;
export const updatePlayerTransaction = /* GraphQL */ `mutation UpdatePlayerTransaction(
  $input: UpdatePlayerTransactionInput!
  $condition: ModelPlayerTransactionConditionInput
) {
  updatePlayerTransaction(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.UpdatePlayerTransactionMutationVariables,
  APITypes.UpdatePlayerTransactionMutation
>;
export const deletePlayerTransaction = /* GraphQL */ `mutation DeletePlayerTransaction(
  $input: DeletePlayerTransactionInput!
  $condition: ModelPlayerTransactionConditionInput
) {
  deletePlayerTransaction(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.DeletePlayerTransactionMutationVariables,
  APITypes.DeletePlayerTransactionMutation
>;
export const createPlayerResult = /* GraphQL */ `mutation CreatePlayerResult(
  $input: CreatePlayerResultInput!
  $condition: ModelPlayerResultConditionInput
) {
  createPlayerResult(input: $input, condition: $condition) {
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
      variant
      status
      gameStartDateTime
      gameEndDateTime
      venueId
      sourceUrl
      seriesName
      isAdHoc
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
}
` as GeneratedMutation<
  APITypes.CreatePlayerResultMutationVariables,
  APITypes.CreatePlayerResultMutation
>;
export const updatePlayerResult = /* GraphQL */ `mutation UpdatePlayerResult(
  $input: UpdatePlayerResultInput!
  $condition: ModelPlayerResultConditionInput
) {
  updatePlayerResult(input: $input, condition: $condition) {
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
      variant
      status
      gameStartDateTime
      gameEndDateTime
      venueId
      sourceUrl
      seriesName
      isAdHoc
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
}
` as GeneratedMutation<
  APITypes.UpdatePlayerResultMutationVariables,
  APITypes.UpdatePlayerResultMutation
>;
export const deletePlayerResult = /* GraphQL */ `mutation DeletePlayerResult(
  $input: DeletePlayerResultInput!
  $condition: ModelPlayerResultConditionInput
) {
  deletePlayerResult(input: $input, condition: $condition) {
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
      variant
      status
      gameStartDateTime
      gameEndDateTime
      venueId
      sourceUrl
      seriesName
      isAdHoc
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
}
` as GeneratedMutation<
  APITypes.DeletePlayerResultMutationVariables,
  APITypes.DeletePlayerResultMutation
>;
export const createPlayerMarketingMessage = /* GraphQL */ `mutation CreatePlayerMarketingMessage(
  $input: CreatePlayerMarketingMessageInput!
  $condition: ModelPlayerMarketingMessageConditionInput
) {
  createPlayerMarketingMessage(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.CreatePlayerMarketingMessageMutationVariables,
  APITypes.CreatePlayerMarketingMessageMutation
>;
export const updatePlayerMarketingMessage = /* GraphQL */ `mutation UpdatePlayerMarketingMessage(
  $input: UpdatePlayerMarketingMessageInput!
  $condition: ModelPlayerMarketingMessageConditionInput
) {
  updatePlayerMarketingMessage(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.UpdatePlayerMarketingMessageMutationVariables,
  APITypes.UpdatePlayerMarketingMessageMutation
>;
export const deletePlayerMarketingMessage = /* GraphQL */ `mutation DeletePlayerMarketingMessage(
  $input: DeletePlayerMarketingMessageInput!
  $condition: ModelPlayerMarketingMessageConditionInput
) {
  deletePlayerMarketingMessage(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.DeletePlayerMarketingMessageMutationVariables,
  APITypes.DeletePlayerMarketingMessageMutation
>;
export const createPlayerMarketingPreferences = /* GraphQL */ `mutation CreatePlayerMarketingPreferences(
  $input: CreatePlayerMarketingPreferencesInput!
  $condition: ModelPlayerMarketingPreferencesConditionInput
) {
  createPlayerMarketingPreferences(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.CreatePlayerMarketingPreferencesMutationVariables,
  APITypes.CreatePlayerMarketingPreferencesMutation
>;
export const updatePlayerMarketingPreferences = /* GraphQL */ `mutation UpdatePlayerMarketingPreferences(
  $input: UpdatePlayerMarketingPreferencesInput!
  $condition: ModelPlayerMarketingPreferencesConditionInput
) {
  updatePlayerMarketingPreferences(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.UpdatePlayerMarketingPreferencesMutationVariables,
  APITypes.UpdatePlayerMarketingPreferencesMutation
>;
export const deletePlayerMarketingPreferences = /* GraphQL */ `mutation DeletePlayerMarketingPreferences(
  $input: DeletePlayerMarketingPreferencesInput!
  $condition: ModelPlayerMarketingPreferencesConditionInput
) {
  deletePlayerMarketingPreferences(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.DeletePlayerMarketingPreferencesMutationVariables,
  APITypes.DeletePlayerMarketingPreferencesMutation
>;
export const createTicketTemplate = /* GraphQL */ `mutation CreateTicketTemplate(
  $input: CreateTicketTemplateInput!
  $condition: ModelTicketTemplateConditionInput
) {
  createTicketTemplate(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.CreateTicketTemplateMutationVariables,
  APITypes.CreateTicketTemplateMutation
>;
export const updateTicketTemplate = /* GraphQL */ `mutation UpdateTicketTemplate(
  $input: UpdateTicketTemplateInput!
  $condition: ModelTicketTemplateConditionInput
) {
  updateTicketTemplate(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.UpdateTicketTemplateMutationVariables,
  APITypes.UpdateTicketTemplateMutation
>;
export const deleteTicketTemplate = /* GraphQL */ `mutation DeleteTicketTemplate(
  $input: DeleteTicketTemplateInput!
  $condition: ModelTicketTemplateConditionInput
) {
  deleteTicketTemplate(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.DeleteTicketTemplateMutationVariables,
  APITypes.DeleteTicketTemplateMutation
>;
export const createPlayerTicket = /* GraphQL */ `mutation CreatePlayerTicket(
  $input: CreatePlayerTicketInput!
  $condition: ModelPlayerTicketConditionInput
) {
  createPlayerTicket(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.CreatePlayerTicketMutationVariables,
  APITypes.CreatePlayerTicketMutation
>;
export const updatePlayerTicket = /* GraphQL */ `mutation UpdatePlayerTicket(
  $input: UpdatePlayerTicketInput!
  $condition: ModelPlayerTicketConditionInput
) {
  updatePlayerTicket(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.UpdatePlayerTicketMutationVariables,
  APITypes.UpdatePlayerTicketMutation
>;
export const deletePlayerTicket = /* GraphQL */ `mutation DeletePlayerTicket(
  $input: DeletePlayerTicketInput!
  $condition: ModelPlayerTicketConditionInput
) {
  deletePlayerTicket(input: $input, condition: $condition) {
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
}
` as GeneratedMutation<
  APITypes.DeletePlayerTicketMutationVariables,
  APITypes.DeletePlayerTicketMutation
>;
export const createUser = /* GraphQL */ `mutation CreateUser(
  $input: CreateUserInput!
  $condition: ModelUserConditionInput
) {
  createUser(input: $input, condition: $condition) {
    id
    username
    email
    role
    preferences {
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
` as GeneratedMutation<
  APITypes.CreateUserMutationVariables,
  APITypes.CreateUserMutation
>;
export const updateUser = /* GraphQL */ `mutation UpdateUser(
  $input: UpdateUserInput!
  $condition: ModelUserConditionInput
) {
  updateUser(input: $input, condition: $condition) {
    id
    username
    email
    role
    preferences {
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
` as GeneratedMutation<
  APITypes.UpdateUserMutationVariables,
  APITypes.UpdateUserMutation
>;
export const deleteUser = /* GraphQL */ `mutation DeleteUser(
  $input: DeleteUserInput!
  $condition: ModelUserConditionInput
) {
  deleteUser(input: $input, condition: $condition) {
    id
    username
    email
    role
    preferences {
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
` as GeneratedMutation<
  APITypes.DeleteUserMutationVariables,
  APITypes.DeleteUserMutation
>;
export const createStaff = /* GraphQL */ `mutation CreateStaff(
  $input: CreateStaffInput!
  $condition: ModelStaffConditionInput
) {
  createStaff(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.CreateStaffMutationVariables,
  APITypes.CreateStaffMutation
>;
export const updateStaff = /* GraphQL */ `mutation UpdateStaff(
  $input: UpdateStaffInput!
  $condition: ModelStaffConditionInput
) {
  updateStaff(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.UpdateStaffMutationVariables,
  APITypes.UpdateStaffMutation
>;
export const deleteStaff = /* GraphQL */ `mutation DeleteStaff(
  $input: DeleteStaffInput!
  $condition: ModelStaffConditionInput
) {
  deleteStaff(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.DeleteStaffMutationVariables,
  APITypes.DeleteStaffMutation
>;
export const createUserPreference = /* GraphQL */ `mutation CreateUserPreference(
  $input: CreateUserPreferenceInput!
  $condition: ModelUserPreferenceConditionInput
) {
  createUserPreference(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.CreateUserPreferenceMutationVariables,
  APITypes.CreateUserPreferenceMutation
>;
export const updateUserPreference = /* GraphQL */ `mutation UpdateUserPreference(
  $input: UpdateUserPreferenceInput!
  $condition: ModelUserPreferenceConditionInput
) {
  updateUserPreference(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.UpdateUserPreferenceMutationVariables,
  APITypes.UpdateUserPreferenceMutation
>;
export const deleteUserPreference = /* GraphQL */ `mutation DeleteUserPreference(
  $input: DeleteUserPreferenceInput!
  $condition: ModelUserPreferenceConditionInput
) {
  deleteUserPreference(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.DeleteUserPreferenceMutationVariables,
  APITypes.DeleteUserPreferenceMutation
>;
export const createSocialPost = /* GraphQL */ `mutation CreateSocialPost(
  $input: CreateSocialPostInput!
  $condition: ModelSocialPostConditionInput
) {
  createSocialPost(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.CreateSocialPostMutationVariables,
  APITypes.CreateSocialPostMutation
>;
export const updateSocialPost = /* GraphQL */ `mutation UpdateSocialPost(
  $input: UpdateSocialPostInput!
  $condition: ModelSocialPostConditionInput
) {
  updateSocialPost(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.UpdateSocialPostMutationVariables,
  APITypes.UpdateSocialPostMutation
>;
export const deleteSocialPost = /* GraphQL */ `mutation DeleteSocialPost(
  $input: DeleteSocialPostInput!
  $condition: ModelSocialPostConditionInput
) {
  deleteSocialPost(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.DeleteSocialPostMutationVariables,
  APITypes.DeleteSocialPostMutation
>;
export const createSocialAccount = /* GraphQL */ `mutation CreateSocialAccount(
  $input: CreateSocialAccountInput!
  $condition: ModelSocialAccountConditionInput
) {
  createSocialAccount(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.CreateSocialAccountMutationVariables,
  APITypes.CreateSocialAccountMutation
>;
export const updateSocialAccount = /* GraphQL */ `mutation UpdateSocialAccount(
  $input: UpdateSocialAccountInput!
  $condition: ModelSocialAccountConditionInput
) {
  updateSocialAccount(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.UpdateSocialAccountMutationVariables,
  APITypes.UpdateSocialAccountMutation
>;
export const deleteSocialAccount = /* GraphQL */ `mutation DeleteSocialAccount(
  $input: DeleteSocialAccountInput!
  $condition: ModelSocialAccountConditionInput
) {
  deleteSocialAccount(input: $input, condition: $condition) {
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
` as GeneratedMutation<
  APITypes.DeleteSocialAccountMutationVariables,
  APITypes.DeleteSocialAccountMutation
>;
export const createMarketingMessage = /* GraphQL */ `mutation CreateMarketingMessage(
  $input: CreateMarketingMessageInput!
  $condition: ModelMarketingMessageConditionInput
) {
  createMarketingMessage(input: $input, condition: $condition) {
    id
    name
    subject
    emailBody
    smsBody
    sentMessages {
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
` as GeneratedMutation<
  APITypes.CreateMarketingMessageMutationVariables,
  APITypes.CreateMarketingMessageMutation
>;
export const updateMarketingMessage = /* GraphQL */ `mutation UpdateMarketingMessage(
  $input: UpdateMarketingMessageInput!
  $condition: ModelMarketingMessageConditionInput
) {
  updateMarketingMessage(input: $input, condition: $condition) {
    id
    name
    subject
    emailBody
    smsBody
    sentMessages {
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
` as GeneratedMutation<
  APITypes.UpdateMarketingMessageMutationVariables,
  APITypes.UpdateMarketingMessageMutation
>;
export const deleteMarketingMessage = /* GraphQL */ `mutation DeleteMarketingMessage(
  $input: DeleteMarketingMessageInput!
  $condition: ModelMarketingMessageConditionInput
) {
  deleteMarketingMessage(input: $input, condition: $condition) {
    id
    name
    subject
    emailBody
    smsBody
    sentMessages {
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
` as GeneratedMutation<
  APITypes.DeleteMarketingMessageMutationVariables,
  APITypes.DeleteMarketingMessageMutation
>;
