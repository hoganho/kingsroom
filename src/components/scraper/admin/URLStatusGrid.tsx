// src/components/scraper/admin/URLStatusGrid.tsx
// Visual grid panel showing URL status for all tournament IDs in an entity
// Color coding: GREEN=has game, ORANGE=NOT_PUBLISHED, RED=ERROR, WHITE(border)=NOT_FOUND

import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
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
    gameStatus: string | null;
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

type URLStatus = 'HAS_GAME' | 'NOT_PUBLISHED' | 'ERROR' | 'NOT_FOUND' | 'UNKNOWN' | 'EMPTY';

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
        gameStatus
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
    if (!item) return 'EMPTY';
    
    // Priority 1: Has associated game (GREEN)
    if (item.gameId && item.gameId.trim() !== '') {
        return 'HAS_GAME';
    }
    
    // Priority 2: NOT_PUBLISHED (ORANGE)
    if (item.gameStatus?.toUpperCase() === 'NOT_PUBLISHED') {
        return 'NOT_PUBLISHED';
    }
    
    // Priority 3: ERROR (RED)
    if (item.lastScrapeStatus?.toUpperCase() === 'ERROR') {
        return 'ERROR';
    }
    
    // Priority 4: NOT_FOUND (WHITE with border)
    const status = item.lastScrapeStatus?.toUpperCase();
    if (status === 'NOT_FOUND' || status === 'BLANK' || status === 'NOT_IN_USE') {
        return 'NOT_FOUND';
    }
    
    // Everything else
    return 'UNKNOWN';
};

const getStatusColor = (status: URLStatus): string => {
    switch (status) {
        case 'HAS_GAME':
            return 'bg-green-500 hover:bg-green-400';
        case 'NOT_PUBLISHED':
            return 'bg-orange-400 hover:bg-orange-300';
        case 'ERROR':
            return 'bg-red-500 hover:bg-red-400';
        case 'NOT_FOUND':
            return 'bg-white border border-gray-300 hover:bg-gray-100';
        case 'UNKNOWN':
            return 'bg-blue-300 hover:bg-blue-200';
        case 'EMPTY':
        default:
            return 'bg-gray-100 hover:bg-gray-200';
    }
};

