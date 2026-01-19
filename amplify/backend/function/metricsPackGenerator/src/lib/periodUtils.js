/**
 * Period Utilities
 * ================
 * Date/time utilities for period-based reporting.
 * Week runs Monday 00:00:00 AEST to Sunday 23:59:59 AEST.
 * 
 * UPDATED: Added flexible period selection support
 */

const AEST_OFFSET_HOURS = 10;
const AEDT_OFFSET_HOURS = 11;

// ===================================================================
// TIMEZONE UTILITIES
// ===================================================================

function isAEDT(date) {
  const month = date.getUTCMonth();
  if (month >= 3 && month <= 8) return false;
  if (month >= 10 || month <= 1) return true;
  const dayOfMonth = date.getUTCDate();
  if (month === 9) return dayOfMonth >= 7;
  return true;
}

function getAustralianOffset(date) {
  return isAEDT(date) ? AEDT_OFFSET_HOURS : AEST_OFFSET_HOURS;
}

function toAEST(utcDate) {
  const d = typeof utcDate === 'string' ? new Date(utcDate) : new Date(utcDate);
  const offset = getAustralianOffset(d);
  const aestTime = new Date(d.getTime() + (offset * 60 * 60 * 1000));
  
  return {
    year: aestTime.getUTCFullYear(),
    month: aestTime.getUTCMonth(),
    day: aestTime.getUTCDate(),
    hours: aestTime.getUTCHours(),
    dayOfWeek: aestTime.getUTCDay()
  };
}

function fromAEST(year, month, day, hours = 0, minutes = 0) {
  const tempDate = new Date(Date.UTC(year, month, day, hours, minutes));
  const offset = getAustralianOffset(tempDate);
  return new Date(tempDate.getTime() - (offset * 60 * 60 * 1000));
}

// ===================================================================
// ISO WEEK UTILITIES
// ===================================================================

