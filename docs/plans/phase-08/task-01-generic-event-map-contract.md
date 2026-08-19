# Phase 8 Task 1 Generic Event Map Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** production event map loaderからC108固有event/area metadata依存を除去し、任意eventのstrict manifestとevent registry entryだけからruntime map manifestを構築できるようにする。

**Architecture:** production event bundleをgeneric strict contractとして扱い、`prefixes` / `labels`をarea manifestへ移す。strict/legacyの選択はeventIdやpayload shapeではなくregistry entryの`mapBundleContract`で明示し、未指定はstrict production contractとする。既存demo bundleはlegacyのまま維持する。

**Tech Stack:** TypeScript / Vitest / Playwright / Vite / Node.js 22.14.0 / npm 10.9.2。

**Spec:** `docs/specs/2026-08-20-phase-08-generic-event-map-contract-design.md`

## Global Constraints

- 実装開始前に`git fetch origin --prune`し、`origin/main`と作業branchの関係を記録する。
- Task 0 closure commitsを失わない。
- 既存の未追跡/未commit変更があるworktreeでは開始しない。以前残っていた`docs/reviews/phase-07-4-android-route-animation-diagnosis.md`を含め、clean worktreeを使う。
- `tiga-kk/meirochou_wrapper`は触らない。
- C109等の新production eventを追加しない。
- production event registryへ二つ目のeventを追加しない。
- `apps/webapp/map-bundles/demo-v1/manifest.json`を変更しない。
- wrapper manifest generator、bundle validation command、`map.svg`生成を先取りしない。
- `schemaVersion`は1のまま維持する。
- `bundleVersion: "c108-v1"`をmetadata移動だけで変更しない。
- malformed strict payloadをlegacy parserへfallbackしない。
- `eventId === "C108"`、`eventId === "demo-v1"`、URL/path文字列でcontractを判定しない。
- production codeへC108 area idやidentifier alphabetを新規ハードコードしない。
- route algorithm、ALNS、grid/points semantics、wall classificationを変更しない。
- `event-day-contracts.ts`と`application-contract-types.ts`の広範囲統合を先取りしない。
- visual snapshotを更新しない。このTaskに意図したUI変更はない。
- unrelated cleanup、format-all、rename-allをしない。
- mainへmergeしない。実装・検証・commit・pushはこのbranchで完結する。

## File map

### Modify

- `apps/webapp/js/features/event-day/domain/application-contract-types.ts`
  - `EventMapAreaManifest`へ`prefixes` / `labels`を追加。
  - `EventRegistryEntryV1`へoptional `mapBundleContract`を追加。
- `apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts`
  - strict production event bundle parserをgeneric化。
  - registry parserで`mapBundleContract`をvalidate。
- `apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader.ts`
  - `C108_AREA_METADATA`を削除。
  - runtime loaderをregistry metadata-drivenに変更。
- `apps/webapp/js/app/assemble-comipath-application.ts`
  - built-in demo registry entryへ`mapBundleContract: "legacy"`を付与。
  - loaderへevent entryそのものを渡す。
- `apps/webapp/map-bundles/C108/manifest.json`
  - C108 `prefixes` / `labels`をdataへ移動。
- `tests/boundary-parsers.test.ts`
- `tests/map-manifest-loader.test.ts`
- `tests/event-registry.test.ts`
- `tests/c108-map-assets.test.ts`
- `tests/e2e/fixture-registry.ts`
  - E2E demo registryへ`mapBundleContract: "legacy"`を付与。
- `docs/status/progress.md`
  - Task 1完了時のみ実測結果を反映。

### Create/Delete

- production codeの新規fileなし。
- file削除なし。

---

### Task 1.1: generic strict event bundle type/parser

**Files:**
- Modify: `apps/webapp/js/features/event-day/domain/application-contract-types.ts`
- Modify: `apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts`
- Test: `tests/boundary-parsers.test.ts`

**Interfaces:**

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

`EventMapBundleManifest` top-level shapeは変更しない。

#### やってはいけないこと

- area countを4以外の固定数へ置換しない。
- `prefixes` / `labels`をoptionalにしない。
- C108 area id一覧をparserへ追加しない。
- strict parser失敗時にlegacy parserを試さない。

