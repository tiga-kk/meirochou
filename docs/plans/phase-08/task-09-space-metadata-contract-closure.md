# Phase 8 Task 9 Space Metadata Contract Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the production strict event-map contract and `meirochou_wrapper build-event` reject space metadata that the current webapp runtime cannot unambiguously interpret.

**Architecture:** Keep the current runtime space parsing and area lookup unchanged. Make `space-parser.ts` the TypeScript grammar owner, enforce that grammar plus cross-area ownership uniqueness at the strict manifest boundary, then mirror the same small contract in the Python event builder before publication. Update operator documentation and run full verification in both repositories before browser review.

**Tech Stack:** TypeScript, Vitest, Vite, Playwright, Python 3, `unittest`, Ruff, Pyright, Git/GitHub.

**Spec:** `docs/specs/2026-08-21-phase-08-task-09-space-metadata-contract-closure-design.md`

## Global Constraints

- Do not generalize runtime area matching to variable-length prefixes.
- Do not add numeric/kanji/emoji label support.
- Do not change `BrowserApplication` space lookup, route guidance algorithms, nearby/gallery behavior, or map rendering.
- Do not change production C108 registry data or map bundle bytes.
- Do not migrate the legacy demo map contract.
- Do not bump schema versions.
- Do not add JSON Schema, a code generator, a shared npm/Python schema package, a plugin system, DI container, or migration framework.
- Webapp prefix contract: one non-whitespace, NFKC-stable JavaScript UTF-16 code unit.
- Webapp label contract: one NFKC-stable character matching `[A-Za-z\u3041-\u3096\u30A1-\u30FA]`.
- Every `(prefix, label)` pair may belong to at most one strict event-map area.
- `meirochou_wrapper` must reject the same invalid metadata before artifact publication.
- Surrounding-whitespace trimming already performed by existing `uniqueTextArray()` / `_unique_strings()` remains unchanged.
- Task 8 verification history remains historical evidence; Task 9 does not rewrite or falsify it.
- Task 9 completion state is `implementation complete / browser review pending`; do not mark Phase 8 CLOSED/ACCEPTED.
- No main merge is part of this implementation plan.

---

## Repository setup and observed baselines

Planning-time observations:

```text
meirochou/main
75adaebd9b571d24aaee09d443dec17513baf10d

tiga-kk/meirochou_wrapper/main
aa864f1ba80b87b63760248edc60b39a85d18d58
```

These SHAs are evidence only. They are not implementation reset targets.

At implementation start, fetch both repositories and derive fresh start SHAs.

### meirochou

Use the planning branch that contains this plan:

```bash
git fetch origin
git switch docs/phase-08-task-09-space-metadata-contract-closure-plan
git pull --ff-only origin docs/phase-08-task-09-space-metadata-contract-closure-plan
export MEIROCHOU_TASK_START_SHA="$(git rev-parse HEAD)"
```

Required ancestry/scope sanity:

```bash
git merge-base --is-ancestor origin/main HEAD
git status --short
git log -5 --oneline
```

Expected before implementation: clean worktree and branch descended from current `origin/main`.

### meirochou_wrapper

Locate the wrapper repository separately. Do not copy wrapper source into `meirochou`.

```bash
git fetch origin
```

If remote branch does not exist:

```bash
git switch --create feature/phase-08-task-09-space-metadata-contract-closure origin/main
```

If it already exists and is confirmed to be this Task 9 branch:

```bash
git switch feature/phase-08-task-09-space-metadata-contract-closure
git pull --ff-only origin feature/phase-08-task-09-space-metadata-contract-closure
```

Then:

```bash
export WRAPPER_TASK_START_SHA="$(git rev-parse HEAD)"
git status --short
git log -5 --oneline
```

If the branch exists but contains unrelated work, stop with `BLOCKED_WRAPPER_BRANCH_COLLISION`; do not overwrite or force-push it.

---

### Task 9.0: Record fresh baselines in both repositories

**Goal:** Prove the pre-Task-9 state is green and preserve exact verification evidence before changing the contract.

**Do not:** Do not modify code, snapshots, test retries, production data, or dependency files in this task.

**Files:**
- Read: `apps/webapp/js/shared/domain/space-parser.ts`
- Read: `apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts`
- Read: `tests/space-parser.test.ts`
- Read: `tests/boundary-parsers.test.ts`
- Read in wrapper: `python/pathdata/comiket_pathdata/event_build.py`
- Read in wrapper: `python/pathdata/tests/test_event_build.py`
- No file changes.

**Interfaces:**
- Consumes: current production strict manifest parser and current wrapper build pipeline.
- Produces: baseline command output only.

- [ ] **Step 1: Run focused meirochou baseline**

