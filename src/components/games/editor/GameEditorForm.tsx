// components/games/editor/GameEditorForm.tsx
// Unified Game Editor Form - Uses existing GameData type and single hook

import React, { useMemo } from 'react';
import type { 
  EntityOption, 
  VenueOption, 
  RecurringGameOption,
  SeriesOption,
  FieldGroupConfig,
} from '../../../types/gameEditor';
import type { UseGameDataEditorReturn } from '../../../hooks/useGameDataEditor';
import { EditableField } from '../../scraper/SaveConfirmation/EditableField';
import { fieldManifest } from '../../../lib/fieldManifest';

// ===================================================================
// PROPS
// ===================================================================

interface GameEditorFormProps {
  editor: UseGameDataEditorReturn;
  
  // Dropdown options
  entities?: EntityOption[];
  venues?: VenueOption[];
  recurringGames?: RecurringGameOption[];
  series?: SeriesOption[];
  
  // Feature flags
  showAdvanced?: boolean;
  showRecurringGameSelector?: boolean;
  showSeriesSelector?: boolean;
  compact?: boolean;
}

// ===================================================================
// ENTITY/VENUE SELECTOR
// ===================================================================

interface EntityVenueSelectorProps {
  editor: UseGameDataEditorReturn;
  entities: EntityOption[];
  venues: VenueOption[];
  compact?: boolean;
}

