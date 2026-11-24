// Learn: Candle puzzles (game), Pattern library and Trading school.
// Uses helpers from app.js ($, $$, esc, store, LWC, TV, chartColors, candleColors, alpha,
// isPro, proOffer, popMenu, showView). Pattern statistics come from the main process
// (engine/patterns.js), measured on ~2 years of real daily bars for ~100 large US stocks.

// ---- what each pattern looks like and how it's used ----
// tpl: the trend into it ('down' | 'up' | 'flat') and the pattern candles [open, high, low, close].
const PINFO = {
  hammer: {
    tpl: ['down', [[99.4, 100.1, 95.4, 100]]],
    look: 'One candle after a fall: a small body at the top of the range and a long lower shadow at least twice the body, with little or no upper shadow.',
    means: 'Sellers pushed the price well down during the day, but buyers fought back and closed it near the high. It shows selling running out of steam.',
    use: "Wait for confirmation: the next candle closing above the hammer's high. A common stop goes just below the hammer's low. It matters most at a support level or after a long fall.",
  },
  inverted_hammer: {
    tpl: ['down', [[99.6, 104, 99.4, 100.1]]],
    look: 'After a fall: a small body at the bottom of the range and a long upper shadow, with little or no lower shadow.',
    means: 'Buyers tried to push higher and were pushed back, but sellers could not make a new low either. A hint that the fall may be ending.',
    use: 'Needs a strong up candle after it to mean much. Stops usually go below its low.',
  },
  hanging_man: {
    tpl: ['up', [[100.6, 100.8, 96.2, 100.2]]],
    look: 'The same shape as a hammer, but after a rise: small body at the top, long lower shadow.',
    means: 'During an uptrend, sellers were able to drive the price far down during the day. Buyers recovered it, but the selling is a warning sign.',
    use: "Only taken as bearish when the next candle closes below the hanging man's body. Traders holding a long position may tighten their stop.",
  },
  shooting_star: {
    tpl: ['up', [[100.4, 104.8, 100.1, 100.2]]],
    look: 'After a rise: a small body at the bottom of the range and a long upper shadow, with little or no lower shadow.',
    means: 'Buyers pushed to a new high, then sellers took over and drove it back down to near the open. Rejection of higher prices.',
    use: "Confirmed by a lower close the next day. Short sellers put a stop above the star's high; long holders may take profit.",
  },
  doji: {
    tpl: ['flat', [[100, 102, 98, 100.05]]],
    look: 'Open and close are almost the same, so the body is a thin line, with shadows above and below.',
    means: 'Indecision: neither buyers nor sellers won the day. After a strong move it can mean the move is tiring.',
    use: "On its own a doji says little. Traders read it together with the trend and the next candle's direction.",
  },
  dragonfly_doji: {
    tpl: ['down', [[100, 100.1, 95.8, 100]]],
    look: 'A doji with a long lower shadow and no upper shadow, open and close at the high, after a fall.',
    means: 'Sellers drove the price far down, then buyers took it all the way back. A stronger version of the hammer idea.',
    use: 'Look for a higher close the next day. Rare in real data, so treat its statistics with care.',
  },
  gravestone_doji: {
    tpl: ['up', [[100, 104.2, 99.9, 100]]],
    look: 'A doji with a long upper shadow and no lower shadow, open and close at the low, after a rise.',
    means: 'Buyers pushed far up, then sellers drove it all the way back to the open. Rejection of the highs.',
    use: 'Confirmed by a lower close the next day. Very rare, so its numbers below rest on few examples.',
  },
  spinning_top: {
    tpl: ['flat', [[99.6, 101.8, 97.8, 100.2]]],
    look: 'A small body in the middle of the range with upper and lower shadows of similar length.',
    means: 'Both sides were active, but neither took control. Indecision, like a doji with a slightly bigger body.',
    use: 'Mostly a sign to wait. It becomes interesting only at a key level or after a long move.',
  },
  bullish_marubozu: {
    tpl: ['flat', [[97, 103, 97, 103]]],
    look: 'A long green candle with almost no shadows: it opened at the low and closed at the high.',
    means: 'Buyers were in control from the open to the close.',
    use: 'Often read as strength that may continue. Chasing it after a big move is risky, so many traders wait for a pullback.',
  },
  bearish_marubozu: {
    tpl: ['flat', [[103, 103, 97, 97]]],
    look: 'A long red candle with almost no shadows: it opened at the high and closed at the low.',
    means: 'Sellers were in control all day.',
    use: 'Read as weakness that may continue. Long holders often avoid buying until it stabilises.',
  },
  bullish_engulfing: {
    tpl: ['down', [[100.5, 100.8, 99.2, 99.4], [99, 101.6, 98.8, 101.3]]],
    look: "After a fall: a red candle, then a bigger green candle whose body completely covers (engulfs) the red one's body.",
    means: 'Sellers were in charge, then buyers overwhelmed them in a single day.',
    use: "One of the most popular patterns. Traders want it at support, ideally on higher volume, and put stops below the pattern's low.",
  },
  bearish_engulfing: {
    tpl: ['up', [[99.5, 100.8, 99.2, 100.6], [101, 101.2, 98.6, 98.9]]],
    look: "After a rise: a green candle, then a bigger red candle whose body completely covers the green one's body.",
    means: 'Buyers were in charge, then sellers took over decisively.',
    use: "Popular as a sell or take-profit signal near resistance. Stops for shorts go above the pattern's high.",
  },
  bullish_harami: {
    tpl: ['down', [[102.5, 102.8, 97.8, 98], [98.8, 100.2, 98.5, 99.9]]],
    look: "After a fall: a long red candle, then a small green candle that fits inside the red candle's body ('harami' is Japanese for pregnant).",
    means: 'The strong selling paused: the next day traded in a narrow range inside it.',
    use: 'A weak signal on its own. Traders wait for a close above the first candle before acting.',
  },
  bearish_harami: {
    tpl: ['up', [[97.5, 102.2, 97.2, 102], [101.2, 101.5, 99.8, 100.1]]],
    look: "After a rise: a long green candle, then a small red candle inside its body.",
    means: 'The strong buying paused.',
    use: 'Needs a lower close afterwards to count. Often used as a reason to tighten stops rather than to short.',
  },
  piercing_line: {
    tpl: ['down', [[102.5, 102.8, 98.2, 98.5], [97.8, 101.4, 97.5, 101.1]]],
    look: 'After a fall: a long red candle, then a green candle that opens lower but closes above the middle of the red body.',
    means: 'The day opened weak, but buyers recovered more than half of the previous loss.',
    use: 'Similar to bullish engulfing but slightly weaker. Stops go below the second candle.',
  },
  dark_cloud_cover: {
    tpl: ['up', [[97.5, 101.8, 97.2, 101.5], [102.2, 102.5, 98.6, 98.9]]],
    look: 'After a rise: a long green candle, then a red candle that opens higher but closes below the middle of the green body.',
    means: 'The day opened strong, but sellers erased more than half of the previous gain.',
    use: 'A warning near resistance. Stops for shorts go above the second candle.',
  },
  tweezer_bottom: {
    tpl: ['down', [[101.5, 101.8, 97.9, 98.3], [98.4, 101.2, 97.9, 100.9]]],
    look: 'After a fall: two candles with almost the same low, the first red and the second green.',
    means: 'The same price held twice, a sign of buyers defending that level.',
    use: 'Works best when that low is also a known support level. Stops go just below the twin lows.',
  },
  tweezer_top: {
    tpl: ['up', [[98.5, 102.1, 98.2, 101.7], [101.6, 102.1, 98.8, 99.1]]],
    look: 'After a rise: two candles with almost the same high, the first green and the second red.',
    means: 'Buyers failed twice at the same price.',
    use: 'Strongest at a known resistance level. Stops go just above the twin highs.',
  },
  morning_star: {
    tpl: ['down', [[103.5, 103.8, 98.8, 99], [98.4, 98.9, 97.4, 97.9], [98.6, 102.6, 98.4, 102.4]]],
    look: 'Three candles after a fall: a long red candle, a small-bodied candle lower down, then a long green candle closing above the middle of the first.',
    means: 'Selling, then hesitation, then buyers taking over: a three-step turn.',
    use: "Often treated as one of the more reliable reversals in textbooks. Stops go below the middle candle's low.",
  },
  evening_star: {
    tpl: ['up', [[96.5, 101.2, 96.2, 101], [101.6, 102.6, 101.1, 102.1], [101.4, 101.6, 97.4, 97.6]]],
    look: 'Three candles after a rise: a long green candle, a small-bodied candle higher up, then a long red candle closing below the middle of the first.',
    means: 'Buying, then hesitation, then sellers taking over.',
    use: "Treated as a top signal. Stops for shorts go above the middle candle's high.",
  },
  three_white_soldiers: {
    tpl: ['flat', [[96, 98.2, 95.8, 98], [97.6, 100.4, 97.4, 100.2], [99.8, 102.6, 99.6, 102.4]]],
    look: 'Three long green candles in a row, each opening inside the previous body and closing near its high.',
    means: 'Steady, persistent buying over three days.',
    use: 'Read as strength. After a big run it can mean the move is already stretched, so traders often wait for a pullback.',
  },
  three_black_crows: {
    tpl: ['flat', [[104, 104.2, 101.8, 102], [102.4, 102.6, 99.6, 99.8], [100.2, 100.4, 97.4, 97.6]]],
    look: 'Three long red candles in a row, each opening inside the previous body and closing near its low.',
    means: 'Steady, persistent selling over three days.',
    use: 'Read as weakness. After a big fall it can mark exhaustion rather than more downside.',
  },
};

