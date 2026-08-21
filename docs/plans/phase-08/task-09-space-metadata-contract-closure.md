# Phase 8 Task 9 Space Metadata Contract Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the production strict event-map contract and `meirochou_wrapper build-event` reject space metadata that the current webapp runtime cannot unambiguously interpret.

**Architecture:** Keep the runtime parser and area lookup unchanged. Make `space-parser.ts` the TypeScript grammar owner, enforce that grammar plus cross-area ownership uniqueness at the strict manifest boundary, and mirror the same small contract in the Python event builder before staging publication. Finish with operator documentation and full verification in both repositories.

**Tech Stack:** TypeScript, Vitest, Vite, Playwright, Python 3, `unittest`, Ruff, Pyright, Git/GitHub.

**Spec:** `docs/specs/2026-08-21-phase-08-task-09-space-metadata-contract-closure-design.md`

## Global Constraints

- Do not generalize runtime area matching to variable-length prefixes.
- Do not add numeric, kanji, emoji, or other new label grammar.
- Do not change `BrowserApplication` space lookup, route-guidance area lookup, routing algorithms, nearby/gallery behavior, or map rendering.
- Do not change production C108 registry data or map bundle bytes.
- Do not migrate the legacy demo map contract.
- Do not bump schema versions.
- Do not add JSON Schema, a schema code generator, shared npm/Python schema package, plugin system, DI container, migration framework, installer, or deployer.
- Parsed strict-manifest prefix contract: one non-whitespace, NFKC-stable JavaScript UTF-16 code unit.
- Parsed strict-manifest label contract: one NFKC-stable character matching `[A-Za-z\u3041-\u3096\u30A1-\u30FA]`.
- Every `(prefix, label)` pair belongs to at most one strict event-map area.
- `meirochou_wrapper` must reject the same invalid metadata before publishing its final output directory.
- Existing surrounding-whitespace trimming by `uniqueTextArray()` / `_unique_strings()` remains unchanged.
- Every committed implementation state must be green. RED tests are run in the worktree but are not committed while failing.
- Task 8 verification history remains historical evidence and must not be rewritten.
- Task 9 ends at `implementation complete / browser review pending`; do not mark Phase 8 CLOSED/ACCEPTED.
- No main merge is part of this plan.

---

## Repository setup

Planning-time observed heads:

```text
meirochou/main
75adaebd9b571d24aaee09d443dec17513baf10d

meirochou_wrapper/main
aa864f1ba80b87b63760248edc60b39a85d18d58
```

These are evidence only, not reset targets. At implementation start fetch both repositories and use the latest intended branches.

### `tiga-kk/meirochou`

```bash
git fetch origin
git switch docs/phase-08-task-09-space-metadata-contract-closure-plan
git pull --ff-only origin docs/phase-08-task-09-space-metadata-contract-closure-plan
export MEIROCHOU_TASK_START_SHA="$(git rev-parse HEAD)"
git status --short
git log -5 --oneline
```

Expected: clean worktree. If `origin/main` has advanced since planning, inspect the new commits before proceeding. Do not silently reset or force-update the planning branch.

### `tiga-kk/meirochou_wrapper`

Use a dedicated implementation branch from the current `origin/main`:

```bash
git fetch origin
```

If the Task 9 branch does not exist:

```bash
git switch --create feature/phase-08-task-09-space-metadata-contract-closure origin/main
```

If the same remote branch already exists and is confirmed to belong to this Task:

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

If the branch name exists with unrelated work, stop with `BLOCKED_WRAPPER_BRANCH_COLLISION`; do not overwrite or force-push it.

---

### Task 9.0: Capture fresh baselines

**Goal:** Prove the pre-change state is green in both repositories.

**Do not:** Do not edit files, snapshots, retries, dependencies, production data, or documentation in this subtask.

**Files:** Read only.

**Interfaces:**
- Consumes: current strict manifest parser, runtime space parser, wrapper event builder.
- Produces: baseline evidence only.

- [ ] **Step 1: Run focused meirochou baseline**

```bash
npx vitest run --root . \
  tests/space-parser.test.ts \
  tests/boundary-parsers.test.ts \
  tests/phase-08-data-only-event-addition.test.ts \
  tests/c108-map-assets.test.ts

npm run check:webapp:architecture
git diff --check
```

