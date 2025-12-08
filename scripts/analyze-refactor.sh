#!/bin/bash

# ============================================================================
# POKER ECONOMICS REFACTOR - CODEBASE ANALYSIS SCRIPT
# ============================================================================
# Run this in your project root directory:
#   chmod +x analyze-refactor.sh
#   ./analyze-refactor.sh /path/to/your/project
# ============================================================================

PROJECT_DIR="${1:-.}"
OUTPUT_FILE="refactor-analysis-$(date +%Y%m%d-%H%M%S).txt"

echo "============================================================================"
echo "POKER ECONOMICS REFACTOR - CODEBASE ANALYSIS"
echo "Analyzing: $PROJECT_DIR"
echo "Output: $OUTPUT_FILE"
echo "============================================================================"

# Build the include pattern for grep (each extension needs separate --include)
INCLUDE_PATTERN="--include=*.ts --include=*.tsx --include=*.js --include=*.jsx --include=*.graphql --include=*.json"

# Build the exclude pattern
EXCLUDE_PATTERN="--exclude-dir=node_modules --exclude-dir=.next --exclude-dir=dist --exclude-dir=.amplify --exclude-dir=build --exclude-dir=.git"

# Function to search for a term
search_term() {
    local term="$1"
    grep -rn $INCLUDE_PATTERN $EXCLUDE_PATTERN "$term" "$PROJECT_DIR" 2>/dev/null
}

# Function to count occurrences
count_term() {
    local term="$1"
    grep -rn $INCLUDE_PATTERN $EXCLUDE_PATTERN "$term" "$PROJECT_DIR" 2>/dev/null | wc -l
}

