# -*- coding: utf-8 -*-
"""「〇〇の中」という表示が本当に正しいかを、Overpass の is_in で独立に検証する。

こちらの内外判定は自前の点と多角形の計算で出している。
それが正しいかを確かめるため、同じ座標を Overpass に投げて
「その点を含む面」を返してもらい、割り当てた施設が含まれているか確認する。

使い方: python scripts/audit_places.py [件数]
"""
import json, os, random, sys, time
import urllib.request, urllib.error, urllib.parse

BASE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(BASE, "..", "web", "data")
DATA = os.path.join(BASE, "..", "data")

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]

N = int(sys.argv[1]) if len(sys.argv) > 1 else 20

KIND_NAMES = {1: "駅・駅ビル", 2: "商業施設", 3: "公園", 4: "道の駅・SA/PA", 5: "公共施設"}


def post(query, endpoint, timeout=120):
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    req = urllib.request.Request(endpoint, data=data, headers={
        "User-Agent": "japan-toilet-map/1.0 (place audit)",
        "Content-Type": "application/x-www-form-urlencoded",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def is_in(lat, lon):
    q = "[out:json][timeout:60];is_in({},{});out tags;".format(lat, lon)
    for i in range(6):
        ep = ENDPOINTS[i % len(ENDPOINTS)]
        try:
            return post(q, ep).get("elements", [])
        except urllib.error.HTTPError as ex:
            time.sleep(20 if ex.code in (429, 504) else 8)
        except Exception:
            time.sleep(10)
    return None


def main():
    with open(os.path.join(WEB, "points.json"), encoding="utf-8") as f:
        pts = json.load(f)["points"]
    with open(os.path.join(WEB, "details.json"), encoding="utf-8") as f:
        det = json.load(f)["details"]
    with open(os.path.join(DATA, "place_assign.json"), encoding="utf-8") as f:
        assign = json.load(f)

    # 「施設の中」と表示していて、施設由来ではないものだけを対象にする
    targets = []
    for i, (p, d) in enumerate(zip(pts, det)):
        flags = p[2]
        inside = (flags >> 30) & 1
        derived = (flags >> 26) & 1
        if inside and not derived and d[4]:
            targets.append(i)

    print("「施設の中」と表示している件数: {}".format(len(targets)))
    random.seed(20260824)
    sample = random.sample(targets, min(N, len(targets)))

    ok = miss = skipped = 0
    problems = []
    for n, i in enumerate(sample, 1):
        lat, lon = pts[i][0] / 1e5, pts[i][1] / 1e5
        place = det[i][4]
        osmid = det[i][3]
        kind = (pts[i][2] >> 27) & 7
        pid = (assign.get(osmid) or {}).get("pid", "")

        areas = is_in(lat, lon)
        if areas is None:
            print("  {}/{} {} … 確認できず".format(n, len(sample), osmid))
            skipped += 1
            continue

        names = set()
        ids = set()
        for a in areas:
            t = a.get("tags") or {}
            if t.get("name"):
                names.add(t["name"])
            # is_in が返す area id から元の way/relation id を復元する
            aid = a.get("id", 0)
            if aid > 3600000000:
                ids.add("r" + str(aid - 3600000000))
            elif aid > 2400000000:
                ids.add("w" + str(aid - 2400000000))

        # 駅は表示用に「駅」を足しているので、元の名前でも照合する
        base = place[:-1] if place.endswith("駅") else place
        hit = (pid and pid in ids) or (place in names) or (base in names)
        if hit:
            ok += 1
            print("  {}/{} {} … 一致（{} / {}）".format(
                n, len(sample), osmid, place, KIND_NAMES.get(kind, "")))
        else:
            miss += 1
            problems.append((osmid, place, pid, sorted(names)[:6]))
            print("  {}/{} {} … 不一致（表示「{}」）".format(n, len(sample), osmid, place))
        time.sleep(1.2)

    print()
    print("一致 {} / 不一致 {} / 確認できず {}".format(ok, miss, skipped))
    if problems:
        print("\n--- 不一致の内訳 ---")
        for osmid, place, pid, names in problems:
            print("{}  表示: {} (施設ID {})".format(osmid, place, pid))
            print("   その点を含むとOSMが答えた面: {}".format(names))
    return 1 if miss else 0


if __name__ == "__main__":
    sys.exit(main())
