// src/components/series/SeriesInstanceManager.tsx

import { useState, useEffect } from 'react';
import * as APITypes from '../../API';
import { getDateComponents } from '../../utils/dateCalculations';

interface Props {
    seriesInstances: APITypes.TournamentSeries[];
    seriesTitles: APITypes.TournamentSeriesTitle[];
    venues: APITypes.Venue[];
    onSave: (input: any) => void;
    onDelete: (instance: APITypes.TournamentSeries) => void;
}

export const SeriesInstanceManager: React.FC<Props> = ({ seriesInstances, seriesTitles, venues, onSave, onDelete }) => {
    const [formState, setFormState] = useState<Partial<APITypes.TournamentSeries>>({});
    const [isFormOpen, setIsFormOpen] = useState(false);

    // Auto-populate seriesCategory when series title changes
    useEffect(() => {
        if (formState.tournamentSeriesTitleId && !formState.id) { // Only auto-populate for new instances
            const selectedTitle = seriesTitles.find(t => t.id === formState.tournamentSeriesTitleId);
            if (selectedTitle?.seriesCategory) {
                setFormState(prev => ({
                    ...prev,
                    seriesCategory: selectedTitle.seriesCategory || undefined
                }));
            }
        }
    }, [formState.tournamentSeriesTitleId, formState.id, seriesTitles]);

    // Auto-populate year, quarter, and month when start date changes
    useEffect(() => {
        if (formState.startDate) {
            const { year, quarter, month } = getDateComponents(formState.startDate);
            setFormState(prev => ({
                ...prev,
                year: year,
                quarter: quarter,
                month: month
            }));
        }
    }, [formState.startDate]);

    const openForm = (instance: APITypes.TournamentSeries | null = null) => {
        setFormState(instance || { 
            status: APITypes.SeriesStatus.SCHEDULED,
            seriesCategory: APITypes.SeriesCategory.REGULAR // Default to REGULAR category
        });
        setIsFormOpen(true);
    };

    const handleSave = () => {
        onSave(formState);
        setIsFormOpen(false);
        setFormState({});
    };

    const formatCategoryName = (category: string) => {
        return category.replace(/_/g, ' ');
    };

    const formatHolidayName = (holiday: string) => {
        return holiday.replace(/_/g, ' ');
    };
    
    return (
        <div className="p-4 bg-white rounded-xl shadow-lg space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-800">Series Instances</h3>
                <button 
                    onClick={() => openForm()} 
                    className="px-4 py-2 text-white bg-green-600 rounded-md hover:bg-green-700 transition-colors"
                >
                    New Instance
                </button>
            </div>

            {/* Form Modal */}
            {isFormOpen && (
                <div className="p-4 border rounded-md bg-gray-50 space-y-3">
                    <h4 className="font-bold text-lg">{formState.id ? 'Edit' : 'New'} Series Instance</h4>
                    
                    {/* Basic Information */}
                    <div className="space-y-3">
                        <input 
                            type="text" 
                            placeholder="Name (e.g., Sydney Millions 2025)" 
                            value={formState.name || ''} 
                            onChange={e => setFormState({...formState, name: e.target.value})} 
                            className="w-full p-2 border border-gray-300 rounded focus:border-indigo-500 focus:outline-none" 
                            required 
                        />
                        
                        {/* Series Title - triggers auto-population of category */}
                        <select 
                            value={formState.tournamentSeriesTitleId || ''} 
                            onChange={e => setFormState({...formState, tournamentSeriesTitleId: e.target.value})} 
                            className="w-full p-2 border border-gray-300 rounded focus:border-indigo-500 focus:outline-none" 
                            required
                        >
                            <option value="">Select a Series Title...</option>
                            {seriesTitles.map(t => (
                                <option key={t.id} value={t.id}>
                                    {t.title} {t.seriesCategory && `(${formatCategoryName(t.seriesCategory)})`}
                                </option>
                            ))}
                        </select>
                        
                        <select 
                            value={formState.venueId || ''} 
                            onChange={e => setFormState({...formState, venueId: e.target.value})} 
                            className="w-full p-2 border border-gray-300 rounded focus:border-indigo-500 focus:outline-none" 
                            required
                        >
                            <option value="">Select a Venue...</option>
                            {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                        </select>
                        
                        <select 
                            value={formState.status || ''} 
                            onChange={e => setFormState({...formState, status: e.target.value as APITypes.SeriesStatus})} 
                            className="w-full p-2 border border-gray-300 rounded focus:border-indigo-500 focus:outline-none" 
                            required
                        >
                            <option value={APITypes.SeriesStatus.SCHEDULED}>Scheduled</option>
                            <option value={APITypes.SeriesStatus.LIVE}>Live</option>
                            <option value={APITypes.SeriesStatus.COMPLETED}>Completed</option>
                        </select>
                    </div>

                    {/* Category and Holiday Type */}
                    <div className="space-y-3 pt-3 border-t">
                        <div>
                            <label className="text-sm text-gray-600 mb-1 block">
                                Series Category {formState.id ? '(can be overridden)' : '(auto-populated from title)'}
                            </label>
                            <select 
                                value={formState.seriesCategory || ''} 
                                onChange={e => setFormState({...formState, seriesCategory: e.target.value as APITypes.SeriesCategory})} 
                                className="w-full p-2 border border-gray-300 rounded focus:border-indigo-500 focus:outline-none" 
                                required
                            >
                                <option value="">Select Series Category...</option>
                                <option value={APITypes.SeriesCategory.REGULAR}>Regular</option>
                                <option value={APITypes.SeriesCategory.CHAMPIONSHIP}>Championship</option>
                                <option value={APITypes.SeriesCategory.SEASONAL}>Seasonal</option>
                                <option value={APITypes.SeriesCategory.SPECIAL}>Special Holiday</option>
                                <option value={APITypes.SeriesCategory.PROMOTIONAL}>Promotional</option>
                            </select>
                        </div>

                        {/* Conditional Holiday Type field */}
                        {formState.seriesCategory === APITypes.SeriesCategory.SPECIAL && (
                            <div>
                                <label className="text-sm text-gray-600 mb-1 block">Holiday Type</label>
                                <select 
                                    value={formState.holidayType || ''} 
                                    onChange={e => setFormState({...formState, holidayType: e.target.value as APITypes.HolidayType || null})} 
                                    className="w-full p-2 border border-gray-300 rounded focus:border-indigo-500 focus:outline-none"
                                >
                                    <option value="">Select Holiday Type...</option>
                                    <option value={APITypes.HolidayType.NEW_YEAR}>New Year</option>
                                    <option value={APITypes.HolidayType.AUSTRALIA_DAY}>Australia Day</option>
                                    <option value={APITypes.HolidayType.EASTER}>Easter</option>
                                    <option value={APITypes.HolidayType.ANZAC_DAY}>ANZAC Day</option>
                                    <option value={APITypes.HolidayType.QUEENS_BIRTHDAY}>Queen's Birthday</option>
                                    <option value={APITypes.HolidayType.CHRISTMAS}>Christmas</option>
                                    <option value={APITypes.HolidayType.BOXING_DAY}>Boxing Day</option>
                                    <option value={APITypes.HolidayType.OTHER}>Other</option>
                                </select>
                            </div>
                        )}
                    </div>

                    {/* Date Fields */}
                    <div className="flex space-x-2 pt-3 border-t">
                        <div className="flex-1">
                            <label className="text-sm text-gray-600 mb-1 block">
                                Start Date <span className="text-xs">(auto-calculates Y/Q/M)</span>
                            </label>
                            <input 
                                type="date" 
                                value={formState.startDate || ''} 
                                onChange={e => setFormState({...formState, startDate: e.target.value})} 
                                className="w-full p-2 border border-gray-300 rounded focus:border-indigo-500 focus:outline-none" 
                            />
                        </div>
                        <div className="flex-1">
                            <label className="text-sm text-gray-600 mb-1 block">End Date</label>
                            <input 
                                type="date" 
                                value={formState.endDate || ''} 
                                onChange={e => setFormState({...formState, endDate: e.target.value})} 
                                className="w-full p-2 border border-gray-300 rounded focus:border-indigo-500 focus:outline-none" 
                            />
                        </div>
                    </div>

                    {/* Auto-calculated fields */}
                    <div className="flex space-x-2 pt-3 border-t">
                        <div className="flex-1">
                            <label className="text-sm text-gray-600 mb-1 block">Year</label>
                            <input 
                                type="number" 
                                value={formState.year || ''} 
                                onChange={e => setFormState({...formState, year: parseInt(e.target.value) || undefined})} 
                                className="w-full p-2 border border-gray-300 rounded bg-gray-50 focus:bg-white focus:border-indigo-500 focus:outline-none" 
                                placeholder="Auto"
                            />
                        </div>
                        <div className="flex-1">
                            <label className="text-sm text-gray-600 mb-1 block">Quarter</label>
                            <select
                                value={formState.quarter || ''} 
                                onChange={e => setFormState({...formState, quarter: parseInt(e.target.value) || undefined})} 
                                className="w-full p-2 border border-gray-300 rounded bg-gray-50 focus:bg-white focus:border-indigo-500 focus:outline-none"
                            >
                                <option value="">Auto</option>
                                <option value="1">Q1</option>
                                <option value="2">Q2</option>
                                <option value="3">Q3</option>
                                <option value="4">Q4</option>
                            </select>
                        </div>
                        <div className="flex-1">
                            <label className="text-sm text-gray-600 mb-1 block">Month</label>
                            <select
                                value={formState.month || ''} 
                                onChange={e => setFormState({...formState, month: parseInt(e.target.value) || undefined})} 
                                className="w-full p-2 border border-gray-300 rounded bg-gray-50 focus:bg-white focus:border-indigo-500 focus:outline-none"
                            >
                                <option value="">Auto</option>
                                {[...Array(12)].map((_, i) => (
                                    <option key={i + 1} value={i + 1}>
                                        {new Date(2024, i, 1).toLocaleString('default', { month: 'short' })}
                                    </option>
                                ))}
                            </select>
                        </div>
                    </div>
                    
                    {/* Form Actions */}
                    <div className="flex justify-end space-x-2 pt-3 border-t">
                        <button 
                            onClick={() => {
                                setIsFormOpen(false);
                                setFormState({});
                            }} 
                            className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleSave} 
                            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors"
                        >
                            Save
                        </button>
                    </div>
                </div>
            )}

            {/* List of instances */}
            <div className="space-y-2">
                {seriesInstances.map(instance => (
                    <div key={instance.id} className="flex justify-between items-center p-3 border rounded-md hover:bg-gray-50">
                        <div>
                            <p className="font-medium">{instance.name}</p>
                            <p className="text-sm text-gray-600">
                                {instance.title?.title} at {instance.venue?.name}
                            </p>
                            <div className="flex items-center space-x-2 mt-1">
                                <span className="text-xs text-gray-500">
                                    {instance.year} {instance.quarter && `• Q${instance.quarter}`}
                                </span>
                                {instance.seriesCategory && (
                                    <span className="text-xs px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded">
                                        {formatCategoryName(instance.seriesCategory)}
                                    </span>
                                )}
                                {instance.holidayType && (
                                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded">
                                        {formatHolidayName(instance.holidayType)}
                                    </span>
                                )}
                                <span className={`text-xs px-2 py-0.5 rounded ${
                                    instance.status === APITypes.SeriesStatus.LIVE 
                                        ? 'bg-red-100 text-red-700'
                                        : instance.status === APITypes.SeriesStatus.COMPLETED
                                        ? 'bg-gray-100 text-gray-700'
                                        : 'bg-yellow-100 text-yellow-700'
                                }`}>
                                    {instance.status}
                                </span>
                            </div>
                        </div>
                        <div className="space-x-2">
                            <button 
                                onClick={() => openForm(instance)} 
                                className="text-sm text-blue-600 hover:text-blue-800"
                            >
                                Edit
                            </button>
                            <button 
                                onClick={() => onDelete(instance)} 
                                className="text-sm text-red-600 hover:text-red-800"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};