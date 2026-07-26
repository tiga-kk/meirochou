# Phase 5B Task 2: C108 Map Bundle Contract and Runtime Parser

**Status:** Completed
**Depends on:** Phase 5B Task 1  
**Commit candidate:** `feat(maps): define c108 bundle contract`

## Goal

C108のday共通manifest、area、asset pathを表す型とruntime parserを追加し、不正な入力をasset取得前に拒否する。

## User-visible result

正常なC108 manifestだけが読み込まれ、不正なpathや不正なarea定義では安全なエラーになる。まだ実地図assetの公開配置とproduction登録は行わない。

## Required reads

- `docs/plans/phase-05b/c108-input-inventory.md`
- 既存event registry型
- 既存map manifest loader
- 既存boundary parser
- `tests/map-manifest-loader.test.ts`
- `tests/boundary-parsers.test.ts`
- `tests/event-registry.test.ts`

## Files allowed to change

- `apps/webapp/ts/domain-types.ts`
- `apps/webapp/ts/map-manifest-loader.ts`
- 必要な場合のみ、新規の`apps/webapp/ts/map-bundle-contract.ts`
- `tests/map-manifest-loader.test.ts`
- `tests/boundary-parsers.test.ts`
- Task実績欄
- `docs/status/progress.md`

## Files forbidden to change

- `apps/webapp/map-bundles/**`
- event production registry
- route planner
- app UI
- storage schema
- Python
- package dependencies

## Interfaces

Task 2で次の公開型を定義する。既存命名と衝突する場合は既存型を拡張し、Task文書の実績欄に実名を記録する。

```ts
export interface MapAssetPaths {
  readonly svg: string;
  readonly points: string;
  readonly gridMeta: string;
  readonly grid: string;
}

export interface EventMapAreaManifest {
  readonly areaId: string;
  readonly displayName: string;
  readonly assets: MapAssetPaths;
}

export interface EventMapBundleManifest {
  readonly schemaVersion: 1;
  readonly eventId: string;
  readonly bundleVersion: string;
  readonly areas: readonly EventMapAreaManifest[];
}

export function parseEventMapBundleManifest(
  value: unknown,
): EventMapBundleManifest;
```

pathの許可形式:

```text
./<areaId>/map.svg
./<areaId>/points.json
./<areaId>/grid-meta.json
./<areaId>/grid.bin
```

拒否するもの:

- `/`で始まるabsolute path
- `\`を含むpath
- `..` path segment
- `http:`、`https:`、`data:`、`javascript:`などのscheme
- query、fragment
- 空文字
- area directory外を指すpath
- 重複areaId
- 0件または5件以上のarea
- C108 manifestで4件以外のarea

## TDD procedure

- [ ] **Step 1: 正常系の失敗テストを書く**

`tests/boundary-parsers.test.ts`へ、fictional C108 manifestをparseできるテストを追加する。

```ts
const manifest = parseEventMapBundleManifest({
  schemaVersion: 1,
  eventId: "C108",
  bundleVersion: "fixture-v1",
  areas: [
    {
      areaId: "area-a",
      displayName: "Area A",
      assets: {
        svg: "./area-a/map.svg",
        points: "./area-a/points.json",
        gridMeta: "./area-a/grid-meta.json",
        grid: "./area-a/grid.bin",
      },
    },
    // 同形式で4 area
  ],
});

