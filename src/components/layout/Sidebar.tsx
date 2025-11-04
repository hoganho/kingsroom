// src/components/layout/Sidebar.tsx - Fixed with correct route paths

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
  Bars3Icon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

interface MenuItem {
  to?: string;
  label: string;
  icon?: React.ComponentType<any>;
  children?: MenuItem[];
  requiredRoles?: string[];
}

export const Sidebar = ({ isOpen = false, onClose }: SidebarProps) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(isOpen);
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  const location = useLocation();
  const { userRole } = useAuth(); // Assumes AuthContext provides userRole
  const buildVersion = import.meta.env.VITE_BUILD_VERSION || 'dev';

  // Main navigation items - FIXED PATHS
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
      to: '/scraper/admin',  // Correct path matching App.tsx route
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
  ];

  // Sync with parent's isOpen prop
  useEffect(() => {
    setIsMobileMenuOpen(isOpen);
  }, [isOpen]);

  // Close mobile menu on route change
  useEffect(() => {
    handleCloseMobileMenu();
  }, [location]);

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

  const handleCloseMobileMenu = () => {
    setIsMobileMenuOpen(false);
    onClose?.();
  };

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
    if (window.innerWidth < 768) {
      handleCloseMobileMenu();
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

  return (
    <>
      {/* Mobile menu button */}
      <button
        type="button"
        className="md:hidden fixed top-4 left-4 z-50 inline-flex items-center justify-center p-2 rounded-md text-gray-700 bg-white shadow-lg hover:text-gray-900 hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-indigo-500"
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
      >
        <span className="sr-only">Toggle menu</span>
        {isMobileMenuOpen ? (
          <XMarkIcon className="h-6 w-6" />
        ) : (
          <Bars3Icon className="h-6 w-6" />
        )}
      </button>

      {/* Mobile menu overlay */}
      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 z-40 bg-gray-600 bg-opacity-75"
          onClick={handleCloseMobileMenu}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-white transform transition-transform duration-300 ease-in-out
          md:translate-x-0 md:z-30
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex flex-shrink-0 items-center justify-center px-4 h-16 border-b bg-black">
          <span className="font-mono text-sm font-semibold text-gray-300 tracking-wider">
            Prototype v{buildVersion}
          </span>
        </div>

        <nav className="flex flex-1 flex-col overflow-y-auto">
          <div className="p-4 space-y-2">
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
          </div>
        </nav>

        <div className="p-4 border-t">
          <p className="text-xs text-gray-500">© 2025 Top Set Ventures</p>
        </div>
      </aside>
    </>
  );
};