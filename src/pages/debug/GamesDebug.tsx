// src/pages/debug/GamesDebug.tsx
// This is the existing Games page renamed to GamesDebug for the Debug section

import { useState, useEffect } from 'react';
import { getClient } from '../../utils/apiClient';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { listGamesForDebug, listTournamentStructuresForDebug } from '../../graphql/customQueries';
import * as APITypes from '../../API';

type Game = APITypes.Game;
type TournamentStructure = APITypes.TournamentStructure;


export const GamesDebug = () => {
  const [activeTab, setActiveTab] = useState<'games' | 'structures'>('games');
  const [games, setGames] = useState<Game[]>([]);
  const [tournamentStructures, setTournamentStructures] = useState<TournamentStructure[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [structuresLoading, setStructuresLoading] = useState(false);
  const [gamesNextToken, setGamesNextToken] = useState<string | null>(null);
  const [structuresNextToken, setStructuresNextToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchGames();
  }, []);

  const fetchGames = async (nextToken?: string | null) => {
    const client = getClient();
    setGamesLoading(true);
    setError(null);
    
    try {
      const variables: any = { limit: 50 };
      if (nextToken) {
        variables.nextToken = nextToken;
      }

      const response = await client.graphql({
        query: listGamesForDebug,
        variables
      });

      if ('data' in response && response.data) {
        const gameItems = response.data.listGames.items.filter(Boolean) as Game[];
        
        if (nextToken) {
          setGames(prev => [...prev, ...gameItems]);
        } else {
          setGames(gameItems);
        }
        
        setGamesNextToken(response.data.listGames.nextToken || null);
      }
    } catch (err) {
      console.error('Error fetching games:', err);
      setError('Failed to fetch games');
    } finally {
      setGamesLoading(false);
    }
  };

  const fetchTournamentStructures = async (nextToken?: string | null) => {
    const client = getClient();
    setStructuresLoading(true);
    setError(null);
    
    try {
      const variables: any = { limit: 50 };
      if (nextToken) {
        variables.nextToken = nextToken;
      }

      const response = await client.graphql({
        query: listTournamentStructuresForDebug,
        variables
      });

      if ('data' in response && response.data) {
        const structureItems = response.data.listTournamentStructures.items.filter(Boolean) as TournamentStructure[];
        
        if (nextToken) {
          setTournamentStructures(prev => [...prev, ...structureItems]);
        } else {
          setTournamentStructures(structureItems);
        }
        
        setStructuresNextToken(response.data.listTournamentStructures.nextToken || null);
      }
    } catch (err) {
      console.error('Error fetching tournament structures:', err);
      setError('Failed to fetch tournament structures');
    } finally {
      setStructuresLoading(false);
    }
  };

  const handleTabChange = (tab: 'games' | 'structures') => {
    setActiveTab(tab);
    if (tab === 'structures' && tournamentStructures.length === 0) {
      fetchTournamentStructures();
    }
  };

  const TabButton = ({ 
    label, 
    value, 
    count 
  }: { 
    label: string; 
    value: 'games' | 'structures';
    count: number;
  }) => (
    <button
      onClick={() => handleTabChange(value)}
      className={`px-4 py-2 font-medium text-sm rounded-lg transition-colors ${
        activeTab === value
          ? 'bg-indigo-600 text-white'
          : 'text-gray-500 hover:text-gray-700'
      }`}
    >
      {label} ({count})
    </button>
  );

  return (
    <PageWrapper title="Games (Debug)" maxWidth="7xl">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <p className="text-sm text-yellow-800">
          <strong>Debug Mode:</strong> This page displays raw game data for debugging purposes.
        </p>
      </div>

      <div className="mb-6 flex space-x-4">
        <TabButton label="Games" value="games" count={games.length} />
        <TabButton label="Tournament Structures" value="structures" count={tournamentStructures.length} />
      </div>

      {error && (
        <div className="bg-red-50 text-red-600 p-4 rounded-lg mb-4">
          {error}
        </div>
      )}

      {activeTab === 'games' && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:px-6 border-b">
            <h3 className="text-lg font-semibold text-gray-900">Games Table</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Start Date</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Venue</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {gamesLoading && games.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                      Loading games...
                    </td>
                  </tr>
                ) : games.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-4 text-center text-gray-500">
                      No games found
                    </td>
                  </tr>
                ) : (
                  games.map((game) => (
                    <tr key={game.id}>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {game.tournamentId}...
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{game.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{game.gameType}</td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`inline-flex px-2 text-xs font-semibold rounded-full ${
                          game.gameStatus === APITypes.GameStatus.RUNNING 
                            ? 'bg-green-100 text-green-800'
                            : game.gameStatus === APITypes.GameStatus.FINISHED
                            ? 'bg-gray-100 text-gray-800'
                            : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {game.gameStatus}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {game.gameStartDateTime ? new Date(game.gameStartDateTime).toLocaleDateString() : '-'}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {game.venue?.name || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {gamesNextToken && (
            <div className="px-4 py-3 border-t">
              <button
                onClick={() => fetchGames(gamesNextToken)}
                disabled={gamesLoading}
                className="text-sm text-indigo-600 hover:text-indigo-900 disabled:opacity-50"
              >
                {gamesLoading ? 'Loading...' : 'Load more games'}
              </button>
            </div>
          )}
        </div>
      )}

      {activeTab === 'structures' && (
        <div className="bg-white shadow rounded-lg">
          <div className="px-4 py-5 sm:px-6 border-b">
            <h3 className="text-lg font-semibold text-gray-900">Tournament Structures Table</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Game</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Levels</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Breaks</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {structuresLoading && tournamentStructures.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                      Loading tournament structures...
                    </td>
                  </tr>
                ) : tournamentStructures.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-6 py-4 text-center text-gray-500">
                      No tournament structures found
                    </td>
                  </tr>
                ) : (
                  tournamentStructures.map((structure) => (
                    <tr key={structure.id}>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {structure.id.slice(0, 8)}...
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {structure.game?.name || structure.gameId}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {structure.levels?.length || 0} levels
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">
                        {structure.breaks?.length || 0} breaks
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          {structuresNextToken && (
            <div className="px-4 py-3 border-t">
              <button
                onClick={() => fetchTournamentStructures(structuresNextToken)}
                disabled={structuresLoading}
                className="text-sm text-indigo-600 hover:text-indigo-900 disabled:opacity-50"
              >
                {structuresLoading ? 'Loading...' : 'Load more structures'}
              </button>
            </div>
          )}
        </div>
      )}
    </PageWrapper>
  );
};
