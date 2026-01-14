// src/components/scraper/admin/URLStatusGrid.tsx
// Visual grid panel showing URL/Game status for all tournament IDs in an entity
// Grid starts at ID=1 and goes to the maximum ID
// 
// TWO VIEWS:
// 1. URL Status View:
//    GREEN = gameId is not empty (has associated game)
//    YELLOW = doNotScrapeReason = NOT_PUBLISHED
//    RED = lastScrapeStatus = ERROR
//    WHITE (border) = lastScrapeStatus = NOT_FOUND
//    GRAY = has ScrapeURL record but doesn't match above criteria
//    LIGHT GRAY = no ScrapeURL record for this ID
//
// 2. Game Status View:
//    Colors based on Game.gameStatus enum
//    WHITE = no game for this tournament ID

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Grid3X3,
    RefreshCw,
    X,
    Loader2,
    Info,
    ExternalLink,
    ZoomIn,
    ZoomOut,
    Link,
    Gamepad2
} from 'lucide-react';
import { generateClient } from 'aws-amplify/api';
import { useEntity } from '../../../contexts/EntityContext';
import { useS3Fetch } from '../../../hooks/useS3Fetch';

// ===================================================================
// TYPES
// ===================================================================

type ViewMode = 'url' | 'game';

interface ScrapeURLGridItem {
    tournamentId: number;
    gameId: string | null;
    doNotScrapeReason: string | null;
    lastScrapeStatus: string | null;
    latestS3Key: string | null;
    doNotScrape: boolean;
    gameName: string | null;
}

interface GameGridItem {
    tournamentId: number;
    gameId: string;
    gameStatus: string | null;
    gameName: string | null;
}

interface GridBounds {
    minId: number;
    maxId: number;
    totalSlots: number;
}

// URL Status types
type URLStatus = 'HAS_GAME' | 'NOT_PUBLISHED' | 'ERROR' | 'NOT_FOUND' | 'OTHER' | 'EMPTY';

// Game Status types (from GameStatus enum)
type GameStatusType = 
    | 'INITIATING' | 'SCHEDULED' | 'REGISTERING' | 'RUNNING' 
    | 'CANCELLED' | 'FINISHED' | 'NOT_IN_USE' | 'NOT_PUBLISHED' 
    | 'CLOCK_STOPPED' | 'UNKNOWN' | 'NO_GAME';

// ===================================================================
// GAME STATUS CONFIG
// ===================================================================

const GAME_STATUS_CONFIG: Record<GameStatusType, { label: string; bg: string; hover: string }> = {
    INITIATING: { label: 'Initiating', bg: 'bg-slate-300', hover: 'hover:bg-slate-200' },
    SCHEDULED: { label: 'Scheduled', bg: 'bg-blue-400', hover: 'hover:bg-blue-300' },
    REGISTERING: { label: 'Registering', bg: 'bg-cyan-400', hover: 'hover:bg-cyan-300' },
    RUNNING: { label: 'Running', bg: 'bg-emerald-500', hover: 'hover:bg-emerald-400' },
    CANCELLED: { label: 'Cancelled', bg: 'bg-red-400', hover: 'hover:bg-red-300' },
    FINISHED: { label: 'Finished', bg: 'bg-green-500', hover: 'hover:bg-green-400' },
    NOT_IN_USE: { label: 'Not In Use', bg: 'bg-gray-300', hover: 'hover:bg-gray-200' },
    NOT_PUBLISHED: { label: 'Not Published', bg: 'bg-amber-400', hover: 'hover:bg-amber-300' },
    CLOCK_STOPPED: { label: 'Clock Stopped', bg: 'bg-orange-400', hover: 'hover:bg-orange-300' },
    UNKNOWN: { label: 'Unknown', bg: 'bg-purple-400', hover: 'hover:bg-purple-300' },
    NO_GAME: { label: 'No Game', bg: 'bg-white border border-gray-300', hover: 'hover:bg-gray-50' },
};

// ===================================================================
// GRAPHQL QUERIES
// ===================================================================

const getClient = () => generateClient();

