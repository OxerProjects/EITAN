/* ==========================================================================
 * EITAN — Alert Engine
 * Single source of truth + idempotent rendering. Every source (WebSocket,
 * REST fallback, simulation, Telegram pre-warnings) funnels through
 * ingestAlert(); the UI is rebuilt from state, so duplicates are impossible.
 * ========================================================================== */

/* ---- 1. Map bootstrap (global `map`, used by map.js / media.js) -------- */
const map = L.map('map', {
    zoomControl: true,
    preferCanvas: true,
    worldCopyJump: true
}).setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
window.map = map;

const baseDarkLayer = L.tileLayer(CONFIG.TILES.dark.url, CONFIG.TILES.dark.opts).addTo(map);

// "Recenter on Israel" control
const HomeControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function () {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const button = L.DomUtil.create('a', 'custom-home-btn', container);
        button.innerHTML = '<i class="fas fa-crosshairs"></i>';
        button.href = '#';
        button.title = 'מרכז על ישראל';
        L.DomEvent.on(button, 'click', function (e) {
            L.DomEvent.preventDefault(e);
            map.flyTo(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);
        });
        return container;
    }
});
map.addControl(new HomeControl());

/* ---- 2. Cities (name -> coordinates) ---------------------------------- */
let cityData = { ...CONFIG.FALLBACK_CITIES };
let cityIndex = {};   // normalized name -> { lat, lng, countdown, name }

function normalizeCityName(s) {
    return String(s || '')
        .replace(/[‎‏]/g, '')          // bidi marks
        .replace(/["'’`]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s*-\s*/g, ' ')                 // unify dashes/spacing
        .trim();
}

function buildCityIndex() {
    cityIndex = {};
    const list = Array.isArray(cityData) ? cityData : Object.entries(cityData);
    const entries = Array.isArray(cityData)
        ? cityData.map(c => [c.he || c.name, c])
        : list;
    entries.forEach(([key, c]) => {
        if (!c) return;
        const lat = c.lat, lng = c.lng;
        if (typeof lat !== 'number' || typeof lng !== 'number') return;
        const rec = { lat, lng, countdown: c.countdown || 60, name: c.he || key };
        [key, c.he, c.en].filter(Boolean).forEach(n => {
            cityIndex[normalizeCityName(n)] = rec;
        });
    });
}

function getCity(name) {
    if (!name) return null;
    const norm = normalizeCityName(name);
    if (cityIndex[norm]) return cityIndex[norm];
    // loose contains-match (helps with area names from Telegram)
    const hit = Object.keys(cityIndex).find(k => k === norm || k.includes(norm) || norm.includes(k));
    return hit ? cityIndex[hit] : null;
}

async function loadCities() {
    // Local file first (instant, reliable on GitHub Pages), then remote merge.
    try {
        const res = await fetch(CONFIG.ENDPOINTS.CITIES_LOCAL);
        if (res.ok) {
            const data = await res.json();
            cityData = { ...CONFIG.FALLBACK_CITIES, ...(data.cities || data) };
            buildCityIndex();
        }
    } catch (_) { /* fall through to remote */ }

    try {
        const content = await fetchJSONviaProxy(CONFIG.ENDPOINTS.CITIES + Date.now());
        if (content && content.cities) {
            cityData = { ...cityData, ...content.cities };
            buildCityIndex();
        }
    } catch (_) { /* keep what we have */ }
}
buildCityIndex();

/* ---- 3. Proxy fetch (rotated, remembers the last good proxy) ----------- */
let lastGoodProxy = 0;

async function fetchJSONviaProxy(targetUrl) {
    const proxies = CONFIG.PROXIES;
    for (let i = 0; i < proxies.length; i++) {
        const p = proxies[(lastGoodProxy + i) % proxies.length];
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 8000);
            const res = await fetch(p.wrap(targetUrl), { signal: ctrl.signal });
            clearTimeout(t);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const ct = res.headers.get('content-type') || '';
            const raw = ct.includes('application/json') ? await res.json() : await res.text();
            const data = p.unwrap(raw);
            lastGoodProxy = (lastGoodProxy + i) % proxies.length;
            return data;
        } catch (e) { /* try next proxy */ }
    }
    throw new Error('all proxies failed');
}

