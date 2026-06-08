/* ==========================================================================
 * EITAN — Central Configuration  (global: window.CONFIG)
 * Loaded first, before all other scripts. No build step, no API keys.
 * ========================================================================== */

window.CONFIG = (function () {
    "use strict";

    /* ---- Version & map defaults ---------------------------------------- */
    const VERSION = "2.0";
    const MAP_CENTER = [31.5, 34.8];   // Center of Israel
    const MAP_ZOOM = 8;

    /* ---- Timings (ms) -------------------------------------------------- */
    const TIMING = {
        ACTIVE_MS: 90000,          // a city stays "active" for 1.5 min
        HISTORY_FADE_MS: 3600000,  // history marker visible for 1 hour
        HISTORY_WINDOW_MS: 3600000,// "last hour" cut-off for the history list
        PREWARN_MS: 300000,        // orange pre-warning lasts up to 5 min
        REST_POLL_MS: 4000,        // REST fallback poll interval
        HISTORY_POLL_MS: 300000,   // refresh history every 5 min
        WS_RETRY_MIN_MS: 2000,     // websocket reconnect backoff (min)
        WS_RETRY_MAX_MS: 30000,    // websocket reconnect backoff (max)
        WS_FALLBACK_MS: 8000       // if no socket within this window -> REST
    };

    /* ---- Endpoints ----------------------------------------------------- */
    const ENDPOINTS = {
        // Real-time websocket (verified from ZeEitan/TzevaAdom source).
        WS: "wss://ws.tzevaadom.co.il:8443/socket?platform=WEB",
        NOTIFICATIONS: "https://www.tzevaadom.co.il/api/notifications",
        NOTIFICATIONS_ALT: "https://api.tzevaadom.co.il/notifications",
        HISTORY: "https://api.tzevaadom.co.il/alerts-history/?",
        CITIES: "https://www.tzevaadom.co.il/static/cities.json?v=",
        CITIES_LOCAL: "cities.json"
    };

    /* ---- CORS proxies (rotated, with memory of the last good one) ------- */
    // Each entry: { wrap(url) -> proxiedUrl, unwrap(json|text) -> data }
    const PROXIES = [
        {
            name: "allorigins",
            wrap: (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&_=${Date.now()}`,
            unwrap: (raw) => (typeof raw === "string" ? JSON.parse(raw) : (raw.contents ? JSON.parse(raw.contents) : raw))
        },
        {
            name: "corsproxy",
            wrap: (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
            unwrap: (raw) => (typeof raw === "string" ? JSON.parse(raw) : raw)
        },
        {
            name: "codetabs",
            wrap: (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
            unwrap: (raw) => (typeof raw === "string" ? JSON.parse(raw) : raw)
        }
    ];

    // Proxies that return the raw body as text (for Telegram HTML / RSS XML).
    // cors.lol is first: it's the one that currently reaches t.me with CORS *.
    const TEXT_PROXIES = [
        { name: "cors.lol", wrap: (url) => `https://api.cors.lol/?url=${encodeURIComponent(url)}` },
        { name: "codetabs", wrap: (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}` },
        { name: "allorigins-raw", wrap: (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}&_=${Date.now()}` },
        { name: "corsproxy", wrap: (url) => `https://corsproxy.io/?url=${encodeURIComponent(url)}` }
    ];

    /* ---- Threat types -------------------------------------------------- */
    // Maps the numeric "threat" code from the API to display metadata.
    const THREATS = {
        0: { name: "ירי רקטות וטילים", icon: "fa-rocket", color: "#ff3b3b", personal: true },
        1: { name: "חדירת כלי טיס עוין", icon: "fa-helicopter", color: "#ff8c00", personal: true },
        2: { name: "חדירת מחבלים", icon: "fa-person-rifle", color: "#b14cff", personal: true },
        3: { name: "רעידת אדמה", icon: "fa-house-crack", color: "#caa24a", personal: false },
        4: { name: "אירוע רדיולוגי", icon: "fa-radiation", color: "#39ff14", personal: true },
        5: { name: "חומרים מסוכנים", icon: "fa-skull-crossbones", color: "#7CFC00", personal: false },
        6: { name: "צונאמי", icon: "fa-water", color: "#1da1f2", personal: true },
        7: { name: "אירוע ביטחוני", icon: "fa-triangle-exclamation", color: "#ff3b3b", personal: false }
    };
    function threatMeta(code) {
        return THREATS[code] || { name: "התרעה", icon: "fa-triangle-exclamation", color: "#ff3b3b", personal: false };
    }

    /* ---- Reports / Telegram (Phase 2) ---------------------------------- */
    const TELEGRAM = {
        channel: "PikudHaOref_all",          // official Home Front Command channel
        url: "https://t.me/s/PikudHaOref_all",
        poll_ms: 18000
    };

    /* ---- News sources (Phase 2) -------------------------------------------
     * Each source has a direct RSS URL. The fetcher tries direct first
     * (works when browser doesn't enforce CORS, e.g. GitHub Pages with
     * liberal headers or certain browsers), then falls back to rss2json.com
     * which has CORS: * and converts RSS → JSON for free (no key needed).  */
    const NEWS_SOURCES = [
        { id: "n12",    name: "N12",        rss: "https://rcs.mako.co.il/rss/news-israel.xml",               lang: "he" },
        { id: "n12mil", name: "N12 ביטחון", rss: "https://rcs.mako.co.il/rss/news-military.xml",             lang: "he" },
        { id: "walla",  name: "וואלה",       rss: "https://rss.walla.co.il/feed/1?type=main",                  lang: "he" },
        { id: "ynet",   name: "ynet",        rss: "https://www.ynet.co.il/Integration/StoryRss2.xml",          lang: "he" },
        { id: "cnn",    name: "CNN",         rss: "https://rss.cnn.com/rss/edition_world.rss",                  lang: "en" },
        { id: "jpost",  name: "JPost",       rss: "https://www.jpost.com/rss/rssfeedsfrontpage.aspx",           lang: "en" }
    ];
    const RSS2JSON = (url) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;

    /* ---- Map: base & overlay tile providers ---------------------------- */
    const TILES = {
        dark: {
            url: "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
            opts: { maxZoom: 19, attribution: "© CARTO" }
        },
        satellite: {
            url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
            opts: { maxZoom: 19, attribution: "© Esri" }
        }
    };

    /* ---- Enemy regions: dim-red fill + estimated launch origins --------
     * Used for the stats map shading and (Phase 2) estimated trajectories.
     * `origin` is an approximate point used only for the *estimated* arc. */
    const ENEMY = {
        countries: ["Iran", "Lebanon", "Syria", "Yemen", "Iraq"],
        origins: {
            Lebanon: [33.85, 35.50],
            Syria: [33.51, 36.30],
            Iran: [32.50, 53.50],
            Iraq: [33.30, 44.40],
            Yemen: [15.35, 44.20]
        },
        // Lightweight (~250KB) world borders; country name in properties.name
        geojson: "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json"
    };
    // Rough heuristic: map an Israeli latitude to the most likely origin.
    function estimateOrigin(lat, lng) {
        if (lat >= 32.6) return ENEMY.origins.Lebanon;   // North
        if (lat <= 30.0) return ENEMY.origins.Yemen;     // Deep south (long range)
        if (lng >= 35.2) return ENEMY.origins.Iran;      // East / long range
        return ENEMY.origins.Lebanon;
    }

    /* ---- Flights (airplanes.live — free, no key, sends CORS *) ---------
     * adsb.lol / adsb.fi return data but WITHOUT a CORS header, so the
     * browser blocks them. airplanes.live sends `access-control-allow-origin: *`. */
    const FLIGHTS = {
        api: (lat, lng, distNm) => `https://api.airplanes.live/v2/point/${lat.toFixed(3)}/${lng.toFixed(3)}/${distNm}`,
        poll_ms: 9000,
        max_dist_nm: 250,   // airplanes.live caps radius at 250 nm
        stale_cycles: 3     // drop a plane after this many missed updates
    };

    /* ---- Fallback cities (used until cities.json loads) ----------------- */
    const FALLBACK_CITIES = {
        "תל אביב - יפו": { lat: 32.0853, lng: 34.7818, countdown: 90 },
        "ירושלים": { lat: 31.7683, lng: 35.2137, countdown: 90 },
        "חיפה": { lat: 32.7940, lng: 34.9896, countdown: 60 },
        "באר שבע": { lat: 31.2529, lng: 34.7915, countdown: 60 },
        "אשדוד": { lat: 31.8044, lng: 34.6553, countdown: 45 },
        "שדרות": { lat: 31.5204, lng: 34.5912, countdown: 15 },
        "אשקלון": { lat: 31.6667, lng: 34.5667, countdown: 30 },
        "נתיבות": { lat: 31.4222, lng: 34.5958, countdown: 15 },
        "קרית שמונה": { lat: 33.2075, lng: 35.5700, countdown: 15 },
        "אילת": { lat: 29.5577, lng: 34.9519, countdown: 90 }
    };

    return {
        VERSION, MAP_CENTER, MAP_ZOOM, TIMING, ENDPOINTS, PROXIES, TEXT_PROXIES,
        THREATS, threatMeta, TELEGRAM, NEWS_SOURCES, TILES, ENEMY, estimateOrigin,
        FLIGHTS, FALLBACK_CITIES
    };
})();