const EntityVenueSelector: React.FC<EntityVenueSelectorProps> = ({
  editor,
  entities,
  venues,
  compact = false,
}) => {
  const { editedData, updateField, getFieldValidation } = editor;
  
  const filteredVenues = useMemo(() => {
    if (!editedData.entityId) return venues;
    return venues.filter(v => v.entityId === editedData.entityId || !v.entityId);
  }, [venues, editedData.entityId]);
  
  const entityValidation = getFieldValidation('entityId');
  const venueValidation = getFieldValidation('venueId');
  
  const baseClass = compact 
    ? "flex items-center gap-2 px-2 py-1 border rounded"
    : "border rounded-lg p-3";
  
  return (
    <div className="space-y-2">
      <div className={`${baseClass} ${!entityValidation.valid ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
        <label className={compact ? "text-xs font-medium text-gray-600 w-24 flex-shrink-0" : "block text-sm font-semibold text-gray-700 mb-2"}>
          Entity {entityValidation.required && <span className="text-red-500">*</span>}
        </label>
        <select
          value={editedData.entityId || ''}
          onChange={(e) => {
            updateField('entityId', e.target.value || null);
            if (e.target.value !== editedData.entityId) {
              updateField('venueId', null);
            }
          }}
          className={compact 
            ? "flex-1 px-2 py-1 text-sm border rounded" 
            : "w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          }
        >
          <option value="">-- Select Entity --</option>
          {entities.map(entity => (
            <option key={entity.id} value={entity.id}>
              {entity.entityName}
            </option>
          ))}
        </select>
      </div>
      
      <div className={`${baseClass} ${!venueValidation.valid ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
        <label className={compact ? "text-xs font-medium text-gray-600 w-24 flex-shrink-0" : "block text-sm font-semibold text-gray-700 mb-2"}>
          Venue {venueValidation.required && <span className="text-red-500">*</span>}
        </label>
        <select
          value={editedData.venueId || ''}
          onChange={(e) => updateField('venueId', e.target.value || null)}
          className={compact 
            ? "flex-1 px-2 py-1 text-sm border rounded" 
            : "w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
          }
          disabled={!editedData.entityId && entities.length > 0}
        >
          <option value="">-- Select Venue --</option>
          {filteredVenues.map(venue => (
            <option key={venue.id} value={venue.id}>
              {venue.name} {venue.entityName && venue.entityId !== editedData.entityId ? `(${venue.entityName})` : ''}
            </option>
          ))}
        </select>
        {!editedData.entityId && entities.length > 0 && (
          <p className="text-xs text-gray-500 mt-1">Select an entity first</p>
        )}
      </div>
    </div>
  );
};

// ===================================================================
// RECURRING GAME SELECTOR
// ===================================================================

interface RecurringGameSelectorProps {
  editor: UseGameDataEditorReturn;
  recurringGames: RecurringGameOption[];
  compact?: boolean;
}

const RecurringGameSelector: React.FC<RecurringGameSelectorProps> = ({
  editor,
  recurringGames,
  compact = false,
}) => {
  const { editedData, updateField, updateMultipleFields } = editor;
  
  const filteredGames = useMemo(() => {
    if (!editedData.venueId) return recurringGames;
    return recurringGames.filter(rg => rg.venueId === editedData.venueId);
  }, [recurringGames, editedData.venueId]);
  
  const selectedGame = recurringGames.find(rg => rg.id === editedData.recurringGameId);
  
  // Handle recurring game selection with full auto-populate
  const handleRecurringGameSelect = (gameId: string | null) => {
    updateField('recurringGameId', gameId);
    
    if (gameId) {
      const game = recurringGames.find(rg => rg.id === gameId);
      if (game) {
        // Build updates object - only populate fields that are empty
        const updates: Partial<typeof editedData> = {
          recurringGameAssignmentStatus: 'MANUALLY_ASSIGNED' as any,
        };
        
        // Auto-populate empty fields from recurring game template
        if (!editedData.name && game.name) {
          updates.name = game.name;
        }
        if (!editedData.buyIn && game.buyIn) {
          updates.buyIn = game.buyIn;
        }
        if (!editedData.rake && game.rake) {
          updates.rake = game.rake;
        }
        if (!editedData.startingStack && game.startingStack) {
          updates.startingStack = game.startingStack;
        }
        if (!editedData.gameVariant && game.gameVariant) {
          updates.gameVariant = game.gameVariant as any;
        }
        if (!editedData.gameType && game.gameType) {
          updates.gameType = game.gameType as any;
        }
        if (game.guaranteeAmount && game.guaranteeAmount > 0) {
          if (!editedData.guaranteeAmount) {
            updates.guaranteeAmount = game.guaranteeAmount;
          }
          updates.hasGuarantee = true;
        }
        if (!editedData.venueId && game.venueId) {
          updates.venueId = game.venueId;
        }
        if (!editedData.entityId && game.entityId) {
          updates.entityId = game.entityId;
        }
        
        // Apply all updates at once
        updateMultipleFields(updates);
      }
    } else {
      updateField('recurringGameAssignmentStatus', 'NOT_RECURRING');
    }
  };
  
  // Count how many fields would be auto-populated
  const autoPopulatePreview = useMemo(() => {
    if (!selectedGame) return null;
    const fields: string[] = [];
    if (!editedData.name && selectedGame.name) fields.push('Name');
    if (!editedData.buyIn && selectedGame.buyIn) fields.push('Buy-In');
    if (!editedData.rake && selectedGame.rake) fields.push('Rake');
    if (!editedData.startingStack && selectedGame.startingStack) fields.push('Starting Stack');
    if (!editedData.gameVariant && selectedGame.gameVariant) fields.push('Variant');
    if (selectedGame.guaranteeAmount && selectedGame.guaranteeAmount > 0 && !editedData.guaranteeAmount) {
      fields.push('Guarantee');
    }
    return fields;
  }, [selectedGame, editedData]);
  
  return (
    <div className={compact ? "space-y-1" : "space-y-3"}>
      <div className={compact 
        ? "flex items-center gap-2 px-2 py-1 border rounded border-gray-200 bg-white"
        : "border rounded-lg p-3 bg-white"
      }>
        <label className={compact ? "text-xs font-medium text-gray-600 w-24 flex-shrink-0" : "block text-sm font-semibold text-gray-700 mb-2"}>
          Recurring Game
        </label>
        <select
          value={editedData.recurringGameId || ''}
          onChange={(e) => handleRecurringGameSelect(e.target.value || null)}
          className={compact 
            ? "flex-1 px-2 py-1 text-sm border rounded" 
            : "w-full px-3 py-2 border border-gray-300 rounded-md"
          }
        >
          <option value="">-- Not linked to recurring game --</option>
          {filteredGames.map(game => (
            <option key={game.id} value={game.id}>
              {game.name} ({game.dayOfWeek} @ {game.startTime})
              {game.buyIn ? ` - $${game.buyIn}` : ''}
            </option>
          ))}
        </select>
      </div>
      
      {/* Selected recurring game info card */}
      {selectedGame && (
        <div className="px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm">
          <div className="flex items-center gap-2 text-blue-800">
            <span className="text-blue-500">🔄</span>
            <span className="font-medium">{selectedGame.name}</span>
            {selectedGame.isSignature && (
              <span className="text-xs px-1.5 py-0.5 bg-yellow-100 text-yellow-800 rounded">Signature</span>
            )}
          </div>
          <div className="text-xs text-blue-600 mt-1 space-y-0.5">
            <div>{selectedGame.dayOfWeek} @ {selectedGame.startTime} • {selectedGame.venueName}</div>
            <div className="flex flex-wrap gap-2 mt-1">
              {selectedGame.buyIn && <span>💰 ${selectedGame.buyIn}</span>}
              {selectedGame.rake && <span>🎰 ${selectedGame.rake} rake</span>}
              {selectedGame.startingStack && <span>🎯 {selectedGame.startingStack.toLocaleString()} chips</span>}
              {selectedGame.guaranteeAmount && <span>🏆 ${selectedGame.guaranteeAmount.toLocaleString()} GTD</span>}
            </div>
          </div>
          
          {/* Auto-populate hint */}
          {autoPopulatePreview && autoPopulatePreview.length > 0 && (
            <div className="mt-2 pt-2 border-t border-blue-200 text-xs text-blue-700">
              ✨ Will auto-fill: {autoPopulatePreview.join(', ')}
            </div>
          )}
        </div>
      )}
      
      {/* Deviation notes */}
      {editedData.recurringGameId && (
        <div className={compact ? "px-2" : ""}>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Deviation Notes (if different from usual)
          </label>
          <input
            type="text"
            value={editedData.deviationNotes || ''}
            onChange={(e) => updateField('deviationNotes', e.target.value || null)}
            placeholder="e.g., Special holiday structure, different buy-in..."
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded"
          />
        </div>
      )}
    </div>
  );
};

// ===================================================================
// FIELD GROUP COMPONENT
// ===================================================================

interface FieldGroupProps {
  group: FieldGroupConfig;
  editor: UseGameDataEditorReturn;
  isExpanded: boolean;
  onToggle: () => void;
  compact?: boolean;
}

const FieldGroup: React.FC<FieldGroupProps> = ({
  group,
  editor,
  isExpanded,
  onToggle,
  compact = false,
}) => {
  const { editedData, updateField, getFieldStatus, getFieldValidation, validationStatus } = editor;
  
  const groupHasIssues = useMemo(() => {
    return group.fields.some(field => {
      const validation = getFieldValidation(field);
      return !validation.valid && validation.required;
    });
  }, [group.fields, getFieldValidation]);
  
  const fieldCounts = useMemo(() => {
    let filled = 0, total = 0;
    for (const field of group.fields) {
      if (field in fieldManifest || field in editedData) {
        total++;
        const value = editedData[field];
        if (value !== undefined && value !== null && value !== '') filled++;
      }
    }
    return { filled, total };
  }, [group.fields, editedData]);
  
  const groupWarnings = useMemo(() => {
    return validationStatus.warnings.filter(w => 
      group.fields.some(f => w.field === f || w.message?.toLowerCase().includes(f.toLowerCase()))
    );
  }, [validationStatus.warnings, group.fields]);
  
  const getBorderColor = () => {
    if (groupHasIssues) return 'border-red-300';
    if (group.priority === 'critical') return 'border-blue-300';
    return 'border-gray-200';
  };
  
  const getHeaderBg = () => {
    if (groupHasIssues) return 'bg-red-50';
    if (group.priority === 'critical') return 'bg-blue-50';
    return 'bg-gray-50';
  };
  
  const getStatusIcon = () => {
    if (groupHasIssues) return <span className="text-red-500">⚠</span>;
    if (fieldCounts.filled === fieldCounts.total && fieldCounts.total > 0) {
      return <span className="text-green-500">✔</span>;
    }
    if (fieldCounts.filled > 0) return <span className="text-blue-500">◐</span>;
    return <span className="text-gray-400">○</span>;
  };
  
  return (
    <div className={`border rounded-lg overflow-hidden ${getBorderColor()}`}>
      <button
        type="button"
        onClick={onToggle}
        className={`w-full px-3 py-2 flex items-center justify-between text-left hover:bg-gray-100 transition-colors ${getHeaderBg()}`}
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-500 text-sm">{isExpanded ? '▼' : '▶'}</span>
          <span className="font-medium text-sm">{group.title}</span>
          {getStatusIcon()}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{fieldCounts.filled}/{fieldCounts.total}</span>
          {groupHasIssues && (
            <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">Needs Attention</span>
          )}
        </div>
      </button>
      
      {isExpanded && (
        <div className="p-3 space-y-2 bg-white">
          <div className={`grid ${group.priority === 'critical' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'} gap-2`}>
            {group.fields
              .filter(field => field in fieldManifest || field in editedData)
              .map(field => (
                <EditableField
                  key={field}
                  field={field}
                  value={editedData[field]}
                  onChange={updateField}
                  validation={getFieldValidation(field)}
                  status={getFieldStatus(field)}
                  compact={compact}
                />
              ))}
          </div>
          
          {groupWarnings.length > 0 && (
            <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
              <div className="text-xs text-yellow-800">
                {groupWarnings.map((warning, idx) => (
                  <div key={idx}>⚠ {warning.message}</div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ===================================================================
// MAIN COMPONENT
// ===================================================================

export const GameEditorForm: React.FC<GameEditorFormProps> = ({
  editor,
  entities = [],
  venues = [],
  recurringGames = [],
  series = [],
  showAdvanced = false,
  showRecurringGameSelector = true,
  showSeriesSelector = false,
  compact = false,
}) => {
  const { 
    mode,
    validationStatus, 
    expandedGroups, 
    toggleGroup,
    getVisibleFieldGroups,
    editedData,
    updateField,
  } = editor;
  
  const visibleGroups = getVisibleFieldGroups();
  
  const displayGroups = useMemo(() => {
    if (showAdvanced) return visibleGroups;
    return visibleGroups.filter(g => g.priority !== 'optional');
  }, [visibleGroups, showAdvanced]);
  
  return (
    <div className="space-y-3">
      {/* Quick Stats Bar */}
      <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs">
        <div className="flex gap-4">
          <span className={validationStatus.required.present === validationStatus.required.total ? "text-green-600" : "text-amber-600"}>
            ✔ {validationStatus.required.present}/{validationStatus.required.total} Required
          </span>
          <span className="text-gray-600">
            ○ {validationStatus.optional.present}/{validationStatus.optional.total} Optional
          </span>
        </div>
        <div className="flex gap-2">
          {validationStatus.warnings.length > 0 && (
            <span className="text-yellow-600">⚠ {validationStatus.warnings.length} Warning{validationStatus.warnings.length !== 1 ? 's' : ''}</span>
          )}
          {validationStatus.errors.length > 0 && (
            <span className="text-red-600">✗ {validationStatus.errors.length} Error{validationStatus.errors.length !== 1 ? 's' : ''}</span>
          )}
        </div>
      </div>
      
      {/* Critical Errors */}
      {validationStatus.errors.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-sm font-semibold text-red-800 mb-1">⚠ Errors</div>
          <ul className="text-xs text-red-700 space-y-1">
            {validationStatus.errors.map((error, idx) => (
              <li key={idx}>• {error.message}</li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Entity & Venue (for create/edit modes) */}
      {(mode === 'create' || mode === 'edit') && (entities.length > 0 || venues.length > 0) && (
        <div className="border border-blue-300 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-blue-50 font-medium text-sm text-blue-800">🏢 Entity & Venue</div>
          <div className="p-3 bg-white">
            <EntityVenueSelector editor={editor} entities={entities} venues={venues} compact={compact} />
          </div>
        </div>
      )}
      
      {/* Field Groups */}
      {displayGroups
        .filter(group => group.id !== 'entity-venue')
        .map((group) => (
          <FieldGroup
            key={group.id}
            group={group}
            editor={editor}
            isExpanded={expandedGroups.has(group.id)}
            onToggle={() => toggleGroup(group.id)}
            compact={compact}
          />
        ))}
      
      {/* Recurring Game Selector */}
      {showRecurringGameSelector && recurringGames.length > 0 && (
        <div className="border border-purple-300 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-purple-50 font-medium text-sm text-purple-800">🔄 Link to Recurring Game</div>
          <div className="p-3 bg-white">
            <RecurringGameSelector editor={editor} recurringGames={recurringGames} compact={compact} />
          </div>
        </div>
      )}
      
      {/* Series Selector */}
      {showSeriesSelector && series.length > 0 && editedData.isSeries && (
        <div className="border border-indigo-300 rounded-lg overflow-hidden">
          <div className="px-3 py-2 bg-indigo-50 font-medium text-sm text-indigo-800">📚 Series</div>
          <div className="p-3 bg-white">
            <select
              value={editedData.tournamentSeriesId || ''}
              onChange={(e) => updateField('tournamentSeriesId', e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md"
            >
              <option value="">-- Select Series --</option>
              {series.map(s => (
                <option key={s.id} value={s.id}>{s.name} {s.year ? `(${s.year})` : ''}</option>
              ))}
            </select>
          </div>
        </div>
      )}
      
      {/* Mode indicator */}
      <div className="text-xs text-gray-400 text-center pt-2">
        {mode === 'create' && '📝 Creating new game'}
        {mode === 'edit' && '✏️ Editing existing game'}
        {mode === 'confirm' && '✅ Confirming scraped game'}
      </div>
    </div>
  );
};

export default GameEditorForm;