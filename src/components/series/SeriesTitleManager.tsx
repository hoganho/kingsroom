// src/components/series/SeriesTitleManager.tsx

import { useState } from 'react';
import * as APITypes from '../../API';
import { PlusIcon, XMarkIcon, TagIcon } from '@heroicons/react/24/outline';

interface Props {
    titles: APITypes.TournamentSeriesTitle[];
    onSave: (input: { 
        id?: string; 
        title: string; 
        aliases?: string[] | null;
        seriesCategory?: APITypes.SeriesCategory | null; 
        _version?: number 
    }) => void;
    onDelete: (title: APITypes.TournamentSeriesTitle) => void;
}

export const SeriesTitleManager: React.FC<Props> = ({ titles, onSave, onDelete }) => {
    // New title form state
    const [newTitle, setNewTitle] = useState('');
    const [newCategory, setNewCategory] = useState<APITypes.SeriesCategory | null>(null);
    const [newAliases, setNewAliases] = useState<string[]>([]);
    const [newAliasInput, setNewAliasInput] = useState('');
    
    // Edit form state
    const [editingTitle, setEditingTitle] = useState<APITypes.TournamentSeriesTitle | null>(null);
    const [editAliases, setEditAliases] = useState<string[]>([]);
    const [editAliasInput, setEditAliasInput] = useState('');
    
    // UI state
    const [expandedTitleId, setExpandedTitleId] = useState<string | null>(null);

    // Handle adding a new alias to the new title form
    const handleAddNewAlias = () => {
        const trimmed = newAliasInput.trim();
        if (trimmed && !newAliases.includes(trimmed)) {
            setNewAliases([...newAliases, trimmed]);
            setNewAliasInput('');
        }
    };

    // Handle removing an alias from the new title form
    const handleRemoveNewAlias = (alias: string) => {
        setNewAliases(newAliases.filter(a => a !== alias));
    };

    // Handle adding a new alias to the edit form
    const handleAddEditAlias = () => {
        const trimmed = editAliasInput.trim();
        if (trimmed && !editAliases.includes(trimmed)) {
            setEditAliases([...editAliases, trimmed]);
            setEditAliasInput('');
        }
    };

    // Handle removing an alias from the edit form
    const handleRemoveEditAlias = (alias: string) => {
        setEditAliases(editAliases.filter(a => a !== alias));
    };

    // Open edit mode for a title
    const handleStartEdit = (title: APITypes.TournamentSeriesTitle) => {
        setEditingTitle(title);
        setEditAliases(title.aliases?.filter((a): a is string => a !== null) || []);
        setEditAliasInput('');
    };

    // Cancel editing
    const handleCancelEdit = () => {
        setEditingTitle(null);
        setEditAliases([]);
        setEditAliasInput('');
    };

    const handleSave = () => {
        if (editingTitle) {
            // Update existing title
            onSave({ 
                id: editingTitle.id, 
                title: editingTitle.title, 
                aliases: editAliases.length > 0 ? editAliases : null,
                seriesCategory: editingTitle.seriesCategory,
                _version: editingTitle._version 
            });
            handleCancelEdit();
        } else if (newTitle.trim()) {
            // Create new title
            onSave({ 
                title: newTitle.trim(),
                aliases: newAliases.length > 0 ? newAliases : null,
                seriesCategory: newCategory 
            });
            setNewTitle('');
            setNewCategory(null);
            setNewAliases([]);
            setNewAliasInput('');
        }
    };

    const handleDeleteClick = (title: APITypes.TournamentSeriesTitle) => {
        console.log('[SeriesTitleManager] Delete button clicked. Passing this object to parent:', title);
        onDelete(title);
    };

    const toggleExpanded = (titleId: string) => {
        setExpandedTitleId(expandedTitleId === titleId ? null : titleId);
    };

    // Alias tag component
    const AliasTag = ({ alias, onRemove }: { alias: string; onRemove?: () => void }) => (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs">
            {alias}
            {onRemove && (
                <button 
                    onClick={onRemove}
                    className="hover:text-red-500 transition-colors"
                    type="button"
                >
                    <XMarkIcon className="h-3 w-3" />
                </button>
            )}
        </span>
    );

    // Alias input component
    const AliasInput = ({ 
        value, 
        onChange, 
        onAdd, 
        aliases, 
        onRemove,
        placeholder = "Add alias (e.g., KC @ Churchills)"
    }: { 
        value: string; 
        onChange: (v: string) => void; 
        onAdd: () => void;
        aliases: string[];
        onRemove: (alias: string) => void;
        placeholder?: string;
    }) => (
        <div className="space-y-2">
            <label className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-1">
                <TagIcon className="h-4 w-4" />
                Aliases (alternative names for matching)
            </label>
            
            {/* Existing aliases */}
            {aliases.length > 0 && (
                <div className="flex flex-wrap gap-1">
                    {aliases.map(alias => (
                        <AliasTag 
                            key={alias} 
                            alias={alias} 
                            onRemove={() => onRemove(alias)} 
                        />
                    ))}
                </div>
            )}
            
            {/* Add new alias input */}
            <div className="flex gap-2">
                <input
                    type="text"
                    placeholder={placeholder}
                    value={value}
                    onChange={(e) => onChange(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            onAdd();
                        }
                    }}
                    className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <button
                    type="button"
                    onClick={onAdd}
                    disabled={!value.trim()}
                    className="px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    <PlusIcon className="h-4 w-4" />
                </button>
            </div>
            
            <p className="text-xs text-gray-500 dark:text-gray-400">
                Press Enter or click + to add. Aliases help match tournaments like "KC @ Churchills" to "Kings Cup @ Churchills".
            </p>
        </div>
    );

    return (
        <div className="p-4 bg-white dark:bg-gray-800 rounded-xl shadow-lg space-y-4">
            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">Series Titles</h3>
            
            {/* Form for adding new title */}
            {!editingTitle && (
                <div className="space-y-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                    <h4 className="font-medium text-gray-700 dark:text-gray-300">Add New Series Title</h4>
                    
                    <input
                        type="text"
                        placeholder="Series title (e.g., Kings Cup @ Churchills)"
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    
                    {/* Series Category Dropdown */}
                    <select
                        value={newCategory || ''}
                        onChange={(e) => setNewCategory(e.target.value ? e.target.value as APITypes.SeriesCategory : null)}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                        <option value="">Select Category (Optional)</option>
                        <option value={APITypes.SeriesCategory.REGULAR}>Regular</option>
                        <option value={APITypes.SeriesCategory.CHAMPIONSHIP}>Championship</option>
                        <option value={APITypes.SeriesCategory.SEASONAL}>Seasonal</option>
                        <option value={APITypes.SeriesCategory.SPECIAL}>Special Holiday</option>
                        <option value={APITypes.SeriesCategory.PROMOTIONAL}>Promotional</option>
                    </select>
                    
                    {/* Aliases section */}
                    <AliasInput
                        value={newAliasInput}
                        onChange={setNewAliasInput}
                        onAdd={handleAddNewAlias}
                        aliases={newAliases}
                        onRemove={handleRemoveNewAlias}
                    />
                    
                    <button 
                        onClick={handleSave} 
                        className="w-full px-4 py-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        disabled={!newTitle.trim()}
                    >
                        Add Title
                    </button>
                </div>
            )}

            {/* Edit form (shown when editing) */}
            {editingTitle && (
                <div className="space-y-3 p-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-lg border-2 border-indigo-200 dark:border-indigo-700">
                    <h4 className="font-medium text-indigo-700 dark:text-indigo-300">Edit Series Title</h4>
                    
                    <input
                        type="text"
                        placeholder="Series title"
                        value={editingTitle.title}
                        onChange={(e) => setEditingTitle({ ...editingTitle, title: e.target.value })}
                        className="w-full px-3 py-2 border border-indigo-300 dark:border-indigo-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                    
                    {/* Series Category Dropdown */}
                    <select
                        value={editingTitle.seriesCategory || ''}
                        onChange={(e) => {
                            const value = e.target.value ? e.target.value as APITypes.SeriesCategory : null;
                            setEditingTitle({ ...editingTitle, seriesCategory: value });
                        }}
                        className="w-full px-3 py-2 border border-indigo-300 dark:border-indigo-600 rounded-md bg-white dark:bg-gray-800 focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                        <option value="">Select Category (Optional)</option>
                        <option value={APITypes.SeriesCategory.REGULAR}>Regular</option>
                        <option value={APITypes.SeriesCategory.CHAMPIONSHIP}>Championship</option>
                        <option value={APITypes.SeriesCategory.SEASONAL}>Seasonal</option>
                        <option value={APITypes.SeriesCategory.SPECIAL}>Special Holiday</option>
                        <option value={APITypes.SeriesCategory.PROMOTIONAL}>Promotional</option>
                    </select>
                    
                    {/* Aliases section for editing */}
                    <AliasInput
                        value={editAliasInput}
                        onChange={setEditAliasInput}
                        onAdd={handleAddEditAlias}
                        aliases={editAliases}
                        onRemove={handleRemoveEditAlias}
                    />
                    
                    <div className="flex gap-2">
                        <button 
                            onClick={handleCancelEdit} 
                            className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-600 rounded-md hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleSave} 
                            className="flex-1 px-4 py-2 text-white bg-indigo-600 rounded-md hover:bg-indigo-700 transition-colors"
                        >
                            Update Title
                        </button>
                    </div>
                </div>
            )}

            {/* List of existing titles */}
            <div className="space-y-2">
                {titles.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        No series titles found. Create one above.
                    </div>
                ) : (
                    titles.map(title => (
                        <div 
                            key={title.id} 
                            className={`p-3 border rounded-md transition-colors ${
                                editingTitle?.id === title.id 
                                    ? 'border-indigo-300 dark:border-indigo-600 bg-indigo-50/50 dark:bg-indigo-900/20' 
                                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/50'
                            }`}
                        >
                            <div className="flex justify-between items-start">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-medium text-gray-800 dark:text-gray-100">
                                            {title.title}
                                        </span>
                                        {title.seriesCategory && (
                                            <span className="text-xs px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300 rounded-full">
                                                {title.seriesCategory.replace(/_/g, ' ')}
                                            </span>
                                        )}
                                        {title.aliases && title.aliases.length > 0 && (
                                            <button
                                                onClick={() => toggleExpanded(title.id)}
                                                className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                                            >
                                                {title.aliases.length} alias{title.aliases.length !== 1 ? 'es' : ''}
                                            </button>
                                        )}
                                    </div>
                                    
                                    {/* Show aliases when expanded */}
                                    {expandedTitleId === title.id && title.aliases && title.aliases.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-1">
                                            {title.aliases.filter((a): a is string => a !== null).map(alias => (
                                                <AliasTag key={alias} alias={alias} />
                                            ))}
                                        </div>
                                    )}
                                </div>
                                
                                <div className="flex gap-2 ml-2">
                                    <button 
                                        onClick={() => handleStartEdit(title)} 
                                        className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                                        disabled={editingTitle !== null}
                                    >
                                        Edit
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteClick(title)} 
                                        className="text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                                        disabled={editingTitle !== null}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};