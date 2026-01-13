// src/components/scraper/admin/URLStatusGrid.tsx
// Visual grid panel showing URL status for all tournament IDs in an entity
// Grid starts at ID=1 and goes to the maximum ID
// Color coding:
//   GREEN = gameId is not empty (has associated game)
//   YELLOW = doNotScrapeReason = NOT_PUBLISHED
//   RED = lastScrapeStatus = ERROR
//   WHITE (border) = lastScrapeStatus = NOT_FOUND
//   GRAY = has ScrapeURL record but doesn't match above criteria
//   LIGHT GRAY = no ScrapeURL record for this ID

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    Grid3X3,
    RefreshCw,
    X,
    Loader2,
    Info,
    ExternalLink,
    ZoomIn,
    ZoomOut
} from 'lucide-react';
import { generateClient } from 'aws-amplify/api';
import { useEntity } from '../../../contexts/EntityContext';
import { useS3Fetch } from '../../../hooks/useS3Fetch';

// ===================================================================
// TYPES
// ===================================================================

interface ScrapeURLGridItem {
    tournamentId: number;
    gameId: string | null;
    doNotScrapeReason: string | null;  // Changed from gameStatus
    lastScrapeStatus: string | null;
    latestS3Key: string | null;
    doNotScrape: boolean;
    gameName: string | null;
}

interface GridBounds {
    minId: number;
    maxId: number;
    totalSlots: number;
}

// Status priority: HAS_GAME > NOT_PUBLISHED > ERROR > NOT_FOUND > OTHER > EMPTY
type URLStatus = 'HAS_GAME' | 'NOT_PUBLISHED' | 'ERROR' | 'NOT_FOUND' | 'OTHER' | 'EMPTY';

// ===================================================================
// GRAPHQL QUERIES
// ===================================================================

const getClient = () => generateClient();

// Query to get all ScrapeURLs for an entity with the fields we need
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
// UTILITY FUNCTIONS
// ===================================================================

const determineURLStatus = (item: ScrapeURLGridItem | undefined): URLStatus => {
    // No ScrapeURL record exists for this tournament ID
    if (!item) return 'EMPTY';
    
    // Priority 1: GREEN - Has associated game (gameId is not empty)
    if (item.gameId && item.gameId.trim() !== '') {
        return 'HAS_GAME';
    }
    
    // Priority 2: YELLOW - doNotScrapeReason = NOT_PUBLISHED
    if (item.doNotScrapeReason?.toUpperCase() === 'NOT_PUBLISHED') {
        return 'NOT_PUBLISHED';
    }
    
    // Priority 3: RED - lastScrapeStatus = ERROR
    if (item.lastScrapeStatus?.toUpperCase() === 'ERROR') {
        return 'ERROR';
    }
    
    // Priority 4: WHITE - lastScrapeStatus = NOT_FOUND
    const scrapeStatus = item.lastScrapeStatus?.toUpperCase();
    if (scrapeStatus === 'NOT_FOUND' || scrapeStatus === 'BLANK' || scrapeStatus === 'NOT_IN_USE') {
        return 'NOT_FOUND';
    }
    
    // Has a ScrapeURL record but doesn't match the above criteria
    return 'OTHER';
};

const getStatusColor = (status: URLStatus): string => {
    switch (status) {
        case 'HAS_GAME':
            // GREEN - has associated game
            return 'bg-green-500 hover:bg-green-400';
        case 'NOT_PUBLISHED':
            // YELLOW - game status is NOT_PUBLISHED
            return 'bg-yellow-400 hover:bg-yellow-300';
        case 'ERROR':
            // RED - scrape error
            return 'bg-red-500 hover:bg-red-400';
        case 'NOT_FOUND':
            // WHITE with border - not found
            return 'bg-white border border-gray-400 hover:bg-gray-50';
        case 'OTHER':
            // GRAY - has record but doesn't match criteria
            return 'bg-gray-400 hover:bg-gray-300';
        case 'EMPTY':
        default:
            // LIGHT GRAY - no ScrapeURL record
            return 'bg-gray-200 hover:bg-gray-300 border border-gray-300';
    }
};

