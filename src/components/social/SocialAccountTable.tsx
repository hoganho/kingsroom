// src/components/social/SocialAccountTable.tsx
import React from 'react';
import { 
  PencilIcon, 
  TrashIcon, 
  ArrowPathIcon,
  ArrowDownTrayIcon,
  CheckCircleIcon,
  ExclamationCircleIcon,
  ClockIcon,
  PauseIcon,
  PlayIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';
import { Loader2, Facebook, Instagram, Database, RefreshCw } from 'lucide-react';
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

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const config: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
    ACTIVE: { 
      bg: 'bg-green-100', 
      text: 'text-green-800',
      icon: <CheckCircleIcon className="w-4 h-4" />
    },
    INACTIVE: { 
      bg: 'bg-gray-100', 
      text: 'text-gray-800',
      icon: <PauseIcon className="w-4 h-4" />
    },
    PENDING_VERIFICATION: { 
      bg: 'bg-yellow-100', 
      text: 'text-yellow-800',
      icon: <ClockIcon className="w-4 h-4" />
    },
    ERROR: { 
      bg: 'bg-red-100', 
      text: 'text-red-800',
      icon: <ExclamationCircleIcon className="w-4 h-4" />
    },
    RATE_LIMITED: { 
      bg: 'bg-orange-100', 
      text: 'text-orange-800',
      icon: <ExclamationTriangleIcon className="w-4 h-4" />
    },
  };

  const { bg, text, icon } = config[status] || config.INACTIVE;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${bg} ${text}`}>
      {icon}
      {status.replace(/_/g, ' ')}
    </span>
  );
};

const PlatformIcon: React.FC<{ platform: string }> = ({ platform }) => {
  switch (platform) {
    case 'FACEBOOK':
      return <Facebook className="w-5 h-5 text-blue-600" />;
    case 'INSTAGRAM':
      return <Instagram className="w-5 h-5 text-pink-600" />;
    default:
      return <div className="w-5 h-5 rounded-full bg-gray-200" />;
  }
};

export const SocialAccountTable: React.FC<SocialAccountTableProps> = ({
  accounts,
  loading,
  onEdit,
  onDelete,
  onToggleScraping,
  onTriggerScrape,
  onFullSync,
  onRefreshLogo,
  scrapingAccountId,
  refreshingLogoAccountId,
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
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Account
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Stats
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Last Fetched
              </th>
              <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Scraping
              </th>
              <th scope="col" className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {accounts.map((account) => {
              const isCurrentlyScraping = scrapingAccountId === account.id;
              const isRefreshingLogo = refreshingLogoAccountId === account.id;
              
              // Check if this account has an incomplete full sync (can be resumed)
              const hasIncompleteSync = !!(account as any).fullSyncOldestPostDate && !account.hasFullHistory;
              
              return (
                <tr key={account.id} className="hover:bg-gray-50">
                  {/* Account Info */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10 relative">
                        {account.profileImageUrl ? (
                          <img
                            src={account.profileImageUrl}
                            alt={account.accountName}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-gray-700 to-gray-800 flex items-center justify-center text-white font-medium">
                            {account.accountName.charAt(0)}
                          </div>
                        )}
                        <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5">
                          <PlatformIcon platform={account.platform} />
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-medium text-gray-900">
                            {account.accountName}
                          </div>
                          {account.hasFullHistory && (
                            <span 
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700"
                              title="Full history synced"
                            >
                              <Database className="w-3 h-3 mr-0.5" />
                              Full
                            </span>
                          )}
                          {hasIncompleteSync && (
                            <span 
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-700"
                              title={`Sync incomplete - stopped at ${new Date((account as any).fullSyncOldestPostDate).toLocaleDateString()}`}
                            >
                              <ClockIcon className="w-3 h-3 mr-0.5" />
                              Partial
                            </span>
                          )}
                        </div>
                        {account.accountHandle && (
                          <div className="text-sm text-gray-500">
                            @{account.accountHandle}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge status={account.status} />
                    {account.lastErrorMessage && (
                      <p className="mt-1 text-xs text-red-500 max-w-xs truncate" title={account.lastErrorMessage}>
                        {account.lastErrorMessage}
                      </p>
                    )}
                  </td>

                  {/* Stats */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      <span className="font-medium">{formatNumber(account.followerCount)}</span>
                      <span className="text-gray-500"> followers</span>
                    </div>
                    <div className="text-sm text-gray-500">
                      {formatNumber(account.postCount)} posts stored
                    </div>
                  </td>

                  {/* Last Fetched */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {formatDate(account.lastScrapedAt)}
                    </div>
                    <div className="text-xs text-gray-500">
                      Every {account.scrapeFrequencyMinutes || 60} min
                    </div>
                  </td>

                  {/* Scraping Toggle */}
                  <td className="px-6 py-4 whitespace-nowrap">
                    <button
                      onClick={() => onToggleScraping(account)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                        account.isScrapingEnabled
                          ? 'bg-green-100 text-green-700 hover:bg-green-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      {account.isScrapingEnabled ? (
                        <>
                          <PlayIcon className="w-4 h-4" />
                          Enabled
                        </>
                      ) : (
                        <>
                          <PauseIcon className="w-4 h-4" />
                          Paused
                        </>
                      )}
                    </button>
                  </td>

                  {/* Actions */}
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      {/* Fetch Posts (Incremental) */}
                      <button
                        onClick={() => onTriggerScrape(account)}
                        disabled={isCurrentlyScraping || !account.isScrapingEnabled}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        title="Fetch new posts since last sync"
                      >
                        {isCurrentlyScraping ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Fetching...
                          </>
                        ) : (
                          <>
                            <ArrowPathIcon className="w-4 h-4" />
                            Fetch
                          </>
                        )}
                      </button>

                      {/* Full Sync / Resume Sync Button */}
                      {onFullSync && (
                        <button
                          onClick={() => onFullSync(account)}
                          disabled={isCurrentlyScraping || !account.isScrapingEnabled}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
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
                                ? 'Full history already synced - click to re-sync' 
                                : 'Fetch all historical posts'
                          }
                        >
                          {hasIncompleteSync ? (
                            <>
                              <PlayIcon className="w-4 h-4" />
                              Resume Sync
                            </>
                          ) : (
                            <>
                              <ArrowDownTrayIcon className="w-4 h-4" />
                              {account.hasFullHistory ? 'Re-sync' : 'Full Sync'}
                            </>
                          )}
                        </button>
                      )}

                      {/* Refresh Logo Button */}
                      {onRefreshLogo && (
                        <button
                          onClick={() => onRefreshLogo(account)}
                          disabled={isRefreshingLogo || isCurrentlyScraping}
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-sm font-medium text-purple-600 bg-purple-50 rounded-lg hover:bg-purple-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          title="Refresh logo from Facebook"
                        >
                          {isRefreshingLogo ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
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

                      {/* Delete */}
                      <button
                        onClick={() => onDelete(account.id)}
                        className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                        title="Delete account"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SocialAccountTable;