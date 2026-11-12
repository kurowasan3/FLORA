# FLORA データ仕様（v0.1）

正規データ `content/`（マスター）→ `tools/build_data.py` → アプリ用データ `data/`。アプリが読むのは `data/` だけ。
JSON Schema は `tools/schema/`、Schema で見られない関係の検査は `tools/validate_content.py`。

## ID の規則

| ID | 形 | 規則 |
| --- | --- | --- |
| 問題ID | `GEN-MEI-003` | `<分野3字>-<単元略号3字>-<番号>`。一度使ったら変えない・再利用しない |
| 分野ID | `CEL` `MET` `GEN` `DEV` `HOM` `RES` `PLA` `ECO` `EVO` | 細胞と分子・代謝・遺伝情報・発生・体内環境・動物の反応と行動・植物の環境応答・生態と環境・進化と系統 |
| 単元ID | `GEN-06` | `taxonomy.json` で固定。使わなくなったら `retired` に残し、再利用しない |
| 概念ID・法則ID | `mendel` `hardy-weinberg` | 英小文字とハイフン |
| 誤概念ID | `MC-ENZ-HEAT` | `MC-` で始まる英大文字 |
| 図ID | `q-setup` `a-forces` | 問題の中で一意。英小文字とハイフン |

## 問題（`content/problems/<分野>/<問題ID>/problem.json`、`flora.problem/1`）

| 項目 | 必須 | 内容 |
| --- | --- | --- |
| `id` `schema` `field` `unit` | ○ | 問題ID、`"flora.problem/1"`、分野ID、単元ID |
| `topic` `course` `minutes` | | テーマ、`生物基礎`／`生物`、想定時間（分） |
| `level` | ○ | 0=基礎 1=標準 2=入試基礎 3=国公立2次 4=難関 5=最難関 |
| `format` | ○ | 出題形式：`qa` 一問一答・`choice` 正誤・選択・`order` 順序・過程・`causal` 因果関係・`label` 図の名称・`calc` 計算・`experiment` 実験考察・`written` 論述（複数可）。ホームの「形式ごとに演習」はこれで選ぶ |
| `examStyle` | | `common-test` `national-2nd` `private` `original` |
| `statement.blocks` | ○ | 本文（下の「ブロック」） |
| `figures` | ○ | 図の一覧（下の「図」）。無ければ `[]` |
| `answer.parts` | ○ | 小問ごとの答え `{id, tex, grading?, wrong?}`。小問が無い問題は `id: "main"` 1つ |
| `solutions` | ○ | `{id: "main"|"alt1"|"note", kind, blocks}`。別解・補足を足せる |
| `idea` | | 核となる考え方 `{tex}` |
| `learn` | | 解いたあとに開く学ぶのページ `{page, key?, label?}`。page は `labels`（key＝図ID）・`cards`（単元ID）・`anim`（アニメーションID）・`causal`（ネットワークID）・`tree`（系統樹ID または `eras` `popgen` `ranks`）・`laws`（法則ID） |
| `choices` | | 選択問題の選択肢。誤答の選択肢に `misconception` を付けると、選んだときに誤概念として記録できる（Phase 5） |
| `concepts` `laws` `misconceptions` | ○ | 概念・法則・誤概念の ID（無ければ `[]`） |
| `tags` `provenance` `quality` | ○ | `quality.status` は `draft`／`review`／`published`／`hidden`。アプリに出るのは `published` だけ。`quality.checks.biology` は内容（計算・資料・因果の向き）を確かめた印 |

### ブロック

```json
{"type": "text", "tex": "文章（LaTeX。$...$ が数式）"}
{"type": "figure", "ref": "図ID", "placement": "block | float-right | side-by-side"}
{"type": "parts", "items": [{"id": "1", "tex": "…", "figures": ["図ID"]}]}
```

並びがそのまま表示順。図の位置も、ブロックの位置で決まる（`order` を手で管理しない）。

### 入力用の答え（`answer.parts[].grading`）

1行に1小問（`(1) …`）、小問の中の複数の欄は ` ; ` で区切り、`ラベル：` で欄の名前を付ける（Lemma・CELESTIA・ALCHEMIA と同じ）。

| 書き方 | 入力 | 採点 |
| --- | --- | --- |
| `語{ミトコンドリア}` `語{核小体\|仁}` | 文字 | `\|` で区切ったどれかと一致。全角半角・ひらがなカタカナ・空白・中黒の違いは無視。大文字小文字は区別（遺伝子型 Aa と aA・AA の区別のため） |
| `選ぶ{増える\|減る\|変わらない}=2` | ボタンで1つ選ぶ | `=` の後は何番目か。因果関係の問題は `インスリン：選ぶ{増える\|減る\|変わらない}=2` のように量ごとに欄を作る |
| `すべて選ぶ{A\|B\|C\|D}=1,3` | ボタンで複数選ぶ | 過不足なく選んだときだけ正解 |
| `並べる{後期\|前期\|終期\|中期}=2>4>1>3` | タップした順に並ぶ | `=` の後に正しい順の番号を `>` でつなぐ。**選択肢は正しい順に並べて書かない**（画面の並びがそのまま答えになってしまう） |
| `約{90\|2} [µm]` | 数値（`1.2e-3`・`1.2×10^-3` も可） | `\|` の後の有効数字の桁で、最後の桁の ±0.55 まで正解。単位は `tools/validate_content.py` の UNITS にあるもの |
| `9:3:3:1` | 比 | 比として等しければ正解 |
| `1024`・`1/4` | 数・分数 | 整数だけの答えは小さな欄・数字キーボードになる |
| `記述` | なし | 自己採点 |

## 図

