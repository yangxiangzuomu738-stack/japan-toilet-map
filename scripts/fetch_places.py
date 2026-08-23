# -*- coding: utf-8 -*-
"""トイレの「場所」を特定するための施設データを Overpass API から取得する。

目的:
  1. 駅・駅ビル・商業施設・公園などの中／そばにあるトイレに、施設名を結び付ける
     （「新宿駅」で検索して、駅の中のトイレが出るようにするため）
  2. 施設側に toilets=yes と記録されている場所を、トイレとして追加掲載する

出力:
  data/places/JP-NN_<group>.json … 各都道府県のトイレ周辺にある施設（外接矩形＋タグ）
  data/facility_toilets.json     … toilets=yes の施設（全国）

外接矩形（bounds）は「候補の絞り込み」にのみ使う。
正確な内外判定は scripts/assign_places.py が候補だけ実形状を取り直して行う。
"""
import json, os, sys, time, threading, queue
import urllib.request, urllib.error, urllib.parse

BASE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(BASE, "..", "data", "places")
os.makedirs(OUT, exist_ok=True)

# 実測で安定して応答するものだけを使う（kumi.systems と private.coffee は
# 2026-08-23 時点で 500/502 を返すため外した）
ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
# 各エンドポイントに何本の取得を同時に走らせるか（Overpass の同時実行枠は2）
WORKERS_PER_ENDPOINT = 2

PREFS = ["%02d" % i for i in range(1, 48)]

# グループ名, 半径(m), Overpass の抽出条件
GROUPS = [
    ("station", 150, [
        '["railway"="station"]["name"]',
        '["railway"="halt"]["name"]',
        '["public_transport"="station"]["name"]',
        '["building"="train_station"]["name"]',
    ]),
    ("shop", 120, [
        '["shop"~"^(supermarket|department_store|mall)$"]["name"]',
        '["building"="retail"]["name"]',
        '["amenity"="marketplace"]["name"]',
    ]),
    ("park", 150, [
        '["leisure"~"^(park|garden)$"]["name"]',
    ]),
    ("roadside", 250, [
        '["highway"~"^(rest_area|services)$"]["name"]',
    ]),
    ("public", 120, [
        '["amenity"~"^(townhall|library|community_centre)$"]["name"]',
        '["leisure"="sports_centre"]["name"]',
    ]),
]

QUERY = """[out:json][timeout:600];
area["ISO3166-2"="JP-{code}"]->.a;
nwr(area.a)["amenity"="toilets"]->.t;
(
{parts}
);
out tags bb;"""

# 施設側に「トイレがある」と読み取れる記録。
# toilets=yes だけでなく、トイレの設備が記録されているもの
# （toilets:wheelchair など）も、トイレが存在する記録として扱う。
# 「あるはず」という推測ではなく、誰かが実際に記録した情報だけを使う。
FACILITY_QUERY = """[out:json][timeout:900];
area["ISO3166-1"="JP"]["admin_level"="2"]->.jp;
(
  nwr(area.jp)["toilets"~"^(yes|customers|limited|seasonal)$"];
  nwr(area.jp)["toilets:wheelchair"]["amenity"!="toilets"]["toilets"!="no"];
  nwr(area.jp)["toilets:disposal"]["amenity"!="toilets"]["toilets"!="no"];
  nwr(area.jp)["toilets:position"]["amenity"!="toilets"]["toilets"!="no"];
  nwr(area.jp)["toilets:access"]["amenity"!="toilets"]["toilets"!="no"];
  nwr(area.jp)["ostomate"]["amenity"!="toilets"]["toilets"!="no"];
);
out center tags;"""