// A small candle drawing for a pattern (context candles faded, pattern candles bright).
function candleSvg(id, cls = '') {
  const [trend, pat] = PINFO[id].tpl;
  const first = pat[0][0];
  const ctx = [];
  let px = trend === 'down' ? first + 8 : trend === 'up' ? first - 8 : first;
  for (let k = 0; k < 6; k++) {
    const step = trend === 'down' ? -1.3 : trend === 'up' ? 1.3 : (k % 2 ? 0.9 : -0.9);
    const o = px;
    const c = px + step + (k % 2 ? 0.3 : -0.3) * (trend === 'flat' ? 0 : 1);
    ctx.push([o, Math.max(o, c) + 0.6, Math.min(o, c) - 0.6, c]);
    px = c;
  }
  const all = [...ctx, ...pat];
  const hi = Math.max(...all.map((b) => b[1]));
  const lo = Math.min(...all.map((b) => b[2]));
  const W = 200;
  const H = 110;
  const pad = 8;
  const y = (v) => pad + ((hi - v) / (hi - lo || 1)) * (H - 2 * pad);
  const step = W / (all.length + 1);
  const bw = step * 0.56;
  let out = `<svg class="${cls}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true">`;
  const px0 = (ctx.length + 0.5) * step;
  out += `<rect x="${px0}" y="2" width="${pat.length * step}" height="${H - 4}" rx="6" fill="var(--accent)" opacity="0.1"/>`;
  all.forEach(([o, h, l, c], k) => {
    const x = (k + 1) * step;
    const col = c >= o ? 'var(--up)' : 'var(--down)';
    const op = k < ctx.length ? 0.45 : 1;
    const top = y(Math.max(o, c));
    const bh = Math.max(1.5, Math.abs(y(o) - y(c)));
    out += `<line x1="${x}" x2="${x}" y1="${y(h)}" y2="${y(l)}" stroke="${col}" stroke-width="1.6" opacity="${op}"/>`;
    out += `<rect x="${x - bw / 2}" y="${top}" width="${bw}" height="${bh}" fill="${col}" opacity="${op}" rx="1"/>`;
  });
  return `${out}</svg>`;
}

