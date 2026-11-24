// Launcher + auto-updater. This file ships inside the installer and changes rarely.
// The app code (app-main.js, engine/, renderer/) is loaded from either the installed
// copy or a newer update package downloaded from GitHub Releases, so every installed
// copy runs the latest version without reinstalling.
//
// Bump SHELL_VERSION only when this file, Electron, or package.json "build" settings
// change. Code updates that need a newer launcher are skipped and the user is told to
// download the new installer instead.
const SHELL_VERSION = 1;
const REPO = 'Jdog1234/market-radar';
const FEED = `https://github.com/${REPO}/releases/latest/download/update.json`;
const RELEASES = `https://github.com/${REPO}/releases/latest`;
const CHECK_EVERY_MS = 3 * 3600e3;

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const crypto = require('crypto');
const ofs = require('original-fs'); // plain fs: lets us write/rename .asar files as ordinary files

const updDir = () => path.join(app.getPath('userData'), 'updates');
const stateFile = () => path.join(updDir(), 'current.json');
const bundledVersion = require('./package.json').version;

function readState() {
  try {
    return JSON.parse(ofs.readFileSync(stateFile(), 'utf8'));
  } catch {
    return null;
  }
}
function writeState(s) {
  ofs.mkdirSync(updDir(), { recursive: true });
  ofs.writeFileSync(stateFile(), JSON.stringify(s, null, 2));
}

function newer(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

// Decide which copy of the app code to run.
function pickCode() {
  const s = readState();
  const ok =
    s && s.version && !s.broken && newer(s.version, bundledVersion) && (s.shell || 1) <= SHELL_VERSION &&
    (s.boots || 0) < 3 && ofs.existsSync(path.join(updDir(), s.file));
  if (!ok) {
    if (s && (s.boots || 0) >= 3 && !s.broken) writeState({ ...s, broken: true }); // crashed repeatedly → fall back
    return { dir: __dirname, version: bundledVersion, fromUpdate: false };
  }
  writeState({ ...s, boots: (s.boots || 0) + 1 });
  return { dir: path.join(updDir(), s.file), version: s.version, fromUpdate: true };
}

let code;
let status = { state: 'idle' };

const send = (ch, payload) => BrowserWindow.getAllWindows().forEach((w) => w.webContents.send(ch, payload));
const setStatus = (s) => {
  status = s;
  send('update:status', s);
};

async function download(url) {
  const res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'MarketRadar-Updater' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return Buffer.from(await res.arrayBuffer());
}

async function checkForUpdates() {
  if (status.state === 'checking' || status.state === 'downloading') return status;
  setStatus({ state: 'checking' });
  try {
    // Query string sidesteps GitHub's few-minute cache of the "latest" redirect.
    const manifest = JSON.parse((await download(`${FEED}?t=${Date.now()}`)).toString('utf8'));
    const installed = readState();
    // Newest version we already have: running now, or downloaded and waiting for a restart.
    const waiting = installed && !installed.broken && newer(installed.version, code.version) ? installed.version : null;
    const have = waiting || code.version;
    const badRelease = installed?.broken && installed.version === manifest.version;
    if (!newer(manifest.version, have) || badRelease) {
      setStatus(waiting ? { state: 'ready', version: waiting, notes: installed.notes } : { state: 'latest', version: code.version });
      return status;
    }
    if ((manifest.shell || 1) > SHELL_VERSION) {
      setStatus({ state: 'installer', version: manifest.version, notes: manifest.notes, url: RELEASES });
      return status;
    }
    setStatus({ state: 'downloading', version: manifest.version });
    const buf = await download(`https://github.com/${REPO}/releases/download/v${manifest.version}/${manifest.file}`);
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (sha !== manifest.sha256) throw new Error('Update failed its integrity check, so it was skipped');
    ofs.mkdirSync(updDir(), { recursive: true });
    const tmp = path.join(updDir(), `${manifest.file}.part`);
    ofs.writeFileSync(tmp, buf);
    ofs.renameSync(tmp, path.join(updDir(), manifest.file));
    writeState({ version: manifest.version, file: manifest.file, shell: manifest.shell || 1, boots: 0, notes: manifest.notes, at: Date.now() });
    // Remove older downloaded packages.
    for (const f of ofs.readdirSync(updDir())) {
      if (f.endsWith('.asar') && f !== manifest.file && f !== path.basename(code.dir)) ofs.rmSync(path.join(updDir(), f), { force: true });
    }
    setStatus({ state: 'ready', version: manifest.version, notes: manifest.notes });
  } catch (err) {
    setStatus({ state: 'error', error: String(err?.message || err), version: code.version });
  }
  return status;
}

ipcMain.handle('app:info', () => ({ version: code.version, fromUpdate: code.fromUpdate, shell: SHELL_VERSION, releases: RELEASES }));
ipcMain.handle('update:status', () => status);
ipcMain.handle('update:check', () => checkForUpdates());
ipcMain.handle('update:restart', () => {
  app.relaunch();
  app.exit(0);
});
ipcMain.handle('update:installer', () => shell.openExternal(RELEASES));

app.whenReady().then(() => {
  code = pickCode();
  let mod;
  try {
    mod = require(path.join(code.dir, 'app-main.js'));
  } catch (err) {
    if (!code.fromUpdate) throw err;
    // A downloaded update failed to load: mark it broken and run the installed copy.
    writeState({ ...readState(), broken: true, boots: 99 });
    code = { dir: __dirname, version: bundledVersion, fromUpdate: false };
    mod = require('./app-main.js');
  }
  mod.start({
    version: code.version,
    markHealthy: () => {
      const s = readState();
      if (code.fromUpdate && s) writeState({ ...s, boots: 0 });
    },
  });
  setTimeout(checkForUpdates, 8000);
  setInterval(checkForUpdates, CHECK_EVERY_MS);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
