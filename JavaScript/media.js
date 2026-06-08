// DATETIME:

function doDate() {
    var now = new Date();

    var year = now.getFullYear();
    var month = String(now.getMonth() + 1).padStart(2, '0');
    var day = String(now.getDate()).padStart(2, '0');

    var hours = String(now.getHours()).padStart(2, '0');
    var minutes = String(now.getMinutes()).padStart(2, '0');
    var seconds = String(now.getSeconds()).padStart(2, '0');

    var str = day + "/" + month + "/" + year + " " + hours + ":" + minutes + ":" + seconds;

    document.querySelector(".datetime").innerHTML = str;
}

setInterval(doDate, 1000);

//---------------------------------------------------
// SIDE PANEL:

const sidePanel = document.getElementById('side-panel');
const toggleSideBtn = document.getElementById('toggle-side-btn');
const sideBox = document.getElementById('sideBox');
const title = document.getElementById('title');
const modeBtn1 = document.getElementById('mode-btn-1');
const modeBtn2 = document.getElementById('mode-btn-2');
const modeBtn3 = document.getElementById('mode-btn-3');
const modeBtn4 = document.getElementById('mode-btn-4');

document.getElementById('toggle-side-btn').addEventListener('click', function () {
    const panel = document.getElementById('side-panel');
    const icon = this.querySelector('i');

    panel.classList.toggle('collapsed');

    // Toggle icon rotation or change
    if (panel.classList.contains('collapsed')) {
        icon.classList.replace('fa-chevron-right', 'fa-chevron-left');
    } else {
        icon.classList.replace('fa-chevron-left', 'fa-chevron-right');
    }

    // Fix for Leaflet map size - triggering resize events during the 0.3s CSS transition
    let start = Date.now();
    let timer = setInterval(function () {
        window.dispatchEvent(new Event('resize'));
        if (Date.now() - start > 400) {
            clearInterval(timer);
        }
    }, 1000 / 60);
});
// Mode selector logic
const modeBtns = document.querySelectorAll('.mode-btn');
modeBtns.forEach(btn => {
    btn.addEventListener('click', function () {
        modeBtns.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
    });
});

modeBtn1.addEventListener('click', function () {
    sideBox.innerHTML = `<div class="alerts-container" id="alerts-list"></div>`;
    title.innerHTML = "מערכת התראות";
    if (window.renderAllAlerts) window.renderAllAlerts();
});

modeBtn2.addEventListener('click', function () {
    sideBox.innerHTML = "<iframe src='https://www.tzevaadom.co.il/' width='100%' height='100%' frameborder='0'></iframe>";
    title.innerHTML = "מערכת צופר";
});

modeBtn3.addEventListener('click', function () {
    sideBox.innerHTML = "<iframe src='https://hamal.co.il/main' width='100%' height='100%' frameborder='0'></iframe>";
    title.innerHTML = `חמ"ל`;
});

modeBtn4.addEventListener('click', function () {
    renderSettings();
    title.innerHTML = "הגדרות מערכת";
});

