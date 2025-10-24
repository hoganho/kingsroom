import React, { useMemo } from 'react';
import type { GameData } from '../../types/game';
import { validateStructure } from '../../lib/validation.ts';

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

    // ... (renderMissingOptional function remains the same)
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
            // ... (this case remains the same)
            return (
                <div className="p-3 bg-yellow-50 border-l-4 border-yellow-400 mb-4">
                    <h4 className="font-bold text-yellow-800">Un-profiled Structure Detected</h4>
                    <p className="text-xs mt-1 text-yellow-700">
                        This page has a new structure label: <strong className="font-mono">{data.structureLabel}</strong>.
                        Please review the found data keys and add a new profile to <code>structureManifest.ts</code>.
                    </p>
                </div>
            );
            
        case 'MISSING_EXPECTED':
            return (
                <div className="p-3 bg-red-50 border-l-4 border-red-400 mb-4">
                    <h4 className="font-bold text-red-800">High-Priority Error: Missing Required Data!</h4>
                    
                    {/* ✅ Render the two lists separately */}
                    <FieldList 
                        fields={validationResult.missingBaseExpectedFields}
                        title="Missing Baseline Fields"
                        description="These fields are required for ALL game structures."
                    />
                    
                    <FieldList
                        fields={validationResult.missingProfileExpectedFields}
                        title="Missing Structure-Specific Fields"
                        description={`For a "${validationResult.profile?.description}", these additional fields were expected:`}
                    />
                </div>
            );
            
        case 'VALID':
            return (
                <div className="p-3 bg-green-50 border-l-4 border-green-400 mb-4">
                    <h4 className="font-bold text-green-800">Data Integrity Check: Passed ✅</h4>
                    
                    {/* ✅ Show a detailed success message */}
                    <div className="text-xs mt-2 space-y-1 text-green-700">
                        <p>✓ All <strong>{validationResult.baseProfile.expectedFields.length} baseline fields</strong> were found.</p>
                        {validationResult.profile && validationResult.profile.expectedFields.length > 0 && (
                             <p>✓ All <strong>{validationResult.profile.expectedFields.length} specific fields</strong> for a "{validationResult.profile.description}" were found.</p>
                        )}
                    </div>

                    {renderMissingOptional()}
                </div>
            );
            
        default:
            return null;
    }
};