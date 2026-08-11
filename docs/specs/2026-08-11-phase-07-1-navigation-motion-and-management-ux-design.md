# Phase 7.1: ナビゲーション・地図操作・管理画面UX改善 設計

日付: 2026-08-11

## 1. 目的

Phase 7を本番利用して確認された次の問題を、既存Domain/Application責務と既存Use Caseを不要に変更せずUI/interaction層中心に修正する。

1. current routeのflowが実機で静止して見える。
2. 地図の上下にcurrent targetと距離が重複し、情報の正本が分かりにくい。
3. 地図panが重く、端への到達・bounds外drag・release後の慣性が安定しない。
4. 管理画面表示中に下層mainが見える、またはbackground scrollが干渉する場合がある。
5. Gallery初回swipe hintが実際の操作方向を十分に示さない。
6. 管理画面overviewのactionが過密で、mobile/desktop双方の情報階層を整理する余地がある。

Phase 7.1は新機能追加フェーズではない。routing、ALNS、circle data source、offline cache、GAS outbox、local deletionのbusiness contractは原則変更しない。

## 2. 基準点の扱い

計画作成時に確認した`main`は`c812de4ae68bf720781c8a498a2664990d3546b0`である。これは現状分析の履歴上の参照点であり、実装開始SHAではない。

各Taskは開始直前に最新`origin/main`または前Task完了HEADを取得し、その時点のコード、test、file pathへ計画を照合する。計画作成時SHAとprivate implementationの差だけを理由に実装を停止しない。一方、外部挙動や責務が変わっている場合は計画を再評価する。

## 3. 現状確認

### 3.1 route flow

`apps/webapp/css/target.css`には`.route-flow-line`の`stroke-dashoffset` animationがあり、`prefers-reduced-motion: reduce`では停止する。`buildRouteOverlaySvg()`もcurrent routeへflow polylineとS/Gを生成している。

したがって別方式へ置換せず、まずcomputed dash offsetの実時間変化を確認する。動いているが見えない場合だけdash間隔・線幅・速度・コントラストを最小調整する。

### 3.2 navigation summary

現行`DomRouteGuidanceView.showNavigation()`では、上部summaryは`currentTarget`を維持し、別pinを選んだcandidate previewでは`selectedTarget`のidentity/distanceをbottom sheet側へ表示している。

よって通常時の重複を削る際も、candidate preview/loading/readyの文字情報まで消してはいけない。通常・preview・comparisonを別状態として設計する。

### 3.3 map pan

`GestureZoomController`は既にbounds、rubber-band、inertia、pinch、wheel、RAF coalescing、cached layoutを持つ。一方でrelease velocityは最後のpointer deltaへ強く依存し、inertiaはframeごとの固定減衰である。

Phase 7.1ではcontrollerを置換せず、既存処理を再利用してrelease samplingとdt-based inertiaを追加する。pure helperはtestabilityのために使ってよいが、新module化自体を要件にしない。

現行`applyRubberBand()`の既定overscroll上限は32pxで、Phase 6.1でも約32pxが既存契約として記録されている。Phase 7.1で根拠なく24pxへ変更しない。

### 3.4 management surface

`#settings-area`は既に`position: fixed; inset: 0; overflow-y: auto; background: var(--bg-body)`である。したがって新しいfull-screen overlayを作り直すのではなく、background document scroll、scroll chaining、viewport/safe-area等の再現した不足だけを直す。

`ComipathSettings`は現在、overviewとsecondary `<details>`の両方を所有する。list/detail redesignでもこの既存ownerをまず再利用する。

### 3.5 management action ownership

`EventDayManagementView`は現在、5 action eventをdispatchし、`BrowserApplication`がUse Caseへ接続する。

重要なのは、現行`BrowserApplication`の`再読込`、`オフライン準備`、`編集`、`削除`handlerが対象refへ`eventDayTransition.execute(ref)`してから処理する点である。

Phase 7.1では「detailを見るだけではactive dayを変えない」を追加するが、既存action実行時の対象day切替まで独断で変更しない。action semantics変更は別の製品仕様判断とする。

## 4. 設計方針

### 4.1 通常案内の正本を上部summaryへ集約する

通常案内中:

```text
NEXT  東ア23a
FROM  東ア10     約84 m
```

current target、start、current route distanceを上部summaryへ置く。bottom sheetはpriority、source/sheet、catalog link、購入済/保留等の詳細と操作へ専念する。

candidate preview/loading/readyでは上部summaryをcurrent routeのまま維持し、候補操作領域でcandidate spaceとdistance/statusを明示する。

comparison中だけcurrent/candidate双方を並べる。

### 4.2 route flowは既存CSS/SVG方式を維持する

current route:

1. solid base line
2. moving dash
3. S/G marker

JavaScript per-frame route更新は追加しない。no-preferenceではcomputed valueが実時間で変化することをE2Eで確認する。特定のdasharray/duration値は初期候補に留め、受入条件にはしない。

### 4.3 map panは既存controllerを最小改修する

必須の挙動:

- bounds内dragは1:1。
- bounds外だけ既存rubber-band。
- release velocityは直近の複数sampleから時間基準で求める。
- inertiaはRAF timestamp差を使う。
- bounds到達時はその軸を停止する。
- bounds外releaseはさらに外へ進めずsettleする。
- pointerdown/pinch/reset/layout/route fitで進行animationを安全にcancelする。
- idle時RAFを残さない。

速度window、max speed、deceleration、settle duration等は一箇所で調整できるようにしてよいが、計画段階の特定値をpublic contractへしない。

pure helperを既存`gesture-zoom-controller.js`に置くか別fileへ分けるかは、責務の読みやすさとtestabilityで決める。

