/**
 * Slice UI - Vista 2: Calendario Financiero Mensual Interactivo
 * Soporta meses cortos (Febrero 28/29 días y meses de 30 días) mediante clampDayToMonth.
 */

import {
  buildClampedDateISO,
  clampDayToMonth,
  daysInMonth,
  formatCentsToMXN,
  formatLongDateES,
  formatMonthYearLabel,
  parseYearMonth
} from '../engine/dateUtils.js';
import {
  computeDashboardMetrics,
  getRecurringStatusForMonth
} from '../engine/accounting.js';
import { setState } from '../store.js';

export function renderCalendarView(container, state, handlers) {
  const { year, month } = parseYearMonth(state.selectedYearMonth);
  const totalDays = daysInMonth(year, month);
  const firstDayWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay(); // 0 (Sun) .. 6 (Sat)

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

  // Ensure selectedCalendarDateISO belongs to selectedYearMonth
  let selectedDateISO = state.selectedCalendarDateISO;
  if (!selectedDateISO || !selectedDateISO.startsWith(state.selectedYearMonth)) {
    selectedDateISO = buildClampedDateISO(year, month, 20);
  }

  // Build map of events by day number (1..totalDays)
  const eventsByDay = new Map();
  for (let d = 1; d <= totalDays; d++) {
    eventsByDay.set(d, []);
  }

  // 1. Credit card cutoff dates and payment due dates in this month
  for (const summary of metrics.cardSummaries) {
    const card = summary.card;
    const cutoffDayClamped = clampDayToMonth(year, month, card.cutoff_day);
    eventsByDay.get(cutoffDayClamped)?.push({
      kind: 'cutoff',
      title: `Corte ${card.name}`,
      subtitle: `${card.bank_name} •••• ${card.last_four || '0000'}`,
      amountCents: summary.activeSummary.grossBalanceCents,
      cardId: card.id,
      cycleYM: state.selectedYearMonth
    });

    const dueDayClamped = clampDayToMonth(year, month, card.payment_due_day);
    eventsByDay.get(dueDayClamped)?.push({
      kind: 'payment_due',
      title: `Límite Pago ${card.name}`,
      subtitle: 'Para no generar intereses',
      amountCents:
        summary.previousClosedSummary.remainingPayableCents > 0
          ? summary.previousClosedSummary.remainingPayableCents
          : summary.activeSummary.remainingPayableCents,
      cardId: card.id,
      cycleYM: summary.previousClosedSummary.remainingPayableCents > 0
        ? summary.cycleInfo.previousClosedCycleYM
        : summary.cycleInfo.activeCycleYM
    });
  }

  // 2. Recurring fixed expenses in this month
  for (const rec of state.recurringExpenses) {
    if (!rec.is_active) continue;
    const recDayClamped = clampDayToMonth(year, month, rec.billing_day);
    const status = getRecurringStatusForMonth(rec.id, state.selectedYearMonth, state.recurringLogs);
    const targetLabel =
      rec.payment_method_type === 'credit_card'
        ? state.creditCards.find((c) => c.id === rec.credit_card_id)?.name || 'Tarjeta'
        : state.liquidityAccounts.find((a) => a.id === rec.liquidity_account_id)?.name || 'Débito';

    eventsByDay.get(recDayClamped)?.push({
      kind: 'recurring',
      title: `Vencimiento ${rec.name}`,
      subtitle: `Cargo en: ${targetLabel}`,
      amountCents: rec.amount_cents,
      status,
      recurringExpenseId: rec.id,
      icon: rec.icon || 'event_repeat'
    });
  }

  // Generate calendar grid cells
  const cellsHtml = [];
  for (let i = 0; i < firstDayWeekday; i++) {
    cellsHtml.push(`<span></span>`);
  }

  for (let d = 1; d <= totalDays; d++) {
    const dateISO = buildClampedDateISO(year, month, d);
    const isToday = dateISO === state.referenceDateISO;
    const isSelected = dateISO === selectedDateISO;
    const dayEvents = eventsByDay.get(d) || [];

    const hasCutoff = dayEvents.some((e) => e.kind === 'cutoff');
    const hasDue = dayEvents.some((e) => e.kind === 'payment_due');
    const hasRecurring = dayEvents.some((e) => e.kind === 'recurring');

    const dotsHtml =
      hasCutoff || hasDue || hasRecurring
        ? `<div class="cal-dots">
             ${hasCutoff ? '<span class="cal-dot-cutoff" title="Corte"></span>' : ''}
             ${hasDue ? '<span class="cal-dot-due" title="Límite Pago"></span>' : ''}
             ${hasRecurring ? '<span class="cal-dot-recurring" title="Gasto Fijo"></span>' : ''}
           </div>`
        : '';

    cellsHtml.push(`
      <button
        type="button"
        class="cal-day-btn tabular-nums ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}"
        data-action="select-cal-day"
        data-date="${dateISO}"
      >
        <span>${d}</span>
        ${dotsHtml}
      </button>
    `);
  }

  const selectedDayNumber = Number(selectedDateISO.split('-')[2]);
  const selectedEvents = eventsByDay.get(selectedDayNumber) || [];
  const selectedTx = state.transactions.filter((t) => t.tx_date === selectedDateISO);

  const agendaHtml =
    selectedEvents.length === 0 && selectedTx.length === 0
      ? `<div class="glass-card" style="text-align:center;color:var(--text-secondary);padding:22px;">
           Sin cortes, fechas límite ni gastos fijos programados en este día.
         </div>`
      : [
          ...selectedEvents.map((ev) => {
            if (ev.kind === 'recurring') {
              const isPaid = ev.status === 'paid';
              return `
                <article class="glass-card" style="display:flex;flex-direction:column;gap:12px;">
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                      <div class="icon-squircle">
                        <span class="material-symbols-outlined">${ev.icon}</span>
                      </div>
                      <div style="display:flex;flex-direction:column;">
                        <span class="card-title" style="font-size:15px;">${ev.title}</span>
                        <span class="text-subtle" style="font-size:12px;">${ev.subtitle}</span>
                      </div>
                    </div>
                    <div style="text-align:right;">
                      <span class="card-title tabular-nums">${formatCentsToMXN(ev.amountCents)}</span>
                      <span class="label-eyebrow" style="display:block;font-size:10px;">MXN</span>
                    </div>
                  </div>
                  <div class="hairline-divider-top" style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;">
                    <span class="text-subtle" style="font-size:11px;display:flex;align-items:center;gap:6px;">
                      <span class="cal-dot-recurring" style="display:inline-block;"></span>
                      Gasto Fijo Mensual
                    </span>
                    <button
                      type="button"
                      class="${isPaid ? 'btn-glass-capsule' : 'btn-primary-capsule'}"
                      style="height:34px;padding:0 14px;font-size:12px;"
                      data-action="toggle-recurring"
                      data-rec-id="${ev.recurringExpenseId}"
                    >
                      <span class="material-symbols-outlined" style="font-size:15px;">${isPaid ? 'check_circle' : 'check'}</span>
                      <span>${isPaid ? 'Pagado' : 'Marcar pagado'}</span>
                    </button>
                  </div>
                </article>
              `;
            }

            if (ev.kind === 'payment_due') {
              return `
                <article class="glass-card" style="display:flex;flex-direction:column;gap:12px;">
                  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                      <div class="icon-squircle">
                        <span class="material-symbols-outlined">credit_card</span>
                      </div>
                      <div style="display:flex;flex-direction:column;">
                        <span class="card-title" style="font-size:15px;">${ev.title}</span>
                        <span class="text-subtle" style="font-size:12px;">${ev.subtitle}</span>
                      </div>
                    </div>
                    <div style="text-align:right;">
                      <span class="card-title tabular-nums">${formatCentsToMXN(ev.amountCents)}</span>
                      <span class="label-eyebrow" style="display:block;font-size:10px;">MXN</span>
                    </div>
                  </div>
                  <div class="hairline-divider-top" style="display:flex;align-items:center;justify-content:space-between;padding-top:10px;">
                    <span class="text-subtle" style="font-size:11px;display:flex;align-items:center;gap:6px;">
                      <span class="cal-dot-due" style="display:inline-block;"></span>
                      Fecha Límite Tarjeta
                    </span>
                    <button
                      type="button"
                      class="btn-primary-capsule"
                      style="height:34px;padding:0 14px;font-size:12px;"
                      data-action="pay-card"
                      data-card-id="${ev.cardId}"
                      data-cycle-ym="${ev.cycleYM}"
                      data-amount="${ev.amountCents}"
                    >
                      <span class="material-symbols-outlined" style="font-size:15px;">done_all</span>
                      <span>Registrar pago</span>
                    </button>
                  </div>
                </article>
              `;
            }

            // Cutoff event
            return `
              <article class="glass-card" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
                <div style="display:flex;align-items:center;gap:12px;">
                  <div class="icon-squircle">
                    <span class="material-symbols-outlined">event_note</span>
                  </div>
                  <div style="display:flex;flex-direction:column;">
                    <span class="card-title" style="font-size:15px;">${ev.title}</span>
                    <span class="text-subtle" style="font-size:12px;">Cierre de estado de cuenta (${ev.subtitle})</span>
                  </div>
                </div>
                <div style="text-align:right;">
                  <span class="card-title tabular-nums">${formatCentsToMXN(ev.amountCents)}</span>
                  <span class="label-eyebrow" style="display:block;font-size:10px;">Acumulado</span>
                </div>
              </article>
            `;
          }),
          ...selectedTx.map((tx) => `
            <article class="glass-card" style="padding:12px 15px;display:flex;align-items:center;justify-content:space-between;">
              <div style="display:flex;align-items:center;gap:10px;">
                <div class="icon-squircle" style="width:34px;height:34px;border-radius:50%;">
                  <span class="material-symbols-outlined" style="font-size:18px;">receipt</span>
                </div>
                <div>
                  <span class="card-title" style="font-size:14px;display:block;">${tx.description}</span>
                  <span class="text-subtle" style="font-size:11px;">Movimiento registrado</span>
                </div>
              </div>
              <span class="card-title tabular-nums" style="font-size:15px;">${formatCentsToMXN(tx.amount_cents)}</span>
            </article>
          `)
        ].join('');

  container.innerHTML = `
    <!-- Month Selector -->
    <section style="display:flex;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:10px;">
        <h2 class="stat-amount" style="margin:0;font-size:22px;">${formatMonthYearLabel(state.selectedYearMonth)}</h2>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <button type="button" class="btn-glass-capsule" style="width:36px;height:36px;padding:0;" data-action="cal-prev-month" aria-label="Mes anterior">
          <span class="material-symbols-outlined" style="font-size:18px;">chevron_left</span>
        </button>
        <button type="button" class="btn-glass-capsule" style="height:36px;padding:0 12px;font-size:12px;" data-action="cal-feb-test" title="Probar ajuste 28 días en Febrero">
          Feb 2027
        </button>
        <button type="button" class="btn-glass-capsule" style="width:36px;height:36px;padding:0;" data-action="cal-next-month" aria-label="Mes siguiente">
          <span class="material-symbols-outlined" style="font-size:18px;">chevron_right</span>
        </button>
      </div>
    </section>

    <!-- Legend Header -->
    <section class="glass-well" style="display:flex;align-items:center;justify-content:space-around;padding:10px 12px;">
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="cal-dot-cutoff" style="position:static;width:7px;height:7px;"></span>
        <span class="label-eyebrow" style="font-size:10px;">Corte TDC</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="cal-dot-due" style="position:static;width:7px;height:7px;"></span>
        <span class="label-eyebrow" style="font-size:10px;">Límite Pago</span>
      </div>
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="cal-dot-recurring" style="position:static;width:7px;height:7px;"></span>
        <span class="label-eyebrow" style="font-size:10px;">Gasto Fijo</span>
      </div>
    </section>

    <!-- Monthly Calendar Matrix -->
    <section class="glass-card" style="padding:16px;">
      <div class="calendar-grid-header">
        <span>D</span><span>L</span><span>M</span><span>M</span><span>J</span><span>V</span><span>S</span>
      </div>
      <div class="calendar-grid-days">
        ${cellsHtml.join('')}
      </div>
    </section>

    <!-- Liquidity Projection Banner -->
    <section class="glass-card" style="padding:14px 16px;display:flex;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="icon-squircle" style="border-radius:50%;">
          <span class="material-symbols-outlined" style="font-size:20px;">account_balance_wallet</span>
        </div>
        <div style="display:flex;flex-direction:column;">
          <span class="label-eyebrow" style="font-size:10px;">Liquidez Libre Proyectada</span>
          <span class="card-title tabular-nums">${formatCentsToMXN(metrics.freeLiquidityMonthCents)} MXN</span>
        </div>
      </div>
      <div style="text-align:right;">
        <span class="label-eyebrow" style="font-size:10px;display:block;">Fijos Pendientes</span>
        <span class="tabular-nums" style="font-size:13px;font-weight:600;color:var(--signal-warn);">
          -${formatCentsToMXN(metrics.pendingDebitRecurringCents)}
        </span>
      </div>
    </section>

    <!-- Selected Date Agenda Panel -->
    <section style="display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span class="pulse-dot" aria-hidden="true"></span>
          <h3 class="card-title" style="margin:0;font-size:18px;">${formatLongDateES(selectedDateISO)}</h3>
        </div>
        <span class="badge-pill badge-pill-sky tabular-nums">${selectedEvents.length + selectedTx.length} evento${selectedEvents.length + selectedTx.length === 1 ? '' : 's'}</span>
      </div>
      <div class="agenda-list" style="display:flex;flex-direction:column;gap:10px;">
        ${agendaHtml}
      </div>
    </section>
  `;

  // Event bindings
  container.querySelectorAll('[data-action="select-cal-day"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      setState({ selectedCalendarDateISO: btn.getAttribute('data-date') }, false);
    });
  });

  container.querySelector('[data-action="cal-prev-month"]')?.addEventListener('click', () => {
    handlers.onChangeMonth(-1);
  });

  container.querySelector('[data-action="cal-next-month"]')?.addEventListener('click', () => {
    handlers.onChangeMonth(1);
  });

  container.querySelector('[data-action="cal-feb-test"]')?.addEventListener('click', () => {
    setState({
      selectedYearMonth: '2027-02',
      selectedCalendarDateISO: '2027-02-28'
    }, false);
    handlers.showToast('Calendario en Febrero 2027 (ajuste automático a 28 días)');
  });

  container.querySelectorAll('[data-action="toggle-recurring"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      handlers.onToggleRecurring(btn.getAttribute('data-rec-id'));
    });
  });

  container.querySelectorAll('[data-action="pay-card"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      handlers.onOpenPayCardModal({
        cardId: btn.getAttribute('data-card-id'),
        cycleYM: btn.getAttribute('data-cycle-ym'),
        suggestedAmountCents: Number(btn.getAttribute('data-amount')) || 0
      });
    });
  });
}
