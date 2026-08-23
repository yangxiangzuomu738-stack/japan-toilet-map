# -*- coding: utf-8 -*-
"""Overpass の生データ -> web/data/*.json（アプリ用の軽量データ）

入力:
  data/national.json         … 日本全国の amenity=toilets 全件。これが正。
  data/raw/JP-NN.json        … 都道府県コードの割り当てに使う
  data/place_assign.json     … 各トイレの「場所」（scripts/assign_places.py が作る）
  data/facility_toilets.json … 施設側に toilets=yes と記録されている場所

嘘をつかないための原則:
  - タグが無い項目は「不明」(0)。false と「不明」を混同しない。
  - 推測でタグを補完しない。
  - 施設に toilets=yes とあるだけのものは derived=1 とし、
    「施設のどこかにある」ことしか分からないと明示できるようにする。
  - 施設の wheelchair=yes は「施設が車いす対応」であってトイレの話ではないので、
    derived の多目的トイレ判定には toilets:wheelchair だけを使う。
"""
import json, os, glob, re, math, collections, datetime, sys

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "..", "data")
RAW = os.path.join(DATA, "raw")
NATIONAL = os.path.join(DATA, "national.json")
PLACE_ASSIGN = os.path.join(DATA, "place_assign.json")
FACILITY = os.path.join(DATA, "facility_toilets.json")
OUT = os.path.join(BASE, "..", "web", "data")
os.makedirs(OUT, exist_ok=True)

PREF_NAMES = {
    1: "北海道", 2: "青森県", 3: "岩手県", 4: "宮城県", 5: "秋田県", 6: "山形県",
    7: "福島県", 8: "茨城県", 9: "栃木県", 10: "群馬県", 11: "埼玉県", 12: "千葉県",
    13: "東京都", 14: "神奈川県", 15: "新潟県", 16: "富山県", 17: "石川県", 18: "福井県",
    19: "山梨県", 20: "長野県", 21: "岐阜県", 22: "静岡県", 23: "愛知県", 24: "三重県",
    25: "滋賀県", 26: "京都府", 27: "大阪府", 28: "兵庫県", 29: "奈良県", 30: "和歌山県",
    31: "鳥取県", 32: "島根県", 33: "岡山県", 34: "広島県", 35: "山口県", 36: "徳島県",
    37: "香川県", 38: "愛媛県", 39: "高知県", 40: "福岡県", 41: "佐賀県", 42: "長崎県",
    43: "熊本県", 44: "大分県", 45: "宮崎県", 46: "鹿児島県", 47: "沖縄県",
}

PLACE_KIND_NAMES = {0: "", 1: "駅・駅ビル", 2: "商業施設", 3: "公園",
                    4: "道の駅・SA/PA", 5: "公共施設"}

YES = {"yes", "designated", "true", "1"}
NO = {"no", "false", "0"}
R = 6371000.0


def haversine(lat1, lon1, lat2, lon2):
    p = math.pi / 180
    a = (math.sin((lat2 - lat1) * p / 2) ** 2 +
         math.cos(lat1 * p) * math.cos(lat2 * p) * math.sin((lon2 - lon1) * p / 2) ** 2)
    return 2 * R * math.asin(min(1.0, math.sqrt(a)))


def tri(v):
    """yes/no タグ -> 1(あり) / 2(なし) / 0(不明)"""
    if v is None:
        return 0
    v = v.strip().lower()
    if v in YES:
        return 1
    if v in NO:
        return 2
    return 0


def multi_code(t):
    """多目的トイレ（車いす対応）: 0=不明 1=あり 2=一部対応 3=なし"""
    for key in ("wheelchair", "toilets:wheelchair"):
        v = t.get(key)
        if v is None:
            continue
        v = v.strip().lower()
        if v in ("yes", "designated"):
            return 1
        if v == "limited":
            return 2
        if v == "no":
            return 3
    return 0


def multi_code_facility(t):
    """施設のタグから読む場合。施設の wheelchair はトイレの話ではないので使わない。"""
    v = t.get("toilets:wheelchair")
    if v is None:
        return 0
    v = v.strip().lower()
    if v in ("yes", "designated"):
        return 1
    if v == "limited":
        return 2
    if v == "no":
        return 3
    return 0


