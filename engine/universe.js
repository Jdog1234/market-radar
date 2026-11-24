// The tradable universe (all Nasdaq/NYSE/AMEX listings) and headline → ticker tagging.
const { get, mapLimit } = require('./http');

const SCREENER = 'https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&download=true';

// Common-word company names that would produce false matches.
const NAME_BLACKLIST = new Set(
  ('target block gap ball match visa snap square zoom live sea arm global general american first united federal national ' +
   'energy bank capital the trade best progressive public international pioneer southern western eastern northern ' +
   'stock market nasdaq dow s&p street wall gold silver oil apple hospitality alliance standard summit core equity value ' +
   'peak frontier liberty royal crown pacific atlantic central digital data life health care home trust ' +
   'news fox meta? fortune motorola? coherent ally carrier chart clear exact fair hope mobile open power prime ' +
   'reliance real select smart solid simply total true unity vital zillow?').split(/\s+/).map((w) => w.replace('?', '')).filter(Boolean)
);
// Keep a few big names that collide with the list above but matter a lot.
const ALIASES = {
  Apple: 'AAPL', Nvidia: 'NVDA', NVIDIA: 'NVDA', Google: 'GOOGL', Alphabet: 'GOOGL', Meta: 'META', Facebook: 'META',
  Microsoft: 'MSFT', Amazon: 'AMZN', Tesla: 'TSLA', Netflix: 'NFLX', 'Bank of America': 'BAC', 'Goldman Sachs': 'GS',
  'JPMorgan': 'JPM', 'JP Morgan': 'JPM', 'Morgan Stanley': 'MS', 'Wells Fargo': 'WFC', Citigroup: 'C', Citi: 'C',
  Walmart: 'WMT', Costco: 'COST', 'Home Depot': 'HD', Boeing: 'BA', Intel: 'INTC', AMD: 'AMD', 'Advanced Micro Devices': 'AMD',
  Broadcom: 'AVGO', Oracle: 'ORCL', Salesforce: 'CRM', Adobe: 'ADBE', Palantir: 'PLTR', Coinbase: 'COIN', 'Super Micro': 'SMCI',
  Disney: 'DIS', 'Coca-Cola': 'KO', Pepsi: 'PEP', PepsiCo: 'PEP', McDonald: 'MCD', "McDonald's": 'MCD', Starbucks: 'SBUX',
  Nike: 'NKE', Ford: 'F', 'General Motors': 'GM', GM: 'GM', 'Eli Lilly': 'LLY', Lilly: 'LLY', Pfizer: 'PFE', Moderna: 'MRNA',
  Merck: 'MRK', 'Johnson & Johnson': 'JNJ', UnitedHealth: 'UNH', ExxonMobil: 'XOM', Exxon: 'XOM', Chevron: 'CVX',
  'Berkshire Hathaway': 'BRK.B', Berkshire: 'BRK.B', Uber: 'UBER', Airbnb: 'ABNB', Shopify: 'SHOP', Spotify: 'SPOT',
  'Target Corp': 'TGT', 'Gap Inc': 'GAP', Snapchat: 'SNAP', Visa: 'V', Mastercard: 'MA',
  PayPal: 'PYPL', Qualcomm: 'QCOM', Micron: 'MU', 'Taiwan Semiconductor': 'TSM', TSMC: 'TSM', ASML: 'ASML', Arm: 'ARM',
  'Arm Holdings': 'ARM', Alibaba: 'BABA', Baidu: 'BIDU', 'Novo Nordisk': 'NVO', AstraZeneca: 'AZN', Rivian: 'RIVN',
  Lucid: 'LCID', 'Robinhood': 'HOOD', MicroStrategy: 'MSTR', 'Dell': 'DELL', 'HP Inc': 'HPQ',
  'Hewlett Packard Enterprise': 'HPE', IBM: 'IBM', Cisco: 'CSCO', Caterpillar: 'CAT', 'Lockheed Martin': 'LMT',
  'CrowdStrike': 'CRWD', Snowflake: 'SNOW', 'Walgreens': 'WBA', CVS: 'CVS', 'Dollar General': 'DG', 'Dollar Tree': 'DLTR',
};

const SUFFIX = /\b(common stock|ordinary shares?|class [a-c]( common stock| ordinary shares?)?|american depositary (shares|receipts?)|depositary shares?|ads|adr|inc\.?|incorporated|corp\.?|corporation|co\.?|company|ltd\.?|limited|plc|holdings?|group|n\.v\.|s\.a\.|ag|se|lp|l\.p\.|llc|trust|the|new|\(the\)|units?|warrants?|rights?)\b/gi;

