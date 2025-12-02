// src/pages/social/SocialPulse.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import { 
  Facebook, 
  Instagram, 
  RefreshCw, 
  Search,
  Link2,
  ExternalLink,
  Heart,
  MessageCircle,
  Share2,
  MoreVertical,
  ChevronLeft,
  ChevronRight,
  Filter,
  Check,
  Video,
  Play,
  X,
  Clock // Added for history button
} from 'lucide-react';
import { useSocialAccounts, SocialAccount } from '../../hooks/useSocialAccounts';
import { useSocialPosts, SocialPost } from '../../hooks/useSocialPosts';

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

const PlatformIcon: React.FC<{ platform: string; className?: string }> = ({ platform, className = '' }) => {
  switch (platform) {
    case 'FACEBOOK':
      return <Facebook className={`text-blue-500 ${className}`} />;
    case 'INSTAGRAM':
      return <Instagram className={`text-pink-500 ${className}`} />;
    default:
      return <Link2 className={className} />;
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
    }
  };

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-slate-800">{dateLabel}</h3>
          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-sm font-medium rounded-full">
            {postCount} post{postCount !== 1 ? 's' : ''}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={() => scroll('left')}
            disabled={!canScrollLeft}
            className={`p-2 rounded-full transition-all ${
              canScrollLeft 
                ? 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm' 
                : 'bg-slate-100 text-slate-300 cursor-not-allowed'
            }`}
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => scroll('right')}
            disabled={!canScrollRight}
            className={`p-2 rounded-full transition-all ${
              canScrollRight 
                ? 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 shadow-sm' 
                : 'bg-slate-100 text-slate-300 cursor-not-allowed'
            }`}
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div 
        ref={scrollRef}
        onScroll={checkScrollability}
        className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide"
        style={{ 
          scrollbarWidth: 'none', 
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch'
        }}
      >
        {children}
      </div>
    </div>
  );
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80"
      onClick={onClose}
    >
      <div 
        className="relative bg-white rounded-2xl overflow-hidden max-w-4xl w-full max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-200">
          <h3 className="font-semibold text-slate-800 truncate pr-4">
            {title || 'Video'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="relative bg-black aspect-video">
          <iframe
            src={getFacebookEmbedUrl(videoUrl)}
            className="w-full h-full"
            style={{ border: 'none', overflow: 'hidden' }}
            scrolling="no"
            frameBorder="0"
            allowFullScreen
            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
          />
        </div>

        <div className="p-4 border-t border-slate-200">
          <a
            href={videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            <ExternalLink className="w-4 h-4" />
            Open on Facebook
          </a>
        </div>
      </div>
    </div>
  );
};

