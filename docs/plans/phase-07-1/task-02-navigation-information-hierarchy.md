# Phase 7.1 Task 2: navigation summaryの情報重複解消

## 目標

通常案内中に地図の上下へ重複表示されているcurrent targetとroute distanceを整理し、地図上部summaryを通常案内の正本、下部sheetを対象詳細と操作の領域にする。同時に、candidateを選択した直後のpreview/loading/ready状態で候補identityが消えないようにする。

## 現行実装で特に注意する点

`DomRouteGuidanceView.showNavigation()`は、通常時には`currentTarget`を上部summaryへ表示する一方、別pinを選んだpreview状態では`selectedTarget`を`renderTargetDetails()`経由で`selected-target-space`、`target-dist`等へ表示している。

したがって`selected-target-space`、`target-dist`、`sub-target-space`を機械的に削除すると、comparisonへ進む前のcandidate space/distanceが文字情報として消える可能性がある。DOM削減より先に、各状態の表示責務を移す。

## やってはいけないこと

- `target-dist`等の利用箇所を検索せず削除しない。
- route distance計算、`physicalPixelLength`、`metersPerPixel`を変更しない。
- 通常案内、candidate preview/loading/ready、comparisonを同じ表示状態として扱わない。
- candidate identityをmap pinの色や位置だけに依存させない。
- responsive対応のため同じcurrent target/distanceをhiddenな二重DOMとして残さない。
- E2Eで特定idの削除だけを成功条件にし、実際の表示情報を検証しない。

## 対象ファイル

**変更候補:**
- `apps/webapp/index.html`
- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `tests/e2e/webapp.spec.ts`
- 既存のroute-guidance view/model testのうち表示責務を検証しているもの

`dom-route-map-view.ts`は候補表示のDOM所有者ではないため、map側の変更が必要な場合だけ触る。

## 表示契約

### 1. 通常案内中

上部summary:

```text
NEXT  東ア23a
FROM  東ア10     約84 m
```

狭いviewportではwrapしてよい。current target、start、current route distanceは同じsummary内に置く。

下部sheet:

- status/priority
- sheet/source由来の補助情報
- catalog/X link
- 購入済/保留action

下部sheetへ同じcurrent target、同じcurrent route distance、`次 -`等を重複表示しない。

### 2. candidate preview / loading / ready

別pinを選んだだけではcurrent routeはまだ変更しないため、上部summaryはcurrent target/start/current distanceを維持する。

候補操作領域では最低限次を文字で明示する。

```text
候補: 東ア31b
距離: 計算中 / 計算不可 / 約112 m
```

既存`.candidate-selection-label`等を再利用できるなら新しい大きなDOM構造を増やさず再利用する。candidateのpriority/catalog等を下部sheetで見せる既存UXは維持してよい。

### 3. comparison

`route-change-current*`と`route-change-candidate*`でcurrent/candidateのspace/distanceを並べる。この併記は比較のための情報であり、通常案内の重複とは扱わない。

cancel後は通常案内へ戻り、candidate用の文字情報を残さない。

## 手順

- [ ] **Step 1: read/write箇所を確認する**

最低限次を検索する。

```text
target-space-heading
target-start-space
target-route-log
selected-target-space
target-dist
sub-target-space
route-selection-controls
candidate-selection-label
route-change-current
route-change-current-distance
route-change-candidate
route-change-candidate-distance
```

DOM idを削除する前に、通常・preview・comparisonのどの状態で使われているかを表にする。

- [ ] **Step 2: 状態別RED E2Eを追加する**

通常案内:

- summary内にcurrent target/start/current distanceが見える。
- bottom sheet内には同じcurrent target/current distanceを重複表示しない。

candidate preview:

- summaryはcurrent targetのまま。
- candidate操作領域へcandidate spaceが見える。
- loading/readyに応じたcandidate distance/statusが見える。

comparison:

- current/candidate双方のspace/distanceが見える。
- cancel後に通常summaryへ戻る。

DOM idのcountではなく、各surfaceの可視textと状態遷移を主assertionにする。

- [ ] **Step 3: summaryをcurrent navigation専用へ整理する**

`target-route-log`へ`distance / 次 target`を詰め込む現行形式をやめ、current distanceを個別更新できる要素へ整理する。既存idを意味を変えず再利用できる場合は新idを増やさない。

- [ ] **Step 4: bottom sheetの通常時重複を除去する**

通常時だけの重複DOMを削除または役割変更する。candidate previewで必要な要素まで消さない。

`selected-target-space`等を削除する場合は、その前にcandidate previewのidentity/distance表示先を既存candidate controlsへ移す。

- [ ] **Step 5: view更新を状態別に明確化する**

current summaryの更新とcandidate detail/selectionの更新を混同しない。distance formatterは既存`formatRouteDistance()`または現在の既存formatterを再利用し、物理距離の算出方法を変えない。

- [ ] **Step 6: 320px幅・200% zoomを確認する**

current summary、candidate preview、comparisonの各状態で横scrollを要求せず、target/distanceが読めることを確認する。

- [ ] **Step 7: verification**

```bash
npm run test:webapp
npx playwright test tests/e2e/webapp.spec.ts --grep "次の目的地|距離|候補|経路"
npm run check:webapp
git diff --check
```

- [ ] **Step 8: commit**

実際に変更したDOM/view/test/CSSだけをstageする。

## 受入条件

- 通常案内のcurrent target/start/current distanceは上部summaryが正本になる。
- bottom sheetに同じcurrent target/current distanceを重複表示しない。
- candidate preview/loading/readyでは候補spaceと候補distance/statusが文字で分かる。
- comparison中だけcurrent/candidateのspace/distanceを併記する。
- candidate cancel後に通常表示へ戻る。
- 320px幅、200% zoomで横scrollを要求しない。
- purchase/hold、catalog link、candidate compare/confirm/cancelが回帰しない。
