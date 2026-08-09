# 進捗

更新日: 2026-08-09

## Phase 6 Task 9 の状態

Phase 6 Task 9（ユーザー体験の最終検証）は完了した。経路変更確定後のsnapshot保存、resume中の古いALNS進捗によるsnapshot上書き、低速・範囲外パンのsettle、ギャラリー購入ボタンの44pxタッチターゲット、予定pinのaccessible nameを修正し、計画書が要求する統合検証を追加した。

追加・更新した検証:

- 経路変更→確定→購入→次のお品書き表示
- 経路変更確定→LocalStorage snapshot→reload→変更後目的地で再開
- GAS delivery失敗後の次目的地表示と候補経路非表示
- ギャラリーの左右実スワイプによる購入と端末保存
- CSV/GAS guideのvalidation差分
- 予定一覧と地図pinの番号・accessible name整合
- 44px購入ボタン、200%表示、地図操作、既存のlocal save failure回帰

検証結果:

- `npm run verify`: 成功（webapp 647 tests、Route Guidance 35 tests、Phase 5D回帰4 tests、architecture/typecheck/build/GASを含む）
- `npm run test:e2e:ci`: 成功（43 passed / 8 skipped）
- `npx biome check`: repo-wideでは89 errors / 116 warnings / 8 infos。mainでも同じ結果を再現し、Phase 6で追加したコードによる新規errorではない。変更箇所の機械的な既存format debtは修正せず、Phase 6の回帰とは分離して記録する。
- `node scripts/audit-public-tree.mjs`と`git diff --check`: 成功

次に着手するPhase 6タスクはない。外部公開や不可逆変更を伴う次フェーズは自動開始しない。

## 現在の対象

- リポジトリ: `tiga-kk/meirochou`
- ブランチ: `feature/phase-05d`
- 追加計画作成前のHEAD: `6b1499bda9323acb8e77f4bfcd35007d1f8a5114`
- 現在のフェーズ: Phase 5D 完了
- 次に着手するタスク: なし（次Phaseは自動開始しない）
- Task 12の診断対象コードHEAD: `9098ebe88e37332ce8e7a14d5d08497ee28ca03b`
- Task 12計画: `docs/plans/phase-05d/task-12-finish-responsibility-boundaries-and-test-coverage.md`
- Task 12の完了コミット: `7928cc986f29d7abec5767dfdb4cbc27f4881684`
- Task 8の基準コミット: `ac8f2b035b3bf22b3ed03221eceebb8ccbf3f63a`
- 直近のTask 8 WIPコミット: `24cf35fa9724e4b433e2c2573bf8b17d173481c2`
- Stage 8D-A実装完了HEAD: `d9978339613201b838a53ed4865fbb001b2f056c`
- Stage 8D-B補足計画: `docs/plans/phase-05d/task-08-stage-8d-b-route-reconstruction.md`

Task 12の実装開始SHAは固定しない。開始時に最新remote `feature/phase-05d`を取得し、production/test差分が進んでいれば計画前提を再評価する。

## Task 11後の独立レビュー

Task 11 HEAD `9098ebe88e37332ce8e7a14d5d08497ee28ca03b`では、GitHub Actions Webapp CI、`npm run verify:webapp`、CI相当E2E等はGREENである。ただし、Phase 5Dの責務分離を独立に再確認した結果、CI GREENだけでは検出されない残存問題を確認したため、Phase完了判定を再度開いた。

確認した主な問題:

1. Task 9で`bind-browser-events.ts`から削除した責務の多くが`browser-application.ts`へ移動している。`BrowserApplication`は`// @ts-nocheck`のまま、Event Day Repository/Session、registry/manifest、Route Guidance assets/route planner/snapshot/matrix、settings/outbox/deletion等を広く所有している。
2. architecture checkerは`browser-application.ts`を非composition-root app moduleのconcrete infrastructure検査から明示的に除外し、architecture testもその例外を正しいものとして固定している。
3. initial event/day openを`BrowserApplication.bootstrapApp()/init()/openEventDay()`と`EventDaySelectorController.start()`の二経路が扱っており、ownerが一本化されていない。さらに`SwitchEventDayUseCase.execute()`はRepositoryのlast-opened Refがrequested Refと同じ場合に早期returnするため、durable last-openedとruntime初期化済み状態を同一視するとstartup manifest validationを飛ばす危険がある。
4. `SwitchEventDayUseCase`はmanifest loaderを注入できる一方、未注入時に`globalThis.fetch`を直接使うHTTP fallbackを持つ。
5. Route Guidance snapshot contractは、簡易`NavigationSnapshot`、LocalStorage用の実`NavigationSnapshot`、`ResumeRouteGuidanceUseCase`内の`ResumeNavigationSnapshot`の実質3系統があり、composition rootは簡易snapshotの引数を使わずController側のsaveを呼ぶadapterで接続している。
6. `RouteGuidanceController`が同featureの`infrastructure/local-storage-route-guidance-snapshot-repository`と`infrastructure/route-guidance-runtime-controller`へ直接依存している。
7. Route Guidanceのpoints/grid runtime validationを行う`parsePointsPayload()` / `parseGridMeta()`がEvent Day infrastructureに残り、Route Guidance HTTP loader自体はJSONを型castするだけである。BrowserApplicationからparser呼出だけを消すと既存validationを失う。
8. composition rootに`browserRuntime: any`、後から差し替えるsnapshot callback、`Record<string, unknown>` cast、start後生成値と一致しない可能性がある公開戻り値等が残る。
9. Pending GAS Update / Local Data Deletionのrequest version、busy、result/error等のfeature固有mutable stateが`BrowserApplication`に残っている。
10. `tests/navigation-runtime-startup.test.ts`が削除済み`comipath-browser-runtime.js`をimportしたまま残るだけでなく、distance matrix、navigation runtime/state、route module boundary、Task 10 demo regression等を含む複数の現行webapp testが`test:webapp`の手書きfile listから漏れている。現在のCI GREENは全test discoveryの証拠になっていない。
11. `tests/comipath-application-responsibility.test.mjs`は特定fileの200行上限だけを確認しており、別名の大きなapplication classへ責務を移す実装を防止できない。
12. dev demo用route処理と`tests/task10-demo-route-regression.test.mjs`が`BrowserApplication`のprivate寄り実装へ結び付いており、production境界修正時にchecker例外や不要なpublic API拡大を誘発する危険がある。

これらはTask 10のsnapshot判断やTask 11のテスト実行結果を無効にするものではない。Task 11はそのHEADでの検証実績として維持する。ただしTask 12でproduction/test/architecture checkerを変更するため、Phase 5Dの最終完了証拠はTask 12後に再取得する。

Task 12の詳細な実装contract、Stage順序、受入条件は`docs/plans/phase-05d/task-12-finish-responsibility-boundaries-and-test-coverage.md`を正本とする。

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

### Stage 8D-Bの状態

Stage 8D-Bは完了した。Circle Status保存後のpurchase/hold別Route Guidance進行、到着位置の確定、次targetのroute再構築を`FinishCurrentCircleUseCase`へ移管し、status成功後にpending circlesを再取得してRoute Guidanceへ渡すproduction wiringを接続した。route再構築失敗時はCircle Statusの成功結果を保持し、Route Guidance Sessionは変更しない。

`BrowserEventBinding.handleAction()`からpurchase/hold固有のNavigationState遷移、assets取得、route geometry計算、Session commitを削除した。focused tests、Route Guidance tests、webapp全体テスト、architecture/typecheck、Phase 5D回帰テストが成功している。

次の一回はStage 8D-Cでdestination selection / preview / compare / confirm / cancelを移管する。Stage 8D-D以降を同じ実装担当へまとめて渡さない。

### Stage 8D-Cの状態

Stage 8D-Cは`e2f0b62`で完了した。candidate route選択、preview、compare、confirm、cancel、通常の手動目的地変更を`ChangeDestinationUseCase`と`RouteGuidanceController`へ移管し、route計算失敗時のcurrent route保持、stale候補の無効化、cross-area判定を固定した。`BrowserEventBinding`からdestinationのroute計算、NavigationOperations、Session snapshot組立てを削除した。

次の一回はStage 8D-Dでresume/snapshot ownershipを移管する。

### Stage 8D-Dの状態

Stage 8D-Dは`a57688a`で完了した。resume startupの判定入口、snapshot復元、route geometry再構築、距離行列検証、ALNS warm-start、失敗時の再試行保持、Worker stale callback無効化をRoute Guidance Controller/Use Case/Runtime Controllerへ移管した。BrowserEventBindingはresume dialogの入力・表示とController呼び出しだけを担当し、composition rootのsnapshot/matrix cleanupもbinder内部を逆参照しない構成へ整理した。

