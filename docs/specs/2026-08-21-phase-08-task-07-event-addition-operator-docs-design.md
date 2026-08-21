# Phase 8 Task 7: Event Addition / Operator Workflow Design

## Goal

Phase 8 Task 1〜6で確立したevent-generic contractとwrapper build pipelineを、次回以降のイベント追加で人間またはagentが再現可能な運用手順として閉じる。

Task 7は実イベントC109等をproductionへ追加するTaskではない。将来のイベント追加を **wrapperでstaging package生成 → meirochouへdata-only導入 → automated verification → local/manual smoke → main merge / Cloudflare deploy** の一筆書きで実行できる状態にする。

同時に、Phase 8のgeneric化後も残っているproduction-event追加を阻害するhistorical verification hardcodeだけを、Task 7冒頭で最小修正する。

## Verified starting state

Task 7設計時点で、current Phase 8 Task 6 branchを直接確認した。

### Task 6

Task 6 implementationは次の設計を満たしている。

- `user-guide-dialog`を再利用し、新規wizard / onboarding subsystemを追加していない。
- app-level markerは `meirochou.first-use-guide-seen = "1"` の1値だけ。
- normal runtimeでmarkerがないときだけguideを自動表示する。
- auto-open直後にmarkerを保存し、reload後は自動表示しない。
- `?demo_ui=1`ではauto-openもmarker writeもしない。
- manual `使い方` buttonは常時利用可能。
- storage read failureはseen扱い、write failureはswallowし、startupを阻害しない。

production上のTask 7 blockerになるTask 6不備は確認できなかった。

Task 6計画書にはfocused Playwrightを `--project=chromium` で実行する記述があったが、current `playwright.config.ts`では`webapp.spec.ts`等の一般mobile E2Eは`mobile-chromium` projectであり、`chromium` projectは限定された4 specだけを`testMatch`する。Task 6実行時もこの差が記録されている。

Task 7ではhistorical Task 6 planを書き換えず、運用手順ではproject名を推測せず、正本のfull regression command `npm run test:e2e:ci`を使う。focused Playwright commandを記載する必要がある場合はcurrent configを再確認してから書く。

### Wrapper event build pipeline

`tiga-kk/meirochou_wrapper/python/pathdata/README.md`はcurrent `main`でTask 3の`build-event`を既に説明している。

Canonical command:

```bash
cd /path/to/meirochou_wrapper/python/pathdata
PYTHONPATH=. .venv/bin/python -m comiket_pathdata \
  build-event /path/to/event.toml \
  --output-dir /path/to/dist/C109
```

Output staging package:

```text
/path/to/dist/C109/
  event-registry-entry.json
  map-bundle/
    manifest.json
    <areaId>/
      map.svg
      points.json
      grid-meta.json
      grid.bin
```

Important existing properties:

- unresolved `review_needed.json`があればevent buildはpublish前に失敗する。
- `area_id`はweb-facing ID、OCR/pathdata internal `map_id`とは別概念でよい。
- `labels`はreviewed map configの`allowed_symbols`から導出される。
- published `points.json`からlocal `image.path`は除去される。
- generated `event-registry-entry.json`は`mapBundleContract: "event"`を明示する。
- wrapperは`meirochou` production treeを直接編集しない。

Task 7はwrapper generatorを再実装しない。wrapper repoへ新しいinstaller/deployerを追加しない。

### meirochou runtime / build behavior

Phase 8 Task 1〜4により、application runtimeはsecond strict eventをapplication TypeScript変更なしで消費できる。

Future event additionのexpected application data diffは原則:

```text
M apps/webapp/events/manifest.json
A apps/webapp/map-bundles/<EVENT_ID>/manifest.json
A apps/webapp/map-bundles/<EVENT_ID>/<areaId>/map.svg
A apps/webapp/map-bundles/<EVENT_ID>/<areaId>/points.json
A apps/webapp/map-bundles/<EVENT_ID>/<areaId>/grid-meta.json
A apps/webapp/map-bundles/<EVENT_ID>/<areaId>/grid.bin
```

`apps/webapp/js/**`変更は不要であるべき。

Vite normal buildはregistry登録の有無とは別に`apps/webapp/map-bundles/`配下の全bundle directoryをpublic artifactへ含める。そのため、未登録の試験bundleや古いstaging directoryをproduction treeへ置いてはいけない。

