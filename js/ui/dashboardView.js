/**
 * Slice UI - Vista 1: Inicio (Dashboard Liquid Glass Monochromatic)
 */

import {
  formatCentsToMXN,
  formatMonthYearLabel,
  formatShortDateES
} from '../engine/dateUtils.js';
import { computeDashboardMetrics } from '../engine/accounting.js';
import { setState } from '../store.js';

export function renderDashboardView(container, state, handlers) {
  const metrics = computeDashboardMetrics({
    referenceDateISO: state.referenceDateISO,
    currentYM: state.selectedYearMonth,
    liquidityAccounts: state.liquidityAccounts,
    creditCards: state.creditCards,
    transactions: state.transactions,
    msiInstallments: state.msiInstallments,
    recurringExpenses: state.recurringExpenses,
    recurringLogs: state.recurringLogs,
    loans: state.loans
  });

  const totalCommitmentsCents =
    metrics.dueStatementsThisMonthCents + metrics.pendingDebitRecurringCents;
  const totalBaseCents = Math.max(1, metrics.totalLiquidCents);
  const committedPct = Math.min(
    100,
    Math.max(0, Math.round((totalCommitmentsCents / totalBaseCents) * 100))
  );

  // Closest upcoming cutoff days across active cards
  let nextCutoffDaysLabel = 'Sin tarjetas activas';
  let nextCutoffSoon = false;
  if (metrics.cardSummaries.length > 0) {
    const sortedByCutoff = [...metrics.cardSummaries].sort(
      (a, b) => a.cycleInfo.daysUntilCutoff - b.cycleInfo.daysUntilCutoff
    );
    const nearest = sortedByCutoff[0];
    const days = nearest.cycleInfo.daysUntilCutoff;
    nextCutoffSoon = days <= 3;
    nextCutoffDaysLabel =
      days === 0
        ? `${nearest.card.name} corta hoy`
        : `${nearest.card.name} corta en ${days} día${days === 1 ? '' : 's'}`;
  }

  const activeMsiCount = state.msiPlans.filter((p) => p.status === 'active').length;

  // Filter recent transactions
  const filteredTransactions = state.transactions.filter((tx) => {
    if (state.movementFilter === 'all') return true;
    const isInflow =
      tx.tx_type === 'income' ||
      tx.tx_type === 'loan_repayment' ||
      tx.tx_type === 'card_refund' ||
      (tx.tx_type === 'balance_adjustment' && tx.adjustment_direction === 'inflow');
    if (state.movementFilter === 'income') return isInflow;
    return !isInflow;
  });

  const accountsHtml =
    metrics.accountsBreakdown.length === 0
      ? `
        <div class="glass-card" style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div>
            <span class="card-title" style="display:block;font-size:15px;">Sin cuentas de liquidez</span>
            <span class="text-subtle" style="font-size:12px;">Crea tu primera cuenta de efectivo o débito</span>
          </div>
          <button type="button" class="btn-primary-capsule" style="height:38px;padding:0 14px;font-size:12px;" data-action="open-new-account-empty">
            <span class="material-symbols-outlined" style="font-size:16px;">add</span>
            <span>Crear Cuenta</span>
          </button>
        </div>
      `
      : metrics.accountsBreakdown
          .map((acc, idx) => {
            const fullAcc = state.liquidityAccounts.find((a) => a.id === acc.id) || {};
            const badge = fullAcc.badge || (acc.account_type === 'cash' ? 'Efectivo' : 'Débito');
            const icon = fullAcc.icon || (acc.account_type === 'cash' ? 'payments' : 'account_balance');
            const isPrimary = idx === 0 || badge === 'Principal';
            return `
              <div class="glass-card carousel-card" style="display:flex;flex-direction:column;justify-content:space-between;gap:14px;">
                <div style="display:flex;align-items:center;justify-content:space-between;">
                  <div class="icon-squircle" style="border-radius:50%;width:36px;height:36px;">
                    <span class="material-symbols-outlined" aria-hidden="true" style="font-size:19px;">${icon}</span>
                  </div>
                  <span class="badge-pill ${isPrimary ? 'badge-pill-sky' : ''}">${badge}</span>
                </div>
                <div>
                  <span class="text-subtle" style="display:block;font-size:12px;">${acc.name}</span>
                  <div style="display:flex;align-items:baseline;gap:4px;margin-top:2px;">
                    <span class="card-title tabular-nums" style="font-size:20px;">${formatCentsToMXN(acc.balanceCents)}</span>
                    <span class="label-eyebrow" style="font-size:10px;">MXN</span>
                  </div>
                </div>
                <button type="button" class="btn-glass-capsule" style="width:100%;height:36px;" data-action="open-reconcile" data-account-id="${acc.id}">
                  <span class="material-symbols-outlined" style="font-size:16px;">tune</span>
                  <span>Cuadrar Saldo</span>
                </button>
              </div>
            `;
          })
          .join('');

  const txRowsHtml =
    filteredTransactions.length === 0
      ? `<div class="glass-card" style="text-align:center;color:var(--text-secondary);padding:24px;">
           No hay movimientos registrados en este filtro.
         </div>`
      : filteredTransactions
          .slice(0, 12)
          .map((tx) => {
            const cat = state.categories.find((c) => c.id === tx.category_id);
            const acc = state.liquidityAccounts.find((a) => a.id === tx.liquidity_account_id);
            const card = state.creditCards.find((c) => c.id === tx.credit_card_id);
            const isInflow =
              tx.tx_type === 'income' ||
              tx.tx_type === 'loan_repayment' ||
              tx.tx_type === 'card_refund' ||
              (tx.tx_type === 'balance_adjustment' && tx.adjustment_direction === 'inflow');

            const sourceName = card
              ? `${card.name} (${tx.assigned_cycle_ym || ''})`
              : acc?.name || 'Cuenta';

            const icon =
              tx.tx_type === 'balance_adjustment'
                ? 'tune'
                : tx.tx_type === 'card_payment'
                ? 'credit_score'
                : tx.tx_type === 'loan_disbursement' || tx.tx_type === 'loan_repayment'
                ? 'handshake'
                : cat?.icon || (isInflow ? 'work' : 'shopping_bag');

            const signAmount = isInflow
              ? `+${formatCentsToMXN(tx.amount_cents)}`
              : `-${formatCentsToMXN(tx.amount_cents)}`;

            return `
              <div class="glass-card" style="padding:13px 15px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
                <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                  <div class="icon-squircle" style="border-radius:50%;">
                    <span class="material-symbols-outlined" style="font-size:20px;">${icon}</span>
                  </div>
                  <div style="display:flex;flex-direction:column;min-width:0;">
                    <span class="card-title" style="font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                      ${tx.description || 'Movimiento'}
                    </span>
                    <span class="text-subtle" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                      ${formatShortDateES(tx.tx_date)} · ${sourceName}${tx.defer_to_next_cycle ? ' · Diferido' : ''}
                    </span>
                  </div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;flex-shrink:0;">
                  <span class="tabular-nums" style="font-size:16px;font-weight:600;color:${isInflow ? 'var(--sky-light)' : 'var(--secondary)'};">
                    ${signAmount}
                  </span>
                  <span class="label-eyebrow" style="font-size:10px;">MXN</span>
                </div>
              </div>
            `;
          })
          .join('');

  container.innerHTML = `
    <!-- Saludo & Selector de Mes Compacto -->
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div style="display:flex;flex-direction:column;">
        <span class="label-eyebrow">Resumen Financiero</span>
        <span class="card-title" style="font-size:19px;">Hola, Angel</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <button type="button" class="btn-glass-capsule" style="width:36px;height:36px;padding:0;" data-action="prev-month" aria-label="Mes anterior">
          <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">chevron_left</span>
        </button>
        <span class="badge-pill badge-pill-sky" style="padding:6px 12px;font-size:12px;">
          ${formatMonthYearLabel(state.selectedYearMonth)}
        </span>
        <button type="button" class="btn-glass-capsule" style="width:36px;height:36px;padding:0;" data-action="next-month" aria-label="Mes siguiente">
          <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">chevron_right</span>
        </button>
      </div>
    </div>

    <!-- Hero Card Liquid Glass: Liquidez Libre del Mes -->
    <div class="glass-card-hero">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        <span class="label-eyebrow">Liquidez Libre del Mes</span>
        <span class="badge-pill badge-pill-sky">
          <span class="pulse-dot" aria-hidden="true"></span>
          <span>En vivo</span>
        </span>
      </div>
      <div style="display:flex;align-items:baseline;gap:8px;margin-bottom:6px;">
        <span class="hero-amount tabular-nums">${formatCentsToMXN(metrics.freeLiquidityMonthCents)}</span>
        <span style="font-size:16px;font-weight:500;color:var(--text-secondary);">MXN</span>
      </div>
      <p class="text-subtle" style="margin:0 0 16px 0;display:flex;align-items:center;gap:6px;">
        <span class="material-symbols-outlined" aria-hidden="true" style="font-size:16px;color:var(--sky);">verified_user</span>
        <span>Total líquido (<span class="tabular-nums">${formatCentsToMXN(metrics.totalLiquidCents)}</span>) menos pagos exigibles del mes</span>
      </p>

      <div class="glass-well" style="display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;">
          <span class="tabular-nums" style="color:var(--text-primary);font-weight:600;">${committedPct}% comprometido en el mes</span>
          <span class="tabular-nums" style="color:var(--text-secondary);">
            ${formatCentsToMXN(totalCommitmentsCents)} por cubrir
          </span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" style="width:${committedPct}%;"></div>
        </div>
      </div>
    </div>

    <!-- Carrusel Horizontal: Cuentas de Liquidez -->
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:baseline;gap:8px;">
          <h2 class="card-title" style="margin:0;">Cuentas de Liquidez</h2>
          <span class="label-eyebrow tabular-nums">${metrics.accountsBreakdown.length} activas</span>
        </div>
        <button type="button" class="btn-glass-capsule" style="height:30px;padding:0 10px;font-size:11px;" data-action="open-new-account">
          <span class="material-symbols-outlined" aria-hidden="true" style="font-size:14px;">add</span>
          <span>Cuenta</span>
        </button>
      </div>
      <div class="horizontal-carousel">
        ${accountsHtml}
      </div>
    </div>

    <!-- Métricas Secundarias: Compromisos & Crédito -->
    <div style="display:flex;flex-direction:column;gap:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h2 class="card-title" style="margin:0;">Compromisos &amp; Crédito</h2>
        <span class="label-eyebrow">Separación Contable</span>
      </div>

      <!-- 1. Acumulado Próximo Corte -->
      <div class="glass-card glass-card-interactive" style="padding:14px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;" data-action="go-tab" data-tab="tarjetas">
        <div style="display:flex;align-items:center;gap:12px;min-width:0;">
          <div class="icon-squircle" style="border-radius:50%;">
            <span class="material-symbols-outlined" aria-hidden="true" style="font-size:20px;">event_upcoming</span>
          </div>
          <div style="display:flex;flex-direction:column;min-width:0;">
            <span style="font-size:14px;font-weight:600;color:var(--text-primary);">Acumulado Próximo Corte</span>
            <span class="text-subtle" style="font-size:11px;display:flex;align-items:center;gap:5px;">
              <span style="width:6px;height:6px;border-radius:50%;background:${nextCutoffSoon ? 'var(--signal-warn)' : 'var(--sky)'};display:inline-block;flex-shrink:0;"></span>
              ${nextCutoffDaysLabel}
            </span>
          </div>
        </div>
        <div style="display:flex;align-items:baseline;gap:4px;flex-shrink:0;">
          <span class="card-title tabular-nums">${formatCentsToMXN(metrics.nextCutoffAccruedCents)}</span>
          <span class="label-eyebrow" style="font-size:10px;">MXN</span>
        </div>
      </div>

      <!-- 2. Deuda Total MSI -->
      <div class="glass-card glass-card-interactive" style="padding:14px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;" data-action="go-tab" data-tab="tarjetas">
        <div style="display:flex;align-items:center;gap:12px;min-width:0;">
          <div class="icon-squircle" style="border-radius:50%;">
            <span class="material-symbols-outlined" aria-hidden="true" style="font-size:20px;">credit_card</span>
          </div>
          <div style="display:flex;flex-direction:column;min-width:0;">
            <span style="font-size:14px;font-weight:600;color:var(--text-primary);">Deuda Total Comprometida MSI</span>
            <span class="text-subtle tabular-nums" style="font-size:11px;">${activeMsiCount} compra${activeMsiCount === 1 ? '' : 's'} activa${activeMsiCount === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div style="display:flex;align-items:baseline;gap:4px;flex-shrink:0;">
          <span class="card-title tabular-nums">${formatCentsToMXN(metrics.totalCommittedMsiCents)}</span>
          <span class="label-eyebrow" style="font-size:10px;">MXN</span>
        </div>
      </div>

      <!-- 3. Me deben (Por cobrar) -->
      <div class="glass-card glass-card-interactive" style="padding:14px 16px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;" data-action="go-tab" data-tab="fijos">
        <div style="display:flex;align-items:center;gap:12px;min-width:0;">
          <div class="icon-squircle" style="border-radius:50%;">
            <span class="material-symbols-outlined" aria-hidden="true" style="font-size:20px;">handshake</span>
          </div>
          <div style="display:flex;flex-direction:column;min-width:0;">
            <span style="font-size:14px;font-weight:600;color:var(--text-primary);">Me deben (Por cobrar)</span>
            <span class="text-subtle tabular-nums" style="font-size:11px;">${metrics.activeLoansCount} préstamo${metrics.activeLoansCount === 1 ? '' : 's'} pendiente${metrics.activeLoansCount === 1 ? '' : 's'}</span>
          </div>
        </div>
        <div style="display:flex;align-items:baseline;gap:4px;flex-shrink:0;">
          <span class="card-title tabular-nums" style="color:var(--sky-light);">+${formatCentsToMXN(metrics.totalReceivableLoansCents)}</span>
          <span class="label-eyebrow" style="font-size:10px;">MXN</span>
        </div>
      </div>
    </div>

    <!-- Sección Movimientos Recientes -->
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <h2 class="card-title" style="margin:0;">Movimientos Recientes</h2>
        <div class="segmented-control" style="padding:2px;">
          <button type="button" class="segmented-btn ${state.movementFilter === 'all' ? 'active' : ''}" style="min-width:52px;padding:5px 10px;" data-action="filter-tx" data-filter="all">Todos</button>
          <button type="button" class="segmented-btn ${state.movementFilter === 'expense' ? 'active' : ''}" style="min-width:52px;padding:5px 10px;" data-action="filter-tx" data-filter="expense">Gastos</button>
          <button type="button" class="segmented-btn ${state.movementFilter === 'income' ? 'active' : ''}" style="min-width:52px;padding:5px 10px;" data-action="filter-tx" data-filter="income">Ingresos</button>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${txRowsHtml}
      </div>
    </div>
  `;

  // Wire interactions
  container.querySelectorAll('[data-action="open-reconcile"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      handlers.onOpenReconcileModal(btn.getAttribute('data-account-id'));
    });
  });

  container.querySelectorAll('[data-action="filter-tx"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setState({ movementFilter: btn.getAttribute('data-filter') }, false);
    });
  });

  container.querySelectorAll('[data-action="go-tab"]').forEach((el) => {
    el.addEventListener('click', () => {
      setState({ activeTab: el.getAttribute('data-tab') }, false);
    });
  });

  container.querySelector('[data-action="prev-month"]')?.addEventListener('click', () => {
    handlers.onChangeMonth(-1);
  });
  container.querySelector('[data-action="next-month"]')?.addEventListener('click', () => {
    handlers.onChangeMonth(1);
  });
  container.querySelector('[data-action="open-new-account"]')?.addEventListener('click', () => {
    handlers.onOpenNewAccountModal();
  });
  container.querySelector('[data-action="open-new-account-empty"]')?.addEventListener('click', () => {
    handlers.onOpenNewAccountModal();
  });
}
