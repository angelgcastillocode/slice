/**
 * Slice - Orquestador Principal del Cliente PWA (Conectado a Supabase Auth & PostgREST)
 */

import {
  getRememberedAuthPrefs,
  initAuth,
  saveRememberedAuthPrefs,
  signInWithPassword,
  signOut
} from '../auth.js';
import { addMonthsToYM, formatCentsToMXN, parseMXNToCents } from '../engine/dateUtils.js';
import {
  clearMemoryState,
  getState,
  setState,
  subscribe
} from '../store.js';
import {
  createCreditCard,
  createLiquidityAccount,
  createLoan,
  createRecurringExpense,
  fetchInitialSnapshot,
  recordCardStatementPayment,
  recordLoanRepayment,
  toggleRecurringExpenseStatus,
  updateMsiInstallmentAmount
} from '../services/api.js';
import { renderDashboardView } from './dashboardView.js';
import { renderCalendarView } from './calendarView.js';
import { renderCardsView } from './cardsView.js';
import { renderRecurringView } from './recurringView.js';
import { closeQuickEntryModal, openQuickEntryModal } from './quickEntryModal.js';
import { openReconcileModal } from './reconcileModal.js';
import {
  TAB_ORDER,
  initDockController,
  initScreenSwipeController,
  initSheetDismissGestures
} from './gestures.js';

const TAB_TITLES = {
  inicio: 'Inicio',
  calendario: 'Calendario',
  tarjetas: 'Tarjetas & MSI',
  fijos: 'Fijos & Me deben'
};

let toastTimer = null;
let lastRenderedTab = null;
let viewEnterTimer = null;
let dockController = null;

function revealModalOverlay(overlayEl) {
  if (!overlayEl) return;
  overlayEl.classList.remove('open');
  void overlayEl.offsetWidth;
  requestAnimationFrame(() => {
    overlayEl.classList.add('open');
  });
}

export function showToast(message) {
  const toastEl = document.getElementById('toast-banner');
  const textEl = document.getElementById('toast-text');
  if (!toastEl || !textEl) return;

  textEl.textContent = message;
  toastEl.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('visible');
  }, 2600);
}

function getHandlers() {
  const quickEntryOverlay = document.getElementById('modal-quick-entry');
  const reconcileOverlay = document.getElementById('modal-reconcile');
  const auxOverlay = document.getElementById('modal-auxiliary');

  return {
    showToast,
    onChangeMonth(deltaMonths) {
      const state = getState();
      const nextYM = addMonthsToYM(state.selectedYearMonth, deltaMonths);
      setState({
        selectedYearMonth: nextYM,
        selectedCalendarDateISO: `${nextYM}-20`
      }, false);
    },
    onOpenReconcileModal(accountId) {
      openReconcileModal(reconcileOverlay, accountId, getHandlers());
    },
    async onToggleRecurring(recurringExpenseId) {
      try {
        const state = getState();
        const nextStatus = await toggleRecurringExpenseStatus({
          recurringExpenseId,
          yearMonth: state.selectedYearMonth
        });
        showToast(
          nextStatus === 'paid'
            ? 'Gasto fijo marcado como pagado en Supabase'
            : 'Gasto fijo revertido a pendiente'
        );
      } catch (err) {
        showToast(err.message);
      }
    },
    onOpenPayCardModal({ cardId, cycleYM, suggestedAmountCents }) {
      openPayCardModal(auxOverlay, { cardId, cycleYM, suggestedAmountCents });
    },
    onOpenLoanRepaymentModal(loanId) {
      openLoanRepaymentModal(auxOverlay, loanId);
    },
    onOpenNewCardModal() {
      openNewCardModal(auxOverlay);
    },
    onOpenNewAccountModal() {
      openNewAccountModal(auxOverlay);
    },
    onOpenNewRecurringModal() {
      openNewRecurringModal(auxOverlay);
    },
    onOpenNewLoanModal() {
      openNewLoanModal(auxOverlay);
    },
    onEditMsiInstallment({ installmentId, currentCents }) {
      openEditMsiInstallmentModal(auxOverlay, { installmentId, currentCents });
    },
    onOpenDataControlsModal() {
      openSessionAndSyncModal(auxOverlay);
    },
    onOpenQuickEntry(initialMode = 'expense') {
      openQuickEntryModal(quickEntryOverlay, getHandlers(), initialMode);
    }
  };
}