```bash
npx vitest run --root . \
  tests/space-parser.test.ts \
  tests/boundary-parsers.test.ts \
  tests/phase-08-data-only-event-addition.test.ts \
  tests/c108-map-assets.test.ts
```

Expected: PASS with zero failing tests.

- [ ] **Step 2: Run meirochou architecture/diff baseline**

```bash
npm run check:webapp:architecture
git diff --check
git status --short
```

Expected: PASS and no implementation diff.

- [ ] **Step 3: Run focused wrapper baseline**

From `meirochou_wrapper/python/pathdata`:

```bash
.venv/bin/python -m unittest tests.test_event_build -v
.venv/bin/python -m unittest tests.test_svg_render -v
```

Expected: PASS.

- [ ] **Step 4: Run wrapper static/diff baseline**

```bash
.venv/bin/ruff check .
.venv/bin/python -m pyright
cd ../..
git diff --check
git status --short
```

Expected: PASS and no implementation diff.

- [ ] **Step 5: Do not commit baseline-only work**

No commit should be created for Task 9.0 because no source file changes are expected.

---

### Task 9.1: Define the runtime-compatible metadata character predicates in `space-parser.ts`

**Goal:** Put the already-existing runtime character grammar behind two tiny predicates so the strict manifest parser does not duplicate or widen it.

**Do not:** Do not alter `canonicalizeSpace()`, `parseSpace()`, normalization order, side suffix rules, compatibility parser fallback, or area lookup logic.

**Files:**
- Modify: `apps/webapp/js/shared/domain/space-parser.ts`
- Modify: `tests/space-parser.test.ts`

**Interfaces:**
- Consumes: existing local `spaceLabel` regex source and JavaScript `String.prototype.normalize` behavior.
- Produces:
  - `isRuntimeSpacePrefixCharacter(value: unknown): value is string`
  - `isRuntimeSpaceLabelCharacter(value: unknown): value is string`

- [ ] **Step 1: Add failing predicate tests**

Update the import in `tests/space-parser.test.ts`:

```ts
import {
  canonicalizeSpace,
  isRuntimeSpaceLabelCharacter,
  isRuntimeSpacePrefixCharacter,
  parseSpace,
} from "../apps/webapp/js/shared/domain/space-parser";
```

Add these tests inside the existing `describe("space parser", ...)` block:

```ts
it("defines runtime-compatible area prefix characters", () => {
  for (const value of ["東", "西", "南", "A"]) {
    expect(isRuntimeSpacePrefixCharacter(value)).toBe(true);
  }

  for (const value of ["", " ", "東館", "Ａ", "①", "😀"]) {
    expect(isRuntimeSpacePrefixCharacter(value)).toBe(false);
  }
});

it("defines runtime-compatible area label characters", () => {
  for (const value of ["A", "z", "あ", "ん", "ア", "ン"]) {
    expect(isRuntimeSpaceLabelCharacter(value)).toBe(true);
  }

  for (const value of ["", " ", "1", "東", "AB", "Ａ", "😀"]) {
    expect(isRuntimeSpaceLabelCharacter(value)).toBe(false);
  }
});
```

- [ ] **Step 2: Run the focused test to prove RED**

```bash
npx vitest run --root . tests/space-parser.test.ts
```

Expected: FAIL because the two exports do not yet exist.

- [ ] **Step 3: Add the minimal predicates without changing parsing behavior**

In `apps/webapp/js/shared/domain/space-parser.ts`, keep the existing `spaceLabel` source and construct one anchored predicate regex from it:

```ts
const spaceLabel = "[A-Za-z\\u3041-\\u3096\\u30A1-\\u30FA]";
const runtimeSpaceLabelPattern = new RegExp(`^${spaceLabel}$`, "u");
```

Add:

```ts
export function isRuntimeSpacePrefixCharacter(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.length === 1 &&
    !/\s/u.test(value) &&
    value.normalize("NFKC") === value
  );
}

export function isRuntimeSpaceLabelCharacter(
  value: unknown,
): value is string {
  return (
    typeof value === "string" &&
    value.normalize("NFKC") === value &&
    runtimeSpaceLabelPattern.test(value)
  );
}
```

Do not add normalization of manifest values here; these are predicates, not converters.

- [ ] **Step 4: Run focused GREEN tests**

```bash
npx vitest run --root . tests/space-parser.test.ts
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Commit the contract exposure**

```bash
git add \
  apps/webapp/js/shared/domain/space-parser.ts \
  tests/space-parser.test.ts

