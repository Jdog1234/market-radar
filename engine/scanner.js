// One full scan: news → tickers → catalysts → price confirmation → ranked lists.
const { mapLimit } = require('./http');
const { fetchAllNews, deepDive, dedupe } = require('./feeds');
const { buildSetups } = require('./setups');
const { quotes } = require('./quotes');
const { classify } = require('./catalysts');
const { loadUniverse, tagTickers } = require('./universe');
const { history, technicals } = require('./prices');
const { economicCalendar, earningsCalendar } = require('./macro');

const HOUR = 3600e3;
const MAX_AGE = 5 * 24 * HOUR;

// Banks/brokers that usually appear as the *source* of an analyst call, not its subject.
const BROKERS = new Set(['MS', 'GS', 'JPM', 'C', 'BCS', 'UBS', 'DB', 'WFC', 'BAC', 'HSBC', 'JEF', 'RJF', 'PIPR', 'SF', 'EVR', 'MFG', 'LAZ', 'SCHW', 'BMO', 'RY', 'TD', 'CM', 'BNS', 'ING', 'SAN', 'NMR']);
const BROKER_ACTION = /\b(upgrade|downgrade|initiat|price target|pt\b|rating|says|sees|warns|expects|strategist|analysts?|economists?|note|forecasts?|predicts?|top picks?|bullish|bearish|overweight|underweight|outperform|underperform)/i;
// "A acquires B": B is the takeover target, A is not.
const ACQUIRES = /\b(acquires?|to acquire|agrees? to (buy|acquire)|to buy|buys|bids? for|takeover of|merger with|to merge with)\b/i;
const MNA_CTX = /\b(billion|million|\$\d|acquisition|acquires?|acquire|takeover|merger|merge|all-cash|per share|buyout|deal)\b/i;

// Aggregators / SEO publishers: often recycled or auto-generated.
const LOW_QUALITY = /ad-hoc-news|zacks|motley fool|fool\.com|simply wall|marketbeat|wall street zen|investorplace|24\/7 wall|gurufocus|tipranks|insider monkey|stocktitan|ainvest|benzinga pro|seeking alpha \(user\)|finimize|yahoo finance video/i;

const ACQUIRED_RULE = { id: 'acquired', label: 'Takeover target', weight: 4, hl: 96 };

const decay = (ageMs, halfLifeHrs) => Math.pow(0.5, Math.max(0, ageMs) / (halfLifeHrs * HOUR));

