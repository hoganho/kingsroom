// src/pages/debug/SocialDebug.tsx
// Debug page for viewing social posts and accounts data
// Updated with post detail modal popup

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { generateClient } from 'aws-amplify/api';
import { format, formatDistanceToNow } from 'date-fns';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { 
  RefreshCw, 
  MessageSquare, 
  Users, 
  Heart, 
  Share2, 
  Image,
  Video,
  FileText,
  ExternalLink,
  CheckCircle,
  XCircle,
  TrendingUp,
  X,
  Facebook,
  Instagram,
  Linkedin,
} from 'lucide-react';
import { formatCurrency } from '../../utils/generalHelpers';

// ==========================================
// TYPES
// ==========================================

type TabType = 'posts' | 'accounts' | 'scrapeAttempts';

interface TabData {
  label: string;
  icon: React.ReactNode;
}

const tabs: Record<TabType, TabData> = {
  posts: { 
    label: 'Social Posts', 
    icon: <MessageSquare className="w-4 h-4" />
  },
  accounts: { 
    label: 'Social Accounts', 
    icon: <Users className="w-4 h-4" />
  },
  scrapeAttempts: { 
    label: 'Scrape Attempts', 
    icon: <RefreshCw className="w-4 h-4" />
  },
};

// ==========================================
// GRAPHQL QUERIES
// ==========================================

const listSocialPostsForDebug = /* GraphQL */ `
  query ListSocialPostsForDebug($limit: Int, $nextToken: String) {
    listSocialPosts(limit: $limit, nextToken: $nextToken) {
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
        mediaUrls
        thumbnailUrl
        likeCount
        commentCount
        shareCount
        reactionCount
        viewCount
        postedAt
        scrapedAt
        status
        isPromotional
        isTournamentResult
        isTournamentRelated
        processingStatus
        contentType
        contentTypeConfidence
        linkedGameId
        linkedGameCount
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

const listSocialAccountsForDebug = /* GraphQL */ `
  query ListSocialAccountsForDebug($limit: Int, $nextToken: String) {
    listSocialAccounts(limit: $limit, nextToken: $nextToken) {
      items {
        id
        platform
        platformAccountId
        accountName
        accountHandle
        accountUrl
        businessLocation
        profileImageUrl
        followerCount
        followingCount
        postCount
        status
        isScrapingEnabled
        scrapeFrequencyMinutes
        lastScrapedAt
        lastSuccessfulScrapeAt
        consecutiveFailures
        lastErrorMessage
        entityId
        venueId
        createdAt
        updatedAt
      }
      nextToken
    }
  }
`;

const listSocialScrapeAttemptsForDebug = /* GraphQL */ `
  query ListSocialScrapeAttemptsForDebug($limit: Int, $nextToken: String) {
    listSocialScrapeAttempts(limit: $limit, nextToken: $nextToken) {
      items {
        id
        status
        startedAt
        completedAt
        durationMs
        syncType
        postsFound
        newPostsAdded
        postsUpdated
        errorMessage
        errorCode
        triggerSource
        triggeredBy
        socialAccountId
        createdAt
      }
      nextToken
    }
  }
`;

// Full post query with extracted data for modal view
const getSocialPostWithExtractedData = /* GraphQL */ `
  query GetSocialPostWithExtractedData($id: ID!) {
    getSocialPost(id: $id) {
      id
      platformPostId
      postUrl
      postType
      accountName
      accountProfileImageUrl
      platform
      businessLocation
      content
      contentPreview
      mediaUrls
      thumbnailUrl
      videoUrl
      videoThumbnailUrl
      videoTitle
      likeCount
      commentCount
      shareCount
      viewCount
      postedAt
      isTournamentRelated
      isTournamentResult
      isPromotional
      tags
      contentType
      contentTypeConfidence
      processingStatus
      linkedGameId
      linkedGameCount
      extractedGameDataId
      extractedGameData {
        id
        contentType
        contentTypeConfidence
        extractedName
        extractedVenueName
        extractedDate
        extractedDayOfWeek
        extractedStartTime
        extractedBuyIn
        extractedGuarantee
        extractedPrizePool
        extractedFirstPlacePrize
        extractedTotalEntries
        extractedTotalUniquePlayers
        extractedGameType
        extractedTournamentType
        extractedSeriesName
        extractedEventNumber
        extractedWinnerName
        extractedWinnerPrize
        placementCount
        extractedAt
        placements {
          items {
            id
            place
            playerName
            cashPrize
            hasNonCashPrize
            nonCashPrizes
            totalEstimatedValue
            wasChop
          }
        }
      }
      socialAccount {
        id
        accountName
        accountHandle
        profileImageUrl
        platform
      }
    }
  }