Expected: all PASS.

- [ ] **Step 2: Run focused wrapper baseline**

From `meirochou_wrapper/python/pathdata`:

```bash
.venv/bin/python -m unittest tests.test_event_build -v
.venv/bin/python -m unittest tests.test_svg_render -v
.venv/bin/ruff check .
.venv/bin/python -m pyright
```

Then from wrapper root:

```bash
git diff --check
```

Expected: all PASS.

- [ ] **Step 3: Record exact counts/output for final progress note**

Do not commit anything for Task 9.0.

---

### Task 9.1: Expose the current runtime character grammar from `space-parser.ts`

**Goal:** Give the strict manifest parser two tiny predicates backed by the existing runtime grammar instead of duplicating it elsewhere.

**Do not:** Do not change `canonicalizeSpace()`, `parseSpace()`, NFKC input normalization, side suffix rules, compatibility fallback, or any area lookup implementation.

**Files:**
- Modify: `apps/webapp/js/shared/domain/space-parser.ts`
- Modify: `tests/space-parser.test.ts`

**Interfaces:**
- Produces: `isRuntimeSpacePrefixCharacter(value: unknown): value is string`
- Produces: `isRuntimeSpaceLabelCharacter(value: unknown): value is string`

- [ ] **Step 1: Add failing tests**

Update the import in `tests/space-parser.test.ts`:

```ts
import {
  canonicalizeSpace,
  isRuntimeSpaceLabelCharacter,
  isRuntimeSpacePrefixCharacter,
  parseSpace,
} from "../apps/webapp/js/shared/domain/space-parser";
```

Add inside the existing `describe("space parser", ...)`:

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

- [ ] **Step 2: Run RED**

```bash
npx vitest run --root . tests/space-parser.test.ts
```

Expected: FAIL because the exports do not exist.

- [ ] **Step 3: Implement only the predicates**

Keep the existing label source:

```ts
const spaceLabel = "[A-Za-z\\u3041-\\u3096\\u30A1-\\u30FA]";
```

Immediately after it add:

```ts
const runtimeSpaceLabelPattern = new RegExp(`^${spaceLabel}$`, "u");
```

Add these exports:

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

These functions validate; they do not normalize or rewrite values.

- [ ] **Step 4: Run GREEN**

```bash
npx vitest run --root . tests/space-parser.test.ts
git diff --check
```

Expected: PASS.

- [ ] **Step 5: Commit a green intermediate state**

```bash
git add \
  apps/webapp/js/shared/domain/space-parser.ts \
  tests/space-parser.test.ts

git commit -m "refactor(phase-08): expose runtime space metadata contract"
```

---

### Task 9.2: Enforce the runtime grammar and unambiguous ownership at the strict manifest boundary

**Goal:** Make `parseEventMapBundleManifest()` reject metadata current runtime lookup cannot interpret, and reject two areas claiming the same `(prefix, label)` pair.

**Do not:** Do not change legacy `parseMapBundleManifest()`, route-guidance catalogs, `BrowserApplication`, C108 data, or Task 4 fixture data.

**Files:**
- Modify: `apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts`
- Modify: `tests/boundary-parsers.test.ts`
- Run unchanged: `tests/phase-08-data-only-event-addition.test.ts`
- Run unchanged: `tests/c108-map-assets.test.ts`

**Interfaces:**
- Consumes: `isRuntimeSpacePrefixCharacter`
- Consumes: `isRuntimeSpaceLabelCharacter`
- Produces: stricter behavior of existing `parseEventMapBundleManifest(input: unknown): EventMapBundleManifest`; no signature or schemaVersion change.

- [ ] **Step 1: Add runtime-grammar RED cases**

Add to `tests/boundary-parsers.test.ts`:

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

- [ ] **Step 2: Add an exact area fixture helper for ownership tests**

Near `genericEventMapManifest`, add:

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

- [ ] **Step 3: Add ownership RED plus positive non-overrestriction tests**

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

- [ ] **Step 4: Run RED**

```bash
npx vitest run --root . tests/boundary-parsers.test.ts
```

Expected: the new invalid grammar and ownership cases fail under the old parser.

- [ ] **Step 5: Import the grammar owner predicates**

Change the existing import to:

```ts
import {
  canonicalizeSpace,
  isRuntimeSpaceLabelCharacter,
  isRuntimeSpacePrefixCharacter,
} from "../../../shared/domain/space-parser";
```

- [ ] **Step 6: Add strict-only array validators**

Place next to `uniqueTextArray()`:

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

Do not modify `uniqueTextArray()` because legacy parsing also uses it.

- [ ] **Step 7: Use strict validators only in `parseEventMapBundleManifest()`**

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

- [ ] **Step 8: Add cross-area ownership validation**

Before the strict area loop add:

```ts
const seenSpaceAreaOwners = new Map<string, string>();
```

After `prefixes` and `labels` are parsed, add:

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

Do not use manifest order as conflict resolution.

- [ ] **Step 9: Run GREEN including unchanged production-shaped proofs**

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

- [ ] **Step 10: Confirm production event/map data is untouched**

```bash
git diff --name-only "$MEIROCHOU_TASK_START_SHA"..HEAD -- \
  apps/webapp/events \
  apps/webapp/map-bundles
```

Expected: no output.

- [ ] **Step 11: Commit a green strict-boundary fix**

```bash
git add \
  apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts \
  tests/boundary-parsers.test.ts

git commit -m "fix(phase-08): validate strict space metadata"
```

---

### Task 9.3: Mirror the same contract in `meirochou_wrapper`

**Goal:** Make `build-event` fail before final output publication whenever generated space metadata would be rejected or interpreted ambiguously by the production webapp.

**Do not:** Do not modify OCR, SVG/grid generation, `web_export.py`, publication topology, ID rules, or the `meirochou` repository from wrapper code.

**Files in `tiga-kk/meirochou_wrapper`:**
- Modify: `python/pathdata/comiket_pathdata/event_build.py`
- Modify: `python/pathdata/tests/test_event_build.py`

**Interfaces:**
- Consumes: `_unique_strings()`, `_allowed_symbols()`, `EventAreaBuildConfig`, `load_event_build_config()`, `build_event_bundle()`.
- Produces: stricter preflight only; staging tree shape remains unchanged.

- [ ] **Step 1: Add prefix grammar RED cases**

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

- [ ] **Step 2: Add label grammar RED cases**

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

Do not delete older whitespace-label coverage unless it becomes literally duplicate and adds no independent assertion.

- [ ] **Step 3: Replace `_add_second_area()` with an explicit parameterized helper**

Use this complete helper body so ownership tests do not depend on implicit fixture mutation:

```python
def _add_second_area(
    self,
    fixture: Path,
    *,
    prefixes: str = '["西"]',
    allowed_symbols: str = '["A", "B"]',
) -> None:
    shutil.copytree(fixture / "maps/internal-map", fixture / "maps/internal-map-2")
    shutil.copytree(fixture / "outputs/internal-map", fixture / "outputs/internal-map-2")

    second_map_config = fixture / "maps/internal-map-2/map.toml"
    second_map_config.write_text(
        second_map_config.read_text(encoding="utf-8").replace(
            'allowed_symbols = ["A", "B"]',
            f"allowed_symbols = {allowed_symbols}",
        ),
        encoding="utf-8",
    )

    event_path = fixture / "event.toml"
    event_path.write_text(
        event_path.read_text(encoding="utf-8")
        + "\n[[areas]]\n"
        + 'area_id = "west7"\n'
        + 'display_name = "West 7"\n'
        + "meters_per_pixel = 0.125\n"
        + f"prefixes = {prefixes}\n"
        + 'map_config = "maps/internal-map-2/map.toml"\n'
        + 'ocr_output_dir = "outputs/internal-map-2"\n',
        encoding="utf-8",
    )
```

The defaults preserve the existing atomic-publication test behavior.

- [ ] **Step 4: Add an ownership RED test that proves no final publication occurs**

```python
def test_build_event_bundle_rejects_ambiguous_space_area_ownership_before_publication(self):
    with tempfile.TemporaryDirectory() as temp_dir:
        fixture = self._write_fixture(Path(temp_dir))
        self._add_second_area(
            fixture,
            prefixes='["東"]',
            allowed_symbols='["B", "C"]',
        )
        output_dir = fixture / "dist/C999"

        with self.assertRaisesRegex(EventBuildError, "東B|ownership|east7|west7"):
            build_event_bundle(fixture / "event.toml", output_dir)

        self.assertFalse(output_dir.exists())
        self.assertEqual(
            list(output_dir.parent.glob(f".{output_dir.name}.tmp-*")),
            [],
        )
```

