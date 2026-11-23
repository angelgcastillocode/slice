/**
 * Slice Financial Engine - Credit Card Billing Cycle & Cutoff Calculator
 * Handles inclusive cutoff rules, post-cutoff rollover, manual transit deferral
 * ("Diferir al siguiente corte"), and 28/29/30/31 short-month clamping.
 */

import {
  addDaysISO,
  addMonthsToYM,
  buildClampedDateISO,
  clampDayToMonth,
  diffDaysISO,
  formatYearMonth,
  parseISODate,
  parseYearMonth
} from './dateUtils.js';

/**
 * Computes the start date, cutoff date, and payment due date for a billing cycle
 * identified by `cycleYM` ('YYYY-MM', the month in which the statement cuts off).
 *
 * Payment due date rule:
 * - If `paymentDueDay > cutoffDay`, due date falls in the same month `cycleYM`.
 * - If `paymentDueDay <= cutoffDay`, due date falls in `addMonthsToYM(cycleYM, 1)`.
 *
 * @param {string} cycleYM - 'YYYY-MM'
 * @param {number} cutoffDay - 1..31
 * @param {number} paymentDueDay - 1..31
 * @returns {{
 *   cycleYM: string,
 *   cycleStartDateISO: string,
 *   cycleCutoffDateISO: string,
 *   paymentDueDateISO: string
 * }}
 */
export function computeCycleDatesForYM(cycleYM, cutoffDay, paymentDueDay) {
  const { year, month } = parseYearMonth(cycleYM);
  const cycleCutoffDateISO = buildClampedDateISO(year, month, cutoffDay);

  const prevCycleYM = addMonthsToYM(cycleYM, -1);
  const prevParsed = parseYearMonth(prevCycleYM);
  const prevCutoffDateISO = buildClampedDateISO(prevParsed.year, prevParsed.month, cutoffDay);
  const cycleStartDateISO = addDaysISO(prevCutoffDateISO, 1);

  let paymentDueDateISO;
  if (Number(paymentDueDay) > Number(cutoffDay)) {
    paymentDueDateISO = buildClampedDateISO(year, month, paymentDueDay);
  } else {
    const nextYM = addMonthsToYM(cycleYM, 1);
    const nextParsed = parseYearMonth(nextYM);
    paymentDueDateISO = buildClampedDateISO(nextParsed.year, nextParsed.month, paymentDueDay);
  }

  return {
    cycleYM,
    cycleStartDateISO,
    cycleCutoffDateISO,
    paymentDueDateISO
  };
}

/**
 * Resolves the exact billing cycle for a credit card transaction.
 *
 * Rules (Specification 5.2):
 * 1. Inclusive Cutoff: If purchase day <= effectiveCutoffDay(txYear, txMonth),
 *    baseCycleYM is (txYear, txMonth).
 * 2. Post-Cutoff: If purchase day > effectiveCutoffDay(txYear, txMonth),
 *    baseCycleYM is addMonths((txYear, txMonth), 1).
 * 3. Manual Transit Override ("Diferir al siguiente corte"):
 *    If deferToNextCycle === true, assignedCycleYM is addMonths(baseCycleYM, 1).
 *
 * @param {{
 *   txDateISO: string,
 *   cutoffDay: number,
 *   paymentDueDay: number,
 *   deferToNextCycle?: boolean
 * }} params
 * @returns {{
 *   baseCycleYM: string,
 *   assignedCycleYM: string,
 *   cycleStartDateISO: string,
 *   cycleCutoffDateISO: string,
 *   paymentDueDateISO: string
 * }}
 */
export function resolveBillingCycle({
  txDateISO,
  cutoffDay,
  paymentDueDay,
  deferToNextCycle = false
}) {
  const { year, month, day } = parseISODate(txDateISO);
  const effectiveCutoffDay = clampDayToMonth(year, month, cutoffDay);
  const txYM = formatYearMonth(year, month);

  const baseCycleYM = day <= effectiveCutoffDay
    ? txYM
    : addMonthsToYM(txYM, 1);

  const assignedCycleYM = deferToNextCycle
    ? addMonthsToYM(baseCycleYM, 1)
    : baseCycleYM;

  const dates = computeCycleDatesForYM(assignedCycleYM, cutoffDay, paymentDueDay);

  return {
    baseCycleYM,
    assignedCycleYM,
    cycleStartDateISO: dates.cycleStartDateISO,
    cycleCutoffDateISO: dates.cycleCutoffDateISO,
    paymentDueDateISO: dates.paymentDueDateISO
  };
}

/**
 * Determines the currently open billing cycle and the most recently closed
 * billing cycle for a credit card relative to `referenceDateISO`.
 *
 * @param {{
 *   referenceDateISO: string,
 *   cutoffDay: number,
 *   paymentDueDay: number
 * }} params
 * @returns {{
 *   activeCycleYM: string,
 *   activeStartDateISO: string,
 *   activeCutoffDateISO: string,
 *   activePaymentDueDateISO: string,
 *   daysUntilCutoff: number,
 *   previousClosedCycleYM: string,
 *   previousCutoffDateISO: string,
 *   previousPaymentDueDateISO: string,
 *   daysUntilPreviousPaymentDue: number
 * }}
 */
export function getActiveCardCycle({ referenceDateISO, cutoffDay, paymentDueDay }) {
  const active = resolveBillingCycle({
    txDateISO: referenceDateISO,
    cutoffDay,
    paymentDueDay,
    deferToNextCycle: false
  });

  const previousClosedCycleYM = addMonthsToYM(active.assignedCycleYM, -1);
  const previous = computeCycleDatesForYM(previousClosedCycleYM, cutoffDay, paymentDueDay);

  return {
    activeCycleYM: active.assignedCycleYM,
    activeStartDateISO: active.cycleStartDateISO,
    activeCutoffDateISO: active.cycleCutoffDateISO,
    activePaymentDueDateISO: active.paymentDueDateISO,
    daysUntilCutoff: diffDaysISO(referenceDateISO, active.cycleCutoffDateISO),
    previousClosedCycleYM,
    previousCutoffDateISO: previous.cycleCutoffDateISO,
    previousPaymentDueDateISO: previous.paymentDueDateISO,
    daysUntilPreviousPaymentDue: diffDaysISO(referenceDateISO, previous.paymentDueDateISO)
  };
}
