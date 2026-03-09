// --- 1. אתחול המפה ---
const map = L.map('map').setView([31.5, 34.8], 8); // מרכז ישראל

L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: ''
}).addTo(map);

// כפתור התמקדות מחדש בישראל
const HomeControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd: function (map) {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control');
        const button = L.DomUtil.create('a', 'custom-home-btn', container);
        button.innerHTML = '<i class="fas fa-crosshairs"></i>';
        button.href = '#';
        button.title = 'מרכז על ישראל';

        button.onclick = function (e) {
            e.preventDefault();
            map.flyTo([31.5, 34.8], 8);
        }
        return container;
    }
});
map.addControl(new HomeControl());

const markers = {}; // שומר מרקרים כדי שלא נצייר אותם פעמיים
const activeMarkers = {}; // Markers currently on map: {cityName: markerObject}
let historyAlerts = [];

// שלוחת חיפוש מיקומים
const FALLBACK_CITIES = {
    "תל אביב - יפו": { lat: 32.0853, lng: 34.7818 },
    "ירושלים": { lat: 31.7683, lng: 35.2137 },
    "חיפה": { lat: 32.7940, lng: 34.9896 },
    "באר שבע": { lat: 31.2529, lng: 34.7915 },
    "אשדוד": { lat: 31.8044, lng: 34.6553 },
    "שדרות": { lat: 31.5204, lng: 34.5912 },
    "אשקלון": { lat: 31.6667, lng: 34.5667 },
    "נתיבות": { lat: 31.4222, lng: 34.5958 },
    "קרית שמונה": { lat: 33.2075, lng: 35.5700 },
    "אילת": { lat: 29.5577, lng: 34.9519 }
};

let cityData = FALLBACK_CITIES; // Start with fallback

