// src/components/ui/TrendBadge.tsx
// VERSION: 1.0.0 - Initial release
//
// Shared trend badge component for profit charts
// Calculates trend direction from linear regression and displays categorized badge

import React from 'react';
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  MinusIcon,
  FireIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

// ---- Types ----

export type TrendCategory = 'at-risk' | 'softening' | 'steady' | 'uplift' | 'breakout';

export interface TrendInfo {
  category: TrendCategory;
  label: string;
  percentage: number;
  colorClass: string;
  bgClass: string;
  borderClass: string;
  icon: React.ReactNode;
  tooltip: string;
}

// ---- Trend Calculation ----

/**
 * Calculate trend information from data points using linear regression.
 * 
 * @param data - Array of {x, y} points where x is the index and y is the value
 * @returns TrendInfo object with category, styling, and metadata
 * 
 * Trend Categories:
 * - At Risk:    ≤ -15% change (significant decline)
 * - Softening:  -15% to -5% change (moderate decline)
 * - Steady:     -5% to +5% change (stable)
 * - Uplift:     +5% to +15% change (moderate growth)
 * - Breakout:   ≥ +15% change (strong growth)
 */
export function calculateTrendInfo(data: { x: number; y: number }[]): TrendInfo {
  if (data.length < 2) {
    return {
      category: 'steady',
      label: 'Steady',
      percentage: 0,
      colorClass: 'text-gray-600',
      bgClass: 'bg-gray-100',
      borderClass: 'border-gray-200',
      icon: <MinusIcon className="w-3.5 h-3.5" />,
      tooltip: 'Not enough data to calculate trend',
    };
  }

  // Calculate linear regression
  const n = data.length;
  const sumX = data.reduce((sum, p) => sum + p.x, 0);
  const sumY = data.reduce((sum, p) => sum + p.y, 0);
  const sumXY = data.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumXX = data.reduce((sum, p) => sum + p.x * p.x, 0);
  
  const denominator = n * sumXX - sumX * sumX;
  const slope = denominator !== 0 ? (n * sumXY - sumX * sumY) / denominator : 0;
  const intercept = denominator !== 0 ? (sumY - slope * sumX) / n : sumY / n;
  
  // Calculate percentage change from start to end of trendline
  const startValue = intercept;
  const endValue = slope * (n - 1) + intercept;
  const avgValue = sumY / n;
  
  // Use average as baseline for percentage calculation to avoid division issues
  const baseline = Math.abs(avgValue) > 0 ? Math.abs(avgValue) : 1;
  const totalChange = endValue - startValue;
  const percentage = (totalChange / baseline) * 100;

  // Classify trend based on percentage thresholds
  if (percentage <= -15) {
    return {
      category: 'at-risk',
      label: 'At Risk',
      percentage,
      colorClass: 'text-red-700',
      bgClass: 'bg-red-100',
      borderClass: 'border-red-200',
      icon: <ExclamationTriangleIcon className="w-3.5 h-3.5" />,
      tooltip: `Significant decline: ${percentage.toFixed(1)}% change over period`,
    };
  } else if (percentage <= -5) {
    return {
      category: 'softening',
      label: 'Softening',
      percentage,
      colorClass: 'text-red-600',
      bgClass: 'bg-red-50',
      borderClass: 'border-red-200',
      icon: <ArrowTrendingDownIcon className="w-3.5 h-3.5" />,
      tooltip: `Declining trend: ${percentage.toFixed(1)}% change over period`,
    };
  } else if (percentage < 5) {
    return {
      category: 'steady',
      label: 'Steady',
      percentage,
      colorClass: 'text-gray-600',
      bgClass: 'bg-gray-100',
      borderClass: 'border-gray-200',
      icon: <MinusIcon className="w-3.5 h-3.5" />,
      tooltip: `Stable trend: ${percentage.toFixed(1)}% change over period`,
    };
  } else if (percentage < 15) {
    return {
      category: 'uplift',
      label: 'Uplift',
      percentage,
      colorClass: 'text-green-600',
      bgClass: 'bg-green-50',
      borderClass: 'border-green-200',
      icon: <ArrowTrendingUpIcon className="w-3.5 h-3.5" />,
      tooltip: `Improving trend: +${percentage.toFixed(1)}% change over period`,
    };
  } else {
    return {
      category: 'breakout',
      label: 'Breakout',
      percentage,
      colorClass: 'text-green-700',
      bgClass: 'bg-green-100',
      borderClass: 'border-green-200',
      icon: <FireIcon className="w-3.5 h-3.5" />,
      tooltip: `Strong growth: +${percentage.toFixed(1)}% change over period`,
    };
  }
}

// ---- Linear Regression Helper ----

/**
 * Calculate linear regression coefficients from data points.
 * 
 * @param data - Array of {x, y} points
 * @returns Object with slope and intercept
 */
export function calculateLinearRegression(data: { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = data.length;
  if (n === 0) return { slope: 0, intercept: 0 };
  
  const sumX = data.reduce((sum, p) => sum + p.x, 0);
  const sumY = data.reduce((sum, p) => sum + p.y, 0);
  const sumXY = data.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumXX = data.reduce((sum, p) => sum + p.x * p.x, 0);
  
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return { slope: 0, intercept: sumY / n };
  
  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;
  
  return { slope, intercept };
}

// ---- TrendBadge Component ----

interface TrendBadgeProps {
  trendInfo: TrendInfo;
}

export const TrendBadge: React.FC<TrendBadgeProps> = ({ trendInfo }) => {
  return (
    <span 
      className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full border ${trendInfo.bgClass} ${trendInfo.colorClass} ${trendInfo.borderClass}`}
      title={trendInfo.tooltip}
    >
      {trendInfo.icon}
      {trendInfo.label}
    </span>
  );
};

// ---- Chart Legend Component ----

export const TrendChartLegend: React.FC = () => {
  return (
    <div className="flex items-center gap-4 text-xs text-gray-500">
      <div className="flex items-center gap-1">
        <div className="w-3 h-3 bg-indigo-500/30 border border-indigo-500 rounded" />
        <span>Profit</span>
      </div>
      <div className="flex items-center gap-1">
        <div className="w-4 h-0.5 bg-emerald-500 rounded" style={{ borderTop: '2px dashed #10b981' }} />
        <span>Trend</span>
      </div>
    </div>
  );
};

export default TrendBadge;
