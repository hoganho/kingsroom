// src/pages/settings/SocialAccountManagement.tsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { SocialAccountTable } from '../../components/social/SocialAccountTable';
import { SocialAccountModal } from '../../components/social/SocialAccountModal';
import { ManualPostUploadTab } from '../../components/social/ManualPostUploadTab';
import { UnprocessedPostsTab } from '../../components/social/UnprocessedPostsTab';
import { SocialPostsTab } from '../../components/social/SocialPostsTab';
import { DeleteConfirmationModal } from '../../components/entities/DeleteConfirmationModal';
import { useSocialAccounts, SocialAccount, CreateSocialAccountInput, UpdateSocialAccountInput } from '../../hooks/useSocialAccounts';

// Custom lightweight query that doesn't fetch nested relationships
const listEntitiesSimple = /* GraphQL */ `
  query ListEntitiesSimple($limit: Int, $nextToken: String) {
    listEntities(limit: $limit, nextToken: $nextToken) {
      items {
        id
        entityName
        isActive
      }
      nextToken
    }
  }
`;

const listVenuesSimple = /* GraphQL */ `
  query ListVenuesSimple($limit: Int, $nextToken: String) {
    listVenues(limit: $limit, nextToken: $nextToken) {
      items {
        id
        name
        entityId
      }
      nextToken
    }
  }
`;

import { 
  InformationCircleIcon, 
  PlusIcon,
  ArrowPathIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ExclamationTriangleIcon,
  UserGroupIcon,
  ArrowUpTrayIcon,
  PlayIcon,
} from '@heroicons/react/24/outline';
import { Loader2, Database, AlertCircle, Facebook } from 'lucide-react';

// =====================================================
// GraphQL Operations
// =====================================================

const triggerSocialScrape = /* GraphQL */ `
  mutation TriggerSocialScrape($socialAccountId: ID!) {
    triggerSocialScrape(socialAccountId: $socialAccountId) {
      success
      message
      postsFound
      newPostsAdded
      rateLimited
      timeout
    }
  }
`;

const triggerFullSync = /* GraphQL */ `
  mutation TriggerFullSync($socialAccountId: ID!) {
    triggerFullSync(socialAccountId: $socialAccountId) {
      success
      message
      postsFound
      newPostsAdded
      rateLimited
      timeout
      oldestPostDate
    }
  }
`;

const syncPageInfo = /* GraphQL */ `
  mutation SyncPageInfo($socialAccountId: ID!, $forceRefresh: Boolean) {
    syncPageInfo(socialAccountId: $socialAccountId, forceRefresh: $forceRefresh) {
      success
      message
      logoUrl
    }
  }
`;

// Subscription for real-time sync progress updates
const onSyncProgress = /* GraphQL */ `
  subscription OnSyncProgress($socialAccountId: ID!) {
    onSyncProgress(socialAccountId: $socialAccountId) {
      socialAccountId
      status
      message
      postsFound
      newPostsAdded
      rateLimited
      pagesCompleted
      completedAt
    }
  }
`;

// =====================================================
// Types
// =====================================================

interface Entity {
  id: string;
  entityName: string;
  isActive: boolean;
}

interface Venue {
  id: string;
  name: string;
  entityId?: string | null;
}

interface FullSyncResult {
  success: boolean;
  message: string;
  postsFound: number;
  newPostsAdded: number;
  rateLimited?: boolean;
  timeout?: boolean;
  oldestPostDate?: string;
}

interface SyncProgressEvent {
  socialAccountId: string;
  status: 'STARTED' | 'IN_PROGRESS' | 'COMPLETED' | 'RATE_LIMITED' | 'FAILED';
  message?: string;
  postsFound?: number;
  newPostsAdded?: number;
  rateLimited?: boolean;
  pagesCompleted?: number;
  completedAt?: string;
}

type TabType = 'accounts' | 'upload' | 'unprocessed' | 'posts';

// Helper to check if response has data
function hasGraphQLData<T>(response: unknown): response is { data: T } {
  return response !== null && typeof response === 'object' && 'data' in response;
}

// =====================================================
// Full Sync Warning Modal
// =====================================================

interface FullSyncWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  account: SocialAccount | null;
  isLoading: boolean;
  progressMessage?: string;
}

