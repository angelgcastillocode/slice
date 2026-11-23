/**
 * Slice Financial Engine - Pure Date & MXN Currency Utilities
 * All monetary amounts operate strictly in integer cents.
 */

const MONTH_NAMES_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const MONTH_SHORT_ES = [
  'Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun',
  'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'
];

const WEEKDAY_NAMES_ES = [
  'Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'
];

/**
 * Returns the exact number of days in a month (28, 29, 30, or 31).
 * @param {number} year - 4-digit year
 * @param {number} monthOneBased - 1 (Jan) to 12 (Dec)
 * @returns {number}
 */
export function daysInMonth(year, monthOneBased) {
  return new Date(Date.UTC(year, monthOneBased, 0)).getUTCDate();
}

/**
 * Clamps a target day (1..31) to the last valid day of the given month.
 * Handles 30/31 in February (28 or 29) and 31 in 30-day months.
 * @param {number} year
 * @param {number} monthOneBased
 * @param {number} targetDay
 * @returns {number}
 */
export function clampDayToMonth(year, monthOneBased, targetDay) {
  const maxDay = daysInMonth(year, monthOneBased);
  return Math.min(Math.max(1, Number(targetDay)), maxDay);
}

/**
 * Formats year, month, and day into 'YYYY-MM-DD' after clamping day to month.
 * @param {number} year
 * @param {number} monthOneBased
 * @param {number} targetDay
 * @returns {string}
 */
