// src/components/layout/Sidebar.tsx

import { NavLink } from 'react-router-dom';
import {
  HomeIcon,
  DocumentMagnifyingGlassIcon,
  QueueListIcon,
  BuildingOffice2Icon,
  TrophyIcon,
  UserGroupIcon,
  CpuChipIcon,  // ✅ NEW: Added icon for Auto Scraper
} from '@heroicons/react/24/outline';
// ✅ REMOVED: No longer importing the logo here.

const getLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
    isActive
      ? 'bg-indigo-600 text-white'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
  }`;

export const Sidebar = () => {
  // ✅ NEW: Access the build version from the environment variable.
  // This will be automatically injected by the Vite build process.
  const buildVersion = import.meta.env.VITE_BUILD_VERSION || 'dev';

  return (
    <aside className="md:fixed md:inset-y-0 md:left-0 md:z-30 flex w-64 flex-col border-r bg-white">
      {/* ✅ CHANGE: Replaced the logo with the build version text */}
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
          <NavLink to="/scraper-dashboard" className={getLinkClassName}>
            <QueueListIcon className="h-5 w-5 mr-3" />
            Tracker Dashboard
          </NavLink>
          <NavLink to="/bulk-scraper" className={getLinkClassName}>
            <DocumentMagnifyingGlassIcon className="h-5 w-5 mr-3" />
            Bulk Fetcher
          </NavLink>
          {/* ✅ NEW: Added Auto Scraper link */}
          <NavLink to="/auto-scraper" className={getLinkClassName}>
            <CpuChipIcon className="h-5 w-5 mr-3" />
            Auto Scraper
          </NavLink>
          <NavLink to="/venues" className={getLinkClassName}>
            <BuildingOffice2Icon className="h-5 w-5 mr-3" />
            Venues
          </NavLink>
          <NavLink to="/series-management" className={getLinkClassName}>
            <TrophyIcon className="h-5 w-5 mr-3" />
            Series Management
          </NavLink>
          <NavLink to="/players" className={getLinkClassName}>
            <UserGroupIcon className="h-5 w-5 mr-3" />
            Players (Debug)
          </NavLink>
        </div>
      </nav>
      <div className="p-4 border-t">
        <p className="text-xs text-gray-500">© 2025 Top Set Ventures</p>
      </div>
    </aside>
  );
};