### Residual generic-event blocker found during Task 7 design

`scripts/verify-webapp-build.mjs`にhistorical Phase 5B hardcodeが残っている。

Current code:

```js
const registryEventIds = sourceRegistry.events.map((event) => event?.eventId);
assert.deepEqual(
  registryEventIds,
  ["C108"],
  "Phase 5B event registry must contain only C108",
);
```

したがってfuture C109等を正しくregistryへ追加しても`npm run verify`が必ず失敗する。

`tests/deployment-build.test.mjs`も現在この挙動を正として、second published eventをrejectするtestを持つ。

`tests/event-registry.test.ts`もproduction registry event ID listをexactly `["C108"]`とassertしている。

これらはPhase 8 generic runtimeの意図と矛盾するため、Task 7のone-time corrective implementationとして最小修正する。

C108固有の回帰保証そのものは削除しない。

具体的には次を維持する。

- C108がproduction registryに存在する限り、そのday1/day2 contractを検査する。
- `scripts/verify-webapp-build.mjs`のC108 17-file exact regressionは維持する。
- C108 built asset explicit checksは維持する。
- legacy root area directories `e456/e7/s12/w12`をpublishしないcheckは維持する。
- `demo-v1`をproduction registryへ入れないtestは維持する。

削除するのは「production registryがC108一件だけでなければならない」という制限だけ。

## Chosen architecture

Task 7を3つのdeliverableに限定する。

### 1. Generic build verification correction

Modify:

```text
scripts/verify-webapp-build.mjs
tests/deployment-build.test.mjs
tests/event-registry.test.ts
```

`verify-webapp-build.mjs`からexact `["C108"]` assertionを削除する。

代わりにbuild verifier自身の最低限のgeneric invariantsを維持する。

- source registry schemaVersionは1。
- `events`はarray。
- registered eventはnon-empty string `eventId`を持つ。
- registered event IDsは重複しない。
- `mapBundle`はnon-empty stringかつ`../maps/`配下。
- referenced source/built manifestが存在する。
- referenced source map manifestの`eventId`はregistry eventIdと一致する。
- all public bundle directoriesはsource/builtでbyte-identical。

Domain parserの完全な再実装はしない。event/day ID regex、date、displayName、day uniqueness等はexisting `parseEventRegistry()`の責務であり、そのproduction testを維持する。

`tests/deployment-build.test.mjs`ではcurrent negative test

```text
rejects a second published event
```

を、real second source/output bundleをfixtureへ追加したpositive testへ置き換える。

Second event fixture IDは`other-v1`とする。registry entryの`mapBundle`は`../maps/other-v1/manifest.json`、source/output manifest `eventId`も`other-v1`にする。

Expected successful result:

```js
result.eventIds === ["C108", "other-v1", "public-v1"]
result.verifiedFiles === 39
```

Current verifierに対してこのtestはまず

```text
Phase 5B event registry must contain only C108
```

でREDになることをTDD proofとする。

`tests/event-registry.test.ts`のproduction exact-list assertionは、C108 regressionとgeneric production constraintへ変更する。

Expected semantics:

- parsed production registryにC108が存在する。
- C108 day IDsは`day1`, `day2`のまま。
- production registryは少なくとも1 eventを持つ。
- production entriesは`mapBundleContract: "legacy"`ではない。
- `demo-v1` exclusionは既存testを維持する。
- additional strict production eventの存在を禁止しない。

### 2. Canonical event-addition operator guide

Create:

```text
guides/event-addition.md
```

Update:

```text
README.md
tests/webapp-contracts.test.mjs
```

`guides/event-addition.md`をfuture event追加のmeirochou-side canonical operator guideとする。

Wrapper-side generator detailsの正本は引き続き:

```text
tiga-kk/meirochou_wrapper/python/pathdata/README.md
```

Task 7 guideはそのcommand/output contractを必要な範囲で引用・再掲するが、OCR/map生成の内部アルゴリズムを複製しない。

Guide must cover:

