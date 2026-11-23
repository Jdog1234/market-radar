// News sources. All free, no API keys.
const { get, mapLimit } = require('./http');
const { parseFeed } = require('./rss');

const gnews = (q) => `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
const cnbc = (id) => `https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=${id}`;

const MARKET_FEEDS = [
  { name: 'CNBC', kind: 'stocks', url: cnbc(100003114) },
  { name: 'CNBC Finance', kind: 'stocks', url: cnbc(10000664) },
  { name: 'CNBC Earnings', kind: 'stocks', url: cnbc(15839135) },
  { name: 'CNBC Investing', kind: 'stocks', url: cnbc(15839069) },
  { name: 'CNBC Economy', kind: 'macro', url: cnbc(20910258) },
  { name: 'MarketWatch', kind: 'stocks', url: 'https://feeds.content.dowjones.io/public/rss/mw_topstories' },
  { name: 'MarketWatch Pulse', kind: 'stocks', url: 'https://feeds.content.dowjones.io/public/rss/mw_marketpulse' },
  { name: 'MarketWatch Bulletins', kind: 'stocks', url: 'https://feeds.content.dowjones.io/public/rss/mw_bulletins' },
  { name: 'Seeking Alpha', kind: 'stocks', url: 'https://seekingalpha.com/market_currents.xml' },
  { name: 'Investing.com', kind: 'stocks', url: 'https://www.investing.com/rss/news_25.rss' },
  { name: 'Investing.com Earnings', kind: 'stocks', url: 'https://www.investing.com/rss/news_1062.rss' },
  { name: 'Investing.com Economy', kind: 'macro', url: 'https://www.investing.com/rss/news_14.rss' },
  { name: 'Investing.com Forex', kind: 'forex', url: 'https://www.investing.com/rss/news_1.rss' },
  { name: 'FXStreet', kind: 'forex', url: 'https://www.fxstreet.com/rss/news' },
  { name: 'PR Newswire', kind: 'stocks', url: 'https://www.prnewswire.com/rss/financial-services-latest-news/financial-services-latest-news-list.rss' },
];

// Targeted searches for the catalysts with the strongest evidence (see RESEARCH.md).
const CATALYST_SEARCHES = [
  'stock upgraded to buy', 'stock downgraded', 'raises guidance stock', 'cuts guidance stock', 'lowers outlook shares',
  'earnings beat estimates shares', 'earnings miss estimates shares', 'FDA approval shares', 'FDA complete response letter',
  'phase 3 trial results shares', 'announces public offering shares', 'short seller report stock', 'SEC investigation shares',
  'to be acquired deal shares', 'added to S&P 500', 'insider buying shares', 'stock soars', 'stock plunges',
  'share repurchase program', 'going concern bankruptcy shares',
].map((q) => ({ name: 'Google News', kind: 'stocks', url: gnews(`${q} when:2d`), search: q }));

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

async function fetchAllNews(watchlist = [], onProgress = () => {}) {
  const tickerFeeds = watchlist.slice(0, 40).map((t) => ({
    name: 'Google News', kind: 'stocks', forTicker: t, url: gnews(`${t} stock when:3d`),
  }));
  const all = [...MARKET_FEEDS, ...CATALYST_SEARCHES, ...tickerFeeds];
  let done = 0;
  const status = [];
  const results = await mapLimit(all, 4, async (f) => {
    try {
      const items = await fetchFeed(f);
      status.push({ name: f.search ? `Google: ${f.search}` : f.forTicker ? `Google: ${f.forTicker}` : f.name, ok: true, count: items.length });
      return items;
    } catch (e) {
      status.push({ name: f.name, ok: false, error: String(e.message || e) });
      return [];
    } finally {
      onProgress(++done, all.length);
    }
  });

  // De-duplicate by normalized title.
  const seen = new Map();
  for (const it of results.flat().filter(Boolean)) {
    const key = it.title.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').slice(0, 90);
    const prev = seen.get(key);
    if (!prev) seen.set(key, it);
    else if (it.forTicker && !prev.forTicker) prev.forTicker = it.forTicker;
  }
  return { items: [...seen.values()], status };
}

module.exports = { fetchAllNews };
