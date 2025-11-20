// src/components/scraper/SaveConfirmationModal.tsx (Enhanced Version with Dropdowns)

import { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { GameData, EntityConfig } from '../../types/game';
import type { TournamentSeries, TournamentSeriesTitle, TournamentSeriesFormData, TournamentSeriesTitleFormData } from '../../types/series';
import type { ScrapedGameData, SeriesStatus } from '../../API';
import { GameVariant } from '../../API';
import { useGameDataEditor } from '../../hooks/useGameDataEditor';
import { QuickDataEditor } from './SaveConfirmation/QuickDataEditor';
import { SeriesDetailsEditor } from './SaveConfirmation/SeriesDetailsEditor';
import { VenueFormData } from '../../types/venue';

// GraphQL Queries
const getVenueName = /* GraphQL */ `
    query GetVenueName($id: ID!) {
        getVenue(id: $id) {
            id
            name
        }
    }
`;

const listEntitiesForDropdown = /* GraphQL */ `
    query ListEntitiesForDropdown($limit: Int, $nextToken: String) {
        listEntities(limit: $limit, nextToken: $nextToken) {
            items {
                id
                entityName
                gameUrlDomain
                isActive
            }
            nextToken
        }
    }
`;

const listVenuesForDropdown = /* GraphQL */ `
    query ListVenuesForDropdown($filter: ModelVenueFilterInput, $limit: Int, $nextToken: String) {
        listVenues(filter: $filter, limit: $limit, nextToken: $nextToken) {
            items {
                id
                name
                venueNumber
                entityId
            }
            nextToken
        }
    }
`;

const listSeriesForDropdown = /* GraphQL */ `
    query ListSeriesForDropdown($limit: Int, $nextToken: String) {
        listTournamentSeries(limit: $limit, nextToken: $nextToken) {
            items {
                id
                name
                year
                status
                venueId
                tournamentSeriesTitleId
                title {
                    id
                    title
                }
            }
            nextToken
        }
    }
`;

const listSeriesTitlesForDropdown = /* GraphQL */ `
    query ListSeriesTitlesForDropdown($limit: Int, $nextToken: String) {
        listTournamentSeriesTitles(limit: $limit, nextToken: $nextToken) {
            items {
                id
                title
                aliases
            }
            nextToken
        }
    }
`;

// Mutations for creating new items
const createEntityMutation = /* GraphQL */ `
    mutation CreateEntity($input: CreateEntityInput!) {
        createEntity(input: $input) {
            id
            entityName
            gameUrlDomain
            gameUrlPath
            isActive
        }
    }
`;

const createVenueMutation = /* GraphQL */ `
    mutation CreateVenue($input: CreateVenueInput!) {
        createVenue(input: $input) {
            id
            name
            venueNumber
            entityId
        }
    }
`;

const createSeriesTitleMutation = /* GraphQL */ `
    mutation CreateTournamentSeriesTitle($input: CreateTournamentSeriesTitleInput!) {
        createTournamentSeriesTitle(input: $input) {
            id
            title
            aliases
        }
    }
`;

const createSeriesMutation = /* GraphQL */ `
    mutation CreateTournamentSeries($input: CreateTournamentSeriesInput!) {
        createTournamentSeries(input: $input) {
            id
            name
            year
            status
            venueId
            tournamentSeriesTitleId
        }
    }
`;

// Type for game data that can be passed to this modal
type ModalGameData = ScrapedGameData | GameData | {
    name?: string | null;
    gameStatus?: string | null;
    gameStartDateTime?: string | null;
    tournamentId?: number | null;
    sourceUrl?: string | null;
};

interface SaveConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (editedData: GameData) => void;
    gameData?: ModalGameData;
    venueId: string;
    sourceUrl: string;
    entityId?: string;
    autoMode?: boolean;
    skipConfirmation?: boolean;
}

interface ModalTab {
    id: string;
    label: string;
    icon: string;
}

interface VenueOption {
    id: string;
    name: string;
    venueNumber?: number;
    entityId?: string | null;
}

const tabs: ModalTab[] = [
    { id: 'quick', label: 'Quick Edit', icon: '⚡' },
    { id: 'relationships', label: 'Entity/Venue/Series', icon: '🔗' },
    { id: 'advanced', label: 'Advanced', icon: '⚙️' },
    { id: 'validation', label: 'Validation', icon: '✓' },
    { id: 'diff', label: 'Changes', icon: '📝' }
];

