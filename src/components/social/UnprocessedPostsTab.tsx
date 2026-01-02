// src/components/social/UnprocessedPostsTab.tsx
// Tab for viewing and reprocessing unprocessed social posts
// Shows posts with processingStatus: 'FAILED' or 'PENDING' and allows selective reprocessing

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import {
  ExclamationCircleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  FunnelIcon,
} from '@heroicons/react/24/outline';
import { Loader2, RefreshCw, Play, AlertTriangle, Clock, XOctagon } from 'lucide-react';
import { format } from 'date-fns';

import { useSocialPostProcessor } from '../../hooks/useSocialPostProcessor';
import { SocialPostProcessingModal } from './SocialPostProcessingModal';
import type { SocialAccount, ProcessSocialPostResult } from '../../API';

// ===================================================================
// GRAPHQL QUERIES
// ===================================================================

// Query for PENDING posts
const listPendingPosts = /* GraphQL */ `
  query ListPendingPosts($limit: Int, $nextToken: String) {
    listSocialPosts(
      filter: { processingStatus: { eq: PENDING } }
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        platformPostId
        postUrl
        postType
        accountName
        platform
        businessLocation
        content
        contentPreview
        postedAt
        processingStatus
        processingError
        contentType
        contentTypeConfidence
        linkedGameId
        socialAccountId
        entityId
        venueId
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;

// Query for FAILED posts
const listFailedPosts = /* GraphQL */ `
  query ListFailedPosts($limit: Int, $nextToken: String) {
    listSocialPosts(
      filter: { processingStatus: { eq: FAILED } }
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        platformPostId
        postUrl
        postType
        accountName
        platform
        businessLocation
        content
        contentPreview
        postedAt
        processingStatus
        processingError
        contentType
        contentTypeConfidence
        linkedGameId
        socialAccountId
        entityId
        venueId
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;

// ===================================================================
// TYPES
// ===================================================================

interface UnprocessedPost {
  id: string;
  platformPostId?: string;
  postUrl?: string;
  postType?: string;
  accountName?: string;
  platform?: string;
  businessLocation?: string;
  content?: string;
  contentPreview?: string;
  postedAt?: string;
  processingStatus?: string;
  processingError?: string;
  contentType?: string;
  contentTypeConfidence?: number;
  linkedGameId?: string;
  socialAccountId?: string;
  entityId?: string;
  venueId?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface UnprocessedPostsTabProps {
  accounts: SocialAccount[];
}

type StatusFilter = 'ALL' | 'PENDING' | 'FAILED';

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const UnprocessedPostsTab: React.FC<UnprocessedPostsTabProps> = ({ accounts }) => {
  const client = useMemo(() => generateClient(), []);
  
  // State
  const [pendingPosts, setPendingPosts] = useState<UnprocessedPost[]>([]);
  const [failedPosts, setFailedPosts] = useState<UnprocessedPost[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [loadingFailed, setLoadingFailed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Selection
  const [selectedPosts, setSelectedPosts] = useState<Set<string>>(new Set());
  const [expandedPosts, setExpandedPosts] = useState<Set<string>>(new Set());
  
  // Processing
  const [isReprocessing, setIsReprocessing] = useState(false);
  const [reprocessProgress, setReprocessProgress] = useState<{
    current: number;
    total: number;
    stage: string;
  } | null>(null);
  const [reprocessResults, setReprocessResults] = useState<{
    success: number;
    failed: number;
    errors: string[];
  } | null>(null);
  
  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [currentModalResult, setCurrentModalResult] = useState<ProcessSocialPostResult | null>(null);
  const [currentModalPost, setCurrentModalPost] = useState<UnprocessedPost | null>(null);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [filterAccountId, setFilterAccountId] = useState<string>('');
  const [searchText, setSearchText] = useState<string>('');
  
  // Processor hook
  const processor = useSocialPostProcessor();
  
  // Combined posts based on current data
  const allPosts = useMemo(() => {
    return [...pendingPosts, ...failedPosts];
  }, [pendingPosts, failedPosts]);
  
  const loading = loadingPending || loadingFailed;
  
  // Track if initial fetch is complete
  const hasFetchedRef = useRef(false);
  
  // =========================================================================
  // FETCH POSTS - Auto-paginate to get ALL posts
  // =========================================================================
  
  const fetchAllPendingPosts = useCallback(async () => {
    setLoadingPending(true);
    const allItems: UnprocessedPost[] = [];
    let nextToken: string | null = null;
    let pageCount = 0;
    
    try {
      do {
        pageCount++;
        console.log(`[UnprocessedPostsTab] Fetching pending posts page ${pageCount}...`);
        
        const response: any = await client.graphql({
          query: listPendingPosts,
          variables: {
            limit: 500, // Max allowed by AppSync
            nextToken,
          },
        });
        
        if ('data' in response && response.data?.listSocialPosts) {
          const items = response.data.listSocialPosts.items || [];
          allItems.push(...items);
          nextToken = response.data.listSocialPosts.nextToken || null;
          
          // Update state progressively so UI shows items as they load
          setPendingPosts([...allItems]);
          
          console.log(`[UnprocessedPostsTab] Fetched ${items.length} pending posts (total: ${allItems.length}), hasMore: ${!!nextToken}`);
        } else {
          break;
        }
      } while (nextToken);
      
      console.log(`[UnprocessedPostsTab] Finished fetching all pending posts: ${allItems.length} total`);
    } catch (err) {
      console.error('[UnprocessedPostsTab] Error fetching pending posts:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch pending posts');
    } finally {
      setLoadingPending(false);
    }
    
    return allItems;
  }, [client]);
  
  const fetchAllFailedPosts = useCallback(async () => {
    setLoadingFailed(true);
    const allItems: UnprocessedPost[] = [];
    let nextToken: string | null = null;
    let pageCount = 0;
    
    try {
      do {
        pageCount++;
        console.log(`[UnprocessedPostsTab] Fetching failed posts page ${pageCount}...`);
        
        const response: any = await client.graphql({
          query: listFailedPosts,
          variables: {
            limit: 500, // Max allowed by AppSync
            nextToken,
          },
        });
        
        if ('data' in response && response.data?.listSocialPosts) {
          const items = response.data.listSocialPosts.items || [];
          allItems.push(...items);
          nextToken = response.data.listSocialPosts.nextToken || null;
          
          // Update state progressively so UI shows items as they load
          setFailedPosts([...allItems]);
          
          console.log(`[UnprocessedPostsTab] Fetched ${items.length} failed posts (total: ${allItems.length}), hasMore: ${!!nextToken}`);
        } else {
          break;
        }
      } while (nextToken);
      
      console.log(`[UnprocessedPostsTab] Finished fetching all failed posts: ${allItems.length} total`);
    } catch (err) {
      console.error('[UnprocessedPostsTab] Error fetching failed posts:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch failed posts');
    } finally {
      setLoadingFailed(false);
    }
    
    return allItems;
  }, [client]);
  
  const fetchAllPosts = useCallback(async () => {
    setError(null);
    console.log('[UnprocessedPostsTab] Starting to fetch all posts...');
    await Promise.all([
      fetchAllPendingPosts(),
      fetchAllFailedPosts(),
    ]);
    console.log('[UnprocessedPostsTab] Finished fetching all posts');
  }, [fetchAllPendingPosts, fetchAllFailedPosts]);
  
  // Initial fetch - only once
  useEffect(() => {
    if (hasFetchedRef.current) return;
    hasFetchedRef.current = true;
    fetchAllPosts();
  }, [fetchAllPosts]);
  
  // =========================================================================
  // FILTERED POSTS
  // =========================================================================
  
  const filteredPosts = useMemo(() => {
    let filtered = allPosts;
    
    // Status filter
    if (statusFilter === 'PENDING') {
      filtered = filtered.filter(p => p.processingStatus === 'PENDING');
    } else if (statusFilter === 'FAILED') {
      filtered = filtered.filter(p => p.processingStatus === 'FAILED');
    }
    
    // Account filter
    if (filterAccountId) {
      filtered = filtered.filter(p => p.socialAccountId === filterAccountId);
    }
    
    // Search filter
    if (searchText.trim()) {
      const search = searchText.toLowerCase();
      filtered = filtered.filter(p => 
        p.content?.toLowerCase().includes(search) ||
        p.contentPreview?.toLowerCase().includes(search) ||
        p.processingError?.toLowerCase().includes(search) ||
        p.accountName?.toLowerCase().includes(search)
      );
    }
    
    // Sort by posted date, newest first
    return filtered.sort((a, b) => {
      const dateA = a.postedAt ? new Date(a.postedAt).getTime() : 0;
      const dateB = b.postedAt ? new Date(b.postedAt).getTime() : 0;
      return dateB - dateA;
    });
  }, [allPosts, statusFilter, filterAccountId, searchText]);
  
  // Stats
  const stats = useMemo(() => ({
    pending: pendingPosts.length,
    failed: failedPosts.length,
    total: allPosts.length,
    filtered: filteredPosts.length,
  }), [pendingPosts.length, failedPosts.length, allPosts.length, filteredPosts.length]);
  
  // =========================================================================
  // SELECTION HANDLERS
  // =========================================================================
  
  const togglePostSelection = useCallback((postId: string) => {
    setSelectedPosts(prev => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  }, []);
  
  const selectAll = useCallback(() => {
    setSelectedPosts(new Set(filteredPosts.map(p => p.id)));
  }, [filteredPosts]);
  
  const deselectAll = useCallback(() => {
    setSelectedPosts(new Set());
  }, []);
  
  const toggleExpand = useCallback((postId: string) => {
    setExpandedPosts(prev => {
      const next = new Set(prev);
      if (next.has(postId)) {
        next.delete(postId);
      } else {
        next.add(postId);
      }
      return next;
    });
  }, []);
  
  // =========================================================================
  // REPROCESSING
  // =========================================================================
  
  const handleReprocessSelected = useCallback(async () => {
    const postsToProcess = filteredPosts.filter(p => selectedPosts.has(p.id));
    
    if (postsToProcess.length === 0) {
      alert('No posts selected');
      return;
    }
    
    const confirmed = window.confirm(
      `Process ${postsToProcess.length} post${postsToProcess.length !== 1 ? 's' : ''}?\n\n` +
      `This will run extraction and matching for each post.`
    );
    
    if (!confirmed) return;
    
    setIsReprocessing(true);
    setReprocessResults(null);
    
    let successCount = 0;
    let failedCount = 0;
    const errors: string[] = [];
    
    for (let i = 0; i < postsToProcess.length; i++) {
      const post = postsToProcess[i];
      
      setReprocessProgress({
        current: i + 1,
        total: postsToProcess.length,
        stage: `Processing ${i + 1} of ${postsToProcess.length}...`,
      });
      
      try {
        const result = await processor.processSinglePost({
          socialPostId: post.id,
          forceReprocess: true,
        });
        
        if (result.success) {
          successCount++;
          // Remove from lists
          if (post.processingStatus === 'PENDING') {
            setPendingPosts(prev => prev.filter(p => p.id !== post.id));
          } else {
            setFailedPosts(prev => prev.filter(p => p.id !== post.id));
          }
          setSelectedPosts(prev => {
            const next = new Set(prev);
            next.delete(post.id);
            return next;
          });
        } else {
          failedCount++;
          errors.push(`${post.accountName || post.id.slice(0, 8)}...: ${result.error || 'Unknown error'}`);
          
          // Move from pending to failed if it was pending
          if (post.processingStatus === 'PENDING') {
            setPendingPosts(prev => prev.filter(p => p.id !== post.id));
            setFailedPosts(prev => [...prev, { ...post, processingStatus: 'FAILED', processingError: result.error ?? undefined }]);
          }
        }
      } catch (err) {
        failedCount++;
        errors.push(`${post.accountName || post.id.slice(0, 8)}...: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }
    
    setReprocessResults({ success: successCount, failed: failedCount, errors });
    setReprocessProgress(null);
    setIsReprocessing(false);
  }, [filteredPosts, selectedPosts, processor]);
  
  const handleViewPost = useCallback(async (post: UnprocessedPost) => {
    // Preview the post processing result
    try {
      const result = await processor.previewMatch(post.id);
      setCurrentModalResult(result);
      setCurrentModalPost(post);
      setModalOpen(true);
    } catch (err) {
      console.error('Failed to preview post:', err);
      alert('Failed to load post details');
    }
  }, [processor]);
  
  const handleCloseModal = useCallback(() => {
    setModalOpen(false);
    setCurrentModalResult(null);
    setCurrentModalPost(null);
  }, []);
  
  const handleLinkToGame = useCallback(async (gameId: string, isPrimary?: boolean) => {
    if (!currentModalPost) throw new Error('No post selected');
    
    const result = await processor.linkToGame({
      socialPostId: currentModalPost.id,
      gameId,
      isPrimaryGame: isPrimary ?? true,
    });
    
    // Remove from lists after successful link
    if (currentModalPost.processingStatus === 'PENDING') {
      setPendingPosts(prev => prev.filter(p => p.id !== currentModalPost.id));
    } else {
      setFailedPosts(prev => prev.filter(p => p.id !== currentModalPost.id));
    }
    setSelectedPosts(prev => {
      const next = new Set(prev);
      next.delete(currentModalPost.id);
      return next;
    });
    
    handleCloseModal();
    return result;
  }, [currentModalPost, processor, handleCloseModal]);
  
  // =========================================================================
  // RENDER
  // =========================================================================
  
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return format(date, 'MMM d, yyyy h:mm a');
    } catch {
      return dateStr;
    }
  };
  
  const getStatusBadge = (status?: string) => {
    if (status === 'PENDING') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          <Clock className="w-3 h-3 mr-1" />
          Pending
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        <XOctagon className="w-3 h-3 mr-1" />
        Failed
      </span>
    );
  };
  
  const getAccountName = (post: UnprocessedPost) => {
    if (post.accountName) return post.accountName;
    if (!post.socialAccountId) return 'Unknown';
    const account = accounts.find(a => a.id === post.socialAccountId);
    return account?.accountName || post.socialAccountId.slice(0, 8) + '...';
  };
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
              <ExclamationCircleIcon className="w-5 h-5 text-amber-500" />
              Unprocessed Posts
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {stats.total} post{stats.total !== 1 ? 's' : ''} awaiting processing or failed.
              Select posts to process them.
            </p>
          </div>
          
          <button
            onClick={fetchAllPosts}
            disabled={loading}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        
        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4 mb-4">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`rounded-lg p-3 border-2 transition-all text-left ${
              statusFilter === 'ALL'
                ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-200'
                : 'border-gray-200 bg-gray-50 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">All</span>
              {statusFilter === 'ALL' && <CheckCircleIcon className="w-4 h-4 text-indigo-600" />}
            </div>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
          </button>
          
          <button
            onClick={() => setStatusFilter('PENDING')}
            className={`rounded-lg p-3 border-2 transition-all text-left ${
              statusFilter === 'PENDING'
                ? 'border-yellow-500 bg-yellow-50 ring-2 ring-yellow-200'
                : 'border-gray-200 bg-yellow-50/50 hover:border-yellow-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-yellow-700 flex items-center gap-1">
                <Clock className="w-4 h-4" />
                Pending
              </span>
              {statusFilter === 'PENDING' && <CheckCircleIcon className="w-4 h-4 text-yellow-600" />}
            </div>
            <p className="text-2xl font-bold text-yellow-800 mt-1">{stats.pending}</p>
          </button>
          
          <button
            onClick={() => setStatusFilter('FAILED')}
            className={`rounded-lg p-3 border-2 transition-all text-left ${
              statusFilter === 'FAILED'
                ? 'border-red-500 bg-red-50 ring-2 ring-red-200'
                : 'border-gray-200 bg-red-50/50 hover:border-red-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-red-700 flex items-center gap-1">
                <XOctagon className="w-4 h-4" />
                Failed
              </span>
              {statusFilter === 'FAILED' && <CheckCircleIcon className="w-4 h-4 text-red-600" />}
            </div>
            <p className="text-2xl font-bold text-red-800 mt-1">{stats.failed}</p>
          </button>
        </div>
        
        {/* Filters */}
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[200px]">
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
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search content or errors..."
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
            />
          </div>
          
          <div className="flex gap-2">
            <button
              onClick={selectAll}
              disabled={filteredPosts.length === 0}
              className="px-3 py-2 text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
            >
              Select All ({filteredPosts.length})
            </button>
            <button
              onClick={deselectAll}
              disabled={selectedPosts.size === 0}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
            >
              Deselect All
            </button>
          </div>
        </div>
      </div>
      
      {/* Reprocess Results */}
      {reprocessResults && (
        <div className={`rounded-lg border p-4 ${
          reprocessResults.failed === 0 
            ? 'bg-green-50 border-green-200' 
            : 'bg-yellow-50 border-yellow-200'
        }`}>
          <div className="flex items-start gap-3">
            {reprocessResults.failed === 0 ? (
              <CheckCircleIcon className="w-5 h-5 text-green-600 mt-0.5" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-yellow-600 mt-0.5" />
            )}
            <div className="flex-1">
              <h4 className="font-medium text-gray-900">Processing Complete</h4>
              <p className="text-sm text-gray-700 mt-1">
                ✅ {reprocessResults.success} succeeded
                {reprocessResults.failed > 0 && ` • ❌ ${reprocessResults.failed} failed`}
              </p>
              {reprocessResults.errors.length > 0 && (
                <details className="mt-2">
                  <summary className="text-sm text-red-600 cursor-pointer">
                    View errors ({reprocessResults.errors.length})
                  </summary>
                  <ul className="mt-2 text-xs text-red-700 space-y-1">
                    {reprocessResults.errors.slice(0, 10).map((err, i) => (
                      <li key={i}>• {err}</li>
                    ))}
                    {reprocessResults.errors.length > 10 && (
                      <li>...and {reprocessResults.errors.length - 10} more</li>
                    )}
                  </ul>
                </details>
              )}
            </div>
            <button
              onClick={() => setReprocessResults(null)}
              className="text-gray-400 hover:text-gray-600"
            >
              <XCircleIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
      
      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}
      
      {/* Loading State */}
      {loading && allPosts.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-indigo-600 mr-2" />
          <span className="text-gray-600">Loading posts...</span>
        </div>
      )}
      
      {/* Loading indicator while fetching more pages */}
      {loading && allPosts.length > 0 && (
        <div className="flex items-center justify-center py-4 bg-blue-50 border border-blue-200 rounded-lg">
          <Loader2 className="w-4 h-4 animate-spin text-blue-600 mr-2" />
          <span className="text-blue-700 text-sm">
            Loading more posts... ({stats.pending} pending, {stats.failed} failed so far)
          </span>
        </div>
      )}
      
      {/* Empty State */}
      {!loading && stats.total === 0 && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-8 text-center">
          <CheckCircleIcon className="w-12 h-12 text-green-500 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-green-800">All Caught Up!</h3>
          <p className="text-sm text-green-700 mt-1">
            No posts need processing at this time.
          </p>
        </div>
      )}
      
      {/* Empty filtered state */}
      {!loading && stats.total > 0 && filteredPosts.length === 0 && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <FunnelIcon className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-700">No Matching Posts</h3>
          <p className="text-sm text-gray-500 mt-1">
            Try adjusting your filters to see posts.
          </p>
          <button
            onClick={() => {
              setStatusFilter('ALL');
              setFilterAccountId('');
              setSearchText('');
            }}
            className="mt-3 text-sm text-indigo-600 hover:text-indigo-800"
          >
            Reset Filters
          </button>
        </div>
      )}
      
      {/* Posts List */}
      {filteredPosts.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedPosts.size === filteredPosts.length && filteredPosts.length > 0}
                      onChange={(e) => e.target.checked ? selectAll() : deselectAll()}
                      className="w-4 h-4 rounded text-indigo-600"
                    />
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Account
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Posted
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Content Preview
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Error
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredPosts.map((post) => {
                  const isExpanded = expandedPosts.has(post.id);
                  const isSelected = selectedPosts.has(post.id);
                  
                  return (
                    <React.Fragment key={post.id}>
                      <tr className={`${isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'}`}>
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePostSelection(post.id)}
                            className="w-4 h-4 rounded text-indigo-600"
                          />
                        </td>
                        <td className="px-4 py-3">
                          {getStatusBadge(post.processingStatus)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="text-sm font-medium text-gray-900">
                            {getAccountName(post)}
                          </div>
                          {post.businessLocation && (
                            <div className="text-xs text-gray-500">{post.businessLocation}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {formatDate(post.postedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-sm text-gray-700 line-clamp-2 max-w-md">
                            {post.contentPreview || post.content?.slice(0, 150) || '-'}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {post.processingError ? (
                            <p className="text-sm text-red-600 line-clamp-2 max-w-xs">
                              {post.processingError}
                            </p>
                          ) : (
                            <span className="text-sm text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => toggleExpand(post.id)}
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
                              onClick={() => handleViewPost(post)}
                              className="px-2 py-1 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                            >
                              View
                            </button>
                          </div>
                        </td>
                      </tr>
                      
                      {/* Expanded Content */}
                      {isExpanded && (
                        <tr className="bg-gray-50">
                          <td colSpan={7} className="px-4 py-4">
                            <div className="space-y-3">
                              <div>
                                <h4 className="text-xs font-semibold text-gray-700 mb-1">Full Content:</h4>
                                <p className="text-sm text-gray-600 whitespace-pre-wrap bg-white p-3 rounded border">
                                  {post.content || 'No content available'}
                                </p>
                              </div>
                              
                              {post.processingError && (
                                <div>
                                  <h4 className="text-xs font-semibold text-red-700 mb-1">Error Details:</h4>
                                  <p className="text-sm text-red-600 bg-red-50 p-3 rounded border border-red-200">
                                    {post.processingError}
                                  </p>
                                </div>
                              )}
                              
                              <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                                <span><strong>ID:</strong> {post.id}</span>
                                {post.postUrl && (
                                  <a 
                                    href={post.postUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="text-indigo-600 hover:text-indigo-800"
                                  >
                                    View Original Post →
                                  </a>
                                )}
                                <span><strong>Created:</strong> {formatDate(post.createdAt)}</span>
                                {post.contentType && (
                                  <span><strong>Type:</strong> {post.contentType}</span>
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
      {selectedPosts.size > 0 && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 -mx-6 -mb-6 flex items-center justify-between shadow-lg">
          <div className="text-sm text-gray-600">
            {isReprocessing ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {reprocessProgress?.stage || 'Processing...'}
              </span>
            ) : (
              <span>
                <strong>{selectedPosts.size}</strong> post{selectedPosts.size !== 1 ? 's' : ''} selected
              </span>
            )}
          </div>
          
          <button
            onClick={handleReprocessSelected}
            disabled={isReprocessing || selectedPosts.size === 0}
            className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isReprocessing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {reprocessProgress ? `${reprocessProgress.current}/${reprocessProgress.total}` : 'Processing...'}
              </>
            ) : (
              <>
                <Play className="w-4 h-4 mr-2" />
                Process Selected
              </>
            )}
          </button>
        </div>
      )}
      
      {/* Processing Modal */}
      {modalOpen && currentModalResult && (
        <SocialPostProcessingModal
          isOpen={modalOpen}
          onClose={handleCloseModal}
          result={currentModalResult}
          postContent={currentModalPost?.content}
          postDate={currentModalPost?.postedAt}
          postUrl={currentModalPost?.postUrl}
          onLinkToGame={handleLinkToGame}
          onReprocess={async () => {
            if (currentModalPost) {
              const result = await processor.processSinglePost({
                socialPostId: currentModalPost.id,
                forceReprocess: true,
              });
              setCurrentModalResult(result);
            }
          }}
        />
      )}
    </div>
  );
};

export default UnprocessedPostsTab;