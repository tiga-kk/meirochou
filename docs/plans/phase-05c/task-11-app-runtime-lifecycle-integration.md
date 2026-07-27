# Phase 5C Task 11: App Runtime Lifecycle Integration

**Status:** Planned  
**Depends on:** Phase 5C Tasks 1-10  
**Commit candidate:** `fix(navigation): connect phase 5c runtime lifecycle`

## Goal

Phase 5Cで実装済みの`NavigationOrchestrationService`、`LocalStorageNavigationSnapshotRepository`、distance matrix cache、time-decayed ALNS Workerを`App`の実際の起動・操作・再読込ライフサイクルへ接続する。

本Taskは新しい最適化アルゴリズムや保存schemaを追加するものではない。既存の部品をproductionのcomposition rootへ接続し、旧`TspSolver`中心の案内経路をPhase 5Cのnavigation runtimeへ置き換える。

## Root cause

Task 7-9ではpure service、repository、Worker、UI/E2Eの個別部品を実装したが、`App`本体とのcomposition/lifecycle adapterが実装されなかった。

現状の`App`は次の状態である。

- `LocalStorageNavigationSnapshotRepository`を`StorageDeletionService`へ渡すだけで、起動時の`load()`と状態変更時の`save()`を呼ばない。
- `NavigationOrchestrationService`を生成・利用しない。
- productionの次目的地決定が`searchNext()`、`rankCandidatesByGrid()`、`TspSolver.solve()`を通る。
- reload後のresume dialog、route geometry再構築、saved `bestOrder`のwarm-startが実行されない。

## Files

### Create

- `apps/webapp/js/navigation/navigation-runtime-controller.ts`
  - Phase 5C部品のcompositionとApp lifecycle接続を担当する。
  - optimizer kernelや経路探索algorithm自体は実装しない。
- `apps/webapp/js/components/navigation-resume-dialog.ts`
  - valid snapshotがある場合の「案内を再開」「始点を設定し直す」を表示するLit dialog。
- `tests/navigation-runtime-controller.test.ts`
  - repository、orchestration、geometry、warm-start、保存triggerのintegration test。
- `tests/e2e/navigation-resume.spec.ts`
  - 実際のApp起動、reload、resume、始点再設定を通すPlaywright test。

### Modify

- `apps/webapp/js/app.js`
  - controllerを1回だけ生成し、起動・イベント・削除・event/day切替へ接続する。
- `apps/webapp/js/ui-manager.js`
  - resume dialog modelとfocus returnをUI境界として公開する。
- `apps/webapp/index.html`
  - `<navigation-resume-dialog>`を1個だけ配置する。
- `apps/webapp/css/modals.css`
  - 既存dialog tokenを使い、mobile、200% zoom、44px targetを満たす。
- `tests/e2e/navigation-mobile.spec.ts`
  - Phase 5C production経路が旧`TspSolver`へ戻らないことを既存mobile flowへ追加する。
- `docs/plans/phase-05c/task-10-phase-verification-and-handoff.md`
- `docs/reviews/phase-05c-handoff.md`
- `docs/status/progress.md`

## Files forbidden to change

- time-decayed objectiveの式、半減時間、service time、探索時間。
- Task 5のweighted distance semanticsとmatrix cache key。
- circle state schemaとGAS outbox契約。
- C108 map asset、points、grid、timing profile係数。
- Python runtime、GA、TOPTW、外部情報provider。
- package dependency。

## Runtime ownership

- `App`はconstructorで次をそれぞれ1回だけ生成する。
  - `LocalStorageNavigationSnapshotRepository`
  - `LocalStorageDistanceMatrixRepository`
  - `NavigationOrchestrationService`
  - `NavigationRuntimeController`
- `StorageDeletionService`へは、Appが保持する同一のsnapshot repositoryとmatrix repositoryを渡す。getter呼出しごとにrepositoryを作り直さない。
- `NavigationRuntimeController`はnavigation state、snapshot保存・復元、Worker generation、route geometry再構築の境界を調整する。
- `App`はDOM eventとDataManager mutationをcontrollerへ渡すが、ALNS、Dijkstra、order repairを直接実装しない。

## Startup and recovery flow

1. `DataManager.openEventDay()`と`UIManager.init()`の完了後、active `eventId/dayId`でsnapshotを`load()`する。
2. `validateSnapshotForResume()`へ現在のbundle version、circle states、pending spacesを渡す。
3. snapshotがない場合は通常の始点設定待ちで起動し、最適化を自動開始しない。
4. invalid snapshotは安全に`clear()`し、resume dialogを表示しない。旧`TspSolver`へfallbackして案内を開始しない。
5. valid snapshotではresume dialogを表示し、ユーザーが選ぶまでtarget、current position、Workerを変更しない。
6. 「案内を再開」では次を順に実行する。
   - snapshotの`navState`、探索時間設定、matrix referenceをruntimeへ復元する。
   - `lockedFirstLeg.from`から`targetSpace`までのroute geometryを、runtime検証済みgrid assetから再構築する。
   - `currentTarget`、`currentRoute`、`selectedTarget`、`selectedRoute`、`nextTarget`を復元した`bestOrder`から描画する。
   - current targetを`fixedFirstTarget`として維持する。
   - 保存済み`bestOrder`を`initialSolutions`へ渡してtime-decayed ALNSをwarm-startする。