function hydrateAuthForm() {
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const rememberCheckbox = document.getElementById('auth-remember');
  const { rememberMe, savedEmail } = getRememberedAuthPrefs();

  if (rememberCheckbox) {
    rememberCheckbox.checked = rememberMe;
  }

  if (rememberMe && savedEmail) {
    if (emailInput) {
      emailInput.value = savedEmail;
    }
    if (passwordInput) {
      passwordInput.focus();
    }
  } else if (!rememberMe && emailInput) {
    emailInput.value = '';
  }
}

function toggleAuthVsAppScreen(isAuthenticated) {
  const authScreen = document.getElementById('auth-screen');
  const appShell = document.getElementById('app-shell');
  const wasHidden = authScreen ? authScreen.style.display !== 'flex' : false;

  if (authScreen) {
    authScreen.style.display = isAuthenticated ? 'none' : 'flex';
  }
  if (appShell) {
    appShell.style.display = isAuthenticated ? 'flex' : 'none';
  }

  if (!isAuthenticated && wasHidden) {
    hydrateAuthForm();
  }
}

function renderApp(state) {
  if (!state.user) {
    lastRenderedTab = null;
    toggleAuthVsAppScreen(false);
    return;
  }

  toggleAuthVsAppScreen(true);

  const headerTitleEl = document.getElementById('header-view-title');
  if (headerTitleEl) {
    headerTitleEl.textContent = TAB_TITLES[state.activeTab] || 'Slice';
  }

  const syncLabelEl = document.getElementById('sync-status-label');
  if (syncLabelEl) {
    syncLabelEl.textContent = state.isSyncing ? 'Sincronizando...' : 'Sesión';
  }

  // Toggle active nav item
  document.querySelectorAll('.nav-item[data-tab]').forEach((item) => {
    const isMatch = item.getAttribute('data-tab') === state.activeTab;
    item.classList.toggle('active', isMatch);
    if (isMatch) {
      item.setAttribute('aria-current', 'page');
    } else {
      item.removeAttribute('aria-current');
    }
  });

  // Toggle active view section and render it
  const views = {
    inicio: document.getElementById('view-dashboard'),
    calendario: document.getElementById('view-calendar'),
    tarjetas: document.getElementById('view-cards'),
    fijos: document.getElementById('view-recurring')
  };

  const tabChanged = state.activeTab !== lastRenderedTab;
  const prevIdx = TAB_ORDER.indexOf(lastRenderedTab);
  const nextIdx = TAB_ORDER.indexOf(state.activeTab);

  for (const [tabKey, sectionEl] of Object.entries(views)) {
    if (!sectionEl) continue;
    const isActive = tabKey === state.activeTab;
    sectionEl.classList.toggle('active', isActive);
    if (tabChanged) {
      sectionEl.classList.remove(
        'view-entering',
        'view-enter-from-right',
        'view-enter-from-left',
        'is-swiping',
        'is-snapping-back'
      );
      sectionEl.style.transform = '';
      sectionEl.style.opacity = '';
    }
  }

  const handlers = getHandlers();
  if (state.activeTab === 'inicio' && views.inicio) {
    renderDashboardView(views.inicio, state, handlers);
  } else if (state.activeTab === 'calendario' && views.calendario) {
    renderCalendarView(views.calendario, state, handlers);
  } else if (state.activeTab === 'tarjetas' && views.tarjetas) {
    renderCardsView(views.tarjetas, state, handlers);
  } else if (state.activeTab === 'fijos' && views.fijos) {
    renderRecurringView(views.fijos, state, handlers);
  }

  if (tabChanged) {
    const activeSection = views[state.activeTab];
    if (activeSection) {
      if (prevIdx !== -1) {
        window.scrollTo(0, 0);
      }
      void activeSection.offsetWidth;
      activeSection.classList.add('view-entering');
      if (prevIdx !== -1 && nextIdx !== -1 && nextIdx !== prevIdx) {
        activeSection.classList.add(
          nextIdx > prevIdx ? 'view-enter-from-right' : 'view-enter-from-left'
        );
      }
      if (viewEnterTimer) clearTimeout(viewEnterTimer);
      viewEnterTimer = setTimeout(() => {
        activeSection.classList.remove(
          'view-entering',
          'view-enter-from-right',
          'view-enter-from-left'
        );
      }, 650);
    }
    lastRenderedTab = state.activeTab;
    dockController?.syncActiveTab(state.activeTab, { instant: prevIdx === -1 });
  }
}

