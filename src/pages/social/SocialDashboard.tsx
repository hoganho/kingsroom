// src/pages/social/SocialDashboard.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { GraphQLResult } from '@aws-amplify/api';
import { 
  RefreshCw, 
  Plus, 
  ExternalLink,
  Pause,
  Play,
  TrendingUp,
  Users,
  Calendar,
  CheckCircle,
  AlertCircle,
  Loader2,
  Facebook,
  Instagram,
  Link2,
  Clock
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSocialAccounts, SocialAccount } from '../../hooks/useSocialAccounts';
import { useSocialPosts } from '../../hooks/useSocialPosts';

type ViewMode = 'accounts' | 'analytics';

// --- Shared Components (Ideally move these to separate files) ---

const PlatformIcon: React.FC<{ platform: string; className?: string }> = ({ platform, className = '' }) => {
  switch (platform) {
    case 'FACEBOOK': return <Facebook className={`text-blue-500 ${className}`} />;
    case 'INSTAGRAM': return <Instagram className={`text-pink-500 ${className}`} />;
    default: return <Link2 className={className} />;
  }
};

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const styles: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    INACTIVE: 'bg-slate-100 text-slate-600 border-slate-200',
    PENDING_VERIFICATION: 'bg-amber-100 text-amber-700 border-amber-200',
    ERROR: 'bg-red-100 text-red-700 border-red-200',
    RATE_LIMITED: 'bg-orange-100 text-orange-700 border-orange-200',
  };
  const icons: Record<string, React.ReactNode> = {
    ACTIVE: <CheckCircle className="w-3 h-3" />,
    INACTIVE: <Pause className="w-3 h-3" />,
    PENDING_VERIFICATION: <Clock className="w-3 h-3" />,
    ERROR: <AlertCircle className="w-3 h-3" />,
    RATE_LIMITED: <AlertCircle className="w-3 h-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full border ${styles[status] || styles.INACTIVE}`}>
      {icons[status]}
      {status.replace(/_/g, ' ')}
    </span>
  );
};

