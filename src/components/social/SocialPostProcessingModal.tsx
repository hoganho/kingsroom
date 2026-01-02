// src/components/social/SocialPostProcessingModal.tsx
// Modal for reviewing social post processing results
// Shows extraction data, match candidates, placements, and allows linking
//
// UPDATED: Now imports MatchesTab from separate file with detailed signal breakdown
// UPDATED: Added batchContext prop to show progress during batch processing

import React, { useState, useMemo, useCallback } from 'react';
import { 
  XMarkIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  LinkIcon,
  TrophyIcon,
  DocumentTextIcon,
  ChartBarIcon,
  CalendarIcon,
  CurrencyDollarIcon,
  UserGroupIcon,
  MapPinIcon,
  EyeIcon,
  ArrowTopRightOnSquareIcon,
  ClipboardDocumentIcon,
} from '@heroicons/react/24/outline';
import { Loader2 } from 'lucide-react';

// Import the new MatchesTab with detailed signal breakdown
import { MatchesTab } from './MatchesTab';

import type {
  ProcessSocialPostResult,
  SocialPostGameData,
  SocialPostGameLink,
} from '../../API';

// ===================================================================
// TYPES
// ===================================================================

interface BatchProcessingContext {
  current: number;
  total: number;
}

interface SocialPostProcessingModalProps {
  isOpen: boolean;
  onClose: () => void;
  result: ProcessSocialPostResult;
  postContent?: string;
  postDate?: string;
  postUrl?: string;
  postImages?: string[];
  
  // Callbacks
  onLinkToGame?: (gameId: string, isPrimary?: boolean) => Promise<SocialPostGameLink>;
  onConfirmLinks?: () => void;
  onReprocess?: () => void;
  
  // Options
  showActions?: boolean;
  autoMode?: boolean;
  
  // NEW: Batch processing context
  batchContext?: BatchProcessingContext | null;
}

interface ModalTab {
  id: string;
  label: string;
  icon: React.ReactNode;
  showBadge?: boolean;
  badgeCount?: number;
  badgeColor?: string;
}

// ===================================================================
// SUB-COMPONENTS
// ===================================================================

