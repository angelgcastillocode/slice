import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addMonthsToYM,
  buildClampedDateISO,
  clampDayToMonth,
  daysInMonth,
  formatCentsToMXN,
  parseMXNToCents
} from '../js/engine/dateUtils.js';

import {
  computeCycleDatesForYM,
  getActiveCardCycle,
  resolveBillingCycle
} from '../js/engine/billingCycle.js';

import { buildMsiSchedule } from '../js/engine/msiEngine.js';

import {
  computeCardCycleSummary,
  computeDashboardMetrics,
  computeLiquidityBalances,
  computeReconciliationDelta
} from '../js/engine/accounting.js';

test('dateUtils: clamping days 30 and 31 in short months (Feb non-leap, Feb leap, April)', () => {
  // Feb 2027 (non-leap, 28 days)
  assert.equal(daysInMonth(2027, 2), 28);
  assert.equal(clampDayToMonth(2027, 2, 31), 28);
  assert.equal(clampDayToMonth(2027, 2, 30), 28);
  assert.equal(buildClampedDateISO(2027, 2, 31), '2027-02-28');

  // Feb 2028 (leap year, 29 days)
  assert.equal(daysInMonth(2028, 2), 29);
  assert.equal(clampDayToMonth(2028, 2, 31), 29);
  assert.equal(buildClampedDateISO(2028, 2, 31), '2028-02-29');

  // April 2026 (30 days)
  assert.equal(daysInMonth(2026, 4), 30);
  assert.equal(clampDayToMonth(2026, 4, 31), 30);
  assert.equal(buildClampedDateISO(2026, 4, 31), '2026-04-30');
});

test('dateUtils: MXN currency parsing and integer cents formatting without float drift', () => {
  assert.equal(parseMXNToCents('1250.50'), 125050);
  assert.equal(parseMXNToCents('$10,000.00 MXN'), 1000000);
  assert.equal(parseMXNToCents(19.99), 1999);
  assert.equal(formatCentsToMXN(125050), '$1,250.50');
  assert.equal(formatCentsToMXN(-35000), '-$350.00');
  assert.equal(formatCentsToMXN(65000, { signed: true, withCode: true }), '+$650.00 MXN');
});

test('billingCycle (CUJ 1 & CUJ 6): inclusive cutoff day, post-cutoff day, and deferToNextCycle toggle', () => {
  // Card with cutoff_day = 15, payment_due_day = 5 (next month since 5 <= 15)
  // 1) Purchase on exact cutoff day (Nov 15, 2026), default inclusive -> 2026-11 cycle
  const onCutoff = resolveBillingCycle({
    txDateISO: '2026-11-15',
    cutoffDay: 15,
    paymentDueDay: 5,
    deferToNextCycle: false
  });
  assert.equal(onCutoff.assignedCycleYM, '2026-11');
  assert.equal(onCutoff.cycleCutoffDateISO, '2026-11-15');
  assert.equal(onCutoff.paymentDueDateISO, '2026-12-05');

  // 2) Purchase on exact cutoff day (Nov 15, 2026) WITH "Diferir al siguiente corte" (transit charge)
  const deferredOnCutoff = resolveBillingCycle({
    txDateISO: '2026-11-15',
    cutoffDay: 15,
    paymentDueDay: 5,
    deferToNextCycle: true
  });
  assert.equal(deferredOnCutoff.baseCycleYM, '2026-11');
  assert.equal(deferredOnCutoff.assignedCycleYM, '2026-12');
  assert.equal(deferredOnCutoff.cycleStartDateISO, '2026-11-16');
  assert.equal(deferredOnCutoff.cycleCutoffDateISO, '2026-12-15');
  assert.equal(deferredOnCutoff.paymentDueDateISO, '2027-01-05');

  // 3) Purchase one day after cutoff (Nov 16, 2026) -> automatically enters 2026-12 cycle
  const afterCutoff = resolveBillingCycle({
    txDateISO: '2026-11-16',
    cutoffDay: 15,
    paymentDueDay: 5,
    deferToNextCycle: false
  });
  assert.equal(afterCutoff.assignedCycleYM, '2026-12');
  assert.equal(afterCutoff.paymentDueDateISO, '2027-01-05');

  // 4) Card with cutoff_day = 31, payment_due_day = 20 in Feb 2027 (CUJ 6)
  const febCycle = computeCycleDatesForYM('2027-02', 31, 20);
  assert.equal(febCycle.cycleCutoffDateISO, '2027-02-28');
  assert.equal(febCycle.paymentDueDateISO, '2027-03-20');
});