```json
{"id": "q-fig", "role": "question", "kind": "diagram", "format": "svg", "src": "q-fig.svg",
 "alt": "動物細胞の図。ア〜エは図の一部を指す", "caption": "…"}
```

| 項目 | 内容 |
| --- | --- |
| `role` | `question`（問題用）／`answer`（解答用）／`both`。**解答用の図は問題文から参照できない**（検査でエラー）。アプリは答え合わせまで表示もファイルの読み込みもしない |
| `kind` | `diagram`（模式図） `scheme`（経路・しくみ） `apparatus`（実験装置） `graph` `table` `photo` |
| `format` | `svg`（標準）、`png`／`webp`（写真） |
| `src` | 問題フォルダ内のファイル名。Base64 の埋め込みは不可 |
| `alt` | 代替テキスト（必須。図が見えない人が問題を解けるように） |

### 学ぶの図を使う問題の図

学ぶの図（`content/bio/diagrams/*.svg`）の `<svg>` に `class="dg"` を付け、`<g class="pin"><circle …/><text …>ア</text></g>` の印を足したものは、塗りが `css/style.css` のクラスで決まり、ライト・ダークの両方で読める（白い紙にしない）。

### 手描き・AI 生成の SVG の決まり

- `viewBox` を付ける。`script`・`foreignObject`・`on*` 属性・外部参照・埋め込み画像は使わない（検査でエラー）
- 色は `currentColor`（明暗の設定に合わせて変わる）。色を直接指定した図はダークモードでも白い紙の上に出る

## 概念・法則・誤概念

| ファイル | 1件の形 |
| --- | --- |
| `concepts.json` | `{id, name, field, requires: [前提の概念], laws: [法則]}`（前提関係の循環は検査でエラー） |
| `laws.json` | `{id, name, tex, conditions, concepts, origin, basis?, derivation?}`。`origin` は `fundamental`／`empirical`／`derived`／`definition`。`derived` は `derivation`（1段ずつ）が必須、`fundamental`・`empirical` は `basis` が必須 |
| `misconceptions.json` | `{id, wrong, right, concepts, remedy: [補強問題の ID]}` |

## 学ぶのデータ（`content/bio/`）

| ファイル | 中身 |
| --- | --- |
| `terms.json` | `terms[{id, term, unit, def}]`。id（`t001`…）は用語カードの記録のキーなので変えない |
| `diagrams.json` | `diagrams[{id, title, unit, src, desc, pins[{id, x, y, label, note?, alt?: [別の正解], to?: [x, y]}]}]`。座標は SVG の viewBox の値 |
| `diagrams/*.svg` | 図。塗りは CSS のクラス（`fcell`・`fn`・`fb`…）で、色を直接書かない |
| `anims.json` | `anims[{id, title, unit, stages[{name, text}]}]`。描画は `js/anim.js` の `ANIMS[id]`（`n` が段階の数と一致すること） |
| `causal.json` | `nets[{id, title, unit, desc, nodes[{id, label, col, row}], edges[{from, to, sign: 1｜-1, fb?, note?}], scenarios[{id, title, start, dir: 1｜-1, ask: [ノード], explain}]}]`。label の `\n` は改行。予測の答え（`ans`）は build_data.py が計算して data/ に書く |
| `tree.json` | `trees[{id, title, unit, desc, root}]`（節 `{name?, note?, ex?, chars?: [この枝で獲得した形質], children?}`）、`eras[{name, from, to, periods[{name, from}], events[{t, text}]}]`（年代は百万年前）、`ranks{ranks, examples[{name, sci, path}]}` |

### 因果の予測の答えの決め方（`tools/biolib.py` の propagate・`js/learn.js` の propagate）

始点を `dir` だけ変えたとき、各ノードの変化は、始点からいちばん短い経路の矢印の符号の積。始点には戻らない（フィードバックで始点自身がどうなるかは聞かない）。同じ長さで符号が食い違う経路があるノード、始点からたどれないノードは問題にできない（検査でエラー）。

## アプリ用データ（`data/`、`flora.data/1`）

| ファイル | 中身 |
| --- | --- |
| `index.json` | `format` `dataVersion` `levels` `subjects`（分野の並び）`fields`（単元）`problems`（一覧：`id f lv t th tg fm c m ln in ok`） |
| `f-<単元ID>.json` | 本文：`q a s k`（HTML）、`figs`（図の情報）、`in`（入力用の答え）、`ln` `choices` `laws` `alt`（別解） |
| `knowledge.json` | 概念・法則・誤概念 |
| `learn.json` | 学ぶのデータ（content/bio/ をまとめたもの）。図は `data/diagrams/<名前>-<ハッシュ>.svg`、用語には出てくる図（`dg`）・アニメーション（`an`）、因果の予測には答え（`ans`）を足す |
| `search.json` `collections.json` | 検索の索引（概念名・法則名も入る）、問題セット |
| `assets/<問題ID>/` | 図のファイル。名前に中身のハッシュ（`q-setup-35755270.svg`）が付くので、図を直すとキャッシュも入れ替わる |

本文の HTML では、図は `<figure class="pfig" data-fig="図ID"></figure>` の空の枠で、`js/problem/figures.js` が中身を入れる。

## 版は3つを分ける（Lemma と同じ）

| 版 | 場所 | いつ上げるか |
| --- | --- | --- |
| コードの版 | 各 JS の `FILE_VERSION`、CSS の `--flora-version`、`sw.js` の `VERSION` | アプリを更新したとき（食い違うと赤い警告） |
| データ形式の版 | `index.json` の `format` | `data/` の項目の意味を変えたとき |
| 学習記録の版 | localStorage `flora.v1` の `schema`（今は 1）。用語カードの記憶の状態 `cstat`、学ぶの記録 `lrec` を含む | 学習記録の形を変えたとき |
