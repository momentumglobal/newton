// sw.js - Newton PWA service worker (network-first, minimal).
//
// Purpose: make the site installable as a home-screen app. It deliberately
// does NOT cache app code, so there is never a stale-JS problem after a
// GitHub commit - every load comes from the network. It only intercepts
// same-origin GET navigations/assets and always tries the network first.
//
// IMPORTANT: auth never breaks here. Cross-origin requests (e.g. Microsoft
// login, Graph API) and non-GET requests are passed straight through and are
// never touched by the service worker.

const SW_VERSION = 'newton-pwa-v1';

self.addEventListener('install', (event) => {
  // Activate immediately on first install / update.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // Take control of open pages right away.
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Only handle same-origin GET requests. Everything else (POST, auth,
  // cross-origin Microsoft/Graph calls) goes straight to the network
  // untouched, so login and data writes are never affected.
  const sameOrigin = new URL(req.url).origin === self.location.origin;
  if (req.method !== 'GET' || !sameOrigin) {
    return; // do not call respondWith -> browser handles it normally
  }

  // Network-first: always fetch fresh. No caching of app code.
  event.respondWith(fetch(req));
});
