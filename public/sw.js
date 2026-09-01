const CACHE_NAME = "cardcade-shell-v101";
const APP_ROOT = self.registration.scope;
const APP_SHELL = [
  "",
  "api/catalog",
  "app.css?v=82",
  "app.js?v=83",
  "icon.svg",
  "manifest.webmanifest",
  "shared/three-seven-rules.js?v=3",
  "shared/thirteen-rules.js?v=2",
  "shared/card-presentation.js?v=4",
  "shared/controller-input.js?v=3",
  "shared/card-skins.js?v=7",
  "shared/standard-52.js?v=3",
  "shared/snap-rules.js?v=1",
  "shared/blackjack-rules.js?v=1",
  "shared/holdem-rules.js?v=1",
  "shared/five-card-draw-rules.js?v=1",
  "shared/hot-seat-flow.js?v=1",
  "shared/juan-deck.js?v=2",
  "shared/juan-rules.js?v=2",
  "shared/rotating-rummy-deck.js?v=2",
  "shared/rotating-rummy-routes.js?v=2",
  "shared/rotating-rummy-rules.js?v=2",
  "shared/finders-makers-content.js?v=1",
  "assets/fonts/pixelify-sans-latin.woff2",
  "assets/fonts/cardcade-pixel-ranks.woff2",
  "assets/pwa/icon-192.png",
  "assets/pwa/icon-512.png",
  "assets/pwa/maskable-512.png",
  "assets/pwa/apple-touch-icon-180.png",
  "assets/pwa/splash-750x1334.png",
  "assets/pwa/splash-1080x2340.png",
  "assets/pwa/splash-1125x2436.png",
  "assets/pwa/splash-828x1792.png",
  "assets/pwa/splash-1242x2688.png",
  "assets/pwa/splash-1170x2532.png",
  "assets/pwa/splash-1284x2778.png",
  "assets/pwa/splash-1179x2556.png",
  "assets/pwa/splash-1290x2796.png"
].map((path) => new URL(path, APP_ROOT).toString());
const APP_PATH = new URL(APP_ROOT).pathname.replace(/\/$/, "");
const API_PATH = `${APP_PATH}/api/`;
const CATALOG_PATH = `${APP_PATH}/api/catalog`;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data?.type !== "SKIP_WAITING") return;
  event.waitUntil((async () => {
    await self.skipWaiting();
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    await Promise.all(windows.map((client) => {
      if (typeof client.navigate !== "function") return null;
      return client.navigate(client.url).catch(() => null);
    }));
  })());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === CATALOG_PATH) {
    event.respondWith(networkFirst(event.request));
    return;
  }
  if (url.pathname.startsWith(API_PATH)) return;
  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request, APP_ROOT));
    return;
  }
  event.respondWith(cacheFirst(event.request));
});

async function networkFirst(request, fallbackUrl = null) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request))
      || (fallbackUrl ? await cache.match(fallbackUrl) : null)
      || Response.error();
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}
