// Signal track record: log each scan's signals, later measure what actually happened.
const fs = require('fs');
const { mapLimit } = require('./http');
const { history } = require('./prices');

const HORIZONS = [1, 5, 20]; // trading days
const etDay = (t) => new Date(t).toLocaleDateString('en-US', { timeZone: 'America/New_York' });

function load(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
}

// One entry per stock per direction per day: the first time it shows up.
function record(file, scan) {
  const log = load(file);
  const keys = new Set(log.map((e) => `${e.kind === 'trade' ? 'trade:' : ''}${e.symbol}:${e.dir}:${etDay(e.at)}`));
  const add = (list, dir) => {
    for (const c of list.slice(0, 15)) {
      if (!c.tech?.last) continue;
      const k = `${c.symbol}:${dir}:${etDay(scan.scannedAt)}`;
      if (keys.has(k)) continue;
      keys.add(k);
      log.push({
        symbol: c.symbol, dir, at: scan.scannedAt, price: c.tech.last, score: +c.composite.toFixed(2),
        confidence: c.confidence, catalyst: c.reasons[0]?.label || '', rvol: c.tech.rvol ? +c.tech.rvol.toFixed(2) : null,
      });
    }
  };
  add(scan.bullish, 'up');
  add(scan.bearish, 'down');
  // Trade ideas: logged with their stop and target so we can see which got hit first.
  for (const t of scan.trades || []) {
    const k = `trade:${t.symbol}:${t.dir}:${etDay(scan.scannedAt)}`;
    if (keys.has(k)) continue;
    keys.add(k);
    log.push({
      kind: 'trade', symbol: t.symbol, dir: t.dir, at: scan.scannedAt, price: t.entry, stop: t.stop, target: t.target,
      type: t.type, confidence: t.confidence, catalyst: t.catalyst,
    });
  }
  // Keep about a year of history.
  const cutoff = Date.now() - 400 * 864e5;
  fs.writeFileSync(file, JSON.stringify(log.filter((e) => e.at > cutoff)));
}

async function evaluate(file) {
  const log = load(file);
  const symbols = [...new Set(log.map((e) => e.symbol))];
  const bars = new Map();
  await mapLimit(symbols, 5, async (s) => bars.set(s, await history(s).catch(() => null)));

  const rows = log.filter((e) => e.kind !== 'trade').map((e) => {
    const b = bars.get(e.symbol);
    const out = { ...e, returns: {} };
    if (!b) return out;
    // Index of the entry day's bar (the signal is measured from the logged price).
    const day = new Date(etDay(e.at)).getTime();
    const i = b.findIndex((x) => new Date(x.date).getTime() >= day);
    if (i < 0) return out;
    for (const h of HORIZONS) {
      const x = b[i + h];
      if (x && !x.live) {
        const r = (x.close / e.price - 1) * 100;
        out.returns[h] = e.dir === 'up' ? r : -r; // positive = signal was right
      }
    }
    return out;
  });

  const summarize = (subset) => {
    const s = {};
    for (const h of HORIZONS) {
      const rs = subset.map((r) => r.returns[h]).filter((x) => x != null);
      s[h] = rs.length ? { n: rs.length, hit: (rs.filter((x) => x > 0).length / rs.length) * 100, avg: rs.reduce((a, x) => a + x, 0) / rs.length } : null;
    }
    return s;
  };
  const group = (key) => {
    const m = new Map();
    for (const r of rows) {
      const k = r[key] || '—';
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(r);
    }
    return [...m.entries()].map(([k, v]) => ({ key: k, count: v.length, stats: summarize(v) })).sort((a, b) => b.count - a.count);
  };

  // Trade ideas: walk forward day by day; whichever of stop/target is touched first decides
  // it (if both in one day, count it as a loss, the conservative choice). Undecided after
  // 20 trading days = expired.
  const trades = log.filter((e) => e.kind === 'trade').map((e) => {
    const b = bars.get(e.symbol);
    const out = { ...e, outcome: 'open' };
    if (!b) return out;
    const day = new Date(etDay(e.at)).getTime();
    const i = b.findIndex((x) => new Date(x.date).getTime() > day);
    if (i < 0) return out;
    const up = e.dir === 'up';
    for (let j = i; j < Math.min(b.length, i + 20); j++) {
      const x = b[j];
      if (x.live || x.high == null) break;
      const hitStop = up ? x.low <= e.stop : x.high >= e.stop;
      const hitTarget = up ? x.high >= e.target : x.low <= e.target;
      if (hitStop) return { ...out, outcome: 'loss', days: j - i + 1 };
      if (hitTarget) return { ...out, outcome: 'win', days: j - i + 1 };
    }
    return b.length - i >= 20 ? { ...out, outcome: 'expired' } : out;
  });
  const tradeStats = (subset) => {
    const w = subset.filter((t) => t.outcome === 'win').length;
    const l = subset.filter((t) => t.outcome === 'loss').length;
    const x = subset.filter((t) => t.outcome === 'expired').length;
    const decided = w + l + x;
    return { n: subset.length, decided, wins: w, losses: l, expired: x, winRate: decided ? (w / decided) * 100 : null };
  };
  const byKey = (key) => {
    const m = {};
    for (const t of trades) (m[t[key]] = m[t[key]] || []).push(t);
    return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, tradeStats(v)]));
  };

  return {
    trades: { overall: tradeStats(trades), byType: byKey('type'), byCatalyst: byKey('catalyst'), recent: trades.sort((a, b) => b.at - a.at).slice(0, 100) },
    total: rows.length,
    since: rows.length ? Math.min(...rows.map((r) => r.at)) : null,
    overall: summarize(rows),
    byDirection: group('dir'),
    byConfidence: group('confidence'),
    byCatalyst: group('catalyst').slice(0, 15),
    recent: rows.sort((a, b) => b.at - a.at).slice(0, 150),
  };
}

module.exports = { record, evaluate, HORIZONS };
