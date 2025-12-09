// src/components/layout/Sidebar.tsx
import { useState, useEffect, useMemo } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import {
  HomeIcon,
  UserGroupIcon,
  TrophyIcon,
  BeakerIcon,
  BuildingOffice2Icon,
  WrenchIcon,
  HashtagIcon,
  MegaphoneIcon,
  UsersIcon,
} from '@heroicons/react/24/outline';
import { EntitySelector } from '../entities/EntitySelector';
import { useUserPermissions } from '../../hooks/useUserPermissions';

interface SidebarProps {
  onClose?: () => void;
}

interface MenuItem {
  to?: string;
  label: string;
  icon?: React.ComponentType<any>;
  children?: MenuItem[];
  requiredPaths?: string[]; // Paths that need to be accessible for this item to show
}

export const Sidebar = ({ onClose }: SidebarProps) => {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const location = useLocation();
  const { canAccess } = useUserPermissions();
  const buildVersion = import.meta.env.VITE_BUILD_VERSION || 'dev';

  // Define the full menu structure
  // Items will be filtered based on user permissions
  const fullMenuStructure: MenuItem[] = useMemo(() => [
    {
      to: '/home',
      label: 'Home',
      icon: HomeIcon,
      requiredPaths: ['/home'],
    },
    {
      label: 'Players',
      icon: UserGroupIcon,
      requiredPaths: ['/players/dashboard', '/players/search'],
      children: [
        { to: '/players/dashboard', label: 'Dashboard', requiredPaths: ['/players/dashboard'] },
        { to: '/players/search', label: 'Player Search', requiredPaths: ['/players/search'] },
      ],
    },
    {
      label: 'Series',
      icon: TrophyIcon,
      requiredPaths: ['/series/dashboard'],
      children: [
        { to: '/series/dashboard', label: 'Dashboard', requiredPaths: ['/series/dashboard'] },
      ],
    },
    {
      label: 'Games',
      icon: BeakerIcon,
      requiredPaths: ['/games/dashboard', '/games/search'],
      children: [
        { to: '/games/dashboard', label: 'Dashboard', requiredPaths: ['/games/dashboard'] },
        { to: '/games/search', label: 'Game Search', requiredPaths: ['/games/search'] },
      ],
    },
    {
      label: 'Venues',
      icon: BuildingOffice2Icon,
      requiredPaths: ['/venues/dashboard', '/venues/details'],
      children: [
        { to: '/venues/dashboard', label: 'Dashboard', requiredPaths: ['/venues/dashboard'] },
        { to: '/venues/details', label: 'Venue Details', requiredPaths: ['/venues/details'] },
      ],
    },
    {
      to: '/social/pulse',
      label: 'Social',
      icon: MegaphoneIcon,
      requiredPaths: ['/social/pulse', '/social/dashboard'],
      children: [
        { to: '/social/dashboard', label: 'Dashboard', requiredPaths: ['/social/dashboard'] },
      ],
    },
  ], []);

  const settingsMenuStructure: MenuItem[] = useMemo(() => [
    {
      to: '/settings/entity-management',
      label: 'Entity Management',
      icon: BuildingOffice2Icon,
      requiredPaths: ['/settings/entity-management'],
    },
    {
      to: '/settings/venue-management',
      label: 'Venue Management',
      icon: BuildingOffice2Icon,
      requiredPaths: ['/settings/venue-management'],
    },
    {
      to: '/settings/game-management',
      label: 'Game Management',
      icon: BeakerIcon,
      requiredPaths: ['/settings/game-management'],
    },
    {
      to: '/settings/series-management',
      label: 'Series Management',
      icon: TrophyIcon,
      requiredPaths: ['/settings/series-management'],
    },
    {
      to: '/settings/social-accounts',
      label: 'Social Accounts',
      icon: HashtagIcon,
      requiredPaths: ['/settings/social-accounts'],
    },
    {
      to: '/settings/user-management',
      label: 'User Management',
      icon: UsersIcon,
      requiredPaths: ['/settings/user-management'],
    },
  ], []);

  const scraperMenuStructure: MenuItem[] = useMemo(() => [
    { 
      to: '/scraper/admin', 
      label: 'Scraper Admin', 
      icon: WrenchIcon, 
      requiredPaths: ['/scraper/admin'] 
    }
  ], []);

  const debugMenuStructure: MenuItem[] = useMemo(() => [
    { 
      to: '/debug/games', 
      label: 'Games (Debug)', 
      icon: BeakerIcon, 
      requiredPaths: ['/debug/games'] 
    },
    { 
      to: '/debug/players', 
      label: 'Players (Debug)', 
      icon: UserGroupIcon, 
      requiredPaths: ['/debug/players'] 
    },
    { 
      to: '/debug/database-monitor', 
      label: 'Database Monitor', 
      icon: BeakerIcon, 
      requiredPaths: ['/debug/database-monitor'] 
    }
  ], []);

  // Filter menu items based on user permissions
  const filterMenuItems = (items: MenuItem[]): MenuItem[] => {
    return items
      .map(item => {
        // Check if user can access any of the required paths
        const hasAccess = item.requiredPaths?.some(path => canAccess(path)) ?? true;
        
        if (!hasAccess) return null;

        // If has children, filter them too
        if (item.children) {
          const filteredChildren = filterMenuItems(item.children);
          // Only include parent if it has accessible children
          if (filteredChildren.length === 0) return null;
          return { ...item, children: filteredChildren };
        }

        return item;
      })
      .filter((item): item is MenuItem => item !== null);
  };

  // Get filtered menu items
  const mainMenuItems = useMemo(() => filterMenuItems(fullMenuStructure), [fullMenuStructure, canAccess]);
  const settingsMenuItems = useMemo(() => filterMenuItems(settingsMenuStructure), [settingsMenuStructure, canAccess]);
  const scraperMenuItems = useMemo(() => filterMenuItems(scraperMenuStructure), [scraperMenuStructure, canAccess]);
  const debugMenuItems = useMemo(() => filterMenuItems(debugMenuStructure), [debugMenuStructure, canAccess]);

  // Auto-expand active sections
  useEffect(() => {
    const allItems = [...mainMenuItems, ...settingsMenuItems, ...scraperMenuItems, ...debugMenuItems];
    allItems.forEach((item) => {
      if (item.children) {
        const isActive = 
          (item.to && location.pathname.startsWith(item.to)) || 
          item.children.some((child) => location.pathname.startsWith(child.to || ''));
        
        if (isActive) {
          setExpandedItems((prev) => new Set(prev).add(item.label));
        }
      }
    });
  }, [location.pathname, mainMenuItems, settingsMenuItems, scraperMenuItems, debugMenuItems]);

  const toggleExpanded = (label: string, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(label)) newSet.delete(label);
      else newSet.add(label);
      return newSet;
    });
  };

  // Render a menu item
  const renderMenuItem = (item: MenuItem, depth = 0) => {
    const isExpanded = expandedItems.has(item.label);
    const hasChildren = item.children && item.children.length > 0;
    const Icon = item.icon;
    const paddingLeft = (depth + 1) * 16;

    // Case 1: Item has Children AND is a Link (Clickable Parent)
    if (hasChildren && item.to) {
      const isActive = location.pathname.startsWith(item.to);
      return (
        <div key={item.label}>
          <div className="flex items-center w-full pr-4">
            <NavLink
              to={item.to}
              onClick={onClose}
              className={`flex-1 flex items-center px-4 py-2.5 text-sm font-medium rounded-l-lg transition-colors ${
                isActive ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
              style={{ paddingLeft: `${paddingLeft}px` }}
            >
              {Icon && <Icon className="h-5 w-5 mr-3" />}
              {item.label}
            </NavLink>
            <button
              onClick={(e) => toggleExpanded(item.label, e)}
              className={`p-2.5 rounded-r-lg hover:bg-gray-100 ${isActive ? 'bg-indigo-600 text-white hover:bg-indigo-700' : 'text-gray-600'}`}
            >
              {isExpanded ? <ChevronDownIcon className="h-4 w-4" /> : <ChevronRightIcon className="h-4 w-4" />}
            </button>
          </div>
          {isExpanded && (
            <div className="mt-1 space-y-1">
              {item.children!.map((child) => renderMenuItem(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // Case 2: Item has Children but is NOT a Link (Standard Collapsible)
    if (hasChildren && !item.to) {
      return (
        <div key={item.label}>
          <button
            onClick={() => toggleExpanded(item.label)}
            className={`flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium rounded-lg transition-colors text-gray-600 hover:bg-gray-100 hover:text-gray-900`}
            style={{ paddingLeft: `${paddingLeft}px` }}
          >
            <div className="flex items-center">
              {Icon && <Icon className="h-5 w-5 mr-3" />}
              {item.label}
            </div>
            {isExpanded ? (
              <ChevronDownIcon className="h-4 w-4" />
            ) : (
              <ChevronRightIcon className="h-4 w-4" />
            )}
          </button>
          {isExpanded && (
            <div className="mt-1 space-y-1">
              {item.children!.map((child) => renderMenuItem(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    // Case 3: Standard Leaf Link
    return (
      <NavLink
        key={item.to || item.label}
        to={item.to!}
        onClick={() => onClose && window.innerWidth < 768 && setTimeout(onClose, 100)}
        className={({ isActive }) => `flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
          isActive ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        }`}
        style={{ paddingLeft: `${paddingLeft}px` }}
      >
        {Icon && <Icon className="h-5 w-5 mr-3" />}
        {item.label}
      </NavLink>
    );
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex-shrink-0 h-16 flex items-center justify-center px-4 bg-black border-b">
        <span className="font-mono text-sm font-semibold text-gray-300 tracking-wider">
          Concept v{buildVersion}
        </span>
      </div>
      
      {/* Entity Selector */}
      <div className="flex-shrink-0 px-4 py-3 bg-gray-50 border-b">
        <EntitySelector showLabel={true} className="w-full" />
      </div>

      {/* Navigation */}
      <div className="flex-1 overflow-y-auto">
        <nav className="p-4 space-y-2">
          {/* Main Menu Items */}
          {mainMenuItems.map((item) => renderMenuItem(item))}
          
          {/* Settings Section - Show if user has access to any settings page */}
          {settingsMenuItems.length > 0 && (
            <>
              <div className="pt-6 pb-2">
                <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Settings
                </p>
              </div>
              {settingsMenuItems.map((item) => renderMenuItem(item))}
            </>
          )}

          {/* Scraper Section - Show if user has access */}
          {scraperMenuItems.length > 0 && (
            <>
              <div className="pt-6 pb-2">
                <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Scraper Management
                </p>
              </div>
              {scraperMenuItems.map(item => renderMenuItem(item))}
            </>
          )}

          {/* Debug Section - Show if user has access */}
          {debugMenuItems.length > 0 && (
            <>
              <div className="pt-6 pb-2">
                <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Debug
                </p>
              </div>
              {debugMenuItems.map(item => renderMenuItem(item))}
            </>
          )}
        </nav>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 p-4 bg-gray-50 border-t">
        <div className="text-xs text-gray-500">
          <div className="mb-1">Version: {buildVersion}</div>
          <div>© 2025 Top Set Ventures</div>
        </div>
      </div>
    </div>
  );
};