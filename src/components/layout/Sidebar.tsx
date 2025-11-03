// src/components/layout/Sidebar.tsx - Legacy routes removed

import { NavLink } from 'react-router-dom';
import {
  HomeIcon,
  BuildingOffice2Icon,
  TrophyIcon,
  UserGroupIcon,
  CogIcon,
  BeakerIcon, // Added for Games (Debug)
} from '@heroicons/react/24/outline';

const getLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
    isActive
      ? 'bg-indigo-600 text-white'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
  }`;

export const Sidebar = () => {
  const buildVersion = import.meta.env.VITE_BUILD_VERSION || 'dev';

  return (
    <aside className="md:fixed md:inset-y-0 md:left-0 md:z-30 flex w-64 flex-col border-r bg-white">
      <div className="flex flex-shrink-0 items-center justify-center px-4 h-16 border-b bg-black">
        <span className="font-mono text-sm font-semibold text-gray-300 tracking-wider">
          Prototype v{buildVersion}
        </span>
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto">
        <div className="p-4 space-y-2">
          <NavLink to="/home" className={getLinkClassName}>
            <HomeIcon className="h-5 w-5 mr-3" />
            Home
          </NavLink>
          
          {/* Enhanced Scraper Management Section */}
          <div className="mt-6 mb-2">
            <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Scraper Management
            </p>
          </div>
          
          {/* Primary scraper admin interface */}
          <NavLink to="/scraper-admin" className={getLinkClassName}>
            <CogIcon className="h-5 w-5 mr-3" />
            Scraper Admin
          </NavLink>
          
          {/* Game Management Section */}
          <div className="mt-6 mb-2">
            <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Game Management
            </p>
          </div>
          
          <NavLink to="/venues" className={getLinkClassName}>
            <BuildingOffice2Icon className="h-5 w-5 mr-3" />
            Venues
          </NavLink>
          <NavLink to="/series-management" className={getLinkClassName}>
            <TrophyIcon className="h-5 w-5 mr-3" />
            Series Management
          </NavLink>
          
          {/* New link for Games (Debug) */}
          <NavLink to="/games" className={getLinkClassName}>
            <BeakerIcon className="h-5 w-5 mr-3" />
            Games (Debug)
          </NavLink>
          
          {/* Player Management Section */}
          <div className="mt-6 mb-2">
            <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Players
            </p>
          </div>
          
          <NavLink to="/players" className={getLinkClassName}>
            <UserGroupIcon className="h-5 w-5 mr-3" />
            Players (Debug)
          </NavLink>
        </div>
      </nav>
      
      <div className="p-4 border-t">
        {/* Migration Notice (Removed) */}
        {/* <div className="mb-2 p-2 bg-yellow-50 rounded-lg"> ... </div> */}
        <p className="text-xs text-gray-500">© 2025 Top Set Ventures</p>
      </div>
    </aside>
  );
};
