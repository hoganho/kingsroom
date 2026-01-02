// src/pages/games/game-tabs/SocialsTab.tsx
// Socials tab for GameDetails - Linked social posts with extracted game data
// =============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { format, formatDistanceToNow } from 'date-fns';
import { getClient } from '../../../utils/apiClient';
import {
  ShareIcon,
  HeartIcon,
  ChatBubbleLeftIcon,
  ArrowTopRightOnSquareIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CheckBadgeIcon,
  ExclamationTriangleIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  TrophyIcon,
  MapPinIcon,
  SparklesIcon,
  DocumentTextIcon,
  ArrowPathIcon,
  PlayIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline';
import { Facebook, Instagram, Linkedin } from 'lucide-react';

import { 
  SocialPost, 
  SocialPostGameLink, 
  SocialPostGameData,
  SocialPostPlacement,
  Game,
} from '../../../API';
import { EmptyState, LoadingSpinner } from './components';
import { formatCurrency } from '../../../utils/generalHelpers';

// =============================================================================
// GraphQL Queries
// =============================================================================

const GET_SOCIAL_POST_LINKS_QUERY = /* GraphQL */ `
  query GetSocialPostLinksForGame($gameId: ID!, $limit: Int) {
    listSocialPostGameLinks(
      filter: { gameId: { eq: $gameId } }
      limit: $limit
    ) {
      items {
        id
        socialPostId
        gameId
        linkType
        matchConfidence
        matchReason
        isPrimaryGame
        mentionOrder
        extractedVenueName
        extractedDate
        extractedBuyIn
        extractedGuarantee
        linkedAt
        linkedBy
        verifiedAt
        verifiedBy
        createdAt
      }
      nextToken
    }
  }
`;

const GET_SOCIAL_POST_QUERY = /* GraphQL */ `
  query GetSocialPost($id: ID!) {
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
      processingStatus
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
        suggestedVenueId
        venueMatchConfidence
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

// =============================================================================
// Types
// =============================================================================

interface SocialsTabProps {
  game: Game;
}

interface EnrichedPostLink {
  link: SocialPostGameLink;
  post: SocialPost | null;
  loading: boolean;
  error: string | null;
}

// =============================================================================
// Helper Components
// =============================================================================

const PlatformIcon: React.FC<{ platform?: string | null; className?: string }> = ({ 
  platform, 
  className = '' 
}) => {
  switch (platform) {
    case 'FACEBOOK':
      return <Facebook className={`text-blue-600 ${className}`} />;
    case 'INSTAGRAM':
      return <Instagram className={`text-pink-600 ${className}`} />;
    case 'LINKEDIN':
      return <Linkedin className={`text-blue-700 ${className}`} />;
    default:
      return <ShareIcon className={`text-gray-500 ${className}`} />;
  }
};

const ConfidenceBadge: React.FC<{ confidence?: number | null }> = ({ confidence }) => {
  if (confidence === null || confidence === undefined) return null;
  
  const percentage = Math.round(confidence);
  let colorClass = 'bg-red-100 text-red-700 border-red-200';
  
  if (percentage >= 80) {
    colorClass = 'bg-green-100 text-green-700 border-green-200';
  } else if (percentage >= 50) {
    colorClass = 'bg-yellow-100 text-yellow-700 border-yellow-200';
  }
  
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}>
      {percentage}% match
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

const LinkTypeBadge: React.FC<{ linkType?: string | null; verified?: boolean }> = ({ 
  linkType, 
  verified 
}) => {
  if (verified) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 border border-green-200">
        <CheckBadgeIcon className="w-3 h-3 mr-1" />
        Verified
      </span>
    );
  }
  
  const config: Record<string, { color: string; label: string }> = {
    AUTO_MATCHED: { color: 'bg-indigo-100 text-indigo-700 border-indigo-200', label: 'Auto-matched' },
    MANUAL: { color: 'bg-blue-100 text-blue-700 border-blue-200', label: 'Manual' },
    SUGGESTED: { color: 'bg-amber-100 text-amber-700 border-amber-200', label: 'Suggested' },
  };
  
  const { color, label } = config[linkType || ''] || { color: 'bg-gray-100 text-gray-700 border-gray-200', label: linkType };
  
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${color}`}>
      {label}
    </span>
  );
};