test('msiEngine (CUJ 2): cent-remainder allocation on new purchase vs backfill (startInstallment > 1)', () => {
  // Case A: New 3 MSI purchase of $1,000.00 (100,000 cents) -> 33,334 + 33,333 + 33,333 = 100,000
  const planNew = buildMsiSchedule({
    totalAmountCents: 100000,
    totalMonths: 3,
    startInstallment: 1,
    purchaseDateISO: '2026-11-10',
    cutoffDay: 20,
    paymentDueDay: 10,
    deferToNextCycle: false
  });
  assert.equal(planNew.projectedCount, 3);
  assert.equal(planNew.projectedTotalCents, 100000);
  assert.deepEqual(
    planNew.installments.map((i) => i.amountCents),
    [33334, 33333, 33333]
  );
  assert.deepEqual(
    planNew.installments.map((i) => i.cycleYearMonth),
    ['2026-11', '2026-12', '2027-01']
  );

  // Case B (CUJ 2): Backfill of $10,000.00 (1,000,000 cents) at 12 MSI starting at installment 4 of 12
  // Remainder of 4 cents was settled in historical installment 1/12; installments 4..12 are 83,333 cents each
  const planBackfill = buildMsiSchedule({
    totalAmountCents: 1000000,
    totalMonths: 12,
    startInstallment: 4,
    purchaseDateISO: '2026-11-14',
    cutoffDay: 20,
    paymentDueDay: 10,
    deferToNextCycle: false
  });
  assert.equal(planBackfill.baseInstallmentCents, 83333);
  assert.equal(planBackfill.remainderCents, 4);
  assert.equal(planBackfill.projectedCount, 9);
  assert.equal(planBackfill.projectedTotalCents, 749997); // 9 * $833.33 = $7,499.97
  assert.equal(planBackfill.installments[0].installmentNumber, 4);
  assert.equal(planBackfill.installments[0].cycleYearMonth, '2026-11');
  assert.equal(planBackfill.installments[0].amountCents, 83333);
  assert.equal(planBackfill.installments[8].installmentNumber, 12);
  assert.equal(planBackfill.installments[8].cycleYearMonth, addMonthsToYM('2026-11', 8));
});

test('accounting (CUJ 4 & CUJ 5): multiple liquidity accounts, Cuadrar Saldo reconciliation, and loans', () => {
  const accounts = [
    { id: 'acc-cash', name: 'Efectivo Físico', account_type: 'cash', initial_balance_cents: 145000, is_archived: false },
    { id: 'acc-debit', name: 'Débito Banco A', account_type: 'debit', initial_balance_cents: 820000, is_archived: false }
  ];

  // Initial check: $1,450 + $8,200 = $9,650 (965,000 cents)
  let balances = computeLiquidityBalances(accounts, []);
  assert.equal(balances.totalLiquidCents, 965000);

  // CUJ 4: Reconcile "Efectivo Físico" from $1,450.00 to observed real $2,100.00 (+$650.00)
  const recon = computeReconciliationDelta(145000, 210000);
  assert.equal(recon.deltaCents, 65000);
  assert.equal(recon.adjustmentDirection, 'inflow');
  assert.equal(recon.amountCents, 65000);

  const transactions = [
    {
      id: 'tx-recon-1',
      tx_type: 'balance_adjustment',
      adjustment_direction: recon.adjustmentDirection,
      amount_cents: recon.amountCents,
      liquidity_account_id: 'acc-cash',
      tx_date: '2026-11-14'
    },
    // CUJ 5: Loan of $1,000.00 to "Contacto A" from Débito Banco A
    {
      id: 'tx-loan-1',
      tx_type: 'loan_disbursement',
      amount_cents: 100000,
      liquidity_account_id: 'acc-debit',
      loan_id: 'loan-1',
      tx_date: '2026-11-14'
    },
    // CUJ 5: Partial repayment of $400.00 from "Contacto A" into Efectivo Físico
    {
      id: 'tx-loan-rep-1',
      tx_type: 'loan_repayment',
      amount_cents: 40000,
      liquidity_account_id: 'acc-cash',
      loan_id: 'loan-1',
      tx_date: '2026-11-17'
    }
  ];

  balances = computeLiquidityBalances(accounts, transactions);
  // Efectivo Físico: $1,450 + $650 (arqueo) + $400 (abono préstamo) = $2,500.00 (250,000 cents)
  assert.equal(balances.byAccountId.get('acc-cash'), 250000);
  // Débito Banco A: $8,200 - $1,000 (préstamo) = $7,200.00 (720,000 cents)
  assert.equal(balances.byAccountId.get('acc-debit'), 720000);
  // Total Líquido: $9,700.00 (970,000 cents)
  assert.equal(balances.totalLiquidCents, 970000);
});

