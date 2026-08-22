# -*- coding: utf-8 -*-
"""アプリのデータが OpenStreetMap の元データと食い違っていないか抜き取り検査する。

web/data/*.json からランダムに選んだ件について、OSM API で元のタグを取り直し、
アプリが表示する値と一致するか確かめる。
"""
import json, os, random, sys, time, urllib.request, urllib.error

BASE = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(BASE, "..", "web", "data")

sys.path.insert(0, BASE)
from build_data import multi_code, style_code, access_code, h24_code, tri  # noqa: E402

LABEL_MULTI = {0: "不明", 1: "あり", 2: "一部対応", 3: "なし"}
LABEL_STYLE = {0: "不明", 1: "洋式", 2: "和式", 3: "洋式・和式の両方"}
LABEL_YESNO = {0: "不明", 1: "あり", 2: "なし"}

N = int(sys.argv[1]) if len(sys.argv) > 1 else 40


def unpack(f):
    return {
        "multi": f & 3,
        "style": (f >> 2) & 3,
        "male": (f >> 4) & 3,
        "female": (f >> 6) & 3,
        "unisex": (f >> 8) & 3,
        "baby": (f >> 10) & 3,
        "ostomate": (f >> 12) & 3,
        "fee": (f >> 14) & 3,
        "access": (f >> 16) & 3,
        "h24": (f >> 18) & 3,
    }


def osm_tags(osmid):
    kind = {"n": "node", "w": "way", "r": "relation"}[osmid[0]]
    url = "https://api.openstreetmap.org/api/0.6/{}/{}.json".format(kind, osmid[1:])
    req = urllib.request.Request(url, headers={
        "User-Agent": "japan-toilet-map/1.0 (data audit)"
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        d = json.loads(r.read().decode("utf-8"))
    els = d.get("elements", [])
    if not els:
        return None
    return els[0].get("tags", {}) or {}


def main():
    with open(os.path.join(WEB, "points.json"), encoding="utf-8") as f:
        pts = json.load(f)["points"]
    with open(os.path.join(WEB, "details.json"), encoding="utf-8") as f:
        det = json.load(f)["details"]

    random.seed(20260823)
    idx = random.sample(range(len(pts)), N)

    ok = mismatch = skipped = 0
    problems = []

    for n, i in enumerate(idx, 1):
        lat, lon, flags = pts[i]
        name, hours, operator, osmid = det[i]
        try:
            tags = osm_tags(osmid)
        except urllib.error.HTTPError as e:
            print("  {}/{} {} … OSM側で取得できず（HTTP {}）".format(n, N, osmid, e.code))
            skipped += 1
            time.sleep(1)
            continue
        except Exception as e:
            print("  {}/{} {} … 取得失敗 {}".format(n, N, osmid, type(e).__name__))
            skipped += 1
            time.sleep(2)
            continue

        if tags is None:
            skipped += 1
            continue

        got = unpack(flags)
        want = {
            "multi": multi_code(tags),
            "style": style_code(tags),
            "male": tri(tags.get("male")),
            "female": tri(tags.get("female")),
            "unisex": tri(tags.get("unisex")),
            "baby": tri(tags.get("changing_table")),
            "ostomate": tri(tags.get("ostomate")),
            "fee": tri(tags.get("fee")),
            "access": access_code(tags),
            "h24": h24_code((tags.get("opening_hours") or "").strip()),
        }
        want_name = (tags.get("name") or tags.get("name:ja") or "").strip()

        diffs = [k for k in want if want[k] != got[k]]
        if want_name != name:
            diffs.append("name")

        if diffs:
            mismatch += 1
            problems.append((osmid, diffs, got, want, name, want_name))
            print("  {}/{} {} … 不一致: {}".format(n, N, osmid, ",".join(diffs)))
        else:
            ok += 1
            print("  {}/{} {} … 一致（多目的={} 便器={}）".format(
                n, N, osmid, LABEL_MULTI[got["multi"]], LABEL_STYLE[got["style"]]))
        time.sleep(0.4)

    print()
    print("一致 {} / 不一致 {} / 確認できず {}".format(ok, mismatch, skipped))
    if problems:
        print("\n--- 不一致の内訳 ---")
        for osmid, diffs, got, want, name, want_name in problems:
            print(osmid, diffs)
            for k in diffs:
                if k == "name":
                    print("   name: アプリ={!r} OSM={!r}".format(name, want_name))
                else:
                    print("   {}: アプリ={} OSM={}".format(k, got[k], want[k]))
    return 1 if mismatch else 0


if __name__ == "__main__":
    sys.exit(main())