def post(query, endpoint, timeout=700):
    data = urllib.parse.urlencode({"data": query}).encode("utf-8")
    req = urllib.request.Request(endpoint, data=data, headers={
        "User-Agent": "japan-toilet-map/1.0 (+build script; OSM data)",
        "Content-Type": "application/x-www-form-urlencoded",
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def run(query, label, tries=8):
    """どのエンドポイントでもよいので取れるまで試す"""
    for i in range(tries):
        ep = ENDPOINTS[i % len(ENDPOINTS)]
        try:
            return post(query, ep).get("elements", [])
        except urllib.error.HTTPError as ex:
            wait = 30 if ex.code in (429, 504) else 10
            print("  {}: HTTP {} @ {} -> {}秒待機".format(
                label, ex.code, ep.split("/")[2], wait), flush=True)
            time.sleep(wait)
        except Exception as ex:
            print("  {}: {} @ {} -> 12秒待機".format(
                label, type(ex).__name__, ep.split("/")[2]), flush=True)
            time.sleep(12)
    return None


def run_on(query, endpoint, label, tries=4):
    """1つのエンドポイントだけで試す（並列取得用）"""
    for i in range(tries):
        try:
            return post(query, endpoint).get("elements", [])
        except urllib.error.HTTPError as ex:
            wait = 25 if ex.code in (429, 504) else 8
            print("  {}: HTTP {} @ {} -> {}秒待機".format(
                label, ex.code, endpoint.split("/")[2], wait), flush=True)
            time.sleep(wait)
        except Exception as ex:
            print("  {}: {} @ {} -> 10秒待機".format(
                label, type(ex).__name__, endpoint.split("/")[2]), flush=True)
            time.sleep(10)
    return None


def fetch_places():
    """エンドポイントごとに1本ずつ走らせて並列に取得する"""
    jobs = queue.Queue()
    todo = 0
    cached = 0
    for code in PREFS:
        for name, radius, conds in GROUPS:
            path = os.path.join(OUT, "JP-{}_{}.json".format(code, name))
            if os.path.exists(path):
                cached += 1
                continue
            jobs.put((code, name, radius, conds, path))
            todo += 1
    print("取得対象 {} 件（取得済み {} 件）".format(todo, cached), flush=True)
    if todo == 0:
        return

    done = [0]
    failures = [0]
    lock = threading.Lock()

    def worker(endpoint):
        while True:
            try:
                code, name, radius, conds, path = jobs.get_nowait()
            except queue.Empty:
                return
            label = "JP-{} {}".format(code, name)
            parts = "\n".join(
                "  nwr(around.t:{}){};".format(radius, c) for c in conds)
            q = QUERY.format(code=code, parts=parts)
            els = run_on(q, endpoint, label)
            if els is None:
                with lock:
                    failures[0] += 1
                    print("{}: このエンドポイントでは取得できず、積み直し".format(label), flush=True)
                if failures[0] < todo * 3:
                    jobs.put((code, name, radius, conds, path))
                time.sleep(20)
                continue
            with open(path, "w", encoding="utf-8") as f:
                json.dump({"elements": els}, f, ensure_ascii=False)
            with lock:
                done[0] += 1
                print("[{}/{}] {}: {} 件".format(done[0], todo, label, len(els)), flush=True)
            time.sleep(1.0)

    threads = []
    for ep in ENDPOINTS:
        for _ in range(WORKERS_PER_ENDPOINT):
            threads.append(threading.Thread(target=worker, args=(ep,), daemon=True))
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    total = 0
    for fn in os.listdir(OUT):
        with open(os.path.join(OUT, fn), encoding="utf-8") as f:
            total += len(json.load(f).get("elements", []))
    print("施設候補の取得完了 合計 {} 件".format(total), flush=True)


def fetch_facility_toilets():
    path = os.path.join(BASE, "..", "data", "facility_toilets.json")
    if os.path.exists(path):
        print("facility_toilets.json は取得済み", flush=True)
        return
    els = run(FACILITY_QUERY, "toilets=yes 施設")
    if els is None:
        print("toilets=yes の取得に失敗", file=sys.stderr)
        return
    with open(path, "w", encoding="utf-8") as f:
        json.dump({"elements": els}, f, ensure_ascii=False)
    print("toilets=yes の施設: {} 件".format(len(els)), flush=True)


if __name__ == "__main__":
    fetch_facility_toilets()
    fetch_places()