// Raw-text variant for HTML/RSS (Phase 2). Exposed for reports.js.
async function fetchTextViaProxy(targetUrl) {
    for (const p of CONFIG.TEXT_PROXIES) {
        try {
            const ctrl = new AbortController();
            const t = setTimeout(() => ctrl.abort(), 9000);
            const res = await fetch(p.wrap(targetUrl), { signal: ctrl.signal });
            clearTimeout(t);
            if (!res.ok) throw new Error('HTTP ' + res.status);
            return await res.text();
        } catch (e) { /* next */ }
    }
    throw new Error('all text proxies failed');
}

/* ---- 4. State (the single source of truth) ---------------------------- */
const State = {
    activeAlerts: new Map(),   // alertId -> { threat, ts, time, isDrill, cities:Set<city> }
    cityActive: new Map(),     // cityName -> { alertId, threat, since, marker, timer }
    history: new Map(),        // historyKey -> { city, threat, ts, time }
    seen: new Set(),           // dedup guard: `${alertId}|${city}` while active
    historyCircles: new Map(), // cityName -> Leaflet circle
    preWarn: new Map()         // cityName -> { since, circle, timer }
};

function historyKey(city, ts, threat) {
    return `${normalizeCityName(city)}|${Math.floor(ts / 60000)}|${threat}`;
}
function fmtTime(ms) {
    return new Date(ms).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
}

/* ---- 5. Ingest: the one entry point for ALL alerts -------------------- */
function ingestAlert({ id, cities, threat = 0, time = null, isDrill = false, source = 'live' }) {
    const list = Array.isArray(cities) ? cities : [cities];
    const ts = time ? (time > 1e12 ? time : time * 1000) : Date.now();
    const alertId = id || ('a-' + ts);
    let changed = false;

    list.forEach(rawCity => {
        const city = String(rawCity).trim();
        if (!city) return;
        const dedupKey = `${alertId}|${city}`;
        if (State.seen.has(dedupKey)) return;     // already counted this alert-city
        State.seen.add(dedupKey);
        changed = true;

        // alert record (drives the active list cards)
        let rec = State.activeAlerts.get(alertId);
        if (!rec) {
            rec = { threat, ts, time: time ? fmtTime(ts) : fmtTime(Date.now()), isDrill, cities: new Set() };
            State.activeAlerts.set(alertId, rec);
        }
        rec.cities.add(city);

        // a real alert overrides any orange pre-warning for that city
        clearPreWarn(city);

        activateCity(city, alertId, threat);

        // personal alert if it matches the user's saved city
        const target = localStorage.getItem('targetCity');
        if (target && normalizeCityName(target) === normalizeCityName(city) && CONFIG.threatMeta(threat).personal) {
            triggerPersonalAlert(city, threat);
        }
    });

    if (changed) {
        renderLists();
        refocusMap();
        updateBackground();
        if (source !== 'history') playAlertCue(threat, list);
    }
}

function activateCity(city, alertId, threat) {
    const meta = CONFIG.threatMeta(threat);
    const coords = getCity(city);
    const lifetime = coords ? (coords.countdown * 1000) : CONFIG.TIMING.ACTIVE_MS;

    // refresh the lifecycle if the city is already active
    const existing = State.cityActive.get(city);
    if (existing) {
        clearTimeout(existing.timer);
        existing.timer = setTimeout(() => expireCity(city), lifetime);
        existing.since = Date.now();
        updateMarkerPopup(existing, city, coords, meta, lifetime);
        return;
    }

    let marker = null;
    if (coords) {
        const icon = L.divIcon({
            className: 'eitan-marker',
            html: `<div class="alert-marker" style="--mc:${meta.color}"></div>`,
            iconSize: [26, 26], iconAnchor: [13, 13]
        });
        marker = L.marker([coords.lat, coords.lng], { icon, zIndexOffset: 1000 }).addTo(map);
        bindCountdownPopup(marker, city, meta, coords, lifetime);

        // draw estimated trajectory if pre-warn was active or it's a ballistic threat
        if (window.EITAN_drawTrajectory && (threat === 0 || threat === 1)) {
            EITAN_drawTrajectory(city, threat);
        }
    }

    const timer = setTimeout(() => expireCity(city), lifetime);
    State.cityActive.set(city, { alertId, threat, since: Date.now(), marker, timer, lifetime });
}

