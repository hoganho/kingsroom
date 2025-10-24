// ✅ 1. Import the baseExpectations object.
import { structureManifest, baseExpectations, StructureExpectations } from './structureManifest';

// ✅ 2. Update the return type to include separated lists of missing fields.
export interface ValidationResult {
  profile?: StructureExpectations;
  baseProfile: StructureExpectations; // Always include base for reference
  status: 'VALID' | 'MISSING_EXPECTED' | 'UNPROFILED';
  missingExpectedFields: string[]; // Combined total missing
  missingOptionalFields: string[]; // Combined total optional missing
  missingBaseExpectedFields: string[]; // Base fields missing
  missingProfileExpectedFields: string[]; // Profile-specific fields missing
}

export function validateStructure(
  structureLabel: string,
  foundKeys: string[]
): ValidationResult {
  
  const profile = structureManifest[structureLabel];

  if (!profile) {
    return {
      status: 'UNPROFILED',
      baseProfile: baseExpectations,
      missingExpectedFields: [],
      missingOptionalFields: [],
      missingBaseExpectedFields: [],
      missingProfileExpectedFields: [],
    };
  }

  const foundKeysSet = new Set(foundKeys);

  // ✅ 3. Validate base and profile fields separately.
  const missingBaseExpectedFields = baseExpectations.expectedFields.filter(
    key => !foundKeysSet.has(key)
  );

  const missingProfileExpectedFields = profile.expectedFields.filter(
    key => !foundKeysSet.has(key)
  );

  const missingOptionalFields = [...baseExpectations.optionalFields, ...profile.optionalFields].filter(
    key => !foundKeysSet.has(key)
  );
  
  // Combine for the overall status check
  const allMissingExpected = [...missingBaseExpectedFields, ...missingProfileExpectedFields];
  
  return {
    profile,
    baseProfile: baseExpectations,
    status: allMissingExpected.length > 0 ? 'MISSING_EXPECTED' : 'VALID',
    missingExpectedFields: allMissingExpected,
    missingOptionalFields,
    missingBaseExpectedFields, // Return the separated list
    missingProfileExpectedFields, // Return the separated list
  };
}