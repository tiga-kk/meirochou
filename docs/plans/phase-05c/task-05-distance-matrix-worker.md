# Phase 5C Task 5: Distance Matrix Worker and LocalStorage Cache

**Status:** Complete（pure kernel・Worker・controller・repositoryをレビュー修正済み）
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
  save(matrix: StoredDistanceMatrix): boolean;
  saveWithRef?(
    eventId: string,
    dayId: string,
    matrix: StoredDistanceMatrix,
  ): boolean;
  deleteByEventDay(eventId: string, dayId: string): void;
}

export interface DistanceMatrixJobInput {
  readonly eventId: string;
  readonly dayId: string;
  readonly areaId: string;
  readonly cacheKey: string;
  readonly gridInput: MatrixGridInput;
  readonly endpoints: readonly { space: string; gridIndex: number }[];
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

- [x] cache keyがmetadata変更で変わらずendpoint/grid/version変更で変わるtestを書く。
- [x] flat matrix indexingと対称性testを書く。
- [x] crowded weight 1.5を使うDijkstra testを書く。
- [x] N endpointでN progressを返すworker kernel testを書く。
- [x] cancel後にcompleteを返さないtestを書く。
- [x] stale jobIdをcontrollerが無視するtestを書く。
- [x] repository round-trip testを書く。
- [x] quota errorでmemory結果を返すtestを書く。
- [x] REDを確認する。

```bash
npx vitest run --root . tests/distance-matrix.test.ts tests/distance-matrix-worker.test.ts tests/distance-matrix-repository.test.ts tests/distance-matrix-controller.test.ts
```

- [x] 既存Dijkstraをpure reusable kernelへ整理する。
- [x] all-pairs path geometryを保存せずdistanceだけをflat arrayへ書く。
- [x] Workerを実装する。
- [x] controllerがprogressとETAをUI modelへ渡すようにする。
- [x] repositoryを実装し、直接localStorage使用を隠蔽する。
- [x] cache hit時はWorkerを起動しない。
- [x] cache missはユーザーの始点確定後に開始する。
- [x] current arbitrary startについて1回Dijkstraのdistance vectorを別計算し、circle matrixを再生成しない。
- [x] 保存失敗messageを安全な文言で返す。
- [x] GREENを確認する。

```bash
npx vitest run --root . tests/distance-matrix.test.ts tests/distance-matrix-worker.test.ts tests/distance-matrix-repository.test.ts tests/distance-matrix-controller.test.ts
npm run test:webapp
npm run check:webapp
npm run build:webapp
git diff --check
```

## 実績

- weighted 4-neighbor Dijkstra、flat distance matrix、content-addressed cache key、始点からendpoint群への単一distance vectorを実装した。
- Worker entrypointとprotocolを分離し、controllerでcache hit時のWorker起動抑止、cache miss、progress/ETA、cancel、stale response拒否を実装した。
- LocalStorage repositoryは保存データをruntime検証し、JSONで`Infinity`が`null`化される場合も復元する。quota error時はmemory結果を返し、安全なwarningをUI modelへ渡す。
- focused testは27件PASS。webapp全体39ファイル408件、型チェック、build、artifact検証、Biome、`git diff --check`もPASSした。E2Eは31 PASS・8 skippedで、sandbox外で再実行した。
- main threadからWorker entrypointを直接評価せず、protocol parserを経由する構成も確認した。

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
