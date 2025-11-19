// src/components/scraper/SaveConfirmation/TemplatePicker.tsx

import { useState, useEffect } from 'react';
import type { GameData } from '../../../types/game';
import { 
    tournamentTemplates, 
    getTemplateSuggestions,
    type TournamentTemplate 
} from '../../../lib/tournamentTemplates';

interface TemplatePickerProps {
    currentData: GameData;
    onApplyTemplate: (template: TournamentTemplate, overwrite: boolean) => void;
    onClose?: () => void;
}

export const TemplatePicker: React.FC<TemplatePickerProps> = ({
    currentData,
    onApplyTemplate,
    onClose
}) => {
    const [selectedTemplate, setSelectedTemplate] = useState<TournamentTemplate | null>(null);
    const [overwriteExisting, setOverwriteExisting] = useState(false);
    const [suggestions, setSuggestions] = useState<TournamentTemplate[]>([]);
    const [activeCategory, setActiveCategory] = useState<string>('all');
    
    useEffect(() => {
        // Get template suggestions based on current data
        const suggested = getTemplateSuggestions(currentData);
        setSuggestions(suggested);
        
        // Auto-select first suggestion
        if (suggested.length > 0) {
            setSelectedTemplate(suggested[0]);
        }
    }, [currentData]);
    
    const categories = ['all', 'daily', 'weekly', 'special', 'series', 'satellite'];
    
    const filteredTemplates = activeCategory === 'all' 
        ? tournamentTemplates 
        : tournamentTemplates.filter((t: TournamentTemplate) => t.category === activeCategory);
    
    const handleApply = () => {
        if (selectedTemplate) {
            onApplyTemplate(selectedTemplate, overwriteExisting);
            onClose?.();
        }
    };
    
    const getFieldsToBeApplied = (template: TournamentTemplate): string[] => {
        const fieldsToApply: string[] = [];
        
        for (const key of Object.keys(template.fields)) {
            const currentValue = currentData[key as keyof GameData];
            
            if (overwriteExisting || currentValue === null || currentValue === undefined || currentValue === '') {
                fieldsToApply.push(key);
            }
        }
        
        return fieldsToApply;
    };
    
    return (
        <div className="space-y-4">
            {/* Suggestions */}
            {suggestions.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <div className="text-sm font-medium text-blue-900 mb-2">
                        🎯 Suggested Templates
                    </div>
                    <div className="flex gap-2">
                        {suggestions.map(template => (
                            <button
                                key={template.id}
                                onClick={() => setSelectedTemplate(template)}
                                className={`px-3 py-2 rounded text-xs font-medium transition-colors ${
                                    selectedTemplate?.id === template.id
                                        ? 'bg-blue-600 text-white'
                                        : 'bg-white text-blue-700 hover:bg-blue-100'
                                }`}
                            >
                                {template.icon} {template.name}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            
            {/* Category Tabs */}
            <div className="border-b">
                <div className="flex gap-2">
                    {categories.map(category => (
                        <button
                            key={category}
                            onClick={() => setActiveCategory(category)}
                            className={`px-3 py-2 text-sm font-medium capitalize transition-colors ${
                                activeCategory === category
                                    ? 'text-blue-600 border-b-2 border-blue-600'
                                    : 'text-gray-600 hover:text-gray-800'
                            }`}
                        >
                            {category}
                        </button>
                    ))}
                </div>
            </div>
            
            {/* Template Grid */}
            <div className="grid grid-cols-2 gap-3 max-h-60 overflow-y-auto">
                {filteredTemplates.map((template: TournamentTemplate) => (
                    <button
                        key={template.id}
                        onClick={() => setSelectedTemplate(template)}
                        className={`p-3 border rounded-lg text-left transition-all ${
                            selectedTemplate?.id === template.id
                                ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500'
                                : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                        }`}
                    >
                        <div className="flex items-start gap-2">
                            <span className="text-2xl">{template.icon}</span>
                            <div className="flex-1">
                                <div className="font-medium text-sm">{template.name}</div>
                                <div className="text-xs text-gray-600 mt-1">
                                    {template.description}
                                </div>
                            </div>
                        </div>
                    </button>
                ))}
            </div>
            
            {/* Preview */}
            {selectedTemplate && (
                <div className="border rounded-lg p-3 bg-gray-50">
                    <div className="font-medium text-sm mb-2">
                        Template Preview: {selectedTemplate.name}
                    </div>
                    
                    <div className="space-y-1 text-xs">
                        {getFieldsToBeApplied(selectedTemplate).length === 0 ? (
                            <div className="text-gray-500 italic">
                                No fields will be changed (all fields already have values)
                            </div>
                        ) : (
                            <>
                                <div className="text-gray-600 mb-1">
                                    Fields to be {overwriteExisting ? 'updated' : 'filled'}:
                                </div>
                                <div className="flex flex-wrap gap-1">
                                    {getFieldsToBeApplied(selectedTemplate).map(field => (
                                        <span 
                                            key={field}
                                            className="px-2 py-0.5 bg-white border border-gray-300 rounded"
                                        >
                                            {field}
                                        </span>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    
                    <div className="mt-3 pt-3 border-t">
                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={overwriteExisting}
                                onChange={(e) => setOverwriteExisting(e.target.checked)}
                                className="h-4 w-4"
                            />
                            <span className={overwriteExisting ? 'text-orange-600 font-medium' : 'text-gray-600'}>
                                Overwrite existing values
                            </span>
                        </label>
                    </div>
                </div>
            )}
            
            {/* Actions */}
            <div className="flex justify-end gap-2">
                <button
                    onClick={onClose}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                >
                    Cancel
                </button>
                <button
                    onClick={handleApply}
                    disabled={!selectedTemplate}
                    className={`px-4 py-2 text-sm rounded ${
                        selectedTemplate
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                >
                    Apply Template
                </button>
            </div>
        </div>
    );
};