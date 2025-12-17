// src/hooks/scraper/index.ts
// Barrel export for scraper hooks

export { 
  useProcessingState, 
  buildProcessingQueue,
  type UseProcessingStateResult,
  type ProcessingStateConfig,
  type QueueBuildParams,
} from './useProcessingState';

export { 
  useErrorTracking,
  type UseErrorTrackingResult,
} from './useErrorTracking';

export { 
  useScraperModals,
  useSaveConfirmationModal,
  useErrorModal,
  useScrapeOptionsModal,
  useModalResolver,
  type SaveConfirmationModalState,
  type SaveConfirmationResult,
  type ErrorModalState,
  type ScrapeOptionsModalState,
  type ScrapeOptionsResult,
} from './useModalResolver';

// Phase 4: State machine
export {
  useResultStateMachine,
  validateTransition,
  getStatusDescription,
  canRetry,
  isComplete,
  type TransitionResult,
  type StateMachineHelpers,
} from './useResultStateMachine';

// NEW: Single-ID processing hook (replaces useScrapeOrchestrator for single mode)
export {
  useSingleScrape,
  type UseSingleScrapeConfig,
  type UseSingleScrapeResult,
} from './useSingleScrape';