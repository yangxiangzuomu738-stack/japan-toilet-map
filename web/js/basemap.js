/*!
 * basemap.js — 国土地理院「最適化ベクトルタイル」(optimal_bvmap-v1) 用の
 * MapLibre スタイルを組み立てる。
 *
 * 役割分担:
 *   - レイヤ構成・フィルタ・ズーム制御（＝地図ロジック）: Claude Code
 *   - 配色（palette の値）: Codex（web/js/palette.js）
 *
 * データ出典: 国土地理院 最適化ベクトルタイル
 *   タイル : https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/{z}/{x}/{y}.pbf
 *   グリフ : https://gsi-cyberjapan.github.io/optimal_bvmap/glyphs/{fontstack}/{range}.pbf
 *
 * 属性スキーマ（実データおよび国土地理院公開スタイルより確認）:
 *   vt_code      … 地物コード
 *   vt_rdctg     … 道路種別（"高速自動車国道等" / "国道" / "都道府県道" / "市区町村道等" ほか）
 *   vt_lvorder   … 立体交差の重なり順（0 が最下層）
 *   vt_railstate … 鉄道の状態（"トンネル" / "地下" / "橋・高架" ほか）
 *   vt_text      … 注記の文字列
 *   vt_arrng     … 注記の配置（2, 4 は縦書き）
 */
