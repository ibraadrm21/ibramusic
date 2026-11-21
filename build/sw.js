/* global self, caches, fetch */
const cacheName = "ibramusic-shell-__CACHE_VERSION__";
const base = new URL(self.registration.scope);
const appAssets = __APP_ASSETS__;
const shellKey = new URL("./", base).href;

self.addEventListener("install", event => {
  event.waitUntil(caches.open(cacheName).then(async cache => {
    await cache.addAll(appAssets.map(asset => new URL(asset, base).href));
  }));
});

self.addEventListener("activate", event => {
  event.waitUntil(caches.keys().then(names => Promise.all(
    names.filter(name => name.startsWith("ibramusic-shell-") && name !== cacheName).map(name => caches.delete(name)),
  )).then(() => self.clients.claim()));
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) return;

  if (request.mode === "navigate" && url.pathname === base.pathname) {
    event.respondWith((async () => {
      const network = await fetch(request).catch(() => null);
      if (network && network.status < 500) return network;
      const cache = await caches.open(cacheName);
      return await cache.match(shellKey, { ignoreVary: true }) ?? network
        ?? new Response("IbraMusic no está disponible sin conexión.", { status: 503 });
    })());
  } else if (url.pathname.startsWith(base.pathname + "assets/") || appAssets.includes("./" + url.pathname.slice(base.pathname.length))) {
    event.respondWith(caches.open(cacheName).then(async cache => {
      const saved = await cache.match(url.href, { ignoreVary: true });
      if (saved) return saved;
      const response = await fetch(request);
      if (response.ok) await cache.put(url.href, response.clone()).catch(() => {});
      return response;
    }));
  }
});