1. repository roles。
2. prerequisite: reviewed pathdata/map config and no unresolved review files。
3. `event.toml`準備。
4. wrapper `build-event` command。
5. staging package review。
6. staging `map-bundle/`を`apps/webapp/map-bundles/<EVENT_ID>/`へコピーするexact topology。
7. `event-registry-entry.json`のobjectを`apps/webapp/events/manifest.json.events`へmergeする方法。
8. staging `event-registry-entry.json`自体をpublic treeへコピーしないこと。
9. generated map assetsをmeirochou側で手修正せず、問題があればwrapper inputを直してregenerateすること。
10. expected data-only diff。
11. no `apps/webapp/js/**` changes。
12. Viteがunregistered public bundle directoryもpublishするため、stale/fake directoryを置かないこと。
13. automated verification commands。
14. local/manual production-registry smoke。
15. main merge / Cloudflare Pages deploy flow。
16. rollback / recovery。
17. common failure diagnosis。

Recommended staging integration command for a *new* event:

```bash
export EVENT_ID=C109
export STAGING=/absolute/path/to/dist/C109

test -f "$STAGING/event-registry-entry.json"
test -f "$STAGING/map-bundle/manifest.json"
test ! -e "apps/webapp/map-bundles/$EVENT_ID"

mkdir -p "apps/webapp/map-bundles/$EVENT_ID"
cp -R "$STAGING/map-bundle/." "apps/webapp/map-bundles/$EVENT_ID/"

test -f "apps/webapp/map-bundles/$EVENT_ID/manifest.json"
```

The guide must explicitly state that replacement/update of an existing event is a different operation. Do not recommend blindly `rm -rf`/overwrite an existing production bundle.

Registry integration remains explicit/manual review instead of a new mutation script. Operator copies the single JSON object from staging `event-registry-entry.json` into the production `events` array, checks commas/order, then runs parser/tests.

This is deliberate: Task 7 does not introduce a deployment/install CLI whose mutation/rollback contract would itself need maintenance.

### 3. Verification and Phase 8 handoff

Task 7 changes one build verifier plus tests/docs only. It does not add a real production event.

Focused verification:

```bash
npx vitest run --root . \
  tests/deployment-build.test.mjs \
  tests/event-registry.test.ts \
  tests/webapp-contracts.test.mjs \
  tests/map-bundle-selection.test.ts \
  tests/phase-08-data-only-event-addition.test.ts
```

Full Phase 8 closure candidate verification:

```bash
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
git diff --check
```

Full E2E is intentionally included even though Task 7 production browser code is unchanged, because Task 7 is the final Phase 8 handoff and should leave a current whole-app regression baseline.

Do not use `--project=chromium` as a generic focused E2E command. Current Playwright config routes only selected desktop specs to that project; the canonical full command is `npm run test:e2e:ci`.

## Operator guide verification contract

Add one compact docs contract test in `tests/webapp-contracts.test.mjs`.

The test should read `guides/event-addition.md` and assert presence of at least:

```text
meirochou_wrapper
build-event
event-registry-entry.json
map-bundle
apps/webapp/events/manifest.json
apps/webapp/map-bundles
npm run verify
npm run test:e2e:ci
Cloudflare Pages
```

It should also assert that the guide does not instruct the operator to modify `apps/webapp/js` for a normal event addition, and does not contain real secret/token patterns.

Do not attempt to parse all shell commands from Markdown or create a documentation DSL.

## Future event addition acceptance checklist

A future real event addition is considered data-only when its implementation diff, excluding unrelated docs, is limited to:

```text
M apps/webapp/events/manifest.json
A/M apps/webapp/map-bundles/<EVENT_ID>/**
```

If adding a new event requires changing:

```text
apps/webapp/js/**
scripts/verify-webapp-build.mjs
vite.config.ts
package.json
.github/workflows/**
```

stop and treat that as a new architectural defect/task rather than normal operator work.

For a newly generated event, expected per-area published files are exactly:

```text
map.svg
points.json
grid-meta.json
grid.bin
```

The strict manifest must reference them as:

```text
./<areaId>/map.svg
./<areaId>/points.json
./<areaId>/grid-meta.json
./<areaId>/grid.bin
```

`points.json.image.path` must not be present in the published bundle.

## Local/manual smoke for future real event

After automated verification and before merge, run a normal production-registry local server/build without `?demo_ui=1`.

Minimum human checks:

- new event appears in management/event-day UI with the intended display name/days。
- switching to the new event loads its strict map bundle without map-bootstrap error。
- area/current-location controls are populated from its manifest `prefixes` / `labels` rather than C108 constants。
- at least one reviewed circle space from each materially different area can be represented by the location controls/map data。
- existing C108 remains selectable and still loads。

