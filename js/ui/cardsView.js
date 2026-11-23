/**
 * Slice UI - Vista 3: Tarjetas de Crédito & Motor de Meses Sin Intereses (MSI)
 */

import {
  formatCentsToMXN,
  formatMonthYearLabel,
  formatShortDateES,
  splitCentsForDisplay
} from '../engine/dateUtils.js';
import { computeDashboardMetrics } from '../engine/accounting.js';

export function renderCardsView(container, state, handlers) {
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

  let totalCreditLimitCents = 0;
  let totalUsedCreditCents = 0;

  for (const s of metrics.cardSummaries) {
    if (s.card.credit_limit_cents) {
      totalCreditLimitCents += s.card.credit_limit_cents;
    }
    // Total line of credit committed = current cycle non-MSI charges + all remaining MSI debt
    const nonMsiActive = Math.max(
      0,
      s.activeSummary.contadoChargesCents +
        s.activeSummary.pendingRecurringCents -
        s.activeSummary.refundsCents -
        s.activeSummary.paymentsAppliedCents
    );
    totalUsedCreditCents += nonMsiActive + s.cardCommittedMsiCents;
  }

  const availableCreditCents = Math.max(0, totalCreditLimitCents - totalUsedCreditCents);
  const utilizationPct =
    totalCreditLimitCents > 0
      ? Math.min(100, Math.round((totalUsedCreditCents / totalCreditLimitCents) * 100))
      : 0;

  const activeDisp = splitCentsForDisplay(metrics.nextCutoffAccruedCents);
  const availDisp = splitCentsForDisplay(availableCreditCents);

  const cardsListHtml = metrics.cardSummaries
    .map((s) => {
      const { card, cycleInfo, activeSummary } = s;
      const hasCreditFavor = activeSummary.creditFavorCents > 0;
      const daysBadge =
        cycleInfo.daysUntilCutoff === 0
          ? 'Corta hoy'
          : `${cycleInfo.daysUntilCutoff} día${cycleInfo.daysUntilCutoff === 1 ? '' : 's'}`;

      const cardUsed =
        Math.max(
          0,
          activeSummary.contadoChargesCents +
            activeSummary.pendingRecurringCents -
            activeSummary.refundsCents -
            activeSummary.paymentsAppliedCents
        ) + s.cardCommittedMsiCents;
      const cardAvail = card.credit_limit_cents
        ? Math.max(0, card.credit_limit_cents - cardUsed)
        : null;

      return `
        <div class="glass-card" style="padding:20px;display:flex;flex-direction:column;gap:16px;">
          <!-- Metallic Card Header -->
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div style="display:flex;align-items:center;gap:10px;">
              <div style="width:36px;height:26px;border-radius:6px;background:rgba(255,255,255,0.08);border:var(--hairline) solid rgba(125,211,252,0.28);display:flex;align-items:center;justify-content:center;">
                <span class="material-symbols-outlined" aria-hidden="true" style="font-size:15px;color:var(--sky-light);">memory</span>
              </div>
              <div>
                <span class="card-title" style="display:block;">${card.name}</span>
                <span class="text-subtle tabular-nums" style="font-size:11px;">${card.bank_name} •••• ${card.last_four || '0000'}</span>
              </div>
            </div>
            <div style="display:flex;align-items:center;">
              <div style="width:22px;height:22px;border-radius:50%;background:rgba(255,255,255,0.22);border:var(--hairline) solid rgba(255,255,255,0.18);"></div>
              <div style="width:22px;height:22px;border-radius:50%;background:rgba(90,200,250,0.22);border:var(--hairline) solid rgba(125,211,252,0.32);margin-left:-8px;backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);"></div>
            </div>
          </div>

          <!-- Dates Grid -->
          <div class="glass-well" style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div>
              <span class="label-eyebrow" style="font-size:10px;display:block;">Día de corte</span>
              <div style="display:flex;align-items:center;gap:6px;margin-top:2px;">
                <span class="tabular-nums" style="font-size:13px;font-weight:600;color:var(--text-primary);">Día ${card.cutoff_day}</span>
                <span class="badge-pill badge-pill-sky tabular-nums" style="padding:1px 7px;font-size:10px;">${daysBadge}</span>
              </div>
            </div>
            <div>
              <span class="label-eyebrow" style="font-size:10px;display:block;">Límite de pago</span>
              <span class="tabular-nums" style="font-size:13px;font-weight:600;color:var(--text-primary);display:block;margin-top:2px;">
                ${formatShortDateES(activeSummary.paymentDueDateISO, true)}
              </span>
            </div>
          </div>

          <!-- Breakdown micro-row -->
          <div class="tabular-nums" style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--text-secondary);">
            <span>Contado/Fijos: ${formatCentsToMXN(activeSummary.contadoChargesCents + activeSummary.pendingRecurringCents)}</span>
            <span>MSI ciclo: ${formatCentsToMXN(activeSummary.msiInstallmentsCents)}</span>
            ${activeSummary.refundsCents > 0 ? `<span style="color:var(--sky-light);">Reemb: -${formatCentsToMXN(activeSummary.refundsCents)}</span>` : ''}
          </div>

          <!-- Card Balance & Pay Action -->
          <div class="hairline-divider-top" style="display:flex;align-items:flex-end;justify-content:space-between;padding-top:10px;">
            <div>
              <span class="label-eyebrow" style="font-size:10px;display:block;">
                ${hasCreditFavor ? 'Saldo a Favor en Tarjeta' : `Saldo al corte (${cycleInfo.activeCycleYM})`}
              </span>
              <span class="stat-amount tabular-nums" style="font-size:24px;${hasCreditFavor ? 'color:var(--sky-light);' : ''}">
                ${hasCreditFavor ? `+${formatCentsToMXN(activeSummary.creditFavorCents)}` : formatCentsToMXN(activeSummary.remainingPayableCents)}
              </span>
              ${
                cardAvail !== null
                  ? `<span class="text-subtle tabular-nums" style="display:block;font-size:11px;margin-top:2px;">
                       Disponible: ${formatCentsToMXN(cardAvail)} / ${formatCentsToMXN(card.credit_limit_cents)}
                     </span>`
                  : ''
              }
            </div>
            <button
              type="button"
              class="btn-primary-capsule"
              style="height:38px;padding:0 16px;font-size:13px;"
              data-action="pay-card"
              data-card-id="${card.id}"
              data-cycle-ym="${cycleInfo.activeCycleYM}"
              data-amount="${activeSummary.remainingPayableCents}"
            >
              <span>Pagar</span>
              <span class="material-symbols-outlined" style="font-size:16px;">arrow_forward</span>
            </button>
          </div>
        </div>
      `;
    })
    .join('');

  // MSI Active Plans Section
  let monthlyMsiSumCents = 0;
  const msiItemsHtml = state.msiPlans
    .filter((p) => p.status === 'active')
    .map((plan) => {
      const card = state.creditCards.find((c) => c.id === plan.credit_card_id);
      const planInsts = state.msiInstallments
        .filter((i) => i.msi_plan_id === plan.id && !i.is_settled)
        .sort((a, b) => a.installment_number - b.installment_number);

      // Find installment for selectedYearMonth or the earliest pending installment
      const currentInst =
        planInsts.find((i) => i.cycle_year_month === state.selectedYearMonth) || planInsts[0];
      if (!currentInst) return '';

      monthlyMsiSumCents += currentInst.amount_cents;

      const remainingAfterCurrentCents = planInsts
        .filter((i) => i.installment_number > currentInst.installment_number)
        .reduce((acc, i) => acc + i.amount_cents, 0);
      const remainingCountAfterCurrent = planInsts.filter(
        (i) => i.installment_number > currentInst.installment_number
      ).length;

      const isLastPayment = currentInst.installment_number === currentInst.total_installments;
      const progressPct = Math.min(
        100,
        Math.round((currentInst.installment_number / currentInst.total_installments) * 100)
      );

      return `
        <div class="glass-card" style="padding:16px;display:flex;flex-direction:column;gap:12px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
            <div style="display:flex;align-items:center;gap:12px;">
              <div class="icon-squircle">
                <span class="material-symbols-outlined">${plan.icon || 'timelapse'}</span>
              </div>
              <div>
                <span class="card-title" style="font-size:15px;display:block;">${plan.description}</span>
                <span class="text-subtle" style="font-size:12px;">${plan.merchant || 'Comercio'} • ${card?.name || 'Tarjeta'}</span>
              </div>
            </div>
            <div style="text-align:right;">
              <div style="display:flex;align-items:center;justify-content:flex-end;gap:6px;">
                <span class="card-title tabular-nums" style="font-size:15px;">${formatCentsToMXN(currentInst.amount_cents)}</span>
                <button
                  type="button"
                  class="btn-glass-capsule"
                  style="width:30px;height:30px;padding:0;border-radius:50%;"
                  title="Editar monto de parcialidad para cuadrar centavos con el banco"
                  aria-label="Editar monto de parcialidad"
                  data-action="edit-msi-inst"
                  data-inst-id="${currentInst.id}"
                  data-current-cents="${currentInst.amount_cents}"
                >
                  <span class="material-symbols-outlined" aria-hidden="true" style="font-size:14px;">edit</span>
                </button>
              </div>
              <span class="text-subtle" style="font-size:11px;">al mes</span>
            </div>
          </div>

          <div style="display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;">
              <span class="tabular-nums" style="color:var(--text-primary);font-weight:600;display:flex;align-items:center;gap:6px;">
                Parcialidad ${currentInst.installment_number} de ${currentInst.total_installments}
                ${
                  isLastPayment
                    ? '<span class="badge-pill badge-pill-sky" style="padding:1px 7px;font-size:9px;">¡ÚLTIMO PAGO!</span>'
                    : ''
                }
              </span>
              <span class="tabular-nums" style="color:var(--text-secondary);">
                ${
                  isLastPayment
                    ? 'Liquida este ciclo'
                    : `Resta ${formatCentsToMXN(remainingAfterCurrentCents)} (${remainingCountAfterCurrent} pago${remainingCountAfterCurrent === 1 ? '' : 's'})`
                }
              </span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width:${progressPct}%;"></div>
            </div>
          </div>
        </div>
      `;
    })
    .join('');

  container.innerHTML = `
    <!-- Top Bar: Month Label & Nueva Tarjeta -->
    <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
      <span class="badge-pill badge-pill-sky" style="padding:7px 14px;font-size:13px;">
        ${formatMonthYearLabel(state.selectedYearMonth)}
      </span>
      <button type="button" class="btn-glass-capsule" data-action="open-new-card">
        <span class="material-symbols-outlined" aria-hidden="true" style="font-size:17px;">add_circle</span>
        <span>Nueva Tarjeta</span>
      </button>
    </div>

    <!-- Credit Utilization Hero Card -->
    <div class="glass-card-hero">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="material-symbols-outlined" aria-hidden="true" style="font-size:19px;color:var(--sky);">credit_card_heart</span>
          <span class="label-eyebrow">Salud Crediticia Global</span>
        </div>
        <span class="badge-pill badge-pill-sky tabular-nums">${utilizationPct}% comprometido</span>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px;">
        <div>
          <span class="label-eyebrow" style="font-size:10px;display:block;margin-bottom:4px;">Deuda en Ciclo Activo</span>
          <span class="stat-amount tabular-nums">
            $${activeDisp.whole}<span style="font-size:14px;color:var(--text-secondary);">.${activeDisp.decimals}</span>
          </span>
        </div>
        <div>
          <span class="label-eyebrow" style="font-size:10px;display:block;margin-bottom:4px;">Límite Libre Total</span>
          <span class="stat-amount tabular-nums">
            $${availDisp.whole}<span style="font-size:14px;color:var(--text-secondary);">.${availDisp.decimals}</span>
          </span>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;">
        <div class="progress-track" style="height:8px;">
          <div class="progress-fill ${utilizationPct >= 80 ? 'progress-fill-warn' : ''}" style="width:${utilizationPct}%;"></div>
        </div>
        <div class="tabular-nums" style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary);">
          <span>Comprometido (corte + MSI): ${formatCentsToMXN(totalUsedCreditCents)}</span>
          <span>Límite: ${formatCentsToMXN(totalCreditLimitCents)}</span>
        </div>
      </div>
    </div>

    <!-- Wallet Cards Section -->
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h2 class="card-title" style="margin:0;">Tus Tarjetas</h2>
        <span class="label-eyebrow">${metrics.cardSummaries.length} activas</span>
      </div>
      ${cardsListHtml}
    </div>

    <!-- MSI (Meses Sin Intereses) Section -->
    <div style="display:flex;flex-direction:column;gap:12px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="material-symbols-outlined" style="font-size:20px;">timelapse</span>
          <h2 class="card-title" style="margin:0;">Meses Sin Intereses Activos</h2>
        </div>
        <span class="text-subtle tabular-nums" style="font-weight:600;">${formatCentsToMXN(monthlyMsiSumCents)} / mes</span>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${msiItemsHtml || '<div class="glass-card" style="text-align:center;color:var(--text-secondary);">Sin compras a MSI activas.</div>'}
      </div>
    </div>
  `;

  // Wire buttons
  container.querySelector('[data-action="open-new-card"]')?.addEventListener('click', () => {
    handlers.onOpenNewCardModal();
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

  container.querySelectorAll('[data-action="edit-msi-inst"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      handlers.onEditMsiInstallment({
        installmentId: btn.getAttribute('data-inst-id'),
        currentCents: Number(btn.getAttribute('data-current-cents')) || 0
      });
    });
  });
}
