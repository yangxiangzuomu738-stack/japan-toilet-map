/** 縦書き注記(anno-v)の描画設定を切り替えて、どれが正しく縦に積まれるか比べる */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = process.argv[2] || 'http://127.0.0.1:8765/';
const SHOTS = path.join(__dirname, '..', 'data', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const VARIANTS = [
  { name: 'A-current', apply: 'm.setLayoutProperty("anno-v","text-writing-mode",["vertical"]); m.setLayoutProperty("anno-v","text-max-width",1);' },
  { name: 'B-nomaxwidth', apply: 'm.setLayoutProperty("anno-v","text-writing-mode",["vertical"]); m.setLayoutProperty("anno-v","text-max-width",99);' },
  { name: 'C-both-modes', apply: 'm.setLayoutProperty("anno-v","text-writing-mode",["vertical","horizontal"]); m.setLayoutProperty("anno-v","text-max-width",1);' },
  { name: 'D-horizontal', apply: 'm.setLayoutProperty("anno-v","text-writing-mode",["horizontal"]); m.setLayoutProperty("anno-v","text-max-width",1);' }
];

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 900, height: 700 });
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('loading-state').hidden === true, { timeout: 60000 });

  await page.evaluate(() => {
    ['app-header', 'map-controls', 'map-legend', 'filter-panel', 'detail-panel',
     'loading-state', 'empty-state', 'map-attribution'].forEach(id => {
      const el = document.getElementById(id); if (el) el.style.display = 'none';
    });
    document.getElementById('map-container').style.top = '0';
    const m = window.TMApp.getMap();
    // マーカーを消して注記だけを見る
    ['clusters', 'cluster-count', 'toilets-point', 'selected-marker'].forEach(id => {
      if (m.getLayer(id)) m.setLayoutProperty(id, 'visibility', 'none');
    });
    // 縦書きだけを見るため横書きも消す
    m.setLayoutProperty('anno-h', 'visibility', 'none');
    m.setLayoutProperty('anno-line', 'visibility', 'none');
    // 文字を大きく
    m.setLayoutProperty('anno-v', 'text-size', 20);
    m.jumpTo({ center: [139.7671, 35.6812], zoom: 16 });
  });
  await new Promise(r => setTimeout(r, 5000));

  for (const v of VARIANTS) {
    await page.evaluate(code => {
      const m = window.TMApp.getMap();
      // eslint-disable-next-line no-eval
      eval(code);
    }, v.apply);
    await new Promise(r => setTimeout(r, 4000));
    await page.screenshot({ path: path.join(SHOTS, 'vertical-' + v.name + '.png') });
    console.log('captured ' + v.name);
  }

  await browser.close();
})();
