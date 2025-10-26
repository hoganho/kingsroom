import React, { useMemo } from 'react';
import type { GameData } from '../../types/game';
import { validateStructure } from '../../lib/validation';
// Import the descriptions from your single source of truth
import { profileDescriptions } from '../../lib/fieldManifest';

// Helper component for rendering lists to keep the main component clean
const FieldList: React.FC<{ fields: string[]; title: string; description?: string; className?: string }> = ({ fields, title, description, className = 'text-red-700' }) => {
    if (fields.length === 0) return null;
    return (
        <div className="mt-3">
            <h5 className="font-semibold text-gray-800 text-xs">{title}</h5>
            {description && <p className="text-xs mt-1 text-gray-600">{description}</p>}
            <ul className="list-disc pl-5 mt-2 text-xs font-mono">
                {fields.map(field => (
                    <li key={field} className={className}><code>{field}</code></li>
                ))}
            </ul>
        </div>
    );
};


export const ValidationSummary: React.FC<{ data: GameData }> = ({ data }) => {
    
    const validationResult = useMemo(() => {
        if (!data.structureLabel || !data.foundKeys) return null;
        return validateStructure(data.structureLabel, data.foundKeys);
    }, [data.structureLabel, data.foundKeys]);

    if (!validationResult) return null;

    // Get the profile description from the new manifest
    const profileDescription = data.structureLabel ? profileDescriptions[data.structureLabel] : 'unknown profile';

    const renderMissingOptional = () => {
        if (validationResult.missingOptionalFields.length === 0) return null;
        return (
            <div className="mt-2 text-xs">
                <p className="text-gray-600">
                    <strong>Note:</strong> The following optional fields were not found: <code className="font-mono text-gray-500 bg-gray-200 p-1 rounded">{validationResult.missingOptionalFields.join(', ')}</code>.
                </p>
            </div>
        );
    };

    switch (validationResult.status) {
        case 'UNPROFILED':
            return (
                <div className="p-3 bg-yellow-50 border-l-4 border-yellow-400 mb-4">
                    <h4 className="font-bold text-yellow-800">Un-profiled Structure Detected</h4>
                    <p className="text-xs mt-1 text-yellow-700">
                        This page has a new structure label: <strong className="font-mono">{data.structureLabel}</strong>.
                        Please review the found data keys and add a new profile to <code>fieldManifest.ts</code>.
                    </p>
                </div>
            );
            
        case 'MISSING_EXPECTED':
            return (
                <div className="p-3 bg-red-50 border-l-4 border-red-400 mb-4">
                    <h4 className="font-bold text-red-800">High-Priority Error: Missing Required Data!</h4>
                    
                    <FieldList 
                        fields={validationResult.missingBaseExpectedFields}
                        title="Missing Baseline Fields"
                        description="These fields are required for ALL game structures."
                    />
                    
                    <FieldList
                        fields={validationResult.missingProfileExpectedFields}
                        title="Missing Structure-Specific Fields"
                        description={`For a "${profileDescription}", these additional fields were expected:`}
                    />
                </div>
            );
            
        case 'VALID':
            return (
                <div className="p-3 bg-green-50 border-l-4 border-green-400 mb-4">
                    <h4 className="font-bold text-green-800">Data Integrity Check: Passed ✅</h4>
                    
                    <div className="text-xs mt-2 space-y-1 text-green-700">
                        <p>✓ All baseline expected fields were found.</p>
                        {validationResult.missingProfileExpectedFields.length === 0 && (
                             <p>✓ All specific fields for a "{profileDescription}" were found.</p>
                        )}
                    </div>

                    {renderMissingOptional()}
                </div>
            );
            
        default:
            return null;
    }
};