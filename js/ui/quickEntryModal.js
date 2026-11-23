/**
 * Slice UI - Modal Bottom-Sheet: Registro Rápido (<10 segundos en iPhone)
 * Basado en slice_registro_r_pido/code.html de Google Stitch.
 */

import {
  formatCentsToMXN,
  formatShortDateES,
  parseMXNToCents
} from '../engine/dateUtils.js';
import { resolveBillingCycle } from '../engine/billingCycle.js';
import { computeLiquidityBalances } from '../engine/accounting.js';
import {
  createMsiPurchase,
  createQuickTransaction
} from '../services/api.js';
import { getState } from '../store.js';

let modalState = {
  isOpen: false,
  mode: 'expense', // 'expense' | 'income' | 'card' | 'msi' | 'refund'
  rawAmount: '',
  selectedAccountId: null,
  selectedCardId: null,
  selectedCategoryId: null,
  deferToNextCycle: false,
  msiMonths: 6,
  msiStartInstallment: 1,
  txDateISO: '2026-11-18',
  description: ''
};

function formatRawAmountForDisplay(raw) {
  if (!raw || raw === '0') return '0.00';
  if (raw.includes('.')) {
    const [intPart, decPart] = raw.split('.');
    const formattedInt = (parseInt(intPart || '0', 10) || 0).toLocaleString('en-US');
    return `${formattedInt}.${decPart}`;
  }
  const formattedInt = (parseInt(raw, 10) || 0).toLocaleString('en-US');
  return `${formattedInt}.00`;
}

export function openQuickEntryModal(overlayEl, handlers, initialMode = 'expense') {
  const state = getState();
  modalState = {
    isOpen: true,
    mode: initialMode,
    rawAmount: '',
    selectedAccountId: state.liquidityAccounts[1]?.id || state.liquidityAccounts[0]?.id || null,
    selectedCardId: state.creditCards[0]?.id || null,
    selectedCategoryId: state.categories[0]?.id || null,
    deferToNextCycle: false,
    msiMonths: 6,
    msiStartInstallment: 1,
    txDateISO: state.referenceDateISO,
    description: ''
  };
  renderQuickEntryModal(overlayEl, handlers);
  overlayEl.classList.add('open');

  if (!window.__sliceQuickEntryKeyBound) {
    window.__sliceQuickEntryKeyBound = true;
    window.addEventListener('keydown', (e) => {
      if (!modalState.isOpen) return;
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      if (/^[0-9.]$/.test(e.key)) {
        e.preventDefault();
        appendKeypadDigit(e.key, overlayEl, handlers);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        modalState.rawAmount = modalState.rawAmount.slice(0, -1);
        renderQuickEntryModal(overlayEl, handlers);
      } else if (e.key === 'Escape') {
        closeQuickEntryModal(overlayEl);
      }
    });
  }
}

export function closeQuickEntryModal(overlayEl) {
  modalState.isOpen = false;
  overlayEl.classList.remove('open');
}

