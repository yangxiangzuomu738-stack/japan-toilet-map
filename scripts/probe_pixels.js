/** 何も細工せずに素直に描画し、実際のピクセル色を数えて背景地図が見えているか確かめる */
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
  page.on('pageerror', e => console.log('  pageerror: ' + e.message.slice(0, 120)));
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('loading-state').hidden === true, { timeout: 60000 });

  await page.evaluate(() => window.TMApp.getMap().jumpTo({ center: [139.7671, 35.6812], zoom: 16 }));
  await new Promise(r => setTimeout(r, 8000));

  const info = await page.evaluate(() => {
    const m = window.TMApp.getMap();
    const cv = m.getCanvas();
    // WebGL のバックバッファから直接読む
    const gl = cv.getContext('webgl2') || cv.getContext('webgl');
    const w = cv.width, h = cv.height;
    const px = new Uint8Array(w * h * 4);
    let colors = {};
    if (gl) {
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
      for (let i = 0; i < px.length; i += 4 * 37) { // 間引いて集計
        const k = px[i] + ',' + px[i + 1] + ',' + px[i + 2] + ',' + px[i + 3];
        colors[k] = (colors[k] || 0) + 1;
      }
    }
    const top = Object.entries(colors).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return {
      canvas: [w, h],
      paint: {
        bg: m.getPaintProperty('bg', 'background-color'),
        building: m.getPaintProperty('building', 'fill-color'),
        roadLocal: m.getPaintProperty('road-local', 'line-color'),
        water: m.getPaintProperty('water', 'fill-color')
      },
      layerVisible: {
        building: m.getLayoutProperty('building', 'visibility'),
        roadLocal: m.getLayoutProperty('road-local', 'visibility')
      },
      topColors: top
    };
  });

  console.log('canvas: ' + JSON.stringify(info.canvas));
  console.log('paint : ' + JSON.stringify(info.paint));
  console.log('visible: ' + JSON.stringify(info.layerVisible));
  console.log('上位の色 (R,G,B,A -> 画素数):');
  info.topColors.forEach(([k, v]) => console.log('   ' + k + ' -> ' + v));

  await page.screenshot({ path: path.join(SHOTS, 'pixels-z16-plain.png') });
  await browser.close();
})();