/**
 * Enhanced SaveConfirmationModal with inline editing and relationship dropdowns
 */
export const SaveConfirmationModal: React.FC<SaveConfirmationModalProps> = ({ 
    isOpen, 
    onClose, 
    onConfirm, 
    gameData, 
    venueId,
    sourceUrl,
    entityId,
    autoMode = false,
    skipConfirmation = false
}) => {
    const client = generateClient();
    
    // Core state
    const [venueName, setVenueName] = useState<string>('');
    const [loadingVenue, setLoadingVenue] = useState(false);
    const [activeTab, setActiveTab] = useState<string>('quick');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
    // Dropdown data state
    const [entities, setEntities] = useState<EntityConfig[]>([]);
    const [venues, setVenues] = useState<VenueOption[]>([]);
    const [series, setSeries] = useState<TournamentSeries[]>([]);
    const [seriesTitles, setSeriesTitles] = useState<TournamentSeriesTitle[]>([]);
    const [loadingDropdowns, setLoadingDropdowns] = useState(false);
    
    // Create new modal states
    const [showCreateEntity, setShowCreateEntity] = useState(false);
    const [showCreateVenue, setShowCreateVenue] = useState(false);
    const [showCreateSeries, setShowCreateSeries] = useState(false);
    const [showCreateSeriesTitle, setShowCreateSeriesTitle] = useState(false);
    const [creatingItem, setCreatingItem] = useState(false);
    
    // Form states for creating new items
    const [newEntityData, setNewEntityData] = useState({
        entityName: '',
        gameUrlDomain: '',
        gameUrlPath: '/',
        isActive: true
    });
    
    const [newVenueData, setNewVenueData] = useState<VenueFormData>({
        name: '',
        address: '',
        city: '',
        country: 'Australia',
        aliases: [],
        entityId: null
    });
    
    const [newSeriesData, setNewSeriesData] = useState<TournamentSeriesFormData>({
        name: '',
        year: new Date().getFullYear(),
        status: 'SCHEDULED' as SeriesStatus,
        tournamentSeriesTitleId: '',
        venueId: null
    });
    
    const [newSeriesTitleData, setNewSeriesTitleData] = useState<TournamentSeriesTitleFormData>({
        title: '',
        aliases: []
    });
    
    // Initialize editor with game data
    const initialData = useMemo(() => {
        if (!gameData) return null;
        
        const data: GameData = {
            ...gameData as any,
            venueId: venueId,
            entityId: entityId,
            sourceUrl: sourceUrl
        };
        
        return data;
    }, [gameData, venueId, entityId, sourceUrl]);
    
    const editor = useGameDataEditor(initialData || {} as GameData);
    const {
        editedData,
        originalData,
        hasChanges,
        validationStatus,
        getChangedFields,
        resetAllChanges,
        updateMultipleFields,
        updateField
    } = editor;
    
    // Fetch dropdown data when modal opens
    useEffect(() => {
        if (isOpen) {
            fetchDropdownData();
        }
    }, [isOpen]);
    
    const fetchDropdownData = async () => {
        setLoadingDropdowns(true);
        try {
            const [entitiesRes, venuesRes, seriesRes, titlesRes] = await Promise.all([
                client.graphql({ query: listEntitiesForDropdown, variables: { limit: 100 } }),
                client.graphql({ query: listVenuesForDropdown, variables: { limit: 500 } }),
                client.graphql({ query: listSeriesForDropdown, variables: { limit: 100 } }),
                client.graphql({ query: listSeriesTitlesForDropdown, variables: { limit: 100 } })
            ]);
            
            const entitiesData = (entitiesRes as any).data?.listEntities?.items || [];
            const venuesData = (venuesRes as any).data?.listVenues?.items || [];
            const seriesData = (seriesRes as any).data?.listTournamentSeries?.items || [];
            const titlesData = (titlesRes as any).data?.listTournamentSeriesTitles?.items || [];
            
            setEntities(entitiesData.filter((e: any) => e && e.isActive));
            setVenues(venuesData.filter((v: any) => v));
            setSeries(seriesData.filter((s: any) => s));
            setSeriesTitles(titlesData.filter((t: any) => t));
        } catch (error) {
            console.error('Error fetching dropdown data:', error);
        } finally {
            setLoadingDropdowns(false);
        }
    };
    
    // Filter venues by selected entity
    const filteredVenues = useMemo(() => {
        const selectedEntityId = editedData.entityId;
        if (!selectedEntityId) return venues;
        return venues.filter(v => v.entityId === selectedEntityId || !v.entityId);
    }, [venues, editedData.entityId]);
    
    // Auto-save in auto mode if valid
    useEffect(() => {
        if (autoMode && skipConfirmation && validationStatus.isValid && isOpen) {
            handleConfirm();
        }
    }, [autoMode, skipConfirmation, validationStatus.isValid, isOpen]);
    
    // Fetch venue name when modal opens
    useEffect(() => {
        if (isOpen && venueId && venueId !== 'create_new') {
            const fetchVenueName = async () => {
                setLoadingVenue(true);
                try {
                    const response = await client.graphql({
                        query: getVenueName,
                        variables: { id: venueId }
                    }) as any;
                    
                    if (response.data?.getVenue) {
                        setVenueName(response.data.getVenue.name);
                    }
                } catch (error) {
                    console.error('Error fetching venue:', error);
                    setVenueName('Unknown Venue');
                } finally {
                    setLoadingVenue(false);
                }
            };
            
            fetchVenueName();
        } else {
            setVenueName('');
        }
    }, [isOpen, venueId]);
    
    // Update venue name when venueId changes in editedData
    useEffect(() => {
        if (editedData.venueId) {
            const venue = venues.find(v => v.id === editedData.venueId);
            if (venue) {
                setVenueName(venue.name);
            }
        }
    }, [editedData.venueId, venues]);
    
    const handleConfirm = useCallback(async () => {
        if (!validationStatus.isValid && !autoMode) {
            const shouldProceed = window.confirm(
                `There are ${validationStatus.criticalMissing.length} critical fields missing. ` +
                `Do you want to save anyway?`
            );
            if (!shouldProceed) return;
        }
        
        // *** ADD THE SERIES VALIDATION HERE (after line 358) ***
        // Series validation - add warnings but don't block save
        if (editedData.isSeries) {
            // Validate series fields when it's marked as a series
            if (!editedData.seriesName && !editedData.tournamentSeriesId) {
                console.warn('[Series Validation] Series game without series name or ID');
            }
            
            // If it's marked as final day, ensure we have results
            if (editedData.finalDay && (!editedData.results || editedData.results.length === 0)) {
                console.warn('[Series Validation] Final day series event should have prize results');
            }
            
            // If multiple flights, ensure flight letter is set
            if (editedData.dayNumber === 1 && !editedData.flightLetter && 
                editedData.name && /\b(Flight|Day\s*1[A-Z])\b/i.test(editedData.name)) {
                console.warn('[Series Validation] Appears to be a flight but flightLetter not set');
            }
            
            // Optional: Show a warning dialog if critical series data is missing
            if (editedData.finalDay && !editedData.eventNumber && !autoMode) {
                const proceed = window.confirm(
                    'This is marked as a final day but has no event number. ' +
                    'This may affect series reporting. Continue anyway?'
                );
                if (!proceed) return;
            }
        }
        
        setIsSaving(true);
        try {
            await onConfirm(editedData);
        } finally {
            setIsSaving(false);
        }
    }, [validationStatus, editedData, onConfirm, autoMode]);
    
    const handleQuickFix = useCallback(() => {
        const updates: Partial<GameData> = {};
        
        if (!editedData.hasGuarantee && editedData.guaranteeAmount) {
            updates.hasGuarantee = true;
        }
        
        if (!editedData.gameVariant && editedData.name) {
            const nameLower = editedData.name.toLowerCase();
            if (nameLower.includes('plo') || nameLower.includes('omaha')) {
                updates.gameVariant = GameVariant.PLOM;
            } else {
                updates.gameVariant = GameVariant.NLHE;
            }
        }
        
        if (!editedData.isSeries && editedData.name?.toLowerCase().includes('series')) {
            updates.isSeries = true;
        }
        
        updateMultipleFields(updates);
    }, [editedData, updateMultipleFields]);
    
    // Create new entity handler
    const handleCreateEntity = async () => {
        if (!newEntityData.entityName || !newEntityData.gameUrlDomain) {
            alert('Entity name and domain are required');
            return;
        }
        
        setCreatingItem(true);
        try {
            const response = await client.graphql({
                query: createEntityMutation,
                variables: { input: newEntityData }
            }) as any;
            
            const newEntity = response.data?.createEntity;
            if (newEntity) {
                setEntities(prev => [...prev, newEntity]);
                updateField('entityId', newEntity.id);
                setShowCreateEntity(false);
                setNewEntityData({
                    entityName: '',
                    gameUrlDomain: '',
                    gameUrlPath: '/',
                    isActive: true
                });
            }
        } catch (error) {
            console.error('Error creating entity:', error);
            alert('Failed to create entity');
        } finally {
            setCreatingItem(false);
        }
    };
    
    // Create new venue handler
    const handleCreateVenue = async () => {
        if (!newVenueData.name) {
            alert('Venue name is required');
            return;
        }
        
        setCreatingItem(true);
        try {
            // Get max venue number
            const maxVenueNumber = venues.reduce((max, v) => 
                (v.venueNumber && v.venueNumber > max) ? v.venueNumber : max, 0);
            
            const response = await client.graphql({
                query: createVenueMutation,
                variables: { 
                    input: {
                        name: newVenueData.name,
                        address: newVenueData.address,
                        city: newVenueData.city,
                        country: newVenueData.country,
                        aliases: newVenueData.aliases,
                        entityId: newVenueData.entityId || editedData.entityId,
                        venueNumber: maxVenueNumber + 1
                    }
                }
            }) as any;
            
            const newVenue = response.data?.createVenue;
            if (newVenue) {
                setVenues(prev => [...prev, newVenue]);
                updateField('venueId', newVenue.id);
                setVenueName(newVenue.name);
                setShowCreateVenue(false);
                setNewVenueData({
                    name: '',
                    address: '',
                    city: '',
                    country: 'Australia',
                    aliases: [],
                    entityId: null
                });
            }
        } catch (error) {
            console.error('Error creating venue:', error);
            alert('Failed to create venue');
        } finally {
            setCreatingItem(false);
        }
    };
    
    // Create new series title handler
    const handleCreateSeriesTitle = async () => {
        if (!newSeriesTitleData.title) {
            alert('Series title is required');
            return;
        }
        
        setCreatingItem(true);
        try {
            const response = await client.graphql({
                query: createSeriesTitleMutation,
                variables: { input: newSeriesTitleData }
            }) as any;
            
            const newTitle = response.data?.createTournamentSeriesTitle;
            if (newTitle) {
                setSeriesTitles(prev => [...prev, newTitle]);
                setNewSeriesData(prev => ({ ...prev, tournamentSeriesTitleId: newTitle.id }));
                setShowCreateSeriesTitle(false);
                setNewSeriesTitleData({ title: '', aliases: [] });
            }
        } catch (error) {
            console.error('Error creating series title:', error);
            alert('Failed to create series title');
        } finally {
            setCreatingItem(false);
        }
    };
    
    // Create new series handler
    const handleCreateSeries = async () => {
        if (!newSeriesData.name || !newSeriesData.tournamentSeriesTitleId) {
            alert('Series name and title are required');
            return;
        }
        
        setCreatingItem(true);
        try {
            const response = await client.graphql({
                query: createSeriesMutation,
                variables: { 
                    input: {
                        ...newSeriesData,
                        venueId: newSeriesData.venueId || editedData.venueId
                    }
                }
            }) as any;
            
            const newSeries = response.data?.createTournamentSeries;
            if (newSeries) {
                setSeries(prev => [...prev, newSeries]);
                updateField('tournamentSeriesId' as keyof GameData, newSeries.id);
                updateField('seriesName', newSeriesData.name);
                updateField('isSeries', true);
                setShowCreateSeries(false);
                setNewSeriesData({
                    name: '',
                    year: new Date().getFullYear(),
                    status: 'SCHEDULED' as SeriesStatus,
                    tournamentSeriesTitleId: '',
                    venueId: null
                });
            }
        } catch (error) {
            console.error('Error creating series:', error);
            alert('Failed to create series');
        } finally {
            setCreatingItem(false);
        }
    };
    
    // Render relationship tab content
    const renderRelationshipsTab = () => {
        return (
            <div className="p-4 space-y-6">
                {loadingDropdowns ? (
                    <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="mt-2 text-sm text-gray-500">Loading dropdown data...</p>
                    </div>
                ) : (
                    <>
                        {/* Entity Selection */}
                        <div className="border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-semibold text-sm">🏢 Entity</h3>
                                <button
                                    onClick={() => setShowCreateEntity(true)}
                                    className="text-xs text-blue-600 hover:text-blue-700"
                                >
                                    + Create New
                                </button>
                            </div>
                            <select
                                value={editedData.entityId || ''}
                                onChange={(e) => {
                                    updateField('entityId', e.target.value || null);
                                    // Reset venue when entity changes
                                    if (e.target.value !== editedData.entityId) {
                                        updateField('venueId', null);
                                    }
                                }}
                                className="w-full px-3 py-2 border rounded-md text-sm"
                            >
                                <option value="">-- Select Entity --</option>
                                {entities.map(entity => (
                                    <option key={entity.id} value={entity.id}>
                                        {entity.entityName} ({entity.gameUrlDomain})
                                    </option>
                                ))}
                            </select>
                            
                            {/* Create Entity Modal */}
                            {showCreateEntity && (
                                <div className="mt-3 p-3 bg-gray-50 rounded border">
                                    <h4 className="text-sm font-medium mb-2">Create New Entity</h4>
                                    <div className="space-y-2">
                                        <input
                                            type="text"
                                            placeholder="Entity Name *"
                                            value={newEntityData.entityName}
                                            onChange={(e) => setNewEntityData(prev => ({ ...prev, entityName: e.target.value }))}
                                            className="w-full px-2 py-1 text-sm border rounded"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Domain (e.g., example.com) *"
                                            value={newEntityData.gameUrlDomain}
                                            onChange={(e) => setNewEntityData(prev => ({ ...prev, gameUrlDomain: e.target.value }))}
                                            className="w-full px-2 py-1 text-sm border rounded"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Path (default: /)"
                                            value={newEntityData.gameUrlPath}
                                            onChange={(e) => setNewEntityData(prev => ({ ...prev, gameUrlPath: e.target.value }))}
                                            className="w-full px-2 py-1 text-sm border rounded"
                                        />
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={handleCreateEntity}
                                                disabled={creatingItem}
                                                className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                            >
                                                {creatingItem ? 'Creating...' : 'Create'}
                                            </button>
                                            <button
                                                onClick={() => setShowCreateEntity(false)}
                                                className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {/* Venue Selection */}
                        <div className="border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-semibold text-sm">📍 Venue</h3>
                                <button
                                    onClick={() => {
                                        setNewVenueData(prev => ({ 
                                            ...prev, 
                                            entityId: editedData.entityId || null 
                                        }));
                                        setShowCreateVenue(true);
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-700"
                                >
                                    + Create New
                                </button>
                            </div>
                            <select
                                value={editedData.venueId || ''}
                                onChange={(e) => updateField('venueId', e.target.value || null)}
                                className="w-full px-3 py-2 border rounded-md text-sm"
                            >
                                <option value="">-- Select Venue --</option>
                                {filteredVenues.map(venue => (
                                    <option key={venue.id} value={venue.id}>
                                        {venue.name} {venue.venueNumber ? `(#${venue.venueNumber})` : ''}
                                    </option>
                                ))}
                            </select>
                            {editedData.entityId && filteredVenues.length === 0 && (
                                <p className="text-xs text-yellow-600 mt-1">
                                    No venues found for selected entity. Create one or select a different entity.
                                </p>
                            )}
                            
                            {/* Create Venue Modal */}
                            {showCreateVenue && (
                                <div className="mt-3 p-3 bg-gray-50 rounded border">
                                    <h4 className="text-sm font-medium mb-2">Create New Venue</h4>
                                    <div className="space-y-2">
                                        <input
                                            type="text"
                                            placeholder="Venue Name *"
                                            value={newVenueData.name}
                                            onChange={(e) => setNewVenueData(prev => ({ ...prev, name: e.target.value }))}
                                            className="w-full px-2 py-1 text-sm border rounded"
                                        />
                                        <input
                                            type="text"
                                            placeholder="Address"
                                            value={newVenueData.address || ''}
                                            onChange={(e) => setNewVenueData(prev => ({ ...prev, address: e.target.value }))}
                                            className="w-full px-2 py-1 text-sm border rounded"
                                        />
                                        <input
                                            type="text"
                                            placeholder="City"
                                            value={newVenueData.city || ''}
                                            onChange={(e) => setNewVenueData(prev => ({ ...prev, city: e.target.value }))}
                                            className="w-full px-2 py-1 text-sm border rounded"
                                        />
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={handleCreateVenue}
                                                disabled={creatingItem}
                                                className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                            >
                                                {creatingItem ? 'Creating...' : 'Create'}
                                            </button>
                                            <button
                                                onClick={() => setShowCreateVenue(false)}
                                                className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {/* Series Selection */}
                        <div className="border rounded-lg p-4">
                            <div className="flex items-center justify-between mb-3">
                                <h3 className="font-semibold text-sm">🏆 Tournament Series</h3>
                                <button
                                    onClick={() => setShowCreateSeries(true)}
                                    className="text-xs text-blue-600 hover:text-blue-700"
                                >
                                    + Create New
                                </button>
                            </div>
                            
                            {/* Series Dropdown */}
                            <select
                                value={(editedData as any).tournamentSeriesId || ''}
                                onChange={(e) => {
                                    const selectedSeriesId = e.target.value || null;
                                    updateField('tournamentSeriesId' as keyof GameData, selectedSeriesId);
                                    
                                    // Auto-fill series name and isSeries flag
                                    if (selectedSeriesId) {
                                        const selectedSeries = series.find(s => s.id === selectedSeriesId);
                                        if (selectedSeries) {
                                            updateField('seriesName', selectedSeries.name);
                                            updateField('isSeries', true);
                                        }
                                    } else {
                                        updateField('isSeries', false);
                                    }
                                }}
                                className="w-full px-3 py-2 border rounded-md text-sm"
                            >
                                <option value="">-- Select Series --</option>
                                {series.map(s => (
                                    <option key={s.id} value={s.id}>
                                        {s.name} ({s.year}) - {s.status}
                                    </option>
                                ))}
                            </select>
                            
                            {/* Series Fields */}
                            <div className="mt-3 space-y-2">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="isSeries"
                                        checked={editedData.isSeries || false}
                                        onChange={(e) => updateField('isSeries', e.target.checked)}
                                        className="h-4 w-4"
                                    />
                                    <label htmlFor="isSeries" className="text-sm">Is part of a series</label>
                                </div>
                                
                                <div>
                                    <label className="text-xs text-gray-600">Series Name</label>
                                    <input
                                        type="text"
                                        value={editedData.seriesName || ''}
                                        onChange={(e) => updateField('seriesName', e.target.value)}
                                        placeholder="e.g., Sydney Millions 2025"
                                        className="w-full px-2 py-1 text-sm border rounded mt-1"
                                    />
                                </div>
                            </div>
                            
                            {/* Create Series Modal */}
                            {showCreateSeries && (
                                <div className="mt-3 p-3 bg-gray-50 rounded border">
                                    <h4 className="text-sm font-medium mb-2">Create New Series</h4>
                                    <div className="space-y-2">
                                        {/* Series Title Selection */}
                                        <div>
                                            <div className="flex items-center justify-between">
                                                <label className="text-xs text-gray-600">Series Brand *</label>
                                                <button
                                                    onClick={() => setShowCreateSeriesTitle(true)}
                                                    className="text-xs text-blue-600 hover:text-blue-700"
                                                >
                                                    + New Title
                                                </button>
                                            </div>
                                            <select
                                                value={newSeriesData.tournamentSeriesTitleId}
                                                onChange={(e) => setNewSeriesData(prev => ({ ...prev, tournamentSeriesTitleId: e.target.value }))}
                                                className="w-full px-2 py-1 text-sm border rounded mt-1"
                                            >
                                                <option value="">-- Select Title --</option>
                                                {seriesTitles.map(title => (
                                                    <option key={title.id} value={title.id}>
                                                        {title.title}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        
                                        {/* Create Series Title Inline */}
                                        {showCreateSeriesTitle && (
                                            <div className="p-2 bg-white rounded border">
                                                <input
                                                    type="text"
                                                    placeholder="New Title Name *"
                                                    value={newSeriesTitleData.title}
                                                    onChange={(e) => setNewSeriesTitleData(prev => ({ ...prev, title: e.target.value }))}
                                                    className="w-full px-2 py-1 text-sm border rounded mb-2"
                                                />
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={handleCreateSeriesTitle}
                                                        disabled={creatingItem}
                                                        className="px-2 py-1 text-xs bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                                    >
                                                        Create Title
                                                    </button>
                                                    <button
                                                        onClick={() => setShowCreateSeriesTitle(false)}
                                                        className="px-2 py-1 text-xs bg-gray-200 rounded hover:bg-gray-300"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                        
                                        <input
                                            type="text"
                                            placeholder="Series Name *"
                                            value={newSeriesData.name}
                                            onChange={(e) => setNewSeriesData(prev => ({ ...prev, name: e.target.value }))}
                                            className="w-full px-2 py-1 text-sm border rounded"
                                        />
                                        
                                        <div className="grid grid-cols-2 gap-2">
                                            <div>
                                                <label className="text-xs text-gray-600">Year</label>
                                                <input
                                                    type="number"
                                                    value={newSeriesData.year}
                                                    onChange={(e) => setNewSeriesData(prev => ({ ...prev, year: parseInt(e.target.value) }))}
                                                    className="w-full px-2 py-1 text-sm border rounded"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-xs text-gray-600">Status</label>
                                                <select
                                                    value={newSeriesData.status}
                                                    onChange={(e) => setNewSeriesData(prev => ({ ...prev, status: e.target.value as SeriesStatus }))}
                                                    className="w-full px-2 py-1 text-sm border rounded"
                                                >
                                                    <option value="SCHEDULED">Scheduled</option>
                                                    <option value="LIVE">Live</option>
                                                    <option value="COMPLETED">Completed</option>
                                                </select>
                                            </div>
                                        </div>
                                        
                                        <div className="flex gap-2 mt-2">
                                            <button
                                                onClick={handleCreateSeries}
                                                disabled={creatingItem}
                                                className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                                            >
                                                {creatingItem ? 'Creating...' : 'Create Series'}
                                            </button>
                                            <button
                                                onClick={() => setShowCreateSeries(false)}
                                                className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {editedData.isSeries && (
                            <SeriesDetailsEditor 
                                editor={editor}
                                series={series}
                                onSeriesChange={(seriesId) => {
                                    // Update the editor's tournamentSeriesId
                                    if (seriesId) {
                                        editor.updateField('tournamentSeriesId', seriesId);
                                    }
                                }}
                            />
                        )}

                        {/* Additional Series Flags */}
                        <div className="border rounded-lg p-4">
                            <h3 className="font-semibold text-sm mb-3">🏷️ Additional Flags</h3>
                            <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="isRegular"
                                        checked={editedData.isRegular || false}
                                        onChange={(e) => updateField('isRegular', e.target.checked)}
                                        className="h-4 w-4"
                                    />
                                    <label htmlFor="isRegular" className="text-sm">Is Regular Event</label>
                                </div>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="isSatellite"
                                        checked={editedData.isSatellite || false}
                                        onChange={(e) => updateField('isSatellite', e.target.checked)}
                                        className="h-4 w-4"
                                    />
                                    <label htmlFor="isSatellite" className="text-sm">Is Satellite</label>
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
        );
    };
    
    const renderTabContent = () => {
        switch (activeTab) {
            case 'quick':
                return <QuickDataEditor editor={editor} showAdvanced={showAdvanced} />;
            
            case 'relationships':
                return renderRelationshipsTab();
                
            case 'advanced':
                return (
                    <div className="p-4">
                        <QuickDataEditor editor={editor} showAdvanced={true} />
                    </div>
                );
                
            case 'validation':
                return (
                    <div className="p-4 space-y-4">
                        {/* Validation Status */}
                        <div className={`p-4 rounded-lg border ${
                            validationStatus.isValid 
                                ? 'bg-green-50 border-green-200' 
                                : 'bg-red-50 border-red-200'
                        }`}>
                            <h3 className={`font-semibold text-sm ${
                                validationStatus.isValid ? 'text-green-800' : 'text-red-800'
                            }`}>
                                {validationStatus.isValid ? '✓ Data Valid' : '⚠ Validation Issues'}
                            </h3>
                            
                            {!validationStatus.isValid && (
                                <div className="mt-2 space-y-2">
                                    {validationStatus.criticalMissing.length > 0 && (
                                        <div>
                                            <div className="text-xs font-medium text-red-700">Critical Missing:</div>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {validationStatus.criticalMissing.map(field => (
                                                    <span key={field} className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                                                        {field}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    
                                    {validationStatus.required.missing.length > 0 && (
                                        <div>
                                            <div className="text-xs font-medium text-red-700">Required Missing:</div>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {validationStatus.required.missing.map(field => (
                                                    <span key={field} className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                                                        {field}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                            
                            {validationStatus.warnings.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-yellow-200">
                                    <div className="text-xs font-medium text-yellow-700">Warnings:</div>
                                    <ul className="mt-1 text-xs text-yellow-600 list-disc list-inside">
                                        {validationStatus.warnings.map((warning, idx) => (
                                            <li key={idx}>{warning}</li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            
                            {!validationStatus.isValid && (
                                <button
                                    onClick={handleQuickFix}
                                    className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 text-sm"
                                >
                                    🔧 Apply Quick Fixes
                                </button>
                            )}
                        </div>
                        
                        {/* Field Stats */}
                        <div className="bg-gray-50 border rounded-lg p-4">
                            <h3 className="font-semibold text-sm mb-3">Field Statistics</h3>
                            <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                    <div className="text-gray-600">Required Fields</div>
                                    <div className="text-2xl font-bold text-green-600">
                                        {validationStatus.required.present}/{validationStatus.required.total}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-gray-600">Optional Fields</div>
                                    <div className="text-2xl font-bold text-gray-600">
                                        {validationStatus.optional.present}/{validationStatus.optional.total}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
                
            case 'diff':
                const changedFields = getChangedFields();
                return (
                    <div className="p-4">
                        {changedFields.length === 0 ? (
                            <div className="text-center text-gray-500 py-8">
                                No changes made yet
                            </div>
                        ) : (
                            <div className="space-y-3">
                                <div className="flex items-center justify-between mb-4">
                                    <h3 className="font-semibold text-sm">
                                        {changedFields.length} Field{changedFields.length > 1 ? 's' : ''} Changed
                                    </h3>
                                    <button
                                        onClick={resetAllChanges}
                                        className="text-sm text-red-600 hover:text-red-700"
                                    >
                                        Reset All Changes
                                    </button>
                                </div>
                                
                                {changedFields.map(field => {
                                    const fieldKey = String(field);
                                    const oldValue = originalData[field];
                                    const newValue = editedData[field];
                                    
                                    return (
                                        <div key={fieldKey} className="border rounded p-3 bg-white">
                                            <div className="font-medium text-sm mb-2">{fieldKey}</div>
                                            <div className="grid grid-cols-2 gap-2 text-xs">
                                                <div>
                                                    <div className="text-gray-500 mb-1">Original</div>
                                                    <div className="p-2 bg-red-50 rounded font-mono">
                                                        {JSON.stringify(oldValue) || '(empty)'}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-gray-500 mb-1">New</div>
                                                    <div className="p-2 bg-green-50 rounded font-mono">
                                                        {JSON.stringify(newValue) || '(empty)'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                );
                
            default:
                return null;
        }
    };
    
    if (!isOpen || !gameData) return null;

    return (
        <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="p-4 border-b flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold">
                            {autoMode ? '⚡ Auto-Save' : '💾 Save'} Tournament Data
                        </h3>
                        <div className="text-xs text-gray-500 mt-1">
                            {editedData.name || 'Unnamed Tournament'} • {loadingVenue ? 'Loading...' : venueName || 'No venue selected'}
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {validationStatus.isValid ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                                ✓ Valid
                            </span>
                        ) : (
                            <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                                ⚠ {validationStatus.criticalMissing.length} Issues
                            </span>
                        )}
                        {hasChanges && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                                {getChangedFields().length} Changes
                            </span>
                        )}
                    </div>
                </div>
                
                {/* Tabs */}
                <div className="border-b flex flex-wrap">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-3 py-2 text-xs sm:text-sm sm:px-4 font-medium transition-colors whitespace-nowrap ${
                                activeTab === tab.id 
                                    ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50' 
                                    : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                            }`}
                        >
                            <span className="mr-1">{tab.icon}</span>
                            <span className="hidden sm:inline">{tab.label}</span>
                            <span className="sm:hidden">{tab.label.split('/')[0]}</span>
                        </button>
                    ))}
                </div>
                
                {/* Content */}
                <div className="flex-1 overflow-auto">
                    {renderTabContent()}
                </div>
                
                {/* Footer */}
                <div className="p-4 border-t flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-sm text-gray-600">
                            <input
                                type="checkbox"
                                checked={showAdvanced}
                                onChange={(e) => setShowAdvanced(e.target.checked)}
                                className="h-4 w-4"
                            />
                            Show all fields
                        </label>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        {hasChanges && (
                            <button
                                onClick={resetAllChanges}
                                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                            >
                                Reset Changes
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm text-gray-600 bg-gray-100 rounded hover:bg-gray-200"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={isSaving || (!validationStatus.isValid && !autoMode)}
                            className={`px-4 py-2 text-sm text-white rounded ${
                                isSaving || (!validationStatus.isValid && !autoMode)
                                    ? 'bg-gray-400 cursor-not-allowed' 
                                    : 'bg-green-600 hover:bg-green-700'
                            }`}
                        >
                            {isSaving ? 'Saving...' : validationStatus.isValid ? 'Save to Database' : 'Save Anyway'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};