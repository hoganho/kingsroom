// src/pages/players/PlayerSearch.tsx
// Player Search Page - Search and browse players with real-time search

import React, { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline';

import { PageWrapper } from '../../components/layout/PageWrapper';
import { PlayerCard, PlayerCardSkeleton } from '../../components/players/PlayerCard';
import { usePlayerSearch, usePlayersList } from '../../hooks/usePlayer';
import type { PlayerListItem } from '../../types/player';

export const PlayerSearch: React.FC = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [isSearchMode, setIsSearchMode] = useState(false);

  // Hook for recent players (initial view)
  const {
    players: recentPlayers,
    loading: loadingRecent,
    error: recentError,
    hasMore: hasMoreRecent,
    loadMore: loadMoreRecent,
  } = usePlayersList({}, 100);

  // Hook for search results
  const {
    players: searchResults,
    loading: searching,
    error: searchError,
    search,
    clear: clearSearch,
  } = usePlayerSearch(300);

  // Determine which players to show
  const displayPlayers = isSearchMode ? searchResults : recentPlayers;
  const isLoading = isSearchMode ? searching : loadingRecent;
  const error = isSearchMode ? searchError : recentError;

  // Handle search input changes
  const handleSearchChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchTerm(value);

      if (value.length > 0) {
        setIsSearchMode(true);
        search(value);
      } else {
        setIsSearchMode(false);
        clearSearch();
      }
    },
    [search, clearSearch]
  );

  // Clear search
  const handleClearSearch = useCallback(() => {
    setSearchTerm('');
    setIsSearchMode(false);
    clearSearch();
  }, [clearSearch]);

  // Navigate to player profile
  const handlePlayerClick = useCallback(
    (player: PlayerListItem) => {
      navigate(`/players/profile/${player.id}`);
    },
    [navigate]
  );

  return (
    <PageWrapper title="Player Search" maxWidth="7xl">
      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-xl">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={handleSearchChange}
            className="block w-full pl-10 pr-10 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
            placeholder="Search by first name, last name, or email..."
            aria-label="Search players"
          />
          {/* Clear button */}
          {searchTerm && (
            <button
              onClick={handleClearSearch}
              className="absolute inset-y-0 right-8 pr-3 flex items-center"
              aria-label="Clear search"
            >
              <XMarkIcon className="h-5 w-5 text-gray-400 hover:text-gray-600" />
            </button>
          )}
          {/* Loading indicator */}
          {searching && (
            <div className="absolute inset-y-0 right-0 pr-3 flex items-center">
              <div className="animate-spin h-5 w-5 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          )}
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Players List */}
      <div className="bg-white shadow overflow-hidden sm:rounded-md">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900">
            {isSearchMode
              ? `Search Results (${searchResults.length})`
              : `Recently Active Players (${recentPlayers.length})`}
          </h3>
          {!isSearchMode && (
            <p className="mt-1 text-sm text-gray-500">
              Showing the 100 most recently active players
            </p>
          )}
        </div>

        {/* Loading State */}
        {isLoading && displayPlayers.length === 0 ? (
          <div>
            {[...Array(5)].map((_, i) => (
              <PlayerCardSkeleton key={i} />
            ))}
          </div>
        ) : displayPlayers.length === 0 ? (
          /* Empty State */
          <div className="px-4 py-12 text-center text-gray-500">
            {isSearchMode
              ? 'No players found matching your search'
              : 'No players found'}
          </div>
        ) : (
          /* Player List */
          <>
            <div className="divide-y divide-gray-200">
              {displayPlayers.map((player) => (
                <PlayerCard
                  key={player.id}
                  player={player}
                  showEntityInfo={true}
                  onClick={handlePlayerClick}
                />
              ))}
            </div>

            {/* Load More Button (only for recent players view) */}
            {!isSearchMode && hasMoreRecent && (
              <div className="px-4 py-3 bg-gray-50 sm:px-6 border-t border-gray-200">
                <button
                  onClick={loadMoreRecent}
                  disabled={loadingRecent}
                  className="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
                >
                  {loadingRecent ? 'Loading...' : 'Load More Players'}
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Quick Stats (shown when not searching) */}
      {!isSearchMode && recentPlayers.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white shadow rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-500">Total Displayed</h4>
            <p className="mt-1 text-2xl font-semibold text-gray-900">
              {recentPlayers.length}
            </p>
          </div>
          <div className="bg-white shadow rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-500">With Credit Balance</h4>
            <p className="mt-1 text-2xl font-semibold text-green-600">
              {recentPlayers.filter((p) => (p.creditBalance ?? 0) > 0).length}
            </p>
          </div>
          <div className="bg-white shadow rounded-lg p-4">
            <h4 className="text-sm font-medium text-gray-500">With Points</h4>
            <p className="mt-1 text-2xl font-semibold text-blue-600">
              {recentPlayers.filter((p) => (p.pointsBalance ?? 0) > 0).length}
            </p>
          </div>
        </div>
      )}
    </PageWrapper>
  );
};

export default PlayerSearch;
