// News sources. All free, no API keys.
//
// Three layers, so coverage goes well beyond a few front pages:
//   1. ~45 publisher feeds (business press, wire services, sector desks, forex desks)
//   2. ~40 catalyst searches across Google News and Bing News (upgrades, FDA, offerings…)
//   3. Per-stock searches for your watchlist, today's biggest movers, and (in a second
//      pass) every stock that already looks like a signal: Google, Bing, Seeking Alpha
//      and Nasdaq each, so one source rate-limiting doesn't blind the scan.
const { get, mapLimit } = require('./http');
const { parseFeed } = require('./rss');
const { num } = require('./universe');
const { config } = require('./config');
const polygon = require('./polygon');

const gnews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
const bing = (q) => `https://www.bing.com/news/search?q=${encodeURIComponent(q)}&format=rss&qft=interval%3d%227%22`;
const cnbc = (id) => `https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=${id}`;
const dj = (f) => `https://feeds.content.dowjones.io/public/rss/${f}`;
const prn = (s) => `https://www.prnewswire.com/rss/${s}-latest-news/${s}-latest-news-list.rss`;
const inv = (n) => `https://www.investing.com/rss/news_${n}.rss`;

const MARKET_FEEDS = [
  // Business & markets press
  { name: 'CNBC', kind: 'stocks', url: cnbc(100003114) },
  { name: 'CNBC Markets', kind: 'stocks', url: cnbc(20409666) },
  { name: 'CNBC Finance', kind: 'stocks', url: cnbc(10000664) },
  { name: 'CNBC Earnings', kind: 'stocks', url: cnbc(15839135) },
  { name: 'CNBC Investing', kind: 'stocks', url: cnbc(15839069) },
  { name: 'CNBC Tech', kind: 'stocks', url: cnbc(19854910) },
  { name: 'CNBC Health', kind: 'stocks', url: cnbc(10000108) },
  { name: 'CNBC Energy', kind: 'stocks', url: cnbc(19836768) },
  { name: 'CNBC Retail', kind: 'stocks', url: cnbc(10000116) },
  { name: 'CNBC Autos', kind: 'stocks', url: cnbc(10000101) },
  { name: 'CNBC Economy', kind: 'macro', url: cnbc(20910258) },
  { name: 'MarketWatch', kind: 'stocks', url: dj('mw_topstories') },
  { name: 'MarketWatch Pulse', kind: 'stocks', url: dj('mw_marketpulse') },
  { name: 'MarketWatch Bulletins', kind: 'stocks', url: dj('mw_bulletins') },
  { name: 'MarketWatch Real-time', kind: 'stocks', url: dj('mw_realtimeheadlines') },
  { name: 'WSJ Markets', kind: 'stocks', url: 'https://feeds.a.dj.com/rss/RSSMarketsMain.xml' },
  { name: 'WSJ Business', kind: 'stocks', url: 'https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml' },
  { name: 'Financial Times', kind: 'stocks', url: 'https://www.ft.com/markets?format=rss' },
  { name: 'New York Times', kind: 'stocks', url: 'https://rss.nytimes.com/services/xml/rss/nyt/Business.xml' },
  { name: 'BBC Business', kind: 'macro', url: 'https://feeds.bbci.co.uk/news/business/rss.xml' },
  { name: 'Fortune', kind: 'stocks', url: 'https://fortune.com/feed/fortune-feeds/?id=3230629' },
  { name: 'TechCrunch', kind: 'stocks', url: 'https://techcrunch.com/feed/' },
  { name: 'TheStreet', kind: 'stocks', url: 'https://www.thestreet.com/.rss/full/' },
  { name: 'Benzinga', kind: 'stocks', url: 'https://www.benzinga.com/feed' },
  { name: 'Seeking Alpha', kind: 'stocks', url: 'https://seekingalpha.com/market_currents.xml' },
  { name: 'Seeking Alpha Analysis', kind: 'stocks', url: 'https://seekingalpha.com/feed.xml' },
  { name: 'Nasdaq Markets', kind: 'stocks', url: 'https://www.nasdaq.com/feed/rssoutbound?category=Markets' },
  { name: 'Nasdaq Stocks', kind: 'stocks', url: 'https://www.nasdaq.com/feed/rssoutbound?category=Stocks' },
  { name: 'Nasdaq Earnings', kind: 'stocks', url: 'https://www.nasdaq.com/feed/rssoutbound?category=Earnings' },
  { name: 'Investing.com', kind: 'stocks', url: inv(25) },
  { name: 'Investing.com Earnings', kind: 'stocks', url: inv(1062) },
  { name: 'Investing.com Analyst Ratings', kind: 'stocks', url: inv(1061) },
  { name: 'Investing.com Insider Trading', kind: 'stocks', url: inv(357) },
  { name: 'Investing.com Commodities', kind: 'macro', url: inv(11) },
  { name: 'Investing.com Economy', kind: 'macro', url: inv(14) },
  // Company press releases (earnings, guidance, offerings, FDA, deals land here first)
  { name: 'PR Newswire', kind: 'stocks', url: 'https://www.prnewswire.com/rss/news-releases-list.rss' },
  { name: 'PR Newswire Finance', kind: 'stocks', url: prn('financial-services') },
  { name: 'PR Newswire Health', kind: 'stocks', url: prn('health') },
  { name: 'PR Newswire Tech', kind: 'stocks', url: prn('consumer-technology') },
  { name: 'PR Newswire Energy', kind: 'stocks', url: prn('energy') },
  // Forex & macro desks
  { name: 'Investing.com Forex', kind: 'forex', url: inv(1) },
  { name: 'FXStreet', kind: 'forex', url: 'https://www.fxstreet.com/rss/news' },
  { name: 'FXStreet Analysis', kind: 'forex', url: 'https://www.fxstreet.com/rss/analysis' },
  { name: 'ForexLive', kind: 'forex', url: 'https://www.forexlive.com/feed/' },
];

