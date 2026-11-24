// Catalyst rules. Each rule: direction-signed weight, news half-life (hours), and
// headline patterns. Weights come from the evidence summarized in RESEARCH.md.
const EST = String.raw`(estimates?|expectations|consensus|forecasts?|views?|street|projections?)`;
const OUTLOOK = String.raw`(guidance|outlook|forecast|full-year|fy\d*|annual (sales|revenue|profit|eps))`;

const RULES = [
  // ---------- bullish ----------
  { id: 'beat', label: 'Earnings beat', weight: 3, hl: 72,
    re: [new RegExp(String.raw`\b(beats?|beat|tops?|topped|exceeds?|exceeded|surpass(es|ed)?|crush(es|ed)?)\b.{0,60}\b${EST}`, 'i'),
         /\b(earnings|eps|revenue|profit) (beat|tops)\b/i, /\bbetter[- ]than[- ]expected\b/i] },
  { id: 'raise', label: 'Guidance raised', weight: 3.5, hl: 96,
    re: [new RegExp(String.raw`\b(raises?|raised|lifts?|lifted|boosts?|boosted|hikes?|hiked|ups|increases?|increased)\b.{0,40}\b${OUTLOOK}`, 'i'),
         new RegExp(String.raw`\b(strong|upbeat|bullish|rosy|solid)\b.{0,20}\b${OUTLOOK}`, 'i')] },
  { id: 'upgrade', label: 'Analyst upgrade', weight: 2.5, hl: 96,
    re: [/\bupgrade[sd]?\b/i, /\b(raised|raises) to (buy|outperform|overweight|strong buy)\b/i] },
  { id: 'initiate', label: 'Initiated at Buy', weight: 1.5, hl: 72,
    re: [/\binitiat\w*\b.{0,50}\b(buy|outperform|overweight)\b/i] },
  { id: 'pt_up', label: 'Price target raised', weight: 1.2, hl: 48,
    re: [/\b(price target|pt|target)\b.{0,20}\b(raised|lifted|boosted|hiked|increased)\b/i,
         /\b(raises?|lifts?|boosts?|hikes?)\b.{0,30}\b(price target|pt)\b/i] },
  { id: 'fda_ok', label: 'FDA approval', weight: 4, hl: 72,
    re: [/\bFDA\b.{0,60}\b(approv\w*|clear(s|ed|ance)|grants?|granted|accepts?)\b/i, /\bapprov\w*\b.{0,40}\bFDA\b/i,
         /\b(breakthrough therapy|fast track|priority review) designation\b/i] },
  { id: 'trial_ok', label: 'Positive trial data', weight: 3.5, hl: 72,
    re: [/\b(positive|successful|met|meets|achiev\w*|hits?)\b.{0,40}\b(primary endpoint|topline|phase (1|2|3|i|ii|iii)|trial|study)\b/i] },
  { id: 'acquired', label: 'Takeover target', weight: 4, hl: 96,
    re: [/\b(to be acquired|agrees? to be (bought|acquired|purchased)|takeover (bid|offer|approach|interest)|buyout (offer|bid|talks)|go(es|ing)? private|explor\w* (a )?sale)\b/i,
         /\bin talks to (be )?(acquire|buy)\b/i, /\bbid for\b/i] },
  { id: 'buyback', label: 'Buyback', weight: 1.5, hl: 120, re: [/\b(buyback|share repurchase|stock repurchase|repurchase (program|plan|authoriz))/i] },
  { id: 'div_up', label: 'Dividend raised', weight: 1.5, hl: 120,
    re: [/\b(raises?|increases?|hikes?|boosts?)\b.{0,30}\bdividend\b/i, /\bdividend (increase|hike|raise)\b/i, /\bspecial dividend\b/i] },
  { id: 'contract', label: 'Contract / deal win', weight: 1.5, hl: 72,
    re: [/\b(wins?|won|awarded|secures?|secured|lands?|landed|signs?)\b.{0,50}\b(contract|order|deal|agreement)\b/i, /\b(strategic )?partnership with\b/i] },
  { id: 'insider_buy', label: 'Insider buying', weight: 2, hl: 120,
    re: [/\binsiders? (buy|buys|bought|purchas\w*|scoop\w*)\b/i, /\b(ceo|cfo|director|chairman|chair)\b.{0,30}\b(buys|bought|purchases|purchased|adds)\b.{0,30}\bshares\b/i] },
  { id: 'index_add', label: 'Index inclusion', weight: 2.5, hl: 96,
    re: [/\b(added to|join\w*|inclusion in|set to join|enter\w*)\b.{0,15}\b(the )?(s&p 500|s&p500|nasdaq[- ]100|dow jones industrial)/i] },
  { id: 'record', label: 'Record results', weight: 1.5, hl: 72, re: [/\brecord (revenue|sales|quarter|profit|earnings|deliveries|bookings)\b/i] },
  { id: 'activist', label: 'Activist stake', weight: 1.5, hl: 96, re: [/\bactivist\b/i, /\btakes? (a )?(new )?stake in\b/i] },
  { id: 'exec_return', label: 'Leadership restored', weight: 2.5, hl: 96,
    re: [/\b(reinstat\w*|returns? as|rehir\w*|brings? back)\b.{0,30}\b(ceo|chief executive|founder)\b/i, /\b(ceo|founder)\b.{0,30}\b(reinstated|returns)\b/i] },
  { id: 'move_up', label: 'Price surging', weight: 1, hl: 24, momentum: true,
    re: [/\b(soars?|soared|surges?|surged|jumps?|jumped|rall(y|ies|ied)|skyrockets?|rockets?|spikes?|spiked|zooms?|leaps?|pops?|climbs?|rises|gains|rebounds?)\b/i] },

  // ---------- bearish ----------
  { id: 'miss', label: 'Earnings miss', weight: -3, hl: 72,
    re: [new RegExp(String.raw`\b(miss(es|ed)?|falls? short of|fell short of|lags?|trails?|below)\b.{0,50}\b${EST}`, 'i'),
         /\b(earnings|eps|revenue|profit) miss\b/i, /\bworse[- ]than[- ]expected\b/i] },
  { id: 'cut', label: 'Guidance cut', weight: -3.5, hl: 96,
    re: [new RegExp(String.raw`\b(cuts?|lowers?|lowered|slash(es|ed)?|reduces?|reduced|trims?|trimmed|withdraws?|withdrew|suspends?|pulls?|pulled)\b.{0,40}\b${OUTLOOK}`, 'i'),
         new RegExp(String.raw`\b(weak|disappointing|soft|dismal|gloomy|tepid|cautious|bleak)\b.{0,20}\b${OUTLOOK}`, 'i'),
         /\bprofit warning\b/i, /\bwarns? (of|on)\b/i] },
  { id: 'downgrade', label: 'Analyst downgrade', weight: -2.5, hl: 144,
    re: [/\bdowngrade[sd]?\b/i, /\b(cut|cuts|lowered|lowers) to (sell|underperform|underweight|neutral|hold)\b/i] },
  { id: 'pt_down', label: 'Price target cut', weight: -1.2, hl: 48,
    re: [/\b(price target|pt|target)\b.{0,20}\b(cut|lowered|reduced|slashed|trimmed)\b/i,
         /\b(cuts?|lowers?|slashes?|trims?|reduces?)\b.{0,30}\b(price target|pt)\b/i] },
  { id: 'fda_no', label: 'FDA rejection', weight: -4, hl: 72,
    re: [/\bFDA\b.{0,60}\b(rejects?|rejected|rejection|declines?|refus\w*|delays?|clinical hold)\b/i, /\bcomplete response letter\b/i, /\bCRL\b/] },
  { id: 'trial_fail', label: 'Trial failure', weight: -4, hl: 72,
    re: [/\b(fail\w*|miss(es|ed)?|did not meet|does not meet|halt\w*|discontinu\w*)\b.{0,40}\b(primary endpoint|endpoint|trial|study)\b/i] },
  { id: 'offering', label: 'Share offering / dilution', weight: -2.5, hl: 96,
    re: [/\b(public offering|stock offering|share offering|secondary offering|equity offering|registered direct|at-the-market|atm (program|offering)|shelf registration|dilut\w*)\b/i,
         /\bpric(es|ed|ing)\b.{0,40}\boffering\b/i] },
  { id: 'probe', label: 'Regulatory probe', weight: -2.5, hl: 120,
    re: [/\b(sec|doj|ftc|justice department|cfpb|fbi|regulators?)\b.{0,40}\b(probe|investigat\w*|subpoena\w*|charg\w*|sues?|sued|raid\w*)\b/i,
         /\b(probe|investigation) (into|of)\b/i, /\bantitrust\b/i] },
  { id: 'short_report', label: 'Short-seller report', weight: -3.5, hl: 120,
    re: [/\bshort[- ]?seller'?s?\b.{0,30}\b(report|alleg\w*|says|accuses?|targets?|bets? against|takes aim|attack\w*|claims?)\b/i, /\bshort[- ]?seller report\b/i, /\bshort report\b/i, /\b(hindenburg|muddy waters|citron|spruce point|grizzly research|culper|fuzzy panda|wolfpack|kerrisdale|j capital|blue orca|iceberg research)\b/i] },
  { id: 'accounting', label: 'Accounting red flag', weight: -4, hl: 144,
    re: [/\brestat\w*\b/i, /\baccounting (irregularit\w*|issues?|problems?|errors?|probe)\b/i, /\bauditor (resign\w*|quits?)\b/i,
         /\bmaterial weakness\b/i, /\b(delays?|late) (10-k|10-q|annual report|filing)\b/i] },
  { id: 'distress', label: 'Bankruptcy / distress', weight: -4.5, hl: 168,
    re: [/\bbankrupt\w*\b/i, /\bchapter 11\b/i, /\bgoing concern\b/i, /\b(defaults? on|missed (a )?(debt|interest) payment)\b/i] },
  { id: 'delist', label: 'Delisting risk', weight: -3, hl: 168,
    re: [/\bdelist\w*\b/i, /\b(nasdaq|nyse)\b.{0,30}\b(notice|deficiency|non-?compliance)\b/i, /\breverse (stock )?split\b/i] },
  { id: 'div_cut', label: 'Dividend cut', weight: -3, hl: 120,
    re: [/\b(cuts?|suspends?|slash(es|ed)?|eliminates?|halts?|reduces?)\b.{0,30}\bdividend\b/i] },
  { id: 'exec_exit', label: 'Executive departure', weight: -2, hl: 96,
    re: [/\b(ceo|cfo|chief executive|chief financial officer)\b.{0,40}\b(resigns?|resigned|steps? down|stepping down|departs?|ousted|fired|exits?|to leave|leaving)\b/i] },
  { id: 'incident', label: 'Recall / breach / outage', weight: -2, hl: 72,
    re: [/\brecalls?\b/i, /\bdata breach\b/i, /\bcyber ?attack\b/i, /\bhack(ed|ers)?\b/i, /\boutage\b/i] },
  { id: 'layoffs', label: 'Layoffs / restructuring', weight: -1, hl: 72, re: [/\blay ?offs?\b/i, /\bjob cuts\b/i, /\brestructur\w*\b/i, /\bcuts? \d[\d,]* jobs\b/i] },
  { id: 'trade_risk', label: 'Tariff / export curbs', weight: -1, hl: 72, re: [/\bexport (ban|curbs?|restrictions?|controls?)\b/i, /\btariffs?\b/i, /\bsanction\w*\b/i] },
  { id: 'lawsuit', label: 'Lawsuit', weight: -1, hl: 72, re: [/\b(class action|securities fraud|lawsuit|sued|sues)\b/i] },
  { id: 'insider_sell', label: 'Insider selling', weight: -0.5, hl: 72,
    re: [/\binsiders? (sell|sells|sold|dump\w*|unload\w*)\b/i, /\b(ceo|cfo|director|chairman)\b.{0,30}\b(sells|sold|unloads)\b.{0,30}\bshares\b/i] },
  { id: 'move_down', label: 'Price falling', weight: -1, hl: 24, momentum: true,
    re: [/\b(plunges?|plunged|tumbles?|tumbled|sinks?|sank|slides?|slid|plummets?|plummeted|tanks?|tanked|crash(es|ed)?|drops?|dropped|falls|fell|slumps?|slumped|sell-?off|craters?|nosedives?|sheds?)\b/i] },
];

// Law-firm "investor alert" spam: appears after any drop, carries no information.
const LAW_SPAM = /\b(investor alert|shareholder alert|investors? who lost|class action (lawsuit )?(filed|deadline|reminder)|rosen law|pomerantz|levi & korsinsky|bronstein|faruqi|glancy|bragar|kessler topaz|robbins geller|portnoy law|schall law|gross law|kirby mcinerney|frank r\. cruz|howard g\. smith|block & leviton|bernstein liebhard|lead plaintiff deadline)\b/i;

// Opinion/SEO pieces are not news.
const OPINION = /(\?\s*$|\bshould you\b|\bis it time\b|\bstocks? to (buy|sell|watch)\b|\bbuy now\b|\bprediction\b|\bcould (soar|crash|double|triple)\b|\bmillionaire\b|\bmotley fool\b|\bzacks\b|\b\d+ (reasons|stocks)\b|\bbest stocks?\b|\bhere'?s why\b|\bwhat to expect\b|\bwhat you need to know\b)/i;

const STOCK_CTX = /\b(stocks?|shares?|share price|equity|market cap|nasdaq|nyse|premarket|pre-market|after-hours|trading|investors?|-?\d+(\.\d+)?%)/i;

function classify(text) {
  const matched = [];
  for (const r of RULES) {
    if (r.re.some((re) => re.test(text))) matched.push(r);
  }
  // Raise+downgrade-type collisions: keep both (mixed news), but momentum words only
  // count when they agree with — or stand in for — a fundamental catalyst.
  const fundamental = matched.filter((r) => !r.momentum);
  let final = matched;
  if (fundamental.length) {
    const net = fundamental.reduce((s, r) => s + r.weight, 0);
    final = matched.filter((r) => !r.momentum || Math.sign(r.weight) === Math.sign(net));
  }
  // Price-move words ("drops", "jumps") only count when the headline is about the stock,
  // not "Walmart drops TV prices".
  if (!STOCK_CTX.test(text)) final = final.filter((r) => !r.momentum);
  const lawSpam = LAW_SPAM.test(text);
  if (lawSpam) final = final.filter((r) => r.id === 'lawsuit' || r.id === 'probe');
  return { catalysts: final, lawSpam, opinion: OPINION.test(text) };
}

module.exports = { RULES, classify };
