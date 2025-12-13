// src/components/scraper/SaveConfirmation/SaveConfirmationModal.tsx
// OPTION B VERSION - Series management delegated to enhanced SeriesDetailsEditor

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { GameData, EntityConfig } from '../../types/game';
import type { TournamentSeries, TournamentSeriesTitle } from '../../types/series';
import type { ScrapedGameData } from '../../API';
import { useGameDataEditor } from '../../hooks/useGameDataEditor';
import { QuickDataEditor } from './SaveConfirmation/QuickDataEditor';
import { SeriesDetailsEditor } from './SaveConfirmation/SeriesDetailsEditor';
import { ConsolidationPreview } from './SaveConfirmation/ConsolidationPreview';
import { useConsolidationPreview } from '../../hooks/useConsolidationPreview';
import { formatCurrency } from '../../utils/generalHelpers';

// ===================================================================
// GRAPHQL OPERATIONS
// ===================================================================

const getVenueName = /* GraphQL */ `
    query GetVenueName($id: ID!) {
        getVenue(id: $id) {
            id
            name
            fee
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
                fee
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
                seriesCategory
                holidayType
                quarter
                month
                title {
                    id
                    title
                    seriesCategory
                }
                venue {
                    id
                    name
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
                seriesCategory
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
            fee
        }
    }
`;

// Note: Series mutations moved to SeriesDetailsEditor-enhanced.tsx

// ===================================================================
// TYPES & INTERFACES
// ===================================================================

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
    fee?: number | null;
}

// ===================================================================
// UTILITY FUNCTIONS
// ===================================================================

const tabs: ModalTab[] = [
    { id: 'quick', label: 'Quick Edit', icon: '⚡' },
    { id: 'relationships', label: 'Entity/Venue/Series', icon: '🔗' },
    { id: 'grouping', label: 'Grouping', icon: '📦' },
    { id: 'advanced', label: 'Advanced', icon: '⚙️' },
    { id: 'validation', label: 'Validation', icon: '✓' },
    { id: 'diff', label: 'Changes', icon: '📝' }
];

// ===================================================================
// LAZY CLIENT INITIALIZATION
// ===================================================================

let clientInstance: any = null;

const getClient = () => {
    if (!clientInstance) {
        clientInstance = generateClient();
    }
    return clientInstance;
};

