// src/pages/social/SocialPulse.tsx
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import { GraphQLResult } from '@aws-amplify/api';
import { 
  Facebook, 
  Instagram, 
  RefreshCw, 
  Plus, 
  Search,
  Link2,
  ExternalLink,
  Heart,
  MessageCircle,
  Share2,
  Clock,
  AlertCircle,
  CheckCircle,
  Pause,
  Play,
  Settings,
  TrendingUp,
  Users,
  Calendar,
  MoreVertical,
  Loader2,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { useSocialAccounts, SocialAccount } from '../../hooks/useSocialAccounts';
import { useSocialPosts, SocialPost } from '../../hooks/useSocialPosts';
import { Link } from 'react-router-dom';

type ViewMode = 'feed' | 'accounts' | 'analytics';
type PlatformFilter = 'all' | 'FACEBOOK' | 'INSTAGRAM';

// GraphQL mutation for triggering scrapes (incremental - only new posts)
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

// Platform icon component
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

// Status badge component
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    INACTIVE: 'bg-slate-100 text-slate-600 border-slate-200',
    PENDING_VERIFICATION: 'bg-amber-100 text-amber-700 border-amber-200',
    ERROR: 'bg-red-100 text-red-700 border-red-200',
    RATE_LIMITED: 'bg-orange-100 text-orange-700 border-orange-200',
  };
  
  const icons: Record<string, React.ReactNode> = {
    ACTIVE: <CheckCircle className="w-3 h-3" />,
    INACTIVE: <Pause className="w-3 h-3" />,
    PENDING_VERIFICATION: <Clock className="w-3 h-3" />,
    ERROR: <AlertCircle className="w-3 h-3" />,
    RATE_LIMITED: <AlertCircle className="w-3 h-3" />,
  };

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${styles[status] || styles.INACTIVE}`}>
      {icons[status]}
      {status.replace(/_/g, ' ')}
    </span>
  );
};

// Helper function to get date key for grouping
const getDateKey = (dateStr: string | null | undefined): string => {
  if (!dateStr) return 'unknown';
  const date = new Date(dateStr);
  return date.toISOString().split('T')[0]; // YYYY-MM-DD
};

// Helper function to format date for display
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

// Horizontal scroll container with navigation buttons
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
      const scrollAmount = 400; // Scroll by roughly one card width
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
    }
  };

  return (
    <div className="mb-8">
      {/* Date Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-slate-800">{dateLabel}</h3>
          <span className="px-2.5 py-1 bg-slate-100 text-slate-600 text-sm font-medium rounded-full">
            {postCount} post{postCount !== 1 ? 's' : ''}
          </span>
        </div>
        
        {/* Navigation Arrows */}
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

      {/* Scrollable Container */}
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

// Social Post Card (updated for horizontal layout with business branding)
const PostCard: React.FC<{ post: SocialPost }> = ({ post }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
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

  // Use denormalized account data from post, or fall back to socialAccount relation
  const account = post.socialAccount as SocialAccount;
  const accountName = post.accountName || account?.accountName || 'Unknown';
  const profileImageUrl = post.accountProfileImageUrl || account?.profileImageUrl;
  const platform = post.platform || account?.platform || '';

  return (
    <div className="flex-shrink-0 w-[380px] bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* Post Header with Business Branding */}
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

      {/* Post Content */}
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

      {/* Post Media */}
      {post.mediaUrls && post.mediaUrls.length > 0 && (
        <div className="px-4 pb-4">
          <div className={`grid gap-2 ${post.mediaUrls.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {(post.mediaUrls.filter(Boolean) as string[]).slice(0, 4).map((url, idx) => (
              <div key={idx} className={`relative rounded-xl overflow-hidden bg-slate-100 ${post.mediaUrls!.length === 1 ? 'aspect-video' : 'aspect-square'}`}>
                <img
                  src={url}
                  alt=""
                  className="w-full h-full object-cover"
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
        </div>
      )}

      {/* Engagement Stats */}
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
  );
};

