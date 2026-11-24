// A tiny stand-in for Alpaca's trading API, for testing without real keys or money.
// Market orders fill at once at the price in `prices`; limit/stop orders wait.
// Use: const srv = await startFakeAlpaca(); new AlpacaAccount({ keys, base: srv.url }) … srv.close()
// Or run it: node scripts/fake-alpaca.js [port]  (keys: TESTKEY / TESTSECRET)
const http = require('http');
const crypto = require('crypto');

function startFakeAlpaca(port = 0, prices = { AAPL: 200, MSFT: 400, SPY: 600 }) {
  const st = { cash: 100000, positions: {}, orders: [], fills: [] };
  const now = () => new Date().toISOString();
  const pos = (sym) => st.positions[sym];
  const posJson = (sym) => {
    const p = pos(sym);
    const last = prices[sym] || p.avg;
    return { symbol: sym, qty: String(Math.abs(p.qty)), side: p.qty > 0 ? 'long' : 'short', avg_entry_price: String(p.avg), current_price: String(last), market_value: String(p.qty * last), unrealized_pl: String((last - p.avg) * p.qty), unrealized_plpc: String((last - p.avg) / p.avg * Math.sign(p.qty)) };
  };
  const equity = () => st.cash + Object.entries(st.positions).reduce((s, [sym, p]) => s + p.qty * (prices[sym] || p.avg), 0);
  const fill = (o, price) => {
    const dir = o.side === 'buy' ? 1 : -1;
    const p = pos(o.symbol) || { qty: 0, avg: 0 };
    const q = +o.qty;
    if (p.qty === 0 || Math.sign(p.qty) === dir) p.avg = (p.avg * Math.abs(p.qty) + price * q) / (Math.abs(p.qty) + q);
    p.qty += dir * q;
    st.cash -= dir * q * price;
    if (p.qty === 0) delete st.positions[o.symbol];
    else st.positions[o.symbol] = p;
    Object.assign(o, { status: 'filled', filled_qty: o.qty, filled_avg_price: String(price), filled_at: now() });
    st.fills.push({ transaction_time: now(), order_id: o.id, symbol: o.symbol, side: o.side, qty: o.qty, price: String(price) });
    // Bracket / OTO legs go live once the parent fills.
    for (const l of o.legs || []) l.status = 'new';
  };
  const mk = (b, extra = {}) => ({ id: crypto.randomUUID(), symbol: b.symbol, side: b.side, qty: String(b.qty), type: b.type, time_in_force: b.time_in_force, limit_price: b.limit_price || null, stop_price: b.stop_price || null, trail_price: b.trail_price || null, order_class: b.order_class || 'simple', status: 'new', submitted_at: now(), filled_qty: '0', legs: null, ...extra });
  const allOrders = () => st.orders.flatMap((o) => [o, ...(o.legs || [])]);
  const isOpen = (o) => ['new', 'accepted', 'held', 'partially_filled'].includes(o.status);

  const srv = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const send = (code, body) => {
        res.writeHead(code, { 'Content-Type': 'application/json' });
        res.end(body === undefined ? '' : JSON.stringify(body));
      };
      if (req.headers['apca-api-key-id'] !== 'TESTKEY' || req.headers['apca-api-secret-key'] !== 'TESTSECRET') return send(401, { message: 'unauthorized.' });
      const u = new URL(req.url, 'http://x');
      const parts = u.pathname.split('/').filter(Boolean); // ['v2', ...]
      const b = raw ? JSON.parse(raw) : {};
      const M = req.method;
      try {
        if (u.pathname === '/v2/account') return send(200, { account_number: 'PA-TEST', status: 'ACTIVE', currency: 'USD', cash: String(st.cash), equity: String(equity()), last_equity: '100000', buying_power: String(st.cash * 2), trading_blocked: false, account_blocked: false });
        if (u.pathname === '/v2/clock') return send(200, { is_open: true });
        if (u.pathname === '/v2/account/portfolio/history') return send(200, { timestamp: [Math.floor(Date.now() / 1000) - 86400, Math.floor(Date.now() / 1000)], equity: [100000, equity()] });
        if (u.pathname === '/v2/account/activities/FILL') return send(200, [...st.fills].reverse());
        if (parts[1] === 'positions') {
          const sym = parts[2];
          if (M === 'GET' && !sym) return send(200, Object.keys(st.positions).map(posJson));
          if (M === 'GET') return pos(sym) ? send(200, posJson(sym)) : send(404, { message: 'position does not exist' });
          const syms = sym ? [sym] : Object.keys(st.positions);
          if (sym && !pos(sym)) return send(404, { message: 'position does not exist' });
          for (const s of syms) {
            if (u.searchParams.get('cancel_orders') === 'true') for (const o of allOrders()) if (o.symbol === s && isOpen(o)) o.status = 'canceled';
            const p = pos(s);
            const o = mk({ symbol: s, side: p.qty > 0 ? 'sell' : 'buy', qty: Math.abs(p.qty), type: 'market', time_in_force: 'day' });
            st.orders.push(o);
            fill(o, prices[s]);
          }
          return send(200, []);
        }
        if (parts[1] === 'orders') {
          const id = parts[2];
          if (M === 'GET') {
            const want = u.searchParams.get('status');
            const top = st.orders.filter((o) => (want === 'open' ? isOpen(o) || (o.legs || []).some(isOpen) : !isOpen(o)));
            return send(200, want === 'open' ? top.map((o) => ({ ...o, legs: o.legs && o.legs.filter(isOpen) })) : top);
          }
          if (M === 'POST') {
            if (!prices[b.symbol]) return send(422, { message: `asset ${b.symbol} not found` });
            const p = pos(b.symbol);
            // Alpaca holds shares for open exit orders: an exit can't exceed the free shares.
            if (p && ((p.qty > 0 && b.side === 'sell') || (p.qty < 0 && b.side === 'buy'))) {
              const held = allOrders().filter((o) => o.symbol === b.symbol && isOpen(o) && o.side === b.side && o.order_class !== 'oco').reduce((s, o) => s + +o.qty, 0);
              if (held + +b.qty > Math.abs(p.qty) && b.type !== 'market') return send(403, { message: 'insufficient qty available for order' });
            }
            const o = mk(b);
            if (b.order_class === 'bracket' || b.order_class === 'oto') {
              o.legs = [];
              const exit = b.side === 'buy' ? 'sell' : 'buy';
              if (b.take_profit) o.legs.push(mk({ symbol: b.symbol, side: exit, qty: b.qty, type: 'limit', limit_price: b.take_profit.limit_price, time_in_force: 'gtc' }, { status: 'held', order_class: b.order_class }));
              if (b.stop_loss) o.legs.push(mk({ symbol: b.symbol, side: exit, qty: b.qty, type: 'stop', stop_price: b.stop_loss.stop_price, time_in_force: 'gtc' }, { status: 'held', order_class: b.order_class }));
            }
            if (b.order_class === 'oco') {
              o.limit_price = b.take_profit.limit_price;
              o.legs = [mk({ symbol: b.symbol, side: b.side, qty: b.qty, type: 'stop', stop_price: b.stop_loss.stop_price, time_in_force: 'gtc' }, { order_class: 'oco' })];
            }
            st.orders.push(o);
            if (b.type === 'market') fill(o, prices[b.symbol]);
            return send(200, o);
          }
          if (M === 'DELETE' && !id) {
            for (const o of allOrders()) if (isOpen(o)) o.status = 'canceled';
            return send(207, []);
          }
          const o = allOrders().find((x) => x.id === id);
          if (!o) return send(404, { message: 'order not found' });
          if (M === 'DELETE') {
            if (!isOpen(o)) return send(422, { message: 'order is not cancelable' });
            o.status = 'canceled';
            for (const l of o.legs || []) l.status = 'canceled';
            return send(204);
          }
          if (M === 'PATCH') {
            if (!isOpen(o)) return send(422, { message: 'order is not replaceable' });
            for (const k of ['qty', 'limit_price', 'stop_price']) if (b[k] != null) o[k] = String(b[k]);
            return send(200, o);
          }
        }
        send(404, { message: `not found: ${M} ${u.pathname}` });
      } catch (e) {
        send(500, { message: String(e.message) });
      }
    });
  });
  return new Promise((resolve) => srv.listen(port, '127.0.0.1', () => resolve({ url: `http://127.0.0.1:${srv.address().port}`, state: st, prices, close: () => srv.close() })));
}

module.exports = { startFakeAlpaca };

if (require.main === module) {
  startFakeAlpaca(Number(process.argv[2]) || 8787).then((s) => console.log(`Fake Alpaca on ${s.url} (keys TESTKEY / TESTSECRET)`));
}