function coreName(name) {
  let n = name.replace(/\(.*?\)/g, ' ').replace(SUFFIX, ' ').replace(/[,.]/g, ' ').replace(/\s+/g, ' ').trim();
  // Drop a trailing "&" or "-" left behind by suffix removal.
  return n.replace(/[&-]\s*$/, '').trim();
}

function num(s) {
  const n = parseFloat(String(s ?? '').replace(/[$,%+]/g, ''));
  return isNaN(n) ? null : n;
}

let universe = null;
let cacheDir = null;
const BACKUP = 'https://github.com/Jdog1234/market-radar/releases/latest/download/universe.json';
const FRESH_MS = 10 * 60e3;

// Where to keep the on-disk copy of the stock list (set by the app at startup).
function setCacheDir(dir) {
  cacheDir = dir;
}
const cacheFile = () => (cacheDir ? require('path').join(cacheDir, 'universe.json') : null);

function readDisk() {
  try {
    return JSON.parse(require('fs').readFileSync(cacheFile(), 'utf8'));
  } catch {
    return null;
  }
}

// The stock list doubles as a live price feed: one request gives the latest price and
// volume for ~7,000 stocks. Sources, in order: Nasdaq → copy in memory → copy on disk →
// copy published with the latest GitHub release.
async function loadUniverse() {
  if (universe && Date.now() - universe.fetchedAt < FRESH_MS) return universe;
  let snap = null;
  try {
    const data = await get(SCREENER, { json: true, timeoutMs: 30000, retries: 1 });
    snap = { at: Date.now(), rows: data.data.rows, live: true };
    if (cacheFile()) require('fs').writeFileSync(cacheFile(), JSON.stringify({ at: snap.at, rows: snap.rows }));
  } catch {
    if (universe) return universe;
    const disk = readDisk();
    if (disk?.rows?.length) snap = { ...disk, live: false };
    else {
      let copy;
      try {
        copy = await get(`${BACKUP}?t=${Date.now()}`, { json: true, timeoutMs: 30000 });
        if (!copy?.rows?.length) throw new Error('empty');
      } catch {
        copy = await rebuildFromCnbc();
      }
      snap = { ...copy, live: false };
      if (cacheFile()) require('fs').writeFileSync(cacheFile(), JSON.stringify(copy));
    }
  }
  universe = build(snap);
  return universe;
}

// Last resort: every US-listed stock from Nasdaq Trader's symbol files, with name, price,
// volume and market cap from CNBC (50 stocks per request). Slow (~1 minute), rarely needed.
async function rebuildFromCnbc() {
  const txt = (u) => get(u, { timeoutMs: 30000, headers: { Accept: 'text/plain,*/*' } });
  const [nas, other] = await Promise.all([
    txt('https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt'),
    txt('https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt'),
  ]);
  const syms = new Set();
  // nasdaqlisted: Symbol|Name|Category|Test|Status|Lot|ETF|NextShares
  for (const l of nas.split('\n').slice(1)) {
    const f = l.split('|');
    if (f.length > 6 && f[3] === 'N' && f[6] === 'N') syms.add(f[0]);
  }
  // otherlisted: Symbol|Name|Exchange|CQS|ETF|Lot|Test|NasdaqSymbol
  for (const l of other.split('\n').slice(1)) {
    const f = l.split('|');
    if (f.length > 6 && f[4] === 'N' && f[6] === 'N') syms.add(f[0]);
  }
  const list = [...syms].filter((x) => /^[A-Z]{1,5}(\.[A-Z])?$/.test(x));
  const batches = [];
  for (let i = 0; i < list.length; i += 50) batches.push(list.slice(i, i + 50));
  const capNum = (v) => {
    const m = String(v || '').match(/([\d.]+)\s*([TBMK])?/);
    return m ? +m[1] * ({ T: 1e12, B: 1e9, M: 1e6, K: 1e3 }[m[2]] || 1) : null;
  };
  const rows = (await mapLimit(batches, 4, async (b) => {
    const d = await get(`https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=${encodeURIComponent(b.join('|'))}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json`, { json: true, timeoutMs: 20000 });
    return (d?.FormattedQuoteResult?.FormattedQuote || []).filter((q) => q.name && q.last).map((q) => ({
      symbol: q.symbol, name: q.name, lastsale: q.last, pctchange: q.change_pct, volume: q.volume,
      marketCap: capNum(q.mktcapView), sector: '', industry: '',
    }));
  })).flat().filter(Boolean);
  if (rows.length < 1000) throw new Error('Could not build the stock list');
  return { at: Date.now(), rows };
}

