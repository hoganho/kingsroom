#!/bin/bash

# ==============================================================================
# KINGSROOM PRODUCTION CLEANUP SEQUENCE
# ==============================================================================
# Wrapper script for cleanupProdData.js with additional safety checks
# for production environment.
#
# Usage:
#   ./run_prod_cleanup.sh [OPTIONS]
#
# Options are passed directly to the Node.js script.
# See: node cleanupProdData.js --help
#
# ==============================================================================

set -e

# ==============================================================================
# CONFIGURATION
# ==============================================================================

# Script location (assumes this script is in the same directory as cleanupProdData.js)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLEANUP_SCRIPT="${SCRIPT_DIR}/cleanupProdData.js"

# Default Environment Variables (Can be overridden by shell env)
export AWS_REGION=${AWS_REGION:-"ap-southeast-2"}
export DATA_OUTPUT_DIR=${DATA_OUTPUT_DIR:-"../../Data"}

# Production identifiers (for display purposes)
PROD_API_ID="ynuahifnznb5zddz727oiqnicy"
PROD_ENV="prod"

# ==============================================================================
# COLORS (for better visibility)
# ==============================================================================

RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# ==============================================================================
# HELPER FUNCTIONS
# ==============================================================================

print_banner() {
    echo ""
    echo -e "${RED}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                                                                  ║${NC}"
    echo -e "${RED}║     🚨  KINGSROOM PRODUCTION CLEANUP SCRIPT  🚨                  ║${NC}"
    echo -e "${RED}║                                                                  ║${NC}"
    echo -e "${RED}║     ⚠️  THIS WILL DELETE PRODUCTION DATA  ⚠️                     ║${NC}"
    echo -e "${RED}║                                                                  ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
}

print_config() {
    echo -e "${CYAN}Configuration:${NC}"
    echo -e "  AWS Region:      ${BOLD}${AWS_REGION}${NC}"
    echo -e "  API ID:          ${BOLD}${PROD_API_ID}${NC}"
    echo -e "  Environment:     ${BOLD}${PROD_ENV}${NC}"
    echo -e "  Backup Dir:      ${BOLD}${DATA_OUTPUT_DIR}${NC}"
    echo ""
}

check_prerequisites() {
    # Check for Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Error: Node.js is not installed or not in PATH${NC}"
        exit 1
    fi
    
    # Check for the cleanup script
    if [ ! -f "$CLEANUP_SCRIPT" ]; then
        echo -e "${RED}Error: cleanupProdData.js not found at: ${CLEANUP_SCRIPT}${NC}"
        exit 1
    fi
    
    # Check for AWS credentials
    if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
        echo -e "${YELLOW}Warning: AWS credentials not found in environment variables${NC}"
        echo "Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY before running."
        echo ""
        read -p "Do you want to continue anyway? (y/N): " continue_anyway
        if [ "$continue_anyway" != "y" ] && [ "$continue_anyway" != "Y" ]; then
            echo "Aborted."
            exit 1
        fi
    fi
}

ensure_data_dir() {
    if [ ! -d "$DATA_OUTPUT_DIR" ]; then
        echo -e "${CYAN}Creating output directory: ${DATA_OUTPUT_DIR}${NC}"
        mkdir -p "$DATA_OUTPUT_DIR"
    fi
}

show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Runs the Kingsroom PRODUCTION data cleanup script."
    echo ""
    echo "Options (passed to cleanupProdData.js):"
    echo "  --dry-run              Preview changes without executing (RECOMMENDED FIRST)"
    echo "  --backup-only          Only backup data (no deletion)"
    echo "  --skip-backup          Skip CSV backup step"
    echo "  --skip-core            Skip clearing core data tables"
    echo "  --skip-social          Skip clearing social data tables"
    echo "  --skip-scraper         Skip clearing scraper metadata"
    echo "  --skip-logs            Skip CloudWatch log cleanup"
    echo "  --delete-s3-media      Also delete S3 media files (social posts)"
    echo "  --delete-templates     Also delete auto-created TicketTemplates"
    echo "  --auto                 Skip confirmation prompts (DANGEROUS!)"
    echo "  --help                 Show this help message"
    echo ""
    echo "Environment Variables:"
    echo "  AWS_REGION             AWS region (default: ap-southeast-2)"
    echo "  AWS_ACCESS_KEY_ID      Required for AWS access"
    echo "  AWS_SECRET_ACCESS_KEY  Required for AWS access"
    echo "  DATA_OUTPUT_DIR        Output directory for backups (default: ../../Data)"
    echo ""
    echo "Examples:"
    echo "  $0 --dry-run                    # Preview what would happen"
    echo "  $0 --backup-only                # Just backup, no delete"
    echo "  $0 --skip-core --skip-logs      # Only social + scraper"
    echo ""
    echo -e "${YELLOW}⚠️  ALWAYS run with --dry-run first to preview changes!${NC}"
}

# ==============================================================================
# PARSE ARGUMENTS
# ==============================================================================

# Check for help flag first
for arg in "$@"; do
    case $arg in
        --help|-h)
            show_usage
            exit 0
            ;;
    esac
done

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

print_banner
check_prerequisites
print_config
ensure_data_dir

# Check if dry-run is included
DRY_RUN=false
for arg in "$@"; do
    if [ "$arg" == "--dry-run" ]; then
        DRY_RUN=true
        break
    fi
done

if [ "$DRY_RUN" = false ]; then
    echo -e "${RED}╔══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║                       ⚠️  WARNING  ⚠️                             ║${NC}"
    echo -e "${RED}║                                                                  ║${NC}"
    echo -e "${RED}║  You are about to run this script in LIVE mode.                 ║${NC}"
    echo -e "${RED}║  This will PERMANENTLY DELETE production data!                  ║${NC}"
    echo -e "${RED}║                                                                  ║${NC}"
    echo -e "${RED}║  If you haven't already, consider running with --dry-run first. ║${NC}"
    echo -e "${RED}║                                                                  ║${NC}"
    echo -e "${RED}╚══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    
    read -p "Are you sure you want to proceed? (yes/NO): " proceed
    if [ "$proceed" != "yes" ]; then
        echo ""
        echo -e "${GREEN}Aborted. Consider running with --dry-run to preview changes.${NC}"
        exit 0
    fi
    
    echo ""
    read -p "Type 'PRODUCTION' to confirm this is the production environment: " confirm_env
    if [ "$confirm_env" != "PRODUCTION" ]; then
        echo ""
        echo -e "${GREEN}Aborted.${NC}"
        exit 0
    fi
fi

echo ""
echo -e "${CYAN}Starting cleanup script...${NC}"
echo ""

# Run the Node.js script with all arguments
node "$CLEANUP_SCRIPT" "$@"

# Capture exit code
EXIT_CODE=$?

echo ""
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}✅ Script completed successfully${NC}"
else
    echo -e "${RED}❌ Script exited with error code: ${EXIT_CODE}${NC}"
fi

exit $EXIT_CODE