git commit -m "test(phase-08): expose runtime space metadata contract"
```

---

### Task 9.2: Enforce character grammar and unambiguous area ownership in the strict production manifest parser

**Goal:** Reject strict event manifests that cannot be interpreted by current runtime area lookup or that make an input space belong to multiple areas.

**Do not:** Do not change `parseMapBundleManifest()` for legacy demo bundles. Do not modify route-guidance catalog lookup or `BrowserApplication`. Do not auto-normalize invalid metadata into a valid value.

**Files:**
- Modify: `apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts`
- Modify: `tests/boundary-parsers.test.ts`
- Run unchanged: `tests/phase-08-data-only-event-addition.test.ts`
- Run unchanged: `tests/c108-map-assets.test.ts`

**Interfaces:**
- Consumes:
  - `isRuntimeSpacePrefixCharacter(value: unknown): value is string`
  - `isRuntimeSpaceLabelCharacter(value: unknown): value is string`
- Produces: stricter behavior of existing `parseEventMapBundleManifest(input: unknown): EventMapBundleManifest`; no signature change.

- [ ] **Step 1: Add strict-character RED cases**

In `tests/boundary-parsers.test.ts`, add:

```ts
test("parseEventMapBundleManifest rejects metadata outside the runtime space grammar", () => {
  const invalidMetadata = [
    ["prefixes", ["東館"]],
    ["prefixes", ["Ａ"]],
    ["prefixes", ["①"]],
    ["prefixes", ["😀"]],
    ["labels", ["1"]],
    ["labels", ["東"]],
    ["labels", ["Ａ"]],
    ["labels", ["😀"]],
  ] as const;

  for (const [field, value] of invalidMetadata) {
    assert.throws(
      () =>
        parseEventMapBundleManifest({
          ...genericEventMapManifest,
          areas: [
            {
              ...genericEventMapManifest.areas[0],
              [field]: value,
            },
          ],
        }),
      new RegExp(`map bundle manifest\\.areas\\[0\\]\\.${field}`),
      `${field}=${JSON.stringify(value)} should be rejected`,
    );
  }
});
```

- [ ] **Step 2: Add area-ownership RED and non-overrestriction tests**

Add a local helper near `genericEventMapManifest`:

```ts
function genericArea(
  areaId: string,
  prefixes: readonly string[],
  labels: readonly string[],
) {
  return {
    areaId,
    displayName: areaId,
    metersPerPixel: 0.1,
    prefixes,
    labels,
    assets: {
      svg: `./${areaId}/map.svg`,
      points: `./${areaId}/points.json`,
      gridMeta: `./${areaId}/grid-meta.json`,
      grid: `./${areaId}/grid.bin`,
    },
  };
}
```

Add:

```ts
test("parseEventMapBundleManifest rejects ambiguous cross-area space ownership", () => {
  assert.throws(
    () =>
      parseEventMapBundleManifest({
        ...genericEventMapManifest,
        areas: [
          genericArea("east-a", ["東"], ["A", "B"]),
          genericArea("east-b", ["東"], ["B", "C"]),
        ],
      }),
    /map bundle manifest\.areas\[1\]/,
  );
});

test("parseEventMapBundleManifest allows disjoint prefix-label ownership", () => {
  const samePrefix = parseEventMapBundleManifest({
    ...genericEventMapManifest,
    areas: [
      genericArea("east-a", ["東"], ["A", "B"]),
      genericArea("east-b", ["東"], ["C", "D"]),
    ],
  });
  assert.equal(samePrefix.areas.length, 2);

  const sameLabel = parseEventMapBundleManifest({
    ...genericEventMapManifest,
    areas: [
      genericArea("east", ["東"], ["A"]),
      genericArea("west", ["西"], ["A"]),
    ],
  });
  assert.equal(sameLabel.areas.length, 2);
});
```

- [ ] **Step 3: Run strict parser tests to prove RED**

```bash
npx vitest run --root . tests/boundary-parsers.test.ts
```

Expected: new invalid character and ambiguous ownership cases FAIL under the old parser.

- [ ] **Step 4: Import the shared grammar predicates**

Change the existing `space-parser` import in `application-boundary-parsers.ts` to:

```ts
import {
  canonicalizeSpace,
  isRuntimeSpaceLabelCharacter,
  isRuntimeSpacePrefixCharacter,
} from "../../../shared/domain/space-parser";
```

Do not move these predicates into event-day infrastructure.

- [ ] **Step 5: Add focused strict metadata array validators**

Place these helpers close to `uniqueTextArray()`:

```ts
function runtimeSpacePrefixArray(
  value: unknown,
  path: string,
): readonly string[] {
  const parsed = uniqueTextArray(value, path);
  parsed.forEach((prefix, index) => {
    if (!isRuntimeSpacePrefixCharacter(prefix)) {
      throw new BoundaryValidationError(
        `${path}[${index}]`,
        "a single NFKC-stable runtime space prefix character",
      );
    }
  });
  return parsed;
}

