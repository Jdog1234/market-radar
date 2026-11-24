/* global radar */
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

let data = null;
let newsFilter = 'all';
let ccy = 'USD';

// ---------- formatting ----------
const pct = (x, d = 1) => (x == null ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(d)}%`);
const cls = (x) => (x > 0 ? 'up' : x < 0 ? 'down' : 'muted');
const money = (x) => (x == null ? '—' : `$${x >= 100 ? x.toFixed(2) : x.toFixed(x < 10 ? 3 : 2)}`);
function cap(x) {
  if (!x) return '—';
  return x >= 1e12 ? `$${(x / 1e12).toFixed(2)}T` : x >= 1e9 ? `$${(x / 1e9).toFixed(1)}B` : `$${(x / 1e6).toFixed(0)}M`;
}
function ago(t) {
  const m = Math.round((Date.now() - t) / 60e3);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  return h < 48 ? `${h}h` : `${Math.round(h / 24)}d`;
}
const fmtTime = (t) => new Date(t).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

function spark(vals, w = 110, h = 28) {
  if (!vals || vals.length < 2) return '';
  const lo = Math.min(...vals), hi = Math.max(...vals), r = hi - lo || 1;
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * w).toFixed(1)},${(h - ((v - lo) / r) * (h - 2) - 1).toFixed(1)}`).join(' ');
  const color = vals.at(-1) >= vals[0] ? 'var(--up)' : 'var(--down)';
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline fill="none" stroke="${color}" stroke-width="1.5" points="${pts}"/></svg>`;
}

function scoreBadge(x) {
  const c = x > 0.05 ? 'pos' : x < -0.05 ? 'neg' : 'zero';
  return `<span class="score ${c}" title="Composite score, −10 to +10">${x > 0 ? '+' : ''}${x.toFixed(1)}</span>`;
}

function catChips(cats, limit = 4) {
  return cats.slice(0, limit).map((c) => {
    const v = c.value ?? c.weight;
    return `<span class="chip ${v > 0 ? 'pos' : 'neg'}">${esc(c.label)}${c.count > 1 ? ` ×${c.count}` : ''}</span>`;
  }).join('');
}

// ---------- signals ----------
function card(c) {
  const t = c.tech;
  const flags = (c.flags || []).map((f) => `<div class="flag ${f.kind}">${f.kind === 'warn' ? '⚠' : '●'} ${esc(f.text)}</div>`).join('');
  const hls = c.headlines.slice(0, 2).map((h) =>
    `<div><a data-url="${esc(h.link)}" title="${esc(h.title)}">${esc(h.title)}</a><span class="meta">${esc(h.publisher)} · ${ago(h.publishedAt)}</span></div>`).join('');
  return `<div class="card sig" data-sym="${esc(c.symbol)}">
    <div class="sig-head">
      <span class="sym">${esc(c.symbol)}</span><span class="name">${esc(c.name)}</span>
      <span class="conf ${c.confidence}">${c.confidence}</span>${scoreBadge(c.composite)}
    </div>
    <div class="sig-mid">
      ${t ? `<span><b>${money(t.last)}</b> <span class="${cls(t.ret1)}">${pct(t.ret1)}</span></span>
      <span>5d <span class="${cls(t.ret5)}">${pct(t.ret5, 0)}</span></span>
      <span>RVOL <b>${t.rvol ? t.rvol.toFixed(1) + '×' : '—'}</b></span>` : '<span>No price data</span>'}
      <span>${cap(c.marketCap)}</span>
      ${t ? spark(t.spark) : ''}
    </div>
    <div class="chips">${catChips(c.reasons)}</div>
    ${flags ? `<div class="flags">${flags}</div>` : ''}
    ${hls ? `<div class="hl">${hls}</div>` : ''}
  </div>`;
}

function renderSignals() {
  const alerts = [];
  if (data.todayHigh?.length) {
    const upcoming = data.todayHigh.filter((e) => e.time > Date.now() - 30 * 60e3);
    if (upcoming.length) {
      alerts.push(`<div class="alert warn"><b>High-impact news today:</b> ${upcoming.map((e) => `${esc(e.country)} ${esc(e.title)} at ${fmtTime(e.time)}`).join(' · ')}. Expect volatility around these times — avoid opening positions in the minutes before and after.</div>`);
    }
  }
  if (data.regime?.verdict) alerts.push(`<div class="alert info"><b>Market tide:</b> ${esc(data.regime.verdict)}</div>`);
  $('#alerts').innerHTML = alerts.join('');
  $('#bull').innerHTML = data.bullish.length ? data.bullish.map(card).join('') : '<div class="empty">No bullish catalysts found yet.</div>';
  $('#bear').innerHTML = data.bearish.length ? data.bearish.map(card).join('') : '<div class="empty">No bearish catalysts found yet.</div>';
  $('#watch').innerHTML = data.watchlist?.length ? data.watchlist.map(card).join('') : '<div class="empty">Add tickers to your watchlist in Settings.</div>';
}

function findSym(sym) {
  return [...data.bullish, ...data.bearish, ...(data.watchlist || [])].find((c) => c.symbol === sym);
}

function openDrawer(sym) {
  const c = findSym(sym);
  if (!c) return;
  const t = c.tech || {};
  const rows = c.reasons.map((r) => `<tr><td><span class="chip ${r.value > 0 ? 'pos' : 'neg'}">${esc(r.label)}</span></td><td class="muted small">${r.count} headline${r.count > 1 ? 's' : ''}</td><td class="${cls(r.value)}">${r.value > 0 ? '+' : ''}${r.value.toFixed(2)}</td></tr>`).join('');
  const hls = c.headlines.map((h) => `<div><a data-url="${esc(h.link)}">${esc(h.title)}</a>
      <div class="meta">${esc(h.publisher)} · ${ago(h.publishedAt)} ago ${h.opinion ? '· <span class="flag warn">opinion</span>' : ''} ${catChips(h.catalysts, 6)}</div></div>`).join('');
  $('#drawer .drawer-inner').innerHTML = `
    <button class="close" id="closeDrawer">Close</button>
    <button class="close" data-lookup="${esc(c.symbol)}" style="margin-right:8px">Full lookup →</button>
    <h2 style="margin-bottom:2px">${esc(c.symbol)} ${scoreBadge(c.composite)} <span class="conf ${c.confidence}">${c.confidence} confidence</span></h2>
    <div class="muted">${esc(c.name)}</div>
    <div class="muted small">${esc(c.sector)}${c.industry ? ' · ' + esc(c.industry) : ''} · ${cap(c.marketCap)}</div>
    <div class="kv">
      <div><span>News score</span><b class="${cls(c.newsScore)}">${c.newsScore.toFixed(1)}</b></div>
      <div><span>Price/trend score</span><b class="${cls(t.score)}">${t.score != null ? t.score.toFixed(1) : '—'}</b></div>
      <div><span>Independent sources</span><b>${c.independentSources}</b></div>
      <div><span>Last price</span><b>${money(t.last)}</b> <span class="${cls(t.ret1)} small">${pct(t.ret1)}</span></div>
      <div><span>5-day / 20-day</span><b class="${cls(t.ret5)}">${pct(t.ret5, 0)}</b> / <b class="${cls(t.ret20)}">${pct(t.ret20, 0)}</b></div>
      <div><span>Relative volume</span><b>${t.rvol ? t.rvol.toFixed(2) + '×' : '—'}</b></div>
      <div><span>vs 20-day avg</span><b class="${cls(t.last - t.sma20)}">${t.sma20 ? pct((t.last / t.sma20 - 1) * 100) : '—'}</b></div>
      <div><span>vs 50-day avg</span><b class="${cls(t.last - t.sma50)}">${t.sma50 ? pct((t.last / t.sma50 - 1) * 100) : '—'}</b></div>
      <div><span>From 60-day high</span><b>${t.pctFrom60High != null ? pct(t.pctFrom60High) : '—'}</b></div>
    </div>
    ${t.spark ? spark(t.spark, 590, 80) : ''}
    ${(c.flags || []).length ? `<div class="flags" style="margin:10px 0">${c.flags.map((f) => `<div class="flag ${f.kind}">${f.kind === 'warn' ? '⚠' : '●'} ${esc(f.text)}</div>`).join('')}</div>` : ''}
    <h3 style="margin-top:14px">Why it scored this way</h3>
    ${rows ? `<table class="reasons">${rows}</table>` : '<p class="muted small">No scored catalysts in the last few days.</p>'}
    <h3>Headlines</h3>
    <div class="hl">${hls || '<span class="muted small">No recent headlines.</span>'}</div>
    <p class="small muted" style="margin-top:16px">Score = 65% news (catalysts weighted by evidence strength and decayed by age) + 35% price trend, boosted by heavy relative volume. See the Research guide for every weight.</p>`;
  $('#drawer').classList.remove('hidden');
}

// ---------- news ----------
function renderNews() {
  const q = $('#newsSearch').value.trim().toLowerCase();
  const net = (n) => n.catalysts.reduce((s, c) => s + c.weight, 0);
  let items = data.news;
  if (newsFilter === 'bull') items = items.filter((n) => net(n) > 0);
  if (newsFilter === 'bear') items = items.filter((n) => net(n) < 0);
  if (newsFilter === 'tagged') items = items.filter((n) => n.tickers.length);
  if (newsFilter === 'macro') items = items.filter((n) => n.kind === 'macro');
  if (newsFilter === 'forex') items = items.filter((n) => n.kind === 'forex');
  if (q) items = items.filter((n) => n.title.toLowerCase().includes(q) || n.tickers.some((t) => t.toLowerCase() === q));
  $('#newsList').innerHTML = items.slice(0, 300).map((n) => `
    <div class="nrow ${n.lawSpam || n.opinion ? 'dim' : ''}">
      <div class="t">${ago(n.publishedAt)}</div>
      <div><a class="ttl" data-url="${esc(n.link)}">${esc(n.title)}</a>
        <div class="meta">${esc(n.publisher)}${n.opinion ? ' · opinion' : ''}${n.lawSpam ? ' · law-firm spam' : ''}
          ${n.tickers.map((t) => `<span class="chip tk" data-tk="${esc(t)}">${esc(t)}</span>`).join('')} ${catChips(n.catalysts, 5)}</div></div>
    </div>`).join('') || '<div class="empty">No headlines match.</div>';
}

// ---------- economic calendar ----------
function renderCalendar() {
  const ccys = ['All', ...new Set(data.econ.map((e) => e.country))];
  $('#ccyFilters').innerHTML = ccys.map((c) => `<button data-c="${esc(c)}" class="${c === ccy ? 'on' : ''}">${esc(c)}</button>`).join('');
  const highOnly = $('#highOnly').checked;
  const evs = data.econ.filter((e) => (ccy === 'All' || e.country === ccy) && (!highOnly || e.impact === 'High')).sort((a, b) => a.time - b.time);
  const next = data.econ.filter((e) => e.impact === 'High' && e.time > Date.now()).sort((a, b) => a.time - b.time)[0];
  $('#nextEvent').innerHTML = next
    ? `<div class="alert warn">Next high-impact release: <b>${esc(next.country)} ${esc(next.title)}</b> — ${new Date(next.time).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })} (in ${ago(2 * Date.now() - next.time)}). ${esc(next.explain)}</div>`
    : '';
  let html = '';
  let day = '';
  for (const e of evs) {
    const d = new Date(e.time).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
    if (d !== day) html += `<div class="day">${(day = d)}</div>`;
    html += `<div class="ev ${e.time < Date.now() ? 'past' : ''}">
      <div>${fmtTime(e.time)}</div><div><b>${esc(e.country)}</b></div><div class="dot ${esc(e.impact)}" title="${esc(e.impact)} impact"></div>
      <div>${esc(e.title)}</div>
      <div class="nums">${e.actual ? `Actual <b>${esc(e.actual)}</b> · ` : ''}Forecast <b>${esc(e.forecast || '—')}</b> · Prev <b>${esc(e.previous || '—')}</b></div>
      ${e.explain && e.impact !== 'Low' ? `<div class="ex">${esc(e.explain)}</div>` : ''}
    </div>`;
  }
  $('#calList').innerHTML = html || '<div class="empty">No events (the calendar feed may be rate-limited — it retries on the next refresh).</div>';
}

// ---------- earnings ----------
function parseCap(s) {
  return Number(String(s || '').replace(/[$,]/g, '')) || 0;
}
function renderEarnings() {
  const q = $('#earnSearch').value.trim().toLowerCase();
  const big = $('#earnBig').checked;
  const inSignals = new Set([...data.bullish, ...data.bearish, ...(data.watchlist || [])].map((c) => c.symbol));
  const rows = data.earnings
    .filter((e) => (!big || parseCap(e.marketCap) >= 1e10 || inSignals.has(e.symbol)) && (!q || e.symbol.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)))
    .sort((a, b) => a.date.localeCompare(b.date) || parseCap(b.marketCap) - parseCap(a.marketCap));
  $('#earnList').innerHTML = rows.length ? `<table class="tbl"><tr><th>Date</th><th>When</th><th>Ticker</th><th>Company</th><th>Market cap</th><th>EPS forecast</th><th>EPS last year</th><th># Est.</th></tr>
    ${rows.map((e) => `<tr class="${inSignals.has(e.symbol) ? 'hot' : ''}"><td>${new Date(e.date + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}</td>
      <td>${esc(e.time)}</td><td><b>${esc(e.symbol)}</b></td><td>${esc(e.name)}</td><td>${cap(parseCap(e.marketCap))}</td>
      <td>${esc(e.epsForecast || '—')}</td><td>${esc(e.lastYearEPS || '—')}</td><td>${esc(e.numEstimates || '—')}</td></tr>`).join('')}</table>`
    : '<div class="empty">No earnings found.</div>';
}

// ---------- header / stats ----------
function renderHeader() {
  $('#regime').innerHTML = (data.regime?.indices || []).map((i) => `<div class="idx"><b>${esc(i.name)}</b>
     <span class="${cls(i.ret1)}">${pct(i.ret1)}</span><span class="muted">${esc(i.state)}</span>${spark(i.spark, 60, 18)}</div>`).join('');
  $('#scanned').textContent = `Updated ${new Date(data.scannedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
  const s = data.stats;
  $('#stats').innerHTML = `${s.sources ? `${s.sources} sources · ` : ''}${s.headlines} headlines read<br>${s.tagged} linked to stocks<br>${s.candidates} stocks scored · ${s.priced} price-checked`;
  const bad = s.feeds.filter((f) => !f.ok);
  $('#feedStatus').innerHTML = `<p>${s.feeds.length - bad.length}/${s.feeds.length} sources OK on the last scan.</p>` +
    bad.map((f) => `<div class="fs"><span class="bad">✕</span>${esc(f.name)} <span class="muted">${esc(f.error)}</span></div>`).join('');
}

function renderAll() {
  if (!data) return;
  renderHeader();
  renderSignals();
  renderBefore();
  renderTrades();
  renderNews();
  renderCalendar();
  renderEarnings();
}

// ---------- markdown (guide) ----------
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/\*([^*]+)\*/g, '<i>$1</i>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a data-url="$2">$1</a>');
}
function markdown(md) {
  const out = [];
  const lines = md.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^#{1,3} /.test(l)) { const n = l.match(/^#+/)[0].length; out.push(`<h${n}>${inline(l.slice(n + 1))}</h${n}>`); }
    else if (/^---\s*$/.test(l)) out.push('<hr>');
    else if (/^> /.test(l)) out.push(`<blockquote>${inline(l.slice(2))}</blockquote>`);
    else if (/^\|/.test(l)) {
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      i--;
      const cells = (r) => r.split('|').slice(1, -1).map((c) => c.trim());
      out.push(`<table><tr>${cells(rows[0]).map((c) => `<th>${inline(c)}</th>`).join('')}</tr>${rows.slice(2).map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</table>`);
    } else if (/^- /.test(l)) {
      const items = [];
      while (i < lines.length && /^- /.test(lines[i])) items.push(lines[i++].slice(2));
      i--;
      out.push(`<ul>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ul>`);
    } else if (/^\d+\. /.test(l)) {
      const items = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) items.push(lines[i++].replace(/^\d+\. /, ''));
      i--;
      out.push(`<ol>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</ol>`);
    } else if (l.trim()) out.push(`<p>${inline(l)}</p>`);
  }
  return out.join('\n');
}

