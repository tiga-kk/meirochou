# 進捗

更新日: 2026-08-07

## 現在の対象

- リポジトリ: `tiga-kk/meirochou`
- ブランチ: `feature/phase-05d`
- 追加計画作成前のHEAD: `6b1499bda9323acb8e77f4bfcd35007d1f8a5114`
- 現在のフェーズ: Phase 5D リファクタリング完了作業
- 次に着手するタスク: Task 8（WIPから再開）
- Task 8の基準コミット: `ac8f2b035b3bf22b3ed03221eceebb8ccbf3f63a`
- 直近のTask 8 WIPコミット: `24cf35fa9724e4b433e2c2573bf8b17d173481c2`

## Task 8 WIPの再開状態

`24cf35fa9724e4b433e2c2573bf8b17d173481c2`は破棄しない。Task 8の実装途中で、次の差分だけが入った状態で停止している。

- `apps/webapp/js/app/bind-browser-events.ts`: `// @ts-nocheck`を先行削除し、一部に`any`/index signatureを追加した。
- `tests/architecture-boundaries.test.mjs`: Task 8完了後に必要となるarchitecture ruleのfixtureを先行追加した。
- `tests/browser-binding-ownership.test.ts`: 最終ownership契約と、未作成の`complete-circle-visit.ts`を前提とするtestを先行追加した。

一方、Task 8の中心であるcomposition rootへのdependency assembly移管、Route Guidance workflow移管、`complete-circle-visit.ts`作成、architecture checker本体のrule追加は未実装である。Stage 8A開始前のWIPではfocused architecture/ownership testと`typecheck:webapp`が失敗していた。

再開時は、上記WIPのred testや型エラーを単独でGREEN化することから始めない。`docs/plans/phase-05d/task-08-repair-browser-binding-ownership.md`の「WIP再開時の段階ゲート」に従い、Stage 8Aから一つずつ実行する。

### Stage 8Aの状態

Stage 8Aは完了した。WIPで先行追加された型注釈、ownership test、architecture fixtureだけを戻し、WIPコミット`24cf35f`は履歴へ保持している。`npm run verify:webapp`と`git diff --check`が成功している。

Stage 8Bも完了した。event/day、circle status/GAS outbox、circle data source、event registry loader、local data deletionの生成をcomposition rootへ寄せ、BrowserEventBindingへ注入した。background processのstart/stopとlocal deletionのRoute Guidance cleanup callbackを関連テストで確認している。

Stage 8C-Aも完了した。Route Guidanceのsession、map catalog、assets loader、snapshot/matrix repository、operations、runtime controller、Use Case、Controllerをcomposition rootで生成し、BrowserEventBindingへ注入した。開始フローが注入済みControllerへ到達することと、既存のmanifest検証契約を確認している。`Object.defineProperties`によるstate proxyと既存workflowは次の内部サブステップまで維持する。

次はStage 8C-B（Route Guidance mutable state ownershipの移管）であり、Stage 8C-Aの独立レビューと検証完了なしに着手しない。

## 現在までに実装済みの主要部分

Task 1〜6は実装済みである。

- Route Guidance固有moduleは`features/route-guidance/`へ概ね集約済み。
- `EventDayDataStore`は削除済み。
- `ComiPathDomCoordinator`は削除済み。
- `ComiPathBrowserRuntime`は削除済み。
- event/day、circle status、circle data source、local data deletion、route guidanceのfeature Session/Use Case/Controller/Viewが存在する。
- composition root、browser lifecycle、architecture checker、Phase 5D向けunit/characterization testsが存在する。
- Task 7で機能系E2Eの回帰修正とfull verificationの一部まで完了した。

## Task 7で判明した追加blocker

### 1. `bind-browser-events.ts`が新しい大規模Facadeになっている

旧3 Facadeのファイル自体は削除されたが、`apps/webapp/js/app/bind-browser-events.ts`へ旧browser runtime由来の責務が集中している。

現行fileはbrowser event registration以外にも、次を扱っている。

