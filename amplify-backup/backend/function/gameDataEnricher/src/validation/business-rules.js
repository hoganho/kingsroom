/**
 * business-rules.js
 * Business logic validation for game data
 */

const { VALIDATION_THRESHOLDS } = require('../utils/constants');

// ===================================================================
// NUMERIC VALIDATION
// ===================================================================

/**
 * Validate numeric ranges and relationships
 * @param {Object} game - Game data object
 * @returns {Object} { errors: [], warnings: [] }
 */
const validateNumericFields = (game) => {
  const errors = [];
  const warnings = [];
  
  // Buy-in validation
  if (game.buyIn !== undefined && game.buyIn !== null) {
    if (game.buyIn < VALIDATION_THRESHOLDS.MIN_BUY_IN) {
      errors.push({
        field: 'buyIn',
        message: 'Buy-in cannot be negative',
        code: 'NEGATIVE_VALUE'
      });
    }
    if (game.buyIn > VALIDATION_THRESHOLDS.MAX_BUY_IN) {
      warnings.push({
        field: 'buyIn',
        message: `Buy-in ${game.buyIn} is unusually high`,
        code: 'UNUSUALLY_HIGH'
      });
    }
  }
  
  // Rake validation
  if (game.rake !== undefined && game.rake !== null) {
    if (game.rake < VALIDATION_THRESHOLDS.MIN_RAKE) {
      errors.push({
        field: 'rake',
        message: 'Rake cannot be negative',
        code: 'NEGATIVE_VALUE'
      });
    }
    
    // Rake should not exceed buy-in
    if (game.buyIn && game.rake > game.buyIn) {
      warnings.push({
        field: 'rake',
        message: 'Rake is greater than buy-in - please verify',
        code: 'RAKE_EXCEEDS_BUYIN'
      });
    }
    
    // Rake should not be more than 50% of buy-in
    if (game.buyIn && game.rake > game.buyIn * VALIDATION_THRESHOLDS.MAX_RAKE_PERCENTAGE) {
      warnings.push({
        field: 'rake',
        message: `Rake (${game.rake}) is more than 50% of buy-in (${game.buyIn})`,
        code: 'HIGH_RAKE_PERCENTAGE'
      });
    }
  }
  
  // Entries validation
  const entryFields = ['totalEntries', 'totalInitialEntries', 'totalUniquePlayers', 'totalRebuys', 'totalAddons'];
  for (const field of entryFields) {
    if (game[field] !== undefined && game[field] !== null) {
      if (game[field] < VALIDATION_THRESHOLDS.MIN_ENTRIES) {
        errors.push({
          field,
          message: `${field} cannot be negative`,
          code: 'NEGATIVE_VALUE'
        });
      }
      if (game[field] > VALIDATION_THRESHOLDS.MAX_ENTRIES) {
        warnings.push({
          field,
          message: `${field} (${game[field]}) is unusually high`,
          code: 'UNUSUALLY_HIGH'
        });
      }
    }
  }
  
  // Guarantee validation
  if (game.guaranteeAmount !== undefined && game.guaranteeAmount !== null) {
    if (game.guaranteeAmount < VALIDATION_THRESHOLDS.MIN_GUARANTEE) {
      errors.push({
        field: 'guaranteeAmount',
        message: 'Guarantee amount cannot be negative',
        code: 'NEGATIVE_VALUE'
      });
    }
    if (game.guaranteeAmount > VALIDATION_THRESHOLDS.MAX_GUARANTEE) {
      warnings.push({
        field: 'guaranteeAmount',
        message: `Guarantee amount ${game.guaranteeAmount} is unusually high`,
        code: 'UNUSUALLY_HIGH'
      });
    }
  }
  
  return { errors, warnings };
};

// ===================================================================
// GUARANTEE VALIDATION
// ===================================================================

/**
 * Validate guarantee-related fields
 * @param {Object} game - Game data object
 * @returns {Object} { errors: [], warnings: [] }
 */
const validateGuaranteeFields = (game) => {
  const errors = [];
  const warnings = [];
  
  // If hasGuarantee is true, guaranteeAmount should be set
  if (game.hasGuarantee === true && (!game.guaranteeAmount || game.guaranteeAmount <= 0)) {
    warnings.push({
      field: 'guaranteeAmount',
      message: 'Game has guarantee flag but no guarantee amount set',
      code: 'MISSING_GUARANTEE_AMOUNT'
    });
  }
  
  // If guaranteeAmount is set, hasGuarantee should be true
  if (game.guaranteeAmount && game.guaranteeAmount > 0 && game.hasGuarantee !== true) {
    warnings.push({
      field: 'hasGuarantee',
      message: 'Guarantee amount is set but hasGuarantee is not true',
      code: 'INCONSISTENT_GUARANTEE_FLAG'
    });
  }
  
  return { errors, warnings };
};

// ===================================================================
// SERIES VALIDATION
// ===================================================================

/**
 * Validate series-related fields
 * @param {Object} game - Game data object
 * @returns {Object} { errors: [], warnings: [] }
 */
