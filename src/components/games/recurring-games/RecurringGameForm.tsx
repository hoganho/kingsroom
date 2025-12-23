// src/components/games/recurring-games/RecurringGameForm.tsx
// ENHANCED: Added day/name consistency validation and duplicate warnings
import React, { useState, useEffect, useMemo } from 'react';
import { XMarkIcon, ChevronDownIcon, ChevronUpIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';
import { GameVariant, GameType, GameFrequency } from '../../../API';
import { 
    checkForDuplicates,
    type DuplicateCheckResult 
} from '../../../services/recurringGameService';

// Types matching your Schema
interface RecurringGameFormData {
    name: string;
    displayName: string;
    description: string;
    aliases: string[];
    entityId: string;
    venueId: string;
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    frequency: GameFrequency;
    gameType: GameType;
    gameVariant: GameVariant;
    typicalBuyIn: number;
    typicalRake: number;
    typicalStartingStack: number;
    typicalGuarantee: number;
    isActive: boolean;
    isPaused: boolean;
    pausedReason: string;
    isSignature: boolean;
    isBeginnerFriendly: boolean;
    isBounty: boolean;
    tags: string[];
    marketingDescription: string;
    imageUrl: string;
    socialMediaHashtags: string[];
    notes: string;
    adminNotes: string;
}

interface Venue {
    id: string;
    name: string;
    entityId?: string;
}

interface Entity {
    id: string;
    entityName: string;
}

interface RecurringGameFormProps {
    isOpen: boolean;
    onClose: () => void;
    onSubmit: (data: RecurringGameFormData) => Promise<void>;
    initialData?: Partial<RecurringGameFormData>;
    venues: Venue[];
    entities: Entity[];
    currentEntityId?: string;
    isSubmitting: boolean;
}

const DEFAULT_FORM: RecurringGameFormData = {
    name: '',
    displayName: '',
    description: '',
    aliases: [],
    entityId: '',
    venueId: '',
    dayOfWeek: '', // Changed from 'MONDAY' to empty - force user to select
    startTime: '19:00',
    endTime: '',
    frequency: GameFrequency.WEEKLY,
    gameType: GameType.TOURNAMENT,
    gameVariant: GameVariant.NLHE,
    typicalBuyIn: 0,
    typicalRake: 0,
    typicalStartingStack: 10000,
    typicalGuarantee: 0,
    isActive: true,
    isPaused: false,
    pausedReason: '',
    isSignature: false,
    isBeginnerFriendly: false,
    isBounty: false,
    tags: [],
    marketingDescription: '',
    imageUrl: '',
    socialMediaHashtags: [],
    notes: '',
    adminNotes: ''
};

const DAYS_OF_WEEK = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

// Day keywords for extraction (duplicated here for client-side validation)
const DAY_KEYWORDS: Record<string, string> = {
    'monday': 'MONDAY', 'mon': 'MONDAY',
    'tuesday': 'TUESDAY', 'tue': 'TUESDAY', 'tues': 'TUESDAY',
    'wednesday': 'WEDNESDAY', 'wed': 'WEDNESDAY',
    'thursday': 'THURSDAY', 'thu': 'THURSDAY', 'thur': 'THURSDAY', 'thurs': 'THURSDAY',
    'friday': 'FRIDAY', 'fri': 'FRIDAY',
    'saturday': 'SATURDAY', 'sat': 'SATURDAY',
    'sunday': 'SUNDAY', 'sun': 'SUNDAY',
};

// Client-side day extraction
const extractDayFromNameLocal = (name: string): string | null => {
    if (!name) return null;
    const lower = name.toLowerCase();
    for (const [keyword, day] of Object.entries(DAY_KEYWORDS)) {
        const regex = new RegExp(`\\b${keyword}\\b`, 'i');
        if (regex.test(lower)) return day;
    }
    return null;
};

// Collapsible Section Component
const CollapsibleSection: React.FC<{
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}> = ({ title, defaultOpen = false, children }) => {
    const [isOpen, setIsOpen] = useState(defaultOpen);
    
    return (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
            >
                <span className="text-sm font-medium text-gray-700">{title}</span>
                {isOpen ? (
                    <ChevronUpIcon className="h-4 w-4 text-gray-500" />
                ) : (
                    <ChevronDownIcon className="h-4 w-4 text-gray-500" />
                )}
            </button>
            {isOpen && (
                <div className="px-4 py-4 space-y-4 bg-white">
                    {children}
                </div>
            )}
        </div>
    );
};

// Warning Banner Component
const WarningBanner: React.FC<{ message: string; onDismiss?: () => void }> = ({ message, onDismiss }) => (
    <div className="rounded-md bg-yellow-50 p-4 border border-yellow-200">
        <div className="flex">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-400 flex-shrink-0" />
            <div className="ml-3 flex-1">
                <p className="text-sm text-yellow-700">{message}</p>
            </div>
            {onDismiss && (
                <button onClick={onDismiss} className="ml-3 text-yellow-500 hover:text-yellow-600">
                    <XMarkIcon className="h-5 w-5" />
                </button>
            )}
        </div>
    </div>
);

export const RecurringGameForm: React.FC<RecurringGameFormProps> = ({
    isOpen,
    onClose,
    onSubmit,
    initialData,
    venues,
    entities,
    currentEntityId,
    isSubmitting
}) => {
    const [formData, setFormData] = useState<RecurringGameFormData>(DEFAULT_FORM);
    const [aliasInput, setAliasInput] = useState('');
    
    // NEW: Validation state
    const [dayWarning, setDayWarning] = useState<string | null>(null);
    const [duplicateWarning, setDuplicateWarning] = useState<DuplicateCheckResult | null>(null);
    const [isCheckingDuplicates, setIsCheckingDuplicates] = useState(false);
    const [acknowledgedWarnings, setAcknowledgedWarnings] = useState(false);

    // Initialize form
    useEffect(() => {
        if (isOpen && initialData) {
            const safeInitialData = {
                ...initialData,
                aliases: initialData.aliases ?? [],
                tags: initialData.tags ?? [],
                socialMediaHashtags: initialData.socialMediaHashtags ?? [],
            };
            setFormData({ ...DEFAULT_FORM, ...safeInitialData });
            setDayWarning(null);
            setDuplicateWarning(null);
            setAcknowledgedWarnings(false);
        } else if (isOpen) {
            setFormData({ 
                ...DEFAULT_FORM, 
                entityId: currentEntityId || '' 
            });
            setDayWarning(null);
            setDuplicateWarning(null);
            setAcknowledgedWarnings(false);
        }
    }, [isOpen, initialData, currentEntityId]);

    // NEW: Auto-detect day from name and show warning if mismatch
    useEffect(() => {
        if (!formData.name) {
            setDayWarning(null);
            return;
        }
        
        const detectedDay = extractDayFromNameLocal(formData.name);
        
        if (detectedDay) {
            if (!formData.dayOfWeek) {
                // Auto-select the detected day
                setFormData(prev => ({ ...prev, dayOfWeek: detectedDay }));
                setDayWarning(null);
            } else if (detectedDay !== formData.dayOfWeek) {
                // Mismatch detected
                setDayWarning(
                    `The name "${formData.name}" suggests ${detectedDay}, but you selected ${formData.dayOfWeek}. ` +
                    `This may cause issues with game matching.`
                );
            } else {
                setDayWarning(null);
            }
        } else {
            setDayWarning(null);
        }
    }, [formData.name, formData.dayOfWeek]);

    // NEW: Check for duplicates when venue/name/variant changes
    useEffect(() => {
        const checkDuplicates = async () => {
            if (!formData.venueId || !formData.name || formData.name.length < 3) {
                setDuplicateWarning(null);
                return;
            }
            
            // Don't check duplicates when editing existing game
            if (initialData?.name === formData.name && initialData?.venueId === formData.venueId) {
                setDuplicateWarning(null);
                return;
            }
            
            setIsCheckingDuplicates(true);
            try {
                const result = await checkForDuplicates(
                    formData.venueId,
                    formData.name,
                    formData.dayOfWeek,
                    formData.gameVariant
                );
                setDuplicateWarning(result.hasDuplicate ? result : null);
            } catch (error) {
                console.error('Error checking duplicates:', error);
                setDuplicateWarning(null);
            } finally {
                setIsCheckingDuplicates(false);
            }
        };
        
        // Debounce the check
        const timeout = setTimeout(checkDuplicates, 500);
        return () => clearTimeout(timeout);
    }, [formData.venueId, formData.name, formData.dayOfWeek, formData.gameVariant, initialData]);

    // Filter venues based on selected entity
    const filteredVenues = useMemo(() => {
        if (!formData.entityId) return venues;
        return venues.filter(v => !v.entityId || v.entityId === formData.entityId);
    }, [venues, formData.entityId]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // Require acknowledgment if there are warnings
        if ((dayWarning || duplicateWarning) && !acknowledgedWarnings) {
            const confirmMessage = [
                dayWarning ? `Day mismatch: ${dayWarning}` : '',
                duplicateWarning?.suggestion || ''
            ].filter(Boolean).join('\n\n');
            
            if (!window.confirm(`Warning:\n\n${confirmMessage}\n\nDo you want to proceed anyway?`)) {
                return;
            }
            setAcknowledgedWarnings(true);
        }
        
        await onSubmit(formData);
    };

    const addToArray = (field: 'aliases' | 'tags' | 'socialMediaHashtags', value: string, clearInput: () => void) => {
        if (value.trim()) {
            setFormData(prev => ({
                ...prev,
                [field]: [...prev[field], value.trim()]
            }));
            clearInput();
        }
    };

    const removeFromArray = (field: 'aliases' | 'tags' | 'socialMediaHashtags', index: number) => {
        setFormData(prev => ({
            ...prev,
            [field]: prev[field].filter((_, i) => i !== index)
        }));
    };

    const inputClass = "mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm";
    const labelClass = "block text-sm font-medium text-gray-700";
    const checkboxLabelClass = "ml-2 block text-sm text-gray-900";

    const hasWarnings = dayWarning || duplicateWarning;

    return (
        <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="flex min-h-screen items-center justify-center p-4">
                <div className="fixed inset-0 bg-black bg-opacity-30" onClick={onClose} />
                
                <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                    {/* Header */}
                    <div className="flex justify-between items-center px-6 py-4 border-b border-gray-200 bg-gray-50">
                        <h3 className="text-lg font-medium text-gray-900">
                            {initialData ? 'Edit Recurring Game' : 'Create Recurring Game'}
                        </h3>
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-500">
                            <XMarkIcon className="h-6 w-6" />
                        </button>
                    </div>

                    {/* Scrollable Form Content */}
                    <div className="flex-1 overflow-y-auto p-6">
                        <form id="recurring-game-form" onSubmit={handleSubmit} className="space-y-6">
                            
                            {/* === WARNINGS === */}
                            {dayWarning && (
                                <WarningBanner 
                                    message={dayWarning} 
                                    onDismiss={() => setDayWarning(null)}
                                />
                            )}
                            
                            {duplicateWarning && (
                                <WarningBanner 
                                    message={duplicateWarning.suggestion || 'A similar recurring game may already exist.'}
                                />
                            )}
                            
                            {/* === CORE INFO (Always visible) === */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                                    Core Information
                                </h4>
                                
                                {/* Entity & Venue */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>Entity *</label>
                                        <select
                                            required
                                            value={formData.entityId}
                                            onChange={(e) => setFormData({ 
                                                ...formData, 
                                                entityId: e.target.value,
                                                venueId: ''
                                            })}
                                            className={inputClass}
                                        >
                                            <option value="">Select Entity</option>
                                            {entities.map(entity => (
                                                <option key={entity.id} value={entity.id}>
                                                    {entity.entityName}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Venue *</label>
                                        <select
                                            required
                                            value={formData.venueId}
                                            onChange={(e) => setFormData({ ...formData, venueId: e.target.value })}
                                            className={inputClass}
                                            disabled={!formData.entityId}
                                        >
                                            <option value="">Select Venue</option>
                                            {filteredVenues.map(venue => (
                                                <option key={venue.id} value={venue.id}>
                                                    {venue.name}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                
                                {/* Name with validation indicator */}
                                <div>
                                    <label className={labelClass}>
                                        Name *
                                        {isCheckingDuplicates && (
                                            <span className="ml-2 text-xs text-gray-400">Checking for duplicates...</span>
                                        )}
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className={`${inputClass} ${dayWarning || duplicateWarning ? 'border-yellow-400' : ''}`}
                                        placeholder="e.g. Friday Night NLHE, Tuesday Turbos"
                                    />
                                    <p className="mt-1 text-xs text-gray-500">
                                        Tip: Include the day of week in the name (e.g., "Friday Night Poker") for better matching.
                                    </p>
                                </div>

                                {/* Day & Time - Day is now REQUIRED and has visual indicator */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>
                                            Day of Week *
                                            {formData.dayOfWeek && extractDayFromNameLocal(formData.name) === formData.dayOfWeek && (
                                                <span className="ml-2 text-xs text-green-600">✓ Matches name</span>
                                            )}
                                        </label>
                                        <select
                                            required
                                            value={formData.dayOfWeek}
                                            onChange={(e) => {
                                                setFormData({ ...formData, dayOfWeek: e.target.value });
                                                setAcknowledgedWarnings(false);
                                            }}
                                            className={`${inputClass} ${dayWarning ? 'border-yellow-400 bg-yellow-50' : ''}`}
                                        >
                                            <option value="">Select Day</option>
                                            {DAYS_OF_WEEK.map(day => (
                                                <option key={day} value={day}>
                                                    {day.charAt(0) + day.slice(1).toLowerCase()}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Start Time</label>
                                        <input
                                            type="time"
                                            value={formData.startTime}
                                            onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                                            className={inputClass}
                                        />
                                    </div>
                                </div>

                                {/* Game Type & Variant */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>Game Type *</label>
                                        <select
                                            required
                                            value={formData.gameType}
                                            onChange={(e) => setFormData({ ...formData, gameType: e.target.value as GameType })}
                                            className={inputClass}
                                        >
                                            <option value="TOURNAMENT">Tournament</option>
                                            <option value="CASH_GAME">Cash Game</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Game Variant *</label>
                                        <select
                                            required
                                            value={formData.gameVariant}
                                            onChange={(e) => {
                                                setFormData({ ...formData, gameVariant: e.target.value as GameVariant });
                                                setAcknowledgedWarnings(false);
                                            }}
                                            className={inputClass}
                                        >
                                            <option value="NLHE">No Limit Hold'em</option>
                                            <option value="PLO">Pot Limit Omaha</option>
                                            <option value="PLOM">PLO Mixed (Hi/Lo)</option>
                                            <option value="LHE">Limit Hold'em</option>
                                            <option value="MIXED">Mixed Games</option>
                                            <option value="OTHER">Other</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Buy-in & Guarantee */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>Typical Buy-In ($)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            value={formData.typicalBuyIn}
                                            onChange={(e) => setFormData({ ...formData, typicalBuyIn: parseFloat(e.target.value) || 0 })}
                                            className={inputClass}
                                            placeholder="150"
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClass}>Typical Guarantee ($)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="100"
                                            value={formData.typicalGuarantee}
                                            onChange={(e) => setFormData({ ...formData, typicalGuarantee: parseFloat(e.target.value) || 0 })}
                                            className={inputClass}
                                            placeholder="5000"
                                        />
                                    </div>
                                </div>

                                {/* Signature Game Checkbox */}
                                <label className="flex items-center">
                                    <input
                                        type="checkbox"
                                        checked={formData.isSignature}
                                        onChange={(e) => setFormData({ ...formData, isSignature: e.target.checked })}
                                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                    />
                                    <span className={checkboxLabelClass}>Signature Event (featured game)</span>
                                </label>
                            </div>

                            {/* === ADDITIONAL SECTIONS (Collapsible) === */}
                            
                            <CollapsibleSection title="Display & Description" defaultOpen={false}>
                                <div>
                                    <label className={labelClass}>Display Name</label>
                                    <input
                                        type="text"
                                        value={formData.displayName}
                                        onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                                        className={inputClass}
                                        placeholder="Optional: Friendly display name"
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>Description</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        rows={3}
                                        className={inputClass}
                                        placeholder="Brief description of this recurring game"
                                    />
                                </div>
                            </CollapsibleSection>

                            <CollapsibleSection title="Aliases (for matching)" defaultOpen={false}>
                                <p className="text-xs text-gray-500 mb-2">
                                    Add alternative names that should match to this recurring game.
                                </p>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={aliasInput}
                                        onChange={(e) => setAliasInput(e.target.value)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                addToArray('aliases', aliasInput, () => setAliasInput(''));
                                            }
                                        }}
                                        className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                        placeholder="e.g. Friday Nite Poker"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => addToArray('aliases', aliasInput, () => setAliasInput(''))}
                                        className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
                                    >
                                        Add
                                    </button>
                                </div>
                                {(formData.aliases?.length ?? 0) > 0 && (
                                    <div className="flex flex-wrap gap-2 mt-2">
                                        {formData.aliases.map((alias, idx) => (
                                            <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm">
                                                {alias}
                                                <button
                                                    type="button"
                                                    onClick={() => removeFromArray('aliases', idx)}
                                                    className="text-gray-400 hover:text-gray-600"
                                                >
                                                    ×
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </CollapsibleSection>

                            <CollapsibleSection title="Notes" defaultOpen={false}>
                                <div>
                                    <label className={labelClass}>Internal Notes</label>
                                    <textarea
                                        value={formData.notes}
                                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                        rows={2}
                                        className={inputClass}
                                        placeholder="Notes visible to all staff"
                                    />
                                </div>
                                <div>
                                    <label className={labelClass}>Admin Notes</label>
                                    <textarea
                                        value={formData.adminNotes}
                                        onChange={(e) => setFormData({ ...formData, adminNotes: e.target.value })}
                                        rows={2}
                                        className={inputClass}
                                        placeholder="Notes for administrators only"
                                    />
                                </div>
                            </CollapsibleSection>

                        </form>
                    </div>

                    {/* Footer - Fixed at bottom */}
                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-between items-center">
                        <div className="text-sm text-gray-500">
                            {hasWarnings && !acknowledgedWarnings && (
                                <span className="text-yellow-600">
                                    ⚠️ Please review warnings above
                                </span>
                            )}
                        </div>
                        <div className="flex gap-3">
                            <button
                                type="button"
                                onClick={onClose}
                                disabled={isSubmitting}
                                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                form="recurring-game-form"
                                disabled={isSubmitting || (!formData.dayOfWeek)}
                                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                            >
                                {isSubmitting ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};