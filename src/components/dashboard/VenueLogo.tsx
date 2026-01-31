// src/components/dashboard/VenueLogo.tsx
// Venue logo with fallback to initials

import React from 'react';
import { cx } from '@/lib/utils';

interface VenueLogoProps {
  logo: string | null | undefined;
  name: string | null | undefined;
  size?: 'sm' | 'md';
}

export const VenueLogo: React.FC<VenueLogoProps> = ({ logo, name, size = 'sm' }) => {
  const sizeClasses = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-10 h-10 text-sm';
  
  if (logo) {
    return (
      <img 
        src={logo} 
        alt={name || 'Venue'} 
        className={cx(sizeClasses, "rounded-full object-cover border border-gray-200 dark:border-gray-700 shadow-sm")}
      />
    );
  }
  
  // Fallback to initials
  const initials = name 
    ? name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';
  
  return (
    <div className={cx(
      sizeClasses,
      "rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white font-semibold border border-gray-200 dark:border-gray-700 shadow-sm"
    )}>
      {initials}
    </div>
  );
};
