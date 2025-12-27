/**
 * required-fields.js
 * Required field validation for game data
 */

const { GameStatus, RegistrationStatus, GameType, GameVariant } = require('../utils/constants');

// ===================================================================
// REQUIRED FIELD DEFINITIONS
// ===================================================================

/**
 * Fields required for all games
 */
const BASELINE_REQUIRED = [
  'name',
  'gameStartDateTime'
];

/**
 * Fields required based on game status
 */
const STATUS_REQUIRED = {
  FINISHED: ['totalEntries'],
  RUNNING: ['totalEntries']
};

/**
 * Fields that should have valid enum values
 */
const ENUM_FIELDS = {
  gameStatus: Object.values(GameStatus),
  registrationStatus: Object.values(RegistrationStatus),
  gameType: Object.values(GameType),
  gameVariant: Object.values(GameVariant)
};

// ===================================================================
// VALIDATION FUNCTIONS
// ===================================================================

/**
 * Check if a value is present and non-empty
 */
const isPresent = (value) => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  return true;
};

/**
 * Validate required fields
 * @param {Object} game - Game data object
 * @returns {Object} { errors: [], warnings: [] }
 */
const validateRequiredFields = (game) => {
  const errors = [];
  const warnings = [];
  
  // Check baseline required fields
  for (const field of BASELINE_REQUIRED) {
    if (!isPresent(game[field])) {
      errors.push({
        field,
        message: `${field} is required`,
        code: 'REQUIRED_FIELD_MISSING'
      });
    }
  }
  
  // Check status-specific required fields
  const status = game.gameStatus;
  if (status && STATUS_REQUIRED[status]) {
    for (const field of STATUS_REQUIRED[status]) {
      if (!isPresent(game[field])) {
        warnings.push({
          field,
          message: `${field} is expected for ${status} games`,
          code: 'STATUS_FIELD_MISSING'
        });
      }
    }
  }
  
  return { errors, warnings };
};

/**
 * Validate enum field values
 * @param {Object} game - Game data object
 * @returns {Object} { errors: [], warnings: [] }
 */
const validateEnumFields = (game) => {
  const errors = [];
  const warnings = [];
  
  for (const [field, validValues] of Object.entries(ENUM_FIELDS)) {
    const value = game[field];
    
    if (isPresent(value) && !validValues.includes(value)) {
      errors.push({
        field,
        message: `Invalid value "${value}" for ${field}. Valid values: ${validValues.join(', ')}`,
        code: 'INVALID_ENUM_VALUE'
      });
    }
  }
  
  return { errors, warnings };
};

/**
 * Validate date/time fields
 * @param {Object} game - Game data object
 * @returns {Object} { errors: [], warnings: [] }
 */
const validateDateTimeFields = (game) => {
  const errors = [];
  const warnings = [];
  
  // Validate gameStartDateTime
  if (game.gameStartDateTime) {
    const startDate = new Date(game.gameStartDateTime);
    if (isNaN(startDate.getTime())) {
      errors.push({
        field: 'gameStartDateTime',
        message: 'Invalid date/time format for gameStartDateTime',
        code: 'INVALID_DATETIME'
      });
    }
  }
  
  // Validate gameEndDateTime if present
  if (game.gameEndDateTime) {
    const endDate = new Date(game.gameEndDateTime);
    if (isNaN(endDate.getTime())) {
      errors.push({
        field: 'gameEndDateTime',
        message: 'Invalid date/time format for gameEndDateTime',
        code: 'INVALID_DATETIME'
      });
    } else if (game.gameStartDateTime) {
      const startDate = new Date(game.gameStartDateTime);
      if (endDate < startDate) {
        warnings.push({
          field: 'gameEndDateTime',
          message: 'End time is before start time',
          code: 'END_BEFORE_START'
        });
      }
    }
  }
  
  return { errors, warnings };
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  validateRequiredFields,
  validateEnumFields,
  validateDateTimeFields,
  isPresent,
  BASELINE_REQUIRED,
  STATUS_REQUIRED,
  ENUM_FIELDS
};
