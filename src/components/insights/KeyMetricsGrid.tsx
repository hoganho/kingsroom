// components/insights/KeyMetricsGrid.tsx
// Key metrics display grid for AI Insights

import React from 'react';
import { Card } from '../ui/Card';
import type { KeyMetrics, StrategicMetrics } from '../../types/insights';

interface KeyMetricsGridProps {
  metrics: KeyMetrics | StrategicMetrics;
  showInsights?: boolean;
}

// Check if it's AI-generated KeyMetrics (with insight property)
function isKeyMetrics(metrics: any): metrics is KeyMetrics {
  return metrics && typeof metrics.revenue === 'object' && 'insight' in metrics.revenue;
}

// Format currency
const formatCurrency = (value: number | undefined): string => {
  if (value === undefined || value === null) return '-';
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
};

// Format percentage
const formatPercent = (value: number | undefined): string => {
  if (value === undefined || value === null) return '-';
  return `${value.toFixed(1)}%`;
};

// Format number
const formatNumber = (value: number | undefined): string => {
  if (value === undefined || value === null) return '-';
  return value.toLocaleString();
};

// Trend indicator component
const TrendIndicator: React.FC<{ 
  deltaPercent?: number; 
  trend?: 'UP' | 'DOWN' | 'FLAT' 
}> = ({ deltaPercent, trend }) => {
  const effectiveTrend = trend || (deltaPercent !== undefined ? (deltaPercent > 0 ? 'UP' : deltaPercent < 0 ? 'DOWN' : 'FLAT') : undefined);
  
  if (!effectiveTrend || effectiveTrend === 'FLAT') {
    return deltaPercent !== undefined ? (
      <span className="text-gray-500 text-sm">→ {deltaPercent.toFixed(1)}%</span>
    ) : null;
  }
  
  const isUp = effectiveTrend === 'UP';
  return (
    <span className={`text-sm ${isUp ? 'text-green-600' : 'text-red-600'}`}>
      {isUp ? '↑' : '↓'} {deltaPercent !== undefined ? `${Math.abs(deltaPercent).toFixed(1)}%` : ''}
    </span>
  );
};

// Single metric card component
const MetricCard: React.FC<{
  label: string;
  value: string;
  delta?: number;
  deltaPercent?: number;
  trend?: 'UP' | 'DOWN' | 'FLAT';
  insight?: string;
  showInsight?: boolean;
}> = ({ label, value, delta, deltaPercent, trend, insight, showInsight }) => {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="text-sm font-medium text-gray-500 mb-1">{label}</div>
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-gray-900">{value}</span>
        <TrendIndicator deltaPercent={deltaPercent} trend={trend} />
      </div>
      {delta !== undefined && (
        <div className="text-sm text-gray-500 mt-1">
          {delta >= 0 ? '+' : ''}{formatCurrency(delta)} vs prior
        </div>
      )}
      {showInsight && insight && (
        <p className="text-sm text-gray-600 mt-2 border-t pt-2">{insight}</p>
      )}
    </div>
  );
};

export const KeyMetricsGrid: React.FC<KeyMetricsGridProps> = ({ metrics, showInsights = false }) => {
  if (!metrics) return null;

  // AI-generated KeyMetrics format
  if (isKeyMetrics(metrics)) {
    return (
      <Card className="p-6">
        <h3 className="text-lg font-semibold mb-4">Key Metrics</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <MetricCard
            label="Revenue"
            value={formatCurrency(metrics.revenue?.value)}
            delta={metrics.revenue?.delta}
            deltaPercent={metrics.revenue?.deltaPercent}
            trend={metrics.revenue?.trend}
            insight={metrics.revenue?.insight}
            showInsight={showInsights}
          />
          <MetricCard
            label="Profit"
            value={formatCurrency(metrics.profit?.value)}
            delta={metrics.profit?.delta}
            deltaPercent={metrics.profit?.deltaPercent}
            trend={metrics.profit?.trend}
            insight={metrics.profit?.insight}
            showInsight={showInsights}
          />
          <MetricCard
            label="Entries"
            value={formatNumber(metrics.entries?.value)}
            delta={metrics.entries?.delta}
            deltaPercent={metrics.entries?.deltaPercent}
            trend={metrics.entries?.trend}
            insight={metrics.entries?.insight}
            showInsight={showInsights}
          />
          <MetricCard
            label="Profit Margin"
            value={formatPercent(metrics.profitMargin?.value)}
            delta={metrics.profitMargin?.delta}
            trend={metrics.profitMargin?.trend}
            insight={metrics.profitMargin?.insight}
            showInsight={showInsights}
          />
          <MetricCard
            label="Run Rate"
            value={formatNumber(metrics.runRate?.value)}
            delta={metrics.runRate?.delta}
            trend={metrics.runRate?.trend}
            insight={metrics.runRate?.insight}
            showInsight={showInsights}
          />
        </div>
      </Card>
    );
  }

  // Raw StrategicMetrics format from MetricsPack
  const strategic = metrics as StrategicMetrics;
  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">Key Metrics</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <MetricCard
          label="Revenue"
          value={formatCurrency(strategic.totalRevenue)}
          delta={strategic.deltas?.totalRevenue}
          deltaPercent={strategic.deltas?.totalRevenuePercent}
        />
        <MetricCard
          label="Profit"
          value={formatCurrency(strategic.netProfit)}
          delta={strategic.deltas?.netProfit}
          deltaPercent={strategic.deltas?.netProfitPercent}
        />
        <MetricCard
          label="Entries"
          value={formatNumber(strategic.totalEntries)}
          delta={strategic.deltas?.totalEntries}
          deltaPercent={strategic.deltas?.totalEntriesPercent}
        />
        <MetricCard
          label="Profit Margin"
          value={formatPercent(strategic.profitMargin)}
          delta={strategic.deltas?.profitMargin}
        />
        <MetricCard
          label="Run Rate"
          value={formatNumber(strategic.runRate)}
          delta={strategic.deltas?.runRate}
        />
      </div>
      
      {/* Additional raw metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4 border-t">
        <div>
          <div className="text-sm text-gray-500">Games Run</div>
          <div className="font-semibold">{strategic.totalGamesRun}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500">Games Cancelled</div>
          <div className="font-semibold">{strategic.totalGamesCancelled}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500">Unique Players</div>
          <div className="font-semibold">{strategic.totalUniquePlayers}</div>
        </div>
        <div>
          <div className="text-sm text-gray-500">Guarantee Coverage</div>
          <div className="font-semibold">{formatPercent(strategic.guaranteeCoverageRate)}</div>
        </div>
      </div>
    </Card>
  );
};

export default KeyMetricsGrid;
