# Phase 2 Review — 2026-07-22

## Resolution after this review

- The unsafe Task 7 draft described below was not committed.
- The replacement implementation removed automatic GAS communication, added stale-safe CSV preview/apply, preserved event/day isolation, and was committed as `1b95c5f`.
- The repository/schema corrections from this review are included in that commit.
- The only remaining Phase 2 work is [Task 8 verification and documentation](../plans/phase-02-task-08.md).

The findings below are retained as historical evidence of why Task 7 was replaced. They are not current blockers and must not be used to claim that Task 7 is unfinished.

## Corrected in the local worktree

- `EventDayRepository`が生のevent/day IDを連結していたため、`a / b:c`と`a:b / c`が同じ保存キーを作れた。repository境界でIDを再検証し、last-openedとindexも不正IDを受け入れないようにした。
- storage schema parserが`CircleRecord.isSale`を復元していなかった。文字列として検証・保持し、有限でないpriorityも拒否するようにした。

## Findings that were deferred at review time and are now resolved

- レビュー時にステージされていたPhase 2 Task 7草案は旧GAS自動通信を残し、CSV置換がpreview IDに紐付かず、`any`も残っていた。その草案はコミットせず [Task 7安全再計画](../plans/phase-02-task-07.md) に従って置換した。
- 複数eventのmap bundleはbuildできるが、runtime map loaderはfirst-event compatibility aliasを読む。event切替はPhase 4 Task 2の原子的遷移として実装する。

## Verified

- `npm run verify`: Webapp 147 tests、GAS 6 tests、型チェック、production build、map asset byte verificationが通過。
- `npm run test:e2e`: mobile Chromium 16 testsが通過（sandbox外で実行）。
- Task 7草案を含む全体Biomeは`noExplicitAny`警告により非ゼロ。review correctionの4ファイルだけはBiome clean。
