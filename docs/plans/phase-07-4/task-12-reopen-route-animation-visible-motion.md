# Phase 7.4 タスク12: 経路アニメーションを実描画・方向認識基準で再診断

## 目的

Phase 7.1以降、自動テストでは繰り返しPASSしたのに人間には見えなかったcurrent route animationについて、単なるCSS値の時間変化ではなく、**本番animationが実際に駆動していること、画面上で意味のある移動が生じること、その移動が始点から終点への方向として読めること**を別々に証明し、実画面で進行方向を認識できる状態へ修正する。

このTaskでは「テストがGREENだから実装済み」と誤判定しないことを最優先する。animation削除・逆方向化・透明化の3種類の故障を一時的に注入し、主要テストがそれぞれREDになることまで証明する。

## このTaskで解消する既知の弱点

現行実装はcurrent routeへ`pathLength="100"`を設定し、`stroke-dasharray: 32 68`、`stroke-dashoffset: -100`、`0.9s`固定でmoving cueを動かしている。stroke幅をscreen-space化しても、cue長と速度はroute全長とzoomに対して安定する契約になっていない。

現行テストには次の抜け道がある。

- `animation-name`と`strokeDashoffset`変化だけでは、透明なmoving cueでもPASSできる。
- offsetが変化するだけでは、start→goalと逆方向でもPASSできる。
- テスト自身が`strokeDashoffset`を書き換えて二位相を作ると、本番animationがなくても画像差を作れる。
- `tests/route-overlay-contract.test.ts`の`dash >= 28`のような固定CSS値assertionは、人間が読めるscreen-space契約ではなく、過去の数値調整を固定してしまう。

## 対象外

- candidate routeへのloop animation復活。
- `prefers-reduced-motion: reduce`を無視してanimationを強制すること。
- JavaScript `setInterval`、独自`requestAnimationFrame` animation loop、毎frame SVG再生成。
- 原因未確認のままdash長・色・durationだけを繰り返し調整すること。
- animation検証専用のproduction test hookや公開API。
- 新しいmotion library、画像比較library。
- Dijkstra、ALNS、route points生成規則の変更。

## 前提と依存関係

Task 11完了後のzoom transform通知とzoom連動線幅を基準にする。

Task 11で確定したtransform通知を唯一のzoom state入力とする。Task 12のために別のpointer listener、別のzoom observer、常駐timerを追加しない。

## 読むべき文書と既存実装

- `docs/reviews/phase-07-4-route-animation-diagnosis.md`
- `docs/reviews/phase-07-4-human-acceptance-failures.md`
- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/domain/routing/grid-route-types.ts`
- `apps/webapp/js/features/route-guidance/domain/routing/grid-route-planner.ts`
- `apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `tests/route-overlay-contract.test.ts`
- `tests/e2e/webapp.spec.ts`

## 対象ファイル

### 新規作成

- `apps/webapp/js/features/route-guidance/ui/route-motion-metrics.ts`
- `tests/route-motion-metrics.test.ts`

### 変更

- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts`（既存dash方式では方向を証明できずcue primitiveを変える場合のみ）
- `tests/route-overlay-contract.test.ts`
- `tests/e2e/webapp.spec.ts`

### 作成候補

- animation focused E2Eを既存fileへ自然に置けない場合のみ`tests/e2e/route-animation.spec.ts`

### 削除

なし。

## 確定するscreen-space計算interface

`route-motion-metrics.ts`へDOM非依存の純粋関数を置く。

```ts
export interface RouteMotionMetricsInput {
  sourceRouteLengthPx: number;
  imageWidth: number;
  renderedWidth: number;
  zoomScale: number;
}

export interface RouteMotionMetrics {
  screenRouteLengthPx: number;
  cueScreenLengthPx: number;
  cuePathLengthUnits: number;
  gapPathLengthUnits: number;
  durationMs: number;
  speedScreenPxPerSecond: number;
}

