# Phase 7.2 Task 3: alternate targetの青candidate routeとpreview強調

## 目標

地図上の別サークルpinをtapした直後、有効な`selectedRoute`が得られた時点で青candidate routeを表示し、「現在案内中の目的地」と「変更候補」を視覚的に取り違えないpreview stateを作る。

## 現状の原因

`RouteGuidanceSessionSnapshot.selectionStatus`は次を持つ。

```ts
type SelectionStatus =
  | "idle"
  | "loading"
  | "calculating"
  | "ready"
  | "comparing"
  | "error";
```

現在のmap viewはcandidate overlayを`selectionState === "comparing" && selectedRoute`に限定している。そのためpin tap後に`ready`となり確認UIが出ても、比較操作前は青線が出ない。

## やってはいけないこと

- `ready`を無理に`comparing`へ変更してdomain stateの意味を壊さない。
- candidate routeをcurrent routeとしてsessionへcommitしない。
- candidate tapだけで購入/保留対象をcandidateへ切り替えない。
- 青routeへcurrent routeと同じflow animationを付けない。candidateは静止でも識別できることを優先する。
- candidate表示のためにrouteを再計算し直さない。既存`selectedRoute`を使う。

## 対象ファイル

**作成:**
- `apps/webapp/js/features/route-guidance/ui/route-preview-state.ts`
- `tests/route-preview-state.test.ts`

**変更:**
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `apps/webapp/css/target.css`
- `apps/webapp/css/motion.css`
- `tests/e2e/webapp.spec.ts`
- `tests/route-overlay-contract.test.ts`

## pure preview state contract

```ts
import type {
  RouteGuidanceSessionSnapshot,
  SelectionStatus,
} from "../domain/route-guidance-types";

export interface RoutePreviewVisualState {
  readonly showCandidateRoute: boolean;
  readonly showCandidateEmphasis: boolean;
  readonly candidateSpace: string | null;
}

export function buildRoutePreviewVisualState(input: {
  currentSpace: string | null;
  selectedSpace: string | null;
  selectedRoutePresent: boolean;
  selectionStatus: SelectionStatus;
}): RoutePreviewVisualState;
```

固定規則:

```text
ready + selectedRoute + selected != current       => show
comparing + selectedRoute + selected != current   => show
loading/calculating/error/idle                     => hide
selected == current                                => hide
selectedRoute == null                              => hide
```

`ready`は「candidate routeを見せられる状態」として扱い、`comparing`は比較confirmationの追加UI状態として扱う。

## map render contract

`DomRouteMapView.renderNavigation(context)`はcandidate visibilityの判定を文字列比較で直接持たず、pure helperへ渡す。

概念コード:

```js
const preview = buildRoutePreviewVisualState({
  currentSpace: currentTarget?.space ?? null,
  selectedSpace: selectedTarget?.space ?? null,
  selectedRoutePresent: Boolean(selectedRoute),
  selectionStatus: selectionState,
});

this.renderRouteOverlay(currentRoute, "current");
if (preview.showCandidateRoute && selectedRoute) {
  this.renderRouteOverlay(selectedRoute, "candidate");
}
```

## preview visual

candidate preview中だけ`#next-target`へ次のclassを付ける。

```text
is-route-previewing
```

表示は過剰なmodal化をせず、次を使う。

- candidate target labelの左に`変更候補` badge。
- candidate target/cardへ青系outline/background tint。
- 150〜220ms程度の`opacity + translateY(4px)`またはoutline pulseを1回。
- current route/targetは赤/通常状態を維持。
- confirmation cancelでclass/badge/blue overlayを同時に消す。

animationは`motion.css`へ置き、`prefers-reduced-motion`ではtransitionなしで色/labelだけ残す。

## 手順

- [ ] **Step 1: RED unit testを書く**

```ts
expect(buildRoutePreviewVisualState({
  currentSpace: "東ア01a",
  selectedSpace: "東ア02a",
  selectedRoutePresent: true,
  selectionStatus: "ready",
}).showCandidateRoute).toBe(true);
```

`comparing=true`、same-target=false、no-route=false、loading=falseも固定する。

- [ ] **Step 2: unit testのREDを確認する**

```bash
npx vitest run --root . tests/route-preview-state.test.ts
```

- [ ] **Step 3: pure helperを実装する**

- [ ] **Step 4: map viewをhelperへ接続する**
  - current overlayを先に描画。
  - candidate overlayを後に描画し、青線が見えるz-orderを維持。

- [ ] **Step 5: DOM preview emphasisのRED testを追加する**
  - `ready`で`is-route-previewing`。
  - `変更候補`表示。
  - cancel/confirm後に消える。

- [ ] **Step 6: preview styling/motionを実装する**

- [ ] **Step 7: E2Eをfield flowへ変更する**

Playwrightで:

1. current destinationを表示。
2. 別pinをtap。
3. 「経路を変更しますか？」またはselection UIが出る。
4. 明示的な「経路を比較」buttonを押す前に、`.route-overlay-candidate .route-overlay-line`がvisible。
5. computed strokeがprimary/blue系。
6. cancelでcandidate overlayが0件。
7. current routeは残る。

- [ ] **Step 8: verification**

```bash
npx vitest run --root . tests/route-preview-state.test.ts tests/route-overlay-contract.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "候補|経路を変更"
npm run check:webapp
npm run test:webapp
git diff --check
```

## 受入条件

- 別pin tap後、candidate route計算完了と同時に青線が見える。
- comparison confirm前でもcandidateがどこへ向かうか分かる。
- visual emphasisによりcandidate detailをcurrent targetと見間違えにくい。
- cancel/confirm後にpreview visualが残留しない。