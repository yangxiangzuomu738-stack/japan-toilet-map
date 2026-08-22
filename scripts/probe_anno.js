/** 注記(Anno)の vt_arrng / vt_code と実際の描画レイヤを調べる */
const puppeteer = require('puppeteer');

const BASE = process.argv[2] || 'http://127.0.0.1:8765/';

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 800 });
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('loading-state').hidden === true,
    { timeout: 60000 });
  await page.evaluate(() => window.TMApp.getMap().jumpTo({ center: [139.7671, 35.6812], zoom: 16 }));
  await new Promise(r => setTimeout(r, 6000));

  const out = await page.evaluate(() => {
    const m = window.TMApp.getMap();
    // ソースから直接引く（レイヤのフィルタを通さない）
    const feats = m.querySourceFeatures('v', { sourceLayer: 'Anno' });
    const rows = feats.slice(0, 400).map(f => ({
      text: f.properties.vt_text,
      arrng: f.properties.vt_arrng,
      code: f.properties.vt_code,
      geom: f.geometry.type
    }));
    const byArrng = {};
    rows.forEach(r => {
      const k = String(r.arrng);
      (byArrng[k] = byArrng[k] || []).push(r.text);
    });
    const summary = {};
    Object.keys(byArrng).forEach(k => {
      summary[k] = { n: byArrng[k].length, sample: byArrng[k].slice(0, 6) };
    });
    // 実際に描画されているレイヤ別
    const hv = {
      anno_h: m.queryRenderedFeatures({ layers: ['anno-h'] })
        .slice(0, 12).map(f => f.properties.vt_text + '/' + f.properties.vt_arrng),
      anno_v: m.queryRenderedFeatures({ layers: ['anno-v'] })
        .slice(0, 12).map(f => f.properties.vt_text + '/' + f.properties.vt_arrng)
    };
    return { summary, hv, total: feats.length };
  });

  console.log('Anno features in view:', out.total);
  console.log('\n=== vt_arrng ごとの分布 ===');
  Object.keys(out.summary).sort().forEach(k => {
    console.log('  vt_arrng=' + k + '  n=' + out.summary[k].n +
                '  例: ' + JSON.stringify(out.summary[k].sample));
  });
  console.log('\n=== anno-h に描画 ===');
  console.log('  ' + JSON.stringify(out.hv.anno_h));
  console.log('\n=== anno-v に描画 ===');
  console.log('  ' + JSON.stringify(out.hv.anno_v));

  await browser.close();
})();