/* ============================================================================
   Modales Auxiliares (Abono Préstamo, Pago Tarjeta, Alta, Sesión Supabase)
   ============================================================================ */

function openLoanRepaymentModal(overlayEl, loanId) {
  const state = getState();
  const loan = state.loans.find((l) => l.id === loanId);
  if (!loan) return;

  const pendingCents = Math.max(0, loan.principal_cents - loan.repaid_cents);
  const pendingFloat = (pendingCents / 100).toFixed(2);

  const accountOptions = state.liquidityAccounts
    .filter((a) => !a.is_archived)
    .map((a) => `<option value="${a.id}">${a.name}</option>`)
    .join('');

  overlayEl.innerHTML = `
    <div class="bottom-sheet" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <span class="label-eyebrow">Abono Directo ("Me deben")</span>
          <h3 class="card-title" style="margin:2px 0 0 0;font-size:20px;">${loan.borrower_name}</h3>
        </div>
        <button type="button" class="btn-glass-capsule" style="width:34px;height:34px;padding:0;" data-action="close-aux" aria-label="Cerrar">
          <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">close</span>
        </button>
      </div>

      <div class="glass-well" style="display:flex;justify-content:space-between;align-items:center;">
        <span class="text-subtle">Saldo pendiente por cobrar:</span>
        <span class="card-title tabular-nums">${formatCentsToMXN(pendingCents)} MXN</span>
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;">
        <label class="label-eyebrow">Monto a abonar (MXN)</label>
        <div class="input-well" style="min-height:52px;">
          <span class="stat-amount" style="color:var(--text-secondary);">$</span>
          <input type="number" inputmode="decimal" step="0.01" id="aux-abono-amount" class="tabular-nums" value="${pendingFloat}" style="font-size:22px;font-weight:600;" />
        </div>
      </div>

      <div style="display:flex;gap:8px;">
        <button type="button" class="btn-glass-capsule tabular-nums" style="flex:1;" data-quick-abono="50">+$50</button>
        <button type="button" class="btn-glass-capsule tabular-nums" style="flex:1;" data-quick-abono="100">+$100</button>
        <button type="button" class="btn-glass-capsule" style="flex:1;" data-quick-abono="full">Liquidar Total</button>
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;">
        <label class="label-eyebrow">Cuenta donde recibes el dinero</label>
        <div class="input-well">
          <select id="aux-abono-account">${accountOptions}</select>
        </div>
      </div>

      <button type="button" class="btn-primary-capsule" style="width:100%;" id="aux-confirm-abono">
        <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">check_circle</span>
        <span>Confirmar Abono</span>
      </button>
    </div>
  `;

  revealModalOverlay(overlayEl);

  const inputEl = overlayEl.querySelector('#aux-abono-amount');
  overlayEl.querySelectorAll('[data-quick-abono]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-quick-abono');
      if (mode === 'full') {
        inputEl.value = pendingFloat;
      } else {
        inputEl.value = Number(mode).toFixed(2);
      }
    });
  });

  overlayEl.querySelector('[data-action="close-aux"]')?.addEventListener('click', () => {
    overlayEl.classList.remove('open');
  });

  overlayEl.querySelector('#aux-confirm-abono')?.addEventListener('click', async () => {
    try {
      const amountCents = parseMXNToCents(inputEl.value);
      const destAccId = overlayEl.querySelector('#aux-abono-account').value;
      await recordLoanRepayment({
        loanId: loan.id,
        destinationAccountId: destAccId,
        amountCents,
        repaymentDateISO: state.referenceDateISO
      });
      overlayEl.classList.remove('open');
      showToast(`Abono de ${formatCentsToMXN(amountCents)} registrado`);
    } catch (err) {
      showToast(err.message);
    }
  });
}

