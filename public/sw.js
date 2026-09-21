/* Army Transport CMS — minimal offline-shell service worker.
   Network-first for pages and APIs (live data), cache fallback for static assets. */
const CACHE = "army-transport-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Always go network-first for navigations and API calls so live data is fresh.
  const isNavigation = req.mode === "navigate";
  const isApi = url.pathname.startsWith("/api/");
  if (isNavigation || isApi) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          if (isNavigation) caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(async () => {
          if (isApi) {
            return new Response(JSON.stringify({ offline: true }), {
              status: 503,
              headers: { "Content-Type": "application/json" },
            });
          }
          const cached = await caches.match(req);
          return cached || Response.error();
        })
    );
    return;
  }

  // Static assets: cache-first, then network.
  event.respondWith(
    caches.match(req).then(
      (cached) =>
        cached ||
        fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
          return res;
        })
    )
  );
});
