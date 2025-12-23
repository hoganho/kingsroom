// src/hooks/scraper/useBatchGameStream.ts
// Hook to subscribe to game processing events and accumulate results
// Transforms events into GameState format for GameListItem compatibility
//
// FIXED v4: Added deduplication to prevent duplicate key errors
// - Events are deduplicated by tournamentId within the same job
// - Added unique index to keys for extra safety
//
// FIXED v5: Added dataSource passthrough
// - Events now include dataSource ('s3' | 'web' | 'none') for pipeline display
// - s3Key is also passed through for source tracking

import { useState, useEffect, useCallback, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import { onGameProcessed } from '../../lib/customSubscriptions';
import type { GameState } from '../../types/game';
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

  // FIXED: Use index in key to guarantee uniqueness even if same tournamentId appears
  // FIXED v5: Added dataSource to track S3 vs web retrieval
  const gameState: GameState = {
    id: `batch-${event.jobId}-${event.tournamentId}-${index}`,
    source: 'SCRAPE' as any,
    jobStatus: processingStatus === 'success' ? 'DONE' 
             : processingStatus === 'error' ? 'ERROR' 
             : processingStatus === 'skipped' ? 'DONE'
             : 'IDLE',
    fetchCount: 1,
    // Pass through dataSource from event for pipeline display
    dataSource: event.dataSource as 's3' | 'web' | 'none' | undefined,
    s3Key: event.s3Key,
    data: event.gameData ? {
      name: event.gameData.name || `Tournament #${event.tournamentId}`,
      tournamentId: event.tournamentId,
      gameStatus: event.gameData.gameStatus as any,
      registrationStatus: event.gameData.registrationStatus as any,
      gameStartDateTime: event.gameData.gameStartDateTime,
      gameEndDateTime: event.gameData.gameEndDateTime,
      buyIn: event.gameData.buyIn,
      rake: event.gameData.rake,
      guaranteeAmount: event.gameData.guaranteeAmount,
      prizepoolPaid: event.gameData.prizepoolPaid,
      totalEntries: event.gameData.totalEntries,
      totalUniquePlayers: event.gameData.totalUniquePlayers,
      totalRebuys: event.gameData.totalRebuys,
      totalAddons: event.gameData.totalAddons,
      gameType: event.gameData.gameType as any,
      gameVariant: event.gameData.gameVariant as any,
      tournamentType: event.gameData.tournamentType as any,
      gameTags: event.gameData.gameTags,
      venueId: event.gameData.venueId,
      doNotScrape: event.gameData.doNotScrape,
      hasGuarantee: (event.gameData.guaranteeAmount ?? 0) > 0,
      levels: [],
    } : undefined,
    saveResult: event.saveResult ? {
      success: event.saveResult.success,
      gameId: event.saveResult.gameId,
      action: event.saveResult.action as 'CREATED' | 'UPDATED' | 'SKIPPED',
      message: event.saveResult.message,
    } : undefined,
    errorMessage: event.errorMessage,
    existingGameId: event.saveResult?.gameId || event.gameData?.existingGameId,
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
  
  // FIXED: Track seen tournament IDs to prevent duplicates
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
      // FIXED: Reset tracking when job changes
      seenTournamentIdsRef.current.clear();
      eventCounterRef.current = 0;
      return;
    }

    // Clear events for new subscription
    setEvents([]);
    setError(null);
    // FIXED: Reset tracking for new job
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
            console.log(`[useBatchGameStream] RAW: jobId=${event.jobId}, tournamentId=${event.tournamentId}, action=${event.action}`);
            
            // FIXED: Check if we've already seen this tournamentId for this job
            if (seenTournamentIdsRef.current.has(event.tournamentId)) {
              console.log(`[useBatchGameStream] DUPLICATE IGNORED: #${event.tournamentId} already processed`);
              return;
            }
            
            // Mark as seen
            seenTournamentIdsRef.current.add(event.tournamentId);
            
            console.log(`[useBatchGameStream] Received: #${event.tournamentId} - ${event.action}`);
            
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

  // FIXED: Transform events to GameState with unique indices
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