/**
 * Diagnostic Test Module for socialFetcher
 * 
 * Add this to your Lambda to test S3 and network connectivity.
 * 
 * To use:
 * 1. Copy this file to your Lambda's src/ directory
 * 2. In index.js, add: const { runDiagnostics } = require('./diagnostics');
 * 3. Add a condition to call it:
 *    if (event.runDiagnostics) {
 *      return runDiagnostics();
 *    }
 * 4. Deploy and invoke with: { "runDiagnostics": true }
 * 5. Check CloudWatch logs for results
 * 6. Remove after debugging!
 */

const https = require('https');
const { S3Client, PutObjectCommand, HeadObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

// Environment variables
const REGION = process.env.REGION || 'ap-southeast-2';
const S3_BUCKET = process.env.SOCIAL_MEDIA_BUCKET;

// Test Facebook image URL (a small public image)
const TEST_FB_IMAGE_URL = 'https://scontent.fsyd4-1.fna.fbcdn.net/v/t39.30808-1/271246144_114371327700219_7519271680821498498_n.jpg?stp=c0.0.200.200a_dst-jpg_p200x200&_nc_cat=110&ccb=1-7&_nc_sid=f4b9fd&_nc_ohc=gxbSMDvdM-8Q7kNvgGO-Xdl&_nc_zt=24&_nc_ht=scontent.fsyd4-1.fna&_nc_gid=ALdKWvWzzW4wI1Rrng4v3Fg&oh=00_AYC0fBsAG5dHwCbsjH9aRQKWCbKIHGlmQxOqg7I5hYqyKA&oe=679E5B3C';

// Alternative test URL (Google's favicon - reliable)
const TEST_FALLBACK_URL = 'https://www.google.com/favicon.ico';

/**
 * Make an HTTPS GET request and return the response body as a buffer
 */
function httpGetBinary(url, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Request timeout after ${timeout}ms`));
    }, timeout);

    const makeRequest = (requestUrl, redirectCount = 0) => {
      if (redirectCount > 5) {
        clearTimeout(timeoutId);
        reject(new Error('Too many redirects'));
        return;
      }

      console.log(`[DIAG] Fetching: ${requestUrl.substring(0, 80)}...`);
      
      https.get(requestUrl, (res) => {
        console.log(`[DIAG] Response status: ${res.statusCode}`);
        console.log(`[DIAG] Response headers:`, JSON.stringify(res.headers, null, 2));

        // Handle redirects
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          console.log(`[DIAG] Following redirect to: ${res.headers.location}`);
          makeRequest(res.headers.location, redirectCount + 1);
          return;
        }

        if (res.statusCode !== 200) {
          clearTimeout(timeoutId);
          reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
          return;
        }

        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          clearTimeout(timeoutId);
          const buffer = Buffer.concat(chunks);
          console.log(`[DIAG] Downloaded ${buffer.length} bytes`);
          resolve({
            buffer,
            contentType: res.headers['content-type'] || 'image/jpeg',
          });
        });
        res.on('error', (err) => {
          clearTimeout(timeoutId);
          reject(err);
        });
      }).on('error', (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
    };

    makeRequest(url);
  });
}

/**
 * Test 1: Basic DNS resolution
 */
async function testDnsResolution() {
  const dns = require('dns').promises;
  const results = {
    test: 'DNS Resolution',
    passed: true,
    details: {},
  };

  const domains = [
    's3.ap-southeast-2.amazonaws.com',
    'scontent.fsyd4-1.fna.fbcdn.net',
    'graph.facebook.com',
  ];

  for (const domain of domains) {
    try {
      const addresses = await dns.lookup(domain);
      results.details[domain] = { success: true, address: addresses.address };
      console.log(`[DIAG] DNS ${domain} -> ${addresses.address}`);
    } catch (err) {
      results.details[domain] = { success: false, error: err.message };
      results.passed = false;
      console.error(`[DIAG] DNS ${domain} FAILED: ${err.message}`);
    }
  }

  return results;
}

/**
 * Test 2: HTTPS connectivity to Facebook CDN
 */
async function testFacebookCdnConnectivity() {
  const results = {
    test: 'Facebook CDN Connectivity',
    passed: false,
    details: {},
  };

  // Try Facebook CDN first
  try {
    console.log('[DIAG] Testing Facebook CDN download...');
    const imageData = await httpGetBinary(TEST_FB_IMAGE_URL);
    results.details.facebookCdn = {
      success: true,
      bytesDownloaded: imageData.buffer.length,
      contentType: imageData.contentType,
    };
    results.passed = true;
    results.downloadedBuffer = imageData.buffer;
    results.contentType = imageData.contentType;
    console.log(`[DIAG] Facebook CDN: SUCCESS (${imageData.buffer.length} bytes)`);
  } catch (err) {
    console.error(`[DIAG] Facebook CDN FAILED: ${err.message}`);
    results.details.facebookCdn = { success: false, error: err.message };
    
    // Try fallback URL
    try {
      console.log('[DIAG] Trying fallback URL (Google favicon)...');
      const imageData = await httpGetBinary(TEST_FALLBACK_URL);
      results.details.fallback = {
        success: true,
        bytesDownloaded: imageData.buffer.length,
        contentType: imageData.contentType,
      };
      results.passed = true;
      results.downloadedBuffer = imageData.buffer;
      results.contentType = imageData.contentType;
      console.log(`[DIAG] Fallback URL: SUCCESS (${imageData.buffer.length} bytes)`);
    } catch (fallbackErr) {
      console.error(`[DIAG] Fallback URL FAILED: ${fallbackErr.message}`);
      results.details.fallback = { success: false, error: fallbackErr.message };
    }
  }

  return results;
}

/**
 * Test 3: S3 HeadObject (check if we can read)
 */
async function testS3HeadObject() {
  const results = {
    test: 'S3 HeadObject',
    passed: false,
    details: {
      bucket: S3_BUCKET,
      region: REGION,
    },
  };

  if (!S3_BUCKET) {
    results.details.error = 'SOCIAL_MEDIA_BUCKET environment variable not set';
    return results;
  }

  const s3Client = new S3Client({ region: REGION });
  const testKey = 'social-media/diagnostic-test.txt';

  try {
    // Try to head a non-existent object (should get 404, not permission denied)
    await s3Client.send(new HeadObjectCommand({
      Bucket: S3_BUCKET,
      Key: testKey,
    }));
    results.passed = true;
    results.details.message = 'Object exists (unexpected)';
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      // This is expected - object doesn't exist but we CAN access S3
      results.passed = true;
      results.details.message = 'S3 access confirmed (object not found as expected)';
      console.log('[DIAG] S3 HeadObject: SUCCESS (404 = access OK)');
    } else {
      results.details.error = {
        name: err.name,
        code: err.Code || err.code,
        message: err.message,
        statusCode: err.$metadata?.httpStatusCode,
      };
      console.error('[DIAG] S3 HeadObject FAILED:', results.details.error);
    }
  }

  return results;
}

/**
 * Test 4: S3 PutObject (the actual upload)
 */
async function testS3PutObject(buffer, contentType) {
  const results = {
    test: 'S3 PutObject',
    passed: false,
    details: {
      bucket: S3_BUCKET,
      region: REGION,
    },
  };

  if (!S3_BUCKET) {
    results.details.error = 'SOCIAL_MEDIA_BUCKET environment variable not set';
    return results;
  }

  if (!buffer) {
    results.details.error = 'No buffer provided (download test must have failed)';
    return results;
  }

  const s3Client = new S3Client({ region: REGION });
  const testKey = `social-media/diagnostic-test-${Date.now()}.jpg`;

  try {
    console.log(`[DIAG] Uploading ${buffer.length} bytes to s3://${S3_BUCKET}/${testKey}`);
    
    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: testKey,
      Body: buffer,
      ContentType: contentType || 'image/jpeg',
    }));

    results.passed = true;
    results.details.key = testKey;
    results.details.url = `https://${S3_BUCKET}.s3.${REGION}.amazonaws.com/${testKey}`;
    results.details.bytesUploaded = buffer.length;
    console.log(`[DIAG] S3 PutObject: SUCCESS - ${results.details.url}`);

    // Clean up - delete the test file
    try {
      await s3Client.send(new DeleteObjectCommand({
        Bucket: S3_BUCKET,
        Key: testKey,
      }));
      results.details.cleanedUp = true;
      console.log('[DIAG] Test file cleaned up');
    } catch (deleteErr) {
      results.details.cleanedUp = false;
      results.details.cleanupError = deleteErr.message;
    }

  } catch (err) {
    results.details.error = {
      name: err.name,
      code: err.Code || err.code,
      message: err.message,
      statusCode: err.$metadata?.httpStatusCode,
      requestId: err.$metadata?.requestId,
    };
    console.error('[DIAG] S3 PutObject FAILED:', JSON.stringify(results.details.error, null, 2));
  }

  return results;
}

