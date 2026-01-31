// src/components/social/SocialPostsTab.tsx
// Browse and manage social posts with filtering by account, year-month, and day
// Used as a tab within SocialAccountManagement page
// Uses shared SocialPostCard component

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { generateClient } from 'aws-amplify/api';
import { format } from 'date-fns';
import {
  ChevronDownIcon,
  CheckCircleIcon,
  MagnifyingGlassIcon,
  ArrowPathIcon,
  XMarkIcon,
  TrashIcon,
  ArrowTopRightOnSquareIcon,
  CalendarDaysIcon,
} from '@heroicons/react/24/outline';
import {
  X,
  RefreshCw,
  Loader2,
  Calendar,
  Gamepad2,
} from 'lucide-react';

// Components
import { SocialPostCard, ExtendedSocialPost } from '@/components/social/SocialPostCard';

// Utils & Types
import { formatCurrency } from '../../utils/generalHelpers';
import { SocialAccount } from '../../hooks/useSocialAccounts';
import { SocialPostStatus } from '../../hooks/useSocialPosts';
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
        linkedGame {
          id
          tournamentId
        }
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
      linkedGame {
        id
        tournamentId
        name
      }
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
// POST DETAIL MODAL (kept here since it's specific to management)
// ============================================

interface PostDetailModalProps {
  postId: string | null;
  onClose: () => void;
}