// ---------- settings ----------
async function loadSettings() {
  const s = await radar.getSettings();
  const f = $('#settingsForm');
  f.watchlist.value = s.watchlist.join(' ');
  f.refreshMinutes.value = s.refreshMinutes;
  f.minMarketCapM.value = Math.round(s.minMarketCap / 1e6);
  f.minPrice.value = s.minPrice;
  f.notify.checked = s.notify;
  f.accountSize.value = s.accountSize;
  f.riskPct.value = s.riskPct;
  settingsCache = s;
}

$('#settingsForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  await radar.saveSettings({
    watchlist: f.watchlist.value.toUpperCase().split(/[\s,;]+/).filter(Boolean),
    refreshMinutes: Number(f.refreshMinutes.value) || 15,
    minMarketCap: (Number(f.minMarketCapM.value) || 0) * 1e6,
    minPrice: Number(f.minPrice.value) || 0,
    notify: f.notify.checked,
    accountSize: Number(f.accountSize.value) || 0,
    riskPct: Number(f.riskPct.value) || 1,
  });
  settingsCache = await radar.getSettings();
  if (data) renderTrades();
  $('#saved').textContent = 'Saved — rescanning…';
  await radar.runScan();
  $('#saved').textContent = 'Saved.';
});

// ---------- events ----------
function showView(name) {
  $$('#nav button').forEach((x) => x.classList.toggle('active', x.dataset.view === name));
  $$('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${name}`));
  if (name === 'track') renderTrack();
  if (name === 'paper') {
    if (!pt.chart) ptSetSymbol(pt.sym);
    else radar.paper.watch([pt.sym]).then(applyPaper);
  } else if (window.radar) radar.paper.watch([]);
}
$('#nav').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) showView(b.dataset.view);
});

