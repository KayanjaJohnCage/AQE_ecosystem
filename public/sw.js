const CACHE_NAME = "aqe-pwa-v3";
const MEDIA_CACHE = "aqe-media-v2";
const STATIC_ASSETS = [
  "/customer",
  "/aqe-original.html",
  "/AQE-Nav&Icon.jpeg",
  "/manifest.json"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => ![CACHE_NAME, MEDIA_CACHE].includes(k)).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

function isMediaRequest(request) {
  const url = new URL(request.url);
  return request.method === "GET" && (
    url.pathname.includes("/storage/v1/object/") ||
    /\.(png|jpe?g|webp|gif|avif|mp4|webm|mov)$/i.test(url.pathname)
  );
}

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin && !isMediaRequest(request)) return;

  if (isMediaRequest(request)) {
    event.respondWith(
      caches.open(MEDIA_CACHE).then(async cache => {
        const cached = await cache.match(request);
        try {
          const response = await fetch(request);
          if (response && response.ok) cache.put(request, response.clone()).catch(() => {});
          return response;
        } catch (_) {
          if (cached) return cached;
          throw _;
        }
      })
    );
    return;
  }

  if (request.method !== "GET" || url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request).then(response => {
      if (response && response.ok && url.origin === self.location.origin) {
        caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone())).catch(() => {});
      }
      return response;
    }).catch(() => caches.match(request).then(cached => cached || caches.match("/customer")))
  );
});
