// src/pages/social/SocialPulse.tsx
import React, { useState, useEffect } from 'react';
import { 
  Facebook, 
  Instagram, 
  RefreshCw, 
  Plus, 
  Search,
  Link2,
  ExternalLink,
  Heart,
  MessageCircle,
  Share2,
  Clock,
  AlertCircle,
  CheckCircle,
  Pause,
  Play,
  Settings,
  TrendingUp,
  Users,
  Calendar,
  MoreVertical,
  Loader2
} from 'lucide-react';
import { useEntity } from '../../contexts/EntityContext';

// Types
interface SocialAccount {
  id: string;
  platform: 'FACEBOOK' | 'INSTAGRAM' | 'TWITTER' | 'LINKEDIN';
  platformAccountId: string;
  accountName: string;
  accountHandle?: string;
  accountUrl: string;
  profileImageUrl?: string;
  followerCount?: number;
  postCount?: number;
  status: 'ACTIVE' | 'INACTIVE' | 'PENDING_VERIFICATION' | 'ERROR' | 'RATE_LIMITED';
  isScrapingEnabled: boolean;
  lastScrapedAt?: string;
  lastSuccessfulScrapeAt?: string;
  consecutiveFailures: number;
  lastErrorMessage?: string;
  entityId?: string;
  venueId?: string;
  venue?: { id: string; name: string };
  entity?: { id: string; entityName: string };
}

interface SocialPost {
  id: string;
  platformPostId: string;
  postUrl?: string;
  postType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'LINK' | 'EVENT' | 'ALBUM' | 'LIVE';
  content?: string;
  contentPreview?: string;
  mediaUrls?: string[];
  thumbnailUrl?: string;
  likeCount: number;
  commentCount: number;
  shareCount: number;
  postedAt: string;
  scrapedAt: string;
  status: 'ACTIVE' | 'HIDDEN' | 'ARCHIVED' | 'DELETED';
  isPromotional: boolean;
  isTournamentRelated: boolean;
  tags?: string[];
  socialAccount: SocialAccount;
}

type ViewMode = 'feed' | 'accounts' | 'analytics';
type PlatformFilter = 'all' | 'FACEBOOK' | 'INSTAGRAM';

// Platform icon component
const PlatformIcon: React.FC<{ platform: string; className?: string }> = ({ platform, className = '' }) => {
  switch (platform) {
    case 'FACEBOOK':
      return <Facebook className={`text-blue-500 ${className}`} />;
    case 'INSTAGRAM':
      return <Instagram className={`text-pink-500 ${className}`} />;
    default:
      return <Link2 className={className} />;
  }
};

// Status badge component
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

