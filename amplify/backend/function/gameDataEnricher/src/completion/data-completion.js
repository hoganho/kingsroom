/**
 * data-completion.js
 * Fill in missing values, defaults, and derive calculable fields
 */

const { DEFAULT_GAME_VALUES } = require('../utils/constants');

// ===================================================================
// MAIN COMPLETION FUNCTION
// ===================================================================

/**
 * Complete game data by filling defaults and deriving missing values
 * 
 * @param {Object} gameData - Game data object
 * @returns {Object} { data: completedData, fieldsCompleted: string[] }
 */
const completeData = (gameData) => {
  const fieldsCompleted = [];
  const data = { ...gameData };
  
  // ===================================================================
  // BOOLEAN DEFAULTS
  // ===================================================================
  
  if (data.isSeries === undefined || data.isSeries === null) {
    data.isSeries = DEFAULT_GAME_VALUES.isSeries;
    fieldsCompleted.push('isSeries');
  }
  
  if (data.isRegular === undefined || data.isRegular === null) {
    data.isRegular = DEFAULT_GAME_VALUES.isRegular;
    fieldsCompleted.push('isRegular');
  }
  
  if (data.isSatellite === undefined || data.isSatellite === null) {
    data.isSatellite = DEFAULT_GAME_VALUES.isSatellite;
    fieldsCompleted.push('isSatellite');
  }
  
  if (data.hasGuarantee === undefined || data.hasGuarantee === null) {
    // Derive from guaranteeAmount if possible
    data.hasGuarantee = (data.guaranteeAmount && data.guaranteeAmount > 0) 
      ? true 
      : DEFAULT_GAME_VALUES.hasGuarantee;
    fieldsCompleted.push('hasGuarantee');
  }
  
  // ===================================================================
  // NUMERIC DEFAULTS
  // ===================================================================
  
  if (data.totalRebuys === undefined || data.totalRebuys === null) {
    data.totalRebuys = 0;
    fieldsCompleted.push('totalRebuys');
  }
  
  if (data.totalAddons === undefined || data.totalAddons === null) {
    data.totalAddons = 0;
    fieldsCompleted.push('totalAddons');
  }
  
  // ===================================================================
  // DERIVED ENTRY CALCULATIONS
  // ===================================================================
  
  // Derive totalEntries if not set but we have components
  if ((data.totalEntries === undefined || data.totalEntries === null) 
      && data.totalInitialEntries !== undefined 
      && data.totalInitialEntries !== null) {
    data.totalEntries = (data.totalInitialEntries || 0) + (data.totalRebuys || 0) + (data.totalAddons || 0);
    fieldsCompleted.push('totalEntries');
  }
  
  // Derive totalInitialEntries from totalUniquePlayers if that's all we have
  if ((data.totalInitialEntries === undefined || data.totalInitialEntries === null)
      && data.totalUniquePlayers !== undefined 
      && data.totalUniquePlayers !== null) {
    data.totalInitialEntries = data.totalUniquePlayers;
    fieldsCompleted.push('totalInitialEntries');
  }
  
  // ===================================================================
  // ENUM DEFAULTS
  // ===================================================================
  
  if (!data.gameStatus) {
    data.gameStatus = DEFAULT_GAME_VALUES.gameStatus;
    fieldsCompleted.push('gameStatus');
  }
  
  if (!data.gameType) {
    data.gameType = DEFAULT_GAME_VALUES.gameType;
    fieldsCompleted.push('gameType');
  }
  
  if (!data.gameVariant) {
    data.gameVariant = DEFAULT_GAME_VALUES.gameVariant;
    fieldsCompleted.push('gameVariant');
  }
  
  if (!data.registrationStatus) {
    // Derive from gameStatus if possible
    data.registrationStatus = deriveRegistrationStatus(data.gameStatus);
    fieldsCompleted.push('registrationStatus');
  }
  
  // ===================================================================
  // ASSIGNMENT STATUS DEFAULTS
  // ===================================================================
  
  if (!data.venueAssignmentStatus && !data.venueId) {
    data.venueAssignmentStatus = DEFAULT_GAME_VALUES.venueAssignmentStatus;
    fieldsCompleted.push('venueAssignmentStatus');
  }
  
  if (!data.seriesAssignmentStatus) {
    data.seriesAssignmentStatus = data.isSeries 
      ? 'PENDING_ASSIGNMENT' 
      : DEFAULT_GAME_VALUES.seriesAssignmentStatus;
    fieldsCompleted.push('seriesAssignmentStatus');
  }
  
  if (!data.recurringGameAssignmentStatus) {
    data.recurringGameAssignmentStatus = DEFAULT_GAME_VALUES.recurringGameAssignmentStatus;
    fieldsCompleted.push('recurringGameAssignmentStatus');
  }
  
  return { data, fieldsCompleted };
};

