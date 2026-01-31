// src/pages/HomePage.tsx
// VERSION: 4.0.0 - Refactored: Extracted components, simplified UI, added countdown timer
//
// ARCHITECTURE:
// - ActiveGame table: Fast queries for RUNNING, REGISTERING, CLOCK_STOPPED, INITIATING, SCHEDULED games
// - RecentlyFinishedGame table: Games finished in last 7 days (auto-cleaned via TTL)
// - UpcomingGame table: Games scheduled to start soon
// - Subscriptions: Real-time updates via onActiveGameChange
//
// SECTIONS:
// 1. Running Games (RUNNING + CLOCK_STOPPED) - Grouped by registration status
// 2. Starting Soon (<24h) - With live countdown timer
// 3. Upcoming Games (>24h)
// 4. Recently Finished (CANCELLED/FINISHED) - Sorted by finish date
//
// FEATURES:
// - Sections hidden when empty (KPI cards show counts)
// - Live countdown timer for Starting Soon games
// - Manual refresh via header button
// - Real-time WebSocket subscription for updates

import React from 'react';
import {
  ArrowPathIcon,
  PlayIcon,
  ClockIcon,
  CalendarIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { useEntity } from '@/contexts/EntityContext';
import { MultiEntitySelector } from '@/components/entities/MultiEntitySelector';
import { useDashboardData } from '@/hooks/useDashboardData';
import { 
  DashboardKpiCards, 
  GameSection 
} from '@/components/dashboard';
import { cx } from '@/lib/utils';

// ============================================
// MAIN COMPONENT
// ============================================

export const HomePage: React.FC = () => {
  const { entities } = useEntity();
  
  const {
    runningGames,
    clockStoppedGames,
    startingSoonGames,
    upcomingGames,
    finishedGames,
    loading,
    error,
    lastUpdated,
    totalRunningCount,
    handleManualRefresh,
  } = useDashboardData();

  // ============================================
  // RENDER
  // ============================================

  if (loading && !lastUpdated) {
    return (
      <>
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Tournament overview and live updates</p>
        </div>
        <div className="flex items-center justify-center py-16">
          <div className="text-center">
            <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">Loading dashboard…</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">Tournament overview and live updates</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Multi-Entity Selector - Only show if user has access to multiple entities */}
          {entities.length > 1 && <MultiEntitySelector />}
          
          {/* Refresh Button */}
          <Button 
            onClick={handleManualRefresh} 
            variant="secondary" 
            size="sm" 
            disabled={loading}
            className="flex items-center gap-1.5"
          >
            <ArrowPathIcon className={cx("h-4 w-4", loading && "animate-spin")} />
            Refresh Now
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {/* KPI Cards */}
      <DashboardKpiCards
        runningCount={totalRunningCount}
        startingSoonCount={startingSoonGames.length}
        upcomingCount={upcomingGames.length}
        finishedCount={finishedGames.length}
      />

      {/* Section 1: Running Games (RUNNING + CLOCK_STOPPED) */}
      <GameSection
        title="Running Games"
        icon={<PlayIcon className="w-5 h-5" />}
        colorClass="bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
        games={runningGames}
        variant="running"
        clockStoppedGames={clockStoppedGames}
      />

      {/* Section 2: Starting Soon (<24 hours) */}
      <GameSection
        title="Starting Soon"
        icon={<ClockIcon className="w-5 h-5" />}
        colorClass="bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400"
        games={startingSoonGames}
        variant="startingSoon"
      />

      {/* Section 3: Upcoming Games (>24 hours) */}
      <GameSection
        title="Upcoming Games"
        icon={<CalendarIcon className="w-5 h-5" />}
        colorClass="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
        games={upcomingGames}
        variant="upcoming"
      />

      {/* Section 4: Recently Finished */}
      <GameSection
        title="Recently Finished"
        icon={<CheckCircleIcon className="w-5 h-5" />}
        colorClass="bg-gray-100 dark:bg-gray-900/30 text-gray-600 dark:text-gray-400"
        games={finishedGames}
        variant="finished"
      />
    </>
  );
};

export default HomePage;
