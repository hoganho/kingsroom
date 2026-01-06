#!/bin/bash
# ===================================================================
# S3 Bucket Sync Script
# ===================================================================
#
# Syncs all data from dev S3 bucket to prod S3 bucket using AWS CLI
# This is more efficient than the Node.js approach for large buckets
#
# USAGE:
#   ./sync-s3-buckets.sh [--dry-run] [--delete]
#
# OPTIONS:
#   --dry-run   Preview what would be copied without copying
#   --delete    Delete files in target that don't exist in source
#
# ===================================================================

set -e

# Configuration
SOURCE_BUCKET="pokerpro-scraper-storage"
TARGET_BUCKET="kingsroom-storage-prod"
AWS_REGION="ap-southeast-2"

# Parse arguments
DRY_RUN=""
DELETE=""
for arg in "$@"; do
    case $arg in
        --dry-run)
            DRY_RUN="--dryrun"
            ;;
        --delete)
            DELETE="--delete"
            ;;
    esac
done

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║                    S3 BUCKET SYNC                            ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""
echo "  Source: s3://$SOURCE_BUCKET"
echo "  Target: s3://$TARGET_BUCKET"
echo ""

if [ -n "$DRY_RUN" ]; then
    echo "  🔍 DRY RUN MODE - No changes will be made"
    echo ""
fi

# Check AWS credentials
echo "🔐 Checking AWS credentials..."
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured or expired"
    exit 1
fi
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
echo "  ✓ AWS Account: $ACCOUNT_ID"
echo ""

# Show source bucket stats
echo "📊 Source bucket statistics:"
aws s3 ls s3://$SOURCE_BUCKET --recursive --summarize | tail -2
echo ""

# Confirm before production sync (unless dry-run)
if [ -z "$DRY_RUN" ]; then
    read -p "⚠️  Are you sure you want to sync to production? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
        echo "Sync cancelled."
        exit 0
    fi
    echo ""
fi

# Run sync
echo "🚀 Starting sync..."
echo ""

aws s3 sync "s3://$SOURCE_BUCKET" "s3://$TARGET_BUCKET" \
    --region $AWS_REGION \
    $DRY_RUN \
    $DELETE \
    --only-show-errors

echo ""

if [ -n "$DRY_RUN" ]; then
    echo "✅ Dry run complete - no changes were made"
    echo "   Run without --dry-run to perform the actual sync"
else
    echo "✅ Sync complete!"
    echo ""
    echo "📊 Target bucket statistics:"
    aws s3 ls s3://$TARGET_BUCKET --recursive --summarize | tail -2
fi
