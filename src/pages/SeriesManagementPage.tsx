// src/pages/SeriesManagementPage.tsx

import { useState, useEffect } from 'react';
import { generateClient } from 'aws-amplify/api';
import * as queries from '../graphql/queries';
import * as mutations from '../graphql/mutations';
import * as APITypes from '../API';

import { SeriesTitleManager } from '../components/series/SeriesTitleManager';
import { SeriesInstanceManager } from '../components/series/SeriesInstanceManager';

import { PageWrapper, PageGrid, PageCard } from '../components/layout/PageWrapper';

export const SeriesManagementPage = () => {
    const client = generateClient();
    const [seriesTitles, setSeriesTitles] = useState<APITypes.TournamentSeriesTitle[]>([]);
    const [seriesInstances, setSeriesInstances] = useState<APITypes.TournamentSeries[]>([]);
    const [venues, setVenues] = useState<APITypes.Venue[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = async () => {
        setLoading(true);
        try {
            // ✅ 1. Define the filter to exclude soft-deleted items.
            const filter = {
                _deleted: {
                    ne: true // 'ne' means "not equal to"
                }
            };

            const [titlesData, instancesData, venuesData] = await Promise.all([
                // ✅ 2. Pass the filter to your list queries.
                client.graphql({
                    query: queries.listTournamentSeriesTitles,
                    variables: { filter }
                }),
                client.graphql({
                    query: queries.listTournamentSeries,
                    variables: { filter }
                }),
                client.graphql({
                    query: queries.listVenues,
                    variables: { filter }
                })
            ]);

            // The rest of the function remains the same
            const titles = (titlesData.data.listTournamentSeriesTitles?.items || []) as APITypes.TournamentSeriesTitle[];
            const instances = (instancesData.data.listTournamentSeries?.items || []) as APITypes.TournamentSeries[];
            const venueItems = (venuesData.data.listVenues?.items || []) as APITypes.Venue[];

            setSeriesTitles(titles);
            setSeriesInstances(instances);
            setVenues(venueItems);

        } catch (error) {
            console.error("Error fetching series data:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    // Handlers for Series Titles
    const handleSaveTitle = async (input: { id?: string; title: string; _version?: number }) => {
        const mutation = input.id ? mutations.updateTournamentSeriesTitle : mutations.createTournamentSeriesTitle;
        
        const payload = input.id 
            ? { id: input.id, title: input.title, _version: input._version } 
            : { title: input.title };
        
        try {
            await client.graphql({ query: mutation, variables: { input: payload } });
            fetchData();
        } catch (error) {
            console.error('Error saving series title:', error);
            alert('Failed to save series title. See console for details.');
        }
    };

    const handleDeleteTitle = async (titleToDelete: APITypes.TournamentSeriesTitle) => {
        // LOG 2: See what the parent handler receives.
        console.log('[SeriesManagementPage] handleDeleteTitle received this object:', titleToDelete);

        if (!titleToDelete?._version) {
            console.error('[SeriesManagementPage] FATAL: The object to delete is missing its _version number. Halting delete operation.');
            alert('Error: Cannot delete item because its version is missing. Please refresh the page.');
            return;
        }

        if (window.confirm("Are you sure? This action cannot be undone.")) {
            
            // LOG 3: See the exact payload being sent to the backend.
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
                // LOG 4: See the full, detailed error from the backend.
                console.error('[SeriesManagementPage] Error deleting series title:', JSON.stringify(error, null, 2));
                alert('Failed to delete series title. The data may have been modified by someone else. See console for details.');
            }
        }
    };

    // Handlers for Series Instances
    const handleSaveInstance = async (formState: Partial<APITypes.TournamentSeries>) => {
        try {
            // Check if the form state has an ID and version, which signifies an update.
            if (formState.id && formState._version) {
                
                // This is an UPDATE operation
                console.log('Attempting to update series instance...');

                // Construct the specific input required by the update mutation.
                const updateInput: APITypes.UpdateTournamentSeriesInput = {
                    id: formState.id,
                    _version: formState._version,
                    // Copy over other fields from the form
                    name: formState.name,
                    year: formState.year,
                    startDate: formState.startDate,
                    endDate: formState.endDate,
                    status: formState.status,
                    tournamentSeriesTitleId: formState.tournamentSeriesTitleId,
                    venueId: formState.venueId,
                    // Add any other fields from the form here
                };

                await client.graphql({ 
                    query: mutations.updateTournamentSeries, 
                    variables: { input: updateInput } 
                });

            } else {
                // This is a CREATE operation
                console.log('Attempting to create new series instance...');

                // Construct the specific input required by the create mutation.
                // Ensure all non-nullable fields are present.
                const createInput: APITypes.CreateTournamentSeriesInput = {
                    name: formState.name!,
                    year: formState.year!,
                    status: formState.status!,
                    tournamentSeriesTitleId: formState.tournamentSeriesTitleId!,
                    venueId: formState.venueId!,
                    startDate: formState.startDate,
                    endDate: formState.endDate,
                    // Add any other fields from the form here
                };

                // Add a safety check for required fields before sending
                if (!createInput.name || !createInput.year || !createInput.status || !createInput.tournamentSeriesTitleId || !createInput.venueId) {
                    alert("Cannot create series: Missing required fields (Name, Year, Status, Title, or Venue).");
                    return;
                }

                await client.graphql({ 
                    query: mutations.createTournamentSeries, 
                    variables: { input: createInput } 
                });
            }
            
            console.log('Save operation successful. Refreshing data...');
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

    return (
    
        <PageWrapper title="Series Management" maxWidth="7xl">
            {/* ✅ FIX: No extra padding div needed. PageWrapper handles it. */}
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