// Add Account Modal
const AddAccountModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onAdd: (account: Partial<SocialAccount>) => void;
  entities: { id: string; entityName: string }[];
  venues: { id: string; name: string }[];
}> = ({ isOpen, onClose, onAdd, entities, venues }) => {
  const [platform, setPlatform] = useState<'FACEBOOK' | 'INSTAGRAM'>('FACEBOOK');
  const [accountUrl, setAccountUrl] = useState('');
  const [accountName, setAccountName] = useState('');
  const [entityId, setEntityId] = useState('');
  const [venueId, setVenueId] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await onAdd({
        platform,
        accountUrl,
        accountName,
        entityId: entityId || undefined,
        venueId: venueId || undefined,
        status: 'PENDING_VERIFICATION',
        isScrapingEnabled: true,
        consecutiveFailures: 0,
      });
      onClose();
    } catch (error) {
      console.error('Error adding account:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-4">
          <h2 className="text-xl font-bold text-white">Add Social Account</h2>
          <p className="text-indigo-200 text-sm mt-1">Connect a public Facebook or Instagram page</p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Platform Selection */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Platform</label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setPlatform('FACEBOOK')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 transition-all ${
                  platform === 'FACEBOOK'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                }`}
              >
                <Facebook className="w-5 h-5" />
                <span className="font-medium">Facebook</span>
              </button>
              <button
                type="button"
                onClick={() => setPlatform('INSTAGRAM')}
                className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl border-2 transition-all ${
                  platform === 'INSTAGRAM'
                    ? 'border-pink-500 bg-pink-50 text-pink-700'
                    : 'border-slate-200 hover:border-slate-300 text-slate-600'
                }`}
              >
                <Instagram className="w-5 h-5" />
                <span className="font-medium">Instagram</span>
              </button>
            </div>
          </div>

          {/* Account URL */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Page URL</label>
            <input
              type="url"
              value={accountUrl}
              onChange={(e) => setAccountUrl(e.target.value)}
              placeholder={platform === 'FACEBOOK' ? 'https://facebook.com/yourpage' : 'https://instagram.com/yourpage'}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              required
            />
          </div>

          {/* Account Name */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Display Name</label>
            <input
              type="text"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g., Kings Room Poker"
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
              required
            />
          </div>

          {/* Entity Selection */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Link to Entity (Optional)</label>
            <select
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
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
            <label className="block text-sm font-semibold text-slate-700 mb-2">Link to Venue (Optional)</label>
            <select
              value={venueId}
              onChange={(e) => setVenueId(e.target.value)}
              className="w-full px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-all"
            >
              <option value="">No venue link</option>
              {venues.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name}
                </option>
              ))}
            </select>
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Adding...
                </>
              ) : (
                'Add Account'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Social Post Card
const PostCard: React.FC<{ post: SocialPost }> = ({ post }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-shadow">
      {/* Post Header */}
      <div className="p-4 flex items-center justify-between border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="relative">
            {post.socialAccount.profileImageUrl ? (
              <img
                src={post.socialAccount.profileImageUrl}
                alt={post.socialAccount.accountName}
                className="w-10 h-10 rounded-full object-cover"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm">
                {post.socialAccount.accountName.charAt(0)}
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow-sm">
              <PlatformIcon platform={post.socialAccount.platform} className="w-3 h-3" />
            </div>
          </div>
          <div>
            <h4 className="font-semibold text-slate-800">{post.socialAccount.accountName}</h4>
            <p className="text-xs text-slate-500">{formatDate(post.postedAt)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {post.isTournamentRelated && (
            <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
              Tournament
            </span>
          )}
          <button className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors">
            <MoreVertical className="w-4 h-4 text-slate-400" />
          </button>
        </div>
      </div>

      {/* Post Content */}
      <div className="p-4">
        {post.content && (
          <p className={`text-slate-700 leading-relaxed ${!isExpanded && post.content.length > 280 ? 'line-clamp-4' : ''}`}>
            {post.content}
          </p>
        )}
        {post.content && post.content.length > 280 && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
          >
            {isExpanded ? 'Show less' : 'Show more'}
          </button>
        )}
      </div>

      {/* Post Media */}
      {post.mediaUrls && post.mediaUrls.length > 0 && (
        <div className="px-4 pb-4">
          <div className={`grid gap-2 ${post.mediaUrls.length === 1 ? 'grid-cols-1' : post.mediaUrls.length === 2 ? 'grid-cols-2' : 'grid-cols-2'}`}>
            {post.mediaUrls.slice(0, 4).map((url, idx) => (
              <div key={idx} className={`relative rounded-xl overflow-hidden bg-slate-100 ${post.mediaUrls!.length === 1 ? 'aspect-video' : 'aspect-square'}`}>
                <img
                  src={url}
                  alt=""
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
                {idx === 3 && post.mediaUrls!.length > 4 && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <span className="text-white text-2xl font-bold">+{post.mediaUrls!.length - 4}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Engagement Stats */}
      <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-5">
          <span className="flex items-center gap-1.5 text-slate-600">
            <Heart className="w-4 h-4 text-red-400" />
            <span className="text-sm font-medium">{formatNumber(post.likeCount)}</span>
          </span>
          <span className="flex items-center gap-1.5 text-slate-600">
            <MessageCircle className="w-4 h-4 text-blue-400" />
            <span className="text-sm font-medium">{formatNumber(post.commentCount)}</span>
          </span>
          <span className="flex items-center gap-1.5 text-slate-600">
            <Share2 className="w-4 h-4 text-green-400" />
            <span className="text-sm font-medium">{formatNumber(post.shareCount)}</span>
          </span>
        </div>
        {post.postUrl && (
          <a
            href={post.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
          >
            View post
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
};

// Account Card
const AccountCard: React.FC<{
  account: SocialAccount;
  onScrape: (id: string) => void;
  onToggleEnabled: (id: string, enabled: boolean) => void;
  isLoading?: boolean;
}> = ({ account, onScrape, onToggleEnabled, isLoading }) => {
  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    return new Date(dateStr).toLocaleString('en-AU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden hover:shadow-md transition-all">
      {/* Header with gradient */}
      <div className={`h-16 bg-gradient-to-r ${
        account.platform === 'FACEBOOK' 
          ? 'from-blue-500 to-blue-600' 
          : 'from-pink-500 via-purple-500 to-orange-500'
      }`} />
      
      {/* Profile Info */}
      <div className="px-5 pb-5">
        <div className="flex items-start justify-between -mt-8">
          <div className="relative">
            {account.profileImageUrl ? (
              <img
                src={account.profileImageUrl}
                alt={account.accountName}
                className="w-16 h-16 rounded-xl object-cover border-4 border-white shadow-lg"
              />
            ) : (
              <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 border-4 border-white shadow-lg flex items-center justify-center text-white text-xl font-bold">
                {account.accountName.charAt(0)}
              </div>
            )}
          </div>
          <div className="mt-10">
            <StatusBadge status={account.status} />
          </div>
        </div>

        <div className="mt-3">
          <div className="flex items-center gap-2">
            <h3 className="font-bold text-lg text-slate-800">{account.accountName}</h3>
            <PlatformIcon platform={account.platform} className="w-4 h-4" />
          </div>
          {account.accountHandle && (
            <p className="text-slate-500 text-sm">@{account.accountHandle}</p>
          )}
        </div>

        {/* Linked Entity/Venue */}
        {(account.entity || account.venue) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {account.entity && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-lg">
                <Link2 className="w-3 h-3" />
                {account.entity.entityName}
              </span>
            )}
            {account.venue && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-lg">
                <Link2 className="w-3 h-3" />
                {account.venue.name}
              </span>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <Users className="w-4 h-4 text-slate-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-slate-800">
              {account.followerCount?.toLocaleString() ?? '—'}
            </p>
            <p className="text-xs text-slate-500">Followers</p>
          </div>
          <div className="bg-slate-50 rounded-xl p-3 text-center">
            <Calendar className="w-4 h-4 text-slate-400 mx-auto mb-1" />
            <p className="text-lg font-bold text-slate-800">
              {account.postCount?.toLocaleString() ?? '—'}
            </p>
            <p className="text-xs text-slate-500">Posts</p>
          </div>
        </div>

        {/* Last Scraped */}
        <div className="mt-4 p-3 bg-slate-50 rounded-xl">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-500">Last scraped</span>
            <span className="font-medium text-slate-700">{formatDate(account.lastScrapedAt)}</span>
          </div>
          {account.consecutiveFailures > 0 && (
            <div className="flex items-center gap-1 mt-2 text-red-600 text-xs">
              <AlertCircle className="w-3 h-3" />
              <span>{account.consecutiveFailures} consecutive failures</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-4 flex gap-2">
          <button
            onClick={() => onScrape(account.id)}
            disabled={isLoading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Scrape Now
          </button>
          <button
            onClick={() => onToggleEnabled(account.id, !account.isScrapingEnabled)}
            className={`p-2.5 rounded-xl border transition-colors ${
              account.isScrapingEnabled
                ? 'border-emerald-200 bg-emerald-50 text-emerald-600 hover:bg-emerald-100'
                : 'border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100'
            }`}
            title={account.isScrapingEnabled ? 'Disable auto-scraping' : 'Enable auto-scraping'}
          >
            {account.isScrapingEnabled ? <Play className="w-4 h-4" /> : <Pause className="w-4 h-4" />}
          </button>
          <button className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

// Main Component
export const SocialPulse: React.FC = () => {
  const { currentEntity } = useEntity();
  const [viewMode, setViewMode] = useState<ViewMode>('feed');
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [scrapingAccountId, setScrapingAccountId] = useState<string | null>(null);
  
  // Data state
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [posts, setPosts] = useState<SocialPost[]>([]);
  const [entities, setEntities] = useState<{ id: string; entityName: string }[]>([]);
  const [venues, setVenues] = useState<{ id: string; name: string }[]>([]);

  // Mock data for demonstration (replace with actual GraphQL queries)
  useEffect(() => {
    const loadData = async () => {
      setIsLoading(true);
      try {
        // TODO: Replace with actual GraphQL queries
        // const accountsResult = await client.graphql({ query: listSocialAccounts, variables: { entityId: currentEntity?.id } });
        // const postsResult = await client.graphql({ query: getSocialFeed, variables: { entityId: currentEntity?.id } });
        
        // Mock data for demonstration
        const mockAccounts: SocialAccount[] = [
          {
            id: '1',
            platform: 'FACEBOOK',
            platformAccountId: 'kingsroompoker',
            accountName: 'Kings Room Poker',
            accountHandle: 'kingsroompoker',
            accountUrl: 'https://facebook.com/kingsroompoker',
            profileImageUrl: undefined,
            followerCount: 12500,
            postCount: 847,
            status: 'ACTIVE',
            isScrapingEnabled: true,
            lastScrapedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            consecutiveFailures: 0,
          },
          {
            id: '2',
            platform: 'INSTAGRAM',
            platformAccountId: 'kingsroom_poker',
            accountName: 'Kings Room Poker',
            accountHandle: 'kingsroom_poker',
            accountUrl: 'https://instagram.com/kingsroom_poker',
            profileImageUrl: undefined,
            followerCount: 8200,
            postCount: 412,
            status: 'ACTIVE',
            isScrapingEnabled: true,
            lastScrapedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
            consecutiveFailures: 0,
          },
          {
            id: '3',
            platform: 'FACEBOOK',
            platformAccountId: 'starpokerroom',
            accountName: 'Star Poker Room',
            accountHandle: 'starpokerroom',
            accountUrl: 'https://facebook.com/starpokerroom',
            profileImageUrl: undefined,
            followerCount: 25000,
            postCount: 1203,
            status: 'ERROR',
            isScrapingEnabled: true,
            lastScrapedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            consecutiveFailures: 3,
            lastErrorMessage: 'Rate limit exceeded',
          },
        ];

        const mockPosts: SocialPost[] = [
          {
            id: 'p1',
            platformPostId: 'fb_123',
            postUrl: 'https://facebook.com/post/123',
            postType: 'IMAGE',
            content: '🏆 Congratulations to our winner of tonight\'s $50K GTD tournament! Amazing turnout with 127 entries. See you all next week for another exciting event! #poker #tournament #winner',
            likeCount: 245,
            commentCount: 32,
            shareCount: 15,
            postedAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
            scrapedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            status: 'ACTIVE',
            isPromotional: false,
            isTournamentRelated: true,
            tags: ['tournament', 'winner'],
            socialAccount: mockAccounts[0],
          },
          {
            id: 'p2',
            platformPostId: 'ig_456',
            postUrl: 'https://instagram.com/p/456',
            postType: 'TEXT',
            content: '📅 This week\'s schedule is now live! Check out our daily tournaments and cash games. Early birds get extra chips on Monday mornings! 🎰',
            likeCount: 189,
            commentCount: 24,
            shareCount: 8,
            postedAt: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
            scrapedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
            status: 'ACTIVE',
            isPromotional: true,
            isTournamentRelated: false,
            socialAccount: mockAccounts[1],
          },
          {
            id: 'p3',
            platformPostId: 'fb_789',
            postUrl: 'https://facebook.com/post/789',
            postType: 'EVENT',
            content: '🎊 MASSIVE NEWS! Our Summer Series is coming July 1-15 with over $500,000 in guaranteed prizes! Main Event $1,000 buy-in with $200K GTD. Early registration now open. Don\'t miss the biggest poker series of the year!',
            likeCount: 523,
            commentCount: 87,
            shareCount: 124,
            postedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
            scrapedAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
            status: 'ACTIVE',
            isPromotional: true,
            isTournamentRelated: true,
            tags: ['series', 'summer', 'main-event'],
            socialAccount: mockAccounts[0],
          },
        ];

        setAccounts(mockAccounts);
        setPosts(mockPosts);
        setEntities([{ id: 'e1', entityName: 'PokerPro Live' }]);
        setVenues([
          { id: 'v1', name: 'Kings Room' },
          { id: 'v2', name: 'Star Poker' },
        ]);
      } catch (error) {
        console.error('Error loading social data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [currentEntity]);

  const handleAddAccount = async (account: Partial<SocialAccount>) => {
    // TODO: Implement GraphQL mutation
    console.log('Adding account:', account);
    // const result = await client.graphql({ mutation: addSocialAccount, variables: { input: account } });
    // setAccounts([...accounts, result.data.addSocialAccount]);
  };

  const handleScrapeAccount = async (accountId: string) => {
    setScrapingAccountId(accountId);
    try {
      // TODO: Implement GraphQL mutation
      console.log('Triggering scrape for account:', accountId);
      // await client.graphql({ mutation: triggerSocialScrape, variables: { accountId } });
      await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate API call
    } catch (error) {
      console.error('Error triggering scrape:', error);
    } finally {
      setScrapingAccountId(null);
    }
  };

  const handleToggleScrapingEnabled = async (accountId: string, enabled: boolean) => {
    // TODO: Implement GraphQL mutation
    console.log('Toggle scraping for account:', accountId, enabled);
    setAccounts(accounts.map(a => 
      a.id === accountId ? { ...a, isScrapingEnabled: enabled } : a
    ));
  };

  const handleRefreshAll = async () => {
    setIsRefreshing(true);
    try {
      // TODO: Implement bulk scrape
      await new Promise(resolve => setTimeout(resolve, 3000));
    } finally {
      setIsRefreshing(false);
    }
  };

  const filteredPosts = posts.filter(post => {
    if (platformFilter !== 'all' && post.socialAccount.platform !== platformFilter) return false;
    if (searchQuery && !post.content?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const filteredAccounts = accounts.filter(account => {
    if (platformFilter !== 'all' && account.platform !== platformFilter) return false;
    if (searchQuery && !account.accountName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const totalEngagement = posts.reduce((sum, p) => sum + p.likeCount + p.commentCount + p.shareCount, 0);
  const activeAccounts = accounts.filter(a => a.status === 'ACTIVE').length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-indigo-50">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  Social Pulse
                </h1>
                <p className="text-slate-500 mt-1">Monitor and manage social media presence across your venues</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleRefreshAll}
                  disabled={isRefreshing}
                  className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                  Refresh All
                </button>
                <button
                  onClick={() => setIsAddModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl font-semibold hover:from-indigo-700 hover:to-purple-700 transition-all shadow-lg shadow-indigo-200"
                >
                  <Plus className="w-4 h-4" />
                  Add Account
                </button>
              </div>
            </div>

            {/* Stats Row */}
            <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
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
                <p className="text-3xl font-bold text-slate-800 mt-2">{posts.length}</p>
              </div>
              <div className="bg-white rounded-2xl p-4 border border-slate-200">
                <div className="flex items-center gap-2 text-slate-500">
                  <TrendingUp className="w-4 h-4 text-pink-500" />
                  <span className="text-sm font-medium">Engagement</span>
                </div>
                <p className="text-3xl font-bold text-slate-800 mt-2">{totalEngagement.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Tabs & Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4">
            {/* View Mode Tabs */}
            <div className="flex bg-slate-100 rounded-xl p-1">
              {[
                { id: 'feed', label: 'Feed', icon: Calendar },
                { id: 'accounts', label: 'Accounts', icon: Users },
                { id: 'analytics', label: 'Analytics', icon: TrendingUp },
              ].map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setViewMode(id as ViewMode)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-all ${
                    viewMode === id
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Filters */}
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search posts..."
                  className="pl-9 pr-4 py-2 w-48 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>

              {/* Platform Filter */}
              <div className="flex bg-slate-100 rounded-xl p-1">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'FACEBOOK', label: 'Facebook', icon: Facebook },
                  { id: 'INSTAGRAM', label: 'Instagram', icon: Instagram },
                ].map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setPlatformFilter(id as PlatformFilter)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      platformFilter === id
                        ? 'bg-white text-slate-800 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {Icon && <Icon className="w-3.5 h-3.5" />}
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mx-auto" />
              <p className="text-slate-500 mt-4">Loading social data...</p>
            </div>
          </div>
        ) : (
          <>
            {/* Feed View */}
            {viewMode === 'feed' && (
              <div className="space-y-6">
                {filteredPosts.length === 0 ? (
                  <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
                    <Calendar className="w-12 h-12 text-slate-300 mx-auto" />
                    <h3 className="text-lg font-semibold text-slate-700 mt-4">No posts yet</h3>
                    <p className="text-slate-500 mt-1">Add social accounts to start seeing posts here</p>
                    <button
                      onClick={() => setIsAddModalOpen(true)}
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add Account
                    </button>
                  </div>
                ) : (
                  <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {filteredPosts.map((post) => (
                      <PostCard key={post.id} post={post} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Accounts View */}
            {viewMode === 'accounts' && (
              <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {filteredAccounts.length === 0 ? (
                  <div className="col-span-full text-center py-16 bg-white rounded-2xl border border-dashed border-slate-300">
                    <Users className="w-12 h-12 text-slate-300 mx-auto" />
                    <h3 className="text-lg font-semibold text-slate-700 mt-4">No accounts connected</h3>
                    <p className="text-slate-500 mt-1">Connect your first social account to get started</p>
                    <button
                      onClick={() => setIsAddModalOpen(true)}
                      className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Add Account
                    </button>
                  </div>
                ) : (
                  filteredAccounts.map((account) => (
                    <AccountCard
                      key={account.id}
                      account={account}
                      onScrape={handleScrapeAccount}
                      onToggleEnabled={handleToggleScrapingEnabled}
                      isLoading={scrapingAccountId === account.id}
                    />
                  ))
                )}
              </div>
            )}

            {/* Analytics View */}
            {viewMode === 'analytics' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center">
                <TrendingUp className="w-16 h-16 text-slate-300 mx-auto" />
                <h3 className="text-xl font-semibold text-slate-700 mt-4">Analytics Coming Soon</h3>
                <p className="text-slate-500 mt-2 max-w-md mx-auto">
                  Track engagement trends, compare performance across platforms, and get insights to optimize your social presence.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* Add Account Modal */}
      <AddAccountModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAdd={handleAddAccount}
        entities={entities}
        venues={venues}
      />
    </div>
  );
};

export default SocialPulse;