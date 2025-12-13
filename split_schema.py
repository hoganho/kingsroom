import re
import os

# === CONFIGURATION ===
SOURCE_FILE = 'amplify/backend/api/kingsroom/schema.graphql' # Adjust path if needed
OUTPUT_DIR = 'amplify/backend/api/kingsroom/schema'

# Content to add to the Game type
GAME_ADDITIONS = """
  # === RECURRING GAME RELATIONSHIP (NEW) ===
  # Link to the canonical recurring game (if this is a regular game instance)
  recurringGameId: ID 
    @index(name: "byRecurringGame", sortKeyFields: ["gameStartDateTime"])
  recurringGame: RecurringGame @belongsTo(fields: ["recurringGameId"])
  
  # === RECURRING GAME ASSIGNMENT (NEW) ===
  recurringGameAssignmentConfidence: Float
  recurringGameAssignmentStatus: RecurringGameAssignmentStatus 
    @default(value: "PENDING_ASSIGNMENT")
  
  # === SCHEDULE TRACKING (NEW) ===
  wasScheduledInstance: Boolean @default(value: "false")
  deviationNotes: String
  
  # === INSTANCE METADATA (NEW) ===
  instanceNumber: Int 
  isReplacementInstance: Boolean @default(value: "false")
  replacementReason: String
"""

# Regex mappings to sort types into files
# Order matters: more specific matches should come before generic ones
FILE_MAPPINGS = {
    "10-entities.graphql": [
        r"^type Entity\b", 
        r"^type BackgroundTask\b"
    ],
    "20-venues.graphql": [
        r"^type Venue\b", 
        r"^type VenueDetails\b",
        r"^type VenueMetricsResult\b", 
        r"^type VenueMetricsPreview\b",
        r"^input RecalculateVenueDetails"
    ],
    "30-games.graphql": [
        r"^type Game\b", 
        r"^type GameCost",
        r"^type GameFinancialSnapshot",
        r"^type TournamentStructure",
        r"^type TournamentLevelData",
        r"^type CashStructure",
        r"^type RakeStructure",
        r"^type Consolidation",
        r"^input SaveGame",
        r"^input GamePreview"
    ],
    "40-tournaments.graphql": [
        r"^type TournamentSeries"
    ],
    "50-players.graphql": [
        r"^type Player", 
        r"^type KnownPlayerIdentity",
        r"^type Ticket", 
        r"^type MarketingMessage",
        r"^type PlayerMarketing"
    ],
    "60-financials.graphql": [
        r"^type CostItem",
        r"^type GameCostLineItem"
    ],
    "80-scrapers.graphql": [
        r"^type Scraper", 
        r"^type Scrape", 
        r"^type S3", 
        r"^type DataSync", 
        r"^input Scrape", 
        r"^input SaveTournament", 
        r"^type Gap", 
        r"^type CachingStats"
    ],
    "85-social.graphql": [
        r"^type Social", 
        r"^input Social", 
        r"^input AddSocial", 
        r"^input UpdateSocial", 
        r"^input SchedulePost"
    ],
    "90-staff.graphql": [
        r"^type User", 
        r"^type Staff", 
        r"^type Asset", 
        r"^input CreateUser", 
        r"^input UpdateUser"
    ],
    # Catch-all for Mutations, Queries, Subscriptions
    "99-mutations.graphql": [
        r"^type Query", 
        r"^type Mutation", 
        r"^type Subscription",
        r"^type .*Response", # Generic responses
        r"^type .*Connection" # Connection types
    ]
}

def split_schema():
    if not os.path.exists(OUTPUT_DIR):
        os.makedirs(OUTPUT_DIR)
        print(f"Created directory: {OUTPUT_DIR}")

    try:
        with open(SOURCE_FILE, 'r') as f:
            content = f.read()
    except FileNotFoundError:
        print(f"Error: Could not find {SOURCE_FILE}")
        print("Please ensure you are in the project root or update SOURCE_FILE path.")
        return

    # Split schema by definitions (naive split by double newline or comments)
    # This regex splits before keywords that start a definition
    # It attempts to keep comments attached to the definition
    pattern = r'(?=\n(?:#.*\n)*\s*(?:type|input|enum|interface|union|scalar)\s+\w+)'
    blocks = re.split(pattern, content)

    files_content = {k: [] for k in FILE_MAPPINGS.keys()}
    files_content["00-enums.graphql"] = [] # Placeholder, will be ignored/overwritten by user

    print(f"Found {len(blocks)} blocks to process.")

    for block in blocks:
        block = block.strip()
        if not block: 
            continue

        # Skip Enums (User has a provided file)
        if block.startswith("enum "):
            continue

        assigned = False
        
        # Check against mappings
        for filename, patterns in FILE_MAPPINGS.items():
            for pat in patterns:
                if re.search(pat, block):
                    # SPECIAL HANDLING: Patch Game type
                    if "type Game @model" in block and filename == "30-games.graphql":
                        print("  >> Found Game type. Patching with new fields...")
                        # Find the last closing brace
                        last_brace_idx = block.rfind('}')
                        if last_brace_idx != -1:
                            block = block[:last_brace_idx] + GAME_ADDITIONS + block[last_brace_idx:]
                    
                    files_content[filename].append(block)
                    assigned = True
                    break
            if assigned: break
        
        # If not assigned, dump into mutations/misc or log warning
        if not assigned:
            # Simple heuristic for unassigned types
            if "Game" in block: files_content["30-games.graphql"].append(block)
            elif "Player" in block: files_content["50-players.graphql"].append(block)
            elif "Venue" in block: files_content["20-venues.graphql"].append(block)
            else: files_content["99-mutations.graphql"].append(block)

    # Write files
    for filename, blocks in files_content.items():
        if filename == "00-enums.graphql": continue # Don't overwrite the provided file
        
        full_path = os.path.join(OUTPUT_DIR, filename)
        with open(full_path, 'w') as f:
            f.write(f"# {filename}\n")
            f.write("# ==========================================\n\n")
            f.write("\n\n".join(blocks))
        print(f"✅ Wrote {len(blocks)} blocks to {filename}")

    print("\n--- SPLIT COMPLETE ---")
    print(f"1. Check {OUTPUT_DIR} for the generated files.")
    print("2. IMPORTANT: Copy your PROVIDED files (00-enums, 31-recurring, 70-metrics) into this directory now.")
    print("3. Run 'amplify push' to deploy.")

if __name__ == "__main__":
    split_schema()