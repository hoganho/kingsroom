// src/pages/players/player-tabs/EngagementTab.tsx
// Engagement & Churn Tab - Engagement funnel, churn metrics, targeting classification

import React from 'react';
import {
  ArrowTrendingUpIcon,
} from '@heroicons/react/24/outline';

import { formatNumber } from '../../../lib/utils';
import type { GlobalPlayerMetrics } from './shared';
import { FunnelBar } from './shared';

// ============================================================================
// Props
// ============================================================================

export interface EngagementTabProps {
  globalMetrics: GlobalPlayerMetrics;
  churnedTotal: number;
  atRiskTotal: number;
  churnRate: string;
}

// ============================================================================
// Component
// ============================================================================

export const EngagementTab: React.FC<EngagementTabProps> = ({
  globalMetrics,
  churnedTotal,
  atRiskTotal,
  churnRate,
}) => (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
    {/* Engagement Funnel */}
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
        <ArrowTrendingUpIcon className="h-5 w-5 text-emerald-500" />
        Player Engagement Funnel
      </h3>
      <div className="space-y-4">
        <FunnelBar
          label="Active (Last 30 days)"
          count={globalMetrics.activeELCount + globalMetrics.activeCount}
          total={globalMetrics.totalPlayers}
          color="bg-emerald-500"
          description="Last 30 days"
        />
        <FunnelBar
          label="At Risk - 31-60 days inactive"
          count={globalMetrics.retain31to60Count}
          total={globalMetrics.totalPlayers}
          color="bg-yellow-500"
          description="Retention target"
        />
        <FunnelBar
          label="At Risk - 61-90 days inactive"
          count={globalMetrics.retain61to90Count}
          total={globalMetrics.totalPlayers}
          color="bg-orange-500"
          description="Urgent retention"
        />
        <FunnelBar
          label="Churned - 91-120 days"
          count={globalMetrics.churned91to120Count}
          total={globalMetrics.totalPlayers}
          color="bg-red-400"
          description="Recently churned"
        />
        <FunnelBar
          label="Churned - 121-180 days"
          count={globalMetrics.churned121to180Count}
          total={globalMetrics.totalPlayers}
          color="bg-red-500"
          description="Medium-term churned"
        />
        <FunnelBar
          label="Churned - 181-360 days"
          count={globalMetrics.churned181to360Count}
          total={globalMetrics.totalPlayers}
          color="bg-red-600"
          description="Long-term churned"
        />
        <FunnelBar
          label="Churned - 361+ days"
          count={globalMetrics.churned361PlusCount}
          total={globalMetrics.totalPlayers}
          color="bg-red-800"
          description="Dormant"
        />
        <FunnelBar
          label="Never Played"
          count={globalMetrics.notPlayedCount}
          total={globalMetrics.totalPlayers}
          color="bg-gray-400"
          description="Registered but no activity"
        />
      </div>
    </div>

    {/* Churn Metrics */}
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-xl p-6 text-white">
          <p className="text-emerald-100 text-sm">Healthy Players</p>
          <p className="text-3xl font-bold mt-1">
            {formatNumber(globalMetrics.activeELCount + globalMetrics.activeCount)}
          </p>
          <p className="text-emerald-200 text-sm mt-2">
            {((( globalMetrics.activeELCount + globalMetrics.activeCount) / globalMetrics.totalPlayers) * 100).toFixed(1)}% of total
          </p>
        </div>
        
        <div className="bg-gradient-to-br from-amber-500 to-orange-500 rounded-xl p-6 text-white">
          <p className="text-amber-100 text-sm">At Risk</p>
          <p className="text-3xl font-bold mt-1">{formatNumber(atRiskTotal)}</p>
          <p className="text-amber-200 text-sm mt-2">
            {((atRiskTotal / globalMetrics.totalPlayers) * 100).toFixed(1)}% need attention
          </p>
        </div>
        
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-xl p-6 text-white">
          <p className="text-red-100 text-sm">Churned</p>
          <p className="text-3xl font-bold mt-1">{formatNumber(churnedTotal)}</p>
          <p className="text-red-200 text-sm mt-2">
            {churnRate}% churn rate
          </p>
        </div>
        
        <div className="bg-gradient-to-br from-gray-500 to-gray-600 rounded-xl p-6 text-white">
          <p className="text-gray-100 text-sm">Never Played</p>
          <p className="text-3xl font-bold mt-1">{formatNumber(globalMetrics.notPlayedCount)}</p>
          <p className="text-gray-200 text-sm mt-2">
            {((globalMetrics.notPlayedCount / globalMetrics.totalPlayers) * 100).toFixed(1)}% unconverted
          </p>
        </div>
      </div>

      {/* Targeting Classification Detail */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Targeting Classification</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
            <div>
              <p className="font-medium text-emerald-800">Active_EL</p>
              <p className="text-xs text-emerald-600">Early lifecycle, active</p>
            </div>
            <p className="text-xl font-bold text-emerald-700">{formatNumber(globalMetrics.activeELCount)}</p>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
            <div>
              <p className="font-medium text-green-800">Active</p>
              <p className="text-xs text-green-600">Established, active</p>
            </div>
            <p className="text-xl font-bold text-green-700">{formatNumber(globalMetrics.activeCount)}</p>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg">
            <div>
              <p className="font-medium text-yellow-800">Retain 31-60d</p>
              <p className="text-xs text-yellow-600">Inactive 31-60 days</p>
            </div>
            <p className="text-xl font-bold text-yellow-700">{formatNumber(globalMetrics.retain31to60Count)}</p>
          </div>
          
          <div className="flex items-center justify-between p-3 bg-orange-50 rounded-lg">
            <div>
              <p className="font-medium text-orange-800">Retain 61-90d</p>
              <p className="text-xs text-orange-600">Inactive 61-90 days</p>
            </div>
            <p className="text-xl font-bold text-orange-700">{formatNumber(globalMetrics.retain61to90Count)}</p>
          </div>
        </div>
      </div>
    </div>
  </div>
);

export default EngagementTab;