`;

// ==========================================
// HELPER COMPONENTS
// ==========================================

const RefreshIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const colors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    HIDDEN: 'bg-gray-100 text-gray-800',
    DELETED: 'bg-red-100 text-red-800',
    PENDING: 'bg-yellow-100 text-yellow-800',
    PENDING_VERIFICATION: 'bg-yellow-100 text-yellow-800',
    VERIFIED: 'bg-green-100 text-green-800',
    SUSPENDED: 'bg-red-100 text-red-800',
    SUCCESS: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
    IN_PROGRESS: 'bg-blue-100 text-blue-800',
    LINKED: 'bg-purple-100 text-purple-800',
    PROCESSED: 'bg-blue-100 text-blue-800',
  };
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
};

const PostTypeIcon: React.FC<{ postType: string }> = ({ postType }) => {
  switch (postType) {
    case 'IMAGE':
      return <Image className="w-4 h-4 text-blue-500" />;
    case 'VIDEO':
      return <Video className="w-4 h-4 text-purple-500" />;
    case 'TEXT':
    default:
      return <FileText className="w-4 h-4 text-gray-500" />;
  }
};

const PlatformIcon: React.FC<{ platform?: string | null; className?: string }> = ({ 
  platform, 
  className = 'w-4 h-4' 
}) => {
  switch (platform) {
    case 'FACEBOOK':
      return <Facebook className={`text-blue-600 ${className}`} />;
    case 'INSTAGRAM':
      return <Instagram className={`text-pink-600 ${className}`} />;
    case 'LINKEDIN':
      return <Linkedin className={`text-blue-700 ${className}`} />;
    default:
      return <Share2 className={`text-gray-500 ${className}`} />;
  }
};

const ContentTypeBadge: React.FC<{ contentType?: string | null }> = ({ contentType }) => {
  if (!contentType) return null;
  
  const config: Record<string, { color: string; label: string }> = {
    RESULT: { color: 'bg-green-100 text-green-700 border-green-200', label: 'Result' },
    PROMOTIONAL: { color: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Promo' },
    GENERAL: { color: 'bg-gray-100 text-gray-700 border-gray-200', label: 'General' },
    COMMENT: { color: 'bg-purple-100 text-purple-700 border-purple-200', label: 'Comment' },
  };
  
  const { color, label } = config[contentType] || config.GENERAL;
  
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      {label}
    </span>
  );
};

// ==========================================
// POST DETAIL MODAL COMPONENT
// ==========================================

interface PostDetailModalProps {
  postId: string | null;
  onClose: () => void;
}

const PostDetailModal: React.FC<PostDetailModalProps> = ({ postId, onClose }) => {
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showPlacements, setShowPlacements] = useState(false);
  
  const client = useMemo(() => generateClient(), []);
  
  useEffect(() => {
    if (!postId) return;
    
    const fetchPost = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const response = await client.graphql({
          query: getSocialPostWithExtractedData,
          variables: { id: postId }
        }) as any;
        
        setPost(response.data?.getSocialPost);
      } catch (err) {
        console.error('Error fetching post:', err);
        setError('Failed to load post details');
      } finally {
        setLoading(false);
      }
    };
    
    fetchPost();
  }, [postId, client]);
  
  if (!postId) return null;
  
  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Unknown';
    try {
      return formatDistanceToNow(new Date(dateStr), { addSuffix: true });
    } catch {
      return 'Unknown';
    }
  };
  
  const formatFullDate = (dateStr?: string | null) => {
    if (!dateStr) return '';
    try {
      return format(new Date(dateStr), "EEE, dd MMM yyyy 'at' HH:mm");
    } catch {
      return '';
    }
  };
  
  const formatExtractedDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    try {
      return format(new Date(dateStr), 'EEE, dd MMM yyyy');
    } catch {
      return null;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 transition-opacity" 
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <h2 className="text-lg font-semibold text-gray-900">Post Details</h2>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
          
          {/* Content */}
          <div className="overflow-y-auto max-h-[calc(90vh-80px)] p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
                <span className="ml-3 text-gray-500">Loading post details...</span>
              </div>
            ) : error ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                <p className="text-red-600">{error}</p>
              </div>
            ) : post ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Post Card */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  {/* Post Header */}
                  <div className="p-4 flex items-center justify-between border-b border-gray-100">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        {post.accountProfileImageUrl || post.socialAccount?.profileImageUrl ? (
                          <img
                            src={post.accountProfileImageUrl || post.socialAccount?.profileImageUrl}
                            alt={post.accountName}
                            className="w-10 h-10 rounded-full object-cover ring-2 ring-gray-100"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm ring-2 ring-gray-100">
                            {post.accountName?.charAt(0) || '?'}
                          </div>
                        )}
                        <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow-sm border border-gray-100">
                          <PlatformIcon platform={post.platform} className="w-3 h-3" />
                        </div>
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 text-sm truncate max-w-[200px]">
                          {post.accountName || post.socialAccount?.accountName || 'Unknown'}
                        </h4>
                        <p className="text-xs text-gray-500" title={formatFullDate(post.postedAt)}>
                          {formatDate(post.postedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {post.postType === 'VIDEO' && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700">
                          <Video className="w-3 h-3 mr-1" />
                          Video
                        </span>
                      )}
                      <ContentTypeBadge contentType={post.contentType} />
                    </div>
                  </div>

                  {/* Post Content */}
                  <div className="p-4">
                    {post.content && (
                      <div className="text-sm text-gray-700 leading-relaxed">
                        <p className={`whitespace-pre-wrap ${!isExpanded && post.content.length > 300 ? 'line-clamp-6' : ''}`}>
                          {post.content}
                        </p>
                        {post.content.length > 300 && (
                          <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700"
                          >
                            {isExpanded ? 'Show less' : 'Show more'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Post Media */}
                  {post.mediaUrls?.length > 0 && (
                    <div className="px-4 pb-4">
                      <div className={`grid gap-1 ${post.mediaUrls.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {post.mediaUrls.slice(0, 4).map((url: string, idx: number) => (
                          <div 
                            key={idx} 
                            className={`relative rounded-lg overflow-hidden bg-gray-100 ${post.mediaUrls.length > 1 ? 'aspect-square' : ''}`}
                          >
                            <img
                              src={url}
                              alt=""
                              className={`w-full ${post.mediaUrls.length > 1 ? 'h-full object-cover' : 'h-auto'}`}
                              loading="lazy"
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display = 'none';
                              }}
                            />
                            {idx === 3 && post.mediaUrls.length > 4 && (
                              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                                <span className="text-white text-xl font-bold">+{post.mediaUrls.length - 4}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Post Footer */}
                  <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1.5 text-gray-500">
                        <Heart className="w-4 h-4" />
                        <span className="text-xs font-medium">{(post.likeCount || 0).toLocaleString()}</span>
                      </span>
                      <span className="flex items-center gap-1.5 text-gray-500">
                        <MessageSquare className="w-4 h-4" />
                        <span className="text-xs font-medium">{(post.commentCount || 0).toLocaleString()}</span>
                      </span>
                      <span className="flex items-center gap-1.5 text-gray-500">
                        <Share2 className="w-4 h-4" />
                        <span className="text-xs font-medium">{(post.shareCount || 0).toLocaleString()}</span>
                      </span>
                    </div>
                    {post.postUrl && (
                      <a
                        href={post.postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        View Original
                      </a>
                    )}
                  </div>
                </div>

                {/* Right Column - Extracted Data */}
                <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-4">
                  {/* Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-gray-200">
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-indigo-500" />
                      <span className="text-sm font-semibold text-gray-900">Extracted Data</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={post.processingStatus || 'PENDING'} />
                      {post.contentTypeConfidence && (
                        <span className="text-xs text-gray-500">
                          {Math.round(post.contentTypeConfidence * 100)}% confidence
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Game Link Info */}
                  {post.linkedGameId && (
                    <div className="bg-green-50 rounded-lg p-3 border border-green-200">
                      <p className="text-sm text-green-700 font-medium">
                        ✓ Linked to {post.linkedGameCount || 1} game(s)
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <p className="text-xs text-green-600">Game ID: {post.linkedGameId}</p>
                        <Link
                          to={`/games/details/${post.linkedGameId}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-900 bg-green-100 hover:bg-green-200 px-2 py-1 rounded transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink className="w-3 h-3" />
                          View Game
                        </Link>
                      </div>
                    </div>
                  )}

                  {/* Extracted Game Data */}
                  {post.extractedGameData ? (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        {post.extractedGameData.extractedVenueName && (
                          <div className="bg-white rounded-lg p-3 border border-gray-100">
                            <div className="text-xs text-gray-500 mb-1">Venue</div>
                            <p className="text-sm font-semibold text-gray-900 truncate">
                              {post.extractedGameData.extractedVenueName}
                            </p>
                          </div>
                        )}
                        
                        {post.extractedGameData.extractedDate && (
                          <div className="bg-white rounded-lg p-3 border border-gray-100">
                            <div className="text-xs text-gray-500 mb-1">Date</div>
                            <p className="text-sm font-semibold text-gray-900">
                              {formatExtractedDate(post.extractedGameData.extractedDate)}
                            </p>
                            {post.extractedGameData.extractedStartTime && (
                              <p className="text-xs text-gray-500">{post.extractedGameData.extractedStartTime}</p>
                            )}
                          </div>
                        )}
                        
                        {post.extractedGameData.extractedBuyIn && (
                          <div className="bg-white rounded-lg p-3 border border-gray-100">
                            <div className="text-xs text-gray-500 mb-1">Buy-In</div>
                            <p className="text-sm font-semibold text-gray-900">
                              {formatCurrency(post.extractedGameData.extractedBuyIn)}
                            </p>
                          </div>
                        )}
                        
                        {post.extractedGameData.extractedGuarantee && (
                          <div className="bg-white rounded-lg p-3 border border-gray-100">
                            <div className="text-xs text-gray-500 mb-1">Guarantee</div>
                            <p className="text-sm font-semibold text-gray-900">
                              {formatCurrency(post.extractedGameData.extractedGuarantee)}
                            </p>
                          </div>
                        )}
                        
                        {post.extractedGameData.extractedPrizePool && (
                          <div className="bg-white rounded-lg p-3 border border-gray-100">
                            <div className="text-xs text-gray-500 mb-1">Prize Pool</div>
                            <p className="text-sm font-semibold text-green-600">
                              {formatCurrency(post.extractedGameData.extractedPrizePool)}
                            </p>
                          </div>
                        )}
                        
                        {post.extractedGameData.extractedTotalEntries && (
                          <div className="bg-white rounded-lg p-3 border border-gray-100">
                            <div className="text-xs text-gray-500 mb-1">Entries</div>
                            <p className="text-sm font-semibold text-gray-900">
                              {post.extractedGameData.extractedTotalEntries}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Winner Info */}
                      {post.extractedGameData.extractedWinnerName && (
                        <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-lg">🏆</span>
                            <span className="text-xs font-medium text-yellow-700">Winner</span>
                          </div>
                          <p className="text-sm font-semibold text-gray-900">
                            {post.extractedGameData.extractedWinnerName}
                          </p>
                          {post.extractedGameData.extractedWinnerPrize && (
                            <p className="text-sm text-green-600 font-medium">
                              {formatCurrency(post.extractedGameData.extractedWinnerPrize)}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Placements */}
                      {post.extractedGameData.placements?.items?.length > 0 && (
                        <div className="pt-2">
                          <button
                            onClick={() => setShowPlacements(!showPlacements)}
                            className="flex items-center justify-between w-full text-sm font-medium text-gray-700 hover:text-gray-900"
                          >
                            <span>
                              Extracted Results ({post.extractedGameData.placements.items.length})
                            </span>
                            <span className="text-xs text-indigo-600">
                              {showPlacements ? '▲ Hide' : '▼ Show'}
                            </span>
                          </button>
                          
                          {showPlacements && (
                            <div className="mt-3 bg-white rounded-lg border border-gray-100 overflow-hidden max-h-64 overflow-y-auto">
                              <table className="min-w-full divide-y divide-gray-100 text-sm">
                                <thead className="bg-gray-50 sticky top-0">
                                  <tr>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">#</th>
                                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Player</th>
                                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Prize</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                  {post.extractedGameData.placements.items.map((p: any) => (
                                    <tr key={p.id} className="hover:bg-gray-50">
                                      <td className="px-3 py-2 text-gray-900 font-medium">
                                        {p.place === 1 ? '🥇' : p.place === 2 ? '🥈' : p.place === 3 ? '🥉' : p.place}
                                      </td>
                                      <td className="px-3 py-2 text-gray-700">{p.playerName}</td>
                                      <td className="px-3 py-2 text-right">
                                        {p.cashPrize ? (
                                          <span className="text-green-600 font-medium">
                                            {formatCurrency(p.cashPrize)}
                                          </span>
                                        ) : p.hasNonCashPrize ? (
                                          <span className="text-purple-600 text-xs">Non-cash</span>
                                        ) : (
                                          '-'
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Additional Info */}
                      {(post.extractedGameData.extractedSeriesName || 
                        post.extractedGameData.extractedGameType || 
                        post.extractedGameData.extractedTournamentType) && (
                        <div className="pt-2 border-t border-gray-200">
                          <div className="flex flex-wrap gap-2">
                            {post.extractedGameData.extractedSeriesName && (
                              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-indigo-100 text-indigo-700">
                                {post.extractedGameData.extractedSeriesName}
                                {post.extractedGameData.extractedEventNumber && ` #${post.extractedGameData.extractedEventNumber}`}
                              </span>
                            )}
                            {post.extractedGameData.extractedGameType && (
                              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-gray-100 text-gray-700">
                                {post.extractedGameData.extractedGameType}
                              </span>
                            )}
                            {post.extractedGameData.extractedTournamentType && (
                              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-gray-100 text-gray-700">
                                {post.extractedGameData.extractedTournamentType}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <FileText className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm">No extracted data available</p>
                      <p className="text-xs mt-1">This post hasn't been processed yet</p>
                    </div>
                  )}

                  {/* Post Metadata */}
                  <div className="pt-3 border-t border-gray-200 text-xs text-gray-400 space-y-1">
                    <p>Post ID: {post.id}</p>
                    <p>Platform ID: {post.platformPostId}</p>
                    {post.extractedGameDataId && (
                      <p>Extracted Data ID: {post.extractedGameDataId}</p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                Post not found
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// MAIN COMPONENT
// ==========================================

export const SocialDebug = () => {
  const { authStatus } = useAuthenticator(context => [context.authStatus]);
  const client = useMemo(() => generateClient(), []);
  
  const [activeTab, setActiveTab] = useState<TabType>('posts');
  const [data, setData] = useState<Record<TabType, any[]>>({
    posts: [],
    accounts: [],
    scrapeAttempts: [],
  });
  const [loading, setLoading] = useState<Record<TabType, boolean>>({
    posts: false,
    accounts: false,
    scrapeAttempts: false,
  });
  const [nextTokens, setNextTokens] = useState<Record<TabType, string | null>>({
    posts: null,
    accounts: null,
    scrapeAttempts: null,
  });
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  
  // Modal state
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);

  // Fetch data for a tab
  const fetchData = useCallback(async (tab: TabType, nextToken?: string | null, isLoadMore = false) => {
    if (!isLoadMore) {
      setLoading(prev => ({ ...prev, [tab]: true }));
    }
    setError(null);

    try {
      let query: string;
      let listKey: string;

      switch (tab) {
        case 'posts':
          query = listSocialPostsForDebug;
          listKey = 'listSocialPosts';
          break;
        case 'accounts':
          query = listSocialAccountsForDebug;
          listKey = 'listSocialAccounts';
          break;
        case 'scrapeAttempts':
          query = listSocialScrapeAttemptsForDebug;
          listKey = 'listSocialScrapeAttempts';
          break;
      }

      const variables: any = { limit: 50 };
      if (nextToken) {
        variables.nextToken = nextToken;
      }

      const response = await client.graphql({ query, variables });

      if ('data' in response && response.data) {
        let items = (response.data as any)[listKey]?.items?.filter(Boolean) || [];
        const newNextToken = (response.data as any)[listKey]?.nextToken || null;

        // Sort posts by postedAt (most recent first)
        if (tab === 'posts') {
          items = items.sort((a: any, b: any) => {
            const dateA = a.postedAt ? new Date(a.postedAt).getTime() : 0;
            const dateB = b.postedAt ? new Date(b.postedAt).getTime() : 0;
            return dateB - dateA;
          });
        }

        // Sort scrape attempts by startedAt (most recent first)
        if (tab === 'scrapeAttempts') {
          items = items.sort((a: any, b: any) => {
            const dateA = a.startedAt ? new Date(a.startedAt).getTime() : 0;
            const dateB = b.startedAt ? new Date(b.startedAt).getTime() : 0;
            return dateB - dateA;
          });
        }

        if (nextToken && isLoadMore) {
          setData(prev => ({
            ...prev,
            [tab]: [...prev[tab], ...items]
          }));
        } else {
          setData(prev => ({ ...prev, [tab]: items }));
        }

        setNextTokens(prev => ({ ...prev, [tab]: newNextToken }));
      }
    } catch (err) {
      console.error(`Error fetching ${tab}:`, err);
      setError(`Failed to fetch ${tab}`);
    } finally {
      setLoading(prev => ({ ...prev, [tab]: false }));
    }
  }, [client]);

  // Handle tab change
  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab);
    if (data[tab].length === 0) {
      fetchData(tab);
    }
  }, [data, fetchData]);

  // Handle refresh
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await fetchData(activeTab);
    setIsRefreshing(false);
  }, [fetchData, activeTab]);

  // Initial load
  useEffect(() => {
    if (authStatus === 'authenticated') {
      fetchData('posts');
    }
  }, [authStatus, fetchData]);

  // Stats calculations
  const postStats = useMemo(() => {
    const posts = data.posts;
    if (posts.length === 0) return null;

    const totalEngagement = posts.reduce((sum, p) => 
      sum + (p.likeCount || 0) + (p.commentCount || 0) + (p.shareCount || 0), 0
    );
    const avgEngagement = totalEngagement / posts.length;
    const tournamentRelated = posts.filter(p => p.isTournamentRelated).length;
    const promotional = posts.filter(p => p.isPromotional).length;
    const withMedia = posts.filter(p => p.mediaUrls?.length > 0).length;
    const linked = posts.filter(p => p.linkedGameId).length;

    const processingStatusCounts = posts.reduce((acc, p) => {
      const status = p.processingStatus || 'PENDING';
      acc[status] = (acc[status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalEngagement,
      avgEngagement,
      tournamentRelated,
      promotional,
      withMedia,
      linked,
      processingStatusCounts,
    };
  }, [data.posts]);

  // Format date helper
  const formatDateTime = (dateString: string | null) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (authStatus !== 'authenticated') {
    return <div className="p-8 text-center">Please sign in...</div>;
  }

  // ==========================================
  // RENDER FUNCTIONS
  // ==========================================

  const renderPostsTable = () => {
    const posts = data.posts;

    if (posts.length === 0) {
      return (
        <div className="p-8 text-center text-gray-500">
          No social posts found
        </div>
      );
    }

    return (
      <>
        {/* Stats Summary */}
        {postStats && (
          <div className="px-4 py-3 bg-gray-50 border-b grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 text-sm">
            <div className="flex items-center gap-2">
              <Heart className="w-4 h-4 text-red-500" />
              <span className="text-gray-600">Total Engagement:</span>
              <span className="font-semibold">{postStats.totalEngagement.toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-green-500" />
              <span className="text-gray-600">Avg:</span>
              <span className="font-semibold">{postStats.avgEngagement.toFixed(1)}</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-purple-500" />
              <span className="text-gray-600">Tournament:</span>
              <span className="font-semibold">{postStats.tournamentRelated}</span>
            </div>
            <div className="flex items-center gap-2">
              <Share2 className="w-4 h-4 text-blue-500" />
              <span className="text-gray-600">Promotional:</span>
              <span className="font-semibold">{postStats.promotional}</span>
            </div>
            <div className="flex items-center gap-2">
              <Image className="w-4 h-4 text-cyan-500" />
              <span className="text-gray-600">With Media:</span>
              <span className="font-semibold">{postStats.withMedia}</span>
            </div>
            <div className="flex items-center gap-2">
              <ExternalLink className="w-4 h-4 text-indigo-500" />
              <span className="text-gray-600">Linked:</span>
              <span className="font-semibold">{postStats.linked}</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {Object.entries(postStats.processingStatusCounts).map(([status, count]) => (
                <span key={status} className="text-xs">
                  <StatusBadge status={status} /> {count as number}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Content</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Posted</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Engagement</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Processing</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Flags</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {posts.map((post) => (
                <tr key={post.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <PostTypeIcon postType={post.postType} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{post.accountName || '-'}</div>
                    <div className="text-xs text-gray-500">{post.platform}</div>
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    <div className="text-sm text-gray-900 truncate" title={post.content}>
                      {post.contentPreview || post.content?.substring(0, 100) || '-'}
                    </div>
                    <button 
                      onClick={() => setSelectedPostId(post.id)}
                      className="text-xs text-indigo-600 hover:underline hover:text-indigo-800"
                    >
                      View Post →
                    </button>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {formatDateTime(post.postedAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-3 text-xs text-gray-600">
                      <span className="flex items-center gap-1">
                        <Heart className="w-3 h-3" /> {post.likeCount || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" /> {post.commentCount || 0}
                      </span>
                      <span className="flex items-center gap-1">
                        <Share2 className="w-3 h-3" /> {post.shareCount || 0}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={post.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={post.processingStatus || 'PENDING'} />
                      {post.contentType && (
                        <span className="text-xs text-gray-500">
                          {post.contentType} ({(post.contentTypeConfidence * 100)?.toFixed(0)}%)
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex gap-1">
                      {post.isTournamentRelated && (
                        <span className="px-1.5 py-0.5 bg-purple-100 text-purple-800 text-xs rounded" title="Tournament Related">
                          🏆
                        </span>
                      )}
                      {post.isPromotional && (
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-800 text-xs rounded" title="Promotional">
                          📢
                        </span>
                      )}
                      {post.linkedGameId && (
                        <span className="px-1.5 py-0.5 bg-green-100 text-green-800 text-xs rounded" title="Linked to Game">
                          🔗
                        </span>
                      )}
                      {post.mediaUrls?.length > 0 && (
                        <span className="px-1.5 py-0.5 bg-cyan-100 text-cyan-800 text-xs rounded" title={`${post.mediaUrls.length} media`}>
                          📷 {post.mediaUrls.length}
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {nextTokens.posts && (
          <div className="px-4 py-3 border-t bg-gray-50">
            <button
              onClick={() => fetchData('posts', nextTokens.posts, true)}
              disabled={loading.posts}
              className="text-sm text-indigo-600 hover:text-indigo-900 disabled:opacity-50"
            >
              {loading.posts ? 'Loading...' : 'Load more posts'}
            </button>
          </div>
        )}
      </>
    );
  };

  const renderAccountsTable = () => {
    const accounts = data.accounts;

    if (accounts.length === 0) {
      return (
        <div className="p-8 text-center text-gray-500">
          No social accounts found
        </div>
      );
    }

    return (
      <>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Platform</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Stats</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Scraping</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Last Scraped</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {accounts.map((account) => (
                <tr key={account.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {account.profileImageUrl ? (
                        <img 
                          src={account.profileImageUrl} 
                          alt="" 
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
                          <Users className="w-4 h-4 text-gray-400" />
                        </div>
                      )}
                      <div>
                        <div className="text-sm font-medium text-gray-900">{account.accountName}</div>
                        {account.accountHandle && (
                          <div className="text-xs text-gray-500">@{account.accountHandle}</div>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {account.platform}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {account.businessLocation || '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-xs text-gray-600 space-y-0.5">
                      <div>Posts: {account.postCount?.toLocaleString() || 0}</div>
                      <div>Followers: {account.followerCount?.toLocaleString() || 0}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={account.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex items-center gap-2">
                      {account.isScrapingEnabled ? (
                        <CheckCircle className="w-4 h-4 text-green-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                      <span className="text-xs text-gray-500">
                        {account.scrapeFrequencyMinutes}m
                      </span>
                      {account.consecutiveFailures > 0 && (
                        <span className="text-xs text-red-500">
                          ({account.consecutiveFailures} failures)
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {formatDateTime(account.lastScrapedAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {nextTokens.accounts && (
          <div className="px-4 py-3 border-t bg-gray-50">
            <button
              onClick={() => fetchData('accounts', nextTokens.accounts, true)}
              disabled={loading.accounts}
              className="text-sm text-indigo-600 hover:text-indigo-900 disabled:opacity-50"
            >
              {loading.accounts ? 'Loading...' : 'Load more accounts'}
            </button>
          </div>
        )}
      </>
    );
  };

  const renderScrapeAttemptsTable = () => {
    const attempts = data.scrapeAttempts;

    if (attempts.length === 0) {
      return (
        <div className="p-8 text-center text-gray-500">
          No scrape attempts found
        </div>
      );
    }

    return (
      <>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Started</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Posts Found</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">New/Updated</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Trigger</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Error</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {attempts.map((attempt) => (
                <tr key={attempt.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={attempt.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {formatDateTime(attempt.startedAt)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {attempt.durationMs ? `${(attempt.durationMs / 1000).toFixed(1)}s` : '-'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                    {attempt.postsFound || 0}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm">
                    <span className="text-green-600">{attempt.newPostsAdded || 0} new</span>
                    {' / '}
                    <span className="text-blue-600">{attempt.postsUpdated || 0} updated</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                    {attempt.triggerSource || '-'}
                  </td>
                  <td className="px-4 py-3 max-w-xs">
                    {attempt.errorMessage ? (
                      <div className="text-xs text-red-600 truncate" title={attempt.errorMessage}>
                        {attempt.errorMessage}
                      </div>
                    ) : (
                      <span className="text-gray-300">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        
        {nextTokens.scrapeAttempts && (
          <div className="px-4 py-3 border-t bg-gray-50">
            <button
              onClick={() => fetchData('scrapeAttempts', nextTokens.scrapeAttempts, true)}
              disabled={loading.scrapeAttempts}
              className="text-sm text-indigo-600 hover:text-indigo-900 disabled:opacity-50"
            >
              {loading.scrapeAttempts ? 'Loading...' : 'Load more attempts'}
            </button>
          </div>
        )}
      </>
    );
  };

  const renderTableContent = () => {
    const isLoading = loading[activeTab];

    if ((isLoading || isRefreshing) && data[activeTab].length === 0) {
      return (
        <div className="p-8 text-center text-gray-500">
          {isRefreshing ? 'Refreshing...' : 'Loading...'}
        </div>
      );
    }

    switch (activeTab) {
      case 'posts':
        return renderPostsTable();
      case 'accounts':
        return renderAccountsTable();
      case 'scrapeAttempts':
        return renderScrapeAttemptsTable();
      default:
        return null;
    }
  };

  // ==========================================
  // MAIN RENDER
  // ==========================================

  return (
    <PageWrapper title="Social (Debug)" maxWidth="7xl">
      {/* Post Detail Modal */}
      {selectedPostId && (
        <PostDetailModal 
          postId={selectedPostId} 
          onClose={() => setSelectedPostId(null)} 
        />
      )}

      {/* Debug Banner */}
      <div className="bg-pink-50 border border-pink-200 rounded-lg p-4 mb-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-sm text-pink-800">
              <strong>Debug Mode:</strong> This page displays raw social data tables for debugging purposes.
            </p>
            <p className="text-xs text-pink-700 mt-1">
              Posts sorted by date (most recent first) | Loaded: {data.accounts.length} accounts, {data.posts.length} posts
            </p>
          </div>
          <button
            onClick={handleRefresh}
            disabled={isRefreshing || loading[activeTab]}
            className="inline-flex items-center px-3 py-1.5 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-pink-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshIcon />
            <span className="ml-2">Refresh All</span>
          </button>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6 flex flex-wrap gap-2">
        {Object.entries(tabs).map(([key, config]) => (
          <button
            key={key}
            onClick={() => handleTabChange(key as TabType)}
            className={`inline-flex items-center gap-2 px-4 py-2 font-medium text-sm rounded-lg transition-colors ${
              activeTab === key
                ? 'bg-pink-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {config.icon}
            {config.label}
            {key === 'posts' && (
              <span className="text-xs opacity-75">
                ({data.posts.length}{nextTokens.posts ? '+' : ''})
              </span>
            )}
            {key === 'accounts' && (
              <span className="text-xs opacity-75">
                ({data.accounts.length}{nextTokens.accounts ? '+' : ''})
              </span>
            )}
            {key === 'scrapeAttempts' && (
              <span className="text-xs opacity-75">
                ({data.scrapeAttempts.length}{nextTokens.scrapeAttempts ? '+' : ''})
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <p className="text-red-600">{error}</p>
        </div>
      )}

      {/* Table Content */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <div className="px-4 py-5 sm:px-6 border-b border-gray-200">
          <h3 className="text-lg leading-6 font-medium text-gray-900 flex items-center gap-2">
            {tabs[activeTab].icon}
            {tabs[activeTab].label}
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Showing {data[activeTab].length.toLocaleString()} records
          </p>
        </div>
        {renderTableContent()}
      </div>
    </PageWrapper>
  );
};

export default SocialDebug;