# webScraperFunction - Refactored Structure

## ✅ COMPLETE - All Phases Finished

Total: **22 JavaScript files** organized into clean modules.

## Architecture Overview

```
webScraperFunction/
├── index.js                      ✅ Entry point, routing (~200 lines)
├── config/
│   ├── tables.js                 ✅ Table name resolution (~100 lines)
│   └── constants.js              ✅ All configuration constants (~220 lines)
├── core/
│   ├── entity-resolver.js        ✅ Entity ID resolution (~130 lines)
│   ├── scrape-url-manager.js     ✅ ScrapeURL CRUD (~280 lines)
│   └── scrape-attempt-tracker.js ✅ ScrapeAttempt creation (~180 lines)
├── fetch/
│   ├── index.js                  ✅ Fetch orchestrator (~300 lines)
│   ├── http-client.js            ✅ HTTP + ScraperAPI (~220 lines)
│   ├── cache-manager.js          ✅ S3 cache + HTTP 304 (~280 lines)
│   └── validators.js             ✅ URL/HTML validation (~130 lines)
├── parse/
│   ├── index.js                  ✅ Parse orchestrator (~150 lines)
│   ├── html-parser.js            ✅ Cheerio extraction (~750 lines)
│   ├── venue-matcher.js          ✅ Venue matching (~180 lines)
│   ├── series-matcher.js         ✅ Series detection (~220 lines)
│   └── structure-fingerprint.js  ✅ Fingerprint tracking (~180 lines)
├── storage/
│   ├── s3-client.js              ✅ S3 operations (~280 lines)
│   └── s3-storage-manager.js     ✅ S3Storage records (~350 lines)
├── handlers/
│   ├── fetch-handler.js          ✅ fetchTournamentData (~300 lines)
│   ├── save-handler.js           ✅ saveTournamentData (~280 lines)
│   └── range-handler.js          ✅ fetchTournamentDataRange (~100 lines)
└── utils/
    ├── dates.js                  ✅ Date helpers (~170 lines)
    └── monitoring.js             ✅ Lambda monitoring (~200 lines)
```

## Key Design Decisions

### 1. Save Delegation
All game saves go through `saveGameFunction` Lambda. webScraperFunction NEVER writes to the Game table directly.

**Tables webScraperFunction writes to:**
- ScrapeURL (tracking)
- S3Storage (HTML storage)
- ScrapeAttempt (audit trail)
- ScrapeStructure (fingerprints)

**Tables webScraperFunction DOES NOT write to:**
- Game
- Venue
- Player*
- TournamentSeries

### 2. Clear Operation Contract

| Operation | What It Does | Saves to Game? |
|-----------|--------------|----------------|
| fetchTournamentData | Fetch + Parse | ❌ NO |
| saveTournamentData | Invoke saveGameFunction | ✅ YES (via Lambda) |
| fetchTournamentDataRange | Batch fetch | ❌ NO |
| reScrapeFromCache | Re-parse existing HTML | ❌ NO |

### 3. Module Boundaries

```
                    ┌─────────────────────────────────────────────────────┐
                    │                    index.js                         │
                    │              (routing + error handling)             │
                    └─────────────────────┬───────────────────────────────┘
                                          │
              ┌───────────────────────────┼───────────────────────────┐
              │                           │                           │
              ▼                           ▼                           ▼
    ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐
    │  fetch-handler  │      │  save-handler   │      │  range-handler  │
    │   (fetch+parse) │      │   (passthrough) │      │   (batch fetch) │
    └────────┬────────┘      └────────┬────────┘      └────────┬────────┘
             │                        │                        │
    ┌────────┴────────────────────────┴────────────────────────┘
    │
    ▼
┌───────────────────────────────────────────────────────────────────────┐
│                          SHARED MODULES                               │
├─────────────┬─────────────┬─────────────┬─────────────┬──────────────┤
│   fetch/    │   parse/    │   storage/  │    core/    │   config/    │
│             │             │             │             │              │
│ • index     │ • index     │ • s3-client │ • entity    │ • tables     │
│ • http      │ • html      │ • s3-storage│ • scrapeURL │ • constants  │
│ • cache     │ • venue     │             │ • attempt   │              │
│ • validate  │ • series    │             │             │              │
│             │ • fingerpr. │             │             │              │
└─────────────┴─────────────┴─────────────┴─────────────┴──────────────┘
```

