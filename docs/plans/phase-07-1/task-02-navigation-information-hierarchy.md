# Phase 7.1 Task 2: navigation summaryの情報重複解消

## 目標

通常案内中に地図の上下へ重複表示されている`次の目的地`と`距離`を整理し、地図上部summaryを案内情報の正本、下部sheetを対象詳細と操作の領域にする。

## やってはいけないこと

- `target-dist`等のDOMを削除した結果、candidate route比較やresume flowが壊れないよう利用箇所を検索せず消さない。
- route distance計算方法、`physicalPixelLength`、`metersPerPixel`を変更しない。
- 通常案内中とcandidate比較中を同じ表示状態として扱わない。
- 目的地identityを完全に画面から消さない。
- responsive対応のために同一情報をdisplay:noneで二重DOM保持しない。正本DOMを一つにする。

## 対象ファイル

**変更:**
- `apps/webapp/index.html`
- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`または現在summary/sheet textを更新している既存view
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`（必要な場合のみ）
- `tests/e2e/webapp.spec.ts`
- `tests/route-guidance-*.test.ts`の該当view test

## 表示contract

### 通常案内中

上部summary:

```text
NEXT  東ア23a
FROM  東ア10     約84 m
```

狭いviewportでは2行以上へwrapしてよいが、`NEXT`、target space、`FROM`、start space、距離は同じsummary内に置く。

下部sheet:

- status label
- priority
- sheet/source由来の補助情報
- catalog/X link
- 購入済/保留action

通常案内中は下部へ同じtarget space、同じroute distance、`次 -`等の重複を表示しない。

### candidate選択中

candidate comparison surfaceでは現在routeと候補routeのspace/distanceを両方表示してよい。この比較情報は通常summaryの重複とは扱わない。

## 手順

- [ ] **Step 1: DOM利用箇所を検索して正本を確定する**

最低限次のidのread/write箇所を確認する。

```text
target-space-heading
target-start-space
target-route-log
selected-target-space
target-dist
sub-target-space
route-change-current
route-change-current-distance
route-change-candidate
route-change-candidate-distance
```

削除対象idがtest fixture、resume、candidate selectionから参照されている場合は、先に新しいsummary contractへ参照を移す。

- [ ] **Step 2: 通常案内中の重複を検出するRED E2Eを追加する**

通常current route表示後に、target spaceとdistanceの可視textがsummary側へ一意に存在することを確認する。

例:

```ts
const summary = page.locator(".navigation-summary");
await expect(summary).toContainText("東ア23a");
await expect(summary).toContainText(/約\s*\d+\s*m/);

const sheet = page.locator(".target-bottom-sheet");
await expect(sheet.locator("#target-dist")).toHaveCount(0);
await expect(sheet.locator("#sub-target-space")).toHaveCount(0);
```

DOMを残してhiddenにする設計にした場合は`toBeHidden()`ではなく、その必要性を説明できること。原則はDOM自体を整理する。

- [ ] **Step 3: summary markupを簡潔化する**

`index.html`の`.navigation-summary`を、target identity、start identity、physical distanceだけへ整理する。

既存`map-log`の`ROUTE`文字列に`distance / 次 target`を詰める形式は廃止する。距離専用elementをsummary内に置き、viewから個別更新できるようにする。

推奨id:

```html
<strong id="target-space-heading">---</strong>
<strong id="target-start-space">---</strong>
<strong id="target-distance-summary">距離 -</strong>
```

- [ ] **Step 4: bottom sheetから通常案内の重複DOMを除去する**

`selected-target-space`、`target-dist`、`sub-target-space`のうち通常案内だけに使われているものを削除する。candidate comparisonに必要な情報は`route-change-*`へ集約する。

下部sheetにtarget identityを補助的に残す必要がある場合も、上部と同じ大見出しとして二重表示せず、catalog metadataの一部として扱う。

- [ ] **Step 5: view updateを一つのsummary modelへ寄せる**

同一target/distanceを複数DOMへ書き込む処理を削除し、current navigation updateはsummaryの正本へ一回だけ書く。

distance formatterは既存`formatRouteDistanceMeters()`を再利用し、`約 N m`contractを維持する。

- [ ] **Step 6: candidate comparisonの回帰testを追加する**

候補pin選択時には、通常summaryを壊さず次を表示する。

```text
現在: 東ア23a / 約84 m
候補: 東ア31b / 約112 m
```

confirm/cancel後に通常summaryへ戻ることを確認する。

- [ ] **Step 7: responsive/200% zoomを確認する**

```bash
npx playwright test tests/e2e/webapp.spec.ts --grep "次の目的地|距離|候補|200%"
```

320px相当幅および200% zoomでsummaryが横overflowせず、targetとdistanceが読めることを確認する。

- [ ] **Step 8: verification**

```bash
npm run test:webapp
npx playwright test tests/e2e/webapp.spec.ts --grep "次の目的地|距離|候補"
npm run check:webapp
git diff --check
```

- [ ] **Step 9: commit**

```bash
git status --short
git add apps/webapp/index.html apps/webapp/css/target.css <実際に変更したroute-guidance view/test>
git diff --cached --name-status
git diff --cached --check
git commit -m "refactor(route-guidance): remove duplicate navigation summary"
```

## 受入条件

- 通常案内中のtarget spaceとroute distanceは地図上部summaryを正本とする。
- 下部sheetに同じ距離と`次`情報を重複表示しない。
- candidate比較中だけcurrent/candidateのspace/distanceを併記する。
- `formatRouteDistanceMeters()`を維持する。
- 320px幅、200% zoomで横scrollを要求しない。
- purchase/hold、catalog link、candidate confirm/cancelが回帰しない。