If route data for the new event is already available, perform one short route-start smoke using a known reviewed circle. Do not fabricate event spaces solely to satisfy this checklist.

## Deployment

Keep existing `guides/cloudflare-pages-deployment.md` as the deployment authority.

Task 7 operator guide links to it and summarizes only:

- merge to `main` after code/data review and required verification。
- Cloudflare Pages production deployment follows `main`。
- verify GitHub Actions and Cloudflare production deployment status。
- perform production smoke for the newly added event and C108 regression。
- rollback to a previously healthy Cloudflare deployment / revert data commit if needed。

No Cloudflare API token, account ID, zone ID, private path, or deployment credential is added to the guide.

## Common failure classification

The guide should make recovery explicit:

### wrapper `build-event` stops on review files

Cause: unresolved pathdata/OCR review artifacts.

Action: return to wrapper review workflow. Do not bypass/hand-edit final web bundle.

### `source map manifest for event <ID> is missing`

Cause: registry entry was merged before correct `map-bundle/` copy, or copy topology is wrong.

Action: inspect `apps/webapp/map-bundles/<EVENT_ID>/manifest.json`; do not change runtime code.

### `registry eventId does not match source map manifest`

Cause: wrong staging package/event ID was copied or registry object was edited inconsistently.

Action: compare generated registry entry and generated map manifest; regenerate/copy consistently.

### build output contains an unintended bundle

Cause: stale/test directory exists under `apps/webapp/map-bundles/`.

Action: determine whether it is intentional production data. Remove it from the production source tree if not; do not hide it by changing the verifier.

### new event needs application TypeScript change

Cause: Phase 8 data-only contract is not actually covering the new case.

Action: stop normal event-addition workflow and open a separate implementation task. Do not add event-ID branches as an operator workaround.

## Non-goals

- Adding C109 or any other real event to production.
- Running OCR or reviewing map extraction in meirochou.
- Rewriting wrapper Task 3 generator.
- Adding an installer/deployer CLI.
- Auto-editing production registry.
- Moving event registry to a backend/database.
- Adding schemaVersion 2.
- Removing C108-specific regression coverage.
- Genericizing intentionally C108-specific benchmarks.
- Changing runtime application TypeScript.
- Changing route/ALNS/grid/points semantics.
- Changing onboarding behavior.
- Modifying Cloudflare configuration or credentials.

## Expected Task 7 implementation scope

Production/tooling:

```text
M scripts/verify-webapp-build.mjs
```

Tests:

```text
M tests/deployment-build.test.mjs
M tests/event-registry.test.ts
M tests/webapp-contracts.test.mjs
```

Docs:

```text
A guides/event-addition.md
M README.md
M docs/status/progress.md
```

No `apps/webapp/js/**`, production registry, production map bundle, Vite, package, workflow, integration, or wrapper repo change is expected.

## Acceptance

Task 7 implementation can move to browser review only when all are true:

1. synthetic second registered event makes the old verifier fail first, proving the historical blocker。
2. generic verifier accepts C108 + second registered event + unregistered public fixture while preserving byte-identical bundle checks。
3. missing/wrong/escaping asset negative tests remain green。
4. production registry test no longer forbids additional strict events, while retaining C108 day and demo exclusion regressions。
5. no real second production event is added。
6. `guides/event-addition.md` provides the complete wrapper→staging→meirochou→verification→deploy workflow。
7. guide warns that every directory under production `map-bundles` is publishable。
8. guide makes generated artifacts regenerate-not-patch。
9. guide states normal event addition is data-only and gives exact expected diff boundaries。
10. guide links to wrapper pathdata README and Cloudflare deployment guide rather than duplicating them wholesale。
11. Task 6 Playwright project-name mismatch is not propagated; canonical E2E command is correct。
12. focused tests pass。
13. `npm run verify` passes。
14. `npm run test:e2e:ci` passes or any pre-existing/environmental failure is demonstrated against the Task start SHA rather than hidden。
15. architecture/public-tree/diff hygiene gates pass。
16. no application TypeScript changes。
17. progress records Task 7 implementation complete / browser review pending, not Phase 8 CLOSED before browser acceptance。