function openPayCardModal(overlayEl, { cardId, cycleYM, suggestedAmountCents }) {
  const state = getState();
  const card = state.creditCards.find((c) => c.id === cardId);
  if (!card) return;

  const accountOptions = state.liquidityAccounts
    .filter((a) => !a.is_archived)
    .map((a) => `<option value="${a.id}">${a.name}</option>`)
    .join('');

  const suggestedStr = ((suggestedAmountCents || 0) / 100).toFixed(2);

  overlayEl.innerHTML = `
    <div class="bottom-sheet" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <span class="label-eyebrow">Pago de Tarjeta de Crédito</span>
          <h3 class="card-title" style="margin:2px 0 0 0;font-size:20px;">${card.name} (Ciclo ${cycleYM})</h3>
        </div>
        <button type="button" class="btn-glass-capsule" style="width:34px;height:34px;padding:0;" data-action="close-aux" aria-label="Cerrar">
          <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">close</span>
        </button>
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;">
        <label class="label-eyebrow">Monto a pagar (MXN)</label>
        <div class="input-well" style="min-height:52px;">
          <span class="stat-amount" style="color:var(--text-secondary);">$</span>
          <input type="number" inputmode="decimal" step="0.01" id="aux-cardpay-amount" class="tabular-nums" value="${suggestedStr}" style="font-size:22px;font-weight:600;" />
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:6px;">
        <label class="label-eyebrow">Cuenta de liquidez de origen</label>
        <div class="input-well">
          <select id="aux-cardpay-account">${accountOptions}</select>
        </div>
      </div>

      <button type="button" class="btn-primary-capsule" style="width:100%;" id="aux-confirm-cardpay">
        <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">check_circle</span>
        <span>Registrar Pago de Tarjeta</span>
      </button>
    </div>
  `;

  revealModalOverlay(overlayEl);

  overlayEl.querySelector('[data-action="close-aux"]')?.addEventListener('click', () => {
    overlayEl.classList.remove('open');
  });

  overlayEl.querySelector('#aux-confirm-cardpay')?.addEventListener('click', async () => {
    try {
      const amountCents = parseMXNToCents(overlayEl.querySelector('#aux-cardpay-amount').value);
      const liquidityAccountId = overlayEl.querySelector('#aux-cardpay-account').value;
      await recordCardStatementPayment({
        cardId: card.id,
        cycleYM,
        liquidityAccountId,
        amountCents,
        txDateISO: state.referenceDateISO
      });
      overlayEl.classList.remove('open');
      showToast(`Pago a ${card.name} guardado en Supabase`);
    } catch (err) {
      showToast(err.message);
    }
  });
}

function openNewCardModal(overlayEl) {
  overlayEl.innerHTML = `
    <div class="bottom-sheet" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h3 class="card-title" style="margin:0;font-size:19px;">Nueva Tarjeta de Crédito</h3>
        <button type="button" class="btn-glass-capsule" style="width:34px;height:34px;padding:0;" data-action="close-aux" aria-label="Cerrar">
          <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">close</span>
        </button>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="input-well"><input type="text" id="new-card-name" placeholder="Nombre (ej. Nu Black)" /></div>
        <div class="input-well"><input type="text" id="new-card-bank" placeholder="Banco (ej. Nu)" /></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
        <div style="display:flex;flex-direction:column;gap:4px;">
          <span class="label-eyebrow" style="font-size:10px;">Día Corte (1-31)</span>
          <div class="input-well"><input type="number" min="1" max="31" id="new-card-cutoff" class="tabular-nums" value="15" /></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <span class="label-eyebrow" style="font-size:10px;">Día Pago (1-31)</span>
          <div class="input-well"><input type="number" min="1" max="31" id="new-card-due" class="tabular-nums" value="5" /></div>
        </div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <span class="label-eyebrow" style="font-size:10px;">Últimos 4</span>
          <div class="input-well"><input type="text" maxlength="4" id="new-card-last4" class="tabular-nums" placeholder="4821" /></div>
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:4px;">
        <span class="label-eyebrow" style="font-size:10px;">Límite de Crédito Opcional (MXN)</span>
        <div class="input-well">
          <span>$</span>
          <input type="number" inputmode="decimal" id="new-card-limit" class="tabular-nums" placeholder="25000.00" />
        </div>
      </div>

      <button type="button" class="btn-primary-capsule" style="width:100%;" id="aux-save-card">
        <span>Guardar Tarjeta en Supabase</span>
      </button>
    </div>
  `;

  revealModalOverlay(overlayEl);
  overlayEl.querySelector('[data-action="close-aux"]')?.addEventListener('click', () => {
    overlayEl.classList.remove('open');
  });

  overlayEl.querySelector('#aux-save-card')?.addEventListener('click', async () => {
    try {
      const limitVal = overlayEl.querySelector('#new-card-limit').value;
      await createCreditCard({
        name: overlayEl.querySelector('#new-card-name').value,
        bankName: overlayEl.querySelector('#new-card-bank').value,
        cutoffDay: Number(overlayEl.querySelector('#new-card-cutoff').value),
        paymentDueDay: Number(overlayEl.querySelector('#new-card-due').value),
        lastFour: overlayEl.querySelector('#new-card-last4').value || '0000',
        creditLimitCents: limitVal ? parseMXNToCents(limitVal) : null
      });
      overlayEl.classList.remove('open');
      showToast('Tarjeta guardada en Supabase');
    } catch (err) {
      showToast(err.message);
    }
  });
}

