/**
 * Slice Financial Engine - Accounting, Liquidity, Reconciliations,
 * Credit Card Statements, Loans & Dashboard Aggregations.
 * Follows Equations 5.4.1 - 5.4.6 strictly in integer cents.
 */

import { addMonthsToYM, buildClampedDateISO, parseYearMonth } from './dateUtils.js';
import { computeCycleDatesForYM, getActiveCardCycle, resolveBillingCycle } from './billingCycle.js';

/**
 * Computes current balances for all active liquidity accounts (Equation 5.4.1 & 5.4.2).
 *
 * @param {Array<Object>} liquidityAccounts
 * @param {Array<Object>} transactions
 * @returns {{
 *   byAccountId: Map<string, number>,
 *   accountsBreakdown: Array<{
 *     id: string,
 *     name: string,
 *     account_type: string,
 *     color_hex: string,
 *     balanceCents: number
 *   }>,
 *   totalLiquidCents: number
 * }}
 */
export function computeLiquidityBalances(liquidityAccounts = [], transactions = []) {
  const byAccountId = new Map();

  for (const acc of liquidityAccounts) {
    if (acc.is_archived) continue;
    byAccountId.set(acc.id, Math.round(Number(acc.initial_balance_cents) || 0));
  }

  for (const tx of transactions) {
    const amount = Math.round(Number(tx.amount_cents) || 0);
    if (amount <= 0) continue;

    const accId = tx.liquidity_account_id;
    const targetAccId = tx.target_liquidity_account_id;

    switch (tx.tx_type) {
      case 'income':
      case 'loan_repayment':
        if (accId && byAccountId.has(accId)) {
          byAccountId.set(accId, byAccountId.get(accId) + amount);
        }
        break;

      case 'liquidity_expense':
      case 'card_payment':
      case 'loan_disbursement':
        if (accId && byAccountId.has(accId)) {
          byAccountId.set(accId, byAccountId.get(accId) - amount);
        }
        break;

      case 'account_transfer':
        if (accId && byAccountId.has(accId)) {
          byAccountId.set(accId, byAccountId.get(accId) - amount);
        }
        if (targetAccId && byAccountId.has(targetAccId)) {
          byAccountId.set(targetAccId, byAccountId.get(targetAccId) + amount);
        }
        break;

      case 'balance_adjustment':
        if (accId && byAccountId.has(accId)) {
          if (tx.adjustment_direction === 'inflow') {
            byAccountId.set(accId, byAccountId.get(accId) + amount);
          } else if (tx.adjustment_direction === 'outflow') {
            byAccountId.set(accId, byAccountId.get(accId) - amount);
          }
        }
        break;

      default:
        break;
    }
  }

  let totalLiquidCents = 0;
  const accountsBreakdown = [];

  for (const acc of liquidityAccounts) {
    if (acc.is_archived) continue;
    const balanceCents = byAccountId.get(acc.id) ?? 0;
    totalLiquidCents += balanceCents;
    accountsBreakdown.push({
      id: acc.id,
      name: acc.name,
      account_type: acc.account_type,
      color_hex: acc.color_hex,
      balanceCents
    });
  }

  return {
    byAccountId,
    accountsBreakdown,
    totalLiquidCents
  };
}

/**
 * Computes the instant balance reconciliation delta ("Cuadrar Saldo", Equation 5.4.3).
 *
 * @param {number} currentSystemBalanceCents
 * @param {number} observedRealBalanceCents
 * @returns {{
 *   deltaCents: number,
 *   adjustmentDirection: 'inflow' | 'outflow' | null,
 *   amountCents: number
 * }}
 */
export function computeReconciliationDelta(currentSystemBalanceCents, observedRealBalanceCents) {
  const sys = Math.round(Number(currentSystemBalanceCents) || 0);
  const real = Math.round(Number(observedRealBalanceCents) || 0);
  const deltaCents = real - sys;

  if (deltaCents === 0) {
    return {
      deltaCents: 0,
      adjustmentDirection: null,
      amountCents: 0
    };
  }

  return {
    deltaCents,
    adjustmentDirection: deltaCents > 0 ? 'inflow' : 'outflow',
    amountCents: Math.abs(deltaCents)
  };
}

