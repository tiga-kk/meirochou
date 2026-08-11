# Phase 7.1 Task 3: map pan bounds・release velocity・inertia改善

## 目標

地図panを「bounds内は指へ1:1追従」「release velocityは最後の1 pointer eventだけに依存しない」「慣性はframe数ではなく経過時間で収束」「bounds外dragだけ既存rubber-bandを適用」「release後は必ずboundsへ戻る」にする。同時にC108各areaで必要な地図端へ到達できることをtestで固定する。

## 現行実装から再利用するもの

`GestureZoomController`にはすでに次がある。

- `getXBounds()` / `getYBounds()`
- `applyRubberBand()`（既定overscroll上限は32px）
- transform writeのRAF coalescing
- cached layout
- pinch/wheel/reset/setTransform
- bounds violationのsettle相当処理
- idle時にRAFを停止する既存test

Phase 7.1ではこれらを捨てて別physics層を作らない。必要な計算をDOM非依存のpure helperとして抽出・追加することはよいが、まず既存`gesture-zoom-controller.js`内で責務を明確にできるか検討する。別`gesture-pan-physics.js`を作るのは、同file内ではcontrollerとpure計算の境界が読みにくくなる場合だけとする。

## やってはいけないこと

- `GestureZoomController`全体を別地図libraryへ置換しない。
- pointermoveごとに`getBoundingClientRect()`、natural size等のlayout readを追加しない。
- bounds内dragへ常時摩擦を掛けない。
- 最後の1回の`dx/dy`だけをrelease velocityとして使い続けない。
- `vx *= 0.92`のようなframe数依存だけで時間経過を表現しない。
- 現行約32pxのrubber-band上限を、計画時の未検証値24pxへ根拠なく変更しない。
- 新しいphysics parameterを多数public API化しない。
- pinch/wheel/route fit/resetの既存挙動を未検証のまま変更しない。
- C108比率をtest内へ別の正本として大量に転記しない。既存manifest/fixture/layout dataを再利用できる場合はそちらを使う。

## 対象ファイル

**変更候補:**
- `apps/webapp/js/utils/gesture-zoom-controller.js`
- `tests/gesture-zoom-controller.test.ts`
- `tests/route-map-viewport-layout.test.ts`
- `tests/e2e/webapp.spec.ts`

**条件付き作成:**
- `apps/webapp/js/utils/gesture-pan-physics.js`
- `tests/gesture-pan-physics.test.ts`

pure helperが複数になり、既存controller testから独立して検証する価値がある場合だけ分離する。

`route-map-pin-model.ts`、`dom-route-map-view.ts`は、bounds/route fit接続の実不具合が確認された場合だけ変更する。

## 挙動契約

### bounds

- stageがviewportより大きい軸は両端へ到達可能にする。
- stageがviewportより小さい軸は`baseX/baseY`の中央位置を維持する。
- `calculateMapViewportLayout()`が返す`initialX/initialY`をreset/layout変更で失わない。
- route fit transformをboundsへ収める必要がある場合も、current route/comparisonで必要なpointがviewportから不必要に外れないことを先にtestする。単に`setTransform()`をclampして完了扱いしない。

### drag / overscroll

- bounds内はpointer移動量とpan移動量を1:1にする。
- bounds外だけ`applyRubberBand()`相当の非線形抵抗を適用する。
- 現行の約32px上限を維持する。別値へ調整する場合は実機上の観測理由を記録する。

### release velocity / inertia

- release直前の短い時間窓にある複数sampleから速度を求める。
- 2点未満、時間差0、異常timestampでは安全に0速度へ縮退する。
- 極端な速度は一箇所で上限を持たせてよいが、具体値は実装前固定契約にしない。
- `requestAnimationFrame(timestamp)`の時間差で移動量/減速量を計算する。
- background復帰等の巨大`dt`でjumpしないよう1 stepの`dt`上限を持たせてよい。
- inertia中にboundsへ到達した軸は境界で停止させる。
- bounds外releaseはさらに外へ慣性移動させず、最寄りboundsへsettleする。
- pointerdown、pinch開始、reset、layout変更、route fitで進行中animationをcancelする。

