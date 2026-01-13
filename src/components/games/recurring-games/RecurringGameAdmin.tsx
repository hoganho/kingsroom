// src/components/games/recurring-games/RecurringGameAdmin.tsx
// Comprehensive admin panel for recurring game management
// VERSION 3.1.0 - Added recurring game selector and confirmation screen for schedule tab

import React, { useState, useEffect, useCallback } from 'react';
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
    ClockIcon,
} from '@heroicons/react/24/outline';
import { BulkProcessingResultsTable } from './BulkProcessingResultsTable';
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
    // Instance tracking
    detectRecurringGameGaps,
    reconcileRecurringInstances,
    getVenueComplianceReport,
    recordMissedInstance,
    getDateRangeForWeeks,
    getDateRangeFromFirstGame,
    fetchRecurringGamesByVenue,
    // Bulk processing (v3.0.0)
    getUnassignedGamesStats,
    previewCandidatePatterns,
    processUnassignedGames,
    reprocessDeferredGames,
    // Types
    type RecurringGameVenueStats,
    type FindDuplicatesResult,
    type ReResolveVenueResult,
    type AdminThresholds,
    type DuplicateGroup,
    type DuplicateEntry,
    type GameActionDetail,
    type OrphanedRecurringGame,
    type RecurringGameDistribution,
    type DetectGapsResult,
    type VenueComplianceReport,
    type ReconcileInstancesResult,
    type GapInfo,
    type UnassignedGamesStats,
    type CandidatePattern,
    type ProcessUnassignedGamesResult,
} from '../../../services/recurringGameService';
import { formatAEST } from '../../../utils/dateUtils';

// ===================================================================
// TYPES
// ===================================================================

interface Venue {
    id: string;
    name: string;
    entityId?: string;
}

interface RecurringGameOption {
    id: string;
    name: string;
    dayOfWeek?: string;
    firstGameDate?: string;
}

interface RecurringGameAdminProps {
    venues: Venue[];
    selectedVenueId?: string;
    onVenueChange?: (venueId: string) => void;
    onRefreshRecurringGames?: () => void;
}

type AdminTab = 'stats' | 'resolve' | 'duplicates' | 'orphans' | 'schedule';

// ===================================================================
// SUB-COMPONENTS
// ===================================================================

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
        {description && <p className="text-xs text-gray-500 dark:text-gray-400">{description}</p>}
    </div>
);

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
                <div className={cx('p-2 rounded-lg', colors[color])}>{icon}</div>
                <div>
                    <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{value}</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">{title}</p>
                    {subtitle && <p className="text-xs text-gray-400 dark:text-gray-500">{subtitle}</p>}
                </div>
            </div>
        </div>
    );
};