// Account Card
const AccountCard: React.FC<{
  account: SocialAccount;
  onScrape: (id: string) => void;
  onToggleEnabled: (account: SocialAccount) => void;
  isLoading?: boolean;
}> = ({ account, onScrape, onToggleEnabled, isLoading }) => {
  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString('en-AU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatNumber = (num?: number | null) => {
    if (num === undefined || num === null) return '-';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all">
      {/* Header with gradient */}
      <div className={`h-16 bg-gradient-to-r ${
        account.platform === 'FACEBOOK' 
          ? 'from-blue-500 to-blue-600' 
          : 'from-pink-500 via-purple-500 to-orange-500'
      }`} />
      
      {/* Profile Info */}
      <div className="px-5 pb-5">
        <div className="flex items-start justify-between -mt-8">
          <div className="relative">
            {account.profileImageUrl ? (
              <img
                src={account.profileImageUrl}
                alt={account.accountName}
                className="w-16 h-16 rounded-xl object-cover border-4 border-white shadow-lg"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl border-4 border-white shadow-lg bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-white text-xl font-bold">
                {account.accountName.charAt(0)}
              </div>
            )}
            {/* Full history badge */}
            {account.hasFullHistory && (
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center" title="Full history synced">
                <CheckCircle className="w-3 h-3 text-white" />
              </div>
            )}
          </div>
          <StatusBadge status={account.status} />
        </div>

        <div className="mt-3">
          <h3 className="font-bold text-slate-800 text-lg">{account.accountName}</h3>
          {account.accountHandle && (
            <p className="text-sm text-slate-500">@{account.accountHandle}</p>
          )}
        </div>

        {/* Stats */}
        <div className="mt-4 grid grid-cols-2 gap-4 text-center">
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-2xl font-bold text-slate-800">{formatNumber(account.followerCount)}</p>
            <p className="text-xs text-slate-500 font-medium">Followers</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-2xl font-bold text-slate-800">{formatNumber(account.postCount)}</p>
            <p className="text-xs text-slate-500 font-medium">Posts</p>
          </div>
        </div>

        {/* Last Scraped */}
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Last checked:</span>
            <span className="text-slate-700 font-medium">{formatDate(account.lastScrapedAt)}</span>
          </div>
          {account.lastErrorMessage && (
            <p className="mt-2 text-xs text-red-500 bg-red-50 p-2 rounded-lg">
              {account.lastErrorMessage}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => onScrape(account.id)}
            disabled={isLoading || !account.isScrapingEnabled}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all text-sm"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Fetching...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                Fetch Posts
              </>
            )}
          </button>
          <button
            onClick={() => onToggleEnabled(account)}
            className={`p-2.5 rounded-xl border-2 transition-all ${
              account.isScrapingEnabled
                ? 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                : 'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100'
            }`}
            title={account.isScrapingEnabled ? 'Pause scraping' : 'Enable scraping'}
          >
            {account.isScrapingEnabled ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>
          <a
            href={account.accountUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 transition-all"
            title="View page"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
};

// Main Component
export const SocialPulse: React.FC = () => {
  const client = generateClient();
  // Note: We don't filter by entity here - Social Pulse shows all accounts/posts
  const [viewMode, setViewMode] = useState<ViewMode>('feed');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [scrapingAccountId, setScrapingAccountId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  
  // Use hooks for data - show all accounts/posts across all entities
  const { 
    accounts, 
    loading: accountsLoading, 
    fetchAccounts, 
    toggleScrapingEnabled 
  } = useSocialAccounts({ filterByEntity: false });
  
  const { 
    posts, 
    loading: postsLoading, 
    totalEngagement, 
    refresh: refreshPosts 
  } = useSocialPosts({ filterByEntity: false });

  // Clear notification after delay
  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleScrapeAccount = async (accountId: string) => {
    setScrapingAccountId(accountId);
    try {
      const response = await client.graphql({
        query: triggerSocialScrape,
        variables: { socialAccountId: accountId },
      }) as GraphQLResult<{ triggerSocialScrape: { success: boolean; message?: string; newPostsAdded?: number; postsFound?: number } }>;

      if ('data' in response && response.data?.triggerSocialScrape) {
        const result = response.data.triggerSocialScrape;
        if (result.success) {
          setNotification({
            type: 'success',
            message: result.newPostsAdded && result.newPostsAdded > 0
              ? `Found ${result.newPostsAdded} new post${result.newPostsAdded > 1 ? 's' : ''} (scanned ${result.postsFound || 0})`
              : `No new posts found (scanned ${result.postsFound || 0} recent posts)`
          });
          refreshPosts();
          fetchAccounts();
        } else {
          setNotification({ type: 'error', message: result.message || 'Failed to fetch posts' });
        }
      }
    } catch (err: unknown) {
      const error = err as { errors?: Array<{ message?: string }> };
      if (error?.errors?.[0]?.message?.includes('Cannot query field')) {
        setNotification({ type: 'error', message: 'Social scraping Lambda not deployed yet' });
      } else {
        console.error('Error triggering scrape:', err);
        setNotification({ type: 'error', message: 'Failed to fetch posts' });
      }
    } finally {
      setScrapingAccountId(null);
    }
  };

  const handleToggleScrapingEnabled = async (account: SocialAccount) => {
    try {
      await toggleScrapingEnabled(account);
      setNotification({
        type: 'success',
        message: `Scraping ${account.isScrapingEnabled ? 'paused' : 'enabled'} for ${account.accountName}`
      });
    } catch {
      setNotification({ type: 'error', message: 'Failed to update scraping status' });
    }
  };

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    const enabledAccounts = accounts.filter((a: SocialAccount) => a.isScrapingEnabled && a.status !== 'ERROR');
    let totalNewPosts = 0;

    for (const account of enabledAccounts) {
      try {
        const response = await client.graphql({
          query: triggerSocialScrape,
          variables: { socialAccountId: account.id },
        }) as GraphQLResult<{ triggerSocialScrape: { success: boolean; newPostsAdded?: number } }>;

        if ('data' in response && response.data?.triggerSocialScrape?.success) {
          totalNewPosts += response.data.triggerSocialScrape.newPostsAdded || 0;
        }
      } catch (err) {
        console.error(`Error scraping ${account.accountName}:`, err);
      }
    }

    setIsRefreshing(false);
    setNotification({
      type: 'success',
      message: `Found ${totalNewPosts} new post${totalNewPosts !== 1 ? 's' : ''} across all accounts`
    });
    
    fetchAccounts();
    refreshPosts();
  };

  // Filter posts
  const filteredPosts = useMemo(() => {
    return posts.filter((post: SocialPost) => {
      const account = post.socialAccount as SocialAccount;
      const postPlatform = post.platform || account?.platform;
      if (platformFilter !== 'all' && postPlatform !== platformFilter) return false;
      if (searchQuery && !post.content?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
      return true;
    });
  }, [posts, platformFilter, searchQuery]);

  // Group posts by day, sorted most recent first
  const groupedPosts = useMemo(() => {
    // First, sort all posts by postedAt (most recent first)
    const sortedPosts = [...filteredPosts].sort((a, b) => {
      const dateA = a.postedAt ? new Date(a.postedAt).getTime() : 0;
      const dateB = b.postedAt ? new Date(b.postedAt).getTime() : 0;
      return dateB - dateA; // Most recent first
    });

    // Group by date
    const groups: Map<string, SocialPost[]> = new Map();
    
    for (const post of sortedPosts) {
      const dateKey = getDateKey(post.postedAt);
      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(post);
    }

    // Convert to array and sort date keys (most recent first)
    const sortedGroups = Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === 'unknown') return 1;
      if (b[0] === 'unknown') return -1;
      return b[0].localeCompare(a[0]); // Most recent date first
    });

    return sortedGroups;
  }, [filteredPosts]);

  const filteredAccounts = accounts.filter((account: SocialAccount) => {
    if (platformFilter !== 'all' && account.platform !== platformFilter) return false;
    if (searchQuery && !account.accountName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const activeAccounts = accounts.filter((a: SocialAccount) => a.status === 'ACTIVE').length;
  const isLoading = accountsLoading || postsLoading;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      {/* Notification Toast */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg flex items-center gap-3 ${
          notification.type === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
        }`}>
          {notification.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-green-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-600" />
          )}
          <span className={notification.type === 'success' ? 'text-green-800' : 'text-red-800'}>
            {notification.message}
          </span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  Social Pulse
                </h1>
                <p className="text-slate-500 mt-1">Monitor and manage social media presence across your venues</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleRefreshAll}
                  disabled={isRefreshing || accounts.length === 0}
                  className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh All
                </button>
                <Link
                  to="/social/accounts"
                  className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  Manage
                </Link>
              </div>
            </div>

            {/* Stats Row */}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-4 text-white">
                <div className="flex items-center gap-2 text-indigo-200">
                  <Users className="w-4 h-4" />
                  <span className="text-sm font-medium">Connected Accounts</span>
                </div>
                <p className="text-3xl font-bold mt-2">{accounts.length}</p>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500">
                  <CheckCircle className="w-4 h-4 text-emerald-500" />
                  <span className="text-sm font-medium">Active</span>
                </div>
                <p className="text-3xl font-bold text-slate-800 mt-2">{activeAccounts}</p>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <span className="text-sm font-medium">Total Posts</span>
                </div>
                <p className="text-3xl font-bold text-slate-800 mt-2">{posts.length}</p>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500">
                  <TrendingUp className="w-4 h-4 text-pink-500" />
                  <span className="text-sm font-medium">Engagement</span>
                </div>
                <p className="text-3xl font-bold text-slate-800 mt-2">{totalEngagement.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Tabs & Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4">
            {/* View Mode Tabs */}
            <div className="flex bg-slate-100 rounded-xl p-1">
              {[
                { id: 'feed', label: 'Feed', icon: Calendar },
                { id: 'accounts', label: 'Accounts', icon: Users },
                { id: 'analytics', label: 'Analytics', icon: TrendingUp },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setViewMode(id as ViewMode)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    viewMode === id
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search posts..."
                  className="pl-9 pr-4 py-2 w-48 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Platform Filter */}
              <div className="flex bg-slate-100 rounded-xl p-1">
                {[
                  { id: 'all', label: 'All', icon: null },
                  { id: 'FACEBOOK', label: 'Facebook', icon: Facebook },
                  { id: 'INSTAGRAM', label: 'Instagram', icon: Instagram },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setPlatformFilter(id as PlatformFilter)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      platformFilter === id
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {Icon && <Icon className="w-3.5 h-3.5" />}
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
              <p className="text-slate-500 mt-4">Loading social data...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Feed View - Now with horizontal scrolling day rows */}
            {viewMode === 'feed' && (
              <div className="space-y-2">
                {groupedPosts.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
                    <Calendar className="w-12 h-12 text-slate-300 mx-auto" />
                    <h3 className="text-lg font-semibold text-slate-700 mt-4">No posts yet</h3>
                    <p className="text-slate-500 mt-1">Add social accounts and fetch posts to see them here</p>
                    <Link
                      to="/social/accounts"
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add Account
                    </Link>
                  </div>
                ) : (
                  groupedPosts.map(([dateKey, dayPosts]) => (
                    <HorizontalScrollRow 
                      key={dateKey} 
                      dateLabel={formatDateLabel(dateKey)}
                      postCount={dayPosts.length}
                    >
                      {dayPosts.map((post: SocialPost) => (
                        <PostCard key={post.id} post={post} />
                      ))}
                    </HorizontalScrollRow>
                  ))
                )}
              </div>
            )}

            {/* Accounts View */}
            {viewMode === 'accounts' && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredAccounts.length === 0 ? (
                  <div className="col-span-full text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
                    <Users className="w-12 h-12 text-slate-300 mx-auto" />
                    <h3 className="text-lg font-semibold text-slate-700 mt-4">No accounts connected</h3>
                    <p className="text-slate-500 mt-1">Connect your first social account to get started</p>
                    <Link
                      to="/social/accounts"
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add Account
                    </Link>
                  </div>
                ) : (
                  filteredAccounts.map((account: SocialAccount) => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      onScrape={handleScrapeAccount}
                      onToggleEnabled={handleToggleScrapingEnabled}
                      isLoading={scrapingAccountId === account.id}
                    />
                  ))
                )}
              </div>
            )}

            {/* Analytics View */}
            {viewMode === 'analytics' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                <TrendingUp className="w-16 h-16 text-slate-300 mx-auto" />
                <h3 className="text-xl font-semibold text-slate-700 mt-4">Analytics Coming Soon</h3>
                <p className="text-slate-500 mt-2 max-w-md mx-auto">
                  Track engagement trends, compare performance across platforms, and get insights to optimize your social presence.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add CSS to hide scrollbar */}
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