async function scan(settings, onProgress = () => {}) {
  const now = Date.now();
  const watchlist = (settings.watchlist || []).map((s) => s.toUpperCase().trim()).filter(Boolean);
  const progress = (stage, pct) => onProgress({ stage, pct });

  progress('Loading stock universe…', 2);
  const u = await loadUniverse();

  const minCap = settings.minMarketCap ?? 5e8;
  const minPrice = settings.minPrice ?? 3;
  const include = (sym, info) => watchlist.includes(sym) || ((info.marketCap || 0) >= minCap && (info.price || 0) >= minPrice);

  // Pass 1: the broad sweep (publisher feeds, catalyst searches, watchlist, today's movers).
  progress('Reading news feeds…', 5);
  const [first, econ, earnings] = await Promise.all([
    fetchAllNews(u, { watchlist, minCap }, (d, t) => progress(`Reading news (${d}/${t} sources)…`, 5 + (d / t) * 40)),
    economicCalendar(settings.econCacheFile).catch(() => []),
    earningsCalendar(6).catch(() => []),
  ]);

  // Pass 2: deep dive. Every stock that already looks like a signal gets its own
  // searches plus its Seeking Alpha and Nasdaq company feeds, to confirm or refute it.
  const prelim = aggregate(analyzeItems(first.items, u, now), u, now, include)
    .sort((x, y) => Math.abs(y.newsRaw) - Math.abs(x.newsRaw));
  const deepSyms = prelim.filter((c) => Math.abs(c.newsRaw) >= 1).slice(0, settings.deepDive ?? 30).map((c) => c.symbol);
  const second = await deepDive(deepSyms, (d, t) => progress(`Deep dive on ${deepSyms.length} stocks (${d}/${t})…`, 45 + (d / t) * 17));
  const items = dedupe([...first.items, ...second.items]);
  const status = [...first.status, ...second.status];

  progress('Classifying headlines…', 62);
  const news = analyzeItems(items, u, now);

  const candidates = aggregate(news, u, now, include);
  for (const c of candidates) c.onWatch = watchlist.includes(c.symbol);
  // Watchlist stocks always appear, even without news.
  for (const sym of watchlist) {
    if (!candidates.some((c) => c.symbol === sym) && u.bySymbol.has(sym)) {
      const info = u.bySymbol.get(sym);
      candidates.push({ symbol: sym, name: info.name, sector: info.sector, industry: info.industry, marketCap: info.marketCap,
        onWatch: true, newsRaw: 0, newsScore: 0, reasons: [], independentSources: 0, headlines: [] });
    }
  }

  // ---- price confirmation for the strongest candidates ----
  candidates.sort((x, y) => Math.abs(y.newsRaw) - Math.abs(x.newsRaw));
  const toPrice = candidates.filter((c) => c.onWatch || Math.abs(c.newsRaw) >= 0.8).slice(0, settings.maxPriced ?? 70);
  let pDone = 0;
  progress('Checking price & volume…', 65);
  const [spy, qqq] = await Promise.all([history('SPY', 'etf').catch(() => null), history('QQQ', 'etf').catch(() => null)]);
  // The stock list's prices can lag (Nasdaq's is the prior close intraday), so fetch
  // real-time quotes for everything being priced in a few batched requests.
  const live = await quotes(toPrice.map((c) => c.symbol)).catch(() => ({}));
  await mapLimit(toPrice, 5, async (c) => {
    try {
      // Today's bar from the batch of real-time quotes fetched above (one request per 50 stocks).
      const q = live[c.symbol];
      c._bars = await history(c.symbol, 'stocks', q?.last ? { price: q.last, volume: q.volume } : null);
      c.tech = technicals(c._bars);
    } catch {
      c.tech = null;
    }
    progress(`Checking price & volume (${++pDone}/${toPrice.length})…`, 65 + (pDone / toPrice.length) * 30);
  });

  const earnSoon = new Map();
  for (const e of earnings) if (!earnSoon.has(e.symbol)) earnSoon.set(e.symbol, e);

  for (const c of candidates) {
    const t = c.tech;
    const techScore = t ? t.score : 0;
    let composite = t ? 0.65 * c.newsScore + 0.35 * techScore : 0.8 * c.newsScore;
    // Stocks "in play" (heavy relative volume) — news is being acted on.
    if (t?.rvol && t.rvol > 1) composite *= 1 + 0.15 * Math.min(t.rvol - 1, 3);
    composite = Math.max(-10, Math.min(10, composite));
    c.composite = composite;
    c.agree = t ? Math.sign(c.newsScore) === Math.sign(techScore) : null;

    const flags = [];
    if (t?.ret5 > 25) flags.push({ kind: 'warn', text: `Extended: +${t.ret5.toFixed(0)}% in 5 days — chasing risk` });
    if (t?.ret5 < -25) flags.push({ kind: 'warn', text: `Already ${t.ret5.toFixed(0)}% in 5 days — bounce risk` });
    if (t?.rvol >= 2) flags.push({ kind: 'good', text: `In play: ${t.rvol.toFixed(1)}× normal volume` });
    if (c.agree === false && c.newsScore !== 0) flags.push({ kind: 'warn', text: 'Price trend disagrees with the news' });
    const e = earnSoon.get(c.symbol);
    if (e) {
      const days = Math.round((new Date(e.date + 'T12:00:00').getTime() - now) / 864e5);
      c.earnings = e;
      flags.push({ kind: 'warn', text: `Earnings ${days <= 0 ? 'today' : `in ${days} day${days === 1 ? '' : 's'}`} (${e.time}) — binary risk` });
    }
    if (c.headlines.length && c.headlines.every((h) => h.opinion)) flags.push({ kind: 'warn', text: 'Only opinion pieces — weak evidence' });
    c.flags = flags;

    const strong = Math.abs(composite) >= 5.5;
    c.confidence = strong && c.agree && c.independentSources >= 2 ? 'High' : Math.abs(composite) >= 3 && c.agree !== false ? 'Medium' : 'Low';
  }

  const ranked = candidates.filter((c) => c.reasons.length);
  const bullish = ranked.filter((c) => c.newsScore > 0.5 && c.composite > 0).sort((a, b) => b.composite - a.composite).slice(0, 30);
  const bearish = ranked.filter((c) => c.newsScore < -0.5 && c.composite < 0).sort((a, b) => a.composite - b.composite).slice(0, 30);

  const regime = marketRegime(technicals(spy), technicals(qqq));
  progress('Building setups & trade ideas…', 97);
  const setups = await buildSetups({ candidates, earnings, regime, now, include });
  for (const c of candidates) delete c._bars;
  const todayHigh = econ.filter((e) => e.impact === 'High' && sameDay(e.time, now));

  progress('Done', 100);
  return {
    scannedAt: now,
    bullish, bearish,
    watchlist: candidates.filter((c) => c.onWatch).sort((a, b) => b.composite - a.composite),
    ...setups,
    news: news.map(stripPrivate).sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 1500),
    econ, earnings, regime, todayHigh,
    stats: { headlines: news.length, tagged: news.filter((n) => n.tickers.length).length, candidates: candidates.length, priced: toPrice.length,
      sources: status.length, deepDive: deepSyms.length, movers: first.movers.length, feeds: status },
  };
}