function runtimeSpaceLabelArray(
  value: unknown,
  path: string,
): readonly string[] {
  const parsed = uniqueTextArray(value, path);
  parsed.forEach((label, index) => {
    if (!isRuntimeSpaceLabelCharacter(label)) {
      throw new BoundaryValidationError(
        `${path}[${index}]`,
        "one runtime-supported ASCII letter, hiragana, or katakana label character",
      );
    }
  });
  return parsed;
}
```

Do not alter `uniqueTextArray()` itself because it is also used by the legacy manifest parser.

- [ ] **Step 6: Use the strict validators only in `parseEventMapBundleManifest()`**

Replace:

```ts
const prefixes = uniqueTextArray(
  areaObj.prefixes,
  `${areaPath}.prefixes`,
);
const labels = uniqueTextArray(areaObj.labels, `${areaPath}.labels`);
```

with:

```ts
const prefixes = runtimeSpacePrefixArray(
  areaObj.prefixes,
  `${areaPath}.prefixes`,
);
const labels = runtimeSpaceLabelArray(
  areaObj.labels,
  `${areaPath}.labels`,
);
```

- [ ] **Step 7: Enforce unique `(prefix, label)` ownership across areas**

Before the area loop, next to `seenAreaIds`, add:

```ts
const seenSpaceAreaOwners = new Map<string, string>();
```

After parsing `prefixes` and `labels`, before pushing the area, add:

```ts
for (const prefix of prefixes) {
  for (const label of labels) {
    const ownershipKey = JSON.stringify([prefix, label]);
    const previousAreaId = seenSpaceAreaOwners.get(ownershipKey);
    if (previousAreaId !== undefined) {
      throw new BoundaryValidationError(
        areaPath,
        `unambiguous space ownership; '${prefix}${label}' is already owned by area '${previousAreaId}'`,
      );
    }
    seenSpaceAreaOwners.set(ownershipKey, areaId);
  }
}
```

Do not resolve collisions by manifest ordering.

- [ ] **Step 8: Run focused GREEN tests including unchanged valid-event proofs**

```bash
npx vitest run --root . \
  tests/space-parser.test.ts \
  tests/boundary-parsers.test.ts \
  tests/phase-08-data-only-event-addition.test.ts \
  tests/c108-map-assets.test.ts

npm run check:webapp
git diff --check
```

Expected: PASS.

- [ ] **Step 9: Inspect the production-data diff gate**

```bash
git diff --name-only "$MEIROCHOU_TASK_START_SHA"..HEAD -- \
  apps/webapp/events \
  apps/webapp/map-bundles
```

Expected: no output.

- [ ] **Step 10: Commit the strict parser fix**

```bash
git add \
  apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts \
  tests/boundary-parsers.test.ts

git commit -m "fix(phase-08): validate strict space metadata"
```

---

### Task 9.3: Mirror the production space metadata contract in `meirochou_wrapper`

**Goal:** Make `build-event` fail before publication for every metadata form the production strict parser rejects.

**Do not:** Do not make wrapper call or modify the `meirochou` repository. Do not change OCR, SVG rendering, grid generation, staged publication topology, or event/day/area ID rules.

**Files in `tiga-kk/meirochou_wrapper`:**
- Modify: `python/pathdata/comiket_pathdata/event_build.py`
- Modify: `python/pathdata/tests/test_event_build.py`

**Interfaces:**
- Consumes: existing `EventAreaBuildConfig`, `_unique_strings()`, `_allowed_symbols()`, `load_event_build_config()`.
- Produces: stricter validation only; `build_event_manifest()` and output file shapes do not change.

- [ ] **Step 1: Add prefix grammar RED tests**

In `python/pathdata/tests/test_event_build.py`, add:

```python
def test_load_event_build_config_enforces_runtime_space_prefix_contract(self):
    for prefixes in ('["東"]', '["西"]', '["A"]'):
        with self.subTest(prefixes=prefixes), tempfile.TemporaryDirectory() as temp_dir:
            fixture = self._write_fixture(Path(temp_dir), prefixes=prefixes)
            config = load_event_build_config(fixture / "event.toml")
            self.assertTrue(config.areas[0].prefixes)

    for prefixes in (
        '["東館"]',
        '[" "]',
        '["Ａ"]',
        '["①"]',
        '["😀"]',
    ):
        with self.subTest(prefixes=prefixes), tempfile.TemporaryDirectory() as temp_dir:
            fixture = self._write_fixture(Path(temp_dir), prefixes=prefixes)
            with self.assertRaises(EventBuildError):
                load_event_build_config(fixture / "event.toml")
