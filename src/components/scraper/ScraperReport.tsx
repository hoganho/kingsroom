// components/scraper/ScraperReport.tsx

import type { GameData } from '../../types/game';
import { useMemo, useState } from 'react';
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

// Modal component for displaying the raw HTML
const RawHtmlModal: React.FC<{ htmlContent: string; onClose: () => void }> = ({ htmlContent, onClose }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div className="bg-white rounded-lg shadow-xl w-11/12 max-w-4xl h-5/6 flex flex-col">
            <div className="flex justify-between items-center p-4 border-b">
                <h3 className="text-lg font-medium text-gray-800">Raw Scraped HTML</h3>
                <button
                    onClick={onClose}
                    className="text-gray-400 hover:text-gray-600"
                    aria-label="Close modal"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div className="p-4 flex-grow overflow-auto">
                <pre className="text-xs text-gray-700 whitespace-pre-wrap break-all">
                    <code>{htmlContent}</code>
                </pre>
            </div>
        </div>
    </div>
);


export const ScraperReport: React.FC<{ data?: GameData }> = ({ data }) => {
    // State to manage the visibility of the raw HTML modal
    const [isModalOpen, setIsModalOpen] = useState(false);

    if (!data) return null;

    const manifestKeys = useMemo(() => new Set(Object.keys(fieldManifest)), []);
    const otherFoundKeys = (data.foundKeys || []).filter(key => !manifestKeys.has(key));

    return (
        <div className="mt-4 space-y-4">
            {/* Render the modal component conditionally based on state */}
            {isModalOpen && data.rawHtml && (
                <RawHtmlModal htmlContent={data.rawHtml} onClose={() => setIsModalOpen(false)} />
            )}

            {/* --- Main summary remains visible at the top --- */}
            <ValidationSummary data={data} />
            
            {/* --- Collapsible Field Details --- */}
            <CollapsibleSection title="Field Details" defaultOpen={true}>
                {/* Button to open the raw HTML modal */}
                {data.rawHtml && (
                    <div className="my-4">
                        <button
                            onClick={() => setIsModalOpen(true)}
                            className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                            View Raw HTML
                        </button>
                    </div>
                )}
                <FieldManifestReport data={data} />
            </CollapsibleSection>

            {/* --- Complex Data Components (Now Collapsible) --- */}
            {data.tables && data.tables.length > 0 && (
                 <CollapsibleSection title={`Live Tables (${data.tables.length})`}>
                    <LiveTables tables={data.tables} />
                </CollapsibleSection>
            )}

            {data.results && data.results.length > 0 && (
                <CollapsibleSection title={`Player Results (${data.results.length})`}>
                    <PlayerResults results={data.results} />
                </CollapsibleSection>
            )}

            {data.seating && data.seating.length > 0 && (
                 <CollapsibleSection title={`Player Seating (${data.seating.length})`}>
                    <PlayerSeating seating={data.seating} />
                </CollapsibleSection>
            )}

            {data.entries && data.entries.length > 0 && (
                <CollapsibleSection title={`Player Entries (${data.entries.length})`}>
                    <PlayerEntries entries={data.entries} />
                </CollapsibleSection>
            )}

            {data.breaks && data.breaks.length > 0 && (
                <CollapsibleSection title={`Breaks (${data.breaks.length})`}>
                    <Breaks breaks={data.breaks} levels={data.levels} />
                </CollapsibleSection>
            )}

             {data.levels && data.levels.length > 0 && (
                <CollapsibleSection title={`Blind Structure (${data.levels.length} Levels)`}>
                    <BlindStructure levels={data.levels} />
                </CollapsibleSection>
            )}

            {/* --- Other Found Keys Section --- */}
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