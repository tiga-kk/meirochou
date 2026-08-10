# Phase 6.1 Task 5: m距離、Start/Goal、軽量route flowを追加

## 目標

Route Guidanceの距離を物理mで表示し、地図だけを一目見てもStart/Goalと進行方向を理解できるようにする。manual grid startでも必ず見えるroute endpoint markerと、current routeへのCSS/SVGだけの軽量flow animationを追加する。

## やってはいけないこと

- `RouteResult.cost`をmとして表示しない。
- crowded multiplierを物理距離へ掛けない。
- 根拠のない`metersPerPixel`を作らない。
- animationのためにJS RAF/timerを追加しない。
- route geometryをanimationのために毎frame再生成しない。
- 既存circle pinの存在をStart表示の前提にしない。manual grid startではcircle pinが存在しないためである。
- 色だけでStart/Goalを区別しない。
- reduced-motion利用者へ強制animationしない。

## Files

**Modify:**
- `apps/webapp/map-bundles/C108/manifest.json`
- `apps/webapp/js/features/event-day/domain/application-contract-types.ts`
- `apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts`
- `apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader.ts`
- `apps/webapp/js/features/route-guidance/domain/routing/grid-route-types.ts`
- `apps/webapp/js/features/route-guidance/domain/routing/grid-route-planner.ts`
- `apps/webapp/js/features/route-guidance/ui/route-guidance-screen-model.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts`
- `apps/webapp/css/target.css`

**Test:**
- `tests/boundary-parsers.test.ts`
- `tests/map-manifest-loader.test.ts`
- `tests/route-overlay-contract.test.ts`
- `tests/route-guidance-screen-model.test.ts`
- `tests/task10-demo-route-regression.test.mjs`
- `tests/e2e/webapp.spec.ts`

## Interfaces

C108 source manifest contractとruntime manifest contractの双方へscaleを通す。

```ts
export interface EventMapAreaManifest {
  readonly areaId: string;
  readonly displayName: string;
  readonly metersPerPixel: number;
  readonly assets: MapAssetPaths;
}

export interface MapBundleAreaV1 {
  // existing properties
  readonly metersPerPixel: number;
}
```

`parseEventMapBundleManifest()`は`metersPerPixel`がfiniteかつ`> 0`であることをvalidationする。`toRuntimeMapBundleManifest()`はsource manifestの値をそのままruntime areaへ渡す。C108だけ別のhard-coded scale tableを`http-map-manifest-loader.ts`へ作らない。

Routing resultは探索costとunweighted lengthを分離する。

```ts
export interface RouteResult {
  cost: number;                 // existing weighted routing cost
  physicalPixelLength: number;  // unweighted path length in source-image pixels
  // existing fields...
}
```

UI helper:

```ts
export function formatRouteDistanceMeters(
  physicalPixelLength: number,
  metersPerPixel: number | null,
): string;
```

Current route SVGはordered `route.points`の先頭/末尾からendpoint markerを作る。

```text
route.points[0]                       => S marker
route.points[route.points.length - 1] => G marker
```

これにより`planRouteFromGridIndex()`のmanual startでもSを描画できる。既存`.map-pin.start`の有無へ依存しない。

## Steps

- [ ] **Step 1: C108 scaleの根拠をrepository/historyから確定する**

各`e456/e7/s12/w12`について、地図生成時に使った「画像長辺と会場実距離」の対応、または同等の既知scale資料を確認する。

完了条件は、各areaについて次の記録をTask commitまたは同Taskのdocs補足へ残せること。

```text
areaId
evidence source
source-image pixels
corresponding physical meters
metersPerPixel = meters / pixels
```

4 areaのいずれかで根拠が確認できない場合、このTaskは`BLOCKED: physical scale evidence missing`として停止する。数値を推測して先へ進まない。

- [ ] **Step 2: manifest validationのRED testを書く**

`tests/boundary-parsers.test.ts`へ、C108 areaの`metersPerPixel`が欠落、0、負数、NaN相当の場合に拒否し、正のfinite値だけ通るtestを追加する。

