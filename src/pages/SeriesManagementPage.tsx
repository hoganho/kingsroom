// src/pages/SeriesManagementPage.tsx
import { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import * as mutations from '../graphql/mutations';
import * as APITypes from '../API';

import {
  ArrowPathIcon,
  CalendarDaysIcon,
  FolderIcon,
} from '@heroicons/react/24/outline';

import { SeriesTitleManager } from '../components/series/SeriesTitleManager';
import { SeriesInstanceManager } from '../components/series/SeriesInstanceManager';

import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { KpiCard } from '../components/ui/KpiCard';
import { MultiEntitySelector } from '../components/entities/MultiEntitySelector';
import { useEntity } from '../contexts/EntityContext';
import { cx, formatDateTimeAEST } from '../lib/utils';

// ============================================
// LAZY CLIENT INITIALIZATION
// ============================================
let _client: any = null;
const getClient = () => {
  if (!_client) {
    _client = generateClient();
  }
  return _client;
};

// ============================================
// CUSTOM SHALLOW QUERIES
// Avoid nested relationships that cause enum serialization errors
// ============================================

// Series Titles - simple query without problematic nested fields
const listTournamentSeriesTitlesShallow = /* GraphQL */ `
  query ListTournamentSeriesTitlesShallow(
    $filter: ModelTournamentSeriesTitleFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listTournamentSeriesTitles(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        title
        seriesCategory
        _version
        _deleted
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;

// Series Instances - avoid deep nested player data that contains enum fields
const listTournamentSeriesShallow = /* GraphQL */ `
  query ListTournamentSeriesShallow(
    $filter: ModelTournamentSeriesFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listTournamentSeries(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        name
        year
        quarter
        month
        startDate
        endDate
        status
        seriesCategory
        holidayType
        numberOfEvents
        tournamentSeriesTitleId
        venueId
        _version
        _deleted
        createdAt
        updatedAt
        title {
          id
          title
          seriesCategory
        }
        venue {
          id
          name
          entityId
        }
      }
      nextToken
    }
  }
`;

// Venues - simple query
const listVenuesSimple = /* GraphQL */ `
  query ListVenuesSimple(
    $filter: ModelVenueFilterInput
    $limit: Int
    $nextToken: String
  ) {
    listVenues(filter: $filter, limit: $limit, nextToken: $nextToken) {
      items {
        id
        name
        entityId
        _version
        _deleted
      }
      nextToken
    }
  }
