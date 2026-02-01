// src/components/social/SocialAccountModal.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Facebook, 
  Instagram, 
  Twitter, 
  Linkedin,
  Loader2,
  AlertCircle,
  Link2,
  Clock,
  Calendar,
  RefreshCw,
  Power,
  Trash2,
  Download,
  Image as ImageIcon
} from 'lucide-react';
import { SocialAccount, CreateSocialAccountInput, UpdateSocialAccountInput, SocialPlatform } from '../../hooks/useSocialAccounts';

interface Entity {
  id: string;
  entityName: string;
}

interface Venue {
  id: string;
  name: string;
}

interface SocialAccountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: CreateSocialAccountInput | UpdateSocialAccountInput & { fetchLogo?: boolean }) => Promise<void>;
  onDelete?: (id: string, version?: number) => Promise<void>;
  onRefreshLogo?: (account: SocialAccount) => Promise<string | null>;
  account?: SocialAccount | null;
  entities: Entity[];
  venues: Venue[];
}

type Platform = 'FACEBOOK' | 'INSTAGRAM' | 'TWITTER' | 'LINKEDIN';
type ScheduleMode = 'disabled' | 'frequency' | 'daily';

const PLATFORM_CONFIG: Record<Platform, { 
  name: string; 
  icon: React.ElementType; 
  color: string;
  placeholder: string;
  urlPattern: RegExp;
}> = {
  FACEBOOK: {
    name: 'Facebook',
    icon: Facebook,
    color: 'border-blue-500 bg-blue-50 text-blue-700',
    placeholder: 'https://facebook.com/yourpage',
    urlPattern: /^https?:\/\/(www\.)?(facebook\.com|fb\.com)\/.+$/,
  },
  INSTAGRAM: {
    name: 'Instagram',
    icon: Instagram,
    color: 'border-pink-500 bg-pink-50 text-pink-700',
    placeholder: 'https://instagram.com/yourpage',
    urlPattern: /^https?:\/\/(www\.)?instagram\.com\/.+$/,
  },
  TWITTER: {
    name: 'Twitter/X',
    icon: Twitter,
    color: 'border-sky-500 bg-sky-50 text-sky-700',
    placeholder: 'https://twitter.com/yourpage',
    urlPattern: /^https?:\/\/(www\.)?(twitter\.com|x\.com)\/.+$/,
  },
  LINKEDIN: {
    name: 'LinkedIn',
    icon: Linkedin,
    color: 'border-blue-700 bg-blue-50 text-blue-800',
    placeholder: 'https://linkedin.com/company/yourpage',
    urlPattern: /^https?:\/\/(www\.)?linkedin\.com\/(company|in)\/.+$/,
  },
};

function aestHourToUTC(aestHour: number): number {
  const offset = 10;
  let utcHour = aestHour - offset;
  if (utcHour < 0) utcHour += 24;
  return utcHour;
}

function utcHourToAEST(utcHour: number): number {
  const offset = 10;
  let aestHour = utcHour + offset;
  if (aestHour >= 24) aestHour -= 24;
  return aestHour;
}

