// src/components/social/SocialPostsTab.tsx
// Browse and manage social posts with filtering by account, year-month, and day
// Used as a tab within SocialAccountManagement page
// UPDATED: Added effectiveGameDate support for display and grouping

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import { format, formatDistanceToNow } from 'date-fns';
import { Link } from 'react-router-dom';
import { 
  ChevronDownIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  XMarkIcon,
  TrashIcon,
  EyeSlashIcon,
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
  EllipsisVerticalIcon,
} from '@heroicons/react/24/outline';
import { 
  Facebook, 
  Instagram, 
  Linkedin,
  Heart,
  MessageSquare,
  Share2,
  Video,
  FileText,
  X,
  RefreshCw,
  ExternalLink,
  Loader2,
  Calendar,
} from 'lucide-react';
import { formatCompact } from '@/lib/utils';
import { formatCurrency } from '../../utils/generalHelpers';
import { SocialAccount } from '../../hooks/useSocialAccounts';
import { SocialPost, SocialPostStatus } from '../../hooks/useSocialPosts';
import { ModelSortDirection } from '../../API';

// ============================================
// TYPES
// ============================================

interface SocialPostsTabProps {
  accounts: SocialAccount[];
}

// ============================================
// GRAPHQL QUERIES
// ============================================

const socialPostsBySocialAccountIdAndPostedAt = /* GraphQL */ `
  query SocialPostsBySocialAccountIdAndPostedAt(
    $socialAccountId: ID!
    $postedAt: ModelStringKeyConditionInput
    $sortDirection: ModelSortDirection
    $filter: ModelSocialPostFilterInput
    $limit: Int
    $nextToken: String
  ) {
    socialPostsBySocialAccountIdAndPostedAt(
      socialAccountId: $socialAccountId
      postedAt: $postedAt
      sortDirection: $sortDirection
      filter: $filter
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
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
        likeCount
        commentCount
        shareCount
        viewCount
        postedAt
        status
        isTournamentRelated
        isTournamentResult
        isPromotional
        contentType
        contentTypeConfidence
        processingStatus
        linkedGameId
        linkedGameCount
        socialAccountId
        entityId
        effectiveGameDate
        effectiveGameDateSource
      }
      nextToken
    }
  }
`;

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
      effectiveGameDate
      effectiveGameDateSource
      extractedGameData {
        id
        contentType
        contentTypeConfidence
        extractedName
        extractedVenueName
        extractedDate
        extractedDayOfWeek
        extractedStartTime
        dateSource
        effectiveGameDate
        effectiveGameDateSource
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
        extractedWinnerHasTicket
        extractedWinnerTicketType
        extractedWinnerTicketValue
        placementCount
        totalTicketsExtracted
        totalTicketValue
        extractedAt
        placements {
          items {
            id
            place
            playerName
            cashPrize
            hasNonCashPrize
            nonCashPrizes
            primaryTicketType
            primaryTicketValue
            ticketCount
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

const updateSocialPostMutation = /* GraphQL */ `
  mutation UpdateSocialPost($input: UpdateSocialPostInput!) {
    updateSocialPost(input: $input) {
      id
      status
      isTournamentRelated
      linkedGameId
      tags
    }
  }
`;

const deleteSocialPostMutation = /* GraphQL */ `
  mutation DeleteSocialPost($input: DeleteSocialPostInput!) {
    deleteSocialPost(input: $input) {
      id
    }
  }
`;

// ============================================
// HELPER COMPONENTS
// ============================================

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

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const colors: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-800',
    HIDDEN: 'bg-gray-100 text-gray-800',
    DELETED: 'bg-red-100 text-red-800',
    PENDING: 'bg-yellow-100 text-yellow-800',
    PROCESSED: 'bg-blue-100 text-blue-800',
    LINKED: 'bg-purple-100 text-purple-800',
  };
  
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
      {status}
    </span>
  );
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

// NEW: Date source indicator badge
const DateSourceBadge: React.FC<{ source?: string | null }> = ({ source }) => {
  if (!source) return null;
  
  const config: Record<string, { color: string; label: string; tooltip: string }> = {
    extracted: { 
      color: 'bg-green-50 text-green-700 border-green-200', 
      label: 'Extracted',
      tooltip: 'Date was extracted from post content'
    },
    posted_at: { 
      color: 'bg-gray-50 text-gray-600 border-gray-200', 
      label: 'Post Date',
      tooltip: 'Using post publication date (no date found in content)'
    },
    inferred: { 
      color: 'bg-yellow-50 text-yellow-700 border-yellow-200', 
      label: 'Inferred',
      tooltip: 'Date was inferred from context'
    },
  };
  
  const { color, label, tooltip } = config[source] || config.posted_at;
  
  return (
    <span 
      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${color}`}
      title={tooltip}
    >
      {label}
    </span>
  );
};

// ============================================
// POST DETAIL MODAL
// ============================================

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

  // Get effective date from extraction or post
  const getEffectiveGameDate = () => {
    const extraction = post?.extractedGameData;
    if (extraction?.effectiveGameDate) {
      return {
        date: extraction.effectiveGameDate,
        source: extraction.effectiveGameDateSource
      };
    }
    // Fallback to post-level if available
    if (post?.effectiveGameDate) {
      return {
        date: post.effectiveGameDate,
        source: post.effectiveGameDateSource
      };
    }
    return null;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div 
        className="fixed inset-0 bg-black/50 transition-opacity" 
        onClick={onClose}
      />
      
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

                  {post.extractedGameData ? (
                    <div className="space-y-3">
                      {/* Tournament Name */}
                      {post.extractedGameData.extractedName && (
                        <div>
                          <span className="text-xs text-gray-500">Tournament</span>
                          <p className="text-sm font-medium text-gray-900">{post.extractedGameData.extractedName}</p>
                        </div>
                      )}

                      {/* Venue */}
                      {post.extractedGameData.extractedVenueName && (
                        <div>
                          <span className="text-xs text-gray-500">Venue</span>
                          <p className="text-sm font-medium text-gray-900">{post.extractedGameData.extractedVenueName}</p>
                        </div>
                      )}

                      {/* === UPDATED: Effective Game Date (Primary Display) === */}
                      {(() => {
                        const effectiveDate = getEffectiveGameDate();
                        return effectiveDate?.date ? (
                          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Calendar className="w-4 h-4 text-indigo-500" />
                                <span className="text-xs text-indigo-700 font-medium">Game Date</span>
                              </div>
                              <DateSourceBadge source={effectiveDate.source} />
                            </div>
                            <p className="text-sm font-semibold text-gray-900 mt-1">
                              {formatExtractedDate(effectiveDate.date)}
                            </p>
                            {/* Show original dates if different */}
                            {effectiveDate.source === 'extracted' && post.postedAt && (
                              <p className="text-xs text-gray-500 mt-1">
                                Posted: {formatExtractedDate(post.postedAt)}
                              </p>
                            )}
                          </div>
                        ) : (
                          /* Fallback to legacy display */
                          <div className="grid grid-cols-2 gap-3">
                            {post.extractedGameData.extractedDate && (
                              <div>
                                <span className="text-xs text-gray-500">Date</span>
                                <p className="text-sm font-medium text-gray-900">
                                  {formatExtractedDate(post.extractedGameData.extractedDate)}
                                </p>
                              </div>
                            )}
                            {post.extractedGameData.extractedStartTime && (
                              <div>
                                <span className="text-xs text-gray-500">Start Time</span>
                                <p className="text-sm font-medium text-gray-900">{post.extractedGameData.extractedStartTime}</p>
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Start Time (shown separately when we have effective date) */}
                      {getEffectiveGameDate()?.date && post.extractedGameData.extractedStartTime && (
                        <div>
                          <span className="text-xs text-gray-500">Start Time</span>
                          <p className="text-sm font-medium text-gray-900">{post.extractedGameData.extractedStartTime}</p>
                        </div>
                      )}

                      {/* Buy-in & Guarantee */}
                      <div className="grid grid-cols-2 gap-3">
                        {post.extractedGameData.extractedBuyIn != null && (
                          <div>
                            <span className="text-xs text-gray-500">Buy-in</span>
                            <p className="text-sm font-medium text-gray-900">
                              {formatCurrency(post.extractedGameData.extractedBuyIn)}
                            </p>
                          </div>
                        )}
                        {post.extractedGameData.extractedGuarantee != null && (
                          <div>
                            <span className="text-xs text-gray-500">Guarantee</span>
                            <p className="text-sm font-medium text-gray-900">
                              {formatCurrency(post.extractedGameData.extractedGuarantee)}
                            </p>
                          </div>
                        )}
                      </div>

                      {/* Results - Prize Pool & Entries */}
                      {(post.extractedGameData.extractedPrizePool || post.extractedGameData.extractedTotalEntries) && (
                        <div className="grid grid-cols-2 gap-3">
                          {post.extractedGameData.extractedPrizePool != null && (
                            <div>
                              <span className="text-xs text-gray-500">Prize Pool</span>
                              <p className="text-sm font-medium text-green-600">
                                {formatCurrency(post.extractedGameData.extractedPrizePool)}
                              </p>
                            </div>
                          )}
                          {post.extractedGameData.extractedTotalEntries != null && (
                            <div>
                              <span className="text-xs text-gray-500">Entries</span>
                              <p className="text-sm font-medium text-gray-900">
                                {post.extractedGameData.extractedTotalEntries}
                              </p>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Winner - Updated with ticket info */}
                      {post.extractedGameData.extractedWinnerName && (
                        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                          <span className="text-xs text-yellow-700 font-medium">🏆 Winner</span>
                          <p className="text-sm font-semibold text-gray-900 mt-1">
                            {post.extractedGameData.extractedWinnerName}
                            {post.extractedGameData.extractedWinnerPrize && (
                              <span className="text-green-600 ml-2">
                                {formatCurrency(post.extractedGameData.extractedWinnerPrize)}
                              </span>
                            )}
                          </p>
                          {/* Show ticket info if winner has ticket */}
                          {post.extractedGameData.extractedWinnerHasTicket && (
                            <p className="text-xs text-yellow-700 mt-1">
                              + {post.extractedGameData.extractedWinnerTicketType?.replace(/_/g, ' ')}
                              {post.extractedGameData.extractedWinnerTicketValue && (
                                <span> ({formatCurrency(post.extractedGameData.extractedWinnerTicketValue)})</span>
                              )}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Ticket Summary - NEW */}
                      {post.extractedGameData.totalTicketsExtracted > 0 && (
                        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                          <span className="text-xs text-purple-700 font-medium">🎫 Tickets Extracted</span>
                          <p className="text-sm font-semibold text-gray-900 mt-1">
                            {post.extractedGameData.totalTicketsExtracted} ticket{post.extractedGameData.totalTicketsExtracted !== 1 ? 's' : ''}
                            {post.extractedGameData.totalTicketValue && (
                              <span className="text-purple-600 ml-2">
                                ({formatCurrency(post.extractedGameData.totalTicketValue)} total value)
                              </span>
                            )}
                          </p>
                        </div>
                      )}

                      {/* Placements - Updated with ticket indicators */}
                      {post.extractedGameData.placements?.items?.length > 0 && (
                        <div>
                          <button
                            onClick={() => setShowPlacements(!showPlacements)}
                            className="flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
                          >
                            <ChevronDownIcon className={`w-4 h-4 transition-transform ${showPlacements ? 'rotate-180' : ''}`} />
                            {showPlacements ? 'Hide' : 'Show'} {post.extractedGameData.placements.items.length} placements
                          </button>
                          
                          {showPlacements && (
                            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                              {post.extractedGameData.placements.items
                                .sort((a: any, b: any) => (a.place || 999) - (b.place || 999))
                                .map((placement: any) => (
                                  <div 
                                    key={placement.id}
                                    className="flex items-center justify-between py-1.5 px-2 bg-white rounded border border-gray-100"
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                        placement.place === 1 ? 'bg-yellow-100 text-yellow-700' :
                                        placement.place === 2 ? 'bg-gray-100 text-gray-700' :
                                        placement.place === 3 ? 'bg-orange-100 text-orange-700' :
                                        'bg-gray-50 text-gray-500'
                                      }`}>
                                        {placement.place}
                                      </span>
                                      <span className="text-sm text-gray-900">{placement.playerName}</span>
                                      {/* Ticket indicator */}
                                      {placement.hasNonCashPrize && (
                                        <span className="text-purple-500" title={placement.primaryTicketType || 'Non-cash prize'}>
                                          🎫
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-right">
                                      {placement.cashPrize != null && (
                                        <span className="text-sm font-medium text-green-600">
                                          {formatCurrency(placement.cashPrize)}
                                        </span>
                                      )}
                                      {placement.primaryTicketValue && (
                                        <span className="text-xs text-purple-600 ml-1">
                                          +{formatCurrency(placement.primaryTicketValue)}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <FileText className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No extracted data available</p>
                    </div>
                  )}

                  {/* Linked Game */}
                  {post.linkedGameId && (
                    <div className="pt-3 border-t border-gray-200">
                      <Link
                        to={`/games/${post.linkedGameId}`}
                        className="flex items-center justify-center gap-2 w-full px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                      >
                        View Linked Game
                        <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================
// POST CARD COMPONENT
// ============================================

interface PostCardProps {
  post: SocialPost & { effectiveGameDate?: string; effectiveGameDateSource?: string };
  onClick: () => void;
  onHide: () => void;
  onDelete: () => void;
}

const PostCard: React.FC<PostCardProps> = ({ post, onClick, onHide, onDelete }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // Get effective game date display
  const getGameDateDisplay = () => {
    if (post.effectiveGameDate) {
      try {
        return {
          date: format(new Date(post.effectiveGameDate), 'dd MMM'),
          isExtracted: post.effectiveGameDateSource === 'extracted'
        };
      } catch {
        return null;
      }
    }
    return null;
  };

  const gameDateDisplay = getGameDateDisplay();
  const CHARACTER_LIMIT = 150;
  const shouldTruncate = post.content && post.content.length > CHARACTER_LIMIT;

  return (
    <div 
      // CHANGED: Removed 'h-full' so the card height is determined by content only
      className="bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-md transition-shadow cursor-pointer group flex flex-col self-start"
      onClick={onClick}
    >
      {/* --- HEADER --- */}
      <div className="p-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="relative flex-shrink-0">
            {post.accountProfileImageUrl ? (
              <img
                src={post.accountProfileImageUrl}
                alt=""
                className="w-8 h-8 rounded-full object-cover"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold">
                {post.accountName?.charAt(0) || '?'}
              </div>
            )}
            <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white flex items-center justify-center shadow-sm">
              <PlatformIcon platform={post.platform} className="w-2.5 h-2.5" />
            </div>
          </div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-gray-900 truncate">{post.accountName || 'Unknown'}</p>
            <p className="text-[10px] text-gray-500" title={formatFullDate(post.postedAt)}>
              {formatDate(post.postedAt)}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
          {gameDateDisplay && (
            <span 
              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                gameDateDisplay.isExtracted 
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-200' 
                  : 'bg-gray-50 text-gray-600 border border-gray-200'
              }`}
              title={`Game Date: ${format(new Date(post.effectiveGameDate!), 'EEE, dd MMM yyyy')} (${post.effectiveGameDateSource})`}
            >
              <Calendar className="w-3 h-3" />
              {gameDateDisplay.date}
            </span>
          )}
          {/* Linked badge - shows in header for all posts */}
          {post.linkedGameId && (
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 border border-purple-200">
              <CheckCircleIcon className="w-3 h-3" />
              Linked
            </span>
          )}
          <ContentTypeBadge contentType={post.contentType} />
          
          <div className="relative" ref={menuRef}>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1 hover:bg-gray-100 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <EllipsisVerticalIcon className="w-4 h-4 text-gray-500" />
            </button>
            {showMenu && (
              <div className="absolute right-0 top-6 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[120px] z-10">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onHide();
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                >
                  <EyeSlashIcon className="w-3.5 h-3.5" />
                  Hide
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                >
                  <TrashIcon className="w-3.5 h-3.5" />
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* --- CONTENT (Text) --- */}
      {post.content && (
        <div className="px-3 pb-2">
          <div className="text-xs text-gray-700 leading-relaxed break-words whitespace-pre-wrap">
            <span className={`${!isExpanded && shouldTruncate ? 'line-clamp-3' : ''}`}>
              {post.content}
            </span>
            {shouldTruncate && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsExpanded(!isExpanded);
                }}
                className="mt-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:underline focus:outline-none"
              >
                {isExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* --- MEDIA (Image/Video) --- */}
      {(post.thumbnailUrl || post.mediaUrls?.[0] || post.videoThumbnailUrl) && (
        <div className="relative aspect-video bg-gray-100 w-full shrink-0">
          <img
            src={post.thumbnailUrl || post.mediaUrls?.[0] || post.videoThumbnailUrl || ''}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          {post.postType === 'VIDEO' && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
              <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                <Video className="w-5 h-5 text-gray-900 ml-0.5" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* --- FOOTER --- */}
      <div className="px-3 py-2 border-t border-gray-100 flex items-center justify-between bg-gray-50/30 mt-auto">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-gray-500">
            <Heart className="w-3 h-3" />
            <span className="text-[10px]">{formatCompact(post.likeCount || 0)}</span>
          </span>
          <span className="flex items-center gap-1 text-gray-500">
            <MessageSquare className="w-3 h-3" />
            <span className="text-[10px]">{formatCompact(post.commentCount || 0)}</span>
          </span>
        </div>
        {post.linkedGameCount && post.linkedGameCount > 0 ? (
          <span className="text-[10px] text-purple-600 font-medium">
            {post.linkedGameCount} game{post.linkedGameCount > 1 ? 's' : ''}
          </span>
        ) : null}
      </div>
    </div>
  );
};

// ============================================
// MULTI-SELECT DROPDOWN COMPONENTS
// ============================================

interface MultiSelectOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface MultiSelectDropdownProps {
  label: string;
  options: MultiSelectOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}

const MultiSelectDropdown: React.FC<MultiSelectDropdownProps> = ({
  label,
  options,
  selectedIds,
  onChange
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(i => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const allSelected = selectedIds.length === options.length;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
      >
        {label}
        {!allSelected && selectedIds.length > 0 && (
          <span className="px-1.5 py-0.5 text-xs bg-indigo-100 text-indigo-700 rounded-full">
            {selectedIds.length}
          </span>
        )}
        <ChevronDownIcon className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px] max-h-64 overflow-y-auto z-20">
          <button
            onClick={() => onChange(allSelected ? [] : options.map(o => o.id))}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 border-b border-gray-100"
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
          {options.map(option => (
            <button
              key={option.id}
              onClick={() => toggleOption(option.id)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50"
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                selectedIds.includes(option.id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
              }`}>
                {selectedIds.includes(option.id) && (
                  <CheckCircleIcon className="w-3 h-3 text-white" />
                )}
              </div>
              <div className="text-left">
                <p className="text-sm text-gray-900">{option.label}</p>
                {option.sublabel && (
                  <p className="text-xs text-gray-500">{option.sublabel}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Checkbox Multi-Select Dropdown
interface CheckboxOption {
  value: string;
  label: string;
}

interface CheckboxMultiSelectDropdownProps {
  label: string;
  options: CheckboxOption[];
  selectedValues: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
  icon?: React.ReactNode;
  maxDisplayItems?: number;
}

const CheckboxMultiSelectDropdown: React.FC<CheckboxMultiSelectDropdownProps> = ({
  label,
  options,
  selectedValues,
  onChange,
  icon,
  maxDisplayItems = 2
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (value: string) => {
    if (selectedValues.includes(value)) {
      onChange(selectedValues.filter(v => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const allSelected = selectedValues.length === options.length;
  const noneSelected = selectedValues.length === 0;

  const displayText = () => {
    if (allSelected || noneSelected) return label;
    if (selectedValues.length <= maxDisplayItems) {
      return selectedValues.map(v => options.find(o => o.value === v)?.label).join(', ');
    }
    return `${selectedValues.length} selected`;
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
      >
        {icon}
        <span className="truncate max-w-[120px]">{displayText()}</span>
        {!allSelected && !noneSelected && (
          <span className="px-1.5 py-0.5 text-xs bg-indigo-100 text-indigo-700 rounded-full">
            {selectedValues.length}
          </span>
        )}
        <ChevronDownIcon className={`w-4 h-4 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px] max-h-64 overflow-y-auto z-20">
          <button
            onClick={() => onChange(allSelected ? [] : options.map(o => o.value))}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 border-b border-gray-100"
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
          {options.map(option => (
            <button
              key={option.value}
              onClick={() => toggleOption(option.value)}
              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-gray-50"
            >
              <div className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                selectedValues.includes(option.value) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'
              }`}>
                {selectedValues.includes(option.value) && (
                  <CheckCircleIcon className="w-3 h-3 text-white" />
                )}
              </div>
              <span className="text-sm text-gray-900">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================
// MAIN COMPONENT
// ============================================

const SocialPostsTab: React.FC<SocialPostsTabProps> = ({ accounts }) => {
  const [posts, setPosts] = useState<(SocialPost & { effectiveGameDate?: string; effectiveGameDateSource?: string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  
  // NEW: Toggle between grouping by posted date vs effective game date
  const [groupByGameDate, setGroupByGameDate] = useState(false);
  
  // Filters
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>(accounts.map(a => a.id));
  const [selectedYearMonths, setSelectedYearMonths] = useState<string[]>([format(new Date(), 'yyyy-MM')]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [selectedContentTypes, setSelectedContentTypes] = useState<string[]>(['RESULT', 'PROMOTIONAL', 'GENERAL', 'COMMENT']);
  const [selectedLinkedStatus, setSelectedLinkedStatus] = useState<string[]>(['linked', 'not-linked']);

  const client = useMemo(() => generateClient(), []);

  // Account options for filter
  const accountOptions: MultiSelectOption[] = useMemo(() => 
    accounts.map(a => ({
      id: a.id,
      label: a.accountName,
      sublabel: a.platform
    })),
    [accounts]
  );

  // Generate year-month options (last 12 months)
  const yearMonthOptions: CheckboxOption[] = useMemo(() => {
    const options: CheckboxOption[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const value = format(d, 'yyyy-MM');
      const label = format(d, 'MMM yyyy');
      options.push({ value, label });
    }
    return options;
  }, []);

  // Content type options
  const contentTypeOptions: CheckboxOption[] = [
    { value: 'RESULT', label: 'Result' },
    { value: 'PROMOTIONAL', label: 'Promo' },
    { value: 'GENERAL', label: 'General' },
    { value: 'COMMENT', label: 'Comment' },
  ];

  // Linked status options
  const linkedStatusOptions: CheckboxOption[] = [
    { value: 'linked', label: 'Linked' },
    { value: 'not-linked', label: 'Not Linked' },
  ];

  // Generate day options based on posts in selected months
  const dayOptions: CheckboxOption[] = useMemo(() => {
    if (!selectedYearMonths.length) return [];
    
    const daysSet = new Set<string>();
    posts.forEach(post => {
      if (post.postedAt) {
        const postYearMonth = format(new Date(post.postedAt), 'yyyy-MM');
        if (selectedYearMonths.includes(postYearMonth)) {
          const dayKey = format(new Date(post.postedAt), 'yyyy-MM-dd');
          daysSet.add(dayKey);
        }
      }
    });
    
    return Array.from(daysSet)
      .sort((a, b) => b.localeCompare(a))
      .map(day => ({
        value: day,
        label: format(new Date(day + 'T00:00:00'), 'd MMM (EEE)')
      }));
  }, [posts, selectedYearMonths]);

  // Auto-select all days when dayOptions change
  useEffect(() => {
    if (dayOptions.length > 0 && selectedDays.length === 0) {
      setSelectedDays(dayOptions.map(d => d.value));
    }
  }, [dayOptions]);

  // Fetch posts with proper pagination
  const fetchPosts = useCallback(async () => {
    if (selectedAccountIds.length === 0 || selectedYearMonths.length === 0) {
      setPosts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const allPosts: (SocialPost & { effectiveGameDate?: string; effectiveGameDateSource?: string })[] = [];

      for (const accountId of selectedAccountIds) {
        for (const yearMonth of selectedYearMonths) {
          const startDate = `${yearMonth}-01T00:00:00.000Z`;
          const [year, month] = yearMonth.split('-').map(Number);
          const endDate = new Date(year, month, 0, 23, 59, 59, 999).toISOString();

          // Paginate through all results for this account/month combination
          let nextToken: string | null | undefined = undefined;
          
          do {
            const response = await client.graphql({
              query: socialPostsBySocialAccountIdAndPostedAt,
              variables: {
                socialAccountId: accountId,
                postedAt: { between: [startDate, endDate] },
                sortDirection: ModelSortDirection.DESC,
                limit: 200,
                nextToken: nextToken
              }
            }) as any;

            const result = response.data?.socialPostsBySocialAccountIdAndPostedAt;
            const items = result?.items || [];
            allPosts.push(...items);
            
            // Get the next token for pagination
            nextToken = result?.nextToken;
          } while (nextToken);
        }
      }

      // Sort all posts by date (descending)
      allPosts.sort((a, b) => {
        const dateA = new Date(a.postedAt || 0).getTime();
        const dateB = new Date(b.postedAt || 0).getTime();
        return dateB - dateA;
      });

      // Debug: Log linked posts count
      const linkedPosts = allPosts.filter(p => p.linkedGameId);
      console.log(`[SocialPostsTab] Fetched ${allPosts.length} posts, ${linkedPosts.length} are linked`);
      if (linkedPosts.length > 0) {
        console.log('[SocialPostsTab] Sample linked post:', linkedPosts[0].id, 'linkedGameId:', linkedPosts[0].linkedGameId);
      }

      setPosts(allPosts);
    } catch (err) {
      console.error('Error fetching posts:', err);
      setError('Failed to load posts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedAccountIds, selectedYearMonths, client]);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Hide post
  const handleHidePost = async (postId: string) => {
    try {
      await client.graphql({
        query: updateSocialPostMutation,
        variables: {
          input: {
            id: postId,
            status: 'HIDDEN' as SocialPostStatus
          }
        }
      });
      setPosts(prev => prev.filter(p => p.id !== postId));
    } catch (err) {
      console.error('Error hiding post:', err);
    }
  };

  // Delete post
  const handleDeletePost = async (postId: string) => {
    try {
      await client.graphql({
        query: deleteSocialPostMutation,
        variables: {
          input: { id: postId }
        }
      });
      setPosts(prev => prev.filter(p => p.id !== postId));
      setDeletingPostId(null);
    } catch (err) {
      console.error('Error deleting post:', err);
    }
  };

  // Filter posts
  const filteredPosts = useMemo(() => {
    return posts.filter(post => {
      // Content type filter
      if (post.contentType && !selectedContentTypes.includes(post.contentType)) {
        return false;
      }
      if (!post.contentType && !selectedContentTypes.includes('GENERAL')) {
        return false;
      }
      
      // Day filter
      if (selectedDays.length > 0 && post.postedAt) {
        const postDay = format(new Date(post.postedAt), 'yyyy-MM-dd');
        if (!selectedDays.includes(postDay)) {
          return false;
        }
      }
      
      // Linked status filter
      const isLinked = !!post.linkedGameId;
      if (isLinked && !selectedLinkedStatus.includes('linked')) {
        return false;
      }
      if (!isLinked && !selectedLinkedStatus.includes('not-linked')) {
        return false;
      }
      
      return true;
    });
  }, [posts, selectedContentTypes, selectedLinkedStatus, selectedDays]);

  // Group posts by day - UPDATED to support effectiveGameDate
  const groupedPosts = useMemo(() => {
    const groups: Record<string, (SocialPost & { effectiveGameDate?: string; effectiveGameDateSource?: string })[]> = {};
    
    filteredPosts.forEach(post => {
      // Determine which date to use for grouping
      let dateToGroup: string | null = null;
      
      if (groupByGameDate && post.effectiveGameDate) {
        // Use effective game date for grouping
        try {
          dateToGroup = format(new Date(post.effectiveGameDate), 'yyyy-MM-dd');
        } catch {
          dateToGroup = null;
        }
      }
      
      // Fallback to postedAt
      if (!dateToGroup && post.postedAt) {
        dateToGroup = format(new Date(post.postedAt), 'yyyy-MM-dd');
      }
      
      if (!dateToGroup) return;
      
      if (!groups[dateToGroup]) {
        groups[dateToGroup] = [];
      }
      groups[dateToGroup].push(post);
    });

    return Object.entries(groups).sort(([a], [b]) => b.localeCompare(a));
  }, [filteredPosts, groupByGameDate]);

  const formatDayLabel = (dateKey: string) => {
    const date = new Date(dateKey + 'T00:00:00');
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    
    return format(date, 'EEEE, d MMMM');
  };

  // Check if filters have been modified from default
  const hasActiveFilters = 
    selectedDays.length < dayOptions.length || 
    selectedAccountIds.length < accounts.length ||
    selectedYearMonths.length > 1 ||
    selectedContentTypes.length < contentTypeOptions.length ||
    selectedLinkedStatus.length < linkedStatusOptions.length;

  return (
    <div>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <MultiSelectDropdown
          label="Accounts"
          options={accountOptions}
          selectedIds={selectedAccountIds}
          onChange={setSelectedAccountIds}
        />
        
        <CheckboxMultiSelectDropdown
          label="Months"
          options={yearMonthOptions}
          selectedValues={selectedYearMonths}
          onChange={(months) => {
            setSelectedYearMonths(months);
            // Reset days when months change
            if (months.length > 0) {
              // Will be handled by the effect that watches dayOptions
            } else {
              setSelectedDays([]);
            }
          }}
          placeholder="Select months..."
          icon={<CalendarDaysIcon className="w-4 h-4 text-gray-400" />}
        />
        
        {selectedYearMonths.length > 0 && dayOptions.length > 0 && (
          <CheckboxMultiSelectDropdown
            label="Days"
            options={dayOptions}
            selectedValues={selectedDays}
            onChange={setSelectedDays}
            placeholder="Select days..."
            maxDisplayItems={3}
          />
        )}

        {/* Divider */}
        <div className="w-px h-6 bg-gray-300" />

        {/* Content Type Filter */}
        <CheckboxMultiSelectDropdown
          label="Type"
          options={contentTypeOptions}
          selectedValues={selectedContentTypes}
          onChange={setSelectedContentTypes}
          placeholder="Content type..."
          maxDisplayItems={2}
        />

        {/* Linked Status Filter */}
        <CheckboxMultiSelectDropdown
          label="Linked"
          options={linkedStatusOptions}
          selectedValues={selectedLinkedStatus}
          onChange={setSelectedLinkedStatus}
          placeholder="Linked status..."
          maxDisplayItems={2}
        />

        {/* NEW: Group by toggle */}
        <div className="w-px h-6 bg-gray-300" />
        <button
          onClick={() => setGroupByGameDate(!groupByGameDate)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
            groupByGameDate 
              ? 'bg-indigo-50 text-indigo-700 border-indigo-200' 
              : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
          }`}
          title={groupByGameDate ? 'Grouped by Game Date' : 'Grouped by Post Date'}
        >
          <Calendar className="w-4 h-4" />
          {groupByGameDate ? 'Game Date' : 'Post Date'}
        </button>

        {/* Clear filters */}
        {hasActiveFilters && (
          <button
            onClick={() => {
              setSelectedDays(dayOptions.map(d => d.value));
              setSelectedAccountIds(accounts.map(a => a.id));
              setSelectedYearMonths([format(new Date(), 'yyyy-MM')]);
              setSelectedContentTypes(contentTypeOptions.map(o => o.value));
              setSelectedLinkedStatus(linkedStatusOptions.map(o => o.value));
            }}
            className="flex items-center gap-1 px-2 py-1.5 text-xs text-gray-500 hover:text-gray-700"
          >
            <XMarkIcon className="w-3.5 h-3.5" />
            Clear
          </button>
        )}

        <div className="ml-auto">
          <button
            onClick={() => fetchPosts()}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <ArrowPathIcon className="w-4 h-4" />
            )}
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-4 flex items-center gap-4 text-sm text-gray-600">
        <span>
          <strong className="text-gray-900">{filteredPosts.length}</strong>
          {filteredPosts.length !== posts.length && (
            <span className="text-gray-400"> of {posts.length}</span>
          )}
          {' '}posts
        </span>
        {selectedYearMonths.length > 0 && (
          <span>
            {selectedYearMonths.length === 1 
              ? yearMonthOptions.find(o => o.value === selectedYearMonths[0])?.label
              : `${selectedYearMonths.length} months`}
            {selectedDays.length < dayOptions.length && selectedDays.length > 0 && (
              <> • {selectedDays.length} day{selectedDays.length !== 1 ? 's' : ''}</>
            )}
          </span>
        )}
        {selectedContentTypes.length < contentTypeOptions.length && (
          <span className="text-indigo-600">
            {selectedContentTypes.map(t => contentTypeOptions.find(o => o.value === t)?.label).join(', ')}
          </span>
        )}
        {selectedLinkedStatus.length === 1 && (
          <span className="text-indigo-600">
            {selectedLinkedStatus[0] === 'linked' ? 'Linked only' : 'Not linked only'}
          </span>
        )}
        {groupByGameDate && (
          <span className="text-indigo-600 flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            Grouped by game date
          </span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600 text-sm">{error}</p>
        </div>
      )}

      {/* Content */}
      {loading && posts.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-indigo-600 border-t-transparent" />
          <p className="mt-3 text-gray-500 text-sm">Loading posts...</p>
        </div>
      ) : filteredPosts.length === 0 ? (
        <div className="text-center py-16 bg-gray-50 rounded-xl border border-dashed border-gray-300">
          <MagnifyingGlassIcon className="w-10 h-10 text-gray-400 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-gray-900">No posts found</h3>
          <p className="text-gray-500 text-sm mt-1 max-w-sm mx-auto">
            No posts match your current filters. Try selecting different accounts or dates.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groupedPosts.map(([dateKey, dayPosts]) => (
            <div key={dateKey}>
              {/* Day Header */}
              <div className="flex items-center gap-2 mb-3">
                <h3 className="text-sm font-semibold text-gray-900">
                  {formatDayLabel(dateKey)}
                </h3>
                <span className="text-xs text-gray-500">
                  {dayPosts.length} {dayPosts.length === 1 ? 'post' : 'posts'}
                </span>
                {groupByGameDate && (
                  <span className="text-xs text-indigo-500 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Game Date
                  </span>
                )}
              </div>
              
              {/* Posts Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {dayPosts.map((post) => (
                  <PostCard
                    key={post.id}
                    post={post}
                    onClick={() => setSelectedPostId(post.id)}
                    onHide={() => handleHidePost(post.id)}
                    onDelete={() => setDeletingPostId(post.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Post Detail Modal */}
      {selectedPostId && (
        <PostDetailModal
          postId={selectedPostId}
          onClose={() => setSelectedPostId(null)}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deletingPostId && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={() => setDeletingPostId(null)} />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
              <div className="mx-auto flex items-center justify-center h-10 w-10 rounded-full bg-red-100">
                <TrashIcon className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="mt-3 text-base font-semibold text-gray-900 text-center">
                Delete Post?
              </h3>
              <p className="mt-2 text-sm text-gray-600 text-center">
                This action cannot be undone.
              </p>
              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => setDeletingPostId(null)}
                  className="flex-1 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleDeletePost(deletingPostId)}
                  className="flex-1 px-3 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SocialPostsTab;
export { SocialPostsTab };