export function calculateRouteMotionMetrics(
  input: RouteMotionMetricsInput,
): RouteMotionMetrics | null;
```

`sourceRouteLengthPx`には既存`RouteResult.physicalPixelLength`を使う。これはrouting側ですでにordered route pointsから計算済みであり、このTaskで再計算方式を増やさない。

初期設計値は次を使用する。

```ts
const TARGET_CUE_SCREEN_PX = 24;
const MAX_CUE_ROUTE_FRACTION = 0.4;
const TARGET_SPEED_SCREEN_PX_PER_SECOND = 96;
const MIN_DURATION_MS = 600;
```

計算規則は次とする。

```ts
const screenRouteLengthPx =
  sourceRouteLengthPx * (renderedWidth / imageWidth) * zoomScale;

const cueScreenLengthPx = Math.min(
  TARGET_CUE_SCREEN_PX,
  screenRouteLengthPx * MAX_CUE_ROUTE_FRACTION,
);

const cuePathLengthUnits =
  (cueScreenLengthPx / screenRouteLengthPx) * 100;

const gapPathLengthUnits = 100 - cuePathLengthUnits;

const durationMs = Math.max(
  MIN_DURATION_MS,
  (screenRouteLengthPx / TARGET_SPEED_SCREEN_PX_PER_SECOND) * 1000,
);
```

入力が非有限、0以下、または計算結果が非有限なら`null`を返す。invalid inputを推測値で補完しない。

数値は人間受入の結果で変更してよいが、**route全長の固定割合と固定durationへ戻してはならない**。変更時もscreen-spaceのcue長・速度という契約を維持する。

## 実装手順

### 1. 先に純粋関数のREDを作る

`tests/route-motion-metrics.test.ts`を新規作成し、production実装前にREDを確認する。

最低限次をテストする。

```ts
it("keeps cue length near screen-space target across route lengths", () => {
  // 同じrenderedWidth/zoomでsource route長だけを大きく変える。
  // 十分長いroute同士ではcueScreenLengthPxが24px付近に留まること。
});

it("keeps screen speed stable when zoom changes", () => {
  // scale=1とscale=4でdurationがrouteのscreen長に追従し、
  // speedScreenPxPerSecondが96px/s付近に留まること。
});