const FullSyncWarningModal: React.FC<FullSyncWarningModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  account,
  isLoading,
  progressMessage
}) => {
  if (!isOpen || !account) return null;

  const hasFullHistory = account.hasFullHistory;
  const hasIncompleteSync = !!(account as any).fullSyncOldestPostDate;
  const isResume = hasIncompleteSync && !hasFullHistory;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        <div 
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={!isLoading ? onClose : undefined}
        />

        <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6 z-10">
          <div className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full ${
            isLoading ? 'bg-indigo-100' : isResume ? 'bg-green-100' : hasFullHistory ? 'bg-amber-100' : 'bg-blue-100'
          }`}>
            {isLoading ? (
              <Loader2 className="h-6 w-6 text-indigo-600 animate-spin" />
            ) : isResume ? (
              <PlayIcon className="h-6 w-6 text-green-600" />
            ) : hasFullHistory ? (
              <ExclamationTriangleIcon className="h-6 w-6 text-amber-600" />
            ) : (
              <Database className="h-6 w-6 text-blue-600" />
            )}
          </div>

          <h3 className="mt-4 text-lg font-semibold text-gray-900 text-center">
            {isLoading 
              ? 'Syncing in Progress...'
              : isResume 
                ? 'Resume Full Sync' 
                : hasFullHistory 
                  ? 'Full History Already Synced' 
                  : 'Fetch All Historical Posts'}
          </h3>

          <div className="mt-3 text-sm text-gray-600">
            {isLoading ? (
              <div className="text-center">
                <p className="mb-3 text-indigo-700 font-medium">
                  {progressMessage || 'Starting sync...'}
                </p>
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3">
                  <p className="text-indigo-800 text-xs">
                    This may take several minutes. You can close this dialog - the sync will continue in the background and you'll be notified when it completes.
                  </p>
                </div>
              </div>
            ) : isResume ? (
              <>
                <p className="mb-3">
                  <strong className="text-green-700">{account.accountName}</strong> has a partial sync in progress.
                </p>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-3">
                  <p className="text-green-800">
                    <strong>Good news:</strong> {account.postCount || 0} posts have already been saved. 
                    Click "Resume" to continue fetching older posts from where we left off.
                  </p>
                </div>
                <p className="text-gray-500 text-xs">
                  Last sync stopped at: {new Date((account as any).fullSyncOldestPostDate).toLocaleDateString()}
                </p>
              </>
            ) : hasFullHistory ? (
              <>
                <p className="mb-3">
                  <strong className="text-amber-700">{account.accountName}</strong> has already had a full history sync performed.
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-3">
                  <p className="text-amber-800">
                    <strong>Note:</strong> Running a full sync again will re-scan all posts, but duplicates won't be saved. This may take several minutes and use API quota.
                  </p>
                </div>
                <p>
                  For new posts only, use the regular <strong>"Fetch Posts"</strong> button instead.
                </p>
              </>
            ) : (
              <>
                <p className="mb-3">
                  This will fetch <strong>all historical posts</strong> from <strong className="text-indigo-600">{account.accountName}</strong>.
                </p>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
                  <ul className="list-disc list-inside space-y-1 text-blue-800">
                    <li>May take several minutes depending on post count</li>
                    <li>Fetches up to 5,000 posts maximum</li>
                    <li>Uses Facebook API quota</li>
                    <li><strong>Progress is saved automatically</strong> - if interrupted, you can resume</li>
                  </ul>
                </div>
                <p>
                  After the initial sync, regular fetches will only get new posts since the last sync.
                </p>
              </>
            )}
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
            >
              {isLoading ? 'Close (Sync Continues)' : 'Cancel'}
            </button>
            {!isLoading && (
              <button
                type="button"
                onClick={onConfirm}
                className={`flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 flex items-center justify-center gap-2 ${
                  isResume 
                    ? 'bg-green-600 hover:bg-green-700 focus:ring-green-500'
                    : hasFullHistory 
                      ? 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500' 
                      : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
                }`}
              >
                {isResume ? (
                  <>
                    <PlayIcon className="w-4 h-4" />
                    Resume Sync
                  </>
                ) : hasFullHistory ? (
                  'Re-sync All Posts'
                ) : (
                  'Start Full Sync'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// =====================================================
// Rate Limit Info Banner
// =====================================================

interface RateLimitBannerProps {
  accountName: string;
  postsSaved: number;
  onResume: () => void;
  onDismiss: () => void;
}

const RateLimitBanner: React.FC<RateLimitBannerProps> = ({
  accountName,
  postsSaved,
  onResume,
  onDismiss
}) => (
  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 mb-4">
    <div className="flex items-start gap-3">
      <ExclamationTriangleIcon className="h-5 w-5 text-orange-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <h4 className="text-sm font-medium text-orange-800">
          Rate Limited - Partial Sync Saved
        </h4>
        <p className="mt-1 text-sm text-orange-700">
          Facebook rate limited the request for <strong>{accountName}</strong>. 
          <strong> {postsSaved} posts were saved</strong> before the limit was hit.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={onResume}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-orange-700 bg-orange-100 rounded-lg hover:bg-orange-200"
          >
            <PlayIcon className="w-4 h-4" />
            Resume Later
          </button>
          <button
            onClick={onDismiss}
            className="px-3 py-1.5 text-sm font-medium text-orange-600 hover:text-orange-800"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  </div>
);

// =====================================================
// Main Component
// =====================================================

export const SocialAccountManagement: React.FC = () => {
  const client = useMemo(() => generateClient(), []);
  
  const {
    accounts,
    loading: accountsLoading,
    error: accountsError,
    fetchAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
    toggleScrapingEnabled,
  } = useSocialAccounts({ filterByEntity: false });

  // Local state
  const [activeTab, setActiveTab] = useState<TabType>('accounts');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SocialAccount | null>(null);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<SocialAccount | null>(null);
  const [scrapingAccountId, setScrapingAccountId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [entities, setEntities] = useState<Entity[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  
  // Full sync modal state
  const [isFullSyncModalOpen, setIsFullSyncModalOpen] = useState(false);
  const [fullSyncAccount, setFullSyncAccount] = useState<SocialAccount | null>(null);
  const [isFullSyncing, setIsFullSyncing] = useState(false);
  const [syncProgressMessage, setSyncProgressMessage] = useState<string>('');
  
  // Logo refresh state
  const [refreshingLogoAccountId, setRefreshingLogoAccountId] = useState<string | null>(null);

  // Rate limit banner state
  const [rateLimitInfo, setRateLimitInfo] = useState<{
    accountName: string;
    postsSaved: number;
  } | null>(null);

  // Subscription ref for cleanup
  const syncSubscriptionRef = useRef<any>(null);

  // Cleanup subscription on unmount
  useEffect(() => {
    return () => {
      if (syncSubscriptionRef.current) {
        syncSubscriptionRef.current.unsubscribe();
        syncSubscriptionRef.current = null;
      }
    };
  }, []);

  // Auto-dismiss messages
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (error || accountsError) {
      const timer = setTimeout(() => setError(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [error, accountsError]);

  // Fetch entities and venues
  useEffect(() => {
    const fetchEntitiesAndVenues = async () => {
      try {
        const entityResponse = await client.graphql({
          query: listEntitiesSimple,
          variables: { limit: 100 },
        });
        
        if (hasGraphQLData<{ listEntities: { items: Entity[] } }>(entityResponse)) {
          const activeEntities = entityResponse.data.listEntities?.items?.filter(e => e?.isActive) || [];
          setEntities(activeEntities.sort((a, b) => a.entityName.localeCompare(b.entityName)));
        }

        const venueResponse = await client.graphql({
          query: listVenuesSimple,
          variables: { limit: 500 },
        });

        if (hasGraphQLData<{ listVenues: { items: Venue[] } }>(venueResponse)) {
          const venueItems = venueResponse.data.listVenues?.items?.filter(v => v !== null) || [];
          setVenues(venueItems.sort((a, b) => a.name.localeCompare(b.name)));
        }
      } catch (err) {
        console.error('Error fetching entities/venues:', err);
      }
    };

    fetchEntitiesAndVenues();
  }, [client]);

  // Handlers
  const handleAddAccount = useCallback(() => {
    setEditingAccount(null);
    setIsModalOpen(true);
  }, []);

  const handleEditAccount = useCallback((account: SocialAccount) => {
    setEditingAccount(account);
    setIsModalOpen(true);
  }, []);

  const handleDeleteClick = useCallback((id: string) => {
    const account = accounts.find(a => a.id === id);
    if (account) {
      setDeletingAccount(account);
      setIsDeleteModalOpen(true);
    }
  }, [accounts]);

  // Handle creating/editing accounts - matches SocialAccountModal prop type
  const handleSaveAccount = useCallback(async (data: CreateSocialAccountInput | UpdateSocialAccountInput) => {
    try {
      if ('platform' in data) {
        // Creating new account
        const newAccount = await createAccount({
          platform: data.platform,
          accountUrl: data.accountUrl,
          accountName: data.accountName,
          accountHandle: data.accountHandle,
          platformAccountId: data.platformAccountId,
          entityId: data.entityId,
          venueId: data.venueId,
          scrapeFrequencyMinutes: data.scrapeFrequencyMinutes,
        });
        
        setIsModalOpen(false);
        setSuccessMessage(`${data.accountName} has been added. Fetching page info...`);
        
        // Auto-sync page info
        if (newAccount?.id) {
          try {
            const response = await client.graphql({
              query: syncPageInfo,
              variables: { socialAccountId: newAccount.id, forceRefresh: false },
            });

            if (hasGraphQLData<{ syncPageInfo: { success: boolean; message: string; logoUrl: string | null } }>(response)) {
              const result = response.data.syncPageInfo;
              if (result.success) {
                setSuccessMessage(`${data.accountName} added and page info synced successfully`);
                fetchAccounts();
              } else {
                setSuccessMessage(`${data.accountName} added. Note: ${result.message || 'Could not fetch page info'}`);
              }
            }
          } catch (syncErr) {
            console.warn('Could not auto-sync page info:', syncErr);
            setSuccessMessage(`${data.accountName} added. Use "Refresh Logo" to fetch page info.`);
          }
        }
      } else {
        // Updating existing account
        await updateAccount(data as UpdateSocialAccountInput);
        setSuccessMessage('Account has been updated successfully');
        setIsModalOpen(false);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save account');
    }
  }, [createAccount, updateAccount, client, fetchAccounts]);

  // Handle delete
  const confirmDelete = useCallback(async () => {
    if (!deletingAccount) return;

    try {
      await deleteAccount(deletingAccount.id, deletingAccount._version);
      setSuccessMessage(`${deletingAccount.accountName} has been deleted`);
      setIsDeleteModalOpen(false);
      setDeletingAccount(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete account');
    }
  }, [deletingAccount, deleteAccount]);

  // Trigger manual scrape (incremental)
  const handleTriggerScrape = useCallback(async (account: SocialAccount) => {
    setScrapingAccountId(account.id);
    setError(null);

    try {
      const response = await client.graphql({
        query: triggerSocialScrape,
        variables: { socialAccountId: account.id },
      });

      if (hasGraphQLData<{ triggerSocialScrape: FullSyncResult }>(response)) {
        const result = response.data.triggerSocialScrape;
        if (result.success) {
          setSuccessMessage(
            `Fetched ${result.newPostsAdded} new posts for ${account.accountName} (scanned ${result.postsFound} total)`
          );
          fetchAccounts();
        } else if (result.rateLimited) {
          setRateLimitInfo({
            accountName: account.accountName,
            postsSaved: result.newPostsAdded,
          });
          fetchAccounts();
        } else {
          setError(result.message || 'Scrape failed');
        }
      }
    } catch (err: any) {
      console.error('Error triggering scrape:', err);
      setError(err?.errors?.[0]?.message || 'Failed to trigger scrape');
    } finally {
      setScrapingAccountId(null);
    }
  }, [client, fetchAccounts]);

  // Full sync - opens warning modal first
  const handleFullSyncClick = useCallback((account: SocialAccount) => {
    setFullSyncAccount(account);
    setIsFullSyncModalOpen(true);
    setSyncProgressMessage('');
  }, []);

  // Handle sync progress subscription event
  const handleSyncProgressEvent = useCallback((event: SyncProgressEvent, accountName: string) => {
    console.log('Sync progress event:', event);
    
    switch (event.status) {
      case 'STARTED':
        setSyncProgressMessage(event.message || 'Starting sync...');
        break;
        
      case 'IN_PROGRESS':
        setSyncProgressMessage(
            event.message || `Fetched ${event.pagesCompleted || 0} pages... (${event.newPostsAdded || 0} new posts saved)`
        );
        break;
        
      case 'COMPLETED':
        setIsFullSyncing(false);
        setIsFullSyncModalOpen(false);
        setFullSyncAccount(null);
        setSyncProgressMessage('');
        setSuccessMessage(
          `Full sync complete for ${accountName}: ${event.newPostsAdded || 0} new posts saved (scanned ${event.postsFound || 0} total)`
        );
        fetchAccounts();
        
        if (syncSubscriptionRef.current) {
          syncSubscriptionRef.current.unsubscribe();
          syncSubscriptionRef.current = null;
        }
        break;
        
      case 'RATE_LIMITED':
        setIsFullSyncing(false);
        setIsFullSyncModalOpen(false);
        setFullSyncAccount(null);
        setSyncProgressMessage('');
        setRateLimitInfo({
          accountName,
          postsSaved: event.newPostsAdded || 0,
        });
        fetchAccounts();
        
        if (syncSubscriptionRef.current) {
          syncSubscriptionRef.current.unsubscribe();
          syncSubscriptionRef.current = null;
        }
        break;
        
      case 'FAILED':
        setIsFullSyncing(false);
        setIsFullSyncModalOpen(false);
        setFullSyncAccount(null);
        setSyncProgressMessage('');
        setError(event.message || 'Sync failed');
        fetchAccounts();
        
        if (syncSubscriptionRef.current) {
          syncSubscriptionRef.current.unsubscribe();
          syncSubscriptionRef.current = null;
        }
        break;
    }
  }, [fetchAccounts]);

  // Confirm and execute full sync with subscription
  const handleConfirmFullSync = useCallback(async () => {
    if (!fullSyncAccount) return;

    setIsFullSyncing(true);
    setError(null);
    setSyncProgressMessage('Starting sync...');

    // Cleanup any existing subscription
    if (syncSubscriptionRef.current) {
      syncSubscriptionRef.current.unsubscribe();
      syncSubscriptionRef.current = null;
    }

    // Set up subscription BEFORE triggering the mutation
    try {
      const subscriptionResult = client.graphql({
        query: onSyncProgress,
        variables: { socialAccountId: fullSyncAccount.id },
      });

      if ('subscribe' in subscriptionResult) {
        syncSubscriptionRef.current = subscriptionResult.subscribe({
          next: ({ data }: any) => {
            if (data?.onSyncProgress) {
              handleSyncProgressEvent(data.onSyncProgress, fullSyncAccount.accountName);
            }
          },
          error: (err: any) => {
            console.error('Subscription error:', err);
          },
        });
      }
    } catch (subError) {
      console.warn('Could not set up subscription, falling back to polling:', subError);
    }

    // Trigger the sync
    try {
      const response = await client.graphql({
        query: triggerFullSync,
        variables: { socialAccountId: fullSyncAccount.id },
      });

      if (hasGraphQLData<{ triggerFullSync: FullSyncResult }>(response)) {
        const result = response.data.triggerFullSync;
        
        if (result.rateLimited || result.timeout) {
          if (!syncSubscriptionRef.current) {
            setRateLimitInfo({
              accountName: fullSyncAccount.accountName,
              postsSaved: result.newPostsAdded,
            });
            setIsFullSyncing(false);
            setIsFullSyncModalOpen(false);
            setFullSyncAccount(null);
            fetchAccounts();
          }
        } else if (result.success) {
          if (!syncSubscriptionRef.current) {
            setSuccessMessage(
              `Full sync complete for ${fullSyncAccount.accountName}: Found ${result.newPostsAdded} new posts`
            );
            setIsFullSyncing(false);
            setIsFullSyncModalOpen(false);
            setFullSyncAccount(null);
            fetchAccounts();
          }
        } else {
          setError(result.message || 'Full sync failed');
          setIsFullSyncing(false);
          setIsFullSyncModalOpen(false);
          setFullSyncAccount(null);
        }
      }
    } catch (err: any) {
      const errorType = err?.errors?.[0]?.errorType || '';
      const errorMessage = err?.errors?.[0]?.message || '';
      
      if (errorType === 'Lambda:ExecutionTimeoutException' || 
          errorMessage.includes('timed out') ||
          errorMessage.includes('Execution timed out')) {
        setSyncProgressMessage('Sync in progress... This may take a few minutes.');
        
        if (!syncSubscriptionRef.current) {
          setSuccessMessage(
            `Sync started for ${fullSyncAccount.accountName}. Refresh the page in a few minutes to see results.`
          );
          setIsFullSyncing(false);
          setIsFullSyncModalOpen(false);
          setFullSyncAccount(null);
          setTimeout(() => fetchAccounts(), 30000);
        }
      } else if (err?.errors?.[0]?.message?.includes('Cannot query field')) {
        setError('triggerFullSync mutation not available. Please deploy the updated Lambda.');
        setIsFullSyncing(false);
        setIsFullSyncModalOpen(false);
        setFullSyncAccount(null);
        
        if (syncSubscriptionRef.current) {
          syncSubscriptionRef.current.unsubscribe();
          syncSubscriptionRef.current = null;
        }
      } else {
        console.error('Error during full sync:', err);
        setError(err?.errors?.[0]?.message || 'Full sync failed. Please try again.');
        setIsFullSyncing(false);
        setIsFullSyncModalOpen(false);
        setFullSyncAccount(null);
        
        if (syncSubscriptionRef.current) {
          syncSubscriptionRef.current.unsubscribe();
          syncSubscriptionRef.current = null;
        }
      }
    }
  }, [client, fullSyncAccount, fetchAccounts, handleSyncProgressEvent]);

  // Refresh Logo
  const handleRefreshLogo = useCallback(async (account: SocialAccount) => {
    setRefreshingLogoAccountId(account.id);
    setError(null);

    try {
      const response = await client.graphql({
        query: syncPageInfo,
        variables: { socialAccountId: account.id, forceRefresh: true },
      });

      if (hasGraphQLData<{ syncPageInfo: { success: boolean; message: string; logoUrl: string | null } }>(response)) {
        const result = response.data.syncPageInfo;
        if (result.success) {
          setSuccessMessage(`Logo refreshed for ${account.accountName}`);
          fetchAccounts();
        } else {
          setError(result.message || 'Failed to refresh logo');
        }
      }
    } catch (err: any) {
      if (err?.errors?.[0]?.message?.includes('Cannot query field')) {
        setError('syncPageInfo mutation not available. Please deploy the updated Lambda.');
      } else {
        console.error('Error refreshing logo:', err);
        setError(err?.errors?.[0]?.message || 'Failed to refresh logo.');
      }
    } finally {
      setRefreshingLogoAccountId(null);
    }
  }, [client, fetchAccounts]);

  // Refresh all accounts
  const handleRefreshAll = useCallback(async () => {
    setIsRefreshingAll(true);
    setError(null);

    const enabledAccounts = accounts.filter(a => a.isScrapingEnabled && a.status !== 'ERROR');
    let successCount = 0;
    let totalNewPosts = 0;

    for (const account of enabledAccounts) {
      try {
        const response = await client.graphql({
          query: triggerSocialScrape,
          variables: { socialAccountId: account.id },
        });

        if (hasGraphQLData<{ triggerSocialScrape: FullSyncResult }>(response)) {
          const result = response.data.triggerSocialScrape;
          if (result.success || result.rateLimited) {
            successCount++;
            totalNewPosts += result.newPostsAdded;
          }
        }
      } catch (err) {
        console.error(`Error scraping ${account.accountName}:`, err);
      }
    }

    setSuccessMessage(`Refreshed ${successCount}/${enabledAccounts.length} accounts. Found ${totalNewPosts} new posts.`);
    fetchAccounts();
    setIsRefreshingAll(false);
  }, [accounts, client, fetchAccounts]);

  // Close handlers
  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const handleCloseDeleteModal = useCallback(() => {
    setIsDeleteModalOpen(false);
    setDeletingAccount(null);
  }, []);

  const handleCloseFullSyncModal = useCallback(() => {
    if (isFullSyncing) {
      setIsFullSyncModalOpen(false);
      return;
    }
    
    setIsFullSyncModalOpen(false);
    setFullSyncAccount(null);
    setSyncProgressMessage('');
  }, [isFullSyncing]);

  // Count accounts with incomplete syncs
  const incompleteSyncCount = useMemo(() => {
    return accounts.filter(a => (a as any).fullSyncOldestPostDate && !a.hasFullHistory).length;
  }, [accounts]);

  // Stats
  const fullySynced = accounts.filter(a => a.hasFullHistory).length;

  return (
    <PageWrapper
      title="Social Account Management"
      maxWidth="7xl"
      actions={
        activeTab === 'accounts' ? (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleRefreshAll}
              disabled={isRefreshingAll || accounts.length === 0}
              className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isRefreshingAll ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Refreshing...
                </>
              ) : (
                <>
                  <ArrowPathIcon className="w-4 h-4 mr-2" />
                  Refresh All
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleAddAccount}
              className="inline-flex items-center justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
            >
              <PlusIcon className="w-4 h-4 mr-2" />
              Add Account
            </button>
          </div>
        ) : null
      }
    >
      {/* Error/Success Messages */}
      {(error || accountsError) && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <ExclamationCircleIcon className="h-5 w-5 text-red-500 flex-shrink-0" />
          <p className="text-red-700 text-sm">{error || accountsError}</p>
        </div>
      )}

      {successMessage && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg flex items-center gap-3">
          <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0" />
          <p className="text-green-700 text-sm">{successMessage}</p>
        </div>
      )}

      {/* Rate Limit Banner */}
      {rateLimitInfo && (
        <RateLimitBanner
          accountName={rateLimitInfo.accountName}
          postsSaved={rateLimitInfo.postsSaved}
          onResume={() => {
            const account = accounts.find(a => a.accountName === rateLimitInfo.accountName);
            if (account) handleFullSyncClick(account);
            setRateLimitInfo(null);
          }}
          onDismiss={() => setRateLimitInfo(null)}
        />
      )}

      {/* Incomplete Syncs Banner */}
      {incompleteSyncCount > 0 && !rateLimitInfo && (
        <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
          <InformationCircleIcon className="h-5 w-5 text-blue-500 flex-shrink-0" />
          <p className="text-blue-700 text-sm">
            <strong>{incompleteSyncCount} account{incompleteSyncCount > 1 ? 's have' : ' has'}</strong> incomplete full syncs. 
            Click "Resume Sync" on the account to continue fetching historical posts.
          </p>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('accounts')}
            className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'accounts'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <UserGroupIcon className="w-5 h-5" />
            Social Accounts
            <span className={`ml-2 py-0.5 px-2.5 rounded-full text-xs font-medium ${
              activeTab === 'accounts' ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-900'
            }`}>
              {accounts.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('posts')}
            className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'posts'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <Facebook className="w-5 h-5" />
            Browse Posts
          </button>
          <button
            onClick={() => setActiveTab('unprocessed')}
            className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'unprocessed'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <AlertCircle className="w-5 h-5" />
            Unprocessed
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex items-center gap-2 py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'upload'
                ? 'border-indigo-500 text-indigo-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <ArrowUpTrayIcon className="w-5 h-5" />
            Manual Upload
          </button>
        </nav>
      </div>

      {/* Stats Bar (only on accounts tab) */}
      {activeTab === 'accounts' && (
        <div className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Total Accounts</div>
            <div className="text-2xl font-semibold text-gray-900">{accounts.length}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Full Synced</div>
            <div className="text-2xl font-semibold text-green-600">{fullySynced}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Partial Syncs</div>
            <div className="text-2xl font-semibold text-orange-600">{incompleteSyncCount}</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-sm text-gray-500">Total Posts</div>
            <div className="text-2xl font-semibold text-gray-900">
              {accounts.reduce((sum, a) => sum + (a.postCount || 0), 0).toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'accounts' && (
        <SocialAccountTable
          accounts={accounts}
          loading={accountsLoading}
          onEdit={handleEditAccount}
          onDelete={handleDeleteClick}
          onToggleScraping={toggleScrapingEnabled}
          onTriggerScrape={handleTriggerScrape}
          onFullSync={handleFullSyncClick}
          onRefreshLogo={handleRefreshLogo}
          scrapingAccountId={scrapingAccountId}
          refreshingLogoAccountId={refreshingLogoAccountId}
        />
      )}

      {activeTab === 'posts' && (
        <SocialPostsTab accounts={accounts} />
      )}

      {activeTab === 'unprocessed' && (
        <UnprocessedPostsTab accounts={accounts} />
      )}

      {activeTab === 'upload' && (
        <ManualPostUploadTab 
          accounts={accounts}
          entities={entities}
        />
      )}

      {/* Account Modal */}
      <SocialAccountModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onSave={handleSaveAccount}
        account={editingAccount}
        entities={entities}
        venues={venues}
      />

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={confirmDelete}
        entityName={deletingAccount?.accountName}
      />

      {/* Full Sync Warning Modal */}
      <FullSyncWarningModal
        isOpen={isFullSyncModalOpen}
        onClose={handleCloseFullSyncModal}
        onConfirm={handleConfirmFullSync}
        account={fullSyncAccount}
        isLoading={isFullSyncing}
        progressMessage={syncProgressMessage}
      />
    </PageWrapper>
  );
};

export default SocialAccountManagement;