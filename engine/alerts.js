// Price alerts: "tell me when AAPL trades above 360". Saved to disk so they survive restarts;
// checked against every live quote. An alert fires once, then stays in the list as history.
const fs = require('fs');

class Alerts {
  constructor(file) {
    this.file = file;
    try {
      this.items = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      this.items = [];
    }
    this.nextId = Math.max(0, ...this.items.map((a) => a.id)) + 1;
  }

  save() {
    fs.writeFileSync(this.file, JSON.stringify(this.items));
  }

  list() {
    return this.items;
  }

  // The direction comes from where the price is now: a level above it fires on the way up.
  add({ symbol, price, last, note = '' }) {
    symbol = String(symbol || '').toUpperCase().trim();
    price = Number(price);
    if (!symbol) throw new Error('Pick a symbol');
    if (!(price > 0)) throw new Error('Enter an alert price');
    if (!(last > 0)) throw new Error('No live price yet for this symbol. Try again in a few seconds.');
    if (Math.abs(price - last) < 1e-9) throw new Error('The alert price is the current price');
    const a = { id: this.nextId++, symbol, price: +price.toFixed(price >= 1 ? 2 : 4), dir: price > last ? 'above' : 'below', note: String(note).slice(0, 120), createdAt: Date.now(), firedAt: null };
    this.items.push(a);
    // Keep the history short: the newest 50 fired alerts.
    const fired = this.items.filter((x) => x.firedAt).sort((x, y) => y.firedAt - x.firedAt);
    if (fired.length > 50) this.items = this.items.filter((x) => !x.firedAt || fired.indexOf(x) < 50);
    this.save();
    return a;
  }

  remove(id) {
    this.items = this.items.filter((a) => a.id !== id);
    this.save();
  }

  clearFired() {
    this.items = this.items.filter((a) => !a.firedAt);
    this.save();
  }

  symbols() {
    return [...new Set(this.items.filter((a) => !a.firedAt).map((a) => a.symbol))];
  }

  // quotes: symbol → { last }. Returns the alerts that fired.
  check(quotes) {
    const fired = [];
    for (const a of this.items) {
      if (a.firedAt) continue;
      const q = quotes[a.symbol];
      const px = q?.session && q.session !== 'regular' ? q.ext?.last || q.last : q?.last;
      if (!(px > 0)) continue;
      if (a.dir === 'above' ? px >= a.price : px <= a.price) {
        a.firedAt = Date.now();
        a.firedPrice = px;
        fired.push(a);
      }
    }
    if (fired.length) this.save();
    return fired;
  }
}

module.exports = { Alerts };
