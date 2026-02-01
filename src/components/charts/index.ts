// src/components/charts/index.ts
// Barrel export for chart components

export {
  ProfitTrendChart,
  ProfitTrendChartSection,
  TrendBadge,
  TrendChartLegend,
  calculateLinearRegression,
  calculateTrendInfo,
  convertInstancesToChartData,
} from './ProfitTrendChart';

export type {
  TrendInfo,
  ProfitDataPoint,
  ProfitTrendChartProps,
  TrendBadgeProps,
  TrendChartLegendProps,
  ProfitTrendChartSectionProps,
  GameInstanceForChart,
} from './ProfitTrendChart';
