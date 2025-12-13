/**
 * ===================================================================
 * S3 Client
 * ===================================================================
 * 
 * S3 operations for HTML storage and retrieval.
 * Handles storing scraped HTML and retrieving cached content.
 * 
 * ===================================================================
 */

const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, HeadObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');
const { S3_BUCKET, AWS_REGION } = require('../config/constants');

// Initialize S3 client
const s3Client = new S3Client({ region: AWS_REGION });

/**
 * Calculate content hash (MD5)
 * 
 * @param {string} content - Content to hash
 * @returns {string} MD5 hash hex string
 */
const calculateContentHash = (content) => {
    return crypto.createHash('md5').update(content).digest('hex');
};

/**
 * Generate S3 key for storing HTML
 * Format: entities/{entityId}/html/{tournamentId}/{timestamp}_tid{tournamentId}_{hash}.html
 * 
 * @param {string} entityId - Entity ID
 * @param {number} tournamentId - Tournament ID
 * @param {string} timestamp - ISO timestamp
 * @param {string} contentHash - Content hash (first 8 chars used)
 * @returns {string} S3 key
 */
const generateS3Key = (entityId, tournamentId, timestamp, contentHash) => {
    if (!entityId) {
        throw new Error('Entity ID is required for S3 storage');
    }
    const timestampStr = timestamp.replace(/:/g, '-').replace(/\./g, '-');
    const hashPrefix = contentHash.substring(0, 8);
    return `entities/${entityId}/html/${tournamentId}/${timestampStr}_tid${tournamentId}_${hashPrefix}.html`;
};

/**
 * Generate S3 key for manual uploads
 * 
 * @param {string} entityId - Entity ID
 * @param {number} tournamentId - Tournament ID
 * @param {string} timestamp - ISO timestamp
 * @param {string} filename - Original filename
 * @returns {string} S3 key
 */
const generateManualS3Key = (entityId, tournamentId, timestamp, filename) => {
    if (!entityId) {
        throw new Error('Entity ID is required for S3 storage');
    }
    const timestampStr = timestamp.replace(/:/g, '-').replace(/\./g, '-');
    const safeFilename = filename ? filename.replace(/[^a-zA-Z0-9.-]/g, '_') : 'manual';
    return `entities/${entityId}/manual-uploads/${tournamentId}/${timestampStr}_${safeFilename}.html`;
};

/**
 * Store HTML content in S3
 * 
 * @param {string} html - HTML content to store
 * @param {string} url - Source URL
 * @param {string} entityId - Entity ID
 * @param {number} tournamentId - Tournament ID
 * @param {object} headers - Response headers from fetch
 * @param {boolean} isManual - Whether this is a manual upload
 * @returns {object} Storage result { s3Key, s3Bucket, contentHash, contentSize, timestamp }
 */
const storeHtmlInS3 = async (html, url, entityId, tournamentId, headers = {}, isManual = false) => {
    try {
        const timestamp = new Date().toISOString();
        const contentHash = calculateContentHash(html);
        const s3Key = isManual
            ? generateManualS3Key(entityId, tournamentId, timestamp, 'upload')
            : generateS3Key(entityId, tournamentId, timestamp, contentHash);
        
        // Prepare metadata (S3 metadata keys must be lowercase)
        const metadata = {
            url: url || '',
            tournamentid: String(tournamentId),
            entityid: entityId || '',
            scrapedat: timestamp,
            etag: headers.etag || headers.ETag || '',
            lastmodified: headers['last-modified'] || headers['Last-Modified'] || '',
            contenthash: contentHash,
            ismanual: String(isManual)
        };
        
        // Remove empty metadata values
        Object.keys(metadata).forEach(key => {
            if (!metadata[key]) delete metadata[key];
        });
        
        // Store in S3
        const putCommand = new PutObjectCommand({
            Bucket: S3_BUCKET,
            Key: s3Key,
            Body: html,
            ContentType: 'text/html; charset=utf-8',
            Metadata: metadata,
            StorageClass: 'STANDARD'
        });
        
        await s3Client.send(putCommand);
        
        console.log(`[S3Client] Stored HTML at: ${s3Key} (${html.length} bytes)`);
        
        return {
            s3Key,
            s3Bucket: S3_BUCKET,
            contentHash,
            contentSize: Buffer.byteLength(html, 'utf8'),
            timestamp,
            metadata
        };
        
    } catch (error) {
        console.error('[S3Client] Error storing HTML:', error);
        throw new Error(`Failed to store HTML in S3: ${error.message}`);
    }
};

/**
 * Retrieve HTML from S3
 * 
 * @param {string} s3Key - S3 key of the HTML file
 * @returns {object|null} { html, metadata, lastModified, contentLength, etag } or null
 */
