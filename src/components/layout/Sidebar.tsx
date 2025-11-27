// src/components/layout/Sidebar.tsx
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
  HashtagIcon,
  MegaphoneIcon // Replaced 'Radio' with 'MegaphoneIcon'
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';
import { EntitySelector } from '../entities/EntitySelector';

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
  // Removed unused useNavigate
  const { userRole } = useAuth();
  const buildVersion = import.meta.env.VITE_BUILD_VERSION || 'dev';

  // --- REFACTORED MENU STRUCTURE ---
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
    // --- UPDATED SOCIAL SECTION ---
    {
      to: '/social/pulse',
      label: 'Social',
      icon: MegaphoneIcon, // Updated Icon
      children: [
        { to: '/social/dashboard', label: 'Dashboard' },
      ],
    },
  ];

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
    {
        to: '/settings/social-accounts',
        label: 'Social Accounts',
        icon: HashtagIcon,
        requiredRoles: ['Admin', 'SuperAdmin'],
    },
  ];
  
  const scraperMenuItems: MenuItem[] = [
      { to: '/scraper/admin', label: 'Scraper Admin', icon: WrenchIcon, requiredRoles: ['SuperAdmin'] }
  ];

  const debugMenuItems: MenuItem[] = [
      { to: '/debug/games', label: 'Games (Debug)', icon: BeakerIcon, requiredRoles: ['SuperAdmin'] },
      { to: '/debug/players', label: 'Players (Debug)', icon: UserGroupIcon, requiredRoles: ['SuperAdmin'] },
      { to: '/debug/database-monitor', label: 'Database Monitor', icon: BeakerIcon, requiredRoles: ['SuperAdmin'] }
  ];

  // Auto-expand
  useEffect(() => {
    mainMenuItems.forEach((item) => {
      if (item.children) {
        const isActive = 
          (item.to && location.pathname.startsWith(item.to)) || 
          item.children.some((child) => location.pathname.startsWith(child.to || ''));
        
        if (isActive) {
          setExpandedItems((prev) => new Set(prev).add(item.label));
        }
      }
    });
  }, [location.pathname]);

  const toggleExpanded = (label: string, e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setExpandedItems((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(label)) newSet.delete(label);
      else newSet.add(label);
      return newSet;
    });
  };

  const hasRole = (requiredRoles?: string[]) => {
    if (!requiredRoles || requiredRoles.length === 0) return true;
    return requiredRoles.includes(userRole || '');
  };

  // --- REFACTORED RENDER LOGIC ---
  const renderMenuItem = (item: MenuItem, depth = 0) => {
    if (!hasRole(item.requiredRoles)) return null;

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
        )
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
      <div className="flex-shrink-0 h-16 flex items-center justify-center px-4 bg-black border-b">
        <span className="font-mono text-sm font-semibold text-gray-300 tracking-wider">Concept v{buildVersion}</span>
      </div>
      <div className="flex-shrink-0 px-4 py-3 bg-gray-50 border-b">
        <EntitySelector showLabel={true} className="w-full" />
      </div>

      <div className="flex-1 overflow-y-auto">
        <nav className="p-4 space-y-2">
          {mainMenuItems.map((item) => renderMenuItem(item))}
          
          {hasRole(['Admin', 'SuperAdmin']) && (
             <>
              <div className="pt-6 pb-2"><p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Settings</p></div>
              {settingsMenuItems.map((item) => renderMenuItem(item))}
             </>
          )}

          {hasRole(['SuperAdmin']) && (
            <>
               <div className="pt-6 pb-2"><p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Scraper Management</p></div>
               {scraperMenuItems.map(item => renderMenuItem(item))}
               
               <div className="pt-6 pb-2"><p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">Debug</p></div>
               {debugMenuItems.map(item => renderMenuItem(item))}
            </>
          )}
        </nav>
      </div>

      <div className="flex-shrink-0 p-4 bg-gray-50 border-t">
        <div className="text-xs text-gray-500">
          <div className="mb-1">Version: {buildVersion}</div>
          <div>© 2025 Top Set Ventures</div>
        </div>
      </div>
    </div>
  );
};