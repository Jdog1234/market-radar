// Polygon.io: licensed US stock prices, live snapshots and news.
// Docs: https://polygon.io/docs/stocks. Which endpoints work depends on the plan
// (snapshots and real-time need a paid plan); every caller falls back if one fails.
const { get } = require('./http');
const { config } = require('./config');

const BASE = 'https://api.polygon.io';
const enabled = () => !!config.polygonKey;
const url = (path, params = {}) => {
  const q = new URLSearchParams({ ...params, apiKey: config.polygonKey });
  return `${BASE}${path}?${q}`;
};
const ymd = (d) => new Date(d).toISOString().slice(0, 10);

// Daily bars, oldest first, in the same shape as prices.js uses.
async function dailyBars(symbol, days = 180) {
  const to = new Date();
  const from = new Date(Date.now() - days * 864e5);
  const d = await get(url(`/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/1/day/${ymd(from)}/${ymd(to)}`, { adjusted: 'true', sort: 'asc', limit: '50000' }), { json: true, ttlMs: 6 * 3600e3, timeoutMs: 15000 });
  const rows = d?.results || [];
  if (!rows.length) throw new Error(`Polygon: no daily bars for ${symbol}`);
  return rows.map((r) => ({
    date: new Date(r.t).toLocaleDateString('en-US', { timeZone: 'America/New_York' }),
    open: r.o, high: r.h, low: r.l, close: r.c, volume: r.v,
  }));
}

// Intraday/daily/weekly candles for charts. `etAsUtc` converts epoch ms to the chart's
// New-York-clock-as-UTC seconds.
async function candles(symbol, tf, etAsUtcMs) {
  const spec = { '1m': [1, 'minute', 2], '5m': [5, 'minute', 7], '15m': [15, 'minute', 20], '1h': [1, 'hour', 45], D: [1, 'day', 400], W: [1, 'week', 1900] }[tf] || [5, 'minute', 7];
  const [mult, span, days] = spec;
  const from = ymd(Date.now() - days * 864e5);
  const to = ymd(Date.now() + 864e5);
  const intraday = span === 'minute' || span === 'hour';
  const d = await get(url(`/v2/aggs/ticker/${encodeURIComponent(symbol)}/range/${mult}/${span}/${from}/${to}`, { adjusted: 'true', sort: 'asc', limit: '50000' }), { json: true, ttlMs: intraday ? 15e3 : 30 * 60e3, timeoutMs: 15000 });
  const rows = d?.results || [];
  if (!rows.length) throw new Error(`Polygon: no candles for ${symbol}`);
  return rows.map((r) => ({ time: etAsUtcMs(r.t), open: r.o, high: r.h, low: r.l, close: r.c, volume: r.v || 0 }));
}

// Live quotes for many symbols in one request (paid plans). Returns the same shape as
// quotes.js, including bid/ask when the plan provides them.
async function snapshot(symbols) {
  const d = await get(url('/v2/snapshot/locale/us/markets/stocks/tickers', { tickers: symbols.join(',') }), { json: true, timeoutMs: 8000 });
  const out = {};
  for (const t of d?.tickers || []) {
    const last = t.lastTrade?.p ?? t.min?.c ?? t.day?.c;
    if (!last) continue;
    out[t.ticker] = {
      symbol: t.ticker, name: '', last, change: t.todaysChange, changePct: t.todaysChangePerc,
      prevClose: t.prevDay?.c, volume: t.day?.v, bid: t.lastQuote?.p ?? null, ask: t.lastQuote?.P ?? null,
      status: null, ext: null, at: Date.now(), source: 'polygon',
    };
  }
  return out;
}

// Licensed news, with tickers already tagged by Polygon. Returned in feeds.js's item shape.
async function news({ ticker = null, limit = 200, hours = 72 } = {}) {
  const params = { order: 'desc', sort: 'published_utc', limit: String(Math.min(limit, 1000)), 'published_utc.gte': new Date(Date.now() - hours * 3600e3).toISOString() };
  if (ticker) params.ticker = ticker;
  const d = await get(url('/v2/reference/news', params), { json: true, ttlMs: 3 * 60e3, timeoutMs: 15000 });
  return (d?.results || []).map((n) => ({
    title: n.title, link: n.article_url, summary: (n.description || '').slice(0, 400),
    publishedAt: Date.parse(n.published_utc) || Date.now(), source: n.publisher?.name || 'Polygon',
    publisher: n.publisher?.name || 'Polygon', feed: 'Polygon News', kind: 'stocks',
    forTicker: ticker || (n.tickers?.length === 1 ? n.tickers[0] : null), tickersHint: n.tickers || [],
  }));
}

// Quick check for the Settings "Test connection" button.
async function test() {
  const out = { daily: false, snapshot: false, news: false, errors: [] };
  try { out.daily = (await dailyBars('AAPL', 10)).length > 0; } catch (e) { out.errors.push(`Prices: ${e.message}`); }
  try { out.snapshot = Object.keys(await snapshot(['AAPL'])).length > 0; } catch (e) { out.errors.push(`Live quotes: ${e.message} (needs a paid Polygon plan)`); }
  try { out.news = (await news({ limit: 5 })).length > 0; } catch (e) { out.errors.push(`News: ${e.message}`); }
  return out;
}

module.exports = { enabled, dailyBars, candles, snapshot, news, test };
