// src/components/social/SocialPostCard.tsx
// Shared social post card component used by SocialPulse and SocialPostsTab
// Supports multiple display modes and configurable actions

import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import {
  EllipsisVerticalIcon,
  ArrowTopRightOnSquareIcon,
  EyeSlashIcon,
  TrashIcon,
  CheckCircleIcon,
  PlayIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import {
  Facebook,
  Instagram,
  Linkedin,
  Heart,
  MessageSquare,
  Share2,
  Video,
  Calendar,
  Gamepad2,
} from 'lucide-react';
import { formatCompact } from '@/lib/utils';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SocialPost } from '../../hooks/useSocialPosts';
import { SocialAccount } from '../../hooks/useSocialAccounts';

// ============================================
// TYPES
// ============================================

export interface ExtendedSocialPost extends Omit<SocialPost, 'linkedGame'> {
  videoUrl?: string | null;
  videoThumbnailUrl?: string | null;
  videoTitle?: string | null;
  effectiveGameDate?: string | null;
  effectiveGameDateSource?: string | null;
  linkedGame?: {
    id: string;
    tournamentId?: string | null;
    name?: string | null;
  } | null;
}

export type SocialPostCardVariant = 'pulse' | 'management';

export interface SocialPostCardProps {
  post: SocialPost | ExtendedSocialPost;
  /** Display variant - 'pulse' for horizontal scroll, 'management' for grid */
  variant?: SocialPostCardVariant;
  /** Click handler for the card (typically opens detail modal) */
  onClick?: () => void;
  /** Hide post handler */
  onHide?: () => void;
  /** Delete post handler */
  onDelete?: () => void;
  /** Custom handler for viewing game details (defaults to navigation) */
  onViewGameDetails?: (gameId: string) => void;
  /** Whether to show the video modal inline (pulse variant) */
  enableVideoModal?: boolean;
  /** Additional CSS classes */
  className?: string;
}

// ============================================
// HELPER COMPONENTS
// ============================================

