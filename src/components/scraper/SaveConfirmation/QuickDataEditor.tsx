// src/components/scraper/SaveConfirmation/QuickDataEditor.tsx
// COMPLETE: Integrated Recurring Game and Series Editors
// UPDATED: Simplified financial metrics (removed rakeSubsidy complexity)

import React, { useState, useMemo } from 'react';
import type { GameData } from '../../../types/game';
import { EditableField } from './EditableField';
import { fieldManifest } from '../../../lib/fieldManifest';
import type { UseGameDataEditorReturn } from '../../../hooks/useGameDataEditor';

// Import sub-editors
import { RecurringGameEditor } from './RecurringGameEditor';
import SeriesDetailsEditor from './SeriesDetailsEditor';

// Import Types
import type { TournamentSeries, TournamentSeriesTitle } from '../../../types/series';

interface QuickDataEditorProps {
    editor: UseGameDataEditorReturn;
    showAdvanced?: boolean;
    // Data sources for sub-editors
    recurringGames?: any[]; // Replace 'any' with RecurringGame API type if available
    series?: TournamentSeries[];
    seriesTitles?: TournamentSeriesTitle[];
}

interface FieldGroup {
    title: string;
    fields: (keyof GameData)[];
    priority: 'critical' | 'important' | 'standard' | 'optional';
    defaultOpen: boolean;
}

