// Complete enhanced ScrapeOptionsModal.tsx with ALL original functionality preserved
// This keeps the sophisticated S3 storage checking, update detection, and adds doNotScrape handling

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Database, Globe, AlertCircle, RefreshCw, CheckCircle, HardDrive } from 'lucide-react';
import { generateClient } from 'aws-amplify/api';
import { getScrapeURLForCache } from '../../graphql/customQueries';

interface ScrapeOptionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectOption: (option: 'S3' | 'LIVE', s3Key?: string) => void;
    url: string;
    entityId: string;
    doNotScrape?: boolean;
    gameStatus?: string;
    warningMessage?: string;
}

interface S3StorageItem {
    id: string;
    s3Key: string;
    scrapedAt: string;
    contentHash: string;
    isManualUpload: boolean;
    entityId: string;
}

export const ScrapeOptionsModal: React.FC<ScrapeOptionsModalProps> = ({
    isOpen,
    onClose,
    onSelectOption,
    url,
    entityId,
    doNotScrape = false,
    gameStatus,
    warningMessage
}) => {
    const [s3StorageItems, setS3StorageItems] = useState<S3StorageItem[]>([]);
    const [scrapeUrlData, setScrapeUrlData] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [checkingUpdates, setCheckingUpdates] = useState(false);
    const [updateAvailable, setUpdateAvailable] = useState<boolean | null>(null);
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    
    // Add ref to prevent concurrent calls
    const isCheckingStorage = useRef(false);
    
    // CRITICAL FIX: Memoize the client so it's stable across renders
    const client = useMemo(() => generateClient(), []);

    // Check for existing S3 storage and ScrapeURL record
    useEffect(() => {
        if (!isOpen) {
            // Reset state when modal closes
            setS3StorageItems([]);
            setScrapeUrlData(null);
            setUpdateAvailable(null);
            setLoading(false);
            isCheckingStorage.current = false;
            return;
        }
        
        const checkStorage = async () => {
            // Prevent multiple simultaneous calls
            if (isCheckingStorage.current) {
                console.log('[ScrapeOptionsModal] Skipping checkStorage - already in progress');
                return;
            }
            
            isCheckingStorage.current = true;
            setLoading(true);
            
            try {
                let storageItems: S3StorageItem[] = []; // Local variable to avoid stale closure
                
                // First, try to get S3Storage items for this URL
                try {
                    const storageResponse = await client.graphql({
                        query: /* GraphQL */ `
                            query ListStoredHTML($url: AWSURL!, $limit: Int) {
                                listStoredHTML(url: $url, limit: $limit) {
                                    items {
                                        id
                                        s3Key
                                        scrapedAt
                                        contentHash
                                        isManualUpload
                                        entityId
                                    }
                                    nextToken
                                }
                            }
                        `,
                        variables: { url, limit: 5 }
                    });
                    
                    if ('data' in storageResponse && storageResponse.data?.listStoredHTML?.items) {
                        // Filter by entity if needed
                        storageItems = storageResponse.data.listStoredHTML.items
                            .filter((item: any) => !entityId || item.entityId === entityId);
                        setS3StorageItems(storageItems);
                    }
                } catch (s3Error: any) {
                    // Handle S3 Lambda errors specifically
                    if (s3Error?.errors?.[0]?.message?.includes('Rate Exceeded')) {
                        console.warn('[ScrapeOptionsModal] Rate limit hit for S3 storage check');
                    } else if (s3Error?.errors?.[0]?.message?.includes('Function not found')) {
                        console.warn('[ScrapeOptionsModal] S3ManagementFunction not deployed');
                    } else if (s3Error?.errors?.[0]?.message?.includes('ValidationException')) {
                        console.warn('[ScrapeOptionsModal] DynamoDB validation error');
                    } else {
                        console.error('[ScrapeOptionsModal] Error checking S3 storage:', s3Error);
                    }
                    setS3StorageItems([]);
                    storageItems = [];
                }
                
                // Then, get ScrapeURL record for cache metadata
                try {
                    const scrapeUrlResponse = await client.graphql({
                        query: getScrapeURLForCache,
                        variables: { id: url }
                    });
                    
                    if ('data' in scrapeUrlResponse && scrapeUrlResponse.data?.getScrapeURL) {
                        const data = scrapeUrlResponse.data.getScrapeURL;
                        setScrapeUrlData(data);
                        
                        // If we don't have storage items but ScrapeURL has S3 key, add it
                        if (storageItems.length === 0 && data.latestS3Key) {
                            const fallbackItem: S3StorageItem = {
                                id: url,
                                s3Key: data.latestS3Key,
                                scrapedAt: data.lastScrapedAt || new Date().toISOString(),
                                contentHash: data.contentHash || '',
                                isManualUpload: false,
                                entityId: entityId
                            };
                            setS3StorageItems([fallbackItem]);
                            storageItems = [fallbackItem];
                        }
                    }
                } catch (error) {
                    console.warn('[ScrapeOptionsModal] Error getting ScrapeURL:', error);
                }
                
            } catch (error) {
                console.error('[ScrapeOptionsModal] Unexpected error checking storage:', error);
            } finally {
                setLoading(false);
                isCheckingStorage.current = false;
            }
        };
        
        checkStorage();
    }, [isOpen, url, entityId, client]);

    // Check for updates
    const checkForUpdates = async () => {
        setCheckingUpdates(true);
        setUpdateAvailable(null);
        
        try {
            // Make a quick HEAD request to check if content has changed
            const response = await fetch(`/api/check-updates?url=${encodeURIComponent(url)}`, {
                method: 'HEAD'
            });
            
            const etag = response.headers.get('etag');
            const lastModified = response.headers.get('last-modified');
            
            // Compare with stored values
            if (scrapeUrlData) {
                const hasEtagChanged = etag && scrapeUrlData.etag !== etag;
                const hasLastModifiedChanged = lastModified && scrapeUrlData.lastModifiedHeader !== lastModified;
                
                setUpdateAvailable(hasEtagChanged || hasLastModifiedChanged || false);
            } else {
                // No previous data, assume updates available
                setUpdateAvailable(true);
            }
        } catch (error) {
            console.error('[ScrapeOptionsModal] Error checking for updates:', error);
            // On error, assume updates might be available
            setUpdateAvailable(null);
        } finally {
            setCheckingUpdates(false);
        }
    };

    const handleScrapeLive = async () => {
        // If we haven't checked for updates yet, do it now
        if (updateAvailable === null && s3StorageItems.length > 0) {
            await checkForUpdates();
            
            // If no updates and user still wants to scrape, show confirmation
            if (updateAvailable === false) {
                setShowConfirmDialog(true);
                return;
            }
        }
        
        onSelectOption('LIVE');
    };

    const handleUseS3 = () => {
        // Use the most recent S3 key
        if (s3StorageItems.length > 0) {
            onSelectOption('S3', s3StorageItems[0].s3Key);
        }
    };

    const formatDate = (dateStr?: string) => {
        if (!dateStr) return 'N/A';
        return new Date(dateStr).toLocaleString();
    };

    const getLiveScrapeButtonText = () => {
        if (checkingUpdates) return 'Checking for updates...';
        
        // If doNotScrape is true, always show "Force Fresh Scrape"
        if (doNotScrape) {
            return 'Force Fresh Scrape';
        }
        
        if (s3StorageItems.length === 0) {
            return 'Scrape Live Page';
        }
        
        if (updateAvailable === null) {
            return 'Check for Updates';
        }
        
        if (updateAvailable) {
            return 'Scrape Updated Page';
        }
        
        return 'Scrape Anyway (No Updates)';
    };

    // Helper to determine status display
    const getStatusDisplay = () => {
        if (gameStatus === 'NOT_PUBLISHED') return 'Not Published';
        if (gameStatus === 'NOT_IN_USE') return 'Not In Use';
        if (gameStatus === 'NOT_FOUND') return 'Not Found';
        if (doNotScrape) return 'Restricted';
        return null;
    };

    const statusDisplay = getStatusDisplay();

    if (!isOpen) return null;

    return (
        <>
            <div className="fixed inset-0 z-50 overflow-auto bg-black bg-opacity-50 flex items-center justify-center">
                <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
                    {/* Header */}
                    <div className="flex items-center justify-between p-4 border-b">
                        <h3 className="text-lg font-semibold text-gray-900">
                            Scrape Options
                        </h3>
                        <button
                            onClick={onClose}
                            className="text-gray-400 hover:text-gray-500 transition-colors"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-4">
                        {/* URL Display */}
                        <div className="bg-gray-50 rounded-lg p-3 mb-4">
                            <p className="text-xs text-gray-500 uppercase tracking-wider font-medium mb-1">
                                Tournament URL
                            </p>
                            <p className="text-sm text-gray-700 break-all font-mono">
                                {url}
                            </p>
                        </div>

                        {/* Warning for doNotScrape/special status tournaments */}
                        {(doNotScrape || statusDisplay) && (
                            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                <div className="flex items-start space-x-2">
                                    <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                                    <div className="flex-1">
                                        {statusDisplay && (
                                            <p className="font-medium text-yellow-900 text-sm">
                                                Tournament Status: {statusDisplay}
                                            </p>
                                        )}
                                        <p className="text-yellow-800 text-xs mt-1">
                                            {warningMessage || 
                                             `This tournament is marked as "Do Not Scrape"${
                                                 statusDisplay ? ` because it is ${statusDisplay.toLowerCase()}` : ''
                                             }. You can force a scrape if needed for testing.`}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {loading ? (
                            <div className="flex items-center justify-center py-8">
                                <RefreshCw className="h-6 w-6 text-gray-400 animate-spin" />
                                <p className="text-gray-600 ml-2">Checking storage status...</p>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Storage Status Info */}
                                {s3StorageItems.length > 0 && (
                                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                                        <div className="flex items-start space-x-2">
                                            <HardDrive className="h-4 w-4 text-blue-600 mt-0.5" />
                                            <div className="flex-1">
                                                <p className="font-medium text-blue-900">
                                                    {s3StorageItems.length} Stored Version{s3StorageItems.length > 1 ? 's' : ''} Available
                                                </p>
                                                <p className="text-blue-700 text-xs mt-1">
                                                    Latest: {formatDate(s3StorageItems[0]?.scrapedAt)}
                                                </p>
                                                {s3StorageItems[0]?.isManualUpload && (
                                                    <p className="text-blue-600 text-xs mt-1">
                                                        (Manual Upload)
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Cache Info from ScrapeURL */}
                                {scrapeUrlData && (
                                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm">
                                        <p className="font-medium text-gray-700">Cache Information:</p>
                                        <div className="mt-1 space-y-1 text-xs text-gray-600">
                                            <p>Times Scraped: {scrapeUrlData.timesScraped || 0}</p>
                                            <p>Cache Hits: {scrapeUrlData.cachedContentUsedCount || 0}</p>
                                            {scrapeUrlData.lastSuccessfulScrapeAt && (
                                                <p>Last Success: {formatDate(scrapeUrlData.lastSuccessfulScrapeAt)}</p>
                                            )}
                                            {scrapeUrlData.doNotScrape && (
                                                <p className="text-yellow-600 font-medium">⚠️ Marked as Do Not Scrape</p>
                                            )}
                                        </div>
                                    </div>
                                )}

                                {/* Update Status */}
                                {updateAvailable !== null && !doNotScrape && (
                                    <div className={`border rounded-lg p-3 text-sm ${
                                        updateAvailable 
                                            ? 'bg-yellow-50 border-yellow-200' 
                                            : 'bg-green-50 border-green-200'
                                    }`}>
                                        <div className="flex items-start space-x-2">
                                            {updateAvailable ? (
                                                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                                            ) : (
                                                <CheckCircle className="h-4 w-4 text-green-600 mt-0.5" />
                                            )}
                                            <div className="flex-1">
                                                <p className={`font-medium ${
                                                    updateAvailable ? 'text-yellow-900' : 'text-green-900'
                                                }`}>
                                                    {updateAvailable 
                                                        ? 'Page updates detected' 
                                                        : 'No updates since last scrape'}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Action Buttons */}
                                <div className="space-y-3 pt-2">
                                    {/* Use S3 HTML Button */}
                                    <button
                                        onClick={handleUseS3}
                                        disabled={s3StorageItems.length === 0}
                                        className={`w-full px-4 py-3 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors ${
                                            s3StorageItems.length > 0
                                                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                        }`}
                                    >
                                        <Database className="h-4 w-4" />
                                        <span>Use S3 HTML</span>
                                    </button>

                                    {/* Scrape Live Page Button */}
                                    <button
                                        onClick={handleScrapeLive}
                                        disabled={checkingUpdates}
                                        className={`w-full px-4 py-3 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors ${
                                            doNotScrape
                                                ? 'bg-yellow-500 text-white hover:bg-yellow-600'
                                                : checkingUpdates
                                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                                                : 'bg-green-600 text-white hover:bg-green-700'
                                        }`}
                                    >
                                        <Globe className="h-4 w-4" />
                                        <span>{getLiveScrapeButtonText()}</span>
                                    </button>

                                    {/* Cancel Button */}
                                    <button
                                        onClick={onClose}
                                        className="w-full px-4 py-2 rounded-lg font-medium text-gray-600 hover:text-gray-800 bg-white border border-gray-300 hover:bg-gray-50 transition-colors"
                                    >
                                        Cancel
                                    </button>
                                </div>

                                {/* Additional Info */}
                                {doNotScrape && (
                                    <div className="mt-4 pt-4 border-t border-gray-200">
                                        <p className="text-xs text-gray-500 text-center">
                                            Force scraping restricted tournaments is logged for audit purposes
                                        </p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Confirmation Dialog */}
            {showConfirmDialog && (
                <div className="fixed inset-0 z-[60] bg-black bg-opacity-50 flex items-center justify-center">
                    <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
                        <h4 className="text-lg font-semibold mb-3">Confirm Scrape</h4>
                        <p className="text-gray-600 mb-6">
                            No updates detected since last scrape. Are you sure you want to scrape again?
                            This will use an API credit.
                        </p>
                        <div className="flex space-x-3">
                            <button
                                onClick={() => {
                                    setShowConfirmDialog(false);
                                    onSelectOption('LIVE');
                                }}
                                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                            >
                                Yes, Scrape Anyway
                            </button>
                            <button
                                onClick={() => setShowConfirmDialog(false)}
                                className="flex-1 px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};