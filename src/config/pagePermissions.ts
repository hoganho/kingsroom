// src/config/pagePermissions.ts
// Central configuration for all pages and their metadata

export interface PageConfig {
  path: string;
  label: string;
  description: string;
  category: PageCategory;
  requiredBaseRoles?: UserRole[]; // Minimum role required (can be overridden by allowedPages)
  alwaysAllowed?: boolean; // Pages that are always accessible
  icon?: string;
  parentPath?: string; // For grouping in sidebar
}

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

export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'VENUE_MANAGER' | 'TOURNAMENT_DIRECTOR' | 'MARKETING';

// All available pages in the system
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
    path: '/venues', // ✅ FIXED: Matches App.tsx route (was /venues/dashboard)
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

  // Settings Section
  {
    path: '/settings/entity-management',
    label: 'Entity Management',
    description: 'Manage entities and organizations',
    category: 'settings',
    requiredBaseRoles: ['SUPER_ADMIN'],
    icon: 'BuildingOffice2Icon',
  },
  {
    path: '/settings/venue-management',
    label: 'Venue Management',
    description: 'Manage venue configurations',
    category: 'settings',
    requiredBaseRoles: ['ADMIN', 'SUPER_ADMIN'],
    icon: 'BuildingOffice2Icon',
  },
  {
    path: '/settings/game-management',
    label: 'Game Management',
    description: 'Manage game venue assignments and entity reassignments',
    category: 'settings',
    requiredBaseRoles: ['ADMIN', 'SUPER_ADMIN'],
    icon: 'BeakerIcon',
  },
  {
    path: '/settings/series-management',
    label: 'Series Management',
    description: 'Manage tournament series',
    category: 'settings',
    requiredBaseRoles: ['ADMIN', 'SUPER_ADMIN'],
    icon: 'TrophyIcon',
  },
  {
    path: '/settings/social-accounts',
    label: 'Social Accounts',
    description: 'Manage social media accounts',
    category: 'settings',
    requiredBaseRoles: ['ADMIN', 'SUPER_ADMIN'],
    icon: 'HashtagIcon',
  },
  {
    path: '/settings/user-management',
    label: 'User Management',
    description: 'Manage user accounts and permissions',
    category: 'settings',
    requiredBaseRoles: ['SUPER_ADMIN'],
    icon: 'UsersIcon',
  },

  // Scraper Section
  {
    path: '/scraper/admin',
    label: 'Scraper Admin',
    description: 'Manage web scraping operations',
    category: 'scraper',
    requiredBaseRoles: ['SUPER_ADMIN'],
    icon: 'WrenchIcon',
  },

  // Debug Section
  {
    path: '/debug/games',
    label: 'Games Debug',
    description: 'Debug game data',
    category: 'debug',
    requiredBaseRoles: ['SUPER_ADMIN'],
    icon: 'BeakerIcon',
  },
  {
    path: '/debug/players',
    label: 'Players Debug',
    description: 'Debug player data',
    category: 'debug',
    requiredBaseRoles: ['SUPER_ADMIN'],
    icon: 'UserGroupIcon',
  },
  {
    path: '/debug/database-monitor',
    label: 'Database Monitor',
    description: 'Monitor database operations',
    category: 'debug',
    requiredBaseRoles: ['SUPER_ADMIN'],
    icon: 'BeakerIcon',
  },
];

// Helper to get pages by category
export const getPagesByCategory = (category: PageCategory): PageConfig[] => {
  return ALL_PAGES.filter(page => page.category === category);
};

// Get all categories with their pages
export const getGroupedPages = (): Record<PageCategory, PageConfig[]> => {
  return ALL_PAGES.reduce((acc, page) => {
    if (!acc[page.category]) {
      acc[page.category] = [];
    }
    acc[page.category].push(page);
    return acc;
  }, {} as Record<PageCategory, PageConfig[]>);
};

// Category display names
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

// Default permissions by role
export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  SUPER_ADMIN: ALL_PAGES.map(p => p.path), // All pages
  ADMIN: ALL_PAGES
    .filter(p => !p.requiredBaseRoles?.includes('SUPER_ADMIN'))
    .map(p => p.path),
  VENUE_MANAGER: [
    '/home',
    '/players/dashboard',
    '/players/search',
    '/games/dashboard',
    '/games/search',
    '/venues', // ✅ FIXED: Changed from /venues/dashboard
    '/venues/details',
    '/social/pulse',
  ],
  TOURNAMENT_DIRECTOR: [
    '/home',
    '/players/dashboard',
    '/players/search',
    '/games/dashboard',
    '/games/search',
    '/series/dashboard',
  ],
  MARKETING: [
    '/home',
    '/players/dashboard',
    '/social/pulse',
    '/social/dashboard',
  ],
};

// Check if a path matches a page
export const pathMatchesPage = (pathname: string, pagePath: string): boolean => {
  const normalizedPath = pathname.replace(/\/$/, '') || '/';
  const normalizedPagePath = pagePath.replace(/\/$/, '') || '/';

  // Exact match
  if (normalizedPath === normalizedPagePath) return true;
  
  // Nested route match (e.g. /players/search matches /players/search/123)
  if (normalizedPath.startsWith(normalizedPagePath + '/')) return true;
  
  return false;
};

// Check if user has access to a specific path
export const hasPageAccess = (
  pathname: string,
  userRole: string | undefined,
  allowedPages?: string[] | null
): boolean => {
  // 1. ✅ MOVED UP: Super Admin Override (Case insensitive check)
  // Super Admins should ALWAYS have access, even if the page isn't in config yet
  if (userRole && userRole.toUpperCase() === 'SUPER_ADMIN') return true;

  // 2. Find the page config
  const pageConfig = ALL_PAGES.find(page => pathMatchesPage(pathname, page.path));
  
  // If page is not tracked in our system, allow it (e.g. login, 404s, public routes)
  if (!pageConfig) {
    // If it's a known public route or root, allow
    return pathname === '/' || pathname === '/login';
  }
  
  // 3. Check "Always Allowed" (Configured in ALL_PAGES)
  if (pageConfig.alwaysAllowed) return true;
  
  // 4. Custom User Permissions (The "Configurable" Logic)
  // If allowedPages is an Array (even empty), we MUST respect it.
  if (Array.isArray(allowedPages)) {
    return allowedPages.some(allowed => pathMatchesPage(pathname, allowed));
  }
  
  // 5. Default Role Permissions Fallback
  // Only reached if allowedPages is null/undefined
  if (!userRole) return false;

  // Normalize role to find in default map (handle SuperAdmin vs SUPER_ADMIN)
  const normalizedRole = Object.keys(DEFAULT_ROLE_PERMISSIONS).find(
    key => key.toUpperCase() === userRole.toUpperCase()
  ) as UserRole | undefined;

  if (normalizedRole) {
    const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[normalizedRole];
    return defaultPermissions.some(allowed => pathMatchesPage(pathname, allowed));
  }

  return false;
};