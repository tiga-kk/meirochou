# Phase 8 Task 1 Generic Event Map Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** production event map loaderからC108固有event/area metadata依存を除去し、任意eventのstrict manifestとevent registry entryだけからruntime map manifestを構築できるようにする。

**Architecture:** production event bundleをgeneric strict contractとして扱い、`prefixes` / `labels`をarea manifestへ移す。normal eventはstrict loader、dev demoだけは既存legacy loaderをcomposition rootから明示的に呼び分ける。schema自動判別やfallbackは行わない。

**Tech Stack:** TypeScript / Vitest / Vite / Node.js 22.14.0 / npm 10.9.2。

**Spec:** `docs/specs/2026-08-20-phase-08-generic-event-map-contract-design.md`

## Global Constraints

- 実装開始前に`origin/main`と作業branchの関係を確認し、Task 0 closure commitsを失わない。
- `tiga-kk/meirochou_wrapper`は触らない。
- `apps/webapp/map-bundles/demo-v1/manifest.json`は変更しない。
- C109等の新production eventを追加しない。
- event registryへ二つ目のproduction eventを追加しない。
- wrapper manifest generator、bundle validation command、`map.svg`生成を先取りしない。
- `schemaVersion`は1のまま維持する。
- `bundleVersion: "c108-v1"`をmetadata移動だけで変更しない。
- malformed strict payloadをlegacy parserへfallbackしない。
- production codeへ`C108` area id、identifier alphabet、prefix/label listを新規ハードコードしない。
- route algorithm、ALNS、grid/points semantics、wall classificationを変更しない。
- `event-day-contracts.ts`と`application-contract-types.ts`の広範囲統合はTask 5まで行わない。
- visual snapshotを更新しない。このTaskはcontract/runtime loader変更であり、意図したUI変更はない。
- unrelated cleanup、format-all、rename-allをしない。

## File map

### Modify

- `apps/webapp/js/features/event-day/domain/application-contract-types.ts`
  - `EventMapAreaManifest`へ`prefixes` / `labels`を追加する。
- `apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts`
  - strict production event bundle parserをgeneric化する。
- `apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader.ts`
  - `C108_AREA_METADATA`とC108 event分岐を削除し、generic strict runtime adapter/loaderへ変更する。
- `apps/webapp/js/app/assemble-comipath-application.ts`
  - normal eventはstrict loader、dev demoだけlegacy loaderを呼ぶ。
- `apps/webapp/map-bundles/C108/manifest.json`
  - 現在codeにあるC108 `prefixes` / `labels`をdataへ移す。
- `tests/boundary-parsers.test.ts`
  - generic strict manifest validationを証明する。
- `tests/map-manifest-loader.test.ts`
  - non-C108 strict manifestをloader/adapterで証明する。
- `tests/event-registry.test.ts`
  - registry eventとbundle eventのgeneric runtime loadingおよびlegacy demo separationを証明する。
- `tests/c108-map-assets.test.ts`
  - C108 manifestにruntime metadataが揃っていることをasset testへ追加する。
- `docs/status/progress.md`
  - Task 1完了時だけ実測結果を追記する。

### Create/Delete

- production codeの新規fileは原則作らない。
- file削除なし。

---

### Task 1.1: strict production manifest type/parserをgeneric化する

**Files:**
- Modify: `apps/webapp/js/features/event-day/domain/application-contract-types.ts`
- Modify: `apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts`
- Test: `tests/boundary-parsers.test.ts`

**Interfaces:**
- Consumes: JSON `EventMapBundleManifest` payload。
- Produces:

```ts
export interface EventMapAreaManifest {
  readonly areaId: string;
  readonly displayName: string;
  readonly metersPerPixel: number;
  readonly prefixes: readonly string[];
  readonly labels: readonly string[];
  readonly assets: MapAssetPaths;
}
```

`EventMapBundleManifest`のtop-level shapeは変更しない。

#### やってはいけないこと

- `areas.length === 4`を別の固定数へ置換しない。
- C108 area id一覧をparserへ追加しない。
- `prefixes` / `labels`をoptionalにしてruntime fallbackへ逃がさない。
- strict parser失敗時にlegacy parserを試さない。

- [ ] **Step 1: generic area countのREDを書く**

`tests/boundary-parsers.test.ts`へ1 areaだけのfictitious event payloadを追加する。