function openNewAccountModal(overlayEl) {
  overlayEl.innerHTML = `
    <div class="bottom-sheet" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h3 class="card-title" style="margin:0;font-size:19px;">Nueva Cuenta de Liquidez</h3>
        <button type="button" class="btn-glass-capsule" style="width:34px;height:34px;padding:0;" data-action="close-aux" aria-label="Cerrar">
          <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">close</span>
        </button>
      </div>

      <div class="input-well">
        <input type="text" id="new-acc-name" placeholder="Nombre (ej. Plata Débito, Efectivo Físico)" />
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="input-well">
          <select id="new-acc-type">
            <option value="debit">Cuenta de Débito</option>
            <option value="cash">Efectivo Físico</option>
          </select>
        </div>
        <div class="input-well">
          <span>$</span>
          <input type="number" inputmode="decimal" id="new-acc-balance" class="tabular-nums" placeholder="Saldo inicial" />
        </div>
      </div>

      <button type="button" class="btn-primary-capsule" style="width:100%;" id="aux-save-acc">
        <span>Crear Cuenta en Supabase</span>
      </button>
    </div>
  `;

  revealModalOverlay(overlayEl);
  overlayEl.querySelector('[data-action="close-aux"]')?.addEventListener('click', () => {
    overlayEl.classList.remove('open');
  });

  overlayEl.querySelector('#aux-save-acc')?.addEventListener('click', async () => {
    try {
      await createLiquidityAccount({
        name: overlayEl.querySelector('#new-acc-name').value,
        accountType: overlayEl.querySelector('#new-acc-type').value,
        initialBalanceCents: parseMXNToCents(overlayEl.querySelector('#new-acc-balance').value)
      });
      overlayEl.classList.remove('open');
      showToast('Cuenta de liquidez creada en Supabase');
    } catch (err) {
      showToast(err.message);
    }
  });
}

function openNewRecurringModal(overlayEl) {
  const state = getState();
  const targetOptions = [
    ...state.liquidityAccounts
      .filter((a) => !a.is_archived)
      .map((a) => `<option value="liq:${a.id}">Liquidez: ${a.name}</option>`),
    ...state.creditCards
      .filter((c) => !c.is_archived)
      .map((c) => `<option value="card:${c.id}">Tarjeta: ${c.name}</option>`)
  ].join('');

  overlayEl.innerHTML = `
    <div class="bottom-sheet" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h3 class="card-title" style="margin:0;font-size:19px;">Nuevo Gasto Fijo / Suscripción</h3>
        <button type="button" class="btn-glass-capsule" style="width:34px;height:34px;padding:0;" data-action="close-aux" aria-label="Cerrar">
          <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">close</span>
        </button>
      </div>

      <div class="input-well">
        <input type="text" id="new-rec-name" placeholder="Nombre (ej. Gemini Pro, Gimnasio)" />
      </div>

      <div style="display:grid;grid-template-columns:1.3fr 1fr;gap:10px;">
        <div class="input-well">
          <span>$</span>
          <input type="number" inputmode="decimal" id="new-rec-amount" class="tabular-nums" placeholder="Monto MXN" />
        </div>
        <div class="input-well">
          <input type="number" min="1" max="31" id="new-rec-day" class="tabular-nums" placeholder="Día cobro (1-31)" value="8" />
        </div>
      </div>

      <div style="display:flex;flex-direction:column;gap:4px;">
        <span class="label-eyebrow" style="font-size:10px;">Método de pago asociado</span>
        <div class="input-well">
          <select id="new-rec-target">${targetOptions}</select>
        </div>
      </div>

      <button type="button" class="btn-primary-capsule" style="width:100%;" id="aux-save-rec">
        <span>Guardar Gasto Fijo</span>
      </button>
    </div>
  `;

  revealModalOverlay(overlayEl);
  overlayEl.querySelector('[data-action="close-aux"]')?.addEventListener('click', () => {
    overlayEl.classList.remove('open');
  });

  overlayEl.querySelector('#aux-save-rec')?.addEventListener('click', async () => {
    try {
      const targetVal = overlayEl.querySelector('#new-rec-target').value;
      if (!targetVal) {
        showToast('Primero crea una cuenta de liquidez o tarjeta');
        return;
      }
      const [kind, targetId] = targetVal.split(':');
      await createRecurringExpense({
        name: overlayEl.querySelector('#new-rec-name').value,
        amountCents: parseMXNToCents(overlayEl.querySelector('#new-rec-amount').value),
        billingDay: Number(overlayEl.querySelector('#new-rec-day').value),
        paymentMethodType: kind === 'card' ? 'credit_card' : 'liquidity_account',
        liquidityAccountId: kind === 'liq' ? targetId : null,
        creditCardId: kind === 'card' ? targetId : null
      });
      overlayEl.classList.remove('open');
      showToast('Gasto fijo guardado en Supabase');
    } catch (err) {
      showToast(err.message);
    }
  });
}

