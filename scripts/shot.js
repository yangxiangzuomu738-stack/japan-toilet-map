/**
 * shot.js — 実GPUのChromeで地図を描画してスクリーンショットを撮る。
 *
 * ヘッドレスのソフトウェア描画(SwiftShader)では fill / line のシェーダが
 * コンパイルできず、背景地図が描画されないことがある。
 * 見た目の確認は必ずこのスクリプト（実GPU）で行うこと。
 *
 * 使い方: node scripts/shot.js [名前] [lon] [lat] [zoom] [light|dark] [幅] [高さ]
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const [, , name = 'gpu', lon = '139.7671', lat = '35.6812', zoom = '16',
  scheme = 'light', w = '1200', h = '800', hideUi = 'ui'] = process.argv;

const BASE = process.env.TM_BASE || 'http://127.0.0.1:8765/';
const SHOTS = path.join(__dirname, '..', 'data', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      '--no-sandbox',
      '--window-position=-2400,-2400',   // 画面外に出して邪魔にならないようにする
      '--window-size=' + w + ',' + (Number(h) + 120),
      '--disable-features=Translate,MediaRouter',
      '--mute-audio'
    ],
    defaultViewport: { width: Number(w), height: Number(h), deviceScaleFactor: 2 }
  });
  try {
    const page = await browser.newPage();
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    const errs = [];
    page.on('pageerror', e => errs.push(e.message.slice(0, 160)));
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForFunction(() => document.getElementById('loading-state').hidden === true,
      { timeout: 60000 });

    if (hideUi === 'map') {
      await page.evaluate(() => {
        ['app-header', 'map-controls', 'map-legend', 'filter-panel', 'detail-panel',
         'loading-state', 'empty-state', 'map-attribution'].forEach(id => {
          const el = document.getElementById(id); if (el) el.style.display = 'none';
        });
        document.getElementById('map-container').style.top = '0';
        window.TMApp.getMap().resize();
      });
    }

    await page.evaluate((o, a, z) => {
      window.TMApp.getMap().jumpTo({ center: [Number(o), Number(a)], zoom: Number(z) });
    }, lon, lat, zoom);

    // タイルが出そろうまで待つ
    await page.waitForFunction(() => window.TMApp.getMap().areTilesLoaded(), { timeout: 40000 })
      .catch(() => {});
    await new Promise(r => setTimeout(r, 3500));

    const gl = await page.evaluate(() => {
      const c = document.createElement('canvas');
      const g = c.getContext('webgl2') || c.getContext('webgl');
      const d = g && g.getExtension('WEBGL_debug_renderer_info');
      return g && d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'unknown';
    });

    const out = path.join(SHOTS, name + '.png');
    await page.screenshot({ path: out });
    console.log('renderer : ' + gl);
    console.log('errors   : ' + (errs.length ? errs.join(' | ') : 'なし'));
    console.log('saved    : ' + out);
  } finally {
    await browser.close();
  }
})();