it("rejects invalid geometry", () => {
  // imageWidth=0、renderedWidth=0、NaN等でnull。
});
```

ここで`dash >= 28`のようなstylesheet定数assertionを新しい受入契約へ持ち込まない。

### 2. `calculateRouteMotionMetrics()`を最小実装する

上記interfaceと計算規則だけを実装し、unit testをGREENにする。

route planner、SVG DOM、GestureZoomControllerをこの純粋関数へimportしない。

### 3. production CSS animationの存在と自然進行を証明する

Playwrightで`page.emulateMedia({ reducedMotion: "no-preference" })`を明示し、`matchMedia('(prefers-reduced-motion: reduce)')`がfalseであることを確認する。

current moving cueについて`element.getAnimations()`からproduction stylesheetによって接続された`CSSAnimation`を取得する。

テストから`strokeDashoffset`、`animation`、`animation-name`、keyframes、classを上書きせず、通常再生のまま実時間を進めて次を確認する。

- 対象`CSSAnimation`が1件以上存在する。
- `CSSAnimation.currentTime`が自然に増える。
- productionのvisual stateが時間変化する。

computed `strokeDashoffset`変化は診断材料として残してよいが、それだけをGREEN条件にしない。

### 4. deterministic raster testはproduction animationをseekする

手順3で取得した**同じproduction `CSSAnimation` instance**をpauseし、`currentTime`だけを二つの位相へ変更して同じroute overlay clipを撮影する。

禁止事項:

- cue要素へ`strokeDashoffset`を直接設定する。
- inline `animation` / `animation-name`を注入する。
- テスト専用keyframes/classを追加する。
- 本番に存在しないmoving elementを追加する。

二位相のPNGはraw buffer不一致や`changedPixels > 0`だけで合格させない。同一位相を二回撮る負の対照を用意し、cross-phase差分がsame-phase noiseを十分上回ることを固定fixtureでassertする。

新しい画像比較dependencyは追加しない。Playwright screenshotとNode/browser標準機能で処理する。

### 5. current overlayへscreen-space parameterを接続する

`DomRouteMapView`にcurrent routeのmotion contextを保持する。

```ts
currentRouteMotionContext: {
  route: RouteResult;
  overlay: SVGSVGElement;
} | null
```

current routeを描画した直後にcontextを保存し、Task 11の`handleMapTransformChange({ scale })`から次を呼ぶ。

```ts
applyCurrentRouteMotionMetrics(scale: number): void
```

`applyCurrentRouteMotionMetrics()`は次だけを行う。

1. `route.physicalPixelLength`を読む。
2. `route.image.width`を読む。
3. 既存stageのrendered widthを使う。Task 11のpointermove hot pathへ新しいlayout readを追加しないため、layout確定時に既に分かる幅を保持して再利用する。
4. `calculateRouteMotionMetrics()`を呼ぶ。
5. current overlayへCSS custom propertyを設定する。

CSS custom property名は次で固定する。

```css
--route-flow-cue-length
--route-flow-gap-length
--route-flow-duration
```

CSS側は例えば次の責務だけを持つ。

```css
.route-flow-comet,
.route-flow-line {
  stroke-dasharray:
    var(--route-flow-cue-length)
    var(--route-flow-gap-length);
  animation-duration: var(--route-flow-duration);
}
```

JavaScriptはanimation frameを進めない。route描画時・layout変更時・Task 11から通知されたzoom state変更時にparameterを更新するだけとする。

### 6. directionをrendered cueと結び付けて証明する

ordered `route.points`の先頭をstart、末尾をgoalとする。

二つ以上のproduction animation phaseについて、rendered cueの強調位置または先行部分がstart側からgoal側へ進むことをassertする。

禁止する弱い証明:

```text
strokeDashoffsetの値が変わった
AND
route.points[0]とroute.points.at(-1)が存在する
THEREFORE direction OK
```

この二つを別々にassertしただけでは方向を証明した扱いにしない。

既存dash方式でrendered cueの進行方向を安定して自動判定できない、またはraster motionが存在してもheadedで方向を読めない場合は、テストを弱めず、一意な先頭を持つ短いpulse等の非対称cueへ変更する。新しいmotion libraryやJS frame loopは使わない。

### 7. 3種類のmutation proofを必ず実行する

最終GREEN後、commit前にproductionを一時的に壊し、focused testの証明力を確認する。mutation差分はcommitしない。

#### Mutation A: animation削除

一時的にcurrent moving cueの`animation`を`none`へする。

期待結果:

- production `CSSAnimation`存在/自然進行testがRED。
- raster motion testもRED。

lintやselector消失だけを失敗理由にしない。

#### Mutation B: 逆方向

production keyframesの進行方向だけを反転する。moving cueは存在し、raster motionも残す。

期待結果:

- animation存在testはGREENのままでよい。
- raster motion testもGREENのままでよい。
- **start→goal direction testだけは必ずRED**。

これがREDにならない場合、方向testは未実装とみなす。

#### Mutation C: 透明化

moving cueのstrokeを一時的に`transparent`または`stroke-opacity: 0`へする。animation自体は残す。

期待結果:

- production animation存在/自然進行testはGREENのままでよい。
- **raster visibility/motion testは必ずRED**。

これがREDにならない場合、pixel testは人間に見える描画を証明していない。

3 mutationを元へ戻した後、同じfocused suiteを再実行してGREENへ戻ることを確認する。

### 8. `route-overlay-contract.test.ts`の古い固定値契約を置換する

次の種類のassertionを削除または縮小する。

```text
moving dash length >= 28
特定のdasharray文字列でなければならない
特定のduration定数でなければならない
```

残してよいのは構造契約である。

- currentだけmoving cueを持つ。
- candidateはloop moving cueを持たない。
- current routeのordered pointsとS/G契約が壊れていない。
- reduced-motion用の静的direction cueを構築できる。

cue長・速度は`tests/route-motion-metrics.test.ts`とE2Eのscreen-space契約で証明する。

### 9. reduced motionと性能契約を維持する

`reduce`ではmoving animationを停止し、base path、S/G、静的direction cueを残す。

animation中およびzoom中に次を増やさない。

- route planning回数。
- Dijkstra / ALNS実行回数。
- `buildRouteOverlaySvg()`生成回数。
- animation frameごとのDOM node再生成。

Task 11のtransform callback頻度を超える新しい同期処理を追加しない。

### 10. C108実routeでheaded証拠を残す

自動検証後、C108 public map bundleの実routeを通常再生し、初期表示と少なくとも一つの拡大状態で進行方向を目視する。

raster testがGREENでも、人間が方向を読めなければTask 12のvisual問題は未解決とする。その場合、同じdash定数調整を繰り返さず、手順6の非対称cueへ切り替える。

headed screenshotや動画を生成しただけでは受入済みにしない。最終的な人間受入はTask 18で行う。

## テスト方針

focused suiteは最低限、次を独立に証明する。

- **screen-space計算**: route長・zoomが変わってもcue長と速度が画面座標基準へ保たれる。
- **本番接続**: production cueへ実際の`CSSAnimation`が接続され、自然進行する。
- **実描画**: production animationをseekした二位相でsame-phase noiseを超えるraster差がある。
- **方向**: rendered cueがordered routeのstart→goal方向へ進む。
- **Mutation A**: animation削除で自然進行/raster testがRED。
- **Mutation B**: 逆方向化でdirection testがRED。
- **Mutation C**: 透明化でraster testがRED。
- candidateにはloop moving cueがない。
- reduceではmoving cue停止、base/static cue可視。
- animationに伴いroute SVG node数やroute計算回数が増えない。

## 検証コマンド

```bash
npx vitest run --root . \
  tests/route-motion-metrics.test.ts \
  tests/route-overlay-contract.test.ts

