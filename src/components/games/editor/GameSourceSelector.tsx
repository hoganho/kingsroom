// components/games/editor/GameSourceSelector.tsx
// First step when creating a new game - choose the source/template

import React, { useState, useMemo } from 'react';
import type { RecurringGameOption, SeriesOption, EntityOption, VenueOption } from '../../../types/gameEditor';
import type { GameData } from '../../../types/game';

// ===================================================================
// TYPES
// ===================================================================

export type GameSourceType = 'series' | 'recurring' | 'standalone';

export interface GameSourceSelection {
  type: GameSourceType;
  seriesId?: string;
  recurringGameId?: string;
  // Pre-populated data based on selection
  templateData: Partial<GameData>;
}

interface GameSourceSelectorProps {
  entities: EntityOption[];
  venues: VenueOption[];
  recurringGames: RecurringGameOption[];
  series: SeriesOption[];
  onSelect: (selection: GameSourceSelection) => void;
  onCancel: () => void;
}

// ===================================================================
// SOURCE OPTION CARD
// ===================================================================

interface SourceOptionCardProps {
  icon: string;
  title: string;
  description: string;
  isSelected: boolean;
  onClick: () => void;
  badge?: string;
  badgeColor?: string;
}

const SourceOptionCard: React.FC<SourceOptionCardProps> = ({
  icon,
  title,
  description,
  isSelected,
  onClick,
  badge,
  badgeColor = 'bg-gray-100 text-gray-700',
}) => (
  <button
    type="button"
    onClick={onClick}
    className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
      isSelected
        ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
        : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
    }`}
  >
    <div className="flex items-start gap-3">
      <span className="text-2xl">{icon}</span>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900">{title}</span>
          {badge && (
            <span className={`text-xs px-2 py-0.5 rounded ${badgeColor}`}>
              {badge}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-600 mt-1">{description}</p>
      </div>
      {isSelected && (
        <span className="text-blue-500 text-xl">✓</span>
      )}
    </div>
  </button>
);

// ===================================================================
// SERIES SELECTOR
// ===================================================================

interface SeriesSelectorProps {
  series: SeriesOption[];
  venues: VenueOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const SeriesSelector: React.FC<SeriesSelectorProps> = ({
  series,
  venues,
  selectedId,
  onSelect,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  
  const filteredSeries = useMemo(() => {
    if (!searchQuery) return series;
    const query = searchQuery.toLowerCase();
    return series.filter(s => 
      s.name.toLowerCase().includes(query) ||
      s.year?.toString().includes(query)
    );
  }, [series, searchQuery]);

  // Group by year
  const groupedByYear = useMemo(() => {
    const groups: Record<string, SeriesOption[]> = {};
    filteredSeries.forEach(s => {
      const year = s.year?.toString() || 'Unknown';
      if (!groups[year]) groups[year] = [];
      groups[year].push(s);
    });
    return Object.entries(groups).sort(([a], [b]) => Number(b) - Number(a));
  }, [filteredSeries]);

  if (series.length === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center text-gray-500">
        No series found. Create a series first, or choose a different option.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Search series..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
      />
      
      <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
        {groupedByYear.map(([year, items]) => (
          <div key={year}>
            <div className="px-3 py-1.5 bg-gray-100 text-xs font-semibold text-gray-600 sticky top-0">
              {year}
            </div>
            {items.map(s => {
              const venue = venues.find(v => v.id === s.venueId);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className={`w-full text-left px-3 py-2 border-b border-gray-100 last:border-b-0 hover:bg-blue-50 transition-colors ${
                    selectedId === s.id ? 'bg-blue-50' : ''
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-gray-900">{s.name}</span>
                      {venue && (
                        <span className="text-xs text-gray-500 ml-2">@ {venue.name}</span>
                      )}
                    </div>
                    {selectedId === s.id && <span className="text-blue-500">✓</span>}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
        
        {filteredSeries.length === 0 && (
          <div className="p-4 text-center text-gray-500 text-sm">
            No series match your search.
          </div>
        )}
      </div>
    </div>
  );
};

