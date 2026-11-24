// Tests for the Yahoo stream client against a local fake server: node scripts/test-stream.js
// No network: checks the protobuf decoder, websocket framing, subscribe/unsubscribe and reconnect.
const assert = require('assert');
const http = require('http');
const crypto = require('crypto');
const { YahooStream, parseMessage } = require('../engine/stream');

// --- a minimal protobuf encoder for PricingData ---
const varint = (n) => {
  const out = [];
  while (n >= 128) {
    out.push((n % 128) | 128);
    n = Math.floor(n / 128);
  }
  out.push(n);
  return Buffer.from(out);
};
const zig = (n) => (n >= 0 ? n * 2 : -n * 2 - 1);
function encode(p) {
  const parts = [];
  const key = (f, w) => varint(f * 8 + w);
  const str = (f, s) => parts.push(key(f, 2), varint(Buffer.byteLength(s)), Buffer.from(s));
  const flt = (f, x) => { const b = Buffer.alloc(4); b.writeFloatLE(x); parts.push(key(f, 5), b); };
  const sint = (f, x) => parts.push(key(f, 0), varint(zig(x)));
  const int = (f, x) => parts.push(key(f, 0), varint(x));
  str(1, p.id); flt(2, p.price); sint(3, p.time); str(4, 'USD'); str(5, 'NMS'); int(6, 8); int(7, p.marketHours);
  flt(8, p.changePercent); sint(9, p.dayVolume); flt(10, p.dayHigh); flt(11, p.dayLow); flt(12, p.change);
  parts.push(key(30, 1), Buffer.alloc(8)); // an unknown fixed64 field must be skipped
  sint(22, p.lastSize); flt(23, p.bid); sint(24, p.bidSize); flt(25, p.ask); sint(26, p.askSize);
  return Buffer.concat(parts).toString('base64');
}
const sample = { id: 'AAPL', price: 187.45, time: 1764000000123, marketHours: 1, changePercent: -1.25, dayVolume: 51234567, dayHigh: 189.1, dayLow: 186.2, change: -2.37, lastSize: 100, bid: 187.44, bidSize: 300, ask: 187.46, askSize: 200 };

let passed = 0;
const ok = (name) => { passed++; console.log(`  ok  ${name}`); };

// 1. decoder
{
  const q = parseMessage(JSON.stringify({ type: 'pricing', message: encode(sample) }));
  assert.strictEqual(q.symbol, 'AAPL');
  assert.strictEqual(q.price, 187.45);
  assert.strictEqual(q.bid, 187.44);
  assert.strictEqual(q.ask, 187.46);
  assert.strictEqual(q.time, 1764000000123);
  assert.strictEqual(q.volume, 51234567);
  assert.strictEqual(q.session, 'regular');
  assert.strictEqual(q.changePct, -1.25);
  assert.strictEqual(q.bidSize, 300);
  assert.strictEqual(parseMessage(encode({ ...sample, marketHours: 0 })).session, 'pre', 'bare base64 message accepted');
  assert.strictEqual(parseMessage(JSON.stringify({ type: 'heartbeat' })), null);
  assert.throws(() => parseMessage(Buffer.from([0x0a, 0x50, 0x41]).toString('base64')), /truncated/);
  ok('protobuf PricingData decodes (floats rounded, sint64 zig-zag, unknown fields skipped)');
}

// 2. websocket client against a local server
function serverFrame(op, payload, fragmentAt = 0) {
  const one = (fin, opcode, data) => {
    const len = data.length;
    const head = len < 126 ? Buffer.from([fin | opcode, len]) : Buffer.from([fin | opcode, 126, len >> 8, len & 255]);
    return Buffer.concat([head, data]);
  };
  if (!fragmentAt) return one(0x80, op, payload);
  return Buffer.concat([one(0, op, payload.subarray(0, fragmentAt)), one(0x80, 0, payload.subarray(fragmentAt))]);
}
function readClientFrames(state, chunk, onText) {
  state.buf = Buffer.concat([state.buf, chunk]);
  while (state.buf.length >= 6) {
    const op = state.buf[0] & 15;
    let len = state.buf[1] & 127;
    let off = 2;
    if (len === 126) { len = state.buf.readUInt16BE(2); off = 4; }
    assert.ok(state.buf[1] & 0x80, 'client frames must be masked');
    if (state.buf.length < off + 4 + len) return;
    const mask = state.buf.subarray(off, off + 4);
    const data = Buffer.from(state.buf.subarray(off + 4, off + 4 + len));
    for (let i = 0; i < data.length; i++) data[i] ^= mask[i & 3];
    state.buf = state.buf.subarray(off + 4 + len);
    if (op === 1) onText(data.toString());
  }
}

const server = http.createServer();
const conns = [];
const received = [];
server.on('upgrade', (req, sock) => {
  assert.strictEqual(req.headers.origin, 'https://finance.yahoo.com');
  const accept = crypto.createHash('sha1').update(req.headers['sec-websocket-key'] + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const state = { buf: Buffer.alloc(0) };
  conns.push(sock);
  sock.on('data', (c) => readClientFrames(state, c, (t) => received.push({ conn: conns.indexOf(sock), msg: JSON.parse(t) })));
  sock.on('error', () => {});
});

const wait = (cond, ms = 5000) => new Promise((res, rej) => {
  const t0 = Date.now();
  const iv = setInterval(() => {
    if (cond()) { clearInterval(iv); res(); } else if (Date.now() - t0 > ms) { clearInterval(iv); rej(new Error('timed out')); }
  }, 10);
});

server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const s = new YahooStream({ url: `ws://127.0.0.1:${port}/?version=2`, proxy: '' });
  const ticks = [];
  const statuses = [];
  s.on('tick', (q) => ticks.push(q));
  s.on('status', (x) => statuses.push(x.connected));
  try {
    s.setSymbols(['aapl', 'msft']);
    await wait(() => received.length >= 1);
    assert.deepStrictEqual(received[0].msg, { subscribe: ['AAPL', 'MSFT'] });
    ok('connects with the Yahoo origin and subscribes');

    const msg = Buffer.from(JSON.stringify({ type: 'pricing', message: encode(sample) }));
    conns[0].write(Buffer.concat([serverFrame(1, msg), serverFrame(1, msg, 7)])); // one whole, one fragmented, same TCP chunk
    await wait(() => ticks.length >= 2);
    assert.strictEqual(ticks[1].ask, 187.46);
    ok('reads whole and fragmented text frames');

    s.setSymbols(['MSFT', 'TSLA']);
    await wait(() => received.length >= 3);
    assert.deepStrictEqual(received.slice(1).map((r) => r.msg), [{ unsubscribe: ['AAPL'] }, { subscribe: ['TSLA'] }]);
    ok('changes subscriptions incrementally');

    conns[0].destroy(); // server drops the connection
    await wait(() => conns.length >= 2 && received.some((r) => r.conn === 1), 8000);
    assert.deepStrictEqual(received.find((r) => r.conn === 1).msg, { subscribe: ['MSFT', 'TSLA'] });
    assert.deepStrictEqual(statuses.slice(0, 3), [true, false, true]);
    ok('reconnects with backoff and resubscribes');

    s.setSymbols([]);
    assert.strictEqual(s.connected, false);
    ok('stops when there is nothing to watch');
  } catch (e) {
    console.error('FAIL', e);
    process.exitCode = 1;
  }
  s.stop();
  server.close();
  for (const c of conns) c.destroy();
  console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
});