- [ ] **Step 1: 1-area non-C108 manifestのREDを書く**

`tests/boundary-parsers.test.ts`へ次のfixtureを追加する。

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

以下をassertする。

```ts
const parsed = parseEventMapBundleManifest(genericEventMapManifest);
assert.equal(parsed.areas.length, 1);
assert.deepEqual(parsed.areas[0].prefixes, ["東"]);
assert.deepEqual(parsed.areas[0].labels, ["A", "B"]);
```

- [ ] **Step 2: REDを実行する**

```bash
npx vitest run --root . tests/boundary-parsers.test.ts
```

期待: current exactly-four contractでFAIL。

- [ ] **Step 3: metadata validation REDを追加する**

次をそれぞれrejectするtestを書く。

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

error pathは`.prefixes` / `.labels`を含むこと。

- [ ] **Step 4: type/parserを最小変更する**

`EventMapAreaManifest`へ`prefixes`, `labels`を追加する。

`parseEventMapBundleManifest()`のarea数条件を:

```ts
if (!Array.isArray(value.areas) || value.areas.length === 0) {
  throw new BoundaryValidationError(
    "map bundle manifest.areas",
    "a non-empty array",
  );
}
```

へ変更する。

area解析では既存`uniqueTextArray()`を使う。

```ts
const prefixes = uniqueTextArray(areaObj.prefixes, `${areaPath}.prefixes`);
const labels = uniqueTextArray(areaObj.labels, `${areaPath}.labels`);
```

returned frozen areaへ両fieldを含める。

既存の`areaId` unique、positive scale、strict asset path、freeze semanticsは維持する。

- [ ] **Step 5: GREEN**

```bash
npx vitest run --root . tests/boundary-parsers.test.ts
```

- [ ] **Step 6: commit**

```bash
git add \
  apps/webapp/js/features/event-day/domain/application-contract-types.ts \
  apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts \
  tests/boundary-parsers.test.ts
git commit -m "refactor(event-map): generalize strict bundle contract"
```

---

### Task 1.2: registry contractでstrict/legacyを明示する

**Files:**
- Modify: `apps/webapp/js/features/event-day/domain/application-contract-types.ts`
- Modify: `apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts`
- Modify: `apps/webapp/js/app/assemble-comipath-application.ts`
- Modify: `tests/e2e/fixture-registry.ts`
- Test: `tests/event-registry.test.ts`

**Interfaces:**

```ts
export interface EventRegistryEntryV1 {
  readonly eventId: string;
  readonly displayName: string;
  readonly mapBundle: string;
  readonly mapBundleContract?: "event" | "legacy";
  readonly days: readonly EventDay[];
}
```

意味:

- missing / `"event"` => generic strict production contract
- `"legacy"` => existing legacy demo contract

#### やってはいけないこと

- production C108 registryへ`legacy`を付けない。
- `eventId`やmapBundle pathからlegacyを推測しない。
- unknown contract値をstrictへsilently fallbackしない。
- demo manifest自体をstrictへ変換しない。

- [ ] **Step 1: parser REDを書く**

`tests/event-registry.test.ts`へ以下を追加する。

```ts
expect(parseEventRegistry(registryWithoutContract).events[0].mapBundleContract)
  .toBeUndefined();
expect(parseEventRegistry(registryWithLegacy).events[0].mapBundleContract)
  .toBe("legacy");
```

`"foo"`, empty string, number等は`mapBundleContract` pathでrejectする。

- [ ] **Step 2: type/parserを実装する**

`EventRegistryEntryV1`へoptional fieldを追加する。

`parseEventRegistry()`でfieldが存在する場合のみexact stringとして読み、`"event" | "legacy"`以外をrejectする。未指定のpayloadへ新fieldを自動書き込まなくてよい。runtime loader側でmissingをstrictとして扱う。

- [ ] **Step 3: demo registryだけlegacyを明示する**

`assemble-comipath-application.ts`内のbuilt-in demo registry entry 2箇所へ:

```ts
mapBundleContract: "legacy" as const,
```

を追加する。

`tests/e2e/fixture-registry.ts`の`DEMO_EVENT_REGISTRY`にも:

```ts
mapBundleContract: "legacy",
```

を追加する。

production `apps/webapp/events/manifest.json`は変更しない。

- [ ] **Step 4: focused GREEN**

```bash
npx vitest run --root . tests/event-registry.test.ts
```

- [ ] **Step 5: commit**

```bash
git add \
  apps/webapp/js/features/event-day/domain/application-contract-types.ts \
  apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts \
  apps/webapp/js/app/assemble-comipath-application.ts \
  tests/e2e/fixture-registry.ts \
  tests/event-registry.test.ts
git commit -m "refactor(event-map): make bundle contract explicit"
```

---

### Task 1.3: runtime loaderからC108 special caseを除去する

**Files:**
- Modify: `apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader.ts`
- Modify: `apps/webapp/js/app/assemble-comipath-application.ts`
- Test: `tests/map-manifest-loader.test.ts`
- Test: `tests/event-registry.test.ts`

**Interfaces:**

`toRuntimeMapBundleManifest()`:

```ts
export function toRuntimeMapBundleManifest(
  eventManifest: EventMapBundleManifest,
  manifestUrl: string,
  event: Pick<EventRegistryEntryV1, "eventId" | "displayName">,
): MapBundleManifestV1
```

`loadRuntimeMapBundleManifestFromUrl()`:

```ts
export async function loadRuntimeMapBundleManifestFromUrl(
  manifestUrl: string,
  event: Pick<
    EventRegistryEntryV1,
    "eventId" | "displayName" | "mapBundleContract"
  >,
  options?: LoadMapBundleManifestOptions,
): Promise<MapBundleManifestV1>
```

#### やってはいけないこと

- `eventId === "C108"` / `eventId === "demo-v1"`を残さない。
- strict/legacyをschema parse失敗で切り替えない。
- C108 metadata constantを別fileへ移すだけにしない。
- eventId mismatchを黙って受理しない。

- [ ] **Step 1: non-C108 strict runtime REDを書く**

`tests/map-manifest-loader.test.ts`へC999 strict payloadを用意する。1 areaでよい。

```ts
const event = { eventId: "C999", displayName: "Comic Market 999" };
```

runtime resultで:

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

をassertする。

- [ ] **Step 2: eventId mismatch REDを書く**

registry=`C999`, strict bundle=`C998`ならrejectする。error messageは両IDを含める。

- [ ] **Step 3: explicit legacy REDを書く**

`tests/event-registry.test.ts`のlegacy demo runtime testを:

```ts
{
  eventId: "demo-v1",
  displayName: "ComiPath Demo",
  mapBundleContract: "legacy",
}
```

で呼び、existing legacy payloadを読めることを証明する。

同じpayloadをcontract missingで呼んだ場合、strict parse failureになることも1 testで証明する。これによりsilent fallbackがないことを固定する。

- [ ] **Step 4: REDを実行する**

```bash
npx vitest run --root . \
  tests/map-manifest-loader.test.ts \
  tests/event-registry.test.ts
```

- [ ] **Step 5: `C108_AREA_METADATA`を削除する**

constant全体と`Unsupported C108 area`分岐を削除する。

- [ ] **Step 6: generic adapterを実装する**

strict adapterはregistry eventIdとの一致を先に確認する。

```ts
if (eventManifest.eventId !== event.eventId) {
  throw new Error(
    `Event map manifest mismatch: registry=${event.eventId}, manifest=${eventManifest.eventId}`,
  );
}
```

area mappingはmanifest metadataだけを使う。

```ts
{
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
}
```

runtime top-level `displayName`はregistry `event.displayName`を使う。

- [ ] **Step 7: runtime loaderをmetadata-drivenにする**

```ts
if (event.mapBundleContract === "legacy") {
  return loadMapBundleManifestFromUrl(manifestUrl, options);
}
const eventManifest = await loadEventMapBundleManifestFromUrl(
  manifestUrl,
  options,
);
return toRuntimeMapBundleManifest(eventManifest, manifestUrl, event);
```

legacy branch以外は常にstrict。catchしてlegacy fallbackしない。

- [ ] **Step 8: composition rootのcallerを新signatureへ変更する**