const ActionBadge: React.FC<{ action: string }> = ({ action }) => {
    const { label, color } = getActionDescription(action);
    return (
        <span className={cx('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', color)}>
            {label}
        </span>
    );
};

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
                {isOpen ? <ChevronUpIcon className="h-5 w-5 text-gray-500" /> : <ChevronDownIcon className="h-5 w-5 text-gray-500" />}
            </button>
            {isOpen && <div className="p-4 bg-white dark:bg-gray-900">{children}</div>}
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
    onRefreshRecurringGames,
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
    const [, setReconcileResult] = useState<ReconcileInstancesResult | null>(null);
    const [dateRange, setDateRange] = useState<{ startDate: string; endDate: string }>(getDateRangeForWeeks(4));
    const [missedInstanceModal, setMissedInstanceModal] = useState<{
        isOpen: boolean;
        gap: GapInfo | null;
        status: 'CANCELLED' | 'SKIPPED' | 'NO_SHOW';
        reason: string;
    }>({ isOpen: false, gap: null, status: 'CANCELLED', reason: '' });

    // Schedule tab - recurring game selection
    const [recurringGamesList, setRecurringGamesList] = useState<RecurringGameOption[]>([]);
    const [selectedRecurringGameId, setSelectedRecurringGameId] = useState<string>(''); // empty = all games
    const [scheduleCreationResult, setScheduleCreationResult] = useState<{
        success: boolean;
        instancesCreated: number;
        gapsFound: number;
        recurringGameName: string;
        dateRange: { startDate: string; endDate: string };
    } | null>(null);

    // Bulk Processing state (v3.0.0)
    const [bulkStats, setBulkStats] = useState<UnassignedGamesStats | null>(null);
    const [candidatePatterns, setCandidatePatterns] = useState<CandidatePattern[]>([]);
    const [bulkResult, setBulkResult] = useState<ProcessUnassignedGamesResult | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processingOptions, setProcessingOptions] = useState({
        limit: 100,
        autoCreate: true,
        requirePatternConfirmation: true,
        batchSize: 10,
    });


    const handleVenueChange = (venueId: string) => {
        setSelectedVenueId(venueId);
        setStats(null);
        setDuplicates(null);
        setResolveResult(null);
        setComplianceReport(null);
        setGapsResult(null);
        setReconcileResult(null);
        setBulkStats(null);
        setCandidatePatterns([]);
        setBulkResult(null);
        setError(null);
        // Reset schedule tab state
        setRecurringGamesList([]);
        setSelectedRecurringGameId('');
        setScheduleCreationResult(null);
        onVenueChange?.(venueId);
    };

    useEffect(() => {
        if (selectedVenueId && activeTab === 'stats') {
            loadStats();
            loadBulkStats();
        }
    }, [selectedVenueId, activeTab]);

    // Load recurring games when schedule tab is opened
    useEffect(() => {
        if (selectedVenueId && activeTab === 'schedule') {
            loadRecurringGamesForVenue();
        }
    }, [selectedVenueId, activeTab]);

    // ===================================================================
    // DATA LOADING FUNCTIONS
    // ===================================================================

    const loadRecurringGamesForVenue = async () => {
        if (!selectedVenueId) return;
        try {
            const games = await fetchRecurringGamesByVenue(selectedVenueId);
            // Sort by name for better UX
            const sorted = games
                .filter(g => g.isActive !== false)
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                .map(g => ({
                    id: g.id,
                    name: g.name || 'Unnamed',
                    dayOfWeek: g.dayOfWeek || undefined,
                    firstGameDate: g.firstGameDate || undefined,
                }));
            setRecurringGamesList(sorted);
        } catch (err: any) {
            console.error('[loadRecurringGamesForVenue] Error:', err);
        }
    };

    const handleSinceFirstGame = async () => {
        if (!selectedVenueId) return;
        setIsLoading(true);
        setError(null);
        try {
            // If a specific recurring game is selected, use its firstGameDate
            if (selectedRecurringGameId) {
                const selectedGame = recurringGamesList.find(g => g.id === selectedRecurringGameId);
                if (selectedGame?.firstGameDate) {
                    const startDate = selectedGame.firstGameDate.split('T')[0]; // Extract date from ISO datetime
                    const endDate = new Date().toISOString().split('T')[0];
                    setDateRange({ startDate, endDate });
                    console.log('[handleSinceFirstGame] Set date range from selected game:', { startDate, endDate });
                } else {
                    setError('Selected recurring game does not have a first game date recorded');
                }
            } else {
                // Use venue-wide first game date
                const result = await getDateRangeFromFirstGame(selectedVenueId);
                if (result.success) {
                    setDateRange({ startDate: result.startDate, endDate: result.endDate });
                    console.log('[handleSinceFirstGame] Set date range:', result);
                } else {
                    setError(result.error || 'Failed to get first game date');
                }
            }
        } catch (err: any) {
            console.error('[handleSinceFirstGame] Error:', err);
            setError(err.message || 'Failed to get first game date');
        } finally {
            setIsLoading(false);
        }
    };

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

    const loadBulkStats = async () => {
        if (!selectedVenueId) return;
        try {
            const result = await getUnassignedGamesStats(selectedVenueId);
            setBulkStats(result);
        } catch (err: any) {
            console.error('Failed to load bulk stats:', err);
        }
    };

    const loadCandidatePatterns = async () => {
        if (!selectedVenueId) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await previewCandidatePatterns(selectedVenueId, 2);
            setCandidatePatterns(result.patterns);
        } catch (err: any) {
            setError(err.message || 'Failed to load patterns');
        } finally {
            setIsLoading(false);
        }
    };

    const loadDuplicates = async () => {
        if (!selectedVenueId) return;
        setIsLoading(true);
        setError(null);
        try {
            const result = await findRecurringGameDuplicates(selectedVenueId, thresholds.duplicateSimilarity);
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
            const result = await reResolveRecurringAssignmentsForVenue(selectedVenueId, thresholds, true);
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
            const result = await reResolveRecurringAssignmentsForVenue(selectedVenueId, thresholds, false);
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
            await mergeRecurringGameDuplicates(group.canonicalId, group.duplicates.map((d: DuplicateEntry) => d.id), false);
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
            await loadStats();
        } catch (err: any) {
            setError(err.message || 'Failed to cleanup orphans');
        } finally {
            setIsLoading(false);
        }
    };

    // ===================================================================
    // BULK PROCESSING FUNCTIONS (v3.0.0)
    // ===================================================================

    const handleProcessUnassigned = useCallback(async (dryRun: boolean = false) => {
        if (!selectedVenueId) return;
        
        setIsProcessing(true);
        setError(null);
        setBulkResult(null);
        
        try {
            const result = await processUnassignedGames({
                venueId: selectedVenueId,
                limit: processingOptions.limit,
                autoCreate: processingOptions.autoCreate,
                requirePatternConfirmation: processingOptions.requirePatternConfirmation,
                dryRun,
                batchSize: processingOptions.batchSize,
            });
            
            setBulkResult(result);
            
            if (!dryRun && result.success) {
                await loadStats();
                await loadBulkStats();
                onRefreshRecurringGames?.();
            }
        } catch (err: any) {
            setError(err.message || 'Failed to process unassigned games');
        } finally {
            setIsProcessing(false);
        }
    }, [selectedVenueId, processingOptions, onRefreshRecurringGames]);

    const handleReprocessDeferred = useCallback(async () => {
        if (!selectedVenueId) return;
        
        setIsProcessing(true);
        setError(null);
        setBulkResult(null);
        
        try {
            const result = await reprocessDeferredGames({
                venueId: selectedVenueId,
                limit: processingOptions.limit,
            });
            
            setBulkResult(result);
            
            if (result.success) {
                await loadStats();
                await loadBulkStats();
                onRefreshRecurringGames?.();
            }
        } catch (err: any) {
            setError(err.message || 'Failed to reprocess deferred games');
        } finally {
            setIsProcessing(false);
        }
    }, [selectedVenueId, processingOptions.limit, onRefreshRecurringGames]);

    // ===================================================================
    // SCHEDULE/INSTANCE FUNCTIONS
    // ===================================================================

    // Helper to validate date range
    const validateDateRange = (): { valid: boolean; error?: string; daysDiff?: number } => {
        if (!selectedVenueId) {
            return { valid: false, error: 'Please select a venue first' };
        }
        const start = new Date(dateRange.startDate);
        const end = new Date(dateRange.endDate);
        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
            return { valid: false, error: 'Invalid date format' };
        }
        if (end < start) {
            return { valid: false, error: 'End date must be after start date' };
        }
        const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        // Allow up to 4 years (~1460 days) - weekly games would generate ~200 instances per recurring game
        if (daysDiff > 1460) {
            return { valid: false, error: `Date range is ${daysDiff} days (~${Math.round(daysDiff/365)} years). Please select 4 years or less.`, daysDiff };
        }
        return { valid: true, daysDiff };
    };

    const loadComplianceReport = async () => {
        const validation = validateDateRange();
        if (!validation.valid) {
            setError(validation.error || 'Invalid input');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            console.log('[loadComplianceReport] Calling:', { venueId: selectedVenueId, ...dateRange });
            const result = await getVenueComplianceReport(selectedVenueId!, dateRange.startDate, dateRange.endDate);
            console.log('[loadComplianceReport] Result:', result);
            if (!result.success) {
                throw new Error((result as any).error || 'Operation failed');
            }
            setComplianceReport(result);
        } catch (err: any) {
            console.error('[loadComplianceReport] Error:', err);
            const msg = err.errors?.[0]?.message || err.message || 'Failed to load compliance report';
            setError(`Compliance Report: ${msg}`);
        } finally {
            setIsLoading(false);
        }
    };

    const detectGaps = async () => {
        const validation = validateDateRange();
        if (!validation.valid) {
            setError(validation.error || 'Invalid input');
            return;
        }
        setIsLoading(true);
        setError(null);
        setGapsResult(null);
        try {
            console.log('[detectGaps] Calling:', { venueId: selectedVenueId, ...dateRange, createInstances: false });
            const result = await detectRecurringGameGaps(selectedVenueId!, dateRange.startDate, dateRange.endDate, false);
            console.log('[detectGaps] Result:', result);
            if (!result.success) {
                throw new Error((result as any).error || 'Operation failed');
            }
            setGapsResult(result);
            if (result.gapsFound === 0) {
                // No error, but also show a message
                console.log('[detectGaps] No gaps found - schedule is complete');
            }
        } catch (err: any) {
            console.error('[detectGaps] Error:', err);
            const msg = err.errors?.[0]?.message || err.message || 'Failed to detect gaps';
            setError(`Detect Gaps: ${msg}`);
        } finally {
            setIsLoading(false);
        }
    };

    const executeReconcile = async (preview: boolean = true) => {
        const validation = validateDateRange();
        if (!validation.valid) {
            setError(validation.error || 'Invalid input');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            console.log('[executeReconcile] Calling:', { venueId: selectedVenueId, ...dateRange, preview });
            const result = await reconcileRecurringInstances(selectedVenueId!, dateRange.startDate, dateRange.endDate, preview);
            console.log('[executeReconcile] Result:', result);
            setReconcileResult(result);
        } catch (err: any) {
            console.error('[executeReconcile] Error:', err);
            const msg = err.errors?.[0]?.message || err.message || 'Failed to reconcile instances';
            setError(`Reconcile: ${msg}`);
        } finally {
            setIsLoading(false);
        }
    };

    const handleRecordMissedInstance = async () => {
        if (!missedInstanceModal.gap) return;
        setIsLoading(true);
        try {
            console.log('[handleRecordMissedInstance] Recording:', missedInstanceModal);
            await recordMissedInstance(
                missedInstanceModal.gap.recurringGameId,
                missedInstanceModal.gap.expectedDate,
                missedInstanceModal.status,
                missedInstanceModal.reason,
                undefined
            );
            setMissedInstanceModal({ isOpen: false, gap: null, status: 'CANCELLED', reason: '' });
            await detectGaps();
        } catch (err: any) {
            console.error('[handleRecordMissedInstance] Error:', err);
            const msg = err.errors?.[0]?.message || err.message || 'Failed to record missed instance';
            setError(`Record Instance: ${msg}`);
        } finally {
            setIsLoading(false);
        }
    };

    const createGapInstances = async () => {
        const validation = validateDateRange();
        if (!validation.valid) {
            setError(validation.error || 'Invalid input');
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            console.log('[createGapInstances] Calling with createInstances=true:', { venueId: selectedVenueId, ...dateRange });
            const result = await detectRecurringGameGaps(selectedVenueId!, dateRange.startDate, dateRange.endDate, true);
            console.log('[createGapInstances] Result:', result);
            setGapsResult(result);
            
            // Set confirmation result
            const selectedGame = selectedRecurringGameId 
                ? recurringGamesList.find(g => g.id === selectedRecurringGameId)
                : null;
            setScheduleCreationResult({
                success: result.success,
                instancesCreated: result.instancesCreated || 0,
                gapsFound: result.gapsFound,
                recurringGameName: selectedGame?.name || 'All Recurring Games',
                dateRange: { ...dateRange },
            });
        } catch (err: any) {
            console.error('[createGapInstances] Error:', err);
            const msg = err.errors?.[0]?.message || err.message || 'Failed to create gap instances';
            setError(`Create Instances: ${msg}`);
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
                    ) : 'Select a venue to view statistics'}
                </div>
            );
        }

        const unprocessedCount = bulkStats ? bulkStats.unprocessed + bulkStats.candidateRecurring : stats.unassignedGames;
        const overallUnprocessedCount = bulkStats ? (bulkStats.overallUnprocessed || 0) + (bulkStats.overallCandidateRecurring || 0) : 0;

        return (
            <div className="space-y-6">
                {/* Summary Cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <StatCard title="Recurring Games" value={stats.totalRecurringGames} icon={<ArrowPathIcon className="h-5 w-5" />} color="blue" />
                    <StatCard title="Total Games" value={stats.totalGames} subtitle={bulkStats?.overallTotal ? `${bulkStats.overallTotal} overall` : undefined} icon={<ChartBarIcon className="h-5 w-5" />} color="green" />
                    <StatCard title="Orphaned Templates" value={stats.orphanedRecurringGames} subtitle="No games assigned" icon={<TrashIcon className="h-5 w-5" />} color={stats.orphanedRecurringGames > 0 ? 'amber' : 'green'} />
                    <StatCard title="Unassigned Games" value={unprocessedCount} subtitle={overallUnprocessedCount > 0 ? `${overallUnprocessedCount} overall` : "Need recurring assignment"} icon={<ExclamationTriangleIcon className="h-5 w-5" />} color={unprocessedCount > 0 ? 'amber' : 'green'} />
                </div>

                {/* Bulk Processing Section */}
                {unprocessedCount > 0 && (
                    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-6">
                        <div className="flex items-start gap-4">
                            <div className="p-3 bg-purple-100 dark:bg-purple-900/40 rounded-lg">
                                <SparklesIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                            </div>
                            <div className="flex-1">
                                <h4 className="font-semibold text-purple-900 dark:text-purple-100 mb-1">
                                    Process Unassigned Games
                                </h4>
                                <p className="text-sm text-purple-700 dark:text-purple-300 mb-4">
                                    {stats.totalRecurringGames === 0 ? (
                                        <>You have <span className="font-semibold">{unprocessedCount}</span> unassigned games. Process them to automatically create recurring game templates.</>
                                    ) : (
                                        <><span className="font-semibold">{unprocessedCount}</span> games need assignment. Process them to match with existing templates or create new ones.</>
                                    )}
                                </p>

                                {/* Bulk Stats Summary - Venue & Overall */}
                                {bulkStats && (
                                    <div className="space-y-3 mb-4">
                                        {/* Venue Stats */}
                                        <div>
                                            <div className="text-xs font-medium text-purple-600 dark:text-purple-400 mb-2 uppercase tracking-wide">
                                                Selected Venue
                                            </div>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center">
                                                    <div className="text-lg font-bold text-gray-900 dark:text-white">{bulkStats.unprocessed}</div>
                                                    <div className="text-xs text-gray-500">Never Processed</div>
                                                </div>
                                                <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center">
                                                    <div className="text-lg font-bold text-amber-600">{bulkStats.candidateRecurring}</div>
                                                    <div className="text-xs text-gray-500">Deferred</div>
                                                </div>
                                                <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center">
                                                    <div className="text-lg font-bold text-green-600">{bulkStats.assigned}</div>
                                                    <div className="text-xs text-gray-500">Assigned</div>
                                                </div>
                                                <div className="bg-white dark:bg-gray-900 rounded-lg p-3 text-center">
                                                    <div className="text-lg font-bold text-gray-500">{bulkStats.notRecurring}</div>
                                                    <div className="text-xs text-gray-500">Not Recurring</div>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {/* Overall Stats */}
                                        {bulkStats.overallTotal !== undefined && bulkStats.overallTotal > 0 && (
                                            <div>
                                                <div className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 uppercase tracking-wide">
                                                    All Venues (Overall)
                                                </div>
                                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center border border-gray-200 dark:border-gray-700">
                                                        <div className="text-lg font-bold text-gray-700 dark:text-gray-300">{bulkStats.overallUnprocessed}</div>
                                                        <div className="text-xs text-gray-400">Never Processed</div>
                                                    </div>
                                                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center border border-gray-200 dark:border-gray-700">
                                                        <div className="text-lg font-bold text-amber-500">{bulkStats.overallCandidateRecurring}</div>
                                                        <div className="text-xs text-gray-400">Deferred</div>
                                                    </div>
                                                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center border border-gray-200 dark:border-gray-700">
                                                        <div className="text-lg font-bold text-green-500">{bulkStats.overallAssigned}</div>
                                                        <div className="text-xs text-gray-400">Assigned</div>
                                                    </div>
                                                    <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3 text-center border border-gray-200 dark:border-gray-700">
                                                        <div className="text-lg font-bold text-gray-400">{bulkStats.overallNotRecurring}</div>
                                                        <div className="text-xs text-gray-400">Not Recurring</div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                {/* Processing Options */}
                                <div className="bg-white dark:bg-gray-900 rounded-lg p-4 mb-4 space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="flex items-center gap-4">
                                            <label className="text-sm text-gray-700 dark:text-gray-300 w-32">Limit:</label>
                                            <select
                                                value={processingOptions.limit}
                                                onChange={(e) => setProcessingOptions(s => ({ ...s, limit: parseInt(e.target.value) }))}
                                                className="px-3 py-1.5 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm"
                                            >
                                                <option value={25}>25 games</option>
                                                <option value={50}>50 games</option>
                                                <option value={100}>100 games</option>
                                                <option value={200}>200 games</option>
                                                <option value={500}>500 games</option>
                                            </select>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <input type="checkbox" id="autoCreate" checked={processingOptions.autoCreate} onChange={(e) => setProcessingOptions(s => ({ ...s, autoCreate: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                                            <label htmlFor="autoCreate" className="text-sm text-gray-700 dark:text-gray-300">Auto-create templates</label>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <input type="checkbox" id="requirePattern" checked={processingOptions.requirePatternConfirmation} onChange={(e) => setProcessingOptions(s => ({ ...s, requirePatternConfirmation: e.target.checked }))} className="w-4 h-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500" />
                                            <label htmlFor="requirePattern" className="text-sm text-gray-700 dark:text-gray-300">Require 2+ games for new templates</label>
                                        </div>
                                    </div>
                                </div>
                                
                                {/* Processing Actions */}
                                <div className="flex flex-wrap gap-3">
                                    <Button onClick={() => handleProcessUnassigned(true)} disabled={isProcessing} variant="secondary">
                                        {isProcessing ? <><ArrowPathIcon className="h-4 w-4 mr-2 animate-spin" />Processing...</> : <><EyeIcon className="h-4 w-4 mr-2" />Preview (Dry Run)</>}
                                    </Button>
                                    <Button onClick={() => setConfirmModal({ isOpen: true, title: 'Process Unassigned Games', message: `This will process up to ${processingOptions.limit} unassigned games.`, action: async () => { await handleProcessUnassigned(false); }, variant: 'warning' })} disabled={isProcessing} variant="primary">
                                        <PlayIcon className="h-4 w-4 mr-2" />Process Games
                                    </Button>
                                    {bulkStats && bulkStats.candidateRecurring > 0 && (
                                        <Button onClick={() => setConfirmModal({ isOpen: true, title: 'Reprocess Deferred Games', message: `Force template creation for ${bulkStats.candidateRecurring} deferred games.`, action: handleReprocessDeferred, variant: 'warning' })} disabled={isProcessing} variant="secondary">
                                            <ClockIcon className="h-4 w-4 mr-2" />Reprocess {bulkStats.candidateRecurring} Deferred
                                        </Button>
                                    )}
                                    <Button onClick={loadCandidatePatterns} disabled={isLoading} variant="secondary">
                                        <DocumentDuplicateIcon className="h-4 w-4 mr-2" />Preview Patterns
                                    </Button>
                                </div>
                                
                                {/* Candidate Patterns Preview */}
                                {candidatePatterns.length > 0 && (
                                    <div className="mt-4 pt-4 border-t border-purple-200 dark:border-purple-700">
                                        <h5 className="font-medium text-purple-900 dark:text-purple-100 mb-3">Candidate Patterns ({candidatePatterns.length})</h5>
                                        <div className="space-y-2 max-h-64 overflow-y-auto">
                                            {candidatePatterns.map((pattern, idx) => (
                                                <div key={idx} className="bg-white dark:bg-gray-900 rounded-lg p-3 flex items-center justify-between">
                                                    <div>
                                                        <span className="font-medium text-gray-900 dark:text-gray-100">{pattern.suggestedName}</span>
                                                        <div className="flex gap-2 mt-1">
                                                            <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300 rounded">{pattern.dayOfWeek}</span>
                                                            <span className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-300 rounded">{pattern.sessionMode}</span>
                                                            {pattern.variant && <span className="text-xs px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300 rounded">{pattern.variant}</span>}
                                                        </div>
                                                    </div>
                                                    <div className="text-right">
                                                        <span className="text-lg font-semibold text-gray-900 dark:text-white">{pattern.gameCount}</span>
                                                        <div className="text-xs text-gray-500">games</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                
                                {/* Processing Results */}
                                {bulkResult && (
                                    <div className="mt-4 pt-4 border-t border-purple-200 dark:border-purple-700">
                                        <BulkProcessingResultsTable result={bulkResult} onExecute={bulkResult.dryRun ? () => handleProcessUnassigned(false) : undefined} isExecuting={isProcessing} />
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
                            <div key={day} className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                <p className="text-xs text-gray-500 dark:text-gray-400">{day.slice(0, 3)}</p>
                                <p className="text-lg font-bold text-gray-900 dark:text-gray-100">{stats.recurringGamesByDay[day] || 0}</p>
                            </div>
                        ))}
                    </div>
                </ExpandableSection>

                {/* Top Recurring Games */}
                <ExpandableSection title="Top Recurring Games by Instance Count" count={stats.gameDistribution.length}>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                        {stats.gameDistribution.slice(0, 20).map((game: RecurringGameDistribution) => (
                            <div key={game.id} className="flex items-center justify-between py-2 border-b dark:border-gray-700 last:border-0">
                                <div>
                                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{game.name}</p>
                                    <p className="text-xs text-gray-500 dark:text-gray-400">{game.dayOfWeek}</p>
                                </div>
                                <span className="text-sm font-mono text-gray-600 dark:text-gray-300">{game.gameCount} games</span>
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
                                <h4 className="font-medium text-amber-800 dark:text-amber-200">{stats.orphanedRecurringGames} Orphaned Templates</h4>
                                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">These recurring game templates have no games assigned.</p>
                                <ul className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-300">
                                    {stats.orphans.slice(0, 5).map((orphan: OrphanedRecurringGame) => <li key={orphan.id}>• {orphan.name} ({orphan.dayOfWeek})</li>)}
                                    {stats.orphans.length > 5 && <li className="text-amber-600 dark:text-amber-400">... and {stats.orphans.length - 5} more</li>}
                                </ul>
                                <Button variant="secondary" size="sm" className="mt-3" onClick={() => setActiveTab('orphans')}>Manage Orphans</Button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderResolveTab = () => (
        <div className="space-y-6">
            <div className="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-lg p-4">
                <button onClick={() => setShowThresholds(!showThresholds)} className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-2">
                        <AdjustmentsHorizontalIcon className="h-5 w-5 text-gray-500" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">Resolution Thresholds</span>
                    </div>
                    {showThresholds ? <ChevronUpIcon className="h-5 w-5 text-gray-500" /> : <ChevronDownIcon className="h-5 w-5 text-gray-500" />}
                </button>
                {showThresholds && (
                    <div className="mt-4 space-y-4 pt-4 border-t dark:border-gray-700">
                        <ThresholdSlider label="High Confidence (Auto-Assign)" value={thresholds.highConfidence} min={50} max={100} onChange={(v) => setThresholds(t => ({ ...t, highConfidence: v }))} description="Scores at or above this threshold will be automatically assigned" />
                        <ThresholdSlider label="Medium Confidence (Pending Review)" value={thresholds.mediumConfidence} min={30} max={80} onChange={(v) => setThresholds(t => ({ ...t, mediumConfidence: v }))} description="Scores between medium and high will require manual review" />
                        <ThresholdSlider label="Cross-Day Suggestion" value={thresholds.crossDaySuggestion} min={40} max={90} onChange={(v) => setThresholds(t => ({ ...t, crossDaySuggestion: v }))} description="Threshold for suggesting matches on different days" />
                        <div className="flex justify-end"><Button variant="secondary" size="sm" onClick={() => setThresholds(DEFAULT_ADMIN_THRESHOLDS)}>Reset to Defaults</Button></div>
                    </div>
                )}
            </div>
            <div className="flex gap-3">
                <Button onClick={runResolvePreview} isLoading={isLoading} disabled={!selectedVenueId}><EyeIcon className="h-4 w-4 mr-2" />Preview Changes</Button>
                {resolveResult && countPendingChanges(resolveResult.actions) > 0 && (
                    <Button variant="primary" onClick={() => setConfirmModal({ isOpen: true, title: 'Apply Resolution Changes', message: `This will apply ${resolveResult.actions.REASSIGN} reassignments.`, action: executeResolve, variant: 'warning' })}><PlayIcon className="h-4 w-4 mr-2" />Apply Changes</Button>
                )}
            </div>
            {resolveResult && (
                <div className="space-y-4">
                    <div className="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-medium text-gray-900 dark:text-gray-100">Resolution Preview</h3>
                            {resolveResult.preview ? <span className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 px-2 py-1 rounded">Preview</span> : <span className="text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 px-2 py-1 rounded">Applied</span>}
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                            <div><p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{resolveResult.eligibleGames}</p><p className="text-xs text-gray-500">Evaluated</p></div>
                            <div><p className="text-2xl font-bold text-blue-600">{resolveResult.actions.REASSIGN}</p><p className="text-xs text-gray-500">Reassignments</p></div>
                            <div><p className="text-2xl font-bold text-green-600">{resolveResult.actions.CONFIRM}</p><p className="text-xs text-gray-500">Confirmed</p></div>
                            <div><p className="text-2xl font-bold text-amber-600">{resolveResult.actions.SUGGEST_REASSIGN + resolveResult.actions.SUGGEST_CROSS_DAY}</p><p className="text-xs text-gray-500">Need Review</p></div>
                        </div>
                    </div>
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
                    <ExpandableSection title="Game Details" count={resolveResult.details.length}>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                            {resolveResult.details.slice(0, 50).map((detail: GameActionDetail) => (
                                <div key={detail.gameId} className="flex items-center justify-between py-2 border-b dark:border-gray-700 last:border-0">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{detail.gameName}</p>
                                        {detail.matchDetails && <p className="text-xs text-gray-500">→ {detail.matchDetails.matchedTo} ({detail.matchDetails.score}%)</p>}
                                    </div>
                                    <ActionBadge action={detail.action} />
                                </div>
                            ))}
                            {resolveResult.details.length > 50 && <p className="text-sm text-gray-500 text-center py-2">... and {resolveResult.details.length - 50} more</p>}
                        </div>
                    </ExpandableSection>
                </div>
            )}
        </div>
    );

    const renderDuplicatesTab = () => (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h3 className="font-medium text-gray-900 dark:text-gray-100">Find Duplicate Templates</h3><p className="text-sm text-gray-500">Identify and merge duplicate recurring game entries</p></div>
                <Button onClick={loadDuplicates} isLoading={isLoading}><DocumentDuplicateIcon className="h-4 w-4 mr-2" />Scan for Duplicates</Button>
            </div>
            <div className="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-lg p-4">
                <ThresholdSlider label="Similarity Threshold" value={thresholds.duplicateSimilarity} min={0.5} max={1.0} step={0.05} isPercent onChange={(v) => setThresholds(t => ({ ...t, duplicateSimilarity: v }))} description="Names with similarity at or above this threshold are considered duplicates" />
            </div>
            {duplicates && (
                <div className="space-y-4">
                    <div className="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-lg p-4">
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div><p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{duplicates.totalRecurringGames}</p><p className="text-xs text-gray-500">Total Templates</p></div>
                            <div><p className="text-2xl font-bold text-amber-600">{duplicates.duplicateGroups}</p><p className="text-xs text-gray-500">Duplicate Groups</p></div>
                            <div><p className="text-2xl font-bold text-red-600">{duplicates.duplicateEntries}</p><p className="text-xs text-gray-500">Duplicate Entries</p></div>
                        </div>
                    </div>
                    {duplicates.groups.length === 0 ? (
                        <div className="text-center py-8 bg-green-50 dark:bg-green-900/20 rounded-lg"><CheckCircleIcon className="h-12 w-12 mx-auto text-green-600" /><p className="mt-2 text-green-700 dark:text-green-300">No duplicates found!</p></div>
                    ) : (
                        <div className="space-y-4">
                            {duplicates.groups.map((group: DuplicateGroup) => (
                                <div key={group.canonicalId} className="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-lg p-4">
                                    <div className="flex items-start justify-between mb-3">
                                        <div><p className="font-medium text-gray-900 dark:text-gray-100">{group.canonicalName}</p><p className="text-xs text-gray-500">{group.canonicalDayOfWeek} • {group.canonicalGameCount} games (canonical)</p></div>
                                        <Button variant="secondary" size="sm" onClick={() => setConfirmModal({ isOpen: true, title: 'Merge Duplicates', message: `Merge ${group.duplicates.length} duplicates into "${group.canonicalName}" and reassign ${group.totalGamesToReassign} games.`, action: async () => executeMerge(group), variant: 'warning' })}>Merge All</Button>
                                    </div>
                                    <div className="space-y-2">
                                        {group.duplicates.map((dup: DuplicateEntry) => (
                                            <div key={dup.id} className="flex items-center justify-between py-2 px-3 bg-amber-50 dark:bg-amber-900/20 rounded">
                                                <div><p className="text-sm text-gray-900 dark:text-gray-100">{dup.name}</p><p className="text-xs text-gray-500">{dup.gameCount} games</p></div>
                                                <span className="text-xs font-mono text-amber-700 dark:text-amber-300">{formatSimilarity(dup.similarity)} similar</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );

    const renderOrphansTab = () => (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div><h3 className="font-medium text-gray-900 dark:text-gray-100">Orphaned Templates</h3><p className="text-sm text-gray-500">Recurring game templates with no games assigned</p></div>
                <div className="flex gap-2">
                    <Button onClick={loadStats} isLoading={isLoading} variant="secondary"><ArrowPathIcon className="h-4 w-4 mr-2" />Refresh</Button>
                    {stats && stats.orphanedRecurringGames > 0 && (
                        <Button variant="destructive" onClick={() => setConfirmModal({ isOpen: true, title: 'Cleanup Orphaned Templates', message: `Deactivate ${stats.orphanedRecurringGames} orphaned templates? This cannot be undone.`, action: executeCleanupOrphans, variant: 'danger' })}><TrashIcon className="h-4 w-4 mr-2" />Cleanup All</Button>
                    )}
                </div>
            </div>
            {stats && (stats.orphanedRecurringGames === 0 ? (
                <div className="text-center py-8 bg-green-50 dark:bg-green-900/20 rounded-lg"><CheckCircleIcon className="h-12 w-12 mx-auto text-green-600" /><p className="mt-2 text-green-700 dark:text-green-300">No orphaned templates!</p></div>
            ) : (
                <div className="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-lg overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-800"><tr><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Day</th><th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Created</th></tr></thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                            {stats.orphans.map((orphan: OrphanedRecurringGame) => (
                                <tr key={orphan.id}><td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100">{orphan.name}</td><td className="px-4 py-3 text-sm text-gray-500">{orphan.dayOfWeek}</td><td className="px-4 py-3 text-sm text-gray-500">{orphan.createdAt ? new Date(orphan.createdAt).toLocaleDateString() : '-'}</td></tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );

    const renderScheduleTab = () => {
        // Filter gaps by selected recurring game if one is selected
        const filteredGaps = gapsResult?.gaps?.filter(gap => 
            !selectedRecurringGameId || gap.recurringGameId === selectedRecurringGameId
        ) || [];

        // Show confirmation screen if schedule was just created
        if (scheduleCreationResult) {
            return (
                <div className="space-y-6">
                    <div className={cx(
                        'rounded-lg p-6 border',
                        scheduleCreationResult.success 
                            ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
                            : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                    )}>
                        <div className="flex items-start gap-4">
                            {scheduleCreationResult.success ? (
                                <CheckCircleIcon className="h-8 w-8 text-green-600 flex-shrink-0" />
                            ) : (
                                <ExclamationTriangleIcon className="h-8 w-8 text-red-600 flex-shrink-0" />
                            )}
                            <div className="flex-1">
                                <h3 className={cx(
                                    'text-lg font-semibold mb-2',
                                    scheduleCreationResult.success ? 'text-green-800 dark:text-green-200' : 'text-red-800 dark:text-red-200'
                                )}>
                                    {scheduleCreationResult.success ? 'Schedule Created Successfully!' : 'Schedule Creation Failed'}
                                </h3>
                                <div className="space-y-2 text-sm">
                                    <p className={scheduleCreationResult.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>
                                        <span className="font-medium">Recurring Game:</span> {scheduleCreationResult.recurringGameName}
                                    </p>
                                    <p className={scheduleCreationResult.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>
                                        <span className="font-medium">Date Range:</span> {scheduleCreationResult.dateRange.startDate} to {scheduleCreationResult.dateRange.endDate}
                                    </p>
                                    <p className={scheduleCreationResult.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>
                                        <span className="font-medium">Gaps Found:</span> {scheduleCreationResult.gapsFound}
                                    </p>
                                    <p className={scheduleCreationResult.success ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}>
                                        <span className="font-medium">Instances Created:</span> {scheduleCreationResult.instancesCreated}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="mt-6 flex gap-3">
                            <Button variant="secondary" onClick={() => setScheduleCreationResult(null)}>
                                <ArrowPathIcon className="h-4 w-4 mr-2" />
                                Create Another Schedule
                            </Button>
                            <Button variant="secondary" onClick={loadComplianceReport}>
                                <ChartBarIcon className="h-4 w-4 mr-2" />
                                View Compliance Report
                            </Button>
                        </div>
                    </div>
                </div>
            );
        }

        return (
            <div className="space-y-6">
                {/* Recurring Game Selector */}
                <div className="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-lg p-4">
                    <div className="flex flex-col gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Recurring Game
                            </label>
                            <select
                                value={selectedRecurringGameId}
                                onChange={(e) => setSelectedRecurringGameId(e.target.value)}
                                className="w-full md:w-96 px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm"
                            >
                                <option value="">All Recurring Games ({recurringGamesList.length})</option>
                                {recurringGamesList.map(game => (
                                    <option key={game.id} value={game.id}>
                                        {game.name} {game.dayOfWeek ? `(${game.dayOfWeek})` : ''}
                                    </option>
                                ))}
                            </select>
                            {recurringGamesList.length === 0 && (
                                <p className="mt-1 text-xs text-gray-500">Loading recurring games...</p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Date Range Selection */}
                <div className="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-lg p-4">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Date Range
                    </label>
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <label className="text-sm text-gray-600 dark:text-gray-400">From:</label>
                            <input 
                                type="date" 
                                value={dateRange.startDate} 
                                onChange={(e) => setDateRange(d => ({ ...d, startDate: e.target.value }))} 
                                className="px-3 py-1.5 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" 
                            />
                        </div>
                        <div className="flex items-center gap-2">
                            <label className="text-sm text-gray-600 dark:text-gray-400">To:</label>
                            <input 
                                type="date" 
                                value={dateRange.endDate} 
                                onChange={(e) => setDateRange(d => ({ ...d, endDate: e.target.value }))} 
                                className="px-3 py-1.5 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-sm" 
                            />
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mt-3">
                        <Button variant="secondary" size="sm" onClick={() => setDateRange(getDateRangeForWeeks(1))}>1 Week</Button>
                        <Button variant="secondary" size="sm" onClick={() => setDateRange(getDateRangeForWeeks(4))}>4 Weeks</Button>
                        <Button variant="secondary" size="sm" onClick={() => setDateRange(getDateRangeForWeeks(12))}>12 Weeks</Button>
                        <Button variant="secondary" size="sm" onClick={() => setDateRange(getDateRangeForWeeks(52))}>1 Year</Button>
                        <Button variant="secondary" size="sm" onClick={() => setDateRange(getDateRangeForWeeks(104))}>2 Years</Button>
                        <Button variant="primary" size="sm" onClick={handleSinceFirstGame} isLoading={isLoading}>
                            <ClockIcon className="h-4 w-4 mr-1" />
                            Since First Game
                        </Button>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex flex-wrap gap-3">
                    <Button onClick={loadComplianceReport} isLoading={isLoading}>
                        <ChartBarIcon className="h-4 w-4 mr-2" />
                        Compliance Report
                    </Button>
                    <Button onClick={detectGaps} isLoading={isLoading} variant="secondary">
                        <ExclamationTriangleIcon className="h-4 w-4 mr-2" />
                        Detect Gaps
                    </Button>
                    <Button onClick={() => executeReconcile(true)} isLoading={isLoading} variant="secondary">
                        <ArrowsRightLeftIcon className="h-4 w-4 mr-2" />
                        Preview Reconcile
                    </Button>
                </div>

                {/* Compliance Report */}
                {complianceReport && (
                    <div className="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-lg p-4">
                        <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-4">Compliance Summary</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                            <div>
                                <p className="text-2xl font-bold text-gray-900 dark:text-gray-100">{complianceReport.totalExpected}</p>
                                <p className="text-xs text-gray-500">Expected</p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-green-600">{complianceReport.totalConfirmed}</p>
                                <p className="text-xs text-gray-500">Confirmed</p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-amber-600">{complianceReport.totalUnknown}</p>
                                <p className="text-xs text-gray-500">Unknown</p>
                            </div>
                            <div>
                                <p className="text-2xl font-bold text-blue-600">{Math.round(complianceReport.overallComplianceRate * 100)}%</p>
                                <p className="text-xs text-gray-500">Compliance</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* No Gaps Message */}
                {gapsResult && filteredGaps.length === 0 && (
                    <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                        <div className="flex items-center gap-3">
                            <CheckCircleIcon className="h-6 w-6 text-green-600" />
                            <div>
                                <p className="font-medium text-green-800 dark:text-green-200">
                                    {selectedRecurringGameId ? 'No gaps for selected game!' : 'No gaps detected!'}
                                </p>
                                <p className="text-sm text-green-600 dark:text-green-400">
                                    Checked {gapsResult.recurringGamesChecked} recurring games over {gapsResult.weeksAnalyzed} weeks. 
                                    {gapsResult.expectedOccurrences} expected, {gapsResult.confirmedOccurrences} confirmed.
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Gaps List */}
                {gapsResult && filteredGaps.length > 0 && (
                    <div className="bg-white dark:bg-gray-900 border dark:border-gray-800 rounded-lg overflow-hidden">
                        <div className="p-4 border-b dark:border-gray-700 flex items-center justify-between">
                            <h3 className="font-medium text-gray-900 dark:text-gray-100">
                                Detected Gaps ({filteredGaps.length}
                                {selectedRecurringGameId && gapsResult.gapsFound !== filteredGaps.length && 
                                    ` of ${gapsResult.gapsFound} total`
                                })
                            </h3>
                            <Button size="sm" onClick={createGapInstances} isLoading={isLoading}>
                                <PlayIcon className="h-4 w-4 mr-2" />
                                Create UNKNOWN Instances
                            </Button>
                        </div>
                        <div className="max-h-96 overflow-y-auto">
                            {filteredGaps.slice(0, 50).map((gap, idx) => (
                                <div 
                                    key={idx} 
                                    className="flex items-center justify-between px-4 py-3 border-b dark:border-gray-700 last:border-0 hover:bg-gray-50 dark:hover:bg-gray-800"
                                >
                                    <div>
                                        <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{gap.recurringGameName}</p>
                                        <p className="text-xs text-gray-500">{gap.dayOfWeek} • {formatAEST(gap.expectedDate)}</p>
                                    </div>
                                    <Button 
                                        size="sm" 
                                        variant="secondary" 
                                        onClick={() => setMissedInstanceModal({ isOpen: true, gap, status: 'CANCELLED', reason: '' })}
                                    >
                                        Record Status
                                    </Button>
                                </div>
                            ))}
                            {filteredGaps.length > 50 && (
                                <div className="px-4 py-3 text-center text-sm text-gray-500">
                                    Showing first 50 of {filteredGaps.length} gaps
                                </div>
                            )}
                        </div>
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
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">Recurring Game Administration</h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Manage recurring game assignments, process unassigned games, and cleanup orphans</p>
                </div>
                <div className="w-full md:w-64">
                    <Select value={selectedVenueId} onChange={(e) => handleVenueChange(e.target.value)}>
                        <option value="">Select a venue...</option>
                        {venues.map(venue => <option key={venue.id} value={venue.id}>{venue.name}</option>)}
                    </Select>
                </div>
            </div>

            {error && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                    <div className="flex items-center gap-2">
                        <XMarkIcon className="h-5 w-5 text-red-600" />
                        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
                        <button onClick={() => setError(null)} className="ml-auto text-red-600 hover:text-red-800"><XMarkIcon className="h-4 w-4" /></button>
                    </div>
                </div>
            )}

            {!selectedVenueId && (
                <div className="text-center py-12 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-dashed border-gray-300 dark:border-gray-700">
                    <InformationCircleIcon className="h-12 w-12 mx-auto text-gray-400" />
                    <p className="mt-2 text-gray-500 dark:text-gray-400">Select a venue to manage its recurring games</p>
                </div>
            )}

            {selectedVenueId && (
                <>
                    <div className="border-b dark:border-gray-700">
                        <nav className="flex gap-4 overflow-x-auto">
                            {[
                                { id: 'stats', label: 'Statistics', icon: ChartBarIcon },
                                { id: 'resolve', label: 'Re-Resolve', icon: ArrowPathIcon },
                                { id: 'duplicates', label: 'Duplicates', icon: DocumentDuplicateIcon },
                                { id: 'orphans', label: 'Orphans', icon: TrashIcon },
                                { id: 'schedule', label: 'Schedule', icon: CalendarDaysIcon },
                            ].map(tab => (
                                <button key={tab.id} onClick={() => setActiveTab(tab.id as AdminTab)}
                                    className={cx('flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                                        activeTab === tab.id ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400')}>
                                    <tab.icon className="h-4 w-4" />{tab.label}
                                </button>
                            ))}
                        </nav>
                    </div>
                    <div className="min-h-[400px]">
                        {activeTab === 'stats' && renderStatsTab()}
                        {activeTab === 'resolve' && renderResolveTab()}
                        {activeTab === 'duplicates' && renderDuplicatesTab()}
                        {activeTab === 'orphans' && renderOrphansTab()}
                        {activeTab === 'schedule' && renderScheduleTab()}
                    </div>
                </>
            )}

            <Modal isOpen={confirmModal.isOpen} onClose={() => setConfirmModal(m => ({ ...m, isOpen: false }))} title={confirmModal.title}>
                <div className="space-y-4">
                    <p className="text-sm text-gray-600 dark:text-gray-300">{confirmModal.message}</p>
                    <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
                        <Button variant="secondary" onClick={() => setConfirmModal(m => ({ ...m, isOpen: false }))}>Cancel</Button>
                        <Button variant={confirmModal.variant === 'danger' ? 'destructive' : 'primary'} onClick={async () => { await confirmModal.action(); setConfirmModal(m => ({ ...m, isOpen: false })); }} isLoading={isLoading || isProcessing}>Confirm</Button>
                    </div>
                </div>
            </Modal>

            <Modal isOpen={missedInstanceModal.isOpen} onClose={() => setMissedInstanceModal(m => ({ ...m, isOpen: false }))} title="Record Missed Instance">
                <div className="space-y-4">
                    {missedInstanceModal.gap && (
                        <>
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                    <span className="font-medium">{missedInstanceModal.gap.recurringGameName}</span>
                                    <br />
                                    {missedInstanceModal.gap.dayOfWeek} • {formatAEST(missedInstanceModal.gap.expectedDate)}
                                </p>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                                <select value={missedInstanceModal.status} onChange={(e) => setMissedInstanceModal(m => ({ ...m, status: e.target.value as any }))} className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
                                    <option value="CANCELLED">Cancelled</option>
                                    <option value="SKIPPED">Skipped</option>
                                    <option value="NO_SHOW">No Show</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reason (optional)</label>
                                <textarea value={missedInstanceModal.reason} onChange={(e) => setMissedInstanceModal(m => ({ ...m, reason: e.target.value }))} rows={3} className="w-full px-3 py-2 border dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800" />
                            </div>
                        </>
                    )}
                    <div className="flex justify-end gap-3 pt-4 border-t dark:border-gray-700">
                        <Button variant="secondary" onClick={() => setMissedInstanceModal(m => ({ ...m, isOpen: false }))}>Cancel</Button>
                        <Button onClick={handleRecordMissedInstance} isLoading={isLoading}>Save</Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default RecurringGameAdmin;