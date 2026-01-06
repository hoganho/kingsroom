# Production Migration Scripts

Scripts to migrate data from dev environment to production for kingsroom/pokerpro-live.

## Overview

| Script | Purpose |
|--------|---------|
| `run-migration.sh` | Main wrapper - runs preflight checks and migration |
| `migrate-to-prod.cjs` | Node.js script for CSV→DynamoDB and S3 migration |
| `sync-s3-buckets.sh` | Standalone AWS CLI S3 sync (faster for large buckets) |

## Migration Targets

### DynamoDB Tables

| Source (Dev) | Target (Prod) |
|--------------|---------------|
| Entity-ht3nugt6lvddpeeuwj3x6mkite-dev | Entity-ynuahifnznb5zddz727oiqnicy-prod |
| SocialPost-ht3nugt6lvddpeeuwj3x6mkite-dev | SocialPost-ynuahifnznb5zddz727oiqnicy-prod |
| TournamentSeriesTitle-ht3nugt6lvddpeeuwj3x6mkite-dev | TournamentSeriesTitle-ynuahifnznb5zddz727oiqnicy-prod |
| SocialAccount-ht3nugt6lvddpeeuwj3x6mkite-dev | SocialAccount-ynuahifnznb5zddz727oiqnicy-prod |
| TournamentSeries-ht3nugt6lvddpeeuwj3x6mkite-dev | TournamentSeries-ynuahifnznb5zddz727oiqnicy-prod |
| Venue-ht3nugt6lvddpeeuwj3x6mkite-dev | Venue-ynuahifnznb5zddz727oiqnicy-prod |

### S3 Buckets

| Source | Target |
|--------|--------|
| pokerpro-scraper-storage | kingsroom-storage-prod |

## Prerequisites

1. **AWS CLI** configured with credentials that have access to both environments
2. **Node.js** (v18+) with npm
3. **AWS SDK packages**:
   ```bash
   npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb @aws-sdk/client-s3
   ```

## Quick Start

### 1. Setup

```bash
# Make scripts executable
chmod +x run-migration.sh sync-s3-buckets.sh

# Place your CSV files in the same directory
# Files expected:
#   - Entity-ht3nugt6lvddpeeuwj3x6mkite-dev.csv
#   - SocialPost-ht3nugt6lvddpeeuwj3x6mkite-dev.csv
#   - TournamentSeriesTitle-ht3nugt6lvddpeeuwj3x6mkite-dev.csv
#   - SocialAccount-ht3nugt6lvddpeeuwj3x6mkite-dev.csv
#   - TournamentSeries-ht3nugt6lvddpeeuwj3x6mkite-dev.csv
#   - Venue-ht3nugt6lvddpeeuwj3x6mkite-dev.csv
```

### 2. Dry Run (Preview)

```bash
# Preview all migrations (CSV + S3)
./run-migration.sh --dry-run

# Preview CSV only
./run-migration.sh --dry-run --csv-only

# Preview S3 only
./run-migration.sh --dry-run --s3-only

# Preview specific table
./run-migration.sh --dry-run --table=Entity
```

### 3. Execute Migration

```bash
# Full migration (will prompt for confirmation)
./run-migration.sh

# Skip confirmation prompt
./run-migration.sh --skip-confirm

# Migrate only CSV data
./run-migration.sh --csv-only

# Migrate only S3 data
./run-migration.sh --s3-only

# Migrate specific table
./run-migration.sh --table=Venue
```

### 4. Alternative: Fast S3 Sync

For large S3 buckets, use the AWS CLI sync script (faster):

```bash
# Preview
./sync-s3-buckets.sh --dry-run

# Execute sync
./sync-s3-buckets.sh

# Sync and delete orphaned files in target
./sync-s3-buckets.sh --delete
```

## Command Line Options

### run-migration.sh / migrate-to-prod.cjs

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview changes without writing to DynamoDB/S3 |
| `--csv-only` | Only import CSV data to DynamoDB |
| `--s3-only` | Only copy S3 data |
| `--table=<name>` | Only migrate specific table (e.g., `--table=Entity`) |
| `--skip-confirm` | Skip the confirmation prompt |

### sync-s3-buckets.sh

| Option | Description |
|--------|-------------|
| `--dry-run` | Preview what would be synced |
| `--delete` | Delete files in target that don't exist in source |

## CSV File Format

CSV files should be exports from DynamoDB with:
- First row: column headers
- Required column: `id` (primary key)
- Optional columns: `createdAt`, `updatedAt` (auto-set if missing)

Example:
```csv
id,name,description,createdAt,updatedAt
abc123,Test Entity,A test entity,2024-01-01T00:00:00.000Z,2024-01-01T00:00:00.000Z
```

## Troubleshooting

### AWS Credentials Error
```bash
# Check current identity
aws sts get-caller-identity

# If using profiles
export AWS_PROFILE=your-profile

# If credentials expired, re-authenticate
```

### Missing Dependencies
```bash
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb @aws-sdk/client-s3
```

### Table Not Found
Verify table names exist in target account:
```bash
aws dynamodb list-tables --query "TableNames[?contains(@, 'prod')]"
```

### S3 Access Denied
Check bucket policies and IAM permissions:
```bash
aws s3 ls s3://pokerpro-scraper-storage
aws s3 ls s3://kingsroom-storage-prod
```

## Safety Features

1. **Dry Run Mode**: Preview all changes before executing
2. **Confirmation Prompt**: Requires explicit confirmation for production writes
3. **Batch Processing**: Uses DynamoDB batch writes with retry logic
4. **Error Handling**: Continues on individual record failures, reports summary

## Notes

- The migration is **additive** - existing records in production won't be deleted
- If a record with the same `id` exists, it will be **overwritten**
- S3 sync will skip files that already exist with the same size/timestamp
- Use `--delete` with S3 sync cautiously - it removes files not in source
