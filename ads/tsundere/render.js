// Renders ad.html to numbered PNG frames (1080x1920).
//   npx electron ads/tsundere/render.js            → all frames at 30fps into frames/
//   npx electron ads/tsundere/render.js 2 9.5 15   → stills at those seconds into stills/
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const FPS = 30;
const times = process.argv.slice(2).map(Number).filter((n) => !isNaN(n));

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1080, height: 1920, show: false, useContentSize: true, webPreferences: { offscreen: true } });
  win.webContents.setFrameRate(60);
  await win.loadFile(path.join(__dirname, 'ad.html'), { query: { render: '1' } });
  await new Promise((r) => setTimeout(r, 800));
  const dur = await win.webContents.executeJavaScript('DURATION');
  const list = times.length ? times : Array.from({ length: Math.round(dur * FPS) }, (_, i) => i / FPS);
  const out = path.join(__dirname, times.length ? 'stills' : 'frames');
  fs.mkdirSync(out, { recursive: true });
  for (let i = 0; i < list.length; i++) {
    // Let the offscreen window paint the new frame before grabbing it.
    await win.webContents.executeJavaScript(`renderAt(${list[i]}); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
    await new Promise((r) => setTimeout(r, 70));
    const img = (await win.webContents.capturePage()).resize({ width: 1080, height: 1920, quality: 'best' });
    const name = times.length ? `t${list[i]}.png` : `f${String(i).padStart(5, '0')}.png`;
    fs.writeFileSync(path.join(out, name), img.toPNG());
    if (i % 90 === 0) console.log(`${i}/${list.length}`);
  }
  app.exit(0);
});
