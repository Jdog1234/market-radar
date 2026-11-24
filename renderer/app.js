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
// Pro pages, locked for free users only when the paywall is switched on (cloud.json).
// Paper trading is free, limited to one chart and 5 open orders (FREE_ORDER_LIMIT in app-main.js).
const PRO_VIEWS = { before: 'Before the move', trades: 'Trade ideas', lookup: 'Stock lookup' };
let acct = { enabled: false, paywall: false, plan: 'free' };
const isPro = () => !acct.paywall || acct.plan === 'pro';
const locked = (name) => !isPro() && PRO_VIEWS[name];
const FREE_ORDERS = 5;
const PRO_PITCH = 'Pro unlocks Before the move, Trade ideas, Stock lookup, up to 4 charts at once and unlimited paper orders.';

function showView(name) {
  if (locked(name)) {
    $$('#nav button').forEach((x) => x.classList.toggle('active', x.dataset.view === name));
    $$('.view').forEach((v) => v.classList.add('hidden'));
    document.body.classList.remove('paper-mode');
    if (window.radar) radar.paper.watch([]);
    let lockView = $('#view-locked');
    if (!lockView) {
      lockView = document.createElement('section');
      lockView.id = 'view-locked';
      lockView.className = 'view';
      $('main').insertBefore(lockView, $('.disclaimer'));
    }
    lockView.classList.remove('hidden');
    lockView.innerHTML = `<div class="lock card"><h2>${esc(PRO_VIEWS[name])} is a Pro feature</h2>
      <p>${PRO_PITCH}</p>
      <div class="btns"><button class="btn" data-upgrade="month">Get Pro ($19/month)</button><button class="btn ghost" data-upgrade="year">Yearly ($190)</button><button class="btn ghost" data-goto="settings">I have a license key</button></div></div>`;
    return;
  }
  $('#view-locked')?.classList.add('hidden');
  $$('#nav button').forEach((x) => x.classList.toggle('active', x.dataset.view === name));
  $$('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${name}`));
  if (name === 'track') renderTrack();
  if (name === 'paper') enterPaper();
  else {
    document.body.classList.remove('paper-mode');
    if (window.radar) radar.paper.watch([]);
  }
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

// ---------- paper trading (TradingView-style workspace) ----------
const LWC = window.LightweightCharts;
const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem(`mr.${k}`);
      return v == null ? d : JSON.parse(v);
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(`mr.${k}`, JSON.stringify(v));
    } catch {}
  },
};
const TV = { bg: '#131722', line: '#2a2e39', text: '#d1d4dc', muted: '#787b86', up: '#089981', down: '#f23645', blue: '#2962ff', warn: '#f5a524' };
// '#rrggbb' + opacity → rgba(), for chart colors (the chart library doesn't read CSS variables).
const alpha = (hex, a) => {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
};

// ---- color themes (Settings → Appearance) ----
// base: app background + chart workspace; accent: buttons, highlights, buy side; candles: up/down.
const THEMES = {
  midnight: { name: 'Midnight', app: ['#0b0f14', '#121820', '#18202a', '#232d3a', '#e6edf3', '#8b98a8'], tv: ['#131722', '#1e222d', '#2a2e39', '#2a2e39', '#d1d4dc', '#787b86'] },
  tv: { name: 'Charcoal', app: ['#131722', '#1e222d', '#252a36', '#2a2e39', '#d1d4dc', '#868993'], tv: ['#131722', '#1e222d', '#2a2e39', '#2a2e39', '#d1d4dc', '#787b86'] },
  ocean: { name: 'Ocean', app: ['#08131f', '#0e1d2e', '#142740', '#1d3552', '#e3ecf7', '#8aa2bf'], tv: ['#0b1828', '#11233a', '#1c3350', '#183049', '#dbe6f3', '#7f95b3'] },
  forest: { name: 'Forest', app: ['#0a120e', '#101b15', '#16241c', '#22342a', '#e4efe8', '#8ea596'], tv: ['#0d1611', '#14211a', '#213328', '#1b2b22', '#dce8e0', '#82988a'] },
  plum: { name: 'Plum', app: ['#120c17', '#1b1322', '#231a2d', '#33263f', '#efe6f5', '#a596b2'], tv: ['#150f1b', '#1f1628', '#30243c', '#2a1f35', '#e8def0', '#9a8aa8'] },
  graphite: { name: 'Graphite', app: ['#111111', '#1a1a1a', '#222222', '#2e2e2e', '#ececec', '#9a9a9a'], tv: ['#151515', '#1d1d1d', '#2c2c2c', '#262626', '#dddddd', '#8a8a8a'] },
  light: { name: 'Light', light: true, app: ['#f3f5f8', '#ffffff', '#eceff4', '#d8dde5', '#131722', '#5d6673'], tv: ['#ffffff', '#f6f7f9', '#e0e3eb', '#eef0f4', '#131722', '#6a6d78'] },
};
const ACCENTS = { blue: '#2962ff', sky: '#4f9cf9', purple: '#7e57c2', teal: '#00a3a3', orange: '#f57c00', pink: '#e91e63', gold: '#d4a017' };
const CANDLES = {
  classic: { name: 'Teal / red', up: '#089981', down: '#f23645' },
  green: { name: 'Green / red', up: '#22c55e', down: '#ef4444' },
  cb: { name: 'Blue / orange (color-blind friendly)', up: '#2196f3', down: '#ff9800' },
  mono: { name: 'White / gray', up: '#e0e0e0', down: '#6b6b6b' },
};
const themePrefs = () => {
  let t = {};
  try {
    t = JSON.parse(localStorage.getItem('mr.theme') || '{}') || {};
  } catch {}
  return { base: THEMES[t.base] ? t.base : 'midnight', accent: /^#[0-9a-f]{6}$/i.test(t.accent || '') ? t.accent : ACCENTS.blue, candles: CANDLES[t.candles] ? t.candles : 'classic' };
};
function applyTheme(prefs = themePrefs()) {
  const th = THEMES[prefs.base];
  const c = CANDLES[prefs.candles];
  const r = document.documentElement.style;
  ['--bg', '--panel', '--panel2', '--line', '--text', '--muted'].forEach((k, i) => r.setProperty(k, th.app[i]));
  ['--tv-bg', '--tv-panel', '--tv-line', '--tv-hover', '--tv-text', '--tv-muted'].forEach((k, i) => r.setProperty(k, th.tv[i]));
  r.setProperty('--accent', prefs.accent);
  r.setProperty('--tv-blue', prefs.accent);
  // The light theme's candles need a little more depth to read on white.
  r.setProperty('--up', c.up);
  r.setProperty('--down', c.down);
  r.setProperty('--tv-up', c.up);
  r.setProperty('--tv-down', c.down);
  r.setProperty('--up-bg', alpha(c.up, 0.12));
  r.setProperty('--down-bg', alpha(c.down, 0.12));
  document.documentElement.style.colorScheme = th.light ? 'light' : 'dark';
  document.body.classList.toggle('light', !!th.light);
  Object.assign(TV, { bg: th.tv[0], line: th.tv[2], text: th.tv[4], muted: th.tv[5], up: c.up, down: c.down, blue: prefs.accent });
  if (applyTheme.live) rethemeCharts();
}
applyTheme();
applyTheme.live = true;
const TF_SEC = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600 };
const TF_LABEL = { '1m': '1m', '5m': '5m', '15m': '15m', '1h': '1h', D: '1D', W: '1W' };
const IND = {
  vol: { label: 'Volume' },
  vwap: { label: 'VWAP', color: '#f5a524', note: 'intraday' },
  ema9: { label: 'EMA 9', color: '#2962ff', kind: 'ema', len: 9 },
  ema21: { label: 'EMA 21', color: '#ab47bc', kind: 'ema', len: 21 },
  sma50: { label: 'SMA 50', color: '#26c6da', kind: 'sma', len: 50 },
  sma200: { label: 'SMA 200', color: '#ef6c00', kind: 'sma', len: 200 },
};
const pt = {
  sym: store.get('pt.sym', 'SPY'), tf: store.get('pt.tf', '5m'), ctype: store.get('pt.ctype', 'candles'),
  ind: { vol: true, vwap: false, ema9: false, ema21: false, sma50: false, sma200: false, ...store.get('pt.ind', {}) },
  side: 'buy', chart: null, main: null, vol: null, indSeries: {}, indData: {}, indDirty: false, bars: [], acct: null, quotes: {}, feed: null,
  tab: 'pos', eqChart: null, eqLine: null, loading: 0, note: '', tool: 'cursor', pending: null, mouse: null, drawings: [], hlineObjs: [],
  olines: [], olSig: '', drag: null, alerts: [], hoverPrice: null, sizeMode: store.get('pt.sizeMode', 'sh'), ticketPx: null, crosshair: false, dayVol: {}, raf: 0, canvasSig: '', panelDown: false,
};

const tick = (p) => (p >= 1 ? 0.01 : 0.0001);
const roundPx = (p) => +(Math.round(p / tick(p)) * tick(p)).toFixed(p >= 1 ? 2 : 4);
const fmtPx = (p) => (p == null ? '—' : p.toFixed(p >= 1 ? 2 : 4));
const fmtDiff = (d, ref) => (ref >= 1 ? d.toFixed(2) : d.toFixed(4)); // a price difference, in the price's decimals
const usd = (x) => `${x < 0 ? '−' : ''}$${Math.abs(x).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sgnUsd = (x) => `${x >= 0 ? '+' : '−'}$${Math.abs(x).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtVol = (v) => (v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(1)}K` : String(Math.round(v || 0)));
const errText = (err) => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '');
const paperVisible = () => !$('#view-paper').classList.contains('hidden');
const watchSyms = () => (settingsCache?.watchlist || []).map((x) => String(x).toUpperCase());

function toast(msg, err = false) {
  const t = $('#ptToast');
  t.textContent = msg;
  t.className = `tv-toast${err ? ' err' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.add('hidden'), err ? 5000 : 3000);
}

// ---- chart ----
// Colors every chart shares (re-applied when the theme changes).
const chartColors = (fontSize = 11) => ({
  layout: { background: { color: TV.bg }, textColor: TV.text, fontSize },
  grid: { vertLines: { color: alpha(TV.line, 0.55) }, horzLines: { color: alpha(TV.line, 0.55) } },
  timeScale: { borderColor: TV.line },
  rightPriceScale: { borderColor: TV.line },
  crosshair: { vertLine: { color: TV.muted, labelBackgroundColor: TV.line }, horzLine: { color: TV.muted, labelBackgroundColor: TV.line } },
});
const candleColors = () => ({ upColor: TV.up, downColor: TV.down, borderVisible: false, wickUpColor: TV.up, wickDownColor: TV.down });

function ensureChart() {
  if (pt.chart || !LWC) return;
  const base = chartColors();
  pt.chart = LWC.createChart($('#ptChart'), {
    ...base,
    autoSize: true,
    timeScale: { ...base.timeScale, timeVisible: true, secondsVisible: false, rightOffset: 8 },
    rightPriceScale: { ...base.rightPriceScale, scaleMargins: { top: 0.12, bottom: 0.08 } },
    crosshair: { ...base.crosshair, mode: LWC.CrosshairMode.Normal },
  });
  pt.vol = pt.chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
  pt.vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  makeMainSeries();
  pt.chart.subscribeCrosshairMove(onCrosshair);
  pt.chart.subscribeClick(onChartClick);
  setupChartMouse();
}

function makeMainSeries() {
  if (pt.main) {
    pt.chart.removeSeries(pt.main);
    pt.olines = [];
    pt.olSig = '';
    pt.hlineObjs = [];
  }
  const common = { priceLineColor: TV.muted, priceLineStyle: 2 };
  if (pt.ctype === 'line') pt.main = pt.chart.addLineSeries({ ...common, color: TV.blue, lineWidth: 2 });
  else if (pt.ctype === 'bars') pt.main = pt.chart.addBarSeries({ ...common, upColor: TV.up, downColor: TV.down, thinBars: false });
  else pt.main = pt.chart.addCandlestickSeries({ ...common, ...candleColors() });
  setMainData();
  drawHLines();
  buildOrderLines(true);
}

const mainPoint = (b) => (pt.ctype === 'line' ? { time: b.time, value: b.close } : { time: b.time, open: b.open, high: b.high, low: b.low, close: b.close });
const volPoint = (b) => ({ time: b.time, value: b.volume || 0, color: alpha(b.close >= b.open ? TV.up : TV.down, 0.45) });

function setMainData() {
  if (!pt.main) return;
  pt.main.setData(pt.bars.map(mainPoint));
  pt.vol.setData(pt.bars.map(volPoint));
  pt.vol.applyOptions({ visible: !!pt.ind.vol });
  updateIndicators();
}