// Query to get all ScrapeURLs for an entity
const LIST_SCRAPE_URLS_FOR_GRID = /* GraphQL */ `
  query ScrapeURLSByEntityId(
    $entityId: ID!
    $limit: Int
    $nextToken: String
  ) {
    scrapeURLSByEntityId(
      entityId: $entityId
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        tournamentId
        gameId
        doNotScrapeReason
        lastScrapeStatus
        latestS3Key
        doNotScrape
        gameName
      }
      nextToken
    }
  }
`;

// Query to get all Games for an entity (with tournamentId)
const LIST_GAMES_FOR_GRID = /* GraphQL */ `
  query GamesByEntity(
    $entityId: ID!
    $limit: Int
    $nextToken: String
  ) {
    gamesByEntity(
      entityId: $entityId
      limit: $limit
      nextToken: $nextToken
    ) {
      items {
        id
        tournamentId
        gameStatus
        name
      }
      nextToken
    }
  }
`;

// Query to get bounds (min/max tournament IDs)
const GET_TOURNAMENT_BOUNDS = /* GraphQL */ `
  query GetTournamentIdBounds($entityId: ID!) {
    getTournamentIdBounds(entityId: $entityId) {
      lowestId
      highestId
      totalCount
    }
  }
`;

// ===================================================================
// UTILITY FUNCTIONS - URL STATUS
// ===================================================================

const determineURLStatus = (item: ScrapeURLGridItem | undefined): URLStatus => {
    if (!item) return 'EMPTY';
    
    if (item.gameId && item.gameId.trim() !== '') {
        return 'HAS_GAME';
    }
    
    if (item.doNotScrapeReason?.toUpperCase() === 'NOT_PUBLISHED') {
        return 'NOT_PUBLISHED';
    }
    
    if (item.lastScrapeStatus?.toUpperCase() === 'ERROR') {
        return 'ERROR';
    }
    
    const scrapeStatus = item.lastScrapeStatus?.toUpperCase();
    if (scrapeStatus === 'NOT_FOUND' || scrapeStatus === 'BLANK' || scrapeStatus === 'NOT_IN_USE') {
        return 'NOT_FOUND';
    }
    
    return 'OTHER';
};

const getURLStatusColor = (status: URLStatus): string => {
    switch (status) {
        case 'HAS_GAME':
            return 'bg-green-500 hover:bg-green-400';
        case 'NOT_PUBLISHED':
            return 'bg-yellow-400 hover:bg-yellow-300';
        case 'ERROR':
            return 'bg-red-500 hover:bg-red-400';
        case 'NOT_FOUND':
            return 'bg-white border border-gray-400 hover:bg-gray-50';
        case 'OTHER':
            return 'bg-gray-400 hover:bg-gray-300';
        case 'EMPTY':
        default:
            return 'bg-gray-200 hover:bg-gray-300 border border-gray-300';
    }
};

const getURLStatusLabel = (status: URLStatus): string => {
    switch (status) {
        case 'HAS_GAME': return 'Has Game';
        case 'NOT_PUBLISHED': return 'Not Published';
        case 'ERROR': return 'Error';
        case 'NOT_FOUND': return 'Not Found';
        case 'OTHER': return 'Other';
        case 'EMPTY': return 'No Record';
        default: return 'Unknown';
    }
};

// ===================================================================
// UTILITY FUNCTIONS - GAME STATUS
// ===================================================================

const determineGameStatus = (item: GameGridItem | undefined): GameStatusType => {
    if (!item) return 'NO_GAME';
    
    const status = item.gameStatus?.toUpperCase() as GameStatusType;
    if (status && GAME_STATUS_CONFIG[status]) {
        return status;
    }
    
    return 'UNKNOWN';
};

const getGameStatusColor = (status: GameStatusType): string => {
    const config = GAME_STATUS_CONFIG[status];
    return `${config.bg} ${config.hover}`;
};

const getGameStatusLabel = (status: GameStatusType): string => {
    return GAME_STATUS_CONFIG[status]?.label || 'Unknown';
};

// ===================================================================
// MAIN COMPONENT
// ===================================================================

interface URLStatusGridProps {
    isOpen: boolean;
    onClose: () => void;
}

