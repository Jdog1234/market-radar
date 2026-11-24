// Interactive exercises for the Trading school. A lesson asks for one with
// <div class="wg" data-widget="name" data-…></div>; mountWidgets() fills it in.
// Uses helpers from app.js and learn.js ($, $$, esc, store, LWC, TV, chartColors, candleColors,
// pzPoint, sgnPct, usd, fmtPx, showView, radar).

const WG = {};
const wgRnd = (a, b) => a + Math.random() * (b - a);
const wgMoney = (x, d = 2) => `$${Number(x).toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`;

// ---------- 1. Order book: how a market order walks through liquidity ----------
WG.orderbook = (el) => {
  const books = {
    liquid: { name: 'Busy large-cap stock', tick: 0.01, spread: 0.01, size: [800, 4000] },
    thin: { name: 'Thinly traded small-cap', tick: 0.05, spread: 0.15, size: [40, 300] },
  };
  let kind = el.dataset.kind || 'liquid';
  let qty = 1000;
  let book;
  const build = () => {
    const b = books[kind];
    const bid = 100;
    const ask = +(bid + b.spread).toFixed(2);
    const lvl = (start, dir) => Array.from({ length: 7 }, (_, k) => ({ px: +(start + dir * k * b.tick).toFixed(2), size: Math.round(wgRnd(...b.size) / 10) * 10 }));
    book = { asks: lvl(ask, 1), bids: lvl(bid, -1) };
  };
  const render = () => {
    const b = books[kind];
    let left = qty;
    let cost = 0;
    const used = [];
    for (const a of book.asks) {
      if (left <= 0) break;
      const take = Math.min(left, a.size);
      used.push(take);
      cost += take * a.px;
      left -= take;
    }
    const filled = qty - left;
    const avg = filled ? cost / filled : 0;
    const best = book.asks[0].px;
    const mid = (best + book.bids[0].px) / 2;
    const max = Math.max(...book.asks.map((a) => a.size), ...book.bids.map((a) => a.size));
    const row = (side, l, k) => {
      const u = side === 'ask' ? used[k] || 0 : 0;
      return `<tr class="${u ? 'hit' : ''}"><td class="${side === 'ask' ? 'down' : 'up'}">${l.px.toFixed(2)}</td><td><div class="ob-bar ${side}" style="width:${(l.size / max) * 100}%"></div>${l.size.toLocaleString()}</td><td>${u ? `<b>−${u}</b>` : ''}</td></tr>`;
    };
    el.innerHTML = `<div class="wg-title">Try it: send a market buy into the order book</div>
      <div class="wg-row"><div class="pz-opts" style="grid-template-columns:1fr 1fr;min-width:340px">${Object.entries(books).map(([k, v]) => `<button data-obk="${k}" class="${k === kind ? 'on' : ''}">${v.name}</button>`).join('')}</div>
      <label class="small">Shares to buy at market: <b>${qty.toLocaleString()}</b><input type="range" min="100" max="${kind === 'thin' ? 2000 : 12000}" step="100" value="${qty}" data-obq></label></div>
      <div class="ob"><table><tr><th>Ask (sellers)</th><th>Shares offered</th><th>You take</th></tr>${[...book.asks].map((l, k) => row('ask', l, k)).reverse().join('')}
        <tr class="ob-mid"><td colspan="3">Spread ${(best - book.bids[0].px).toFixed(2)} · mid ${mid.toFixed(3)}</td></tr>
        ${book.bids.map((l, k) => row('bid', l, k)).join('')}<tr><th>Bid (buyers)</th><th></th><th></th></tr></table>
      <div class="ob-out"><div><span>Average fill</span><b>${filled ? wgMoney(avg, 4) : '—'}</b></div><div><span>Best ask was</span><b>${wgMoney(best)}</b></div>
        <div><span>Slippage vs best ask</span><b class="${avg - best > 0.005 ? 'down' : ''}">${filled ? `${wgMoney((avg - best) * filled)} (${(((avg - best) / best) * 100).toFixed(2)}%)` : '—'}</b></div>
        <div><span>Cost vs mid price</span><b>${filled ? wgMoney((avg - mid) * filled) : '—'}</b></div>
        ${left > 0 ? `<div class="down"><b>${left.toLocaleString()} shares couldn't be filled</b> at these price levels: the book ran out.</div>` : ''}</div></div>
      <p class="small muted">${kind === 'liquid' ? 'In a busy stock thousands of shares wait at each price, so even big orders barely move the price.' : 'In a thin stock each price level holds few shares, so a market order eats up through the book and pays more and more. That is slippage.'} The book is regenerated each time you switch.</p>`;
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-obk]');
    if (b) {
      kind = b.dataset.obk;
      qty = kind === 'thin' ? 500 : 3000;
      build();
      render();
    }
  });
  el.addEventListener('input', (e) => {
    if (e.target.matches('[data-obq]')) {
      qty = +e.target.value;
      render();
    }
  });
  build();
  render();
};

// ---------- 2. Order-type playground on a price path ----------
WG.orders = (el) => {
  const paths = {
    calm: { name: 'Calm day', pts: [100, 100.4, 99.8, 99.2, 98.7, 98.9, 98.1, 97.6, 97.9, 98.6, 99.4, 100.1, 100.9, 101.6, 102.2, 101.8, 102.6, 103.1, 102.7, 103.4] },
    gap: { name: 'Bad news gap', pts: [100, 100.3, 99.9, 100.2, 100.1, 99.8, null, 93.2, 92.4, 93.1, 92.0, 91.6, 92.3, 91.8, 92.5, 93.0, 92.6, 92.9, 93.4, 93.1] },
  };
  const types = {
    limit_buy: { name: 'Buy limit', hint: 'Buy only at this price or lower (set it below 100).', def: 98 },
    stop_buy: { name: 'Buy stop', hint: 'Buy once the price rises to this level (set it above 100).', def: 102 },
    stop_loss: { name: 'Stop-loss (you own shares at 100)', hint: 'Sell if the price falls to this level (set it below 100).', def: 97 },
  };
  let path = 'calm';
  let type = 'limit_buy';
  let price = types[type].def;
  let played = false;
  const sim = () => {
    const pts = paths[path].pts;
    for (let k = 1; k < pts.length; k++) {
      const p = pts[k];
      if (p == null) continue;
      const gap = pts[k - 1] == null;
      if (type === 'limit_buy' && p <= price) return { k, fill: gap ? Math.min(p, price) : price, note: gap ? 'It gapped below your limit, so it filled at the (better) opening price.' : 'The price reached your limit and you were filled at your price.' };
      if (type === 'stop_buy' && p >= price) return { k, fill: p, note: 'The price reached your stop, which became a market order and filled near that price.' };
      if (type === 'stop_loss' && p <= price) return { k, fill: p, note: gap ? `The stock gapped straight past your stop. It became a market order and sold at ${p.toFixed(2)}, far below your ${price.toFixed(2)} stop.` : 'The price touched your stop and you were sold near your level.' };
    }
    return { k: null, note: type === 'limit_buy' ? 'The price never came down to your limit, so the order never filled. A limit guarantees your price, not a fill.' : 'The price never reached your level, so nothing happened.' };
  };
  const render = () => {
    const pts = paths[path].pts;
    const W = 520;
    const H = 170;
    const vals = pts.filter((v) => v != null).concat([price]);
    const hi = Math.max(...vals) + 0.6;
    const lo = Math.min(...vals) - 0.6;
    const x = (k) => 20 + (k / (pts.length - 1)) * (W - 40);
    const y = (v) => 10 + ((hi - v) / (hi - lo)) * (H - 20);
    const r = played ? sim() : null;
    let d = '';
    pts.forEach((v, k) => {
      if (v == null) return;
      d += `${d && pts[k - 1] != null ? 'L' : 'M'}${x(k)},${y(v)} `;
    });
    el.innerHTML = `<div class="wg-title">Try it: where does your order fill?</div>
      <div class="wg-row"><div class="pz-opts" style="grid-template-columns:repeat(2,1fr)">${Object.entries(paths).map(([k, v]) => `<button data-opp="${k}" class="${k === path ? 'on' : ''}">${v.name}</button>`).join('')}</div>
      <div class="pz-opts" style="grid-template-columns:repeat(3,1fr)">${Object.entries(types).map(([k, v]) => `<button data-opt="${k}" class="${k === type ? 'on' : ''}">${v.name}</button>`).join('')}</div></div>
      <div class="wg-row"><label class="small">Order price <input type="number" step="0.5" value="${price}" data-opx style="width:90px"></label><span class="small muted">${esc(types[type].hint)}</span><button class="btn" data-opplay>${played ? 'Play again' : '▶ Play the day'}</button></div>
      <svg viewBox="0 0 ${W} ${H}" class="wg-svg"><line x1="10" x2="${W - 10}" y1="${y(price)}" y2="${y(price)}" stroke="var(--warn)" stroke-dasharray="5 4"/><text x="${W - 12}" y="${y(price) - 4}" text-anchor="end" fill="var(--warn)" font-size="11">${esc(types[type].name)} ${price.toFixed(2)}</text>
        <path d="${d}" fill="none" stroke="var(--accent)" stroke-width="2"/>${pts.includes(null) ? `<text x="${x(pts.indexOf(null))}" y="${H - 6}" fill="var(--muted)" font-size="11" text-anchor="middle">overnight gap</text>` : ''}
        ${r?.k != null ? `<circle cx="${x(r.k)}" cy="${y(r.fill)}" r="6" fill="${type === 'stop_loss' ? 'var(--down)' : 'var(--up)'}"/>` : ''}</svg>
      ${r ? `<div class="pz-result small">${r.k != null ? `<b>Filled at ${r.fill.toFixed(2)}.</b> ` : '<b>Not filled.</b> '}${esc(r.note)}</div>` : '<p class="small muted">Pick a day and an order, set the price, then play.</p>'}`;
  };
  el.addEventListener('click', (e) => {
    const p = e.target.closest('[data-opp]');
    const t = e.target.closest('[data-opt]');
    if (p) path = p.dataset.opp;
    if (t) {
      type = t.dataset.opt;
      price = types[type].def;
    }
    if (p || t) played = false;
    if (e.target.closest('[data-opplay]')) played = true;
    if (p || t || e.target.closest('[data-opplay]')) render();
  });
  el.addEventListener('change', (e) => {
    if (e.target.matches('[data-opx]')) {
      price = +e.target.value || price;
      played = false;
      render();
    }
  });
  render();
};

// ---------- 3. Candle builder ----------
WG.candle = (el) => {
  const v = { open: 40, high: 70, low: 10, close: 60 };
  const classify = () => {
    const { open: o, high: h, low: l, close: c } = v;
    const r = h - l || 1;
    const body = Math.abs(c - o);
    const up = h - Math.max(o, c);
    const dn = Math.min(o, c) - l;
    if (body <= 0.08 * r) return dn >= 0.65 * r ? ['Dragonfly doji', 'Open and close at the top: sellers were rejected.'] : up >= 0.65 * r ? ['Gravestone doji', 'Open and close at the bottom: buyers were rejected.'] : ['Doji', 'Open equals close: indecision.'];
    if (body <= 0.33 * r && dn >= 2 * body && up <= 0.12 * r) return ['Hammer shape', 'Long lower shadow, small body on top. Called a hammer after a fall, a hanging man after a rise.'];
    if (body <= 0.33 * r && up >= 2 * body && dn <= 0.12 * r) return ['Shooting star shape', 'Long upper shadow, small body at the bottom. A shooting star after a rise, an inverted hammer after a fall.'];
    if (body >= 0.92 * r) return [c > o ? 'Bullish marubozu' : 'Bearish marubozu', 'Almost no shadows: one side controlled the whole period.'];
    if (body <= 0.3 * r) return ['Spinning top', 'Small body with shadows on both sides: indecision.'];
    return [c > o ? 'Green candle' : 'Red candle', c > o ? 'Closed higher than it opened.' : 'Closed lower than it opened.'];
  };
  const render = () => {
    const { open: o, high: h, low: l, close: c } = v;
    const y = (p) => 150 - p * 1.4;
    const col = c >= o ? 'var(--up)' : 'var(--down)';
    const [name, why] = classify();
    el.innerHTML = `<div class="wg-title">Try it: build a candle</div><div class="cb">
      <svg viewBox="0 0 120 160" class="cb-svg"><line x1="60" x2="60" y1="${y(h)}" y2="${y(l)}" stroke="${col}" stroke-width="3"/><rect x="38" width="44" y="${y(Math.max(o, c))}" height="${Math.max(2, Math.abs(y(o) - y(c)))}" fill="${col}" rx="2"/></svg>
      <div class="cb-ctl">${['high', 'open', 'close', 'low'].map((k) => `<label class="small">${k[0].toUpperCase() + k.slice(1)} <b>${v[k]}</b><input type="range" min="0" max="100" value="${v[k]}" data-cb="${k}"></label>`).join('')}
      <div class="pz-result"><b>${esc(name)}</b><div class="small muted">${esc(why)}</div></div>
      <div class="pz-opts" style="grid-template-columns:repeat(4,1fr)">${[['Hammer', [72, 82, 20, 80]], ['Doji', [50, 75, 25, 51]], ['Marubozu', [15, 86, 14, 85]], ['Shooting star', [22, 85, 20, 25]]].map(([n, a]) => `<button data-cbp="${a.join(',')}">${n}</button>`).join('')}</div></div></div>`;
  };
  el.addEventListener('input', (e) => {
    const k = e.target.dataset.cb;
    if (!k) return;
    v[k] = +e.target.value;
    // Keep it a valid candle: high is the top, low the bottom.
    v.high = Math.max(v.high, v.open, v.close);
    v.low = Math.min(v.low, v.open, v.close);
    render();
    el.querySelector(`[data-cb="${k}"]`)?.focus();
  });
  el.addEventListener('click', (e) => {
    const p = e.target.closest('[data-cbp]');
    if (!p) return;
    const [o, h, l, c] = p.dataset.cbp.split(',').map(Number);
    Object.assign(v, { open: o, high: h, low: l, close: c });
    render();
  });
  render();
};

// ---------- 4. Position-size calculator with practice questions ----------
WG.sizer = (el) => {
  const v = { acct: 10000, risk: 1, entry: 50, stop: 48 };
  let q = null;
  const newQ = () => {
    const entry = Math.round(wgRnd(20, 300));
    const stop = +(entry * (1 - wgRnd(0.02, 0.08))).toFixed(2);
    q = { acct: [5000, 10000, 25000, 50000][Math.floor(wgRnd(0, 4))], risk: [0.5, 1, 2][Math.floor(wgRnd(0, 3))], entry, stop };
    q.ans = Math.floor(((q.acct * q.risk) / 100) / (q.entry - q.stop));
  };
  const render = (msg = '') => {
    const riskD = (v.acct * v.risk) / 100;
    const per = v.entry - v.stop;
    const sh = per > 0 ? Math.floor(riskD / per) : 0;
    el.innerHTML = `<div class="wg-title">Try it: position size calculator</div>
      <div class="wg-grid">${[['acct', 'Account ($)'], ['risk', 'Risk per trade (%)'], ['entry', 'Entry price'], ['stop', 'Stop price']].map(([k, n]) => `<label class="small">${n}<input type="number" step="any" value="${v[k]}" data-sz="${k}"></label>`).join('')}</div>
      <div class="ob-out" style="margin-top:10px"><div><span>Risk in dollars</span><b>${wgMoney(riskD)}</b></div><div><span>Risk per share</span><b>${per > 0 ? wgMoney(per) : 'stop must be below entry'}</b></div>
        <div><span>Shares to buy</span><b>${sh.toLocaleString()}</b></div><div><span>Position size</span><b>${wgMoney(sh * v.entry, 0)}</b> <span class="small muted">(${((sh * v.entry * 100) / v.acct).toFixed(0)}% of the account)</span></div></div>
      <div class="pz-result" style="margin-top:12px"><b>Practice:</b> ${q ? `${wgMoney(q.acct, 0)} account, risk ${q.risk}%, buy at ${wgMoney(q.entry)}, stop at ${wgMoney(q.stop)}. How many shares?` : ''}
        <div class="wg-row" style="margin-top:6px"><input type="number" data-szans placeholder="Shares" style="width:110px"><button class="btn" data-szcheck>Check</button><button class="btn ghost" data-sznew>New question</button></div><div class="small">${msg}</div></div>`;
  };
  el.addEventListener('change', (e) => {
    const k = e.target.dataset.sz;
    if (k) {
      v[k] = +e.target.value;
      render();
    }
  });
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-sznew]')) {
      newQ();
      render();
    }
    if (e.target.closest('[data-szcheck]')) {
      const a = +el.querySelector('[data-szans]').value;
      const ok = Math.abs(a - q.ans) <= 1;
      const r = (q.acct * q.risk) / 100;
      render(`${ok ? '<span class="msg-ok">✅ Right!</span>' : '<span class="msg-err">❌ Not quite.</span>'} ${wgMoney(r)} risk ÷ ${wgMoney(q.entry - q.stop)} per share = <b>${q.ans.toLocaleString()} shares</b>.`);
    }
  });
  newQ();
  render();
};

// ---------- 5. Expectancy simulator ----------
WG.expectancy = (el) => {
  const v = { win: 45, rr: 2, risk: 1 };
  let run = null;
  const simulate = () => {
    let eq = 10000;
    let peak = eq;
    let dd = 0;
    let streak = 0;
    let worst = 0;
    const curve = [eq];
    for (let k = 0; k < 100; k++) {
      const risk = (eq * v.risk) / 100;
      const win = Math.random() < v.win / 100;
      eq += win ? risk * v.rr : -risk;
      streak = win ? 0 : streak + 1;
      worst = Math.max(worst, streak);
      peak = Math.max(peak, eq);
      dd = Math.max(dd, (peak - eq) / peak);
      curve.push(eq);
    }
    run = { curve, end: eq, dd: dd * 100, worst };
  };
  const render = () => {
    const e = (v.win / 100) * v.rr - (1 - v.win / 100);
    let svg = '';
    if (run) {
      const W = 520;
      const H = 150;
      const hi = Math.max(...run.curve, 10000);
      const lo = Math.min(...run.curve, 10000);
      const pt = (val, k) => `${10 + (k / 100) * (W - 20)},${10 + ((hi - val) / (hi - lo || 1)) * (H - 20)}`;
      svg = `<svg viewBox="0 0 ${W} ${H}" class="wg-svg"><line x1="10" x2="${W - 10}" y1="${10 + ((hi - 10000) / (hi - lo || 1)) * (H - 20)}" y2="${10 + ((hi - 10000) / (hi - lo || 1)) * (H - 20)}" stroke="var(--muted)" stroke-dasharray="4 4"/><polyline fill="none" stroke="${run.end >= 10000 ? 'var(--up)' : 'var(--down)'}" stroke-width="2" points="${run.curve.map(pt).join(' ')}"/></svg>
        <div class="ob-out"><div><span>After 100 trades</span><b class="${run.end >= 10000 ? 'up' : 'down'}">${wgMoney(run.end, 0)}</b></div><div><span>Worst drawdown</span><b>${run.dd.toFixed(1)}%</b></div><div><span>Longest losing streak</span><b>${run.worst} in a row</b></div></div>`;
    }
    el.innerHTML = `<div class="wg-title">Try it: simulate 100 trades</div>
      <div class="wg-grid">${[['win', 'Win rate', 10, 90, 1, '%'], ['rr', 'Reward : risk', 0.5, 4, 0.5, ' : 1'], ['risk', 'Risk per trade', 0.5, 10, 0.5, '%']].map(([k, n, a, b, s, u]) => `<label class="small">${n} <b>${v[k]}${u}</b><input type="range" min="${a}" max="${b}" step="${s}" value="${v[k]}" data-ex="${k}"></label>`).join('')}</div>
      <p class="small">Expectancy: ${(v.win / 100).toFixed(2)} × ${v.rr} − ${(1 - v.win / 100).toFixed(2)} × 1 = <b class="${e >= 0 ? 'up' : 'down'}">${e >= 0 ? '+' : ''}${e.toFixed(2)}R per trade</b></p>
      <button class="btn" data-exrun>${run ? 'Run again (new random luck)' : '▶ Run 100 trades from $10,000'}</button>${svg}
      <p class="small muted">Run it several times with the same settings: luck alone changes the result a lot. Then raise the risk per trade to 5–10% and watch the drawdowns.</p>`;
  };
  el.addEventListener('input', (e) => {
    const k = e.target.dataset.ex;
    if (!k) return;
    v[k] = +e.target.value;
    run = null;
    render();
    el.querySelector(`[data-ex="${k}"]`)?.focus();
  });
  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-exrun]')) {
      simulate();
      render();
    }
  });
  render();
};

// ---------- 6. Drawdown recovery ----------
WG.drawdown = (el) => {
  let loss = 30;
  const render = () => {
    const need = (1 / (1 - loss / 100) - 1) * 100;
    el.innerHTML = `<div class="wg-title">Try it: how deep is the hole?</div>
      <label class="small">Account falls by <b>${loss}%</b><input type="range" min="5" max="90" step="5" value="${loss}" data-dd style="width:100%"></label>
      <div class="ob-out"><div><span>$10,000 becomes</span><b class="down">${wgMoney(10000 * (1 - loss / 100), 0)}</b></div><div><span>Gain needed to get back</span><b>${need.toFixed(0)}%</b></div>
        <div><span>Losing trades at 1% risk to fall this far</span><b>${Math.ceil(Math.log(1 - loss / 100) / Math.log(0.99))}</b></div><div><span>…at 10% risk</span><b>${Math.ceil(Math.log(1 - loss / 100) / Math.log(0.9))}</b></div></div>`;
  };
  el.addEventListener('input', (e) => {
    if (e.target.matches('[data-dd]')) {
      loss = +e.target.value;
      render();
      el.querySelector('[data-dd]').focus();
    }
  });
  render();
};

// ---------- 7. Trend drill on real charts ----------
WG.trend = (el) => {
  let chart = null;
  let cur = null;
  const score = store.get('wg.trend', { n: 0, right: 0 });
  const answer = (w) => {
    const b = w.bars;
    const chg = b.at(-1).close - b[0].close;
    const a = w.atr || 1;
    return chg > 4 * a ? 'up' : chg < -4 * a ? 'down' : 'range';
  };
  const load = async () => {
    el.innerHTML = '<div class="wg-title">Try it: call the trend on a real chart</div><div class="small muted">Loading a real chart…</div>';
    try {
      cur = await radar.learn.replay({ before: 70, after: 1 });
    } catch (err) {
      el.innerHTML += `<p class="msg-err small">${esc(errText(err))}</p>`;
      return;
    }
    cur.ans = answer(cur);
    el.innerHTML = `<div class="wg-title">Try it: call the trend on a real chart</div><div class="small muted">A real stock, 70 trading days, name hidden. Score: ${score.right}/${score.n}</div>
      <div class="wg-chart" data-trc></div><div class="pz-opts" style="grid-template-columns:repeat(3,1fr);margin-top:8px"><button data-tr="up">▲ Uptrend</button><button data-tr="range">↔ Range</button><button data-tr="down">▼ Downtrend</button></div><div data-trout></div>`;
    chart = LWC.createChart(el.querySelector('[data-trc]'), { ...chartColors(), autoSize: true, timeScale: { visible: false }, handleScroll: false, handleScale: false });
    const s = chart.addCandlestickSeries({ ...candleColors(), priceLineVisible: false, lastValueVisible: false });
    s.setData(cur.bars.map(pzPoint));
    chart.timeScale().fitContent();
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tr]');
    if (b && cur && !cur.done) {
      cur.done = true;
      const ok = b.dataset.tr === cur.ans;
      score.n++;
      if (ok) score.right++;
      store.set('wg.trend', score);
      el.querySelectorAll('[data-tr]').forEach((x) => x.classList.add(x.dataset.tr === cur.ans ? 'right' : x === b ? 'wrong' : 'x'));
      const chg = ((cur.bars.at(-1).close - cur.bars[0].close) / cur.bars[0].close) * 100;
      el.querySelector('[data-trout]').innerHTML = `<div class="pz-result small" style="margin-top:8px">${ok ? '✅' : '❌'} <b>${esc(cur.symbol)}</b>: ${sgnPct(chg)} over the period, about ${(Math.abs(cur.bars.at(-1).close - cur.bars[0].close) / cur.atr).toFixed(1)}× its normal daily move. The drill calls it a trend when the move is more than 4 normal days; otherwise a range. Look for higher highs and higher lows (up) or lower highs and lower lows (down). <button class="btn ghost" data-trnext>Next chart</button></div>`;
    }
    if (e.target.closest('[data-trnext]')) {
      chart?.remove();
      load();
    }
  });
  load();
};

// ---------- 8. Trade replay trainer on real charts ----------
WG.replay = (el) => {
  let chart = null;
  let series = null;
  let cur = null;
  const tally = store.get('wg.replay', { n: 0, r: 0, wins: 0 });
  const STOP_ATR = 1.5;
  const TARGET_R = 2;
  const MAX_DAYS = 15;
  const load = async () => {
    el.innerHTML = '<div class="wg-title">Trading demo: replay a real chart</div><div class="small muted">Loading a real chart…</div>';
    try {
      cur = await radar.learn.replay({ before: 60, after: MAX_DAYS });
    } catch (err) {
      el.innerHTML += `<p class="msg-err small">${esc(errText(err))}</p>`;
      return;
    }
    const last = cur.bars.at(-1).close;
    cur.entry = last;
    cur.risk = STOP_ATR * cur.atr;
    el.innerHTML = `<div class="wg-title">Trading demo: replay a real chart</div>
      <div class="small muted">A real stock (name hidden). You're at the close of the last candle: <b>${wgMoney(last)}</b>. Normal daily move (ATR): ${wgMoney(cur.atr)}. Your stop goes ${STOP_ATR}× ATR away and your target ${TARGET_R}R away; you have up to ${MAX_DAYS} trading days.</div>
      <div class="wg-chart tall" data-rpc></div>
      <div class="pz-opts" style="grid-template-columns:repeat(3,1fr);margin-top:8px"><button data-rp="long">▲ Buy (long)</button><button data-rp="skip">Skip it</button><button data-rp="short">▼ Sell short</button></div>
      <div data-rpout class="small"></div>
      <div class="small muted" style="margin-top:6px">Your demo record: ${tally.n} trades · ${tally.n ? Math.round((tally.wins / tally.n) * 100) : 0}% wins · total <b class="${tally.r >= 0 ? 'up' : 'down'}">${tally.r >= 0 ? '+' : ''}${tally.r.toFixed(1)}R</b></div>`;
    chart = LWC.createChart(el.querySelector('[data-rpc]'), { ...chartColors(), autoSize: true, timeScale: { visible: false, rightOffset: MAX_DAYS + 2 }, handleScroll: false, handleScale: false });
    series = chart.addCandlestickSeries({ ...candleColors(), priceLineVisible: false, lastValueVisible: false });
    series.setData(cur.bars.map(pzPoint));
    chart.timeScale().fitContent();
  };
  const play = (side) => {
    cur.done = true;
    const long = side !== 'short';
    const stop = long ? cur.entry - cur.risk : cur.entry + cur.risk;
    const target = long ? cur.entry + TARGET_R * cur.risk : cur.entry - TARGET_R * cur.risk;
    if (side !== 'skip') {
      series.createPriceLine({ price: cur.entry, color: TV.blue, lineWidth: 1, title: long ? 'Entry (long)' : 'Entry (short)' });
      series.createPriceLine({ price: stop, color: TV.down, lineWidth: 1, lineStyle: 2, title: 'Stop' });
      series.createPriceLine({ price: target, color: TV.up, lineWidth: 1, lineStyle: 2, title: `Target ${TARGET_R}R` });
    }
    // Walk forward one day at a time. If one day touches both, count the stop (conservative).
    let k = 0;
    let result = null;
    const shown = [...cur.bars];
    const step = () => {
      const b = cur.future[k];
      if (!b) return finish(result || { r: ((long ? 1 : -1) * (cur.future.at(-1).close - cur.entry)) / cur.risk, why: `Time's up after ${MAX_DAYS} days: closed at ${wgMoney(cur.future.at(-1).close)}.` });
      shown.push(b);
      series.setData(shown.map(pzPoint));
      const hitStop = long ? b.low <= stop : b.high >= stop;
      const hitTarget = long ? b.high >= target : b.low <= target;
      k++;
      // A gap past a level fills at the open, not at the level.
      const rOf = (fill) => ((long ? 1 : -1) * (fill - cur.entry)) / cur.risk;
      if (hitStop) {
        const gapped = long ? b.open < stop : b.open > stop;
        return finish({ r: rOf(gapped ? b.open : stop), why: `Stopped out on day ${k}.${gapped ? ' It gapped through the stop, so the loss was bigger than 1R.' : ''}` });
      }
      if (hitTarget) {
        const gapped = long ? b.open > target : b.open < target;
        return finish({ r: rOf(gapped ? b.open : target), why: `Target hit on day ${k}.${gapped ? ' It gapped past the target, a bonus.' : ''}` });
      }
      setTimeout(step, 160);
    };
    const finish = (res) => {
      const out = el.querySelector('[data-rpout]');
      if (side === 'skip') {
        const move = ((cur.future.at(-1).close - cur.entry) / cur.entry) * 100;
        out.innerHTML = `<div class="pz-result" style="margin-top:8px">You skipped. Over the next ${MAX_DAYS} days <b>${esc(cur.symbol)}</b> went ${sgnPct(move)}. Skipping unclear charts is a real skill. <button class="btn ghost" data-rpnext>Next chart</button></div>`;
        return;
      }
      res.r = Math.max(-3, res.r);
      tally.n++;
      tally.r += res.r;
      if (res.r > 0) tally.wins++;
      store.set('wg.replay', tally);
      out.innerHTML = `<div class="pz-result" style="margin-top:8px"><b class="${res.r >= 0 ? 'up' : 'down'}" style="font-size:18px">${res.r >= 0 ? '+' : ''}${res.r.toFixed(2)}R</b> · ${esc(res.why)} The stock was <b>${esc(cur.symbol)}</b> (${when2(cur.date)}). <button class="btn ghost" data-rpnext>Next chart</button></div>`;
    };
    step();
  };
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-rp]');
    if (b && cur && !cur.done) {
      el.querySelectorAll('[data-rp]').forEach((x) => x.classList.toggle('on', x === b));
      play(b.dataset.rp);
    }
    if (e.target.closest('[data-rpnext]')) {
      chart?.remove();
      load();
    }
  });
  load();
};