async function loadCandles() {
  ensureChart();
  const seq = ++pt.loading;
  const sym = pt.sym;
  try {
    const { bars } = await radar.paper.candles(sym, pt.tf);
    if (seq !== pt.loading) return;
    pt.bars = bars;
    pt.dayVol[sym] = null;
    setMainData();
    resetView();
    liveCandle(pt.quotes[sym]);
    renderLegend();
  } catch {
    if (seq === pt.loading) toast(`Chart data unavailable for ${sym}.`, true);
  }
}

// A new stock or timeframe always starts framed on its own candles: dragging or zooming the
// price axis turns auto-scaling off, which would leave a $500 stock's candles off-screen on a
// chart still scaled for a $150 one.
function resetView() {
  if (!pt.main) return;
  pt.main.priceScale().applyOptions({ autoScale: true });
  pt.chart.timeScale().fitContent();
  const n = pt.bars.length;
  if (n > 150) pt.chart.timeScale().setVisibleLogicalRange({ from: n - 150, to: n + 8 });
}

// New York clock written as UTC seconds (matches the candle timestamps).
function nowEtAsUtc() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()) / 1000;
}

// Stream the live price (and the volume traded since the last tick) into the last candle.
function liveCandle(q) {
  if (!pt.main || !pt.bars.length || !q) return;
  const regular = pt.acct?.marketOpen && q.session !== 'pre' && q.session !== 'post';
  const price = regular ? q.last : q.ext?.last || q.last;
  if (!(price > 0)) return;
  let addVol = 0;
  if (regular && q.volume > 0) {
    const prev = pt.dayVol[pt.sym];
    if (prev != null && q.volume > prev) addVol = q.volume - prev;
    pt.dayVol[pt.sym] = q.volume;
  }
  let last = pt.bars.at(-1);
  const span = TF_SEC[pt.tf];
  if (span) {
    const now = nowEtAsUtc();
    const bucket = now - (now % span);
    if (bucket > last.time) {
      if (!regular && !q.ext) return; // nothing trading right now
      last = { time: bucket, open: last.close, high: Math.max(last.close, price), low: Math.min(last.close, price), close: price, volume: 0 };
      pt.bars.push(last);
    }
  } else if (!regular) return; // daily/weekly bars only move in regular hours
  last.close = price;
  last.high = Math.max(last.high, price);
  last.low = Math.min(last.low, price);
  last.volume = (last.volume || 0) + addVol;
  pt.main.update(mainPoint(last));
  pt.vol.update(volPoint(last));
  pt.indDirty = true;
  if (!pt.crosshair) renderLegend();
}

// ---- indicators ----
function sma(bars, n) {
  const out = [];
  let sum = 0;
  for (let i = 0; i < bars.length; i++) {
    sum += bars[i].close;
    if (i >= n) sum -= bars[i - n].close;
    if (i >= n - 1) out.push({ time: bars[i].time, value: sum / n });
  }
  return out;
}
function ema(bars, n) {
  const out = [];
  if (bars.length < n) return out;
  const k = 2 / (n + 1);
  let e = bars.slice(0, n).reduce((s, b) => s + b.close, 0) / n;
  out.push({ time: bars[n - 1].time, value: e });
  for (let i = n; i < bars.length; i++) {
    e = bars[i].close * k + e * (1 - k);
    out.push({ time: bars[i].time, value: e });
  }
  return out;
}
// VWAP resets every trading day (candle times are New York clock, so a UTC day = an ET day).
function vwap(bars) {
  const out = [];
  let day = null;
  let pv = 0;
  let v = 0;
  for (const b of bars) {
    const d = Math.floor(b.time / 86400);
    if (d !== day) {
      day = d;
      pv = 0;
      v = 0;
    }
    const vol = b.volume || 0;
    pv += ((b.high + b.low + b.close) / 3) * vol;
    v += vol;
    if (v > 0) out.push({ time: b.time, value: pv / v });
  }
  return out;
}

function updateIndicators() {
  if (!pt.chart) return;
  pt.indDirty = false;
  pt.vol.applyOptions({ visible: !!pt.ind.vol });
  for (const [key, cfg] of Object.entries(IND)) {
    if (key === 'vol') continue;
    const on = pt.ind[key] && (key !== 'vwap' || TF_SEC[pt.tf]);
    if (!on) {
      if (pt.indSeries[key]) pt.chart.removeSeries(pt.indSeries[key]);
      delete pt.indSeries[key];
      delete pt.indData[key];
      continue;
    }
    if (!pt.indSeries[key]) {
      pt.indSeries[key] = pt.chart.addLineSeries({ color: cfg.color, lineWidth: key === 'vwap' ? 2 : 1, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false });
    }
    const data = key === 'vwap' ? vwap(pt.bars) : cfg.kind === 'ema' ? ema(pt.bars, cfg.len) : sma(pt.bars, cfg.len);
    pt.indSeries[key].setData(data);
    pt.indData[key] = new Map(data.map((d) => [d.time, d.value]));
  }
}

function renderIndMenu() {
  $('#ptIndMenu').innerHTML = Object.entries(IND).map(([k, c]) => {
    const na = k === 'vwap' && !TF_SEC[pt.tf];
    return `<div class="mi${na ? ' off' : ''}" data-ind="${k}"><span class="ck">${pt.ind[k] ? '✓' : ''}</span>${c.color ? `<span class="sw" style="background:${c.color}"></span>` : '<span class="sw" style="background:#5d606b"></span>'}${c.label}${na ? '<span class="k">intraday only</span>' : ''}</div>`;
  }).join('');
}

// ---- legend (OHLC + volume under the crosshair, like TradingView) ----
function onCrosshair(param) {
  pt.crosshair = !!(param && param.time && param.point);
  renderLegend(pt.crosshair ? param.time : null);
  if (pt.tool === 'trend' && pt.pending && param?.point) pt.mouse = param.point;
  pt.hoverPrice = param?.point && pt.main ? pt.main.coordinateToPrice(param.point.y) : null;
}
function renderLegend(time = null) {
  const bars = pt.bars;
  if (!bars.length) {
    $('#ptLegend').innerHTML = `<div class="l1"><span class="nm">${esc(pt.sym)}</span><i>${TF_LABEL[pt.tf]}</i></div>`;
    return;
  }
  let i = bars.length - 1;
  if (time != null) {
    const j = bars.findIndex((b) => b.time === time);
    if (j >= 0) i = j;
  }
  const b = bars[i];
  const prev = bars[i - 1]?.close ?? b.open;
  const ch = b.close - prev;
  const c = ch >= 0 ? 'up' : 'down';
  const q = pt.quotes[pt.sym];
  const ind = Object.entries(IND).filter(([k]) => k !== 'vol' && pt.indData[k])
    .map(([k, cfg]) => `<span style="color:${cfg.color}">${cfg.label} ${fmtPx(pt.indData[k].get(b.time) ?? NaN)}</span>`).join('');
  $('#ptLegend').innerHTML = `<div class="l1"><span class="nm">${esc(pt.sym)}</span><i>${TF_LABEL[pt.tf]}</i>${q?.name ? `<i>${esc(q.name)}</i>` : ''}
    <span>O <b class="${c}">${fmtPx(b.open)}</b></span><span>H <b class="${c}">${fmtPx(b.high)}</b></span><span>L <b class="${c}">${fmtPx(b.low)}</b></span><span>C <b class="${c}">${fmtPx(b.close)}</b></span>
    <span class="${c}">${ch >= 0 ? '+' : ''}${fmtDiff(ch, b.close)} (${ch >= 0 ? '+' : ''}${((ch / prev) * 100).toFixed(2)}%)</span>${pt.ind.vol ? `<span>Vol <b>${fmtVol(b.volume)}</b></span>` : ''}</div>
    ${ind ? `<div class="ind">${ind.replace('NaN', '—')}</div>` : ''}`;
}

// ---- bid / ask buttons and quote header ----
function bidAsk(q) {
  if (q && q.bid > 0 && q.ask >= q.bid) return { bid: q.bid, ask: q.ask };
  const p = q?.last;
  return p ? { bid: null, ask: null, last: p } : null;
}
function renderQuick() {
  const ba = bidAsk(pt.quotes[pt.sym]);
  $('#ptBid').textContent = ba?.bid ? fmtPx(ba.bid) : ba?.last ? fmtPx(ba.last) : '—';
  $('#ptAsk').textContent = ba?.ask ? fmtPx(ba.ask) : ba?.last ? fmtPx(ba.last) : '—';
  $('#ptSpread').textContent = ba?.bid ? fmtDiff(ba.ask - ba.bid, ba.ask) : '—';
  $('#ptTicketQuote').textContent = ba?.bid ? `${fmtPx(ba.bid)} × ${fmtPx(ba.ask)}` : ba?.last ? `Last ${fmtPx(ba.last)}` : '';
}
function renderQuoteHead() {
  const q = pt.quotes[pt.sym];
  if (!q) return ($('#ptQuote').innerHTML = `<span class="muted">Loading ${esc(pt.sym)}…</span>`);
  $('#ptQuote').innerHTML = `<b>${money(q.last)}</b><span class="${cls(q.changePct)}">${q.change != null ? `${q.change >= 0 ? '+' : ''}${q.change.toFixed(2)} ` : ''}${pct(q.changePct, 2)}</span>
    ${q.ext ? `<span class="muted small">${q.ext.type === 'PRE_MKT' ? 'Pre' : 'Post'} <b class="${cls(q.ext.changePct)}" style="font-size:13px">${money(q.ext.last)}</b></span>` : ''}`;
}
function renderFeed() {
  const f = pt.feed;
  const a = pt.acct;
  $('#ptFeed').innerHTML = f?.mode === 'stream'
    ? '<i class="live"></i>Live · streaming'
    : `<i class="poll"></i>${f ? 'Polling (stream reconnecting)' : 'Connecting…'}`;
  $('#ptMkt').innerHTML = a ? `<i style="background:${a.marketOpen ? TV.up : TV.muted}"></i>${a.marketOpen ? 'Market open' : 'Market closed · orders fill at the open'}` : '';
}

// ---- order / position lines (draggable, with × to cancel) ----
function orderLineDefs() {
  const a = pt.acct;
  const defs = [];
  if (!a) return defs;
  const pos = a.positions.find((p) => p.symbol === pt.sym);
  if (pos) {
    defs.push({ key: 'pos', price: pos.avg, color: TV.blue, k: `${pos.qty > 0 ? 'LONG' : 'SHORT'} ${Math.abs(pos.qty)}`, v: () => sgnUsd(posPnl(pos)), vColor: () => (posPnl(pos) >= 0 ? TV.up : TV.down), x: () => radar.paper.close(pt.sym), solid: true });
  }
  for (const o of a.orders.filter((x) => x.symbol === pt.sym)) {
    const ifHit = (price) => (pos ? (price - pos.avg) * Math.min(o.qty, Math.abs(pos.qty)) * Math.sign(pos.qty) : null);
    if (o.role === 'stop' || o.role === 'target') {
      const sl = o.role === 'stop';
      defs.push({
        key: `o${o.id}`, price: o.price, color: sl ? TV.down : TV.up, k: `${sl ? 'SL' : 'TP'} ${o.qty}`,
        v: (p) => (pos ? sgnUsd(ifHit(p)) : fmtPx(p)), drag: (p) => radar.paper.modify(o.id, { price: p }), x: () => radar.paper.cancel(o.id),
      });
    } else if (o.type !== 'market') {
      const buy = o.side === 'buy';
      defs.push({
        key: `o${o.id}`, price: o.price, color: buy ? TV.blue : TV.down, k: `${buy ? 'BUY' : 'SELL'} ${o.type === 'limit' ? 'LMT' : 'STP'} ${o.qty}`,
        v: (p) => fmtPx(p), drag: (p) => radar.paper.modify(o.id, { price: p }), x: () => radar.paper.cancel(o.id),
      });
      const ref = o.price;
      if (o.stopLoss) defs.push({ key: `o${o.id}sl`, price: o.stopLoss, color: TV.down, k: `SL ${o.qty}`, v: (p) => sgnUsd((p - ref) * o.qty * (buy ? 1 : -1)), drag: (p) => radar.paper.modify(o.id, { stopLoss: p }), x: () => radar.paper.modify(o.id, { stopLoss: null }) });
      if (o.takeProfit) defs.push({ key: `o${o.id}tp`, price: o.takeProfit, color: TV.up, k: `TP ${o.qty}`, v: (p) => sgnUsd((p - ref) * o.qty * (buy ? 1 : -1)), drag: (p) => radar.paper.modify(o.id, { takeProfit: p }), x: () => radar.paper.modify(o.id, { takeProfit: null }) });
    } else {
      // A market order waiting for the open: show its bracket (not draggable until it fills).
      if (o.stopLoss) defs.push({ key: `o${o.id}sl`, price: o.stopLoss, color: TV.down, k: `SL ${o.qty} (at open)`, v: (p) => fmtPx(p), x: () => radar.paper.modify(o.id, { stopLoss: null }) });
      if (o.takeProfit) defs.push({ key: `o${o.id}tp`, price: o.takeProfit, color: TV.up, k: `TP ${o.qty} (at open)`, v: (p) => fmtPx(p), x: () => radar.paper.modify(o.id, { takeProfit: null }) });
    }
  }
  // Price alerts (drag to move, × to delete).
  for (const al of pt.alerts.filter((x) => x.symbol === pt.sym && !x.firedAt)) {
    defs.push({
      key: `al${al.id}`, price: al.price, color: TV.warn, k: `ALERT ${al.dir === 'above' ? '↑' : '↓'}`, v: (p) => fmtPx(p), dashed: true,
      drag: async (p) => {
        const d = await radar.paper.addAlert({ symbol: al.symbol, price: p, note: al.note });
        return radar.paper.removeAlert(al.id).then(() => d);
      },
      x: () => radar.paper.removeAlert(al.id),
    });
  }
  // The ticket's levels before the order is sent (drag to adjust, × to clear).
  const type = $('#ptType').value;
  const tp = +$('#ptPrice').value;
  const ghost = (c) => `${c}99`;
  if (type !== 'market' && tp > 0) {
    defs.push({ key: 'tk', price: tp, color: ghost(pt.side === 'buy' ? TV.blue : TV.down), k: `TICKET ${pt.side === 'buy' ? 'BUY' : 'SELL'} ${type === 'limit' ? 'LMT' : 'STP'}`, v: (p) => fmtPx(p), dashed: true, drag: (p) => setTicket('#ptPrice', p), x: () => setTicketType('market') });
  }
  if ($('#ptUseSL').checked && +$('#ptSL').value) defs.push({ key: 'tksl', price: +$('#ptSL').value, color: ghost(TV.down), k: 'TICKET SL', v: (p) => fmtPx(p), dashed: true, drag: (p) => setTicket('#ptSL', p), x: () => { $('#ptUseSL').checked = false; syncTicket(); } });
  if ($('#ptUseTP').checked && +$('#ptTP').value) defs.push({ key: 'tktp', price: +$('#ptTP').value, color: ghost(TV.up), k: 'TICKET TP', v: (p) => fmtPx(p), dashed: true, drag: (p) => setTicket('#ptTP', p), x: () => { $('#ptUseTP').checked = false; syncTicket(); } });
  return defs;
}
function posPnl(pos) {
  const q = pt.quotes[pos.symbol];
  const last = (q?.session === 'regular' || pt.acct?.marketOpen ? q?.last : null) || pos.last;
  return (last - pos.avg) * pos.qty;
}
function setTicket(sel, p) {
  $(sel).value = fmtPx(p);
  syncTicket();
}