### 4.4 map edgeとroute fitを両方testする

C108各areaで必要なleft/right/top/bottomへ到達できることを確認する。stageがviewportより小さい軸は`baseX/baseY`を維持する。

route fit transformをboundsへ補正する場合、単にbounds内であることだけでなくcurrent/comparisonの必要pointが見えることをtestする。clampによるroute fit破壊を許容しない。

### 4.5 managementは既存full-screen surfaceを維持する

管理open中:

- surfaceは即時opaque。
- background document scrollを止める。
- management内scrollは許可する。
- scroll boundaryからbackgroundへのscroll chainingを抑止する。
- close時に元scroll位置と変更したinline styleを正確に復元する。
- disconnectでもlockを残さない。
- safe-area、focus、nested dialogを維持する。

scroll lockは一利用者しかいないため、まず`ComipathSettings`のprivate lifecycleとして実装する。別module/interfaceへの抽出は必要性が確認された場合だけ行う。

### 4.6 非必須motionを必要箇所だけ分離する

`apps/webapp/css/motion.css`へ次だけを必須範囲として集約する。

1. Gallery初回swipe hint
   - 現行storage/timer lifecycleを再利用する。
   - 実際の横swipeを模倣する短いtranslate motion。
   - textだけでも意味が通る。
2. management entry
   - surface backgroundは即時opaque。
   - 必要ならcontentだけ短いopacity/translate。
3. Task 6で必要になったmobile list/detail transition
   - 状態変更は即時。
   - animation終了をbusiness logicの条件にしない。

purchase/hold feedback、route endpoint emphasis、async indicator exit animationは今回の確認済み問題に必須ではないため追加しない。

特にroute endpointは`renderNavigation()`によるoverlay再生成でroute変更以外にも再animationし得るので、単純な`.route-endpoint` one-shot animationを採用しない。

### 4.7 managementをlist-detailへする

#### Mobile

第一層はscanしやすいevent/day listにする。

```text
C108 / 1日目      使用中  ›
GAS / 配置シート1
532件  同期0件  お品書き521/532
```

rowを選ぶとdetailへ進むが、それだけではactive dayを変えない。

detailではsource/offline/GAS/巡回設定/削除等を意味単位で配置する。非selected configured dayには`この日程を開く`を明示する。未設定dayは既存設定経路へ接続する`設定する`を主actionにする。

#### Desktop

mobileと同じ`rows`/detail selection stateで左list・右detailの2-paneとする。desktop専用repository queryを追加しない。

#### component境界

`ComipathSettings`は既にdetail controlsのownerなので、まず同component内のprivate state/renderで実装する。新`EventDayManagementDetail` componentは、実装後の責務が明確に分離できる場合だけ抽出する。

## 5. 非目標

- 地図library/canvas/WebGLへの移行。
- route calculation algorithm変更。
- full PWA化。
- management専用router。
- motion/physics library追加。
- haptic/audio feedback。
- 新global state store。
- 未観測箇所への装飾animation追加。
- management action semanticsの変更。

## 6. テスト戦略

### Unit / component

- current/candidate route overlay構造。
- navigation state別の表示責務。
- release velocity sampleとdt-based inertia。
- bounds/overscroll/RAF停止。
- management scroll lock lifecycle。
- overview rowのdetail request。
- detail selectionとactive dayの分離。
- 既存5 action eventの`ref` contractをdetail側で維持。

### E2E

- route flowの実時間変化。
- reduced motion。
- 通常案内の重複なし + candidate preview identity。
- C108 map edge + inertia。
- management遮蔽/background scroll lock。
- Gallery初回hint。
- mobile list→detail→back/open。
- desktop 2-pane。
- existing GAS/CSV/offline/delete/outbox path。
- 200% zoom、keyboard、safe-area。

management E2Eでは、現行`openSettings()`のようにdetailを自動openするhelperをlist/detail検証へ流用しない。overviewから実UI操作でdetailへ進むtestを持つ。

### Performance

- pointermoveごとのlayout readなし。
- transform write coalescing維持。
- idle RAFなし。
- 非必須motionはtransform/opacity中心。

## 7. Task構成

1. route flow実動検証と最小修正
2. navigation summary情報重複解消
3. map pan bounds/release velocity/inertia改善
4. management遮蔽/background scroll isolation
5. 必要なmotion feedbackの分離実装
6. management list-detail redesign
7. 総合検証・snapshot・進捗確定

Task 7を分離することで、Task 6の大規模UI変更とPhase全体の検証・progress確定を同じcommitへ混ぜない。最終production HEADが確定してからdocs-onlyでprogressへSHAを記録する。

## 8. Phase受入条件

- current route flowがno-preferenceで実時間変化し、reduced motionではsolid route/S/Gだけでも方向が分かる。
- 通常案内のcurrent target/distanceは上部summaryが正本。
- candidate previewで候補identity/distance/statusが消えない。
- C108各areaで必要端へ到達可能。
- bounds内1:1、multi-sample release velocity、dt-based inertia、bounds settleが成立する。
- 既存約32px rubber-band契約を根拠なく変更しない。
- management open中に下層mainが見えずbackground scrollしない。
- Gallery hintが実swipe方向を示す。
- 非必須motionが`motion.css`へ分離されreduced motion対応。
- mobile managementはlist→detail、desktopは同じmodelで2-pane。
- detailを見るだけではactive dayを変えない。
- 既存management actionは既存BrowserApplication/Use Caseへ接続される。
- 44px touch target、keyboard focus、safe-area、200% zoomを維持する。
- `npm run verify`、`npm run test:e2e:ci`、`node scripts/audit-public-tree.mjs`、`git diff --check`が成功するか、失敗を開始基準との比較で具体的に分類できる。
