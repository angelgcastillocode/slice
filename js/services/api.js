/**
 * Slice - Capa de Acceso a Datos en Producción (Supabase PostgREST + Caché Stale-While-Revalidate)
 */

import { USE_LOCAL_DEMO_MODE } from '../config.js';
import { getSupabaseClient } from '../supabaseClient.js';
import {
  getState,
  hydrateFromLocalCache,
  setState
} from '../store.js';
import { buildClampedDateISO, formatCentsToMXN, parseYearMonth } from '../engine/dateUtils.js';
import { resolveBillingCycle } from '../engine/billingCycle.js';
import { buildMsiSchedule } from '../engine/msiEngine.js';
import {
  computeLiquidityBalances,
  computeReconciliationDelta
} from '../engine/accounting.js';

/**
 * Genera un UUID v4 válido para llaves primarias en PostgreSQL.
 */
function genUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function findCategoryIdByName(categories, keyword, fallbackKind = null) {
  const lower = keyword.toLowerCase();
  const match = categories.find((c) => c.name.toLowerCase().includes(lower));
  if (match) return match.id;
  if (fallbackKind) {
    const byKind = categories.find((c) => c.kind === fallbackKind);
    if (byKind) return byKind.id;
  }
  return categories[0]?.id || null;
}

function assertNoSupabaseError(result, contextMsg) {
  if (result?.error) {
    console.error(`[Supabase Error - ${contextMsg}]`, result.error);
    throw new Error(`${contextMsg}: ${result.error.message}`);
  }
}

/**
 * Carga inicial con estrategia Stale-While-Revalidate:
 * 1. Hidrata inmediatamente desde localStorage si pertenece al mismo usuario.
 * 2. Ejecuta `seed_default_categories_for_user` en PostgreSQL si aún no tiene categorías.
 * 3. Consulta en paralelo las 9 tablas desde PostgREST y actualiza estado y caché local.
 */
export async function fetchInitialSnapshot(userId) {
  if (!userId) return getState();

  // 1. Stale-while-revalidate: mostrar caché instantáneamente mientras responde Supabase
  const hadCache = hydrateFromLocalCache(userId);
  setState({ isSyncing: true }, false);

  if (USE_LOCAL_DEMO_MODE) {
    setState({ isSyncing: false }, false);
    return getState();
  }

  const supabase = await getSupabaseClient();
  if (!supabase) {
    setState({ isSyncing: false }, false);
    return getState();
  }

  try {
    // 2. Garantizar catálogo inicial de categorías del usuario en PostgreSQL
    if (!hadCache || getState().categories.length === 0) {
      const seedRes = await supabase.rpc('seed_default_categories_for_user', {
        p_user_id: userId
      });
      if (seedRes.error) {
        console.warn('Aviso al inicializar categorías:', seedRes.error.message);
      }
    }

    // 3. Consultar las 9 tablas protegidas por RLS
    let [
      accRes,
      cardRes,
      catRes,
      msiPlanRes,
      msiInstRes,
      recRes,
      recLogRes,
      loanRes,
      txRes
    ] = await Promise.all([
      supabase.from('liquidity_accounts').select('*').order('sort_order'),
      supabase.from('credit_cards').select('*').order('sort_order'),
      supabase.from('categories').select('*').order('sort_order'),
      supabase.from('msi_plans').select('*').order('created_at', { ascending: false }),
      supabase.from('msi_installments').select('*').order('installment_number'),
      supabase.from('recurring_expenses').select('*').order('billing_day'),
      supabase.from('recurring_expense_logs').select('*'),
      supabase.from('loans').select('*').order('created_at', { ascending: false }),
      supabase.from('transactions').select('*').order('tx_date', { ascending: false }).order('created_at', { ascending: false })
    ]);

    // Si el usuario aún no tenía categorías en la primera lectura, ejecutar el RPC y recargar categorías
    if (!catRes.error && (!catRes.data || catRes.data.length === 0)) {
      await supabase.rpc('seed_default_categories_for_user', { p_user_id: userId });
      catRes = await supabase.from('categories').select('*').order('sort_order');
    }

    setState({
      isSyncing: false,
      liquidityAccounts: accRes.data || [],
      creditCards: cardRes.data || [],
      categories: catRes.data || [],
      msiPlans: msiPlanRes.data || [],
      msiInstallments: msiInstRes.data || [],
      recurringExpenses: recRes.data || [],
      recurringLogs: recLogRes.data || [],
      loans: loanRes.data || [],
      transactions: txRes.data || []
    }, true);
  } catch (err) {
    console.error('Error sincronizando con Supabase:', err);
    setState({ isSyncing: false }, false);
  }

  return getState();
}

