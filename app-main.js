// The app itself. Loaded by the launcher (main.js) either from the installed copy or
// from a newer downloaded update — so everything here can change through auto-update.
const { app, BrowserWindow, ipcMain, shell, Notification, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { scan } = require('./engine/scanner');
const { search, lookup } = require('./engine/lookup');
const tracker = require('./engine/tracker');
const { setCacheDir } = require('./engine/universe');
const { PaperAccount, marketOpen } = require('./engine/paper');
const { quotes, candles } = require('./engine/quotes');
const { setDataConfig } = require('./engine/config');
const polygon = require('./engine/polygon');
const { Account } = require('./engine/account');
const { YahooStream } = require('./engine/stream');
const { Alerts } = require('./engine/alerts');
const { AlpacaAccount } = require('./engine/alpaca');
const patterns = require('./engine/patterns');
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
  licensedOnly: false,
  polygonKeyEnc: '', // encrypted with the OS keychain (safeStorage); never stored in plain text
  brokerKeyEnc: '', // Alpaca key ID + secret, encrypted the same way
  brokerEnv: 'paper', // 'paper' (Alpaca's practice account) or 'live' (real money)
  tradeAccount: 'sim', // which account the trading screen uses: 'sim' (built-in) or 'broker'
  maxOrderValue: 5000, // broker orders worth more than this are refused
};

// API keys are encrypted with the operating system's secure storage before saving.
function readKey(enc) {
  if (!enc) return '';
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'));
  } catch {
    return '';
  }
}
function applyDataConfig() {
  setDataConfig({ polygonKey: readKey(settings.polygonKeyEnc), licensedOnly: !!settings.licensedOnly });
}
// What the renderer may see about settings: never the key itself.
const publicSettings = () => {
  const { polygonKeyEnc, brokerKeyEnc, ...rest } = settings;
  return { ...rest, polygonConfigured: !!polygonKeyEnc, brokerConfigured: !!brokerKeyEnc };
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
let alerts;
let account;
let broker = null; // AlpacaAccount when keys are saved
let brokerError = null;
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
// Trading actions the phone may only use on the simulated account: real-broker orders stay on the Mac.
const PHONE_SIM_ONLY = new Set(['paper:order', 'paper:cancel', 'paper:modify', 'paper:close', 'paper:bracket', 'paper:protect', 'paper:breakeven', 'paper:trail', 'paper:reverse', 'paper:closeAll', 'paper:cancelAll']);
const handle = (ch, fn) => {
  H[ch] = PHONE_SIM_ONLY.has(ch)
    ? (e, ...a) => {
        if (active() !== paper) throw new Error('Orders on your real broker account can only be placed from the Mac. Switch to the simulated account to trade from the phone.');
        return fn(e, ...a);
      }
    : fn;
  ipcMain.handle(ch, fn);
};
// Keys, licenses, billing and broker setup: Mac window only, never reachable from the phone.
const desktopOnly = (ch, fn) => ipcMain.handle(ch, fn);
const feed = () => ({ mode: stream.healthy() ? 'stream' : 'poll', connected: stream.connected, lastTickAt: stream.lastTickAt || null });
// Real trading needs Pro once subscriptions are on.
const brokerAllowed = () => {
  const st = account.status();
  return !st.paywall || st.plan === 'pro';
};
// The account the trading screen is working with: the built-in simulator or the user's broker.
const active = () => (settings.tradeAccount === 'broker' && broker && brokerAllowed() ? broker : paper);
const tradeMode = () => ({ kind: active() === paper ? 'sim' : 'broker', broker: broker ? 'alpaca' : null, env: broker?.env || settings.brokerEnv, configured: !!broker, allowed: brokerAllowed(), error: active() === paper ? null : brokerError, maxOrderValue: settings.maxOrderValue });
const snapshot = () => ({ account: active().summary(), quotes: lastQuotes, feed: feed(), alerts: alerts.list(), mode: tradeMode() });

function buildBroker() {
  let keys = null;
  try {
    keys = settings.brokerKeyEnc ? JSON.parse(readKey(settings.brokerKeyEnc)) : null;
  } catch {}
  broker = keys?.id && keys?.secret ? new AlpacaAccount({ keys, env: settings.brokerEnv, maxOrderValue: settings.maxOrderValue }) : null;
  brokerError = null;
}
// Keep the broker account fresh: every 3 s while the trading screen is open, else every 30 s.
async function brokerLoop() {
  if (broker && active() === broker) {
    try {
      await broker.refresh();
      brokerError = null;
    } catch (e) {
      brokerError = String(e.message || e);
    }
    streamSymbols();
    pushUpdate(true);
  }
  setTimeout(brokerLoop, paperWatch.length ? 3000 : 30000);
}

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

const liveSymbols = () => [...new Set([...paper.symbols(), ...(broker ? broker.symbols() : []), ...alerts.symbols(), ...paperWatch])];
function streamSymbols() {
  stream.setSymbols(liveSymbols().slice(0, 80));
}

// Price alerts: desktop notification + a message to the window.
function checkAlerts(qs) {
  const fired = alerts.check(qs);
  if (!fired.length) return;
  for (const a of fired) {
    if (Notification.isSupported()) {
      new Notification({ title: `${a.symbol} ${a.dir === 'above' ? 'rose above' : 'fell below'} ${a.price}`, body: `Now ${a.firedPrice.toFixed(2)}${a.note ? ` · ${a.note}` : ''}` }).show();
    }
    send('alerts:fired', a);
  }
  streamSymbols();
  pushUpdate(true);
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
  checkAlerts({ [t.symbol]: q });
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
    const syms = liveSymbols();
    if (syms.length) {
      mergePolled(await quotes(syms));
      paper.tick(lastQuotes);
      checkAlerts(lastQuotes);
    } else paper.tick({});
    pushUpdate(true);
  } catch {}
  setTimeout(paperLoop, streaming ? 30000 : marketOpen() ? 3000 : 20000);
}

