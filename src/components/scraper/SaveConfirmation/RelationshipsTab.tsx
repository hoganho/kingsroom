// src/components/scraper/SaveConfirmation/RelationshipsTab.tsx
// ===================================================================
// RelationshipsTab-final1.tsx
// ===================================================================

import React, { useMemo } from 'react';
import type { UseGameDataEditorReturn } from '../../../hooks/useGameDataEditor';
import type { GameData, EntityConfig } from '../../../types/game';
import type { TournamentSeries, TournamentSeriesTitle } from '../../../types/series';
import { RecurringGameEditor, type RecurringGame } from './RecurringGameEditor';

// Extended GameData type to include enrichment fields
type EditedDataWithEnrichment = GameData & {
    seriesAssignmentStatus?: string | null;
    seriesAssignmentConfidence?: number | null;
    recurringGameId?: string | null;
    recurringGameAssignmentStatus?: string | null;
    recurringGameAssignmentConfidence?: number | null;
};

// ===================================================================
// TYPES
// ===================================================================

interface VenueOption {
    id: string;
    name: string;
    venueNumber?: number;
    entityId?: string | null;
    fee?: number | null;
}

interface RelationshipsTabProps {
    editor: UseGameDataEditorReturn;
    editedData: EditedDataWithEnrichment;
    
    // Entity props
    entities: EntityConfig[];
    selectedEntityId: string;
    setSelectedEntityId: (id: string) => void;
    
    // Venue props
    venues: VenueOption[];
    selectedVenueId: string;
    setSelectedVenueId: (id: string) => void;
    venueFee: number | null;
    setVenueFee: (fee: number | null) => void;
    setVenueName: (name: string) => void;
    
    // Series props
    filteredSeries: TournamentSeries[];
    seriesTitles: TournamentSeriesTitle[];
    selectedSeriesId: string;
    setSelectedSeriesId: (id: string) => void;
    selectedSeriesTitleId: string;
    setSelectedSeriesTitleId: (id: string) => void;
    
    // Creation card props
    showCreateCard: boolean;
    setShowCreateCard: (show: boolean) => void;
    activeEntityCard: 'entity' | 'venue' | null;
    setActiveEntityCard: (card: 'entity' | 'venue' | null) => void;
    
    // New entity creation
    newEntityName: string;
    setNewEntityName: (name: string) => void;
    newEntityDomain: string;
    setNewEntityDomain: (domain: string) => void;
    handleCreateEntity: () => Promise<void>;
    
    // New venue creation
    newVenueName: string;
    setNewVenueName: (name: string) => void;
    newVenueFee: number | null;
    setNewVenueFee: (fee: number | null) => void;
    handleCreateVenue: () => Promise<void>;
    
    // Creation state
    isCreating: boolean;
    createError: string | null;
    
    // Series creation callbacks (reserved for future use)
    handleSeriesTitleCreated?: (title: TournamentSeriesTitle) => void;
    handleSeriesInstanceCreated?: (instance: TournamentSeries) => void;
    
    // Recurring game props
    recurringGames: RecurringGame[];
    loadingRecurringGames: boolean;
}

// ===================================================================
// COMPONENT
// ===================================================================