---

## File Size Comparison

### Before (Original)
| File | Lines |
|------|-------|
| ws-index.js | 1,390 |
| enhanced-handleFetch.js | 1,335 |
| scraperStrategies.js | 784 |
| s3-helpers.js | 242 |
| update-s3storage-with-parsed-data.js | 246 |
| **TOTAL** | **~4,000 lines in 5 files** |

### After (Refactored)
| Module | Files | ~Lines |
|--------|-------|--------|
| Entry | 1 | 200 |
| Config | 2 | 320 |
| Core | 3 | 590 |
| Fetch | 4 | 930 |
| Parse | 5 | 1,480 |
| Storage | 2 | 630 |
| Handlers | 3 | 680 |
| Utils | 2 | 370 |
| **TOTAL** | **22 files** | **~5,200 lines** |

The increase is due to:
- Better documentation (JSDoc comments)
- More explicit error handling
- Clearer module boundaries
- No shared code shortcuts
- Complete standalone modules

---

## Usage Example

```javascript
// Fetch only (no save)
const result = await fetchTournamentData({
    url: 'https://example.com/tournament.php?id=123',
    entityId: 'entity-uuid'
});
// result contains parsed data, NOT saved to Game table

// Explicit save (caller decides)
if (shouldSave(result)) {
    await saveTournamentData({
        url: result.sourceUrl,
        data: result,
        venueId: selectedVenueId,
        entityId: 'entity-uuid'
    });
}
```

---

## Module Exports

### index.js (Entry Point)
```javascript
exports.handler = async (event) => { ... }
```

### fetch/index.js
```javascript
module.exports = {
    enhancedHandleFetch,  // Main fetch orchestrator
    simplifiedFetch       // Quick fetch without DB tracking
};
```

### parse/index.js
```javascript
module.exports = {
    parseHtml,            // Main HTML parser
    parseStatusOnly,      // Quick status extraction
    scrapeDataFromHtml,   // Backwards-compatible wrapper
    getAllVenues,         // Venue list from DB
    getAllSeriesTitles,   // Series titles from DB
    matchVenue,           // Venue matching
    matchSeries,          // Series matching
    processStructureFingerprint
};
```

### storage/s3-client.js
```javascript
module.exports = {
    storeHtmlInS3,
    getHtmlFromS3,
    calculateContentHash,
    listHtmlFilesForTournament
};
```

### storage/s3-storage-manager.js
```javascript
module.exports = {
    upsertS3StorageRecord,
    getExistingS3StorageRecord,
    updateS3StorageWithParsedData
};
```

---

## Testing

Each module can be unit tested independently:

```javascript
// Test venue matching
const { matchVenue } = require('./parse/venue-matcher');
const result = matchVenue('Crown Melbourne Main Event', venues, seriesTitles);
expect(result.autoAssignedVenue.name).toBe('Crown Melbourne');

// Test series detection
const { matchSeries, extractSeriesDetails } = require('./parse/series-matcher');
const details = extractSeriesDetails('WSOP Main Event Day 2');
expect(details.isMainEvent).toBe(true);
expect(details.dayNumber).toBe(2);

// Test HTML parsing
const { parseHtml } = require('./parse');
const { data, foundKeys } = parseHtml(html, { url, venues, seriesTitles });
expect(data.gameStatus).toBe('RUNNING');
```

---

## Migration Notes

To use this refactored version:

1. Copy all files to your Lambda function directory
2. Update `package.json` dependencies:
   - cheerio
   - string-similarity
   - uuid
   - @aws-sdk/client-s3
   - @aws-sdk/client-lambda
   - @aws-sdk/client-dynamodb
   - @aws-sdk/lib-dynamodb
   - axios

3. Update environment variables (same as before)

4. Test with a single tournament fetch before full deployment

The API contract (event structure) remains unchanged, so callers don't need modification.
