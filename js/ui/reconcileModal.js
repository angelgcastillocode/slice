/**
 * Slice UI - Modal Bottom-Sheet: Arqueo Rápido ("Cuadrar Saldo")
 * Calcula el ajuste instantáneo por diferencia (delta = saldo_real - saldo_sistema).
 */

import { formatCentsToMXN, parseMXNToCents } from '../engine/dateUtils.js';
import {
  computeLiquidityBalances,
  computeReconciliationDelta
} from '../engine/accounting.js';
import { reconcileLiquidityAccount } from '../services/api.js';
import { getState } from '../store.js';

export function openReconcileModal(overlayEl, accountId, handlers) {
  const state = getState();
  const account =
    state.liquidityAccounts.find((a) => a.id === accountId) || state.liquidityAccounts[0];
  if (!account) return;

  const { byAccountId } = computeLiquidityBalances(state.liquidityAccounts, state.transactions);
  const currentSystemCents = byAccountId.get(account.id) ?? 0;
  const initialInputStr = (currentSystemCents / 100).toFixed(2);

  overlayEl.innerHTML = `
    <div class="bottom-sheet" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>

      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <span class="label-eyebrow">Arqueo de Liquidez</span>
          <h3 class="card-title" style="margin:2px 0 0 0;font-size:20px;">${account.name}</h3>
        </div>
        <button type="button" class="btn-glass-capsule" style="width:34px;height:34px;padding:0;" data-action="close-reconcile">
          <span class="material-symbols-outlined" style="font-size:18px;">close</span>
        </button>
      </div>

      <!-- Saldo Registrado en Sistema -->
      <div class="glass-well" style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <span class="text-subtle" style="font-size:12px;display:block;">Saldo registrado en sistema</span>
          <span class="card-title tabular-nums" style="font-size:18px;">${formatCentsToMXN(currentSystemCents)} MXN</span>
        </div>
        <span class="material-symbols-outlined" style="font-size:22px;color:var(--secondary);">account_balance_wallet</span>
      </div>

      <!-- Input de Saldo Real Actual -->
      <div style="display:flex;flex-direction:column;gap:6px;">
        <label class="label-eyebrow" for="reconcile-real-input">Saldo Real Actual (en tu banco o cartera)</label>
        <div class="input-well" style="min-height:54px;">
          <span class="stat-amount" style="color:var(--text-secondary);font-size:22px;">$</span>
          <input
            type="number"
            inputmode="decimal"
            step="0.01"
            id="reconcile-real-input"
            class="tabular-nums"
            value="${initialInputStr}"
            style="font-size:22px;font-weight:600;"
          />
          <span class="label-eyebrow">MXN</span>
        </div>
      </div>

      <!-- Indicador de Ajuste en Tiempo Real -->
      <div class="glass-well" style="display:flex;align-items:center;justify-content:space-between;">
        <span class="text-subtle">Movimiento de ajuste a generar:</span>
        <span class="card-title tabular-nums" id="reconcile-delta-preview">$0.00 MXN</span>
      </div>

      <!-- Botones de Acción -->
      <div style="display:flex;gap:10px;">
        <button type="button" class="btn-glass-capsule" style="flex:1;height:48px;font-size:14px;" data-action="close-reconcile">
          Cancelar
        </button>
        <button type="button" class="btn-primary-capsule" style="flex:1;height:48px;font-size:14px;" data-action="confirm-reconcile">
          <span class="material-symbols-outlined" style="font-size:18px;">check_circle</span>
          <span>Confirmar Ajuste</span>
        </button>
      </div>
    </div>
  `;

  overlayEl.classList.add('open');

  const inputEl = overlayEl.querySelector('#reconcile-real-input');
  const deltaEl = overlayEl.querySelector('#reconcile-delta-preview');

  function updateDeltaPreview() {
    const observedCents = parseMXNToCents(inputEl.value);
    const { deltaCents } = computeReconciliationDelta(currentSystemCents, observedCents);
    deltaEl.textContent = formatCentsToMXN(deltaCents, { signed: true, withCode: true });
  }

  inputEl?.addEventListener('input', updateDeltaPreview);
  setTimeout(() => inputEl?.select(), 60);

  overlayEl.querySelectorAll('[data-action="close-reconcile"]').forEach((btn) => {
    btn.addEventListener('click', () => overlayEl.classList.remove('open'));
  });

  overlayEl.querySelector('[data-action="confirm-reconcile"]')?.addEventListener('click', async () => {
    const observedCents = parseMXNToCents(inputEl.value);
    const res = await reconcileLiquidityAccount({
      accountId: account.id,
      observedRealBalanceCents: observedCents,
      txDateISO: state.referenceDateISO
    });
    overlayEl.classList.remove('open');
    if (res.adjusted) {
      handlers.showToast(
        `Saldo cuadrado (${formatCentsToMXN(res.deltaCents, { signed: true })})`
      );
    } else {
      handlers.showToast('El saldo ya estaba cuadrado al centavo');
    }
  });
}