function getISOWeekNumber(date) {
  const aest = toAEST(date);
  const d = new Date(Date.UTC(aest.year, aest.month, aest.day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function getISOWeekYear(date) {
  const aest = toAEST(date);
  const d = new Date(Date.UTC(aest.year, aest.month, aest.day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  return d.getUTCFullYear();
}

function getISOWeeksInYear(year) {
  // Dec 28 is always in the last week of the year
  const dec28 = new Date(Date.UTC(year, 11, 28));
  return getISOWeekNumber(dec28);
}

// ===================================================================
// PERIOD BOUNDS (Original functions)
// ===================================================================

const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 
                          'July', 'August', 'September', 'October', 'November', 'December'];

function getWeekBounds(date) {
  const aest = toAEST(date);
  const daysSinceMonday = aest.dayOfWeek === 0 ? 6 : aest.dayOfWeek - 1;
  const mondayDay = aest.day - daysSinceMonday;
  
  const start = fromAEST(aest.year, aest.month, mondayDay, 0, 0);
  const end = fromAEST(aest.year, aest.month, mondayDay + 6, 23, 59);
  
  const weekNum = getISOWeekNumber(start);
  const weekYear = getISOWeekYear(start);
  const key = `${weekYear}-W${String(weekNum).padStart(2, '0')}`;
  
  const startAEST = toAEST(start);
  const label = `Week ${weekNum}, ${MONTH_NAMES_SHORT[startAEST.month]} ${startAEST.year}`;
  
  return { start, end, key, label };
}

function getMonthBounds(date) {
  const aest = toAEST(date);
  const start = fromAEST(aest.year, aest.month, 1, 0, 0);
  const lastDay = new Date(Date.UTC(aest.year, aest.month + 1, 0)).getUTCDate();
  const end = fromAEST(aest.year, aest.month, lastDay, 23, 59);
  
  const key = `${aest.year}-${String(aest.month + 1).padStart(2, '0')}`;
  const label = `${MONTH_NAMES_LONG[aest.month]} ${aest.year}`;
  
  return { start, end, key, label };
}

function getQuarterBounds(date) {
  const aest = toAEST(date);
  const quarter = Math.floor(aest.month / 3);
  const quarterStartMonth = quarter * 3;
  
  const start = fromAEST(aest.year, quarterStartMonth, 1, 0, 0);
  const quarterEndMonth = quarterStartMonth + 2;
  const lastDay = new Date(Date.UTC(aest.year, quarterEndMonth + 1, 0)).getUTCDate();
  const end = fromAEST(aest.year, quarterEndMonth, lastDay, 23, 59);
  
  const key = `${aest.year}-Q${quarter + 1}`;
  const label = `Q${quarter + 1} ${aest.year}`;
  
  return { start, end, key, label };
}

function getYearBounds(date) {
  const aest = toAEST(date);
  const start = fromAEST(aest.year, 0, 1, 0, 0);
  const end = fromAEST(aest.year, 11, 31, 23, 59);
  
  const key = `${aest.year}`;
  const label = `${aest.year}`;
  
  return { start, end, key, label };
}

// ===================================================================
// PERIOD KEY PARSERS (Original functions)
// ===================================================================

function getDateFromWeekKey(weekKey) {
  const match = weekKey.match(/^(\d{4})-W(\d{2})$/);
  if (!match) throw new Error(`Invalid week key: ${weekKey}`);
  
  const year = parseInt(match[1]);
  const week = parseInt(match[2]);
  
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (jan4Day - 1));
  
  const targetMonday = new Date(week1Monday);
  targetMonday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7);
  
  const aestMonday = toAEST(targetMonday);
  return fromAEST(aestMonday.year, aestMonday.month, aestMonday.day, 0, 0);
}

function getDateFromMonthKey(monthKey) {
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) throw new Error(`Invalid month key: ${monthKey}`);
  
  const year = parseInt(match[1]);
  const month = parseInt(match[2]) - 1;
  
  return fromAEST(year, month, 15, 12, 0);
}

function formatPeriodLabel(periodKey, reportType) {
  const weekMatch = periodKey.match(/^(\d{4})-W(\d{2})$/);
  if (weekMatch) {
    const monday = getDateFromWeekKey(periodKey);
    const aest = toAEST(monday);
    return `Week ${parseInt(weekMatch[2])}, ${MONTH_NAMES_SHORT[aest.month]} ${aest.year}`;
  }
  
  const monthMatch = periodKey.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    return `${MONTH_NAMES_LONG[parseInt(monthMatch[2]) - 1]} ${monthMatch[1]}`;
  }
  
  const quarterMatch = periodKey.match(/^(\d{4})-Q(\d)$/);
  if (quarterMatch) {
    return `Q${quarterMatch[2]} ${quarterMatch[1]}`;
  }
  
  return periodKey;
}

function getCurrentPeriodKey(reportType) {
  const now = new Date();
  const period = reportType === 'WEEKLY_OPS' ? getWeekBounds(now) : getMonthBounds(now);
  return period.key;
}

// ===================================================================
// NEW: FLEXIBLE PERIOD SELECTION
// ===================================================================

/**
 * Period selection input types (from GraphQL)
 * 
 * @typedef {Object} PeriodSelectionInput
 * @property {'CUSTOM'|'ISO_WEEK'|'MONTH'|'QUARTER'|'YEAR'|'RELATIVE'} periodType
 * @property {string} [customStartDate] - YYYY-MM-DD for CUSTOM
 * @property {string} [customEndDate] - YYYY-MM-DD for CUSTOM
 * @property {number} [isoYear] - Year for ISO_WEEK
 * @property {number} [isoWeek] - Week 1-53 for ISO_WEEK
 * @property {number} [monthYear] - Year for MONTH
 * @property {number} [month] - Month 1-12 for MONTH
 * @property {number} [quarterYear] - Year for QUARTER
 * @property {number} [quarter] - Quarter 1-4 for QUARTER
 * @property {number} [year] - Year for YEAR
 * @property {string} [relativePeriod] - Preset for RELATIVE
 * @property {string} [referenceDate] - Reference date for relative calculations
 */