export const RelationshipsTab: React.FC<RelationshipsTabProps> = ({
    editor,
    editedData,
    entities,
    selectedEntityId,
    setSelectedEntityId,
    venues,
    selectedVenueId,
    setSelectedVenueId,
    venueFee,
    setVenueFee,
    setVenueName,
    filteredSeries,
    seriesTitles,
    selectedSeriesId,
    setSelectedSeriesId,
    selectedSeriesTitleId,
    setSelectedSeriesTitleId,
    showCreateCard,
    setShowCreateCard,
    activeEntityCard,
    setActiveEntityCard,
    newEntityName,
    setNewEntityName,
    newEntityDomain,
    setNewEntityDomain,
    handleCreateEntity,
    newVenueName,
    setNewVenueName,
    newVenueFee,
    setNewVenueFee,
    handleCreateVenue,
    isCreating,
    createError,
    // handleSeriesTitleCreated and handleSeriesInstanceCreated reserved for future SeriesDetailsEditor
    recurringGames,
    loadingRecurringGames
}) => {
    const { updateField, updateMultipleFields } = editor;
    
    // Determine if this is a series game (don't show recurring for series)
    const isSeries = editedData.isSeries === true;
    
    // Filter venues by selected entity
    const filteredVenues = useMemo(() => {
        if (!selectedEntityId) return venues;
        return venues.filter(v => v.entityId === selectedEntityId || !v.entityId);
    }, [venues, selectedEntityId]);
    
    // Handle entity selection
    const handleEntityChange = (entityId: string) => {
        setSelectedEntityId(entityId);
        updateField('entityId', entityId);
        
        // Clear venue if it doesn't belong to new entity
        const currentVenue = venues.find(v => v.id === selectedVenueId);
        if (currentVenue && currentVenue.entityId && currentVenue.entityId !== entityId) {
            setSelectedVenueId('');
            updateField('venueId', '');
            setVenueName('');
            setVenueFee(null);
        }
    };
    
    // Handle venue selection
    const handleVenueChange = (venueId: string) => {
        setSelectedVenueId(venueId);
        updateField('venueId', venueId);
        
        const venue = venues.find(v => v.id === venueId);
        if (venue) {
            setVenueName(venue.name);
            setVenueFee(venue.fee || null);
            if (venue.fee) {
                updateField('venueFee', venue.fee);
            }
        } else {
            setVenueName('');
            setVenueFee(null);
        }
    };
    
    // Handle series selection
    const handleSeriesChange = (seriesId: string) => {
        setSelectedSeriesId(seriesId);
        
        if (seriesId) {
            const series = filteredSeries.find(s => s.id === seriesId);
            updateMultipleFields({
                tournamentSeriesId: seriesId,
                seriesName: series?.name || null,
                isSeries: true,
            } as Partial<GameData>);
            // Set enrichment fields via direct field updates
            updateField('seriesAssignmentStatus' as keyof GameData, 'MANUALLY_ASSIGNED');
            updateField('seriesAssignmentConfidence' as keyof GameData, 1.0);
            
            // Also set the title ID if available
            if (series?.tournamentSeriesTitleId) {
                setSelectedSeriesTitleId(series.tournamentSeriesTitleId);
                updateField('seriesTitleId', series.tournamentSeriesTitleId);
            }
        } else {
            updateMultipleFields({
                tournamentSeriesId: null,
                seriesName: null,
                isSeries: false,
            } as Partial<GameData>);
            updateField('seriesAssignmentStatus' as keyof GameData, 'NOT_SERIES');
            updateField('seriesAssignmentConfidence' as keyof GameData, 0);
        }
    };
    
    return (
        <div className="p-4 space-y-6">
            {/* Entity & Venue Section */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Entity Selector */}
                <div className="border rounded-lg p-4 bg-white">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-semibold text-sm">🏢 Entity</h3>
                        <button
                            onClick={() => {
                                setActiveEntityCard('entity');
                                setShowCreateCard(true);
                            }}
                            className="text-xs text-blue-600 hover:text-blue-800"
                        >
                            + New Entity
                        </button>
                    </div>
                    <select
                        value={selectedEntityId}
                        onChange={(e) => handleEntityChange(e.target.value)}
                        className="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        <option value="">-- Select Entity --</option>
                        {entities.map(entity => (
                            <option key={entity.id} value={entity.id}>
                                {entity.entityName}
                            </option>
                        ))}
                    </select>
                </div>
                
                {/* Venue Selector */}
                <div className="border rounded-lg p-4 bg-white">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-semibold text-sm">📍 Venue</h3>
                        <button
                            onClick={() => {
                                setActiveEntityCard('venue');
                                setShowCreateCard(true);
                            }}
                            className="text-xs text-blue-600 hover:text-blue-800"
                            disabled={!selectedEntityId}
                        >
                            + New Venue
                        </button>
                    </div>
                    <select
                        value={selectedVenueId}
                        onChange={(e) => handleVenueChange(e.target.value)}
                        className="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                    >
                        <option value="">-- Select Venue --</option>
                        {filteredVenues.map(venue => (
                            <option key={venue.id} value={venue.id}>
                                {venue.name} {venue.fee ? `($${venue.fee} fee)` : ''}
                            </option>
                        ))}
                    </select>
                    {venueFee !== null && (
                        <div className="mt-2 text-xs text-gray-500">
                            Venue Fee: ${venueFee}
                        </div>
                    )}
                </div>
            </div>
            
            {/* Create Card (Entity or Venue) */}
            {showCreateCard && (
                <div className="border rounded-lg p-4 bg-blue-50">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-semibold text-sm">
                            {activeEntityCard === 'entity' ? '🏢 Create New Entity' : '📍 Create New Venue'}
                        </h3>
                        <button
                            onClick={() => setShowCreateCard(false)}
                            className="text-gray-500 hover:text-gray-700"
                        >
                            ✕
                        </button>
                    </div>
                    
                    {activeEntityCard === 'entity' ? (
                        <div className="space-y-3">
                            <input
                                type="text"
                                value={newEntityName}
                                onChange={(e) => setNewEntityName(e.target.value)}
                                placeholder="Entity Name"
                                className="w-full px-3 py-2 text-sm border rounded"
                            />
                            <input
                                type="text"
                                value={newEntityDomain}
                                onChange={(e) => setNewEntityDomain(e.target.value)}
                                placeholder="Domain (e.g. kingsroom.com.au)"
                                className="w-full px-3 py-2 text-sm border rounded"
                            />
                            <button
                                onClick={handleCreateEntity}
                                disabled={isCreating}
                                className="w-full px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-400"
                            >
                                {isCreating ? 'Creating...' : 'Create Entity'}
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <input
                                type="text"
                                value={newVenueName}
                                onChange={(e) => setNewVenueName(e.target.value)}
                                placeholder="Venue Name"
                                className="w-full px-3 py-2 text-sm border rounded"
                            />
                            <input
                                type="number"
                                value={newVenueFee || ''}
                                onChange={(e) => setNewVenueFee(e.target.value ? parseFloat(e.target.value) : null)}
                                placeholder="Venue Fee (optional)"
                                className="w-full px-3 py-2 text-sm border rounded"
                            />
                            <button
                                onClick={handleCreateVenue}
                                disabled={isCreating}
                                className="w-full px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700 disabled:bg-gray-400"
                            >
                                {isCreating ? 'Creating...' : 'Create Venue'}
                            </button>
                        </div>
                    )}
                    
                    {createError && (
                        <div className="mt-2 text-xs text-red-600">{createError}</div>
                    )}
                </div>
            )}
            
            {/* Series Section */}
            <div className="border rounded-lg p-4 bg-white">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-semibold text-sm flex items-center gap-2">
                        🏆 Tournament Series
                        {editedData.seriesAssignmentStatus && (
                            <span className={`text-xs px-2 py-0.5 rounded ${
                                editedData.seriesAssignmentStatus === 'AUTO_ASSIGNED' ? 'bg-blue-100 text-blue-700' :
                                editedData.seriesAssignmentStatus === 'MANUALLY_ASSIGNED' ? 'bg-green-100 text-green-700' :
                                'bg-gray-100 text-gray-600'
                            }`}>
                                {String(editedData.seriesAssignmentStatus).replace('_', ' ')}
                            </span>
                        )}
                    </h3>
                </div>
                
                {/* Series Auto-Match Info */}
                {editedData.seriesAssignmentStatus === 'AUTO_ASSIGNED' && editedData.seriesName && (
                    <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
                        <div className="font-medium">💡 Auto-Matched: {editedData.seriesName}</div>
                        <div className="text-xs opacity-75 mt-1">
                            Confidence: {Math.round((editedData.seriesAssignmentConfidence || 0) * 100)}%
                        </div>
                    </div>
                )}
                
                <div className="space-y-3">
                    {/* Series Title Dropdown */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Series Title (Template)
                        </label>
                        <select
                            value={selectedSeriesTitleId}
                            onChange={(e) => {
                                setSelectedSeriesTitleId(e.target.value);
                                updateField('seriesTitleId', e.target.value || null);
                            }}
                            className="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="">-- No Series Title --</option>
                            {seriesTitles.map(title => (
                                <option key={title.id} value={title.id}>
                                    {title.title} ({title.seriesCategory || 'REGULAR'})
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    {/* Series Instance Dropdown */}
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            Series Instance
                        </label>
                        <select
                            value={selectedSeriesId}
                            onChange={(e) => handleSeriesChange(e.target.value)}
                            className="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                        >
                            <option value="">-- Not Part of a Series --</option>
                            {filteredSeries.map(s => (
                                <option key={s.id} value={s.id}>
                                    {s.name} ({s.year}) {s.status === 'COMPLETED' ? '✓' : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    {/* Series Name Override */}
                    {editedData.isSeries && (
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Series Name (Display)
                            </label>
                            <input
                                type="text"
                                value={editedData.seriesName || ''}
                                onChange={(e) => updateField('seriesName', e.target.value)}
                                placeholder="e.g. Colossus Series May 2025"
                                className="w-full px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                            />
                        </div>
                    )}
                </div>
            </div>
            
            {/* Recurring Game Section - Only show for non-series games */}
            {!isSeries && (
                <div className="relative">
                    {loadingRecurringGames && (
                        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10 rounded-lg">
                            <span className="text-sm text-gray-500 animate-pulse">Loading recurring games...</span>
                        </div>
                    )}
                    <RecurringGameEditor
                        editor={editor}
                        availableRecurringGames={recurringGames}
                        venueId={selectedVenueId}
                    />
                </div>
            )}
            
            {/* Info message when series game */}
            {isSeries && (
                <div className="border rounded-lg p-4 bg-gray-50">
                    <div className="text-sm text-gray-600">
                        <span className="font-medium">ℹ️ Recurring Game:</span> Series events are not linked to recurring game patterns.
                        {editedData.seriesName && (
                            <span className="block mt-1">
                                This game is part of <strong>{editedData.seriesName}</strong>.
                            </span>
                        )}
                    </div>
                </div>
            )}
            
            {/* No Recurring Games Available Message */}
            {!isSeries && !loadingRecurringGames && recurringGames.length === 0 && selectedVenueId && (
                <div className="border rounded-lg p-4 bg-yellow-50 border-yellow-200">
                    <div className="text-sm text-yellow-800">
                        <span className="font-medium">⚠️ No Recurring Games:</span> No recurring game patterns found for this venue.
                        <span className="block mt-1 text-xs">
                            Recurring games are created automatically by the enricher or can be manually created in the admin panel.
                        </span>
                    </div>
                </div>
            )}
            
            {/* Debug Info (collapsible) */}
            <details className="border rounded-lg p-4 bg-gray-50">
                <summary className="text-xs font-medium text-gray-500 cursor-pointer">
                    Debug: Assignment Status
                </summary>
                <div className="mt-2 text-xs text-gray-600 space-y-1">
                    <div>Entity ID: {selectedEntityId || editedData.entityId || 'Not set'}</div>
                    <div>Venue ID: {selectedVenueId || editedData.venueId || 'Not set'}</div>
                    <div>Series ID: {editedData.tournamentSeriesId || 'Not set'}</div>
                    <div>Series Status: {editedData.seriesAssignmentStatus || 'N/A'}</div>
                    <div>Series Confidence: {editedData.seriesAssignmentConfidence ? `${Math.round(editedData.seriesAssignmentConfidence * 100)}%` : 'N/A'}</div>
                    <div>Recurring ID: {editedData.recurringGameId || 'Not set'}</div>
                    <div>Recurring Status: {editedData.recurringGameAssignmentStatus || 'N/A'}</div>
                    <div>Recurring Confidence: {editedData.recurringGameAssignmentConfidence ? `${Math.round(editedData.recurringGameAssignmentConfidence * 100)}%` : 'N/A'}</div>
                    <div>Available Recurring Games: {recurringGames.length}</div>
                </div>
            </details>
        </div>
    );
};

export default RelationshipsTab;