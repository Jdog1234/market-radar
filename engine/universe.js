// The tradable universe (all Nasdaq/NYSE/AMEX listings) and headline → ticker tagging.
const { get } = require('./http');

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

async function loadUniverse() {
  if (universe) return universe;
  const data = await get(SCREENER, { json: true, ttlMs: 12 * 3600e3, timeoutMs: 30000, retries: 2 });
  const bySymbol = new Map();
  for (const r of data.data.rows) {
    const symbol = r.symbol.trim().replace('/', '.');
    bySymbol.set(symbol, {
      symbol,
      name: r.name.replace(/\s+(Class [A-C] )?(Common Stock|Ordinary Shares?|Common Shares?|American Depositary Shares?.*|Depositary Shares?.*)$/i, '').trim(),
      short: coreName(r.name),
      price: num(r.lastsale),
      pctChange: num(r.pctchange),
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
  universe = { bySymbol, nameIndex, nameRegexes: chunks };
  return universe;
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

module.exports = { loadUniverse, tagTickers, num };
