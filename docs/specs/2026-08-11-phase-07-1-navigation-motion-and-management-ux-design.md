# Phase 7.1: ナビゲーション・モーション・管理画面UX改善 設計

日付: 2026-08-11

## 1. 目的

Phase 7を本番利用した結果として確認された次の6点を、既存のDomain/Application責務を崩さずUI/interaction層中心に修正する。

1. current routeの経路flowが実機で静止して見える。
2. 地図の上下に距離と次の目的地が重複しており、情報の正本が分かりにくい。
3. 地図panが重く感じられ、地図端まで確実に見えない場合があり、境界外dragの感触とrelease後の慣性も自然ではない。
4. 管理画面表示中に下層のmain画面が見える場合がある。
5. 操作理解と状態遷移を助けるモーションが不足している。特にGallery初回swipe hintは、実際の操作方向を模倣する方が分かりやすい。
6. 管理画面は機能的には成立しているが、event/dayのscan、detailへの移動、action hierarchyをさらに整理できる。

Phase 7.1は新機能追加フェーズではない。routing、ALNS、circle data source、offline cache、GAS outbox、local deletionのbusiness contractは原則変更しない。

## 2. 現状確認

基準commitは`main`の`c812de4ae68bf720781c8a498a2664990d3546b0`。

### 2.1 route flow

`apps/webapp/css/target.css`には`.route-flow-line`の`stroke-dashoffset` animationが存在し、`prefers-reduced-motion: reduce`では停止する。`buildRouteOverlaySvg()`もcurrent routeにflow polylineを生成している。

したがってPhase 7.1では、最初から別方式へ置き換えない。まずno-preference環境でcomputed `stroke-dashoffset`が時間経過により変化するかを検証し、実際に動いていないのか、動いているが視認できないのかを分離する。

### 2.2 地図pan

`GestureZoomController`は現在も慣性を持つが、velocityは最後の`pointermove`の`dx/dy`だけで決まり、frameごとに固定比率`0.92`で減衰する。event間隔の差を考慮しないため、同じ指速度でも端末/ブラウザのpointer event頻度やrelease直前の最後のdeltaに左右される。

またbounds、rubber-band、inertia、pinchが一つのcontroller内で密結合している。Phase 7.1ではcontrollerを全面置換せず、pan physicsをpure functionへ分離して検証可能にする。

### 2.3 管理画面

`#settings-area`は`position: fixed; inset: 0`で独立surfaceになっているが、background document scrollの保存・固定・復元を管理していない。管理surface自体にもscroll boundaryから下層へ連鎖しない契約を明示する必要がある。

UIはevent/day overviewと`選択中の日程の詳細`を持つが、mobileではoverviewとdetailの階層をより明確にし、desktopでは同じmodelを2-paneとして使える構成が適している。

## 3. 外部設計原則

Phase 7.1は特定製品の見た目をコピーしない。次の原則だけを採用する。

- Apple Human Interface Guidelines / Motion: モーション自体を目的にせず、状態、フィードバック、指示を補助する。頻繁な操作へ不要な待ち時間を加えない。重要情報をmotionだけで伝えない。
  - https://developer.apple.com/design/human-interface-guidelines/motion
- Apple Human Interface Guidelines / Lists and tables: text中心の情報は短いrowでscanしやすくし、大量のdetailをrowへ詰めず選択後のdetail viewへ分離する。
  - https://developer.apple.com/design/human-interface-guidelines/lists-and-tables
- Leaflet reference: map panはdrag中にmomentumを蓄え、release後はdecelerationで止まる慣性を持つ。bounds外dragの硬さと慣性を別概念として扱う。
  - https://leafletjs.com/reference
- web.dev / high-performance CSS animations: UI motionは可能な限り`transform`と`opacity`を中心にし、layout/paintを毎frame発生させるanimationを避ける。
  - https://web.dev/articles/animations-guide
- MDN / overscroll-behavior: full-screen管理surfaceのscroll boundaryからbackgroundへscroll chainingしない。
  - https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/overscroll-behavior
- `prefers-reduced-motion`は既存contractを維持し、非必須motionを停止またはfade中心へ縮小する。
  - https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion

## 4. 設計方針

### 4.1 情報の正本を一つにする

通常案内中の`次の目的地`と`距離`は地図上部summaryを正本とする。

推奨表示:

```text
NEXT  東ア23a
FROM  東ア10     約84 m
```

またはviewport幅に応じて同一内容を1〜2行でwrapする。

地図下部sheetは対象の詳細と操作へ専念する。

```text
優先度 10
配置シート1
X / お品書きLink
[購入済] [保留]
```

通常案内中は下部の`target-dist`、`sub-target-space`、`selected-target-space`による同一情報の重複表示をなくす。候補経路比較中のみ、候補spaceと候補距離をcomparison surfaceへ表示する。