This is the authoritative negative ownership test. It must prove the final directory and staging temp directories are absent after failure.

- [ ] **Step 5: Add positive non-overrestriction ownership tests**

```python
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

- [ ] **Step 6: Run RED without committing it**

From `python/pathdata`:

```bash
.venv/bin/python -m unittest tests.test_event_build -v
```

Expected: new grammar/ownership cases fail. Keep the failing tests uncommitted until GREEN.

- [ ] **Step 7: Add exact cross-language runtime validation helpers**

In `event_build.py`, add:

```python
import unicodedata
```

Near existing regex constants:

```python
SPACE_LABEL_RE = re.compile(r"^[A-Za-z\u3041-\u3096\u30A1-\u30FA]$")
```

Add after `_unique_strings()`:

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

Do not use `len(value) == 1` as the sole prefix width rule; Python code-point length would accept astral characters that JavaScript `[0]` splits.

- [ ] **Step 8: Apply the prefix validator**

In `_load_area()` replace:

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

- [ ] **Step 9: Apply the exact label predicate**

In `_allowed_symbols()`, keep the existing list/duplicate handling, but use this validation inside the loop:

```python
for symbol in raw_symbols:
    if not isinstance(symbol, str) or not _is_runtime_space_label(symbol):
        raise EventBuildError(
            f"{map_path} [identifiers].allowed_symbols must contain runtime space label characters"
        )
    if symbol in symbols:
        raise EventBuildError(
            f"{map_path} [identifiers].allowed_symbols must not duplicate"
        )
    symbols.append(symbol)
```

Do not normalize an invalid symbol into another accepted symbol.

- [ ] **Step 10: Add and call one area-ownership validator**

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

In `load_event_build_config()`, after all `areas` have been parsed and duplicate `area_id` checks have completed, call:

```python
_validate_space_area_ownership(areas)
```

Then return the existing `EventBuildConfig` unchanged.

Because `build_event_bundle()` loads config before final output publication, the negative build test from Step 4 must now fail before creating final/staging output.

- [ ] **Step 11: Run GREEN and static checks**

```bash
cd python/pathdata
.venv/bin/python -m unittest tests.test_event_build -v
.venv/bin/python -m unittest tests.test_cli -v
.venv/bin/ruff check .
.venv/bin/python -m pyright
```

Expected: PASS.

- [ ] **Step 12: Confirm protected wrapper files remain untouched**

From wrapper root:

```bash
git diff --name-only "$WRAPPER_TASK_START_SHA" -- \
  python/ocr \
  python/pathdata/comiket_pathdata/svg_render.py \
  python/pathdata/comiket_pathdata/web_export.py \
  python/pathdata/comiket_pathdata/grid.py \
  .github/workflows
```

Expected: no output.

- [ ] **Step 13: Commit only after GREEN**

```bash
git add \
  python/pathdata/comiket_pathdata/event_build.py \
  python/pathdata/tests/test_event_build.py

git commit -m "fix(pathdata): align event space metadata validation"
```

---

### Task 9.4: Update operator documentation in both repositories

**Goal:** Make future event additions fail during review rather than discovering grammar/ownership defects after production copy.

**Do not:** Do not add scripts or automation beyond the existing operator flow.

**Files:**
- Modify in meirochou: `guides/event-addition.md`
- Modify in wrapper: `python/pathdata/README.md`

**Interfaces:** Documentation only.

- [ ] **Step 1: Update meirochou staging-review rules**

Under the existing `prefixes` / `labels` checks, add these exact semantics in natural Japanese:

```text
- prefixesの各値はcurrent runtimeで1文字として扱えるNFKC-stable BMP文字。
  東 / 西 / 南のような値はvalid。東館、full-width compatibility文字、emojiはinvalid。
- labelsの各値はcurrent runtime grammarに一致するASCII英字・ひらがな・カタカナ1文字。
  numeric label、kanji label、full-width compatibility label、emojiはinvalid。