```

- [ ] **Step 2: Add derived-label grammar RED tests**

Add:

```python
def test_load_event_build_config_enforces_runtime_space_label_contract(self):
    for symbols in ('["A", "B"]', '["あ"]', '["ア"]'):
        with self.subTest(symbols=symbols), tempfile.TemporaryDirectory() as temp_dir:
            fixture = self._write_fixture(Path(temp_dir), allowed_symbols=symbols)
            config = load_event_build_config(fixture / "event.toml")
            self.assertTrue(config.areas[0].labels)

    for symbols in (
        '["1"]',
        '["東"]',
        '[" "]',
        '["Ａ"]',
        '["😀"]',
    ):
        with self.subTest(symbols=symbols), tempfile.TemporaryDirectory() as temp_dir:
            fixture = self._write_fixture(Path(temp_dir), allowed_symbols=symbols)
            with self.assertRaises(EventBuildError):
                load_event_build_config(fixture / "event.toml")
```

This supersedes the narrower whitespace-only assertion but do not remove useful existing coverage unless it becomes exactly redundant.

- [ ] **Step 3: Extend the second-area fixture helper for ownership tests**

Change `_add_second_area()` to accept explicit second-area prefixes and symbols while preserving current defaults used by atomic-publication tests.

Use this signature:

```python
def _add_second_area(
    self,
    fixture: Path,
    *,
    prefixes: str = '["西"]',
    allowed_symbols: str = '["A", "B"]',
) -> None:
```

After copying `maps/internal-map` to `maps/internal-map-2`, replace the copied map TOML's `allowed_symbols` line with the supplied `allowed_symbols` value before appending the second `[[areas]]` table.

The appended line must use:

```python
+ f"prefixes = {prefixes}\n"
```

Keep the existing `area_id = "west7"`, copied OCR fixture, and output paths.

- [ ] **Step 4: Add cross-area ownership RED/positive tests**

Add:

```python
def test_load_event_build_config_rejects_ambiguous_space_area_ownership(self):
    with tempfile.TemporaryDirectory() as temp_dir:
        fixture = self._write_fixture(Path(temp_dir))
        self._add_second_area(
            fixture,
            prefixes='["東"]',
            allowed_symbols='["B", "C"]',
        )
        with self.assertRaisesRegex(EventBuildError, "東B|ownership|east7|west7"):
            load_event_build_config(fixture / "event.toml")


def test_load_event_build_config_allows_disjoint_space_area_ownership(self):
    with tempfile.TemporaryDirectory() as temp_dir:
        fixture = self._write_fixture(Path(temp_dir))
        self._add_second_area(
            fixture,
            prefixes='["東"]',
            allowed_symbols='["C", "D"]',
        )
        config = load_event_build_config(fixture / "event.toml")
        self.assertEqual(len(config.areas), 2)

    with tempfile.TemporaryDirectory() as temp_dir:
        fixture = self._write_fixture(Path(temp_dir), allowed_symbols='["A"]')
        self._add_second_area(
            fixture,
            prefixes='["西"]',
            allowed_symbols='["A"]',
        )
        config = load_event_build_config(fixture / "event.toml")
        self.assertEqual(len(config.areas), 2)
```

- [ ] **Step 5: Run wrapper focused tests to prove RED**

From `python/pathdata`:

```bash
.venv/bin/python -m unittest tests.test_event_build -v
```

Expected: new grammar/ownership cases fail before implementation.

- [ ] **Step 6: Add exact cross-language runtime constants/helpers**

In `event_build.py`, add:

```python
import unicodedata
```

Near the existing regex constants add:

```python
SPACE_LABEL_RE = re.compile(r"^[A-Za-z\u3041-\u3096\u30A1-\u30FA]$")
```

Add:

```python
def _is_single_runtime_utf16_unit(value: str) -> bool:
    try:
        return (
            len(value.encode("utf-16-le")) == 2
            and unicodedata.normalize("NFKC", value) == value
        )
    except UnicodeEncodeError:
        return False


def _runtime_space_prefixes(
    value: object,
    field: str,
    source: str,
) -> tuple[str, ...]:
    prefixes = _unique_strings(value, field, source)
    for prefix in prefixes:
        if not _is_single_runtime_utf16_unit(prefix) or prefix.isspace():
            raise EventBuildError(
                f"{source}.{field} must contain single NFKC-stable runtime prefix characters"
            )
    return prefixes


def _is_runtime_space_label(value: str) -> bool:
    return (
        _is_single_runtime_utf16_unit(value)
        and SPACE_LABEL_RE.fullmatch(value) is not None
    )
