// Minimal service worker: caches the app shell so unaity is installable on
// Android and loads instantly / offline. API calls to /chat always go to the
// network (never cached).

const CACHE = "unaity-shell-v2";
const SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never cache API traffic.
  if (url.pathname.startsWith("/chat") || url.pathname.startsWith("/health")) {
    return;
  }
  // Cache-first for the shell, falling back to network.
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request))
  );
});