- 別area間で同じ prefix × label combination を所有しない。
```

Add one recovery rule:

```text
新しいprefix形式やlabel文字種が必要な場合はgenerated artifactを手修正せず、runtime space grammar変更を別Taskとしてreviewする。
```

Keep the existing wrapper→copy→registry merge→verify/deploy workflow unchanged.

- [ ] **Step 2: Update wrapper README**

After the event config explanation, add a short paragraph stating:

```text
prefixes: runtime-compatible one-character NFKC-stable BMP values
labels: derived allowed_symbols must match ASCII letter / hiragana / katakana one-character grammar
cross-area prefix×label ownership: disjoint
build-event rejects violations before publication
```

- [ ] **Step 3: Run documentation-adjacent checks**

meirochou:

```bash
npx vitest run --root . \
  tests/webapp-contracts.test.mjs \
  tests/boundary-parsers.test.ts \
  tests/phase-08-data-only-event-addition.test.ts

git diff --check
```

wrapper:

```bash
cd python/pathdata
.venv/bin/python -m unittest tests.test_event_build -v
cd ../..
git diff --check
```

Expected: PASS.

- [ ] **Step 4: Commit docs separately**

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

### Task 9.5: Full cross-repo verification and implementation handoff

**Goal:** Prove Task 9 is narrow, green, production-data preserving, and ready for independent browser review.

**Do not:** Do not relax test assertions/retries, update snapshots to hide changes, touch production event data, merge main, or declare Phase 8 accepted.

**Files:**
- Modify after verification: `docs/status/progress.md`

**Interfaces:** Produces exact verification evidence only.

- [ ] **Step 1: Run full meirochou verification**

```bash
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
npm run check:webapp:architecture
git diff --check
```

Expected: all PASS.

Task 9 intentionally adds no new browser interaction E2E because runtime interaction behavior is unchanged.

- [ ] **Step 2: Classify any E2E retry/flaky rather than hiding it**

If canonical E2E reports a retry/flaky, rerun the exact failing test once with retries disabled. If it is Task-9-caused, fix the regression and rerun all gates. If it is unrelated baseline flake, record exact evidence; do not weaken the test or change unrelated production code.

- [ ] **Step 3: Run full wrapper verification**

From wrapper `python/pathdata`:

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

- [ ] **Step 4: Verify meirochou changed-file scope**

```bash
git diff --name-status "$MEIROCHOU_TASK_START_SHA"..HEAD
```

Expected implementation files:

```text
M apps/webapp/js/shared/domain/space-parser.ts
M apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts
M tests/space-parser.test.ts
M tests/boundary-parsers.test.ts
M guides/event-addition.md
```

`docs/status/progress.md` is added to this list only after Step 7.

The following must print nothing:

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

- [ ] **Step 5: Verify wrapper changed-file scope**

```bash
git diff --name-status "$WRAPPER_TASK_START_SHA"..HEAD
```

Expected:

```text
M python/pathdata/comiket_pathdata/event_build.py
M python/pathdata/tests/test_event_build.py
M python/pathdata/README.md
```

The following must print nothing:

```bash
git diff --name-only "$WRAPPER_TASK_START_SHA"..HEAD -- \
  python/ocr \
  python/pathdata/comiket_pathdata/svg_render.py \
  python/pathdata/comiket_pathdata/web_export.py \
  python/pathdata/comiket_pathdata/grid.py \
  python/pathdata/tests/test_svg_render.py \
  .github/workflows
```

- [ ] **Step 6: Prove C108 source data is byte-scope untouched**

```bash
git diff --name-only "$MEIROCHOU_TASK_START_SHA"..HEAD -- \
  apps/webapp/events/manifest.json \
  apps/webapp/map-bundles/C108
