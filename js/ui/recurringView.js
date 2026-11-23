/**
 * Slice UI - Vista 4: Gastos Fijos y Suscripciones Recurrentes
 * Incluye switch iOS Liquid Glass para alternar pendiente <-> pagado sin doble conteo.
 */

import {
  clampDayToMonth,
  formatCentsToMXN,
  formatMonthYearLabel,
  parseYearMonth
} from '../engine/dateUtils.js';
import {
  computeDashboardMetrics,
  getRecurringStatusForMonth
} from '../engine/accounting.js';
import { renderLoansSection } from './loansView.js';
import { setState } from '../store.js';

export function renderRecurringView(container, state, handlers) {
  const { year, month } = parseYearMonth(state.selectedYearMonth);

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

  const totalFijosCents = metrics.totalRecurringMonthCents;
  const paidFijosCents = metrics.paidRecurringMonthCents;
  const pendingFijosCents = Math.max(0, totalFijosCents - paidFijosCents);
  const paidPct = totalFijosCents > 0 ? Math.round((paidFijosCents / totalFijosCents) * 100) : 0;

  const recurringRowsHtml = state.recurringExpenses
    .filter((r) => r.is_active)
    .sort((a, b) => a.billing_day - b.billing_day)
    .map((rec) => {
      const status = getRecurringStatusForMonth(rec.id, state.selectedYearMonth, state.recurringLogs);
      const isPaid = status === 'paid';
      const clampedDay = clampDayToMonth(year, month, rec.billing_day);
      const dayStr = String(clampedDay).padStart(2, '0');

      const methodLabel =
        rec.payment_method_type === 'credit_card'
          ? `TDC: ${state.creditCards.find((c) => c.id === rec.credit_card_id)?.name || 'Tarjeta'}`
          : `Liquidez: ${state.liquidityAccounts.find((a) => a.id === rec.liquidity_account_id)?.name || 'Débito'}`;

      return `
        <div class="glass-card" style="padding:15px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div style="display:flex;align-items:center;gap:12px;min-width:0;">
            <div class="icon-squircle" style="border-radius:50%;">
              <span class="material-symbols-outlined">${rec.icon || 'event_repeat'}</span>
            </div>
            <div style="display:flex;flex-direction:column;min-width:0;">
              <span class="card-title" style="font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${rec.name}
              </span>
              <div class="text-subtle" style="font-size:12px;display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
                <span>Día ${dayStr}</span>
                <span>•</span>
                <span>${methodLabel}</span>
                <span>•</span>
                <span class="tabular-nums" style="color:#fff;font-weight:600;">${formatCentsToMXN(rec.amount_cents)}</span>
              </div>
            </div>
          </div>

          <div style="flex-shrink:0;display:flex;align-items:center;gap:8px;">
            <button
              type="button"
              role="switch"
              aria-checked="${isPaid ? 'true' : 'false'}"
              class="ios-switch"
              data-action="toggle-recurring-switch"
              data-rec-id="${rec.id}"
              title="${isPaid ? 'Pagado (toca para marcar pendiente)' : 'Pendiente (toca para marcar pagado)'}"
            >
              <span class="ios-switch-knob">
                ${isPaid ? '<span class="material-symbols-outlined" style="font-size:14px;">check</span>' : ''}
              </span>
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  const loansHtml = renderLoansSection(state);

  const showFijos = state.fijosFilter === 'todos' || state.fijosFilter === 'suscripciones';
  const showPrestamos = state.fijosFilter === 'todos' || state.fijosFilter === 'prestamos';

  container.innerHTML = `
    <!-- Header Title & Segmented Filter -->
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <span class="label-eyebrow">${formatMonthYearLabel(state.selectedYearMonth)}</span>
          <h2 class="stat-amount" style="margin:2px 0 0 0;font-size:22px;">Compromisos &amp; Préstamos</h2>
        </div>
        <div style="display:flex;gap:6px;">
          <button type="button" class="btn-glass-capsule" style="height:34px;padding:0 11px;font-size:11px;" data-action="open-new-recurring">
            <span class="material-symbols-outlined" style="font-size:15px;">add</span>
            <span>Fijo</span>
          </button>
          <button type="button" class="btn-glass-capsule" style="height:34px;padding:0 11px;font-size:11px;" data-action="open-new-loan">
            <span class="material-symbols-outlined" style="font-size:15px;">handshake</span>
            <span>Préstamo</span>
          </button>
        </div>
      </div>

      <div class="segmented-control">
        <button type="button" class="segmented-btn ${state.fijosFilter === 'todos' ? 'active' : ''}" data-action="set-fijos-filter" data-filter="todos">Todos</button>
        <button type="button" class="segmented-btn ${state.fijosFilter === 'suscripciones' ? 'active' : ''}" data-action="set-fijos-filter" data-filter="suscripciones">Suscripciones</button>
        <button type="button" class="segmented-btn ${state.fijosFilter === 'prestamos' ? 'active' : ''}" data-action="set-fijos-filter" data-filter="prestamos">Préstamos</button>
      </div>
    </div>

    <!-- Key Metrics Bento Grid -->
    <div style="display:grid;grid-template-columns:1fr;gap:12px;">
      <!-- Card 1: Total Fijos del Mes -->
      <div class="glass-card-hero" style="padding:18px;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:12px;">
          <div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span class="pulse-dot"></span>
              <span class="label-eyebrow">Total Fijos del Mes</span>
            </div>
            <div style="display:flex;align-items:baseline;gap:6px;margin-top:4px;">
              <span class="stat-amount tabular-nums">${formatCentsToMXN(totalFijosCents)}</span>
              <span class="text-subtle">MXN</span>
            </div>
          </div>
          <div class="icon-squircle" style="border-radius:50%;">
            <span class="material-symbols-outlined">calendar_month</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;">
          <div class="progress-track">
            <div class="progress-fill" style="width:${paidPct}%;"></div>
          </div>
          <div class="tabular-nums" style="display:flex;align-items:center;justify-content:space-between;font-size:11px;">
            <span style="color:#fff;font-weight:500;">● ${formatCentsToMXN(paidFijosCents)} pagados</span>
            <span style="color:var(--text-secondary);">○ ${formatCentsToMXN(pendingFijosCents)} pendientes</span>
          </div>
        </div>
      </div>

      <!-- Card 2: Total Por Cobrar (Me deben) -->
      <div class="glass-card" style="padding:15px 18px;display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="icon-squircle" style="border-radius:50%;">
            <span class="material-symbols-outlined">account_balance_wallet</span>
          </div>
          <div>
            <span class="label-eyebrow" style="display:block;font-size:10px;">Total Por Cobrar ("Me deben")</span>
            <span class="card-title tabular-nums" style="font-size:20px;">${formatCentsToMXN(metrics.totalReceivableLoansCents)} <span style="font-size:11px;color:var(--text-secondary);font-weight:400;">MXN</span></span>
          </div>
        </div>
        <span class="badge-pill">
          <span class="material-symbols-outlined" style="font-size:14px;">group</span>
          <span>${metrics.activeLoansCount} activo${metrics.activeLoansCount === 1 ? '' : 's'}</span>
        </span>
      </div>
    </div>

    <!-- Section 1: Gastos Fijos y Suscripciones -->
    <section style="display:${showFijos ? 'flex' : 'none'};flex-direction:column;gap:10px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="material-symbols-outlined" style="font-size:18px;color:var(--text-secondary);">event_repeat</span>
          <h3 class="card-title" style="margin:0;">Gastos Fijos y Suscripciones</h3>
        </div>
        <span class="label-eyebrow">${state.recurringExpenses.filter((r) => r.is_active).length} servicios</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${recurringRowsHtml || '<div class="glass-card" style="text-align:center;color:var(--text-secondary);">Sin gastos fijos registrados.</div>'}
      </div>
    </section>

    <!-- Section 2: Me Deben (Préstamos Activos) -->
    <section style="display:${showPrestamos ? 'flex' : 'none'};flex-direction:column;gap:10px;">
      ${loansHtml}
    </section>
  `;

  // Event listeners
  container.querySelectorAll('[data-action="set-fijos-filter"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setState({ fijosFilter: btn.getAttribute('data-filter') }, false);
    });
  });

  container.querySelectorAll('[data-action="toggle-recurring-switch"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      handlers.onToggleRecurring(btn.getAttribute('data-rec-id'));
    });
  });

  container.querySelector('[data-action="open-new-recurring"]')?.addEventListener('click', () => {
    handlers.onOpenNewRecurringModal();
  });

  container.querySelector('[data-action="open-new-loan"]')?.addEventListener('click', () => {
    handlers.onOpenNewLoanModal();
  });

  container.querySelectorAll('[data-action="open-abono-modal"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      handlers.onOpenLoanRepaymentModal(btn.getAttribute('data-loan-id'));
    });
  });
}
