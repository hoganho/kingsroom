#!/bin/bash

# Script to copy index.js files from Amplify function folders
# and consolidate them into a timestamped folder in the Data directory

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Define source and destination paths (relative to script location)
FUNCTION_DIR="${SCRIPT_DIR}/../amplify/backend/function"
DATA_DIR="${SCRIPT_DIR}/../../Data"

# Create timestamped folder name
TIMESTAMP=$(date +"%Y-%m-%d_%H-%M-%S")
OUTPUT_DIR="${DATA_DIR}/function-indexes-${TIMESTAMP}"

# Check if function directory exists
if [ ! -d "$FUNCTION_DIR" ]; then
    echo "Error: Function directory not found at $FUNCTION_DIR"
    exit 1
fi

# Create the Data directory if it doesn't exist
if [ ! -d "$DATA_DIR" ]; then
    echo "Creating Data directory at $DATA_DIR"
    mkdir -p "$DATA_DIR"
fi

# Create the output directory
mkdir -p "$OUTPUT_DIR"
echo "Created output directory: $OUTPUT_DIR"

# Counter for copied files
copied=0
skipped=0

# Loop through each folder in the function directory
for func_folder in "$FUNCTION_DIR"/*/; do
    # Get the function name (folder name)
    func_name=$(basename "$func_folder")
    
    # Path to the index.js file
    index_file="${func_folder}src/index.js"
    
    # Check if index.js exists in the src subfolder
    if [ -f "$index_file" ]; then
        # Copy and rename the file
        dest_file="${OUTPUT_DIR}/${func_name}-index.js"
        cp "$index_file" "$dest_file"
        echo "Copied: $func_name/src/index.js -> ${func_name}-index.js"
        ((copied++))
    else
        echo "Skipped: $func_name (no src/index.js found)"
        ((skipped++))
    fi
done

echo ""
echo "Done! Copied $copied files, skipped $skipped folders."
echo "Output location: $OUTPUT_DIR"