/**
 * Resolved period output
 * 
 * @typedef {Object} ResolvedPeriod
 * @property {string} periodKey
 * @property {string} periodLabel
 * @property {Date} startDate
 * @property {Date} endDate
 * @property {string} [comparisonPeriodKey]
 * @property {string} [comparisonPeriodLabel]
 * @property {Date} [comparisonStartDate]
 * @property {Date} [comparisonEndDate]
 */

/**
 * Resolve a period selection input to concrete dates and keys
 * 
 * @param {PeriodSelectionInput} input
 * @returns {ResolvedPeriod}
 */
function resolvePeriodSelection(input) {
  const refDate = input.referenceDate 
    ? new Date(input.referenceDate) 
    : new Date();

  switch (input.periodType) {
    case 'CUSTOM':
      return resolveCustomPeriod(input);
    case 'ISO_WEEK':
      return resolveISOWeekPeriod(input);
    case 'MONTH':
      return resolveMonthPeriod(input);
    case 'QUARTER':
      return resolveQuarterPeriod(input);
    case 'YEAR':
      return resolveYearPeriod(input);
    case 'RELATIVE':
      return resolveRelativePeriod(input, refDate);
    default:
      throw new Error(`Unknown period type: ${input.periodType}`);
  }
}

function resolveCustomPeriod(input) {
  if (!input.customStartDate || !input.customEndDate) {
    throw new Error('Custom period requires customStartDate and customEndDate');
  }

  // Parse dates as AEST
  const [startYear, startMonth, startDay] = input.customStartDate.split('-').map(Number);
  const [endYear, endMonth, endDay] = input.customEndDate.split('-').map(Number);
  
  const startDate = fromAEST(startYear, startMonth - 1, startDay, 0, 0);
  const endDate = fromAEST(endYear, endMonth - 1, endDay, 23, 59);

  if (endDate < startDate) {
    throw new Error('End date must be after start date');
  }

  const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (24 * 60 * 60 * 1000)) + 1;
  const periodKey = `CUSTOM-${input.customStartDate.replace(/-/g, '')}-${input.customEndDate.replace(/-/g, '')}`;
  
  const startAEST = toAEST(startDate);
  const endAEST = toAEST(endDate);
  const periodLabel = `${MONTH_NAMES_SHORT[startAEST.month]} ${startAEST.day} - ${MONTH_NAMES_SHORT[endAEST.month]} ${endAEST.day}, ${endAEST.year}`;

  // Comparison: same length period immediately before
  const compEndDate = new Date(startDate.getTime() - 1);
  const compStartDate = new Date(compEndDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const compStartAEST = toAEST(compStartDate);
  const compEndAEST = toAEST(compEndDate);
  
  const compStartStr = `${compStartAEST.year}${String(compStartAEST.month + 1).padStart(2, '0')}${String(compStartAEST.day).padStart(2, '0')}`;
  const compEndStr = `${compEndAEST.year}${String(compEndAEST.month + 1).padStart(2, '0')}${String(compEndAEST.day).padStart(2, '0')}`;
  const comparisonPeriodKey = `CUSTOM-${compStartStr}-${compEndStr}`;
  const comparisonPeriodLabel = `${MONTH_NAMES_SHORT[compStartAEST.month]} ${compStartAEST.day} - ${MONTH_NAMES_SHORT[compEndAEST.month]} ${compEndAEST.day}, ${compEndAEST.year}`;

  return {
    periodKey,
    periodLabel,
    startDate,
    endDate,
    comparisonPeriodKey,
    comparisonPeriodLabel,
    comparisonStartDate: compStartDate,
    comparisonEndDate: compEndDate
  };
}

