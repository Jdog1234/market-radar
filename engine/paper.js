// Paper trading: a simulated brokerage account filled against live prices.
//
// Rules (kept simple and honest):
// - Orders fill only during regular hours (9:30–16:00 ET, weekdays). Orders placed while
//   the market is closed wait and fill at the open, which is where real gaps bite.
// - Market orders fill at the live price plus a small slippage (0.05%).
// - Limit orders fill at the limit, or better if the price gapped through it.
// - Stop orders fill at the live price once triggered (gaps make that worse, as in reality).
// - Brackets: an entry can carry a stop-loss and a take-profit. Once the entry fills, both
//   are placed; when one fills the other is cancelled (one-cancels-other).
// - Shorts are allowed. Buying power = 2× equity minus open exposure (like a margin account).
// - No commissions.
const fs = require('fs');

const SLIPPAGE = 0.0005;

function etParts(t = Date.now()) {
  const d = new Date(new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return { day: d.getDay(), mins: d.getHours() * 60 + d.getMinutes() };
}
function marketOpen(t = Date.now()) {
  const { day, mins } = etParts(t);
  return day > 0 && day < 6 && mins >= 570 && mins < 960;
}

class PaperAccount {
  constructor(file, startCash = 10000) {
    this.file = file;
    try {
      this.s = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      this.s = null;
    }
    if (!this.s) this.reset(startCash);
    this.last = {}; // symbol → last price seen
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
    this.s = { startCash, cash: startCash, positions: {}, orders: [], fills: [], equity: [], nextId: 1, createdAt: Date.now() };
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
      marketOpen: marketOpen(), createdAt: this.s.createdAt,
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
    const ref = type === 'market' ? this.price(symbol) : Number(price);
    if (!ref) throw new Error('No live price yet for this symbol. Try again in a few seconds.');
    const dir = side === 'buy' ? 1 : -1;
    if (stopLoss != null && stopLoss !== '' && (Number(stopLoss) - ref) * dir >= 0) throw new Error(`Stop-loss must be ${dir > 0 ? 'below' : 'above'} the entry price`);
    if (takeProfit != null && takeProfit !== '' && (Number(takeProfit) - ref) * dir <= 0) throw new Error(`Take-profit must be ${dir > 0 ? 'above' : 'below'} the entry price`);
    // Only orders that add exposure need buying power.
    const cur = this.s.positions[symbol]?.qty || 0;
    const adds = Math.sign(cur) !== -dir ? qty : Math.max(0, qty - Math.abs(cur));
    if (adds * ref > this.buyingPower() + 1e-6) throw new Error(`Not enough buying power ($${this.buyingPower().toFixed(0)} available)`);

    const o = {
      id: this.s.nextId++, symbol, side, qty, type, price: type === 'market' ? null : Number(price), status: 'working', createdAt: Date.now(),
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
    o.doneAt = Date.now();
    this.save();
  }

  // Close a position at market (cancels its stop/target orders).
  close(symbol) {
    this.sync();
    const p = this.s.positions[symbol];
    if (!p) throw new Error('No open position');
    for (const o of this.s.orders) if (o.symbol === symbol && o.status === 'working' && o.role !== 'entry') Object.assign(o, { status: 'cancelled', doneAt: Date.now() });
    return this.place({ symbol, side: p.qty > 0 ? 'sell' : 'buy', qty: Math.abs(p.qty), type: 'market', note: 'Close position' });
  }

  // Move a working order's price (e.g. dragging a stop-loss or take-profit line).
  // Rejects prices that would fill instantly on the wrong side of the market.
  modify(id, price) {
    this.sync();
    const o = this.s.orders.find((x) => x.id === id && x.status === 'working');
    if (!o) throw new Error('Order not found or already done');
    price = +Number(price).toFixed(2);
    if (!(price > 0)) throw new Error('Price must be above zero');
    if (o.type === 'market') throw new Error('Market orders have no price to move');
    const last = this.last[o.symbol];
    if (last) {
      const buy = o.side === 'buy';
      const name = o.role === 'stop' ? 'Stop-loss' : o.role === 'target' ? 'Take-profit' : `${buy ? 'Buy' : 'Sell'} ${o.type}`;
      // Stops sit beyond the market in the direction that triggers them; limits on the other side.
      if (o.type === 'stop' && (buy ? price <= last : price >= last)) throw new Error(`${name} must stay ${buy ? 'above' : 'below'} the current price ($${last.toFixed(2)})`);
      if (o.type === 'limit' && o.role === 'target' && (buy ? price >= last : price <= last)) throw new Error(`${name} must stay ${buy ? 'below' : 'above'} the current price ($${last.toFixed(2)})`);
    }
    o.price = price;
    this.save();
    return o;
  }

  // Move a position's protective orders.
  modifyBracket(symbol, { stopLoss, takeProfit }) {
    this.sync();
    for (const o of this.s.orders) {
      if (o.symbol !== symbol || o.status !== 'working') continue;
      if (o.role === 'stop' && stopLoss) o.price = Number(stopLoss);
      if (o.role === 'target' && takeProfit) o.price = Number(takeProfit);
    }
    this.save();
  }

  // ---- matching ----
  // quotes: symbol → { last }. Returns true if anything filled.
  tick(quotes) {
    this.sync();
    for (const [sym, q] of Object.entries(quotes)) if (q?.last) this.last[sym] = q.last;
    const open = marketOpen();
    let changed = false;
    if (open) {
      for (const o of this.s.orders) {
        if (o.status !== 'working') continue;
        const px = this.last[o.symbol];
        if (!px) continue;
        const buy = o.side === 'buy';
        let fill = null;
        if (o.type === 'market') fill = px * (1 + (buy ? SLIPPAGE : -SLIPPAGE));
        else if (o.type === 'limit' && (buy ? px <= o.price : px >= o.price)) fill = buy ? Math.min(o.price, px) : Math.max(o.price, px);
        else if (o.type === 'stop' && (buy ? px >= o.price : px <= o.price)) fill = px * (1 + (buy ? SLIPPAGE : -SLIPPAGE));
        if (fill != null) {
          this.fill(o, fill);
          changed = true;
        }
      }
    }
    // Record equity about once a minute (while there is anything to track).
    const lastPt = this.s.equity.at(-1);
    if (!lastPt || Date.now() - lastPt.t > 60e3) {
      if (open || !lastPt) this.s.equity.push({ t: Date.now(), v: +this.equity().toFixed(2) });
      changed = true;
    }
    if (changed) this.save();
    return changed;
  }

  fill(o, price) {
    price = +price.toFixed(4);
    const dir = o.side === 'buy' ? 1 : -1;
    const pos = this.s.positions[o.symbol] || { qty: 0, avg: 0, openedAt: Date.now() };
    let realized = null;
    const before = pos.qty;
    const signed = dir * o.qty;
    if (before === 0 || Math.sign(before) === dir) {
      pos.avg = (pos.avg * Math.abs(before) + price * o.qty) / (Math.abs(before) + o.qty);
      pos.qty = before + signed;
      if (before === 0) pos.openedAt = Date.now();
    } else {
      const closing = Math.min(Math.abs(before), o.qty);
      realized = (price - pos.avg) * closing * Math.sign(before);
      pos.qty = before + signed;
      if (Math.sign(pos.qty) === dir) {
        pos.avg = price; // flipped through zero: the remainder opens a new position
        pos.openedAt = Date.now();
      }
    }
    this.s.cash -= signed * price;
    Object.assign(o, { status: 'filled', fillPrice: price, doneAt: Date.now() });
    this.s.fills.push({ at: Date.now(), orderId: o.id, symbol: o.symbol, side: o.side, qty: o.qty, price, pnl: realized != null ? +realized.toFixed(2) : null, role: o.role });

    if (pos.qty === 0) {
      delete this.s.positions[o.symbol];
      // Flat: any leftover stop/target for this symbol is no longer needed.
      for (const x of this.s.orders) if (x.symbol === o.symbol && x.status === 'working' && x.role !== 'entry') Object.assign(x, { status: 'cancelled', doneAt: Date.now() });
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
      if (o.stopLoss) this.s.orders.push({ id: this.s.nextId++, symbol: o.symbol, side: exitSide, qty: o.qty, type: 'stop', price: o.stopLoss, status: 'working', createdAt: Date.now(), role: 'stop', group, parent: o.id });
      if (o.takeProfit) this.s.orders.push({ id: this.s.nextId++, symbol: o.symbol, side: exitSide, qty: o.qty, type: 'limit', price: o.takeProfit, status: 'working', createdAt: Date.now(), role: 'target', group, parent: o.id });
    }
    if (o.group) {
      for (const x of this.s.orders) if (x.group === o.group && x.id !== o.id && x.status === 'working') Object.assign(x, { status: 'cancelled', doneAt: Date.now() });
    }
  }

  // Symbols that need live prices.
  symbols() {
    return [...new Set([...Object.keys(this.s.positions), ...this.s.orders.filter((o) => o.status === 'working').map((o) => o.symbol)])];
  }
}

module.exports = { PaperAccount, marketOpen };