function formatHour(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:00 ${period}`;
}

/**
 * Check if a URL is a Facebook CDN URL (which expires)
 */
function isFacebookCdnUrl(url: string): boolean {
  if (!url) return false;
  return (
    url.includes('fbcdn.net') ||
    url.includes('fbsbx.com') ||
    url.includes('facebook.com/photo') ||
    url.includes('scontent')
  );
}

/**
 * Check if a URL is an S3 URL (permanent)
 */
function isS3Url(url: string): boolean {
  if (!url) return false;
  return url.includes('.s3.') && url.includes('amazonaws.com');
}

export const SocialAccountModal: React.FC<SocialAccountModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  onRefreshLogo,
  account,
  entities,
  venues,
}) => {
  const [platform, setPlatform] = useState<Platform>('FACEBOOK');
  const [accountUrl, setAccountUrl] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountHandle, setAccountHandle] = useState('');
  const [entityId, setEntityId] = useState('');
  const [venueId, setVenueId] = useState('');
  const [scrapeFrequency, setScrapeFrequency] = useState(60);
  const [isLoading, setIsLoading] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);
  
  // Logo state
  const [isRefreshingLogo, setIsRefreshingLogo] = useState(false);
  const [logoRefreshMessage, setLogoRefreshMessage] = useState<string | null>(null);
  
  // Scheduling state
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('frequency');
  const [preferredHourAEST, setPreferredHourAEST] = useState(6);

  const isEditing = !!account;

  // Get the current logo URL from account
  // Note: Lambda stores in profileImageUrl field
  const currentLogoUrl = (account as any)?.profileImageUrl || null;
  const logoIsInS3 = currentLogoUrl ? isS3Url(currentLogoUrl) : false;
  const logoNeedsRefresh = currentLogoUrl && isFacebookCdnUrl(currentLogoUrl);

  const hourOptions = useMemo(() => {
    return Array.from({ length: 24 }, (_, i) => ({
      value: i,
      label: formatHour(i),
    }));
  }, []);

  // Reset form when modal opens/closes or account changes
  useEffect(() => {
    if (isOpen) {
      if (account) {
        setPlatform(account.platform);
        setAccountUrl(account.accountUrl);
        setAccountName(account.accountName);
        setAccountHandle(account.accountHandle || '');
        setEntityId(account.entityId || '');
        setVenueId(account.venueId || '');
        setScrapeFrequency(account.scrapeFrequencyMinutes || 60);
        
        if (!account.isScrapingEnabled) {
          setScheduleMode('disabled');
        } else if (account.preferredScrapeHourUTC !== null && account.preferredScrapeHourUTC !== undefined) {
          setScheduleMode('daily');
          setPreferredHourAEST(utcHourToAEST(account.preferredScrapeHourUTC));
        } else {
          setScheduleMode('frequency');
        }
      } else {
        setPlatform('FACEBOOK');
        setAccountUrl('');
        setAccountName('');
        setAccountHandle('');
        setEntityId('');
        setVenueId('');
        setScrapeFrequency(60);
        setScheduleMode('frequency');
        setPreferredHourAEST(6);
      }
      setError(null);
      setUrlError(null);
      setShowDeleteConfirm(false);
      setIsDeleting(false);
      setLogoRefreshMessage(null);
    }
  }, [isOpen, account]);

  // Validate URL on change
  useEffect(() => {
    if (accountUrl) {
      const config = PLATFORM_CONFIG[platform];
      if (!config.urlPattern.test(accountUrl)) {
        setUrlError(`Please enter a valid ${config.name} URL`);
      } else {
        setUrlError(null);
      }
    } else {
      setUrlError(null);
    }
  }, [accountUrl, platform]);

  // Auto-extract handle from URL
  useEffect(() => {
    if (accountUrl && !isEditing) {
      try {
        const url = new URL(accountUrl);
        const pathParts = url.pathname.split('/').filter(Boolean);
        if (pathParts.length > 0) {
          const handle = pathParts.find(part => 
            !['pages', 'company', 'in', 'profile.php'].includes(part.toLowerCase())
          );
          if (handle && !accountHandle) {
            setAccountHandle(handle);
            if (!accountName) {
              setAccountName(handle.replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()));
            }
          }
        }
      } catch {
        // Invalid URL, ignore
      }
    }
  }, [accountUrl, isEditing, accountHandle, accountName]);

  // Handle logo refresh for existing accounts
  const handleRefreshLogo = async () => {
    if (!account || !onRefreshLogo) return;
    
    setIsRefreshingLogo(true);
    setLogoRefreshMessage(null);
    setError(null);
    
    try {
      const newLogoUrl = await onRefreshLogo(account);
      if (newLogoUrl) {
        setLogoRefreshMessage('Logo updated successfully!');
      } else {
        setLogoRefreshMessage('Could not fetch logo. The page may be private.');
      }
    } catch (err) {
      setError('Failed to refresh logo. Please try again.');
    } finally {
      setIsRefreshingLogo(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (urlError) {
      setError(urlError);
      return;
    }

    if (!accountUrl || !accountName) {
      setError('Please fill in all required fields');
      return;
    }

    setIsLoading(true);

    try {
      const isScrapingEnabled = scheduleMode !== 'disabled';
      const preferredScrapeHourUTC = scheduleMode === 'daily' 
        ? aestHourToUTC(preferredHourAEST) 
        : null;

      if (isEditing && account) {
        await onSave({
          id: account.id,
          accountName,
          accountHandle: accountHandle || undefined,
          entityId: entityId || undefined,
          venueId: venueId || undefined,
          scrapeFrequencyMinutes: scrapeFrequency,
          isScrapingEnabled,
          preferredScrapeHourUTC,
          _version: account._version,
        } as UpdateSocialAccountInput);
      } else {
        // For new accounts, fetchLogo: true triggers syncPageInfo after creation
        await onSave({
          platform: platform as SocialPlatform,
          accountUrl,
          accountName,
          accountHandle: accountHandle || undefined,
          entityId: entityId || undefined,
          venueId: venueId || undefined,
          scrapeFrequencyMinutes: scrapeFrequency,
          isScrapingEnabled,
          preferredScrapeHourUTC,
          fetchLogo: true, // This triggers logo sync after creation
        } as any);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save account');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!account || !onDelete) return;
    
    setIsDeleting(true);
    setError(null);
    
    try {
      await onDelete(account.id, account._version);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete account');
      setShowDeleteConfirm(false);
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">
              {isEditing ? 'Edit Social Account' : 'Add Social Account'}
            </h2>
            <p className="text-indigo-200 text-sm mt-0.5">
              {isEditing ? 'Update account settings' : 'Connect a public social media page'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Platform Selection - Only show for new accounts */}
          {!isEditing && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Platform
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(Object.entries(PLATFORM_CONFIG) as [Platform, typeof PLATFORM_CONFIG[Platform]][])
                  .slice(0, 2)
                  .map(([key, config]) => {
                    const Icon = config.icon;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPlatform(key)}
                        className={`flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 transition-all ${
                          platform === key
                            ? config.color
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <Icon className="w-5 h-5" />
                        <span className="font-medium">{config.name}</span>
                      </button>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Account URL */}
          <div>
            <label htmlFor="accountUrl" className="block text-sm font-semibold text-gray-700 mb-2">
              {isEditing ? 'Account URL' : 'Page URL'} <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="url"
                id="accountUrl"
                value={accountUrl}
                onChange={(e) => setAccountUrl(e.target.value)}
                disabled={isEditing}
                placeholder={PLATFORM_CONFIG[platform].placeholder}
                className={`w-full pl-10 pr-4 py-3 rounded-xl border transition-all ${
                  urlError
                    ? 'border-red-300 focus:ring-red-500 focus:border-red-500'
                    : 'border-gray-300 focus:ring-indigo-500 focus:border-indigo-500'
                } ${isEditing ? 'bg-gray-50 cursor-not-allowed' : ''}`}
              />
            </div>
            {urlError && (
              <p className="mt-1 text-sm text-red-600">{urlError}</p>
            )}
          </div>

          {/* Account Name */}
          <div>
            <label htmlFor="accountName" className="block text-sm font-semibold text-gray-700 mb-2">
              Display Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="accountName"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g., Crown Melbourne Poker"
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            />
          </div>

          {/* Account Handle */}
          <div>
            <label htmlFor="accountHandle" className="block text-sm font-semibold text-gray-700 mb-2">
              Handle / Username
            </label>
            <input
              type="text"
              id="accountHandle"
              value={accountHandle}
              onChange={(e) => setAccountHandle(e.target.value)}
              placeholder="e.g., @crownpoker"
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            />
          </div>

          {/* ============================================ */}
          {/* LOGO SECTION - Only for existing accounts */}
          {/* ============================================ */}
          {isEditing && (
            <div className="border-t pt-5">
              <label className="block text-sm font-semibold text-gray-700 mb-3">
                Profile Picture
              </label>
              
              <div className="flex items-start gap-4">
                {/* Logo Preview */}
                <div className="flex-shrink-0">
                  {currentLogoUrl ? (
                    <div className="relative">
                      <img
                        src={currentLogoUrl}
                        alt="Account logo"
                        className="w-16 h-16 rounded-xl object-cover border-2 border-gray-200"
                        onError={(e) => {
                          (e.target as HTMLImageElement).style.display = 'none';
                        }}
                      />
                      {logoIsInS3 && (
                        <div className="absolute -bottom-1 -right-1 p-0.5 bg-green-500 text-white rounded-full" title="Stored in S3">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                      {logoNeedsRefresh && (
                        <div className="absolute -bottom-1 -right-1 p-0.5 bg-yellow-500 text-white rounded-full" title="Logo URL may expire">
                          <AlertCircle className="w-3 h-3" />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
                      <ImageIcon className="w-6 h-6 text-gray-400" />
                    </div>
                  )}
                </div>

                {/* Logo Options */}
                <div className="flex-1 space-y-2">
                  {onRefreshLogo && (
                    <button
                      type="button"
                      onClick={handleRefreshLogo}
                      disabled={isRefreshingLogo}
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
                    >
                      {isRefreshingLogo ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Fetching...
                        </>
                      ) : (
                        <>
                          <Download className="w-4 h-4" />
                          {currentLogoUrl ? 'Refresh Logo' : 'Fetch Logo'}
                        </>
                      )}
                    </button>
                  )}

                  {logoRefreshMessage && (
                    <p className={`text-xs ${logoRefreshMessage.includes('success') ? 'text-green-600' : 'text-yellow-600'}`}>
                      {logoRefreshMessage}
                    </p>
                  )}

                  {logoNeedsRefresh && (
                    <p className="text-xs text-yellow-700 bg-yellow-50 p-2 rounded-lg">
                      ⚠️ Current logo URL may expire. Click "Refresh Logo" to store permanently.
                    </p>
                  )}

                  {logoIsInS3 && (
                    <p className="text-xs text-green-600">
                      ✓ Logo is stored permanently in S3
                    </p>
                  )}

                  {!currentLogoUrl && !isRefreshingLogo && (
                    <p className="text-xs text-gray-500">
                      Click "Fetch Logo" to download the page's profile picture
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Entity Selection */}
          <div>
            <label htmlFor="entityId" className="block text-sm font-semibold text-gray-700 mb-2">
              Entity
            </label>
            <select
              id="entityId"
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            >
              <option value="">No entity link</option>
              {entities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.entityName}
                </option>
              ))}
            </select>
          </div>

          {/* Venue Selection */}
          <div>
            <label htmlFor="venueId" className="block text-sm font-semibold text-gray-700 mb-2">
              Venue
            </label>
            <select
              id="venueId"
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            >
              <option value="">No venue link</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          </div>

          {/* Scraping Schedule Section */}
          <div className="border-t pt-5">
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Scraping Schedule
            </label>
            
            <div className="space-y-3">
              {/* Disabled */}
              <label 
                className={`flex items-start gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all ${
                  scheduleMode === 'disabled' 
                    ? 'border-gray-400 bg-gray-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="scheduleMode"
                  checked={scheduleMode === 'disabled'}
                  onChange={() => setScheduleMode('disabled')}
                  className="mt-0.5 w-4 h-4 text-gray-600"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Power className="w-4 h-4 text-gray-500" />
                    <span className="font-medium text-gray-700">Disabled</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Don't automatically scrape this account</p>
                </div>
              </label>

              {/* Frequency-based */}
              <label 
                className={`flex items-start gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all ${
                  scheduleMode === 'frequency' 
                    ? 'border-indigo-500 bg-indigo-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="scheduleMode"
                  checked={scheduleMode === 'frequency'}
                  onChange={() => setScheduleMode('frequency')}
                  className="mt-0.5 w-4 h-4 text-indigo-600"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <RefreshCw className="w-4 h-4 text-indigo-600" />
                    <span className="font-medium text-gray-700">Check periodically</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Scrape at regular intervals throughout the day</p>
                  
                  {scheduleMode === 'frequency' && (
                    <select
                      value={scrapeFrequency}
                      onChange={(e) => setScrapeFrequency(Number(e.target.value))}
                      className="mt-2 w-full px-3 py-2 rounded-lg border border-indigo-200 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <option value={60}>Every hour</option>
                      <option value={120}>Every 2 hours</option>
                      <option value={360}>Every 6 hours</option>
                      <option value={720}>Every 12 hours</option>
                      <option value={1440}>Every 24 hours</option>
                    </select>
                  )}
                </div>
              </label>

              {/* Daily at specific time */}
              <label 
                className={`flex items-start gap-3 p-3 border-2 rounded-xl cursor-pointer transition-all ${
                  scheduleMode === 'daily' 
                    ? 'border-purple-500 bg-purple-50' 
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="scheduleMode"
                  checked={scheduleMode === 'daily'}
                  onChange={() => setScheduleMode('daily')}
                  className="mt-0.5 w-4 h-4 text-purple-600"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-purple-600" />
                    <span className="font-medium text-gray-700">Daily at specific time</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">Scrape once per day at a set hour (AEST)</p>
                  
                  {scheduleMode === 'daily' && (
                    <div className="mt-2 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-purple-500" />
                      <select
                        value={preferredHourAEST}
                        onChange={(e) => setPreferredHourAEST(Number(e.target.value))}
                        className="flex-1 px-3 py-2 rounded-lg border border-purple-200 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {hourOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label} AEST
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </label>
            </div>

            <p className="mt-3 text-xs text-gray-500">
              {scheduleMode === 'disabled' && 'You can still trigger manual scrapes from the account details.'}
              {scheduleMode === 'frequency' && `Posts will be fetched automatically every ${scrapeFrequency >= 60 ? `${scrapeFrequency / 60} hour${scrapeFrequency > 60 ? 's' : ''}` : `${scrapeFrequency} minutes`}.`}
              {scheduleMode === 'daily' && `Posts will be fetched once daily at ${formatHour(preferredHourAEST)} AEST.`}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            {isEditing && onDelete && (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isLoading || isDeleting}
                className="p-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-all disabled:opacity-50"
                title="Delete account"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            )}
            
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || isDeleting || !!urlError}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isEditing ? 'Saving...' : 'Adding...'}
                </>
              ) : (
                isEditing ? 'Save Changes' : 'Add Account'
              )}
            </button>
          </div>

          {/* Delete Confirmation */}
          {showDeleteConfirm && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-800 font-medium mb-3">
                Are you sure you want to delete this account? This will also delete all associated posts.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={isDeleting}
                  className="flex-1 py-2 px-3 rounded-lg border border-gray-300 text-gray-700 text-sm font-medium hover:bg-white transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className="flex-1 py-2 px-3 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      Delete Account
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default SocialAccountModal;