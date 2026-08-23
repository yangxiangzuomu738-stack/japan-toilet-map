/*!
 * data.js — トイレデータの読み込み・復号・絞り込み
 *
 * points.json  : { meta, points: [[latE5, lonE5, flags], ...] }
 * details.json : { count, details: [[name, hours, operator, osmid, place, dist], ...] }
 *
 * flags のビット割り当て（scripts/build_data.py と対応）
 *   bit  0-1  multi     0=不明 1=あり 2=一部対応 3=なし
 *   bit  2-3  style     0=不明 1=洋式 2=和式 3=両方
 *   bit  4-5  male      0=不明 1=あり 2=なし
 *   bit  6-7  female    0=不明 1=あり 2=なし
 *   bit  8-9  unisex    0=不明 1=あり 2=なし
 *   bit 10-11 baby      0=不明 1=あり 2=なし
 *   bit 12-13 ostomate  0=不明 1=あり 2=なし
 *   bit 14-15 fee       0=不明 1=有料 2=無料
 *   bit 16-17 access    0=不明 1=誰でも 2=施設利用者・客のみ 3=その他条件付き
 *   bit 18-19 h24       0=不明 1=24時間 2=時間の決まりあり
 *   bit 20-25 pref      都道府県コード 1-47
 *   bit 26    derived   1=施設に「トイレあり」と記録されているだけ（正確な位置は不明）
 *   bit 27-29 placeKind 0=なし 1=駅・駅ビル 2=商業施設 3=公園 4=道の駅・SA/PA 5=公共施設
 *   bit 30    inside    1=その施設の中 0=そば
 */