/**
 * Helper to look up the status of a recurring expense for a specific 'YYYY-MM'.
 * If no log row exists yet for that month, its status is treated as 'pending'.
 *
 * @param {string} recurringExpenseId
 * @param {string} yearMonth
 * @param {Array<Object>} recurringLogs
 * @returns {'pending' | 'paid' | 'skipped'}
 */
export function getRecurringStatusForMonth(recurringExpenseId, yearMonth, recurringLogs = []) {
  const log = recurringLogs.find(
    (l) => l.recurring_expense_id === recurringExpenseId && l.year_month === yearMonth
  );
  return log ? log.status : 'pending';
}

/**
 * Computes the complete statement summary for a credit card `card` in billing cycle `cycleYM`
 * (Equation 5.4.4).
 *
 * Intra-cycle double-counting prevention:
 * - Recurring expenses linked to `card.id` whose monthly occurrence maps to `cycleYM`
 *   are included in `pendingRecurringCents` ONLY while their monthly log status is 'pending'.
 * - Once marked as 'paid', a real `card_charge` transaction exists in `transactions`
 *   (counted in `contadoChargesCents`) and the log status is 'paid', so it is no longer
 *   counted in `pendingRecurringCents`.
 *
 * Refund & Credit Favor ("Saldo a Favor") rule:
 * - `grossBalanceCents = contadoChargesCents + msiInstallmentsCents + pendingRecurringCents - refundsCents`
 * - If `grossBalanceCents < 0`, `creditFavorCents = Math.abs(grossBalanceCents)` and
 *   `remainingPayableCents = 0`.
 *
 * @param {{
 *   card: Object,
 *   cycleYM: string,
 *   transactions?: Array<Object>,
 *   msiInstallments?: Array<Object>,
 *   recurringExpenses?: Array<Object>,
 *   recurringLogs?: Array<Object>
 * }} params
 * @returns {{
 *   cardId: string,
 *   cycleYM: string,
 *   cycleStartDateISO: string,
 *   cycleCutoffDateISO: string,
 *   paymentDueDateISO: string,
 *   contadoChargesCents: number,
 *   msiInstallmentsCents: number,
 *   pendingRecurringCents: number,
 *   refundsCents: number,
 *   grossBalanceCents: number,
 *   creditFavorCents: number,
 *   paymentsAppliedCents: number,
 *   remainingPayableCents: number
 * }}
 */