export function renderQuickEntryModal(overlayEl, handlers) {
  const state = getState();
  const isCardMode =
    modalState.mode === 'card' || modalState.mode === 'msi' || modalState.mode === 'refund';

  const { byAccountId } = computeLiquidityBalances(state.liquidityAccounts, state.transactions);

  let contextRightLabel = '';
  if (!isCardMode) {
    const bal = byAccountId.get(modalState.selectedAccountId) ?? 0;
    contextRightLabel = `Saldo: ${formatCentsToMXN(bal)}`;
  } else {
    const card = state.creditCards.find((c) => c.id === modalState.selectedCardId);
    if (card) {
      const cycle = resolveBillingCycle({
        txDateISO: modalState.txDateISO,
        cutoffDay: card.cutoff_day,
        paymentDueDay: card.payment_due_day,
        deferToNextCycle: modalState.deferToNextCycle
      });
      contextRightLabel = `Ciclo ${cycle.assignedCycleYM} · Pago ${formatShortDateES(cycle.paymentDueDateISO)}`;
    }
  }

  const activeAccounts = state.liquidityAccounts.filter((a) => !a.is_archived);
  const activeCards = state.creditCards.filter((c) => !c.is_archived);

  const pillsHtml = !isCardMode
    ? activeAccounts.length === 0
      ? `<button type="button" class="choice-pill active" data-action="qe-create-account">
           <span class="material-symbols-outlined" style="font-size:16px;">add_circle</span>
           <span>+ Crear cuenta de liquidez</span>
         </button>`
      : activeAccounts
          .map(
            (acc) => `
              <button
                type="button"
                class="choice-pill ${modalState.selectedAccountId === acc.id ? 'active' : ''}"
                data-action="select-qe-account"
                data-id="${acc.id}"
              >
                <span class="material-symbols-outlined" style="font-size:16px;">${acc.icon || 'account_balance_wallet'}</span>
                <span>${acc.name}</span>
              </button>
            `
          )
          .join('')
    : activeCards.length === 0
      ? `<button type="button" class="choice-pill active" data-action="qe-create-card">
           <span class="material-symbols-outlined" style="font-size:16px;">add_circle</span>
           <span>+ Crear tarjeta de crédito</span>
         </button>`
      : activeCards
          .map(
            (card) => `
              <button
                type="button"
                class="choice-pill ${modalState.selectedCardId === card.id ? 'active' : ''}"
                data-action="select-qe-card"
                data-id="${card.id}"
              >
                <span class="material-symbols-outlined" style="font-size:16px;">credit_card</span>
                <span>${card.name} (Corte ${card.cutoff_day})</span>
              </button>
            `
          )
          .join('');

  const visibleCategories = state.categories.filter((c) =>
    modalState.mode === 'income' ? c.kind === 'income' || c.kind === 'expense' : c.kind !== 'system'
  );

  const categoriesHtml = visibleCategories
    .slice(0, 8)
    .map(
      (cat) => `
        <button
          type="button"
          class="category-tile ${modalState.selectedCategoryId === cat.id ? 'active' : ''}"
          data-action="select-qe-category"
          data-id="${cat.id}"
        >
          <span class="material-symbols-outlined" style="font-size:21px;">${cat.icon}</span>
          <span style="width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${cat.name}</span>
        </button>
      `
    )
    .join('');

  const amountCents = parseMXNToCents(modalState.rawAmount || '0');
  const msiMonthlyCents =
    modalState.msiMonths > 0 ? Math.floor(amountCents / modalState.msiMonths) : 0;

  const startInstallmentOptions = [];
  for (let i = 1; i <= modalState.msiMonths; i++) {
    startInstallmentOptions.push(
      `<option value="${i}" ${i === modalState.msiStartInstallment ? 'selected' : ''}>Parcialidad ${i} de ${modalState.msiMonths}</option>`
    );
  }

  overlayEl.innerHTML = `
    <div class="bottom-sheet" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>

      <!-- Sheet Header -->
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <button type="button" class="btn-glass-capsule" style="height:34px;" data-action="close-qe">
          Cancelar
        </button>
        <span class="card-title">Nuevo Registro</span>
        <button type="button" class="btn-primary-capsule" style="height:34px;padding:0 16px;font-size:13px;" data-action="submit-qe">
          Listo
        </button>
      </div>

      <!-- Big Hero Amount Display -->
      <div class="glass-card" style="padding:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;">
        <span class="badge-pill" style="font-size:10px;">MXN • PESOS MEXICANOS</span>
        <div class="hero-amount tabular-nums" style="display:flex;align-items:baseline;justify-content:center;margin-top:4px;">
          <span style="color:var(--text-secondary);font-weight:400;margin-right:4px;">$</span>
          <span id="qe-amount-display">${formatRawAmountForDisplay(modalState.rawAmount)}</span>
        </div>
        ${
          modalState.mode === 'msi' && amountCents > 0
            ? `<span class="text-subtle tabular-nums" style="font-size:12px;">
                 ${modalState.msiMonths} pagos de ${formatCentsToMXN(msiMonthlyCents)} / mes
               </span>`
            : `<span class="label-eyebrow" style="font-size:10px;">Usa el teclado táctil o físico</span>`
        }
      </div>

      <!-- Segmented Control (5 modes) -->
      <nav class="segmented-control" aria-label="Tipo de transacción">
        <button type="button" class="segmented-btn ${modalState.mode === 'expense' ? 'active' : ''}" data-action="set-qe-mode" data-mode="expense">Gasto</button>
        <button type="button" class="segmented-btn ${modalState.mode === 'income' ? 'active' : ''}" data-action="set-qe-mode" data-mode="income">Ingreso</button>
        <button type="button" class="segmented-btn ${modalState.mode === 'card' ? 'active' : ''}" data-action="set-qe-mode" data-mode="card">Tarjeta</button>
        <button type="button" class="segmented-btn ${modalState.mode === 'msi' ? 'active' : ''}" data-action="set-qe-mode" data-mode="msi">MSI</button>
        <button type="button" class="segmented-btn ${modalState.mode === 'refund' ? 'active' : ''}" data-action="set-qe-mode" data-mode="refund">Reembolso</button>
      </nav>

      <!-- Account / Credit Card Selector Pills -->
      <div style="display:flex;flex-direction:column;gap:6px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span class="label-eyebrow">${isCardMode ? 'Tarjeta de Crédito' : 'Cuenta de Liquidez'}</span>
          <span class="text-subtle tabular-nums" style="font-size:11px;">${contextRightLabel}</span>
        </div>
        <div class="pill-row">
          ${pillsHtml}
        </div>
      </div>

      <!-- iOS Toggle: Diferir al siguiente corte (visible in Credit Card modes) -->
      ${
        isCardMode
          ? `
            <div class="glass-well" style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
              <div style="display:flex;align-items:center;gap:10px;">
                <div class="icon-squircle" style="width:34px;height:34px;border-radius:50%;">
                  <span class="material-symbols-outlined" style="font-size:18px;">calendar_month</span>
                </div>
                <div>
                  <span style="font-size:14px;font-weight:600;color:#fff;display:block;">Diferir al siguiente corte</span>
                  <span class="text-subtle" style="font-size:11px;">Para compras en día de corte o en tránsito</span>
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked="${modalState.deferToNextCycle ? 'true' : 'false'}"
                class="ios-switch"
                data-action="toggle-qe-defer"
              >
                <span class="ios-switch-knob"></span>
              </button>
            </div>
          `
          : ''
      }

      <!-- MSI Section (visible when mode === 'msi') -->
      ${
        modalState.mode === 'msi'
          ? `
            <div class="glass-well" style="display:flex;flex-direction:column;gap:10px;">
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <span style="font-size:14px;font-weight:600;color:#fff;display:flex;align-items:center;gap:6px;">
                  <span class="material-symbols-outlined" style="font-size:18px;">view_timeline</span>
                  Plazo Meses Sin Intereses
                </span>
                <span class="label-eyebrow">0% Interés</span>
              </div>
              <div style="display:grid;grid-template-columns:repeat(6, 1fr);gap:6px;">
                ${[3, 6, 9, 12, 18, 24]
                  .map(
                    (m) => `
                      <button
                        type="button"
                        class="choice-pill ${modalState.msiMonths === m ? 'active' : ''}"
                        style="justify-content:center;padding:8px 0;"
                        data-action="select-qe-msi-months"
                        data-months="${m}"
                      >
                        ${m}
                      </button>
                    `
                  )
                  .join('')}
              </div>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding-top:4px;">
                <span class="text-subtle" style="font-size:12px;">Parcialidad inicial (Backfill):</span>
                <div class="input-well" style="min-height:36px;padding:0 10px;width:auto;">
                  <select id="qe-msi-start-select" style="font-size:12px;font-weight:600;">
                    ${startInstallmentOptions.join('')}
                  </select>
                </div>
              </div>
            </div>
          `
          : ''
      }

      <!-- Category Selector Grid -->
      <div style="display:flex;flex-direction:column;gap:6px;">
        <span class="label-eyebrow">Categoría</span>
        <div class="category-grid">
          ${categoriesHtml}
        </div>
      </div>

      <!-- Concept & Date Inputs -->
      <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:8px;">
        <div class="input-well" style="min-height:44px;">
          <span class="material-symbols-outlined" style="font-size:18px;color:var(--text-secondary);">edit_note</span>
          <input
            type="text"
            id="qe-desc-input"
            placeholder="Concepto o comercio..."
            value="${modalState.description.replace(/"/g, '&quot;')}"
            style="font-size:14px;"
          />
        </div>
        <div class="input-well" style="min-height:44px;">
          <input
            type="date"
            id="qe-date-input"
            value="${modalState.txDateISO}"
            style="font-size:13px;"
          />
        </div>
      </div>

      <!-- Integrated iOS Monochromatic Keypad -->
      <div class="keypad-grid">
        ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0']
          .map(
            (key) => `
              <button type="button" class="keypad-btn tabular-nums" data-action="qe-key" data-key="${key}">
                ${key}
              </button>
            `
          )
          .join('')}
        <button type="button" class="keypad-btn" data-action="qe-backspace" aria-label="Borrar dígito">
          <span class="material-symbols-outlined" style="font-size:20px;">backspace</span>
        </button>
      </div>

      <!-- Primary Submit Action -->
      <button type="button" class="btn-primary-capsule" style="width:100%;height:50px;" data-action="submit-qe">
        <span class="material-symbols-outlined" style="font-size:20px;">check_circle</span>
        <span>Guardar Movimiento</span>
      </button>
    </div>
  `;

  // Sync text inputs before re-renders
  const descInput = overlayEl.querySelector('#qe-desc-input');
  descInput?.addEventListener('input', (e) => {
    modalState.description = e.target.value;
  });

  const dateInput = overlayEl.querySelector('#qe-date-input');
  dateInput?.addEventListener('change', (e) => {
    if (e.target.value) {
      modalState.txDateISO = e.target.value;
      renderQuickEntryModal(overlayEl, handlers);
    }
  });

  const startSelect = overlayEl.querySelector('#qe-msi-start-select');
  startSelect?.addEventListener('change', (e) => {
    modalState.msiStartInstallment = Number(e.target.value) || 1;
  });

  // Keypad handlers
  overlayEl.querySelectorAll('[data-action="qe-key"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      appendKeypadDigit(btn.getAttribute('data-key'), overlayEl, handlers);
    });
  });

  overlayEl.querySelector('[data-action="qe-backspace"]')?.addEventListener('click', () => {
    modalState.rawAmount = modalState.rawAmount.slice(0, -1);
    renderQuickEntryModal(overlayEl, handlers);
  });

  // Mode switch
  overlayEl.querySelectorAll('[data-action="set-qe-mode"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextMode = btn.getAttribute('data-mode');
      modalState.mode = nextMode;
      if (nextMode === 'income') {
        const incCat = state.categories.find((c) => c.kind === 'income');
        if (incCat) modalState.selectedCategoryId = incCat.id;
      }
      renderQuickEntryModal(overlayEl, handlers);
    });
  });

  // Account / card / category selection
  overlayEl.querySelectorAll('[data-action="select-qe-account"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      modalState.selectedAccountId = btn.getAttribute('data-id');
      renderQuickEntryModal(overlayEl, handlers);
    });
  });

  overlayEl.querySelectorAll('[data-action="select-qe-card"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      modalState.selectedCardId = btn.getAttribute('data-id');
      renderQuickEntryModal(overlayEl, handlers);
    });
  });

  overlayEl.querySelectorAll('[data-action="select-qe-category"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      modalState.selectedCategoryId = btn.getAttribute('data-id');
      renderQuickEntryModal(overlayEl, handlers);
    });
  });

  overlayEl.querySelector('[data-action="toggle-qe-defer"]')?.addEventListener('click', () => {
    modalState.deferToNextCycle = !modalState.deferToNextCycle;
    renderQuickEntryModal(overlayEl, handlers);
  });

  overlayEl.querySelectorAll('[data-action="select-qe-msi-months"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      modalState.msiMonths = Number(btn.getAttribute('data-months')) || 6;
      if (modalState.msiStartInstallment > modalState.msiMonths) {
        modalState.msiStartInstallment = 1;
      }
      renderQuickEntryModal(overlayEl, handlers);
    });
  });

  overlayEl.querySelector('[data-action="qe-create-account"]')?.addEventListener('click', () => {
    closeQuickEntryModal(overlayEl);
    handlers.onOpenNewAccountModal();
  });

  overlayEl.querySelector('[data-action="qe-create-card"]')?.addEventListener('click', () => {
    closeQuickEntryModal(overlayEl);
    handlers.onOpenNewCardModal();
  });

  overlayEl.querySelectorAll('[data-action="close-qe"]').forEach((btn) => {
    btn.addEventListener('click', () => closeQuickEntryModal(overlayEl));
  });

  overlayEl.querySelectorAll('[data-action="submit-qe"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await submitQuickEntry(overlayEl, handlers);
    });
  });
}

