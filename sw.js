/* TURBO VALLEY service worker — офлайн-кэш игры и 3D-движка. */
var CACHE = 'turbo-valley-v4';
var ASSETS = ['./', './index.html', './style.css', './script.js', './manifest.json', './icon.svg'];

self.addEventListener('install', function (e) {
  e.waitUntil(
    caches.open(CACHE).then(function (cache) {
      return Promise.all(ASSETS.map(function (u) {
        return cache.add(u).catch(function () {});
      }));
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  var isThree = /three(\.min)?\.js/.test(url.pathname) &&
    /cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com/.test(url.hostname);
  var sameOrigin = url.origin === self.location.origin;

  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE).then(function (c) { c.put('./index.html', copy); });
        return res;
      }).catch(function () {
        return caches.match('./index.html').then(function (r) { return r || caches.match('./'); });
      })
    );
    return;
  }

  if (sameOrigin || isThree) {
    e.respondWith(
      caches.match(req).then(function (cached) {
        var net = fetch(req).then(function (res) {
          if (res && (res.ok || res.type === 'opaque')) {
            var copy = res.clone();
            caches.open(CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        }).catch(function () { return cached; });
        return cached || net;
      })
    );
  }
});