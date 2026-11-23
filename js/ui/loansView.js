/**
 * Slice UI - Vista 5 / Módulo de Préstamos a Terceros ("Me deben")
 */

import { formatCentsToMXN, formatShortDateES } from '../engine/dateUtils.js';

export function renderLoansSection(state) {
  const activeLoans = state.loans.filter((l) => l.status === 'active');

  const cardsHtml =
    activeLoans.length === 0
      ? `<div class="glass-card" style="text-align:center;color:var(--text-secondary);padding:20px;">
           Nadie te debe dinero en este momento.
         </div>`
      : activeLoans
          .map((loan) => {
            const pendingCents = Math.max(0, loan.principal_cents - loan.repaid_cents);
            const pct =
              loan.principal_cents > 0
                ? Math.min(100, Math.round((loan.repaid_cents / loan.principal_cents) * 100))
                : 0;
            const initials = loan.borrower_name
              .split(' ')
              .map((w) => w[0])
              .join('')
              .slice(0, 2)
              .toUpperCase();
            const originAcc = state.liquidityAccounts.find((a) => a.id === loan.origin_account_id);

            return `
              <div class="glass-card" style="padding:18px;display:flex;flex-direction:column;gap:14px;">
                <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;">
                  <div style="display:flex;align-items:center;gap:12px;">
                    <div class="icon-squircle" style="border-radius:50%;font-weight:700;font-size:14px;border-color:var(--sky-border);color:var(--sky-light);">
                      ${initials}
                    </div>
                    <div>
                      <span class="card-title" style="display:block;font-size:16px;">${loan.borrower_name}</span>
                      <span class="text-subtle" style="font-size:12px;">
                        ${loan.description || 'Préstamo'} • ${formatShortDateES(loan.loan_date)} (${originAcc?.name || 'Cuenta'})
                      </span>
                    </div>
                  </div>
                  <div style="text-align:right;">
                    <span class="card-title tabular-nums" style="font-size:17px;">${formatCentsToMXN(pendingCents)}</span>
                    <span class="text-subtle" style="display:block;font-size:11px;">Resta por liquidar</span>
                  </div>
                </div>

                <div class="glass-well" style="display:flex;flex-direction:column;gap:6px;">
                  <div style="display:flex;justify-content:space-between;font-size:11px;">
                    <span style="color:var(--text-secondary);">
                      Total prestado: <strong class="tabular-nums" style="color:var(--text-primary);">${formatCentsToMXN(loan.principal_cents)}</strong>
                    </span>
                    <span class="tabular-nums" style="color:var(--sky-light);font-weight:600;">${pct}% devuelto</span>
                  </div>
                  <div class="progress-track">
                    <div class="progress-fill" style="width:${pct}%;"></div>
                  </div>
                  <div class="tabular-nums" style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-secondary);">
                    <span>Abonado: ${formatCentsToMXN(loan.repaid_cents)}</span>
                    <span>Faltan: ${formatCentsToMXN(pendingCents)}</span>
                  </div>
                </div>

                <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;">
                  <button
                    type="button"
                    class="btn-primary-capsule"
                    style="height:38px;padding:0 16px;font-size:13px;"
                    data-action="open-abono-modal"
                    data-loan-id="${loan.id}"
                  >
                    <span class="material-symbols-outlined" style="font-size:16px;">add_circle</span>
                    <span>+ Registrar Abono</span>
                  </button>
                </div>
              </div>
            `;
          })
          .join('');

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:6px;">
        <span class="material-symbols-outlined" style="font-size:18px;color:var(--text-secondary);">handshake</span>
        <h3 class="card-title" style="margin:0;">Me Deben (Por Cobrar)</h3>
      </div>
      <span class="label-eyebrow">${activeLoans.length} activo${activeLoans.length === 1 ? '' : 's'}</span>
    </div>
    <div style="display:flex;flex-direction:column;gap:10px;">
      ${cardsHtml}
    </div>
  `;
}