function appendKeypadDigit(val, overlayEl, handlers) {
  let raw = modalState.rawAmount;
  if (val === '.') {
    if (!raw.includes('.')) {
      raw = (raw || '0') + '.';
    }
  } else {
    if (raw.includes('.')) {
      const decimals = raw.split('.')[1];
      if (decimals && decimals.length >= 2) return;
    }
    if (raw === '0') {
      raw = val;
    } else if (raw.length < 9) {
      raw += val;
    }
  }
  modalState.rawAmount = raw;
  renderQuickEntryModal(overlayEl, handlers);
}

async function submitQuickEntry(overlayEl, handlers) {
  try {
    const amountCents = parseMXNToCents(modalState.rawAmount);
    if (amountCents <= 0) {
      handlers.showToast('Ingresa un monto mayor a $0.00');
      return;
    }

    if (modalState.mode === 'msi') {
      await createMsiPurchase({
        creditCardId: modalState.selectedCardId,
        categoryId: modalState.selectedCategoryId,
        description: modalState.description,
        purchaseDateISO: modalState.txDateISO,
        deferToNextCycle: modalState.deferToNextCycle,
        totalAmountCents: amountCents,
        totalMonths: modalState.msiMonths,
        startInstallment: modalState.msiStartInstallment
      });
      closeQuickEntryModal(overlayEl);
      handlers.showToast(`Plan ${modalState.msiMonths} MSI registrado`);
      return;
    }

    const txTypeMap = {
      expense: 'liquidity_expense',
      income: 'income',
      card: 'card_charge',
      refund: 'card_refund'
    };

    await createQuickTransaction({
      txType: txTypeMap[modalState.mode],
      amountCents,
      txDateISO: modalState.txDateISO,
      liquidityAccountId: modalState.selectedAccountId,
      creditCardId: modalState.selectedCardId,
      categoryId: modalState.selectedCategoryId,
      deferToNextCycle: modalState.deferToNextCycle,
      description: modalState.description
    });

    closeQuickEntryModal(overlayEl);
    handlers.showToast('Movimiento guardado');
  } catch (err) {
    handlers.showToast(err.message || 'Error al guardar movimiento');
  }
}
