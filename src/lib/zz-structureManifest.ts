// structureManifest.ts
 
export interface StructureExpectations {
  description: string;
  expectedFields: string[]; // Fields that MUST be present
  optionalFields: string[]; // Fields that are nice to have
}

// ✅ 1. Define the baseline fields that all structures should have.
export const baseExpectations: StructureExpectations = {
  description: "Baseline fields for any game structure.",
  expectedFields: [
    "name",
    "gameVariant",
    "gameStartDateTime",
    "hasGuarantee",
    "status",
    "registrationStatus", // Added
    "totalEntries",
    "prizepoolPaid",
    "prizepoolCalculated",
    "buyIn",
    "startingStack",
    "levels",
    // These are often 0, so they are better as optional
    // "totalRebuys", 
    // "totalAddons",
    // "totalDuration",
    // "entries",
],
  optionalFields: [
    "results",
    "gameTags",
    "guaranteeAmount",
    "seriesName", // Added
    "totalRebuys", // Moved to optional
    "totalAddons", // Moved to optional
    "totalDuration", // Moved to optional
    "entries", // Moved to optional
    "seating", // Added
    "rawHtml", // It's good to track this
]
};

// ✅ 2. Update the manifest to only list the fields *in addition* to the baseline.
export const structureManifest: Record<string, StructureExpectations> = {
  
  "STATUS: SCHEDULED | REG: OPEN": {
    description: "A future game, registration is open.",
    expectedFields: [], 
    optionalFields: []
  },

  "STATUS: RUNNING | REG: CLOSED": {
    description: "A game currently in progress.",
    expectedFields: [
        "seating", // Seating is critical for a running game
        "playersRemaining", // This is derived from entries, but good to expect
    ],
    optionalFields: [
      "results" // Results are optional while the game is running
    ]
  },

  "STATUS: COMPLETED | REG: CLOSED": {
    description: "A standard completed tournament with results.",
    expectedFields: [
        "results",
        "gameEndDateTime"
    ],
    optionalFields: []
  },
};