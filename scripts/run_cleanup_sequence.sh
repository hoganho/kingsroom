#!/bin/bash

# ==============================================================================
# KINGSROOM DEV CLEANUP SEQUENCE
# ==============================================================================
# This script runs all cleanup scripts in the correct order.
#
# Order:
#   1. Backup DynamoDB tables (CSV) - preserves data before deletion
#   2. Clear core dev data (Game, Player*, etc.)
#   3. Clear social data with cascade cleanup (enhanced)
#   4. Clear scraper metadata
#   5. Backup and clear CloudWatch logs
#
# Data Output:
#   All backups are saved to ../Data/ (outside project root)
#   - ../Data/dbbackup_YYYYMMDD_HHMMSS/   (DynamoDB CSV backups)
#   - ../Data/logbackup_YYYYMMDD_HHMMSS/  (CloudWatch log backups)
#
# ==============================================================================

# Ensure the script exits immediately if any command returns a non-zero status
set -e

# ==============================================================================
# CONFIGURATION
# ==============================================================================

# Default Environment Variables (Can be overridden by shell env)
export AWS_REGION=${AWS_REGION:-"ap-southeast-2"}
export ENV_SUFFIX=${ENV_SUFFIX:-"dev"}
export API_ID_FILTER=${API_ID_FILTER:-"ht3nugt6lvddpeeuwj3x6mkite"}

# Output directory for all backups (outside project root)
export DATA_OUTPUT_DIR=${DATA_OUTPUT_DIR:-"../../Data"}

# Script file names
SCRIPT_BACKUP="backupDevData-csv-timestamped.js"
SCRIPT_CLEAR_CORE="clearDevData.js"
SCRIPT_CLEAR_SOCIAL="clearDevData-social-enhanced.js"
SCRIPT_CLEAR_SCRAPER="clearScraperMetadata.js"
SCRIPT_CLEAR_LOGS="backupThenClearCloudwatchLogs_perStream.js"
SCRIPT_DELETE_LOGS_ONLY="listAndDeleteCloudwatchLogs.js"

# Confirmation Keywords expected by the Node scripts
KEYWORD_BACKUP="backup"     # for backupDevData
KEYWORD_PROCEED="proceed"   # for clearDevData, social-enhanced, CloudwatchLogs
KEYWORD_DELETE="DELETE"     # for clearScraperMetadata

# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

print_header() {
    echo ""
    echo "======================================================================"
    echo "   $1"
    echo "======================================================================"
    echo ""
}

print_subheader() {
    echo ""
    echo "----------------------------------------------------------------------"
    echo "   $1"
    echo "----------------------------------------------------------------------"
}

check_file() {
    if [ ! -f "$1" ]; then
        echo "⚠️  Warning: File '$1' not found in current directory."
        return 1
    fi
    return 0
}

ensure_data_dir() {
    if [ ! -d "$DATA_OUTPUT_DIR" ]; then
        echo "📁 Creating output directory: $DATA_OUTPUT_DIR"
        mkdir -p "$DATA_OUTPUT_DIR"
    fi
}

show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Runs the complete Kingsroom dev data cleanup sequence."
    echo ""
    echo "Options:"
    echo "  --auto                  Run without manual confirmations"
    echo "  --skip-backup           Skip the CSV backup step (Step 1)"
    echo "  --skip-core             Skip clearing core dev data (Step 2)"
    echo "  --skip-social           Skip clearing social data (Step 3)"
    echo "  --skip-scraper          Skip clearing scraper metadata (Step 4)"
    echo "  --skip-logs             Skip CloudWatch log backup/clear (Step 5)"
    echo "  --dry-run               Show what would be done without executing"
    echo "  --help                  Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  AWS_REGION              AWS region (default: ap-southeast-2)"
    echo "  ENV_SUFFIX              Environment suffix (default: dev)"
    echo "  API_ID_FILTER           Amplify API ID filter (default: ht3nugt6lvddpeeuwj3x6mkite)"
    echo "  DATA_OUTPUT_DIR         Output directory for backups (default: ../Data)"
    echo ""
    echo "Examples:"
    echo "  $0                      # Interactive mode"
    echo "  $0 --auto               # Automatic mode (no prompts)"
    echo "  $0 --skip-backup        # Skip backup, run everything else"
    echo "  ENV_SUFFIX=staging $0   # Run against staging environment"
}

# ==============================================================================
# PARSE ARGUMENTS
# ==============================================================================