focused tests、Route Guidance tests、architecture/typecheckが成功した。`tests/navigation-runtime-startup.test.ts`の削除済み`comipath-browser-runtime.js` import失敗は既存obsolete testとして切り分け済みで、今回の実装不合格には数えない。

次の一回はStage 8Eで残るduplicate wrapperとsettings projectionを整理する。

### Stage 8Eの状態

Stage 8Eは`af51914`で完了した。Circle Data Source Sessionの動的wrapper、local deletionのbinder直叩き、settings source/delete projectionの重複を除去し、既存Controller/Sessionとpure model builderへ寄せた。outbox retry/discard、preview cancel、削除後のevent/day再選択とRoute Guidance invalidationの挙動を維持している。

`npm run test:webapp`（71 files / 512 tests）、`npm run test:route-guidance`、architecture/typecheck、focused tests、`git diff --check`が成功した。

次の一回はStage 8Fでbinder contractを型で固定する。

### Stage 8Fの状態

Stage 8Fは未完了・保留とした。`bind-browser-events.ts`から`@ts-nocheck`を外すと、binder本体だけでなく`DomRouteGuidanceView`の未整備なpublic surface、custom elementのDOM型、既存の未定義`handleResetHold()`参照まで同時に露出し、同じ初回implicit `any` blockerで2回停止した。未完了差分は基準HEADへ戻している。

Task 11完了を優先するため、計画の依存順を一時的に調整し、Task 9でBinderを責務別functionへ縮小してからStage 8Fを再評価する。これはTask 9の「Task 8完了」前提に対する明示的なblocker例外であり、Stage 8Fを完了扱いにはしない。

Task 9でevent ownershipを整理し、残ったbinderを責務別functionへ縮小した。Stage 8Fの型境界も確認済みで、次はStage 8Gへ進む。

### Stage 8Fの再評価結果

Stage 8Fは、Task 9後の縮小されたbinder contractを対象として完了した。`bind-browser-events.ts`と各`bind-*.ts`に`@ts-nocheck`、広い`any`、index signatureはなく、`bindBrowserEvents`の依存と戻り値は明示型である。`CustomEvent.detail`は`CustomEvent<unknown>`境界を維持し、business validationはapplication側へ委譲している。`browser-application.ts`の既存`@ts-nocheck`完全除去はStage 8Fのbinder contract対象外として保留する。

`npm run test:webapp`（72 files / 522 tests）、`npm run test:route-guidance`（28 tests）、Phase 5D回帰（4 tests）、architecture/typecheck、build、`git diff --check`が成功した。独立レビューもPASSである。

### Stage 8Gの状態

Stage 8Gは、`bind-browser-events.ts`のconcrete infrastructure特例をarchitecture checkerから削除し、全`app/bind-*.ts`を同じguardrailの対象に戻して完了した。`localStorage`と`new Worker(...)`の直接利用を検出するnegative rule、concrete infrastructure importを検出するfixture、DOM listenerとfeature public APIを許可するpositive fixtureを追加した。runtime moduleである`browser-application.ts`の扱いは既存責務を維持するため明示fixtureで固定している。

Stage 8Gの検証は、focused 46 tests、`npm run test:webapp`（72 files / 525 tests）、`npm run test:route-guidance`（28 tests）、Phase 5D回帰（4 tests）、architecture/typecheck、build、`git diff --check`が成功した。独立レビューではguardrailとfixtureはPASSで、進捗記録のテスト数のみ補正した。

### Task 10の状態

Task 10は完了した。開始時の5候補に加え、先行failure解消後に露出した`source-diff-dialog`と`route-comparison`も、CI整合履歴・DOM/CSS・現行specの状態を根拠に対象snapshotだけを更新した。toast非表示の意図はE2E assertionで固定し、Flow1の`isSale=x` fixture不整合は空欄へ修正した。対象Flowの更新なし検証は成功した。

Task 11は完了した。`npm run verify:webapp`、resume反復6/6、`npm run test:e2e:ci`（38 passed / 8 skipped）、public tree audit、差分検査を最新作業内容で確認した。resumeのsnapshot契約は`optimizationGeneration`と動的`savedAt`を正しく検証するよう補正し、full E2Eでflakyを再現しないことを確認した。

Task 11の検証結果は`9098ebe`時点のbaselineとして有効である。ただしTask 12でproduction/test/architecture checkerを変更するため、Phase 5Dの最終完了判定にはTask 12後の再検証を使用する。

### Task 12の状態

