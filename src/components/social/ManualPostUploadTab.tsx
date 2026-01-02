// src/components/social/ManualPostUploadTab.tsx
// UPDATED: Interactive category selectors for bulk upload
// - Tap Results/Promo/General cards to toggle selection for upload
// - Skipped posts card shows reasons for skipping
// - All categories selected by default with highlighted borders
// - SEQUENTIAL PROCESSING: When a post needs manual review during batch upload,
//   processing pauses until user takes action (link/skip) before continuing to next post
// - SKIP BELOW THRESHOLD: Option to automatically skip posts that don't meet the
//   auto-link threshold instead of showing manual review modal (enabled by default)
// - FIXED: Progress display now shows correct values during Lambda processing phase
// - COLLAPSIBLE CONFIG: Configuration section collapses when files are loaded
// - SOURCE DISPLAY: After folder/file selection, upload zone shows selected source with change options

import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  FolderOpenIcon,
  ArrowUpTrayIcon,
  TrashIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  FunnelIcon,
  TrophyIcon,
  PhotoIcon,
  ChatBubbleLeftIcon,
  HeartIcon,
  ShareIcon,
  DocumentTextIcon,
  InformationCircleIcon,
  MegaphoneIcon,
  CloudArrowUpIcon,
  LinkIcon,
  CogIcon,
  PlayIcon,
  EyeIcon,
  ChevronDownIcon,
} from '@heroicons/react/24/outline';
import { Loader2 } from 'lucide-react';

// Hooks
import { useSocialPostUpload, ReviewablePostWithAttachments } from '../../hooks/useSocialPostUpload';
import { useSocialPostProcessor } from '../../hooks/useSocialPostProcessor';

// Components
import { SocialPostProcessingModal } from './SocialPostProcessingModal';

// Types
import type { 
  PostType, 
  ProcessingFlow, 
  ProcessingOptions,
  ProcessingResultSummary,
  ContentType,
} from '../../types/socialPostUpload';
import { 
  DEFAULT_PROCESSING_OPTIONS,
  getContentTypeInfo,
  getConfidenceBadge,
} from '../../types/socialPostUpload';
import type { SocialAccount, ProcessSocialPostResult, SocialPostProcessingStatus } from '../../API';
import { formatAEST } from '../../utils/dateUtils';

// ===================================================================
// TYPES
// ===================================================================

interface ManualPostUploadTabProps {
  accounts: SocialAccount[];
  entities?: Array<{ id: string; entityName: string }>;
  venues?: Array<{ id: string; name: string }>;
}

// ===================================================================
// SUB-COMPONENTS
// ===================================================================

// Post Type Badge - shows AFTER Lambda processing
const ProcessedTypeBadge: React.FC<{ 
  result: ProcessingResultSummary;
}> = ({ result }) => {
  const typeInfo = getContentTypeInfo(result.contentType);
  const confidenceBadge = getConfidenceBadge(result.confidence);
  
  return (
    <div className="flex items-center gap-2">
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${typeInfo.bgColor} ${typeInfo.color}`}>
        <span className="mr-1">{typeInfo.icon}</span>
        {typeInfo.label}
      </span>
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${confidenceBadge.color}`}>
        {result.confidence}%
      </span>
      {result.matchCount > 0 && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
          <LinkIcon className="w-3 h-3 mr-1" />
          {result.matchCount} match{result.matchCount !== 1 ? 'es' : ''}
        </span>
      )}
      {result.linksCreated > 0 && (
        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          ✓ Linked
        </span>
      )}
    </div>
  );
};

