import React from 'react';

/**
 * StructureInfo component, extracted from GameCard
 */
export const StructureInfo: React.FC<{ 
    isNewStructure?: boolean; 
    structureLabel?: string;
    foundKeys?: string[];
}> = ({ isNewStructure, structureLabel, foundKeys }) => {
    if (!structureLabel) return null;

    return (
        <div className={`text-xs p-2 rounded ${isNewStructure ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50'}`}>
            <div className="flex items-center justify-between">
                <span className="font-medium">
                    Structure: <code className="font-mono">{structureLabel}</code>
                </span>
                {isNewStructure && (
                    <span className="text-yellow-600 font-semibold">⚠️ NEW STRUCTURE</span>
                )}
            </div>
            {foundKeys && foundKeys.length > 0 && (
                <details className="mt-2">
                    <summary className="cursor-pointer text-gray-600 hover:text-gray-800">
                        Found {foundKeys.length} keys
                    </summary>
                    <div className="mt-1 font-mono text-gray-500">
                        {foundKeys.join(', ')}
                    </div>
                </details>
            )}
        </div>
    );
};