const validateSeriesFields = (game) => {
  const errors = [];
  const warnings = [];
  
  // If isSeries is true, seriesName should ideally be set
  if (game.isSeries === true && !game.seriesName) {
    warnings.push({
      field: 'seriesName',
      message: 'Game is marked as series but no series name provided',
      code: 'MISSING_SERIES_NAME'
    });
  }
  
  // If series metadata fields are set, isSeries should probably be true
  const seriesMetadataFields = ['isMainEvent', 'eventNumber', 'dayNumber', 'flightLetter', 'finalDay'];
  const hasSeriesMetadata = seriesMetadataFields.some(field => 
    game[field] !== undefined && game[field] !== null && game[field] !== false
  );
  
  if (hasSeriesMetadata && game.isSeries !== true) {
    warnings.push({
      field: 'isSeries',
      message: 'Series metadata fields are set but isSeries is not true',
      code: 'INCONSISTENT_SERIES_FLAG'
    });
  }
  
  // Validate day number
  if (game.dayNumber !== undefined && game.dayNumber !== null) {
    if (game.dayNumber < 1 || game.dayNumber > 10) {
      warnings.push({
        field: 'dayNumber',
        message: `Day number ${game.dayNumber} is unusual (expected 1-10)`,
        code: 'UNUSUAL_DAY_NUMBER'
      });
    }
  }
  
  // Validate flight letter
  if (game.flightLetter && !/^[A-Za-z0-9]{1,3}$/.test(game.flightLetter)) {
    warnings.push({
      field: 'flightLetter',
      message: `Flight letter "${game.flightLetter}" has unusual format`,
      code: 'UNUSUAL_FLIGHT_LETTER'
    });
  }
  
  return { errors, warnings };
};

// ===================================================================
// ENTRY CONSISTENCY VALIDATION
// ===================================================================

/**
 * Validate entry-related field consistency
 * @param {Object} game - Game data object
 * @returns {Object} { errors: [], warnings: [] }
 */
const validateEntryConsistency = (game) => {
  const errors = [];
  const warnings = [];
  
  const totalInitialEntries = game.totalInitialEntries || 0;
  const totalRebuys = game.totalRebuys || 0;
  const totalAddons = game.totalAddons || 0;
  const totalEntries = game.totalEntries;
  
  // Check if totalEntries matches calculated value
  if (totalEntries !== undefined && totalEntries !== null) {
    const calculatedTotal = totalInitialEntries + totalRebuys + totalAddons;
    
    // Only warn if both values are non-zero and they don't match
    if (calculatedTotal > 0 && totalEntries !== calculatedTotal) {
      warnings.push({
        field: 'totalEntries',
        message: `Total entries (${totalEntries}) doesn't match calculated (initial: ${totalInitialEntries} + rebuys: ${totalRebuys} + addons: ${totalAddons} = ${calculatedTotal})`,
        code: 'ENTRY_CALCULATION_MISMATCH'
      });
    }
  }
  
  // Unique players should not exceed total initial entries
  if (game.totalUniquePlayers && game.totalInitialEntries) {
    if (game.totalUniquePlayers > game.totalInitialEntries) {
      warnings.push({
        field: 'totalUniquePlayers',
        message: `Unique players (${game.totalUniquePlayers}) exceeds initial entries (${game.totalInitialEntries})`,
        code: 'UNIQUE_EXCEEDS_INITIAL'
      });
    }
  }
  
  return { errors, warnings };
};

// ===================================================================
// PRIZEPOOL VALIDATION
// ===================================================================

/**
 * Validate prizepool-related fields
 * @param {Object} game - Game data object
 * @returns {Object} { errors: [], warnings: [] }
 */
const validatePrizepoolFields = (game) => {
  const errors = [];
  const warnings = [];
  
  // Prizepool paid should not be negative
  if (game.prizepoolPaid !== undefined && game.prizepoolPaid !== null && game.prizepoolPaid < 0) {
    errors.push({
      field: 'prizepoolPaid',
      message: 'Prizepool paid cannot be negative',
      code: 'NEGATIVE_VALUE'
    });
  }
  
  // Prizepool calculated should not be negative
  if (game.prizepoolCalculated !== undefined && game.prizepoolCalculated !== null && game.prizepoolCalculated < 0) {
    errors.push({
      field: 'prizepoolCalculated',
      message: 'Prizepool calculated cannot be negative',
      code: 'NEGATIVE_VALUE'
    });
  }
  
  // If both are set, they should be reasonably close for finished games
  if (game.gameStatus === 'FINISHED' && game.prizepoolPaid && game.prizepoolCalculated) {
    const diff = Math.abs(game.prizepoolPaid - game.prizepoolCalculated);
    const threshold = Math.max(game.prizepoolPaid, game.prizepoolCalculated) * 0.1; // 10% threshold
    
    if (diff > threshold && threshold > 0) {
      warnings.push({
        field: 'prizepoolPaid',
        message: `Paid prizepool (${game.prizepoolPaid}) differs significantly from calculated (${game.prizepoolCalculated})`,
        code: 'PRIZEPOOL_MISMATCH'
      });
    }
  }
  
  return { errors, warnings };
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  validateNumericFields,
  validateGuaranteeFields,
  validateSeriesFields,
  validateEntryConsistency,
  validatePrizepoolFields
};
