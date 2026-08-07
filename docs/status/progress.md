# 進捗

更新日: 2026-08-07

## 現在の対象

- リポジトリ: `tiga-kk/meirochou`
- ブランチ: `feature/phase-05d`
- 計画再作成前のHEAD: `90528fdab3dd27307edeed51021548d5dc2ef0f6`
- 現在のフェーズ: Phase 5D リファクタリング完了作業
- 次に着手するタスク: Task 1

## 現在までに実装済みの主要部分

Phase 5Dの旧計画を最初から実装し直す必要はない。現行コードでは、次がすでに存在する。

- `apps/webapp/js/app/comipath-application.ts`とbrowser entrypointによる小さなlifecycle層
- `features/event-day/`のrepository、active session/reader、event/day切替Use Case
- `features/circle-status/`のstatus変更、undo、GAS outbox処理とController
- `features/circle-data-source/`のCSV/GAS source処理、preview/apply、Controller
- `features/local-data-deletion/`の削除Use CaseとController
- `features/route-guidance/`のSession、開始・再開等のUse Case、Controller、View contractの骨格
- architecture checkerとPhase 5D向けunit/characterization tests

## 残っている主要問題

旧巨大クラスは名前だけ消えた部分があり、責務の移行は完了していない。

1. `apps/webapp/js/comipath-browser-runtime.js`
   - 経路案内の状態、Worker、cache、画面状態、event binding、複数featureの調整を同時に所有している。
2. `apps/webapp/js/event-day-data-store.ts`
   - event/day、circle status、GAS outbox、CSV、legacy compatibilityを一つのFacadeにまとめ、feature Use Caseを内部で再組立てしている。
3. `apps/webapp/js/comipath-dom-coordinator.js`
   - 多数のDOM要素と複数featureの表示処理を一つのオブジェクトに集めている。
4. `apps/webapp/js/navigation/`、`apps/webapp/js/routing/`等と`features/route-guidance/`が併存し、同じfeatureの入口が複数に見える。
5. `tests/legacy-app-files-removed.test.mjs`は旧ファイル名の不存在だけを確認するため、巨大責務を別名へ移しても検出できない。

## 検証基準の現状

2026-08-07のGitHub Actions run `31156422202`では次の結果だった。

- `npm run verify:webapp`: 成功
  - `test:webapp`: 70 files / 490 tests PASS
  - route-guidance focused tests: PASS
  - Phase 5D regression tests: PASS
  - architecture check: PASS
  - TypeScript typecheck: PASS
  - Vite buildとbuild verification: PASS
- `npm run test:e2e`: 失敗
  - 5件は既存visual snapshotとの差分
  - 「同一地点では次目的地ピンを通常ピンより前面に表示する」は初回失敗後retryで成功し、flaky扱い

Phase 5Dは見た目を変更するフェーズではないため、visual snapshotを機械的に更新してGREENにしてはいけない。最終Taskで差分を確認し、既存挙動の回帰なら実装を修正する。意図的な見た目変更だと判断する根拠が既存仕様から得られない場合だけ、snapshot更新前にユーザー判断を求める。

## タスク状態

| タスク | 状態 | 概要 |
|---|---|---|
| Task 1 | 未着手 | Route Guidance固有モジュールの配置を一本化 |
| Task 2 | 未着手 | Route Guidanceの状態所有と処理順序をfeatureへ移管 |
| Task 3 | 未着手 | `EventDayDataStore`を削除して既存featureを直接接続 |
| Task 4 | 未着手 | `ComiPathDomCoordinator`をfeature別Viewへ解体 |
| Task 5 | 未着手 | `ComiPathBrowserRuntime`を削除しbrowser bindingを明示化 |
| Task 6 | 未着手 | architecture guardrailとテスト境界を強化 |
| Task 7 | 未着手 | E2Eを含む最終検証とPhase完了整理 |

タスク完了時はこの表と「次に着手するタスク」だけを実態に合わせて更新する。個別タスク文書へ進捗状態を重複して記録しない。
