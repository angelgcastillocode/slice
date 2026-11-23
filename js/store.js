/**
 * Slice - Almacén Reactivo de Estado en Memoria + Caché Local Stale-While-Revalidate
 */

import { DEFAULT_REFERENCE_DATE, LOCAL_STORAGE_KEY } from './config.js';

const listeners = new Set();

const state = {
  user: null,
  isSyncing: false,
  activeTab: 'inicio',
  referenceDateISO: DEFAULT_REFERENCE_DATE,
  selectedYearMonth: DEFAULT_REFERENCE_DATE.slice(0, 7),
  selectedCalendarDateISO: DEFAULT_REFERENCE_DATE,
  movementFilter: 'all',
  fijosFilter: 'todos',
  liquidityAccounts: [],
  creditCards: [],
  categories: [],
  msiPlans: [],
  msiInstallments: [],
  recurringExpenses: [],
  recurringLogs: [],
  loans: [],
  transactions: []
};

export function getState() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notify() {
  for (const listener of listeners) {
    listener(state);
  }
}

export function setState(partialState, shouldPersist = true) {
  Object.assign(state, partialState);
  if (shouldPersist && state.user?.id) {
    persistToLocalCache(state.user.id);
  }
  notify();
}

export function hydrateFromLocalCache(userId) {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    if (userId && parsed.cachedUserId && parsed.cachedUserId !== userId) {
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      return false;
    }
    Object.assign(state, {
      liquidityAccounts: parsed.liquidityAccounts || [],
      creditCards: parsed.creditCards || [],
      categories: parsed.categories || [],
      msiPlans: parsed.msiPlans || [],
      msiInstallments: parsed.msiInstallments || [],
      recurringExpenses: parsed.recurringExpenses || [],
      recurringLogs: parsed.recurringLogs || [],
      loans: parsed.loans || [],
      transactions: parsed.transactions || []
    });
    return true;
  } catch (err) {
    console.warn('No se pudo hidratar caché local:', err);
    return false;
  }
}

export function persistToLocalCache(userId) {
  try {
    const snapshot = {
      cachedUserId: userId || state.user?.id || null,
      updatedAt: new Date().toISOString(),
      liquidityAccounts: state.liquidityAccounts,
      creditCards: state.creditCards,
      categories: state.categories,
      msiPlans: state.msiPlans,
      msiInstallments: state.msiInstallments,
      recurringExpenses: state.recurringExpenses,
      recurringLogs: state.recurringLogs,
      loans: state.loans,
      transactions: state.transactions
    };
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(snapshot));
  } catch (err) {
    console.warn('Error al guardar caché en localStorage:', err);
  }
}

export function clearMemoryState() {
  Object.assign(state, {
    user: null,
    isSyncing: false,
    liquidityAccounts: [],
    creditCards: [],
    categories: [],
    msiPlans: [],
    msiInstallments: [],
    recurringExpenses: [],
    recurringLogs: [],
    loans: [],
    transactions: []
  });
  try {
    localStorage.removeItem(LOCAL_STORAGE_KEY);
  } catch (_e) {}
  notify();
}
