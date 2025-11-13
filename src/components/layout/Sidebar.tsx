// src/components/layout/Sidebar.tsx - Final version without unused parameters

import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/24/outline';
import {
  HomeIcon,
  UserGroupIcon,
  TrophyIcon,
  BeakerIcon,
  BuildingOffice2Icon,
  WrenchIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';
import { EntitySelector } from '../entities/EntitySelector';
import { Database } from 'lucide-react';

interface SidebarProps {
  onClose?: () => void;
}

interface MenuItem {
  to?: string;
  label: string;
  icon?: React.ComponentType<any>;
  children?: MenuItem[];
  requiredRoles?: string[];
}

export const Sidebar = ({ onClose }: SidebarProps) => {
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const location = useLocation();
  const { userRole } = useAuth();
  const buildVersion = import.meta.env.VITE_BUILD_VERSION || 'dev';

  // Main navigation items
  const mainMenuItems: MenuItem[] = [
    {
      to: '/home',
      label: 'Home',
      icon: HomeIcon,
    },
    {
      label: 'Players',
      icon: UserGroupIcon,
      children: [
        { to: '/players/dashboard', label: 'Dashboard' },
        { to: '/players/search', label: 'Player Search' },
      ],
    },
    {
      label: 'Series',
      icon: TrophyIcon,
      children: [
        { to: '/series/dashboard', label: 'Dashboard' },
      ],
    },
    {
      label: 'Games',
      icon: BeakerIcon,
      children: [
        { to: '/games/dashboard', label: 'Dashboard' },
        { to: '/games/search', label: 'Game Search' },
      ],
    },
    {
      label: 'Venues',
      icon: BuildingOffice2Icon,
      children: [
        { to: '/venues/dashboard', label: 'Dashboard' },
        { to: '/venues/details', label: 'Venue Details' },
      ],
    },
  ];

  // Settings section (Admin and SuperAdmin)
  const settingsMenuItems: MenuItem[] = [
    {
      to: '/settings/entity-management',
      label: 'Entity Management',
      icon: BuildingOffice2Icon,
      requiredRoles: ['SuperAdmin'],
    },
    {
      to: '/settings/venue-management',
      label: 'Venue Management',
      icon: BuildingOffice2Icon,
      requiredRoles: ['Admin', 'SuperAdmin'],
    },
    {
      to: '/settings/series-management',
      label: 'Series Management',
      icon: TrophyIcon,
      requiredRoles: ['Admin', 'SuperAdmin'],
    },
  ];

  // Scraper Management section (SuperAdmin only)
  const scraperMenuItems: MenuItem[] = [
    {
      to: '/scraper/admin',
      label: 'Scraper Admin',
      icon: WrenchIcon,
      requiredRoles: ['SuperAdmin'],
    },
  ];

  // Debug section (SuperAdmin only)
  const debugMenuItems: MenuItem[] = [
    {
      to: '/debug/games',
      label: 'Games (Debug)',
      icon: BeakerIcon,
      requiredRoles: ['SuperAdmin'],
    },
    {
      to: '/debug/players',
      label: 'Players (Debug)',
      icon: UserGroupIcon,
      requiredRoles: ['SuperAdmin'],
    },
    {
        to: '/debug/database-monitor',
        label: 'Database Monitor',
        icon: Database as any, // import { Database } from 'lucide-react'
        requiredRoles: ['SuperAdmin'],
    }
  ];

  // Auto-expand parent if child is active
  useEffect(() => {
    mainMenuItems.forEach((item) => {
      if (item.children) {
        const isChildActive = item.children.some((child) =>
          location.pathname.startsWith(child.to || '')
        );
        if (isChildActive) {
          setExpandedItems((prev) => new Set(prev).add(item.label));
        }
      }
    });
  }, [location.pathname]);

  const toggleExpanded = (label: string) => {
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(label)) {
        newSet.delete(label);
      } else {
        newSet.add(label);
      }
      return newSet;
    });
  };

  const getLinkClassName = ({ isActive }: { isActive: boolean }) =>
    `flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
      isActive
        ? 'bg-indigo-600 text-white'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  const handleNavClick = () => {
    // Close mobile menu on navigation if on mobile and callback provided
    if (onClose && window.innerWidth < 768) {
      setTimeout(onClose, 100); // Small delay for better UX
    }
  };

  const hasRole = (requiredRoles?: string[]) => {
    if (!requiredRoles || requiredRoles.length === 0) return true;
    return requiredRoles.includes(userRole || '');
  };

  const renderMenuItem = (item: MenuItem, depth = 0) => {
    if (!hasRole(item.requiredRoles)) return null;

    const isExpanded = expandedItems.has(item.label);
    const hasChildren = item.children && item.children.length > 0;
    const Icon = item.icon;

    if (hasChildren) {
      return (
        <div key={item.label}>
          <button
            onClick={() => toggleExpanded(item.label)}
            className={`flex items-center justify-between w-full px-4 py-2.5 text-sm font-medium rounded-lg transition-colors text-gray-600 hover:bg-gray-100 hover:text-gray-900`}
            style={{ paddingLeft: `${(depth + 1) * 16}px` }}
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

    return (
      <NavLink
        key={item.to}
        to={item.to!}
        className={getLinkClassName}
        onClick={handleNavClick}
        style={{ paddingLeft: `${(depth + 1) * 16}px` }}
      >
        {Icon && <Icon className="h-5 w-5 mr-3" />}
        {item.label}
      </NavLink>
    );
  };

  // The sidebar content - works in both desktop (fixed) and mobile (dialog) contexts
  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex-shrink-0 h-16 flex items-center justify-center px-4 bg-black border-b">
        <span className="font-mono text-sm font-semibold text-gray-300 tracking-wider">
          Prototype v{buildVersion}
        </span>
      </div>

      {/* Entity Selector */}
      <div className="flex-shrink-0 px-4 py-3 bg-gray-50 border-b">
        <EntitySelector 
          showLabel={true}
          className="w-full"
        />
      </div>

      {/* Scrollable Navigation Area */}
      <div className="flex-1 overflow-y-auto">
        <nav className="p-4 space-y-2">
          {/* Main navigation */}
          {mainMenuItems.map((item) => renderMenuItem(item))}

          {/* Settings section (Admin/SuperAdmin) */}
          {hasRole(['Admin', 'SuperAdmin']) && (
            <>
              <div className="pt-6 pb-2">
                <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Settings
                </p>
              </div>
              {settingsMenuItems.map((item) => renderMenuItem(item))}
            </>
          )}

          {/* Scraper Management section (SuperAdmin) */}
          {hasRole(['SuperAdmin']) && (
            <>
              <div className="pt-6 pb-2">
                <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Scraper Management
                </p>
              </div>
              {scraperMenuItems.map((item) => renderMenuItem(item))}
            </>
          )}

          {/* Debug section (SuperAdmin) */}
          {hasRole(['SuperAdmin']) && (
            <>
              <div className="pt-6 pb-2">
                <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Debug
                </p>
              </div>
              {debugMenuItems.map((item) => renderMenuItem(item))}
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