{
    echo "============================================================================"
    echo "POKER ECONOMICS REFACTOR ANALYSIS"
    echo "Generated: $(date)"
    echo "Project: $PROJECT_DIR"
    echo "============================================================================"
    echo ""

    # -------------------------------------------------------------------------
    # FIELDS TO RENAME
    # -------------------------------------------------------------------------
    
    echo "============================================================================"
    echo "SECTION 1: FIELDS TO RENAME"
    echo "============================================================================"
    echo ""

    echo "--- totalRake → projectedRakeRevenue ---"
    search_term "totalRake"
    echo ""
    echo "Count: $(count_term 'totalRake')"
    echo ""

    echo "--- gameProfitLoss → gameProfit ---"
    search_term "gameProfitLoss"
    echo ""
    echo "Count: $(count_term 'gameProfitLoss')"
    echo ""

    echo "--- guaranteeOverlay → guaranteeOverlayCost ---"
    search_term "guaranteeOverlay"
    echo ""
    echo "Count: $(count_term 'guaranteeOverlay')"
    echo ""

    echo "--- guaranteeSurplus → prizepoolSurplus ---"
    search_term "guaranteeSurplus"
    echo ""
    echo "Count: $(count_term 'guaranteeSurplus')"
    echo ""

    echo "--- totalRakePerPlayerRealised → fullRakeRealized ---"
    search_term "totalRakePerPlayerRealised"
    echo ""
    echo "Count: $(count_term 'totalRakePerPlayerRealised')"
    echo ""

    echo "--- buyInsByTotalEntries → totalBuyInsCollected ---"
    search_term "buyInsByTotalEntries"
    echo ""
    echo "Count: $(count_term 'buyInsByTotalEntries')"
    echo ""

    # -------------------------------------------------------------------------
    # NEW FIELDS TO ADD (check if they exist)
    # -------------------------------------------------------------------------
    
    echo "============================================================================"
    echo "SECTION 2: NEW FIELDS (checking if already exist)"
    echo "============================================================================"
    echo ""

    for field in "projectedRakeRevenue" "rakeSubsidy" "actualRakeRevenue" "guaranteeOverlayCost" "prizepoolPlayerContributions" "prizepoolAddedValue" "prizepoolSurplus" "gameProfit" "fullRakeRealized" "totalBuyInsCollected"; do
        echo "--- $field ---"
        count=$(count_term "$field")
        if [ "$count" -gt 0 ]; then
            search_term "$field"
        else
            echo "(not found - needs to be added)"
        fi
        echo ""
    done

    # -------------------------------------------------------------------------
    # RELATED CALCULATION FUNCTIONS
    # -------------------------------------------------------------------------
    
    echo "============================================================================"
    echo "SECTION 3: CALCULATION FUNCTIONS TO UPDATE"
    echo "============================================================================"
    echo ""

    for func in "calculateFinancials" "calculateDerivedFields" "calculateTotalRake" "calculateGameProfitLoss" "calculateGuaranteeMetrics" "calculateBuyInsByEntries" "calculatePrizepoolFromEntries" "calculatePokerEconomics"; do
        echo "--- $func ---"
        search_term "$func"
        echo ""
    done

    # -------------------------------------------------------------------------
    # GRAPHQL SCHEMA FILES
    # -------------------------------------------------------------------------
    
    echo "============================================================================"
    echo "SECTION 4: GRAPHQL SCHEMA FILES"
    echo "============================================================================"
    echo ""

    echo "--- Schema files found ---"
    find "$PROJECT_DIR" -name "*.graphql" -not -path "*/node_modules/*" -not -path "*/.amplify/*" -not -path "*/.next/*" 2>/dev/null
    echo ""

    # -------------------------------------------------------------------------
    # API.TS / GENERATED FILES
    # -------------------------------------------------------------------------
    
    echo "============================================================================"
    echo "SECTION 5: GENERATED API FILES (will regenerate after schema change)"
    echo "============================================================================"
    echo ""

    echo "--- API.ts files ---"
    find "$PROJECT_DIR" -name "API.ts" -not -path "*/node_modules/*" 2>/dev/null
    echo ""

    echo "--- mutations.ts files ---"
    find "$PROJECT_DIR" -name "mutations.ts" -not -path "*/node_modules/*" 2>/dev/null
    echo ""

    echo "--- queries.ts files ---"
    find "$PROJECT_DIR" -name "queries.ts" -not -path "*/node_modules/*" 2>/dev/null
    echo ""

    # -------------------------------------------------------------------------
    # LAMBDA FUNCTIONS
    # -------------------------------------------------------------------------
    
    echo "============================================================================"
    echo "SECTION 6: LAMBDA FUNCTIONS"
    echo "============================================================================"
    echo ""

    echo "--- Lambda index files ---"
    find "$PROJECT_DIR" -path "*/amplify/backend/function/*/src/index.js" 2>/dev/null
    echo ""

    # -------------------------------------------------------------------------
    # FILES BY EXTENSION WITH OLD FIELD NAMES
    # -------------------------------------------------------------------------
    
    echo "============================================================================"
    echo "SECTION 7: FILES CONTAINING OLD FIELD NAMES (by extension)"
    echo "============================================================================"
    echo ""

    OLD_FIELDS="totalRake|gameProfitLoss|guaranteeOverlay|guaranteeSurplus|totalRakePerPlayerRealised|buyInsByTotalEntries"

    echo "--- TypeScript files (.ts) ---"
    grep -rln --include="*.ts" $EXCLUDE_PATTERN -E "$OLD_FIELDS" "$PROJECT_DIR" 2>/dev/null | sort | uniq
    echo ""

    echo "--- TSX files (.tsx) ---"
    grep -rln --include="*.tsx" $EXCLUDE_PATTERN -E "$OLD_FIELDS" "$PROJECT_DIR" 2>/dev/null | sort | uniq
    echo ""

    echo "--- JavaScript files (.js) ---"
    grep -rln --include="*.js" $EXCLUDE_PATTERN -E "$OLD_FIELDS" "$PROJECT_DIR" 2>/dev/null | sort | uniq
    echo ""

    echo "--- JSX files (.jsx) ---"
    grep -rln --include="*.jsx" $EXCLUDE_PATTERN -E "$OLD_FIELDS" "$PROJECT_DIR" 2>/dev/null | sort | uniq
    echo ""

    echo "--- GraphQL files (.graphql) ---"
    grep -rln --include="*.graphql" $EXCLUDE_PATTERN -E "$OLD_FIELDS" "$PROJECT_DIR" 2>/dev/null | sort | uniq
    echo ""

    echo "--- JSON files (.json) ---"
    grep -rln --include="*.json" $EXCLUDE_PATTERN -E "$OLD_FIELDS" "$PROJECT_DIR" 2>/dev/null | sort | uniq
    echo ""

    # -------------------------------------------------------------------------
    # SUMMARY
    # -------------------------------------------------------------------------
    
    echo "============================================================================"
    echo "SUMMARY - TOTAL OCCURRENCES TO REFACTOR"
    echo "============================================================================"
    echo ""

    echo "totalRake:                  $(count_term 'totalRake')"
    echo "gameProfitLoss:             $(count_term 'gameProfitLoss')"
    echo "guaranteeOverlay:           $(count_term 'guaranteeOverlay')"
    echo "guaranteeSurplus:           $(count_term 'guaranteeSurplus')"
    echo "totalRakePerPlayerRealised: $(count_term 'totalRakePerPlayerRealised')"
    echo "buyInsByTotalEntries:       $(count_term 'buyInsByTotalEntries')"
    echo ""
    echo "TOTAL LINES TO UPDATE:      $(grep -rn $INCLUDE_PATTERN $EXCLUDE_PATTERN -E 'totalRake|gameProfitLoss|guaranteeOverlay|guaranteeSurplus|totalRakePerPlayerRealised|buyInsByTotalEntries' "$PROJECT_DIR" 2>/dev/null | wc -l)"

} | tee "$OUTPUT_FILE"

echo ""
echo "============================================================================"
echo "Analysis complete! Results saved to: $OUTPUT_FILE"
echo "============================================================================"