`;

// ============================================
// COMPONENT
// ============================================

export const SeriesManagementPage = () => {
  const { selectedEntities, loading: entityLoading } = useEntity();

  // Data State
  const [seriesTitles, setSeriesTitles] = useState<APITypes.TournamentSeriesTitle[]>([]);
  const [seriesInstances, setSeriesInstances] = useState<APITypes.TournamentSeries[]>([]);
  const [venues, setVenues] = useState<APITypes.Venue[]>([]);
  
  // UI State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // ============================================
  // DATA FETCHING
  // ============================================

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const client = getClient();
      
      // Base filter to exclude soft-deleted items
      const baseFilter = {
        _deleted: { ne: true }
      };

      // ALWAYS fetch ALL series titles (they're global templates)
      const titlesData = await client.graphql({
        query: listTournamentSeriesTitlesShallow,
        variables: { filter: baseFilter, limit: 500 }
      });
      const titles = (titlesData.data?.listTournamentSeriesTitles?.items || [])
        .filter((t: any) => t && !t._deleted) as APITypes.TournamentSeriesTitle[];
      setSeriesTitles(titles);

      // Get entity IDs for filtering venues and instances
      const entityIds = selectedEntities.map(e => e.id);

      // If no entities selected, only show titles
      if (entityIds.length === 0) {
        setSeriesInstances([]);
        setVenues([]);
        setLoading(false);
        setLastUpdated(new Date());
        return;
      }

      // Build entity filter for venues
      const venueFilter = {
        ...baseFilter,
        or: entityIds.map(id => ({ entityId: { eq: id } }))
      };

      // Fetch venues using simple query (no nested games/players)
      const venuesData = await client.graphql({
        query: listVenuesSimple,
        variables: { filter: venueFilter, limit: 500 }
      });

      const venueItems = (venuesData.data?.listVenues?.items || [])
        .filter((v: any) => v && !v._deleted) as APITypes.Venue[];
      const venueIds = venueItems.map(v => v.id);
      setVenues(venueItems);

      // Build filter for series instances (by venue)
      if (venueIds.length > 0) {
        const seriesInstanceFilter = {
          ...baseFilter,
          or: venueIds.map(id => ({ venueId: { eq: id } }))
        };

        // Fetch series instances using SHALLOW query to avoid enum errors
        const instancesData = await client.graphql({
          query: listTournamentSeriesShallow,
          variables: { filter: seriesInstanceFilter, limit: 500 }
        });
        
        const instances = (instancesData.data?.listTournamentSeries?.items || [])
          .filter((i: any) => i && !i._deleted) as APITypes.TournamentSeries[];
        setSeriesInstances(instances);
      } else {
        setSeriesInstances([]);
      }

      setLastUpdated(new Date());
    } catch (err: any) {
      console.error("Error fetching series data:", err);
      setError(err?.message || 'Failed to load series data');
    } finally {
      setLoading(false);
    }
  };

  // Re-fetch when selected entities change
  useEffect(() => {
    fetchData();
  }, [selectedEntities]);

  // Listen to entity change events for immediate updates
  useEffect(() => {
    const handleEntityChange = () => {
      fetchData();
    };

    window.addEventListener('selectedEntitiesChanged', handleEntityChange);
    return () => {
      window.removeEventListener('selectedEntitiesChanged', handleEntityChange);
    };
  }, []);

  // ============================================
  // HANDLERS FOR SERIES TITLES
  // ============================================

  const handleSaveTitle = async (input: { 
    id?: string; 
    title: string; 
    seriesCategory?: APITypes.SeriesCategory | null; 
    _version?: number 
  }) => {
    const client = getClient();
    const mutation = input.id 
      ? mutations.updateTournamentSeriesTitle 
      : mutations.createTournamentSeriesTitle;

    const payload = input.id
      ? { id: input.id, title: input.title, seriesCategory: input.seriesCategory, _version: input._version }
      : { title: input.title, seriesCategory: input.seriesCategory };

    try {
      await client.graphql({ query: mutation, variables: { input: payload } });
      fetchData();
    } catch (error) {
      console.error('Error saving series title:', error);
      alert('Failed to save series title. See console for details.');
    }
  };

  const handleDeleteTitle = async (titleToDelete: APITypes.TournamentSeriesTitle) => {
    console.log('[SeriesManagementPage] handleDeleteTitle received:', titleToDelete);

    if (!titleToDelete?._version) {
      console.error('[SeriesManagementPage] Missing _version. Halting delete.');
      alert('Error: Cannot delete item because its version is missing. Please refresh the page.');
      return;
    }

    if (window.confirm("Are you sure? This action cannot be undone.")) {
      const deleteInput = {
        id: titleToDelete.id,
        _version: titleToDelete._version
      };

      try {
        await getClient().graphql({
          query: mutations.deleteTournamentSeriesTitle,
          variables: { input: deleteInput }
        });
        console.log('[SeriesManagementPage] Delete successful.');
        fetchData();
      } catch (error) {
        console.error('[SeriesManagementPage] Error deleting:', error);
        alert('Failed to delete series title. The data may have been modified. See console.');
      }
    }
  };

  // ============================================
  // HANDLERS FOR SERIES INSTANCES
  // ============================================

  const handleSaveInstance = async (formState: Partial<APITypes.TournamentSeries>) => {
    const client = getClient();
    
    try {
      if (formState.id && formState._version) {
        const updateInput: APITypes.UpdateTournamentSeriesInput = {
          id: formState.id,
          _version: formState._version,
          name: formState.name,
          year: formState.year,
          quarter: formState.quarter,
          month: formState.month,
          startDate: formState.startDate,
          endDate: formState.endDate,
          status: formState.status,
          seriesCategory: formState.seriesCategory,
          holidayType: formState.holidayType,
          tournamentSeriesTitleId: formState.tournamentSeriesTitleId,
          venueId: formState.venueId,
        };

        await client.graphql({
          query: mutations.updateTournamentSeries,
          variables: { input: updateInput }
        });
      } else {
        const createInput: APITypes.CreateTournamentSeriesInput = {
          name: formState.name!,
          year: formState.year!,
          quarter: formState.quarter,
          month: formState.month,
          status: formState.status!,
          seriesCategory: formState.seriesCategory!,
          holidayType: formState.holidayType,
          tournamentSeriesTitleId: formState.tournamentSeriesTitleId!,
          venueId: formState.venueId!,
          startDate: formState.startDate,
          endDate: formState.endDate,
        };

        await client.graphql({
          query: mutations.createTournamentSeries,
          variables: { input: createInput }
        });
      }

      fetchData();
    } catch (error) {
      console.error('Error saving series instance:', error);
      alert('Failed to save series instance. See console for details.');
    }
  };

  const handleDeleteInstance = async (instanceToDelete: APITypes.TournamentSeries) => {
    if (window.confirm("Are you sure you want to delete this series instance?")) {
      if (!instanceToDelete._version) {
        alert('Error: Cannot delete item because its version is missing. Please refresh the page.');
        return;
      }
      
      try {
        await getClient().graphql({
          query: mutations.deleteTournamentSeries,
          variables: {
            input: {
              id: instanceToDelete.id,
              _version: instanceToDelete._version
            }
          }
        });
        fetchData();
      } catch (error) {
        console.error('Error deleting series instance:', error);
        alert('Failed to delete series instance. See console for details.');
      }
    }
  };

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const activeInstances = seriesInstances.filter(
    i => i.status === APITypes.SeriesStatus.LIVE || i.status === APITypes.SeriesStatus.SCHEDULED
  );

  // ============================================
  // LOADING STATE
  // ============================================

  if (entityLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
      </div>
    );
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <>
      {/* ============ PAGE HEADER ============ */}
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50 sm:text-2xl">
          Series Management
        </h1>

        {/* Icon-only refresh button with timestamp */}
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              AEST: {formatDateTimeAEST(lastUpdated)}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchData}
            disabled={loading}
            className="h-8 w-8 p-0"
            aria-label="Refresh data"
            title={lastUpdated ? `Last updated: ${formatDateTimeAEST(lastUpdated)}` : "Refresh"}
          >
            <ArrowPathIcon className={cx("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* ============ FILTERS ============ */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="w-full sm:flex-1 sm:max-w-xs">
          <MultiEntitySelector />
        </div>
      </div>

      {/* ============ ERROR STATE ============ */}
      {error && (
        <div className="mt-4">
          <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </Card>
        </div>
      )}

      {/* ============ NO ENTITY SELECTED ============ */}
      {selectedEntities.length === 0 ? (
        <div className="mt-8 py-20 text-center">
          <FolderIcon className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-700" />
          <p className="mt-4 text-gray-500 dark:text-gray-400">
            Select an entity to view series instances
          </p>
          <p className="mt-2 text-sm text-gray-400 dark:text-gray-500">
            Series titles are shown below (they apply to all entities)
          </p>
        </div>
      ) : null}

      {/* ============ MAIN CONTENT ============ */}
      {loading ? (
        <div className="mt-8 flex items-center justify-center py-16">
          <div className="text-center">
            <div className="h-8 w-8 mx-auto animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">
              Loading series data…
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ============ KPI CARDS ============ */}
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4">
            <KpiCard
              title="Series Titles"
              value={seriesTitles.length}
              icon={<FolderIcon className="h-5 w-5" />}
            />
            <KpiCard
              title="Series Instances"
              value={seriesInstances.length}
              icon={<CalendarDaysIcon className="h-5 w-5" />}
            />
            <KpiCard
              title="Active/Scheduled"
              value={activeInstances.length}
              icon={<CalendarDaysIcon className="h-5 w-5" />}
            />
            <KpiCard
              title="Venues"
              value={venues.length}
              icon={<FolderIcon className="h-5 w-5" />}
            />
          </div>

          {/* ============ TWO-COLUMN LAYOUT ============ */}
          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Series Titles - 1/3 width on large screens */}
            <div className="lg:col-span-1">
              <Card>
                <SeriesTitleManager
                  titles={seriesTitles}
                  onSave={handleSaveTitle}
                  onDelete={handleDeleteTitle}
                />
              </Card>
            </div>

            {/* Series Instances - 2/3 width on large screens */}
            <div className="lg:col-span-2">
              <Card>
                {selectedEntities.length === 0 ? (
                  <div className="py-12 text-center">
                    <FolderIcon className="mx-auto h-10 w-10 text-gray-300 dark:text-gray-700" />
                    <p className="mt-3 text-sm text-gray-500 dark:text-gray-400">
                      Select an entity above to manage series instances
                    </p>
                  </div>
                ) : (
                  <SeriesInstanceManager
                    seriesInstances={seriesInstances}
                    seriesTitles={seriesTitles}
                    venues={venues}
                    onSave={handleSaveInstance}
                    onDelete={handleDeleteInstance}
                  />
                )}
              </Card>
            </div>
          </div>
        </>
      )}
    </>
  );
};

export default SeriesManagementPage;