AUTO_MODE=false
SKIP_BACKUP=false
SKIP_CORE=false
SKIP_SOCIAL=false
SKIP_SCRAPER=false
SKIP_LOGS=false
DRY_RUN_MODE=false

for arg in "$@"; do
    case $arg in
        --auto)
            AUTO_MODE=true
            ;;
        --skip-backup)
            SKIP_BACKUP=true
            ;;
        --skip-core)
            SKIP_CORE=true
            ;;
        --skip-social)
            SKIP_SOCIAL=true
            ;;
        --skip-scraper)
            SKIP_SCRAPER=true
            ;;
        --skip-logs)
            SKIP_LOGS=true
            ;;
        --dry-run)
            DRY_RUN_MODE=true
            ;;
        --help|-h)
            show_usage
            exit 0
            ;;
        *)
            echo "Unknown option: $arg"
            show_usage
            exit 1
            ;;
    esac
done

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

print_header "🧹 KINGSROOM DEV CLEANUP SEQUENCE"

# Show mode
if [ "$DRY_RUN_MODE" = true ]; then
    echo "🔍 DRY RUN MODE - No actions will be performed"
    export DRY_RUN=1
elif [ "$AUTO_MODE" = true ]; then
    echo "⚠️  AUTO MODE - Confirmations will be automatic"
    sleep 2
else
    echo "📝 INTERACTIVE MODE - You will be prompted for each step"
fi

echo ""
echo "Configuration:"
echo "  AWS_REGION:      $AWS_REGION"
echo "  ENV_SUFFIX:      $ENV_SUFFIX"
echo "  API_ID_FILTER:   $API_ID_FILTER"
echo "  DATA_OUTPUT_DIR: $DATA_OUTPUT_DIR"
echo ""

# Ensure output directory exists
ensure_data_dir

# Calculate total steps based on skip flags
TOTAL_STEPS=5
[ "$SKIP_BACKUP" = true ] && TOTAL_STEPS=$((TOTAL_STEPS - 1))
[ "$SKIP_CORE" = true ] && TOTAL_STEPS=$((TOTAL_STEPS - 1))
[ "$SKIP_SOCIAL" = true ] && TOTAL_STEPS=$((TOTAL_STEPS - 1))
[ "$SKIP_SCRAPER" = true ] && TOTAL_STEPS=$((TOTAL_STEPS - 1))
[ "$SKIP_LOGS" = true ] && TOTAL_STEPS=$((TOTAL_STEPS - 1))

if [ "$TOTAL_STEPS" -eq 0 ]; then
    echo "All steps skipped. Nothing to do."
    exit 0
fi

CURRENT_STEP=0

# ==============================================================================
# STEP 1: Backup DynamoDB Tables (CSV)
# ==============================================================================

if [ "$SKIP_BACKUP" = false ]; then
    CURRENT_STEP=$((CURRENT_STEP + 1))
    print_header "STEP ${CURRENT_STEP}/${TOTAL_STEPS}: Backup DynamoDB Tables (CSV)"
    
    if check_file "$SCRIPT_BACKUP"; then
        if [ "$DRY_RUN_MODE" = true ]; then
            echo "[DRY RUN] Would run: node $SCRIPT_BACKUP"
        elif [ "$AUTO_MODE" = true ]; then
            echo "$KEYWORD_BACKUP" | node "$SCRIPT_BACKUP"
        else
            node "$SCRIPT_BACKUP"
        fi
    else
        echo "⚠️  Skipping backup - script not found"
    fi
else
    echo "⏭️  Skipping Step: Backup DynamoDB Tables (--skip-backup)"
fi

# ==============================================================================
# STEP 2: Clear Core DynamoDB Data
# ==============================================================================

if [ "$SKIP_CORE" = false ]; then
    CURRENT_STEP=$((CURRENT_STEP + 1))
    print_header "STEP ${CURRENT_STEP}/${TOTAL_STEPS}: Clear Core DynamoDB Data"
    
    if check_file "$SCRIPT_CLEAR_CORE"; then
        if [ "$DRY_RUN_MODE" = true ]; then
            echo "[DRY RUN] Would run: node $SCRIPT_CLEAR_CORE"
        elif [ "$AUTO_MODE" = true ]; then
            echo "$KEYWORD_PROCEED" | node "$SCRIPT_CLEAR_CORE"
        else
            node "$SCRIPT_CLEAR_CORE"
        fi
    else
        echo "❌ Error: $SCRIPT_CLEAR_CORE not found"
        exit 1
    fi
else
    echo "⏭️  Skipping Step: Clear Core DynamoDB Data (--skip-core)"
