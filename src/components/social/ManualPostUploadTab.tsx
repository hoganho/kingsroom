// src/components/social/ManualPostUploadTab.tsx
// FINAL VERSION - All TypeScript errors fixed

import React, { useState, useCallback, useRef } from 'react';
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
} from '@heroicons/react/24/outline';
import { Loader2 } from 'lucide-react';

import { useSocialPostUpload } from '../../hooks/useSocialPostUpload';
import { getConfidenceBadge } from '../../utils/socialPostParser';
import type { ReviewablePost } from '../../types/socialPostUpload';
import type { SocialAccount } from '../../API';

interface ManualPostUploadTabProps {
  accounts: SocialAccount[];
  entities: Array<{ id: string; entityName: string }>;
}

// Post Preview Card Component
const PostPreviewCard: React.FC<{
  post: ReviewablePost;
  isSelected: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
}> = ({ post, isSelected, onToggleSelect, onToggleExpand }) => {
  const confidenceBadge = getConfidenceBadge(post.confidence);
  
  const badgeColors = {
    success: 'bg-green-100 text-green-800 border-green-200',
    warning: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    error: 'bg-red-100 text-red-800 border-red-200',
    default: 'bg-gray-100 text-gray-800 border-gray-200',
  };
  
  const statusColors = {
    pending: 'bg-gray-100 text-gray-600',
    uploading: 'bg-blue-100 text-blue-600',
    success: 'bg-green-100 text-green-600',
    error: 'bg-red-100 text-red-600',
    skipped: 'bg-yellow-100 text-yellow-600',
  };
  
  return (
    <div className={`border rounded-lg p-4 transition-all ${
      isSelected ? 'border-indigo-500 bg-indigo-50/30' : 'border-gray-200 bg-white'
    } ${post._uploadStatus === 'success' ? 'opacity-60' : ''}`}>
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
              {new Date(post.postedAt).toLocaleDateString()}
            </span>
            <span className="text-sm font-medium text-gray-700">
              {post.author.name}
            </span>
            
            {/* Tournament Result Badge */}
            {post.isTournamentResult && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${badgeColors[confidenceBadge.variant]}`}>
                <TrophyIcon className="w-3 h-3 mr-1" />
                {confidenceBadge.label} ({post.confidence}%)
              </span>
            )}
            
            {/* Upload Status */}
            {post._uploadStatus && (
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[post._uploadStatus]}`}>
                {post._uploadStatus === 'success' && <CheckCircleIcon className="w-3 h-3 mr-1" />}
                {post._uploadStatus === 'error' && <ExclamationCircleIcon className="w-3 h-3 mr-1" />}
                {post._uploadStatus}
              </span>
            )}
            
            {/* Tags */}
            {post.venueMatch && (
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
          
          {/* Extracted Data (when expanded or is tournament result) */}
          {(post.isExpanded || post.isTournamentResult) && post.placements.length > 0 && (
            <div className="mt-3 p-2 bg-gray-50 rounded-md">
              <h4 className="text-xs font-semibold text-gray-700 mb-1">Extracted Results:</h4>
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
              
              {/* Additional metadata */}
              <div className="flex flex-wrap gap-3 mt-2 text-xs text-gray-500">
                {post.entriesCount && <span>📊 {post.entriesCount} entries</span>}
                {post.prizePoolAmount && <span>💰 ${post.prizePoolAmount.toLocaleString()} pool</span>}
                {post.buyInAmount && <span>🎟️ ${post.buyInAmount} buy-in</span>}
                {post.gameTypes.length > 0 && <span>🃏 {post.gameTypes.join(', ')}</span>}
              </div>
            </div>
          )}
          
          {/* Bottom Row: Engagement Stats & Images */}
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
          </div>
        </div>
      </div>
    </div>
  );
};