function bindCountdownPopup(marker, city, meta, coords, lifetimeMs) {
    let remaining = Math.ceil(lifetimeMs / 1000);
    const update = () => {
        const popupContent = `<b style="color:${meta.color}">${meta.name}</b><br>${city}<br><span style="color:#ffd34d;font-weight:700">⏱ ${remaining}ש'</span>`;
        const pop = marker.getPopup();
        if (pop) pop.setContent(popupContent);
        else marker.bindPopup(popupContent);
        if (remaining > 0) remaining--;
    };
    marker.bindPopup('');
    update();
    const iv = setInterval(() => {
        if (!State.cityActive.has(city)) { clearInterval(iv); return; }
        update();
    }, 1000);
}

function updateMarkerPopup(entry, city, coords, meta, lifetime) {
    if (entry.marker) {
        const remaining = Math.ceil((lifetime - (Date.now() - entry.since)) / 1000);
        const pop = entry.marker.getPopup();
        if (pop) pop.setContent(`<b style="color:${meta.color}">${meta.name}</b><br>${city}<br><span style="color:#ffd34d;font-weight:700">⏱ ${Math.max(0, remaining)}ש'</span>`);
    }
}

function expireCity(city) {
    const entry = State.cityActive.get(city);
    if (!entry) return;
    clearTimeout(entry.timer);

    // remove active marker, drop the dedup guard so a future alert can fire again
    if (entry.marker && map.hasLayer(entry.marker)) map.removeLayer(entry.marker);
    State.seen.delete(`${entry.alertId}|${city}`);
    State.cityActive.delete(city);

    // remove city from its alert record; retire the alert when fully expired
    const rec = State.activeAlerts.get(entry.alertId);
    if (rec) {
        rec.cities.delete(city);
        const ts = rec.ts;
        addHistoryEntry(city, entry.threat, ts);
        if (rec.cities.size === 0) State.activeAlerts.delete(entry.alertId);
    } else {
        addHistoryEntry(city, entry.threat, Date.now());
    }

    addHistoryCircle(city, entry.threat);
    renderLists();
    updateBackground();
    checkAndResetCamera();
}

/* ---- 6. History (last hour) ------------------------------------------ */
function addHistoryEntry(city, threat, ts) {
    const key = historyKey(city, ts, threat);
    if (State.history.has(key)) return;
    if (Date.now() - ts > CONFIG.TIMING.HISTORY_WINDOW_MS) return;
    State.history.set(key, { city, threat, ts, time: fmtTime(ts) });
}

function addHistoryCircle(city, threat) {
    const coords = getCity(city);
    if (!coords) return;
    if (State.historyCircles.has(city)) {
        clearTimeout(State.historyCircles.get(city)._fade);
    }
    const circle = L.circle([coords.lat, coords.lng], {
        radius: 4000, fillColor: '#3a6df0', color: '#3a6df0',
        weight: 0, fillOpacity: 0.10, className: 'history-circle'
    }).addTo(map);
    circle.bindPopup(`<b>היסטוריה:</b> ${CONFIG.threatMeta(threat).name}<br>${city}`);
    circle.on('mouseover', function () { this.setStyle({ fillOpacity: 0.28 }); });
    circle.on('mouseout', function () { this.setStyle({ fillOpacity: 0.10 }); });
    circle._fade = setTimeout(() => {
        if (map.hasLayer(circle)) map.removeLayer(circle);
        State.historyCircles.delete(city);
    }, CONFIG.TIMING.HISTORY_FADE_MS);
    State.historyCircles.set(city, circle);
}

async function fetchHistory() {
    try {
        const groups = await fetchJSONviaProxy(CONFIG.ENDPOINTS.HISTORY);
        if (!Array.isArray(groups)) return;
        const cutoff = Date.now() - CONFIG.TIMING.HISTORY_WINDOW_MS;
        groups.forEach(group => {
            (group.alerts || []).forEach(item => {
                const ts = item.time * 1000;
                if (ts < cutoff) return;
                (item.cities || []).forEach(city => {
                    addHistoryEntry(city, item.threat, ts);
                });
            });
        });
        // prune anything older than the window
        for (const [k, v] of State.history) {
            if (v.ts < cutoff) State.history.delete(k);
        }
        renderLists();
    } catch (e) { /* silent — list still shows live data */ }
}

