// The app itself. Loaded by the launcher (main.js) either from the installed copy or
// from a newer downloaded update — so everything here can change through auto-update.
const { app, BrowserWindow, ipcMain, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { scan } = require('./engine/scanner');
const { search, lookup } = require('./engine/lookup');
const tracker = require('./engine/tracker');
const { setCacheDir } = require('./engine/universe');
const { PaperAccount, marketOpen } = require('./engine/paper');
const { quotes, candles } = require('./engine/quotes');
const { YahooStream } = require('./engine/stream');
const phone = require('./engine/phone-server');
const crypto = require('crypto');

const DEFAULTS = {
  watchlist: ['AAPL', 'NVDA', 'MSFT', 'TSLA', 'AMZN', 'META', 'AMD', 'GOOGL'],
  refreshMinutes: 15,
  minMarketCap: 5e8,
  minPrice: 3,
  notify: true,
  accountSize: 10000,
  riskPct: 1,
};

const dataDir = () => app.getPath('userData');
const settingsFile = () => path.join(dataDir(), 'settings.json');
const lastScanFile = () => path.join(dataDir(), 'last-scan.json');
const historyFile = () => path.join(dataDir(), 'signal-history.json');

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

let settings;
let win;
let lastScan = null;
let scanning = false;
let timer = null;
let trackCache = { at: 0, data: null };
let paper;
let paperWatch = []; // symbols the paper-trading screens are showing (desktop + phone, combined)
const watchBy = {}; // client -> { syms, at }
let lastQuotes = {};
const stream = new YahooStream();

const send = (ch, d) => {
  if (win && !win.isDestroyed()) win.webContents.send(ch, d);
  phone.broadcast(ch, d);
};
// Every IPC handler is also kept here so the phone server can call the same code.
const H = {};
const handle = (ch, fn) => {
  H[ch] = fn;
  ipcMain.handle(ch, fn);
};
const feed = () => ({ mode: stream.healthy() ? 'stream' : 'poll', connected: stream.connected, lastTickAt: stream.lastTickAt || null });
const snapshot = () => ({ account: paper.summary(), quotes: lastQuotes, feed: feed() });

// Account updates go out at most once a second (P&L moves with every tick), right away on a fill.
let summaryTimer = null;
let lastSummaryAt = 0;
function pushUpdate(now = false) {
  if (now || Date.now() - lastSummaryAt > 1000) {
    clearTimeout(summaryTimer);
    summaryTimer = null;
    lastSummaryAt = Date.now();
    send('paper:update', snapshot());
  } else if (!summaryTimer) summaryTimer = setTimeout(() => pushUpdate(true), 1000 - (Date.now() - lastSummaryAt));
}

// Ticks go to the chart in small batches (every 100 ms) so a busy stream can't flood the UI.
let pendingTicks = {};
let tickTimer = null;
function queueTick(sym) {
  pendingTicks[sym] = lastQuotes[sym];
  if (!tickTimer) {
    tickTimer = setTimeout(() => {
      tickTimer = null;
      send('paper:tick', { quotes: pendingTicks, feed: feed() });
      pendingTicks = {};
    }, 100);
  }
}

function streamSymbols() {
  stream.setSymbols([...new Set([...paper.symbols(), ...paperWatch])].slice(0, 80));
}

// Live tick from the Yahoo stream → quote → order matching → UI.
stream.on('tick', (t) => {
  const prev = lastQuotes[t.symbol] || { symbol: t.symbol };
  const q = { ...prev, symbol: t.symbol, src: 'stream', at: Date.now(), session: t.session, bid: t.bid, ask: t.ask, bidSize: t.bidSize, askSize: t.askSize };
  if (t.session === 'regular') {
    Object.assign(q, { last: t.price, ext: null, lastSize: t.lastSize, tradeTime: t.time });
    if (t.changePct != null) q.changePct = t.changePct;
    if (t.change != null) q.change = t.change;
    if (t.volume) q.volume = t.volume;
    if (t.dayHigh) q.dayHigh = t.dayHigh;
    if (t.dayLow) q.dayLow = t.dayLow;
  } else {
    // Pre-market / after hours: `last` stays the regular-session close (like the CNBC quote).
    q.ext = { type: t.session === 'pre' ? 'PRE_MKT' : 'POST_MKT', last: t.price, changePct: t.changePct, time: t.time };
    if (!q.last) q.last = t.price;
  }
  lastQuotes[t.symbol] = q;
  const fills = paper.s.fills.length;
  paper.tick({ [t.symbol]: q });
  queueTick(t.symbol);
  const filled = paper.s.fills.length !== fills;
  if (filled) streamSymbols();
  if (filled || paper.s.positions[t.symbol] || paperWatch.includes(t.symbol)) pushUpdate(filled);
});
stream.on('status', () => pushUpdate(true));

// A polled (CNBC) quote never overwrites a fresher streamed price; it still fills in names,
// previous close and anything the stream hasn't sent.
function mergePolled(fresh) {
  for (const [sym, q] of Object.entries(fresh)) {
    const prev = lastQuotes[sym];
    if (prev?.src === 'stream' && Date.now() - prev.at < 15e3) lastQuotes[sym] = { ...prev, name: q.name, prevClose: q.prevClose, status: q.status };
    else lastQuotes[sym] = { ...prev, ...q };
  }
}

// Fallback / housekeeping loop. While the stream is healthy it only polls every 30 s (names,
// quiet symbols); if the stream drops it polls every 3 s while the market is open (20 s closed).
async function paperLoop() {
  const streaming = stream.healthy();
  try {
    streamSymbols();
    const syms = [...new Set([...paper.symbols(), ...paperWatch])];
    if (syms.length) {
      mergePolled(await quotes(syms));
      paper.tick(lastQuotes);
    } else paper.tick({});
    pushUpdate(true);
  } catch {}
  setTimeout(paperLoop, streaming ? 30000 : marketOpen() ? 3000 : 20000);
}

const paperDo = (fn) => {
  fn();
  streamSymbols();
  const out = snapshot();
  send('paper:update', out);
  return out;
};

// Track-record evaluation re-downloads price history, so cache it for a few hours.
async function trackRecord(force = false) {
  if (!force && trackCache.data && Date.now() - trackCache.at < 4 * 3600e3) return trackCache.data;
  trackCache = { at: Date.now(), data: await tracker.evaluate(historyFile()) };
  return trackCache.data;
}

// Attach the measured win rate of past trade ideas like this one (never an invented number).
function attachChances(result) {
  const ts = trackCache.data?.trades;
  for (const t of result.trades || []) {
    const pick = [
      ['catalyst', ts?.byCatalyst?.[t.catalyst], 15],
      ['type', ts?.byType?.[t.type], 15],
      ['all', ts?.overall, 20],
    ].find(([, st, min]) => st && st.decided >= min);
    t.chance = pick ? { basis: pick[0], winRate: pick[1].winRate, decided: pick[1].decided } : { basis: null, logged: ts?.overall?.n || 0 };
  }
}
const notified = new Set();

function createWindow(launcher) {
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 980,
    minHeight: 640,
    title: 'Market Radar',
    backgroundColor: '#0b0f14',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Every link opens in the user's real browser, never inside the app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.once('did-finish-load', () => {
    launcher.markHealthy();
    runScan();
  });
}

