// src/hooks/useUserPermissions.ts
// ============================================
// USER PERMISSIONS HOOK
// ============================================
//
// This hook provides permission checks for UI components.
// It wraps the core hasPageAccess() logic with React hooks
// and memoization for optimal performance.
//
// Use this hook in components that need to:
// - Check if user can access a specific path
// - Get list of accessible pages (for navigation)
// - Check user's role
// ============================================

import { useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  hasPageAccess,
  getAccessiblePages,
  getFirstAccessiblePage,
  hasAnyPageAccess,
  pathMatchesPage,
  ALL_PAGES,
  type PageConfig,
  type UserRole,
  type PageCategory,
} from '../config/pagePermissions';

export interface UserPermissions {
  /** Check if user can access a specific path */
  canAccess: (path: string) => boolean;
  
  /** All pages the user can access */
  accessiblePages: PageConfig[];
  
  /** Accessible pages grouped by category */
  accessiblePagesByCategory: Record<PageCategory, PageConfig[]>;
  
  /** Check if user has specific role(s) */
  hasRole: (roles: UserRole | UserRole[]) => boolean;
  
  /** Shortcut for SUPER_ADMIN check */
  isSuperAdmin: boolean;
  
  /** Shortcut for ADMIN or SUPER_ADMIN check */
  isAdmin: boolean;
  
  /** User's current role */
  userRole: UserRole | null;
  
  /** User's custom page permissions (null = using role defaults) */
  customAllowedPages: string[] | null;
  
  /** Whether user has any page access at all */
  hasAnyAccess: boolean;
  
  /** The first page user can access (for redirects) */
  firstAccessiblePage: PageConfig | null;
}

/**
 * Hook for checking user permissions in UI components.
 * 
 * @example
 * ```tsx
 * const { canAccess, accessiblePages, isSuperAdmin } = useUserPermissions();
 * 
 * // Check specific page access
 * if (canAccess('/settings/user-management')) {
 *   // Show admin link
 * }
 * 
 * // Filter navigation items
 * const visibleNavItems = navItems.filter(item => canAccess(item.href));
 * ```
 */
export const useUserPermissions = (): UserPermissions => {
  const { user } = useAuth();

  // Extract permission-relevant data from user
  const userRole = (user?.role as UserRole) ?? null;
  const customAllowedPages = user?.allowedPages ?? null;

  // Role checks
  const isSuperAdmin = userRole === 'SUPER_ADMIN';
  const isAdmin = userRole === 'SUPER_ADMIN' || userRole === 'ADMIN';

  /**
   * Check if user can access a specific path
   */
  const canAccess = useCallback(
    (path: string): boolean => {
      if (!userRole) return false;
      return hasPageAccess(path, userRole, customAllowedPages);
    },
    [userRole, customAllowedPages]
  );

  /**
   * Get all accessible pages (memoized)
   */
  const accessiblePages = useMemo((): PageConfig[] => {
    if (!userRole) return [];
    return getAccessiblePages(userRole, customAllowedPages);
  }, [userRole, customAllowedPages]);

  /**
   * Get accessible pages grouped by category (memoized)
   */
  const accessiblePagesByCategory = useMemo(() => {
    const grouped: Record<PageCategory, PageConfig[]> = {
      core: [],
      players: [],
      games: [],
      series: [],
      venues: [],
      social: [],
      settings: [],
      scraper: [],
      debug: [],
    };

    accessiblePages.forEach((page) => {
      grouped[page.category].push(page);
    });

    return grouped;
  }, [accessiblePages]);

  /**
   * Check if user has specific role(s)
   */
  const hasRole = useCallback(
    (roles: UserRole | UserRole[]): boolean => {
      if (!userRole) return false;
      const roleArray = Array.isArray(roles) ? roles : [roles];
      return roleArray.includes(userRole);
    },
    [userRole]
  );

  /**
   * Check if user has any page access
   */
  const hasAnyAccess = useMemo((): boolean => {
    if (!userRole) return false;
    return hasAnyPageAccess(userRole, customAllowedPages);
  }, [userRole, customAllowedPages]);

  /**
   * Get first accessible page for redirects
   */
  const firstAccessiblePage = useMemo((): PageConfig | null => {
    if (!userRole) return null;
    return getFirstAccessiblePage(userRole, customAllowedPages);
  }, [userRole, customAllowedPages]);

  return {
    canAccess,
    accessiblePages,
    accessiblePagesByCategory,
    hasRole,
    isSuperAdmin,
    isAdmin,
    userRole,
    customAllowedPages,
    hasAnyAccess,
    firstAccessiblePage,
  };
};

export default useUserPermissions;

// Re-export types for convenience
export type { PageConfig, UserRole, PageCategory };
export { ALL_PAGES, pathMatchesPage };