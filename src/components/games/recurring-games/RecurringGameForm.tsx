// src/components/games/recurring-games/RecurringGameForm.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { XMarkIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';
import { GameVariant, GameType, GameFrequency } from '../../../API';

// Types matching your Schema - expanded to include all available fields
interface RecurringGameFormData {
    // === IDENTIFICATION ===
    name: string;
    displayName: string;
    description: string;
    aliases: string[];
    
    // === RELATIONSHIPS ===
    entityId: string;
    venueId: string;
    
    // === SCHEDULE INFORMATION ===
    dayOfWeek: string;
    startTime: string;
    endTime: string;
    frequency: GameFrequency;
    
    // === GAME CHARACTERISTICS ===
    gameType: GameType;
    gameVariant: GameVariant;
    
    // Typical values
    typicalBuyIn: number;
    typicalRake: number;
    typicalStartingStack: number;
    typicalGuarantee: number;
    
    // === STATUS & TRACKING ===
    isActive: boolean;
    isPaused: boolean;
    pausedReason: string;
    
    // === CATEGORIZATION ===
    isSignature: boolean;
    isBeginnerFriendly: boolean;
    isBounty: boolean;
    tags: string[];
    
    // === MARKETING ===
    marketingDescription: string;
    imageUrl: string;
    socialMediaHashtags: string[];
    
    // === METADATA ===
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
    currentEntityId?: string; // Pre-selected entity from context
    isSubmitting: boolean;
}

const DEFAULT_FORM: RecurringGameFormData = {
    // Identification
    name: '',
    displayName: '',
    description: '',
    aliases: [],
    
    // Relationships
    entityId: '',
    venueId: '',
    
    // Schedule
    dayOfWeek: 'MONDAY',
    startTime: '19:00',
    endTime: '',
    frequency: GameFrequency.WEEKLY,
    
    // Game Characteristics
    gameType: GameType.TOURNAMENT,
    gameVariant: GameVariant.NLHE,
    typicalBuyIn: 0,
    typicalRake: 0,
    typicalStartingStack: 10000,
    typicalGuarantee: 0,
    
    // Status
    isActive: true,
    isPaused: false,
    pausedReason: '',
    
    // Categorization
    isSignature: false,
    isBeginnerFriendly: false,
    isBounty: false,
    tags: [],
    
    // Marketing
    marketingDescription: '',
    imageUrl: '',
    socialMediaHashtags: [],
    
    // Metadata
    notes: '',
    adminNotes: ''
};

