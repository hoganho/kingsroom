// src/components/series/SeriesTitleManager.tsx

import { useState } from 'react';
import * as APITypes from '../../API';

interface Props {
    titles: APITypes.TournamentSeriesTitle[];
    onSave: (input: { id?: string, title: string, seriesCategory?: APITypes.SeriesCategory | null, _version?: number }) => void;
    onDelete: (title: APITypes.TournamentSeriesTitle) => void;
}

export const SeriesTitleManager: React.FC<Props> = ({ titles, onSave, onDelete }) => {
    const [newTitle, setNewTitle] = useState('');
    const [newCategory, setNewCategory] = useState<APITypes.SeriesCategory | null>(null);
    const [editingTitle, setEditingTitle] = useState<APITypes.TournamentSeriesTitle | null>(null);

    const handleSave = () => {
        if (editingTitle) {
            onSave({ 
                id: editingTitle.id, 
                title: editingTitle.title, 
                seriesCategory: editingTitle.seriesCategory,
                _version: editingTitle._version 
            });
        } else {
            onSave({ 
                title: newTitle,
                seriesCategory: newCategory 
            });
        }
        setNewTitle('');
        setNewCategory(null);
        setEditingTitle(null);
    };

    const handleDeleteClick = (title: APITypes.TournamentSeriesTitle) => {
        // ✅ LOG 1: See what is being sent from the child component.
        console.log('[SeriesTitleManager] Delete button clicked. Passing this object to parent:', title);
        onDelete(title);
    };

    return (
        <div className="p-4 bg-white rounded-xl shadow-lg space-y-4">
            <h3 className="text-xl font-bold text-gray-800">Series Titles</h3>
            
            {/* Form for adding/editing */}
            <div className="space-y-2">
                <input
                    type="text"
                    placeholder="New series title..."
                    value={editingTitle ? editingTitle.title : newTitle}
                    onChange={(e) => {
                        if (editingTitle) {
                            setEditingTitle({ ...editingTitle, title: e.target.value });
                        } else {
                            setNewTitle(e.target.value);
                        }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
                
                {/* Series Category Dropdown */}
                <select
                    value={editingTitle ? (editingTitle.seriesCategory || '') : (newCategory || '')}
                    onChange={(e) => {
                        const value = e.target.value ? e.target.value as APITypes.SeriesCategory : null;
                        if (editingTitle) {
                            setEditingTitle({ ...editingTitle, seriesCategory: value });
                        } else {
                            setNewCategory(value);
                        }
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                    <option value="">Select Category (Optional)</option>
                    <option value={APITypes.SeriesCategory.REGULAR}>Regular</option>
                    <option value={APITypes.SeriesCategory.CHAMPIONSHIP}>Championship</option>
                    <option value={APITypes.SeriesCategory.SEASONAL}>Seasonal</option>
                    <option value={APITypes.SeriesCategory.SPECIAL}>Special Holiday</option>
                    <option value={APITypes.SeriesCategory.PROMOTIONAL}>Promotional</option>
                </select>
                
                <button 
                    onClick={handleSave} 
                    className="w-full px-4 py-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors"
                    disabled={!editingTitle && !newTitle.trim()}
                >
                    {editingTitle ? 'Update Title' : 'Add Title'}
                </button>
                
                {editingTitle && (
                    <button 
                        onClick={() => {
                            setEditingTitle(null);
                            // Reset new fields when canceling edit
                            setNewTitle('');
                            setNewCategory(null);
                        }} 
                        className="w-full text-center text-sm text-gray-600 mt-2 hover:text-gray-800"
                    >
                        Cancel Edit
                    </button>
                )}
            </div>

            {/* List of existing titles */}
            <div className="space-y-2">
                {titles.map(title => (
                    <div key={title.id} className="flex justify-between items-center p-2 border rounded-md hover:bg-gray-50">
                        <div className="flex items-center space-x-2">
                            <span className="font-medium">{title.title}</span>
                            {title.seriesCategory && (
                                <span className="text-xs px-2 py-1 bg-indigo-100 text-indigo-700 rounded-full">
                                    {title.seriesCategory.replace(/_/g, ' ')}
                                </span>
                            )}
                        </div>
                        <div className="space-x-2">
                            <button 
                                onClick={() => setEditingTitle(title)} 
                                className="text-sm text-blue-600 hover:text-blue-800"
                            >
                                Edit
                            </button>
                            {/* Call the new handler function */}
                            <button 
                                onClick={() => handleDeleteClick(title)} 
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