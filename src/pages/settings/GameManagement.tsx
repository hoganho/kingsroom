// src/pages/settings/GameManagement.tsx
// UPDATED: Added delete game functionality with confirmation modal
// UPDATED: Added dedicated backend search by Game ID

import { useState, useEffect, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { ColumnDef } from "@tanstack/react-table";
import { cx, formatCurrency, formatDateTimeAEST } from '../../lib/utils';
import { debounce } from 'lodash';

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
    TrashIcon,
    CheckIcon,
    MagnifyingGlassIcon,
    XMarkIcon,
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
    tournamentId?: number;
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
    consolidationType?: string;
    parentGameId?: string;
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
                tournamentId
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
                consolidationType
                parentGameId
                entityId
                venue { id name }
                entity { id entityName }
            }
            nextToken
        }
    }
`;

// Query to search games by name (for backend search)
const searchGamesByName = /* GraphQL */ `
    query SearchGames($filter: ModelGameFilterInput!, $limit: Int) {
        listGames(filter: $filter, limit: $limit) {
            items {
                id
                name
                tournamentId
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
                consolidationType
                parentGameId
                entityId
                venue { id name }
                entity { id entityName }
            }
        }
    }
`;

// Query to search games by tournamentId using GSI (efficient lookup)
const searchGamesByTournamentId = /* GraphQL */ `
    query GamesByTournamentId($tournamentId: Int!, $limit: Int) {
        gamesByTournamentId(tournamentId: $tournamentId, limit: $limit) {
            items {
                id
                name
                tournamentId
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
                consolidationType
                parentGameId
                entityId
                venue { id name }
                entity { id entityName }
            }
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

// NEW: Delete game mutation (invokes deleteGameFunction Lambda)
const deleteGameWithCleanupMutation = /* GraphQL */ `
    mutation DeleteGameWithCleanup($input: DeleteGameWithCleanupInput!) {
        deleteGameWithCleanup(input: $input) {
            success
            message
            gameId
            gameName
            deletions {
                gameCost { deleted error }
                gameFinancialSnapshot { deleted error }
                scrapeURL { deleted error }
                scrapeAttempts { deleted error }
                playerEntries { deleted error }
                playerResults { deleted error }
                playerTransactions { deleted error }
                playerStats { summariesUpdated venuesUpdated }
                game { deleted error }
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

    // Filter State (local filtering)
    const [searchQuery, setSearchQuery] = useState('');
    const [venueFilter, setVenueFilter] = useState<VenueFilterType>('needs_review');
    
    // === NEW: Backend Search State ===
    const [idSearchQuery, setIdSearchQuery] = useState('');
    const [idSearchResults, setIdSearchResults] = useState<Game[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [showSearchResults, setShowSearchResults] = useState(false);

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

    // Game Editor Modal State
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [editingGame, setEditingGame] = useState<Game | null>(null);

    // === NEW: Delete Game Modal State ===
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [gameToDelete, setGameToDelete] = useState<Game | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

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

    // === NEW: Backend Search Function ===
    const searchGamesBackend = async (query: string) => {
        if (!query.trim()) {
            setIdSearchResults([]);
            setShowSearchResults(false);
            return;
        }

        setIsSearching(true);
        setSearchError(null);
        setShowSearchResults(true);

        try {
            const trimmedQuery = query.trim();
            let results: Game[] = [];

            // Check if query is numeric (for tournamentId search)
            const isNumeric = /^\d+$/.test(trimmedQuery);
            
            if (isNumeric) {
                // Use the GSI query for efficient tournamentId lookup
                const tournamentIdValue = parseInt(trimmedQuery, 10);
                
                const response: any = await getClient().graphql({
                    query: searchGamesByTournamentId,
                    variables: {
                        tournamentId: tournamentIdValue,
                        limit: 50
                    }
                });

                const items = response.data?.gamesByTournamentId?.items?.filter(Boolean) || [];
                results = items.map((game: any) => ({
                    ...game,
                    venueName: game.venue?.name || (game.venueId === UNASSIGNED_VENUE_ID ? 'Unassigned' : 'Unknown'),
                    entityName: game.entity?.entityName || 'Unknown'
                }));
            } else {
                // Search by name using filter
                const response: any = await getClient().graphql({
                    query: searchGamesByName,
                    variables: {
                        filter: { name: { contains: trimmedQuery } },
                        limit: 50
                    }
                });

                const items = response.data?.listGames?.items?.filter(Boolean) || [];
                results = items.map((game: any) => ({
                    ...game,
                    venueName: game.venue?.name || (game.venueId === UNASSIGNED_VENUE_ID ? 'Unassigned' : 'Unknown'),
                    entityName: game.entity?.entityName || 'Unknown'
                }));
            }

            setIdSearchResults(results);
        } catch (error: any) {
            console.error('Error searching games:', error);
            setSearchError(error.message || 'Failed to search games');
            setIdSearchResults([]);
        } finally {
            setIsSearching(false);
        }
    };

    // Debounced search
    const debouncedSearch = useMemo(
        () => debounce((query: string) => searchGamesBackend(query), 400),
        []
    );

    const handleIdSearchChange = (value: string) => {
        setIdSearchQuery(value);
        if (value.trim()) {
            debouncedSearch(value);
        } else {
            setIdSearchResults([]);
            setShowSearchResults(false);
        }
    };

    const clearSearch = () => {
        setIdSearchQuery('');
        setIdSearchResults([]);
        setShowSearchResults(false);
        setSearchError(null);
        debouncedSearch.cancel();
    };

    // --- Effects ---

    useEffect(() => {
        if (!entitiesLoading && selectedEntities.length === 0) {
            selectAllEntities();
        }
    }, [entitiesLoading]);

    useEffect(() => { fetchVenues(); }, []);

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
    }, [selectedEntities, venueFilter, activeTab, entitiesLoading]);

    // Cleanup debounce on unmount
    useEffect(() => {
        return () => {
            debouncedSearch.cancel();
        };
    }, [debouncedSearch]);

    // --- Filtered Games (local filtering) ---
    const filteredGames = useMemo(() => {
        if (!searchQuery) return games;
        const query = searchQuery.toLowerCase();
        return games.filter(game => 
            game.name.toLowerCase().includes(query) ||
            game.venueName?.toLowerCase().includes(query) ||
            game.entityName?.toLowerCase().includes(query)
        );
    }, [games, searchQuery]);

    // --- Game Editor Options ---
    const entityOptions: EntityOption[] = selectedEntities.map(e => ({
        id: e.id,
        entityName: e.entityName
    }));

    const venueOptions: VenueOption[] = venues.map(v => ({
        id: v.id,
        name: v.name,
        entityId: v.entityId
    }));

    const recurringGameOptions: RecurringGameOption[] = recurringGames.map(rg => ({
        id: rg.id,
        name: rg.displayName || rg.name,
        venueId: rg.venueId,
        entityId: rg.entityId,
        dayOfWeek: rg.dayOfWeek,
        startTime: rg.startTime || '',
        typicalBuyIn: rg.typicalBuyIn
    }));

    const seriesOptions: SeriesOption[] = series.map(s => ({
        id: s.id,
        name: s.name,
        venueId: s.venueId,
        entityId: s.entityId
    }));

    // --- Game Handlers ---
    const handleEditGame = (game: Game) => {
        setEditingGame(game);
    };

    const handleCreateSuccess = (result: SaveGameResult) => {
        console.log('Game created:', result);
        setIsCreateModalOpen(false);
        fetchGames();
    };

    const handleEditSuccess = (result: SaveGameResult) => {
        console.log('Game updated:', result);
        setEditingGame(null);
        fetchGames();
        // Also refresh search results if showing
        if (showSearchResults && idSearchQuery) {
            searchGamesBackend(idSearchQuery);
        }
    };

    // === NEW: Delete Game Handlers ===
    const handleDeleteClick = (game: Game) => {
        setGameToDelete(game);
        setDeleteError(null);
        setIsDeleteModalOpen(true);
    };

    const handleDeleteConfirm = async () => {
        if (!gameToDelete) return;
        
        setIsDeleting(true);
        setDeleteError(null);
        
        try {
            const response: any = await getClient().graphql({
                query: deleteGameWithCleanupMutation,
                variables: {
                    input: { gameId: gameToDelete.id }
                }
            });
            
            const result = response.data?.deleteGameWithCleanup;
            
            if (result?.success) {
                console.log('Game deleted successfully:', result);
                setIsDeleteModalOpen(false);
                setGameToDelete(null);
                // Remove from local state immediately
                setGames(prev => prev.filter(g => g.id !== gameToDelete.id));
                setSelectedGameIds(prev => {
                    const next = new Set(prev);
                    next.delete(gameToDelete.id);
                    return next;
                });
                // Also remove from search results if showing
                if (showSearchResults) {
                    setIdSearchResults(prev => prev.filter(g => g.id !== gameToDelete.id));
                }
            } else {
                setDeleteError(result?.message || 'Failed to delete game');
            }
        } catch (error: any) {
            console.error('Error deleting game:', error);
            setDeleteError(error.message || 'An unexpected error occurred');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleDeleteCancel = () => {
        setIsDeleteModalOpen(false);
        setGameToDelete(null);
        setDeleteError(null);
    };

    // --- Selection Handlers ---
    const handleSelectGame = (gameId: string, checked: boolean) => {
        setSelectedGameIds(prev => {
            const next = new Set(prev);
            if (checked) next.add(gameId);
            else next.delete(gameId);
            return next;
        });
    };

    const handleSelectAll = (checked: boolean) => {
        setSelectAll(checked);
        if (checked) {
            setSelectedGameIds(new Set(filteredGames.map(g => g.id)));
        } else {
            setSelectedGameIds(new Set());
        }
    };

    // --- Columns ---
    const columns: ColumnDef<Game>[] = useMemo(() => [
        {
            id: 'select',
            header: () => (
                <input 
                    type="checkbox" 
                    checked={selectAll}
                    onChange={(e) => handleSelectAll(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
            ),
            cell: ({ row }) => (
                <input 
                    type="checkbox"
                    checked={selectedGameIds.has(row.original.id)}
                    onChange={(e) => handleSelectGame(row.original.id, e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
            ),
        },
        {
            accessorKey: 'name',
            header: 'Game',
            cell: ({ row }) => (
                <div>
                    <p className="font-medium text-gray-900 dark:text-gray-100 truncate max-w-xs">
                        {row.original.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatDateTimeAEST(new Date(row.original.gameStartDateTime))}
                    </p>
                    {/* Show consolidation type badge */}
                    {row.original.consolidationType && (
                        <span className={cx(
                            "inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium mt-1",
                            row.original.consolidationType === 'PARENT' 
                                ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                                : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                        )}>
                            {row.original.consolidationType}
                        </span>
                    )}
                </div>
            ),
        },
        {
            accessorKey: 'gameStatus',
            header: 'Status',
            cell: ({ getValue }) => {
                const status = getValue() as string;
                return (
                    <span className={cx(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                        status === 'FINISHED' && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
                        status === 'RUNNING' && "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
                        status === 'SCHEDULED' && "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
                        status === 'CANCELLED' && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                    )}>
                        {status}
                    </span>
                );
            }
        },
        {
            accessorKey: 'venueAssignmentStatus',
            header: 'Assignment',
            cell: ({ row }) => (
                row.original.venueAssignmentStatus ? (
                    <span className={cx(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                        row.original.venueAssignmentStatus === 'MANUALLY_ASSIGNED' && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
                        row.original.venueAssignmentStatus === 'AUTO_ASSIGNED' && "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
                        row.original.venueAssignmentStatus === 'PENDING_ASSIGNMENT' && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                    )}>
                        {row.original.venueAssignmentStatus === 'MANUALLY_ASSIGNED' && <CheckIcon className="h-3 w-3 mr-1" />}
                        {row.original.venueAssignmentStatus.replace(/_/g, ' ')}
                    </span>
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
        // === Actions column with Edit and Delete ===
        {
            id: 'actions',
            header: '',
            cell: ({ row }) => (
                <div className="flex items-center gap-1">
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
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteClick(row.original);
                        }}
                        className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
                        title="Delete Game"
                    >
                        <TrashIcon className="h-4 w-4" />
                    </Button>
                </div>
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

                    {/* === NEW: Backend Search Section === */}
                    <Card className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/30 dark:to-purple-950/30 border-indigo-200 dark:border-indigo-800">
                        <div className="p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <MagnifyingGlassIcon className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
                                <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                                    Search All Games
                                </h3>
                                <span className="text-xs text-gray-500 dark:text-gray-400">
                                    (searches entire database)
                                </span>
                            </div>
                            
                            <div className="flex gap-2">
                                <div className="relative flex-1 max-w-md">
                                    <Input 
                                        type="text"
                                        placeholder="Enter Tournament ID or search by name..."
                                        value={idSearchQuery}
                                        onChange={(e) => handleIdSearchChange(e.target.value)}
                                        className="pr-10"
                                    />
                                    {idSearchQuery && (
                                        <button
                                            onClick={clearSearch}
                                            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                                        >
                                            <XMarkIcon className="h-4 w-4" />
                                        </button>
                                    )}
                                </div>
                                {isSearching && (
                                    <div className="flex items-center text-sm text-gray-500">
                                        <div className="animate-spin h-4 w-4 border-2 border-indigo-500 border-t-transparent rounded-full mr-2" />
                                        Searching...
                                    </div>
                                )}
                            </div>

                            {/* Search Results */}
                            {showSearchResults && (
                                <div className="mt-4">
                                    {searchError ? (
                                        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-md border border-red-200 dark:border-red-800">
                                            <p className="text-sm text-red-700 dark:text-red-300">{searchError}</p>
                                        </div>
                                    ) : idSearchResults.length === 0 && !isSearching ? (
                                        <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                No games found matching "{idSearchQuery}"
                                            </p>
                                        </div>
                                    ) : idSearchResults.length > 0 ? (
                                        <div className="bg-white dark:bg-gray-900 rounded-md border border-gray-200 dark:border-gray-700 overflow-hidden">
                                            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                                                <p className="text-xs font-medium text-gray-600 dark:text-gray-400">
                                                    Found {idSearchResults.length} game{idSearchResults.length !== 1 ? 's' : ''}
                                                </p>
                                            </div>
                                            <div className="divide-y divide-gray-100 dark:divide-gray-800 max-h-80 overflow-y-auto">
                                                {idSearchResults.map((game) => (
                                                    <div 
                                                        key={game.id} 
                                                        className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 flex items-center justify-between gap-4"
                                                    >
                                                        <div className="flex-1 min-w-0">
                                                            <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                                                {game.name}
                                                            </p>
                                                            <div className="flex items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                                                                <span>{formatDateTimeAEST(new Date(game.gameStartDateTime))}</span>
                                                                <span>•</span>
                                                                <span>{game.venueName}</span>
                                                                <span>•</span>
                                                                <span>{game.entityName}</span>
                                                            </div>
                                                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 font-mono">
                                                                Tournament ID: {game.tournamentId || 'N/A'}
                                                            </p>
                                                        </div>
                                                        <div className="flex items-center gap-2 shrink-0">
                                                            <span className={cx(
                                                                "inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium",
                                                                game.gameStatus === 'FINISHED' && "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
                                                                game.gameStatus === 'RUNNING' && "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
                                                                game.gameStatus === 'SCHEDULED' && "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
                                                                game.gameStatus === 'CANCELLED' && "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                                                            )}>
                                                                {game.gameStatus}
                                                            </span>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleEditGame(game)}
                                                                className="h-8 w-8 p-0"
                                                                title="Edit Game"
                                                            >
                                                                <PencilSquareIcon className="h-4 w-4" />
                                                            </Button>
                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                onClick={() => handleDeleteClick(game)}
                                                                className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:text-red-300 dark:hover:bg-red-900/20"
                                                                title="Delete Game"
                                                            >
                                                                <TrashIcon className="h-4 w-4" />
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ) : null}
                                </div>
                            )}
                        </div>
                    </Card>

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
                                <FunnelIcon className="h-4 w-4" />
                            </Button>
                        </div>

                        {/* Filter Controls */}
                        <div className={cx(
                            "grid gap-4",
                            isMobileFiltersOpen ? "grid-cols-1" : "hidden sm:grid sm:grid-cols-4"
                        )}>
                            <div className="col-span-1">
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Entity</label>
                                <MultiEntitySelector className="w-full" />
                            </div>
                            
                            <div className="col-span-1">
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Assignment Status</label>
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
                            
                            <div className="col-span-1">
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Filter Results</label>
                                <Input 
                                    type="text"
                                    placeholder="Filter loaded games..."
                                    value={searchQuery}
                                    onChange={(e) => setSearchQuery(e.target.value)}
                                />
                            </div>
                            
                            <div className="col-span-1 flex items-end">
                                <Button
                                    onClick={handleReassignOpen}
                                    disabled={selectedGameIds.size === 0}
                                    className="w-full"
                                >
                                    Reassign Venue ({selectedGameIds.size})
                                </Button>
                            </div>
                        </div>
                    </div>

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

            {/* === Create Game Modal === */}
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

            {/* === Edit Game Modal === */}
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

            {/* === Delete Confirmation Modal === */}
            <Modal
                isOpen={isDeleteModalOpen}
                onClose={handleDeleteCancel}
                title="Delete Game"
            >
                <div className="space-y-4">
                    {/* Warning */}
                    <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-md border border-red-200 dark:border-red-800">
                        <div className="flex gap-3">
                            <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-500 shrink-0" />
                            <div>
                                <h4 className="text-sm font-medium text-red-800 dark:text-red-400">
                                    This action cannot be undone
                                </h4>
                                <p className="text-xs text-red-700 dark:text-red-500 mt-1">
                                    This will permanently delete the game and all associated data including:
                                    player entries, results, transactions, financial snapshots, and costs.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Game Details */}
                    {gameToDelete && (
                        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-md">
                            <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                                Game to delete:
                            </h4>
                            <dl className="text-sm space-y-1">
                                <div className="flex justify-between">
                                    <dt className="text-gray-500 dark:text-gray-400">Name:</dt>
                                    <dd className="text-gray-900 dark:text-gray-100 font-medium truncate max-w-xs">
                                        {gameToDelete.name}
                                    </dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-gray-500 dark:text-gray-400">Date:</dt>
                                    <dd className="text-gray-900 dark:text-gray-100">
                                        {formatDateTimeAEST(new Date(gameToDelete.gameStartDateTime))}
                                    </dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-gray-500 dark:text-gray-400">Venue:</dt>
                                    <dd className="text-gray-900 dark:text-gray-100">{gameToDelete.venueName}</dd>
                                </div>
                                <div className="flex justify-between">
                                    <dt className="text-gray-500 dark:text-gray-400">Players:</dt>
                                    <dd className="text-gray-900 dark:text-gray-100">{gameToDelete.totalUniquePlayers}</dd>
                                </div>
                                {gameToDelete.consolidationType && (
                                    <div className="flex justify-between">
                                        <dt className="text-gray-500 dark:text-gray-400">Type:</dt>
                                        <dd className="text-gray-900 dark:text-gray-100">
                                            <span className={cx(
                                                "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium",
                                                gameToDelete.consolidationType === 'PARENT' 
                                                    ? "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                                                    : "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                                            )}>
                                                {gameToDelete.consolidationType}
                                            </span>
                                        </dd>
                                    </div>
                                )}
                            </dl>
                            
                            {/* Parent/Child Warning */}
                            {gameToDelete.consolidationType === 'PARENT' && (
                                <div className="mt-3 p-2 bg-amber-50 dark:bg-amber-900/20 rounded border border-amber-200 dark:border-amber-800">
                                    <p className="text-xs text-amber-800 dark:text-amber-300">
                                        <strong>Note:</strong> This is a consolidated PARENT game. Deleting it will unlink all child flights/days.
                                    </p>
                                </div>
                            )}
                            
                            {gameToDelete.consolidationType === 'CHILD' && (
                                <div className="mt-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded border border-blue-200 dark:border-blue-800">
                                    <p className="text-xs text-blue-800 dark:text-blue-300">
                                        <strong>Note:</strong> This is a CHILD game (flight/day). The parent totals will be recalculated.
                                    </p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Error Message */}
                    {deleteError && (
                        <div className="bg-red-50 dark:bg-red-900/20 p-3 rounded-md border border-red-200 dark:border-red-800">
                            <p className="text-sm text-red-700 dark:text-red-300">
                                {deleteError}
                            </p>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100 dark:border-gray-800">
                        <Button 
                            variant="secondary" 
                            onClick={handleDeleteCancel}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button 
                            variant="destructive"
                            onClick={handleDeleteConfirm}
                            isLoading={isDeleting}
                        >
                            Delete Game
                        </Button>
                    </div>
                </div>
            </Modal>

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