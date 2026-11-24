// Real trading through the user's own Alpaca brokerage account (https://alpaca.markets).
// Same methods as PaperAccount (place, cancel, modify, close, protect, ...) so the trading
// screen works unchanged; they're async here and every change is re-read from Alpaca.
// The app never places an order on its own: each call comes from a user action, and live
// orders are confirmed in the window and capped by maxOrderValue first.
const BASES = { paper: 'https://paper-api.alpaca.markets', live: 'https://api.alpaca.markets' };

const num = (x) => (x == null || x === '' ? null : Number(x));
const round = (p) => +Number(p).toFixed(p >= 1 ? 2 : 4);

class AlpacaAccount {
  // keys: { id, secret }, env: 'paper' | 'live'
  constructor({ keys, env = 'paper', maxOrderValue = 5000, base } = {}) {
    this.keys = keys;
    this.env = env === 'live' ? 'live' : 'paper';
    this.base = base || process.env.MR_ALPACA_BASE || BASES[this.env];
    this.maxOrderValue = maxOrderValue;
    this.cache = null; // last summary()
    this.lastError = null;
  }

  async api(method, pathname, body) {
    let res;
    try {
      res = await fetch(`${this.base}${pathname}`, {
        method,
        headers: { 'APCA-API-KEY-ID': this.keys.id, 'APCA-API-SECRET-KEY': this.keys.secret, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch {
      throw new Error("Can't reach Alpaca. Check your internet connection.");
    }
    const text = await res.text();
    let d = null;
    try {
      d = text ? JSON.parse(text) : null;
    } catch {}
    if (res.status === 401 || res.status === 403) throw new Error(d?.message ? `Alpaca: ${d.message}` : 'Alpaca rejected the API keys. Check them under ⚙ at the top of the Trading screen.');
    if (!res.ok) throw new Error(`Alpaca: ${d?.message || `request failed (${res.status})`}`);
    return d;
  }

  // ---- reading ----
  async test() {
    const a = await this.api('GET', '/v2/account');
    return { accountNumber: a.account_number, status: a.status, equity: num(a.equity), currency: a.currency, env: this.env, blocked: !!(a.trading_blocked || a.account_blocked) };
  }

  async refresh() {
    const [a, pos, open, closed, fills, clock, hist] = await Promise.all([
      this.api('GET', '/v2/account'),
      this.api('GET', '/v2/positions'),
      this.api('GET', '/v2/orders?status=open&nested=true&limit=200'),
      this.api('GET', '/v2/orders?status=closed&nested=false&limit=100&direction=desc'),
      this.api('GET', '/v2/account/activities/FILL?page_size=100').catch(() => []),
      this.api('GET', '/v2/clock').catch(() => ({ is_open: false })),
      this.api('GET', '/v2/account/portfolio/history?period=1M&timeframe=1D').catch(() => null),
    ]);
    const positions = pos.map((p) => {
      const qty = Math.abs(num(p.qty)) * (p.side === 'short' ? -1 : 1);
      const avg = num(p.avg_entry_price);
      const last = num(p.current_price);
      return { symbol: p.symbol, qty, avg, last, value: num(p.market_value), pnl: num(p.unrealized_pl), pnlPct: num(p.unrealized_plpc) * 100, openedAt: null, note: '' };
    });
    const posBySym = Object.fromEntries(positions.map((p) => [p.symbol, p]));
    // Bracket legs come nested under their entry; flatten and give each a role.
    const orders = [];
    for (const o of open) {
      const legs = o.legs || [];
      const tp = legs.find((l) => l.type === 'limit');
      const sl = legs.find((l) => l.type === 'stop' || l.type === 'stop_limit' || l.type === 'trailing_stop');
      if (o.order_class === 'oco') {
        // An OCO protecting a position: the parent is the take-profit, the leg the stop.
        orders.push(this.mapOrder(o, 'target'));
        for (const l of legs) orders.push(this.mapOrder(l, l.type === 'limit' ? 'target' : 'stop'));
        continue;
      }
      if (o.status === 'filled') {
        // Entry done; only its stop-loss / take-profit legs are still working.
        for (const l of legs) orders.push(this.mapOrder(l, l.type === 'limit' ? 'target' : 'stop'));
        continue;
      }
      const role = this.roleOf(o, posBySym);
      const m = this.mapOrder(o, role);
      if (role === 'entry') {
        m.stopLoss = sl ? num(sl.stop_price) : null;
        m.takeProfit = tp ? num(tp.limit_price) : null;
        m.legs = { stop: sl?.id || null, target: tp?.id || null };
        orders.push(m);
        // Legs only become live orders once the entry fills; until then they ride on the entry.
        if (o.status === 'partially_filled') for (const l of legs) orders.push(this.mapOrder(l, l.type === 'limit' ? 'target' : 'stop'));
      } else {
        orders.push(m);
        for (const l of legs) orders.push(this.mapOrder(l, l.type === 'limit' ? 'target' : 'stop'));
      }
    }
    const equity = num(a.equity);
    const lastEquity = num(a.last_equity) || equity;
    const curve = hist?.timestamp?.map((t, i) => ({ t: t * 1000, v: hist.equity[i] })).filter((x) => x.v != null) || [];
    const unrealized = positions.reduce((s, p) => s + (p.pnl || 0), 0);
    this.cache = {
      broker: 'alpaca', env: this.env, accountNumber: a.account_number,
      startCash: lastEquity, cash: num(a.cash), equity, buyingPower: num(a.buying_power),
      totalPnl: equity - lastEquity, totalPct: lastEquity ? ((equity - lastEquity) / lastEquity) * 100 : 0, // today's change
      realized: null, unrealized, closedTrades: null, winRate: null,
      positions, orders,
      history: closed.map((o) => ({ ...this.mapOrder(o, 'entry'), status: o.status, doneAt: Date.parse(o.filled_at || o.canceled_at || o.updated_at) })),
      fills: (Array.isArray(fills) ? fills : []).map((f) => ({ at: Date.parse(f.transaction_time), orderId: f.order_id, symbol: f.symbol, side: f.side === 'buy' ? 'buy' : 'sell', qty: Math.abs(num(f.qty)), price: num(f.price), pnl: null, role: '' })),
      equityCurve: curve, marketOpen: !!clock.is_open, createdAt: null,
      blocked: !!(a.trading_blocked || a.account_blocked),
    };
    this.lastError = null;
    return this.cache;
  }

  roleOf(o, posBySym) {
    const p = posBySym[o.symbol];
    if (!p) return 'entry';
    const exits = (p.qty > 0 && o.side === 'sell') || (p.qty < 0 && o.side === 'buy');
    if (!exits || num(o.qty) > Math.abs(p.qty)) return 'entry';
    return o.type === 'limit' ? 'target' : o.type === 'market' ? 'entry' : 'stop';
  }

  mapOrder(o, role) {
    const type = o.type === 'trailing_stop' || o.type === 'stop_limit' ? 'stop' : o.type;
    return {
      id: o.id, symbol: o.symbol, side: o.side, qty: num(o.qty), type, role, status: 'working',
      price: type === 'limit' ? num(o.limit_price) : type === 'stop' ? num(o.stop_price) : null,
      trail: o.type === 'trailing_stop' ? num(o.trail_price) || null : null,
      createdAt: Date.parse(o.submitted_at || o.created_at), filledQty: num(o.filled_qty), brokerStatus: o.status,
    };
  }

  summary() {
    return this.cache || { broker: 'alpaca', env: this.env, loading: true, startCash: 0, cash: 0, equity: 0, buyingPower: 0, totalPnl: 0, totalPct: 0, realized: null, unrealized: 0, positions: [], orders: [], history: [], fills: [], equityCurve: [], marketOpen: false };
  }

  symbols() {
    const c = this.cache;
    return c ? [...new Set([...c.positions.map((p) => p.symbol), ...c.orders.map((o) => o.symbol)])] : [];
  }

  // ---- safety ----
  checkSize(qty, price) {
    if (!(price > 0) || !this.maxOrderValue) return;
    const value = qty * price;
    if (value > this.maxOrderValue) throw new Error(`This order is worth about $${Math.round(value).toLocaleString()}, above your $${this.maxOrderValue.toLocaleString()} limit per order (change it under ⚙ at the top of the Trading screen).`);
  }

  // ---- orders ----
  // refPrice: the price the window showed, used for the size limit on market orders.
  async place({ symbol, side, qty, type = 'market', price = null, stopLoss = null, takeProfit = null, refPrice = null }) {
    symbol = String(symbol || '').toUpperCase().trim();
    qty = Math.floor(Number(qty));
    if (!symbol) throw new Error('Pick a symbol');
    if (!(qty > 0)) throw new Error('Quantity must be at least 1 share');
    if (!['buy', 'sell'].includes(side)) throw new Error('Side must be buy or sell');
    if (!['market', 'limit', 'stop'].includes(type)) throw new Error('Unknown order type');
    if (type !== 'market' && !(Number(price) > 0)) throw new Error(`Enter a ${type} price`);
    this.checkSize(qty, type === 'market' ? Number(refPrice) : Number(price));
    const body = { symbol, qty: String(qty), side, type, time_in_force: stopLoss || takeProfit ? 'gtc' : 'day' };
    if (type === 'limit') body.limit_price = String(round(price));
    if (type === 'stop') body.stop_price = String(round(price));
    if (stopLoss && takeProfit) Object.assign(body, { order_class: 'bracket', stop_loss: { stop_price: String(round(stopLoss)) }, take_profit: { limit_price: String(round(takeProfit)) } });
    else if (stopLoss) Object.assign(body, { order_class: 'oto', stop_loss: { stop_price: String(round(stopLoss)) } });
    else if (takeProfit) Object.assign(body, { order_class: 'oto', take_profit: { limit_price: String(round(takeProfit)) } });
    const o = await this.api('POST', '/v2/orders', body);
    await this.refresh();
    return this.mapOrder(o, 'entry');
  }

  async cancel(id) {
    await this.api('DELETE', `/v2/orders/${encodeURIComponent(id)}`);
    await this.refresh();
  }

  // changes: { price, qty, stopLoss, takeProfit } like PaperAccount.modify.
  async modify(id, changes = {}) {
    const o = this.summary().orders.find((x) => x.id === id);
    if (!o) throw new Error('Order not found or already done');
    if (changes.price != null) {
      const p = round(Number(changes.price));
      if (o.trail) throw new Error('A trailing stop moves by itself. Cancel it to set a fixed stop.');
      await this.api('PATCH', `/v2/orders/${encodeURIComponent(id)}`, o.type === 'limit' ? { limit_price: String(p) } : { stop_price: String(p) });
    }
    if (changes.qty != null) await this.api('PATCH', `/v2/orders/${encodeURIComponent(id)}`, { qty: String(Math.floor(changes.qty)) });
    for (const [k, leg, field] of [['stopLoss', 'stop', 'stop_price'], ['takeProfit', 'target', 'limit_price']]) {
      if (!(k in changes)) continue;
      const legId = o.legs?.[leg];
      if (changes[k] == null) throw new Error("Alpaca can't remove one side of a bracket from a waiting order. Cancel the order and place it again.");
      if (!legId) throw new Error("Alpaca can't add a stop-loss or take-profit to an order that's already been sent. Cancel it and place it again.");
      await this.api('PATCH', `/v2/orders/${encodeURIComponent(legId)}`, { [field]: String(round(changes[k])) });
    }
    await this.refresh();
    return o;
  }

  async close(symbol) {
    await this.api('DELETE', `/v2/positions/${encodeURIComponent(symbol)}?cancel_orders=true`);
    await this.refresh();
  }

  // Replace a position's stop-loss / take-profit (one cancels the other at Alpaca).
  async protect(symbol, { stopLoss, takeProfit, trail } = {}) {
    await this.refresh();
    const c = this.summary();
    const p = c.positions.find((x) => x.symbol === symbol);
    if (!p) throw new Error('No open position');
    const exits = c.orders.filter((o) => o.symbol === symbol && (o.role === 'stop' || o.role === 'target'));
    const cur = (role) => exits.find((o) => o.role === role);
    let sl = stopLoss === undefined ? cur('stop')?.price ?? null : stopLoss || null;
    let tp = takeProfit === undefined ? cur('target')?.price ?? null : takeProfit || null;
    if (trail > 0) sl = null;
    const exitSide = p.qty > 0 ? 'sell' : 'buy';
    const qty = String(Math.abs(p.qty));
    const last = p.last;
    if (sl && last && (exitSide === 'sell' ? sl >= last : sl <= last)) throw new Error(`Stop-loss must be ${exitSide === 'sell' ? 'below' : 'above'} the current price (${last.toFixed(2)})`);
    if (tp && last && (exitSide === 'sell' ? tp <= last : tp >= last)) throw new Error(`Take-profit must be ${exitSide === 'sell' ? 'above' : 'below'} the current price (${last.toFixed(2)})`);
    // Alpaca holds the shares for an exit order, so the old ones must go before new ones.
    for (const o of exits) await this.api('DELETE', `/v2/orders/${encodeURIComponent(o.id)}`).catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
    if (trail > 0) await this.api('POST', '/v2/orders', { symbol, qty, side: exitSide, type: 'trailing_stop', trail_price: String(round(trail)), time_in_force: 'gtc' });
    if (sl && tp) await this.api('POST', '/v2/orders', { symbol, qty, side: exitSide, type: 'limit', time_in_force: 'gtc', order_class: 'oco', take_profit: { limit_price: String(round(tp)) }, stop_loss: { stop_price: String(round(sl)) } });
    else if (sl) await this.api('POST', '/v2/orders', { symbol, qty, side: exitSide, type: 'stop', stop_price: String(round(sl)), time_in_force: 'gtc' });
    else if (tp && !(trail > 0)) await this.api('POST', '/v2/orders', { symbol, qty, side: exitSide, type: 'limit', limit_price: String(round(tp)), time_in_force: 'gtc' });
    await this.refresh();
    return p;
  }

  async breakeven(symbol) {
    const p = this.summary().positions.find((x) => x.symbol === symbol);
    if (!p) throw new Error('No open position');
    return this.protect(symbol, { stopLoss: p.avg });
  }

  async trail(symbol, amount) {
    if (!(Number(amount) > 0)) throw new Error('Enter a trailing distance above zero');
    return this.protect(symbol, { trail: Number(amount), takeProfit: null });
  }

  // Close, then open the same size the other way (Alpaca won't flip in one order).
  async reverse(symbol) {
    const p = this.summary().positions.find((x) => x.symbol === symbol);
    if (!p) throw new Error('No open position');
    this.checkSize(Math.abs(p.qty), p.last);
    await this.api('DELETE', `/v2/positions/${encodeURIComponent(symbol)}?cancel_orders=true`);
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 500));
      const still = await this.api('GET', `/v2/positions/${encodeURIComponent(symbol)}`).catch(() => null);
      if (!still) break;
    }
    return this.place({ symbol, side: p.qty > 0 ? 'sell' : 'buy', qty: Math.abs(p.qty), type: 'market', refPrice: p.last });
  }

  async closeAll() {
    await this.api('DELETE', '/v2/positions?cancel_orders=true');
    await this.refresh();
  }

  async cancelAll() {
    await this.api('DELETE', '/v2/orders');
    await this.refresh();
  }
}

module.exports = { AlpacaAccount };
