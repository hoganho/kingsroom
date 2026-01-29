/**
 * Facebook API Service
 * 
 * Handles all interactions with the Facebook Graph API.
 */

const https = require('https');
const { config, scrapeConfig } = require('../config');

const FB_ACCESS_TOKEN = config.facebook.accessToken;
const FB_API_VERSION = config.facebook.apiVersion;

/**
 * Make an HTTPS GET request
 */
function httpGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

/**
 * Fetch binary data (for images) with proper error handling
 * 
 * Improvements over basic https.get:
 * - Checks HTTP status codes and rejects on non-2xx
 * - Adds User-Agent header (required by some CDNs)
 * - Handles redirects
 * - Detailed error logging
 */
function httpGetBinary(url, retries = 2) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET',
      headers: {
        // Add User-Agent to avoid being blocked by CDNs
        'User-Agent': 'Mozilla/5.0 (compatible; KingsroomBot/1.0; +https://kingsroom.com.au)',
        'Accept': 'image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    };

    const makeRequest = (attemptsLeft) => {
      const req = https.request(options, (res) => {
        // Handle redirects (3xx)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          console.log(`[FB] Following redirect: ${res.statusCode} -> ${res.headers.location}`);
          return httpGetBinary(res.headers.location, attemptsLeft).then(resolve).catch(reject);
        }
        
        // Check for non-2xx status codes
        if (res.statusCode < 200 || res.statusCode >= 300) {
          const error = new Error(`HTTP ${res.statusCode}: ${res.statusMessage || 'Request failed'}`);
          error.statusCode = res.statusCode;
          error.url = url.substring(0, 100);
          
          console.error(`[FB] Image download failed:`, {
            statusCode: res.statusCode,
            statusMessage: res.statusMessage,
            url: url.substring(0, 100),
            attemptsLeft,
          });
          
          // Retry on 5xx errors or 429 (rate limit)
          if (attemptsLeft > 0 && (res.statusCode >= 500 || res.statusCode === 429)) {
            const delay = res.statusCode === 429 ? 2000 : 500;
            console.log(`[FB] Retrying in ${delay}ms... (${attemptsLeft} attempts left)`);
            setTimeout(() => makeRequest(attemptsLeft - 1), delay);
            return;
          }
          
          reject(error);
          return;
        }
        
        // Success - collect binary data
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          if (buffer.length === 0) {
            reject(new Error('Empty response body'));
            return;
          }
          resolve(buffer);
        });
        res.on('error', reject);
      });
      
      req.on('error', (err) => {
        console.error(`[FB] Request error:`, err.message);
        if (attemptsLeft > 0) {
          console.log(`[FB] Retrying... (${attemptsLeft} attempts left)`);
          setTimeout(() => makeRequest(attemptsLeft - 1), 500);
          return;
        }
        reject(err);
      });
      
      // Set timeout
      req.setTimeout(15000, () => {
        req.destroy();
        const error = new Error('Request timeout (15s)');
        if (attemptsLeft > 0) {
          console.log(`[FB] Timeout, retrying... (${attemptsLeft} attempts left)`);
          setTimeout(() => makeRequest(attemptsLeft - 1), 500);
          return;
        }
        reject(error);
      });
      
      req.end();
    };
    
    makeRequest(retries);
  });
}

/**
 * Extract page ID from various Facebook URL formats
 */
function extractPageIdFromUrl(url) {
  if (!url) return null;

  try {
    const urlObj = new URL(url);
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    // Handle /pages/PageName/PageID format
    if (pathParts[0] === 'pages' && pathParts.length >= 3) {
      return pathParts[2];
    }

    // Handle /profile.php?id=xxx format
    if (pathParts[0] === 'profile.php') {
      const params = new URLSearchParams(urlObj.search);
      return params.get('id');
    }

    // Handle /PageName format
    return pathParts[0];
  } catch {
    return url;
  }
}

/**
 * Fetch page information (name, picture, follower count, etc.)
 */
