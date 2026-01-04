#!/bin/bash
# ===================================================================
# Backfill ActiveGame & RecentlyFinishedGame Tables
# ===================================================================
#
# USAGE:
#   ./run-backfill.sh [--dry-run] [--active-only] [--finished-only]
#
# SETUP:
#   1. Update the TABLE NAMES section below with your actual table names
#   2. Make executable: chmod +x run-backfill.sh
#   3. Run: ./run-backfill.sh --dry-run
#
# ===================================================================

# ===================================================================
# TABLE NAMES - UPDATE THESE!
# ===================================================================
# Find your table names with:
#   aws dynamodb list-tables --query "TableNames[?contains(@, 'Game')]"

export GAME_TABLE_NAME="Game-ht3nugt6lvddpeeuwj3x6mkite-dev"
export ACTIVEGAME_TABLE_NAME="ActiveGame-ht3nugt6lvddpeeuwj3x6mkite-dev"
export RECENTLYFINISHED_TABLE_NAME="RecentlyFinishedGame-ht3nugt6lvddpeeuwj3x6mkite-dev"
export VENUE_TABLE_NAME="Venue-ht3nugt6lvddpeeuwj3x6mkite-dev"
export ENTITY_TABLE_NAME="Entity-ht3nugt6lvddpeeuwj3x6mkite-dev"

# ===================================================================
# AWS CONFIGURATION
# ===================================================================
export AWS_REGION="ap-southeast-2"
# export AWS_PROFILE="your-profile"  # Uncomment if using named profile

# ===================================================================
# RUN SCRIPT
# ===================================================================

echo "Running backfill with tables:"
echo "  Game: $GAME_TABLE_NAME"
echo "  ActiveGame: $ACTIVEGAME_TABLE_NAME"
echo "  RecentlyFinished: $RECENTLYFINISHED_TABLE_NAME"
echo ""

node backfill-active-games.cjs "$@"
