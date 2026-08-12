# Phase 7.3: 実機UX再修正・入力正規化・カタログPOST信頼性設計

更新日: 2026-08-12

## 背景

Phase 7.2では、catalog extension、candidate route、current route animation、map overscroll、global Gallery、target catalog adaptive layoutまで実装した。しかし実機確認により、テスト上は成立していても利用者から見た受入条件を満たしていない箇所が残った。

Phase 7.3では、Phase 7.2 Task 8のfield acceptanceを実質的に不合格として扱い、以下を修正する。

- catalog extensionはspace/account URLのDOM抽出までは成功するが、GASへのPOST成功を実機で確認できていない。
- map上の購入済みcircleが不要な選択候補として残り、誤操作要因になる。
- current routeの赤線animationが実機で知覚できない。
- portrait catalog用の2column layoutが狭いmobileで崩れ、文字が不自然に折り返される。
- map pinをtapするとmain detail全体が候補へ切り替わるため、current targetと候補の境界が分かりにくい。
- Gallery購入が即時再renderされるため、退場animationが成立しない。購入直後にundoできるUIもない。
- circle space表記の正規化がGAS/CSV/appで統一されておらず、`東A  32-a`等の実用入力を安全に扱えない。
- mapのdragが実機で指から約100ms遅れ、非連続に見える。現行コード上の意図した遅延ではないため、端末性能と決めつけず入力・描画経路を計測して改善する。
- Cloudflare Pagesのpreview buildが不要なbranch pushでも走り、deploy quotaを消費している。

## Phase 7.2の扱い

Phase 7.2の個別Task commitは履歴として保持する。Task 2、Task 4、Task 7等を過去に遡って「未実装」に書き換えない。

Phase 7.2 Task 8ではfield verificationを実施し、少なくとも次を未達として記録する。

- extension実GAS POST
- current routeの人間が知覚できる方向animation
- narrow mobileでのcatalog detail layout
- map drag responsiveness

Phase 7.3完了時にこれらを改めて受入する。

## 設計原則

1. まず再現・計測し、原因不明のまま見た目だけ調整しない。
2. current navigationとcandidate previewを別状態として視覚的にもDOM責務としても分離する。
3. circle spaceはcanonical formへ変換してから比較・duplicate判定する。
4. GAS POSTはmock fetchの成功だけで完了とせず、実deploymentで何が失敗したか分類できる診断経路を持つ。
5. map gestureは指追従の低遅延を優先し、animationやpin detailがhot pathへ負荷を追加しない。
6. mobile layoutは390px前後を基準に成立させ、tablet/desktop向け2columnをmobileへ無理に適用しない。
7. 非必須motionはCSS中心とし、`prefers-reduced-motion`で意味を失わない。
8. Cloudflare preview停止はapp featureから分離した運用変更とする。

---

## 1. Circle space canonicalization

### 目的

GAS、CSV、catalog extension、route/map lookup、購入状態更新が同じcircleを同じidentityとして扱えるようにする。

### canonical form

代表例:

```text
東A  32-a  -> 東A32a
東Ａ３２ａ -> 東A32a
東A32A     -> 東A32a
東ア 032-b -> 東ア32b
```

canonicalizerは「許可文字以外を全部消す」実装にはしない。壊れた入力を別circleへ誤変換する危険があるため、段階的に処理する。

1. `String(value)`化は呼び出し側で行わず、unknownを受けて非文字列はinvalid。
2. Unicode NFKC。
3. Unicode whitespaceを除去。
4. `-`, `－`, `−`, `―`等の区切り文字をside suffixの直前だけ許容して除去。
5. prefix + label + number + optional sideへ構造parse。
6. numberのleading zeroを除去。
7. side `A/B`は小文字`a/b`へ。
8. event/map registryにprefix/label情報がある場合はその範囲を検証。

概念的な構造は次とする。

```text
<prefix><label><number><side?>
```

prefixは現行C108では東/西/南/北。labelはASCII英字、ひらがな、カタカナ等を許容するが、最終妥当性はevent/map registryへ委譲する。

### duplicate semantics

duplicate判定はraw文字列ではなくcanonical spaceで行う。

```text
東A32-a
東Ａ３２ａ
```

が同一入力集合に存在すればduplicate errorとする。

### WebappとGASの責務

canonicalizationの正本はWebapp shared domainに置く。

