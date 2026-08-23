/**
 * verify.js — ヘッドレスブラウザで実際に地図を描画し、動作を検証する。
 *
 * 使い方:  node scripts/verify.js [baseUrl]
 * 出力  :  data/shots/*.png と、コンソールへの検証結果
 */
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const BASE = process.argv[2] || 'http://127.0.0.1:8765/';
const SHOTS = path.join(__dirname, '..', 'data', 'shots');
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail: detail === undefined ? '' : String(detail) });
  console.log((ok ? '  OK   ' : '  NG   ') + name + (detail !== undefined ? '  — ' + detail : ''));
}

async function waitForApp(page, ms = 60000) {
  await page.waitForFunction(
    () => document.getElementById('loading-state') &&
          document.getElementById('loading-state').hidden === true,
    { timeout: ms }
  );
}

(async () => {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader',
           '--enable-unsafe-swiftshader', '--disable-dev-shm-usage']
  });

  const consoleErrors = [];
  const failedRequests = [];

  try {
    // ============================ デスクトップ（ライト） ============================
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message));
    page.on('requestfailed', r => failedRequests.push(r.url() + ' :: ' + (r.failure() || {}).errorText));

    console.log('\n=== デスクトップ / ライトモード ===');
    await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    await waitForApp(page);
    check('読み込みオーバーレイが消える', true);

    const state = await page.evaluate(() => {
      const m = window.TMApp.getMap();
      const box = document.getElementById('map-container').getBoundingClientRect();
      return {
        styleLoaded: m.isStyleLoaded(),
        layers: m.getStyle().layers.length,
        hasToilets: !!m.getSource('toilets'),
        mapW: Math.round(box.width), mapH: Math.round(box.height),
        count: window.TMData.store.count,
        detailHidden: document.getElementById('detail-panel').hidden,
        detailDisplay: getComputedStyle(document.getElementById('detail-panel')).display,
        filterHidden: document.getElementById('filter-panel').hidden,
        filterDisplay: getComputedStyle(document.getElementById('filter-panel')).display,
        images: ['marker-yes', 'marker-no', 'marker-unknown',
                 'marker-yes-selected', 'marker-no-selected', 'marker-unknown-selected']
                 .filter(id => m.hasImage(id)),
        facilityImages: ['facility-yes', 'facility-no', 'facility-unknown',
                 'facility-yes-selected', 'facility-no-selected', 'facility-unknown-selected']
                 .filter(id => m.hasImage(id)),
        legendFacility: (document.getElementById('legend-marker-facility') || {}).innerHTML || ''
      };
    });
    check('地図の入れ物に大きさがある', state.mapH > 300, state.mapW + 'x' + state.mapH);
    check('スタイルが読み込まれた', state.styleLoaded, state.layers + ' レイヤ');
    check('トイレのデータ源が登録された', state.hasToilets);
    check('マーカー画像が6種類そろっている', state.images.length === 6, state.images.join(','));
    check('施設マーカー画像が6種類そろっている', state.facilityImages.length === 6,
          state.facilityImages.length + ' 種類');
    check('凡例に施設マーカーが出る', /<svg/.test(state.legendFacility),
          state.legendFacility.slice(0, 40));
    check('データ件数', state.count > 30000, state.count + ' 件');
    check('詳細パネルは初期状態で非表示', state.detailDisplay === 'none',
          'hidden=' + state.detailHidden + ' display=' + state.detailDisplay);
    check('絞り込みパネルは初期状態で非表示', state.filterDisplay === 'none',
          'hidden=' + state.filterHidden + ' display=' + state.filterDisplay);

    // タイルが実際に読めているか
    await new Promise(r => setTimeout(r, 6000));
    const tiles = await page.evaluate(() => {
      const m = window.TMApp.getMap();
      const src = m.style.sourceCaches ? m.style.sourceCaches['v'] : null;
      const ids = src ? Object.keys(src._tiles) : [];
      let loaded = 0;
      if (src) ids.forEach(k => { if (src._tiles[k].state === 'loaded') loaded++; });
      return { total: ids.length, loaded: loaded, areTilesLoaded: m.areTilesLoaded() };
    });
    check('背景地図のタイルが読み込まれている', tiles.loaded > 0,
          tiles.loaded + '/' + tiles.total + ' 枚');

    await page.screenshot({ path: path.join(SHOTS, '01-desktop-light-japan.png') });

    // ---- 東京へ寄る（クラスタ→個別マーカー）----
    await page.evaluate(() => window.TMApp.getMap().jumpTo({ center: [139.7671, 35.6812], zoom: 15 }));
    await new Promise(r => setTimeout(r, 6000));
    await page.screenshot({ path: path.join(SHOTS, '02-desktop-light-tokyo.png') });

    const rendered = await page.evaluate(() => {
      const m = window.TMApp.getMap();
      return {
        markers: m.queryRenderedFeatures({ layers: ['toilets-point'] }).length,
        clusters: m.queryRenderedFeatures({ layers: ['clusters'] }).length,
        basemap: m.queryRenderedFeatures({ layers: ['road-local', 'building', 'water'] }).length
      };
    });
    check('東京でトイレのマーカーが描画される', rendered.markers > 0, rendered.markers + ' 個');
    check('背景地図の地物が描画される', rendered.basemap > 0, rendered.basemap + ' 地物');

    // ---- 詳細パネル ----
    const detail = await page.evaluate(async () => {
      const m = window.TMApp.getMap();
      const f = m.queryRenderedFeatures({ layers: ['toilets-point'] })[0];
      window.TMApp.showDetail(f.properties.i);
      await new Promise(r => setTimeout(r, 1500));
      const g = id => document.getElementById(id).textContent;
      return {
        display: getComputedStyle(document.getElementById('detail-panel')).display,
        name: g('place-name'),
        multi: g('attribute-multi-value'),
        style: g('attribute-style-value'),
        gender: g('attribute-gender-value'),
        unisex: g('attribute-unisex-value'),
        osm: document.getElementById('osm-link').href,
        dir: document.getElementById('directions-link').href
      };
    });
    check('マーカーを選ぶと詳細が開く', detail.display !== 'none', detail.display);
    check('詳細に車いす対応が出る', !!detail.multi, detail.multi);
    check('詳細に便器の種類が出る', !!detail.style, detail.style);
    check('詳細に男女別が出る', !!detail.gender, detail.gender);
    check('OSMへのリンクが正しい', /openstreetmap\.org\/(node|way|relation)\/\d+/.test(detail.osm), detail.osm);
    check('経路案内リンクが正しい', /google\.com\/maps\/dir/.test(detail.dir), detail.dir);
    await page.screenshot({ path: path.join(SHOTS, '03-desktop-detail.png') });

    // ---- 絞り込み ----
    const filtered = await page.evaluate(async () => {
      document.getElementById('close-detail').click();
      document.getElementById('open-filter').click();
      await new Promise(r => setTimeout(r, 300));
      const before = window.TMApp.getMap().getSource('toilets')._data.features.length;
      document.getElementById('filter-multi').click();
      await new Promise(r => setTimeout(r, 1200));
      const after = window.TMApp.getMap().getSource('toilets')._data.features.length;
      return {
        before, after,
        panel: getComputedStyle(document.getElementById('filter-panel')).display
      };
    });
    check('絞り込みパネルが開く', filtered.panel !== 'none', filtered.panel);
    check('「車いす対応あり」で件数が減る', filtered.after < filtered.before && filtered.after > 0,
          filtered.before + ' → ' + filtered.after);
    await page.screenshot({ path: path.join(SHOTS, '04-desktop-filter.png') });

    // ---- 場所（駅・商業施設など）----
    const placeInfo = await page.evaluate(async () => {
      await window.TMData.loadDetails('data/details.json');
      const st = window.TMData.store;
      let withPlace = 0, inside = 0, derived = 0, kinds = {};
      let sample = null, sampleDerived = null;
      for (let i = 0; i < st.count; i++) {
        const r = window.TMData.record(i);
        if (r.place) {
          withPlace++;
          if (r.inside) inside++;
          kinds[r.placeKind] = (kinds[r.placeKind] || 0) + 1;
          if (!sample && r.inside && r.placeKind === 1) sample = { i, place: r.place, text: r.placeText };
        }
        if (r.derived) {
          derived++;
          if (!sampleDerived) sampleDerived = { i, place: r.place };
        }
      }
      return { total: st.count, withPlace, inside, derived, kinds, sample, sampleDerived };
    });
    check('場所が分かるトイレがある', placeInfo.withPlace > 0,
          placeInfo.withPlace + ' / ' + placeInfo.total + ' 件');
    check('駅の中のトイレがある', (placeInfo.kinds[1] || 0) > 0,
          (placeInfo.kinds[1] || 0) + ' 件');
    check('商業施設の中のトイレがある', (placeInfo.kinds[2] || 0) > 0,
          (placeInfo.kinds[2] || 0) + ' 件');
    check('施設に「トイレあり」だけの記録がある', placeInfo.derived > 0,
          placeInfo.derived + ' 件');

    if (placeInfo.sample) {
      const placeDetail = await page.evaluate(async (i) => {
        window.TMApp.showDetail(i);
        await new Promise(r => setTimeout(r, 1200));
        return {
          value: document.getElementById('attribute-place-value').textContent,
          name: document.getElementById('place-name').textContent
        };
      }, placeInfo.sample.i);
      check('詳細に「場所」が出る', /の中|のそば/.test(placeDetail.value), placeDetail.value);
      check('名前が無くても場所名が見出しになる', placeDetail.name.length > 0, placeDetail.name);
    }

    if (placeInfo.sampleDerived) {
      const derivedDetail = await page.evaluate(async (i) => {
        window.TMApp.showDetail(i);
        await new Promise(r => setTimeout(r, 1200));
        const n = document.getElementById('detail-derived-note');
        const shown = !n.hidden;
        document.getElementById('close-detail').click();
        return { shown, text: n.textContent.slice(0, 24) };
      }, placeInfo.sampleDerived.i);
      check('施設のみの記録に注意書きが出る', derivedDetail.shown, derivedDetail.text);
    }

    // 場所の種類での絞り込み
    const placeFilter = await page.evaluate(async () => {
      document.getElementById('open-filter').click();
      await new Promise(r => setTimeout(r, 300));
      // 前の検証で残った条件を消してから測る
      document.getElementById('clear-filters').click();
      await new Promise(r => setTimeout(r, 1200));
      const before = window.TMApp.getMap().getSource('toilets')._data.features.length;
      document.getElementById('filter-place-station').click();
      await new Promise(r => setTimeout(r, 1500));
      const after = window.TMApp.getMap().getSource('toilets')._data.features.length;
      document.getElementById('clear-filters').click();
      await new Promise(r => setTimeout(r, 1200));
      const back = window.TMApp.getMap().getSource('toilets')._data.features.length;
      document.getElementById('close-filter').click();
      return { before, after, back };
    });
    check('「駅・駅ビルの中」で絞り込める',
          placeFilter.after > 0 && placeFilter.after < placeFilter.before,
          placeFilter.before + ' → ' + placeFilter.after);
    check('条件を消すと元に戻る', placeFilter.back === placeFilter.before,
          String(placeFilter.back));

    // 施設名での検索
    if (placeInfo.sample) {
      const facSearch = await page.evaluate(async (word) => {
        const input = document.getElementById('place-search');
        input.value = word;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(r => setTimeout(r, 2500));
        const items = document.querySelectorAll('#search-results .search-result');
        const titles = Array.prototype.map.call(items, el =>
          el.querySelector('.search-result__title').textContent);
        input.value = '';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        return { n: items.length, titles: titles.slice(0, 4) };
      }, placeInfo.sample.place);
      check('施設名でトイレが検索できる',
            facSearch.titles.some(t => t.indexOf(placeInfo.sample.place) !== -1),
            placeInfo.sample.place + ' -> ' + JSON.stringify(facSearch.titles));
    }

    // ---- 一覧パネル ----
    const listInfo = await page.evaluate(async () => {
      document.getElementById('close-filter').click();
      document.getElementById('open-list').click();
      await new Promise(r => setTimeout(r, 2500));
      const items = document.querySelectorAll('#list-items .list-item');
      const first = items[0];
      return {
        display: getComputedStyle(document.getElementById('list-panel')).display,
        n: items.length,
        count: document.getElementById('list-count').textContent,
        name: first ? first.querySelector('.list-item__name').textContent : '',
        meta: first ? first.querySelector('.list-item__meta').textContent : '',
        tags: first ? first.querySelectorAll('.tag').length : 0,
        isButton: first ? first.tagName : '',
        height: first ? Math.round(first.getBoundingClientRect().height) : 0
      };
    });
    check('一覧パネルが開く', listInfo.display !== 'none', listInfo.display);
    check('一覧に項目が並ぶ', listInfo.n > 0, listInfo.n + ' 件 / ' + listInfo.count);
    check('一覧に距離と場所が出る', /から/.test(listInfo.meta), listInfo.meta);
    check('一覧に特徴の札が出る', listInfo.tags > 0, listInfo.tags + ' 個');
    check('一覧の項目はボタン（キーボード操作可）', listInfo.isButton === 'BUTTON', listInfo.isButton);
    check('一覧の項目が64px以上', listInfo.height >= 64, listInfo.height + 'px');

    const listNav = await page.evaluate(async () => {
      const items = document.querySelectorAll('#list-items .list-item');
      items[0].focus();
      const before = document.activeElement === items[0];
      items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      const moved = document.activeElement === items[1];
      return { before, moved };
    });
    check('一覧をキーボードで移動できる', listNav.before && listNav.moved,
          'focus=' + listNav.before + ' 下矢印=' + listNav.moved);

    const listPick = await page.evaluate(async () => {
      document.querySelectorAll('#list-items .list-item')[0].click();
      await new Promise(r => setTimeout(r, 2000));
      return {
        detail: getComputedStyle(document.getElementById('detail-panel')).display,
        name: document.getElementById('place-name').textContent
      };
    });
    check('一覧から選ぶと詳細が開く', listPick.detail !== 'none', listPick.name);
    await page.screenshot({ path: path.join(SHOTS, '13-desktop-list.png') });
    await page.evaluate(() => {
      document.getElementById('close-detail').click();
      document.getElementById('close-list').click();
      document.getElementById('open-filter').click();
    });

    // ---- データについてパネル ----
    const info = await page.evaluate(async () => {
      document.getElementById('close-filter').click();
      document.getElementById('open-info').click();
      await new Promise(r => setTimeout(r, 800));
      const rows = document.querySelectorAll('#info-coverage .coverage-row');
      const first = rows[0];
      return {
        display: getComputedStyle(document.getElementById('info-panel')).display,
        rows: rows.length,
        total: document.getElementById('info-total').textContent,
        updated: document.getElementById('info-updated').textContent,
        sample: first ? first.textContent.replace(/\s+/g, ' ').trim() : '',
        barWidth: first ? first.querySelector('.coverage-row__fill').style.width : '',
        caveat: !!document.getElementById('filter-caveat')
      };
    });
    check('「データについて」が開く', info.display !== 'none', info.display);
    check('記録状況が11項目ぶん出る（場所＋10項目）', info.rows === 11,
          info.rows + ' 行 / 例: ' + info.sample);
    check('掲載件数が表示される', /\d/.test(info.total), info.total);
    check('取得日が表示される', /年/.test(info.updated), info.updated);
    check('割合のバーに幅が入る', /%$/.test(info.barWidth), info.barWidth);
    check('絞り込みに注意書きがある', info.caveat);
    await page.screenshot({ path: path.join(SHOTS, '12-desktop-info.png') });
    await page.evaluate(() => document.getElementById('close-info').click());

    // ---- 「不明」の注記 ----
    const unknownNote = await page.evaluate(async () => {
      const m = window.TMApp.getMap();
      const f = m.queryRenderedFeatures({ layers: ['toilets-point'] })[0];
      window.TMApp.showDetail(f.properties.i);
      await new Promise(r => setTimeout(r, 1200));
      const n = document.getElementById('detail-unknown-note');
      const shown = !n.hidden;
      document.getElementById('close-detail').click();
      return { shown, text: n.textContent.slice(0, 20) };
    });
    check('「不明」の説明が詳細に出る', unknownNote.shown, unknownNote.text);

    // ---- 拡大縮小 ----
    const zoomed = await page.evaluate(async () => {
      const m = window.TMApp.getMap();
      const z0 = m.getZoom();
      document.getElementById('zoom-in').click();
      await new Promise(r => setTimeout(r, 900));
      const z1 = m.getZoom();
      document.getElementById('zoom-out').click();
      document.getElementById('zoom-out').click();
      await new Promise(r => setTimeout(r, 900));
      return { z0, z1, z2: m.getZoom() };
    });
    check('＋ボタンで拡大する', zoomed.z1 > zoomed.z0, zoomed.z0.toFixed(2) + ' → ' + zoomed.z1.toFixed(2));
    check('−ボタンで縮小する', zoomed.z2 < zoomed.z1, zoomed.z1.toFixed(2) + ' → ' + zoomed.z2.toFixed(2));

    // ---- 検索 ----
    const searched = await page.evaluate(async () => {
      document.getElementById('clear-filters').click();
      document.getElementById('close-filter').click();
      const input = document.getElementById('place-search');
      input.value = '札幌市中央区';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 2500));
      const ul = document.getElementById('search-results');
      return { hidden: ul.hidden, n: ul.querySelectorAll('.search-result').length,
               first: (ul.querySelector('.search-result__title') || {}).textContent };
    });
    check('地名検索の候補が出る', !searched.hidden && searched.n > 0,
          searched.n + '件 / 先頭: ' + searched.first);
    await page.screenshot({ path: path.join(SHOTS, '05-desktop-search.png') });

    // ---- 文字サイズ ----
    const textSize = await page.evaluate(async () => {
      document.getElementById('place-search').value = '';
      document.getElementById('place-search').dispatchEvent(new Event('input', { bubbles: true }));
      const probe = document.querySelector('.legend-item');
      const before = getComputedStyle(probe).fontSize;
      document.getElementById('text-size-large').click();
      await new Promise(r => setTimeout(r, 500));
      const after = getComputedStyle(probe).fontSize;
      document.getElementById('text-size-standard').click();
      await new Promise(r => setTimeout(r, 300));
      const back = getComputedStyle(probe).fontSize;
      return { before, after, back };
    });
    check('「大」で文字が大きくなる', parseFloat(textSize.after) > parseFloat(textSize.before),
          textSize.before + ' → ' + textSize.after);
    check('「標準」で元に戻る', textSize.back === textSize.before, textSize.back);

    // ---- ベクター品質（高倍率でも輪郭がぼけない）----
    await page.evaluate(() => window.TMApp.getMap().jumpTo({ center: [139.7671, 35.6812], zoom: 18.5 }));
    await new Promise(r => setTimeout(r, 6000));
    await page.screenshot({ path: path.join(SHOTS, '06-desktop-zoom18.png') });
    const deepZoom = await page.evaluate(() => {
      const m = window.TMApp.getMap();
      return { zoom: m.getZoom(), features: m.queryRenderedFeatures({ layers: ['building'] }).length };
    });
    check('ズーム18でも地物が描画される', deepZoom.features > 0,
          'z=' + deepZoom.zoom.toFixed(1) + ' 建物 ' + deepZoom.features);

    await page.close();

    // ============================ デスクトップ（ダーク） ============================
    console.log('\n=== デスクトップ / ダークモード ===');
    const dark = await browser.newPage();
    await dark.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });
    await dark.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
    dark.on('pageerror', e => consoleErrors.push('dark pageerror: ' + e.message));
    await dark.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    await waitForApp(dark);
    await dark.evaluate(() => window.TMApp.getMap().jumpTo({ center: [139.7671, 35.6812], zoom: 15 }));
    await new Promise(r => setTimeout(r, 6000));
    await dark.screenshot({ path: path.join(SHOTS, '07-desktop-dark-tokyo.png') });
    check('ダークモードでも描画される', true);
    await dark.close();

    // ============================ スマートフォン ============================
    console.log('\n=== スマートフォン (375x812) ===');
    const sp = await browser.newPage();
    await sp.setViewport({ width: 375, height: 812, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await sp.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    sp.on('pageerror', e => consoleErrors.push('sp pageerror: ' + e.message));
    await sp.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
    await waitForApp(sp);
    await sp.evaluate(() => window.TMApp.getMap().jumpTo({ center: [139.7671, 35.6812], zoom: 15 }));
    await new Promise(r => setTimeout(r, 6000));
    await sp.screenshot({ path: path.join(SHOTS, '08-mobile-tokyo.png') });

    const spOverflow = await sp.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth
    }));
    check('スマホで横スクロールが発生しない', spOverflow.scrollW <= spOverflow.clientW + 1,
          spOverflow.scrollW + ' / ' + spOverflow.clientW);

    const spTap = await sp.evaluate(() => {
      const ids = ['zoom-in', 'zoom-out', 'locate-me', 'reset-bearing', 'open-filter',
                   'text-size-standard', 'text-size-large'];
      return ids.map(id => {
        const r = document.getElementById(id).getBoundingClientRect();
        return { id, w: Math.round(r.width), h: Math.round(r.height) };
      }).filter(x => x.w < 44 || x.h < 44);
    });
    check('主要ボタンのタップ領域が44px以上', spTap.length === 0, JSON.stringify(spTap));

    await sp.evaluate(async () => {
      const m = window.TMApp.getMap();
      const f = m.queryRenderedFeatures({ layers: ['toilets-point'] })[0];
      if (f) window.TMApp.showDetail(f.properties.i);
      await new Promise(r => setTimeout(r, 1500));
    });
    await sp.screenshot({ path: path.join(SHOTS, '09-mobile-detail.png') });

    await sp.evaluate(async () => {
      document.getElementById('close-detail').click();
      document.getElementById('open-filter').click();
      await new Promise(r => setTimeout(r, 500));
    });
    await sp.screenshot({ path: path.join(SHOTS, '10-mobile-filter.png') });

    // 幅320pxの小型スマホ
    await sp.setViewport({ width: 320, height: 640, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await new Promise(r => setTimeout(r, 1500));
    const tinyOverflow = await sp.evaluate(() => ({
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth
    }));
    check('幅320pxでも横スクロールが発生しない', tinyOverflow.scrollW <= tinyOverflow.clientW + 1,
          tinyOverflow.scrollW + ' / ' + tinyOverflow.clientW);
    await sp.screenshot({ path: path.join(SHOTS, '11-mobile-320.png') });
    await sp.close();

  } catch (err) {
    check('検証の実行', false, err.message);
    console.error(err);
  } finally {
    await browser.close();
  }

  console.log('\n=== コンソールエラー ===');
  if (consoleErrors.length === 0) console.log('  なし');
  else consoleErrors.slice(0, 15).forEach(e => console.log('  ! ' + e));

  console.log('\n=== 失敗したリクエスト ===');
  if (failedRequests.length === 0) console.log('  なし');
  else failedRequests.slice(0, 15).forEach(e => console.log('  ! ' + e));

  const ng = results.filter(r => !r.ok);
  console.log('\n===== 結果: ' + (results.length - ng.length) + '/' + results.length + ' 合格 =====');
  if (ng.length) {
    console.log('不合格:');
    ng.forEach(r => console.log('  - ' + r.name + ' — ' + r.detail));
  }
  fs.writeFileSync(path.join(__dirname, '..', 'data', 'verify-result.json'),
    JSON.stringify({ results, consoleErrors, failedRequests }, null, 2));
  process.exit(ng.length ? 1 : 0);
})();
