// Live prices from Yahoo Finance's streaming websocket (the one finance.yahoo.com uses).
//
// A tiny websocket client written on plain TLS sockets, so the code update needs no npm
// package (node_modules can't ship in the code asar, and Electron 33's Node has no global
// WebSocket). Messages are base64 protobuf "PricingData", decoded by hand below.
//
// Events: 'tick' (quote), 'status' ({ connected, since }).
const tls = require('tls');
const net = require('net');
const http = require('http');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const URL_DEFAULT = 'wss://streamer.finance.yahoo.com/?version=2';

// ---------- protobuf (just enough for PricingData) ----------
function readVarint(buf, pos) {
  let result = 0;
  let mul = 1;
  for (;;) {
    if (pos >= buf.length) throw new Error('truncated varint');
    const b = buf[pos++];
    result += (b & 0x7f) * mul;
    if (b < 0x80) return [result, pos];
    mul *= 128;
    if (mul > 2 ** 70) throw new Error('varint too long');
  }
}
const unzig = (n) => (n % 2 === 0 ? n / 2 : -(n + 1) / 2); // zig-zag, safe for numbers > 2^31

const FIELDS = {
  1: ['id', 'string'], 2: ['price', 'float'], 3: ['time', 'sint'], 4: ['currency', 'string'], 5: ['exchange', 'string'],
  6: ['quoteType', 'int'], 7: ['marketHours', 'int'], 8: ['changePercent', 'float'], 9: ['dayVolume', 'sint'],
  10: ['dayHigh', 'float'], 11: ['dayLow', 'float'], 12: ['change', 'float'], 13: ['shortName', 'string'],
  22: ['lastSize', 'sint'], 23: ['bid', 'float'], 24: ['bidSize', 'sint'], 25: ['ask', 'float'], 26: ['askSize', 'sint'],
  28: ['openPrice', 'float'], 29: ['previousClose', 'float'],
};

function decodePricing(buf) {
  const out = {};
  let pos = 0;
  while (pos < buf.length) {
    let key;
    [key, pos] = readVarint(buf, pos);
    const field = Math.floor(key / 8);
    const wire = key & 7;
    const spec = FIELDS[field];
    if (wire === 0) {
      let v;
      [v, pos] = readVarint(buf, pos);
      if (spec) out[spec[0]] = spec[1] === 'sint' ? unzig(v) : v;
    } else if (wire === 1) {
      if (spec) out[spec[0]] = buf.readDoubleLE(pos);
      pos += 8;
    } else if (wire === 2) {
      let len;
      [len, pos] = readVarint(buf, pos);
      if (spec) out[spec[0]] = buf.toString('utf8', pos, pos + len);
      pos += len;
    } else if (wire === 5) {
      if (spec) out[spec[0]] = buf.readFloatLE(pos);
      pos += 4;
    } else throw new Error(`unsupported wire type ${wire}`);
    if (pos > buf.length) throw new Error('truncated field');
  }
  return out;
}

// Floats arrive as 32-bit, so 187.45 decodes as 187.4499969…; round back to the cent grid.
const r4 = (x) => (typeof x === 'number' && Number.isFinite(x) ? Math.round(x * 1e4) / 1e4 : null);
const HOURS = { 0: 'pre', 1: 'regular', 2: 'post', 3: 'post' };

// One websocket message → a normalized quote (or null).
function parseMessage(text) {
  let b64 = text;
  try {
    const j = JSON.parse(text);
    if (j && typeof j === 'object') {
      if (j.type && j.type !== 'pricing') return null;
      b64 = j.message;
    }
  } catch {}
  if (typeof b64 !== 'string' || !b64) return null;
  const p = decodePricing(Buffer.from(b64, 'base64'));
  if (!p.id || !(p.price > 0)) return null;
  const bid = r4(p.bid);
  const ask = r4(p.ask);
  return {
    symbol: p.id.toUpperCase(), price: r4(p.price), time: p.time || null, session: HOURS[p.marketHours] || 'regular',
    changePct: r4(p.changePercent), change: r4(p.change), volume: p.dayVolume ?? null, dayHigh: r4(p.dayHigh), dayLow: r4(p.dayLow),
    lastSize: p.lastSize ?? null, bid: bid > 0 ? bid : null, ask: ask > 0 ? ask : null, bidSize: p.bidSize ?? null, askSize: p.askSize ?? null,
  };
}