POS_SPLIT = re.compile(r"[;,/|]")


def style_code(t):
    """便器の種類: 0=不明 1=洋式 2=和式 3=両方"""
    raw = t.get("toilets:position") or t.get("toilets:type")
    seated = squat = False
    if raw:
        parts = {p.strip().lower() for p in POS_SPLIT.split(raw)}
        seated = bool(parts & {"seated", "sitting", "western"})
        squat = bool(parts & {"squat", "squatting", "japanese"})
    if not seated and tri(t.get("toilets:seated")) == 1:
        seated = True
    if not squat and tri(t.get("toilets:squat")) == 1:
        squat = True
    if seated and squat:
        return 3
    if seated:
        return 1
    if squat:
        return 2
    return 0


def access_code(t):
    """利用条件: 0=不明 1=誰でも 2=施設利用者・客のみ 3=その他条件付き"""
    for key in ("toilets:access", "access"):
        v = t.get(key)
        if v is None:
            continue
        v = v.strip().lower()
        if v in ("yes", "public", "permissive"):
            return 1
        if v in ("customers", "customer"):
            return 2
        if v in ("permit", "destination", "residents"):
            return 3
    return 0


H24_PAT = re.compile(r"^(24/7|24 ?hours?|00:00-24:00|mo-su ?00:00-24:00)$", re.I)


def h24_code(oh):
    """24時間: 0=不明 1=24時間 2=時間の決まりあり"""
    if not oh:
        return 0
    if H24_PAT.match(oh.strip()):
        return 1
    return 2


def is_excluded(t):
    """「誰でも使えるトイレ」という趣旨から明確に外れるものを除外する"""
    for key in ("toilets:access", "access"):
        v = (t.get(key) or "").strip().lower()
        if v in ("private", "no"):
            return True
    return False


TOILET_DETAIL_TAGS = ("toilets:wheelchair", "toilets:disposal", "toilets:position",
                      "toilets:access", "ostomate")


# 「誰でも使えるトイレ」を集めるアプリなので、施設側の記録から拾うのは
# 一般の人が入れる施設に限る。学校・幼稚園・福祉施設・役所以外の官公庁などは、
# トイレの記録があっても外部の人は使えないため対象外とする。
PUBLIC_AMENITY = {
    "restaurant", "fast_food", "cafe", "pub", "bar", "biergarten", "ice_cream",
    "food_court", "marketplace", "library", "community_centre", "townhall",
    "public_building", "arts_centre", "theatre", "cinema", "place_of_worship",
    "post_office", "pharmacy", "bank", "fuel", "parking", "parking_space",
    "bus_station", "ferry_terminal", "public_bath", "hospital", "casino",
    "nightclub", "events_venue", "conference_centre", "exhibition_centre",
}
PUBLIC_LEISURE = {
    "park", "garden", "sports_centre", "swimming_pool", "water_park", "stadium",
    "playground", "marina", "beach_resort", "pitch", "nature_reserve",
}
PUBLIC_TOURISM = {
    "museum", "attraction", "information", "viewpoint", "theme_park", "zoo",
    "aquarium", "camp_site", "picnic_site", "gallery", "artwork",
}
PUBLIC_HIGHWAY = {"rest_area", "services", "bus_stop"}
PUBLIC_RAILWAY = {"station", "halt", "stop", "platform", "tram_stop"}
PUBLIC_BUILDING = {"retail", "train_station", "commercial", "public", "civic"}


def facility_is_public(t):
    """一般の人が入れる施設か。判断できないものは対象外にする（安全側に倒す）。"""
    if t.get("shop"):
        return True
    if t.get("amenity") in PUBLIC_AMENITY:
        return True
    if t.get("leisure") in PUBLIC_LEISURE:
        return True
    if t.get("tourism") in PUBLIC_TOURISM:
        return True
    if t.get("highway") in PUBLIC_HIGHWAY:
        return True
    if t.get("railway") in PUBLIC_RAILWAY:
        return True
    if t.get("public_transport") in ("station", "platform", "stop_position"):
        return True
    if t.get("historic"):
        return True
    if t.get("building") in PUBLIC_BUILDING:
        return True
    # building=yes のように種類が分からないものは、
    # 「トイレあり」と明示されている場合だけ認める
    if (t.get("toilets") or "").strip().lower() == "yes" and t.get("building"):
        return True
    return False