const L = { meta: null, loading: null };
async function learnMeta() {
  if (L.meta) return L.meta;
  if (!L.loading) L.loading = radar.learn.stats().then((m) => (L.meta = m)).finally(() => (L.loading = null));
  return L.loading;
}
const pname = (id) => L.meta?.patterns.find((p) => p.id === id)?.name || id;
const pmeta = (id) => L.meta?.patterns.find((p) => p.id === id);
const kindTag = (p) => `<span class="kind ${p.kind}">${p.kind === 'neutral' ? 'Indecision' : `${p.kind === 'bullish' ? 'Bullish' : 'Bearish'} ${p.type}`}</span>`;
const pctTxt = (x, d = 0) => (x == null ? '—' : `${x.toFixed(d)}%`);
const sgnPct = (x, d = 1) => (x == null ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(d)}%`);
const when2 = (ms) => new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

// The honest one-liner for a pattern's real record.
function recordLine(p, st, base) {
  if (!st || !st.n) return 'Not found in the data yet.';
  const few = st.n < 30 ? ' Few examples, so this number can swing a lot.' : '';
  if (p.kind === 'neutral') return `${st.n.toLocaleString()} real examples: the price was higher 5 trading days later ${pctTxt(st.upPct)} of the time, about the same as any day (${pctTxt(base.upPct)}).${few}`;
  const dir = p.kind === 'bullish' ? 'higher' : 'lower';
  const anyDay = p.kind === 'bullish' ? base.upPct : 100 - base.upPct;
  const edge = st.workedPct - anyDay;
  const verdict = Math.abs(edge) < 3 ? 'about the same as a random day' : edge > 0 ? `${edge.toFixed(0)} points better than a random day` : `${(-edge).toFixed(0)} points worse than a random day`;
  return `${st.n.toLocaleString()} real examples: the price was ${dir} 5 trading days later ${pctTxt(st.workedPct)} of the time, ${verdict} (${pctTxt(anyDay)}).${few}`;
}

// ================= Candle puzzles =================
const PZ_LEVELS = [[0, 'Rookie'], [100, 'Chart reader'], [300, 'Pattern spotter'], [700, 'Swing trader'], [1500, 'Market pro'], [3000, 'Legend']];
const pzState = () => store.get('pz.state', { xp: 0, played: 0, nameRight: 0, dirRight: 0, streak: 0, best: 0, byPattern: {} });
const pz = { cur: null, chart: null, series: null, pick: { name: null, dir: null }, done: false };

function levelOf(xp) {
  let i = 0;
  while (i + 1 < PZ_LEVELS.length && xp >= PZ_LEVELS[i + 1][0]) i++;
  const [from, name] = PZ_LEVELS[i];
  const to = PZ_LEVELS[i + 1]?.[0];
  return { name, n: i + 1, pct: to ? ((xp - from) / (to - from)) * 100 : 100, to };
}
function renderPzScore() {
  const s = pzState();
  const lv = levelOf(s.xp);
  const acc = (r) => (s.played ? `${Math.round((r / s.played) * 100)}%` : '—');
  $('#pzScore').innerHTML = `<div class="s pz-level"><span>Level ${lv.n} · ${esc(lv.name)}</span><b>${s.xp.toLocaleString()} XP</b><div class="pz-xp"><i style="width:${lv.pct.toFixed(0)}%"></i></div></div>
    <div class="s"><span>Streak</span><b>${s.streak}${s.streak >= 3 ? ' 🔥' : ''}</b></div>
    <div class="s"><span>Best streak</span><b>${s.best}</b></div>
    <div class="s"><span>Pattern named</span><b>${acc(s.nameRight)}</b></div>
    <div class="s"><span>Direction called</span><b>${acc(s.dirRight)}</b></div>`;
  const rows = Object.entries(s.byPattern).sort((a, b) => b[1].n - a[1].n);
  $('#pzMyStatsBody').innerHTML = rows.length
    ? `<table><tr><th>Pattern</th><th>Played</th><th>Named right</th><th>Direction right</th></tr>${rows.map(([id, r]) => `<tr><td>${esc(pname(id))}</td><td>${r.n}</td><td>${Math.round((r.name / r.n) * 100)}%</td><td>${Math.round((r.dir / r.n) * 100)}%</td></tr>`).join('')}</table>`
    : '<p class="muted small">Play a few puzzles to see which patterns you read best.</p>';
}

function ensurePzChart() {
  if (pz.chart || !LWC) return;
  pz.chart = LWC.createChart($('#pzChart'), { ...chartColors(), autoSize: true, timeScale: { borderColor: TV.line, rightOffset: 3 }, handleScroll: false, handleScale: false });
  pz.series = pz.chart.addCandlestickSeries({ ...candleColors(), priceLineVisible: false, lastValueVisible: false });
}
const pzPoint = (b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close });

async function nextPuzzle() {
  $('#pzSide').innerHTML = '<div class="empty">Finding a real pattern…</div>';
  try {
    await learnMeta();
    const c = await radar.learn.puzzle({ patternId: $('#pzFilter').value || undefined });
    pz.cur = c;
    pz.pick = { name: null, dir: null };
    pz.done = false;
    ensurePzChart();
    pz.chart.applyOptions(chartColors());
    pz.series.applyOptions(candleColors());
    pz.chart.applyOptions({ timeScale: { visible: false } }); // dates would give the answer away
    pz.series.setData(c.bars.map(pzPoint));
    const first = c.bars[c.bars.length - c.patternBars];
    pz.series.setMarkers([{ time: first.time, position: 'aboveBar', color: TV.warn, shape: 'arrowDown', text: c.patternBars > 1 ? `${c.patternBars} candles` : '?' }]);
    pz.chart.timeScale().setVisibleLogicalRange({ from: 0, to: c.bars.length + c.future.length + 2 });
    $('#pzTag').textContent = 'Mystery stock · daily candles';
    renderPzSide();
    renderPzLeft(c.allowance);
  } catch (err) {
    const msg = errText(err);
    $('#pzSide').innerHTML = `<p class="msg-err">${esc(msg)}</p>${/free puzzles/.test(msg) ? '<button class="btn" data-upgrade="month">Get Pro: unlimited puzzles</button>' : '<button class="btn ghost" id="pzNext">Try again</button>'}`;
  }
}
function renderPzLeft(a) {
  $('#pzLeft').textContent = a?.limit ? `Free plan: ${a.left} of ${a.limit} puzzles left today` : '';
}

function renderPzSide() {
  const c = pz.cur;
  const s = pz.pick;
  const opt = (id) => {
    let k = s.name === id ? 'on' : '';
    if (pz.done) k = id === c.patternId ? 'right' : s.name === id ? 'wrong' : '';
    return `<button data-pzname="${id}" class="${k}">${esc(pname(id))}</button>`;
  };
  const up = c.fwd > 0;
  const dirBtn = (d, label) => {
    let k = s.dir === d ? 'on' : '';
    if (pz.done) k = (d === 'up') === up ? 'right' : s.dir === d ? 'wrong' : '';
    return `<button data-pzdir="${d}" class="${k}">${label}</button>`;
  };
  let html = `<h4>1. Which pattern just formed at the arrow?</h4><div class="pz-opts">${c.choices.map(opt).join('')}</div>
    <h4>2. Where was the price ${c.horizon} trading days later?</h4><div class="pz-opts dir">${dirBtn('up', '▲ Higher')}${dirBtn('down', '▼ Lower')}</div>`;
  if (!pz.done) html += `<button class="btn" id="pzCheck" ${s.name && s.dir ? '' : 'disabled'}>Check my answer</button>`;
  else {
    const p = pmeta(c.patternId);
    const nameOk = s.name === c.patternId;
    const dirOk = (s.dir === 'up') === up;
    html += `<div class="pz-result"><div class="big ${up ? 'up' : 'down'}">${sgnPct(c.fwd)} in ${c.horizon} days</div>
      <div class="small">${esc(c.symbol)} · pattern completed ${when2(c.date)}</div>
      <p class="small" style="margin:8px 0 0">${nameOk ? '✅ Pattern named' : `❌ It was a <b>${esc(p.name)}</b>`} · ${dirOk ? '✅ Direction right' : '❌ Direction wrong'} · <b>+${pz.gained} XP</b></p></div>
      <div class="small muted">${p.kind === 'neutral' ? 'A neutral pattern: no textbook direction.' : `Textbook reading: <b>${p.kind}</b>. `}${esc(recordLine(p, c.stat, c.baseline))}</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" id="pzNext">Next puzzle →</button><button class="btn ghost" data-pzstudy="${c.patternId}">Study the ${esc(p.name.toLowerCase())}</button></div>`;
  }
  $('#pzSide').innerHTML = html;
}

