// Candlestick patterns: detection on real daily bars, and what actually happened after them.
// Rules follow the common textbook definitions (Nison; Bulkowski), with the trend before the
// pattern required where the pattern is a reversal. Measurements are honest: each pattern's
// 5-day result is compared with an ordinary day for the same stocks, because many classic
// patterns turn out to be close to a coin flip (Marshall, Young & Rose 2006).
const { candles } = require('./quotes');
const { mapLimit } = require('./http');

// Large, heavily traded US stocks and ETFs across sectors (the pattern dataset).
const DATA_SYMBOLS = [
  'SPY', 'QQQ', 'IWM', 'DIA', 'AAPL', 'MSFT', 'NVDA', 'AMZN', 'GOOGL', 'META', 'TSLA', 'AVGO', 'AMD', 'NFLX',
  'JPM', 'BAC', 'GS', 'V', 'MA', 'XOM', 'CVX', 'UNH', 'JNJ', 'LLY', 'PFE', 'MRK', 'WMT', 'COST', 'HD', 'MCD',
  'NKE', 'DIS', 'KO', 'PEP', 'CAT', 'BA', 'GE', 'INTC', 'CRM', 'ORCL', 'ADBE', 'UBER',
  'XLF', 'XLE', 'XLK', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'GLD', 'TLT', 'C', 'WFC', 'MS', 'AXP', 'SCHW', 'BLK',
  'ABBV', 'TMO', 'ABT', 'AMGN', 'BMY', 'CVS', 'MDT', 'ISRG', 'PG', 'PM', 'MO', 'CL', 'TGT', 'LOW', 'SBUX', 'BKNG',
  'COP', 'SLB', 'OXY', 'HON', 'UPS', 'RTX', 'LMT', 'DE', 'MMM', 'UNP', 'CSCO', 'QCOM', 'TXN', 'MU', 'AMAT', 'IBM',
  'NOW', 'INTU', 'PYPL', 'SHOP', 'PLTR', 'COIN', 'T', 'VZ', 'TMUS', 'CMCSA', 'F', 'GM', 'NEE', 'DUK', 'SO', 'AMT',
];
const HORIZON = 5; // trading days after the pattern

// kind: bullish | bearish | neutral; type: reversal | continuation | indecision
const PATTERNS = [
  { id: 'hammer', name: 'Hammer', bars: 1, kind: 'bullish', type: 'reversal', trend: 'down' },
  { id: 'inverted_hammer', name: 'Inverted hammer', bars: 1, kind: 'bullish', type: 'reversal', trend: 'down' },
  { id: 'hanging_man', name: 'Hanging man', bars: 1, kind: 'bearish', type: 'reversal', trend: 'up' },
  { id: 'shooting_star', name: 'Shooting star', bars: 1, kind: 'bearish', type: 'reversal', trend: 'up' },
  { id: 'doji', name: 'Doji', bars: 1, kind: 'neutral', type: 'indecision', trend: null },
  { id: 'dragonfly_doji', name: 'Dragonfly doji', bars: 1, kind: 'bullish', type: 'reversal', trend: 'down' },
  { id: 'gravestone_doji', name: 'Gravestone doji', bars: 1, kind: 'bearish', type: 'reversal', trend: 'up' },
  { id: 'spinning_top', name: 'Spinning top', bars: 1, kind: 'neutral', type: 'indecision', trend: null },
  { id: 'bullish_marubozu', name: 'Bullish marubozu', bars: 1, kind: 'bullish', type: 'continuation', trend: null },
  { id: 'bearish_marubozu', name: 'Bearish marubozu', bars: 1, kind: 'bearish', type: 'continuation', trend: null },
  { id: 'bullish_engulfing', name: 'Bullish engulfing', bars: 2, kind: 'bullish', type: 'reversal', trend: 'down' },
  { id: 'bearish_engulfing', name: 'Bearish engulfing', bars: 2, kind: 'bearish', type: 'reversal', trend: 'up' },
  { id: 'bullish_harami', name: 'Bullish harami', bars: 2, kind: 'bullish', type: 'reversal', trend: 'down' },
  { id: 'bearish_harami', name: 'Bearish harami', bars: 2, kind: 'bearish', type: 'reversal', trend: 'up' },
  { id: 'piercing_line', name: 'Piercing line', bars: 2, kind: 'bullish', type: 'reversal', trend: 'down' },
  { id: 'dark_cloud_cover', name: 'Dark cloud cover', bars: 2, kind: 'bearish', type: 'reversal', trend: 'up' },
  { id: 'tweezer_bottom', name: 'Tweezer bottom', bars: 2, kind: 'bullish', type: 'reversal', trend: 'down' },
  { id: 'tweezer_top', name: 'Tweezer top', bars: 2, kind: 'bearish', type: 'reversal', trend: 'up' },
  { id: 'morning_star', name: 'Morning star', bars: 3, kind: 'bullish', type: 'reversal', trend: 'down' },
  { id: 'evening_star', name: 'Evening star', bars: 3, kind: 'bearish', type: 'reversal', trend: 'up' },
  { id: 'three_white_soldiers', name: 'Three white soldiers', bars: 3, kind: 'bullish', type: 'continuation', trend: null },
  { id: 'three_black_crows', name: 'Three black crows', bars: 3, kind: 'bearish', type: 'continuation', trend: null },
];

