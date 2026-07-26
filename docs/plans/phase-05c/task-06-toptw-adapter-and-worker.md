# Phase 5C Task 6: Time-Decayed ALNS Adapter and Worker Execution

**Status:** Complete
**Depends on:** Phase 5C Task 5  
**Commit candidate:** `feat(optimizer): add time-decayed alns worker`

## Goal

Task 5が生成した重み付きグリッド距離をarea別timing profileで移動秒数へ変換し、service timeを含む購入完了時刻に対して価値を指数減衰させるTypeScript版ALNSを実装する。5/10/15秒のsearch time、cancel、途中best、決定的seed、warm start、現在区間固定に対応する。

本Taskは`docs/specs/2026-07-27-phase-05c-time-decayed-alns-amendment.md`を正本とする。旧TOPTW、総時間予算、個別締切、Python参照実装との一致要件は使用しない。ファイル名は既存リンクを維持するため変更しない。

## Fixed product decisions

- production solverはALNSのみとし、GAを実装しない。
- 地図内の総滞在時間をユーザーへ入力させない。
- サークルごとの締切を持たない。
- 原則として全pendingサークルをrouteへ含める。
- route終点から始点へ戻ることを要求しない。
- valueは`max(0, circle.priority ?? 0)`とする。
- 半減時間は1800秒、3600秒、7200秒を等重みで使用する。
- 通常service timeは30秒、壁service timeは200秒とする。
- 信頼できる壁分類がない場合は30秒をdefaultとする。
- search time settingは5秒、10秒、15秒、defaultは10秒とする。

## Files allowed to change

- optimizer domain types
- distance-to-time / service-time adapter
- pure time-decayed objective
- pure ALNS kernel
- optimizer WorkerまたはTask 5 Workerのjob stage追加
- settings model/componentのoptimization time部分
- fictional objective/solver fixtures
- unit/integration tests
- progressとTask実績

## Files forbidden to change

- Task 5のweighted distance semantics
- map assets
- circle state semantics
- GAS
- external provider
- Python runtimeまたはPython参照実装の追加
- package dependency追加（標準TypeScriptで実装できる範囲を維持する）

## Timing profile

Task 5の`StoredDistanceMatrix.distances`は重み付きグリッド距離のまま保持する。Task 6のadapterで次の変換を行う。

```ts
export interface OptimizationTimingProfile {
  readonly profileVersion: string;
  readonly secondsPerWeightedDistance: Readonly<Record<string, number>>;
  readonly halfLivesSec: readonly [1800, 3600, 7200];
  readonly halfLifeWeights: readonly [number, number, number];
  readonly defaultServiceTimeSec: 30;
  readonly wallServiceTimeSec: 200;
}
```

初期係数:

```ts
const SECONDS_PER_WEIGHTED_DISTANCE = {
  e456: 0.13184,
  e7: 0.11288,
  s12: 0.15066,
  w12: 0.12425,
} as const;
```

```text
travelTimeSec = weightedDistance * secondsPerWeightedDistance[areaId]
```

- crowded multiplierはTask 5のdistanceに既に含まれているため、二重に掛けない。
- timing profileの変更ではdistance matrixを再生成しない。
- profile versionが変わった場合、旧best orderは再評価または修復してからwarm startへ渡す。

## Required interfaces

```ts
export type AlnsSearchTimeLimitMs = 5_000 | 10_000 | 15_000;

export interface TimeDecayedAlnsProblem {
  readonly nodeIds: readonly string[];
  readonly travelTimesSec: readonly number[];
  readonly serviceTimesSec: readonly number[];
  readonly values: readonly number[];
  readonly size: number;
  readonly fixedFirstTarget: string | null;
  readonly searchTimeLimitMs: AlnsSearchTimeLimitMs;
  readonly randomSeed: number;
  readonly initialSolutions: readonly (readonly string[])[];
  readonly halfLivesSec: readonly [1800, 3600, 7200];
  readonly halfLifeWeights: readonly [number, number, number];
  readonly optimizationProfileVersion: string;
}

export interface TimeDecayedAlnsBestSolution {
  readonly route: readonly string[];
  readonly score: number;
  readonly completionTimesSec: readonly number[];
  readonly elapsedMs: number;
  readonly optimizationProfileVersion: string;
}

export interface TimeDecayedAlnsProgress {
  readonly elapsedMs: number;
  readonly searchTimeLimitMs: AlnsSearchTimeLimitMs;
  readonly best: TimeDecayedAlnsBestSolution;
}
```

Worker job stageは`time-decayed-alns`とする。旧`top-tw`名を新規コードへ追加しない。

## Objective contract

route順序を`r[0], r[1], ...`とし、startから最初のnodeへの時間を含めてcompletion timeを計算する。

```text
completion[0]
  = startTravelTimeSec[r[0]]
  + serviceTimeSec[r[0]]

completion[k]
  = completion[k - 1]
  + travelTimeSec[r[k - 1], r[k]]
  + serviceTimeSec[r[k]]
```

