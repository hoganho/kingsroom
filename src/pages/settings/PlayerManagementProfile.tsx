// src/pages/settings/PlayerManagementProfile.tsx
// Editable Player Profile - Accessed from Player Management hub
// VERSION: 1.0.0
//
// Route: /settings/player-management/edit/:playerId
// Allows admins to edit core player fields (name, email, phone, status, category)
// and view read-only computed fields (targeting, balances, venues, dates)

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { generateClient } from 'aws-amplify/api';
import type { GraphQLResult } from '@aws-amplify/api';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
  ArrowPathIcon,
  UserIcon,
  CalendarIcon,
  MapPinIcon,
  ChartBarIcon,
  CurrencyPoundIcon,
  BuildingStorefrontIcon,
  ShieldCheckIcon,
  ClipboardDocumentIcon,
  EyeIcon,
} from '@heroicons/react/24/outline';

import { PageWrapper } from '../../components/layout/PageWrapper';
import { usePlayerProfile } from '../../hooks/usePlayer';
import {
  formatPlayerName,
  formatPlayerInitials,
  formatDate,
  formatTargetingClassification,
} from '../../utils/playerHelpers';
import { formatCurrency, formatNumber } from '../../lib/utils';

// ============================================================================
// GraphQL Mutation - Standard Amplify updatePlayer
// ============================================================================

const UPDATE_PLAYER = /* GraphQL */ `
  mutation UpdatePlayer($input: UpdatePlayerInput!) {
    updatePlayer(input: $input) {
      id
      firstName
      lastName
      email
      phone
      status
      category
      _version
      _lastChangedAt
      updatedAt
    }
  }
`;

// ============================================================================
// Constants
// ============================================================================

const STATUS_OPTIONS = [
  { value: 'ACTIVE', label: 'Active', description: 'Player can participate in games' },
  { value: 'SUSPENDED', label: 'Suspended', description: 'Player access is temporarily restricted' },
  { value: 'PENDING_VERIFICATION', label: 'Pending Verification', description: 'Awaiting identity verification' },
] as const;

const CATEGORY_OPTIONS = [
  { value: 'TRIALIST', label: 'Trialist', description: 'Early-stage explorer, <5 games within 60 days of registration' },
  { value: 'CASUAL', label: 'Casual', description: 'Plays occasionally, <2 games/month average' },
  { value: 'COMMITTED', label: 'Committed', description: 'Regular intent, 2–4 games/month' },
  { value: 'REGULAR', label: 'Regular', description: 'Weekly participation, 3+ games/month sustained 6+ weeks' },
  { value: 'VIP', label: 'VIP', description: 'Top 5% by buy-ins over 12 months per entity' },
] as const;

// ============================================================================
// Types
// ============================================================================

interface EditableFields {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  status: string;
  category: string;
}

type SaveState = 'idle' | 'saving' | 'success' | 'error';

// ============================================================================
// Helper Components
// ============================================================================

