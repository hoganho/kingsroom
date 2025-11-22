// src/components/scraper/SaveConfirmationModal.tsx (Enhanced Version with Venue Fee and Series Category Support)

import { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { GameData, EntityConfig } from '../../types/game';
import type { TournamentSeries, TournamentSeriesTitle } from '../../types/series';
import type { ScrapedGameData, SeriesStatus, SeriesCategory, HolidayType } from '../../API';
import { useGameDataEditor } from '../../hooks/useGameDataEditor';
import { QuickDataEditor } from './SaveConfirmation/QuickDataEditor';
import { SeriesDetailsEditor } from './SaveConfirmation/SeriesDetailsEditor';

// GraphQL Queries
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

const createSeriesTitleMutation = /* GraphQL */ `
    mutation CreateTournamentSeriesTitle($input: CreateTournamentSeriesTitleInput!) {
        createTournamentSeriesTitle(input: $input) {
            id
            title
            aliases
            seriesCategory
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
            seriesCategory
            holidayType
            quarter
            month
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
    fee?: number | null;
}

// Utility Functions for Series Enhancement
const detectSeriesCategory = (seriesName: string): SeriesCategory => {
    const name = seriesName.toLowerCase();
    
    if (name.includes('christmas') || name.includes('easter') || 
        name.includes('anzac') || name.includes('holiday')) {
        return 'SPECIAL' as SeriesCategory;
    }
    if (name.includes('championship') || name.includes('champs')) {
        return 'CHAMPIONSHIP' as SeriesCategory;
    }
    if (name.includes('promo') || name.includes('special offer')) {
        return 'PROMOTIONAL' as SeriesCategory;
    }
    if (name.includes('summer') || name.includes('winter') || 
        name.includes('spring') || name.includes('autumn')) {
        return 'SEASONAL' as SeriesCategory;
    }
    return 'REGULAR' as SeriesCategory;
};

const detectHolidayType = (date: string, name: string): HolidayType | null => {
    const gameDate = new Date(date);
    const month = gameDate.getMonth() + 1;
    const day = gameDate.getDate();
    const nameLower = name.toLowerCase();
    
    // Christmas period (Dec 20-31)
    if (month === 12 && day >= 20) return 'CHRISTMAS' as HolidayType;
    
    // Boxing Day period (Dec 26 - Jan 2)
    if ((month === 12 && day >= 26) || (month === 1 && day <= 2)) {
        return 'BOXING_DAY' as HolidayType;
    }
    
    // New Year period (Dec 31 - Jan 7)
    if ((month === 12 && day === 31) || (month === 1 && day <= 7)) {
        return 'NEW_YEAR' as HolidayType;
    }
    
    // Australia Day (around Jan 26)
    if (month === 1 && day >= 24 && day <= 28) {
        return 'AUSTRALIA_DAY' as HolidayType;
    }
    
    // Easter (would need more complex logic)
    if (nameLower.includes('easter')) return 'EASTER' as HolidayType;
    
    // ANZAC Day (April 25)
    if (month === 4 && day >= 23 && day <= 27) {
        return 'ANZAC_DAY' as HolidayType;
    }
    
    // Queen's Birthday (June - second Monday)
    if (month === 6 && nameLower.includes('queen')) {
        return 'QUEENS_BIRTHDAY' as HolidayType;
    }
    
    return 'OTHER' as HolidayType;
};

const getQuarterFromDate = (date: string): number => {
    const month = new Date(date).getMonth() + 1;
    return Math.ceil(month / 3);
};

const getMonthFromDate = (date: string): number => {
    return new Date(date).getMonth() + 1;
};

const tabs: ModalTab[] = [
    { id: 'quick', label: 'Quick Edit', icon: '⚡' },
    { id: 'relationships', label: 'Entity/Venue/Series', icon: '🔗' },
    { id: 'advanced', label: 'Advanced', icon: '⚙️' },
    { id: 'validation', label: 'Validation', icon: '✓' },
    { id: 'diff', label: 'Changes', icon: '📝' }
];

/**
 * Enhanced SaveConfirmationModal with inline editing, venue fee support, and series category enhancement
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
    const [venueFee, setVenueFee] = useState<number | null>(null);
    const [loadingVenue, setLoadingVenue] = useState(false);
    const [activeTab, setActiveTab] = useState<string>('quick');
    const [showAdvanced, setShowAdvanced] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    
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
    
    // Creation state
    const [activeEntityCard, setActiveEntityCard] = useState<'entity' | 'venue' | 'series' | null>(null);
    const [showCreateCard, setShowCreateCard] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState('');
    
    // New entity/venue/series creation state
    const [newEntityName, setNewEntityName] = useState('');
    const [newEntityDomain, setNewEntityDomain] = useState('');
    const [newVenueName, setNewVenueName] = useState('');
    const [newVenueFee, setNewVenueFee] = useState<number | null>(null);
    const [newSeriesName, setNewSeriesName] = useState('');
    const [newSeriesYear, setNewSeriesYear] = useState(new Date().getFullYear());
    const [newSeriesStatus, setNewSeriesStatus] = useState<string>('SCHEDULED');
    const [newSeriesTitleName, setNewSeriesTitleName] = useState('');
    
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
                const result = await client.graphql({
                    query: getVenueName,
                    variables: { id: venueId }
                }) as { data: { getVenue: { id: string; name: string; fee: number | null } | null } };
                
                const venue = result.data.getVenue;
                if (venue) {
                    setVenueName(venue.name);
                    setVenueFee(venue.fee || null);
                }
            } catch (error) {
                console.error('Error loading venue:', error);
            } finally {
                setLoadingVenue(false);
            }
        };
        
        loadVenueName();
    }, [venueId, client]);
    
    // Load entities
    useEffect(() => {
        const loadEntities = async () => {
            try {
                const result = await client.graphql({
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
    }, [client]);
    
    // Load venues when entity changes
    useEffect(() => {
        const loadVenues = async () => {
            try {
                const filter = selectedEntityId ? {
                    entityId: { eq: selectedEntityId }
                } : undefined;
                
                const result = await client.graphql({
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
        
        if (selectedEntityId) {
            loadVenues();
        }
    }, [selectedEntityId, client]);
    
    // Load series and titles
    useEffect(() => {
        const loadSeriesData = async () => {
            try {
                // Load series
                const seriesResult = await client.graphql({
                    query: listSeriesForDropdown,
                    variables: { limit: 100 }
                }) as { data: { listTournamentSeries: { items: any[] } } };
                
                const seriesItems = seriesResult.data.listTournamentSeries?.items || [];
                setSeries(seriesItems.filter((item: any) => item && !item._deleted));
                
                // Load series titles
                const titlesResult = await client.graphql({
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
    }, [client]);
    
    // Auto-save in auto mode
    useEffect(() => {
        if (autoMode && skipConfirmation && isOpen) {
            handleConfirm();
        }
    }, [autoMode, skipConfirmation, isOpen]);
    
    // Creation handlers
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
            
            const result = await client.graphql({
                query: createEntityMutation,
                variables: { input }
            }) as { data: { createEntity: EntityConfig } };
            
            const newEntity = result.data.createEntity;
            if (newEntity) {
                // Add to entities list
                setEntities(prev => [...prev, newEntity as EntityConfig]);
                // Select the new entity
                setSelectedEntityId(newEntity.id);
                // Reset form
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
            
            const result = await client.graphql({
                query: createVenueMutation,
                variables: { input }
            }) as { data: { createVenue: VenueOption } };
            
            const newVenue = result.data.createVenue;
            if (newVenue) {
                // Add to venues list
                setVenues(prev => [...prev, newVenue as VenueOption]);
                // Select the new venue
                setSelectedVenueId(newVenue.id);
                updateField('venueId', newVenue.id);
                setVenueName(newVenue.name);
                setVenueFee(newVenue.fee || null);
                // Reset form
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
    
    const handleCreateSeriesTitle = async () => {
        try {
            setIsCreating(true);
            setCreateError('');
            
            if (!newSeriesTitleName.trim()) {
                setCreateError('Series title is required');
                return;
            }
            
            // Auto-detect category
            const detectedCategory = detectSeriesCategory(newSeriesTitleName);
            
            const input = {
                title: newSeriesTitleName.trim(),
                aliases: [newSeriesTitleName.trim()],
                seriesCategory: detectedCategory
            };
            
            const result = await client.graphql({
                query: createSeriesTitleMutation,
                variables: { input }
            }) as { data: { createTournamentSeriesTitle: TournamentSeriesTitle } };
            
            const newTitle = result.data.createTournamentSeriesTitle;
            if (newTitle) {
                // Add to titles list
                setSeriesTitles(prev => [...prev, newTitle as TournamentSeriesTitle]);
                // Select the new title
                setSelectedSeriesTitleId(newTitle.id);
                // Reset form
                setNewSeriesTitleName('');
                setShowCreateCard(false);
            }
        } catch (error: any) {
            setCreateError(error.message || 'Failed to create series title');
        } finally {
            setIsCreating(false);
        }
    };
    
    const handleCreateSeries = async () => {
        try {
            setIsCreating(true);
            setCreateError('');
            
            if (!newSeriesName.trim() || !newSeriesYear) {
                setCreateError('Series name and year are required');
                return;
            }
            
            // Get game date for calculations
            const gameDate = editedData.gameStartDateTime || new Date().toISOString();
            
            // Find selected title for category
            const selectedTitle = seriesTitles.find(t => t.id === selectedSeriesTitleId);
            const category = selectedTitle?.seriesCategory || 'REGULAR' as SeriesCategory;
            
            // Calculate holiday type if SPECIAL category
            const holidayType = category === 'SPECIAL'
                ? detectHolidayType(gameDate, newSeriesName)
                : null;
            
            const input = {
                name: newSeriesName.trim(),
                year: newSeriesYear,
                status: newSeriesStatus as SeriesStatus,
                venueId: selectedVenueId || null,
                tournamentSeriesTitleId: selectedSeriesTitleId || null,
                seriesCategory: category,
                holidayType: holidayType,
                quarter: getQuarterFromDate(gameDate),
                month: getMonthFromDate(gameDate),
                startDate: gameDate,
                endDate: null
            };
            
            const result = await client.graphql({
                query: createSeriesMutation,
                variables: { input }
            }) as { data: { createTournamentSeries: TournamentSeries } };
            
            const newSeries = result.data.createTournamentSeries;
            if (newSeries) {
                // Add to series list
                setSeries(prev => [...prev, newSeries as TournamentSeries]);
                // Select the new series
                setSelectedSeriesId(newSeries.id);
                updateField('tournamentSeriesId', newSeries.id);
                updateField('seriesName', newSeries.name);
                // Reset form
                setNewSeriesName('');
                setNewSeriesYear(new Date().getFullYear());
                setNewSeriesStatus('SCHEDULED');
                setShowCreateCard(false);
            }
        } catch (error: any) {
            setCreateError(error.message || 'Failed to create series');
        } finally {
            setIsCreating(false);
        }
    };
    
    const handleConfirm = async () => {
        setIsSaving(true);
        try {
            // Include all edited data with series fields
            const saveData = {
                ...editedData,
                tournamentSeriesId: selectedSeriesId || editedData.tournamentSeriesId,
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
        
        // Apply critical fixes
        if (!editedData.name) fixes.name = 'Tournament ' + new Date().getTime();
        if (!editedData.gameStatus) fixes.gameStatus = 'SCHEDULED' as any;
        if (!editedData.registrationStatus) fixes.registrationStatus = 'OPEN' as any;
        if (!editedData.tournamentId) fixes.tournamentId = Math.floor(Math.random() * 1000000);
        
        // Apply logical fixes
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
                        {/* Venue fee display */}
                        {venueFee && (
                            <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded">
                                <div className="text-sm">
                                    <span className="font-medium">Venue Fee:</span>
                                    <span className="ml-2 text-blue-700">${venueFee.toFixed(2)}</span>
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
                                    const venueId = e.target.value;
                                    setSelectedVenueId(venueId);
                                    updateField('venueId', venueId);
                                    
                                    // Update venue name and fee
                                    const selectedVenue = venues.find(v => v.id === venueId);
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
                            
                            {/* Display selected venue fee */}
                            {venueFee && (
                                <div className="mt-2 text-xs text-gray-600">
                                    Selected venue has a fee of ${venueFee.toFixed(2)}
                                </div>
                            )}
                        </div>
                        
                        {/* Series Management */}
                        <div className="border rounded-lg p-4">
                            <div className="flex justify-between items-center mb-3">
                                <h3 className="font-semibold text-sm">🎯 Tournament Series</h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => {
                                            setActiveEntityCard('series');
                                            setShowCreateCard(!showCreateCard || activeEntityCard !== 'series');
                                        }}
                                        className="text-xs text-blue-600 hover:text-blue-700"
                                    >
                                        + Create Series
                                    </button>
                                </div>
                            </div>
                            
                            {/* Series Title Selection */}
                            <div className="mb-3">
                                <label className="text-xs font-medium text-gray-700">Series Template</label>
                                <select
                                    value={selectedSeriesTitleId}
                                    onChange={(e) => setSelectedSeriesTitleId(e.target.value)}
                                    className="w-full px-2 py-1.5 text-sm border rounded mt-1"
                                >
                                    <option value="">-- Select Template --</option>
                                    {seriesTitles.map(title => (
                                        <option key={title.id} value={title.id}>
                                            {title.title} {title.seriesCategory && `[${title.seriesCategory}]`}
                                        </option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => {
                                        const titleName = prompt('Enter new series title:');
                                        if (titleName) {
                                            setNewSeriesTitleName(titleName);
                                            handleCreateSeriesTitle();
                                        }
                                    }}
                                    className="text-xs text-blue-600 hover:text-blue-700 mt-1"
                                >
                                    + Create New Template
                                </button>
                            </div>
                            
                            {/* Series Instance Selection */}
                            <div>
                                <label className="text-xs font-medium text-gray-700">Series Instance</label>
                                <select
                                    value={selectedSeriesId}
                                    onChange={(e) => {
                                        const seriesId = e.target.value;
                                        setSelectedSeriesId(seriesId);
                                        updateField('tournamentSeriesId', seriesId || null);
                                        
                                        // Update series name
                                        const selectedSeries = series.find(s => s.id === seriesId);
                                        if (selectedSeries) {
                                            updateField('seriesName', selectedSeries.name);
                                        }
                                    }}
                                    className="w-full px-2 py-1.5 text-sm border rounded mt-1"
                                >
                                    <option value="">-- No Series --</option>
                                    {filteredSeries.map(s => (
                                        <option key={s.id} value={s.id}>
                                            {s.name} ({s.year}) - {s.status}
                                            {s.seriesCategory && ` [${s.seriesCategory}]`}
                                            {s.seriesCategory === 'SPECIAL' && s.holidayType && ` - ${s.holidayType.replace(/_/g, ' ')}`}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            
                            {/* Display selected series info */}
                            {selectedSeriesId && (() => {
                                const selectedSeries = series.find(s => s.id === selectedSeriesId);
                                return selectedSeries ? (
                                    <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="font-medium">Category:</span>
                                            <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                                                {selectedSeries.seriesCategory || 'REGULAR'}
                                            </span>
                                            {selectedSeries.seriesCategory === 'SPECIAL' && selectedSeries.holidayType && (
                                                <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded">
                                                    {selectedSeries.holidayType.replace(/_/g, ' ')}
                                                </span>
                                            )}
                                        </div>
                                        {selectedSeries.quarter && (
                                            <div><span className="font-medium">Quarter:</span> Q{selectedSeries.quarter}</div>
                                        )}
                                        {selectedSeries.month && (
                                            <div><span className="font-medium">Month:</span> {selectedSeries.month}</div>
                                        )}
                                    </div>
                                ) : null;
                            })()}
                            
                            {activeEntityCard === 'series' && showCreateCard && (
                                <div className="mt-3 border rounded-lg p-3 bg-blue-50">
                                    <h4 className="font-semibold text-sm mb-2">Create New Series Instance</h4>
                                    {!selectedSeriesTitleId && (
                                        <div className="text-yellow-600 text-xs mb-2">
                                            ⚠ Select a series template first
                                        </div>
                                    )}
                                    <input
                                        type="text"
                                        value={newSeriesName}
                                        onChange={(e) => setNewSeriesName(e.target.value)}
                                        placeholder="Series Name (e.g., Summer Championship 2024)"
                                        className="w-full px-2 py-1.5 text-sm border rounded mb-2"
                                    />
                                    <div className="grid grid-cols-2 gap-2 mb-2">
                                        <input
                                            type="number"
                                            value={newSeriesYear}
                                            onChange={(e) => setNewSeriesYear(parseInt(e.target.value))}
                                            placeholder="Year"
                                            className="px-2 py-1.5 text-sm border rounded"
                                        />
                                        <select
                                            value={newSeriesStatus}
                                            onChange={(e) => setNewSeriesStatus(e.target.value)}
                                            className="px-2 py-1.5 text-sm border rounded"
                                        >
                                            <option value="SCHEDULED">Scheduled</option>
                                            <option value="ACTIVE">Active</option>
                                            <option value="COMPLETED">Completed</option>
                                            <option value="CANCELLED">Cancelled</option>
                                        </select>
                                    </div>
                                    {/* Show detected category */}
                                    {newSeriesName && (
                                        <div className="text-xs text-gray-600 mb-2">
                                            Detected category: <span className="font-medium">
                                                {detectSeriesCategory(newSeriesName)}
                                            </span>
                                        </div>
                                    )}
                                    {createError && (
                                        <div className="text-red-600 text-xs mb-2">{createError}</div>
                                    )}
                                    <div className="flex gap-2">
                                        <button
                                            onClick={handleCreateSeries}
                                            disabled={isCreating || !selectedSeriesTitleId}
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
                        
                        {/* Series Details Editor */}
                        {editedData.isSeries && (
                            <SeriesDetailsEditor 
                                editor={editor} 
                                series={filteredSeries}
                                onSeriesChange={(seriesId) => setSelectedSeriesId(seriesId || '')}
                            />
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
                    <div className="p-4 space-y-4">
                        {/* Validation Status */}
                        <div className={`border rounded-lg p-4 ${validationStatus.isValid ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
                            <h3 className="font-semibold text-sm mb-3">
                                {validationStatus.isValid ? '✓ Validation Passed' : '⚠ Validation Issues'}
                            </h3>
                            
                            {validationStatus.criticalMissing.length > 0 && (
                                <div className="mb-3">
                                    <div className="text-sm font-medium text-red-700 mb-1">Critical Missing Fields:</div>
                                    <div className="flex flex-wrap gap-1">
                                        {validationStatus.criticalMissing.map(field => (
                                            <span key={field} className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs">
                                                {field}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            {validationStatus.required.missing.length > 0 && (
                                <div className="mb-3">
                                    <div className="text-sm font-medium text-orange-700 mb-1">Required Missing Fields:</div>
                                    <div className="flex flex-wrap gap-1">
                                        {validationStatus.required.missing.map(field => (
                                            <span key={field} className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">
                                                {field}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                            
                            {validationStatus.warnings.length > 0 && (
                                <div>
                                    <div className="text-sm font-medium text-yellow-700 mb-1">Warnings:</div>
                                    <ul className="list-disc list-inside text-xs text-yellow-700">
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
                            {venueFee && ` • Fee: $${venueFee.toFixed(2)}`}
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