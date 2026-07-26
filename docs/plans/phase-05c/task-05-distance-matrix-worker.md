# Phase 5C Task 5: Distance Matrix Worker and LocalStorage Cache

**Status:** Not started  
**Depends on:** Phase 5C Task 4 and Phase 5B benchmark  
**Commit candidate:** `feat(routing): build cached distance matrices in worker`

## Goal

各areaのcircle endpointからweighted DijkstraをN回実行して距離行列を作る。main threadを塞がず、進捗、推定残り時間、cancel、stale message拒否、LocalStorage cacheを提供する。

## Required interfaces

```ts
export interface DistanceMatrixCacheKeyInput {
  readonly eventId: string;
  readonly dayId: string;
  readonly areaId: string;
  readonly bundleVersion: string;
  readonly gridWeightVersion: string;
  readonly endpoints: readonly {
    readonly space: string;
    readonly gridIndex: number;
  }[];
  readonly schemaVersion: 1;
}

export interface StoredDistanceMatrix {
  readonly schemaVersion: 1;
  readonly cacheKey: string;
  readonly areaId: string;
  readonly spaces: readonly string[];
  readonly size: number;
  readonly distances: readonly number[];
  readonly createdAt: string;
}

export interface DistanceMatrixRepository {
  load(cacheKey: string): StoredDistanceMatrix | null;
  save(matrix: StoredDistanceMatrix): void;
  deleteByEventDay(eventId: string, dayId: string): void;
}
```

Worker message:

```ts
type DistanceMatrixWorkerRequest =
  | { type: "start"; jobId: string; input: DistanceMatrixJobInput }
  | { type: "cancel"; jobId: string };

type DistanceMatrixWorkerResponse =
  | { type: "progress"; jobId: string; completed: number; total: number; etaMs: number | null }
  | { type: "complete"; jobId: string; matrix: StoredDistanceMatrix }
  | { type: "cancelled"; jobId: string }
  | { type: "error"; jobId: string; code: string };
```

## TDD procedure

- [ ] cache keyがmetadata変更で変わらずendpoint/grid/version変更で変わるtestを書く。
- [ ] flat matrix indexingと対称性testを書く。
- [ ] crowded weight 1.5を使うDijkstra testを書く。
- [ ] N endpointでN progressを返すworker kernel testを書く。
- [ ] cancel後にcompleteを返さないtestを書く。
- [ ] stale jobIdをcontrollerが無視するtestを書く。
- [ ] repository round-trip testを書く。
- [ ] quota errorでmemory結果を返すtestを書く。
- [ ] REDを確認する。

```bash
npx vitest run tests/distance-matrix.test.ts tests/distance-matrix-worker.test.ts tests/distance-matrix-repository.test.ts
```

- [ ] 既存Dijkstraをpure reusable kernelへ整理する。
- [ ] all-pairs path geometryを保存せずdistanceだけをflat arrayへ書く。
- [ ] Workerを実装する。
- [ ] controllerがprogressとETAをUI modelへ渡すようにする。
- [ ] repositoryを実装し、直接localStorage使用を隠蔽する。
- [ ] cache hit時はWorkerを起動しない。
- [ ] cache missはユーザーの始点確定後に開始する。
- [ ] current arbitrary startについて1回Dijkstraのdistance vectorを別計算し、circle matrixを再生成しない。
- [ ] 保存失敗messageを安全な文言で返す。
- [ ] GREENを確認する。

```bash
npx vitest run tests/distance-matrix.test.ts tests/distance-matrix-worker.test.ts tests/distance-matrix-repository.test.ts
npm run test:webapp
npm run check:webapp
npm run build:webapp
git diff --check
```

## Acceptance criteria

- matrix生成がWorker内で動く。
- progressはcompleted/totalを返す。
- ETAは十分なsample後だけ返す。
- cancel後にbest/current routeを壊さない。
- stale messageを無視する。
- LocalStorage cacheをrepository経由で使う。
- quota errorで案内を停止しない。
- metadataだけの変更でmatrixを再生成しない。
- all-pairs geometryを保存しない。
