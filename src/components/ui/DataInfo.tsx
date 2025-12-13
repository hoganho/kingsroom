// src/components/ui/DataInfo.tsx
import React from 'react';

interface DataInfoItem {
  label: string;
  value: string | number;
  /** Optional subtext (e.g., "3 pages") */
  subtext?: string;
}

interface DataInfoProps {
  items: DataInfoItem[];
  /** Additional class names */
  className?: string;
}

/**
 * DataInfo - Mobile-first component for displaying data/pagination info
 * 
 * Layout:
 * - Mobile: Wraps naturally with smaller text
 * - Desktop: Inline with separators
 * 
 * Usage:
 * <DataInfo items={[
 *   { label: 'Venues', value: 8, subtext: '1 page' },
 *   { label: 'Snapshots', value: '473 of 1220', subtext: '4 pages' },
 * ]} />
 */
export const DataInfo: React.FC<DataInfoProps> = ({ items, className = '' }) => {
  if (items.length === 0) return null;

  return (
    <div 
      className={`
        flex flex-wrap items-center gap-x-3 gap-y-1
        text-[11px] sm:text-xs text-gray-500
        ${className}
      `}
    >
      {items.map((item, index) => (
        <React.Fragment key={item.label}>
          {index > 0 && (
            <span className="hidden sm:inline text-gray-300">•</span>
          )}
          <span className="inline-flex items-center gap-1">
            <span className="font-medium text-gray-600">{item.label}:</span>
            <span>{item.value}</span>
            {item.subtext && (
              <span className="text-gray-400">({item.subtext})</span>
            )}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
};

export default DataInfo;