function checkPuzzle() {
  const c = pz.cur;
  if (pz.done || !pz.pick.name || !pz.pick.dir) return;
  pz.done = true;
  const nameOk = pz.pick.name === c.patternId;
  const dirOk = (pz.pick.dir === 'up') === c.fwd > 0;
  const s = pzState();
  s.played++;
  if (nameOk) s.nameRight++;
  if (dirOk) s.dirRight++;
  s.streak = nameOk && dirOk ? s.streak + 1 : 0;
  s.best = Math.max(s.best, s.streak);
  pz.gained = (nameOk ? 10 : 0) + (dirOk ? 15 : 0) + (nameOk && dirOk ? Math.min(25, 5 * (s.streak - 1)) : 0);
  s.xp += pz.gained;
  const r = (s.byPattern[c.patternId] = s.byPattern[c.patternId] || { n: 0, name: 0, dir: 0 });
  r.n++;
  r.name += nameOk ? 1 : 0;
  r.dir += dirOk ? 1 : 0;
  store.set('pz.state', s);
  renderPzScore();
  renderPzSide();
  pz.chart.applyOptions({ timeScale: { visible: true } });
  // Play the next days forward, then mark the answer day.
  let k = 0;
  const all = [...c.bars];
  const tick = () => {
    if (k >= c.future.length) {
      const d = c.future[Math.min(c.horizon, c.future.length) - 1];
      const first = c.bars[c.bars.length - c.patternBars];
      pz.series.setMarkers([
        { time: first.time, position: 'aboveBar', color: TV.warn, shape: 'arrowDown', text: pname(c.patternId) },
        ...(d ? [{ time: d.time, position: c.fwd > 0 ? 'aboveBar' : 'belowBar', color: c.fwd > 0 ? TV.up : TV.down, shape: 'circle', text: `Day ${c.horizon}: ${sgnPct(c.fwd)}` }] : []),
      ]);
      $('#pzTag').textContent = `${c.symbol} · daily candles`;
      return;
    }
    all.push(c.future[k++]);
    pz.series.setData(all.map(pzPoint));
    setTimeout(tick, 140);
  };
  tick();
}

