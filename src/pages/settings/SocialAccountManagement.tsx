// src/pages/settings/SocialAccountManagement.tsx
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { generateClient } from 'aws-amplify/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { SocialAccountTable } from '../../components/social/SocialAccountTable';
import { SocialAccountModal } from '../../components/social/SocialAccountModal';
import { ManualPostUploadTab } from '../../components/social/ManualPostUploadTab';
import { DeleteConfirmationModal } from '../../components/entities/DeleteConfirmationModal';
import { useSocialAccounts, SocialAccount, CreateSocialAccountInput, UpdateSocialAccountInput } from '../../hooks/useSocialAccounts';
import { listEntities } from '../../graphql/queries';

// Custom lightweight query that doesn't fetch nested relationships
// Avoids errors from RecurringGame records with missing _version/_lastChangedAt
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
  ArrowDownTrayIcon,
  UserGroupIcon,
  ArrowUpTrayIcon,
} from '@heroicons/react/24/outline';
import { Loader2, Database } from 'lucide-react';

// GraphQL mutations for triggering scrapes
const triggerSocialScrape = /* GraphQL */ `
  mutation TriggerSocialScrape($socialAccountId: ID!) {
    triggerSocialScrape(socialAccountId: $socialAccountId) {
      success
      message
      postsFound
      newPostsAdded
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
    }
  }
`;

// Updated mutation with forceRefresh parameter
const syncPageInfo = /* GraphQL */ `
  mutation SyncPageInfo($socialAccountId: ID!, $forceRefresh: Boolean) {
    syncPageInfo(socialAccountId: $socialAccountId, forceRefresh: $forceRefresh) {
      success
      message
      logoUrl
    }
  }
`;

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

// Helper to check if response has data
function hasGraphQLData<T>(response: unknown): response is { data: T } {
  return response !== null && typeof response === 'object' && 'data' in response;
}

// Tab type - NEW
type TabType = 'accounts' | 'upload';

// Full Sync Warning Modal
interface FullSyncWarningModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  account: SocialAccount | null;
  isLoading: boolean;
}

