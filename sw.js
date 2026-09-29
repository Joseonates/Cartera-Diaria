// Cartera Diaria · service worker
// Guarda la app (páginas, código, íconos, fuentes y el SDK de Firebase) para que abra sin internet.
// Los datos NO pasan por aquí: Firestore los guarda en su propia caché y sincroniza solo.
const VERSION = 'cartera-v3';
const APP = ['./', './index.html', './js/app.js', './js/backend.js', './js/config.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/maskable-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(APP)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const guardable = url => url.origin === location.origin || /(^|\.)gstatic\.com$/.test(url.hostname) || url.hostname === 'fonts.googleapis.com';
self.addEventListener('fetch', e => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || !guardable(url)) return; // Firestore y Auth van directo a la red
  // Primero la red (para recibir actualizaciones); si no hay señal, lo guardado.
  // Los archivos propios se revalidan siempre con GitHub Pages, así los cambios se ven de inmediato.
  const pedido = url.origin === location.origin ? new Request(req, { cache: 'no-cache' }) : req;
  e.respondWith(fetch(pedido).then(res => {
    if (res && (res.ok || res.type === 'opaque')) { const copia = res.clone(); caches.open(VERSION).then(c => c.put(req, copia)); }
    return res;
  }).catch(() => caches.match(req).then(r => r || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()))));
});
