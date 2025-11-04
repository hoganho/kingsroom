// src/pages/players/PlayersDashboard.tsx

import { useState, useEffect } from 'react';
import { getClient } from '../../utils/apiClient';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { 
  TrophyIcon, 
  CurrencyPoundIcon, 
  ChartBarIcon, 
  UserPlusIcon,
  FireIcon,
  BanknotesIcon
} from '@heroicons/react/24/outline';
import { format, subDays } from 'date-fns';


interface PlayerStat {
  playerId: string;
  firstName: string;
  lastName: string;
  value: number;
  additionalInfo?: string;
}

type TimePeriod = 7 | 30 | 60 | 90 | 180 | 365;

export const PlayersDashboard = () => {
  const [timePeriod, setTimePeriod] = useState<TimePeriod>(30);
  const [loading, setLoading] = useState(true);
  
  // Player statistics states
  const [mostActive, setMostActive] = useState<PlayerStat[]>([]);
  const [highestSpending, setHighestSpending] = useState<PlayerStat[]>([]);
  const [mostCashes, setMostCashes] = useState<PlayerStat[]>([]);
  const [highestCashes, setHighestCashes] = useState<PlayerStat[]>([]);
  const [bestROI, setBestROI] = useState<PlayerStat[]>([]);
  const [newestSignups, setNewestSignups] = useState<PlayerStat[]>([]);

  const timePeriodOptions: { value: TimePeriod | 'all'; label: string }[] = [
    { value: 7, label: '7 Days' },
    { value: 30, label: '30 Days' },
    { value: 60, label: '60 Days' },
    { value: 90, label: '90 Days' },
    { value: 180, label: '180 Days' },
    { value: 'all', label: 'All Time' },
  ];

  useEffect(() => {
    fetchPlayerStats();
  }, [timePeriod]);

  const fetchPlayerStats = async () => {
    const client = getClient();
    setLoading(true);
    try {
      const startDate = timePeriod === 365 ? null : subDays(new Date(), timePeriod).toISOString();

      // Fetch player summaries with optional date filtering
        const query = /* GraphQL */ `
          query GetPlayerStats($startDate: String) { 
            listPlayerSummaries(
              limit: 1000,
              filter: { lastPlayed: { gt: $startDate } }
            ) {
              items {
                id
                playerId
                sessionsPlayed
                tournamentsPlayed
                tournamentWinnings
                tournamentBuyIns
                tournamentsCashed
                netBalance
                lastPlayed
                player {
                  firstName
                  lastName
                  registrationDate
                }
              }
            }
          }
        `;

      const response = await client.graphql({
        query,
        variables: { startDate }
      });

      if ('data' in response && response.data) {
        const summaries = response.data.listPlayerSummaries.items.filter(Boolean);
        
        // Process the data for each metric
        processMostActive(summaries);
        processHighestSpending(summaries);
        processMostCashes(summaries);
        processHighestCashes(summaries);
        processBestROI(summaries);
        processNewestSignups(summaries, startDate);
      }
    } catch (error) {
      console.error('Error fetching player stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const processMostActive = (summaries: any[]) => {
    const sorted = summaries
      .filter(s => s.tournamentsPlayed > 0)
      .sort((a, b) => b.tournamentsPlayed - a.tournamentsPlayed)
      .slice(0, 10)
      .map(s => ({
        playerId: s.playerId,
        firstName: s.player?.firstName || 'Unknown',
        lastName: s.player?.lastName || '',
        value: s.tournamentsPlayed,
        additionalInfo: `${s.sessionsPlayed} sessions`
      }));
    setMostActive(sorted);
  };

  const processHighestSpending = (summaries: any[]) => {
    const sorted = summaries
      .filter(s => s.tournamentBuyIns > 0)
      .sort((a, b) => b.tournamentBuyIns - a.tournamentBuyIns)
      .slice(0, 10)
      .map(s => ({
        playerId: s.playerId,
        firstName: s.player?.firstName || 'Unknown',
        lastName: s.player?.lastName || '',
        value: s.tournamentBuyIns,
      }));
    setHighestSpending(sorted);
  };

  const processMostCashes = (summaries: any[]) => {
    const sorted = summaries
      .filter(s => s.tournamentsCashed > 0)
      .sort((a, b) => b.tournamentsCashed - a.tournamentsCashed)
      .slice(0, 10)
      .map(s => ({
        playerId: s.playerId,
        firstName: s.player?.firstName || 'Unknown',
        lastName: s.player?.lastName || '',
        value: s.tournamentsCashed,
        additionalInfo: `${s.tournamentsPlayed} played`
      }));
    setMostCashes(sorted);
  };

  const processHighestCashes = (summaries: any[]) => {
    const sorted = summaries
      .filter(s => s.tournamentWinnings > 0)
      .sort((a, b) => b.tournamentWinnings - a.tournamentWinnings)
      .slice(0, 10)
      .map(s => ({
        playerId: s.playerId,
        firstName: s.player?.firstName || 'Unknown',
        lastName: s.player?.lastName || '',
        value: s.tournamentWinnings,
      }));
    setHighestCashes(sorted);
  };

  const processBestROI = (summaries: any[]) => {
    const sorted = summaries
      .filter(s => s.tournamentBuyIns > 100) // Min buy-in threshold
      .map(s => ({
        ...s,
        roi: ((s.tournamentWinnings - s.tournamentBuyIns) / s.tournamentBuyIns) * 100
      }))
      .sort((a, b) => b.roi - a.roi)
      .slice(0, 10)
      .map(s => ({
        playerId: s.playerId,
        firstName: s.player?.firstName || 'Unknown',
        lastName: s.player?.lastName || '',
        value: s.roi,
        additionalInfo: `£${s.tournamentWinnings.toLocaleString()} won`
      }));
    setBestROI(sorted);
  };

  const processNewestSignups = (summaries: any[], startDate: string | null) => {
    const sorted = summaries
      .filter(s => s.player?.registrationDate && (!startDate || s.player.registrationDate > startDate))
      .sort((a, b) => {
        const dateA = new Date(a.player?.registrationDate || 0);
        const dateB = new Date(b.player?.registrationDate || 0);
        return dateB.getTime() - dateA.getTime();
      })
      .slice(0, 10)
      .map(s => ({
        playerId: s.playerId,
        firstName: s.player?.firstName || 'Unknown',
        lastName: s.player?.lastName || '',
        value: 0,
        additionalInfo: format(new Date(s.player.registrationDate), 'dd MMM yyyy')
      }));
    setNewestSignups(sorted);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-GB', {
      style: 'currency',
      currency: 'GBP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const StatCard = ({ 
    title, 
    icon: Icon, 
    stats,
    formatValue = (v: number) => v.toString(),
    showAdditionalInfo = false
  }: {
    title: string;
    icon: any;
    stats: PlayerStat[];
    formatValue?: (value: number) => string;
    showAdditionalInfo?: boolean;
  }) => (
    <div className="bg-white overflow-hidden shadow rounded-lg">
      <div className="px-4 py-5 sm:p-6">
        <div className="flex items-center mb-4">
          <Icon className="h-8 w-8 text-indigo-600 mr-3" />
          <h3 className="text-lg font-medium text-gray-900">{title}</h3>
        </div>
        <div className="mt-3">
          {stats.length === 0 ? (
            <p className="text-sm text-gray-500">No data available</p>
          ) : (
            <ul className="divide-y divide-gray-200">
              {stats.map((stat, index) => (
                <li key={stat.playerId} className="py-3 flex items-center justify-between">
                  <div className="flex items-center">
                    <span className="text-sm font-medium text-gray-500 w-6">
                      {index + 1}.
                    </span>
                    <span className="ml-3 text-sm font-medium text-gray-900">
                      {stat.firstName} {stat.lastName}
                    </span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {formatValue(stat.value)}
                    </p>
                    {showAdditionalInfo && stat.additionalInfo && (
                      <p className="text-xs text-gray-500">{stat.additionalInfo}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <PageWrapper
      title="Players Dashboard"
      maxWidth="7xl"
      actions={
        <div className="flex items-center space-x-2">
          {timePeriodOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setTimePeriod(option.value === 'all' ? 365 : option.value)}
              className={`px-3 py-1 text-sm rounded-md ${
                (option.value === 'all' && timePeriod === 365) || option.value === timePeriod
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      }
    >
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="text-gray-500">Loading player statistics...</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <StatCard
            title="Most Active"
            icon={FireIcon}
            stats={mostActive}
            formatValue={(v) => `${v} games`}
            showAdditionalInfo={true}
          />
          <StatCard
            title="Highest Spending"
            icon={BanknotesIcon}
            stats={highestSpending}
            formatValue={formatCurrency}
          />
          <StatCard
            title="Most Cashes"
            icon={TrophyIcon}
            stats={mostCashes}
            formatValue={(v) => `${v} cashes`}
            showAdditionalInfo={true}
          />
          <StatCard
            title="Highest Cashes"
            icon={CurrencyPoundIcon}
            stats={highestCashes}
            formatValue={formatCurrency}
          />
          <StatCard
            title="Best ROI"
            icon={ChartBarIcon}
            stats={bestROI}
            formatValue={(v) => `${v.toFixed(1)}%`}
            showAdditionalInfo={true}
          />
          <StatCard
            title="Newest Sign-ups"
            icon={UserPlusIcon}
            stats={newestSignups}
            formatValue={() => ''}
            showAdditionalInfo={true}
          />
        </div>
      )}
    </PageWrapper>
  );
};
