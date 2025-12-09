// src/pages/settings/GameManagement.tsx
// Game management page with venue reassignment and entity-awareness
// UPDATED: Uses EntityContext for multi-entity selection

import { useState, useEffect, useMemo } from 'react';
import { generateClient } from 'aws-amplify/api';
import { PageWrapper } from '../../components/layout/PageWrapper';
import { formatCurrency } from '../../utils/generalHelpers';
import { MultiEntitySelector } from '../../components/entities/MultiEntitySelector';
import { useEntity } from '../../contexts/EntityContext';
import {
    ChevronUpIcon,
    ChevronDownIcon,
    MagnifyingGlassIcon,
    ArrowPathIcon,
    ExclamationTriangleIcon,
    CheckCircleIcon,
    ClockIcon,
    XMarkIcon,
    InformationCircleIcon,
    DocumentDuplicateIcon,
    ArrowsRightLeftIcon,
} from '@heroicons/react/24/outline';

// Import from gameService
import {
    reassignGameVenue,
    bulkReassignGameVenues,
    getUnassignedVenueId,
    type ReassignGameVenueInput,
    type BulkReassignGameVenuesInput,
} from '../../services/gameService';

const client = generateClient();

// ===================================================================
// TYPES
// ===================================================================

interface Game {
    id: string;
    name: string;
    gameStartDateTime: string;
    gameStatus: string;
    gameVariant: string;
    buyIn: number;
    venueId: string;
    venueName?: string;
    venueAssignmentStatus: string;
    venueAssignmentConfidence: number;
    suggestedVenueName?: string;
    totalUniquePlayers: number;
    totalEntries: number;
    entityId: string;
    entityName?: string;
}

interface Venue {
    id: string;
    name: string;
    entityId: string;
    entityName?: string;
    canonicalVenueId?: string;
}

type SortField = 'gameStartDateTime' | 'name' | 'venueAssignmentStatus' | 'totalUniquePlayers';
type SortDirection = 'asc' | 'desc';
type VenueFilterType = 'all' | 'unassigned' | 'auto_assigned' | 'manually_assigned' | 'needs_review';

// ===================================================================
// GRAPHQL QUERIES
// ===================================================================

const listGamesForManagement = /* GraphQL */ `
    query ListGamesForManagement($filter: ModelGameFilterInput, $limit: Int, $nextToken: String) {
        listGames(filter: $filter, limit: $limit, nextToken: $nextToken) {
            items {
                id
                name
                gameStartDateTime
                gameStatus
                gameVariant
                buyIn
                venueId
                venueAssignmentStatus
                venueAssignmentConfidence
                suggestedVenueName
                totalUniquePlayers
                totalEntries
                entityId
                venue {
                    id
                    name
                    entityId
                }
                entity {
                    id
                    entityName
                }
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
                canonicalVenueId
                entity {
                    id
                    entityName
                }
            }
        }
    }
`;

// ===================================================================
// CONSTANTS
// ===================================================================

const UNASSIGNED_VENUE_ID = getUnassignedVenueId();

const VENUE_STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    'MANUALLY_ASSIGNED': {
        label: 'Manually Assigned',
        color: 'bg-green-100 text-green-800',
        icon: <CheckCircleIcon className="h-4 w-4" />
    },
    'AUTO_ASSIGNED': {
        label: 'Auto Assigned',
        color: 'bg-blue-100 text-blue-800',
        icon: <ClockIcon className="h-4 w-4" />
    },
    'PENDING_ASSIGNMENT': {
        label: 'Pending',
        color: 'bg-yellow-100 text-yellow-800',
        icon: <ExclamationTriangleIcon className="h-4 w-4" />
    },
    'UNASSIGNED': {
        label: 'Unassigned',
        color: 'bg-red-100 text-red-800',
        icon: <ExclamationTriangleIcon className="h-4 w-4" />
    }
};

