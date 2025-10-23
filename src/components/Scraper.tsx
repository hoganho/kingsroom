import { useState } from 'react';
import { useGameTracker } from '../hooks/useGameTracker';
import type { GameState, MissingField, PlayerResultData, GameData, JobStatus } from '../types/game';

// This modal is for viewing the raw HTML source
const HtmlModal: React.FC<{ 
    isOpen: boolean; 
    onClose: () => void; 
    html: string;
    gameId: string;
}> = ({ isOpen, onClose, html, gameId }) => {
    const [copySuccess, setCopySuccess] = useState(false);

    if (!isOpen) return null;

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(html);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] flex flex-col">
                <div className="flex justify-between items-center p-4 border-b">
                    <div>
                        <h3 className="text-lg font-semibold">Raw HTML Response</h3>
                        <p className="text-xs text-gray-500 mt-1">{gameId}</p>
                    </div>
                    <div className="flex items-center space-x-2">
                        <button
                            onClick={handleCopy}
                            className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded transition-colors"
                        >
                            {copySuccess ? '✓ Copied!' : 'Copy to Clipboard'}
                        </button>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                        >
                            ×
                        </button>
                    </div>
                </div>
                <div className="p-4 overflow-auto flex-1">
                    <div className="bg-gray-50 rounded p-3 border border-gray-200">
                        {html ? (
                            <>
                                <div className="mb-2 text-sm text-gray-600">
                                    HTML Length: {html.length.toLocaleString()} characters
                                </div>
                                <pre className="whitespace-pre-wrap break-all text-xs font-mono text-gray-700">
                                    {html}
                                </pre>
                            </>
                        ) : (
                            <p className="text-gray-500 italic">No HTML data available</p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// This component provides a detailed report of what was and wasn't found
const ScraperReport: React.FC<{ data?: GameData, missingFields?: MissingField[] }> = ({ data, missingFields }) => {
    if (!data) return null;

    const reportConfig: Record<string, string[]> = {
        'Game': ['name', 'gameDateTime', 'status', 'registrationStatus', 'gameVariant', 'prizepool', 'totalEntries', 'totalRebuys', 'totalAddons', 'totalDuration', 'gameTags'],
        'TournamentStructure': ['buyIn', 'startingStack', 'hasGuarantee', 'guaranteeAmount', 'tournamentType', 'rake'],
        'TournamentLevel': ['levels'],
    };

    const getMissingField = (model: string, field: string) => {
        return missingFields?.find(mf => mf.model === model && mf.field === field);
    };
    
    const unscrapableModels = missingFields
        ?.filter(mf => mf.field === 'all fields')
        .reduce((acc, curr) => {
            if (!acc[curr.model]) acc[curr.model] = [];
            acc[curr.model].push(curr.reason);
            return acc;
        }, {} as Record<string, string[]>) || {};


    return (
        <div className="mt-2 bg-gray-50 p-3 rounded-md border border-gray-200 space-y-3">
            <h5 className="text-sm font-semibold text-gray-800">📋 Scraper Report</h5>
            {Object.entries(reportConfig).map(([model, fields]) => (
                <div key={model}>
                    <h6 className="text-xs font-bold text-gray-600">{model}</h6>
                    <ul className="pl-2 mt-1 space-y-1 text-xs">
                        {fields.map(field => {
                            const value = (data as any)[field];
                            const missingInfo = getMissingField(model, field);
                            if (value !== undefined && value !== null && !(Array.isArray(value) && value.length === 0)) {
                                let displayValue: string;
                                if (field === 'levels') displayValue = `${(value as any[]).length} levels found`;
                                else if (Array.isArray(value)) displayValue = `[${value.join(', ')}]`;
                                else if (typeof value === 'number') displayValue = value.toLocaleString();
                                else if (typeof value === 'boolean') displayValue = value ? 'Yes' : 'No';
                                else displayValue = `"${value}"`;
                                return (
                                    <li key={field} className="flex items-start">
                                        <span className="mr-2">✅</span>
                                        <div><span className="font-semibold">{field}:</span> <span className="font-mono text-indigo-700">{displayValue}</span></div>
                                    </li>
                                );
                            } else if (missingInfo) {
                                return (
                                     <li key={field} className="flex items-start">
                                        <span className="mr-2">❌</span>
                                        <div><span className="font-semibold">{field}:</span> <span className="text-red-700">{missingInfo.reason}</span></div>
                                    </li>
                                );
                            }
                            return null;
                        })}
                    </ul>
                </div>
            ))}
            {Object.keys(unscrapableModels).length > 0 && (
                <div>
                     <h6 className="text-xs font-bold text-gray-600">Manual Entry Required</h6>
                     <ul className="pl-2 mt-1 space-y-1 text-xs">
                        {Object.entries(unscrapableModels).map(([model, reasons]) => (
                           <li key={model} className="flex items-start">
                                <span className="mr-2">ℹ️</span>
                                <div><span className="font-semibold">{model}:</span> <span className="text-gray-600">{reasons[0]}</span></div>
                            </li>
                        ))}
                     </ul>
                </div>
            )}
        </div>
    );
};

// This component shows the player results found on the page
const PlayerResults: React.FC<{ results?: PlayerResultData[] }> = ({ results }) => {
    if (!results || results.length === 0) return null;
    return (
        <div className="mt-2">
            <h5 className="text-sm font-semibold text-gray-800 mb-1">Player Results Found</h5>
            <div className="max-h-40 overflow-y-auto border rounded-md text-xs">
                <table className="w-full">
                    <thead className="bg-gray-100 sticky top-0">
                        <tr>
                            <th className="p-1 text-left font-medium">Rank</th>
                            <th className="p-1 text-left font-medium">Name</th>
                            <th className="p-1 text-right font-medium">Winnings</th>
                        </tr>
                    </thead>
                    <tbody className="bg-white">
                        {results.map(r => (
                            <tr key={r.rank + r.name} className="border-t">
                                <td className="p-1 text-center font-mono">{r.rank}</td>
                                <td className="p-1">{r.name}</td>
                                <td className="p-1 text-right font-mono">${r.winnings.toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

/**
 * ✅ UPDATED: Save Confirmation Modal with all schema fields.
 */
const SaveConfirmationModal: React.FC<{
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    gameData?: GameData;
    venueId: string;
    sourceUrl: string;
}> = ({ isOpen, onClose, onConfirm, gameData, venueId, sourceUrl }) => {
    if (!isOpen || !gameData) return null;

    const renderValue = (value: any) => {
        if (value === undefined || value === null) {
            return <span className="text-gray-400 font-mono">NULL</span>;
        }
        if (typeof value === 'boolean') {
            return <span className="font-mono text-green-700">{value ? 'true' : 'false'}</span>;
        }
        if (Array.isArray(value)) {
            if (value.length === 0) return <span className="text-gray-400 font-mono">[]</span>;
            return <span className="font-mono text-indigo-700 break-all">[{value.join(', ')}]</span>;
        }
        return <span className="font-mono text-indigo-700 break-all">{value.toLocaleString()}</span>;
    };

    const modalDataConfig = {
        'Venue': { id: venueId, name: null, address: null, city: null, country: null },
        'Game': {
            id: '(generated on save)',
            name: gameData.name,
            type: 'TOURNAMENT',
            status: gameData.status,
            gameDateTime: gameData.gameDateTime,
            venueId: venueId,
            sourceUrl: sourceUrl,
            seriesName: gameData.seriesName || null,
            isAdHoc: null,
            tournamentStructureId: '(generated on save)',
            cashStructureId: null,
            registrationStatus: gameData.registrationStatus || null,
            gameVariant: gameData.gameVariant || null,
            prizepool: gameData.prizepool || null,
            totalEntries: gameData.totalEntries || null,
            totalRebuys: gameData.totalRebuys || null,
            totalAddons: gameData.totalAddons || null,
            totalDuration: gameData.totalDuration || null,
            gameTags: gameData.gameTags || null,
        },
        'TournamentStructure': {
            id: '(generated on save)',
            name: `${gameData.name} Structure`,
            type: gameData.tournamentType || 'FREEZEOUT',
            buyIn: gameData.buyIn || null,
            rake: gameData.rake || null,
            startingStack: gameData.startingStack || null,
            hasGuarantee: gameData.hasGuarantee,
            guaranteeAmount: gameData.guaranteeAmount || null,
        },
        'TournamentLevel': {
            count: `${gameData.levels.length} levels to be created`,
            example: gameData.levels.length > 0 ? `Level 1: ${gameData.levels[0].smallBlind}/${gameData.levels[0].bigBlind}` : 'N/A'
        },
        'PlayerResult': { info: `Scraped ${gameData.results?.length || 0} results (not saved as linked PlayerResult entities)` },
        'Player': null, 'PlayerAccount': null, 'PlayerTransaction': null, 'PlayerTicket': null, 'RakeStructure': null, 'CashStructure': null,
    };

    return (
        <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
                <div className="p-4 border-b">
                    <h3 className="text-lg font-semibold">Confirm Save to Database</h3>
                    <p className="text-sm text-gray-500 mt-1">Review all data fields that will be saved for this game.</p>
                </div>
                <div className="p-4 overflow-auto flex-1 space-y-4">
                    {Object.entries(modalDataConfig).map(([model, fields]) => (
                        <div key={model} className="border rounded-md p-3 bg-gray-50">
                            <h4 className="font-bold text-gray-700">{model}</h4>
                            <div className="mt-2 text-xs space-y-1 pl-2">
                                {fields ? (
                                    Object.entries(fields).map(([field, value]) => (
                                        <div key={field} className="grid grid-cols-3 gap-2 items-start">
                                            <span className="font-semibold text-gray-600 col-span-1">{field}:</span>
                                            <div className="col-span-2">{renderValue(value)}</div>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-gray-400 italic">No data will be saved for this model.</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="flex justify-end items-center p-4 border-t bg-gray-100 rounded-b-lg space-x-2">
                    <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50">
                        Cancel
                    </button>
                    <button onClick={onConfirm} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 border border-transparent rounded-md hover:bg-indigo-700">
                        Confirm & Save to DB
                    </button>
                </div>
            </div>
        </div>
    );
};


const GameCard: React.FC<{ 
    game: GameState; 
    onSave: (id: string, venueId: string) => void; 
    onRemove: (id: string) => void; 
}> = ({ game, onSave, onRemove }) => {
    const [venueId, setVenueId] = useState('');
    const [showHtmlModal, setShowHtmlModal] = useState(false);
    const [isConfirmModalOpen, setIsConfirmModalOpen] = useState(false);

    const getStatusColor = (status: JobStatus) => {
        switch (status) {
            case 'LIVE': return 'bg-red-500';
            case 'FETCHING': case 'SAVING': return 'bg-yellow-500 animate-pulse';
            case 'READY_TO_SAVE': return 'bg-blue-500';
            case 'DONE': return 'bg-green-500';
            case 'ERROR': return 'bg-red-700';
            default: return 'bg-gray-400';
        }
    };

    const rawHtml = game.data?.rawHtml || '';
    const getDisplayId = (id: string) => {
        if (id.includes('id=')) return `Tournament #${id.split('id=')[1]}`;
        return id;
    };
    
    const lastFetchedDate = game.lastFetched ? new Date(game.lastFetched).toLocaleDateString() : 'N/A';
    const lastFetchedTime = game.lastFetched ? new Date(game.lastFetched).toLocaleTimeString() : 'N/A';
    const isSaveDisabled = !game.data || !venueId || game.status !== 'READY_TO_SAVE';
    
    const handleConfirmSave = () => {
        onSave(game.id, venueId);
        setIsConfirmModalOpen(false);
    };

    return (
        <>
            <div className="border border-gray-200 rounded-lg p-4 space-y-2 shadow-md bg-white">
                <div className="flex justify-between items-start">
                    <div className="flex items-center space-x-2 min-w-0">
                        <span className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded flex-shrink-0">{game.source}</span>
                        <p className="text-sm font-mono truncate" title={game.id}>{getDisplayId(game.id)}</p>
                    </div>
                    <div className="flex items-center space-x-2 flex-shrink-0">
                        {/* ✅ NEW: Launch URL button */}
                        <a 
                            href={game.id} 
                            target="_blank" 
                            rel="noopener noreferrer"
                            className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 rounded-md hover:bg-blue-200"
                            title="Open tournament page in new tab"
                        >
                            Launch URL 🚀
                        </a>
                        <span className={`px-2 py-1 text-xs font-bold text-white rounded-full ${getStatusColor(game.status)}`}>{game.status}</span>
                        <button onClick={() => onRemove(game.id)} className="text-gray-400 hover:text-red-600 font-bold text-xl">×</button>
                    </div>
                </div>

                {game.data?.name && (
                    <div className="bg-gray-50 p-2 rounded border">
                        <h4 className="font-bold text-lg">{game.data.name}</h4>
                        <p className="text-xs text-gray-600">{game.data.gameDateTime}</p>
                        <p className="text-xs text-gray-500">Last Fetched: {lastFetchedDate} at {lastFetchedTime}</p>
                    </div>
                )}
                
                {game.errorMessage && <p className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-200">{game.errorMessage}</p>}
                
                {(game.status === 'READY_TO_SAVE' || game.status === 'DONE' || game.status === 'SAVING' || game.status === 'LIVE') && (
                    <>
                        <PlayerResults results={game.data?.results ?? undefined} />
                        <ScraperReport data={game.data} missingFields={game.missingFields} />
                    </>
                )}
                
                {game.saveResult && <p className="text-xs text-green-600">Successfully saved! Game ID: {game.saveResult.id}</p>}
                
                {rawHtml && (
                    <div className="pt-2">
                         <button onClick={() => setShowHtmlModal(true)} className="w-full px-3 py-1 text-xs border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors">
                            🔍 View Raw HTML {rawHtml ? `(${(rawHtml.length / 1024).toFixed(1)} KB)` : ''}
                        </button>
                    </div>
                )}

                <div className="flex space-x-2 pt-2">
                    <input
                        type="text"
                        value={venueId}
                        onChange={(e) => setVenueId(e.target.value)}
                        className="flex-grow mt-1 block w-full px-2 py-1 border border-gray-300 rounded-md shadow-sm text-sm"
                        placeholder="Venue ID to Save"
                        disabled={game.status === 'DONE' || game.status === 'SAVING'}
                    />
                    <button
                        onClick={() => setIsConfirmModalOpen(true)}
                        disabled={isSaveDisabled}
                        className="px-3 py-1 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400"
                    >
                        {game.status === 'SAVING' ? 'Saving...' : 'Save to DB'}
                    </button>
                </div>
            </div>

            <HtmlModal isOpen={showHtmlModal} onClose={() => setShowHtmlModal(false)} html={rawHtml} gameId={game.id}/>
            <SaveConfirmationModal 
                isOpen={isConfirmModalOpen}
                onClose={() => setIsConfirmModalOpen(false)}
                onConfirm={handleConfirmSave}
                gameData={game.data}
                venueId={venueId}
                sourceUrl={game.id}
            />
        </>
    );
};

export const ScraperDashboard = () => {
    const [inputId, setInputId] = useState('');
    const [inputMode, setInputMode] = useState<'AUTO' | 'API'>('AUTO');
    const { games, trackGame, saveGame, removeGame } = useGameTracker();

    const handleTrackGame = (id: string, source: 'SCRAPE' | 'API') => {
        if(id){
            let trackId = id;
            if (source === 'SCRAPE' && !id.startsWith('http')) {
                trackId = `https://kingsroom.com.au/tournament/?id=${id}`;
            }
            trackGame(trackId, source);
            setInputId('');
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputId) return;
        if (inputMode === 'API') handleTrackGame(inputId, 'API');
        else handleTrackGame(inputId, 'SCRAPE');
    };

    return (
        <div className="p-8 max-w-3xl mx-auto space-y-6">
            <h2 className="text-3xl font-bold text-center text-gray-800">Game Tracker Dashboard</h2>
            <div className="p-4 bg-white rounded-xl shadow-lg">
                <form className="space-y-3" onSubmit={handleSubmit}>
                    <div className="flex space-x-2">
                        <input
                            type="text"
                            value={inputId}
                            onChange={(e) => setInputId(e.target.value)}
                            className="flex-grow block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder={inputMode === 'API' ? "Enter API ID..." : "Enter tournament ID or full URL..."}
                        />
                        <button type="submit" className="px-4 py-2 border rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700">
                            Track
                        </button>
                    </div>
                    <div className="flex space-x-4 text-sm">
                        <label className="flex items-center">
                            <input type="radio" value="AUTO" checked={inputMode === 'AUTO'} onChange={(e) => setInputMode(e.target.value as 'AUTO' | 'API')} className="mr-2"/>
                            <span className="text-gray-700">Tournament (Scrape)</span>
                        </label>
                        <label className="flex items-center">
                            <input type="radio" value="API" checked={inputMode === 'API'} onChange={(e) => setInputMode(e.target.value as 'AUTO' | 'API')} className="mr-2"/>
                            <span className="text-gray-700">API Mode (Mocked)</span>
                        </label>
                    </div>
                    {inputMode === 'AUTO' && (
                        <div className="text-xs text-gray-500 space-y-1">
                            <p>Scraping from: kingsroom.com.au/tournament/?id=</p>
                            <p>Examples: Enter just "2" or paste full URL</p>
                        </div>
                    )}
                </form>
            </div>
            <div className="space-y-4">
                {Object.values(games).length > 0 ? (
                    Object.values(games).map(game => (
                        <GameCard key={game.id} game={game} onSave={saveGame} onRemove={removeGame} />
                    ))
                ) : (
                    <p className="text-center text-gray-500 py-10">No games are being tracked. Add a URL to begin.</p>
                )}
            </div>
        </div>
    );
};