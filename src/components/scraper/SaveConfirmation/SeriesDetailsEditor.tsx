// src/components/scraper/SaveConfirmation/SeriesDetailsEditor.tsx
// ENHANCED: Now includes TournamentSeriesTitle selection and creation

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { generateClient } from 'aws-amplify/api';
import type { GameData } from '../../../types/game';
import type { UseGameDataEditorReturn } from '../../../hooks/useGameDataEditor';
import type { TournamentSeries, TournamentSeriesTitle } from '../../../types/series';
import type { SeriesCategory } from '../../../API';

// ===================================================================
// GRAPHQL OPERATIONS
// ===================================================================

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

const createSeriesInstanceMutation = /* GraphQL */ `
    mutation CreateTournamentSeries($input: CreateTournamentSeriesInput!) {
        createTournamentSeries(input: $input) {
            id
            name
            year
            quarter
            month
            status
            venueId
            tournamentSeriesTitleId
            seriesCategory
            holidayType
        }
    }
`;

// ===================================================================
// TYPES
// ===================================================================

interface SeriesDetailsEditorProps {
    editor: UseGameDataEditorReturn;
    series: TournamentSeries[];
    seriesTitles: TournamentSeriesTitle[];
    venueId?: string;
    onSeriesChange?: (seriesId: string | null) => void;
    onSeriesTitleChange?: (titleId: string | null) => void;
    onSeriesTitleCreated?: (newTitle: TournamentSeriesTitle) => void;
    onSeriesInstanceCreated?: (newInstance: TournamentSeries) => void;
}

// ===================================================================
// HELPERS
// ===================================================================

const detectCategoryFromName = (name: string): SeriesCategory => {
    const nameLower = name.toLowerCase();
    
    if (nameLower.includes('christmas') || nameLower.includes('easter') || 
        nameLower.includes('anzac') || nameLower.includes('holiday')) {
        return 'SPECIAL' as SeriesCategory;
    }
    if (nameLower.includes('championship') || nameLower.includes('champs') ||
        nameLower.includes('wsop') || nameLower.includes('wpt') || nameLower.includes('apt')) {
        return 'CHAMPIONSHIP' as SeriesCategory;
    }
    if (nameLower.includes('promo') || nameLower.includes('freeroll') || 
        nameLower.includes('special offer')) {
        return 'PROMOTIONAL' as SeriesCategory;
    }
    if (nameLower.includes('summer') || nameLower.includes('winter') || 
        nameLower.includes('spring') || nameLower.includes('autumn') ||
        nameLower.includes('fall')) {
        return 'SEASONAL' as SeriesCategory;
    }
    return 'REGULAR' as SeriesCategory;
};

const formatCategoryDisplay = (category: string): string => {
    return category.replace(/_/g, ' ');
};

const getQuarterFromMonth = (month: number): number => {
    return Math.ceil(month / 3);
};

// Lazy client initialization
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let clientInstance: any = null;
const getClient = () => {
    if (!clientInstance) {
        clientInstance = generateClient();
    }
    return clientInstance;
};

// ===================================================================
// COMPONENT
// ===================================================================