ただしGAS sheetには過去のraw表記が残る可能性があるため、GAS側のrow matchingも同じsemanticsを必要とする。Webapp/GASで実装言語は分かれるが、同じJSON fixtureを両testから読み、case driftを防ぐ。

GASは既存sheetのspace cellを勝手にcanonical formへ書き換えない。lookup時だけcanonical identityで比較する。

---

## 2. Catalog extension POST reliability

### 現状

content scriptはspace/account URLを抽出できる。background service workerは設定済みGAS URLへ`fetch()`し、`action: "upsertCatalog"`を送る。GAS routerと`doPostCatalog()`も存在する。

現在不足しているのは「実GAS deploymentを通した時にどこで失敗したか」を判断する能力である。

### 方針

DOM extractorは原則変更しない。transportとdeployment diagnosisを分離する。

### POST probe

GASに副作用のない明示actionを追加する。

```json
{
  "action": "probe"
}
```

成功時はspreadsheetを書き換えず、固定JSONを返す。

```json
{
  "ok": true,
  "status": "success",
  "kind": "probe"
}
```

extension options画面へ`接続を確認`を追加し、catalog送信と同じbackground service worker、同じfetch path、同じGAS URLを使う。

### error classification

利用者へ少なくとも次を区別して表示する。

- URL validation failure
- network/fetch failure
- non-2xx HTTP
- JSONではなくHTML等が返った
- GAS JSON `ok:false`
- probe成功
- catalog POST成功

診断表示へGAS response HTML全文や個人URLをそのまま出さない。

### redirect

Apps Script ContentServiceはredirectを使うため、最終response URLが`script.googleusercontent.com`等になることを前提にする。Manifest host permissionは実際に必要なGoogle hostだけを許可し、`<all_urls>`へ広げない。

### test方針

unit testのmock fetchは維持するが、それだけを受入条件にしない。

最低限:

- redirect後JSON successを模したresponse
- HTML responseを明示errorへ変換
- 403/404/500分類
- `probe`と`upsertCatalog`が同じtransport関数を通る
- manual smoke testでtest sheetへ実POSTし、同space再送時に同row updateされる

---

## 3. Map pin lifecycleとfloating circle preview

### 購入済みpin

current/start/selectedの特別状態でない購入済みcircleはnavigation mapへ表示しない。

購入済みを緑pinとして残す価値より、誤ってtapして候補変更するリスクが大きい。route itinerary等、別画面で履歴を示す必要がある場合はそちらで扱う。

購入完了直後にmap rerenderし、古いbutton DOMが残らないことを受入条件にする。

### floating preview

pin tap時にmain target detail全体をcandidateへ差し替えない。

map viewportの上に、transform layerとは別のfloating preview cardを表示する。

表示内容:

```text
変更候補 東A32a
距離 約120m
priority 8
catalog thumbnail
Twitter/X account
[経路を比較] [閉じる]
```

candidate routeが計算できれば青線を同時に表示する。

### pointer/hover semantics

mobile:

- tapでpreview cardを開く。
- card外tapまたは閉じるで閉じる。
- 二度目の操作またはbuttonで比較/変更へ進む。

mouse/trackpad:

- hover/focusで軽いpreviewを表示してよい。
- 実際のroute selection stateを変えるのはclick/tap後だけとする。

hoverだけでroute計算を大量発生させない。

### placement

cardはmap transform layer内へ置かない。mapをzoom/panしてもcard自体の文字サイズは変化させない。

pin近傍を基準にviewport内へclampする。画面端でcardが切れる場合は反対側へflipする。

将来、通常画面のmap外へpersistent detail panelを置く案は別フェーズとし、Phase 7.3ではfloating cardまでに留める。

---

## 4. Map direct-manipulation responsiveness

### 現状分析

現行`GestureZoomController`はsingle pointer moveごとにstateを更新し、DOM transform writeだけを`requestAnimationFrame`でcoalesceしている。

したがってコード設計上、100ms程度の固定遅延を意図しているわけではない。通常は1 display frame程度の追加遅延に収まるはずである。

実機で約100ms遅れ、さらに非連続に見えるなら次の候補を切り分ける。

1. input event delivery自体が遅れている。
2. Chromeが複数pointer sampleを`pointermove`へcoalesceしている。
3. main threadが長時間blockされ、pointermove/RAFが遅延している。
4. transform対象のlarge SVG + pin DOM + route SVG layerのraster/compositeがframe budgetを超えている。
5. compositor promotionが安定せず、gesture中に再paint/rasterizationが発生している。
6. 端末GPU/CPU性能が限界である。

