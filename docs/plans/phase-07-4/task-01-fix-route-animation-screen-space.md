# Phase 7.4 タスク1: 経路animationのscreen-space診断と確実な修正

## 目的

current routeのanimationが「CSS上では動くが実機では方向を認識しにくい」状態を再現・計測し、screen-spaceで視認できる最小修正を行う。candidate routeへ広がったloop animationも表示契約に合わせて整理する。

## 対象外

- Dijkstra / ALNSの変更。
- JavaScript frame loopによるdash更新。
- 新しいmotion library。
- 地図pan改善。
- 周辺地図機能。

## 前提と依存関係

- `docs/reviews/phase-07-4-route-animation-diagnosis.md`を最初に読む。
- Phase 7.1の時間変化テストが既に存在するため、同じ`animation-name`存在確認だけを追加しない。
- 実装開始直前の最新リモートHEADを基準にする。

## 読むべき文書と既存実装

- `docs/reviews/phase-07-4-route-animation-diagnosis.md`
- `docs/plans/phase-07-1/task-01-route-flow-animation-reliability.md`
- `docs/plans/phase-07-3/task-05-strengthen-current-route-direction-visuals.md`
- `apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-map-pin-model.ts`
- `apps/webapp/css/target.css`
- `apps/webapp/css/motion.css`
- `tests/route-overlay-contract.test.ts`
- `tests/e2e/webapp.spec.ts`

## 対象ファイル

### 変更候補

- `apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts`
- `apps/webapp/css/target.css`
- `apps/webapp/css/motion.css`
- `tests/route-overlay-contract.test.ts`
- `tests/e2e/webapp.spec.ts`

`dom-route-map-view.ts`は、screen-space契約をSVG/CSSだけで満たせないことをREDで証明した場合だけ変更する。

### 作成

原則なし。

### 削除

原則なし。

## 実装手順

1. 390px viewportでcurrent routeを表示するfocused E2Eを先に追加する。
2. `strokeDashoffset`が時間変化する既存assertionを維持する。
3. route SVGの`viewBox`、stageの`getBoundingClientRect()`、pathのcomputed stroke、必要なら`getScreenCTM()`を取得し、実画面換算の線幅が下限を満たすか検証するREDを作る。
4. current routeのbase / moving cueをscreen-spaceで安定させる最小修正を行う。まず既存SVG/CSSでnon-scaling stroke相当の指定が使えるか検証する。
5. static direction markerが縮尺の影響で読めない場合だけmarker設定を調整する。marker修正とpath修正を同時に無根拠で行わない。
6. candidate routeからloop animationを外す。candidateの青系baseと必要な静的endpointは維持してよいが、`.route-flow-comet`をcurrentと同じ意味で常時動かさない。
7. `prefers-reduced-motion: reduce`でmoving cueが停止し、current base / static direction cue、candidate baseが残ることを確認する。
8. headed browserでC108 public bundleを表示し、Start→Goal方向を目視確認する。数値だけ通って見えない場合はCSS user unitの値ではなくscreen-space結果を調整する。

## テスト方針

- no-preferenceでcurrentのdash offsetが実時間で変わる。
- 390px viewportでcurrent baseとmoving cueがscreen-spaceの最小視認幅を下回らない。
- currentだけがloop animationを持つ。
- candidateは青系baseを持つがloop animationを持たない。
- reduceでmoving cueが停止してもcurrent route自体は消えない。
- route overlayのpoints順序は変わらない。

CSSソースをregexで読み「stroke-width >= Nだから見える」と判定するテストを新しい受入根拠にしない。

## 検証コマンド

```bash
npx vitest run --root . tests/route-overlay-contract.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "地図|経路|route"
npm run check:webapp
git diff --check
```

## 受入条件

- current routeのanimation値が実時間で変化する。
- 390px幅の実画面でmoving cueの方向を認識できる。
- currentだけがloop animationを持つ。
- candidateは青系の静的routeとして識別できる。
- reduced motionでも経路情報が失われない。
- animationに伴うroute再計算、SVG再生成、常駐JS timerが追加されていない。

## 予定コミットメッセージ

```text
fix(phase-07-4): make route direction visible in screen space
```
