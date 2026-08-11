# Phase 7.2 Task 3: 別目的地の青candidate routeとpreview強調

## 目標

地図上の別サークルpinをtapし、有効な`selectedRoute`が得られた時点で青candidate routeを表示する。「現在案内中の目的地」と「変更候補」を視覚的にも操作上も取り違えない状態にする。

## 現行実装で確認済みの原因

- `DomRouteMapView.renderNavigation()`はcandidate overlayを`selectionState === "comparing"`の時だけ描画している。そのため`ready`では`selectedRoute`があっても青線が出ない。
- `DomRouteGuidanceView.showNavigation()`は`selectedTarget.space !== currentTarget.space`を既に`isPreview`として判定し、候補詳細を表示している。新しいpublic state moduleを作らなくても同じ条件を再利用できる。
- 購入・保留buttonは現状`comparing`時だけdisabledである。
- `BrowserApplication.handleAction()`は`selectedDestination || currentDestination`をmutation対象にしている。このため`ready`の候補詳細を表示中に購入・保留を押すと、まだ確定していないcandidateへmutationが掛かり得る。

最後の点は青線表示より重大なので、このTaskで同時に直す。候補を選択しただけで購入・保留対象を変更しないという既存設計意図を本番経路とテストで証明する。

## やってはいけないこと

- `ready`を無理に`comparing`へ変更してdomain stateの意味を壊さない。
- candidate routeをcurrent routeとしてsessionへcommitしない。
- candidate tapだけで購入/保留対象をcandidateへ切り替えない。
- 表示上だけbuttonをdisabledにし、`BrowserApplication.handleAction()`の本番guardを残さない状態にしない。
- 青routeへcurrent routeと同じflow animationを付けない。candidateは静止でも識別できることを優先する。
- candidate表示のためにrouteを再計算し直さない。既存`selectedRoute`を使う。
- 一条件だけのために新しいpublic interface/moduleを必須化しない。

## 対象ファイル

