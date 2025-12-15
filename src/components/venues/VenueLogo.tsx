// src/components/venues/VenueLogo.tsx

import React from 'react';
import { BuildingOffice2Icon } from '@heroicons/react/24/outline';

interface VenueLogoProps {
  logo?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  showBorder?: boolean;
}

const sizeClasses = {
  xs: 'w-8 h-8',
  sm: 'w-10 h-10',
  md: 'w-12 h-12',
  lg: 'w-14 h-14',
  xl: 'w-20 h-20',
};

const iconSizeClasses = {
  xs: 'w-4 h-4',
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
  lg: 'w-7 h-7',
  xl: 'w-10 h-10',
};

const textSizeClasses = {
  xs: 'text-xs',
  sm: 'text-sm',
  md: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
};

/**
 * VenueLogo - Displays venue logo or fallback avatar
 * 
 * Follows the same pattern as SocialPulse profile images:
 * - Shows uploaded logo if available
 * - Falls back to gradient circle with icon or initials
 */
export const VenueLogo: React.FC<VenueLogoProps> = ({
  logo,
  name,
  size = 'md',
  className = '',
  showBorder = true,
}) => {
  const containerClass = `${sizeClasses[size]} rounded-full flex-shrink-0 ${className}`;
  const borderClass = showBorder ? 'ring-2 ring-gray-100 dark:ring-gray-800' : '';

  // Get initials from venue name (first letter, or first two letters of first word)
  const getInitials = (venueName: string): string => {
    if (!venueName) return '?';
    const words = venueName.trim().split(' ');
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase();
    }
    return venueName.substring(0, 2).toUpperCase();
  };

  if (logo) {
    return (
      <img
        src={logo}
        alt={name}
        className={`${containerClass} object-cover ${borderClass}`}
      />
    );
  }

  // Fallback - gradient background with icon or initials
  return (
    <div
      className={`${containerClass} bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-700 dark:to-gray-800 flex items-center justify-center ${borderClass}`}
      title={name}
    >
      {size === 'xs' || size === 'sm' ? (
        <BuildingOffice2Icon className={`${iconSizeClasses[size]} text-gray-400 dark:text-gray-500`} />
      ) : (
        <span className={`${textSizeClasses[size]} font-semibold text-gray-500 dark:text-gray-400`}>
          {getInitials(name)}
        </span>
      )}
    </div>
  );
};

/**
 * VenueLogoWithBadge - Venue logo with an overlaid badge icon
 * Similar to SocialPulse's profile image with platform badge
 */
interface VenueLogoWithBadgeProps extends VenueLogoProps {
  badge?: React.ReactNode;
  badgePosition?: 'bottom-right' | 'top-right';
}

export const VenueLogoWithBadge: React.FC<VenueLogoWithBadgeProps> = ({
  badge,
  badgePosition = 'bottom-right',
  ...logoProps
}) => {
  const positionClasses = {
    'bottom-right': '-bottom-1 -right-1',
    'top-right': '-top-1 -right-1',
  };

  return (
    <div className="relative inline-block">
      <VenueLogo {...logoProps} />
      {badge && (
        <div
          className={`absolute ${positionClasses[badgePosition]} w-5 h-5 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm border border-gray-100 dark:border-gray-700`}
        >
          {badge}
        </div>
      )}
    </div>
  );
};

export default VenueLogo;