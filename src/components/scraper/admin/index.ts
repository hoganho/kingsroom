// src/components/scraper/admin/index.ts
// Export all scraper admin components

// Core components
export { CollapsibleSection } from './CollapsibleSection';
export { ErrorHandlingModal } from './ErrorHandlingModal';
export { ProgressSummary } from './ProgressSummary';
export { ScraperConfig } from './ScraperConfig';
export { ScraperResults } from './ScraperResults';
export { SkippedIDsAnalyzer } from './SkippedIDsAnalyzer';

// Merged modal components
export { GameDetailsModal, JobDetailsModal } from './ScraperModals';

// Status badges (re-export from shared)
export {
  JobStatusBadge,
  URLStatusBadge,
  GameStatusBadge,
  DataSourceBadge,
  ProcessingStatusBadge,
  MetricCard,
} from '../shared/StatusBadges';

// Types
export type { DataSourceType, ProcessingStatusType } from '../shared/StatusBadges';
