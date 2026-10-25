// Service Worker: App-Gerüst aus dem Cache (im Hintergrund aktualisiert). Supabase-Aufrufe (andere Domain)
// gehen immer direkt ins Netz. Pfade relativ, damit die App auch unter …github.io/<repo>/ läuft.
const SHELL = 'shell-v5';
const SHELL_FILES = ['./', 'index.html', 'app.js', 'cloud.js', 'off.js', 'config.js', 'style.css', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(SHELL_FILES.map(f => new Request(f, { cache: 'no-cache' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith('shell-') && k !== SHELL).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // sofort aus dem Cache, parallel frisch aus dem Netz holen und Cache aktualisieren
  const fresh = e.request.mode === 'navigate'
    ? new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' })
    : new Request(e.request, { cache: 'no-cache' });
  const net = fetch(fresh).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(SHELL).then(c => c.put(e.request, copy)); }
    return r;
  });
  // offline ohne Treffer: Seitenaufrufe bekommen das gecachte index.html
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit || net.catch(async err => {
    const shell = e.request.mode === 'navigate' && await caches.match('index.html');
    if (shell) return shell;
    throw err;
  })));
  e.waitUntil(net.catch(() => {}));
});
