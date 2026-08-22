# デザイン依頼書 その2：背景地図の配色（palette.js）

前回作成いただいた `web/styles.css` / `web/design/DESIGN_SPEC.md` の
デザインシステムと**調和する**、背景地図（ベースマップ）の配色を作ってください。

## 前提

- 背景地図は国土地理院「最適化ベクトルタイル」を MapLibre GL JS で描画します。
- レイヤ構成は `web/js/basemap.js`（Claude Code が実装済み）で定義済みです。
  **このファイルは読むだけで、編集しないでください。**
- `basemap.js` は `window.TMPalette` から色を受け取ります。
  あなたはその **色の値だけ** を決めてください。

## 作成するファイル

`web/js/palette.js` ただ1つ。中身は次の形とします。

```js
(function (global) {
  'use strict';
  global.TMPalette = {
    light: { /* 下記キーすべて */ },
    dark:  { /* 下記キーすべて */ }
  };
})(window);
```

## 必要なキー（light / dark 両方に必ず全部）

| キー | 用途 |
|---|---|
| `land` | 陸地・背景 |
| `terrain` | 砂礫地・湿地などの地形表記面 |
| `water` | 海・湖・河川の面 |
| `waterLine` | 海岸線・水涯線 |
| `adminPref` | 都府県界（破線） |
| `adminCity` | 市区町村界（破線） |
| `building` | 建物の面 |
| `buildingLine` | 建物の輪郭線 |
| `roadExpwy` | 高速道路の本体 |
| `roadExpwyCase` | 高速道路の縁取り |
| `roadNational` | 国道の本体 |
| `roadNationalCase` | 国道の縁取り |
| `roadPref` | 都道府県道・主要道路の本体 |
| `roadPrefCase` | 同 縁取り |
| `roadLocal` | 市区町村道の本体 |
| `roadLocalCase` | 同 縁取り |
| `roadTunnel` | トンネル区間（破線） |
| `railCase` | 鉄道の下地 |
| `railDash` | 鉄道の白破線 |
| `label` | 注記（地名）の文字色 |
| `labelRail` | 鉄道・駅の注記の文字色 |
| `labelWater` | 水部の注記の文字色 |
| `labelTerrain` | 山地など地形の注記の文字色 |
| `labelHalo` | 注記のふちどり色 |

値は `#rrggbb` または `rgba(...)` の文字列にしてください。

## 設計上の要件

1. **地図が背景であることを忘れない。** 背景地図はあくまで下地であり、
   その上に置くトイレのマーカー（`--primary-strong` #005560 系 / `--danger` #a52920 系 /
   `--unknown` #596a77 系）が **確実に目立つ** 配色にしてください。
   背景地図の彩度は抑えめにすること。
2. GoogleマップやiPhoneのマップのような、**明るく親しみやすく、情報が読み取りやすい**印象。
3. 注記（地名）の文字は `labelHalo` によるふちどりで、地図上でも確実に読めること。
   文字色と背景（`land` / `water` / `building`）のコントラスト比を 4.5:1 以上にすること。
4. 道路の階層（高速 > 国道 > 都道府県道 > 市区町村道）が **色と明度で直感的に分かる**こと。
5. `dark` は `prefers-color-scheme: dark` のときに使います。
   暗所で眩しくない、落ち着いた配色にしてください。
6. 色覚特性のある人でも道路階層と水部が区別できるよう、
   色相だけでなく **明度差** でも区別をつけてください。

## 提出時に報告してほしいこと

- 主要な色の HEX と、その意図
- `label` と `land` / `water` / `building` のコントラスト比（実際に計算した数値）
- light / dark それぞれのキーが 24個すべて揃っていることの確認
