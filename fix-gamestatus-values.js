// fix-gamestatus-values.js
// ES Module version - This script fixes invalid gameStatus values in the ScrapeURL table
// Run with: node fix-gamestatus-values.js

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";

// ⚠️ UPDATE THESE VALUES FOR YOUR ENVIRONMENT
const REGION = "ap-southeast-2";  // Your AWS region
const TABLE_NAME = "ScrapeURL-oi5oitkajrgtzm7feellfluriy-dev";  // Your ScrapeURL table name

const client = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(client);

async function fixGameStatus() {
  console.log("=".repeat(70));
  console.log("  GameStatus Fixer - ScrapeURL Table");
  console.log("=".repeat(70));
  console.log(`\n📋 Configuration:`);
  console.log(`   Region: ${REGION}`);
  console.log(`   Table:  ${TABLE_NAME}\n`);
  console.log("🔍 Scanning ScrapeURL table for invalid gameStatus values...\n");
  
  let scanned = 0;
  let fixed = 0;
  let errors = 0;
  const problematicRecords = [];
  
  try {
    const scanResult = await docClient.send(new ScanCommand({
      TableName: TABLE_NAME,
    }));
    
    scanned = scanResult.Items.length;
    console.log(`📊 Scanned ${scanned} total records\n`);
    
    for (const item of scanResult.Items) {
      // Check for empty string or "NOT_FOUND"
      if (item.gameStatus === "" || item.gameStatus === "NOT_FOUND") {
        const recordInfo = {
          url: item.url,
          tournamentId: item.tournamentId,
          currentValue: item.gameStatus,
          id: item.id
        };
        
        problematicRecords.push(recordInfo);
        
        console.log(`Found problematic record #${problematicRecords.length}:`);
        console.log(`  URL: ${item.url}`);
        console.log(`  Tournament ID: ${item.tournamentId}`);
        console.log(`  Current gameStatus: "${item.gameStatus}"`);
        
        try {
          // Remove the gameStatus attribute (sets to null in DynamoDB)
          await docClient.send(new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { id: item.id },
            UpdateExpression: "REMOVE gameStatus",
          }));
          
          console.log(`  ✅ Fixed - gameStatus set to null\n`);
          fixed++;
        } catch (updateError) {
          console.error(`  ❌ Error updating: ${updateError.message}\n`);
          errors++;
        }
      }
    }
    
    console.log("\n" + "=".repeat(70));
    console.log("  RESULTS");
    console.log("=".repeat(70));
    console.log(`📊 Total records scanned:    ${scanned}`);
    console.log(`❌ Problematic records found: ${problematicRecords.length}`);
    console.log(`✅ Successfully fixed:        ${fixed}`);
    console.log(`⚠️  Errors encountered:       ${errors}`);
    console.log("=".repeat(70));
    
    if (problematicRecords.length > 0) {
      console.log("\n📋 Summary of fixed records:");
      console.log("\nEmpty String Records:");
      const emptyRecords = problematicRecords.filter(r => r.currentValue === "");
      emptyRecords.forEach((r, i) => {
        console.log(`  ${i + 1}. Tournament ID ${r.tournamentId}: ${r.url}`);
      });
      
      console.log("\nInvalid Enum Records:");
      const invalidEnumRecords = problematicRecords.filter(r => r.currentValue === "NOT_FOUND");
      invalidEnumRecords.forEach((r, i) => {
        console.log(`  ${i + 1}. Tournament ID ${r.tournamentId}: ${r.url}`);
      });
    } else {
      console.log("\n✅ No problematic records found - database is clean!");
    }
    
    if (errors === 0 && fixed > 0) {
      console.log("\n🎉 All records fixed successfully!");
      console.log("   Your URL Management tab should now work without errors.");
    } else if (errors > 0) {
      console.log("\n⚠️  Some records could not be fixed. Check the errors above.");
    }
    
  } catch (error) {
    console.error("\n❌ Error scanning table:", error);
    console.error("\nMake sure:");
    console.error("  1. Your AWS credentials are configured");
    console.error("  2. You have permission to access the DynamoDB table");
    console.error("  3. The table name and region are correct");
    process.exit(1);
  }
}

// Confirmation before running
console.log("\n⚠️  WARNING: This script will modify records in your DynamoDB table.");
console.log("⚠️  Region: " + REGION);
console.log("⚠️  Table:  " + TABLE_NAME);
console.log("\nPress Ctrl+C to cancel, or wait 3 seconds to continue...\n");

setTimeout(() => {
  fixGameStatus().then(() => {
    console.log("\n✅ Script completed.");
    process.exit(0);
  }).catch((err) => {
    console.error("\n❌ Script failed:", err.message);
    process.exit(1);
  });
}, 3000);