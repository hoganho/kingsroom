/**
 * ===================================================================
 * POPULATE S3Storage FROM S3 BUCKET
 * ===================================================================
 * 
 * Scans the prod S3 bucket and creates S3Storage records for each HTML file.
 * 
 * NOTE: ScrapeURL records are NOT needed upfront - the scraper will 
 * auto-create them on first fetch and auto-link to S3Storage records.
 * 
 * USAGE:
 *   node populate-scraper-tables.cjs [--dry-run]
 * 
 * ===================================================================
 */

const { S3Client, paginateListObjectsV2 } = require('@aws-sdk/client-s3');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, BatchWriteCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { v4: uuidv4 } = require('uuid');
const readline = require('readline');

// ================================================================
// CONFIGURATION - UPDATE FOR YOUR ENVIRONMENT
// ================================================================

const CONFIG = {
    // AWS Region
    REGION: process.env.AWS_REGION || 'ap-southeast-2',
    
    // S3 Configuration - PROD
    S3_BUCKET: 'kingsroom-storage-prod',
    S3_PREFIX: 'entities/',
    
    // DynamoDB Tables - PROD
    ENV_SUFFIX: '-ynuahifnznb5zddz727oiqnicy-prod',
    
    // Entity URL mappings (entityId -> base URL)
    ENTITY_DOMAINS: {
        '42101695-1332-48e3-963b-3c6ad4e909a0': 'https://kingsroom.com.au/tournament/?id=',
        'f6785dbb-ab2e-4e83-8ad8-3034e7f1947b': 'https://kingslive.com.au/76-2/?id=',
        '2e782b28-06b9-42e6-a66e-bfc17d68704f': 'https://kingspoker.au/tournament/?id=',
    },
    
    // Batch size for DynamoDB writes
    BATCH_SIZE: 25,
};

// Derived table names
const TABLES = {
    S3_STORAGE: `S3Storage${CONFIG.ENV_SUFFIX}`,
    // Note: ScrapeURL records are auto-created by the scraper on first fetch
    // They will link to S3Storage records automatically
};

// ================================================================
// SETUP CLIENTS
// ================================================================

const ddbClient = new DynamoDBClient({ region: CONFIG.REGION });
const ddbDocClient = DynamoDBDocumentClient.from(ddbClient, {
    marshallOptions: { removeUndefinedValues: true },
});
const s3Client = new S3Client({ region: CONFIG.REGION });

// ================================================================
// UTILITY FUNCTIONS
// ================================================================

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function parseS3Key(s3Key) {
    // Pattern: entities/{entityId}/html/{tournamentId}/{filename}.html
    const regex = new RegExp(`^${CONFIG.S3_PREFIX}([^/]+)/html/(\\d+)/(.+\\.html)$`);
    const match = s3Key.match(regex);
    
    if (!match) return null;
    
    const entityId = match[1];
    const tournamentId = parseInt(match[2], 10);
    const filename = match[3];
    
    if (isNaN(tournamentId)) return null;
    
    return { entityId, tournamentId, filename };
}

function buildUrl(entityId, tournamentId) {
    const urlBase = CONFIG.ENTITY_DOMAINS[entityId];
    if (!urlBase) {
        console.warn(`  ⚠️  No URL mapping for entityId: ${entityId}`);
        return null;
    }
    return `${urlBase}${tournamentId}`;
}

async function confirm(message) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    return new Promise(resolve => {
        rl.question(`${message} (y/N): `, answer => {
            rl.close();
            resolve(answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes');
        });
    });
}

async function batchWriteWithRetry(tableName, items, dryRun = false) {
    let written = 0;
    let failed = 0;
    
    for (let i = 0; i < items.length; i += CONFIG.BATCH_SIZE) {
        const batch = items.slice(i, i + CONFIG.BATCH_SIZE);
        
        if (dryRun) {
            written += batch.length;
            continue;
        }
        
        const putRequests = batch.map(item => ({
            PutRequest: { Item: item }
        }));
        
        try {
            let unprocessedItems = { [tableName]: putRequests };
            let retries = 0;
            
            while (Object.keys(unprocessedItems).length > 0 && retries < 5) {
                const result = await ddbDocClient.send(
                    new BatchWriteCommand({ RequestItems: unprocessedItems })
                );
                
                const remaining = result.UnprocessedItems?.[tableName]?.length || 0;
                unprocessedItems = result.UnprocessedItems || {};
                
                if (Object.keys(unprocessedItems).length > 0) {
                    retries++;
                    await sleep(1000 * retries);
                }
            }
            
            if (Object.keys(unprocessedItems).length > 0) {
                failed += unprocessedItems[tableName]?.length || 0;
                written += batch.length - (unprocessedItems[tableName]?.length || 0);
            } else {
                written += batch.length;
            }
            
        } catch (error) {
            console.error(`    ❌ Batch write error: ${error.message}`);
            failed += batch.length;
        }
        
        if (written % 500 === 0 && written > 0) {
            process.stdout.write(`\r    Written ${written} records...`);
        }
    }
    
    return { written, failed };
}

