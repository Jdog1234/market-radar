// "Before the move" opportunities and concrete trade ideas. Rules and their evidence
// are in RESEARCH.md §9.
const { mapLimit } = require('./http');
const { history, technicals, moveSince } = require('./prices');
const ev = require('./evidence');

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
// Milliseconds to add to a local-time "MM/DD/YYYY 16:00" to get 16:00 New York time.
const etOffsetMs = () => {
  const now = new Date();
  return now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' })).getTime();
};
const DAY = 864e5;

// How long each kind of news tends to keep moving a stock (sets the trade's time frame).
const HORIZON = {
  beat: '2–4 weeks', miss: '2–4 weeks', raise: '2–4 weeks', cut: '2–4 weeks',
  upgrade: '1–3 weeks', downgrade: '1–4 weeks', initiate: '1–2 weeks', pt_up: '1–2 weeks', pt_down: '1–2 weeks',
  fda_ok: '3–10 days', fda_no: '3–10 days', trial_ok: '3–10 days', trial_fail: '3–10 days',
  offering: '1–2 weeks', short_report: '1–3 weeks', accounting: '2–6 weeks', distress: '2–6 weeks',
  insider_buy: '4–8 weeks', buyback: '4–8 weeks', index_add: '1–2 weeks', move_up: '1–3 days', move_down: '1–3 days',
  earnings_setup: 'Hold through the report (1–5 days)',
};

// Earliest non-opinion headline whose catalysts point the same way as the stock's news.
function newsStart(c, dir) {
  return c.firstAt?.[dir > 0 ? 'up' : 'down'] ?? null;
}

function beforeTheMove(candidates, regime) {
  const tide = regime?.indices?.length ? regime.indices.reduce((s, i) => s + (i.state === 'Uptrend' ? 1 : i.state === 'Downtrend' ? -1 : 0), 0) : 0;
  const out = [];
  for (const c of candidates) {
    const t = c.tech;
    if (!t?.atrPct || !c._bars || Math.abs(c.newsScore) < 2.5) continue;
    if (c.reasons[0]?.id === 'acquired') continue; // takeover targets are pinned to the deal price
    const dir = Math.sign(c.newsScore);
    const since = newsStart(c, dir);
    if (!since) continue;
    const move = moveSince(c._bars, since);
    if (move == null) continue;
    const reacted = (move * dir) / t.atrPct; // in "normal days", positive = moved with the news
    // Already priced in (moved > 1 normal day with the news), or the market disagrees
    // (moved more than half a normal day against it — price reactions carry information too).
    if (reacted > 1 || reacted < -0.5) continue;
    if (c.flags.some((f) => /Extended|bounce risk/.test(f.text))) continue;
    // News that came out after the last close hasn't been traded in regular hours yet.
    const lastBar = c._bars.at(-1);
    const lastClose = new Date(`${lastBar.date} 16:00`).getTime() + etOffsetMs();
    const untraded = !lastBar.live && since > lastClose;
    const quality = Math.abs(c.newsScore) * (1 - Math.max(0, reacted) * 0.5) * (c.independentSources >= 2 ? 1 : 0.75) * (Math.sign(tide) === dir ? 1.15 : 1);
    // Name the catalyst that points this way (a stock can have mixed news).
    const lead = c.reasons.find((r) => Math.sign(r.value) === dir && !/^move_/.test(r.id)) || c.reasons[0];
    const reasons = [...c.reasons].sort((a, b) => (Math.sign(b.value) === dir) - (Math.sign(a.value) === dir));
    out.push({
      symbol: c.symbol, name: c.name, dir: dir > 0 ? 'up' : 'down', quality, newsScore: c.newsScore, composite: c.composite,
      confidence: c.confidence, reasons, lead, headlines: c.headlines.slice(0, 3), tech: c.tech, flags: c.flags,
      newsAt: since, moveSinceNews: move, reactedATR: reacted, marketCap: c.marketCap, untraded,
      why: untraded
        ? `${lead?.label || 'News'} ${ago(since)}, after the last close, so the market hasn't traded on it yet. Watch the opening gap.`
        : reacted <= 0.1
        ? `${lead?.label || 'News'} ${ago(since)}, and the price hasn't reacted yet (${fmtPct(move)} since).`
        : `${lead?.label || 'News'} ${ago(since)}, but the stock has moved only ${fmtPct(move)} since, less than one normal day's move (${fmtPct(t.atrPct * dir)}).`,
    });
  }
  out.sort((a, b) => b.quality - a.quality);
  return { up: out.filter((x) => x.dir === 'up').slice(0, 15), down: out.filter((x) => x.dir === 'down').slice(0, 15) };
}

