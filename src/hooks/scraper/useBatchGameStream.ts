// src/hooks/scraper/useBatchGameStream.ts
// Hook to subscribe to game processing events and accumulate results
// Transforms events into GameState format for GameListItem compatibility
//
// FIXED v6: Proper pipeline display for NOT_FOUND and NOT_PUBLISHED
// - Added processingAction field to preserve original action type
// - Ensured data is always populated (even for NOT_FOUND/NOT_PUBLISHED)
// - dataSource is properly passed through for accurate RETRIEVE display
//
// FIXED v5: Added dataSource passthrough
// - Events now include dataSource ('s3' | 'web' | 'none') for pipeline display
// - s3Key is also passed through for source tracking
//
// FIXED v4: Added deduplication to prevent duplicate key errors
// - Events are deduplicated by tournamentId within the same job
// - Added unique index to keys for extra safety

import { useState, useEffect, useCallback, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import { onGameProcessed } from '../../lib/customSubscriptions';
import type { GameState, ProcessingAction } from '../../types/game';
import type { ProcessingStatusType } from '../../components/scraper/GameListItem';
import type { 
  GameProcessedEvent, 
  BatchGameStreamOptions, 
  BatchGameStreamResult 
} from '../../types/scraper';

const getClient = () => generateClient();

// ===================================================================
// TRANSFORM EVENT TO GAME STATE
// ===================================================================

function eventToGameState(event: GameProcessedEvent, index: number): GameState {
  const statusMap: Record<string, ProcessingStatusType> = {
    'CREATED': 'success',
    'UPDATED': 'success',
    'SKIPPED': 'skipped',
    'ERROR': 'error',
    'NOT_FOUND': 'skipped',
    'NOT_PUBLISHED': 'skipped',
  };

  const processingStatus = statusMap[event.action] || 'pending';

  let processingMessage = event.message || '';
  if (!processingMessage) {
    switch (event.action) {
      case 'CREATED':
        processingMessage = `Created: ${event.saveResult?.gameId?.slice(0, 8) || 'unknown'}`;
        break;
      case 'UPDATED':
        processingMessage = `Updated: ${event.saveResult?.gameId?.slice(0, 8) || 'unknown'}`;
        break;
      case 'ERROR':
        processingMessage = event.errorMessage || 'Processing error';
        break;
      case 'NOT_FOUND':
        processingMessage = event.gameData?.gameStatus || 'Not found';
        break;
      case 'NOT_PUBLISHED':
        processingMessage = 'Not published';
        break;
      case 'SKIPPED':
        processingMessage = 'Skipped';
        break;
    }
  }

  // FIXED v6: Normalize dataSource from event
  // Lambda may send 'S3_CACHE', 'LIVE', 'HTTP_304_CACHE', etc.
  let normalizedDataSource: 's3' | 'web' | 'none' | undefined;
  if (event.dataSource) {
    const ds = event.dataSource.toLowerCase();
    if (ds === 's3' || ds === 's3_cache' || ds === 'http_304_cache') {
      normalizedDataSource = 's3';
    } else if (ds === 'web' || ds === 'live') {
      normalizedDataSource = 'web';
    } else {
      normalizedDataSource = 'none';
    }
  }

  // FIXED v6: For NOT_FOUND and NOT_PUBLISHED, the page WAS fetched successfully
  // If dataSource wasn't explicitly set, default to 'web' since retrieval succeeded
  if (!normalizedDataSource && (event.action === 'NOT_FOUND' || event.action === 'NOT_PUBLISHED')) {
    normalizedDataSource = 'web';
  }

  // FIXED v6: Always create data object, even for NOT_FOUND/NOT_PUBLISHED
  // This ensures GameListItem can properly identify the game status
  const gameData = event.gameData;
  
  // Determine the gameStatus based on action if not provided
  let gameStatus = gameData?.gameStatus;
  if (!gameStatus) {
    if (event.action === 'NOT_FOUND') {
      gameStatus = 'NOT_FOUND';
    } else if (event.action === 'NOT_PUBLISHED') {
      gameStatus = 'NOT_PUBLISHED';
    }
  }

  const gameState: GameState = {
    id: `batch-${event.jobId}-${event.tournamentId}-${index}`,
    source: 'SCRAPE' as any,
    jobStatus: processingStatus === 'success' ? 'DONE' 
             : processingStatus === 'error' ? 'ERROR' 
             : processingStatus === 'skipped' ? 'DONE'
             : 'IDLE',
    fetchCount: 1,
    // FIXED v6: Pass through normalized dataSource
    dataSource: normalizedDataSource,
    s3Key: event.s3Key,
    // FIXED v6: Store original action for accurate pipeline display
    processingAction: event.action as ProcessingAction,
    // FIXED v6: Always create data object with at minimum tournamentId and gameStatus
    data: {
      name: gameData?.name || (event.action === 'NOT_FOUND' ? 'Empty Slot' : event.action === 'NOT_PUBLISHED' ? 'Not Published' : `Tournament #${event.tournamentId}`),
      tournamentId: event.tournamentId,
      gameStatus: gameStatus as any,
      registrationStatus: gameData?.registrationStatus as any,
      gameStartDateTime: gameData?.gameStartDateTime,
      gameEndDateTime: gameData?.gameEndDateTime,
      buyIn: gameData?.buyIn,
      rake: gameData?.rake,
      guaranteeAmount: gameData?.guaranteeAmount,
      prizepoolPaid: gameData?.prizepoolPaid,
      totalEntries: gameData?.totalEntries,
      totalUniquePlayers: gameData?.totalUniquePlayers,
      totalRebuys: gameData?.totalRebuys,
      totalAddons: gameData?.totalAddons,
      gameType: gameData?.gameType as any,
      gameVariant: gameData?.gameVariant as any,
      tournamentType: gameData?.tournamentType as any,
      gameTags: gameData?.gameTags,
      venueId: gameData?.venueId,
      doNotScrape: gameData?.doNotScrape,
      hasGuarantee: (gameData?.guaranteeAmount ?? 0) > 0,
      levels: [],
    },
    saveResult: event.saveResult ? {
      success: event.saveResult.success,
      gameId: event.saveResult.gameId,
      action: event.saveResult.action as 'CREATED' | 'UPDATED' | 'SKIPPED',
      message: event.saveResult.message,
    } : undefined,
    errorMessage: event.errorMessage,
    existingGameId: event.saveResult?.gameId || gameData?.existingGameId,
  };

  return gameState;
}

// ===================================================================
// MAIN HOOK
// ===================================================================

export function useBatchGameStream(
  jobId: string | null,
  options: BatchGameStreamOptions = {}
): BatchGameStreamResult {
  const { maxGames = 100 } = options;
  
  const [events, setEvents] = useState<GameProcessedEvent[]>([]);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  // Use refs for values accessed in callbacks
  const maxGamesRef = useRef(maxGames);
  const eventsRef = useRef<GameProcessedEvent[]>([]);
  
  // Track seen tournament IDs to prevent duplicates
  const seenTournamentIdsRef = useRef<Set<number>>(new Set());
  
  // Counter for unique indexing
  const eventCounterRef = useRef(0);
  
  // Store callbacks in refs
  const onGameReceivedRef = useRef(options.onGameReceived);
  const onErrorRef = useRef(options.onError);
  const onSubscribedRef = useRef(options.onSubscribed);
  
  // Update refs when values change
  useEffect(() => {
    maxGamesRef.current = maxGames;
  }, [maxGames]);
  
  useEffect(() => {
    onGameReceivedRef.current = options.onGameReceived;
    onErrorRef.current = options.onError;
    onSubscribedRef.current = options.onSubscribed;
  }, [options.onGameReceived, options.onError, options.onSubscribed]);

  // Keep eventsRef in sync
  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  // Calculate stats from events
  const stats = events.reduce(
    (acc, event) => {
      acc.total++;
      switch (event.action) {
        case 'CREATED':
          acc.created++;
          break;
        case 'UPDATED':
          acc.updated++;
          break;
        case 'ERROR':
          acc.errors++;
          break;
        case 'SKIPPED':
        case 'NOT_FOUND':
        case 'NOT_PUBLISHED':
          acc.skipped++;
          break;
      }
      return acc;
    },
    { created: 0, updated: 0, skipped: 0, errors: 0, total: 0 }
  );

  // Subscribe to events
  useEffect(() => {
    // No jobId = no subscription
    if (!jobId) {
      setIsSubscribed(false);
      setEvents([]);
      setError(null);
      // Reset tracking when job changes
      seenTournamentIdsRef.current.clear();
      eventCounterRef.current = 0;
      return;
    }

    // Clear events for new subscription
    setEvents([]);
    setError(null);
    // Reset tracking for new job
    seenTournamentIdsRef.current.clear();
    eventCounterRef.current = 0;

    const client = getClient();
    let subscription: any = null;
    let isActive = true; // Track if this effect instance is still active
    
    try {
      console.log(`[useBatchGameStream] Subscribing to job: ${jobId}`);
      
      const graphqlSubscription = client.graphql({
        query: onGameProcessed,
        variables: { jobId },
        authMode: 'userPool'
      });

      subscription = (graphqlSubscription as any).subscribe({
        next: ({ data }: any) => {
          // Only process if this effect instance is still active
          if (!isActive) return;
          
          const event = data?.onGameProcessed as GameProcessedEvent;
          if (event) { 
            // FIXED v6: Log dataSource for debugging
            if (event.action !== 'NOT_PUBLISHED') {
              console.log(`[useBatchGameStream] RAW: jobId=${event.jobId}, tournamentId=${event.tournamentId}, action=${event.action}, dataSource=${event.dataSource || 'not set'}`);
            }
            
            // Check if we've already seen this tournamentId for this job
            if (seenTournamentIdsRef.current.has(event.tournamentId)) {
              console.log(`[useBatchGameStream] DUPLICATE IGNORED: #${event.tournamentId} already processed`);
              return;
            }
            
            // Mark as seen
            seenTournamentIdsRef.current.add(event.tournamentId);
            
            if (event.action !== 'NOT_PUBLISHED') {
              console.log(`[useBatchGameStream] Received: #${event.tournamentId} - ${event.action} (source: ${event.dataSource || 'unknown'})`);
            }
            
            setEvents(prev => {
              const updated = [event, ...prev].slice(0, maxGamesRef.current);
              return updated;
            });
            
            eventCounterRef.current++;
            
            onGameReceivedRef.current?.(event);
          }
        },
        error: (err: any) => {
          if (!isActive) return;
          
          console.error('[useBatchGameStream] Subscription error:', err);
          const subscriptionError = new Error(err?.message || 'Subscription failed');
          setError(subscriptionError);
          setIsSubscribed(false);
          onErrorRef.current?.(subscriptionError);
        }
      });

      setIsSubscribed(true);
      console.log(`[useBatchGameStream] Subscription established for job: ${jobId}`);
      onSubscribedRef.current?.();

    } catch (err) {
      console.error('[useBatchGameStream] Failed to subscribe:', err);
      const subscriptionError = err as Error;
      setError(subscriptionError);
      setIsSubscribed(false);
      onErrorRef.current?.(subscriptionError);
    }

    // Cleanup function
    return () => {
      isActive = false; // Mark this effect instance as inactive
      if (subscription) {
        console.log(`[useBatchGameStream] Cleanup: unsubscribing from job ${jobId}`);
        subscription.unsubscribe();
      }
      setIsSubscribed(false);
    };
  }, [jobId]); // ONLY depend on jobId

  // Transform events to GameState with unique indices
  const games = events.map((event, index) => eventToGameState(event, index));

  // Clear function
  const clear = useCallback(() => {
    setEvents([]);
    seenTournamentIdsRef.current.clear();
    eventCounterRef.current = 0;
  }, []);

  return {
    games,
    events,
    isSubscribed,
    error,
    clear,
    stats,
  };
}

export default useBatchGameStream;

export type { 
  GameProcessedEvent, 
  BatchGameStreamOptions, 
  BatchGameStreamResult,
  BatchGameStreamStats,
} from '../../types/scraper';