npx playwright test tests/e2e/webapp.spec.ts --grep "アニメーション|moving|経路"

npm run check:webapp
git diff --check
```

focused E2Eを`tests/e2e/route-animation.spec.ts`へ分離した場合は、そのfileを上記Playwright commandへ明示する。

mutation確認では各mutationごとに「どのtest名が、どの意味的assertionでFAILしたか」を実装記録へ残す。単にcommand exit codeだけを記録しない。

## 受入条件

- fixed `32 68 / 0.9s`を最終契約として残していない。
- `dash >= 28`等の固定CSS値を人間視認性の証拠にしていない。
- no-preference環境でproduction `CSSAnimation`が通常再生中に自然進行する。
- production animationをseekしたraster testが、same-phase noiseではなく本番moving cueの画面上変化を証明する。
- cue長と速度がroute全長・zoomへ無制限に比例せず、screen-space基準で計算される。
- rendered cueがstart→goal方向へ進むことを自動検証できる。
- animation削除mutationで主要motion testがREDになる。
- 逆方向mutationでdirection testがREDになる。
- 透明化mutationでraster visibility testがREDになる。
- 3 mutation復元後に同じfocused suiteがGREENへ戻る。
- moving cueがcurrent routeだけに存在する。
- reduced motion契約を壊していない。
- route再計算、毎frame SVG再生成、独自JS animation loopを追加していない。
- Task 18で人間が通常再生を見てstart→goal方向を認識できるまでPhaseを終了しない。

## 予定コミットメッセージ

```text
fix(phase-07-4): make route motion perceptible and testable
```