function openNewLoanModal(overlayEl) {
  const state = getState();
  const accountOptions = state.liquidityAccounts
    .filter((a) => !a.is_archived)
    .map((a) => `<option value="${a.id}">${a.name}</option>`)
    .join('');

  overlayEl.innerHTML = `
    <div class="bottom-sheet" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h3 class="card-title" style="margin:0;font-size:19px;">Nuevo Préstamo ("Me deben")</h3>
        <button type="button" class="btn-glass-capsule" style="width:34px;height:34px;padding:0;" data-action="close-aux" aria-label="Cerrar">
          <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">close</span>
        </button>
      </div>

      <div class="input-well">
        <input type="text" id="new-loan-name" placeholder="Nombre del contacto" />
      </div>

      <div class="input-well">
        <input type="text" id="new-loan-desc" placeholder="Motivo (ej. Cena, Boletos)" />
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
        <div class="input-well">
          <span>$</span>
          <input type="number" inputmode="decimal" id="new-loan-amount" class="tabular-nums" placeholder="Monto MXN" />
        </div>
        <div class="input-well">
          <select id="new-loan-account">${accountOptions}</select>
        </div>
      </div>

      <button type="button" class="btn-primary-capsule" style="width:100%;" id="aux-save-loan">
        <span>Registrar Préstamo</span>
      </button>
    </div>
  `;

  revealModalOverlay(overlayEl);
  overlayEl.querySelector('[data-action="close-aux"]')?.addEventListener('click', () => {
    overlayEl.classList.remove('open');
  });

  overlayEl.querySelector('#aux-save-loan')?.addEventListener('click', async () => {
    try {
      await createLoan({
        borrowerName: overlayEl.querySelector('#new-loan-name').value,
        description: overlayEl.querySelector('#new-loan-desc').value,
        originAccountId: overlayEl.querySelector('#new-loan-account').value,
        principalCents: parseMXNToCents(overlayEl.querySelector('#new-loan-amount').value),
        loanDateISO: state.referenceDateISO
      });
      overlayEl.classList.remove('open');
      showToast('Préstamo registrado en Supabase');
    } catch (err) {
      showToast(err.message);
    }
  });
}

