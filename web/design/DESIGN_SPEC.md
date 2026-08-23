# トイレマップ デザイン仕様

## 1. 方針

この画面は、地図を初めて使う人にも迷いにくい、見慣れた地図アプリの構成にします。最も重要な情報である「トイレがある場所」と「車いす対応かどうか」を、短い日本語と大きなSVG記号で伝えます。色だけで判断させず、マーカーの外形と中の記号も変えます。データにない内容は推測せず、必ず「不明」と表示します。

- スマホ: 地図を主役にし、絞り込みと詳細は下から開くシートにします。
- PC: 左側に絞り込みまたは詳細、右側に広い地図を置きます。
- 文章: 16px以上の本文、17px以上の選択肢、平易な日本語を使います。
- 操作: すべての主要ボタンは最低48×48pxのタップ領域を持ち、キーボードでも操作できます。

## 2. デザイントークン

### カラーパレットとコントラスト

コントラスト比は相対輝度によるWCAG 2.1の計算値（小数第2位を四捨五入）です。`--ink` と `--paper` の組み合わせを通常の本文に、`--primary-strong` と `--paper` を主要ボタンの文字に使います。

| トークン | HEX | 用途 | 主な組み合わせ | 比率 |
|---|---:|---|---|---:|
| `--paper` | `#FFFFFF` | 面・カード | `--ink` / `--paper` | 16.15:1 |
| `--canvas` | `#F3F6F8` | 地図の下地・背景 | `--ink` / `--canvas` | 14.85:1 |
| `--ink` | `#17212B` | 本文・見出し | `--ink` / `--paper` | 16.15:1 |
| `--muted` | `#4B5B68` | 補足・不明 | `--muted` / `--paper` | 7.08:1 |
| `--primary` | `#006B78` | 操作・車いす対応 | `--primary` / `--paper` | 5.96:1 |
| `--primary-strong` | `#005560` | 主要ボタン背景 | `--paper` / `--primary-strong` | 8.22:1 |
| `--warning` | `#8A4B00` | 有料・注意 | `--warning` / `--paper` | 6.77:1 |
| `--danger` | `#A52920` | 非対応の印 | `--danger` / `--paper` | 7.02:1 |
| `--unknown` | `#596A77` | 不明の印 | `--unknown` / `--paper` | 5.65:1 |
| `--focus` | `#005FCC` | フォーカス輪郭 | `--focus` / `--paper` | 5.93:1 |

ダークモードでは同じ意味を保ち、`--paper`、`--canvas`、`--ink`などをメディアクエリで置き換えます。状態を示す色には必ず形、文字、または記号を併用します。

### 文字

システムフォントを使用します。`-apple-system`, `BlinkMacSystemFont`, `"Hiragino Sans"`, `"Yu Gothic UI"`, `"Yu Gothic"`, `Meiryo`, `sans-serif` の順です。

| 用途 | トークン | サイズ / 行間 | 太さ |
|---|---|---|---|
| 画面名 | `--text-title` | 22px / 1.3 | 700 |
| カード見出し | `--text-heading` | 19px / 1.4 | 700 |
| 本文 | `--text-body` | 16px / 1.6 | 400 |
| 選択肢・操作 | `--text-control` | 17px / 1.4 | 600 |
| 補足 | `--text-meta` | 14px / 1.5 | 400 |

文字を大きくする切替は、`body.is-large-text` により基準サイズを1.125倍にします。レイアウトは固定高さの文章領域を使わず、拡大後も内容が隠れません。

### 余白・形

余白は4pxを基準に、`--space-1`（4px）、`--space-2`（8px）、`--space-3`（12px）、`--space-4`（16px）、`--space-5`（20px）、`--space-6`（24px）、`--space-8`（32px）を使います。カードの角丸は16px、ボタンは12px、丸い地図コントロールは50%です。影は薄く、情報の境界は色ではなく余白と線でも明確にします。

## 3. マーカーと凡例

全マーカーは32px基準のSVGです。どの状態でも白い外周を持ち、背景地図の上で埋もれません。選択中は外側の輪と少し大きい寸法で表し、色の変化だけに頼りません。

