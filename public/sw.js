/*
 * Lyceum service worker — powers the installable PWA + an offline
 * fallback. Deliberately conservative so it can never break the app:
 *
 *  - Only same-origin GET requests are touched.
 *  - `/_next/` (build chunks + HMR) and `/api/` (tRPC, auth, webhooks)
 *    are passed straight through — never cached — so deploys and dynamic
 *    data are always fresh.
 *  - Navigations are network-first: you always get the live page when
 *    online, and the cached offline page only when the network fails.
 *  - Other same-origin static assets use stale-while-revalidate.
 *
 * Bump VERSION to invalidate all caches on the next activation.
 */
const VERSION = "lyceum-v2";
const PRECACHE = `${VERSION}-precache`;
const RUNTIME = `${VERSION}-runtime`;
const OFFLINE_URL = "/offline.html";
const PRECACHE_URLS = [OFFLINE_URL, "/icon.svg", "/manifest.webmanifest"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PRECACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => !key.startsWith(VERSION))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // third-party
  if (url.pathname.startsWith("/_next/")) return; // build chunks + HMR
  if (url.pathname.startsWith("/api/")) return; // tRPC / auth / webhooks

  // Navigations: network-first. A visited lesson page is cached on success so
  // it stays readable in airplane mode; offline, we serve that cached page if
  // we have it, else the generic offline fallback. (Per-browser cache of the
  // signed-in user's own page — same trust model as the browser HTTP cache.)
  if (request.mode === "navigate") {
    const isLesson = url.pathname.startsWith("/student/lesson/");
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (isLesson && response && response.status === 200) {
            const copy = response.clone();
            caches.open(RUNTIME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(async () => {
          if (isLesson) {
            const cached = await caches.match(request);
            if (cached) return cached;
          }
          const cache = await caches.open(PRECACHE);
          const offline = await cache.match(OFFLINE_URL);
          return offline ?? Response.error();
        })
    );
    return;
  }

  // Same-origin static assets: stale-while-revalidate.
  event.respondWith(
    caches.open(RUNTIME).then(async (cache) => {
      const cached = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response && response.status === 200 && response.type === "basic") {
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
