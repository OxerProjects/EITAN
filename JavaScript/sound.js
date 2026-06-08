/* ==========================================================================
 * EITAN — Siren Sound + Web Push (Phase 2)
 * Synthesises a siren using WebAudio (no external file needed).
 * Sends a browser Notification even when the tab is in background.
 * Respects the soundEnabled setting from localStorage.
 * ========================================================================== */

(function () {
    "use strict";

    let ctx = null;

    function getCtx() {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === 'suspended') ctx.resume();
        return ctx;
    }

    /* ---- Siren synthesizer ----
     * Two oscillators sweeping 600→1200Hz, slightly detuned for the
     * classic Israeli air-raid siren wail, lasting ~4 seconds. */
    function playSiren() {
        if (localStorage.getItem('soundEnabled') !== '1') return;
        try {
            const ac = getCtx();
            const duration = 4;
            const gain = ac.createGain();
            gain.gain.setValueAtTime(0, ac.currentTime);
            gain.gain.linearRampToValueAtTime(0.18, ac.currentTime + 0.1);
            gain.gain.linearRampToValueAtTime(0.18, ac.currentTime + duration - 0.3);
            gain.gain.linearRampToValueAtTime(0, ac.currentTime + duration);
            gain.connect(ac.destination);

            [0, 6].forEach(detune => {
                const osc = ac.createOscillator();
                osc.type = 'sawtooth';
                osc.detune.value = detune;
                osc.frequency.setValueAtTime(620, ac.currentTime);
                osc.frequency.linearRampToValueAtTime(1200, ac.currentTime + 1.8);
                osc.frequency.linearRampToValueAtTime(620, ac.currentTime + duration);
                osc.connect(gain);
                osc.start(ac.currentTime);
                osc.stop(ac.currentTime + duration);
            });
        } catch (e) { console.warn('siren synth error', e); }
    }

    /* ---- Push notification ---- */
    async function pushNotif(cities, threatName) {
        if (localStorage.getItem('soundEnabled') !== '1') return;
        if (!('Notification' in window)) return;
        if (Notification.permission === 'default') {
            await Notification.requestPermission();
        }
        if (Notification.permission === 'granted') {
            try {
                new Notification('🚨 EITAN — ' + threatName, {
                    body: cities.slice(0, 5).join(', ') + (cities.length > 5 ? '…' : ''),
                    icon: 'favicon.png',
                    tag: 'eitan-alert',
                    renotify: true,
                    requireInteraction: false
                });
            } catch (_) { }
        }
    }

    /* ---- Hook called by AlertEngine ---- */
    window.EITAN_playSiren = function (threat, cities = []) {
        const meta = CONFIG.threatMeta(threat);
        playSiren();
        pushNotif(cities, meta.name);
    };

    /* ---- Volume/test helper exposed for settings panel ---- */
    window.EITAN_testSiren = playSiren;

})();
