/**
 * validation/index.js
 * Main validation orchestrator for game data
 */

const { validateRequiredFields, validateEnumFields, validateDateTimeFields } = require('./required-fields');
const { 
  validateNumericFields, 
  validateGuaranteeFields, 
  validateSeriesFields,
  validateEntryConsistency,
  validatePrizepoolFields 
} = require('./business-rules');
const { DEFAULT_GAME_VALUES, GameStatus, GameType, GameVariant } = require('../utils/constants');

// ===================================================================
// AUTO-CORRECTION
// ===================================================================

/**
 * Auto-correct common data issues
 * @param {Object} game - Game data object
 * @returns {Object} { correctedData, corrections }
 */
const autoCorrectData = (game) => {
  const corrections = [];
  const correctedData = { ...game };
  
  // Convert string numbers to actual numbers
  const numericFields = [
    'buyIn', 'rake', 'guaranteeAmount', 'startingStack', 'venueFee',
    'totalEntries', 'totalInitialEntries', 'totalUniquePlayers', 
    'totalRebuys', 'totalAddons', 'playersRemaining',
    'prizepoolPaid', 'prizepoolCalculated'
  ];
  
  for (const field of numericFields) {
    if (typeof correctedData[field] === 'string') {
      const parsed = parseFloat(correctedData[field]);
      if (!isNaN(parsed)) {
        correctedData[field] = parsed;
        corrections.push(`Converted ${field} from string to number`);
      }
    }
  }
  
  // Set default game status if missing
  if (!correctedData.gameStatus) {
    correctedData.gameStatus = DEFAULT_GAME_VALUES.gameStatus;
    corrections.push('Set default game status to SCHEDULED');
  }
  
  // Set default game type if missing
  if (!correctedData.gameType) {
    correctedData.gameType = DEFAULT_GAME_VALUES.gameType;
    corrections.push('Set default game type to TOURNAMENT');
  }
  
  // Set default game variant if missing
  if (!correctedData.gameVariant) {
    correctedData.gameVariant = DEFAULT_GAME_VALUES.gameVariant;
    corrections.push('Set default game variant to NLHE');
  }
  
  // Set hasGuarantee based on guaranteeAmount
  if (correctedData.guaranteeAmount && correctedData.guaranteeAmount > 0 && !correctedData.hasGuarantee) {
    correctedData.hasGuarantee = true;
    corrections.push('Set hasGuarantee to true based on guaranteeAmount');
  }
  
  // Default boolean fields
  if (correctedData.isSeries === undefined) {
    correctedData.isSeries = false;
  }
  if (correctedData.isRegular === undefined) {
    correctedData.isRegular = true;
  }
  if (correctedData.isSatellite === undefined) {
    correctedData.isSatellite = false;
  }
  
  // Default numeric fields to 0 if null
  if (correctedData.totalRebuys === undefined || correctedData.totalRebuys === null) {
    correctedData.totalRebuys = 0;
  }
  if (correctedData.totalAddons === undefined || correctedData.totalAddons === null) {
    correctedData.totalAddons = 0;
  }
  
  return { correctedData, corrections };
};

// ===================================================================
// MAIN VALIDATION FUNCTION
// ===================================================================

/**
 * Validate game data comprehensively
 * @param {Object} game - Game data object
 * @param {string} entityId - Entity ID (required context)
 * @returns {Object} ValidationResult
 */
const validateGameData = (game, entityId) => {
  const allErrors = [];
  const allWarnings = [];
  
  // Validate entityId is provided
  if (!entityId) {
    allErrors.push({
      field: 'entityId',
      message: 'entityId is required',
      code: 'REQUIRED_FIELD_MISSING'
    });
  }
  
  // Auto-correct data first
  const { correctedData, corrections } = autoCorrectData(game);
  
  // Add corrections as warnings
  for (const correction of corrections) {
    allWarnings.push({
      field: '_autocorrect',
      message: correction,
      code: 'AUTO_CORRECTED'
    });
  }
  
  // Run all validators
  const validators = [
    validateRequiredFields,
    validateEnumFields,
    validateDateTimeFields,
    validateNumericFields,
    validateGuaranteeFields,
    validateSeriesFields,
    validateEntryConsistency,
    validatePrizepoolFields
  ];
  
  for (const validator of validators) {
    const { errors, warnings } = validator(correctedData);
    allErrors.push(...errors);
    allWarnings.push(...warnings);
  }
  
  return {
    isValid: allErrors.length === 0,
    errors: allErrors,
    warnings: allWarnings,
    correctedData
  };
};

/**
 * Quick validation for minimal checks (used in options.validateOnly mode)
 * @param {Object} game - Game data object
 * @returns {Object} { isValid, errors }
 */
const quickValidate = (game) => {
  const errors = [];
  
  if (!game.name || (typeof game.name === 'string' && game.name.trim() === '')) {
    errors.push({
      field: 'name',
      message: 'name is required',
      code: 'REQUIRED_FIELD_MISSING'
    });
  }
  
  if (!game.gameStartDateTime) {
    errors.push({
      field: 'gameStartDateTime',
      message: 'gameStartDateTime is required',
      code: 'REQUIRED_FIELD_MISSING'
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  validateGameData,
  quickValidate,
  autoCorrectData
};