// ---------- websocket framing ----------
function frame(opcode, payload = Buffer.alloc(0)) {
  // Client frames must be masked (RFC 6455 §5.3).
  const mask = crypto.randomBytes(4);
  const len = payload.length;
  const head = len < 126 ? Buffer.alloc(2) : len < 65536 ? Buffer.alloc(4) : Buffer.alloc(10);
  head[0] = 0x80 | opcode;
  if (len < 126) head[1] = 0x80 | len;
  else if (len < 65536) {
    head[1] = 0x80 | 126;
    head.writeUInt16BE(len, 2);
  } else {
    head[1] = 0x80 | 127;
    head.writeBigUInt64BE(BigInt(len), 2);
  }
  const body = Buffer.from(payload);
  for (let i = 0; i < body.length; i++) body[i] ^= mask[i & 3];
  return Buffer.concat([head, mask, body]);
}

class YahooStream extends EventEmitter {
  constructor({ url = URL_DEFAULT, proxy = process.env.HTTPS_PROXY || process.env.https_proxy || '', ca = null } = {}) {
    super();
    this.url = new URL(url);
    this.proxy = proxy;
    this.ca = ca;
    this.want = new Set(); // symbols we should be subscribed to
    this.subbed = new Set(); // symbols the server knows about
    this.sock = null;
    this.connected = false;
    this.lastMsgAt = 0; // any frame, pongs included
    this.lastTickAt = 0;
    this.backoff = 1000;
    this.timer = null;
    this.ping = null;
    this.stopped = true;
  }

  // Set the full list of symbols to stream. Connects when there is something to watch.
  setSymbols(list) {
    this.want = new Set(list.map((s) => String(s).toUpperCase()).filter((s) => /^[A-Z0-9.^=\-]{1,12}$/.test(s)));
    if (!this.want.size) return this.stop();
    if (this.stopped) {
      this.stopped = false;
      this.connect();
    } else if (this.connected) this.resubscribe();
  }

  healthy() {
    return this.connected && Date.now() - this.lastMsgAt < 45e3;
  }

  stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    this.teardown();
  }

  teardown() {
    clearInterval(this.ping);
    this.ping = null;
    if (this.sock) {
      this.sock.removeAllListeners();
      this.sock.on('error', () => {});
      this.sock.destroy();
    }
    this.sock = null;
    this.subbed.clear();
    if (this.connected) {
      this.connected = false;
      this.emit('status', { connected: false });
    }
  }

  retry() {
    this.teardown();
    if (this.stopped) return;
    clearTimeout(this.timer);
    const wait = this.backoff * (0.75 + Math.random() * 0.5);
    this.backoff = Math.min(this.backoff * 2, 60e3);
    this.timer = setTimeout(() => this.connect(), wait);
  }

  // TCP+TLS to the host, through an HTTP CONNECT proxy when one is configured.
  openSocket(cb) {
    const host = this.url.hostname;
    const port = +this.url.port || (this.url.protocol === 'ws:' ? 80 : 443);
    const secure = this.url.protocol !== 'ws:';
    const done = (raw) => cb(null, secure ? tls.connect({ socket: raw, servername: host, ca: this.ca || undefined }) : raw);
    const useProxy = secure && this.proxy && !/^(localhost|127\.)/.test(host);
    if (!useProxy) {
      if (!secure) return done(net.connect(port, host));
      return cb(null, tls.connect({ host, port, servername: host, ca: this.ca || undefined }));
    }
    const p = new URL(this.proxy);
    const req = http.request({ host: p.hostname, port: p.port || 80, method: 'CONNECT', path: `${host}:${port}`, headers: { Host: `${host}:${port}` } });
    req.on('connect', (res, raw) => (res.statusCode === 200 ? done(raw) : cb(new Error(`proxy ${res.statusCode}`))));
    req.on('error', cb);
    req.setTimeout(15e3, () => req.destroy(new Error('proxy timeout')));
    req.end();
  }

  connect() {
    if (this.stopped) return;
    this.teardown();
    this.openSocket((err, sock) => {
      if (err) return this.retry();
      this.sock = sock;
      const key = crypto.randomBytes(16).toString('base64');
      let buf = Buffer.alloc(0);
      let upgraded = false;
      let fragments = [];
      const timeout = setTimeout(() => !upgraded && this.retry(), 15e3);
      sock.on('error', () => this.retry());
      sock.on('close', () => this.retry());
      const write = () =>
        sock.write(
          `GET ${this.url.pathname}${this.url.search} HTTP/1.1\r\nHost: ${this.url.host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
            `Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\nOrigin: https://finance.yahoo.com\r\n` +
            `User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36\r\n\r\n`
        );
      sock.once(sock instanceof tls.TLSSocket ? 'secureConnect' : 'connect', write);
      sock.on('data', (chunk) => {
        buf = Buffer.concat([buf, chunk]);
        if (!upgraded) {
          const end = buf.indexOf('\r\n\r\n');
          if (end < 0) return;
          const head = buf.toString('latin1', 0, end);
          const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
          if (!/^HTTP\/1\.1 101/.test(head) || !head.toLowerCase().includes(accept.toLowerCase())) return this.retry();
          upgraded = true;
          clearTimeout(timeout);
          buf = buf.subarray(end + 4);
          this.onOpen();
        }
        // Parse as many complete frames as we have.
        while (buf.length >= 2) {
          const fin = buf[0] & 0x80;
          const op = buf[0] & 0x0f;
          const masked = buf[1] & 0x80;
          let len = buf[1] & 0x7f;
          let off = 2;
          if (len === 126) {
            if (buf.length < 4) return;
            len = buf.readUInt16BE(2);
            off = 4;
          } else if (len === 127) {
            if (buf.length < 10) return;
            len = Number(buf.readBigUInt64BE(2));
            off = 10;
          }
          if (len > 16 * 1024 * 1024) return this.retry();
          const maskAt = off;
          if (masked) off += 4;
          if (buf.length < off + len) return;
          let payload = buf.subarray(off, off + len);
          if (masked) {
            payload = Buffer.from(payload);
            for (let i = 0; i < payload.length; i++) payload[i] ^= buf[maskAt + (i & 3)];
          }
          buf = buf.subarray(off + len);
          this.lastMsgAt = Date.now();
          if (op === 0x8) return this.retry(); // server closed
          if (op === 0x9) sock.write(frame(0xa, payload)); // ping → pong
          if (op === 0xa) continue; // pong
          if (op === 0x1 || op === 0x2 || op === 0x0) {
            fragments.push(Buffer.from(payload));
            if (!fin) continue;
            const text = Buffer.concat(fragments).toString('utf8');
            fragments = [];
            this.onText(text);
          }
        }
      });
    });
  }

  onOpen() {
    this.connected = true;
    this.lastMsgAt = Date.now();
    this.backoff = 1000;
    this.emit('status', { connected: true });
    this.resubscribe();
    // Keep-alive: ping every 15 s; if nothing at all comes back for 45 s, reconnect.
    this.ping = setInterval(() => {
      if (!this.sock) return;
      if (Date.now() - this.lastMsgAt > 45e3) return this.retry();
      this.sock.write(frame(0x9, Buffer.from('k')));
    }, 15e3);
  }

  send(obj) {
    if (this.sock && this.connected) this.sock.write(frame(0x1, Buffer.from(JSON.stringify(obj))));
  }

  resubscribe() {
    const add = [...this.want].filter((s) => !this.subbed.has(s));
    const drop = [...this.subbed].filter((s) => !this.want.has(s));
    if (drop.length) this.send({ unsubscribe: drop });
    if (add.length) this.send({ subscribe: add });
    this.subbed = new Set(this.want);
  }

  onText(text) {
    let q;
    try {
      q = parseMessage(text);
    } catch {
      return;
    }
    if (!q) return;
    this.lastTickAt = Date.now();
    this.emit('tick', q);
  }
}

module.exports = { YahooStream, decodePricing, parseMessage, readVarint };
