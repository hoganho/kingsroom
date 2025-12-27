// src/hooks/useSocialPostProcessor.ts
// Hook to interact with the socialPostProcessor Lambda
// Handles: processing, matching, linking social posts to games

import { useState, useCallback, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';

import type {
  ProcessSocialPostInput,
  ProcessSocialPostBatchInput,
  ManualLinkInput,
  UnlinkInput,
  VerifyLinkInput,
  RejectLinkInput,
  GetUnlinkedPostsInput,
  GetMatchingStatsInput,
  ProcessSocialPostResult,
  ProcessBatchResult,
  SocialPostGameLink,
  UnlinkedPostsConnection,
  SocialPostMatchingStats,
  SocialPostProcessingStatus,
} from '../API';

// ===================================================================
// GRAPHQL OPERATIONS
// ===================================================================

const processSocialPostMutation = /* GraphQL */ `
  mutation ProcessSocialPost($input: ProcessSocialPostInput!) {
    processSocialPost(input: $input) {
      success
      socialPostId
      processingStatus
      error
      warnings
      extractedGameData {
        id
        socialPostId
        contentType
        contentTypeConfidence
        resultScore
        promoScore
        extractedName
        extractedTournamentUrl
        extractedTournamentId
        extractedVenueName
        suggestedVenueId
        venueMatchConfidence
        venueMatchReason
        extractedDate
        extractedDayOfWeek
        extractedStartTime
        dateSource
        extractedBuyIn
        extractedGuarantee
        extractedPrizePool
        extractedFirstPlacePrize
        extractedTotalPrizesPaid
        extractedTotalEntries
        extractedGameType
        extractedTournamentType
        extractedGameVariant
        extractedGameTypes
        extractedSeriesName
        extractedEventNumber
        extractedDayNumber
        extractedFlightLetter
        isSeriesEvent
        extractedWinnerName
        extractedWinnerPrize
        placementCount
        suggestedGameId
        matchCandidateCount
        extractedAt
        extractionVersion
        extractionDurationMs
      }
      placementsExtracted
      matchCandidates {
        gameId
        gameName
        gameDate
        gameStatus
        venueId
        venueName
        entityId
        buyIn
        guaranteeAmount
        totalEntries
        matchConfidence
        matchReason
        matchSignals
        rank
        isPrimaryMatch
        wouldAutoLink
        rejectionReason
      }
      primaryMatch {
        gameId
        gameName
        gameDate
        gameStatus
        venueId
        venueName
        entityId
        buyIn
        guaranteeAmount
        totalEntries
        matchConfidence
        matchReason
        matchSignals
        rank
        isPrimaryMatch
        wouldAutoLink
        rejectionReason
      }
      linksCreated
      linksSkipped
      linkDetails {
        id
        socialPostId
        gameId
        linkType
        matchConfidence
        matchReason
        isPrimaryGame
        linkedAt
        linkedBy
      }
      processingTimeMs
    }
  }
`;

const processSocialPostBatchMutation = /* GraphQL */ `
  mutation ProcessSocialPostBatch($input: ProcessSocialPostBatchInput!) {
    processSocialPostBatch(input: $input) {
      success
      totalProcessed
      successCount
      failedCount
      skippedCount
      results {
        success
        socialPostId
        processingStatus
        error
        linksCreated
      }
      totalLinksCreated
      totalExtractionsDone
      averageConfidence
      processingTimeMs
    }
  }
`;

const previewSocialPostMatchQuery = /* GraphQL */ `
  query PreviewSocialPostMatch($socialPostId: ID!) {
    previewSocialPostMatch(socialPostId: $socialPostId) {
      success
      socialPostId
      processingStatus
      error
      warnings
      extractedGameData {
        id
        socialPostId
        contentType
        contentTypeConfidence
        resultScore
        promoScore
        extractedName
        extractedTournamentUrl
        extractedTournamentId
        extractedVenueName
        suggestedVenueId
        venueMatchConfidence
        extractedDate
        extractedDayOfWeek
        extractedStartTime
        extractedBuyIn
        extractedGuarantee
        extractedPrizePool
        extractedFirstPlacePrize
        extractedTotalEntries
        extractedGameType
        extractedTournamentType
        extractedGameVariant
        extractedSeriesName
        extractedEventNumber
        extractedWinnerName
        extractedWinnerPrize
        placementCount
        suggestedGameId
        matchCandidateCount
      }
      placementsExtracted
      matchCandidates {
        gameId
        gameName
        gameDate
        gameStatus
        venueId
        venueName
        buyIn
        guaranteeAmount
        totalEntries
        matchConfidence
        matchReason
        matchSignals
        rank
        isPrimaryMatch
        wouldAutoLink
        rejectionReason
      }
      primaryMatch {
        gameId
        gameName
        gameDate
        gameStatus
        matchConfidence
        matchReason
        wouldAutoLink
      }
      processingTimeMs
    }
  }
`;

const previewContentExtractionQuery = /* GraphQL */ `
  query PreviewContentExtraction($input: PreviewContentExtractionInput!) {
    previewContentExtraction(input: $input) {
      success
      socialPostId
      processingStatus
      error
      warnings
      extractedGameData {
        contentType
        contentTypeConfidence
        resultScore
        promoScore
        extractedName
        extractedTournamentUrl
        extractedTournamentId
        extractedVenueName
        suggestedVenueId
        venueMatchConfidence
        extractedDate
        extractedDayOfWeek
        extractedStartTime
        extractedBuyIn
        extractedGuarantee
        extractedPrizePool
        extractedFirstPlacePrize
        extractedTotalPrizesPaid
        extractedTotalEntries
        extractedGameType
        extractedTournamentType
        extractedGameVariant
        extractedSeriesName
        extractedEventNumber
        extractedDayNumber
        extractedFlightLetter
        isSeriesEvent
        extractedWinnerName
        extractedWinnerPrize
        placementCount
        matchCandidateCount
      }
      placementsExtracted
      matchCandidates {
        gameId
        gameName
        gameDate
        gameStatus
        venueId
        venueName
        buyIn
        guaranteeAmount
        totalEntries
        matchConfidence
        matchReason
        matchSignals
        rank
        isPrimaryMatch
        wouldAutoLink
        rejectionReason
      }
      primaryMatch {
        gameId
        gameName
        gameDate
        gameStatus
        matchConfidence
        matchReason
        wouldAutoLink
      }
      processingTimeMs
    }
  }
`;

const linkSocialPostToGameMutation = /* GraphQL */ `
  mutation LinkSocialPostToGame($input: ManualLinkInput!) {
    linkSocialPostToGame(input: $input) {
      id
      socialPostId
      gameId
      linkType
      matchConfidence
      matchReason
      isPrimaryGame
      mentionOrder
      linkedAt
      linkedBy
    }
  }
`;

const unlinkSocialPostFromGameMutation = /* GraphQL */ `
  mutation UnlinkSocialPostFromGame($input: UnlinkInput!) {
    unlinkSocialPostFromGame(input: $input)
  }
`;

const verifySocialPostLinkMutation = /* GraphQL */ `
  mutation VerifySocialPostLink($input: VerifyLinkInput!) {
    verifySocialPostLink(input: $input) {
      id
      socialPostId
      gameId
      linkType
      matchConfidence
      verifiedAt
      verifiedBy
    }
  }
`;

const rejectSocialPostLinkMutation = /* GraphQL */ `
  mutation RejectSocialPostLink($input: RejectLinkInput!) {
    rejectSocialPostLink(input: $input) {
      id
      socialPostId
      gameId
      linkType
      rejectedAt
      rejectedBy
      rejectionReason
    }
  }
`;

const getUnlinkedSocialPostsQuery = /* GraphQL */ `
  query GetUnlinkedSocialPosts($input: GetUnlinkedPostsInput) {
    getUnlinkedSocialPosts(input: $input) {
      items {
        socialPost {
          id
          content
          contentPreview
          postedAt
          postType
          accountName
          platform
          processingStatus
          contentType
        }
        extractedData {
          contentType
          extractedBuyIn
          extractedGuarantee
          extractedDate
          extractedWinnerName
          placementCount
        }
        suggestedMatches {
          gameId
          gameName
          gameDate
          matchConfidence
          matchReason
        }
        bestMatchConfidence
      }
      nextToken
      totalCount
    }
  }
`;

const getSocialPostMatchingStatsQuery = /* GraphQL */ `
  query GetSocialPostMatchingStats($input: GetMatchingStatsInput) {
    getSocialPostMatchingStats(input: $input) {
      totalPosts
      processedPosts
      linkedPosts
      pendingPosts
      failedPosts
      resultPosts
      promotionalPosts
      generalPosts
      autoLinkedCount
      manualLinkedCount
      verifiedCount
      rejectedCount
      averageConfidence
      topMatchReasons
    }
  }
`;

// ===================================================================
// TYPES
// ===================================================================

export interface PreviewContentExtractionInput {
  content: string;
  postedAt?: string;
  platform?: string;
  entityId?: string;
  venueId?: string;
  url?: string;
}

export interface ProcessingState {
  isProcessing: boolean;
  currentPostId: string | null;
  progress: {
    current: number;
    total: number;
    stage?: string;
  } | null;
}

export interface UseSocialPostProcessorReturn {
  // State
  isProcessing: boolean;
  processingState: ProcessingState;
  lastResult: ProcessSocialPostResult | null;
  lastBatchResult: ProcessBatchResult | null;
  error: string | null;
  
  // Single Post Operations
  processSinglePost: (input: ProcessSocialPostInput) => Promise<ProcessSocialPostResult>;
  previewMatch: (socialPostId: string) => Promise<ProcessSocialPostResult>;
  
  // Preview Content (NEW - without saving)
  previewContent: (input: PreviewContentExtractionInput) => Promise<ProcessSocialPostResult>;
  
  // Batch Operations
  processBatch: (input: ProcessSocialPostBatchInput) => Promise<ProcessBatchResult>;
  
  // Link Operations
  linkToGame: (input: ManualLinkInput) => Promise<SocialPostGameLink>;
  unlinkFromGame: (input: UnlinkInput) => Promise<boolean>;
  verifyLink: (input: VerifyLinkInput) => Promise<SocialPostGameLink>;
  rejectLink: (input: RejectLinkInput) => Promise<SocialPostGameLink>;
  
  // Queries
  getUnlinkedPosts: (input?: GetUnlinkedPostsInput) => Promise<UnlinkedPostsConnection>;
  getMatchingStats: (input?: GetMatchingStatsInput) => Promise<SocialPostMatchingStats>;
  
  // State Management
  clearError: () => void;
  clearLastResult: () => void;
}

// ===================================================================
// HELPER
// ===================================================================

function hasGraphQLData<T>(response: unknown): response is { data: T } {
  return response !== null && typeof response === 'object' && 'data' in response;
}

// ===================================================================
// HOOK
// ===================================================================

export const useSocialPostProcessor = (): UseSocialPostProcessorReturn => {
  const client = useMemo(() => generateClient(), []);
  
  // State
  const [processingState, setProcessingState] = useState<ProcessingState>({
    isProcessing: false,
    currentPostId: null,
    progress: null,
  });
  const [lastResult, setLastResult] = useState<ProcessSocialPostResult | null>(null);
  const [lastBatchResult, setLastBatchResult] = useState<ProcessBatchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  // =========================================================================
  // SINGLE POST OPERATIONS
  // =========================================================================
  
  const processSinglePost = useCallback(async (
    input: ProcessSocialPostInput
  ): Promise<ProcessSocialPostResult> => {
    console.log('[useSocialPostProcessor] processSinglePost called with:', input);
    
    setProcessingState({
      isProcessing: true,
      currentPostId: input.socialPostId,
      progress: { current: 0, total: 1, stage: 'Processing...' },
    });
    setError(null);
    
    try {
      console.log('[useSocialPostProcessor] Calling GraphQL mutation processSocialPost');
      const response = await client.graphql({
        query: processSocialPostMutation,
        variables: { input },
      });
      
      console.log('[useSocialPostProcessor] GraphQL response:', response);
      
      if (hasGraphQLData<{ processSocialPost: ProcessSocialPostResult }>(response)) {
        const result = response.data.processSocialPost;
        console.log('[useSocialPostProcessor] Parsed result:', result);
        setLastResult(result);
        
        if (!result.success && result.error) {
          setError(result.error);
        }
        
        return result;
      }
      
      throw new Error('Invalid response from processSocialPost');
      
    } catch (err) {
      console.error('[useSocialPostProcessor] Error in processSinglePost:', err);
      const errorMessage = err instanceof Error ? err.message : 'Processing failed';
      setError(errorMessage);
      
      const failedResult: ProcessSocialPostResult = {
        __typename: 'ProcessSocialPostResult',
        success: false,
        socialPostId: input.socialPostId,
        processingStatus: 'FAILED' as SocialPostProcessingStatus,
        error: errorMessage,
      };
      setLastResult(failedResult);
      return failedResult;
      
    } finally {
      setProcessingState({
        isProcessing: false,
        currentPostId: null,
        progress: null,
      });
    }
  }, [client]);
  
  const previewMatch = useCallback(async (
    socialPostId: string
  ): Promise<ProcessSocialPostResult> => {
    setProcessingState({
      isProcessing: true,
      currentPostId: socialPostId,
      progress: { current: 0, total: 1, stage: 'Analyzing...' },
    });
    setError(null);
    
    try {
      const response = await client.graphql({
        query: previewSocialPostMatchQuery,
        variables: { socialPostId },
      });
      
      if (hasGraphQLData<{ previewSocialPostMatch: ProcessSocialPostResult }>(response)) {
        const result = response.data.previewSocialPostMatch;
        setLastResult(result);
        return result;
      }
      
      throw new Error('Invalid response from previewSocialPostMatch');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Preview failed';
      setError(errorMessage);
      
      return {
        __typename: 'ProcessSocialPostResult' as const,
        success: false,
        socialPostId,
        processingStatus: 'FAILED' as SocialPostProcessingStatus,
        error: errorMessage,
      };
      
    } finally {
      setProcessingState({
        isProcessing: false,
        currentPostId: null,
        progress: null,
      });
    }
  }, [client]);
  
  /**
   * Preview extraction on raw content WITHOUT saving anything
   * This allows users to see what would be extracted before uploading
   */
  const previewContent = useCallback(async (
    input: PreviewContentExtractionInput
  ): Promise<ProcessSocialPostResult> => {
    console.log('[useSocialPostProcessor] previewContent called with:', {
      contentLength: input.content?.length,
      entityId: input.entityId,
      venueId: input.venueId,
    });
    
    setProcessingState({
      isProcessing: true,
      currentPostId: null,
      progress: { current: 0, total: 1, stage: 'Analyzing content...' },
    });
    setError(null);
    
    try {
      const response = await client.graphql({
        query: previewContentExtractionQuery,
        variables: { input },
      });
      
      console.log('[useSocialPostProcessor] previewContent response:', response);
      
      if (hasGraphQLData<{ previewContentExtraction: ProcessSocialPostResult }>(response)) {
        const result = response.data.previewContentExtraction;
        setLastResult(result);
        return result;
      }
      
      throw new Error('Invalid response from previewContentExtraction');
      
    } catch (err) {
      console.error('[useSocialPostProcessor] previewContent error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Preview failed';
      setError(errorMessage);
      
      return {
        __typename: 'ProcessSocialPostResult' as const,
        success: false,
        socialPostId: null,
        processingStatus: 'FAILED' as SocialPostProcessingStatus,
        error: errorMessage,
      };
      
    } finally {
      setProcessingState({
        isProcessing: false,
        currentPostId: null,
        progress: null,
      });
    }
  }, [client]);
  
  // =========================================================================
  // BATCH OPERATIONS
  // =========================================================================
  
  const processBatch = useCallback(async (
    input: ProcessSocialPostBatchInput
  ): Promise<ProcessBatchResult> => {
    const estimatedTotal = input.socialPostIds?.length || input.limit || 50;
    
    setProcessingState({
      isProcessing: true,
      currentPostId: null,
      progress: { current: 0, total: estimatedTotal, stage: 'Starting batch...' },
    });
    setError(null);
    
    try {
      const response = await client.graphql({
        query: processSocialPostBatchMutation,
        variables: { input },
      });
      
      if (hasGraphQLData<{ processSocialPostBatch: ProcessBatchResult }>(response)) {
        const result = response.data.processSocialPostBatch;
        setLastBatchResult(result);
        
        if (!result.success) {
          setError('Batch processing encountered errors');
        }
        
        return result;
      }
      
      throw new Error('Invalid response from processSocialPostBatch');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Batch processing failed';
      setError(errorMessage);
      
      const failedResult: ProcessBatchResult = {
        __typename: 'ProcessBatchResult',
        success: false,
        totalProcessed: 0,
        successCount: 0,
        failedCount: 0,
        skippedCount: 0,
        results: [],
        totalLinksCreated: 0,
        totalExtractionsDone: 0,
        processingTimeMs: 0,
      };
      setLastBatchResult(failedResult);
      return failedResult;
      
    } finally {
      setProcessingState({
        isProcessing: false,
        currentPostId: null,
        progress: null,
      });
    }
  }, [client]);
  
  // =========================================================================
  // LINK OPERATIONS
  // =========================================================================
  
  const linkToGame = useCallback(async (
    input: ManualLinkInput
  ): Promise<SocialPostGameLink> => {
    setError(null);
    
    try {
      const response = await client.graphql({
        query: linkSocialPostToGameMutation,
        variables: { input },
      });
      
      if (hasGraphQLData<{ linkSocialPostToGame: SocialPostGameLink }>(response)) {
        return response.data.linkSocialPostToGame;
      }
      
      throw new Error('Invalid response from linkSocialPostToGame');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Link failed';
      setError(errorMessage);
      throw err;
    }
  }, [client]);
  
  const unlinkFromGame = useCallback(async (
    input: UnlinkInput
  ): Promise<boolean> => {
    setError(null);
    
    try {
      const response = await client.graphql({
        query: unlinkSocialPostFromGameMutation,
        variables: { input },
      });
      
      if (hasGraphQLData<{ unlinkSocialPostFromGame: boolean }>(response)) {
        return response.data.unlinkSocialPostFromGame;
      }
      
      throw new Error('Invalid response from unlinkSocialPostFromGame');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unlink failed';
      setError(errorMessage);
      throw err;
    }
  }, [client]);
  
  const verifyLink = useCallback(async (
    input: VerifyLinkInput
  ): Promise<SocialPostGameLink> => {
    setError(null);
    
    try {
      const response = await client.graphql({
        query: verifySocialPostLinkMutation,
        variables: { input },
      });
      
      if (hasGraphQLData<{ verifySocialPostLink: SocialPostGameLink }>(response)) {
        return response.data.verifySocialPostLink;
      }
      
      throw new Error('Invalid response from verifySocialPostLink');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Verify failed';
      setError(errorMessage);
      throw err;
    }
  }, [client]);
  
  const rejectLink = useCallback(async (
    input: RejectLinkInput
  ): Promise<SocialPostGameLink> => {
    setError(null);
    
    try {
      const response = await client.graphql({
        query: rejectSocialPostLinkMutation,
        variables: { input },
      });
      
      if (hasGraphQLData<{ rejectSocialPostLink: SocialPostGameLink }>(response)) {
        return response.data.rejectSocialPostLink;
      }
      
      throw new Error('Invalid response from rejectSocialPostLink');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Reject failed';
      setError(errorMessage);
      throw err;
    }
  }, [client]);
  
  // =========================================================================
  // QUERIES
  // =========================================================================
  
  const getUnlinkedPosts = useCallback(async (
    input?: GetUnlinkedPostsInput
  ): Promise<UnlinkedPostsConnection> => {
    setError(null);
    
    try {
      const response = await client.graphql({
        query: getUnlinkedSocialPostsQuery,
        variables: { input: input || {} },
      });
      
      if (hasGraphQLData<{ getUnlinkedSocialPosts: UnlinkedPostsConnection }>(response)) {
        return response.data.getUnlinkedSocialPosts;
      }
      
      throw new Error('Invalid response from getUnlinkedSocialPosts');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Query failed';
      setError(errorMessage);
      throw err;
    }
  }, [client]);
  
  const getMatchingStats = useCallback(async (
    input?: GetMatchingStatsInput
  ): Promise<SocialPostMatchingStats> => {
    setError(null);
    
    try {
      const response = await client.graphql({
        query: getSocialPostMatchingStatsQuery,
        variables: { input: input || {} },
      });
      
      if (hasGraphQLData<{ getSocialPostMatchingStats: SocialPostMatchingStats }>(response)) {
        return response.data.getSocialPostMatchingStats;
      }
      
      throw new Error('Invalid response from getSocialPostMatchingStats');
      
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Stats query failed';
      setError(errorMessage);
      throw err;
    }
  }, [client]);
  
  // =========================================================================
  // STATE MANAGEMENT
  // =========================================================================
  
  const clearError = useCallback(() => setError(null), []);
  const clearLastResult = useCallback(() => {
    setLastResult(null);
    setLastBatchResult(null);
  }, []);
  
  // =========================================================================
  // RETURN
  // =========================================================================
  
  return {
    // State
    isProcessing: processingState.isProcessing,
    processingState,
    lastResult,
    lastBatchResult,
    error,
    
    // Single Post Operations
    processSinglePost,
    previewMatch,
    
    // Preview Content (NEW - without saving)
    previewContent,
    
    // Batch Operations
    processBatch,
    
    // Link Operations
    linkToGame,
    unlinkFromGame,
    verifyLink,
    rejectLink,
    
    // Queries
    getUnlinkedPosts,
    getMatchingStats,
    
    // State Management
    clearError,
    clearLastResult,
  };
};

export default useSocialPostProcessor;