function resolveISOWeekPeriod(input) {
  if (!input.isoYear || !input.isoWeek) {
    throw new Error('ISO week period requires isoYear and isoWeek');
  }

  const { isoYear, isoWeek } = input;

  // Validate week number
  const maxWeeks = getISOWeeksInYear(isoYear);
  if (isoWeek < 1 || isoWeek > maxWeeks) {
    throw new Error(`Invalid ISO week ${isoWeek} for year ${isoYear} (max: ${maxWeeks})`);
  }

  // Get week bounds using existing function
  const weekKey = `${isoYear}-W${String(isoWeek).padStart(2, '0')}`;
  const weekStart = getDateFromWeekKey(weekKey);
  const period = getWeekBounds(weekStart);

  // Comparison: previous week
  const compWeekStart = new Date(period.start.getTime() - 7 * 24 * 60 * 60 * 1000);
  const compPeriod = getWeekBounds(compWeekStart);

  return {
    periodKey: period.key,
    periodLabel: period.label,
    startDate: period.start,
    endDate: period.end,
    comparisonPeriodKey: compPeriod.key,
    comparisonPeriodLabel: compPeriod.label,
    comparisonStartDate: compPeriod.start,
    comparisonEndDate: compPeriod.end
  };
}

function resolveMonthPeriod(input) {
  if (!input.monthYear || !input.month) {
    throw new Error('Month period requires monthYear and month');
  }

  const { monthYear, month } = input;

  if (month < 1 || month > 12) {
    throw new Error(`Invalid month: ${month}`);
  }

  // Get month bounds using existing function
  const monthDate = fromAEST(monthYear, month - 1, 15, 12, 0);
  const period = getMonthBounds(monthDate);

  // Comparison: previous month
  const prevMonthDate = fromAEST(monthYear, month - 2, 15, 12, 0);
  const compPeriod = getMonthBounds(prevMonthDate);

  return {
    periodKey: period.key,
    periodLabel: period.label,
    startDate: period.start,
    endDate: period.end,
    comparisonPeriodKey: compPeriod.key,
    comparisonPeriodLabel: compPeriod.label,
    comparisonStartDate: compPeriod.start,
    comparisonEndDate: compPeriod.end
  };
}

function resolveQuarterPeriod(input) {
  if (!input.quarterYear || !input.quarter) {
    throw new Error('Quarter period requires quarterYear and quarter');
  }

  const { quarterYear, quarter } = input;

  if (quarter < 1 || quarter > 4) {
    throw new Error(`Invalid quarter: ${quarter}`);
  }

  // Get quarter bounds
  const quarterStartMonth = (quarter - 1) * 3;
  const quarterDate = fromAEST(quarterYear, quarterStartMonth, 15, 12, 0);
  const period = getQuarterBounds(quarterDate);

  // Comparison: previous quarter
  const prevQuarterDate = fromAEST(quarterYear, quarterStartMonth - 3, 15, 12, 0);
  const compPeriod = getQuarterBounds(prevQuarterDate);

  return {
    periodKey: period.key,
    periodLabel: period.label,
    startDate: period.start,
    endDate: period.end,
    comparisonPeriodKey: compPeriod.key,
    comparisonPeriodLabel: compPeriod.label,
    comparisonStartDate: compPeriod.start,
    comparisonEndDate: compPeriod.end
  };
}

function resolveYearPeriod(input) {
  if (!input.year) {
    throw new Error('Year period requires year');
  }

  const { year } = input;

  const yearDate = fromAEST(year, 6, 1, 12, 0);
  const period = getYearBounds(yearDate);

  // Comparison: previous year
  const prevYearDate = fromAEST(year - 1, 6, 1, 12, 0);
  const compPeriod = getYearBounds(prevYearDate);

  return {
    periodKey: period.key,
    periodLabel: period.label,
    startDate: period.start,
    endDate: period.end,
    comparisonPeriodKey: compPeriod.key,
    comparisonPeriodLabel: compPeriod.label,
    comparisonStartDate: compPeriod.start,
    comparisonEndDate: compPeriod.end
  };
}