(function (global) {
  'use strict';

  var YES = 1, NO = 2;

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
  function f_derived(f) { return (f >> 26) & 1; }
  function f_placeKind(f) { return (f >> 27) & 7; }
  function f_inside(f) { return (f >> 30) & 1; }

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

  // 場所の種類（1〜5）。表示名と、絞り込みキー、一覧の札のラベル。
  var PLACE_KINDS = {
    1: { key: 'station', name: '駅・駅ビル', inside: '駅・駅ビルの中', tag: '駅の中' },
    2: { key: 'shop', name: '商業施設', inside: '商業施設の中', tag: '商業施設の中' },
    3: { key: 'park', name: '公園', inside: '公園の中', tag: '公園の中' },
    4: { key: 'roadside', name: '道の駅・SA/PA', inside: '道の駅・サービスエリア', tag: '道の駅・SA/PA' },
    5: { key: 'public', name: '公共施設', inside: '公共施設の中', tag: '公共施設の中' }
  };

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
    lat: null,
    lon: null,
    flags: null,
    count: 0,
    details: null
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
   * 絞り込み条件。
   * 設備・条件（multi 〜 anyone）は「すべてを満たす」。
   * 場所の種類（places）は「選んだどれかに当てはまる」。
   */
  function defaultFilter() {
    return {
      multi: false,
      seated: false,
      squat: false,
      separated: false,
      unisex: false,
      baby: false,
      ostomate: false,
      h24: false,
      free: false,
      anyone: false,
      places: []          // 1〜5 の配列。空なら場所で絞らない。
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
    if (q.places && q.places.length) {
      // 「〜の中」だけを対象にする（そばにあるだけのものは含めない）
      if (!f_inside(f)) return false;
      if (q.places.indexOf(f_placeKind(f)) === -1) return false;
    }
    return true;
  }

  /** マーカーの種類: 'yes' / 'no' / 'unknown' （車いす対応の有無） */
  function markerKind(f) {
    var m = f_multi(f);
    if (m === 1) return 'yes';
    if (m === 0) return 'unknown';
    return 'no';
  }

  function isDerived(f) { return f_derived(f) === 1; }

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
        properties: { i: i, k: markerKind(f), d: f_derived(f) }
      });
    }
    return { type: 'FeatureCollection', features: feats };
  }

  function countMatching(q) {
    var c = 0, fl = store.flags, n = store.count;
    for (var i = 0; i < n; i++) if (matches(fl[i], q)) c++;
    return c;
  }

  /** 場所を表す文（例「新宿駅 の中」「日比谷公園 のそば（約35m）」） */
  function placeText(place, inside, dist) {
    if (!place) return '';
    if (inside) return place + ' の中';
    if (dist > 0) return place + ' のそば（約' + dist + 'm）';
    return place + ' のそば';
  }

  function record(i) {
    var f = store.flags[i];
    var d = store.details ? store.details[i] : null;
    var kind = f_placeKind(f);
    var inside = f_inside(f) === 1;
    var place = d ? (d[4] || '') : '';
    var dist = d ? (d[5] || 0) : 0;
    return {
      index: i,
      lat: store.lat[i],
      lon: store.lon[i],
      name: d ? (d[0] || '') : '',
      hours: d ? (d[1] || '') : '',
      operator: d ? (d[2] || '') : '',
      osmid: d ? (d[3] || '') : '',
      place: place,
      placeKind: kind,
      placeKindName: PLACE_KINDS[kind] ? PLACE_KINDS[kind].name : '',
      placeKindLabel: PLACE_KINDS[kind] ? (inside ? PLACE_KINDS[kind].inside : PLACE_KINDS[kind].name) : '',
      placeKindTag: PLACE_KINDS[kind] ? PLACE_KINDS[kind].tag : '',
      placeKindKey: PLACE_KINDS[kind] ? PLACE_KINDS[kind].key : '',
      inside: inside,
      placeDistance: dist,
      placeText: placeText(place, inside, dist),
      derived: f_derived(f) === 1,
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

  function osmUrl(osmid) {
    if (!osmid) return null;
    var t = { n: 'node', w: 'way', r: 'relation' }[osmid[0]];
    if (!t) return null;
    return 'https://www.openstreetmap.org/' + t + '/' + osmid.slice(1);
  }

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

  /**
   * トイレの名前と場所の名前の両方から探す。
   *
   * 同じ施設のトイレは1件にまとめる。ただし全国チェーン（セブン-イレブンなど）を
   * ひとまとめにしても役に立たないので、名前が同じでも離れた店舗は別々に扱う。
   * まとめる範囲は「同じ名前で 500m 以内」。
   *
   * 返り値: [{ label, kind, indexes, count, lat, lon, dist }, ...]
   *   dist は center からのおおよその距離（メートル）。center 未指定なら null。
   */
  function searchNames(query, limit, center) {
    var d = store.details;
    if (!d) return [];
    var q = query.trim().toLowerCase();
    if (!q) return [];

    var MERGE_M = 500;
    var byName = {};
    var names = [];
    var scanned = 0;

    for (var i = 0; i < d.length; i++) {
      var nm = d[i][0] || '';
      var pl = d[i][4] || '';
      var hitName = nm && nm.toLowerCase().indexOf(q) !== -1;
      var hitPlace = pl && pl.toLowerCase().indexOf(q) !== -1;
      if (!hitName && !hitPlace) continue;
      var label = hitName ? nm : pl;
      var kind = hitName ? 'toilet' : 'place';
      var key = kind + ':' + label;
      if (!byName[key]) { byName[key] = { label: label, kind: kind, items: [] }; names.push(key); }
      byName[key].items.push(i);
      scanned++;
      if (scanned > 30000) break;
    }

    // 同じ名前のものを、近いものどうしでまとめる
    var groups = [];
    names.forEach(function (key) {
      var g = byName[key];
      var clusters = [];
      g.items.forEach(function (i) {
        var la = store.lat[i], lo = store.lon[i];
        var put = null;
        for (var c = 0; c < clusters.length; c++) {
          var cl = clusters[c];
          var dy = (la - cl.lat) * 111000;
          var dx = (lo - cl.lon) * 111000 * Math.cos(la * Math.PI / 180);
          if (Math.sqrt(dx * dx + dy * dy) <= MERGE_M) { put = cl; break; }
        }
        if (!put) {
          put = { lat: la, lon: lo, indexes: [] };
          clusters.push(put);
        }
        put.indexes.push(i);
        // 重心を更新する
        var n = put.indexes.length;
        put.lat += (la - put.lat) / n;
        put.lon += (lo - put.lon) / n;
      });
      clusters.forEach(function (cl) {
        groups.push({
          label: g.label, kind: g.kind,
          indexes: cl.indexes, count: cl.indexes.length,
          lat: cl.lat, lon: cl.lon,
          head: g.label.toLowerCase().indexOf(q) === 0 ? 0 : 1
        });
      });
    });

    var cx = center ? center[0] : null;
    var cy = center ? center[1] : null;
    groups.forEach(function (g) {
      if (cx === null) { g.dist = null; return; }
      var dy = (g.lat - cy) * 111000;
      var dx = (g.lon - cx) * 111000 * Math.cos(cy * Math.PI / 180);
      g.dist = Math.round(Math.sqrt(dx * dx + dy * dy));
    });

    groups.sort(function (a, b) {
      if (a.head !== b.head) return a.head - b.head;
      if (a.label.length !== b.label.length) return a.label.length - b.label.length;
      if (cx !== null && a.dist !== b.dist) return a.dist - b.dist;
      return b.count - a.count;
    });
    return groups.slice(0, limit);
  }

  global.TMData = {
    load: load,
    loadDetails: loadDetails,
    store: store,
    defaultFilter: defaultFilter,
    matches: matches,
    markerKind: markerKind,
    isDerived: isDerived,
    toGeoJSON: toGeoJSON,
    countMatching: countMatching,
    record: record,
    osmUrl: osmUrl,
    inBounds: inBounds,
    searchNames: searchNames,
    placeText: placeText,
    PREF_NAMES: PREF_NAMES,
    PLACE_KINDS: PLACE_KINDS,
    LABEL: LABEL
  };
})(window);