/**
 * Test 5: Full end-to-end (download from FB, upload to S3)
 */
async function testEndToEnd() {
  const results = {
    test: 'End-to-End (FB -> S3)',
    passed: false,
    details: {},
  };

  try {
    // Step 1: Download
    console.log('[DIAG] E2E Step 1: Downloading from Facebook...');
    const imageData = await httpGetBinary(TEST_FB_IMAGE_URL);
    results.details.download = {
      success: true,
      bytes: imageData.buffer.length,
    };

    // Step 2: Upload
    console.log('[DIAG] E2E Step 2: Uploading to S3...');
    const s3Client = new S3Client({ region: REGION });
    const testKey = `social-media/post-attachments/diagnostic/e2e-test-${Date.now()}.jpg`;

    await s3Client.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: testKey,
      Body: imageData.buffer,
      ContentType: imageData.contentType,
    }));

    results.details.upload = {
      success: true,
      key: testKey,
      url: `https://${S3_BUCKET}.s3.${REGION}.amazonaws.com/${testKey}`,
    };

    results.passed = true;
    console.log('[DIAG] E2E: SUCCESS!');

    // Clean up
    await s3Client.send(new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: testKey,
    }));

  } catch (err) {
    results.details.error = {
      name: err.name,
      code: err.Code || err.code,
      message: err.message,
      step: results.details.download?.success ? 'upload' : 'download',
    };
    console.error('[DIAG] E2E FAILED:', results.details.error);
  }

  return results;
}

