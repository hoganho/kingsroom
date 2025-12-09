// src/pages/SeriesManagementPage.tsx

import { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import * as queries from '../graphql/queries';
import * as mutations from '../graphql/mutations';
import * as APITypes from '../API';

import { SeriesTitleManager } from '../components/series/SeriesTitleManager';
import { SeriesInstanceManager } from '../components/series/SeriesInstanceManager';

import { PageWrapper, PageGrid, PageCard } from '../components/layout/PageWrapper';
import { useEntity } from '../contexts/EntityContext';

// Custom query that only fetches venue fields we need (no nested games)
const listVenuesSimple = /* GraphQL */ `
    query ListVenuesSimple(
        $filter: ModelVenueFilterInput
        $limit: Int
        $nextToken: String
    ) {
        listVenues(filter: $filter, limit: $limit, nextToken: $nextToken) {
            items {
                id
                name
                entityId
                _version
                _deleted
            }
            nextToken
        }
    }
`;

export const SeriesManagementPage = () => {
    const client = generateClient();
    const { selectedEntities } = useEntity();
    
    const [seriesTitles, setSeriesTitles] = useState<APITypes.TournamentSeriesTitle[]>([]);
    const [seriesInstances, setSeriesInstances] = useState<APITypes.TournamentSeries[]>([]);
    const [venues, setVenues] = useState<APITypes.Venue[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            // Base filter to exclude soft-deleted items
            const baseFilter = {
                _deleted: { ne: true }
            };

            // ALWAYS fetch ALL series titles (they're global templates)
            const titlesData = await client.graphql({
                query: queries.listTournamentSeriesTitles,
                variables: { filter: baseFilter }
            });
            const titles = (titlesData.data.listTournamentSeriesTitles?.items || []) as APITypes.TournamentSeriesTitle[];
            setSeriesTitles(titles);

            // Get entity IDs for filtering venues and instances
            const entityIds = selectedEntities.map(e => e.id);
            
            // If no entities selected, only show titles
            if (entityIds.length === 0) {
                setSeriesInstances([]);
                setVenues([]);
                setLoading(false);
                return;
            }

            // Build entity filter for venues
            const venueFilter = {
                ...baseFilter,
                or: entityIds.map(id => ({ entityId: { eq: id } }))
            };

            // Fetch venues using simple query (no nested games)
            const venuesData = await client.graphql({
                query: listVenuesSimple,
                variables: { filter: venueFilter, limit: 500 }
            }) as { data: { listVenues: { items: APITypes.Venue[] } } };
            
            const venueItems = (venuesData.data.listVenues?.items || []).filter(v => !v._deleted) as APITypes.Venue[];
            const venueIds = venueItems.map(v => v.id);
            setVenues(venueItems);

            // Build filter for series instances (by venue)
            if (venueIds.length > 0) {
                const seriesInstanceFilter = {
                    ...baseFilter,
                    or: venueIds.map(id => ({ venueId: { eq: id } }))
                };

                // Fetch series instances (filtered by venues from selected entities)
                const instancesData = await client.graphql({
                    query: queries.listTournamentSeries,
                    variables: { filter: seriesInstanceFilter }
                });
                const instances = (instancesData.data.listTournamentSeries?.items || []) as APITypes.TournamentSeries[];
                setSeriesInstances(instances);
            } else {
                setSeriesInstances([]);
            }

        } catch (error) {
            console.error("Error fetching series data:", error);
        } finally {
            setLoading(false);
        }
    };

    // Re-fetch when selected entities change
    useEffect(() => {
        fetchData();
    }, [selectedEntities]);

    // Listen to entity change events for immediate updates (set up once)
    useEffect(() => {
        const handleEntityChange = () => {
            fetchData();
        };

        window.addEventListener('selectedEntitiesChanged', handleEntityChange);
        return () => {
            window.removeEventListener('selectedEntitiesChanged', handleEntityChange);
        };
    }, []); // Empty dependency array - only set up once

    // Handlers for Series Titles
    const handleSaveTitle = async (input: { id?: string; title: string; seriesCategory?: APITypes.SeriesCategory | null; _version?: number }) => {
        const mutation = input.id ? mutations.updateTournamentSeriesTitle : mutations.createTournamentSeriesTitle;
        
        const payload = input.id 
            ? { id: input.id, title: input.title, seriesCategory: input.seriesCategory, _version: input._version } 
            : { title: input.title, seriesCategory: input.seriesCategory };
        
        try {
            await client.graphql({ query: mutation, variables: { input: payload } });
            fetchData();
        } catch (error) {
            console.error('Error saving series title:', error);
            alert('Failed to save series title. See console for details.');
        }
    };

    const handleDeleteTitle = async (titleToDelete: APITypes.TournamentSeriesTitle) => {
        console.log('[SeriesManagementPage] handleDeleteTitle received this object:', titleToDelete);

        if (!titleToDelete?._version) {
            console.error('[SeriesManagementPage] FATAL: The object to delete is missing its _version number. Halting delete operation.');
            alert('Error: Cannot delete item because its version is missing. Please refresh the page.');
            return;
        }

        if (window.confirm("Are you sure? This action cannot be undone.")) {
            const deleteInput = {
                id: titleToDelete.id,
                _version: titleToDelete._version
            };
            console.log('[SeriesManagementPage] Sending this input to the delete mutation:', deleteInput);

            try {
                await client.graphql({
                    query: mutations.deleteTournamentSeriesTitle,
                    variables: { input: deleteInput }
                });

                console.log('[SeriesManagementPage] Delete mutation was successful.');
                fetchData();

            } catch (error) {
                console.error('[SeriesManagementPage] Error deleting series title:', JSON.stringify(error, null, 2));
                alert('Failed to delete series title. The data may have been modified by someone else. See console for details.');
            }
        }
    };

    // Handlers for Series Instances
    const handleSaveInstance = async (formState: Partial<APITypes.TournamentSeries>) => {
        try {
            if (formState.id && formState._version) {
                const updateInput: APITypes.UpdateTournamentSeriesInput = {
                    id: formState.id,
                    _version: formState._version,
                    name: formState.name,
                    year: formState.year,
                    quarter: formState.quarter,
                    month: formState.month,
                    startDate: formState.startDate,
                    endDate: formState.endDate,
                    status: formState.status,
                    seriesCategory: formState.seriesCategory,
                    holidayType: formState.holidayType,
                    tournamentSeriesTitleId: formState.tournamentSeriesTitleId,
                    venueId: formState.venueId,
                };

                await client.graphql({ 
                    query: mutations.updateTournamentSeries, 
                    variables: { input: updateInput } 
                });
            } else {
                const createInput: APITypes.CreateTournamentSeriesInput = {
                    name: formState.name!,
                    year: formState.year!,
                    quarter: formState.quarter,
                    month: formState.month,
                    status: formState.status!,
                    seriesCategory: formState.seriesCategory!,
                    holidayType: formState.holidayType,
                    tournamentSeriesTitleId: formState.tournamentSeriesTitleId!,
                    venueId: formState.venueId!,
                    startDate: formState.startDate,
                    endDate: formState.endDate,
                };

                await client.graphql({ 
                    query: mutations.createTournamentSeries, 
                    variables: { input: createInput } 
                });
            }
            
            fetchData();
        } catch (error) {
            console.error('Error saving series instance:', error);
            alert('Failed to save series instance. See console for details.');
        }
    };
    
    const handleDeleteInstance = async (instanceToDelete: APITypes.TournamentSeries) => {
        if (window.confirm("Are you sure you want to delete this series instance?")) {
            if (!instanceToDelete._version) {
                 alert('Error: Cannot delete item because its version is missing. Please refresh the page.');
                 return;
            }
            try {
                await client.graphql({ 
                    query: mutations.deleteTournamentSeries, 
                    variables: { 
                        input: { 
                            id: instanceToDelete.id,
                            _version: instanceToDelete._version
                        } 
                    } 
                });
                fetchData();
            } catch (error) {
                console.error('Error deleting series instance:', error);
                alert('Failed to delete series instance. See console for details.');
            }
        }
    };
    
    if (loading) {
        return (
            <PageWrapper title="Series Management" maxWidth="7xl">
                <div className="p-8 text-center">Loading...</div>
            </PageWrapper>
        );
    }

    // Show message if no entities selected
    if (selectedEntities.length === 0) {
        return (
            <PageWrapper title="Series Management" maxWidth="7xl">
                <div className="p-8 text-center text-gray-500">
                    Please select at least one entity from the sidebar to view series data.
                </div>
            </PageWrapper>
        );
    }

    return (
        <PageWrapper title="Series Management" maxWidth="7xl">
            <PageGrid columns={3} gap="lg">
                <div className="lg:col-span-1">
                    <PageCard>
                        <SeriesTitleManager 
                            titles={seriesTitles}
                            onSave={handleSaveTitle}
                            onDelete={handleDeleteTitle}
                        />
                    </PageCard>
                </div>
                <div className="lg:col-span-2">
                    <PageCard>
                        <SeriesInstanceManager
                            seriesInstances={seriesInstances}
                            seriesTitles={seriesTitles}
                            venues={venues}
                            onSave={handleSaveInstance}
                            onDelete={handleDeleteInstance}
                        />
                    </PageCard>
                </div>
            </PageGrid>
        </PageWrapper>
    );
};