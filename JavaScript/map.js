/* ==========================================================================
 * EITAN — Map Layers
 * Uses the global `map` created in alerts.js.
 * Weather (RainViewer, animated), Flights (adsb.lol), Earthquakes (USGS),
 * Satellite (Esri), Enemy borders (GeoJSON), Shelters (Overpass).
 * ========================================================================== */

/* ---- 1. Weather radar (RainViewer) — animated, fixed zoom -------------- */
const Weather = {
    frames: [],
    layers: [],
    idx: 0,
    anim: null,
    active: false,

    async show() {
        this.active = true;
        try {
            const res = await fetch('https://api.rainviewer.com/public/weather-maps.json');
            const data = await res.json();
            const past = (data.radar && data.radar.past) || [];
            const now = (data.radar && data.radar.nowcast) || [];
            // last 6 past frames + nowcast = a short, smooth loop
            this.frames = [...past.slice(-6), ...now].map(f => data.host + f.path);
            if (!this.frames.length) return;

            this.layers = this.frames.map(path => L.tileLayer(
                `${path}/256/{z}/{x}/{y}/2/1_1.png`,
                {
                    opacity: 0, zIndex: 200, tileSize: 256,
                    maxNativeZoom: 7,    // RainViewer radar returns a "Zoom Level Not Supported"
                    maxZoom: 19,         // placeholder beyond z7 — cap here so Leaflet upscales the real tile
                    attribution: 'Radar © RainViewer'
                }
            ));
            if (!this.active) return; // toggled off while loading
            this.layers.forEach(l => l.addTo(map));
            this.idx = this.layers.length - 1;
            this.layers[this.idx].setOpacity(0.7);
            this.startAnim();
        } catch (e) {
            console.error('שגיאה בטעינת רדאר מזג אוויר:', e);
        }
    },

    startAnim() {
        clearInterval(this.anim);
        this.anim = setInterval(() => {
            if (this.layers.length < 2) return;
            this.layers[this.idx].setOpacity(0);
            this.idx = (this.idx + 1) % this.layers.length;
            // nowcast frames slightly brighter to hint "forecast"
            this.layers[this.idx].setOpacity(0.7);
        }, 600);
    },

    hide() {
        this.active = false;
        clearInterval(this.anim);
        this.layers.forEach(l => { if (map.hasLayer(l)) map.removeLayer(l); });
        this.layers = [];
        this.frames = [];
    }
};
function toggleWeather(show) { show ? Weather.show() : Weather.hide(); }

/* ---- 2. Flights (adsb.lol — free, no key, CORS) — smooth tracking ------ */
const Flights = {
    group: L.layerGroup(),
    markers: new Map(),   // hex -> { marker, missed }
    timer: null,
    active: false,

    icon(track, color) {
        return L.divIcon({
            className: 'eitan-flight',
            html: `<i class="fas fa-plane" style="transform:rotate(${(track || 0) - 45}deg);color:${color}"></i>`,
            iconSize: [22, 22], iconAnchor: [11, 11]
        });
    },

    async fetch() {
        try {
            const c = map.getCenter();
            const bounds = map.getBounds();
            // radius = center -> NE corner, in nautical miles (capped by the API)
            const meters = map.distance(c, bounds.getNorthEast());
            const distNm = Math.min(Math.max(Math.round(meters / 1852), 25), CONFIG.FLIGHTS.max_dist_nm);

            const res = await fetch(CONFIG.FLIGHTS.api(c.lat, c.lng, distNm));
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            const planes = data.ac || data.aircraft || [];

            // mark all as potentially gone, then refresh those we see
            this.markers.forEach(m => m.missed++);

            planes.slice(0, 800).forEach(p => {
                const lat = p.lat, lon = p.lon;
                if (typeof lat !== 'number' || typeof lon !== 'number') return;
                const hex = p.hex || p.r || (lat + ',' + lon);
                const track = p.track != null ? p.track : (p.true_heading || 0);
                const onGround = p.alt_baro === 'ground';
                const color = onGround ? '#7a7a7a' : '#27e0ff';

                let entry = this.markers.get(hex);
                if (entry) {
                    entry.marker.setLatLng([lat, lon]);
                    entry.marker.setIcon(this.icon(track, color));
                    entry.missed = 0;
                    const pop = entry.marker.getPopup();
                    if (pop && pop.isOpen()) pop.setContent(this.popup(p));
                } else {
                    const marker = L.marker([lat, lon], { icon: this.icon(track, color) });
                    marker.bindPopup(this.popup(p));
                    this.group.addLayer(marker);
                    this.markers.set(hex, { marker, missed: 0 });
                }
            });

            // remove stale aircraft
            for (const [hex, m] of this.markers) {
                if (m.missed > CONFIG.FLIGHTS.stale_cycles) {
                    this.group.removeLayer(m.marker);
                    this.markers.delete(hex);
                }
            }
        } catch (e) {
            console.warn('שגיאה בטעינת מטוסים (adsb.lol):', e.message);
        }
    },

    popup(p) {
        const call = (p.flight || '').trim() || p.r || 'לא ידוע';
        const alt = p.alt_baro === 'ground' ? 'על הקרקע' : ((p.alt_baro || p.alt_geom || '—') + ' רגל');
        const spd = p.gs != null ? Math.round(p.gs) + ' קשר' : '—';
        const type = p.desc || p.t || '—';
        return `<div dir="rtl" class="flight-popup">
            <b>✈ ${call}</b><br>
            סוג: ${type} &nbsp; רישום: ${p.r || '—'}<br>
            גובה: ${alt}<br>
            מהירות: ${spd}</div>`;
    },

    show() {
        this.active = true;
        map.addLayer(this.group);
        this.fetch();
        this.timer = setInterval(() => this.fetch(), CONFIG.FLIGHTS.poll_ms);
    },
    hide() {
        this.active = false;
        clearInterval(this.timer);
        map.removeLayer(this.group);
        this.group.clearLayers();
        this.markers.clear();
    }
};
function toggleFlights(show) { show ? Flights.show() : Flights.hide(); }

