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

export const ScraperReport: React.FC<{ data?: GameData }> = ({ data }) => {
    if (!data) return null;

    const manifestKeys = useMemo(() => new Set(Object.keys(fieldManifest)), []);
    const otherFoundKeys = (data.foundKeys || []).filter(key => !manifestKeys.has(key));

    // Helper function to check if an array is not empty
    const hasData = (arr: unknown[] | undefined) => arr && arr.length > 0;

    return (
        <div className="mt-4 space-y-4">
            {/* --- Main summary remains visible at the top --- */}
            <ValidationSummary data={data} />
            
            {/* --- Collapsible Field Details --- */}
            <CollapsibleSection title="Field Details" defaultOpen={true}>
                <FieldManifestReport data={data} />
            </CollapsibleSection>

            {/* --- Complex Data Components (Now Collapsible) --- */}
            {hasData(data.tables) && (
                 <CollapsibleSection title={`Live Tables (${data.tables!.length})`}>
                    <LiveTables tables={data.tables} />
                </CollapsibleSection>
            )}

            {hasData(data.results) && (
                <CollapsibleSection title={`Player Results (${data.results!.length})`}>
                    <PlayerResults results={data.results} />
                </CollapsibleSection>
            )}

            {hasData(data.seating) && (
                 <CollapsibleSection title={`Player Seating (${data.seating!.length})`}>
                    <PlayerSeating seating={data.seating} />
                </CollapsibleSection>
            )}

            {hasData(data.entries) && (
                <CollapsibleSection title={`Player Entries (${data.entries!.length})`}>
                    <PlayerEntries entries={data.entries} />
                </CollapsibleSection>
            )}

            {hasData(data.breaks) && (
                <CollapsibleSection title={`Breaks (${data.breaks!.length})`}>
                    <Breaks breaks={data.breaks} levels={data.levels} />
                </CollapsibleSection>
            )}

             {hasData(data.levels) && (
                <CollapsibleSection title={`Blind Structure (${data.levels!.length} Levels)`}>
                    <BlindStructure levels={data.levels} />
                </CollapsibleSection>
            )}

            {/* --- Other Found Keys Section (Styled consistently) --- */}
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