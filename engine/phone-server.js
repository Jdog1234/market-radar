// Phone access: serves the Market Radar UI to phones on the same network and lets them call the
// same handlers the desktop window uses, so the phone sees the Mac's real data (signals, watchlist,
// paper account, track record, settings). Live updates go out over Server-Sent Events.
//
// Security: every API call and the event stream need the pairing token shown in Settings.
// The UI files themselves carry no data and are served without it.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.md': 'text/markdown; charset=utf-8' };
// Handlers a phone may not call: things that only make sense on the Mac itself.
// Never callable from a phone (also not registered for it in app-main.js): keys, licenses, billing, broker setup.
const BLOCKED = new Set(['open:external', 'phone:info', 'phone:set', 'phone:newToken', 'data:setPolygonKey', 'data:testPolygon', 'broker:setKeys', 'broker:test', 'broker:remove', 'broker:select', 'broker:setLimit', 'account:activate', 'account:signout', 'account:upgrade', 'account:billing']);
const SETTINGS_KEYS = ['watchlist', 'refreshMinutes', 'minMarketCap', 'minPrice', 'notify', 'accountSize', 'riskPct'];

let server = null;
let state = null; // { port, getToken, handlers, rendererDir, version }
const clients = new Set();

function sameToken(a, b) {
  const x = Buffer.from(String(a || '')), y = Buffer.from(String(b || ''));
  return x.length === y.length && x.length > 0 && crypto.timingSafeEqual(x, y);
}

function addresses() {
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
  return out;
}

// Tailscale gives each device an address in 100.64.0.0/10; those reach the Mac from anywhere.
const isTailnet = (a) => { const [x, y] = a.split('.').map(Number); return x === 100 && y >= 64 && y <= 127; };

// Addresses on this Wi-Fi / network
function urls() {
  if (!server) return [];
  const p = state.port;
  const host = os.hostname().replace(/\.local$/, '');
  return [...addresses().filter((a) => !isTailnet(a)).map((a) => `http://${a}:${p}`), `http://${host}.local:${p}`];
}

// Addresses that work away from home (Tailscale on the Mac and the phone)
function remoteUrls() {
  if (!server) return [];
  return addresses().filter(isTailnet).map((a) => `http://${a}:${state.port}`);
}

// index.html for phones: add the home-screen app tags
function indexHtml() {
  let html = fs.readFileSync(path.join(state.rendererDir, 'index.html'), 'utf8');
  const tags = [
    '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />',
    '<meta name="apple-mobile-web-app-capable" content="yes" />',
    '<meta name="mobile-web-app-capable" content="yes" />',
    '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />',
    '<meta name="apple-mobile-web-app-title" content="Market Radar" />',
    '<meta name="theme-color" content="#0b0f14" />',
    '<link rel="manifest" href="manifest.webmanifest" />',
    '<link rel="apple-touch-icon" href="icon.png" />',
  ].join('\n  ');
  return html.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n  ${tags}`).replace('<body>', '<body class="phone">');
}

// start_url carries the pairing code so the home-screen app opens already paired
// (on iPhone the home-screen app does not share storage with Safari).
const manifest = (t) => JSON.stringify({ name: 'Market Radar', short_name: 'Market Radar', start_url: /^[\w-]{8,64}$/.test(t || '') ? `./?t=${t}` : './', scope: './', display: 'standalone', background_color: '#0b0f14', theme_color: '#0b0f14', icons: [{ src: 'icon.png', sizes: '1024x1024', type: 'image/png', purpose: 'any' }] });

function readBody(req, limit = 1e6) {
  return new Promise((resolve, reject) => {
    let n = 0; const chunks = [];
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function onRequest(req, res) {
  const url = new URL(req.url, 'http://x');
  const send = (code, type, body, extra = {}) => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra }); res.end(body); };
  try {
    if (url.pathname === '/api/invoke' && req.method === 'POST') {
      if (!sameToken(req.headers['x-token'], state.getToken())) return send(401, 'application/json', JSON.stringify({ ok: false, error: 'Not paired. Scan the code in Market Radar on your Mac (Settings → Phone app).' }));
      const { ch, args = [] } = JSON.parse(await readBody(req));
      if (typeof ch !== 'string' || BLOCKED.has(ch)) return send(403, 'application/json', JSON.stringify({ ok: false, error: 'Not available on the phone' }));
      if (ch === 'app:info') return send(200, 'application/json', JSON.stringify({ ok: true, result: { version: state.version, phone: true } }));
      if (ch === 'update:status') return send(200, 'application/json', JSON.stringify({ ok: true, result: { state: 'idle' } }));
      const fn = state.handlers[ch];
      if (!fn) return send(404, 'application/json', JSON.stringify({ ok: false, error: `Unknown action ${ch}` }));
      let a = Array.isArray(args) ? args : [];
      if (ch === 'settings:set') a = [Object.fromEntries(Object.entries(a[0] || {}).filter(([k]) => SETTINGS_KEYS.includes(k)))];
      try {
        const result = await fn({ client: 'phone' }, ...a);
        return send(200, 'application/json', JSON.stringify({ ok: true, result: result === undefined ? null : result }));
      } catch (err) {
        return send(200, 'application/json', JSON.stringify({ ok: false, error: String(err?.message || err) }));
      }
    }
    if (url.pathname === '/api/events') {
      if (!sameToken(url.searchParams.get('t'), state.getToken())) return send(401, 'text/plain', 'Not paired');
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write('retry: 3000\n\n');
      const c = { res };
      clients.add(c);
      const ping = setInterval(() => res.write(': ping\n\n'), 20000);
      req.on('close', () => { clearInterval(ping); clients.delete(c); });
      return;
    }
    if (url.pathname === '/manifest.webmanifest') return send(200, TYPES['.webmanifest'], manifest(url.searchParams.get('t')));
    if (url.pathname === '/' || url.pathname === '/index.html') return send(200, TYPES['.html'], indexHtml());
    // static UI files (no data in them)
    const file = path.normalize(path.join(state.rendererDir, decodeURIComponent(url.pathname)));
    if (!file.startsWith(state.rendererDir + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(404, 'text/plain', 'Not found');
    return send(200, TYPES[path.extname(file)] || 'application/octet-stream', fs.readFileSync(file), { 'cache-control': 'max-age=300' });
  } catch (err) {
    return send(500, 'text/plain', 'Error');
  }
}

function start(opts) {
  state = { ...opts, rendererDir: path.resolve(opts.rendererDir) };
  if (server) return Promise.resolve(urls());
  return new Promise((resolve) => {
    let port = opts.port || 8765;
    const tryListen = () => {
      server = http.createServer(onRequest);
      server.on('error', (e) => {
        server = null;
        if (e.code === 'EADDRINUSE' && port < (opts.port || 8765) + 10) { port++; tryListen(); } else resolve([]);
      });
      server.listen(port, '0.0.0.0', () => { state.port = port; resolve(urls()); });
    };
    tryListen();
  });
}

function stop() {
  for (const c of clients) c.res.end();
  clients.clear();
  if (server) server.close();
  server = null;
}

// Live events (scan results, paper updates, ticks) to every connected phone.
function broadcast(ch, data) {
  if (!clients.size) return;
  const msg = `event: ${ch}\ndata: ${JSON.stringify(data === undefined ? null : data)}\n\n`;
  for (const c of clients) c.res.write(msg);
}

module.exports = { start, stop, broadcast, urls, remoteUrls, running: () => !!server, port: () => state?.port, clientCount: () => clients.size };