`tests/map-manifest-loader.test.ts`では`toRuntimeMapBundleManifest()`後もareaのscaleが同値で残ることを固定する。

- [ ] **Step 3: weighted costとphysical lengthを分離するRED testを書く**

`tests/task10-demo-route-regression.test.mjs`または同routing moduleを直接扱う既存testへ、混雑cellを含むsame geometryで`cost > physicalPixelLength`になるcaseを追加する。

```ts
expect(route.cost).toBeGreaterThan(route.physicalPixelLength);
expect(route.physicalPixelLength).toBe(expectedUnweightedLength);
```

`planRoute()`と`planRouteFromGridIndex()`の双方へ同じpropertyが入ることを固定する。

- [ ] **Step 4: meter formattingのRED testを書く**

`tests/route-guidance-screen-model.test.ts`へformat helper contractを追加する。

```ts
expect(formatRouteDistanceMeters(800, 0.125)).toBe("距離 100 m");
expect(formatRouteDistanceMeters(800, null)).toBe("距離 -");
```

- [ ] **Step 5: endpoint markerとflow overlayのRED testを書く**

`tests/route-overlay-contract.test.ts`でcurrent routeにbase line、flow line、S marker、G markerがあることを固定する。manual startを表すrouteでもmarker座標は`route.points`から得るため同じcontractで動く。

```ts
expect(current.querySelector(".route-overlay-line")).not.toBeNull();
expect(current.querySelector(".route-flow-line")).not.toBeNull();
expect(current.querySelector(".route-start-marker")?.textContent).toBe("S");
expect(current.querySelector(".route-goal-marker")?.textContent).toBe("G");
expect(candidate.querySelector(".route-flow-line")).toBeNull();
```

- [ ] **Step 6: REDを確認する**

```bash
npx vitest run --root . \
  tests/boundary-parsers.test.ts \
  tests/map-manifest-loader.test.ts \
  tests/route-overlay-contract.test.ts \
  tests/route-guidance-screen-model.test.ts
node --test tests/task10-demo-route-regression.test.mjs
```

少なくともmanifest field欠落、`physicalPixelLength`欠落、flow/endpoint marker欠落で失敗することを確認する。

- [ ] **Step 7: route plannerでunweighted physical pixel lengthを計算する**

各edgeについて現行`edgeCost()`はweighted costへ使い続ける。physical lengthは同じcell transitionの`spec.cellSize`をcrowded multiplierなしで加算する。

開始/終了portalがcell centerと異なる場合は、`route.points`の連続点間のsource-image Euclidean lengthをphysicalPixelLengthの正本とする方がendpoint補正を自然に含められる。採用する計算は`planRoute()`と`planRouteFromGridIndex()`で共通helperへし、同じgeometryから同じ物理長が出るtestを追加する。weighted `cost`の既存計算は変更しない。

- [ ] **Step 8: source manifest/runtime contractへ`metersPerPixel`を追加する**

Task Step 1で根拠を確認した実数だけを`apps/webapp/map-bundles/C108/manifest.json`の各areaへ記載する。

`application-contract-types.ts`の`EventMapAreaManifest`と`MapBundleAreaV1`、`application-boundary-parsers.ts`のstrict parser、`http-map-manifest-loader.ts`の`toRuntimeMapBundleManifest()`を更新し、runtime `MapAreaCatalog`まで値を失わないようにする。

- [ ] **Step 9: UI距離をmへ変更する**

`route-guidance-screen-model.ts`のfallback grid-ish距離表示を、current routeがある場合は`physicalPixelLength * area.metersPerPixel`へ置き換える。比較画面のcurrent/candidate距離も同じformat helperを使う。

route未計算時の単純space差分をmとして偽装しない。physical route/scaleがない場合は`距離 -`または既存の`別エリア`表示を維持する。

- [ ] **Step 10: current route SVGへ専用S/G endpoint markerを追加する**

既存circle pinへ文字を載せるだけではなく、`route-overlay-svg.ts`でcurrent route geometryからmarkerを生成する。