const getStatusLabel = (status: URLStatus): string => {
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
// MAIN COMPONENT
// ===================================================================

interface URLStatusGridProps {
    isOpen: boolean;
    onClose: () => void;
}

export const URLStatusGrid: React.FC<URLStatusGridProps> = ({ isOpen, onClose }) => {
    const { currentEntity } = useEntity();
    const { getPresignedUrl, isLoading: s3Loading, error: s3Error } = useS3Fetch();
    
    // Data state
    const [urlData, setUrlData] = useState<Map<number, ScrapeURLGridItem>>(new Map());
    const [bounds, setBounds] = useState<GridBounds | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadingProgress, setLoadingProgress] = useState('');
    const [error, setError] = useState<string | null>(null);
    
    // UI state - default to 50 columns as requested
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

            // Always start at ID 1, go to highest ID
            const minId = 1;
            const maxId = boundsData.highestId;
            
            setBounds({
                minId,
                maxId,
                totalSlots: maxId - minId + 1
            });

            // Fetch all ScrapeURL data for this entity
            setLoadingProgress('Loading URL status data...');
            const dataMap = new Map<number, ScrapeURLGridItem>();
            let nextToken: string | null = null;
            let pageCount = 0;

            do {
                pageCount++;
                setLoadingProgress(`Loading page ${pageCount}... (${dataMap.size} URLs loaded)`);

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
                        dataMap.set(item.tournamentId, {
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

            setUrlData(dataMap);
            setLoadingProgress(`Loaded ${dataMap.size} URLs`);

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
        const item = urlData.get(tournamentId);
        setSelectedCell(tournamentId);

        if (item?.latestS3Key) {
            try {
                const presignedUrl = await getPresignedUrl(item.latestS3Key);
                window.open(presignedUrl, '_blank');
            } catch (err) {
                console.error('[URLStatusGrid] Failed to open S3 file:', err);
            }
        } else if (currentEntity) {
            // Open the source URL if no S3 key
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

    // Calculate cell size based on container width and column count
    const cellSize = useMemo(() => {
        if (!containerRef.current) return 12;
        const containerWidth = containerRef.current.clientWidth - 32; // Account for padding
        const size = Math.floor(containerWidth / columnsPerRow) - 1; // -1 for gap
        return Math.max(8, Math.min(size, 20)); // Min 8px, max 20px
    }, [columnsPerRow, bounds]); // Recalc when bounds load (triggers re-render)

    const gridCells = useMemo(() => {
        if (!bounds) return [];

        const cells: React.ReactNode[] = [];

        for (let id = bounds.minId; id <= bounds.maxId; id++) {
            const item = urlData.get(id);
            const status = determineURLStatus(item);
            const colorClass = getStatusColor(status);

            cells.push(
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
        }

        return cells;
    }, [bounds, urlData, cellSize, selectedCell, hoveredId]);

    // Statistics
    const stats = useMemo(() => {
        if (!bounds) return null;

        let hasGame = 0;
        let notPublished = 0;
        let errors = 0;
        let notFound = 0;
        let other = 0;
        let empty = 0;

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
                        <h2 className="text-lg font-semibold">URL Status Grid</h2>
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

                {/* Legend */}
                <div className="px-4 py-2 bg-gray-50 border-b flex flex-wrap items-center gap-4 text-xs">
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 bg-green-500 rounded" />
                        <span>Has Game {stats && `(${stats.hasGame.toLocaleString()})`}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 bg-yellow-400 rounded" />
                        <span>Not Published {stats && `(${stats.notPublished.toLocaleString()})`}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 bg-red-500 rounded" />
                        <span>Error {stats && `(${stats.errors.toLocaleString()})`}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 bg-white border border-gray-400 rounded" />
                        <span>Not Found {stats && `(${stats.notFound.toLocaleString()})`}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 bg-gray-400 rounded" />
                        <span>Other {stats && `(${stats.other.toLocaleString()})`}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 bg-gray-200 border border-gray-300 rounded" />
                        <span>No Record {stats && `(${stats.empty.toLocaleString()})`}</span>
                    </div>
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
                    ) : bounds ? (
                        <div 
                            className="grid gap-px"
                            style={{ 
                                gridTemplateColumns: `repeat(${columnsPerRow}, ${cellSize}px)`,
                                width: 'fit-content'
                            }}
                        >
                            {gridCells}
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
                        {urlData.get(hoveredId) && (
                            <>
                                <div className="text-gray-300 text-xs">
                                    Status: {getStatusLabel(determineURLStatus(urlData.get(hoveredId)))}
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
                URL Status Grid
            </button>
            <URLStatusGrid isOpen={isOpen} onClose={() => setIsOpen(false)} />
        </>
    );
};

export default URLStatusGrid;