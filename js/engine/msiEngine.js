/**
 * Slice Financial Engine - Meses Sin Intereses (MSI) Projection & Backfill Engine
 * Operates strictly in integer cents with deterministic cent-remainder allocation
 * and historical backfill support (startInstallment = X of N).
 */

import { addMonthsToYM } from './dateUtils.js';
import { computeCycleDatesForYM, resolveBillingCycle } from './billingCycle.js';

export const ALLOWED_MSI_TERMS = [3, 6, 9, 12, 18, 24];

/**
 * Generates the projected MSI installment schedule (Specification 5.3).
 *
 * Cent-remainder rule:
 * - q = Math.floor(totalAmountCents / totalMonths)
 * - r = totalAmountCents % totalMonths
 * - Installment 1 receives (q + r) cents; installments 2..N receive q cents.
 * - When startInstallment > 1 (backfill of a pre-existing MSI purchase),
 *   the remainder r is assumed settled in historical installment 1, so
 *   all generated installments (startInstallment..totalMonths) receive q cents.
 *
 * @param {{
 *   totalAmountCents: number,
 *   totalMonths: number,
 *   startInstallment?: number,
 *   purchaseDateISO: string,
 *   cutoffDay: number,
 *   paymentDueDay: number,
 *   deferToNextCycle?: boolean
 * }} params
 * @returns {{
 *   firstActiveCycleYM: string,
 *   baseInstallmentCents: number,
 *   remainderCents: number,
 *   projectedCount: number,
 *   projectedTotalCents: number,
 *   installments: Array<{
 *     installmentNumber: number,
 *     totalInstallments: number,
 *     cycleYearMonth: string,
 *     cycleCutoffDateISO: string,
 *     paymentDueDateISO: string,
 *     amountCents: number,
 *     isSettled: boolean
 *   }>
 * }}
 */
export function buildMsiSchedule({
  totalAmountCents,
  totalMonths,
  startInstallment = 1,
  purchaseDateISO,
  cutoffDay,
  paymentDueDay,
  deferToNextCycle = false
}) {
  const totalCents = Math.round(Number(totalAmountCents));
  const months = Number(totalMonths);
  const startInst = Number(startInstallment);

  if (!Number.isInteger(totalCents) || totalCents <= 0) {
    throw new Error('totalAmountCents must be a positive integer');
  }
  if (!ALLOWED_MSI_TERMS.includes(months)) {
    throw new Error(`Invalid MSI term: ${months}. Allowed: ${ALLOWED_MSI_TERMS.join(', ')}`);
  }
  if (!Number.isInteger(startInst) || startInst < 1 || startInst > months) {
    throw new Error(`startInstallment must be between 1 and ${months}`);
  }

  const baseInstallmentCents = Math.floor(totalCents / months);
  const remainderCents = totalCents % months;

  const firstCycle = resolveBillingCycle({
    txDateISO: purchaseDateISO,
    cutoffDay,
    paymentDueDay,
    deferToNextCycle
  });
  const firstActiveCycleYM = firstCycle.assignedCycleYM;

  const installments = [];
  let projectedTotalCents = 0;

  for (let i = startInst; i <= months; i++) {
    const monthOffset = i - startInst;
    const cycleYearMonth = addMonthsToYM(firstActiveCycleYM, monthOffset);
    const cycleDates = computeCycleDatesForYM(cycleYearMonth, cutoffDay, paymentDueDay);

    const amountCents = i === 1
      ? baseInstallmentCents + remainderCents
      : baseInstallmentCents;

    projectedTotalCents += amountCents;

    installments.push({
      installmentNumber: i,
      totalInstallments: months,
      cycleYearMonth,
      cycleCutoffDateISO: cycleDates.cycleCutoffDateISO,
      paymentDueDateISO: cycleDates.paymentDueDateISO,
      amountCents,
      isSettled: false
    });
  }

  return {
    firstActiveCycleYM,
    baseInstallmentCents,
    remainderCents,
    projectedCount: installments.length,
    projectedTotalCents,
    installments
  };
}
