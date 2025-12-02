// src/hooks/useActivityLogger.ts
import { generateClient } from 'aws-amplify/api';
// Remove standard import to avoid fetching relationships
// import { createUserAuditLog } from '../graphql/mutations';
import { useAuth } from '../contexts/AuthContext';
import { useCallback, useMemo } from 'react';

// --- CUSTOM MUTATION (To avoid fetching corrupted relationships on return) ---
const customCreateAuditLog = /* GraphQL */ `
  mutation CreateUserAuditLog(
    $input: CreateUserAuditLogInput!
    $condition: ModelUserAuditLogConditionInput
  ) {
    createUserAuditLog(input: $input, condition: $condition) {
      id
      action
      resource
      createdAt
      # Intentionally NOT fetching 'user' relationship here
    }
  }
`;
// -----------------------------------------------------------------------------

export const ActivityActions = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  VIEW_PAGE: 'VIEW_PAGE',
  GAME_VIEW: 'GAME_VIEW',
  GAME_CREATE: 'GAME_CREATE',
  GAME_UPDATE: 'GAME_UPDATE',
  GAME_DELETE: 'GAME_DELETE',
  GAME_EXPORT: 'GAME_EXPORT',
  PLAYER_VIEW: 'PLAYER_VIEW',
  PLAYER_CREATE: 'PLAYER_CREATE',
  PLAYER_UPDATE: 'PLAYER_UPDATE',
  PLAYER_DELETE: 'PLAYER_DELETE',
  PLAYER_SEARCH: 'PLAYER_SEARCH',
  PLAYER_EXPORT: 'PLAYER_EXPORT',
  VENUE_VIEW: 'VENUE_VIEW',
  VENUE_CREATE: 'VENUE_CREATE',
  VENUE_UPDATE: 'VENUE_UPDATE',
  VENUE_ASSIGN: 'VENUE_ASSIGN',
  SERIES_VIEW: 'SERIES_VIEW',
  SERIES_CREATE: 'SERIES_CREATE',
  SERIES_UPDATE: 'SERIES_UPDATE',
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_DEACTIVATE: 'USER_DEACTIVATE',
  USER_REACTIVATE: 'USER_REACTIVATE',
  USER_PASSWORD_RESET: 'USER_PASSWORD_RESET',
  SCRAPER_START: 'SCRAPER_START',
  SCRAPER_STOP: 'SCRAPER_STOP',
  SCRAPER_CONFIG_CHANGE: 'SCRAPER_CONFIG_CHANGE',
  SOCIAL_SYNC: 'SOCIAL_SYNC',
  SOCIAL_POST_CREATE: 'SOCIAL_POST_CREATE',
  EXPORT_DATA: 'EXPORT_DATA',
  REPORT_GENERATE: 'REPORT_GENERATE',
  SETTINGS_UPDATE: 'SETTINGS_UPDATE',
  PREFERENCE_UPDATE: 'PREFERENCE_UPDATE',
} as const;

export type ActivityAction = typeof ActivityActions[keyof typeof ActivityActions];

interface LogActivityOptions {
  silent?: boolean;
  metadata?: Record<string, unknown>;
  overrideUserId?: string; // ALLOW OVERRIDE
}