/**
 * Arqueo Rápido ("Cuadrar Saldo"): calcula la diferencia contra el saldo real observado
 * e inserta una transacción `balance_adjustment` en PostgreSQL.
 */
export async function reconcileLiquidityAccount({
  accountId,
  observedRealBalanceCents,
  txDateISO
}) {
  const state = getState();
  const userId = state.user?.id;
  if (!userId) throw new Error('Sesión no activa');

  const { byAccountId } = computeLiquidityBalances(state.liquidityAccounts, state.transactions);
  const currentSystemBalanceCents = byAccountId.get(accountId) ?? 0;

  const { deltaCents, adjustmentDirection, amountCents } = computeReconciliationDelta(
    currentSystemBalanceCents,
    observedRealBalanceCents
  );

  if (deltaCents === 0 || !adjustmentDirection) {
    return { adjusted: false, deltaCents: 0 };
  }

  const account = state.liquidityAccounts.find((a) => a.id === accountId);
  const adjustCatId = findCategoryIdByName(state.categories, 'Arqueo', 'system');

  const newTx = {
    id: genUUID(),
    user_id: userId,
    tx_type: 'balance_adjustment',
    tx_date: txDateISO || state.referenceDateISO,
    amount_cents: amountCents,
    adjustment_direction: adjustmentDirection,
    liquidity_account_id: accountId,
    target_liquidity_account_id: null,
    credit_card_id: null,
    defer_to_next_cycle: false,
    assigned_cycle_ym: null,
    cycle_cutoff_date: null,
    payment_due_date: null,
    category_id: adjustCatId,
    recurring_expense_id: null,
    loan_id: null,
    description: `Arqueo ${account?.name || ''} (${formatCentsToMXN(currentSystemBalanceCents)} → ${formatCentsToMXN(observedRealBalanceCents)})`,
    metadata: {},
    created_at: new Date().toISOString()
  };

  if (!USE_LOCAL_DEMO_MODE) {
    const supabase = await getSupabaseClient();
    const res = await supabase.from('transactions').insert(newTx);
    assertNoSupabaseError(res, 'No se pudo guardar el arqueo de saldo');
  }

  setState({
    transactions: [newTx, ...state.transactions]
  });

  return { adjusted: true, deltaCents, transaction: newTx };
}

/**
 * Registro Rápido (<10s): Ingreso, Gasto Contado, Cargo Tarjeta Contado o Reembolso TDC.
 */
export async function createQuickTransaction({
  txType, // 'income' | 'liquidity_expense' | 'card_charge' | 'card_refund'
  amountCents,
  txDateISO,
  liquidityAccountId = null,
  creditCardId = null,
  categoryId = null,
  deferToNextCycle = false,
  description = ''
}) {
  const state = getState();
  const userId = state.user?.id;
  if (!userId) throw new Error('Inicia sesión para registrar movimientos');

  const dateISO = txDateISO || state.referenceDateISO;
  const cleanCents = Math.round(Number(amountCents));
  if (!cleanCents || cleanCents <= 0) {
    throw new Error('Ingresa un monto mayor a $0.00 MXN');
  }

  let assignedCycleYM = null;
  let cycleCutoffDate = null;
  let paymentDueDate = null;

  if (txType === 'card_charge' || txType === 'card_refund') {
    const card = state.creditCards.find((c) => c.id === creditCardId);
    if (!card) throw new Error('Crea o selecciona una tarjeta de crédito');
    const resolved = resolveBillingCycle({
      txDateISO: dateISO,
      cutoffDay: card.cutoff_day,
      paymentDueDay: card.payment_due_day,
      deferToNextCycle: Boolean(deferToNextCycle)
    });
    assignedCycleYM = resolved.assignedCycleYM;
    cycleCutoffDate = resolved.cycleCutoffDateISO;
    paymentDueDate = resolved.paymentDueDateISO;
  } else {
    if (!liquidityAccountId) {
      throw new Error('Crea o selecciona una cuenta de liquidez');
    }
  }

  const category = state.categories.find((c) => c.id === categoryId);
  const fallbackDesc =
    description.trim() ||
    (txType === 'card_refund'
      ? `Reembolso ${category?.name || 'Tarjeta'}`
      : category?.name || 'Movimiento');

  const newTx = {
    id: genUUID(),
    user_id: userId,
    tx_type: txType,
    tx_date: dateISO,
    amount_cents: cleanCents,
    adjustment_direction: null,
    liquidity_account_id:
      txType === 'income' || txType === 'liquidity_expense' ? liquidityAccountId : null,
    target_liquidity_account_id: null,
    credit_card_id:
      txType === 'card_charge' || txType === 'card_refund' ? creditCardId : null,
    defer_to_next_cycle: Boolean(deferToNextCycle),
    assigned_cycle_ym: assignedCycleYM,
    cycle_cutoff_date: cycleCutoffDate,
    payment_due_date: paymentDueDate,
    category_id: category?.id || null,
    recurring_expense_id: null,
    loan_id: null,
    description: fallbackDesc,
    metadata: {},
    created_at: new Date().toISOString()
  };

  if (!USE_LOCAL_DEMO_MODE) {
    const supabase = await getSupabaseClient();
    const res = await supabase.from('transactions').insert(newTx);
    assertNoSupabaseError(res, 'Error al guardar transacción');
  }

  setState({
    transactions: [newTx, ...state.transactions]
  });

  return newTx;
}

