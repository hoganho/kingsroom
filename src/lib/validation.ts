import { structureManifest, StructureExpectations } from './structureManifest';

// Define a clear return type for our validation result
export interface ValidationResult {
  profile?: StructureExpectations;
  status: 'VALID' | 'MISSING_EXPECTED' | 'UNPROFILED';
  missingExpectedFields: string[];
  missingOptionalFields: string[];
}

export function validateStructure(
  structureLabel: string,
  foundKeys: string[]
): ValidationResult {
  
  const profile = structureManifest[structureLabel];

  // Case 1: The structure is unknown or "un-profiled"
  if (!profile) {
    return {
      status: 'UNPROFILED',
      missingExpectedFields: [],
      missingOptionalFields: []
    };
  }

  // Use a Set for efficient lookups
  const foundKeysSet = new Set(foundKeys);

  // Case 2: The structure is known, so we check for missing fields
  const missingExpectedFields = profile.expectedFields.filter(
    key => !foundKeysSet.has(key)
  );

  const missingOptionalFields = profile.optionalFields.filter(
    key => !foundKeysSet.has(key)
  );
  
  return {
    profile,
    status: missingExpectedFields.length > 0 ? 'MISSING_EXPECTED' : 'VALID',
    missingExpectedFields,
    missingOptionalFields
  };
}