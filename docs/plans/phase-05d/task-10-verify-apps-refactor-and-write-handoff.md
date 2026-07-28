# Phase 5D Task 10: Verify Apps Refactor and Write Handoff

**Status:** PLANNED
**Depends on:** Tasks 1-9
**Commit candidate:** `docs(phase-5d): verify apps internal refactor`

## Goal

clean environmentでapps architecture、naming、unit/integration、desktop/mobile操作、C108実地図を検証し、Phase 5Dの完了可否とPhase 5Eが利用するpublic APIsをhandoffへ記録する。本Taskではproduction featureを追加しない。

## Files

### Create

- `docs/reviews/phase-05d-handoff.md`

### Modify

- `docs/plans/phase-05d/README.md`
- `docs/plans/phase-05d/task-01-lock-current-behavior-and-architecture-rules.md`
- `docs/plans/phase-05d/task-02-separate-browser-startup-and-dependency-assembly.md`
- `docs/plans/phase-05d/task-03-centralize-active-event-day-state.md`
- `docs/plans/phase-05d/task-04-extract-circle-status-and-gas-update-queue.md`
- `docs/plans/phase-05d/task-05-extract-route-guidance.md`
- `docs/plans/phase-05d/task-06-extract-circle-data-source-workflows.md`
- `docs/plans/phase-05d/task-07-extract-event-day-switching-and-local-data-deletion.md`
- `docs/plans/phase-05d/task-08-split-feature-specific-dom-views.md`
- `docs/plans/phase-05d/task-09-remove-legacy-app-data-ui-and-central-types.md`
- `docs/status/progress.md`
- `docs/README.md`
- `docs/plans/roadmap.md`

### Forbidden

- production behavior変更
- visual polish
- dependency追加
- failed testのskip化
- 理由のないsnapshot更新
- `tests/`または`docs/`の全面再配置

## Verification procedure

- [ ] **Step 1: branch、worktree、Task commitを確認する**

```bash
git status --short --branch
git log --oneline --decorate -20
git diff main...HEAD --stat
git diff main...HEAD -- apps/webapp/js package.json scripts tests docs
```

Task外差分、credential、private map source、untracked production fileがある場合は停止する。

- [ ] **Step 2: clean installを実行する**

```bash
rm -rf node_modules
npm ci
```

- [ ] **Step 3: architectureとnamingを検証する**

```bash
node scripts/check-webapp-architecture.mjs
npx vitest run --root . tests/architecture-boundaries.test.mjs \
  tests/legacy-app-files-removed.test.mjs \
  tests/comipath-application-responsibility.test.mjs
npx biome check
npm run check:webapp
git diff --check
```

- [ ] **Step 4: unit/integration/build/GASを検証する**

```bash
npm run test:webapp
npm run build:webapp
npm run verify:webapp:build
npm run verify:gas
```

- [ ] **Step 5: full E2Eを検証する**

```bash
npm run test:e2e
```

desktop、mobile、keyboard、resume、source import、pending GAS updates、event/day switch、local data deletionについてskip増加がないことを確認する。

- [ ] **Step 6: C108 smokeを検証する**

```bash
RUN_C108_SMOKE=1 npx playwright test \
  tests/c108-map-browser-smoke.spec.ts \
  --project=chromium --project=mobile-chromium
```

4 map areas × desktop/mobileを確認する。

- [ ] **Step 7: public boundaryを検証する**

```bash
node scripts/audit-public-tree.mjs
git ls-files
```

raw CSV、GAS URL、sheet内容、external post body、map source、credentialがartifact/public treeへ混入していないことを確認する。

- [ ] **Step 8: legacy absenceとline countを監査する**

```bash
test ! -e apps/webapp/js/app.js
test ! -e apps/webapp/js/data-manager.ts
test ! -e apps/webapp/js/ui-manager.js
test ! -e apps/webapp/js/config.ts
test ! -e apps/webapp/js/types/domain.ts
test ! -e apps/webapp/js/types/boundary-parsers.ts
test ! -e scripts/webapp-architecture-legacy-allowlist.json
wc -l apps/webapp/js/app/comipath-application.ts
rg 'app\.js|data-manager|ui-manager|types/domain|boundary-parsers|config\.(js|ts)' \
  apps/webapp/js tests scripts
rg '\b(Manager|Handler|Helper|Utils|Common)\b' apps/webapp/js
find apps/webapp/js/features -name index.ts -print
```

expected:

- all `test ! -e` succeed
- application file <= 200 physical lines
- deleted import search has no results
- vague new production names have no results
- feature `index.ts` has no results

- [ ] **Step 9: feature boundaryをhuman reviewする**

各featureについてhandoffへ次を記録する。

- public API file
- Controller
- Use Cases
- Domain owner
- external dependency interfaces
- concrete implementations
- mutable state owner
- start/stop owner
- cross-feature collaborators
- existing contract tests

cross-feature deep import、sharedへのfeature rule leakage、assembly file外のconcrete wiringがないことを確認する。

- [ ] **Step 10: user flowをhuman smokeで確認する**

架空fixtureまたはapproved C108 environmentで次を確認する。

1. initial event/day open
2. CSV preview・apply・cancel
3. Google Sheet sheet list・preview
4. current locationからroute guidance start
5. destination select・route comparison・confirm
6. purchase・hold・exclude・restore
7. pending GAS updates retry・discard
8. event/day switch
9. reload resume・reset start
10. activity/event-day/all-events deletion

- [ ] **Step 11: handoffを作成する**

`docs/reviews/phase-05d-handoff.md`に次を記録する。

- Task commit list
- old→new file map
- final directory tree
- canonical naming glossary
- feature public API list
- `ComiPathApplication` line count
- deleted legacy files
- architecture/naming checker result
- unit/integration/build/E2E/C108 smoke result
- LocalStorage/GAS/CSV/route guidance contract result
- unresolved risks
- rollback point
- Phase 5E tests/docs refactorで変更してよい範囲

- [ ] **Step 12: Task statusとprogressを証拠に合わせる**

実行証拠があるcheckだけ`[x]`にする。failed、unverified、environment unavailableをPASSにしない。

- [ ] **Step 13: final diffを確認する**

```bash
git diff --check
git status --short --branch
git diff --stat
git ls-files
```

- [ ] **Step 14: commit**

```bash
git add docs
git commit -m "docs(phase-5d): verify apps internal refactor"
```

## Acceptance criteria

- clean installからall required checksが成功する。
- architecture allowlist、legacy files、deep import、vague new namesが存在しない。
- application shellのline countと責務がdesignを満たす。
- existing user flowsとdata contractsにregressionがない。
- handoffがPhase 5Eのtests/docs refactorに必要なpublic APIsとtest ownershipを説明する。
- 未確認事項が明示され、Phase完了判定が証拠に基づく。
