# -*- coding: utf-8 -*-
"""Overpass の生データ -> web/data/*.json（アプリ用の軽量データ）

入力:
  data/national.json  … 日本全国（ISO3166-1=JP のエリア）の amenity=toilets 全件。これが正。
  data/raw/JP-NN.json … 都道府県ごとの取得結果。都道府県コードの割り当てにのみ使う。

嘘をつかないための原則:
  - タグが無い項目は「不明」(0) にする。false と「不明」を混同しない。
  - 推測でタグを補完しない。
  - 都道府県が特定できないものは「不明」(0) のままにする。
"""
import json, os, glob, re, collections, datetime, sys

BASE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(BASE, "..", "data")
RAW = os.path.join(DATA, "raw")
NATIONAL = os.path.join(DATA, "national.json")
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

YES = {"yes", "designated", "true", "1"}
NO = {"no", "false", "0"}


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


# flags: multi(2) style(2) male(2) female(2) unisex(2) baby(2) ostomate(2)
#        fee(2) access(2) h24(2) = 20bit,  pref(6bit) を上位に
def pack(multi, style, male, female, unisex, baby, osto, fee, acc, h24, pref):
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
    return f


def load_pref_index():
    """要素 -> 都道府県コード の対応表を都道府県別ファイルから作る"""
    index = {}
    for path in sorted(glob.glob(os.path.join(RAW, "JP-*.json"))):
        pref = int(os.path.basename(path)[3:5])
        with open(path, encoding="utf-8") as f:
            for el in json.load(f).get("elements", []):
                index[(el.get("type"), el.get("id"))] = pref
    return index


def main():
    if not os.path.exists(NATIONAL):
        print("data/national.json がありません。scripts/fetch_osm.py と全国クエリを先に実行してください。",
              file=sys.stderr)
        sys.exit(1)

    pref_index = load_pref_index()
    with open(NATIONAL, encoding="utf-8") as f:
        elements = json.load(f).get("elements", [])

    seen = set()
    points, details = [], []
    stats = collections.Counter()
    per_pref = collections.Counter()
    excluded = no_coord = no_pref = 0

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

        pref = pref_index.get(key, 0)
        if pref == 0:
            no_pref += 1

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
                       pack(m, st, male, female, uni, baby, osto, fee, acc, h24, pref)])

        name = (t.get("name") or t.get("name:ja") or "").strip()
        operator = (t.get("operator") or t.get("operator:ja") or "").strip()
        osmid = {"node": "n", "way": "w", "relation": "r"}[el["type"]] + str(el["id"])
        details.append([name, oh, operator, osmid])

        stats["total"] += 1
        if pref:
            per_pref[pref] += 1
        for label, val in (("multi", m), ("style", st), ("male", male), ("female", female),
                           ("unisex", uni), ("baby", baby), ("ostomate", osto),
                           ("fee", fee), ("access", acc), ("h24", h24)):
            stats[f"{label}={val}"] += 1
        if name:
            stats["named"] += 1

    # 「分かっている件数」＝ 不明(0) 以外
    known = {}
    for label in ("multi", "style", "male", "female", "unisex", "baby", "ostomate", "fee", "access", "h24"):
        known[label] = stats["total"] - stats[f"{label}=0"]

    meta = {
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "count": len(points),
        "source": "OpenStreetMap contributors (ODbL) / Overpass API",
        "excluded_private": excluded,
        "missing_coordinates": no_coord,
        "prefecture_unknown": no_pref,
        "known": known,
        "prefectures": {str(k): {"name": PREF_NAMES[k], "count": per_pref[k]} for k in sorted(per_pref)},
    }

    with open(os.path.join(OUT, "points.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "points": points}, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "details.json"), "w", encoding="utf-8") as f:
        json.dump({"count": len(details), "details": details}, f, ensure_ascii=False, separators=(",", ":"))
    with open(os.path.join(OUT, "meta.json"), "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    with open(os.path.join(DATA, "stats.json"), "w", encoding="utf-8") as f:
        json.dump({"meta": meta, "stats": dict(stats)}, f, ensure_ascii=False, indent=2)

    print(f"入力要素数        : {len(elements)}")
    print(f"掲載件数          : {len(points)}")
    print(f"除外(private/no)  : {excluded}")
    print(f"座標なしで除外    : {no_coord}")
    print(f"都道府県が不明    : {no_pref}")
    print("--- 項目が分かっている件数 ---")
    for k, v in known.items():
        print(f"  {k:9s}: {v:6d}  ({v * 100.0 / max(1, len(points)):.1f}%)")


if __name__ == "__main__":
    main()