// ---- Phone app: the Mac serves the same UI + data to phones on the same Wi-Fi ----
const phoneFile = () => path.join(dataDir(), 'phone.json');
let phoneCfg = { enabled: false, token: '' };
const newToken = () => crypto.randomBytes(12).toString('base64url');
const savePhone = () => fs.writeFileSync(phoneFile(), JSON.stringify(phoneCfg, null, 2));
let phoneUrls = [];
async function applyPhone() {
  if (phoneCfg.enabled) {
    phoneUrls = await phone.start({
      port: 8765,
      getToken: () => phoneCfg.token,
      handlers: H,
      rendererDir: path.join(__dirname, 'renderer'),
      version: require('./package.json').version,
    });
  } else {
    phone.stop();
    phoneUrls = [];
  }
}
function phoneInfo() {
  return { enabled: phoneCfg.enabled, running: phone.running(), urls: phoneUrls, token: phoneCfg.token, connected: phone.clientCount() };
}

async function runScan() {
  if (scanning) return lastScan;
  scanning = true;
  send('scan:progress', { stage: 'Starting…', pct: 0 });
  try {
    const result = await scan({ ...settings, econCacheFile: path.join(dataDir(), 'econ-cache.json') }, (p) => send('scan:progress', p));
    // Calendars are rate-limited upstream; keep the last good copy rather than showing nothing.
    if (!result.econ.length && lastScan?.econ?.length) result.econ = lastScan.econ;
    if (!result.earnings.length && lastScan?.earnings?.length) result.earnings = lastScan.earnings;
    lastScan = result;
    fs.writeFileSync(lastScanFile(), JSON.stringify(result));
    try {
      tracker.record(historyFile(), result);
    } catch {}
    attachChances(result);
    notifyNew(result);
    send('scan:result', result);
  } catch (err) {
    send('scan:error', String(err?.message || err));
  } finally {
    scanning = false;
  }
  return lastScan;
}

