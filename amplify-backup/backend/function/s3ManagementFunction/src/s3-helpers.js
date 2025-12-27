// s3-helpers.js
// S3 Helper Functions for HTML Storage and Retrieval
// Place this in your Lambda function's directory

const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, HeadObjectCommand } = require('@aws-sdk/client-s3');
const crypto = require('crypto');

// Initialize S3 client
const s3Client = new S3Client({});

// Configuration
const S3_BUCKET = process.env.SCRAPER_S3_BUCKET || 'pokerpro-scraper-storage';
const S3_REGION = process.env.REGION || 'ap-southeast-2';

/**
 * Generate S3 key for storing HTML
 * Format: entities/{entity-id}/html/{tournament-id}/{timestamp}_tid{tournamentId}_{hash}.html
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
 * Calculate content hash
 */
const calculateContentHash = (content) => {
    return crypto.createHash('sha256').update(content).digest('hex');
};

/**
 * Store HTML content in S3
 * @param {string} html - HTML content to store
 * @param {string} url - Source URL
 * @param {string} entityId - Entity ID
 * @param {number} tournamentId - Tournament ID
 * @param {object} headers - Response headers from the source
 * @param {boolean} isManual - Whether this is a manual upload
 * @returns {object} Storage result with S3 key and metadata
 */
const storeHtmlInS3 = async (html, url, entityId, tournamentId, headers = {}, isManual = false) => {
    try {
        const timestamp = new Date().toISOString();
        const contentHash = calculateContentHash(html);
        const s3Key = isManual 
            ? generateManualS3Key(entityId, tournamentId, timestamp, 'upload')
            : generateS3Key(entityId, tournamentId, timestamp, contentHash);
        
        // Prepare metadata
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
        
        // Remove empty metadata values (S3 doesn't like them)
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
        
        console.log(`[S3] Successfully stored HTML at: ${s3Key}`);
        
        return {
            s3Key,
            s3Bucket: S3_BUCKET,
            contentHash,
            contentSize: Buffer.byteLength(html, 'utf8'),
            timestamp,
            metadata
        };
    } catch (error) {
        console.error('[S3] Error storing HTML:', error);
        throw new Error(`Failed to store HTML in S3: ${error.message}`);
    }
};

/**
 * Retrieve HTML from S3
 * @param {string} s3Key - S3 key of the HTML file
 * @returns {object} HTML content and metadata
 */
const getHtmlFromS3 = async (s3Key) => {
    try {
        const getCommand = new GetObjectCommand({
            Bucket: S3_BUCKET,
            Key: s3Key
        });
        
        const response = await s3Client.send(getCommand);
        
        // Convert stream to string
        const streamToString = async (stream) => {
            const chunks = [];
            for await (const chunk of stream) {
                chunks.push(chunk);
            }
            return Buffer.concat(chunks).toString('utf-8');
        };
        
        const html = await streamToString(response.Body);
        
        console.log(`[S3] Successfully retrieved HTML from: ${s3Key}`);
        
        return {
            html,
            metadata: response.Metadata || {},
            lastModified: response.LastModified,
            contentLength: response.ContentLength,
            etag: response.ETag
        };
    } catch (error) {
        console.error(`[S3] Error retrieving HTML from ${s3Key}:`, error);
        
        if (error.name === 'NoSuchKey') {
            return null;
        }
        
        throw new Error(`Failed to retrieve HTML from S3: ${error.message}`);
    }
};

/**
 * Check if an S3 object exists
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
        
        console.log(`[S3] Found ${files.length} HTML files for entity ${entityId}, tournament ${tournamentId}`);
        
        return files;
    } catch (error) {
        console.error('[S3] Error listing HTML files:', error);
        throw new Error(`Failed to list HTML files: ${error.message}`);
    }
};

/**
 * Get S3 storage statistics
 * @param {string} entityId - Entity ID (optional, if not provided gets stats for all entities)
 * @returns {object} Storage statistics
 */
const getStorageStats = async (entityId = null) => {
    try {
        const prefix = entityId ? `entities/${entityId}/` : 'entities/';
        let totalSize = 0;
        let fileCount = 0;
        let entityStats = {};
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
        console.error('[S3] Error getting storage stats:', error);
        return {
            fileCount: 0,
            totalSizeBytes: 0,
            totalSizeMB: 0,
            averageFileSizeKB: 0,
            entityBreakdown: null
        };
    }
};

/**
 * Delete old HTML files (for cleanup - use with caution)
 * @param {string} entityId - Entity ID
 * @param {number} tournamentId - Tournament ID
 * @param {number} keepCount - Number of recent files to keep
 */
const cleanupOldHtmlFiles = async (entityId, tournamentId, keepCount = 10) => {
    try {
        const files = await listHtmlFilesForTournament(entityId, tournamentId, 1000);
        
        if (files.length <= keepCount) {
            console.log(`[S3] No cleanup needed. Only ${files.length} files exist.`);
            return { deleted: 0, kept: files.length };
        }
        
        // Files are already sorted by date (newest first)
        const filesToDelete = files.slice(keepCount);
        
        console.log(`[S3] Cleaning up ${filesToDelete.length} old HTML files`);
        
        // Note: For production, you might want to use DeleteObjects for batch deletion
        // For safety, we'll just log what would be deleted
        
        return {
            deleted: filesToDelete.length,
            kept: keepCount,
            wouldDelete: filesToDelete.map(f => f.key)
        };
    } catch (error) {
        console.error('[S3] Error during cleanup:', error);
        throw new Error(`Failed to cleanup old files: ${error.message}`);
    }
};

module.exports = {
    S3_BUCKET,
    generateS3Key,
    generateManualS3Key,
    calculateContentHash,
    storeHtmlInS3,
    getHtmlFromS3,
    checkS3ObjectExists,
    listHtmlFilesForTournament,
    getStorageStats,
    cleanupOldHtmlFiles
};