/* ---- 7. Idempotent rendering ----------------------------------------- */
function buildCard(cities, threat, time, opts = {}) {
    const meta = CONFIG.threatMeta(threat);
    const div = document.createElement('div');
    div.className = 'alert-card' + (opts.history ? ' history' : '');
    div.style.setProperty('--mc', opts.history ? '#5a6275' : meta.color);
    const drill = opts.isDrill ? '<span class="drill-tag">תרגיל</span>' : '';
    div.innerHTML = `
        <div class="alert-header">
            <div class="alert-title"><i class="fas ${meta.icon}"></i> ${cities.join('، ')}</div>
            <div class="alert-time">${time}</div>
        </div>
        <div class="alert-type">${meta.name}${drill}</div>`;
    return div;
}

function renderLists() {
    const listEl = document.getElementById('alerts-list');
    if (!listEl) return;

    const hasActive = State.activeAlerts.size > 0;
    const hasHistory = State.history.size > 0;

    if (!hasActive && !hasHistory) {
        listEl.innerHTML = '<div class="empty-state"><i class="fas fa-shield-halved"></i><p>אין התראות פעילות</p><span>המערכת מנטרת בזמן אמת</span></div>';
        return;
    }

    listEl.innerHTML = '';

    // --- Active ---
    const curTitle = document.createElement('div');
    curTitle.className = 'alerts-section-title';
    curTitle.innerHTML = `<span class="live-dot"></span> התראות פעילות`;
    listEl.appendChild(curTitle);

    if (hasActive) {
        [...State.activeAlerts.entries()]
            .sort((a, b) => b[1].ts - a[1].ts)
            .forEach(([, rec]) => {
                listEl.appendChild(buildCard([...rec.cities], rec.threat, rec.time, { isDrill: rec.isDrill }));
            });
    } else {
        const none = document.createElement('p');
        none.className = 'list-hint';
        none.textContent = 'אין התראות פעילות כעת';
        listEl.appendChild(none);
    }

    // --- History (grouped by threat + minute bucket) ---
    const histTitle = document.createElement('div');
    histTitle.className = 'alerts-section-title';
    histTitle.textContent = 'התראות בשעה האחרונה';
    listEl.appendChild(histTitle);

    const buckets = new Map();
    [...State.history.values()].forEach(h => {
        const bk = `${h.threat}|${Math.floor(h.ts / 60000)}`;
        if (!buckets.has(bk)) buckets.set(bk, { threat: h.threat, ts: h.ts, time: h.time, cities: new Set() });
        buckets.get(bk).cities.add(h.city);
    });
    [...buckets.values()].sort((a, b) => b.ts - a.ts).slice(0, 60).forEach(b => {
        listEl.appendChild(buildCard([...b.cities], b.threat, b.time, { history: true }));
    });
}
window.renderAllAlerts = renderLists;   // used by media.js when switching modes

/* ---- 8. Map focus + background --------------------------------------- */
function activeCoords() {
    const pts = [];
    State.cityActive.forEach((_, city) => {
        const c = getCity(city);
        if (c) pts.push([c.lat, c.lng]);
    });
    return pts;
}

let refocusPending = null;
function refocusMap() {
    // debounce so a burst of cities results in one smooth movement
    clearTimeout(refocusPending);
    refocusPending = setTimeout(() => {
        const pts = activeCoords();
        if (pts.length === 1) {
            map.flyTo(pts[0], 12, { duration: 0.8 });
        } else if (pts.length > 1) {
            map.flyToBounds(L.latLngBounds(pts), { padding: [60, 60], maxZoom: 12, duration: 0.8 });
        }
    }, 250);
}

function checkAndResetCamera() {
    if (State.cityActive.size === 0) map.flyTo(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM, { duration: 1.0 });
}

function updateBackground() {
    const active = State.cityActive.size > 0;
    document.body.classList.toggle('alert-mode', active);
}

