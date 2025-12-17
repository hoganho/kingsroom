/*
 * This file contains custom, lean GraphQL mutations for specific components.
 * This avoids over-fetching data and prevents errors from the auto-generated
 * "greedy" queries that try to fetch all nested relationships.
 */

export const updateVenueShallow = /* GraphQL */ `
  mutation UpdateVenueShallow(
    $input: UpdateVenueInput!
    $condition: ModelVenueConditionInput
  ) {
    updateVenue(input: $input, condition: $condition) {
      id
      venueNumber
      name
      aliases
      address
      city
      country
      fee
      logo
      isSpecial
      entityId
      gameCount
      lastGameAddedAt
      lastDataRefreshedAt
      seriesGameCount
      lastSeriesGameAddedAt
      canonicalVenueId
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
    }
  }
`;

export const createVenueShallow = /* GraphQL */ `
  mutation CreateVenueShallow(
    $input: CreateVenueInput!
    $condition: ModelVenueConditionInput
  ) {
    createVenue(input: $input, condition: $condition) {
      id
      venueNumber
      name
      aliases
      address
      city
      country
      fee
      logo
      isSpecial
      entityId
      gameCount
      lastGameAddedAt
      lastDataRefreshedAt
      seriesGameCount
      lastSeriesGameAddedAt
      canonicalVenueId
      createdAt
      updatedAt
      _version
      _deleted
      _lastChangedAt
    }
  }
`;