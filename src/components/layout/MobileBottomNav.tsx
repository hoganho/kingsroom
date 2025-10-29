import { NavLink } from 'react-router-dom';
import {
  HomeIcon, // 1. Import the HomeIcon
  QueueListIcon,
  DocumentMagnifyingGlassIcon,
  BuildingOffice2Icon,
  TrophyIcon,
  UserGroupIcon,
} from '@heroicons/react/24/outline';

const navItems = [
  { to: '/home', label: 'Home', icon: HomeIcon }, // 2. Add the "Home" item
  { to: '/scraper-dashboard', label: 'Tracker', icon: QueueListIcon },
  { to: '/bulk-scraper', label: 'Bulk', icon: DocumentMagnifyingGlassIcon },
  { to: '/venues', label: 'Venues', icon: BuildingOffice2Icon },
  { to: '/series-management', label: 'Series', icon: TrophyIcon },
  { to: '/players', label: 'Players', icon: UserGroupIcon },
];

const getLinkClassName = ({ isActive }: { isActive: boolean }) =>
  `flex flex-col items-center justify-center pt-2 pb-1 w-full text-xs font-medium transition-colors ${
    isActive
      ? 'text-indigo-600'
      : 'text-gray-500 hover:text-gray-900'
  }`;

export const MobileBottomNav = () => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex h-16 items-center justify-around border-t border-gray-200 bg-white md:hidden">
      {navItems.map((item) => (
        <NavLink to={item.to} className={getLinkClassName} key={item.to}>
          <item.icon className="h-6 w-6" />
          <span className="mt-1">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
};