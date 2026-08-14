# Phase 7.5: Map-first UI polish・周辺カードperimeter配置・ALNS探索可視化 設計

## 背景

Phase 7.4はTask 27まで完了し、Motorola Android実機確認と最終CI greenまで閉じた。その後の人間確認では機能そのものは利用可能と判断された一方、次のUX改善が残った。

- 経路画面・独立「地図」画面のどちらも、地図そのものに割り当てる面積が小さい。
- 独立「地図」画面では、エリア・基準地点・priority・件数・保留等の補助UIが常時大きな高さを占有する。
- 現在のお品書きgridは地図と上下に分断されるため、地図とcardの双方が小さくなる。
- 主要buttonのpressed / selected / disabled / busy / keyboard focus等を、現在の機能群を横断して再確認したい。
- ALNS探索にはWorkerの`progress` messageが既に存在するが、探索中のbest routeを人間へ見せていない。

## 目的

1. 地図とお品書きを主役にし、補助UIを必要時だけ展開するmap-first UIへ整理する。
2. 経路画面の地図も固定520px上限から解放し、スマホを含む各viewportで大きく表示する。
3. 独立「地図」画面では、お品書きを地図の周囲へ常時表示し、地図そのものへ重ねない。
4. 5件・10件は全件を同時表示し、15件・20件は10件単位でページを切り替える。
5. ALNS探索中のbest orderが改善される様子を青〜紫系の巡回順previewとしてリアルタイム表示する。

## 対象外

- 地図viewportの`overflow: hidden`を撤廃して、変形中の地図を他UIへはみ出させること。
- 新しいUI framework、animation library、state managerを導入すること。
- ALNSの評価関数、destroy/repair operator、探索時間の意味を変更すること。
- progress受信ごとに全区間のDijkstraを再実行すること。
- 探索中previewを正式NavigationStateや永続snapshotとして毎回commitすること。
- 20件を超える新しい周辺検索件数を追加すること。
- Phase 7.4で完了済みのpriority意味論、Undo、catalog detail layer、route motion設定を作り直すこと。

## 現行実装から確認した重要事項

### 地図サイズ

`DomRouteMapView.applyViewportLayout()`は`viewportMaxHeight: 520`を渡しており、経路地図はJS側から高さを抑制している。独立地図も、補助controlsとcatalog panelがworkspaceを常時分割するため、map viewportへ残る面積が小さい。

したがって本Phaseでは`overflow`を外すのではなく、**viewportそのものを大きくし、stageだけをそのviewport内でclip/panする**。

### ALNS

`TimeDecayedAlnsWorkerKernel`とworker protocolには既に`progress`がある。一方、`RouteGuidanceRuntimeController.launchAlnsOptimization()`は`progress`と`complete`を同じ`handleWorkerProgress()`へ流すため、途中bestでもNavigationStateの`bestOrder`を更新する。

またfresh startの`StartRouteGuidanceUseCase`は即時の最寄りrouteを作るが、ALNS起動やdistance matrix workerへのproduction wiringを行わない。`DistanceMatrixController`とdistance-matrix worker自体は既に存在するので、新しい計算基盤を作らずこれをproductionへ接続する。

## UI設計

### 1. 共通map-first原則

- 地図viewportは`overflow: hidden`を維持する。
- map stageは画像aspect ratioを維持する。
- contain時に短辺占有率が低すぎる場合はbounded-coverを使い、crop部分へpanできるようにする。
- 地図の表示面積は補助UIより優先する。
- 地図上の「表示中心」は小さなoverlayとして維持し、layout heightを消費しない。

### 2. 経路画面

通常時はcompactなNEXT / FROM summary、大きな地図、購入済 / 保留 / 詳細 のcompact action barだけを常時表示する。

お品書き画像、priority、Link、候補経路操作等は`詳細`を押したときだけ展開する。現在地入力は開始前に使える状態を維持するが、巡回priority filter等の補助条件はcompactにまとめる。

地図の高さはJSの520px固定上限で決めず、mobileではCSSで`height: clamp(360px, 72dvh, 760px)`を与える。JSは実測されたviewport幅・高さを受けてstage配置だけを計算する。

### 3. 独立「地図」画面のcontrols

通常時headerは`地図`、現在条件summary、`条件` toggle、閉じるbuttonだけを常時表示する。

`条件`は`aria-expanded`を持ち、押したときだけdrawerを展開する。drawer内に既存のエリア、現在地を使う、基準地点変更、priority、表示件数、保留を置く。drawerを閉じてもfilter stateは保持する。

### 4. お品書きperimeter配置

cardはmap viewportの内側へ重ねない。mapとcardは一つのworkspaceに置き、card用laneをmapの周囲へ確保する。