// Pending Badge - shows BEFORE Lambda processing (using client-side hints)
const PendingTypeBadge: React.FC<{ 
  postType: PostType; 
  confidence: number;
}> = ({ postType, confidence }) => {
  const typeInfo = getContentTypeInfo(postType as ContentType);
  
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border opacity-60 ${typeInfo.bgColor} ${typeInfo.color}`}>
      <span className="mr-1">{typeInfo.icon}</span>
      {typeInfo.label}
      <span className="ml-1 text-gray-500">({confidence}%)</span>
      <span className="ml-1 text-gray-400 italic">pending</span>
    </span>
  );
};

// Attachment Preview Component
const AttachmentPreview: React.FC<{ files: File[] }> = ({ files }) => {
  const [previewUrls, setPreviewUrls] = React.useState<string[]>([]);
  
  React.useEffect(() => {
    const urls = files.slice(0, 4).map(file => URL.createObjectURL(file));
    setPreviewUrls(urls);
    return () => { urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [files]);
  
  if (files.length === 0) return null;
  
  return (
    <div className="mt-2">
      <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
        <PhotoIcon className="w-3.5 h-3.5" />
        <span>{files.length} attachment{files.length !== 1 ? 's' : ''}</span>
      </div>
      <div className="flex gap-1">
        {previewUrls.map((url, idx) => (
          <div key={idx} className="relative w-12 h-12 rounded overflow-hidden bg-gray-100">
            <img src={url} alt={`Attachment ${idx + 1}`} className="w-full h-full object-cover" />
            {idx === 3 && files.length > 4 && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <span className="text-white text-xs font-bold">+{files.length - 4}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

// Post Preview Card Component
const PostPreviewCard: React.FC<{
  post: ReviewablePostWithAttachments;
  isSelected: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
  onPreview?: () => void;
  showPreviewButton?: boolean;
}> = ({ post, isSelected, onToggleSelect, onToggleExpand, onPreview, showPreviewButton }) => {
  const statusColors = {
    pending: 'bg-gray-100 text-gray-600',
    uploading: 'bg-blue-100 text-blue-600',
    success: 'bg-green-100 text-green-600',
    error: 'bg-red-100 text-red-600',
    skipped: 'bg-yellow-100 text-yellow-600',
  };
  
  const processingColors = {
    pending: 'bg-gray-100 text-gray-600',
    processing: 'bg-blue-100 text-blue-600',
    success: 'bg-green-100 text-green-600',
    error: 'bg-red-100 text-red-600',
    skipped: 'bg-yellow-100 text-yellow-600',
  };
  
  const hasAttachments = post.attachmentFiles && post.attachmentFiles.length > 0;
  const hasProcessingResult = !!post._processingResult;
  const isProcessed = post._processingStatus === 'success';
  
  return (
    <div className={`border rounded-lg p-4 transition-all ${
      isSelected ? 'border-indigo-500 bg-indigo-50/30' : 'border-gray-200 bg-white'
    } ${post._uploadStatus === 'success' && !isProcessed ? 'opacity-80' : ''}`}>
      {/* Header Row */}
      <div className="flex items-start gap-3">
        {/* Selection Checkbox */}
        <input
          type="checkbox"
          checked={isSelected}
          onChange={onToggleSelect}
          disabled={post._uploadStatus === 'success'}
          className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
        />
        
        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {/* Top Row: Date, Author, Badges */}
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <span className="text-sm text-gray-500">
                {formatAEST(post.postedAt, { includeDay: true, shortDay: true })}
            </span>
            <span className="text-sm font-medium text-gray-700">
              {post.author.name}
            </span>
            
            {/* Type Badge - show processed result or pending indicator */}
            {hasProcessingResult ? (
              <ProcessedTypeBadge result={post._processingResult!} />
            ) : (
              <PendingTypeBadge postType={post.postType} confidence={post.confidence} />
            )}
            
            {/* Attachments indicator */}
            {hasAttachments && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-cyan-100 text-cyan-800 border border-cyan-200">
                <CloudArrowUpIcon className="w-3 h-3 mr-1" />
                {post.attachmentFiles!.length} image{post.attachmentFiles!.length !== 1 ? 's' : ''}
              </span>
            )}
            
            {/* Upload Status */}
            {post._uploadStatus && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[post._uploadStatus]}`}>
                {post._uploadStatus === 'success' && <CheckCircleIcon className="w-3 h-3 mr-1" />}
                {post._uploadStatus === 'error' && <ExclamationCircleIcon className="w-3 h-3 mr-1" />}
                {post._uploadStatus === 'uploading' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                {post._uploadStatus}
              </span>
            )}
            
            {/* Processing Status */}
            {post._processingStatus && post._processingStatus !== 'success' && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${processingColors[post._processingStatus]}`}>
                {post._processingStatus === 'processing' && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
                {post._processingStatus === 'error' && <ExclamationCircleIcon className="w-3 h-3 mr-1" />}
                {post._processingStatus}
              </span>
            )}
            
            {/* Errors */}
            {post._uploadError && (
              <span className="text-xs text-red-600 truncate max-w-xs" title={post._uploadError}>
                {post._uploadError}
              </span>
            )}
            {post._processingError && (
              <span className="text-xs text-red-600 truncate max-w-xs" title={post._processingError}>
                {post._processingError}
              </span>
            )}
            
            {/* Venue Match (from client-side parsing) */}
            {post.venueMatch && !hasProcessingResult && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                📍 {post.venueMatch.name}
              </span>
            )}
          </div>
          
          {/* Content Preview */}
          <p className={`text-sm text-gray-600 ${post.isExpanded ? '' : 'line-clamp-3'}`}>
            {post.content}
          </p>
          
          {/* Expand/Collapse Button */}
          {post.content.length > 200 && (
            <button
              onClick={onToggleExpand}
              className="text-xs text-indigo-600 hover:text-indigo-800 mt-1"
            >
              {post.isExpanded ? 'Show less' : 'Show more'}
            </button>
          )}
          
          {/* Attachment Preview */}
          {hasAttachments && (
            <AttachmentPreview files={post.attachmentFiles!} />
          )}
          
          {/* Extracted Data (from client-side parsing - shown when expanded) */}
          {(post.isExpanded || post.isTournamentResult) && post.placements.length > 0 && !hasProcessingResult && (
            <div className="mt-3 p-2 bg-gray-50 rounded-md">
              <h4 className="text-xs font-semibold text-gray-700 mb-1">Extracted Results (preview):</h4>
              <div className="space-y-1">
                {post.placements.slice(0, 5).map((p, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="font-medium text-gray-600">
                      {p.place === 1 ? '🥇' : p.place === 2 ? '🥈' : p.place === 3 ? '🥉' : `${p.place}th`}
                    </span>
                    <span className="text-gray-800">{p.name}</span>
                    {p.prize && (
                      <span className="text-green-600 font-medium">${p.prize.toLocaleString()}</span>
                    )}
                  </div>
                ))}
              </div>
              
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                {post.entriesCount && <span>📊 {post.entriesCount} entries</span>}
                {post.prizePoolAmount && <span>💰 ${post.prizePoolAmount.toLocaleString()} pool</span>}
                {post.buyInAmount && <span>🎟️ ${post.buyInAmount} buy-in</span>}
                {post.gameTypes.length > 0 && <span>🃏 {post.gameTypes.join(', ')}</span>}
              </div>
            </div>
          )}
          
          {/* Processing Result Details (when processed) */}
          {hasProcessingResult && post._processingResult!.suggestedGameName && (
            <div className="mt-3 p-2 bg-green-50 rounded-md border border-green-200">
              <h4 className="text-xs font-semibold text-green-700 mb-1">Matched Game:</h4>
              <div className="text-sm text-green-800">
                {post._processingResult!.suggestedGameName}
                <span className="ml-2 text-green-600">
                  ({post._processingResult!.bestMatchConfidence}% confidence)
                </span>
              </div>
            </div>
          )}
          
          {/* Bottom Row: Engagement Stats */}
          <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <HeartIcon className="w-4 h-4" />
              {post.likeCount}
            </span>
            <span className="flex items-center gap-1">
              <ChatBubbleLeftIcon className="w-4 h-4" />
              {post.commentCount}
            </span>
            <span className="flex items-center gap-1">
              <ShareIcon className="w-4 h-4" />
              {post.shareCount}
            </span>
            {post.imageCount > 0 && (
              <span className="flex items-center gap-1">
                <PhotoIcon className="w-4 h-4" />
                {post.imageCount}
              </span>
            )}
            
            {/* Preview button */}
            {showPreviewButton && onPreview && (
              <button
                onClick={onPreview}
                className="ml-auto flex items-center gap-1 text-indigo-600 hover:text-indigo-800"
              >
                <EyeIcon className="w-4 h-4" />
                Preview
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const ManualPostUploadTab: React.FC<ManualPostUploadTabProps> = ({
  accounts,
  entities = [],
  venues = [],
}) => {
  // =========================================================================
  // STATE
  // =========================================================================
  
  // Account & overrides
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [selectedVenueId, setSelectedVenueId] = useState<string>('');
  
  // UI state
  const [showFilters, setShowFilters] = useState(false);
  const [showAdvancedOptions, setShowAdvancedOptions] = useState(false);
  const [showProcessingOptions, setShowProcessingOptions] = useState(false);
  const [showSkippedDetails, setShowSkippedDetails] = useState(false);
  const [configSectionOpen, setConfigSectionOpen] = useState(true);
  const [selectedSourceName, setSelectedSourceName] = useState<string>('');
  
  // Processing flow (NEW - like scraper's scrape_only/scrape_save)
  const [processingFlow, setProcessingFlow] = useState<ProcessingFlow>('upload_process');
  const [processingOptions, setProcessingOptions] = useState<ProcessingOptions>(DEFAULT_PROCESSING_OPTIONS);
  
  // Upload cancellation
  const [isCancelling, setIsCancelling] = useState(false);
  const cancelRef = useRef(false);
  
  // Modal state
  const [processingModalOpen, setProcessingModalOpen] = useState(false);
  const [currentModalResult, setCurrentModalResult] = useState<ProcessSocialPostResult | null>(null);
  const [currentModalPost, setCurrentModalPost] = useState<ReviewablePostWithAttachments | null>(null);
  
  // Batch processing context for modal (shows progress during batch)
   const [batchProcessingContext, setBatchProcessingContext] = useState<{
    current: number;
    total: number;
  } | null>(null);
  
  // Lambda processing progress (separate from upload progress)
  const [lambdaProgress, setLambdaProgress] = useState<{
    current: number;
    total: number;
    stage: string;
  } | null>(null);
  
  // Promise resolver for sequential processing - allows waiting for modal action
  const modalResolverRef = useRef<((action: 'linked' | 'skipped' | 'cancelled') => void) | null>(null);
  
  // =========================================================================
  // HOOKS
  // =========================================================================
  
  // Upload hook (existing)
  const {
    reviewablePosts,
    isLoading,
    isUploading,
    error,
    uploadProgress,
    accountContext,
    loadPostsFromFiles,
    clearPosts,
    selectedPosts,
    togglePostSelection,
    selectAll,
    deselectAll,
    selectTournamentResults,
    filterOptions,
    setFilterOptions,
    sortOptions,
    setSortOptions,
    filteredPosts,
    uploadSelectedPosts,
    stats,
    updatePostField,
  } = useSocialPostUpload({
    socialAccountId: selectedAccountId,
    entityId: selectedEntityId || undefined,
    venueId: selectedVenueId || undefined,
  });
  
  // Processor hook (NEW)
  const processor = useSocialPostProcessor();
  
  // File input refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  
  // =========================================================================
  // COMPUTED VALUES
  // =========================================================================
  
  const attachmentStats = useMemo(() => {
    const postsWithAttachments = reviewablePosts.filter(
      p => p.attachmentFiles && p.attachmentFiles.length > 0
    );
    const totalAttachments = postsWithAttachments.reduce(
      (sum, p) => sum + (p.attachmentFiles?.length || 0),
      0
    );
    const selectedWithAttachments = reviewablePosts.filter(
      p => selectedPosts.has(p.postId) && p.attachmentFiles && p.attachmentFiles.length > 0
    );
    const selectedAttachments = selectedWithAttachments.reduce(
      (sum, p) => sum + (p.attachmentFiles?.length || 0),
      0
    );
    
    return {
      postsWithAttachments: postsWithAttachments.length,
      totalAttachments,
      selectedWithAttachments: selectedWithAttachments.length,
      selectedAttachments,
    };
  }, [reviewablePosts, selectedPosts]);
  
  // Processing stats
  const processingStats = useMemo(() => {
    const processed = reviewablePosts.filter(p => p._processingStatus === 'success');
    const linked = processed.filter(p => p._processingResult?.linksCreated && p._processingResult.linksCreated > 0);
    const results = processed.filter(p => p._processingResult?.contentType === 'RESULT');
    
    return {
      processedCount: processed.length,
      linkedCount: linked.length,
      resultCount: results.length,
    };
  }, [reviewablePosts]);
  
  // Category selection state - derived from actual selectedPosts
  const categorySelection = useMemo(() => {
    const resultPosts = reviewablePosts.filter(p => p.postType === 'RESULT' && !p.isComment);
    const promoPosts = reviewablePosts.filter(p => p.postType === 'PROMOTIONAL' && !p.isComment);
    const generalPosts = reviewablePosts.filter(p => p.postType === 'GENERAL' && !p.isComment);
    
    const resultsSelected = resultPosts.filter(p => selectedPosts.has(p.postId)).length;
    const promoSelected = promoPosts.filter(p => selectedPosts.has(p.postId)).length;
    const generalSelected = generalPosts.filter(p => selectedPosts.has(p.postId)).length;
    
    return {
      results: {
        total: resultPosts.length,
        selected: resultsSelected,
        allSelected: resultPosts.length > 0 && resultsSelected === resultPosts.length,
        posts: resultPosts,
      },
      promo: {
        total: promoPosts.length,
        selected: promoSelected,
        allSelected: promoPosts.length > 0 && promoSelected === promoPosts.length,
        posts: promoPosts,
      },
      general: {
        total: generalPosts.length,
        selected: generalSelected,
        allSelected: generalPosts.length > 0 && generalSelected === generalPosts.length,
        posts: generalPosts,
      },
    };
  }, [reviewablePosts, selectedPosts]);
  
  const isProcessing = isUploading || processor.isProcessing;
  
  // =========================================================================
  // HANDLERS
  // =========================================================================
  
  // Toggle all posts in a category
  const toggleCategory = useCallback((category: 'results' | 'promo' | 'general') => {
    const catData = categorySelection[category];
    
    if (catData.allSelected) {
      // Deselect all posts in this category
      catData.posts.forEach(p => {
        if (selectedPosts.has(p.postId)) {
          togglePostSelection(p.postId);
        }
      });
    } else {
      // Select all posts in this category
      catData.posts.forEach(p => {
        if (!selectedPosts.has(p.postId)) {
          togglePostSelection(p.postId);
        }
      });
    }
  }, [categorySelection, selectedPosts, togglePostSelection]);
  
  // Handle file selection
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = e.target.files;
      
      // Extract source name from files
      // For folder uploads, get the folder name from the path
      // For JSON files, get the file name
      let sourceName = '';
      const firstFile = files[0];
      if (firstFile.webkitRelativePath) {
        // Folder upload - extract folder name from path
        const pathParts = firstFile.webkitRelativePath.split('/');
        sourceName = pathParts[0] || firstFile.name;
      } else {
        // Single file(s) - use file name(s)
        sourceName = files.length === 1 
          ? firstFile.name 
          : `${files.length} files`;
      }
      
      setSelectedSourceName(sourceName);
      await loadPostsFromFiles(files);
      
      // Collapse config section after files are loaded
      setConfigSectionOpen(false);
    }
  }, [loadPostsFromFiles]);
  
  // Handle cancel
  const handleCancelUpload = useCallback(() => {
    console.log('[ManualPostUpload] Cancel requested');
    cancelRef.current = true;
    setIsCancelling(true);
    
    // If modal is waiting for user action, resolve with 'cancelled'
    if (modalResolverRef.current) {
      modalResolverRef.current('cancelled');
      modalResolverRef.current = null;
    }
  }, []);
  
  // Handle clear all - clears posts and resets source selection
  const handleClearAll = useCallback(() => {
    clearPosts();
    setSelectedSourceName('');
    setConfigSectionOpen(true);
  }, [clearPosts]);
  
  // Handle upload with optional processing
  const handleUpload = useCallback(async () => {
    if (!selectedAccountId) {
      alert('Please select a Social Account first');
      return;
    }
    
    // Reset cancel state
    cancelRef.current = false;
    setIsCancelling(false);
    
    // Collapse config section when processing starts
    setConfigSectionOpen(false);
    
    console.log('[ManualPostUpload] Starting upload with flow:', processingFlow);
    console.log('[ManualPostUpload] Processing options:', processingOptions);
    
    // Step 1: Upload posts (the hook handles duplicate checking internally)
    const uploadResult = await uploadSelectedPosts(
      {
        includeResults: filterOptions.showResults,
        includePromotional: filterOptions.showPromotional,
        includeGeneral: filterOptions.showGeneral,
        minConfidence: filterOptions.minConfidence,
        createGameRecords: false,
      },
      () => cancelRef.current // Pass cancellation check callback
    );
    
    console.log('[ManualPostUpload] Upload result:', uploadResult);
    
    // Check if user cancelled during upload phase
    if (cancelRef.current) {
      alert(`Upload cancelled!\n\nCompleted before cancel:\n✅ Uploaded: ${uploadResult.successCount}\n⏭️ Skipped: ${uploadResult.skippedCount}`);
      setIsCancelling(false);
      return;
    }
    
    // Check if there were errors and stop
    if (uploadResult.errorCount > 0) {
      const firstError = uploadResult.errors[0]?.error || 'Unknown error';
      const shouldContinue = window.confirm(
        `Upload encountered ${uploadResult.errorCount} error(s).\n\n` +
        `First error: ${firstError}\n\n` +
        `✅ Uploaded: ${uploadResult.successCount}\n` +
        `⏭️ Skipped: ${uploadResult.skippedCount}\n\n` +
        `Continue with processing uploaded posts?`
      );
      
      if (!shouldContinue) {
        return;
      }
    }
    
    const successfulUploads = uploadResult.results.filter(r => r.success && r.socialPostId);
    console.log('[ManualPostUpload] Successful uploads with IDs:', successfulUploads);
    
    // Step 2: If upload_process flow, process each uploaded post
    if (processingFlow === 'upload_process' && successfulUploads.length > 0) {
      console.log('[ManualPostUpload] Starting Lambda processing for', successfulUploads.length, 'posts');
      let totalLinksCreated = 0;
      let processedCount = 0;
      let errorCount = 0;
      let cancelledAt = -1;
      let skippedBelowThreshold = 0;  // Track posts skipped due to low confidence
      
      // Initialize Lambda processing progress
      setLambdaProgress({ current: 0, total: successfulUploads.length, stage: 'Processing posts...' });
      
      for (let i = 0; i < successfulUploads.length; i++) {
        // Update progress
        setLambdaProgress({ 
          current: i + 1, 
          total: successfulUploads.length, 
          stage: `Processing post ${i + 1} of ${successfulUploads.length}...` 
        });
        
        // Check for cancellation
        if (cancelRef.current) {
          console.log('[ManualPostUpload] Processing cancelled at post', i + 1);
          cancelledAt = i;
          break;
        }
        
        const upload = successfulUploads[i];
        if (!upload.socialPostId) continue;
        
        // Find the original post for context
        const originalPost = reviewablePosts.find(p => p.postId === upload.postId);
        
        // Update processing status
        if (originalPost) {
          updatePostField(originalPost.postId, '_processingStatus', 'processing');
        }
        
        try {
          // Process the post via Lambda
          console.log('[ManualPostUpload] Calling processSinglePost for:', upload.socialPostId);
          const result = await processor.processSinglePost({
            socialPostId: upload.socialPostId,
            forceReprocess: processingOptions.forceReprocess,
            skipMatching: processingOptions.skipMatching,
            skipLinking: processingOptions.skipLinking,
            matchThreshold: processingOptions.matchThreshold,
          });
          
          console.log('[ManualPostUpload] Process result:', result);
          
          if (result.success) {
            processedCount++;
            totalLinksCreated += result.linksCreated || 0;
            
            // Update post with processing result
            if (originalPost) {
              const summary: ProcessingResultSummary = {
                contentType: (result.extractedGameData?.contentType as ContentType) || 'GENERAL',
                confidence: result.extractedGameData?.contentTypeConfidence || 0,
                matchCount: result.matchCandidates?.length || 0,
                bestMatchConfidence: result.primaryMatch?.matchConfidence || 0,
                linksCreated: result.linksCreated || 0,
                placementsExtracted: result.placementsExtracted || 0,
                suggestedGameId: result.primaryMatch?.gameId ?? undefined,
                suggestedGameName: result.primaryMatch?.gameName ?? undefined,
              };
              
              updatePostField(originalPost.postId, '_processingStatus', 'success');
              updatePostField(originalPost.postId, '_processingResult', summary);
              updatePostField(originalPost.postId, '_matchCandidates', result.matchCandidates);
              
              // If has matches but no auto-links, decide whether to show modal or skip
              if (!processingOptions.skipLinking && 
                  result.linksCreated === 0 && 
                  result.matchCandidates && 
                  result.matchCandidates.length > 0) {
                
                // If skipBelowThreshold is enabled, automatically skip without showing modal
                if (processingOptions.skipBelowThreshold) {
                  console.log(`[ManualPostUpload] Skipping post ${i + 1} - below threshold (${result.primaryMatch?.matchConfidence || 0}% < ${processingOptions.matchThreshold}%)`);
                  skippedBelowThreshold++;
                  // Continue to next post without showing modal
                } else {
                  // Show modal for manual review
                  setCurrentModalResult(result);
                  setCurrentModalPost(originalPost);
                  setBatchProcessingContext({ current: i + 1, total: successfulUploads.length });
                  setProcessingModalOpen(true);
                  
                  // Wait for user to take action on the modal before continuing
                  const modalAction = await new Promise<'linked' | 'skipped' | 'cancelled'>((resolve) => {
                    modalResolverRef.current = resolve;
                  });
                  
                  console.log(`[ManualPostUpload] Modal action: ${modalAction} for post ${i + 1}`);
                  
                  // Close the modal state after action
                  setProcessingModalOpen(false);
                  setCurrentModalResult(null);
                  setCurrentModalPost(null);
                  setBatchProcessingContext(null);
                  
                  // Handle different actions
                  if (modalAction === 'cancelled') {
                    cancelledAt = i;
                    break; // Exit the loop
                  } else if (modalAction === 'linked') {
                    totalLinksCreated++;
                    if (originalPost) {
                      updatePostField(originalPost.postId, '_processingResult', {
                        ...summary,
                        linksCreated: 1,
                      });
                    }
                  }
                  // 'skipped' - just continue to next post
                }
              }
            }
          } else {
            errorCount++;
            if (originalPost) {
              updatePostField(originalPost.postId, '_processingStatus', 'error');
              updatePostField(originalPost.postId, '_processingError', result.error || 'Processing failed');
            }
            
            // Stop on processing error - ask user if they want to continue
            const shouldContinue = window.confirm(
              `Processing error on post ${i + 1}/${successfulUploads.length}:\n\n` +
              `${result.error || 'Unknown error'}\n\n` +
              `Continue processing remaining posts?`
            );
            
            if (!shouldContinue) {
              cancelledAt = i;
              break;
            }
          }
        } catch (err) {
          errorCount++;
          const errorMessage = err instanceof Error ? err.message : 'Processing failed';
          
          if (originalPost) {
            updatePostField(originalPost.postId, '_processingStatus', 'error');
            updatePostField(originalPost.postId, '_processingError', errorMessage);
          }
          
          // Stop on exception - ask user if they want to continue
          const shouldContinue = window.confirm(
            `Processing exception on post ${i + 1}/${successfulUploads.length}:\n\n` +
            `${errorMessage}\n\n` +
            `Continue processing remaining posts?`
          );
          
          if (!shouldContinue) {
            cancelledAt = i;
            break;
          }
        }
      }
      
      // Reset cancel state and clear progress
      setIsCancelling(false);
      setLambdaProgress(null);
      
      // Show final summary
      const wasCancelled = cancelledAt >= 0;
      alert(
        `Upload & Process ${wasCancelled ? 'Stopped' : 'Complete'}!\n\n` +
        `📤 Uploaded: ${uploadResult.successCount}\n` +
        `⏭️ Skipped (duplicates): ${uploadResult.skippedCount}\n` +
        `⚙️ Processed: ${processedCount}${wasCancelled ? ` / ${successfulUploads.length}` : ''}\n` +
        `🔗 Links Created: ${totalLinksCreated}\n` +
        (skippedBelowThreshold > 0 ? `⬇️ Skipped (< ${processingOptions.matchThreshold}% threshold): ${skippedBelowThreshold}\n` : '') +
        `❌ Errors: ${uploadResult.errorCount + errorCount}\n` +
        (wasCancelled ? `\n⚠️ Stopped at post ${cancelledAt + 1}` : '') +
        (uploadResult.errors.length > 0 ? `\nFirst upload error: ${uploadResult.errors[0]?.error}` : '')
      );
    } else {
      // Upload only - show simple summary
      const totalAttachmentsUploaded = reviewablePosts
        .filter(p => selectedPosts.has(p.postId) && p.attachmentFiles && p.attachmentFiles.length > 0)
        .reduce((sum, p) => sum + (p.attachmentFiles?.length || 0), 0);
      
      setIsCancelling(false);
      
      alert(
        `Upload Complete!\n\n` +
        `✅ Success: ${uploadResult.successCount}\n` +
        `⏭️ Skipped (duplicates): ${uploadResult.skippedCount}\n` +
        `❌ Errors: ${uploadResult.errorCount}\n` +
        (totalAttachmentsUploaded > 0 ? `📷 Images uploaded: ${totalAttachmentsUploaded}\n` : '') +
        (uploadResult.errors.length > 0 ? `\nFirst error: ${uploadResult.errors[0]?.error}` : '')
      );
    }
  }, [
    selectedAccountId, 
    uploadSelectedPosts, 
    filterOptions, 
    processingFlow, 
    processingOptions,
    reviewablePosts, 
    selectedPosts,
    processor,
    updatePostField,
  ]);
  
  // Handle preview for a single post (before upload) - calls Lambda without saving
  const handlePreviewPost = useCallback(async (post: ReviewablePostWithAttachments) => {
    console.log('[ManualPostUpload] Previewing post:', post.postId);
    
    try {
      // Call Lambda preview - no database save, just extraction + matching
      const result = await processor.previewContent({
        content: post.content,
        postedAt: post.postedAt,
        platform: 'FACEBOOK',
        entityId: selectedEntityId || accountContext?.entityId || undefined,
        venueId: selectedVenueId || accountContext?.venueId || undefined,
        url: post.url,
      });
      
      console.log('[ManualPostUpload] Preview result:', result);
      
      setCurrentModalResult(result);
      setCurrentModalPost(post);
      setProcessingModalOpen(true);
      
    } catch (err) {
      console.error('[ManualPostUpload] Preview error:', err);
      
      // Fallback to client-side data if Lambda fails
      const fallbackResult: ProcessSocialPostResult = {
        __typename: 'ProcessSocialPostResult',
        success: false,
        socialPostId: null,
        processingStatus: 'FAILED' as SocialPostProcessingStatus,
        error: err instanceof Error ? err.message : 'Preview failed',
        warnings: ['Using client-side preview due to Lambda error'],
        extractedGameData: {
          __typename: 'SocialPostGameData',
          id: 'preview',
          socialPostId: post.postId,
          contentType: post.postType as any,
          contentTypeConfidence: post.confidence,
          extractedBuyIn: post.buyInAmount || undefined,
          extractedPrizePool: post.prizePoolAmount || undefined,
          extractedTotalEntries: post.entriesCount || undefined,
          extractedWinnerName: post.placements[0]?.name,
          extractedWinnerPrize: post.placements[0]?.prize || undefined,
          placementCount: post.placements.length,
          extractedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as any,
        placementsExtracted: post.placements.length,
        matchCandidates: [],
      };
      
      setCurrentModalResult(fallbackResult);
      setCurrentModalPost(post);
      setProcessingModalOpen(true);
    }
  }, [processor, selectedEntityId, selectedVenueId, accountContext]);
  
  // Handle manual link from modal
  const handleLinkToGame = useCallback(async (gameId: string, isPrimary?: boolean) => {
    if (!currentModalResult?.socialPostId) {
      throw new Error('No social post ID available');
    }
    
    const result = await processor.linkToGame({
      socialPostId: currentModalResult.socialPostId,
      gameId,
      isPrimaryGame: isPrimary,
    });
    
    // Resolve the modal promise to continue processing
    if (modalResolverRef.current) {
      modalResolverRef.current('linked');
      modalResolverRef.current = null;
    }
    
    return result;
  }, [currentModalResult, processor]);
  
  // Handle modal close (skip this post)
  const handleCloseModal = useCallback(() => {
    // If we're in batch processing mode, just resolve the promise
    // The processing loop will handle clearing the modal state
    if (modalResolverRef.current) {
      modalResolverRef.current('skipped');
      modalResolverRef.current = null;
    } else {
      // Not in batch processing - clear modal state directly
      setProcessingModalOpen(false);
      setCurrentModalResult(null);
      setCurrentModalPost(null);
      setBatchProcessingContext(null);
    }
  }, []);
  
  // Toggle expand for a post
  const handleToggleExpand = useCallback((postId: string) => {
    updatePostField(postId, 'isExpanded', 
      !reviewablePosts.find(p => p.postId === postId)?.isExpanded
    );
  }, [updatePostField, reviewablePosts]);
  
  // =========================================================================
  // RENDER
  // =========================================================================
  
  return (
    <div className="space-y-6">
      {/* ================================================================= */}
      {/* HEADER SECTION - Collapsible Configuration */}
      {/* ================================================================= */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {/* Collapsible Header */}
        <button
          type="button"
          onClick={() => setConfigSectionOpen(!configSectionOpen)}
          className="w-full px-6 py-4 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
        >
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <CogIcon className="w-5 h-5" />
            Manual Post Upload
            {!configSectionOpen && selectedAccountId && (
              <span className="text-sm font-normal text-gray-500 ml-2">
                — {accounts.find(a => a.id === selectedAccountId)?.accountName || 'Account selected'}
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2">
            {!configSectionOpen && stats && stats.totalPosts > 0 && (
              <span className="text-sm text-gray-500">
                {stats.totalPosts} posts loaded
              </span>
            )}
            <ChevronDownIcon 
              className={`w-5 h-5 text-gray-500 transition-transform ${
                configSectionOpen ? 'rotate-180' : ''
              }`} 
            />
          </div>
        </button>
        
        {/* Collapsible Content */}
        {configSectionOpen && (
          <div className="p-6 border-t border-gray-200">
            <p className="text-sm text-gray-600 mb-6">
              Upload scraped Facebook posts from the Chrome extension. Posts will be 
              {processingFlow === 'upload_process' 
                ? ' uploaded and automatically processed to extract data and match to games.'
                : ' uploaded for later processing.'}
            </p>
            
            {/* Account Selection (Required) */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Social Account <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedAccountId}
                onChange={(e) => {
                  setSelectedAccountId(e.target.value);
                  setSelectedEntityId('');
                  setSelectedVenueId('');
                }}
                className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
              >
                <option value="">Select account...</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.accountName} ({account.platform})
                    {account.businessLocation ? ` — ${account.businessLocation}` : ''}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Account Context Info */}
            {accountContext && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
                <div className="flex items-start gap-2">
                  <InformationCircleIcon className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div className="text-sm">
                    <p className="font-medium text-blue-800">Account Context</p>
                    <p className="text-blue-700">
                      Posts will be linked to <strong>{accountContext.accountName}</strong>
                      {accountContext.businessLocation && ` (${accountContext.businessLocation})`}
                    </p>
                    {(accountContext.entityId || accountContext.venueId) && (
                      <p className="text-blue-600 text-xs mt-1">
                        {accountContext.entityId && '✓ Entity linked from account'}
                        {accountContext.entityId && accountContext.venueId && ' • '}
                        {accountContext.venueId && '✓ Venue linked from account'}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* ================================================================= */}
            {/* PROCESSING FLOW SELECTOR */}
            {/* ================================================================= */}
            <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <CogIcon className="w-4 h-4" />
                Processing Flow
              </h4>
              <div className="flex gap-6">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="processingFlow"
                    value="upload_process"
                    checked={processingFlow === 'upload_process'}
                    onChange={() => setProcessingFlow('upload_process')}
                    className="mt-1 w-4 h-4 text-green-600 focus:ring-green-500"
                  />
                  <div>
                    <div className="font-medium text-gray-900 flex items-center gap-2">
                      Upload + Process
                      <span className="px-1.5 py-0.5 bg-green-100 text-green-700 text-xs rounded">
                        Recommended
                      </span>
                    </div>
                    <div className="text-xs text-gray-500">
                      Upload, extract data, match to games, and auto-link high confidence matches.
                    </div>
                  </div>
                </label>
                
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="processingFlow"
                    value="upload_only"
                    checked={processingFlow === 'upload_only'}
                    onChange={() => setProcessingFlow('upload_only')}
                    className="mt-1 w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div>
                    <div className="font-medium text-gray-900">Upload Only</div>
                    <div className="text-xs text-gray-500">
                      Save posts to database. Process and match to games later.
                    </div>
                  </div>
                </label>
              </div>
              
              {/* Processing Options (when upload_process selected) */}
              {processingFlow === 'upload_process' && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <button
                    onClick={() => setShowProcessingOptions(!showProcessingOptions)}
                    className="text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    {showProcessingOptions ? '− Hide' : '+ Show'} processing options
                  </button>
                  
                  {showProcessingOptions && (
                    <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!processingOptions.skipLinking}
                          onChange={(e) => setProcessingOptions(prev => ({ 
                            ...prev, 
                            skipLinking: !e.target.checked 
                          }))}
                          className="w-4 h-4 rounded text-indigo-600"
                        />
                        <span className="text-sm text-gray-700">Auto-link matches</span>
                      </label>
                      
                      <div className="flex items-center gap-2">
                        <label className="text-sm text-gray-700">Threshold:</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={processingOptions.matchThreshold}
                          onChange={(e) => setProcessingOptions(prev => ({
                            ...prev,
                            matchThreshold: parseInt(e.target.value) || 80
                          }))}
                          className="w-16 px-2 py-1 border rounded text-sm"
                        />
                        <span className="text-sm text-gray-500">%</span>
                      </div>
                      
                      <label className="flex items-center gap-2" title="Skip posts that don't meet the auto-link threshold instead of showing manual review">
                        <input
                          type="checkbox"
                          checked={processingOptions.skipBelowThreshold ?? true}
                          onChange={(e) => setProcessingOptions(prev => ({ 
                            ...prev, 
                            skipBelowThreshold: e.target.checked 
                          }))}
                          className="w-4 h-4 rounded text-indigo-600"
                        />
                        <span className="text-sm text-gray-700">Skip if &lt; threshold</span>
                      </label>
                      
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!processingOptions.skipMatching}
                          onChange={(e) => setProcessingOptions(prev => ({ 
                            ...prev, 
                            skipMatching: !e.target.checked 
                          }))}
                          className="w-4 h-4 rounded text-indigo-600"
                        />
                        <span className="text-sm text-gray-700">Match to games</span>
                      </label>
                      
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={processingOptions.forceReprocess || false}
                          onChange={(e) => setProcessingOptions(prev => ({ 
                            ...prev, 
                            forceReprocess: e.target.checked 
                          }))}
                          className="w-4 h-4 rounded text-indigo-600"
                        />
                        <span className="text-sm text-gray-700">Force reprocess</span>
                      </label>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Advanced Options Toggle */}
            {(entities.length > 0 || venues.length > 0) && (
              <div className="mb-4">
                <button
                  onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
                  className="text-sm text-indigo-600 hover:text-indigo-800"
                >
                  {showAdvancedOptions ? '− Hide' : '+ Show'} entity/venue overrides
                </button>
              </div>
            )}
            
            {/* Optional Entity/Venue Overrides */}
            {showAdvancedOptions && (
              <div className="mb-4 grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 rounded-md">
                {entities.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Override Entity (optional)
                    </label>
                    <select
                      value={selectedEntityId}
                      onChange={(e) => setSelectedEntityId(e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    >
                      <option value="">Use account default</option>
                      {entities.map((entity) => (
                        <option key={entity.id} value={entity.id}>
                          {entity.entityName}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                
                {venues.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Override Venue (optional)
                    </label>
                    <select
                      value={selectedVenueId}
                      onChange={(e) => setSelectedVenueId(e.target.value)}
                      className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    >
                      <option value="">Use account default</option>
                      {venues.map((venue) => (
                        <option key={venue.id} value={venue.id}>
                          {venue.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
            
            {/* Upload Zone */}
            {stats && stats.totalPosts > 0 && selectedSourceName ? (
              // Source Selected State - Show folder/file info with change option
              <div className="border-2 border-solid border-green-300 bg-green-50 rounded-lg p-4 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
                      <CheckCircleIcon className="w-6 h-6 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-green-800">Source loaded</p>
                      <p className="text-sm text-green-700">{selectedSourceName}</p>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    {/* Reselect Folder */}
                    <label className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md shadow-sm text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer">
                      <FolderOpenIcon className="w-3.5 h-3.5 mr-1.5" />
                      Change Folder
                      <input
                        ref={folderInputRef}
                        type="file"
                        className="hidden"
                        webkitdirectory="true"
                        directory=""
                        multiple
                        onChange={handleFileSelect}
                      />
                    </label>
                    
                    {/* Reselect JSON */}
                    <label className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-md shadow-sm text-xs font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer">
                      <DocumentTextIcon className="w-3.5 h-3.5 mr-1.5" />
                      Change File
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json"
                        className="hidden"
                        multiple
                        onChange={handleFileSelect}
                      />
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              // Empty State - Show upload options
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-indigo-400 transition-colors">
                <FolderOpenIcon className="w-12 h-12 mx-auto text-gray-400 mb-3" />
                <p className="text-sm text-gray-600 mb-4">
                  Drop folders containing scraped posts or click to browse
                </p>
                
                <div className="flex justify-center gap-3">
                  {/* Folder Upload */}
                  <label className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 cursor-pointer">
                    <FolderOpenIcon className="w-4 h-4 mr-2" />
                    Select Folder
                    <input
                      ref={folderInputRef}
                      type="file"
                      className="hidden"
                      webkitdirectory="true"
                      directory=""
                      multiple
                      onChange={handleFileSelect}
                    />
                  </label>
                  
                  {/* JSON File Upload */}
                  <label className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 cursor-pointer">
                    <DocumentTextIcon className="w-4 h-4 mr-2" />
                    Select JSON File
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      className="hidden"
                      multiple
                      onChange={handleFileSelect}
                    />
                  </label>
                </div>
              </div>
            )}
            
            {/* Loading State */}
            {isLoading && (
              <div className="mt-4 flex items-center justify-center gap-2 text-indigo-600">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Processing files...</span>
              </div>
            )}
            
            {/* Error Display */}
            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                {error}
              </div>
            )}
          </div>
        )}
      </div>
      
      {/* ================================================================= */}
      {/* STATS SUMMARY */}
      {/* ================================================================= */}
      {stats && stats.totalPosts > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Loaded Posts
              {processingStats.processedCount > 0 && (
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({processingStats.processedCount} processed)
                </span>
              )}
            </h3>
            
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                showFilters 
                  ? 'bg-indigo-100 text-indigo-700' 
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <FunnelIcon className="w-4 h-4 mr-1" />
              Filters
            </button>
          </div>
          
          {/* Stats Cards - Interactive Category Selectors */}
          <p className="text-xs text-gray-500 mb-2">
            Tap a category to select/deselect all posts of that type
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            {/* Results Card - Toggleable */}
            <button
              type="button"
              onClick={() => toggleCategory('results')}
              disabled={categorySelection.results.total === 0}
              className={`rounded-lg p-3 border-2 transition-all text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                categorySelection.results.allSelected
                  ? 'bg-green-50 border-green-500 ring-2 ring-green-200 shadow-sm'
                  : categorySelection.results.selected > 0
                  ? 'bg-green-50 border-green-300'
                  : 'bg-green-50/50 border-green-200 opacity-60'
              }`}
            >
              <div className="flex items-center gap-2 text-green-700">
                <TrophyIcon className="w-5 h-5" />
                <span className="font-medium">Results</span>
                {categorySelection.results.allSelected && (
                  <CheckCircleIcon className="w-4 h-4 ml-auto text-green-600" />
                )}
              </div>
              <p className="text-2xl font-bold text-green-800 mt-1">{categorySelection.results.total}</p>
              <p className="text-xs text-green-600 mt-0.5">
                {categorySelection.results.selected}/{categorySelection.results.total} selected
              </p>
            </button>
            
            {/* Promo Card - Toggleable */}
            <button
              type="button"
              onClick={() => toggleCategory('promo')}
              disabled={categorySelection.promo.total === 0}
              className={`rounded-lg p-3 border-2 transition-all text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                categorySelection.promo.allSelected
                  ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-200 shadow-sm'
                  : categorySelection.promo.selected > 0
                  ? 'bg-blue-50 border-blue-300'
                  : 'bg-blue-50/50 border-blue-200 opacity-60'
              }`}
            >
              <div className="flex items-center gap-2 text-blue-700">
                <MegaphoneIcon className="w-5 h-5" />
                <span className="font-medium">Promo</span>
                {categorySelection.promo.allSelected && (
                  <CheckCircleIcon className="w-4 h-4 ml-auto text-blue-600" />
                )}
              </div>
              <p className="text-2xl font-bold text-blue-800 mt-1">{categorySelection.promo.total}</p>
              <p className="text-xs text-blue-600 mt-0.5">
                {categorySelection.promo.selected}/{categorySelection.promo.total} selected
              </p>
            </button>
            
            {/* General Card - Toggleable */}
            <button
              type="button"
              onClick={() => toggleCategory('general')}
              disabled={categorySelection.general.total === 0}
              className={`rounded-lg p-3 border-2 transition-all text-left cursor-pointer disabled:cursor-not-allowed disabled:opacity-40 ${
                categorySelection.general.allSelected
                  ? 'bg-gray-100 border-gray-500 ring-2 ring-gray-300 shadow-sm'
                  : categorySelection.general.selected > 0
                  ? 'bg-gray-100 border-gray-300'
                  : 'bg-gray-50 border-gray-200 opacity-60'
              }`}
            >
              <div className="flex items-center gap-2 text-gray-700">
                <DocumentTextIcon className="w-5 h-5" />
                <span className="font-medium">General</span>
                {categorySelection.general.allSelected && (
                  <CheckCircleIcon className="w-4 h-4 ml-auto text-gray-600" />
                )}
              </div>
              <p className="text-2xl font-bold text-gray-800 mt-1">{categorySelection.general.total}</p>
              <p className="text-xs text-gray-600 mt-0.5">
                {categorySelection.general.selected}/{categorySelection.general.total} selected
              </p>
            </button>
            
            {/* Skipped Card - Shows details on click */}
            <button
              type="button"
              onClick={() => setShowSkippedDetails(!showSkippedDetails)}
              className={`rounded-lg p-3 border-2 transition-all text-left cursor-pointer ${
                showSkippedDetails
                  ? 'bg-yellow-100 border-yellow-500 ring-2 ring-yellow-200 shadow-sm'
                  : 'bg-yellow-50 border-yellow-200'
              }`}
            >
              <div className="flex items-center gap-2 text-yellow-700">
                <ExclamationCircleIcon className="w-5 h-5" />
                <span className="font-medium">Skipped</span>
                {showSkippedDetails && (
                  <EyeIcon className="w-4 h-4 ml-auto text-yellow-600" />
                )}
              </div>
              <p className="text-2xl font-bold text-yellow-800 mt-1">{stats.skippedComments}</p>
              <p className="text-xs text-yellow-600 mt-0.5">
                {showSkippedDetails ? 'Click to hide' : 'Click to view reasons'}
              </p>
            </button>
            
            {/* Images Card - Info only */}
            <div className="bg-cyan-50 rounded-lg p-3 border border-cyan-200">
              <div className="flex items-center gap-2 text-cyan-700">
                <PhotoIcon className="w-5 h-5" />
                <span className="font-medium">Images</span>
              </div>
              <p className="text-2xl font-bold text-cyan-800 mt-1">{attachmentStats.totalAttachments}</p>
              <p className="text-xs text-cyan-600 mt-0.5">{attachmentStats.postsWithAttachments} posts with images</p>
            </div>
          </div>
          
          {/* Skipped Posts Details Panel */}
          {showSkippedDetails && stats.skippedComments > 0 && (
            <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
              <h4 className="text-sm font-semibold text-yellow-800 mb-3 flex items-center gap-2">
                <ExclamationCircleIcon className="w-4 h-4" />
                Skipped Posts ({stats.skippedComments})
              </h4>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {reviewablePosts
                  .filter(p => p.isComment || p.postType === 'COMMENT')
                  .map(post => (
                    <div key={post.postId} className="bg-white p-3 rounded-lg border border-yellow-100 shadow-sm">
                      <div className="flex items-start gap-2 mb-1">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                          {(post as any).skipReason || 'Comment/Reply'}
                        </span>
                        <span className="text-gray-400 text-xs ml-auto">
                          {formatAEST(post.postedAt, { includeDay: true, shortDay: true })}
                        </span>
                      </div>
                      <p className="text-gray-600 text-sm line-clamp-2 mt-1">
                        {post.content.substring(0, 200)}
                        {post.content.length > 200 ? '...' : ''}
                      </p>
                      {post.author?.name && (
                        <p className="text-xs text-gray-400 mt-1">By: {post.author.name}</p>
                      )}
                    </div>
                  ))
                }
                {reviewablePosts.filter(p => p.isComment || p.postType === 'COMMENT').length === 0 && (
                  <p className="text-sm text-yellow-700 italic">
                    No skipped posts with details available. Posts may have been filtered during parsing.
                  </p>
                )}
              </div>
            </div>
          )}
          
          {/* Selection Summary */}
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-600">
              <strong>{selectedPosts.size}</strong> selected
              {attachmentStats.selectedAttachments > 0 && (
                <span className="text-cyan-600 ml-1">
                  ({attachmentStats.selectedAttachments} images)
                </span>
              )}
            </span>
            
            <div className="flex-1 border-t border-gray-200" />
            
            <button
              onClick={selectTournamentResults}
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              Select Results Only
            </button>
            <button
              onClick={selectAll}
              className="text-sm text-indigo-600 hover:text-indigo-800"
            >
              Select All
            </button>
            <button
              onClick={deselectAll}
              className="text-sm text-gray-600 hover:text-gray-800"
            >
              Clear
            </button>
            
            <div className="border-l border-gray-300 h-6 mx-2" />
            
            <button
              onClick={handleClearAll}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200"
            >
              <TrashIcon className="w-4 h-4 mr-1" />
              Clear All
            </button>
          </div>
          
          {/* Filters Panel */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {/* Type Filters */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Post Types</label>
                  <div className="space-y-1">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={filterOptions.showResults}
                        onChange={(e) => setFilterOptions({ showResults: e.target.checked })}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700">🏆 Results</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={filterOptions.showPromotional}
                        onChange={(e) => setFilterOptions({ showPromotional: e.target.checked })}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700">📣 Promotional</span>
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={filterOptions.showGeneral}
                        onChange={(e) => setFilterOptions({ showGeneral: e.target.checked })}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="text-sm text-gray-700">📝 General</span>
                    </label>
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700">Min Confidence</label>
                  <select
                    value={filterOptions.minConfidence}
                    onChange={(e) => setFilterOptions({ minConfidence: parseInt(e.target.value) })}
                    className="mt-1 block w-full rounded-md border-gray-300 text-sm"
                  >
                    <option value={0}>Any</option>
                    <option value={25}>25%+</option>
                    <option value={50}>50%+</option>
                    <option value={75}>75%+</option>
                  </select>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700">Has Venue</label>
                  <select
                    value={filterOptions.hasVenueMatch === null ? '' : filterOptions.hasVenueMatch.toString()}
                    onChange={(e) => setFilterOptions({ 
                      hasVenueMatch: e.target.value === '' ? null : e.target.value === 'true' 
                    })}
                    className="mt-1 block w-full rounded-md border-gray-300 text-sm"
                  >
                    <option value="">Any</option>
                    <option value="true">Has venue</option>
                    <option value="false">No venue</option>
                  </select>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700">Sort By</label>
                  <select
                    value={sortOptions.field}
                    onChange={(e) => setSortOptions({ ...sortOptions, field: e.target.value as typeof sortOptions.field })}
                    className="mt-1 block w-full rounded-md border-gray-300 text-sm"
                  >
                    <option value="postType">Post Type</option>
                    <option value="confidence">Confidence</option>
                    <option value="postedAt">Date</option>
                    <option value="engagement">Engagement</option>
                    <option value="prizeAmount">Prize Amount</option>
                  </select>
                </div>
                
                <div>
                  <label className="text-sm font-medium text-gray-700">Search</label>
                  <input
                    type="text"
                    value={filterOptions.searchText}
                    onChange={(e) => setFilterOptions({ searchText: e.target.value })}
                    placeholder="Search content..."
                    className="mt-1 block w-full rounded-md border-gray-300 text-sm"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}
      
      {/* ================================================================= */}
      {/* POSTS LIST */}
      {/* ================================================================= */}
      {filteredPosts.length > 0 && (
        <div className="space-y-3">
          {filteredPosts.map((post) => (
            <PostPreviewCard
              key={post.postId}
              post={post}
              isSelected={selectedPosts.has(post.postId)}
              onToggleSelect={() => togglePostSelection(post.postId)}
              onToggleExpand={() => handleToggleExpand(post.postId)}
              onPreview={() => handlePreviewPost(post)}
              showPreviewButton={true}  // Always show - preview works without saving
            />
          ))}
        </div>
      )}
      
      {/* Empty State */}
      {stats && stats.totalPosts > 0 && filteredPosts.length === 0 && (
        <div className="bg-gray-50 rounded-lg border border-gray-200 p-8 text-center">
          <p className="text-gray-500">No posts match the current filters</p>
          <button
            onClick={() => setFilterOptions({ 
              showResults: true, 
              showPromotional: true, 
              showGeneral: true,
              minConfidence: 0,
              hasVenueMatch: null,
              searchText: '',
            })}
            className="mt-2 text-sm text-indigo-600 hover:text-indigo-800"
          >
            Reset filters
          </button>
        </div>
      )}
      
      {/* ================================================================= */}
      {/* UPLOAD BUTTON (Sticky Footer) */}
      {/* ================================================================= */}
      {selectedPosts.size > 0 && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 -mx-6 -mb-6 flex items-center justify-between shadow-lg">
          <div className="text-sm text-gray-600">
            {isProcessing ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {/* Use lambdaProgress for processing phase, uploadProgress for upload phase */}
                {lambdaProgress 
                  ? lambdaProgress.stage 
                  : uploadProgress?.stage || `Uploading ${uploadProgress?.current || 0}/${uploadProgress?.total || 0}...`
                }
                {isCancelling && <span className="text-amber-600">(Cancelling...)</span>}
              </span>
            ) : (
              <>
                {selectedPosts.size} post{selectedPosts.size !== 1 ? 's' : ''} selected
                {attachmentStats.selectedAttachments > 0 && (
                  <span className="text-cyan-600 ml-1">
                    ({attachmentStats.selectedAttachments} image{attachmentStats.selectedAttachments !== 1 ? 's' : ''})
                  </span>
                )}
                {!selectedAccountId && (
                  <span className="text-amber-600 ml-2">
                    — Select a Social Account to upload
                  </span>
                )}
              </>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {/* Cancel button - shown during processing */}
            {isProcessing && (
              <button
                onClick={handleCancelUpload}
                disabled={isCancelling}
                className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isCancelling ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Stopping...
                  </>
                ) : (
                  <>
                    <ExclamationCircleIcon className="w-4 h-4 mr-2" />
                    Stop Upload
                  </>
                )}
              </button>
            )}
            
            {/* Upload button */}
            <button
              onClick={handleUpload}
              disabled={isProcessing || !selectedAccountId}
              className={`inline-flex items-center px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                processingFlow === 'upload_process'
                  ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
                  : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {lambdaProgress 
                    ? `${lambdaProgress.current}/${lambdaProgress.total}`
                    : `${uploadProgress?.current || 0}/${uploadProgress?.total || 0}`
                  }
                </>
              ) : (
                <>
                  {processingFlow === 'upload_process' ? (
                    <>
                      <PlayIcon className="w-4 h-4 mr-2" />
                      Upload + Process
                    </>
                  ) : (
                    <>
                      <ArrowUpTrayIcon className="w-4 h-4 mr-2" />
                      Upload Only
                    </>
                  )}
                </>
              )}
            </button>
          </div>
        </div>
      )}
      
      {/* ================================================================= */}
      {/* PROCESSING MODAL */}
      {/* ================================================================= */}
      {processingModalOpen && currentModalResult && (
        <SocialPostProcessingModal
          isOpen={processingModalOpen}
          onClose={handleCloseModal}
          result={currentModalResult}
          postContent={currentModalPost?.content}
          postDate={currentModalPost?.postedAt}
          postUrl={currentModalPost?.url}
          onLinkToGame={handleLinkToGame}
          batchContext={batchProcessingContext} 
          onReprocess={() => {
            // For preview mode (no socialPostId), re-call previewContent
            if (!currentModalResult?.socialPostId && currentModalPost) {
              handlePreviewPost(currentModalPost);
            } else if (currentModalResult?.socialPostId) {
              processor.processSinglePost({
                socialPostId: currentModalResult.socialPostId,
                forceReprocess: true,
              });
            }
          }}
        />
      )}
    </div>
  );
};

// Add webkitdirectory attribute support
declare module 'react' {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string;
    directory?: string;
  }
}

export default ManualPostUploadTab;