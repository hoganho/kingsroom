// Example GraphQL queries after the fix is applied

// Query to list players with total count
export const listPlayersWithTotal = /* GraphQL */ `
  query ListPlayersWithTotal($limit: Int, $nextToken: String, $filter: ModelPlayerFilterInput) {
    listPlayers(limit: $limit, nextToken: $nextToken, filter: $filter) {
      items {
        id
        name
        email
        phone
        createdAt
        updatedAt
      }
      nextToken
      total  # New field added by the override
    }
  }
`;

// Query to list games with total count
export const listGamesWithTotal = /* GraphQL */ `
  query ListGamesWithTotal($limit: Int, $nextToken: String, $filter: ModelGameFilterInput) {
    listGames(limit: $limit, nextToken: $nextToken, filter: $filter) {
      items {
        id
        name
        status
        createdAt
        updatedAt
      }
      nextToken
      total  # New field added by the override
    }
  }
`;

// Example React component using the total field
import { API, graphqlOperation } from 'aws-amplify';
import { useState, useEffect } from 'react';

export function PlayersList() {
  const [players, setPlayers] = useState([]);
  const [total, setTotal] = useState(0);
  const [nextToken, setNextToken] = useState(null);

  useEffect(() => {
    fetchPlayers();
  }, []);

  const fetchPlayers = async () => {
    try {
      const result = await API.graphql(
        graphqlOperation(listPlayersWithTotal, {
          limit: 20,
          nextToken: nextToken
        })
      );
      
      const data = result.data.listPlayers;
      setPlayers(data.items);
      setTotal(data.total); // Now you have the total count!
      setNextToken(data.nextToken);
      
      console.log(`Loaded ${data.items.length} of ${data.total} total players`);
    } catch (error) {
      console.error('Error fetching players:', error);
    }
  };

  return (
    <div>
      <h2>Players ({total} total)</h2>
      {/* Pagination info */}
      <p>Showing {players.length} of {total} players</p>
      
      {/* Players list */}
      <ul>
        {players.map(player => (
          <li key={player.id}>{player.name}</li>
        ))}
      </ul>
      
      {/* Load more button */}
      {nextToken && (
        <button onClick={fetchPlayers}>
          Load More ({total - players.length} remaining)
        </button>
      )}
    </div>
  );
}