// Scheduled catalysts: companies about to report, scored on their earnings-surprise
// streak and trend (streaks persist — Loh & Warachka 2012).
async function earningsSetups(earnings, include, now) {
  const soon = earnings
    .filter((e) => {
      const d = new Date(e.date + 'T12:00:00').getTime() - now;
      return d > 0.5 * DAY && d < 8 * DAY;
    })
    .map((e) => ({ ...e, cap: Number(String(e.marketCap || '').replace(/[$,]/g, '')) || 0 }))
    .filter((e) => e.cap >= 2e9)
    .sort((a, b) => b.cap - a.cap);
  const uniq = [...new Map(soon.map((e) => [e.symbol, e])).values()].slice(0, 40);
  const rows = await mapLimit(uniq, 5, async (e) => {
    const [hist, bars] = await Promise.all([ev.earningsHistory(e.symbol).catch(() => null), history(e.symbol).catch(() => null)]);
    const t = technicals(bars);
    if (!hist || !t || hist.of < 4) return null;
    // Median, not mean: a near-zero EPS estimate can produce a −700% "surprise".
    const sorted = hist.quarters.map((q) => q.surprise || 0).sort((a, b) => a - b);
    const avgSurprise = (sorted[1] + sorted[2]) / 2;
    let dir = 0;
    if (hist.beats === 4 && avgSurprise >= 3 && t.score > 0) dir = 1;
    if (hist.beats <= 1 && avgSurprise < 0 && t.score < 0) dir = -1;
    if (!dir) return null;
    const quality = clamp(Math.abs(avgSurprise) / 2, 1, 5) + Math.abs(t.score) / 3;
    return {
      symbol: e.symbol, name: e.name, dir: dir > 0 ? 'up' : 'down', quality, tech: t, marketCap: e.cap,
      reportDate: e.date, reportTime: e.time, beats: hist.beats, of: hist.of, avgSurprise,
      why: dir > 0
        ? `Reports ${fmtDate(e.date)} (${e.time}). Beat estimates 4 quarters running (typical surprise ${fmtPct(avgSurprise)}) and is in an uptrend.`
        : `Reports ${fmtDate(e.date)} (${e.time}). Missed in ${hist.of - hist.beats} of the last ${hist.of} quarters${Math.abs(avgSurprise) <= 100 ? ` (typical surprise ${fmtPct(avgSurprise)})` : ''} and is in a downtrend.`,
    };
  });
  const ok = rows.filter(Boolean).filter((r) => include(r.symbol, { marketCap: r.marketCap, price: r.tech.last }));
  ok.sort((a, b) => b.quality - a.quality);
  return { up: ok.filter((x) => x.dir === 'up').slice(0, 10), down: ok.filter((x) => x.dir === 'down').slice(0, 10) };
}

