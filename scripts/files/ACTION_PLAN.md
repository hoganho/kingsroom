# ACTION PLAN - Fix Data Source Issues

## Issue Summary
Your override is finding the API ID but not the data sources. Here's how to fix it:

## Files Created for You

### 1. Diagnostic Tool
- **[override-diagnostic.ts](override-diagnostic.ts)** - Run this FIRST to understand your stack structure

### 2. Override Solutions (choose ONE)
- **[override-simple.ts](override-simple.ts)** - Simplest approach, try this first
- **[override-fixed-datasources.ts](override-fixed-datasources.ts)** - Comprehensive with fallbacks
- **[override-complete.ts](override-complete.ts)** - Original with fixes

### 3. Required Schema Changes
- **[schema-extension.graphql](schema-extension.graphql)** - MUST add to your schema

### 4. Documentation
- **[INSTRUCTIONS.md](INSTRUCTIONS.md)** - Detailed instructions
- **[SOLUTION.md](SOLUTION.md)** - Complete solution guide
- **[example-queries.tsx](example-queries.tsx)** - How to use after fixing

## Quick Fix Steps

### Step 1: Diagnose (2 minutes)
```bash
# Replace your override.ts with override-diagnostic.ts
cp override-diagnostic.ts amplify/backend/api/kingsroom/override.ts

# Run push to see diagnostic output
amplify push

# Save the console output!
```

### Step 2: Apply Fix (5 minutes)
```bash
# Try the simple solution first
cp override-simple.ts amplify/backend/api/kingsroom/override.ts

# Add schema extensions to END of your schema.graphql
cat schema-extension.graphql >> amplify/backend/api/kingsroom/schema.graphql
```

### Step 3: Update Auth (1 minute)
Edit the schema extensions you just added. Change the auth directives to match your setup:
- Using API Key? Keep `@aws_api_key`
- Using Cognito? Change to `@aws_cognito_user_pools`
- Remove directives you don't use

### Step 4: Deploy (10 minutes)
```bash
amplify push
```

## If Simple Solution Doesn't Work

Use the diagnostic output from Step 1 to understand your stack, then:

1. Try `override-fixed-datasources.ts` instead - it has more fallback options
2. Look for error messages about missing data sources
3. Check if data source names in the logs match expected patterns

## Success Criteria

You'll know it's working when:
1. No "Cannot query field 'total'" errors
2. No "Data source not found" warnings
3. Your queries return a `total` field with the count

## Testing

After successful deployment, test with:
```javascript
const result = await API.graphql(graphqlOperation(
  `query {
    listPlayers(limit: 5) {
      items { id }
      total  # This should work!
    }
  }`
));
console.log(`Total players: ${result.data.listPlayers.total}`);
```

## Need Help?

If still having issues, share:
1. Output from the diagnostic override
2. Any error messages
3. Your Amplify CLI version (`amplify --version`)

Good luck! 🚀