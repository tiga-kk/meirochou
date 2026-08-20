# Phase 8 Task 1 Generic Event Map Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** production event map loaderからC108固有event/area metadata依存を除去し、任意eventのstrict manifestとevent registry entryだけからruntime map manifestを構築できるようにする。

**Architecture:** production event bundleをgeneric strict contractとして扱い、`prefixes` / `labels`をarea manifestへ移す。strict/legacyの選択はeventIdやpayload shapeではなくregistry entryの`mapBundleContract`で明示し、未指定はstrict production contractとする。既存demo bundleはlegacyのまま維持する。

**Tech Stack:** TypeScript / Vitest / Playwright / Vite / Node.js 22.14.0 / npm 10.9.2。

**Spec:** `docs/specs/2026-08-20-phase-08-generic-event-map-contract-design.md`

## Global Constraints

- 実装開始前に`git fetch origin --prune`し、`origin/main`と作業branchの関係を記録する。
- Task 0 closure commitsを失わない。`origin/main`へresetしてはいけない。
- clean worktreeで開始する。既存の未追跡/未commit fileがある場合は別worktreeを使い、勝手に削除・commitしない。
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
- 各code commitはその時点で関連focused testsがGREENになる単位にする。一時的にC108 bundleを壊したcommitを作らない。
- mainへmergeしない。実装・検証・commit・pushはこのbranchで完結する。

## Execution preflight

実装変更前に実行する。

```bash
git fetch origin --prune
git status --short
git rev-parse HEAD
git rev-parse origin/main
git log -1 --oneline HEAD
git log -1 --oneline origin/main
git merge-base --is-ancestor origin/main HEAD
node --version
npm --version
```

期待:

- `git status --short`が空。空でなければ別clean worktreeを作る。
- `origin/main`がHEADのancestor。mainが進んでいてancestorでない場合は、Task 0 closure + Task 1 plan commitsを保持したままrebaseする。resetで捨てない。
- Node `v22.14.0`, npm `10.9.2`。違う場合は実versionを最終報告へ記録し、package設定を変更しない。

開始HEADをshell variableへ保存する。

```bash
TASK_START_SHA="$(git rev-parse HEAD)"
printf '%s\n' "$TASK_START_SHA"
```

以降のscope auditではこの`$TASK_START_SHA`を使う。

## File map

### Modify

- `apps/webapp/js/features/event-day/domain/application-contract-types.ts`
- `apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts`
- `apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader.ts`
- `apps/webapp/js/app/assemble-comipath-application.ts`
- `apps/webapp/map-bundles/C108/manifest.json`
- `tests/boundary-parsers.test.ts`
- `tests/map-manifest-loader.test.ts`
- `tests/event-registry.test.ts`
- `tests/c108-map-assets.test.ts`
- `tests/e2e/fixture-registry.ts`
- `docs/status/progress.md`（全gate PASS後のみ）

### Create/Delete

- production codeの新規fileなし。
- file削除なし。
- demo-v1 bundle変更なし。

---

### Task 1.1: strict contract generic化とC108 data migrationを同時に行う

このsubtaskでは`prefixes` / `labels`必須化とC108 manifest移行を同じcommitにする。parserだけ先に必須化してcurrent C108を壊してはいけない。

**Files:**
- Modify: `apps/webapp/js/features/event-day/domain/application-contract-types.ts`
- Modify: `apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts`
- Modify: `apps/webapp/map-bundles/C108/manifest.json`
- Modify: `tests/boundary-parsers.test.ts`
- Modify: `tests/map-manifest-loader.test.ts`
- Modify: `tests/event-registry.test.ts`
- Modify: `tests/c108-map-assets.test.ts`

**Produces:**

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

- area countを別の固定数へ変更しない。
- `prefixes` / `labels`をoptionalにしない。
- C108 area id一覧をparserへ追加しない。
- C108 asset fileやmetersPerPixelを変更しない。
- `bundleVersion`を変更しない。

- [ ] **Step 1: generic 1-area strict manifest REDを書く**

`tests/boundary-parsers.test.ts`へ次を追加する。

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

