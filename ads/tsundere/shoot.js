// Takes fresh screenshots of the Learn screens for the ad, from a throwaway copy of the app.
//   npx electron ads/tsundere/shoot.js --use-mock-keychain
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
app.setPath('userData', path.join(os.tmpdir(), 'mr-ad-shoot')); // throwaway profile, kept between runs so the pattern data is cached
const OUT = path.join(__dirname, 'shots');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  try {
    require('../../app-main.js').start({ markHealthy() {}, status: () => ({}), version: 'shoot' });
    await wait(1500);
    const win = BrowserWindow.getAllWindows()[0];
    win.setContentSize(1000, 1400);
    const js = (code) => win.webContents.executeJavaScript(code);
    const waitFor = async (cond, ms = 180000) => {
      for (const end = Date.now() + ms; Date.now() < end; await wait(500)) if (await js(cond)) return wait(700);
      throw new Error('timed out waiting for ' + cond);
    };
    // Screenshot of the area from element `a` (top) to element `b` (bottom), full content width.
    const snap = async (name, a, b = a, pad = 12) => {
      const r = await js(`(() => { const ea = document.querySelector('${a}'); ea.scrollIntoView({ block: 'start' });
        const m = document.querySelector('main').getBoundingClientRect(); const ra = ea.getBoundingClientRect(); const rb = document.querySelector('${b}').getBoundingClientRect();
        const top = Math.max(0, ra.top - ${pad});
        return { x: Math.round(m.left), y: Math.round(top), width: Math.round(m.width), height: Math.round(Math.min(innerHeight, rb.bottom + ${pad}) - top) }; })()`);
      await wait(300);
      fs.writeFileSync(path.join(OUT, name + '.png'), (await win.webContents.capturePage(r)).toPNG());
      console.log('shot', name, JSON.stringify(r));
    };
    await wait(2500);
    await js(`acct = { enabled: true, paywall: true, plan: 'pro' }; document.querySelectorAll('.toast,#scanned').forEach((e) => e.remove()); 1`);

    await js(`document.querySelector('[data-view=school]').click()`); await wait(800);
    await snap('school-home', '#school');
    await js(`document.querySelector('[data-scmod="2"]').click()`); await wait(1200);
    await snap('school-liquidity', '[data-widget=orderbook]');
    await js(`document.querySelector('[data-scback]').click(); document.querySelector('[data-scmod="1"]').click()`); await wait(1200);
    await snap('school-candle', '[data-widget]');

    await js(`document.querySelector('[data-view=puzzles]').click()`); await waitFor(`!!document.querySelector('[data-pzname]')`);
    await js(`document.getElementById('pzLeft').textContent = ''`);
    await snap('puzzle', '.pz-chartcard', '#pzSide');
    await js(`document.querySelector('[data-pzname="' + pz.cur.patternId + '"]').click(); document.querySelector('[data-pzdir="' + (pz.cur.fwd > 0 ? 'up' : 'down') + '"]').click(); document.getElementById('pzCheck').click()`);
    await wait(1500);
    await snap('puzzle-solved', '.pz-score', '#pzSide');

    await js(`document.querySelector('[data-view=patterns]').click()`); await waitFor(`!!document.querySelector('.pl-card')`);
    await snap('library', '#plGrid');
    await js(`document.querySelector('.pl-card[data-pl=hammer]').click()`); await wait(1500);
    await snap('library-hammer', '#plDetail');
  } catch (e) {
    console.error(e);
  }
  app.exit(0);
});