| kind | データ値 | 外形・中の記号 | 色 | 読み上げ用の意味 |
|---|---|---|---|---|
| `yes` | `multi = "yes"` | 丸いピン、車いすを表す十字付き記号 | 青緑 | 車いす対応あり |
| `no` | `multi = "no"` または `"limited"` | 角のあるピン、斜線記号 | 茶赤 | 車いす対応なしまたは一部対応 |
| `unknown` | `multi = null` | ひし形のピン、疑問符 | 灰青 | 車いす対応は不明 |

クラスターは白い縁と内側の濃い青緑の円を使い、中央に件数を太字で表示します。数字には必ず `aria-label` を付け、例として「128件のトイレ」と読み上げます。

## 4. アクセシビリティ

- SVGは絵文字や画像に頼らず、`currentColor` でテーマと状態に追従します。意味を持つSVGには画面側でラベルを添え、装飾SVGは `aria-hidden="true"` にします。
- `:focus-visible` の3px青い輪郭を全操作部品に表示します。キーボードでの視認性を優先し、輪郭を消しません。
- チェックボックス、トグル、検索候補、シート、ダイアログに適切なroleとARIA属性を用意しています。ライブ領域は検索結果、読み込み、空状態に使います。
- 動きを減らす設定では、アニメーションと遷移を実質停止します。
- 不明値は灰色だけでなく「不明」という文字を必ず併記します。対応の有無にも、アイコンと文字ラベルの両方を置きます。
- 地図コントロール、閉じる、拡大縮小、文字サイズ切替を含む操作部は48px以上です。

## 5. HTML/CSSの接続

`ui.html` は`<body>`内に挿入する断片です。アプリ側は `styles.css`、`icons.js` を読み込み、SVG文字列を該当の `.icon-slot` に入れます。以下はこの断片で使用するクラス名です。CSSにはすべて対応するセレクタがあります。

| 区分 | クラス名 |
|---|---|
| 全体 | `tm-app`, `visually-hidden`, `icon-slot`, `is-large-text` |
| ヘッダーと検索 | `app-header`, `app-brand`, `app-brand__mark`, `app-brand__name`, `search-area`, `search-box`, `search-box__icon`, `search-box__input`, `search-box__clear`, `search-results`, `search-result`, `search-result__icon`, `search-result__text`, `search-result__title`, `search-result__address` |
| 地図 | `map-region`, `map-placeholder`, `map-attribution`, `map-controls`, `map-control`, `map-control--grouped`, `map-control__button`, `map-control__divider`, `scale-control`, `scale-control__bar`, `cluster-marker` |
| パネル | `side-panel`, `side-panel--filter`, `side-panel--detail`, `panel-header`, `panel-title`, `panel-close`, `filter-list`, `filter-option`, `filter-option__control`, `filter-option__label`, `filter-option__hint`, `toggle`, `toggle__input`, `toggle__track`, `toggle__thumb`, `panel-actions`, `button`, `button--primary`, `button--secondary`, `button--text` |
| 詳細 | `place-card`, `place-card__title`, `place-card__subtitle`, `attribute-list`, `attribute-row`, `attribute-row__icon`, `attribute-row__label`, `attribute-row__value`, `attribute-row__value--unknown`, `detail-links`, `detail-link`, `sheet-handle` |
| 凡例と状態 | `map-legend`, `legend-title`, `legend-list`, `legend-item`, `legend-marker`, `legend-marker--yes`, `legend-marker--no`, `legend-marker--unknown`, `loading-state`, `loading-spinner`, `empty-state`, `empty-state__icon`, `empty-state__title`, `empty-state__text`, `toast-region`, `text-size-control`, `text-size-control__label`, `text-size-control__button` |

画面幅768px未満では`.side-panel--filter`と`.side-panel--detail`をボトムシートにし、768px以上では左側のサイドパネルにします。実際に開閉する際は、アプリが`hidden`属性、`aria-hidden`、`aria-expanded`を同期します。

## 6. 実装時の注意

- `.map-placeholder` は地図実装が差し替える受け皿であり、ここには地図ロジックを含めません。
- `.maplibregl-ctrl-scale` と `.maplibregl-ctrl-group` はMapLibre標準要素を同じ見た目にする上書きです。
- 表示例の属性値は例示です。実データが`null`なら、対応する値を「不明」に置き換えます。
- CSSは外部フレームワークや外部フォントを必要としません。