端末性能を原因と判断するのは1〜5を測定した後とする。

### measurement first

production behaviorを変える前に、actual mobile ChromeのPerformance traceまたは一時diagnostic buildで次を測る。

- pointer event timestamp → handler entry
- handler entry → transform style write
- RAF frame gap
- long taskの有無
- gesture中のpaint/composite/raster時間
- map pin count
- route overlay有無による差

目標は「100msという利用者体感がJS/input lagなのかrender lagなのか」を分類することであり、無理に単一数値のsynthetic benchmarkへ落とさない。

### coalesced pointer events

Pointer Events仕様では、user agentは複数のpointer sampleを一つの`pointermove`へcoalesceできる。対応browserでは`getCoalescedEvents()`を使い、最新位置とrelease velocity sampleへraw sampleを反映する。

表示transformは一frameに何度も書かず、最終sampleだけを画面へ反映する。過去sampleはvelocity/fidelity計算へ利用する。

`pointerrawupdate`や`getPredictedEvents()`は初手では使わない。より高頻度入力や予測位置は、main thread負荷やovershootを増やす可能性があるため、通常pointermove + coalesced eventsで改善しない場合だけprototype比較する。

### compositor strategy

現行はmap transform layerへ常時`will-change`を付けていない。画質維持には有利だが、gesture開始時のcomposite/rasterが遅延要因になる可能性がある。

Phase 7.3では次を比較する。

A. 現行RAF-coalesced transform

B. gesture中だけ`.is-direct-manipulation`を付け、`will-change: transform`でlayer promotionし、inertia/settle終了後に解除

C. pointermove handler内で直接transform style write

原則推奨はBである。A→Bでframe gapが改善するならBを採用する。Cは1frame分の入力遅延を減らす可能性があるが、イベント頻度が高い端末でstyle writeが増えるため、trace比較で明確に有利な場合だけ採用する。

### visual qualityとの両立

active gesture中だけ一時的にcompositor texture化し、gesture/inertia終了後にpromotionを解除してSVGをcrispに再描画する方式を優先する。

常時`will-change`へ戻して画質問題を再発させない。

### DOM load reduction

Task 3で購入済みpinを除去することはmap DOM node数削減にもなる。

floating preview cardはtransform layer外へ置き、map panのcompositor surfaceへ追加しない。

route animationもJS frame loopを追加しない。

### acceptance

- 指追従が現行より明確に改善する。
- pointermove hot pathでlayout readを追加しない。
- no route / route visibleの双方でdrag可能。
- pinch zoomとinertiaを壊さない。
- actual mobile traceで100ms級の継続的input-to-render delayが残る場合、CPU/GPU bottleneckの証拠を記録する。
- 端末性能がボトルネックの場合も、どの処理がframe budgetを超えているかを記録してPhase完了可能とする。

---

## 5. Current route direction animation

### 問題

productionにはcomet、direction arrow、S/Gが存在するが、実機では赤線が静止して見える。

Chrome/macOSの`prefers-reduced-motion`が有効ならanimationが意図的に停止するため、まず実機で次を確認する。

```js
window.matchMedia("(prefers-reduced-motion: reduce)").matches
```

`true`なら設定に従った停止である。`false`なのに見えない場合は実装側の知覚性不足とする。

### redesign

solid red base lineは維持する。

その上に、S→Gへ明確に移動する短いbright cometを表示する。単なる細いdash列より、移動segment間隔を大きくし、どちら向きに走っているか一目で分かる形にする。

route pathの長さ差で速度感が極端に変わらないよう、可能ならSVG `pathLength`を正規化してdash patternを定義する。

Start/Goal:

- `S`は現状維持。
- `G`はSより少し強くする。
- static arrowはreduced-motionでも維持する。

JS per-frame updateは追加しない。

---

## 6. Target catalog mobile layout repair

### 問題

現在はwidth 360px以上でportrait catalogを7:3二列へする。そのため390px前後のmobileでは右columnが約120pxとなり、metadata/button/accountが不自然に改行される。

### 方針

mobileではorientationに関係なく一列を基本に戻す。

```text
navigation summary
map
catalog image
compact metadata
purchase / hold actions
```

portrait画像もmobileでは画面幅を使い、`max-height`を55〜60vh程度に制限して`object-fit: contain`とする。