// Rebuild the lines when the set of orders changes; otherwise only refresh text/positions.
function buildOrderLines(force = false) {
  if (!pt.main || pt.drag) return;
  const defs = orderLineDefs();
  const sig = defs.map((d) => `${d.key}:${d.price}:${d.k}:${d.color}`).join('|');
  if (!force && sig === pt.olSig) {
    for (const ol of pt.olines) {
      const d = defs.find((x) => x.key === ol.key);
      if (d) Object.assign(ol, { v: d.v, vColor: d.vColor, drag: d.drag, x: d.x });
    }
    refreshLineText();
    return;
  }
  for (const ol of pt.olines) {
    try {
      pt.main.removePriceLine(ol.pl);
    } catch {}
  }
  pt.olSig = sig;
  const host = $('#ptOverlay');
  host.innerHTML = '';
  pt.olines = defs.map((d) => {
    const pl = pt.main.createPriceLine({ price: d.price, color: d.color, lineWidth: 1, lineStyle: d.solid ? 0 : d.dashed ? 3 : 2, axisLabelVisible: true, title: '' });
    const el = document.createElement('div');
    el.className = `ol${d.drag ? ' drag' : ''}`;
    el.dataset.key = d.key;
    el.style.setProperty('--c', d.color.length > 7 ? d.color.slice(0, 7) : d.color);
    el.innerHTML = `<div class="tag"><span class="k"></span><span class="v"></span><span class="x" title="${d.key === 'pos' ? 'Close position' : 'Cancel'}">×</span></div>`;
    host.appendChild(el);
    return { ...d, pl, el };
  });
  refreshLineText();
  positionOverlay();
}
function refreshLineText() {
  for (const ol of pt.olines) {
    $('.k', ol.el).textContent = ol.k;
    const v = $('.v', ol.el);
    v.textContent = ol.v(ol.price);
    v.style.color = ol.vColor ? ol.vColor() : '';
  }
}
function positionOverlay() {
  if (!pt.main) return;
  const w = $('#ptChartWrap').clientWidth;
  const scaleW = pt.chart.priceScale('right').width();
  for (const ol of pt.olines) {
    const y = pt.main.priceToCoordinate(ol.price);
    if (y == null || y < -10) {
      ol.el.style.display = 'none';
      continue;
    }
    ol.el.style.display = '';
    ol.el.style.top = `${y}px`;
    ol.el.style.width = `${w - scaleW}px`;
  }
  // Tags sit near the price scale; ones at nearly the same price are nudged apart sideways.
  const vis = pt.olines.filter((o) => o.el.style.display !== 'none').map((o) => ({ o, y: parseFloat(o.el.style.top) })).sort((a, b) => a.y - b.y);
  let right = 80;
  for (let i = 0; i < vis.length; i++) {
    right = i > 0 && Math.abs(vis[i].y - vis[i - 1].y) < 20 ? right + vis[i - 1].o.el.firstChild.offsetWidth + 8 : 80;
    vis[i].o.el.firstChild.style.right = `${right}px`;
  }
}

// ---- drawings (stored per symbol) ----
const drawKey = () => `pt.draw.${pt.sym}`;
function loadDrawings() {
  pt.drawings = store.get(drawKey(), []);
  drawHLines();
  pt.canvasSig = '';
}
function saveDrawings() {
  store.set(drawKey(), pt.drawings);
  drawHLines();
  pt.canvasSig = '';
}
function drawHLines() {
  if (!pt.main) return;
  for (const h of pt.hlineObjs) {
    try {
      pt.main.removePriceLine(h);
    } catch {}
  }
  pt.hlineObjs = pt.drawings.filter((d) => d.t === 'h').map((d) => pt.main.createPriceLine({ price: d.p, color: TV.text, lineWidth: 1, lineStyle: 0, axisLabelVisible: true, title: '' }));
}
// Bar time ↔ logical index (with extrapolation past either end), so drawings survive timeframe changes.
function barSpan() {
  const b = pt.bars;
  return TF_SEC[pt.tf] || (b.length > 1 ? (b.at(-1).time - b[0].time) / (b.length - 1) : 86400);
}
function timeToLogical(t) {
  const b = pt.bars;
  if (!b.length) return null;
  if (t >= b.at(-1).time) return b.length - 1 + (t - b.at(-1).time) / barSpan();
  if (t <= b[0].time) return (t - b[0].time) / barSpan();
  let lo = 0;
  let hi = b.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (b[m].time <= t) lo = m;
    else hi = m;
  }
  return lo + (t - b[lo].time) / (b[hi].time - b[lo].time);
}
function logicalToTime(l) {
  const b = pt.bars;
  if (!b.length) return null;
  if (l >= b.length - 1) return b.at(-1).time + (l - (b.length - 1)) * barSpan();
  if (l <= 0) return b[0].time + l * barSpan();
  const i = Math.floor(l);
  return b[i].time + (l - i) * (b[i + 1].time - b[i].time);
}
function pointToTP(pt2) {
  const l = pt.chart.timeScale().coordinateToLogical(pt2.x);
  const p = pt.main.coordinateToPrice(pt2.y);
  if (l == null || p == null) return null;
  return { time: logicalToTime(l), price: p };
}
function tpToPoint(a) {
  const l = timeToLogical(a.time);
  if (l == null) return null;
  const x = pt.chart.timeScale().logicalToCoordinate(l);
  const y = pt.main.priceToCoordinate(a.price);
  return x == null || y == null ? null : { x, y };
}
function drawCanvas() {
  const cv = $('#ptDrawCanvas');
  const wrap = $('#ptChartWrap');
  const w = wrap.clientWidth;
  const h = wrap.clientHeight;
  const trends = pt.drawings.filter((d) => d.t === 'tl');
  const ts = pt.chart.timeScale();
  const range = ts.getVisibleLogicalRange();
  const sig = [w, h, range?.from, range?.to, pt.main.priceToCoordinate(100), pt.main.priceToCoordinate(1), trends.length, pt.pending ? `${pt.mouse?.x},${pt.mouse?.y}` : '', pt.bars.length].join(',');
  if (sig === pt.canvasSig) return;
  pt.canvasSig = sig;
  const dpr = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    cv.style.width = `${w}px`;
    cv.style.height = `${h}px`;
  }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const paneW = w - pt.chart.priceScale('right').width();
  const paneH = h - ts.height();
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, paneW, paneH);
  ctx.clip();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = TV.blue;
  const seg = (p1, p2) => {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    for (const p of [p1, p2]) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = TV.bg;
      ctx.fill();
      ctx.stroke();
    }
  };
  for (const d of trends) {
    const p1 = tpToPoint(d.a);
    const p2 = tpToPoint(d.b);
    if (p1 && p2) seg(p1, p2);
  }
  if (pt.pending && pt.mouse) {
    const p1 = tpToPoint(pt.pending);
    if (p1) {
      ctx.setLineDash([4, 4]);
      seg(p1, pt.mouse);
      ctx.setLineDash([]);
    }
  }
  ctx.restore();
}

function setTool(tool) {
  if (tool === 'clear') {
    if (pt.drawings.length && confirm(`Delete all drawings on ${pt.sym}?`)) {
      pt.drawings = [];
      saveDrawings();
    }
    tool = 'cursor';
  }
  pt.tool = tool;
  pt.pending = null;
  $$('#ptDrawBar button').forEach((b) => b.classList.toggle('on', b.dataset.tool === tool));
  $('#ptChartWrap').classList.toggle('cross', tool !== 'cursor');
  pt.canvasSig = '';
}

function onChartClick(param) {
  if (!param?.point || pt.tool === 'cursor') return;
  const at = pointToTP(param.point);
  if (!at) return;
  if (pt.tool === 'hline') {
    pt.drawings.push({ t: 'h', p: roundPx(at.price) });
    saveDrawings();
    setTool('cursor');
  } else if (pt.tool === 'trend') {
    if (!pt.pending) {
      pt.pending = at;
      pt.mouse = param.point;
    } else {
      pt.drawings.push({ t: 'tl', a: pt.pending, b: at });
      saveDrawings();
      setTool('cursor');
    }
  }
}

// ---- dragging lines, hover cursor, right-click menu ----
function lineNear(y, x) {
  const paneW = $('#ptChartWrap').clientWidth - pt.chart.priceScale('right').width();
  if (x > paneW) return null;
  let best = null;
  for (const ol of pt.olines) {
    if (!ol.drag) continue;
    const ly = pt.main.priceToCoordinate(ol.price);
    if (ly != null && Math.abs(ly - y) <= 5 && (!best || Math.abs(ly - y) < best.d)) best = { ol, d: Math.abs(ly - y) };
  }
  return best?.ol || null;
}
function setupChartMouse() {
  const wrap = $('#ptChartWrap');
  const rel = (e) => {
    const r = wrap.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  // Capture phase: runs before the chart's own handlers, so a drag doesn't also pan the chart.
  wrap.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const xEl = e.target.closest('.ol .x');
    if (xEl) return;
    const tagEl = e.target.closest('.ol');
    const p = rel(e);
    const ol = tagEl ? pt.olines.find((o) => o.key === tagEl.dataset.key && o.drag) : pt.tool === 'cursor' ? lineNear(p.y, p.x) : null;
    if (!ol) return;
    e.preventDefault();
    e.stopPropagation();
    pt.chart.applyOptions({ handleScroll: false, handleScale: false });
    pt.drag = { ol, from: ol.price, moved: false };
    ol.el.classList.add('dragging');
  }, true);
  window.addEventListener('mousemove', (e) => {
    if (!pt.drag) return;
    const p = rel(e);
    const price = pt.main.coordinateToPrice(Math.max(0, Math.min(p.y, wrap.clientHeight - pt.chart.timeScale().height())));
    if (price == null || price <= 0) return;
    const ol = pt.drag.ol;
    ol.price = roundPx(price);
    pt.drag.moved = pt.drag.moved || ol.price !== pt.drag.from;
    ol.pl.applyOptions({ price: ol.price });
    refreshLineText();
    positionOverlay();
  });
  window.addEventListener('mouseup', async () => {
    if (!pt.drag) return;
    const { ol, from, moved } = pt.drag;
    pt.drag = null;
    ol.el.classList.remove('dragging');
    pt.chart.applyOptions({ handleScroll: true, handleScale: true });
    if (!moved) return;
    try {
      const d = await ol.drag(ol.price);
      if (d?.account) applyPaper(d);
      if (!ol.key.startsWith('tk')) toast(`Moved to ${fmtPx(ol.price)}`);
    } catch (err) {
      ol.price = from;
      ol.pl.applyOptions({ price: from });
      toast(errText(err), true);
      buildOrderLines(true);
    }
  });
  wrap.addEventListener('mousemove', (e) => {
    if (pt.drag) return;
    const p = rel(e);
    if (pt.tool === 'trend' && pt.pending) {
      pt.mouse = p;
      pt.canvasSig = '';
    }
    wrap.classList.toggle('ns', pt.tool === 'cursor' && !!(e.target.closest('.ol.drag') || lineNear(p.y, p.x)));
  });
  $('#ptOverlay').addEventListener('click', async (e) => {
    const x = e.target.closest('.ol .x');
    if (!x) return;
    const ol = pt.olines.find((o) => o.key === x.closest('.ol').dataset.key);
    try {
      const d = await ol?.x();
      if (d?.account) applyPaper(d);
    } catch (err) {
      toast(errText(err), true);
    }
  });
  wrap.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const p = rel(e);
    if (p.y < 0 || p.y > wrap.clientHeight - pt.chart.timeScale().height() || p.x > wrap.clientWidth - pt.chart.priceScale('right').width()) return;
    const raw = pt.main.coordinateToPrice(p.y);
    if (raw == null || raw <= 0) return;
    showCtx(p, roundPx(raw));
  });
  document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#ptCtx')) $('#ptCtx').classList.add('hidden');
    if (!e.target.closest('.tv-menuwrap')) $('#ptIndMenu').classList.add('hidden');
  });
}

