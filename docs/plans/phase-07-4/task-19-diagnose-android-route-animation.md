# Phase 7.4 タスク19: Android実機でcurrent route animationを診断・修正

## 目的

Task 12のdesktop Chromium自動検証ではproduction `CSSAnimation`の自然進行・raster差分・方向判定まで通ったが、2026-08-14のAndroid Chrome実機確認ではcurrent route animationを人間が視認できなかった。

このTaskでは、Android側の`prefers-reduced-motion`による意図的停止と、`no-preference`でも起きる本番描画不具合を最初に分離する。原因確認前にdash長・duration・色だけを再調整しない。

## 対象外

- `prefers-reduced-motion: reduce`を無視してanimationを強制すること。
- Androidのアクセシビリティ設定をWeb側から変更すること。
- debug用の常設UI・公開test hook・query parameterを本番へ追加すること。
- JavaScript `setInterval`や独自の毎frame `requestAnimationFrame`でroute animationを実装すること。
- candidate routeを動かすこと。
- 新しいmotion libraryを導入すること。

## 前提と依存関係

Task 12のscreen-space cue長・速度計算、Task 11のzoom追従線幅、Task 18の人間受入FAILを基準とする。

現行CSSは`@media (prefers-reduced-motion: reduce)`でmoving cueのanimationを停止する。したがってAndroid実機の設定値を確認せずproduction bugと断定しない。

## 読むべき文書と既存実装

- `docs/plans/phase-07-4/task-12-reopen-route-animation-visible-motion.md`
- `docs/plans/phase-07-4/task-18-human-acceptance-regression-closure.md`
- `docs/reviews/phase-07-4-field-verification.md`
- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts`
- `apps/webapp/js/features/route-guidance/ui/route-motion-metrics.ts`
- `tests/route-motion-metrics.test.ts`
- `tests/route-overlay-contract.test.ts`
- `tests/e2e/webapp.spec.ts`

## 対象ファイル

### 新規作成

- `docs/reviews/phase-07-4-android-route-animation-diagnosis.md`

### 診断結果により変更候補

- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts`
- `apps/webapp/js/features/route-guidance/ui/route-motion-metrics.ts`
- `tests/route-motion-metrics.test.ts`
- `tests/route-overlay-contract.test.ts`
- `tests/e2e/webapp.spec.ts`

## 実装手順

1. 問題が再現するAndroid Chrome実機で対象ページの地図bundle version、Chrome version、Android versionを診断文書へ記録する。
2. USB remote debugging等で実ページへ接続し、同一current routeで次を採取する。

```js
matchMedia('(prefers-reduced-motion: reduce)').matches
```

current cueについて次も採取する。

```js
const cue = document.querySelector('[data-route-kind="current"] .route-flow-comet');
const animation = cue?.getAnimations().find((item) => item instanceof CSSAnimation);
({
  animationCount: cue?.getAnimations().length ?? 0,
  playState: animation?.playState,
  currentTime: animation?.currentTime,
  animationName: cue ? getComputedStyle(cue).animationName : null,
  dashoffset: cue ? getComputedStyle(cue).strokeDashoffset : null,
  stroke: cue ? getComputedStyle(cue).stroke : null,
  strokeOpacity: cue ? getComputedStyle(cue).strokeOpacity : null,
  rect: cue?.getBoundingClientRect(),
})
```

300〜500ms後に`currentTime`と`strokeDashoffset`を再取得する。
3. `prefers-reduced-motion: reduce`がtrueなら現行CSSの停止は意図どおりと扱う。Androidのmotion低減設定を無効にした`no-preference`状態で再確認し、Web側で強制animationへ変更しない。
4. `no-preference`なのに`CSSAnimation`が存在しない場合は、current overlayのclass/selector、stylesheet load、`@media`適用、要素再生成時のclass欠落を原因まで追跡し、最小の接続修正を行う。
5. `CSSAnimation.currentTime`と`strokeDashoffset`は進むが実機でcueを視認できない場合は「animationは動いている」だけで合格にしない。Android実機で認識できる非対称・高コントラストのcurrent cueへ変更する。この場合も既存route pathとbrowser-native animationを利用し、JS frame loopは追加しない。
6. cue方式を変更する場合もTask 12のscreen-space契約を維持し、初期表示・高倍率の双方でcue長・速度が極端に変化せずstart→goal方向を読める状態にする。
7. `reduce`ではmoving cueを停止または非表示にしてよいが、静的current routeと方向情報を残す。
8. 最終GREEN後、同じAndroid実機の`no-preference`状態で人間がmotionを視認できることを必須証拠として診断文書へ残す。desktop Device Modeだけで代用しない。

## テスト方針

- `no-preference`でproduction animation instanceが存在し自然進行するTask 12テストを維持する。
- `reduce`でmoving cueが停止する契約を維持する。
- Android修正でdesktop/current route、candidate静的route、zoom線幅を壊さない。
- animation削除・逆方向・不可視化に対するTask 12の証明力を弱めない。

## 検証コマンド

```bash
npx vitest run --root . tests/route-motion-metrics.test.ts tests/route-overlay-contract.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "current|animation|経路"
npm run check:webapp
git diff --check
```

## 受入条件

- Android実機で`prefers-reduced-motion`の実値を確認している。
- `reduce=true`だけが原因ならproductionを無理に変更せず、`no-preference`再確認でanimationが見える。
- `no-preference`でも再現する場合、実機上のanimation接続・進行・可視性のどこで失敗しているか原因を特定し修正している。
- Android実機の`no-preference`状態でcurrent moving cueを人間が視認し、start→goal方向を認識できる。
- `reduce`利用者のmotion低減要求を壊していない。

## 予定コミットメッセージ

```text
fix(phase-07-4): make current route motion visible on android
```