- concrete Repository / storage / GAS / route infrastructureの生成
- Route Guidance Session、snapshot/matrix、Worker runtimeの生成とstate proxy
- event registry取得とevent/day open
- Circle Data Sourceのrequest/cancellation state wrapper
- purchase/hold/resetとRoute Guidance進行のcross-feature workflow
- settings画面projection
- route assets取得、candidate ranking、route start/resume/selection/snapshot処理

したがって問題は「行数が多いこと」ではなく、Task 5で意図したbrowser binding境界まで責務移管が完了していないことである。

さらに現行`check-webapp-architecture.mjs`では、非composition-root app moduleのconcrete infrastructure検査から`bind-browser-events.ts`だけが明示的に除外されている。この例外によりTask 6のguardrailが上記問題を検出できていない。

Task 8で所有権を修復し、Task 9で残った純粋なevent registrationをowner別に分割する。

### 2. visual snapshot 5件がCI固定環境で安定して失敗する

2026-08-07のGitHub Actions run `31176251395`では次の状態を確認した。

- `npm run verify:webapp`: 成功
  - `test:webapp`: 70 files / 478 tests PASS
  - route-guidance focused tests: PASS
  - Phase 5D regression tests: PASS
  - architecture check: PASS
  - TypeScript typecheck: PASS
  - Vite build / build verification: PASS
- `npm run test:e2e`: 失敗
  - 33件PASS
  - 8件skip
  - 5件FAIL
  - failureは既知visual snapshot 5件に限定

対象:

1. `settings-shell-source-manager.png`
2. `outbox-recovery-panel.png`
3. `scoped-deletion-dialog.png`
4. `navigation-map-catalog.png`
5. `navigation-map-route-candidate.png`

各snapshotはretry後も同じ種類の差分が再現しているため、単なるflaky testとして扱わない。

履歴上、`0a2c04286d804f4041508622ef48e2cd7ff9cdbf`で今回対象を含むmobile snapshotがCI renderingへ明示的に揃えられている。Phase 5D中に一部management snapshotはさらに更新されている一方、route guidance側にはPhase baseからbaseline画像が変わっていない対象もある。このため全snapshotの一括更新は行わない。

Task 10で5枚を個別に`REGRESSION`または`BASELINE_UPDATE`へ分類し、根拠に応じてproduction修正またはCI固定環境での限定baseline更新を行う。

## Task 7の扱い

Task 7は「失敗」でも「完了」でもなく、最終検証中に既存計画外のblockerを発見した状態とする。

Task 7で得た検証結果は原因調査のbaselineとして利用するが、Task 8〜10でproduction/test snapshotが変わるためPhase完了の最終証拠にはしない。Task 11でfull verificationを再実行する。

## タスク状態

| タスク | 状態 | 概要 |
|---|---|---|
| Task 1 | 完了 | Route Guidance固有モジュールの配置を一本化 |
| Task 2 | 完了 | Route Guidanceの状態所有と処理順序をfeatureへ移管 |
| Task 3 | 完了 | `EventDayDataStore`を削除して既存featureを直接接続 |
| Task 4 | 完了 | `ComiPathDomCoordinator`をfeature別Viewへ解体 |
| Task 5 | 完了 | `ComiPathBrowserRuntime`を削除しbrowser bindingを明示化 |
| Task 6 | 完了 | architecture guardrailとテスト境界を強化 |
| Task 7 | 中断 | 最終検証中にbrowser binding ownershipとvisual snapshotの追加blockerを発見 |
| Task 8 | 中断 | WIP `24cf35f`からStage 8Aを再開する |
| Task 9 | 未着手 | 残ったbrowser event registrationをowner別に分割 |
| Task 10 | 未着手 | visual snapshot 5件を根拠付きで解消 |
| Task 11 | 未着手 | 修正後HEADでPhase 5D全体を再検証 |

タスク完了時はこの表と「次に着手するタスク」を実態に合わせて更新する。個別タスク文書へ進捗状態を重複して記録しない。