// Right-click on a chart with an open position: put its stop-loss or take-profit at that price.
function positionCtx(price) {
  const pos = pt.acct?.positions.find((x) => x.symbol === pt.sym);
  const last = pt.quotes[pt.sym]?.last;
  if (!pos || !last) return '';
  const long = pos.qty > 0;
  const slOk = long ? price < last : price > last;
  return `<div class="msep"></div>${slOk ? `<div class="mi sell" data-ctx="psl:${price}">Set stop-loss @ ${fmtPx(price)}</div>` : `<div class="mi buy" data-ctx="ptp:${price}">Set take-profit @ ${fmtPx(price)}</div>`}`;
}
function showCtx(p, price) {
  const q = pt.quotes[pt.sym];
  const ba = bidAsk(q);
  const ask = ba?.ask || ba?.last;
  const bid = ba?.bid || ba?.last;
  const qty = Math.max(1, Math.floor(+$('#ptQty').value || 1));
  const item = (side, type, ok) => `<div class="mi ${side}${ok ? '' : ' off'}" ${ok ? `data-ctx="${side}:${type}:${price}"` : ''}><b>${side === 'buy' ? 'Buy' : 'Sell'}</b> ${qty} ${esc(pt.sym)} @ ${fmtPx(price)} ${type}</div>`;
  const m = $('#ptCtx');
  m.innerHTML = (ask ? item('buy', 'limit', price < ask) + item('buy', 'stop', price > ask) + item('sell', 'limit', price > bid) + item('sell', 'stop', price < bid) : '<div class="mi off">No live price yet</div>') +
    `<div class="msep"></div><div class="mi" data-ctx="ticket:${price}">Use ${fmtPx(price)} in the order ticket</div><div class="mi" data-ctx="alert:${price}">🔔 Add alert @ ${fmtPx(price)}</div><div class="mi" data-ctx="hline:${price}">Draw horizontal line @ ${fmtPx(price)}</div>` +
    positionCtx(price);
  m.classList.remove('hidden');
  const wrap = $('#ptChartWrap');
  m.style.left = `${Math.max(4, Math.min(p.x, wrap.clientWidth - m.offsetWidth - 8))}px`;
  m.style.top = `${Math.max(4, Math.min(p.y, wrap.clientHeight - m.offsetHeight - 8))}px`;
}
$('#ptCtx').addEventListener('click', async (e) => {
  const it = e.target.closest('[data-ctx]');
  if (!it) return;
  $('#ptCtx').classList.add('hidden');
  const parts = it.dataset.ctx.split(':');
  if (parts[0] === 'hline') {
    pt.drawings.push({ t: 'h', p: +parts[1] });
    return saveDrawings();
  }
  if (['alert', 'psl', 'ptp'].includes(parts[0])) {
    try {
      const px = +parts[1];
      const d = parts[0] === 'alert' ? await radar.paper.addAlert({ symbol: pt.sym, price: px }) : await radar.paper.protect(pt.sym, parts[0] === 'psl' ? { stopLoss: px } : { takeProfit: px });
      applyPaper(d);
      toast(parts[0] === 'alert' ? `Alert set: ${pt.sym} @ ${fmtPx(px)}` : `${parts[0] === 'psl' ? 'Stop-loss' : 'Take-profit'} set @ ${fmtPx(px)}`);
    } catch (err) {
      toast(errText(err), true);
    }
    return;
  }
  if (parts[0] === 'ticket') {
    setTicketType($('#ptType').value === 'market' ? 'limit' : $('#ptType').value);
    return setTicket('#ptPrice', +parts[1]);
  }
  const [side, type, price] = parts;
  try {
    const d = await radar.paper.order({ symbol: pt.sym, side, qty: Math.max(1, Math.floor(+$('#ptQty').value || 1)), type, price: +price });
    applyPaper(d);
    toast(`${side === 'buy' ? 'Buy' : 'Sell'} ${type} placed @ ${fmtPx(+price)}`);
  } catch (err) {
    toast(errText(err), true);
  }
});

// Keep overlays glued to the chart while it scrolls/zooms (cheap: a handful of elements).
function frame() {
  pt.raf = 0;
  if (!paperVisible() || !pt.chart) return;
  positionOverlay();
  drawCanvas();
  if (pt.indDirty && !(frame.n++ % 30)) {
    updateIndicators();
    if (!pt.crosshair) renderLegend();
  }
  pt.raf = requestAnimationFrame(frame);
}
frame.n = 0;
const startFrames = () => !pt.raf && (pt.raf = requestAnimationFrame(frame));

// ---- watchlist (right column) ----
function renderWatch() {
  const list = watchSyms();
  $('#ptWatch').innerHTML = list.map((s) => `<div class="tv-wrow${s === pt.sym ? ' on' : ''}" data-wsym="${esc(s)}"><b>${esc(s)}</b><span class="l"></span><span class="c"></span><span class="cp"></span><span class="rm" title="Remove">×</span></div>`).join('')
    || '<div class="muted small" style="padding:10px">Add symbols above, or in Settings.</div>';
  for (const s of list) updateWatchRow(s);
}
function updateWatchRow(sym) {
  const row = $(`#ptWatch [data-wsym="${CSS.escape(sym)}"]`);
  const q = pt.quotes[sym];
  if (!row || !q) return;
  const price = q.session && q.session !== 'regular' && q.ext ? q.ext.last : q.last;
  const l = $('.l', row);
  const prev = +l.dataset.v || 0;
  l.textContent = fmtPx(price);
  l.dataset.v = price;
  if (prev && price !== prev) {
    l.classList.remove('flash-up', 'flash-down');
    void l.offsetWidth;
    l.classList.add(price > prev ? 'flash-up' : 'flash-down');
  }
  const c = $('.c', row);
  c.textContent = q.change != null ? `${q.change >= 0 ? '+' : ''}${q.change.toFixed(2)}` : '';
  c.className = `c ${cls(q.changePct)}`;
  const cp = $('.cp', row);
  cp.textContent = pct(q.changePct, 2);
  cp.className = `cp ${cls(q.changePct)}`;
}
async function saveWatch(list) {
  await radar.saveSettings({ watchlist: list });
  settingsCache = await radar.getSettings();
  const f = $('#settingsForm');
  if (f) f.watchlist.value = settingsCache.watchlist.join(' ');
  renderWatch();
  applyPaper(await radar.paper.watch([pt.sym, ...watchSyms()]));
}
$('#ptWatch').addEventListener('click', (e) => {
  const row = e.target.closest('[data-wsym]');
  if (!row) return;
  if (e.target.closest('.rm')) saveWatch(watchSyms().filter((s) => s !== row.dataset.wsym));
  else ptSetSymbol(row.dataset.wsym);
});
$('#ptWatchAdd').addEventListener('keydown', (e) => {
  if (e.key !== 'Enter') return;
  const sym = e.target.value.trim().toUpperCase();
  e.target.value = '';
  if (sym && !watchSyms().includes(sym)) saveWatch([...watchSyms(), sym]);
});

// ---- bottom panel: account manager ----
function renderAcct() {
  const a = pt.acct;
  if (!a) return;
  const it = (label, val, c = '', opt = false) => `<span class="${opt ? 'opt' : ''}">${label}<b class="${c}">${val}</b></span>`;
  $('#ptAcct').innerHTML = it('Equity', usd(a.equity)) + it('Open P&L', sgnUsd(a.unrealized), cls(a.unrealized)) +
    it('Total', `${sgnUsd(a.totalPnl)} (${pct(a.totalPct, 2)})`, cls(a.totalPnl)) + it('Buying power', usd(a.buyingPower), '', true);
  const n = (t, k) => `${t}${k ? `<span class="n">${k}</span>` : ''}`;
  const labels = { pos: n('Positions', a.positions.length), ord: n('Orders', a.orders.length), hist: 'History', alerts: n('Alerts', pt.alerts.filter((x) => !x.firedAt).length), acct: 'Account' };
  $$('#ptTabs button').forEach((b) => (b.innerHTML = labels[b.dataset.t]));
}