// ---- detection ----
const body = (b) => Math.abs(b.close - b.open);
const range = (b) => b.high - b.low;
const upper = (b) => b.high - Math.max(b.open, b.close);
const lower = (b) => Math.min(b.open, b.close) - b.low;
const green = (b) => b.close > b.open;
const red = (b) => b.close < b.open;
const mid = (b) => (b.open + b.close) / 2;

function avg(bars, i, n, f) {
  let s = 0;
  let k = 0;
  for (let j = Math.max(0, i - n); j < i; j++, k++) s += f(bars[j], j);
  return k ? s / k : 0;
}
function atr(bars, i, n = 14) {
  return avg(bars, i, n, (b, j) => (j ? Math.max(b.high, bars[j - 1].close) - Math.min(b.low, bars[j - 1].close) : range(b)));
}
// Trend into the pattern: the 5 bars before it moved at least 1 ATR (roughly a normal day).
function trendBefore(bars, start) {
  if (start < 20) return null;
  const a = atr(bars, start);
  const chg = bars[start - 1].close - bars[start - 6].close;
  if (!a) return null;
  return chg <= -a ? 'down' : chg >= a ? 'up' : 'flat';
}

// Returns the ids of patterns that complete on bar i.
function detectAt(bars, i) {
  if (i < 25) return [];
  const b = bars[i];
  const p = bars[i - 1];
  const q = bars[i - 2];
  const r = range(b);
  if (!(r > 0)) return [];
  const ab = avg(bars, i, 10, body) || r;
  const ar = avg(bars, i, 10, range) || r;
  const t1 = trendBefore(bars, i);
  const t2 = trendBefore(bars, i - 1);
  const t3 = trendBefore(bars, i - 2);
  const found = [];
  const small = body(b) <= 0.33 * r;
  // one bar
  if (r >= 0.6 * ar) {
    const hammerShape = small && body(b) > 0.02 * r && lower(b) >= 2 * body(b) && upper(b) <= 0.12 * r;
    const invShape = small && body(b) > 0.02 * r && upper(b) >= 2 * body(b) && lower(b) <= 0.12 * r;
    if (hammerShape && t1 === 'down') found.push('hammer');
    if (hammerShape && t1 === 'up') found.push('hanging_man');
    if (invShape && t1 === 'down') found.push('inverted_hammer');
    if (invShape && t1 === 'up') found.push('shooting_star');
    const doji = body(b) <= 0.08 * r;
    if (doji && lower(b) >= 0.65 * r && upper(b) <= 0.1 * r && t1 === 'down') found.push('dragonfly_doji');
    else if (doji && upper(b) >= 0.65 * r && lower(b) <= 0.1 * r && t1 === 'up') found.push('gravestone_doji');
    else if (doji) found.push('doji');
    else if (body(b) <= 0.3 * r && upper(b) >= 0.25 * r && lower(b) >= 0.25 * r) found.push('spinning_top');
  }
  if (body(b) >= 0.92 * r && body(b) >= 1.6 * ab) found.push(green(b) ? 'bullish_marubozu' : 'bearish_marubozu');
  // two bars
  const pLong = body(p) >= ab;
  if (red(p) && green(b) && b.open <= p.close && b.close >= p.open && body(b) > body(p) && t2 === 'down') found.push('bullish_engulfing');
  if (green(p) && red(b) && b.open >= p.close && b.close <= p.open && body(b) > body(p) && t2 === 'up') found.push('bearish_engulfing');
  if (pLong && red(p) && green(b) && b.open > p.close && b.close < p.open && body(b) <= 0.5 * body(p) && t2 === 'down') found.push('bullish_harami');
  if (pLong && green(p) && red(b) && b.open < p.close && b.close > p.open && body(b) <= 0.5 * body(p) && t2 === 'up') found.push('bearish_harami');
  if (pLong && red(p) && green(b) && b.open < p.close && b.close > mid(p) && b.close < p.open && t2 === 'down') found.push('piercing_line');
  if (pLong && green(p) && red(b) && b.open > p.close && b.close < mid(p) && b.close > p.open && t2 === 'up') found.push('dark_cloud_cover');
  const a = atr(bars, i);
  if (red(p) && green(b) && Math.abs(p.low - b.low) <= 0.05 * a && t2 === 'down') found.push('tweezer_bottom');
  if (green(p) && red(b) && Math.abs(p.high - b.high) <= 0.05 * a && t2 === 'up') found.push('tweezer_top');
  // three bars
  const qLong = body(q) >= ab;
  if (qLong && red(q) && body(p) <= 0.35 * body(q) && Math.max(p.open, p.close) <= q.close + 0.1 * body(q) && green(b) && b.close > mid(q) && t3 === 'down') found.push('morning_star');
  if (qLong && green(q) && body(p) <= 0.35 * body(q) && Math.min(p.open, p.close) >= q.close - 0.1 * body(q) && red(b) && b.close < mid(q) && t3 === 'up') found.push('evening_star');
  const soldier = (x, prev) => green(x) && body(x) >= 0.6 * ab && upper(x) <= 0.3 * body(x) && (!prev || (x.close > prev.close && x.open >= prev.open && x.open <= prev.close));
  const crow = (x, prev) => red(x) && body(x) >= 0.6 * ab && lower(x) <= 0.3 * body(x) && (!prev || (x.close < prev.close && x.open <= prev.open && x.open >= prev.close));
  if (soldier(q) && soldier(p, q) && soldier(b, p)) found.push('three_white_soldiers');
  if (crow(q) && crow(p, q) && crow(b, p)) found.push('three_black_crows');
  return found;
}

