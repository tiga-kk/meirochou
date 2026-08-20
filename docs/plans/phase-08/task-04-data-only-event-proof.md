# Phase 8 Task 4: Data-only Event Addition Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove with a second fictitious strict event that `meirochou` can consume an event registry entry plus map bundle data without any production application TypeScript change.

**Architecture:** Add a Task-3-shaped `C999` staging fixture under `tests/fixtures`, never under production registry/public map bundles. A focused Vitest composes that registry entry with the real production registry only in memory, then drives the existing strict manifest loader, runtime map-area normalization, and HTTP route-asset loader against actual fixture JSON/SVG/bin files. No application implementation is added; Task 4 is a contract/integration proof.

**Tech Stack:** TypeScript 7, Vitest 4, Node.js 22 `fs`/`Response`, existing `parseEventRegistry`, `resolveEventMapManifestUrl`, `loadRuntimeMapBundleManifestFromUrl`, `runtimeMapAreaCatalog`, `HttpRouteMapAssetsLoader`.

**Spec:** `docs/specs/2026-08-20-phase-08-task-04-data-only-event-proof-design.md`

## Global Constraints

- Repository is `tiga-kk/meirochou`.
- Start from the current remote planning branch, not from a SHA copied from this document.
- Task 4 depends on merged Phase 8 Task 1 in this repository and merged Task 3 in `tiga-kk/meirochou_wrapper`; do not reimplement either.
- `C999` is fictitious test-only data. Do not add it to `apps/webapp/events/manifest.json`.
- Do not add `apps/webapp/map-bundles/C999/`; normal Vite builds auto-copy public bundle directories.
- No changes under `apps/webapp/js/**`.
- No changes to `vite.config.ts`, package files, integrations, workflows, C108 assets, or demo-v1 assets.
- No C109 or other real-event data.
- No E2E fixture expansion, UI change, schema bump, route/ALNS change, or Task 5 refactor.
- The fixture must keep strict web `areaId = "east"` separate from route asset `map_id = "fixture-map"`.
- Published fixture `points.json.image` must not contain `path`.
- Use existing production loaders/parsers in the proof; do not copy their parsing logic into a new production helper.
- `npm run test:e2e:ci` is not a Task 4 completion gate because production runtime/build inputs remain unchanged. If implementation unexpectedly requires a production change, stop and return to browser review instead of expanding scope.

---

### Task 4.1: Add the C999 staging fixture and prove the existing runtime consumes it

**Goal:** Add one test-only strict event staging package and one integration test that reaches the existing strict manifest adapter and route asset loader without modifying production application code.

**Do not:** Put C999 in production registry/public map bundles, introduce a fixture-specific production branch, add a new loader/validator abstraction, or mock the parsers under test.

**Files:**
- Create: `tests/phase-08-data-only-event-addition.test.ts`
- Create: `tests/fixtures/phase-08-data-only-event/C999/event-registry-entry.json`
- Create: `tests/fixtures/phase-08-data-only-event/C999/map-bundle/manifest.json`
- Create: `tests/fixtures/phase-08-data-only-event/C999/map-bundle/east/map.svg`
- Create: `tests/fixtures/phase-08-data-only-event/C999/map-bundle/east/points.json`
- Create: `tests/fixtures/phase-08-data-only-event/C999/map-bundle/east/grid-meta.json`
- Create binary: `tests/fixtures/phase-08-data-only-event/C999/map-bundle/east/grid.bin`
- Read only: `apps/webapp/events/manifest.json`
- Read only: `apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts`
- Read only: `apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader.ts`
- Read only: `apps/webapp/js/features/route-guidance/infrastructure/runtime-map-area-catalog.ts`
- Read only: `apps/webapp/js/features/route-guidance/infrastructure/http-route-map-assets-loader.ts`

**Interfaces:**
- Consumes: `parseEventRegistry(input)`, `resolveEventMapManifestUrl(registryUrl, event)`, `loadRuntimeMapBundleManifestFromUrl(manifestUrl, event, { fetcher })`, `runtimeMapAreaCatalog.replaceMapAreas(areas)`, `HttpRouteMapAssetsLoader.loadMapAssets(mapArea)`.
- Produces: one self-contained C999 fixture and a focused integration regression that later Task 4 verification can run directly.

