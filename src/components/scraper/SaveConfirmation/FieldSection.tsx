// src/components/scraper/SaveConfirmation/FieldSection.tsx
// Reusable collapsible section for grouping fields

import React, { useState, useMemo } from 'react';
import type { GameData } from '../../../types/game';
import type { UseGameDataEditorReturn } from '../../../hooks/useGameDataEditor';
import { EditableField } from './EditableField';
import { fieldManifest } from '../../../lib/fieldManifest';

// ===================================================================
// TYPES
// ===================================================================

export interface FieldSectionConfig {
  id: string;
  title: string;
  icon?: string;
  fields: (keyof GameData)[];
  defaultExpanded?: boolean;
  showWhen?: (data: GameData) => boolean;
  readOnly?: boolean;
  columns?: 1 | 2;
  description?: string;
}

interface FieldSectionProps {
  config: FieldSectionConfig;
  editor: UseGameDataEditorReturn;
  forceExpanded?: boolean;
}

// ===================================================================
// COMPONENT
// ===================================================================

export const FieldSection: React.FC<FieldSectionProps> = ({
  config,
  editor,
  forceExpanded,
}) => {
  const { editedData, updateField, getFieldStatus, getFieldValidation, validationStatus } = editor;
  const [isExpanded, setIsExpanded] = useState(config.defaultExpanded ?? false);
  
  const expanded = forceExpanded ?? isExpanded;
  
  // Filter fields that exist in manifest or data
  const visibleFields = useMemo(() => {
    return config.fields.filter(field => 
      field in fieldManifest || field in editedData
    );
  }, [config.fields, editedData]);
  
  // Check if section should be shown
  const shouldShow = useMemo(() => {
    if (!config.showWhen) return true;
    return config.showWhen(editedData);
  }, [config.showWhen, editedData]);
  
  // Calculate section stats
  const sectionStats = useMemo(() => {
    let filled = 0;
    let hasIssues = false;
    
    for (const field of visibleFields) {
      const value = editedData[field];
      if (value !== undefined && value !== null && value !== '') {
        filled++;
      }
      
      const validation = getFieldValidation(field);
      if (!validation.valid) {
        hasIssues = true;
      }
      
      if (validationStatus.criticalMissing.includes(field as string)) {
        hasIssues = true;
      }
    }
    
    return {
      filled,
      total: visibleFields.length,
      hasIssues,
    };
  }, [visibleFields, editedData, getFieldValidation, validationStatus.criticalMissing]);
  
  // Get status icon
  const getStatusIcon = () => {
    if (sectionStats.hasIssues) {
      return <span className="text-red-500">⚠</span>;
    }
    if (sectionStats.filled === sectionStats.total && sectionStats.total > 0) {
      return <span className="text-green-500">✔</span>;
    }
    if (sectionStats.filled > 0) {
      return <span className="text-blue-500">◐</span>;
    }
    return <span className="text-gray-400">○</span>;
  };
  
  // Get section style based on status
  const getSectionStyle = () => {
    if (sectionStats.hasIssues) {
      return 'border-red-300 bg-red-50/50';
    }
    return 'border-gray-200';
  };
  
  if (!shouldShow || visibleFields.length === 0) {
    return null;
  }
  
  return (
    <div className={`border rounded-lg overflow-hidden ${getSectionStyle()}`}>
      {/* Header */}
      <button
        type="button"
        onClick={() => setIsExpanded(!expanded)}
        className={`w-full px-4 py-3 flex items-center justify-between text-left transition-colors ${
          sectionStats.hasIssues ? 'bg-red-50 hover:bg-red-100' : 'bg-gray-50 hover:bg-gray-100'
        }`}
      >
        <div className="flex items-center gap-3">
          <span className="text-gray-500 text-sm transition-transform duration-200" 
                style={{ transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            ▶
          </span>
          {config.icon && <span>{config.icon}</span>}
          <span className="font-medium text-sm text-gray-800">{config.title}</span>
          {getStatusIcon()}
        </div>
        
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {sectionStats.filled}/{sectionStats.total}
          </span>
          {sectionStats.hasIssues && (
            <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">
              Issues
            </span>
          )}
        </div>
      </button>
      
      {/* Content */}
      {expanded && (
        <div className="p-4 bg-white">
          {config.description && (
            <p className="text-xs text-gray-500 mb-3">{config.description}</p>
          )}
          
          <div className={`grid gap-2 ${config.columns === 1 ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'}`}>
            {visibleFields.map(field => (
              <EditableField
                key={field}
                field={field}
                value={editedData[field]}
                onChange={config.readOnly ? () => {} : updateField}
                validation={getFieldValidation(field)}
                status={getFieldStatus(field)}
                compact={true}
              />
            ))}
          </div>
          
          {/* Section-specific warnings */}
          {validationStatus.warnings.filter(w => 
            visibleFields.some(f => w.field === f || w.message?.toLowerCase().includes(String(f).toLowerCase()))
          ).length > 0 && (
            <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
              {validationStatus.warnings
                .filter(w => visibleFields.some(f => 
                  w.field === f || w.message?.toLowerCase().includes(String(f).toLowerCase())
                ))
                .map((warning, idx) => (
                  <div key={idx}>⚠ {warning.message}</div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ===================================================================
// PRESET CONFIGURATIONS
// ===================================================================

export const FIELD_SECTIONS: FieldSectionConfig[] = [
  {
    id: 'identity',
    title: 'Game Identity',
    icon: '🎯',
    fields: ['name', 'gameType', 'gameVariant', 'tournamentType', 'structureLabel'],
    defaultExpanded: true,
    columns: 1,
  },
  {
    id: 'status',
    title: 'Status',
    icon: '📊',
    fields: ['gameStatus', 'registrationStatus'],
    defaultExpanded: true,
    columns: 2,
  },
  {
    id: 'schedule',
    title: 'Schedule',
    icon: '📅',
    fields: ['gameStartDateTime', 'gameEndDateTime', 'gameFrequency'],
    defaultExpanded: true,
    columns: 2,
  },
  {
    id: 'financials',
    title: 'Buy-In & Costs',
    icon: '💰',
    fields: ['buyIn', 'rake', 'venueFee', 'startingStack'],
    defaultExpanded: true,
    columns: 2,
  },
  {
    id: 'guarantee',
    title: 'Guarantee',
    icon: '🎁',
    fields: ['hasGuarantee', 'guaranteeAmount'],
    defaultExpanded: false,
    showWhen: (data) => data.hasGuarantee === true || (data.guaranteeAmount ?? 0) > 0,
    columns: 2,
  },
  {
    id: 'entries',
    title: 'Entries & Players',
    icon: '👥',
    fields: ['totalUniquePlayers', 'totalInitialEntries', 'totalEntries', 'totalRebuys', 'totalAddons'],
    defaultExpanded: false,
    columns: 2,
  },
  {
    id: 'prizepool',
    title: 'Prizepool',
    icon: '🏆',
    fields: ['prizepoolPaid', 'prizepoolCalculated'],
    defaultExpanded: false,
    columns: 2,
  },
  {
    id: 'liveStats',
    title: 'Live Game Stats',
    icon: '📺',
    fields: ['playersRemaining', 'totalChipsInPlay', 'averagePlayerStack'],
    defaultExpanded: false,
    showWhen: (data) => data.gameStatus === 'RUNNING',
    columns: 2,
  },
  {
    id: 'calculated',
    title: 'Calculated Financials',
    icon: '💼',
    fields: [
      'totalBuyInsCollected',
      'rakeRevenue',
      'prizepoolPlayerContributions',
      'prizepoolAddedValue',
      'prizepoolSurplus',
      'guaranteeOverlayCost',
      'gameProfit',
    ],
    defaultExpanded: false,
    readOnly: true,
    columns: 2,
    description: 'These fields are auto-calculated based on other data.',
  },
  {
    id: 'classification',
    title: 'Classification',
    icon: '🏷️',
    fields: ['isRegular', 'isSatellite', 'isSeries'],
    defaultExpanded: false,
    columns: 2,
  },
  {
    id: 'system',
    title: 'System Fields',
    icon: '🔧',
    fields: ['tournamentId', 'doNotScrape', 's3Key'],
    defaultExpanded: false,
    columns: 1,
  },
];

export default FieldSection;
