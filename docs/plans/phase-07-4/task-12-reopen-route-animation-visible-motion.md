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
3. rasterized motionは、対象animationを異なる二つの位相へ固定して同じroute overlay clipを撮影し、PNGをpixelとして比較する。raw PNG bufferの単純な不一致や`changedPixels > 0`だけを合格条件にせず、微小な描画ノイズを超える意味のある差分量を固定fixtureでassertする。同じ位相を二度比較する負の対照も置く。production codeへテスト専用分岐や新しい画像比較依存は追加しない。
4. 2が変化しても3の差分条件を満たさない場合はSVG/CSS rasterization契約を原因として修正する。3を満たしてもheadedで方向を認識できない場合は人間視認性を原因としてdash長、コントラスト、速度等を最小調整する。
5. direction cueが進行方向と逆へ動いていないことを、dash offset符号とordered route pointsで確認する。
6. `reduce`ではanimationが停止し、base pathと静的方向cueが残ることを再確認する。
7. C108の実routeで通常再生したheaded screenshot/動画等の目視用証拠を生成する。ただしTask 18の人間受入が終わるまでPhase完了扱いにはしない。

## テスト方針

- no-preferenceでcomputed値が時間変化する。
- 異なる二つのanimation位相でraster pixelsに意味のある差分があり、同一位相の負の対照では同じ条件を満たさない。
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

focused testを`tests/e2e/route-animation.spec.ts`へ分離した場合は、そのfileも明示実行する。

## 受入条件

- no-preference環境でanimationが通常再生中に進行する。
- rasterized overlayの差分が単なるbuffer不一致や微小ノイズではなく、moving cueの画面上変化を証明する。
- 同一位相の負の対照でpixel差分テスト自体の証明力を確認できる。
- moving cueがcurrent routeだけに存在する。
- reduced motion契約を壊していない。
- Task 18で人間が進行方向を視認できるためのheaded証拠を用意できる。

## 予定コミットメッセージ

```text
fix(phase-07-4): verify visible route motion
```