// Turn an opportunity into a concrete plan: entry, stop (1.5× ATR), target (2R), time frame.
function plan(o, type) {
  const t = o.tech;
  if (!t?.atr || !t.last || t.last < 5) return null;
  const dir = o.dir === 'up' ? 1 : -1;
  const entry = t.last;
  const risk = 1.5 * t.atr;
  // A stop more than 12% away means the stock is too wild for a planned trade.
  if (risk / entry > 0.12) return null;
  const flags = [...(o.flags || [])];
  if (risk / entry > 0.07) flags.push({ kind: 'warn', text: `Volatile: the stop is ${((risk / entry) * 100).toFixed(0)}% away, so use a smaller position` });
  const stop = entry - dir * risk;
  const target = entry + dir * 2 * risk;
  const lead = o.lead || o.reasons?.find((r) => Math.sign(r.value) === dir) || o.reasons?.[0];
  const catalyst = type === 'earnings' ? 'earnings_setup' : lead?.id;
  return {
    symbol: o.symbol, name: o.name, side: dir > 0 ? 'Buy (long)' : 'Short / sell', dir: o.dir, type,
    entry, stop, target, riskPct: (risk / entry) * 100, rewardPct: ((2 * risk) / entry) * 100, rr: 2,
    horizon: HORIZON[catalyst] || '1–2 weeks', catalyst: type === 'earnings' ? 'Earnings streak' : lead?.label || '',
    confidence: o.confidence || 'Medium', quality: o.quality, why: o.why, flags, headlines: o.headlines || [],
    entryNote: o.untraded
      ? `Prices are from the last close and the news hasn't been traded yet. At the open, only ${dir > 0 ? 'buy' : 'short'} if it hasn't already gapped more than ${money(t.atr)} ${dir > 0 ? 'up' : 'down'}, and move the stop and target by the same amount as the open price differs from ${money(entry)}.`
      : dir > 0
      ? `Buy near ${money(entry)}. If it gaps up more than ${money(t.atr)} at the open, don't chase: wait for it to break the first 15-minute high, or skip it.`
      : `Short near ${money(entry)} (needs a margin account), or use it as a signal to sell or avoid if you own it. If it gaps down more than ${money(t.atr)}, don't chase.`,
    exitNote: `Exit at ${money(stop)} if wrong (1.5× its normal daily move of ${money(t.atr)}). Take profit at ${money(target)}, or exit when the time frame runs out.`,
  };
}

async function buildSetups({ candidates, earnings, regime, now, include }) {
  const btm = beforeTheMove(candidates, regime);
  const earn = await earningsSetups(earnings, include, now).catch(() => ({ up: [], down: [] }));

  const ideas = [];
  const seen = new Set();
  const add = (p) => {
    if (!p || seen.has(p.symbol)) return;
    seen.add(p.symbol);
    ideas.push(p);
  };
  // 1) Under-reacted news: the setups research favors most.
  for (const o of [...btm.up, ...btm.down]) add({ ...plan(o, 'news'), rank: o.quality * 1.2 });
  // 2) Confirmed signals (news + price agree), not extended, no imminent earnings.
  for (const c of candidates) {
    if (!c.tech || c.confidence === 'Low' || !c.agree || c.reasons[0]?.id === 'acquired') continue;
    if (c.flags.some((f) => /Extended|bounce risk|Earnings (today|in [0-3] day)/.test(f.text))) continue;
    if (Math.abs(c.composite) < 4) continue;
    const d = Math.sign(c.composite);
    const lead = c.reasons.find((r) => Math.sign(r.value) === d && !/^move_/.test(r.id)) || c.reasons[0];
    const o = { ...c, lead, dir: d > 0 ? 'up' : 'down', quality: Math.abs(c.composite), why: `${lead?.label} with the price trend confirming (score ${c.composite > 0 ? '+' : ''}${c.composite.toFixed(1)}).` };
    add({ ...plan(o, 'momentum'), rank: Math.abs(c.composite) });
  }
  // 3) Earnings plays: higher risk, so ranked lower.
  for (const o of [...earn.up, ...earn.down]) add({ ...plan(o, 'earnings'), rank: o.quality * 0.7 });

  const trades = ideas.filter((x) => x.symbol && x.entry).sort((a, b) => b.rank - a.rank).slice(0, 20);
  return { beforeMove: btm, earningsSetups: earn, trades };
}

function ago(t) {
  const h = (Date.now() - t) / 3600e3;
  return h < 1 ? 'in the last hour' : h < 24 ? `${Math.round(h)}h ago` : `${Math.round(h / 24)}d ago`;
}
const fmtPct = (x) => `${x > 0 ? '+' : ''}${x.toFixed(1)}%`;
const money = (x) => `$${x >= 100 ? x.toFixed(2) : x.toFixed(2)}`;
const fmtDate = (d) => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

module.exports = { buildSetups };
