// src/components/layout/MobileBottomNav.tsx
import { NavLink } from 'react-router-dom';
import {
  HomeIcon,
  UserGroupIcon,
  TrophyIcon,
  BeakerIcon,
  BuildingOffice2Icon,
  WrenchIcon,
} from '@heroicons/react/24/outline';
import { useUserPermissions } from '../../hooks/useUserPermissions';

// CHANGED: Added 'export' keyword here and removed 'export default' at the bottom
export const MobileBottomNav = () => {
  const { canAccess, isSuperAdmin } = useUserPermissions();
  
  // Base navigation items
  const allNavItems = [
    { to: '/home', label: 'Home', icon: HomeIcon },
    { to: '/players/dashboard', label: 'Players', icon: UserGroupIcon },
    { to: '/games/dashboard', label: 'Games', icon: BeakerIcon },
    { to: '/venues/dashboard', label: 'Venues', icon: BuildingOffice2Icon },
    { to: '/series/dashboard', label: 'Series', icon: TrophyIcon },
    { to: '/scraper/admin', label: 'Scraper', icon: WrenchIcon },
  ];

  // Filter items based on permissions
  const navItems = allNavItems.filter(item => {
    // Special handling for Scraper which is Super Admin only
    if (item.to === '/scraper/admin' && !isSuperAdmin) return false;
    return canAccess(item.to);
  });

  const getLinkClassName = ({ isActive }: { isActive: boolean }) =>
    `flex flex-col items-center justify-center w-full h-full space-y-1 ${
      isActive ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-900'
    }`;

  if (navItems.length === 0) return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 pb-safe z-50">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={getLinkClassName}
          >
            <item.icon className="h-6 w-6" />
            <span className="text-[10px] font-medium">{item.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
};