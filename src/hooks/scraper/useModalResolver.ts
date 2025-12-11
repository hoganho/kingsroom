// src/hooks/scraper/useModalResolver.ts
// Clean modal resolution pattern to replace window.__resolver anti-pattern
// Provides type-safe promise-based modal handling

import { useState, useCallback, useRef } from 'react';
import { ScrapedGameData } from '../../API';
import { ErrorType, ErrorDecision } from '../../types/scraper';

// ===================================================================
// MODAL TYPES
// ===================================================================

// --- Save Confirmation Modal ---
export interface SaveConfirmationModalState {
  isOpen: boolean;
  gameData: ScrapedGameData | null;
  suggestedVenueId: string;
  entityId: string;
}

export interface SaveConfirmationResult {
  action: 'save' | 'cancel';
  venueId?: string;
  editedData?: ScrapedGameData;
}

// --- Error Handling Modal ---
export interface ErrorModalState {
  isOpen: boolean;
  tournamentId: number;
  url: string;
  errorType: ErrorType;
  errorMessage: string;
  canRetry: boolean;
}

// --- Scrape Options Modal ---
export interface ScrapeOptionsModalState {
  isOpen: boolean;
  tournamentId: number;
  url: string;
  gameStatus?: string;
  isDoNotScrape?: boolean;
}

export interface ScrapeOptionsResult {
  action: 'S3' | 'LIVE' | 'SKIP' | 'SAVE_PLACEHOLDER';
  s3Key?: string;
}

// --- Combined State ---
export interface ScraperModalsState {
  saveConfirmation: SaveConfirmationModalState;
  error: ErrorModalState | null;
  scrapeOptions: ScrapeOptionsModalState | null;
}

// ===================================================================
// GENERIC MODAL RESOLVER HOOK
// ===================================================================

/**
 * Generic hook for promise-based modal resolution
 * Replaces the window.__resolver anti-pattern
 */
export function useModalResolver<TState, TResult>() {
  const [state, setState] = useState<TState | null>(null);
  const resolverRef = useRef<((result: TResult) => void) | null>(null);

  const open = useCallback((modalState: TState): Promise<TResult> => {
    return new Promise((resolve) => {
      resolverRef.current = resolve;
      setState(modalState);
    });
  }, []);

  const close = useCallback((result: TResult) => {
    if (resolverRef.current) {
      resolverRef.current(result);
      resolverRef.current = null;
    }
    setState(null);
  }, []);

  const cancel = useCallback((defaultResult: TResult) => {
    close(defaultResult);
  }, [close]);

  return {
    state,
    isOpen: state !== null,
    open,
    close,
    cancel,
  };
}

// ===================================================================
// SPECIALIZED MODAL HOOKS
// ===================================================================

/**
 * Hook for Save Confirmation Modal
 */
export const useSaveConfirmationModal = () => {
  const { state, isOpen, open, close, cancel } = useModalResolver<
    Omit<SaveConfirmationModalState, 'isOpen'>,
    SaveConfirmationResult
  >();

  const openModal = useCallback((
    gameData: ScrapedGameData,
    suggestedVenueId: string,
    entityId: string
  ): Promise<SaveConfirmationResult> => {
    return open({ gameData, suggestedVenueId, entityId });
  }, [open]);

  const confirm = useCallback((venueId: string, editedData?: ScrapedGameData) => {
    close({ action: 'save', venueId, editedData });
  }, [close]);

  const cancelModal = useCallback(() => {
    cancel({ action: 'cancel' });
  }, [cancel]);

  return {
    state: state ? { ...state, isOpen: true } : null,
    isOpen,
    openModal,
    confirm,
    cancel: cancelModal,
  };
};

/**
 * Hook for Error Handling Modal
 */
export const useErrorModal = () => {
  const { state, isOpen, open, close } = useModalResolver<
    Omit<ErrorModalState, 'isOpen'>,
    ErrorDecision
  >();

  const openModal = useCallback((
    tournamentId: number,
    url: string,
    errorType: ErrorType,
    errorMessage: string,
    canRetry: boolean = false
  ): Promise<ErrorDecision> => {
    return open({ tournamentId, url, errorType, errorMessage, canRetry });
  }, [open]);

  const resolve = useCallback((decision: ErrorDecision) => {
    close(decision);
  }, [close]);

  return {
    state: state ? { ...state, isOpen: true } : null,
    isOpen,
    openModal,
    resolve,
  };
};

/**
 * Hook for Scrape Options Modal
 */
export const useScrapeOptionsModal = () => {
  const { state, isOpen, open, close, cancel } = useModalResolver<
    Omit<ScrapeOptionsModalState, 'isOpen'>,
    ScrapeOptionsResult
  >();

  const openModal = useCallback((
    tournamentId: number,
    url: string,
    gameStatus?: string,
    isDoNotScrape?: boolean
  ): Promise<ScrapeOptionsResult> => {
    return open({ tournamentId, url, gameStatus, isDoNotScrape });
  }, [open]);

  const selectOption = useCallback((action: ScrapeOptionsResult['action'], s3Key?: string) => {
    close({ action, s3Key });
  }, [close]);

  const cancelModal = useCallback(() => {
    cancel({ action: 'SKIP' });
  }, [cancel]);

  return {
    state: state ? { ...state, isOpen: true } : null,
    isOpen,
    openModal,
    selectOption,
    cancel: cancelModal,
  };
};

// ===================================================================
// COMBINED SCRAPER MODALS HOOK
// ===================================================================

/**
 * Combined hook for all scraper modals
 * Provides a single interface for managing all modal states
 */
export const useScraperModals = () => {
  const saveConfirmation = useSaveConfirmationModal();
  const error = useErrorModal();
  const scrapeOptions = useScrapeOptionsModal();

  // Check if any modal is open (useful for pausing processing)
  const anyModalOpen = saveConfirmation.isOpen || error.isOpen || scrapeOptions.isOpen;

  return {
    saveConfirmation,
    error,
    scrapeOptions,
    anyModalOpen,
  };
};

// ===================================================================
// EXAMPLE USAGE
// ===================================================================
/*
// In ScraperTab.tsx:

const { saveConfirmation, error, scrapeOptions } = useScraperModals();

// Opening a save confirmation modal (replaces window.__saveModalResolver)
const handleVenueConfirmation = async (gameData, venueId, entityId) => {
  const result = await saveConfirmation.openModal(gameData, venueId, entityId);
  
  if (result.action === 'save') {
    await saveGameDataToBackend(url, result.venueId, gameData, null, entityId);
  }
};

// In the render:
{saveConfirmation.state && (
  <SaveConfirmationModal
    isOpen={true}
    onClose={() => saveConfirmation.cancel()}
    onConfirm={(editedData) => saveConfirmation.confirm(editedData.venueId, editedData)}
    gameData={saveConfirmation.state.gameData}
    venueId={saveConfirmation.state.suggestedVenueId}
    entityId={saveConfirmation.state.entityId}
  />
)}
*/

export default useScraperModals;
