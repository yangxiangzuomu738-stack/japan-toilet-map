/**
 * shots_gpu.js — 実GPUのChromeで、主要画面のスクリーンショットをまとめて撮る。
 * ヘッドレスのソフトウェア描画では fill / line が出ないため、見た目の確認はこれで行う。
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = process.env.TM_BASE || 'http://127.0.0.1:8765/';
const SHOTS = path.join(__dirname, '..', 'data', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const TOKYO = [139.7671, 35.6812];

async function open(browser, viewport, scheme) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForFunction(() => document.getElementById('loading-state').hidden === true,
    { timeout: 60000 });
  return page;
}

async function settle(page, center, zoom) {
  await page.evaluate((c, z) => window.TMApp.getMap().jumpTo({ center: c, zoom: z }), center, zoom);
  await page.waitForFunction(() => window.TMApp.getMap().areTilesLoaded(), { timeout: 40000 })
    .catch(() => {});
  await new Promise(r => setTimeout(r, 3000));
}

(async () => {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--window-position=-2400,-2400', '--window-size=1600,1100', '--mute-audio']
  });
  try {
    // --- 全国 ---
    let p = await open(browser, { width: 1440, height: 900, deviceScaleFactor: 2 }, 'light');
    await settle(p, [138.5, 37.0], 4.6);
    await p.screenshot({ path: path.join(SHOTS, 'gpu-01-japan.png') });

    // --- 東京・詳細を開く ---
    await settle(p, TOKYO, 16);
    await p.evaluate(async () => {
      const m = window.TMApp.getMap();
      const fs2 = m.queryRenderedFeatures({ layers: ['toilets-point'] });
      const pick = fs2.find(f => f.properties.k === 'yes') || fs2[0];
      if (pick) window.TMApp.showDetail(pick.properties.i);
      await new Promise(r => setTimeout(r, 1500));
    });
    await p.screenshot({ path: path.join(SHOTS, 'gpu-02-detail.png') });

    // --- 絞り込み ---
    await p.evaluate(async () => {
      document.getElementById('close-detail').click();
      document.getElementById('open-filter').click();
      await new Promise(r => setTimeout(r, 600));
    });
    await p.screenshot({ path: path.join(SHOTS, 'gpu-03-filter.png') });

    // --- データについて ---
    await p.evaluate(async () => {
      document.getElementById('close-filter').click();
      document.getElementById('open-info').click();
      await new Promise(r => setTimeout(r, 800));
    });
    await p.screenshot({ path: path.join(SHOTS, 'gpu-04-info.png') });
    await p.close();

    // --- ダークモード ---
    p = await open(browser, { width: 1440, height: 900, deviceScaleFactor: 2 }, 'dark');
    await settle(p, TOKYO, 15);
    await p.screenshot({ path: path.join(SHOTS, 'gpu-05-dark.png') });
    await p.close();

    // --- スマートフォン ---
    p = await open(browser, { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 'light');
    await settle(p, TOKYO, 16);
    await p.screenshot({ path: path.join(SHOTS, 'gpu-06-mobile.png') });
    await p.evaluate(async () => {
      const m = window.TMApp.getMap();
      const fs2 = m.queryRenderedFeatures({ layers: ['toilets-point'] });
      const pick = fs2.find(f => f.properties.k === 'yes') || fs2[0];
      if (pick) window.TMApp.showDetail(pick.properties.i);
      await new Promise(r => setTimeout(r, 1500));
    });
    await p.screenshot({ path: path.join(SHOTS, 'gpu-07-mobile-detail.png') });
    await p.evaluate(async () => {
      document.getElementById('close-detail').click();
      document.getElementById('open-info').click();
      await new Promise(r => setTimeout(r, 800));
    });
    await p.screenshot({ path: path.join(SHOTS, 'gpu-08-mobile-info.png') });
    await p.close();

    // --- 文字サイズ「大」 ---
    p = await open(browser, { width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, 'light');
    await settle(p, TOKYO, 16);
    await p.evaluate(async () => {
      document.getElementById('text-size-large').click();
      document.getElementById('open-filter').click();
      await new Promise(r => setTimeout(r, 800));
    });
    await p.screenshot({ path: path.join(SHOTS, 'gpu-09-mobile-largetext.png') });
    await p.close();

    console.log('スクリーンショットを data/shots/gpu-*.png に保存しました');
  } finally {
    await browser.close();
  }
})();
