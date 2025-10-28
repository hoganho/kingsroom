// src/components/series/SeriesTitleManager.tsx

import { useState } from 'react';
import * as APITypes from '../../API';

interface Props {
    titles: APITypes.TournamentSeriesTitle[];
    onSave: (input: { id?: string, title: string, _version?: number }) => void;
    onDelete: (title: APITypes.TournamentSeriesTitle) => void;
}

export const SeriesTitleManager: React.FC<Props> = ({ titles, onSave, onDelete }) => {
    const [newTitle, setNewTitle] = useState('');
    const [editingTitle, setEditingTitle] = useState<APITypes.TournamentSeriesTitle | null>(null);

    const handleSave = () => {
        if (editingTitle) {
            onSave({ id: editingTitle.id, title: editingTitle.title, _version: editingTitle._version });
        } else {
            onSave({ title: newTitle });
        }
        setNewTitle('');
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
                <button onClick={handleSave} className="w-full px-4 py-2 text-white bg-indigo-600 rounded-md">
                    {editingTitle ? 'Update Title' : 'Add Title'}
                </button>
                {editingTitle && <button onClick={() => setEditingTitle(null)} className="w-full text-center text-sm text-gray-600 mt-2">Cancel Edit</button>}
            </div>

            {/* List of existing titles */}
            <div className="space-y-2">
                {titles.map(title => (
                    <div key={title.id} className="flex justify-between items-center p-2 border rounded-md">
                        <span className="font-medium">{title.title}</span>
                        <div className="space-x-2">
                            <button onClick={() => setEditingTitle(title)} className="text-sm text-blue-600">Edit</button>
                            {/* Call the new handler function */}
                            <button onClick={() => handleDeleteClick(title)} className="text-sm text-red-600">Delete</button>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};