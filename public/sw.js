/**
 * NUST Events — Service Worker
 *
 * Strategies:
 *   - Static assets (JS, CSS, fonts, images): Cache-first
 *   - API calls: Network-first with cache fallback
 *   - Navigation (HTML): Network-first, offline fallback page
 *   - Ticket pages: Cache on visit for offline access
 */

// Bump this when cache strategy changes to force old cache eviction.
const CACHE_VERSION = "nust-events-v2";
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`;
const TICKET_CACHE = `${CACHE_VERSION}-tickets`;

// Static assets to pre-cache on install
const PRE_CACHE_URLS = [
  "/offline",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/manifest.json",
];

// ── Install ─────────────────────────────────────────────────────────
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      console.log("[SW] Pre-caching static assets");
      return cache.addAll(PRE_CACHE_URLS);
    }),
  );
  // Activate immediately without waiting for old SW to finish
  self.skipWaiting();
});

// ── Activate ────────────────────────────────────────────────────────
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter(
            (key) =>
              key.startsWith("nust-events-") &&
              key !== STATIC_CACHE &&
              key !== DYNAMIC_CACHE &&
              key !== TICKET_CACHE,
          )
          .map((key) => {
            console.log("[SW] Removing old cache:", key);
            return caches.delete(key);
          }),
      );
    }),
  );
  // Take control of all clients immediately
  self.clients.claim();
});

// ── Fetch ───────────────────────────────────────────────────────────
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET, chrome-extension, etc.
  if (request.method !== "GET") return;
  if (!url.protocol.startsWith("http")) return;

  // Strategy selection based on request type
  if (isStaticAsset(url)) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
  } else if (isTicketPage(url)) {
    event.respondWith(networkFirstWithTicketCache(request));
  } else if (isApiRequest(url)) {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
  } else if (isNavigationRequest(request)) {
    event.respondWith(networkFirstNavigation(request));
  } else {
    event.respondWith(networkFirst(request, DYNAMIC_CACHE));
  }
});

// ── Helpers ─────────────────────────────────────────────────────────

function isStaticAsset(url) {
  // Avoid stale dev bundles: never cache Next static assets on localhost.
  if (url.pathname.startsWith("/_next/static/")) {
    return !url.hostname.includes("localhost");
  }

  return (
    url.pathname.match(
      /\.(js|css|woff2?|ttf|eot|ico|png|jpg|jpeg|svg|webp|avif|gif)$/,
    ) ||
    url.pathname.startsWith("/icons/") ||
    false
  );
}

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isTicketPage(url) {
  return url.pathname.startsWith("/tickets");
}

function isNavigationRequest(request) {
  return (
    request.mode === "navigate" ||
    request.headers.get("accept")?.includes("text/html")
  );
}

// ── Cache-first strategy ────────────────────────────────────────────
async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response("", { status: 408, statusText: "Offline" });
  }
}

// ── Network-first strategy ──────────────────────────────────────────
async function networkFirst(request, cacheName) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    return (
      cached ||
      new Response(JSON.stringify({ error: "Offline" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    );
  }
}

// ── Network-first for navigation with offline fallback ──────────────
async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Serve offline page
    const offlinePage = await caches.match("/offline");
    return (
      offlinePage ||
      new Response(
        "<html><body><h1>Offline</h1><p>Please check your internet connection.</p></body></html>",
        { headers: { "Content-Type": "text/html" } },
      )
    );
  }
}

// ── Network-first for ticket pages (cached for offline access) ──────
async function networkFirstWithTicketCache(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(TICKET_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;

    // Fall back to generic offline page
    const offlinePage = await caches.match("/offline");
    return (
      offlinePage ||
      new Response(
        "<html><body><h1>Offline</h1><p>Your tickets are not available offline yet. View them once while online to cache them.</p></body></html>",
        { headers: { "Content-Type": "text/html" } },
      )
    );
  }
}

// ── Message handler for ticket caching ──────────────────────────────
self.addEventListener("message", (event) => {
  if (event.data?.type === "CACHE_TICKET") {
    const { url, data } = event.data;
    caches.open(TICKET_CACHE).then((cache) => {
      const response = new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
      cache.put(url, response);
      console.log("[SW] Cached ticket data:", url);
    });
  }

  if (event.data?.type === "CACHE_TICKETS_LIST") {
    const { url, data } = event.data;
    caches.open(TICKET_CACHE).then((cache) => {
      const response = new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json" },
      });
      cache.put(url, response);
      console.log("[SW] Cached tickets list");
    });
  }
});