export const URLStatusGrid: React.FC<URLStatusGridProps> = ({ isOpen, onClose }) => {
    const { currentEntity } = useEntity();
    const { getPresignedUrl, isLoading: s3Loading, error: s3Error } = useS3Fetch();
    
    // View mode state
    const [viewMode, setViewMode] = useState<ViewMode>('url');
    
    // Data state
    const [urlData, setUrlData] = useState<Map<number, ScrapeURLGridItem>>(new Map());
    const [gameData, setGameData] = useState<Map<number, GameGridItem>>(new Map());
    const [bounds, setBounds] = useState<GridBounds | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState('');
    const [error, setError] = useState<string | null>(null);
    
    // UI state
    const [hoveredId, setHoveredId] = useState<number | null>(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const [columnsPerRow, setColumnsPerRow] = useState(50);
    const [selectedCell, setSelectedCell] = useState<number | null>(null);
    
    const containerRef = useRef<HTMLDivElement>(null);

    // Load data when opened
    useEffect(() => {
        if (isOpen && currentEntity) {
            loadGridData();
        }
    }, [isOpen, currentEntity?.id]);

    // ===================================================================
    // DATA LOADING
    // ===================================================================

    const loadGridData = async () => {
        if (!currentEntity) return;

        setLoading(true);
        setError(null);
        setLoadingProgress('Fetching bounds...');

        try {
            const client = getClient();

            // Get tournament ID bounds first
            setLoadingProgress('Getting tournament ID range...');
            const boundsResponse = await client.graphql({
                query: GET_TOURNAMENT_BOUNDS,
                variables: { entityId: currentEntity.id }
            }) as any;

            const boundsData = boundsResponse.data?.getTournamentIdBounds;
            if (!boundsData || !boundsData.highestId) {
                setError('No tournament data found for this entity');
                setLoading(false);
                return;
            }

            const minId = 1;
            const maxId = boundsData.highestId;
            
            setBounds({
                minId,
                maxId,
                totalSlots: maxId - minId + 1
            });

            // Fetch ScrapeURL data
            setLoadingProgress('Loading URL status data...');
            const urlDataMap = new Map<number, ScrapeURLGridItem>();
            let nextToken: string | null = null;
            let pageCount = 0;

            do {
                pageCount++;
                setLoadingProgress(`Loading URLs page ${pageCount}... (${urlDataMap.size} loaded)`);

                const response = await client.graphql({
                    query: LIST_SCRAPE_URLS_FOR_GRID,
                    variables: {
                        entityId: currentEntity.id,
                        limit: 1000,
                        nextToken
                    }
                }) as any;

                const items = response.data?.scrapeURLSByEntityId?.items || [];
                nextToken = response.data?.scrapeURLSByEntityId?.nextToken || null;

                for (const item of items) {
                    if (item && item.tournamentId >= minId && item.tournamentId <= maxId) {
                        urlDataMap.set(item.tournamentId, {
                            tournamentId: item.tournamentId,
                            gameId: item.gameId || null,
                            doNotScrapeReason: item.doNotScrapeReason || null,
                            lastScrapeStatus: item.lastScrapeStatus || null,
                            latestS3Key: item.latestS3Key || null,
                            doNotScrape: item.doNotScrape || false,
                            gameName: item.gameName || null
                        });
                    }
                }
            } while (nextToken);

            setUrlData(urlDataMap);

            // Fetch Game data
            setLoadingProgress('Loading game status data...');
            const gameDataMap = new Map<number, GameGridItem>();
            nextToken = null;
            pageCount = 0;

            do {
                pageCount++;
                setLoadingProgress(`Loading games page ${pageCount}... (${gameDataMap.size} loaded)`);

                const response = await client.graphql({
                    query: LIST_GAMES_FOR_GRID,
                    variables: {
                        entityId: currentEntity.id,
                        limit: 1000,
                        nextToken
                    }
                }) as any;

                const items = response.data?.gamesByEntity?.items || [];
                nextToken = response.data?.gamesByEntity?.nextToken || null;

                for (const item of items) {
                    if (item && item.tournamentId && item.tournamentId >= minId && item.tournamentId <= maxId) {
                        gameDataMap.set(item.tournamentId, {
                            tournamentId: item.tournamentId,
                            gameId: item.id,
                            gameStatus: item.gameStatus || null,
                            gameName: item.name || null
                        });
                    }
                }
            } while (nextToken);

            setGameData(gameDataMap);
            setLoadingProgress(`Loaded ${urlDataMap.size} URLs and ${gameDataMap.size} games`);

        } catch (err: any) {
            console.error('[URLStatusGrid] Error loading data:', err);
            setError(err.message || 'Failed to load grid data');
        } finally {
            setLoading(false);
        }
    };

    // ===================================================================
    // CELL INTERACTION
    // ===================================================================

    const handleCellClick = async (tournamentId: number) => {
        setSelectedCell(tournamentId);
        
        const urlItem = urlData.get(tournamentId);

        if (urlItem?.latestS3Key) {
            try {
                const presignedUrl = await getPresignedUrl(urlItem.latestS3Key);
                window.open(presignedUrl, '_blank');
            } catch (err) {
                console.error('[URLStatusGrid] Failed to open S3 file:', err);
            }
        } else if (currentEntity) {
            const url = `${currentEntity.gameUrlDomain}${currentEntity.gameUrlPath}?id=${tournamentId}`;
            window.open(url, '_blank');
        }
    };

    const handleMouseEnter = (e: React.MouseEvent, tournamentId: number) => {
        setHoveredId(tournamentId);
        setTooltipPosition({ x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        setTooltipPosition({ x: e.clientX, y: e.clientY });
    };

    const handleMouseLeave = () => {
        setHoveredId(null);
    };

    // ===================================================================
    // GRID RENDERING
    // ===================================================================

    const cellSize = useMemo(() => {
        if (!containerRef.current) return 12;
        const containerWidth = containerRef.current.clientWidth - 100; // Account for row labels
        const size = Math.floor(containerWidth / columnsPerRow) - 1;
        return Math.max(8, Math.min(size, 20));
    }, [columnsPerRow, bounds]);

    // Generate rows with labels
    const gridRows = useMemo(() => {
        if (!bounds) return [];

        const rows: { startId: number; endId: number; cells: React.ReactNode[] }[] = [];
        let currentRow: React.ReactNode[] = [];
        let rowStartId = bounds.minId;

        for (let id = bounds.minId; id <= bounds.maxId; id++) {
            let colorClass: string;

            if (viewMode === 'url') {
                const item = urlData.get(id);
                const status = determineURLStatus(item);
                colorClass = getURLStatusColor(status);
            } else {
                const item = gameData.get(id);
                const status = determineGameStatus(item);
                colorClass = getGameStatusColor(status);
            }

            currentRow.push(
                <div
                    key={id}
                    className={`
                        ${colorClass}
                        cursor-pointer transition-all duration-75 rounded-sm
                        ${selectedCell === id ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
                        ${hoveredId === id ? 'scale-125 z-10 shadow-md' : ''}
                    `}
                    style={{
                        width: cellSize,
                        height: cellSize,
                        flexShrink: 0
                    }}
                    onClick={() => handleCellClick(id)}
                    onMouseEnter={(e) => handleMouseEnter(e, id)}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                />
            );

            // Check if row is complete
            if (currentRow.length === columnsPerRow || id === bounds.maxId) {
                rows.push({
                    startId: rowStartId,
                    endId: id,
                    cells: currentRow
                });
                currentRow = [];
                rowStartId = id + 1;
            }
        }

        return rows;
    }, [bounds, urlData, gameData, viewMode, cellSize, columnsPerRow, selectedCell, hoveredId]);

    // Statistics for URL view
    const urlStats = useMemo(() => {
        if (!bounds) return null;

        let hasGame = 0, notPublished = 0, errors = 0, notFound = 0, other = 0, empty = 0;

        for (let id = bounds.minId; id <= bounds.maxId; id++) {
            const status = determineURLStatus(urlData.get(id));
            switch (status) {
                case 'HAS_GAME': hasGame++; break;
                case 'NOT_PUBLISHED': notPublished++; break;
                case 'ERROR': errors++; break;
                case 'NOT_FOUND': notFound++; break;
                case 'OTHER': other++; break;
                case 'EMPTY': empty++; break;
            }
        }

        return { hasGame, notPublished, errors, notFound, other, empty, total: bounds.totalSlots };
    }, [bounds, urlData]);

    // Statistics for Game view
    const gameStats = useMemo(() => {
        if (!bounds) return null;

        const counts: Record<GameStatusType, number> = {
            INITIATING: 0, SCHEDULED: 0, REGISTERING: 0, RUNNING: 0,
            CANCELLED: 0, FINISHED: 0, NOT_IN_USE: 0, NOT_PUBLISHED: 0,
            CLOCK_STOPPED: 0, UNKNOWN: 0, NO_GAME: 0
        };

        for (let id = bounds.minId; id <= bounds.maxId; id++) {
            const status = determineGameStatus(gameData.get(id));
            counts[status]++;
        }

        return counts;
    }, [bounds, gameData]);

    // ===================================================================
    // RENDER
    // ===================================================================

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <div className="flex items-center gap-3">
                        <Grid3X3 className="h-5 w-5 text-blue-600" />
                        <h2 className="text-lg font-semibold">Status Grid</h2>
                        {currentEntity && (
                            <span className="text-sm text-gray-500">
                                {currentEntity.entityName}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500 mr-2">{columnsPerRow} cols</span>
                        <button
                            onClick={() => setColumnsPerRow(Math.max(10, columnsPerRow - 10))}
                            className="p-2 hover:bg-gray-100 rounded"
                            title="Fewer columns (larger cells)"
                        >
                            <ZoomIn className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setColumnsPerRow(Math.min(150, columnsPerRow + 10))}
                            className="p-2 hover:bg-gray-100 rounded"
                            title="More columns (smaller cells)"
                        >
                            <ZoomOut className="h-4 w-4" />
                        </button>
                        <button
                            onClick={loadGridData}
                            disabled={loading}
                            className="p-2 hover:bg-gray-100 rounded disabled:opacity-50"
                            title="Refresh"
                        >
                            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                        </button>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-gray-100 rounded"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>
                </div>

                {/* View Mode Tabs */}
                <div className="px-4 py-2 border-b bg-gray-50">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setViewMode('url')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                viewMode === 'url'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-gray-700 hover:bg-gray-100 border'
                            }`}
                        >
                            <Link className="h-4 w-4" />
                            URL Status
                        </button>
                        <button
                            onClick={() => setViewMode('game')}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                viewMode === 'game'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-gray-700 hover:bg-gray-100 border'
                            }`}
                        >
                            <Gamepad2 className="h-4 w-4" />
                            Game Status
                        </button>
                    </div>
                </div>

                {/* Legend */}
                <div className="px-4 py-2 bg-gray-50 border-b flex flex-wrap items-center gap-3 text-xs">
                    {viewMode === 'url' ? (
                        <>
                            <div className="flex items-center gap-1.5">
                                <div className="w-4 h-4 bg-green-500 rounded" />
                                <span>Has Game {urlStats && `(${urlStats.hasGame.toLocaleString()})`}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-4 h-4 bg-yellow-400 rounded" />
                                <span>Not Published {urlStats && `(${urlStats.notPublished.toLocaleString()})`}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-4 h-4 bg-red-500 rounded" />
                                <span>Error {urlStats && `(${urlStats.errors.toLocaleString()})`}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-4 h-4 bg-white border border-gray-400 rounded" />
                                <span>Not Found {urlStats && `(${urlStats.notFound.toLocaleString()})`}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-4 h-4 bg-gray-400 rounded" />
                                <span>Other {urlStats && `(${urlStats.other.toLocaleString()})`}</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-4 h-4 bg-gray-200 border border-gray-300 rounded" />
                                <span>No Record {urlStats && `(${urlStats.empty.toLocaleString()})`}</span>
                            </div>
                        </>
                    ) : (
                        <>
                            {(['FINISHED', 'RUNNING', 'CLOCK_STOPPED', 'REGISTERING', 'SCHEDULED', 'NOT_PUBLISHED', 'CANCELLED', 'NO_GAME'] as GameStatusType[]).map(status => (
                                <div key={status} className="flex items-center gap-1.5">
                                    <div className={`w-4 h-4 rounded ${GAME_STATUS_CONFIG[status].bg}`} />
                                    <span>{GAME_STATUS_CONFIG[status].label} {gameStats && `(${gameStats[status].toLocaleString()})`}</span>
                                </div>
                            ))}
                        </>
                    )}
                    {bounds && (
                        <div className="ml-auto text-gray-500">
                            Range: {bounds.minId.toLocaleString()} - {bounds.maxId.toLocaleString()} 
                            ({bounds.totalSlots.toLocaleString()} slots)
                        </div>
                    )}
                </div>

                {/* Grid Content */}
                <div 
                    ref={containerRef}
                    className="flex-1 overflow-auto p-4"
                >
                    {loading ? (
                        <div className="flex flex-col items-center justify-center h-64 gap-3">
                            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
                            <p className="text-gray-600">{loadingProgress}</p>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-64 gap-3 text-red-600">
                            <Info className="h-8 w-8" />
                            <p>{error}</p>
                            <button
                                onClick={loadGridData}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                            >
                                Try Again
                            </button>
                        </div>
                    ) : bounds && gridRows.length > 0 ? (
                        <div className="flex flex-col items-center gap-px">
                            {gridRows.map((row, rowIndex) => (
                                <div key={rowIndex} className="flex items-center gap-2">
                                    {/* Row label */}
                                    <div 
                                        className="text-xs text-gray-500 text-right font-mono"
                                        style={{ width: 80, flexShrink: 0 }}
                                    >
                                        {row.startId}-{row.endId}
                                    </div>
                                    {/* Row cells */}
                                    <div className="flex gap-px">
                                        {row.cells}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-500">
                            <Grid3X3 className="h-12 w-12" />
                            <p>No data loaded</p>
                        </div>
                    )}
                </div>

                {/* Tooltip */}
                {hoveredId !== null && (
                    <div
                        className="fixed z-[100] bg-gray-900 text-white px-3 py-2 rounded shadow-lg text-sm pointer-events-none"
                        style={{
                            left: tooltipPosition.x + 10,
                            top: tooltipPosition.y + 10,
                            transform: 'translateY(-50%)'
                        }}
                    >
                        <div className="font-medium">ID: {hoveredId}</div>
                        {viewMode === 'url' ? (
                            <>
                                {urlData.get(hoveredId) && (
                                    <>
                                        <div className="text-gray-300 text-xs">
                                            Status: {getURLStatusLabel(determineURLStatus(urlData.get(hoveredId)))}
                                        </div>
                                        {urlData.get(hoveredId)?.gameName && (
                                            <div className="text-gray-300 text-xs truncate max-w-xs">
                                                {urlData.get(hoveredId)?.gameName}
                                            </div>
                                        )}
                                        {urlData.get(hoveredId)?.latestS3Key && (
                                            <div className="text-blue-300 text-xs flex items-center gap-1">
                                                <ExternalLink className="h-3 w-3" />
                                                Click to view HTML
                                            </div>
                                        )}
                                    </>
                                )}
                            </>
                        ) : (
                            <>
                                {gameData.get(hoveredId) ? (
                                    <>
                                        <div className="text-gray-300 text-xs">
                                            Status: {getGameStatusLabel(determineGameStatus(gameData.get(hoveredId)))}
                                        </div>
                                        {gameData.get(hoveredId)?.gameName && (
                                            <div className="text-gray-300 text-xs truncate max-w-xs">
                                                {gameData.get(hoveredId)?.gameName}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <div className="text-gray-300 text-xs">No game for this ID</div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {/* Footer with S3 loading state */}
                {(s3Loading || s3Error) && (
                    <div className="px-4 py-2 border-t bg-gray-50 text-sm">
                        {s3Loading && (
                            <span className="text-blue-600 flex items-center gap-2">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Loading S3 file...
                            </span>
                        )}
                        {s3Error && (
                            <span className="text-red-600">{s3Error}</span>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

// ===================================================================
// BUTTON TRIGGER COMPONENT
// ===================================================================

interface URLStatusGridButtonProps {
    className?: string;
}

export const URLStatusGridButton: React.FC<URLStatusGridButtonProps> = ({ className }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                className={`flex items-center gap-2 px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors ${className || ''}`}
            >
                <Grid3X3 className="h-4 w-4" />
                Status Grid
            </button>
            <URLStatusGrid isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </>
    );
};

export default URLStatusGrid;