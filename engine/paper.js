// Paper trading: a simulated brokerage account filled against live prices.
//
// Rules (kept simple and honest):
// - Orders fill only during regular hours (9:30–16:00 ET, weekdays), and only on a quote from
//   the regular session that is less than 60 s old. Orders placed while the market is closed
//   wait and fill at the open, which is where real gaps bite.
// - With a live bid/ask (the normal case), you pay the spread like a real account: buys fill
//   at the ask, sells at the bid. Without one, fills use the last trade ± 0.05% slippage.
// - Limit orders trigger when the ask (buys) or bid (sells) reaches the limit, and fill at the
//   limit or better if the price gapped through it.
// - Stop orders trigger on the last trade price and then fill at the ask/bid, like a stop
//   market order (gaps make that worse, as in reality).
// - Brackets: an entry can carry a stop-loss and a take-profit. Once the entry fills, both
//   are placed; when one fills the other is cancelled (one-cancels-other).
// - Any working order can be modified (price, shares, attached bracket) — the chart's drag.
// - Shorts are allowed. Buying power = 2× equity minus open exposure (like a margin account).
// - No commissions.
const fs = require('fs');

const SLIPPAGE = 0.0005;
const STALE_MS = 60e3; // quotes older than this are not used for fills
const MAX_SPREAD = 0.05; // a bid/ask wider than 5% of the price is treated as bad data

