# Phase 5C Task 8: Reload Recovery and Local Data Deletion

**Status:** Not started  
**Depends on:** Phase 5C Task 7  
**Commit candidate:** `feat(storage): recover navigation and clear route data safely`

## Goal

再読込後に案内再開または始点再設定を選べるsnapshotを保存する。巡回状態初期化はdistance matrixを保持し、日程削除はmatrixを含めて削除する。

## Snapshot contents

- event/day
- active area
- bundle/matrix identity
- last confirmed current position
- current target
- navigation stage
- locked current leg
- best remaining order
- optimization time setting
- saved timestamp

保存しない:

- Worker process
- pending Promise
- current remaining seconds
- global Undo token
- raw map/grid
- credential

## Recovery rules

- snapshotに期限を設けない。
- bundle identity、circle state、target endpointが整合する場合だけ再開可能。
- targetがpurchased/excluded、bundle mismatch、endpoint mismatchなら再開を拒否する。
- 再開時はroute geometryを再構築し、saved bestをwarm startにする。
- 始点再設定ではnavigation stateだけを捨て、circle state、matrix、best orderを保持する。

## Deletion rules

### この日の巡回状態を初期化

clear:

- held/purchased/excluded
- navigation snapshot
- target/arrival/current leg
- best order/warm-start seed
- undo token

keep:

- source/circles/sourceGeneration
- map bundle
- distance matrix
- grid asset/cache

GAS outboxは既存安全契約に従い、pending entryを無条件に捨てない。

### この日程のデータを削除

delete:

- source/circles
- circle states
- GAS outbox
- navigation snapshot
- best order
- distance matrices
- event/day index entry

## TDD procedure

- [ ] valid snapshot round-trip testを書く。
- [ ] Worker runtime fieldを保存しないtestを書く。
- [ ] valid resumeでtarget/current positionを復元するtestを書く。
- [ ] invalid target/bundleでresume拒否testを書く。
- [ ] reset startがmatrix/bestを保持するtestを書く。
- [ ] activity resetがmatrixを保持するtestを書く。
- [ ] event-day deleteがmatrixを削除するtestを書く。
- [ ] pending outbox lock/preflight/rollback testを維持する。
- [ ] REDを確認する。

```bash
npx vitest run tests/navigation-recovery.test.ts tests/storage-deletion-service.test.ts
```

- [ ] NavigationSnapshotRepositoryを実装する。
- [ ] load時runtime parserを通す。
- [ ] recovery dialogを実装する。
- [ ] route geometry再構築とwarm startを接続する。
- [ ] deletion serviceへmatrix/snapshot scopeを追加する。
- [ ] existing delete dialogsの文言を実際の保持・削除範囲に合わせる。
- [ ] GREENを確認する。

```bash
npx vitest run tests/navigation-recovery.test.ts tests/storage-deletion-service.test.ts tests/storage-delete-dialog.test.ts tests/storage-deletion-app.test.ts
npm run test:webapp
npm run check:webapp
npm run build:webapp
git diff --check
```

## Acceptance criteria

- valid snapshotを期限なしで再開できる。
- invalid snapshotを安全に拒否する。
- 始点再設定でmatrixを保持する。
- 巡回初期化でmatrixを保持する。
- 日程削除でmatrixを削除する。
- pending outboxを破壊しない。
- Worker実行状態を保存しない。
