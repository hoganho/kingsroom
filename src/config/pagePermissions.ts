// src/config/pagePermissions.ts
// ============================================
// CENTRALIZED PAGE PERMISSION CONFIGURATION
// ============================================
//
// This file defines:
// 1. ALL_PAGES - Complete registry of pages in the application
// 2. DEFAULT_ROLE_PERMISSIONS - What each role can access by default
// 3. hasPageAccess() - The single source of truth for page access checks
//
// Permission Priority (highest to lowest):
// 1. SUPER_ADMIN role → Always has access to everything
// 2. User's `allowedPages` array (if set) → Explicit override
// 3. Role's default permissions → Fallback
//
// NOTE: Entity permissions (which data a user can see) are handled
// separately in EntityContext.tsx. Page permissions only control
// which routes are accessible.
// ============================================

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'VENUE_MANAGER' | 'TOURNAMENT_DIRECTOR' | 'MARKETING';

export type PageCategory =
  | 'core'
  | 'players'
  | 'games'
  | 'series'
  | 'venues'
  | 'social'
  | 'settings'
  | 'scraper'
  | 'debug';

export interface PageConfig {
  path: string;
  label: string;
  description: string;
  category: PageCategory;
  icon?: string;
  /** For nested routes - indicates the parent page in navigation */
  parentPath?: string;
  /** Pages that are always accessible regardless of permissions */
  alwaysAllowed?: boolean;
}

// ============================================
// PAGE REGISTRY
// ============================================
// Order matters! DefaultRoute redirects to the FIRST accessible page.
// Keep commonly-accessed pages near the top.

export const ALL_PAGES: PageConfig[] = [
  // Core Pages
  {
    path: '/home',
    label: 'Home',
    description: 'Main dashboard and overview',
    category: 'core',
    icon: 'HomeIcon',
  },

  // Players Section
  {
    path: '/players/dashboard',
    label: 'Players Dashboard',
    description: 'Player statistics and overview',
    category: 'players',
    icon: 'UserGroupIcon',
  },
  {
    path: '/players/search',
    label: 'Player Search',
    description: 'Search and find players',
    category: 'players',
    icon: 'UserGroupIcon',
  },
  {
    path: '/players/profile',
    label: 'Player Profile',
    description: 'View individual player profiles',
    category: 'players',
    icon: 'UserGroupIcon',
    parentPath: '/players/search',
  },

  // Series Section
  {
    path: '/series/dashboard',
    label: 'Series Dashboard',
    description: 'Tournament series management',
    category: 'series',
    icon: 'TrophyIcon',
  },

  // Games Section
  {
    path: '/games/dashboard',
    label: 'Games Dashboard',
    description: 'Games overview and statistics',
    category: 'games',
    icon: 'BeakerIcon',
  },
  {
    path: '/games/search',
    label: 'Game Search',
    description: 'Search and find games',
    category: 'games',
    icon: 'BeakerIcon',
  },
  {
    path: '/games/details',
    label: 'Game Details',
    description: 'View individual game details',
    category: 'games',
    icon: 'BeakerIcon',
    parentPath: '/games/search',
  },

  // Venues Section
  {
    path: '/venues',
    label: 'Venues Dashboard',
    description: 'Venue overview and management',
    category: 'venues',
    icon: 'BuildingOffice2Icon',
  },
  {
    path: '/venues/details',
    label: 'Venue Details',
    description: 'View venue details',
    category: 'venues',
    icon: 'BuildingOffice2Icon',
    parentPath: '/venues',
  },
  {
    path: '/venues/game',
    label: 'Venue Game Details',
    description: 'View venue game details',
    category: 'venues',
    icon: 'BuildingOffice2Icon',
    parentPath: '/venues/details',
  },

  // Social Section
  {
    path: '/social/pulse',
    label: 'Social Pulse',
    description: 'Social media feed and monitoring',
    category: 'social',
    icon: 'MegaphoneIcon',
  },
  {
    path: '/social/dashboard',
    label: 'Social Dashboard',
    description: 'Social media analytics',
    category: 'social',
    icon: 'MegaphoneIcon',
  },

  // Settings Section (Admin+)
  {
    path: '/settings/entity-management',
    label: 'Entity Management',
    description: 'Manage entities and organizations',
    category: 'settings',
    icon: 'BuildingOffice2Icon',
  },
  {
    path: '/settings/venue-management',
    label: 'Venue Management',
    description: 'Manage venue configurations',
    category: 'settings',
    icon: 'BuildingOffice2Icon',
  },
  {
    path: '/settings/game-management',
    label: 'Game Management',
    description: 'Manage game venue assignments and entity reassignments',
    category: 'settings',
    icon: 'BeakerIcon',
  },
  {
    path: '/settings/series-management',
    label: 'Series Management',
    description: 'Manage tournament series',
    category: 'settings',
    icon: 'TrophyIcon',
  },
  {
    path: '/settings/social-accounts',
    label: 'Social Accounts',
    description: 'Manage social media accounts',
    category: 'settings',
    icon: 'HashtagIcon',
  },
  {
    path: '/settings/user-management',
    label: 'User Management',
    description: 'Manage user accounts and permissions',
    category: 'settings',
    icon: 'UsersIcon',
  },

  // Scraper Section (SuperAdmin)
  {
    path: '/scraper/admin',
    label: 'Scraper Admin',
    description: 'Manage web scraping operations',
    category: 'scraper',
    icon: 'WrenchIcon',
  },

  // Debug Section (SuperAdmin)
  {
    path: '/debug/games',
    label: 'Games Debug',
    description: 'Debug game data',
    category: 'debug',
    icon: 'BugAntIcon',
  },
  {
    path: '/debug/players',
    label: 'Players Debug',
    description: 'Debug player data',
    category: 'debug',
    icon: 'BugAntIcon',
  },
  {
    path: '/debug/database-monitor',
    label: 'Database Monitor',
    description: 'Monitor database operations',
    category: 'debug',
    icon: 'BugAntIcon',
  },
];

