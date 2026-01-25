// src/components/social/SocialAccountTable.tsx
import React from 'react';
import { 
  PencilIcon, 
  ArrowPathIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  PauseIcon,
  PlayIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { Loader2, Facebook, Instagram, Database } from 'lucide-react';
import { SocialAccount } from '../../hooks/useSocialAccounts';

interface SocialAccountTableProps {
  accounts: SocialAccount[];
  loading: boolean;
  onEdit: (account: SocialAccount) => void;
  onDelete: (id: string) => void;
  onToggleScraping: (account: SocialAccount) => void;
  onTriggerScrape: (account: SocialAccount) => void;
  onFullSync?: (account: SocialAccount) => void;
  onRefreshLogo?: (account: SocialAccount) => void;
  scrapingAccountId: string | null;
  refreshingLogoAccountId?: string | null;
}

const StatusIcon: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { color: string; icon: React.ReactNode; title: string }> = {
    ACTIVE: { 
      color: 'text-green-600',
      icon: <CheckCircleIcon className="w-5 h-5" />,
      title: 'Active'
    },
    INACTIVE: { 
      color: 'text-gray-400',
      icon: <PauseIcon className="w-5 h-5" />,
      title: 'Inactive'
    },
    PENDING_VERIFICATION: { 
      color: 'text-yellow-500',
      icon: <ClockIcon className="w-5 h-5" />,
      title: 'Pending Verification'
    },
    ERROR: { 
      color: 'text-red-500',
      icon: <ExclamationCircleIcon className="w-5 h-5" />,
      title: 'Error'
    },
    RATE_LIMITED: { 
      color: 'text-orange-500',
      icon: <ExclamationTriangleIcon className="w-5 h-5" />,
      title: 'Rate Limited'
    },
  };

  const { color, icon, title } = config[status] || config.INACTIVE;

  return (
    <span className={color} title={title}>
      {icon}
    </span>
  );
};

const PlatformIcon: React.FC<{ platform: string }> = ({ platform }) => {
  switch (platform) {
    case 'FACEBOOK':
      return <Facebook className="w-4 h-4 text-blue-600" />;
    case 'INSTAGRAM':
      return <Instagram className="w-4 h-4 text-pink-600" />;
    default:
      return <div className="w-4 h-4 rounded-full bg-gray-200" />;
  }
};

