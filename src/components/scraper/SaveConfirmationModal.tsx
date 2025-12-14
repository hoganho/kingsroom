// src/components/scraper/SaveConfirmationModal.tsx
// ===================================================================
// SIMPLIFIED VERSION - Enrichment happens in orchestrator, not here.
// This modal just displays and allows editing of already-enriched data.
// ===================================================================

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { GameData, EntityConfig } from '../../types/game';
import type { TournamentSeries, TournamentSeriesTitle } from '../../types/series';
import type { EnrichedGameData } from '../../types/enrichment';
import type { ScrapedGameData } from '../../API';
import { useGameDataEditor } from '../../hooks/useGameDataEditor';
import { useConsolidationPreview } from '../../hooks/useConsolidationPreview';

// Tab Components
import { QuickEditTab } from './SaveConfirmation/QuickEditTab';
import { RelationshipsTab } from './SaveConfirmation/RelationshipsTab';
import { GroupingTab } from './SaveConfirmation/GroupingTab';
import { AdvancedTab } from './SaveConfirmation/AdvancedTab';
import { ValidationTab } from './SaveConfirmation/ValidationTab';
import { DiffTab } from './SaveConfirmation/DiffTab';
import { DebugTab } from './SaveConfirmation/DebugTab';

// ===================================================================
// GRAPHQL OPERATIONS (for dropdowns only - no enrichment)
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

const listRecurringGamesForDropdown = /* GraphQL */ `
    query ListRecurringGamesForDropdown($filter: ModelRecurringGameFilterInput, $limit: Int, $nextToken: String) {
        listRecurringGames(filter: $filter, limit: $limit, nextToken: $nextToken) {
            items {
                id
                name
                venueId
                entityId
                dayOfWeek
                frequency
                gameType
                gameVariant
                typicalBuyIn
                typicalGuarantee
                startTime
                isActive
            }
            nextToken
        }
    }
`;

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

// ===================================================================
// TYPES & INTERFACES
// ===================================================================

// Accept multiple data shapes - the orchestrator may pass enriched or scraped data
type GameDataInput = EnrichedGameData | ScrapedGameData | GameData;

interface SaveConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: (editedData: GameData) => void;
    gameData: GameDataInput;  // Accepts enriched, scraped, or game data
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

// Local RecurringGame type that allows null for dayOfWeek (matches API)
interface RecurringGame {
    id: string;
    name: string;
    venueId: string;
    entityId?: string | null;
    dayOfWeek?: string | null;  // Allow null to match API type
    frequency?: string | null;
    gameType?: string | null;
    gameVariant?: string | null;
    typicalBuyIn?: number | null;
    typicalGuarantee?: number | null;
    startTime?: string | null;
    isActive?: boolean | null;
}

// ===================================================================
// TABS CONFIGURATION
// ===================================================================

const tabs: ModalTab[] = [
    { id: 'quick', label: 'Quick Edit', icon: '⚡' },
    { id: 'relationships', label: 'Entity/Venue/Series', icon: '🔗' },
    { id: 'grouping', label: 'Grouping', icon: '📦' },
    { id: 'advanced', label: 'Advanced', icon: '⚙️' },
    { id: 'validation', label: 'Validation', icon: '✓' },
    { id: 'diff', label: 'Changes', icon: '📝' },
    { id: 'debug', label: 'Debug', icon: '🔍' },
];

// ===================================================================
// LAZY CLIENT INITIALIZATION
// ===================================================================

// Use 'any' to avoid TypeScript excessive stack depth error with Amplify types
let clientInstance: any = null;

const getClient = () => {
    if (!clientInstance) {
        clientInstance = generateClient();
    }
    return clientInstance;
};

// ===================================================================
// HELPER: Safe property access for flexible input types
// ===================================================================

const getDataProperty = <T,>(data: GameDataInput | null | undefined, key: string, defaultValue: T): T => {
    if (!data) return defaultValue;
    const value = (data as Record<string, unknown>)[key];
    return (value !== undefined && value !== null) ? value as T : defaultValue;
};

// ===================================================================
// COMPONENT
// ===================================================================

