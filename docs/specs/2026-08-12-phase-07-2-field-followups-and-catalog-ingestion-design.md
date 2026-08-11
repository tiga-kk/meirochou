# Phase 7.2: 実機UX修正・カタログ取込・経路表示再設計

更新日: 2026-08-12

## 背景

Phase 7.1を`main`へ統合した後の実機確認で、テスト上は成立していても利用者から見た受入条件を満たしていない箇所が複数見つかった。また、カタログページ用Chrome拡張とGAS連携を正式に`meirochou`リポジトリへ取り込む必要がある。

Phase 7.2は新しい最適化ロジックやデータモデルを増やすフェーズではない。主目的は、既存の経路案内・Gallery・管理画面・GAS連携を実機で誤解なく使える状態へ仕上げることと、カタログ画像URLをGASへ安全に登録する補助ツールをリポジトリ管理下へ置くことである。

## Phase 7.1監査結果

### Task 1: route flow animation

技術的には実装済みだが、実機受入条件として未完了とする。

- `.route-flow-line`は存在し、CSS `stroke-dashoffset`も時間変化する。
- Phase 7.1のE2Eはcomputed styleの時間変化を確認したが、利用者が方向を視認できる強さまでは確認していない。
- 実機では赤い経路が静止して見えるため、「animationが存在する」ではなく「Start→Goal方向が一目で分かる」を新しい受入条件にする。

### Task 2: navigation information hierarchy

部分完了。距離の重複は減ったが、「次の目的地」という概念が地図上部summaryと地図下部detailの両方に残り、実機指摘を解消していない。

### Task 3: map pan physics

基本実装は完了しているが、tuningは未完了。

- pointer履歴からrelease velocityを求めるtime-based inertiaは実装済み。
- rubber-bandの既定overscrollは依然約32pxで、実機では弾性が強すぎる。
- 地図端へ到達できることと、外側へ引いた時の抵抗感を別々に検証する必要がある。

### Task 4: management surface isolation

今回の実機報告では新規回帰なし。Phase 7.2では原則変更しない。

### Task 5: motion experiments

実装はあるが受入条件が弱い。

- Gallery初回hintはlocalStorageで一度だけ表示される。
- 過去版hintを見た端末でも同じseen keyが残るため、新しい説明animationを確認できないことがある。
- 別目的地previewの視覚的強調も不足している。

### Task 6: management list/detail + final verification

構造自体は成立している。ただしTask 1/2/3/5の実機受入が弱いままPhase完了判定されたため、Phase 7.2最終Taskで再監査する。

## 設計方針

### 1. GASセットアップを利用者が完結できるようにする

`integrations/gas-spreadsheet/Code.gs`は既に単一ファイルのコピー用artifactとして存在する。Phase 7.2ではこれを二重管理せず、同じgenerated artifactを管理画面から取得・コピーできるようにする。

管理画面にはevent/day設定から独立した「GASセットアップ」を一度だけ配置し、少なくとも以下を提供する。

- `GASコードをコピー`
- `セットアップ手順を見る`
- コピー成功/失敗feedback
- Clipboard APIを使えない場合の手動コピーfallback

コピーするコードへ個人のSpreadsheet IDやWeb App URLを埋め込まない。現在の`SpreadsheetApp.getActiveSpreadsheet()`を前提としたgeneric artifactを維持する。

### 2. カタログページ用Chrome拡張を正式に管理する

拡張機能は`apps/catalog-extension/`へ置き、Manifest V3とする。

目的は一つだけとする。

1. catalog pageからサークルspaceを抽出する。
2. 同じサークルのカタログ画像URLを抽出する。
3. 保存済みGAS Web App URLとsheet nameへ、利用者の明示操作でPOSTする。

spaceのprimary selectorは次を使う。

```text
#mainSection > div.m-media.m-circletable > div.m-media__image > div.space-box > div
```

DOM変更に備え、同じ`.space-box`内の要素を探す限定的fallbackは許可するが、ページ全体から似た文字列を推測しない。

