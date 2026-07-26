# Phase 5C Task 6: TOPTW TypeScript Adapter and Worker Execution

**Status:** Not started  
**Depends on:** Phase 5C Task 5  
**Commit candidate:** `feat(optimizer): add time-boxed toptw worker`

## Goal

Git管理外のPython参照実装と対応する小規模fixtureを作り、TypeScript版TOPTW adapterを実装する。5/15/30/60秒の時間制限、cancel、途中best、決定的seed、warm start、現在区間固定に対応する。

## Required human input

Python参照実装の場所を実装担当が読めること。Python file自体はrepoへコピーしない。

## Files allowed to change

- optimizer domain types
- pure TOPTW adapter/kernel
- optimizer WorkerまたはTask 5 Workerのjob stage追加
- settings model/componentのoptimization time部分
- fictional comparison fixtures
- unit/integration tests
- progressとTask実績

## Files forbidden to change

- Python参照実装
- map assets
- circle state semantics
- GAS
- external provider
- package dependency追加（参照実装が使うPython packageも追加しない）

## Required interfaces

```ts
export interface ToptwProblem {
  readonly nodeIds: readonly string[];
  readonly distances: readonly number[];
  readonly size: number;
  readonly fixedFirstTarget: string | null;
  readonly timeLimitMs: 5_000 | 15_000 | 30_000 | 60_000;
  readonly randomSeed: number;
  readonly initialSolutions: readonly (readonly string[])[];
}

export interface ToptwBestSolution {
  readonly route: readonly string[];
  readonly score: number;
  readonly elapsedMs: number;
}

export interface ToptwProgress {
  readonly elapsedMs: number;
  readonly timeLimitMs: number;
  readonly best: ToptwBestSolution;
}
```

objective固有fieldはPython参照実装から確定し、Task completion recordへ実名を記録する。

## TDD procedure

- [ ] Python参照実装から3件以上の小規模fixtureを作る。
- [ ] fixtureにはnode、distance、制約、seed、期待score、期待routeまたは同点許容集合を含める。
- [ ] parser/adapterがfixtureを読めない失敗testを書く。
- [ ] fixed first targetを破らない失敗testを書く。
- [ ] 5/15/30/60秒以外を拒否する失敗testを書く。
- [ ] same seedで同じ初期結果になる失敗testを書く。
- [ ] initialSolutionsを受ける失敗testを書く。
- [ ] cancel時に最新bestを返す失敗testを書く。
- [ ] REDを確認する。

```bash
npx vitest run tests/toptw-adapter.test.ts tests/toptw-worker.test.ts
```

- [ ] Pythonの入出力契約だけをTypeScript型へ写す。
- [ ] 内部アルゴリズムをTask文書へ再記述せず、codeとtestで実装する。
- [ ] 初回seedとしてnearest、priority順、insertion、および決定的variantを渡す。
- [ ] 再実行時はprevious bestと修復済みrouteをinitialSolutionsへ入れる。
- [ ] time limitまで改善し、progressで最新bestを返す。
- [ ] UI settingsへ5/15/30/60秒を追加しdefaultを15秒にする。
- [ ] 実行ごとの確認dialogを追加しない。
- [ ] GREENを確認する。

```bash
npx vitest run tests/toptw-adapter.test.ts tests/toptw-worker.test.ts tests/settings-component.test.ts
npm run check:webapp
npm run build:webapp
git diff --check
```

## Acceptance criteria

- Python runtimeなしでTypeScript実装が動く。
- fixtureの入力解釈とscoreが参照実装に一致する。
- fixed first targetを守る。
- time settingは5/15/30/60秒だけ。
- defaultは15秒。
- cancelで最新bestを使える。
- previous bestをwarm startへ渡せる。
- current targetをWorkerが直接変更しない。