export const QuickDataEditor: React.FC<QuickDataEditorProps> = ({ 
    editor, 
    showAdvanced = false,
    recurringGames = [],
    series = [],
    seriesTitles = []
}) => {
    const { 
        editedData, 
        updateField, 
        validationStatus, 
        getFieldStatus, 
        getFieldValidation 
    } = editor;
    
    const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
    
    // Define field groups with priority
    const fieldGroups = useMemo((): FieldGroup[] => {
        const groups: FieldGroup[] = [
            {
                title: '🔴 Critical Fields',
                fields: ['name', 'gameStatus', 'registrationStatus', 'tournamentId', 'entityId', 'venueId'],
                priority: 'critical',
                defaultOpen: true
            },
            {
                title: '📅 Date & Time',
                fields: ['gameStartDateTime', 'gameEndDateTime'],
                priority: 'important',
                defaultOpen: true
            },
            {
                title: '💰 Buy-In & Costs',
                fields: ['buyIn', 'rake', 'prizepoolPaid', 'prizepoolCalculated', 'totalUniquePlayers', 'totalInitialEntries', 'totalEntries', 'guaranteeAmount', 'hasGuarantee'],
                priority: 'important',
                defaultOpen: true
            },
            // === NEW: Recurring Game Group ===
            {
                title: '🔄 Recurring Game',
                fields: ['recurringGameId', 'recurringGameAssignmentStatus', 'deviationNotes'],
                priority: 'important',
                defaultOpen: !!editedData.recurringGameId // Open if assigned
            },
            {
                title: '🎮 Game Details',
                fields: ['gameVariant', 'gameType', 'tournamentType', 'startingStack', 'gameFrequency'],
                priority: 'standard',
                defaultOpen: false
            },
            {
                title: '🎯 Series Details',
                fields: ['isSeries', 'seriesName', 'tournamentSeriesId', 'isMainEvent', 'eventNumber', 'dayNumber', 'flightLetter', 'finalDay'],
                priority: 'standard',
                defaultOpen: false
            },
            {
                title: '📊 Statistics',
                fields: ['totalRebuys', 'totalAddons', 'playersRemaining', 'totalChipsInPlay', 'averagePlayerStack'],
                priority: 'standard',
                defaultOpen: false
            },
            {
                title: '🏷️ Classification',
                fields: ['isSeries', 'isRegular', 'isSatellite', 'seriesName', 'structureLabel'],
                priority: 'optional',
                defaultOpen: false
            },
            {
                // Simplified financial metrics
                title: '💼 Revenue & Finance',
                fields: [
                    'totalBuyInsCollected', 
                    'rakeRevenue',
                    'prizepoolPlayerContributions',
                    'prizepoolAddedValue',
                    'prizepoolSurplus',
                    'guaranteeOverlayCost', 
                    'gameProfit'
                ],
                priority: 'optional',
                defaultOpen: false
            },
            {
                title: '🔧 System Fields',
                fields: ['doNotScrape', 'foundKeys', 's3Key'],
                priority: 'optional',
                defaultOpen: false
            }
        ];
        
        if (!showAdvanced) {
            return groups.filter(g => g.priority !== 'optional');
        }
        
        return groups;
    }, [showAdvanced, editedData.recurringGameId]);
    
    const fieldsWithIssues = useMemo(() => {
        const issues = new Set<keyof GameData>();
        
        validationStatus.criticalMissing.forEach(field => {
            issues.add(field as keyof GameData);
        });
        
        validationStatus.required.missing.forEach(field => {
            issues.add(field as keyof GameData);
        });
        
        for (const field in editedData) {
            const validation = getFieldValidation(field as keyof GameData);
            if (!validation.valid) {
                issues.add(field as keyof GameData);
            }
        }
        
        return issues;
    }, [validationStatus, editedData, getFieldValidation]);
    
    const toggleGroup = (groupTitle: string) => {
        setExpandedGroups(prev => {
            const newSet = new Set(prev);
            if (newSet.has(groupTitle)) {
                newSet.delete(groupTitle);
            } else {
                newSet.add(groupTitle);
            }
            return newSet;
        });
    };
    
    const groupHasIssues = (fields: (keyof GameData)[]) => {
        return fields.some(field => fieldsWithIssues.has(field));
    };
    
    const getGroupStatusIcon = (group: FieldGroup) => {
        const hasIssues = groupHasIssues(group.fields);
        const hasData = group.fields.some(field => {
            const value = editedData[field];
            return value !== undefined && value !== null && value !== '';
        });
        
        if (hasIssues) {
            return <span className="text-red-500">⚠</span>;
        } else if (hasData) {
            return <span className="text-green-500">✔</span>;
        } else {
            return <span className="text-gray-400">○</span>;
        }
    };
    
    const getGroupFieldCount = (fields: (keyof GameData)[]) => {
        const total = fields.length;
        const filled = fields.filter(field => {
            const value = editedData[field];
            return value !== undefined && value !== null && value !== '';
        }).length;
        return { filled, total };
    };
    
    return (
        <div className="space-y-3">
            {/* Quick Stats Bar */}
            <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg text-xs">
                <div className="flex gap-4">
                    <span className="text-green-600">
                        ✔ {validationStatus.required.present}/{validationStatus.required.total} Required
                    </span>
                    <span className="text-gray-600">
                        ○ {validationStatus.optional.present}/{validationStatus.optional.total} Optional
                    </span>
                </div>
                {validationStatus.warnings.length > 0 && (
                    <span className="text-yellow-600">
                        ⚠ {validationStatus.warnings.length} Warnings
                    </span>
                )}
            </div>
            
            {/* Priority Issues Alert */}
            {fieldsWithIssues.size > 0 && (
                <div className="p-2 bg-red-50 border border-red-200 rounded-lg">
                    <div className="text-sm font-semibold text-red-800 mb-1">
                        ⚠ {fieldsWithIssues.size} Field{fieldsWithIssues.size > 1 ? 's' : ''} Need Attention
                    </div>
                    <div className="flex flex-wrap gap-1">
                        {Array.from(fieldsWithIssues).slice(0, 5).map(field => {
                            const definition = fieldManifest[field as string];
                            return (
                                <span 
                                    key={field} 
                                    className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs"
                                >
                                    {definition?.label || field}
                                </span>
                            );
                        })}
                        {fieldsWithIssues.size > 5 && (
                            <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs">
                                +{fieldsWithIssues.size - 5} more
                            </span>
                        )}
                    </div>
                </div>
            )}
            
            {/* Field Groups */}
            {fieldGroups.map((group) => {
                const isExpanded = group.defaultOpen || expandedGroups.has(group.title);
                const { filled, total } = getGroupFieldCount(group.fields);
                const hasIssues = groupHasIssues(group.fields);
                
                return (
                    <div 
                        key={group.title}
                        className={`border rounded-lg overflow-hidden ${
                            hasIssues ? 'border-red-300' :
                            group.priority === 'critical' ? 'border-blue-300' :
                            'border-gray-200'
                        }`}
                    >
                        <button
                            onClick={() => toggleGroup(group.title)}
                            className={`w-full px-3 py-2 flex items-center justify-between text-left hover:bg-gray-50 ${
                                hasIssues ? 'bg-red-50' :
                                group.priority === 'critical' ? 'bg-blue-50' :
                                'bg-gray-50'
                            }`}
                        >
                            <div className="flex items-center gap-2">
                                <span className="text-gray-500 text-sm">
                                    {isExpanded ? '▼' : '▶'}
                                </span>
                                <span className="font-medium text-sm">{group.title}</span>
                                {getGroupStatusIcon(group)}
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-gray-500">
                                    {filled}/{total} fields
                                </span>
                                {hasIssues && (
                                    <span className="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded">
                                        Has Issues
                                    </span>
                                )}
                            </div>
                        </button>
                        
                        {isExpanded && (
                            <div className="p-3 space-y-2 bg-white">
                                <div className={`grid ${group.priority === 'critical' ? 'grid-cols-1' : 'grid-cols-2'} gap-2`}>
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
                                                compact={true}
                                            />
                                        ))}
                                </div>
                                
                                {validationStatus.warnings.some(w => 
                                    group.fields.some(f => w.field === f || w.message?.toLowerCase().includes(f.toLowerCase()))
                                ) && (
                                    <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                                        <div className="text-xs text-yellow-800">
                                            {validationStatus.warnings
                                                .filter(w => group.fields.some(f => 
                                                    w.message?.toLowerCase().includes(f.toLowerCase())
                                                ))
                                                .map((warning, idx) => (
                                                    <div key={idx}>⚠ {warning.message}</div>
                                                ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                );
            })}

            {/* === ADVANCED EDITORS (Recurring & Series) === */}
            {showAdvanced && (
                <>
                    {/* Recurring Game Editor */}
                    <RecurringGameEditor 
                        editor={editor}
                        availableRecurringGames={recurringGames}
                        venueId={editor.editedData.venueId || undefined}
                    />

                    {/* Series Editor */}
                    <SeriesDetailsEditor
                        editor={editor}
                        series={series}
                        seriesTitles={seriesTitles}
                        venueId={editor.editedData.venueId || undefined}
                    />
                </>
            )}
            
            {/* Complex Data Fields */}
            {showAdvanced && (
                <div className="border border-purple-300 rounded-lg overflow-hidden">
                    <div className="px-3 py-2 bg-purple-50 font-medium text-sm text-purple-800">
                        📋 Complex Data Fields
                    </div>
                    <div className="p-3 space-y-2 bg-white">
                        {['levels', 'results', 'entries', 'seating', 'tables', 'breaks'].map(field => {
                            const value = editedData[field as keyof GameData];
                            const hasData = Array.isArray(value) && value.length > 0;
                            
                            return (
                                <div 
                                    key={field}
                                    className="flex items-center justify-between p-2 border rounded bg-gray-50"
                                >
                                    <span className="text-sm font-medium capitalize">{field}</span>
                                    <span className="text-sm text-gray-600">
                                        {hasData ? `${(value as any[]).length} items` : 'Empty'}
                                    </span>
                                </div>
                            );
                        })}
                        <div className="text-xs text-gray-500 italic mt-2">
                            * Complex fields can be edited in the advanced editor
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};