- [ ] **Step 1: Record the implementation start and confirm protected inputs**

From repository root:

```bash
git fetch origin --prune
git checkout docs/phase-08-task-04-data-only-event-proof-plan
git pull --ff-only
export TASK_START_SHA="$(git rev-parse HEAD)"
printf '%s\n' "$TASK_START_SHA"
git status --short
```

Read the spec and this plan before editing:

```bash
sed -n '1,260p' docs/specs/2026-08-20-phase-08-task-04-data-only-event-proof-design.md
sed -n '1,360p' docs/plans/phase-08/task-04-data-only-event-proof.md
```

Confirm production registry is still C108-only and C999 is absent from production code/data:

```bash
node --input-type=module - <<'NODE'
import { readFileSync } from 'node:fs';
const registry = JSON.parse(readFileSync('apps/webapp/events/manifest.json', 'utf8'));
console.log(registry.events.map((event) => event.eventId));
if (JSON.stringify(registry.events.map((event) => event.eventId)) !== JSON.stringify(['C108'])) {
  process.exitCode = 1;
}
NODE

git grep -n 'C999' -- apps/webapp/js apps/webapp/events apps/webapp/map-bundles || true
```

Expected before Task 4 implementation:

```text
[ 'C108' ]
```

and no production C999 match.

- [ ] **Step 2: Write the focused integration test before creating fixture files**

Create `tests/phase-08-data-only-event-addition.test.ts` with the following structure. The test intentionally references files that do not exist yet, so the first run is RED for the correct reason.