// ---------- 9. Practice missions in the simulated trading account ----------
const MISSIONS = {
  market: { title: 'Buy 1 share of any stock at market', how: 'Trading screen → pick a symbol → Shares 1 → Market → Buy.', check: (d, t) => [...d.account.orders, ...d.account.history].some((o) => o.side === 'buy' && o.type === 'market' && o.createdAt > t) },
  bracket: { title: 'Place a limit buy below the current price, with a stop-loss and a take-profit', how: 'Order panel → Limit → a price under the current one → tick Stop-loss and Take-profit → Buy.', check: (d, t) => [...d.account.orders, ...d.account.history].some((o) => o.side === 'buy' && o.type === 'limit' && o.stopLoss && o.takeProfit && o.createdAt > t) },
  risk: { title: 'Size a trade so the stop-loss risks about 1% of the account', how: 'Order panel → Size by: Risk % → 1 → tick Stop-loss → place the order.', check: (d, t) => [...d.account.orders, ...d.account.history].some((o) => {
    if (!(o.createdAt > t && o.stopLoss && o.role === 'entry')) return false;
    const ref = o.price || o.refPrice;
    const pct = ((Math.abs(ref - o.stopLoss) * o.qty) / d.account.equity) * 100;
    return pct >= 0.6 && pct <= 1.4;
  }) },
  protect: { title: 'Protect an open position: move its stop to breakeven or add a trailing stop', how: 'Positions tab → Breakeven or Trail on any position (buy one first if you have none).', check: (d, t) => d.account.orders.some((o) => o.role === 'stop' && ((o.trail > 0) || d.account.positions.some((p) => p.symbol === o.symbol && Math.abs(o.price - p.avg) < 0.02))) },
  alert: { title: 'Set a price alert on a chart', how: 'Right-click the chart → Add alert, or press Alt+A over it.', check: (d, t) => (d.alerts || []).some((a) => a.createdAt > t) },
};
WG.mission = (el) => {
  const ids = (el.dataset.ids || '').split(',').filter((x) => MISSIONS[x]);
  const prog = store.get('wg.missions', {});
  const render = (msg = '') => {
    el.innerHTML = `<div class="wg-title">Practice missions in the trading demo</div><p class="small muted">Do these in the <b>Simulated account</b> on the Trading screen (fake money), then come back and check.</p>
      ${ids.map((id) => {
        const m = MISSIONS[id];
        const done = prog[id]?.done;
        return `<div class="ms ${done ? 'done' : ''}"><div><b>${done ? '✅' : '◻️'} ${esc(m.title)}</b><div class="small muted">${esc(m.how)}</div></div>
          <div class="ms-btns">${done ? '<span class="msg-ok small">Done</span>' : `<button class="btn ghost" data-msgo="${id}">Start</button><button class="btn" data-mscheck="${id}">Check</button>`}</div></div>`;
      }).join('')}<div class="small" data-msmsg>${msg}</div>`;
  };
  el.addEventListener('click', async (e) => {
    const go = e.target.closest('[data-msgo]');
    const ck = e.target.closest('[data-mscheck]');
    if (go) {
      prog[go.dataset.msgo] = { started: Date.now() - 1000 };
      store.set('wg.missions', prog);
      showView('paper');
      toast(`Mission: ${MISSIONS[go.dataset.msgo].title}. Come back to Trading school and click Check.`);
    }
    if (ck) {
      const id = ck.dataset.mscheck;
      const d = await radar.paper.get();
      if (d.mode?.kind === 'broker') return render('<span class="msg-err">Switch the Trading screen to the Simulated account first: missions only use fake money.</span>');
      const started = prog[id]?.started || 0;
      if (!started) return render('<span class="msg-err">Click Start first, then do the mission.</span>');
      if (MISSIONS[id].check(d, started)) {
        prog[id] = { ...prog[id], done: true };
        store.set('wg.missions', prog);
        render('<span class="msg-ok">Mission complete!</span>');
      } else render(`<span class="msg-err">Not done yet: ${esc(MISSIONS[id].how)}</span>`);
    }
  });
  render();
};

function mountWidgets(root) {
  for (const el of root.querySelectorAll('[data-widget]')) {
    const f = WG[el.dataset.widget];
    if (f && !el.dataset.mounted) {
      el.dataset.mounted = '1';
      try {
        f(el);
      } catch (err) {
        el.innerHTML = `<p class="msg-err small">${esc(String(err.message || err))}</p>`;
      }
    }
  }
}
