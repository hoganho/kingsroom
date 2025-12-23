#!/bin/bash

# ==============================================================================
# CONFIGURATION
# ==============================================================================

# Ensure the script exits immediately if any command returns a non-zero status
set -e

# Default Environment Variables (Can be overridden by shell env)
export AWS_REGION=${AWS_REGION:-"ap-southeast-2"}
export ENV_SUFFIX=${ENV_SUFFIX:-"staging"}
export API_ID_FILTER=${API_ID_FILTER:-"fosb7ek5argnhctz4odpt52eia"}

# File names of your scripts
SCRIPT_1="backupDevData-csv-timestamped.js"
SCRIPT_2="clearDevData.js"
SCRIPT_3="clearScraperMetadata.js"
SCRIPT_4="backupThenClearCloudwatchLogs_perStream.js"

# Confirmation Keywords expected by the Node scripts
KEYWORD_1="backup"  # for backupDevData
KEYWORD_2="proceed" # for clearDevData
KEYWORD_3="DELETE"  # for clearScraperMetadata
KEYWORD_4="proceed" # for CloudwatchLogs

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

check_file() {
    if [ ! -f "$1" ]; then
        echo "❌ Error: File '$1' not found in current directory."
        exit 1
    fi
}

# ==============================================================================
# MAIN EXECUTION
# ==============================================================================

# Check if --auto flag is passed
AUTO_MODE=false
if [[ "$1" == "--auto" ]]; then
    AUTO_MODE=true
    print_header "⚠️  WARNING: RUNNING IN AUTO MODE (NO CONFIRMATIONS) ⚠️"
    echo "The script will automatically pipe confirmation keywords."
    sleep 3
else
    print_header "RUNNING IN INTERACTIVE MODE"
    echo "You will be prompted to confirm each step manually."
fi

# Verify all scripts exist before starting
check_file "$SCRIPT_1"
check_file "$SCRIPT_2"
check_file "$SCRIPT_3"
check_file "$SCRIPT_4"

# --- STEP 1: Backup DynamoDB (CSV) ---
print_header "STEP 1/4: Backup DynamoDB Tables (CSV)"
if [ "$AUTO_MODE" = true ]; then
    echo "$KEYWORD_1" | node "$SCRIPT_1"
else
    node "$SCRIPT_1"
fi

# --- STEP 2: Clear DynamoDB Data ---
print_header "STEP 2/4: Clear DynamoDB Data"
if [ "$AUTO_MODE" = true ]; then
    echo "$KEYWORD_2" | node "$SCRIPT_2"
else
    node "$SCRIPT_2"
fi

# --- STEP 3: Clear Scraper Metadata ---
print_header "STEP 3/4: Clear Scraper Metadata"
if [ "$AUTO_MODE" = true ]; then
    echo "$KEYWORD_3" | node "$SCRIPT_3"
else
    node "$SCRIPT_3"
fi

# --- STEP 4: Backup & Clear CloudWatch Logs ---
print_header "STEP 4/4: Backup & Clear CloudWatch Logs"
if [ "$AUTO_MODE" = true ]; then
    echo "$KEYWORD_4" | node "$SCRIPT_4"
else
    node "$SCRIPT_4"
fi

# --- COMPLETION ---
print_header "✅ SEQUENCE COMPLETE"
echo "All scripts executed successfully."