// ============================================
// DEFAULT ROLE PERMISSIONS
// ============================================
// These are used when a user does NOT have custom `allowedPages` set.
// Once `allowedPages` is set (even to empty array), these are ignored.

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  SUPER_ADMIN: ALL_PAGES.map(p => p.path),
  
  ADMIN: [
    '/home',
    '/players/dashboard',
    '/players/search',
    '/players/profile',
    '/series/dashboard',
    '/games/dashboard',
    '/games/search',
    '/games/details',
    '/venues',
    '/venues/details',
    '/venues/game',
    '/social/pulse',
    '/social/dashboard',
    '/settings/venue-management',
    '/settings/game-management',
    '/settings/series-management',
    '/settings/social-accounts',
  ],
  
  VENUE_MANAGER: [
    '/home',
    '/players/dashboard',
    '/players/search',
    '/players/profile',
    '/games/dashboard',
    '/games/search',
    '/games/details',
    '/venues',
    '/venues/details',
    '/venues/game',
    '/social/pulse',
  ],
  
  TOURNAMENT_DIRECTOR: [
    '/home',
    '/players/dashboard',
    '/players/search',
    '/players/profile',
    '/games/dashboard',
    '/games/search',
    '/games/details',
    '/series/dashboard',
  ],
  
  MARKETING: [
    '/home',
    '/players/dashboard',
    '/players/search',
    '/social/pulse',
    '/social/dashboard',
  ],
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Checks if a pathname matches a page path.
 * Handles exact matches and nested routes (e.g., /players/profile/123 matches /players/profile)
 */
export function pathMatchesPage(pathname: string, pagePath: string): boolean {
  const normalizedPath = pathname.replace(/\/$/, '') || '/';
  const normalizedPagePath = pagePath.replace(/\/$/, '') || '/';

  // Exact match
  if (normalizedPath === normalizedPagePath) return true;

  // Nested route match (e.g., /players/profile/123 matches /players/profile)
  if (normalizedPath.startsWith(normalizedPagePath + '/')) return true;

  return false;
}

/**
 * Get a page config by path
 */
export function getPageConfig(pathname: string): PageConfig | undefined {
  return ALL_PAGES.find(page => pathMatchesPage(pathname, page.path));
}

/**
 * Get pages filtered by category
 */
export function getPagesByCategory(category: PageCategory): PageConfig[] {
  return ALL_PAGES.filter(page => page.category === category);
}

/**
 * Get all pages grouped by category
 */