const getHtmlFromS3 = async (s3Key) => {
    try {
        const getCommand = new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: s3Key
        });
        
        const response = await s3Client.send(getCommand);
        
        // Convert stream to string
        const chunks = [];
        for await (const chunk of response.Body) {
            chunks.push(chunk);
        }
        const html = Buffer.concat(chunks).toString('utf-8');
        
        console.log(`[S3Client] Retrieved HTML from: ${s3Key} (${html.length} bytes)`);
        
        return {
            html,
            metadata: response.Metadata || {},
            lastModified: response.LastModified,
            contentLength: response.ContentLength,
            etag: response.ETag
        };
        
    } catch (error) {
        if (error.name === 'NoSuchKey') {
            console.log(`[S3Client] Key not found: ${s3Key}`);
            return null;
        }
        
        console.error(`[S3Client] Error retrieving HTML from ${s3Key}:`, error);
        throw new Error(`Failed to retrieve HTML from S3: ${error.message}`);
    }
};

/**
 * Check if an S3 object exists
 * 
 * @param {string} s3Key - S3 key to check
 * @returns {boolean} True if exists
 */
const checkS3ObjectExists = async (s3Key) => {
    try {
        const headCommand = new HeadObjectCommand({
            Bucket: S3_BUCKET,
            Key: s3Key
        });
        
        await s3Client.send(headCommand);
        return true;
        
    } catch (error) {
        if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
            return false;
        }
        throw error;
    }
};

/**
 * List HTML files for a tournament
 * 
 * @param {string} entityId - Entity ID
 * @param {number} tournamentId - Tournament ID
 * @param {number} limit - Maximum number of results
 * @returns {array} List of HTML files
 */
const listHtmlFilesForTournament = async (entityId, tournamentId, limit = 100) => {
    try {
        if (!entityId) {
            throw new Error('Entity ID is required');
        }
        
        const prefix = `entities/${entityId}/html/${tournamentId}/`;
        
        const listCommand = new ListObjectsV2Command({
            Bucket: S3_BUCKET,
            Prefix: prefix,
            MaxKeys: limit
        });
        
        const response = await s3Client.send(listCommand);
        
        if (!response.Contents || response.Contents.length === 0) {
            return [];
        }
        
        const files = response.Contents.map(obj => ({
            key: obj.Key,
            size: obj.Size,
            lastModified: obj.LastModified,
            filename: obj.Key.split('/').pop(),
            etag: obj.ETag
        }));
        
        // Sort by lastModified descending (newest first)
        files.sort((a, b) => b.lastModified - a.lastModified);
        
        console.log(`[S3Client] Found ${files.length} HTML files for tournament ${tournamentId}`);
        
        return files;
        
    } catch (error) {
        console.error('[S3Client] Error listing HTML files:', error);
        throw new Error(`Failed to list HTML files: ${error.message}`);
    }
};

/**
 * Get S3 storage statistics
 * 
 * @param {string} entityId - Optional entity ID filter
 * @returns {object} Storage statistics
 */
const getStorageStats = async (entityId = null) => {
    try {
        const prefix = entityId ? `entities/${entityId}/` : 'entities/';
        let totalSize = 0;
        let fileCount = 0;
        const entityStats = {};
        let continuationToken = null;
        
        do {
            const listCommand = new ListObjectsV2Command({
                Bucket: S3_BUCKET,
                Prefix: prefix,
                ContinuationToken: continuationToken
            });
            
            const response = await s3Client.send(listCommand);
            
            if (response.Contents) {
                response.Contents.forEach(obj => {
                    totalSize += obj.Size || 0;
                    fileCount++;
                    
                    // Extract entity from key for per-entity stats
                    const keyParts = obj.Key.split('/');
                    if (keyParts[0] === 'entities' && keyParts[1]) {
                        const entityKey = keyParts[1];
                        if (!entityStats[entityKey]) {
                            entityStats[entityKey] = { fileCount: 0, totalSize: 0 };
                        }
                        entityStats[entityKey].fileCount++;
                        entityStats[entityKey].totalSize += obj.Size || 0;
                    }
                });
            }
            
            continuationToken = response.NextContinuationToken;
        } while (continuationToken);
        
        return {
            fileCount,
            totalSizeBytes: totalSize,
            totalSizeMB: (totalSize / (1024 * 1024)).toFixed(2),
            averageFileSizeKB: fileCount > 0 ? ((totalSize / fileCount) / 1024).toFixed(2) : 0,
            entityBreakdown: entityId ? null : entityStats
        };
        
    } catch (error) {
        console.error('[S3Client] Error getting storage stats:', error);
        return {
            fileCount: 0,
            totalSizeBytes: 0,
            totalSizeMB: 0,
            averageFileSizeKB: 0,
            entityBreakdown: null
        };
    }
};

module.exports = {
    S3_BUCKET,
    s3Client,
    calculateContentHash,
    generateS3Key,
    generateManualS3Key,
    storeHtmlInS3,
    getHtmlFromS3,
    checkS3ObjectExists,
    listHtmlFilesForTournament,
    getStorageStats
};