/* ---- 9. Personal alert + cue ----------------------------------------- */
function triggerPersonalAlert(cityName, threat) {
    const popup = document.getElementById('personal-alert-popup');
    const nameSpan = document.getElementById('personal-alert-city-name');
    const closeBtn = document.getElementById('close-personal-alert');
    if (!popup || !nameSpan) return;

    nameSpan.innerText = cityName;
    popup.classList.remove('hidden');
    document.body.classList.add('emergency-strobe');
    setTimeout(() => document.body.classList.remove('emergency-strobe'), 10000);

    if (window.triggerEmergencyTimer) window.triggerEmergencyTimer();
    if (closeBtn) closeBtn.onclick = () => popup.classList.add('hidden');
}

// Sound/Push hook — implemented in sound.js.
function playAlertCue(threat, cities = []) {
    if (window.EITAN_playSiren) window.EITAN_playSiren(threat, cities);
}

/* ---- 10. Pre-warning (orange) — used by reports.js in Phase 2 --------- */
function ingestPreWarn(cities) {
    const list = Array.isArray(cities) ? cities : [cities];
    list.forEach(city => {
        if (State.cityActive.has(city) || State.preWarn.has(city)) return;
        const coords = getCity(city);
        let circle = null;
        if (coords) {
            circle = L.circle([coords.lat, coords.lng], {
                radius: 5000, fillColor: '#ff9800', color: '#ff9800',
                weight: 1, dashArray: '4 4', fillOpacity: 0.12, className: 'prewarn-circle'
            }).addTo(map);
            circle.bindPopup(`<b style="color:#ff9800">התרעה מקדימה</b><br>${city}`);
        }
        const timer = setTimeout(() => clearPreWarn(city), CONFIG.TIMING.PREWARN_MS);
        State.preWarn.set(city, { since: Date.now(), circle, timer });
    });
}
function clearPreWarn(city) {
    const p = State.preWarn.get(city);
    if (!p) return;
    clearTimeout(p.timer);
    if (p.circle && map.hasLayer(p.circle)) map.removeLayer(p.circle);
    State.preWarn.delete(city);
}

/* ---- 11. Sources: WebSocket (primary) + REST (fallback) --------------- */
const Source = {
    ws: null,
    wsOpen: false,
    retry: CONFIG.TIMING.WS_RETRY_MIN_MS,
    pollTimer: null,

    start() {
        this.connectWS();
        this.pollTimer = setInterval(() => this.pollREST(), CONFIG.TIMING.REST_POLL_MS);
    },

    connectWS() {
        try {
            const ws = new WebSocket(CONFIG.ENDPOINTS.WS);
            this.ws = ws;
            ws.onopen = () => {
                this.wsOpen = true;
                this.retry = CONFIG.TIMING.WS_RETRY_MIN_MS;
                setStatus('live');
            };
            ws.onmessage = (evt) => this.handleFrame(evt.data);
            ws.onclose = () => { this.wsOpen = false; setStatus('fallback'); this.scheduleReconnect(); };
            ws.onerror = () => { try { ws.close(); } catch (_) { } };
        } catch (e) {
            this.wsOpen = false;
            setStatus('fallback');
            this.scheduleReconnect();
        }
    },

    scheduleReconnect() {
        setTimeout(() => this.connectWS(), this.retry);
        this.retry = Math.min(this.retry * 2, CONFIG.TIMING.WS_RETRY_MAX_MS);
    },

    handleFrame(raw) {
        try {
            const frame = JSON.parse(raw);
            const inner = (typeof frame.data === 'string') ? JSON.parse(frame.data) : (frame.data || frame);
            const type = inner.type || frame.type;
            if (type && String(type).toUpperCase() !== 'ALERT') return;
            if (!inner.cities) return;
            ingestAlert({
                id: inner.notificationId || frame.notificationId,
                cities: inner.cities,
                threat: typeof inner.threat === 'number' ? inner.threat : 0,
                time: inner.time,
                isDrill: !!inner.isDrill,
                source: 'live'
            });
        } catch (e) { /* ignore malformed frame */ }
    },

    async pollREST() {
        if (this.wsOpen) return;   // socket is authoritative; don't double-poll
        for (const url of [CONFIG.ENDPOINTS.NOTIFICATIONS, CONFIG.ENDPOINTS.NOTIFICATIONS_ALT]) {
            try {
                const data = await fetchJSONviaProxy(url);
                const arr = Array.isArray(data) ? data : (data && data.cities ? [data] : []);
                arr.forEach(a => ingestAlert({
                    id: a.notificationId || a.id,
                    cities: a.cities,
                    threat: a.threat != null ? a.threat : 0,
                    time: a.time,
                    isDrill: !!a.isDrill,
                    source: 'live'
                }));
                setStatus('fallback');
                return;
            } catch (e) { /* try next url */ }
        }
    }
};