// Extracted ActionButtons component for reuse
const ActionButtons: React.FC<{
  account: SocialAccount;
  isCurrentlyScraping: boolean;
  hasIncompleteSync: boolean;
  onToggleScraping: (account: SocialAccount) => void;
  onTriggerScrape: (account: SocialAccount) => void;
  onFullSync?: (account: SocialAccount) => void;
  onEdit: (account: SocialAccount) => void;
}> = ({
  account,
  isCurrentlyScraping,
  hasIncompleteSync,
  onToggleScraping,
  onTriggerScrape,
  onFullSync,
  onEdit,
}) => (
  <div className="flex items-center gap-1">
    {/* Scraping Toggle */}
    <button
      onClick={() => onToggleScraping(account)}
      className={`p-1.5 rounded-lg transition-colors ${
        account.isScrapingEnabled
          ? 'bg-green-100 text-green-600 hover:bg-green-200'
          : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
      }`}
      title={account.isScrapingEnabled ? 'Auto-scraping enabled' : 'Auto-scraping paused'}
    >
      {account.isScrapingEnabled ? (
        <PlayIcon className="w-4 h-4" />
      ) : (
        <PauseIcon className="w-4 h-4" />
      )}
    </button>

    {/* Fetch Posts */}
    <button
      onClick={() => onTriggerScrape(account)}
      disabled={isCurrentlyScraping || !account.isScrapingEnabled}
      className="p-1.5 text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      title="Fetch new posts"
    >
      {isCurrentlyScraping ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <ArrowPathIcon className="w-4 h-4" />
      )}
    </button>

    {/* Full Sync */}
    {onFullSync && (
      <button
        onClick={() => onFullSync(account)}
        disabled={isCurrentlyScraping || !account.isScrapingEnabled}
        className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          hasIncompleteSync
            ? 'text-green-600 bg-green-50 hover:bg-green-100'
            : account.hasFullHistory
              ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
              : 'text-blue-600 bg-blue-50 hover:bg-blue-100'
        }`}
        title={
          hasIncompleteSync 
            ? `Resume sync from ${new Date((account as any).fullSyncOldestPostDate).toLocaleDateString()}`
            : account.hasFullHistory 
              ? 'Re-sync full history' 
              : 'Fetch all historical posts'
        }
      >
        {hasIncompleteSync ? (
          <PlayIcon className="w-4 h-4" />
        ) : (
          <ArrowDownTrayIcon className="w-4 h-4" />
        )}
      </button>
    )}

    {/* Edit */}
    <button
      onClick={() => onEdit(account)}
      className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
      title="Edit account"
    >
      <PencilIcon className="w-4 h-4" />
    </button>
  </div>
);

export const SocialAccountTable: React.FC<SocialAccountTableProps> = ({
  accounts,
  loading,
  onEdit,
  onToggleScraping,
  onTriggerScrape,
  onFullSync,
  scrapingAccountId,
}) => {
  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString('en-AU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatNumber = (num?: number | null) => {
    if (num === undefined || num === null) return '-';
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const formatSchedule = (account: SocialAccount): string => {
    // Check if using daily fixed-time schedule
    const preferredHour = (account as any).preferredScrapeHourUTC;
    if (preferredHour !== null && preferredHour !== undefined && preferredHour >= 0) {
      // Convert UTC to AEST (UTC+10)
      let aestHour = preferredHour + 10;
      if (aestHour >= 24) aestHour -= 24;
      
      // Format as 12-hour time
      const period = aestHour >= 12 ? 'PM' : 'AM';
      const displayHour = aestHour === 0 ? 12 : aestHour > 12 ? aestHour - 12 : aestHour;
      
      return `Daily @ ${displayHour}${period}`;
    }
    
    // Fall back to frequency display
    const minutes = account.scrapeFrequencyMinutes || 60;
    if (minutes >= 1440) return `${Math.round(minutes / 1440)}d`;
    if (minutes >= 60) return `${Math.round(minutes / 60)}h`;
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8">
        <div className="flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          <span className="ml-3 text-gray-600">Loading accounts...</span>
        </div>
      </div>
    );
  }

  if (accounts.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-gray-100">
          <Facebook className="h-6 w-6 text-gray-400" />
        </div>
        <h3 className="mt-4 text-lg font-medium text-gray-900">No social accounts</h3>
        <p className="mt-2 text-sm text-gray-500">
          Get started by adding a Facebook or Instagram page to monitor.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Mobile Card Layout */}
      <div className="sm:hidden divide-y divide-gray-200">
        {accounts.map((account) => {
          const isCurrentlyScraping = scrapingAccountId === account.id;
          const hasIncompleteSync = !!(account as any).fullSyncOldestPostDate && !account.hasFullHistory;

          return (
            <div key={account.id} className="p-4 hover:bg-gray-50">
              {/* Top row: Avatar, Account Info, Status */}
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="flex-shrink-0 h-10 w-10 relative">
                  {account.profileImageUrl ? (
                    <img
                      src={account.profileImageUrl}
                      alt={account.accountName}
                      className="h-10 w-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white text-sm font-medium">
                      {account.accountName.charAt(0)}
                    </div>
                  )}
                  <div className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-0.5">
                    <PlatformIcon platform={account.platform} />
                  </div>
                </div>

                {/* Account Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {account.accountName}
                    </span>
                    {account.hasFullHistory && (
                      <span 
                        className="flex-shrink-0 inline-flex items-center px-1 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700"
                        title="Full history synced"
                      >
                        <Database className="w-3 h-3" />
                      </span>
                    )}
                    {hasIncompleteSync && (
                      <span 
                        className="flex-shrink-0 inline-flex items-center px-1 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700"
                        title={`Sync incomplete - stopped at ${new Date((account as any).fullSyncOldestPostDate).toLocaleDateString()}`}
                      >
                        <ClockIcon className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                  {account.accountHandle && (
                    <div className="text-xs text-gray-500 truncate">
                      @{account.accountHandle}
                    </div>
                  )}
                </div>

                {/* Status Icon */}
                <StatusIcon status={account.status} />
              </div>

              {/* Stats row */}
              <div className="mt-2 flex items-center gap-4 text-xs text-gray-500 ml-13">
                <span>{formatNumber(account.followerCount)} followers</span>
                <span>{formatNumber(account.postCount)} posts</span>
                <span>Last: {formatDate(account.lastScrapedAt)}</span>
              </div>

              {/* Actions row */}
              <div className="mt-3 flex items-center justify-between">
                <div className="text-xs text-gray-500">
                  {formatSchedule(account)}
                </div>
                <ActionButtons
                  account={account}
                  isCurrentlyScraping={isCurrentlyScraping}
                  hasIncompleteSync={hasIncompleteSync}
                  onToggleScraping={onToggleScraping}
                  onTriggerScrape={onTriggerScrape}
                  onFullSync={onFullSync}
                  onEdit={onEdit}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop Table Layout */}
      <table className="hidden sm:table min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Account
            </th>
            <th scope="col" className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-12">
              Status
            </th>
            <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Stats
            </th>
            <th scope="col" className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
              Last Fetched
            </th>
            <th scope="col" className="px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
              Auto
            </th>
            <th scope="col" className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {accounts.map((account) => {
            const isCurrentlyScraping = scrapingAccountId === account.id;
            
            // Check if this account has an incomplete full sync (can be resumed)
            const hasIncompleteSync = !!(account as any).fullSyncOldestPostDate && !account.hasFullHistory;
            
            return (
              <tr key={account.id} className="hover:bg-gray-50">
                {/* Account Info */}
                <td className="px-4 py-3">
                  <div className="flex items-center min-w-0">
                    <div className="flex-shrink-0 h-9 w-9 relative">
                      {account.profileImageUrl ? (
                        <img
                          src={account.profileImageUrl}
                          alt={account.accountName}
                          className="h-9 w-9 rounded-full object-cover"
                        />
                      ) : (
                        <div className="h-9 w-9 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white text-sm font-medium">
                          {account.accountName.charAt(0)}
                        </div>
                      )}
                      <div className="absolute -bottom-0.5 -right-0.5 bg-white rounded-full p-0.5">
                        <PlatformIcon platform={account.platform} />
                      </div>
                    </div>
                    <div className="ml-3 min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-medium text-gray-900 truncate">
                          {account.accountName}
                        </span>
                        {account.hasFullHistory && (
                          <span 
                            className="flex-shrink-0 inline-flex items-center px-1 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700"
                            title="Full history synced"
                          >
                            <Database className="w-3 h-3" />
                          </span>
                        )}
                        {hasIncompleteSync && (
                          <span 
                            className="flex-shrink-0 inline-flex items-center px-1 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700"
                            title={`Sync incomplete - stopped at ${new Date((account as any).fullSyncOldestPostDate).toLocaleDateString()}`}
                          >
                            <ClockIcon className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      {account.accountHandle && (
                        <div className="text-xs text-gray-500 truncate">
                          @{account.accountHandle}
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                {/* Status Icon */}
                <td className="px-2 py-3 text-center">
                  <StatusIcon status={account.status} />
                </td>

                {/* Stats */}
                <td className="px-3 py-3 text-right">
                  <div className="text-sm text-gray-900">
                    {formatNumber(account.followerCount)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatNumber(account.postCount)} posts
                  </div>
                </td>

                {/* Last Fetched - Hidden on smaller tablets */}
                <td className="px-3 py-3 hidden md:table-cell">
                  <div className="text-sm text-gray-900">
                    {formatDate(account.lastScrapedAt)}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatSchedule(account)}
                  </div>
                </td>

                {/* Scraping Toggle - Icon only */}
                <td className="px-2 py-3 text-center">
                  <button
                    onClick={() => onToggleScraping(account)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      account.isScrapingEnabled
                        ? 'bg-green-100 text-green-600 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                    }`}
                    title={account.isScrapingEnabled ? 'Auto-scraping enabled' : 'Auto-scraping paused'}
                  >
                    {account.isScrapingEnabled ? (
                      <PlayIcon className="w-4 h-4" />
                    ) : (
                      <PauseIcon className="w-4 h-4" />
                    )}
                  </button>
                </td>

                {/* Actions - Icons only */}
                <td className="px-3 py-3">
                  <div className="flex items-center justify-end gap-1">
                    {/* Fetch Posts */}
                    <button
                      onClick={() => onTriggerScrape(account)}
                      disabled={isCurrentlyScraping || !account.isScrapingEnabled}
                      className="p-1.5 text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      title="Fetch new posts"
                    >
                      {isCurrentlyScraping ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ArrowPathIcon className="w-4 h-4" />
                      )}
                    </button>

                    {/* Full Sync */}
                    {onFullSync && (
                      <button
                        onClick={() => onFullSync(account)}
                        disabled={isCurrentlyScraping || !account.isScrapingEnabled}
                        className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                          hasIncompleteSync
                            ? 'text-green-600 bg-green-50 hover:bg-green-100'
                            : account.hasFullHistory
                              ? 'text-amber-600 bg-amber-50 hover:bg-amber-100'
                              : 'text-blue-600 bg-blue-50 hover:bg-blue-100'
                        }`}
                        title={
                          hasIncompleteSync 
                            ? `Resume sync from ${new Date((account as any).fullSyncOldestPostDate).toLocaleDateString()}`
                            : account.hasFullHistory 
                              ? 'Re-sync full history' 
                              : 'Fetch all historical posts'
                        }
                      >
                        {hasIncompleteSync ? (
                          <PlayIcon className="w-4 h-4" />
                        ) : (
                          <ArrowDownTrayIcon className="w-4 h-4" />
                        )}
                      </button>
                    )}

                    {/* Edit */}
                    <button
                      onClick={() => onEdit(account)}
                      className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                      title="Edit account"
                    >
                      <PencilIcon className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

export default SocialAccountTable;