```svg
<g class="route-endpoint route-start-marker" transform="translate(startX startY)">
  <circle />
  <text>S</text>
</g>
<g class="route-endpoint route-goal-marker" transform="translate(goalX goalY)">
  <circle />
  <text>G</text>
</g>
```

markerの中心は`route.points[0]`と`route.points.at(-1)`を使う。`startPosition`/`targetPosition`はpin配置用percent座標なので、SVG source-image viewBoxへ直接混ぜない。

既存map pinの色/stateは維持する。S/G overlayがpointer eventを奪わないよう`pointer-events:none`にする。

SVG全体を`aria-hidden`のままにする場合、route summary側の既存`FROM`/target textがStart/Goalのtextual equivalentになることをE2E/a11y testで確認する。視覚markerだけのためにSVGをinteractive accessibility treeへ追加しない。

- [ ] **Step 11: current routeへflow polylineを追加する**

base polylineと同じordered `points`を持つ`route-flow-line`を1本だけ作る。

```css
.route-flow-line {
  fill: none;
  stroke: rgba(255, 255, 255, 0.8);
  stroke-width: 4;
  stroke-linecap: round;
  stroke-dasharray: 18 46;
  animation: route-flow 1.1s linear infinite;
  pointer-events: none;
}

@keyframes route-flow {
  to { stroke-dashoffset: -64; }
}

@media (prefers-reduced-motion: reduce) {
  .route-flow-line { animation: none; }
}
```

実際のStart→Goal方向と逆に見える場合は`stroke-dashoffset`の符号だけを反転し、route pointsの順序をanimation都合で逆転させない。

- [ ] **Step 12: animation負荷を確認する**

Chrome DevToolsまたはPlaywright trace/manual profileで、route表示中にJS側のanimation RAF callbackが新規に継続実行されていないことを確認する。animationによるDijkstra/ALNS再実行、DOM再生成がないことをコードレビューでも確認する。

SVG stroke animationは毎frameのroute計算を発生させないが、ブラウザのpaint自体が完全に0になるとは仮定しない。実機profileで長いframeが増えていないことを確認する。

- [ ] **Step 13: E2E/visual確認**

`tests/e2e/webapp.spec.ts`で次を確認する。

- circle start routeとmanual grid start routeの双方でS/Gが見える。
- flow overlayが存在する。
- computed styleでanimation-nameが`route-flow`。
- `emulateMedia({ reducedMotion: "reduce" })`ではanimationが`none`。
- 距離が`距離 <integer> m`形式。
- candidate comparisonの青線は従来どおり識別できる。
- S/G markerがmap pin clickを妨げない。

- [ ] **Step 14: full verification**

```bash
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
git diff --check
```

- [ ] **Step 15: commit**

```bash
git add apps/webapp/map-bundles/C108/manifest.json \
  apps/webapp/js/features/event-day/domain/application-contract-types.ts \
  apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts \
  apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader.ts \
  apps/webapp/js/features/route-guidance/domain/routing/grid-route-types.ts \
  apps/webapp/js/features/route-guidance/domain/routing/grid-route-planner.ts \
  apps/webapp/js/features/route-guidance/ui/route-guidance-screen-model.ts \
  apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts \
  apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts \
  apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts \
  apps/webapp/css/target.css \
  tests/boundary-parsers.test.ts tests/map-manifest-loader.test.ts \
  tests/route-overlay-contract.test.ts tests/route-guidance-screen-model.test.ts \
  tests/task10-demo-route-regression.test.mjs tests/e2e/webapp.spec.ts
git commit -m "feat(route-guidance): show physical distance and route direction"
```

## 受入条件

- 4 areaすべてのscaleに根拠がある。根拠なしの推測値は0件。
- source manifest/parser/runtime areaの全層で`metersPerPixel`が一致する。
- routing costとphysicalPixelLengthが別propertyとして存在する。
- UI距離は整数m。
- circle start/manual grid startの双方でcurrent routeのStart/GoalがS/Gで識別できる。
- current routeだけにStart→Goal方向のflowがある。
- reduced-motionではflow animationが停止する。
- route animationのためのJS frame loopがない。