$('#view-puzzles').addEventListener('click', (e) => {
  const n = e.target.closest('[data-pzname]');
  const d = e.target.closest('[data-pzdir]');
  if (n && !pz.done) pz.pick.name = n.dataset.pzname;
  if (d && !pz.done) pz.pick.dir = d.dataset.pzdir;
  if ((n || d) && !pz.done) renderPzSide();
  if (e.target.id === 'pzCheck') checkPuzzle();
  if (e.target.id === 'pzNext') nextPuzzle();
  const st = e.target.closest('[data-pzstudy]');
  if (st) {
    showView('patterns');
    openPattern(st.dataset.pzstudy);
  }
});
$('#pzFilter').addEventListener('change', () => nextPuzzle());
document.addEventListener('keydown', (e) => {
  if ($('#view-puzzles').classList.contains('hidden') || e.target.closest?.('input, select, textarea')) return;
  if (e.key === 'ArrowUp' && !pz.done) { pz.pick.dir = 'up'; renderPzSide(); }
  else if (e.key === 'ArrowDown' && !pz.done) { pz.pick.dir = 'down'; renderPzSide(); }
  else if (e.key === 'Enter') (pz.done ? nextPuzzle : checkPuzzle)();
  else if (/^[1-4]$/.test(e.key) && pz.cur && !pz.done) { pz.pick.name = pz.cur.choices[+e.key - 1]; renderPzSide(); }
});

