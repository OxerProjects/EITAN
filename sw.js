/* ==========================================================================
 * EITAN — Service Worker (App Shell + offline caching)
 * Caches: index.html, CSS, all JS, cities.json, Leaflet, FontAwesome, fonts.
 * Live API calls (alerts, weather, flights) are always fetched from network.
 * ========================================================================== */

const CACHE = 'eitan-v2';
const SHELL = [
    '/',
    '/index.html',
    '/style.css',
    '/cities.json',
    '/font.otf',
    '/JavaScript/config.js',
    '/JavaScript/alerts.js',
    '/JavaScript/map.js',
    '/JavaScript/media.js',
    '/JavaScript/sound.js',
    '/JavaScript/reports.js',
    '/JavaScript/stats.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

// URLs that should ALWAYS come from the network (live data)
const NETWORK_ONLY = [
    'api.tzevaadom.co.il', 'ws.tzevaadom.co.il', 'tzevaadom.co.il',
    'api.airplanes.live', 'api.rainviewer.com', 'tilecache.rainviewer.com',
    'earthquake.usgs.gov', 'overpass-api.de',
    't.me', 'api.cors.lol', 'api.allorigins.win',
    'rcs.mako.co.il', 'rss.walla.co.il', 'ynet.co.il', 'rss.cnn.com'
];

self.addEventListener('install', e => {
    e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
    self.skipWaiting();
});

self.addEventListener('activate', e => {
    e.waitUntil(caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ));
    self.clients.claim();
});

self.addEventListener('fetch', e => {
    const url = e.request.url;
    if (NETWORK_ONLY.some(h => url.includes(h))) return; // let browser handle
    e.respondWith(
        caches.match(e.request).then(cached => {
            if (cached) return cached;
            return fetch(e.request).then(res => {
                if (res.ok && e.request.method === 'GET') {
                    const clone = res.clone();
                    caches.open(CACHE).then(c => c.put(e.request, clone));
                }
                return res;
            }).catch(() => cached || new Response('offline', { status: 503 }));
        })
    );
});
