// src/hooks/useActivityLogger.ts
import { generateClient } from 'aws-amplify/api';
import { createUserAuditLog } from '../graphql/mutations';
import { useAuth } from '../contexts/AuthContext';
import { useCallback, useMemo } from 'react';

// Standard action types for consistency
export const ActivityActions = {
  // Authentication
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  LOGIN_FAILED: 'LOGIN_FAILED',
  PASSWORD_CHANGED: 'PASSWORD_CHANGED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  
  // Navigation
  VIEW_PAGE: 'VIEW_PAGE',
  
  // Data Operations - Games
  GAME_VIEW: 'GAME_VIEW',
  GAME_CREATE: 'GAME_CREATE',
  GAME_UPDATE: 'GAME_UPDATE',
  GAME_DELETE: 'GAME_DELETE',
  GAME_EXPORT: 'GAME_EXPORT',
  
  // Data Operations - Players
  PLAYER_VIEW: 'PLAYER_VIEW',
  PLAYER_CREATE: 'PLAYER_CREATE',
  PLAYER_UPDATE: 'PLAYER_UPDATE',
  PLAYER_DELETE: 'PLAYER_DELETE',
  PLAYER_SEARCH: 'PLAYER_SEARCH',
  PLAYER_EXPORT: 'PLAYER_EXPORT',
  
  // Data Operations - Venues
  VENUE_VIEW: 'VENUE_VIEW',
  VENUE_CREATE: 'VENUE_CREATE',
  VENUE_UPDATE: 'VENUE_UPDATE',
  VENUE_ASSIGN: 'VENUE_ASSIGN',
  
  // Data Operations - Series
  SERIES_VIEW: 'SERIES_VIEW',
  SERIES_CREATE: 'SERIES_CREATE',
  SERIES_UPDATE: 'SERIES_UPDATE',
  
  // Admin Operations
  USER_CREATE: 'USER_CREATE',
  USER_UPDATE: 'USER_UPDATE',
  USER_DEACTIVATE: 'USER_DEACTIVATE',
  USER_REACTIVATE: 'USER_REACTIVATE',
  USER_PASSWORD_RESET: 'USER_PASSWORD_RESET',
  
  // Scraper Operations
  SCRAPER_START: 'SCRAPER_START',
  SCRAPER_STOP: 'SCRAPER_STOP',
  SCRAPER_CONFIG_CHANGE: 'SCRAPER_CONFIG_CHANGE',
  
  // Social Operations
  SOCIAL_SYNC: 'SOCIAL_SYNC',
  SOCIAL_POST_CREATE: 'SOCIAL_POST_CREATE',
  
  // Exports & Reports
  EXPORT_DATA: 'EXPORT_DATA',
  REPORT_GENERATE: 'REPORT_GENERATE',
  
  // Settings
  SETTINGS_UPDATE: 'SETTINGS_UPDATE',
  PREFERENCE_UPDATE: 'PREFERENCE_UPDATE',
} as const;

export type ActivityAction = typeof ActivityActions[keyof typeof ActivityActions];

interface LogActivityOptions {
  /** Don't throw errors, just log to console */
  silent?: boolean;
  /** Additional metadata to include */
  metadata?: Record<string, unknown>;
}