// ===================================================================
// COMPONENT
// ===================================================================

export const GameManagement = () => {
    // Entity context - multi-entity support
    const { 
        entities, 
        selectedEntities, 
        selectAllEntities,
        loading: entitiesLoading 
    } = useEntity();

    // Data state
    const [games, setGames] = useState<Game[]>([]);
    const [venues, setVenues] = useState<Venue[]>([]);
    const [loading, setLoading] = useState(true);
    const [nextToken, setNextToken] = useState<string | null>(null);

    // Filter state
    const [searchQuery, setSearchQuery] = useState('');
    const [venueFilter, setVenueFilter] = useState<VenueFilterType>('needs_review');

    // Sort state
    const [sortField, setSortField] = useState<SortField>('gameStartDateTime');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

    // Selection state
    const [selectedGameIds, setSelectedGameIds] = useState<Set<string>>(new Set());
    const [selectAll, setSelectAll] = useState(false);

    // Modal state
    const [isReassignModalOpen, setIsReassignModalOpen] = useState(false);
    const [reassignTargetVenueId, setReassignTargetVenueId] = useState<string>('');
    const [reassignEntity, setReassignEntity] = useState<boolean>(true);
    const [isProcessing, setIsProcessing] = useState(false);

    // Cross-entity warning state
    const [crossEntityWarning, setCrossEntityWarning] = useState<{
        show: boolean;
        targetVenueEntity: string | null;
        gameEntities: string[];
    }>({ show: false, targetVenueEntity: null, gameEntities: [] });

    // Toast/notification state
    const [notification, setNotification] = useState<{ 
        type: 'success' | 'error' | 'info' | 'warning'; 
        message: string;
        details?: string;
    } | null>(null);

    // ===================================================================
    // DATA FETCHING
    // ===================================================================

    const fetchVenues = async () => {
        try {
            const response: any = await client.graphql({
                query: listVenuesWithEntity,
                variables: {
                    filter: { isSpecial: { ne: true } }
                }
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

    const fetchGames = async (loadMore = false) => {
        // Don't fetch if no entities are selected
        if (selectedEntities.length === 0) {
            setGames([]);
            setLoading(false);
            return;
        }

        if (!loadMore) {
            setLoading(true);
        }

        try {
            // Build entity filter for multiple selected entities
            const entityFilters = selectedEntities.map(entity => ({
                entityId: { eq: entity.id }
            }));

            // Start with entity filter (always applied when entities are selected)
            let filter: any = {};
            
            // Build venue status filter conditions
            let statusConditions: any[] = [];
            
            switch (venueFilter) {
                case 'unassigned':
                    statusConditions = [{ venueId: { eq: UNASSIGNED_VENUE_ID } }];
                    break;
                case 'auto_assigned':
                    statusConditions = [{ venueAssignmentStatus: { eq: 'AUTO_ASSIGNED' } }];
                    break;
                case 'manually_assigned':
                    statusConditions = [{ venueAssignmentStatus: { eq: 'MANUALLY_ASSIGNED' } }];
                    break;
                case 'needs_review':
                    statusConditions = [
                        { venueAssignmentStatus: { eq: 'AUTO_ASSIGNED' } },
                        { venueAssignmentStatus: { eq: 'PENDING_ASSIGNMENT' } },
                        { venueId: { eq: UNASSIGNED_VENUE_ID } }
                    ];
                    break;
                // 'all' - no status filter needed
            }

            // Combine filters:
            // If single entity and no status filter: simple entityId filter
            // If single entity with status filter: and: [entityId, or: [statuses]]
            // If multiple entities and no status filter: or: [entities]
            // If multiple entities with status filter: and: [or: [entities], or: [statuses]]
            
            if (selectedEntities.length === 1) {
                // Single entity
                if (statusConditions.length === 0) {
                    filter = { entityId: { eq: selectedEntities[0].id } };
                } else if (statusConditions.length === 1) {
                    filter = {
                        and: [
                            { entityId: { eq: selectedEntities[0].id } },
                            statusConditions[0]
                        ]
                    };
                } else {
                    filter = {
                        and: [
                            { entityId: { eq: selectedEntities[0].id } },
                            { or: statusConditions }
                        ]
                    };
                }
            } else {
                // Multiple entities
                if (statusConditions.length === 0) {
                    filter = { or: entityFilters };
                } else if (statusConditions.length === 1) {
                    filter = {
                        and: [
                            { or: entityFilters },
                            statusConditions[0]
                        ]
                    };
                } else {
                    filter = {
                        and: [
                            { or: entityFilters },
                            { or: statusConditions }
                        ]
                    };
                }
            }

            const response: any = await client.graphql({
                query: listGamesForManagement,
                variables: {
                    filter: Object.keys(filter).length > 0 ? filter : undefined,
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

            if (loadMore) {
                setGames(prev => [...prev, ...enrichedGames]);
            } else {
                setGames(enrichedGames);
            }

            setNextToken(newNextToken);
        } catch (error) {
            console.error('Error fetching games:', error);
            showNotification('error', 'Failed to fetch games');
        } finally {
            setLoading(false);
        }
    };

    // Auto-select all entities when they first load
    useEffect(() => {
        if (!entitiesLoading && entities.length > 0 && selectedEntities.length === 0) {
            selectAllEntities();
        }
    }, [entitiesLoading, entities.length]);

    useEffect(() => {
        fetchVenues();
    }, []);

    // Fetch games when selected entities or venue filter changes
    useEffect(() => {
        if (!entitiesLoading && selectedEntities.length > 0) {
            setSelectedGameIds(new Set());
            setSelectAll(false);
            fetchGames();
        }
    }, [selectedEntities, venueFilter, entitiesLoading]);

    // ===================================================================
    // FILTERING & SORTING
    // ===================================================================

    const filteredAndSortedGames = useMemo(() => {
        let result = [...games];

        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            result = result.filter(game =>
                game.name?.toLowerCase().includes(query) ||
                game.venueName?.toLowerCase().includes(query) ||
                game.suggestedVenueName?.toLowerCase().includes(query)
            );
        }

        result.sort((a, b) => {
            let comparison = 0;
            switch (sortField) {
                case 'gameStartDateTime':
                    comparison = new Date(a.gameStartDateTime).getTime() - new Date(b.gameStartDateTime).getTime();
                    break;
                case 'name':
                    comparison = (a.name || '').localeCompare(b.name || '');
                    break;
                case 'venueAssignmentStatus':
                    comparison = (a.venueAssignmentStatus || '').localeCompare(b.venueAssignmentStatus || '');
                    break;
                case 'totalUniquePlayers':
                    comparison = (a.totalUniquePlayers || 0) - (b.totalUniquePlayers || 0);
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });

        return result;
    }, [games, searchQuery, sortField, sortDirection]);

    // ===================================================================
    // SELECTION HANDLERS
    // ===================================================================

    const handleSelectGame = (gameId: string) => {
        setSelectedGameIds(prev => {
            const newSet = new Set(prev);
            if (newSet.has(gameId)) {
                newSet.delete(gameId);
            } else {
                newSet.add(gameId);
            }
            return newSet;
        });
    };

    const handleSelectAll = () => {
        if (selectAll) {
            setSelectedGameIds(new Set());
        } else {
            setSelectedGameIds(new Set(filteredAndSortedGames.map(g => g.id)));
        }
        setSelectAll(!selectAll);
    };

    // ===================================================================
    // VENUE REASSIGNMENT (Using gameService)
    // ===================================================================

    const handleOpenReassignModal = () => {
        if (selectedGameIds.size === 0) {
            showNotification('error', 'Please select at least one game');
            return;
        }
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

        // Check if this is a cross-entity move
        const targetVenue = venues.find(v => v.id === venueId);
        if (!targetVenue) return;

        const selectedGames = filteredAndSortedGames.filter(g => selectedGameIds.has(g.id));
        const gameEntities = [...new Set(selectedGames.map(g => g.entityId))];
        
        const isCrossEntity = gameEntities.some(entityId => entityId !== targetVenue.entityId);

        if (isCrossEntity) {
            const targetEntityName = entities.find(e => e.id === targetVenue.entityId)?.entityName || 'Unknown';
            const gameEntityNames = gameEntities.map(id => 
                entities.find(e => e.id === id)?.entityName || 'Unknown'
            );
            
            setCrossEntityWarning({
                show: true,
                targetVenueEntity: targetEntityName,
                gameEntities: gameEntityNames
            });
        } else {
            setCrossEntityWarning({ show: false, targetVenueEntity: null, gameEntities: [] });
        }
    };

    const handleReassignVenues = async () => {
        if (!reassignTargetVenueId) {
            showNotification('error', 'Please select a target venue');
            return;
        }

        setIsProcessing(true);

        try {
            const gameIds = Array.from(selectedGameIds);

            if (gameIds.length === 1) {
                // Single game reassignment using gameService
                const game = games.find(g => g.id === gameIds[0]);
                
                const input: ReassignGameVenueInput = {
                    gameId: gameIds[0],
                    newVenueId: reassignTargetVenueId,
                    entityId: game?.entityId,
                    reassignEntity,
                    initiatedBy: 'USER'
                };

                const result = await reassignGameVenue(input);

                if (result?.success) {
                    if (result.status === 'QUEUED') {
                        showNotification('info', `Large game queued for processing`, `Task ID: ${result.taskId}`);
                    } else if (result.venueCloned) {
                        showNotification('success', 
                            'Venue reassigned (new venue created)', 
                            `A copy of the venue was created for your entity`
                        );
                        fetchVenues(); // Refresh venues to show new clone
                    } else {
                        showNotification('success', 'Venue reassigned successfully');
                    }
                    fetchGames();
                } else {
                    showNotification('error', result?.message || 'Reassignment failed');
                }
            } else {
                // Bulk reassignment using gameService
                // For bulk, use the first game's entity or the first selected entity
                const firstGame = games.find(g => g.id === gameIds[0]);
                const entityIdForBulk = firstGame?.entityId || selectedEntities[0]?.id;
                
                const input: BulkReassignGameVenuesInput = {
                    gameIds,
                    newVenueId: reassignTargetVenueId,
                    entityId: entityIdForBulk,
                    reassignEntity,
                    initiatedBy: 'USER'
                };

                const result = await bulkReassignGameVenues(input);

                if (result?.success) {
                    showNotification('info', 
                        `${gameIds.length} games queued for reassignment`, 
                        `Task ID: ${result.taskId}`
                    );
                    setTimeout(() => fetchGames(), 2000);
                } else {
                    showNotification('error', result?.message || 'Bulk reassignment failed');
                }
            }

            setSelectedGameIds(new Set());
            setSelectAll(false);
            setIsReassignModalOpen(false);
        } catch (error) {
            console.error('Error reassigning venues:', error);
            showNotification('error', 'Failed to reassign venues');
        } finally {
            setIsProcessing(false);
        }
    };

    // ===================================================================
    // UTILITIES
    // ===================================================================

    const showNotification = (type: 'success' | 'error' | 'info' | 'warning', message: string, details?: string) => {
        setNotification({ type, message, details });
        setTimeout(() => setNotification(null), 6000);
    };

    const formatDateTime = (dateString: string | null) => {
        if (!dateString) return '-';
        const date = new Date(dateString);
        return date.toLocaleDateString('en-AU', {
            day: '2-digit',
            month: 'short',
            year: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const handleSort = (field: SortField) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    const renderSortIcon = (field: SortField) => {
        if (sortField !== field) {
            return <ChevronUpIcon className="h-4 w-4 text-gray-300" />;
        }
        return sortDirection === 'asc'
            ? <ChevronUpIcon className="h-4 w-4 text-indigo-600" />
            : <ChevronDownIcon className="h-4 w-4 text-indigo-600" />;
    };

    const getTargetVenueInfo = () => {
        if (!reassignTargetVenueId) return null;
        return venues.find(v => v.id === reassignTargetVenueId);
    };

    const getVenueStatusConfig = (status: string) => {
        return VENUE_STATUS_CONFIG[status] || VENUE_STATUS_CONFIG['UNASSIGNED'];
    };

    // ===================================================================
    // RENDER
    // ===================================================================

    return (
        <PageWrapper title="Game Management">
            {/* Notification Toast */}
            {notification && (
                <div className={`fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-md ${
                    notification.type === 'success' ? 'bg-green-50 border border-green-200' :
                    notification.type === 'error' ? 'bg-red-50 border border-red-200' :
                    notification.type === 'warning' ? 'bg-amber-50 border border-amber-200' :
                    'bg-blue-50 border border-blue-200'
                }`}>
                    <div className="flex items-start gap-3">
                        {notification.type === 'success' && <CheckCircleIcon className="h-5 w-5 text-green-600" />}
                        {notification.type === 'error' && <XMarkIcon className="h-5 w-5 text-red-600" />}
                        {notification.type === 'warning' && <ExclamationTriangleIcon className="h-5 w-5 text-amber-600" />}
                        {notification.type === 'info' && <InformationCircleIcon className="h-5 w-5 text-blue-600" />}
                        <div className="flex-1">
                            <p className={`text-sm font-medium ${
                                notification.type === 'success' ? 'text-green-800' :
                                notification.type === 'error' ? 'text-red-800' :
                                notification.type === 'warning' ? 'text-amber-800' :
                                'text-blue-800'
                            }`}>{notification.message}</p>
                            {notification.details && (
                                <p className="text-xs text-gray-500 mt-1">{notification.details}</p>
                            )}
                        </div>
                        <button onClick={() => setNotification(null)} className="text-gray-400 hover:text-gray-600">
                            <XMarkIcon className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            )}

            {/* Filter Bar */}
            <div className="bg-white rounded-lg shadow mb-6">
                <div className="p-4 border-b flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        {/* Multi-Entity Selector */}
                        <MultiEntitySelector showLabel={false} />

                        {/* Venue Filter */}
                        <select
                            value={venueFilter}
                            onChange={(e) => setVenueFilter(e.target.value as VenueFilterType)}
                            className="rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm"
                        >
                            <option value="all">All Games</option>
                            <option value="needs_review">Needs Review</option>
                            <option value="unassigned">Unassigned</option>
                            <option value="auto_assigned">Auto Assigned</option>
                            <option value="manually_assigned">Manually Assigned</option>
                        </select>

                        {/* Search */}
                        <div className="relative">
                            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <input
                                type="text"
                                placeholder="Search games..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm w-64"
                            />
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => fetchGames()}
                            disabled={loading || selectedEntities.length === 0}
                            className="p-2 text-gray-500 hover:text-gray-700 disabled:opacity-50"
                            title="Refresh"
                        >
                            <ArrowPathIcon className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                    </div>
                </div>

                {/* Selection Actions */}
                {selectedGameIds.size > 0 && (
                    <div className="p-3 bg-indigo-50 border-b flex items-center justify-between">
                        <div className="text-sm text-indigo-700">
                            {selectedGameIds.size} game{selectedGameIds.size !== 1 ? 's' : ''} selected
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setSelectedGameIds(new Set())}
                                className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800"
                            >
                                Clear Selection
                            </button>
                            <button
                                onClick={handleOpenReassignModal}
                                className="px-3 py-1.5 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                            >
                                Reassign Venue
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Games Table */}
            <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="w-12 px-4 py-3">
                                    <input
                                        type="checkbox"
                                        checked={selectAll}
                                        onChange={handleSelectAll}
                                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                </th>
                                <th 
                                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                    onClick={() => handleSort('gameStartDateTime')}
                                >
                                    <div className="flex items-center gap-1">
                                        Date {renderSortIcon('gameStartDateTime')}
                                    </div>
                                </th>
                                <th 
                                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                    onClick={() => handleSort('name')}
                                >
                                    <div className="flex items-center gap-1">
                                        Name {renderSortIcon('name')}
                                    </div>
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Current Venue
                                </th>
                                <th 
                                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                    onClick={() => handleSort('venueAssignmentStatus')}
                                >
                                    <div className="flex items-center gap-1">
                                        Status {renderSortIcon('venueAssignmentStatus')}
                                    </div>
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Suggested
                                </th>
                                {/* Show Entity column when multiple entities selected */}
                                {selectedEntities.length > 1 && (
                                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                        Entity
                                    </th>
                                )}
                                <th 
                                    className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                    onClick={() => handleSort('totalUniquePlayers')}
                                >
                                    <div className="flex items-center gap-1">
                                        Players {renderSortIcon('totalUniquePlayers')}
                                    </div>
                                </th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Buy-in
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan={selectedEntities.length > 1 ? 9 : 8} className="px-4 py-8 text-center text-gray-500">
                                        <ArrowPathIcon className="h-6 w-6 animate-spin mx-auto mb-2" />
                                        Loading games...
                                    </td>
                                </tr>
                            ) : selectedEntities.length === 0 ? (
                                <tr>
                                    <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                                        Please select at least one entity to view games.
                                    </td>
                                </tr>
                            ) : filteredAndSortedGames.length === 0 ? (
                                <tr>
                                    <td colSpan={selectedEntities.length > 1 ? 9 : 8} className="px-4 py-8 text-center text-gray-500">
                                        No games found matching the current filters.
                                    </td>
                                </tr>
                            ) : (
                                filteredAndSortedGames.map((game) => {
                                    const statusConfig = getVenueStatusConfig(game.venueAssignmentStatus);
                                    
                                    return (
                                        <tr 
                                            key={game.id} 
                                            className={`hover:bg-gray-50 ${selectedGameIds.has(game.id) ? 'bg-indigo-50' : ''}`}
                                        >
                                            <td className="px-4 py-3">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedGameIds.has(game.id)}
                                                    onChange={() => handleSelectGame(game.id)}
                                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                                />
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                                {formatDateTime(game.gameStartDateTime)}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-gray-900">
                                                <div className="max-w-xs truncate" title={game.name}>
                                                    {game.name}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                                {game.venueName}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${statusConfig.color}`}>
                                                    {statusConfig.icon}
                                                    {statusConfig.label}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                                {game.suggestedVenueName || '-'}
                                            </td>
                                            {/* Entity column when multiple selected */}
                                            {selectedEntities.length > 1 && (
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                                                    {game.entityName}
                                                </td>
                                            )}
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                                {game.totalUniquePlayers || 0}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                                                {formatCurrency(game.buyIn)}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Load More */}
                {nextToken && (
                    <div className="px-4 py-3 bg-gray-50 border-t">
                        <button
                            onClick={() => fetchGames(true)}
                            disabled={loading}
                            className="text-sm text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
                        >
                            {loading ? 'Loading...' : 'Load more games'}
                        </button>
                    </div>
                )}
            </div>

            {/* Reassign Modal */}
            {isReassignModalOpen && (
                <div className="fixed inset-0 z-50 overflow-y-auto">
                    <div className="flex min-h-screen items-center justify-center p-4">
                        <div className="fixed inset-0 bg-black bg-opacity-30" onClick={() => setIsReassignModalOpen(false)} />
                        
                        <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">
                                Reassign Venue
                            </h3>
                            
                            <p className="text-sm text-gray-500 mb-4">
                                You are about to reassign {selectedGameIds.size} game{selectedGameIds.size !== 1 ? 's' : ''} to a new venue.
                                {selectedGameIds.size > 50 && (
                                    <span className="block mt-2 text-amber-600">
                                        ⚠️ Large selection - this will be processed in the background.
                                    </span>
                                )}
                            </p>

                            {/* Venue Selection */}
                            <div className="mb-4">
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Target Venue
                                </label>
                                <select
                                    value={reassignTargetVenueId}
                                    onChange={(e) => handleVenueSelectionChange(e.target.value)}
                                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500"
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
                                </select>
                            </div>

                            {/* Cross-Entity Warning */}
                            {crossEntityWarning.show && (
                                <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                                    <div className="flex items-start gap-3">
                                        <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                                        <div>
                                            <h4 className="text-sm font-medium text-amber-800">
                                                Cross-Entity Venue Selection
                                            </h4>
                                            <p className="text-sm text-amber-700 mt-1">
                                                The selected venue belongs to <strong>{crossEntityWarning.targetVenueEntity}</strong>, 
                                                but the selected game(s) belong to <strong>{crossEntityWarning.gameEntities.join(', ')}</strong>.
                                            </p>
                                            
                                            {/* Entity Reassignment Option */}
                                            <div className="mt-4 space-y-3">
                                                <label className="flex items-start gap-3 p-3 bg-white rounded-lg border cursor-pointer hover:bg-gray-50">
                                                    <input
                                                        type="radio"
                                                        name="entityOption"
                                                        checked={reassignEntity}
                                                        onChange={() => setReassignEntity(true)}
                                                        className="mt-0.5 h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <ArrowsRightLeftIcon className="h-4 w-4 text-indigo-600" />
                                                            <span className="text-sm font-medium text-gray-900">
                                                                Also reassign entity
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-gray-500 mt-1">
                                                            Move the game(s) to {crossEntityWarning.targetVenueEntity}. 
                                                            All player stats will be updated for the new entity.
                                                        </p>
                                                    </div>
                                                </label>
                                                
                                                <label className="flex items-start gap-3 p-3 bg-white rounded-lg border cursor-pointer hover:bg-gray-50">
                                                    <input
                                                        type="radio"
                                                        name="entityOption"
                                                        checked={!reassignEntity}
                                                        onChange={() => setReassignEntity(false)}
                                                        className="mt-0.5 h-4 w-4 text-indigo-600 focus:ring-indigo-500"
                                                    />
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <DocumentDuplicateIcon className="h-4 w-4 text-indigo-600" />
                                                            <span className="text-sm font-medium text-gray-900">
                                                                Keep current entity (create venue copy)
                                                            </span>
                                                        </div>
                                                        <p className="text-xs text-gray-500 mt-1">
                                                            A copy of "{getTargetVenueInfo()?.name}" will be created for your entity. 
                                                            Both entities can track games at this physical location separately.
                                                        </p>
                                                    </div>
                                                </label>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Info about what will happen */}
                            {reassignTargetVenueId && !crossEntityWarning.show && (
                                <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                    <div className="flex items-start gap-2">
                                        <InformationCircleIcon className="h-5 w-5 text-blue-600 flex-shrink-0" />
                                        <p className="text-sm text-blue-700">
                                            Game(s) will be assigned to <strong>{getTargetVenueInfo()?.name}</strong>. 
                                            All related player records will be updated automatically.
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="flex justify-end gap-3 mt-6">
                                <button
                                    onClick={() => setIsReassignModalOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleReassignVenues}
                                    disabled={!reassignTargetVenueId || isProcessing}
                                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isProcessing ? 'Processing...' : 'Reassign Venue'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </PageWrapper>
    );
};

export default GameManagement;