```ts
const genericEventMapManifest = {
  schemaVersion: 1,
  eventId: "C999",
  bundleVersion: "c999-v1",
  areas: [{
    areaId: "east",
    displayName: "東ホール",
    metersPerPixel: 0.1,
    prefixes: ["東"],
    labels: ["A", "B"],
    assets: {
      svg: "./east/map.svg",
      points: "./east/points.json",
      gridMeta: "./east/grid-meta.json",
      grid: "./east/grid.bin",
    },
  }],
};
```

期待値:

```ts
const parsed = parseEventMapBundleManifest(genericEventMapManifest);
assert.equal(parsed.areas.length, 1);
assert.deepEqual(parsed.areas[0].prefixes, ["東"]);
assert.deepEqual(parsed.areas[0].labels, ["A", "B"]);
```

- [ ] **Step 2: REDを確認する**

```bash
npx vitest run --root . tests/boundary-parsers.test.ts
```

期待: current exactly-four contractでFAIL。

- [ ] **Step 3: metadata validationのREDを追加する**

同じtest fileで各caseを独立して検証する。

```text
prefixes missing
prefixes []
prefixes ["東", "東"]
prefixes [""]
labels missing
labels []
labels ["A", "A"]
labels [""]
```

すべて`map bundle manifest.areas[0].prefixes`または`.labels`を含む`BoundaryValidationError`でFAILすること。

- [ ] **Step 4: typeを最小変更する**

`EventMapAreaManifest`へ以下だけを追加する。

```ts
readonly prefixes: readonly string[];
readonly labels: readonly string[];
```

- [ ] **Step 5: parserをgeneric化する**

`parseEventMapBundleManifest()`で:

```ts
if (!Array.isArray(value.areas) || value.areas.length === 0) {
  throw new BoundaryValidationError(
    "map bundle manifest.areas",
    "a non-empty array",
  );
}
```

area parsingでは既存`uniqueTextArray()`を再利用して:

```ts
const prefixes = uniqueTextArray(areaObj.prefixes, `${areaPath}.prefixes`);
const labels = uniqueTextArray(areaObj.labels, `${areaPath}.labels`);
```

returned frozen areaへ`prefixes`, `labels`を含める。

既存の以下は維持する。

- `areaId` lowercase ASCII alphanumeric/hyphen
- unique `areaId`
- positive finite `metersPerPixel`
- exact `./<areaId>/map.svg`
- exact `./<areaId>/points.json`
- exact `./<areaId>/grid-meta.json`
- exact `./<areaId>/grid.bin`
- frozen return value

- [ ] **Step 6: parser focused GREEN**

```bash
npx vitest run --root . tests/boundary-parsers.test.ts
```

期待: PASS。

- [ ] **Step 7: commit**

```bash
git add \
  apps/webapp/js/features/event-day/domain/application-contract-types.ts \
  apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts \
  tests/boundary-parsers.test.ts
git commit -m "refactor(event-map): generalize strict bundle contract"
```

---

### Task 1.2: runtime adapter/loaderからC108判定を除去する

**Files:**
- Modify: `apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader.ts`
- Test: `tests/map-manifest-loader.test.ts`
- Test: `tests/event-registry.test.ts`

**Interfaces:**

`toRuntimeMapBundleManifest()`はregistry entryを受け取る形へ変更する。

```ts
export function toRuntimeMapBundleManifest(
  eventManifest: EventMapBundleManifest,
  manifestUrl: string,
  event: Pick<EventRegistryEntryV1, "eventId" | "displayName">,
): MapBundleManifestV1
```

新しいstrict loader:

```ts
export async function loadEventRuntimeMapBundleManifestFromUrl(
  manifestUrl: string,
  event: Pick<EventRegistryEntryV1, "eventId" | "displayName">,
  options?: LoadMapBundleManifestOptions,
): Promise<MapBundleManifestV1>
```

legacy `loadMapBundleManifestFromUrl()`はそのまま残す。

#### やってはいけないこと

- `event.eventId === "C108"`または`event.eventId === "demo-v1"`でloader内部を分岐しない。
- strict/legacy schemaをpayload shapeから自動判別しない。
- eventId mismatchを黙ってruntimeへ流さない。
- C108 metadata constantを別fileへ移すだけの修正にしない。

