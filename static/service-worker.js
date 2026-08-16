// Caches the app shell so unaity is installable and loads offline. API calls
// to OpenRouter always go to the network (never cached).
const CACHE = "unaity-static-v1";
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
  // Only serve the app shell from cache; never intercept API/model calls.
  if (url.origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request))
  );
});
