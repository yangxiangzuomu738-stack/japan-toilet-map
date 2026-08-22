# -*- coding: utf-8 -*-
"""全国の amenity=toilets を Overpass API から都道府県単位で取得する。
失敗した都道府県は bbox 分割で再取得する。"""
import json, os, sys, time, urllib.request, urllib.error, urllib.parse

BASE = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = os.path.join(BASE, "..", "data", "raw")
os.makedirs(OUT_DIR, exist_ok=True)

ENDPOINTS = [
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

PREFS = [
    ("01", "北海道", 41.3, 139.2, 45.7, 146.0),
    ("02", "青森県", 40.2, 139.4, 41.6, 141.8),
    ("03", "岩手県", 38.7, 140.6, 40.5, 142.1),
    ("04", "宮城県", 37.7, 140.2, 39.1, 141.7),
    ("05", "秋田県", 38.8, 139.6, 40.5, 141.1),
    ("06", "山形県", 37.7, 139.5, 39.2, 140.7),
    ("07", "福島県", 36.7, 139.1, 37.9, 141.1),
    ("08", "茨城県", 35.7, 139.6, 37.0, 140.9),
    ("09", "栃木県", 36.1, 139.2, 37.2, 140.4),
    ("10", "群馬県", 35.9, 138.3, 37.1, 139.7),
    ("11", "埼玉県", 35.7, 138.7, 36.3, 139.9),
    ("12", "千葉県", 34.8, 139.7, 36.2, 141.0),
    ("13", "東京都", 20.3, 135.8, 35.9, 153.9),
    ("14", "神奈川県", 35.1, 138.9, 35.7, 139.8),
    ("15", "新潟県", 36.7, 137.6, 38.6, 139.9),
    ("16", "富山県", 36.2, 136.7, 36.9, 137.8),
    ("17", "石川県", 36.0, 136.2, 37.9, 137.4),
    ("18", "福井県", 35.3, 135.4, 36.3, 136.8),
    ("19", "山梨県", 35.1, 138.2, 35.9, 139.2),
    ("20", "長野県", 35.1, 137.3, 37.1, 138.8),
    ("21", "岐阜県", 35.1, 136.2, 36.5, 137.7),
    ("22", "静岡県", 34.5, 137.4, 35.7, 139.2),
    ("23", "愛知県", 34.5, 136.6, 35.5, 137.9),
    ("24", "三重県", 33.6, 135.8, 35.3, 136.9),
    ("25", "滋賀県", 34.7, 135.7, 35.7, 136.5),
    ("26", "京都府", 34.6, 134.8, 35.8, 136.1),
    ("27", "大阪府", 34.2, 135.0, 35.1, 135.8),
    ("28", "兵庫県", 34.1, 134.2, 35.7, 135.5),
    ("29", "奈良県", 33.8, 135.5, 34.8, 136.2),
    ("30", "和歌山県", 33.4, 134.9, 34.4, 136.1),
    ("31", "鳥取県", 35.0, 133.1, 35.7, 134.5),
    ("32", "島根県", 34.2, 131.6, 37.3, 133.5),
    ("33", "岡山県", 34.2, 133.2, 35.4, 134.5),
    ("34", "広島県", 34.0, 132.0, 35.2, 133.5),
    ("35", "山口県", 33.7, 130.7, 34.8, 132.4),
    ("36", "徳島県", 33.5, 133.5, 34.3, 134.9),
    ("37", "香川県", 34.0, 133.4, 34.6, 134.5),
    ("38", "愛媛県", 32.8, 132.0, 34.4, 133.7),
    ("39", "高知県", 32.6, 132.4, 33.9, 134.4),
    ("40", "福岡県", 33.0, 129.9, 34.0, 131.2),
    ("41", "佐賀県", 32.9, 129.7, 33.7, 130.6),
    ("42", "長崎県", 32.0, 128.3, 34.8, 130.4),
    ("43", "熊本県", 32.0, 129.7, 33.3, 131.3),
    ("44", "大分県", 32.7, 130.7, 33.8, 132.2),
    ("45", "宮崎県", 31.3, 130.7, 32.9, 131.9),
    ("46", "鹿児島県", 27.0, 128.3, 32.4, 131.2),
    ("47", "沖縄県", 24.0, 122.9, 27.9, 131.4),
]

Q_AREA = """[out:json][timeout:600];
area["ISO3166-2"="JP-{code}"]->.a;
(
  node(area.a)["amenity"="toilets"];
  way(area.a)["amenity"="toilets"];
  relation(area.a)["amenity"="toilets"];
);
out center tags;"""

Q_BBOX = """[out:json][timeout:300];
(
  node["amenity"="toilets"]({s},{w},{n},{e});
  way["amenity"="toilets"]({s},{w},{n},{e});
  relation["amenity"="toilets"]({s},{w},{n},{e});
);
out center tags;"""


def fetch(q, ep, timeout=700):
    data = urllib.parse.urlencode({"data": q}).encode("utf-8")
    req = urllib.request.Request(ep, data=data, headers={
        "User-Agent": "japan-toilet-map/1.0 (+build script; OSM data)",
        "Content-Type": "application/x-www-form-urlencoded",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def try_query(q, label, tries=8):
    for i in range(tries):
        ep = ENDPOINTS[i % len(ENDPOINTS)]
        try:
            d = fetch(q, ep)
            return d.get("elements", [])
        except urllib.error.HTTPError as ex:
            wait = 30 if ex.code in (429, 504) else 10
            print(f"  {label}: HTTP {ex.code} @ {ep.split('/')[2]} -> wait {wait}s", flush=True)
            time.sleep(wait)
        except Exception as ex:
            print(f"  {label}: {type(ex).__name__} @ {ep.split('/')[2]} -> wait 12s", flush=True)
            time.sleep(12)
    return None


def bbox_split(s, w, n, e, parts=3):
    dl = (n - s) / parts
    dg = (e - w) / parts
    for i in range(parts):
        for j in range(parts):
            yield (round(s + i * dl, 4), round(w + j * dg, 4),
                   round(s + (i + 1) * dl, 4), round(w + (j + 1) * dg, 4))


def main():
    grand = 0
    for (code, name, s, w, n, e) in PREFS:
        path = os.path.join(OUT_DIR, f"JP-{code}.json")
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                grand += len(json.load(f).get("elements", []))
            print(f"JP-{code} {name}: cached", flush=True)
            continue
        print(f"JP-{code} {name}: fetching (area)...", flush=True)
        els = try_query(Q_AREA.format(code=code), f"JP-{code}", tries=6)
        if els is None:
            print(f"JP-{code} {name}: area query failed -> bbox split", flush=True)
            merged = {}
            ok = True
            for (bs, bw, bn, be) in bbox_split(s, w, n, e, 3):
                sub = try_query(Q_BBOX.format(s=bs, w=bw, n=bn, e=be),
                                f"JP-{code} bbox {bs},{bw}", tries=6)
                if sub is None:
                    ok = False
                    break
                for el in sub:
                    merged[(el["type"], el["id"])] = el
                time.sleep(1)
            if not ok:
                print(f"JP-{code} {name}: FAILED", flush=True)
                continue
            els = list(merged.values())
        with open(path, "w", encoding="utf-8") as f:
            json.dump({"elements": els}, f, ensure_ascii=False)
        grand += len(els)
        print(f"JP-{code} {name}: {len(els)} elements (running total {grand})", flush=True)
        time.sleep(2)
    print(f"DONE grand_total={grand}", flush=True)


if __name__ == "__main__":
    main()