- narrow / medium: 最大5件のtop lane + 最大5件のbottom lane。
- wide: top / right / bottom / leftのslotへ分配して中央mapを確保する。
- slot同士は重ならない。
- 画像は自然aspect ratioを維持し、slot内へ`contain`する。
- leader lineはmap anchorから実card rectの最寄り辺へ結ぶ。
- 選択cardのactionを出すためにcard自体を拡張しない。選択中だけcompactな共通action toolbarへ`お品書きを見る`と`目的地にする`を出す。

### 5. 件数とpagination

周辺ranking自体は従来どおり5 / 10 / 15 / 20件まで取得する。

- 5件: 1ページ、5件すべて表示。
- 10件: 1ページ、10件すべて表示。
- 15件: 1ページ目1〜10件、2ページ目11〜15件。
- 20件: 1ページ目1〜10件、2ページ目11〜20件。

area、origin、priority、hold、limitが変化したらpage indexを0へ戻す。ページ変更ではrankingを再計算せず、既に得た候補配列をsliceする。

## UI interaction polish

対象は今回触るmap関連controlとroute actionに限定する。

- touch targetは主要操作で44px以上。
- `:focus-visible`を明示する。
- toggleは`aria-expanded`または`aria-pressed`と見た目を一致させる。
- async actionは実行中`disabled`または`aria-busy`とし二重送信を防ぐ。
- `:active`は軽い押下feedbackだけにし、layout shiftを起こさない。
- disabledはhover/active表現を出さない。
- `prefers-reduced-motion: reduce`では装飾transitionを停止する。
- drawer / detail / nearby mapのEscapeとfocus returnをE2Eで確認する。
- 地図drag/pinch開始をbutton clickとして誤認しない。

## ALNS探索可視化

### fresh start production wiring

開始直後の最寄りtarget/current routeは従来どおり即時表示する。その後backgroundで既存`DistanceMatrixController`を使ってdistance matrixをcache hitまたはworker計算し、準備できたらALNSを開始する。distance matrix計算中もcurrent routeは利用可能とする。

### progressの意味

Workerからの`progress`は**表示専用preview**であり、正式`NavigationState.bestOrder`や永続snapshotを書き換えない。`complete`だけがbest orderを正式stateへcommitし、snapshot保存対象になる。`cancelled`やstale generationはcommitしない。

### worker通知頻度

- 初期bestは即時通知。
- best scoreが改善したときだけdirtyとする。
- progress送信間隔は250ms以上。
- 250msの間に複数改善した場合は最新bestだけを送る。
- `complete`は待たず即時送信する。

### 地図上のpreview

distance matrixは経路形状を保持しないため、progressごとに正確な全区間routeを再構築しない。探索中は`currentPosition`と各circle anchorをbest order順に結ぶ**巡回順preview polyline**を表示する。

- 色は青〜紫系。
- exact walkable routeでないことを`探索中`表示で明確にする。
- map内に`探索中 2.6 / 5.0秒・best更新 8`相当のcompact statusをoverlay表示する。
- preview DOMは一度生成し、progressではpoints/statusだけ更新する。
- map drag/pinch中は描画更新を保留し、操作終了時に最新bestへ追いつく。
- current red routeと白moving cueは既存のexact current legとして維持する。
- `complete`時にpreview/statusを消し、正式にcommitされたbest orderと既存の赤current routeへ戻る。

## 状態境界

- `NavigationState`: 正式な案内状態のみ。
- optimization preview: runtime/UIのephemeral state。LocalStorageへ保存しない。
- nearby controls / pagination / drawer open state: UI local state。新しいstorage schemaを追加しない。
- userが手動で目的地変更、購入、保留、event/day切替を行った場合、active optimizationとpreviewをinvalidateする。

## テスト戦略

- pure geometry: map stage、perimeter slots、pagination。
- DOM contract: controls drawer、route detail toggle、card toolbar、leader line。
- interaction: pressed/selected/disabled/busy/focus/Escape/drag誤発火。
- worker: 250ms coalescing、initial/complete即時、cancel/stale。
- runtime: progressで正式state不変、completeで一度だけcommit。
- fresh start: distance matrix worker -> ALNS workerのproduction wiring。
- E2E: narrow/medium/wide、10件同時表示、15/20 pagination、route map拡大、ALNS preview更新。
- 最終visual snapshotは人間確認後だけ更新する。

## 完了条件

- 経路画面と独立地図の両方で、Phase 7.4より明確に地図が大きい。
- 補助UIが常時大きな面積を消費しない。
- 10件までは全cardが同時に見え、15/20件は10件単位で切替可能。
- cardはmapを覆わず自然aspect ratioを維持する。
- map関連buttonのinteraction stateに矛盾がない。
- fresh startでもALNSがproduction上で起動する。
- 探索中best orderが青〜紫previewとして複数回変化する。
- progress中に正式bestOrderを永続化しない。
- map gesture中のpreview更新で操作が明確に重くならない。
- `npm run verify`、`npm run test:e2e:ci`、public tree audit、`git diff --check`が通り、最後に実画面を人間が受入する。
