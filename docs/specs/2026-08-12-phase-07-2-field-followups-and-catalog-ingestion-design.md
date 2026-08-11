# Phase 7.2: 実機UX修正・カタログ取込・経路表示再設計

更新日: 2026-08-12

## 背景

Phase 7.1を`main`へ統合した後の実機確認で、テスト上は成立していても利用者から見た受入条件を満たしていない箇所が複数見つかった。また、以前別セッションで設計したカタログページ用Chrome拡張とGAS連携を、正式に`meirochou`リポジトリへ取り込む必要がある。

Phase 7.2は新しい最適化ロジックやデータモデルを増やすフェーズではない。主目的は、既存の経路案内・Gallery・管理画面・GAS連携を実機で誤解なく使える状態へ仕上げることと、カタログ画像URLをGASへ安全に登録する補助ツールをリポジトリ管理下へ置くことである。

## Phase 7.1監査結果

### Task 1: route flow animation

技術的には実装済みだが、実機受入条件として未完了とする。

- `.route-flow-line`は存在し、CSS `stroke-dashoffset`も時間変化する。
- Phase 7.1の追加E2Eはcomputed styleの時間変化を確認したが、利用者が方向を視認できる強さまでは確認していない。
- 実機では赤い経路が静止して見えるため、「アニメーションが存在する」ではなく「Start→Goal方向が一目で分かる」を新しい受入条件にする。

### Task 2: navigation information hierarchy

部分完了。距離の重複は減ったが、「次の目的地」という概念が地図上部summaryと地図下部detailの両方に残り、ユーザーの実機指摘を解消していない。

### Task 3: map pan physics

基本実装は完了しているが、tuningは未完了。

- pointer履歴からrelease velocityを求めるtime-based inertiaは実装済み。
- ただしrubber-bandの既定overscrollは依然約32pxで、実機では弾性が強すぎる。
- 地図端へ到達できることと、外側へ引いたときの抵抗感を別々に検証する必要がある。

### Task 4: management surface isolation

今回の実機報告では新規回帰なし。Phase 7.2では原則変更しない。

### Task 5: motion experiments

実装はあるが受入条件が弱い。

- Gallery初回hintはlocalStorageで一度だけ表示される。
- 過去の非アニメーション版hintを見た端末でも同じseen keyが残るため、新しい説明animationを確認できないことがある。
- 別目的地previewの視覚的強調も不足している。

### Task 6: management list/detail + final verification

構造自体は成立している。ただしTask 1/2/3/5のfield acceptanceが弱いままPhase完了判定されたため、Phase 7.2最終TaskでPhase 7.1受入条件も再監査する。

## 設計方針

## 1. GASセットアップを利用者が完結できるようにする

`integrations/gas-spreadsheet/Code.gs`は既に単一ファイルのコピー用artifactとして存在する。Phase 7.2ではこれを二重管理せず、同じgenerated artifactを管理画面から表示・コピーできるようにする。

管理画面には「GASセットアップ」sectionを追加し、少なくとも以下を提供する。

- `GASコードをコピー`
- `セットアップ手順を見る`
- コピー成功/失敗feedback

コピーするコードへ個人のSpreadsheet IDやWeb App URLを埋め込まない。現在の`SpreadsheetApp.getActiveSpreadsheet()`を前提としたgeneric artifactを維持する。

## 2. カタログページ用Chrome拡張を正式に管理する

拡張機能は`apps/catalog-extension/`へ置き、Manifest V3とする。

目的は一つだけとする。

1. catalog pageからサークルspaceを抽出する。
2. 同じサークルのカタログ画像URLを抽出する。
3. 保存済みGAS Web App URLとsheet nameへPOSTする。

spaceのprimary selectorはユーザー確認済みの次を固定する。

```text
#mainSection > div.m-media.m-circletable > div.m-media__image > div.space-box > div
```

DOM変更に備え、同じ`.space-box`内の要素を探す限定的fallbackは許可するが、ページ全体から似た文字列を推測しない。

POSTは既存sale mutationと衝突しないよう、明示actionを使う。

```json
{
  "action": "upsertCatalog",
  "sheetName": "day1",
  "space": "東ア01a",
  "tweet": "https://example.invalid/catalog.jpg"
}
```

`tweet`という既存column名は互換性のため維持する。実体はcatalog image URLであり、Twitter投稿URLに限定しない。

GAS側は`action === "upsertCatalog"`をsale/legacy handlerより先に判定する。対象sheetはheader名で`space`と`tweet`列を探し、spaceが既存ならtweetだけ更新、存在しなければ新規rowを追加する。priority、isSale、memo等の既存columnは変更しない。

## 3. alternate route previewを独立状態として明示する

別サークルpinをtapした時点で、有効なcandidate routeが計算済みなら青線を即表示する。

candidate route表示条件を`selectionState === "comparing"`だけに限定しない。「別目的地を選択中」でcurrent targetとselected targetが異なり、`selectedRoute`が存在することを表示条件とする。

candidate preview中は次を同時に満たす。

