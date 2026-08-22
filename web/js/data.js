/*!
 * data.js — トイレデータの読み込み・復号・絞り込み
 *
 * points.json  : { meta, points: [[latE5, lonE5, flags], ...] }
 * details.json : { count, details: [[name, hours, operator, osmid], ...] }
 *
 * flags のビット割り当て（scripts/build_data.py と対応）
 *   bit  0-1  multi    0=不明 1=あり 2=一部対応 3=なし
 *   bit  2-3  style    0=不明 1=洋式 2=和式 3=両方
 *   bit  4-5  male     0=不明 1=あり 2=なし
 *   bit  6-7  female   0=不明 1=あり 2=なし
 *   bit  8-9  unisex   0=不明 1=あり 2=なし
 *   bit 10-11 baby     0=不明 1=あり 2=なし
 *   bit 12-13 ostomate 0=不明 1=あり 2=なし
 *   bit 14-15 fee      0=不明 1=有料 2=無料
 *   bit 16-17 access   0=不明 1=誰でも 2=施設利用者・客のみ 3=その他条件付き
 *   bit 18-19 h24      0=不明 1=24時間 2=時間制限あり
 *   bit 20-25 pref     都道府県コード 1-47
 */
(function (global) {
  'use strict';

  var UNKNOWN = 0, YES = 1, NO = 2;

  function f_multi(f) { return f & 3; }
  function f_style(f) { return (f >> 2) & 3; }
  function f_male(f) { return (f >> 4) & 3; }
  function f_female(f) { return (f >> 6) & 3; }
  function f_unisex(f) { return (f >> 8) & 3; }
  function f_baby(f) { return (f >> 10) & 3; }
  function f_ostomate(f) { return (f >> 12) & 3; }
  function f_fee(f) { return (f >> 14) & 3; }
  function f_access(f) { return (f >> 16) & 3; }
  function f_h24(f) { return (f >> 18) & 3; }
  function f_pref(f) { return (f >> 20) & 63; }

  var PREF_NAMES = {
    1: '北海道', 2: '青森県', 3: '岩手県', 4: '宮城県', 5: '秋田県', 6: '山形県',
    7: '福島県', 8: '茨城県', 9: '栃木県', 10: '群馬県', 11: '埼玉県', 12: '千葉県',
    13: '東京都', 14: '神奈川県', 15: '新潟県', 16: '富山県', 17: '石川県', 18: '福井県',
    19: '山梨県', 20: '長野県', 21: '岐阜県', 22: '静岡県', 23: '愛知県', 24: '三重県',
    25: '滋賀県', 26: '京都府', 27: '大阪府', 28: '兵庫県', 29: '奈良県', 30: '和歌山県',
    31: '鳥取県', 32: '島根県', 33: '岡山県', 34: '広島県', 35: '山口県', 36: '徳島県',
    37: '香川県', 38: '愛媛県', 39: '高知県', 40: '福岡県', 41: '佐賀県', 42: '長崎県',
    43: '熊本県', 44: '大分県', 45: '宮崎県', 46: '鹿児島県', 47: '沖縄県'
  };

  // --- 表示用ラベル（不明は「不明」と正直に出す）---------------------------
  var LABEL = {
    multi: { 0: '不明', 1: 'あり', 2: '一部対応', 3: 'なし' },
    style: { 0: '不明', 1: '洋式', 2: '和式', 3: '洋式・和式の両方' },
    yesno: { 0: '不明', 1: 'あり', 2: 'なし' },
    fee: { 0: '不明', 1: '有料', 2: '無料' },
    access: { 0: '不明', 1: 'どなたでも利用できます', 2: '施設の利用者・お客様のみ', 3: '条件付き' },
    h24: { 0: '不明', 1: '24時間', 2: '時間の決まりあり' }
  };

  var store = {
    ready: false,
    meta: null,
    lat: null,     // Float64Array
    lon: null,     // Float64Array
    flags: null,   // Int32Array
    count: 0,
    details: null  // 遅延読み込み
  };

  function load(pointsUrl) {
    return fetch(pointsUrl, { cache: 'default' })
      .then(function (r) {
        if (!r.ok) throw new Error('データの読み込みに失敗しました (' + r.status + ')');
        return r.json();
      })
      .then(function (json) {
        var pts = json.points;
        var n = pts.length;
        var lat = new Float64Array(n), lon = new Float64Array(n), fl = new Int32Array(n);
        for (var i = 0; i < n; i++) {
          lat[i] = pts[i][0] / 1e5;
          lon[i] = pts[i][1] / 1e5;
          fl[i] = pts[i][2];
        }
        store.meta = json.meta;
        store.lat = lat; store.lon = lon; store.flags = fl;
        store.count = n;
        store.ready = true;
        return store;
      });
  }

  var detailsPromise = null;
  function loadDetails(detailsUrl) {
    if (!detailsPromise) {
      detailsPromise = fetch(detailsUrl, { cache: 'default' })
        .then(function (r) {
          if (!r.ok) throw new Error('詳細データの読み込みに失敗しました (' + r.status + ')');
          return r.json();
        })
        .then(function (json) { store.details = json.details; return store.details; });
    }
    return detailsPromise;
  }

  /**
   * 絞り込み条件。すべて false のときは全件。
   * 「不明」を除外はしない（不明を消すと情報が偏るため、明示的に選んだ条件のみ適用）。
   */
  function defaultFilter() {
    return {
      multi: false,      // 多目的トイレあり
      seated: false,     // 洋式あり
      squat: false,      // 和式あり
      separated: false,  // 男女別あり
      unisex: false,     // 共用あり
      baby: false,       // おむつ交換台あり
      ostomate: false,   // オストメイト対応
      h24: false,        // 24時間
      free: false,       // 無料
      anyone: false      // 誰でも利用可（客のみを除く）
    };
  }

  function matches(f, q) {
    if (q.multi && f_multi(f) !== 1) return false;
    if (q.seated) { var s = f_style(f); if (s !== 1 && s !== 3) return false; }
    if (q.squat) { var s2 = f_style(f); if (s2 !== 2 && s2 !== 3) return false; }
    if (q.separated && !(f_male(f) === YES && f_female(f) === YES)) return false;
    if (q.unisex && f_unisex(f) !== YES) return false;
    if (q.baby && f_baby(f) !== YES) return false;
    if (q.ostomate && f_ostomate(f) !== YES) return false;
    if (q.h24 && f_h24(f) !== 1) return false;
    if (q.free && f_fee(f) !== NO) return false;
    if (q.anyone && f_access(f) === 2) return false;
    return true;
  }

  /** マーカーの種類: 'yes'（多目的あり） / 'no'（なし・一部） / 'unknown'（不明） */
  function markerKind(f) {
    var m = f_multi(f);
    if (m === 1) return 'yes';
    if (m === 0) return 'unknown';
    return 'no';
  }

  /**
   * 絞り込み結果を GeoJSON にする。
   * properties は軽量に保ち（i と k のみ）、詳細は選択時に details から引く。
   */
  function toGeoJSON(q) {
    var feats = [];
    var lat = store.lat, lon = store.lon, fl = store.flags, n = store.count;
    for (var i = 0; i < n; i++) {
      var f = fl[i];
      if (!matches(f, q)) continue;
      feats.push({
        type: 'Feature',
        id: i,
        geometry: { type: 'Point', coordinates: [lon[i], lat[i]] },
        properties: { i: i, k: markerKind(f) }
      });
    }
    return { type: 'FeatureCollection', features: feats };
  }

  function countMatching(q) {
    var c = 0, fl = store.flags, n = store.count;
    for (var i = 0; i < n; i++) if (matches(fl[i], q)) c++;
    return c;
  }

  /** 1件分の情報を、表示に使いやすい形にして返す */
  function record(i) {
    var f = store.flags[i];
    var d = store.details ? store.details[i] : null;
    return {
      index: i,
      lat: store.lat[i],
      lon: store.lon[i],
      name: d ? (d[0] || '') : '',
      hours: d ? (d[1] || '') : '',
      operator: d ? (d[2] || '') : '',
      osmid: d ? (d[3] || '') : '',
      pref: PREF_NAMES[f_pref(f)] || '',
      code: {
        multi: f_multi(f), style: f_style(f), male: f_male(f), female: f_female(f),
        unisex: f_unisex(f), baby: f_baby(f), ostomate: f_ostomate(f),
        fee: f_fee(f), access: f_access(f), h24: f_h24(f)
      },
      text: {
        multi: LABEL.multi[f_multi(f)],
        style: LABEL.style[f_style(f)],
        male: LABEL.yesno[f_male(f)],
        female: LABEL.yesno[f_female(f)],
        unisex: LABEL.yesno[f_unisex(f)],
        baby: LABEL.yesno[f_baby(f)],
        ostomate: LABEL.yesno[f_ostomate(f)],
        fee: LABEL.fee[f_fee(f)],
        access: LABEL.access[f_access(f)],
        h24: LABEL.h24[f_h24(f)]
      }
    };
  }

  /** OSM 要素 URL（出典をたどれるようにする） */
  function osmUrl(osmid) {
    if (!osmid) return null;
    var t = { n: 'node', w: 'way', r: 'relation' }[osmid[0]];
    if (!t) return null;
    return 'https://www.openstreetmap.org/' + t + '/' + osmid.slice(1);
  }

  /** 画面内の該当件数（表示中のリスト用） */
  function inBounds(q, bounds, limit) {
    var out = [];
    var lat = store.lat, lon = store.lon, fl = store.flags, n = store.count;
    var w = bounds.getWest(), e = bounds.getEast(), s = bounds.getSouth(), nn = bounds.getNorth();
    for (var i = 0; i < n; i++) {
      if (lat[i] < s || lat[i] > nn || lon[i] < w || lon[i] > e) continue;
      if (!matches(fl[i], q)) continue;
      out.push(i);
      if (limit && out.length >= limit) break;
    }
    return out;
  }

  global.TMData = {
    load: load,
    loadDetails: loadDetails,
    store: store,
    defaultFilter: defaultFilter,
    matches: matches,
    markerKind: markerKind,
    toGeoJSON: toGeoJSON,
    countMatching: countMatching,
    record: record,
    osmUrl: osmUrl,
    inBounds: inBounds,
    PREF_NAMES: PREF_NAMES,
    LABEL: LABEL
  };
})(window);