fi

# ==============================================================================
# STEP 3: Clear Social Data (Enhanced with Cascade)
# ==============================================================================

if [ "$SKIP_SOCIAL" = false ]; then
    CURRENT_STEP=$((CURRENT_STEP + 1))
    print_header "STEP ${CURRENT_STEP}/${TOTAL_STEPS}: Clear Social Data (Enhanced)"
    
    if check_file "$SCRIPT_CLEAR_SOCIAL"; then
        if [ "$DRY_RUN_MODE" = true ]; then
            echo "[DRY RUN] Would run: node $SCRIPT_CLEAR_SOCIAL"
        elif [ "$AUTO_MODE" = true ]; then
            # Enhanced script has multiple prompts:
            # 1. "proceed" to start
            # 2. "n" for delete templates question  
            # 3. "n" for delete S3 question
            # Using here-doc for reliable multi-line input
            node "$SCRIPT_CLEAR_SOCIAL" <<SOCIAL_INPUT
proceed
n
n
SOCIAL_INPUT
        else
            node "$SCRIPT_CLEAR_SOCIAL"
        fi
    else
        echo "⚠️  Warning: $SCRIPT_CLEAR_SOCIAL not found - skipping social cleanup"
    fi
else
    echo "⏭️  Skipping Step: Clear Social Data (--skip-social)"
fi

# ==============================================================================
# STEP 4: Clear Scraper Metadata
# ==============================================================================

if [ "$SKIP_SCRAPER" = false ]; then
    CURRENT_STEP=$((CURRENT_STEP + 1))
    print_header "STEP ${CURRENT_STEP}/${TOTAL_STEPS}: Clear Scraper Metadata"
    
    if check_file "$SCRIPT_CLEAR_SCRAPER"; then
        if [ "$DRY_RUN_MODE" = true ]; then
            echo "[DRY RUN] Would run: node $SCRIPT_CLEAR_SCRAPER"
        elif [ "$AUTO_MODE" = true ]; then
            echo "$KEYWORD_DELETE" | node "$SCRIPT_CLEAR_SCRAPER"
        else
            node "$SCRIPT_CLEAR_SCRAPER"
        fi
    else
        echo "⚠️  Warning: $SCRIPT_CLEAR_SCRAPER not found - skipping scraper cleanup"
    fi
else
    echo "⏭️  Skipping Step: Clear Scraper Metadata (--skip-scraper)"
fi

# ==============================================================================
# STEP 5: Backup & Clear CloudWatch Logs
# ==============================================================================

if [ "$SKIP_LOGS" = false ]; then
    CURRENT_STEP=$((CURRENT_STEP + 1))
    
    # Choose script based on whether we're skipping backups
    if [ "$SKIP_BACKUP" = true ]; then
        LOGS_SCRIPT="$SCRIPT_DELETE_LOGS_ONLY"
        LOGS_KEYWORD="yes"
        print_header "STEP ${CURRENT_STEP}/${TOTAL_STEPS}: Delete CloudWatch Logs (No Backup)"
    else
        LOGS_SCRIPT="$SCRIPT_CLEAR_LOGS"
        LOGS_KEYWORD="$KEYWORD_PROCEED"
        print_header "STEP ${CURRENT_STEP}/${TOTAL_STEPS}: Backup & Clear CloudWatch Logs"
    fi
    
    if check_file "$LOGS_SCRIPT"; then
        if [ "$DRY_RUN_MODE" = true ]; then
            echo "[DRY RUN] Would run: node $LOGS_SCRIPT"
        elif [ "$AUTO_MODE" = true ]; then
            echo "$LOGS_KEYWORD" | node "$LOGS_SCRIPT"
        else
            node "$LOGS_SCRIPT"
        fi
    else
        echo "⚠️  Warning: $LOGS_SCRIPT not found - skipping log cleanup"
    fi
else
    echo "⏭️  Skipping Step: Backup & Clear CloudWatch Logs (--skip-logs)"
fi

# ==============================================================================
# COMPLETION
# ==============================================================================

print_header "✅ CLEANUP SEQUENCE COMPLETE"

echo "Summary:"
echo "  Environment:     $ENV_SUFFIX"
echo "  Region:          $AWS_REGION"
echo "  Data saved to:   $DATA_OUTPUT_DIR"
echo ""

if [ "$DRY_RUN_MODE" = true ]; then
    echo "This was a DRY RUN - no actual changes were made."
else
    echo "All requested cleanup steps have been executed."
fi

echo ""