```ts
const parsed = parseEventMapBundleManifest(genericEventMapManifest);
assert.equal(parsed.areas.length, 1);
assert.deepEqual(parsed.areas[0].prefixes, ["東"]);
assert.deepEqual(parsed.areas[0].labels, ["A", "B"]);
```

- [ ] **Step 2: prefixes/labels validation REDを書く**

以下を個別にrejectする。

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

- [ ] **Step 3: REDを確認する**

```bash
npx vitest run --root . tests/boundary-parsers.test.ts
```

期待: exactly-four制約または未実装metadataでFAIL。

- [ ] **Step 4: type/parserをgeneric化する**

`EventMapAreaManifest`へ`prefixes`, `labels`を追加。

`parseEventMapBundleManifest()`のarea数条件をnon-emptyへ変更する。

```ts
if (!Array.isArray(value.areas) || value.areas.length === 0) {
  throw new BoundaryValidationError(
    "map bundle manifest.areas",
    "a non-empty array",
  );
}
```

area解析では既存`uniqueTextArray()`を使う。

```ts
const prefixes = uniqueTextArray(areaObj.prefixes, `${areaPath}.prefixes`);
const labels = uniqueTextArray(areaObj.labels, `${areaPath}.labels`);
```

returned frozen areaへ両fieldを含める。

既存の`areaId` regex/uniqueness、positive scale、exact asset path、freeze semanticsは維持する。

comment `strict four-area manifest used by C108`もgeneric production wordingへ直す。

- [ ] **Step 5: C108 manifestへ現constantをそのまま移す**

Task開始時の`http-map-manifest-loader.ts`にある`C108_AREA_METADATA`を移行元にする。

- `e456`: `prefixes=["東"]` + current katakana sequence
- `e7`: `prefixes=["東"]` + A-Z
- `s12`: `prefixes=["南"]` + a-z
- `w12`: `prefixes=["西"]` + current hiragana sequence

JSONでは各symbolをstring arrayとして明示する。

- [ ] **Step 6: existing strict fixture literalsも同時更新する**

parser必須化により壊れるstrict manifest fixtureを同じcommitで直す。

最低限:

- `tests/map-manifest-loader.test.ts` の `validC108Payload`
- `tests/event-registry.test.ts` の `mockC108Manifest`

各areaへC108 manifestと同じ`prefixes` / `labels`を入れる。test fixture独自の簡略labelsを使ってcurrent behaviorを弱めない。

- [ ] **Step 7: C108 asset exact metadata testを追加する**

`tests/c108-map-assets.test.ts`でparsed manifestのprefixes/labelsを完全一致assertする。

`length > 0`だけでは不可。

- [ ] **Step 8: focused GREEN**

```bash
npx vitest run --root . \
  tests/boundary-parsers.test.ts \
  tests/map-manifest-loader.test.ts \
  tests/event-registry.test.ts \
  tests/c108-map-assets.test.ts
```

- [ ] **Step 9: commit**

```bash
git add \
  apps/webapp/js/features/event-day/domain/application-contract-types.ts \
  apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts \
  apps/webapp/map-bundles/C108/manifest.json \
  tests/boundary-parsers.test.ts \
  tests/map-manifest-loader.test.ts \
  tests/event-registry.test.ts \
  tests/c108-map-assets.test.ts
git commit -m "refactor(event-map): generalize strict bundle metadata"
```

---

### Task 1.2: registry contractでlegacy demoを明示する

**Files:**
- Modify: `apps/webapp/js/features/event-day/domain/application-contract-types.ts`
- Modify: `apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts`
- Modify: `apps/webapp/js/app/assemble-comipath-application.ts`
- Modify: `tests/e2e/fixture-registry.ts`
- Modify: `tests/event-registry.test.ts`

**Produces:**

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
- `"legacy"` => existing demo legacy contract

#### やってはいけないこと

- production C108 registryへ`legacy`を付けない。
- eventIdやpathからlegacyを推測しない。
- unknown valueをstrictへsilently fallbackしない。
- demo manifestを変更しない。

- [ ] **Step 1: registry parser REDを書く**

`tests/event-registry.test.ts`で:

- field missingをaccept
- `"event"`をaccept
- `"legacy"`をaccept
- `"foo"`, `""`, numberをreject

を固定する。

- [ ] **Step 2: type/parserを実装する**

