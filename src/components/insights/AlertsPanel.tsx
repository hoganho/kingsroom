// components/insights/AlertsPanel.tsx
// Alerts panel - Priority-sorted alerts with actions

import React, { useState } from 'react';
import { AlertTriangle, AlertCircle, Bell, Clock, User, ChevronDown, ChevronUp, Target, Zap } from 'lucide-react';
import type { ReportAlert, AlertPriority } from '../../types/insights';

interface AlertsPanelProps {
  alerts: ReportAlert[];
  maxVisible?: number;
}

const priorityConfig: Record<AlertPriority, { color: string; bgColor: string; borderColor: string; icon: React.ReactNode; order: number }> = {
  CRITICAL: { color: 'text-red-700', bgColor: 'bg-red-50', borderColor: 'border-red-300', icon: <AlertTriangle className="w-5 h-5" />, order: 0 },
  URGENT: { color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-200', icon: <Zap className="w-5 h-5" />, order: 1 },
  HIGH: { color: 'text-amber-700', bgColor: 'bg-amber-50', borderColor: 'border-amber-200', icon: <AlertCircle className="w-5 h-5" />, order: 2 },
  MEDIUM: { color: 'text-blue-700', bgColor: 'bg-blue-50', borderColor: 'border-blue-200', icon: <Bell className="w-5 h-5" />, order: 3 },
};

export const AlertsPanel: React.FC<AlertsPanelProps> = ({ alerts, maxVisible = 5 }) => {
  const [expanded, setExpanded] = useState(false);
  if (!alerts || alerts.length === 0) return null;

  const sortedAlerts = [...alerts].sort((a, b) => (priorityConfig[a.priority]?.order ?? 3) - (priorityConfig[b.priority]?.order ?? 3));
  const displayAlerts = expanded ? sortedAlerts : sortedAlerts.slice(0, maxVisible);
  const hasMore = sortedAlerts.length > maxVisible;

  const criticalCount = alerts.filter(a => a.priority === 'CRITICAL' || a.priority === 'URGENT').length;
  const highCount = alerts.filter(a => a.priority === 'HIGH').length;
  const mediumCount = alerts.filter(a => a.priority === 'MEDIUM').length;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-100"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Alerts</h3>
            <p className="text-sm text-gray-500">{alerts.length} alert{alerts.length !== 1 ? 's' : ''} requiring attention</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {criticalCount > 0 && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{criticalCount} Critical</span>}
          {highCount > 0 && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">{highCount} High</span>}
          {mediumCount > 0 && <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">{mediumCount} Medium</span>}
        </div>
      </div>

      <div className="space-y-3">
        {displayAlerts.map((alert, idx) => {
          const config = priorityConfig[alert.priority] || priorityConfig.MEDIUM;
          return (
            <div key={idx} className={`p-4 rounded-lg border-l-4 ${config.bgColor} ${config.borderColor}`}>
              <div className="flex items-start gap-3">
                <div className={config.color}>{config.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className="font-semibold text-gray-900">{alert.title}</h4>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${config.color} bg-white`}>{alert.priority}</span>
                    {alert.type && <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded">{alert.type.replace(/_/g, ' ')}</span>}
                  </div>
                  {alert.description && <p className="text-sm text-gray-700 mt-2">{alert.description}</p>}
                  {alert.evidence && <div className="mt-2 text-sm text-gray-600 bg-white bg-opacity-50 p-2 rounded"><span className="font-medium">Evidence: </span>{alert.evidence}</div>}
                  {alert.action && (
                    <div className="mt-3 flex items-start gap-2 p-2 bg-white bg-opacity-60 rounded border border-blue-100">
                      <Target className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                      <div><span className="text-xs font-semibold text-blue-700 uppercase">Action</span><p className="text-sm text-gray-700">{alert.action}</p></div>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-3 mt-3 text-xs text-gray-500">
                    {alert.owner && <span className="flex items-center gap-1"><User className="w-3 h-3" />{alert.owner}</span>}
                    {alert.deadline && <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{alert.deadline}</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button onClick={() => setExpanded(!expanded)} className="w-full mt-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 flex items-center justify-center gap-1 border-t pt-3">
          {expanded ? <><ChevronUp className="w-4 h-4" />Show Less</> : <><ChevronDown className="w-4 h-4" />Show {sortedAlerts.length - maxVisible} More Alerts</>}
        </button>
      )}
    </div>
  );
};

export default AlertsPanel;