function openEditMsiInstallmentModal(overlayEl, { installmentId, currentCents }) {
  overlayEl.innerHTML = `
    <div class="bottom-sheet" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <h3 class="card-title" style="margin:0;font-size:18px;">Ajustar Parcialidad MSI</h3>
        <button type="button" class="btn-glass-capsule" style="width:34px;height:34px;padding:0;" data-action="close-aux" aria-label="Cerrar">
          <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">close</span>
        </button>
      </div>
      <p class="text-subtle" style="margin:0;">
        Ajusta manualmente los centavos de esta parcialidad si tu estado de cuenta bancario redondeó de forma distinta.
      </p>
      <div class="input-well">
        <span>$</span>
        <input type="number" inputmode="decimal" step="0.01" id="edit-msi-inst-input" class="tabular-nums" value="${(currentCents / 100).toFixed(2)}" />
      </div>
      <button type="button" class="btn-primary-capsule" style="width:100%;" id="save-msi-inst-btn">
        <span>Actualizar Parcialidad</span>
      </button>
    </div>
  `;

  revealModalOverlay(overlayEl);
  overlayEl.querySelector('[data-action="close-aux"]')?.addEventListener('click', () => {
    overlayEl.classList.remove('open');
  });

  overlayEl.querySelector('#save-msi-inst-btn')?.addEventListener('click', async () => {
    try {
      const nextCents = parseMXNToCents(overlayEl.querySelector('#edit-msi-inst-input').value);
      await updateMsiInstallmentAmount(installmentId, nextCents);
      overlayEl.classList.remove('open');
      showToast('Parcialidad actualizada en Supabase');
    } catch (err) {
      showToast(err.message);
    }
  });
}

function openSessionAndSyncModal(overlayEl) {
  const state = getState();
  const userEmail = state.user?.email || 'Propietario';

  overlayEl.innerHTML = `
    <div class="bottom-sheet" onclick="event.stopPropagation()">
      <div class="sheet-handle"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <span class="label-eyebrow">Supabase Cloud • RLS Activo</span>
          <h3 class="card-title" style="margin:2px 0 0 0;font-size:19px;">Sesión &amp; Sincronización</h3>
        </div>
        <button type="button" class="btn-glass-capsule" style="width:34px;height:34px;padding:0;" data-action="close-aux" aria-label="Cerrar">
          <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">close</span>
        </button>
      </div>

      <div class="glass-well" style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <div style="display:flex;align-items:center;gap:10px;min-width:0;">
          <div class="icon-squircle" style="width:36px;height:36px;border-radius:50%;">
            <span class="material-symbols-outlined" style="font-size:18px;">verified_user</span>
          </div>
          <div style="min-width:0;">
            <span class="card-title" style="font-size:14px;display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${userEmail}
            </span>
            <span class="text-subtle" style="font-size:11px;">Proyecto: slice (PostgreSQL 17)</span>
          </div>
        </div>
        <span class="badge-pill badge-pill-sky">
          <span class="pulse-dot" aria-hidden="true"></span>
          <span>Online</span>
        </span>
      </div>

      <div style="display:flex;flex-direction:column;gap:10px;">
        <button type="button" class="btn-primary-capsule" style="width:100%;" id="btn-force-sync">
          <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">sync</span>
          <span>Sincronizar con Supabase Ahora</span>
        </button>

        ${
          state.liquidityAccounts.length === 0
            ? `<button type="button" class="btn-glass-capsule" style="width:100%;height:46px;" id="btn-seed-base-accounts">
                 <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">account_balance_wallet</span>
                 <span>Crear Cuentas Base (Efectivo + Débito)</span>
               </button>`
            : ''
        }

        <button type="button" class="btn-glass-capsule" style="width:100%;height:46px;color:var(--error);border-color:var(--error-border);" id="btn-sign-out">
          <span class="material-symbols-outlined" aria-hidden="true" style="font-size:18px;">logout</span>
          <span>Cerrar Sesión</span>
        </button>
      </div>
    </div>
  `;

  revealModalOverlay(overlayEl);
  overlayEl.querySelector('[data-action="close-aux"]')?.addEventListener('click', () => {
    overlayEl.classList.remove('open');
  });

  overlayEl.querySelector('#btn-force-sync')?.addEventListener('click', async () => {
    overlayEl.classList.remove('open');
    if (state.user?.id) {
      await fetchInitialSnapshot(state.user.id);
      showToast('Datos sincronizados desde Supabase');
    }
  });

  overlayEl.querySelector('#btn-seed-base-accounts')?.addEventListener('click', async () => {
    try {
      await createLiquidityAccount({
        name: 'Efectivo Físico',
        accountType: 'cash',
        initialBalanceCents: 0
      });
      await createLiquidityAccount({
        name: 'Débito Principal',
        accountType: 'debit',
        initialBalanceCents: 0
      });
      overlayEl.classList.remove('open');
      showToast('Cuentas base creadas en Supabase');
    } catch (err) {
      showToast(err.message);
    }
  });

  overlayEl.querySelector('#btn-sign-out')?.addEventListener('click', async () => {
    overlayEl.classList.remove('open');
    await signOut();
    clearMemoryState();
    showToast('Sesión cerrada');
  });
}