fieldが存在する場合だけexact stringとして読み、`event|legacy`以外を`BoundaryValidationError`でrejectする。

parsed eventにはfieldが存在した場合だけ保持する。missing payloadへ`event`を書き足す必要はない。

- [ ] **Step 3: built-in demoだけlegacyを明示する**

`assemble-comipath-application.ts`内のbuilt-in demo registry entry 2箇所へ:

```ts
mapBundleContract: "legacy" as const,
```

を追加する。

- [ ] **Step 4: E2E fixture registryもlegacyを明示する**

`tests/e2e/fixture-registry.ts`:

```ts
mapBundleContract: "legacy",
```

production `apps/webapp/events/manifest.json`は変更しない。

- [ ] **Step 5: focused GREEN**

```bash
npx vitest run --root . tests/event-registry.test.ts
```

- [ ] **Step 6: commit**

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

### Task 1.3: runtime loaderからC108 event/area special caseを除去する

**Files:**
- Modify: `apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader.ts`
- Modify: `apps/webapp/js/app/assemble-comipath-application.ts`
- Modify: `tests/map-manifest-loader.test.ts`
- Modify: `tests/event-registry.test.ts`

**Interfaces:**

```ts
export function toRuntimeMapBundleManifest(
  eventManifest: EventMapBundleManifest,
  manifestUrl: string,
  event: Pick<EventRegistryEntryV1, "eventId" | "displayName">,
): MapBundleManifestV1
```

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
- schema parse failureを契機にlegacy fallbackしない。
- `C108_AREA_METADATA`を別fileへ移すだけにしない。
- strict eventId mismatchを黙って受理しない。

- [ ] **Step 1: non-C108 strict runtime REDを書く**

`tests/map-manifest-loader.test.ts`へ1-area C999 strict payloadを追加する。

registry event:

```ts
const event = { eventId: "C999", displayName: "Comic Market 999" };
```

assert:

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

- [ ] **Step 2: strict eventId mismatch REDを書く**

registry=`C999`, bundle=`C998`でrejectし、messageに両IDを含める。

- [ ] **Step 3: explicit legacy/no-fallback REDを書く**

`tests/event-registry.test.ts`でexisting legacy payloadを:

```ts
{
  eventId: "demo-v1",
  displayName: "ComiPath Demo",
  mapBundleContract: "legacy",
}
```

ならload可能とする。

同じlegacy payloadをcontract missingで呼ぶとstrict parser errorになることも固定する。

- [ ] **Step 4: REDを実行する**

```bash
npx vitest run --root . \
  tests/map-manifest-loader.test.ts \
  tests/event-registry.test.ts
```

- [ ] **Step 5: `C108_AREA_METADATA`とC108 guardsを削除する**

以下をproduction loaderから完全削除する。

- `C108_AREA_METADATA`
- `eventManifest.eventId !== "C108"` guard
- `Unsupported C108 area`
- `eventId === "C108"` contract selection

- [ ] **Step 6: generic adapterを実装する**

strict bundleとregistry eventId一致を確認する。

```ts
if (eventManifest.eventId !== event.eventId) {
  throw new Error(
    `Event map manifest mismatch: registry=${event.eventId}, manifest=${eventManifest.eventId}`,
  );
}
```

area runtime metadataはmanifestからのみ取得する。

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

strict runtime top-level `displayName`はregistry `event.displayName`。

- [ ] **Step 7: runtime loaderをcontract metadata-drivenにする**

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

catchしてlegacyへfallbackしない。

- [ ] **Step 8: assembly callerを新signatureへ変更する**

```ts
loadRuntimeMapBundleManifestFromUrl(
  resolveEventMapManifestUrl(runtimeRegistryUrl, event),
  event,
  { fetcher: browserFetcher, signal },
)
```

loader選択以外のcompositionを触らない。

- [ ] **Step 9: C108限定commentをgeneric wordingへ変更する**

- [ ] **Step 10: focused GREEN**

```bash
npx vitest run --root . \
  tests/map-manifest-loader.test.ts \
  tests/event-registry.test.ts \
  tests/application-assembly.test.ts
```

- [ ] **Step 11: hardcode scan**

