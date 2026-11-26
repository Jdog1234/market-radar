// Builds a week of ads: checks each spec, renders it, adds her voice, and writes a review page.
//   node ads/factory/make.js <weekDir> [id...]      weekDir holds specs/*.json; output goes to weekDir/out/
// Specs that FAIL the compliance check are not built. Nothing is posted: the review page is for you.
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { report } = require('./check.js');

const ROOT = path.join(__dirname, '..', '..');
const weekDir = path.resolve(process.argv[2]);
const only = process.argv.slice(3);
const outDir = path.join(weekDir, 'out');
const BIN = path.join(__dirname, 'bin');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(BIN, { recursive: true });
const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'], ...opts });

for (const tool of ['encode', 'voice']) {
  const src = path.join(__dirname, `${tool}.swift`), bin = path.join(BIN, tool);
  if (!fs.existsSync(bin) || fs.statSync(bin).mtimeMs < fs.statSync(src).mtimeMs) run('swiftc', ['-O', src, '-o', bin]);
}

// Her voice: macOS Samantha, made higher and brighter by voice.swift
const VOICE_RATE = 1.08; // matches RATE in voice.swift
const spoken = (l) => (l.say || l.text).replace(/<[^>]+>/g, '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '').trim();

const specs = fs.readdirSync(path.join(weekDir, 'specs')).filter((f) => f.endsWith('.json')).sort()
  .map((f) => ({ file: path.join(weekDir, 'specs', f), spec: JSON.parse(fs.readFileSync(path.join(weekDir, 'specs', f), 'utf8')) }));
const results = [];
for (const [n, { file, spec }] of specs.entries()) {
  const rep = report(spec);
  const name = path.basename(file, '.json');
  // Building only some ads: keep the others' last results so the review page still lists the whole week
  if (only.length && !only.includes(name) && !only.includes(spec.id)) {
    const prev = path.join(outDir, `${name}.check.json`);
    results.push({ name, spec, rep: fs.existsSync(prev) ? JSON.parse(fs.readFileSync(prev, 'utf8')) : rep });
    continue;
  }
  fs.writeFileSync(path.join(outDir, `${name}.check.json`), JSON.stringify(rep, null, 2));
  console.log(`\n[${n + 1}/${specs.length}] ${name}: ${rep.status}`);
  if (rep.status === 'FAIL') { for (const x of rep.results.filter((r) => r.status === 'FAIL')) console.log(`  FAIL ${x.id}: ${x.msg}`); results.push({ name, spec, rep }); continue; }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `mr-ad-${name}-`));
  // Say every line first: a line that can't be spoken before the next one starts would get cut off
  spec.lines.forEach((l, i) => run('say', ['-v', 'Samantha', '-r', '205', '-o', path.join(tmp, `raw${i}.aiff`), spoken(l)]));
  const long = spec.lines.map((l, i) => {
    const secs = Number(execFileSync('afinfo', [path.join(tmp, `raw${i}.aiff`)], { encoding: 'utf8' }).match(/estimated duration: ([\d.]+)/)[1]) / VOICE_RATE;
    const room = (spec.lines[i + 1] ? spec.lines[i + 1].from : spec.duration) - l.from - 0.15;
    return secs > room ? `line ${i + 1} takes ${secs.toFixed(1)}s to say but has ${room.toFixed(1)}s` : null;
  }).filter(Boolean);
  if (long.length) {
    rep.status = 'FAIL';
    for (const m of long) rep.results.push({ status: 'FAIL', id: 'R11 voice', msg: `Voice won't fit: ${m}. Shorten the line or give it more time.` });
    fs.writeFileSync(path.join(outDir, `${name}.check.json`), JSON.stringify(rep, null, 2));
    for (const m of long) console.log(`  FAIL R11 voice: ${m}`);
    fs.rmSync(tmp, { recursive: true, force: true });
    results.push({ name, spec, rep });
    continue;
  }
  run('npx', ['electron', path.join(__dirname, 'render.js'), file, path.join(tmp, 'frames')], { cwd: ROOT });
  run('npx', ['electron', path.join(__dirname, 'render.js'), file, outDir, String(spec.lines[0].to - 0.5)], { cwd: ROOT });
  fs.renameSync(path.join(outDir, `t${spec.lines[0].to - 0.5}.png`), path.join(outDir, `${name}.cover.png`));
  run(path.join(BIN, 'encode'), [path.join(tmp, 'frames'), path.join(tmp, 'silent.mp4')]);
  run(path.join(BIN, 'voice'), [path.join(tmp, 'silent.mp4'), path.join(outDir, `${name}.mp4`), tmp, ...spec.lines.map((l) => String(l.from + 0.15))]);
  fs.rmSync(tmp, { recursive: true, force: true });
  results.push({ name, spec, rep });
}

