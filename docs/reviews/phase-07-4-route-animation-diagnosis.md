# Phase 7.4 経路アニメーション失敗履歴と診断

## 結論

Phase 7.1以降の自動テストは何度もGREENになったが、2026-08-13の人間受入ではcurrent routeのmoving cueを認識できなかった。したがって、これまでの「CSS animationが存在する」「`strokeDashoffset`が時間変化する」「strokeがscreen-spaceで一定幅を持つ」という証拠は、それぞれ部分的には正しいが、製品要件である**進行方向を人間が認識できること**を証明していない。

Phase 7.4 Task 1で導入した`vector-effect: non-scaling-stroke`により、以前の「地図縮小でstroke幅まで細くなる」問題は修正された。しかし、その後も人間受入がFAILしたため、これを現在の根本原因として扱い続けてはならない。

現在の第一原因仮説は次の二つである。

1. moving cueの長さと速度がscreen-spaceではなくroute全長の正規化値へ結び付いている。
2. テストが「何かが時間変化する」ことを主に確認し、rendered cueがstart→goal方向へ読めることを確認していない。

現行実装は`pathLength="100"`、`stroke-dasharray: 32 68`、`stroke-dashoffset: -100`、`0.9s`固定である。SVG 2では`pathLength`がstroke dashの距離計算にも作用するため、この設定はmoving cueをroute全長に対する割合として扱う。route全長やzoom後の画面上path長が変わってもdurationが固定なので、人間が見る画面上のcue長・移動速度が安定する契約になっていない。

したがってTask 12では、同じCSS定数をさらに調整することを主戦略にしない。まず現在実装で意味的にREDになるテストを作り、本番animation接続、実時間進行、raster motion、screen-space安定性、start→goal方向を分けて証明する。

## 確認した履歴

### Phase 7.1: animationの時間変化を検証

commit `143e93ed9f1a1738cbd12edcb7115e9710a32d91` では、Playwrightで`prefers-reduced-motion: no-preference`を明示し、current routeの`strokeDashoffset`が最大1.5秒以内に初期値から変化することをpollするテストへ変更した。

このテストは「production CSS animationが時間進行する」という確認には有効だった。一方で、rasterized pixels、screen-space移動量、方向認識は確認していない。

さらに、このcommit以前にはテスト側で`CSSAnimation`をpauseして`currentTime`を0と550msへseekし、computed valueを比較していた。deterministicではあるが、computed styleの変化しか確認していないためvisual受入の証拠にはならなかった。

### Phase 7.3: direction cueとmoving cueの数値を強化

commit `498f7f1eda90e5cf249fe96240e0fe0b81dafca4` では、`pathLength="100"`をroute line / moving cueへ追加し、dash patternを`18 82`、cycleを`0.9s`へ変更した。また静的direction arrowも大型化した。

commit `80bb04c684fccf442a86a7e97320cc950a5f2676` では、moving cueのstroke幅とdash長をさらに増やした。

この系列は「見えないならCSS数値を大きくする」という調整を重ねている。しかしroute全長やzoom倍率に対するscreen-space速度を直接制御していない。

### Phase 7.3: candidateへmoving cueを拡張

commit `f6718e4c15ba11aaef25d58d3c27538a56e66cd3` ではcandidate routeにもmoving cueが追加され、Phase 7.1の「loop animationはcurrentだけ」という意味がドリフトした。

Phase 7.4 Task 1でcandidate moving cueは除去され、currentだけへ戻っている。この修正は維持する。

### Phase 7.4 Task 1: stroke幅をscreen-space化

commit `98fb24e461d4ff99d5a41516b3fbbb8f4968cbe0` では、current base / moving cueへ`vector-effect: non-scaling-stroke`を追加し、390px viewportでscreen-space stroke幅を確認するE2Eを追加した。

この変更は「元画像座標の縮小によりstrokeそのものが極端に細くなる」問題に対する妥当な修正だった。

ただし同commit自身がheaded browser confirmationを未実施としており、その後の人間受入でmoving cueは認識できなかった。したがって**stroke幅のscreen-space化は必要条件だったが十分条件ではない**。

### 2026-08-13 人間受入

`docs/reviews/phase-07-4-human-acceptance-failures.md`では、current routeにmoving cue DOM/CSSが存在しheadless assertionも通る一方、人間にはanimationを認識できなかったと記録されている。

この事実を、以後の自動テスト設計の出発点とする。過去のGREENを「ほぼ直っている」証拠として扱わない。

## 現行実装の構造上の問題

`buildRouteOverlaySvg()`はcurrent routeについて次を同じordered pointsから生成する。

- 赤いbase polyline。
- `pathLength="100"`を持つmoving polyline。
- goal側へ向く静的direction arrow。
- S/G endpoint。

