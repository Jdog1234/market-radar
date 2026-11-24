// The app itself. Loaded by the launcher (main.js) either from the installed copy or
// from a newer downloaded update — so everything here can change through auto-update.
const { app, BrowserWindow, ipcMain, shell, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const { scan } = require('./engine/scanner');
const { search, lookup } = require('./engine/lookup');
const tracker = require('./engine/tracker');
const { setCacheDir } = require('./engine/universe');

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

async function runScan() {
  if (scanning) return lastScan;
  scanning = true;
  win?.webContents.send('scan:progress', { stage: 'Starting…', pct: 0 });
  try {
    const result = await scan({ ...settings, econCacheFile: path.join(dataDir(), 'econ-cache.json') }, (p) => win?.webContents.send('scan:progress', p));
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
    win?.webContents.send('scan:result', result);
  } catch (err) {
    win?.webContents.send('scan:error', String(err?.message || err));
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
  ipcMain.handle('settings:get', () => settings);
  ipcMain.handle('settings:set', (_e, next) => {
    settings = { ...settings, ...next };
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2));
    schedule();
    return settings;
  });
  ipcMain.handle('scan:last', () => lastScan);
  ipcMain.handle('scan:run', () => runScan());
  ipcMain.handle('stock:search', (_e, q) => search(q));
  ipcMain.handle('stock:lookup', (_e, sym) => lookup(sym, lastScan));
  ipcMain.handle('track:get', () => trackRecord(true));
  ipcMain.handle('guide:get', () => fs.readFileSync(path.join(__dirname, 'RESEARCH.md'), 'utf8'));
  ipcMain.handle('open:external', (_e, url) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
  });

  settings = { ...DEFAULTS, ...readJson(settingsFile(), {}) };
  lastScan = readJson(lastScanFile(), null);
  for (const c of [...(lastScan?.bullish || []), ...(lastScan?.bearish || []), ...(lastScan?.watchlist || [])]) {
    if (c.confidence === 'High' || (c.onWatch && Math.abs(c.newsScore) >= 3)) notified.add(`${c.symbol}:${Math.sign(c.composite)}`);
  }
  createWindow(launcher);
  schedule();
  // Warm the track-record cache in the background so trade ideas can show measured win rates.
  trackRecord().then(() => {
    if (lastScan) {
      attachChances(lastScan);
      win?.webContents.send('scan:result', lastScan);
    }
  }).catch(() => {});
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow(launcher));
}

module.exports = { start };