function renderSettings() {
    const targetCity = localStorage.getItem('targetCity') || "";
    const hMargin = localStorage.getItem('hMargin') || "0";
    const vMargin = localStorage.getItem('vMargin') || "0";
    const brightness = localStorage.getItem('brightness') || "100";
    const soundEnabled = localStorage.getItem('soundEnabled') === "1";
    const conflictName = localStorage.getItem('conflictName') || "";

    sideBox.innerHTML = `
        <div class="settings-container">
            <div class="settings-section">
                <h3><i class="fas fa-desktop"></i> הגדרות מסך</h3>
                <div class="setting-row">
                    <label>שוליים אופקיים (PX)</label>
                    <input type="range" id="h-margin-slider" min="0" max="100" value="${hMargin}">
                </div>
                <div class="setting-row">
                    <label>שוליים אנכיים (PX)</label>
                    <input type="range" id="v-margin-slider" min="0" max="100" value="${vMargin}">
                </div>
                <div class="setting-row">
                    <label>בהירות מסך</label>
                    <input type="range" id="brightness-slider" min="50" max="150" value="${brightness}">
                </div>
            </div>

            <div class="settings-section">
                <h3><i class="fas fa-map-marker-alt"></i> התראות ממוקדות</h3>
                <div class="setting-row">
                    <label>אזור נוכחי למעקב (התראה אישית)</label>
                    <input type="text" id="target-city-input" value="${targetCity}" placeholder="הכנס שם עיר/אזור...">
                    <button class="settings-btn" id="save-target-btn">שמור מיקום</button>
                </div>
            </div>

            <div class="settings-section">
                <h3><i class="fas fa-bell"></i> חירום וסאונד</h3>
                <div class="setting-row">
                    <label style="display:flex;align-items:center;gap:10px;cursor:pointer;">
                        <input type="checkbox" id="sound-toggle" ${soundEnabled ? 'checked' : ''}
                            style="width:16px;height:16px;accent-color:var(--cyan);"> צליל אזעקה + התראות דפדפן
                    </label>
                </div>
                <div class="setting-row">
                    <label>שם העימות הנוכחי (מוצג במסך הסטטיסטיקות)</label>
                    <input type="text" id="conflict-name-input" value="${conflictName}" placeholder="לדוגמה: מבצע / מצב חירום...">
                    <button class="settings-btn" id="save-conflict-btn">שמור</button>
                </div>
            </div>

            <div class="settings-section">
                <h3><i class="fas fa-circle-info"></i> מצב מערכת</h3>
                <div class="setting-row" style="font-size: 13px; color: var(--text-dim);">
                    <div>גרסת מערכת: <span style="color: var(--cyan);">${CONFIG.VERSION}</span></div>
                    <div>זמן ריצה רציף: <span id="uptime-display" style="color: var(--cyan);">00:00:00</span></div>
                    <div>מקור נתונים: <span style="color: var(--cyan);">Tzeva Adom (WebSocket + REST)</span></div>
                    <div style="font-size: 10px; margin-top: 10px; color: var(--text-faint); text-align: left;">By OMER HACKMON</div>
                </div>
            </div>

            <div class="settings-section">
                <h3><i class="fas fa-vial"></i> סימולציה ובדיקה</h3>
                <button class="settings-btn btn-test" id="test-alert-btn">הפעל התראת בדיקה</button>
                <button class="settings-btn" id="test-multi-btn" style="margin-top: 10px;">סימולציית ריבוי אזורים</button>
                <button class="settings-btn" id="fix-map-btn" style="margin-top: 10px;">בדוק סימון מפה</button>
                <button class="settings-btn" id="replay-btn" style="margin-top: 10px;"><i class="fas fa-rotate-left"></i> ▶ הפעל ריפליי (שעה אחרונה)</button>
            </div>
        </div>
    `;

    // Uptime counter logic
    if (!window.uptimeStarted) {
        window.uptimeStarted = Date.now();
        setInterval(() => {
            const upSpan = document.getElementById('uptime-display');
            if (upSpan) {
                const diff = Math.floor((Date.now() - window.uptimeStarted) / 1000);
                const h = String(Math.floor(diff / 3600)).padStart(2, '0');
                const m = String(Math.floor((diff % 3600) / 60)).padStart(2, '0');
                const s = String(diff % 60).padStart(2, '0');
                upSpan.innerText = `${h}:${m}:${s}`;
            }
        }, 1000);
    }

    // Listeners for settings
    const hSlider = document.getElementById('h-margin-slider');
    const vSlider = document.getElementById('v-margin-slider');
    const bSlider = document.getElementById('brightness-slider');
    const cityInput = document.getElementById('target-city-input');
    const saveBtn = document.getElementById('save-target-btn');
    const testBtn = document.getElementById('test-alert-btn');
    hSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        document.body.style.setProperty('--screen-h-margin', `${val}px`);
        localStorage.setItem('hMargin', val);
    });

    vSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        document.body.style.setProperty('--screen-v-margin', `${val}px`);
        localStorage.setItem('vMargin', val);
    });

    bSlider.addEventListener('input', (e) => {
        const val = e.target.value;
        document.body.style.filter = `brightness(${val}%)`;
        localStorage.setItem('brightness', val);
    });

    saveBtn.addEventListener('click', () => {
        const city = cityInput.value.trim();
        localStorage.setItem('targetCity', city);
        alert(`מיקום ${city} נשמר במערכת.`);
    });

    testBtn.addEventListener('click', () => {
        if (typeof simulateAlert === 'function') simulateAlert();
        else alert('מערכת הסימולציה לא זמינה כרגע.');
    });

    const multiBtn = document.getElementById('test-multi-btn');
    if (multiBtn) multiBtn.addEventListener('click', () => {
        if (typeof simulateMultiAlert === 'function') simulateMultiAlert();
    });

    const replayBtn = document.getElementById('replay-btn');
    if (replayBtn) replayBtn.addEventListener('click', () => {
        if (window.replayHistory) window.replayHistory();
    });

    const fixMapBtnEl = document.getElementById('fix-map-btn');
    if (fixMapBtnEl) fixMapBtnEl.addEventListener('click', () => {
        if (window.forceMapMarker) window.forceMapMarker();
        else alert('פונקציית הבדיקה לא זמינה.');
    });

    const soundToggle = document.getElementById('sound-toggle');
    if (soundToggle) soundToggle.addEventListener('change', (e) => {
        localStorage.setItem('soundEnabled', e.target.checked ? "1" : "0");
        // Requesting notification permission requires a user gesture — do it here.
        if (e.target.checked && 'Notification' in window && Notification.permission === 'default') {
            Notification.requestPermission();
        }
    });

    const saveConflictBtn = document.getElementById('save-conflict-btn');
    if (saveConflictBtn) saveConflictBtn.addEventListener('click', () => {
        const name = document.getElementById('conflict-name-input').value.trim();
        localStorage.setItem('conflictName', name);
        alert('שם העימות נשמר.');
    });

    // Add a sound test button dynamically after the sound toggle row
    const soundSection = document.getElementById('sound-toggle');
    if (soundSection) {
        const testSoundBtn = document.createElement('button');
        testSoundBtn.className = 'settings-btn';
        testSoundBtn.style.marginTop = '8px';
        testSoundBtn.innerHTML = '<i class="fas fa-volume-high"></i> בדיקת סאונד';
        testSoundBtn.addEventListener('click', () => {
            if (window.EITAN_testSiren) window.EITAN_testSiren();
            else alert('סאונד לא זמין — ייתכן שהדפדפן חסם אוטו-פליי.');
        });
        soundSection.closest('.setting-row').appendChild(testSoundBtn);
    }

    // Apply existing
    applyScreenSettings();
}

