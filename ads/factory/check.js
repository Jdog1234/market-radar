// Compliance check for one ad spec, against the rules in RULES.md.
//   node ads/factory/check.js specs/name.json        → prints the report, exit code 1 if anything FAILs
// FAIL blocks the ad. REVIEW means a person has to look (the weekly review page lists them).
// This is a rule list, not a lawyer: it catches the known problems, it can't promise there are none.
const fs = require('fs');
const path = require('path');
const { DATA_SYMBOLS } = require('../../engine/patterns.js');

const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'shots', 'manifest.json'), 'utf8'));
const PRICES = ['$19', '$149']; // must match docs/index.html and Gumroad

const strip = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();

// Words in ALL CAPS that are fine (not tickers)
const CAPS_OK = new Set(['XP', 'AI', 'POV', 'OK', 'RSI', 'VWAP', 'ATR', 'FAQ', 'USA', 'US', 'ONE', 'TWO', 'WANT', 'IS', 'NOT', 'I', 'A', 'PRO', 'MR', 'BAKA', 'ME', 'MY', 'NO', 'YES', 'THE', 'AND', 'OR', 'IT', 'SO', 'DO', 'GO', 'WHY', 'HOW', 'WHAT', 'WAIT', 'STOP', 'REAL', 'REALLY', 'NEVER', 'EVER', 'ALL', 'TSUNDERE', 'TRADING', 'SCHOOL', 'CANDLE', 'PUZZLES', 'PATTERN', 'LIBRARY', 'LESSON', 'LESSONS', 'QUIZ', 'NPC', 'IRL', 'FYI', 'LOL', 'OMG', 'TBH', 'NGL', 'FR', 'POV:', 'DIY', 'ABC', 'TV']);
const COMPANIES = /\b(apple|tesla|nvidia|google|alphabet|amazon|microsoft|meta|facebook|netflix|gamestop|amc|palantir|coinbase|robinhood|disney|berkshire|walmart|intel|amd|boeing|nike|starbucks|coca[- ]cola|pepsi|mcdonald'?s)\b/i;
// Real people, franchises and brands we may not use (right of publicity, copyright, false endorsement)
const PEOPLE_IP = /\b(elon|musk|buffett|trump|biden|taylor swift|kardashian|mrbeast|mr\.? beast|drake|beyonc[eé]|cramer|pelosi|saylor|cathie wood|pok[eé]mon|pikachu|naruto|goku|dragon ball|one piece|demon slayer|jujutsu|attack on titan|sailor moon|evangelion|asuka|hatsune|miku|disney|marvel|spider-?man|batman|barbie|squid game|minecraft|fortnite|roblox|mario|sonic|shrek|spongebob|harry potter|star wars|wednesday addams|chill guy)\b/i;

function rules(spec) {
  const out = [];
  const add = (status, id, msg) => out.push({ status, id, msg });

  // Everything a viewer sees or hears, plus the post text
  const pieces = [];
  const h = spec.hook || {};
  pieces.push(['hook', `${h.l1 || ''} ${h.l2 || ''}`]);
  if (spec.chart) pieces.push(['chart label', spec.chart.label || '']);
  for (const p of spec.panels || []) pieces.push(['chip', p.chip]);
  for (const c of spec.captions || []) pieces.push(['caption', c.text]);
  for (const l of spec.lines || []) { pieces.push(['line', l.text]); if (l.say) pieces.push(['spoken', l.say]); }
  const post = spec.post || {};
  pieces.push(['post caption', post.caption || '']);
  pieces.push(['hashtags', (post.hashtags || []).join(' ')]);
  const all = pieces.map(([w, t]) => [w, strip(t)]);
  const hits = (re, text) => (text.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) || []);
  const scan = (id, re, msg, status = 'FAIL', prep = (t) => t) => {
    const found = [];
    for (const [w, t] of all) for (const m of hits(re, prep(t))) found.push(`"${m}" (${w})`);
    if (found.length) add(status, id, `${msg}: ${[...new Set(found)].join(', ')}`);
    else if (status === 'FAIL') add('PASS', id, msg.replace(/^No /, 'No ') + ' — none found');
  };
  // Disclaimers like "no promises of profit" are fine; drop them before looking for profit claims
  const dropNegated = (t) => t.replace(/\b(no|not|never|without|zero)\s+(promises?\s+of\s+|guarantees?\s+of\s+)?(profits?|guarantees?|returns?|financial advice|advice)\b/gi, '');

  scan('R1 earnings', /\b(guarantee[ds]?|risk[- ]?free|no risk|can'?t lose|never lose|sure thing|get rich|rich quick|passive income|financial freedom|quit (your|my) job|make (money|bank|bands|\$\d)|earn \$|\$\d[\d,.]*k?\s*(a|per|\/)\s*(day|week|month)|profits?|profitable|double your|\d+x (your|returns?)|millionaire|beat the market|outperform|win rate|winning trades|returns?\b|gains?\b|easy money|side hustle)/i,
    'No profit, income or results claims (FTC Act §5, TikTok "Get-rich-quick" & "promise or exaggerate results")', 'FAIL', dropNegated);
  scan('R2 personal advice', /\b(your portfolio|tailored|personali[sz]ed|we pick|buy this|sell this|buy now|stock picks?|hot stocks?|next (big|hot) stock|what to buy|which stocks? to buy)\b/i,
    'No personalised advice or picks (Advisers Act publisher exclusion)');
  scan('R3 absolutes', /(#1\b|number one|no\.? ?1\b|best (trading )?app|the best\b|fastest|only app|most accurate|100% (accurate|free))/i,
    'No absolute or superlative claims (TikTok misleading-content policy)');
  scan('R4a companies', COMPANIES, 'No company names (TikTok US bans ads for single securities)');
  scan('R5 banned products', /\b(penny stocks?|binary options?|forex|fx trading|crypto|bitcoin|btc|nft|ico|cfds?|spread betting|precious metals|gold trading|prediction markets?|options trading|0dte|leverage)\b/i,
    'No banned or restricted financial products (TikTok US financial services policy)');
  scan('R7 people & IP', PEOPLE_IP, 'No real people, celebrities, franchises or brands (right of publicity, copyright, false endorsement)');
  scan('R8 youth', /\b(kids?|teens?|teenagers?|high school|middle school|under 18|#teen\w*|school uniform|allowance)\b/i,
    'Nothing aimed at under-18s (TikTok requires 18+ for financial ads)');
  scan('R13 testimonials', /\b(i made|i earned|i won|my gains|my profits?|users? (made|earned)|students? (made|earned)|people (made|earned)|changed my life)\b/i,
    'No results testimonials, even from the cartoon (FTC Endorsement Guides)');
  scan('R6b free/trial', /\b(free trial|trial|free forever|forever free|100% free|totally free|completely free|no cost)\b/i,
    'Free wording must match the real offer: a free plan, no trial (state auto-renewal laws, ROSCA)');
  scan('R12 hashtags', /#(stocktips|getrich\w*|money\w*|passiveincome|financialfreedom|millionaire\w*|daytradingprofits|richlife|wealth\w*|crypto\w*|forex\w*|optionstrading|pennystocks?)\b/i,
    'No hashtags that imply money-making or restricted products');

  // R4b tickers written as $ABC or bare capitals that look like symbols
  const tick = [];
  for (const [w, t] of all) {
    for (const m of hits(/\$[A-Z]{1,5}\b/, t)) tick.push(`"${m}" (${w})`);
    for (const m of hits(/\b[A-Z]{2,5}\b/, t)) if (DATA_SYMBOLS.includes(m) && !CAPS_OK.has(m)) tick.push(`"${m}" (${w})`);
  }
  if (tick.length) add('FAIL', 'R4b tickers', `No stock symbols (TikTok US bans single-securities ads): ${tick.join(', ')}`);
  else add('PASS', 'R4b tickers', 'No stock symbols in the text — none found');
  const otherCaps = [];
  for (const [w, t] of all) for (const m of hits(/\b[A-Z]{2,5}\b/, t)) if (!CAPS_OK.has(m) && !DATA_SYMBOLS.includes(m)) otherCaps.push(`"${m}" (${w})`);
  if (otherCaps.length) add('REVIEW', 'R4c caps', `Words in capitals that could be read as a stock symbol: ${[...new Set(otherCaps)].join(', ')}`);

  // R4d screenshots that reveal a symbol
  const shots = (spec.panels || []).flatMap((p) => p.shots.map((s) => s.img));
  const unknown = shots.filter((s) => !manifest[s]);
  const tickerShots = shots.filter((s) => manifest[s] && manifest[s].ticker);
  if (unknown.length) add('FAIL', 'R4d screenshots', `Screenshots not in shots/manifest.json (unchecked): ${unknown.join(', ')}`);
  else if (tickerShots.length) add('FAIL', 'R4d screenshots', `Screenshots that show a stock symbol: ${tickerShots.join(', ')}`);
  else add('PASS', 'R4d screenshots', `All ${shots.length} screenshots are from the checked list and show no stock symbol`);

  // R6a prices must match the real ones
  const prices = [];
  for (const [w, t] of all) for (const m of hits(/\$\s?\d[\d,.]*/, t)) if (!PRICES.includes(m.replace(/\s/g, ''))) prices.push(`"${m}" (${w})`);
  if (prices.length) add('FAIL', 'R6a prices', `Dollar amounts that aren't the real prices ($19/month, $149/year): ${prices.join(', ')}`);
  else add('PASS', 'R6a prices', 'Every price matches the website ($19/month, $149/year); the end card always states the terms');

  // R15 percentages need their comparison next to them
  const pct = all.filter(([, t]) => /\d\s?%/.test(t)).map(([w, t]) => `"${t}" (${w})`);
  if (pct.length) add('REVIEW', 'R15 stats', `Percentages: make sure each is a real number from the app, shown as past data with its comparison, never as a return: ${pct.join(', ')}`);

  // R10 audio: only her voice, or a sound from TikTok's Commercial Music Library added in TikTok
  const audio = spec.audio || 'voice';
  if (audio === 'voice' || (audio.cml && typeof audio.cml === 'string')) add('PASS', 'R10 audio', audio === 'voice' ? 'Audio is only the character voice (no copyrighted music)' : `Music: "${audio.cml}" from the Commercial Music Library, added inside TikTok`);
  else add('FAIL', 'R10 audio', 'Audio must be the voice only, or a Commercial Music Library sound added inside TikTok');
  if (spec.trend && /sound|song|audio/i.test(spec.trend.type || '') && !(audio.cml)) add('FAIL', 'R14 trend sound', 'This trend is a sound: only use it if it is in the Commercial Music Library');

  // R11 structure: length, readable lines, end card long enough to read the disclaimer
  const d = spec.duration;
  if (!(d >= 9 && d <= 60)) add('FAIL', 'R11 length', `Length ${d}s: keep ads between 9 and 60 seconds`);
  if (!(spec.endAt <= d - 4.5)) add('FAIL', 'R11 end card', `The end card (full disclaimer and price terms) needs at least 4.5s on screen; it gets ${(d - spec.endAt).toFixed(1)}s`);
  else add('PASS', 'R11 end card', `End card with full disclaimer and price terms is on screen for ${(d - spec.endAt).toFixed(1)}s`);
  const lines = spec.lines || [];
  lines.forEach((l, i) => {
    if (l.to <= l.from || l.to > d) add('FAIL', 'R11 timing', `Line ${i + 1} has bad timing (${l.from}–${l.to})`);
    if (i && l.from < lines[i - 1].to - 0.01) add('FAIL', 'R11 timing', `Line ${i + 1} starts before line ${i} ends`);
    const words = strip(l.say || l.text).split(' ').length;
    if (words / (l.to - l.from) > 4.2) add('FAIL', 'R11 timing', `Line ${i + 1} has ${words} words in ${(l.to - l.from).toFixed(1)}s: too fast to read or say`);
    if (strip(l.text).length > 75) add('FAIL', 'R11 timing', `Line ${i + 1} is ${strip(l.text).length} characters; keep speech bubbles under 75`);
    if (!['big', 'side', 'end'].includes(l.pose)) add('FAIL', 'R11 timing', `Line ${i + 1}: pose must be big, side or end`);
  });
  if (lines.length && lines[lines.length - 1].pose !== 'end') add('FAIL', 'R11 end card', 'The last line must use the end pose so the character stays clear of the disclaimer');

  // Fixed by the engine for every ad (can't be removed by a spec)
  add('PASS', 'R9 disclosures', 'Built in: disclaimer on screen the whole time, "Animated character · AI voice" label, end card with full disclaimer and "Pro renews automatically until you cancel"');

  // R7b names and proper nouns a person should glance at
  const allowed = /^(Market|Radar|Pro|Mac|Windows|TikTok|I|It|The|Fine|Okay|Dark|Tweezer|Hammer|Doji|Obviously|Plus|Free|Download|Real|Name|Call|Trading|Hands|POV|D|W|N|Not|What|Wait|At|My|Me|She|He|They|This|That|Hmph|Baka|Some|Every|Lesson|Lessons|Pattern|Patterns|Candle|Candles|Quiz|School|Learn|Learning|Study)$/;
  const proper = new Set();
  for (const [w, t] of all) {
    if (w === 'hashtags') continue;
    for (const m of hits(/(?<![.!?…]\s|^)\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)*/, t)) if (!m.split(' ').every((x) => allowed.test(x))) proper.add(m);
  }
  if (proper.size) add('REVIEW', 'R7b names', `Capitalised names mid-sentence; make sure none is a real person, brand or franchise: ${[...proper].join(', ')}`);

  return out;
}

function report(spec) {
  const r = rules(spec);
  const fails = r.filter((x) => x.status === 'FAIL');
  const reviews = r.filter((x) => x.status === 'REVIEW');
  return { id: spec.id, status: fails.length ? 'FAIL' : reviews.length ? 'REVIEW' : 'PASS', results: r };
}

module.exports = { report };

if (require.main === module) {
  const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const rep = report(spec);
  for (const x of rep.results) console.log(`${x.status.padEnd(6)} ${x.id.padEnd(16)} ${x.msg}`);
  console.log(`\n${rep.id}: ${rep.status}`);
  process.exitCode = rep.status === 'FAIL' ? 1 : 0;
}