// Targeted searches for the catalysts with the strongest evidence (see RESEARCH.md),
// split between Google News and Bing News.
const GOOGLE_SEARCHES = [
  'stock upgraded to buy', 'stock downgraded', 'raises guidance stock', 'cuts guidance stock', 'lowers outlook shares',
  'earnings beat estimates shares', 'earnings miss estimates shares', 'FDA approval shares', 'FDA complete response letter',
  'phase 3 trial results shares', 'announces public offering shares', 'short seller report stock', 'SEC investigation shares',
  'to be acquired deal shares', 'added to S&P 500', 'insider buying shares', 'stock soars', 'stock plunges',
  'share repurchase program', 'going concern bankruptcy shares',
];
const BING_SEARCHES = [
  'analyst upgrade stock', 'analyst downgrade stock', 'raises full-year outlook', 'withdraws guidance', 'profit warning shares',
  'tops estimates revenue', 'misses estimates revenue', 'FDA approves', 'topline results phase', 'priced public offering',
  'activist investor stake', 'takeover bid shares', 'restatement auditor', 'Nasdaq deficiency notice', 'dividend cut',
  'insider purchase shares', 'price target raised', 'price target cut', 'stock jumps premarket', 'stock falls premarket',
];

const searchFeeds = () => [
  ...GOOGLE_SEARCHES.map((q) => ({ name: 'Google News', kind: 'stocks', url: gnews(`${q} when:2d`), search: q })),
  ...BING_SEARCHES.map((q) => ({ name: 'Bing News', kind: 'stocks', url: bing(q), search: q })),
];

// Per-stock coverage. `deep` adds Seeking Alpha + Nasdaq company feeds on top of search.
function tickerFeeds(symbols, { deep = false } = {}) {
  const out = [];
  symbols.forEach((t, i) => {
    // Alternate search engines so neither rate-limits us.
    out.push(i % 2 === 0
      ? { name: 'Google News', kind: 'stocks', forTicker: t, url: gnews(`${t} stock when:3d`) }
      : { name: 'Bing News', kind: 'stocks', forTicker: t, url: bing(`${t} stock`) });
    if (deep) {
      out.push({ name: 'Seeking Alpha', kind: 'stocks', forTicker: t, url: `https://seekingalpha.com/api/sa/combined/${encodeURIComponent(t)}.xml` });
      out.push({ name: 'Nasdaq', kind: 'stocks', forTicker: t, url: `https://www.nasdaq.com/feed/rssoutbound?symbol=${encodeURIComponent(t)}` });
    }
  });
  return out;
}

// Today's biggest movers (by % and by dollar volume), filtered to real companies.
async function movers(u, minCap) {
  const d = await get('https://api.nasdaq.com/api/marketmovers?assetclass=stocks', { json: true, ttlMs: 10 * 60e3 });
  const s = d?.data?.STOCKS || {};
  const rows = ['MostAdvanced', 'MostDeclined', 'MostActiveByDollarVolume', 'MostActiveByShareVolume']
    .flatMap((k) => s[k]?.table?.rows || [])
    .map((r) => r.symbol);
  return [...new Set(rows)].filter((sym) => (u.bySymbol.get(sym)?.marketCap || 0) >= minCap && (num(u.bySymbol.get(sym)?.price) || 0) >= 3);
}