export const SaveConfirmationModal: React.FC<SaveConfirmationModalProps> = ({ 
    isOpen, 
    onClose, 
    onConfirm, 
    gameData,    // Already enriched by orchestrator
    venueId,
    sourceUrl,
    entityId,
    autoMode = false,
    skipConfirmation = false
}) => {
    
    // ===============================================================
    // STATE
    // ===============================================================
    
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
    const [recurringGames, setRecurringGames] = useState<RecurringGame[]>([]);
    const [loadingRecurringGames, setLoadingRecurringGames] = useState(false);
    
    // Selection state - initialized from enriched data (use helper for flexible access)
    const [selectedEntityId, setSelectedEntityId] = useState<string>(
        entityId || getDataProperty(gameData, 'entityId', '')
    );
    const [selectedVenueId, setSelectedVenueId] = useState<string>(
        venueId || getDataProperty(gameData, 'venueId', '')
    );
    const [selectedSeriesId, setSelectedSeriesId] = useState<string>(
        getDataProperty(gameData, 'tournamentSeriesId', '')
    );
    const [selectedSeriesTitleId, setSelectedSeriesTitleId] = useState<string>(
        getDataProperty(gameData, 'seriesTitleId', '')
    );
    
    // Creation state (for Entity/Venue only - Series handled by SeriesDetailsEditor)
    const [activeEntityCard, setActiveEntityCard] = useState<'entity' | 'venue' | null>(null);
    const [showCreateCard, setShowCreateCard] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>('');
    
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
    
    // ===============================================================
    // INITIALIZE EDITOR WITH ENRICHED DATA
    // ===============================================================
    
    // Data is already enriched - use it directly
    const initialData = useMemo(() => {
        if (!gameData) return {} as GameData;
        // Cast through unknown to allow adding/overriding properties
        const data = {
            ...gameData,
            entityId: entityId || getDataProperty(gameData, 'entityId', ''),
            venueId: venueId || getDataProperty(gameData, 'venueId', ''),
            levels: getDataProperty(gameData, 'levels', []),
            hasGuarantee: getDataProperty(gameData, 'hasGuarantee', false)
        } as unknown as GameData;
        return data;
    }, [gameData, entityId, venueId]);
    
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
    
    // ===============================================================
    // EFFECTS - Load dropdown data
    // ===============================================================
    
    // Generate a venue number for new venues
    const generateVenueNumber = useCallback(() => {
        return Math.floor(Math.random() * 900000) + 100000;
    }, []);
    
    // Load venue name
    useEffect(() => {
        const loadVenueName = async () => {
            const vid = selectedVenueId || venueId;
            if (!vid) return;
            
            setLoadingVenue(true);
            try {
                const result = await getClient().graphql({
                    query: getVenueName,
                    variables: { id: vid }
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
    }, [selectedVenueId, venueId]);
    
    // Load entities
    useEffect(() => {
        const loadEntities = async () => {
            try {
                const result = await getClient().graphql({
                    query: listEntitiesForDropdown,
                    variables: { limit: 100 }
                }) as { data: { listEntities: { items: EntityConfig[] } } };
                
                const items = result.data.listEntities?.items || [];
                setEntities(items.filter((item) => item && !(item as unknown as Record<string, unknown>)._deleted));
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
                }) as { data: { listVenues: { items: VenueOption[] } } };
                
                const items = result.data.listVenues?.items || [];
                setVenues(items.filter((item) => item && !(item as unknown as Record<string, unknown>)._deleted));
            } catch (error) {
                console.error('Error loading venues:', error);
            }
        };
        
        if (selectedEntityId || entities.length > 0) {
            loadVenues();
        }
    }, [selectedEntityId, entities.length]);
    
    // Load recurring games when venue changes
    useEffect(() => {
        const loadRecurringGames = async () => {
            const currentVenueId = selectedVenueId || venueId;
            
            if (!currentVenueId) {
                setRecurringGames([]);
                return;
            }
            
            setLoadingRecurringGames(true);
            try {
                const filter = {
                    venueId: { eq: currentVenueId },
                    isActive: { eq: true }
                };
                
                const result = await getClient().graphql({
                    query: listRecurringGamesForDropdown,
                    variables: { filter, limit: 100 }
                }) as { data: { listRecurringGames: { items: RecurringGame[] } } };
                
                const items = result.data.listRecurringGames?.items || [];
                setRecurringGames(items.filter(item => item && !(item as unknown as Record<string, unknown>)._deleted));
            } catch (error) {
                console.error('Error loading recurring games:', error);
                setRecurringGames([]);
            } finally {
                setLoadingRecurringGames(false);
            }
        };
        
        loadRecurringGames();
    }, [selectedVenueId, venueId]);
    
    // Load series and titles
    useEffect(() => {
        const loadSeriesData = async () => {
            try {
                const seriesResult = await getClient().graphql({
                    query: listSeriesForDropdown,
                    variables: { limit: 100 }
                }) as { data: { listTournamentSeries: { items: TournamentSeries[] } } };
                
                const seriesItems = seriesResult.data.listTournamentSeries?.items || [];
                setSeries(seriesItems.filter((item) => item && !(item as unknown as Record<string, unknown>)._deleted));
                
                const titlesResult = await getClient().graphql({
                    query: listSeriesTitlesForDropdown,
                    variables: { limit: 100 }
                }) as { data: { listTournamentSeriesTitles: { items: TournamentSeriesTitle[] } } };
                
                const titleItems = titlesResult.data.listTournamentSeriesTitles?.items || [];
                setSeriesTitles(titleItems.filter((item) => item && !(item as unknown as Record<string, unknown>)._deleted));
            } catch (error) {
                console.error('Error loading series data:', error);
            }
        };
        
        loadSeriesData();
    }, []);
    
    // Auto-confirm if skipConfirmation is enabled
    useEffect(() => {
        if (autoMode && skipConfirmation && isOpen && gameData) {
            handleConfirm();
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoMode, skipConfirmation, isOpen, gameData]);
    
    // ===============================================================
    // HANDLERS
    // ===============================================================
    
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
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to create entity';
            setCreateError(errorMessage);
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
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to create venue';
            setCreateError(errorMessage);
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
            // The editedData already contains enriched values
            // User may have modified some fields - those modifications are preserved
            const saveData: GameData = {
                ...editedData,
                // Ensure selection overrides are applied
                tournamentSeriesId: selectedSeriesId || editedData.tournamentSeriesId || null,
                seriesTitleId: selectedSeriesTitleId || editedData.seriesTitleId || null,
                seriesName: editedData.seriesName || null,
                entityId: selectedEntityId || editedData.entityId,
                venueId: selectedVenueId || editedData.venueId
            };
            
            console.log('[SaveModal] Confirming save:', {
                name: saveData.name,
                recurringGameId: saveData.recurringGameId,
                tournamentSeriesId: saveData.tournamentSeriesId,
                entityId: saveData.entityId,
                venueId: saveData.venueId
            });
            
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
        if (!editedData.gameStatus) fixes.gameStatus = 'SCHEDULED' as GameData['gameStatus'];
        if (!editedData.registrationStatus) fixes.registrationStatus = 'OPEN' as GameData['registrationStatus'];
        if (!editedData.tournamentId) fixes.tournamentId = Math.floor(Math.random() * 1000000);
        
        if (editedData.guaranteeAmount && editedData.guaranteeAmount > 0) {
            fixes.hasGuarantee = true;
        }
        
        updateMultipleFields(fixes);
    };
    
    // ===============================================================
    // COMPUTED VALUES
    // ===============================================================
    
    // Filter series by selected venue
    const filteredSeries = useMemo(() => {
        if (!selectedVenueId) return series;
        return series.filter(s => s.venueId === selectedVenueId);
    }, [series, selectedVenueId]);
    
    // ===============================================================
    // TAB CONTENT RENDERER
    // ===============================================================
    
    const renderTabContent = () => {
        switch(activeTab) {
            case 'quick':
                return (
                    <QuickEditTab
                        editor={editor}
                        editedData={editedData}
                        showAdvanced={showAdvanced}
                        venueFee={venueFee}
                        isEditingVenueFee={isEditingVenueFee}
                        tempVenueFee={tempVenueFee}
                        setTempVenueFee={setTempVenueFee}
                        setIsEditingVenueFee={setIsEditingVenueFee}
                        setVenueFee={setVenueFee}
                        willConsolidate={willConsolidate}
                        consolidationInfo={consolidationInfo}
                        onViewGrouping={() => setActiveTab('grouping')}
                    />
                );
                
            case 'relationships':
                return (
                    <RelationshipsTab
                        editor={editor}
                        editedData={editedData}
                        entities={entities}
                        selectedEntityId={selectedEntityId}
                        setSelectedEntityId={setSelectedEntityId}
                        venues={venues}
                        selectedVenueId={selectedVenueId}
                        setSelectedVenueId={setSelectedVenueId}
                        venueFee={venueFee}
                        setVenueFee={setVenueFee}
                        setVenueName={setVenueName}
                        filteredSeries={filteredSeries}
                        seriesTitles={seriesTitles}
                        selectedSeriesId={selectedSeriesId}
                        setSelectedSeriesId={setSelectedSeriesId}
                        selectedSeriesTitleId={selectedSeriesTitleId}
                        setSelectedSeriesTitleId={setSelectedSeriesTitleId}
                        showCreateCard={showCreateCard}
                        setShowCreateCard={setShowCreateCard}
                        activeEntityCard={activeEntityCard}
                        setActiveEntityCard={setActiveEntityCard}
                        newEntityName={newEntityName}
                        setNewEntityName={setNewEntityName}
                        newEntityDomain={newEntityDomain}
                        setNewEntityDomain={setNewEntityDomain}
                        handleCreateEntity={handleCreateEntity}
                        newVenueName={newVenueName}
                        setNewVenueName={setNewVenueName}
                        newVenueFee={newVenueFee}
                        setNewVenueFee={setNewVenueFee}
                        handleCreateVenue={handleCreateVenue}
                        isCreating={isCreating}
                        createError={createError}
                        handleSeriesTitleCreated={handleSeriesTitleCreated}
                        handleSeriesInstanceCreated={handleSeriesInstanceCreated}
                        recurringGames={recurringGames as any}  // Cast to handle dayOfWeek null vs undefined
                        loadingRecurringGames={loadingRecurringGames}
                    />
                );
            
            case 'grouping':
                return (
                    <GroupingTab
                        editor={editor}
                        editedData={editedData}
                        willConsolidate={willConsolidate}
                        consolidationInfo={consolidationInfo}
                        setConsolidationInfo={setConsolidationInfo}
                        consolidationPreview={consolidationPreview as any}  // Cast to handle detectionSource null vs string
                        onApplyDetectedPattern={handleApplyDetectedPattern}
                    />
                );
                
            case 'advanced':
                return <AdvancedTab editor={editor} />;
                
            case 'validation':
                return (
                    <ValidationTab
                        validationStatus={validationStatus}
                        onQuickFix={handleQuickFix}
                    />
                );
                
            case 'diff':
                return (
                    <DiffTab
                        originalData={originalData}
                        editedData={editedData}
                        getChangedFields={getChangedFields}
                        resetAllChanges={resetAllChanges}
                    />
                );
                
            case 'debug':
                return (
                    <DebugTab
                        originalData={originalData}
                        editedData={editedData}
                        enrichedGame={gameData as EnrichedGameData}  // Cast for DebugTab
                        entityId={selectedEntityId || entityId || ''}
                        sourceUrl={sourceUrl}
                        venueId={selectedVenueId}
                        isLoading={false}
                        error={null}
                    />
                );
                
            default:
                return null;
        }
    };
    
    // ===============================================================
    // RENDER
    // ===============================================================
    
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
                            <span className="ml-2 text-green-600">✓ Enriched</span>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        {/* Recurring badge */}
                        {editedData.recurringGameId && (
                            <span 
                                className="px-2 py-1 bg-green-50 text-green-600 rounded text-xs font-medium cursor-pointer hover:bg-green-100"
                                onClick={() => setActiveTab('relationships')}
                                title="Click to view recurring game details"
                            >
                                🔄 {editedData.recurringGameAssignmentStatus === 'AUTO_ASSIGNED' ? 'Auto-' : ''}Recurring
                            </span>
                        )}
                        
                        {/* Series badge */}
                        {editedData.tournamentSeriesId && (
                            <span 
                                className="px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs font-medium cursor-pointer hover:bg-blue-100"
                                onClick={() => setActiveTab('relationships')}
                                title="Click to view series details"
                            >
                                🏆 Series
                            </span>
                        )}
                        
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
                            {/* Indicator dot on relationships tab when recurring matched */}
                            {tab.id === 'relationships' && editedData.recurringGameId && (
                                <span className="ml-1 w-2 h-2 bg-green-500 rounded-full inline-block" />
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