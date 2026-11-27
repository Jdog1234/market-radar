// Phone mode. On the Mac, preload.js provides window.radar over Electron IPC and this file does nothing.
// On a phone (page served by the Mac's phone server) it provides the same window.radar API over HTTP,
// so the whole app works unchanged and shows the Mac's real data.
(() => {
  if (window.radar) return;
  document.documentElement.classList.add('phone');

  const KEY = 'mr.phoneToken';
  const CACHE = 'mr.cache.';
  const qs = new URLSearchParams(location.search);
  let token = qs.get('t') || '';
  try {
    if (token) localStorage.setItem(KEY, token);
    else token = localStorage.getItem(KEY) || '';
  } catch {}
  // Keep the code in the address so "Add to Home Screen" saves it with the app.
  if (token && qs.get('t') !== token) history.replaceState(null, '', `${location.pathname}?t=${encodeURIComponent(token)}`);
  const man = document.querySelector('link[rel="manifest"]');
  if (man && token) man.href = `manifest.webmanifest?t=${encodeURIComponent(token)}`;

  // Read-only things worth remembering, so a short Wi-Fi drop doesn't blank the screen.
  const CACHED = new Set(['settings:get', 'scan:last', 'paper:get', 'track:get', 'guide:get']);
  const save = (ch, v) => { try { localStorage.setItem(CACHE + ch, JSON.stringify(v)); } catch {} };
  const load = (ch) => { try { const v = localStorage.getItem(CACHE + ch); return v == null ? undefined : JSON.parse(v); } catch { return undefined; } };

  let offline = false;
  function setOffline(on, why) {
    offline = on;
    let bar = document.getElementById('phoneOffline');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'phoneOffline';
      bar.className = 'phone-offline hidden';
      (document.body || document.documentElement).appendChild(bar);
    }
    bar.textContent = why || "Can't reach Market Radar on your Mac. Showing the last data received. Is the Mac awake, the app open and the phone on the same Wi-Fi?";
    bar.classList.toggle('hidden', !on);
  }

  async function invoke(ch, ...args) {
    if (!token) throw new Error('Not paired');
    try {
      const r = await fetch('api/invoke', { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': token }, body: JSON.stringify({ ch, args }) });
      if (r.status === 401) { showPairing('That pairing code is no longer valid. Scan the new code on your Mac.'); throw new Error('Not paired'); }
      const d = await r.json();
      if (offline) setOffline(false);
      if (!d.ok) throw new Error(d.error || 'Failed');
      if (CACHED.has(ch)) save(ch, d.result);
      return d.result;
    } catch (err) {
      if (err instanceof TypeError) { // network failure
        setOffline(true);
        const c = load(ch);
        if (c !== undefined) return c;
      }
      throw err;
    }
  }

  // ---- live events from the Mac ----
  const listeners = {};
  const on = (ch) => (fn) => { (listeners[ch] = listeners[ch] || []).push(fn); };
  function connectEvents() {
    if (!token || !window.EventSource) return;
    const es = new EventSource(`api/events?t=${encodeURIComponent(token)}`);
    for (const ch of ['paper:update', 'paper:tick', 'scan:progress', 'scan:result', 'scan:error']) {
      es.addEventListener(ch, (e) => {
        let d; try { d = JSON.parse(e.data); } catch { return; }
        if (ch === 'paper:update') save('paper:get', d);
        if (ch === 'scan:result') save('scan:last', d);
        for (const fn of listeners[ch] || []) try { fn(d); } catch (err) { console.error(err); }
      });
    }
    es.onopen = () => { if (offline) { setOffline(false); refreshAll(); } };
    es.onerror = () => setOffline(true);
  }
  // After a reconnect, pull fresh copies of what the screens show.
  async function refreshAll() {
    try { const s = await invoke('scan:last'); if (s) for (const fn of listeners['scan:result'] || []) fn(s); } catch {}
    try { const p = await invoke('paper:get'); if (p) for (const fn of listeners['paper:update'] || []) fn(p); } catch {}
  }

  // The Mac forgets a phone's chart symbols after a while; remind it while the paper screen is open.
  let lastWatch = [];
  setInterval(() => { if (lastWatch.length && !document.hidden) invoke('paper:watch', lastWatch).catch(() => {}); }, 120e3);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && token) refreshAll(); });

  window.radar = {
    getSettings: () => invoke('settings:get'),
    saveSettings: (s) => invoke('settings:set', s),
    lastScan: () => invoke('scan:last'),
    runScan: () => invoke('scan:run'),
    search: (q) => invoke('stock:search', q),
    lookup: (sym) => invoke('stock:lookup', sym),
    trackRecord: () => invoke('track:get'),
    guide: () => invoke('guide:get'),
    open: (url) => { if (/^https?:\/\//.test(url)) window.open(url, '_blank', 'noopener'); },
    appInfo: () => invoke('app:info').catch(() => ({ version: '' })),
    updateStatus: async () => ({ state: 'idle' }),
    checkUpdates: async () => ({ state: 'idle' }),
    restartToUpdate: async () => {},
    openInstallerPage: async () => {},
    paper: {
      get: () => invoke('paper:get'),
      watch: (syms) => { lastWatch = syms || []; return invoke('paper:watch', lastWatch); },
      candles: (sym, tf) => invoke('paper:candles', sym, tf),
      order: (o) => invoke('paper:order', o),
      cancel: (id) => invoke('paper:cancel', id),
      modify: (id, changes) => invoke('paper:modify', id, changes),
      close: (sym) => invoke('paper:close', sym),
      bracket: (sym, b) => invoke('paper:bracket', sym, b),
      reset: (cash) => invoke('paper:reset', cash),
      onUpdate: on('paper:update'),
      onTick: on('paper:tick'),
    },
    onUpdate: () => {},
    onProgress: on('scan:progress'),
    onResult: on('scan:result'),
    onError: on('scan:error'),
  };

  // ---- pairing screen ----
  function showPairing(msg) {
    const build = () => {
      let el = document.getElementById('phonePair');
      if (!el) {
        el = document.createElement('div');
        el.id = 'phonePair';
        el.className = 'phone-pair';
        el.innerHTML = `<div class="phone-pair-box">
          <div class="brand"><span class="logo">◎</span> Market Radar</div>
          <p id="phonePairMsg"></p>
          <ol class="small muted">
            <li>On your Mac, open Market Radar → <b>Settings</b> → <b>Phone app</b>.</li>
            <li>Scan the QR code with your phone's camera, or type the pairing code below.</li>
          </ol>
          <form id="phonePairForm"><input id="phonePairCode" placeholder="Pairing code" autocomplete="off" autocapitalize="off" spellcheck="false" /><button class="btn">Connect</button></form>
        </div>`;
        document.body.appendChild(el);
        el.querySelector('#phonePairForm').addEventListener('submit', (e) => {
          e.preventDefault();
          const v = el.querySelector('#phonePairCode').value.trim();
          if (v) location.replace(`${location.pathname}?t=${encodeURIComponent(v)}`);
        });
      }
      el.querySelector('#phonePairMsg').textContent = msg || 'Connect this phone to Market Radar on your Mac.';
    };
    if (document.body) build(); else document.addEventListener('DOMContentLoaded', build);
  }

  // keep the selected tab visible in the scrolling bottom bar
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('#nav button');
    if (b) b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  });

  if (!token) showPairing();
  else connectEvents();
})();