Manifest V3の通常`content_scripts`はES moduleとして直接読み込まない。DOM extractorはclassic scriptとして同梱し、限定したglobal namespaceからcontent scriptが利用する。network requestを担うbackground service workerは`type: "module"`としてpure client moduleを利用してよい。bundle toolや新しいframeworkは追加しない。

popup、content、backgroundの責務を分ける。

- popup: 現在pageの抽出要求、結果表示、利用者の送信操作。
- content script: DOM抽出だけ。network POSTしない。
- background: storage読取、GAS request作成、network POST。

POSTは既存sale mutationと衝突しないよう明示actionを使う。

```json
{
  "action": "upsertCatalog",
  "sheetName": "day1",
  "space": "東ア01a",
  "tweet": "https://example.invalid/catalog.jpg"
}
```

`tweet`という既存column名は互換性のため維持する。実体はcatalog image URLであり、Twitter投稿URLに限定しない。

#### GAS POST routing

現行`doPost(e)`はraw bodyを一度だけJSON解析し、解析済み`data`を`doPostSale(data)`へ渡している。この構造を維持する。

```text
raw POST
  -> doPost(e) で一度だけJSON parse / request object検証
  -> action === upsertCatalog: doPostCatalog(data)
  -> action === sale: doPostSale(data)
  -> その他: UNKNOWN_ACTION
```

handlerごとにraw eventを再解析しない。存在しないlegacy handlerを追加しない。

`upsertCatalog`は既存`parseSheetHeaders()`を再利用し、header名で`space`と`tweet`列を探す。spaceが既存ならtweet cellだけ更新し、存在しなければ新規rowのspace/tweet cellだけ設定する。priority、isSale、account、memo等の既存columnは変更しない。duplicate spaceは任意の一行を更新せずerrorとする。

### 3. alternate route previewを独立状態として明示する

別サークルpinをtapし、有効なcandidate routeが計算済みになった時点で青線を表示する。

candidate route表示条件を`selectionState === "comparing"`だけに限定しない。current targetとselected targetが異なり、`selectedRoute`が存在し、selection statusが`ready`または`comparing`であることを表示条件とする。

candidate preview中は次を同時に満たす。

- current route: 赤系
- candidate route: 青系
- candidate target/detail: `変更候補`と分かるpreview強調
- candidateを選択しただけではcurrent route/sessionをcommitしない
- 購入/保留をcandidateへ暗黙に切り替えない
- currentとselectedが異なる間は購入/保留UIをdisabledにし、`BrowserApplication.handleAction()`にも同じdefensive guardを置く
- close/cancelでcandidate overlayとpreview強調を消す
- confirm後だけcandidateをnew currentへ昇格し、通常の購入/保留を再び許可する

表示条件一つのために新しい公開preview modelを必須化せず、既存`isPreview`相当の判定を優先して再利用する。

### 4. current route animationは知覚できる方向表現にする

単なるdash offsetの存在ではなく、StartからGoalへ光または短いsegmentが進む方向cueにする。

実装はSVG/CSSで完結させる。Dijkstra/ALNSの再計算やJS per-frame DOM更新を追加しない。

- solid red base line
- その上に明るい短segment/chevronがStart→Goalへ流れるflow layer
- Start markerは`S`、Goal markerは`G`を維持し、Goalを静的にも識別可能にする
- route切替直後の短いpulseは、方向認識へ実質的に寄与する場合だけ追加する

`prefers-reduced-motion: reduce`では移動を止め、静止chevronまたは明暗差だけで方向を残す。

### 5. map画質問題はasset交換より先に描画経路を診断する

C108のmap sourceは`.svg`である。SVGであること自体は拡大不能の理由にならない。

まず次を比較する。

1. source SVGに`viewBox`があり、bitmap埋め込みへ依存していないか。
2. 現在常時指定されている`will-change: transform`を外した場合。
3. auto-fit後のscale値、devicePixelRatio、画像のnatural/rendered size。
4. SVG単体を同倍率で開いた場合との比較。

embedded bitmapが見つかってもTask全体を止めない。asset由来の問題として記録し、overscroll/bounds/compositor等の独立修正は続ける。