async function enterPuzzles() {
  renderPzScore();
  try {
    await learnMeta();
  } catch (err) {
    $('#pzSide').innerHTML = `<p class="msg-err">${esc(errText(err))}</p><button class="btn ghost" id="pzNext">Try again</button>`;
    return;
  }
  if ($('#pzFilter').options.length <= 1) $('#pzFilter').innerHTML += L.meta.patterns.filter((p) => L.meta.stats[p.id].n >= 5).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  renderPzScore();
  renderPzLeft(L.meta.allowance);
  if (!pz.cur) nextPuzzle();
}

// ================= Pattern library =================
let plChart = null;
async function renderPatterns() {
  try {
    await learnMeta();
  } catch (err) {
    $('#plGrid').innerHTML = `<div class="empty">${esc(errText(err))}</div>`;
    return;
  }
  const m = L.meta;
  $('#plIntro').innerHTML = `The classic candlestick patterns: what they look like, what they're supposed to mean, how traders use them, and what actually happened after them in <b>${m.baseline.n.toLocaleString()} real trading days</b> of ${m.symbols} large US stocks and ETFs (${when2(m.from)} – ${when2(m.to)}). On a random day in this data the price was higher ${m.horizon} days later ${pctTxt(m.baseline.upPct)} of the time; that's the number to beat.`;
  $('#plGrid').innerHTML = m.patterns.map((p) => {
    const st = m.stats[p.id];
    const rec = p.kind === 'neutral' ? `${pctTxt(st.upPct)} higher after ${m.horizon} days` : `${pctTxt(st.workedPct)} went ${p.kind === 'bullish' ? 'up' : 'down'} · ${st.n.toLocaleString()} examples`;
    return `<div class="pl-card" data-pl="${p.id}">${candleSvg(p.id)}<b>${esc(p.name)}</b><div>${kindTag(p)}</div><div class="small muted">${rec}</div></div>`;
  }).join('');
}

