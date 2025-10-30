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
import { FieldManifestReport } from './FieldManifestReport';
import { CollapsibleSection } from '../layout/CollapsibleSection';

// Helper to check if any expected field is missing across the entire manifest.
const areAnyExpectedFieldsMissing = (data: GameData): boolean => {
    const gameProfileKey = `STATUS: ${data.gameStatus || 'UNKNOWN'} | REG: ${data.registrationStatus || 'UNKNOWN'}`;
    
    for (const key in fieldManifest) {
        const definition = fieldManifest[key];
        const hasValue = data?.[key as keyof GameData] !== undefined && data?.[key as keyof GameData] !== null && data?.[key as keyof GameData] !== '';

        if (definition.isBaselineExpected && !hasValue) {
            return true;
        }
        if (definition.isProfileExpected?.includes(gameProfileKey) && !hasValue) {
            return true;
        }
    }
    return false;
};

export const ScraperReport: React.FC<{ data?: GameData }> = ({ data }) => {
    if (!data) return null;

    const manifestKeys = useMemo(() => new Set(Object.keys(fieldManifest)), []);
    const otherFoundKeys = (data.foundKeys || []).filter(key => !manifestKeys.has(key));

    // ✅ Determine the status for the "Field Details" header
    const hasMissingFields = useMemo(() => areAnyExpectedFieldsMissing(data), [data]);
    const fieldDetailsStatusIcon = (
        <span className={`ml-2 font-bold ${hasMissingFields ? 'text-red-600' : 'text-green-600'}`}>
            {hasMissingFields ? '✗' : '✓'}
        </span>
    );
    // Combine title and icon into a single React node for the title prop
    const fieldDetailsTitle = <>{'Field Details'} {fieldDetailsStatusIcon}</>;

    return (
        <div className="mt-4 space-y-4">
            {/* --- Main summary remains visible at the top --- */}
            <ValidationSummary data={data} />
            
            {/* --- Collapsible Field Details --- */}
            {/* ✅ UPDATED: defaultOpen is now false, and the title includes a status icon */}
            <CollapsibleSection title={fieldDetailsTitle} defaultOpen={false}>
                <FieldManifestReport data={data} />
            </CollapsibleSection>

            {/* --- Complex Data Components (Now Collapsible and defaulted to closed) --- */}
            {data.tables && data.tables.length > 0 && (
                 <CollapsibleSection title={`Live Tables (${data.tables.length})`} defaultOpen={false}>
                    <LiveTables tables={data.tables} />
                </CollapsibleSection>
            )}

            {data.results && data.results.length > 0 && (
                <CollapsibleSection title={`Player Results (${data.results.length})`} defaultOpen={false}>
                    <PlayerResults results={data.results} />
                </CollapsibleSection>
            )}

            {data.seating && data.seating.length > 0 && (
                 <CollapsibleSection title={`Player Seating (${data.seating.length})`} defaultOpen={false}>
                    <PlayerSeating seating={data.seating} />
                </CollapsibleSection>
            )}

            {data.entries && data.entries.length > 0 && (
                <CollapsibleSection title={`Player Entries (${data.entries.length})`} defaultOpen={false}>
                    <PlayerEntries entries={data.entries} />
                </CollapsibleSection>
            )}

            {data.breaks && data.breaks.length > 0 && (
                <CollapsibleSection title={`Breaks (${data.breaks.length})`} defaultOpen={false}>
                    <Breaks breaks={data.breaks} levels={data.levels} />
                </CollapsibleSection>
            )}

             {data.levels && data.levels.length > 0 && (
                <CollapsibleSection title={`Blind Structure (${data.levels.length} Levels)`} defaultOpen={false}>
                    <BlindStructure levels={data.levels} />
                </CollapsibleSection>
            )}

            {/* --- Other Found Keys Section (using details tag, which is collapsed by default) --- */}
            {otherFoundKeys.length > 0 && (
                <details className="border border-yellow-300 rounded-lg bg-yellow-50">
                    <summary className="cursor-pointer select-none p-3 text-sm font-medium text-yellow-800">
                        Other Found Keys ({otherFoundKeys.length})
                    </summary>
                    <div className="p-3 border-t border-yellow-200">
                        <p className="text-xs text-yellow-700 mt-1">These keys were found on the page but are not defined in the field manifest.</p>
                        <div className="mt-2 text-xs font-mono text-yellow-900">
                            {otherFoundKeys.join(', ')}
                        </div>
                    </div>
                </details>
            )}
        </div>
    );
};