#!/bin/bash
# scripts/seed-admin-user.sh
# 
# Quick setup script using AWS CLI
# Make sure you have AWS CLI installed and configured
#
# Usage: ./seed-admin-user.sh

set -e

# ============================================================================
# CONFIGURATION - UPDATE THESE VALUES
# ============================================================================

REGION="ap-southeast-2"
USER_POOL_ID="ap-southeast-2_IcBzZnaV6"

# Your DynamoDB User table name (find in AWS Console -> DynamoDB -> Tables)
# Usually: User-{randomId}-{env}
USER_TABLE_NAME="User-sjyzke3u45golhnttlco6bpcua-dev"  # <-- UPDATE THIS!

# Your admin user details
ADMIN_EMAIL="hogan.ho@gmail.com"  # <-- UPDATE THIS!
ADMIN_USERNAME="GTOMG-admin"
ADMIN_FIRST_NAME="Hogan"
ADMIN_LAST_NAME="Ho"
TEMP_PASSWORD="TempPass123!"

# ============================================================================
# COLORS
# ============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo ""
echo "========================================"
echo "🚀 Kingsroom User Seed Script (Bash)"
echo "========================================"
echo ""

# ============================================================================
# STEP 1: Create Cognito Groups
# ============================================================================

echo "📁 Creating Cognito groups..."
echo ""

create_group() {
    local GROUP_NAME=$1
    local DESCRIPTION=$2
    
    if aws cognito-idp get-group --user-pool-id "$USER_POOL_ID" --group-name "$GROUP_NAME" --region "$REGION" 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC} Group \"$GROUP_NAME\" already exists"
    else
        aws cognito-idp create-group \
            --user-pool-id "$USER_POOL_ID" \
            --group-name "$GROUP_NAME" \
            --description "$DESCRIPTION" \
            --region "$REGION" > /dev/null
        echo -e "  ${GREEN}✓${NC} Created group \"$GROUP_NAME\""
    fi
}

create_group "SuperAdmin" "Full system access including user management"
create_group "Admin" "Manage venues, series, and most settings"
create_group "VenueManager" "Manage specific venues and their games"
create_group "TournamentDirector" "Run tournaments and manage game operations"
create_group "Marketing" "Access to player data and social features"

# ============================================================================
# STEP 2: Delete existing users from DynamoDB
# ============================================================================

echo ""
echo "🗑️  Clearing existing User table records..."
echo ""

# Scan and delete all items from User table
ITEMS=$(aws dynamodb scan \
    --table-name "$USER_TABLE_NAME" \
    --projection-expression "id" \
    --region "$REGION" \
    --output json 2>/dev/null || echo '{"Items":[]}')

if [ "$ITEMS" = '{"Items":[]}' ] || [ "$(echo "$ITEMS" | jq '.Items | length')" = "0" ]; then
    echo -e "  ${GREEN}✓${NC} User table is already empty"
else
    echo "$ITEMS" | jq -r '.Items[].id.S' | while read -r ID; do
        aws dynamodb delete-item \
            --table-name "$USER_TABLE_NAME" \
            --key "{\"id\": {\"S\": \"$ID\"}}" \
            --region "$REGION"
        echo -e "  ${GREEN}✓${NC} Deleted user: $ID"
    done
fi

# ============================================================================
# STEP 3: Create Cognito User
# ============================================================================

echo ""
echo "👤 Creating Cognito user..."
echo ""

# Check if user exists
if aws cognito-idp admin-get-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$ADMIN_EMAIL" \
    --region "$REGION" 2>/dev/null; then
    echo -e "  ${GREEN}✓${NC} User \"$ADMIN_EMAIL\" already exists in Cognito"
else
    # Create user
    aws cognito-idp admin-create-user \
        --user-pool-id "$USER_POOL_ID" \
        --username "$ADMIN_EMAIL" \
        --user-attributes \
            Name=email,Value="$ADMIN_EMAIL" \
            Name=email_verified,Value=true \
            Name=given_name,Value="$ADMIN_FIRST_NAME" \
            Name=family_name,Value="$ADMIN_LAST_NAME" \
        --temporary-password "$TEMP_PASSWORD" \
        --message-action SUPPRESS \
        --region "$REGION" > /dev/null
    echo -e "  ${GREEN}✓${NC} Created user \"$ADMIN_EMAIL\""
fi

# Add to SuperAdmin group
aws cognito-idp admin-add-user-to-group \
    --user-pool-id "$USER_POOL_ID" \
    --username "$ADMIN_EMAIL" \
    --group-name "SuperAdmin" \
    --region "$REGION"
echo -e "  ${GREEN}✓${NC} Added user to \"SuperAdmin\" group"

# Get the user's sub (Cognito user ID)
COGNITO_SUB=$(aws cognito-idp admin-get-user \
    --user-pool-id "$USER_POOL_ID" \
    --username "$ADMIN_EMAIL" \
    --region "$REGION" \
    --query "UserAttributes[?Name=='sub'].Value" \
    --output text)

echo -e "  ${GREEN}✓${NC} Cognito user ID (sub): $COGNITO_SUB"

# ============================================================================
# STEP 4: Create DynamoDB User Record
# ============================================================================

echo ""
echo "💾 Creating DynamoDB User record..."
echo ""

NOW=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")

aws dynamodb put-item \
    --table-name "$USER_TABLE_NAME" \
    --item "{
        \"id\": {\"S\": \"$COGNITO_SUB\"},
        \"username\": {\"S\": \"$ADMIN_USERNAME\"},
        \"email\": {\"S\": \"$ADMIN_EMAIL\"},
        \"role\": {\"S\": \"SUPER_ADMIN\"},
        \"isActive\": {\"BOOL\": true},
        \"firstName\": {\"S\": \"$ADMIN_FIRST_NAME\"},
        \"lastName\": {\"S\": \"$ADMIN_LAST_NAME\"},
        \"mustChangePassword\": {\"BOOL\": true},
        \"loginAttempts\": {\"N\": \"0\"},
        \"createdAt\": {\"S\": \"$NOW\"},
        \"updatedAt\": {\"S\": \"$NOW\"},
        \"createdBy\": {\"S\": \"seed-script\"},
        \"updatedBy\": {\"S\": \"seed-script\"},
        \"__typename\": {\"S\": \"User\"}
    }" \
    --region "$REGION"

echo -e "  ${GREEN}✓${NC} Created User record"
echo "       - ID: $COGNITO_SUB"
echo "       - Email: $ADMIN_EMAIL"
echo "       - Role: SUPER_ADMIN"

# ============================================================================
# DONE
# ============================================================================

echo ""
echo "========================================"
echo -e "${GREEN}✅ SUCCESS! User setup complete.${NC}"
echo "========================================"
echo ""
echo "📝 Next steps:"
echo "   1. Log in with: $ADMIN_EMAIL"
echo "   2. Temporary password: $TEMP_PASSWORD"
echo "   3. You will be prompted to set a new password"
echo ""