### 4.2 route flowはCSS/SVGの軽量方式を維持する

current routeは次の3層とする。

1. 赤色のsolid base line: 経路そのもの。motion無効でも必ず残る。
2. 白系のmoving dash: Start→Goal方向の視覚的flow。
3. S/G marker: motionに依存しない方向情報。

JavaScriptのper-frame route再計算、Dijkstra/ALNS再実行、毎frame SVG再生成は追加しない。

no-preference環境ではcomputed `stroke-dashoffset`が実時間で変化することをE2Eで確認する。動いているが目立たない場合は、dash間隔・太さ・durationだけを調整する。最初の候補値は`stroke-dasharray: 12 28`、`stroke-width: 5`、`0.8s linear infinite`とするが、視認性確認で調整可能とする。

`prefers-reduced-motion: reduce`ではmoving dashを停止し、solid lineとS/Gを維持する。

### 4.3 map pan physicsをevent frequency非依存へする

pan physicsを`GestureZoomController`からpure functionへ分離する。

新規module候補:

`apps/webapp/js/utils/gesture-pan-physics.js`

責務:

```js
calculatePanBounds(layout, scale)
applyElasticOverscroll(value, bounds, limitPx)
recordPanSample(samples, sample)
calculateReleaseVelocity(samples, nowMs, windowMs, maxSpeedPxPerMs)
stepPanInertia(state, dtMs, bounds, decelerationPxPerMs2)
```

初期調整値は一箇所のconstantへ集約する。

```js
export const DEFAULT_PAN_PHYSICS = {
  velocityWindowMs: 100,
  minReleaseSpeedPxPerMs: 0.05,
  maxReleaseSpeedPxPerMs: 1.8,
  decelerationPxPerMs2: 0.0028,
  overscrollLimitPx: 24,
  settleDurationMs: 180,
};
```

この値は最終的な絶対値ではなくPhase 7.1の初期値であり、Task 3の実機相当E2E/manual profilingで変更してよい。ただし値を各methodへ分散させない。

挙動contract:

- bounds内dragは指移動に1:1で追従し、常時の抵抗を加えない。
- bounds外へdragした場合だけ最大24px程度のrubber-bandを許す。
- release時にbounds外なら、慣性をさらに外へ進めず180ms程度で最寄り境界へ戻す。
- bounds内releaseでは直近100msの複数sampleからvelocityを算出し、時間基準のdecelerationで慣性移動する。
- inertia中にboundsへ到達したら境界で止める。地図外を見せ続けない。
- new pointer down、pinch開始、layout変更、route fitで進行中animationを即時cancelできる。
- `requestAnimationFrame`はactive drag/inertia/settleがない場合に残さない。

### 4.4 地図端の可視性をcontractにする

wide/tall mapを含め、scaleごとに次をpure testで固定する。

- left boundへpanすると地図左端がviewport左端に一致する。
- right boundへpanすると地図右端がviewport右端に一致する。
- top/bottomも同様。
- stageがviewportより小さい軸はbase positionへ固定する。
- `calculateFitTransform()`の結果は最終的にpan boundsへ収める。

C108の`e456/e7/s12/w12`について、実際のimage/stage比率を使ったregression testを追加する。地図端が見えない問題をvisual impressionだけで完了判定しない。

### 4.5 管理画面はfull-screen surfaceを維持し、backgroundを完全遮蔽する

別URL/pageへの分離は行わない。理由は次の通り。

- 管理から`開く`、`編集`、GAS preview、delete dialogへ既存application stateを引き継ぎやすい。
- back/closeでmainへ即復帰できる。
- routingやcircle sessionを新page lifecycleへ分割する必要がない。

ただし「overlayに見えるが下層が覗く」状態は許容しない。

管理open時:

- background documentの現在scroll位置を保存する。
- `body`を固定し、main pageのscrollを停止する。
- management surfaceは`position: fixed; inset: 0; min-height: 100dvh`相当でopaque backgroundを持つ。
- `overscroll-behavior: contain`または対応環境で`none`を適用し、managementのscroll boundaryからbackgroundへscroll chainさせない。
- close時にbody styleを正確に復元し、元のscroll位置へ戻す。
- safe-areaを維持する。

focus/keyboard contractはPhase 7の`DialogFocusController`を維持する。

### 4.6 motion experimentは一つのCSSへ隔離する

新規:

`apps/webapp/css/motion.css`

Phase 7.1で追加する非必須motionをこのfileへ集約し、既存business CSSへanimation定義を散らさない。

候補motion:

1. Gallery初回swipe hint
   - 現在の文字間隔pulseだけでなく、カード/ミニプレビューが左右へ10〜16px移動して戻る。
   - 1〜2往復で停止し、3500msずっと動かし続けない。
   - hint textは残すためmotionがなくても意味が通る。