function resolveRelativePeriod(input, refDate) {
  if (!input.relativePeriod) {
    throw new Error('Relative period requires relativePeriod');
  }

  switch (input.relativePeriod) {
    case 'CURRENT_WEEK': {
      const period = getWeekBounds(refDate);
      const compPeriod = getWeekBounds(new Date(period.start.getTime() - 7 * 24 * 60 * 60 * 1000));
      return {
        periodKey: period.key,
        periodLabel: period.label,
        startDate: period.start,
        endDate: period.end,
        comparisonPeriodKey: compPeriod.key,
        comparisonPeriodLabel: compPeriod.label,
        comparisonStartDate: compPeriod.start,
        comparisonEndDate: compPeriod.end
      };
    }

    case 'LAST_WEEK': {
      const lastWeekDate = new Date(refDate.getTime() - 7 * 24 * 60 * 60 * 1000);
      const period = getWeekBounds(lastWeekDate);
      const compPeriod = getWeekBounds(new Date(period.start.getTime() - 7 * 24 * 60 * 60 * 1000));
      return {
        periodKey: period.key,
        periodLabel: period.label,
        startDate: period.start,
        endDate: period.end,
        comparisonPeriodKey: compPeriod.key,
        comparisonPeriodLabel: compPeriod.label,
        comparisonStartDate: compPeriod.start,
        comparisonEndDate: compPeriod.end
      };
    }

    case 'CURRENT_MONTH': {
      const period = getMonthBounds(refDate);
      const aest = toAEST(refDate);
      const prevMonthDate = fromAEST(aest.year, aest.month - 1, 15, 12, 0);
      const compPeriod = getMonthBounds(prevMonthDate);
      return {
        periodKey: period.key,
        periodLabel: period.label,
        startDate: period.start,
        endDate: period.end,
        comparisonPeriodKey: compPeriod.key,
        comparisonPeriodLabel: compPeriod.label,
        comparisonStartDate: compPeriod.start,
        comparisonEndDate: compPeriod.end
      };
    }

    case 'LAST_MONTH': {
      const aest = toAEST(refDate);
      const lastMonthDate = fromAEST(aest.year, aest.month - 1, 15, 12, 0);
      const period = getMonthBounds(lastMonthDate);
      const prevMonthDate = fromAEST(aest.year, aest.month - 2, 15, 12, 0);
      const compPeriod = getMonthBounds(prevMonthDate);
      return {
        periodKey: period.key,
        periodLabel: period.label,
        startDate: period.start,
        endDate: period.end,
        comparisonPeriodKey: compPeriod.key,
        comparisonPeriodLabel: compPeriod.label,
        comparisonStartDate: compPeriod.start,
        comparisonEndDate: compPeriod.end
      };
    }

    case 'CURRENT_QUARTER': {
      const period = getQuarterBounds(refDate);
      const aest = toAEST(refDate);
      const quarter = Math.floor(aest.month / 3);
      const prevQuarterDate = fromAEST(aest.year, (quarter - 1) * 3, 15, 12, 0);
      const compPeriod = getQuarterBounds(prevQuarterDate);
      return {
        periodKey: period.key,
        periodLabel: period.label,
        startDate: period.start,
        endDate: period.end,
        comparisonPeriodKey: compPeriod.key,
        comparisonPeriodLabel: compPeriod.label,
        comparisonStartDate: compPeriod.start,
        comparisonEndDate: compPeriod.end
      };
    }

    case 'LAST_QUARTER': {
      const aest = toAEST(refDate);
      const quarter = Math.floor(aest.month / 3);
      const lastQuarterDate = fromAEST(aest.year, (quarter - 1) * 3, 15, 12, 0);
      const period = getQuarterBounds(lastQuarterDate);
      const prevQuarterDate = fromAEST(aest.year, (quarter - 2) * 3, 15, 12, 0);
      const compPeriod = getQuarterBounds(prevQuarterDate);
      return {
        periodKey: period.key,
        periodLabel: period.label,
        startDate: period.start,
        endDate: period.end,
        comparisonPeriodKey: compPeriod.key,
        comparisonPeriodLabel: compPeriod.label,
        comparisonStartDate: compPeriod.start,
        comparisonEndDate: compPeriod.end
      };
    }

    case 'CURRENT_YEAR': {
      const period = getYearBounds(refDate);
      const aest = toAEST(refDate);
      const prevYearDate = fromAEST(aest.year - 1, 6, 1, 12, 0);
      const compPeriod = getYearBounds(prevYearDate);
      return {
        periodKey: period.key,
        periodLabel: period.label,
        startDate: period.start,
        endDate: period.end,
        comparisonPeriodKey: compPeriod.key,
        comparisonPeriodLabel: compPeriod.label,
        comparisonStartDate: compPeriod.start,
        comparisonEndDate: compPeriod.end
      };
    }

    case 'LAST_YEAR': {
      const aest = toAEST(refDate);
      const lastYearDate = fromAEST(aest.year - 1, 6, 1, 12, 0);
      const period = getYearBounds(lastYearDate);
      const prevYearDate = fromAEST(aest.year - 2, 6, 1, 12, 0);
      const compPeriod = getYearBounds(prevYearDate);
      return {
        periodKey: period.key,
        periodLabel: period.label,
        startDate: period.start,
        endDate: period.end,
        comparisonPeriodKey: compPeriod.key,
        comparisonPeriodLabel: compPeriod.label,
        comparisonStartDate: compPeriod.start,
        comparisonEndDate: compPeriod.end
      };
    }

    case 'LAST_7_DAYS':
      return resolveRollingDays(7, refDate);

    case 'LAST_30_DAYS':
      return resolveRollingDays(30, refDate);

    case 'LAST_90_DAYS':
      return resolveRollingDays(90, refDate);

    default:
      throw new Error(`Unknown relative period: ${input.relativePeriod}`);
  }
}

