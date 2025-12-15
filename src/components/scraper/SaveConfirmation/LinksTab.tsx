// src/components/scraper/SaveConfirmation/LinksTab.tsx
// Links tab - All relationship assignments in one place
// Entity, Venue, Series, and Recurring Game

import React, { useState, useCallback } from 'react';
import { useSaveConfirmationContext } from './SaveConfirmationContext';
import { RecurringGameEditor } from './RecurringGameEditor';
import SeriesDetailsEditor from './SeriesDetailsEditor';

// ===================================================================
// TYPES
// ===================================================================

interface LinksTabProps {}

// ===================================================================
// SUB-COMPONENTS
// ===================================================================

// Entity/Venue Section
const EntityVenueSection: React.FC = () => {
  const { 
    editor, 
    dropdownData, 
    filteredVenues, 
    venueFee,
    createState,
    actions,
  } = useSaveConfirmationContext();
  
  const { editedData, updateField } = editor;
  const { entities, venues } = dropdownData;
  
  // Local state for create forms
  const [newEntityName, setNewEntityName] = useState('');
  const [newEntityDomain, setNewEntityDomain] = useState('');
  const [newVenueName, setNewVenueName] = useState('');
  const [newVenueFee, setNewVenueFee] = useState<string>('');
  
  // Handlers
  const handleEntityChange = useCallback((entityId: string) => {
    updateField('entityId', entityId || null);
    
    // Clear venue if it doesn't belong to new entity
    if (entityId && editedData.venueId) {
      const currentVenue = venues.find(v => v.id === editedData.venueId);
      if (currentVenue?.entityId && currentVenue.entityId !== entityId) {
        updateField('venueId', null);
      }
    }
  }, [updateField, editedData.venueId, venues]);
  
  const handleVenueChange = useCallback((venueId: string) => {
    updateField('venueId', venueId || null);
    
    const venue = venues.find(v => v.id === venueId);
    if (venue?.fee) {
      updateField('venueFee', venue.fee);
      actions.setVenueFee(venue.fee);
    }
  }, [updateField, venues, actions]);
  
  const handleCreateEntity = async () => {
    if (!newEntityName.trim()) return;
    const result = await actions.createEntity(newEntityName.trim(), newEntityDomain.trim());
    if (result) {
      setNewEntityName('');
      setNewEntityDomain('');
    }
  };
  
  const handleCreateVenue = async () => {
    if (!newVenueName.trim()) return;
    const fee = newVenueFee ? parseFloat(newVenueFee) : null;
    const result = await actions.createVenue(newVenueName.trim(), fee);
    if (result) {
      setNewVenueName('');
      setNewVenueFee('');
    }
  };
  
  return (
    <div className="border rounded-lg p-4 bg-white">
      <h3 className="font-semibold text-sm flex items-center gap-2 mb-4">
        🏢 Entity & Venue
      </h3>
      
      <div className="space-y-4">
        {/* Entity Selector */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Entity <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <select
              value={editedData.entityId || ''}
              onChange={(e) => handleEntityChange(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none"
            >
              <option value="">-- Select Entity --</option>
              {entities.filter(e => e.isActive !== false).map(entity => (
                <option key={entity.id} value={entity.id}>
                  {entity.entityName}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => actions.setCreateActiveCard(createState.activeCard === 'entity' ? null : 'entity')}
              className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
              title="Create new entity"
            >
              +
            </button>
          </div>
        </div>
        
        {/* Create Entity Form */}
        {createState.activeCard === 'entity' && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
            <div className="text-sm font-medium text-blue-800">Create New Entity</div>
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
              placeholder="Domain (e.g., pokernow.club)"
              className="w-full px-3 py-2 text-sm border rounded"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreateEntity}
                disabled={createState.isCreating || !newEntityName.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
              >
                {createState.isCreating ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => actions.setCreateActiveCard(null)}
                className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
            {createState.error && (
              <div className="text-xs text-red-600">{createState.error}</div>
            )}
          </div>
        )}
        
        {/* Venue Selector */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Venue <span className="text-red-500">*</span>
          </label>
          <div className="flex gap-2">
            <select
              value={editedData.venueId || ''}
              onChange={(e) => handleVenueChange(e.target.value)}
              className="flex-1 px-3 py-2 text-sm border rounded focus:ring-2 focus:ring-blue-500 outline-none"
              disabled={!editedData.entityId}
            >
              <option value="">-- Select Venue --</option>
              {filteredVenues.map(venue => (
                <option key={venue.id} value={venue.id}>
                  {venue.name} {venue.fee ? `($${venue.fee} fee)` : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => actions.setCreateActiveCard(createState.activeCard === 'venue' ? null : 'venue')}
              className="px-3 py-2 text-sm border rounded hover:bg-gray-50"
              title="Create new venue"
              disabled={!editedData.entityId}
            >
              +
            </button>
          </div>
          {!editedData.entityId && (
            <p className="text-xs text-gray-500 mt-1">Select an entity first</p>
          )}
        </div>
        
        {/* Create Venue Form */}
        {createState.activeCard === 'venue' && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg space-y-3">
            <div className="text-sm font-medium text-blue-800">Create New Venue</div>
            <input
              type="text"
              value={newVenueName}
              onChange={(e) => setNewVenueName(e.target.value)}
              placeholder="Venue Name"
              className="w-full px-3 py-2 text-sm border rounded"
            />
            <input
              type="number"
              value={newVenueFee}
              onChange={(e) => setNewVenueFee(e.target.value)}
              placeholder="Venue Fee (optional)"
              step="0.01"
              min="0"
              className="w-full px-3 py-2 text-sm border rounded"
            />
            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleCreateVenue}
                disabled={createState.isCreating || !newVenueName.trim()}
                className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400"
              >
                {createState.isCreating ? 'Creating...' : 'Create'}
              </button>
              <button
                type="button"
                onClick={() => actions.setCreateActiveCard(null)}
                className="px-4 py-2 text-sm bg-gray-200 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
            {createState.error && (
              <div className="text-xs text-red-600">{createState.error}</div>
            )}
          </div>
        )}
        
        {/* Venue Fee Display/Edit */}
        {editedData.venueId && (
          <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
            <span className="text-sm text-gray-600">Venue Fee:</span>
            <span className="text-sm font-medium text-green-600">
              ${editedData.venueFee ?? venueFee ?? 0}
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

// Series Section (wrapper for SeriesDetailsEditor)
const SeriesSection: React.FC = () => {
  const { editor, dropdownData, filteredSeries } = useSaveConfirmationContext();
  const { editedData } = editor;
  
  // Show series section if game is marked as series or has series assignment
  const showSeries = editedData.isSeries || editedData.tournamentSeriesId || editedData.seriesName;
  
  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <div className="px-4 py-3 bg-gray-50 border-b">
        <h3 className="font-semibold text-sm flex items-center gap-2">
          🏆 Tournament Series
          {editedData.tournamentSeriesId && (
            <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
              Linked
            </span>
          )}
        </h3>
      </div>
      
      <div className="p-4">
        {showSeries ? (
          <SeriesDetailsEditor
            editor={editor}
            series={filteredSeries}
            seriesTitles={dropdownData.seriesTitles}
            venueId={editedData.venueId || undefined}
          />
        ) : (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 mb-3">
              This game is not part of a series.
            </p>
            <button
              type="button"
              onClick={() => editor.updateField('isSeries', true)}
              className="text-sm text-blue-600 hover:text-blue-700"
            >
              + Mark as Series Event
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// Recurring Game Section (wrapper for RecurringGameEditor)
const RecurringSection: React.FC = () => {
  const { editor, filteredRecurringGames, loadingStates } = useSaveConfirmationContext();
  const { editedData } = editor;
  
  // Don't show for series games
  if (editedData.isSeries) {
    return (
      <div className="border rounded-lg p-4 bg-gray-50">
        <h3 className="font-semibold text-sm flex items-center gap-2 mb-2">
          🔄 Recurring Game
        </h3>
        <p className="text-sm text-gray-600">
          Series events are not linked to recurring game patterns.
        </p>
      </div>
    );
  }
  
  return (
    <div className="relative">
      {loadingStates.recurringGames && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10 rounded-lg">
          <span className="text-sm text-gray-500 animate-pulse">Loading recurring games...</span>
        </div>
      )}
      
      <RecurringGameEditor
        editor={editor}
        availableRecurringGames={filteredRecurringGames}
        venueId={editedData.venueId || undefined}
      />
      
      {/* Debug info */}
      {!loadingStates.recurringGames && filteredRecurringGames.length === 0 && editedData.venueId && (
        <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
          No recurring game patterns found for this venue.
        </div>
      )}
    </div>
  );
};

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const LinksTab: React.FC<LinksTabProps> = () => {
  const { editor, consolidation } = useSaveConfirmationContext();
  const { editedData } = editor;
  
  return (
    <div className="p-4 space-y-4">
      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        {editedData.entityId && (
          <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
            ✓ Entity
          </span>
        )}
        {editedData.venueId && (
          <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
            ✓ Venue
          </span>
        )}
        {editedData.tournamentSeriesId && (
          <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
            🏆 Series
          </span>
        )}
        {editedData.recurringGameId && (
          <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
            🔄 Recurring
          </span>
        )}
        {consolidation.willConsolidate && (
          <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
            📦 Multi-day
          </span>
        )}
      </div>
      
      {/* Entity & Venue */}
      <EntityVenueSection />
      
      {/* Series */}
      <SeriesSection />
      
      {/* Recurring Game */}
      <RecurringSection />
    </div>
  );
};

export default LinksTab;
