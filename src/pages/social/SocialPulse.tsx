// src/pages/social/SocialPulse.tsx
// Social feed page with horizontal scrolling post rows grouped by date
// Uses shared SocialPostCard component

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import {
  ArrowPathIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { Facebook, Instagram, Linkedin, Loader2 } from 'lucide-react';

// Components
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { SocialPostCard } from '@/components/social/SocialPostCard';

// Hooks
import { useSocialAccounts, SocialAccount } from '../../hooks/useSocialAccounts';
import { useSocialPosts, SocialPost } from '../../hooks/useSocialPosts';

// GraphQL
const triggerSocialScrape = /* GraphQL */ `
  mutation TriggerSocialScrape($socialAccountId: ID!) {
    triggerSocialScrape(socialAccountId: $socialAccountId) {
      success
      message
      postsFound
      newPostsAdded
    }
  }
`;

// ============================================
// TYPES
// ============================================

interface RefreshLog {
  accountId: string;
  accountName: string;
  status: 'pending' | 'success' | 'error';
  message?: string;
}

// ============================================
// HELPER COMPONENTS
// ============================================

const PlatformIcon: React.FC<{ platform: string; className?: string }> = ({
  platform,
  className = '',
}) => {
  switch (platform) {
    case 'FACEBOOK':
      return <Facebook className={`text-blue-600 dark:text-blue-400 ${className}`} />;
    case 'INSTAGRAM':
      return <Instagram className={`text-pink-600 dark:text-pink-400 ${className}`} />;
    case 'LINKEDIN':
      return <Linkedin className={`text-blue-700 dark:text-blue-500 ${className}`} />;
    default:
      return null;
  }
};

const getDateKey = (dateStr: string | null | undefined): string => {
  if (!dateStr) return 'unknown';
  const date = new Date(dateStr);
  return date.toISOString().split('T')[0];
};

const formatDateLabel = (dateKey: string): string => {
  if (dateKey === 'unknown') return 'Unknown Date';

  const date = new Date(dateKey + 'T00:00:00');
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  const isToday = date.toDateString() === today.toDateString();
  const isYesterday = date.toDateString() === yesterday.toDateString();

  if (isToday) return 'Today';
  if (isYesterday) return 'Yesterday';

  return date.toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined,
  });
};