- current route: 赤系
- candidate route: 青系
- candidate target pin/detail: 明確なpreview強調
- 購入/保留操作はcurrent targetと取り違えないよう既存guardを維持
- confirmationを閉じればcandidate overlayとpreview強調を消す

## 4. current route animationは知覚できる方向表現にする

単なるdash offsetの存在ではなく、StartからGoalへ光または短いsegmentが進む「ビューン」という方向cueにする。

実装はSVG/CSSで完結させる。Dijkstra/ALNSの再計算やJS per-frame DOM更新を追加しない。

推奨構成:

- solid red base line
- その上に明るい短segment/chevronがStart→Goalへ流れるflow layer
- Start markerは`S`、Goal markerは`G`を維持し、Goalを少し強くする
- routeが切り替わった直後だけS/Gへ短いpulse

`prefers-reduced-motion: reduce`では移動を止め、静止chevronまたは明暗差だけで方向を残す。

## 5. map画質問題はasset交換より先にrender pathを診断する

C108のmap sourceは`.svg`である。SVGであること自体は拡大不能の理由にならない。

現在はSVG `<img>`を含む`.map-transform-layer`全体へCSS transformを掛け、さらに`will-change: transform`を常時指定している。ブラウザがlayerをrasterize/compositeするタイミングにより、拡大時にぼやける可能性があるため、Phase 7.2では以下を比較して原因を固定する。

1. source SVGに`viewBox`があり、埋め込みraster画像に依存していないか。
2. `will-change: transform`を常時付与した場合とgesture中だけ付与した場合。
3. auto-fit後のscale値、devicePixelRatio、画像のcomputed/rendered size。
4. SVG単体を同倍率で開いた場合との比較。

source assetがvectorで問題ないならassetをPNGへ変換しない。

map rubber-bandはoverscroll limitを現在の32pxから原則18pxへ下げる。値は定数化し、unit testで固定する。通常bounds内panは1:1追従を維持する。

## 6. 「一覧」はglobal unvisited catalogを意味する

headerの「一覧」は現在地areaだけを暗黙filterするUIにしない。未訪問サークルが他areaに残っている場合も表示する。

Gallery modelは次を持つ。

```ts
type GalleryScope =
  | { kind: "all-unvisited" }
  | { kind: "area"; areaId: string }
  | { kind: "hold"; areaId?: string };
```

header「一覧」は`all-unvisited`を使う。必要ならGallery内でarea filterを選べるが、初期状態で全件を隠さない。

priority filterはHTML固定の`10/9/8/7`を廃止し、現在表示対象のcirclesから有限数値priorityを収集して降順に生成する。priorityなしはfilter buttonを作らず、filter未選択時には一覧へ残す。

初回swipe hintはversioned keyへ変更する。操作説明を変更した場合は新versionを一度表示できるようにし、Gallery内の「操作方法」からいつでもreplayできるようにする。

## 7. target detailはcatalog画像のorientationへ適応する

地図上部と下部の重複をなくし、情報の正本を一つにする。

通常案内時の上部summaryは次だけを持つ。

```text
現在地 → 東ア23a   約120m
```

地図下部detailはcatalog、priority、sheet/account、購入/保留に専念し、「次の目的地」という同じ見出しを再掲しない。

catalog画像がportraitの場合、十分な横幅（目安360px以上）があればdetail内部を7:3程度のgridにし、画像を約70%、metadata/actionを約30%にする。landscape画像は画像をfull widthにしてmetadata/actionを下に置く。

重要なのはDOMをportrait/landscapeで二重化しないこと。単一DOMへorientation class/data attributeを付け、CSS layoutだけを切り替える。360px未満や200% zoomではstackへfallbackする。

## 8. Phase 7.1の受入条件をfield-oriented testへ更新する

最終verificationは「DOMがある」「animation-nameがある」だけでは完了にしない。

最低限以下を確認する。

- current routeのflowが時間経過で実際に位置変化し、スクリーンショット/動画相当の連続frameで視認できる。
- alternate pin tap直後にblue candidate routeが表示される。
- map四辺へ到達可能で、release後にbounds外へ停止しない。
- Gallery header一覧が全areaのunvisitedを表示する。
- dynamic priorityが`1,3,5,12`等の任意値で動く。
- first-run tutorialとmanual replayが動く。
- portrait/landscape catalogの両layoutで情報重複がない。
- management、offline cache、GAS sale syncの既存contractを壊さない。

## 非目標

- routing/ALNS objectiveの変更
- full PWA化
- catalogサイト全体をcrawlするserver
- Chrome Web Store公開作業
- extensionへGAS URLをhardcodeすること
- priorityの意味そのものを変更すること
- map sourceを理由なくPNGへ変換すること
- decorative animationを大量に追加すること

## 実装順

1. GAS setup/copy + catalog upsert API
2. catalog extension
3. alternate route preview + preview state
4. current route direction animation
5. map quality diagnosis + elastic tuning
6. global Gallery + dynamic priority + tutorial replay
7. target/catalog adaptive layout
8. final field acceptance audit

各Taskは独立してreview可能なcommit単位とする。production codeへ着手する前に、この設計と`docs/plans/phase-07-2/`を正本とする。