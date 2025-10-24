export interface StructureExpectations {
  description: string;
  expectedFields: string[]; // Fields that MUST be present
  optionalFields: string[]; // Fields that are nice to have
}

export const structureManifest: Record<string, StructureExpectations> = {

  "STATUS: COMPLETED | REG: CLOSED": {
    description: "A standard completed tournament with results.",
    expectedFields: [
      "name",
      "gameStartDateTime",
      "status",
      "registrationStatus",
      "prizepool",
      "totalEntries",
      "buyIn",
      "results",
      "levels"
    ],
    optionalFields: [
      "totalRebuys",
      "totalAddons",
      "totalDuration",
      "gameEndDateTime",
      "startingStack"
    ]
  },
  
  "STATUS: RUNNING | REG: CLOSED": {
    description: "A game currently in progress.",
    expectedFields: [
      "name",
      "gameStartDateTime",
      "status",
      "registrationStatus",
      "prizepool",
      "totalEntries",
      "buyIn",
      "levels"
    ],
    optionalFields: [
      "totalRebuys",
      "totalAddons",
      "startingStack",
      "results"
    ]
  },

  "STATUS: SCHEDULED | REG: OPEN": {
    description: "A future game, registration is open.",
    expectedFields: [
      "name",
      "gameStartDateTime",
      "status",
      "registrationStatus",
      "buyIn",
      "startingStack",
      "levels"
    ],
    optionalFields: [
      "hasGuarantee",
      "guaranteeAmount",
      "prizepool",
      "totalEntries"
    ]
  }

};