test('accounting (CUJ 1 & CUJ 3): recurring expenses without double-counting and credit card refunds / saldo a favor', () => {
  const accounts = [
    { id: 'acc-debit', name: 'Débito Banco A', account_type: 'debit', initial_balance_cents: 1000000, is_archived: false }
  ];
  const cards = [
    { id: 'card-b', name: 'TDC Banco B', bank_name: 'Banco B', cutoff_day: 20, payment_due_day: 10, is_archived: false }
  ];
  const recurringExpenses = [
    {
      id: 'rec-ai',
      name: 'Suscripción IA',
      amount_cents: 10000, // $100.00
      billing_day: 8,
      payment_method_type: 'credit_card',
      credit_card_id: 'card-b',
      is_active: true
    },
    {
      id: 'rec-gym',
      name: 'Gimnasio',
      amount_cents: 25000, // $250.00
      billing_day: 1,
      payment_method_type: 'liquidity_account',
      liquidity_account_id: 'acc-debit',
      is_active: true
    }
  ];

  // Step 1: Both recurring expenses are pending in 2026-11
  let metrics = computeDashboardMetrics({
    referenceDateISO: '2026-11-14',
    currentYM: '2026-11',
    liquidityAccounts: accounts,
    creditCards: cards,
    transactions: [],
    msiInstallments: [],
    recurringExpenses,
    recurringLogs: [],
    loans: []
  });

  // Gimnasio ($250) is pending debit -> deducted from Liquidez Libre ($10,000 - $250 = $9,750)
  // Suscripción IA ($100) is on TDC -> NOT deducted from Liquidez Libre, added to Acumulado Próximo Corte ($100)
  assert.equal(metrics.freeLiquidityMonthCents, 975000);
  assert.equal(metrics.nextCutoffAccruedCents, 10000);

  // Step 2: Mark both Gimnasio and Suscripción IA as PAID
  const paidLogs = [
    { recurring_expense_id: 'rec-gym', year_month: '2026-11', status: 'paid', transaction_id: 'tx-gym' },
    { recurring_expense_id: 'rec-ai', year_month: '2026-11', status: 'paid', transaction_id: 'tx-ai' }
  ];
  const paidTransactions = [
    {
      id: 'tx-gym',
      tx_type: 'liquidity_expense',
      amount_cents: 25000,
      liquidity_account_id: 'acc-debit',
      recurring_expense_id: 'rec-gym',
      tx_date: '2026-11-01'
    },
    {
      id: 'tx-ai',
      tx_type: 'card_charge',
      amount_cents: 10000,
      credit_card_id: 'card-b',
      assigned_cycle_ym: '2026-11',
      recurring_expense_id: 'rec-ai',
      tx_date: '2026-11-08'
    }
  ];

  metrics = computeDashboardMetrics({
    referenceDateISO: '2026-11-14',
    currentYM: '2026-11',
    liquidityAccounts: accounts,
    creditCards: cards,
    transactions: paidTransactions,
    msiInstallments: [],
    recurringExpenses,
    recurringLogs: paidLogs,
    loans: []
  });

  // Zero double counting!
  // Liquidez Libre remains $9,750.00 (now Total Líquido is $9,750 and pendingDebitRecurring is $0)
  assert.equal(metrics.totalLiquidCents, 975000);
  assert.equal(metrics.pendingDebitRecurringCents, 0);
  assert.equal(metrics.freeLiquidityMonthCents, 975000);
  // Acumulado Próximo Corte on TDC Banco B remains $100.00 (moved from pendingRecurring to contadoCharges)
  assert.equal(metrics.nextCutoffAccruedCents, 10000);

  // Step 3: Add a credit card refund of $300.00 (exceeding the $100.00 charge -> -$200.00 Saldo a Favor)
  const summaryWithRefund = computeCardCycleSummary({
    card: cards[0],
    cycleYM: '2026-11',
    transactions: [
      ...paidTransactions,
      {
        id: 'tx-refund-1',
        tx_type: 'card_refund',
        amount_cents: 30000,
        credit_card_id: 'card-b',
        assigned_cycle_ym: '2026-11',
        tx_date: '2026-11-12'
      }
    ],
    msiInstallments: [],
    recurringExpenses,
    recurringLogs: paidLogs
  });

  assert.equal(summaryWithRefund.grossBalanceCents, -20000);
  assert.equal(summaryWithRefund.creditFavorCents, 20000);
  assert.equal(summaryWithRefund.remainingPayableCents, 0);
});


