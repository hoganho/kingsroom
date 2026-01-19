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
  Trash2
} from 'lucide-react';
import { SocialAccount, CreateSocialAccountInput, UpdateSocialAccountInput } from '../../hooks/useSocialAccounts';

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
  onSave: (data: CreateSocialAccountInput | UpdateSocialAccountInput) => Promise<void>;
  onDelete?: (id: string, version?: number) => Promise<void>;
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

/**
 * Convert AEST hour (0-23) to UTC hour
 * AEST is UTC+10 (AEDT is UTC+11 during daylight saving)
 * For simplicity, we use UTC+10 (standard time)
 */
function aestHourToUTC(aestHour: number): number {
  const offset = 10; // AEST offset (use 11 for AEDT)
  let utcHour = aestHour - offset;
  if (utcHour < 0) utcHour += 24;
  return utcHour;
}

/**
 * Convert UTC hour (0-23) to AEST hour
 */
function utcHourToAEST(utcHour: number): number {
  const offset = 10; // AEST offset
  let aestHour = utcHour + offset;
  if (aestHour >= 24) aestHour -= 24;
  return aestHour;
}

/**
 * Format hour for display (e.g., "6:00 AM")
 */
function formatHour(hour: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${displayHour}:00 ${period}`;
}

export const SocialAccountModal: React.FC<SocialAccountModalProps> = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
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
  
  // New scheduling state
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('frequency');
  const [preferredHourAEST, setPreferredHourAEST] = useState(6); // Default 6 AM AEST

  const isEditing = !!account;

  // Generate hour options for the dropdown
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
        
        // Determine schedule mode from account data
        if (!account.isScrapingEnabled) {
          setScheduleMode('disabled');
        } else if (account.preferredScrapeHourUTC !== null && account.preferredScrapeHourUTC !== undefined) {
          setScheduleMode('daily');
          setPreferredHourAEST(utcHourToAEST(account.preferredScrapeHourUTC));
        } else {
          setScheduleMode('frequency');
        }
      } else {
        // Reset to defaults for new account
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
          // Skip 'pages', 'company', 'in' prefixes
          const handle = pathParts.find(part => 
            !['pages', 'company', 'in', 'profile.php'].includes(part.toLowerCase())
          );
          if (handle && !accountHandle) {
            setAccountHandle(handle);
            // Also set name if empty
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
      // Determine scraping settings based on schedule mode
      const isScrapingEnabled = scheduleMode !== 'disabled';
      
      // Only include preferredScrapeHourUTC if using daily mode, otherwise null to clear it
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
        await onSave({
          platform,
          accountUrl,
          accountName,
          accountHandle: accountHandle || undefined,
          entityId: entityId || undefined,
          venueId: venueId || undefined,
          scrapeFrequencyMinutes: scrapeFrequency,
          isScrapingEnabled,
          preferredScrapeHourUTC,
        } as CreateSocialAccountInput);
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
                  .slice(0, 2) // Only Facebook and Instagram for now
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
                            : 'border-gray-200 hover:border-gray-300 text-gray-600'
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

          {/* Platform badge for editing */}
          {isEditing && (
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-xl">
              {(() => {
                const Icon = PLATFORM_CONFIG[platform].icon;
                return (
                  <>
                    <Icon className="w-5 h-5" />
                    <span className="font-medium text-gray-700">{PLATFORM_CONFIG[platform].name}</span>
                  </>
                );
              })()}
            </div>
          )}

          {/* Account URL - Only for new accounts */}
          {!isEditing && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Page URL <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="url"
                  value={accountUrl}
                  onChange={(e) => setAccountUrl(e.target.value)}
                  placeholder={PLATFORM_CONFIG[platform].placeholder}
                  className={`w-full pl-10 pr-4 py-3 rounded-xl border transition-all focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${
                    urlError ? 'border-red-300 bg-red-50' : 'border-gray-300'
                  }`}
                  required
                />
              </div>
              {urlError && (
                <p className="mt-1.5 text-sm text-red-600">{urlError}</p>
              )}
            </div>
          )}

          {/* Display Name */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Display Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g., Kings Room Poker"
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              required
            />
          </div>

          {/* Handle */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Handle / Username
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">@</span>
              <input
                type="text"
                value={accountHandle}
                onChange={(e) => setAccountHandle(e.target.value)}
                placeholder="kingsroompoker"
                className="w-full pl-8 pr-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              />
            </div>
          </div>

          {/* Entity Selection */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Link to Entity
            </label>
            <select
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
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
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Link to Venue
            </label>
            <select
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            >
              <option value="">No venue link</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          </div>

          {/* ============================================ */}
          {/* SCRAPING SCHEDULE SECTION */}
          {/* ============================================ */}
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

            {/* Schedule explanation */}
            <p className="mt-3 text-xs text-gray-500">
              {scheduleMode === 'disabled' && 'You can still trigger manual scrapes from the account details.'}
              {scheduleMode === 'frequency' && `Posts will be fetched automatically every ${scrapeFrequency >= 60 ? `${scrapeFrequency / 60} hour${scrapeFrequency > 60 ? 's' : ''}` : `${scrapeFrequency} minutes`}.`}
              {scheduleMode === 'daily' && `Posts will be fetched once daily at ${formatHour(preferredHourAEST)} AEST.`}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            {/* Delete button - only shown when editing */}
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