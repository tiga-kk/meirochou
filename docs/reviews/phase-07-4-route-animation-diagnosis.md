# Phase 7.4 経路アニメーション失敗履歴と診断

## 結論

Phase 7.1以降の自動テストは「CSS animationが時間変化する」ことを証明している一方、実機でユーザーが進行方向を視認できる大きさ・コントラストを十分に証明していない。

現時点の第一原因仮説は、route SVGがC108の元画像座標系（例: e456は4096×1438）を`viewBox`として持ち、画面へ大きく縮小されるのに対して、stroke幅・endpoint半径・marker寸法をSVG user unitの固定値として調整してきたことである。CSS上の`stroke-width: 9`が存在しても、画面上で9 CSS pxとして描かれることは証明されていない。

したがってPhase 7.4 Task 1では、「数値をさらに大きくする」ことを修正方針にしない。まずscreen-space換算をテストで固定し、そのテストを満たす最小のSVG/CSS修正だけを行う。

## 確認した履歴

### Phase 7.1: animationの時間変化を検証

commit `143e93ed9f1a1738cbd12edcb7115e9710a32d91` では、Playwrightで`prefers-reduced-motion: no-preference`を明示し、current routeの`strokeDashoffset`が最大1.5秒以内に初期値から変化することをpollするテストへ変更した。

このテストは「animation自体が止まっている」という仮説を否定するためには有効である。一方で、線が実画面で十分に太いか、dashの移動量を人間が視認できるかは証明しない。

Phase 7.1の計画上は、candidate routeへcurrent routeと同じloop animationを追加しない契約だった。

### Phase 7.3: candidateへmoving cueとS/Gを拡張

commit `f6718e4c15ba11aaef25d58d3c27538a56e66cd3` では、candidate routeにも`route-flow-comet`とS/G endpointを生成する変更が入った。これによりPhase 7.1の「candidateはloop animationを持たない」という契約から表示責務がドリフトした。

Phase 7.4ではcandidateを青系の静的経路へ戻し、moving cueはcurrent routeだけの意味に限定する。

### Phase 7.3: SVG内部の数値を拡大

commit `80bb04c684fccf442a86a7e97320cc950a5f2676` では、`stroke-width`を5から9、`stroke-dasharray`を`18 82`から`32 68`へ変更した。

同commitのテストは、CSSファイル内の値が一定以上であることと、candidate cometのcomputed CSSが`9px` / `32px, 68px`であることを確認する。これはstylesheet契約としては有効だが、地図stageの縮小後に画面上で何CSS pxに見えるかを測っていない。

## 現行構造から分かること

`buildRouteOverlaySvg()`はroute imageの`width` / `height`をそのまま`viewBox`へ設定し、route pointも元画像座標でpolylineへ入れる。

C108 e456の`grid-meta.json`は`width: 4096`, `height: 1438`である。`calculateMapViewportLayout()`はモバイル幅で地図stageを画面サイズへ縮小するため、SVG user unitとscreen CSS pxは1:1ではない。

このため、次を別々に扱う必要がある。

1. path geometry: 元画像座標に追従する必要がある。
2. stroke / moving cueの視認幅: screen-spaceで最低限の太さが必要。
3. dash progression: path上の進行方向が認識できる長さと速度が必要。
4. static direction cue: reduced motionでも残る必要がある。

## Task 1で証明すること

実装前にREDを作り、最低限次を証明する。

- current routeのdash offsetが実時間で変化する。
- current routeのbase / moving cueが390px viewportでscreen-spaceの最小視認幅を満たす。
- current routeだけがloop animationを持つ。
- candidate routeは青系のbaseを持つがloop animationを持たない。
- reduced motionではmoving cueが停止してもcurrent baseと静的direction cueが残る。
- route points、Dijkstra、ALNS、route SVG生成回数がanimation frameに応じて増えない。

screen-spaceの最小値はテスト開始時に現行の実画面を計測して決める。目安としてbase path 3 CSS px以上、moving cue 3 CSS px以上を下限候補とするが、計測結果より視認できない場合はheaded確認を優先して値を上げる。SVG user unitの値そのものを受入条件にしない。

## 修正候補の優先順位

1. 既存SVG/CSSのままscreen-spaceを安定させられる指定を優先する。
2. markerだけが縮尺問題を残す場合はmarker契約だけを調整する。
3. endpointを別HTML layerへ移す等の構造変更は、1〜2で実機条件を満たせない場合だけ行う。
4. JavaScript animation loop、毎frameのSVG再生成、別animation libraryは採用しない。

## 完了判断

「PlaywrightがPASSした」だけでは完了にしない。focused自動検証の後、C108 public map bundleを用いたheaded browserでcurrent routeの進行方向を目視できた証拠を`docs/reviews/phase-07-4-field-verification.md`へ記録して初めてPhaseのvisual受入を完了とする。