// Two posts a day: 12:00 and 19:00, starting the Monday after the week folder's date
const start = new Date(path.basename(weekDir) + 'T00:00:00');
start.setDate(start.getDate() + ((8 - start.getDay()) % 7 || 7));
const slot = (i) => { const d = new Date(start); d.setDate(d.getDate() + Math.floor(i / 2)); d.setHours(i % 2 ? 19 : 12); return d; };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
let built = 0;
const cards = results.map(({ name, spec, rep }) => {
  const ok = rep.status !== 'FAIL';
  const when = ok ? slot(built++).toLocaleString('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not built';
  const text = `${spec.post.caption}\n\n${spec.post.hashtags.join(' ')}`;
  const flagged = rep.results.filter((r) => r.status !== 'PASS');
  return `<section class="card ${rep.status}">
  ${ok ? `<video src="${name}.mp4" poster="${name}.cover.png" controls playsinline></video>` : '<div class="novid">Blocked by the compliance check</div>'}
  <div class="meta"><h2>${esc(spec.title)}</h2><div class="when">${esc(when)}</div><span class="badge ${rep.status}">${rep.status}</span>
  <p class="trend"><b>Trend:</b> ${esc(spec.trend?.name || '')} <span>(${esc(spec.trend?.source || '')})</span></p>
  <p class="trend"><b>Music:</b> ${esc(spec.audio?.cml ? `Add "${spec.audio.cml}" from TikTok's Commercial Music Library` : 'Voice only (add a Commercial Music Library sound in TikTok if you like)')}</p>
  ${flagged.length ? `<ul class="flags">${flagged.map((f) => `<li class="${f.status}"><b>${f.status}</b> ${esc(f.msg)}</li>`).join('')}</ul>` : ''}
  <textarea readonly>${esc(text)}</textarea><button onclick="navigator.clipboard.writeText(this.previousElementSibling.value);this.textContent='Copied'">Copy caption</button></div>
</section>`;
}).join('\n');
fs.writeFileSync(path.join(outDir, 'review.html'), `<!doctype html><html><head><meta charset="utf-8"><title>Ads for the week of ${esc(start.toDateString())}</title>
<style>
body{font:15px/1.45 -apple-system,system-ui,sans-serif;background:#0b0f14;color:#e6e9f2;margin:0;padding:24px}h1{margin:0 0 6px}.sub{color:#9aa3b8;margin-bottom:20px}
.checklist{background:#151b26;border:1px solid #2a3344;border-radius:12px;padding:14px 18px;margin-bottom:24px}.checklist li{margin:4px 0}
.card{display:flex;gap:20px;background:#151b26;border:1px solid #2a3344;border-radius:14px;padding:16px;margin-bottom:16px}.card.FAIL{opacity:.7}
video,.novid{width:240px;height:427px;border-radius:10px;background:#000;flex:none}.novid{display:flex;align-items:center;justify-content:center;color:#f87171;text-align:center}
.meta{flex:1;min-width:0}h2{margin:0}.when{color:#ffd23f;font-weight:600;margin:4px 0}.badge{display:inline-block;padding:2px 10px;border-radius:20px;font-weight:700;font-size:12px}
.badge.PASS{background:#14532d;color:#86efac}.badge.REVIEW{background:#713f12;color:#fde68a}.badge.FAIL{background:#7f1d1d;color:#fecaca}.trend span{color:#9aa3b8}
.flags{padding-left:18px}.flags .FAIL b{color:#f87171}.flags .REVIEW b{color:#fbbf24}textarea{width:100%;height:90px;background:#0b0f14;color:#e6e9f2;border:1px solid #2a3344;border-radius:8px;padding:8px;font:inherit}
button{margin-top:6px;background:#3d5afe;color:#fff;border:0;border-radius:8px;padding:6px 14px;font-weight:600;cursor:pointer}
@media(max-width:700px){.card{flex-direction:column}video,.novid{width:100%;height:auto;aspect-ratio:9/16}}
</style></head><body>
<h1>Ads for the week of ${esc(start.toDateString())}</h1><div class="sub">${built} ready, ${results.length - built} blocked. Nothing has been posted. Read every REVIEW note before scheduling.</div>
<div class="checklist"><b>When you schedule each one in TikTok (web or app):</b><ol>
<li>Upload the .mp4, paste the caption, pick the date and time shown.</li>
<li>Turn on <b>Content disclosure → Your brand</b> (it promotes your own app).</li>
<li>Turn on <b>AI-generated content</b> (her voice is synthetic).</li>
<li>Set <b>Audience controls → 18+ only</b>.</li>
<li>Music: only a sound from the <b>Commercial Music Library</b>, or none.</li>
<li>Your bio link must go to the website, where the prices match the ad ($19/month, $149/year, free plan).</li>
<li>Don't answer "what should I buy?" comments with picks; point people to the lessons.</li></ol></div>
${cards}
</body></html>`);
console.log(`\nReview page: ${path.join(outDir, 'review.html')}`);
