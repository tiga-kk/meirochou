# Phase 7.4 タスク12: 経路アニメーションを実描画・方向認識基準で再診断

## 目的

Phase 7.1以降、自動テストでは繰り返しPASSしたのに人間には見えなかったcurrent route animationについて、単なるCSS値の時間変化ではなく、**本番animationが実際に駆動していること、画面上で意味のある移動が生じること、その移動が始点から終点への方向として読めること**を別々に証明し、実画面で進行方向を認識できる状態へ修正する。

## このTaskで解消する既知の弱点

現行実装はcurrent routeへ`pathLength="100"`を設定し、`stroke-dasharray: 32 68`、`stroke-dashoffset: -100`、`0.9s`固定でmoving cueを動かしている。これはstroke幅を`vector-effect: non-scaling-stroke`で画面上へ保っても、moving cueの長さと進行速度まで画面座標で安定させる契約にはならない。

また、異なる二つの位相をテスト側で作るときに`strokeDashoffset`や`animation`自体を書き換えると、本番animationが存在しなくても画像差を作れてしまう。この自己充足的なテストを禁止する。

## 対象外

- candidate routeへのloop animation復活。
- `prefers-reduced-motion: reduce`を無視してanimationを強制すること。
- JavaScript `setInterval`、`requestAnimationFrame` loop、毎frame SVG再生成でanimationを実装すること。
- 原因未確認のままdash長・色・速度の定数だけを繰り返し大きくすること。
- animation検証のためだけのproduction test hookや公開API。
- 新しいmotion library、画像比較library。

## 前提と依存関係

Task 11完了後のzoom transform通知とzoom連動線幅を基準にする。

Task 11で得た`scale/x/y`通知は、必要ならmoving cueの画面上パラメータ更新にも再利用する。pointermoveごとの独自loopやroute再計算は追加しない。

## 読むべき文書と既存実装

