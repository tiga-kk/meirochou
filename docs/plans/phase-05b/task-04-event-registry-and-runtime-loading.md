# Phase 5B Task 4: C108 Event Registry and Runtime Loading

**Status:** Completed
**Depends on:** Phase 5B Task 3  
**Commit candidate:** `feat(events): publish c108 day selections`

## Goal

C108のday1とday2をevent registryへ登録し、両日が同じmap bundle manifestを使うようにする。productionではC108だけを表示し、demo-v1はfixtureとして維持する。

## User-visible result

production画面でC108とday1/day2を選択でき、選択した日程で4地図が読み込まれる。demo-v1はproduction選択肢に表示されない。

## Required reads

- Task 2 manifest contract
- Task 3 public bundle
- 既存event registry
- event/day selector
- map bundle selection
- app event/day transition
- `tests/event-registry.test.ts`
- `tests/event-day-selector.test.ts`
- `tests/map-bundle-selection.test.ts`
- `tests/map-manifest-loader.test.ts`
- 関連E2E fixture

## Files allowed to change

- event registry module
- map bundle selection module
- event/day selector
- app wiringの必要部分
- Viteのpublic map bundle copyとbuild verifier
- fictional fixture registry
- 上記に対応するunit/integration tests
- 必要なE2E fixture/test
- Task実績欄
- `docs/status/progress.md`

## Files forbidden to change

- public map asset内容
- route planner algorithm
- storage schema
- purchase/hold semantics
- Worker
- TOPTW
- Python
- visual redesign

## Required event contract

```ts
{
  eventId: "C108",
  displayName: "C108",
  days: [
    { dayId: "day1", displayName: "1日目" },
    { dayId: "day2", displayName: "2日目" }
  ],
  mapBundle: "../maps/C108/manifest.json"
}
```

`mapBundle`はevent registryから解決する公開URLであり、source bundleの配置は
`apps/webapp/map-bundles/C108/`、production URLは
`/assets/maps/C108/manifest.json`とする。既存型に合わせてfield名を調整してよいが、意味を変えない。
dayごとにmanifest pathを複製しない。

## TDD procedure

- [x] **Step 1: production registry testをREDで追加する**

```ts
expect(productionEvents.map((event) => event.eventId)).toEqual(["C108"]);
expect(productionEvents[0]?.days.map((day) => day.dayId)).toEqual([
  "day1",
  "day2",
]);
```

- [x] **Step 2: demo fixture分離testを書く**

```ts
expect(productionEvents.some((event) => event.eventId === "demo-v1")).toBe(false);
expect(testEvents.some((event) => event.eventId === "demo-v1")).toBe(true);
```

実際のfixture export名は既存構成に合わせる。

- [x] **Step 3: REDを確認する**

```bash
npx vitest run tests/event-registry.test.ts
```

Expected: production registryがまだdemo-v1でFAIL。

- [x] **Step 4: registryを変更する**

C108 event definitionを追加し、production exportからdemo-v1を外す。
demo-v1 object自体は削除せず、test/dev fixtureから参照できる状態を保つ。

- [x] **Step 5: day共通manifest testを書く**

day1とday2のmap selectionが同じC108 manifest pathを返すことを確認する。

```ts
expect(resolveManifest("C108", "day1")).toBe(
  "../maps/C108/manifest.json",
);
expect(resolveManifest("C108", "day2")).toBe(
  "../maps/C108/manifest.json",
);
```

- [x] **Step 6: runtime loader integration testを書く**

fetch stubを使い、C108/day1またはday2選択で次を確認する。

- C108 manifestを取得する。
- 4 areaを返す。
- area選択でそのareaのasset pathを解決する。
- event/day切替時に古いroute stateを既存契約どおりclearする。
- invalid dayを拒否する。

- [x] **Step 7: selector表示testを書く**

C108選択時に`1日目`と`2日目`が表示される。
demo-v1がproduction selectorへ出ない。
既存testがdemo-v1を必要とする場合、明示的test registryを注入する。

- [x] **Step 8: E2E fixtureを分離する**

自動E2Eで実地図を必須にしない。
demo-v1を使うtestはproduction registryに依存せず、fixture registryまたはtest bootstrapを使う。

- [x] **Step 9: focused検証を実行する**

```bash
npx vitest run tests/event-registry.test.ts tests/event-day-selector.test.ts tests/map-bundle-selection.test.ts tests/map-manifest-loader.test.ts
npm run test:webapp
npm run check:webapp
npm run build:webapp
npm run verify:webapp:build
git diff --check
```

## Acceptance criteria

- production eventはC108だけである。
- C108にday1とday2がある。
- 両日が同じmanifestを使う。
- demo-v1はtest/dev fixtureとして残る。
- production selectorにdemo-v1が出ない。
- E2Eが実地図の内容へ依存しない。
- event/day切替の既存安全処理を維持する。

## Review checklist

- demo-v1のassetやparserを削除していないか。
- testだけproduction registryへdemo-v1を再注入していないか。
- day1/day2でmap assetを複製していないか。
- event/day切替時に別日程の状態を混ぜないか。
- C108 pathをabsolute URLにしていないか。
- production buildとprivate buildの境界を壊していないか。

## Completion record

```text
Production event IDs: ["C108"]
Fixture event IDs: ["demo-v1"]
Manifest path used by day1: http://example.test/assets/maps/C108/manifest.json
Manifest path used by day2: http://example.test/assets/maps/C108/manifest.json
Focused test results: 33 tests passed across 4 files (event-registry, event-day-selector, map-bundle-selection, map-manifest-loader)
Build results: npm run test:webapp (396 tests passed), check:webapp, build:webapp, verify:webapp:build, biome check, git diff --check passed
E2E results: 25 passed; 6 existing visual snapshot mismatches remain (no runtime or server failure)
Known limitations: UI defaults to C108 day1. Phase 5C will implement multi-event session state handling. Existing E2E visual snapshots are outside Task 4 scope and were not updated.
Proposed commit message: feat(events): publish c108 day selections
```