```

Do not use Python `len(value) == 1` as the sole prefix length check; that would incorrectly accept astral characters that JavaScript `cleaned[0]` cannot represent as one unit.

- [ ] **Step 7: Apply the prefix validator and label predicate**

In `_load_area()`, replace:

```python
prefixes = _unique_strings(area_payload.get("prefixes"), "prefixes", source)
```

with:

```python
prefixes = _runtime_space_prefixes(
    area_payload.get("prefixes"),
    "prefixes",
    source,
)
```

In `_allowed_symbols()`, require each string to satisfy `_is_runtime_space_label(symbol)` instead of only the old one-character/non-whitespace check.

Use an error message that contains `allowed_symbols` and `runtime space label` so failures remain diagnosable.

- [ ] **Step 8: Add one ownership validator and call it from config loading**

Add:

```python
def _validate_space_area_ownership(
    areas: tuple[EventAreaBuildConfig, ...] | list[EventAreaBuildConfig],
) -> None:
    owners: dict[tuple[str, str], str] = {}
    for area in areas:
        for prefix in area.prefixes:
            for label in area.labels:
                key = (prefix, label)
                previous_area_id = owners.get(key)
                if previous_area_id is not None:
                    raise EventBuildError(
                        "ambiguous space area ownership: "
                        f"{prefix}{label} is owned by both "
                        f"{previous_area_id} and {area.area_id}"
                    )
                owners[key] = area.area_id
```

In `load_event_build_config()`, after all areas are parsed and duplicate `area_id` checks have completed, call:

```python
_validate_space_area_ownership(areas)
```

Then return the existing `EventBuildConfig` unchanged.

- [ ] **Step 9: Run wrapper focused GREEN tests**

```bash
cd python/pathdata
.venv/bin/python -m unittest tests.test_event_build -v
.venv/bin/python -m unittest tests.test_cli -v
.venv/bin/ruff check .
.venv/bin/python -m pyright
```

Expected: PASS.

- [ ] **Step 10: Verify no wrapper publication/rendering scope leaked**

From wrapper repository root:

```bash
git diff --name-only "$WRAPPER_TASK_START_SHA"..HEAD -- \
  python/ocr \
  python/pathdata/comiket_pathdata/svg_render.py \
  python/pathdata/comiket_pathdata/web_export.py \
  python/pathdata/comiket_pathdata/grid.py \
  .github/workflows
```

Expected: no output.

- [ ] **Step 11: Commit wrapper test+fix in meaningful TDD commits**

If RED tests were committed separately, use:

```bash
git add python/pathdata/tests/test_event_build.py
git commit -m "test(pathdata): expose runtime space metadata contract"
```

Then after implementation:

```bash
git add \
  python/pathdata/comiket_pathdata/event_build.py \
  python/pathdata/tests/test_event_build.py

git commit -m "fix(pathdata): align event space metadata validation"
```

If modifying the fixture helper is required for both RED tests and GREEN implementation and a standalone RED commit would leave the branch syntactically broken, keep the helper/test changes together in the test commit. Every committed intermediate state must be syntactically valid.

---

### Task 9.4: Update operator documentation in both repositories

**Goal:** Make future event operators aware of the actual runtime grammar and area ownership invariant before copying a staging package into production.

**Do not:** Do not add a new deployment tool, registry editor, schema generator, or automated installer.

**Files:**
- Modify in meirochou: `guides/event-addition.md`
- Modify in wrapper: `python/pathdata/README.md`

**Interfaces:**
- Consumes: Task 9.2 and 9.3 contract.
- Produces: human-facing canonical contract documentation only.

- [ ] **Step 1: Update `guides/event-addition.md` staging review**

Under the existing checks for `prefixes` / `labels`, explicitly add these rules:

```text
- prefixesの各値はcurrent runtimeで1文字として扱えるNFKC-stable BMP文字であること。
  `東` / `西` / `南`のような値はvalidだが、`東館`、full-width compatibility文字、emojiは不可。
- labelsの各値はcurrent runtime space grammarに一致するASCII英字・ひらがな・カタカナ1文字であること。
  numeric label、kanji label、full-width compatibility label、emojiは不可。
- 別area間で同じ prefix × label combination を所有しないこと。
```

Also add a failure/recovery note:

```text
新しいprefix形式やlabel文字種が必要ならgenerated artifactを手修正せず、runtime space grammar変更を別Taskとしてreviewする。
```

Keep the current wrapper→copy→registry merge→verify workflow unchanged.

- [ ] **Step 2: Update wrapper README contract paragraph**

After the `prefixes` / `allowed_symbols` event configuration explanation, add a short contract paragraph with the same three rules:

```text
prefixes: runtime-compatible one-character NFKC-stable BMP values
labels: derived allowed_symbols must match ASCII letter / hiragana / katakana one-character grammar
cross-area prefix×label ownership: must be disjoint
```

State that `build-event` rejects violations before publishing the staging tree.

- [ ] **Step 3: Run documentation-adjacent tests/checks**

In meirochou:

```bash
npx vitest run --root . \
  tests/webapp-contracts.test.mjs \
  tests/boundary-parsers.test.ts \
  tests/phase-08-data-only-event-addition.test.ts

