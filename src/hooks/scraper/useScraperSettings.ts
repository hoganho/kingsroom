// src/hooks/useScraperSettings.ts
// VERSION: 1.0.0 - Global scraper settings hook
//
// Manages the global auto-refresh toggle that controls:
// - Whether the EventBridge Lambda actually scrapes (it checks this setting)
// - Whether the HomePage auto-refreshes
//
// Usage:
//   const { settings, loading, updateAutoRefresh } = useScraperSettings();
//   if (settings?.autoRefreshEnabled) { ... }

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api-graphql';

// ============================================
// GRAPHQL OPERATIONS
// ============================================

const getScraperSettings = /* GraphQL */ `
  query GetScraperSettings($id: ID!) {
    getScraperSettings(id: $id) {
      id
      autoRefreshEnabled
      lastToggledAt
      lastToggledBy
      disabledReason
      scheduleTime
      maxGamesPerJob
      consecutiveBlankThreshold
      runningRefreshIntervalMinutes
      startingSoonRefreshIntervalMinutes
      upcomingRefreshIntervalMinutes
      createdAt
      updatedAt
    }
  }
`;

const listScraperSettings = /* GraphQL */ `
  query ListScraperSettings($limit: Int) {
    listScraperSettings(limit: $limit) {
      items {
        id
        autoRefreshEnabled
        lastToggledAt
        lastToggledBy
        disabledReason
        scheduleTime
        maxGamesPerJob
        consecutiveBlankThreshold
        runningRefreshIntervalMinutes
        startingSoonRefreshIntervalMinutes
        upcomingRefreshIntervalMinutes
        createdAt
        updatedAt
      }
    }
  }
`;

const createScraperSettings = /* GraphQL */ `
  mutation CreateScraperSettings($input: CreateScraperSettingsInput!) {
    createScraperSettings(input: $input) {
      id
      autoRefreshEnabled
      lastToggledAt
      lastToggledBy
      disabledReason
      scheduleTime
      maxGamesPerJob
      consecutiveBlankThreshold
      runningRefreshIntervalMinutes
      startingSoonRefreshIntervalMinutes
      upcomingRefreshIntervalMinutes
    }
  }
`;

const updateScraperSettings = /* GraphQL */ `
  mutation UpdateScraperSettings($input: UpdateScraperSettingsInput!) {
    updateScraperSettings(input: $input) {
      id
      autoRefreshEnabled
      lastToggledAt
      lastToggledBy
      disabledReason
      scheduleTime
      maxGamesPerJob
      consecutiveBlankThreshold
      runningRefreshIntervalMinutes
      startingSoonRefreshIntervalMinutes
      upcomingRefreshIntervalMinutes
    }
  }
`;

// ============================================
// TYPES
// ============================================

export interface ScraperSettings {
  id: string;
  autoRefreshEnabled: boolean;
  lastToggledAt?: string | null;
  lastToggledBy?: string | null;
  disabledReason?: string | null;
  scheduleTime?: string | null;
  maxGamesPerJob?: number | null;
  consecutiveBlankThreshold?: number | null;
  runningRefreshIntervalMinutes?: number | null;
  startingSoonRefreshIntervalMinutes?: number | null;
  upcomingRefreshIntervalMinutes?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

interface GetScraperSettingsData {
  getScraperSettings: ScraperSettings | null;
}

interface ListScraperSettingsData {
  listScraperSettings: {
    items: ScraperSettings[];
  };
}

interface MutationData {
  createScraperSettings?: ScraperSettings;
  updateScraperSettings?: ScraperSettings;
}

// ============================================
// CONSTANTS
// ============================================

// Use a fixed ID for the global settings record
// This ensures we always have exactly one settings record
const GLOBAL_SETTINGS_ID = 'GLOBAL_SCRAPER_SETTINGS';

// Default settings when creating new record
const DEFAULT_SETTINGS: Omit<ScraperSettings, 'id' | 'createdAt' | 'updatedAt'> = {
  autoRefreshEnabled: true,
  lastToggledAt: null,
  lastToggledBy: null,
  disabledReason: null,
  scheduleTime: '06:00',
  maxGamesPerJob: 50,
  consecutiveBlankThreshold: 10,
  runningRefreshIntervalMinutes: 30,
  startingSoonRefreshIntervalMinutes: 60,
  upcomingRefreshIntervalMinutes: 720,
};

// Polling interval for settings changes (5 minutes)
const SETTINGS_POLL_INTERVAL = 5 * 60 * 1000;

// ============================================
// HOOK
// ============================================

export interface UseScraperSettingsReturn {
  settings: ScraperSettings | null;
  loading: boolean;
  error: string | null;
  updating: boolean;
  