function etParts(t = Date.now()) {
  const d = new Date(new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return { day: d.getDay(), mins: d.getHours() * 60 + d.getMinutes() };
}
function marketOpen(t = Date.now()) {
  const { day, mins } = etParts(t);
  return day > 0 && day < 6 && mins >= 570 && mins < 960;
}

class PaperAccount {
  // opts.clock: () => ms, for tests (defaults to the real time).
  constructor(file, startCash = 10000, opts = {}) {
    this.file = file;
    this.now = opts.clock || (() => Date.now());
    try {
      this.s = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      this.s = null;
    }
    if (!this.s) this.reset(startCash);
    this.last = {}; // symbol → last regular-session trade price seen
    this.q = {}; // symbol → { last, bid, ask, at, session } (latest quote)
    this.loadedAt = this.mtime();
  }

  mtime() {
    try {
      return fs.statSync(this.file).mtimeMs;
    } catch {
      return 0;
    }
  }

  // If another copy of the app changed the account file, pick up its version first so
  // neither window overwrites the other's trades.
  sync() {
    const m = this.mtime();
    if (m && m > this.loadedAt + 1) {
      try {
        this.s = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      } catch {}
      this.loadedAt = m;
    }
  }

  reset(startCash = 10000) {
    this.s = { startCash, cash: startCash, positions: {}, orders: [], fills: [], equity: [], nextId: 1, createdAt: this.now() };
    this.save();
  }

  save() {
    fs.writeFileSync(this.file, JSON.stringify(this.s));
    this.loadedAt = this.mtime();
  }

  // ---- account math ----
  price(sym) {
    return this.last[sym] ?? this.s.positions[sym]?.avg ?? null;
  }
  equity() {
    let e = this.s.cash;
    for (const [sym, p] of Object.entries(this.s.positions)) e += p.qty * (this.price(sym) ?? p.avg);
    return e;
  }
  exposure() {
    let g = 0;
    for (const [sym, p] of Object.entries(this.s.positions)) g += Math.abs(p.qty * (this.price(sym) ?? p.avg));
    return g;
  }
  buyingPower() {
    return Math.max(0, 2 * this.equity() - this.exposure());
  }

  // The quote orders may fill against right now, or null if there is none worth trusting:
  // missing, older than 60 s, or not from the regular session.
  execQuote(sym) {
    const q = this.q[sym];
    if (!q || !(q.last > 0)) return null;
    if (this.now() - (q.at || 0) > STALE_MS) return null;
    if (q.session && q.session !== 'regular') return null;
    let { bid, ask } = q;
    if (!(bid > 0 && ask > 0 && ask >= bid && (ask - bid) / q.last <= MAX_SPREAD)) bid = ask = null;
    return { last: q.last, bid, ask };
  }

  // What a marketable order would pay: the ask for buys, the bid for sells (or last ± slippage).
  takePrice(sym, side, x = this.execQuote(sym)) {
    if (!x) return null;
    const buy = side === 'buy';
    if (x.bid && x.ask) return buy ? x.ask : x.bid;
    return x.last * (1 + (buy ? SLIPPAGE : -SLIPPAGE));
  }

  // Best estimate of the fill price for planning (ignores staleness and session).
  refPrice(sym, side) {
    const q = this.q[sym];
    const good = q && q.bid > 0 && q.ask >= q.bid && q.last > 0 && (q.ask - q.bid) / q.last <= MAX_SPREAD;
    if (good && (!q.session || q.session === 'regular')) return side === 'buy' ? q.ask : q.bid;
    return this.price(sym);
  }

  summary() {
    this.sync();
    const equity = this.equity();
    const positions = Object.entries(this.s.positions).map(([sym, p]) => {
      const last = this.price(sym);
      const value = p.qty * last;
      const pnl = (last - p.avg) * p.qty;
      return { symbol: sym, qty: p.qty, avg: p.avg, last, value, pnl, pnlPct: (pnl / Math.abs(p.avg * p.qty)) * 100, openedAt: p.openedAt, note: p.note };
    });
    const realized = this.s.fills.reduce((s, f) => s + (f.pnl || 0), 0);
    const closed = this.s.fills.filter((f) => f.pnl != null);
    const wins = closed.filter((f) => f.pnl > 0).length;
    return {
      startCash: this.s.startCash, cash: this.s.cash, equity, buyingPower: this.buyingPower(),
      totalPnl: equity - this.s.startCash, totalPct: ((equity - this.s.startCash) / this.s.startCash) * 100,
      realized, unrealized: positions.reduce((s, p) => s + p.pnl, 0),
      closedTrades: closed.length, winRate: closed.length ? (wins / closed.length) * 100 : null,
      positions, orders: this.s.orders.filter((o) => o.status === 'working'),
      history: [...this.s.orders].filter((o) => o.status !== 'working').sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0)).slice(0, 200),
      fills: [...this.s.fills].reverse().slice(0, 200),
      equityCurve: this.s.equity.slice(-1500),
      marketOpen: marketOpen(this.now()), createdAt: this.s.createdAt,
    };
  }

  // ---- orders ----
  place({ symbol, side, qty, type = 'market', price = null, stopLoss = null, takeProfit = null, note = '' }) {
    this.sync();
    symbol = String(symbol || '').toUpperCase().trim();
    qty = Math.floor(Number(qty));
    if (!symbol) throw new Error('Pick a symbol');
    if (!(qty > 0)) throw new Error('Quantity must be at least 1 share');
    if (!['buy', 'sell'].includes(side)) throw new Error('Side must be buy or sell');
    if (!['market', 'limit', 'stop'].includes(type)) throw new Error('Unknown order type');
    if (type !== 'market' && !(Number(price) > 0)) throw new Error(`Enter a ${type} price`);
    const ref = type === 'market' ? this.refPrice(symbol, side) : Number(price);
    if (!ref) throw new Error('No live price yet for this symbol. Try again in a few seconds.');
    const dir = side === 'buy' ? 1 : -1;
    this.checkStop(symbol, side, type, ref);
    if (stopLoss != null && stopLoss !== '' && (Number(stopLoss) - ref) * dir >= 0) throw new Error(`Stop-loss must be ${dir > 0 ? 'below' : 'above'} the entry price`);
    if (takeProfit != null && takeProfit !== '' && (Number(takeProfit) - ref) * dir <= 0) throw new Error(`Take-profit must be ${dir > 0 ? 'above' : 'below'} the entry price`);
    // Only orders that add exposure need buying power.
    const cur = this.s.positions[symbol]?.qty || 0;
    const adds = Math.sign(cur) !== -dir ? qty : Math.max(0, qty - Math.abs(cur));
    if (adds * ref > this.buyingPower() + 1e-6) throw new Error(`Not enough buying power ($${this.buyingPower().toFixed(0)} available)`);

    const o = {
      id: this.s.nextId++, symbol, side, qty, type, price: type === 'market' ? null : Number(price), status: 'working', createdAt: this.now(),
      stopLoss: stopLoss ? Number(stopLoss) : null, takeProfit: takeProfit ? Number(takeProfit) : null, note, role: 'entry',
      refPrice: ref,
    };
    this.s.orders.push(o);
    this.save();
    this.tick({}); // fill right away if possible
    return o;
  }

  cancel(id) {
    this.sync();
    const o = this.s.orders.find((x) => x.id === id && x.status === 'working');
    if (!o) throw new Error('Order not found or already done');
    o.status = 'cancelled';
    o.doneAt = this.now();
    this.save();
  }

  // Close a position at market (cancels its stop/target orders).
  close(symbol) {
    this.sync();
    const p = this.s.positions[symbol];
    if (!p) throw new Error('No open position');
    for (const o of this.s.orders) if (o.symbol === symbol && o.status === 'working' && o.role !== 'entry') Object.assign(o, { status: 'cancelled', doneAt: this.now() });
    return this.place({ symbol, side: p.qty > 0 ? 'sell' : 'buy', qty: Math.abs(p.qty), type: 'market', note: 'Close position' });
  }

  // Move a position's protective orders.
  modifyBracket(symbol, { stopLoss, takeProfit }) {
    this.sync();
    for (const o of this.s.orders) {
      if (o.symbol !== symbol || o.status !== 'working') continue;
      if (o.role === 'stop' && stopLoss) this.modify(o.id, { price: stopLoss });
      if (o.role === 'target' && takeProfit) this.modify(o.id, { price: takeProfit });
    }
  }

  // Add, move or remove (null) a position's stop-loss and take-profit; they cancel each other
  // when one fills. `trail` (dollars) makes the stop follow the price up (long) or down (short).
  protect(symbol, { stopLoss, takeProfit, trail } = {}) {
    this.sync();
    const p = this.s.positions[symbol];
    if (!p) throw new Error('No open position');
    const exit = p.qty > 0 ? 'sell' : 'buy';
    const qty = Math.abs(p.qty);
    const working = (role) => this.s.orders.find((o) => o.symbol === symbol && o.status === 'working' && o.role === role);
    const group = working('stop')?.group || working('target')?.group || `oco-pos-${this.s.nextId}`;
    const last = this.q[symbol]?.last ?? this.price(symbol);
    const plan = [];
    for (const [role, type, value] of [['stop', 'stop', stopLoss], ['target', 'limit', takeProfit]]) {
      if (value === undefined) continue;
      const cur = working(role);
      if (value === null || value === '') {
        if (cur) plan.push(() => Object.assign(cur, { status: 'cancelled', doneAt: this.now() }));
        continue;
      }
      const v = Number(value);
      if (!(v > 0 && Number.isFinite(v))) throw new Error('Enter a valid price');
      const price = +v.toFixed(v >= 1 ? 2 : 4);
      if (role === 'stop') this.checkStop(symbol, exit, 'stop', price);
      else if (last && (exit === 'sell' ? price <= last : price >= last)) throw new Error(`Take-profit must be ${exit === 'sell' ? 'above' : 'below'} the current price (${last.toFixed(2)})`);
      plan.push(() => {
        if (cur) Object.assign(cur, { price, qty, modifiedAt: this.now() });
        else this.s.orders.push({ id: this.s.nextId++, symbol, side: exit, qty, type, price, status: 'working', createdAt: this.now(), role, group });
        if (role === 'stop') {
          const o = working('stop');
          if (trail > 0) o.trail = +Number(trail).toFixed(4);
          else delete o.trail;
        }
      });
    }
    plan.forEach((f) => f()); // validate everything first, then change
    this.save();
    this.tick({});
    return this.s.positions[symbol];
  }

  // Move the stop-loss to the average fill price (the trade can no longer lose).
  breakeven(symbol) {
    const p = this.s.positions[symbol];
    if (!p) throw new Error('No open position');
    return this.protect(symbol, { stopLoss: p.avg });
  }

  // A trailing stop `amount` dollars behind the price.
  trail(symbol, amount) {
    this.sync();
    const p = this.s.positions[symbol];
    if (!p) throw new Error('No open position');
    amount = Number(amount);
    const last = this.q[symbol]?.last ?? this.price(symbol);
    if (!(amount > 0)) throw new Error('Enter a trailing distance above zero');
    if (!last) throw new Error('No live price yet for this symbol');
    if (amount >= last) throw new Error('The trailing distance must be smaller than the price');
    return this.protect(symbol, { stopLoss: p.qty > 0 ? last - amount : last + amount, trail: amount });
  }

  // Flip a long into a short of the same size (or the other way) at market.
  reverse(symbol) {
    this.sync();
    const p = this.s.positions[symbol];
    if (!p) throw new Error('No open position');
    for (const o of this.s.orders) if (o.symbol === symbol && o.status === 'working' && o.role !== 'entry') Object.assign(o, { status: 'cancelled', doneAt: this.now() });
    return this.place({ symbol, side: p.qty > 0 ? 'sell' : 'buy', qty: Math.abs(p.qty) * 2, type: 'market', note: 'Reverse position' });
  }

  // Close every position at market; returns the symbols that could not be closed (no price yet).
  closeAll() {
    this.sync();
    const failed = [];
    for (const sym of Object.keys(this.s.positions)) {
      try {
        this.close(sym);
      } catch {
        failed.push(sym);
      }
    }
    if (failed.length) throw new Error(`Could not close ${failed.join(', ')} yet (no live price). Try again in a few seconds.`);
  }

  // Cancel every working order, including stop-losses and take-profits.
  cancelAll() {
    this.sync();
    for (const o of this.s.orders) if (o.status === 'working') Object.assign(o, { status: 'cancelled', doneAt: this.now() });
    this.save();
  }

  // A stop that is already through the market would fill at once: that's a market order.
  checkStop(symbol, side, type, price) {
    if (type !== 'stop') return;
    const cur = this.q[symbol]?.last ?? this.price(symbol);
    if (!cur) return;
    if (side === 'buy' && price <= cur) throw new Error(`A buy stop must be above the current price (${cur.toFixed(2)})`);
    if (side === 'sell' && price >= cur) throw new Error(`A sell stop must be below the current price (${cur.toFixed(2)})`);
  }

  // Change a working order: { price, qty, stopLoss, takeProfit } (the last two only for an
  // entry that hasn't filled yet; null removes them). Used when a line is dragged on the chart.
  modify(id, changes = {}) {
    this.sync();
    const o = this.s.orders.find((x) => x.id === id && x.status === 'working');
    if (!o) throw new Error('Order not found or already done');
    const next = { price: o.price, qty: o.qty, stopLoss: o.stopLoss ?? null, takeProfit: o.takeProfit ?? null };
    if (changes.price != null) {
      if (o.type === 'market') throw new Error("A market order has no price to change");
      const p = Number(changes.price);
      if (!(p > 0 && Number.isFinite(p))) throw new Error('Enter a valid price');
      next.price = +p.toFixed(p >= 1 ? 2 : 4);
    }
    if (changes.qty != null) {
      const q = Math.floor(Number(changes.qty));
      if (!(q > 0)) throw new Error('Quantity must be at least 1 share');
      if (o.role !== 'entry' && q > Math.abs(this.s.positions[o.symbol]?.qty || 0)) throw new Error('A stop-loss or take-profit cannot be larger than the position');
      next.qty = q;
    }
    for (const k of ['stopLoss', 'takeProfit']) {
      if (!(k in changes)) continue;
      if (o.role !== 'entry') throw new Error('Only an entry order carries a bracket; move the stop-loss or take-profit order itself');
      const v = changes[k] === null || changes[k] === '' ? null : Number(changes[k]);
      if (v !== null && !(v > 0 && Number.isFinite(v))) throw new Error('Enter a valid price');
      next[k] = v === null ? null : +v.toFixed(v >= 1 ? 2 : 4);
    }
    this.checkStop(o.symbol, o.side, o.type, next.price);
    if (o.role === 'entry') {
      const dir = o.side === 'buy' ? 1 : -1;
      const ref = o.type === 'market' ? o.refPrice : next.price;
      if (next.stopLoss != null && (next.stopLoss - ref) * dir >= 0) throw new Error(`Stop-loss must be ${dir > 0 ? 'below' : 'above'} the entry price`);
      if (next.takeProfit != null && (next.takeProfit - ref) * dir <= 0) throw new Error(`Take-profit must be ${dir > 0 ? 'above' : 'below'} the entry price`);
      const cur = this.s.positions[o.symbol]?.qty || 0;
      const adds = Math.sign(cur) !== -dir ? next.qty : Math.max(0, next.qty - Math.abs(cur));
      if (adds * (ref || 0) > this.buyingPower() + 1e-6) throw new Error(`Not enough buying power ($${this.buyingPower().toFixed(0)} available)`);
    }
    Object.assign(o, next, { modifiedAt: this.now() });
    this.save();
    this.tick({}); // a limit moved through the market fills right away
    return o;
  }

  // ---- matching ----
  // quotes: symbol → { last, bid, ask, at, session }. Returns true if anything changed.
  tick(quotes) {
    this.sync();
    const now = this.now();
    for (const [sym, q] of Object.entries(quotes)) {
      if (!(q?.last > 0)) continue;
      this.q[sym] = { last: q.last, bid: q.bid ?? null, ask: q.ask ?? null, at: q.at ?? now, session: q.session ?? null };
      this.last[sym] = q.last;
    }
    const open = marketOpen(now);
    let changed = false;
    if (open) {
      // Trailing stops follow the last trade, never moving back.
      for (const o of this.s.orders) {
        if (o.status !== 'working' || !(o.trail > 0)) continue;
        const x = this.execQuote(o.symbol);
        if (!x) continue;
        const next = o.side === 'sell' ? x.last - o.trail : x.last + o.trail;
        const rounded = +next.toFixed(next >= 1 ? 2 : 4);
        if (o.side === 'sell' ? rounded > o.price : rounded < o.price) {
          o.price = rounded;
          changed = true;
        }
      }
      for (const o of this.s.orders) {
        if (o.status !== 'working') continue;
        const x = this.execQuote(o.symbol);
        if (!x) continue;
        const buy = o.side === 'buy';
        const take = this.takePrice(o.symbol, o.side, x); // ask for buys, bid for sells
        const touch = x.bid && x.ask ? (buy ? x.ask : x.bid) : x.last; // what a limit is compared with
        let fill = null;
        if (o.type === 'market') fill = take;
        else if (o.type === 'limit' && (buy ? touch <= o.price : touch >= o.price)) fill = buy ? Math.min(o.price, take) : Math.max(o.price, take);
        else if (o.type === 'stop' && (buy ? x.last >= o.price : x.last <= o.price)) fill = take;
        if (fill != null) {
          this.fill(o, fill);
          changed = true;
        }
      }
    }
    // Record equity about once a minute (while there is anything to track).
    const lastPt = this.s.equity.at(-1);
    if (!lastPt || now - lastPt.t > 60e3) {
      if (open || !lastPt) {
        this.s.equity.push({ t: now, v: +this.equity().toFixed(2) });
        changed = true;
      }
    }
    if (changed) this.save();
    return changed;
  }

  fill(o, price) {
    price = +price.toFixed(4);
    const dir = o.side === 'buy' ? 1 : -1;
    const pos = this.s.positions[o.symbol] || { qty: 0, avg: 0, openedAt: this.now() };
    let realized = null;
    const before = pos.qty;
    const signed = dir * o.qty;
    if (before === 0 || Math.sign(before) === dir) {
      pos.avg = (pos.avg * Math.abs(before) + price * o.qty) / (Math.abs(before) + o.qty);
      pos.qty = before + signed;
      if (before === 0) pos.openedAt = this.now();
    } else {
      const closing = Math.min(Math.abs(before), o.qty);
      realized = (price - pos.avg) * closing * Math.sign(before);
      pos.qty = before + signed;
      if (Math.sign(pos.qty) === dir) {
        pos.avg = price; // flipped through zero: the remainder opens a new position
        pos.openedAt = this.now();
      }
    }
    this.s.cash -= signed * price;
    Object.assign(o, { status: 'filled', fillPrice: price, doneAt: this.now() });
    this.s.fills.push({ at: this.now(), orderId: o.id, symbol: o.symbol, side: o.side, qty: o.qty, price, pnl: realized != null ? +realized.toFixed(2) : null, role: o.role });

    if (pos.qty === 0) {
      delete this.s.positions[o.symbol];
      // Flat: any leftover stop/target for this symbol is no longer needed.
      for (const x of this.s.orders) if (x.symbol === o.symbol && x.status === 'working' && x.role !== 'entry') Object.assign(x, { status: 'cancelled', doneAt: this.now() });
    } else {
      if (o.note && o.role === 'entry') pos.note = o.note;
      this.s.positions[o.symbol] = pos;
    }

    // Bracket: entry filled → place stop-loss and take-profit (one cancels the other).
    if (o.role === 'entry' && (o.stopLoss || o.takeProfit)) {
      const exitSide = o.side === 'buy' ? 'sell' : 'buy';
      const group = `oco-${o.id}`;
      // A market order that filled away from the price it was planned at (e.g. a gap at the
      // open) keeps its planned risk and reward: shift the stop and target by the difference.
      const shift = o.type === 'market' && o.refPrice ? price - o.refPrice : 0;
      if (shift) {
        if (o.stopLoss) o.stopLoss = +(o.stopLoss + shift).toFixed(2);
        if (o.takeProfit) o.takeProfit = +(o.takeProfit + shift).toFixed(2);
      }
      if (o.stopLoss) this.s.orders.push({ id: this.s.nextId++, symbol: o.symbol, side: exitSide, qty: o.qty, type: 'stop', price: o.stopLoss, status: 'working', createdAt: this.now(), role: 'stop', group, parent: o.id });
      if (o.takeProfit) this.s.orders.push({ id: this.s.nextId++, symbol: o.symbol, side: exitSide, qty: o.qty, type: 'limit', price: o.takeProfit, status: 'working', createdAt: this.now(), role: 'target', group, parent: o.id });
    }
    if (o.group) {
      for (const x of this.s.orders) if (x.group === o.group && x.id !== o.id && x.status === 'working') Object.assign(x, { status: 'cancelled', doneAt: this.now() });
    }
  }

  // Symbols that need live prices.
  symbols() {
    return [...new Set([...Object.keys(this.s.positions), ...this.s.orders.filter((o) => o.status === 'working').map((o) => o.symbol)])];
  }
}

module.exports = { PaperAccount, marketOpen };