async function openPattern(id) {
  await renderPatterns();
  const m = L.meta;
  const p = pmeta(id);
  const st = m.stats[id];
  const info = PINFO[id];
  const anyDay = p.kind === 'bearish' ? 100 - m.baseline.upPct : m.baseline.upPct;
  const mine = p.kind === 'neutral' ? st.upPct : st.workedPct;
  const bar = (label, v) => `<div class="row"><span>${label}</span><i style="width:${Math.max(2, v || 0) * 2.2}px"></i><b>${pctTxt(v)}</b></div>`;
  const el = $('#plDetail');
  el.classList.remove('hidden');
  el.innerHTML = `<div class="card"><div>${candleSvg(id, 'big')}<div style="margin-top:8px">${kindTag(p)} <span class="small muted">${p.bars} candle${p.bars > 1 ? 's' : ''}${p.trend ? ` · after ${p.trend === 'down' ? 'a fall' : 'a rise'}` : ''}</span></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px"><button class="btn" data-plpractice="${id}">Practice this pattern</button><button class="btn ghost" data-plclose="1">Back to all</button></div></div>
    <div><h3>${esc(p.name)}</h3>
      <h4>What it looks like</h4><p>${esc(info.look)}</p>
      <h4>What it's supposed to mean</h4><p>${esc(info.means)}</p>
      <h4>How traders use it</h4><p>${esc(info.use)}</p>
      <h4>What really happened (${m.horizon} trading days later)</h4>
      <div class="pl-meter">${bar(p.kind === 'neutral' ? 'This pattern: up' : `This pattern: ${p.kind === 'bullish' ? 'up' : 'down'}`, mine)}${bar(`Any day: ${p.kind === 'bearish' ? 'down' : 'up'}`, anyDay)}</div>
      <p class="small">${esc(recordLine(p, st, m.baseline))} Average move: ${sgnPct(st.avg, 2)} (any day ${sgnPct(m.baseline.avg, 2)}).</p>
      <h4>A real example</h4><div class="small muted" id="plExNote">Loading…</div><div id="plEx" class="pl-ex"></div></div></div>`;
  el.scrollIntoView({ block: 'start' });
  try {
    const ex = await radar.learn.example(id);
    if (plChart) plChart.remove();
    plChart = LWC.createChart($('#plEx'), { ...chartColors(), autoSize: true, timeScale: { borderColor: TV.line } });
    const s = plChart.addCandlestickSeries({ ...candleColors(), priceLineVisible: false, lastValueVisible: false });
    const all = [...ex.bars, ...ex.future];
    s.setData(all.map(pzPoint));
    const first = ex.bars[ex.bars.length - ex.patternBars];
    const d5 = ex.future[m.horizon - 1];
    s.setMarkers([{ time: first.time, position: 'aboveBar', color: TV.warn, shape: 'arrowDown', text: p.name }, ...(d5 ? [{ time: d5.time, position: ex.fwd > 0 ? 'aboveBar' : 'belowBar', color: ex.fwd > 0 ? TV.up : TV.down, shape: 'circle', text: `Day ${m.horizon}: ${sgnPct(ex.fwd)}` }] : [])]);
    plChart.timeScale().fitContent();
    $('#plExNote').textContent = `${ex.symbol}, ${when2(ex.date)}. ${ex.fwd > 0 ? 'Higher' : 'Lower'} ${m.horizon} days later (${sgnPct(ex.fwd)}). One example proves nothing; the numbers above are what count.`;
  } catch (err) {
    $('#plExNote').textContent = errText(err);
  }
}
$('#view-patterns').addEventListener('click', (e) => {
  const c = e.target.closest('[data-pl]');
  if (c) return openPattern(c.dataset.pl);
  if (e.target.closest('[data-plclose]')) {
    $('#plDetail').classList.add('hidden');
    return $('#view-patterns').scrollIntoView();
  }
  const pr = e.target.closest('[data-plpractice]');
  if (pr) {
    showView('puzzles');
    $('#pzFilter').value = pr.dataset.plpractice;
    nextPuzzle();
  }
});