- [ ] **Step 1: fictitious event runtime REDを書く**

`tests/map-manifest-loader.test.ts`へC999 strict payloadを追加し、1 areaでもruntime化できるtestを書く。

```ts
const event = { eventId: "C999", displayName: "Comic Market 999" };
const runtime = toRuntimeMapBundleManifest(
  parsedManifest,
  "https://example.test/assets/maps/C999/manifest.json",
  event,
);
```

期待:

```ts
assert.equal(runtime.eventId, "C999");
assert.equal(runtime.displayName, "Comic Market 999");
assert.deepEqual(runtime.areas[0].prefixes, ["東"]);
assert.deepEqual(runtime.areas[0].labels, ["A", "B"]);
assert.equal(
  runtime.areas[0].mapFile,
  "https://example.test/assets/maps/C999/east/map.svg",
);
```

- [ ] **Step 2: eventId mismatch REDを書く**

registry event `C999`に対しbundle `eventId: "C998"`ならrejectする。

errorは最低限両eventIdを含み、診断可能にする。

- [ ] **Step 3: REDを確認する**

```bash
npx vitest run --root . \
  tests/map-manifest-loader.test.ts \
  tests/event-registry.test.ts
```

期待: current C108-only adapter/APIでFAIL。

- [ ] **Step 4: `C108_AREA_METADATA`を削除する**

`http-map-manifest-loader.ts`からconstant全体を削除する。

- [ ] **Step 5: adapterをgeneric化する**

`toRuntimeMapBundleManifest()`で最初に:

```ts
if (eventManifest.eventId !== event.eventId) {
  throw new Error(
    `Event map manifest mismatch: registry=${event.eventId}, manifest=${eventManifest.eventId}`,
  );
}
```

runtime manifestは:

```ts
return {
  schemaVersion: 1,
  eventId: eventManifest.eventId,
  displayName: event.displayName,
  bundleVersion: eventManifest.bundleVersion,
  areas: eventManifest.areas.map((area) => ({
    id: area.areaId,
    mapId: area.areaId,
    name: area.displayName,
    metersPerPixel: area.metersPerPixel,
    prefixes: area.prefixes,
    labels: area.labels,
    mapFile: new URL(area.assets.svg, bundleBase).href,
    pointsFile: new URL(area.assets.points, bundleBase).href,
    gridMetaFile: new URL(area.assets.gridMeta, bundleBase).href,
    gridFile: new URL(area.assets.grid, bundleBase).href,
  })),
};
```

- [ ] **Step 6: strict runtime loaderを追加する**

`loadEventRuntimeMapBundleManifestFromUrl()`は:

1. `loadEventMapBundleManifestFromUrl()`でstrict parse
2. `toRuntimeMapBundleManifest(..., event)`
3. return

だけを行う。

current `loadRuntimeMapBundleManifestFromUrl(manifestUrl, eventId, ...)`は削除し、callerを新APIへ移す。compat wrapperを残してeventId特殊分岐を温存しない。

- [ ] **Step 7: comment/nameからC108限定表現を除去する**

例:

```text
"strict C108 bundle contract" -> "strict production event bundle contract"
"Fetch and validate a C108 event map bundle" -> "Fetch and validate a production event map bundle"
```

- [ ] **Step 8: focused GREEN**

```bash
npx vitest run --root . \
  tests/map-manifest-loader.test.ts \
  tests/event-registry.test.ts
```

期待: PASS。

- [ ] **Step 9: commit**

```bash
git add \
  apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader.ts \
  tests/map-manifest-loader.test.ts \
  tests/event-registry.test.ts
git commit -m "refactor(event-map): remove C108 runtime special cases"
```

---

### Task 1.3: C108 metadataをmanifestへ移す

**Files:**
- Modify: `apps/webapp/map-bundles/C108/manifest.json`
- Modify: `tests/c108-map-assets.test.ts`
- Test: `tests/map-manifest-loader.test.ts`

**Interfaces:**
- Consumes: C108 current area inventory。
- Produces: strict generic manifestだけでC108 runtime area metadataを再現できるdata。

#### やってはいけないこと

- `map.svg`, `points.json`, `grid-meta.json`, `grid.bin`を変更しない。
- `metersPerPixel`を再計算しない。
- `bundleVersion`を変更しない。
- labelsの順序や文字種を「整理」しない。

