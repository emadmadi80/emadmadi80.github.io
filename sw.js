const CACHE_NAME = "masroof-pwa-v7-luxury";
const BASE_PATH = new URL("./", self.location.href).pathname;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.add(BASE_PATH)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME && key !== CACHE_NAME + "-fonts").map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method === "GET" && (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com")) {
    event.respondWith(
      caches.open(CACHE_NAME + "-fonts").then((cache) =>
        cache.match(request).then((cached) => {
          const network = fetch(request).then((r) => { void cache.put(request, r.clone()); return r; }).catch(() => cached);
          return cached || network;
        })
      )
    );
    return;
  }
  if (request.method !== "GET" || url.origin !== self.location.origin || !url.pathname.startsWith(BASE_PATH)) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() => caches.match(request).then((cached) => cached || caches.match(BASE_PATH)))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
