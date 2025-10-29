// src/graphql/customQueries.ts

/**
 * A lean query to fetch only the necessary fields for the venue dropdown
 * in the GameCard component. This avoids fetching large, nested data like
 * player memberships.
 */
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