/* ============================================================================
   Bootstrap
   ============================================================================ */

async function bootstrap() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  subscribe((state) => {
    renderApp(state);
  });

  // Wire Login Form (#auth-form)
  const loginForm = document.getElementById('auth-form');
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const rememberCheckbox = document.getElementById('auth-remember');
  const errorBox = document.getElementById('auth-error-box');
  const submitBtn = document.getElementById('auth-submit-btn');
  const submitText = document.getElementById('auth-submit-text');

  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorBox) {
      errorBox.style.display = 'none';
      errorBox.textContent = '';
    }
    if (submitBtn) submitBtn.disabled = true;
    if (submitText) submitText.textContent = 'Verificando...';

    const normalizedEmail = String(emailInput?.value || '').trim().toLowerCase();
    if (emailInput) {
      emailInput.value = normalizedEmail;
    }

    const { user, error } = await signInWithPassword(normalizedEmail, passwordInput?.value);

    if (submitBtn) submitBtn.disabled = false;
    if (submitText) submitText.textContent = 'Iniciar Sesión';

    if (error || !user) {
      if (errorBox) {
        errorBox.textContent = error?.message || 'Credenciales inválidas. Verifica tu correo y contraseña.';
        errorBox.style.display = 'block';
      }
      return;
    }

    const shouldRemember = rememberCheckbox ? rememberCheckbox.checked : true;
    saveRememberedAuthPrefs(shouldRemember, normalizedEmail);

    if (passwordInput) passwordInput.value = '';
    setState({ user }, false);
    await fetchInitialSnapshot(user.id);
    showToast('Sesión iniciada');
  });

  // Wire Liquid Glass draggable dock, screen swipe navigation & sheet drag-down dismiss
  dockController = initDockController({
    navEl: document.getElementById('floating-nav-capsule'),
    lensEl: document.getElementById('nav-glass-lens'),
    getActiveTab: () => getState().activeTab,
    onSelectTab: (tab) => setState({ activeTab: tab }, false)
  });

  document.querySelectorAll('.nav-item[data-tab]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      if (dockController?.shouldIgnoreClick()) return;
      setState({ activeTab: btn.getAttribute('data-tab') }, false);
    });
  });

  initScreenSwipeController({
    mainEl: document.querySelector('.main-content'),
    getActiveTab: () => getState().activeTab,
    isSwipeAllowed: () =>
      Boolean(getState().user) && !document.querySelector('.modal-overlay.open'),
    getActiveViewSection: () => document.querySelector('.view-section.active'),
    dockController,
    onSelectTab: (tab) => setState({ activeTab: tab }, false)
  });

  initSheetDismissGestures({
    overlayIds: ['modal-quick-entry', 'modal-reconcile', 'modal-auxiliary'],
    onDismissOverlay: (el) => {
      if (el.id === 'modal-quick-entry') {
        closeQuickEntryModal(el);
      } else {
        el.classList.remove('open');
      }
    }
  });

  document.getElementById('btn-open-quick-entry')?.addEventListener('click', (e) => {
    e.preventDefault();
    getHandlers().onOpenQuickEntry('expense');
  });

  document.getElementById('btn-open-data-controls')?.addEventListener('click', () => {
    getHandlers().onOpenDataControlsModal();
  });

  // Enable iOS Safari :active states on touch and Escape key dismissal for auxiliary/reconcile sheets
  document.addEventListener('touchstart', () => {}, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    ['modal-reconcile', 'modal-auxiliary'].forEach((id) => {
      document.getElementById(id)?.classList.remove('open');
    });
  });

  // Close overlays on backdrop click
  ['modal-quick-entry', 'modal-reconcile', 'modal-auxiliary'].forEach((id) => {
    const el = document.getElementById(id);
    el?.addEventListener('click', (e) => {
      if (e.target === el) {
        if (id === 'modal-quick-entry') {
          closeQuickEntryModal(el);
        } else {
          el.classList.remove('open');
        }
      }
    });
  });

  await initAuth(
    async (user) => {
      setState({ user }, false);
      await fetchInitialSnapshot(user.id);
    },
    () => {
      clearMemoryState();
    }
  );
}

document.addEventListener('DOMContentLoaded', bootstrap);