// Main Component
export const ManualPostUploadTab: React.FC<ManualPostUploadTabProps> = ({
  accounts,
  entities,
}) => {
  // Selected account and entity
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [selectedEntityId, setSelectedEntityId] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  
  // Initialize hook
  const {
    reviewablePosts,
    isLoading,
    isUploading,
    error,
    uploadProgress,
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
    entityId: selectedEntityId,
  });
  
  // File input ref
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  
  // Handle file selection
  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      await loadPostsFromFiles(e.target.files);
    }
  }, [loadPostsFromFiles]);
  
  // Handle upload
  const handleUpload = useCallback(async () => {
    if (!selectedAccountId || !selectedEntityId) {
      alert('Please select a Social Account and Entity first');
      return;
    }
    
    const result = await uploadSelectedPosts({
      onlyTournamentResults: filterOptions.showOnlyTournamentResults,
      minConfidence: filterOptions.minConfidence,
      createGameRecords: false,
    });
    
    alert(
      `Upload Complete!\n\n` +
      `✅ Success: ${result.successCount}\n` +
      `⏭️ Skipped: ${result.skippedCount}\n` +
      `❌ Errors: ${result.errorCount}`
    );
  }, [selectedAccountId, selectedEntityId, uploadSelectedPosts, filterOptions]);
  
  // Toggle expand for a post
  const handleToggleExpand = useCallback((postId: string) => {
    updatePostField(postId, 'isExpanded', 
      !reviewablePosts.find(p => p.postId === postId)?.isExpanded
    );
  }, [updatePostField, reviewablePosts]);
  
  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Manual Post Upload
        </h2>
        
        <p className="text-sm text-gray-600 mb-6">
          Upload scraped Facebook posts from the Chrome extension. Posts will be analyzed 
          to detect tournament results automatically.
        </p>
        
        {/* Account & Entity Selection */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Social Account
            </label>
            <select
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="">Select account...</option>
              {accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.accountName} ({account.platform})
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Entity
            </label>
            <select
              value={selectedEntityId}
              onChange={(e) => setSelectedEntityId(e.target.value)}
              className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
            >
              <option value="">Select entity...</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.entityName}
                </option>
              ))}
            </select>
          </div>
        </div>
        
        {/* File Upload Area */}
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept=".json"
            multiple
            className="hidden"
          />
          <input
            type="file"
            ref={folderInputRef}
            onChange={handleFileSelect}
            webkitdirectory=""
            directory=""
            multiple
            className="hidden"
          />
          
          <FolderOpenIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-semibold text-gray-900">
            Upload Scraped Posts
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Select post.json files or a folder containing scraped posts
          </p>
          
          <div className="mt-4 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isLoading}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <DocumentTextIcon className="w-4 h-4 mr-2" />
              Select Files
            </button>
            <button
              type="button"
              onClick={() => folderInputRef.current?.click()}
              disabled={isLoading}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              <FolderOpenIcon className="w-4 h-4 mr-2" />
              Select Folder
            </button>
          </div>
        </div>
      </div>
      
      {/* Loading State */}
      {isLoading && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-indigo-600" />
          <p className="mt-2 text-sm text-gray-600">Analyzing posts...</p>
        </div>
      )}
      
      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <ExclamationCircleIcon className="w-5 h-5 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      
      {/* Stats & Actions Bar */}
      {stats && stats.totalPosts > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            {/* Stats */}
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">Total:</span>
                <span className="text-gray-600">{stats.totalPosts}</span>
              </div>
              <div className="flex items-center gap-2">
                <TrophyIcon className="w-4 h-4 text-yellow-500" />
                <span className="font-medium text-gray-700">Tournament Results:</span>
                <span className="text-green-600 font-semibold">{stats.tournamentResults}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">Other:</span>
                <span className="text-gray-600">{stats.otherPosts}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">Selected:</span>
                <span className="text-indigo-600 font-semibold">{selectedPosts.size}</span>
              </div>
            </div>
            
            {/* Actions */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                <FunnelIcon className="w-4 h-4 mr-1" />
                Filters
              </button>
              
              <div className="border-l border-gray-300 h-6 mx-2" />
              
              <button
                onClick={selectTournamentResults}
                className="text-sm text-indigo-600 hover:text-indigo-800"
              >
                Select Results
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
                onClick={clearPosts}
                className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-red-700 bg-red-100 rounded-md hover:bg-red-200"
              >
                <TrashIcon className="w-4 h-4 mr-1" />
                Clear All
              </button>
            </div>
          </div>
          
          {/* Filters Panel */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={filterOptions.showOnlyTournamentResults}
                    onChange={(e) => setFilterOptions({ showOnlyTournamentResults: e.target.checked })}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">Tournament results only</span>
                </label>
                
                <div>
                  <label className="text-sm text-gray-700">Min Confidence</label>
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
                  <label className="text-sm text-gray-700">Sort By</label>
                  <select
                    value={sortOptions.field}
                    onChange={(e) => setSortOptions({ ...sortOptions, field: e.target.value as 'confidence' | 'postedAt' | 'engagement' | 'prizeAmount' })}
                    className="mt-1 block w-full rounded-md border-gray-300 text-sm"
                  >
                    <option value="confidence">Confidence</option>
                    <option value="postedAt">Date</option>
                    <option value="engagement">Engagement</option>
                    <option value="prizeAmount">Prize Amount</option>
                  </select>
                </div>
                
                <div>
                  <label className="text-sm text-gray-700">Search</label>
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
      
      {/* Posts List */}
      {filteredPosts.length > 0 && (
        <div className="space-y-3">
          {filteredPosts.map((post) => (
            <PostPreviewCard
              key={post.postId}
              post={post}
              isSelected={selectedPosts.has(post.postId)}
              onToggleSelect={() => togglePostSelection(post.postId)}
              onToggleExpand={() => handleToggleExpand(post.postId)}
            />
          ))}
        </div>
      )}
      
      {/* Upload Button */}
      {selectedPosts.size > 0 && (
        <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 -mx-6 -mb-6 flex items-center justify-between">
          <div className="text-sm text-gray-600">
            {selectedPosts.size} post{selectedPosts.size !== 1 ? 's' : ''} selected
          </div>
          
          <button
            onClick={handleUpload}
            disabled={isUploading || !selectedAccountId || !selectedEntityId}
            className="inline-flex items-center px-6 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading {uploadProgress?.current}/{uploadProgress?.total}...
              </>
            ) : (
              <>
                <ArrowUpTrayIcon className="w-4 h-4 mr-2" />
                Upload Selected Posts
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

// Add these attributes to the folder input
declare module 'react' {
  interface InputHTMLAttributes<T> {
    webkitdirectory?: string;
    directory?: string;
  }
}

export default ManualPostUploadTab;