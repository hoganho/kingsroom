// enhanced-handleFetch.js
// Enhanced handleFetch function with S3 storage and caching support
// Replace your existing handleFetch function with this version

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const {
    storeHtmlInS3,
    getHtmlFromS3,
    calculateContentHash
} = require('./s3-helpers');

/**
 * Check if content has changed using HTTP headers
 * @param {string} url - URL to check
 * @param {object} scrapeURLRecord - Existing ScrapeURL record from database
 * @returns {object} Change detection result
 */
const checkForChanges = async (url, scrapeURLRecord) => {
    try {
        // Make HEAD request to check headers without downloading content
        const headResponse = await axios.head(url, {
            timeout: 5000,
            headers: { 
                'User-Agent': 'KingsRoom-Scraper/2.0',
                'Accept': 'text/html,application/xhtml+xml'
            },
            validateStatus: (status) => status < 500
        });
        
        const headers = headResponse.headers;
        const newEtag = headers.etag || headers.ETag;
        const newLastModified = headers['last-modified'] || headers['Last-Modified'];
        
        console.log(`[checkForChanges] Headers for ${url}:`, {
            etag: newEtag,
            lastModified: newLastModified,
            oldEtag: scrapeURLRecord.etag,
            oldLastModified: scrapeURLRecord.lastModifiedHeader
        });
        
        // Check ETag first (strongest indicator)
        if (newEtag && scrapeURLRecord.etag) {
            if (newEtag === scrapeURLRecord.etag) {
                console.log(`[checkForChanges] ETag unchanged for ${url}`);
                return { 
                    hasChanged: false, 
                    reason: 'etag_match',
                    newEtag,
                    newLastModified
                };
            } else {
                console.log(`[checkForChanges] ETag changed for ${url}`);
                return { 
                    hasChanged: true, 
                    reason: 'etag_changed',
                    newEtag,
                    newLastModified
                };
            }
        }
        
        // Check Last-Modified if no ETag
        if (newLastModified && scrapeURLRecord.lastModifiedHeader) {
            const newDate = new Date(newLastModified);
            const oldDate = new Date(scrapeURLRecord.lastModifiedHeader);
            
            if (newDate <= oldDate) {
                console.log(`[checkForChanges] Last-Modified unchanged for ${url}`);
                return { 
                    hasChanged: false, 
                    reason: 'last_modified_match',
                    newEtag,
                    newLastModified
                };
            } else {
                console.log(`[checkForChanges] Last-Modified changed for ${url}`);
                return { 
                    hasChanged: true, 
                    reason: 'last_modified_changed',
                    newEtag,
                    newLastModified
                };
            }
        }
        
        // No headers to compare or headers missing
        console.log(`[checkForChanges] No comparable headers for ${url}, assuming changed`);
        return { 
            hasChanged: true, 
            reason: 'no_headers_to_compare',
            newEtag,
            newLastModified
        };
        
    } catch (error) {
        console.log(`[checkForChanges] HEAD request failed for ${url}: ${error.message}`);
        // If HEAD request fails, we need to fetch content
        return { 
            hasChanged: true, 
            reason: 'head_request_failed',
            error: error.message
        };
    }
};

/**
 * Enhanced handleFetch with S3 storage and caching
 * @param {string} url - URL to scrape
 * @param {string} jobId - Optional job ID for tracking
 * @param {string} triggerSource - Source that triggered this scrape
 * @param {boolean} forceRefresh - Bypass cache and fetch fresh content
 * @returns {object} Scraped data
 */