const PlatformIcon: React.FC<{ platform?: string | null; className?: string }> = ({
  platform,
  className = 'w-4 h-4',
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

// Video Modal for inline video playback
const VideoModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  videoUrl: string;
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
          <Button variant="ghost" size="sm" onClick={onClose} className="p-1">
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

// ============================================
// MAIN COMPONENT
// ============================================

export const SocialPostCard: React.FC<SocialPostCardProps> = ({
  post,
  variant = 'management',
  onClick,
  onHide,
  onDelete,
  onViewGameDetails,
  enableVideoModal = false,
  className = '',
}) => {
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showVideoModal, setShowVideoModal] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Date formatting
  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Unknown';
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffHours / 24);

      if (diffHours < 1) return 'Just now';
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
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

  // Extract post data
  const extendedPost = post as ExtendedSocialPost;
  const account = post.socialAccount as SocialAccount | undefined;
  const accountName = post.accountName || account?.accountName || 'Unknown';
  const profileImageUrl = post.accountProfileImageUrl || account?.profileImageUrl;
  const platform = post.platform || account?.platform || '';

  // Video detection
  const isVideoPost = post.postType === 'VIDEO' || !!extendedPost.videoUrl;
  const videoUrl = extendedPost.videoUrl || post.postUrl;
  const mediaUrls = (post.mediaUrls || []) as string[];
  const videoThumbnailUrl = extendedPost.videoThumbnailUrl || post.thumbnailUrl || mediaUrls[0];

  // Content
  const displayContent = post.content || '';
  const hasMultipleImages = mediaUrls.length > 1;

  // Linked game info
  const linkedGameId = post.linkedGameId;
  const linkedGame = extendedPost.linkedGame;
  const tournamentId = linkedGame?.tournamentId;

  // Game date display (for management variant)
  const getGameDateDisplay = () => {
    if (extendedPost.effectiveGameDate) {
      try {
        return {
          date: format(new Date(extendedPost.effectiveGameDate), 'dd MMM'),
          isExtracted: extendedPost.effectiveGameDateSource === 'extracted',
        };
      } catch {
        return null;
      }
    }
    return null;
  };

  const gameDateDisplay = variant === 'management' ? getGameDateDisplay() : null;

  // Character limit based on variant
  const CHARACTER_LIMIT = variant === 'pulse' ? 200 : 150;
  const shouldTruncate = displayContent.length > CHARACTER_LIMIT;

  // Handlers
  const handleVideoClick = () => {
    if (enableVideoModal && isVideoPost && videoUrl) {
      setShowVideoModal(true);
    }
  };

  const handleViewGameDetails = () => {
    if (linkedGameId) {
      if (onViewGameDetails) {
        onViewGameDetails(linkedGameId);
      } else {
        navigate(`/games/details/${linkedGameId}`);
      }
    }
    setShowMenu(false);
  };

  const handleCardClick = () => {
    if (onClick) {
      onClick();
    }
  };

  // Variant-specific classes
  const cardClasses =
    variant === 'pulse'
      ? 'flex-shrink-0 w-[340px] sm:w-[380px] self-start'
      : 'self-start';

  const hasActions = onHide || onDelete || linkedGameId;

  return (
    <>
      <div
        className={`bg-white dark:bg-gray-900 rounded-xl shadow-sm border border-gray-200 dark:border-gray-800 overflow-hidden hover:shadow-md transition-shadow flex flex-col ${onClick ? 'cursor-pointer' : ''} group ${cardClasses} ${className}`}
        onClick={handleCardClick}
      >
        {/* Header */}
        <div className="p-3 sm:p-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-800">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="relative flex-shrink-0">
              {profileImageUrl ? (
                <img
                  src={profileImageUrl}
                  alt={accountName}
                  className="w-8 h-8 sm:w-10 sm:h-10 rounded-full object-cover ring-2 ring-gray-100 dark:ring-gray-800"
                />
              ) : (
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xs sm:text-sm ring-2 ring-gray-100 dark:ring-gray-800">
                  {accountName?.charAt(0) || '?'}
                </div>
              )}
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-white dark:bg-gray-800 flex items-center justify-center shadow-sm border border-gray-100 dark:border-gray-700">
                <PlatformIcon platform={platform} className="w-2.5 h-2.5 sm:w-3 sm:h-3" />
              </div>
            </div>
            <div className="min-w-0">
              <h4 className="font-semibold text-gray-900 dark:text-gray-50 text-xs sm:text-sm truncate max-w-[140px] sm:max-w-[180px]">
                {accountName}
              </h4>
              <p
                className="text-[10px] sm:text-xs text-gray-500 dark:text-gray-400"
                title={formatFullDate(post.postedAt)}
              >
                {formatDate(post.postedAt)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1 sm:gap-1.5" onClick={(e) => e.stopPropagation()}>
            {/* Game Date Badge (management variant) */}
            {gameDateDisplay && (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                  gameDateDisplay.isExtracted
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                    : 'bg-gray-50 text-gray-600 border border-gray-200'
                }`}
                title={`Game Date: ${format(new Date(extendedPost.effectiveGameDate!), 'EEE, dd MMM yyyy')} (${extendedPost.effectiveGameDateSource})`}
              >
                <Calendar className="w-3 h-3" />
                {gameDateDisplay.date}
              </span>
            )}

            {/* Video Badge (pulse variant) */}
            {variant === 'pulse' && isVideoPost && (
              <Badge variant="default" className="text-[10px] px-1.5 py-0.5">
                Video
              </Badge>
            )}

            {/* Tournament Badge */}
            {post.isTournamentRelated && (
              <Badge variant="warning" className="text-[10px] px-1.5 py-0.5">
                Tourn
              </Badge>
            )}

            {/* Linked Badge (management variant) */}
            {variant === 'management' && linkedGameId && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 border border-purple-200">
                <CheckCircleIcon className="w-3 h-3" />
                Linked
              </span>
            )}

            {/* Content Type Badge (management variant) */}
            {variant === 'management' && <ContentTypeBadge contentType={post.contentType} />}

            {/* Menu Button */}
            {hasActions && (
              <div className="relative" ref={menuRef}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowMenu(!showMenu);
                  }}
                  className={`p-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors ${
                    variant === 'management' ? 'opacity-0 group-hover:opacity-100' : ''
                  } text-gray-400 hover:text-gray-600 dark:hover:text-gray-300`}
                >
                  <EllipsisVerticalIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>

                {showMenu && (
                  <div className="absolute right-0 top-6 sm:top-8 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px] sm:min-w-[180px] z-20">
                    {/* Game Details Option */}
                    {linkedGameId && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleViewGameDetails();
                          }}
                          className="w-full flex items-center gap-2 px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 font-medium"
                        >
                          <Gamepad2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          Game Details{tournamentId ? `: ${tournamentId}` : ''}
                        </button>
                        {(onHide || onDelete || post.postUrl) && (
                          <div className="border-t border-gray-100 dark:border-gray-800 my-1" />
                        )}
                      </>
                    )}

                    {/* View Original Post */}
                    {post.postUrl && (
                      <a
                        href={post.postUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setShowMenu(false)}
                        className="w-full flex items-center gap-2 px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        View Original Post
                      </a>
                    )}

                    {/* Hide Option */}
                    {onHide && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onHide();
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <EyeSlashIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        Hide
                      </button>
                    )}

                    {/* Delete Option */}
                    {onDelete && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete();
                          setShowMenu(false);
                        }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 sm:py-2 text-xs sm:text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        <TrashIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        Delete
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Content */}
        {displayContent && (
          <div className="px-3 sm:px-4 py-2 sm:pb-2">
            <div className="text-xs sm:text-sm text-gray-700 dark:text-gray-300 leading-relaxed">
              <p
                className={`whitespace-pre-wrap break-words ${!isExpanded && shouldTruncate ? 'line-clamp-3' : ''}`}
              >
                {displayContent}
              </p>
              {shouldTruncate && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsExpanded(!isExpanded);
                  }}
                  className="mt-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {isExpanded ? 'Show less' : 'Show more'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Media */}
        {(mediaUrls.length > 0 || isVideoPost) && (
          <div className="px-3 sm:px-4 pb-3 sm:pb-4">
            {isVideoPost ? (
              <div
                className={`relative rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 aspect-video ${enableVideoModal ? 'cursor-pointer' : ''} group/video`}
                onClick={(e) => {
                  e.stopPropagation();
                  handleVideoClick();
                }}
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
                    <Video className="w-10 h-10 sm:w-12 sm:h-12 text-gray-600" />
                  </div>
                )}

                <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover/video:bg-black/30 transition-colors">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-white/90 flex items-center justify-center shadow-lg group-hover/video:scale-110 transition-transform">
                    <PlayIcon className="w-5 h-5 sm:w-6 sm:h-6 text-gray-900 ml-0.5" />
                  </div>
                </div>
              </div>
            ) : (
              <div className={`grid gap-1 ${hasMultipleImages ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {mediaUrls.slice(0, 4).map((url, idx) => (
                  <div
                    key={idx}
                    className={`relative rounded-lg overflow-hidden bg-gray-100 dark:bg-gray-800 ${hasMultipleImages ? 'aspect-square' : ''}`}
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
                        <span className="text-white text-lg sm:text-xl font-bold">
                          +{mediaUrls.length - 4}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-3 sm:px-4 py-2 sm:py-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-gray-800/20 mt-auto">
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="flex items-center gap-1 sm:gap-1.5 text-gray-500 dark:text-gray-400">
              <Heart className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="text-[10px] sm:text-xs font-medium">
                {formatCompact(post.likeCount || 0)}
              </span>
            </span>
            <span className="flex items-center gap-1 sm:gap-1.5 text-gray-500 dark:text-gray-400">
              <MessageSquare className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="text-[10px] sm:text-xs font-medium">
                {formatCompact(post.commentCount || 0)}
              </span>
            </span>
            <span className="flex items-center gap-1 sm:gap-1.5 text-gray-500 dark:text-gray-400">
              <Share2 className="w-3 h-3 sm:w-4 sm:h-4" />
              <span className="text-[10px] sm:text-xs font-medium">
                {formatCompact(post.shareCount || 0)}
              </span>
            </span>
          </div>

          {/* Right side - varies by variant */}
          {variant === 'pulse' && post.postUrl && (
            <a
              href={post.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium"
            >
              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
              View
            </a>
          )}

          {variant === 'management' && post.linkedGameCount && post.linkedGameCount > 0 && (
            <span className="text-[10px] text-purple-600 font-medium">
              {post.linkedGameCount} game{post.linkedGameCount > 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* Video Modal */}
      {enableVideoModal && isVideoPost && videoUrl && (
        <VideoModal
          isOpen={showVideoModal}
          onClose={() => setShowVideoModal(false)}
          videoUrl={videoUrl}
          title={displayContent?.substring(0, 50)}
        />
      )}
    </>
  );
};

export default SocialPostCard;