git diff --check
```

In wrapper:

```bash
cd python/pathdata
.venv/bin/python -m unittest tests.test_event_build -v
cd ../..
git diff --check
```

Expected: PASS.

- [ ] **Step 4: Commit documentation separately in each repository**

meirochou:

```bash
git add guides/event-addition.md
git commit -m "docs(phase-08): document strict space metadata"
```

wrapper:

```bash
git add python/pathdata/README.md
git commit -m "docs(pathdata): document event space metadata"
```

---

### Task 9.5: Run full cross-repo verification and record implementation handoff

**Goal:** Prove the narrow contract fix is green, contains no runtime generalization, preserves C108/data-only proofs, and is ready for independent browser review.

**Do not:** Do not weaken retries, skip failing tests, update snapshots to hide behavioral changes, edit production event data, or mark Phase 8 accepted.

**Files:**
- Modify in meirochou after all verification passes: `docs/status/progress.md`
- No final status document required in wrapper unless an existing wrapper progress document already tracks this Task; do not invent one solely for Task 9.

**Interfaces:**
- Consumes: completed Task 9 code/docs in both repos.
- Produces: exact verification evidence and browser-review handoff.

- [ ] **Step 1: Run full meirochou verification**

From meirochou root:

```bash
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
npm run check:webapp:architecture
git diff --check
```

Expected: all PASS.

Do not add a new E2E spec for Task 9. This is a boundary-contract change with no intended browser interaction change.

- [ ] **Step 2: Run a strict no-retry E2E confirmation if canonical CI reports a retry/flaky**

Only if `npm run test:e2e:ci` reports a retry/flaky, run the exact failing spec/test once with retries disabled and classify it. Do not edit production code to satisfy an unrelated pre-existing flaky assertion.

For a Task 9 regression, fix the regression and rerun the full gate. For unrelated baseline flake, record exact evidence in progress and do not hide it.

- [ ] **Step 3: Run full wrapper verification**

From `meirochou_wrapper/python/pathdata`:

```bash
.venv/bin/python -m unittest tests.test_event_build -v
.venv/bin/python -m unittest tests.test_cli -v
.venv/bin/python -m unittest discover -s tests
.venv/bin/ruff check .
.venv/bin/python -m pyright
```

Then wrapper root:

```bash
git diff --check
```

Expected: all PASS.

- [ ] **Step 4: Verify exact changed-file scopes in meirochou**

```bash
git diff --name-status "$MEIROCHOU_TASK_START_SHA"..HEAD
```

Expected implementation files, in addition to pre-existing Task 9 planning docs:

```text
M apps/webapp/js/shared/domain/space-parser.ts
M apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts
M tests/space-parser.test.ts
M tests/boundary-parsers.test.ts
M guides/event-addition.md
M docs/status/progress.md
```

The following command must print nothing:

```bash
git diff --name-only "$MEIROCHOU_TASK_START_SHA"..HEAD -- \
  apps/webapp/js/app/browser-application.ts \
  apps/webapp/js/features/route-guidance \
  apps/webapp/events \
  apps/webapp/map-bundles \
  tests/fixtures/phase-08-data-only-event \
  package.json \
  package-lock.json \
  vite.config.ts \
  .github/workflows \
  integrations \
  functions
```

If any output appears, stop and classify it before continuing. Do not rationalize scope creep.

- [ ] **Step 5: Verify exact changed-file scope in wrapper**

```bash
git diff --name-status "$WRAPPER_TASK_START_SHA"..HEAD
```

Expected:

```text
M python/pathdata/comiket_pathdata/event_build.py
M python/pathdata/tests/test_event_build.py
M python/pathdata/README.md
```

The following command must print nothing:

```bash
git diff --name-only "$WRAPPER_TASK_START_SHA"..HEAD -- \
  python/ocr \
  python/pathdata/comiket_pathdata/svg_render.py \
  python/pathdata/comiket_pathdata/web_export.py \
  python/pathdata/comiket_pathdata/grid.py \
  python/pathdata/tests/test_svg_render.py \
  .github/workflows
```

- [ ] **Step 6: Verify C108 source bytes were not touched**

In meirochou:

```bash
git diff --name-only "$MEIROCHOU_TASK_START_SHA"..HEAD -- \
  apps/webapp/events/manifest.json \
  apps/webapp/map-bundles/C108
