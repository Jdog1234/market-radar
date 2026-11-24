// Stock Lookup: everything the app knows about one ticker, plus a verdict on which
// way the evidence points.
const { get } = require('./http');
const { parseFeed } = require('./rss');
const { loadUniverse } = require('./universe');
const { history, technicals } = require('./prices');
const { analyzeItems, aggregate } = require('./scanner');
const ev = require('./evidence');

const WEIGHTS = { news: 0.45, trend: 0.2, analysts: 0.1, earnings: 0.1, insiders: 0.075, short: 0.075 };

async function search(query, limit = 12) {
  const u = await loadUniverse();
  const q = query.trim().toUpperCase();
  if (!q) return [];
  const out = [];
  for (const s of u.bySymbol.values()) {
    const sym = s.symbol;
    const name = s.name.toUpperCase();
    let rank = sym === q ? 0 : sym.startsWith(q) ? 1 : name.startsWith(q) ? 2 : name.includes(q) ? 3 : -1;
    if (rank < 0) continue;
    out.push({ rank, cap: s.marketCap || 0, symbol: sym, name: s.name, price: s.price, pctChange: s.pctChange });
  }
  return out.sort((a, b) => a.rank - b.rank || b.cap - a.cap).slice(0, limit);
}

async function gnewsItems(q, forTicker) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
  const xml = await get(url, { ttlMs: 10 * 60e3, timeoutMs: 15000 });
  return parseFeed(xml).map((it) => {
    const i = it.title.lastIndexOf(' - ');
    const has = i > 10 && it.title.length - i < 64;
    return { ...it, title: has ? it.title.slice(0, i) : it.title, publisher: has ? it.title.slice(i + 3) : 'Google News', feed: 'Google News', kind: 'stocks', forTicker };
  });
}

async function lookup(symbol, lastScan) {
  symbol = symbol.toUpperCase().trim();
  const u = await loadUniverse();
  const info = u.bySymbol.get(symbol);
  if (!info) throw new Error(`Unknown ticker "${symbol}"`);
  const now = Date.now();

  const safe = (p) => p.catch(() => null);
  const [bars, newsA, newsB] = await Promise.all([
    safe(history(symbol)),
    safe(gnewsItems(`${symbol} stock when:7d`, symbol)),
    safe(gnewsItems(`"${info.short}" when:7d`, symbol)),
  ]);
  const tech = technicals(bars);
  const [analysts, earnings, insiders, short, crowd, nextEarn] = await Promise.all([
    safe(ev.analysts(symbol, tech?.last ?? info.price)),
    safe(ev.earningsHistory(symbol)),
    safe(ev.insiders(symbol)),
    safe(ev.shortInterest(symbol)),
    safe(ev.crowd(symbol)),
    safe(ev.nextEarnings(symbol)),
  ]);

  // Headlines: targeted searches + anything the last full scan already tied to this stock.
  const seen = new Set();
  const items = [...(newsA || []), ...(newsB || [])].filter((it) => {
    const k = it.title.toLowerCase().slice(0, 80);
    return seen.has(k) ? false : seen.add(k);
  });
  const analyzed = analyzeItems(items, u, now);
  for (const n of lastScan?.news || []) {
    if (n.tickers.includes(symbol) && !seen.has(n.title.toLowerCase().slice(0, 80))) {
      // Scan headlines are already analyzed; rebuild the private catalyst fields.
      const again = analyzeItems([{ ...n, summary: '' }], u, now)[0];
      if (again) analyzed.push({ ...again, tickers: n.tickers });
    }
  }
  const scored = aggregate(analyzed, u, now, (s) => s === symbol)[0];
  const news = scored || { newsScore: 0, reasons: [], independentSources: 0, headlines: [] };

  // Weighted evidence; missing pieces are dropped and the rest re-normalized.
  const parts = [
    { key: 'news', label: 'News catalysts', score: news.headlines.length ? news.newsScore : null },
    { key: 'trend', label: 'Price trend & momentum', score: tech?.score ?? null },
    { key: 'analysts', label: 'Analyst consensus', score: analysts?.score ?? null },
    { key: 'earnings', label: 'Earnings-surprise history', score: earnings?.score ?? null },
    { key: 'insiders', label: 'Insider buying/selling', score: insiders?.score ?? null },
    { key: 'short', label: 'Short interest', score: short?.score ?? null },
  ].map((p) => ({ ...p, weight: WEIGHTS[p.key] }));
  const present = parts.filter((p) => p.score != null);
  const wsum = present.reduce((s, p) => s + p.weight, 0) || 1;
  let composite = present.reduce((s, p) => s + p.score * p.weight, 0) / wsum;
  if (tech?.rvol > 1 && news.headlines.length) composite *= 1 + 0.1 * Math.min(tech.rvol - 1, 3);
  composite = Math.max(-10, Math.min(10, composite));

  const agree = present.filter((p) => Math.sign(p.score) === Math.sign(composite) && Math.abs(p.score) >= 1).length;
  const disagree = present.filter((p) => Math.sign(p.score) === -Math.sign(composite) && Math.abs(p.score) >= 1).length;
  const strength = Math.abs(composite);
  const direction = strength < 1.5 ? 'neutral' : composite > 0 ? 'up' : 'down';
  const confidence = strength >= 5 && agree >= 3 && disagree <= 1 ? 'High' : strength >= 2.5 && agree > disagree ? 'Medium' : 'Low';
  const headline =
    direction === 'neutral' ? 'No clear signal: the evidence is mixed or quiet'
    : `${direction === 'up' ? 'Evidence leans BULLISH' : 'Evidence leans BEARISH'} (${confidence.toLowerCase()} confidence)`;

  const flags = [];
  if (nextEarn && nextEarn.date - now < 14 * 864e5 && nextEarn.date > now - 864e5) {
    flags.push({ kind: 'warn', text: `Earnings ${new Date(nextEarn.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}: binary event, can gap either way` });
  }
  if (tech?.ret5 > 25) flags.push({ kind: 'warn', text: `Up ${tech.ret5.toFixed(0)}% in 5 days: chasing risk` });
  if (tech?.ret5 < -25) flags.push({ kind: 'warn', text: `Down ${Math.abs(tech.ret5).toFixed(0)}% in 5 days: bounce risk` });
  if (short?.daysToCover >= 7 && composite > 0) flags.push({ kind: 'warn', text: `${short.daysToCover.toFixed(1)} days to cover: squeeze potential, but shorts are betting against it` });
  if (crowd?.bullPct >= 80 && crowd.tagged >= 10) flags.push({ kind: 'warn', text: `Crowd is ${crowd.bullPct.toFixed(0)}% bullish on StockTwits: heavy hype often reverses` });
  if (tech?.rvol >= 2) flags.push({ kind: 'good', text: `In play: ${tech.rvol.toFixed(1)}× normal volume` });
  if (!news.headlines.length) flags.push({ kind: 'warn', text: 'No company-specific news found in the last week' });

  return {
    symbol, name: info.name, sector: info.sector, industry: info.industry, marketCap: info.marketCap,
    at: now, composite, direction, confidence, headline, parts, flags,
    news, tech, analysts, earnings, insiders, short, crowd, nextEarnings: nextEarn,
  };
}

module.exports = { search, lookup };
