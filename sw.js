const CACHE_NAME = "masroof-pwa-v3-whisper";
const CDN_CACHE = "masroof-cdn-whisper-v1"; // Transformers.js + ONNX wasm from jsdelivr; kept across app updates
const BASE_PATH = new URL("./", self.location.href).pathname;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled([cache.add(BASE_PATH), cache.add(BASE_PATH + "whisper-voice.js"), cache.add(BASE_PATH + "whisper-worker.js")])
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME && key !== CDN_CACHE).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Whisper runtime (library + wasm) from jsdelivr: cache-first so it works offline after the first run.
  if (request.method === "GET" && url.hostname === "cdn.jsdelivr.net") {
    event.respondWith(
      caches.open(CDN_CACHE).then((cache) =>
        cache.match(request).then(
          (cached) =>
            cached ||
            fetch(request).then((response) => {
              if (response.status === 200) void cache.put(request, response.clone());
              return response;
            })
        )
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