// Classify every headline and tag the tickers it is about.
function analyzeItems(items, u, now = Date.now()) {
  const news = [];
  for (const it of items) {
    const at = it.publishedAt || now;
    if (now - at > MAX_AGE) continue;
    const text = `${it.title}. ${it.kind === 'stocks' ? it.summary : ''}`;
    const tickers = new Set(tagTickers(it.title, u));
    // Summaries are noisier: only explicit ticker tags, not company names.
    for (const t of tagTickers(it.summary || '', u, { allowNames: false })) tickers.add(t);
    // Licensed feeds tag tickers themselves; trust them when an article names a few.
    if (it.tickersHint?.length && it.tickersHint.length <= 3) for (const t of it.tickersHint) if (u.bySymbol.has(t)) tickers.add(t);
    if (it.forTicker && u.bySymbol.has(it.forTicker)) {
      const s = u.bySymbol.get(it.forTicker);
      if (tickers.size === 0 || it.title.includes(it.forTicker) || it.title.includes(s.short)) tickers.add(it.forTicker);
    }
    const { catalysts, lawSpam, opinion } = classify(text);
    const titleOnly = classify(it.title);
    // Prefer title catalysts; summary-only catalysts count at half strength.
    const cats = catalysts.map((c) => ({ ...c, half: !titleOnly.catalysts.some((t) => t.id === c.id) }));

    // Brokers quoted as the source of a call aren't the subject of it.
    if (BROKER_ACTION.test(it.title) && !/\b(earnings|profit|revenue|results|quarter)\b/i.test(it.title)) {
      for (const t of [...tickers]) if (BROKERS.has(t)) tickers.delete(t);
    }
    // Takeovers: only the company being bought gets the bullish takeover catalyst.
    const perTicker = {};
    const acq = it.title.match(ACQUIRES);
    const afterAcq = acq ? it.title.slice(acq.index + acq[0].length) : '';
    if (acq && tickers.size && MNA_CTX.test(it.title.replace(acq[0], '')) && !/\b(shares|stake|stock|bonds?|notes|calls|puts|dip)\b/i.test(afterAcq.slice(0, 50))) {
      const after = new Set(tagTickers(afterAcq, u));
      for (const t of tickers) {
        perTicker[t] = after.has(t) ? [{ ...ACQUIRED_RULE, half: false }] : [];
      }
    }
    for (const t of Object.keys(perTicker)) {
      // Buyers don't inherit the target's "acquired" / price-pop catalysts.
      if (!perTicker[t].length) perTicker[t] = cats.filter((c) => c.id !== 'acquired' && !c.momentum);
      else perTicker[t] = [...perTicker[t], ...cats.filter((c) => c.id !== 'acquired')];
    }

    news.push({
      title: it.title, link: it.link, publisher: it.publisher, feed: it.feed, kind: it.kind, publishedAt: at,
      tickers: [...tickers], catalysts: cats.map((c) => ({ id: c.id, label: c.label, weight: c.weight })),
      lawSpam, opinion, _cats: cats, _perTicker: perTicker,
    });
  }
  return news;
}