```ts
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, test } from "vitest";
import productionRegistryJson from "../apps/webapp/events/manifest.json";
import { parseEventRegistry } from "../apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers";
import {
  loadRuntimeMapBundleManifestFromUrl,
  resolveEventMapManifestUrl,
} from "../apps/webapp/js/features/event-day/infrastructure/http-map-manifest-loader";
import { HttpRouteMapAssetsLoader } from "../apps/webapp/js/features/route-guidance/infrastructure/http-route-map-assets-loader";
import { runtimeMapAreaCatalog } from "../apps/webapp/js/features/route-guidance/infrastructure/runtime-map-area-catalog";

const fixtureRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/phase-08-data-only-event/C999",
);

function fixturePath(relativePath: string): string {
  return resolve(fixtureRoot, relativePath);
}

function readFixtureJson(relativePath: string): any {
  return JSON.parse(readFileSync(fixturePath(relativePath), "utf8"));
}

const fixtureUrlToFile = new Map<string, string>([
  [
    "http://fixture.test/assets/maps/C999/manifest.json",
    "map-bundle/manifest.json",
  ],
  [
    "http://fixture.test/assets/maps/C999/east/points.json",
    "map-bundle/east/points.json",
  ],
  [
    "http://fixture.test/assets/maps/C999/east/grid-meta.json",
    "map-bundle/east/grid-meta.json",
  ],
  [
    "http://fixture.test/assets/maps/C999/east/grid.bin",
    "map-bundle/east/grid.bin",
  ],
]);

const fixtureFetch = (async (
  input: string | URL | Request,
  _init?: RequestInit,
): Promise<Response> => {
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  const relativePath = fixtureUrlToFile.get(url);
  if (!relativePath) {
    return new Response("Not Found", { status: 404 });
  }
  const bytes = readFileSync(fixturePath(relativePath));
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": relativePath.endsWith(".bin")
        ? "application/octet-stream"
        : "application/json",
    },
  });
}) as typeof fetch;

afterEach(() => {
  runtimeMapAreaCatalog.replaceMapAreas([]);
});

test("a second strict event is data-only across registry, manifest, and route assets", async () => {
  const fixtureEntry = readFixtureJson("event-registry-entry.json");
  const rawManifest = readFixtureJson("map-bundle/manifest.json");
  const rawPoints = readFixtureJson("map-bundle/east/points.json");
  const rawGridMeta = readFixtureJson("map-bundle/east/grid-meta.json");

  const registry = parseEventRegistry({
    schemaVersion: 1,
    events: [...productionRegistryJson.events, fixtureEntry],
  });
  assert.deepEqual(
    registry.events.map((event) => event.eventId),
    ["C108", "C999"],
  );

  const event = registry.events.find((candidate) => candidate.eventId === "C999");
  assert.ok(event);
  assert.equal(event.mapBundleContract, "event");

  const registryUrl = "http://fixture.test/assets/events/manifest.json";
  const manifestUrl = resolveEventMapManifestUrl(registryUrl, event);
  assert.equal(
    manifestUrl,
    "http://fixture.test/assets/maps/C999/manifest.json",
  );

  const runtimeManifest = await loadRuntimeMapBundleManifestFromUrl(
    manifestUrl,
    event,
    { fetcher: fixtureFetch },
  );
  assert.equal(runtimeManifest.eventId, "C999");
  assert.equal(runtimeManifest.displayName, "Fixture Event C999");
  assert.equal(runtimeManifest.bundleVersion, "fixture-c999-v1");
  assert.equal(runtimeManifest.areas.length, 1);
  assert.deepEqual(runtimeManifest.areas[0].prefixes, ["東"]);
  assert.deepEqual(runtimeManifest.areas[0].labels, ["A", "B"]);
  assert.equal(runtimeManifest.areas[0].metersPerPixel, 0.125);
  assert.equal(
    runtimeManifest.areas[0].mapFile,
    "http://fixture.test/assets/maps/C999/east/map.svg",
  );

  runtimeMapAreaCatalog.replaceMapAreas(
    runtimeManifest.areas as unknown as readonly Record<string, unknown>[],
  );
  const mapArea = runtimeMapAreaCatalog.getMapArea("east");
  assert.ok(mapArea);
  assert.equal(mapArea.areaId, "east");
  assert.deepEqual(mapArea.prefixes, ["東"]);
  assert.deepEqual(mapArea.labels, ["A", "B"]);

  const routeAssets = await new HttpRouteMapAssetsLoader(
    fixtureFetch,
  ).loadMapAssets(mapArea);

  assert.equal(rawManifest.areas[0].areaId, "east");
  assert.equal(rawPoints.map_id, "fixture-map");
  assert.equal(rawGridMeta.map_id, "fixture-map");
  assert.equal(rawPoints.image.path, undefined);
  assert.ok(routeAssets.points.points.length >= 1);
  assert.equal(routeAssets.gridMetadata.width, 48);
  assert.equal(routeAssets.gridMetadata.height, 32);
  assert.equal(routeAssets.gridMetadata.cell_size, 8);
  assert.equal(routeAssets.gridMetadata.cols, 6);
  assert.equal(routeAssets.gridMetadata.rows, 4);
  assert.equal(
    routeAssets.gridBytes.length,
    routeAssets.gridMetadata.cols * routeAssets.gridMetadata.rows,
  );
  assert.equal(routeAssets.gridBytes.length, 24);
  assert.equal(
    [...routeAssets.gridBytes].every((value) => value === 0 || value === 1 || value === 2),
    true,
  );

  const svgPath = fixturePath("map-bundle/east/map.svg");
  assert.equal(existsSync(svgPath), true);
  const svg = readFileSync(svgPath, "utf8");
  assert.match(svg, /viewBox="0 0 48 32"/);
  assert.doesNotMatch(svg, /<image\b/i);
});
```

Do not weaken this into calls to newly written fixture-specific parsers.

- [ ] **Step 3: Run the focused test and capture the RED**

```bash
npx vitest run --root . tests/phase-08-data-only-event-addition.test.ts
```

Expected: FAIL because `tests/fixtures/phase-08-data-only-event/C999/event-registry-entry.json` (or another first fixture file) does not exist. Record the exact ENOENT/missing-file failure in the final report.