/**
 * Registro de Compra a Meses Sin Intereses (MSI) con soporte de Backfill (startInstallment = X de N)
 * y diferimiento al siguiente corte. Persiste en `msi_plans` y `msi_installments`.
 */
export async function createMsiPurchase({
  creditCardId,
  categoryId = null,
  description = '',
  merchant = '',
  purchaseDateISO,
  deferToNextCycle = false,
  totalAmountCents,
  totalMonths,
  startInstallment = 1
}) {
  const state = getState();
  const userId = state.user?.id;
  if (!userId) throw new Error('Inicia sesión para registrar compras MSI');

  const card = state.creditCards.find((c) => c.id === creditCardId);
  if (!card) throw new Error('Selecciona una tarjeta de crédito para el plan MSI');

  const dateISO = purchaseDateISO || state.referenceDateISO;
  const category = state.categories.find((c) => c.id === categoryId);

  const schedule = buildMsiSchedule({
    totalAmountCents,
    totalMonths: Number(totalMonths),
    startInstallment: Number(startInstallment),
    purchaseDateISO: dateISO,
    cutoffDay: card.cutoff_day,
    paymentDueDay: card.payment_due_day,
    deferToNextCycle: Boolean(deferToNextCycle)
  });

  const planId = genUUID();

  const newPlan = {
    id: planId,
    user_id: userId,
    credit_card_id: creditCardId,
    category_id: category?.id || null,
    description: description.trim() || category?.name || `Compra ${totalMonths} MSI`,
    merchant: merchant.trim() || card.name,
    icon: category?.icon || 'credit_card',
    purchase_date: dateISO,
    defer_to_next_cycle: Boolean(deferToNextCycle),
    total_amount_cents: Math.round(Number(totalAmountCents)),
    total_months: Number(totalMonths),
    start_installment: Number(startInstallment),
    first_active_cycle_ym: schedule.firstActiveCycleYM,
    status: 'active',
    created_at: new Date().toISOString()
  };

  const newInstallments = schedule.installments.map((inst) => ({
    id: genUUID(),
    user_id: userId,
    msi_plan_id: planId,
    credit_card_id: creditCardId,
    installment_number: inst.installmentNumber,
    total_installments: inst.totalInstallments,
    cycle_year_month: inst.cycleYearMonth,
    cycle_cutoff_date: inst.cycleCutoffDateISO,
    payment_due_date: inst.paymentDueDateISO,
    amount_cents: inst.amountCents,
    is_settled: false
  }));

  if (!USE_LOCAL_DEMO_MODE) {
    const supabase = await getSupabaseClient();
    const planRes = await supabase.from('msi_plans').insert(newPlan);
    assertNoSupabaseError(planRes, 'Error al crear plan MSI');
    const instRes = await supabase.from('msi_installments').insert(newInstallments);
    assertNoSupabaseError(instRes, 'Error al crear parcialidades MSI');
  }

  setState({
    msiPlans: [newPlan, ...state.msiPlans],
    msiInstallments: [...state.msiInstallments, ...newInstallments]
  });

  return { plan: newPlan, installments: newInstallments };
}

