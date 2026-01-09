// src/components/games/recurring-games/RecurringGameAdmin.tsx
// Comprehensive admin panel for recurring game management
// UPDATED: Added Bootstrap functionality for creating templates from existing games
// UPDATED: Added Schedule tab for instance tracking and compliance

import React, { useState, useEffect, useMemo } from 'react';
import {
    ArrowPathIcon,
    ChartBarIcon,
    DocumentDuplicateIcon,
    TrashIcon,
    AdjustmentsHorizontalIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    InformationCircleIcon,
    ChevronDownIcon,
    ChevronUpIcon,
    PlayIcon,
    EyeIcon,
    XMarkIcon,
    ArrowsRightLeftIcon,
    CalendarDaysIcon,
    SparklesIcon,
} from '@heroicons/react/24/outline';
import { BootstrapPreviewTable } from './BootstrapPreviewTable';
import { cx } from '../../../lib/utils';
import { Button } from '../../ui/Button';
import { Modal } from '../../ui/Modal';
import { Select } from '../../ui/Select';
import {
    getRecurringGameVenueStats,
    findRecurringGameDuplicates,
    reResolveRecurringAssignmentsForVenue,
    mergeRecurringGameDuplicates,
    cleanupOrphanedRecurringGames,
    getActionDescription,
    formatSimilarity,
    countPendingChanges,
    DEFAULT_ADMIN_THRESHOLDS,
    // Instance tracking imports
    detectRecurringGameGaps,
    reconcileRecurringInstances,
    getVenueComplianceReport,
    recordMissedInstance,
    getInstanceStatusStyle,
    formatWeekKey,
    getDateRangeForWeeks,
    // Bootstrap imports
    bootstrapRecurringGames,
    type RecurringGameVenueStats,
    type FindDuplicatesResult,
    type ReResolveVenueResult,
    type AdminThresholds,
    type DuplicateGroup,
    type DuplicateEntry,
    type GameActionDetail,
    type OrphanedRecurringGame,
    type RecurringGameDistribution,
    // Instance tracking types
    type DetectGapsResult,
    type VenueComplianceReport,
    type ReconcileInstancesResult,
    type GapInfo,
    // Bootstrap types
    type BootstrapRecurringGamesResult,
} from '../../../services/recurringGameService';

// ===================================================================
// TYPES
// ===================================================================

interface Venue {
    id: string;
    name: string;
    entityId?: string;
}

interface RecurringGameAdminProps {
    venues: Venue[];
    selectedVenueId?: string;
    onVenueChange?: (venueId: string) => void;
}

type AdminTab = 'stats' | 'resolve' | 'duplicates' | 'orphans' | 'schedule';

// ===================================================================
// SUB-COMPONENTS
// ===================================================================

// Threshold Slider Component
const ThresholdSlider: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step?: number;
    onChange: (value: number) => void;
    description?: string;
    isPercent?: boolean;
}> = ({ label, value, min, max, step = 1, onChange, description, isPercent }) => (
    <div className="space-y-2">
        <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</label>
            <span className="text-sm font-mono text-gray-900 dark:text-gray-100">
                {isPercent ? `${(value * 100).toFixed(0)}%` : value}
            </span>
        </div>
        <input
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-indigo-600"
        />
        {description && (
            <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>
        )}
    </div>
);

// Stats Card Component
const StatCard: React.FC<{
    title: string;
    value: number | string;
    subtitle?: string;
    icon: React.ReactNode;
    color?: 'blue' | 'green' | 'amber' | 'red' | 'purple';
}> = ({ title, value, subtitle, icon, color = 'blue' }) => {
    const colors = {
        blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400',
        green: 'bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400',
        amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
        red: 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400',
        purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400',
    };

    return (
        <div className="bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800 p-4">
            <div className="flex items-center gap-3">
                <div className={cx('p-2 rounded-lg', colors[color])}>
                    {icon}
                </div>
                <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
                    {subtitle && (
                        <p className="text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>
                    )}
                </div>
            </div>
        </div>
    );
};

// Action Badge Component
const ActionBadge: React.FC<{ action: string }> = ({ action }) => {
    const { label, color } = getActionDescription(action);
    return (
        <span className={cx('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', color)}>
            {label}
        </span>
    );
};

