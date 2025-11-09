// src/components/scraper/ScrapeOptionsModalV2.tsx
// FIXED: Stable client reference and proper cleanup to prevent re-render loops

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Database, Globe, AlertCircle, RefreshCw, CheckCircle, HardDrive } from 'lucide-react';
import { generateClient } from 'aws-amplify/api';
import { getScrapeURL } from '../../graphql/queries';

interface ScrapeOptionsModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectOption: (option: 'S3' | 'LIVE', s3Key?: string) => void;
    url: string;
    entityId: string;
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
    entityId
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
                        query: getScrapeURL,
                        variables: { id: url }
                    });
                    
                    if ('data' in scrapeUrlResponse && scrapeUrlResponse.data?.getScrapeURL) {
                        setScrapeUrlData(scrapeUrlResponse.data.getScrapeURL);
                        
                        // Use local variable instead of state to avoid stale closure
                        if (storageItems.length > 0) {
                            checkForUpdates(scrapeUrlResponse.data.getScrapeURL);
                        }
                    }
                } catch (scrapeUrlError) {
                    console.warn('[ScrapeOptionsModal] Could not get ScrapeURL data:', scrapeUrlError);
                    setScrapeUrlData(null);
                }
                
            } catch (error) {
                console.error('[ScrapeOptionsModal] Unexpected error in checkStorage:', error);
            } finally {
                setLoading(false);
                isCheckingStorage.current = false;
            }
        };
        
        // Add debounce to prevent rapid calls when modal opens/closes quickly
        const timeoutId = setTimeout(() => {
            checkStorage();
        }, 500); // Wait 500ms before calling
        
        // Cleanup timeout on unmount or dependencies change
        return () => {
            clearTimeout(timeoutId);
            isCheckingStorage.current = false;
        };
    }, [isOpen, url, entityId]); // NOTE: 'client' removed from dependencies since it's now stable

    // Check for page updates using cache headers
    const checkForUpdates = async (scrapeUrl?: any) => {
        setCheckingUpdates(true);
        
        try {
            const urlData = scrapeUrl || scrapeUrlData;
            
            if (!urlData) {
                setUpdateAvailable(true); // No previous data, assume update available
                return;
            }
            
            // Make a HEAD request to check headers
            const response = await fetch(url, { method: 'HEAD' });
            
            if (response.ok) {
                const currentEtag = response.headers.get('etag');
                const currentLastModified = response.headers.get('last-modified');
                
                // Check if content has changed
                if (urlData.etag && currentEtag) {
                    setUpdateAvailable(currentEtag !== urlData.etag);
                } else if (urlData.lastModifiedHeader && currentLastModified) {
                    setUpdateAvailable(currentLastModified !== urlData.lastModifiedHeader);
                } else {
                    // Can't determine from headers, assume update might be available
                    setUpdateAvailable(true);
                }
            } else {
                setUpdateAvailable(true); // Error checking, assume update available
            }
            
        } catch (error) {
            console.error('Error checking for updates:', error);
            setUpdateAvailable(true); // Error, be safe and allow scraping
        } finally {
            setCheckingUpdates(false);
        }
    };

    const handleLiveScrape = () => {
        // If no updates and S3 exists, show confirmation
        if (s3StorageItems.length > 0 && updateAvailable === false) {
            setShowConfirmDialog(true);
        } else {
            onSelectOption('LIVE');
        }
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
                                        </div>
                                    </div>
                                )}

                                {/* Update Status */}
                                {updateAvailable !== null && (
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
                                        onClick={
                                            s3StorageItems.length > 0 && updateAvailable === null 
                                                ? () => checkForUpdates() 
                                                : handleLiveScrape
                                        }
                                        disabled={checkingUpdates}
                                        className={`w-full px-4 py-3 rounded-lg font-medium flex items-center justify-center space-x-2 transition-colors ${
                                            updateAvailable === false
                                                ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                                : 'bg-green-600 text-white hover:bg-green-700'
                                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                                    >
                                        {checkingUpdates ? (
                                            <RefreshCw className="h-4 w-4 animate-spin" />
                                        ) : updateAvailable ? (
                                            <AlertCircle className="h-4 w-4" />
                                        ) : (
                                            <Globe className="h-4 w-4" />
                                        )}
                                        <span>{getLiveScrapeButtonText()}</span>
                                    </button>
                                </div>

                                {/* History Link */}
                                {s3StorageItems.length > 1 && (
                                    <div className="text-center pt-2">
                                        <p className="text-xs text-gray-500">
                                            {s3StorageItems.length - 1} older version{s3StorageItems.length > 2 ? 's' : ''} available
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
                <div className="fixed inset-0 z-[60] overflow-auto bg-black bg-opacity-50 flex items-center justify-center">
                    <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
                        <div className="flex items-start space-x-3 mb-4">
                            <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
                            <div>
                                <h4 className="text-lg font-semibold text-gray-900">No Updates Detected</h4>
                                <p className="text-sm text-gray-600 mt-1">
                                    This page has not been updated since the last scrape. 
                                    It's recommended to use the locally stored copy.
                                </p>
                            </div>
                        </div>
                        
                        <div className="flex space-x-3 mt-6">
                            <button
                                onClick={() => {
                                    setShowConfirmDialog(false);
                                    onSelectOption('LIVE');
                                }}
                                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
                            >
                                Scrape Anyway
                            </button>
                            <button
                                onClick={() => {
                                    setShowConfirmDialog(false);
                                    handleUseS3();
                                }}
                                className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                            >
                                Use S3 HTML
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};