const handleFetchEnhanced = async (url, jobId = null, triggerSource = null, forceRefresh = false) => {
    console.log(`[handleFetch] START processing ${url}. Force refresh: ${forceRefresh}`);
    
    const existingGameId = await checkExistingGame(url);
    const entityId = await getEntityIdFromUrl(url);
    
    // Extract tournament ID from URL
    const urlIdMatch = url.match(/id=(\d+)/);
    const tournamentId = urlIdMatch ? parseInt(urlIdMatch[1], 10) : 0;
    
    // Get ScrapeURL record
    const scrapeURLTable = getTableName('ScrapeURL');
    const scrapeURLResult = await ddbDocClient.send(new QueryCommand({
        TableName: scrapeURLTable,
        IndexName: 'byURL',
        KeyConditionExpression: 'url = :url',
        ExpressionAttributeValues: { ':url': url },
        Limit: 1
    }));
    
    const scrapeURLRecord = scrapeURLResult.Items?.[0];
    let scrapeURLId = scrapeURLRecord?.id;
    
    // Initialize tracking variables
    let html = null;
    let fetchedFromSource = false;
    let s3StorageResult = null;
    let cacheReason = null;
    let responseHeaders = {};
    
    // Determine if we need to fetch fresh content
    if (!forceRefresh && scrapeURLRecord?.s3StorageEnabled !== false && scrapeURLRecord?.latestS3Key) {
        console.log(`[handleFetch] Checking if cached content can be used`);
        
        // Check if content has changed
        const changeCheck = await checkForChanges(url, scrapeURLRecord);
        
        if (!changeCheck.hasChanged) {
            // Use cached content from S3
            console.log(`[handleFetch] Using cached content from S3 for ${url} (reason: ${changeCheck.reason})`);
            const s3Content = await getHtmlFromS3(scrapeURLRecord.latestS3Key);
            
            if (s3Content) {
                html = s3Content.html;
                cacheReason = changeCheck.reason;
                
                // Update cached content usage count and last header check
                await ddbDocClient.send(new UpdateCommand({
                    TableName: scrapeURLTable,
                    Key: { id: scrapeURLId },
                    UpdateExpression: 'SET cachedContentUsedCount = if_not_exists(cachedContentUsedCount, :zero) + :inc, lastHeaderCheckAt = :now',
                    ExpressionAttributeValues: {
                        ':zero': 0,
                        ':inc': 1,
                        ':now': new Date().toISOString()
                    }
                }));
                
                console.log(`[handleFetch] Successfully loaded cached content (${(s3Content.html.length / 1024).toFixed(2)} KB)`);
            } else {
                console.log(`[handleFetch] Failed to load cached content from S3, will fetch fresh`);
            }
        } else {
            console.log(`[handleFetch] Content has changed (${changeCheck.reason}), will fetch fresh`);
        }
    }
    
    // Fetch fresh content if needed
    if (!html) {
        console.log('[handleFetch] Fetching fresh content from source');
        
        try {
            // Prepare conditional request headers
            const requestHeaders = {
                'User-Agent': 'KingsRoom-Scraper/2.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5',
                'Accept-Encoding': 'gzip, deflate',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            };
            
            // Add conditional headers if we have them
            if (!forceRefresh && scrapeURLRecord?.etag) {
                requestHeaders['If-None-Match'] = scrapeURLRecord.etag;
            }
            if (!forceRefresh && scrapeURLRecord?.lastModifiedHeader) {
                requestHeaders['If-Modified-Since'] = scrapeURLRecord.lastModifiedHeader;
            }
            
            const response = await axios.get(url, {
                timeout: 15000,
                headers: requestHeaders,
                validateStatus: (status) => status < 500, // Don't throw on 304
                maxRedirects: 5,
                responseType: 'text'
            });
            
            responseHeaders = response.headers;
            
            if (response.status === 304) {
                // Content hasn't changed (server confirmed), use cached version
                console.log(`[handleFetch] Server returned 304 Not Modified for ${url}`);
                
                if (scrapeURLRecord?.latestS3Key) {
                    const s3Content = await getHtmlFromS3(scrapeURLRecord.latestS3Key);
                    html = s3Content?.html;
                    cacheReason = '304_not_modified';
                    
                    // Update last header check
                    await ddbDocClient.send(new UpdateCommand({
                        TableName: scrapeURLTable,
                        Key: { id: scrapeURLId },
                        UpdateExpression: 'SET lastHeaderCheckAt = :now, cachedContentUsedCount = if_not_exists(cachedContentUsedCount, :zero) + :inc',
                        ExpressionAttributeValues: {
                            ':now': new Date().toISOString(),
                            ':zero': 0,
                            ':inc': 1
                        }
                    }));
                } else {
                    throw new Error('Server returned 304 but no cached content available');
                }
            } else {
                // New content fetched
                html = response.data;
                fetchedFromSource = true;
                
                console.log(`[handleFetch] Fetched fresh content (${response.status}, ${(html.length / 1024).toFixed(2)} KB)`);
                
                // Store in S3
                try {
                    s3StorageResult = await storeHtmlInS3(
                        html,
                        url,
                        entityId,
                        tournamentId,
                        responseHeaders,
                        false // not manual upload
                    );
                    
                    console.log(`[handleFetch] Stored HTML in S3: ${s3StorageResult.s3Key}`);
                    
                    // Record S3 storage in database
                    const s3StorageTable = getTableName('S3Storage');
                    await ddbDocClient.send(new PutCommand({
                        TableName: s3StorageTable,
                        Item: {
                            id: uuidv4(),
                            scrapeURLId: scrapeURLId || null,
                            url: url,
                            tournamentId: tournamentId,
                            entityId: entityId,
                            s3Key: s3StorageResult.s3Key,
                            s3Bucket: s3StorageResult.s3Bucket,
                            scrapedAt: s3StorageResult.timestamp,
                            contentSize: s3StorageResult.contentSize,
                            contentHash: s3StorageResult.contentHash,
                            etag: responseHeaders.etag || responseHeaders.ETag || null,
                            lastModified: responseHeaders['last-modified'] || responseHeaders['Last-Modified'] || null,
                            headers: JSON.stringify(responseHeaders),
                            dataExtracted: false,
                            gameId: existingGameId,
                            isManualUpload: false,
                            createdAt: new Date().toISOString(),
                            updatedAt: new Date().toISOString()
                        }
                    }));
                } catch (s3Error) {
                    console.error(`[handleFetch] Failed to store in S3: ${s3Error.message}`);
                    // Continue processing even if S3 storage fails
                }
            }
        } catch (fetchError) {
            console.error(`[handleFetch] Error fetching from source: ${fetchError.message}`);
            
            // Try to use cached content as fallback
            if (!forceRefresh && scrapeURLRecord?.latestS3Key) {
                console.log(`[handleFetch] Attempting to use cached content as fallback`);
                const s3Content = await getHtmlFromS3(scrapeURLRecord.latestS3Key);
                if (s3Content) {
                    html = s3Content.html;
                    cacheReason = 'fallback_on_error';
                } else {
                    throw new Error(`Failed to fetch content and no cached version available: ${fetchError.message}`);
                }
            } else {
                throw fetchError;
            }
        }
    }
    
    // Ensure we have HTML content at this point
    if (!html) {
        throw new Error('No HTML content available for processing');
    }
    
    console.log(`[handleFetch] Processing HTML content (source: ${fetchedFromSource ? 'fresh' : `cached (${cacheReason})`})`);
    
    // Continue with existing scraping logic
    const venues = await getAllVenues();
    const seriesTitles = await getAllSeriesTitles();
    
    const scrapingResult = scrapeDataFromHtml(html, venues, seriesTitles, url);
    const scrapedData = scrapingResult.data;
    const foundKeys = scrapingResult.foundKeys;
    
    // Add tournament ID if found in URL
    if (tournamentId) {
        scrapedData.tournamentId = tournamentId;
        if (!foundKeys.includes('tournamentId')) {
            foundKeys.push('tournamentId');
        }
    }
    
    // Check for blank/invalid tournament
    if (scrapedData.gameStatus === 'UNKNOWN_STATUS' || 
        scrapedData.gameStatus === 'UNKNOWN' || 
        !scrapedData.name || 
        scrapedData.name.trim() === '') {
        
        console.log(`[handleFetch] Tournament ID not in use for ${url}`);
        return {
            id: existingGameId,
            name: 'Tournament ID Not In Use',
            gameStatus: 'NOT_IN_USE',
            registrationStatus: 'N_A',
            gameStartDateTime: null,
            gameEndDateTime: null,
            gameVariant: 'UNKNOWN',
            prizepool: 0,
            totalEntries: 0,
            tournamentType: 'UNKNOWN',
            buyIn: 0,
            rake: 0,
            startingStack: 0,
            hasGuarantee: false,
            guaranteeAmount: 0,
            gameTags: [],
            levels: [],
            isInactive: true,
            sourceUrl: url,
            existingGameId: existingGameId,
            entityId: entityId
        };
    }
    
    // Process structure fingerprint
    const fingerprint = await processStructureFingerprint(foundKeys, scrapedData.structureLabel, url);
    
    // Update or create ScrapeURL record with caching info
    if (fetchedFromSource && s3StorageResult) {
        const contentHashPrefix = s3StorageResult.contentHash.substring(0, 8);
        
        // Check if content actually changed (by comparing hash)
        const contentChanged = !scrapeURLRecord?.contentHash || 
                             scrapeURLRecord.contentHash !== contentHashPrefix;
        
        // Create or update ScrapeURL record
        if (!scrapeURLId) {
            // Create new ScrapeURL record
            scrapeURLId = uuidv4();
            await ddbDocClient.send(new PutCommand({
                TableName: scrapeURLTable,
                Item: {
                    id: scrapeURLId,
                    url: url,
                    tournamentId: tournamentId,
                    entityId: entityId,
                    status: 'ACTIVE',
                    doNotScrape: false,
                    sourceSystem: urlIdMatch ? 'TOURNAMENT' : 'UNKNOWN',
                    placedIntoDatabase: false,
                    firstScrapedAt: new Date().toISOString(),
                    lastScrapedAt: new Date().toISOString(),
                    timesScraped: 1,
                    timesSuccessful: 1,
                    timesFailed: 0,
                    consecutiveFailures: 0,
                    etag: responseHeaders.etag || responseHeaders.ETag || null,
                    lastModifiedHeader: responseHeaders['last-modified'] || responseHeaders['Last-Modified'] || null,
                    contentHash: contentHashPrefix,
                    s3StoragePrefix: `entities/${entityId}/html/${tournamentId}`,
                    latestS3Key: s3StorageResult.s3Key,
                    s3StorageEnabled: true,
                    lastContentChangeAt: new Date().toISOString(),
                    totalContentChanges: 1,
                    cachedContentUsedCount: 0,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                }
            }));
        } else {
            // Update existing ScrapeURL record
            const updateExpression = [
                'SET lastScrapedAt = :now',
                'updatedAt = :now',
                'timesScraped = if_not_exists(timesScraped, :zero) + :inc',
                'timesSuccessful = if_not_exists(timesSuccessful, :zero) + :inc',
                'consecutiveFailures = :zero',
                'etag = :etag',
                'lastModifiedHeader = :lastMod',
                'contentHash = :hash',
                'latestS3Key = :s3Key',
                's3StoragePrefix = :prefix'
            ];
            
            const expressionValues = {
                ':now': new Date().toISOString(),
                ':zero': 0,
                ':inc': 1,
                ':etag': responseHeaders.etag || responseHeaders.ETag || null,
                ':lastMod': responseHeaders['last-modified'] || responseHeaders['Last-Modified'] || null,
                ':hash': contentHashPrefix,
                ':s3Key': s3StorageResult.s3Key,
                ':prefix': `html/${entityId}/${tournamentId}`
            };
            
            if (contentChanged) {
                updateExpression.push('lastContentChangeAt = :changeAt');
                updateExpression.push('totalContentChanges = if_not_exists(totalContentChanges, :zero) + :inc');
                expressionValues[':changeAt'] = new Date().toISOString();
            }
            
            await ddbDocClient.send(new UpdateCommand({
                TableName: scrapeURLTable,
                Key: { id: scrapeURLId },
                UpdateExpression: updateExpression.join(', '),
                ExpressionAttributeValues: expressionValues
            }));
        }
    }
    
    // Add additional metadata to scraped data
    scrapedData.existingGameId = existingGameId;
    scrapedData.sourceUrl = url;
    scrapedData.fetchedAt = new Date().toISOString();
    scrapedData.entityId = entityId;
    scrapedData.fetchedFromSource = fetchedFromSource;
    scrapedData.cacheReason = cacheReason;
    
    // Process venue matching (existing logic)
    if (scrapedData.venueMatch) {
        console.log(`[handleFetch] Venue match found:`, scrapedData.venueMatch);
        
        if (scrapedData.venueMatch.autoAssignedVenue) {
            scrapedData.venueId = scrapedData.venueMatch.autoAssignedVenue.id;
            scrapedData.venueName = scrapedData.venueMatch.autoAssignedVenue.name;
            scrapedData.venueAssignmentStatus = 'AUTO_ASSIGNED';
            scrapedData.venueAssignmentConfidence = scrapedData.venueMatch.autoAssignedVenue.score;
            scrapedData.requiresVenueAssignment = false;
        } else if (scrapedData.venueMatch.suggestions && scrapedData.venueMatch.suggestions.length > 0) {
            scrapedData.venueId = UNASSIGNED_VENUE_ID;
            scrapedData.venueName = UNASSIGNED_VENUE_NAME;
            scrapedData.suggestedVenueName = scrapedData.venueName;
            scrapedData.venueAssignmentStatus = 'PENDING_ASSIGNMENT';
            scrapedData.requiresVenueAssignment = true;
            scrapedData.venueAssignmentConfidence = scrapedData.venueMatch.suggestions[0].score;
        } else {
            scrapedData.venueId = UNASSIGNED_VENUE_ID;
            scrapedData.venueName = UNASSIGNED_VENUE_NAME;
            scrapedData.venueAssignmentStatus = 'PENDING_ASSIGNMENT';
            scrapedData.requiresVenueAssignment = true;
            scrapedData.venueAssignmentConfidence = 0;
        }
    } else {
        scrapedData.venueId = UNASSIGNED_VENUE_ID;
        scrapedData.venueName = UNASSIGNED_VENUE_NAME;
        scrapedData.venueAssignmentStatus = 'PENDING_ASSIGNMENT';
        scrapedData.requiresVenueAssignment = true;
        scrapedData.venueAssignmentConfidence = 0;
    }
    
    console.log(`[handleFetch] Scraped data successfully for ${url}. END handleFetch.`);
    
    return {
        ...scrapedData,
        existingGameId,
        scrapedData: scrapedData,
        originalScrapedData: scrapedData,
        foundKeys: foundKeys,
        jobId: jobId,
        triggerSource: triggerSource
    };
};

module.exports = {
    handleFetchEnhanced,
    checkForChanges
};