// ===================================================================
// COMPONENT
// ===================================================================

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
    
    // Core state
    const [venueName, setVenueName] = useState<string>('');
    const [venueFee, setVenueFee] = useState<number | null>(null);
    const [loadingVenue, setLoadingVenue] = useState(false);
    const [activeTab, setActiveTab] = useState<string>('quick');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isEditingVenueFee, setIsEditingVenueFee] = useState(false);
    const [tempVenueFee, setTempVenueFee] = useState<string>('');

    // Dropdown data state
    const [entities, setEntities] = useState<EntityConfig[]>([]);
    const [venues, setVenues] = useState<VenueOption[]>([]);
    const [series, setSeries] = useState<TournamentSeries[]>([]);
    const [seriesTitles, setSeriesTitles] = useState<TournamentSeriesTitle[]>([]);
    
    // Selection state
    const [selectedEntityId, setSelectedEntityId] = useState<string>(entityId || '');
    const [selectedVenueId, setSelectedVenueId] = useState<string>(venueId || '');
    const [selectedSeriesId, setSelectedSeriesId] = useState<string>('');
    const [selectedSeriesTitleId, setSelectedSeriesTitleId] = useState<string>('');
    
    // Creation state (for Entity/Venue only - Series handled by SeriesDetailsEditor)
    const [activeEntityCard, setActiveEntityCard] = useState<'entity' | 'venue' | null>(null);
    const [showCreateCard, setShowCreateCard] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState('');
    
    // New entity/venue creation state
    const [newEntityName, setNewEntityName] = useState('');
    const [newEntityDomain, setNewEntityDomain] = useState('');
    const [newVenueName, setNewVenueName] = useState('');
    const [newVenueFee, setNewVenueFee] = useState<number | null>(null);
    
    // Consolidation tracking state
    const [consolidationInfo, setConsolidationInfo] = useState<{
        willConsolidate: boolean;
        parentName: string | null;
    }>({
        willConsolidate: false,
        parentName: null
    });
    
    // Convert game data to GameData type
    const initialData = useMemo(() => {
        const data = gameData as any;
        return {
            ...data,
            entityId: entityId || data?.entityId || '',
            venueId: venueId || data?.venueId || '',
            sourceUrl: sourceUrl || data?.sourceUrl || '',
            levels: data?.levels || [],
            hasGuarantee: data?.hasGuarantee || false
        } as GameData;
    }, [gameData, entityId, venueId, sourceUrl]);
    
    // Initialize the game data editor hook
    const editor = useGameDataEditor(initialData);
    const { 
        editedData, 
        originalData,
        hasChanges,
        validationStatus,
        updateField, 
        updateMultipleFields,
        resetAllChanges,
        getChangedFields
    } = editor;
    
    // Use consolidation preview hook for header badge
    const { 
        preview: consolidationPreview, 
        isLoading: consolidationLoading,
        willConsolidate 
    } = useConsolidationPreview(editedData, {
        debounceMs: 300,
        includeSiblingDetails: false,
        onPreviewComplete: (result: { willConsolidate: boolean; consolidation?: { parentName: string } | null }) => {
            setConsolidationInfo({
                willConsolidate: result.willConsolidate,
                parentName: result.consolidation?.parentName || null
            });
        }
    });
    
    // Generate a venue number for new venues
    const generateVenueNumber = useCallback(() => {
        return Math.floor(Math.random() * 900000) + 100000;
    }, []);
    
    // Load venue name
    useEffect(() => {
        const loadVenueName = async () => {
            if (!venueId) return;
            
            setLoadingVenue(true);
            try {
                const result = await getClient().graphql({
                    query: getVenueName,
                    variables: { id: venueId }
                }) as { data: { getVenue: { id: string; name: string; fee: number | null } | null } };
                
                const venue = result.data.getVenue;
                if (venue) {
                    setVenueName(venue.name);
                    setVenueFee(venue.fee || null);
                    if (venue.fee !== null && venue.fee !== undefined) {
                        updateField('venueFee', venue.fee);
                    }
                }
            } catch (error) {
                console.error('Error loading venue:', error);
            } finally {
                setLoadingVenue(false);
            }
        };
        
        loadVenueName();
    }, [venueId]);
    
    // Load entities
    useEffect(() => {
        const loadEntities = async () => {
            try {
                const result = await getClient().graphql({
                    query: listEntitiesForDropdown,
                    variables: { limit: 100 }
                }) as { data: { listEntities: { items: any[] } } };
                
                const items = result.data.listEntities?.items || [];
                setEntities(items.filter((item: any) => item && !item._deleted));
            } catch (error) {
                console.error('Error loading entities:', error);
            }
        };
        
        loadEntities();
    }, []);
    
    // Load venues when entity changes
    useEffect(() => {
        const loadVenues = async () => {
            try {
                const filter = selectedEntityId ? {
                    entityId: { eq: selectedEntityId }
                } : undefined;
                
                const result = await getClient().graphql({
                    query: listVenuesForDropdown,
                    variables: { 
                        filter,
                        limit: 100 
                    }
                }) as { data: { listVenues: { items: any[] } } };
                
                const items = result.data.listVenues?.items || [];
                setVenues(items.filter((item: any) => item && !item._deleted));
            } catch (error) {
                console.error('Error loading venues:', error);
            }
        };
        
        if (selectedEntityId || entities.length > 0) {
            loadVenues();
        }
    }, [selectedEntityId, entities.length]);
    
    // Load series and titles
    useEffect(() => {
        const loadSeriesData = async () => {
            try {
                const seriesResult = await getClient().graphql({
                    query: listSeriesForDropdown,
                    variables: { limit: 100 }
                }) as { data: { listTournamentSeries: { items: any[] } } };
                
                const seriesItems = seriesResult.data.listTournamentSeries?.items || [];
                setSeries(seriesItems.filter((item: any) => item && !item._deleted));
                
                const titlesResult = await getClient().graphql({
                    query: listSeriesTitlesForDropdown,
                    variables: { limit: 100 }
                }) as { data: { listTournamentSeriesTitles: { items: any[] } } };
                
                const titleItems = titlesResult.data.listTournamentSeriesTitles?.items || [];
                setSeriesTitles(titleItems.filter((item: any) => item && !item._deleted));
            } catch (error) {
                console.error('Error loading series data:', error);
            }
        };
        
        loadSeriesData();
    }, []);
    
    // Auto-save in auto mode
    useEffect(() => {
        if (autoMode && skipConfirmation && isOpen) {
            handleConfirm();
        }
    }, [autoMode, skipConfirmation, isOpen]);
    
    // Auto-apply detected pattern suggestions
    const handleApplyDetectedPattern = useCallback(() => {
        if (!consolidationPreview?.detectedPattern) return;
        
        const { parsedDayNumber, parsedFlightLetter, isFinalDay } = 
            consolidationPreview.detectedPattern;
        
        const updates: Partial<GameData> = {};
        
        if (parsedDayNumber && !editedData.dayNumber) {
            updates.dayNumber = parsedDayNumber;
        }
        if (parsedFlightLetter && !editedData.flightLetter) {
            updates.flightLetter = parsedFlightLetter;
        }
        if (isFinalDay && !editedData.finalDay) {
            updates.finalDay = true;
        }
        
        if (Object.keys(updates).length > 0) {
            updateMultipleFields(updates);
        }
    }, [consolidationPreview, editedData, updateMultipleFields]);
    
    // Creation handlers for Entity and Venue
    const handleCreateEntity = async () => {
        try {
            setIsCreating(true);
            setCreateError('');
            
            if (!newEntityName.trim() || !newEntityDomain.trim()) {
                setCreateError('Entity name and domain are required');
                return;
            }
            
            const input = {
                entityName: newEntityName.trim(),
                gameUrlDomain: newEntityDomain.trim(),
                gameUrlPath: '/game',
                isActive: true
            };
            
            const result = await getClient().graphql({
                query: createEntityMutation,
                variables: { input }
            }) as { data: { createEntity: EntityConfig } };
            
            const newEntity = result.data.createEntity;
            if (newEntity) {
                setEntities(prev => [...prev, newEntity as EntityConfig]);
                setSelectedEntityId(newEntity.id);
                setNewEntityName('');
                setNewEntityDomain('');
                setShowCreateCard(false);
            }
        } catch (error: any) {
            setCreateError(error.message || 'Failed to create entity');
        } finally {
            setIsCreating(false);
        }
    };
    
    const handleCreateVenue = async () => {
        try {
            setIsCreating(true);
            setCreateError('');
            
            if (!newVenueName.trim()) {
                setCreateError('Venue name is required');
                return;
            }
            
            const input = {
                name: newVenueName.trim(),
                venueNumber: generateVenueNumber(),
                entityId: selectedEntityId || null,
                fee: newVenueFee
            };
            
            const result = await getClient().graphql({
                query: createVenueMutation,
                variables: { input }
            }) as { data: { createVenue: VenueOption } };
            
            const newVenue = result.data.createVenue;
            if (newVenue) {
                setVenues(prev => [...prev, newVenue as VenueOption]);
                setSelectedVenueId(newVenue.id);
                updateField('venueId', newVenue.id);
                setVenueName(newVenue.name);
                setVenueFee(newVenue.fee || null);
                setNewVenueName('');
                setNewVenueFee(null);
                setShowCreateCard(false);
            }
        } catch (error: any) {
            setCreateError(error.message || 'Failed to create venue');
        } finally {
            setIsCreating(false);
        }
    };
    
    // Callbacks for SeriesDetailsEditor (enhanced version)
    const handleSeriesTitleCreated = useCallback((newTitle: TournamentSeriesTitle) => {
        setSeriesTitles(prev => [...prev, newTitle]);
        setSelectedSeriesTitleId(newTitle.id);
    }, []);
    
    const handleSeriesInstanceCreated = useCallback((newInstance: TournamentSeries) => {
        setSeries(prev => [...prev, newInstance]);
        setSelectedSeriesId(newInstance.id);
    }, []);
    
    const handleConfirm = async () => {
        setIsSaving(true);
        try {
            // Build the save data with all series information
            const saveData: GameData = {
                ...editedData,
                // Series fields
                tournamentSeriesId: selectedSeriesId || editedData.tournamentSeriesId || null,
                seriesTitleId: selectedSeriesTitleId || editedData.seriesTitleId || null,
                seriesName: editedData.seriesName || null,
                // Entity/venue fields
                entityId: selectedEntityId || editedData.entityId,
                venueId: selectedVenueId || editedData.venueId
            };
            
            onConfirm(saveData);
            
            if (!autoMode) {
                onClose();
            }
        } catch (error) {
            console.error('Error saving:', error);
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleQuickFix = () => {
        const fixes: Partial<GameData> = {};
        
        if (!editedData.name) fixes.name = 'Tournament ' + new Date().getTime();
        if (!editedData.gameStatus) fixes.gameStatus = 'SCHEDULED' as any;
        if (!editedData.registrationStatus) fixes.registrationStatus = 'OPEN' as any;
        if (!editedData.tournamentId) fixes.tournamentId = Math.floor(Math.random() * 1000000);
        
        if (editedData.guaranteeAmount && editedData.guaranteeAmount > 0) {
            fixes.hasGuarantee = true;
        }
        
        updateMultipleFields(fixes);
    };
    
    // Filter series by selected venue
    const filteredSeries = useMemo(() => {
        if (!selectedVenueId) return series;
        return series.filter(s => s.venueId === selectedVenueId);
    }, [series, selectedVenueId]);
    
    // Render tab content
    const renderTabContent = () => {
        switch(activeTab) {
            case 'quick':
                return (
                    <div className="p-4">
                        {/* Venue Fee - editable */}
                        <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded">
                            <div className="text-sm flex items-center justify-between">
                                <div className="flex items-center">
                                    <span className="font-medium">Venue Fee:</span>
                                    {isEditingVenueFee ? (
                                        <span className="ml-2 inline-flex items-center gap-1">
                                            <span>$</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                min="0"
                                                autoFocus
                                                value={tempVenueFee}
                                                onChange={(e) => setTempVenueFee(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                        const newFee = tempVenueFee === '' ? null : parseFloat(tempVenueFee);
                                                        updateField('venueFee', newFee);
                                                        setVenueFee(newFee);
                                                        setIsEditingVenueFee(false);
                                                    } else if (e.key === 'Escape') {
                                                        setIsEditingVenueFee(false);
                                                    }
                                                }}
                                                className="w-24 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                            />
                                            <button
                                                onClick={() => {
                                                    const newFee = tempVenueFee === '' ? null : parseFloat(tempVenueFee);
                                                    updateField('venueFee', newFee);
                                                    setVenueFee(newFee);
                                                    setIsEditingVenueFee(false);
                                                }}
                                                className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                                            >
                                                Save
                                            </button>
                                            <button
                                                onClick={() => setIsEditingVenueFee(false)}
                                                className="px-2 py-1 text-xs bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                            >
                                                Cancel
                                            </button>
                                        </span>
                                    ) : (
                                        <span className="ml-2 text-green-600 font-medium">
                                            {formatCurrency(editedData.venueFee ?? venueFee ?? 0)}
                                        </span>
                                    )}
                                </div>
                                {!isEditingVenueFee && (
                                    <button
                                        onClick={() => {
                                            const currentFee = editedData.venueFee ?? venueFee ?? 0;
                                            setTempVenueFee(currentFee.toString());
                                            setIsEditingVenueFee(true);
                                        }}
                                        className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                                    >
                                        Edit
                                    </button>
                                )}
                            </div>
                        </div>
                        
                        {/* Show compact consolidation preview in quick tab */}
                        {willConsolidate && consolidationInfo.parentName && (
                            <div className="mb-3 p-2 bg-purple-50 border border-purple-200 rounded">
                                <div className="text-sm flex items-center gap-2">
                                    <span>📦</span>
                                    <span>
                                        Will group under: <strong>{consolidationInfo.parentName}</strong>
                                    </span>
                                    <button
                                        onClick={() => setActiveTab('grouping')}
                                        className="text-xs text-purple-600 hover:text-purple-700 underline ml-auto"
                                    >
                                        View Details
                                    </button>
                                </div>
                            </div>
                        )}
                        
                        <QuickDataEditor 
                            editor={editor} 
                            showAdvanced={showAdvanced} 
                        />
                    </div>
                );
                
            case 'relationships':
                return (
                    <div className="p-4 space-y-4">
                        {/* Entity Selection */}
                        <div className="border rounded-lg p-4">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-semibold text-sm">🏢 Entity</h3>
                                <button
                                    onClick={() => {
                                        setActiveEntityCard('entity');
                                        setShowCreateCard(!showCreateCard || activeEntityCard !== 'entity');
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-700"
                                >
                                    + Create New
                                </button>
                            </div>
                            
                            <select
                                value={selectedEntityId}
                                onChange={(e) => {
                                    setSelectedEntityId(e.target.value);
                                    updateField('entityId', e.target.value);
                                }}
                                className="w-full px-2 py-1.5 text-sm border rounded"
                            >
                                <option value="">-- Select Entity --</option>
                                {entities.map(entity => (
                                    <option key={entity.id} value={entity.id}>
                                        {entity.entityName} ({entity.gameUrlDomain})
                                    </option>
                                ))}
                            </select>
                            
                            {activeEntityCard === 'entity' && showCreateCard && (
                                <div className="mt-3 border rounded-lg p-3 bg-blue-50">
                                    <h4 className="font-semibold text-sm mb-2">Create New Entity</h4>
                                    <input
                                        type="text"
                                        value={newEntityName}
                                        onChange={(e) => setNewEntityName(e.target.value)}
                                        placeholder="Entity Name"
                                        className="w-full px-2 py-1.5 text-sm border rounded mb-2"
                                    />
                                    <input
                                        type="text"
                                        value={newEntityDomain}
                                        onChange={(e) => setNewEntityDomain(e.target.value)}
                                        placeholder="Domain (e.g., example.com)"
                                        className="w-full px-2 py-1.5 text-sm border rounded mb-2"
                                    />
                                    {createError && (
                                        <div className="text-red-600 text-xs mb-2">{createError}</div>
                                    )}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleCreateEntity}
                                            disabled={isCreating}
                                            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                                        >
                                            {isCreating ? 'Creating...' : 'Create'}
                                        </button>
                                        <button
                                            onClick={() => setShowCreateCard(false)}
                                            className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                        
                        {/* Venue Selection */}
                        <div className="border rounded-lg p-4">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-semibold text-sm">📍 Venue</h3>
                                <button
                                    onClick={() => {
                                        setActiveEntityCard('venue');
                                        setShowCreateCard(!showCreateCard || activeEntityCard !== 'venue');
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-700"
                                    disabled={!selectedEntityId}
                                >
                                    + Create New
                                </button>
                            </div>
                            
                            <select
                                value={selectedVenueId}
                                onChange={(e) => {
                                    const venueIdVal = e.target.value;
                                    setSelectedVenueId(venueIdVal);
                                    updateField('venueId', venueIdVal);
                                    
                                    const selectedVenue = venues.find(v => v.id === venueIdVal);
                                    if (selectedVenue) {
                                        setVenueName(selectedVenue.name);
                                        setVenueFee(selectedVenue.fee || null);
                                    }
                                }}
                                className="w-full px-2 py-1.5 text-sm border rounded"
                                disabled={!selectedEntityId}
                            >
                                <option value="">-- Select Venue --</option>
                                {venues.map(venue => (
                                    <option key={venue.id} value={venue.id}>
                                        {venue.name} {venue.fee ? `($${venue.fee})` : ''}
                                    </option>
                                ))}
                            </select>
                            
                            {activeEntityCard === 'venue' && showCreateCard && (
                                <div className="mt-3 border rounded-lg p-3 bg-blue-50">
                                    <h4 className="font-semibold text-sm mb-2">Create New Venue</h4>
                                    <input
                                        type="text"
                                        value={newVenueName}
                                        onChange={(e) => setNewVenueName(e.target.value)}
                                        placeholder="Venue Name"
                                        className="w-full px-2 py-1.5 text-sm border rounded mb-2"
                                    />
                                    <div className="mb-2">
                                        <label className="text-xs font-medium text-gray-700 mb-1 block">
                                            Venue Fee (Optional)
                                        </label>
                                        <input
                                            type="number"
                                            value={newVenueFee || ''}
                                            onChange={(e) => setNewVenueFee(e.target.value ? parseFloat(e.target.value) : null)}
                                            placeholder="0.00"
                                            step="0.01"
                                            className="w-full px-2 py-1.5 text-sm border rounded"
                                        />
                                    </div>
                                    {createError && (
                                        <div className="text-red-600 text-xs mb-2">{createError}</div>
                                    )}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleCreateVenue}
                                            disabled={isCreating}
                                            className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
                                        >
                                            {isCreating ? 'Creating...' : 'Create'}
                                        </button>
                                        <button
                                            onClick={() => {
                                                setShowCreateCard(false);
                                                setNewVenueFee(null);
                                            }}
                                            className="px-3 py-1 text-sm bg-gray-200 rounded hover:bg-gray-300"
                                        >
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                            
                            {venueFee !== null && venueFee !== undefined && (
                                <div className="mt-2 text-xs text-gray-600">
                                    Selected venue has a fee of {formatCurrency(venueFee)}
                                </div>
                            )}
                        </div>
                        
                        {/* Series Management - Delegated to Enhanced SeriesDetailsEditor */}
                        <div className="border rounded-lg p-4">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-semibold text-sm">🎯 Tournament Series</h3>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="checkbox"
                                        id="isSeries"
                                        checked={editedData.isSeries || false}
                                        onChange={(e) => updateField('isSeries', e.target.checked)}
                                        className="h-4 w-4"
                                    />
                                    <label htmlFor="isSeries" className="text-xs text-gray-700">
                                        Is Series Event
                                    </label>
                                </div>
                            </div>
                            
                            {/* Enhanced SeriesDetailsEditor handles all series management */}
                            <SeriesDetailsEditor 
                                editor={editor} 
                                series={filteredSeries}
                                seriesTitles={seriesTitles}
                                venueId={selectedVenueId}
                                onSeriesChange={(seriesId: string | null) => setSelectedSeriesId(seriesId || '')}
                                onSeriesTitleChange={(titleId: string | null) => setSelectedSeriesTitleId(titleId || '')}
                                onSeriesTitleCreated={handleSeriesTitleCreated}
                                onSeriesInstanceCreated={handleSeriesInstanceCreated}
                            />
                        </div>
                    </div>
                );
            
            case 'grouping':
                return (
                    <div className="p-4 space-y-4">
                        <div className="text-sm text-gray-600 mb-4">
                            <p>
                                This preview shows how your tournament will be grouped with
                                related flights when saved. Multi-day tournaments are
                                automatically consolidated under a parent record.
                            </p>
                        </div>
                        
                        {/* Main Consolidation Preview Component */}
                        <ConsolidationPreview
                            gameData={editedData}
                            showSiblingDetails={true}
                            onConsolidationChange={(willConsolidateVal: boolean, parentName: string | null) => {
                                setConsolidationInfo({ 
                                    willConsolidate: willConsolidateVal, 
                                    parentName 
                                });
                            }}
                        />
                        
                        {/* Auto-apply detected patterns button */}
                        {consolidationPreview?.detectedPattern?.isMultiDay && 
                         consolidationPreview.detectedPattern.detectionSource === 'namePattern' && (
                            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm font-medium text-blue-900">
                                            💡 Auto-detected Pattern
                                        </div>
                                        <div className="text-xs text-blue-700 mt-1">
                                            We detected day/flight info from the name. 
                                            Apply it to the fields for better accuracy?
                                        </div>
                                    </div>
                                    <button
                                        onClick={handleApplyDetectedPattern}
                                        className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                                    >
                                        Apply
                                    </button>
                                </div>
                            </div>
                        )}
                        
                        {/* Tips Section */}
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <h4 className="text-sm font-medium text-gray-700 mb-2">
                                💡 Tips for Better Grouping
                            </h4>
                            <ul className="text-xs text-gray-600 space-y-1 list-disc list-inside">
                                <li>
                                    Set <strong>Tournament Series</strong> and <strong>Event Number</strong> for 
                                    most reliable grouping
                                </li>
                                <li>
                                    Set <strong>Day Number</strong> (1, 2, 3) and <strong>Flight Letter</strong> (A, B, C) 
                                    to identify specific flights
                                </li>
                                <li>
                                    Mark the final day with the <strong>Final Day</strong> checkbox to ensure 
                                    results are synced correctly
                                </li>
                                <li>
                                    Games with the same buy-in at the same venue with similar names will be 
                                    grouped automatically
                                </li>
                            </ul>
                        </div>
                        
                        {/* Quick Series Fields Editor */}
                        {willConsolidate && (
                            <div className="border rounded-lg p-4">
                                <h4 className="text-sm font-medium text-gray-700 mb-3">
                                    📋 Quick Series Fields
                                </h4>
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="text-xs font-medium text-gray-700">Event Number</label>
                                        <input
                                            type="number"
                                            value={editedData.eventNumber || ''}
                                            onChange={(e) => updateField('eventNumber', e.target.value ? parseInt(e.target.value) : null)}
                                            placeholder="e.g., 8"
                                            className="w-full px-2 py-1 text-sm border rounded mt-1"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-gray-700">Day Number</label>
                                        <input
                                            type="number"
                                            value={editedData.dayNumber || ''}
                                            onChange={(e) => updateField('dayNumber', e.target.value ? parseInt(e.target.value) : null)}
                                            placeholder="e.g., 1, 2"
                                            className="w-full px-2 py-1 text-sm border rounded mt-1"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs font-medium text-gray-700">Flight Letter</label>
                                        <select
                                            value={editedData.flightLetter || ''}
                                            onChange={(e) => updateField('flightLetter', e.target.value || null)}
                                            className="w-full px-2 py-1 text-sm border rounded mt-1"
                                        >
                                            <option value="">-- None --</option>
                                            {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(letter => (
                                                <option key={letter} value={letter}>{letter}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="flex items-center gap-2 pt-5">
                                        <input
                                            type="checkbox"
                                            id="finalDayGrouping"
                                            checked={editedData.finalDay || false}
                                            onChange={(e) => updateField('finalDay', e.target.checked)}
                                            className="h-4 w-4"
                                        />
                                        <label htmlFor="finalDayGrouping" className="text-sm">
                                            🏁 Final Day
                                        </label>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                );
                
            case 'advanced':
                return (
                    <div className="p-4">
                        <QuickDataEditor 
                            editor={editor} 
                            showAdvanced={true} 
                        />
                    </div>
                );
                
            case 'validation':
                return (
                    <div className="p-4">
                        {/* Critical Issues */}
                        {validationStatus.criticalMissing.length > 0 && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                <div className="flex items-center justify-between mb-2">
                                    <h4 className="font-semibold text-red-800">
                                        ⚠ Critical Issues ({validationStatus.criticalMissing.length})
                                    </h4>
                                    <button
                                        onClick={handleQuickFix}
                                        className="text-xs px-2 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200"
                                    >
                                        Auto-Fix
                                    </button>
                                </div>
                                <ul className="text-sm text-red-700 list-disc list-inside">
                                    {validationStatus.criticalMissing.map((field: string) => (
                                        <li key={field}>{field} is required</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        
                        {/* Warnings */}
                        {validationStatus.warnings.length > 0 && (
                            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                <h4 className="font-semibold text-yellow-800 mb-2">
                                    ⚠ Warnings ({validationStatus.warnings.length})
                                </h4>
                                <ul className="text-sm text-yellow-700 list-disc list-inside">
                                    {validationStatus.warnings.map((warning, idx) => (
                                        <li key={idx}><strong>{warning.field}:</strong> {warning.message}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        
                        {/* Validation Status */}
                        <div className="p-3 bg-gray-50 rounded-lg">
                            <h4 className="font-semibold text-gray-800 mb-3">Field Status</h4>
                            <div className="grid grid-cols-2 gap-4">
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
                                
                                {changedFields.map((field: keyof GameData) => {
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
        <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center p-4 pb-8">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[85vh] sm:max-h-[90vh] flex flex-col">
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
                        {/* Validation badge */}
                        {validationStatus.isValid ? (
                            <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-medium">
                                ✓ Valid
                            </span>
                        ) : (
                            <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-medium">
                                ⚠ {validationStatus.criticalMissing.length} Issues
                            </span>
                        )}
                        
                        {/* Changes badge */}
                        {hasChanges && (
                            <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                                {getChangedFields().length} Changes
                            </span>
                        )}
                        
                        {/* Consolidation badge */}
                        {consolidationLoading ? (
                            <span className="px-2 py-1 bg-gray-100 text-gray-500 rounded text-xs font-medium">
                                <span className="animate-pulse">Checking...</span>
                            </span>
                        ) : willConsolidate && consolidationInfo.parentName && (
                            <span 
                                className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs font-medium cursor-pointer hover:bg-purple-200"
                                onClick={() => setActiveTab('grouping')}
                                title="Click to view grouping details"
                            >
                                📦 Groups: {consolidationInfo.parentName.length > 20 
                                    ? consolidationInfo.parentName.substring(0, 20) + '...' 
                                    : consolidationInfo.parentName}
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
                            {/* Indicator dot on grouping tab when consolidation active */}
                            {tab.id === 'grouping' && willConsolidate && (
                                <span className="ml-1 w-2 h-2 bg-purple-500 rounded-full inline-block" />
                            )}
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

export default SaveConfirmationModal;