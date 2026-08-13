# Phase 7.4 人間受入FAIL記録

確認日: 2026-08-13

## 結論

Task 1〜9の自動検証後に実画面を人間が確認した結果、Phase 7.4のvisual/interaction受入はFAILした。`docs/reviews/phase-07-4-field-verification.md`の自動検証結果は有効だが、同文書の終了判定はこの人間確認によって失効する。

Phase 7.4を再オープンし、Task 10〜18で修正・再受入する。

## 確認された問題

### 1. 近接ピンの選択が曖昧

地図上で近い二つのサークルを個別に選びにくい。

現行`.map-pin`は44px四方の操作領域を持ち、近接時に領域が重なる。`DomRouteMapView`は各button自身の`onclick`へ候補選択を直接接続しているため、重なり時はDOM hit testing/z-orderに依存する。

Task 10では44px操作性を維持しつつ、pointer位置に最も近いpinを解決する。

### 2. 行き先変更時の青線が途切れて見える

現行CSSはcandidate routeへ`stroke-dasharray: 22 14`を指定している。このため機能上のroute pointsが連続していても、人間には経路が切れて見える。

Task 11でcandidateを連続した青実線へ変更する。

### 3. 周辺地図の操作UI不足

`DomNearbyMapView`内部には`selectedPriorities`、`nearbyLimit`、`includeHeld`と`setNearbyFilters()`があるが、生成DOMにはpriority、件数、holdを操作するcontrolsがない。

Task 13で実UIへ接続する。

### 4. 周辺カードの重なり・操作不足

人間確認では近接した複数カードが大きく重なった。現行`layoutNearbyCatalogCards()`はanchor周囲8方向だけを候補にし、重なりを禁止せずscore penaltyとして扱うため、密集配置では重なりが残る。

現行cardは単一buttonで、clickはお品書き拡大だけへ接続されている。card選択、前面化、「目的地にする」は存在しない。

Task 15でscreen-space非重複配置と選択actionへ変更する。

### 5. leader lineが細い

現行`.nearby-map-leader`は`stroke-width: 2`であり、情報量の多い会場地図上では追いにくい。

Task 15で高コントラストの線へ修正する。

### 6. 独立地図が一律の横長viewportになる

`DomNearbyMapView.applyViewportLayout()`は通常の経路地図と同じ`calculateMapViewportLayout()`を使い、`viewportMaxHeight: 520`、`minimumInteractiveHeight: 220`を固定している。

独立地図では地図の縦横比と利用可能画面領域を優先すべきため、Task 14で初期containへ変更する。

### 7. 購入Undo後に現在地入力が空欄になる

`LatestPurchaseUndo`は`space`、status undo token、Route Guidance snapshotだけを保存する。`undoLastPurchase()`はsnapshotを戻すが、現在地フォームを復元しない。

Task 16で購入直前の現在地spaceもUndo対象へ含める。

### 8. current routeのアニメーションが見えない

現行DOM/CSSではcurrent routeにmoving cueが生成され、headlessではanimation-related assertionを通過している。しかし人間確認ではmoving cueを認識できなかった。

原因は未確定である。Task 12ではcomputed styleだけでなくrasterized pixel差、`prefers-reduced-motion`、headed目視を分離して診断する。

### 9. 拡大時に赤/青経路線が太すぎる

現行`.route-overlay-line`は`stroke-width: 12`かつ`vector-effect: non-scaling-stroke`であり、ズームしても画面上の線幅がほぼ一定になる。そのため地図を拡大すると通路に対して相対的に太すぎる。

Task 11でzoom scaleに応じた画面上線幅へ変更する。

### 10. 拡大時に現在位置文脈を失う

地図を拡大すると周辺の識別子がviewport外へ出て、現在どのブロックを見ているか分かりにくい。現在はviewport中心を最寄り配置点へ変換して表示するUIがない。

Task 17で通常経路地図・独立周辺地図の双方へ「表示中心: <area> <identifier><number>付近」を追加する。

## 受入上の教訓

- headlessでDOM/CSS値が正しいことと、人間が地図上で読めることを同一視しない。
- visual要件を持つTaskは、最終的にheaded/人間確認へ到達しなければPhase終了根拠にしない。
- snapshot差分を残したまま「外部確認未確認」でPhaseを終了させる場合でも、その後の人間確認がFAILなら正本を再オープンする。
- 自動テストは必要だが、人間受入の代替ではない。