async function fetchWithProxy(targetUrl) {
    const proxies = [
        (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        (url) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&cache=${Date.now()}`
    ];

    for (const proxyGen of proxies) {
        try {
            const proxyUrl = proxyGen(targetUrl);
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error("Proxy error");

            const data = await response.json();
            // allorigins wraps content in .contents, corsproxy returns raw
            return data.contents ? JSON.parse(data.contents) : data;
        } catch (e) {
            console.warn(`Proxy failed for ${targetUrl}, trying next...`);
        }
    }
    throw new Error("All proxies failed");
}

async function loadCities() {
    try {
        const targetUrl = "https://www.tzevaadom.co.il/static/cities.json?v=";
        const content = await fetchWithProxy(targetUrl);

        // Merge fallback with online data if successful
        cityData = { ...FALLBACK_CITIES, ...content.cities };
        console.log("נתוני ערים נטענו בהצלחה מהאינטרנט");
    } catch (e) {
        console.warn("שגיאה בטעינת נתונים מהאינטרנט (CORS/Proxy Error). משתמש בנתוני גיבוי (Fallback).", e);
    }
}

loadCities();

// --- 2. לוגיקת ההתראות ---
let Alerts = [];
const alertsList = document.getElementById('alerts-list');

function handleRedAlert(cities, id, threatType = "צבע אדום", time = null) {
    const citiesArray = Array.isArray(cities) ? cities : [cities];
    const alertTime = time || new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    // פינוי מסך: אוטומציה לחלון שידורים מרחף (מצמיד אוטומטית אלא אם הוא חסום בנעילה 70%)
    const floatWin = document.getElementById('floating-channel-window');
    if (floatWin && !floatWin.classList.contains('hidden')) {
        if (!floatWin.classList.contains('locked')) {
            floatWin.classList.add('pinned');
        }
    }

    // --- בדיקת התראה אישית (Target City) ---
    const targetCity = localStorage.getItem('targetCity');
    if (targetCity && citiesArray.includes(targetCity)) {
        triggerPersonalAlert(targetCity);
    }

    // שינוי רקע
    document.body.style.setProperty('--background-color', 'var(--alert-color)');

    const cityCoords = [];

    // Handle UI Grouping
    const alertTimeObj = {
        id,
        cities: citiesArray,
        time: alertTime,
        type: threatType,
        timestamp: Date.now()
    };
    addAlertToUI(alertTimeObj, 'current');

    citiesArray.forEach(cityName => {
        // מניעת כפילויות של אותו מזהה ועיר באותו רגע
        if (!Alerts.some(a => a.id === id && a.title === cityName)) {
            Alerts.push({ id, title: cityName, time: alertTime, type: threatType, timestamp: Date.now() });
            console.log(`התראה חדשה: ${cityName} (${threatType})`);

            const coords = updateMap(cityName, 'current', threatType, alertTime);
            if (coords) cityCoords.push(coords);
        }
    });

    // הגדרת הזום בהתאם למספר אזורים שנמצאו
    if (cityCoords.length > 0) {
        if (cityCoords.length === 1) {
            map.flyTo(cityCoords[0], 12);
        } else {
            const bounds = L.latLngBounds(cityCoords);
            map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 12 });
        }
    }

    // החזרה למצב רגיל אחרי 60 שניות
    setTimeout(() => {
        document.body.style.setProperty('--background-color', '#121212');
        checkAndResetCamera();
    }, 60000);
}

function checkAndResetCamera() {
    // If no active markers remain on map, zoom out to Israel view
    if (Object.keys(activeMarkers).length === 0) {
        console.log("מנקה מבט: חוזר לתצוגת ישראל מלאה");
        map.flyTo([31.5, 34.8], 8);
    }
}

function triggerPersonalAlert(cityName) {
    const popup = document.getElementById('personal-alert-popup');
    const cityNameSpan = document.getElementById('personal-alert-city-name');
    const closeBtn = document.getElementById('close-personal-alert');

    if (popup && cityNameSpan) {
        cityNameSpan.innerText = cityName;
        popup.classList.remove('hidden');

        // הבהוב מסך (Strobe)
        document.body.classList.add('emergency-strobe');
        setTimeout(() => {
            document.body.classList.remove('emergency-strobe');
        }, 10000); // 10 שניות של הבהוב

        // הפעלת טיימר אוטומטית
        if (window.triggerEmergencyTimer) {
            window.triggerEmergencyTimer();
        }

        closeBtn.onclick = () => {
            popup.classList.add('hidden');
        };
    }
}

// פונקציות סימולציה מיוצאות לחלון הגלובלי (לעבודה מול פאנל ההגדרות)
window.simulateAlert = function () {
    const mockCities = ["תל אביב - יפו", "חיפה", "באר שבע", "ירושלים", "אשדוד", "שדרות", "אשקלון"];
    const target = localStorage.getItem('targetCity') || mockCities[Math.floor(Math.random() * mockCities.length)];
    const threatCode = Math.floor(Math.random() * 3); // 0, 1, or 2
    const threatName = getThreatName(threatCode);

    console.warn("מפעיל סימולציה עבור: " + target + " סוג: " + threatName);
    handleRedAlert([target], "test-" + Date.now(), threatName);
};

window.simulateMultiAlert = function () {
    handleRedAlert(["שדרות", "נתיבות"], "test-multi-1-" + Date.now(), getThreatName(0));
    setTimeout(() => {
        handleRedAlert(["אשקלון", "זיקים"], "test-multi-2-" + Date.now(), getThreatName(0));
    }, 2000);
};

function addAlertToUI(alert, section = 'current') {
    const alertsList = document.getElementById('alerts-list');
    if (!alertsList) return;

    // Check if sections exist, if not create them
    let currentSection = document.getElementById('section-current');
    let historySection = document.getElementById('section-history');

    if (!currentSection) {
        alertsList.innerHTML = "";
        const curTitle = document.createElement('div');
        curTitle.className = 'alerts-section-title';
        curTitle.innerText = 'התראות פעילות';
        alertsList.appendChild(curTitle);
        currentSection = document.createElement('div');
        currentSection.id = 'section-current';
        alertsList.appendChild(currentSection);

        const histTitle = document.createElement('div');
        histTitle.className = 'alerts-section-title';
        histTitle.innerText = 'התראות בשעה האחרונה';
        alertsList.appendChild(histTitle);
        historySection = document.createElement('div');
        historySection.id = 'section-history';
        alertsList.appendChild(historySection);
    }

    const container = section === 'current' ? currentSection : historySection;
    const citiesStr = Array.isArray(alert.cities) ? alert.cities.join(', ') : alert.title;

    // --- Grouping Logic (3 mins) ---
    const recentCard = Array.from(container.children).find(card => {
        const cardTime = parseInt(card.dataset.timestamp);
        const cardType = card.dataset.type;
        return cardType === alert.type && Math.abs(alert.timestamp - cardTime) < 180000;
    });

    if (recentCard) {
        const titleEl = recentCard.querySelector('.alert-title');
        const currentCities = titleEl.innerText.split(', ');
        const newCities = Array.isArray(alert.cities) ? alert.cities : [alert.title];

        let updated = false;
        newCities.forEach(c => {
            if (!currentCities.includes(c)) {
                currentCities.push(c);
                updated = true;
            }
        });

        if (updated) {
            titleEl.innerText = currentCities.join(', ');
        }
        return;
    }

    const div = document.createElement('div');
    div.className = `alert-card ${section === 'history' ? 'history' : ''}`;
    div.dataset.timestamp = alert.timestamp;
    div.dataset.type = alert.type;
    div.innerHTML = `
        <div class="alert-header">
            <div class="alert-title">${citiesStr}</div>
            <div class="alert-time">${alert.time}</div>
        </div>
        <div class="alert-type">${alert.type}</div>
    `;

    container.prepend(div);

    if (section === 'current') {
        // Move to history after 60 seconds
        setTimeout(() => {
            if (currentSection.contains(div)) {
                currentSection.removeChild(div);
                div.classList.add('history');
                historySection.prepend(div);
                // Grouping check again for the history section could be complex, 
                // but usually the cards just move as they are.
                if (historySection.children.length > 50) {
                    historySection.removeChild(historySection.lastChild);
                }
            }
        }, 60000);
    }
}

// פונקציית עזר לריענון הרשימה כשעוברים ל-Mode 4
window.renderAllAlerts = function () {
    const alertsList = document.getElementById('alerts-list');
    if (!alertsList) return;

    alertsList.innerHTML = "";
    if (Alerts.length === 0 && historyAlerts.length === 0) {
        alertsList.innerHTML = '<p style="text-align: center; color: #666;">אין התראות כעת</p>';
        return;
    }

    // This will trigger the section creation and population
    [...historyAlerts].forEach(a => addAlertToUI(a, 'history'));
    [...Alerts].forEach(a => addAlertToUI(a, 'current'));
};

function updateMap(cityName, type = 'current', threatType = "צבע אדום", time = "") {
    if (!cityData) return null;

    let cityInfo = cityData[cityName];
    if (!cityInfo) {
        const cityArray = Array.isArray(cityData) ? cityData : Object.values(cityData);
        cityInfo = cityArray.find(c => c.name === cityName || c.label === cityName || c.he === cityName);
    }

    if (!cityInfo || !cityInfo.lat || !cityInfo.lng) return null;

    const coords = [cityInfo.lat, cityInfo.lng];

    // Grouping Logic: Check if there's already an active marker for this city
    if (type === 'current' && activeMarkers[cityName]) {
        const existingMarker = activeMarkers[cityName];
        const currentPopup = existingMarker.getPopup().getContent();
        if (!currentPopup.includes(threatType)) {
            existingMarker.setPopupContent(`${currentPopup}<br>${threatType} (${time})`);
        }
        return coords;
    }

    if (type === 'history') {
        addHistoryMarker(coords, cityName, threatType, time);
        return coords;
    }

    // Current Alert Marker (Active)
    const pulseIcon = L.divIcon({
        className: 'custom-div-icon',
        html: `<div class='alert-marker'></div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12]
    });

    try {
        const marker = L.marker(coords, { icon: pulseIcon }).addTo(map);
        marker.bindPopup(`<b>${threatType}: ${cityName}</b><br>${time}`).openPopup();

        if (type === 'current') {
            activeMarkers[cityName] = marker;
            // Remove after 60 seconds and potentially turn to history marker
            setTimeout(() => {
                if (map.hasLayer(marker)) {
                    map.removeLayer(marker);
                    delete activeMarkers[cityName];
                    // Create a subtle history marker
                    addHistoryMarker(coords, cityName, threatType, time);
                    checkAndResetCamera();
                }
            }, 60000);
        }

        return coords;
    } catch (err) {
        console.error(`DEBUG: [MAP ERROR] ${err.message}`);
        return null;
    }
}