//---------------------------------------------------
// TOP MENU CONTROLS & BOTTOM MENU:

// Stats modal button
const statsBtn = document.getElementById('stats-btn');
if (statsBtn) statsBtn.addEventListener('click', () => { if (window.openStatsModal) window.openStatsModal(); });

const mapOptionsBtn = document.getElementById('map-options-btn');
const mapOptionsMenu = document.getElementById('map-options-menu');
const channelsBtn = document.getElementById('channels-btn');
const channelsBottomMenu = document.getElementById('channels-bottom-menu');
const closeChannelsBtn = document.getElementById('close-channels-btn');

// Toggle Dropdown
mapOptionsBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    mapOptionsMenu.classList.toggle('show');
});

// Close Dropdown when clicking outside
window.addEventListener('click', function (e) {
    if (!mapOptionsBtn.contains(e.target) && !mapOptionsMenu.contains(e.target)) {
        mapOptionsMenu.classList.remove('show');
    }
});

// Toggle Bottom Channels Menu
channelsBtn.addEventListener('click', function () {
    channelsBottomMenu.classList.toggle('show');
});

// Close Bottom Channels Menu
closeChannelsBtn.addEventListener('click', function () {
    channelsBottomMenu.classList.remove('show');
});

// Toggle Sidebar adjustments for bottom menu
document.getElementById('toggle-side-btn').addEventListener('click', function () {
    document.body.classList.toggle('sidebar-collapsed');
});

// ---------- CHANNELS LOGIC ----------
const channelBtns = document.querySelectorAll('#channels-bottom-menu .channel-btn');
const customInputContainer = document.getElementById('custom-channel-input-container');
const playCustomBtn = document.getElementById('play-custom-channel-btn');
const customInput = document.getElementById('custom-channel-input');

