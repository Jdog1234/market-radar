// Economic calendar (ForexFactory weekly feed) + earnings calendar (Nasdaq).
const { get, mapLimit } = require('./http');

const FF = 'https://nfs.faireconomy.media/ff_calendar_thisweek.json';

// Plain-English meaning of the releases that move markets (see RESEARCH.md §4).
// First match wins, so specific patterns come before general ones.
const EXPLAIN = [
  [/speaks|testifies|testimony/i, 'Central-bank official speaking. Watch for hints about future rate moves; can move the currency sharply.'],
  [/minutes|monetary policy (statement|report)|press conference/i,
    'Central-bank communication. Markets trade the tone: any hint about the next rate move shifts the currency and stocks.'],
  [/fomc|federal funds rate|interest rate|rate decision|cash rate|official bank rate|main refinancing rate|policy rate|overnight rate/i,
    'Central-bank rate decision. A hawkish surprise (higher rates / fewer cuts) lifts the currency and yields and usually hits stocks, especially growth/tech. Dovish = the opposite.'],
  [/core pce|pce price/i, "The Fed's preferred inflation gauge. Hotter than forecast → USD and yields up, stocks down."],
  [/\bcpi\b|consumer price|inflation rate/i, 'Inflation. Hotter than forecast → currency up, yields up, stocks (esp. tech) down. Cooler → the reverse. Often the biggest mover of the month.'],
  [/\bppi\b|producer price/i, 'Wholesale/pipeline inflation. Hot = early warning for CPI; mild CPI-like reaction.'],
  [/non-farm|nonfarm|payrolls|employment change/i, 'Jobs report. Strong jobs → currency up. For stocks it depends on the regime: if inflation is the worry, strong jobs can push stocks down (fewer rate cuts).'],
  [/unemployment (rate|claims)|jobless claims|claimant count/i, 'Labor market. Rising unemployment / claims = economy cooling → currency down, more rate cuts priced in.'],
  [/retail sales/i, 'Consumer spending. Strong → currency up, good for consumer/retail stocks; very strong can raise inflation fears.'],
  [/\bgdp\b/i, 'Economic growth. Beat → currency up and generally risk-on; a big miss raises recession fears.'],
  [/pmi|ism/i, 'Business survey. Above 50 = expansion, below 50 = contraction. Surprise moves the currency and cyclical stocks.'],
  [/jolts|job openings/i, 'Labor demand. Falling openings = cooling labor market → softer currency, more rate cuts priced in.'],
  [/consumer (confidence|sentiment)/i, 'Consumer mood; the inflation-expectations sub-index can move rate expectations.'],
  [/housing|home sales|building permits|housing starts/i, 'Housing activity. Rate-sensitive sector; usually a modest market mover.'],
  [/durable goods/i, 'Big-ticket orders — a read on business investment. Moderate mover.'],
  [/trade balance/i, 'Exports minus imports. Usually a small mover for the currency.'],
  [/crude oil inventories|natural gas storage/i, 'Energy inventories. Moves oil/gas prices and energy stocks; little effect elsewhere.'],
  [/bank holiday/i, 'Market holiday — thin liquidity, some markets closed.'],
];

function explain(title) {
  for (const [re, txt] of EXPLAIN) if (re.test(title)) return txt;
  return '';
}

// The feed allows only a couple of requests per 5 minutes per IP, so keep a disk
// copy, refresh it at most every 30 minutes, and fall back to it on errors.
async function economicCalendar(cacheFile) {
  const fs = require('fs');
  let cached = null;
  try {
    cached = cacheFile ? JSON.parse(fs.readFileSync(cacheFile, 'utf8')) : null;
  } catch {}
  let rows;
  if (cached && Date.now() - cached.at < 30 * 60e3) rows = cached.rows;
  else {
    try {
      rows = await get(FF, { json: true, timeoutMs: 15000, retries: 0 });
      if (cacheFile) fs.writeFileSync(cacheFile, JSON.stringify({ at: Date.now(), rows }));
    } catch (e) {
      if (!cached) throw e;
      rows = cached.rows;
    }
  }
  return rows.map((r) => ({
    title: r.title,
    country: r.country,
    impact: r.impact, // High | Medium | Low | Holiday
    time: new Date(r.date).getTime(),
    forecast: r.forecast || '',
    previous: r.previous || '',
    actual: r.actual || '',
    explain: explain(r.title),
  }));
}

async function earningsCalendar(days = 7) {
  const dates = [];
  const d = new Date();
  while (dates.length < days) {
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) dates.push(d.toISOString().slice(0, 10));
    d.setDate(d.getDate() + 1);
  }
  const res = await mapLimit(dates, 3, async (date) => {
    const data = await get(`https://api.nasdaq.com/api/calendar/earnings?date=${date}`, { json: true, ttlMs: 3 * 3600e3 });
    return (data?.data?.rows || []).map((r) => ({
      date,
      symbol: r.symbol,
      name: r.name,
      time: r.time === 'time-pre-market' ? 'Before open' : r.time === 'time-after-hours' ? 'After close' : 'TBD',
      marketCap: r.marketCap,
      epsForecast: r.epsForecast,
      lastYearEPS: r.lastYearEPS,
      numEstimates: r.noOfEsts,
    }));
  });
  return res.flat().filter(Boolean);
}

module.exports = { economicCalendar, earningsCalendar };
