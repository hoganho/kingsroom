// lib/validation.ts

import { fieldManifest } from './fieldManifest';

export interface ValidationResult {
  status: 'VALID' | 'MISSING_EXPECTED' | 'UNPROFILED';
  missingBaseExpectedFields: string[];
  missingProfileExpectedFields: string[];
  missingOptionalFields: string[];
}

// Helper to check if a structure label is recognized by the manifest.
// This is important for the 'UNPROFILED' status.
const doesProfileExist = (structureLabel: string): boolean => {
    // A profile is considered to exist if it's explicitly mentioned in any field's
    // isProfileExpected or isProfileOptional arrays.
    for (const key in fieldManifest) {
        if (fieldManifest[key].isProfileExpected?.includes(structureLabel) ||
            fieldManifest[key].isProfileOptional?.includes(structureLabel)) {
            return true;
        }
    }
    // Also, treat baseline-only profiles as existing.
    // Example: "STATUS: SCHEDULED | REG: OPEN" has no specific profile expectations but is valid.
    if (structureLabel === "STATUS: SCHEDULED | REG: OPEN") {
        return true;
    }
    return false;
};

export function validateStructure(
  structureLabel: string,
  foundKeys: string[]
): ValidationResult {
  
  if (!doesProfileExist(structureLabel)) {
    return {
      status: 'UNPROFILED',
      missingBaseExpectedFields: [],
      missingProfileExpectedFields: [],
      missingOptionalFields: [],
    };
  }

  const foundKeysSet = new Set(foundKeys);
  const missingBaseExpectedFields: string[] = [];
  const missingProfileExpectedFields: string[] = [];
  const missingOptionalFields: string[] = [];

  // Iterate through the single source of truth to check all fields
  for (const fieldName in fieldManifest) {
      const fieldDef = fieldManifest[fieldName];
      const isFound = foundKeysSet.has(fieldName);

      if (!isFound) {
          if (fieldDef.isBaselineExpected) {
              missingBaseExpectedFields.push(fieldName);
          } else if (fieldDef.isProfileExpected?.includes(structureLabel)) {
              missingProfileExpectedFields.push(fieldName);
          } else if (fieldDef.isBaselineOptional || fieldDef.isProfileOptional?.includes(structureLabel)) {
              missingOptionalFields.push(fieldName);
          }
      }
  }
  
  const hasMissingFields = missingBaseExpectedFields.length > 0 || missingProfileExpectedFields.length > 0;
  
  return {
    status: hasMissingFields ? 'MISSING_EXPECTED' : 'VALID',
    missingBaseExpectedFields,
    missingProfileExpectedFields,
    missingOptionalFields,
  };
}