export const useActivityLogger = () => {
  const client = useMemo(() => generateClient(), []);
  const { user } = useAuth();

  /**
   * Core logging function
   */
  const logActivity = useCallback(async (
    action: ActivityAction | string,
    resource?: string,
    details?: Record<string, unknown>,
    options: LogActivityOptions = { silent: true }
  ) => {
    if (!user?.id) {
      console.debug('[ActivityLogger] No user, skipping log');
      return false;
    }

    try {
      const logEntry = {
        userId: user.id,
        action,
        resource: resource || null,
        details: details ? JSON.stringify({
          ...details,
          ...options.metadata,
          timestamp: new Date().toISOString(),
        }) : null,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
      };

      await client.graphql({
        query: createUserAuditLog,
        variables: { input: logEntry }
      });

      console.debug(`[ActivityLogger] ${action} - ${resource || 'N/A'}`);
      return true;

    } catch (error) {
      console.error('[ActivityLogger] Failed to log activity:', error);
      if (!options.silent) {
        throw error;
      }
      return false;
    }
  }, [client, user?.id]);

  // ============================================
  // CONVENIENCE METHODS
  // ============================================

  /**
   * Log authentication events
   */
  const logAuth = useCallback((
    event: 'LOGIN' | 'LOGOUT' | 'LOGIN_FAILED' | 'SESSION_EXPIRED',
    details?: Record<string, unknown>
  ) => {
    return logActivity(ActivityActions[event], '/auth', details);
  }, [logActivity]);

  /**
   * Log page view
   */
  const logPageView = useCallback((path: string) => {
    return logActivity(ActivityActions.VIEW_PAGE, path);
  }, [logActivity]);

  /**
   * Log game-related actions
   */
  const logGameAction = useCallback((
    action: 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE' | 'EXPORT',
    gameId: string,
    details?: Record<string, unknown>
  ) => {
    const actionKey = `GAME_${action}` as keyof typeof ActivityActions;
    return logActivity(
      ActivityActions[actionKey],
      `/games/${gameId}`,
      { gameId, ...details }
    );
  }, [logActivity]);

  /**
   * Log player-related actions
   */
  const logPlayerAction = useCallback((
    action: 'VIEW' | 'CREATE' | 'UPDATE' | 'DELETE' | 'SEARCH' | 'EXPORT',
    playerId?: string,
    details?: Record<string, unknown>
  ) => {
    const actionKey = `PLAYER_${action}` as keyof typeof ActivityActions;
    return logActivity(
      ActivityActions[actionKey],
      playerId ? `/players/${playerId}` : '/players',
      { playerId, ...details }
    );
  }, [logActivity]);

  /**
   * Log venue-related actions
   */
  const logVenueAction = useCallback((
    action: 'VIEW' | 'CREATE' | 'UPDATE' | 'ASSIGN',
    venueId: string,
    details?: Record<string, unknown>
  ) => {
    const actionKey = `VENUE_${action}` as keyof typeof ActivityActions;
    return logActivity(
      ActivityActions[actionKey],
      `/venues/${venueId}`,
      { venueId, ...details }
    );
  }, [logActivity]);

  /**
   * Log series-related actions
   */
  const logSeriesAction = useCallback((
    action: 'VIEW' | 'CREATE' | 'UPDATE',
    seriesId: string,
    details?: Record<string, unknown>
  ) => {
    const actionKey = `SERIES_${action}` as keyof typeof ActivityActions;
    return logActivity(
      ActivityActions[actionKey],
      `/series/${seriesId}`,
      { seriesId, ...details }
    );
  }, [logActivity]);

  /**
   * Log admin/user management actions
   */
  const logAdminAction = useCallback((
    action: 'USER_CREATE' | 'USER_UPDATE' | 'USER_DEACTIVATE' | 'USER_REACTIVATE' | 'USER_PASSWORD_RESET',
    targetUserId: string,
    details?: Record<string, unknown>
  ) => {
    return logActivity(
      ActivityActions[action],
      `/admin/users/${targetUserId}`,
      { targetUserId, ...details }
    );
  }, [logActivity]);

  /**
   * Log scraper operations
   */
  const logScraperAction = useCallback((
    action: 'START' | 'STOP' | 'CONFIG_CHANGE',
    entityId?: string,
    details?: Record<string, unknown>
  ) => {
    const actionKey = `SCRAPER_${action}` as keyof typeof ActivityActions;
    return logActivity(
      ActivityActions[actionKey],
      entityId ? `/scraper/${entityId}` : '/scraper',
      { entityId, ...details }
    );
  }, [logActivity]);

  /**
   * Log data exports
   */
  const logExport = useCallback((
    exportType: string,
    details?: Record<string, unknown>
  ) => {
    return logActivity(
      ActivityActions.EXPORT_DATA,
      `/export/${exportType}`,
      { exportType, ...details }
    );
  }, [logActivity]);

  /**
   * Log settings changes
   */
  const logSettingsChange = useCallback((
    settingArea: string,
    details?: Record<string, unknown>
  ) => {
    return logActivity(
      ActivityActions.SETTINGS_UPDATE,
      `/settings/${settingArea}`,
      details
    );
  }, [logActivity]);

  return {
    // Core function
    logActivity,
    
    // Convenience methods
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
    
    // Action constants for external use
    ActivityActions,
  };
};

// ============================================
// STANDALONE LOGGER (for use outside React components)
// ============================================
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
        query: createUserAuditLog,
        variables: {
          input: {
            userId,
            action,
            resource: resource || null,
            details: details ? JSON.stringify({
              ...details,
              timestamp: new Date().toISOString(),
            }) : null,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
          }
        }
      });
      return true;
    } catch (error) {
      console.error('[StandaloneLogger] Failed:', error);
      return false;
    }
  };
};