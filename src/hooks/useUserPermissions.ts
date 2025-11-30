// src/hooks/useUserPermissions.ts
import { useMemo, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { 
  hasPageAccess, 
  ALL_PAGES, 
  DEFAULT_ROLE_PERMISSIONS,
  PageConfig,
  UserRole,
  PageCategory,
  pathMatchesPage
} from '../config/pagePermissions';

export interface UserPermissions {
  // Check if user can access a specific path
  canAccess: (path: string) => boolean;
  
  // Get all pages user can access
  accessiblePages: PageConfig[];
  
  // Get accessible pages grouped by category
  accessiblePagesByCategory: Record<PageCategory, PageConfig[]>;
  
  // Check if user has a specific role
  hasRole: (roles: UserRole | UserRole[]) => boolean;
  
  // Check if user is super admin
  isSuperAdmin: boolean;
  
  // User's current role
  userRole: UserRole | null;
  
  // User's custom allowed pages (if any)
  customAllowedPages: string[] | null;
}

export const useUserPermissions = (): UserPermissions => {
  const { userRole: authRole } = useAuth();
  
  // Cognito groups now match GraphQL UserRole enum values (SUPER_ADMIN, ADMIN, etc.)
  // Just cast to UserRole if valid
  const userRole: UserRole | null = authRole as UserRole | null;
  
  const isSuperAdmin = userRole === 'SUPER_ADMIN';
  
  // Check if user can access a specific path
  // TODO: Pass customAllowedPages when we have access to currentUser from AuthContext
  const canAccess = useCallback((path: string): boolean => {
    if (!userRole) return false;
    return hasPageAccess(path, userRole, null);
  }, [userRole]);
  
  // Get all accessible pages
  const accessiblePages = useMemo((): PageConfig[] => {
    if (!userRole) return [];
    
    // Super admin gets all pages
    if (isSuperAdmin) return ALL_PAGES;
    
    // TODO: If user has custom permissions from DB, use those
    // This would require exposing currentUser from AuthContext
    // For now, fall back to default role permissions
    const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[userRole] || [];
    return ALL_PAGES.filter(page => 
      page.alwaysAllowed || 
      defaultPermissions.some((allowed: string) => pathMatchesPage(page.path, allowed))
    );
  }, [userRole, isSuperAdmin]);
  
  // Get accessible pages grouped by category
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
    
    accessiblePages.forEach(page => {
      if (!grouped[page.category]) {
        grouped[page.category] = [];
      }
      grouped[page.category].push(page);
    });
    
    return grouped;
  }, [accessiblePages]);
  
  // Check if user has specific role(s)
  const hasRole = useCallback((roles: UserRole | UserRole[]): boolean => {
    if (!userRole) return false;
    const roleArray = Array.isArray(roles) ? roles : [roles];
    return roleArray.includes(userRole);
  }, [userRole]);
  
  return {
    canAccess,
    accessiblePages,
    accessiblePagesByCategory,
    hasRole,
    isSuperAdmin,
    userRole,
    customAllowedPages: null, // TODO: Get from currentUser when available in AuthContext
  };
};

export default useUserPermissions;