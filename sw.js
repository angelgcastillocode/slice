const CACHE_NAME = 'slice-shell-v4';
const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './assets/icon.svg',
  './css/tokens.css',
  './css/layout.css',
  './css/components.css',
  './js/config.js',
  './js/supabaseClient.js',
  './js/auth.js',
  './js/store.js',
  './js/engine/dateUtils.js',
  './js/engine/billingCycle.js',
  './js/engine/msiEngine.js',
  './js/engine/accounting.js',
  './js/services/api.js',
  './js/ui/app.js',
  './js/ui/dashboardView.js',
  './js/ui/calendarView.js',
  './js/ui/cardsView.js',
  './js/ui/recurringView.js',
  './js/ui/loansView.js',
  './js/ui/quickEntryModal.js',
  './js/ui/reconcileModal.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  // Never cache Supabase API requests
  if (url.hostname.endsWith('supabase.co')) {
    return;
  }

  // Network-First with Cache Fallback for App Shell
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && url.origin === self.location.origin) {
          const copy = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return networkResponse;
      })
      .catch(() => caches.match(request))
  );
});
