// Renders one ad spec to numbered PNG frames (1080x1920, 30fps), or to stills at given seconds.
//   npx electron ads/factory/render.js <spec.json> <outDir> [seconds...]
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const FPS = 30;
const [specFile, outDir, ...rest] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const times = rest.map(Number).filter((n) => !isNaN(n));

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  try {
    const spec = fs.readFileSync(specFile, 'utf8');
    const manifest = fs.readFileSync(path.join(__dirname, 'shots', 'manifest.json'), 'utf8');
    const win = new BrowserWindow({ width: 1080, height: 1920, show: false, useContentSize: true, webPreferences: { offscreen: true } });
    win.webContents.setFrameRate(60);
    await win.loadFile(path.join(__dirname, 'engine.html'));
    await win.webContents.executeJavaScript(`init(${spec}, ${manifest}); document.fonts.ready.then(() => Promise.all([...document.images].map((i) => i.decode().catch(() => {})))).then(() => 1)`);
    const dur = JSON.parse(spec).duration;
    const list = times.length ? times : Array.from({ length: Math.round(dur * FPS) }, (_, i) => i / FPS);
    fs.mkdirSync(outDir, { recursive: true });
    for (let i = 0; i < list.length; i++) {
      // Let the offscreen window paint the new frame before grabbing it.
      await win.webContents.executeJavaScript(`renderAt(${list[i]}); new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))`);
      await new Promise((r) => setTimeout(r, 70));
      const img = (await win.webContents.capturePage()).resize({ width: 1080, height: 1920, quality: 'best' });
      const name = times.length ? `t${list[i]}.png` : `f${String(i).padStart(5, '0')}.png`;
      fs.writeFileSync(path.join(outDir, name), img.toPNG());
      if (i % 150 === 0) console.log(`  frame ${i}/${list.length}`);
    }
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  }
  app.exit(process.exitCode || 0);
});