/**
 * Permite editar manualmente el monto en centavos de una parcialidad MSI individual.
 */
export async function updateMsiInstallmentAmount(installmentId, newAmountCents) {
  const clean = Math.round(Number(newAmountCents));
  if (!clean || clean <= 0) throw new Error('Monto de parcialidad inválido');

  const state = getState();
  if (!USE_LOCAL_DEMO_MODE) {
    const supabase = await getSupabaseClient();
    const res = await supabase
      .from('msi_installments')
      .update({ amount_cents: clean })
      .eq('id', installmentId);
    assertNoSupabaseError(res, 'Error al actualizar parcialidad MSI');
  }

  const updated = state.msiInstallments.map((inst) =>
    inst.id === installmentId ? { ...inst, amount_cents: clean } : inst
  );

  setState({ msiInstallments: updated });
}

/**
 * Registra el pago del estado de cuenta o ciclo de una tarjeta desde una cuenta de liquidez.
 */
export async function recordCardStatementPayment({
  cardId,
  cycleYM,
  liquidityAccountId,
  amountCents,
  txDateISO
}) {
  const state = getState();
  const userId = state.user?.id;
  if (!userId) throw new Error('Sesión no activa');

  const card = state.creditCards.find((c) => c.id === cardId);
  const account = state.liquidityAccounts.find((a) => a.id === liquidityAccountId);
  if (!card || !account) throw new Error('Selecciona tarjeta y cuenta de origen válidas');

  const clean = Math.round(Number(amountCents));
  if (!clean || clean <= 0) throw new Error('El monto a pagar debe ser mayor a $0.00');

  const newTx = {
    id: genUUID(),
    user_id: userId,
    tx_type: 'card_payment',
    tx_date: txDateISO || state.referenceDateISO,
    amount_cents: clean,
    adjustment_direction: null,
    liquidity_account_id: liquidityAccountId,
    target_liquidity_account_id: null,
    credit_card_id: cardId,
    defer_to_next_cycle: false,
    assigned_cycle_ym: cycleYM,
    cycle_cutoff_date: null,
    payment_due_date: null,
    category_id: null,
    recurring_expense_id: null,
    loan_id: null,
    description: `Pago tarjeta ${card.name} (${cycleYM})`,
    metadata: {},
    created_at: new Date().toISOString()
  };

  if (!USE_LOCAL_DEMO_MODE) {
    const supabase = await getSupabaseClient();
    const res = await supabase.from('transactions').insert(newTx);
    assertNoSupabaseError(res, 'Error al registrar pago de tarjeta');
  }

  setState({
    transactions: [newTx, ...state.transactions]
  });

  return newTx;
}

/**
 * Alterna el estado mensual de un gasto fijo entre 'pending' y 'paid' en PostgreSQL
 * sin doble conteo.
 */
