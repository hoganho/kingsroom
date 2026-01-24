// src/components/social/ScrapeDiscrepanciesTab.tsx
// Tab for viewing and managing scrape discrepancies
// Shows posts with tournament URLs that don't have matching Game records
// Uses extractedTournamentUrl (unique) instead of tournamentId (not unique)
// Filters by entity to ensure correct matching

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import {
  ExclamationCircleIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';
import { 
  Loader2, 
  RefreshCw, 
  SearchX, 
  FileQuestion,
  Unlink,
  Link2,
  Scan,
  ExternalLink,
  Building2,
} from 'lucide-react';
import { format } from 'date-fns';

import type { SocialAccount } from '../../API';

// ===================================================================
// GRAPHQL QUERIES
// ===================================================================

// Query for extraction data with tournament URLs (paginated)
const listExtractionsWithTournamentUrl = /* GraphQL */ `
  query ListExtractionsWithTournamentUrl($limit: Int, $nextToken: String) {
    listSocialPostGameData(
      filter: { extractedTournamentUrl: { attributeExists: true } }
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        socialPostId
        extractedTournamentId
        extractedTournamentUrl
        extractedVenueName
        extractedBuyIn
        extractedDate
        extractedPlayerCount
        extractedPrizePool
        contentType
        matchCandidatesJson
        scrapeDiscrepancyType
        scrapeDiscrepancyDetectedAt
        discrepancyLinkId
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;

// Query for existing PENDING_SCRAPE links
const listPendingScrapeLinks = /* GraphQL */ `
  query ListPendingScrapeLinks($limit: Int, $nextToken: String) {
    listSocialPostGameLinks(
      filter: { linkType: { eq: PENDING_SCRAPE } }
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        socialPostId
        gameId
        linkType
        extractedTournamentId
        extractedTournamentUrl
        matchConfidence
        linkedAt
        scrapeDiscrepancyType
        scrapeDiscrepancyDetectedAt
        discrepancyResolution
        discrepancyResolvedAt
        rescrapeJobId
        rescrapeRequestedAt
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;

// Query for RESCRAPE_REQUESTED links  
const listRescrapeRequestedLinks = /* GraphQL */ `
  query ListRescrapeRequestedLinks($limit: Int, $nextToken: String) {
    listSocialPostGameLinks(
      filter: { linkType: { eq: RESCRAPE_REQUESTED } }
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        socialPostId
        gameId
        linkType
        extractedTournamentId
        extractedTournamentUrl
        matchConfidence
        linkedAt
        scrapeDiscrepancyType
        scrapeDiscrepancyDetectedAt
        discrepancyResolution
        discrepancyResolvedAt
        rescrapeJobId
        rescrapeRequestedAt
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;

// Query game by sourceUrl (using the bySourceUrl GSI)
const queryGameBySourceUrl = /* GraphQL */ `
  query QueryGameBySourceUrl($sourceUrl: AWSURL!) {
    gameBySourceUrl(sourceUrl: $sourceUrl, limit: 10) {
      items {
        id
        tournamentId
        sourceUrl
        gameStatus
        name
        buyIn
        gameStartDateTime
        venueId
        entityId
        createdAt
      }
    }
  }
`;

// Query social post by ID (to get entityId via socialAccount)
const getSocialPostWithAccount = /* GraphQL */ `
  query GetSocialPostWithAccount($id: ID!) {
    getSocialPost(id: $id) {
      id
      platformPostId
      postUrl
      accountName
      platform
      content
      contentPreview
      postedAt
      processingStatus
      contentType
      socialAccountId
      entityId
      venueId
      socialAccount {
        id
        accountName
        entityId
        venueId
        entity {
          id
          entityName
        }
      }
    }
  }
`;

// Mutation to trigger discrepancy re-scrape
const triggerDiscrepancyRescrape = /* GraphQL */ `
  mutation TriggerDiscrepancyRescrape($input: TriggerDiscrepancyRescrapeInput!) {
    triggerDiscrepancyRescrape(input: $input) {
      success
      message
      linkId
      rescrapeJobId
      error
    }
  }
`;

// ===================================================================
// TYPES
// ===================================================================

interface ExtractionData {
  id: string;
  socialPostId: string;
  extractedTournamentId?: number;
  extractedTournamentUrl?: string;
  extractedVenueName?: string;
  extractedBuyIn?: number;
  extractedDate?: string;
  extractedPlayerCount?: number;
  extractedPrizePool?: number;
  contentType?: string;
  matchCandidatesJson?: string;
  scrapeDiscrepancyType?: string;
  scrapeDiscrepancyDetectedAt?: string;
  discrepancyLinkId?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface DiscrepancyLink {
  id: string;
  socialPostId: string;
  gameId: string;
  linkType: string;
  extractedTournamentId?: number;
  extractedTournamentUrl?: string;
  matchConfidence?: number;
  linkedAt?: string;
  scrapeDiscrepancyType?: string;
  scrapeDiscrepancyDetectedAt?: string;
  discrepancyResolution?: string;
  discrepancyResolvedAt?: string;
  rescrapeJobId?: string;
  rescrapeRequestedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface GameRecord {
  id: string;
  tournamentId?: number;
  sourceUrl?: string;
  gameStatus?: string;
  name?: string;
  buyIn?: number;
  gameStartDateTime?: string;
  venueId?: string;
  entityId?: string;
  createdAt?: string;
}

interface SocialPostData {
  id: string;
  platformPostId?: string;
  postUrl?: string;
  accountName?: string;
  platform?: string;
  content?: string;
  contentPreview?: string;
  postedAt?: string;
  processingStatus?: string;
  contentType?: string;
  socialAccountId?: string;
  entityId?: string;
  venueId?: string;
  socialAccount?: {
    id: string;
    accountName?: string;
    entityId?: string;
    venueId?: string;
    entity?: {
      id: string;
      entityName?: string;
    };
  };
}

// Enriched discrepancy for display
interface DiscrepancyItem {
  id: string; // extraction ID or link ID
  type: 'EXTRACTION' | 'LINK';
  extractedTournamentUrl: string;
  extractedTournamentId?: number;
  discrepancyType: 'GAME_NOT_IN_DATABASE' | 'GAME_STATUS_NOT_FOUND' | 'GAME_STATUS_NOT_PUBLISHED' | 'ENTITY_MISMATCH' | 'UNKNOWN';
  detectedAt?: string;
  resolution?: string;
  resolvedAt?: string;
  // Entity info
  entityId?: string;
  entityName?: string;
  // Related data
  socialPostId: string;
  socialPost?: SocialPostData;
  extraction?: ExtractionData;
  link?: DiscrepancyLink;
  game?: GameRecord;
  // Rescrape info
  rescrapeJobId?: string;
  rescrapeRequestedAt?: string;
}

interface ScrapeDiscrepanciesTabProps {
  accounts: SocialAccount[];
}

type DiscrepancyFilter = 'ALL' | 'GAME_NOT_FOUND' | 'GAME_STATUS_ISSUE' | 'ENTITY_MISMATCH' | 'RESCRAPE_PENDING' | 'RESOLVED';

const PROBLEMATIC_GAME_STATUSES = ['NOT_FOUND', 'NOT_PUBLISHED'];

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const ScrapeDiscrepanciesTab: React.FC<ScrapeDiscrepanciesTabProps> = ({ accounts }) => {
  const client = useMemo(() => generateClient(), []);
  
  // State
  const [discrepancies, setDiscrepancies] = useState<DiscrepancyItem[]>([]);
  const [existingLinks, setExistingLinks] = useState<DiscrepancyLink[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  
  // Scan progress
  const [scanProgress, setScanProgress] = useState<{
    stage: string;
    current: number;
    total: number;
  } | null>(null);
  
  // Selection
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());
  
  // Processing
  const [triggeringRescrape, setTriggeringRescrape] = useState<string | null>(null);
  const shouldCancelRef = useRef(false);
  
  // Filters
  const [filter, setFilter] = useState<DiscrepancyFilter>('ALL');
  const [filterAccountId, setFilterAccountId] = useState<string>('');
  const [filterEntityId, setFilterEntityId] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');
  
  // Track if initial fetch is complete
  const hasFetchedRef = useRef(false);

  // Build entity list from accounts
  const entities = useMemo(() => {
    const entityMap = new Map<string, { id: string; name: string }>();
    accounts.forEach(acc => {
      if (acc.entityId && acc.entity) {
        entityMap.set(acc.entityId, { 
          id: acc.entityId, 
          name: (acc.entity as any).entityName || acc.entityId 
        });
      }
    });
    return Array.from(entityMap.values());
  }, [accounts]);

  // =========================================================================
  // FETCH EXISTING DISCREPANCY LINKS
  // =========================================================================
  
  const fetchExistingLinks = useCallback(async () => {
    setLoading(true);
    const allLinks: DiscrepancyLink[] = [];
    
    try {
      // Fetch PENDING_SCRAPE links
      let nextToken: string | null = null;
      do {
        const response: any = await client.graphql({
          query: listPendingScrapeLinks,
          variables: { limit: 500, nextToken },
        });
        
        if ('data' in response && response.data?.listSocialPostGameLinks) {
          allLinks.push(...(response.data.listSocialPostGameLinks.items || []));
          nextToken = response.data.listSocialPostGameLinks.nextToken || null;
        } else {
          break;
        }
      } while (nextToken);
      
      // Fetch RESCRAPE_REQUESTED links
      nextToken = null;
      do {
        const response: any = await client.graphql({
          query: listRescrapeRequestedLinks,
          variables: { limit: 500, nextToken },
        });
        
        if ('data' in response && response.data?.listSocialPostGameLinks) {
          allLinks.push(...(response.data.listSocialPostGameLinks.items || []));
          nextToken = response.data.listSocialPostGameLinks.nextToken || null;
        } else {
          break;
        }
      } while (nextToken);
      
      console.log(`[ScrapeDiscrepanciesTab] Fetched ${allLinks.length} existing discrepancy links`);
      setExistingLinks(allLinks);
      
      // Convert links to discrepancy items
      const items: DiscrepancyItem[] = allLinks
        .filter(link => link.extractedTournamentUrl) // Only those with URLs
        .map(link => ({
          id: link.id,
          type: 'LINK' as const,
          extractedTournamentUrl: link.extractedTournamentUrl!,
          extractedTournamentId: link.extractedTournamentId,
          discrepancyType: (link.scrapeDiscrepancyType as any) || 'UNKNOWN',
          detectedAt: link.scrapeDiscrepancyDetectedAt,
          resolution: link.discrepancyResolution,
          resolvedAt: link.discrepancyResolvedAt,
          socialPostId: link.socialPostId,
          link,
          rescrapeJobId: link.rescrapeJobId,
          rescrapeRequestedAt: link.rescrapeRequestedAt,
        }));
      
      setDiscrepancies(items);
      
    } catch (err) {
      console.error('[ScrapeDiscrepanciesTab] Error fetching links:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch discrepancy links');
    } finally {
      setLoading(false);
    }
  }, [client]);

  // =========================================================================
  // SCAN FOR NEW DISCREPANCIES
  // =========================================================================
  
  const scanForDiscrepancies = useCallback(async () => {
    setScanning(true);
    setError(null);
    shouldCancelRef.current = false;
    
    const foundDiscrepancies: DiscrepancyItem[] = [];
    const existingUrls = new Set(existingLinks.map(l => l.extractedTournamentUrl).filter(Boolean));
    
    try {
      // Step 1: Fetch all extractions with tournament URLs
      setScanProgress({ stage: 'Fetching extractions with tournament URLs...', current: 0, total: 0 });
      
      const allExtractions: ExtractionData[] = [];
      let nextToken: string | null = null;
      let pageCount = 0;
      
      do {
        if (shouldCancelRef.current) break;
        
        pageCount++;
        const response: any = await client.graphql({
          query: listExtractionsWithTournamentUrl,
          variables: { limit: 500, nextToken },
        });
        
        if ('data' in response && response.data?.listSocialPostGameData) {
          const items = response.data.listSocialPostGameData.items || [];
          allExtractions.push(...items);
          nextToken = response.data.listSocialPostGameData.nextToken || null;
          
          setScanProgress({
            stage: `Fetching extractions... (page ${pageCount})`,
            current: allExtractions.length,
            total: allExtractions.length,
          });
        } else {
          break;
        }
      } while (nextToken);
      
      if (shouldCancelRef.current) {
        setScanning(false);
        setScanProgress(null);
        return;
      }
      
      console.log(`[ScrapeDiscrepanciesTab] Found ${allExtractions.length} extractions with tournament URLs`);
      
      // Step 2: Group by unique tournament URL and filter out already-tracked
      const uniqueUrls = [...new Set(
        allExtractions
          .filter(e => e.extractedTournamentUrl && !existingUrls.has(e.extractedTournamentUrl))
          .map(e => e.extractedTournamentUrl!)
      )];
      
      console.log(`[ScrapeDiscrepanciesTab] Checking ${uniqueUrls.length} unique tournament URLs`);
      
      // Step 3: Check each URL against Game.sourceUrl
      for (let i = 0; i < uniqueUrls.length; i++) {
        if (shouldCancelRef.current) break;
        
        const tournamentUrl = uniqueUrls[i];
        
        setScanProgress({
          stage: `Checking URL ${i + 1}/${uniqueUrls.length}...`,
          current: i + 1,
          total: uniqueUrls.length,
        });
        
        // Find extractions for this URL
        const relatedExtractions = allExtractions.filter(
          e => e.extractedTournamentUrl === tournamentUrl
        );
        
        if (relatedExtractions.length === 0) continue;
        
        // Get entity info from social post
        const firstExtraction = relatedExtractions[0];
        let postEntityId: string | undefined;
        let postEntityName: string | undefined;
        
        try {
          const postResponse: any = await client.graphql({
            query: getSocialPostWithAccount,
            variables: { id: firstExtraction.socialPostId },
          });
          
          const post = postResponse.data?.getSocialPost;
          if (post) {
            postEntityId = post.entityId || post.socialAccount?.entityId;
            postEntityName = post.socialAccount?.entity?.entityName;
          }
        } catch (err) {
          console.warn(`[ScrapeDiscrepanciesTab] Failed to fetch post ${firstExtraction.socialPostId}:`, err);
        }
        
        // Query game by sourceUrl
        try {
          const gameResponse: any = await client.graphql({
            query: queryGameBySourceUrl,
            variables: { sourceUrl: tournamentUrl },
          });
          
          const games = gameResponse.data?.gameBySourceUrl?.items || [];
          
          if (games.length === 0) {
            // GAME_NOT_IN_DATABASE - no game with this sourceUrl
            for (const extraction of relatedExtractions) {
              foundDiscrepancies.push({
                id: extraction.id,
                type: 'EXTRACTION',
                extractedTournamentUrl: tournamentUrl,
                extractedTournamentId: extraction.extractedTournamentId,
                discrepancyType: 'GAME_NOT_IN_DATABASE',
                detectedAt: new Date().toISOString(),
                socialPostId: extraction.socialPostId,
                extraction,
                entityId: postEntityId,
                entityName: postEntityName,
              });
            }
          } else {
            // Game(s) found - check status and entity match
            // Find game that matches entity (if entity is known)
            let matchingGame = games[0];
            let entityMismatch = false;
            
            if (postEntityId) {
              const sameEntityGame = games.find((g: GameRecord) => g.entityId === postEntityId);
              if (sameEntityGame) {
                matchingGame = sameEntityGame;
              } else {
                // Game exists but belongs to different entity
                entityMismatch = true;
              }
            }
            
            // Check if game has problematic status
            const hasProblematicStatus = PROBLEMATIC_GAME_STATUSES.includes(matchingGame.gameStatus || '');
            
            if (entityMismatch) {
              for (const extraction of relatedExtractions) {
                foundDiscrepancies.push({
                  id: extraction.id,
                  type: 'EXTRACTION',
                  extractedTournamentUrl: tournamentUrl,
                  extractedTournamentId: extraction.extractedTournamentId,
                  discrepancyType: 'ENTITY_MISMATCH',
                  detectedAt: new Date().toISOString(),
                  socialPostId: extraction.socialPostId,
                  extraction,
                  game: matchingGame,
                  entityId: postEntityId,
                  entityName: postEntityName,
                });
              }
            } else if (hasProblematicStatus) {
              const discrepancyType = matchingGame.gameStatus === 'NOT_FOUND' 
                ? 'GAME_STATUS_NOT_FOUND' 
                : 'GAME_STATUS_NOT_PUBLISHED';
              
              for (const extraction of relatedExtractions) {
                foundDiscrepancies.push({
                  id: extraction.id,
                  type: 'EXTRACTION',
                  extractedTournamentUrl: tournamentUrl,
                  extractedTournamentId: extraction.extractedTournamentId,
                  discrepancyType,
                  detectedAt: new Date().toISOString(),
                  socialPostId: extraction.socialPostId,
                  extraction,
                  game: matchingGame,
                  entityId: postEntityId,
                  entityName: postEntityName,
                });
              }
            }
            // else: Game exists, correct entity, good status - no discrepancy
          }
        } catch (err) {
          console.warn(`[ScrapeDiscrepanciesTab] Error checking URL ${tournamentUrl}:`, err);
          // Continue with next URL
        }
        
        // Small delay to avoid rate limiting
        if (i % 10 === 0 && i > 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      console.log(`[ScrapeDiscrepanciesTab] Found ${foundDiscrepancies.length} new discrepancies`);
      
      // Combine with existing links
      const existingLinkItems: DiscrepancyItem[] = existingLinks
        .filter(link => link.extractedTournamentUrl)
        .map(link => ({
          id: link.id,
          type: 'LINK' as const,
          extractedTournamentUrl: link.extractedTournamentUrl!,
          extractedTournamentId: link.extractedTournamentId,
          discrepancyType: (link.scrapeDiscrepancyType as any) || 'UNKNOWN',
          detectedAt: link.scrapeDiscrepancyDetectedAt,
          resolution: link.discrepancyResolution,
          resolvedAt: link.discrepancyResolvedAt,
          socialPostId: link.socialPostId,
          link,
          rescrapeJobId: link.rescrapeJobId,
          rescrapeRequestedAt: link.rescrapeRequestedAt,
        }));
      
      setDiscrepancies([...existingLinkItems, ...foundDiscrepancies]);
      setSuccessMessage(`Scan complete. Found ${foundDiscrepancies.length} new discrepancies.`);
      
    } catch (err) {
      console.error('[ScrapeDiscrepanciesTab] Error scanning:', err);
      setError(err instanceof Error ? err.message : 'Failed to scan for discrepancies');
    } finally {
      setScanning(false);
      setScanProgress(null);
    }
  }, [client, existingLinks]);

  // =========================================================================
  // TRIGGER RESCRAPE
  // =========================================================================
  
  const handleTriggerRescrape = useCallback(async (item: DiscrepancyItem) => {
    if (!item.extractedTournamentUrl) {
      setError('No tournament URL to rescrape');
      return;
    }
    
    setTriggeringRescrape(item.id);
    setError(null);
    
    try {
      const response: any = await client.graphql({
        query: triggerDiscrepancyRescrape,
        variables: {
          input: {
            tournamentUrl: item.extractedTournamentUrl,
            tournamentId: item.extractedTournamentId,
            socialPostId: item.socialPostId,
            linkId: item.link?.id,
            entityId: item.entityId,
          },
        },
      });
      
      if (response.data?.triggerDiscrepancyRescrape?.success) {
        setSuccessMessage(`Re-scrape triggered for ${item.extractedTournamentUrl}`);
        // Refresh the list
        await fetchExistingLinks();
      } else {
        setError(response.data?.triggerDiscrepancyRescrape?.message || 'Failed to trigger re-scrape');
      }
    } catch (err) {
      console.error('[ScrapeDiscrepanciesTab] Error triggering rescrape:', err);
      setError(err instanceof Error ? err.message : 'Failed to trigger re-scrape');
    } finally {
      setTriggeringRescrape(null);
    }
  }, [client, fetchExistingLinks]);

  // =========================================================================
  // FILTERED DISCREPANCIES (must be before handleBulkRescrape which uses it)
  // =========================================================================
  
  const filteredDiscrepancies = useMemo(() => {
    let filtered = discrepancies;
    
    // Type filter
    switch (filter) {
      case 'GAME_NOT_FOUND':
        filtered = filtered.filter(d => d.discrepancyType === 'GAME_NOT_IN_DATABASE');
        break;
      case 'GAME_STATUS_ISSUE':
        filtered = filtered.filter(d => 
          d.discrepancyType === 'GAME_STATUS_NOT_FOUND' || 
          d.discrepancyType === 'GAME_STATUS_NOT_PUBLISHED'
        );
        break;
      case 'ENTITY_MISMATCH':
        filtered = filtered.filter(d => d.discrepancyType === 'ENTITY_MISMATCH');
        break;
      case 'RESCRAPE_PENDING':
        filtered = filtered.filter(d => 
          d.link?.linkType === 'RESCRAPE_REQUESTED' || d.rescrapeJobId
        );
        break;
      case 'RESOLVED':
        filtered = filtered.filter(d => d.resolution);
        break;
    }
    
    // Entity filter
    if (filterEntityId) {
      filtered = filtered.filter(d => d.entityId === filterEntityId);
    }
    
    // Account filter
    if (filterAccountId) {
      filtered = filtered.filter(d => d.socialPost?.socialAccountId === filterAccountId);
    }
    
    // Search filter
    if (searchText.trim()) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(d => 
        d.extractedTournamentUrl?.toLowerCase().includes(search) ||
        d.extractedTournamentId?.toString().includes(search) ||
        d.socialPost?.content?.toLowerCase().includes(search) ||
        d.socialPost?.accountName?.toLowerCase().includes(search) ||
        d.entityName?.toLowerCase().includes(search)
      );
    }
    
    // Sort by detected date, newest first
    return filtered.sort((a, b) => {
      const dateA = a.detectedAt ? new Date(a.detectedAt).getTime() : 0;
      const dateB = b.detectedAt ? new Date(b.detectedAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [discrepancies, filter, filterEntityId, filterAccountId, searchText]);

  // =========================================================================
  // BULK RESCRAPE
  // =========================================================================
  
  const handleBulkRescrape = useCallback(async () => {
    const itemsToRescrape = filteredDiscrepancies.filter(d => selectedItems.has(d.id));
    
    if (itemsToRescrape.length === 0) {
      setError('No items selected');
      return;
    }
    
    const confirmed = window.confirm(
      `Trigger re-scrape for ${itemsToRescrape.length} item(s)?\n\n` +
      `This will queue scraper jobs for each unique tournament URL.`
    );
    
    if (!confirmed) return;
    
    shouldCancelRef.current = false;
    let successCount = 0;
    let failCount = 0;
    
    // Get unique tournament URLs
    const uniqueUrls = [...new Set(itemsToRescrape.map(i => i.extractedTournamentUrl))];
    
    for (let i = 0; i < uniqueUrls.length; i++) {
      if (shouldCancelRef.current) break;
      
      const url = uniqueUrls[i];
      const item = itemsToRescrape.find(i => i.extractedTournamentUrl === url);
      
      if (!item) continue;
      
      setScanProgress({
        stage: `Triggering rescrape ${i + 1}/${uniqueUrls.length}...`,
        current: i + 1,
        total: uniqueUrls.length,
      });
      
      try {
        const response: any = await client.graphql({
          query: triggerDiscrepancyRescrape,
          variables: {
            input: {
              tournamentUrl: url,
              tournamentId: item.extractedTournamentId,
              socialPostId: item.socialPostId,
              linkId: item.link?.id,
              entityId: item.entityId,
            },
          },
        });
        
        if (response.data?.triggerDiscrepancyRescrape?.success) {
          successCount++;
        } else {
          failCount++;
        }
      } catch (err) {
        failCount++;
      }
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    setScanProgress(null);
    setSuccessMessage(`Re-scrape triggered: ${successCount} success, ${failCount} failed`);
    setSelectedItems(new Set());
    
    // Refresh
    await fetchExistingLinks();
  }, [client, filteredDiscrepancies, selectedItems, fetchExistingLinks]);

  // =========================================================================
  // INITIAL FETCH
  // =========================================================================
  
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetchExistingLinks();
  }, [fetchExistingLinks]);

  // Stats
  const stats = useMemo(() => {
    const gameNotFound = discrepancies.filter(d => d.discrepancyType === 'GAME_NOT_IN_DATABASE').length;
    const statusIssue = discrepancies.filter(d => 
      d.discrepancyType === 'GAME_STATUS_NOT_FOUND' || 
      d.discrepancyType === 'GAME_STATUS_NOT_PUBLISHED'
    ).length;
    const entityMismatch = discrepancies.filter(d => d.discrepancyType === 'ENTITY_MISMATCH').length;
    const rescrapePending = discrepancies.filter(d => 
      d.link?.linkType === 'RESCRAPE_REQUESTED' || d.rescrapeJobId
    ).length;
    const resolved = discrepancies.filter(d => d.resolution).length;
    
    return {
      total: discrepancies.length,
      gameNotFound,
      statusIssue,
      entityMismatch,
      rescrapePending,
      resolved,
      filtered: filteredDiscrepancies.length,
    };
  }, [discrepancies, filteredDiscrepancies]);

  // =========================================================================
  // SELECTION HANDLERS
  // =========================================================================
  
  const toggleSelection = useCallback((id: string) => {
    setSelectedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  
  const selectAll = useCallback(() => {
    setSelectedItems(new Set(filteredDiscrepancies.map(d => d.id)));
  }, [filteredDiscrepancies]);
  
  const deselectAll = useCallback(() => {
    setSelectedItems(new Set());
  }, []);
  
  const toggleExpand = useCallback((id: string) => {
    setExpandedItems(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // =========================================================================
  // UTILITY FUNCTIONS
  // =========================================================================
  
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'MMM d, yyyy h:mm a');
    } catch {
      return dateStr;
    }
  };
  
  const getDiscrepancyBadge = (type: string) => {
    switch (type) {
      case 'GAME_NOT_IN_DATABASE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
            <SearchX className="w-3 h-3" />
            Game Not Found
          </span>
        );
      case 'GAME_STATUS_NOT_FOUND':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <FileQuestion className="w-3 h-3" />
            Status: NOT_FOUND
          </span>
        );
      case 'GAME_STATUS_NOT_PUBLISHED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
            <Unlink className="w-3 h-3" />
            Status: NOT_PUBLISHED
          </span>
        );
      case 'ENTITY_MISMATCH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
            <Building2 className="w-3 h-3" />
            Entity Mismatch
          </span>
        );
      default:
        return (
          <span className="px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {type || 'Unknown'}
          </span>
        );
    }
  };
  
  const getRescrapeStatus = (item: DiscrepancyItem) => {
    if (item.resolution) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircleIcon className="w-3 h-3" />
          Resolved
        </span>
      );
    }
    if (item.rescrapeJobId || item.link?.linkType === 'RESCRAPE_REQUESTED') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
          <Loader2 className="w-3 h-3 animate-spin" />
          Rescrape Pending
        </span>
      );
    }
    return null;
  };
  
  const extractUrlPath = (url: string) => {
    try {
      const parsed = new URL(url);
      return parsed.pathname;
    } catch {
      return url;
    }
  };

  // =========================================================================
  // RENDER
  // =========================================================================
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <LinkIcon className="w-5 h-5 text-orange-500" />
              Scrape Discrepancies
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Posts with tournament URLs that don't have matching Game records.
              Uses <code className="bg-gray-100 px-1 rounded">sourceUrl</code> for accurate matching.
            </p>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={fetchExistingLinks}
              disabled={loading || scanning}
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <button
              onClick={scanForDiscrepancies}
              disabled={loading || scanning}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
            >
              {scanning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Scan className="w-4 h-4 mr-2" />
                  Scan All Posts
                </>
              )}
            </button>
          </div>
        </div>
        
        {/* Scan Progress */}
        {scanProgress && (
          <div className="mb-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
            <div className="flex items-center justify-between">
              <span className="text-sm text-indigo-700">
                {scanProgress.stage}
              </span>
              <span className="text-sm font-medium text-indigo-800">
                {scanProgress.current} / {scanProgress.total}
              </span>
            </div>
            <div className="mt-2 h-2 bg-indigo-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-indigo-600 transition-all"
                style={{ 
                  width: scanProgress.total > 0 
                    ? `${(scanProgress.current / scanProgress.total) * 100}%` 
                    : '0%' 
                }}
              />
            </div>
          </div>
        )}
        
        {/* Error/Success Messages */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
            <ExclamationCircleIcon className="h-5 w-5 text-red-500 flex-shrink-0" />
            <p className="text-red-700 text-sm">{error}</p>
            <button 
              onClick={() => setError(null)}
              className="ml-auto text-red-500 hover:text-red-700"
            >
              ×
            </button>
          </div>
        )}
        
        {successMessage && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0" />
            <p className="text-green-700 text-sm">{successMessage}</p>
            <button 
              onClick={() => setSuccessMessage(null)}
              className="ml-auto text-green-500 hover:text-green-700"
            >
              ×
            </button>
          </div>
        )}
        
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-4">
          <button
            onClick={() => setFilter('ALL')}
            className={`rounded-lg p-3 border-2 transition-all text-left ${
              filter === 'ALL'
                ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                : 'border-gray-200 bg-gray-50 hover:border-gray-300'
            }`}
          >
            <span className="text-sm font-medium text-gray-700">All</span>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
          </button>
          
          <button
            onClick={() => setFilter('GAME_NOT_FOUND')}
            className={`rounded-lg p-3 border-2 transition-all text-left ${
              filter === 'GAME_NOT_FOUND'
                ? 'border-orange-500 bg-orange-50 ring-2 ring-orange-200'
                : 'border-gray-200 bg-orange-50/50 hover:border-orange-300'
            }`}
          >
            <span className="text-sm font-medium text-orange-700 flex items-center gap-1">
              <SearchX className="w-3 h-3" />
              Not Found
            </span>
            <p className="text-2xl font-bold text-orange-800 mt-1">{stats.gameNotFound}</p>
          </button>
          
          <button
            onClick={() => setFilter('GAME_STATUS_ISSUE')}
            className={`rounded-lg p-3 border-2 transition-all text-left ${
              filter === 'GAME_STATUS_ISSUE'
                ? 'border-yellow-500 bg-yellow-50 ring-2 ring-yellow-200'
                : 'border-gray-200 bg-yellow-50/50 hover:border-yellow-300'
            }`}
          >
            <span className="text-sm font-medium text-yellow-700 flex items-center gap-1">
              <FileQuestion className="w-3 h-3" />
              Status Issue
            </span>
            <p className="text-2xl font-bold text-yellow-800 mt-1">{stats.statusIssue}</p>
          </button>
          
          <button
            onClick={() => setFilter('ENTITY_MISMATCH')}
            className={`rounded-lg p-3 border-2 transition-all text-left ${
              filter === 'ENTITY_MISMATCH'
                ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-200'
                : 'border-gray-200 bg-purple-50/50 hover:border-purple-300'
            }`}
          >
            <span className="text-sm font-medium text-purple-700 flex items-center gap-1">
              <Building2 className="w-3 h-3" />
              Entity Mismatch
            </span>
            <p className="text-2xl font-bold text-purple-800 mt-1">{stats.entityMismatch}</p>
          </button>
          
          <button
            onClick={() => setFilter('RESCRAPE_PENDING')}
            className={`rounded-lg p-3 border-2 transition-all text-left ${
              filter === 'RESCRAPE_PENDING'
                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-200'
                : 'border-gray-200 bg-blue-50/50 hover:border-blue-300'
            }`}
          >
            <span className="text-sm font-medium text-blue-700 flex items-center gap-1">
              <Loader2 className="w-3 h-3" />
              Pending
            </span>
            <p className="text-2xl font-bold text-blue-800 mt-1">{stats.rescrapePending}</p>
          </button>
          
          <button
            onClick={() => setFilter('RESOLVED')}
            className={`rounded-lg p-3 border-2 transition-all text-left ${
              filter === 'RESOLVED'
                ? 'border-green-500 bg-green-50 ring-2 ring-green-200'
                : 'border-gray-200 bg-green-50/50 hover:border-green-300'
            }`}
          >
            <span className="text-sm font-medium text-green-700 flex items-center gap-1">
              <CheckCircleIcon className="w-3 h-3" />
              Resolved
            </span>
            <p className="text-2xl font-bold text-green-800 mt-1">{stats.resolved}</p>
          </button>
        </div>
        
        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-end">
          <div className="min-w-[180px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Entity
            </label>
            <select
              value={filterEntityId}
              onChange={(e) => setFilterEntityId(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            >
              <option value="">All Entities</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </div>
          
          <div className="min-w-[180px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Filter by Account
            </label>
            <select
              value={filterAccountId}
              onChange={(e) => setFilterAccountId(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            >
              <option value="">All Accounts</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.accountName} ({account.platform})
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex-1 min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search URL, content, entity..."
                className="w-full pl-9 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
              />
            </div>
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              disabled={filteredDiscrepancies.length === 0}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Select All
            </button>
            <button
              onClick={deselectAll}
              disabled={selectedItems.size === 0}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
            >
              Deselect
            </button>
          </div>
        </div>
      </div>
      
      {/* Results Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
          <span className="ml-3 text-gray-600">Loading discrepancies...</span>
        </div>
      ) : filteredDiscrepancies.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <Link2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">
            {discrepancies.length === 0 ? 'No Discrepancies Found' : 'No Matching Results'}
          </h3>
          <p className="text-gray-600 mb-4">
            {discrepancies.length === 0 
              ? 'Click "Scan All Posts" to check for tournament URLs without matching games.'
              : 'Try adjusting your filters.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 w-12">
                    <input
                      type="checkbox"
                      checked={selectedItems.size === filteredDiscrepancies.length && filteredDiscrepancies.length > 0}
                      onChange={(e) => e.target.checked ? selectAll() : deselectAll()}
                      className="w-4 h-4 rounded text-indigo-600"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Tournament URL
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Entity
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Detected
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredDiscrepancies.map((item) => {
                  const isExpanded = expandedItems.has(item.id);
                  const isSelected = selectedItems.has(item.id);
                  
                  return (
                    <React.Fragment key={item.id}>
                      <tr className={`${isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelection(item.id)}
                            className="w-4 h-4 rounded text-indigo-600"
                          />
                        </td>
                        <td className="px-4 py-3">
                          {getDiscrepancyBadge(item.discrepancyType)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs text-gray-600 truncate max-w-[250px]" title={item.extractedTournamentUrl}>
                              {extractUrlPath(item.extractedTournamentUrl)}
                            </span>
                            <a
                              href={item.extractedTournamentUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-600 hover:text-indigo-800 flex-shrink-0"
                            >
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          </div>
                          {item.extractedTournamentId && (
                            <span className="text-xs text-gray-400">ID: {item.extractedTournamentId}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm text-gray-900">
                            {item.entityName || '-'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatDate(item.detectedAt)}
                        </td>
                        <td className="px-4 py-3">
                          {getRescrapeStatus(item)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => toggleExpand(item.id)}
                              className="p-1 text-gray-400 hover:text-gray-600"
                              title={isExpanded ? 'Collapse' : 'Expand'}
                            >
                              {isExpanded ? (
                                <ChevronUpIcon className="w-4 h-4" />
                              ) : (
                                <ChevronDownIcon className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={() => handleTriggerRescrape(item)}
                              disabled={!!item.resolution || triggeringRescrape === item.id}
                              className="px-2 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {triggeringRescrape === item.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                'Rescrape'
                              )}
                            </button>
                          </div>
                        </td>
                      </tr>
                      
                      {/* Expanded Content */}
                      {isExpanded && (
                        <tr className="bg-gray-50">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="space-y-3">
                              {/* Full URL */}
                              <div>
                                <span className="font-medium text-gray-700 text-sm">Full Tournament URL:</span>
                                <a
                                  href={item.extractedTournamentUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block text-sm text-indigo-600 hover:text-indigo-800 break-all"
                                >
                                  {item.extractedTournamentUrl}
                                </a>
                              </div>
                              
                              {/* Extraction Details */}
                              {item.extraction && (
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                  <div>
                                    <span className="font-medium text-gray-700">Venue:</span>
                                    <p className="text-gray-600">{item.extraction.extractedVenueName || '-'}</p>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-700">Buy-in:</span>
                                    <p className="text-gray-600">
                                      {item.extraction.extractedBuyIn 
                                        ? `$${item.extraction.extractedBuyIn}` 
                                        : '-'}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-700">Date:</span>
                                    <p className="text-gray-600">{item.extraction.extractedDate || '-'}</p>
                                  </div>
                                  <div>
                                    <span className="font-medium text-gray-700">Players:</span>
                                    <p className="text-gray-600">{item.extraction.extractedPlayerCount || '-'}</p>
                                  </div>
                                </div>
                              )}
                              
                              {/* Existing Game Info */}
                              {item.game && (
                                <div className={`p-3 rounded-lg border ${
                                  item.discrepancyType === 'ENTITY_MISMATCH' 
                                    ? 'bg-purple-50 border-purple-200' 
                                    : 'bg-yellow-50 border-yellow-200'
                                }`}>
                                  <span className={`font-medium text-sm ${
                                    item.discrepancyType === 'ENTITY_MISMATCH' ? 'text-purple-800' : 'text-yellow-800'
                                  }`}>
                                    Existing Game ({item.discrepancyType === 'ENTITY_MISMATCH' ? 'Different Entity' : 'Status Issue'}):
                                  </span>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2 text-sm">
                                    <div>
                                      <span className="text-gray-600">ID:</span> {item.game.id.slice(0, 8)}...
                                    </div>
                                    <div>
                                      <span className="text-gray-600">Status:</span> {item.game.gameStatus}
                                    </div>
                                    <div>
                                      <span className="text-gray-600">Name:</span> {item.game.name || '-'}
                                    </div>
                                    <div>
                                      <span className="text-gray-600">Entity ID:</span> {item.game.entityId?.slice(0, 8) || '-'}...
                                    </div>
                                  </div>
                                </div>
                              )}
                              
                              <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                                <span><strong>Social Post ID:</strong> {item.socialPostId.slice(0, 12)}...</span>
                                {item.socialPost?.postUrl && (
                                  <a 
                                    href={item.socialPost.postUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-indigo-600 hover:text-indigo-800"
                                  >
                                    View Original Post →
                                  </a>
                                )}
                                {item.rescrapeJobId && (
                                  <span><strong>Rescrape Job:</strong> {item.rescrapeJobId.slice(0, 12)}...</span>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      
      {/* Sticky Action Bar */}
      {selectedItems.size > 0 && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 -mx-6 -mb-6 flex items-center justify-between shadow-lg">
          <div className="text-sm text-gray-600">
            <strong>{selectedItems.size}</strong> item{selectedItems.size !== 1 ? 's' : ''} selected
            {' '}
            ({new Set(filteredDiscrepancies.filter(d => selectedItems.has(d.id)).map(d => d.extractedTournamentUrl)).size} unique URLs)
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={handleBulkRescrape}
              disabled={selectedItems.size === 0 || scanning}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <ArrowPathIcon className="w-4 h-4 mr-2" />
              Trigger Rescrape for Selected
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ScrapeDiscrepanciesTab;