const DAYS_OF_WEEK = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

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
    const [tagInput, setTagInput] = useState('');
    const [hashtagInput, setHashtagInput] = useState('');

    useEffect(() => {
        if (isOpen && initialData) {
            // Ensure array fields are never null (database may return null instead of [])
            const safeInitialData = {
                ...initialData,
                aliases: initialData.aliases ?? [],
                tags: initialData.tags ?? [],
                socialMediaHashtags: initialData.socialMediaHashtags ?? [],
            };
            setFormData({ ...DEFAULT_FORM, ...safeInitialData });
        } else if (isOpen) {
            // For new games, pre-select the current entity from context
            setFormData({ 
                ...DEFAULT_FORM, 
                entityId: currentEntityId || '' 
            });
        }
    }, [isOpen, initialData, currentEntityId]);

    // Filter venues based on selected entity
    const filteredVenues = useMemo(() => {
        if (!formData.entityId) return venues;
        return venues.filter(v => !v.entityId || v.entityId === formData.entityId);
    }, [venues, formData.entityId]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
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
                            
                            {/* === CORE INFO (Always visible) === */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
                                    Core Information
                                </h4>
                                
                                {/* Entity & Name */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>Entity *</label>
                                        <select
                                            required
                                            value={formData.entityId}
                                            onChange={(e) => setFormData({ 
                                                ...formData, 
                                                entityId: e.target.value,
                                                venueId: '' // Reset venue when entity changes
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
                                        <label className={labelClass}>Name *</label>
                                        <input
                                            type="text"
                                            required
                                            value={formData.name}
                                            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                            className={inputClass}
                                            placeholder="e.g. Tuesday Night NLHE"
                                        />
                                    </div>
                                </div>

                                {/* Venue */}
                                <div>
                                    <label className={labelClass}>Venue *</label>
                                    <select
                                        required
                                        value={formData.venueId}
                                        onChange={(e) => setFormData({ ...formData, venueId: e.target.value })}
                                        className={inputClass}
                                        disabled={!formData.entityId}
                                    >
                                        <option value="">
                                            {formData.entityId ? 'Select Venue' : 'Select an entity first'}
                                        </option>
                                        {filteredVenues.map(v => (
                                            <option key={v.id} value={v.id}>{v.name}</option>
                                        ))}
                                    </select>
                                    {formData.entityId && filteredVenues.length === 0 && (
                                        <p className="mt-1 text-xs text-amber-600">
                                            No venues found for this entity
                                        </p>
                                    )}
                                </div>

                                {/* Schedule */}
                                <div className="grid grid-cols-3 gap-4">
                                    <div>
                                        <label className={labelClass}>Day of Week</label>
                                        <select
                                            value={formData.dayOfWeek}
                                            onChange={(e) => setFormData({ ...formData, dayOfWeek: e.target.value })}
                                            className={inputClass}
                                        >
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
                                    <div>
                                        <label className={labelClass}>Frequency</label>
                                        <select
                                            value={formData.frequency}
                                            onChange={(e) => setFormData({ ...formData, frequency: e.target.value as GameFrequency })}
                                            className={inputClass}
                                        >
                                            {Object.values(GameFrequency).map(f => (
                                                <option key={f} value={f}>{f}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Game Type & Variant */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>Game Type</label>
                                        <select
                                            value={formData.gameType}
                                            onChange={(e) => setFormData({ ...formData, gameType: e.target.value as GameType })}
                                            className={inputClass}
                                        >
                                            {Object.values(GameType).map(t => (
                                                <option key={t} value={t}>{t}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Game Variant *</label>
                                        <select
                                            required
                                            value={formData.gameVariant}
                                            onChange={(e) => setFormData({ ...formData, gameVariant: e.target.value as GameVariant })}
                                            className={inputClass}
                                        >
                                            {Object.values(GameVariant).map(v => (
                                                <option key={v} value={v}>{v}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>

                                {/* Buy-in & Guarantee */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>Typical Buy-in</label>
                                        <div className="relative mt-1 rounded-md shadow-sm">
                                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                                <span className="text-gray-500 sm:text-sm">$</span>
                                            </div>
                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={formData.typicalBuyIn || ''}
                                                onChange={(e) => setFormData({ ...formData, typicalBuyIn: parseFloat(e.target.value) || 0 })}
                                                className="block w-full rounded-md border-gray-300 pl-7 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Typical Guarantee</label>
                                        <div className="relative mt-1 rounded-md shadow-sm">
                                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                                <span className="text-gray-500 sm:text-sm">$</span>
                                            </div>
                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={formData.typicalGuarantee || ''}
                                                onChange={(e) => setFormData({ ...formData, typicalGuarantee: parseFloat(e.target.value) || 0 })}
                                                className="block w-full rounded-md border-gray-300 pl-7 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Status Toggles */}
                                <div className="flex flex-wrap gap-6">
                                    <label className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={formData.isActive}
                                            onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                        />
                                        <span className={checkboxLabelClass}>Active</span>
                                    </label>
                                    <label className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={formData.isSignature}
                                            onChange={(e) => setFormData({ ...formData, isSignature: e.target.checked })}
                                            className="h-4 w-4 rounded border-gray-300 text-yellow-600 focus:ring-yellow-500"
                                        />
                                        <span className={checkboxLabelClass}>Signature Event</span>
                                    </label>
                                    <label className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={formData.isBounty}
                                            onChange={(e) => setFormData({ ...formData, isBounty: e.target.checked })}
                                            className="h-4 w-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
                                        />
                                        <span className={checkboxLabelClass}>Bounty</span>
                                    </label>
                                    <label className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={formData.isBeginnerFriendly}
                                            onChange={(e) => setFormData({ ...formData, isBeginnerFriendly: e.target.checked })}
                                            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                                        />
                                        <span className={checkboxLabelClass}>Beginner Friendly</span>
                                    </label>
                                </div>
                            </div>

                            {/* === EXTENDED DETAILS (Collapsible) === */}
                            <CollapsibleSection title="Extended Details" defaultOpen={false}>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>Display Name</label>
                                        <input
                                            type="text"
                                            value={formData.displayName}
                                            onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                                            className={inputClass}
                                            placeholder="Public-facing name"
                                        />
                                    </div>
                                    <div>
                                        <label className={labelClass}>End Time</label>
                                        <input
                                            type="time"
                                            value={formData.endTime}
                                            onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                                            className={inputClass}
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className={labelClass}>Description</label>
                                    <textarea
                                        value={formData.description}
                                        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                        rows={2}
                                        className={inputClass}
                                        placeholder="Brief description of this recurring game"
                                    />
                                </div>

                                {/* Aliases */}
                                <div>
                                    <label className={labelClass}>Aliases</label>
                                    <div className="flex gap-2 mt-1">
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
                                            placeholder="Add alias and press Enter"
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
                                                <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-sm">
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
                                </div>
                            </CollapsibleSection>

                            {/* === GAME SPECS (Collapsible) === */}
                            <CollapsibleSection title="Game Specifications" defaultOpen={false}>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={labelClass}>Typical Rake</label>
                                        <div className="relative mt-1 rounded-md shadow-sm">
                                            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                                                <span className="text-gray-500 sm:text-sm">$</span>
                                            </div>
                                            <input
                                                type="number"
                                                min="0"
                                                step="1"
                                                value={formData.typicalRake || ''}
                                                onChange={(e) => setFormData({ ...formData, typicalRake: parseFloat(e.target.value) || 0 })}
                                                className="block w-full rounded-md border-gray-300 pl-7 focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className={labelClass}>Typical Starting Stack</label>
                                        <input
                                            type="number"
                                            min="0"
                                            step="1000"
                                            value={formData.typicalStartingStack || ''}
                                            onChange={(e) => setFormData({ ...formData, typicalStartingStack: parseInt(e.target.value) || 0 })}
                                            className={inputClass}
                                            placeholder="e.g. 10000"
                                        />
                                    </div>
                                </div>

                                {/* Tags */}
                                <div>
                                    <label className={labelClass}>Tags</label>
                                    <div className="flex gap-2 mt-1">
                                        <input
                                            type="text"
                                            value={tagInput}
                                            onChange={(e) => setTagInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    addToArray('tags', tagInput, () => setTagInput(''));
                                                }
                                            }}
                                            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                            placeholder="Add tag and press Enter"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => addToArray('tags', tagInput, () => setTagInput(''))}
                                            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
                                        >
                                            Add
                                        </button>
                                    </div>
                                    {(formData.tags?.length ?? 0) > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {formData.tags.map((tag, idx) => (
                                                <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-800 rounded text-sm">
                                                    {tag}
                                                    <button
                                                        type="button"
                                                        onClick={() => removeFromArray('tags', idx)}
                                                        className="text-indigo-400 hover:text-indigo-600"
                                                    >
                                                        ×
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </CollapsibleSection>

                            {/* === PAUSE STATUS (Collapsible) === */}
                            <CollapsibleSection title="Pause Status" defaultOpen={false}>
                                <div className="space-y-4">
                                    <label className="flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={formData.isPaused}
                                            onChange={(e) => setFormData({ ...formData, isPaused: e.target.checked })}
                                            className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                                        />
                                        <span className={checkboxLabelClass}>Currently Paused</span>
                                    </label>
                                    
                                    {formData.isPaused && (
                                        <div>
                                            <label className={labelClass}>Pause Reason</label>
                                            <input
                                                type="text"
                                                value={formData.pausedReason}
                                                onChange={(e) => setFormData({ ...formData, pausedReason: e.target.value })}
                                                className={inputClass}
                                                placeholder="e.g. Venue renovation, seasonal break"
                                            />
                                        </div>
                                    )}
                                </div>
                            </CollapsibleSection>

                            {/* === MARKETING (Collapsible) === */}
                            <CollapsibleSection title="Marketing" defaultOpen={false}>
                                <div>
                                    <label className={labelClass}>Marketing Description</label>
                                    <textarea
                                        value={formData.marketingDescription}
                                        onChange={(e) => setFormData({ ...formData, marketingDescription: e.target.value })}
                                        rows={3}
                                        className={inputClass}
                                        placeholder="Description for promotional materials"
                                    />
                                </div>

                                <div>
                                    <label className={labelClass}>Image URL</label>
                                    <input
                                        type="url"
                                        value={formData.imageUrl}
                                        onChange={(e) => setFormData({ ...formData, imageUrl: e.target.value })}
                                        className={inputClass}
                                        placeholder="https://..."
                                    />
                                </div>

                                {/* Social Media Hashtags */}
                                <div>
                                    <label className={labelClass}>Social Media Hashtags</label>
                                    <div className="flex gap-2 mt-1">
                                        <input
                                            type="text"
                                            value={hashtagInput}
                                            onChange={(e) => setHashtagInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    const hashtag = hashtagInput.startsWith('#') ? hashtagInput : `#${hashtagInput}`;
                                                    addToArray('socialMediaHashtags', hashtag, () => setHashtagInput(''));
                                                }
                                            }}
                                            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                                            placeholder="#poker #tournament"
                                        />
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const hashtag = hashtagInput.startsWith('#') ? hashtagInput : `#${hashtagInput}`;
                                                addToArray('socialMediaHashtags', hashtag, () => setHashtagInput(''));
                                            }}
                                            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm"
                                        >
                                            Add
                                        </button>
                                    </div>
                                    {(formData.socialMediaHashtags?.length ?? 0) > 0 && (
                                        <div className="flex flex-wrap gap-2 mt-2">
                                            {formData.socialMediaHashtags.map((hashtag, idx) => (
                                                <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                                                    {hashtag}
                                                    <button
                                                        type="button"
                                                        onClick={() => removeFromArray('socialMediaHashtags', idx)}
                                                        className="text-blue-400 hover:text-blue-600"
                                                    >
                                                        ×
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </CollapsibleSection>

                            {/* === NOTES (Collapsible) === */}
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
                    <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end gap-3">
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
                            disabled={isSubmitting}
                            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
                        >
                            {isSubmitting ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};