- [ ] **Step 1: asset REDを追加する**

`tests/c108-map-assets.test.ts`のmanifest testで以下をassertする。

```ts
assert.deepEqual(manifest.areas.find((a) => a.areaId === "e456")?.prefixes, ["東"]);
assert.deepEqual(manifest.areas.find((a) => a.areaId === "e7")?.prefixes, ["東"]);
assert.deepEqual(manifest.areas.find((a) => a.areaId === "s12")?.prefixes, ["南"]);
assert.deepEqual(manifest.areas.find((a) => a.areaId === "w12")?.prefixes, ["西"]);
```

labelsは少なくともcurrent runtime constantと完全一致するexpected arraysでassertする。`length > 0`だけに弱めない。

- [ ] **Step 2: REDを確認する**

```bash
npx vitest run --root . tests/c108-map-assets.test.ts
```

期待: current manifestにmetadataがなくFAIL。

- [ ] **Step 3: C108 manifestへcurrent metadataを移す**

正本はTask開始時点の`http-map-manifest-loader.ts`にある`C108_AREA_METADATA`。

- `e456.prefixes = ["東"]`
- `e456.labels` = current katakana sequence
- `e7.prefixes = ["東"]`
- `e7.labels` = `A`〜`Z`
- `s12.prefixes = ["南"]`
- `s12.labels` = `a`〜`z`
- `w12.prefixes = ["西"]`
- `w12.labels` = current hiragana sequence

JSONでは各symbolをstring arrayとして明示する。

- [ ] **Step 4: strict parser + asset GREEN**

```bash
npx vitest run --root . \
  tests/c108-map-assets.test.ts \
  tests/map-manifest-loader.test.ts \
  tests/boundary-parsers.test.ts
```

期待: PASS。

- [ ] **Step 5: C108 code hardcode scan**

```bash
rg -n "C108_AREA_METADATA|Unsupported C108 area|Unsupported event map manifest" \
  apps/webapp/js
```

期待: 0 match。

`"C108"`自体はevent fixtures、registry、C108 asset tests等に存在してよい。禁止対象はruntime area metadata/event-dispatch special caseである。

- [ ] **Step 6: commit**

```bash
git add \
  apps/webapp/map-bundles/C108/manifest.json \
  tests/c108-map-assets.test.ts
git commit -m "data(event-map): move C108 area metadata into manifest"
```

---

### Task 1.4: composition rootでstrict production / legacy demoを明示分離する

**Files:**
- Modify: `apps/webapp/js/app/assemble-comipath-application.ts`
- Modify: `tests/event-registry.test.ts`
- Test: existing application/E2E tests as needed

**Interfaces:**
- normal event: `loadEventRuntimeMapBundleManifestFromUrl(manifestUrl, event, options)`
- dev demo: `loadMapBundleManifestFromUrl(manifestUrl, options)`

#### やってはいけないこと

- generic schema detectorを新設しない。
- `eventId === "demo-v1"`でproduction loader内部を分岐しない。
- demo manifestをstrict production shapeへ書き換えない。
- composition rootの他feature wiringを整理しない。

- [ ] **Step 1: testを新APIへ更新する**

`tests/event-registry.test.ts`のproduction runtime testはfictitious non-C108 eventでも成立する形へ変更する。

legacy demo testは`loadMapBundleManifestFromUrl()`を直接使い、legacy contractが残ることを明示する。

- [ ] **Step 2: composition rootを変更する**

`loadManifest`内でmanifest URLを一度だけ解決し、`demoEnabled`によりloaderを選択する。

概念形:

```ts
const manifestUrl = resolveEventMapManifestUrl(runtimeRegistryUrl, event);
const manifest = demoEnabled
  ? await loadMapBundleManifestFromUrl(manifestUrl, { fetcher: browserFetcher, signal })
  : await loadEventRuntimeMapBundleManifestFromUrl(
      manifestUrl,
      event,
      { fetcher: browserFetcher, signal },
    );
return toDomainMapManifest(manifest);
```

必要importだけ変更する。

- [ ] **Step 3: focused tests**

```bash
npx vitest run --root . \
  tests/event-registry.test.ts \
  tests/event-day-transition-service.test.ts \
  tests/application-assembly.test.ts
```

存在しないtest名があれば勝手に代替を作らず、実在する関連testを`ls tests | rg 'event|application'`で確認してreportへ実commandを記録する。

