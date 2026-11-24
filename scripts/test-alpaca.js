// Tests for the Alpaca connection against the fake Alpaca server: node scripts/test-alpaca.js
const assert = require('assert');
const { AlpacaAccount } = require('../engine/alpaca');
const { startFakeAlpaca } = require('./fake-alpaca');

let passed = 0;
async function test(name, fn) {
  const srv = await startFakeAlpaca();
  const a = new AlpacaAccount({ keys: { id: 'TESTKEY', secret: 'TESTSECRET' }, base: srv.url, maxOrderValue: 50000 });
  try {
    await fn(a, srv);
    passed++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    console.error(`FAIL  ${name}\n      ${e.message}`);
    process.exitCode = 1;
  } finally {
    srv.close();
  }
}

(async () => {
  await test('wrong keys give a clear message', async (_a, srv) => {
    const bad = new AlpacaAccount({ keys: { id: 'x', secret: 'y' }, base: srv.url });
    await assert.rejects(bad.test(), /Alpaca/);
  });

  await test('account summary maps equity, positions and orders', async (a) => {
    const t = await a.test();
    assert.strictEqual(t.accountNumber, 'PA-TEST');
    const s = await a.refresh();
    assert.strictEqual(s.broker, 'alpaca');
    assert.strictEqual(s.equity, 100000);
    assert.deepStrictEqual(s.positions, []);
  });

  await test('market buy with a bracket: position plus stop-loss and take-profit lines', async (a) => {
    await a.place({ symbol: 'AAPL', side: 'buy', qty: 10, type: 'market', stopLoss: 190, takeProfit: 220, refPrice: 200 });
    const s = a.summary();
    assert.strictEqual(s.positions[0].qty, 10);
    assert.strictEqual(s.positions[0].avg, 200);
    const roles = s.orders.map((o) => `${o.role}@${o.price}`).sort();
    assert.deepStrictEqual(roles, ['stop@190', 'target@220']);
  });

  await test('a waiting limit entry carries its bracket, and the legs can be moved', async (a) => {
    await a.place({ symbol: 'MSFT', side: 'buy', qty: 5, type: 'limit', price: 390, stopLoss: 380, takeProfit: 420 });
    let e = a.summary().orders.find((o) => o.symbol === 'MSFT');
    assert.strictEqual(e.role, 'entry');
    assert.strictEqual(e.stopLoss, 380);
    assert.strictEqual(e.takeProfit, 420);
    await a.modify(e.id, { price: 391 });
    await a.modify(e.id, { stopLoss: 381 });
    e = a.summary().orders.find((o) => o.symbol === 'MSFT');
    assert.strictEqual(e.price, 391);
    assert.strictEqual(e.stopLoss, 381);
    await a.cancel(e.id);
    assert.strictEqual(a.summary().orders.length, 0);
  });

  await test('protect replaces exits with one-cancels-other, breakeven moves the stop', async (a, srv) => {
    await a.place({ symbol: 'AAPL', side: 'buy', qty: 10, type: 'market', refPrice: 200 });
    await a.protect('AAPL', { stopLoss: 195, takeProfit: 215 });
    let roles = a.summary().orders.map((o) => `${o.role}@${o.price}`).sort();
    assert.deepStrictEqual(roles, ['stop@195', 'target@215']);
    srv.prices.AAPL = 206; // the trade moves in our favour
    await a.refresh();
    await a.breakeven('AAPL');
    roles = a.summary().orders.filter((o) => o.status === 'working').map((o) => `${o.role}@${o.price}`).sort();
    assert.deepStrictEqual(roles, ['stop@200', 'target@215']);
    await assert.rejects(a.protect('AAPL', { stopLoss: 207 }), /below the current price/);
  });

  await test('trailing stop, close, reverse, close all, cancel all', async (a) => {
    await a.place({ symbol: 'AAPL', side: 'buy', qty: 10, type: 'market', refPrice: 200 });
    await a.trail('AAPL', 4);
    const t = a.summary().orders.find((o) => o.role === 'stop');
    assert.strictEqual(t.trail, 4);
    await a.reverse('AAPL');
    assert.strictEqual(a.summary().positions[0].qty, -10);
    await a.place({ symbol: 'MSFT', side: 'buy', qty: 1, type: 'limit', price: 300 });
    await a.cancelAll();
    assert.strictEqual(a.summary().orders.length, 0);
    await a.closeAll();
    assert.strictEqual(a.summary().positions.length, 0);
    await a.place({ symbol: 'SPY', side: 'buy', qty: 2, type: 'market', refPrice: 600 });
    await a.close('SPY');
    assert.strictEqual(a.summary().positions.length, 0);
  });

  await test('orders above the size limit are refused before reaching Alpaca', async (a, srv) => {
    a.maxOrderValue = 1000;
    await assert.rejects(a.place({ symbol: 'AAPL', side: 'buy', qty: 10, type: 'market', refPrice: 200 }), /above your \$1,000 limit/);
    await assert.rejects(a.place({ symbol: 'AAPL', side: 'buy', qty: 10, type: 'limit', price: 199 }), /limit/);
    assert.strictEqual(srv.state.orders.length, 0);
  });

  await test('Alpaca errors come through readably', async (a) => {
    await assert.rejects(a.place({ symbol: 'NOPE', side: 'buy', qty: 1, type: 'market', refPrice: 10 }), /Alpaca: asset NOPE not found/);
  });

  console.log(`\n${passed} passed${process.exitCode ? ', some FAILED' : ''}`);
})();
