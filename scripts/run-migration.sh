#!/bin/bash
# ===================================================================
# Production Migration Script Runner
# ===================================================================
#
# USAGE:
#   ./run-migration.sh [options]
#
# OPTIONS:
#   --dry-run       Preview changes without writing
#   --csv-only      Only import CSV data to DynamoDB
#   --s3-only       Only copy S3 data
#   --table=<name>  Only migrate specific table (e.g., --table=Entity)
#   --skip-confirm  Skip confirmation prompts
#
# SETUP:
#   1. Place your CSV files in the same directory as this script
#   2. Ensure AWS credentials are configured
#   3. Make executable: chmod +x run-migration.sh
#   4. Run: ./run-migration.sh --dry-run
#
# ===================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ===================================================================
# CONFIGURATION - Modify if needed
# ===================================================================

export AWS_REGION="ap-southeast-2"
# export AWS_PROFILE="your-profile"  # Uncomment if using named profile

# CSV files directory (default: same as script)
export CSV_DIRECTORY="${CSV_DIRECTORY:-$SCRIPT_DIR}"

# ===================================================================
# TABLE MAPPING
# ===================================================================
# Source: ht3nugt6lvddpeeuwj3x6mkite-dev
# Target: ynuahifnznb5zddz727oiqnicy-prod

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║         PRODUCTION MIGRATION - KINGSROOM                     ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║                                                               ║"
echo "║  CSV Tables to Migrate:                                       ║"
echo "║    • Entity                                                   ║"
echo "║    • SocialPost                                               ║"
echo "║    • TournamentSeriesTitle                                    ║"
echo "║    • SocialAccount                                            ║"
echo "║    • TournamentSeries                                         ║"
echo "║    • Venue                                                    ║"
echo "║                                                               ║"
echo "║  S3 Migration:                                                ║"
echo "║    • From: pokerpro-scraper-storage                           ║"
echo "║    • To:   kingsroom-storage-prod                             ║"
echo "║                                                               ║"
echo "╚═══════════════════════════════════════════════════════════════╝"
echo ""

# ===================================================================
# PREFLIGHT CHECKS
# ===================================================================

echo "🔍 Running preflight checks..."
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    exit 1
fi
echo "  ✓ Node.js $(node --version)"

# Check AWS CLI
if ! command -v aws &> /dev/null; then
    echo "❌ AWS CLI is not installed"
    exit 1
fi
echo "  ✓ AWS CLI installed"

# Check AWS credentials
if ! aws sts get-caller-identity &> /dev/null; then
    echo "❌ AWS credentials not configured or expired"
    exit 1
fi
ACCOUNT_ID=$(aws sts get-caller-identity --query "Account" --output text)
echo "  ✓ AWS Account: $ACCOUNT_ID"

# Check for required npm packages
echo ""
echo "📦 Checking dependencies..."

MISSING_DEPS=()

if ! node -e "require('@aws-sdk/client-dynamodb')" 2>/dev/null; then
    MISSING_DEPS+=("@aws-sdk/client-dynamodb")
fi

if ! node -e "require('@aws-sdk/lib-dynamodb')" 2>/dev/null; then
    MISSING_DEPS+=("@aws-sdk/lib-dynamodb")
fi

if ! node -e "require('@aws-sdk/client-s3')" 2>/dev/null; then
    MISSING_DEPS+=("@aws-sdk/client-s3")
fi

if [ ${#MISSING_DEPS[@]} -ne 0 ]; then
    echo "  ⚠️  Missing dependencies: ${MISSING_DEPS[*]}"
    echo ""
    echo "  Installing missing dependencies..."
    npm install ${MISSING_DEPS[*]}
    echo ""
fi

echo "  ✓ All dependencies available"

# Check CSV files
echo ""
echo "📋 Checking CSV files in: $CSV_DIRECTORY"

CSV_FILES=(
    "Entity-ht3nugt6lvddpeeuwj3x6mkite-dev.csv"
    "SocialPost-ht3nugt6lvddpeeuwj3x6mkite-dev.csv"
    "TournamentSeriesTitle-ht3nugt6lvddpeeuwj3x6mkite-dev.csv"
    "SocialAccount-ht3nugt6lvddpeeuwj3x6mkite-dev.csv"
    "TournamentSeries-ht3nugt6lvddpeeuwj3x6mkite-dev.csv"
    "Venue-ht3nugt6lvddpeeuwj3x6mkite-dev.csv"
)

FOUND_COUNT=0
for csv in "${CSV_FILES[@]}"; do
    if [ -f "$CSV_DIRECTORY/$csv" ]; then
        LINES=$(wc -l < "$CSV_DIRECTORY/$csv" | tr -d ' ')
        RECORDS=$((LINES - 1))
        echo "  ✓ $csv ($RECORDS records)"
        ((FOUND_COUNT++))
    else
        echo "  ○ $csv (not found)"
    fi
done

echo ""
echo "  Found $FOUND_COUNT of ${#CSV_FILES[@]} CSV files"

# Check S3 buckets
echo ""
echo "📦 Checking S3 buckets..."

if aws s3api head-bucket --bucket "pokerpro-scraper-storage" 2>/dev/null; then
    SOURCE_OBJECTS=$(aws s3 ls s3://pokerpro-scraper-storage --recursive --summarize 2>/dev/null | grep "Total Objects" | awk '{print $3}')
    echo "  ✓ Source: pokerpro-scraper-storage ($SOURCE_OBJECTS objects)"
else
    echo "  ✗ Source: pokerpro-scraper-storage (not accessible)"
fi

if aws s3api head-bucket --bucket "kingsroom-storage-prod" 2>/dev/null; then
    echo "  ✓ Target: kingsroom-storage-prod (accessible)"
else
    echo "  ✗ Target: kingsroom-storage-prod (not accessible)"
fi

# ===================================================================
# RUN MIGRATION
# ===================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Pass all arguments to the Node script
node "$SCRIPT_DIR/migrate-to-prod.cjs" "$@"