// ================= Trading school =================
const sc = { mod: null, lesson: 0 };
const scProg = () => store.get('school.progress', { read: {}, passed: {} });
function renderSchool() {
  const S = window.SCHOOL || [];
  const pr = scProg();
  const total = S.reduce((n, m) => n + m.lessons.length, 0);
  const read = Object.keys(pr.read).length;
  const passed = S.filter((m) => pr.passed[m.id]).length;
  const pct = total ? Math.round(((read + passed) / (total + S.length)) * 100) : 0;
  if (sc.mod == null) {
    $('#school').innerHTML = `<div class="sc-top"><div><h2>Trading school</h2><p class="muted small" style="max-width:640px;margin:4px 0 0">A complete course, from your first order to running a trading plan. Each module ends with a short quiz. Practise as you go in the Trading screen's simulated account; no real money needed.</p></div>
      <div class="sc-prog"><div class="small"><b>${pct}%</b> complete · ${passed} of ${S.length} modules passed${passed === S.length && S.length ? ' 🎓' : ''}</div><div class="pz-xp"><i style="width:${pct}%"></i></div></div></div>
      <div class="sc-mods">${S.map((m, i) => {
        const r = m.lessons.filter((l) => pr.read[`${m.id}/${l.id}`]).length;
        return `<div class="sc-mod" data-scmod="${i}"><div class="n">Module ${i + 1} · ${m.lessons.length} lessons + quiz</div><h3>${esc(m.title)}</h3><p>${esc(m.summary)}</p>
          ${pr.passed[m.id] ? '<div class="done">✓ Passed</div>' : `<div class="small muted">${r} of ${m.lessons.length} lessons read</div>`}</div>`;
      }).join('')}</div>
      <p class="small muted" style="margin-top:18px">Educational content, not financial advice. Trading involves risk of loss.</p>`;
    return;
  }
  const m = S[sc.mod];
  const quiz = sc.lesson === m.lessons.length;
  const toc = m.lessons.map((l, i) => `<button data-sclesson="${i}" class="${i === sc.lesson ? 'on' : ''} ${pr.read[`${m.id}/${l.id}`] ? 'read' : ''}">${i + 1}. ${esc(l.title)}</button>`).join('') +
    `<button data-sclesson="${m.lessons.length}" class="${quiz ? 'on' : ''} ${pr.passed[m.id] ? 'read' : ''}">Quiz</button><button data-scback="1" style="margin-top:10px">← All modules</button>`;
  let body;
  if (!quiz) {
    const l = m.lessons[sc.lesson];
    pr.read[`${m.id}/${l.id}`] = true;
    store.set('school.progress', pr);
    body = `<div class="small muted">Module ${sc.mod + 1}: ${esc(m.title)}</div><h2>${esc(l.title)}</h2>${l.body}
      <div class="sc-nav">${sc.lesson > 0 ? '<button class="btn ghost" data-scstep="-1">← Previous</button>' : '<span></span>'}<button class="btn" data-scstep="1">${sc.lesson + 1 < m.lessons.length ? 'Next lesson →' : 'Take the quiz →'}</button></div>`;
  } else {
    body = `<div class="small muted">Module ${sc.mod + 1}: ${esc(m.title)}</div><h2>Quiz</h2><p class="muted">Answer all ${m.quiz.length} questions. Get ${Math.ceil(m.quiz.length * 0.8)} or more right to pass the module.</p>
      <div class="sc-quiz">${m.quiz.map((q, qi) => `<div class="q" data-q="${qi}"><p>${qi + 1}. ${esc(q.q)}</p><div class="opts">${q.options.map((o, oi) => `<button data-qa="${qi}:${oi}">${esc(o)}</button>`).join('')}</div><div class="why hidden"></div></div>`).join('')}</div>
      <div id="scScore" class="small" style="margin-top:12px"></div>`;
    sc.answers = {};
  }
  $('#school').innerHTML = `<div class="sc-layout"><nav class="sc-toc">${toc}</nav><article class="sc-lesson">${body}</article></div>`;
  $('#view-school').scrollTop = 0;
  document.querySelector('main')?.scrollTo?.(0, 0);
}
$('#view-school').addEventListener('click', (e) => {
  const S = window.SCHOOL || [];
  const mod = e.target.closest('[data-scmod]');
  if (mod) {
    sc.mod = +mod.dataset.scmod;
    sc.lesson = 0;
    return renderSchool();
  }
  const ls = e.target.closest('[data-sclesson]');
  if (ls) {
    sc.lesson = +ls.dataset.sclesson;
    return renderSchool();
  }
  if (e.target.closest('[data-scback]')) {
    sc.mod = null;
    return renderSchool();
  }
  const step = e.target.closest('[data-scstep]');
  if (step) {
    sc.lesson = Math.max(0, sc.lesson + +step.dataset.scstep);
    return renderSchool();
  }
  const qa = e.target.closest('[data-qa]');
  if (qa) {
    const [qi, oi] = qa.dataset.qa.split(':').map(Number);
    if (sc.answers[qi] != null) return;
    const m = S[sc.mod];
    const q = m.quiz[qi];
    sc.answers[qi] = oi === q.answer;
    const box = qa.closest('.q');
    box.querySelectorAll('[data-qa]').forEach((b, k) => {
      if (k === q.answer) b.classList.add('right');
      else if (k === oi) b.classList.add('wrong');
    });
    const why = box.querySelector('.why');
    why.textContent = `${oi === q.answer ? 'Right. ' : 'Not quite. '}${q.why}`;
    why.classList.remove('hidden');
    const done = Object.keys(sc.answers).length;
    const right = Object.values(sc.answers).filter(Boolean).length;
    if (done === m.quiz.length) {
      const pass = right >= Math.ceil(m.quiz.length * 0.8);
      const pr = scProg();
      if (pass) pr.passed[m.id] = true;
      store.set('school.progress', pr);
      $('#scScore').innerHTML = pass
        ? `<span class="msg-ok"><b>${right}/${m.quiz.length}: module passed!</b></span> ${sc.mod + 1 < S.length ? `<button class="btn" data-scmod="${sc.mod + 1}">Next module →</button>` : '<b>You finished the whole course. 🎓</b>'}`
        : `<span class="msg-err"><b>${right}/${m.quiz.length}.</b> Review the lessons and try again.</span> <button class="btn ghost" data-sclesson="${m.lessons.length}">Retake quiz</button>`;
    }
  }
});

// Called by showView (app.js) whenever a section opens.
window.onLearnView = (name) => {
  if (name === 'puzzles') enterPuzzles();
  if (name === 'patterns') {
    $('#plDetail').classList.add('hidden');
    renderPatterns();
  }
  if (name === 'school') renderSchool();
};