const when = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
function renderTabs() {
  const a = pt.acct;
  if (!a || pt.panelDown) return;
  $('#ptAcctTab').classList.toggle('hidden', pt.tab !== 'acct');
  $('#ptTabBody').classList.toggle('hidden', pt.tab === 'acct');
  const bracketOf = (sym, role) => {
    const o = a.orders.find((x) => x.symbol === sym && x.role === role);
    return o ? `${fmtPx(o.price)}${o.trail ? ` <span class="muted small">trailing ${fmtPx(o.trail)}</span>` : ''}` : '';
  };
  const bulk = `<div class="pt-bulk">${a.positions.length ? '<button class="x" data-bulk="closeAll">Close all positions</button>' : ''}${a.orders.length ? '<button class="x" data-bulk="cancelAll">Cancel all orders</button>' : ''}</div>`;
  let html = '';
  if (pt.tab === 'pos') {
    html = a.positions.length ? `<table class="mini"><tr><th>Symbol</th><th>Side</th><th>Qty</th><th>Avg fill</th><th>Last</th><th>Market value</th><th>Unrealized P&L</th><th>Stop-loss</th><th>Take-profit</th><th></th></tr>
      ${a.positions.map((p) => {
        const pnl = posPnl(p);
        return `<tr class="clk" data-ptsym="${esc(p.symbol)}"><td><b>${esc(p.symbol)}</b>${p.note ? ` <span class="muted small">${esc(p.note)}</span>` : ''}</td>
        <td class="${p.qty > 0 ? 'up' : 'down'}">${p.qty > 0 ? 'Long' : 'Short'}</td><td>${Math.abs(p.qty)}</td><td>${fmtPx(p.avg)}</td><td>${fmtPx(pnl / p.qty + p.avg)}</td>
        <td>${usd(Math.abs(p.qty * (pnl / p.qty + p.avg)))}</td><td class="${cls(pnl)}">${sgnUsd(pnl)} (${pct((pnl / Math.abs(p.avg * p.qty)) * 100, 2)})</td>
        <td>${bracketOf(p.symbol, 'stop') || '—'}</td><td>${bracketOf(p.symbol, 'target') || '—'}</td>
        <td><div class="pt-acts"><button class="x" data-pact="be:${esc(p.symbol)}" title="Move the stop-loss to your average price">Breakeven</button><button class="x" data-pact="trail:${esc(p.symbol)}" title="A stop-loss that follows the price">Trail</button><button class="x" data-pact="rev:${esc(p.symbol)}" title="Close and open the opposite position at market">Reverse</button><button class="x" data-ptclose="${esc(p.symbol)}">Close</button></div></td></tr>`;
      }).join('')}</table>${bulk}`
      : '<div class="empty">No open positions. Use BUY / SELL on the chart, the order panel, or "Paper trade this" on a Trade idea.</div>';
  } else if (pt.tab === 'ord') {
    html = a.orders.length ? `<table class="mini"><tr><th>#</th><th>Symbol</th><th>Side</th><th>Type</th><th>Qty</th><th>Price</th><th>Role</th><th>Bracket</th><th>Placed</th><th></th></tr>
      ${a.orders.map((o) => `<tr class="clk" data-ptsym="${esc(o.symbol)}"><td>${o.id}</td><td><b>${esc(o.symbol)}</b></td><td class="${o.side === 'buy' ? 'up' : 'down'}">${o.side === 'buy' ? 'Buy' : 'Sell'}</td><td>${o.type}</td><td>${o.qty}</td>
        <td>${o.price ? fmtPx(o.price) : 'market'}</td><td>${{ entry: 'Entry', stop: 'Stop-loss', target: 'Take-profit' }[o.role]}</td>
        <td>${o.stopLoss || o.takeProfit ? `${o.stopLoss ? `SL ${fmtPx(o.stopLoss)}` : ''} ${o.takeProfit ? `TP ${fmtPx(o.takeProfit)}` : ''}` : '—'}</td>
        <td>${when(o.createdAt)}</td><td><button class="x" data-ptcancel="${o.id}">Cancel</button></td></tr>`).join('')}</table>${bulk}`
      : '<div class="empty">No working orders. Right-click the chart to place a limit or stop at a price.</div>';
  } else if (pt.tab === 'hist') {
    html = a.fills.length ? `<table class="mini"><tr><th>Time</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Fill price</th><th>Kind</th><th>Realized P&L</th></tr>
      ${a.fills.map((f) => `<tr class="clk" data-ptsym="${esc(f.symbol)}"><td>${when(f.at)}</td><td><b>${esc(f.symbol)}</b></td>
        <td class="${f.side === 'buy' ? 'up' : 'down'}">${f.side === 'buy' ? 'Buy' : 'Sell'}</td><td>${f.qty}</td><td>${fmtPx(f.price)}</td><td>${{ entry: 'Entry', stop: 'Stop-loss hit', target: 'Take-profit hit' }[f.role] || f.role}</td>
        <td class="${cls(f.pnl)}">${f.pnl != null ? sgnUsd(f.pnl) : '—'}</td></tr>`).join('')}</table>`
      : '<div class="empty">No fills yet.</div>';
  } else if (pt.tab === 'alerts') {
    const act = pt.alerts.filter((x) => !x.firedAt);
    const fired = pt.alerts.filter((x) => x.firedAt).sort((x, y) => y.firedAt - x.firedAt);
    html = `<div class="pt-alertform">Alert me when <b>${esc(pt.sym)}</b> reaches <input id="ptAlertPx" type="number" step="0.01" min="0" placeholder="Price"> <input id="ptAlertNote" class="note" maxlength="120" placeholder="Note (optional)"> <button class="x" data-alertadd="1">Add alert</button>
      <span class="muted small">You get a desktop notification, even when this page isn't open. Tip: right-click the chart, or press Alt+A over it.</span></div>` +
      (act.length ? `<table class="mini"><tr><th>Symbol</th><th>When price goes</th><th>Level</th><th>Note</th><th>Set</th><th></th></tr>
      ${act.map((x) => `<tr class="clk" data-ptsym="${esc(x.symbol)}"><td><b>${esc(x.symbol)}</b></td><td>${x.dir === 'above' ? 'above ↑' : 'below ↓'}</td><td>${fmtPx(x.price)}</td><td>${esc(x.note || '')}</td><td>${when(x.createdAt)}</td><td><button class="x" data-alertdel="${x.id}">Delete</button></td></tr>`).join('')}</table>` : '<div class="empty">No active alerts.</div>') +
      (fired.length ? `<div class="pt-bulk"><span class="muted small" style="margin-right:auto">Triggered</span><button class="x" data-alertclear="1">Clear triggered</button></div><table class="mini">
      ${fired.map((x) => `<tr class="clk" data-ptsym="${esc(x.symbol)}"><td><b>${esc(x.symbol)}</b></td><td>${x.dir === 'above' ? 'rose above' : 'fell below'} ${fmtPx(x.price)}</td><td>at ${fmtPx(x.firedPrice)}</td><td>${esc(x.note || '')}</td><td>${when(x.firedAt)}</td><td><button class="x" data-alertdel="${x.id}">Delete</button></td></tr>`).join('')}</table>` : '');
  } else if (pt.tab === 'acct') {
    renderAcctTab();
    return;
  }
  if ($('#ptTabBody').innerHTML === html) return;
  // Keep what's typed in the alert form when the list redraws.
  const keep = ['#ptAlertPx', '#ptAlertNote'].map((id) => [id, $(id)?.value, document.activeElement === $(id)]);
  $('#ptTabBody').innerHTML = html;
  for (const [id, v, focused] of keep) {
    if ($(id) && v) $(id).value = v;
    if (focused) $(id)?.focus();
  }
}
function renderAcctTab() {
  const a = pt.acct;
  const r = (k, v, c = '') => `<div class="r"><span>${k}</span><b class="${c}">${v}</b></div>`;
  const box = $('#ptAcctStats');
  const typing = box.contains(document.activeElement);
  if (!typing) {
    box.innerHTML = r('Starting cash', usd(a.startCash)) + r('Equity', usd(a.equity)) + r('Cash', usd(a.cash)) + r('Buying power', usd(a.buyingPower)) +
      r('Open P&L', sgnUsd(a.unrealized), cls(a.unrealized)) + r('Realized P&L', sgnUsd(a.realized), cls(a.realized)) +
      r('Total P&L', `${sgnUsd(a.totalPnl)} (${pct(a.totalPct, 2)})`, cls(a.totalPnl)) + r('Closed trades', a.closedTrades || 0) +
      r('Win rate', a.winRate != null ? `${a.winRate.toFixed(0)}%` : '—') + r('Since', new Date(a.createdAt).toLocaleDateString()) +
      `<div class="reset"><input id="ptResetCash" type="number" min="100" step="100" value="${Math.round(settingsCache?.accountSize || a.startCash)}" /><button class="btn ghost" id="ptReset">Reset account</button></div>
       <div class="muted small" style="margin-top:6px">Reset clears all positions, orders and history.</div>`;
  }
  if (!pt.eqChart && LWC) {
    pt.eqChart = LWC.createChart($('#ptEqChart'), {
      ...chartColors(),
      autoSize: true,
      grid: { vertLines: { visible: false }, horzLines: { color: alpha(TV.line, 0.55) } },
      timeScale: { timeVisible: true, borderColor: TV.line }, rightPriceScale: { borderColor: TV.line },
    });
    pt.eqLine = pt.eqChart.addAreaSeries({ lineColor: TV.blue, topColor: alpha(TV.blue, 0.28), bottomColor: alpha(TV.blue, 0), lineWidth: 2 });
  }
  if (pt.eqLine) {
    const pts = [];
    for (const p of a.equityCurve) {
      const t = Math.floor((p.t - new Date(p.t).getTimezoneOffset() * 60e3) / 1000); // local clock on the axis
      if (!pts.length || t > pts.at(-1).time) pts.push({ time: t, value: p.v });
    }
    if (pts.length !== pt.eqLen) {
      pt.eqLen = pts.length;
      pt.eqLine.setData(pts);
      pt.eqChart.timeScale().fitContent();
    }
  }
}
$('#ptTabs').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  pt.tab = b.dataset.t;
  $$('#ptTabs button').forEach((x) => x.classList.toggle('on', x === b));
  if ($('#ptBottom').classList.contains('collapsed')) toggleBottom(false);
  renderTabs();
});
function toggleBottom(collapse) {
  $('#ptBottom').classList.toggle('collapsed', collapse);
  store.set('pt.collapsed', collapse);
}
$('#ptCollapse').addEventListener('click', () => toggleBottom(!$('#ptBottom').classList.contains('collapsed')));
$('#ptBottom').addEventListener('mousedown', () => (pt.panelDown = true));
window.addEventListener('mouseup', () => {
  if (!pt.panelDown) return;
  pt.panelDown = false;
  setTimeout(renderTabs, 50);
});
// Drag the panel's top edge to resize it.
$('#ptResize').addEventListener('mousedown', (e) => {
  e.preventDefault();
  const startY = e.clientY;
  const startH = $('#ptBottom').offsetHeight;
  const max = $('.tv-center').clientHeight - 140;
  const move = (ev) => {
    const h = Math.max(90, Math.min(max, startH - (ev.clientY - startY)));
    $('#ptBottom').style.height = `${h}px`;
  };
  const up = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    store.set('pt.panelH', $('#ptBottom').offsetHeight);
  };
  toggleBottom(false);
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
});

// ---- order panel ----
// Size by shares, by a dollar amount, or by how much equity is lost if the stop-loss is hit.
function applySizing(px) {
  const mode = pt.sizeMode;
  $$('#ptSizeMode button').forEach((b) => b.classList.toggle('on', b.dataset.m === mode));
  $('#ptSizeValRow').classList.toggle('hidden', mode === 'sh');
  $('#ptSizeValLbl').textContent = mode === 'usd' ? 'Dollars to invest' : 'Risk (% of equity)';
  $('#ptQty').readOnly = mode !== 'sh';
  if (mode !== 'sh' && $('#ptSizeVal').value === '') $('#ptSizeVal').value = mode === 'usd' ? 1000 : settingsCache?.riskPct || 1;
  const v = +$('#ptSizeVal').value || 0;
  let note = '';
  if (mode === 'usd') {
    if (px) $('#ptQty').value = Math.max(0, Math.floor(v / px));
  } else if (mode === 'risk') {
    const sl = $('#ptUseSL').checked ? +$('#ptSL').value : 0;
    const eq = pt.acct?.equity || 0;
    if (!sl) note = 'Turn on a stop-loss: the share count comes from the distance to it.';
    else if (px && Math.abs(px - sl) > 0) {
      $('#ptQty').value = Math.max(0, Math.floor((eq * v) / 100 / Math.abs(px - sl)));
      note = `Loses about ${usd((eq * v) / 100)} (${v}% of ${usd(eq)}) if the stop-loss is hit.`;
    }
  }
  $('#ptSizeNote').textContent = note;
  $('#ptSizeNote').classList.toggle('hidden', !note);
  return Math.floor(+$('#ptQty').value || 0);
}
function setSizeMode(mode) {
  pt.sizeMode = mode;
  store.set('pt.sizeMode', mode);
  $('#ptSizeVal').value = '';
  syncTicket();
}

