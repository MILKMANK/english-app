// sw.js — офлайн-режим. Сначала сеть (чтобы обновления доходили сразу), при её отсутствии — кэш.
const CACHE = 'english-v3';
const ASSETS = ['./', 'index.html', 'manifest.json', 'css/styles.css', 'js/main.js',
  'js/core/db.js', 'js/core/textUtils.js', 'js/core/translator.js', 'js/core/seed.js', 'js/vocabulary/wordsTable.js',
  'js/reader/zip.js', 'js/reader/fileLoader.js', 'js/reader/readerView.js', 'js/reader/wordPopup.js'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return; // API переводчика не трогаем
  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
      return res;
    }).catch(() => caches.match(req))
  );
});
