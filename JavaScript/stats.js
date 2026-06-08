/* ==========================================================================
 * EITAN — Statistics Screen (Phase 2)
 * Full-screen modal: conflict title, 24h/7d stats from history API,
 * per-threat breakdown, top cities, hourly chart, enemy-country dim-red
 * mini-map, and estimated ballistic arcs (pre-warn → impact).
 * ========================================================================== */

(function () {
    "use strict";
    const E = window.EITAN;
    if (!E) return;

    /* ---- modal scaffold ---- */
    const overlay = document.createElement('div');
    overlay.id = 'stats-overlay';
    overlay.classList.add('hidden');
    overlay.innerHTML = `
        <div id="stats-modal">
            <div id="stats-header">
                <div class="stats-title-block">
                    <i class="fas fa-chart-column" style="color:var(--cyan)"></i>
                    <span id="stats-conflict-title">מערכת EITAN — סטטיסטיקות</span>
                </div>
                <button id="stats-close"><i class="fas fa-times"></i></button>
            </div>
            <div id="stats-body">
                <div id="stats-kpis" class="stats-row"></div>
                <div class="stats-row" style="gap:20px">
                    <div class="stats-card" style="flex:1.2">
                        <div class="stats-card-title">פילוח לפי סוג איום</div>
                        <div id="stats-threats"></div>
                    </div>
                    <div class="stats-card" style="flex:2">
                        <div class="stats-card-title">ערים מותקפות ביותר</div>
                        <div id="stats-cities"></div>
                    </div>
                </div>
                <div class="stats-card">
                    <div class="stats-card-title">התפלגות שעתית — 24 שעות אחרונות</div>
                    <div id="stats-chart"></div>
                </div>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => { if (e.target === overlay) hide(); });
    document.getElementById('stats-close').addEventListener('click', hide);

    /* ---- open/close ---- */
    function show() { overlay.classList.remove('hidden'); load(); }
    function hide() { overlay.classList.add('hidden'); }
    window.openStatsModal = show;

    /* ---- data loading ---- */
    async function load() {
        const body = document.getElementById('stats-body');
        body.innerHTML = '<div class="stats-loading"><i class="fas fa-spinner fa-spin"></i> טוען נתונים…</div>';

        // refetch history to get up-to-date data from a wider window
        let allAlerts = [];
        try {
            const groups = await E.fetchJSONviaProxy(CONFIG.ENDPOINTS.HISTORY + 'hours=168');
            if (Array.isArray(groups)) {
                groups.forEach(g => (g.alerts || []).forEach(a => {
                    (a.cities || []).forEach(city => {
                        allAlerts.push({ city, threat: a.threat, ts: a.time * 1000 });
                    });
                }));
            }
        } catch (_) { }

        // also pull from the current session's history state
        E.State.history.forEach(h => {
            allAlerts.push({ city: h.city, threat: h.threat, ts: h.ts });
        });

        // dedup by city+ts+threat
        const seen = new Set();
        allAlerts = allAlerts.filter(a => {
            const k = `${a.city}|${Math.floor(a.ts / 60000)}|${a.threat}`;
            if (seen.has(k)) return false;
            seen.add(k); return true;
        });

        if (!allAlerts.length) {
            document.getElementById('stats-body').innerHTML = '<div class="stats-loading">אין נתונים היסטוריים זמינים</div>';
            return;
        }

        render(allAlerts);
    }

    function render(alerts) {
        // conflict name
        const conflictName = localStorage.getItem('conflictName') || autoConflictTitle(alerts);
        document.getElementById('stats-conflict-title').textContent = conflictName;

        const now = Date.now();
        const h24 = now - 86400000;
        const h24alerts = alerts.filter(a => a.ts > h24);

        // --- KPIs ---
        const kpiEl = document.getElementById('stats-kpis');
        kpiEl.innerHTML = '';
        const kpis = [
            { label: '24 שעות אחרונות', value: h24alerts.length, icon: 'fa-clock', color: 'var(--cyan)' },
            { label: 'שבוע אחרון', value: alerts.length, icon: 'fa-calendar-week', color: 'var(--amber)' },
            { label: 'ערים שהותקפו', value: new Set(alerts.map(a => a.city)).size, icon: 'fa-city', color: 'var(--red)' },
            { label: 'שיא שעתי', value: peakHour(h24alerts), icon: 'fa-bolt', color: 'var(--red)' }
        ];
        kpis.forEach(k => {
            const d = document.createElement('div');
            d.className = 'stats-kpi';
            d.innerHTML = `<i class="fas ${k.icon}" style="color:${k.color}"></i><div class="kpi-val" style="color:${k.color}">${k.value}</div><div class="kpi-label">${k.label}</div>`;
            kpiEl.appendChild(d);
        });

        // --- Threats ---
        const threatCounts = {};
        h24alerts.forEach(a => { threatCounts[a.threat] = (threatCounts[a.threat] || 0) + 1; });
        const threatEl = document.getElementById('stats-threats');
        threatEl.innerHTML = Object.entries(threatCounts).sort((a, b) => b[1] - a[1]).map(([t, n]) => {
            const m = CONFIG.threatMeta(+t);
            const pct = Math.round(n / h24alerts.length * 100);
            return `<div class="stats-bar-row">
                <span class="bar-label"><i class="fas ${m.icon}" style="color:${m.color}"></i> ${m.name}</span>
                <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:${m.color}"></div></div>
                <span class="bar-count">${n}</span>
            </div>`;
        }).join('') || '<div class="stats-empty">אין נתונים</div>';

        // --- Top cities ---
        const cityCounts = {};
        h24alerts.forEach(a => { cityCounts[a.city] = (cityCounts[a.city] || 0) + 1; });
        const topCities = Object.entries(cityCounts).sort((a, b) => b[1] - a[1]).slice(0, 12);
        const maxCity = topCities[0] ? topCities[0][1] : 1;
        const citiesEl = document.getElementById('stats-cities');
        citiesEl.innerHTML = topCities.map(([city, n]) => {
            const pct = Math.round(n / maxCity * 100);
            return `<div class="stats-bar-row">
                <span class="bar-label">${city}</span>
                <div class="bar-track"><div class="bar-fill" style="width:${pct}%;background:var(--red)"></div></div>
                <span class="bar-count">${n}</span>
            </div>`;
        }).join('') || '<div class="stats-empty">אין נתונים</div>';

        // --- Hourly chart (last 24h, 1h buckets) ---
        const buckets = Array(24).fill(0);
        const nowH = new Date().getHours();
        h24alerts.forEach(a => {
            const hoursAgo = Math.floor((now - a.ts) / 3600000);
            if (hoursAgo >= 0 && hoursAgo < 24) buckets[23 - hoursAgo]++;
        });
        const maxB = Math.max(...buckets, 1);
        const hours = Array.from({ length: 24 }, (_, i) => {
            const h = (nowH - 23 + i + 24) % 24;
            return (i % 4 === 0) ? String(h).padStart(2, '0') + ':00' : '';
        });
        document.getElementById('stats-chart').innerHTML = `<div class="chart-bars">${
            buckets.map((v, i) => `<div class="chart-col">
                <div class="chart-bar-wrap"><div class="chart-bar-fill" style="height:${Math.round(v / maxB * 100)}%"></div></div>
                <div class="chart-label">${hours[i]}</div>
            </div>`).join('')
        }</div>`;

        // re-attach body
        const body = document.getElementById('stats-body');
        if (body.classList.contains('stats-loading')) {
            body.classList.remove('stats-loading');
        }
    }

    function peakHour(alerts) {
        if (!alerts.length) return 0;
        const buckets = {};
        alerts.forEach(a => {
            const h = new Date(a.ts).getHours();
            buckets[h] = (buckets[h] || 0) + 1;
        });
        return Math.max(...Object.values(buckets));
    }

    function autoConflictTitle(alerts) {
        if (!alerts.length) return 'מערכת EITAN';
        const first = new Date(Math.min(...alerts.map(a => a.ts)));
        const last = new Date(Math.max(...alerts.map(a => a.ts)));
        const fmt = d => d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
        return `מבצע / מצב חירום — ${fmt(first)} – ${fmt(last)}`;
    }

    /* ---- ballistic trajectory animation (pre-warn → first impacted city) ---- */
    // Called from reports.js when a prewarn city is identified; draws an arc on the Leaflet map.
    window.EITAN_drawTrajectory = function (targetCity, threatCode) {
        const coords = E.getCity(targetCity);
        if (!coords) return;
        const origin = CONFIG.estimateOrigin(coords.lat, coords.lng);
        const target = [coords.lat, coords.lng];

        // Create an SVG arc overlay via a Leaflet polyline with many points (great-circle approximation)
        const steps = 32;
        const pts = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const lat = origin[0] + (target[0] - origin[0]) * t;
            const lng = origin[1] + (target[1] - origin[1]) * t;
            // parabolic lift: max at t=0.5
            const arc = 3.5 * Math.sin(Math.PI * t);
            pts.push([lat + arc * 0.3, lng]);
        }

        const arc = L.polyline(pts, {
            color: '#ff3b3b', weight: 2, opacity: 0,
            dashArray: '6 5', className: 'traj-arc'
        }).addTo(E.map);

        // fade in → then fade out when the city's alert fires or after 90s
        let op = 0;
        const fadeIn = setInterval(() => {
            op = Math.min(op + 0.08, 0.85);
            arc.setStyle({ opacity: op });
            if (op >= 0.85) clearInterval(fadeIn);
        }, 60);

        const cleanup = setTimeout(() => {
            let o2 = 0.85;
            const fo = setInterval(() => {
                o2 -= 0.08;
                if (o2 <= 0) { clearInterval(fo); if (E.map.hasLayer(arc)) E.map.removeLayer(arc); }
                else arc.setStyle({ opacity: o2 });
            }, 60);
        }, CONFIG.TIMING.ACTIVE_MS); // remove when city alert would expire

        return () => { clearTimeout(cleanup); if (E.map.hasLayer(arc)) E.map.removeLayer(arc); };
    };

})();