async function fetchPageInfo(pageId) {
  if (!FB_ACCESS_TOKEN) {
    throw new Error('Facebook access token not configured');
  }

  const fields = 'id,name,about,description,category,fan_count,followers_count,picture.type(large),cover,website,location';
  const url = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}?fields=${fields}&access_token=${FB_ACCESS_TOKEN}`;

  console.log(`[FB] Fetching page info for: ${pageId}`);

  const response = await httpGet(url);
  const data = JSON.parse(response);

  if (data.error) {
    console.error('[FB] API Error:', data.error);
    throw new Error(data.error.message || 'Facebook API error');
  }

  console.log(`[FB] Page info: ${data.name} (${data.followers_count || data.fan_count || 0} followers)`);
  return data;
}

/**
 * Fetch posts from a Facebook page
 * 
 * @param {string} pageId - Facebook page ID
 * @param {Object} options - Fetch options
 * @param {string} options.since - Unix timestamp - only fetch posts after this time
 * @param {string} options.until - Unix timestamp - only fetch posts before this time
 * @param {number} options.limit - Number of posts per page (max 100)
 * @param {string} options.nextPageUrl - URL for pagination
 * @returns {Object} { posts, nextPageUrl, hasMore }
 */
async function fetchPosts(pageId, options = {}) {
  if (!FB_ACCESS_TOKEN) {
    throw new Error('Facebook access token not configured');
  }

  let url;
  
  if (options.nextPageUrl) {
    // Use pagination URL directly
    url = options.nextPageUrl;
  } else {
    // Build initial request URL
    const fields = [
      'id',
      'message',
      'created_time',
      'permalink_url',
      'full_picture',
      'attachments{media_type,type,url,media,subattachments}',
      'reactions.summary(true)',
      'comments.summary(true)',
      'shares',
    ].join(',');

    const limit = options.limit || scrapeConfig.maxPostsPerPage;
    url = `https://graph.facebook.com/${FB_API_VERSION}/${pageId}/posts?fields=${fields}&limit=${limit}&access_token=${FB_ACCESS_TOKEN}`;

    // Add time filters if provided
    if (options.since) {
      url += `&since=${options.since}`;
    }
    if (options.until) {
      url += `&until=${options.until}`;
    }
  }

  console.log(`[FB] Fetching posts...`);

  const response = await httpGet(url);
  const data = JSON.parse(response);

  if (data.error) {
    // Check for rate limiting
    if (data.error.code === 4 || data.error.code === 17 || data.error.code === 613) {
      console.warn('[FB] Rate limit reached:', data.error.message);
      return { posts: [], nextPageUrl: null, hasMore: false, rateLimited: true };
    }
    
    console.error('[FB] API Error:', data.error);
    throw new Error(data.error.message || 'Facebook API error');
  }

  const posts = data.data || [];
  const nextPageUrl = data.paging?.next || null;
  const hasMore = !!nextPageUrl;

  console.log(`[FB] Fetched ${posts.length} posts, hasMore: ${hasMore}`);

  return { posts, nextPageUrl, hasMore, rateLimited: false };
}

/**
 * Download an image from a URL
 */
async function downloadImage(imageUrl) {
  if (!imageUrl) return null;
  
  try {
    // Log truncated URL for debugging
    const urlPreview = imageUrl.length > 80 
      ? imageUrl.substring(0, 80) + '...' 
      : imageUrl;
    console.log(`[FB] Downloading image: ${urlPreview}`);
    
    const buffer = await httpGetBinary(imageUrl);
    
    // Validate we got actual image data
    if (!buffer || buffer.length < 100) {
      console.warn(`[FB] Downloaded buffer too small (${buffer?.length || 0} bytes), likely not a valid image`);
      return null;
    }
    
    // Detect content type from URL or default to jpeg
    let contentType = 'image/jpeg';
    if (imageUrl.includes('.png')) contentType = 'image/png';
    else if (imageUrl.includes('.gif')) contentType = 'image/gif';
    else if (imageUrl.includes('.webp')) contentType = 'image/webp';
    
    console.log(`[FB] Downloaded ${buffer.length} bytes (${contentType})`);
    return { buffer, contentType };
  } catch (error) {
    console.error('[FB] Error downloading image:', {
      message: error.message,
      statusCode: error.statusCode,
      url: imageUrl?.substring(0, 80),
    });
    return null;
  }
}

/**
 * Build raw content object for storage
 * This is the authoritative source - processor uses this for classification
 */
function buildRawContent(fbPost) {
  return JSON.stringify({
    fb_id: fbPost.id,
    fb_message: fbPost.message,
    fb_created_time: fbPost.created_time,
    fb_permalink_url: fbPost.permalink_url,
    fb_full_picture: fbPost.full_picture,
    fb_reactions: fbPost.reactions?.summary,
    fb_comments: fbPost.comments?.summary,
    fb_shares: fbPost.shares,
    fb_attachments: fbPost.attachments,
    _source: 'socialFetcher',
    _fetchedAt: new Date().toISOString(),
  });
}

/**
 * Extract hashtags from content
 */
function extractHashtags(content) {
  if (!content) return [];
  const matches = content.match(/#(\w+)/g);
  if (!matches) return [];
  return matches.map(tag => tag.substring(1).toLowerCase());
}

module.exports = {
  httpGet,
  httpGetBinary,
  extractPageIdFromUrl,
  fetchPageInfo,
  fetchPosts,
  downloadImage,
  buildRawContent,
  extractHashtags,
};