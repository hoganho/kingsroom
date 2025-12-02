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
  canAccess: (path: string) => boolean;
  accessiblePages: PageConfig[];
  accessiblePagesByCategory: Record<PageCategory, PageConfig[]>;
  hasRole: (roles: UserRole | UserRole[]) => boolean;
  isSuperAdmin: boolean;
  userRole: UserRole | null;
  customAllowedPages: string[] | null;
}

export const useUserPermissions = (): UserPermissions => {
  // FIX: Destructure 'user' to get access to allowedPages
  const { user, userRole: authRole } = useAuth();
  
  const userRole: UserRole | null = authRole as UserRole | null;
  const isSuperAdmin = userRole === 'SUPER_ADMIN';
  
  // Extract custom permissions safely
  // @ts-ignore - allowedPages exists on the backend user object but might be missing from frontend type
  const customAllowedPages = user?.allowedPages || null;

  // Check if user can access a specific path
  const canAccess = useCallback((path: string): boolean => {
    if (!userRole) return false;
    // FIX: Pass customAllowedPages instead of null
    return hasPageAccess(path, userRole, customAllowedPages);
  }, [userRole, customAllowedPages]);
  
  // Get all accessible pages
  const accessiblePages = useMemo((): PageConfig[] => {
    if (!userRole) return [];
    
    // Super admin gets all pages
    if (isSuperAdmin) return ALL_PAGES;
    
    // FIX: If custom pages exist, filter strictly by them
    if (customAllowedPages && customAllowedPages.length > 0) {
      return ALL_PAGES.filter(page => 
        page.alwaysAllowed || 
        customAllowedPages.some((allowed: string) => pathMatchesPage(page.path, allowed))
      );
    }

    // Fall back to default role permissions
    const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[userRole] || [];
    return ALL_PAGES.filter(page => 
      page.alwaysAllowed || 
      defaultPermissions.some((allowed: string) => pathMatchesPage(page.path, allowed))
    );
  }, [userRole, isSuperAdmin, customAllowedPages]);
  
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
    customAllowedPages,
  };
};

export default useUserPermissions;