```

Expected: no output.

- [ ] **Step 7: Update `docs/status/progress.md` with actual results only**

Set current state to:

```text
現在Task: Phase 8 Task 9 space metadata contract closure — implementation complete / browser review pending
次に着手するTask: Phase 8 browser acceptance / final closure decision
canonical Task 9 plan: docs/plans/phase-08/task-09-space-metadata-contract-closure.md
Task 9 design: docs/specs/2026-08-21-phase-08-task-09-space-metadata-contract-closure-design.md
```

Add a Task 9 verification/handoff section containing exact observed results for:

```text
meirochou focused RED/GREEN
npm run verify
npm run test:e2e:ci
public-tree audit
architecture check
diff check
meirochou changed-file/protected-path gate
C108 source-data diff gate
wrapper focused event-build tests
wrapper full unittest suite
Ruff
Pyright
wrapper changed-file/protected-path gate
both implementation branch names and final HEADs
```

Preserve all Task 8 and earlier historical evidence. Do not write `accepted`, `closed`, or `browser review complete`.

- [ ] **Step 8: Commit the green verification record**

```bash
git add docs/status/progress.md
git commit -m "docs(phase-08): record task 9 verification"
```

- [ ] **Step 9: Re-run meirochou diff/static checks after progress edit**

```bash
git diff --check
npm run check:webapp:architecture
```

Expected: PASS.

- [ ] **Step 10: Push both branches**

meirochou:

```bash
git push origin docs/phase-08-task-09-space-metadata-contract-closure-plan
```

wrapper:

```bash
git push -u origin feature/phase-08-task-09-space-metadata-contract-closure
```

Do not merge either branch.

- [ ] **Step 11: Print exact final handoff**

meirochou:

```bash
printf 'MEIROCHOU_HEAD=%s\n' "$(git rev-parse HEAD)"
git log --oneline "$MEIROCHOU_TASK_START_SHA"..HEAD
git diff --name-status "$MEIROCHOU_TASK_START_SHA"..HEAD
```

wrapper:

```bash
printf 'WRAPPER_HEAD=%s\n' "$(git rev-parse HEAD)"
git log --oneline "$WRAPPER_TASK_START_SHA"..HEAD
git diff --name-status "$WRAPPER_TASK_START_SHA"..HEAD
```

Final message must say:

```text
Phase 8 Task 9 implementation complete; browser review pending.
No main merge performed.
```

---

## Adversarial completion checklist

1. `space-parser.ts` remains the TypeScript grammar owner.
2. Prefix validation rejects multi-character strings.
3. Prefix validation rejects NFKC-unstable compatibility characters.
4. Prefix validation rejects astral characters that JavaScript `[0]` splits.
5. Label validation rejects numeric labels.
6. Label validation rejects kanji labels.
7. Label validation rejects full-width compatibility letters.
8. Existing ASCII, hiragana, and katakana labels remain valid.
9. Existing C108 prefixes remain valid.
10. Strict parser rejects overlapping `prefix × label` ownership across areas.
11. Same prefix with disjoint labels remains valid.
12. Same label with disjoint prefixes remains valid.
13. Legacy demo parser behavior is unchanged.
14. `BrowserApplication` is unchanged.
15. route-guidance area lookup is unchanged.
16. Production event registry and C108 bundle source data are unchanged.
17. Task 4 C999 data-only proof remains green without fixture edits.
18. Wrapper mirrors JavaScript UTF-16 width rather than Python code-point length alone.
19. Wrapper label regex matches the current TypeScript runtime grammar.
20. Wrapper ambiguous ownership test proves no final or temporary publication remains.
21. Wrapper output shape is unchanged.
22. Existing wrapper deterministic, review-gate, and atomic-publication tests remain green.
23. No OCR/SVG/grid refactor is included.
24. No schema/code-generation framework is introduced.
25. Operator docs instruct a separate runtime-contract Task for future grammar expansion.
26. Full meirochou verification passes.
27. Full wrapper verification passes.
28. Protected-path gates are empty.
29. Every implementation commit is green.
30. Task 9 progress says browser review pending and no Phase 8 closure claim is made.

## Browser review gate

After Codex pushes both branches, browser review must independently fetch actual remote source and compare against fresh Task start/base states. At minimum inspect:

```text
meirochou
- apps/webapp/js/shared/domain/space-parser.ts
- apps/webapp/js/features/event-day/infrastructure/application-boundary-parsers.ts
- tests/space-parser.test.ts
- tests/boundary-parsers.test.ts
- guides/event-addition.md
- docs/status/progress.md

meirochou_wrapper
- python/pathdata/comiket_pathdata/event_build.py
- python/pathdata/tests/test_event_build.py
- python/pathdata/README.md
```

Only a subsequent browser verdict of ACCEPTED permits a separate docs-only commit to mark Phase 8 CLOSED.
