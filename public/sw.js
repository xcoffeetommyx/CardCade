const CACHE_NAME = "cardcade-shell-v3";
const SHELL = [
  "/",
  "/app.css?v=4",
  "/app.js?v=4",
  "/icon.svg",
  "/manifest.webmanifest",
  "/shared/three-seven-rules.js?v=3",
  "/shared/card-presentation.js?v=3",
  "/shared/standard-52.js?v=3",
  "/assets/fonts/pixelify-sans-latin.woff2",
  "/assets/fonts/cardcade-pixel-ranks.woff2"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response.ok && !event.request.url.includes("/api/")) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached || caches.match("/")))
  );
});