expect(manifest.eventId).toBe("C108");
expect(manifest.areas).toHaveLength(4);
```

- [ ] **Step 2: 正常系がREDになることを確認する**

```bash
npx vitest run tests/boundary-parsers.test.ts
```

Expected: parserまたは型が未定義でFAIL。

- [ ] **Step 3: 不正pathのtable testを書く**

最低限、次の入力がthrowすることを個別caseで確認する。

```ts
[
  "/absolute/map.svg",
  "../map.svg",
  "./area-a/../map.svg",
  "https://example.invalid/map.svg",
  "data:image/svg+xml,...",
  "./area-a/map.svg?x=1",
  "./area-a/map.svg#fragment",
  ".\\area-a\\map.svg",
  "./area-b/map.svg",
]
```

最後のcaseは`areaId: "area-a"`から別area directoryを参照する例とする。

- [ ] **Step 4: manifest構造の不正caseを書く**

次を個別にtestする。

- schemaVersionが1ではない。
- eventIdが空。
- bundleVersionが空。
- areasが3件。
- areaIdが重複。
- displayNameが空。
- asset fieldが欠ける。
- expected extensionが異なる。

- [ ] **Step 5: 最小実装を書く**

parserは`unknown`を受け、object、array、string、integerを明示的に検証する。
`any`、type assertionだけで通す実装、JSON schema dependency追加を行わない。

安全なerror message例:

```text
Invalid map bundle manifest: areas must contain exactly four entries.
Invalid map bundle manifest: area "area-a" has an unsafe svg path.
```

raw input全体をerrorへ埋め込まない。

- [ ] **Step 6: focused testをGREENにする**

```bash
npx vitest run tests/boundary-parsers.test.ts tests/map-manifest-loader.test.ts
```

Expected: PASS。

- [ ] **Step 7: loaderを新contractへ接続する**

既存loaderがmanifest JSONを`unknown`として受け、`parseEventMapBundleManifest`を通した結果だけを返すようにする。
fetch pathを文字列連結する前にparserを通す。

- [ ] **Step 8: loader integration testを書く**

fictional fetch stubを使い、次を確認する。

- manifestを1回取得する。
- parser後の4 areaを返す。
- manifest parse失敗時にarea assetをfetchしない。
- raw manifestをconsoleへ出さない。

- [ ] **Step 9: 検証する**

```bash
npm run test:webapp
npm run check:webapp
npx biome check apps/webapp/ts tests/boundary-parsers.test.ts tests/map-manifest-loader.test.ts
git diff --check
```

## Acceptance criteria

- 型とruntime parserが存在する。
- C108 manifestは4 areaを必須とする。
- 不正pathをasset fetch前に拒否する。
- raw inputをerrorやconsoleへ出さない。
- package dependencyを追加していない。
- production registryとpublic assetを変更していない。
- 既存fictional testsが通る。

## Review checklist

- parserが`unknown`を検証しているか。
- `as EventMapBundleManifest`だけで通していないか。
- path normalization後ではなく、元の入力から危険要素を拒否しているか。
- areaIdとasset directoryの一致を確認しているか。
- errorがcredentialやraw JSONを含まないか。
- C108以外の既存fictional fixtureを壊していないか。

## Completion record

```text
Implemented types/functions:
- MapAssetPaths, EventMapAreaManifest, EventMapBundleManifest (apps/webapp/js/types/domain.ts)
- parseEventMapBundleManifest (apps/webapp/js/types/boundary-parsers.ts)
- loadEventMapBundleManifestFromUrl (apps/webapp/js/map-manifest-loader.ts)
Changed files:
- apps/webapp/js/types/domain.ts
- apps/webapp/js/types/boundary-parsers.ts
- apps/webapp/js/map-manifest-loader.ts
- tests/boundary-parsers.test.ts
- tests/map-manifest-loader.test.ts
- docs/plans/phase-05b/task-02-map-bundle-contract.md
- docs/status/progress.md
RED command and failure:
- npx vitest run --root . tests/boundary-parsers.test.ts (3 failed tests: Not implemented / BoundaryValidationError expected)
GREEN commands:
- npx vitest run --root . tests/boundary-parsers.test.ts
- npm run test:webapp
- npm run check:webapp
- npx biome check apps/webapp/js tests/boundary-parsers.test.ts tests/map-manifest-loader.test.ts
- npm run verify:gas
- npm run test:e2e
- git diff --check
Test results:
- 36 test files passed, 379 tests passed.
- GAS 2 test files passed, 27 tests passed.
- E2E 25 of 31 tests passed; 6 existing visual snapshot assertions differ by 1-2px or rendered pixels in unchanged UI surfaces.
- Biome check passed with 0 errors.
- Review fix: asset paths now require the exact `./<areaId>/<file>` form and reject surrounding whitespace in paths and area IDs.
Known limitations: Full `npx biome check` remains non-zero for 5 pre-existing formatting/import-order issues outside this Task's changed files. E2E has 6 pre-existing visual snapshot mismatches in unchanged UI surfaces; no UI/CSS/app rendering file changed in Task 2.
Proposed commit message: feat(maps): define c108 bundle contract
```
