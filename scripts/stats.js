// Real downloads and installs of Market Radar, from GitHub's own counters.
//   npm run stats                  → report
//   npm run stats -- --baseline    → save today's counts as the zero point
// Everything counted before the baseline was our own release tooling and test copies, so
// the report only shows downloads made after it.
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = 'Jdog1234/market-radar';
const BASE_FILE = path.join(__dirname, 'stats-baseline.json');
const gh = (p) => JSON.parse(execSync(`gh api --paginate "${p}"`, { encoding: 'utf8' }).replace(/\]\s*\[/g, ','));

const releases = gh(`repos/${REPO}/releases?per_page=100`);
const counts = {};
for (const r of releases) for (const a of r.assets) counts[`${r.tag_name}/${a.name}`] = { tag: r.tag_name, name: a.name, n: a.download_count, at: r.published_at };

if (process.argv.includes('--baseline')) {
  fs.writeFileSync(BASE_FILE, JSON.stringify({ at: new Date().toISOString(), counts: Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, v.n])) }, null, 2));
  console.log(`Baseline saved (${Object.keys(counts).length} files). From now on, the report counts only new downloads.`);
  process.exit(0);
}

let base = { at: null, counts: {} };
try {
  base = JSON.parse(fs.readFileSync(BASE_FILE, 'utf8'));
} catch {}
const fresh = (k) => Math.max(0, counts[k].n - (base.counts[k] || 0));
const sum = (pred) => Object.keys(counts).filter((k) => pred(counts[k])).reduce((s, k) => s + fresh(k), 0);

const kind = (name) => (/arm64\.dmg$/.test(name) ? 'Mac (Apple Silicon)' : /x64\.dmg$/.test(name) ? 'Mac (Intel)' : /\.exe$/.test(name) ? 'Windows' : null);
const installers = {};
for (const k of Object.keys(counts)) {
  const t = kind(counts[k].name);
  if (t) installers[t] = (installers[t] || 0) + fresh(k);
}
const totalInstalls = Object.values(installers).reduce((s, n) => s + n, 0);
const updates = Object.keys(counts).filter((k) => /^code-.*\.asar$/.test(counts[k].name)).map((k) => ({ v: counts[k].name.replace(/^code-|\.asar$/g, ''), n: fresh(k), at: counts[k].at }))
  .sort((a, b) => b.at.localeCompare(a.at));
const checks = sum((c) => c.name === 'update.json');

let views = null;
let clones = null;
try {
  views = gh(`repos/${REPO}/traffic/views`);
  clones = gh(`repos/${REPO}/traffic/clones`);
} catch {}

const since = base.at ? `since ${new Date(base.at).toLocaleString()}` : 'all time (no baseline saved yet)';
console.log(`\nMarket Radar — real usage ${since}\n`);
console.log('Downloads of the installer (new people installing the app):');
for (const t of ['Mac (Apple Silicon)', 'Mac (Intel)', 'Windows']) console.log(`  ${t.padEnd(22)} ${installers[t] || 0}`);
console.log(`  ${'Total'.padEnd(22)} ${totalInstalls}\n`);
console.log('Installed apps that updated to each version (≈ active installs; includes your own Mac):');
for (const u of updates.slice(0, 6)) console.log(`  v${u.v.padEnd(10)} ${u.n}`);
console.log(`\nUpdate checks by running apps: ${checks}  (each open app checks on launch and every 3 hours)`);
if (views) console.log(`\nGitHub repo page, last 14 days: ${views.count} views (${views.uniques} people), ${clones.count} clones`);
console.log('\nNot counted here: visits to the website (it has no visitor counter) and Gumroad sales (see gumroad.com/analytics).\n');