7. geometry再構築に失敗した場合はtargetだけを表示して案内を続行しない。snapshotを破壊せず、エラーをdialogへ表示して「始点を設定し直す」を選べる状態にする。
8. 「始点を設定し直す」ではcurrent position、target、locked legを破棄し、circle stateとdistance matrixを保持する。保存済み`bestOrder`は次回start後のrepair済みwarm-start候補として保持する。

## Save and clear triggers

次の成功した状態変更の直後にsnapshotを同期的に`save()`する。保存失敗は案内を巻き戻さず、次回再計算になることを通知する。

- 始点確定とinitial target決定。
- Worker progressまたはcompleteによる`bestOrder`更新。
- 到着確認。
- 到着前保留、到着後保留、購入後の次target確定。
- 手動目的地変更。
- optimization time設定変更。
- area/session切替前のactive navigation state確定。

次の場合はsnapshotを`clear()`する。

- pendingとheldが0になり巡回が完了した。
- 「この日の巡回状態を初期化」が成功した。
- event-dayまたはall-events削除が成功した。
- source更新によりresume validationが成立しなくなった。

## Production route boundary

- Phase 5C navigation開始後の次目的地順序は`NavigationOrchestrationService`とtime-decayed ALNSの結果だけを使用する。
- `planGridRoute()`は表示用route geometry再構築に再利用してよい。
- `TspSolver.solve()`と`rankCandidatesByGrid()`はdev demoまたはPhase 5C未適用fixtureに限定し、C108 production navigationの候補順序へ使用しない。
- Worker progressまたはcompleteは`bestOrder`だけを更新し、表示中のcurrent targetとcurrent legを上書きしない。

## TDD procedure

- [ ] constructorでrepository、orchestration、runtime controllerを1回だけ生成し、削除serviceも同じrepository instanceを使う失敗testを書く。
- [ ] startupでvalid snapshotをloadし、resume dialogを表示する失敗testを書く。
- [ ] invalid snapshotをclearし、Workerと旧route searchを開始しない失敗testを書く。
- [ ] resumeでcurrent position、target、locked leg、探索時間を復元する失敗testを書く。
- [ ] resumeでroute geometryを再構築し、saved `bestOrder`をwarm-startへ渡す失敗testを書く。
- [ ] geometry失敗時にsnapshotを保持し、始点再設定へ移れる失敗testを書く。
- [ ] navigation state変更ごとにsnapshotをsaveする失敗testを書く。
- [ ] Worker resultがcurrent targetを変更しないApp integration testを書く。
- [ ] production navigationで`TspSolver.solve()`を呼ばない失敗testを書く。
- [ ] reload→案内再開のPlaywright失敗testを書く。
- [ ] reload→始点再設定のPlaywright失敗testを書く。
- [ ] REDを確認する。

```bash
npx vitest run --root . tests/navigation-runtime-controller.test.ts tests/navigation-recovery.test.ts tests/navigation-orchestration.test.ts
npx playwright test tests/e2e/navigation-resume.spec.ts --project=chromium
npx playwright test tests/e2e/navigation-resume.spec.ts --project=mobile-chromium
```

- [ ] `NavigationRuntimeController`を最小実装する。
- [ ] App constructorと`init()`へruntime compositionを接続する。
- [ ] action、arrival、manual target、Worker updateをorchestration経由へ置き換える。
- [ ] resume dialogとfocus trap、Escape、focus returnを実装する。
- [ ] geometry再構築とwarm-startを接続する。
- [ ] save/clear triggerを接続する。
- [ ] production navigationから旧`TspSolver`順序決定を外す。
- [ ] focused testをGREENにする。
- [ ] clean verificationとC108 smokeを再実行する。

```bash
npm run test:webapp
npm run check:webapp
npm run build:webapp
npm run test:e2e
RUN_C108_SMOKE=1 npx playwright test tests/c108-map-browser-smoke.spec.ts --project=chromium
RUN_C108_SMOKE=1 npx playwright test tests/c108-map-browser-smoke.spec.ts --project=mobile-chromium
node scripts/audit-public-tree.mjs
git diff --check
```

- [ ] Task 10、handoff、progressを実態に合わせて更新する。
- [ ] Task 10のBLOCKERを解除し、Phase 5C Exit Gateを再判定する。

## Acceptance criteria

- production `App`が`NavigationOrchestrationService`を実際に生成・利用する。
- startupでsnapshotをloadし、valid snapshotだけにresume dialogを表示する。
- resumeでcurrent position、target、locked leg、route geometryを復元する。
- saved `bestOrder`がALNSのwarm-startへ渡る。
- navigation state変更時にsnapshotが保存される。
- current targetはWorker更新だけでは変わらない。
- 始点再設定と巡回初期化でdistance matrixを保持する。
- event-day/all-events削除でsnapshotとmatrixを削除する。
- C108 production navigationが旧`TspSolver`による順序決定を使わない。
- reload→resumeとreload→始点再設定をdesktop/mobile E2Eで確認する。
- Phase 5Cの全Exit Gate、clean verification、public auditが成功する。