- `docs/reviews/phase-07-4-route-animation-diagnosis.md`
- `docs/reviews/phase-07-4-human-acceptance-failures.md`
- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`
- `tests/route-overlay-contract.test.ts`
- `tests/e2e/webapp.spec.ts`

## 対象ファイル

### 変更

- `apps/webapp/css/target.css`
- `apps/webapp/js/features/route-guidance/ui/dom-route-map-view.ts`（画面上のcue長・速度をzoomへ追従させる場合）
- `apps/webapp/js/features/route-guidance/ui/route-overlay-svg.ts`（cue primitiveを変更する場合のみ）
- `tests/route-overlay-contract.test.ts`
- `tests/e2e/webapp.spec.ts`

### 作成候補

- animationだけのfocused E2Eを既存fileへ自然に置けない場合のみ`tests/e2e/route-animation.spec.ts`

### 削除

なし。

## 実装手順

### 1. 最初に「現在実装では落ちる」REDを作る

production codeを変更する前にfocused E2Eを追加し、現在HEADでFAILすることを確認する。

REDはselector不一致、fixture不足、import失敗等ではなく、後述する**画面上のmoving cue契約または方向契約を現行実装が満たさないこと**によってFAILしなければならない。

追加したテストがproduction変更前からGREENの場合、そのテストは今回の不具合を検出していない。実装へ進まず、現在の人間FAILを検出できるまでassertionを修正する。

### 2. production CSS animationの存在と自然進行を証明する

Playwrightで`page.emulateMedia({ reducedMotion: "no-preference" })`を明示し、`matchMedia('(prefers-reduced-motion: reduce)')`がfalseであることを確認する。

current moving cueについて`element.getAnimations()`から**production stylesheetによって実際に接続された`CSSAnimation`**を取得し、対象animationが存在することを確認する。

テストから`strokeDashoffset`、`animation`、`animation-name`、keyframes、classを上書きせず、通常再生のまま実時間を進めて次を確認する。

- `CSSAnimation.currentTime`が自然に増える。
- productionでanimation対象となるvisual stateが時間変化する。
- cue elementがcurrent routeの本番overlay上に存在する。

computed `strokeDashoffset`の変化は診断材料として残してよいが、それだけをGREEN条件にしない。

### 3. deterministicなraster証拠は「既存CSSAnimationをseekする」

flakyなwall-clock screenshot差を避けるため、手順2で取得できた**同じproduction `CSSAnimation` instance**を一時停止し、その`currentTime`だけを二つの位相へ移して同じroute overlay clipを撮影する。

このdeterministic検証では、次を禁止する。

- cue要素へ`strokeDashoffset`を直接設定する。
- inline `animation` / `animation-name`を追加する。
- テスト専用keyframesやclassを注入する。
- 本番に存在しないmoving elementをテスト側で追加する。

animationがproductionに接続されていなければ`getAnimations()`で取得できず、その時点でREDになる構造にする。

二位相のPNGはraw bufferの単純不一致や`changedPixels > 0`だけで合格させず、browser標準API等でpixelを比較し、微小なraster noiseを超える意味のある差分をassertする。同じ位相を二度撮る負の対照では、その条件を満たさないことも確認する。

### 4. テスト自身へmutation checkを行う

GREEN後、commit前の一時検証としてproductionのmoving animation宣言をローカルで無効化し、focused E2Eを再実行する。

この状態で**production animationの存在・自然進行・raster motionを証明する主要テストそのもの**がFAILしなければならない。lint、型エラー、selector消失等だけをmutation検出の証拠にしない。

mutationで主要証拠がFAILすることを確認したらproduction変更を元へ戻し、focused E2Eを再度GREENにする。mutation差分はcommitしない。

これにより「animation本体を削除してもテストがGREEN」の状態を禁止する。

### 5. moving cueを画面座標基準へ直す

現行の`pathLength=100` + 固定`32 68` + 固定`0.9s`を、そのまま最終解として扱わない。

moving cueの少なくとも次の二つを、route全長の固定割合ではなく**画面上で読める範囲**へ収める。

- 一度に見えるmoving cueの長さ。
- 一定時間あたりの画面上の移動量。

第一候補は既存`stroke-dashoffset` animationを維持しつつ、Task 11のzoom stateと現在のroute geometryからCSS custom property等へcue長・durationを渡す方法とする。animation自体はCSSに任せ、JavaScriptはroute描画時・zoom state更新時のパラメータ更新だけを行う。

短いrouteと長いroute、scale=1と高倍率のfixtureで、route全長やzoom倍率が増えた分だけcueが極端に長くなったり速くなったりしないことを確認する。

### 6. 「pixelが動く」ではなく進行方向を証明する

ordered `route.points`の先頭をstart、末尾をgoalとし、二つ以上のanimation phaseで**視覚上の先行部分または強調位置がstart側からgoal側へ進む**ことを確認する。

`strokeDashoffset`の符号だけとordered pointsの存在だけを別々にassertして「方向を証明した」としない。rendered cueの位置または順序とrouteの進行順を結び付ける。

既存dash方式のままでは、どのvisual partが先行しているかを安定して検証できない、またはheadedで方向として読めない場合は、テストを弱めずcue primitiveを変更する。候補は、一意な先頭を持つ短いpulseや、route順に強調される非対称なdirection cue等である。新しいlibraryやJavaScript frame loopは使わない。

### 7. 同じ方式の定数調整を無制限に繰り返さない

手順5のscreen-space化後もraster motionは証明できるのにheadedで方向が読めない場合、`dash-length`、色、durationだけを何度も変更する再試行へ戻らない。

その時点で「周期的dashoffset自体が方向cueとして不適切」という仮説を採用し、手順6の非対称cueへ変更する。過去Phaseと同じCSS定数調整を再び主戦略にしない。

### 8. reduced motionと性能契約を維持する

`reduce`ではmoving animationを停止し、base path、S/G、静的direction cueを残す。

animation中およびzoom中に次を増やさない。

- route planning回数。
- Dijkstra / ALNS実行回数。
- `buildRouteOverlaySvg()`生成回数。
- animation frameごとのDOM node再生成。

### 9. C108の実routeでheaded証拠を残す

自動検証後、C108 public map bundleの実routeを通常再生し、初期表示と少なくとも一つの拡大状態で進行方向を目視する。

headed screenshotや動画を生成しただけでは「人間が方向を認識できた」と扱わない。Task 18の人間受入が終わるまでPhaseのvisual問題は解消済みにしない。

## テスト方針

focused E2Eは最低限、次を独立に証明する。

- **RED証明**: production変更前の現行HEADで、今回追加した主要assertionが意味的にFAILする。
- **本番接続**: no-preferenceで本番cue要素に実際の`CSSAnimation`が接続され、テストからstyleを上書きしなくても自然に時間進行する。
- **実描画**: production `CSSAnimation`をseekした二位相で意味のあるraster差があり、同位相の負の対照では同条件を満たさない。
- **mutation proof**: production animationを一時的に無効化すると主要focused testがFAILする。
- **方向**: rendered cueの強調位置がordered routeのstart→goal方向へ進む。
- **screen-space安定性**: route長とzoom倍率が変わってもcue長・移動速度が極端に比例拡大しない。
- candidateにはloop moving cueがない。
- reduceではmoving cueが停止し、base/static cueは可視。
- animationに伴いroute SVG node数やroute計算回数が増えない。

## 検証コマンド

```bash
npx vitest run --root . tests/route-overlay-contract.test.ts
npx playwright test tests/e2e/webapp.spec.ts --grep "アニメーション|moving|経路"
npm run check:webapp
git diff --check
```

focused testを`tests/e2e/route-animation.spec.ts`へ分離した場合は、そのfileも明示実行する。

Task実装の最終GREENを記録する前に、animation無効化mutationでfocused testがFAILすることと、復元後に同じfocused testがGREENへ戻ることを記録する。

## 受入条件

- production変更前の現行実装で新しいfocused testが意味的にREDになる。
- no-preference環境でproduction `CSSAnimation`が通常再生中に自然進行する。
- rasterized overlayの差分が、テストから作った偽animationや微小noiseではなく本番moving cueの画面上変化を証明する。
- production animationを無効化したmutationで主要テストがFAILする。
- moving cueの画面上の長さと速度がroute全長・zoomへ無制限に比例しない。
- moving cueの強調位置がstart→goal方向へ進むことを自動検証できる。
- moving cueがcurrent routeだけに存在する。
- reduced motion契約を壊していない。
- 同じdash定数調整だけを過去Phase同様に繰り返していない。
- Task 18で人間が進行方向を視認できるためのheaded証拠を用意できる。

## 予定コミットメッセージ

```text
fix(phase-07-4): make route motion perceptible and testable
```
