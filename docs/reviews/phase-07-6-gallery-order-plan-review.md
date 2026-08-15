# Phase 7.6 一覧順・壁分類 実装計画 敵対的レビュー

## 結論

追加要件を現行コード、C108 map assets、既存Phase 7.6計画へ照合した。初期に考えられた「wall判定を別途推定する」「gallery独自のwall listを持つ」案は不要であり、既存`points.json`の`W_*`を正本にする方針へ縮小した。

下記修正をTask 7〜9と追加designへ反映したため、追加計画は**APPROVED**とする。Phase 7.6実装開始条件は従来通りPhase 7.5 closureであり、このreviewは進捗正本ではない。

## 指摘と修正

### 1. C108 identifierをハードコードする案 — 却下

現行対応は`ア/A/a/め/あ`だが、これはassetから得られる観測値である。runtime constantにすると次回map bundleで再修正が必要になる。

**修正:** `group_id.startsWith("W_")`のpointからarea単位のwall identifier集合をderiveする。対応表はasset test evidenceだけにする。

### 2. CSV/GASへ`queueClass`列を足す案 — 却下

source契約を広げる必要がなく、既存利用者へ入力負担を増やす。

**修正:** `PrepareRouteOptimizationUseCase`が既に読み込むmap assetからderived copyへ`queueClass`を付ける。CSV/GAS/LocalStorageは変更しない。

### 3. 現行optimizerがwallを自動判定しているという誤認 — 修正

`resolveServiceTimeSec()`は`queueClass === "wall"`を読むだけで、production parserはその値を作っていない。

**修正:** Task 7で`W_* -> queueClass -> 既存wallServiceTimeSec`のproduction data flowをtestする。

### 4. galleryのnearest判定へDijkstraを使う案 — 却下

今回必要なのは見た目のsort anchorであり、歩行可能経路の最短距離ではない。grid探索は計算量と依存を不必要に増やす。

**修正:** 同じareaの`center_x/center_y`でユークリッド距離二乗を使う。route graph/distance matrixへ影響させない。

### 5. wall補正のため`Circle.space`を書き換える案 — 却下

spaceはcircle identity、GAS更新、購入状態、route endpoint等へ使われるため危険。

**修正:** gallery専用sort keyだけにanchor identifier/numberを持つ。circle/map/navigation stateはmutationしない。

### 6. priorityを削除しすぎる危険 — 修正

不要なのはpriority **sort** であり、priority filterとcard表示まで消す要件ではない。

**修正:** priority filterと数値表示は維持し、comparatorからだけpriorityを除く。

### 7. 既に存在しないsort buttonをHTMLから削除する計画 — 却下

現行`index.html`にはgallery filter controlsしかなく、sort buttonはない。DOM view側にdead referenceだけが残る。

**修正:** Task 8はHTML再設計をせず、`sortMode` / `changeSortMode()` / stale button refsを削除する。

### 8. wall identifierがnon-wallにも現れる可能性を無視 — 修正

identifier単位でwall扱いする設計では、同一areaで同じidentifierが`W_*`とnon-wallに混在すると誤分類になる。

**修正:** C108 asset testでwall identifier集合とnon-wall identifier集合が交差しないことをgateにする。交差が発生した将来bundleでは推定を広げず、asset側の意味を再確認する。

### 9. cross-area nearest anchor — 却下

pixel座標はarea画像ごとに別座標系であり比較不能。

**修正:** nearest候補は必ず同じareaのpointsだけ。area不明/point不足では元space順へfallbackする。

### 10. gallery openをpoints取得失敗で止める案 — 却下

一覧は補助sort metadataなしでも従来space順で利用できる。

**修正:** 即時space順表示 -> cached loaderでpoints取得 -> 成功時だけ再sort。失敗はnonfatal。

### 11. galleryへfull X timelineを追加する案 — 却下

route detailのrecent postsと役割が重複し、card密度とnetwork triggerを悪化させる。

**修正:** galleryはTask 6のsale mention setから小さい`完売関連`badgeだけ表示する。投稿本文は出さない。

### 12. warningでsort順が変わる危険 — 修正

sale mentionは補助情報であり位置でもpriorityでもない。

**修正:** warning setはclass/badgeだけを差分適用し、sort keyへ入れない。

### 13. 旧Task 7 closureをそのまま残すとTask順が逆転 — 修正

gallery/optimization追加後に旧Task 7でPhase closureしてから追加Taskを実装する順序は不正。

**修正:** 旧closureをTask 9へ移動し、Task 7=wall/optimization、Task 8=gallery、Task 9=統合closureとする。旧adversarial review内の「Task 7」は当時の番号として履歴保持し、本READMEと本reviewを新しい番号の正本とする。

## 最終確認

- 新libraryなし。
- source schema追加なし。
- map bundle generator変更なし。
- ALNS objective/operator変更なし。
- route graph変更なし。
- full X timelineのgallery複製なし。
- priority filter維持。
- map asset failureはgalleryだけ縮退。
- Task 7〜8はそれぞれfocused RED/GREENとproduction wiring evidenceを持つ。
- Task 9でfull regressionへ統合する。

以上により追加計画を承認する。
