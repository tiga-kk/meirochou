# 実装進捗

更新日: 2026-08-12

この文書を、現在フェーズ、現在Task、次に着手するTask、未完了の外部確認の唯一の正本とする。Task文書やREADMEへ進行中のHEAD・次Taskを重複して固定しない。

## 現在状態

- 現在フェーズ: **Phase 7.3**
- 現在Task: **Task 8: 実機受入・回帰検証・終了判定**
- 次に着手するTask: **Task 8**
- 実装状態: **Task 1〜7完了、Task 8未着手**
- canonical plan: `docs/plans/phase-07-3/README.md`
- 設計仕様: `docs/specs/2026-08-12-phase-07-3-field-followups-design.md`

Task開始時の基準コミットは、実装開始直前に指定ブランチの最新リモートHEADから取得する。将来の固定SHAをこの文書へ保存しない。

## Phase 7.2 引き継ぎ

Phase 7.2 Task 1〜7の本番実装は完了している。Task 8は検証作業自体は実施済みだが、受入条件の一部が未確認のためPhase全体を完全完了とはしない。

詳細な証拠は `docs/reviews/phase-07-2-field-verification.md` を正本とする。

| 項目 | 状態 | 備考 |
|---|---|---|
| Task 1〜7 | 完了 | mainの本番実装へ反映済み |
| Task 8 自動検証 | 実施済み | `npm run verify` PASS。E2Eは50 passed、visual差分7、private fixture由来skip 8 |
| extension → 実GAS headed smoke | 未確認 | headed browser / credential / test deploymentが必要 |
| visual baselineの実画面確認 | 未確認 | snapshotを自動更新せずPhase 7.3 Task 8へ引き継ぐ |

Phase 7.3は上記未確認を隠すための再実装ではない。実機で見つかった新しい要求を修正し、Task 8で持ち越し確認も閉じる。

## Phase 7.3

| Task | 内容 | 状態 | 依存 |
|---|---|---|---|
| 1 | サークルスペース表記の正規化 | 完了 | なし |
| 2 | カタログ拡張→GAS POST経路の診断 | 完了 | Task 1 |
| 3 | 購入済みピン非表示と候補表示の分離 | 完了 | なし |
| 4 | 地図ドラッグ遅延の計測と最小改善 | 完了 | Task 3 |
| 5 | 現在経路の方向表示強化 | 完了 | Task 3 |
| 6 | 目的地カタログのモバイルレイアウト修正 | 完了 | Task 3 |
| 7 | Gallery購入時の退出表示と完全Undo | 完了 | Task 3 |
| 8 | 実機受入・回帰検証・終了判定 | 未着手 | Task 1〜7 |

Task 2は自動検証まで完了したが、実GAS deployment、資格情報、headed browserが利用できず、実機probe・catalog POST・同一space再送・Sheet列確認は未確認としてTask 8へ引き継ぐ。Task 3以降を阻止しない。

Task 4はfocused/全体自動検証を通過したが、実機DevTools traceは利用できず、before/afterの実機性能差は未確認としてTask 8へ引き継ぐ。構造上はdrag中のみcompositor hintを付け、終了時に解除する。

Task 5は意味的契約・全体自動検証を通過したが、実機visualと新しいsnapshot baselineは未確認としてTask 8へ引き継ぐ。既存snapshotは自動更新していない。

Task 6は390pxのportraitカタログ一列、200% zoomの横overflowなし、640px以上のportrait二列をfocused E2Eで確認し、`npm run verify`も通過した。意図した画像高さ変更による既存visual snapshot差分は更新せず、実機visual確認とともにTask 8へ引き継ぐ。

Task 7はGalleryの実DOM購入ボタン・swipeから退出表示と最新1件Undo snackbarへ接続し、既存status Undoと逆向きGAS outbox、購入前route session snapshotを一貫して戻すfocused/unit/E2Eと`npm run verify`を通過した。実機visualと実GAS/headed確認はTask 8へ引き継ぐ。

複数Taskが着手可能な場合、WIPがあればそれを優先し、なければ番号が最小の着手可能Taskを選ぶ。したがって次はTask 8が着手可能である。

Task 2の実GAS確認だけが外部環境待ちになった場合は、その事実をここへ記録してTask 3以降を進める。Task 8で再確認する。

## Cloudflare Pages運用

アプリTaskとは別トラックで次を行う。

| 項目 | 状態 |
|---|---|
| production branchを`main`として維持 | 設定確認待ち |
| preview branch deploymentsを`None`にする | 設定待ち |
| feature/docs branchで新規Pages previewが作られないことを確認 | 未確認 |
| GitHub Actions CIを維持 | 変更不要 |

手順は `docs/plans/phase-07-3/operations-cloudflare-pages-main-only.md` を参照する。Cloudflareアカウント権限がないことをPhase 7.3 Task 1〜8の停止条件にしない。

## 進行規則

- 完了済みTaskをやり直さない。
- 未完了WIPを破棄、stash、resetして再出発しない。
- 各Taskの基準点は開始直前の最新リモートHEADから取得する。
- import/fixture/credential/headed browser不足だけを実装REDとして扱わない。
- 既存失敗と今回の回帰を分離する。
- snapshotは意味的確認なしに自動更新しない。
- 外部仕様判断が不要な文書・実装問題は、外部確認待ちと並行して進める。

過去フェーズの詳細な履歴はGit履歴、各Phase plan、`docs/reviews/`を参照する。