Task 12は完了した。Stage 12A〜12Fで、BrowserApplicationの型境界、Event Day startup transition、Pending GAS request state、Route Guidanceのsnapshot/map asset境界、architecture checker、webapp test discoveryを整理した。デモ用manifest接続、起動失敗時の診断画面、地図領域の受け渡し、自動GAS送信と手動再送の表示状態分離も追加のE2E回帰修正として完了している。

最終検証は、`npm run test:webapp`、`npm run test:route-guidance`、`npm run test:phase-05d-regressions`、`npm run check:webapp`、`npm run build:webapp`、`npm run verify:webapp:build`、`npm run verify:gas`、`npm run test:e2e:ci`（38 passed / 8 skipped）、`node scripts/audit-public-tree.mjs`、`git diff --check`で成功した。レビュー指摘対応として、resume pending filterの括弧と`removedFromSource=true`かつ明示的`pending`のfocused test、`startFromCurrentLocation()`のController所有入力境界、demo regression testの`BrowserApplication.prototype`依存を修正した。追加のfocused検証は27 tests passed、architecture/typecheck、CI相当E2Eは`status: passed`・失敗なしである。検証済みremote HEADは`d003c16`である。

### Task 9の状態

Task 9は未完了だった`BrowserEventBinding`実装を`browser-application.ts`へ分離し、`bind-browser-events.ts`をapp-owned listenerのcompose/cleanupだけへ縮小して完了した。Route Guidance、circle status/page action、settings shellのapp-owned listenerを責務別binderへ分け、GAS outboxとlocal deletionのfeature内部Custom Eventは各Controllerの`start()/stop()`へ移管した。注入された`document`を使うため、別DOMへの誤登録も防止している。

`BrowserEventBinding`のclass・alias・production参照を削除し、architecture checker、既存参照テスト、listener lifecycle testを更新した。`npm run test:webapp`（72 files / 522 tests）、`npm run test:route-guidance`（28 tests）、Phase 5D回帰（4 tests）、architecture/typecheck、build、`git diff --check`が成功した。

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

さらに当時の`check-webapp-architecture.mjs`では、非composition-root app moduleのconcrete infrastructure検査から`bind-browser-events.ts`だけが明示的に除外されていた。この例外はStage 8Gで、binderが最終境界へ縮小した後に削除した。

Task 8で所有権を修復し、Task 9で残った純粋なevent registrationをowner別に分割した。

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

Task 10で対象snapshotを個別に調査し、根拠に応じてproduction修正またはCI固定環境での限定baseline更新を行った。

## Task 7の扱い

Task 7は最終検証中に既存計画外のblockerを発見した状態として記録する。

Task 7で得た検証結果は原因調査のbaselineとして利用し、Task 8〜11で追加blockerを解消した。Task 12でさらにproduction/test/architecture checkerを変更するため、Phase完了の最終証拠はTask 12後に再取得する。

## タスク状態

| タスク | 状態 | 概要 |
|---|---|---|
| Task 1 | 完了 | Route Guidance固有モジュールの配置を一本化 |
| Task 2 | 完了 | Route Guidanceの状態所有と処理順序をfeatureへ移管 |
| Task 3 | 完了 | `EventDayDataStore`を削除して既存featureを直接接続 |
| Task 4 | 完了 | `ComiPathDomCoordinator`をfeature別Viewへ解体 |
| Task 5 | 完了 | `ComiPathBrowserRuntime`を削除しbrowser bindingを明示化 |
| Task 6 | 完了 | architecture guardrailとテスト境界を強化 |
| Task 7 | 中断 | 最終検証中にbrowser binding ownershipとvisual snapshotの追加blockerを発見し、Task 8〜11で解消 |
| Task 8 | 完了 | Stage 8A〜8G完了。browser binding ownershipとarchitecture guardrailを確定 |
| Task 9 | 完了 | browser event registrationをowner別に整理し、root binderをcompose/cleanupへ縮小 |
| Task 10 | 完了 | 既知候補と新規露出snapshotを根拠付きで解消。Flow1 gallery fixture不整合を修正 |
| Task 11 | 完了 | `9098ebe`でPhase全体検証、CI相当E2E、public tree auditを実行。Task 12後に最終検証を再取得する |
| Task 12 | 完了 | Stage 12A〜12F完了。責務境界、startup診断、feature request ownership、Route Guidance契約、test discoveryを確定し、最終E2Eを再検証 |

タスク完了時はこの表と「次に着手するタスク」を実態に合わせて更新する。個別タスク文書へ進捗状態を重複して記録しない。
