// src/pages/HomePage.tsx

import { useState, useEffect } from 'react';
import { getClient } from '../utils/apiClient';
import { PageWrapper } from '../components/layout/PageWrapper';
import { format } from 'date-fns';
import { formatCurrency } from '../utils/generalHelpers';

interface Tournament {
  id: string;
  tournamentId?: number;
  name: string;
  gameStartDateTime: string;
  gameEndDateTime?: string;
  gameStatus: string;
  playersRemaining?: number;
  totalEntries?: number;
  prizepool?: number;
  buyIn?: number;
  venue?: {
    name: string;
  };
  sourceUrl?: string;
}

export const HomePage = () => {
  const [runningTournaments, setRunningTournaments] = useState<Tournament[]>([]);
  const [finishedTournaments, setFinishedTournaments] = useState<Tournament[]>([]);
  const [upcomingTournaments, setUpcomingTournaments] = useState<Tournament[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTournaments();
  }, []);

  const fetchTournaments = async () => {
    const client = getClient();
    setLoading(true);
    try {
      // Fetch games with different statuses
      const now = new Date().toISOString();
      
      // Running tournaments (status = 'Running' or 'Late Registration')
      const runningResponse = await client.graphql({
        query: /* GraphQL */ `
          query ListRunningGames {
            listGames(
              filter: { 
                or: [
                  { gameStatus: { eq: RUNNING } },
                  { gameStatus: { eq: REGISTERING } }
                ]
              }
              limit: 20
            ) {
              items {
                id
                tournamentId
                name
                gameStartDateTime
                gameStatus
                playersRemaining
                totalEntries
                buyIn
                sourceUrl
                venue {
                  name
                }
              }
            }
          }
        `,
      });

      // Finished tournaments (status = 'Complete' in last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const finishedResponse = await client.graphql({
        query: /* GraphQL */ `
          query ListFinishedGames($since: String) {
            listGames(
              filter: { 
                gameStatus: { eq: FINISHED },
                gameEndDateTime: { gt: $since }
              }
              limit: 20
            ) {
              items {
                id
                tournamentId
                name
                gameStartDateTime
                gameEndDateTime
                gameStatus
                prizepool
                totalEntries
                buyIn
                sourceUrl
                venue {
                  name
                }
              }
            }
          }
        `,
        variables: { since: sevenDaysAgo.toISOString() }
      });

      // Upcoming tournaments (status = 'Registration Open' or future start date)
      const upcomingResponse = await client.graphql({
        query: /* GraphQL */ `
          query ListUpcomingGames($now: String) {
            listGames(
              filter: { 
                or: [
                  { gameStatus: { eq: REGISTERING } },
                  { gameStartDateTime: { gt: $now } }
                ]
              }
              limit: 20
            ) {
              items {
                id
                tournamentId
                name
                gameStartDateTime
                gameStatus
                buyIn
                sourceUrl
                venue {
                  name
                }
              }
            }
          }
        `,
        variables: { now }
      });

      if ('data' in runningResponse && runningResponse.data) {
        setRunningTournaments(runningResponse.data.listGames.items.filter(Boolean) as Tournament[]);
      }
      if ('data' in finishedResponse && finishedResponse.data) {
        setFinishedTournaments(finishedResponse.data.listGames.items.filter(Boolean) as Tournament[]);
      }
      if ('data' in upcomingResponse && upcomingResponse.data) {
        setUpcomingTournaments(upcomingResponse.data.listGames.items.filter(Boolean) as Tournament[]);
      }
    } catch (error) {
      console.error('Error fetching tournaments:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatDateTime = (dateString: string) => {
    try {
      return format(new Date(dateString), "dd-MMM-yy '@' HH:mm");
    } catch {
      return 'Invalid Date';
    }
  };

  const TournamentTable = ({ 
    tournaments, 
    title, 
    showPlayersRemaining = false,
    showPrizepool = false,
    showTotalEntries = true 
  }: {
    tournaments: Tournament[];
    title: string;
    showPlayersRemaining?: boolean;
    showPrizepool?: boolean;
    showTotalEntries?: boolean;
  }) => (
    <div className="bg-white shadow rounded-lg">
      <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tournament ID
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Start Date/Time
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Name
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Venue
              </th>
              {showPlayersRemaining && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Players Remaining
                </th>
              )}
              {showPrizepool && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Prizepool
                </th>
              )}
              {showTotalEntries && (
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total Entries
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {tournaments.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-4 text-center text-sm text-gray-500">
                  No tournaments found
                </td>
              </tr>
            ) : (
              tournaments.map((tournament) => (
                <tr key={tournament.tournamentId} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    {tournament.sourceUrl ? (
                      <a
                        href={tournament.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-indigo-600 hover:text-indigo-900"
                      >
                        {tournament.tournamentId}
                      </a>
                    ) : (
                      <span className="text-gray-900">
                        {tournament.tournamentId}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {formatDateTime(tournament.gameStartDateTime)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    {tournament.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {tournament.venue?.name || '-'}
                  </td>
                  {showPlayersRemaining && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {tournament.playersRemaining || '-'}
                    </td>
                  )}
                  {showPrizepool && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {tournament.prizepool ? formatCurrency(tournament.prizepool) : '-'}
                    </td>
                  )}
                  {showTotalEntries && (
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {tournament.totalEntries || '-'}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  if (loading) {
    return (
      <PageWrapper title="Home" maxWidth="7xl">
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500">Loading tournaments...</div>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper title="Home" maxWidth="7xl">
      {/* Running Tournaments */}
      <div className="mb-8">
        <TournamentTable
          tournaments={runningTournaments}
          title="Running Tournaments"
          showPlayersRemaining={true}
          showTotalEntries={true}
        />
      </div>

      {/* Grid layout for finished and upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Recently Finished */}
        <TournamentTable
          tournaments={finishedTournaments}
          title="Recently Finished Tournaments"
          showPrizepool={true}
          showTotalEntries={true}
        />

        {/* Upcoming Tournaments */}
        <TournamentTable
          tournaments={upcomingTournaments}
          title="Upcoming Tournaments"
          showPlayersRemaining={false}
          showTotalEntries={false}
        />
      </div>
    </PageWrapper>
  );
};
