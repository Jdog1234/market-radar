// Live quotes and chart candles for paper trading (CNBC's public quote and chart APIs).
const { get } = require('./http');
const { num } = require('./universe');
const { config } = require('./config');
const polygon = require('./polygon');

const QUOTE = (syms) => `https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${encodeURIComponent(syms.join('|'))}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json`;

// Live quotes for up to ~50 symbols per request. Includes pre/after-market prices.
async function quotes(symbols) {
  const list = [...new Set(symbols.filter(Boolean))];
  if (polygon.enabled()) {
    try {
      const q = await polygon.snapshot(list);
      if (Object.keys(q).length) return q;
    } catch {}
  }
  if (config.licensedOnly) return {};
  const out = {};
  for (let i = 0; i < list.length; i += 50) {
    const d = await get(QUOTE(list.slice(i, i + 50)), { json: true, timeoutMs: 8000 });
    for (const q of d?.FormattedQuoteResult?.FormattedQuote || []) {
      if (!num(q.last)) continue;
      const ext = q.ExtendedMktQuote;
      out[q.symbol] = {
        symbol: q.symbol, name: q.name, last: num(q.last), change: num(q.change), changePct: num(q.change_pct),
        prevClose: num(q.previous_day_closing), volume: num(q.volume), status: q.curmktstatus,
        ext: ext && num(ext.last) ? { type: ext.type, last: num(ext.last), changePct: num(ext.change_pct), time: ext.last_time } : null,
        at: Date.now(),
      };
    }
  }
  return out;
}

// Chart timeframes → CNBC range, plus how many source bars make one candle.
const TF = {
  '1m': { range: '1D', group: 1 },
  '5m': { range: '5D', group: 1 },
  '15m': { range: '5D', group: 3 },
  '1h': { range: '5D', group: 12 },
  D: { range: '1Y', group: 1 },
  W: { range: '5Y', group: 1 },
};

// Candle times are New York clock times written as if they were UTC, so the chart's
// time axis reads in market time wherever the user is.
function etAsUtc(tradeTime) {
  const t = String(tradeTime);
  return Date.UTC(+t.slice(0, 4), +t.slice(4, 6) - 1, +t.slice(6, 8), +t.slice(8, 10) || 0, +t.slice(10, 12) || 0) / 1000;
}

// Epoch ms → New York clock written as UTC seconds.
function msToEtAsUtc(ms) {
  const d = new Date(new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()) / 1000;
}

async function candles(symbol, tf = '5m') {
  if (polygon.enabled()) {
    try {
      const bars = await polygon.candles(symbol, tf, msToEtAsUtc);
      return { symbol, tf, intraday: !['D', 'W'].includes(tf), bars: bars.filter((b, i) => i === 0 || b.time > bars[i - 1].time) };
    } catch (e) {
      if (config.licensedOnly) throw e;
    }
  }
  const cfg = TF[tf] || TF['5m'];
  const intraday = cfg.range === '1D' || cfg.range === '5D';
  const d = await get(`https://ts-api.cnbc.com/harmony/app/charts/${cfg.range}.json?symbol=${encodeURIComponent(symbol)}`, {
    json: true, ttlMs: intraday ? 20e3 : 30 * 60e3, timeoutMs: 15000,
  });
  let bars = (d?.barData?.priceBars || [])
    .map((b) => ({ time: etAsUtc(b.tradeTime), open: num(b.open), high: num(b.high), low: num(b.low), close: num(b.close), volume: num(b.volume) || 0 }))
    .filter((b) => b.close != null && b.open != null)
    .sort((a, b) => a.time - b.time);
  // Remove duplicate timestamps (the chart requires strictly increasing times).
  bars = bars.filter((b, i) => i === 0 || b.time > bars[i - 1].time);
  if (cfg.group > 1) {
    const span = cfg.group * 300; // 5-minute source bars
    const merged = [];
    for (const b of bars) {
      const t = b.time - (b.time % span);
      const m = merged.at(-1);
      if (m && m.time === t) {
        m.high = Math.max(m.high, b.high);
        m.low = Math.min(m.low, b.low);
        m.close = b.close;
        m.volume += b.volume;
      } else merged.push({ ...b, time: t });
    }
    bars = merged;
  }
  return { symbol, tf, intraday, bars };
}

module.exports = { quotes, candles, etAsUtc };