/**
 * Run all diagnostics
 */
async function runDiagnostics() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║            SOCIAL FETCHER DIAGNOSTICS                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Environment:');
  console.log(`  REGION: ${REGION}`);
  console.log(`  SOCIAL_MEDIA_BUCKET: ${S3_BUCKET || '(NOT SET!)'}`);
  console.log(`  NODE_VERSION: ${process.version}`);
  console.log('');

  const allResults = {
    timestamp: new Date().toISOString(),
    environment: {
      region: REGION,
      bucket: S3_BUCKET,
      nodeVersion: process.version,
    },
    tests: [],
  };

  // Test 1: DNS
  console.log('\n─── Test 1: DNS Resolution ───');
  const dnsResult = await testDnsResolution();
  allResults.tests.push(dnsResult);

  // Test 2: Facebook CDN
  console.log('\n─── Test 2: Facebook CDN Connectivity ───');
  const fbResult = await testFacebookCdnConnectivity();
  allResults.tests.push(fbResult);

  // Test 3: S3 HeadObject
  console.log('\n─── Test 3: S3 HeadObject ───');
  const headResult = await testS3HeadObject();
  allResults.tests.push(headResult);

  // Test 4: S3 PutObject
  console.log('\n─── Test 4: S3 PutObject ───');
  const putResult = await testS3PutObject(fbResult.downloadedBuffer, fbResult.contentType);
  allResults.tests.push(putResult);

  // Test 5: End-to-End
  console.log('\n─── Test 5: End-to-End ───');
  const e2eResult = await testEndToEnd();
  allResults.tests.push(e2eResult);

  // Summary
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    DIAGNOSTIC SUMMARY                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  
  let allPassed = true;
  for (const test of allResults.tests) {
    const status = test.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status}: ${test.test}`);
    if (!test.passed) {
      allPassed = false;
      if (test.details?.error) {
        console.log(`         Error: ${JSON.stringify(test.details.error)}`);
      }
    }
  }

  console.log('');
  if (allPassed) {
    console.log('🎉 All tests passed! The issue may be intermittent or in the application code.');
  } else {
    console.log('⚠️  Some tests failed. Review the details above to identify the issue.');
  }

  return allResults;
}

module.exports = {
  runDiagnostics,
};
