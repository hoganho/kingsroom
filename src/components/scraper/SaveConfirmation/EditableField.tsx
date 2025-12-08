// src/components/scraper/SaveConfirmation/EditableField.tsx
// UPDATED: Simplified financial metrics (removed rakeSubsidy complexity)

import { useState, useEffect, useRef } from 'react';
import type { GameData } from '../../../types/game';
import { fieldManifest } from '../../../lib/fieldManifest';

interface EditableFieldProps {
    field: keyof GameData;
    value: any;
    onChange: (field: keyof GameData, value: any) => void;
    validation?: { required: boolean; valid: boolean; message?: string };
    status?: 'present' | 'missing' | 'changed' | 'invalid';
    compact?: boolean;
}

// Get the appropriate input type for a field
const getFieldInputType = (field: keyof GameData): string => {
    const fieldTypes: Partial<Record<keyof GameData, string>> = {
        buyIn: 'number',
        rake: 'number',
        venueFee: 'number',
        prizepoolPaid: 'number',
        prizepoolCalculated: 'number',
        totalUniquePlayers: 'number',
        totalInitialEntries: 'number',
        totalEntries: 'number',
        totalRebuys: 'number',
        totalAddons: 'number',
        startingStack: 'number',
        guaranteeAmount: 'number',
        playersRemaining: 'number',
        totalChipsInPlay: 'number',
        averagePlayerStack: 'number',
        tournamentId: 'number',
        eventNumber: 'number',
        dayNumber: 'number',
        gameStartDateTime: 'datetime-local',
        gameEndDateTime: 'datetime-local',
        hasGuarantee: 'checkbox',
        isSeries: 'checkbox',
        isRegular: 'checkbox',
        isSatellite: 'checkbox',
        isMainEvent: 'checkbox',
        finalDay: 'checkbox',
        doNotScrape: 'checkbox',
        gameStatus: 'select',
        registrationStatus: 'select',
        gameVariant: 'select',
        gameType: 'select',
        gameFrequency: 'select',
        tournamentType: 'select'
    };
    
    return fieldTypes[field] || 'text';
};

// Get select options for enum fields
const getSelectOptions = (field: keyof GameData): string[] => {
    const options: Partial<Record<keyof GameData, string[]>> = {
        gameStatus: ['SCHEDULED', 'INITIATING', 'REGISTERING', 'RUNNING', 'CLOCK_STOPPED', 'FINISHED', 'CANCELLED', 'NOT_IN_USE', 'NOT_PUBLISHED'],
        registrationStatus: ['SCHEDULED', 'OPEN', 'FINAL', 'CLOSED', 'N_A'],
        gameVariant: ['NLHE', 'PLO', 'PLOM', 'PLO5', 'PLO6'],
        gameType: ['TOURNAMENT', 'CASH_GAME'],
        gameFrequency: ['DAILY', 'WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'UNKNOWN'],
        tournamentType: ['FREEZEOUT', 'REBUY', 'SATELLITE', 'DEEPSTACK']
    };
    
    return options[field] || [];
};

// Format display value for better readability
const formatDisplayValue = (value: any, field: keyof GameData): string => {
    if (value === null || value === undefined || value === '') return '—';
    
    // Handle arrays
    if (Array.isArray(value)) {
        if (value.length === 0) return '[]';
        if (field === 'levels') return `${value.length} levels`;
        if (field === 'results') return `${value.length} results`;
        if (field === 'entries') return `${value.length} entries`;
        if (field === 'seating') return `${value.length} seats`;
        if (field === 'tables') return `${value.length} tables`;
        if (field === 'breaks') return `${value.length} breaks`;
        return `[${value.length} items]`;
    }
    
    // Handle booleans
    if (typeof value === 'boolean') {
        return value ? '✔' : '✗';
    }
    
    // Handle numbers with formatting
    if (typeof value === 'number') {
        // Currency fields (simplified financial metrics)
        if (field === 'buyIn' || field === 'rake' || field === 'venueFee' || 
            field === 'prizepoolPaid' || field === 'prizepoolCalculated' || field === 'guaranteeAmount' || 
            field === 'totalBuyInsCollected' || field === 'rakeRevenue' ||
            field === 'prizepoolPlayerContributions' || field === 'prizepoolAddedValue' ||
            field === 'prizepoolSurplus' || field === 'guaranteeOverlayCost' ||
            field === 'gameProfit') {
            return `$${value.toLocaleString()}`;
        }
        return value.toLocaleString();
    }
    
    // Handle dates
    if (field === 'gameStartDateTime' || field === 'gameEndDateTime') {
        try {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                return date.toLocaleString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    hour: '2-digit', 
                    minute: '2-digit' 
                });
            }
        } catch {
            // Fall through to default
        }
    }
    
    // Handle objects
    if (typeof value === 'object' && value !== null) {
        return '{...}';
    }
    
    // Default string display
    return String(value);
};