function setTicketType(type) {
  $('#ptType').value = type;
  syncTicket();
}
function syncTicket() {
  const type = $('#ptType').value;
  $$('#ptOType button').forEach((b) => b.classList.toggle('on', b.dataset.type === type));
  $('#ptPriceRow').classList.toggle('hidden', type === 'market');
  $('#ptSL').classList.toggle('hidden', !$('#ptUseSL').checked);
  $('#ptTP').classList.toggle('hidden', !$('#ptUseTP').checked);
  $$('.pt-side button').forEach((b) => b.classList.toggle('on', b.dataset.side === pt.side));
  $('#ptTicketSym').textContent = pt.sym;
  const btn = $('#ptSubmit');
  btn.className = `btn pt-submit ${pt.side}`;
  const q = pt.quotes[pt.sym];
  const ba = bidAsk(q);
  // While closed, a market order fills at the open, so estimate with the pre/after-market price.
  const live = (pt.side === 'buy' ? ba?.ask : ba?.bid) || q?.last;
  const px = type === 'market' ? (!pt.acct?.marketOpen && q?.ext?.last) || live : +$('#ptPrice').value;
  pt.ticketPx = px || null;
  const qty = applySizing(px);
  $('#ptRChips').classList.toggle('hidden', !($('#ptUseTP').checked && $('#ptUseSL').checked && +$('#ptSL').value));
  btn.textContent = `${pt.side === 'buy' ? 'Buy' : 'Sell'} ${qty || ''} ${pt.sym} ${type === 'market' ? 'at market' : `${type} ${px ? fmtPx(px) : ''}`}`;
  let est = '';
  if (px && qty) {
    est += `Order value: <b>$${(px * qty).toLocaleString(undefined, { maximumFractionDigits: 0 })}</b>`;
    if (type === 'market' && ba?.bid) est += ` <span class="muted">(at the ${pt.side === 'buy' ? 'ask' : 'bid'})</span>`;
    const sl = $('#ptUseSL').checked ? +$('#ptSL').value : 0;
    const tp = $('#ptUseTP').checked ? +$('#ptTP').value : 0;
    if (sl) est += `<br>Risk if stopped: <b class="down">$${(Math.abs(px - sl) * qty).toFixed(0)}</b>`;
    if (tp) est += `<br>Profit at target: <b class="up">$${(Math.abs(tp - px) * qty).toFixed(0)}</b>`;
    if (sl && tp) est += `<br>Reward : risk = <b>${(Math.abs(tp - px) / Math.abs(px - sl)).toFixed(1)} : 1</b>`;
    if (pt.acct) est += `<br>Buying power: $${pt.acct.buyingPower.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
  }
  if (!isPro() && pt.acct) {
    const open = pt.acct.orders.length;
    est += `${est ? '<br>' : ''}<span class="${open >= FREE_ORDERS ? 'down' : 'muted'}">Free plan: ${open} of ${FREE_ORDERS} open orders</span> · <a data-goto="settings" style="cursor:pointer">Go Pro for unlimited</a>`;
  }
  $('#ptEst').innerHTML = est || 'Enter shares to see the order value and risk.';
  buildOrderLines();
}

async function ptSetSymbol(sym, { keepTicket = false } = {}) {
  sym = String(sym || '').toUpperCase().trim();
  if (!sym) return;
  const changed = sym !== pt.sym || !pt.bars.length;
  // The ticket's limit/stop-loss/take-profit belong to the old stock: never carry them over.
  if (sym !== pt.sym && !keepTicket) clearTicketLevels();
  pt.sym = sym;
  store.set('pt.sym', sym);
  saveSlot();
  $('#ptSym').value = sym;
  $$('#ptWatch .tv-wrow').forEach((r) => r.classList.toggle('on', r.dataset.wsym === sym));
  if (changed) {
    pt.bars = [];
    ensureChart();
    setMainData();
    loadDrawings();
    renderLegend();
  }
  renderQuoteHead();
  renderQuick();
  syncTicket();
  const load = changed ? loadCandles() : null;
  applyPaper(await radar.paper.watch(paperSyms()));
  await load;
}

function applyPaper(d) {
  if (!d) return;
  pt.acct = d.account || pt.acct;
  if (d.quotes) pt.quotes = { ...pt.quotes, ...d.quotes };
  if (d.feed) pt.feed = d.feed;
  if (d.alerts) pt.alerts = d.alerts;
  if (!paperVisible()) return;
  renderAcct();
  renderQuoteHead();
  renderQuick();
  renderFeed();
  renderTabs();
  liveCandle(pt.quotes[pt.sym]);
  for (const s of watchSyms()) updateWatchRow(s);
  for (const m of visibleMinis()) {
    miniLive(m, pt.quotes[m.sym]);
    miniLines(m);
  }
  syncTicket();
}

// Fast path for streamed ticks (up to ~10 batches a second).
function applyTick(d) {
  if (d.feed) pt.feed = d.feed;
  Object.assign(pt.quotes, d.quotes || {});
  if (!paperVisible()) return;
  const mine = d.quotes?.[pt.sym];
  if (mine) {
    liveCandle(mine);
    renderQuick();
    renderQuoteHead();
    refreshLineText();
  }
  for (const s of Object.keys(d.quotes || {})) updateWatchRow(s);
  for (const m of visibleMinis()) if (d.quotes?.[m.sym]) miniLive(m, d.quotes[m.sym]);
  renderFeed();
}

// Open the paper-trading page with a ticket filled in (used by Trade ideas and Lookup).
function openPaper(prefill = {}) {
  showView('paper');
  pt.side = prefill.side || 'buy';
  $('#ptType').value = prefill.type || 'market';
  if (prefill.price) $('#ptPrice').value = prefill.price.toFixed(2);
  if (prefill.qty) {
    pt.sizeMode = 'sh';
    $('#ptQty').value = prefill.qty;
  }
  $('#ptUseSL').checked = !!prefill.stopLoss;
  $('#ptSL').value = prefill.stopLoss ? prefill.stopLoss.toFixed(2) : '';
  $('#ptUseTP').checked = !!prefill.takeProfit;
  $('#ptTP').value = prefill.takeProfit ? prefill.takeProfit.toFixed(2) : '';
  pt.note = prefill.note || '';
  $('#ptMsg').innerHTML = prefill.note ? `<span class="muted">Loaded from Trade ideas: ${esc(prefill.note)}. Check the levels, then place the order.</span>` : '';
  ptSetSymbol(prefill.symbol || pt.sym, { keepTicket: true });
}

// Called by showView when the paper page opens.
function enterPaper() {
  document.body.classList.add('paper-mode');
  ensureChart();
  renderWatch();
  renderIndMenu();
  $$('#ptTf button').forEach((x) => x.classList.toggle('on', x.dataset.tf === pt.tf));
  $$('#ptType2 button').forEach((x) => x.classList.toggle('on', x.dataset.ct === pt.ctype));
  if (!pt.bars.length) ptSetSymbol(pt.sym);
  else radar.paper.watch(paperSyms()).then(applyPaper);
  buildGrid();
  startFrames();
}

// ---- multi-chart layouts ----
// Each slot is one chart: { sym, tf }. The selected slot is the full chart above (drawings,
// indicators, draggable lines, BUY/SELL); the others are live mini charts with their own
// position and order lines. Clicking a mini chart selects it.
const LAYOUT_N = { 1: 1, 2: 2, '2v': 2, 4: 4 };
pt.layout = String(store.get('pt.layout', '1'));
if (!LAYOUT_N[pt.layout]) pt.layout = '1';
pt.active = Math.max(0, Math.min(3, Number(store.get('pt.active', 0)) || 0));
pt.slots = store.get('pt.slots', null) || ['SPY', 'QQQ', 'NVDA', 'AAPL'].map((sym) => ({ sym, tf: '5m' }));
pt.slots[pt.active] = { sym: pt.sym, tf: pt.tf };
pt.minis = [];

function saveSlot() {
  pt.slots[pt.active] = { sym: pt.sym, tf: pt.tf };
  store.set('pt.slots', pt.slots);
  store.set('pt.active', pt.active);
}
const visibleMinis = () => pt.minis.filter((m, i) => m && i < LAYOUT_N[pt.layout] && i !== pt.active);
const paperSyms = () => [...new Set([pt.sym, ...visibleMinis().map((m) => m.sym), ...watchSyms()])];

function clearTicketLevels() {
  $('#ptPrice').value = '';
  $('#ptSL').value = '';
  $('#ptTP').value = '';
  $('#ptUseSL').checked = false;
  $('#ptUseTP').checked = false;
  $('#ptType').value = 'market';
  pt.note = '';
}

function makeMini(i) {
  const el = document.createElement('div');
  el.className = 'tv-mini';
  el.innerHTML = '<div class="mini-chart"></div><div class="mini-head"></div><div class="mini-msg hidden"></div>';
  const base = chartColors(10);
  const chart = LWC.createChart($('.mini-chart', el), {
    ...base,
    autoSize: true,
    timeScale: { ...base.timeScale, timeVisible: true, secondsVisible: false, rightOffset: 6 },
    rightPriceScale: { ...base.rightPriceScale, scaleMargins: { top: 0.15, bottom: 0.08 } },
    crosshair: { ...base.crosshair, mode: LWC.CrosshairMode.Normal },
  });
  const vol = chart.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'vol', lastValueVisible: false, priceLineVisible: false });
  vol.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  const series = chart.addCandlestickSeries({ ...candleColors(), priceLineColor: TV.muted, priceLineStyle: 2 });
  const m = { i, el, chart, series, vol, sym: null, tf: null, bars: [], loading: 0, lines: [], lineSig: '' };
  el.addEventListener('mousedown', () => selectSlot(m.i));
  return m;
}

function miniMsg(m, text) {
  const x = $('.mini-msg', m.el);
  x.textContent = text;
  x.classList.toggle('hidden', !text);
}

function miniHead(m) {
  const q = pt.quotes[m.sym];
  const chg = q?.last && q?.prevClose ? q.last - q.prevClose : null;
  const cls = chg == null ? '' : chg >= 0 ? 'up' : 'down';
  $('.mini-head', m.el).innerHTML = `<b>${esc(m.sym)}</b><i>${esc(TF_LABEL[m.tf] || m.tf)}</i>${q?.last ? `<span class="${cls}">${fmtPx(q.last)}</span>` : ''}${chg != null ? `<span class="${cls}">${chg >= 0 ? '+' : ''}${((chg / q.prevClose) * 100).toFixed(2)}%</span>` : ''}`;
}

async function loadMini(m, sym, tf) {
  if (m.sym === sym && m.tf === tf && m.bars.length) return;
  m.sym = sym;
  m.tf = tf;
  const seq = ++m.loading;
  // Clear the old symbol's candles and lines straight away so nothing stale shows.
  m.bars = [];
  m.series.setData([]);
  m.vol.setData([]);
  miniLines(m, true);
  miniHead(m);
  miniMsg(m, `Loading ${sym}…`);
  try {
    const { bars } = await radar.paper.candles(sym, tf);
    if (seq !== m.loading) return;
    if (!bars.length) return miniMsg(m, `No chart data for ${sym}`);
    m.bars = bars;
    m.series.setData(bars.map((b) => ({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close })));
    m.vol.setData(bars.map(volPoint));
    m.series.priceScale().applyOptions({ autoScale: true });
    m.chart.timeScale().fitContent();
    if (bars.length > 120) m.chart.timeScale().setVisibleLogicalRange({ from: bars.length - 120, to: bars.length + 6 });
    miniMsg(m, '');
    miniLive(m, pt.quotes[sym]);
  } catch {
    if (seq === m.loading) miniMsg(m, `Chart data unavailable for ${sym}`);
  }
}

// Live price into a mini chart's last candle (same bucketing as the main chart, no volume).
function miniLive(m, q) {
  if (q) miniHead(m);
  if (!q || !m.bars.length) return;
  const regular = pt.acct?.marketOpen && q.session !== 'pre' && q.session !== 'post';
  const price = regular ? q.last : q.ext?.last || q.last;
  if (!(price > 0)) return;
  let last = m.bars.at(-1);
  const span = TF_SEC[m.tf];
  if (span) {
    const now = nowEtAsUtc();
    const bucket = now - (now % span);
    if (bucket > last.time) {
      if (!regular && !q.ext) return;
      last = { time: bucket, open: last.close, high: Math.max(last.close, price), low: Math.min(last.close, price), close: price, volume: 0 };
      m.bars.push(last);
    }
  } else if (!regular) return;
  last.close = price;
  last.high = Math.max(last.high, price);
  last.low = Math.min(last.low, price);
  m.series.update({ time: last.time, open: last.open, high: last.high, low: last.low, close: last.close });
}

// Position and working-order lines for the mini chart's own symbol (select the chart to drag them).
function miniLines(m, clear = false) {
  const a = pt.acct;
  const defs = [];
  if (a && !clear) {
    const pos = a.positions.find((p) => p.symbol === m.sym);
    if (pos) defs.push({ price: pos.avg, color: TV.blue, title: `${pos.qty > 0 ? 'LONG' : 'SHORT'} ${Math.abs(pos.qty)}` });
    for (const o of a.orders.filter((x) => x.symbol === m.sym && x.status === 'working')) {
      if (o.role === 'stop') defs.push({ price: o.price, color: TV.down, title: `SL ${o.qty}` });
      else if (o.role === 'target') defs.push({ price: o.price, color: TV.up, title: `TP ${o.qty}` });
      else if (o.type !== 'market') defs.push({ price: o.price, color: o.side === 'buy' ? TV.blue : TV.down, title: `${o.side === 'buy' ? 'BUY' : 'SELL'} ${o.type === 'limit' ? 'LMT' : 'STP'} ${o.qty}` });
    }
    for (const al of pt.alerts.filter((x) => x.symbol === m.sym && !x.firedAt)) defs.push({ price: al.price, color: TV.warn, title: 'ALERT', dashed: true });
  }
  const sig = JSON.stringify(defs);
  if (sig === m.lineSig) return;
  m.lineSig = sig;
  for (const l of m.lines) m.series.removePriceLine(l);
  m.lines = defs.map((d) => m.series.createPriceLine({ price: d.price, color: d.color, lineWidth: 1, lineStyle: d.dashed ? 2 : 0, axisLabelVisible: true, title: d.title }));
}

// Lay out the grid: the full chart sits in the selected slot, mini charts in the rest.
// Menu items offering Pro (or sign-in first).
function proOffer(title) {
  return [
    { label: `<b>${esc(title)}</b>`, run: () => {} },
    { label: 'Get Pro ($19/month)', run: () => radar.account.upgrade('month') },
    { label: 'Get Pro yearly ($190)', run: () => radar.account.upgrade('year') },
    { label: 'I have a license key', run: () => showView('settings') },
  ];
}

function buildGrid() {
  if (!isPro()) pt.layout = '1'; // free plan: one chart
  $('#ptLayout').classList.toggle('free', !isPro());
  const n = LAYOUT_N[pt.layout];
  if (pt.active >= n) {
    // The selected chart moves into the first slot when the layout shrinks.
    [pt.slots[0], pt.slots[pt.active]] = [pt.slots[pt.active], pt.slots[0]];
    pt.active = 0;
    saveSlot();
  }
  const grid = $('#ptGrid');
  grid.className = `tv-grid l${pt.layout}`;
  $$('#ptLayout button').forEach((b) => b.classList.toggle('on', b.dataset.l === pt.layout));
  const cells = [];
  for (let i = 0; i < n; i++) {
    if (i === pt.active) {
      cells.push($('#ptChartWrap'));
      continue;
    }
    if (LWC && !pt.minis[i]) pt.minis[i] = makeMini(i);
    if (!pt.minis[i]) continue;
    cells.push(pt.minis[i].el);
    loadMini(pt.minis[i], pt.slots[i].sym, pt.slots[i].tf);
    miniLines(pt.minis[i]);
  }
  grid.replaceChildren(...cells);
}

function selectSlot(i) {
  if (i === pt.active) return;
  pt.active = i;
  const s = pt.slots[i];
  const tfChanged = s.tf !== pt.tf;
  pt.tf = s.tf;
  store.set('pt.tf', pt.tf);
  $$('#ptTf button').forEach((x) => x.classList.toggle('on', x.dataset.tf === pt.tf));
  renderIndMenu();
  buildGrid();
  if (tfChanged) pt.bars = []; // same symbol on another timeframe still needs new candles
  ptSetSymbol(s.sym);
}

$('#ptLayout').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.dataset.l === pt.layout) return;
  if (!isPro() && b.dataset.l !== '1') {
    const r = b.getBoundingClientRect();
    return popMenu(r.left, r.bottom + 4, proOffer('Multiple charts are a Pro feature'));
  }
  pt.layout = b.dataset.l;
  store.set('pt.layout', pt.layout);
  buildGrid();
  radar.paper.watch(paperSyms()).then(applyPaper);
});

// Re-color every chart after a theme change.
function rethemeCharts() {
  if (pt.chart) {
    pt.chart.applyOptions(chartColors());
    makeMainSeries(); // new colors for candles, volume, order lines and drawings
  }
  for (const m of pt.minis) {
    if (!m) continue;
    m.chart.applyOptions(chartColors(10));
    m.series.applyOptions({ ...candleColors(), priceLineColor: TV.muted });
    m.vol.setData(m.bars.map(volPoint));
    m.lineSig = '';
    miniLines(m);
  }
  if (pt.eqChart) {
    pt.eqChart.applyOptions({ ...chartColors(), grid: { vertLines: { visible: false }, horzLines: { color: alpha(TV.line, 0.55) } } });
    pt.eqLine.applyOptions({ lineColor: TV.blue, topColor: alpha(TV.blue, 0.28), bottomColor: alpha(TV.blue, 0) });
  }
  pt.canvasSig = '';
}

// ---- top toolbar ----
let ptSugg = [];
let ptSuggIdx = 0;
let ptSeq = 0;
$('#ptSym').addEventListener('input', async (e) => {
  const q = e.target.value.trim();
  const seq = ++ptSeq;
  if (!q) return $('#ptSuggest').classList.add('hidden');
  const res = await radar.search(q).catch(() => []);
  if (seq !== ptSeq) return;
  ptSugg = res;
  ptSuggIdx = 0;
  $('#ptSuggest').innerHTML = res.map((r, i) => `<div data-sym="${esc(r.symbol)}" class="${i === 0 ? 'on' : ''}"><b>${esc(r.symbol)}</b><span>${esc(r.name)}</span></div>`).join('') || '<div class="muted">Press Enter to load this ticker</div>';
  $('#ptSuggest').classList.remove('hidden');
});
$('#ptSym').addEventListener('keydown', (e) => {
  const items = $$('#ptSuggest div[data-sym]');
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    ptSuggIdx = Math.max(0, Math.min(items.length - 1, ptSuggIdx + (e.key === 'ArrowDown' ? 1 : -1)));
    items.forEach((x, i) => x.classList.toggle('on', i === ptSuggIdx));
  } else if (e.key === 'Enter') {
    const typed = e.target.value.trim().toUpperCase();
    const sym = $('#ptSuggest').classList.contains('hidden') ? typed : ptSugg[ptSuggIdx]?.symbol || typed;
    $('#ptSuggest').classList.add('hidden');
    e.target.blur();
    ptSetSymbol(sym);
  } else if (e.key === 'Escape') {
    $('#ptSuggest').classList.add('hidden');
    e.target.value = pt.sym;
    e.target.blur();
  }
});
$('#ptSym').addEventListener('focus', (e) => e.target.select());
$('#ptSym').addEventListener('blur', (e) => setTimeout(() => {
  $('#ptSuggest').classList.add('hidden');
  if (!e.target.value.trim()) e.target.value = pt.sym;
}, 150));
$('#ptSuggest').addEventListener('mousedown', (e) => {
  const d = e.target.closest('[data-sym]');
  if (d) ptSetSymbol(d.dataset.sym);
});
$('#ptTf').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  pt.tf = b.dataset.tf;
  store.set('pt.tf', pt.tf);
  saveSlot();
  $$('#ptTf button').forEach((x) => x.classList.toggle('on', x === b));
  renderIndMenu();
  loadCandles();
});
$('#ptType2').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || b.dataset.ct === pt.ctype) return;
  pt.ctype = b.dataset.ct;
  store.set('pt.ctype', pt.ctype);
  $$('#ptType2 button').forEach((x) => x.classList.toggle('on', x === b));
  makeMainSeries();
});
$('#ptIndBtn').addEventListener('click', () => {
  renderIndMenu();
  $('#ptIndMenu').classList.toggle('hidden');
});
$('#ptIndMenu').addEventListener('click', (e) => {
  const it = e.target.closest('[data-ind]');
  if (!it || it.classList.contains('off')) return;
  pt.ind[it.dataset.ind] = !pt.ind[it.dataset.ind];
  store.set('pt.ind', pt.ind);
  renderIndMenu();
  updateIndicators();
  renderLegend();
});
$('#ptDrawBar').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) setTool(b.dataset.tool);
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && paperVisible()) {
    setTool('cursor');
    $('#ptCtx').classList.add('hidden');
  }
});

// Floating BUY / SELL on the chart: market order for the ticket's share count.
$('#ptQuick').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-quick]');
  if (!b) return;
  const side = b.dataset.quick;
  const qty = Math.max(1, Math.floor(+$('#ptQty').value || 1));
  try {
    const d = await radar.paper.order({ symbol: pt.sym, side, qty, type: 'market' });
    applyPaper(d);
    const f = d.account.fills[0];
    toast(f && Date.now() - f.at < 5000 && f.symbol === pt.sym ? `Filled: ${f.side} ${f.qty} ${f.symbol} @ ${fmtPx(f.price)}` : `Market ${side} ${qty} ${pt.sym} placed — fills at the open`);
  } catch (err) {
    toast(errText(err), true);
  }
});

$('#ptOType').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.type !== 'market' && !+$('#ptPrice').value) {
    const ba = bidAsk(pt.quotes[pt.sym]);
    const ref = (pt.side === 'buy' ? ba?.ask : ba?.bid) || ba?.last;
    if (ref) $('#ptPrice').value = fmtPx(ref);
  }
  setTicketType(b.dataset.type);
});
$('.pt-side').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) {
    pt.side = b.dataset.side;
    syncTicket();
  }
});
['#ptPrice', '#ptQty', '#ptUseSL', '#ptSL', '#ptUseTP', '#ptTP'].forEach((id) => $(id).addEventListener('input', syncTicket));
['#ptUseSL', '#ptUseTP'].forEach((id) => $(id).addEventListener('change', () => {
  // Suggest a level when a bracket is switched on: 2% away, the right side of the entry.
  const box = id === '#ptUseSL' ? '#ptSL' : '#ptTP';
  if ($(id).checked && !+$(box).value) {
    const q = pt.quotes[pt.sym];
    const ref = $('#ptType').value === 'market' ? q?.last : +$('#ptPrice').value;
    const dir = (pt.side === 'buy' ? 1 : -1) * (id === '#ptUseSL' ? -1 : 1);
    const sl = $('#ptUseSL').checked ? +$('#ptSL').value : 0;
    if (ref && id === '#ptUseTP' && sl) $(box).value = fmtPx(ref + dir * 2 * Math.abs(ref - sl)); // 2 : 1 reward to risk
    else if (ref) $(box).value = fmtPx(ref * (1 + dir * 0.02));
  }
  syncTicket();
}));

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
      ? `<span class="msg-ok">Filled: ${filled.side} ${filled.qty} ${esc(filled.symbol)} at ${fmtPx(filled.price)}</span>`
      : `<span class="msg-ok">Order placed. ${d.account.marketOpen ? 'It fills when the price reaches your level.' : 'The market is closed, so it will fill at the open.'}</span>`;
    if ($('#ptType').value !== 'market') $('#ptPrice').value = '';
    $('#ptUseSL').checked = false;
    $('#ptUseTP').checked = false;
    syncTicket();
  } catch (err) {
    msg.innerHTML = `<span class="msg-err">${esc(errText(err))}</span>`;
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
      const cash = +$('#ptResetCash').value;
      if (!(cash > 0)) return toast('Enter the starting cash first', true);
      if (confirm(`Reset the paper account to $${cash.toLocaleString()}? This clears all positions, orders and history.`)) {
        $('#ptResetCash').blur();
        pt.eqLen = -1;
        applyPaper(await radar.paper.reset(cash));
        toast('Account reset');
      }
      return;
    }
    if (idea) {
      const t = (data.trades || []).find((y) => y.symbol === idea.dataset.papertrade);
      if (!t) return;
      const s2 = settingsCache || { accountSize: 10000, riskPct: 1 };
      const shares = Math.max(1, Math.floor(((s2.accountSize * s2.riskPct) / 100) / Math.abs(t.entry - t.stop)));
      openPaper({ symbol: t.symbol, side: t.dir === 'up' ? 'buy' : 'sell', qty: shares, type: 'market', stopLoss: t.stop, takeProfit: t.target, note: `${t.catalyst} (${t.horizon})` });
      return;
    }
    if (s && !e.target.closest('button')) ptSetSymbol(s.dataset.ptsym);
  } catch (err) {
    toast(errText(err), true);
  }
});

// Restore the panel layout.
if (store.get('pt.collapsed', false)) $('#ptBottom').classList.add('collapsed');
if (store.get('pt.panelH', 0)) $('#ptBottom').style.height = `${store.get('pt.panelH', 240)}px`;

radar.paper.onUpdate(applyPaper);
radar.paper.onTick(applyTick);

// ---- trading helpers: sizing, R targets, position actions, alerts, shortcuts ----
$('#ptSizeMode').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (b) setSizeMode(b.dataset.m);
});
$('#ptSizeVal').addEventListener('input', syncTicket);
$('#ptQtyChips').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !pt.ticketPx || !pt.acct) return;
  pt.sizeMode = 'sh';
  store.set('pt.sizeMode', 'sh');
  $('#ptQty').value = Math.max(1, Math.floor((pt.acct.buyingPower * +b.dataset.qp) / pt.ticketPx));
  syncTicket();
});
$('#ptRChips').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  const sl = +$('#ptSL').value;
  if (!b || !pt.ticketPx || !sl) return;
  const dir = pt.side === 'buy' ? 1 : -1;
  setTicket('#ptTP', pt.ticketPx + dir * +b.dataset.r * Math.abs(pt.ticketPx - sl));
});

// A small menu at the mouse (used for the trailing-stop distances).
function popMenu(x, y, items) {
  $('#popMenu')?.remove();
  const m = document.createElement('div');
  m.id = 'popMenu';
  m.className = 'tv-menu pop-menu';
  m.innerHTML = items.map((it, i) => `<div class="mi" data-i="${i}">${it.label}</div>`).join('');
  document.body.append(m);
  m.style.left = `${Math.min(x, innerWidth - m.offsetWidth - 8)}px`;
  m.style.top = `${Math.min(y, innerHeight - m.offsetHeight - 8)}px`;
  m.addEventListener('click', (e) => {
    const it = items[e.target.closest('[data-i]')?.dataset.i];
    m.remove();
    it?.run();
  });
  setTimeout(() => document.addEventListener('mousedown', function off(e) {
    if (!m.contains(e.target)) m.remove();
    document.removeEventListener('mousedown', off);
  }), 0);
}

async function paperAct(fn, ok) {
  try {
    applyPaper(await fn());
    if (ok) toast(ok);
  } catch (err) {
    toast(errText(err), true);
  }
}

$('#ptTabBody').addEventListener('click', async (e) => {
  const act = e.target.closest('[data-pact]');
  const bulk = e.target.closest('[data-bulk]');
  const add = e.target.closest('[data-alertadd]');
  const del = e.target.closest('[data-alertdel]');
  const clear = e.target.closest('[data-alertclear]');
  if (act || bulk || add || del || clear) e.stopPropagation();
  if (act) {
    const [kind, sym] = act.dataset.pact.split(':');
    if (kind === 'be') return paperAct(() => radar.paper.breakeven(sym), `${sym}: stop-loss moved to breakeven`);
    if (kind === 'rev') {
      if (!confirm(`Reverse ${sym}? This closes the position and opens the opposite one at market.`)) return;
      return paperAct(() => radar.paper.reverse(sym), `${sym} reversed`);
    }
    if (kind === 'trail') {
      const last = pt.quotes[sym]?.last || pt.acct?.positions.find((p) => p.symbol === sym)?.last;
      if (!last) return toast('No live price yet', true);
      const r = act.getBoundingClientRect();
      return popMenu(r.left, r.bottom + 4, [0.5, 1, 2, 3, 5].map((pc) => {
        const amt = +((last * pc) / 100).toFixed(2);
        return { label: `Trail ${pc}% behind ($${amt.toFixed(2)})`, run: () => paperAct(() => radar.paper.trail(sym, amt), `${sym}: trailing stop ${pc}% behind the price`) };
      }));
    }
  }
  if (bulk) {
    if (bulk.dataset.bulk === 'closeAll' && confirm('Close every open position at market?')) return paperAct(() => radar.paper.closeAll(), 'All positions closed');
    if (bulk.dataset.bulk === 'cancelAll' && confirm('Cancel every working order, including stop-losses and take-profits?')) return paperAct(() => radar.paper.cancelAll(), 'All orders cancelled');
    return;
  }
  if (add) {
    const px = +$('#ptAlertPx').value;
    return paperAct(() => radar.paper.addAlert({ symbol: pt.sym, price: px, note: $('#ptAlertNote').value }), `Alert set: ${pt.sym} @ ${fmtPx(px)}`);
  }
  if (del) return paperAct(() => radar.paper.removeAlert(+del.dataset.alertdel));
  if (clear) return paperAct(() => radar.paper.clearFiredAlerts());
});
$('#ptTabBody').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target.closest('.pt-alertform')) $('[data-alertadd]').click();
});

// An alert went off (the desktop notification comes from the main process).
function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.4);
  } catch {}
}
radar.paper.onAlert((a) => {
  beep();
  if (paperVisible()) toast(`🔔 ${a.symbol} ${a.dir === 'above' ? 'rose above' : 'fell below'} ${fmtPx(a.price)} (now ${fmtPx(a.firedPrice)})`);
});

// Keyboard shortcuts on the paper-trading page (never while typing in a field).
const KEYS = [
  ['Shift+B', 'Buy with the order ticket (shares, type, stop-loss, take-profit)'],
  ['Shift+S', 'Sell / short with the order ticket'],
  ['Shift+C', 'Close the position in this chart'],
  ['Shift+E', 'Move this position\'s stop-loss to breakeven'],
  ['Alt+A', 'Add a price alert where the mouse is (or at the last price)'],
  ['Alt+H', 'Horizontal line tool'],
  ['Alt+T', 'Trend line tool'],
  ['Alt+R', 'Reset the chart view'],
  ['1 – 6', 'Timeframe: 1m, 5m, 15m, 1h, 1D, 1W'],
  ['Esc', 'Cancel the drawing tool, close menus'],
  ['?', 'Show or hide this list'],
];
function toggleKeys(show = $('#ptKeys').classList.contains('hidden')) {
  $('#ptKeys').innerHTML = `<h4>Keyboard shortcuts</h4><table>${KEYS.map(([k, d]) => `<tr><td>${k.split('+').map((x) => `<kbd>${esc(x)}</kbd>`).join(' + ')}</td><td>${esc(d)}</td></tr>`).join('')}</table>`;
  $('#ptKeys').classList.toggle('hidden', !show);
}
$('#ptKeysBtn').addEventListener('click', () => toggleKeys());
$('#ptKeys').addEventListener('click', () => toggleKeys(false));
document.addEventListener('keydown', (e) => {
  if (!paperVisible() || e.metaKey || e.ctrlKey) return;
  if (e.target.closest?.('input, textarea, select, [contenteditable]')) return;
  const k = e.code;
  const hasPos = () => pt.acct?.positions.some((p) => p.symbol === pt.sym);
  let done = true;
  if (e.shiftKey && !e.altKey && (k === 'KeyB' || k === 'KeyS')) {
    pt.side = k === 'KeyB' ? 'buy' : 'sell';
    syncTicket();
    $('#ptSubmit').click();
  } else if (e.shiftKey && !e.altKey && k === 'KeyC') {
    if (hasPos()) paperAct(() => radar.paper.close(pt.sym), `${pt.sym} closed`);
    else toast(`No ${pt.sym} position`, true);
  } else if (e.shiftKey && !e.altKey && k === 'KeyE') {
    if (hasPos()) paperAct(() => radar.paper.breakeven(pt.sym), `${pt.sym}: stop-loss at breakeven`);
    else toast(`No ${pt.sym} position`, true);
  } else if (e.altKey && k === 'KeyA') {
    const px = roundPx(pt.hoverPrice || pt.quotes[pt.sym]?.last || 0);
    if (px > 0) paperAct(() => radar.paper.addAlert({ symbol: pt.sym, price: px }), `Alert set: ${pt.sym} @ ${fmtPx(px)}`);
  } else if (e.altKey && k === 'KeyH') setTool('hline');
  else if (e.altKey && k === 'KeyT') setTool('trend');
  else if (e.altKey && k === 'KeyR') resetView();
  else if (!e.altKey && !e.shiftKey && /^Digit[1-6]$/.test(k)) $$('#ptTf button')[+k.slice(5) - 1]?.click();
  else if (e.key === '?') toggleKeys();
  else if (e.key === 'Escape') {
    toggleKeys(false);
    $('#popMenu')?.remove();
    done = false; // the older Escape handler also runs
  } else done = false;
  if (done) e.preventDefault();
});

// ---------- appearance (themes) ----------
function renderAppearance() {
  const t = themePrefs();
  $('#themeBase').innerHTML = Object.entries(THEMES).map(([k, th]) => `<button type="button" class="theme-tile${k === t.base ? ' on' : ''}" data-theme="${k}" style="--a:${th.app[0]};--b:${th.tv[1]};--c:${th.app[4]}"><span class="sw"><i></i><i style="background:${t.accent}"></i></span>${esc(th.name)}</button>`).join('');
  $('#themeAccent').innerHTML = Object.entries(ACCENTS).map(([k, c]) => `<button type="button" class="accent-dot${c === t.accent ? ' on' : ''}" data-accent="${c}" title="${k}" style="background:${c}"></button>`).join('') +
    `<label class="accent-custom" title="Pick any color"><input type="color" id="themeCustom" value="${t.accent}" /> Custom</label>`;
  $('#themeCandles').innerHTML = Object.entries(CANDLES).map(([k, c]) => `<button type="button" class="candle-opt${k === t.candles ? ' on' : ''}" data-candles="${k}"><i style="background:${c.up}"></i><i style="background:${c.down}"></i>${esc(c.name)}</button>`).join('');
}
function setTheme(change) {
  const next = { ...themePrefs(), ...change };
  try {
    localStorage.setItem('mr.theme', JSON.stringify(next));
  } catch {}
  applyTheme(next);
  renderAppearance();
}
$('#appearance').addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme],[data-accent],[data-candles],#themeReset');
  if (!b) return;
  if (b.id === 'themeReset') return setTheme({ base: 'midnight', accent: ACCENTS.blue, candles: 'classic' });
  if (b.dataset.theme) setTheme({ base: b.dataset.theme });
  else if (b.dataset.accent) setTheme({ accent: b.dataset.accent });
  else setTheme({ candles: b.dataset.candles });
});
$('#appearance').addEventListener('change', (e) => e.target.id === 'themeCustom' && setTheme({ accent: e.target.value }));
renderAppearance();

// ---------- licensed data (Polygon) ----------
function polyStatus(s) {
  $('#polyStatus').innerHTML = s.polygonConfigured
    ? '<span class="msg-ok">● Polygon key saved (encrypted). Licensed data is on.</span>'
    : '<span class="muted">No key saved: using free public sources (personal mode).</span>';
  $('#licensedOnly').checked = !!s.licensedOnly;
}
radar.getSettings().then(polyStatus);
$('#polySave').addEventListener('click', async () => {
  const k = $('#polyKey').value.trim();
  if (!k) return;
  try {
    polyStatus(await radar.setPolygonKey(k));
    $('#polyKey').value = '';
  } catch (e) {
    $('#polyStatus').innerHTML = `<span class="msg-err">${esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))}</span>`;
  }
});
$('#polyRemove').addEventListener('click', async () => polyStatus(await radar.setPolygonKey('')));
$('#polyTest').addEventListener('click', async () => {
  $('#polyStatus').innerHTML = '<span class="muted">Testing…</span>';
  const r = await radar.testPolygon();
  const ok = (b, label) => `${b ? '<span class="msg-ok">✓</span>' : '<span class="msg-err">✕</span>'} ${label}`;
  $('#polyStatus').innerHTML = `${ok(r.daily, 'Daily prices')} · ${ok(r.snapshot, 'Live quotes')} · ${ok(r.news, 'News')}` +
    (r.errors?.length ? `<div class="muted">${r.errors.map(esc).join('<br>')}</div>` : '');
});
$('#licensedOnly').addEventListener('change', async (e) => {
  if (e.target.checked && !(await radar.getSettings()).polygonConfigured) {
    e.target.checked = false;
    $('#polyStatus').innerHTML = '<span class="msg-err">Add a Polygon key first, or the app would have no data.</span>';
    return;
  }
  polyStatus(await radar.saveSettings({ licensedOnly: e.target.checked }));
  radar.runScan();
});

// ---------- account ----------
function renderAccount(st) {
  const was = isPro();
  acct = st;
  // Plan changed (signed in, upgraded, lapsed): re-apply the chart and order limits.
  if (was !== isPro() && paperVisible()) {
    buildGrid();
    syncTicket();
  }
  const card = $('#acctCard');
  const pro = st.plan === 'pro';
  $('#planBadge').innerHTML = st.enabled && st.paywall ? `<span class="plan ${pro ? 'pro' : ''}">${pro ? 'PRO' : 'FREE'}</span>` : '';
  if (!st.enabled) {
    card.innerHTML = '<h3>Market Radar Pro</h3><p class="small muted">Subscriptions aren\'t switched on yet. Everything in the app is free during the beta.</p>';
    return;
  }
  const keyForm = `<form class="acct-form" id="acctForm"><input name="key" placeholder="License key (XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX)" autocomplete="off" spellcheck="false" required />
      <button class="btn" type="submit">Activate</button></form>`;
  if (!pro) {
    card.innerHTML = `<h3>Market Radar Pro</h3>
      <p class="small muted">${esc(PRO_PITCH)} $19/month or $190/year, cancel anytime. Pay by card or PayPal through Gumroad.</p>
      <div class="acct-form"><button class="btn" data-upgrade="month">Get Pro (monthly)</button><button class="btn ghost" data-upgrade="year">Get Pro (yearly)</button></div>
      <p class="small muted" style="margin-top:14px">${st.signedIn ? `Your saved key ${esc(st.keyHint || '')} isn't active (the subscription ended or the payment failed). Renew on Gumroad, then click Check again, or paste a new key.` : 'Already subscribed? Paste the license key from your Gumroad receipt:'}</p>
      ${keyForm}
      ${st.signedIn ? '<div class="acct-form"><button class="btn ghost" id="acctRefresh">Check again</button><button class="btn ghost" id="acctBilling">Manage subscription</button><button class="btn ghost" id="acctOut">Remove key</button></div>' : ''}
      <div id="acctMsg" class="small" style="margin-top:8px"></div>`;
    return;
  }
  const until = st.periodEnd ? ` · ends ${new Date(st.periodEnd).toLocaleDateString()}` : st.recurrence ? ` · renews ${esc(st.recurrence)}` : '';
  card.innerHTML = `<h3>Market Radar Pro</h3><p class="small"><span class="plan pro">PRO</span> ${esc(st.email || '')} <span class="muted">· key ${esc(st.keyHint || '')}${until}</span></p>
    <div class="acct-form"><button class="btn ghost" id="acctBilling">Manage subscription</button><button class="btn ghost" id="acctRefresh">Check again</button><button class="btn ghost" id="acctOut">Remove key</button></div>
    <div id="acctMsg" class="small" style="margin-top:8px"></div>`;
}
const acctErr = (e) => {
  const m = $('#acctMsg');
  if (m) m.innerHTML = `<span class="msg-err">${esc(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))}</span>`;
};
document.addEventListener('submit', async (e) => {
  if (e.target.id !== 'acctForm') return;
  e.preventDefault();
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  try {
    renderAccount(await radar.account.activate(e.target.key.value));
    $('#acctMsg').innerHTML = '<span class="msg-ok">Pro is active. Thanks for subscribing!</span>';
  } catch (err) {
    renderAccount(await radar.account.status());
    acctErr(err);
  } finally {
    btn.disabled = false;
  }
});
document.addEventListener('click', async (e) => {
  const up = e.target.closest('[data-upgrade]');
  const go = e.target.closest('[data-goto]');
  try {
    if (up) {
      await radar.account.upgrade(up.dataset.upgrade);
      const m = $('#acctMsg');
      if (m) m.innerHTML = '<span class="muted">Checkout opened in your browser. After paying, copy the license key from your receipt and paste it here.</span>';
    }
    if (go) showView(go.dataset.goto);
    if (e.target.id === 'acctBilling') await radar.account.billing();
    if (e.target.id === 'acctRefresh') renderAccount(await radar.account.refresh());
    if (e.target.id === 'acctOut' && confirm('Remove the license key from this computer? You can paste it again any time.')) renderAccount(await radar.account.signOut());
  } catch (err) {
    acctErr(err);
  }
});
radar.account.onStatus(renderAccount);
radar.account.status().then(renderAccount);
