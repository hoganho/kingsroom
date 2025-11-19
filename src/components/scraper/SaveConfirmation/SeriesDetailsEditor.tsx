// src/components/scraper/SaveConfirmation/SeriesDetailsEditor.tsx

import { useState, useEffect } from 'react';
import type { GameData } from '../../../types/game';
import type { UseGameDataEditorReturn } from '../../../hooks/useGameDataEditor';
import type { TournamentSeries } from '../../../types/series';

interface SeriesDetailsEditorProps {
    editor: UseGameDataEditorReturn;
    series: TournamentSeries[];
    onSeriesChange?: (seriesId: string | null) => void;
}

export const SeriesDetailsEditor: React.FC<SeriesDetailsEditorProps> = ({
    editor,
    series,
    onSeriesChange
}) => {
    const { editedData, updateField, updateMultipleFields } = editor;
    const [showAdvancedInfo, setShowAdvancedInfo] = useState(false);
    
    // Auto-detect series patterns from game name
    useEffect(() => {
        if (!editedData.name || !editedData.isSeries) return;
        
        const name = editedData.name;
        const detectedValues: Partial<GameData> = {};
        
        // Detect Main Event
        if (/\bmain\s*event\b/i.test(name)) {
            detectedValues.isMainEvent = true;
        }
        
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
            /\bDay\s*\d+([A-Z])\b/i,  // Day 1A, Day 2B
            /\b(\d+)([A-Z])\b/  // 1A, 1B, etc.
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
                // Often final day is day 2 or 3
                detectedValues.dayNumber = 99; // Use 99 as indicator for final
            }
        }
        
        // Only update if we detected something and the field is currently empty
        const updates: Partial<GameData> = {};
        for (const [key, value] of Object.entries(detectedValues)) {
            const field = key as keyof GameData;
            if (!editedData[field] && value !== undefined) {
                updates[field] = value as any;
            }
        }
        
        if (Object.keys(updates).length > 0) {
            updateMultipleFields(updates);
        }
    }, [editedData.name, editedData.isSeries]);
    
    // Handle series selection
    const handleSeriesSelect = (seriesId: string) => {
        updateField('tournamentSeriesId', seriesId || null);
        
        if (seriesId) {
            const selectedSeries = series.find(s => s.id === seriesId);
            if (selectedSeries) {
                updateField('seriesName', selectedSeries.name);
            }
        } else {
            updateField('seriesName', null);
        }
        
        onSeriesChange?.(seriesId || null);
    };
    
    if (!editedData.isSeries) {
        return (
            <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
                Enable "Is Series" to configure series event details
            </div>
        );
    }
    
    return (
        <div className="space-y-4">
            {/* Series Selection */}
            <div className="border rounded-lg p-4">
                <h3 className="font-semibold text-sm mb-3">🎯 Tournament Series Link</h3>
                
                <div className="space-y-3">
                    <div>
                        <label className="text-xs font-medium text-gray-700">Tournament Series</label>
                        <select
                            value={editedData.tournamentSeriesId || ''}
                            onChange={(e) => handleSeriesSelect(e.target.value)}
                            className="w-full px-2 py-1.5 text-sm border rounded mt-1"
                        >
                            <option value="">-- Not linked to a series --</option>
                            {series.map(s => (
                                <option key={s.id} value={s.id}>
                                    {s.name} ({s.year}) - {s.status}
                                    {s.venue && ` @ ${s.venue.name}`}
                                </option>
                            ))}
                        </select>
                    </div>
                    
                    {editedData.tournamentSeriesId && (
                        <div className="p-2 bg-blue-50 rounded text-xs text-blue-700">
                            ✓ Linked to series: {series.find(s => s.id === editedData.tournamentSeriesId)?.name}
                        </div>
                    )}
                </div>
            </div>
            
            {/* Event Details */}
            <div className="border rounded-lg p-4">
                <div className="flex justify-between items-center mb-3">
                    <h3 className="font-semibold text-sm">📊 Event Structure Details</h3>
                    <button
                        onClick={() => setShowAdvancedInfo(!showAdvancedInfo)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                    >
                        {showAdvancedInfo ? 'Hide' : 'Show'} Info
                    </button>
                </div>
                
                {showAdvancedInfo && (
                    <div className="mb-3 p-2 bg-yellow-50 rounded text-xs text-gray-600">
                        <p className="mb-1"><strong>Event #:</strong> Groups all flights/days of the same tournament (e.g., all Day 1A, 1B, 1C, Day 2 of Event 8)</p>
                        <p className="mb-1"><strong>Day #:</strong> Which day of the multi-day event (1, 2, 3...)</p>
                        <p className="mb-1"><strong>Flight:</strong> Starting flight letter for events with multiple Day 1s (A, B, C...)</p>
                        <p><strong>Final Day:</strong> The day when prizes are awarded (typically Day 2 or Final Table)</p>
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
                            💰 Final Day (payouts)
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
            
            {/* Series Name (for reference) */}
            {editedData.seriesName && (
                <div className="border rounded-lg p-3 bg-gray-50">
                    <label className="text-xs font-medium text-gray-700">Series Name (from scraper)</label>
                    <div className="mt-1 text-sm font-mono text-gray-600">
                        {editedData.seriesName}
                    </div>
                </div>
            )}
        </div>
    );
};