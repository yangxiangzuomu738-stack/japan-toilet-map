/** 背景地図が実際に何を描画しているかを層ごとに数える診断スクリプト */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://127.0.0.1:8765/';
const SHOTS = path.join(__dirname, '..', 'data', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('loading-state').hidden === true,
    { timeout: 60000 });

  for (const z of [13, 15, 16, 17, 18]) {
    await page.evaluate(zz => {
      window.TMApp.getMap().jumpTo({ center: [139.7671, 35.6812], zoom: zz });
    }, z);
    await new Promise(r => setTimeout(r, 5000));

    const info = await page.evaluate(() => {
      const m = window.TMApp.getMap();
      const ids = m.getStyle().layers.map(l => l.id);
      const counts = {};
      ids.forEach(id => {
        try {
          const n = m.queryRenderedFeatures({ layers: [id] }).length;
          if (n) counts[id] = n;
        } catch (e) { /* シンボル未読込などは無視 */ }
      });
      const sc = m.style.sourceCaches['v'];
      const tiles = Object.values(sc._tiles).map(t => t.tileID.canonical.z + '/' + t.state);
      return { zoom: m.getZoom(), counts, tiles };
    });
    console.log('--- zoom ' + z + ' ---');
    console.log('  tiles: ' + JSON.stringify(info.tiles));
    console.log('  rendered: ' + JSON.stringify(info.counts));
  }

  // 背景地図だけを撮る（パネル類を消す）
  await page.evaluate(() => {
    ['app-header', 'map-controls', 'map-legend', 'filter-panel', 'detail-panel',
     'loading-state', 'empty-state', 'map-attribution'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = 'none';
    });
    document.getElementById('map-container').style.top = '0';
  });
  for (const z of [14, 16, 18]) {
    await page.evaluate(zz => window.TMApp.getMap().jumpTo({ center: [139.7671, 35.6812], zoom: zz }), z);
    await new Promise(r => setTimeout(r, 5000));
    await page.screenshot({ path: path.join(SHOTS, 'basemap-z' + z + '.png') });
  }

  await browser.close();
})();