export function computeCardCycleSummary({
  card,
  cycleYM,
  transactions = [],
  msiInstallments = [],
  recurringExpenses = [],
  recurringLogs = [],
  includePendingRecurring = true
}) {
  const cycleDates = computeCycleDatesForYM(cycleYM, card.cutoff_day, card.payment_due_day);

  let contadoChargesCents = 0;
  let refundsCents = 0;
  let paymentsAppliedCents = 0;

  for (const tx of transactions) {
    if (tx.credit_card_id !== card.id) continue;
    if (tx.assigned_cycle_ym !== cycleYM) continue;
    const amount = Math.round(Number(tx.amount_cents) || 0);

    if (tx.tx_type === 'card_charge') {
      contadoChargesCents += amount;
    } else if (tx.tx_type === 'card_refund') {
      refundsCents += amount;
    } else if (tx.tx_type === 'card_payment') {
      paymentsAppliedCents += amount;
    }
  }

  let msiInstallmentsCents = 0;
  for (const inst of msiInstallments) {
    if (inst.credit_card_id !== card.id) continue;
    if (inst.cycle_year_month !== cycleYM) continue;
    if (inst.is_settled) continue;
    msiInstallmentsCents += Math.round(Number(inst.amount_cents) || 0);
  }

  // Check candidate calendar months (prevMonth, cycleYM) whose billing_day maps into cycleYM
  const candidateMonths = [addMonthsToYM(cycleYM, -1), cycleYM];
  let pendingRecurringCents = 0;

  if (includePendingRecurring) {
    for (const rec of recurringExpenses) {
      if (!rec.is_active) continue;
      if (rec.payment_method_type !== 'credit_card' || rec.credit_card_id !== card.id) continue;

      for (const candYM of candidateMonths) {
        const { year, month } = parseYearMonth(candYM);
        const dueDateISO = buildClampedDateISO(year, month, rec.billing_day);
        const resolved = resolveBillingCycle({
          txDateISO: dueDateISO,
          cutoffDay: card.cutoff_day,
          paymentDueDay: card.payment_due_day,
          deferToNextCycle: false
        });

        if (resolved.assignedCycleYM === cycleYM) {
          const status = getRecurringStatusForMonth(rec.id, candYM, recurringLogs);
          if (status === 'pending') {
            pendingRecurringCents += Math.round(Number(rec.amount_cents) || 0);
          }
        }
      }
    }
  }

  const grossBalanceCents =
    contadoChargesCents + msiInstallmentsCents + pendingRecurringCents - refundsCents;

  const creditFavorCents = grossBalanceCents < 0 ? Math.abs(grossBalanceCents) : 0;
  const remainingPayableCents = Math.max(0, grossBalanceCents - paymentsAppliedCents);

  return {
    cardId: card.id,
    cycleYM,
    cycleStartDateISO: cycleDates.cycleStartDateISO,
    cycleCutoffDateISO: cycleDates.cycleCutoffDateISO,
    paymentDueDateISO: cycleDates.paymentDueDateISO,
    contadoChargesCents,
    msiInstallmentsCents,
    pendingRecurringCents,
    refundsCents,
    grossBalanceCents,
    creditFavorCents,
    paymentsAppliedCents,
    remainingPayableCents
  };
}

/**
 * Computes all primary and secondary financial indicators for the Slice Dashboard
 * (Equations 5.4.1 - 5.4.6).
 *
 * @param {{
 *   referenceDateISO: string,
 *   currentYM: string,
 *   liquidityAccounts?: Array<Object>,
 *   creditCards?: Array<Object>,
 *   transactions?: Array<Object>,
 *   msiInstallments?: Array<Object>,
 *   recurringExpenses?: Array<Object>,
 *   recurringLogs?: Array<Object>,
 *   loans?: Array<Object>
 * }} params
 */
