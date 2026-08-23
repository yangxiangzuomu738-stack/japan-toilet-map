# -*- coding: utf-8 -*-
"""各トイレに「場所」（どの施設の中／そばか）を結び付ける。

手順:
  1. data/national.json のトイレ座標を読む
  2. data/places/*.json の施設（外接矩形＋タグ）を読む
  3. 外接矩形に入るものを「候補」として絞り込む
  4. 候補の way / relation だけ、Overpass から実際の形状を取り直す（data/place_geom/ にキャッシュ）
  5. 実形状で内外判定する（＝「中にある」と言えるのは実形状に入ったときだけ）
  6. 点で記録された施設は、距離が近ければ「そば」として結び付ける

出力: data/place_assign.json
  { "n123456": {"place": "新宿駅", "kind": 1, "inside": true, "dist": 0}, ... }

嘘をつかないための原則:
  - 「中にある」は、実際の敷地・建物の形状に入っているときだけ言う。
    外接矩形に入っただけでは「中」とは言わない（矩形は実形状より広いため）。
  - 形状が取得できなかった施設は「そば」に格下げする。
"""
import json, os, math, sys, time, urllib.request, urllib.error, urllib.parse, collections

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "..", "data")
PLACES = os.path.join(DATA, "places")
GEOM = os.path.join(DATA, "place_geom")
os.makedirs(GEOM, exist_ok=True)

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]

# グループ名 -> 場所の種類コード
KIND = {"station": 1, "shop": 2, "park": 3, "roadside": 4, "public": 5}
# 「そば」と認めるいちばん遠い距離（メートル）。種類ごとに変える。
NEAR_LIMIT = {1: 120, 2: 50, 3: 120, 4: 200, 5: 100}
# 「そば」の判定に使ってよい施設の大きさの上限（外接矩形の対角、メートル）。
# 路線関係の巨大な図形を誤って「そば」にしないための歯止め。
MAX_NEAR_SPAN = {1: 1500, 2: 1000, 3: 15000, 4: 3000, 5: 1500}
# 「そば」の場合にどの種類を優先するか。
# 例えば駅ナカの小さな店より「〇〇駅のそば」の方が利用者には分かりやすい。
NEAR_PRIORITY = {1: 0, 4: 1, 3: 2, 5: 3, 2: 4}

R = 6371000.0


