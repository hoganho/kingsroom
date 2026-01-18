// components/insights/AlertsPanel.tsx
// Alerts panel for AI Insights

import React from 'react';
import { Card } from '../ui/Card';
import { Badge } from '../ui/Badge';
import type { Alert, ReportAlert, AlertSeverity } from '../../types/insights';

interface AlertsPanelProps {
  alerts: (Alert | ReportAlert)[];
  showRecommendations?: boolean;
}

const severityConfig: Record<AlertSeverity, { variant: 'error' | 'warning' | 'default'; icon: string; bg: string }> = {
  HIGH: { variant: 'error', icon: '🚨', bg: 'bg-red-50 border-red-200' },
  MEDIUM: { variant: 'warning', icon: '⚠️', bg: 'bg-yellow-50 border-yellow-200' },
  LOW: { variant: 'default', icon: 'ℹ️', bg: 'bg-blue-50 border-blue-200' },
};

// Type guard to check for Alert-specific properties
function hasVenueInfo(alert: Alert | ReportAlert): alert is Alert {
  return 'venueName' in alert || 'gameName' in alert;
}

export const AlertsPanel: React.FC<AlertsPanelProps> = ({ alerts, showRecommendations = false }) => {
  if (!alerts || alerts.length === 0) return null;

  // Sort by severity
  const sortedAlerts = [...alerts].sort((a, b) => {
    const order: Record<AlertSeverity, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    return order[a.severity] - order[b.severity];
  });

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold">Alerts</h3>
        <div className="flex gap-2 text-xs">
          <Badge variant="error">{alerts.filter(a => a.severity === 'HIGH').length} High</Badge>
          <Badge variant="warning">{alerts.filter(a => a.severity === 'MEDIUM').length} Medium</Badge>
          <Badge variant="default">{alerts.filter(a => a.severity === 'LOW').length} Low</Badge>
        </div>
      </div>
      
      <div className="space-y-3">
        {sortedAlerts.map((alert, idx) => {
          const config = severityConfig[alert.severity];
          const alertWithVenue = hasVenueInfo(alert) ? alert : null;
          
          return (
            <div 
              key={alert.id || idx} 
              className={`p-4 rounded-lg border ${config.bg}`}
            >
              <div className="flex items-start gap-3">
                <span className="text-xl">{config.icon}</span>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-gray-900">{alert.title}</h4>
                    <Badge variant={config.variant}>{alert.severity}</Badge>
                    {alert.type && (
                      <span className="text-xs text-gray-500 bg-gray-200 px-2 py-0.5 rounded">
                        {alert.type.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                  
                  <p className="text-sm text-gray-700">{alert.description}</p>
                  
                  {/* Affected entity/metric info */}
                  {(alertWithVenue?.venueName || alertWithVenue?.gameName || alert.metric) && (
                    <div className="flex flex-wrap gap-2 mt-2 text-xs text-gray-500">
                      {alertWithVenue?.venueName && <span>Venue: {alertWithVenue.venueName}</span>}
                      {alertWithVenue?.gameName && <span>Game: {alertWithVenue.gameName}</span>}
                      {alert.metric && alert.value !== undefined && (
                        <span>{alert.metric}: {alert.value}{alert.threshold !== undefined ? ` (threshold: ${alert.threshold})` : ''}</span>
                      )}
                    </div>
                  )}
                  
                  {/* Recommendation */}
                  {showRecommendations && alert.recommendation && (
                    <div className="mt-2 p-2 bg-white bg-opacity-60 rounded">
                      <span className="text-xs font-semibold text-gray-600">Recommendation: </span>
                      <span className="text-sm text-gray-700">{alert.recommendation}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default AlertsPanel;