// Content Type Badge
const ContentTypeBadge: React.FC<{ contentType: string; confidence?: number }> = ({ 
  contentType, 
  confidence 
}) => {
  const getTypeInfo = () => {
    switch (contentType) {
      case 'RESULT':
        return { label: 'Result', icon: '🏆', color: 'bg-green-100 text-green-800 border-green-200' };
      case 'PROMOTIONAL':
        return { label: 'Promotional', icon: '📣', color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'GENERAL':
        return { label: 'General', icon: '📝', color: 'bg-gray-100 text-gray-800 border-gray-200' };
      default:
        return { label: contentType, icon: '❓', color: 'bg-gray-100 text-gray-800 border-gray-200' };
    }
  };
  
  const { label, icon, color } = getTypeInfo();
  
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full border text-sm font-medium ${color}`}>
      <span>{icon}</span>
      <span>{label}</span>
      {confidence && <span className="text-xs opacity-70">({Math.round(confidence)}%)</span>}
    </span>
  );
};

// Field Display Row
const FieldRow: React.FC<{ 
  label: string; 
  value: React.ReactNode; 
  icon?: React.ReactNode;
  highlight?: boolean;
}> = ({ label, value, icon, highlight }) => {
  if (value === null || value === undefined || value === '') return null;
  
  return (
    <div className={`flex items-start gap-3 py-2 ${highlight ? 'bg-blue-50 -mx-2 px-2 rounded' : ''}`}>
      {icon && <span className="text-gray-400 mt-0.5">{icon}</span>}
      <div className="flex-1 min-w-0">
        <dt className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</dt>
        <dd className="text-sm text-gray-900 mt-0.5">{value}</dd>
      </div>
    </div>
  );
};

// ===================================================================
// TAB COMPONENTS
// ===================================================================

// Post Preview Tab - Shows the original post as it would appear
const PostPreviewTab: React.FC<{
  content?: string;
  date?: string;
  url?: string;
  images?: string[];
  contentType?: string;
}> = ({ content, date, url, images, contentType }) => {
  const [copied, setCopied] = React.useState(false);
  
  // Extract platform from URL
  const getPlatform = () => {
    if (!url) return 'Unknown';
    if (url.includes('facebook.com') || url.includes('fb.com')) return 'Facebook';
    if (url.includes('instagram.com')) return 'Instagram';
    if (url.includes('twitter.com') || url.includes('x.com')) return 'X (Twitter)';
    return 'Social Media';
  };
  
  const platform = getPlatform();
  
  const handleCopy = () => {
    if (content) {
      navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };
  
  return (
    <div className="p-4 space-y-4">
      {/* Post Card Preview */}
      <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden max-w-xl mx-auto">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
            <span className="text-lg">
              {platform === 'Facebook' ? '📘' : platform === 'Instagram' ? '📷' : '📱'}
            </span>
          </div>
          <div className="flex-1">
            <div className="font-semibold text-gray-900 text-sm">Kings Room</div>
            <div className="text-xs text-gray-500 flex items-center gap-1">
              {date && (
                <>
                  <CalendarIcon className="w-3 h-3" />
                  {new Date(date).toLocaleDateString('en-AU', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                  <span className="mx-1">•</span>
                </>
              )}
              <span>{platform}</span>
            </div>
          </div>
          {contentType && (
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
              contentType === 'RESULT' 
                ? 'bg-green-100 text-green-700' 
                : contentType === 'PROMOTIONAL'
                ? 'bg-blue-100 text-blue-700'
                : 'bg-gray-100 text-gray-700'
            }`}>
              {contentType === 'RESULT' ? '🏆 Result' : 
               contentType === 'PROMOTIONAL' ? '📣 Promo' : 
               contentType}
            </span>
          )}
        </div>
        
        {/* Content */}
        <div className="px-4 py-3">
          {content ? (
            <div className="text-gray-800 text-sm whitespace-pre-wrap leading-relaxed max-h-80 overflow-y-auto">
              {content}
            </div>
          ) : (
            <div className="text-gray-400 italic text-sm">No content available</div>
          )}
        </div>
        
        {/* Images (if any) */}
        {images && images.length > 0 && (
          <div className={`grid gap-1 ${images.length === 1 ? '' : 'grid-cols-2'}`}>
            {images.slice(0, 4).map((img, i) => (
              <div key={i} className="aspect-video bg-gray-100 overflow-hidden">
                <img 
                  src={img} 
                  alt={`Post image ${i + 1}`}
                  className="w-full h-full object-cover"
                />
              </div>
            ))}
          </div>
        )}
        
        {/* Footer Actions */}
        <div className="px-4 py-2 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-500">
          <button 
            onClick={handleCopy}
            className="flex items-center gap-1 hover:text-gray-700 transition-colors"
          >
            <ClipboardDocumentIcon className="w-4 h-4" />
            {copied ? 'Copied!' : 'Copy Text'}
          </button>
          {url && (
            <a 
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-gray-700 transition-colors"
            >
              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
              View Original
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

// Extraction Tab - Shows extracted data from the post
const ExtractionTab: React.FC<{
  extraction: SocialPostGameData | null;
  postContent?: string;
}> = ({ extraction, postContent: _postContent }) => {
  if (!extraction) {
    return (
      <div className="p-8 text-center text-gray-500">
        <DocumentTextIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <p>No extraction data available</p>
      </div>
    );
  }
  
  return (
    <div className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left Column - Core Data */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide border-b pb-2">
            Extracted Information
          </h4>
          
          <dl className="space-y-1">
            <FieldRow 
              label="Content Type" 
              value={extraction.contentType && (
                <ContentTypeBadge 
                  contentType={extraction.contentType} 
                  confidence={extraction.contentTypeConfidence || 0}
                />
              )}
              icon={<DocumentTextIcon className="w-4 h-4" />}
            />
            
            <FieldRow 
              label="Tournament Name" 
              value={extraction.extractedName}
              icon={<TrophyIcon className="w-4 h-4" />}
              highlight={!!extraction.extractedName}
            />
            
            <FieldRow 
              label="Buy-In" 
              value={extraction.extractedBuyIn && `$${extraction.extractedBuyIn}`}
              icon={<CurrencyDollarIcon className="w-4 h-4" />}
            />
            
            <FieldRow 
              label="Prize Pool" 
              value={extraction.extractedPrizePool && `$${extraction.extractedPrizePool.toLocaleString()}`}
              icon={<CurrencyDollarIcon className="w-4 h-4" />}
            />
            
            <FieldRow 
              label="Total Entries" 
              value={extraction.extractedTotalEntries}
              icon={<UserGroupIcon className="w-4 h-4" />}
            />
            
            <FieldRow 
              label="Venue" 
              value={extraction.extractedVenueName}
              icon={<MapPinIcon className="w-4 h-4" />}
            />
          </dl>
        </div>
        
        {/* Right Column - Winner & Placements */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide border-b pb-2">
            Winner Information
          </h4>
          
          <dl className="space-y-1">
            <FieldRow 
              label="Winner Name" 
              value={extraction.extractedWinnerName}
              icon={<TrophyIcon className="w-4 h-4" />}
              highlight={!!extraction.extractedWinnerName}
            />
            
            <FieldRow 
              label="Winner Prize" 
              value={extraction.extractedWinnerPrize && `$${extraction.extractedWinnerPrize.toLocaleString()}`}
              icon={<CurrencyDollarIcon className="w-4 h-4" />}
            />
            
            <FieldRow 
              label="Placements Found" 
              value={extraction.placementCount}
              icon={<ChartBarIcon className="w-4 h-4" />}
            />
          </dl>
          
          {/* Extraction metadata */}
          <div className="mt-6 p-3 bg-gray-50 rounded-lg text-xs text-gray-500">
            <p>Extracted at: {extraction.extractedAt && new Date(extraction.extractedAt).toLocaleString()}</p>
            {extraction.id && <p className="truncate">ID: {extraction.id}</p>}
          </div>
        </div>
      </div>
    </div>
  );
};

// Placements Tab - Shows extracted placement data
const PlacementsTab: React.FC<{
  placementCount: number;
  winnerName?: string;
  winnerPrize?: number;
}> = ({ placementCount, winnerName, winnerPrize }) => {
  if (placementCount === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <TrophyIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <p>No placements extracted from this post</p>
        <p className="text-xs mt-2">This may not be a results post</p>
      </div>
    );
  }
  
  return (
    <div className="p-4">
      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-yellow-100 rounded-full flex items-center justify-center">
            <TrophyIcon className="w-6 h-6 text-yellow-600" />
          </div>
          <div>
            <h4 className="font-semibold text-gray-900">{placementCount} Placements Found</h4>
            {winnerName && (
              <p className="text-sm text-gray-600">
                Winner: <span className="font-medium">{winnerName}</span>
                {winnerPrize && <span className="text-green-600 ml-2">${winnerPrize.toLocaleString()}</span>}
              </p>
            )}
          </div>
        </div>
      </div>
      
      <p className="text-sm text-gray-500">
        Detailed placement data will be linked when this post is associated with a game.
      </p>
    </div>
  );
};

// Review Tab - Shows processing status and issues
const ReviewTab: React.FC<{
  result: ProcessSocialPostResult;
  selectedGameId: string | null;
}> = ({ result, selectedGameId }) => {
  return (
    <div className="p-4 space-y-4">
      {/* Status Summary */}
      <div className={`p-4 rounded-lg border ${
        result.success 
          ? 'bg-green-50 border-green-200' 
          : 'bg-red-50 border-red-200'
      }`}>
        <div className="flex items-center gap-3">
          {result.success ? (
            <CheckCircleIcon className="w-6 h-6 text-green-600" />
          ) : (
            <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
          )}
          <div>
            <h4 className={`font-semibold ${result.success ? 'text-green-800' : 'text-red-800'}`}>
              {result.success ? 'Processing Successful' : 'Processing Failed'}
            </h4>
            {result.error && (
              <p className="text-sm text-red-700 mt-1">{result.error}</p>
            )}
          </div>
        </div>
      </div>
      
      {/* Warnings */}
      {result.warnings && result.warnings.length > 0 && (
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <h4 className="font-semibold text-yellow-800 mb-2">Warnings</h4>
          <ul className="list-disc list-inside text-sm text-yellow-700 space-y-1">
            {result.warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Processing Details */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h4 className="font-semibold text-gray-900 mb-3">Processing Details</h4>
        <dl className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Post ID</dt>
            <dd className="font-mono text-xs truncate">{result.socialPostId || 'N/A'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Status</dt>
            <dd>{result.processingStatus}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Links Created</dt>
            <dd>{result.linksCreated || 0}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Selected Game</dt>
            <dd className="font-mono text-xs truncate">{selectedGameId || 'None'}</dd>
          </div>
          {result.processingTimeMs && (
            <div>
              <dt className="text-gray-500">Processing Time</dt>
              <dd>{result.processingTimeMs}ms</dd>
            </div>
          )}
        </dl>
      </div>
    </div>
  );
};

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const SocialPostProcessingModal: React.FC<SocialPostProcessingModalProps> = ({
  isOpen,
  onClose,
  result,
  postContent,
  postDate,
  postUrl,
  postImages,
  onLinkToGame,
  onConfirmLinks,
  onReprocess,
  showActions = true,
  autoMode = false,
  batchContext,  // NEW: Batch processing context
}) => {
  const [activeTab, setActiveTab] = useState('post');
  const [selectedGameId, setSelectedGameId] = useState<string | null>(
    result.primaryMatch?.gameId || null
  );
  const [isLinking, setIsLinking] = useState(false);
  
  // Tabs configuration
  const tabs: ModalTab[] = useMemo(() => [
    {
      id: 'post',
      label: 'Post',
      icon: <EyeIcon className="w-4 h-4" />,
    },
    { 
      id: 'extraction', 
      label: 'Extraction', 
      icon: <DocumentTextIcon className="w-4 h-4" />,
    },
    { 
      id: 'matches', 
      label: 'Matches', 
      icon: <LinkIcon className="w-4 h-4" />,
      showBadge: true,
      badgeCount: result.matchCandidates?.length || 0,
      badgeColor: result.primaryMatch?.wouldAutoLink ? 'bg-green-500' : 'bg-gray-400',
    },
    { 
      id: 'placements', 
      label: 'Placements', 
      icon: <TrophyIcon className="w-4 h-4" />,
      showBadge: true,
      badgeCount: result.placementsExtracted || 0,
    },
    { 
      id: 'review', 
      label: 'Review', 
      icon: <ChartBarIcon className="w-4 h-4" />,
      showBadge: !result.success,
      badgeColor: 'bg-red-500',
    },
  ], [result]);
  
  // Handle link action
  const handleLink = useCallback(async () => {
    if (!selectedGameId || !onLinkToGame) return;
    
    setIsLinking(true);
    try {
      await onLinkToGame(selectedGameId, true);
      // Could show success toast here
    } catch (err) {
      console.error('Failed to link:', err);
    } finally {
      setIsLinking(false);
    }
  }, [selectedGameId, onLinkToGame]);
  
  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'post':
        return (
          <PostPreviewTab 
            content={postContent}
            date={postDate}
            url={postUrl}
            images={postImages}
            contentType={result.extractedGameData?.contentType}
          />
        );
      case 'extraction':
        return <ExtractionTab extraction={result.extractedGameData || null} postContent={postContent} />;
      case 'matches':
        // Using the new imported MatchesTab with detailed signal breakdown
        return (
          <MatchesTab 
            candidates={result.matchCandidates || []}
            primaryMatch={result.primaryMatch || null}
            selectedGameId={selectedGameId}
            onSelectGame={setSelectedGameId}
            isLinking={isLinking}
          />
        );
      case 'placements':
        return (
          <PlacementsTab 
            placementCount={result.placementsExtracted || 0}
            winnerName={result.extractedGameData?.extractedWinnerName || undefined}
            winnerPrize={result.extractedGameData?.extractedWinnerPrize || undefined}
          />
        );
      case 'review':
        return <ReviewTab result={result} selectedGameId={selectedGameId} />;
      default:
        return null;
    }
  };
  
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-4 py-3 border-b flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              {autoMode ? '⚡' : '🔍'} Social Post Processing Results
              {/* NEW: Batch progress indicator */}
              {batchContext && (
                <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">
                  {batchContext.current} / {batchContext.total}
                </span>
              )}
            </h3>
            <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
              {result.extractedGameData?.contentType && (
                <ContentTypeBadge 
                  contentType={result.extractedGameData.contentType} 
                  confidence={result.extractedGameData.contentTypeConfidence || 0}
                />
              )}
              {postDate && <span>• {new Date(postDate).toLocaleDateString()}</span>}
              <span className={result.success ? 'text-green-600' : 'text-red-600'}>
                • {result.success ? '✓ Processed' : '✗ Failed'}
              </span>
            </div>
          </div>
          
          <button 
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <XMarkIcon className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        
        {/* NEW: Batch progress banner when in batch mode */}
        {batchContext && (
          <div className="px-4 py-2 bg-blue-50 border-b border-blue-100 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>
                Processing post <span className="font-semibold">{batchContext.current}</span> of{' '}
                <span className="font-semibold">{batchContext.total}</span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Progress bar */}
              <div className="w-32 h-2 bg-blue-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-600 transition-all duration-300"
                  style={{ width: `${(batchContext.current / batchContext.total) * 100}%` }}
                />
              </div>
              <span className="text-xs text-blue-600 font-medium">
                {Math.round((batchContext.current / batchContext.total) * 100)}%
              </span>
            </div>
          </div>
        )}
        
        {/* Tabs */}
        <div className="border-b flex">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {tab.showBadge && tab.badgeCount !== undefined && tab.badgeCount > 0 && (
                <span className={`px-1.5 py-0.5 text-xs text-white rounded-full ${tab.badgeColor || 'bg-gray-400'}`}>
                  {tab.badgeCount}
                </span>
              )}
            </button>
          ))}
        </div>
        
        {/* Content */}
        <div className="flex-1 overflow-auto">
          {renderTabContent()}
        </div>
        
        {/* Footer */}
        {showActions && (
          <div className="px-4 py-3 border-t flex items-center justify-between">
            <div className="text-sm text-gray-500">
              {result.processingTimeMs && `Processed in ${result.processingTimeMs}ms`}
              {/* Show batch context in footer too */}
              {batchContext && (
                <span className="ml-2 text-blue-600">
                  • Post {batchContext.current}/{batchContext.total}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-2">
              {onReprocess && (
                <button
                  type="button"
                  onClick={onReprocess}
                  className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  Reprocess
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
              >
                {batchContext ? 'Skip' : (result.linksCreated ? 'Close' : 'Cancel')}
              </button>
              
              {selectedGameId && onLinkToGame && !result.linksCreated && (
                <button
                  type="button"
                  onClick={handleLink}
                  disabled={isLinking}
                  className="px-4 py-2 text-sm text-white bg-blue-600 rounded font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isLinking ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Linking...
                    </>
                  ) : (
                    <>
                      <LinkIcon className="w-4 h-4" />
                      Link to Selected Game
                    </>
                  )}
                </button>
              )}
              
              {onConfirmLinks && result.linksCreated && result.linksCreated > 0 && (
                <button
                  type="button"
                  onClick={onConfirmLinks}
                  className="px-4 py-2 text-sm text-white bg-green-600 rounded font-medium hover:bg-green-700"
                >
                  <CheckCircleIcon className="w-4 h-4 inline mr-1" />
                  Confirm Links
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SocialPostProcessingModal;