function notifyNew(result) {
  if (!settings.notify || !Notification.isSupported()) return;
  const firstRun = notified.size === 0;
  const key = (c) => `${c.symbol}:${Math.sign(c.composite)}`;
  // High-confidence signals, plus any watchlist stock with a meaningful catalyst.
  const fresh = [...result.bullish, ...result.bearish, ...(result.watchlist || [])].filter(
    (c) => (c.confidence === 'High' || (c.onWatch && Math.abs(c.newsScore) >= 3)) && !notified.has(key(c))
  );
  const unique = [...new Map(fresh.map((c) => [key(c), c])).values()];
  for (const c of unique) notified.add(key(c));
  if (!unique.length || firstRun) return;
  const lines = unique.slice(0, 4).map((c) => `${c.composite > 0 ? '▲' : '▼'} ${c.symbol}${c.onWatch ? ' (watchlist)' : ''}: ${c.reasons[0]?.label || ''}`);
  new Notification({ title: `Market Radar: ${unique.length} new signal${unique.length > 1 ? 's' : ''}`, body: lines.join('\n') }).show();
}

function schedule() {
  clearInterval(timer);
  const mins = Math.max(5, Number(settings.refreshMinutes) || 15);
  timer = setInterval(runScan, mins * 60e3);
}

function start(launcher) {
  setCacheDir(dataDir());
  handle('settings:get', () => settings);
  handle('settings:set', (_e, next) => {
    settings = { ...settings, ...next };
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
    schedule();
    return settings;
  });
  handle('scan:last', () => lastScan);
  handle('scan:run', () => runScan());
  handle('stock:search', (_e, q) => search(q));
  handle('stock:lookup', (_e, sym) => lookup(sym, lastScan));
  handle('track:get', () => trackRecord(true));
  handle('paper:get', () => snapshot());
  handle('paper:watch', async (_e, syms) => {
    const mine = [...new Set((syms || []).map((x) => String(x).toUpperCase().trim()).filter(Boolean))].slice(0, 60);
    watchBy[_e?.client || 'desktop'] = { syms: mine, at: Date.now() };
    // a phone that stopped asking for a while is gone; drop its symbols
    for (const [k, v] of Object.entries(watchBy)) if (k !== 'desktop' && Date.now() - v.at > 10 * 60e3) delete watchBy[k];
    paperWatch = [...new Set(Object.values(watchBy).flatMap((v) => v.syms))].slice(0, 80);
    streamSymbols();
    // Names, previous close and a first price for anything we haven't seen yet.
    const missing = mine.filter((x) => !lastQuotes[x]?.name);
    if (missing.length) {
      mergePolled(await quotes(missing).catch(() => ({})));
      paper.tick(lastQuotes);
    }
    return snapshot();
  });
  handle('paper:candles', (_e, sym, tf) => candles(sym, tf));
  handle('paper:order', async (_e, o) => {
    // Make sure we have a fresh price before accepting the order (the stream usually has one).
    const sym = String(o?.symbol || '').toUpperCase();
    const q = lastQuotes[sym];
    if (!(q?.src === 'stream' && Date.now() - q.at < 5000)) {
      mergePolled(await quotes([sym]).catch(() => ({})));
      paper.tick(lastQuotes);
    }
    return paperDo(() => paper.place(o));
  });
  handle('paper:cancel', (_e, id) => paperDo(() => paper.cancel(id)));
  handle('paper:modify', (_e, id, changes) => paperDo(() => paper.modify(Number(id), changes || {})));
  handle('paper:close', (_e, sym) => paperDo(() => paper.close(sym)));
  handle('paper:bracket', (_e, sym, b) => paperDo(() => paper.modifyBracket(sym, b)));
  handle('paper:reset', (_e, cash) => paperDo(() => paper.reset(Number(cash) || settings.accountSize || 10000)));
  handle('guide:get', () => fs.readFileSync(path.join(__dirname, 'RESEARCH.md'), 'utf8'));
  handle('open:external', (_e, url) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });

  handle('phone:info', () => phoneInfo());
  handle('phone:set', async (_e, on) => {
    phoneCfg.enabled = !!on;
    savePhone();
    await applyPhone();
    return phoneInfo();
  });
  handle('phone:newToken', async () => {
    phoneCfg.token = newToken();
    savePhone();
    phone.stop(); // drops paired phones
    await applyPhone();
    return phoneInfo();
  });

  settings = { ...DEFAULTS, ...readJson(settingsFile(), {}) };
  phoneCfg = { enabled: false, token: newToken(), ...readJson(phoneFile(), {}) };
  savePhone();
  applyPhone();
  lastScan = readJson(lastScanFile(), null);
  for (const c of [...(lastScan?.bullish || []), ...(lastScan?.bearish || []), ...(lastScan?.watchlist || [])]) {
    if (c.confidence === 'High' || (c.onWatch && Math.abs(c.newsScore) >= 3)) notified.add(`${c.symbol}:${Math.sign(c.composite)}`);
  }
  paper = new PaperAccount(path.join(dataDir(), 'paper-account.json'), settings.accountSize || 10000);
  createWindow(launcher);
  schedule();
  paperLoop();
  // Warm the track-record cache in the background so trade ideas can show measured win rates.
  trackRecord().then(() => {
    if (lastScan) {
      attachChances(lastScan);
      send('scan:result', lastScan);
    }
  }).catch(() => {});
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow(launcher));
}

module.exports = { start };