export async function toggleRecurringExpenseStatus({ recurringExpenseId, yearMonth }) {
  const state = getState();
  const userId = state.user?.id;
  if (!userId) throw new Error('Sesión no activa');

  const rec = state.recurringExpenses.find((r) => r.id === recurringExpenseId);
  if (!rec) throw new Error('Gasto fijo no encontrado');

  const ym = yearMonth || state.selectedYearMonth;
  const { year, month } = parseYearMonth(ym);
  const dueDateISO = buildClampedDateISO(year, month, rec.billing_day);

  const existingLog = state.recurringLogs.find(
    (l) => l.recurring_expense_id === rec.id && l.year_month === ym
  );
  const currentStatus = existingLog ? existingLog.status : 'pending';
  const nextStatus = currentStatus === 'paid' ? 'pending' : 'paid';

  let updatedTransactions = [...state.transactions];
  let updatedLogs = [...state.recurringLogs];
  const supabase = !USE_LOCAL_DEMO_MODE ? await getSupabaseClient() : null;

  if (nextStatus === 'paid') {
    let assignedCycleYM = null;
    let cycleCutoffDate = null;
    let paymentDueDate = null;

    if (rec.payment_method_type === 'credit_card') {
      const card = state.creditCards.find((c) => c.id === rec.credit_card_id);
      if (card) {
        const resolved = resolveBillingCycle({
          txDateISO: dueDateISO,
          cutoffDay: card.cutoff_day,
          paymentDueDay: card.payment_due_day,
          deferToNextCycle: false
        });
        assignedCycleYM = resolved.assignedCycleYM;
        cycleCutoffDate = resolved.cycleCutoffDateISO;
        paymentDueDate = resolved.paymentDueDateISO;
      }
    }

    const newTx = {
      id: genUUID(),
      user_id: userId,
      tx_type: rec.payment_method_type === 'credit_card' ? 'card_charge' : 'liquidity_expense',
      tx_date: dueDateISO,
      amount_cents: rec.amount_cents,
      adjustment_direction: null,
      liquidity_account_id:
        rec.payment_method_type === 'liquidity_account' ? rec.liquidity_account_id : null,
      target_liquidity_account_id: null,
      credit_card_id:
        rec.payment_method_type === 'credit_card' ? rec.credit_card_id : null,
      defer_to_next_cycle: false,
      assigned_cycle_ym: assignedCycleYM,
      cycle_cutoff_date: cycleCutoffDate,
      payment_due_date: paymentDueDate,
      category_id: rec.category_id || null,
      recurring_expense_id: rec.id,
      loan_id: null,
      description: `${rec.name} (${ym})`,
      metadata: {},
      created_at: new Date().toISOString()
    };

    const newLog = {
      id: existingLog?.id || genUUID(),
      user_id: userId,
      recurring_expense_id: rec.id,
      year_month: ym,
      due_date: dueDateISO,
      amount_cents: rec.amount_cents,
      status: 'paid',
      transaction_id: newTx.id,
      paid_at: new Date().toISOString()
    };

    if (supabase) {
      const txRes = await supabase.from('transactions').insert(newTx);
      assertNoSupabaseError(txRes, 'Error al crear cargo de gasto fijo');

      const logRes = await supabase
        .from('recurring_expense_logs')
        .upsert(newLog, { onConflict: 'recurring_expense_id,year_month' });
      assertNoSupabaseError(logRes, 'Error al actualizar estado de gasto fijo');
    }

    updatedTransactions = [newTx, ...updatedTransactions];
    if (existingLog) {
      updatedLogs = updatedLogs.map((l) => (l.id === existingLog.id ? newLog : l));
    } else {
      updatedLogs.push(newLog);
    }
  } else {
    // Revertir a pending y eliminar la transacción vinculada
    const txIdToDelete = existingLog?.transaction_id;

    if (supabase) {
      if (existingLog) {
        const logRes = await supabase
          .from('recurring_expense_logs')
          .update({ status: 'pending', transaction_id: null, paid_at: null })
          .eq('id', existingLog.id);
        assertNoSupabaseError(logRes, 'Error al revertir estado de gasto fijo');
      }
      if (txIdToDelete) {
        const delRes = await supabase.from('transactions').delete().eq('id', txIdToDelete);
        assertNoSupabaseError(delRes, 'Error al eliminar cargo vinculado de gasto fijo');
      }
    }

    if (txIdToDelete) {
      updatedTransactions = updatedTransactions.filter((t) => t.id !== txIdToDelete);
    }
    if (existingLog) {
      updatedLogs = updatedLogs.map((l) =>
        l.id === existingLog.id
          ? { ...l, status: 'pending', transaction_id: null, paid_at: null }
          : l
      );
    }
  }

  setState({
    transactions: updatedTransactions,
    recurringLogs: updatedLogs
  });

  return nextStatus;
}

/**
 * Crea un nuevo Gasto Fijo / Suscripción Recurrente en PostgreSQL.
 */
export async function createRecurringExpense({
  name,
  amountCents,
  billingDay,
  paymentMethodType, // 'liquidity_account' | 'credit_card'
  liquidityAccountId = null,
  creditCardId = null,
  icon = 'event_repeat'
}) {
  const state = getState();
  const userId = state.user?.id;
  if (!userId) throw new Error('Sesión no activa');

  const clean = Math.round(Number(amountCents));
  if (!name?.trim() || !clean || clean <= 0) {
    throw new Error('Completa nombre y monto del gasto fijo');
  }

  const subsCatId = findCategoryIdByName(state.categories, 'Suscripciones', 'expense');

  const newRec = {
    id: genUUID(),
    user_id: userId,
    name: name.trim(),
    category_id: subsCatId,
    icon,
    amount_cents: clean,
    billing_day: Math.min(31, Math.max(1, Number(billingDay) || 1)),
    payment_method_type: paymentMethodType,
    liquidity_account_id: paymentMethodType === 'liquidity_account' ? liquidityAccountId : null,
    credit_card_id: paymentMethodType === 'credit_card' ? creditCardId : null,
    is_active: true,
    created_at: new Date().toISOString()
  };

  if (!USE_LOCAL_DEMO_MODE) {
    const supabase = await getSupabaseClient();
    const res = await supabase.from('recurring_expenses').insert(newRec);
    assertNoSupabaseError(res, 'Error al crear gasto fijo');
  }

  setState({
    recurringExpenses: [...state.recurringExpenses, newRec]
  });

  return newRec;
}

