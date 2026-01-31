// src/components/dashboard/SectionHeader.tsx
// Header for game sections with icon, count, and optional refresh button

import React from 'react';
import { ArrowPathIcon } from '@heroicons/react/24/outline';
import { Button } from '@/components/ui/Button';
import { cx } from '@/lib/utils';

interface SectionHeaderProps {
  title: string;
  count: number;
  icon: React.ReactNode;
  colorClass?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const SectionHeader: React.FC<SectionHeaderProps> = ({ 
  title, 
  count, 
  icon, 
  colorClass = 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
  onRefresh,
  isRefreshing,
}) => {
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-3">
        <div className={cx("flex items-center justify-center w-10 h-10 rounded-lg", colorClass)}>
          {icon}
        </div>
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-gray-900 dark:text-gray-50">{title}</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {count} game{count !== 1 ? 's' : ''}
          </p>
        </div>
      </div>
      
      {onRefresh && (
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onRefresh} 
          disabled={isRefreshing}
          className="text-gray-500 hover:text-indigo-600"
        >
          <ArrowPathIcon className={cx("w-4 h-4", isRefreshing && "animate-spin")} />
        </Button>
      )}
    </div>
  );
};
