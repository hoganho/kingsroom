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

export const useSocialAccounts = (options: UseSocialAccountsOptions = {}) => {
  const { filterByEntity = true } = options;
  
  // Use useMemo for client - same pattern as useScraperManagement
  const client = useMemo(() => generateClient(), []);
  const { currentEntity } = useEntity();
  
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Track if initial fetch has been done to prevent flickering
  const hasFetchedRef = useRef(false);
  const currentEntityIdRef = useRef<string | undefined>(undefined);

  // Compute the effective entityId based on filterByEntity option
  // This ensures consistent behavior across initial fetch and post-mutation refreshes
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

  // Fetch all accounts
  const fetchAccounts = useCallback(async (entityId?: string, forceRefresh = false) => {
    // Prevent duplicate fetches for the same entity
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
        isScrapingEnabled: true,
        consecutiveFailures: 0,
        scrapeFrequencyMinutes: input.scrapeFrequencyMinutes || 60,
      };

      const response = await client.graphql({
        query: createSocialAccount,
        variables: { input: createInput },
      });

      if (hasGraphQLData<{ createSocialAccount: SocialAccount }>(response) && response.data?.createSocialAccount) {
        // Force refresh after create - use effectiveEntityId to respect filterByEntity option
        await fetchAccounts(effectiveEntityId, true);
        return response.data.createSocialAccount;
      }
      return null;
    } catch (err) {
      console.error('Error creating social account:', err);
      throw new Error('Failed to create social account. Please check the URL and try again.');
    }
  }, [client, fetchAccounts, effectiveEntityId, extractPlatformAccountId]);

  // Update account
  const updateAccountFn = useCallback(async (input: UpdateSocialAccountInput): Promise<SocialAccount | null> => {
    try {
      const response = await client.graphql({
        query: updateSocialAccount,
        variables: { input },
      });

      // Handle partial responses - GraphQL can return both data AND errors
      // This happens when nested relations have null values for non-nullable fields
      // (e.g., entity.games[0].gameCost._version)
      if (hasGraphQLData<{ updateSocialAccount: SocialAccount }>(response) && response.data?.updateSocialAccount) {
        // Log warnings if there are errors, but don't fail
        if ('errors' in response && Array.isArray((response as any).errors) && (response as any).errors.length > 0) {
          console.warn(`[useSocialAccounts] Update succeeded with ${(response as any).errors.length} field warnings (nested relations with missing data)`);
        }
        // Force refresh after update - use effectiveEntityId to respect filterByEntity option
        await fetchAccounts(effectiveEntityId, true);
        return response.data.updateSocialAccount;
      }
      return null;
    } catch (err: any) {
      // Amplify may throw an error even when the mutation succeeded but had field-level errors
      // Check if the error contains data - if so, the mutation actually worked
      if (err?.data?.updateSocialAccount) {
        console.warn(`[useSocialAccounts] Update succeeded despite errors (${err?.errors?.length || 0} field warnings)`);
        // Force refresh after update - use effectiveEntityId to respect filterByEntity option
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
      
      // Force refresh after delete - use effectiveEntityId to respect filterByEntity option
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

  // Initial fetch - only runs when entity actually changes
  useEffect(() => {
    // Only fetch if entity changed or we haven't fetched yet
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
  };
};

export default useSocialAccounts;