def facility_has_toilet(t):
    """施設側の記録から「トイレがある」と読み取れるか。

    推測はしない。誰かが実際に記録した内容だけを根拠にする。
      - toilets=yes / customers / limited / seasonal … 明示的に「トイレあり」
      - toilets:wheelchair などトイレの設備の記録がある
        … その設備を記録した人がトイレの存在を前提にしている
    toilets=no（明示的に無い）と、トイレ自体の記録（amenity=toilets）は対象外。
    """
    if t.get("amenity") == "toilets":
        return False
    v = (t.get("toilets") or "").strip().lower()
    if v == "no":
        return False
    if v in ("yes", "customers", "limited", "seasonal"):
        return True
    return any(t.get(k) for k in TOILET_DETAIL_TAGS)


def facility_access_code(t):
    """施設側の記録から利用条件を読む。toilets=customers は「客のみ」。"""
    v = (t.get("toilets") or "").strip().lower()
    if v == "customers":
        return 2
    return access_code(t)


def facility_kind(t):
    """施設のタグから場所の種類を決める"""
    if t.get("railway") in ("station", "halt") or t.get("public_transport") == "station" \
            or t.get("building") == "train_station":
        return 1
    if t.get("shop") or t.get("building") == "retail" or t.get("amenity") == "marketplace":
        return 2
    if t.get("leisure") in ("park", "garden"):
        return 3
    if t.get("highway") in ("rest_area", "services"):
        return 4
    if t.get("amenity") in ("townhall", "library", "community_centre") \
            or t.get("leisure") == "sports_centre":
        return 5
    return 0


# flags:
#   0-1 multi / 2-3 style / 4-5 male / 6-7 female / 8-9 unisex / 10-11 baby
#   12-13 ostomate / 14-15 fee / 16-17 access / 18-19 h24 / 20-25 pref
#   26 derived / 27-29 placeKind / 30 inside
def pack(multi, style, male, female, unisex, baby, osto, fee, acc, h24,
         pref, derived, place_kind, inside):
    f = (multi & 3)
    f |= (style & 3) << 2
    f |= (male & 3) << 4
    f |= (female & 3) << 6
    f |= (unisex & 3) << 8
    f |= (baby & 3) << 10
    f |= (osto & 3) << 12
    f |= (fee & 3) << 14
    f |= (acc & 3) << 16
    f |= (h24 & 3) << 18
    f |= (pref & 63) << 20
    f |= (1 if derived else 0) << 26
    f |= (place_kind & 7) << 27
    f |= (1 if inside else 0) << 30
    return f


def load_pref_index():
    index = {}
    for path in sorted(glob.glob(os.path.join(RAW, "JP-*.json"))):
        pref = int(os.path.basename(path)[3:5])
        with open(path, encoding="utf-8") as f:
            for el in json.load(f).get("elements", []):
                index[(el.get("type"), el.get("id"))] = pref
    return index


def pref_from_coords(lat, lon, pref_points):
    """都道府県別ファイルに載っていないものは、最も近いトイレの都道府県を借りる"""
    best = None
    for plat, plon, pref in pref_points:
        d = abs(plat - lat) + abs(plon - lon)
        if best is None or d < best[0]:
            best = (d, pref)
    return best[1] if best and best[0] < 0.5 else 0


CELL = 0.05


