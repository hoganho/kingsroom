// src/pages/games/game-tabs/ResultsTab.tsx
// Results tab for GameDetails - Player results and payouts
// =============================================================================

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { TrophyIcon } from '@heroicons/react/24/outline';
import { formatCurrency } from '../../../utils/generalHelpers';

import { PlayerResult } from './types';
import { EmptyState } from './components';

interface ResultsTabProps {
  results: PlayerResult[];
}

export const ResultsTab: React.FC<ResultsTabProps> = ({ results }) => {
  const sortedResults = useMemo(() => {
    return [...results].sort((a, b) => (a.finishingPlace || 999) - (b.finishingPlace || 999));
  }, [results]);

  const totalPrizesPaid = useMemo(() => {
    return results.reduce((sum, r) => sum + (r.amountWon || 0), 0);
  }, [results]);

  const totalPointsAwarded = useMemo(() => {
    return results.reduce((sum, r) => sum + (r.pointsEarned || 0), 0);
  }, [results]);

  const getPlaceStyle = (place?: number) => {
    if (!place) return '';
    if (place === 1) return 'bg-yellow-50 border-l-4 border-yellow-400';
    if (place === 2) return 'bg-gray-50 border-l-4 border-gray-400';
    if (place === 3) return 'bg-amber-50 border-l-4 border-amber-600';
    return '';
  };

  const getPlaceIcon = (place?: number) => {
    if (place === 1) return '🥇';
    if (place === 2) return '🥈';
    if (place === 3) return '🥉';
    return null;
  };

  if (results.length === 0) {
    return <EmptyState message="No results available yet for this game" icon={TrophyIcon} />;
  }

  return (
    <div className="space-y-4">
      {/* Summary Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-green-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-green-700">{formatCurrency(totalPrizesPaid)}</p>
          <p className="text-xs text-gray-500 mt-1">Total Prizes Paid</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-blue-700">{results.filter(r => r.prizeWon).length}</p>
          <p className="text-xs text-gray-500 mt-1">Players in the Money</p>
        </div>
        <div className="bg-purple-50 rounded-lg p-4 text-center">
          <p className="text-2xl font-bold text-purple-700">{totalPointsAwarded.toLocaleString()}</p>
          <p className="text-xs text-gray-500 mt-1">Total Points Awarded</p>
        </div>
      </div>

      {/* Results Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase w-16">
                  Place
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Player
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Prize
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Points
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Net P/L
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Notes
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedResults.map((result) => (
                <tr key={result.id} className={`hover:bg-gray-50 ${getPlaceStyle(result.finishingPlace)}`}>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center">
                      {getPlaceIcon(result.finishingPlace) || (
                        <span className="text-sm font-bold text-gray-700">
                          {result.finishingPlace || '-'}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {result.player ? (
                      <Link 
                        to={`/players/${result.player.id}`}
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-900"
                      >
                        {result.player.firstName} {result.player.lastName}
                      </Link>
                    ) : (
                      <span className="text-sm text-gray-500">Unknown</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {result.prizeWon ? (
                      <span className="text-sm font-semibold text-green-600">
                        {formatCurrency(result.amountWon)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-600">
                    {result.pointsEarned?.toLocaleString() || '-'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {result.netProfitLoss !== undefined && result.netProfitLoss !== null ? (
                      <span className={`text-sm font-medium ${
                        result.netProfitLoss >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {result.netProfitLoss >= 0 ? '+' : ''}{formatCurrency(result.netProfitLoss)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {result.isMultiDayQualification && (
                      <span className="inline-flex px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
                        Qualified
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ResultsTab;