// ===================================================================
// RECURRING GAME SELECTOR
// ===================================================================

interface RecurringGameSelectorListProps {
  recurringGames: RecurringGameOption[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const RecurringGameSelectorList: React.FC<RecurringGameSelectorListProps> = ({
  recurringGames,
  selectedId,
  onSelect,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  
  const filteredGames = useMemo(() => {
    if (!searchQuery) return recurringGames;
    const query = searchQuery.toLowerCase();
    return recurringGames.filter(rg => 
      rg.name.toLowerCase().includes(query) ||
      rg.dayOfWeek?.toLowerCase().includes(query) ||
      rg.venueName?.toLowerCase().includes(query)
    );
  }, [recurringGames, searchQuery]);

  // Group by venue
  const groupedByVenue = useMemo(() => {
    const groups: Record<string, RecurringGameOption[]> = {};
    filteredGames.forEach(rg => {
      const venueName = rg.venueName || 'Unknown Venue';
      if (!groups[venueName]) groups[venueName] = [];
      groups[venueName].push(rg);
    });
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredGames]);

  if (recurringGames.length === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg text-center text-gray-500">
        No recurring games found. Create a recurring game first, or choose a different option.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <input
        type="text"
        placeholder="Search recurring games..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
      />
      
      <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
        {groupedByVenue.map(([venueName, items]) => (
          <div key={venueName}>
            <div className="px-3 py-1.5 bg-gray-100 text-xs font-semibold text-gray-600 sticky top-0">
              📍 {venueName}
            </div>
            {items.map(rg => (
              <button
                key={rg.id}
                type="button"
                onClick={() => onSelect(rg.id)}
                className={`w-full text-left px-3 py-2 border-b border-gray-100 last:border-b-0 hover:bg-blue-50 transition-colors ${
                  selectedId === rg.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium text-gray-900">{rg.name}</span>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {rg.dayOfWeek} @ {rg.startTime}
                      {rg.buyIn && ` • $${rg.buyIn}`}
                      {rg.gameVariant && ` • ${rg.gameVariant}`}
                    </div>
                  </div>
                  {selectedId === rg.id && <span className="text-blue-500">✓</span>}
                </div>
                
                {/* Preview of what will be auto-filled */}
                {selectedId === rg.id && (
                  <div className="mt-2 pt-2 border-t border-blue-200 text-xs text-blue-700">
                    <span className="font-medium">Will auto-fill:</span>{' '}
                    {[
                      rg.buyIn && 'Buy-In',
                      rg.rake && 'Rake',
                      rg.startingStack && 'Starting Stack',
                      rg.guaranteeAmount && 'Guarantee',
                      rg.gameVariant && 'Variant',
                    ].filter(Boolean).join(', ') || 'Basic info'}
                  </div>
                )}
              </button>
            ))}
          </div>
        ))}
        
        {filteredGames.length === 0 && (
          <div className="p-4 text-center text-gray-500 text-sm">
            No recurring games match your search.
          </div>
        )}
      </div>
    </div>
  );
};

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const GameSourceSelector: React.FC<GameSourceSelectorProps> = ({
  entities: _entities, // Reserved for future use (e.g., entity-based filtering)
  venues,
  recurringGames,
  series,
  onSelect,
  onCancel,
}) => {
  const [sourceType, setSourceType] = useState<GameSourceType | null>(null);
  const [selectedSeriesId, setSelectedSeriesId] = useState<string | null>(null);
  const [selectedRecurringGameId, setSelectedRecurringGameId] = useState<string | null>(null);

  // Build template data based on selection
  const handleContinue = () => {
    if (!sourceType) return;

    let templateData: Partial<GameData> = {};

    if (sourceType === 'series' && selectedSeriesId) {
      const selectedSeries = series.find(s => s.id === selectedSeriesId);
      if (selectedSeries) {
        const venue = venues.find(v => v.id === selectedSeries.venueId);
        templateData = {
          isSeries: true,
          tournamentSeriesId: selectedSeries.id,
          seriesName: selectedSeries.name,
          venueId: selectedSeries.venueId || undefined,
          entityId: venue?.entityId,
        };
      }
    } else if (sourceType === 'recurring' && selectedRecurringGameId) {
      const selectedGame = recurringGames.find(rg => rg.id === selectedRecurringGameId);
      if (selectedGame) {
        templateData = {
          recurringGameId: selectedGame.id,
          recurringGameAssignmentStatus: 'MANUALLY_ASSIGNED' as any,
          name: selectedGame.name,
          venueId: selectedGame.venueId,
          entityId: selectedGame.entityId,
          buyIn: selectedGame.buyIn,
          rake: selectedGame.rake,
          startingStack: selectedGame.startingStack,
          gameVariant: selectedGame.gameVariant as any,
          gameType: (selectedGame.gameType as any) || 'TOURNAMENT',
          hasGuarantee: (selectedGame.guaranteeAmount ?? 0) > 0,
          guaranteeAmount: selectedGame.guaranteeAmount,
        };
      }
    }
    // For standalone, templateData stays empty

    onSelect({
      type: sourceType,
      seriesId: selectedSeriesId || undefined,
      recurringGameId: selectedRecurringGameId || undefined,
      templateData,
    });
  };

  const canContinue = 
    sourceType === 'standalone' ||
    (sourceType === 'series' && selectedSeriesId) ||
    (sourceType === 'recurring' && selectedRecurringGameId);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center pb-4 border-b border-gray-200">
        <h2 className="text-lg font-bold text-gray-900">Create New Game</h2>
        <p className="text-sm text-gray-500 mt-1">
          What type of game are you adding?
        </p>
      </div>

      {/* Source Type Options */}
      <div className="space-y-3">
        <SourceOptionCard
          icon="📚"
          title="Part of a Series"
          description="This game belongs to a tournament series (e.g., WSOP, Aussie Millions, or a venue's monthly championship)"
          isSelected={sourceType === 'series'}
          onClick={() => {
            setSourceType('series');
            setSelectedRecurringGameId(null);
          }}
          badge={`${series.length} available`}
          badgeColor="bg-indigo-100 text-indigo-700"
        />

        <SourceOptionCard
          icon="🔄"
          title="Instance of Recurring Game"
          description="A regular weekly/monthly game (e.g., Friday Night Bounty, Tuesday Turbo)"
          isSelected={sourceType === 'recurring'}
          onClick={() => {
            setSourceType('recurring');
            setSelectedSeriesId(null);
          }}
          badge={`${recurringGames.length} available`}
          badgeColor="bg-purple-100 text-purple-700"
        />

        <SourceOptionCard
          icon="🎯"
          title="Standalone Game"
          description="A one-off game not part of any series or recurring schedule"
          isSelected={sourceType === 'standalone'}
          onClick={() => {
            setSourceType('standalone');
            setSelectedSeriesId(null);
            setSelectedRecurringGameId(null);
          }}
        />
      </div>

      {/* Secondary Selection */}
      {sourceType === 'series' && (
        <div className="pt-4 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Select Series</h3>
          <SeriesSelector
            series={series}
            venues={venues}
            selectedId={selectedSeriesId}
            onSelect={setSelectedSeriesId}
          />
        </div>
      )}

      {sourceType === 'recurring' && (
        <div className="pt-4 border-t border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Select Recurring Game</h3>
          <RecurringGameSelectorList
            recurringGames={recurringGames}
            selectedId={selectedRecurringGameId}
            onSelect={setSelectedRecurringGameId}
          />
        </div>
      )}

      {sourceType === 'standalone' && (
        <div className="pt-4 border-t border-gray-200">
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-start gap-3">
              <span className="text-amber-500 text-xl">💡</span>
              <div className="text-sm text-amber-800">
                <p className="font-medium">Starting from scratch</p>
                <p className="mt-1">You'll need to fill in all game details manually. Consider creating a recurring game template if this game type runs regularly.</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleContinue}
          disabled={!canContinue}
          className={`flex-1 px-4 py-2 rounded-lg font-medium ${
            canContinue
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          }`}
        >
          Continue →
        </button>
      </div>
    </div>
  );
};

export default GameSourceSelector;