export function computeDashboardMetrics({
  referenceDateISO,
  currentYM,
  liquidityAccounts = [],
  creditCards = [],
  transactions = [],
  msiInstallments = [],
  recurringExpenses = [],
  recurringLogs = [],
  loans = []
}) {
  // 1. Liquidity accounts & consolidated Total Líquido
  const { byAccountId, accountsBreakdown, totalLiquidCents } = computeLiquidityBalances(
    liquidityAccounts,
    transactions
  );

  // 2. Pending recurring expenses paid via liquidity accounts (debit/cash) in currentYM
  let pendingDebitRecurringCents = 0;
  let paidDebitRecurringCents = 0;
  let totalRecurringMonthCents = 0;
  let paidRecurringMonthCents = 0;

  for (const rec of recurringExpenses) {
    if (!rec.is_active) continue;
    const amount = Math.round(Number(rec.amount_cents) || 0);
    const status = getRecurringStatusForMonth(rec.id, currentYM, recurringLogs);

    totalRecurringMonthCents += amount;
    if (status === 'paid') {
      paidRecurringMonthCents += amount;
    }

    if (rec.payment_method_type === 'liquidity_account') {
      if (status === 'pending') {
        pendingDebitRecurringCents += amount;
      } else if (status === 'paid') {
        paidDebitRecurringCents += amount;
      }
    }
  }

  // 3. Credit card cycles:
  //    - Statements whose paymentDueDateISO falls inside `currentYM` AND have already cut off
  //      (or whose cutoff is in `currentYM` / `prevYM` with due date in `currentYM`)
  //    - Active cycle accrued amount ("Acumulado Próximo Corte")
  //    - Total committed MSI debt across active and future cycles
  let dueStatementsThisMonthCents = 0;
  let nextCutoffAccruedCents = 0;
  let totalCommittedMsiCents = 0;
  const cardSummaries = [];

  for (const card of creditCards) {
    if (card.is_archived) continue;

    const cycleInfo = getActiveCardCycle({
      referenceDateISO,
      cutoffDay: card.cutoff_day,
      paymentDueDay: card.payment_due_day
    });

    const activeSummary = computeCardCycleSummary({
      card,
      cycleYM: cycleInfo.activeCycleYM,
      transactions,
      msiInstallments,
      recurringExpenses,
      recurringLogs
    });

    const previousClosedSummary = computeCardCycleSummary({
      card,
      cycleYM: cycleInfo.previousClosedCycleYM,
      transactions,
      msiInstallments,
      recurringExpenses,
      recurringLogs,
      includePendingRecurring: false
    });

    // Accumulated in the currently open cycle ("Acumulado Próximo Corte")
    nextCutoffAccruedCents += activeSummary.remainingPayableCents;

    // Statements whose payment_due_date falls in currentYM and belong to a closed statement
    // (or any cycle <= previousClosedCycleYM whose paymentDueDate starts with currentYM)
    const candidateClosedCycles = [
      addMonthsToYM(currentYM, -1),
      currentYM
    ];
    const seenCycles = new Set();

    for (const cYM of candidateClosedCycles) {
      if (seenCycles.has(cYM)) continue;
      seenCycles.add(cYM);
      // Only closed cycles (cycleYM < activeCycleYM) are exigibles as closed statements
      if (cYM < cycleInfo.activeCycleYM) {
        const sum = computeCardCycleSummary({
          card,
          cycleYM: cYM,
          transactions,
          msiInstallments,
          recurringExpenses,
          recurringLogs,
          includePendingRecurring: false
        });
        if (sum.paymentDueDateISO.startsWith(currentYM)) {
          dueStatementsThisMonthCents += sum.remainingPayableCents;
        }
      }
    }

    // Total committed MSI debt for this card (active cycle + all future cycles)
    let cardCommittedMsiCents = 0;
    for (const inst of msiInstallments) {
      if (inst.credit_card_id !== card.id) continue;
      if (inst.is_settled) continue;
      if (inst.cycle_year_month >= cycleInfo.activeCycleYM) {
        cardCommittedMsiCents += Math.round(Number(inst.amount_cents) || 0);
      }
    }
    totalCommittedMsiCents += cardCommittedMsiCents;

    cardSummaries.push({
      card,
      cycleInfo,
      activeSummary,
      previousClosedSummary,
      cardCommittedMsiCents
    });
  }

  // 4. Free Liquidity of the Month (Equation 5.4.5)
  const freeLiquidityMonthCents =
    totalLiquidCents - dueStatementsThisMonthCents - pendingDebitRecurringCents;

  // 5. Total Receivable from Third-Party Loans ("Me deben", Equation 5.4.6)
  let totalReceivableLoansCents = 0;
  let activeLoansCount = 0;
  for (const loan of loans) {
    if (loan.status !== 'active') continue;
    const pending = Math.max(
      0,
      Math.round(Number(loan.principal_cents) || 0) - Math.round(Number(loan.repaid_cents) || 0)
    );
    if (pending > 0) {
      totalReceivableLoansCents += pending;
      activeLoansCount += 1;
    }
  }

  return {
    totalLiquidCents,
    byAccountId,
    accountsBreakdown,
    dueStatementsThisMonthCents,
    pendingDebitRecurringCents,
    paidDebitRecurringCents,
    totalRecurringMonthCents,
    paidRecurringMonthCents,
    freeLiquidityMonthCents,
    nextCutoffAccruedCents,
    totalCommittedMsiCents,
    totalReceivableLoansCents,
    activeLoansCount,
    cardSummaries
  };
}