export const SeriesDetailsEditor: React.FC<SeriesDetailsEditorProps> = ({
    editor,
    series,
    seriesTitles,
    venueId,
    onSeriesChange,
    onSeriesTitleChange,
    onSeriesTitleCreated,
    onSeriesInstanceCreated
}) => {
    const { editedData, updateField, updateMultipleFields } = editor;
    
    // UI State
    const [showAdvancedInfo, setShowAdvancedInfo] = useState(false);
    const [activeCreateMode, setActiveCreateMode] = useState<'title' | 'instance' | null>(null);
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    
    // Create Title Form
    const [newTitleName, setNewTitleName] = useState('');
    const [newTitleAliases, setNewTitleAliases] = useState('');
    const [newTitleCategory, setNewTitleCategory] = useState<SeriesCategory>('REGULAR' as SeriesCategory);
    
    // Create Instance Form
    const [newInstanceName, setNewInstanceName] = useState('');
    const [newInstanceYear, setNewInstanceYear] = useState(new Date().getFullYear());
    const [newInstanceStatus, setNewInstanceStatus] = useState('SCHEDULED');
    
    // Track processed names for auto-detection
    const processedNameRef = useRef<string | null>(null);
    
    // Derive suggested series name from game data
    const suggestedSeriesName = useMemo(() => {
        if (!editedData.seriesName) return null;
        return editedData.seriesName;
    }, [editedData.seriesName]);
    
    // Find matching title from suggestion
    const suggestedTitleMatch = useMemo(() => {
        if (!suggestedSeriesName) return null;
        
        const normalized = suggestedSeriesName.toLowerCase().trim();
        
        // Exact match
        const exactMatch = seriesTitles.find(t => 
            t.title.toLowerCase().trim() === normalized
        );
        if (exactMatch) return { title: exactMatch, confidence: 1.0, matchType: 'exact' };
        
        // Alias match
        for (const title of seriesTitles) {
            if (title.aliases?.some(a => a?.toLowerCase().trim() === normalized)) {
                return { title, confidence: 0.95, matchType: 'alias' };
            }
        }
        
        // Partial match
        const partialMatch = seriesTitles.find(t => 
            t.title.toLowerCase().includes(normalized) ||
            normalized.includes(t.title.toLowerCase())
        );
        if (partialMatch) return { title: partialMatch, confidence: 0.7, matchType: 'partial' };
        
        return null;
    }, [suggestedSeriesName, seriesTitles]);
    
    // Filter series instances by selected title
    const filteredSeriesInstances = useMemo(() => {
        if (!editedData.seriesTitleId) return series;
        return series.filter(s => s.tournamentSeriesTitleId === editedData.seriesTitleId);
    }, [series, editedData.seriesTitleId]);
    
    // Filter titles by search query
    const filteredTitles = useMemo(() => {
        if (!searchQuery.trim()) return seriesTitles;
        const query = searchQuery.toLowerCase().trim();
        return seriesTitles.filter(t => 
            t.title.toLowerCase().includes(query) ||
            t.aliases?.some(a => a?.toLowerCase().includes(query))
        );
    }, [seriesTitles, searchQuery]);
    
    // Get selected title info
    const selectedTitle = useMemo(() => {
        return editedData.seriesTitleId 
            ? seriesTitles.find(t => t.id === editedData.seriesTitleId) 
            : null;
    }, [editedData.seriesTitleId, seriesTitles]);
    
    // Auto-detect series patterns from game name
    useEffect(() => {
        if (!editedData.name || !editedData.isSeries) return;
        
        if (processedNameRef.current === editedData.name) {
            return;
        }
        
        const name = editedData.name;
        const detectedValues: Partial<GameData> = {};
        
        // Detect Event Number (e.g., "Event 8", "Event #12")
        const eventMatch = name.match(/\bEvent\s*#?\s*(\d+)/i);
        if (eventMatch) {
            detectedValues.eventNumber = parseInt(eventMatch[1]);
        }
        
        // Detect Day Number
        const dayMatch = name.match(/\bDay\s*(\d+)/i);
        if (dayMatch) {
            detectedValues.dayNumber = parseInt(dayMatch[1]);
        }
        
        // Detect Flight Letter
        const flightPatterns = [
            /\bFlight\s*([A-Z])/i,
            /\bDay\s*\d+([A-Z])\b/i,
            /\b(\d+)([A-Z])\b/
        ];
        
        for (const pattern of flightPatterns) {
            const match = name.match(pattern);
            if (match) {
                const letter = match[match.length - 1];
                if (/^[A-Z]$/.test(letter)) {
                    detectedValues.flightLetter = letter;
                    break;
                }
            }
        }
        
        // Detect Final Day/Table
        if (/\b(Final\s*(Day|Table)|FT)\b/i.test(name)) {
            detectedValues.finalDay = true;
            if (!detectedValues.dayNumber) {
                detectedValues.dayNumber = 99;
            }
        }
        
        processedNameRef.current = name;
        
        const updates: Partial<GameData> = {};
        let hasUpdates = false;

        for (const [key, value] of Object.entries(detectedValues)) {
            const field = key as keyof GameData;
            if (!editedData[field] && value !== undefined) {
                (updates as Record<string, unknown>)[field] = value;
                hasUpdates = true;
            }
        }
        
        if (hasUpdates) {
            updateMultipleFields(updates);
        }
    }, [editedData.name, editedData.isSeries, updateMultipleFields, editedData]);
    
    // Handlers
    const handleTitleSelect = useCallback((titleId: string | null) => {
        if (titleId) {
            const title = seriesTitles.find(t => t.id === titleId);
            updateMultipleFields({
                seriesTitleId: titleId,
                seriesName: title?.title || editedData.seriesName,
                isSeries: true
            } as Partial<GameData>);
        } else {
            updateMultipleFields({
                seriesTitleId: null,
                tournamentSeriesId: null
            } as Partial<GameData>);
        }
        onSeriesTitleChange?.(titleId);
        setSearchQuery('');
    }, [seriesTitles, editedData.seriesName, updateMultipleFields, onSeriesTitleChange]);
    
    const handleSeriesSelect = useCallback((seriesId: string) => {
        updateField('tournamentSeriesId', seriesId || null);
        
        if (seriesId) {
            const selectedSeries = series.find(s => s.id === seriesId);
            if (selectedSeries) {
                updateField('seriesName', selectedSeries.name);
            }
        }
        
        onSeriesChange?.(seriesId || null);
    }, [series, updateField, onSeriesChange]);
    
    const handleCreateTitle = useCallback(async () => {
        if (!newTitleName.trim()) {
            setCreateError('Title name is required');
            return;
        }
        
        // Check for duplicates
        const duplicate = seriesTitles.find(t => 
            t.title.toLowerCase().trim() === newTitleName.toLowerCase().trim()
        );
        if (duplicate) {
            setCreateError('A title with this name already exists');
            return;
        }
        
        setIsCreating(true);
        setCreateError(null);
        
        try {
            const aliases = newTitleAliases
                .split(',')
                .map(a => a.trim())
                .filter(a => a.length > 0);
            
            const result = await getClient().graphql({
                query: createSeriesTitleMutation,
                variables: {
                    input: {
                        title: newTitleName.trim(),
                        aliases: aliases.length > 0 ? aliases : null,
                        seriesCategory: newTitleCategory
                    }
                }
            }) as { data: { createTournamentSeriesTitle: TournamentSeriesTitle } };
            
            const newTitle = result.data.createTournamentSeriesTitle;
            
            onSeriesTitleCreated?.(newTitle);
            handleTitleSelect(newTitle.id);
            
            // Reset form
            setActiveCreateMode(null);
            setNewTitleName('');
            setNewTitleAliases('');
            setNewTitleCategory('REGULAR' as SeriesCategory);
            
            console.log('[SeriesDetailsEditor] Created new title:', newTitle);
            
        } catch (error: unknown) {
            console.error('[SeriesDetailsEditor] Error creating title:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to create series title';
            setCreateError(errorMessage);
        } finally {
            setIsCreating(false);
        }
    }, [newTitleName, newTitleAliases, newTitleCategory, seriesTitles, handleTitleSelect, onSeriesTitleCreated]);
    
    const handleCreateInstance = useCallback(async () => {
        if (!newInstanceName.trim()) {
            setCreateError('Instance name is required');
            return;
        }
        
        if (!editedData.seriesTitleId) {
            setCreateError('Please select a series template first');
            return;
        }
        
        setIsCreating(true);
        setCreateError(null);
        
        try {
            // Calculate quarter and month from game date if available
            let quarter: number | undefined;
            let month: number | undefined;
            
            if (editedData.gameStartDateTime) {
                const gameDate = new Date(editedData.gameStartDateTime);
                month = gameDate.getMonth() + 1;
                quarter = getQuarterFromMonth(month);
            }
            
            const result = await getClient().graphql({
                query: createSeriesInstanceMutation,
                variables: {
                    input: {
                        name: newInstanceName.trim(),
                        year: newInstanceYear,
                        quarter,
                        month,
                        status: newInstanceStatus,
                        venueId: venueId || undefined,
                        tournamentSeriesTitleId: editedData.seriesTitleId,
                        seriesCategory: selectedTitle?.seriesCategory || detectCategoryFromName(newInstanceName)
                    }
                }
            }) as { data: { createTournamentSeries: TournamentSeries } };
            
            const newInstance = result.data.createTournamentSeries;
            
            onSeriesInstanceCreated?.(newInstance);
            handleSeriesSelect(newInstance.id);
            
            // Reset form
            setActiveCreateMode(null);
            setNewInstanceName('');
            setNewInstanceYear(new Date().getFullYear());
            setNewInstanceStatus('SCHEDULED');
            
            console.log('[SeriesDetailsEditor] Created new instance:', newInstance);
            
        } catch (error: unknown) {
            console.error('[SeriesDetailsEditor] Error creating instance:', error);
            const errorMessage = error instanceof Error ? error.message : 'Failed to create series instance';
            setCreateError(errorMessage);
        } finally {
            setIsCreating(false);
        }
    }, [newInstanceName, newInstanceYear, newInstanceStatus, editedData.seriesTitleId, editedData.gameStartDateTime, venueId, selectedTitle, handleSeriesSelect, onSeriesInstanceCreated]);
    
    const openCreateTitleForm = useCallback(() => {
        setActiveCreateMode('title');
        setCreateError(null);
        
        // Pre-fill with suggested name if available and no match
        if (suggestedSeriesName && !suggestedTitleMatch) {
            setNewTitleName(suggestedSeriesName);
            setNewTitleCategory(detectCategoryFromName(suggestedSeriesName));
        } else {
            setNewTitleName('');
            setNewTitleCategory('REGULAR' as SeriesCategory);
        }
        setNewTitleAliases('');
    }, [suggestedSeriesName, suggestedTitleMatch]);
    
    const openCreateInstanceForm = useCallback(() => {
        setActiveCreateMode('instance');
        setCreateError(null);
        
        // Pre-fill name from title
        if (selectedTitle) {
            const year = editedData.gameStartDateTime 
                ? new Date(editedData.gameStartDateTime).getFullYear() 
                : new Date().getFullYear();
            const month = editedData.gameStartDateTime
                ? new Date(editedData.gameStartDateTime).toLocaleString('default', { month: 'long' })
                : '';
            setNewInstanceName(`${selectedTitle.title} ${month} ${year}`.trim());
            setNewInstanceYear(year);
        } else {
            setNewInstanceName('');
            setNewInstanceYear(new Date().getFullYear());
        }
        setNewInstanceStatus('SCHEDULED');
    }, [selectedTitle, editedData.gameStartDateTime]);
    
    // ===================================================================
    // RENDER
    // ===================================================================
    
    if (!editedData.isSeries) {
        return (
            <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                Enable "Is Series" to configure series event details
            </div>
        );
    }
    
    return (
        <div className="space-y-4">
            {/* Series Title (Template) Selection */}
            <div className="border rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-semibold text-sm">📋 Series Template</h3>
                    <button
                        onClick={openCreateTitleForm}
                        className="text-xs text-blue-600 hover:text-blue-700"
                        disabled={activeCreateMode === 'title'}
                    >
                        + Create New Template
                    </button>
                </div>
                
                {/* Suggestion Banner */}
                {suggestedSeriesName && !selectedTitle && (
                    <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                        <div className="text-sm text-blue-900 mb-2">
                            💡 <strong>Detected:</strong> "{suggestedSeriesName}"
                        </div>
                        {suggestedTitleMatch ? (
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-blue-700">
                                    Matches: <strong>{suggestedTitleMatch.title.title}</strong>
                                    <span className="ml-1 text-xs opacity-75">
                                        ({suggestedTitleMatch.matchType}, {Math.round(suggestedTitleMatch.confidence * 100)}%)
                                    </span>
                                </span>
                                <button
                                    onClick={() => handleTitleSelect(suggestedTitleMatch.title.id)}
                                    className="ml-auto px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                                >
                                    Apply
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-blue-700">No matching template found</span>
                                <button
                                    onClick={openCreateTitleForm}
                                    className="ml-auto px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                                >
                                    Create "{suggestedSeriesName}"
                                </button>
                            </div>
                        )}
                    </div>
                )}
                
                {/* Selected Title Display */}
                {selectedTitle && (
                    <div className="mb-3 p-3 bg-green-50 border border-green-200 rounded-lg">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="font-medium text-green-800">
                                    ✓ {selectedTitle.title}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                    {selectedTitle.seriesCategory && (
                                        <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                                            {formatCategoryDisplay(selectedTitle.seriesCategory)}
                                        </span>
                                    )}
                                    {selectedTitle.aliases && selectedTitle.aliases.length > 0 && (
                                        <span className="text-xs text-green-600">
                                            Aliases: {selectedTitle.aliases.filter(Boolean).join(', ')}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <button
                                onClick={() => handleTitleSelect(null)}
                                className="text-sm text-red-600 hover:text-red-700"
                            >
                                Change
                            </button>
                        </div>
                    </div>
                )}
                
                {/* Title Selection (when not selected) */}
                {!selectedTitle && activeCreateMode !== 'title' && (
                    <div className="space-y-2">
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search templates..."
                            className="w-full px-3 py-2 text-sm border rounded"
                        />
                        
                        <div className="max-h-40 overflow-y-auto border rounded divide-y">
                            {filteredTitles.length === 0 ? (
                                <div className="p-3 text-center text-gray-500 text-sm">
                                    {searchQuery ? 'No matching templates' : 'No templates available'}
                                </div>
                            ) : (
                                filteredTitles.map(title => (
                                    <div
                                        key={title.id}
                                        onClick={() => handleTitleSelect(title.id)}
                                        className="p-2 cursor-pointer hover:bg-gray-50"
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="font-medium text-sm">{title.title}</span>
                                            {title.seriesCategory && (
                                                <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded">
                                                    {formatCategoryDisplay(title.seriesCategory)}
                                                </span>
                                            )}
                                        </div>
                                        {title.aliases && title.aliases.length > 0 && (
                                            <div className="text-xs text-gray-500 mt-0.5">
                                                Also: {title.aliases.filter(Boolean).slice(0, 3).join(', ')}
                                            </div>
                                        )}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}
                
                {/* Create Title Form */}
                {activeCreateMode === 'title' && (
                    <div className="p-4 bg-gray-50 border rounded-lg space-y-3">
                        <h5 className="font-medium text-sm">Create New Series Template</h5>
                        
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Title Name <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="text"
                                value={newTitleName}
                                onChange={(e) => {
                                    setNewTitleName(e.target.value);
                                    setNewTitleCategory(detectCategoryFromName(e.target.value));
                                }}
                                placeholder="e.g., WSOP, Sydney Millions"
                                className="w-full px-3 py-2 text-sm border rounded"
                                disabled={isCreating}
                            />
                        </div>
                        
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">
                                Aliases (comma-separated)
                            </label>
                            <input
                                type="text"
                                value={newTitleAliases}
                                onChange={(e) => setNewTitleAliases(e.target.value)}
                                placeholder="e.g., World Series, WSOP Circuit"
                                className="w-full px-3 py-2 text-sm border rounded"
                                disabled={isCreating}
                            />
                        </div>
                        
                        <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Category</label>
                            <select
                                value={newTitleCategory}
                                onChange={(e) => setNewTitleCategory(e.target.value as SeriesCategory)}
                                className="w-full px-3 py-2 text-sm border rounded"
                                disabled={isCreating}
                            >
                                <option value="REGULAR">Regular</option>
                                <option value="CHAMPIONSHIP">Championship</option>
                                <option value="SEASONAL">Seasonal</option>
                                <option value="SPECIAL">Special Holiday</option>
                                <option value="PROMOTIONAL">Promotional</option>
                            </select>
                            {newTitleName && (
                                <p className="text-xs text-blue-600 mt-1">
                                    Auto-detected: {formatCategoryDisplay(detectCategoryFromName(newTitleName))}
                                </p>
                            )}
                        </div>
                        
                        {createError && (
                            <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                                {createError}
                            </div>
                        )}
                        
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={handleCreateTitle}
                                disabled={isCreating || !newTitleName.trim()}
                                className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
                            >
                                {isCreating ? 'Creating...' : 'Create Template'}
                            </button>
                            <button
                                onClick={() => setActiveCreateMode(null)}
                                className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                disabled={isCreating}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>
            
            {/* Series Instance Selection */}
            {selectedTitle && (
                <div className="border rounded-lg p-4">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="font-semibold text-sm">🔗 Series Instance</h3>
                        <button
                            onClick={openCreateInstanceForm}
                            className="text-xs text-blue-600 hover:text-blue-700"
                            disabled={activeCreateMode === 'instance'}
                        >
                            + Create Instance
                        </button>
                    </div>
                    
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-medium text-gray-700">Select Instance</label>
                            <select
                                value={editedData.tournamentSeriesId || ''}
                                onChange={(e) => handleSeriesSelect(e.target.value)}
                                className="w-full px-2 py-1.5 text-sm border rounded mt-1"
                            >
                                <option value="">-- Auto-assign based on date --</option>
                                {filteredSeriesInstances.map(s => (
                                    <option key={s.id} value={s.id}>
                                        {s.name} ({s.year}) - {s.status}
                                        {s.venue && ` @ ${s.venue.name}`}
                                    </option>
                                ))}
                            </select>
                        </div>
                        
                        {!editedData.tournamentSeriesId && (
                            <div className="p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                                💡 Leave blank to auto-assign or create a series instance based on the game date
                            </div>
                        )}
                        
                        {editedData.tournamentSeriesId && (
                            <div className="p-2 bg-green-50 rounded text-xs text-green-700">
                                ✓ Linked to: {series.find(s => s.id === editedData.tournamentSeriesId)?.name}
                            </div>
                        )}
                    </div>
                    
                    {/* Create Instance Form */}
                    {activeCreateMode === 'instance' && (
                        <div className="mt-3 p-4 bg-gray-50 border rounded-lg space-y-3">
                            <h5 className="font-medium text-sm">Create New Series Instance</h5>
                            
                            <div>
                                <label className="block text-xs font-medium text-gray-700 mb-1">
                                    Instance Name <span className="text-red-500">*</span>
                                </label>
                                <input
                                    type="text"
                                    value={newInstanceName}
                                    onChange={(e) => setNewInstanceName(e.target.value)}
                                    placeholder="e.g., WSOP August 2025"
                                    className="w-full px-3 py-2 text-sm border rounded"
                                    disabled={isCreating}
                                />
                            </div>
                            
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Year</label>
                                    <input
                                        type="number"
                                        value={newInstanceYear}
                                        onChange={(e) => setNewInstanceYear(parseInt(e.target.value))}
                                        className="w-full px-3 py-2 text-sm border rounded"
                                        disabled={isCreating}
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                                    <select
                                        value={newInstanceStatus}
                                        onChange={(e) => setNewInstanceStatus(e.target.value)}
                                        className="w-full px-3 py-2 text-sm border rounded"
                                        disabled={isCreating}
                                    >
                                        <option value="SCHEDULED">Scheduled</option>
                                        <option value="LIVE">Live</option>
                                        <option value="COMPLETED">Completed</option>
                                    </select>
                                </div>
                            </div>
                            
                            {createError && (
                                <div className="p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                                    {createError}
                                </div>
                            )}
                            
                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={handleCreateInstance}
                                    disabled={isCreating || !newInstanceName.trim()}
                                    className="px-4 py-2 text-sm bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
                                >
                                    {isCreating ? 'Creating...' : 'Create Instance'}
                                </button>
                                <button
                                    onClick={() => setActiveCreateMode(null)}
                                    className="px-4 py-2 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                                    disabled={isCreating}
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            {/* Event Details */}
            <div className="border rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-semibold text-sm">📋 Event Structure Details</h3>
                    <button
                        onClick={() => setShowAdvancedInfo(!showAdvancedInfo)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                    >
                        {showAdvancedInfo ? 'Hide' : 'Show'} Info
                    </button>
                </div>
                
                {showAdvancedInfo && (
                    <div className="mb-3 p-2 bg-yellow-50 rounded text-xs text-gray-600">
                        <p className="mb-1"><strong>Event #:</strong> Groups all flights/days of the same tournament</p>
                        <p className="mb-1"><strong>Day #:</strong> Which day of the multi-day event (1, 2, 3...)</p>
                        <p className="mb-1"><strong>Flight:</strong> Starting flight letter (A, B, C...)</p>
                        <p><strong>Final Day:</strong> The day when prizes are awarded</p>
                    </div>
                )}
                
                <div className="grid grid-cols-2 gap-3">
                    {/* Main Event Checkbox */}
                    <div className="col-span-2">
                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="isMainEvent"
                                checked={editedData.isMainEvent || false}
                                onChange={(e) => updateField('isMainEvent', e.target.checked)}
                                className="h-4 w-4"
                            />
                            <label htmlFor="isMainEvent" className="text-sm font-medium">
                                🏆 This is the Main Event
                            </label>
                        </div>
                    </div>
                    
                    {/* Event Number */}
                    <div>
                        <label className="text-xs font-medium text-gray-700">Event Number</label>
                        <input
                            type="number"
                            value={editedData.eventNumber || ''}
                            onChange={(e) => updateField('eventNumber', e.target.value ? parseInt(e.target.value) : null)}
                            placeholder="e.g., 8"
                            className="w-full px-2 py-1 text-sm border rounded mt-1"
                        />
                    </div>
                    
                    {/* Day Number */}
                    <div>
                        <label className="text-xs font-medium text-gray-700">Day Number</label>
                        <input
                            type="number"
                            value={editedData.dayNumber || ''}
                            onChange={(e) => updateField('dayNumber', e.target.value ? parseInt(e.target.value) : null)}
                            placeholder="e.g., 1, 2"
                            className="w-full px-2 py-1 text-sm border rounded mt-1"
                        />
                    </div>
                    
                    {/* Flight Letter */}
                    <div>
                        <label className="text-xs font-medium text-gray-700">Flight Letter</label>
                        <select
                            value={editedData.flightLetter || ''}
                            onChange={(e) => updateField('flightLetter', e.target.value || null)}
                            className="w-full px-2 py-1 text-sm border rounded mt-1"
                        >
                            <option value="">-- None --</option>
                            {['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(letter => (
                                <option key={letter} value={letter}>{letter}</option>
                            ))}
                        </select>
                    </div>
                    
                    {/* Final Day Checkbox */}
                    <div className="flex items-center gap-2">
                        <input
                            type="checkbox"
                            id="finalDay"
                            checked={editedData.finalDay || false}
                            onChange={(e) => updateField('finalDay', e.target.checked)}
                            className="h-4 w-4"
                        />
                        <label htmlFor="finalDay" className="text-sm">
                            🏁 Final Day (payouts)
                        </label>
                    </div>
                </div>
                
                {/* Auto-detected indicator */}
                {(editedData.eventNumber || editedData.dayNumber || editedData.flightLetter) && (
                    <div className="mt-3 p-2 bg-green-50 rounded">
                        <div className="text-xs text-green-700">
                            <strong>Structure:</strong> 
                            {editedData.eventNumber && ` Event ${editedData.eventNumber}`}
                            {editedData.dayNumber && ` - Day ${editedData.dayNumber}`}
                            {editedData.flightLetter && `${editedData.flightLetter}`}
                            {editedData.finalDay && ' (Final)'}
                            {editedData.isMainEvent && ' [MAIN EVENT]'}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default SeriesDetailsEditor;