/* ---- 3. Earthquakes (USGS) — unchanged behavior ---------------------- */
let earthQuakeLayer = L.layerGroup();
let earthquakeInterval;

async function fetchEarthquakes() {
    try {
        const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
        const data = await res.json();
        earthQuakeLayer.clearLayers();
        data.features.forEach(eq => {
            const [lon, lat] = eq.geometry.coordinates;
            const mag = eq.properties.mag;
            if (mag < 2.0) return;
            let color = '#ffcc00';
            if (mag >= 4.0) color = '#ff6600';
            if (mag >= 6.0) color = '#ff0000';
            L.circleMarker([lat, lon], {
                radius: Math.max(mag * 2.5, 5),
                fillColor: color, color, weight: 1, opacity: 1, fillOpacity: 0.5
            }).bindPopup(`<div dir="rtl"><b>עוצמה:</b> ${mag}<br><b>מיקום:</b> ${eq.properties.place}<br><b>זמן:</b> ${new Date(eq.properties.time).toLocaleString('he-IL')}</div>`)
                .addTo(earthQuakeLayer);
        });
    } catch (e) {
        console.error('שגיאה במשיכת רעידות אדמה', e);
    }
}
function toggleEarthquakes(show) {
    if (show) {
        map.addLayer(earthQuakeLayer);
        fetchEarthquakes();
        earthquakeInterval = setInterval(fetchEarthquakes, 5 * 60000);
    } else {
        map.removeLayer(earthQuakeLayer);
        clearInterval(earthquakeInterval);
    }
}

/* ---- 4. Satellite base (Esri World Imagery) -------------------------- */
let satelliteLayer = null;
function toggleSatellite(show) {
    if (show) {
        if (!satelliteLayer) satelliteLayer = L.tileLayer(CONFIG.TILES.satellite.url, { ...CONFIG.TILES.satellite.opts, zIndex: 50 });
        satelliteLayer.addTo(map);
    } else if (satelliteLayer) {
        map.removeLayer(satelliteLayer);
    }
}

/* ---- 5. Enemy borders (dim red) -------------------------------------- */
let enemyLayer = null;
async function toggleEnemy(show) {
    if (show) {
        if (!enemyLayer) {
            try {
                const res = await fetch(CONFIG.ENEMY.geojson);
                const gj = await res.json();
                const feats = gj.features.filter(f => CONFIG.ENEMY.countries.includes(f.properties.name));
                enemyLayer = L.geoJSON({ type: 'FeatureCollection', features: feats }, {
                    style: { color: '#ff3b3b', weight: 1, fillColor: '#ff3b3b', fillOpacity: 0.14 }
                });
                enemyLayer.bindPopup(l => `<b>${l.feature.properties.name}</b>`);
            } catch (e) { console.error('שגיאה בטעינת גבולות', e); return; }
        }
        enemyLayer.addTo(map);
    } else if (enemyLayer) {
        map.removeLayer(enemyLayer);
    }
}

/* ---- 6. Public shelters (Overpass, best-effort) ---------------------- */
let shelterLayer = L.layerGroup();
async function toggleShelters(show) {
    if (!show) { map.removeLayer(shelterLayer); return; }
    map.addLayer(shelterLayer);
    if (map.getZoom() < 12) {
        // avoid an enormous query — ask the user to zoom in
        L.popup().setLatLng(map.getCenter())
            .setContent('התקרב יותר (זום 12+) כדי לטעון מקלטים באזור').openOn(map);
        return;
    }
    try {
        const b = map.getBounds();
        const bbox = `${b.getSouth()},${b.getWest()},${b.getNorth()},${b.getEast()}`;
        const q = `[out:json][timeout:20];(node["amenity"="shelter"](${bbox});node["military"="bunker"](${bbox}););out 200;`;
        const res = await fetch('https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(q));
        const data = await res.json();
        shelterLayer.clearLayers();
        (data.elements || []).forEach(el => {
            if (!el.lat || !el.lon) return;
            L.marker([el.lat, el.lon], {
                icon: L.divIcon({ className: 'eitan-shelter', html: '<i class="fas fa-house-circle-check"></i>', iconSize: [20, 20], iconAnchor: [10, 10] })
            }).bindPopup(`<b>מקלט / מרחב מוגן</b><br>${(el.tags && (el.tags.name || el.tags['name:he'])) || 'ללא שם'}`)
                .addTo(shelterLayer);
        });
        if (!(data.elements || []).length) {
            L.popup().setLatLng(map.getCenter()).setContent('לא נמצאו מקלטים מתועדים באזור זה (כיסוי חלקי)').openOn(map);
        }
    } catch (e) { console.warn('שגיאה בטעינת מקלטים', e); }
}

/* ---- 7. Wire up the checkboxes (defensive: elements may not exist) ---- */
function bindLayerToggle(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', e => fn(e.target.checked));
}
bindLayerToggle('layer-weather', toggleWeather);
bindLayerToggle('layer-flights', toggleFlights);
bindLayerToggle('layer-earthquakes', toggleEarthquakes);
bindLayerToggle('layer-satellite', toggleSatellite);
bindLayerToggle('layer-enemy', toggleEnemy);
bindLayerToggle('layer-shelters', toggleShelters);