def main():
    if not os.path.exists(NATIONAL):
        print("data/national.json がありません。先に全国データを取得してください。", file=sys.stderr)
        sys.exit(1)

    pref_index = load_pref_index()

    place_assign = {}
    if os.path.exists(PLACE_ASSIGN):
        with open(PLACE_ASSIGN, encoding="utf-8") as f:
            place_assign = json.load(f)
        print("場所の割り当て: {} 件".format(len(place_assign)))
    else:
        print("警告: data/place_assign.json がありません。場所なしで作ります。", file=sys.stderr)

    with open(NATIONAL, encoding="utf-8") as f:
        elements = json.load(f).get("elements", [])

    seen = set()
    points, details = [], []
    stats = collections.Counter()
    per_pref = collections.Counter()
    excluded = no_coord = 0
    # 施設側 toilets=yes の重複判定に使う「実在するトイレ」の位置索引
    grid = collections.defaultdict(list)

    for el in elements:
        key = (el.get("type"), el.get("id"))
        if key in seen:
            continue
        seen.add(key)
        t = el.get("tags") or {}
        if t.get("amenity") != "toilets":
            continue
        if is_excluded(t):
            excluded += 1
            continue
        if el["type"] == "node":
            lat, lon = el.get("lat"), el.get("lon")
        else:
            c = el.get("center") or {}
            lat, lon = c.get("lat"), c.get("lon")
        if lat is None or lon is None:
            no_coord += 1
            continue

        osmid = {"node": "n", "way": "w", "relation": "r"}[el["type"]] + str(el["id"])
        pa = place_assign.get(osmid) or {}
        place = pa.get("place", "")
        place_kind = pa.get("kind", 0)
        inside = bool(pa.get("inside"))
        pdist = int(pa.get("dist", 0))

        pref = pref_index.get(key, 0)
        m = multi_code(t)
        st = style_code(t)
        male = tri(t.get("male"))
        female = tri(t.get("female"))
        uni = tri(t.get("unisex"))
        baby = tri(t.get("changing_table"))
        osto = tri(t.get("ostomate"))
        fee = tri(t.get("fee"))
        acc = access_code(t)
        oh = (t.get("opening_hours") or "").strip()
        h24 = h24_code(oh)

        points.append([round(lat * 1e5), round(lon * 1e5),
                       pack(m, st, male, female, uni, baby, osto, fee, acc, h24,
                            pref, False, place_kind, inside)])
        details.append([
            (t.get("name") or t.get("name:ja") or "").strip(),
            oh,
            (t.get("operator") or t.get("operator:ja") or "").strip(),
            osmid,
            place,
            pdist if not inside else 0,
        ])

        grid[(int(lat / CELL), int(lon / CELL))].append((lat, lon))

        stats["total"] += 1
        stats["real"] += 1
        if pref:
            per_pref[pref] += 1
        if place:
            stats["with_place"] += 1
            stats["place_inside" if inside else "place_near"] += 1
            stats["placekind{}".format(place_kind)] += 1
        for label, val in (("multi", m), ("style", st), ("male", male), ("female", female),
                           ("unisex", uni), ("baby", baby), ("ostomate", osto),
                           ("fee", fee), ("access", acc), ("h24", h24)):
            stats["{}={}".format(label, val)] += 1
        if details[-1][0]:
            stats["named"] += 1

    # 都道府県コードが分からなかったものを、近くのトイレから補う
    pref_points = []
    for i, p in enumerate(points):
        pr = (p[2] >> 20) & 63
        if pr:
            pref_points.append((p[0] / 1e5, p[1] / 1e5, pr))
    if pref_points:
        for i, p in enumerate(points):
            if ((p[2] >> 20) & 63) == 0:
                pr = pref_from_coords(p[0] / 1e5, p[1] / 1e5, pref_points)
                if pr:
                    points[i][2] |= (pr & 63) << 20
                    per_pref[pr] += 1

    # ------------------------------------------------ 施設側 toilets=yes を足す
    added = dup = not_public = 0
    if os.path.exists(FACILITY):
        with open(FACILITY, encoding="utf-8") as f:
            fac = json.load(f).get("elements", [])
        for el in fac:
            t = el.get("tags") or {}
            if not facility_has_toilet(t):
                continue
            if not facility_is_public(t):
                not_public += 1
                continue
            if is_excluded(t):
                excluded += 1
                continue
            if el["type"] == "node":
                lat, lon = el.get("lat"), el.get("lon")
            else:
                c = el.get("center") or {}
                lat, lon = c.get("lat"), c.get("lon")
            if lat is None or lon is None:
                no_coord += 1
                continue

            # 近くに本物のトイレの記録があるなら、そちらの方が正確なので足さない
            near = False
            cy, cx = int(lat / CELL), int(lon / CELL)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    for (tlat, tlon) in grid.get((cy + dy, cx + dx), ()):
                        if haversine(lat, lon, tlat, tlon) <= 120:
                            near = True
                            break
                    if near:
                        break
                if near:
                    break
            if near:
                dup += 1
                continue

            name = (t.get("name") or t.get("name:ja") or "").strip()
            kind = facility_kind(t)
            osmid = {"node": "n", "way": "w", "relation": "r"}[el["type"]] + str(el["id"])
            pref = pref_index.get((el.get("type"), el.get("id")), 0)
            if not pref and pref_points:
                pref = pref_from_coords(lat, lon, pref_points)

            m = multi_code_facility(t)
            st = style_code(t)
            baby = tri(t.get("changing_table"))
            osto = tri(t.get("ostomate"))
            acc = facility_access_code(t)
            oh = (t.get("opening_hours") or "").strip()

            points.append([round(lat * 1e5), round(lon * 1e5),
                           pack(m, st, 0, 0, 0, baby, osto, 0, acc, h24_code(oh),
                                pref, True, kind, True)])
            # トイレ自身の名前は記録されていないので空にし、施設名は「場所」に入れる
            # （「イオンモール ／ イオンモール の中」のような重複表示を避ける）
            details.append(["", oh,
                            (t.get("operator") or "").strip(), osmid, name, 0])
            added += 1
            stats["total"] += 1
            stats["derived"] += 1
            if pref:
                per_pref[pref] += 1
            if name:
                stats["with_place"] += 1
                stats["place_inside"] += 1
                stats["placekind{}".format(kind)] += 1
            for label, val in (("multi", m), ("style", st), ("male", 0), ("female", 0),
                               ("unisex", 0), ("baby", baby), ("ostomate", osto),
                               ("fee", 0), ("access", acc), ("h24", h24_code(oh))):
                stats["{}={}".format(label, val)] += 1

    known = {}
    for label in ("multi", "style", "male", "female", "unisex", "baby",
                  "ostomate", "fee", "access", "h24"):
        known[label] = stats["total"] - stats["{}=0".format(label)]

    meta = {
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "count": len(points),
        "count_real": stats["real"],
        "count_derived": stats["derived"],
        "source": "OpenStreetMap contributors (ODbL) / Overpass API",
        "excluded_private": excluded,
        "missing_coordinates": no_coord,
        "facility_duplicates_skipped": dup,
        "facility_not_public_skipped": not_public,
        "known": known,
        "place": {
            "with_place": stats["with_place"],
            "inside": stats["place_inside"],
            "near": stats["place_near"],
            "kinds": {str(k): {"name": PLACE_KIND_NAMES[k],
                               "count": stats["placekind{}".format(k)]}
                      for k in range(1, 6)},
        },
        "prefectures": {str(k): {"name": PREF_NAMES[k], "count": per_pref[k]}
                        for k in sorted(per_pref)},
    }

    with open(os.path.join(OUT, "points.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "points": points}, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "details.json"), "w", encoding="utf-8") as f:
        json.dump({"count": len(details), "details": details}, f,
                  ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    with open(os.path.join(DATA, "stats.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "stats": dict(stats)}, f, ensure_ascii=False, indent=2)

    print("入力要素数              : {}".format(len(elements)))
    print("トイレとして記録あり     : {}".format(stats["real"]))
    print("施設に「トイレあり」のみ : {} （近くに実物があり省いた: {} / "
          "一般の人が入れない施設として省いた: {}）".format(added, dup, not_public))
    print("掲載件数                : {}".format(len(points)))
    print("除外(private/no)        : {}".format(excluded))
    print("--- 場所が分かった件数 ---")
    print("  合計    : {} ({:.1f}%)".format(
        stats["with_place"], stats["with_place"] * 100.0 / max(1, len(points))))
    print("  施設の中: {}".format(stats["place_inside"]))
    print("  施設のそば: {}".format(stats["place_near"]))
    for k in range(1, 6):
        print("  {}: {}".format(PLACE_KIND_NAMES[k], stats["placekind{}".format(k)]))
    print("--- 項目が分かっている件数 ---")
    for k, v in known.items():
        print("  {:9s}: {:6d}  ({:.1f}%)".format(k, v, v * 100.0 / max(1, len(points))))


if __name__ == "__main__":
    main()