```text
decay(t)
  = sum(weight[j] * 2^(-t / halfLife[j]))

score(route)
  = sum(value[r[k]] * decay(completion[k]))
```

- `halfLifeWeights`の合計は1でなければならない。
- 非有限distanceを含むnodeは通常routeへ混ぜない。
- score比較では許容誤差を明示し、NaNをbestとして採用しない。
- valueが0のnodeもroute末尾へ残せる。

## ALNS behavior

- 初期解としてnearest、priority/value順、value-per-time insertion、previous bestの修復版を使用する。
- destroy operatorは少なくともrandom removal、worst contribution removal、related removalを持つ。
- repair operatorは少なくともgreedy insertionとregret insertionを持つ。
- operator weightは一定区間ごとに改善実績を反映して更新する。
- search time終了前でも常にusableなbestを保持する。
- fixed first targetがある場合、destroy/repairの対象から外す。
- candidate setが変わったprevious bestは、存在するpending nodeだけを残し、不足nodeをrepairしてからinitial solutionへ入れる。
- same seed、same problem、同じiteration/time abstractionのunit testでは決定的な初期結果を得られるようclockを注入可能にする。

軽量比較でALNSを採用したが、その実験コードやE7再構成gridをproduction repositoryへコピーしない。

## TDD procedure

- [x] weighted distanceからarea別travel timeへ変換する失敗testを書く。
- [x] crowded weightをTask 6で二重適用しない失敗testを書く。
- [x] 30秒/200秒service timeを含むcompletion timeの失敗testを書く。
- [x] 1800/3600/7200秒の等重みscoreを手計算fixtureと比較する失敗testを書く。
- [x] priority未設定と負値を0へ正規化する失敗testを書く。
- [x] fixed first targetを破らない失敗testを書く。
- [x] 5/10/15秒以外を拒否する失敗testを書く。
- [x] same seedで同じ初期結果になる失敗testを書く。
- [x] initialSolutionsと修復済みprevious bestを受ける失敗testを書く。
- [x] cancel時に最新bestを返す失敗testを書く。
- [x] profile version mismatch時に旧scoreを無条件再利用しない失敗testを書く。
- [x] REDを確認する。

```bash
npx vitest run --root . tests/time-decayed-objective.test.ts tests/alns-adapter.test.ts tests/alns-worker.test.ts tests/alns-worker-protocol.test.ts
```

- [x] timing profile parserとdistance-to-time adapterを最小実装する。
- [x] pure objectiveとcompletion-time evaluatorを実装する。
- [x] ALNS kernelを実装する。
- [x] Worker protocolへprogress、complete、cancelled、errorを追加する。
- [x] 初回seedとして複数の決定的heuristic routeを渡す。
- [x] 再実行時はprevious bestと修復済みrouteをinitialSolutionsへ入れる。
- [x] search timeまで改善し、progressで最新bestを返す。
- [x] UI settingsへ5/10/15秒を追加しdefaultを10秒にする。
- [x] 実行ごとの確認dialogを追加しない。
- [x] GREENを確認する。

```bash
npx vitest run --root . tests/time-decayed-objective.test.ts tests/alns-adapter.test.ts tests/alns-worker.test.ts tests/alns-worker-protocol.test.ts tests/settings-component.test.ts
npm run check:webapp
npm run build:webapp
git diff --check
```

## 実績

- timing profile parserとarea別distance-to-time adapterを追加し、未知areaの暗黙fallbackと半減時間weightsの不正値を拒否するようにした。
- 購入完了時刻ベースのobjectiveを実装し、通常/壁service time、priorityの非負化、非有限距離nodeの除外、profile versionを検証した。
- nearest、priority/value、value-per-time、修復済みwarm startを初期解として使うALNS kernelを実装し、random/worst/related destroy、greedy/regret repair、operator weight更新、fixed first targetを実装した。
- `time-decayed-alns` stageのWorker protocol、runtime parser、entrypointを追加し、progress、complete、cancelled、errorと探索時間制限をWorker境界へ実装した。
- 設定画面に5/10/15秒の探索時間選択を追加し、defaultを10秒、変更イベントを`optimization-time-limit-change`とした。実行開始と永続化はTask 7へ委譲する。
- focused test 24件、webapp全体43ファイル428件、型チェック、build、Biome、公開ビルド検証、`git diff --check`を実行した。E2EはCI相当Playwrightコンテナで31 PASS・8 skippedを確認した。

## Acceptance criteria

- Python runtimeなしでTypeScript実装が動く。
- Task 5のweighted distanceをarea別係数で秒へ変換する。
- service timeを含む購入完了時刻でscoreを評価する。
- 30/60/120分の指数減衰を等重みで使用する。
- 地図内総時間予算と個別締切を要求しない。
- 原則として全pending nodeを順路へ含める。
- fixed first targetを守る。
- search time settingは5/10/15秒だけで、defaultは10秒。
- cancelで最新bestを使える。
- previous bestをwarm startへ渡せる。
- optimization profile versionを結果へ含める。
- current targetをWorkerが直接変更しない。
