# 実装進捗

更新日: 2026-08-13

この文書を、現在フェーズ、現在Task、次に着手するTask、未完了の外部確認の唯一の正本とする。Task文書やREADMEへ進行中のHEAD・次Taskを重複して固定しない。

## 現在状態

- 現在フェーズ: **Phase 7.4（Task 3完了・Task 4着手可能）**
- 現在Task: **Task 4: 独立した地図閲覧surfaceの追加**
- 次に着手するTask: **Task 4**
- canonical plan: `docs/plans/phase-07-4/README.md`
- 設計仕様: `docs/specs/2026-08-13-phase-07-4-route-visual-nearby-map-and-priority-filter-design.md`
- animation診断: `docs/reviews/phase-07-4-route-animation-diagnosis.md`

Task開始時の基準コミットは、実装開始直前に指定ブランチの最新リモートHEADから取得する。計画作成時のSHAを実装基準として固定しない。

## Phase 7.3からの引き継ぎ

Phase 7.3のTask 1〜8の本番実装・自動検証は完了している。次の残件だけをPhase 7.4へ引き継ぐ。

| 項目 | Phase 7.4での扱い |
|---|---|
| current/candidate routeの実機visual未確認 | Task 1でscreen-space診断からやり直し、Task 9でheaded受入 |
| candidateへcurrentと同種のloop animationが広がった表示ドリフト | Task 1でcurrentだけmoving cueへ整理 |
| 一覧以外の購入経路にUndoがない | Task 8 |
| 同一space再送が既存行更新になる実GAS証拠 | Task 9 |
| GAS更新時の既存Sheet列保持の実GAS証拠 | Task 9 |
| map dragの体感遅延 | Task 9で実機再現時のみ証拠取得。証拠なしの追加実装はしない |

Phase 7.3 Task 4では合成PointerEventによる計測で明確な改善を証明できなかった。Phase 7.4ではこの結果を隠さず、今回の新しいmap機能の都合でgesture実装を全面変更しない。

## Phase 7.4 新規要求

ユーザーとの要件対話で次を確定した。

- routeを開始せず開ける独立した「地図」surfaceを追加する。
- 周辺検索の基準地点は「現在地」または地図上の任意地点から選べる。
- priorityは既存Gallery同様、完全一致の複数選択とする。
- 周辺候補はpriority等で絞ってからwalkable grid距離順にし、その後5 / 10 / 15 / 20件で切る。
- 周辺地図は通常holdを除外し、「保留も表示」のときだけ含める。
- 経路案内ではholdを常に除外し、priority条件に一致するcircleだけを巡回対象にする。
- 地図上ではcircle anchorとお品書き画像cardをleader lineで結ぶ。
- 地図閲覧の検索基準変更はRoute Guidanceの現在地を変更しない。

## Phase 7.4

| Task | 内容 | 状態 | 依存 |
|---|---|---|---|
| 1 | 経路animationのscreen-space診断と確実な修正 | 完了 | なし |
| 2 | priority判定規則の共通化 | 完了 | なし |
| 3 | priority条件を通常の経路案内へ適用 | 完了 | Task 2 |
| 4 | 独立した地図閲覧surfaceの追加 | 次に着手 | なし |
| 5 | 任意検索基準地点とgrid origin解決 | 未着手 | Task 4 |
| 6 | grid距離による周辺サークルランキング | 未着手 | Task 2, 5 |
| 7 | 地図上のお品書きカード・leader line・重なり回避 | 未着手 | Task 6 |
| 8 | 一覧以外の購入経路へ最新1件Undoを拡張 | 未着手 | なし |
| 9 | 総合回帰・実機visual・実GAS残件の終了判定 | 未着手 | Task 1〜8 |

Task 1は過去のanimation試行を踏まえ、CSS定数や`animation-name`だけで完了判定しない。原因分析は`docs/reviews/phase-07-4-route-animation-diagnosis.md`を正本とする。

Task 1の自動検証は完了した。390pxのscreen-space線幅、currentだけのmoving cue、candidateの静的表示、reduced-motion、全体回帰を確認済み。headed browserでの目視確認とsnapshot更新は、表示環境が利用可能になった後にPhase 7.4のvisual確認として行う。

Task 2でpriorityの正規化、重複除去・降順収集、未選択/複数完全一致を`shared/domain`へ共通化し、Galleryの既存公開関数は委譲へ移行した。

Task 3でpriority条件を通常の経路案内と開発用デモ経路の候補入力へ適用した。選択状態は画面内だけで保持し、現在のRoute Guidance SessionやLocalStorageは変更しない。候補が0件の場合は案内を開始せず、既存ナビゲーションを保持して通知する。

Task 4〜7のstandalone mapはRoute Guidance Sessionを第二のmap stateとして複製しない。表示状態だけを独立させ、map assets / routing / zoom計算を再利用する。

## 進行規則

- 一度に一Taskずつ実装・review・commitする。
- Task 1を他のvisual変更と同じcommitへ混ぜない。
- 完了済みPhase 7.3 Taskを再実装しない。
- 未完了WIPを破棄、stash、resetして再出発しない。
- 各Taskの基準点は開始直前の最新リモートHEADから取得する。
- import/fixture/credential/headed browser不足だけを実装REDとして扱わない。
- 既存失敗と今回の回帰を分離する。
- snapshotは意味的確認なしに自動更新しない。
- 実GASや実機確認が不能でも、独立して進められるTaskを止めない。
- 新しい依存関係は現在のTaskを既存標準機能で実装できない場合だけ追加する。

過去フェーズの詳細な履歴はGit履歴、各Phase plan、`docs/reviews/`を参照する。