export const EditableField: React.FC<EditableFieldProps> = ({
    field,
    value,
    onChange,
    validation,
    status,
    compact = false
}) => {
    const [isEditing, setIsEditing] = useState(false);
    const [localValue, setLocalValue] = useState(value);
    const inputRef = useRef<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(null);
    
    const definition = fieldManifest[field as string];
    const inputType = getFieldInputType(field);
    
    useEffect(() => {
        setLocalValue(value);
    }, [value]);
    
    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus();
            if ('select' in inputRef.current) {
                inputRef.current.select();
            }
        }
    }, [isEditing]);
    
    const handleSave = () => {
        let finalValue = localValue;
        
        if (inputType === 'number') {
            finalValue = localValue === '' ? null : Number(localValue);
        } else if (inputType === 'checkbox') {
            finalValue = localValue;
        } else if (localValue === '') {
            finalValue = null;
        }
        
        onChange(field, finalValue);
        setIsEditing(false);
    };
    
    const handleCancel = () => {
        setLocalValue(value);
        setIsEditing(false);
    };
    
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSave();
        } else if (e.key === 'Escape') {
            handleCancel();
        }
    };
    
    const getFieldStyle = () => {
        const base = "transition-colors duration-150";
        
        if (!validation?.valid) {
            return `${base} bg-red-50 border-red-300`;
        }
        
        switch (status) {
            case 'missing':
                return validation?.required 
                    ? `${base} bg-red-50 border-red-300` 
                    : `${base} bg-gray-50 border-gray-200`;
            case 'changed':
                return `${base} bg-blue-50 border-blue-300`;
            case 'present':
            default:
                return `${base} bg-white border-gray-200`;
        }
    };
    
    const getStatusIcon = () => {
        if (!validation?.valid) return <span className="text-red-500">⚠</span>;
        
        switch (status) {
            case 'missing':
                return validation?.required 
                    ? <span className="text-red-500">✗</span> 
                    : <span className="text-gray-400">○</span>;
            case 'changed':
                return <span className="text-blue-500">✎</span>;
            case 'present':
                return <span className="text-green-500">✔</span>;
            default:
                return null;
        }
    };
    
    const renderInput = () => {
        if (inputType === 'checkbox') {
            return (
                <input
                    ref={inputRef as React.RefObject<HTMLInputElement>}
                    type="checkbox"
                    checked={!!localValue}
                    onChange={(e) => setLocalValue(e.target.checked)}
                    onBlur={handleSave}
                    className="h-4 w-4"
                />
            );
        }
        
        if (inputType === 'select') {
            const options = getSelectOptions(field);
            return (
                <select
                    ref={inputRef as React.RefObject<HTMLSelectElement>}
                    value={localValue || ''}
                    onChange={(e) => setLocalValue(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                    className="w-full px-2 py-1 text-sm border rounded"
                >
                    <option value="">-- Select --</option>
                    {options.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
            );
        }
        
        if (field === 'levels' || field === 'results' || field === 'entries' || 
            field === 'seating' || field === 'tables' || field === 'breaks') {
            return (
                <div className="text-xs text-gray-500 italic px-2 py-1">
                    Complex field - use advanced editor
                </div>
            );
        }
        
        return (
            <input
                ref={inputRef as React.RefObject<HTMLInputElement>}
                type={inputType === 'datetime-local' ? 'datetime-local' : inputType}
                value={localValue ?? ''}
                onChange={(e) => setLocalValue(e.target.value)}
                onBlur={handleSave}
                onKeyDown={handleKeyDown}
                className="w-full px-2 py-1 text-sm border rounded"
                step={inputType === 'number' ? 'any' : undefined}
            />
        );
    };
    
    if (compact) {
        return (
            <div className={`flex items-center gap-2 px-2 py-1 border rounded ${getFieldStyle()}`}>
                <div className="w-4">{getStatusIcon()}</div>
                <label className="text-xs font-medium text-gray-600 w-24 flex-shrink-0">
                    {definition?.label || field}:
                </label>
                {isEditing ? (
                    <div className="flex-1 flex gap-1">
                        {renderInput()}
                        <button
                            onClick={handleSave}
                            className="px-1 text-green-600 hover:bg-green-50 rounded"
                            title="Save"
                        >
                            ✔
                        </button>
                        <button
                            onClick={handleCancel}
                            className="px-1 text-red-600 hover:bg-red-50 rounded"
                            title="Cancel"
                        >
                            ✗
                        </button>
                    </div>
                ) : (
                    <div 
                        className="flex-1 cursor-pointer hover:bg-gray-50 px-2 py-0.5 rounded"
                        onClick={() => setIsEditing(true)}
                        title="Click to edit"
                    >
                        <span className="text-sm">
                            {formatDisplayValue(value, field)}
                        </span>
                    </div>
                )}
                {validation?.message && (
                    <span className="text-xs text-red-500" title={validation.message}>
                        ⚠
                    </span>
                )}
            </div>
        );
    }
    
    // Full mode (non-compact)
    return (
        <div className={`border rounded-lg p-3 ${getFieldStyle()}`}>
            <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                    {getStatusIcon()}
                    <label className="text-sm font-semibold text-gray-700">
                        {definition?.label || field}
                        {validation?.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                </div>
                {definition?.group && (
                    <span className="text-xs text-gray-500">{definition.group}</span>
                )}
            </div>
            
            {isEditing ? (
                <div>
                    {renderInput()}
                    <div className="flex gap-2 mt-2">
                        <button
                            onClick={handleSave}
                            className="px-3 py-1 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                        >
                            Save
                        </button>
                        <button
                            onClick={handleCancel}
                            className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            ) : (
                <div 
                    className="cursor-pointer hover:bg-gray-50 p-2 rounded"
                    onClick={() => setIsEditing(true)}
                >
                    <div className="text-sm font-mono">
                        {formatDisplayValue(value, field)}
                    </div>
                </div>
            )}
            
            {validation?.message && (
                <div className="mt-2 text-xs text-red-600">
                    {validation.message}
                </div>
            )}
        </div>
    );
};