## 7. データの記録状況を伝えるUI

出典データに記録がないことを、設備が存在しないこととして扱いません。地図右側の`#map-controls`には、既存の丸形コントロールと同じ48px以上の操作領域で`#open-info`を追加します。`TMIcons.info`は、他のアイコンと同じ`frame(...)`による`currentColor`のSVGです。

`#info-panel.side-panel--info`は、ほかのサイドパネルと同じく、768px未満ではボトムシート、768px以上では左側のパネルです。`#info-total`と`#info-updated`は`.info-summary`内に表示し、`#info-coverage.coverage-list`にはJavaScriptが`.coverage-row`を追加します。1行は`.coverage-row__label`、`.coverage-row__bar`、`.coverage-row__fill`、`.coverage-row__value`で構成します。

記録割合は、長さが正確なバーと太字の数値を必ず組み合わせます。特に短いバーは`--warning`と`--warning-soft`で目に留め、幅がごく小さい場合も最低3pxの線として見えるようにします。ただし色だけでは意味を判断させず、各行に割合と件数を併記します。`#info-note.info-note`には、未記録を「不明」とする理由を説明し、`.info-sources`でOpenStreetMapと国土地理院への出典リンクを並べます。

絞り込みパネルでは、`.filter-list`の直前に`#filter-caveat.filter-caveat`を置きます。控えめな注意色と左罫線で、絞り込み結果が「記録がある場所」に限られることを伝えます。詳細パネルでは`#detail-unknown-note.detail-note`を属性一覧の直後に置き、不明値がある場合のみアプリが表示します。どちらも文字のみでも意味が伝わる設計です。

追加クラス: `side-panel--info`, `filter-caveat`, `detail-note`, `info-panel__content`, `info-summary`, `info-summary__item`, `info-summary__label`, `info-summary__value`, `info-section`, `info-section__title`, `coverage-list`, `coverage-row`, `coverage-row__label`, `coverage-row__bar`, `coverage-row__fill`, `coverage-row__value`, `info-note`, `info-sources`。

## 8. この範囲のトイレ一覧

地図上のマーカーを操作しにくい人もトイレを選べるよう、`#map-controls`に`#open-list`を置きます。`TMIcons.list`は、既存の地図コントロールと同じ`frame(...)`による`currentColor`のSVGです。

`#list-panel.side-panel--list`は、ほかのサイドパネルと同じく、768px未満ではボトムシート、768px以上では左側のパネルです。`#list-count.list-count`は表示件数を、`#list-note.list-note`は上限までの表示であることを伝えます。`#list-sort.list-sort__select`では「地図の中心から近い順」と「名前がある順」を選択できます。表示項目は`#list-items.list-items`へ追加し、対象がないときは`#list-empty.list-empty`を表示します。

`#list-item-template`の各行は、横幅全体を押せる`button.list-item`です。最小高64pxを確保し、40pxの`.list-item__marker`、名称`.list-item__name`、距離・場所`.list-item__meta`、特徴の`.list-item__tags`を並べます。特徴は文字を含む`.tag`で示し、`tag--multi`、`tag--style`、`tag--hours`、`tag--unknown`で補助的に区別します。`.list-item:focus-visible`には明確な3pxのフォーカス輪郭を出し、`aria-current="true"`の行には「選択中」の文字と左罫線を表示します。

PCで一覧と詳細を同時に開く場合は、両パネルを左から順に16pxの間隔で配置します。幅900px以上では各パネルを最大390px、768〜899pxでは利用可能幅の半分まで縮めるため、重なったり画面外に出たりしません。スマホでは一覧と詳細はアプリ側で切り替えて表示します。

追加クラス: `side-panel--list`, `list-panel__content`, `list-summary`, `list-count`, `list-note`, `list-sort`, `list-sort__label`, `list-sort__select`, `list-items`, `list-items__item`, `list-item`, `list-item__marker`, `list-item__content`, `list-item__name`, `list-item__meta`, `list-item__tags`, `tag`, `tag--multi`, `tag--style`, `tag--hours`, `tag--unknown`, `list-empty`。

## 9. 場所と施設内のトイレ

### 施設にあるが、正確な位置が不明な記録