function stripSource(title) {
  // Google News titles end with " - Publisher".
  const i = title.lastIndexOf(' - ');
  return i > 10 && title.length - i < 64 ? { title: title.slice(0, i).trim(), publisher: title.slice(i + 3).trim() } : { title, publisher: '' };
}

async function fetchFeed(feed) {
  const xml = await get(feed.url, { ttlMs: 5 * 60e3, timeoutMs: 15000 });
  return parseFeed(xml).map((it) => {
    const { title, publisher } = feed.name === 'Google News' ? stripSource(it.title) : { title: it.title, publisher: '' };
    return { ...it, title, feed: feed.name, publisher: publisher || it.source || feed.name, kind: feed.kind, forTicker: feed.forTicker || null };
  });
}

const label = (f) => (f.search ? `${f.name}: ${f.search}` : f.forTicker ? `${f.name}: ${f.forTicker}` : f.name);

async function fetchFeeds(feeds, onProgress = () => {}) {
  let done = 0;
  const status = [];
  const results = await mapLimit(feeds, 6, async (f) => {
    try {
      const items = await fetchFeed(f);
      status.push({ name: label(f), ok: true, count: items.length });
      return items;
    } catch (e) {
      status.push({ name: label(f), ok: false, error: String(e.message || e) });
      return [];
    } finally {
      onProgress(++done, feeds.length);
    }
  });
  return { items: results.flat().filter(Boolean), status };
}

// De-duplicate by normalized title, keeping the ticker hint if any copy had one.
function dedupe(items) {
  const seen = new Map();
  for (const it of items) {
    const key = it.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').slice(0, 90);
    const prev = seen.get(key);
    if (!prev) seen.set(key, it);
    else {
      if (it.forTicker && !prev.forTicker) prev.forTicker = it.forTicker;
      if (it.tickersHint?.length && !prev.tickersHint?.length) prev.tickersHint = it.tickersHint;
    }
  }
  return [...seen.values()];
}

// Licensed news from Polygon: the market-wide stream plus each per-stock request.
async function polygonNews(symbols = []) {
  const status = [];
  const lists = await mapLimit([null, ...symbols], 4, async (t) => {
    try {
      const items = await polygon.news({ ticker: t, limit: t ? 50 : 1000 });
      status.push({ name: `Polygon News${t ? `: ${t}` : ''}`, ok: true, count: items.length });
      return items;
    } catch (e) {
      status.push({ name: `Polygon News${t ? `: ${t}` : ''}`, ok: false, error: String(e.message || e) });
      return [];
    }
  });
  return { items: lists.flat().filter(Boolean), status };
}

async function fetchAllNews(u, { watchlist = [], minCap = 5e8 } = {}, onProgress = () => {}) {
  const moving = config.licensedOnly ? [] : await movers(u, minCap).catch(() => []);
  const perStock = [...new Set([...watchlist.slice(0, 40), ...moving.slice(0, 30)])];
  const licensed = polygon.enabled() ? await polygonNews(watchlist.slice(0, 40)) : { items: [], status: [] };
  if (config.licensedOnly) {
    onProgress(1, 1);
    return { items: dedupe(licensed.items), status: licensed.status, covered: new Set(perStock), movers: moving };
  }
  const feeds = [...MARKET_FEEDS, ...searchFeeds(), ...tickerFeeds(perStock)];
  const { items, status } = await fetchFeeds(feeds, onProgress);
  return { items: dedupe([...licensed.items, ...items]), status: [...licensed.status, ...status], covered: new Set(perStock), movers: moving };
}

// Deep-dive pass for candidate stocks: licensed per-stock news, plus the free per-stock feeds.
async function deepDive(symbols, onProgress = () => {}) {
  const licensed = polygon.enabled() ? await polygonNews(symbols) : { items: [], status: [] };
  if (config.licensedOnly) return licensed;
  const free = await fetchFeeds(tickerFeeds(symbols, { deep: true }), onProgress);
  return { items: [...licensed.items, ...free.items], status: [...licensed.status, ...free.status] };
}

module.exports = { fetchAllNews, deepDive, fetchFeeds, tickerFeeds, dedupe };