document.addEventListener('click', (e) => {
  const po = e.target.closest('[data-ptsym-open]');
  if (po) { openPaper({ symbol: po.dataset.ptsymOpen }); return; }
  const gd = e.target.closest('[data-guide]');
  if (gd) { showView('guide'); return; }
  const lk = e.target.closest('[data-lookup]');
  if (lk) { $('#drawer').classList.add('hidden'); openLookup(lk.dataset.lookup); return; }
  const a = e.target.closest('[data-url]');
  if (a) { e.preventDefault(); e.stopPropagation(); radar.open(a.dataset.url); return; }
  if (e.target.id === 'closeDrawer' || e.target.id === 'drawer') { $('#drawer').classList.add('hidden'); return; }
  const tk = e.target.closest('[data-tk]');
  if (tk) { $('#newsSearch').value = tk.dataset.tk; renderNews(); return; }
  const sig = e.target.closest('.sig');
  if (sig) openDrawer(sig.dataset.sym);
});
document.addEventListener('keydown', (e) => e.key === 'Escape' && $('#drawer').classList.add('hidden'));

$('#newsFilters').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  newsFilter = b.dataset.f;
  $$('#newsFilters button').forEach((x) => x.classList.toggle('on', x === b));
  renderNews();
});
$('#newsSearch').addEventListener('input', renderNews);
$('#ccyFilters').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) { ccy = b.dataset.c; renderCalendar(); }
});
$('#highOnly').addEventListener('change', renderCalendar);
$('#earnSearch').addEventListener('input', renderEarnings);
$('#earnBig').addEventListener('change', renderEarnings);

$('#refresh').addEventListener('click', () => radar.runScan());

radar.onProgress((p) => {
  const el = $('#progress');
  el.classList.toggle('hidden', p.pct >= 100);
  $('.bar', el).style.width = `${p.pct}%`;
  $('.label', el).textContent = p.stage;
  $('#refresh').disabled = p.pct < 100;
});
radar.onResult((r) => {
  data = r;
  renderAll();
  $('#refresh').disabled = false;
  $('#progress').classList.add('hidden');
});
radar.onError((m) => {
  $('#refresh').disabled = false;
  $('#progress').classList.add('hidden');
  $('#alerts').innerHTML = `<div class="alert warn">Scan failed: ${esc(m)}. Check your internet connection — it will retry on the next refresh.</div>` + $('#alerts').innerHTML;
});

(async () => {
  await loadSettings();
  $('#guide').innerHTML = markdown(await radar.guide());
  data = await radar.lastScan();
  if (data) renderAll();
  else $('#bull').innerHTML = $('#bear').innerHTML = '<div class="empty">Scanning the news for the first time — this takes about 15 seconds…</div>';
  setInterval(() => data && renderSignals(), 60e3); // keep "x minutes ago" fresh
})();

// ---------- stock search & lookup ----------
let sugg = [];
let suggIdx = 0;
let searchSeq = 0;
async function updateSuggest() {
  const q = $('#q').value.trim();
  const seq = ++searchSeq;
  if (!q) return $('#suggest').classList.add('hidden');
  const res = await radar.search(q);
  if (seq !== searchSeq) return;
  sugg = res;
  suggIdx = 0;
  $('#suggest').innerHTML = res.map((r, i) => `<div data-sym="${esc(r.symbol)}" class="${i === 0 ? 'on' : ''}"><b>${esc(r.symbol)}</b><span>${esc(r.name)}</span></div>`).join('')
    || '<div class="muted">No matching stocks</div>';
  $('#suggest').classList.remove('hidden');
}
$('#q').addEventListener('input', updateSuggest);
$('#q').addEventListener('keydown', (e) => {
  const items = $$('#suggest div[data-sym]');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    suggIdx = Math.max(0, Math.min(items.length - 1, suggIdx + (e.key === 'ArrowDown' ? 1 : -1)));
    items.forEach((x, i) => x.classList.toggle('on', i === suggIdx));
  } else if (e.key === 'Enter') {
    const sym = sugg[suggIdx]?.symbol || $('#q').value.trim().toUpperCase();
    if (sym) openLookup(sym);
  } else if (e.key === 'Escape') $('#suggest').classList.add('hidden');
});
$('#suggest').addEventListener('mousedown', (e) => {
  const d = e.target.closest('[data-sym]');
  if (d) openLookup(d.dataset.sym);
});
$('#q').addEventListener('blur', () => setTimeout(() => $('#suggest').classList.add('hidden'), 150));