if (channelBtns && channelBtns.length > 0) {
    channelBtns.forEach(btn => {
        btn.addEventListener('click', function () {
            // Remove active class from all
            channelBtns.forEach(b => b.classList.remove('active'));
            // Add active class to clicked
            this.classList.add('active');

            // Logic for specific button
            if (this.id === 'custom-channel-btn') {
                customInputContainer.style.display = 'block';
            } else {
                customInputContainer.style.display = 'none';

                // Open the channel based on URL data
                const channelId = this.getAttribute('data-url');
                let targetUrl = '';
                if (channelId === '11') targetUrl = 'https://www.kan.org.il/live/';
                else if (channelId === '12') targetUrl = 'https://www.mako.co.il/AjaxPage?jspName=embedHTML5video.jsp&galleryChannelId=3bf5c3a8e967f510VgnVCM2000002a0c10acRCRD&videoChannelId=8bf955222beab610VgnVCM100000700a10acRCRD&vcmid=1e2258089b67f510VgnVCM2000002a0c10acRCRD';
                else if (channelId === '13') targetUrl = 'https://13tv.co.il/live/';
                else if (channelId === '14') targetUrl = 'https://gurutv.online/ch14.html#google_vignette';
                else if (channelId === 'mamad') targetUrl = 'https://www.mako.co.il/news-channel2/Channel-2-Newscast-2025_q2/Article-c383fd9d2987791027.htm'; // פלייסהולדר לממד

                if (targetUrl) {
                    openFloatingChannel(targetUrl);
                    // סגירת תפריט ערוצים כשפותחים ערוץ
                    channelsBottomMenu.classList.remove('show');
                }
            }
        });
    });
}

if (playCustomBtn) {
    playCustomBtn.addEventListener('click', function () {
        const url = customInput.value.trim();
        if (url) {
            openFloatingChannel(url.startsWith('http') ? url : 'https://' + url);
            // סגירת תפריט ערוצים באתחול קישור מוזן
            channelsBottomMenu.classList.remove('show');
            customInput.value = ''; // ניקוי הקלט
        } else {
            alert('אנא הכנס קישור תקין.');
        }
    });
}

// ---------- FLOATING CHANNEL LOGIC ----------
const floatWindow = document.getElementById('floating-channel-window');
const floatHeader = document.getElementById('floating-channel-header');
const floatIframe = document.getElementById('floating-iframe');
const closeFloatBtn = document.getElementById('close-floating-btn');
const pinFloatBtn = document.getElementById('pin-channel-btn');
const lockFloatBtn = document.getElementById('lock-channel-btn');

function openFloatingChannel(url) {
    floatWindow.classList.remove('hidden');
    floatWindow.classList.remove('locked', 'pinned');
    floatIframe.src = url;

    // ממרכז את החלון במיקום נוח בתוך המפה בכל פתיחה מחדש
    floatWindow.style.top = '100px';
    floatWindow.style.left = '50px';
    floatWindow.style.width = '400px';
    floatWindow.style.height = '250px';
}

closeFloatBtn.addEventListener('click', () => {
    floatWindow.classList.add('hidden');
    floatIframe.src = ''; // עוצר שידור מתנגן בסטרימינג
});

pinFloatBtn.addEventListener('click', () => {
    if (floatWindow.classList.contains('pinned')) {
        floatWindow.classList.remove('pinned'); // שחרור בחזרה למרחף הפנוי
    } else {
        floatWindow.classList.add('pinned');
        floatWindow.classList.remove('locked');
    }
});

lockFloatBtn.addEventListener('click', () => {
    if (floatWindow.classList.contains('locked')) {
        floatWindow.classList.remove('locked'); // שחרר נעילה
    } else {
        floatWindow.classList.add('locked');
        floatWindow.classList.remove('pinned');
    }
});

// -- Drag functionality --
let isDragging = false;
let currentX;
let currentY;
let initialX;
let initialY;
let xOffset = 0;
let yOffset = 0;

floatHeader.addEventListener("mousedown", dragStart);
document.addEventListener("mouseup", dragEnd);
document.addEventListener("mousemove", drag);

function dragStart(e) {
    if (floatWindow.classList.contains('locked') || floatWindow.classList.contains('pinned')) return; // חוסם גרירה במצבים אלו השולטים במיקום
    if (e.target.closest('.float-btn')) return; // אל תגרור אם נלחץ כפתור שליטה

    // מוצא את המיקום היחסי הפנימי של ה-div לצורך תנועה חלקה
    const rect = floatWindow.getBoundingClientRect();
    xOffset = rect.left;
    yOffset = rect.top;

    initialX = e.clientX - xOffset;
    initialY = e.clientY - yOffset;

    isDragging = true;
}

function dragEnd() {
    initialX = currentX;
    initialY = currentY;
    isDragging = false;
}