const FullSyncWarningModal: React.FC<FullSyncWarningModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  account,
  isLoading
}) => {
  if (!isOpen || !account) return null;

  const hasFullHistory = account.hasFullHistory;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div 
          className="fixed inset-0 bg-black/50 transition-opacity"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full p-6 z-10">
          {/* Warning Icon */}
          <div className={`mx-auto flex items-center justify-center h-12 w-12 rounded-full ${
            hasFullHistory ? 'bg-amber-100' : 'bg-blue-100'
          }`}>
            {hasFullHistory ? (
              <ExclamationTriangleIcon className="h-6 w-6 text-amber-600" />
            ) : (
              <Database className="h-6 w-6 text-blue-600" />
            )}
          </div>

          {/* Title */}
          <h3 className="mt-4 text-lg font-semibold text-gray-900 text-center">
            {hasFullHistory ? 'Full History Already Synced' : 'Fetch All Historical Posts'}
          </h3>

          {/* Content */}
          <div className="mt-3 text-sm text-gray-600">
            {hasFullHistory ? (
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
                  </ul>
                </div>
                <p>
                  After the initial sync, regular fetches will only get new posts since the last sync.
                </p>
              </>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isLoading}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isLoading}
              className={`flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 flex items-center justify-center gap-2 ${
                hasFullHistory 
                  ? 'bg-amber-600 hover:bg-amber-700 focus:ring-amber-500' 
                  : 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
              }`}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Syncing...
                </>
              ) : (
                <>
                  <ArrowDownTrayIcon className="w-4 h-4" />
                  {hasFullHistory ? 'Sync Anyway' : 'Start Full Sync'}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const SocialAccountManagement = () => {
  // Use useMemo for client - prevents new instance on every render
  const client = useMemo(() => generateClient(), []);
  // Note: We don't filter by entity here - this page shows all social accounts
  
  // Tab state - NEW
  const [activeTab, setActiveTab] = useState<TabType>('accounts');
  
  const {
    accounts,
    loading,
    error: accountsError,
    fetchAccounts,
    createAccount,
    updateAccount,
    deleteAccount,
    toggleScrapingEnabled,
  } = useSocialAccounts({ filterByEntity: false });  // Show all accounts across all entities

  const [entities, setEntities] = useState<Entity[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<SocialAccount | null>(null);

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState<SocialAccount | null>(null);

  // Full sync modal state
  const [isFullSyncModalOpen, setIsFullSyncModalOpen] = useState(false);
  const [fullSyncAccount, setFullSyncAccount] = useState<SocialAccount | null>(null);
  const [isFullSyncing, setIsFullSyncing] = useState(false);

  const [scrapingAccountId, setScrapingAccountId] = useState<string | null>(null);
  const [refreshingLogoAccountId, setRefreshingLogoAccountId] = useState<string | null>(null);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);

  // Track if reference data has been fetched to prevent duplicate calls
  const hasFetchedRefData = useRef(false);

  // Fetch entities and venues - only once
  useEffect(() => {
    if (hasFetchedRefData.current) return;
    
    const fetchReferenceData = async () => {
      try {
        hasFetchedRefData.current = true;
        
        const [entitiesResponse, venuesResponse] = await Promise.all([
          client.graphql({ query: listEntities, variables: { limit: 100 } }),
          client.graphql({ query: listVenuesSimple, variables: { limit: 500 } }),
        ]);

        if (hasGraphQLData<{ listEntities: { items: Entity[] } }>(entitiesResponse)) {
          setEntities(entitiesResponse.data.listEntities?.items?.filter(Boolean) || []);
        }

        if (hasGraphQLData<{ listVenues: { items: Venue[] } }>(venuesResponse)) {
          setVenues(venuesResponse.data.listVenues?.items?.filter(Boolean) || []);
        }
      } catch (err) {
        console.error('Error fetching reference data:', err);
      }
    };

    fetchReferenceData();
  }, [client]);

  // Clear messages after delay
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  useEffect(() => {
    if (error || accountsError) {
      const timer = setTimeout(() => setError(null), 7000);
      return () => clearTimeout(timer);
    }
  }, [error, accountsError]);

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

  const handleSaveAccount = useCallback(async (data: CreateSocialAccountInput | UpdateSocialAccountInput) => {
    try {
      if ('platform' in data) {
        // Creating new account - cast to match createAccount's expected input
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
        
        // Auto-sync page info to fetch logo and page details from Facebook
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
                // Page info sync failed, but account was created
                setSuccessMessage(`${data.accountName} added. Note: ${result.message || 'Could not fetch page info'}`);
              }
            }
          } catch (syncErr) {
            // Log but don't fail - the account was still created
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save account');
      throw err;
    }
  }, [createAccount, updateAccount, client, fetchAccounts]);

  const handleToggleScraping = useCallback(async (account: SocialAccount) => {
    try {
      await toggleScrapingEnabled(account);
      setSuccessMessage(
        `Scraping ${account.isScrapingEnabled ? 'paused' : 'enabled'} for ${account.accountName}`
      );
    } catch (err) {
      setError('Failed to update scraping status');
    }
  }, [toggleScrapingEnabled]);

  // Regular incremental fetch
  const handleTriggerScrape = useCallback(async (account: SocialAccount) => {
    setScrapingAccountId(account.id);
    setError(null);

    try {
      const response = await client.graphql({
        query: triggerSocialScrape,
        variables: { socialAccountId: account.id },
      });

      if (hasGraphQLData<{ triggerSocialScrape: { success: boolean; message: string; newPostsAdded: number; postsFound: number } }>(response)) {
        const result = response.data.triggerSocialScrape;
        if (result.success) {
          setSuccessMessage(
            result.newPostsAdded > 0
              ? `Found ${result.newPostsAdded} new post${result.newPostsAdded > 1 ? 's' : ''} from ${account.accountName} (scanned ${result.postsFound})`
              : `No new posts found for ${account.accountName} (scanned ${result.postsFound} recent posts)`
          );
          fetchAccounts();
        } else {
          setError(result.message || 'Failed to fetch posts');
        }
      }
    } catch (err: any) {
      if (err?.errors?.[0]?.message?.includes('Cannot query field')) {
        setError('Social scraping Lambda not deployed yet. Posts can be fetched once the backend is set up.');
      } else {
        console.error('Error triggering scrape:', err);
        setError(err?.errors?.[0]?.message || 'Failed to trigger scrape. Please try again.');
      }
    } finally {
      setScrapingAccountId(null);
    }
  }, [client, fetchAccounts]);

  // Full sync - opens warning modal first
  const handleFullSyncClick = useCallback((account: SocialAccount) => {
    setFullSyncAccount(account);
    setIsFullSyncModalOpen(true);
  }, []);

  // Confirm and execute full sync
  const handleConfirmFullSync = useCallback(async () => {
    if (!fullSyncAccount) return;

    setIsFullSyncing(true);
    setError(null);

    try {
      const response = await client.graphql({
        query: triggerFullSync,
        variables: { socialAccountId: fullSyncAccount.id },
      });

      if (hasGraphQLData<{ triggerFullSync: { success: boolean; message: string; newPostsAdded: number; postsFound: number } }>(response)) {
        const result = response.data.triggerFullSync;
        if (result.success) {
          setSuccessMessage(
            `Full sync complete for ${fullSyncAccount.accountName}: Found ${result.newPostsAdded} new posts (scanned ${result.postsFound} total)`
          );
          fetchAccounts();
        } else {
          setError(result.message || 'Full sync failed');
        }
      }
    } catch (err: any) {
      if (err?.errors?.[0]?.message?.includes('Cannot query field')) {
        setError('triggerFullSync mutation not available. Please deploy the updated Lambda.');
      } else {
        console.error('Error during full sync:', err);
        setError(err?.errors?.[0]?.message || 'Full sync failed. Please try again.');
      }
    } finally {
      setIsFullSyncing(false);
      setIsFullSyncModalOpen(false);
      setFullSyncAccount(null);
    }
  }, [client, fullSyncAccount, fetchAccounts]);

  // Refresh Logo (force re-download from Facebook)
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

        if (hasGraphQLData<{ triggerSocialScrape: { success: boolean; newPostsAdded: number } }>(response)) {
          if (response.data.triggerSocialScrape?.success) {
            successCount++;
            totalNewPosts += response.data.triggerSocialScrape.newPostsAdded || 0;
          }
        }
      } catch (err) {
        console.error(`Error scraping ${account.accountName}:`, err);
      }
    }

    setIsRefreshingAll(false);

    if (successCount > 0) {
      setSuccessMessage(
        `Refreshed ${successCount} account${successCount > 1 ? 's' : ''}. Found ${totalNewPosts} new post${totalNewPosts !== 1 ? 's' : ''}.`
      );
    } else {
      setError('No accounts were successfully refreshed. The Lambda may not be deployed.');
    }

    fetchAccounts();
  }, [accounts, client, fetchAccounts]);

  const confirmDelete = useCallback(async () => {
    if (!deletingAccount) return;

    try {
      await deleteAccount(deletingAccount.id, deletingAccount._version);
      setSuccessMessage(`${deletingAccount.accountName} has been deleted`);
      setIsDeleteModalOpen(false);
      setDeletingAccount(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account');
    }
  }, [deletingAccount, deleteAccount]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const handleCloseDeleteModal = useCallback(() => {
    setIsDeleteModalOpen(false);
  }, []);

  const handleCloseFullSyncModal = useCallback(() => {
    if (!isFullSyncing) {
      setIsFullSyncModalOpen(false);
      setFullSyncAccount(null);
    }
  }, [isFullSyncing]);

  // Stats
  const activeAccounts = accounts.filter(a => a.status === 'ACTIVE').length;
  const errorAccounts = accounts.filter(a => a.status === 'ERROR' || a.status === 'RATE_LIMITED').length;
  const scrapingEnabled = accounts.filter(a => a.isScrapingEnabled).length;
  const fullySynced = accounts.filter(a => a.hasFullHistory).length;

  return (
    <PageWrapper
      title="Social Account Management"
      maxWidth="7xl"
      actions={
        // Only show action buttons on accounts tab
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
      {/* Tab Navigation - NEW */}
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

      {/* Success Message */}
      {successMessage && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-center gap-2">
          <CheckCircleIcon className="w-5 h-5 text-green-500" />
          <p className="text-green-700 text-sm">{successMessage}</p>
        </div>
      )}

      {/* Error Message */}
      {(error || accountsError) && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-center gap-2">
          <ExclamationCircleIcon className="w-5 h-5 text-red-500" />
          <p className="text-red-600 text-sm">{error || accountsError}</p>
        </div>
      )}

      {/* Tab Content */}
      {activeTab === 'accounts' && (
        <>
          {/* Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-4 mb-6">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-500">Total Accounts</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{accounts.length}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-500">Active</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{activeAccounts}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-500">Scraping Enabled</p>
              <p className="text-2xl font-bold text-indigo-600 mt-1">{scrapingEnabled}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-500">Full History</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{fullySynced}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <p className="text-sm font-medium text-gray-500">Errors</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{errorAccounts}</p>
            </div>
          </div>

          {/* Info box */}
          <div className="rounded-md bg-blue-50 p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <InformationCircleIcon className="h-5 w-5 text-blue-400" aria-hidden="true" />
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-blue-800">About Social Accounts</h3>
                <div className="mt-2 text-sm text-blue-700">
                  <p>
                    Connect Facebook and Instagram pages to monitor posts and engagement.
                    Use <strong>"Fetch Posts"</strong> for incremental updates (only new posts since last fetch),
                    or <strong>"Full Sync"</strong> to fetch all historical posts for a new account.
                    Use the <strong>camera icon</strong> to refresh the page logo from Facebook.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Accounts Table */}
          <SocialAccountTable
            accounts={accounts}
            loading={loading}
            onEdit={handleEditAccount}
            onDelete={handleDeleteClick}
            onToggleScraping={handleToggleScraping}
            onTriggerScrape={handleTriggerScrape}
            onFullSync={handleFullSyncClick}
            onRefreshLogo={handleRefreshLogo}
            scrapingAccountId={scrapingAccountId}
            refreshingLogoAccountId={refreshingLogoAccountId}
          />
        </>
      )}

      {/* Manual Upload Tab - NEW */}
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
      />
    </PageWrapper>
  );
};

export default SocialAccountManagement;