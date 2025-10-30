// FieldManifestReport.tsx

import { useMemo } from 'react';
import type { GameData } from '../../types/game';
import { fieldManifest, profileDescriptions } from '../../lib/fieldManifest';
import { VenueMatchDisplay } from './VenueMatchDisplay';

// Helper to determine if an expected field is missing.
const isFieldMissing = (key: string, data: GameData, profile: string): boolean => {
    const definition = fieldManifest[key];
    const hasValue = data?.[key as keyof GameData] !== undefined && data?.[key as keyof GameData] !== null && data?.[key as keyof GameData] !== '';

    if (definition.isBaselineExpected) {
        return !hasValue;
    }
    if (definition.isProfileExpected?.includes(profile)) {
        return !hasValue;
    }
    return false;
};

const getValidationStatus = (
    key: string,
    data: GameData | undefined,
    profile: string
) => {
    const definition = fieldManifest[key];
    const hasValue = data?.[key as keyof GameData] !== undefined && data?.[key as keyof GameData] !== null && data?.[key as keyof GameData] !== '';

    if (definition.isBaselineExpected) {
        return hasValue 
            ? { status: 'Present', icon: '✓', color: 'text-green-600' }
            : { status: 'Missing Expected', icon: '✗', color: 'text-red-600 font-bold' };
    }
    
    if (definition.isProfileExpected?.includes(profile)) {
        return hasValue
            ? { status: 'Present', icon: '✓', color: 'text-green-600' }
            : { status: 'Missing Expected', icon: '✗', color: 'text-red-600 font-bold' };
    }

    if (definition.isBaselineOptional || definition.isProfileOptional?.includes(profile)) {
         return hasValue
            ? { status: 'Present (Optional)', icon: '✓', color: 'text-green-600' }
            : { status: 'Not Found (Optional)', icon: '•', color: 'text-gray-400' };
    }

    return hasValue
        ? { status: 'Unexpected', icon: '!', color: 'text-orange-500' }
        : null;
};

export const FieldManifestReport: React.FC<{ data: GameData | undefined }> = ({ data }) => {
    if (!data) return null;

    const gameProfileKey = `STATUS: ${data.gameStatus || 'UNKNOWN'} | REG: ${data.registrationStatus || 'UNKNOWN'}`;
    const profileDescription = profileDescriptions[gameProfileKey];

    const structuredFields = useMemo(() => {
        const result: Record<string, {
            baseline: { expected: string[], optional: string[] },
            profile: { expected: string[], optional: string[] }
        }> = {};

        for (const key in fieldManifest) {
            const def = fieldManifest[key];
            if (!result[def.group]) {
                result[def.group] = {
                    baseline: { expected: [], optional: [] },
                    profile: { expected: [], optional: [] }
                };
            }

            if (def.isBaselineExpected) result[def.group].baseline.expected.push(key);
            else if (def.isBaselineOptional) result[def.group].baseline.optional.push(key);
            else if (def.isProfileExpected) result[def.group].profile.expected.push(key);
            else if (def.isProfileOptional) result[def.group].profile.optional.push(key);
        }
        return result;
    }, []);

    const renderField = (key: string) => {
        if (key === 'venueName') {
            return <VenueMatchDisplay key={key} venueMatch={data.venueMatch} />;
        }
        
        const validation = getValidationStatus(key, data, gameProfileKey);
        if (!validation) return null;

        const definition = fieldManifest[key];
        const value = data[key as keyof GameData];
        const displayValue = Array.isArray(value) ? `[${value.length} items]`
            : typeof value === 'object' && value !== null ? '{ Object }'
            : value === true ? 'Yes'
            : value === false ? 'No'
            : String(value ?? 'N/A');

        return (
            <div key={key} className="flex items-center text-xs py-1.5 border-b border-gray-200 last:border-b-0" title={`Status: ${validation.status}`}>
                <span className={`w-5 text-center font-bold ${validation.color}`}>{validation.icon}</span>
                <span className="text-gray-600 w-32 flex-shrink-0">{definition.label}:</span>
                <span className="font-mono text-gray-800 truncate" title={displayValue}>{displayValue}</span>
            </div>
        );
    };

    const renderSubGroup = (title: string, fields: string[]) => {
        if (fields.length === 0) return null;
        return (
            <>
                <h5 className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 mt-2">{title}</h5>
                {fields.map(renderField)}
            </>
        );
    };
    
    return (
        <div className="space-y-4">
            {profileDescription && (
                <div className="p-2 text-xs bg-blue-50 border border-blue-200 rounded-md">
                    <p className="font-bold text-blue-800">Profile Detected: <span className="font-mono">{gameProfileKey}</span></p>
                    <p className="text-blue-700 italic mt-1">{profileDescription}</p>
                </div>
            )}
            
            {/* ✅ UPDATED: Render groups as collapsible sections with status icons */}
            {Object.entries(structuredFields).map(([groupName, groupData]) => {
                const expectedFields = [...groupData.baseline.expected, ...groupData.profile.expected];
                const hasMissingFields = expectedFields.some(key => isFieldMissing(key, data, gameProfileKey));
                const statusIcon = hasMissingFields ? '✗' : '✓';
                const iconColor = hasMissingFields ? 'text-red-600' : 'text-green-600';

                return (
                    <details key={groupName} className="border rounded-lg bg-white overflow-hidden">
                        <summary className="cursor-pointer select-none p-3 font-bold text-sm text-gray-700 bg-gray-50 hover:bg-gray-100 flex items-center">
                            <span>
                                {groupName}
                                <span className={`ml-2 font-bold ${iconColor}`}>{statusIcon}</span>
                            </span>
                        </summary>
                        <div className="px-3 pb-2">
                            {renderSubGroup('Baseline Expected', groupData.baseline.expected)}
                            {renderSubGroup('Baseline Optional', groupData.baseline.optional)}
                            {renderSubGroup('Profile Expected', groupData.profile.expected)}
                            {renderSubGroup('Profile Optional', groupData.profile.optional)}
                        </div>
                    </details>
                )
            })}
        </div>
    );
};