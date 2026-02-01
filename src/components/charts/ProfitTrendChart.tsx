// src/components/charts/ProfitTrendChart.tsx
// VERSION: 1.0.0 - Extracted from VenueGameDetails
//
// Reusable area chart with linear regression trendline.
// Shows profit over time with trend analysis.
//
// Usage:
// <ProfitTrendChart
//   data={chartData}
//   onTrendCalculated={(trend) => setTrendInfo(trend)}
//   height={200}
//   showMissingGames={true}
// />

import React, { useMemo, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

// ---- Types ----

export interface TrendInfo {
  category: 'AT_RISK' | 'SOFTENING' | 'STEADY' | 'UPLIFT' | 'BREAKOUT';
  percentChange: number;
  slope: number;
  startValue: number;
  endValue: number;
  dataPoints: number;
}

export interface ProfitDataPoint {
  id: string;
  date: string;           // Display date (e.g., "15 Jan")
  fullDate?: string;      // ISO date string for tooltip
  profit: number | null;  // null = missing data
  isMissing?: boolean;    // true if game didn't run
  status?: string;        // Game/instance status
  label?: string;         // Optional label for tooltip
}

export interface ProfitTrendChartProps {
  /** Array of profit data points */
  data: ProfitDataPoint[];
  /** Callback when trend is calculated */
  onTrendCalculated?: (trendInfo: TrendInfo) => void;
  /** Chart height in pixels */
  height?: number;
  /** Whether to show gaps for missing games */
  showMissingGames?: boolean;
  /** Custom gradient ID (for multiple charts on same page) */
  gradientId?: string;
  /** Area color */
  areaColor?: string;
  /** Trendline color */
  trendlineColor?: string;
  /** Show Y-axis */
  showYAxis?: boolean;
  /** Format currency values */
  formatCurrency?: (value: number) => string;
}

// ---- Linear Regression Calculation ----

interface Point {
  x: number;
  y: number;
}

export function calculateLinearRegression(points: Point[]): { slope: number; intercept: number } {
  if (points.length < 2) {
    return { slope: 0, intercept: points[0]?.y || 0 };
  }

  const n = points.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;

  for (const point of points) {
    sumX += point.x;
    sumY += point.y;
    sumXY += point.x * point.y;
    sumXX += point.x * point.x;
  }

  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) {
    return { slope: 0, intercept: sumY / n };
  }

  const slope = (n * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

export function calculateTrendInfo(points: Point[]): TrendInfo {
  if (points.length < 2) {
    return {
      category: 'STEADY',
      percentChange: 0,
      slope: 0,
      startValue: points[0]?.y || 0,
      endValue: points[0]?.y || 0,
      dataPoints: points.length,
    };
  }

  const { slope, intercept } = calculateLinearRegression(points);
  
  // Calculate start and end values from trendline
  const startValue = intercept;
  const endValue = slope * (points.length - 1) + intercept;
  
  // Calculate percent change based on trendline
  let percentChange = 0;
  if (startValue !== 0) {
    percentChange = ((endValue - startValue) / Math.abs(startValue)) * 100;
  } else if (endValue !== 0) {
    percentChange = endValue > 0 ? 100 : -100;
  }

  // Determine category based on percent change
  let category: TrendInfo['category'];
  if (percentChange < -25) {
    category = 'AT_RISK';
  } else if (percentChange < -10) {
    category = 'SOFTENING';
  } else if (percentChange > 40) {
    category = 'BREAKOUT';
  } else if (percentChange > 15) {
    category = 'UPLIFT';
  } else {
    category = 'STEADY';
  }

  return {
    category,
    percentChange,
    slope,
    startValue,
    endValue,
    dataPoints: points.length,
  };
}

// ---- Trend Badge Component ----

export interface TrendBadgeProps {
  trendInfo: TrendInfo | null;
  showPercent?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

const TREND_COLORS: Record<TrendInfo['category'], { bg: string; text: string; label: string }> = {
  AT_RISK: { bg: 'bg-red-100', text: 'text-red-700', label: 'At Risk' },
  SOFTENING: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Softening' },
  STEADY: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Steady' },
  UPLIFT: { bg: 'bg-green-100', text: 'text-green-700', label: 'Uplift' },
  BREAKOUT: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Breakout' },
};

export const TrendBadge: React.FC<TrendBadgeProps> = ({ 
  trendInfo, 
  showPercent = true,
  size = 'md' 
}) => {
  if (!trendInfo) return null;

  const colors = TREND_COLORS[trendInfo.category];
  const sizeClasses = {
    sm: 'text-xs px-1.5 py-0.5',
    md: 'text-sm px-2 py-1',
    lg: 'text-base px-3 py-1.5',
  };

  return (
    <span className={`inline-flex items-center gap-1 rounded-full font-medium ${colors.bg} ${colors.text} ${sizeClasses[size]}`}>
      {colors.label}
      {showPercent && trendInfo.percentChange !== 0 && (
        <span className="opacity-75">
          ({trendInfo.percentChange > 0 ? '+' : ''}{trendInfo.percentChange.toFixed(0)}%)
        </span>
      )}
    </span>
  );
};

// ---- Chart Legend Component ----

export interface TrendChartLegendProps {
  areaColor?: string;
  trendlineColor?: string;
}

export const TrendChartLegend: React.FC<TrendChartLegendProps> = ({
  areaColor = '#6366f1',
  trendlineColor = '#10b981',
}) => {
  return (
    <div className="flex items-center gap-4 text-xs text-gray-500">
      <div className="flex items-center gap-1.5">
        <div 
          className="w-3 h-3 rounded-sm" 
          style={{ backgroundColor: areaColor, opacity: 0.3 }}
        />
        <span>Profit/Loss</span>
      </div>
      <div className="flex items-center gap-1.5">
        <div 
          className="w-4 h-0.5" 
          style={{ 
            backgroundColor: trendlineColor, 
            borderStyle: 'dashed',
            borderWidth: '1px',
            borderColor: trendlineColor
          }}
        />
        <span>Trend</span>
      </div>
    </div>
  );
};

// ---- Default Currency Formatter ----

const defaultFormatCurrency = (value: number): string => {
  const absValue = Math.abs(value);
  let formatted: string;
  if (absValue >= 1000) {
    formatted = `$${(absValue / 1000).toFixed(1)}k`;
  } else {
    formatted = `$${absValue.toFixed(0)}`;
  }
  return value < 0 ? `(${formatted})` : formatted;
};

// ---- Main Chart Component ----

export const ProfitTrendChart: React.FC<ProfitTrendChartProps> = ({
  data,
  onTrendCalculated,
  height = 200,
  showMissingGames = true,
  gradientId = 'profitGradient',
  areaColor = '#6366f1',
  trendlineColor = '#10b981',
  showYAxis = true,
  formatCurrency = defaultFormatCurrency,
}) => {
  // Calculate chart data with trendline
  const { chartData, trendInfo } = useMemo(() => {
    // Collect profit data points for regression (excluding missing)
    const profitPoints: Point[] = [];
    
    data.forEach((item, index) => {
      if (item.profit !== null && !item.isMissing) {
        profitPoints.push({ x: index, y: item.profit });
      }
    });

    // Calculate linear regression
    const { slope, intercept } = calculateLinearRegression(profitPoints);
    const trendInfo = calculateTrendInfo(profitPoints);

    // Add trendline values to each data point
    const chartData = data.map((item, index) => ({
      ...item,
      trendline: slope * index + intercept,
      // Set profit to null for missing games if not showing them
      displayProfit: showMissingGames || !item.isMissing ? item.profit : null,
    }));

    return { chartData, trendInfo };
  }, [data, showMissingGames]);

  // Notify parent of trend calculation
  useEffect(() => {
    if (onTrendCalculated) {
      onTrendCalculated(trendInfo);
    }
  }, [trendInfo, onTrendCalculated]);

  if (chartData.length === 0) {
    return (
      <div 
        className="flex items-center justify-center text-gray-400"
        style={{ height }}
      >
        No data available
      </div>
    );
  }

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const dataPoint = payload[0]?.payload;
      return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-lg p-3 text-sm">
          <p className="font-medium text-gray-700 mb-1">
            {dataPoint?.fullDate 
              ? format(parseISO(dataPoint.fullDate), 'dd MMM yyyy') 
              : label}
          </p>
          {dataPoint?.isMissing ? (
            <p className="text-gray-400">
              {dataPoint?.status === 'CANCELLED' ? 'Cancelled' : 
               dataPoint?.status === 'INITIATING' ? 'Did not run' :
               'No data'}
            </p>
          ) : (
            <p className={`${(dataPoint?.profit ?? 0) >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
              P/L: {formatCurrency(dataPoint?.profit ?? 0)}
            </p>
          )}
          {dataPoint?.label && (
            <p className="text-gray-500 text-xs mt-1">{dataPoint.label}</p>
          )}
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={areaColor} stopOpacity={0.3} />
            <stop offset="95%" stopColor={areaColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
        <XAxis 
          dataKey="date" 
          tick={{ fontSize: 11 }} 
          stroke="#9ca3af"
          interval="preserveStartEnd"
        />
        {showYAxis && (
          <YAxis 
            tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
            tick={{ fontSize: 11 }} 
            stroke="#9ca3af"
          />
        )}
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" />
        
        {/* Area for profit */}
        <Area
          type="monotone"
          dataKey="displayProfit"
          stroke={areaColor}
          strokeWidth={2}
          fill={`url(#${gradientId})`}
          connectNulls={false}
        />
        
        {/* Trendline */}
        <Line 
          type="linear" 
          dataKey="trendline" 
          stroke={trendlineColor} 
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
          activeDot={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

// ---- Combined Chart Section Component ----

export interface ProfitTrendChartSectionProps {
  data: ProfitDataPoint[];
  title?: string;
  showLegend?: boolean;
  showBadge?: boolean;
  height?: number;
  className?: string;
}

export const ProfitTrendChartSection: React.FC<ProfitTrendChartSectionProps> = ({
  data,
  title = 'Profit Trend',
  showLegend = true,
  showBadge = true,
  height = 200,
  className = '',
}) => {
  const [trendInfo, setTrendInfo] = React.useState<TrendInfo | null>(null);

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
          {showBadge && trendInfo && <TrendBadge trendInfo={trendInfo} size="sm" />}
        </div>
        {showLegend && <TrendChartLegend />}
      </div>
      
      {/* Chart */}
      <ProfitTrendChart
        data={data}
        onTrendCalculated={setTrendInfo}
        height={height}
      />
    </div>
  );
};

// ---- Helper to convert RecurringGameInstance data to chart format ----

export interface GameInstanceForChart {
  id: string;
  expectedDate?: string;
  status?: string;
  game?: {
    gameStatus?: string;
  } | null;
  financialSnapshot?: {
    netProfit?: number;
  } | null;
}

export function convertInstancesToChartData(
  instances: GameInstanceForChart[]
): ProfitDataPoint[] {
  // Sort by date (oldest first)
  const sorted = [...instances].sort((a, b) => {
    const dateA = a.expectedDate || '';
    const dateB = b.expectedDate || '';
    return dateA.localeCompare(dateB);
  });

  return sorted.map((inst) => {
    const hasData = inst.status === 'CONFIRMED' && inst.game && inst.financialSnapshot;
    const profit = hasData ? (inst.financialSnapshot?.netProfit ?? 0) : null;
    const isMissing = inst.status !== 'CONFIRMED' || !inst.game;
    
    let displayDate = '';
    try {
      if (inst.expectedDate) {
        displayDate = format(parseISO(inst.expectedDate), 'dd MMM');
      }
    } catch {
      displayDate = '';
    }

    return {
      id: inst.id,
      date: displayDate,
      fullDate: inst.expectedDate,
      profit,
      isMissing,
      status: inst.status || inst.game?.gameStatus,
    };
  });
}

// ---- Export all ----

export default ProfitTrendChart;