- [ ] **Step 4: dev demo smoke contract**

既存E2E/fixtureがdemo legacy manifestで起動するtestをfocusedで実行する。新しいdemo専用production codeを追加しない。

- [ ] **Step 5: commit**

```bash
git add \
  apps/webapp/js/app/assemble-comipath-application.ts \
  tests/event-registry.test.ts
git commit -m "refactor(event-map): separate production and demo loaders"
```

---

### Task 1.5: regression gateとprogressを閉じる

**Files:**
- Modify: `docs/status/progress.md`
- Modify production/test files only if a newly reproduced Task 1 regression requires it

#### やってはいけないこと

- full verification失敗を「既存failure」と推測で無視しない。
- snapshotを一括更新しない。
- Task 2のSVG generatorやwrapper pipelineへ進まない。

- [ ] **Step 1: Task 1 focused suiteをまとめて実行する**

```bash
npx vitest run --root . \
  tests/boundary-parsers.test.ts \
  tests/map-manifest-loader.test.ts \
  tests/event-registry.test.ts \
  tests/c108-map-assets.test.ts \
  tests/event-day-transition-service.test.ts
```

期待: PASS。

- [ ] **Step 2: architecture/type/build gate**

```bash
npm run check:webapp
npm run typecheck:functions
npm run build:webapp
node scripts/audit-public-tree.mjs
git diff --check
```

期待: 全PASS。

- [ ] **Step 3: full automated gate**

Task 0で確立したbaselineを維持するため、最終commit前に実行する。

```bash
npm run verify
npm run test:e2e:ci
```

期待: exit 0。skipは既存意図を確認して実数をreportする。

- [ ] **Step 4: scope audit**

```bash
git diff --stat <TASK_START_SHA>..HEAD
git diff --name-only <TASK_START_SHA>..HEAD
```

変更がFile map外へ広がった場合は、必要性を説明できなければ戻す。

さらに:

```bash
rg -n "C108_AREA_METADATA|Unsupported C108 area|eventId === [\"']C108[\"']" \
  apps/webapp/js/features/event-day \
  apps/webapp/js/app
```

期待: runtime special case 0件。

- [ ] **Step 5: progressを更新する**

`docs/status/progress.md`へ以下を実測値で記録する。

- Phase 7.6 / Task 0 manual acceptance完了
- Phase 8 Task 1実装commit群
- generic strict manifest contractの変更点
- C108 metadataがmanifestへ移ったこと
- non-C108 fixture test結果
- focused/full verificationの実数
- 次TaskはPhase 8 Task 2 `map.svg`再現可能生成
- GAS 2件の`OPEN_EXTERNAL_DEBT`は引き続き独立残件

Task 1が全gate PASSするまでTask 1完了と書かない。

- [ ] **Step 6: docs commit**

```bash
git add docs/status/progress.md
git commit -m "docs(phase-08): record generic event map contract"
```

- [ ] **Step 7: push**

```bash
git push origin HEAD:docs/phase-08-task-01-generic-event-map-contract-plan
```

mainへmergeしない。

## Acceptance checklist

- [ ] `EventMapAreaManifest`が`prefixes` / `labels`を必須で持つ。
- [ ] strict parserが1件以上の任意area数を受理する。
- [ ] missing/empty/duplicate prefixes/labelsを拒否する。
- [ ] strict parserがC108 area id/countを知らない。
- [ ] `C108_AREA_METADATA`がproduction TypeScriptから消える。
- [ ] production loaderに`eventId === "C108"`分岐がない。
- [ ] C999等のnon-C108 strict bundleをruntime manifestへ変換できる。
- [ ] registry eventIdとbundle eventId mismatchをrejectする。
- [ ] runtime displayNameはregistry displayName由来で、bundleへ重複追加しない。
- [ ] C108 manifestがcurrent prefixes/labelsを完全に保持する。
- [ ] `bundleVersion: "c108-v1"`を維持する。
- [ ] dev demo manifestを変更せずlegacy loaderで維持する。
- [ ] route/ALNS/grid/points/wall semanticsに変更なし。
- [ ] focused tests PASS。
- [ ] `npm run verify` PASS。
- [ ] `npm run test:e2e:ci` PASS。
- [ ] public tree audit / diff check PASS。
- [ ] Task 2以降を先取りしていない。
