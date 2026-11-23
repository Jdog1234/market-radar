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
  $('#stats').innerHTML = `${s.headlines} headlines read<br>${s.tagged} linked to stocks<br>${s.candidates} stocks scored · ${s.priced} price-checked`;
  const bad = s.feeds.filter((f) => !f.ok);
  $('#feedStatus').innerHTML = `<p>${s.feeds.length - bad.length}/${s.feeds.length} sources OK on the last scan.</p>` +
    bad.map((f) => `<div class="fs"><span class="bad">✕</span>${esc(f.name)} <span class="muted">${esc(f.error)}</span></div>`).join('');
}

function renderAll() {
  if (!data) return;
  renderHeader();
  renderSignals();
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
  });
  $('#saved').textContent = 'Saved — rescanning…';
  await radar.runScan();
  $('#saved').textContent = 'Saved.';
});

// ---------- events ----------
$('#nav').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  $$('#nav button').forEach((x) => x.classList.toggle('active', x === b));
  $$('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${b.dataset.view}`));
});

document.addEventListener('click', (e) => {
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