async function openLookup(sym) {
  $('#suggest').classList.add('hidden');
  $('#q').value = '';
  $('#q').blur();
  showView('lookup');
  $('#lookup').innerHTML = `<div class="loading"><span class="spin"></span>Researching ${esc(sym)}: reading news, analysts, earnings, insiders, short interest…</div>`;
  try {
    renderLookup(await radar.lookup(sym));
  } catch (err) {
    $('#lookup').innerHTML = `<div class="empty">Couldn't look up ${esc(sym)}: ${esc(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))}</div>`;
  }
}

function partBar(score) {
  if (score == null) return '<span class="muted small">no data</span>';
  const w = Math.min(50, Math.abs(score) * 5);
  const left = score >= 0 ? 50 : 50 - w;
  return `<div class="bar"><i style="left:${left}%;width:${w}%;background:${score >= 0 ? 'var(--up)' : 'var(--down)'}"></i></div>`;
}

function renderLookup(r) {
  const t = r.tech || {};
  const dirWord = r.direction === 'up' ? 'Likely UP' : r.direction === 'down' ? 'Likely DOWN' : 'Unclear';
  const flags = r.flags.map((f) => `<div class="flag ${f.kind}">${f.kind === 'warn' ? '⚠' : '●'} ${esc(f.text)}</div>`).join('');
  const an = r.analysts;
  const er = r.earnings;
  const ins = r.insiders;
  const sh = r.short;
  const cr = r.crowd;
  const hls = r.news.headlines.map((h) => `<div><a data-url="${esc(h.link)}">${esc(h.title)}</a>
      <div class="meta">${esc(h.publisher)} · ${ago(h.publishedAt)} ago ${h.opinion ? '· opinion' : ''} ${catChips(h.catalysts, 5)}</div></div>`).join('');
  $('#lookup').innerHTML = `
    <div class="lk-head">
      <h1>${esc(r.symbol)}</h1>
      <div><div>${esc(r.name)}</div><div class="muted small">${esc(r.sector)}${r.industry ? ' · ' + esc(r.industry) : ''} · ${cap(r.marketCap)}</div></div>
      <button class="btn ghost" data-ptsym-open="${esc(r.symbol)}">Paper trade ${esc(r.symbol)}</button>
      <div style="margin-left:auto;text-align:right">${t.last ? `<div style="font-size:22px;font-weight:700">${money(t.last)}</div><div class="${cls(t.ret1)}">${pct(t.ret1)} today</div>` : ''}</div>
    </div>

    <div class="verdict-box ${r.direction}">
      <div class="big ${cls(r.composite)}">${r.composite > 0 ? '+' : ''}${r.composite.toFixed(1)}</div>
      <div class="txt" style="flex:1">
        <b>${dirWord}: ${esc(r.headline)}</b>
        <div class="meter"><i style="left:${50 + r.composite * 5}%"></i></div>
        <div class="small muted">Scale −10 (strongly bearish) to +10 (strongly bullish). This weighs the evidence; it is not a price prediction.</div>
      </div>
    </div>
    ${flags ? `<div class="flags" style="margin-bottom:10px">${flags}</div>` : ''}

    <div class="lk-grid">
      <div class="card">
        <h3>Evidence breakdown</h3>
        <table class="parts" style="width:100%;border-collapse:collapse">
          ${r.parts.map((p) => `<tr><td>${esc(p.label)}<div class="muted small">${Math.round(p.weight * 1000) / 10}% weight</div></td><td>${partBar(p.score)}</td><td class="num ${cls(p.score)}">${p.score == null ? '—' : (p.score > 0 ? '+' : '') + p.score.toFixed(1)}</td></tr>`).join('')}
        </table>
      </div>

      <div class="card">
        <h3>Price & volume</h3>
        ${t.spark ? spark(t.spark, 320, 70) : '<p class="muted small">No price data.</p>'}
        <div class="kv" style="grid-template-columns:repeat(2,1fr)">
          <div><span>5-day / 20-day</span><b class="${cls(t.ret5)}">${pct(t.ret5, 0)}</b> / <b class="${cls(t.ret20)}">${pct(t.ret20, 0)}</b></div>
          <div><span>Relative volume</span><b>${t.rvol ? t.rvol.toFixed(2) + '×' : '—'}</b></div>
          <div><span>vs 50-day avg</span><b class="${cls(t.last - t.sma50)}">${t.sma50 ? pct((t.last / t.sma50 - 1) * 100) : '—'}</b></div>
          <div><span>From 60-day high</span><b>${t.pctFrom60High != null ? pct(t.pctFrom60High) : '—'}</b></div>
        </div>
      </div>

      <div class="card">
        <h3>Analysts</h3>
        ${an ? `<p><b class="up">${an.buy} Buy</b> · <b>${an.hold} Hold</b> · <b class="down">${an.sell} Sell</b></p>
          <p class="small">Average target <b>${money(an.target)}</b> (${an.upside != null ? `<span class="${cls(an.upside)}">${pct(an.upside, 0)}</span> from here` : '—'}), range ${money(an.low)} – ${money(an.high)}</p>
          <p class="small muted">Targets run optimistic on average, so the score counts only half the upside.</p>` : '<p class="muted small">No analyst coverage found.</p>'}
      </div>

      <div class="card">
        <h3>Earnings history</h3>
        ${er ? `<p class="small">Beat estimates <b>${er.beats} of the last ${er.of}</b> quarters. Last report ${er.daysSinceReport} days ago.</p>
          <table class="mini"><tr><th>Quarter</th><th>EPS</th><th>Forecast</th><th>Surprise</th></tr>
          ${er.quarters.map((q) => `<tr><td>${esc(q.quarter)}</td><td>${q.eps ?? '—'}</td><td>${q.forecast ?? '—'}</td><td class="${cls(q.surprise)}">${q.surprise != null ? pct(q.surprise) : '—'}</td></tr>`).join('')}</table>` : '<p class="muted small">No earnings history found.</p>'}
        ${r.nextEarnings ? `<p class="small" style="margin-top:8px">Next report: <b>${new Date(r.nextEarnings.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</b></p>` : ''}
      </div>

      <div class="card">
        <h3>Insiders (last 3 months)</h3>
        ${ins ? `<p class="small"><b class="up">${ins.buys3} open-market buys</b> · <b>${ins.sells3} sells</b> <span class="muted">(${ins.buys12} buys in 12 months)</span></p>
          <p class="small muted">Insider <i>buying</i> is the meaningful signal. Selling is usually routine (taxes, planned sales).</p>
          <table class="mini">${ins.recent.map((x) => `<tr><td>${esc(x.date)}</td><td>${esc(x.who)}<div class="muted">${esc(x.role)}</div></td><td>${esc(x.type)}</td><td>${esc(x.shares)}</td></tr>`).join('')}</table>` : '<p class="muted small">No insider data found.</p>'}
      </div>

      <div class="card">
        <h3>Short interest & crowd</h3>
        ${sh ? `<p class="small">Days to cover: <b>${sh.daysToCover.toFixed(1)}</b> · short interest ${sh.changePct >= 0 ? 'up' : 'down'} <b class="${cls(-sh.changePct)}">${Math.abs(sh.changePct).toFixed(0)}%</b> vs prior report (${esc(sh.date)})</p>
          <p class="small muted">Above ~5 days to cover means many traders are betting against it.</p>` : '<p class="muted small">No short-interest data.</p>'}
        ${cr && cr.tagged ? `<p class="small" style="margin-top:10px">StockTwits: <b class="up">${cr.bullish} bullish</b> / <b class="down">${cr.bearish} bearish</b> of the last ${cr.messages} posts${cr.watchers ? ` · ${cr.watchers.toLocaleString()} watchers` : ''}</p>
          <p class="small muted">Shown for context only: social chatter has weak predictive power, and extreme hype tends to reverse.</p>` : ''}
      </div>
    </div>

    <div class="card" style="margin-top:14px">
      <h3>News catalysts (last 7 days)</h3>
      ${r.news.reasons.length ? `<div class="chips" style="margin-bottom:10px">${catChips(r.news.reasons, 10)}</div>` : '<p class="muted small">No scored catalysts.</p>'}
      <div class="hl">${hls || '<span class="muted small">No recent headlines found.</span>'}</div>
    </div>`;
}

// ---------- track record ----------
async function renderTrack() {
  const tr = await radar.trackRecord();
  if (!tr.total) {
    $('#track').innerHTML = '<div class="empty">No signals logged yet. They are recorded automatically each scan; check back in a few days.</div>';
    return;
  }
  const cell = (s) => (s ? `<b class="${s.hit >= 50 ? 'up' : 'down'}">${s.hit.toFixed(0)}%</b> right · avg <span class="${cls(s.avg)}">${pct(s.avg)}</span> <span class="muted">(${s.n})</span>` : '<span class="muted">pending</span>');
  const table = (title, groups, label = (k) => k) => `<div class="card" style="margin-bottom:14px"><h3>${title}</h3>
    <table class="mini"><tr><th></th><th>Signals</th><th>After 1 day</th><th>After 5 days</th><th>After 20 days</th></tr>
    ${groups.map((g) => `<tr><td>${esc(label(g.key))}</td><td>${g.count}</td><td>${cell(g.stats[1])}</td><td>${cell(g.stats[5])}</td><td>${cell(g.stats[20])}</td></tr>`).join('')}</table></div>`;
  const o = tr.overall;
  const stat = (h, s) => `<div class="stat"><span>After ${h} trading day${h > 1 ? 's' : ''}</span>${s ? `<b class="${s.hit >= 50 ? 'up' : 'down'}">${s.hit.toFixed(0)}% right</b><div class="small">avg ${pct(s.avg)} per signal · ${s.n} measured</div>` : '<b class="muted">pending</b>'}</div>`;
  $('#track').innerHTML = `
    <p class="small muted">${tr.total} signals logged since ${new Date(tr.since).toLocaleDateString()}.</p>
    <div class="stat-row">${stat(1, o[1])}${stat(5, o[5])}${stat(20, o[20])}</div>
    ${table('By direction', tr.byDirection, (k) => (k === 'up' ? '▲ Bullish' : '▼ Bearish'))}
    ${table('By confidence', tr.byConfidence)}
    ${table('By main catalyst', tr.byCatalyst)}
    <div class="card"><h3>Recent signals</h3><table class="mini"><tr><th>Date</th><th>Stock</th><th>Call</th><th>Conf.</th><th>Catalyst</th><th>Price</th><th>1d</th><th>5d</th><th>20d</th></tr>
      ${tr.recent.map((r) => `<tr><td>${new Date(r.at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</td><td><a data-lookup="${esc(r.symbol)}">${esc(r.symbol)}</a></td>
        <td class="${r.dir === 'up' ? 'up' : 'down'}">${r.dir === 'up' ? '▲' : '▼'}</td><td>${esc(r.confidence)}</td><td>${esc(r.catalyst)}</td><td>${money(r.price)}</td>
        ${[1, 5, 20].map((h) => `<td class="${cls(r.returns[h])}">${r.returns[h] != null ? pct(r.returns[h]) : '—'}</td>`).join('')}</tr>`).join('')}</table>
      <p class="small muted">Returns are shown from the signal's point of view: positive means the call was right.</p></div>`;
}

// ---------- updates ----------
function renderUpdate(s) {
  const bar = $('#updateBar');
  let html = '';
  if (s.state === 'ready') html = `✨ Market Radar <b>v${esc(s.version)}</b> has been downloaded.${s.notes ? ` <span class="muted">${esc(s.notes)}</span>` : ''} <button class="btn" id="restartUpd">Restart to update</button>`;
  if (s.state === 'installer') html = `A new version (v${esc(s.version)}) needs a fresh install. <button class="btn" id="getInstaller">Download it</button>`;
  bar.innerHTML = html;
  bar.classList.toggle('hidden', !html);
  const label = { idle: '', checking: 'Checking for updates…', downloading: `Downloading v${esc(s.version)}…`, latest: 'You have the latest version.', ready: `v${esc(s.version)} is ready: restart to apply.`, installer: `v${esc(s.version)} needs a new installer.`, error: `Last check failed: ${esc(s.error)}` }[s.state] || '';
  $('#updInfo').textContent = label;
}
document.addEventListener('click', (e) => {
  if (e.target.id === 'restartUpd') radar.restartToUpdate();
  if (e.target.id === 'getInstaller') radar.openInstallerPage();
  if (e.target.id === 'checkUpd') radar.checkUpdates().then(renderUpdate);
});
radar.onUpdate(renderUpdate);
(async () => {
  const info = await radar.appInfo();
  $('#version').textContent = `v${info.version}${info.fromUpdate ? ' (auto-updated)' : ''}`;
  renderUpdate(await radar.updateStatus());
})();

// ---------- before the move ----------
let settingsCache = null;

function oppCard(o, kind) {
  const t = o.tech || {};
  const hls = (o.headlines || []).slice(0, 2).map((h) =>
    `<div><a data-url="${esc(h.link)}" title="${esc(h.title)}">${esc(h.title)}</a><span class="meta">${esc(h.publisher)} · ${ago(h.publishedAt)}</span></div>`).join('');
  return `<div class="card">
    <div class="sig-head">
      <a class="sym" data-lookup="${esc(o.symbol)}">${esc(o.symbol)}</a><span class="name">${esc(o.name)}</span>
      ${kind === 'earnings' ? `<span class="tag">Earnings ${esc(new Date(o.reportDate + 'T12:00:00').toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' }))}</span>` : `<span class="conf ${o.confidence}">${o.confidence}</span>`}
    </div>
    <div class="why">${esc(o.why)}</div>
    <div class="sig-mid">
      ${t.last ? `<span><b>${money(t.last)}</b> <span class="${cls(t.ret1)}">${pct(t.ret1)}</span></span>` : ''}
      ${t.atrPct ? `<span>Normal day ±${t.atrPct.toFixed(1)}%</span>` : ''}
      ${t.rvol ? `<span>RVOL <b>${t.rvol.toFixed(1)}×</b></span>` : ''}
      ${t.spark ? spark(t.spark) : ''}
    </div>
    ${o.reasons ? `<div class="chips">${catChips(o.reasons, 3)}</div>` : ''}
    ${hls ? `<div class="hl">${hls}</div>` : ''}
  </div>`;
}

function renderBefore() {
  const b = data.beforeMove || { up: [], down: [] };
  const e = data.earningsSetups || { up: [], down: [] };
  const none = (msg) => `<div class="empty">${msg}</div>`;
  $('#beforeUp').innerHTML = b.up.map((o) => oppCard(o)).join('') || none('No unpriced bullish news right now.');
  $('#beforeDown').innerHTML = b.down.map((o) => oppCard(o)).join('') || none('No unpriced bearish news right now.');
  $('#earnUp').innerHTML = e.up.map((o) => oppCard(o, 'earnings')).join('') || none('No reporting company with a 4-quarter beat streak and uptrend this week.');
  $('#earnDown').innerHTML = e.down.map((o) => oppCard(o, 'earnings')).join('') || none('No reporting company with a miss streak and downtrend this week.');
}

// ---------- trade ideas ----------
function renderTrades() {
  const s = settingsCache || { accountSize: 10000, riskPct: 1 };
  const riskDollars = (s.accountSize * s.riskPct) / 100;
  $('#sizing').innerHTML = s.accountSize
    ? `Position sizes below risk <b>${s.riskPct}%</b> of a <b>$${Number(s.accountSize).toLocaleString()}</b> account, so <b>$${riskDollars.toFixed(0)}</b> is lost if the stop is hit. Change this in Settings.`
    : 'Set your account size in Settings to see position sizes.';
  const list = data.trades || [];
  $('#tradeList').innerHTML = list.map((t) => {
    const perShare = Math.abs(t.entry - t.stop);
    const shares = s.accountSize && perShare ? Math.floor(riskDollars / perShare) : 0;
    const cost = shares * t.entry;
    const ch = t.chance || {};
    const chance = ch.winRate != null
      ? `<b class="${ch.winRate > 33 ? 'up' : 'down'}">${ch.winRate.toFixed(0)}% win rate</b> across ${ch.decided} past ${ch.basis === 'catalyst' ? `"${esc(t.catalyst)}"` : ch.basis === 'type' ? `${esc(t.type)}` : ''} trade ideas from this app (target hit before stop). Breakeven is 33%.`
      : `<b>Win rate: building history.</b> ${ch.logged || 0} trade ideas logged so far. The app shows a measured win rate once 15+ similar ideas have played out. Breakeven for a 2:1 trade is 33%.`;
    const flags = (t.flags || []).filter((f) => f.kind === 'warn').map((f) => `<div class="flag warn">⚠ ${esc(f.text)}</div>`).join('');
    const typeLabel = { news: 'News not yet priced in', momentum: 'News + price confirmed', earnings: 'Earnings play (higher risk)' }[t.type] || t.type;
    return `<div class="card trade ${t.dir}">
      <div class="sig-head">
        <span class="sym ${t.dir === 'up' ? 'up' : 'down'}">${t.dir === 'up' ? '▲' : '▼'} ${esc(t.side)}</span>
        <a class="sym" data-lookup="${esc(t.symbol)}">${esc(t.symbol)}</a><span class="name">${esc(t.name)}</span>
        <span class="tag">${esc(typeLabel)}</span>
      </div>
      <div class="why">${esc(t.why)}</div>
      <div class="levels">
        <div><span>Entry</span><b>${money(t.entry)}</b></div>
        <div class="stop"><span>Stop (−${t.riskPct.toFixed(1)}%)</span><b>${money(t.stop)}</b></div>
        <div class="tgt"><span>Target (+${t.rewardPct.toFixed(1)}%)</span><b>${money(t.target)}</b></div>
        <div><span>Time frame</span><b style="font-size:12.5px">${esc(t.horizon)}</b></div>
      </div>
      <div class="note">${esc(t.entryNote)}</div>
      <div class="note">${esc(t.exitNote)}</div>
      ${shares ? `<div class="note">Size: <b>${shares} shares</b> (~$${cost.toLocaleString(undefined, { maximumFractionDigits: 0 })}${cost > s.accountSize ? ', more than your account, so reduce it' : ''})</div>` : ''}
      ${flags ? `<div class="flags">${flags}</div>` : ''}
      <div class="chance">${chance}</div>
      <button class="btn" style="margin-top:10px" data-papertrade="${esc(t.symbol)}">Paper trade this →</button>
    </div>`;
  }).join('') || '<div class="empty">No trade ideas pass the filters right now. That is normal on quiet news days.</div>';
}

radar.getSettings().then((s) => { settingsCache = s; if (data) renderTrades(); });

// ---------- paper trading ----------
const LWC = window.LightweightCharts;
const pt = { sym: 'SPY', tf: '5m', side: 'buy', chart: null, candle: null, vol: null, lines: [], bars: [], acct: null, quotes: {}, tab: 'pos', eqChart: null, eqLine: null, loading: 0 };
const TF_SEC = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600 };

function cssVar(n) {
  return getComputedStyle(document.documentElement).getPropertyValue(n).trim();
}

function ensureChart() {
  if (pt.chart || !LWC) return;
  const el = $('#ptChart');
  pt.chart = LWC.createChart(el, {
    autoSize: true,
    layout: { background: { color: 'transparent' }, textColor: cssVar('--muted'), fontSize: 11 },
    grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
    timeScale: { timeVisible: true, secondsVisible: false, borderColor: cssVar('--line') },
    rightPriceScale: { borderColor: cssVar('--line') },
    crosshair: { mode: LWC.CrosshairMode.Normal },
  });
  pt.candle = pt.chart.addCandlestickSeries({
    upColor: cssVar('--up'), downColor: cssVar('--down'), borderVisible: false, wickUpColor: cssVar('--up'), wickDownColor: cssVar('--down'),
  });
  pt.vol = pt.chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: '', color: 'rgba(120,140,160,0.35)' });
  pt.vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  // Click the chart to set the limit/stop price.
  pt.chart.subscribeClick((p) => {
    if (!p.point) return;
    const price = pt.candle.coordinateToPrice(p.point.y);
    if (price == null) return;
    if ($('#ptType').value === 'market') $('#ptType').value = 'limit';
    $('#ptPrice').value = price.toFixed(2);
    syncTicket();
  });
}

async function loadCandles() {
  ensureChart();
  const seq = ++pt.loading;
  try {
    const { bars } = await radar.paper.candles(pt.sym, pt.tf);
    if (seq !== pt.loading) return;
    pt.bars = bars;
    pt.candle.setData(bars.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })));
    pt.vol.setData(bars.map((b) => ({ time: b.time, value: b.volume, color: b.close >= b.open ? 'rgba(34,197,94,0.3)' : 'rgba(240,82,82,0.3)' })));
    pt.chart.timeScale().fitContent();
    if (bars.length > 150 && TF_SEC[pt.tf]) pt.chart.timeScale().setVisibleLogicalRange({ from: bars.length - 150, to: bars.length + 5 });
    drawLines();
  } catch (e) {
    $('#ptMsg').innerHTML = `<span class="msg-err">Chart data unavailable for ${esc(pt.sym)}.</span>`;
  }
}

// New York clock written as UTC seconds (matches the candle timestamps).
function nowEtAsUtc() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes()) / 1000;
}

// Stream the live price into the last candle.
function liveCandle(q) {
  if (!pt.candle || !pt.bars.length || !q) return;
  const price = pt.acct?.marketOpen ? q.last : q.ext?.last || q.last;
  const last = pt.bars.at(-1);
  const span = TF_SEC[pt.tf];
  if (span) {
    const bucket = nowEtAsUtc() - (nowEtAsUtc() % span);
    if (bucket > last.time) {
      if (!pt.acct?.marketOpen && !q.ext) return; // nothing trading right now
      const b = { time: bucket, open: last.close, high: Math.max(last.close, price), low: Math.min(last.close, price), close: price, volume: 0 };
      pt.bars.push(b);
      pt.candle.update(b);
      return;
    }
  }
  if (!pt.acct?.marketOpen && !span) return; // daily/weekly bars only move in regular hours
  last.close = price;
  last.high = Math.max(last.high, price);
  last.low = Math.min(last.low, price);
  pt.candle.update({ time: last.time, open: last.open, high: last.high, low: last.low, close: last.close });
}

function drawLines() {
  if (!pt.candle) return;
  for (const l of pt.lines) pt.candle.removePriceLine(l);
  pt.lines = [];
  const a = pt.acct;
  if (!a) return;
  const add = (price, color, title, style = 2) => price && pt.lines.push(pt.candle.createPriceLine({ price, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title }));
  const pos = a.positions.find((p) => p.symbol === pt.sym);
  if (pos) add(pos.avg, cssVar('--accent'), `${pos.qty > 0 ? 'Long' : 'Short'} ${Math.abs(pos.qty)} @ avg`, 0);
  for (const o of a.orders.filter((o) => o.symbol === pt.sym)) {
    const color = o.role === 'stop' ? cssVar('--down') : o.role === 'target' ? cssVar('--up') : cssVar('--warn');
    const title = o.role === 'stop' ? 'Stop-loss' : o.role === 'target' ? 'Take-profit' : `${o.side === 'buy' ? 'Buy' : 'Sell'} ${o.type} ${o.qty}`;
    if (o.price) add(o.price, color, title);
  }
  // Preview the ticket's stop-loss / take-profit before the order is placed.
  if ($('#ptUseSL').checked && +$('#ptSL').value) add(+$('#ptSL').value, 'rgba(240,82,82,0.5)', 'SL (preview)', 3);
  if ($('#ptUseTP').checked && +$('#ptTP').value) add(+$('#ptTP').value, 'rgba(34,197,94,0.5)', 'TP (preview)', 3);
}

function renderQuoteHead() {
  const q = pt.quotes[pt.sym];
  if (!q) return ($('#ptQuote').innerHTML = `<span class="muted">Loading ${esc(pt.sym)}…</span>`);
  $('#ptQuote').innerHTML = `<span class="muted">${esc(q.name || '')}</span><b>${money(q.last)}</b><span class="${cls(q.changePct)}">${pct(q.changePct, 2)}</span>
    ${q.ext ? `<span class="muted small">${q.ext.type === 'PRE_MKT' ? 'Pre-market' : 'After hours'} <b class="${cls(q.ext.changePct)}" style="font-size:13px">${money(q.ext.last)}</b></span>` : ''}`;
}

function renderAcct() {
  const a = pt.acct;
  if (!a) return;
  const st = (label, val, c = '') => `<div class="stat"><span>${label}</span><b class="${c}">${val}</b></div>`;
  const usd = (x) => `${x < 0 ? '−' : ''}$${Math.abs(x).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  $('#ptAcct').innerHTML = st('Equity', usd(a.equity)) + st('Cash', usd(a.cash)) + st('Buying power', usd(a.buyingPower)) +
    st('Open P&L', usd(a.unrealized), cls(a.unrealized)) + st('Total P&L', `${usd(a.totalPnl)} (${pct(a.totalPct, 2)})`, cls(a.totalPnl)) +
    st('Closed trades', a.closedTrades ? `${a.closedTrades} · ${a.winRate.toFixed(0)}% won` : '0') +
    `<div class="mkt"><span><i class="dotlive" style="background:${a.marketOpen ? 'var(--up)' : 'var(--muted)'}"></i>${a.marketOpen ? 'Market open: orders fill live' : 'Market closed: orders fill at the next open'}</span>
     <button class="btn ghost" id="ptReset">Reset account</button></div>`;
}

function renderTabs() {
  const a = pt.acct;
  if (!a) return;
  $('#ptEqChart').classList.toggle('hidden', pt.tab !== 'eq');
  const bracketOf = (sym, role) => a.orders.find((o) => o.symbol === sym && o.role === role)?.price;
  let html = '';
  if (pt.tab === 'pos') {
    html = a.positions.length ? `<table class="mini"><tr><th>Symbol</th><th>Side</th><th>Shares</th><th>Avg price</th><th>Last</th><th>Value</th><th>P&L</th><th>Stop-loss</th><th>Take-profit</th><th></th></tr>
      ${a.positions.map((p) => `<tr class="clk" data-ptsym="${esc(p.symbol)}"><td><b>${esc(p.symbol)}</b>${p.note ? `<div class="muted small">${esc(p.note)}</div>` : ''}</td>
        <td class="${p.qty > 0 ? 'up' : 'down'}">${p.qty > 0 ? 'Long' : 'Short'}</td><td>${Math.abs(p.qty)}</td><td>${money(p.avg)}</td><td>${money(p.last)}</td>
        <td>${money(Math.abs(p.value))}</td><td class="${cls(p.pnl)}">${p.pnl >= 0 ? '+' : '−'}$${Math.abs(p.pnl).toFixed(2)} (${pct(p.pnlPct)})</td>
        <td>${bracketOf(p.symbol, 'stop') ? money(bracketOf(p.symbol, 'stop')) : '—'}</td><td>${bracketOf(p.symbol, 'target') ? money(bracketOf(p.symbol, 'target')) : '—'}</td>
        <td><button class="x" data-ptclose="${esc(p.symbol)}">Close</button></td></tr>`).join('')}</table>`
      : '<div class="empty">No open positions. Place an order with the ticket, or click "Paper trade this" on a Trade idea.</div>';
  } else if (pt.tab === 'ord') {
    html = a.orders.length ? `<table class="mini"><tr><th>#</th><th>Symbol</th><th>Side</th><th>Type</th><th>Shares</th><th>Price</th><th>Role</th><th>Placed</th><th></th></tr>
      ${a.orders.map((o) => `<tr class="clk" data-ptsym="${esc(o.symbol)}"><td>${o.id}</td><td><b>${esc(o.symbol)}</b></td><td class="${o.side === 'buy' ? 'up' : 'down'}">${o.side}</td><td>${o.type}</td><td>${o.qty}</td>
        <td>${o.price ? money(o.price) : 'market'}</td><td>${{ entry: 'Entry', stop: 'Stop-loss', target: 'Take-profit' }[o.role]}${o.stopLoss || o.takeProfit ? ' + bracket' : ''}</td>
        <td>${new Date(o.createdAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td><td><button class="x" data-ptcancel="${o.id}">Cancel</button></td></tr>`).join('')}</table>`
      : '<div class="empty">No working orders.</div>';
  } else if (pt.tab === 'hist') {
    html = a.fills.length ? `<table class="mini"><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Shares</th><th>Price</th><th>Type</th><th>Realized P&L</th></tr>
      ${a.fills.map((f) => `<tr><td>${new Date(f.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td><td><b>${esc(f.symbol)}</b></td>
        <td class="${f.side === 'buy' ? 'up' : 'down'}">${f.side}</td><td>${f.qty}</td><td>${money(f.price)}</td><td>${{ entry: 'Entry', stop: 'Stop-loss hit', target: 'Take-profit hit' }[f.role] || f.role}</td>
        <td class="${cls(f.pnl)}">${f.pnl != null ? `${f.pnl >= 0 ? '+' : '−'}$${Math.abs(f.pnl).toFixed(2)}` : '—'}</td></tr>`).join('')}</table>`
      : '<div class="empty">No fills yet.</div>';
  } else if (pt.tab === 'eq') {
    html = a.equityCurve.length < 2 ? '<div class="empty">The equity curve fills in while the market is open.</div>' : '';
    if (!pt.eqChart && LWC) {
      pt.eqChart = LWC.createChart($('#ptEqChart'), { autoSize: true, layout: { background: { color: 'transparent' }, textColor: cssVar('--muted'), fontSize: 11 },
        grid: { vertLines: { visible: false }, horzLines: { color: 'rgba(255,255,255,0.04)' } }, timeScale: { timeVisible: true } });
      pt.eqLine = pt.eqChart.addAreaSeries({ lineColor: cssVar('--accent'), topColor: 'rgba(79,156,249,0.25)', bottomColor: 'rgba(79,156,249,0)', lineWidth: 2 });
    }
    if (pt.eqLine) {
      const pts = [];
      for (const p of a.equityCurve) {
        const t = Math.floor(p.t / 1000);
        if (!pts.length || t > pts.at(-1).time) pts.push({ time: t, value: p.v });
      }
      pt.eqLine.setData(pts);
    }
  }
  $('#ptTabBody').innerHTML = html;
}

function syncTicket() {
  const type = $('#ptType').value;
  $('#ptPriceRow').classList.toggle('hidden', type === 'market');
  $('#ptSL').classList.toggle('hidden', !$('#ptUseSL').checked);
  $('#ptTP').classList.toggle('hidden', !$('#ptUseTP').checked);
  $$('.pt-side button').forEach((b) => b.classList.toggle('on', b.dataset.side === pt.side));
  const btn = $('#ptSubmit');
  btn.className = `btn pt-submit ${pt.side}`;
  const qty = Math.floor(+$('#ptQty').value || 0);
  const q = pt.quotes[pt.sym];
  // While closed, a market order fills at the open, so estimate with the pre/after-market price.
  const px = type === 'market' ? (!pt.acct?.marketOpen && q?.ext?.last) || q?.last : +$('#ptPrice').value;
  btn.textContent = `${pt.side === 'buy' ? 'Buy' : 'Sell'} ${qty || ''} ${pt.sym} ${type === 'market' ? 'at market' : type === 'limit' ? `limit ${px ? money(px) : ''}` : `stop ${px ? money(px) : ''}`}`;
  let est = '';
  if (px && qty) {
    est += `Order value: <b>$${(px * qty).toLocaleString(undefined, { maximumFractionDigits: 0 })}</b>`;
    const sl = $('#ptUseSL').checked ? +$('#ptSL').value : 0;
    const tp = $('#ptUseTP').checked ? +$('#ptTP').value : 0;
    if (sl) est += `<br>Risk if stopped: <b class="down">$${(Math.abs(px - sl) * qty).toFixed(0)}</b>`;
    if (tp) est += `<br>Profit at target: <b class="up">$${(Math.abs(tp - px) * qty).toFixed(0)}</b>`;
    if (sl && tp) est += `<br>Reward : risk = <b>${(Math.abs(tp - px) / Math.abs(px - sl)).toFixed(1)} : 1</b>`;
    if (pt.acct) est += `<br>Buying power: $${pt.acct.buyingPower.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  $('#ptEst').innerHTML = est || 'Enter shares to see the order value and risk.';
  drawLines();
}

async function ptSetSymbol(sym) {
  sym = String(sym || '').toUpperCase().trim();
  if (!sym) return;
  pt.sym = sym;
  $('#ptSym').value = sym;
  const d = await radar.paper.watch([sym]);
  applyPaper(d);
  loadCandles();
}

function applyPaper(d) {
  if (!d) return;
  pt.acct = d.account;
  pt.quotes = d.quotes || pt.quotes;
  if (!$('#view-paper').classList.contains('hidden')) {
    renderAcct();
    renderQuoteHead();
    renderTabs();
    liveCandle(pt.quotes[pt.sym]);
    drawLines();
    syncTicket();
  }
}

// Open the paper-trading page with a ticket filled in (used by Trade ideas and Lookup).
function openPaper(prefill = {}) {
  showView('paper');
  pt.side = prefill.side || 'buy';
  $('#ptType').value = prefill.type || 'market';
  if (prefill.price) $('#ptPrice').value = prefill.price.toFixed(2);
  if (prefill.qty) $('#ptQty').value = prefill.qty;
  $('#ptUseSL').checked = !!prefill.stopLoss;
  $('#ptSL').value = prefill.stopLoss ? prefill.stopLoss.toFixed(2) : '';
  $('#ptUseTP').checked = !!prefill.takeProfit;
  $('#ptTP').value = prefill.takeProfit ? prefill.takeProfit.toFixed(2) : '';
  pt.note = prefill.note || '';
  $('#ptMsg').innerHTML = prefill.note ? `<span class="muted">Loaded from Trade ideas: ${esc(prefill.note)}. Check the levels, then place the order.</span>` : '';
  ptSetSymbol(prefill.symbol || pt.sym);
}

$('#ptSym').addEventListener('keydown', (e) => e.key === 'Enter' && ptSetSymbol(e.target.value));
$('#ptSym').addEventListener('change', (e) => ptSetSymbol(e.target.value));
$('#ptTf').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  pt.tf = b.dataset.tf;
  $$('#ptTf button').forEach((x) => x.classList.toggle('on', x === b));
  loadCandles();
});
$('#ptTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  pt.tab = b.dataset.t;
  $$('#ptTabs button').forEach((x) => x.classList.toggle('on', x === b));
  renderTabs();
});
$('.pt-side').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) { pt.side = b.dataset.side; syncTicket(); }
});
['#ptType', '#ptPrice', '#ptQty', '#ptUseSL', '#ptSL', '#ptUseTP', '#ptTP'].forEach((id) => $(id).addEventListener('input', syncTicket));
['#ptUseSL', '#ptUseTP', '#ptType'].forEach((id) => $(id).addEventListener('change', syncTicket));

$('#ptSubmit').addEventListener('click', async () => {
  const msg = $('#ptMsg');
  try {
    const d = await radar.paper.order({
      symbol: pt.sym, side: pt.side, qty: +$('#ptQty').value, type: $('#ptType').value, price: +$('#ptPrice').value || null,
      stopLoss: $('#ptUseSL').checked ? +$('#ptSL').value || null : null,
      takeProfit: $('#ptUseTP').checked ? +$('#ptTP').value || null : null, note: pt.note || '',
    });
    pt.note = '';
    applyPaper(d);
    const filled = d.account.fills[0];
    msg.innerHTML = d.account.marketOpen && filled && Date.now() - filled.at < 5000 && filled.symbol === pt.sym
      ? `<span class="msg-ok">Filled: ${filled.side} ${filled.qty} ${esc(filled.symbol)} at ${money(filled.price)}</span>`
      : `<span class="msg-ok">Order placed. ${d.account.marketOpen ? 'It fills when the price reaches your level.' : 'The market is closed, so it will fill at the open.'}</span>`;
  } catch (err) {
    msg.innerHTML = `<span class="msg-err">${esc(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))}</span>`;
  }
});

document.addEventListener('click', async (e) => {
  const c = e.target.closest('[data-ptclose]');
  const x = e.target.closest('[data-ptcancel]');
  const r = e.target.closest('#ptReset');
  const s = e.target.closest('[data-ptsym]');
  const idea = e.target.closest('[data-papertrade]');
  try {
    if (c) { e.stopPropagation(); applyPaper(await radar.paper.close(c.dataset.ptclose)); return; }
    if (x) { e.stopPropagation(); applyPaper(await radar.paper.cancel(+x.dataset.ptcancel)); return; }
    if (r) {
      const cash = prompt('Reset the paper account? This clears all positions, orders and history.\n\nStarting cash ($):', String(settingsCache?.accountSize || 10000));
      if (cash) applyPaper(await radar.paper.reset(+cash));
      return;
    }
    if (idea) {
      const t = (data.trades || []).find((x) => x.symbol === idea.dataset.papertrade);
      if (!t) return;
      const s2 = settingsCache || { accountSize: 10000, riskPct: 1 };
      const shares = Math.max(1, Math.floor(((s2.accountSize * s2.riskPct) / 100) / Math.abs(t.entry - t.stop)));
      openPaper({ symbol: t.symbol, side: t.dir === 'up' ? 'buy' : 'sell', qty: shares, type: 'market', stopLoss: t.stop, takeProfit: t.target, note: `${t.catalyst} (${t.horizon})` });
      return;
    }
    if (s) ptSetSymbol(s.dataset.ptsym);
  } catch (err) {
    $('#ptMsg').innerHTML = `<span class="msg-err">${esc(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))}</span>`;
  }
});

radar.paper.onUpdate(applyPaper);
