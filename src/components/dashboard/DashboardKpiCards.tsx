// src/components/dashboard/DashboardKpiCards.tsx
// KPI cards showing game counts for the dashboard

import React from 'react';
import {
  PlayIcon,
  ClockIcon,
  CalendarIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';
import { KpiCard } from '@/components/ui/KpiCard';

interface DashboardKpiCardsProps {
  runningCount: number;
  startingSoonCount: number;
  upcomingCount: number;
  finishedCount: number;
}

export const DashboardKpiCards: React.FC<DashboardKpiCardsProps> = ({
  runningCount,
  startingSoonCount,
  upcomingCount,
  finishedCount,
}) => {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-4 mb-8">
      <KpiCard
        title="Running"
        value={runningCount}
        icon={<PlayIcon className="h-5 w-5" />}
      />
      <KpiCard
        title="Starting Soon"
        value={startingSoonCount}
        icon={<ClockIcon className="h-5 w-5" />}
      />
      <KpiCard
        title="Upcoming"
        value={upcomingCount}
        icon={<CalendarIcon className="h-5 w-5" />}
      />
      <KpiCard
        title="Finished (7d)"
        value={finishedCount}
        icon={<CheckCircleIcon className="h-5 w-5" />}
      />
    </div>
  );
};
