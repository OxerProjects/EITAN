/* ==========================================================================
 * EITAN — Reports Left Panel (Phase 2, rewritten)
 * Left-side drawer, openable from edge, resizable.
 * Tab 1: Telegram (PikudHaOref_all + custom channels) — full messages,
 *   pre-warn → orange map circles, all-clear → green circles + toast.
 * Tab 2: News RSS ticker + full list.
 * Top ticker bar: pinnable to header.
 * Toast: bottom-left corner, fires even when panel is closed.
 * ========================================================================== */

(function () {
    "use strict";
    const E = window.EITAN;
    if (!E) return;

    // Remove old drawer if it exists
    const old = document.getElementById('reports-drawer');
    if (old) old.remove();

    /* ---- Build left panel ---- */
    const savedWidth = Math.min(Math.max(parseInt(localStorage.getItem('repPanelWidth')) || 320, 200), 700);

    const panel = document.createElement('div');
    panel.id = 'reports-panel';
    panel.style.width = savedWidth + 'px';
    panel.innerHTML = `
        <div class="rep-inner">
            <div class="rep-header">
                <span class="rep-header-title">
                    <i class="fas fa-bolt" style="color:var(--amber)"></i> דיווחים ומבזקים
                </span>
                <div class="rep-header-acts">
                    <button id="rep-ch-toggle-btn" class="rep-hdr-btn" title="ניהול ערוצי טלגרם"><i class="fas fa-satellite-dish"></i></button>
                </div>
            </div>
            <div id="rep-ch-panel" class="rep-ch-panel hidden">
                <div class="rep-ch-panel-title">ערוצי טלגרם מותאמים</div>
                <div id="rep-ch-list"></div>
                <div class="rep-ch-add-row">
                    <input id="rep-ch-input" class="rep-ch-input" type="text" placeholder="@channelname" dir="ltr">
                    <button id="rep-ch-submit" class="rep-ch-submit"><i class="fas fa-plus"></i></button>
                </div>
                <div id="rep-status" class="rep-status"></div>
            </div>
            <div class="rep-tabs">
                <button class="rep-tab active" data-tab="telegram"><i class="fas fa-tower-broadcast"></i> מבזקים</button>
                <button class="rep-tab" data-tab="news"><i class="fas fa-newspaper"></i> חדשות</button>
            </div>
            <div id="tab-telegram" class="rep-pane active">
                <div class="rep-loading"><i class="fas fa-spinner fa-spin"></i> טוען מבזקים…</div>
            </div>
            <div id="tab-news" class="rep-pane">
                <div class="rep-loading"><i class="fas fa-spinner fa-spin"></i> טוען חדשות…</div>
            </div>
        </div>
        <div id="rep-resize-handle"></div>`;

    // Toggle button — sibling of panel inside main-container
    const toggleBtn = document.createElement('button');
    toggleBtn.id = 'rep-toggle-btn';
    toggleBtn.title = 'דיווחים ומבזקים';
    toggleBtn.innerHTML = '<i class="fas fa-tower-broadcast"></i><span id="rep-badge" class="rep-badge hidden">0</span>';

    const container = document.getElementById('main-container');
    container.appendChild(panel);
    container.appendChild(toggleBtn);

    /* ---- Open / close ---- */
    let panelOpen = false;
    let unseen = 0;
    const badge = toggleBtn.querySelector('#rep-badge');

    function updateBadge() {
        badge.textContent = unseen;
        badge.classList.toggle('hidden', unseen === 0);
    }

    function setPanelState(open) {
        panelOpen = open;
        panel.classList.toggle('open', open);
        const w = open ? panel.offsetWidth : 0;
        toggleBtn.style.left = w + 'px';
        const icon = toggleBtn.querySelector('i');
        icon.className = open ? 'fas fa-chevron-left' : 'fas fa-tower-broadcast';
        if (open) { unseen = 0; updateBadge(); }
    }

    toggleBtn.addEventListener('click', () => setPanelState(!panelOpen));
    setPanelState(false); // initial position

    /* ---- Tabs ---- */
    panel.querySelectorAll('.rep-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            panel.querySelectorAll('.rep-tab').forEach(t => t.classList.remove('active'));
            panel.querySelectorAll('.rep-pane').forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            panel.querySelector('#tab-' + tab.dataset.tab).classList.add('active');
        });
    });

    /* ---- Resize ---- */
    const resizeHandle = panel.querySelector('#rep-resize-handle');
    let resizing = false;

    resizeHandle.addEventListener('mousedown', e => {
        resizing = true;
        e.preventDefault();
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    });
    document.addEventListener('mousemove', e => {
        if (!resizing) return;
        const newW = Math.min(Math.max(e.clientX, 200), Math.min(700, window.innerWidth * 0.6));
        panel.style.width = newW + 'px';
        if (panelOpen) toggleBtn.style.left = newW + 'px';
        localStorage.setItem('repPanelWidth', newW);
    });
    document.addEventListener('mouseup', () => {
        if (!resizing) return;
        resizing = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    });

    /* ---- Header news ticker (always on, news only) ---- */
    function updateHeaderTicker() {
        const track = document.getElementById('header-ticker-track');
        if (!track || !newsItems.length) return;
        const html = newsItems.slice(0, 16).map(n =>
            `<span class="hticker-item"><span class="hticker-src">${esc(n.source)}</span> ${esc(n.title)}</span>`
        ).join('<span class="hticker-sep">•</span>');
        track.innerHTML = html + '<span class="hticker-sep">•</span>' + html; // duplicate for seamless loop
    }

    /* ---- Custom channels ---- */
    function getCustomCh() { try { return JSON.parse(localStorage.getItem('customTgCh') || '[]'); } catch (_) { return []; } }
    function saveCustomCh(arr) { localStorage.setItem('customTgCh', JSON.stringify(arr)); }

    const chToggle = panel.querySelector('#rep-ch-toggle-btn');
    const chPanelEl = panel.querySelector('#rep-ch-panel');
    const chListEl = panel.querySelector('#rep-ch-list');
    const chInput = panel.querySelector('#rep-ch-input');
    const chSubmit = panel.querySelector('#rep-ch-submit');

    chToggle.addEventListener('click', () => { chPanelEl.classList.toggle('hidden'); renderChList(); });

    function renderChList() {
        const chs = getCustomCh();
        chListEl.innerHTML = chs.length
            ? chs.map((ch, i) => `<div class="rep-ch-item"><span dir="ltr">@${esc(ch)}</span><button class="rep-ch-del" data-i="${i}"><i class="fas fa-times"></i></button></div>`).join('')
            : '<div class="rep-ch-empty">אין ערוצים נוספים</div>';
        chListEl.querySelectorAll('.rep-ch-del').forEach(btn => {
            btn.addEventListener('click', () => {
                const arr = getCustomCh(); arr.splice(+btn.dataset.i, 1); saveCustomCh(arr); renderChList();
            });
        });
    }

    chSubmit.addEventListener('click', () => {
        const val = chInput.value.trim().replace(/^@/, '');
        if (!val) return;
        const arr = getCustomCh();
        if (!arr.includes(val)) { arr.push(val); saveCustomCh(arr); }
        chInput.value = '';
        renderChList();
        pollAllChannels();
    });
    chInput.addEventListener('keydown', e => { if (e.key === 'Enter') chSubmit.click(); });

    /* ---- Toast system ---- */
    let toastContainer = document.getElementById('toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.id = 'toast-container';
        document.body.appendChild(toastContainer);
    }

    window.EITAN_showToast = function (type, text) {
        const icons = { prewarn: 'fa-bolt', allclear: 'fa-circle-check', alert: 'fa-triangle-exclamation', info: 'fa-circle-info' };
        const colors = { prewarn: 'var(--amber)', allclear: 'var(--green)', alert: 'var(--red)', info: 'var(--cyan)' };
        const t = document.createElement('div');
        t.className = 'toast-notif toast-' + type;
        t.style.setProperty('--tc', colors[type] || 'var(--cyan)');
        t.innerHTML = `<i class="fas ${icons[type] || 'fa-circle-info'}"></i><span>${esc(text)}</span>`;
        toastContainer.appendChild(t);
        requestAnimationFrame(() => t.classList.add('show'));
        setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 350); }, 8000);
    };

    /* ---- Telegram ---- */
    const seenPosts = new Set();
    let tgMessages = [];

    const TG_META = {
        prewarn: { icon: 'fa-bolt', cls: 'rep-prewarn', label: 'התרעה מקדימה' },
        alert: { icon: 'fa-triangle-exclamation', cls: 'rep-alert', label: 'אזעקה' },
        allclear: { icon: 'fa-circle-check', cls: 'rep-clear', label: 'האירוע הסתיים' },
        info: { icon: 'fa-circle-info', cls: 'rep-info', label: 'עדכון' }
    };

    function classify(text) {
        if (/האירוע הסתיים|✅/.test(text)) return 'allclear';
        if (/מבזק|בדקות הקרובות צפויות|⚠️|התרעה מוקדמת/.test(text)) return 'prewarn';
        if (/🚨|ירי רקטות|צבע אדום|חדירת/.test(text)) return 'alert';
        return 'info';
    }

    function extractCities(text) {
        const found = new Set();
        text.split(/[\n,،]/).forEach(tok => {
            const clean = tok.trim();
            if (!clean || clean.length > 32) return;
            let hit = E.cityExact(clean);
            if (!hit) {
                const parts = clean.split(/\s+/);
                for (let k = 1; k <= 2 && k < parts.length; k++) {
                    hit = E.cityExact(parts.slice(k).join(' '));
                    if (hit) break;
                }
            }
            if (hit) found.add(hit.name);
        });
        return [...found];
    }

    function decodeText(el) {
        const d = document.createElement('div');
        d.innerHTML = el.innerHTML.replace(/<br\s*\/?>/gi, '\n');
        return d.textContent.replace(/ /g, ' ').trim();
    }

    async function fetchChannel(handle) {
        const url = 'https://t.me/s/' + handle;
        const html = await E.fetchTextViaProxy(url);
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const newItems = [];

        doc.querySelectorAll('.tgme_widget_message').forEach(w => {
            const textEl = w.querySelector('.tgme_widget_message_text');
            if (!textEl) return;
            const postId = handle + ':' + (w.getAttribute('data-post') || '?');
            if (seenPosts.has(postId)) return;
            const text = decodeText(textEl);
            if (!text) return;
            seenPosts.add(postId);

            const timeEl = w.querySelector('time[datetime]');
            const ts = timeEl ? new Date(timeEl.getAttribute('datetime')).getTime() : Date.now();
            const type = classify(text);
            const cities = (type === 'prewarn' || type === 'allclear') ? extractCities(text) : [];
            newItems.push({ id: postId, type, text, ts, cities, channel: handle });

            // act on recent messages only
            if (Date.now() - ts < CONFIG.TIMING.PREWARN_MS) {
                if (type === 'prewarn' && cities.length) {
                    E.ingestPreWarn(cities);
                    window.EITAN_showToast('prewarn', 'התרעה מקדימה: ' + cities.slice(0, 3).join('، ') + (cities.length > 3 ? '…' : ''));
                    if (!panelOpen) { unseen++; updateBadge(); }
                } else if (type === 'allclear') {
                    if (window.EITAN_allClear) window.EITAN_allClear(cities);
                    else cities.forEach(c => E.clearPreWarn(c));
                    window.EITAN_showToast('allclear', 'האירוע הסתיים' + (cities.length ? ': ' + cities.slice(0, 2).join('، ') : ''));
                    if (!panelOpen) { unseen++; updateBadge(); }
                } else if (type === 'alert') {
                    if (!panelOpen) { unseen++; updateBadge(); }
                }
            }
        });
        return newItems;
    }

    async function pollAllChannels() {
        const channels = [CONFIG.TELEGRAM.channel, ...getCustomCh()];
        for (const ch of channels) {
            try {
                const items = await fetchChannel(ch);
                if (items.length) {
                    tgMessages = [...items, ...tgMessages].sort((a, b) => b.ts - a.ts).slice(0, 80);
                    renderTelegram();
                }
            } catch (_) { /* skip unreachable channel */ }
        }
        const statusEl = document.getElementById('rep-status');
        if (statusEl) statusEl.textContent = 'עודכן ' + new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
    }

    function renderTelegram() {
        const pane = document.getElementById('tab-telegram');
        if (!pane) return;
        if (!tgMessages.length) { pane.innerHTML = '<div class="rep-empty">אין מבזקים זמינים</div>'; return; }

        pane.innerHTML = tgMessages.map((m, idx) => {
            const meta = TG_META[m.type] || TG_META.info;
            const time = new Date(m.ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
            const chTag = m.channel !== CONFIG.TELEGRAM.channel ? `<span class="rep-item-ch" dir="ltr">@${esc(m.channel)}</span>` : '';
            const isLong = m.text.length > 300;
            const uid = 'rb' + idx;

            const bodyHtml = isLong
                ? `<div class="rep-body">
                     <div class="rep-body-short" id="${uid}s">${esc(m.text.slice(0, 280))}…</div>
                     <div class="rep-body-full hidden" id="${uid}f">${esc(m.text)}</div>
                     <button class="rep-expand" data-uid="${uid}">הצג הכל</button>
                   </div>`
                : `<div class="rep-body">${esc(m.text)}</div>`;

            return `<div class="rep-item ${meta.cls}">
                <div class="rep-item-head">
                    <span class="rep-item-type"><i class="fas ${meta.icon}"></i> ${meta.label} ${chTag}</span>
                    <span class="rep-item-time">${time}</span>
                </div>
                ${bodyHtml}
            </div>`;
        }).join('');

        // Wire expand buttons
        pane.querySelectorAll('.rep-expand').forEach(btn => {
            btn.addEventListener('click', function () {
                const uid = this.dataset.uid;
                const short = document.getElementById(uid + 's');
                const full = document.getElementById(uid + 'f');
                if (!short || !full) return;
                const collapsed = full.classList.contains('hidden');
                short.classList.toggle('hidden', collapsed);
                full.classList.toggle('hidden', !collapsed);
                this.textContent = collapsed ? 'הסתר' : 'הצג הכל';
            });
        });
    }


    /* ---- News ---- */
    let newsItems = [];

    function parseXmlItems(xml, src) {
        const doc = new DOMParser().parseFromString(xml, 'text/xml');
        return [...doc.querySelectorAll('item, entry')].slice(0, 10).map(it => {
            const linkEl = it.querySelector('link');
            const link = linkEl ? (linkEl.getAttribute('href') || linkEl.textContent.trim()) : '';
            const dateStr = it.querySelector('pubDate, published, updated')?.textContent || '';
            const rawDesc = it.querySelector('description, summary')?.textContent || '';
            return {
                source: src.name, lang: src.lang,
                title: (it.querySelector('title')?.textContent || '').trim(),
                link, desc: rawDesc.replace(/<[^>]+>/g, '').trim().slice(0, 220),
                ts: dateStr ? new Date(dateStr).getTime() : Date.now()
            };
        }).filter(x => x.title);
    }

    function parseJsonItems(d, src) {
        if (d.status !== 'ok' || !Array.isArray(d.items)) return [];
        return d.items.slice(0, 10).map(it => ({
            source: src.name, lang: src.lang,
            title: (it.title || '').trim(),
            link: it.link || '',
            desc: (it.description || it.content || '').replace(/<[^>]+>/g, '').trim().slice(0, 220),
            ts: it.pubDate ? new Date(it.pubDate).getTime() : Date.now()
        })).filter(x => x.title);
    }

    async function fetchFeed(src) {
        const timed = (url, ms) => {
            const ctrl = new AbortController();
            setTimeout(() => ctrl.abort(), ms);
            return fetch(url, { signal: ctrl.signal });
        };

        // 1. Try direct RSS (works if browser doesn't block CORS or GitHub Pages serves with permissive headers)
        try {
            const r = await timed(src.rss, 6000);
            if (r.ok) {
                const text = await r.text();
                if (text.trim().startsWith('<')) return parseXmlItems(text, src); // XML RSS
                return parseJsonItems(JSON.parse(text), src);                      // unlikely but safe
            }
        } catch (_) { /* blocked by CORS or network — fall through */ }

        // 2. Fall back to rss2json.com (CORS: *, free, no key)
        try {
            const r = await timed(CONFIG.RSS2JSON(src.rss), 8000);
            if (r.ok) return parseJsonItems(await r.json(), src);
        } catch (_) { }

        return [];
    }

    async function pollNews() {
        const all = [];
        await Promise.all(CONFIG.NEWS_SOURCES.map(async src => {
            try { all.push(...await fetchFeed(src)); } catch (_) { }
        }));
        if (!all.length) return;
        newsItems = all.sort((a, b) => b.ts - a.ts).slice(0, 80);
        renderNews();
        updateHeaderTicker();
    }

    function renderNews() {
        const pane = document.getElementById('tab-news');
        if (!pane) return;
        if (!newsItems.length) { pane.innerHTML = '<div class="rep-empty">אין חדשות זמינות</div>'; return; }
        pane.innerHTML = newsItems.map(n => {
            const time = new Date(n.ts).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });
            const dir = n.lang === 'en' ? 'ltr' : 'rtl';
            return `<a class="news-item" href="${esc(n.link)}" target="_blank" rel="noopener">
                <div class="news-item-inner" dir="${dir}">
                    <div class="news-item-top">
                        <span class="news-src">${esc(n.source)}</span>
                        <span class="news-time">${time}</span>
                    </div>
                    <div class="news-title">${esc(n.title)}</div>
                    ${n.desc ? `<div class="news-desc">${esc(n.desc)}</div>` : ''}
                </div>
            </a>`;
        }).join('');
    }

    function esc(s) {
        return String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    }

    /* ---- Boot ---- */
    pollAllChannels();
    pollNews();
    setInterval(pollAllChannels, CONFIG.TELEGRAM.poll_ms);
    setInterval(pollNews, 180000);
})();
