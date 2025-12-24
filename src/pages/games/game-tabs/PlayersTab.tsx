// src/pages/games/game-tabs/PlayersTab.tsx
// Players tab for GameDetails - Player entries list
// =============================================================================

import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
  UserGroupIcon,
  ClockIcon,
  PlayIcon,
  XCircleIcon,
} from '@heroicons/react/24/outline';

import { PlayerEntry } from '../../../API';
import { EmptyState } from './components';

interface PlayersTabProps {
  entries: PlayerEntry[];
}

export const PlayersTab: React.FC<PlayersTabProps> = ({ entries }) => {
  const [sortBy, setSortBy] = useState<'name' | 'status' | 'stack' | 'table'>('name');
  const [sortAsc, setSortAsc] = useState(true);

  const sortedEntries = useMemo(() => {
    const sorted = [...entries].sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case 'name':
          comparison = `${a.player?.firstName} ${a.player?.lastName}`.localeCompare(
            `${b.player?.firstName} ${b.player?.lastName}`
          );
          break;
        case 'status':
          comparison = (a.status || '').localeCompare(b.status || '');
          break;
        case 'stack':
          comparison = (a.lastKnownStackSize || 0) - (b.lastKnownStackSize || 0);
          break;
        case 'table':
          comparison = (a.tableNumber || 0) - (b.tableNumber || 0);
          break;
      }
      return sortAsc ? comparison : -comparison;
    });
    return sorted;
  }, [entries, sortBy, sortAsc]);

  const handleSort = (field: typeof sortBy) => {
    if (sortBy === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortBy(field);
      setSortAsc(true);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PLAYING':
        return <PlayIcon className="h-4 w-4 text-green-500" />;
      case 'ELIMINATED':
        return <XCircleIcon className="h-4 w-4 text-red-500" />;
      case 'REGISTERED':
        return <ClockIcon className="h-4 w-4 text-blue-500" />;
      default:
        return null;
    }
  };

  if (entries.length === 0) {
    return <EmptyState message="No player entries found for this game" icon={UserGroupIcon} />;
  }

  return (
    <div className="space-y-4">
      {/* Stats Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{entries.length}</p>
          <p className="text-xs text-gray-500">Total Entries</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-600">
            {entries.filter(e => e.status === 'PLAYING').length}
          </p>
          <p className="text-xs text-gray-500">Still Playing</p>
        </div>
        <div className="bg-red-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-red-600">
            {entries.filter(e => e.status === 'ELIMINATED').length}
          </p>
          <p className="text-xs text-gray-500">Eliminated</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-blue-600">
            {entries.filter(e => e.entryType === 'REENTRY').length}
          </p>
          <p className="text-xs text-gray-500">Re-entries</p>
        </div>
      </div>

      {/* Player Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('name')}
                >
                  Player {sortBy === 'name' && (sortAsc ? '↑' : '↓')}
                </th>
                <th 
                  className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('status')}
                >
                  Status {sortBy === 'status' && (sortAsc ? '↑' : '↓')}
                </th>
                <th 
                  className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('table')}
                >
                  Table / Seat {sortBy === 'table' && (sortAsc ? '↑' : '↓')}
                </th>
                <th 
                  className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                  onClick={() => handleSort('stack')}
                >
                  Stack {sortBy === 'stack' && (sortAsc ? '↑' : '↓')}
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">
                  Entry Type
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  Registered
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {sortedEntries.map((entry) => (
                <tr key={entry.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {entry.player ? (
                      <Link 
                        to={`/players/${entry.player.id}`}
                        className="text-sm font-medium text-indigo-600 hover:text-indigo-900"
                      >
                        {entry.player.firstName} {entry.player.lastName}
                      </Link>
                    ) : (
                      <span className="text-sm text-gray-500">Unknown</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center">
                      {getStatusIcon(entry.status)}
                      <span className="ml-1.5 text-sm text-gray-700">{entry.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center text-sm text-gray-600">
                    {entry.tableNumber && entry.seatNumber 
                      ? `T${entry.tableNumber} / S${entry.seatNumber}`
                      : '-'
                    }
                  </td>
                  <td className="px-4 py-3 text-right text-sm font-medium text-gray-900">
                    {entry.lastKnownStackSize?.toLocaleString() || '-'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex px-2 py-0.5 text-xs rounded-full ${
                      entry.entryType === 'REENTRY' 
                        ? 'bg-purple-100 text-purple-700' 
                        : 'bg-gray-100 text-gray-700'
                    }`}>
                      {entry.entryType || 'INITIAL'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right text-sm text-gray-500">
                    {entry.registrationTime 
                      ? format(new Date(entry.registrationTime), 'HH:mm')
                      : '-'
                    }
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

export default PlayersTab;