**変更:**
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/app/browser-application.ts`
- `apps/webapp/css/target.css`
- `apps/webapp/css/motion.css`（候補強調にmotionを追加する場合）
- `tests/e2e/webapp.spec.ts`
- `tests/route-overlay-contract.test.ts`
- `tests/browser-application.test.ts`または`handleAction()`を既に本番assembly込みで検証している最も近い既存test

**原則作成しない:**
- `route-preview-state.ts`
- `tests/route-preview-state.test.ts`

既存の`isPreview`相当条件を2箇所以上で重複させることで実際に不整合が生じる場合に限り、private/pure helperへの抽出を許可する。その場合も新しい公開domain contractにはしない。

## candidate route表示条件

candidate overlayは次の全条件を満たす場合に描画する。

```text
selectedTarget.space != currentTarget.space
selectedRoute != null
selectionState が ready または comparing
```

次では描画しない。

```text
idle / loading / calculating / error
selectedTarget == currentTarget
selectedRoute == null
```

`DomRouteMapView.renderNavigation(context)`ではcurrent overlayを先に描画し、candidate overlayを後に描画する。既存`route-overlay-candidate`を再利用し、別のroute rendererを作らない。

## 候補表示と操作guard

候補目的地がcurrent目的地と異なる間は、まだ目的地変更が確定していない。

固定する外部挙動:

- 候補詳細とcandidate routeは表示してよい。
- `経路を比較`、`閉じる`、比較後のconfirm/cancelは既存flowを維持する。
- 購入・保留buttonは候補選択中にはdisabledにする。対象は`ready`だけでなく、currentとselectedが異なる`loading`/`calculating`/`error`を含め、候補選択が残っている状態全体とする。
- `BrowserApplication.handleAction()`も同じ意味のdefensive guardを持ち、DOM disabledを回避して直接呼ばれてもcandidateへmutationしない。
- 通常案内で候補が無い時だけ、購入・保留は`currentDestination`へ作用する。
- candidate confirm後はそのcandidateが新しい`currentDestination`になるため、通常どおり購入・保留できる。

`handleAction()`はmutation targetとして`selectedDestination || currentDestination`を使わず、候補選択中でないことを確認した上で`currentDestination`だけを使う。

## preview表示

既存`targetSection.classList.toggle("candidate-selection", isPreview)`と候補操作領域を優先して再利用する。新しいclassを追加するのは、既存classではCSS責務が衝突する場合だけにする。

必要な見分け方:

- candidate target labelに`変更候補`と分かる文言。
- candidate target/detailへ青系outlineまたはbackground tint。
- current route/targetは赤/通常状態を維持。
- 候補を閉じる、またはconfirmしてcurrentへ昇格した後はcandidate overlayと候補強調を残さない。

追加motionは必須ではない。入れる場合は`motion.css`へ置き、`prefers-reduced-motion`では色とlabelだけで判別できるようにする。

## テスト方針

### 1. overlay contract

`DomRouteMapView`または既存route overlay testで次を固定する。

- `ready + selectedRoute + selected != current`でcandidate overlayが1件。
- `comparing`でも1件。
- same target / no route / loading / errorでは0件。
- current routeはcandidate表示中も残る。

未実装ならassertionで失敗するtestにする。class存在だけ、helper存在だけをRED証拠にしない。

### 2. mutation guard contract

`BrowserApplication`の本番`handleAction()`経路で次を確認する。

- current=`東ア01a`、selected=`東ア02a`、selection status=`ready`の時に`handleAction("purchase")`しても`completeCircleVisit`が呼ばれない。
- 同条件の`hold`も呼ばれない。
- candidateを閉じてselected=currentへ戻した後はcurrent spaceで呼ばれる。
- candidate confirm後は昇格したcurrent spaceで呼ばれる。

mock内だけの別handlerを検証せず、実際の`BrowserApplication.handleAction()`を呼ぶ。

### 3. DOM/E2E

Playwrightで:

1. current destinationを表示する。
2. 別pinをtapする。
3. candidate route計算完了を待つ。
4. 明示的な「経路を比較」を押す前に`.route-overlay-candidate .route-overlay-line`がvisibleになる。
5. 候補詳細に`変更候補`相当が見える。
6. 購入・保留buttonがdisabledである。
7. cancel/closeでcandidate overlayが0件、購入・保留が再び利用可能になる。
8. current routeは残る。

## 手順

- [ ] **Step 1: overlayのRED testを追加する**
- [ ] **Step 2: `ready`でも既存`selectedRoute`を描画する最小変更を行う**
- [ ] **Step 3: `handleAction()`のcandidate誤mutationを再現するRED testを追加する**
- [ ] **Step 4: `BrowserApplication.handleAction()`をcurrent-only + candidate guardへ修正する**
- [ ] **Step 5: `DomRouteGuidanceView`で候補選択中の購入・保留buttonをdisabledにする**
- [ ] **Step 6: 既存candidate UIを使って青系preview強調を実装する**
- [ ] **Step 7: E2Eでpin tapからclose/confirmまで本番flowを検証する**
- [ ] **Step 8: focused verification**

```bash
npx vitest run --root . tests/route-overlay-contract.test.ts tests/browser-application.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "候補|経路を変更"
npm run check:webapp
npm run test:webapp
git diff --check
```

既存testの実ファイル名が異なる場合は、Task開始時に`handleAction()`を直接検証している既存testを特定し、重複test fileを新設しない。

## 受入条件

- 別pin tap後、candidate route計算完了と同時に青線が見える。
- comparison confirm前でもcandidateがどこへ向かうか分かる。
- candidate detailをcurrent targetと見間違えにくい。
- 候補選択中の購入・保留はcandidateにもcurrentにも誤って実行されない。
- confirm後は新current、close/cancel後は元currentに対して通常操作できる。
- close/cancel/confirm後にcandidate overlayやpreview visualが残留しない。