persistent `will-change`を外して画質が改善し、gesture性能に問題がなければ追加APIを作らない。gesture中だけpromotionが必要だと実測できた場合に限り、既存`GestureZoomController`へoptionalなinteraction state callback等を追加する。

map rubber-bandはmap instanceだけoverscroll limitを原則18pxへ下げる。PDF/Gallery callerの既定値は維持する。通常bounds内panは1:1追従、release後は合法boundsへ収束する。

### 6. 「一覧」はglobal unvisited catalogを意味する

headerの「一覧」は現在地areaだけを暗黙filterするUIにしない。未訪問サークルが他areaに残っている場合も表示する。

Gallery scopeはall-unvisited、既存area-specific、holdを区別する。header「一覧」だけをall-unvisitedへ接続し、既存area/hold callerを意図せずglobal化しない。

priority filterはHTML固定の`10/9/8/7`を廃止し、表示対象circlesからfiniteな明示priorityを収集して降順に生成する。

- priority未設定、空文字、非数値はbuttonを作らない。
- filter未選択時にはpriority未設定circleも一覧へ残す。
- finiteな`0`や負値は現行GAS contract上の明示値なので、missingと区別する。
- priority `0` filterへmissing circleを混ぜない。

初回swipe hintはversioned keyへ変更する。Gallery内の「操作方法」からはstorage read/writeの可否に関係なくmanual replayできるようにする。

### 7. target detailはcatalog画像のorientationへ適応する

地図上部と下部の重複をなくし、情報の正本を一つにする。

通常案内時の上部summaryはcurrent target/distanceを主情報とする。地図下部detailはcatalog、priority、sheet/account、購入/保留に専念し、「次の目的地」という同じ見出しを再掲しない。

catalog画像がportraitの場合、十分な横幅があればdetail内部を画像優先のgridにし、landscape画像は画像をfull widthにしてmetadata/actionを下に置く。正確な比率は実機で読みやすさを確認して決め、CSS値そのものを業務contractとして過剰固定しない。

DOMをportrait/landscapeで二重化しない。単一DOMへorientation class/data attributeを付け、CSS layoutだけを切り替える。狭幅や200% zoomではstackへfallbackする。

### 8. Phase 7.1の受入条件を実利用flowへ更新する

最終verificationは「DOMがある」「animation-nameがある」だけでは完了にしない。

最低限以下を確認する。

- current routeのflowが時間経過で変化し、Start→Goal方向を実機相当viewportで認識できる。
- alternate pin tap後、candidate route計算完了時点でblue routeが表示される。
- candidate選択中に購入/保留がcandidateへ誤適用されない。
- map四辺へ到達可能で、release後にbounds外へ停止しない。
- Gallery header一覧が全areaのunvisitedを表示する。
- dynamic priorityが`0,1,3,5,12`等の任意値とmissingを正しく区別する。
- first-run tutorialとmanual replayが動く。
- portrait/landscape catalogの両layoutで情報重複がない。
- management、offline cache、GAS sale syncの既存contractを壊さない。
- `npm run verify`がwebapp、GAS、Chrome拡張を含み、GitHub Actionsも同じverifyへ到達する。

## 非目標

- routing/ALNS objectiveの変更
- full PWA化
- catalogサイト全体をcrawlするserver
- Chrome Web Store公開作業
- extensionへGAS URLをhardcodeすること
- priorityの意味そのものを変更すること
- map sourceを理由なくPNGへ変換すること
- decorative animationを大量に追加すること
- 一利用者のためだけの新しい汎用framework/abstraction追加

## 実装順

1. GAS setup/copy + catalog upsert API
2. catalog extension + CI接続
3. alternate route preview + mutation guard
4. current route direction animation
5. map quality diagnosis + elastic tuning
6. global Gallery + dynamic priority + tutorial replay
7. target/catalog adaptive layout
8. final field acceptance audit

現在の進捗と次Taskは`docs/status/progress.md`を正本とする。各Taskの開始基準SHAは実装開始直前の最新remote `main`から取得し、計画作成時SHAへ固定しない。各Taskは独立してreview可能なcommit単位とする。