// ================================================================
// MAIN LOGIC
// ================================================================

async function scanS3AndPopulate(dryRun = false) {
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  POPULATE S3Storage FROM S3 BUCKET');
    console.log('═══════════════════════════════════════════════════════════════');
    
    if (dryRun) {
        console.log('\n  🔍 DRY RUN MODE - No changes will be made\n');
    }
    
    console.log(`  S3 Bucket: ${CONFIG.S3_BUCKET}`);
    console.log(`  S3 Prefix: ${CONFIG.S3_PREFIX}`);
    console.log(`  S3Storage Table: ${TABLES.S3_STORAGE}`);
    console.log('');
    console.log('  Note: ScrapeURL records will be auto-created by the scraper');
    console.log('        when it first fetches each URL.\n');
    
    const s3Records = [];
    
    // ────────────────────────────────────────────────────────────────
    // PHASE 1: Scan S3 Bucket
    // ────────────────────────────────────────────────────────────────
    console.log('📦 Phase 1: Scanning S3 bucket...');
    
    const paginator = paginateListObjectsV2(
        { client: s3Client },
        { Bucket: CONFIG.S3_BUCKET, Prefix: CONFIG.S3_PREFIX }
    );
    
    let scannedCount = 0;
    let skippedCount = 0;
    
    for await (const page of paginator) {
        for (const obj of page.Contents || []) {
            scannedCount++;
            
            const parsed = parseS3Key(obj.Key);
            if (!parsed) {
                skippedCount++;
                continue;
            }
            
            const { entityId, tournamentId, filename } = parsed;
            const url = buildUrl(entityId, tournamentId);
            
            if (!url) {
                skippedCount++;
                continue;
            }
            
            // Create S3Storage record with entityTournamentKey for GSI
            const entityTournamentKey = `${entityId}#${tournamentId}`;
            
            const s3Record = {
                id: uuidv4(),
                s3Key: obj.Key,
                s3Bucket: CONFIG.S3_BUCKET,
                url: url,
                entityId,
                tournamentId,
                entityTournamentKey,  // Required for byEntityTournament GSI
                filename,
                contentType: 'text/html',
                contentSize: obj.Size,
                lastModified: obj.LastModified.toISOString(),
                scrapedAt: obj.LastModified.toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                __typename: 'S3Storage',
                _version: 1,
                _lastChangedAt: Date.now(),
            };
            
            s3Records.push(s3Record);
            
            if (scannedCount % 1000 === 0) {
                process.stdout.write(`\r    Scanned ${scannedCount} objects...`);
            }
        }
    }
    
    console.log(`\r    Scanned ${scannedCount} total objects                    `);
    console.log(`    Valid HTML files: ${s3Records.length}`);
    console.log(`    Skipped: ${skippedCount}`);
    
    if (s3Records.length === 0) {
        console.log('\n  ⚠️  No valid HTML files found in S3 bucket');
        return;
    }
    
    // ────────────────────────────────────────────────────────────────
    // PHASE 2: Write S3Storage records
    // ────────────────────────────────────────────────────────────────
    console.log('\n📋 Phase 2: Writing S3Storage records...');
    
    if (dryRun) {
        console.log(`    [DRY RUN] Would write ${s3Records.length} S3Storage records`);
    } else {
        const s3Result = await batchWriteWithRetry(TABLES.S3_STORAGE, s3Records, dryRun);
        console.log(`\r    Written ${s3Result.written} S3Storage records, ${s3Result.failed} failed    `);
    }
    
    // ────────────────────────────────────────────────────────────────
    // SUMMARY
    // ────────────────────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`  S3 Objects Scanned: ${scannedCount}`);
    console.log(`  S3Storage Records Created: ${s3Records.length}`);
    
    if (dryRun) {
        console.log('\n  🔍 This was a DRY RUN - no changes were made');
        console.log('  Run without --dry-run to apply changes');
    } else {
        console.log('\n  ✅ S3Storage population complete!');
        console.log('  The scraper will auto-create ScrapeURL records on first fetch.');
    }
}

// ================================================================
// MAIN
// ================================================================

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    
    console.log('\n╔═══════════════════════════════════════════════════════════════╗');
    console.log('║     POPULATE S3Storage FROM S3 - PRODUCTION                  ║');
    console.log('╚═══════════════════════════════════════════════════════════════╝');
    
    if (!dryRun) {
        console.log('\n  ⚠️  This will write to PRODUCTION DynamoDB tables!');
        const confirmed = await confirm('\n  Are you sure you want to proceed?');
        if (!confirmed) {
            console.log('\n  Cancelled.');
            process.exit(0);
        }
    }
    
    try {
        await scanS3AndPopulate(dryRun);
    } catch (error) {
        console.error('\n  ❌ Fatal error:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

main();
