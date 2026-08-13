# 実装進捗

更新日: 2026-08-13

この文書を、現在フェーズ、現在Task、次に着手するTask、未完了の外部確認の唯一の正本とする。Task文書やREADMEへ進行中のHEAD・次Taskを重複して固定しない。

## 現在状態

- 現在フェーズ: **Phase 7.4（Task 13完了・Task 14着手可能）**
- 現在Task: **Task 14: 独立地図を元の縦横比で初期表示**
- 次に着手するTask: **Task 14**
- canonical plan: `docs/plans/phase-07-4/README.md`
- 初期設計: `docs/specs/2026-08-13-phase-07-4-route-visual-nearby-map-and-priority-filter-design.md`
- follow-up設計: `docs/specs/2026-08-13-phase-07-4-human-acceptance-followups-design.md`
- 人間受入FAIL記録: `docs/reviews/phase-07-4-human-acceptance-failures.md`

Task開始時の基準commitは、実装開始直前の指定branchの最新remote HEADから取得する。過去の文書SHAを実装基準として固定しない。

## Task 1〜9の扱い

Task 1〜8の実装とTask 9の自動検証記録は履歴上完了している。2026-08-13の人間確認でvisual/interaction FAILが判明したため、Task 9の**Phase終了判定だけを失効**させる。

Task 1〜9を未実装へ巻き戻したり、完了commitを書き換えたりしない。追加修正はTask 10以降で行う。

Task 10で44pxの操作領域を維持したまま、pointer位置とpin中心の画面座標から選択候補を最近傍解決する処理を追加した。current/start/purchased等はpointer候補から除外し、keyboard activationは既存buttonを維持した。focused unit 2件、webapp contract 74件、関連E2Eの機能assertion、architecture/typecheck、`git diff --check`がPASSした。visual snapshot 3件は既存差分として更新していない。

Task 11でcandidate経路を連続した青線へ変更し、GestureZoomControllerの描画済みtransform通知を再利用して、通常・candidate経路の線幅をzoomへ追従させた。4pxの可読下限、focused unit 31件、関連E2Eの機能assertion、architecture/typecheck、`git diff --check`がPASSした。visual snapshot 3件は既存差分として更新していない。

Task 12でcurrent routeのcue長・速度をscreen-space計算へ接続し、layout確定時のrendered widthとTask 11のzoom通知だけでCSS custom propertyを更新するようにした。production `CSSAnimation`の自然進行、同一animation instanceをseekしたraster差分、start→goal方向、reduced-motionを関連E2Eで確認した。animation削除・逆方向・透明化のmutationはそれぞれ自然進行・方向・raster assertionでREDになり、復元後のfocused unit 13件、architecture/typecheck、`git diff --check`がPASSした。visual snapshot 2件は既存差分として更新していない。

Task 13で周辺地図へpriority複数選択、5/10/15/20件、保留表示controlsを追加し、既存`setNearbyFilters()`へ接続した。カードを選択可能なcontainerへ変更し、選択状態と「お品書きを見る」「目的地にする」actionを追加した。目的地callbackは`handleSetNextTarget()`の明示boolean結果だけで成功時にsurfaceを閉じ、失敗時は開いたままにした。focused E2E 1件、nearby unit 6件、priority/ranking、architecture/typecheck、`git diff --check`がPASSした。既存visual snapshot 2件は更新していない。

## 人間確認で判明した未解決事項

| 項目 | 対応Task |
|---|---|
| 近接する地図pinの44px hit areaが重なり候補を選び分けにくい | Task 10 |
| 行き先変更candidateの青線が破線で途切れて見える | Task 11 |
| 拡大時も赤/青経路線が太いままで通路を覆う | Task 11 |
| current route animationを人間が視認できない | Task 12 |
| 周辺地図にpriority / 件数 / holdの操作UIがない | Task 13 |
| 周辺cardを選択して目的地にする操作がない | Task 13, 15 |
| 周辺cardが重なり、前面化できない | Task 15 |
| leader lineが細く地図上で追いにくい | Task 15 |
| standalone mapが固定的な横長viewportで不格好 | Task 14 |
| 購入Undo後に現在地フォームが空欄になる | Task 16 |
| 拡大時に現在見ている配置付近が分からない | Task 17 |

詳細な再現・現行コード根拠は`docs/reviews/phase-07-4-human-acceptance-failures.md`を参照する。

## Phase 7.4

| Task | 内容 | 状態 | 依存 |
|---|---|---|---|
| 1 | 経路animationのscreen-space診断と修正 | 完了 | なし |
| 2 | priority判定規則の共通化 | 完了 | なし |
| 3 | priority条件を通常の経路案内へ適用 | 完了 | Task 2 |
| 4 | 独立した地図閲覧surfaceの追加 | 完了 | なし |
| 5 | 任意検索基準地点とgrid origin解決 | 完了 | Task 4 |
| 6 | grid距離による周辺サークルランキング | 完了 | Task 2, 5 |
| 7 | 地図上のお品書きカード・leader line・配置 | 完了（人間受入で不足判明） | Task 6 |
| 8 | 一覧以外の購入経路へ最新1件Undoを拡張 | 完了（現在地復元不足） | なし |
| 9 | 初回の総合回帰・外部確認記録 | 完了（終了判定は失効） | Task 1〜8 |
| 10 | 近接地図ピンの選択曖昧性を解消 | 完了 | なし |
| 11 | 候補経路の連続表示とズーム連動線幅 | 完了 | Task 10後推奨 |
| 12 | 経路animationを実描画基準で再診断 | 完了 | Task 11 |
| 13 | 周辺地図の絞り込みcontrolsとcard actionを接続 | 完了 | なし |
| 14 | 独立地図を元の縦横比で初期表示 | 未着手 | Task 13 |
| 15 | 周辺カードを画面座標で非重複配置 | 未着手 | Task 11, 13, 14 |
| 16 | 購入Undoで現在地入力も復元 | 未着手 | なし |
| 17 | 地図viewport中心の配置位置を常時表示 | 未着手 | Task 11, 14 |
| 18 | 人間受入と回帰検証でPhaseを再終了 | 未着手 | Task 10〜17 |

## 既存の外部確認残件

- 実GASで同一space再送が新規行追加ではなく既存行更新になる明示証拠。
- GAS更新時に対象外の既存Sheet列が保持される明示証拠。
- Phase 7.3からのmap drag体感遅延はphysical inputで再現できる場合のみ再調査する。証拠なしでgesture実装を書き換えない。

これらはTask 18で環境が利用できれば確認する。資格情報や実機が利用不能なら理由付き未確認として残せる。

## 進行規則

- 一度に一Taskずつ実装・review・commitする。
- Task 10〜17は各Taskのfocused REDを先に作る。
- Task 12のanimationはcomputed styleだけで完了判定しない。
- Task 18はheadless自動テストだけで人間受入済みにしない。
- 完了済みTask 1〜9のcommitをrebase/resetで作り直さない。
- 未完了WIPを破棄、stash、resetして再出発しない。
- 各Taskの基準点は開始直前の最新remote HEADから取得する。
- snapshotは意味的・人間visual確認なしに一括更新しない。
- 新しい依存関係は既存標準機能で要件を満たせない場合だけ追加する。

過去の自動検証結果は`docs/reviews/phase-07-4-field-verification.md`、今回の人間受入FAILは`docs/reviews/phase-07-4-human-acceptance-failures.md`を参照する。
