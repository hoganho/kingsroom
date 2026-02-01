// src/components/social/SyncProgressModal.tsx
// Enhanced modal for displaying real-time sync progress with post details
//
// Features:
// - Real-time progress bar and counters
// - Live feed of posts being downloaded
// - Post content preview as they arrive
// - Rate limit and error handling
// - Ability to close and continue in background

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  PlayIcon,
  DocumentTextIcon,
  PhotoIcon,
  VideoCameraIcon,
  CalendarIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';
import { Loader2, Facebook, Download, FileText } from 'lucide-react';

// ===================================================================
// TYPES
// ===================================================================

export interface SyncProgressPost {
  platformPostId: string;
  content?: string;
  contentPreview?: string;
  postType?: string;
  postedAt?: string;
  mediaUrls?: string[];
  thumbnailUrl?: string;
  likeCount?: number;
  commentCount?: number;
  isNew?: boolean;
  isDuplicate?: boolean;
}

export interface SyncProgressEvent {
  socialAccountId: string;
  status: 'STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'RATE_LIMITED' | 'FAILED' | 'FETCHING_PAGE' | 'PROCESSING_POST';
  message?: string;
  postsFound?: number;
  newPostsAdded?: number;
  duplicatesSkipped?: number;
  rateLimited?: boolean;
  pagesCompleted?: number;
  totalPages?: number;
  currentPagePosts?: number;
  completedAt?: string;
  
  // New: Individual post info for real-time display
  currentPost?: SyncProgressPost;
  recentPosts?: SyncProgressPost[];
  estimatedTimeRemaining?: number;
  averagePostsPerPage?: number;
}

export interface SyncAccount {
  id: string;
  accountName: string;
  accountHandle?: string | null;
  profileImageUrl?: string | null;
  postCount?: number | null;
  hasFullHistory?: boolean | null;
  fullSyncOldestPostDate?: string | null;
}

interface SyncProgressModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  account: SyncAccount | null;
  isLoading: boolean;
  progressEvent?: SyncProgressEvent | null;
  progressMessage?: string;
}

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

const formatTimeAgo = (dateString?: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return 'just now';
};

const truncateText = (text?: string, maxLength = 100): string => {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
};

const getPostTypeIcon = (postType?: string): React.ReactNode => {
  switch (postType?.toUpperCase()) {
    case 'VIDEO':
      return <VideoCameraIcon className="w-4 h-4 text-purple-500" />;
    case 'IMAGE':
    case 'PHOTO':
      return <PhotoIcon className="w-4 h-4 text-blue-500" />;
    default:
      return <DocumentTextIcon className="w-4 h-4 text-gray-500" />;
  }
};

// ===================================================================
// SUB-COMPONENTS
// ===================================================================

