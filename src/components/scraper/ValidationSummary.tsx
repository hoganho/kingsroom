import React, { useMemo } from 'react'; // Import useMemo
import type { GameData } from '../../types/game';
// ✅ FIX: Added .ts extension to the import path
import { validateStructure } from '../../lib/validation.ts';

export const ValidationSummary: React.FC<{ data: GameData }> = ({ data }) => {
    
    // ✅ FIX: Use useMemo to prevent re-calculating and re-logging on every render.
    // This logic will now ONLY run if data.structureLabel or data.foundKeys changes.
    const validationResult = useMemo(() => {
        // Cannot generate a summary without the necessary info
        if (!data.structureLabel || !data.foundKeys) return null;

        // Your log is now inside useMemo, so it will only fire when data changes.
        console.log(`[ValidationSummary] Validating structure "${data.structureLabel}" with keys:`, data.foundKeys);
        
        return validateStructure(data.structureLabel, data.foundKeys);

    }, [data.structureLabel, data.foundKeys]); // Dependencies

    // If validation didn't run, render nothing.
    if (!validationResult) return null;

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
                        Please review the found data keys and add a new profile to <code>structureManifest.ts</code>.
                    </p>
                </div>
            );
        case 'MISSING_EXPECTED':
            return (
                <div className="p-3 bg-red-50 border-l-4 border-red-400 mb-4">
                    <h4 className="font-bold text-red-800">High-Priority Error: Missing Required Data!</h4>
                    <p className="text-xs mt-1 text-red-700">For a "{validationResult.profile?.description}", the following <strong>required</strong> fields were not found:</p>
                    <ul className="list-disc pl-5 mt-2 text-xs font-mono">
                        {validationResult.missingExpectedFields.map(field => (
                            <li key={field} className="text-red-700"><code>{field}</code></li>
                        ))}
                    </ul>
                </div>
            );
        case 'VALID':
            return (
                <div className="p-3 bg-green-50 border-l-4 border-green-400 mb-4">
                    <h4 className="font-bold text-green-800">Data Integrity Check: Passed ✅</h4>
                    <p className="text-xs mt-1 text-green-700">All {validationResult.profile?.expectedFields.length} expected fields for a "{validationResult.profile?.description}" were found.</p>
                    {renderMissingOptional()}
                </div>
            );
        default:
            return null;
    }
};