二列はtablet/desktop幅からのみ有効化する。初期breakpointは640〜700px程度を候補とし、実際の44px touch targetとtext wrappingを見て決める。

portrait/landscapeでDOMを複製しない。

candidate detailsはTask 3のfloating previewへ移るため、通常bottom detailへcandidate controlsを詰め込まない。

---

## 7. Gallery purchase feedback and undo

### 現状

purchase成功直後に`currentTargets`から削除して`renderGallery()`を呼ぶため、item DOMが即消え、退場animationが再生されない。

### smooth exit

購入成功後:

1. itemへ`is-purchased-leaving`。
2. opacity + translate + slight scaleを180〜240ms。
3. `transitionend`または安全timeout後にcurrentTargetsから除外。
4. full grid rerenderではなく、可能なら対象itemだけremoveし、filter countだけ更新。

reduced-motionではanimationをskipして即removeする。

### undo snackbar

画面下部に専用snackbarを表示する。

```text
東A32a を購入済みにしました      [取り消す]
```

- latest purchase 1件だけundo対象。
- 4〜6秒程度で消える。
- 新purchaseで前のsnackbarを置換。
- snackbarはGallery modalより上、safe-area内。

### undo semantics

既存`CircleStatusController.undo()`はstatusだけでなくUse Caseのundo tokenを持つが、Gallery purchaseは`completeCircleVisit()`を通じてroute guidance stateも更新する。

したがって「statusだけundoしてroute orderは購入済みのまま」を禁止する。

undoは購入直前navigation snapshotまたはroute guidance rebuild情報を保持し、statusとnavigation orderを一貫して戻す。

GAS outboxへsale updateが既に追加されている場合、undo側の既存mutation semanticsに従ってreverse updateを生成する。

---

## 8. Cloudflare Pages deployment policy

これはPhase 7.3 production featureとは別のoperations変更とする。

利用方針は「branch previewはローカルで確認し、Cloudflareはmainだけbuild」に確定する。

Cloudflare Pages Git integration:

```text
Production branch: main
Automatic production branch deployments: ON
Preview branch deployments: None
```

これにより非production branch pushではautomatic preview deploymentを作らない。

GitHub Actions CIは別物なので、branch/PR上でtestを継続してよい。

既存preview cleanupは別operations taskとして扱い、latest-per-branchを消せないCloudflare仕様に従う。

---

## Phase 7.3の実装単位

実装計画では次の8 Taskへ分割する。

1. Circle space canonicalization
2. Catalog extension POST diagnosis and reliability
3. Map pin lifecycle + floating circle preview
4. Map direct-manipulation responsiveness
5. Current route field-visible animation
6. Target catalog mobile layout repair
7. Gallery purchase smooth exit + undo snackbar
8. Field acceptance + Phase 7.2 Task 8 closure

Cloudflare preview停止はPhase 7.3 Taskとは別のoperations変更として同じdocs branchに計画を置いてよいが、app feature commitへ混ぜない。

## 最終受入条件

- `東A  32-a`等の表記がcanonical spaceへ安全に変換され、CSV/GAS/appで同一identityになる。
- extension optionsから実GAS connectionをprobeでき、POST failureの種類が判別できる。
- real test sheetへspace/accountをPOSTでき、同space再送でduplicate rowを作らない。
- 購入済みcircleはcurrent/start/selectedでない限りnavigation mapから消える。
- map pin tapでfloating previewにdistance/catalog/accountが出て、main current detailを上書きしない。
- map dragの100ms級遅延を計測・分類し、software側で改善可能なら実際に軽くする。
- current routeはreduced-motion offでS→G方向が人間に知覚できる。
- 390px前後のmobileでcatalog detailが不自然に改行されない。
- Gallery購入itemがsmoothに退場し、直近購入を画面下部からundoできる。
- undo後にstatus、route order、GAS sync stateが不整合にならない。
- Cloudflare Pagesはmain commit以外のautomatic preview deploymentを作らない。
- Phase 7.2 Task 8の未達事項をfield-oriented verificationで再受入する。

## 非目標

- map library全面移行
- Canvas/WebGLへの地図renderer全面置換
- predicted pointer位置を常用すること
- catalog page全体の自動crawl
- multiple-level undo history
- persistent map-side detail panel
- Cloudflare Pagesから別hosting providerへの移行
- routing/ALNS objective変更
