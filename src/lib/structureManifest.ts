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
    "gameStartDateTime",
    "status",
    "registrationStatus",
    "buyIn",
    "levels"
  ],
  optionalFields: [
    "startingStack"
  ]
};

// ✅ 2. Update the manifest to only list the fields *in addition* to the baseline.
export const structureManifest: Record<string, StructureExpectations> = {

  "STATUS: COMPLETED | REG: CLOSED": {
    description: "A standard completed tournament with results.",
    expectedFields: [
      "prizepool",
      "totalEntries",
      "results"
    ],
    optionalFields: [
      "totalRebuys",
      "totalAddons",
      "totalDuration",
      "gameEndDateTime"
    ]
  },
  
  "STATUS: RUNNING | REG: CLOSED": {
    description: "A game currently in progress.",
    expectedFields: [
      "prizepool",
      "totalEntries"
    ],
    optionalFields: [
      "totalRebuys",
      "totalAddons",
      "results" // Results are optional while the game is running
    ]
  },

  "STATUS: SCHEDULED | REG: OPEN": {
    description: "A future game, registration is open.",
    expectedFields: [], // No additional expected fields beyond the baseline
    optionalFields: [
      "hasGuarantee",
      "guaranteeAmount",
      "prizepool", // Prizepool may not exist until it starts
      "totalEntries"
    ]
  }

};