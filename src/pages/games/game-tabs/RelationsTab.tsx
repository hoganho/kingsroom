// src/pages/games/game-tabs/RelationsTab.tsx
// Relations tab for GameDetails - Series, recurring games, and linked entities
// =============================================================================

import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import {
  TrophyIcon,
  ArrowPathIcon,
  DocumentDuplicateIcon,
  ShareIcon,
  BuildingStorefrontIcon,
  ChevronRightIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '../../../utils/generalHelpers';

import { 
  Game, 
  RecurringGame, 
  TournamentSeries, 
  SocialPost 
} from './types';
import { SectionCard, DetailRow, StatusBadge, EmptyState } from './components';

interface RelationsTabProps {
  game: Game;
  recurringGame?: RecurringGame;
  tournamentSeries?: TournamentSeries;
  parentGame?: Game;
  childGames: Game[];
  linkedSocialPosts: SocialPost[];
}

export const RelationsTab: React.FC<RelationsTabProps> = ({ 
  game, 
  recurringGame, 
  tournamentSeries, 
  parentGame, 
  childGames, 
  linkedSocialPosts 
}) => {
  const formatDateTime = (dateString?: string) => {
    if (!dateString) return '-';
    try {
      return format(new Date(dateString), 'dd MMM yyyy');
    } catch {
      return '-';
    }
  };

  return (
    <div className="space-y-6">
      {/* Series Relationship */}
      {game.isSeries && (
        <SectionCard 
          title="Tournament Series" 
          icon={TrophyIcon}
          headerAction={
            tournamentSeries && (
              <Link 
                to={`/series/${tournamentSeries.id}`}
                className="text-sm text-indigo-600 hover:text-indigo-900"
              >
                View Series →
              </Link>
            )
          }
        >
          {tournamentSeries ? (
            <div className="space-y-4">
              <div className="flex items-start">
                <TrophyIcon className="h-8 w-8 text-yellow-500 mr-3" />
                <div>
                  <p className="font-semibold text-gray-900 text-lg">{tournamentSeries.name}</p>
                  <p className="text-sm text-gray-500">{tournamentSeries.title?.title}</p>
                  <div className="flex items-center gap-3 mt-2">
                    <StatusBadge status={tournamentSeries.status || 'UNKNOWN'} />
                    <span className="text-sm text-gray-500">{tournamentSeries.year}</span>
                    <span className="text-sm text-gray-500">{tournamentSeries.seriesCategory}</span>
                  </div>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                <div>
                  <dt className="text-xs text-gray-500">Date Range</dt>
                  <dd className="text-sm font-medium">
                    {formatDateTime(tournamentSeries.startDate)} - {formatDateTime(tournamentSeries.endDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Events</dt>
                  <dd className="text-sm font-medium">{tournamentSeries.numberOfEvents || '-'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Guaranteed Prizepool</dt>
                  <dd className="text-sm font-medium">{formatCurrency(tournamentSeries.guaranteedPrizepool)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Actual Prizepool</dt>
                  <dd className="text-sm font-medium">{formatCurrency(tournamentSeries.actualPrizepool)}</dd>
                </div>
              </dl>
              {/* Series event info */}
              <div className="pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2">This Game in Series</p>
                <div className="flex flex-wrap gap-2">
                  {game.eventNumber && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
                      Event #{game.eventNumber}
                    </span>
                  )}
                  {game.dayNumber && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-blue-100 text-blue-700">
                      Day {game.dayNumber}
                    </span>
                  )}
                  {game.flightLetter && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-purple-100 text-purple-700">
                      Flight {game.flightLetter}
                    </span>
                  )}
                  {game.isMainEvent && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-yellow-100 text-yellow-700">
                      Main Event
                    </span>
                  )}
                  {game.finalDay && (
                    <span className="inline-flex items-center px-2.5 py-1 rounded text-xs font-medium bg-green-100 text-green-700">
                      Final Day
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500">Series: {game.seriesName || 'Unknown'}</p>
              <p className="text-xs text-gray-400 mt-1">Series details not linked</p>
            </div>
          )}
        </SectionCard>
      )}

      {/* Recurring Game Relationship */}
      {game.recurringGameId && (
        <SectionCard 
          title="Recurring Game Template" 
          icon={ArrowPathIcon}
          headerAction={
            recurringGame && (
              <Link 
                to={`/recurring-games/${recurringGame.id}`}
                className="text-sm text-indigo-600 hover:text-indigo-900"
              >
                View Template →
              </Link>
            )
          }
        >
          {recurringGame ? (
            <div className="space-y-4">
              <div className="flex items-start">
                <ArrowPathIcon className="h-8 w-8 text-indigo-500 mr-3" />
                <div>
                  <p className="font-semibold text-gray-900 text-lg">
                    {recurringGame.displayName || recurringGame.name}
                  </p>
                  {recurringGame.description && (
                    <p className="text-sm text-gray-500 mt-1">{recurringGame.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2">
                    {recurringGame.isActive ? (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-green-100 text-green-700">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">
                        Inactive
                      </span>
                    )}
                    {recurringGame.isSignature && (
                      <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-yellow-100 text-yellow-700">
                        ⭐ Signature Event
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <dl className="grid grid-cols-2 md:grid-cols-3 gap-4 pt-4 border-t border-gray-100">
                <div>
                  <dt className="text-xs text-gray-500">Schedule</dt>
                  <dd className="text-sm font-medium">
                    {recurringGame.dayOfWeek} @ {recurringGame.startTime || 'TBD'}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Frequency</dt>
                  <dd className="text-sm font-medium">{recurringGame.frequency}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Typical Buy-In</dt>
                  <dd className="text-sm font-medium">{formatCurrency(recurringGame.typicalBuyIn)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Typical Guarantee</dt>
                  <dd className="text-sm font-medium">{formatCurrency(recurringGame.typicalGuarantee)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Total Instances</dt>
                  <dd className="text-sm font-medium">{recurringGame.totalInstancesRun || 0}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Avg Attendance</dt>
                  <dd className="text-sm font-medium">{recurringGame.avgAttendance?.toFixed(1) || '-'}</dd>
                </div>
              </dl>
              {/* Assignment Info */}
              <div className="pt-4 border-t border-gray-100">
                <p className="text-xs text-gray-500 mb-2">Assignment Details</p>
                <div className="flex flex-wrap gap-2">
                  <StatusBadge status={game.recurringGameAssignmentStatus || 'UNKNOWN'} type="assignment" />
                  {game.recurringGameAssignmentConfidence && (
                    <span className="text-xs text-gray-500">
                      {(game.recurringGameAssignmentConfidence * 100).toFixed(0)}% confidence
                    </span>
                  )}
                  {game.instanceNumber && (
                    <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-gray-100 text-gray-700">
                      Instance #{game.instanceNumber}
                    </span>
                  )}
                  {game.wasScheduledInstance && (
                    <span className="inline-flex items-center px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-700">
                      Scheduled
                    </span>
                  )}
                </div>
                {game.deviationNotes && (
                  <p className="text-xs text-amber-600 mt-2">
                    ⚠️ {game.deviationNotes}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-sm text-gray-500">Recurring Game ID: {game.recurringGameId}</p>
              <p className="text-xs text-gray-400 mt-1">Template details not found</p>
            </div>
          )}
        </SectionCard>
      )}

      {/* Parent/Child Games (Multi-Day) */}
      {(parentGame || childGames.length > 0) && (
        <SectionCard title="Multi-Day Structure" icon={DocumentDuplicateIcon}>
          {parentGame && (
            <div className="mb-4 pb-4 border-b border-gray-100">
              <p className="text-xs text-gray-500 mb-2">Parent Game (Consolidated)</p>
              <Link 
                to={`/games/${parentGame.id}`}
                className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100"
              >
                <div className="flex-1">
                  <p className="font-medium text-indigo-600">{parentGame.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {formatDateTime(parentGame.gameStartDateTime)} • {parentGame.totalEntries} entries
                  </p>
                </div>
                <ChevronRightIcon className="h-5 w-5 text-gray-400" />
              </Link>
            </div>
          )}
          {childGames.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Related Flights/Days ({childGames.length})</p>
              <div className="space-y-2">
                {childGames.map((child) => (
                  <Link 
                    key={child.id}
                    to={`/games/${child.id}`}
                    className="flex items-center p-3 bg-gray-50 rounded-lg hover:bg-gray-100"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-indigo-600">{child.name}</p>
                        {child.dayNumber && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">
                            Day {child.dayNumber}
                          </span>
                        )}
                        {child.flightLetter && (
                          <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">
                            Flight {child.flightLetter}
                          </span>
                        )}
                        {child.finalDay && (
                          <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
                            Final
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatDateTime(child.gameStartDateTime)} • {child.totalEntries || 0} entries
                      </p>
                    </div>
                    <StatusBadge status={child.gameStatus} type="game" />
                    <ChevronRightIcon className="h-5 w-5 text-gray-400 ml-2" />
                  </Link>
                ))}
              </div>
            </div>
          )}
          {/* Consolidation Info */}
          {game.consolidationType && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <p className="text-xs text-gray-500 mb-2">Consolidation Details</p>
              <dl className="grid grid-cols-2 gap-2">
                <DetailRow label="Type" value={game.consolidationType} />
                <DetailRow label="Key" value={game.consolidationKey} />
                <DetailRow label="Partial Data" value={game.isPartialData ? 'Yes' : 'No'} />
                {game.missingFlightCount && (
                  <DetailRow label="Missing Flights" value={game.missingFlightCount} />
                )}
              </dl>
            </div>
          )}
        </SectionCard>
      )}

      {/* Social Posts */}
      {linkedSocialPosts.length > 0 && (
        <SectionCard title="Linked Social Posts" icon={ShareIcon}>
          <div className="space-y-3">
            {linkedSocialPosts.map((post) => (
              <div key={post.id} className="p-3 bg-gray-50 rounded-lg">
                <div className="flex items-start justify-between">
                  <div className="flex items-center">
                    <span className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full ${
                      post.platform === 'FACEBOOK' ? 'bg-blue-100 text-blue-700' :
                      post.platform === 'INSTAGRAM' ? 'bg-pink-100 text-pink-700' :
                      post.platform === 'TWITTER' ? 'bg-sky-100 text-sky-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {post.platform}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">{post.postType}</span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {formatDateTime(post.postedAt)}
                  </span>
                </div>
                {post.textContent && (
                  <p className="text-sm text-gray-700 mt-2 line-clamp-2">{post.textContent}</p>
                )}
                <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                  <span>❤️ {post.likeCount || 0}</span>
                  <span>💬 {post.commentCount || 0}</span>
                  <span>🔄 {post.shareCount || 0}</span>
                  {post.postUrl && (
                    <a 
                      href={post.postUrl} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      View Post →
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* Entity Info */}
      {game.entity && (
        <SectionCard title="Entity" icon={BuildingStorefrontIcon}>
          <div className="flex items-center">
            {game.entity.entityLogo && (
              <img 
                src={game.entity.entityLogo} 
                alt={game.entity.entityName}
                className="h-10 w-10 rounded-lg object-cover mr-3"
              />
            )}
            <div>
              <p className="font-medium text-gray-900">{game.entity.entityName}</p>
              <p className="text-xs text-gray-500">Entity ID: {game.entityId}</p>
            </div>
          </div>
        </SectionCard>
      )}

      {/* No Relations */}
      {!game.isSeries && !game.recurringGameId && !parentGame && childGames.length === 0 && linkedSocialPosts.length === 0 && (
        <EmptyState 
          message="This game has no linked series, recurring game template, or related games" 
          icon={LinkIcon}
        />
      )}
    </div>
  );
};

export default RelationsTab;