// Free plan (when the paywall is on): 5 working paper orders at a time.
const FREE_ORDER_LIMIT = 5;
function applyPlanLimits() {
  const st = account.status();
  paper.orderLimit = st.paywall && st.plan !== 'pro' ? FREE_ORDER_LIMIT : null;
}
const paperDo = async (fn) => {
  applyPlanLimits();
  await fn();
  streamSymbols();
  const out = snapshot();
  send('paper:update', out);
  return out;
};

// ---- Learn: candlestick patterns measured on real daily history ----
// The dataset (~100 large US stocks, 2 years of daily bars) is cached on disk for 12 hours.
let learn = null; // { dataset, result, at }
let learnLoading = null;
const learnFile = () => path.join(dataDir(), 'learn-cache.json');
async function ensureLearn() {
  if (learn && Date.now() - learn.at < 12 * 3600e3) return learn;
  if (learnLoading) return learnLoading;
  learnLoading = (async () => {
    let cached = readJson(learnFile(), null);
    if (!cached || Date.now() - cached.at > 12 * 3600e3) {
      try {
        cached = { at: Date.now(), dataset: await patterns.loadDataset() };
        fs.writeFileSync(learnFile(), JSON.stringify(cached));
      } catch (e) {
        if (!cached) throw e; // offline: an older copy is better than nothing
      }
    }
    learn = { dataset: cached.dataset, result: patterns.scan(cached.dataset), at: cached.at };
    return learn;
  })();
  try {
    return await learnLoading;
  } finally {
    learnLoading = null;
  }
}
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
// Free plan (paywall on): 3 puzzles a day.
const FREE_PUZZLES = 3;
function puzzleAllowance() {
  const st = account.status();
  const today = new Date().toISOString().slice(0, 10);
  if (settings.puzzleDay !== today) Object.assign(settings, { puzzleDay: today, puzzleCount: 0 });
  const limit = st.paywall && st.plan !== 'pro' ? FREE_PUZZLES : null;
  return { limit, used: settings.puzzleCount || 0, left: limit == null ? null : Math.max(0, limit - (settings.puzzleCount || 0)) };
}

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
  // Addresses are read live so Tailscale turning on/off shows up without restarting.
  const live = phone.running();
  return { enabled: phoneCfg.enabled, running: live, urls: live ? phone.urls() : phoneUrls, remote: live ? phone.remoteUrls() : [], token: phoneCfg.token, connected: phone.clientCount() };
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
  handle('settings:get', () => publicSettings());
  handle('settings:set', (_e, next) => {
    const { polygonKeyEnc, polygonConfigured, ...allowed } = next || {};
    settings = { ...settings, ...allowed };
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
    applyDataConfig();
    schedule();
    return publicSettings();
  });
  desktopOnly('data:setPolygonKey', (_e, key) => {
    key = String(key || '').trim();
    if (key && !safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is not available on this computer, so the key was not saved');
    settings.polygonKeyEnc = key ? safeStorage.encryptString(key).toString('base64') : '';
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
    applyDataConfig();
    return publicSettings();
  });
  desktopOnly('data:testPolygon', () => (polygon.enabled() ? polygon.test() : { errors: ['No Polygon key saved yet'] }));
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
    const acct = active();
    if (acct === broker) {
      // Real money: the window must have shown the confirmation (see confirmLive in app.js).
      if (broker.env === 'live' && o?.confirmed !== true) throw new Error('Live orders must be confirmed first');
      const fresh = lastQuotes[sym];
      return paperDo(() => broker.place({ ...o, refPrice: (o.side === 'buy' ? fresh?.ask : fresh?.bid) || fresh?.last }));
    }
    return paperDo(() => paper.place(o));
  });
  // Order ids are numbers in the simulator and strings at the broker.
  const oid = (id) => (active() === paper ? Number(id) : String(id));
  handle('paper:cancel', (_e, id) => paperDo(() => active().cancel(oid(id))));
  handle('paper:modify', (_e, id, changes) => paperDo(() => active().modify(oid(id), changes || {})));
  handle('paper:close', (_e, sym) => paperDo(() => active().close(String(sym))));
  handle('paper:bracket', (_e, sym, b) => paperDo(() => paper.modifyBracket(sym, b)));
  handle('paper:protect', (_e, sym, b) => paperDo(() => active().protect(String(sym), b || {})));
  handle('paper:breakeven', (_e, sym) => paperDo(() => active().breakeven(String(sym))));
  handle('paper:trail', (_e, sym, amount) => paperDo(() => active().trail(String(sym), Number(amount))));
  handle('paper:reverse', (_e, sym, confirmed) => {
    if (active() === broker && broker.env === 'live' && confirmed !== true) throw new Error('Live orders must be confirmed first');
    return paperDo(() => active().reverse(String(sym)));
  });
  handle('paper:closeAll', () => paperDo(() => active().closeAll()));
  handle('paper:cancelAll', () => paperDo(() => active().cancelAll()));
  // ---- broker connection (Alpaca) ----
  desktopOnly('broker:setKeys', async (_e, { id, secret, env } = {}) => {
    id = String(id || '').trim();
    secret = String(secret || '').trim();
    if (!id || !secret) throw new Error('Enter both the API key ID and the secret key');
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is not available on this computer, so the keys were not saved');
    const env2 = env === 'live' ? 'live' : 'paper';
    const info = await new AlpacaAccount({ keys: { id, secret }, env: env2 }).test(); // only save keys that work
    settings.brokerKeyEnc = safeStorage.encryptString(JSON.stringify({ id, secret })).toString('base64');
    settings.brokerEnv = env2;
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
    buildBroker();
    return { ...info, settings: publicSettings() };
  });
  desktopOnly('broker:test', () => {
    if (!broker) throw new Error('No broker connected yet');
    return broker.test();
  });
  desktopOnly('broker:remove', () => {
    settings.brokerKeyEnc = '';
    settings.tradeAccount = 'sim';
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
    buildBroker();
    return paperDo(() => {});
  });
  desktopOnly('broker:select', async (_e, which) => {
    if (which === 'broker') {
      if (!broker) throw new Error('Connect a broker first: click + Connect broker at the top of the Trading screen');
      if (!brokerAllowed()) throw new Error('Trading with a real broker is a Pro feature');
      await broker.refresh();
    }
    settings.tradeAccount = which === 'broker' ? 'broker' : 'sim';
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
    return paperDo(() => {});
  });
  desktopOnly('broker:setLimit', (_e, value) => {
    const v = Math.max(0, Math.round(Number(value) || 0));
    settings.maxOrderValue = v;
    if (broker) broker.maxOrderValue = v;
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
    return publicSettings();
  });
  handle('alerts:add', (_e, a) => paperDo(() => alerts.add({ ...a, last: lastQuotes[String(a?.symbol || '').toUpperCase()]?.last })));
  handle('alerts:remove', (_e, id) => paperDo(() => alerts.remove(Number(id))));
  handle('alerts:clearFired', () => paperDo(() => alerts.clearFired()));
  handle('paper:reset', (_e, cash) => {
    if (active() !== paper) throw new Error('Reset only applies to the simulated account');
    return paperDo(() => paper.reset(Number(cash) || settings.accountSize || 10000));
  });
  handle('account:status', () => account.status());
  desktopOnly('account:activate', (_e, key) => account.activate(key));
  handle('account:refresh', () => account.refreshPlan({ force: true }));
  desktopOnly('account:signout', () => account.signOut());
  desktopOnly('account:upgrade', async (_e, interval) => shell.openExternal(await account.checkoutUrl(interval === 'year' ? 'year' : 'month')));
  desktopOnly('account:billing', async () => shell.openExternal(await account.portalUrl()));
  handle('learn:stats', async () => {
    const { result } = await ensureLearn();
    return { patterns: patterns.PATTERNS, stats: result.stats, baseline: result.baseline, symbols: result.symbols, from: result.from, to: result.to, horizon: result.horizon, allowance: puzzleAllowance() };
  });
  // A random real occurrence (optionally of one pattern), with 4 name choices.
  handle('learn:puzzle', async (_e, opts = {}) => {
    const a = puzzleAllowance();
    if (a.left === 0) throw new Error(`You've played today's ${FREE_PUZZLES} free puzzles. Pro gives you unlimited puzzles, or come back tomorrow.`);
    const { dataset, result } = await ensureLearn();
    const usable = patterns.PATTERNS.filter((p) => result.stats[p.id].n >= 5 && (!opts.patternId || p.id === opts.patternId));
    if (!usable.length) throw new Error('No real examples of that pattern in the data yet');
    // Pick the pattern first (so rare ones come up too), then a real occurrence of it, with
    // enough bars after it to show what happened.
    const p = pick(usable);
    const hits = result.hits.filter((h) => h.id === p.id && h.i >= 50);
    const w = patterns.windowFor(dataset, pick(hits));
    const others = patterns.PATTERNS.filter((x) => x.id !== p.id && !(x.id.includes('doji') && p.id.includes('doji')));
    const distract = [];
    const prefer = others.filter((x) => x.bars === p.bars).sort(() => Math.random() - 0.5);
    for (const x of [...prefer, ...others.sort(() => Math.random() - 0.5)]) if (distract.length < 3 && !distract.includes(x.id)) distract.push(x.id);
    settings.puzzleCount = (settings.puzzleCount || 0) + 1;
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
    return { ...w, choices: [p.id, ...distract].sort(() => Math.random() - 0.5), stat: result.stats[p.id], baseline: result.baseline, horizon: result.horizon, allowance: puzzleAllowance() };
  });
  // A real example of a pattern for the library (doesn't count as a puzzle).
  handle('learn:example', async (_e, id) => {
    const { dataset, result } = await ensureLearn();
    const hits = result.hits.filter((h) => h.id === id && h.i >= 50);
    if (!hits.length) throw new Error('No real example in the data yet');
    return patterns.windowFor(dataset, pick(hits.slice(-60)), 30, 10);
  });
  // A random stretch of real daily bars (stock hidden until the end) for the school's trend
  // drill and trade replay: `before` bars to study, then `after` bars to play forward.
  handle('learn:replay', async (_e, { before = 60, after = 25 } = {}) => {
    const { dataset } = await ensureLearn();
    const syms = Object.keys(dataset).filter((s) => dataset[s].length >= before + after + 30);
    const sym = pick(syms);
    const bars = dataset[sym];
    const end = 20 + before + Math.floor(Math.random() * (bars.length - before - after - 20));
    return { symbol: sym, bars: bars.slice(end - before, end), future: bars.slice(end, end + after), atr: patterns.atr(bars, end), date: bars[end - 1].time * 1000 };
  });
  handle('guide:get', () => fs.readFileSync(path.join(__dirname, 'RESEARCH.md'), 'utf8'));
  desktopOnly('open:external', (_e, url) => {
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
  applyDataConfig();
  phoneCfg = { enabled: false, token: newToken(), ...readJson(phoneFile(), {}) };
  savePhone();
  applyPhone();
  lastScan = readJson(lastScanFile(), null);
  for (const c of [...(lastScan?.bullish || []), ...(lastScan?.bearish || []), ...(lastScan?.watchlist || [])]) {
    if (c.confidence === 'High' || (c.onWatch && Math.abs(c.newsScore) >= 3)) notified.add(`${c.symbol}:${Math.sign(c.composite)}`);
  }
  account = new Account(path.join(dataDir(), 'account.bin'), safeStorage);
  // Re-check the Pro license now and then (refreshPlan only calls Gumroad twice a day).
  account.refreshPlan().catch(() => {});
  setInterval(() => account.refreshPlan().then((st) => send('account:status', st)).catch(() => {}), 3600e3);
  paper = new PaperAccount(path.join(dataDir(), 'paper-account.json'), settings.accountSize || 10000);
  alerts = new Alerts(path.join(dataDir(), 'alerts.json'));
  buildBroker();
  brokerLoop();
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