## 手順

- [ ] **Step 1: 現行の端到達・release挙動をRED testで再現する**

まず既存`GestureZoomController`と`calculateMapViewportLayout()`を使って、次を再現する。

- wide mapのleft/right edge。
- tall mapのtop/bottom edge。
- centered base transformを持つaxis。
- 最後のpointer deltaが小さいと慣性が不自然に失われるcase。
- 同じ実時間でもRAF間隔が異なるとframe固定減衰で結果が変わるcase。

新moduleの存在をRED条件にしない。

- [ ] **Step 2: C108 regressionを既存dataから固定する**

`e456/e7/s12/w12`のmap layout情報を既存manifest/fixtureから利用できる範囲で使い、各areaで必要なpan軸の両端へ到達できることを確認する。

- [ ] **Step 3: release sample履歴を最小追加する**

single-pointer drag中にposition/time sampleを短い履歴として保持し、古いsampleを捨てる。pointerdownで履歴を初期化し、pinchへ移行したらsingle-pan用履歴を誤用しない。

sampleの内部表現はprivateでよい。外部interfaceを増やさない。

- [ ] **Step 4: release velocity計算をpureにする**

既存file内のexport helperまたは条件付き新moduleで、複数sampleからpx/ms等の時間基準速度を求める。最後のdeltaだけが小さいcaseも速度が残るtestを入れる。

- [ ] **Step 5: inertiaをdtベースへ変更する**

16ms相当の細かいstepと32ms相当の粗いstepで、同程度の総時間後に大きく乖離しないことをtestする。pixel完全一致ではなく、同方向・同程度・同じ停止条件を確認する。

- [ ] **Step 6: bounds外releaseを既存bounds契約へ収束させる**

現行settle処理を再利用・整理できるなら新しいsettle abstractionを作らない。完了時にpositionをexact boundaryへ合わせ、RAFを残さない。

- [ ] **Step 7: pinch/wheel/route fit regressionを確認する**

- pinch後にtransformが破綻しない。
- wheel zoom後に地図が恒久的にbounds外へ残らない。
- route fitで必要なcurrent/comparison pointsが表示範囲に残る。
- `reset()`はbase transformへ戻る。
- 同じlayout再適用では不要なresetをしない。

`setTransform()`への無条件clampは、route fitの表示目的を壊さないtestができてから導入する。

- [ ] **Step 8: performance regressionを維持する**

既存のtransform write coalescingとcached layout testを維持する。複数pointermoveでlayout read回数がevent数に比例して増えないことを確認する。

- [ ] **Step 9: E2Eで地図端と慣性を確認する**

pixel完全一致ではなく次を確認する。

- dragで必要な端へ到達可能。
- release後に速度方向へ追加移動するcaseがある。
- 十分な時間後に停止する。
- bounds外へ残らない。

- [ ] **Step 10: verification**

新moduleを作らなかった場合は存在しないtest commandを実行しない。

```bash
npx vitest run --root . tests/gesture-zoom-controller.test.ts tests/route-map-viewport-layout.test.ts
npm run test:webapp
npx playwright test tests/e2e/webapp.spec.ts --grep "地図|map|pan|慣性"
npm run check:webapp
git diff --check
```

新しいpure module/testを作った場合だけfocused commandへ追加する。

- [ ] **Step 11: commit**

実際に変更したcontroller/helper/testだけをstageする。

## 受入条件

- bounds内panは1:1。
- release velocityは最後の1 eventだけでなく直近の複数sampleから求める。
- inertiaはdtベースでframe frequency差へ過度に依存しない。
- C108各areaで必要な端へ到達できる。
- 現行rubber-band上限を根拠なく変更しない。
- bounds外release後はboundsへ戻る。
- idle時にRAFが残らない。
- pointermoveごとのlayout readを増やさない。
- pinch/wheel/reset/route fitが回帰しない。
