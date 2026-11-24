// Daily price history → technical context for each signal.
// Sources: Nasdaq's public API first, CNBC's as the backup. Today's live bar comes from
// the stock list (one request covers every stock) or, failing that, a per-stock quote.
const { get } = require('./http');
const { num } = require('./universe');
const { config } = require('./config');
const polygon = require('./polygon');

const nasdaqSym = (s) => encodeURIComponent(s.replace('.', '/'));
const ymd = (d) => d.toISOString().slice(0, 10);
const etNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));

async function nasdaqBars(symbol, assetclass) {
  const from = new Date(Date.now() - 120 * 864e5);
  const url = `https://api.nasdaq.com/api/quote/${nasdaqSym(symbol)}/historical?assetclass=${assetclass}&fromdate=${ymd(from)}&todate=${ymd(new Date())}&limit=200`;
  // Past daily bars don't change during the day, so cache them for hours.
  const data = await get(url, { json: true, ttlMs: 6 * 3600e3, timeoutMs: 15000, retries: 1 });
  const rows = data?.data?.tradesTable?.rows || [];
  if (!rows.length) throw new Error('no rows');
  return rows
    .map((r) => ({ date: r.date, close: num(r.close), volume: num(r.volume), high: num(r.high), low: num(r.low), open: num(r.open) }))
    .filter((r) => r.close != null)
    .reverse(); // API is newest first
}

async function cnbcBars(symbol) {
  const data = await get(`https://ts-api.cnbc.com/harmony/app/charts/1Y.json?symbol=${encodeURIComponent(symbol)}`, { json: true, ttlMs: 6 * 3600e3, timeoutMs: 15000 });
  const bars = (data?.barData?.priceBars || []).map((b) => {
    const t = String(b.tradeTime);
    return { date: `${+t.slice(4, 6)}/${+t.slice(6, 8)}/${t.slice(0, 4)}`, close: num(b.close), volume: num(b.volume), high: num(b.high), low: num(b.low), open: num(b.open) };
  }).filter((b) => b.close != null);
  if (!bars.length) throw new Error('no bars');
  // Drop a bar for today: it's partial and handled as the live bar instead.
  const today = etNow().toLocaleDateString('en-US');
  return bars.filter((b) => b.date !== today).slice(-120);
}

async function liveQuote(symbol, assetclass) {
  if (polygon.enabled()) {
    try {
      const q = (await polygon.snapshot([symbol]))[symbol];
      if (q) return { price: q.last, volume: q.volume, day: new Date() };
    } catch {}
  }
  if (config.licensedOnly) return null;
  try {
    const q = (await get(`https://api.nasdaq.com/api/quote/${nasdaqSym(symbol)}/info?assetclass=${assetclass}`, { json: true, ttlMs: 2 * 60e3, timeoutMs: 10000 }))?.data?.primaryData;
    const ts = q?.lastTradeTimestamp?.replace(/ ET$/, '').replace(/^(.*?\d{4}).*$/, '$1');
    if (num(q?.lastSalePrice) && ts) return { price: num(q.lastSalePrice), volume: num(q.volume), day: new Date(ts) };
  } catch {}
  const d = await get(`https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${encodeURIComponent(symbol)}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json`, { json: true, ttlMs: 2 * 60e3, timeoutMs: 10000 });
  const q = d?.FormattedQuoteResult?.FormattedQuote?.[0];
  if (!num(q?.last) || !q.last_time) return null;
  return { price: num(q.last), volume: num(q.volume), day: new Date(q.last_time.slice(0, 10) + 'T12:00:00') };
}

// `live` (optional): { price, volume } for right now, e.g. from the stock list.
async function history(symbol, assetclass = 'stocks', live = null) {
  let bars = null;
  if (polygon.enabled()) bars = await polygon.dailyBars(symbol).then((b) => b.slice(-120)).catch(() => null);
  if (!bars && config.licensedOnly) throw new Error(`No licensed price data for ${symbol}`);
  if (!bars) {
    try {
      bars = await nasdaqBars(symbol, assetclass);
    } catch {
      bars = await cnbcBars(symbol);
    }
  }
  // Drop a partial bar for today (handled as the live bar below).
  const today = etNow().toLocaleDateString('en-US');
  if (bars.at(-1)?.date === today) bars = bars.slice(0, -1);
  return withLiveBar(bars, symbol, assetclass, live);
}

// Daily history ends at the previous close; add today's bar so moves and RVOL reflect now.
async function withLiveBar(bars, symbol, assetclass, live) {
  const et = etNow();
  const mins = et.getHours() * 60 + et.getMinutes() - 570; // minutes since 9:30 ET
  const weekday = et.getDay() > 0 && et.getDay() < 6;
  try {
    let q = null;
    if (live?.price && weekday && mins >= 0) q = { ...live, day: et };
    else if (!live) q = await liveQuote(symbol, assetclass);
    if (!q) return bars;
    const last = bars.at(-1);
    if (!last || isNaN(q.day) || new Date(last.date) >= new Date(q.day.toDateString())) return bars;
    let volume = q.volume;
    if (volume && q.day.toDateString() === et.toDateString() && mins < 390) {
      // Scale partial-day volume to a full session; too early in the session → leave it out of RVOL.
      volume = mins > 15 ? volume * (390 / mins) : null;
    }
    return [...bars, { date: q.day.toLocaleDateString('en-US'), close: q.price, volume, live: true }];
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

  // Average true range (14 days): the stock's normal daily move, used for stops and
  // for judging whether a reaction to news is big or small.
  const tr = [];
  for (let i = Math.max(1, bars.length - 15); i < bars.length; i++) {
    const b = bars[i];
    const pc = bars[i - 1].close;
    if (b.high == null || b.low == null) continue; // live bar has no range yet
    tr.push(Math.max(b.high - b.low, Math.abs(b.high - pc), Math.abs(b.low - pc)));
  }
  const atr = tr.length ? tr.reduce((a, x) => a + x, 0) / tr.length : null;

  return {
    last, ret1: ret(1), ret5, ret20, atr, atrPct: atr ? (atr / last) * 100 : null, sma20: s20, sma50: s50, rvol,
    pctFrom60High: (last / hi - 1) * 100, pctFrom60Low: (last / lo - 1) * 100,
    score, spark: closes.slice(-40),
  };
}

// % move from the close before `sinceMs` to the latest price.
function moveSince(bars, sinceMs) {
  if (!bars?.length) return null;
  const day = new Date(new Date(sinceMs).toLocaleDateString('en-US', { timeZone: 'America/New_York' })).getTime();
  let base = null;
  for (const b of bars) {
    if (new Date(b.date).getTime() < day) base = b.close;
    else break;
  }
  return base ? (bars.at(-1).close / base - 1) * 100 : null;
}

module.exports = { history, technicals, moveSince };