function build(snap) {
  const bySymbol = new Map();
  for (const r of snap.rows) {
    const symbol = r.symbol.trim().replace('/', '.');
    bySymbol.set(symbol, {
      symbol,
      name: r.name.replace(/\s+(Class [A-C] )?(Common Stock|Ordinary Shares?|Common Shares?|American Depositary Shares?.*|Depositary Shares?.*)$/i, '').trim(),
      short: coreName(r.name),
      price: num(r.lastsale),
      pctChange: num(r.pctchange),
      volume: num(r.volume),
      marketCap: num(r.marketCap),
      sector: r.sector || '',
      industry: r.industry || '',
    });
  }

  // Name index: only reasonably large companies (small caps need an explicit ticker
  // in the headline — too many false positives otherwise).
  const nameIndex = new Map();
  const sorted = [...bySymbol.values()].sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
  for (const s of sorted) {
    if ((s.marketCap || 0) < 2e9) break;
    const nm = s.short;
    if (!nm || nm.length < 4 || NAME_BLACKLIST.has(nm.toLowerCase())) continue;
    if (/^[A-Z]{1,5}$/.test(nm) && nm === s.symbol) continue; // name equals ticker → handled by ticker regex
    if (!nameIndex.has(nm)) nameIndex.set(nm, s.symbol);
  }
  for (const [alias, sym] of Object.entries(ALIASES)) {
    const real = bySymbol.has(sym) ? sym : bySymbol.has(sym.replace('.', '/')) ? sym : null;
    if (real) nameIndex.set(alias, real);
  }
  // Longest names first so "Bank of America" wins over "America".
  const names = [...nameIndex.keys()].sort((a, b) => b.length - a.length);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const chunks = [];
  for (let i = 0; i < names.length; i += 400) {
    chunks.push(new RegExp(`(?<![\\w$])(${names.slice(i, i + 400).map(esc).join('|')})(?:'s|’s)?(?![\\w-])`, 'g'));
  }
  // `live` = prices are from right now (not a cached copy), so they can serve as today's bar.
  return { bySymbol, nameIndex, nameRegexes: chunks, fetchedAt: Date.now(), dataAt: snap.at, live: !!snap.live };
}

const EXPLICIT = [
  /\((?:NASDAQ|NYSE|NYSE American|NYSE Arca|AMEX|OTC|OTCQX|OTCQB|Cboe|TSX|CSE)\s*:\s*([A-Z][A-Z.]{0,5})\)/g,
  /(?:NASDAQ|NYSE|AMEX)\s*:\s*([A-Z][A-Z.]{0,5})\b/g,
  /\$([A-Z]{1,5})\b/g,
  /\(([A-Z]{2,5})\)/g,
];
const TICKER_STOPWORDS = new Set(['CEO', 'CFO', 'FDA', 'SEC', 'USA', 'US', 'EU', 'UK', 'AI', 'IPO', 'ETF', 'GDP', 'CPI', 'EPS', 'FY', 'Q1', 'Q2', 'Q3', 'Q4', 'NYSE', 'ESG', 'EV', 'PT', 'OTC', 'ATM', 'NFP', 'PMI', 'PPI', 'PCE', 'FOMC', 'ECB', 'BOJ', 'BOE', 'USD', 'EUR', 'JPY', 'GBP', 'CNY', 'LLC', 'II', 'III', 'IV', 'ADR', 'ADS', 'REIT', 'M&A', 'DOJ', 'FTC']);

function tagTickers(text, u, { allowNames = true } = {}) {
  const found = new Set();
  for (const re of EXPLICIT) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const sym = m[1];
      if (!TICKER_STOPWORDS.has(sym) && u.bySymbol.has(sym)) found.add(sym);
    }
  }
  if (allowNames) {
    for (const re of u.nameRegexes) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text))) {
        const sym = u.nameIndex.get(m[1]);
        if (sym) found.add(sym);
      }
    }
  }
  return [...found];
}

module.exports = { loadUniverse, setCacheDir, tagTickers, num };