interface ExtendedSocialPost extends SocialPost {
  videoUrl?: string | null;
  videoThumbnailUrl?: string | null;
  videoTitle?: string | null;
}

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

  const formatNumber = (num?: number | null) => {
    if (num === undefined || num === null) return '0';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
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

  // Helper to determine if we should stack images (single) or grid them (multiple)
  const hasMultipleImages = post.mediaUrls && post.mediaUrls.length > 1;

  return (
    <>
      {/* Added 'self-start' so shorter cards don't stretch to match taller ones in the flex row */}
      <div className="flex-shrink-0 w-[380px] bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow self-start">
        <div className="p-4 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="relative">
              {profileImageUrl ? (
                <img
                  src={profileImageUrl}
                  alt={accountName}
                  className="w-10 h-10 rounded-full object-cover border-2 border-slate-100"
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm border-2 border-slate-100">
                  {accountName?.charAt(0) || '?'}
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow-sm border border-slate-100">
                <PlatformIcon platform={platform} className="w-3 h-3" />
              </div>
            </div>
            <div>
              <h4 className="font-semibold text-slate-800 text-sm">{accountName}</h4>
              <p className="text-xs text-slate-500">{formatDate(post.postedAt)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {isVideoPost && (
              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full flex items-center gap-1">
                <Video className="w-3 h-3" />
                Video
              </span>
            )}
            {post.isTournamentRelated && (
              <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                Tournament
              </span>
            )}
            {post.isPromotional && (
              <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
                Promo
              </span>
            )}
            <button className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
              <MoreVertical className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        <div className="p-4">
          {post.content && (
            <p className={`text-slate-700 text-sm leading-relaxed ${!isExpanded && post.content.length > 200 ? 'line-clamp-3' : ''}`}>
              {post.content}
            </p>
          )}
          {post.content && post.content.length > 200 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              {isExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>

        {((post.mediaUrls && post.mediaUrls.length > 0) || isVideoPost) && (
          <div className="px-4 pb-4">
            {isVideoPost ? (
              <div 
                className="relative rounded-xl overflow-hidden bg-slate-100 aspect-video cursor-pointer group"
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
                  <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                    <Video className="w-16 h-16 text-slate-500" />
                  </div>
                )}
                
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                  <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
                    <Play className="w-8 h-8 text-slate-800 ml-1" fill="currentColor" />
                  </div>
                </div>

                <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 rounded text-white text-xs font-medium">
                  <Video className="w-3 h-3 inline mr-1" />
                  Video
                </div>
              </div>
            ) : (
              // IMAGE RENDERING LOGIC UPDATED HERE
              <div className={`grid gap-2 ${hasMultipleImages ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {(post.mediaUrls!.filter(Boolean) as string[]).slice(0, 4).map((url, idx) => (
                  <div 
                    key={idx} 
                    className={`relative rounded-xl overflow-hidden bg-slate-100 
                      ${hasMultipleImages ? 'aspect-square' : ''} 
                    `}
                  >
                    <img
                      src={url}
                      alt=""
                      // If single image: h-auto (natural height). If multiple: h-full object-cover (cropped square)
                      className={`w-full ${hasMultipleImages ? 'h-full object-cover' : 'h-auto'}`}
                      loading="lazy"
                    />
                    {idx === 3 && post.mediaUrls!.length > 4 && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <span className="text-white text-2xl font-bold">+{post.mediaUrls!.length - 4}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-5">
            <span className="flex items-center gap-1.5 text-slate-600">
              <Heart className="w-4 h-4 text-red-400" />
              <span className="text-sm font-medium">{formatNumber(post.likeCount || 0)}</span>
            </span>
            <span className="flex items-center gap-1.5 text-slate-600">
              <MessageCircle className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium">{formatNumber(post.commentCount || 0)}</span>
            </span>
            <span className="flex items-center gap-1.5 text-slate-600">
              <Share2 className="w-4 h-4 text-green-400" />
              <span className="text-sm font-medium">{formatNumber(post.shareCount || 0)}</span>
            </span>
          </div>
          {post.postUrl && (
            <a
              href={post.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              View
              <ExternalLink className="w-3.5 h-3.5" />
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
export const SocialPulse: React.FC = () => {
  const client = generateClient();
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [showingHistory, setShowingHistory] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  
  const { 
    accounts, 
    loading: accountsLoading, 
    fetchAccounts 
  } = useSocialAccounts({ filterByEntity: false });
  
  const { 
    posts, 
    loading: postsLoading, 
    refresh: refreshPosts,
    fetchFullHistory,
    hasMore,
    loadMore
  } = useSocialPosts({ 
    filterByEntity: false, 
    daysBack: 7,  // Always fetch last 7 days initially; fetchFullHistory() bypasses this
    limit: 50
  });

  useEffect(() => {
    if (accounts.length > 0 && selectedAccountIds.length === 0) {
      setSelectedAccountIds(accounts.map((a: SocialAccount) => a.id));
    }
  }, [accounts]);

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
    const enabledAccounts = accounts.filter((a: SocialAccount) => a.isScrapingEnabled && a.status !== 'ERROR');
    
    // We use a for...of loop to process requests SEQUENTIALLY.
    // This prevents overwhelming the Lambda backend and avoids the 'Lambda:IllegalArgument' error.
    for (const account of enabledAccounts) {
      try {
        // Explicitly cast to Promise<any> to satisfy TypeScript
        const response = client.graphql({
          query: triggerSocialScrape,
          variables: { socialAccountId: account.id },
        }) as Promise<any>;
        
        await response;
        console.log(`Successfully triggered scrape for ${account.accountName}`);
        
        // Optional: Add a tiny delay between requests to be extra safe
        await new Promise(resolve => setTimeout(resolve, 300));
        
      } catch (err: any) {
        console.error(`Error scraping ${account.accountName}:`, err);
      }
    }

    // Refresh UI after all are processed
    fetchAccounts();
    refreshPosts();
    setIsRefreshing(false);
  };

  const handleLoadHistory = () => {
    setShowingHistory(true);
    // fetchFullHistory bypasses the daysBack filter and loads all posts
    if (fetchFullHistory) {
      fetchFullHistory();
    }
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

  // Combined Loading State
  const isGlobalLoading = (accountsLoading || postsLoading) && posts.length === 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="h-16 flex items-center justify-between gap-4">
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent flex-shrink-0">
              Social Feed
            </h1>

            <div className="flex items-center gap-3">
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search posts..."
                  className="pl-9 pr-4 py-2 w-48 lg:w-64 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
                />
              </div>

              <div className="relative" ref={filterRef}>
                <button 
                    onClick={() => setIsFilterOpen(!isFilterOpen)}
                    className={`flex items-center gap-2 px-3 py-2 border rounded-lg text-sm font-medium transition-colors ${
                        isFilterOpen || selectedAccountIds.length !== accounts.length 
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700' 
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                >
                    <Filter className="w-4 h-4" />
                    <span className="hidden sm:inline">Filter Accounts</span>
                    <span className="inline-flex items-center justify-center bg-indigo-100 text-indigo-700 rounded-full px-2 py-0.5 text-xs">
                        {selectedAccountIds.length}
                    </span>
                </button>

                {isFilterOpen && (
                    <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-100 z-50 py-2 overflow-hidden">
                        <div className="px-4 py-2 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Show Posts From</span>
                            <button 
                                onClick={toggleAllSelection} 
                                className="text-xs text-indigo-600 font-medium hover:text-indigo-800 transition-colors"
                            >
                                {selectedAccountIds.length === accounts.length ? 'Unselect All' : 'Select All'}
                            </button>
                        </div>
                        <div className="max-h-80 overflow-y-auto">
                            {accounts.length === 0 ? (
                                <div className="px-4 py-3 text-sm text-slate-500 text-center">No accounts found</div>
                            ) : (
                                accounts.map((account: SocialAccount) => (
                                    <button
                                        key={account.id}
                                        onClick={() => toggleAccountSelection(account.id)}
                                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center justify-between group transition-colors border-b border-slate-50 last:border-0"
                                    >
                                        <div className="flex items-center gap-3 truncate">
                                            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center">
                                                <PlatformIcon platform={account.platform} className="w-3.5 h-3.5" />
                                            </div>
                                            <span className={`text-sm truncate ${selectedAccountIds.includes(account.id) ? 'text-slate-900 font-medium' : 'text-slate-500'}`}>
                                                {account.accountName}
                                            </span>
                                        </div>
                                        {selectedAccountIds.includes(account.id) && (
                                            <Check className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                                        )}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}
              </div>

              <button
                onClick={handleRefreshAll}
                disabled={isRefreshing || accounts.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-70 disabled:cursor-not-allowed shadow-sm"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">Refresh All</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[1920px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isGlobalLoading ? (
          <div className="flex flex-col items-center justify-center py-40">
            <div className="relative">
              <div className="w-16 h-16 border-4 border-indigo-100 border-t-indigo-600 rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-indigo-600" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-slate-700 mt-6">Refreshing Social Feed</h3>
            <p className="text-slate-500 mt-2">Gathering the latest posts...</p>
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {groupedPosts.length === 0 ? (
                <div className="text-center py-24 bg-white rounded-2xl border border-dashed border-slate-300">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                     <Search className="w-8 h-8 text-slate-300" />
                  </div>
                  <h3 className="text-lg font-semibold text-slate-700">No posts found</h3>
                  <p className="text-slate-500 mt-1 max-w-sm mx-auto">
                    {searchQuery 
                        ? `No results found for "${searchQuery}". Try a different search term.` 
                        : selectedAccountIds.length === 0 
                            ? "You haven't selected any accounts. Use the filter to select accounts." 
                            : "No posts available. Try refreshing the feed."}
                  </p>
                  {selectedAccountIds.length === 0 && (
                      <button 
                        onClick={toggleAllSelection}
                        className="mt-4 text-indigo-600 font-medium hover:underline"
                      >
                          Select all accounts
                      </button>
                  )}
                  {/* Show History Button in empty state if we haven't loaded history yet */}
                  {!showingHistory && selectedAccountIds.length > 0 && !searchQuery && (
                    <button 
                      onClick={handleLoadHistory}
                      className="mt-6 flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors mx-auto font-medium"
                    >
                      <Clock className="w-4 h-4" />
                      Load Older Posts
                    </button>
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

                  {/* Load History Button at bottom of list */}
                  {!showingHistory && (
                    <div className="flex justify-center pt-8 pb-12">
                      <button 
                        onClick={handleLoadHistory}
                        className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 shadow-sm text-slate-600 rounded-full hover:bg-slate-50 hover:text-indigo-600 transition-all font-medium group"
                      >
                        <Clock className="w-4 h-4 group-hover:text-indigo-600" />
                        Load posts older than 7 days
                      </button>
                    </div>
                  )}

                  {/* Load More button after history is loaded */}
                  {showingHistory && hasMore && !postsLoading && (
                    <div className="flex justify-center pt-8 pb-12">
                      <button 
                        onClick={handleLoadMore}
                        className="flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 shadow-sm text-slate-600 rounded-full hover:bg-slate-50 hover:text-indigo-600 transition-all font-medium group"
                      >
                        <RefreshCw className="w-4 h-4 group-hover:text-indigo-600" />
                        Load more posts
                      </button>
                    </div>
                  )}

                  {/* Loading indicator when fetching history */}
                  {showingHistory && postsLoading && (
                     <div className="flex justify-center py-8">
                        <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin" />
                     </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>

      <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};

export default SocialPulse;