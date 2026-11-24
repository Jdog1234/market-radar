#!/usr/bin/env node
// Publish a new version of Market Radar so every installed copy auto-updates.
//
//   1. Bump "version" in package.json (e.g. 1.1.0 → 1.1.1) and commit your changes.
//   2. npm run release -- --notes "What changed"
//
// This builds the update package (code-<version>.asar + update.json) and the installers,
// pushes the app code to the public GitHub repo, and creates a GitHub Release. Installed
// apps find it within 3 hours (or on next launch) and update themselves.
//
// Flags: --notes "text"   release notes shown in the app's update banner
//        --no-installers  skip rebuilding the .dmg/.exe (faster; code-only update)
//        --dry-run        build everything locally, publish nothing
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const asar = require('@electron/asar');

const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const REPO = 'Jdog1234/market-radar';
const CODE_FILES = ['app-main.js', 'preload.js', 'engine', 'renderer', 'RESEARCH.md', 'package.json'];

const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const notesIdx = args.indexOf('--notes');
const notes = notesIdx >= 0 ? args[notesIdx + 1] : '';
const run = (cmd, opts = {}) => execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
const out = (cmd) => execSync(cmd, { cwd: ROOT, encoding: 'utf8' }).trim();

// Fresh stock list from Nasdaq, else the app's own cached copy if under a week old.
async function stockList() {
  try {
    const res = await fetch('https://api.nasdaq.com/api/screener/stocks?tableonly=true&limit=10000&download=true', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36', Accept: 'application/json' },
    });
    if (res.ok) return { at: Date.now(), rows: (await res.json()).data.rows };
  } catch {}
  const home = require('os').homedir();
  for (const dir of [path.join(home, 'Library/Application Support/Market Radar'), path.join(process.env.APPDATA || '', 'Market Radar')]) {
    try {
      const c = JSON.parse(fs.readFileSync(path.join(dir, 'universe.json'), 'utf8'));
      if (Date.now() - c.at < 7 * 864e5) return c;
    } catch {}
  }
  return null;
}

async function main() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const version = pkg.version;
  const shell = Number(fs.readFileSync(path.join(ROOT, 'main.js'), 'utf8').match(/const SHELL_VERSION = (\d+)/)[1]);
  const tag = `v${version}`;
  console.log(`\n▶ Releasing Market Radar ${tag} (launcher ${shell})\n`);

  if (!flag('--dry-run')) {
    if (out('git status --porcelain -- .')) throw new Error('Commit your market-radar changes first (git status shows uncommitted files).');
    const existing = out(`gh release list --repo ${REPO} --limit 100 2>/dev/null || true`);
    if (existing.split('\n').some((l) => l.split('\t').includes(tag))) throw new Error(`${tag} is already released. Bump "version" in package.json.`);
  }

  // 1. Code update package.
  fs.mkdirSync(DIST, { recursive: true });
  const stage = fs.mkdtempSync(path.join(require('os').tmpdir(), 'mr-code-'));
  for (const f of CODE_FILES) fs.cpSync(path.join(ROOT, f), path.join(stage, f), { recursive: true });
  const file = `code-${version}.asar`;
  await asar.createPackage(stage, path.join(DIST, file));
  fs.rmSync(stage, { recursive: true, force: true });
  const sha256 = crypto.createHash('sha256').update(fs.readFileSync(path.join(DIST, file))).digest('hex');
  const manifest = { version, shell, file, sha256, notes, date: new Date().toISOString() };
  fs.writeFileSync(path.join(DIST, 'update.json'), JSON.stringify(manifest, null, 2));
  console.log(`✓ Update package ${file} (${(fs.statSync(path.join(DIST, file)).size / 1024).toFixed(0)} KB)`);

  // 2. Backup copy of the stock list, used by installed apps if Nasdaq refuses them.
  const assets = [path.join(DIST, 'update.json'), path.join(DIST, file)];
  const uni = await stockList();
  if (uni) {
    fs.writeFileSync(path.join(DIST, 'universe.json'), JSON.stringify(uni));
    assets.push(path.join(DIST, 'universe.json'));
    console.log(`✓ Stock list backup (${uni.rows.length} stocks)`);
  } else console.warn('! No fresh stock list available: release has no universe.json backup');

  // 3. Installers, so new downloads start on the latest version.
  if (!flag('--no-installers')) {
    run('npx electron-builder --mac --win --publish never', { env: { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' } });
    for (const f of [`Market-Radar-${version}-arm64.dmg`, `Market-Radar-${version}-x64.dmg`, `Market-Radar-Setup-${version}-x64.exe`]) {
      if (!fs.existsSync(path.join(DIST, f))) throw new Error(`Installer missing: ${f}`);
      assets.push(path.join(DIST, f));
    }
  }

  else if (!flag('--dry-run')) {
    // Code-only release: carry the previous installers forward so the "latest" release
    // page always has downloads. They update themselves to this version on first launch.
    const carry = path.join(DIST, 'carry');
    fs.rmSync(carry, { recursive: true, force: true });
    const prev = out(`gh release view --repo ${REPO} --json tagName --jq .tagName`);
    run(`gh release download ${prev} --repo ${REPO} --pattern "*.dmg" --pattern "*.exe" --dir "${carry}"`);
    for (const f of fs.readdirSync(carry)) assets.push(path.join(carry, f));
  }

  if (flag('--dry-run')) {
    console.log('\n(dry run) Would publish:\n' + assets.map((a) => '  ' + path.basename(a)).join('\n'));
    return;
  }

  // 4. Push the app code to the public repo (only the market-radar folder, nothing else).
  const top = out('git rev-parse --show-toplevel');
  const prefix = path.relative(top, ROOT);
  const remotes = out('git remote');
  if (!remotes.split('\n').includes('market-radar-public')) run(`git remote add market-radar-public https://github.com/${REPO}.git`);
  const split = out(`git -C "${top}" subtree split --prefix="${prefix}"`);
  run(`git -C "${top}" push market-radar-public ${split}:refs/heads/main --force`);

  // 5. GitHub Release. Installed apps read update.json from the latest release.
  const quoted = assets.map((a) => `"${a}"`).join(' ');
  const body = `${notes || 'Improvements and fixes.'}\n\n**Download:** Mac (Apple Silicon) \`arm64.dmg\` · Mac (Intel) \`x64.dmg\` · Windows \`Setup-x64.exe\`.\nAlready installed? The app updates itself automatically.`;
  fs.writeFileSync(path.join(DIST, 'notes.md'), body);
  run(`gh release create ${tag} ${quoted} --repo ${REPO} --title "Market Radar ${tag}" --notes-file "${path.join(DIST, 'notes.md')}" --target main --latest`);
  console.log(`\n✓ Released ${tag}: https://github.com/${REPO}/releases/tag/${tag}\n`);
}

main().catch((e) => {
  console.error(`\n✗ ${e.message}\n`);
  process.exit(1);
});
