#!/bin/bash

# TypeScript Compilation Fix Script
# This script fixes all TypeScript compilation errors

echo "🔧 Fixing TypeScript compilation errors..."
echo ""

# Backup files first
echo "📦 Creating backups..."
cp src/hooks/useGameTracker.ts src/hooks/useGameTracker.ts.backup 2>/dev/null
cp src/hooks/useURLManagement.ts src/hooks/useURLManagement.ts.backup 2>/dev/null
cp src/pages/scraper-admin-tabs/SingleScraperTab.tsx src/pages/scraper-admin-tabs/SingleScraperTab.tsx.backup 2>/dev/null

# Fix 1: useGameTracker.ts - Add explicit type for knowledgeInfo (line 258)
echo "✅ Fix 1: Adding type for knowledgeInfo in useGameTracker.ts..."
perl -i -pe 's/let knowledgeInfo = null;/let knowledgeInfo: { id: string; lastInteractionType: string; [key: string]: any; } | null = null;/' src/hooks/useGameTracker.ts

# Fix 2: useURLManagement.ts - Fix URLInteractionType import
echo "✅ Fix 2: Fixing URLInteractionType in useURLManagement.ts..."

# First, remove URLInteractionType from the import
perl -i -pe 's/URLInteractionType,\s*\n//' src/hooks/useURLManagement.ts
perl -i -pe 's/,\s*URLInteractionType//' src/hooks/useURLManagement.ts

# Add the URLInteractionType enum definition after the client declaration
perl -i -pe 'if (/^const client = generateClient\(\);$/) {
    print;
    print "\n";
    print "// Define the enum locally since it'\''s not generated in API.ts\n";
    print "export enum URLInteractionType {\n";
    print "    SCRAPED_WITH_HTML = '\''SCRAPED_WITH_HTML'\'',\n";
    print "    SCRAPED_NOT_PUBLISHED = '\''SCRAPED_NOT_PUBLISHED'\'',\n";
    print "    SCRAPED_NOT_IN_USE = '\''SCRAPED_NOT_IN_USE'\'',\n";
    print "    SCRAPED_ERROR = '\''SCRAPED_ERROR'\'',\n";
    print "    MANUAL_UPLOAD = '\''MANUAL_UPLOAD'\'',\n";
    print "    NEVER_CHECKED = '\''NEVER_CHECKED'\''\n";
    print "}\n";
    $_ = "";
}' src/hooks/useURLManagement.ts

# Fix 3: useURLManagement.ts - Fix unused setStatistics (line 79)
echo "✅ Fix 3: Fixing unused setStatistics..."
perl -i -pe 's/const \[statistics, setStatistics\]/const [statistics, _setStatistics]/' src/hooks/useURLManagement.ts

# Fix 4: SingleScraperTab.tsx - Remove unused trackedIds (line 36)
echo "✅ Fix 4: Removing unused trackedIds..."
perl -i -pe 's/.*const \[trackedIds, setTrackedIds\] = useState<Set<string>>\(new Set\(\)\);.*\n//' src/pages/scraper-admin-tabs/SingleScraperTab.tsx

# Fix 5: SingleScraperTab.tsx - Remove unused gameIdNumber (line 537)
echo "✅ Fix 5: Removing unused gameIdNumber..."
perl -i -pe 's/.*const gameIdNumber = pathMatch \? pathMatch\[1\] : null;.*\n//' src/pages/scraper-admin-tabs/SingleScraperTab.tsx

echo ""
echo "✨ All fixes applied!"
echo ""
echo "🔍 Testing TypeScript compilation..."
tsc -b --noEmit

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ TypeScript compilation successful!"
    echo ""
    echo "🎉 All TypeScript errors have been fixed!"
    echo ""
    echo "📝 Backup files created with .backup extension"
else
    echo ""
    echo "⚠️  Some TypeScript errors may remain. Please check the output above."
fi
