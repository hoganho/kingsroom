// src/components/layout/Sidebar.tsx

import { NavLink } from 'react-router-dom';
import { DocumentMagnifyingGlassIcon, QueueListIcon, BuildingOffice2Icon, TrophyIcon } from '@heroicons/react/24/outline';
import logo from '../../assets/Kings-Room-Logo_web.png'; // 1. Import your logo

const getLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
    isActive
      ? 'bg-indigo-600 text-white'
      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
  }`;

export const Sidebar = () => {
  return (
    <aside className="fixed inset-y-0 left-0 z-10 w-64 flex-col border-r bg-white hidden md:flex">
      {/* 2. Replace the h1 with an img tag for your logo */}
      <div className="flex flex-shrink-0 items-center justify-center px-4 h-16 border-b bg-black">
        <img src={logo} alt="Kings Room Logo" className="h-12 object-contain" />
      </div>

      <nav className="flex flex-1 flex-col overflow-y-auto">
        <div className="p-4 space-y-2">
          <NavLink to="/scraper-dashboard" className={getLinkClassName}>
            <QueueListIcon className="h-5 w-5 mr-3" />
            Tracker Dashboard
          </NavLink>
          <NavLink to="/bulk-scraper" className={getLinkClassName}>
            <DocumentMagnifyingGlassIcon className="h-5 w-5 mr-3" />
            Bulk Fetcher
          </NavLink>
          <NavLink to="/venues" className={getLinkClassName}>
            <BuildingOffice2Icon className="h-5 w-5 mr-3" />
            Venues
          </NavLink>
          <NavLink to="/series-management" className={getLinkClassName}>
            <TrophyIcon className="h-5 w-5 mr-3" />
            Series Management
          </NavLink>
        </div>
      </nav>
      <div className="p-4 border-t">
        <p className="text-xs text-gray-500">© 2025 Top Set Ventures</p>
      </div>
    </aside>
  );
};