function addHistoryMarker(coords, cityName, threatType, time) {
    const hCircle = L.circle(coords, {
        radius: 4000, // 4km larger area
        fillColor: '#3052e7ff',
        color: 'transparent',
        weight: 0,
        fillOpacity: 0.08, // Very faded
        interactive: true
    }).addTo(map);

    hCircle.bindPopup(`<b>היסטוריה: ${threatType}</b><br>${cityName}<br>${time}`);

    hCircle.on('mouseover', function () {
        this.setStyle({ fillOpacity: 0.3 });
    });
    hCircle.on('mouseout', function () {
        this.setStyle({ fillOpacity: 0.08 });
    });

    // History markers fade out after 10 minutes
    setTimeout(() => {
        if (map.hasLayer(hCircle)) map.removeLayer(hCircle);
    }, 600000);
}

// --- 3. משיכת נתונים מה-API ---
async function fetchAlerts() {
    try {
        const targetUrl = "https://api.tzevaadom.co.il/notifications";
        const content = await fetchWithProxy(targetUrl);

        if (Array.isArray(content) && content.length > 0) {
            content.forEach(alert => {
                handleRedAlert(alert.cities, alert.notificationId, alert.threatType || "צבע אדום");
            });
        }
    } catch (e) {
        // Silent
    }
    setTimeout(fetchAlerts, 2000);
}