If it fails for TypeScript syntax/type setup before reaching the missing fixture, fix only the test scaffold until RED is the missing fixture. Do not touch production code.

- [ ] **Step 4: Create the exact event registry entry fixture**

Create `tests/fixtures/phase-08-data-only-event/C999/event-registry-entry.json`:

```json
{
  "eventId": "C999",
  "displayName": "Fixture Event C999",
  "mapBundle": "../maps/C999/manifest.json",
  "mapBundleContract": "event",
  "days": [
    {
      "dayId": "day1",
      "displayName": "Fixture Day 1",
      "date": "2099-01-01"
    }
  ]
}
```

- [ ] **Step 5: Create the exact strict map manifest fixture**

Create `tests/fixtures/phase-08-data-only-event/C999/map-bundle/manifest.json`:

```json
{
  "schemaVersion": 1,
  "eventId": "C999",
  "bundleVersion": "fixture-c999-v1",
  "areas": [
    {
      "areaId": "east",
      "displayName": "Fixture East",
      "metersPerPixel": 0.125,
      "prefixes": ["東"],
      "labels": ["A", "B"],
      "assets": {
        "svg": "./east/map.svg",
        "points": "./east/points.json",
        "gridMeta": "./east/grid-meta.json",
        "grid": "./east/grid.bin"
      }
    }
  ]
}
```

Do not add `displayName` at top level. Strict event display name comes from the registry.

- [ ] **Step 6: Create Task-3-publication-shaped points data**

Create `tests/fixtures/phase-08-data-only-event/C999/map-bundle/east/points.json`:

```json
{
  "schema_version": 1,
  "map_id": "fixture-map",
  "image": {
    "width": 48,
    "height": 32
  },
  "grid": {
    "cell_size": 8,
    "cols": 6,
    "rows": 4,
    "grid_file": "grid.bin",
    "meta_file": "grid-meta.json"
  },
  "points": [
    {
      "id": "I_01-01-1",
      "point_id": 1,
      "group_id": "I_01",
      "identifier": "A",
      "number": "01",
      "center_x": 12.0,
      "center_y": 12.0,
      "portals": [
        {
          "col": 1,
          "row": 1,
          "x": 12.0,
          "y": 12.0
        }
      ]
    }
  ]
}
```

Important invariants:

```text
manifest areaId = east
points map_id = fixture-map
image.path = absent
identifier = non-empty
portal col/row = inside 6x4 grid
```

- [ ] **Step 7: Create matching grid metadata and bytes**

Create `tests/fixtures/phase-08-data-only-event/C999/map-bundle/east/grid-meta.json`:

```json
{
  "schema_version": 1,
  "map_id": "fixture-map",
  "width": 48,
  "height": 32,
  "cell_size": 8,
  "cols": 6,
  "rows": 4,
  "cell_values": {
    "blocked": 0,
    "normal": 1,
    "crowded": 2
  },
  "byte_order": "unsigned_uint8",
  "layout": "row-major",
  "grid_file": "grid.bin"
}
```

Create exactly 24 all-normal bytes in `grid.bin`:

```bash
mkdir -p tests/fixtures/phase-08-data-only-event/C999/map-bundle/east
node --input-type=module - <<'NODE'
import { writeFileSync } from 'node:fs';
const path = 'tests/fixtures/phase-08-data-only-event/C999/map-bundle/east/grid.bin';
writeFileSync(path, Buffer.alloc(24, 1));
NODE
```

Verify:

```bash
node --input-type=module - <<'NODE'
import { readFileSync } from 'node:fs';
const bytes = readFileSync('tests/fixtures/phase-08-data-only-event/C999/map-bundle/east/grid.bin');
console.log({ length: bytes.length, values: [...new Set(bytes)] });
if (bytes.length !== 24 || [...bytes].some((value) => value !== 1)) process.exitCode = 1;
NODE
```

Expected:

```text
{ length: 24, values: [ 1 ] }
```

- [ ] **Step 8: Create the minimal standalone SVG fixture**

