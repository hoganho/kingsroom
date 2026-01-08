// src/hooks/scraper/index.ts
// Barrel export for scraper hooks

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

// NEW: Single-ID processing hook (replaces useScrapeOrchestrator for single mode)
export {
  useSingleScrape,
  type UseSingleScrapeConfig,
  type UseSingleScrapeResult,
} from './useSingleScrape';