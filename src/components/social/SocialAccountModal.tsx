// src/components/social/SocialAccountModal.tsx
import React, { useState, useEffect } from 'react';
import { 
  X, 
  Facebook, 
  Instagram, 
  Twitter, 
  Linkedin,
  Loader2,
  AlertCircle,
  Link2
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
  account?: SocialAccount | null;
  entities: Entity[];
  venues: Venue[];
}

type Platform = 'FACEBOOK' | 'INSTAGRAM' | 'TWITTER' | 'LINKEDIN';

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

export const SocialAccountModal: React.FC<SocialAccountModalProps> = ({
  isOpen,
  onClose,
  onSave,
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
  const [error, setError] = useState<string | null>(null);
  const [urlError, setUrlError] = useState<string | null>(null);

  const isEditing = !!account;

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
      } else {
        setPlatform('FACEBOOK');
        setAccountUrl('');
        setAccountName('');
        setAccountHandle('');
        setEntityId('');
        setVenueId('');
        setScrapeFrequency(60);
      }
      setError(null);
      setUrlError(null);
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
      if (isEditing && account) {
        await onSave({
          id: account.id,
          accountName,
          accountHandle: accountHandle || undefined,
          entityId: entityId || undefined,
          venueId: venueId || undefined,
          scrapeFrequencyMinutes: scrapeFrequency,
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
        } as CreateSocialAccountInput);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save account');
    } finally {
      setIsLoading(false);
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

          {/* Scrape Frequency */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Check for new posts every
            </label>
            <select
              value={scrapeFrequency}
              onChange={(e) => setScrapeFrequency(Number(e.target.value))}
              className="w-full px-4 py-3 rounded-xl border border-gray-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            >
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
              <option value={60}>1 hour</option>
              <option value={120}>2 hours</option>
              <option value={360}>6 hours</option>
              <option value={720}>12 hours</option>
              <option value={1440}>24 hours</option>
            </select>
            <p className="mt-1.5 text-xs text-gray-500">
              Posts will be fetched automatically at this interval when enabled.
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading || !!urlError}
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
        </form>
      </div>
    </div>
  );
};

export default SocialAccountModal;
