// src/hooks/useSocialAccounts.ts
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { useEntity } from '../contexts/EntityContext';

// Import generated GraphQL operations
import { listSocialAccountsSimple as listSocialAccounts } from '../graphql/customQueries';
import { 
  createSocialAccount, 
  updateSocialAccount, 
  deleteSocialAccount 
} from '../graphql/mutations';

// Import Amplify-generated types
import { 
  SocialAccount,
  CreateSocialAccountInput,
  UpdateSocialAccountInput,
  SocialAccountStatus,
  SocialPlatform,
} from '../API';

// Re-export types for consumers
export type { SocialAccount, CreateSocialAccountInput, UpdateSocialAccountInput };
export { SocialAccountStatus, SocialPlatform };

interface UseSocialAccountsOptions {
  filterByEntity?: boolean;
}

// Helper to check if response has data
function hasGraphQLData<T>(response: unknown): response is { data: T } {
  return response !== null && typeof response === 'object' && 'data' in response;
}

// ============================================
// GraphQL mutation to sync page info (fetches logo from FB and stores in S3)
// This calls the existing socialFetcher Lambda's syncPageInfo handler
// ============================================
const syncPageInfoMutation = /* GraphQL */ `
  mutation SyncPageInfo($socialAccountId: ID!, $forceRefresh: Boolean) {
    syncPageInfo(socialAccountId: $socialAccountId, forceRefresh: $forceRefresh) {
      success
      message
      logoUrl
      followerCount
      pageName
    }
  }
`;

