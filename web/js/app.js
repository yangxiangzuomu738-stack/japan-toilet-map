/*!
 * app.js — 画面の結線と地図ロジック
 *
 * デザイン（配色・レイアウト・アイコン）は web/styles.css、web/design/icons.js、
 * web/js/palette.js に定義されたものをそのまま使う。ここでは色を新たに決めない。
 */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  var DATA_POINTS = 'data/points.json';
  var DATA_DETAILS = 'data/details.json';
  var DATA_META = 'data/meta.json';

  // 地図を動かせる範囲（小笠原・南西諸島まで含む）
  // 縦長のスマホでも沖縄から北海道まで一度に収まるよう、実際の国土より少し広く取る
  var JAPAN_BOUNDS = [[112.0, 14.0], [164.0, 51.0]];
  // 起動時に画面へ収める範囲（沖縄本島から北海道まで）
  var HOME_BOUNDS = [[126.5, 25.8], [146.5, 45.6]];
  var INITIAL = { center: [138.5, 37.0], zoom: 4.6 };

  var map = null;
  var filter = window.TMData.defaultFilter();
  var selectedIndex = null;
  var userPosition = null;
  var currentGeoJSON = { type: 'FeatureCollection', features: [] };

  // ---------------------------------------------------------------- アイコン
  var ICON_SLOTS = {
    'brand-icon': 'toilet',
    'search-icon': 'search',
    'clear-search': 'close',
    'zoom-in': 'plus',
    'zoom-out': 'minus',
    'locate-me': 'currentLocation',
    'reset-bearing': 'compass',
    'open-filter': 'filter',
    'close-filter': 'close',
    'close-detail': 'close',
    'open-info': 'info',
    'close-info': 'close',
    'open-list': 'list',
    'close-list': 'close',
    'directions-icon': 'directions',
    'empty-state-icon': 'empty',
    'attribute-multi-icon': 'accessible',
    'attribute-style-icon': 'seated',
    'attribute-gender-icon': 'male',
    'attribute-unisex-icon': 'unisex',
    'attribute-baby-icon': 'baby',
    'attribute-ostomate-icon': 'ostomate',
    'attribute-fee-icon': 'paid',
    'attribute-hours-icon': 'clock',
    'attribute-access-icon': 'public',
    'attribute-operator-icon': 'operator'
  };

  function paintIcons() {
    Object.keys(ICON_SLOTS).forEach(function (id) {
      var el = $(id);
      if (el && window.TMIcons[ICON_SLOTS[id]]) el.innerHTML = window.TMIcons[ICON_SLOTS[id]];
    });
    ['yes', 'no', 'unknown'].forEach(function (k) {
      var el = $('legend-marker-' + k);
      if (el) el.innerHTML = window.TMIcons.marker(k, false);
    });
  }

  // ------------------------------------------------- CSS 変数から色を読み出す
  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }

  function markerColors() {
    return {
      yes: cssVar('--primary-strong', '#005560'),
      no: cssVar('--danger', '#a52920'),
      unknown: cssVar('--unknown', '#596a77')
    };
  }

  // ------------------------------------------- SVG マーカーを地図用画像にする
  var MARKER_W = 32, MARKER_H = 40, MARKER_PR = 3;

  function svgToImageData(svg, w, h, pr) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.decoding = 'sync';
      img.onload = function () {
        var cv = document.createElement('canvas');
        cv.width = Math.round(w * pr);
        cv.height = Math.round(h * pr);
        var ctx = cv.getContext('2d');
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        resolve(ctx.getImageData(0, 0, cv.width, cv.height));
      };
      img.onerror = function () { reject(new Error('マーカー画像の生成に失敗しました')); };
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    });
  }

  function markerSvg(kind, selected, color) {
    var svg = window.TMIcons.marker(kind, selected);
    // currentColor を実際の色に置き換え、ラスタライズできるよう寸法を明示する
    svg = svg.replace(/currentColor/g, color);
    svg = svg.replace('<svg ', '<svg width="' + (MARKER_W * MARKER_PR) + '" height="' + (MARKER_H * MARKER_PR) + '" ');
    return svg;
  }

  function loadMarkerImages() {
    var colors = markerColors();
    var jobs = [];
    ['yes', 'no', 'unknown'].forEach(function (kind) {
      [false, true].forEach(function (sel) {
        var id = 'marker-' + kind + (sel ? '-selected' : '');
        jobs.push(
          svgToImageData(markerSvg(kind, sel, colors[kind]), MARKER_W, MARKER_H, MARKER_PR)
            .then(function (data) {
              if (map.hasImage(id)) map.removeImage(id);
              map.addImage(id, data, { pixelRatio: MARKER_PR });
            })
        );
      });
    });
    return Promise.all(jobs);
  }

  // ---------------------------------------------------------------- 地図の初期化
  function buildStyle() {
    var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    return window.TMBasemap.build(window.TMPalette, dark ? 'dark' : 'light');
  }

  function initMap() {
    map = new maplibregl.Map({
      container: 'map-container',
      style: buildStyle(),
      center: INITIAL.center,
      zoom: INITIAL.zoom,
      minZoom: 3.5,
      maxZoom: 19,
      maxBounds: JAPAN_BOUNDS,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
      hash: false
    });
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
    // 出典表記は index.html の .map-attribution（デザイン担当が設計）で常時表示するため、
    // MapLibre の AttributionControl は重複を避けて使わない。
    return map;
  }

  // ---------------------------------------------------------------- レイヤ
  function addLayers() {
    var primary = cssVar('--primary-strong', '#005560');
    var paper = cssVar('--paper', '#ffffff');
    var focus = cssVar('--focus', '#005fcc');

    map.addSource('toilets', {
      type: 'geojson',
      data: currentGeoJSON,
      cluster: true,
      clusterRadius: 55,
      clusterMaxZoom: 14
    });

    map.addLayer({
      id: 'clusters',
      type: 'circle',
      source: 'toilets',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': primary,
        'circle-stroke-color': paper,
        'circle-stroke-width': 4,
        'circle-radius': [
          'step', ['get', 'point_count'],
          20, 10, 24, 50, 28, 200, 32, 1000, 36
        ]
      }
    });

    map.addLayer({
      id: 'cluster-count',
      type: 'symbol',
      source: 'toilets',
      filter: ['has', 'point_count'],
      layout: {
        'text-field': ['get', 'point_count_abbreviated'],
        'text-font': ['literal', ['NotoSansJP-Regular']],
        'text-size': 15,
        'text-allow-overlap': true
      },
      paint: { 'text-color': paper }
    });

    map.addLayer({
      id: 'toilets-point',
      type: 'symbol',
      source: 'toilets',
      filter: ['!', ['has', 'point_count']],
      layout: {
        'icon-image': ['concat', 'marker-', ['get', 'k']],
        'icon-size': 1,
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      }
    });

    // 選択中の 1 件
    map.addSource('selected', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'selected-marker',
      type: 'symbol',
      source: 'selected',
      layout: {
        'icon-image': ['concat', 'marker-', ['get', 'k'], '-selected'],
        'icon-size': 1.25,
        'icon-anchor': 'bottom',
        'icon-allow-overlap': true,
        'icon-ignore-placement': true
      }
    });

    // 現在地
    map.addSource('userpos', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: 'userpos-halo',
      type: 'circle',
      source: 'userpos',
      paint: { 'circle-color': focus, 'circle-opacity': 0.18, 'circle-radius': 26 }
    });
    map.addLayer({
      id: 'userpos-dot',
      type: 'circle',
      source: 'userpos',
      paint: {
        'circle-color': focus,
        'circle-radius': 8,
        'circle-stroke-color': paper,
        'circle-stroke-width': 3
      }
    });
  }

  // ---------------------------------------------------------------- 表示更新
  function refresh() {
    currentGeoJSON = window.TMData.toGeoJSON(filter);
    var src = map.getSource('toilets');
    if (src) src.setData(currentGeoJSON);
    updateEmptyState();
    renderList();
  }

  function updateEmptyState() {
    if (!map || !window.TMData.store.ready) return;
    var n = window.TMData.inBounds(filter, map.getBounds(), 1).length;
    var el = $('empty-state');
    el.hidden = n > 0;
  }

  // ---------------------------------------------------------------- 詳細表示
  function fmtDistance(m) {
    if (m < 1000) return '約' + Math.round(m / 10) * 10 + ' m';
    return '約' + (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km';
  }

  function haversine(a, b) {
    var R = 6371000, toRad = Math.PI / 180;
    var dLat = (b[1] - a[1]) * toRad, dLon = (b[0] - a[0]) * toRad;
    var la1 = a[1] * toRad, la2 = b[1] * toRad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function setAttr(id, value, unknown) {
    var el = $(id);
    if (!el) return;
    el.textContent = value;
    el.classList.toggle('attribute-row__value--unknown', !!unknown);
  }

  function genderText(c) {
    var L = window.TMData.LABEL.yesno;
    if (c.male === 1 && c.female === 1) return '男子・女子トイレあり';
    if (c.male === 1 && c.female !== 1) return '男子トイレあり（女子トイレは' + L[c.female] + '）';
    if (c.female === 1 && c.male !== 1) return '女子トイレあり（男子トイレは' + L[c.male] + '）';
    if (c.male === 2 && c.female === 2) return 'なし';
    return '不明';
  }

  function showDetail(i) {
    selectedIndex = i;
    var go = function () {
      var r = window.TMData.record(i);

      $('place-name').textContent = r.name || '名前の情報はありません';
      var sub = [];
      if (r.pref) sub.push(r.pref);
      if (userPosition) sub.push('現在地から' + fmtDistance(haversine(userPosition, [r.lon, r.lat])));
      $('place-address').textContent = sub.join(' ・ ');

      setAttr('attribute-multi-value', r.text.multi, r.code.multi === 0);
      setAttr('attribute-style-value', r.text.style, r.code.style === 0);
      setAttr('attribute-gender-value', genderText(r.code), r.code.male === 0 && r.code.female === 0);
      setAttr('attribute-unisex-value', r.text.unisex, r.code.unisex === 0);
      setAttr('attribute-baby-value', r.text.baby, r.code.baby === 0);
      setAttr('attribute-ostomate-value', r.text.ostomate, r.code.ostomate === 0);
      setAttr('attribute-fee-value', r.text.fee, r.code.fee === 0);
      setAttr('attribute-hours-value', r.hours ? (r.code.h24 === 1 ? '24時間' : r.hours) : '不明', !r.hours);
      setAttr('attribute-access-value', r.text.access, r.code.access === 0);
      setAttr('attribute-operator-value', r.operator || '不明', !r.operator);

      var unknownCount = 0;
      Object.keys(r.code).forEach(function (k) { if (r.code[k] === 0) unknownCount++; });
      if (!r.hours) unknownCount++;
      if (!r.operator) unknownCount++;
      var note = $('detail-unknown-note');
      if (note) note.hidden = unknownCount === 0;

      $('directions-link').href =
        'https://www.google.com/maps/dir/?api=1&destination=' + r.lat + ',' + r.lon;
      var ou = window.TMData.osmUrl(r.osmid);
      var osmLink = $('osm-link');
      if (ou) { osmLink.href = ou; osmLink.hidden = false; } else { osmLink.hidden = true; }

      map.getSource('selected').setData({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [r.lon, r.lat] },
          properties: { k: window.TMData.markerKind(window.TMData.store.flags[i]) }
        }]
      });

      openPanel('detail-panel');
    };

    if (window.TMData.store.details) go();
    else window.TMData.loadDetails(DATA_DETAILS).then(go).catch(function (e) { toast(e.message); });
  }

  function clearSelection() {
    selectedIndex = null;
    if (map.getSource('selected')) {
      map.getSource('selected').setData({ type: 'FeatureCollection', features: [] });
    }
  }

  // ---------------------------------------------------------------- パネル制御
  function openPanel(id) {
    var el = $(id);
    el.hidden = false;
    el.setAttribute('aria-hidden', 'false');
    if (id === 'filter-panel') $('open-filter').setAttribute('aria-expanded', 'true');
    if (id === 'info-panel') $('open-info').setAttribute('aria-expanded', 'true');
    if (id === 'list-panel') {
      $('open-list').setAttribute('aria-expanded', 'true');
      renderList();
    }
  }

  function closePanel(id) {
    var el = $(id);
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    if (id === 'filter-panel') $('open-filter').setAttribute('aria-expanded', 'false');
    if (id === 'info-panel') $('open-info').setAttribute('aria-expanded', 'false');
    if (id === 'list-panel') $('open-list').setAttribute('aria-expanded', 'false');
    if (id === 'detail-panel') clearSelection();
  }

  // ------------------------------------------------ 「この範囲のトイレ」一覧
  var LIST_LIMIT = 50;
  var listSort = 'distance';

  function tagsFor(code) {
    var out = [];
    if (code.multi === 1) out.push(['multi', '車いす対応']);
    if (code.style === 1) out.push(['style', '洋式']);
    else if (code.style === 2) out.push(['style', '和式']);
    else if (code.style === 3) out.push(['style', '洋式・和式']);
    if (code.h24 === 1) out.push(['hours', '24時間']);
    if (out.length === 0) out.push(['unknown', '情報が少ない場所']);
    return out.slice(0, 3);
  }

  function renderList() {
    var panel = $('list-panel');
    if (!panel || panel.hidden) return;

    var center = map.getCenter();
    var c = [center.lng, center.lat];
    var idx = window.TMData.inBounds(filter, map.getBounds(), 0);

    var items = idx.map(function (i) {
      return { i: i, d: haversine(c, [window.TMData.store.lon[i], window.TMData.store.lat[i]]) };
    });

    var total = items.length;
    var shown;
    if (listSort === 'name') {
      var det = window.TMData.store.details;
      items.sort(function (a, b) {
        var na = det && det[a.i] && det[a.i][0] ? 0 : 1;
        var nb = det && det[b.i] && det[b.i][0] ? 0 : 1;
        return na !== nb ? na - nb : a.d - b.d;
      });
      shown = items.slice(0, LIST_LIMIT);
    } else if (total > 3000) {
      // 件数が多いときは全体を並べ替えず、近い順に必要な数だけ選び出す
      shown = [];
      for (var k = 0; k < total; k++) {
        var it2 = items[k];
        if (shown.length < LIST_LIMIT) {
          shown.push(it2);
          if (shown.length === LIST_LIMIT) shown.sort(function (a, b) { return a.d - b.d; });
        } else if (it2.d < shown[LIST_LIMIT - 1].d) {
          shown[LIST_LIMIT - 1] = it2;
          for (var j = LIST_LIMIT - 1; j > 0 && shown[j].d < shown[j - 1].d; j--) {
            var t = shown[j]; shown[j] = shown[j - 1]; shown[j - 1] = t;
          }
        }
      }
      shown.sort(function (a, b) { return a.d - b.d; });
    } else {
      items.sort(function (a, b) { return a.d - b.d; });
      shown = items.slice(0, LIST_LIMIT);
    }

    $('list-count').textContent = '表示中 ' + total.toLocaleString('ja-JP') + ' 件';
    $('list-note').hidden = total <= LIST_LIMIT;
    $('list-empty').hidden = total > 0;

    var ul = $('list-items');
    var tpl = $('list-item-template');
    ul.innerHTML = '';
    if (!tpl) return;

    shown.forEach(function (it) {
      var r = window.TMData.record(it.i);
      var node = tpl.content.cloneNode(true);
      var li = node.querySelector('.list-items__item');
      var btn = node.querySelector('.list-item');

      var kind = window.TMData.markerKind(window.TMData.store.flags[it.i]);
      var markerEl = node.querySelector('.list-item__marker');
      markerEl.classList.add('list-item__marker--' + kind);
      markerEl.innerHTML = window.TMIcons.marker(kind, false);
      node.querySelector('.list-item__name').textContent = r.name || '名前の情報はありません';
      node.querySelector('.list-item__meta').textContent =
        '地図の中心から ' + fmtDistance(it.d) + (r.pref ? ' ・ ' + r.pref : '');

      var tagBox = node.querySelector('.list-item__tags');
      tagBox.innerHTML = '';
      tagsFor(r.code).forEach(function (t) {
        var span = document.createElement('span');
        span.className = 'tag tag--' + t[0];
        span.textContent = t[1];
        tagBox.appendChild(span);
      });

      if (selectedIndex === it.i) btn.setAttribute('aria-current', 'true');
      btn.addEventListener('click', function () {
        map.flyTo({ center: [r.lon, r.lat], zoom: Math.max(map.getZoom(), 17), duration: 800 });
        showDetail(it.i);
        renderList();
      });

      ul.appendChild(li);
    });
  }

  /** 一覧の中を上下矢印で移動できるようにする */
  function bindListKeys() {
    $('list-items').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var buttons = Array.prototype.slice.call(this.querySelectorAll('.list-item'));
      var at = buttons.indexOf(document.activeElement);
      if (at === -1) return;
      e.preventDefault();
      var next = e.key === 'ArrowDown' ? at + 1 : at - 1;
      if (next >= 0 && next < buttons.length) buttons[next].focus();
    });
  }

  // -------------------------------------------------- 「データについて」パネル
  var COVERAGE_LABELS = [
    ['multi', '多目的トイレ（車いす対応）'],
    ['style', '便器の種類（洋式・和式）'],
    ['male', '男子トイレの有無'],
    ['female', '女子トイレの有無'],
    ['unisex', '共用の有無'],
    ['baby', 'おむつ交換台'],
    ['ostomate', 'オストメイト対応'],
    ['fee', '料金'],
    ['access', '利用条件'],
    ['h24', '利用時間']
  ];

  function fillInfoPanel(meta) {
    var total = meta.count || 0;
    $('info-total').textContent = total.toLocaleString('ja-JP') + ' 件';

    var d = new Date(meta.generated);
    $('info-updated').textContent = isNaN(d.getTime())
      ? '不明'
      : d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';

    var list = $('info-coverage');
    var tpl = $('coverage-row-template');
    if (!list || !tpl) return;
    list.innerHTML = '';
    COVERAGE_LABELS.forEach(function (pair) {
      var key = pair[0], label = pair[1];
      var n = (meta.known && meta.known[key]) || 0;
      var pct = total ? (n * 100 / total) : 0;
      var node = tpl.content.cloneNode(true);
      node.querySelector('.coverage-row__label').textContent = label;
      node.querySelector('.coverage-row__value').textContent =
        pct.toFixed(1) + '%（' + n.toLocaleString('ja-JP') + '件）';
      node.querySelector('.coverage-row__fill').style.width = pct.toFixed(1) + '%';
      list.appendChild(node);
    });
  }

  function loadMeta() {
    return fetch(DATA_META, { cache: 'default' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (meta) { if (meta) fillInfoPanel(meta); })
      .catch(function () { /* 「データについて」が出せなくても地図は使える */ });
  }

  // ---------------------------------------------------------------- トースト
  var toastTimer = null;
  function toast(message) {
    var region = $('toast-region');
    region.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'loading-state';
    box.style.position = 'static';
    box.style.transform = 'none';
    box.style.width = 'auto';
    box.style.pointerEvents = 'auto';
    box.textContent = message;
    region.appendChild(box);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { region.innerHTML = ''; }, 5000);
  }

  // ---------------------------------------------------------------- 検索
  var searchTimer = null;

  function renderResults(items) {
    var ul = $('search-results');
    ul.innerHTML = '';
    if (!items.length) { ul.hidden = true; $('place-search').setAttribute('aria-expanded', 'false'); return; }
    items.forEach(function (it, idx) {
      var li = document.createElement('li');
      li.setAttribute('role', 'presentation');
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'search-result';
      btn.id = 'search-result-' + (idx + 1);
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', 'false');
      btn.innerHTML =
        '<span class="search-result__icon icon-slot" aria-hidden="true">' +
        window.TMIcons[it.kind === 'toilet' ? 'toilet' : 'location'] + '</span>' +
        '<span class="search-result__text"><span class="search-result__title"></span>' +
        '<span class="search-result__address"></span></span>';
      btn.querySelector('.search-result__title').textContent = it.title;
      btn.querySelector('.search-result__address').textContent = it.sub || '';
      btn.addEventListener('click', function () {
        ul.hidden = true;
        $('place-search').setAttribute('aria-expanded', 'false');
        map.flyTo({ center: it.center, zoom: it.zoom || 16, duration: 900 });
        if (it.index != null) showDetail(it.index);
      });
      li.appendChild(btn);
      ul.appendChild(li);
    });
    ul.hidden = false;
    $('place-search').setAttribute('aria-expanded', 'true');
  }

  function searchLocalNames(q, limit) {
    var out = [];
    var d = window.TMData.store.details;
    if (!d) return out;
    var lower = q.toLowerCase();
    for (var i = 0; i < d.length && out.length < limit; i++) {
      var nm = d[i][0];
      if (nm && nm.toLowerCase().indexOf(lower) !== -1) {
        out.push({
          kind: 'toilet',
          title: nm,
          sub: window.TMData.PREF_NAMES[(window.TMData.store.flags[i] >> 20) & 63] || '',
          center: [window.TMData.store.lon[i], window.TMData.store.lat[i]],
          zoom: 17,
          index: i
        });
      }
    }
    return out;
  }

  function doSearch(q) {
    if (!q || q.trim().length < 1) { renderResults([]); return; }
    var local = searchLocalNames(q.trim(), 4);
    fetch('https://msearch.gsi.go.jp/address-search/AddressSearch?q=' + encodeURIComponent(q.trim()))
      .then(function (r) { return r.ok ? r.json() : []; })
      .catch(function () { return []; })
      .then(function (arr) {
        var places = (arr || []).slice(0, 6).map(function (f) {
          return {
            kind: 'place',
            title: f.properties.title,
            sub: '住所・地名',
            center: f.geometry.coordinates,
            zoom: 16
          };
        });
        renderResults(local.concat(places));
      });
  }

  // ---------------------------------------------------------------- 現在地
  function locate() {
    if (!navigator.geolocation) { toast('この端末では現在地を取得できません'); return; }
    toast('現在地を調べています…');
    navigator.geolocation.getCurrentPosition(function (pos) {
      userPosition = [pos.coords.longitude, pos.coords.latitude];
      map.getSource('userpos').setData({
        type: 'FeatureCollection',
        features: [{ type: 'Feature', geometry: { type: 'Point', coordinates: userPosition }, properties: {} }]
      });
      map.flyTo({ center: userPosition, zoom: 16, duration: 1000 });
      $('toast-region').innerHTML = '';
    }, function (err) {
      var msg = err.code === 1
        ? '現在地の利用が許可されていません。ブラウザの設定をご確認ください。'
        : '現在地を取得できませんでした。';
      toast(msg);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  // ---------------------------------------------------------------- 絞り込み
  var FILTER_IDS = {
    'filter-multi': 'multi',
    'filter-seated': 'seated',
    'filter-squat': 'squat',
    'filter-gendered': 'separated',
    'filter-unisex': 'unisex',
    'filter-baby': 'baby',
    'filter-ostomate': 'ostomate',
    'filter-24hours': 'h24',
    'filter-free': 'free',
    'filter-public': 'anyone'
  };

  function readFilters() {
    Object.keys(FILTER_IDS).forEach(function (id) {
      var el = $(id);
      if (el) filter[FILTER_IDS[id]] = el.checked;
    });
  }

  function bindUI() {
    $('zoom-in').addEventListener('click', function () { map.zoomIn({ duration: 250 }); });
    $('zoom-out').addEventListener('click', function () { map.zoomOut({ duration: 250 }); });
    $('locate-me').addEventListener('click', locate);
    $('reset-bearing').addEventListener('click', function () { map.easeTo({ bearing: 0, pitch: 0, duration: 400 }); });

    $('open-filter').addEventListener('click', function () {
      var panel = $('filter-panel');
      if (panel.hidden) openPanel('filter-panel'); else closePanel('filter-panel');
    });
    $('close-filter').addEventListener('click', function () { closePanel('filter-panel'); });
    $('open-list').addEventListener('click', function () {
      var panel = $('list-panel');
      if (panel.hidden) {
        // 名前を出すために詳細データが要る
        window.TMData.loadDetails(DATA_DETAILS).then(renderList).catch(function () {});
        openPanel('list-panel');
      } else {
        closePanel('list-panel');
      }
    });
    $('close-list').addEventListener('click', function () { closePanel('list-panel'); });
    $('list-sort').addEventListener('change', function () {
      listSort = this.value;
      renderList();
    });
    bindListKeys();

    $('open-info').addEventListener('click', function () {
      var panel = $('info-panel');
      if (panel.hidden) openPanel('info-panel'); else closePanel('info-panel');
    });
    $('close-info').addEventListener('click', function () { closePanel('info-panel'); });
    $('close-detail').addEventListener('click', function () { closePanel('detail-panel'); });

    Object.keys(FILTER_IDS).forEach(function (id) {
      var el = $(id);
      if (el) el.addEventListener('change', function () { readFilters(); refresh(); });
    });

    $('clear-filters').addEventListener('click', function () {
      Object.keys(FILTER_IDS).forEach(function (id) { if ($(id)) $(id).checked = false; });
      readFilters();
      refresh();
    });
    $('apply-filters').addEventListener('click', function () {
      readFilters();
      refresh();
      closePanel('filter-panel');
    });

    var input = $('place-search');
    input.addEventListener('input', function () {
      $('clear-search').hidden = !input.value;
      clearTimeout(searchTimer);
      var v = input.value;
      searchTimer = setTimeout(function () { doSearch(v); }, 300);
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { renderResults([]); input.blur(); }
    });
    $('clear-search').addEventListener('click', function () {
      input.value = '';
      $('clear-search').hidden = true;
      renderResults([]);
      input.focus();
    });
    document.addEventListener('click', function (e) {
      if (!$('search-area').contains(e.target)) renderResults([]);
    });

    $('text-size-standard').addEventListener('click', function () { setTextSize('standard'); });
    $('text-size-large').addEventListener('click', function () { setTextSize('large'); });

    $('app-home').addEventListener('click', function (e) {
      e.preventDefault();
      goHome(true);
    });
  }

  /** 日本全体が画面に収まる位置へ移動する（画面の縦横比に合わせて自動で調整） */
  function goHome(animate) {
    var opts = { padding: { top: 24, bottom: 24, left: 24, right: 24 }, duration: animate ? 900 : 0 };
    try {
      map.fitBounds(HOME_BOUNDS, opts);
    } catch (e) {
      map.jumpTo({ center: INITIAL.center, zoom: INITIAL.zoom });
    }
  }

  function setTextSize(mode) {
    var large = mode === 'large';
    document.documentElement.classList.toggle('is-large-text', large);
    document.body.classList.toggle('is-large-text', large);
    $('text-size-standard').setAttribute('aria-pressed', String(!large));
    $('text-size-large').setAttribute('aria-pressed', String(large));
    try { localStorage.setItem('tm-text-size', mode); } catch (e) { /* 保存できなくても動作に影響しない */ }
    if (map) map.resize();
  }

  function bindMap() {
    map.on('click', 'clusters', function (e) {
      var f = e.features[0];
      map.getSource('toilets').getClusterExpansionZoom(f.properties.cluster_id).then(function (z) {
        map.easeTo({ center: f.geometry.coordinates, zoom: z, duration: 500 });
      });
    });

    map.on('click', 'toilets-point', function (e) {
      showDetail(e.features[0].properties.i);
    });

    ['clusters', 'toilets-point'].forEach(function (id) {
      map.on('mouseenter', id, function () { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, function () { map.getCanvas().style.cursor = ''; });
    });

    var moveTimer = null;
    map.on('moveend', function () {
      updateEmptyState();
      clearTimeout(moveTimer);
      moveTimer = setTimeout(renderList, 150);
    });
  }

  // ---------------------------------------------------------------- 起動
  function boot() {
    paintIcons();

    try { var saved = localStorage.getItem('tm-text-size'); if (saved) setTextSize(saved); }
    catch (e) { /* localStorage が使えない環境でも続行する */ }

    if (!window.TMPalette) {
      $('loading-text').textContent = '地図の配色ファイルが読み込めませんでした';
      return;
    }

    initMap();
    bindUI();

    var mq = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
    if (mq && mq.addEventListener) {
      mq.addEventListener('change', function () {
        map.setStyle(buildStyle());
        map.once('style.load', function () {
          loadMarkerImages().then(function () { addLayers(); refresh(); });
        });
      });
    }

    var dataReady = window.TMData.load(DATA_POINTS);
    // 'load' はタイルの初回描画まで待つため、タブが非表示のときに発火しないことがある。
    // レイヤ追加に必要なのはスタイルの読み込み完了なので 'style.load' を使う。
    var mapReady = new Promise(function (resolve) {
      if (map.isStyleLoaded()) { resolve(); return; }
      map.on('style.load', resolve);
    });

    Promise.all([dataReady, mapReady])
      .then(function () { return loadMarkerImages(); })
      .then(function () {
        addLayers();
        bindMap();
        refresh();
        goHome(false);
        $('loading-state').hidden = true;
        loadMeta();
        // 名前検索のために詳細も裏で読み込む
        window.TMData.loadDetails(DATA_DETAILS).catch(function () { /* 検索の一部が使えないだけ */ });
      })
      .catch(function (err) {
        $('loading-state').hidden = false;
        $('loading-text').textContent = err && err.message ? err.message : '読み込みに失敗しました';
        var sp = document.querySelector('.loading-spinner');
        if (sp) sp.style.display = 'none';
      });
  }

  // デバッグと拡張のための最小限の公開
  window.TMApp = {
    getMap: function () { return map; },
    getFilter: function () { return filter; },
    showDetail: function (i) { showDetail(i); },
    refresh: refresh
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