export function getGroupedPages(): Record<PageCategory, PageConfig[]> {
  return ALL_PAGES.reduce((acc, page) => {
    if (!acc[page.category]) {
      acc[page.category] = [];
    }
    acc[page.category].push(page);
    return acc;
  }, {} as Record<PageCategory, PageConfig[]>);
}

// Category display labels
export const CATEGORY_LABELS: Record<PageCategory, string> = {
  core: 'Core',
  players: 'Players',
  games: 'Games',
  series: 'Series',
  venues: 'Venues',
  social: 'Social',
  settings: 'Settings',
  scraper: 'Scraper Management',
  debug: 'Debug',
};

// ============================================
// ACCESS CHECK - THE SINGLE SOURCE OF TRUTH
// ============================================

/**
 * Determines if a user can access a specific page.
 * 
 * @param pathname - The route path to check (e.g., "/venues/details")
 * @param userRole - The user's role (e.g., "ADMIN")
 * @param allowedPages - User's custom page permissions (null = use role defaults)
 * @returns boolean - Whether access is granted
 * 
 * Logic:
 * 1. SUPER_ADMIN always has access
 * 2. If allowedPages is an array (even empty), use it exclusively
 * 3. Otherwise, fall back to role's default permissions
 */
export function hasPageAccess(
  pathname: string,
  userRole: string | undefined | null,
  allowedPages?: string[] | null
): boolean {
  // Normalize role for comparison
  const normalizedRole = userRole?.toUpperCase() as UserRole | undefined;

  // 1. SUPER_ADMIN bypass - always has full access
  if (normalizedRole === 'SUPER_ADMIN') {
    return true;
  }

  // 2. Find the page in our registry
  const pageConfig = getPageConfig(pathname);

  // If page isn't in our registry, only allow known public routes
  if (!pageConfig) {
    return pathname === '/' || pathname === '/login';
  }

  // 3. Always allowed pages bypass permission checks
  if (pageConfig.alwaysAllowed) {
    return true;
  }

  // 4. Custom permissions take precedence (strict mode)
  // If allowedPages is an Array (even empty []), we MUST use it exclusively
  if (Array.isArray(allowedPages)) {
    return allowedPages.some(allowed => pathMatchesPage(pathname, allowed));
  }

  // 5. Fall back to role's default permissions
  if (!normalizedRole) {
    return false;
  }

  const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[normalizedRole];
  if (!defaultPermissions) {
    console.warn(`[pagePermissions] Unknown role: ${userRole}`);
    return false;
  }

  return defaultPermissions.some(allowed => pathMatchesPage(pathname, allowed));
}

/**
 * Get all accessible pages for a user.
 * Used by navigation components to filter visible items.
 */
export function getAccessiblePages(
  userRole: string | undefined | null,
  allowedPages?: string[] | null
): PageConfig[] {
  const normalizedRole = userRole?.toUpperCase() as UserRole | undefined;

  // SUPER_ADMIN gets everything
  if (normalizedRole === 'SUPER_ADMIN') {
    return ALL_PAGES;
  }

  // Custom permissions mode
  if (Array.isArray(allowedPages)) {
    return ALL_PAGES.filter(page =>
      page.alwaysAllowed || allowedPages.some(allowed => pathMatchesPage(page.path, allowed))
    );
  }

  // Default role permissions
  if (!normalizedRole) {
    // Still return alwaysAllowed pages even without a role
    return ALL_PAGES.filter(page => page.alwaysAllowed);
  }

  const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[normalizedRole];
  if (!defaultPermissions) {
    return ALL_PAGES.filter(page => page.alwaysAllowed);
  }

  return ALL_PAGES.filter(page =>
    page.alwaysAllowed || defaultPermissions.some(allowed => pathMatchesPage(page.path, allowed))
  );
}

/**
 * Find the first accessible page for a user.
 * Used for smart redirects when user lands on / or an inaccessible page.
 */
export function getFirstAccessiblePage(
  userRole: string | undefined | null,
  allowedPages?: string[] | null
): PageConfig | null {
  const accessiblePages = getAccessiblePages(userRole, allowedPages);
  return accessiblePages.length > 0 ? accessiblePages[0] : null;
}

/**
 * Check if user has any page access at all.
 * Used to determine if we should show "contact admin" screen.
 */
export function hasAnyPageAccess(
  userRole: string | undefined | null,
  allowedPages?: string[] | null
): boolean {
  return getAccessiblePages(userRole, allowedPages).length > 0;
}