/** Badge for player status */
const StatusBadge: React.FC<{ status?: string }> = ({ status }) => {
  if (!status) return <span className="text-sm text-gray-400">—</span>;
  const map: Record<string, { bg: string; text: string }> = {
    ACTIVE: { bg: 'bg-green-100', text: 'text-green-700' },
    SUSPENDED: { bg: 'bg-red-100', text: 'text-red-700' },
    PENDING_VERIFICATION: { bg: 'bg-amber-100', text: 'text-amber-700' },
  };
  const style = map[status] || { bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
};

/** Badge for player category */
const CategoryBadge: React.FC<{ category?: string }> = ({ category }) => {
  if (!category) return <span className="text-sm text-gray-400">—</span>;
  const map: Record<string, { bg: string; text: string }> = {
    TRIALIST: { bg: 'bg-sky-100', text: 'text-sky-700' },
    CASUAL: { bg: 'bg-blue-100', text: 'text-blue-700' },
    COMMITTED: { bg: 'bg-indigo-100', text: 'text-indigo-700' },
    REGULAR: { bg: 'bg-purple-100', text: 'text-purple-700' },
    VIP: { bg: 'bg-amber-100', text: 'text-amber-700' },
    NEW: { bg: 'bg-sky-100', text: 'text-sky-700' },
    RECREATIONAL: { bg: 'bg-blue-100', text: 'text-blue-700' },
  };
  const style = map[category] || { bg: 'bg-gray-100', text: 'text-gray-600' };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${style.bg} ${style.text}`}>
      {category}
    </span>
  );
};

/** Read-only field display row */
const ReadOnlyField: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}> = ({ icon: Icon, label, value, mono }) => (
  <div className="flex items-start gap-3 py-3">
    <Icon className="h-5 w-5 text-gray-400 mt-0.5 flex-shrink-0" />
    <div className="flex-1 min-w-0">
      <dt className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</dt>
      <dd className={`mt-0.5 text-sm text-gray-900 ${mono ? 'font-mono' : ''}`}>
        {value || <span className="text-gray-400">—</span>}
      </dd>
    </div>
  </div>
);

/** Editable form field */
const FormField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: 'text' | 'email' | 'tel';
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
}> = ({ id, label, value, onChange, type = 'text', placeholder, required, disabled }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
      {label}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
    <input
      id={id}
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      disabled={disabled}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none disabled:bg-gray-50 disabled:text-gray-500"
    />
  </div>
);

/** Select dropdown field */
const SelectField: React.FC<{
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly { value: string; label: string; description?: string }[];
  disabled?: boolean;
}> = ({ id, label, value, onChange, options, disabled }) => (
  <div>
    <label htmlFor={id} className="block text-sm font-medium text-gray-700 mb-1">
      {label}
    </label>
    <select
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none bg-white disabled:bg-gray-50 disabled:text-gray-500"
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
    {/* Show description for currently selected option */}
    {options.find((o) => o.value === value)?.description && (
      <p className="mt-1 text-xs text-gray-500">
        {options.find((o) => o.value === value)?.description}
      </p>
    )}
  </div>
);

/** Venue card for venue list */
const VenueCard: React.FC<{
  venue: {
    id: string;
    venueId?: string;
    totalGamesPlayed?: number | null;
    netProfit?: number | null;
    lastPlayedDate?: string | null;
    targetingClassification?: string | null;
    venue?: { id: string; name?: string; entity?: { entityName?: string } | null } | null;
  };
}> = ({ venue }) => {
  const targeting = venue.targetingClassification
    ? formatVenueTargeting(venue.targetingClassification)
    : null;

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-medium text-gray-900 truncate">
            {venue.venue?.name || venue.venueId || 'Unknown Venue'}
          </h4>
          {venue.venue?.entity?.entityName && (
            <p className="text-xs text-gray-500">{venue.venue.entity.entityName}</p>
          )}
        </div>
        {targeting && (
          <span className={`flex-shrink-0 ml-2 px-2 py-0.5 rounded-full text-xs font-medium ${targeting.bg} ${targeting.text}`}>
            {targeting.label}
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div>
          <span className="text-gray-500">Games</span>
          <p className="font-medium text-gray-900">{venue.totalGamesPlayed ?? 0}</p>
        </div>
        <div>
          <span className="text-gray-500">Net</span>
          <p className={`font-medium ${(venue.netProfit ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(venue.netProfit ?? 0)}
          </p>
        </div>
        <div>
          <span className="text-gray-500">Last Played</span>
          <p className="font-medium text-gray-900">
            {venue.lastPlayedDate ? formatDate(venue.lastPlayedDate) : '—'}
          </p>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// Venue Targeting Classification Formatter (matches PlayerProfile.tsx)
// ============================================================================

const formatVenueTargeting = (classification: string): { label: string; bg: string; text: string } => {
  const map: Record<string, { label: string; bg: string; text: string }> = {
    NOT_PLAYED: { label: 'Not Played', bg: 'bg-gray-100', text: 'text-gray-800' },
    ACTIVE_EL: { label: 'Active (Entry)', bg: 'bg-green-100', text: 'text-green-800' },
    ACTIVE: { label: 'Active', bg: 'bg-emerald-100', text: 'text-emerald-800' },
    RETAIN_31_60: { label: 'Retain 31-60', bg: 'bg-yellow-100', text: 'text-yellow-800' },
    RETAIN_61_90: { label: 'Retain 61-90', bg: 'bg-amber-100', text: 'text-amber-800' },
    CHURNED_91_120: { label: 'Churned 91-120', bg: 'bg-orange-100', text: 'text-orange-800' },
    CHURNED_121_180: { label: 'Churned 121-180', bg: 'bg-red-100', text: 'text-red-800' },
    CHURNED_181_360: { label: 'Churned 181-360', bg: 'bg-red-200', text: 'text-red-900' },
    CHURNED_361: { label: 'Churned 361+', bg: 'bg-red-300', text: 'text-red-900' },
  };
  return map[classification] || { label: classification.replace(/_/g, ' '), bg: 'bg-gray-100', text: 'text-gray-800' };
};

// ============================================================================
// Main Component
// ============================================================================

export const PlayerManagementProfile: React.FC = () => {
  const { playerId } = useParams<{ playerId: string }>();
  const navigate = useNavigate();

  // Fetch full player profile
  const { data: playerData, loading, error, refetch } = usePlayerProfile(playerId);

  // Editable form state
  const [form, setForm] = useState<EditableFields>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    status: 'ACTIVE',
    category: 'TRIALIST',
  });

  // Save state
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Track _version for optimistic locking
  const [version, setVersion] = useState<number | null>(null);

  // Copy to clipboard
  const [copied, setCopied] = useState(false);

  // Initialize form from loaded player data
  useEffect(() => {
    if (playerData?.player) {
      const p = playerData.player;
      setForm({
        firstName: p.firstName || '',
        lastName: p.lastName || '',
        email: p.email || '',
        phone: p.phone || '',
        status: p.status || 'ACTIVE',
        category: p.category || 'TRIALIST',
      });
      // @ts-ignore - _version exists on Amplify models
      setVersion(p._version ?? null);
    }
  }, [playerData]);

  // Check if form has changes
  const hasChanges = useMemo(() => {
    if (!playerData?.player) return false;
    const p = playerData.player;
    return (
      form.firstName !== (p.firstName || '') ||
      form.lastName !== (p.lastName || '') ||
      form.email !== (p.email || '') ||
      form.phone !== (p.phone || '') ||
      form.status !== (p.status || 'ACTIVE') ||
      form.category !== (p.category || 'TRIALIST')
    );
  }, [form, playerData]);

  // Field updater
  const updateField = useCallback((field: keyof EditableFields, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveSuccess(false);
    setSaveError(null);
  }, []);

  // Copy player ID to clipboard
  const copyPlayerId = useCallback(() => {
    if (playerId) {
      navigator.clipboard.writeText(playerId).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }, [playerId]);

  // Reset form to original values
  const handleReset = useCallback(() => {
    if (playerData?.player) {
      const p = playerData.player;
      setForm({
        firstName: p.firstName || '',
        lastName: p.lastName || '',
        email: p.email || '',
        phone: p.phone || '',
        status: p.status || 'ACTIVE',
        category: p.category || 'TRIALIST',
      });
    }
    setSaveSuccess(false);
    setSaveError(null);
  }, [playerData]);

  // ========================================
  // Save handler - updatePlayer mutation
  // ========================================

  const handleSave = useCallback(async () => {
    if (!playerId || !hasChanges) return;

    setSaveState('saving');
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const client = generateClient();

      // Build input with only changed fields plus required id
      const input: Record<string, unknown> = { id: playerId };

      // Always send all editable fields to ensure consistency
      input.firstName = form.firstName.trim() || null;
      input.lastName = form.lastName.trim() || null;
      input.email = form.email.trim() || null;
      input.phone = form.phone.trim() || null;
      input.status = form.status;
      input.category = form.category;

      // Include _version for optimistic locking (DataStore / @versioned)
      if (version != null) {
        input._version = version;
      }

      const response = await client.graphql({
        query: UPDATE_PLAYER,
        variables: { input },
      }) as GraphQLResult<{ updatePlayer: Record<string, unknown> }>;

      if (response.data?.updatePlayer) {
        // Update version for next save
        const newVersion = response.data.updatePlayer._version;
        if (typeof newVersion === 'number') {
          setVersion(newVersion);
        }

        setSaveState('success');
        setSaveSuccess(true);

        // Refetch to sync all displayed data
        await refetch();
      } else {
        throw new Error('No data returned from updatePlayer mutation');
      }
    } catch (err: unknown) {
      setSaveState('error');
      let message = 'Failed to update player';

      if (err instanceof Error) {
        // Handle common Amplify/GraphQL errors
        if (err.message.includes('ConditionalCheckFailed') || err.message.includes('Conflict')) {
          message = 'Conflict detected — another user may have modified this player. Please refresh and try again.';
        } else if (err.message.includes('Variable') && err.message.includes('expected')) {
          message = 'Schema error — the updatePlayer mutation may not match the expected input type. Check your GraphQL schema.';
        } else {
          message = err.message;
        }
      }

      // Also check for GraphQL errors array
      const gqlErr = err as { errors?: Array<{ message: string }> };
      if (gqlErr?.errors?.length) {
        message = gqlErr.errors.map((e) => e.message).join('; ');
      }

      setSaveError(message);
    } finally {
      // Reset save state after delay (but keep success/error message)
      setTimeout(() => setSaveState('idle'), 3000);
    }
  }, [playerId, form, hasChanges, version, refetch]);

  // ========================================
  // Loading State
  // ========================================

  if (loading) {
    return (
      <PageWrapper title="Edit Player" maxWidth="6xl">
        <div className="animate-pulse space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-full bg-gray-200" />
              <div className="flex-1 space-y-3">
                <div className="h-5 bg-gray-200 rounded w-1/3" />
                <div className="h-4 bg-gray-200 rounded w-1/2" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 bg-gray-200 rounded" />
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="h-10 bg-gray-200 rounded" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </PageWrapper>
    );
  }

  // ========================================
  // Error State
  // ========================================

  if (error || !playerData) {
    return (
      <PageWrapper title="Edit Player" maxWidth="6xl">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <div className="flex items-start gap-3">
            <XCircleIcon className="h-6 w-6 text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Failed to load player</h3>
              <p className="mt-1 text-sm text-red-700">{error || 'Player not found'}</p>
              <div className="mt-4 flex gap-3">
                <button
                  onClick={() => navigate('/settings/player-management')}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  <ArrowLeftIcon className="h-4 w-4 mr-1.5" />
                  Back to Player Management
                </button>
                <button
                  onClick={() => refetch()}
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100"
                >
                  <ArrowPathIcon className="h-4 w-4 mr-1.5" />
                  Retry
                </button>
              </div>
            </div>
          </div>
        </div>
      </PageWrapper>
    );
  }

  const { player, summary } = playerData;
  const targeting = formatTargetingClassification(player.targetingClassification);

  // ========================================
  // Render
  // ========================================

  return (
    <PageWrapper
      title={`Edit: ${formatPlayerName(player)}`}
      maxWidth="6xl"
      actions={
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/players/profile/${playerId}`)}
            className="inline-flex items-center text-sm text-gray-500 hover:text-indigo-600 transition-colors"
          >
            <EyeIcon className="h-4 w-4 mr-1.5" />
            View Full Profile
          </button>
          <button
            onClick={() => navigate('/settings/player-management')}
            className="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1.5" />
            Back to Player Management
          </button>
        </div>
      }
    >
      {/* ================================================================ */}
      {/* Player Header Card                                              */}
      {/* ================================================================ */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 mb-6">
        <div className="px-6 py-5">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="flex-shrink-0">
              <div className="h-16 w-16 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center">
                <span className="text-white font-bold text-xl">
                  {formatPlayerInitials(player)}
                </span>
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center flex-wrap gap-2">
                <h2 className="text-xl font-bold text-gray-900">
                  {formatPlayerName(player)}
                </h2>
                <StatusBadge status={player.status} />
                <CategoryBadge category={player.category} />
              </div>

              {/* Player ID - copyable */}
              <div className="mt-2 flex items-center gap-2">
                <span className="text-xs text-gray-400 font-mono">{playerId}</span>
                <button
                  onClick={copyPlayerId}
                  title="Copy Player ID"
                  className="text-gray-400 hover:text-indigo-500 transition-colors"
                >
                  <ClipboardDocumentIcon className="h-3.5 w-3.5" />
                </button>
                {copied && (
                  <span className="text-xs text-green-600 font-medium">Copied!</span>
                )}
              </div>

              {/* Quick stats */}
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <CalendarIcon className="h-3.5 w-3.5" />
                  Joined {formatDate(player.registrationDate)}
                </span>
                {player.lastPlayedDate && (
                  <span className="flex items-center gap-1">
                    <CalendarIcon className="h-3.5 w-3.5" />
                    Last played {formatDate(player.lastPlayedDate)}
                  </span>
                )}
                {player.registrationVenue?.name && (
                  <span className="flex items-center gap-1">
                    <MapPinIcon className="h-3.5 w-3.5" />
                    {player.registrationVenue.name}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================ */}
      {/* Success / Error Banners                                         */}
      {/* ================================================================ */}
      {saveSuccess && (
        <div className="mb-4 bg-green-50 border border-green-200 rounded-xl p-4 flex items-center gap-3">
          <CheckCircleIcon className="h-5 w-5 text-green-500 flex-shrink-0" />
          <p className="text-sm text-green-800">Player updated successfully.</p>
        </div>
      )}

      {saveError && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-800">Save failed</p>
            <p className="mt-0.5 text-sm text-red-700">{saveError}</p>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* Main Content: Two-Column Layout                                 */}
      {/* ================================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* ============================================ */}
        {/* LEFT: Editable Form                          */}
        {/* ============================================ */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <PencilSquareIcon className="h-5 w-5 text-indigo-500" />
              Edit Player Details
            </h3>
          </div>

          <div className="p-6">
            <div className="space-y-5">
              {/* Name Fields */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  id="firstName"
                  label="First Name"
                  value={form.firstName}
                  onChange={(v) => updateField('firstName', v)}
                  placeholder="First name"
                  required
                  disabled={saveState === 'saving'}
                />
                <FormField
                  id="lastName"
                  label="Last Name"
                  value={form.lastName}
                  onChange={(v) => updateField('lastName', v)}
                  placeholder="Last name"
                  required
                  disabled={saveState === 'saving'}
                />
              </div>

              {/* Contact Fields */}
              <FormField
                id="email"
                label="Email"
                value={form.email}
                onChange={(v) => updateField('email', v)}
                type="email"
                placeholder="player@example.com"
                disabled={saveState === 'saving'}
              />

              <FormField
                id="phone"
                label="Phone"
                value={form.phone}
                onChange={(v) => updateField('phone', v)}
                type="tel"
                placeholder="+61 400 000 000"
                disabled={saveState === 'saving'}
              />

              {/* Status Dropdown */}
              <SelectField
                id="status"
                label="Account Status"
                value={form.status}
                onChange={(v) => updateField('status', v)}
                options={STATUS_OPTIONS}
                disabled={saveState === 'saving'}
              />

              {/* Category Dropdown */}
              <SelectField
                id="category"
                label="Account Category"
                value={form.category}
                onChange={(v) => updateField('category', v)}
                options={CATEGORY_OPTIONS}
                disabled={saveState === 'saving'}
              />

              {/* Category override warning */}
              {form.category !== (playerData.player.category || 'TRIALIST') && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                  <ExclamationTriangleIcon className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    Manually changing the category will override the automated classification.
                    The monthly targeting refresh may recalculate this value based on player activity.
                  </p>
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="mt-6 pt-4 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={handleReset}
                disabled={!hasChanges || saveState === 'saving'}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Reset Changes
              </button>
              <button
                onClick={handleSave}
                disabled={!hasChanges || saveState === 'saving'}
                className="inline-flex items-center px-5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {saveState === 'saving' ? (
                  <>
                    <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <CheckCircleIcon className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ============================================ */}
        {/* RIGHT: Read-Only Information                  */}
        {/* ============================================ */}
        <div className="space-y-6">

          {/* Computed / System Fields */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <ShieldCheckIcon className="h-5 w-5 text-gray-400" />
                System Information
                <span className="text-xs font-normal text-gray-400 ml-auto">Read-only</span>
              </h3>
            </div>
            <div className="px-6 py-2 divide-y divide-gray-100">
              <ReadOnlyField
                icon={UserIcon}
                label="Player ID"
                value={
                  <span className="font-mono text-xs text-gray-700 break-all">{playerId}</span>
                }
              />
              <ReadOnlyField
                icon={CalendarIcon}
                label="Registration Date"
                value={formatDate(player.registrationDate)}
              />
              <ReadOnlyField
                icon={CalendarIcon}
                label="Last Played"
                value={player.lastPlayedDate ? formatDate(player.lastPlayedDate) : null}
              />
              <ReadOnlyField
                icon={ChartBarIcon}
                label="Targeting Classification"
                value={
                  player.targetingClassification ? (
                    <span
                      className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{ color: targeting.color }}
                    >
                      {targeting.label}
                    </span>
                  ) : null
                }
              />
              <ReadOnlyField
                icon={MapPinIcon}
                label="Registration Venue"
                value={player.registrationVenue?.name}
              />
              <ReadOnlyField
                icon={BuildingStorefrontIcon}
                label="Primary Entity"
                value={
                  player.primaryEntityId ? (
                    <span className="font-mono text-xs">{player.primaryEntityId}</span>
                  ) : null
                }
              />
            </div>
          </div>

          {/* Balances */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <CurrencyPoundIcon className="h-5 w-5 text-gray-400" />
                Balances & Stats
                <span className="text-xs font-normal text-gray-400 ml-auto">Read-only</span>
              </h3>
            </div>
            <div className="p-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-indigo-50 rounded-lg p-4">
                  <p className="text-xs text-indigo-600 font-medium">Credit Balance</p>
                  <p className="text-xl font-bold text-indigo-900 mt-1">
                    {formatCurrency(player.creditBalance ?? 0)}
                  </p>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <p className="text-xs text-purple-600 font-medium">Points Balance</p>
                  <p className="text-xl font-bold text-purple-900 mt-1">
                    {formatNumber(player.pointsBalance ?? 0)}
                  </p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-xs text-green-600 font-medium">Net Balance</p>
                  <p className={`text-xl font-bold mt-1 ${(summary?.netBalance ?? 0) >= 0 ? 'text-green-900' : 'text-red-700'}`}>
                    {formatCurrency(summary?.netBalance ?? 0)}
                  </p>
                </div>
                <div className="bg-amber-50 rounded-lg p-4">
                  <p className="text-xs text-amber-600 font-medium">Games Played</p>
                  <p className="text-xl font-bold text-amber-900 mt-1">
                    {formatNumber(
                      summary?.gamesPlayedAllTime ||
                      playerData.venues?.reduce((sum, v) => sum + (v.totalGamesPlayed || 0), 0) ||
                      0
                    )}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Venues List */}
          {playerData.venues && playerData.venues.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100">
              <div className="px-6 py-4 border-b border-gray-100">
                <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                  <BuildingStorefrontIcon className="h-5 w-5 text-gray-400" />
                  Venues
                  <span className="ml-2 bg-gray-100 text-gray-600 py-0.5 px-2 rounded-full text-xs font-medium">
                    {playerData.venues.length}
                  </span>
                  <span className="text-xs font-normal text-gray-400 ml-auto">Read-only</span>
                </h3>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-1 gap-3">
                  {playerData.venues.map((v) => (
                    <VenueCard key={v.id} venue={v} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PageWrapper>
  );
};

export default PlayerManagementProfile;
