// src/pages/games/game-tabs/OverviewTab.tsx
// Overview tab for GameDetails - Core game information
// =============================================================================

import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { format, formatDistanceToNow } from 'date-fns';
import {
  TableCellsIcon,
  CalendarDaysIcon,
  TrophyIcon,
  ChartBarIcon,
  MapPinIcon,
  ListBulletIcon,
  InformationCircleIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';

import { Game, TournamentStructure, TournamentLevel } from './types';
import { SectionCard, DetailRow, StatusBadge } from './components';

interface OverviewTabProps {
  game: Game;
  structure?: TournamentStructure;
}

export const OverviewTab: React.FC<OverviewTabProps> = ({ game, structure }) => {
  const formatDateTime = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), "EEE, dd MMM yyyy 'at' HH:mm");
    } catch {
      return '-';
    }
  };

  const formatRelativeTime = (dateString?: string) => {
    if (!dateString) return '';
    try {
      return formatDistanceToNow(new Date(dateString), { addSuffix: true });
    } catch {
      return '';
    }
  };

  const parsedLevels = useMemo(() => {
    if (!game.levels) return null;
    try {
      return typeof game.levels === 'string' ? JSON.parse(game.levels) : game.levels;
    } catch {
      return null;
    }
  }, [game.levels]);

  const displayLevels = structure?.levels || parsedLevels;

  return (
    <div className="space-y-6">
      {/* Core Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <SectionCard title="Game Details" icon={TableCellsIcon}>
          <dl className="divide-y divide-gray-100">
            <DetailRow label="Game Type" value={game.gameType} />
            <DetailRow label="Variant" value={game.gameVariant || game.variant} />
            <DetailRow label="Tournament Type" value={game.tournamentType} />
            <DetailRow label="Session Mode" value={game.sessionMode} />
            <DetailRow label="Betting Structure" value={game.bettingStructure?.replace(/_/g, ' ')} />
            <DetailRow label="Speed Type" value={game.speedType} />
            <DetailRow label="Table Size" value={game.tableSize?.replace(/_/g, ' ')} />
            <DetailRow label="Max Players" value={game.maxPlayers} />
            <DetailRow label="Deal Type" value={game.dealType?.replace(/_/g, ' ')} />
            <DetailRow label="Dealer Dealt" value={game.dealerDealt ? 'Yes' : 'No'} />
          </dl>
        </SectionCard>

        <SectionCard title="Schedule & Status" icon={CalendarDaysIcon}>
          <dl className="divide-y divide-gray-100">
            <DetailRow 
              label="Start Time" 
              value={
                <div className="text-right">
                  <div>{formatDateTime(game.gameStartDateTime)}</div>
                  <div className="text-xs text-gray-400">{formatRelativeTime(game.gameStartDateTime)}</div>
                </div>
              } 
            />
            <DetailRow 
              label="End Time" 
              value={formatDateTime(game.gameEndDateTime)} 
            />
            <DetailRow label="Duration" value={game.totalDuration} />
            <DetailRow label="Game Status" value={<StatusBadge status={game.gameStatus} type="game" />} />
            <DetailRow label="Registration Status" value={game.registrationStatus} />
            <DetailRow label="Frequency" value={game.gameFrequency} />
            <DetailRow label="Schedule Type" value={game.scheduleType?.replace(/_/g, ' ')} />
          </dl>
        </SectionCard>
      </div>

      {/* Tournament-Specific Classification */}
      {game.gameType === 'TOURNAMENT' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SectionCard title="Tournament Classification" icon={TrophyIcon}>
            <dl className="divide-y divide-gray-100">
              <DetailRow label="Entry Structure" value={game.entryStructure?.replace(/_/g, ' ')} />
              <DetailRow label="Bounty Type" value={game.bountyType?.replace(/_/g, ' ')} />
              {game.bountyAmount && <DetailRow label="Bounty Amount" value={`$${game.bountyAmount.toLocaleString()}`} />}
              {game.bountyPercentage && <DetailRow label="Bounty Percentage" value={`${game.bountyPercentage}%`} />}
              <DetailRow label="Tournament Purpose" value={game.tournamentPurpose?.replace(/_/g, ' ')} />
              <DetailRow label="Buy-In Tier" value={game.buyInTier?.replace(/_/g, ' ')} />
              <DetailRow label="Stack Depth" value={game.stackDepth} />
              <DetailRow label="Late Registration" value={game.lateRegistration?.replace(/_/g, ' ')} />
              <DetailRow label="Payout Structure" value={game.payoutStructure?.replace(/_/g, ' ')} />
              <DetailRow label="Is Satellite" value={game.isSatellite ? 'Yes' : 'No'} />
            </dl>
          </SectionCard>

          <SectionCard title="Entry & Stack Info" icon={ChartBarIcon}>
            <dl className="divide-y divide-gray-100">
              <DetailRow label="Starting Stack" value={game.startingStack?.toLocaleString()} />
              <DetailRow label="Unique Players" value={game.totalUniquePlayers} />
              <DetailRow label="Initial Entries" value={game.totalInitialEntries} />
              <DetailRow label="Total Entries" value={game.totalEntries} />
              <DetailRow label="Rebuys" value={game.totalRebuys} />
              <DetailRow label="Add-ons" value={game.totalAddons} />
              <DetailRow label="Players Remaining" value={game.playersRemaining} />
              <DetailRow label="Avg Stack" value={game.averagePlayerStack?.toLocaleString()} />
              <DetailRow label="Total Chips in Play" value={game.totalChipsInPlay?.toLocaleString()} />
            </dl>
          </SectionCard>
        </div>
      )}

      {/* Venue Info */}
      {game.venue && (
        <SectionCard 
          title="Venue" 
          icon={MapPinIcon}
          headerAction={
            <Link 
              to={`/venues/${game.venueId}`}
              className="text-sm text-indigo-600 hover:text-indigo-900"
            >
              View Venue →
            </Link>
          }
        >
          <div className="flex items-start">
            <MapPinIcon className="h-5 w-5 text-gray-400 mt-0.5 mr-3" />
            <div>
              <p className="font-medium text-gray-900">{game.venue.name}</p>
              {(game.venue.address || game.venue.city) && (
                <p className="text-sm text-gray-500 mt-1">
                  {[game.venue.address, game.venue.city, game.venue.country].filter(Boolean).join(', ')}
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <StatusBadge status={game.venueAssignmentStatus || 'UNKNOWN'} type="assignment" />
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Tournament Structure */}
      {displayLevels && displayLevels.length > 0 && (
        <SectionCard title="Blind Structure" icon={ListBulletIcon}>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Level</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Duration</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">Small Blind</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">Big Blind</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">Ante</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {displayLevels.slice(0, 15).map((level: TournamentLevel) => (
                  <tr key={level.levelNumber} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-900">{level.levelNumber}</td>
                    <td className="px-3 py-2 text-gray-600">{level.duration} min</td>
                    <td className="px-3 py-2 text-gray-900 text-right">{level.smallBlind?.toLocaleString()}</td>
                    <td className="px-3 py-2 text-gray-900 text-right">{level.bigBlind?.toLocaleString()}</td>
                    <td className="px-3 py-2 text-gray-600 text-right">
                      {level.bigBlindAnte || level.ante || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {displayLevels.length > 15 && (
              <p className="text-xs text-gray-500 mt-2 px-3">
                Showing first 15 of {displayLevels.length} levels
              </p>
            )}
          </div>
        </SectionCard>
      )}

      {/* Tags & Metadata */}
      {(game.gameTags?.length || game.classificationSource || game.wasEdited) && (
        <SectionCard title="Metadata" icon={InformationCircleIcon}>
          <div className="space-y-4">
            {game.gameTags && game.gameTags.length > 0 && (
              <div>
                <p className="text-xs text-gray-500 mb-2">Tags</p>
                <div className="flex flex-wrap gap-2">
                  {game.gameTags.map((tag, idx) => (
                    <span 
                      key={idx} 
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-700"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            <dl className="divide-y divide-gray-100">
              <DetailRow label="Classification Source" value={game.classificationSource} />
              {game.classificationConfidence && (
                <DetailRow label="Classification Confidence" value={`${(game.classificationConfidence * 100).toFixed(0)}%`} />
              )}
              <DetailRow label="Was Edited" value={game.wasEdited ? 'Yes' : 'No'} />
              {game.lastEditedAt && (
                <DetailRow label="Last Edited" value={`${formatDateTime(game.lastEditedAt)} by ${game.lastEditedBy}`} />
              )}
              <DetailRow label="Source URL" value={
                game.sourceUrl ? (
                  <a 
                    href={game.sourceUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-900 flex items-center"
                  >
                    <LinkIcon className="h-3 w-3 mr-1" />
                    View Source
                  </a>
                ) : '-'
              } />
            </dl>
          </div>
        </SectionCard>
      )}
    </div>
  );
};

export default OverviewTab;