`derived: true` は「施設にトイレがある」という記録であり、トイレそのものの位置ではありません。この場合は通常の`TMIcons.marker(kind, selected)`ではなく、`TMIcons.facilityMarker(kind, selected)`を使います。どの状態も先端のない面の形にし、白い破線の外周で「施設の範囲・おおよその位置」を示します。`yes`は円、`no`は角丸の四角、`unknown`はひし形で、中央の車いす／×／？も通常のマーカーと同じ意味です。選択中は外側の淡い輪郭を加えます。色を認識しにくい場合にも、通常の尖ったピンと破線・先端なしの形を区別できます。

`#map-legend`には`#legend-marker-facility.legend-marker--facility`を持つ`.legend-item--facility`を追加し、「この施設のどこかにトイレあり（正確な場所は不明）」と説明します。凡例のこの行は短い文字と区切り線で既存の車いす状態と分けます。スマホでは凡例を最大180px（地図の表示域に応じてさらに小さく）にして縦スクロール可能にし、追加行で地図を隠し続けないようにします。

### 詳細・絞り込み

詳細の属性一覧の先頭に`.attribute-row--place`を置きます。`#attribute-place-icon`には`TMIcons.place`（建物と目印を組み合わせたSVG）を入れ、`#attribute-place-value`には`place`、`inside`、`placeDistance`から「新宿駅 の中」「日比谷公園 のそば（約35m）」のような値を設定します。場所が分からないときは「不明」です。この値だけは2列の行にして、長い施設名が右寄せの1行に切り詰められず、全文を折り返して読めるようにします。

`derived: true`のときだけ、属性一覧の直後に`#detail-derived-note.detail-note`を表示します。文章は「この施設に『トイレあり』と記録されていますが、建物のどこにあるかまでは記録されていません。地図の印は施設の代表点です。」です。`#detail-unknown-note`とは別に表示でき、両方が表示されても同じ注意の体裁で意味が伝わります。

絞り込みは`.filter-group--place`と`.filter-group--feature`に分けます。`#filter-place-heading`は「場所の種類」、`#filter-feature-heading`は「設備・条件」です。場所の種類には`#filter-place-station`、`#filter-place-shop`、`#filter-place-park`、`#filter-place-roadside`、`#filter-place-public`を置き、「選んだ場所のどれかに当てはまるトイレを表示します」と明記します。これにより、複数選択が設備条件とのAND条件ではなく、場所の選択肢どうしのOR条件であることを伝えます。

### 一覧

`#list-item-template`では`.list-item__place`を`.list-item__name`と`.list-item__meta`の間に置きます。トイレ名があれば`.list-item__name`にはその名前を、`.list-item__place`には「新宿駅 の中」のような場所名と位置関係を入れます。トイレ名がなく`place`があれば、`.list-item__name`には施設名を入れて主役にし、`.list-item__place`には「駅・駅ビルの中」などの種類・位置関係を入れます。「名前の情報はありません」は場所も不明な場合だけにします。`derived: true`には施設マーカーと`.tag--derived`（「施設内（場所不明）」）を必ず併用します。

場所の種類の札は`.tag--place-station`、`.tag--place-shop`、`.tag--place-park`、`.tag--place-roadside`、`.tag--place-public`です。文字はそれぞれ「駅の中」「商業施設の中」「公園の中」「道の駅・SA/PA」「公共施設の中」とします。設備の札の実線と異なり、場所の札は破線の枠と落ち着いた背景にして、意味の違いを色だけに頼らず示します。

追加id: `legend-marker-facility`, `attribute-place-icon`, `attribute-place-value`, `detail-derived-note`, `filter-place-heading`, `filter-place-note`, `filter-place-station`, `filter-place-shop`, `filter-place-park`, `filter-place-roadside`, `filter-place-public`, `filter-feature-heading`。

追加クラス: `legend-item--facility`, `legend-marker--facility`, `attribute-row--place`, `attribute-row__value--place`, `filter-group`, `filter-group--place`, `filter-group--feature`, `filter-group__title`, `filter-group__note`, `list-item__place`, `tag--derived`, `tag--place-station`, `tag--place-shop`, `tag--place-park`, `tag--place-roadside`, `tag--place-public`。