function setStatus(mode) {
    const el = document.getElementById('status-source');
    if (!el) return;
    if (mode === 'live') { el.textContent = 'מחובר · זמן אמת'; el.className = 'status-ok'; }
    else { el.textContent = 'מחובר · גיבוי'; el.className = 'status-warn'; }
}

/* ---- 12. Simulation / debug (exposed for the settings panel) ---------- */
window.simulateAlert = function () {
    const mock = ["תל אביב - יפו", "חיפה", "באר שבע", "ירושלים", "אשדוד", "שדרות", "אשקלון"];
    const target = localStorage.getItem('targetCity') || mock[Math.floor(Math.random() * mock.length)];
    const threat = Math.floor(Math.random() * 3);
    ingestAlert({ id: 'sim-' + Date.now(), cities: [target], threat, source: 'live' });
};

window.simulateMultiAlert = function () {
    ingestAlert({ id: 'sim-a-' + Date.now(), cities: ["שדרות", "נתיבות", "אשקלון"], threat: 0, source: 'live' });
    setTimeout(() => ingestAlert({ id: 'sim-b-' + Date.now(), cities: ["קרית שמונה", "חיפה"], threat: 1, source: 'live' }), 1800);
};

window.forceMapMarker = function () {
    ingestAlert({ id: 'force-' + Date.now(), cities: ["תל אביב - יפו"], threat: 0, source: 'live' });
};

/* ---- 13. Public namespace (for map.js / reports.js / stats.js) -------- */
/* ---- All-clear: remove orange + flash green ---- */
window.EITAN_allClear = function (cities) {
    (cities || []).forEach(city => {
        clearPreWarn(city);
        const coords = getCity(city);
        if (!coords) return;
        const circle = L.circle([coords.lat, coords.lng], {
            radius: 4500, fillColor: '#37e08b', color: '#37e08b',
            weight: 1, fillOpacity: 0.22, className: 'allclear-circle'
        }).addTo(map);
        circle.bindPopup(`<b style="color:#37e08b">האירוע הסתיים</b><br>${city}`);
        setTimeout(() => { if (map.hasLayer(circle)) map.removeLayer(circle); }, 30000);
    });
};

/* ---- Replay: re-run history events at 10× speed ---- */
window.replayHistory = async function () {
    const items = [...State.history.values()].sort((a, b) => a.ts - b.ts);
    if (!items.length) { alert('אין נתוני היסטוריה לנגן'); return; }
    const btn = document.getElementById('replay-btn');
    if (btn) { btn.disabled = true; btn.textContent = '▶ מנגן…'; }
    // group by minute bucket
    const buckets = new Map();
    items.forEach(h => {
        const k = Math.floor(h.ts / 60000);
        if (!buckets.has(k)) buckets.set(k, []);
        buckets.get(k).push(h);
    });
    const sorted = [...buckets.entries()].sort((a, b) => a[0] - b[0]);
    for (let i = 0; i < sorted.length; i++) {
        const [, alerts] = sorted[i];
        const delay = i === 0 ? 0 : 600; // 600ms between minute buckets → 10× speed
        await new Promise(res => setTimeout(res, delay));
        alerts.forEach(h => ingestAlert({ id: 'replay-' + h.ts + h.city, cities: [h.city], threat: h.threat, source: 'history' }));
    }
    if (btn) { btn.disabled = false; btn.textContent = '▶ הפעל ריפליי'; }
};

window.EITAN = {
    map, State, getCity, normalizeCityName,
    cityExact: (name) => cityIndex[normalizeCityName(name)] || null,
    ingestAlert, ingestPreWarn, clearPreWarn,
    fetchJSONviaProxy, fetchTextViaProxy, fetchHistory,
    threatMeta: CONFIG.threatMeta
};

/* ---- 14. Boot -------------------------------------------------------- */
loadCities();
Source.start();
fetchHistory();
setInterval(fetchHistory, CONFIG.TIMING.HISTORY_POLL_MS);
renderLists();