const AccountCard: React.FC<{
  account: SocialAccount;
  onScrape: (id: string) => void;
  onToggleEnabled: (account: SocialAccount) => void;
  isLoading?: boolean;
}> = ({ account, onScrape, onToggleEnabled, isLoading }) => {
  const formatNumber = (num?: number | null) => {
    if (num === undefined || num === null) return '-';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all">
      <div className={`h-16 bg-gradient-to-r ${account.platform === 'FACEBOOK' ? 'from-blue-500 to-blue-600' : 'from-pink-500 via-purple-500 to-orange-500'}`} />
      <div className="px-5 pb-5">
        <div className="flex items-start justify-between -mt-8">
          <div className="relative">
            {account.profileImageUrl ? (
              <img src={account.profileImageUrl} alt={account.accountName} className="w-16 h-16 rounded-xl object-cover border-4 border-white shadow-lg" />
            ) : (
              <div className="w-16 h-16 rounded-xl border-4 border-white shadow-lg bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-white text-xl font-bold">
                {account.accountName.charAt(0)}
              </div>
            )}
            <div className="absolute -bottom-2 -right-2 w-6 h-6 rounded-full bg-white flex items-center justify-center shadow-sm border border-slate-100">
              <PlatformIcon platform={account.platform} className="w-3.5 h-3.5" />
            </div>
          </div>
          <StatusBadge status={account.status} />
        </div>
        <div className="mt-3">
          <h3 className="font-bold text-slate-800 text-lg">{account.accountName}</h3>
          <p className="text-sm text-slate-500">{account.accountHandle ? `@${account.accountHandle}` : account.platform}</p>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4 text-center">
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-2xl font-bold text-slate-800">{formatNumber(account.followerCount)}</p>
            <p className="text-xs text-slate-500 font-medium">Followers</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3">
            <p className="text-2xl font-bold text-slate-800">{formatNumber(account.postCount)}</p>
            <p className="text-xs text-slate-500 font-medium">Posts</p>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-slate-100">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Last checked:</span>
            <span className="text-slate-700 font-medium">{formatDate(account.lastScrapedAt)}</span>
          </div>
          {account.lastErrorMessage && (
            <p className="mt-2 text-xs text-red-500 bg-red-50 p-2 rounded-lg truncate" title={account.lastErrorMessage}>
              {account.lastErrorMessage}
            </p>
          )}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={() => onScrape(account.id)}
            disabled={isLoading || !account.isScrapingEnabled}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 transition-all text-sm"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><RefreshCw className="w-4 h-4" /> Fetch Posts</>}
          </button>
          <button
            onClick={() => onToggleEnabled(account)}
            className={`p-2.5 rounded-xl border-2 transition-all ${account.isScrapingEnabled ? 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100' : 'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100'}`}
          >
            {account.isScrapingEnabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <a href={account.accountUrl} target="_blank" rel="noopener noreferrer" className="p-2.5 rounded-xl border-2 border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 transition-all">
            <ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
};

// --- Main Dashboard Component ---

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

export const SocialDashboard: React.FC = () => {
  const client = generateClient();
  const [viewMode, setViewMode] = useState<ViewMode>('accounts');
  const [scrapingAccountId, setScrapingAccountId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const { accounts, loading: accountsLoading, fetchAccounts, toggleScrapingEnabled } = useSocialAccounts({ filterByEntity: false });
  
  // Extract account IDs for useSocialPosts - this allows the hook to fetch posts
  const accountIds = useMemo(() => accounts.map(a => a.id), [accounts]);
  
  // Only fetch posts once we have account IDs
  const { totalEngagement, loading: postsLoading, refresh: refreshPosts } = useSocialPosts({ 
    accountIds: accountIds.length > 0 ? accountIds : undefined,
    filterByEntity: false,
    daysBack: 30,
    autoFetch: accountIds.length > 0,  // Only auto-fetch when we have accounts
  });

  // Calculate total posts from account postCount (more accurate than loaded posts)
  const totalPostCount = useMemo(() => {
    return accounts.reduce((sum, account) => sum + (account.postCount || 0), 0);
  }, [accounts]);

  const activeAccounts = accounts.filter((a: SocialAccount) => a.status === 'ACTIVE').length;
  const loading = accountsLoading;

  useEffect(() => {
    if (notification) {
      const timer = setTimeout(() => setNotification(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [notification]);

  const handleScrapeAccount = async (accountId: string) => {
    setScrapingAccountId(accountId);
    try {
      const response = await client.graphql({
        query: triggerSocialScrape,
        variables: { socialAccountId: accountId },
      }) as GraphQLResult<{ triggerSocialScrape: { success: boolean; message?: string; newPostsAdded?: number; postsFound?: number } }>;

      if ('data' in response && response.data?.triggerSocialScrape?.success) {
        const result = response.data.triggerSocialScrape;
        setNotification({
          type: 'success',
          message: `Found ${result.newPostsAdded || 0} new posts`
        });
        refreshPosts();
        fetchAccounts();
      } else {
        setNotification({ type: 'error', message: 'Failed to fetch posts' });
      }
    } catch (err) {
      console.error(err);
      setNotification({ type: 'error', message: 'Error triggering scrape' });
    } finally {
      setScrapingAccountId(null);
    }
  };

  const handleToggleScrapingEnabled = async (account: SocialAccount) => {
    try {
      await toggleScrapingEnabled(account);
      setNotification({ type: 'success', message: `Updated scraping for ${account.accountName}` });
    } catch {
      setNotification({ type: 'error', message: 'Failed to update scraping status' });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50 p-6">
      {notification && (
        <div className={`fixed top-4 right-4 z-50 p-4 rounded-xl shadow-lg flex items-center gap-3 ${notification.type === 'success' ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
          {notification.type === 'success' ? <CheckCircle className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          {notification.message}
        </div>
      )}

      {/* Header & Stats Section */}
      <div className="mb-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Social Dashboard</h1>
            <p className="text-slate-500 mt-1">Manage connected accounts and view analytics</p>
          </div>
          <Link to="/settings/social-accounts" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Account
          </Link>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-4 text-white">
            <div className="flex items-center gap-2 text-indigo-200">
              <Users className="w-4 h-4" />
              <span className="text-sm font-medium">Connected Accounts</span>
            </div>
            <p className="text-3xl font-bold mt-2">{accounts.length}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-200">
            <div className="flex items-center gap-2 text-slate-500">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-medium">Active</span>
            </div>
            <p className="text-3xl font-bold text-slate-800 mt-2">{activeAccounts}</p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-200">
            <div className="flex items-center gap-2 text-slate-500">
              <Calendar className="w-4 h-4 text-blue-500" />
              <span className="text-sm font-medium">Total Posts</span>
            </div>
            <p className="text-3xl font-bold text-slate-800 mt-2">
              {accountsLoading ? '...' : totalPostCount.toLocaleString()}
            </p>
          </div>
          <div className="bg-white rounded-2xl p-4 border border-slate-200">
            <div className="flex items-center gap-2 text-slate-500">
              <TrendingUp className="w-4 h-4 text-pink-500" />
              <span className="text-sm font-medium">Engagement (30d)</span>
            </div>
            <p className="text-3xl font-bold text-slate-800 mt-2">
              {postsLoading ? '...' : totalEngagement.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setViewMode('accounts')}
            className={`px-6 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${viewMode === 'accounts' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <Users className="w-4 h-4" /> Accounts
          </button>
          <button
            onClick={() => setViewMode('analytics')}
            className={`px-6 py-3 font-medium text-sm flex items-center gap-2 border-b-2 transition-colors ${viewMode === 'analytics' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
          >
            <TrendingUp className="w-4 h-4" /> Analytics
          </button>
        </div>
      </div>

      {/* Content Area */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-10 h-10 text-indigo-600 animate-spin" /></div>
      ) : (
        <>
          {viewMode === 'accounts' && (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {accounts.map((account: SocialAccount) => (
                <AccountCard
                  key={account.id}
                  account={account}
                  onScrape={handleScrapeAccount}
                  onToggleEnabled={handleToggleScrapingEnabled}
                  isLoading={scrapingAccountId === account.id}
                />
              ))}
              {accounts.length === 0 && (
                 <div className="col-span-full text-center py-12 text-slate-500">No accounts connected yet.</div>
              )}
            </div>
          )}

          {viewMode === 'analytics' && (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
              <TrendingUp className="w-16 h-16 text-slate-300 mx-auto" />
              <h3 className="text-xl font-semibold text-slate-700 mt-4">Analytics Coming Soon</h3>
              <p className="text-slate-500 mt-2">Insights and engagement trends will be available here.</p>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default SocialDashboard;