test('accounting: closed statement due in current month & statement payment invariance on Liquidez Libre', () => {
  const accounts = [
    { id: 'acc-debit', name: 'Plata Débito', account_type: 'debit', initial_balance_cents: 500000, is_archived: false }
  ];
  const cards = [
    // Cuts on the 18th, pays on the 8th of next month
    // For referenceDate = '2026-11-14', activeCycle is '2026-11' (cuts Nov 18, due Dec 8).
    // Previous closed cycle is '2026-10' (cut Oct 18, due Nov 8 -> due in 2026-11!).
    { id: 'card-nu', name: 'Nu Black', bank_name: 'Nu', cutoff_day: 18, payment_due_day: 8, is_archived: false }
  ];

  const txUnpaid = [
    {
      id: 'tx-oct-charge',
      tx_type: 'card_charge',
      amount_cents: 125000, // $1,250.00 closed statement from 2026-10 due on 2026-11-08
      credit_card_id: 'card-nu',
      assigned_cycle_ym: '2026-10',
      tx_date: '2026-10-10'
    }
  ];

  // Before paying the statement:
  // Total Líquido = $5,000.00; Due Statement this month = $1,250.00 -> Liquidez Libre = $3,750.00
  const beforePay = computeDashboardMetrics({
    referenceDateISO: '2026-11-14',
    currentYM: '2026-11',
    liquidityAccounts: accounts,
    creditCards: cards,
    transactions: txUnpaid,
    msiInstallments: [],
    recurringExpenses: [],
    recurringLogs: [],
    loans: []
  });
  assert.equal(beforePay.totalLiquidCents, 500000);
  assert.equal(beforePay.dueStatementsThisMonthCents, 125000);
  assert.equal(beforePay.freeLiquidityMonthCents, 375000);

  // Now pay the $1,250.00 statement from Plata Débito:
  // Total Líquido drops to $3,750.00, Due Statement drops to $0.00 -> Liquidez Libre stays $3,750.00!
  const afterPay = computeDashboardMetrics({
    referenceDateISO: '2026-11-14',
    currentYM: '2026-11',
    liquidityAccounts: accounts,
    creditCards: cards,
    transactions: [
      ...txUnpaid,
      {
        id: 'tx-pay-oct',
        tx_type: 'card_payment',
        amount_cents: 125000,
        liquidity_account_id: 'acc-debit',
        credit_card_id: 'card-nu',
        assigned_cycle_ym: '2026-10',
        tx_date: '2026-11-08'
      }
    ],
    msiInstallments: [],
    recurringExpenses: [],
    recurringLogs: [],
    loans: []
  });
  assert.equal(afterPay.totalLiquidCents, 375000);
  assert.equal(afterPay.dueStatementsThisMonthCents, 0);
  assert.equal(afterPay.freeLiquidityMonthCents, 375000);
});

test('billingCycle: same-month payment due date when paymentDueDay > cutoffDay', () => {
  // Cutoff day 5, payment due day 25 -> due in same month
  const sameMonthDue = resolveBillingCycle({
    txDateISO: '2026-11-04',
    cutoffDay: 5,
    paymentDueDay: 25,
    deferToNextCycle: false
  });
  assert.equal(sameMonthDue.assignedCycleYM, '2026-11');
  assert.equal(sameMonthDue.cycleCutoffDateISO, '2026-11-05');
  assert.equal(sameMonthDue.paymentDueDateISO, '2026-11-25');
});