// =============================================================================
// Social Post Card Component
// =============================================================================

const SocialPostCard: React.FC<{ post: SocialPost }> = ({ post }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
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

  const accountName = post.accountName || (post.socialAccount as any)?.accountName || 'Unknown';
  const profileImageUrl = post.accountProfileImageUrl || (post.socialAccount as any)?.profileImageUrl;
  const platform = post.platform || (post.socialAccount as any)?.platform;
  
  const isVideoPost = post.postType === 'VIDEO' || !!(post as any).videoUrl;
  const mediaUrls = (post.mediaUrls || []) as string[];
  const thumbnailUrl = (post as any).videoThumbnailUrl || post.thumbnailUrl || mediaUrls[0];
  const displayContent = post.content || post.contentPreview || '';
  
  const hasMultipleImages = mediaUrls.length > 1;
  
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="p-4 flex items-center justify-between border-b border-gray-100">
        <div className="flex items-center gap-3">
          <div className="relative">
            {profileImageUrl ? (
              <img
                src={profileImageUrl}
                alt={accountName}
                className="w-10 h-10 rounded-full object-cover ring-2 ring-gray-100"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm ring-2 ring-gray-100">
                {accountName?.charAt(0) || '?'}
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow-sm border border-gray-100">
              <PlatformIcon platform={platform} className="w-3 h-3" />
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 text-sm truncate max-w-[200px]">{accountName}</h4>
            <p className="text-xs text-gray-500" title={formatFullDate(post.postedAt)}>
              {formatDate(post.postedAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isVideoPost && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700">
              <VideoCameraIcon className="w-3 h-3 mr-1" />
              Video
            </span>
          )}
          <ContentTypeBadge contentType={post.contentType} />
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        {displayContent && (
          <div className="text-sm text-gray-700 leading-relaxed">
            <p className={`whitespace-pre-wrap ${!isExpanded && displayContent.length > 250 ? 'line-clamp-4' : ''}`}>
              {displayContent}
            </p>
            {displayContent.length > 250 && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="mt-2 text-xs font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                {isExpanded ? (
                  <>Show less <ChevronUpIcon className="w-3 h-3" /></>
                ) : (
                  <>Show more <ChevronDownIcon className="w-3 h-3" /></>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Media */}
      {(mediaUrls.length > 0 || isVideoPost) && (
        <div className="px-4 pb-4">
          {isVideoPost ? (
            <div className="relative rounded-lg overflow-hidden bg-gray-100 aspect-video">
              {thumbnailUrl ? (
                <img
                  src={thumbnailUrl}
                  alt="Video thumbnail"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gray-900">
                  <VideoCameraIcon className="w-12 h-12 text-gray-600" />
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg">
                  <PlayIcon className="w-6 h-6 text-gray-900 ml-1" />
                </div>
              </div>
            </div>
          ) : (
            <div className={`grid gap-1 ${hasMultipleImages ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {mediaUrls.slice(0, 4).map((url, idx) => (
                <div 
                  key={idx} 
                  className={`relative rounded-lg overflow-hidden bg-gray-100 ${hasMultipleImages ? 'aspect-square' : ''}`}
                >
                  <img
                    src={url}
                    alt=""
                    className={`w-full ${hasMultipleImages ? 'h-full object-cover' : 'h-auto'}`}
                    loading="lazy"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  {idx === 3 && mediaUrls.length > 4 && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="text-white text-xl font-bold">+{mediaUrls.length - 4}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer Metrics */}
      <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5 text-gray-500">
            <HeartIcon className="w-4 h-4" />
            <span className="text-xs font-medium">{(post.likeCount || 0).toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-1.5 text-gray-500">
            <ChatBubbleLeftIcon className="w-4 h-4" />
            <span className="text-xs font-medium">{(post.commentCount || 0).toLocaleString()}</span>
          </span>
          <span className="flex items-center gap-1.5 text-gray-500">
            <ShareIcon className="w-4 h-4" />
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
            <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
            View Post
          </a>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// Extracted Data Panel Component
// =============================================================================

const ExtractedDataPanel: React.FC<{ 
  link: SocialPostGameLink;
  gameData?: SocialPostGameData | null;
}> = ({ link, gameData }) => {
  const [showPlacements, setShowPlacements] = useState(false);
  
  const formatExtractedDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    try {
      return format(new Date(dateStr), 'EEE, dd MMM yyyy');
    } catch {
      return null;
    }
  };
  
  const placements = (gameData?.placements as any)?.items || [];
  const topPlacements = placements.slice(0, 5);
  const hasMorePlacements = placements.length > 5;
  
  // Combine extracted data from both link snapshot and full extraction
  const venueName = link.extractedVenueName || gameData?.extractedVenueName;
  const extractedDate = link.extractedDate || gameData?.extractedDate;
  const buyIn = link.extractedBuyIn || gameData?.extractedBuyIn;
  const guarantee = link.extractedGuarantee || gameData?.extractedGuarantee;
  
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-4">
      {/* Match Info Header */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <SparklesIcon className="w-4 h-4 text-indigo-500" />
          <span className="text-sm font-semibold text-gray-900">Extracted Data</span>
        </div>
        <div className="flex items-center gap-2">
          <ConfidenceBadge confidence={link.matchConfidence} />
          <LinkTypeBadge linkType={link.linkType} verified={!!link.verifiedAt} />
        </div>
      </div>
      
      {/* Match Reason */}
      {link.matchReason && (
        <div className="text-xs text-gray-500 bg-white rounded-lg px-3 py-2 border border-gray-100">
          <span className="font-medium text-gray-700">Match reason:</span> {link.matchReason}
        </div>
      )}
      
      {/* Extracted Fields Grid */}
      <div className="grid grid-cols-2 gap-3">
        {venueName && (
          <div className="bg-white rounded-lg p-3 border border-gray-100">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <MapPinIcon className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Venue</span>
            </div>
            <p className="text-sm font-semibold text-gray-900 truncate" title={venueName}>
              {venueName}
            </p>
          </div>
        )}
        
        {extractedDate && (
          <div className="bg-white rounded-lg p-3 border border-gray-100">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <CalendarIcon className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Date</span>
            </div>
            <p className="text-sm font-semibold text-gray-900">
              {formatExtractedDate(extractedDate)}
            </p>
            {gameData?.extractedStartTime && (
              <p className="text-xs text-gray-500">{gameData.extractedStartTime}</p>
            )}
          </div>
        )}
        
        {buyIn && (
          <div className="bg-white rounded-lg p-3 border border-gray-100">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <CurrencyDollarIcon className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Buy-In</span>
            </div>
            <p className="text-sm font-semibold text-gray-900">{formatCurrency(buyIn)}</p>
          </div>
        )}
        
        {guarantee && (
          <div className="bg-white rounded-lg p-3 border border-gray-100">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <TrophyIcon className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Guarantee</span>
            </div>
            <p className="text-sm font-semibold text-gray-900">{formatCurrency(guarantee)}</p>
          </div>
        )}
        
        {gameData?.extractedPrizePool && (
          <div className="bg-white rounded-lg p-3 border border-gray-100">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <CurrencyDollarIcon className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Prize Pool</span>
            </div>
            <p className="text-sm font-semibold text-green-600">{formatCurrency(gameData.extractedPrizePool)}</p>
          </div>
        )}
        
        {gameData?.extractedTotalEntries && (
          <div className="bg-white rounded-lg p-3 border border-gray-100">
            <div className="flex items-center gap-2 text-gray-500 mb-1">
              <UserGroupIcon className="w-3.5 h-3.5" />
              <span className="text-xs font-medium">Entries</span>
            </div>
            <p className="text-sm font-semibold text-gray-900">{gameData.extractedTotalEntries}</p>
            {gameData.extractedTotalUniquePlayers && gameData.extractedTotalUniquePlayers !== gameData.extractedTotalEntries && (
              <p className="text-xs text-gray-500">{gameData.extractedTotalUniquePlayers} unique</p>
            )}
          </div>
        )}
      </div>
      
      {/* Winner Info */}
      {gameData?.extractedWinnerName && (
        <div className="bg-yellow-50 rounded-lg p-3 border border-yellow-200">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">🏆</span>
            <span className="text-xs font-medium text-yellow-700">Winner</span>
          </div>
          <p className="text-sm font-semibold text-gray-900">{gameData.extractedWinnerName}</p>
          {gameData.extractedWinnerPrize && (
            <p className="text-sm text-green-600 font-medium">{formatCurrency(gameData.extractedWinnerPrize)}</p>
          )}
        </div>
      )}
      
      {/* Placements */}
      {placements.length > 0 && (
        <div className="pt-2">
          <button
            onClick={() => setShowPlacements(!showPlacements)}
            className="flex items-center justify-between w-full text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            <span className="flex items-center gap-2">
              <DocumentTextIcon className="w-4 h-4" />
              Extracted Results ({placements.length})
            </span>
            {showPlacements ? (
              <ChevronUpIcon className="w-4 h-4" />
            ) : (
              <ChevronDownIcon className="w-4 h-4" />
            )}
          </button>
          
          {showPlacements && (
            <div className="mt-3 bg-white rounded-lg border border-gray-100 overflow-hidden">
              <table className="min-w-full divide-y divide-gray-100 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">#</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Player</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Prize</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(showPlacements ? placements : topPlacements).map((p: SocialPostPlacement) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-900 font-medium">
                        {p.place === 1 ? '🥇' : p.place === 2 ? '🥈' : p.place === 3 ? '🥉' : p.place}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{p.playerName}</td>
                      <td className="px-3 py-2 text-right">
                        {p.cashPrize ? (
                          <span className="text-green-600 font-medium">{formatCurrency(p.cashPrize)}</span>
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
              {hasMorePlacements && !showPlacements && (
                <div className="px-3 py-2 text-xs text-gray-500 text-center bg-gray-50">
                  +{placements.length - 5} more
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      {/* Additional Extracted Info */}
      {(gameData?.extractedSeriesName || gameData?.extractedGameType || gameData?.extractedTournamentType) && (
        <div className="pt-2 border-t border-gray-200">
          <div className="flex flex-wrap gap-2">
            {gameData.extractedSeriesName && (
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-indigo-100 text-indigo-700">
                {gameData.extractedSeriesName}
                {gameData.extractedEventNumber && ` #${gameData.extractedEventNumber}`}
              </span>
            )}
            {gameData.extractedGameType && (
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-gray-100 text-gray-700">
                {gameData.extractedGameType}
              </span>
            )}
            {gameData.extractedTournamentType && (
              <span className="inline-flex items-center px-2 py-1 rounded-md text-xs bg-gray-100 text-gray-700">
                {gameData.extractedTournamentType}
              </span>
            )}
          </div>
        </div>
      )}
      
      {/* Link Metadata */}
      <div className="pt-2 border-t border-gray-200 text-xs text-gray-400">
        <p>
          Linked {link.linkedAt ? formatDistanceToNow(new Date(link.linkedAt), { addSuffix: true }) : 'unknown'}
          {link.linkedBy && link.linkedBy !== 'SYSTEM' && ` by ${link.linkedBy}`}
        </p>
      </div>
    </div>
  );
};

// =============================================================================
// Linked Post Row Component
// =============================================================================

const LinkedPostRow: React.FC<{ enrichedLink: EnrichedPostLink }> = ({ enrichedLink }) => {
  const { link, post, loading, error } = enrichedLink;
  
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-8 flex items-center justify-center">
        <ArrowPathIcon className="w-6 h-6 text-gray-400 animate-spin" />
        <span className="ml-2 text-sm text-gray-500">Loading post...</span>
      </div>
    );
  }
  
  if (error || !post) {
    return (
      <div className="bg-red-50 rounded-xl border border-red-200 p-6 flex items-center">
        <ExclamationTriangleIcon className="w-6 h-6 text-red-400" />
        <div className="ml-3">
          <p className="text-sm font-medium text-red-800">Failed to load post</p>
          <p className="text-xs text-red-600">{error || 'Post data unavailable'}</p>
        </div>
      </div>
    );
  }
  
  const gameData = post.extractedGameData;
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Social Post Card - Left */}
      <SocialPostCard post={post} />
      
      {/* Extracted Data Panel - Right */}
      <ExtractedDataPanel link={link} gameData={gameData} />
    </div>
  );
};

// =============================================================================
// Main Component
// =============================================================================

export const SocialsTab: React.FC<SocialsTabProps> = ({ game }) => {
  const [links, setLinks] = useState<SocialPostGameLink[]>([]);
  const [enrichedLinks, setEnrichedLinks] = useState<EnrichedPostLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const client = useMemo(() => getClient(), []);
  
  // Fetch links for this game
  const fetchLinks = useCallback(async () => {
    if (!game.id) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await client.graphql({
        query: GET_SOCIAL_POST_LINKS_QUERY,
        variables: { gameId: game.id, limit: 50 }
      }) as any;
      
      const fetchedLinks = response.data?.listSocialPostGameLinks?.items || [];
      setLinks(fetchedLinks);
      
      // Initialize enriched links with loading state
      setEnrichedLinks(fetchedLinks.map((link: SocialPostGameLink) => ({
        link,
        post: null,
        loading: true,
        error: null
      })));
      
    } catch (err) {
      console.error('Error fetching social post links:', err);
      setError('Failed to load linked social posts');
    } finally {
      setLoading(false);
    }
  }, [client, game.id]);
  
  // Fetch individual post details
  const fetchPostDetails = useCallback(async (link: SocialPostGameLink, index: number) => {
    try {
      const response = await client.graphql({
        query: GET_SOCIAL_POST_QUERY,
        variables: { id: link.socialPostId }
      }) as any;
      
      const post = response.data?.getSocialPost;
      
      setEnrichedLinks(prev => prev.map((item, i) => 
        i === index ? { ...item, post, loading: false, error: null } : item
      ));
    } catch (err) {
      console.error(`Error fetching post ${link.socialPostId}:`, err);
      setEnrichedLinks(prev => prev.map((item, i) => 
        i === index ? { ...item, post: null, loading: false, error: 'Failed to load post' } : item
      ));
    }
  }, [client]);
  
  // Initial fetch
  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);
  
  // Fetch post details when links are loaded
  useEffect(() => {
    links.forEach((link, index) => {
      fetchPostDetails(link, index);
    });
  }, [links, fetchPostDetails]);
  
  // Summary stats
  const stats = useMemo(() => {
    const loadedPosts = enrichedLinks.filter(el => el.post);
    return {
      total: links.length,
      results: loadedPosts.filter(el => el.post?.contentType === 'RESULT').length,
      promos: loadedPosts.filter(el => el.post?.contentType === 'PROMOTIONAL').length,
      verified: links.filter(l => l.verifiedAt).length,
      avgConfidence: links.length > 0 
        ? Math.round(links.reduce((sum, l) => sum + (l.matchConfidence || 0), 0) / links.length)
        : 0,
    };
  }, [links, enrichedLinks]);
  
  if (loading) {
    return <LoadingSpinner />;
  }
  
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <ExclamationTriangleIcon className="h-8 w-8 text-red-400 mx-auto mb-2" />
        <p className="text-red-700">{error}</p>
        <button
          onClick={fetchLinks}
          className="mt-3 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
        >
          Try again
        </button>
      </div>
    );
  }
  
  if (links.length === 0) {
    return (
      <EmptyState 
        message="No social posts linked to this game yet" 
        icon={ShareIcon}
      />
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="bg-gray-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          <p className="text-xs text-gray-500">Linked Posts</p>
        </div>
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-600">{stats.results}</p>
          <p className="text-xs text-gray-500">Results</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-blue-600">{stats.promos}</p>
          <p className="text-xs text-gray-500">Promotional</p>
        </div>
        <div className="bg-indigo-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-indigo-600">{stats.verified}</p>
          <p className="text-xs text-gray-500">Verified</p>
        </div>
        <div className="bg-amber-50 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-amber-600">{stats.avgConfidence}%</p>
          <p className="text-xs text-gray-500">Avg Confidence</p>
        </div>
      </div>
      
      {/* Linked Posts */}
      <div className="space-y-4">
        {enrichedLinks.map((enrichedLink) => (
          <LinkedPostRow 
            key={enrichedLink.link.id} 
            enrichedLink={enrichedLink}
          />
        ))}
      </div>
    </div>
  );
};

export default SocialsTab;