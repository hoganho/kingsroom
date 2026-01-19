// components/insights/WeekSummaryCard.tsx
import React from 'react';
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, XCircle, Trophy, Target } from 'lucide-react';
import type { WeekSummary, ReportHealthStatus } from '../../types/insights';

interface WeekSummaryCardProps { summary: WeekSummary; }

const healthConfig: Record<ReportHealthStatus, { variant: string; icon: React.ReactNode; bgColor: string; borderColor: string; label: string }> = {
  EXCELLENT: { variant: 'success', icon: <Trophy className="w-6 h-6" />, bgColor: 'bg-green-50', borderColor: 'border-green-200', label: 'Excellent Week' },
  GOOD: { variant: 'success', icon: <CheckCircle2 className="w-6 h-6" />, bgColor: 'bg-green-50', borderColor: 'border-green-200', label: 'Good Week' },
  OK: { variant: 'default', icon: <Target className="w-6 h-6" />, bgColor: 'bg-gray-50', borderColor: 'border-gray-200', label: 'Okay Week' },
  CONCERNING: { variant: 'warning', icon: <AlertTriangle className="w-6 h-6" />, bgColor: 'bg-amber-50', borderColor: 'border-amber-200', label: 'Concerning' },
  NEEDS_ATTENTION: { variant: 'warning', icon: <AlertTriangle className="w-6 h-6" />, bgColor: 'bg-amber-50', borderColor: 'border-amber-200', label: 'Needs Attention' },
  CRITICAL: { variant: 'error', icon: <XCircle className="w-6 h-6" />, bgColor: 'bg-red-50', borderColor: 'border-red-200', label: 'Critical' },
};

export const WeekSummaryCard: React.FC<WeekSummaryCardProps> = ({ summary }) => {
  const config = healthConfig[summary.health] || healthConfig.OK;
  const iconColor = config.variant === 'success' ? 'bg-green-100 text-green-600' : config.variant === 'warning' ? 'bg-amber-100 text-amber-600' : config.variant === 'error' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600';
  const badgeColor = config.variant === 'success' ? 'bg-green-100 text-green-800' : config.variant === 'warning' ? 'bg-amber-100 text-amber-800' : config.variant === 'error' ? 'bg-red-100 text-red-800' : 'bg-gray-100 text-gray-800';

  return (
    <div className={`rounded-xl p-6 ${config.bgColor} ${config.borderColor} border-2`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${iconColor}`}>{config.icon}</div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Weekly Summary</h2>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium mt-1 ${badgeColor}`}>{config.label}</span>
          </div>
        </div>
        {summary.vsLastWeek && (
          <div className="text-right">
            <span className="text-sm text-gray-500">vs Last Week</span>
            <div className="flex items-center gap-1 justify-end mt-1">
              {summary.vsLastWeek.toLowerCase().includes('better') ? <TrendingUp className="w-4 h-4 text-green-500" /> : summary.vsLastWeek.toLowerCase().includes('worse') ? <TrendingDown className="w-4 h-4 text-red-500" /> : null}
              <span className={`text-sm font-medium ${summary.vsLastWeek.toLowerCase().includes('better') ? 'text-green-600' : summary.vsLastWeek.toLowerCase().includes('worse') ? 'text-red-600' : 'text-gray-600'}`}>{summary.vsLastWeek}</span>
            </div>
          </div>
        )}
      </div>
      <p className="text-lg text-gray-800 font-medium mb-4 leading-relaxed">{summary.headline}</p>
      {summary.healthRationale && <p className="text-sm text-gray-600 mb-4 border-l-4 border-gray-300 pl-3 italic">{summary.healthRationale}</p>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
        {summary.topWin && (
          <div className="p-4 bg-white bg-opacity-60 rounded-lg border border-green-200">
            <div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center"><Trophy className="w-4 h-4 text-green-600" /></div><span className="font-semibold text-green-800">Top Win</span></div>
            <p className="text-sm text-gray-700">{summary.topWin}</p>
          </div>
        )}
        {summary.topProblem && (
          <div className="p-4 bg-white bg-opacity-60 rounded-lg border border-red-200">
            <div className="flex items-center gap-2 mb-2"><div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-red-600" /></div><span className="font-semibold text-red-800">Top Problem</span></div>
            <p className="text-sm text-gray-700">{summary.topProblem}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default WeekSummaryCard;
