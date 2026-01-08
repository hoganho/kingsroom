#!/bin/bash
# ===================================================================
# Seed Data Script Runner
# ===================================================================
#
# USAGE:
#   ./seed-data.sh [options]
#
# OPTIONS:
#   --dry-run       Preview changes without writing to DynamoDB
#   --table=<name>  Only seed specific table (e.g., --table=Entity)
#   --skip-confirm  Skip confirmation prompts
#   --clear-first   Clear existing table data before seeding
#
# SETUP:
#   1. Place your CSV files in the ./seed-data directory
#   2. Ensure AWS credentials are configured
#   3. Make executable: chmod +x seed-data.sh
#   4. Run: ./seed-data.sh --dry-run
#
# ===================================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SEED_DATA_DIR="${SCRIPT_DIR}/seed-data"

# ===================================================================
# CONFIGURATION - Modify if needed
# ===================================================================

export AWS_REGION="${AWS_REGION:-ap-southeast-2}"
# export AWS_PROFILE="your-profile"  # Uncomment if using named profile

# Table suffix for your environment
export TABLE_SUFFIX="${TABLE_SUFFIX:-ht3nugt6lvddpeeuwj3x6mkite-dev}"

# ===================================================================
# HEADER
# ===================================================================

echo "╔═══════════════════════════════════════════════════════════════╗"
echo "║              SEED DATA - KINGSROOM                            ║"
echo "╠═══════════════════════════════════════════════════════════════╣"
echo "║                                                               ║"
echo "║  Seed data from CSV files into DynamoDB tables                ║"
echo "║                                                               ║"
echo "║  Supported Tables:                                            ║"
echo "║    • Entity                                                   ║"
echo "║    • SocialPost                                               ║"
echo "║    • TournamentSeriesTitle                                    ║"
echo "║    • SocialAccount                                            ║"
echo "║    • TournamentSeries                                         ║"
echo "║    • Venue                                                    ║"
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
echo "  ✓ AWS Region: $AWS_REGION"

# Check for seed-data directory
echo ""
echo "📁 Checking seed-data directory..."

if [ ! -d "$SEED_DATA_DIR" ]; then
    echo "  ⚠️  Directory not found: $SEED_DATA_DIR"
    echo "  Creating directory..."
    mkdir -p "$SEED_DATA_DIR"
    echo "  ✓ Created $SEED_DATA_DIR"
    echo ""
    echo "  Please add your CSV files to this directory and run again."
    exit 0
fi

echo "  ✓ Found: $SEED_DATA_DIR"

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
echo "📋 Scanning for CSV files in: $SEED_DATA_DIR"

KNOWN_TABLES=(
    "Entity"
    "SocialPost"
    "TournamentSeriesTitle"
    "SocialAccount"
    "TournamentSeries"
    "Venue"
)

FOUND_COUNT=0
FOUND_FILES=()

for table in "${KNOWN_TABLES[@]}"; do
    CSV_FILE="$SEED_DATA_DIR/${table}-${TABLE_SUFFIX}.csv"
    if [ -f "$CSV_FILE" ]; then
        LINES=$(wc -l < "$CSV_FILE" | tr -d ' ')
        RECORDS=$((LINES - 1))
        echo "  ✓ ${table}-${TABLE_SUFFIX}.csv ($RECORDS records)"
        ((FOUND_COUNT++))
        FOUND_FILES+=("$table")
    fi
done

if [ $FOUND_COUNT -eq 0 ]; then
    echo "  ⚠️  No CSV files found!"
    echo ""
    echo "  Expected format: <TableName>-${TABLE_SUFFIX}.csv"
    echo "  Example: Entity-${TABLE_SUFFIX}.csv"
    echo ""
    exit 1
fi

echo ""
echo "  Found $FOUND_COUNT CSV file(s) to seed"

# ===================================================================
# RUN SEEDING
# ===================================================================

echo ""
echo "═══════════════════════════════════════════════════════════════"
echo ""

# Export seed data directory for Node script
export SEED_DATA_DIR

# Pass all arguments to the Node script
node "$SCRIPT_DIR/seed-data.cjs" "$@"
