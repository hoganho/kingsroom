// src/pages/social/SocialPulse.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import { 
  ArrowPathIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  VideoCameraIcon,
  PlayIcon,
  XMarkIcon,
  ClockIcon,
  ArrowTopRightOnSquareIcon,
  HeartIcon,
  ChatBubbleLeftIcon,
  ShareIcon,
  EllipsisVerticalIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon
} from '@heroicons/react/24/outline';
import { 
  Facebook, 
  Instagram, 
  Linkedin,
  Loader2 
} from 'lucide-react';

// Components
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';

// Utilities
import { cx, formatDateTimeAEST, formatCompact } from '@/lib/utils';
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

interface ExtendedSocialPost extends SocialPost {
  videoUrl?: string | null;
  videoThumbnailUrl?: string | null;
  videoTitle?: string | null;
}

// ============================================
// HELPER COMPONENTS
// ============================================

const PlatformIcon: React.FC<{ platform: string; className?: string }> = ({ platform, className = '' }) => {
  switch (platform) {
    case 'FACEBOOK':
      return <Facebook className={`text-blue-600 dark:text-blue-400 ${className}`} />;
    case 'INSTAGRAM':
      return <Instagram className={`text-pink-600 dark:text-pink-400 ${className}`} />;
    case 'LINKEDIN':
      return <Linkedin className={`text-blue-700 dark:text-blue-500 ${className}`} />;
    default:
      return <ArrowTopRightOnSquareIcon className={className} />;
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
    year: date.getFullYear() !== today.getFullYear() ? 'numeric' : undefined
  });
};

const VideoModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string;
  thumbnailUrl?: string;
  title?: string;
}> = ({ isOpen, onClose, videoUrl, title }) => {
  if (!isOpen) return null;

  const getFacebookEmbedUrl = (url: string): string => {
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&width=560`;
  };

  return (
    <div 
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="relative bg-white dark:bg-gray-900 rounded-2xl overflow-hidden max-w-4xl w-full max-h-[90vh] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <h3 className="font-semibold text-gray-900 dark:text-gray-50 truncate pr-4">
            {title || 'Video'}
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={onClose}
            className="p-1"
          >
            <XMarkIcon className="w-5 h-5" />
          </Button>
        </div>

        <div className="relative bg-black aspect-video w-full">
          <iframe
            src={getFacebookEmbedUrl(videoUrl)}
            className="w-full h-full"
            style={{ border: 'none', overflow: 'hidden' }}
            scrolling="no"
            allowFullScreen
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          />
        </div>

        <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950">
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 font-medium"
          >
            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
            Open on Facebook
          </a>
        </div>
      </div>
    </div>
  );
};

const PostCard: React.FC<{ post: SocialPost }> = ({ post }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  
  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  };

  const account = post.socialAccount as SocialAccount;
  const accountName = post.accountName || account?.accountName || 'Unknown';
  const profileImageUrl = post.accountProfileImageUrl || account?.profileImageUrl;
  const platform = post.platform || account?.platform || '';

  const extendedPost = post as ExtendedSocialPost;
  const isVideoPost = post.postType === 'VIDEO' || !!extendedPost.videoUrl;
  const videoUrl = extendedPost.videoUrl || post.postUrl;
  const videoThumbnailUrl = extendedPost.videoThumbnailUrl || post.thumbnailUrl || (post.mediaUrls?.[0] as string);

  const handleVideoClick = () => {
    if (isVideoPost && videoUrl) {
      setShowVideoModal(true);
    }
  };

  const hasMultipleImages = post.mediaUrls && post.mediaUrls.length > 1;

  return (
    <>
      <div className="flex-shrink-0 w-[340px] sm:w-[380px] bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden hover:shadow-md transition-shadow self-start">
        {/* Header */}
        <div className="p-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-3">
            <div className="relative">
              {profileImageUrl ? (
                <img
                  src={profileImageUrl}
                  alt={accountName}
                  className="w-10 h-10 rounded-full object-cover ring-2 ring-gray-100 dark:ring-gray-800"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm ring-2 ring-gray-100 dark:ring-gray-800">
                  {accountName?.charAt(0) || '?'}
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm border border-gray-100 dark:border-gray-700">
                <PlatformIcon platform={platform} className="w-3 h-3" />
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 dark:text-gray-50 text-sm truncate max-w-[180px]">{accountName}</h4>
              <p className="text-xs text-gray-500 dark:text-gray-400">{formatDate(post.postedAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {isVideoPost && (
              <Badge variant="default" className="text-[10px] px-1.5 py-0.5">
                 Video
              </Badge>
            )}
            {post.isTournamentRelated && (
              <Badge variant="warning" className="text-[10px] px-1.5 py-0.5">
                Tourn
              </Badge>
            )}
            <button className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <EllipsisVerticalIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {post.content && (
            <div className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
               <p className={!isExpanded && post.content.length > 200 ? 'line-clamp-3' : ''}>
                  {post.content}
               </p>
               {post.content.length > 200 && (
                <button
                  onClick={() => setIsExpanded(!isExpanded)}
                  className="mt-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {isExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Media */}
        {((post.mediaUrls && post.mediaUrls.length > 0) || isVideoPost) && (
          <div className="px-4 pb-4">
            {isVideoPost ? (
              <div 
                className="relative rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 aspect-video cursor-pointer group"
                onClick={handleVideoClick}
              >
                {videoThumbnailUrl ? (
                  <img
                    src={videoThumbnailUrl}
                    alt="Video thumbnail"
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-900">
                    <VideoCameraIcon className="w-12 h-12 text-gray-600" />
                  </div>
                )}
                
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                  <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <PlayIcon className="w-6 h-6 text-gray-900 ml-1" />
                  </div>
                </div>
              </div>
            ) : (
              <div className={`grid gap-1 ${hasMultipleImages ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {(post.mediaUrls!.filter(Boolean) as string[]).slice(0, 4).map((url, idx) => (
                  <div 
                    key={idx} 
                    className={`relative rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 
                      ${hasMultipleImages ? 'aspect-square' : ''} 
                    `}
                  >
                    <img
                      src={url}
                      alt=""
                      className={`w-full ${hasMultipleImages ? 'h-full object-cover' : 'h-auto'}`}
                      loading="lazy"
                    />
                    {idx === 3 && post.mediaUrls!.length > 4 && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <span className="text-white text-xl font-bold">+{post.mediaUrls!.length - 4}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer Metrics */}
        <div className="px-4 py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/20">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
              <HeartIcon className="w-4 h-4" />
              <span className="text-xs font-medium">{formatCompact(post.likeCount || 0)}</span>
            </span>
            <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
              <ChatBubbleLeftIcon className="w-4 h-4" />
              <span className="text-xs font-medium">{formatCompact(post.commentCount || 0)}</span>
            </span>
            <span className="flex items-center gap-1.5 text-gray-500 dark:text-gray-400">
              <ShareIcon className="w-4 h-4" />
              <span className="text-xs font-medium">{formatCompact(post.shareCount || 0)}</span>
            </span>
          </div>
          {post.postUrl && (
            <a
              href={post.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
            >
              View
              <ArrowTopRightOnSquareIcon className="w-3 h-3" />
            </a>
          )}
        </div>
      </div>

      {isVideoPost && videoUrl && (
        <VideoModal
          isOpen={showVideoModal}
          onClose={() => setShowVideoModal(false)}
          videoUrl={videoUrl}
          thumbnailUrl={videoThumbnailUrl || undefined}
          title={extendedPost.videoTitle || accountName}
        />
      )}
    </>
  );
};

const HorizontalScrollRow: React.FC<{ 
  children: React.ReactNode;
  dateLabel: string;
  postCount: number;
}> = ({ children, dateLabel, postCount }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const checkScrollability = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  useEffect(() => {
    checkScrollability();
    window.addEventListener('resize', checkScrollability);
    return () => window.removeEventListener('resize', checkScrollability);
  }, [children]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 400;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
      setTimeout(checkScrollability, 400);
    }
  };

  return (
    <div className="mb-8 relative group">
      <div className="flex items-center justify-between mb-4 px-1">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">{dateLabel}</h3>
          <Badge variant="neutral" className="rounded-full">
            {postCount} post{postCount !== 1 ? 's' : ''}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
           <Button
             variant="secondary"
             size="sm"
             onClick={() => scroll('left')}
             disabled={!canScrollLeft}
             className="h-8 w-8 p-0 rounded-full"
           >
             <ChevronLeftIcon className="w-4 h-4" />
           </Button>
           <Button
             variant="secondary"
             size="sm"
             onClick={() => scroll('right')}
             disabled={!canScrollRight}
             className="h-8 w-8 p-0 rounded-full"
           >
             <ChevronRightIcon className="w-4 h-4" />
           </Button>
        </div>
      </div>

      <div 
        ref={scrollRef}
        onScroll={checkScrollability}
        className="flex gap-4 overflow-x-auto pb-6 px-1 scrollbar-hide snap-x"
        style={{ 
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none',
        }}
      >
        {children}
      </div>
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

export const SocialPulse: React.FC = () => {
  const client = generateClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [showingHistory, setShowingHistory] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  
  // New state for refresh logs
  const [refreshLogs, setRefreshLogs] = useState<RefreshLog[]>([]);
  const [showRefreshModal, setShowRefreshModal] = useState(false);
  
  const { 
    accounts, 
    loading: accountsLoading, 
    fetchAccounts 
  } = useSocialAccounts({ filterByEntity: false });
  
  // PARALLEL FETCH: Prepare list of IDs
  const allAccountIds = useMemo(() => 
    accounts.map((a: SocialAccount) => a.id), 
  [accounts]);

  const { 
    posts, 
    loading: postsLoading, 
    refresh: refreshPosts,
    hasMore,
    loadMore,
  } = useSocialPosts({ 
    filterByEntity: false, 
    accountIds: allAccountIds.length > 0 ? allAccountIds : undefined,
    daysBack: showingHistory ? undefined : 7,
    limit: 50,
    autoFetch: allAccountIds.length > 0 
  });

  useEffect(() => {
    if (accounts.length > 0 && selectedAccountIds.length === 0) {
      setSelectedAccountIds(accounts.map((a: SocialAccount) => a.id));
    }
  }, [accounts]);

  // Click outside listener for filter dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    setShowRefreshModal(true);
    setRefreshLogs([]); 
    
    const enabledAccounts = accounts.filter((a: SocialAccount) => a.isScrapingEnabled && a.status !== 'ERROR');
    
    const initialLogs: RefreshLog[] = enabledAccounts.map(account => ({
      accountId: account.id,
      accountName: account.accountName,
      status: 'pending'
    }));
    setRefreshLogs(initialLogs);

    for (const account of enabledAccounts) {
      try {
        const response = client.graphql({
          query: triggerSocialScrape,
          variables: { socialAccountId: account.id },
        }) as Promise<any>;
        
        await response;
        
        setRefreshLogs(prev => prev.map(log => 
          log.accountId === account.id 
            ? { ...log, status: 'success', message: 'Scrape triggered successfully' } 
            : log
        ));
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (err: any) {
        console.error(`Error scraping ${account.accountName}:`, err);

        let errorMessage = 'Unknown error occurred';
        if (err.errors && err.errors.length > 0) {
            const rawMsg = err.errors[0].message;
            if (rawMsg.includes('Task timed out')) {
                errorMessage = 'Timeout: Lambda took too long (>25s)';
            } else {
                errorMessage = rawMsg;
            }
        } else if (err.message) {
            errorMessage = err.message;
        }

        setRefreshLogs(prev => prev.map(log => 
          log.accountId === account.id 
            ? { ...log, status: 'error', message: errorMessage } 
            : log
        ));
      }
    }

    fetchAccounts();
    refreshPosts();
    setIsRefreshing(false);
  };

  const handleLoadHistory = () => {
    setShowingHistory(true);
  };

  const handleLoadMore = () => {
    if (hasMore && loadMore) {
      loadMore();
    }
  };

  const toggleAccountSelection = (id: string) => {
    setSelectedAccountIds(prev => 
      prev.includes(id) 
        ? prev.filter(accId => accId !== id) 
        : [...prev, id]
    );
  };

  const toggleAllSelection = () => {
    if (selectedAccountIds.length === accounts.length) {
      setSelectedAccountIds([]);
    } else {
      setSelectedAccountIds(accounts.map((a: SocialAccount) => a.id));
    }
  };

  const filteredPosts = useMemo(() => {
    return posts.filter((post: SocialPost) => {
      const accountId = (post.socialAccount as SocialAccount)?.id || (post.socialAccount as unknown as string);
      
      if (selectedAccountIds.length > 0 && accountId && !selectedAccountIds.includes(accountId)) {
        return false;
      }

      if (searchQuery && !post.content?.toLowerCase().includes(searchQuery.toLowerCase())) {
        return false;
      }
      
      return true;
    });
  }, [posts, searchQuery, selectedAccountIds]);

  const groupedPosts = useMemo(() => {
    const sortedPosts = [...filteredPosts].sort((a, b) => {
      const dateA = a.postedAt ? new Date(a.postedAt).getTime() : 0;
      const dateB = b.postedAt ? new Date(b.postedAt).getTime() : 0;
      return dateB - dateA;
    });

    const groups: Map<string, SocialPost[]> = new Map();
    
    for (const post of sortedPosts) {
      const dateKey = getDateKey(post.postedAt);
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(post);
    }

    const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === 'unknown') return 1;
      if (b[0] === 'unknown') return -1;
      return b[0].localeCompare(a[0]);
    });

    return sortedGroups;
  }, [filteredPosts]);

  // Updated logic: We only show "Global Loading" if we are loading AND have zero posts.
  // This allows the UI to populate progressively.
  const isGlobalLoading = (accountsLoading || postsLoading) && posts.length === 0;

  return (
    <>
      <div className="space-y-6">
        <style>{`
            .scrollbar-hide::-webkit-scrollbar {
            display: none;
            }
            .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
            }
        `}</style>
        
        {/* Page Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
                <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50 sm:text-2xl">
                Social Pulse
                </h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Live feed from Facebook and Instagram
                </p>
            </div>
            
            <div className="flex items-center gap-3">
                <span className="hidden sm:inline-block text-xs text-gray-400 dark:text-gray-500">
                    Updated: {formatDateTimeAEST(new Date())}
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRefreshAll}
                    disabled={isRefreshing}
                    className="h-8 w-8 p-0 border border-gray-200 dark:border-gray-800"
                    title="Refresh All"
                >
                    <ArrowPathIcon className={cx("h-4 w-4", isRefreshing && "animate-spin")} />
                </Button>
            </div>
        </div>

        {/* Controls - Aligned Right */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            
            {/* Search & Local Filter */}
            <div className="flex items-center gap-3 w-full sm:w-auto">
                <div className="flex-1 sm:w-64">
                    <Input
                        type="search" 
                        placeholder="Search posts..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                </div>

                <div className="relative" ref={filterRef}>
                    <Button
                        variant="secondary"
                        onClick={() => setIsFilterOpen(!isFilterOpen)}
                        className={cx(
                            "flex items-center gap-2",
                            (isFilterOpen || selectedAccountIds.length !== accounts.length) && "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-900/20 dark:text-indigo-400"
                        )}
                    >
                        <FunnelIcon className="h-4 w-4" />
                        <span className="hidden sm:inline">Accounts</span>
                        <Badge variant="default" className="ml-1 rounded-full px-1.5 py-0">
                            {selectedAccountIds.length}
                        </Badge>
                    </Button>

                    {isFilterOpen && (
                        <div className="absolute right-0 top-full mt-2 w-72 bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-800 z-50 overflow-hidden">
                            <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/50">
                                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Filter Accounts</span>
                                <button 
                                    onClick={toggleAllSelection} 
                                    className="text-xs text-indigo-600 dark:text-indigo-400 font-medium hover:underline"
                                >
                                    {selectedAccountIds.length === accounts.length ? 'Unselect All' : 'Select All'}
                                </button>
                            </div>
                            <div className="max-h-64 overflow-y-auto">
                                {accounts.length === 0 ? (
                                    <div className="px-4 py-3 text-sm text-gray-500 text-center">No accounts found</div>
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
                                                <span className={`text-sm truncate ${selectedAccountIds.includes(account.id) ? 'text-gray-900 dark:text-gray-50 font-medium' : 'text-gray-500 dark:text-gray-400'}`}>
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
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mt-6">Refreshing Social Feed</h3>
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
                            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">No posts found</h3>
                            <p className="text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
                                {searchQuery 
                                    ? `No results found for "${searchQuery}".` 
                                    : "No posts available. Try refreshing or loading history."}
                            </p>
                            {!showingHistory && selectedAccountIds.length > 0 && !searchQuery && (
                                <Button 
                                    onClick={handleLoadHistory}
                                    variant="secondary"
                                    className="mt-6"
                                >
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
                                        <PostCard key={post.id} post={post} />
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
                                ) : postsLoading && (
                                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
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
                  <div key={log.accountId} className="flex items-start gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
                    <div className="mt-0.5">
                      {log.status === 'pending' && <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />}
                      {log.status === 'success' && <CheckCircleIcon className="w-4 h-4 text-green-500" />}
                      {log.status === 'error' && <ExclamationCircleIcon className="w-4 h-4 text-red-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${
                        log.status === 'pending' ? 'text-gray-500' : 'text-gray-900 dark:text-gray-50'
                      }`}>
                        {log.accountName}
                      </p>
                      {log.message && (
                        <p className={`text-xs mt-0.5 ${
                          log.status === 'error' ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'
                        }`}>
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
                variant={isRefreshing ? "ghost" : "primary"}
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

export default SocialPulse;