// Live Post Feed Item
const PostFeedItem: React.FC<{ post: SyncProgressPost; isLatest?: boolean }> = ({ 
  post, 
  isLatest = false 
}) => {
  const content = post.contentPreview || post.content || '';
  
  return (
    <div 
      className={`
        flex items-start gap-3 p-3 rounded-lg transition-all duration-300
        ${isLatest ? 'bg-blue-50 border border-blue-200 animate-pulse-once' : 'bg-gray-50'}
        ${post.isNew ? 'border-l-4 border-l-green-500' : ''}
        ${post.isDuplicate ? 'opacity-60' : ''}
      `}
    >
      {/* Thumbnail or Icon */}
      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-200 flex items-center justify-center overflow-hidden">
        {post.thumbnailUrl ? (
          <img 
            src={post.thumbnailUrl} 
            alt="" 
            className="w-full h-full object-cover"
          />
        ) : (
          getPostTypeIcon(post.postType)
        )}
      </div>
      
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
          {post.postedAt && (
            <>
              <CalendarIcon className="w-3 h-3" />
              <span>{new Date(post.postedAt).toLocaleDateString()}</span>
              <span className="text-gray-300">•</span>
              <span>{formatTimeAgo(post.postedAt)}</span>
            </>
          )}
          {post.isNew && (
            <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
              NEW
            </span>
          )}
          {post.isDuplicate && (
            <span className="px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-xs font-medium">
              EXISTS
            </span>
          )}
        </div>
        <p className="text-sm text-gray-700 line-clamp-2">
          {truncateText(content, 120) || <span className="italic text-gray-400">No text content</span>}
        </p>
        
        {/* Engagement Stats */}
        {(post.likeCount !== undefined || post.commentCount !== undefined) && (
          <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
            {post.likeCount !== undefined && (
              <span>❤️ {post.likeCount.toLocaleString()}</span>
            )}
            {post.commentCount !== undefined && (
              <span>💬 {post.commentCount.toLocaleString()}</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Progress Stats Card
const ProgressStats: React.FC<{ 
  postsFound: number;
  newPostsAdded: number;
  duplicatesSkipped: number;
  pagesCompleted: number;
  totalPages?: number;
}> = ({ postsFound, newPostsAdded, duplicatesSkipped, pagesCompleted, totalPages }) => (
  <div className="grid grid-cols-4 gap-3 p-4 bg-gray-50 rounded-lg">
    <div className="text-center">
      <div className="text-2xl font-bold text-gray-900">{postsFound}</div>
      <div className="text-xs text-gray-500">Scanned</div>
    </div>
    <div className="text-center">
      <div className="text-2xl font-bold text-green-600">{newPostsAdded}</div>
      <div className="text-xs text-gray-500">New Saved</div>
    </div>
    <div className="text-center">
      <div className="text-2xl font-bold text-gray-400">{duplicatesSkipped}</div>
      <div className="text-xs text-gray-500">Duplicates</div>
    </div>
    <div className="text-center">
      <div className="text-2xl font-bold text-blue-600">
        {totalPages ? `${pagesCompleted}/${totalPages}` : pagesCompleted}
      </div>
      <div className="text-xs text-gray-500">Pages</div>
    </div>
  </div>
);

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const SyncProgressModal: React.FC<SyncProgressModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  account,
  isLoading,
  progressEvent,
  progressMessage,
}) => {
  // Local state for post feed
  const [recentPosts, setRecentPosts] = useState<SyncProgressPost[]>([]);
  const [showPostFeed, setShowPostFeed] = useState(true);
  const feedRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  
  // Update posts when new progress event arrives
  useEffect(() => {
    if (progressEvent?.currentPost) {
      setRecentPosts(prev => {
        const newPosts = [progressEvent.currentPost!, ...prev].slice(0, 50); // Keep last 50
        return newPosts;
      });
    }
    if (progressEvent?.recentPosts) {
      setRecentPosts(progressEvent.recentPosts);
    }
  }, [progressEvent]);
  
  // Auto-scroll the feed
  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = 0;
    }
  }, [recentPosts, autoScroll]);
  
  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setRecentPosts([]);
      setAutoScroll(true);
    }
  }, [isOpen]);
  
  // Handle scroll to disable auto-scroll when user scrolls manually
  const handleFeedScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    // If scrolled down more than 50px, disable auto-scroll
    if (target.scrollTop > 50) {
      setAutoScroll(false);
    } else {
      setAutoScroll(true);
    }
  }, []);

  if (!isOpen || !account) return null;

  const hasFullHistory = account.hasFullHistory;
  const hasIncompleteSync = !!(account as any).fullSyncOldestPostDate;
  const isResume = hasIncompleteSync && !hasFullHistory;
  
  // Calculate progress percentage
  const progressPercent = progressEvent?.totalPages && progressEvent?.pagesCompleted
    ? Math.round((progressEvent.pagesCompleted / progressEvent.totalPages) * 100)
    : progressEvent?.pagesCompleted
      ? Math.min(progressEvent.pagesCompleted * 10, 95) // Estimate if no total
      : 0;

  // Determine the status display
  const getStatusDisplay = () => {
    if (!progressEvent) {
      return { icon: <Loader2 className="w-5 h-5 animate-spin" />, text: progressMessage || 'Starting...', color: 'text-blue-600' };
    }
    
    switch (progressEvent.status) {
      case 'STARTED':
        return { icon: <Loader2 className="w-5 h-5 animate-spin" />, text: 'Connecting to Facebook...', color: 'text-blue-600' };
      case 'FETCHING_PAGE':
        return { icon: <Download className="w-5 h-5 animate-bounce" />, text: `Fetching page ${progressEvent.pagesCompleted || 1}...`, color: 'text-blue-600' };
      case 'PROCESSING_POST':
        return { icon: <FileText className="w-5 h-5 animate-pulse" />, text: 'Processing posts...', color: 'text-indigo-600' };
      case 'IN_PROGRESS':
        return { icon: <ArrowPathIcon className="w-5 h-5 animate-spin" />, text: progressEvent.message || 'Syncing...', color: 'text-blue-600' };
      case 'COMPLETED':
        return { icon: <CheckCircleIcon className="w-5 h-5" />, text: 'Sync Complete!', color: 'text-green-600' };
      case 'RATE_LIMITED':
        return { icon: <ExclamationTriangleIcon className="w-5 h-5" />, text: 'Rate Limited - Progress Saved', color: 'text-orange-600' };
      case 'FAILED':
        return { icon: <ExclamationTriangleIcon className="w-5 h-5" />, text: 'Sync Failed', color: 'text-red-600' };
      default:
        return { icon: <Loader2 className="w-5 h-5 animate-spin" />, text: progressMessage || 'Processing...', color: 'text-blue-600' };
    }
  };
  
  const status = getStatusDisplay();

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div 
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={!isLoading ? onClose : undefined}
        />

        <div className="relative bg-white rounded-xl shadow-xl max-w-2xl w-full z-10 flex flex-col max-h-[90vh]">
          {/* Header */}
          <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              {/* Account Avatar */}
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center overflow-hidden">
                {account.profileImageUrl ? (
                  <img 
                    src={account.profileImageUrl} 
                    alt={account.accountName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Facebook className="w-5 h-5 text-blue-600" />
                )}
              </div>
              
              <div>
                <h3 className="text-lg font-semibold text-gray-900">
                  {isLoading ? 'Syncing...' : isResume ? 'Resume Sync' : 'Full History Sync'}
                </h3>
                <p className="text-sm text-gray-500">
                  {account.accountName}
                  {account.accountHandle && <span className="ml-1">@{account.accountHandle}</span>}
                </p>
              </div>
            </div>
            
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              title={isLoading ? "Close (sync continues in background)" : "Close"}
            >
              <XMarkIcon className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Progress Section */}
          {isLoading && (
            <div className="px-6 py-4 border-b flex-shrink-0">
              {/* Status Line */}
              <div className={`flex items-center gap-2 mb-3 ${status.color}`}>
                {status.icon}
                <span className="font-medium">{status.text}</span>
                
                {/* Estimated time remaining */}
                {progressEvent?.estimatedTimeRemaining && progressEvent.estimatedTimeRemaining > 0 && (
                  <span className="ml-auto text-sm text-gray-500 flex items-center gap-1">
                    <ClockIcon className="w-4 h-4" />
                    ~{Math.ceil(progressEvent.estimatedTimeRemaining / 60)}min remaining
                  </span>
                )}
              </div>
              
              {/* Progress Bar */}
              <div className="w-full h-3 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-blue-500 to-indigo-600 transition-all duration-500 rounded-full"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="text-right text-xs text-gray-500 mt-1">
                {progressPercent}% complete
              </div>
              
              {/* Stats */}
              <div className="mt-4">
                <ProgressStats
                  postsFound={progressEvent?.postsFound || 0}
                  newPostsAdded={progressEvent?.newPostsAdded || 0}
                  duplicatesSkipped={progressEvent?.duplicatesSkipped || 0}
                  pagesCompleted={progressEvent?.pagesCompleted || 0}
                  totalPages={progressEvent?.totalPages}
                />
              </div>
            </div>
          )}

          {/* Content Area */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {isLoading ? (
              <>
                {/* Post Feed Toggle */}
                <div className="px-6 py-2 border-b flex items-center justify-between flex-shrink-0">
                  <button
                    onClick={() => setShowPostFeed(!showPostFeed)}
                    className="text-sm text-gray-600 hover:text-gray-900 flex items-center gap-2"
                  >
                    <span>{showPostFeed ? '▼' : '▶'}</span>
                    <span>Live Post Feed</span>
                    {recentPosts.length > 0 && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs">
                        {recentPosts.length}
                      </span>
                    )}
                  </button>
                  
                  {showPostFeed && !autoScroll && (
                    <button
                      onClick={() => setAutoScroll(true)}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      ↑ Jump to latest
                    </button>
                  )}
                </div>
                
                {/* Post Feed */}
                {showPostFeed && (
                  <div 
                    ref={feedRef}
                    onScroll={handleFeedScroll}
                    className="flex-1 overflow-y-auto px-6 py-4 space-y-2"
                    style={{ maxHeight: '300px' }}
                  >
                    {recentPosts.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        <Download className="w-8 h-8 mx-auto mb-2 animate-bounce" />
                        <p>Waiting for posts...</p>
                      </div>
                    ) : (
                      recentPosts.map((post, index) => (
                        <PostFeedItem 
                          key={post.platformPostId || index} 
                          post={post}
                          isLatest={index === 0}
                        />
                      ))
                    )}
                  </div>
                )}
                
                {/* Background Continue Note */}
                <div className="px-6 py-3 bg-blue-50 border-t border-blue-100 flex-shrink-0">
                  <p className="text-xs text-blue-700 text-center">
                    💡 You can close this dialog - the sync will continue in the background
                  </p>
                </div>
              </>
            ) : (
              /* Pre-sync Content */
              <div className="px-6 py-6">
                {isResume ? (
                  <>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                        <PlayIcon className="w-5 h-5 text-green-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Resume Previous Sync</p>
                        <p className="text-sm text-gray-500">
                          {account.postCount || 0} posts already saved
                        </p>
                      </div>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
                      <p className="text-sm text-green-800">
                        The previous sync was interrupted. Click "Resume" to continue fetching 
                        older posts from where you left off.
                      </p>
                      {(account as any).fullSyncOldestPostDate && (
                        <p className="text-xs text-green-600 mt-2">
                          Last sync reached: {new Date((account as any).fullSyncOldestPostDate).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  </>
                ) : hasFullHistory ? (
                  <>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                        <ExclamationTriangleIcon className="w-5 h-5 text-amber-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Full History Already Synced</p>
                        <p className="text-sm text-gray-500">
                          {account.postCount || 0} posts in database
                        </p>
                      </div>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
                      <p className="text-sm text-amber-800">
                        This account has already been fully synced. Running again will re-scan 
                        all posts but won't save duplicates. For new posts only, use "Fetch Posts" instead.
                      </p>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                        <Download className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">Fetch All Historical Posts</p>
                        <p className="text-sm text-gray-500">
                          Currently {account.postCount || 0} posts saved
                        </p>
                      </div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                      <ul className="text-sm text-blue-800 space-y-1">
                        <li>• May take several minutes depending on post count</li>
                        <li>• Fetches up to 5,000 posts maximum</li>
                        <li>• Uses Facebook API quota</li>
                        <li>• <strong>Progress saves automatically</strong> - you can resume if interrupted</li>
                      </ul>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t flex gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              {isLoading ? 'Close (Sync Continues)' : 'Cancel'}
            </button>
            {!isLoading && (
              <button
                type="button"
                onClick={onConfirm}
                className={`
                  flex-1 px-4 py-2.5 text-sm font-medium text-white rounded-lg 
                  flex items-center justify-center gap-2 transition-colors
                  ${isResume 
                    ? 'bg-green-600 hover:bg-green-700'
                    : hasFullHistory 
                      ? 'bg-amber-600 hover:bg-amber-700' 
                      : 'bg-blue-600 hover:bg-blue-700'
                  }
                `}
              >
                {isResume ? (
                  <>
                    <PlayIcon className="w-4 h-4" />
                    Resume Sync
                  </>
                ) : hasFullHistory ? (
                  <>
                    <ArrowPathIcon className="w-4 h-4" />
                    Re-sync All Posts
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Start Full Sync
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* CSS for pulse animation */}
      <style>{`
        @keyframes pulse-once {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
        .animate-pulse-once {
          animation: pulse-once 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default SyncProgressModal;