```bash
rg -n "C108_AREA_METADATA|Unsupported C108 area|eventId === [\"']C108[\"']|eventId === [\"']demo-v1[\"']" \
  apps/webapp/js/features/event-day \
  apps/webapp/js/app
```

期待: map contract selection / area metadataに関するeventId special case 0件。

- [ ] **Step 12: commit**

```bash
git add \
  apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader.ts \
  apps/webapp/js/app/assemble-comipath-application.ts \
  tests/map-manifest-loader.test.ts \
  tests/event-registry.test.ts
git commit -m "refactor(event-map): remove C108 runtime special cases"
```

---

### Task 1.4: demo/E2E回帰・full gate・progressを閉じる

**Files:**
- Verify: existing tests/E2E
- Modify at completion: `docs/status/progress.md`
- Other modification only if a newly reproduced Task 1 regression requires it

#### やってはいけないこと

- E2E failureを直すためdemo manifestをstrict化しない。
- production C108 registryへ`mapBundleContract`を追加してごまかさない。
- visual snapshotを更新しない。
- Task 2のSVG generatorやwrapperへ進まない。

- [ ] **Step 1: complete focused suite**

```bash
npx vitest run --root . \
  tests/boundary-parsers.test.ts \
  tests/map-manifest-loader.test.ts \
  tests/event-registry.test.ts \
  tests/c108-map-assets.test.ts \
  tests/event-day-transition-service.test.ts \
  tests/application-assembly.test.ts
```

期待: PASS。

- [ ] **Step 2: E2E demo fixture smoke**

`tests/e2e/fixture-registry.ts`の`routeDemoEventRegistry()`を使う既存specから最低限:

```bash
npx playwright test \
  tests/e2e/navigation-resume.spec.ts \
  tests/e2e/management.spec.ts \
  --project=mobile-chromium
```

を実行する。

もしproject名がcurrent configと異なる場合だけ`npx playwright test --list`で実在project名を確認して同等mobile projectを使い、最終報告に実commandを残す。

legacy demo manifestをstrict parseするfailureが出た場合は、まず`DEMO_EVENT_REGISTRY.mapBundleContract === "legacy"`と`parseEventRegistry()`のfield伝播を確認する。

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

Task 0 final baselineは`verify` PASS、CI E2E 72 passed / 8 skipped / 0 failed。今回もexit 0を要求する。件数変化があれば理由を記録する。

- [ ] **Step 5: scope audit**

```bash
git diff --name-only "$TASK_START_SHA"..HEAD
git diff --stat "$TASK_START_SHA"..HEAD
```

File map外の変更は必要性を説明できなければ戻す。

- [ ] **Step 6: completion hardcode scan**

```bash
rg -n "C108_AREA_METADATA|Unsupported C108 area|eventId === [\"']C108[\"']|eventId === [\"']demo-v1[\"']" \
  apps/webapp/js/features/event-day \
  apps/webapp/js/app
```

期待: contract selection / area metadata special case 0件。

- [ ] **Step 7: progress更新**

全gate PASS後だけ`docs/status/progress.md`へ実測値で記録する。

- Phase 7.6 / Phase 8 Task 0 manual acceptance完了
- Phase 8 Task 1実装commit群
- generic strict manifest contract
- `mapBundleContract`: missing/event=strict、legacy=demo only
- C108 metadataのmanifest移行
- C999 non-C108 focused test
- focused/full verification実数
- 次Task: Phase 8 Task 2 `map.svg`再現可能生成
- GAS 2件の`OPEN_EXTERNAL_DEBT`継続

Task 1が全gate PASSするまで完了と書かない。

- [ ] **Step 8: docs commit**

```bash
git add docs/status/progress.md
git commit -m "docs(phase-08): record generic event map contract"
```

- [ ] **Step 9: push**

```bash
git push origin HEAD:docs/phase-08-task-01-generic-event-map-contract-plan
```

mainへmergeしない。

## Acceptance checklist

- [ ] `EventMapAreaManifest`が`prefixes` / `labels`を必須で持つ。
- [ ] strict parserが1件以上の任意area数を受理する。
- [ ] missing/empty/duplicate prefixes/labelsをrejectする。
- [ ] C108 manifestとstrict test fixturesが同じcommitで新contractへ移行し、一時的broken commitがない。
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
