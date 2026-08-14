# Phase 7.4 Task 24: 軽量な複数経路cueへ置換

## 目的

current routeのmoving cueを、長いSVG path全体の`stroke-dashoffset`更新から5個の軽量markerへ置換し、現状より速く方向を読み取れる表示とAndroidでのmap gesture性能を両立する。

## 対象外

- candidate routeを動かすこと。
- route探索、Dijkstra、ALNSの変更。
- 毎frameのroute再計算、SVG再生成、card再描画。
- 外部motion libraryの追加。

## 前提と依存関係

Task 23完了。motionの開始可否はTask 23の`RouteMotionPreference`だけから決める。

## 読むべき文書と既存実装

- `docs/specs/2026-08-14-phase-07-4-motion-and-map-workspace-redesign.md`
- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts`
- `apps/webapp/js/features/route-guidance/ui/route-motion-metrics.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/utils/gesture-zoom-controller.js`
- `tests/route-motion-metrics.test.ts`
- `tests/route-overlay-contract.test.ts`
- `tests/gesture-zoom-controller.test.ts`
- route animation関連E2E

## 対象ファイル

### 新規作成

- `apps/webapp/js/features/route-guidance/ui/route-motion-controller.ts`
- `tests/route-motion-controller.test.ts`

### 変更

- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts`
- `apps/webapp/js/features/route-guidance/ui/route-motion-metrics.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/utils/gesture-zoom-controller.js`
- `tests/route-motion-metrics.test.ts`
- `tests/route-overlay-contract.test.ts`
- `tests/gesture-zoom-controller.test.ts`
- `tests/e2e/webapp.spec.ts`

### 削除

現行full-path motion専用CSS/DOMは、新controllerへ完全移行できた範囲で削除する。静的base route、candidate route、S/G、static direction cueは削除しない。

## 追加するインターフェース

`route-motion-controller.ts`は単一のanimation loopだけを所有する。

```ts
export interface RouteMotionControllerOptions {
  cueCount: 5;
  speedScreenPxPerSecond: number;
  requestFrame: typeof requestAnimationFrame;
  cancelFrame: typeof cancelAnimationFrame;
}

export interface RouteMotionController {
  setRouteGeometry(samples: readonly { x: number; y: number; distance: number }[]): void;
  setEnabled(enabled: boolean): void;
  setGestureActive(active: boolean): void;
  start(): void;
  stop(): void;
  dispose(): void;
}
```

実装はroute変更時にgeometryを一度sampleし、frameではphaseから5個の位置を補間して既存cue elementの`transform`だけを更新する。cue DOMをframeごとに作り直さない。

目標値は`cueCount=5`、画面速度約`160px/s`とする。テストで140〜180px/s程度の許容幅を持たせてもよいが、現行約96px/sへ戻らないことを固定する。

`GestureZoomController`へ次のoptional callbackを正式に追加する。

```js
onGestureActivityChange?.(active)
```

pointer drag開始またはpinch開始で`true`、慣性を含む操作が完全終了した時だけ`false`を一度通知する。既存`onTransformChange`は座標通知のまま維持し、第二のgesture state machineを作らない。

## 実装手順

1. controller unit testで5個のcue、start→goal方向、160px/s相当、enable/off、gesture pause/resumeをREDにする。
2. `gesture-zoom-controller.test.ts`でpointer/pinch/慣性のactivity callback契約をREDにする。
3. E2Eで現行full-path `.route-flow-line`だけを証拠にせず、current routeに5個のcue nodeが存在し、時間経過で複数cueの位置が前進するassertionをREDにする。
4. route geometryをroute変更時に一度sampleするhelper/controllerを実装する。`getTotalLength/getPointAtLength`を使う場合もframe中に全route sampleをやり直さない。
5. `route-overlay-svg.ts`を静的赤base + static direction + S/G + cue hostという構造へ変更する。candidateは青い静的pathだけ。
6. `target.css`からfull-path `stroke-dashoffset`を主motionとして使う契約を外し、cue自体は小さく高コントラストな白markerにする。
7. `DomRouteMapView`でroute/pref/document visibilityに応じcontrollerを開始停止する。Task 23の`always`は`prefers-reduced-motion`がreduceでもcontrollerを有効化する。
8. `GestureZoomController.onGestureActivityChange`を接続し、pan/pinch/慣性中はcue frame更新を止め、完全終了後だけ再開する。
9. mutation proofとしてcue countを1、速度を旧96付近、gesture pauseを削除した各変更で専用testがREDになることを確認して戻す。
10. E2Eでcandidateが動かないこと、`off`で完全停止すること、`system+reduce`で停止することも確認する。

## テスト方針

「animation objectが存在する」だけでは合格しない。5個の異なるcueが時間経過でstart→goalへ前進すること、frame更新でroute DOM数が増えないこと、gesture中にcontrollerが更新を停止することを証明する。

性能の最終判定はTask 27のMotorola実機で行う。headless traceだけで「軽い」と断定しない。

## 検証コマンド

```bash
npx vitest run --root . tests/route-motion-controller.test.ts tests/route-motion-metrics.test.ts tests/route-overlay-contract.test.ts tests/gesture-zoom-controller.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "animation|motion|経路|ズーム|ドラッグ"
npm run check:webapp
npm run test:webapp
npm run build:webapp
git diff --check
```

## 受入条件

- current routeに5個の白いmoving cueが見える。
- cueの画面上速度は約160px/sで、現行より明確に速い。
- cueはstart→goalへ流れる。
- candidateは静的青線のまま。
- frameごとにroute探索、SVG再生成、cue DOM再生成をしない。
- gesture中はmotion更新を止め、map transformを優先する。
- `system/always/off`がTask 23の意味どおり動く。
- Task 27でMotorola Animator=0 + `always`を実機確認できる構造になっている。

## 予定コミットメッセージ

```text
fix(webapp): use lightweight route motion cues
```
