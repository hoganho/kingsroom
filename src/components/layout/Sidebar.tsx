// src/components/layout/Sidebar.tsx - Legacy routes removed

import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  HomeIcon,
  BuildingOffice2Icon,
  TrophyIcon,
  UserGroupIcon,
  CogIcon,
  BeakerIcon, // Added for Games (Debug)
  Bars3Icon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

interface SidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

export const Sidebar = ({ isOpen = false, onClose }: SidebarProps) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(isOpen);
  const location = useLocation();
  const buildVersion = import.meta.env.VITE_BUILD_VERSION || 'dev';

  // Sync with parent's isOpen prop
  useEffect(() => {
    setIsMobileMenuOpen(isOpen);
  }, [isOpen]);

  // Close mobile menu on route change
  useEffect(() => {
    handleCloseMobileMenu();
  }, [location]);

  const handleCloseMobileMenu = () => {
    setIsMobileMenuOpen(false);
    onClose?.();
  };

  const getLinkClassName = ({ isActive }: { isActive: boolean }) =>
    `flex items-center px-4 py-2.5 text-sm font-medium rounded-lg transition-colors ${
      isActive
        ? 'bg-indigo-600 text-white'
        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
    }`;

  // Handle navigation click - auto-dismiss on mobile
  const handleNavClick = () => {
    // Check if we're on mobile (viewport width < 768px)
    if (window.innerWidth < 768) {
      handleCloseMobileMenu();
    }
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
            <NavLink to="/home" className={getLinkClassName} onClick={handleNavClick}>
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
            <NavLink to="/scraper-admin" className={getLinkClassName} onClick={handleNavClick}>
              <CogIcon className="h-5 w-5 mr-3" />
              Scraper Admin
            </NavLink>
            
            {/* Game Management Section */}
            <div className="mt-6 mb-2">
              <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Game Management
              </p>
            </div>
            
            <NavLink to="/venues" className={getLinkClassName} onClick={handleNavClick}>
              <BuildingOffice2Icon className="h-5 w-5 mr-3" />
              Venues
            </NavLink>
            <NavLink to="/series-management" className={getLinkClassName} onClick={handleNavClick}>
              <TrophyIcon className="h-5 w-5 mr-3" />
              Series Management
            </NavLink>
            
            {/* New link for Games (Debug) */}
            <NavLink to="/games" className={getLinkClassName} onClick={handleNavClick}>
              <BeakerIcon className="h-5 w-5 mr-3" />
              Games (Debug)
            </NavLink>
            
            {/* Player Management Section */}
            <div className="mt-6 mb-2">
              <p className="px-4 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Players
              </p>
            </div>
            
            <NavLink to="/players" className={getLinkClassName} onClick={handleNavClick}>
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
    </>
  );
};