/**
 * Crea un nuevo préstamo a un tercero ("Me deben") en `loans` y descuenta el monto
 * inmediatamente de la cuenta de liquidez de origen (`loan_disbursement` en `transactions`).
 */
export async function createLoan({
  borrowerName,
  description = '',
  originAccountId,
  principalCents,
  loanDateISO
}) {
  const state = getState();
  const userId = state.user?.id;
  if (!userId) throw new Error('Sesión no activa');

  const clean = Math.round(Number(principalCents));
  if (!borrowerName?.trim() || !clean || clean <= 0 || !originAccountId) {
    throw new Error('Completa contacto, monto y cuenta de origen del préstamo');
  }

  const loanId = genUUID();
  const dateISO = loanDateISO || state.referenceDateISO;
  const loanCatId = findCategoryIdByName(state.categories, 'Préstamos', 'system');

  const newLoan = {
    id: loanId,
    user_id: userId,
    borrower_name: borrowerName.trim(),
    description: description.trim() || 'Préstamo personal',
    origin_account_id: originAccountId,
    loan_date: dateISO,
    principal_cents: clean,
    repaid_cents: 0,
    status: 'active',
    created_at: new Date().toISOString()
  };

  const disbursementTx = {
    id: genUUID(),
    user_id: userId,
    tx_type: 'loan_disbursement',
    tx_date: dateISO,
    amount_cents: clean,
    adjustment_direction: null,
    liquidity_account_id: originAccountId,
    target_liquidity_account_id: null,
    credit_card_id: null,
    defer_to_next_cycle: false,
    assigned_cycle_ym: null,
    cycle_cutoff_date: null,
    payment_due_date: null,
    category_id: loanCatId,
    recurring_expense_id: null,
    loan_id: loanId,
    description: `Préstamo a ${newLoan.borrower_name}`,
    metadata: {},
    created_at: new Date().toISOString()
  };

  if (!USE_LOCAL_DEMO_MODE) {
    const supabase = await getSupabaseClient();
    const loanRes = await supabase.from('loans').insert(newLoan);
    assertNoSupabaseError(loanRes, 'Error al registrar préstamo');

    const txRes = await supabase.from('transactions').insert(disbursementTx);
    assertNoSupabaseError(txRes, 'Error al descontar préstamo de cuenta de liquidez');
  }

  setState({
    loans: [newLoan, ...state.loans],
    transactions: [disbursementTx, ...state.transactions]
  });

  return newLoan;
}

/**
 * Registra un abono parcial o liquidación total de un préstamo ("Me deben") en PostgreSQL.
 */
