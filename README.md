# トイレマップ — 日本全国の誰でも使えるトイレ

**▶ 公開先: https://yangxiangzuomu738-stack.github.io/japan-toilet-map/**

日本全国の公衆トイレ・公共施設のトイレを地図で探せる Web アプリです。
多目的トイレ（車いす対応）、洋式・和式、男子／女子トイレ・共用の有無を、
分かる範囲で正直に表示します。

- 掲載件数: **31,704 件**（日本全国）
- 地図: 国土地理院ベクトルタイル（ベクター描画なので、拡大しても文字や線がぼやけません）
- 拡大・縮小・スクロール、現在地表示、絞り込み、地名検索に対応
- ビルドツール不要の静的サイト（HTML / CSS / JavaScript のみ）

---

## データについて（重要・正直な説明）

このアプリのトイレ情報は **OpenStreetMap**（世界中の有志が作る自由な地図）を出典としています。
日本全国を網羅する、機械可読で自由に使えるトイレのデータは、実質これしかありません。

そのため、**項目によっては「不明」が非常に多い**という限界があります。
アプリ上では、記録が無い項目を推測で埋めず、そのまま「不明」と表示します。

| 項目 | 記録がある件数 | 割合 |
|---|---:|---:|
| 多目的トイレ（車いす対応） | 6,635 件 | 20.9% |
| 便器の種類（洋式・和式） | 866 件 | **2.7%** |
| 男子トイレの有無 | 2,311 件 | 7.3% |
| 女子トイレの有無 | 2,334 件 | 7.4% |
| 共用の有無 | 2,202 件 | 6.9% |
| おむつ交換台 | 1,730 件 | 5.5% |
| オストメイト対応 | 79 件 | 0.2% |
| 料金（有料・無料） | 5,310 件 | 16.7% |
| 利用条件 | 5,246 件 | 16.5% |
| 利用時間 | 702 件 | 2.2% |

（2026年8月23日時点。`npm run build:data` を実行すると最新化されます）

**とくに「洋式・和式」は 2.7% しか記録がありません。**
絞り込みで「洋式あり」を選ぶと数百件しか出ませんが、
これは「洋式トイレが数百件しかない」という意味ではなく、
**「洋式だと記録されているものが数百件しかない」** という意味です。
アプリ内の絞り込みパネルにも同じ注意書きを表示しています。

情報を増やすには、OpenStreetMap に直接タグを追加するのが確実です。
詳細パネルの「OpenStreetMap で元データを見る」から、その場所の元データへ移動できます。

### 掲載対象

`amenity=toilets` のうち、`access=private` / `access=no`（＝関係者以外使えない）を
除いたものを掲載しています（151 件を除外）。
`access=customers`（施設利用者・お客様のみ）は、
利用条件を明記したうえで掲載し、絞り込みで除外できるようにしています。

---

## 使い方

1. 地図をドラッグして動かし、ピンチまたは ＋ / − ボタンで拡大・縮小します。
2. マーカーを選ぶと、そのトイレの詳細が開きます。
3. 「絞り込み」から、車いす対応・洋式・和式・おむつ交換台などで絞り込めます。
4. 検索欄に地名や住所を入れると、その場所へ移動します。
5. 右上の「文字」で、文字の大きさを「標準」「大」に切り替えられます。

### マーカーの意味

| 印 | 意味 |
|---|---|
| 濃い青緑のピン（人のマーク） | 車いす対応（多目的トイレ）あり |
| 赤い盾（×） | 車いす対応なし・一部対応 |
| 灰色のひし形（?） | 車いす対応は不明 |
| 数字入りの丸 | その付近に複数のトイレがあります（拡大すると分かれます） |

色だけでなく形でも区別しているので、色の見え方に特性がある方でも判別できます。

---

## ローカルで動かす

```bash
python -m http.server 8765 --directory web
```

ブラウザで `http://127.0.0.1:8765/` を開きます。
（`web/` 以下は静的ファイルのみなので、どんな静的サーバーでも動きます）

## データを最新にする

```bash
python scripts/fetch_osm.py          # 都道府県ごとに Overpass API から取得
python scripts/build_data.py         # web/data/*.json を生成
```

全国一括の取得は `scripts/verify_all.ql` を Overpass API に投げて
`data/national.json` として保存します（`build_data.py` はこれを正とします）。

## 動作を検証する

```bash
npm install
node scripts/verify.js               # ヘッドレスブラウザで機能を自動検証
node scripts/probe_basemap.js        # 背景地図の描画を層ごとに数える
node scripts/shot.js gpu 139.7671 35.6812 16 light 1200 800 map
```

`data/shots/` にスクリーンショットが出力されます。

> **見た目の確認は必ず `scripts/shot.js` を使ってください。**
> ヘッドレスのソフトウェア描画（SwiftShader）では
> `fill` と `line` のシェーダがコンパイルできず、
> 道路・建物・水域が描画されないことがあります（文字とアイコンだけが出ます）。
> `scripts/shot.js` は実GPUのChromeを使うため、本物の見た目が確認できます。

---

## 構成

```
web/
  index.html          画面の骨組み
  styles.css          デザイン一式        ← Codex（デザイン担当）
  design/
    BRIEF1〜5.md         デザイン依頼書       ← Claude Code から Codex への指示
    DESIGN_SPEC.md    デザイン仕様書       ← Codex
    icons.js          SVGアイコン集        ← Codex
    ui.html           UIマークアップ原案    ← Codex
  js/
    palette.js        背景地図の配色        ← Codex
    basemap.js        地図スタイルの組み立て ← Claude Code
    data.js           データの復号と絞り込み ← Claude Code
    app.js            画面の結線と地図操作   ← Claude Code
  data/
    points.json       座標と属性（ビット詰め）
    details.json      名称・時間・管理者・OSM ID
    meta.json         件数と網羅率
  vendor/
    maplibre-gl.js    MapLibre GL JS v5.6.0 (BSD-3-Clause)
scripts/
  fetch_osm.py        Overpass API から取得
  build_data.py       アプリ用データを生成
  verify.js           自動検証
  probe_*.js          描画の診断
```

### 役割分担

デザイン（配色・レイアウト・アイコン・タイポグラフィ）は **すべて OpenAI Codex** が担当し、
データ処理・地図ロジック・統合・検証は **Claude Code** が担当しました。
やりとりは `web/design/BRIEF1.md` 〜 `BRIEF5.md` に残してあります。

---

## 出典・ライセンス

- トイレのデータ: © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright)（[ODbL](https://opendatacommons.org/licenses/odbl/)）
- 背景地図: [国土地理院 最適化ベクトルタイル](https://maps.gsi.go.jp/development/ichiran.html)
- 地図描画: [MapLibre GL JS](https://maplibre.org/) v5.6.0（BSD-3-Clause）
- 地名検索: 国土地理院 住所検索 API

このリポジトリのコードは MIT ライセンスです（`LICENSE` を参照）。
データそのものは上記の各ライセンスに従います。