```

Expected: no output.

- [ ] **Step 7: Update `docs/status/progress.md` only with completed evidence**

At the top/current-state section, record:

```text
現在Task: Phase 8 Task 9 space metadata contract closure — implementation complete / browser review pending
次に着手するTask: Phase 8 browser acceptance / final closure decision
canonical Task 9 plan: docs/plans/phase-08/task-09-space-metadata-contract-closure.md
Task 9 design: docs/specs/2026-08-21-phase-08-task-09-space-metadata-contract-closure-design.md
```

Add a Task 9 verification/handoff section containing exact observed results for:

```text
meirochou focused RED/GREEN tests
npm run verify
npm run test:e2e:ci
public-tree audit
architecture check
diff check
changed-file/protected-path gate
C108 source-data diff gate
wrapper focused unittest
wrapper full unittest
Ruff
Pyright
wrapper diff/protected-path gate
both implementation branch names and final HEADs
```

Do not write `accepted`, `closed`, or `browser review complete`.

Preserve Task 8 and earlier historical evidence; do not rewrite old counts to match Task 9 counts.

- [ ] **Step 8: Commit final meirochou verification record**

```bash
git add docs/status/progress.md
git commit -m "docs(phase-08): record task 9 verification"
```

- [ ] **Step 9: Push both implementation branches**

meirochou:

```bash
git push origin docs/phase-08-task-09-space-metadata-contract-closure-plan
```

wrapper:

```bash
git push -u origin feature/phase-08-task-09-space-metadata-contract-closure
```

Do not merge either branch.

- [ ] **Step 10: Print final handoff evidence for browser review**

For meirochou:

```bash
printf 'MEIROCHOU_HEAD=%s\n' "$(git rev-parse HEAD)"
git log --oneline "$MEIROCHOU_TASK_START_SHA"..HEAD
git diff --name-status "$MEIROCHOU_TASK_START_SHA"..HEAD
```

For wrapper:

```bash
printf 'WRAPPER_HEAD=%s\n' "$(git rev-parse HEAD)"
git log --oneline "$WRAPPER_TASK_START_SHA"..HEAD
git diff --name-status "$WRAPPER_TASK_START_SHA"..HEAD
```

Report exact verification results. State explicitly:

```text
Phase 8 Task 9 implementation complete; browser review pending.
No main merge performed.
```

---

## Adversarial implementation checklist

Before calling Task 9 implementation complete, verify every item below.

1. `space-parser.ts` remains the grammar owner; event-day parser does not invent a different label regex.
2. Prefix validation rejects multi-character strings.
3. Prefix validation rejects NFKC-unstable compatibility characters.
4. Prefix validation rejects astral characters that JavaScript `[0]` would split.
5. Label validation rejects numeric labels.
6. Label validation rejects kanji labels.
7. Label validation rejects full-width compatibility letters.
8. Existing ASCII, hiragana, and katakana labels remain valid.
9. Existing C108 prefixes remain valid.
10. Strict parser rejects overlapping `prefix × label` ownership across different areas.
11. Same prefix with disjoint labels remains valid.
12. Same label with disjoint prefixes remains valid.
13. Legacy demo parser behavior is unchanged.
14. `BrowserApplication` is unchanged.
15. route-guidance area lookup is unchanged.
16. No production event registry or C108 bundle data changed.
17. Task 4 C999 data-only proof remains green without fixture edits.
18. Wrapper uses UTF-16 byte length parity, not Python code-point length alone.
19. Wrapper label regex matches the TypeScript runtime grammar exactly.
20. Wrapper checks cross-area ownership before publication.
21. Wrapper output shape is unchanged.
22. Wrapper deterministic/atomic/review-gate tests remain green.
23. No OCR/SVG/grid refactor was smuggled into the fix.
24. No schema package/code generator was introduced.
25. Operator guide tells users to stop and open a runtime-contract Task instead of hand-editing generated data for a new grammar.
26. Full meirochou verification passes.
27. Full wrapper verification passes.
28. Protected-path gates are empty.
29. Task 9 progress says browser review pending.
30. No main merge or Phase 8 closure claim is made.

## Browser review gate after implementation

Browser review must independently re-fetch both remote branches and inspect actual source rather than trusting the Codex summary.

Minimum browser review targets:

```text
meirochou:
- apps/webapp/js/shared/domain/space-parser.ts
- apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts
- tests/space-parser.test.ts
- tests/boundary-parsers.test.ts
- guides/event-addition.md
- docs/status/progress.md

meirochou_wrapper:
- python/pathdata/comiket_pathdata/event_build.py
- python/pathdata/tests/test_event_build.py
- python/pathdata/README.md
```

Browser reviewer must also compare each implementation branch against its fresh Task start/base and confirm no protected paths changed.

Only after that review returns ACCEPTED may a separate docs-only commit mark Phase 8 CLOSED.
