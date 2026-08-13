# Phase 7.4 タスク12: 経路アニメーションを実描画基準で再診断

## 目的

自動テストではPASSしたのに人間には見えなかったcurrent route animationについて、停止原因・rasterization・視認性を分離して診断し、実画面で進行方向を認識できる状態へ修正する。

## 対象外

- candidate routeへのloop animation復活。
- `prefers-reduced-motion: reduce`を無視してanimationを強制すること。
- JavaScript `setInterval`や毎frame SVG再生成。
- 原因未確認のままCSS数値だけをさらに大きくすること。

## 前提と依存関係

Task 11完了後のzoom連動線幅を基準にする。

## 読むべき文書と既存実装

- `docs/reviews/phase-07-4-route-animation-diagnosis.md`
- `docs/reviews/phase-07-4-human-acceptance-failures.md`
- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts`
- `tests/route-overlay-contract.test.ts`
- `tests/e2e/webapp.spec.ts`

## 対象ファイル

### 変更

- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts`（必要な場合のみ）
- `tests/route-overlay-contract.test.ts`
- `tests/e2e/webapp.spec.ts`

### 作成候補

- rasterized motionのfocused testを既存E2Eへ自然に置けない場合のみ`tests/e2e/route-animation.spec.ts`

### 削除

なし。

## 実装手順

1. Playwrightで`page.emulateMedia({ reducedMotion: "no-preference" })`を明示し、`matchMedia('(prefers-reduced-motion: reduce)')`がfalseであることを証拠に残す。
2. current moving cueの`strokeDashoffset`が異なる時刻で変化することを確認する。
3. 同じroute overlayの同一clipを時刻を変えてscreenshotし、PNG bufferが同一でないことを確認する。DOM/computed style変化だけを合格条件にしない。
4. 2が変化し3が変化しない場合はSVG/CSS rasterization契約を原因として修正する。3も変化する場合は人間視認性を原因としてdash長、コントラスト、速度等を最小調整する。
5. direction cueが進行方向と逆へ動いていないことを、dash offset符号とordered route pointsで確認する。
6. `reduce`ではanimationが停止し、base pathと静的方向cueが残ることを再確認する。
7. C108の実routeでheaded screenshot/動画等の目視用証拠を生成する。ただしTask 18の人間受入が終わるまでPhase完了扱いにはしない。

## テスト方針

- no-preferenceでcomputed値とraster pixelsの両方が時間変化する。
- candidateはmoving cueなし。
- reduceではmoving cue停止、base/static cueは可視。
- zoom倍率を変えてもmoving cueがbase pathから消えない。
- animationに伴いroute SVG node数やroute計算回数が増えない。

## 検証コマンド

```bash
npx vitest run --root . tests/route-overlay-contract.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "アニメーション|moving|経路"
npm run check:webapp
git diff --check
```

## 受入条件

- no-preference環境のrasterized overlayが時間で実際に変化する。
- moving cueがcurrent routeだけに存在する。
- reduced motion契約を壊していない。
- Task 18で人間が進行方向を視認できるためのheaded証拠を用意できる。

## 予定コミットメッセージ

```text
fix(phase-07-4): verify visible route motion
```