// components/insights/WeeklyMetricsGrid.tsx
import React from 'react';
import { TrendingUp, TrendingDown, Minus, DollarSign, Users, Percent, Calendar, BarChart3 } from 'lucide-react';
import type { WeeklyMetrics, MetricDetail } from '../../types/insights';

interface WeeklyMetricsGridProps { metrics: WeeklyMetrics; showInsights?: boolean; }

const formatCurrency = (value: number): string => { const isNeg = value < 0; const f = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(Math.abs(value)); return isNeg ? `-${f}` : f; };
const formatPercent = (value: number): string => `${value.toFixed(1)}%`;
const formatNumber = (value: number): string => value.toLocaleString('en-AU', { maximumFractionDigits: 1 });

const TrendIndicator: React.FC<{ change?: number; changePercent?: number; trend?: 'UP' | 'DOWN' | 'FLAT'; invertColors?: boolean }> = ({ change, changePercent, trend, invertColors = false }) => {
  const effectiveTrend = trend || (changePercent !== undefined ? (changePercent > 0 ? 'UP' : changePercent < 0 ? 'DOWN' : 'FLAT') : change !== undefined ? (change > 0 ? 'UP' : change < 0 ? 'DOWN' : 'FLAT') : undefined);
  if (!effectiveTrend || effectiveTrend === 'FLAT') { return changePercent !== undefined ? <span className="flex items-center gap-1 text-gray-500 text-sm"><Minus className="w-4 h-4" />{changePercent.toFixed(1)}%</span> : null; }
  const isUp = effectiveTrend === 'UP';
  const isPositive = invertColors ? !isUp : isUp;
  return <span className={`flex items-center gap-1 text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>{isUp ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}{changePercent !== undefined && `${Math.abs(changePercent).toFixed(1)}%`}</span>;
};

interface MetricCardProps { label: string; value: string; icon: React.ReactNode; iconBg: string; metric: MetricDetail; showInsight?: boolean; valueColor?: string; }

const MetricCard: React.FC<MetricCardProps> = ({ label, value, icon, iconBg, metric, showInsight, valueColor }) => (
  <div className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-shadow">
    <div className="flex items-center justify-between mb-2"><div className={`p-2 rounded-lg ${iconBg}`}>{icon}</div><TrendIndicator change={metric.change} changePercent={metric.changePercent} trend={metric.trend} /></div>
    <div className="mt-3"><div className="text-sm font-medium text-gray-500 mb-1">{label}</div><div className={`text-2xl font-bold ${valueColor || 'text-gray-900'}`}>{value}</div></div>
    {metric.change !== undefined && <div className="text-xs text-gray-500 mt-1">{metric.change >= 0 ? '+' : ''}{formatCurrency(metric.change)} vs prior</div>}
    {showInsight && metric.insight && <div className="mt-3 pt-3 border-t border-gray-100"><p className="text-sm text-gray-600">{metric.insight}</p></div>}
  </div>
);

export const WeeklyMetricsGrid: React.FC<WeeklyMetricsGridProps> = ({ metrics, showInsights = false }) => {
  if (!metrics) return null;
  const profitValue = metrics.profit?.value || 0;
  const profitColor = profitValue < 0 ? 'text-red-600' : profitValue > 0 ? 'text-green-600' : 'text-gray-900';
  const marginValue = metrics.margin?.value || 0;
  const marginColor = marginValue < 0 ? 'text-red-600' : marginValue >= 20 ? 'text-green-600' : 'text-gray-900';

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Metrics</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard label="Revenue" value={formatCurrency(metrics.revenue?.value || 0)} icon={<DollarSign className="w-5 h-5 text-blue-600" />} iconBg="bg-blue-100" metric={metrics.revenue || { value: 0 }} showInsight={showInsights} />
        <MetricCard label="Profit" value={formatCurrency(metrics.profit?.value || 0)} icon={<TrendingUp className="w-5 h-5 text-green-600" />} iconBg="bg-green-100" metric={metrics.profit || { value: 0 }} showInsight={showInsights} valueColor={profitColor} />
        <MetricCard label="Margin" value={formatPercent(metrics.margin?.value || 0)} icon={<Percent className="w-5 h-5 text-purple-600" />} iconBg="bg-purple-100" metric={metrics.margin || { value: 0 }} showInsight={showInsights} valueColor={marginColor} />
        <MetricCard label="Entries" value={formatNumber(metrics.entries?.value || 0)} icon={<Users className="w-5 h-5 text-amber-600" />} iconBg="bg-amber-100" metric={metrics.entries || { value: 0 }} showInsight={showInsights} />
        <MetricCard label="Games Run" value={formatNumber(metrics.gamesRun?.value || 0)} icon={<Calendar className="w-5 h-5 text-indigo-600" />} iconBg="bg-indigo-100" metric={metrics.gamesRun || { value: 0 }} showInsight={showInsights} />
        <MetricCard label="Avg/Game" value={formatNumber(metrics.avgEntriesPerGame?.value || 0)} icon={<BarChart3 className="w-5 h-5 text-cyan-600" />} iconBg="bg-cyan-100" metric={metrics.avgEntriesPerGame || { value: 0 }} showInsight={showInsights} />
      </div>
    </div>
  );
};

export default WeeklyMetricsGrid;
