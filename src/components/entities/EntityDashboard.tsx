// components/EntityDashboard-fixed.tsx
// Fixed version with proper error handling for missing entities

import React, { useState, useEffect, useCallback } from 'react';
// FIX: Reverting to original v5 Amplify import path
import { generateClient, GraphQLResult } from 'aws-amplify/api'; 
// FIX: Reverting to original import path (no extension)
import { entityHelpers, EntityWithStats } from '../../graphql/entityOperations'; 
// FIX: Reverting to original import path (no extension)
import { EntitySelector, EntityManager } from './EntitySelector'; 
// FIX: Reverting to original import path (no extension)
import { getCurrentEntityId } from '../../services/gameService'; 

// Type definitions for GraphQL responses
interface GetEntityResponse {
    getEntity: {
        id: string;
        entityName: string;
        gameUrlDomain: string;
        gameUrlPath: string;
        entityLogo?: string;
        isActive: boolean;
        games?: {
            items: Array<{ id: string }>;
        };
        venues?: {
            items: Array<{ id: string }>;
        };
        scraperStates?: {
            items: Array<{
                id: string;
                isRunning: boolean;
                lastRunEndTime?: string;
            }>;
        };
    };
}

interface ListGamesResponse {
    listGames: {
        items: Array<{
            id: string;
            name: string;
            gameStartDateTime?: string;
            gameStatus?: string;
            registrationStatus?: string;
            venueId?: string;
            venue?: {
                name: string;
            };
            prizepoolPaid?: number;
            prizepoolCalculated?: number;
            totalUniquePlayers?: number;
            totalInitialEntries?: number;
            totalEntries?: number;
        }>;
        nextToken?: string;
    };
}

interface ListVenuesResponse {
    listVenues: {
        items: Array<{
            id: string;
            name: string;
            aliases?: string[];
            address?: string;
            city?: string;
            country?: string;
        }>;
        nextToken?: string;
    };
}

interface DashboardMetric {
    label: string;
    value: number | string;
    change?: number;
    changeLabel?: string;
    icon?: string;
    color?: 'blue' | 'green' | 'yellow' | 'red' | 'gray';
}

interface EntityDashboardProps {
    className?: string;
    onEntityChange?: (entityId: string) => void;
}

