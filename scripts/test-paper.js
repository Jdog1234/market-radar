// Tests for the paper-trading engine: node scripts/test-paper.js
// No network. Uses a fake clock so it runs the same at any hour.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PaperAccount } = require('../engine/paper');

const OPEN = Date.parse('2026-11-24T15:00:00Z'); // Tue 10:00 ET
const PRE = Date.parse('2026-11-24T13:00:00Z'); // Tue 08:00 ET
let now = OPEN;
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paper-test-'));
let n = 0;
const fresh = (cash = 100000) => new PaperAccount(path.join(dir, `acct-${n++}.json`), cash, { clock: () => now });
const q = (last, bid, ask, extra = {}) => ({ last, bid, ask, at: now, session: 'regular', ...extra });
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-6, `${msg}: expected ${b}, got ${a}`);
const working = (a) => a.s.orders.filter((o) => o.status === 'working');
const lastFill = (a) => a.s.fills.at(-1);

let passed = 0;
function test(name, fn) {
  now = OPEN;
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name}\n      ${e.message}`);
    process.exitCode = 1;
  }
}

test('market buy fills at the ask, market sell at the bid', () => {
  const a = fresh();
  a.tick({ AAPL: q(100, 99.98, 100.02) });
  a.place({ symbol: 'AAPL', side: 'buy', qty: 10 });
  near(lastFill(a).price, 100.02, 'buy fill');
  a.place({ symbol: 'AAPL', side: 'sell', qty: 10 });
  near(lastFill(a).price, 99.98, 'sell fill');
  near(lastFill(a).pnl, -0.4, 'round trip pays the spread');
  assert.strictEqual(Object.keys(a.s.positions).length, 0);
});

test('no bid/ask: last ± 0.05% slippage', () => {
  const a = fresh();
  a.tick({ MSFT: q(200, null, null) });
  a.place({ symbol: 'MSFT', side: 'buy', qty: 1 });
  near(lastFill(a).price, 200.1, 'buy fill');
  a.place({ symbol: 'MSFT', side: 'sell', qty: 1 });
  near(lastFill(a).price, 199.9, 'sell fill');
});

test('crossed or absurd spreads are ignored (fallback to last)', () => {
  const a = fresh();
  a.tick({ X: q(50, 50.5, 49.5) }); // crossed
  a.place({ symbol: 'X', side: 'buy', qty: 1 });
  near(lastFill(a).price, 50.025, 'crossed → last + slippage');
  a.tick({ X: q(50, 40, 60) }); // 40% wide
  a.place({ symbol: 'X', side: 'sell', qty: 1 });
  near(lastFill(a).price, 49.975, 'wide → last - slippage');
});

test('limit buy triggers on the ask, not the last trade', () => {
  const a = fresh();
  a.tick({ NVDA: q(100.1, 100.05, 100.15) });
  const o = a.place({ symbol: 'NVDA', side: 'buy', qty: 5, type: 'limit', price: 100 });
  a.tick({ NVDA: q(99.99, 99.95, 100.03) }); // last below the limit, but the ask is not
  assert.strictEqual(o.status, 'working', 'should not fill while ask > limit');
  a.tick({ NVDA: q(99.97, 99.94, 99.98) });
  assert.strictEqual(o.status, 'filled');
  near(o.fillPrice, 99.98, 'fills at the (better) ask');
});

test('limit buy gapped through fills at the ask; never worse than the limit', () => {
  const a = fresh();
  a.tick({ T: q(10, 9.99, 10.01) });
  const o = a.place({ symbol: 'T', side: 'buy', qty: 1, type: 'limit', price: 9.5 });
  a.tick({ T: q(9, 8.99, 9.01) });
  near(o.fillPrice, 9.01, 'gap fill at ask');
});

test('limit sell triggers when bid >= limit', () => {
  const a = fresh();
  a.tick({ AMD: q(150, 149.98, 150.02) });
  a.place({ symbol: 'AMD', side: 'buy', qty: 10 });
  const o = a.place({ symbol: 'AMD', side: 'sell', qty: 10, type: 'limit', price: 152 });
  a.tick({ AMD: q(152.01, 151.99, 152.03) }); // last above, bid below
  assert.strictEqual(o.status, 'working');
  a.tick({ AMD: q(152.05, 152.02, 152.06) });
  assert.strictEqual(o.status, 'filled');
  near(o.fillPrice, 152.02, 'fills at the bid (better than limit)');
});

test('stops trigger on the trade price and fill at bid/ask', () => {
  const a = fresh();
  a.tick({ TSLA: q(200, 199.9, 200.1) });
  const buyStop = a.place({ symbol: 'TSLA', side: 'buy', qty: 1, type: 'stop', price: 201 });
  a.tick({ TSLA: q(200.9, 200.95, 201.05) }); // ask through the stop, last not
  assert.strictEqual(buyStop.status, 'working', 'stop uses the last trade, not the ask');
  a.tick({ TSLA: q(201, 200.95, 201.08) });
  assert.strictEqual(buyStop.status, 'filled');
  near(buyStop.fillPrice, 201.08, 'buy stop fills at the ask');
  const sellStop = a.place({ symbol: 'TSLA', side: 'sell', qty: 1, type: 'stop', price: 199 });
  a.tick({ TSLA: q(198.5, 198.4, 198.6) });
  near(sellStop.fillPrice, 198.4, 'sell stop gapped fills at the bid');
});

test('stops on the wrong side of the market are rejected', () => {
  const a = fresh();
  a.tick({ TSLA: q(200, 199.9, 200.1) });
  assert.throws(() => a.place({ symbol: 'TSLA', side: 'buy', qty: 1, type: 'stop', price: 199 }), /above the current price/);
  assert.throws(() => a.place({ symbol: 'TSLA', side: 'sell', qty: 1, type: 'stop', price: 201 }), /below the current price/);
});

test('stale quotes (> 60 s) and pre-market quotes do not fill', () => {
  const a = fresh();
  a.tick({ META: q(300, 299.9, 300.1) });
  now += 61e3;
  const o = a.place({ symbol: 'META', side: 'buy', qty: 1 });
  assert.strictEqual(o.status, 'working', 'stale quote must not fill');
  a.tick({ META: q(301, 300.9, 301.1, { session: 'pre' }) });
  assert.strictEqual(o.status, 'working', 'non-regular quote must not fill');
  a.tick({ META: q(301, 300.9, 301.1) });
  near(o.fillPrice, 301.1, 'fills on the next fresh quote');
});

test('nothing fills while the market is closed; fills at the open', () => {
  const a = fresh();
  now = PRE;
  a.tick({ AAPL: q(100, 99.9, 100.1) });
  const o = a.place({ symbol: 'AAPL', side: 'buy', qty: 1 });
  assert.strictEqual(o.status, 'working');
  now = OPEN;
  a.tick({ AAPL: q(103, 102.95, 103.05) });
  near(o.fillPrice, 103.05, 'gap at the open');
});

test('bracket: OCO — target fills, stop is cancelled', () => {
  const a = fresh();
  a.tick({ GOOGL: q(100, 99.99, 100.01) });
  const e = a.place({ symbol: 'GOOGL', side: 'buy', qty: 10, stopLoss: 95, takeProfit: 110 });
  assert.strictEqual(e.status, 'filled');
  const [stop, target] = working(a);
  assert.strictEqual(stop.role, 'stop');
  assert.strictEqual(target.role, 'target');
  near(stop.price, 95, 'stop placed');
  near(target.price, 110, 'target placed');
  a.tick({ GOOGL: q(110.2, 110.1, 110.3) });
  assert.strictEqual(target.status, 'filled');
  near(target.fillPrice, 110.1, 'target fills at the bid');
  assert.strictEqual(stop.status, 'cancelled', 'other leg cancelled');
  assert.strictEqual(a.s.positions.GOOGL, undefined);
  near(lastFill(a).pnl, (110.1 - 100.01) * 10, 'realized P&L');
});

test('bracket: OCO — stop fills, target is cancelled (short side)', () => {
  const a = fresh();
  a.tick({ SPY: q(500, 499.99, 500.01) });
  a.place({ symbol: 'SPY', side: 'sell', qty: 2, stopLoss: 505, takeProfit: 490 });
  const [stop, target] = working(a);
  assert.strictEqual(stop.side, 'buy');
  a.tick({ SPY: q(505.5, 505.4, 505.6) });
  near(stop.fillPrice, 505.6, 'short stop fills at the ask');
  assert.strictEqual(target.status, 'cancelled');
});

test('bracket gap-shift: market entry filled away from plan keeps the planned risk', () => {
  const a = fresh();
  now = PRE;
  a.tick({ AAPL: q(100, 99.99, 100.01) });
  a.place({ symbol: 'AAPL', side: 'buy', qty: 1, stopLoss: 98, takeProfit: 104 }); // planned at 100.01
  now = OPEN;
  a.tick({ AAPL: q(102, 101.99, 102.01) });
  const [stop, target] = working(a);
  near(stop.price, 100, 'stop shifted by +2');
  near(target.price, 106, 'target shifted by +2');
});

test('modify: drag a working limit to a new price', () => {
  const a = fresh();
  a.tick({ AMZN: q(180, 179.98, 180.02) });
  const o = a.place({ symbol: 'AMZN', side: 'buy', qty: 3, type: 'limit', price: 175 });
  a.modify(o.id, { price: 176.456 });
  near(o.price, 176.46, 'rounded to the cent');
  assert.strictEqual(o.status, 'working');
  a.modify(o.id, { price: 181 }); // dragged above the ask → marketable, fills at the ask
  assert.strictEqual(o.status, 'filled');
  near(o.fillPrice, 180.02, 'fills at the ask, not the limit');
});

test('modify: drag the stop-loss and take-profit of a position', () => {
  const a = fresh();
  a.tick({ NFLX: q(100, 99.99, 100.01) });
  a.place({ symbol: 'NFLX', side: 'buy', qty: 4, stopLoss: 95, takeProfit: 110 });
  const [stop, target] = working(a);
  a.modify(stop.id, { price: 97.5 });
  a.modify(target.id, { price: 108 });
  near(stop.price, 97.5, 'stop moved');
  near(target.price, 108, 'target moved');
  assert.throws(() => a.modify(stop.id, { price: 100.5 }), /below the current price/, 'stop dragged above market rejected');
  near(stop.price, 97.5, 'rejected drag leaves the order unchanged');
  a.tick({ NFLX: q(97.4, 97.3, 97.5) });
  assert.strictEqual(stop.status, 'filled');
  near(stop.fillPrice, 97.3, 'moved stop fills at the bid');
  assert.strictEqual(target.status, 'cancelled');
});

test('modify: validation', () => {
  const a = fresh();
  a.tick({ IBM: q(200, 199.9, 200.1) });
  const o = a.place({ symbol: 'IBM', side: 'buy', qty: 1, type: 'limit', price: 190, stopLoss: 185, takeProfit: 210 });
  assert.throws(() => a.modify(o.id, { price: -1 }), /valid price/);
  assert.throws(() => a.modify(o.id, { price: 'abc' }), /valid price/);
  assert.throws(() => a.modify(o.id, { price: 184 }), /Stop-loss must be below/, 'entry moved under its own stop');
  assert.throws(() => a.modify(o.id, { takeProfit: 189 }), /Take-profit must be above/);
  assert.throws(() => a.modify(o.id, { qty: 0 }), /at least 1/);
  assert.throws(() => a.modify(o.id, { qty: 100000 }), /buying power/);
  assert.throws(() => a.modify(9999, { price: 1 }), /not found/);
  a.modify(o.id, { stopLoss: 186, takeProfit: 215 });
  near(o.stopLoss, 186, 'entry bracket stop moved');
  near(o.takeProfit, 215, 'entry bracket target moved');
  a.modify(o.id, { takeProfit: null });
  assert.strictEqual(o.takeProfit, null, 'bracket leg removed');
  a.cancel(o.id);
  assert.throws(() => a.modify(o.id, { price: 191 }), /not found/, 'cancelled orders cannot be modified');
  const m = (() => { now = PRE; return a.place({ symbol: 'IBM', side: 'buy', qty: 1 }); })();
  assert.throws(() => a.modify(m.id, { price: 199 }), /market order/);
});

test('modified entry bracket is used when the entry fills', () => {
  const a = fresh();
  a.tick({ ORCL: q(50, 49.99, 50.01) });
  const o = a.place({ symbol: 'ORCL', side: 'buy', qty: 10, type: 'limit', price: 49, stopLoss: 48, takeProfit: 52 });
  a.modify(o.id, { price: 49.5, stopLoss: 48.5 });
  a.tick({ ORCL: q(49.5, 49.45, 49.5) });
  assert.strictEqual(o.status, 'filled');
  const [stop, target] = working(a);
  near(stop.price, 48.5, 'modified stop');
  near(target.price, 52, 'target');
});

test('state survives a reload from disk', () => {
  const file = path.join(dir, 'persist.json');
  const a = new PaperAccount(file, 5000, { clock: () => now });
  a.tick({ KO: q(60, 59.99, 60.01) });
  a.place({ symbol: 'KO', side: 'buy', qty: 10 });
  const b = new PaperAccount(file, 5000, { clock: () => now });
  assert.strictEqual(b.s.positions.KO.qty, 10);
  near(b.s.cash, 5000 - 600.1, 'cash');
});

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