// ===================================================================
// HELPER FUNCTIONS
// ===================================================================

/**
 * Derive registration status from game status
 */
const deriveRegistrationStatus = (gameStatus) => {
  switch (gameStatus) {
    case 'SCHEDULED':
    case 'INITIATING':
      return 'SCHEDULED';
    case 'REGISTERING':
      return 'OPEN';
    case 'RUNNING':
    case 'CLOCK_STOPPED':
      return 'CLOSED';
    case 'FINISHED':
    case 'CANCELLED':
      return 'CLOSED';
     case 'NOT_PUBLISHED':
      return 'N_A';
    default:
      return 'SCHEDULED';
  }
};

/**
 * Derive game frequency from name patterns (basic heuristic)
 */
const deriveGameFrequency = (name) => {
  if (!name) return null;
  
  const lowerName = name.toLowerCase();
  
  if (lowerName.includes('daily')) return 'DAILY';
  if (lowerName.includes('weekly')) return 'WEEKLY';
  if (lowerName.includes('fortnightly') || lowerName.includes('bi-weekly')) return 'FORTNIGHTLY';
  if (lowerName.includes('monthly')) return 'MONTHLY';
  if (lowerName.includes('quarterly')) return 'QUARTERLY';
  if (lowerName.includes('annual') || lowerName.includes('yearly')) return 'YEARLY';
  
  return null;
};

/**
 * Complete series metadata from name parsing
 * @param {Object} gameData - Game data with name
 * @returns {Object} Series metadata fields
 */
const completeSeriesMetadata = (gameData) => {
  const result = {};
  const name = gameData.name;
  
  if (!name) return result;
  
  const lowerName = name.toLowerCase();
  
  // Detect main event
  if (!gameData.isMainEvent && lowerName.includes('main event')) {
    result.isMainEvent = true;
  }
  
  // Detect final day
  if (!gameData.finalDay && lowerName.includes('final day')) {
    result.finalDay = true;
  }
  
  // Detect day number
  if (!gameData.dayNumber) {
    const dayMatch = lowerName.match(/day\s*(\d+)/);
    if (dayMatch) {
      result.dayNumber = parseInt(dayMatch[1]);
    }
  }
  
  // Detect flight letter
  if (!gameData.flightLetter) {
    const flightMatch = lowerName.match(/flight\s*([a-z0-9]{1,2})/i);
    if (flightMatch) {
      result.flightLetter = flightMatch[1].toUpperCase();
    }
  }
  
  // Detect event number
  if (!gameData.eventNumber) {
    const eventMatch = lowerName.match(/event\s*#?\s*(\d+)/);
    if (eventMatch) {
      result.eventNumber = parseInt(eventMatch[1]);
    }
  }
  
  return result;
};

// ===================================================================
// EXPORTS
// ===================================================================

module.exports = {
  completeData,
  deriveRegistrationStatus,
  deriveGameFrequency,
  completeSeriesMetadata
};