  // Actions
  refreshSettings: () => Promise<void>;
  updateAutoRefresh: (enabled: boolean, reason?: string) => Promise<boolean>;
  updateSettings: (updates: Partial<ScraperSettings>) => Promise<boolean>;
  
  // Computed values for convenience
  isAutoRefreshEnabled: boolean;
  refreshIntervals: {
    running: number;
    startingSoon: number;
    upcoming: number;
  };
}

export function useScraperSettings(): UseScraperSettingsReturn {
  const [settings, setSettings] = useState<ScraperSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  
  const client = useRef(generateClient()).current;
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ============================================
  // FETCH SETTINGS
  // ============================================
  
  const fetchSettings = useCallback(async (): Promise<ScraperSettings | null> => {
    try {
      // First try to get by the known ID
      const result = await client.graphql({
        query: getScraperSettings,
        variables: { id: GLOBAL_SETTINGS_ID }
      }) as GraphQLResult<GetScraperSettingsData>;

      if (result.data?.getScraperSettings) {
        return result.data.getScraperSettings;
      }

      // If not found, try listing (in case ID was different)
      const listResult = await client.graphql({
        query: listScraperSettings,
        variables: { limit: 1 }
      }) as GraphQLResult<ListScraperSettingsData>;

      if (listResult.data?.listScraperSettings?.items?.length > 0) {
        return listResult.data.listScraperSettings.items[0];
      }

      // No settings exist yet - create default
      console.log('[useScraperSettings] No settings found, creating defaults');
      const createResult = await client.graphql({
        query: createScraperSettings,
        variables: {
          input: {
            id: GLOBAL_SETTINGS_ID,
            ...DEFAULT_SETTINGS,
            lastToggledAt: new Date().toISOString(),
          }
        }
      }) as GraphQLResult<MutationData>;

      return createResult.data?.createScraperSettings || null;

    } catch (err) {
      console.error('[useScraperSettings] Error fetching settings:', err);
      throw err;
    }
  }, [client]);

  const refreshSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const fetchedSettings = await fetchSettings();
      setSettings(fetchedSettings);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load scraper settings';
      setError(errorMessage);
      console.error('[useScraperSettings] Error:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchSettings]);

  // ============================================
  // UPDATE SETTINGS
  // ============================================

  const updateSettings = useCallback(async (updates: Partial<ScraperSettings>): Promise<boolean> => {
    if (!settings?.id) {
      setError('No settings record to update');
      return false;
    }

    setUpdating(true);
    setError(null);

    try {
      const result = await client.graphql({
        query: updateScraperSettings,
        variables: {
          input: {
            id: settings.id,
            ...updates,
          }
        }
      }) as GraphQLResult<MutationData>;

      if (result.data?.updateScraperSettings) {
        setSettings(result.data.updateScraperSettings);
        return true;
      }

      setError('Failed to update settings');
      return false;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update settings';
      setError(errorMessage);
      console.error('[useScraperSettings] Update error:', err);
      return false;
    } finally {
      setUpdating(false);
    }
  }, [client, settings?.id]);

  const updateAutoRefresh = useCallback(async (
    enabled: boolean, 
    reason?: string
  ): Promise<boolean> => {
    const updates: Partial<ScraperSettings> = {
      autoRefreshEnabled: enabled,
      lastToggledAt: new Date().toISOString(),
      // Note: lastToggledBy should ideally come from auth context
      disabledReason: enabled ? null : (reason || null),
    };

    return updateSettings(updates);
  }, [updateSettings]);

  // ============================================
  // LIFECYCLE
  // ============================================

  // Initial fetch
  useEffect(() => {
    refreshSettings();
  }, [refreshSettings]);

  // Setup polling for settings changes (other admins might toggle)
  useEffect(() => {
    pollIntervalRef.current = setInterval(() => {
      // Silent refresh - don't show loading state
      fetchSettings()
        .then(setSettings)
        .catch(console.error);
    }, SETTINGS_POLL_INTERVAL);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [fetchSettings]);

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const isAutoRefreshEnabled = settings?.autoRefreshEnabled ?? true;

  const refreshIntervals = useMemo(() => ({
    running: settings?.runningRefreshIntervalMinutes ?? 30,
    startingSoon: settings?.startingSoonRefreshIntervalMinutes ?? 60,
    upcoming: settings?.upcomingRefreshIntervalMinutes ?? 720,
  }), [
    settings?.runningRefreshIntervalMinutes,
    settings?.startingSoonRefreshIntervalMinutes,
    settings?.upcomingRefreshIntervalMinutes,
  ]);

  return {
    settings,
    loading,
    error,
    updating,
    refreshSettings,
    updateAutoRefresh,
    updateSettings,
    isAutoRefreshEnabled,
    refreshIntervals,
  };
}

export default useScraperSettings;