def haversine(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2 +
         math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 2 * R * math.asin(min(1.0, math.sqrt(a)))


def span_metres(p):
    """外接矩形の対角のおおよその長さ（メートル）"""
    dlat = (p["maxlat"] - p["minlat"]) * 111000.0
    dlon = (p["maxlon"] - p["minlon"]) * 111000.0 * math.cos(p["lat"] * math.pi / 180)
    return math.sqrt(dlat * dlat + dlon * dlon)


def distance_to_place(lat, lon, p):
    """施設までの距離。面なら外接矩形までの距離、点ならその点までの距離。"""
    if not p.get("area"):
        return haversine(lat, lon, p["lat"], p["lon"])
    clat = min(max(lat, p["minlat"]), p["maxlat"])
    clon = min(max(lon, p["minlon"]), p["maxlon"])
    return haversine(lat, lon, clat, clon)


# ---------------------------------------------------------------- 読み込み
def load_toilets():
    with open(os.path.join(DATA, "national.json"), encoding="utf-8") as f:
        els = json.load(f)["elements"]
    out = []
    for el in els:
        t = el.get("tags") or {}
        if t.get("amenity") != "toilets":
            continue
        if el["type"] == "node":
            lat, lon = el.get("lat"), el.get("lon")
        else:
            c = el.get("center") or {}
            lat, lon = c.get("lat"), c.get("lon")
        if lat is None or lon is None:
            continue
        key = {"node": "n", "way": "w", "relation": "r"}[el["type"]] + str(el["id"])
        out.append((key, lat, lon))
    return out


def display_name(name, kind):
    """表示用の名前を整える。

    OpenStreetMap では日本の鉄道駅の name は「新宿」のように
    「駅」を付けずに記録されている。そのままだと利用者が
    「新宿駅」で検索しても見つからないので、駅には「駅」を補う。
    （もともと「駅」「停留場」を含む名前には何も足さない）
    """
    if kind == 1 and "駅" not in name and "停留" not in name and "港" not in name:
        return name + "駅"
    return name


def load_places():
    places = []
    seen = set()
    for fn in sorted(os.listdir(PLACES)):
        if not fn.endswith(".json"):
            continue
        group = fn.rsplit("_", 1)[1][:-5]
        kind = KIND.get(group, 0)
        if kind == 0:
            continue
        with open(os.path.join(PLACES, fn), encoding="utf-8") as f:
            els = json.load(f).get("elements", [])
        for el in els:
            key = (el["type"], el["id"])
            if key in seen:
                continue
            seen.add(key)
            tags = el.get("tags") or {}
            name = tags.get("name")
            if not name:
                continue
            # 建物の中のテナント（駅ナカの店など）は「場所」ではないので使わない。
            # これを入れると「新宿駅のトイレ」が「駅ナカの惣菜店のそば」になってしまう。
            if tags.get("indoor") or tags.get("room") or tags.get("level"):
                continue
            # 路線（〇〇新幹線など）は「場所」ではない。
            # 外接矩形が数百kmに及び、近くのトイレを片端から巻き込んでしまう。
            if tags.get("route") or tags.get("type") in ("route", "route_master", "network"):
                continue
            name = display_name(name.strip(), kind)
            b = el.get("bounds")
            if b:
                places.append({
                    "type": el["type"], "id": el["id"], "name": name, "kind": kind,
                    "minlat": b["minlat"], "minlon": b["minlon"],
                    "maxlat": b["maxlat"], "maxlon": b["maxlon"],
                    "lat": (b["minlat"] + b["maxlat"]) / 2,
                    "lon": (b["minlon"] + b["maxlon"]) / 2,
                    "area": True,
                })
            elif el.get("lat") is not None:
                places.append({
                    "type": el["type"], "id": el["id"], "name": name, "kind": kind,
                    "lat": el["lat"], "lon": el["lon"], "area": False,
                })
    return places


# ---------------------------------------------------------------- 形状の取得
def post(query, endpoint, timeout=600):
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    req = urllib.request.Request(endpoint, data=data, headers={
        "User-Agent": "japan-toilet-map/1.0 (+build script; OSM data)",
        "Content-Type": "application/x-www-form-urlencoded",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def run(query, label, tries=8):
    for i in range(tries):
        ep = ENDPOINTS[i % len(ENDPOINTS)]
        try:
            return post(query, ep).get("elements", [])
        except urllib.error.HTTPError as ex:
            wait = 30 if ex.code in (429, 504) else 10
            print("  {}: HTTP {} -> {}秒待機".format(label, ex.code, wait), flush=True)
            time.sleep(wait)
        except Exception as ex:
            print("  {}: {} -> 12秒待機".format(label, type(ex).__name__), flush=True)
            time.sleep(12)
    return None


def fetch_geometry(needed):
    """needed: [(type, id), ...] -> data/place_geom/<type>_<batch>.json にためる"""
    ways = sorted({i for t, i in needed if t == "way"})
    rels = sorted({i for t, i in needed if t == "relation"})
    have = set()
    for fn in os.listdir(GEOM):
        with open(os.path.join(GEOM, fn), encoding="utf-8") as f:
            for el in json.load(f).get("elements", []):
                have.add((el["type"], el["id"]))
    ways = [i for i in ways if ("way", i) not in have]
    rels = [i for i in rels if ("relation", i) not in have]
    print("形状を取得する対象: way {} 件 / relation {} 件".format(len(ways), len(rels)), flush=True)

    def batches(ids, size):
        for i in range(0, len(ids), size):
            yield ids[i:i + size]

    for kind, ids, size in (("way", ways, 400), ("relation", rels, 150)):
        for n, chunk in enumerate(batches(ids, size), 1):
            path = os.path.join(GEOM, "{}_{}.json".format(kind, chunk[0]))
            if os.path.exists(path):
                continue
            q = "[out:json][timeout:600];\n{}(id:{});\nout geom;".format(
                kind, ",".join(str(i) for i in chunk))
            els = run(q, "{} 形状 {}".format(kind, n))
            if els is None:
                print("  {} 形状の取得に失敗: {}".format(kind, chunk[0]), flush=True)
                continue
            with open(path, "w", encoding="utf-8") as f:
                json.dump({"elements": els}, f, ensure_ascii=False)
            print("  {} 形状 {} 件目: {} 要素".format(kind, n, len(els)), flush=True)
            time.sleep(1.2)


def load_geometry():
    """(type, id) -> [ring, ring, ...]  ring は [(lat, lon), ...]"""
    out = {}
    for fn in sorted(os.listdir(GEOM)):
        with open(os.path.join(GEOM, fn), encoding="utf-8") as f:
            for el in json.load(f).get("elements", []):
                if el["type"] == "way":
                    g = el.get("geometry")
                    if not g or len(g) < 4:
                        continue
                    ring = [(p["lat"], p["lon"]) for p in g if p]
                    if ring[0] != ring[-1]:
                        continue  # 閉じていない線は面ではない
                    out[("way", el["id"])] = [ring]
                elif el["type"] == "relation":
                    rings = assemble_rings(el)
                    if rings:
                        out[("relation", el["id"])] = rings
    return out


def assemble_rings(rel):
    """マルチポリゴンの outer メンバーをつなぎ合わせて閉じた輪を作る"""
    segs = []
    for m in rel.get("members", []):
        if m.get("type") != "way" or m.get("role") not in ("outer", ""):
            continue
        g = m.get("geometry")
        if not g or len(g) < 2:
            continue
        segs.append([(p["lat"], p["lon"]) for p in g if p])
    rings = []
    while segs:
        cur = segs.pop(0)
        changed = True
        while cur[0] != cur[-1] and changed:
            changed = False
            for i, s in enumerate(segs):
                if s[0] == cur[-1]:
                    cur = cur + s[1:]; segs.pop(i); changed = True; break
                if s[-1] == cur[-1]:
                    cur = cur + s[::-1][1:]; segs.pop(i); changed = True; break
                if s[-1] == cur[0]:
                    cur = s[:-1] + cur; segs.pop(i); changed = True; break
                if s[0] == cur[0]:
                    cur = s[::-1][:-1] + cur; segs.pop(i); changed = True; break
        if cur[0] == cur[-1] and len(cur) >= 4:
            rings.append(cur)
    return rings


def point_in_rings(lat, lon, rings):
    for ring in rings:
        inside = False
        n = len(ring)
        j = n - 1
        for i in range(n):
            yi, xi = ring[i]
            yj, xj = ring[j]
            if (yi > lat) != (yj > lat):
                x = (xj - xi) * (lat - yi) / (yj - yi) + xi
                if lon < x:
                    inside = not inside
            j = i
        if inside:
            return True
    return False


# ---------------------------------------------------------------- 空間索引
CELL = 0.02  # 約2km


def cell_of(lat, lon):
    return (int(math.floor(lat / CELL)), int(math.floor(lon / CELL)))


def build_index(places):
    idx = collections.defaultdict(list)
    for p in places:
        if p["area"]:
            for cy in range(int(math.floor(p["minlat"] / CELL)), int(math.floor(p["maxlat"] / CELL)) + 1):
                for cx in range(int(math.floor(p["minlon"] / CELL)), int(math.floor(p["maxlon"] / CELL)) + 1):
                    idx[(cy, cx)].append(p)
        else:
            idx[cell_of(p["lat"], p["lon"])].append(p)
    return idx


def neighbours(lat, lon):
    cy, cx = cell_of(lat, lon)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            yield (cy + dy, cx + dx)


def main():
    toilets = load_toilets()
    print("トイレ: {} 件".format(len(toilets)), flush=True)
    places = load_places()
    print("施設: {} 件（うち面 {} 件）".format(
        len(places), sum(1 for p in places if p["area"])), flush=True)

    idx = build_index(places)

    # --- 第1段階: 外接矩形に入る面の候補を洗い出す ---
    candidates = collections.defaultdict(list)   # toilet key -> [place]
    needed = set()
    for key, lat, lon in toilets:
        seen = set()
        for c in neighbours(lat, lon):
            for p in idx.get(c, ()):
                pid = (p["type"], p["id"])
                if pid in seen:
                    continue
                seen.add(pid)
                if p["area"]:
                    if p["minlat"] <= lat <= p["maxlat"] and p["minlon"] <= lon <= p["maxlon"]:
                        candidates[key].append(p)
                        needed.add(pid)
    print("外接矩形に入った組み合わせ: {} 件（対象施設 {} 件）".format(
        sum(len(v) for v in candidates.values()), len(needed)), flush=True)

    # --- 第2段階: 候補の実形状を取得する ---
    fetch_geometry(needed)
    geom = load_geometry()
    print("形状を読み込めた施設: {} 件".format(len(geom)), flush=True)

    # --- 第3段階: 判定 ---
    assign = {}
    stats = collections.Counter()
    for key, lat, lon in toilets:
        best = None   # (優先度, 面積の代わりの矩形サイズ, place, inside, dist)

        # 実形状の中に入っているか
        for p in candidates.get(key, ()):
            rings = geom.get((p["type"], p["id"]))
            if not rings:
                continue
            if point_in_rings(lat, lon, rings):
                span = (p["maxlat"] - p["minlat"]) * (p["maxlon"] - p["minlon"])
                cand = (0, span, 0, p, True, 0)
                if best is None or cand[:2] < best[:2]:
                    best = cand

        if best is None:
            # 近くにあるか（点の施設、または形状に入らなかった面）
            seen = set()
            for c in neighbours(lat, lon):
                for p in idx.get(c, ()):
                    pid = (p["type"], p["id"])
                    if pid in seen:
                        continue
                    seen.add(pid)
                    if p.get("area") and span_metres(p) > MAX_NEAR_SPAN.get(p["kind"], 1500):
                        continue
                    d = distance_to_place(lat, lon, p)
                    limit = NEAR_LIMIT.get(p["kind"], 100)
                    if d <= limit:
                        pr = NEAR_PRIORITY.get(p["kind"], 9)
                        cand = (1, pr, d, p, False, d)
                        if best is None or (cand[1], cand[2]) < (best[1], best[2]):
                            best = cand

        if best is not None:
            p = best[3]
            assign[key] = {
                "place": p["name"], "kind": p["kind"],
                "inside": best[4], "dist": int(round(best[5])),
                "pid": p["type"][0] + str(p["id"]),
            }
            stats["inside" if best[4] else "near"] += 1
            stats["kind{}".format(p["kind"])] += 1
        else:
            stats["none"] += 1

    with open(os.path.join(DATA, "place_assign.json"), "w", encoding="utf-8") as f:
        json.dump(assign, f, ensure_ascii=False, separators=(",", ":"))

    print()
    print("場所が分かった: {} 件 / {} 件".format(len(assign), len(toilets)))
    print("  施設の中: {}".format(stats["inside"]))
    print("  施設のそば: {}".format(stats["near"]))
    print("  分からなかった: {}".format(stats["none"]))
    names = {1: "駅・駅ビル", 2: "商業施設", 3: "公園", 4: "道の駅・SA/PA", 5: "公共施設"}
    for k in sorted(names):
        print("  {}: {}".format(names[k], stats["kind{}".format(k)]))


if __name__ == "__main__":
    main()
