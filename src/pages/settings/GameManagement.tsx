// src/pages/settings/GameManagement.tsx
// UPDATED: Integrated GameEditorModal for create/edit functionality

import { useState, useEffect, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { ColumnDef } from "@tanstack/react-table";
import { cx, formatCurrency, formatDateTimeAEST } from '../../lib/utils';

// --- UI Components ---
import { Card } from '../../components/ui/Card'; 
import { DataTable } from '../../components/ui/DataTable';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';
import { Select } from '../../components/ui/Select';
import { Modal } from '../../components/ui/Modal';
import { MultiEntitySelector } from '../../components/entities/MultiEntitySelector';

// --- Game Editor ---
import { GameEditorModal } from '../../components/games/editor';
import type { EntityOption, VenueOption, RecurringGameOption, SeriesOption, SaveGameResult } from '../../components/games/editor';

// --- Icons ---
import {
    ArrowPathIcon,
    ExclamationTriangleIcon,
    InformationCircleIcon,
    FunnelIcon,
    PlusIcon,
    PencilSquareIcon,
    CheckIcon,
} from '@heroicons/react/24/outline';

// --- Context & Services ---
import { useEntity } from '../../contexts/EntityContext';
import {
    reassignGameVenue,
    bulkReassignGameVenues,
    getUnassignedVenueId,
} from '../../services/gameService';

// --- Sub-Components ---
import { RecurringGamesManager } from '../games/RecurringGamesManager';

// ✅ FIX: Lazy client initialization to avoid "Amplify not configured" warning
let _client: any = null;
const getClient = () => {
    if (!_client) {
        _client = generateClient();
    }
    return _client;
};

const UNASSIGNED_VENUE_ID = getUnassignedVenueId();

// ===================================================================
// TYPES
// ===================================================================

interface Game {
    id: string;
    name: string;
    gameStartDateTime: string;
    gameStatus: string;
    registrationStatus?: string;
    venueId: string;
    venueName?: string;
    venueAssignmentStatus: string;
    venueAssignmentConfidence: number;
    suggestedVenueName?: string;
    totalUniquePlayers: number;
    buyIn: number;
    rake?: number;
    entityId: string;
    entityName?: string;
    gameVariant?: string;
    tournamentType?: string;
    hasGuarantee?: boolean;
    guaranteeAmount?: number;
    startingStack?: number;
    totalInitialEntries?: number;
    totalEntries?: number;
    totalRebuys?: number;
    totalAddons?: number;
    prizepoolPaid?: number;
    isSeries?: boolean;
    seriesName?: string;
    recurringGameId?: string;
}

interface Venue {
    id: string;
    name: string;
    entityId: string;
    entityName?: string;
}

interface RecurringGame {
    id: string;
    name: string;
    displayName?: string;
    venueId: string;
    venueName?: string;
    entityId: string;
    dayOfWeek: string;
    startTime: string;
    gameType?: string;
    gameVariant?: string;
    typicalBuyIn?: number;
    typicalRake?: number;
    typicalStartingStack?: number;
    typicalGuarantee?: number;
    isActive?: boolean;
    isSignature?: boolean;
    isBounty?: boolean;
}

interface Series {
    id: string;
    name: string;
    year?: number;
    venueId?: string;
    venueName?: string;
    entityId?: string;
    status?: string;
}

type VenueFilterType = 'all' | 'unassigned' | 'auto_assigned' | 'manually_assigned' | 'needs_review';

// ===================================================================
// GRAPHQL
// ===================================================================

const listGamesForManagement = /* GraphQL */ `
    query ListGamesForManagement($filter: ModelGameFilterInput, $limit: Int, $nextToken: String) {
        listGames(filter: $filter, limit: $limit, nextToken: $nextToken) {
            items {
                id
                name
                gameStartDateTime
                gameStatus
                registrationStatus
                venueId
                venueAssignmentStatus
                venueAssignmentConfidence
                suggestedVenueName
                totalUniquePlayers
                totalInitialEntries
                totalEntries
                totalRebuys
                totalAddons
                buyIn
                rake
                startingStack
                hasGuarantee
                guaranteeAmount
                prizepoolPaid
                gameVariant
                tournamentType
                isSeries
                seriesName
                recurringGameId
                entityId
                venue { id name }
                entity { id entityName }
            }
            nextToken
        }
    }
`;

const listVenuesWithEntity = /* GraphQL */ `
    query ListVenuesWithEntity($filter: ModelVenueFilterInput) {
        listVenues(filter: $filter, limit: 500) {
            items {
                id
                name
                entityId
                entity { id entityName }
            }
        }
    }
`;

const listRecurringGamesQuery = /* GraphQL */ `
    query ListRecurringGames($filter: ModelRecurringGameFilterInput, $limit: Int) {
        listRecurringGames(filter: $filter, limit: $limit) {
            items {
                id
                name
                displayName
                venueId
                entityId
                dayOfWeek
                startTime
                gameType
                gameVariant
                typicalBuyIn
                typicalRake
                typicalStartingStack
                typicalGuarantee
                isActive
                isSignature
                isBounty
                venue { id name }
            }
        }
    }
`;

const listSeriesQuery = /* GraphQL */ `
    query ListTournamentSeries($filter: ModelTournamentSeriesFilterInput, $limit: Int) {
        listTournamentSeries(filter: $filter, limit: $limit) {
            items {
                id
                name
                year
                venueId
                entityId
                status
                venue { id name }
            }
        }
    }
`;

// ===================================================================
// COMPONENT
// ===================================================================

export const GameManagement = () => {
    // Context
    const { selectedEntities, selectAllEntities, loading: entitiesLoading } = useEntity();

    // UI State
    const [activeTab, setActiveTab] = useState<'games' | 'recurring'>('games');
    const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);

    // Data State
    const [games, setGames] = useState<Game[]>([]);
    const [venues, setVenues] = useState<Venue[]>([]);
    const [recurringGames, setRecurringGames] = useState<RecurringGame[]>([]);
    const [series, setSeries] = useState<Series[]>([]);
    const [loading, setLoading] = useState(true);
    const [nextToken, setNextToken] = useState<string | null>(null);
    const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

    // Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [venueFilter, setVenueFilter] = useState<VenueFilterType>('needs_review');
    
    // Selection State
    const [selectedGameIds, setSelectedGameIds] = useState<Set<string>>(new Set());
    const [selectAll, setSelectAll] = useState(false);
    
    // Reassign Modal State
    const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
    const [reassignTargetVenueId, setReassignTargetVenueId] = useState<string>('');
    const [reassignEntity, setReassignEntity] = useState<boolean>(true);
    const [isProcessing, setIsProcessing] = useState(false);
    const [crossEntityWarning, setCrossEntityWarning] = useState<{
        show: boolean;
        targetVenueEntity: string | null;
        gameEntities: string[];
    }>({ show: false, targetVenueEntity: null, gameEntities: [] });

    // === NEW: Game Editor Modal State ===
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingGame, setEditingGame] = useState<Game | null>(null);

    // --- Data Fetching ---

    const fetchVenues = async () => {
        try {
            const response: any = await getClient().graphql({
                query: listVenuesWithEntity,
                variables: { filter: { isSpecial: { ne: true } } }
            });
            const items = (response.data?.listVenues?.items?.filter(Boolean) || []).map((v: any) => ({
                ...v,
                entityName: v.entity?.entityName
            }));
            setVenues(items.sort((a: Venue, b: Venue) => a.name.localeCompare(b.name)));
        } catch (error) {
            console.error('Error fetching venues:', error);
        }
    };

    const fetchRecurringGames = async () => {
        if (selectedEntities.length === 0) {
            setRecurringGames([]);
            return;
        }

        try {
            // Fetch recurring games for selected entities' venues
            const venueIds = venues
                .filter(v => selectedEntities.some(e => e.id === v.entityId))
                .map(v => v.id);

            if (venueIds.length === 0) {
                setRecurringGames([]);
                return;
            }

            const response: any = await getClient().graphql({
                query: listRecurringGamesQuery,
                variables: { 
                    filter: { or: venueIds.map(id => ({ venueId: { eq: id } })) },
                    limit: 500 
                }
            });
            
            const items = (response.data?.listRecurringGames?.items?.filter(Boolean) || []).map((rg: any) => ({
                ...rg,
                venueName: rg.venue?.name
            }));
            
            setRecurringGames(items);
        } catch (error) {
            console.error('Error fetching recurring games:', error);
        }
    };

    const fetchSeries = async () => {
        if (selectedEntities.length === 0) {
            setSeries([]);
            return;
        }

        try {
            const entityFilters = selectedEntities.map(entity => ({ entityId: { eq: entity.id } }));
            
            const response: any = await getClient().graphql({
                query: listSeriesQuery,
                variables: { 
                    filter: selectedEntities.length === 1 
                        ? { entityId: { eq: selectedEntities[0].id } }
                        : { or: entityFilters },
                    limit: 100 
                }
            });
            
            const items = (response.data?.listTournamentSeries?.items?.filter(Boolean) || []).map((s: any) => ({
                ...s,
                venueName: s.venue?.name
            }));
            
            // Sort by year (newest first), then by name
            setSeries(items.sort((a: Series, b: Series) => {
                const yearDiff = (b.year || 0) - (a.year || 0);
                if (yearDiff !== 0) return yearDiff;
                return a.name.localeCompare(b.name);
            }));
        } catch (error) {
            console.error('Error fetching series:', error);
        }
    };

    const fetchGames = async (loadMore = false) => {
        if (selectedEntities.length === 0) {
            setGames([]);
            setLoading(false);
            return;
        }

        if (!loadMore) setLoading(true);

        try {
            const entityFilters = selectedEntities.map(entity => ({ entityId: { eq: entity.id } }));
            let filter: any = {};
            let statusConditions: any[] = [];

            switch (venueFilter) {
                case 'unassigned': statusConditions = [{ venueId: { eq: UNASSIGNED_VENUE_ID } }]; break;
                case 'auto_assigned': statusConditions = [{ venueAssignmentStatus: { eq: 'AUTO_ASSIGNED' } }]; break;
                case 'manually_assigned': statusConditions = [{ venueAssignmentStatus: { eq: 'MANUALLY_ASSIGNED' } }]; break;
                case 'needs_review':
                    statusConditions = [
                        { venueAssignmentStatus: { eq: 'AUTO_ASSIGNED' } },
                        { venueAssignmentStatus: { eq: 'PENDING_ASSIGNMENT' } },
                        { venueId: { eq: UNASSIGNED_VENUE_ID } }
                    ];
                    break;
            }

            const entityCondition = selectedEntities.length === 1 
                ? { entityId: { eq: selectedEntities[0].id } }
                : { or: entityFilters };

            // Always exclude NOT_PUBLISHED games
            const notPublishedFilter = { gameStatus: { ne: 'NOT_PUBLISHED' } };

            if (statusConditions.length > 0) {
                filter = { and: [entityCondition, { or: statusConditions }, notPublishedFilter] };
            } else {
                filter = { and: [entityCondition, notPublishedFilter] };
            }

            const response: any = await getClient().graphql({
                query: listGamesForManagement,
                variables: {
                    filter,
                    limit: 100,
                    nextToken: loadMore ? nextToken : undefined
                }
            });

            const items = response.data?.listGames?.items?.filter(Boolean) || [];
            const newNextToken = response.data?.listGames?.nextToken || null;

            const enrichedGames = items.map((game: any) => ({
                ...game,
                venueName: game.venue?.name || (game.venueId === UNASSIGNED_VENUE_ID ? 'Unassigned' : 'Unknown'),
                entityName: game.entity?.entityName || 'Unknown'
            }));

            setGames(prev => loadMore ? [...prev, ...enrichedGames] : enrichedGames);
            setNextToken(newNextToken);
            setLastUpdated(new Date());
        } catch (error) {
            console.error('Error fetching games:', error);
        } finally {
            setLoading(false);
        }
    };

    // --- Effects ---

    useEffect(() => {
        if (!entitiesLoading && selectedEntities.length === 0) {
            selectAllEntities();
        }
    }, [entitiesLoading]);

    useEffect(() => { fetchVenues(); }, []);

    // Fetch recurring games and series when venues or entities change
    useEffect(() => {
        if (venues.length > 0 && selectedEntities.length > 0) {
            fetchRecurringGames();
            fetchSeries();
        }
    }, [venues, selectedEntities]);

    useEffect(() => {
        if (!entitiesLoading && selectedEntities.length > 0 && activeTab === 'games') {
            setSelectedGameIds(new Set());
            setSelectAll(false);
            fetchGames();
        }
    }, [selectedEntities, venueFilter, entitiesLoading, activeTab]);

    // --- Table Logic ---

    const filteredGames = useMemo(() => {
        if (!searchQuery) return games;
        const query = searchQuery.toLowerCase();
        return games.filter(g => 
            g.name.toLowerCase().includes(query) || 
            g.venueName?.toLowerCase().includes(query)
        );
    }, [games, searchQuery]);

    // Handle "Select All" Logic
    const handleSelectAll = () => {
        if (selectAll) {
            setSelectedGameIds(new Set());
        } else {
            const allIds = filteredGames.map(g => g.id);
            setSelectedGameIds(new Set(allIds));
        }
        setSelectAll(!selectAll);
    };

    // === NEW: Prepare dropdown options for editor ===
    const entityOptions: EntityOption[] = useMemo(() => 
        selectedEntities.map(e => ({ id: e.id, entityName: e.entityName || e.id })),
        [selectedEntities]
    );

    const venueOptions: VenueOption[] = useMemo(() => 
        venues.map(v => ({ 
            id: v.id, 
            name: v.name, 
            entityId: v.entityId, 
            entityName: v.entityName 
        })),
        [venues]
    );

    const recurringGameOptions: RecurringGameOption[] = useMemo(() => 
        recurringGames
            .filter(rg => rg.isActive !== false) // Only show active recurring games
            .map(rg => ({
                id: rg.id,
                name: rg.displayName || rg.name,
                venueId: rg.venueId,
                venueName: rg.venueName,
                entityId: rg.entityId,
                dayOfWeek: rg.dayOfWeek,
                startTime: rg.startTime,
                // Map typical values to standard field names for auto-populate
                buyIn: rg.typicalBuyIn,
                rake: rg.typicalRake,
                startingStack: rg.typicalStartingStack,
                guaranteeAmount: rg.typicalGuarantee,
                gameVariant: rg.gameVariant,
                gameType: rg.gameType,
                isSignature: rg.isSignature,
                isBounty: rg.isBounty,
            })),
        [recurringGames]
    );

    const seriesOptions: SeriesOption[] = useMemo(() => 
        series
            .filter(s => s.status !== 'CANCELLED') // Exclude cancelled series
            .map(s => ({
                id: s.id,
                name: s.name,
                year: s.year,
                venueId: s.venueId,
                status: s.status,
            })),
        [series]
    );

    // === NEW: Handle editor callbacks ===
    const handleCreateSuccess = (result: SaveGameResult) => {
        console.log('Game created:', result);
        setIsCreateModalOpen(false);
        fetchGames(); // Refresh the list
    };

    const handleEditSuccess = (result: SaveGameResult) => {
        console.log('Game updated:', result);
        setEditingGame(null);
        fetchGames(); // Refresh the list
    };

    const handleEditGame = (game: Game) => {
        setEditingGame(game);
    };

    const columns = useMemo<ColumnDef<Game>[]>(() => [
        {
            id: 'select',
            header: () => (
                <div className="px-1">
                    <input
                        type="checkbox"
                        checked={selectAll}
                        onChange={handleSelectAll}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                </div>
            ),
            cell: ({ row }) => (
                <div className="px-1">
                    <input
                        type="checkbox"
                        checked={selectedGameIds.has(row.original.id)}
                        onChange={() => {
                            const id = row.original.id;
                            setSelectedGameIds(prev => {
                                const next = new Set(prev);
                                next.has(id) ? next.delete(id) : next.add(id);
                                return next;
                            });
                        }}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                    />
                </div>
            ),
        },
        {
            accessorKey: 'gameStartDateTime',
            header: 'Date',
            cell: ({ getValue }) => (
                <span className="whitespace-nowrap font-medium">
                    {formatDateTimeAEST(new Date(getValue() as string))}
                </span>
            ),
        },
        {
            accessorKey: 'name',
            header: 'Name',
            cell: ({ getValue }) => (
                <span className="font-medium text-gray-900 dark:text-gray-50 truncate max-w-[200px] block" title={getValue() as string}>
                    {getValue() as string}
                </span>
            ),
        },
        {
            accessorKey: 'recurringGameId',
            header: 'Recurring',
            cell: ({ getValue }) => (
                getValue() ? (
                    <CheckIcon className="h-5 w-5 text-green-600" />
                ) : null
            ),
        },
        {
            accessorKey: 'venueName',
            header: 'Venue',
            cell: ({ getValue }) => <span className="text-gray-700 dark:text-gray-300">{getValue() as string}</span>
        },
        {
            accessorKey: 'buyIn',
            header: 'Buy-In',
            cell: ({ getValue }) => formatCurrency(getValue() as number),
        },
        {
            accessorKey: 'totalUniquePlayers',
            header: 'Unique Players',
            cell: ({ getValue }) => (getValue() as number)?.toLocaleString() || 0,
        },
        {
            accessorKey: 'totalEntries',
            header: 'Entries',
            cell: ({ getValue }) => (getValue() as number)?.toLocaleString() || 0,
        },
        // === Actions column ===
        {
            id: 'actions',
            header: '',
            cell: ({ row }) => (
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                        e.stopPropagation();
                        handleEditGame(row.original);
                    }}
                    className="h-8 w-8 p-0"
                    title="Edit Game"
                >
                    <PencilSquareIcon className="h-4 w-4" />
                </Button>
            ),
        },
    ], [selectedGameIds, selectAll, filteredGames]);

    // --- Modal Handlers ---

    const handleReassignOpen = () => {
        if (selectedGameIds.size === 0) return;
        setReassignTargetVenueId('');
        setReassignEntity(true);
        setCrossEntityWarning({ show: false, targetVenueEntity: null, gameEntities: [] });
        setIsReassignModalOpen(true);
    };

    const handleVenueSelectionChange = (venueId: string) => {
        setReassignTargetVenueId(venueId);
        if (!venueId) {
            setCrossEntityWarning({ show: false, targetVenueEntity: null, gameEntities: [] });
            return;
        }

        const targetVenue = venues.find(v => v.id === venueId);
        if (!targetVenue) return;

        const selectedGameObjects = games.filter(g => selectedGameIds.has(g.id));
        const gameEntities = [...new Set(selectedGameObjects.map(g => g.entityId))];
        const isCrossEntity = gameEntities.some(id => id !== targetVenue.entityId);

        if (isCrossEntity) {
            setCrossEntityWarning({
                show: true,
                targetVenueEntity: selectedEntities.find((e: { id: string; entityName?: string }) => e.id === targetVenue.entityId)?.entityName || 'Unknown',
                gameEntities: gameEntities.map(id => selectedEntities.find((e: { id: string; entityName?: string }) => e.id === id)?.entityName || 'Unknown')
            });
        } else {
            setCrossEntityWarning({ show: false, targetVenueEntity: null, gameEntities: [] });
        }
    };

    const handleReassignSubmit = async () => {
        if (!reassignTargetVenueId) return;
        setIsProcessing(true);
        try {
            const gameIds = Array.from(selectedGameIds);
            
            if (gameIds.length === 1) {
                const game = games.find(g => g.id === gameIds[0]);
                await reassignGameVenue({
                    gameId: gameIds[0],
                    newVenueId: reassignTargetVenueId,
                    entityId: game?.entityId,
                    reassignEntity,
                    initiatedBy: 'USER'
                });
            } else {
                const firstGame = games.find(g => g.id === gameIds[0]);
                await bulkReassignGameVenues({
                    gameIds,
                    newVenueId: reassignTargetVenueId,
                    entityId: firstGame?.entityId || selectedEntities[0].id,
                    reassignEntity,
                    initiatedBy: 'USER'
                });
            }
            
            setSelectedGameIds(new Set());
            setSelectAll(false);
            setIsReassignModalOpen(false);
            fetchGames();
        } catch (error) {
            console.error('Reassignment failed', error);
        } finally {
            setIsProcessing(false);
        }
    };

    // ===================================================================
    // RENDER
    // ===================================================================

    return (
        <div className="space-y-6">
            
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-50">
                        Game Management
                    </h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Manage venues, recurring games, and assignment mismatches
                    </p>
                </div>
                
                <div className="flex items-center gap-2 self-end sm:self-auto">
                    {lastUpdated && (
                        <span className="hidden sm:inline text-xs text-gray-400">
                            Updated: {formatDateTimeAEST(lastUpdated)}
                        </span>
                    )}
                    
                    {/* === NEW: Add Game Button === */}
                    <Button 
                        size="sm"
                        onClick={() => setIsCreateModalOpen(true)}
                        className="gap-1"
                    >
                        <PlusIcon className="h-4 w-4" />
                        <span className="hidden sm:inline">Add Game</span>
                    </Button>
                    
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        className="h-8 w-8 p-0"
                        onClick={() => fetchGames()} 
                        isLoading={loading}
                        title="Refresh Data"
                    >
                        <ArrowPathIcon className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {/* Tabs */}
            <div className="border-b border-gray-200 dark:border-gray-800">
                <nav className="-mb-px flex space-x-8" aria-label="Tabs">
                    <button
                        onClick={() => setActiveTab('games')}
                        className={cx(
                            "whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors",
                            activeTab === 'games'
                                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                        )}
                    >
                        Individual Games
                    </button>
                    <button
                        onClick={() => setActiveTab('recurring')}
                        className={cx(
                            "whitespace-nowrap py-4 px-1 border-b-2 font-medium text-sm transition-colors",
                            activeTab === 'recurring'
                                ? "border-indigo-500 text-indigo-600 dark:text-indigo-400"
                                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300"
                        )}
                    >
                        Recurring Games
                    </button>
                </nav>
            </div>

            {/* --- INDIVIDUAL GAMES TAB --- */}
            {activeTab === 'games' && (
                <div className="space-y-4">
                    {/* Filters Container */}
                    <div className="bg-white dark:bg-gray-950 p-4 rounded-lg border border-gray-200 dark:border-gray-800 shadow-sm">
                        
                        {/* Mobile Filter Toggle */}
                        <div className="sm:hidden flex justify-between items-center mb-2">
                            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Filters</span>
                            <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => setIsMobileFiltersOpen(!isMobileFiltersOpen)}
                            >
                                <FunnelIcon className="h-4 w-4 mr-1" />
                                {isMobileFiltersOpen ? 'Hide' : 'Show'}
                            </Button>
                        </div>

                        <div className={cx(
                            "flex flex-col sm:flex-row items-center gap-3",
                            "transition-all duration-200 ease-in-out",
                            isMobileFiltersOpen ? "block" : "hidden sm:flex"
                        )}>
                            <div className="w-full sm:flex-1 min-w-[200px] max-w-xs">
                                <MultiEntitySelector showLabel={false} />
                            </div>
                            
                            <div className="w-full sm:w-48">
                                <Select 
                                    value={venueFilter} 
                                    onChange={(e) => setVenueFilter(e.target.value as VenueFilterType)}
                                >
                                    <option value="all">All Games</option>
                                    <option value="needs_review">Needs Review</option>
                                    <option value="unassigned">Unassigned</option>
                                    <option value="auto_assigned">Auto Assigned</option>
                                    <option value="manually_assigned">Manually Assigned</option>
                                </Select>
                            </div>
                            
                            <div className="w-full sm:flex-1">
                                <Input
                                    type="search"
                                    placeholder="Search by name or venue..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Batch Actions Bar */}
                    {selectedGameIds.size > 0 && (
                        <div className="flex items-center justify-between p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-md border border-indigo-100 dark:border-indigo-900/50 animate-in fade-in slide-in-from-top-2 duration-200">
                            <div className="flex items-center gap-2">
                                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
                                    {selectedGameIds.size}
                                </span>
                                <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                                    games selected
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => {
                                        setSelectedGameIds(new Set());
                                        setSelectAll(false);
                                    }}
                                    className="text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/50"
                                >
                                    Cancel
                                </Button>
                                <Button 
                                    size="sm"
                                    onClick={handleReassignOpen}
                                >
                                    Reassign Venue
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* Data Table Card */}
                    <Card className="overflow-hidden">
                        <div className="-mx-4 sm:-mx-6">
                            <DataTable 
                                data={filteredGames} 
                                columns={columns} 
                            />
                        </div>
                        
                        {/* Footer / Load More */}
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900/50">
                            <span className="text-xs text-gray-500">
                                Showing {filteredGames.length} records
                            </span>
                            {nextToken && (
                                <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => fetchGames(true)}
                                    isLoading={loading}
                                >
                                    Load More
                                </Button>
                            )}
                        </div>
                    </Card>
                </div>
            )}

            {/* --- RECURRING GAMES TAB --- */}
            {activeTab === 'recurring' && (
                <RecurringGamesManager venues={venues} />
            )}

            {/* === NEW: Create Game Modal === */}
            <GameEditorModal
                isOpen={isCreateModalOpen}
                onClose={() => setIsCreateModalOpen(false)}
                mode="create"
                entityId={selectedEntities.length === 1 ? selectedEntities[0].id : undefined}
                entities={entityOptions}
                venues={venueOptions}
                recurringGames={recurringGameOptions}
                series={seriesOptions}
                onSaveSuccess={handleCreateSuccess}
                onSaveError={(error) => console.error('Create failed:', error)}
                showAdvanced={false}
            />

            {/* === NEW: Edit Game Modal === */}
            {editingGame && (
                <GameEditorModal
                    isOpen={!!editingGame}
                    onClose={() => setEditingGame(null)}
                    mode="edit"
                    existingGameId={editingGame.id}
                    initialData={{
                        name: editingGame.name,
                        gameStartDateTime: editingGame.gameStartDateTime,
                        gameStatus: editingGame.gameStatus as any,
                        registrationStatus: editingGame.registrationStatus as any,
                        venueId: editingGame.venueId,
                        entityId: editingGame.entityId,
                        buyIn: editingGame.buyIn,
                        rake: editingGame.rake,
                        gameVariant: editingGame.gameVariant as any,
                        tournamentType: editingGame.tournamentType as any,
                        hasGuarantee: editingGame.hasGuarantee || false,
                        guaranteeAmount: editingGame.guaranteeAmount,
                        startingStack: editingGame.startingStack,
                        totalUniquePlayers: editingGame.totalUniquePlayers,
                        totalInitialEntries: editingGame.totalInitialEntries,
                        totalEntries: editingGame.totalEntries,
                        totalRebuys: editingGame.totalRebuys,
                        totalAddons: editingGame.totalAddons,
                        prizepoolPaid: editingGame.prizepoolPaid,
                        isSeries: editingGame.isSeries,
                        seriesName: editingGame.seriesName,
                        recurringGameId: editingGame.recurringGameId,
                        venueAssignmentStatus: editingGame.venueAssignmentStatus as any,
                        levels: [],
                    }}
                    entityId={editingGame.entityId}
                    venueId={editingGame.venueId}
                    entities={entityOptions}
                    venues={venueOptions}
                    recurringGames={recurringGameOptions}
                    series={seriesOptions}
                    onSaveSuccess={handleEditSuccess}
                    onSaveError={(error) => console.error('Edit failed:', error)}
                    showAdvanced={true}
                />
            )}

            {/* Reassign Modal */}
            <Modal
                isOpen={isReassignModalOpen}
                onClose={() => setIsReassignModalOpen(false)}
                title="Reassign Venue"
            >
                <div className="space-y-4">
                    <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded-md border border-blue-100 dark:border-blue-900/50">
                        <div className="flex gap-2">
                            <InformationCircleIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0" />
                            <p className="text-sm text-blue-700 dark:text-blue-300">
                                You are reassigning <strong>{selectedGameIds.size}</strong> game{selectedGameIds.size !== 1 ? 's' : ''}.
                            </p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                            Target Venue
                        </label>
                        <Select
                            value={reassignTargetVenueId}
                            onChange={(e) => handleVenueSelectionChange(e.target.value)}
                        >
                            <option value="">Select a venue...</option>
                            {venues
                                .filter(v => v.id !== UNASSIGNED_VENUE_ID)
                                .map(venue => (
                                    <option key={venue.id} value={venue.id}>
                                        {venue.name} ({venue.entityName || 'No entity'})
                                    </option>
                                ))
                            }
                        </Select>
                    </div>

                    {crossEntityWarning.show && (
                        <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md">
                            <div className="flex gap-3">
                                <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 dark:text-amber-500 shrink-0" />
                                <div>
                                    <h4 className="text-sm font-medium text-amber-800 dark:text-amber-400">
                                        Cross-Entity Selection
                                    </h4>
                                    <p className="text-xs text-amber-700 dark:text-amber-500 mt-1">
                                        Target: <strong>{crossEntityWarning.targetVenueEntity}</strong>
                                        <br/>
                                        Games: <strong>{crossEntityWarning.gameEntities.join(', ')}</strong>
                                    </p>
                                    
                                    <div className="mt-3 space-y-3">
                                        <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                            <input
                                                type="radio"
                                                checked={reassignEntity}
                                                onChange={() => setReassignEntity(true)}
                                                className="mt-1 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span>
                                                <span className="font-medium block text-gray-900 dark:text-gray-100">Move games to new entity</span>
                                                <span className="text-xs text-gray-500">Player stats will move to {crossEntityWarning.targetVenueEntity}</span>
                                            </span>
                                        </label>
                                        <label className="flex items-start gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                                            <input
                                                type="radio"
                                                checked={!reassignEntity}
                                                onChange={() => setReassignEntity(false)}
                                                className="mt-1 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span>
                                                <span className="font-medium block text-gray-900 dark:text-gray-100">Create venue copy</span>
                                                <span className="text-xs text-gray-500">Keep games in current entity, create a copy of the venue</span>
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
                        <Button variant="secondary" onClick={() => setIsReassignModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button 
                            onClick={handleReassignSubmit}
                            disabled={!reassignTargetVenueId}
                            isLoading={isProcessing}
                        >
                            Reassign Venue
                        </Button>
                    </div>
                </div>
            </Modal>
        </div>
    );
};

export default GameManagement;