// Sum decayed catalyst weights per ticker → news score, reasons and headlines.
function aggregate(news, u, now, include = () => true) {
  const agg = new Map();
  for (const n of news) {
    if (!n.tickers.length) continue;
    if (n.tickers.length > 4) continue; // market-wide roundup, not about one company
    const age = now - n.publishedAt;
    const srcW = n.opinion ? 0.4 : LOW_QUALITY.test(n.publisher) ? 0.6 : 1;
    for (const sym of n.tickers) {
      const info = u.bySymbol.get(sym);
      if (!include(sym, info)) continue;
      const cats = n._perTicker[sym] || n._cats;
      if (!cats.length) continue;
      let a = agg.get(sym);
      if (!a) agg.set(sym, (a = { symbol: sym, info, byCat: new Map(), headlines: [], firstAt: {} }));
      a.headlines.push(n);
      // When did news pointing each way first appear? (setups.js measures the reaction since.)
      if (!n.opinion && !n.lawSpam) {
        for (const c of cats) {
          if (c.momentum) continue;
          const d = c.weight > 0 ? 'up' : 'down';
          a.firstAt[d] = Math.min(a.firstAt[d] ?? Infinity, n.publishedAt);
        }
      }
      for (const c of cats) {
        let w = c.weight * decay(age, c.hl) * srcW * (c.half ? 0.5 : 1) / Math.sqrt(n.tickers.length);
        if (n.lawSpam) w = Math.max(w, -0.3);
        if (!a.byCat.has(c.id)) a.byCat.set(c.id, { id: c.id, label: c.label, weight: c.weight, contribs: [] });
        a.byCat.get(c.id).contribs.push(w);
      }
    }
  }

  const out = [];
  for (const a of agg.values()) {
    let raw = 0;
    const reasons = [];
    for (const c of a.byCat.values()) {
      // Repeats of the same catalyst count with diminishing weight (syndication ≠ new info).
      const total = c.contribs.sort((x, y) => Math.abs(y) - Math.abs(x)).reduce((s, w, i) => s + w * Math.pow(0.5, i), 0);
      raw += total;
      reasons.push({ id: c.id, label: c.label, value: total, count: c.contribs.length });
    }
    reasons.sort((x, y) => Math.abs(y.value) - Math.abs(x.value));
    const sources = new Set(a.headlines.filter((h) => !h.opinion && !h.lawSpam).map((h) => h.publisher.toLowerCase()));
    out.push({
      symbol: a.symbol, name: a.info.name, sector: a.info.sector, industry: a.info.industry, marketCap: a.info.marketCap,
      newsRaw: raw, newsScore: 10 * Math.tanh(raw / 6), reasons, independentSources: sources.size, firstAt: a.firstAt,
      headlines: a.headlines.sort((x, y) => y.publishedAt - x.publishedAt).slice(0, 15).map(stripPrivate),
    });
  }
  return out;
}

function stripPrivate(n) {
  const { _cats, _perTicker, ...rest } = n;
  return rest;
}

function sameDay(a, b) {
  const f = (t) => new Date(t).toLocaleDateString('en-US', { timeZone: 'America/New_York' });
  return f(a) === f(b);
}

function marketRegime(spy, qqq) {
  const one = (t, name) => {
    if (!t) return null;
    const up = t.last > t.sma20 && (!t.sma50 || t.last > t.sma50);
    const down = t.last < t.sma20 && (!t.sma50 || t.last < t.sma50);
    return { name, last: t.last, ret1: t.ret1, ret5: t.ret5, ret20: t.ret20, state: up ? 'Uptrend' : down ? 'Downtrend' : 'Mixed', spark: t.spark };
  };
  const s = one(spy, 'S&P 500 (SPY)');
  const q = one(qqq, 'Nasdaq 100 (QQQ)');
  const states = [s, q].filter(Boolean).map((x) => x.state);
  const verdict = states.every((x) => x === 'Uptrend') ? 'Risk-on: bullish setups have the tide behind them'
    : states.every((x) => x === 'Downtrend') ? 'Risk-off: bearish setups have the tide behind them; be picky with longs'
    : 'Mixed market: favor stocks with the strongest, cleanest catalysts';
  return { indices: [s, q].filter(Boolean), verdict };
}

module.exports = { scan, analyzeItems, aggregate };