CSSはmoving polylineへ`stroke-dasharray: 32 68`と`stroke-dashoffset: -100`の0.9秒loopを適用する。

SVG 2の`pathLength`はdash array / dash offsetを含むdistance-along-a-path計算を正規化する。このため`32 68`は固定screen pxではなく、author path length 100に対するpatternである。

この方式には次の弱点がある。

1. routeが長くなるほど、一度に強調される実画面上の区間も長くなり得る。
2. cycleが0.9秒固定なので、画面上のpathが長くなるほど見かけの移動速度も速くなり得る。
3. zoomすると画面上path長は増えるが、animation durationは変化しない。
4. `vector-effect: non-scaling-stroke`はstroke幅を安定させるための仕組みであり、それだけでcueの長さ・速度が人間向けのscreen-space値になることは証明できない。
5. periodic dashのpixel差が出ても、その差が方向として知覚可能とは限らない。

## 過去テストがGREENでも不十分だった理由

| 証拠 | 証明できること | 証明できないこと |
|---|---|---|
| `animation-name`が存在 | stylesheet接続の一部 | 実時間で動くこと、見えること |
| `strokeDashoffset`が変化 | CSS stateが進むこと | rasterされること、方向として読めること |
| stroke幅が3px以上 | 線が極端に細くないこと | moving cueの長さ・速度・方向 |
| 二枚のPNG bufferが異なる | encoded imageが異なること | moving cue由来か、noise以上か |
| `changedPixels > 0` | 何らかのpixel差 | 人間が認識できる差か |
| dash offsetの符号 | CSS値の向き | rendered cueがstart→goalへ見えること |

Task 12ではこれらを単独の合格条件にしない。

## Task 12で必須にするテスト構造

### 1. 現行HEADで意味的RED

新しいfocused testはproduction変更前に必ず実行する。

現在実装のままGREENなら、人間FAILを検出できないテストなので受け入れない。selectorやfixture failureではなく、screen-space moving cueまたは方向契約でREDになることを確認する。

### 2. 本番animationの自然進行

`no-preference`で、本番cue要素の`getAnimations()`からproduction `CSSAnimation`を取得する。テストからanimation propertyを注入せず、実時間で`currentTime`が増えることを確認する。

### 3. production animationを使ったdeterministic raster検証

二位相を固定するときは、手順2で取得した同じ`CSSAnimation` instanceの`currentTime`だけをseekする。

`strokeDashoffset`、inline animation、keyframes、classをテストから書き換えて画像差を作ってはならない。

同位相の負の対照と、noise以上のpixel差を確認する。

### 4. mutation proof

GREEN後、production animation宣言だけを一時的に無効化してfocused testを再実行し、主要なanimation assertionがFAILすることを確認する。

これにより、animation本体がなくてもGREENになるテストを排除する。

### 5. screen-space安定性

短いroute / 長いroute、scale=1 / 高倍率を比較する。

moving cueの見える長さと一定時間の移動量が、route全長やzoom倍率へそのまま比例して極端に増えない契約を持たせる。

### 6. rendered direction

二つ以上のphaseでvisual cueの先行部分または強調位置を特定し、それがordered pointsのstart側からgoal側へ進むことを確認する。

CSS値の符号だけでは代用しない。

## 実装方針の優先順位

1. 既存のbase route、S/G、static direction cue、CSS animationという大枠は再利用する。
2. `stroke-dashoffset`方式を使う場合は、route全長の固定割合・固定durationではなく、screen-spaceでcue長と速度を制御する。Task 11のzoom transform通知を再利用し、JavaScriptは表示パラメータ更新だけを行う。
3. screen-space化してもraster motionはあるのにheadedで方向が読めない場合、同じdash定数調整を続けない。
4. その場合は、一意な先頭を持つpulseやroute順に強調される非対称cue等、方向を自動テスト可能なprimitiveへ変更する。
5. JavaScript animation loop、毎frame SVG再生成、別motion libraryは採用しない。

この順序なら、既存実装を必要以上に捨てずに済む一方、過去Phaseと同じ「数値を変えてGREEN」を繰り返すことも避けられる。

## 完了判断

Task 12の自動実装証拠と、Phase 7.4の人間visual受入は分ける。

自動側では少なくとも次を満たす。

- 現行HEADで意味的REDを確認済み。
- production animationの自然進行を確認済み。
- production `CSSAnimation`を使ったraster motionを確認済み。
- mutationでanimationを消すと主要テストがFAILする。
- screen-space cue長・速度の契約がroute長 / zoomに対して成立する。
- rendered cueがstart→goalへ進むことを確認できる。

それでも「人間が方向として認識できる」は自動テストだけで完全には証明しない。C108 public map bundleを用いたheaded証拠を残し、Task 18で実画面を人間が確認するまでPhaseのanimation問題を解消済みとして終了しない。
