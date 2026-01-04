#!/bin/bash
# ===================================================================
# Find DynamoDB Table Names for Backfill Script
# ===================================================================
#
# Run this to get the exact table names for your environment
#
# ===================================================================

echo "Finding DynamoDB table names..."
echo ""

# Set region
REGION=${AWS_REGION:-ap-southeast-2}

echo "Region: $REGION"
echo ""

echo "=== Game Table ==="
aws dynamodb list-tables --region $REGION --query "TableNames[?contains(@, 'Game-') && !contains(@, 'Active') && !contains(@, 'Recently') && !contains(@, 'Upcoming') && !contains(@, 'Recurring')]" --output text

echo ""
echo "=== ActiveGame Table ==="
aws dynamodb list-tables --region $REGION --query "TableNames[?contains(@, 'ActiveGame-')]" --output text

echo ""
echo "=== RecentlyFinishedGame Table ==="
aws dynamodb list-tables --region $REGION --query "TableNames[?contains(@, 'RecentlyFinishedGame-')]" --output text

echo ""
echo "=== Venue Table ==="
aws dynamodb list-tables --region $REGION --query "TableNames[?contains(@, 'Venue-')]" --output text

echo ""
echo "=== Entity Table ==="
aws dynamodb list-tables --region $REGION --query "TableNames[?contains(@, 'Entity-')]" --output text

echo ""
echo "=== Copy these into run-backfill.sh ==="