function resolveRollingDays(days, refDate) {
  const aest = toAEST(refDate);
  const endDate = fromAEST(aest.year, aest.month, aest.day, 23, 59);
  const startDate = new Date(endDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const startAEST = toAEST(startDate);
  const startDateMidnight = fromAEST(startAEST.year, startAEST.month, startAEST.day, 0, 0);

  const endAEST = toAEST(endDate);
  const periodKey = `ROLLING-${days}D-${endAEST.year}${String(endAEST.month + 1).padStart(2, '0')}${String(endAEST.day).padStart(2, '0')}`;
  const periodLabel = `Last ${days} Days`;

  // Comparison: previous equivalent period
  const compEndDate = new Date(startDateMidnight.getTime() - 1);
  const compStartDate = new Date(compEndDate.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  const compStartAEST = toAEST(compStartDate);
  const compStartDateMidnight = fromAEST(compStartAEST.year, compStartAEST.month, compStartAEST.day, 0, 0);
  
  const compEndAEST = toAEST(compEndDate);
  const comparisonPeriodKey = `ROLLING-${days}D-${compEndAEST.year}${String(compEndAEST.month + 1).padStart(2, '0')}${String(compEndAEST.day).padStart(2, '0')}`;
  const comparisonPeriodLabel = `Previous ${days} Days`;

  return {
    periodKey,
    periodLabel,
    startDate: startDateMidnight,
    endDate,
    comparisonPeriodKey,
    comparisonPeriodLabel,
    comparisonStartDate: compStartDateMidnight,
    comparisonEndDate: compEndDate
  };
}

/**
 * Parse a period key string back to a PeriodSelectionInput
 * Useful for loading existing packs
 */
function parsePeriodKey(periodKey) {
  // ISO Week: 2025-W03
  const weekMatch = periodKey.match(/^(\d{4})-W(\d{2})$/);
  if (weekMatch) {
    return {
      periodType: 'ISO_WEEK',
      isoYear: parseInt(weekMatch[1], 10),
      isoWeek: parseInt(weekMatch[2], 10)
    };
  }

  // Month: 2025-01
  const monthMatch = periodKey.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    return {
      periodType: 'MONTH',
      monthYear: parseInt(monthMatch[1], 10),
      month: parseInt(monthMatch[2], 10)
    };
  }

  // Quarter: 2025-Q1
  const quarterMatch = periodKey.match(/^(\d{4})-Q([1-4])$/);
  if (quarterMatch) {
    return {
      periodType: 'QUARTER',
      quarterYear: parseInt(quarterMatch[1], 10),
      quarter: parseInt(quarterMatch[2], 10)
    };
  }

  // Year: 2025
  const yearMatch = periodKey.match(/^(\d{4})$/);
  if (yearMatch) {
    return {
      periodType: 'YEAR',
      year: parseInt(yearMatch[1], 10)
    };
  }

  // Custom: CUSTOM-20250101-20250115
  const customMatch = periodKey.match(/^CUSTOM-(\d{8})-(\d{8})$/);
  if (customMatch) {
    const startYear = customMatch[1].slice(0, 4);
    const startMonth = customMatch[1].slice(4, 6);
    const startDay = customMatch[1].slice(6, 8);
    const endYear = customMatch[2].slice(0, 4);
    const endMonth = customMatch[2].slice(4, 6);
    const endDay = customMatch[2].slice(6, 8);
    
    return {
      periodType: 'CUSTOM',
      customStartDate: `${startYear}-${startMonth}-${startDay}`,
      customEndDate: `${endYear}-${endMonth}-${endDay}`
    };
  }

  // Rolling: ROLLING-30D-20250115
  const rollingMatch = periodKey.match(/^ROLLING-(\d+)D-(\d{8})$/);
  if (rollingMatch) {
    const days = parseInt(rollingMatch[1], 10);
    const relativePeriod = 
      days === 7 ? 'LAST_7_DAYS' :
      days === 30 ? 'LAST_30_DAYS' :
      days === 90 ? 'LAST_90_DAYS' : null;
    
    if (relativePeriod) {
      return {
        periodType: 'RELATIVE',
        relativePeriod
      };
    }
  }

  return null;
}

/**
 * Get default period for a report type
 */
function getDefaultPeriodForReportType(reportType) {
  switch (reportType) {
    case 'WEEKLY_OPS':
      return { periodType: 'RELATIVE', relativePeriod: 'LAST_WEEK' };
    case 'MONTHLY_BOARD':
      return { periodType: 'RELATIVE', relativePeriod: 'LAST_MONTH' };
    default:
      return { periodType: 'RELATIVE', relativePeriod: 'LAST_WEEK' };
  }
}

module.exports = {
  // Timezone
  toAEST,
  fromAEST,
  isAEDT,
  getAustralianOffset,
  
  // ISO Week
  getISOWeekNumber,
  getISOWeekYear,
  getISOWeeksInYear,
  
  // Period bounds (original)
  getWeekBounds,
  getMonthBounds,
  getQuarterBounds,
  getYearBounds,
  
  // Period key parsers (original)
  getDateFromWeekKey,
  getDateFromMonthKey,
  formatPeriodLabel,
  getCurrentPeriodKey,
  
  // New: Flexible period selection
  resolvePeriodSelection,
  parsePeriodKey,
  getDefaultPeriodForReportType,
  
  // Constants
  MONTH_NAMES_SHORT,
  MONTH_NAMES_LONG
};