(function (global) {
  'use strict';

  var TILE_URL = 'https://cyberjapandata.gsi.go.jp/xyz/optimal_bvmap-v1/{z}/{x}/{y}.pbf';
  var GLYPHS = 'https://gsi-cyberjapan.github.io/optimal_bvmap/glyphs/{fontstack}/{range}.pbf';
  var ATTRIBUTION =
    '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院ベクトルタイル</a>';

  // --- 注記(Anno)の地物コード分類 -----------------------------------------
  var ANNO_HUGE = [110, 120];                        // 都道府県名など
  var ANNO_BIG = [130, 140, 210];                    // 市名・区名など
  var ANNO_MID = [220, 311, 331, 351, 352, 411, 421, 431, 441, 511, 611, 651, 661, 671, 681];
  var ANNO_RAIL = [411, 412, 413, 421, 422, 423, 431, 432, 441];
  var ANNO_WATER = [521, 522, 523, 531, 532, 533, 534, 7711];
  var ANNO_TERRAIN = [321, 322, 341, 342, 344, 345, 347, 820, 840, 841, 842];
  var TUNNEL_CODES = [2704, 2714, 2724, 2734];

  function inList(prop, list) {
    return ['in', ['get', prop], ['literal', list]];
  }

  function roadWidth(scale) {
    return [
      'interpolate', ['exponential', 1.4], ['zoom'],
      6, 0.4 * scale,
      10, 1.0 * scale,
      13, 2.2 * scale,
      15, 4.5 * scale,
      17, 9.0 * scale,
      19, 22.0 * scale
    ];
  }

  var RD_EXPWY = ['==', ['get', 'vt_rdctg'], '高速自動車国道等'];
  var RD_NATIONAL = ['==', ['get', 'vt_rdctg'], '国道'];
  var RD_PREF = ['==', ['get', 'vt_rdctg'], '都道府県道'];
  var RD_MAJOR = ['==', ['get', 'vt_rdctg'], '主要道路'];
  var RD_LOCAL = ['==', ['get', 'vt_rdctg'], '市区町村道等'];

  /**
   * @param {object} palette window.TMPalette
   * @param {string} mode 'light' | 'dark'
   * @returns {object} MapLibre style specification
   */
  function buildBaseStyle(palette, mode) {
    var c = (palette && palette[mode]) || (palette && palette.light);
    if (!c) throw new Error('TMBasemap.build: palette が読み込まれていません');

    var layers = [];

    layers.push({ id: 'bg', type: 'background', paint: { 'background-color': c.land } });

    layers.push({
      id: 'admarea', type: 'fill', source: 'v', 'source-layer': 'AdmArea',
      paint: { 'fill-color': c.land }
    });

    layers.push({
      id: 'tpgpharea', type: 'fill', source: 'v', 'source-layer': 'TpgphArea',
      paint: { 'fill-color': c.terrain, 'fill-opacity': 0.5 }
    });

    layers.push({
      id: 'water', type: 'fill', source: 'v', 'source-layer': 'WA',
      paint: { 'fill-color': c.water }
    });

    layers.push({
      id: 'coastline', type: 'line', source: 'v', 'source-layer': 'Cstline',
      paint: {
        'line-color': c.waterLine,
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.4, 12, 0.8, 16, 1.2]
      }
    });

    layers.push({
      id: 'river', type: 'line', source: 'v', 'source-layer': 'RvrCL',
      paint: {
        'line-color': c.water,
        'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 8, 0.6, 12, 1.4, 16, 3.5, 19, 8]
      }
    });

    layers.push({
      id: 'waterline', type: 'line', source: 'v', 'source-layer': 'WL',
      paint: { 'line-color': c.waterLine, 'line-width': 0.6 }
    });

    layers.push({
      id: 'admbdry-pref', type: 'line', source: 'v', 'source-layer': 'AdmBdry',
      filter: ['==', ['get', 'vt_code'], 1211],
      paint: {
        'line-color': c.adminPref,
        'line-dasharray': [3, 2],
        'line-width': ['interpolate', ['linear'], ['zoom'], 5, 0.8, 10, 1.4, 14, 2.0]
      }
    });

    layers.push({
      id: 'admbdry-city', type: 'line', source: 'v', 'source-layer': 'AdmBdry',
      minzoom: 10,
      filter: ['==', ['get', 'vt_code'], 1212],
      paint: { 'line-color': c.adminCity, 'line-dasharray': [2, 2], 'line-width': 1 }
    });

    layers.push({
      id: 'building', type: 'fill', source: 'v', 'source-layer': 'BldA',
      minzoom: 14,
      paint: {
        'fill-color': c.building,
        'fill-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 1]
      }
    });

    layers.push({
      id: 'building-outline', type: 'line', source: 'v', 'source-layer': 'BldA',
      minzoom: 16,
      paint: { 'line-color': c.buildingLine, 'line-width': 0.5 }
    });

    // --- 道路 ---------------------------------------------------------------
    var roadClasses = [
      { key: 'local', filter: RD_LOCAL, scale: 0.55, minzoom: 13, color: c.roadLocal, edge: c.roadLocalCase },
      { key: 'pref', filter: RD_PREF, scale: 0.85, minzoom: 10, color: c.roadPref, edge: c.roadPrefCase },
      { key: 'major', filter: RD_MAJOR, scale: 0.95, minzoom: 8, color: c.roadPref, edge: c.roadPrefCase },
      { key: 'national', filter: RD_NATIONAL, scale: 1.15, minzoom: 6, color: c.roadNational, edge: c.roadNationalCase },
      { key: 'expwy', filter: RD_EXPWY, scale: 1.45, minzoom: 5, color: c.roadExpwy, edge: c.roadExpwyCase }
    ];

    roadClasses.forEach(function (r) {
      layers.push({
        id: 'road-case-' + r.key, type: 'line', source: 'v', 'source-layer': 'RdCL',
        minzoom: r.minzoom, filter: r.filter,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': r.edge, 'line-width': roadWidth(r.scale * 1.55) }
      });
    });

    roadClasses.forEach(function (r) {
      layers.push({
        id: 'road-' + r.key, type: 'line', source: 'v', 'source-layer': 'RdCL',
        minzoom: r.minzoom,
        filter: ['all', r.filter, ['!', inList('vt_code', TUNNEL_CODES)]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': r.color, 'line-width': roadWidth(r.scale) }
      });
      layers.push({
        id: 'road-tunnel-' + r.key, type: 'line', source: 'v', 'source-layer': 'RdCL',
        minzoom: Math.max(r.minzoom, 12),
        filter: ['all', r.filter, inList('vt_code', TUNNEL_CODES)],
        paint: { 'line-color': c.roadTunnel, 'line-width': roadWidth(r.scale), 'line-dasharray': [2, 2] }
      });
    });

    // --- 鉄道 ---------------------------------------------------------------
    layers.push({
      id: 'rail-case', type: 'line', source: 'v', 'source-layer': 'RailCL',
      minzoom: 9,
      filter: ['!', inList('vt_railstate', ['トンネル', '地下'])],
      paint: {
        'line-color': c.railCase,
        'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 9, 1.0, 13, 2.0, 16, 4.0, 19, 7.0]
      }
    });

    layers.push({
      id: 'rail-dash', type: 'line', source: 'v', 'source-layer': 'RailCL',
      minzoom: 12,
      filter: ['!', inList('vt_railstate', ['トンネル', '地下'])],
      paint: {
        'line-color': c.railDash,
        'line-width': ['interpolate', ['exponential', 1.4], ['zoom'], 12, 1.0, 16, 2.2, 19, 4.0],
        'line-dasharray': [3, 3]
      }
    });

    // --- 注記（ラベル）------------------------------------------------------
    var textSize = [
      'interpolate', ['linear'], ['zoom'],
      4, ['case', inList('vt_code', ANNO_HUGE), 13, 10],
      10, ['case',
        inList('vt_code', ANNO_HUGE), 18,
        inList('vt_code', ANNO_BIG), 15,
        inList('vt_code', ANNO_MID), 13,
        11],
      16, ['case',
        inList('vt_code', ANNO_HUGE), 20,
        inList('vt_code', ANNO_BIG), 17,
        inList('vt_code', ANNO_MID), 15,
        13]
    ];

    var textColor = ['case',
      inList('vt_code', ANNO_RAIL), c.labelRail,
      inList('vt_code', ANNO_WATER), c.labelWater,
      inList('vt_code', ANNO_TERRAIN), c.labelTerrain,
      c.label];

    var textFont = ['case',
      inList('vt_code', ANNO_TERRAIN), ['literal', ['NotoSerifJP-SemiBold']],
      ['literal', ['NotoSansJP-Regular']]];

    layers.push({
      id: 'anno-h', type: 'symbol', source: 'v', 'source-layer': 'Anno',
      filter: ['all',
        ['==', ['geometry-type'], 'Point'],
        ['any',
          ['!', ['has', 'vt_arrng']],
          ['==', ['get', 'vt_arrng'], 1],
          ['==', ['get', 'vt_arrng'], 3]]
      ],
      layout: {
        'text-field': ['get', 'vt_text'],
        'text-font': textFont,
        'text-size': textSize,
        'text-max-width': 8,
        'text-padding': 3,
        'symbol-sort-key': ['case',
          inList('vt_code', ANNO_HUGE), 1,
          inList('vt_code', ANNO_BIG), 2,
          inList('vt_code', ANNO_MID), 3,
          4]
      },
      paint: { 'text-color': textColor, 'text-halo-color': c.labelHalo, 'text-halo-width': 1.6 }
    });

    layers.push({
      id: 'anno-v', type: 'symbol', source: 'v', 'source-layer': 'Anno',
      filter: ['all',
        ['==', ['geometry-type'], 'Point'],
        ['any', ['==', ['get', 'vt_arrng'], 2], ['==', ['get', 'vt_arrng'], 4]]
      ],
      layout: {
        'text-field': ['get', 'vt_text'],
        'text-font': textFont,
        'text-size': textSize,
        'text-writing-mode': ['vertical'],
        // text-max-width を小さくすると MapLibre が縦書きを複数列に折り返し、
        // 右から左へ並んで逆順に見える。折り返さないよう十分大きな値にする。
        'text-max-width': 99,
        'text-padding': 3
      },
      paint: { 'text-color': textColor, 'text-halo-color': c.labelHalo, 'text-halo-width': 1.6 }
    });

    layers.push({
      id: 'anno-line', type: 'symbol', source: 'v', 'source-layer': 'Anno',
      minzoom: 12,
      filter: ['all',
        ['==', ['geometry-type'], 'LineString'],
        ['!', inList('vt_code', [2901, 2903, 2904, 7701])]
      ],
      layout: {
        'symbol-placement': 'line-center',
        'text-field': ['get', 'vt_text'],
        'text-font': ['literal', ['NotoSansJP-Regular']],
        'text-size': 12,
        'text-padding': 3
      },
      paint: { 'text-color': textColor, 'text-halo-color': c.labelHalo, 'text-halo-width': 1.6 }
    });

    return {
      version: 8,
      name: 'トイレマップ 背景地図',
      glyphs: GLYPHS,
      sources: {
        v: {
          type: 'vector',
          tiles: [TILE_URL],
          minzoom: 4,
          maxzoom: 16,
          attribution: ATTRIBUTION
        }
      },
      layers: layers
    };
  }

  global.TMBasemap = { build: buildBaseStyle, TILE_URL: TILE_URL, GLYPHS: GLYPHS };
})(window);