Create `tests/fixtures/phase-08-data-only-event/C999/map-bundle/east/map.svg` exactly as a local-only standalone SVG. No image href or external resource is allowed.

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 32" width="48" height="32">
  <g id="navigation-grid">
    <rect x="0" y="0" width="48" height="32" />
  </g>
  <g id="identifiers">
    <text x="12" y="10">A</text>
  </g>
  <g id="space-numbers">
    <text x="12" y="18">01</text>
  </g>
</svg>
```

Task 4 is not a visual fidelity test; do not add CSS, PNG, font, embedded image, or snapshot.

- [ ] **Step 9: Run the focused proof to GREEN**

```bash
npx vitest run --root . tests/phase-08-data-only-event-addition.test.ts
```

Expected: 1 file / 1 test PASS.

If the test exposes a genuine existing application incompatibility with a Task-3-shaped strict bundle, stop and report the mismatch. Do not patch `apps/webapp/js/**` inside Task 4; that would disprove the data-only premise and requires browser redesign.

- [ ] **Step 10: Run adjacent contract regressions**

```bash
npx vitest run --root . \
  tests/event-registry.test.ts \
  tests/boundary-parsers.test.ts \
  tests/map-bundle-selection.test.ts \
  tests/phase-08-data-only-event-addition.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 11: Prove the fixture is not part of production data**

```bash
node --input-type=module - <<'NODE'
import { readFileSync } from 'node:fs';
const registry = JSON.parse(readFileSync('apps/webapp/events/manifest.json', 'utf8'));
if (JSON.stringify(registry.events.map((event) => event.eventId)) !== JSON.stringify(['C108'])) {
  console.error(registry.events.map((event) => event.eventId));
  process.exitCode = 1;
}
NODE

test ! -e apps/webapp/map-bundles/C999
```

Expected: both commands exit 0.

- [ ] **Step 12: Run the production-code no-diff gate before commit**

```bash
git diff --name-only "$TASK_START_SHA"..HEAD -- \
  apps/webapp/js \
  vite.config.ts \
  package.json \
  package-lock.json \
  integrations \
  .github/workflows

git diff --name-only "$TASK_START_SHA"..HEAD -- \
  apps/webapp/events/manifest.json \
  apps/webapp/map-bundles/C108 \
  apps/webapp/map-bundles/demo-v1
```

At this point the new files are uncommitted, so also inspect working-tree changes:

```bash
git diff --name-only -- \
  apps/webapp/js \
  vite.config.ts \
  package.json \
  package-lock.json \
  integrations \
  .github/workflows \
  apps/webapp/events/manifest.json \
  apps/webapp/map-bundles/C108 \
  apps/webapp/map-bundles/demo-v1
```

All three outputs must be empty.

Also:

```bash
git grep -n 'C999' -- apps/webapp/js || true
```

Expected: no output.

- [ ] **Step 13: Check hygiene and commit Task 4.1**

```bash
git diff --check
git status --short
```

Expected new implementation files are only:

```text
A tests/phase-08-data-only-event-addition.test.ts
A tests/fixtures/phase-08-data-only-event/C999/event-registry-entry.json
A tests/fixtures/phase-08-data-only-event/C999/map-bundle/manifest.json
A tests/fixtures/phase-08-data-only-event/C999/map-bundle/east/map.svg
A tests/fixtures/phase-08-data-only-event/C999/map-bundle/east/points.json
A tests/fixtures/phase-08-data-only-event/C999/map-bundle/east/grid-meta.json
A tests/fixtures/phase-08-data-only-event/C999/map-bundle/east/grid.bin
```

The design/plan docs were already present at `TASK_START_SHA` and should not appear as new Task 4.1 implementation files.

Commit:

```bash
git add \
  tests/phase-08-data-only-event-addition.test.ts \
  tests/fixtures/phase-08-data-only-event/C999

git commit -m "test(phase-08): prove data-only event addition"
```

---

### Task 4.2: Full verification, adversarial scope review, and handoff record

**Goal:** Establish that Task 4 is a proof-only change, record actual verification evidence, and stop before Task 5.

**Do not:** Change product code to satisfy a failing verification, update snapshots, run a broad refactor, start onboarding, or merge to main.

**Files:**
- Modify after verification: `docs/status/progress.md`
- Verify only: all Task 4 fixture/test files and protected production paths

**Interfaces:**
- Consumes: Task 4.1 focused integration proof.
- Produces: verified branch with factual progress/handoff evidence, ready for browser-side review.

- [ ] **Step 1: Run the focused Task 4 proof fresh**

```bash
npx vitest run --root . tests/phase-08-data-only-event-addition.test.ts
```

Record exact file/test counts and exit code.

- [ ] **Step 2: Run adjacent generic-event contract tests fresh**

```bash
npx vitest run --root . \
  tests/event-registry.test.ts \
  tests/boundary-parsers.test.ts \
  tests/map-bundle-selection.test.ts \
  tests/phase-08-data-only-event-addition.test.ts
```

Record exact test counts and exit code.

- [ ] **Step 3: Run full repository verification**

```bash
npm run verify
```

This command must exit 0. Record the Vitest file/test counts plus every sub-gate result reported by the command.

Do not substitute only `npm run check:webapp` for `npm run verify`.

- [ ] **Step 4: Re-run the data-only scope gates against the real implementation range**

```bash
git diff --name-status "$TASK_START_SHA"..HEAD

git diff --name-only "$TASK_START_SHA"..HEAD -- \
  apps/webapp/js \
  vite.config.ts \
  package.json \
  package-lock.json \
  integrations \
  .github/workflows

git diff --name-only "$TASK_START_SHA"..HEAD -- \
  apps/webapp/events/manifest.json \
  apps/webapp/map-bundles/C108 \
  apps/webapp/map-bundles/demo-v1

git grep -n 'C999' -- apps/webapp/js || true

test ! -e apps/webapp/map-bundles/C999
```

Required result:

- first command: Task 4.1 test/fixture files only, plus later progress doc after it is committed;
- second command: empty;
- third command: empty;
- C999 production TS grep: empty;
- no public C999 bundle path.

- [ ] **Step 5: Adversarially review the proof before writing status**

Answer each with concrete file/test evidence. A bare “yes” is not enough in the final report.

1. Is C999 absent from `apps/webapp/events/manifest.json`?
2. Is C999 absent from `apps/webapp/map-bundles/`?
3. Does the test append the fixture entry to the actual production registry only in memory?
4. Does the test call the production `parseEventRegistry()` rather than reimplement registry validation?
5. Does it call `resolveEventMapManifestUrl()` and get the exact `/assets/maps/C999/manifest.json` URL?
6. Does it call `loadRuntimeMapBundleManifestFromUrl()` using the existing strict branch?
7. Does it pass runtime areas through `runtimeMapAreaCatalog.replaceMapAreas()`?
8. Does `HttpRouteMapAssetsLoader` read the actual fixture `points.json`, `grid-meta.json`, and `grid.bin`?
9. Is `manifest areaId = east` different from raw asset `map_id = fixture-map`?
10. Is `points.json.image.path` absent?
11. Is `grid.bin` exactly24 bytes and consistent with6x4 metadata?
12. Are all grid bytes legal0/1/2 values?
13. Are there zero changes under `apps/webapp/js/**`?
14. Are Vite/package/workflow/integration files untouched?
15. Did the implementation avoid C109, Task 5, onboarding, legacy demo migration, and E2E fixture expansion?

If any answer is no, fix only Task 4 fixture/test evidence if possible. If a production code change appears necessary, stop and report a design blocker instead of editing production code.

- [ ] **Step 6: Update progress with actual evidence, but keep browser review as the gate**

Modify `docs/status/progress.md` minimally. Do not rewrite historic sections.

At the top/current-state section, change the Phase 8 status so it no longer claims Task 2 is unstarted. Record:

```text
- Phase 8 Task 1: meirochou generic event map contract — complete.
- Phase 8 Task 2: meirochou_wrapper reproducible map.svg generation — complete.
- Phase 8 Task 3: meirochou_wrapper reviewed event build pipeline — complete.
- Current Task: Phase 8 Task 4 data-only event addition proof — implementation complete, browser review pending.
- Next Task: Phase 8 Task 5 targeted application refactor — do not start before Task 4 browser acceptance.
- canonical Task 4 plan: docs/plans/phase-08/task-04-data-only-event-proof.md
- Task 4 design: docs/specs/2026-08-20-phase-08-task-04-data-only-event-proof-design.md
```

Add a compact Task 4 verification record containing only measured values from Steps 1–4:

- focused Task 4 file/test count;
- adjacent contract test count;
- `npm run verify` result/counts;
- production no-diff gate result;
- fixture properties (`C999`, one `east` area, internal `fixture-map`, 24 grid bytes);
- explicit statement: production registry/public bundle/application TypeScript unchanged;
- browser review pending.

Do not mark Task 4 `完了`/`CLOSED` until browser review accepts it.

- [ ] **Step 7: Commit the factual handoff/status update**

```bash
git diff --check
git add docs/status/progress.md
git commit -m "docs(phase-08): record task 4 verification"
```

- [ ] **Step 8: Re-run minimum post-doc verification**

```bash
npx vitest run --root . tests/phase-08-data-only-event-addition.test.ts
npm run verify
git diff --check
```

All must exit 0.

- [ ] **Step 9: Final branch scope audit**

```bash
git status --short
git diff --name-status "$TASK_START_SHA"..HEAD
git log --oneline "$TASK_START_SHA"..HEAD

git diff --name-only "$TASK_START_SHA"..HEAD -- \
  apps/webapp/js \
  vite.config.ts \
  package.json \
  package-lock.json \
  integrations \
  .github/workflows \
  apps/webapp/events/manifest.json \
  apps/webapp/map-bundles/C108 \
  apps/webapp/map-bundles/demo-v1
```

Expected implementation range:

```text
A tests/phase-08-data-only-event-addition.test.ts
A tests/fixtures/phase-08-data-only-event/C999/event-registry-entry.json
A tests/fixtures/phase-08-data-only-event/C999/map-bundle/manifest.json
A tests/fixtures/phase-08-data-only-event/C999/map-bundle/east/map.svg
A tests/fixtures/phase-08-data-only-event/C999/map-bundle/east/points.json
A tests/fixtures/phase-08-data-only-event/C999/map-bundle/east/grid-meta.json
A tests/fixtures/phase-08-data-only-event/C999/map-bundle/east/grid.bin
M docs/status/progress.md
```

Protected-path diff output must be empty.

- [ ] **Step 10: Push and stop for browser-side review**

```bash
git push origin docs/phase-08-task-04-data-only-event-proof-plan
```

Do not merge to main. Do not start Task 5.

Final report must include:

```text
TASK_START_SHA
final pushed HEAD
commits created
changed files
initial RED exact failure
focused Task 4 result/count
adjacent contract result/count
npm run verify result/counts
24-byte grid verification
areaId east vs map_id fixture-map evidence
points image.path absence evidence
production registry unchanged evidence
public C999 bundle absence evidence
production application TypeScript no-diff evidence
Vite/package/workflow no-diff evidence
any environment-only issue
```

## Task 4 final acceptance criteria

Task 4 is ready for browser review only when all are true:

- a test-only `C999` staging fixture exists with one strict area;
- fixture registry entry composes with the actual C108 production registry;
- existing strict manifest loader produces a C999 runtime manifest;
- existing runtime map-area normalization accepts the manifest;
- existing route asset loader reads actual fixture points/meta/grid bytes;
- web area ID and internal map ID stay independent;
- no machine-local `image.path` is published;
- grid metadata/bytes agree;
- production registry remains C108-only;
- no public C999 bundle exists;
- application TypeScript, Vite, package, integrations, workflows, C108, demo-v1 are untouched;
- focused and full verification are green;
- status records actual evidence and says browser review pending;
- Task 5 has not started.

Browser-side review, not Codex self-report, is the completion gate.