// Expandable Section Component
const ExpandableSection: React.FC<{
    title: string;
    count?: number;
    children: React.ReactNode;
    defaultOpen?: boolean;
}> = ({ title, count, children, defaultOpen = false }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);

    return (
        <div className="border dark:border-gray-700 rounded-lg overflow-hidden">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
                <span className="font-medium text-gray-900 dark:text-gray-100">
                    {title}
                    {count !== undefined && (
                        <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">({count})</span>
                    )}
                </span>
                {isOpen ? (
                    <ChevronUpIcon className="h-5 w-5 text-gray-500" />
                ) : (
                    <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                )}
            </button>
            {isOpen && (
                <div className="p-4 bg-white dark:bg-gray-900">
                    {children}
                </div>
            )}
        </div>
    );
};

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const RecurringGameAdmin: React.FC<RecurringGameAdminProps> = ({
    venues,
    selectedVenueId: initialVenueId,
    onVenueChange,
}) => {
    // State
    const [selectedVenueId, setSelectedVenueId] = useState<string>(initialVenueId || '');
    const [activeTab, setActiveTab] = useState<AdminTab>('stats');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Data state
    const [stats, setStats] = useState<RecurringGameVenueStats | null>(null);
    const [duplicates, setDuplicates] = useState<FindDuplicatesResult | null>(null);
    const [resolveResult, setResolveResult] = useState<ReResolveVenueResult | null>(null);

    // Threshold state
    const [thresholds, setThresholds] = useState<AdminThresholds>(DEFAULT_ADMIN_THRESHOLDS);
    const [showThresholds, setShowThresholds] = useState(false);

    // Modal state
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        action: () => Promise<void>;
        variant?: 'warning' | 'danger';
    }>({ isOpen: false, title: '', message: '', action: async () => {} });

    // Schedule/Instance state
    const [complianceReport, setComplianceReport] = useState<VenueComplianceReport | null>(null);
    const [gapsResult, setGapsResult] = useState<DetectGapsResult | null>(null);
    const [reconcileResult, setReconcileResult] = useState<ReconcileInstancesResult | null>(null);
    const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string }>(
        getDateRangeForWeeks(4) // Default to last 4 weeks
    );
    const [missedInstanceModal, setMissedInstanceModal] = useState<{
        isOpen: boolean;
        gap: GapInfo | null;
        status: 'CANCELLED' | 'SKIPPED' | 'NO_SHOW';
        reason: string;
    }>({ isOpen: false, gap: null, status: 'CANCELLED', reason: '' });

    // Bootstrap state
    const [bootstrapResult, setBootstrapResult] = useState<BootstrapRecurringGamesResult | null>(null);
    const [isBootstrapping, setIsBootstrapping] = useState(false);
    const [bootstrapSettings, setBootstrapSettings] = useState({
        minGamesForTemplate: 2,
        similarityThreshold: 0.7,
    });

    // Selected venue info
    const selectedVenue = useMemo(
        () => venues.find(v => v.id === selectedVenueId),
        [venues, selectedVenueId]
    );

    // Handle venue change
    const handleVenueChange = (venueId: string) => {
        setSelectedVenueId(venueId);
        setStats(null);
        setDuplicates(null);
        setResolveResult(null);
        setComplianceReport(null);
        setGapsResult(null);
        setReconcileResult(null);
        setBootstrapResult(null);
        setError(null);
        onVenueChange?.(venueId);
    };

    // Load stats when venue changes
    useEffect(() => {
        if (selectedVenueId && activeTab === 'stats') {
            loadStats();
        }
    }, [selectedVenueId, activeTab]);

    // ===================================================================
    // DATA LOADING FUNCTIONS
    // ===================================================================

    const loadStats = async () => {
        if (!selectedVenueId) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await getRecurringGameVenueStats(selectedVenueId);
            setStats(result);
        } catch (err: any) {
            setError(err.message || 'Failed to load statistics');
        } finally {
            setIsLoading(false);
        }
    };

    const loadDuplicates = async () => {
        if (!selectedVenueId) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await findRecurringGameDuplicates(
                selectedVenueId,
                thresholds.duplicateSimilarity
            );
            setDuplicates(result);
        } catch (err: any) {
            setError(err.message || 'Failed to find duplicates');
        } finally {
            setIsLoading(false);
        }
    };

    const runResolvePreview = async () => {
        if (!selectedVenueId) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await reResolveRecurringAssignmentsForVenue(
                selectedVenueId,
                thresholds,
                true // preview only
            );
            setResolveResult(result);
        } catch (err: any) {
            setError(err.message || 'Failed to run preview');
        } finally {
            setIsLoading(false);
        }
    };

    const executeResolve = async () => {
        if (!selectedVenueId) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await reResolveRecurringAssignmentsForVenue(
                selectedVenueId,
                thresholds,
                false // execute for real
            );
            setResolveResult(result);
        } catch (err: any) {
            setError(err.message || 'Failed to execute resolution');
        } finally {
            setIsLoading(false);
        }
    };

    const executeMerge = async (group: DuplicateGroup) => {
        setIsLoading(true);
        setError(null);
        try {
            await mergeRecurringGameDuplicates(
                group.canonicalId,
                group.duplicates.map((d: DuplicateEntry) => d.id),
                false // execute for real
            );
            // Reload duplicates
            await loadDuplicates();
        } catch (err: any) {
            setError(err.message || 'Failed to merge duplicates');
        } finally {
            setIsLoading(false);
        }
    };

    const executeCleanupOrphans = async () => {
        if (!selectedVenueId) return;
        setIsLoading(true);
        setError(null);
        try {
            await cleanupOrphanedRecurringGames(selectedVenueId, false);
            // Reload stats
            await loadStats();
        } catch (err: any) {
            setError(err.message || 'Failed to cleanup orphans');
        } finally {
            setIsLoading(false);
        }
    };

    // ===================================================================
    // BOOTSTRAP FUNCTIONS
    // ===================================================================

    const handleBootstrap = async (preview: boolean) => {
        if (!selectedVenueId) return;
        
        setIsBootstrapping(true);
        setError(null);
        try {
            const result = await bootstrapRecurringGames(selectedVenueId, {
                minGamesForTemplate: bootstrapSettings.minGamesForTemplate,
                similarityThreshold: bootstrapSettings.similarityThreshold,
                preview,
            });
            setBootstrapResult(result);
            
            if (!preview && result.success) {
                // Refresh stats after bootstrap
                await loadStats();
            }
        } catch (err: any) {
            setError(err.message || 'Failed to bootstrap recurring games');
        } finally {
            setIsBootstrapping(false);
        }
    };

    // ===================================================================
    // SCHEDULE/INSTANCE DATA LOADING FUNCTIONS
    // ===================================================================

    const loadComplianceReport = async () => {
        if (!selectedVenueId) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await getVenueComplianceReport(
                selectedVenueId,
                dateRange.startDate,
                dateRange.endDate
            );
            setComplianceReport(result);
        } catch (err: any) {
            setError(err.message || 'Failed to load compliance report');
        } finally {
            setIsLoading(false);
        }
    };

    const detectGaps = async () => {
        if (!selectedVenueId) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await detectRecurringGameGaps(
                selectedVenueId,
                dateRange.startDate,
                dateRange.endDate,
                false // Don't create instances yet
            );
            setGapsResult(result);
        } catch (err: any) {
            setError(err.message || 'Failed to detect gaps');
        } finally {
            setIsLoading(false);
        }
    };

    const executeReconcile = async (preview: boolean = true) => {
        if (!selectedVenueId) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await reconcileRecurringInstances(
                selectedVenueId,
                dateRange.startDate,
                dateRange.endDate,
                preview
            );
            setReconcileResult(result);
        } catch (err: any) {
            setError(err.message || 'Failed to reconcile instances');
        } finally {
            setIsLoading(false);
        }
    };

    const handleRecordMissedInstance = async () => {
        if (!missedInstanceModal.gap) return;
        setIsLoading(true);
        try {
            await recordMissedInstance(
                missedInstanceModal.gap.recurringGameId,
                missedInstanceModal.gap.expectedDate,
                missedInstanceModal.status,
                missedInstanceModal.reason,
                undefined // notes
            );
            setMissedInstanceModal({ isOpen: false, gap: null, status: 'CANCELLED', reason: '' });
            // Reload gaps
            await detectGaps();
        } catch (err: any) {
            setError(err.message || 'Failed to record missed instance');
        } finally {
            setIsLoading(false);
        }
    };

    const createGapInstances = async () => {
        if (!selectedVenueId) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await detectRecurringGameGaps(
                selectedVenueId,
                dateRange.startDate,
                dateRange.endDate,
                true // Create UNKNOWN instances for gaps
            );
            setGapsResult(result);
        } catch (err: any) {
            setError(err.message || 'Failed to create gap instances');
        } finally {
            setIsLoading(false);
        }
    };

    // ===================================================================
    // TAB CONTENT RENDERERS
    // ===================================================================

    const renderStatsTab = () => {
        if (!stats) {
            return (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    {selectedVenueId ? (
                        <Button onClick={loadStats} isLoading={isLoading}>
                            <ChartBarIcon className="h-4 w-4 mr-2" />
                            Load Statistics
                        </Button>
                    ) : (
                        'Select a venue to view statistics'
                    )}
                </div>
            );
        }

        return (
            <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard
                        title="Recurring Games"
                        value={stats.totalRecurringGames}
                        icon={<ArrowPathIcon className="h-5 w-5" />}
                        color="blue"
                    />
                    <StatCard
                        title="Total Games"
                        value={stats.totalGames}
                        icon={<ChartBarIcon className="h-5 w-5" />}
                        color="green"
                    />
                    <StatCard
                        title="Orphaned Templates"
                        value={stats.orphanedRecurringGames}
                        subtitle="No games assigned"
                        icon={<TrashIcon className="h-5 w-5" />}
                        color={stats.orphanedRecurringGames > 0 ? 'amber' : 'green'}
                    />
                    <StatCard
                        title="Unassigned Games"
                        value={stats.unassignedGames}
                        subtitle="Need recurring assignment"
                        icon={<ExclamationTriangleIcon className="h-5 w-5" />}
                        color={stats.unassignedGames > 0 ? 'amber' : 'green'}
                    />
                </div>

                {/* Bootstrap Section - Show when no recurring games but unassigned games exist */}
                {stats.totalRecurringGames === 0 && stats.unassignedGames > 0 && (
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-6">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
                                <SparklesIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div className="flex-1">
                                <h4 className="font-semibold text-purple-900 dark:text-purple-100 mb-1">
                                    Bootstrap Recurring Games
                                </h4>
                                <p className="text-sm text-purple-700 dark:text-purple-300 mb-4">
                                    You have <span className="font-semibold">{stats.unassignedGames}</span> unassigned games. 
                                    Bootstrap will analyze your existing game data and automatically create recurring game 
                                    templates by grouping similar games on the same day of the week.
                                </p>
                                
                                {/* Bootstrap Settings */}
                                <div className="bg-white dark:bg-gray-900 rounded-lg p-4 mb-4 space-y-3">
                                    <div className="flex items-center gap-4">
                                        <label className="text-sm text-gray-700 dark:text-gray-300 w-48">
                                            Min games for template:
                                        </label>
                                        <select
                                            value={bootstrapSettings.minGamesForTemplate}
                                            onChange={(e) => setBootstrapSettings(s => ({ 
                                                ...s, 
                                                minGamesForTemplate: parseInt(e.target.value) 
                                            }))}
                                            className="px-3 py-1.5 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                                        >
                                            <option value={2}>2 games (sensitive)</option>
                                            <option value={3}>3 games (balanced)</option>
                                            <option value={4}>4 games (strict)</option>
                                            <option value={5}>5 games (very strict)</option>
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <label className="text-sm text-gray-700 dark:text-gray-300 w-48">
                                            Name similarity threshold:
                                        </label>
                                        <select
                                            value={bootstrapSettings.similarityThreshold}
                                            onChange={(e) => setBootstrapSettings(s => ({ 
                                                ...s, 
                                                similarityThreshold: parseFloat(e.target.value) 
                                            }))}
                                            className="px-3 py-1.5 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                                        >
                                            <option value={0.6}>60% (lenient)</option>
                                            <option value={0.7}>70% (balanced)</option>
                                            <option value={0.8}>80% (strict)</option>
                                            <option value={0.9}>90% (very strict)</option>
                                        </select>
                                    </div>
                                </div>
                                
                                {/* Bootstrap Actions */}
                                <div className="flex flex-wrap gap-3">
                                    <Button
                                        onClick={() => handleBootstrap(true)}
                                        disabled={isBootstrapping}
                                        variant="secondary"
                                    >
                                        {isBootstrapping ? (
                                            <>
                                                <ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />
                                                Analyzing...
                                            </>
                                        ) : (
                                            <>
                                                <EyeIcon className="h-4 w-4 mr-2" />
                                                Preview Bootstrap
                                            </>
                                        )}
                                    </Button>
                                </div>
                                
                                {/* Bootstrap Results */}
                                {bootstrapResult && (
                                    <div className="mt-4 pt-4 border-t border-purple-200 dark:border-purple-700">
                                        <BootstrapPreviewTable
                                            result={bootstrapResult}
                                            onExecute={() => setConfirmModal({
                                                isOpen: true,
                                                title: 'Execute Bootstrap',
                                                message: `This will create ${bootstrapResult.templateDetails.length} recurring game template(s) and assign ${bootstrapResult.templateDetails.reduce((sum, t) => sum + t.gameCount, 0)} games.`,
                                                action: async () => {
                                                    await handleBootstrap(false);
                                                },
                                                variant: 'warning'
                                            })}
                                            isExecuting={isBootstrapping}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Games by Day */}
                <ExpandableSection title="Recurring Games by Day" defaultOpen>
                    <div className="grid grid-cols-7 gap-2">
                        {['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'].map(day => (
                            <div
                                key={day}
                                className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                            >
                                <p className="text-xs text-gray-500 dark:text-gray-400">{day.slice(0, 3)}</p>
                                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                                    {stats.recurringGamesByDay[day] || 0}
                                </p>
                            </div>
                        ))}
                    </div>
                </ExpandableSection>

                {/* Top Recurring Games */}
                <ExpandableSection
                    title="Top Recurring Games by Instance Count"
                    count={stats.gameDistribution.length}
                >
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {stats.gameDistribution.slice(0, 20).map((game: RecurringGameDistribution) => (
                            <div
                                key={game.id}
                                className="flex items-center justify-between py-2 border-b dark:border-gray-700 last:border-0"
                            >
                                <div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        {game.name}
                                    </p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {game.dayOfWeek}
                                    </p>
                                </div>
                                <span className="text-sm font-mono text-gray-600 dark:text-gray-300">
                                    {game.gameCount} games
                                </span>
                            </div>
                        ))}
                    </div>
                </ExpandableSection>

                {/* Orphans Warning */}
                {stats.orphanedRecurringGames > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                        <div className="flex items-start gap-3">
                            <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0" />
                            <div className="flex-1">
                                <h4 className="font-medium text-amber-800 dark:text-amber-200">
                                    {stats.orphanedRecurringGames} Orphaned Templates
                                </h4>
                                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                                    These recurring game templates have no games assigned to them.
                                </p>
                                <ul className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-300">
                                    {stats.orphans.slice(0, 5).map((orphan: OrphanedRecurringGame) => (
                                        <li key={orphan.id}>• {orphan.name} ({orphan.dayOfWeek})</li>
                                    ))}
                                    {stats.orphans.length > 5 && (
                                        <li className="text-amber-600 dark:text-amber-400">
                                            ... and {stats.orphans.length - 5} more
                                        </li>
                                    )}
                                </ul>
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    className="mt-3"
                                    onClick={() => setActiveTab('orphans')}
                                >
                                    Manage Orphans
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderResolveTab = () => {
        return (
            <div className="space-y-6">
                {/* Threshold Controls */}
                <div className="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-lg p-4">
                    <button
                        onClick={() => setShowThresholds(!showThresholds)}
                        className="flex items-center justify-between w-full"
                    >
                        <div className="flex items-center gap-2">
                            <AdjustmentsHorizontalIcon className="h-5 w-5 text-gray-500" />
                            <span className="font-medium text-gray-900 dark:text-gray-100">
                                Resolution Thresholds
                            </span>
                        </div>
                        {showThresholds ? (
                            <ChevronUpIcon className="h-5 w-5 text-gray-500" />
                        ) : (
                            <ChevronDownIcon className="h-5 w-5 text-gray-500" />
                        )}
                    </button>

                    {showThresholds && (
                        <div className="mt-4 space-y-4 pt-4 border-t dark:border-gray-700">
                            <ThresholdSlider
                                label="High Confidence (Auto-Assign)"
                                value={thresholds.highConfidence}
                                min={50}
                                max={100}
                                onChange={(v) => setThresholds((t: AdminThresholds) => ({ ...t, highConfidence: v }))}
                                description="Scores at or above this threshold will be automatically assigned"
                            />
                            <ThresholdSlider
                                label="Medium Confidence (Pending Review)"
                                value={thresholds.mediumConfidence}
                                min={30}
                                max={80}
                                onChange={(v) => setThresholds((t: AdminThresholds) => ({ ...t, mediumConfidence: v }))}
                                description="Scores between medium and high will require manual review"
                            />
                            <ThresholdSlider
                                label="Cross-Day Suggestion"
                                value={thresholds.crossDaySuggestion}
                                min={40}
                                max={90}
                                onChange={(v) => setThresholds((t: AdminThresholds) => ({ ...t, crossDaySuggestion: v }))}
                                description="Threshold for suggesting matches on different days"
                            />
                            <div className="flex justify-end">
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setThresholds(DEFAULT_ADMIN_THRESHOLDS)}
                                >
                                    Reset to Defaults
                                </Button>
                            </div>
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                    <Button
                        onClick={runResolvePreview}
                        isLoading={isLoading}
                        disabled={!selectedVenueId}
                    >
                        <EyeIcon className="h-4 w-4 mr-2" />
                        Preview Changes
                    </Button>
                    {resolveResult && countPendingChanges(resolveResult.actions) > 0 && (
                        <Button
                            variant="primary"
                            onClick={() => setConfirmModal({
                                isOpen: true,
                                title: 'Apply Resolution Changes',
                                message: `This will apply ${resolveResult.actions.REASSIGN} reassignments to games at ${selectedVenue?.name}. This action cannot be undone.`,
                                action: executeResolve,
                                variant: 'warning'
                            })}
                        >
                            <PlayIcon className="h-4 w-4 mr-2" />
                            Apply Changes
                        </Button>
                    )}
                </div>

                {/* Results */}
                {resolveResult && (
                    <div className="space-y-4">
                        {/* Summary */}
                        <div className="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-lg p-4">
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="font-medium text-gray-900 dark:text-gray-100">
                                    Resolution Preview
                                </h3>
                                {resolveResult.preview ? (
                                    <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-1 rounded">
                                        Preview Mode
                                    </span>
                                ) : (
                                    <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 px-2 py-1 rounded">
                                        Applied
                                    </span>
                                )}
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                                <div>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                        {resolveResult.eligibleGames}
                                    </p>
                                    <p className="text-xs text-gray-500">Evaluated</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                                        {resolveResult.actions.REASSIGN}
                                    </p>
                                    <p className="text-xs text-gray-500">Reassignments</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                                        {resolveResult.actions.CONFIRM}
                                    </p>
                                    <p className="text-xs text-gray-500">Confirmed</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                                        {resolveResult.actions.SUGGEST_REASSIGN + resolveResult.actions.SUGGEST_CROSS_DAY}
                                    </p>
                                    <p className="text-xs text-gray-500">Need Review</p>
                                </div>
                            </div>
                        </div>

                        {/* Action Breakdown */}
                        <ExpandableSection title="Action Breakdown" defaultOpen>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {Object.entries(resolveResult.actions).map(([action, count]) => (
                                    <div key={action} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded">
                                        <ActionBadge action={action} />
                                        <span className="font-mono text-sm">{count as number}</span>
                                    </div>
                                ))}
                            </div>
                        </ExpandableSection>

                        {/* Details */}
                        {resolveResult.details.length > 0 && (
                            <ExpandableSection
                                title="Games with Changes"
                                count={resolveResult.details.length}
                            >
                                <div className="space-y-2 max-h-96 overflow-y-auto">
                                    {resolveResult.details.map((detail: GameActionDetail) => (
                                        <div
                                            key={detail.gameId}
                                            className="flex items-center justify-between py-2 border-b dark:border-gray-700 last:border-0"
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                                                    {detail.gameName}
                                                </p>
                                                {detail.matchDetails && (
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                        {detail.matchDetails.matchedTo && (
                                                            <>→ {detail.matchDetails.matchedTo}</>
                                                        )}
                                                        {detail.matchDetails.score && (
                                                            <span className="ml-2">
                                                                Score: {detail.matchDetails.score}
                                                            </span>
                                                        )}
                                                    </p>
                                                )}
                                            </div>
                                            <ActionBadge action={detail.action} />
                                        </div>
                                    ))}
                                </div>
                            </ExpandableSection>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const renderDuplicatesTab = () => {
        return (
            <div className="space-y-6">
                {/* Controls */}
                <div className="flex items-center gap-4">
                    <Button
                        onClick={loadDuplicates}
                        isLoading={isLoading}
                        disabled={!selectedVenueId}
                    >
                        <DocumentDuplicateIcon className="h-4 w-4 mr-2" />
                        Find Duplicates
                    </Button>
                </div>

                {/* Results */}
                {duplicates && (
                    <div className="space-y-4">
                        {/* Summary */}
                        <div className="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-lg p-4">
                            <div className="grid grid-cols-3 gap-4 text-center">
                                <div>
                                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                                        {duplicates.totalRecurringGames}
                                    </p>
                                    <p className="text-xs text-gray-500">Total Templates</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                                        {duplicates.duplicateGroups}
                                    </p>
                                    <p className="text-xs text-gray-500">Duplicate Groups</p>
                                </div>
                                <div>
                                    <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                                        {duplicates.duplicateEntries}
                                    </p>
                                    <p className="text-xs text-gray-500">Duplicate Entries</p>
                                </div>
                            </div>
                        </div>

                        {/* Duplicate Groups */}
                        {duplicates.groups.length > 0 ? (
                            <div className="space-y-4">
                                {duplicates.groups.map((group: DuplicateGroup) => (
                                    <div
                                        key={group.canonicalId}
                                        className="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-lg overflow-hidden"
                                    >
                                        <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 border-b dark:border-gray-700">
                                            <div className="flex items-center justify-between">
                                                <div>
                                                    <h4 className="font-medium text-gray-900 dark:text-gray-100">
                                                        {group.canonicalName}
                                                    </h4>
                                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                                        {group.canonicalDayOfWeek} • {group.canonicalGameCount} games
                                                    </p>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant="secondary"
                                                    onClick={() => setConfirmModal({
                                                        isOpen: true,
                                                        title: 'Merge Duplicates',
                                                        message: `This will merge ${group.duplicates.length} duplicate(s) into "${group.canonicalName}" and reassign ${group.totalGamesToReassign} games.`,
                                                        action: () => executeMerge(group),
                                                        variant: 'warning'
                                                    })}
                                                >
                                                    Merge All
                                                </Button>
                                            </div>
                                        </div>
                                        <div className="p-4">
                                            <p className="text-xs text-gray-500 mb-2">Duplicates to merge:</p>
                                            <ul className="space-y-2">
                                                {group.duplicates.map((dup: DuplicateEntry) => (
                                                    <li
                                                        key={dup.id}
                                                        className="flex items-center justify-between text-sm py-2 border-b dark:border-gray-700 last:border-0"
                                                    >
                                                        <span className="text-gray-700 dark:text-gray-300">
                                                            {dup.name}
                                                        </span>
                                                        <div className="flex items-center gap-3">
                                                            <span className="text-xs text-gray-500">
                                                                {formatSimilarity(dup.similarity)} similar
                                                            </span>
                                                            <span className="text-xs text-gray-400">
                                                                {dup.gameCount} games
                                                            </span>
                                                        </div>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                <CheckCircleIcon className="h-12 w-12 mx-auto mb-2 text-green-500" />
                                <p>No duplicates found. All recurring games appear to be unique.</p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    const renderOrphansTab = () => {
        if (!stats) {
            return (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                    <Button onClick={loadStats} isLoading={isLoading}>
                        Load Data
                    </Button>
                </div>
            );
        }

        return (
            <div className="space-y-6">
                {stats.orphans.length > 0 ? (
                    <>
                        {/* Cleanup Action */}
                        <div className="flex items-center justify-between">
                            <p className="text-sm text-gray-600 dark:text-gray-300">
                                Found {stats.orphans.length} orphaned recurring game templates
                            </p>
                            <Button
                                variant="destructive"
                                onClick={() => setConfirmModal({
                                    isOpen: true,
                                    title: 'Delete Orphaned Templates',
                                    message: `This will permanently delete ${stats.orphans.length} orphaned recurring game templates. This cannot be undone.`,
                                    action: executeCleanupOrphans,
                                    variant: 'danger'
                                })}
                            >
                                <TrashIcon className="h-4 w-4 mr-2" />
                                Delete All Orphans
                            </Button>
                        </div>

                        {/* Orphan List */}
                        <div className="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-lg overflow-hidden">
                            <table className="w-full">
                                <thead className="bg-gray-50 dark:bg-gray-800">
                                    <tr>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                            Name
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                            Day
                                        </th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                            Created
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {stats.orphans.map((orphan: OrphanedRecurringGame) => (
                                        <tr key={orphan.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                                                {orphan.name}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                                {orphan.dayOfWeek}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                                {orphan.createdAt ? new Date(orphan.createdAt).toLocaleDateString() : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                ) : (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <CheckCircleIcon className="h-12 w-12 mx-auto mb-2 text-green-500" />
                        <p>No orphaned templates found. All recurring games have at least one game assigned.</p>
                    </div>
                )}
            </div>
        );
    };

    const renderScheduleTab = () => {
        return (
            <div className="space-y-6">
                {/* Date Range Selector */}
                <div className="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-lg p-4">
                    <div className="flex flex-wrap items-end gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Start Date
                            </label>
                            <input
                                type="date"
                                value={dateRange.startDate}
                                onChange={(e) => setDateRange(prev => ({ ...prev, startDate: e.target.value }))}
                                className="px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                End Date
                            </label>
                            <input
                                type="date"
                                value={dateRange.endDate}
                                onChange={(e) => setDateRange(prev => ({ ...prev, endDate: e.target.value }))}
                                className="px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                            />
                        </div>
                        <div className="flex gap-2">
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setDateRange(getDateRangeForWeeks(4))}
                            >
                                Last 4 Weeks
                            </Button>
                            <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setDateRange(getDateRangeForWeeks(8))}
                            >
                                Last 8 Weeks
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3">
                    <Button onClick={loadComplianceReport} isLoading={isLoading}>
                        <ChartBarIcon className="h-4 w-4 mr-2" />
                        Load Compliance Report
                    </Button>
                    <Button variant="secondary" onClick={detectGaps} isLoading={isLoading}>
                        <CalendarDaysIcon className="h-4 w-4 mr-2" />
                        Detect Missing Games
                    </Button>
                    <Button variant="secondary" onClick={() => executeReconcile(true)} isLoading={isLoading}>
                        <ArrowsRightLeftIcon className="h-4 w-4 mr-2" />
                        Preview Reconciliation
                    </Button>
                </div>

                {/* Compliance Report */}
                {complianceReport && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                            Schedule Compliance Report
                        </h3>
                        
                        {/* Summary Cards */}
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                            <StatCard
                                title="Expected"
                                value={complianceReport.totalExpected}
                                icon={<CalendarDaysIcon className="h-5 w-5" />}
                                color="blue"
                            />
                            <StatCard
                                title="Confirmed"
                                value={complianceReport.totalConfirmed}
                                icon={<CheckCircleIcon className="h-5 w-5" />}
                                color="green"
                            />
                            <StatCard
                                title="Cancelled"
                                value={complianceReport.totalCancelled + complianceReport.totalSkipped}
                                subtitle={`${complianceReport.totalCancelled} + ${complianceReport.totalSkipped} skipped`}
                                icon={<XMarkIcon className="h-5 w-5" />}
                                color="amber"
                            />
                            <StatCard
                                title="Unknown/Missing"
                                value={complianceReport.totalUnknown}
                                icon={<ExclamationTriangleIcon className="h-5 w-5" />}
                                color={complianceReport.totalUnknown > 0 ? 'red' : 'green'}
                            />
                            <StatCard
                                title="Compliance Rate"
                                value={`${Math.round(complianceReport.overallComplianceRate * 100)}%`}
                                icon={<ChartBarIcon className="h-5 w-5" />}
                                color={complianceReport.overallComplianceRate >= 0.9 ? 'green' : complianceReport.overallComplianceRate >= 0.7 ? 'amber' : 'red'}
                            />
                        </div>

                        {/* Week by Week */}
                        <ExpandableSection 
                            title="Week by Week Breakdown" 
                            count={complianceReport.weekSummaries.length}
                            defaultOpen
                        >
                            <div className="space-y-3">
                                {complianceReport.weekSummaries.map((week: any) => (
                                    <div 
                                        key={week.weekKey}
                                        className="border dark:border-gray-700 rounded-lg p-3"
                                    >
                                        <div className="flex items-center justify-between mb-2">
                                            <div className="flex items-center gap-3">
                                                <span className="font-medium text-gray-900 dark:text-gray-100">
                                                    {formatWeekKey(week.weekKey)}
                                                </span>
                                                {week.weekStartDate && (
                                                    <span className="text-sm text-gray-500 dark:text-gray-400">
                                                        Starting {new Date(week.weekStartDate).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className={cx(
                                                    'px-2 py-1 rounded text-xs font-medium',
                                                    week.complianceRate >= 0.9 ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' :
                                                    week.complianceRate >= 0.7 ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' :
                                                    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
                                                )}>
                                                    {Math.round(week.complianceRate * 100)}%
                                                </span>
                                            </div>
                                        </div>
                                        <div className="flex gap-4 text-sm">
                                            <span className="text-green-600 dark:text-green-400">
                                                ✓ {week.confirmedCount} confirmed
                                            </span>
                                            {week.cancelledCount > 0 && (
                                                <span className="text-red-600 dark:text-red-400">
                                                    ✗ {week.cancelledCount} cancelled
                                                </span>
                                            )}
                                            {week.skippedCount > 0 && (
                                                <span className="text-gray-500 dark:text-gray-400">
                                                    ⊘ {week.skippedCount} skipped
                                                </span>
                                            )}
                                            {week.unknownCount > 0 && (
                                                <span className="text-amber-600 dark:text-amber-400">
                                                    ? {week.unknownCount} unknown
                                                </span>
                                            )}
                                        </div>
                                        
                                        {/* Individual instances */}
                                        {week.instances && week.instances.length > 0 && (
                                            <div className="mt-2 pt-2 border-t dark:border-gray-700">
                                                <div className="grid gap-1">
                                                    {week.instances.map((instance: any) => {
                                                        const statusStyle = getInstanceStatusStyle(instance.status);
                                                        return (
                                                            <div 
                                                                key={instance.id || `${instance.recurringGameId}-${instance.expectedDate}`}
                                                                className="flex items-center justify-between text-sm py-1"
                                                            >
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-gray-600 dark:text-gray-400 w-20">
                                                                        {instance.dayOfWeek?.slice(0, 3)}
                                                                    </span>
                                                                    <span className="text-gray-900 dark:text-gray-100">
                                                                        {instance.recurringGameName}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className={cx('px-2 py-0.5 rounded text-xs', statusStyle.color)}>
                                                                        {statusStyle.label}
                                                                    </span>
                                                                    {instance.needsReview && (
                                                                        <ExclamationTriangleIcon className="h-4 w-4 text-amber-500" />
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </ExpandableSection>
                    </div>
                )}

                {/* Gaps Detection Result */}
                {gapsResult && (
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                                Missing Game Detection
                            </h3>
                            {gapsResult.gapsFound > 0 && (
                                <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => setConfirmModal({
                                        isOpen: true,
                                        title: 'Create Unknown Instances',
                                        message: `This will create ${gapsResult.gapsFound} instance record(s) with status "UNKNOWN" for missing games. You can then review and update each one.`,
                                        action: createGapInstances,
                                        variant: 'warning'
                                    })}
                                >
                                    Create Instance Records
                                </Button>
                            )}
                        </div>

                        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <span className="text-gray-500 dark:text-gray-400">Recurring Games:</span>
                                    <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                                        {gapsResult.recurringGamesChecked}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-gray-500 dark:text-gray-400">Expected:</span>
                                    <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                                        {gapsResult.expectedOccurrences}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-gray-500 dark:text-gray-400">Confirmed:</span>
                                    <span className="ml-2 font-medium text-green-600 dark:text-green-400">
                                        {gapsResult.confirmedOccurrences}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-gray-500 dark:text-gray-400">Gaps Found:</span>
                                    <span className={cx(
                                        'ml-2 font-medium',
                                        gapsResult.gapsFound > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'
                                    )}>
                                        {gapsResult.gapsFound}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {gapsResult.gaps && gapsResult.gaps.length > 0 ? (
                            <div className="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-lg overflow-hidden">
                                <table className="w-full">
                                    <thead className="bg-gray-50 dark:bg-gray-800">
                                        <tr>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                                Date
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                                Day
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                                Recurring Game
                                            </th>
                                            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                                Possible Match
                                            </th>
                                            <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                                                Action
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                                        {gapsResult.gaps.map((gap: GapInfo) => (
                                            <tr key={`${gap.recurringGameId}-${gap.expectedDate}`}>
                                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                                                    {new Date(gap.expectedDate).toLocaleDateString()}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                                    {gap.dayOfWeek}
                                                </td>
                                                <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">
                                                    {gap.recurringGameName}
                                                </td>
                                                <td className="px-4 py-3 text-sm">
                                                    {gap.possibleMatchGameName ? (
                                                        <span className="text-blue-600 dark:text-blue-400">
                                                            {gap.possibleMatchGameName}
                                                            {gap.matchConfidence && (
                                                                <span className="ml-1 text-gray-400">
                                                                    ({Math.round(gap.matchConfidence * 100)}%)
                                                                </span>
                                                            )}
                                                        </span>
                                                    ) : (
                                                        <span className="text-gray-400">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    <Button
                                                        variant="secondary"
                                                        size="sm"
                                                        onClick={() => setMissedInstanceModal({
                                                            isOpen: true,
                                                            gap,
                                                            status: 'CANCELLED',
                                                            reason: ''
                                                        })}
                                                    >
                                                        Record Status
                                                    </Button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : gapsResult.gapsFound === 0 && (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                <CheckCircleIcon className="h-12 w-12 mx-auto mb-2 text-green-500" />
                                <p>No gaps found! All expected games have been confirmed.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Reconciliation Result */}
                {reconcileResult && (
                    <div className="space-y-4">
                        <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100">
                            Reconciliation {reconcileResult.preview ? 'Preview' : 'Result'}
                        </h3>

                        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                <div>
                                    <span className="text-gray-500 dark:text-gray-400">Games Analyzed:</span>
                                    <span className="ml-2 font-medium text-gray-900 dark:text-gray-100">
                                        {reconcileResult.gamesAnalyzed}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-gray-500 dark:text-gray-400">Instances Created:</span>
                                    <span className="ml-2 font-medium text-green-600 dark:text-green-400">
                                        {reconcileResult.instancesCreated}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-gray-500 dark:text-gray-400">Instances Updated:</span>
                                    <span className="ml-2 font-medium text-blue-600 dark:text-blue-400">
                                        {reconcileResult.instancesUpdated}
                                    </span>
                                </div>
                                <div>
                                    <span className="text-gray-500 dark:text-gray-400">Orphan Games:</span>
                                    <span className={cx(
                                        'ml-2 font-medium',
                                        reconcileResult.orphanGames > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-600 dark:text-gray-400'
                                    )}>
                                        {reconcileResult.orphanGames}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {reconcileResult.preview && reconcileResult.instancesCreated > 0 && (
                            <div className="flex justify-end">
                                <Button
                                    onClick={() => setConfirmModal({
                                        isOpen: true,
                                        title: 'Execute Reconciliation',
                                        message: `This will create ${reconcileResult.instancesCreated} instance record(s) for games that have recurring assignments but no tracking instances.`,
                                        action: () => executeReconcile(false),
                                        variant: 'warning'
                                    })}
                                >
                                    <PlayIcon className="h-4 w-4 mr-2" />
                                    Execute Reconciliation
                                </Button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        );
    };

    // ===================================================================
    // MAIN RENDER
    // ===================================================================

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                        Recurring Game Administration
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Manage recurring game assignments, find duplicates, and cleanup orphans
                    </p>
                </div>

                {/* Venue Selector */}
                <div className="w-full md:w-64">
                    <Select
                        value={selectedVenueId}
                        onChange={(e) => handleVenueChange(e.target.value)}
                    >
                        <option value="">Select a venue...</option>
                        {venues.map(venue => (
                            <option key={venue.id} value={venue.id}>
                                {venue.name}
                            </option>
                        ))}
                    </Select>
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                        <XMarkIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
                        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                    </div>
                </div>
            )}

            {/* No Venue Selected */}
            {!selectedVenueId && (
                <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                    <InformationCircleIcon className="h-12 w-12 mx-auto text-gray-400" />
                    <p className="mt-2 text-gray-500 dark:text-gray-400">
                        Select a venue to manage its recurring games
                    </p>
                </div>
            )}

            {/* Tabs & Content */}
            {selectedVenueId && (
                <>
                    {/* Tab Navigation */}
                    <div className="border-b dark:border-gray-700">
                        <nav className="flex gap-4 overflow-x-auto">
                            {[
                                { id: 'stats', label: 'Statistics', icon: ChartBarIcon },
                                { id: 'resolve', label: 'Re-Resolve', icon: ArrowPathIcon },
                                { id: 'duplicates', label: 'Duplicates', icon: DocumentDuplicateIcon },
                                { id: 'orphans', label: 'Orphans', icon: TrashIcon },
                                { id: 'schedule', label: 'Schedule', icon: CalendarDaysIcon },
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as AdminTab)}
                                    className={cx(
                                        'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                                        activeTab === tab.id
                                            ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                                    )}
                                >
                                    <tab.icon className="h-4 w-4" />
                                    {tab.label}
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* Tab Content */}
                    <div className="min-h-[400px]">
                        {activeTab === 'stats' && renderStatsTab()}
                        {activeTab === 'resolve' && renderResolveTab()}
                        {activeTab === 'duplicates' && renderDuplicatesTab()}
                        {activeTab === 'orphans' && renderOrphansTab()}
                        {activeTab === 'schedule' && renderScheduleTab()}
                    </div>
                </>
            )}

            {/* Confirmation Modal */}
            <Modal
                isOpen={confirmModal.isOpen}
                onClose={() => setConfirmModal(m => ({ ...m, isOpen: false }))}
                title={confirmModal.title}
            >
                <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                        {confirmModal.message}
                    </p>
                    <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
                        <Button
                            variant="secondary"
                            onClick={() => setConfirmModal(m => ({ ...m, isOpen: false }))}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant={confirmModal.variant === 'danger' ? 'destructive' : 'primary'}
                            onClick={async () => {
                                await confirmModal.action();
                                setConfirmModal(m => ({ ...m, isOpen: false }));
                            }}
                            isLoading={isLoading}
                        >
                            Confirm
                        </Button>
                    </div>
                </div>
            </Modal>

            {/* Missed Instance Modal */}
            <Modal
                isOpen={missedInstanceModal.isOpen}
                onClose={() => setMissedInstanceModal(m => ({ ...m, isOpen: false }))}
                title="Record Missed Instance"
            >
                <div className="space-y-4">
                    {missedInstanceModal.gap && (
                        <>
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    <span className="font-medium">{missedInstanceModal.gap.recurringGameName}</span>
                                    <br />
                                    {missedInstanceModal.gap.dayOfWeek} • {new Date(missedInstanceModal.gap.expectedDate).toLocaleDateString()}
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Status
                                </label>
                                <select
                                    value={missedInstanceModal.status}
                                    onChange={(e) => setMissedInstanceModal(m => ({ 
                                        ...m, 
                                        status: e.target.value as 'CANCELLED' | 'SKIPPED' | 'NO_SHOW' 
                                    }))}
                                    className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                >
                                    <option value="CANCELLED">Cancelled - Game was explicitly cancelled</option>
                                    <option value="SKIPPED">Skipped - Venue closed / holiday</option>
                                    <option value="NO_SHOW">No Show - Expected but didn&apos;t happen</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                    Reason (optional)
                                </label>
                                <textarea
                                    value={missedInstanceModal.reason}
                                    onChange={(e) => setMissedInstanceModal(m => ({ ...m, reason: e.target.value }))}
                                    placeholder="e.g., Low attendance expected, Public holiday, Venue booked for private event..."
                                    rows={3}
                                    className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                                />
                            </div>
                        </>
                    )}

                    <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
                        <Button
                            variant="secondary"
                            onClick={() => setMissedInstanceModal(m => ({ ...m, isOpen: false }))}
                        >
                            Cancel
                        </Button>
                        <Button
                            onClick={handleRecordMissedInstance}
                            isLoading={isLoading}
                        >
                            Save
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default RecurringGameAdmin;