const PostDetailModal: React.FC<PostDetailModalProps> = ({ postId, onClose }) => {
  const navigate = useNavigate();
  const [post, setPost] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const client = useMemo(() => generateClient(), []);

  useEffect(() => {
    if (!postId) return;

    const fetchPost = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = (await client.graphql({
          query: getSocialPostWithExtractedData,
          variables: { id: postId },
        })) as any;

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

  const handleViewGameDetails = () => {
    if (post?.linkedGameId) {
      navigate(`/games/details/${post.linkedGameId}`);
      onClose();
    }
  };

  // ... Modal JSX (keeping it compact - same structure as before)
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="fixed inset-0 bg-black/50 transition-opacity" onClick={onClose} />

      <div className="flex min-h-full items-center justify-center p-4">
        <div className="relative bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
            <h2 className="text-lg font-semibold text-gray-900">Post Details</h2>
            <div className="flex items-center gap-2">
              {post?.linkedGameId && (
                <button
                  onClick={handleViewGameDetails}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                  <Gamepad2 className="w-4 h-4" />
                  Game Details
                  {post?.linkedGame?.tournamentId ? `: ${post.linkedGame.tournamentId}` : ''}
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
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
                {/* Left Column - Post Preview */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                  {/* ... Post content rendering ... */}
                  <div className="p-4 text-sm text-gray-600">
                    <p className="whitespace-pre-wrap">{post.content}</p>
                    {(post.thumbnailUrl || post.mediaUrls?.[0]) && (
                      <img
                        src={post.thumbnailUrl || post.mediaUrls?.[0]}
                        alt=""
                        className="mt-4 rounded-lg max-w-full"
                      />
                    )}
                  </div>
                </div>

                {/* Right Column - Extracted Data */}
                <div className="space-y-4">
                  {/* Linked Game Card */}
                  {post.linkedGameId && (
                    <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Gamepad2 className="w-5 h-5 text-indigo-600" />
                          <h3 className="font-semibold text-indigo-900">Linked Game</h3>
                        </div>
                        <button
                          onClick={handleViewGameDetails}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
                        >
                          View Details
                          <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                        </button>
                      </div>
                      {post.linkedGame?.tournamentId && (
                        <p className="mt-2 text-sm text-indigo-700">
                          Tournament ID:{' '}
                          <span className="font-mono font-medium">
                            {post.linkedGame.tournamentId}
                          </span>
                        </p>
                      )}
                    </div>
                  )}

                  {/* Extracted Data */}
                  {post.extractedGameData && (
                    <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                      <h3 className="font-semibold text-gray-900 mb-4">Extracted Data</h3>
                      <div className="space-y-2 text-sm">
                        {post.extractedGameData.extractedName && (
                          <div>
                            <span className="text-gray-500">Name:</span>
                            <span className="ml-2 text-gray-900 font-medium">
                              {post.extractedGameData.extractedName}
                            </span>
                          </div>
                        )}
                        {post.extractedGameData.extractedBuyIn && (
                          <div>
                            <span className="text-gray-500">Buy-in:</span>
                            <span className="ml-2 text-gray-900 font-medium">
                              {formatCurrency(post.extractedGameData.extractedBuyIn)}
                            </span>
                          </div>
                        )}
                        {post.extractedGameData.extractedPrizePool && (
                          <div>
                            <span className="text-gray-500">Prize Pool:</span>
                            <span className="ml-2 text-gray-900 font-medium">
                              {formatCurrency(post.extractedGameData.extractedPrizePool)}
                            </span>
                          </div>
                        )}
                        {post.extractedGameData.extractedWinnerName && (
                          <div className="pt-2 border-t border-gray-200">
                            <span className="text-gray-500">Winner:</span>
                            <span className="ml-2 text-gray-900 font-medium">
                              {post.extractedGameData.extractedWinnerName}
                            </span>
                          </div>
                        )}
                      </div>
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
  onChange,
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
      onChange(selectedIds.filter((i) => i !== id));
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
            onClick={() => onChange(allSelected ? [] : options.map((o) => o.id))}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 border-b border-gray-100"
          >
            <CheckCircleIcon
              className={`w-4 h-4 ${allSelected ? 'text-indigo-600' : 'text-gray-300'}`}
            />
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
          {options.map((option) => (
            <button
              key={option.id}
              onClick={() => toggleOption(option.id)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
            >
              <CheckCircleIcon
                className={`w-4 h-4 ${selectedIds.includes(option.id) ? 'text-indigo-600' : 'text-gray-300'}`}
              />
              <span className="truncate">{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

interface CheckboxMultiSelectOption {
  value: string;
  label: string;
}

interface CheckboxMultiSelectDropdownProps {
  label: string;
  options: CheckboxMultiSelectOption[];
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
  placeholder,
  icon,
  maxDisplayItems = 2,
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
      onChange(selectedValues.filter((v) => v !== value));
    } else {
      onChange([...selectedValues, value]);
    }
  };

  const allSelected = selectedValues.length === options.length;
  const noneSelected = selectedValues.length === 0;

  const getDisplayLabel = () => {
    if (noneSelected) return placeholder || label;
    if (allSelected) return `All ${label}`;
    if (selectedValues.length <= maxDisplayItems) {
      return selectedValues
        .map((v) => options.find((o) => o.value === v)?.label || v)
        .join(', ');
    }
    return `${selectedValues.length} ${label.toLowerCase()}`;
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
          !allSelected && !noneSelected
            ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        }`}
      >
        {icon}
        <span className="truncate max-w-[120px]">{getDisplayLabel()}</span>
        <ChevronDownIcon
          className={`w-4 h-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[180px] max-h-72 overflow-y-auto z-20">
          <button
            onClick={() => onChange(allSelected ? [] : options.map((o) => o.value))}
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-gray-600 hover:bg-gray-50 border-b border-gray-100"
          >
            <input
              type="checkbox"
              checked={allSelected}
              readOnly
              className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>

          {options.map((option) => (
            <button
              key={option.value}
              onClick={() => toggleOption(option.value)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={selectedValues.includes(option.value)}
                readOnly
                className="w-3.5 h-3.5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="truncate">{option.label}</span>
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
  const client = useMemo(() => generateClient(), []);

  // State
  const [posts, setPosts] = useState<ExtendedSocialPost[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPostId, setSelectedPostId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);

  // Filters
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [selectedYearMonths, setSelectedYearMonths] = useState<string[]>([
    format(new Date(), 'yyyy-MM'),
  ]);
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [groupByGameDate, setGroupByGameDate] = useState(false);

  // Content type filter
  const contentTypeOptions = [
    { value: 'RESULT', label: 'Result' },
    { value: 'PROMOTIONAL', label: 'Promotional' },
    { value: 'GENERAL', label: 'General' },
    { value: 'COMMENT', label: 'Comment' },
  ];
  const [selectedContentTypes, setSelectedContentTypes] = useState<string[]>(
    contentTypeOptions.map((o) => o.value)
  );

  // Linked status filter
  const linkedStatusOptions = [
    { value: 'linked', label: 'Linked' },
    { value: 'not_linked', label: 'Not Linked' },
  ];
  const [selectedLinkedStatus, setSelectedLinkedStatus] = useState<string[]>(
    linkedStatusOptions.map((o) => o.value)
  );

  // Initialize selected accounts
  useEffect(() => {
    if (accounts.length > 0 && selectedAccountIds.length === 0) {
      setSelectedAccountIds(accounts.map((a) => a.id));
    }
  }, [accounts, selectedAccountIds.length]);

  // Get available year-months
  const yearMonthOptions = useMemo(() => {
    const months: string[] = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(format(d, 'yyyy-MM'));
    }
    return months.map((m) => ({
      value: m,
      label: format(new Date(m + '-01'), 'MMM yyyy'),
    }));
  }, []);

  // Get available days based on selected months
  const dayOptions = useMemo(() => {
    if (selectedYearMonths.length === 0) return [];

    const days = new Set<string>();
    posts.forEach((post) => {
      if (post.postedAt) {
        const postDate = new Date(post.postedAt);
        const postYearMonth = format(postDate, 'yyyy-MM');
        if (selectedYearMonths.includes(postYearMonth)) {
          days.add(format(postDate, 'yyyy-MM-dd'));
        }
      }
    });

    return Array.from(days)
      .sort((a, b) => b.localeCompare(a))
      .map((d) => ({
        value: d,
        label: format(new Date(d), 'EEE, d MMM'),
      }));
  }, [posts, selectedYearMonths]);

  // Set all days selected by default when day options change
  useEffect(() => {
    if (dayOptions.length > 0) {
      setSelectedDays(dayOptions.map((d) => d.value));
    }
  }, [dayOptions.length]);

  // Fetch posts
  const fetchPosts = useCallback(async () => {
    if (selectedAccountIds.length === 0) {
      setPosts([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const allPosts: ExtendedSocialPost[] = [];

      const dateRanges = selectedYearMonths.map((ym) => {
        const [year, month] = ym.split('-').map(Number);
        const start = new Date(year, month - 1, 1);
        const end = new Date(year, month, 0, 23, 59, 59);
        return { start: start.toISOString(), end: end.toISOString() };
      });

      const minDate = dateRanges.reduce(
        (min, r) => (r.start < min ? r.start : min),
        dateRanges[0]?.start || ''
      );
      const maxDate = dateRanges.reduce(
        (max, r) => (r.end > max ? r.end : max),
        dateRanges[0]?.end || ''
      );

      for (const accountId of selectedAccountIds) {
        let nextToken: string | undefined = undefined;

        do {
          const response = (await client.graphql({
            query: socialPostsBySocialAccountIdAndPostedAt,
            variables: {
              socialAccountId: accountId,
              postedAt: { between: [minDate, maxDate] },
              sortDirection: ModelSortDirection.DESC,
              limit: 100,
              nextToken,
            },
          })) as any;

          const items = response.data?.socialPostsBySocialAccountIdAndPostedAt?.items || [];
          allPosts.push(...items.filter((p: any) => p !== null));
          nextToken = response.data?.socialPostsBySocialAccountIdAndPostedAt?.nextToken;
        } while (nextToken);
      }

      allPosts.sort((a, b) => {
        const dateA = new Date(a.postedAt || 0).getTime();
        const dateB = new Date(b.postedAt || 0).getTime();
        return dateB - dateA;
      });

      setPosts(allPosts);
    } catch (err) {
      console.error('Error fetching posts:', err);
      setError('Failed to fetch posts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [client, selectedAccountIds, selectedYearMonths]);

  // Fetch when filters change
  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  // Filter posts
  const filteredPosts = useMemo(() => {
    let filtered = posts;

    if (selectedDays.length > 0 && selectedDays.length < dayOptions.length) {
      filtered = filtered.filter((post) => {
        if (!post.postedAt) return false;
        const postDay = format(new Date(post.postedAt), 'yyyy-MM-dd');
        return selectedDays.includes(postDay);
      });
    }

    if (selectedContentTypes.length < contentTypeOptions.length) {
      filtered = filtered.filter((post) => {
        const type = post.contentType || 'GENERAL';
        return selectedContentTypes.includes(type);
      });
    }

    if (selectedLinkedStatus.length === 1) {
      if (selectedLinkedStatus[0] === 'linked') {
        filtered = filtered.filter((post) => post.linkedGameId);
      } else {
        filtered = filtered.filter((post) => !post.linkedGameId);
      }
    }

    return filtered;
  }, [posts, selectedDays, dayOptions.length, selectedContentTypes, selectedLinkedStatus]);

  // Group posts by date
  const groupedPosts = useMemo(() => {
    const groups = new Map<string, typeof filteredPosts>();

    filteredPosts.forEach((post) => {
      let dateKey: string;

      if (groupByGameDate && post.effectiveGameDate) {
        dateKey = format(new Date(post.effectiveGameDate), 'yyyy-MM-dd');
      } else {
        dateKey = post.postedAt ? format(new Date(post.postedAt), 'yyyy-MM-dd') : 'unknown';
      }

      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(post);
    });

    return Array.from(groups.entries()).sort((a, b) => {
      if (a[0] === 'unknown') return 1;
      if (b[0] === 'unknown') return -1;
      return b[0].localeCompare(a[0]);
    });
  }, [filteredPosts, groupByGameDate]);

  // Format day label
  const formatDayLabel = (dateKey: string) => {
    if (dateKey === 'unknown') return 'Unknown Date';
    const date = new Date(dateKey);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (format(date, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd')) return 'Today';
    if (format(date, 'yyyy-MM-dd') === format(yesterday, 'yyyy-MM-dd')) return 'Yesterday';

    return format(date, 'EEEE, d MMMM yyyy');
  };

  // Handle hide post
  const handleHidePost = async (postId: string) => {
    try {
      await client.graphql({
        query: updateSocialPostMutation,
        variables: { input: { id: postId, status: SocialPostStatus.HIDDEN } },
      });
      setPosts((prev) => prev.filter((p) => p.id !== postId));
    } catch (err) {
      console.error('Error hiding post:', err);
    }
  };

  // Handle delete post
  const handleDeletePost = async (postId: string) => {
    try {
      await client.graphql({
        query: deleteSocialPostMutation,
        variables: { input: { id: postId } },
      });
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      setDeletingPostId(null);
    } catch (err) {
      console.error('Error deleting post:', err);
    }
  };

  // Account options for filter
  const accountOptions = accounts.map((a) => ({
    id: a.id,
    label: a.accountName,
    sublabel: a.platform,
  }));

  const hasActiveFilters =
    selectedAccountIds.length < accounts.length ||
    selectedYearMonths.length !== 1 ||
    (selectedDays.length > 0 && selectedDays.length < dayOptions.length) ||
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
            if (months.length === 0) {
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

        <div className="w-px h-6 bg-gray-300" />

        <CheckboxMultiSelectDropdown
          label="Type"
          options={contentTypeOptions}
          selectedValues={selectedContentTypes}
          onChange={setSelectedContentTypes}
          placeholder="Content type..."
          maxDisplayItems={2}
        />

        <CheckboxMultiSelectDropdown
          label="Linked"
          options={linkedStatusOptions}
          selectedValues={selectedLinkedStatus}
          onChange={setSelectedLinkedStatus}
          placeholder="Linked status..."
          maxDisplayItems={2}
        />

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

        {hasActiveFilters && (
          <button
            onClick={() => {
              setSelectedDays(dayOptions.map((d) => d.value));
              setSelectedAccountIds(accounts.map((a) => a.id));
              setSelectedYearMonths([format(new Date(), 'yyyy-MM')]);
              setSelectedContentTypes(contentTypeOptions.map((o) => o.value));
              setSelectedLinkedStatus(linkedStatusOptions.map((o) => o.value));
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
                <h3 className="text-sm font-semibold text-gray-900">{formatDayLabel(dateKey)}</h3>
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

              {/* Posts Grid - Using shared SocialPostCard */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {dayPosts.map((post) => (
                  <SocialPostCard
                    key={post.id}
                    post={post}
                    variant="management"
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
        <PostDetailModal postId={selectedPostId} onClose={() => setSelectedPostId(null)} />
      )}

      {/* Delete Confirmation Modal */}
      {deletingPostId && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div
            className="fixed inset-0 bg-black/50 transition-opacity"
            onClick={() => setDeletingPostId(null)}
          />
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full p-5">
              <div className="mx-auto flex items-center justify-center h-10 w-10 rounded-full bg-red-100">
                <TrashIcon className="h-5 w-5 text-red-600" />
              </div>
              <h3 className="mt-3 text-base font-semibold text-gray-900 text-center">
                Delete Post?
              </h3>
              <p className="mt-2 text-sm text-gray-600 text-center">This action cannot be undone.</p>
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