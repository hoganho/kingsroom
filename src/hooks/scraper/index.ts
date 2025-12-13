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
} from './useModalResolver';

export { 
  useScrapeOrchestrator,
  type OrchestratorConfig,
  type OrchestratorCallbacks,
  type OrchestratorResult,
  type SaveConfirmationResult,
  type ScrapeOptionsResult,
} from './useScrapeOrchestrator';

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
