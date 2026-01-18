/**
 * Period Utilities
 * ================
 * Date/time utilities for period-based reporting.
 * Week runs Monday 00:00:00 AEST to Sunday 23:59:59 AEST.
 */

const AEST_OFFSET_HOURS = 10;
const AEDT_OFFSET_HOURS = 11;

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

module.exports = {
  toAEST,
  fromAEST,
  isAEDT,
  getAustralianOffset,
  getISOWeekNumber,
  getISOWeekYear,
  getWeekBounds,
  getMonthBounds,
  getQuarterBounds,
  getDateFromWeekKey,
  getDateFromMonthKey,
  formatPeriodLabel,
  getCurrentPeriodKey
};