export const useActivityLogger = () => {
  const client = useMemo(() => generateClient(), []);
  const { user } = useAuth();

  const logActivity = useCallback(async (
    action: ActivityAction | string,
    resource?: string,
    details?: Record<string, unknown>,
    options: LogActivityOptions = { silent: true }
  ) => {
    // Determine effective User ID
    const activeUserId = options.overrideUserId || user?.id;

    if (!activeUserId) {
      if (!options.silent) console.debug('[ActivityLogger] No user, skipping log');
      return false;
    }

    try {
      const logEntry = {
        userId: activeUserId,
        action,
        resource: resource || null,
        details: details ? JSON.stringify({
          ...details,
          ...options.metadata,
          timestamp: new Date().toISOString(),
        }) : null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      };

      // USE CUSTOM MUTATION
      await client.graphql({
        query: customCreateAuditLog,
        variables: { input: logEntry },
        authMode: 'userPool' // Ensure we use correct auth mode
      });

      return true;

    } catch (error) {
      console.error('[ActivityLogger] Failed to log activity:', error);
      if (!options.silent) {
        throw error;
      }
      return false;
    }
  }, [client, user?.id]);

  // Convenience methods
  const logAuth = useCallback((
    event: 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED' | 'SESSION_EXPIRED',
    details?: Record<string, unknown>,
    userId?: string // Pass UserID here for Login events
  ) => {
    return logActivity(
        ActivityActions[event], 
        '/auth', 
        details, 
        { silent: true, overrideUserId: userId }
    );
  }, [logActivity]);

  const logPageView = useCallback((path: string) => {
    return logActivity(ActivityActions.VIEW_PAGE, path);
  }, [logActivity]);

  const logGameAction = useCallback((
    action: 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE' | 'EXPORT',
    gameId: string,
    details?: Record<string, unknown>
  ) => {
    const actionKey = `GAME_${action}` as keyof typeof ActivityActions;
    return logActivity(ActivityActions[actionKey], `/games/${gameId}`, { gameId, ...details });
  }, [logActivity]);

  const logPlayerAction = useCallback((
    action: 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE' | 'SEARCH' | 'EXPORT',
    playerId?: string,
    details?: Record<string, unknown>
  ) => {
    const actionKey = `PLAYER_${action}` as keyof typeof ActivityActions;
    return logActivity(ActivityActions[actionKey], playerId ? `/players/${playerId}` : '/players', { playerId, ...details });
  }, [logActivity]);

  const logVenueAction = useCallback((
    action: 'VIEW' | 'CREATE' | 'UPDATE' | 'ASSIGN',
    venueId: string,
    details?: Record<string, unknown>
  ) => {
    const actionKey = `VENUE_${action}` as keyof typeof ActivityActions;
    return logActivity(ActivityActions[actionKey], `/venues/${venueId}`, { venueId, ...details });
  }, [logActivity]);

  const logSeriesAction = useCallback((
    action: 'VIEW' | 'CREATE' | 'UPDATE',
    seriesId: string,
    details?: Record<string, unknown>
  ) => {
    const actionKey = `SERIES_${action}` as keyof typeof ActivityActions;
    return logActivity(ActivityActions[actionKey], `/series/${seriesId}`, { seriesId, ...details });
  }, [logActivity]);

  const logAdminAction = useCallback((
    action: 'USER_CREATE' | 'USER_UPDATE' | 'USER_DEACTIVATE' | 'USER_REACTIVATE' | 'USER_PASSWORD_RESET',
    targetUserId: string,
    details?: Record<string, unknown>
  ) => {
    return logActivity(ActivityActions[action], `/admin/users/${targetUserId}`, { targetUserId, ...details });
  }, [logActivity]);

  const logScraperAction = useCallback((
    action: 'START' | 'STOP' | 'CONFIG_CHANGE',
    entityId?: string,
    details?: Record<string, unknown>
  ) => {
    const actionKey = `SCRAPER_${action}` as keyof typeof ActivityActions;
    return logActivity(ActivityActions[actionKey], entityId ? `/scraper/${entityId}` : '/scraper', { entityId, ...details });
  }, [logActivity]);

  const logExport = useCallback((
    exportType: string,
    details?: Record<string, unknown>
  ) => {
    return logActivity(ActivityActions.EXPORT_DATA, `/export/${exportType}`, { exportType, ...details });
  }, [logActivity]);

  const logSettingsChange = useCallback((
    settingArea: string,
    details?: Record<string, unknown>
  ) => {
    return logActivity(ActivityActions.SETTINGS_UPDATE, `/settings/${settingArea}`, details);
  }, [logActivity]);

  return {
    logActivity,
    logAuth,
    logPageView,
    logGameAction,
    logPlayerAction,
    logVenueAction,
    logSeriesAction,
    logAdminAction,
    logScraperAction,
    logExport,
    logSettingsChange,
    ActivityActions,
  };
};

export const createStandaloneLogger = (userId: string) => {
  const client = generateClient();
  return async (
    action: ActivityAction | string,
    resource?: string,
    details?: Record<string, unknown>
  ) => {
    if (!userId) return false;
    try {
      await client.graphql({
        query: customCreateAuditLog,
        variables: {
          input: {
            userId,
            action,
            resource: resource || null,
            details: details ? JSON.stringify({ ...details, timestamp: new Date().toISOString() }) : null,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          }
        },
        authMode: 'userPool'
      });
      return true;
    } catch (error) {
      console.error('[StandaloneLogger] Failed:', error);
      return false;
    }
  };
};