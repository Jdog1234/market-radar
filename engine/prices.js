// Daily price history from Nasdaq's public data API → technical context for each signal.
const { get } = require('./http');
const { num } = require('./universe');

function ymd(d) {
  return d.toISOString().slice(0, 10);
}

async function history(symbol, assetclass = 'stocks') {
  const to = new Date();
  const from = new Date(Date.now() - 120 * 864e5);
  const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol.replace('.', '/'))}/historical?assetclass=${assetclass}&fromdate=${ymd(from)}&todate=${ymd(to)}&limit=200`;
  const data = await get(url, { json: true, ttlMs: 15 * 60e3, timeoutMs: 15000, retries: 1 });
  const rows = data?.data?.tradesTable?.rows || [];
  // Newest first from the API → return oldest first.
  const bars = rows
    .map((r) => ({ date: r.date, close: num(r.close), volume: num(r.volume), high: num(r.high), low: num(r.low), open: num(r.open) }))
    .filter((r) => r.close != null)
    .reverse();
  return withLiveBar(bars, symbol, assetclass);
}

// The history endpoint ends at the previous close; add today's live bar so moves
// and RVOL reflect what is happening now.
async function withLiveBar(bars, symbol, assetclass) {
  try {
    const url = `https://api.nasdaq.com/api/quote/${encodeURIComponent(symbol.replace('.', '/'))}/info?assetclass=${assetclass}`;
    const q = (await get(url, { json: true, ttlMs: 2 * 60e3, timeoutMs: 10000 }))?.data?.primaryData;
    const price = num(q?.lastSalePrice);
    const ts = q?.lastTradeTimestamp?.replace(/ ET$/, '').replace(/^(.*?\d{4}).*$/, '$1');
    if (!price || !ts) return bars;
    const day = new Date(ts);
    const last = bars.at(-1);
    if (!last || isNaN(day) || new Date(last.date) >= day) return bars;
    let volume = num(q.volume);
    // Scale partial-day volume to a full-session estimate (9:30–16:00 ET).
    const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const mins = et.getHours() * 60 + et.getMinutes() - 570;
    if (volume && day.toDateString() === et.toDateString() && mins < 390) {
      // Too early in the session to project a full day: leave volume out of RVOL.
      volume = mins > 15 ? volume * (390 / mins) : null;
    }
    return [...bars, { date: day.toLocaleDateString('en-US'), close: price, volume, live: true }];
  } catch {
    return bars;
  }
}

const sma = (arr, n) => (arr.length >= n ? arr.slice(-n).reduce((s, x) => s + x, 0) / n : null);
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

function technicals(bars) {
  if (!bars || bars.length < 25) return null;
  const closes = bars.map((b) => b.close);
  const vols = bars.map((b) => b.volume ?? 0);
  const last = closes.at(-1);
  const ret = (n) => (closes.length > n ? (last / closes[closes.length - 1 - n] - 1) * 100 : null);
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  // RVOL from the latest bar that has usable volume (today's, once the session is underway).
  const k = bars.at(-1).volume == null ? bars.length - 2 : bars.length - 1;
  const avgVol20 = sma(vols.slice(0, k), 20);
  const rvol = avgVol20 ? vols[k] / avgVol20 : null;
  const hi = Math.max(...closes.slice(-60));
  const lo = Math.min(...closes.slice(-60));

  let trend = 0;
  trend += last > s20 ? 1 : -1;
  if (s50) trend += last > s50 ? 1 : -1;
  if (s50) trend += s20 > s50 ? 1 : -1;
  const ret5 = ret(5);
  const ret20 = ret(20);
  // −10…+10: trend structure (±6) + momentum (±4).
  const score = clamp((trend / 3) * 6 + clamp((ret20 || 0) / 5, -2, 2) + clamp((ret5 || 0) / 3, -2, 2), -10, 10);

  return {
    last, ret1: ret(1), ret5, ret20, sma20: s20, sma50: s50, rvol,
    pctFrom60High: (last / hi - 1) * 100, pctFrom60Low: (last / lo - 1) * 100,
    score, spark: closes.slice(-40),
  };
}

module.exports = { history, technicals };