// ---- dataset ----
// { symbol: bars[] } of daily bars (time in seconds), newest last.
async function loadDataset(symbols = DATA_SYMBOLS) {
  const out = {};
  await mapLimit(symbols, 4, async (s) => {
    try {
      const { bars } = await candles(s, 'D');
      if (bars.length >= 120) out[s] = bars;
    } catch {}
  });
  if (Object.keys(out).length < 10) throw new Error("Couldn't load enough price history. Check your internet connection and try again.");
  return out;
}

// Every completed pattern with what happened HORIZON trading days later.
function scan(dataset) {
  const hits = [];
  let baseUp = 0;
  let baseN = 0;
  let baseSum = 0;
  for (const [symbol, bars] of Object.entries(dataset)) {
    for (let i = 25; i < bars.length - HORIZON; i++) {
      const fwd = (bars[i + HORIZON].close - bars[i].close) / bars[i].close;
      baseN++;
      baseSum += fwd;
      if (fwd > 0) baseUp++;
      for (const id of detectAt(bars, i)) hits.push({ symbol, i, id, fwd });
    }
  }
  const baseline = { n: baseN, upPct: baseN ? (baseUp / baseN) * 100 : null, avg: baseN ? (baseSum / baseN) * 100 : null };
  const stats = {};
  for (const p of PATTERNS) {
    const h = hits.filter((x) => x.id === p.id);
    const up = h.filter((x) => x.fwd > 0).length;
    const sum = h.reduce((s, x) => s + x.fwd, 0);
    const n = h.length;
    // "Worked" = moved the way the pattern traditionally points (up for bullish, down for bearish).
    const worked = p.kind === 'bullish' ? up : p.kind === 'bearish' ? n - up : null;
    stats[p.id] = { n, upPct: n ? (up / n) * 100 : null, avg: n ? (sum / n) * 100 : null, workedPct: n && worked != null ? (worked / n) * 100 : null };
  }
  const first = Math.min(...Object.values(dataset).map((b) => b[0].time));
  const last = Math.max(...Object.values(dataset).map((b) => b.at(-1).time));
  return { hits, stats, baseline, symbols: Object.keys(dataset).length, from: first * 1000, to: last * 1000, horizon: HORIZON };
}

// A chart window around one hit: `before` bars of context, the pattern, and `after` bars
// (hidden from the player until they answer).
function windowFor(dataset, hit, before = 45, after = 10) {
  const bars = dataset[hit.symbol];
  const p = PATTERNS.find((x) => x.id === hit.id);
  const start = Math.max(0, hit.i - p.bars + 1 - before);
  return {
    symbol: hit.symbol, patternId: hit.id,
    bars: bars.slice(start, hit.i + 1), future: bars.slice(hit.i + 1, hit.i + 1 + after),
    patternBars: p.bars, fwd: hit.fwd * 100, date: bars[hit.i].time * 1000,
  };
}

module.exports = { PATTERNS, DATA_SYMBOLS, HORIZON, detectAt, loadDataset, scan, windowFor, atr };
