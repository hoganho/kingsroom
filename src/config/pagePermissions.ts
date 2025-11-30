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
    alwaysAllowed: true,
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
    path: '/venues/dashboard',
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
    '/venues/dashboard',
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

// Check if a path matches a page (handles dynamic routes like /players/profile/:id)
export const pathMatchesPage = (pathname: string, pagePath: string): boolean => {
  // Exact match
  if (pathname === pagePath) return true;
  
  // Check if pathname starts with pagePath (for nested routes)
  if (pathname.startsWith(pagePath + '/')) return true;
  
  // Handle dynamic routes
  const pageSegments = pagePath.split('/');
  const pathSegments = pathname.split('/');
  
  if (pageSegments.length > pathSegments.length) return false;
  
  for (let i = 0; i < pageSegments.length; i++) {
    if (pageSegments[i].startsWith(':')) continue; // Skip dynamic segments
    if (pageSegments[i] !== pathSegments[i]) return false;
  }
  
  return true;
};

// Check if user has access to a specific path
export const hasPageAccess = (
  pathname: string,
  userRole: UserRole,
  allowedPages?: string[] | null
): boolean => {
  // Find the page config
  const pageConfig = ALL_PAGES.find(page => pathMatchesPage(pathname, page.path));
  
  // If page not found in config, deny access (or allow for unknown routes)
  if (!pageConfig) {
    // Allow access to base routes and catch-all
    return pathname === '/' || pathname === '/login';
  }
  
  // Always allowed pages (like home)
  if (pageConfig.alwaysAllowed) return true;
  
  // SUPER_ADMIN always has access
  if (userRole === 'SUPER_ADMIN') return true;
  
  // If user has custom allowedPages, use those
  if (allowedPages && allowedPages.length > 0) {
    return allowedPages.some(allowed => pathMatchesPage(pathname, allowed));
  }
  
  // Fall back to default role permissions
  const defaultPermissions = DEFAULT_ROLE_PERMISSIONS[userRole] || [];
  return defaultPermissions.some(allowed => pathMatchesPage(pathname, allowed));
};