export const useSocialAccounts = (options: UseSocialAccountsOptions = {}) => {
  const { filterByEntity = true } = options;
  
  const client = useMemo(() => generateClient(), []);
  const { currentEntity } = useEntity();
  
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const hasFetchedRef = useRef(false);
  const currentEntityIdRef = useRef<string | undefined>(undefined);

  const effectiveEntityId = filterByEntity ? currentEntity?.id : undefined;

  // Extract platform account ID from URL
  const extractPlatformAccountId = useCallback((url: string, platform: string): string => {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      
      if (platform === 'FACEBOOK') {
        if (pathParts[0] === 'pages' && pathParts.length >= 3) {
          return pathParts[2];
        }
        return pathParts[0] || '';
      } else if (platform === 'INSTAGRAM') {
        return pathParts[0] || '';
      }
      return pathParts[0] || '';
    } catch {
      const parts = url.split('/').filter(Boolean);
      return parts[parts.length - 1] || url;
    }
  }, []);

  // ============================================
  // Sync page info (logo, follower count, etc.) via socialFetcher Lambda
  // This downloads the logo from Facebook and stores it in S3
  // ============================================
  const syncPageInfo = useCallback(async (
    socialAccountId: string,
    forceRefresh = false
  ): Promise<{ success: boolean; logoUrl: string | null; message: string }> => {
    try {
      console.log('[useSocialAccounts] Syncing page info for:', socialAccountId);
      
      const response = await client.graphql({
        query: syncPageInfoMutation,
        variables: { socialAccountId, forceRefresh },
      });

      if (hasGraphQLData<{ syncPageInfo: { success: boolean; logoUrl: string | null; message: string } }>(response)) {
        const result = response.data.syncPageInfo;
        console.log('[useSocialAccounts] Page info synced:', result);
        
        if (result.success) {
          // Refresh accounts to get updated profileImageUrl
          await fetchAccounts(effectiveEntityId, true);
        }
        
        return {
          success: result.success,
          logoUrl: result.logoUrl,
          message: result.message,
        };
      }
      
      return { success: false, logoUrl: null, message: 'Invalid response' };
    } catch (err) {
      console.error('[useSocialAccounts] Error syncing page info:', err);
      return { success: false, logoUrl: null, message: String(err) };
    }
  }, [client, effectiveEntityId]);

  // Fetch all accounts
  const fetchAccounts = useCallback(async (entityId?: string, forceRefresh = false) => {
    if (!forceRefresh && hasFetchedRef.current && currentEntityIdRef.current === entityId) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const variables: { limit: number; filter?: { entityId: { eq: string } } } = { limit: 100 };
      
      if (entityId) {
        variables.filter = { entityId: { eq: entityId } };
      }

      const response = await client.graphql({
        query: listSocialAccounts,
        variables,
      });

      if (hasGraphQLData<{ listSocialAccounts: { items: (SocialAccount | null)[] } }>(response)) {
        const items = (response.data.listSocialAccounts?.items || [])
          .filter((item: SocialAccount | null): item is SocialAccount => item !== null)
          .sort((a: SocialAccount, b: SocialAccount) => a.accountName.localeCompare(b.accountName));
        setAccounts(items);
        hasFetchedRef.current = true;
        currentEntityIdRef.current = entityId;
      }
    } catch (err) {
      console.error('Error fetching social accounts:', err);
      setError('Failed to fetch social accounts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [client]);

  // Create account
  const createAccountFn = useCallback(async (input: {
    platform: SocialPlatform;
    accountUrl: string;
    accountName: string;
    accountHandle?: string | null;
    platformAccountId?: string | null;
    entityId?: string | null;
    venueId?: string | null;
    scrapeFrequencyMinutes?: number | null;
    isScrapingEnabled?: boolean;
    preferredScrapeHourUTC?: number | null;
    fetchLogo?: boolean; // If true, will call syncPageInfo after creation
  }): Promise<SocialAccount | null> => {
    try {
      const platformAccountId = input.platformAccountId || 
        extractPlatformAccountId(input.accountUrl, input.platform);

      const createInput: CreateSocialAccountInput = {
        platform: input.platform,
        platformAccountId,
        accountName: input.accountName,
        accountUrl: input.accountUrl,
        accountHandle: input.accountHandle,
        entityId: input.entityId,
        venueId: input.venueId,
        status: SocialAccountStatus.PENDING_VERIFICATION,
        isScrapingEnabled: input.isScrapingEnabled ?? true,
        consecutiveFailures: 0,
        scrapeFrequencyMinutes: input.scrapeFrequencyMinutes || 60,
        preferredScrapeHourUTC: input.preferredScrapeHourUTC,
      };

      const response = await client.graphql({
        query: createSocialAccount,
        variables: { input: createInput },
      });

      if (hasGraphQLData<{ createSocialAccount: SocialAccount }>(response) && response.data?.createSocialAccount) {
        const newAccount = response.data.createSocialAccount;
        
        // ============================================
        // NEW: Auto-sync page info to fetch and store the logo in S3
        // This runs async in the background - doesn't block account creation
        // ============================================
        if (input.fetchLogo !== false && input.platform === 'FACEBOOK') {
          console.log('[useSocialAccounts] Triggering page info sync for new account...');
          
          // Don't await - let it run in background
          syncPageInfo(newAccount.id, true).then((result) => {
            if (result.success) {
              console.log('[useSocialAccounts] Logo synced successfully:', result.logoUrl);
            } else {
              console.warn('[useSocialAccounts] Logo sync failed:', result.message);
            }
          }).catch((err) => {
            console.warn('[useSocialAccounts] Logo sync error:', err);
          });
        }
        
        // Force refresh after create
        await fetchAccounts(effectiveEntityId, true);
        return newAccount;
      }
      return null;
    } catch (err) {
      console.error('Error creating social account:', err);
      throw new Error('Failed to create social account. Please check the URL and try again.');
    }
  }, [client, fetchAccounts, effectiveEntityId, extractPlatformAccountId, syncPageInfo]);

  // Update account
  const updateAccountFn = useCallback(async (input: UpdateSocialAccountInput): Promise<SocialAccount | null> => {
    try {
      const response = await client.graphql({
        query: updateSocialAccount,
        variables: { input },
      });

      if (hasGraphQLData<{ updateSocialAccount: SocialAccount }>(response) && response.data?.updateSocialAccount) {
        if ('errors' in response && Array.isArray((response as any).errors) && (response as any).errors.length > 0) {
          console.warn(`[useSocialAccounts] Update succeeded with ${(response as any).errors.length} field warnings`);
        }
        await fetchAccounts(effectiveEntityId, true);
        return response.data.updateSocialAccount;
      }
      return null;
    } catch (err: any) {
      if (err?.data?.updateSocialAccount) {
        console.warn(`[useSocialAccounts] Update succeeded despite errors`);
        await fetchAccounts(effectiveEntityId, true);
        return err.data.updateSocialAccount;
      }
      
      console.error('Error updating social account:', err);
      throw new Error('Failed to update social account. Please try again.');
    }
  }, [client, fetchAccounts, effectiveEntityId]);

  // Delete account
  const deleteAccountFn = useCallback(async (id: string, version?: number): Promise<boolean> => {
    try {
      await client.graphql({
        query: deleteSocialAccount,
        variables: { 
          input: { 
            id,
            _version: version 
          } 
        },
      });
      
      await fetchAccounts(effectiveEntityId, true);
      return true;
    } catch (err) {
      console.error('Error deleting social account:', err);
      throw new Error('Failed to delete social account. It may have associated posts.');
    }
  }, [client, fetchAccounts, effectiveEntityId]);

  // Toggle scraping enabled
  const toggleScrapingEnabled = useCallback(async (account: SocialAccount): Promise<void> => {
    await updateAccountFn({
      id: account.id,
      isScrapingEnabled: !account.isScrapingEnabled,
    } as UpdateSocialAccountInput);
  }, [updateAccountFn]);

  // Update status
  const updateStatus = useCallback(async (
    id: string, 
    status: SocialAccountStatus,
    _version?: number
  ): Promise<void> => {
    await updateAccountFn({
      id,
      status,
    } as UpdateSocialAccountInput);
  }, [updateAccountFn]);

  // ============================================
  // Refresh logo for an existing account
  // Calls syncPageInfo with forceRefresh=true
  // ============================================
  const refreshLogo = useCallback(async (account: SocialAccount): Promise<string | null> => {
    const result = await syncPageInfo(account.id, true);
    return result.logoUrl;
  }, [syncPageInfo]);

  // Initial fetch
  useEffect(() => {
    if (!hasFetchedRef.current || currentEntityIdRef.current !== effectiveEntityId) {
      fetchAccounts(effectiveEntityId);
    }
  }, [effectiveEntityId, fetchAccounts]);

  return {
    accounts,
    loading,
    error,
    fetchAccounts: useCallback((entityId?: string) => fetchAccounts(entityId, true), [fetchAccounts]),
    createAccount: createAccountFn,
    updateAccount: updateAccountFn,
    deleteAccount: deleteAccountFn,
    toggleScrapingEnabled,
    updateStatus,
    extractPlatformAccountId,
    syncPageInfo,
    refreshLogo,
  };
};

export default useSocialAccounts;