function drag(e) {
    if (isDragging) {
        e.preventDefault();

        currentX = e.clientX - initialX;
        currentY = e.clientY - initialY;

        xOffset = currentX;
        yOffset = currentY;

        floatWindow.style.left = currentX + "px";
        floatWindow.style.top = currentY + "px";
    }
}

// ---------- TIMER LOGIC ----------
const timerBtn = document.getElementById('timer-btn');
const timerWidget = document.getElementById('floating-timer-widget');
const closeTimerBtn = document.getElementById('close-timer-btn');
const startPauseTimerBtn = document.getElementById('start-pause-timer-btn');
const resetTimerBtn = document.getElementById('reset-timer-btn');
const timerDisplay = document.getElementById('timer-display');

let timerInterval = null;
let timerSeconds = 600; // 10 minutes
let isTimerRunning = false;
let isCountingUp = false;

if (timerBtn) {
    timerBtn.addEventListener('click', () => {
        timerWidget.classList.toggle('hidden');
    });
}

if (closeTimerBtn) {
    closeTimerBtn.addEventListener('click', () => {
        timerWidget.classList.add('hidden');
    });
}

if (startPauseTimerBtn) {
    startPauseTimerBtn.addEventListener('click', () => {
        if (isTimerRunning) {
            pauseTimer();
        } else {
            startTimer();
        }
    });
}

if (resetTimerBtn) {
    resetTimerBtn.addEventListener('click', () => {
        resetTimer();
    });
}

function startTimer() {
    isTimerRunning = true;
    startPauseTimerBtn.innerHTML = `<i class="fas fa-pause"></i> השהה`;
    timerInterval = setInterval(() => {
        if (!isCountingUp) {
            timerSeconds--;
            if (timerSeconds <= 0) {
                isCountingUp = true;
                timerDisplay.classList.add('timer-warning');
            }
        } else {
            timerSeconds++;
        }
        updateTimerUI();
    }, 1000);
}

function pauseTimer() {
    isTimerRunning = false;
    startPauseTimerBtn.innerHTML = `<i class="fas fa-play"></i> הפעל`;
    clearInterval(timerInterval);
}

function resetTimer() {
    pauseTimer();
    timerSeconds = 600;
    isCountingUp = false;
    timerDisplay.classList.remove('timer-warning');
    updateTimerUI();
}

function updateTimerUI() {
    const minutes = Math.floor(Math.abs(timerSeconds) / 60);
    const seconds = Math.abs(timerSeconds) % 60;
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

    timerDisplay.innerText = timeStr;
    // Update header button text too
    if (timerBtn) {
        timerBtn.innerText = `טיימר: ${timeStr}`;
        if (isCountingUp) {
            timerBtn.style.color = "#ff4444";
            timerBtn.style.fontWeight = "bold";
        } else {
            timerBtn.style.color = "";
            timerBtn.style.fontWeight = "";
        }
    }
}

// Support for auto-timer from alerts
window.triggerEmergencyTimer = function () {
    resetTimer();
    timerWidget.classList.remove('hidden');
    startTimer();
};

// -- Timer Drag --
const timerHeader = document.getElementById('timer-header');
let timerIsDragging = false;
let tStartX, tStartY;

if (timerHeader) {
    timerHeader.addEventListener('mousedown', (e) => {
        timerIsDragging = true;
        tStartX = e.clientX - timerWidget.offsetLeft;
        tStartY = e.clientY - timerWidget.offsetTop;
    });

    document.addEventListener('mousemove', (e) => {
        if (timerIsDragging) {
            timerWidget.style.right = 'auto'; // Disable right-lock
            timerWidget.style.left = (e.clientX - tStartX) + 'px';
            timerWidget.style.top = (e.clientY - tStartY) + 'px';
        }
    });

    document.addEventListener('mouseup', () => {
        timerIsDragging = false;
    });
}

// ---------- PERSISTENT SETTINGS ----------
function applyScreenSettings() {
    const hMargin = localStorage.getItem('hMargin') || "0";
    const vMargin = localStorage.getItem('vMargin') || "0";
    const brightness = localStorage.getItem('brightness') || "100";

    document.body.style.setProperty('--screen-h-margin', `${hMargin}px`);
    document.body.style.setProperty('--screen-v-margin', `${vMargin}px`);
    document.body.style.filter = `brightness(${brightness}%)`;
}

// Initial application on load
applyScreenSettings();

// Register service worker (PWA)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {});
    });
}

