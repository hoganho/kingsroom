// src/hooks/scraper/index.ts
// Barrel exports for scraper-related hooks

export { 
  useProcessingState, 
  buildProcessingQueue,
  type UseProcessingStateResult,
  type ProcessingStateConfig,
  type QueueBuildParams 
} from './useProcessingState';

export { 
  useErrorTracking,
  type UseErrorTrackingResult 
} from './useErrorTracking';

export {
  useModalResolver,
  useSaveConfirmationModal,
  useErrorModal,
  useScrapeOptionsModal,
  useScraperModals,
  type SaveConfirmationModalState,
  type SaveConfirmationResult,
  type ErrorModalState,
  type ScrapeOptionsModalState,
  type ScrapeOptionsResult,
  type ScraperModalsState,
} from './useModalResolver';

// NOTE: Error classification utilities (isTransientError, shouldStopImmediately, 
// isNotFoundResponse, shouldPauseForDecision) are exported from 
// '../../utils/scraperErrorUtils' - import them from there