2. management open
   - contentのみ`opacity 0→1` + `translateY(8px→0)`、約180〜220ms。
   - background自体は瞬時にopaqueにし、下層を一瞬見せない。
3. management list→detail
   - mobileのみ短いhorizontal transition、約200〜240ms。
   - desktop 2-paneでは不要。
4. purchase/hold feedback
   - buttonまたは対象cardに短いscale/opacity feedback。操作完了を待たせない。
5. route marker emphasis
   - route変更時にS/G markerを一度だけ軽く強調する。current routeの常時loopはflow lineだけとする。
6. async completion
   - indicatorの退出を短いfadeにする。

`prefers-reduced-motion: reduce`では、継続loopや大きなtranslate/scaleを停止し、必要な場合はopacityだけへ縮小する。

### 4.7 管理画面をlist-detailへする

#### Mobile

第一層はevent/day listだけをscanしやすく表示する。

```text
管理                                      閉じる

C108
1日目                              使用中  ›
GAS / 配置シート1
532件  同期0件  お品書き521/532

2日目                                      ›
未設定
```

row全体または明示した`詳細`/chevronでdetailへ進む。5個のaction buttonを一覧rowに常時並べない。

detail:

```text
‹ イベント・日程
C108 / 1日目       使用中

データソース
  GAS / 配置シート1
  [再読込] [編集]

オフライン
  521 / 532 保存済み
  [オフライン準備]

GAS同期
  0件待ち
  [キューを確認]

巡回設定
  探索時間 3秒

データ管理
  [この日程のデータを削除]
```

未設定day detailではsource設定を主actionにする。

#### Desktop

同じ`EventDayManagementRow`とdetail modelを使い、左list / 右detailの2-paneを許可する。mobileと別business modelを作らない。

### 4.8 管理action ownership

既存event contractを維持する。

- `event-day-open-request`
- `event-day-refresh-request`
- `event-day-offline-request`
- `event-day-edit-request`
- `event-day-delete-request`

list/detail componentはrepository、network、cacheを直接触らない。BrowserApplication/application controllerが既存Use Caseへ接続する。

## 5. 非目標

- MapLibre/Leaflet等の地図libraryへ移行しない。
- canvas/WebGL rendererへ変更しない。
- route calculation algorithmを変更しない。
- full PWA化を追加しない。
- management専用routerやSPA frameworkを追加しない。
- motion libraryを追加しない。
- physics engineを追加しない。
- haptic/audio feedbackをPhase 7.1へ追加しない。
- animationのために新しいglobal state storeを作らない。

## 6. テスト戦略

### Unit

- route overlay structure。
- pan bounds。
- release velocity sampling。
- dtベースinertia。
- overscroll上限。
- settle完了とRAF停止。
- mobile/desktop management view state。

### E2E

- route flowのcomputed dash offsetが250〜400ms後に変わる。
- reduced motionではoffset animationが停止する。
-通常案内中に距離/次目的地の重複がない。
- e456等のwide mapで左右端へ到達できる。
- drag release後にinertiaが継続し、その後停止する。
- 管理open中にbody/backgroundがscrollしない。
- management surfaceの4辺からmain contentが見えない。
- mobile list→detail→back。
- desktop 2-pane。
- Gallery初回hint motionは一度だけで、再訪時は再表示しない。
- reduced motionで実験motionを停止/縮小する。

### Performance

Chrome DevTools相当のperformance traceまたはPlaywright/Performance APIで、map drag中にlayout readをpointermoveごとに繰り返していないことを確認する。animationは原則`transform`/`opacity`を使用する。

## 7. Phase受入条件

- no-preference環境でcurrent route flowが実際に時間変化して見える。
- reduced motionではroute flowのloopを止めても経路方向を理解できる。
- 通常案内中の次目的地・距離は一箇所を正本とし、上下で重複しない。
- C108各areaで地図の全端へ到達可能。
- bounds内panは1:1で軽く追従する。
- release後に自然なinertiaがあり、event frequencyへ依存しない。
- bounds外dragは限定的に柔らかく動くが、release後は必ず正しいboundsへ戻る。
- management open中に下層mainが見えず、background scrollも発生しない。
- motion experimentは`motion.css`中心に隔離され、個別削除しやすい。
- Gallery初回hintは実際のswipe方向をmotionで示す。
- mobile managementはevent/day list→detail構造になり、一覧rowへactionを過密配置しない。
- desktopでは同じmodelを2-paneで表示できる。
- 44px touch target、keyboard focus、safe-area、200% zoom、reduced-motionを維持する。
- `npm run verify`、`npm run test:e2e:ci`、`node scripts/audit-public-tree.mjs`、`git diff --check`が成功する。
