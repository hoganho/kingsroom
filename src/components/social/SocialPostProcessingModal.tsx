// src/components/social/SocialPostProcessingModal.tsx
// Modal for reviewing social post processing results
// Shows extraction data, match candidates, placements, and allows linking
//
// UPDATED: Now imports MatchesTab from separate file with detailed signal breakdown

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

// Confidence Badge
const ConfidenceBadge: React.FC<{ confidence: number; size?: 'sm' | 'md' }> = ({ 
  confidence, 
  size = 'md' 
}) => {
  const getColor = () => {
    if (confidence >= 80) return 'bg-green-100 text-green-800 border-green-200';
    if (confidence >= 60) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    if (confidence >= 40) return 'bg-orange-100 text-orange-800 border-orange-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };
  
  const sizeClasses = size === 'sm' ? 'text-xs px-1.5 py-0.5' : 'text-sm px-2 py-1';
  
  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${getColor()} ${sizeClasses}`}>
      {Math.round(confidence)}%
    </span>
  );
};

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
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              </div>
            ))}
          </div>
        )}
        
        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 flex items-center justify-between text-xs text-gray-500">
          <span>
            {content?.length || 0} characters
          </span>
          {url && (
            <span className="truncate max-w-xs" title={url}>
              {url.replace(/^https?:\/\/(www\.)?/, '').substring(0, 40)}...
            </span>
          )}
        </div>
      </div>
      
      {/* Actions */}
      <div className="flex items-center justify-center gap-3">
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <ArrowTopRightOnSquareIcon className="w-4 h-4" />
            View on {platform}
          </a>
        )}
        {content && (
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-200 transition-colors"
          >
            <ClipboardDocumentIcon className="w-4 h-4" />
            {copied ? 'Copied!' : 'Copy Text'}
          </button>
        )}
      </div>
      
      {/* Raw Content (collapsible) */}
      <details className="mt-4 bg-gray-50 rounded-lg">
        <summary className="px-4 py-2 text-sm text-gray-600 cursor-pointer hover:bg-gray-100 rounded-lg">
          View raw content
        </summary>
        <pre className="px-4 py-3 text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap font-mono border-t border-gray-200 max-h-60 overflow-y-auto">
          {content || 'No content'}
        </pre>
      </details>
    </div>
  );
};

// Extraction Tab
const ExtractionTab: React.FC<{ 
  extraction: SocialPostGameData | null;
  postContent?: string;
}> = ({ extraction, postContent: _postContent }) => {
  if (!extraction) {
    return (
      <div className="p-8 text-center text-gray-500">
        <DocumentTextIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>No extraction data available</p>
      </div>
    );
  }
  
  return (
    <div className="p-4 space-y-6">
      {/* Classification */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-gray-700 mb-3">📊 Classification</h4>
        <div className="flex items-center gap-3 flex-wrap">
          <ContentTypeBadge 
            contentType={extraction.contentType || 'UNKNOWN'} 
            confidence={extraction.contentTypeConfidence || 0}
          />
          {extraction.resultScore !== undefined && extraction.resultScore !== null && (
            <span className="text-xs text-gray-500">
              Result score: {extraction.resultScore}
            </span>
          )}
          {extraction.promoScore !== undefined && extraction.promoScore !== null && (
            <span className="text-xs text-gray-500">
              Promo score: {extraction.promoScore}
            </span>
          )}
        </div>
      </div>
      
      {/* Tournament Identity */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">🎯 Tournament Identity</h4>
        <dl className="divide-y divide-gray-100">
          <FieldRow 
            label="Tournament URL" 
            value={extraction.extractedTournamentUrl && (
              <a 
                href={extraction.extractedTournamentUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline break-all"
              >
                {extraction.extractedTournamentUrl}
              </a>
            )}
            highlight={!!extraction.extractedTournamentId}
          />
          <FieldRow 
            label="Tournament ID" 
            value={extraction.extractedTournamentId && (
              <span className="font-mono bg-green-100 text-green-800 px-2 py-0.5 rounded">
                {extraction.extractedTournamentId}
              </span>
            )}
            highlight={!!extraction.extractedTournamentId}
          />
          <FieldRow label="Extracted Name" value={extraction.extractedName} />
        </dl>
      </div>
      
      {/* Financials */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">💰 Financials</h4>
        <dl className="divide-y divide-gray-100">
          <FieldRow 
            label="Buy-in" 
            value={extraction.extractedBuyIn && `$${extraction.extractedBuyIn.toLocaleString()}`}
            icon={<CurrencyDollarIcon className="w-4 h-4" />}
          />
          <FieldRow 
            label="Guarantee" 
            value={extraction.extractedGuarantee && `$${extraction.extractedGuarantee.toLocaleString()}`}
          />
          <FieldRow 
            label="Prize Pool" 
            value={extraction.extractedPrizePool && `$${extraction.extractedPrizePool.toLocaleString()}`}
          />
          <FieldRow 
            label="First Place" 
            value={extraction.extractedFirstPlacePrize && `$${extraction.extractedFirstPlacePrize.toLocaleString()}`}
          />
          <FieldRow 
            label="Total Prizes Paid" 
            value={extraction.extractedTotalPrizesPaid && `$${extraction.extractedTotalPrizesPaid.toLocaleString()}`}
          />
        </dl>
      </div>
      
      {/* Date & Time */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">📅 Date & Time</h4>
        <dl className="divide-y divide-gray-100">
          <FieldRow 
            label="Date" 
            value={extraction.extractedDate && new Date(extraction.extractedDate).toLocaleDateString()}
            icon={<CalendarIcon className="w-4 h-4" />}
          />
          <FieldRow label="Day of Week" value={extraction.extractedDayOfWeek} />
          <FieldRow label="Start Time" value={extraction.extractedStartTime} />
          <FieldRow 
            label="Date Source" 
            value={extraction.dateSource && (
              <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                {extraction.dateSource}
              </span>
            )}
          />
        </dl>
      </div>
      
      {/* Venue */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">📍 Venue</h4>
        <dl className="divide-y divide-gray-100">
          <FieldRow 
            label="Extracted Venue" 
            value={extraction.extractedVenueName}
            icon={<MapPinIcon className="w-4 h-4" />}
          />
          {extraction.suggestedVenueId && (
            <FieldRow 
              label="Matched Venue" 
              value={
                <span className="flex items-center gap-2">
                  <span className="text-green-600">✓ Matched</span>
                  <ConfidenceBadge confidence={extraction.venueMatchConfidence || 0} size="sm" />
                </span>
              }
            />
          )}
        </dl>
      </div>
      
      {/* Game Type */}
      <div>
        <h4 className="text-sm font-semibold text-gray-700 mb-2">🎲 Game Type</h4>
        <dl className="divide-y divide-gray-100">
          <FieldRow label="Game Type" value={extraction.extractedGameType} />
          <FieldRow label="Tournament Type" value={extraction.extractedTournamentType} />
          <FieldRow label="Variant" value={extraction.extractedGameVariant} />
          <FieldRow 
            label="Total Entries" 
            value={extraction.extractedTotalEntries}
            icon={<UserGroupIcon className="w-4 h-4" />}
          />
        </dl>
      </div>
      
      {/* Series Info */}
      {extraction.isSeriesEvent && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">📚 Series</h4>
          <dl className="divide-y divide-gray-100">
            <FieldRow label="Series Name" value={extraction.extractedSeriesName} />
            <FieldRow label="Event #" value={extraction.extractedEventNumber} />
            <FieldRow label="Day #" value={extraction.extractedDayNumber} />
            <FieldRow label="Flight" value={extraction.extractedFlightLetter} />
          </dl>
        </div>
      )}
      
      {/* Winner (for results) */}
      {extraction.extractedWinnerName && (
        <div className="bg-yellow-50 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">🏆 Winner</h4>
          <div className="flex items-center gap-3">
            <TrophyIcon className="w-8 h-8 text-yellow-500" />
            <div>
              <div className="font-medium text-gray-900">{extraction.extractedWinnerName}</div>
              {extraction.extractedWinnerPrize && (
                <div className="text-sm text-gray-600">${extraction.extractedWinnerPrize.toLocaleString()}</div>
              )}
            </div>
          </div>
          {extraction.placementCount && extraction.placementCount > 1 && (
            <div className="mt-2 text-xs text-gray-500">
              +{extraction.placementCount - 1} more placements extracted
            </div>
          )}
        </div>
      )}
      
      {/* Processing Meta */}
      <div className="text-xs text-gray-400 pt-4 border-t">
        Extracted at {extraction.extractedAt && new Date(extraction.extractedAt).toLocaleString()} 
        {extraction.extractionDurationMs && ` • ${extraction.extractionDurationMs}ms`}
        {extraction.extractionVersion && ` • v${extraction.extractionVersion}`}
      </div>
    </div>
  );
};

// NOTE: MatchesTab is now imported from './MatchesTab'
// It includes detailed signal breakdown for each match candidate

// Placements Tab
const PlacementsTab: React.FC<{
  placementCount: number;
  winnerName?: string;
  winnerPrize?: number;
}> = ({ placementCount, winnerName, winnerPrize }) => {
  if (placementCount === 0 && !winnerName) {
    return (
      <div className="p-8 text-center text-gray-500">
        <TrophyIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
        <p>No placements extracted</p>
        <p className="text-sm mt-1">This post may not contain result information</p>
      </div>
    );
  }
  
  return (
    <div className="p-4">
      <div className="bg-yellow-50 rounded-lg p-4 mb-4">
        <div className="flex items-center gap-3">
          <TrophyIcon className="w-10 h-10 text-yellow-500" />
          <div>
            <h4 className="font-medium text-gray-900">
              {placementCount} placement{placementCount !== 1 ? 's' : ''} extracted
            </h4>
            {winnerName && (
              <p className="text-sm text-gray-600">
                Winner: <span className="font-medium">{winnerName}</span>
                {winnerPrize && ` - $${winnerPrize.toLocaleString()}`}
              </p>
            )}
          </div>
        </div>
      </div>
      
      <p className="text-sm text-gray-500">
        Full placement details will be available after processing and linking.
      </p>
    </div>
  );
};

// Review Tab
const ReviewTab: React.FC<{
  result: ProcessSocialPostResult;
  selectedGameId: string | null;
}> = ({ result, selectedGameId }) => {
  const hasWarnings = result.warnings && result.warnings.length > 0;
  const hasError = !!result.error;
  
  return (
    <div className="p-4 space-y-4">
      {/* Status Summary */}
      <div className={`rounded-lg p-4 ${result.success ? 'bg-green-50' : 'bg-red-50'}`}>
        <div className="flex items-start gap-3">
          {result.success ? (
            <CheckCircleIcon className="w-6 h-6 text-green-500 flex-shrink-0" />
          ) : (
            <ExclamationTriangleIcon className="w-6 h-6 text-red-500 flex-shrink-0" />
          )}
          <div>
            <h4 className={`font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
              {result.success ? 'Processing Complete' : 'Processing Failed'}
            </h4>
            <p className="text-sm mt-1 text-gray-600">
              {result.processingStatus}
            </p>
            {hasError && (
              <p className="text-sm mt-2 text-red-600">{result.error}</p>
            )}
          </div>
        </div>
      </div>
      
      {/* Warnings */}
      {hasWarnings && (
        <div className="bg-yellow-50 rounded-lg p-4">
          <h4 className="font-medium text-yellow-800 mb-2 flex items-center gap-2">
            <ExclamationTriangleIcon className="w-5 h-5" />
            Warnings
          </h4>
          <ul className="text-sm text-yellow-700 space-y-1">
            {result.warnings?.map((warning, idx) => (
              <li key={idx}>• {warning}</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Processing Stats */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-900">
            {result.matchCandidates?.length || 0}
          </div>
          <div className="text-sm text-gray-500">Match candidates</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-900">
            {result.placementsExtracted || 0}
          </div>
          <div className="text-sm text-gray-500">Placements extracted</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-900">
            {result.linksCreated || 0}
          </div>
          <div className="text-sm text-gray-500">Links created</div>
        </div>
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="text-2xl font-bold text-gray-900">
            {result.processingTimeMs || 0}ms
          </div>
          <div className="text-sm text-gray-500">Processing time</div>
        </div>
      </div>
      
      {/* Selected Game */}
      {selectedGameId && (
        <div className="bg-blue-50 rounded-lg p-4">
          <h4 className="font-medium text-blue-800 mb-1">Selected for Linking</h4>
          <p className="text-sm text-blue-600 font-mono">{selectedGameId}</p>
        </div>
      )}
      
      {/* Next Steps */}
      <div className="border-t pt-4">
        <h4 className="font-medium text-gray-700 mb-2">Next Steps</h4>
        <ul className="text-sm text-gray-600 space-y-1">
          {result.primaryMatch?.wouldAutoLink && (
            <li className="text-green-600">• ⚡ High confidence match available for auto-linking</li>
          )}
          {selectedGameId && !result.linksCreated && (
            <li>• Click "Link to Selected Game" to create the link</li>
          )}
          {result.linksCreated && result.linksCreated > 0 && (
            <li>• Links have been created automatically based on confidence threshold</li>
          )}
          {!result.matchCandidates || result.matchCandidates.length === 0 && (
            <li>• No matching games found - you may need to create the game first</li>
          )}
        </ul>
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
                {result.linksCreated ? 'Close' : 'Cancel'}
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