現在の:

```ts
loadRuntimeMapBundleManifestFromUrl(url, event.eventId, options)
```

を:

```ts
loadRuntimeMapBundleManifestFromUrl(url, event, options)
```

へ変更するだけに留める。

- [ ] **Step 9: C108限定commentをgeneric wordingへ直す**

`strict C108`等のcommentを`strict production event bundle`へ変更する。

- [ ] **Step 10: GREEN**

```bash
npx vitest run --root . \
  tests/map-manifest-loader.test.ts \
  tests/event-registry.test.ts
```

- [ ] **Step 11: commit**

```bash
git add \
  apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader.ts \
  apps/webapp/js/app/assemble-comipath-application.ts \
  tests/map-manifest-loader.test.ts \
  tests/event-registry.test.ts
git commit -m "refactor(event-map): remove C108 runtime special cases"
```

---

### Task 1.4: C108 metadataをmanifestへ移す

**Files:**
- Modify: `apps/webapp/map-bundles/C108/manifest.json`
- Modify: `tests/c108-map-assets.test.ts`
- Existing tests: `tests/map-manifest-loader.test.ts`, `tests/boundary-parsers.test.ts`

#### やってはいけないこと

- `map.svg`, `points.json`, `grid-meta.json`, `grid.bin`を変更しない。
- `metersPerPixel`を再計算しない。
- `bundleVersion`を変更しない。
- labelsの順序/文字種を整理しない。

- [ ] **Step 1: C108 manifest metadata REDを書く**

`tests/c108-map-assets.test.ts`で各areaのprefixesをexact assertする。

```ts
e456 -> ["東"]
e7   -> ["東"]
s12  -> ["南"]
w12  -> ["西"]
```

labelsもTask開始時の`C108_AREA_METADATA`と完全一致するexpected arraysでassertする。`length > 0`だけでは不可。

- [ ] **Step 2: REDを実行する**

```bash
npx vitest run --root . tests/c108-map-assets.test.ts
```

- [ ] **Step 3: manifestへmetadataを移す**

Task開始時の`http-map-manifest-loader.ts`にあるconstantを唯一の移行元としてJSON arrayへ転記する。

- `e456`: prefix東 + current katakana sequence
- `e7`: prefix東 + A-Z
- `s12`: prefix南 + a-z
- `w12`: prefix西 + current hiragana sequence

`bundleVersion`は`c108-v1`のまま。

- [ ] **Step 4: focused GREEN**

```bash
npx vitest run --root . \
  tests/c108-map-assets.test.ts \
  tests/map-manifest-loader.test.ts \
  tests/boundary-parsers.test.ts
```

- [ ] **Step 5: hardcode scan**

```bash
rg -n "C108_AREA_METADATA|Unsupported C108 area|eventId === [\"']C108[\"']" \
  apps/webapp/js/features/event-day \
  apps/webapp/js/app
```

期待: runtime special case 0 match。

- [ ] **Step 6: commit**

```bash
git add \
  apps/webapp/map-bundles/C108/manifest.json \
  tests/c108-map-assets.test.ts
git commit -m "data(event-map): move C108 area metadata into manifest"
```

---

### Task 1.5: legacy demo/E2E回帰とfull gateを閉じる

**Files:**
- Verify/Modify only if reproduced failure requires it:
  - `tests/e2e/fixture-registry.ts`
  - `tests/e2e/*.spec.ts`
- Modify at completion: `docs/status/progress.md`

#### やってはいけないこと

- E2E failureを直すためdemo manifestをstrict化しない。
- `mapBundleContract`をproduction C108 entryへ追加して挙動をごまかさない。
- visual snapshotを更新しない。
- Task 2のSVG generatorやwrapperへ進まない。

- [ ] **Step 1: parser/loader/registry/asset focused suite**

```bash
npx vitest run --root . \
  tests/boundary-parsers.test.ts \
  tests/map-manifest-loader.test.ts \
  tests/event-registry.test.ts \
  tests/c108-map-assets.test.ts \
  tests/event-day-transition-service.test.ts \
  tests/application-assembly.test.ts
```