const getStatusLabel = (status: URLStatus): string => {
    switch (status) {
        case 'HAS_GAME': return 'Has Game';
        case 'NOT_PUBLISHED': return 'Not Published';
        case 'ERROR': return 'Error';
        case 'NOT_FOUND': return 'Not Found';
        case 'UNKNOWN': return 'Unknown';
        case 'EMPTY': return 'No Data';
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
    
    // UI state
    const [hoveredId, setHoveredId] = useState<number | null>(null);
    const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 });
    const [columnsPerRow, setColumnsPerRow] = useState(100);
    const [selectedCell, setSelectedCell] = useState<number | null>(null);
    
    const containerRef = useRef<HTMLDivElement>(null);

    // Calculate grid dimensions based on container size
    const calculateGridSize = useCallback(() => {
        if (!containerRef.current || !bounds) return;
        
        const containerWidth = containerRef.current.clientWidth - 32; // Account for padding
        const containerHeight = window.innerHeight - 300; // Leave room for header/legend
        
        const totalCells = bounds.maxId - bounds.minId + 1;
        
        // Start with 100 columns and adjust
        let cols = columnsPerRow;
        let cellSize = Math.floor(containerWidth / cols);
        
        // Ensure minimum cell size of 6px for visibility
        while (cellSize < 6 && cols > 20) {
            cols = Math.floor(cols * 0.8);
            cellSize = Math.floor(containerWidth / cols);
        }
        
        // Calculate rows needed
        const rows = Math.ceil(totalCells / cols);
        const totalHeight = rows * cellSize;
        
        // If height exceeds container, reduce columns to fit
        if (totalHeight > containerHeight && cellSize > 6) {
            const maxRows = Math.floor(containerHeight / 6);
            cols = Math.ceil(totalCells / maxRows);
            cols = Math.min(cols, Math.floor(containerWidth / 6));
        }
        
        setColumnsPerRow(cols);
    }, [bounds, columnsPerRow]);

    // Load data when opened
    useEffect(() => {
        if (isOpen && currentEntity) {
            loadGridData();
        }
    }, [isOpen, currentEntity?.id]);

    // Recalculate grid on window resize
    useEffect(() => {
        const handleResize = () => calculateGridSize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [calculateGridSize]);

    useEffect(() => {
        if (bounds) {
            calculateGridSize();
        }
    }, [bounds, calculateGridSize]);

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

            // Use 0 as minimum if not specified, or the actual lowest
            const minId = Math.max(0, (boundsData.lowestId || 1) - 10); // Include some buffer
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
                            gameStatus: item.gameStatus || null,
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

    const gridCells = useMemo(() => {
        if (!bounds) return [];

        const cells: React.ReactNode[] = [];
        const cellSize = Math.max(6, Math.floor((containerRef.current?.clientWidth || 800) / columnsPerRow) - 1);

        for (let id = bounds.minId; id <= bounds.maxId; id++) {
            const item = urlData.get(id);
            const status = determineURLStatus(item);
            const colorClass = getStatusColor(status);

            cells.push(
                <div
                    key={id}
                    className={`
                        ${colorClass}
                        cursor-pointer transition-all duration-75
                        ${selectedCell === id ? 'ring-2 ring-blue-500 ring-offset-1' : ''}
                        ${hoveredId === id ? 'scale-150 z-10' : ''}
                    `}
                    style={{
                        width: cellSize,
                        height: cellSize,
                        minWidth: 6,
                        minHeight: 6
                    }}
                    onClick={() => handleCellClick(id)}
                    onMouseEnter={(e) => handleMouseEnter(e, id)}
                    onMouseMove={handleMouseMove}
                    onMouseLeave={handleMouseLeave}
                    title={`ID: ${id}`}
                />
            );
        }

        return cells;
    }, [bounds, urlData, columnsPerRow, selectedCell, hoveredId]);

    // Statistics
    const stats = useMemo(() => {
        if (!bounds) return null;

        let hasGame = 0;
        let notPublished = 0;
        let errors = 0;
        let notFound = 0;
        let unknown = 0;
        let empty = 0;

        for (let id = bounds.minId; id <= bounds.maxId; id++) {
            const status = determineURLStatus(urlData.get(id));
            switch (status) {
                case 'HAS_GAME': hasGame++; break;
                case 'NOT_PUBLISHED': notPublished++; break;
                case 'ERROR': errors++; break;
                case 'NOT_FOUND': notFound++; break;
                case 'UNKNOWN': unknown++; break;
                case 'EMPTY': empty++; break;
            }
        }

        return { hasGame, notPublished, errors, notFound, unknown, empty, total: bounds.totalSlots };
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
                        <button
                            onClick={() => setColumnsPerRow(Math.max(20, columnsPerRow - 20))}
                            className="p-2 hover:bg-gray-100 rounded"
                            title="Fewer columns (larger cells)"
                        >
                            <ZoomIn className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => setColumnsPerRow(Math.min(200, columnsPerRow + 20))}
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
                        <div className="w-4 h-4 bg-orange-400 rounded" />
                        <span>Not Published {stats && `(${stats.notPublished.toLocaleString()})`}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 bg-red-500 rounded" />
                        <span>Error {stats && `(${stats.errors.toLocaleString()})`}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 bg-white border border-gray-300 rounded" />
                        <span>Not Found {stats && `(${stats.notFound.toLocaleString()})`}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <div className="w-4 h-4 bg-gray-100 border border-gray-200 rounded" />
                        <span>No Data {stats && `(${stats.empty.toLocaleString()})`}</span>
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
                            className="flex flex-wrap gap-px"
                            style={{ maxWidth: '100%' }}
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