export async function recordLoanRepayment({
  loanId,
  destinationAccountId,
  amountCents,
  repaymentDateISO
}) {
  const state = getState();
  const userId = state.user?.id;
  if (!userId) throw new Error('Sesión no activa');

  const loan = state.loans.find((l) => l.id === loanId);
  if (!loan) throw new Error('Préstamo no encontrado');

  const pendingCents = Math.max(0, loan.principal_cents - loan.repaid_cents);
  const clean = Math.min(pendingCents, Math.round(Number(amountCents)));
  if (!clean || clean <= 0) {
    throw new Error('Ingresa un monto de abono válido');
  }

  const destAccId = destinationAccountId || loan.origin_account_id || state.liquidityAccounts[0]?.id;
  const newRepaidCents = loan.repaid_cents + clean;
  const newStatus = newRepaidCents >= loan.principal_cents ? 'settled' : 'active';
  const loanCatId = findCategoryIdByName(state.categories, 'Préstamos', 'system');

  const repaymentTx = {
    id: genUUID(),
    user_id: userId,
    tx_type: 'loan_repayment',
    tx_date: repaymentDateISO || state.referenceDateISO,
    amount_cents: clean,
    adjustment_direction: null,
    liquidity_account_id: destAccId,
    target_liquidity_account_id: null,
    credit_card_id: null,
    defer_to_next_cycle: false,
    assigned_cycle_ym: null,
    cycle_cutoff_date: null,
    payment_due_date: null,
    category_id: loanCatId,
    recurring_expense_id: null,
    loan_id: loan.id,
    description: `Abono ${loan.borrower_name}`,
    metadata: {},
    created_at: new Date().toISOString()
  };

  if (!USE_LOCAL_DEMO_MODE) {
    const supabase = await getSupabaseClient();
    const updRes = await supabase
      .from('loans')
      .update({ repaid_cents: newRepaidCents, status: newStatus })
      .eq('id', loan.id);
    assertNoSupabaseError(updRes, 'Error al actualizar saldo del préstamo');

    const txRes = await supabase.from('transactions').insert(repaymentTx);
    assertNoSupabaseError(txRes, 'Error al registrar entrada de abono');
  }

  const updatedLoans = state.loans.map((l) =>
    l.id === loan.id
      ? { ...l, repaid_cents: newRepaidCents, status: newStatus }
      : l
  );

  setState({
    loans: updatedLoans,
    transactions: [repaymentTx, ...state.transactions]
  });

  return { loan: updatedLoans.find((l) => l.id === loan.id), transaction: repaymentTx };
}

/**
 * Registra una nueva tarjeta de crédito en PostgreSQL.
 */
export async function createCreditCard({
  name,
  bankName,
  lastFour = '0000',
  creditLimitCents = null,
  cutoffDay,
  paymentDueDay
}) {
  const state = getState();
  const userId = state.user?.id;
  if (!userId) throw new Error('Sesión no activa');

  if (!name?.trim() || !bankName?.trim()) {
    throw new Error('Completa el nombre y banco de la tarjeta');
  }

  const newCard = {
    id: genUUID(),
    user_id: userId,
    name: name.trim(),
    bank_name: bankName.trim(),
    last_four: String(lastFour || '0000').slice(-4).padStart(4, '0'),
    color_hex: '#FFFFFF',
    credit_limit_cents: creditLimitCents ? Math.round(Number(creditLimitCents)) : null,
    cutoff_day: Math.min(31, Math.max(1, Number(cutoffDay) || 15)),
    payment_due_day: Math.min(31, Math.max(1, Number(paymentDueDay) || 5)),
    is_archived: false,
    sort_order: state.creditCards.length + 1,
    created_at: new Date().toISOString()
  };

  if (!USE_LOCAL_DEMO_MODE) {
    const supabase = await getSupabaseClient();
    const res = await supabase.from('credit_cards').insert(newCard);
    assertNoSupabaseError(res, 'Error al guardar tarjeta de crédito');
  }

  setState({
    creditCards: [...state.creditCards, newCard]
  });

  return newCard;
}

/**
 * Registra una nueva cuenta de liquidez (Efectivo o Débito) en PostgreSQL.
 */
export async function createLiquidityAccount({
  name,
  accountType = 'debit',
  initialBalanceCents = 0
}) {
  const state = getState();
  const userId = state.user?.id;
  if (!userId) throw new Error('Sesión no activa');

  if (!name?.trim()) {
    throw new Error('Ingresa el nombre de la cuenta de liquidez');
  }

  const isCash = accountType === 'cash';
  const newAcc = {
    id: genUUID(),
    user_id: userId,
    name: name.trim(),
    account_type: isCash ? 'cash' : 'debit',
    badge: isCash ? 'Efectivo' : 'Débito',
    icon: isCash ? 'payments' : 'account_balance',
    color_hex: '#FFFFFF',
    initial_balance_cents: Math.round(Number(initialBalanceCents) || 0),
    is_archived: false,
    sort_order: state.liquidityAccounts.length + 1,
    created_at: new Date().toISOString()
  };

  if (!USE_LOCAL_DEMO_MODE) {
    const supabase = await getSupabaseClient();
    const res = await supabase.from('liquidity_accounts').insert(newAcc);
    assertNoSupabaseError(res, 'Error al crear cuenta de liquidez');
  }

  setState({
    liquidityAccounts: [...state.liquidityAccounts, newAcc]
  });

  return newAcc;
}