実在しないtest pathがあれば、`ls tests | rg 'event|application|manifest'`で実在fileを確認してから、同じ責務の既存testを選ぶ。勝手に無関係testへ置換しない。

- [ ] **Step 2: E2E demo fixture smoke**

`routeDemoEventRegistry()`を使う既存E2Eから、最低限以下を含むfocused subsetを実行する。

- app boot + demo registry
- navigation resumeまたはroute guidance
- management flow

具体的なspec名は現在repoで確認して実行commandをreportする。

ここでlegacy demo manifestをstrict parseしようとするfailureが出た場合、まず`DEMO_EVENT_REGISTRY.mapBundleContract === "legacy"`とparsed registry propagationを確認する。

- [ ] **Step 3: architecture/type/build gates**

```bash
npm run check:webapp
npm run typecheck:functions
npm run build:webapp
node scripts/audit-public-tree.mjs
git diff --check
```

- [ ] **Step 4: full automated gates**

```bash
npm run verify
npm run test:e2e:ci
```

Task 0 final baselineは`verify` PASS、CI E2E 72 passed / 8 skipped / 0 failedだった。今回もexit 0を要求する。件数変化があれば理由を記録する。

- [ ] **Step 5: scope audit**

```bash
git diff --name-only <TASK_START_SHA>..HEAD
git diff --stat <TASK_START_SHA>..HEAD
```

File map外の変更は必要性を説明できなければ戻す。

さらに:

```bash
rg -n "C108_AREA_METADATA|Unsupported C108 area|eventId === [\"']C108[\"']|eventId === [\"']demo-v1[\"']" \
  apps/webapp/js/features/event-day \
  apps/webapp/js/app
```

期待: contract selection / area metadataのeventId special case 0件。

- [ ] **Step 6: progress更新**

全gate PASS後だけ`docs/status/progress.md`へ実測値で記録する。

- Phase 7.6 / Phase 8 Task 0 manual acceptance完了
- Phase 8 Task 1 commit群
- generic strict manifest contract
- `mapBundleContract`の意味（missing/event=strict、legacy=demo only）
- C108 metadataのmanifest移行
- C999 non-C108 focused test
- focused/full verification実数
- 次Task: Phase 8 Task 2 `map.svg`再現可能生成
- GAS 2件の`OPEN_EXTERNAL_DEBT`継続

- [ ] **Step 7: docs commit**

```bash
git add docs/status/progress.md
git commit -m "docs(phase-08): record generic event map contract"
```

- [ ] **Step 8: push**

```bash
git push origin HEAD:docs/phase-08-task-01-generic-event-map-contract-plan
```

mainへmergeしない。

## Acceptance checklist

- [ ] `EventMapAreaManifest`が`prefixes` / `labels`を必須で持つ。
- [ ] strict parserが1件以上の任意area数を受理する。
- [ ] missing/empty/duplicate prefixes/labelsをrejectする。
- [ ] `EventRegistryEntryV1.mapBundleContract?: "event" | "legacy"`が存在する。
- [ ] unknown mapBundleContractをrejectする。
- [ ] missing mapBundleContractはstrict production contractとして動く。
- [ ] production C108 registryはcontract field未指定のままstrict loadingする。
- [ ] built-in demoとE2E demo registryだけがlegacyを明示する。
- [ ] demo-v1 manifestを変更していない。
- [ ] `C108_AREA_METADATA`がproduction TypeScriptから消える。
- [ ] production loaderにC108/demo-v1 eventId special caseがない。
- [ ] C999等non-C108 strict bundleをruntimeへ変換できる。
- [ ] registry eventIdとstrict bundle eventId mismatchをrejectする。
- [ ] runtime strict displayNameはregistry displayName由来。
- [ ] C108 manifestがcurrent prefixes/labelsを完全保持する。
- [ ] `bundleVersion: "c108-v1"`を維持する。
- [ ] route/ALNS/grid/points/wall semanticsに変更なし。
- [ ] focused tests PASS。
- [ ] E2E demo fixture smoke PASS。
- [ ] `npm run verify` PASS。
- [ ] `npm run test:e2e:ci` PASS。
- [ ] public tree audit / diff check PASS。
- [ ] Task 2以降を先取りしていない。