export function buildClampedDateISO(year, monthOneBased, targetDay) {
  const effectiveDay = clampDayToMonth(year, monthOneBased, targetDay);
  const y = String(year).padStart(4, '0');
  const m = String(monthOneBased).padStart(2, '0');
  const d = String(effectiveDay).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parses an ISO date string 'YYYY-MM-DD' into numeric { year, month, day }.
 * @param {string} dateISO
 * @returns {{ year: number, month: number, day: number }}
 */
export function parseISODate(dateISO) {
  const [y, m, d] = String(dateISO).split('-').map(Number);
  if (!y || !m || !d) {
    throw new Error(`Invalid ISO date: ${dateISO}`);
  }
  return { year: y, month: m, day: d };
}

/**
 * Parses a 'YYYY-MM' string into numeric { year, month }.
 * @param {string} yearMonthStr
 * @returns {{ year: number, month: number }}
 */
export function parseYearMonth(yearMonthStr) {
  const [y, m] = String(yearMonthStr).split('-').map(Number);
  if (!y || !m || m < 1 || m > 12) {
    throw new Error(`Invalid year-month: ${yearMonthStr}`);
  }
  return { year: y, month: m };
}

/**
 * Formats numeric year and 1-based month into 'YYYY-MM'.
 * @param {number} year
 * @param {number} monthOneBased
 * @returns {string}
 */
export function formatYearMonth(year, monthOneBased) {
  return `${String(year).padStart(4, '0')}-${String(monthOneBased).padStart(2, '0')}`;
}

/**
 * Adds or subtracts deltaMonths from a 'YYYY-MM' string.
 * @param {string} yearMonthStr - 'YYYY-MM'
 * @param {number} deltaMonths - integer (positive or negative)
 * @returns {string} 'YYYY-MM'
 */
export function addMonthsToYM(yearMonthStr, deltaMonths) {
  const { year, month } = parseYearMonth(yearMonthStr);
  const totalMonths = year * 12 + (month - 1) + Number(deltaMonths);
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  return formatYearMonth(targetYear, targetMonth);
}

/**
 * Adds calendar days to an ISO date string 'YYYY-MM-DD'.
 * @param {string} dateISO
 * @param {number} deltaDays
 * @returns {string}
 */
export function addDaysISO(dateISO, deltaDays) {
  const { year, month, day } = parseISODate(dateISO);
  const utc = new Date(Date.UTC(year, month - 1, day + Number(deltaDays)));
  return formatISODateUTC(utc);
}

/**
 * Returns the difference in calendar days (toDateISO - fromDateISO).
 * @param {string} fromDateISO
 * @param {string} toDateISO
 * @returns {number}
 */
export function diffDaysISO(fromDateISO, toDateISO) {
  const a = parseISODate(fromDateISO);
  const b = parseISODate(toDateISO);
  const utcA = Date.UTC(a.year, a.month - 1, a.day);
  const utcB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((utcB - utcA) / 86400000);
}

/**
 * Formats a UTC Date instance as 'YYYY-MM-DD'.
 * @param {Date} dateObj
 * @returns {string}
 */
export function formatISODateUTC(dateObj) {
  const y = String(dateObj.getUTCFullYear()).padStart(4, '0');
  const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const d = String(dateObj.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Converts a user-supplied decimal string or number in MXN to integer cents.
 * Avoids IEEE-754 drift by rounding after multiplying by 100.
 * @param {string|number} input
 * @returns {number}
 */
export function parseMXNToCents(input) {
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return 0;
    return Math.round(input * 100);
  }
  const cleaned = String(input ?? '')
    .replace(/[^0-9.-]/g, '')
    .trim();
  if (!cleaned || cleaned === '-' || cleaned === '.') return 0;
  const num = Number(cleaned);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

/**
 * Formats integer cents as an MXN string (e.g., "$1,250.50").
 * @param {number} amountCents
 * @param {{ signed?: boolean, withCode?: boolean }} [options]
 * @returns {string}
 */
export function formatCentsToMXN(amountCents, options = {}) {
  const { signed = false, withCode = false } = options;
  const cents = Math.round(Number(amountCents) || 0);
  const isNegative = cents < 0;
  const absCents = Math.abs(cents);
  const whole = Math.floor(absCents / 100);
  const fraction = String(absCents % 100).padStart(2, '0');
  const wholeFormatted = whole.toLocaleString('en-US');

  let prefix = '$';
  if (isNegative) {
    prefix = '-$';
  } else if (signed && cents > 0) {
    prefix = '+$';
  }

  return `${prefix}${wholeFormatted}.${fraction}${withCode ? ' MXN' : ''}`;
}

/**
 * Formats integer cents into { whole: "1,250", decimals: "50", sign: "" | "-" }.
 * Useful for hero displays where decimals are styled separately.
 * @param {number} amountCents
 * @returns {{ whole: string, decimals: string, sign: string }}
 */
export function splitCentsForDisplay(amountCents) {
  const cents = Math.round(Number(amountCents) || 0);
  const sign = cents < 0 ? '-' : '';
  const absCents = Math.abs(cents);
  const whole = Math.floor(absCents / 100).toLocaleString('en-US');
  const decimals = String(absCents % 100).padStart(2, '0');
  return { whole, decimals, sign };
}

/**
 * Human-readable month and year in Spanish (e.g. '2026-11' -> 'Noviembre 2026').
 * @param {string} yearMonthStr
 * @returns {string}
 */
export function formatMonthYearLabel(yearMonthStr) {
  const { year, month } = parseYearMonth(yearMonthStr);
  return `${MONTH_NAMES_ES[month - 1]} ${year}`;
}

/**
 * Human-readable short date in Spanish (e.g. '2026-11-20' -> '20 Nov 2026' or '20 Nov').
 * @param {string} dateISO
 * @param {boolean} [includeYear=false]
 * @returns {string}
 */
export function formatShortDateES(dateISO, includeYear = false) {
  const { year, month, day } = parseISODate(dateISO);
  const d = String(day).padStart(2, '0');
  const m = MONTH_SHORT_ES[month - 1];
  return includeYear ? `${d} ${m} ${year}` : `${d} ${m}`;
}

/**
 * Human-readable full date in Spanish (e.g. '2026-11-20' -> 'Jueves 20 de Noviembre').
 * @param {string} dateISO
 * @returns {string}
 */
export function formatLongDateES(dateISO) {
  const { year, month, day } = parseISODate(dateISO);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const weekday = WEEKDAY_NAMES_ES[utc.getUTCDay()];
  return `${weekday} ${day} de ${MONTH_NAMES_ES[month - 1]}`;
}
