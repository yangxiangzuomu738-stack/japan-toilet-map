# デザイン依頼書 その3：統合時に見つかった不具合の修正

前回作成いただいた `web/styles.css` を実際に `web/index.html` へ組み込んで動かしたところ、
次の2点の問題が見つかりました。**`web/styles.css` を修正してください。**

（`web/index.html` と `web/js/*.js` は Claude Code の担当です。編集しないでください。
 ただし、どんなHTML構造・クラス名になっているかは読んで確認してください。）

---

## 不具合1：地図の入れ物に大きさが指定されていない（致命的）

`web/index.html` では、地図エンジン（MapLibre GL JS）が描画する要素として

```html
<section class="map-region" id="map">
  <div id="map-container" role="application" aria-label="..."></div>
  ...（コントロール類、パネル類）
</section>
```

を置いています。

しかし `styles.css` には `#map-container` に対応するスタイルがなく、
**高さが 0px** になって地図がまったく表示されませんでした
（実測: 幅1265px × 高さ0px）。

### 直してほしいこと

`#map-container`（またはそれに付けるクラス）に、
`.map-region` いっぱいに広がるスタイルを追加してください。
`.map-region` は `position: relative` なので、`position: absolute; inset: 0;` が使えます。

- 地図本体なので、上に重なるコントロール類（`.map-controls` は z-index:10、
  `.side-panel` は z-index:15 など）より **背面** になるようにしてください。
- 既存の `.map-placeholder`（読み込み中に見せる斜線背景）は残しても構いませんが、
  実際の地図が入るのは `#map-container` です。
  クラスを新設する場合は、**そのクラス名を報告してください**
  （Claude Code が `index.html` の `div` に付けます）。
  クラスを新設せず `#map-container` の ID セレクタで指定してもかまいません。
  その場合は「ID セレクタで指定した」と報告してください。

---

## 不具合2：「文字サイズ 大」が効いていない

`web/index.html` のヘッダーに、高齢者向けの文字サイズ切替ボタンがあります。

```html
<button id="text-size-standard" aria-pressed="true">標準</button>
<button id="text-size-large" aria-pressed="false">大</button>
```

JavaScript は「大」が押されたとき、`<html>` と `<body>` の両方に
`is-large-text` クラスを付けます。

しかし現在の CSS は

```css
.is-large-text { font-size: 112.5%; }
```

だけで、**実際には文字が大きくなりません**。
理由は、デザイントークンが

```css
--text-body: 400 16px/1.6 ...;
```

のように **px 固定の `font` ショートハンド** で定義されており、
親要素の `font-size` を継承しないためです。

### 直してほしいこと

「大」を選んだときに、**アプリ内の文字が実際に一回り大きくなる**ようにしてください。
方法は任せますが、次のいずれかが素直です。

- タイポグラフィのトークンを `rem` ベースに変え、`html.is-large-text { font-size: 112.5%; }` で効かせる
- あるいは `.is-large-text` のスコープ内でトークン（`--text-body` など）を
  大きい値に再定義する

いずれの場合も、次を満たしてください。

1. 標準時の見た目は **今までと変わらない** こと。
2. 「大」のとき、本文・ボタン・パネル・凡例・検索欄の文字がすべて大きくなること。
3. 「大」のときもレイアウトが崩れないこと（特に幅320pxのスマホ、ヘッダーの折り返し、
   絞り込みパネル、詳細パネル）。
4. タップ領域は「大」のときも48px以上を維持すること。

---

## 補足：地図エンジンが生成する要素について

MapLibre GL JS は地図の中に次のような要素を自動生成します。
`styles.css` に既にある `.maplibregl-ctrl-scale` の指定と衝突しないか確認してください。

- `.maplibregl-canvas-container` / `.maplibregl-canvas` … 地図本体のキャンバス
- `.maplibregl-ctrl-bottom-left` … 縮尺バーが入る入れ物（`position: absolute` で地図の左下）
- `.maplibregl-ctrl-scale` … 縮尺バー本体

現在の `styles.css` は `.maplibregl-ctrl-scale` を
`position: absolute; right: var(--space-4); bottom: var(--space-6);` と指定していますが、
この要素の親（`.maplibregl-ctrl-bottom-left`）自体がすでに絶対配置されているため、
**意図した位置に出ない可能性**があります。
縮尺バーが地図の左下に、他のUI（凡例・パネル・出典表記）と重ならずに
きれいに出るように調整してください。

---

## 報告してほしいこと

- 不具合1で、ID セレクタにしたか、新しいクラス名を作ったか（作った場合はクラス名）
- 不具合2で採った方法と、標準時の見た目が変わらないことの確認
- 縮尺バーの配置をどう直したか