export const EntityDashboard: React.FC<EntityDashboardProps> = ({ 
    className, 
    onEntityChange 
}) => {
    const [currentEntityId, setCurrentEntityId] = useState<string>('');
    const [entityData, setEntityData] = useState<EntityWithStats | null>(null);
    const [metrics, setMetrics] = useState<DashboardMetric[]>([]);
    const [recentGames, setRecentGames] = useState<ListGamesResponse['listGames']['items']>([]);
    const [venues, setVenues] = useState<ListVenuesResponse['listVenues']['items']>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'overview' | 'games' | 'venues' | 'settings'>('overview');

    const client = generateClient();

    // Helper function to safely extract data from GraphQL response
    const getGraphQLData = <T,>(response: GraphQLResult<T> | any): T => {
        if ('data' in response) {
            return response.data;
        }
        throw new Error('Invalid GraphQL response');
    };

    // Load entity data
    const loadEntityData = useCallback(async (entityId: string) => {
        // FIXED: Add validation for entityId
        if (!entityId || entityId.trim() === '') {
            console.warn('No entity ID provided, skipping load');
            setLoading(false);
            setError('No entity selected. Please select an entity to view its dashboard.');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            // Get entity details using auto-generated getEntity query
            const entityResponse = await client.graphql({
                query: /* GraphQL */ `
                    query GetEntityWithStats($id: ID!) {
                        getEntity(id: $id) {
                            id
                            entityName
                            gameUrlDomain
                            gameUrlPath
                            entityLogo
                            isActive
                            games {
                                items { id }
                            }
                            venues {
                                items { id }
                            }
                            scraperStates {
                                items {
                                    id
                                    isRunning
                                    lastRunEndTime
                                }
                            }
                        }
                    }
                `,
                variables: { id: entityId }
            });

            const entityData = getGraphQLData<GetEntityResponse>(entityResponse);
            const entity = entityData?.getEntity;
            
            if (!entity) {
                // FIXED: Better error handling for missing entity
                console.warn(`Entity with ID "${entityId}" not found`);
                setError('Entity not found. The selected entity may have been deleted or you may not have access to it.');
                setEntityData(null);
                setMetrics([]);
                setRecentGames([]);
                setVenues([]);
                return;
            }

            // Get entity statistics using helper
            const stats = await entityHelpers.getEntityStats(entityId, client);

            // Get recent games using listGames with filter
            const gamesResponse = await client.graphql({
                query: /* GraphQL */ `
                    query GetEntityGames($entityId: ID!, $limit: Int) {
                        listGames(
                            filter: { entityId: { eq: $entityId } }
                            limit: $limit
                        ) {
                            items {
                                id
                                name
                                gameStartDateTime
                                gameStatus
                                registrationStatus
                                venueId
                                venue {
                                    name
                                }
                                prizepoolPaid
                                prizepoolCalculated
                                totalUniquePlayers
                                totalInitialEntries
                                totalEntries
                            }
                            nextToken
                        }
                    }
                `,
                variables: { 
                    entityId, 
                    limit: 10
                }
            });

            const gamesData = getGraphQLData<ListGamesResponse>(gamesResponse);
            
            // Get venues using listVenues with filter
            const venuesResponse = await client.graphql({
                query: /* GraphQL */ `
                    query GetEntityVenues($entityId: ID!) {
                        listVenues(
                            filter: { entityId: { eq: $entityId } }
                        ) {
                            items {
                                id
                                name
                                aliases
                                address
                                city
                                country
                            }
                            nextToken
                        }
                    }
                `,
                variables: { entityId }
            });

            const venuesData = getGraphQLData<ListVenuesResponse>(venuesResponse);

            // Combine entity data with stats
            const combinedData: EntityWithStats = {
                ...entity,
                stats: stats
            };

            setEntityData(combinedData);
            setRecentGames(gamesData.listGames.items || []);
            setVenues(venuesData.listVenues.items || []);

            // === FIX FOR STATS ERRORS START ===

            // Find the most recent scraper run time
            const lastRunTimes = entity.scraperStates?.items
                .map((s: any) => s.lastRunEndTime)
                .filter(Boolean) // Remove null/undefined
                .map((timeStr: string) => new Date(timeStr).getTime()); // Convert to numbers
            
            const mostRecentRunTime = lastRunTimes && lastRunTimes.length > 0 
                ? Math.max(...lastRunTimes) 
                : null;
            
            const lastUpdateValue = mostRecentRunTime 
                ? new Date(mostRecentRunTime).toLocaleDateString() 
                : 'Never';

            // Calculate metrics
            const newMetrics: DashboardMetric[] = [
                {
                    label: 'Total Games',
                    value: stats.gamesCount || 0, // FIX: Was stats.totalGames
                    icon: '式',
                    color: 'blue',
                    // FIX: stats.gamesLast30Days does not exist on type. Removing change properties.
                },
                {
                    label: 'Active Venues',
                    value: stats.venuesCount || 0, // FIX: Was stats.activeVenues
                    icon: '桃',
                    color: 'green'
                },
                {
                    label: 'Scrapers Running',
                    value: entity.scraperStates?.items.filter((s: any) => s.isRunning).length || 0,
                    icon: '､', // FIX: Unterminated string literal
                    color: entity.scraperStates?.items.some((s: any) => s.isRunning) ? 'yellow' : 'gray'
                },
                {
                    label: 'Last Update',
                    value: lastUpdateValue, // FIX: Was stats.lastUpdate, now derived from scraperStates
                    icon: '套',
                    color: 'gray'
                }
            ];
            // === FIX FOR STATS ERRORS END ===

            setMetrics(newMetrics);

        } catch (err: any) {
            // FIXED: Better error logging and handling
            console.error('Error loading entity data:', err);
            
            // Check if it's a GraphQL error
            if (err?.errors) {
                const errorMessage = err.errors[0]?.message || 'Failed to load entity data';
                setError(errorMessage);
            } else {
                setError('Failed to load entity data. Please check your connection and try again.');
            }
            
            setEntityData(null);
            setMetrics([]);
            setRecentGames([]);
            setVenues([]);
        } finally {
            setLoading(false);
        }
    }, [client]);

    // Initialize entity on mount
    const initEntity = async () => {
        try {
            const entityId = await getCurrentEntityId();
            
            // FIXED: Check if entityId is valid before setting state
            if (entityId && entityId.trim() !== '') {
                setCurrentEntityId(entityId);
                await loadEntityData(entityId);
            } else {
                // No entity selected yet - this is a valid state
                console.log('No entity ID found on initialization');
                setError('Please select an entity to view its dashboard.');
                setLoading(false);
            }
        } catch (err) {
            console.error('Error initializing entity:', err);
            setError('Failed to initialize. Please refresh the page.');
            setLoading(false);
        }
    };

    // Effect to initialize entity
    useEffect(() => {
        initEntity();
    }, []);

    // Handle entity change
    const handleEntityChange = useCallback(async (newEntityId: string) => {
        // FIXED: Validate the new entity ID
        if (!newEntityId || newEntityId.trim() === '') {
            console.warn('Invalid entity ID provided to handleEntityChange');
            return;
        }

        setCurrentEntityId(newEntityId);
        await loadEntityData(newEntityId);
        
        if (onEntityChange) {
            onEntityChange(newEntityId);
        }
    }, [loadEntityData, onEntityChange]);

    // Render loading state
    if (loading && !entityData) {
        return (
            <div className={`bg-white rounded-lg shadow ${className || ''}`}>
                <div className="p-6">
                    <div className="animate-pulse">
                        <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
                        <div className="grid grid-cols-4 gap-4">
                            {[1, 2, 3, 4].map(i => (
                                <div key={i} className="h-24 bg-gray-200 rounded"></div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Render component
    return (
        <div className={`bg-white rounded-lg shadow ${className || ''}`}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-200">
                <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-4">
                        <EntitySelector
                        entityId={currentEntityId}
                        onEntityChange={handleEntityChange}
                        disabled={loading}
                        />
                        {entityData && (
                            <span className={`
                                px-2 py-1 text-xs rounded-full
                                ${entityData.isActive 
                                    ? 'bg-green-100 text-green-800' 
                                    : 'bg-gray-100 text-gray-600'}
                            `}>
                                {entityData.isActive ? 'Active' : 'Inactive'}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-500">
                            {loading ? 'Loading...' : 'Last refreshed: just now'}
                        </span>
                        <button
                            onClick={() => currentEntityId && loadEntityData(currentEntityId)}
                            disabled={loading || !currentEntityId}
                            className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 disabled:opacity-50"
                        >
                            売 Refresh
                        </button>
                    </div>
                </div>
            </div>

            {/* Error state */}
            {error && (
                <div className="px-6 py-4 bg-red-50 border-b border-red-200">
                    <p className="text-sm text-red-600">{error}</p>
                </div>
            )}

            {/* No entity selected state */}
            {!entityData && !loading && (
                <div className="px-6 py-12">
                    <div className="text-center">
                        <p className="text-gray-500 mb-4">No entity selected</p>
                        <p className="text-sm text-gray-400">
                            Please select an entity from the dropdown above to view its dashboard.
                        </p>
                    </div>
                </div>
            )}

            {/* Main content when entity is loaded */}
            {entityData && (
                <>
                    {/* Tabs */}
                    <div className="border-b border-gray-200">
                        <nav className="flex space-x-8 px-6" aria-label="Tabs">
                            {(['overview', 'games', 'venues', 'settings'] as const).map((tab) => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab)}
                                    className={`
                                        py-2 px-1 border-b-2 font-medium text-sm capitalize
                                        ${activeTab === tab
                                            ? 'border-blue-500 text-blue-600'
                                            : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                        }
                                    `}
                                >
                                    {tab}
                                </button>
                            ))}
                        </nav>
                    </div>

                    {/* Content */}
                    <div className="p-6">
                        {activeTab === 'overview' && (
                            <div className="space-y-6">
                                {/* Metrics Grid */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    {metrics.map((metric, index) => (
                                        <div 
                                            key={index}
                                            className={`
                                                p-4 rounded-lg border
                                                ${metric.color === 'blue' ? 'bg-blue-50 border-blue-200' : ''}
                                                ${metric.color === 'green' ? 'bg-green-50 border-green-200' : ''}
                                                ${metric.color === 'yellow' ? 'bg-yellow-50 border-yellow-200' : ''}
                                                ${metric.color === 'red' ? 'bg-red-50 border-red-200' : ''}
                                                ${metric.color === 'gray' ? 'bg-gray-50 border-gray-200' : ''}
                                            `}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-2xl">{metric.icon}</span>
                                                {metric.change && (
                                                    <span className={`
                                                        text-sm font-medium
                                                        ${metric.change > 0 ? 'text-green-600' : 'text-red-600'}
                                                    `}>
                                                        {metric.change > 0 ? '+' : ''}{metric.change}%
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-2 text-sm text-gray-600">{metric.label}</p>
                                            <p className="mt-1 text-2xl font-semibold text-gray-900">
                                                {metric.value}
                                            </p>
                                            {metric.changeLabel && (
                                                <p className="mt-1 text-xs text-gray-500">{metric.changeLabel}</p>
                                            )}
                                        </div>
                                    ))}
                                </div>

                                {/* Recent Games */}
                                <div>
                                    <h3 className="text-lg font-medium text-gray-900 mb-3">
                                        Recent Games
                                    </h3>
                                    <div className="bg-gray-50 rounded-lg overflow-hidden">
                                        <table className="min-w-full">
                                            <thead>
                                                <tr className="bg-gray-100">
                                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                                        Name
                                                    </th>
                                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                                        Venue
                                                    </th>
                                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                                        Status
                                                    </th>
                                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                                        Prize Pool Paid
                                                    </th>
                                                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                                                        Prize Pool Calculated
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-200">
                                                {recentGames.map(game => (
                                                    <tr key={game.id}>
                                                        <td className="px-4 py-2 text-sm text-gray-900">
                                                            {game.name}
                                                        </td>
                                                        <td className="px-4 py-2 text-sm text-gray-500">
                                                            {game.venue?.name || 'N/A'}
                                                        </td>
                                                        <td className="px-4 py-2 text-sm">
                                                            <span className={`
                                                                px-2 py-1 rounded-full text-xs
                                                                ${game.gameStatus === 'COMPLETED' 
                                                                    ? 'bg-gray-100 text-gray-600'
                                                                    : 'bg-green-100 text-green-600'
                                                                }
                                                            `}>
                                                                {game.gameStatus || 'Unknown'}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-2 text-sm text-gray-900">
                                                            ${game.prizepoolPaid?.toLocaleString() || 0}
                                                        </td>
                                                        <td className="px-4 py-2 text-sm text-gray-900">
                                                            ${game.prizepoolCalculated?.toLocaleString() || 0}
                                                        </td>
                                                    </tr>
                                                ))}
                                                {recentGames.length === 0 && (
                                                    <tr>
                                                        <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                                                            No games found
                                                        </td>
                                                    </tr>
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </div>
                        )}

                        {activeTab === 'games' && (
                            <div>
                                <p className="text-gray-500">Games content coming soon...</p>
                            </div>
                        )}

                        {activeTab === 'venues' && (
                            <div>
                                <h3 className="text-lg font-medium text-gray-900 mb-3">
                                    Venues ({venues.length})
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {venues.map(venue => (
                                        <div key={venue.id} className="bg-gray-50 rounded-lg p-4">
                                            <h4 className="font-medium text-gray-900">{venue.name}</h4>
                                            {venue.city && venue.country && (
                                                <p className="text-sm text-gray-500 mt-1">
                                                    {venue.city}, {venue.country}
                                                </p>
                                            )}
                                            {venue.aliases && venue.aliases.length > 0 && (
                                                <p className="text-xs text-gray-400 mt-2">
                                                    Also known as: {venue.aliases.join(', ')}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                    {venues.length === 0 && (
                                        <p className="text-gray-500 col-span-full text-center py-8">
                                            No venues found
                                        </p>
                                    )}
                                </div>
                            </div>
                        )}

                        {activeTab === 'settings' && (
                            <div>
                                <EntityManager />
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default EntityDashboard;