const HorizontalScrollRow: React.FC<{
  dateLabel: string;
  postCount: number;
  children: React.ReactNode;
}> = ({ dateLabel, postCount, children }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScroll = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [children]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 400;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className="relative">
      {/* Date Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-semibold text-gray-900 dark:text-gray-50">{dateLabel}</h3>
          <Badge variant="neutral" className="text-xs">
            {postCount} post{postCount !== 1 ? 's' : ''}
          </Badge>
        </div>
      </div>

      {/* Scroll Container */}
      <div className="relative group">
        {/* Left Arrow */}
        {canScrollLeft && (
          <button
            onClick={() => scroll('left')}
            className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white dark:bg-gray-800 shadow-lg rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all opacity-0 group-hover:opacity-100 -translate-x-1/2"
          >
            <ChevronLeftIcon className="w-5 h-5" />
          </button>
        )}

        {/* Right Arrow */}
        {canScrollRight && (
          <button
            onClick={() => scroll('right')}
            className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-white dark:bg-gray-800 shadow-lg rounded-full flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all opacity-0 group-hover:opacity-100 translate-x-1/2"
          >
            <ChevronRightIcon className="w-5 h-5" />
          </button>
        )}

        {/* Scrollable Area */}
        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide scroll-smooth"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {children}
        </div>
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const SocialPulse: React.FC = () => {
  const client = useMemo(() => generateClient(), []);

  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [showAccountFilter, setShowAccountFilter] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showRefreshModal, setShowRefreshModal] = useState(false);
  const [refreshLogs, setRefreshLogs] = useState<RefreshLog[]>([]);
  const [showingHistory, setShowingHistory] = useState(false);

  // Hooks
  const { accounts, loading: accountsLoading } = useSocialAccounts();
  const {
    posts,
    loading: postsLoading,
    fetchPosts,
    fetchFullHistory,
    hasMore,
  } = useSocialPosts({
    accountIds: selectedAccountIds.length > 0 ? selectedAccountIds : undefined,
    daysBack: showingHistory ? undefined : 7,
    autoFetch: false,
  });

  // Initialize selected accounts when accounts load
  useEffect(() => {
    if (accounts.length > 0 && selectedAccountIds.length === 0) {
      setSelectedAccountIds(accounts.map((a) => a.id));
    }
  }, [accounts, selectedAccountIds.length]);

  // Fetch posts when selected accounts change
  useEffect(() => {
    if (selectedAccountIds.length > 0) {
      fetchPosts();
    }
  }, [selectedAccountIds, fetchPosts]);

  // Filter and sort posts
  const filteredAndSortedPosts = useMemo(() => {
    let filtered = posts;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (post) =>
          post.content?.toLowerCase().includes(query) ||
          post.accountName?.toLowerCase().includes(query)
      );
    }

    return filtered.sort((a, b) => {
      const dateA = new Date(a.postedAt || 0).getTime();
      const dateB = new Date(b.postedAt || 0).getTime();
      return dateB - dateA;
    });
  }, [posts, searchQuery]);

  // Group posts by date
  const groupedPosts = useMemo(() => {
    const groups = new Map<string, SocialPost[]>();

    filteredAndSortedPosts.forEach((post) => {
      const dateKey = getDateKey(post.postedAt);
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(post);
    });

    return Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === 'unknown') return 1;
      if (b[0] === 'unknown') return -1;
      return b[0].localeCompare(a[0]);
    });
  }, [filteredAndSortedPosts]);

  const toggleAccountSelection = (accountId: string) => {
    setSelectedAccountIds((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
    );
  };

  const handleRefreshAll = async () => {
    if (selectedAccountIds.length === 0) return;

    setIsRefreshing(true);
    setShowRefreshModal(true);

    // Initialize logs
    const selectedAccounts = accounts.filter((a) => selectedAccountIds.includes(a.id));
    setRefreshLogs(
      selectedAccounts.map((a) => ({
        accountId: a.id,
        accountName: a.accountName,
        status: 'pending',
      }))
    );

    // Process each account sequentially
    for (const account of selectedAccounts) {
      try {
        const response = (await client.graphql({
          query: triggerSocialScrape,
          variables: { socialAccountId: account.id },
        })) as any;

        const result = response.data?.triggerSocialScrape;

        setRefreshLogs((prev) =>
          prev.map((log) =>
            log.accountId === account.id
              ? {
                  ...log,
                  status: result?.success ? 'success' : 'error',
                  message: result?.success
                    ? `Found ${result.postsFound || 0} posts, added ${result.newPostsAdded || 0} new`
                    : result?.message || 'Unknown error',
                }
              : log
          )
        );
      } catch (error: any) {
        setRefreshLogs((prev) =>
          prev.map((log) =>
            log.accountId === account.id
              ? { ...log, status: 'error', message: error?.message || 'Failed to refresh' }
              : log
          )
        );
      }
    }

    setIsRefreshing(false);
    fetchPosts();
  };

  const handleLoadHistory = () => {
    setShowingHistory(true);
    fetchFullHistory();
  };

  const handleLoadMore = () => {
    // This would need to be implemented in the hook
  };

  const isGlobalLoading = (postsLoading && posts.length === 0) || accountsLoading;

  return (
    <>
      <div className="max-w-[1800px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Social Pulse</h1>
              <p className="text-gray-500 dark:text-gray-400 mt-1">
                Latest social media activity across all venues
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleRefreshAll}
                disabled={isRefreshing || selectedAccountIds.length === 0}
                variant="primary"
                className="gap-2"
              >
                {isRefreshing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowPathIcon className="w-4 h-4" />
                )}
                Refresh All
              </Button>
            </div>
          </div>
        </div>

        {/* Search and Filter Bar */}
        <div className="mb-6 flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <Input
              type="text"
              placeholder="Search posts..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          <div className="flex gap-2">
            {/* Account Filter Dropdown */}
            <div className="relative">
              <Button
                variant="secondary"
                onClick={() => setShowAccountFilter(!showAccountFilter)}
                className="gap-2"
              >
                <FunnelIcon className="w-4 h-4" />
                Accounts ({selectedAccountIds.length})
              </Button>

              {showAccountFilter && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-900 rounded-xl shadow-xl border border-gray-200 dark:border-gray-800 z-20 overflow-hidden">
                  <div className="p-3 border-b border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Filter by Account
                      </span>
                      <button
                        onClick={() => setSelectedAccountIds(accounts.map((a) => a.id))}
                        className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
                      >
                        Select All
                      </button>
                    </div>
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {accountsLoading ? (
                      <div className="p-4 text-center text-gray-500">Loading...</div>
                    ) : (
                      accounts.map((account: SocialAccount) => (
                        <button
                          key={account.id}
                          onClick={() => toggleAccountSelection(account.id)}
                          className="w-full text-left px-4 py-2.5 hover:bg-gray-50 dark:hover:bg-gray-800 flex items-center justify-between group transition-colors border-b border-gray-50 dark:border-gray-800/50 last:border-0"
                        >
                          <div className="flex items-center gap-3 truncate">
                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                              <PlatformIcon platform={account.platform} className="w-3.5 h-3.5" />
                            </div>
                            <span
                              className={`text-sm truncate ${selectedAccountIds.includes(account.id) ? 'text-gray-900 dark:text-gray-50 font-medium' : 'text-gray-500 dark:text-gray-400'}`}
                            >
                              {account.accountName}
                            </span>
                          </div>
                          {selectedAccountIds.includes(account.id) && (
                            <CheckCircleIcon className="w-4 h-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                          )}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Content Feed */}
        {isGlobalLoading ? (
          <div className="flex flex-col items-center justify-center py-40">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mt-6">
              Refreshing Social Feed
            </h3>
            <p className="text-gray-500 dark:text-gray-400 mt-2">Gathering the latest posts...</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {groupedPosts.length === 0 ? (
                <div className="text-center py-24 bg-white dark:bg-gray-900 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
                  <div className="w-16 h-16 bg-gray-50 dark:bg-gray-800 rounded-full flex items-center justify-center mx-auto mb-4">
                    <MagnifyingGlassIcon className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                    No posts found
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
                    {searchQuery
                      ? `No results found for "${searchQuery}".`
                      : 'No posts available. Try refreshing or loading history.'}
                  </p>
                  {!showingHistory && selectedAccountIds.length > 0 && !searchQuery && (
                    <Button onClick={handleLoadHistory} variant="secondary" className="mt-6">
                      <ClockIcon className="w-4 h-4 mr-2" />
                      Load Older Posts
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  {groupedPosts.map(([dateKey, dayPosts]) => (
                    <HorizontalScrollRow
                      key={dateKey}
                      dateLabel={formatDateLabel(dateKey)}
                      postCount={dayPosts.length}
                    >
                      {dayPosts.map((post: SocialPost) => (
                        <SocialPostCard
                          key={post.id}
                          post={post}
                          variant="pulse"
                          enableVideoModal
                        />
                      ))}
                    </HorizontalScrollRow>
                  ))}

                  {/* Load History / More Buttons */}
                  <div className="flex justify-center pt-8 pb-12">
                    {!showingHistory ? (
                      <Button
                        onClick={handleLoadHistory}
                        variant="secondary"
                        size="lg"
                        className="rounded-full shadow-sm"
                      >
                        <ClockIcon className="w-4 h-4 mr-2" />
                        Load posts older than 7 days
                      </Button>
                    ) : hasMore && !postsLoading ? (
                      <Button
                        onClick={handleLoadMore}
                        variant="secondary"
                        size="lg"
                        className="rounded-full shadow-sm"
                      >
                        <ArrowPathIcon className="w-4 h-4 mr-2" />
                        Load more posts
                      </Button>
                    ) : (
                      postsLoading && (
                        <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
                      )
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>

      {/* Refresh Progress Modal */}
      {showRefreshModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-xl w-full max-w-lg overflow-hidden flex flex-col max-h-[80vh] border border-gray-200 dark:border-gray-800">
            {/* Header */}
            <div className="p-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center gap-3">
                {isRefreshing ? (
                  <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-full">
                    <Loader2 className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-spin" />
                  </div>
                ) : (
                  <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-full">
                    <CheckCircleIcon className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                )}
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-gray-50">
                    {isRefreshing ? 'Refreshing Social Feeds' : 'Refresh Complete'}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {isRefreshing
                      ? 'Please wait while we contact Facebook...'
                      : 'All accounts have been processed.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Scrollable Log List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {refreshLogs.length === 0 ? (
                <div className="text-center text-gray-500 py-8">Preparing accounts...</div>
              ) : (
                refreshLogs.map((log) => (
                  <div
                    key={log.accountId}
                    className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800"
                  >
                    <div className="mt-0.5">
                      {log.status === 'pending' && (
                        <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                      )}
                      {log.status === 'success' && (
                        <CheckCircleIcon className="w-4 h-4 text-green-500" />
                      )}
                      {log.status === 'error' && (
                        <ExclamationCircleIcon className="w-4 h-4 text-red-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-medium ${
                          log.status === 'pending'
                            ? 'text-gray-500'
                            : 'text-gray-900 dark:text-gray-50'
                        }`}
                      >
                        {log.accountName}
                      </p>
                      {log.message && (
                        <p
                          className={`text-xs mt-0.5 ${
                            log.status === 'error'
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-gray-400 dark:text-gray-500'
                          }`}
                        >
                          {log.message}
                        </p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 flex justify-end">
              <Button
                onClick={() => setShowRefreshModal(false)}
                disabled={isRefreshing}
                variant={isRefreshing ? 'ghost' : 'primary'}
              >
                {isRefreshing ? 'Processing...' : 'Close'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export { SocialPulse };