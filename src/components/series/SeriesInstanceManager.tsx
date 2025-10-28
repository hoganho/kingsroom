// src/components/series/SeriesInstanceManager.tsx

import { useState } from 'react';
import * as APITypes from '../../API';

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

    const openForm = (instance: APITypes.TournamentSeries | null = null) => {
        setFormState(instance || { status: APITypes.SeriesStatus.SCHEDULED });
        setIsFormOpen(true);
    };

    const handleSave = () => {
        onSave(formState);
        setIsFormOpen(false);
    };
    
    return (
        <div className="p-4 bg-white rounded-xl shadow-lg space-y-4">
             <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold text-gray-800">Series Instances</h3>
                <button onClick={() => openForm()} className="px-4 py-2 text-white bg-green-600 rounded-md">
                    New Instance
                </button>
            </div>

            {/* Form Modal */}
            {isFormOpen && (
                <div className="p-4 border rounded-md bg-gray-50 space-y-3">
                    <h4 className="font-bold">{formState.id ? 'Edit' : 'New'} Series Instance</h4>
                    {/* Form Fields */}
                    <input type="text" placeholder="Name (e.g., Sydney Millions 2025)" value={formState.name || ''} onChange={e => setFormState({...formState, name: e.target.value})} className="w-full p-2 border rounded" required />
                    <input type="number" placeholder="Year" value={formState.year || ''} onChange={e => setFormState({...formState, year: parseInt(e.target.value)})} className="w-full p-2 border rounded" required />
                    
                    <select value={formState.tournamentSeriesTitleId || ''} onChange={e => setFormState({...formState, tournamentSeriesTitleId: e.target.value})} className="w-full p-2 border rounded" required>
                        <option value="">Select a Series Title...</option>
                        {seriesTitles.map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
                    </select>
                    
                    <select value={formState.venueId || ''} onChange={e => setFormState({...formState, venueId: e.target.value})} className="w-full p-2 border rounded" required>
                        <option value="">Select a Venue...</option>
                        {venues.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                    
                    <select value={formState.status || ''} onChange={e => setFormState({...formState, status: e.target.value as APITypes.SeriesStatus})} className="w-full p-2 border rounded" required>
                        <option value={APITypes.SeriesStatus.SCHEDULED}>Scheduled</option>
                        <option value={APITypes.SeriesStatus.LIVE}>Live</option>
                        <option value={APITypes.SeriesStatus.COMPLETED}>Completed</option>
                    </select>

                    <div className="flex space-x-2">
                        <div>
                            <label className="text-sm">Start Date</label>
                            <input type="date" value={formState.startDate || ''} onChange={e => setFormState({...formState, startDate: e.target.value})} className="w-full p-2 border rounded" />
                        </div>
                         <div>
                            <label className="text-sm">End Date</label>
                            <input type="date" value={formState.endDate || ''} onChange={e => setFormState({...formState, endDate: e.target.value})} className="w-full p-2 border rounded" />
                        </div>
                    </div>
                    
                    <div className="flex justify-end space-x-2">
                        <button onClick={() => setIsFormOpen(false)} className="px-3 py-1 bg-gray-200 rounded">Cancel</button>
                        <button onClick={handleSave} className="px-3 py-1 bg-indigo-600 text-white rounded">Save</button>
                    </div>
                </div>
            )}

            {/* List of instances */}
            <div className="space-y-2">
                {seriesInstances.map(instance => (
                    <div key={instance.id} className="flex justify-between items-center p-2 border rounded-md">
                        <div>
                            <p className="font-medium">{instance.name}</p>
                            <p className="text-sm text-gray-600">{instance.title?.title} at {instance.venue?.name}</p>
                        </div>
                        <div className="space-x-2">
                            <button onClick={() => openForm(instance)} className="text-sm text-blue-600">Edit</button>
                            <button onClick={() => onDelete(instance)} className="text-sm text-red-600">Delete</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};