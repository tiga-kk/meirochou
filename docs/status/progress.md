# 進捗

更新日: 2026-08-08

## 現在の対象

- リポジトリ: `tiga-kk/meirochou`
- ブランチ: `feature/phase-05d`
- 追加計画作成前のHEAD: `6b1499bda9323acb8e77f4bfcd35007d1f8a5114`
- 現在のフェーズ: Phase 5D リファクタリング完了作業
- 次に着手するタスク: Task 8 Stage 8D-B（購入・保留後のRoute Guidance再構築）
- Task 8の基準コミット: `ac8f2b035b3bf22b3ed03221eceebb8ccbf3f63a`
- 直近のTask 8 WIPコミット: `24cf35fa9724e4b433e2c2573bf8b17d173481c2`
- Stage 8D-A実装完了HEAD: `d9978339613201b838a53ed4865fbb001b2f056c`
- Stage 8D-B補足計画: `docs/plans/phase-05d/task-08-stage-8d-b-route-reconstruction.md`

## Task 8 WIPの再開状態

`24cf35fa9724e4b433e2c2573bf8b17d173481c2`は破棄しない。Task 8の初回実装途中では、次のend-state差分だけが先行した状態で停止していた。

- `apps/webapp/js/app/bind-browser-events.ts`: `// @ts-nocheck`を先行削除し、一部に`any`/index signatureを追加した。
- `tests/architecture-boundaries.test.mjs`: Task 8完了後に必要となるarchitecture ruleのfixtureを先行追加した。
- `tests/browser-binding-ownership.test.ts`: 最終ownership契約と、当時未作成だった`complete-circle-visit.ts`を前提とするtestを先行追加した。

Stage 8Aでこれらの先行差分を安全な中間baselineへ戻した後、Stage 8B以降を段階的に実装している。WIPコミット自体は履歴へ保持する。

### Stage 8A〜8Cの状態

Stage 8Aは完了した。WIPで先行追加された型注釈、ownership test、architecture fixtureだけを戻し、WIPコミット`24cf35f`は履歴へ保持している。`npm run verify:webapp`と`git diff --check`が成功している。

Stage 8Bも完了した。event/day、circle status/GAS outbox、circle data source、event registry loader、local data deletionの生成をcomposition rootへ寄せ、BrowserEventBindingへ注入した。background processのstart/stopとlocal deletionのRoute Guidance cleanup callbackを関連テストで確認している。

Stage 8Cも完了した。Route Guidanceのsession、map catalog、assets loader、snapshot/matrix repository、operations、runtime controller、Use Case、Controllerをcomposition rootで一度だけ生成してBrowserEventBindingへ注入し、7つの`Object.defineProperties` state proxyを削除した。開始・選択・購入/保留・resume・ALNS・resetの状態更新をSessionのsnapshot commitへ統一し、`nextTarget`は派生値として扱っている。既存workflow、manifest検証、snapshot callback、runtime disposeを関連テストで確認した。

### Stage 8D-Aの状態

Stage 8D-Aは`d9978339613201b838a53ed4865fbb001b2f056c`で完了した。

- `apps/webapp/js/app/complete-circle-visit.ts`を作成し、purchase/holdのCircle Status mutationをplain operationへ切り出した。
- productionのpurchase/holdはcomposition rootから注入された同operationを経由する。
- local save失敗時にRoute Guidanceへ進まないための前半の順序を固定した。
- `tests/complete-circle-visit.test.ts`とproduction integration testを追加した。

一方、status mutation成功後のpurchase/hold別NavigationState遷移、到着位置確定、次target決定、route再構築、Session commitはまだ`BrowserEventBinding.handleAction()`に残っている。この部分は既存`FinishCurrentCircleUseCase`の契約だけでは安全に移管できなかったため、Stage 8D-Aで推測実装せず停止した判断を正しいものとする。

次の一回は`docs/plans/phase-05d/task-08-stage-8d-b-route-reconstruction.md`だけをStage 8D-Bの具体的な実装指示として使用する。Stage 8D-C以降を同じ実装担当へまとめて渡さない。

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

Task 8 Stage 8A〜8D-Aまででconcrete dependency assemblyとRoute Guidance state ownershipの移管は進んだが、次のworkflowはまだ残っている。

- purchase/hold後のRoute Guidance進行とroute再構築
- destination selection / compare / confirm / cancel
- resume/snapshotの一部workflow
- Circle Data Source等の残存wrapper
- settings画面projection

したがって問題は「行数が多いこと」ではなく、Task 5で意図したbrowser binding境界まで責務移管がまだ完了していないことである。

さらに現行`check-webapp-architecture.mjs`では、非composition-root app moduleのconcrete infrastructure検査から`bind-browser-events.ts`だけが明示的に除外されている。この例外はStage 8Gで、binderが実際に最終境界へ縮小した後に削除する。

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
| Task 8 | 進行中 | Stage 8D-Aまで完了。次はStage 8D-Bでpurchase/hold後のroute再構築をfeatureへ移す |
| Task 9 | 未着手 | 残ったbrowser event registrationをowner別に分割 |
| Task 10 | 未着手 | visual snapshot 5件を根拠付きで解消 |
| Task 11 | 未着手 | 修正後HEADでPhase 5D全体を再検証 |

タスク完了時はこの表と「次に着手するタスク」を実態に合わせて更新する。個別タスク文書へ進捗状態を重複して記録しない。
