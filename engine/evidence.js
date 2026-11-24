// Per-stock evidence beyond headlines: analysts, earnings history, insiders,
// short interest and crowd sentiment. Each returns { score (−10…10) | null, ...details }.
// See RESEARCH.md §8 for why each is weighted the way it is.
const { get } = require('./http');
const { num } = require('./universe');

const nasdaq = (path) => get(`https://api.nasdaq.com/api/${path}`, { json: true, ttlMs: 3 * 3600e3, timeoutMs: 12000 });
const clamp = (x, lo = -10, hi = 10) => Math.max(lo, Math.min(hi, x));
const enc = (s) => encodeURIComponent(s.replace('.', '/'));

async function analysts(symbol, lastPrice) {
  const d = (await nasdaq(`analyst/${enc(symbol)}/targetprice`))?.data?.consensusOverview;
  if (!d || !(d.buy + d.hold + d.sell)) return null;
  const total = d.buy + d.hold + d.sell;
  const tilt = (d.buy - d.sell) / total; // −1…1
  const upside = lastPrice && d.priceTarget ? (d.priceTarget / lastPrice - 1) * 100 : null;
  // Targets are optimistic on average: haircut the upside by half before scoring.
  const score = clamp(tilt * 5 + (upside != null ? clamp(upside / 2 / 4, -5, 5) : 0));
  return { score, buy: d.buy, hold: d.hold, sell: d.sell, target: d.priceTarget, low: d.lowPriceTarget, high: d.highPriceTarget, upside };
}

async function earningsHistory(symbol) {
  const rows = (await nasdaq(`company/${enc(symbol)}/earnings-surprise`))?.data?.earningsSurpriseTable?.rows || [];
  if (!rows.length) return null;
  const qs = rows.slice(0, 4).map((r) => ({
    quarter: r.fiscalQtrEnd, reported: r.dateReported, eps: num(r.eps), forecast: num(r.consensusForecast), surprise: num(r.percentageSurprise),
  }));
  const last = qs[0];
  const daysSince = (Date.now() - new Date(last.reported).getTime()) / 864e5;
  const beats = qs.filter((q) => q.surprise > 0).length;
  // Post-earnings drift fades over ~60 trading days (~90 calendar days).
  const fade = Math.max(0, 1 - daysSince / 90);
  const streak = (beats - (qs.length - beats)) / qs.length; // −1…1
  const score = clamp(clamp((last.surprise || 0) / 2, -6, 6) * fade + streak * 3);
  return { score, quarters: qs, beats, of: qs.length, daysSinceReport: Math.round(daysSince) };
}

async function insiders(symbol) {
  const d = (await nasdaq(`company/${enc(symbol)}/insider-trades?limit=10&type=ALL&sortColumn=lastDate&sortOrder=DESC`))?.data;
  if (!d?.numberOfTrades) return null;
  const val = (rows, label, col = 'months3') => num(rows.find((r) => r.insiderTrade === label)?.[col]) || 0;
  const buys3 = val(d.numberOfTrades.rows, 'Number of Open Market Buys');
  const sells3 = val(d.numberOfTrades.rows, 'Number of Sells');
  const buys12 = val(d.numberOfTrades.rows, 'Number of Open Market Buys', 'months12');
  // Open-market buys are the informative signal; routine selling is weak evidence.
  const score = clamp(Math.min(buys3, 4) * 2 - (buys3 === 0 && sells3 >= 10 ? 1.5 : 0));
  const recent = (d.transactionTable?.table?.rows || []).slice(0, 6).map((r) => ({
    who: r.insider, role: r.relation, date: r.lastDate, type: r.transactionType, shares: r.sharesTraded, price: r.lastPrice,
  }));
  return { score, buys3, sells3, buys12, recent };
}

async function shortInterest(symbol) {
  const rows = (await nasdaq(`quote/${enc(symbol)}/short-interest?assetClass=stocks`))?.data?.shortInterestTable?.rows || [];
  if (!rows.length) return null;
  const cur = rows[0];
  const prev = rows[1];
  const dtc = Number(cur.daysToCover) || 0;
  const chg = prev ? (num(cur.interest) / num(prev.interest) - 1) * 100 : 0;
  // Heavy, rising short interest = informed bearish positioning.
  const score = clamp(-(Math.max(0, dtc - 3) * 0.8) - (chg > 10 ? 1.5 : 0) + (chg < -15 ? 1 : 0), -6, 2);
  return { score, daysToCover: dtc, shares: cur.interest, date: cur.settlementDate, changePct: chg };
}

async function crowd(symbol) {
  const d = await get(`https://api.stocktwits.com/api/2/streams/symbol/${encodeURIComponent(symbol)}.json`, { json: true, ttlMs: 10 * 60e3, timeoutMs: 10000 });
  const msgs = d?.messages || [];
  const tags = msgs.map((m) => m?.entities?.sentiment?.basic).filter(Boolean);
  const bull = tags.filter((t) => t === 'Bullish').length;
  return {
    score: null, // shown only — weak predictive evidence
    messages: msgs.length, tagged: tags.length, bullish: bull, bearish: tags.length - bull,
    bullPct: tags.length ? (bull / tags.length) * 100 : null,
    watchers: d?.symbol?.watchlist_count ?? null,
  };
}

async function nextEarnings(symbol) {
  const t = (await nasdaq(`analyst/${enc(symbol)}/earnings-date`))?.data?.announcement || '';
  const m = t.match(/([A-Z][a-z]{2} \d{1,2}, \d{4})/);
  return m ? { date: new Date(m[1]).getTime(), text: t.replace(/\*/g, '').trim() } : null;
}

module.exports = { analysts, earningsHistory, insiders, shortInterest, crowd, nextEarnings };
