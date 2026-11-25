const scope = new URL(self.registration.scope);
const prefix = "trinity-tally-" + scope.pathname + "-";
const cacheName = prefix + "2026.11.25.1";
const files = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "entry.js",
  "results.js",
  "state.js",
  "ui.js",
  "count.js",
  "scanner.js",
  "digits.bin",
  "icon.svg",
  "icon-192.png",
  "icon-512.png",
  "manifest.webmanifest",
  "dm-sans.woff2",
  "source-serif.woff2",
  "parliament.webp",
  "credits.txt",
  "digits-model.txt",
  "dm-sans-license.txt",
  "source-serif-license.txt",
];
const urls = files.map((path) => new URL(path, scope).href);
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(cacheName);
      await cache.addAll(urls);
      await self.skipWaiting();
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith(prefix) && key !== cacheName)
          await caches.delete(key);
      }
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data === "cache-status" && event.ports[0])
    event.waitUntil(
      (async () => {
        const cache = await caches.open(cacheName);
        const entries = await cache.keys();
        const cached = new Set(entries.map((e) => e.url));
        event.ports[0].postMessage(
          urls.every((u) => cached.has(u)) ? "cached" : "missing",
        );
      })(),
    );
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== scope.origin || !url.pathname.startsWith(scope.pathname))
    return;
  if (!urls.includes(url.href) && event.request.mode !== "navigate") return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(cacheName);
      return (
        (await cache.match(event.request)) ||
        (event.request.mode === "navigate" &&
          (await cache.match(new URL("index.html", scope).href))) ||
        fetch(event.request)
      );
    })(),
  );
});
