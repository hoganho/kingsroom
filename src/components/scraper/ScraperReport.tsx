// components/scraper/ScraperReport.tsx

import type { GameData } from '../../types/game';
import { useMemo } from 'react';
import { ValidationSummary } from './ValidationSummary';
import { BlindStructure } from './BlindStructure';
import { PlayerResults } from './PlayerResults';
import { PlayerEntries } from './PlayerEntries';
import { PlayerSeating } from './PlayerSeating';
import { LiveTables } from './LiveTables';
import { Breaks } from './Breaks';
import { fieldManifest } from '../../lib/fieldManifest';

const ReportField: React.FC<{
    fieldName: string;
    fieldValue: any;
    status: 'found' | 'missing' | 'optional-missing' | 'unprofiled';
}> = ({ fieldName, fieldValue, status }) => {
    
    const renderValue = () => {
        if (fieldValue === null || fieldValue === undefined) return null;
        if (Array.isArray(fieldValue)) {
            if (fieldValue.length === 0) return null;
            if (['levels', 'results', 'entries', 'seating', 'tables', 'breaks'].includes(fieldName)) {
                 return <span className="font-mono text-xs text-gray-500">[{fieldValue.length} items] - See component below</span>;
            }
            return <span className="font-mono text-xs">[{fieldValue.join(', ')}]</span>;
        }
        if (typeof fieldValue === 'boolean') return fieldValue ? 'Yes' : 'No';
        return String(fieldValue);
    };

    const value = renderValue();

    return (
        <div className="flex items-center text-xs py-1 border-b last:border-b-0">
            <span className="font-medium text-gray-600 w-32 flex-shrink-0">{fieldName}:</span>
            {status === 'found' ? (
                <span className="text-gray-800">{value}</span>
            ) : (
                <span className={`italic ${
                    status === 'missing' ? 'text-red-500 font-medium' :
                    status === 'optional-missing' ? 'text-gray-400' :
                    'text-blue-500'
                }`}>
                    {status === 'missing' && 'Missing (Expected)'}
                    {status === 'optional-missing' && 'Missing (Optional)'}
                    {status === 'unprofiled' && 'Missing (Unprofiled)'}
                </span>
            )}
        </div>
    );
};

export const ScraperReport: React.FC<{ data?: GameData }> = ({ data }) => {
    if (!data) return null;

    // Dynamically build the report sections from the manifest
    const reportSections = useMemo(() => {
        const sections: Record<string, string[]> = {};
        for (const fieldName in fieldManifest) {
            const group = fieldManifest[fieldName].group;
            if (!sections[group]) {
                sections[group] = [];
            }
            sections[group].push(fieldName);
        }
        return Object.entries(sections);
    }, []);

    const foundKeysSet = useMemo(() => new Set(data.foundKeys || []), [data.foundKeys]);

    // Determines the status of a field for rendering
    const getFieldStatus = (fieldName: string): 'found' | 'missing' | 'optional-missing' | 'unprofiled' => {
        if (foundKeysSet.has(fieldName)) return 'found';
        
        const def = fieldManifest[fieldName];
        if (!def) return 'unprofiled';

        if (def.isBaselineExpected || def.isProfileExpected?.includes(data.structureLabel || '')) {
            return 'missing';
        }
        
        if (def.isBaselineOptional || def.isProfileOptional?.includes(data.structureLabel || '')) {
            return 'optional-missing';
        }

        return 'unprofiled';
    };

    const manifestKeys = useMemo(() => new Set(Object.keys(fieldManifest)), []);
    const otherFoundKeys = (data.foundKeys || []).filter(key => !manifestKeys.has(key));

    return (
        <div className="mt-4 space-y-4">
            <ValidationSummary data={data} />
            
            {reportSections.map(([title, fields]) => (
                <div key={title} className="border rounded-lg bg-gray-50">
                    <h4 className="font-bold text-sm mb-2 text-gray-700 p-3 border-b bg-gray-100">{title}</h4>
                    <div className="grid grid-cols-1 gap-0 p-3">
                        {fields.map(fieldName => (
                            <ReportField 
                                key={fieldName}
                                fieldName={fieldName}
                                fieldValue={(data as any)[fieldName]}
                                status={getFieldStatus(fieldName)}
                            />
                        ))}
                    </div>
                </div>
            ))}

            {/* Complex Data Components */}
            <LiveTables tables={data.tables} />
            <PlayerResults results={data.results} />
            <PlayerSeating seating={data.seating} />
            <PlayerEntries entries={data.entries} />
            <Breaks breaks={data.breaks} levels={data.levels} />
            <BlindStructure levels={data.levels} />

            {otherFoundKeys.length > 0 && (
                <details className="border rounded-lg p-3 bg-blue-50">
                    <summary className="cursor-pointer text-sm font-medium text-blue-800">
                        Other Found Keys ({otherFoundKeys.length})
                    </summary>
                    <p className="text-xs text-blue-700 mt-1">These keys were found on the page but are not defined in the field manifest.</p>
                    <div className="mt-2 text-xs font-mono text-blue-700">
                        {otherFoundKeys.join(', ')}
                    </div>
                </details>
            )}
        </div>
    );
};