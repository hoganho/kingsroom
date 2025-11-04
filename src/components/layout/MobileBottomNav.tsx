// src/components/layout/MobileBottomNav.tsx - Fixed with correct route paths

import { NavLink } from 'react-router-dom';
import {
  HomeIcon,
  UserGroupIcon,
  TrophyIcon,
  BeakerIcon,
  BuildingOffice2Icon,
  WrenchIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../contexts/AuthContext';

const MobileBottomNav = () => {
  const { userRole } = useAuth();
  
  // Define nav items with proper paths matching App.tsx routes
  const navItems = [
    { to: '/home', label: 'Home', icon: HomeIcon },
    { to: '/players/dashboard', label: 'Players', icon: UserGroupIcon },
    { to: '/games/dashboard', label: 'Games', icon: BeakerIcon },
    { to: '/venues/dashboard', label: 'Venues', icon: BuildingOffice2Icon },
    { to: '/series/dashboard', label: 'Series', icon: TrophyIcon },
  ];

  // Add Scraper Admin for SuperAdmin users
  if (userRole === 'SuperAdmin') {
    navItems.push({ 
      to: '/scraper/admin',  // Correct path matching App.tsx route
      label: 'Scraper', 
      icon: WrenchIcon 
    });
  }

  const getLinkClassName = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center justify-center pt-2 pb-1 w-full text-xs font-medium transition-colors ${
      isActive
        ? 'text-indigo-600'
        : 'text-gray-500 hover:text-gray-900'
    }`;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center justify-around border-t border-gray-200 bg-white md:hidden">
      {navItems.slice(0, 6).map((item) => (
        <NavLink to={item.to} className={getLinkClassName} key={item.to}>
          <item.icon className="h-6 w-6" />
          <span className="mt-1">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
};

export { MobileBottomNav };