function getThreatName(code) {
    const threats = {
        0: "ירי רקטות וטילים",
        1: "חדירת כלי טיס עויין",
        2: "חדירת מחבלים",
        3: "רעידת אדמה",
        4: "אירוע רדיולוגי",
        5: "אירוע חומרים מסוכנים",
        6: "צונאמי",
        7: "אירוע בטחוני"
    };
    return threats[code] || "התראה";
}

async function fetchHistory() {
    try {
        const targetUrl = "https://api.tzevaadom.co.il/alerts-history/?";
        const groupList = await fetchWithProxy(targetUrl);

        if (Array.isArray(groupList)) {
            const nowSeconds = Math.floor(Date.now() / 1000);
            const oneHourAgo = nowSeconds - 3600;

            // Sort groups so we process older groups first, then prepend their alerts (which results in newest at top)
            // But actually, the API usually returns newest first. 
            // Let's just process them and rely on 'historyAlerts' check.
            groupList.forEach(group => {
                if (!group.alerts || !Array.isArray(group.alerts)) return;

                group.alerts.forEach((item, index) => {
                    if (item.time < oneHourAgo) return; // Only last hour

                    const alertDate = new Date(item.time * 1000);
                    const timeStr = alertDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
                    const threatName = getThreatName(item.threat);

                    // Pre-group UI call for history from API
                    addAlertToUI({
                        cities: item.cities,
                        time: timeStr,
                        type: threatName,
                        timestamp: item.time * 1000
                    }, 'history');

                    item.cities.forEach(cityName => {
                        const uniqueId = `hist-${group.id}-${index}-${cityName}`;

                        if (!historyAlerts.some(a => a.id === uniqueId)) {
                            const alertObj = {
                                id: uniqueId,
                                title: cityName,
                                time: timeStr,
                                type: threatName,
                                timestamp: item.time * 1000
                            };
                            historyAlerts.push(alertObj);

                            // subtle marker on map for history
                            updateMap(cityName, 'history', threatName, timeStr);
                        }
                    });
                });
            });
        }
    } catch (e) {
        console.error("History fetch error:", e);
    }
}

// פונקציית בדיקה כפויה של המפה (עוקף את כל הלוגיקה של הערים)
window.forceMapMarker = function () {
    const telAviv = [32.0853, 34.7818];
    console.warn("מפעיל סימון כפוי על המפה במיקום תל אביב");

    map.flyTo(telAviv, 13);

    const pulseIcon = L.divIcon({
        className: 'custom-div-icon',
        html: "<div class='alert-marker' style='width: 30px; height: 30px; border: 4px solid white;'></div>",
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    const marker = L.marker(telAviv, { icon: pulseIcon }).addTo(map);
    marker.bindPopup(`<b>בדיקת מערכת: סימון כפוי עובד</b>`).openPopup();

    alert("בוצע סימון כפוי של תל אביב על המפה. אם אתה רואה עיגול אדום גדול עם מסגרת לבנה, המפה עובדת תקין.");
};

// Start the polling
loadCities();
fetchAlerts();
fetchHistory();
setInterval(fetchHistory, 300000); // Refresh history every 5 minutes