# Phase 5D Task 10: Phase Verification and Handoff

**Status:** PLANNED
**Depends on:** Tasks 1-9
**Commit candidate:** `docs(phase-5d): verify architecture refactor`

## Goal

clean environmentで全contract、architecture、desktop/mobile操作、C108実地図を検証し、Phase 5Dの完了可否と今後の拡張方法をhandoffへ記録する。本Taskではfeature実装を追加しない。

## Files

### Create

- `docs/reviews/phase-05d-handoff.md`

### Modify

- `docs/plans/phase-05d/README.md`
- `docs/plans/phase-05d/task-01-characterization-and-architecture-guardrails.md`
- `docs/plans/phase-05d/task-02-composition-root-and-app-shell.md`
- `docs/plans/phase-05d/task-03-active-event-day-session.md`
- `docs/plans/phase-05d/task-04-circle-state-and-sync-extraction.md`
- `docs/plans/phase-05d/task-05-navigation-feature-extraction.md`
- `docs/plans/phase-05d/task-06-source-management-extraction.md`
- `docs/plans/phase-05d/task-07-event-day-and-storage-controllers.md`
- `docs/plans/phase-05d/task-08-ui-view-split.md`
- `docs/plans/phase-05d/task-09-remove-legacy-facades.md`
- `docs/status/progress.md`
- `docs/README.md`
- `docs/plans/roadmap.md`

### Forbidden

- production behavior変更
- visual polish
- dependency追加
- failed testをskipへ変更
- snapshotを理由なしに更新

## Interfaces

本Taskはproduction interfaceを追加・変更しない。Task 9で確定したfeature public APIと`AppController`を検証対象とする。

## TDD Procedure

- [ ] **Step 1: clean worktreeとcommit範囲を確認する**

```bash
git status --short --branch
git log --oneline --decorate -15
git diff main...HEAD --stat
git diff main...HEAD -- apps/webapp/js package.json scripts tests docs
```

Task外差分、未追跡実地図、credentialがある場合は停止する。

- [ ] **Step 2: clean installを実行する**

```bash
rm -rf node_modules
npm ci
```

- [ ] **Step 3: static architectureとpublic boundaryを検証する**

```bash
node scripts/check-webapp-architecture.mjs
npx biome check
npm run check:webapp
node scripts/audit-public-tree.mjs
git diff --check
```

- [ ] **Step 4: unit/integration/buildを検証する**

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

desktop、mobile、keyboard、resume、source、storageの既存testをskip増加なしで確認する。

- [ ] **Step 6: C108 smokeを検証する**

```bash
RUN_C108_SMOKE=1 npx playwright test tests/c108-map-browser-smoke.spec.ts \
  --project=chromium --project=mobile-chromium
```

4 area × desktop/mobileを確認する。

- [ ] **Step 7: legacyとsizeを監査する**

```bash
test ! -e apps/webapp/js/app.js
test ! -e apps/webapp/js/data-manager.ts
test ! -e apps/webapp/js/ui-manager.js
test ! -e scripts/webapp-architecture-legacy-allowlist.json
wc -l apps/webapp/js/app/app.ts
rg 'data-manager|ui-manager|js/app\.js' apps/webapp/js tests scripts
```

`app.ts`が200 lines以下で、production/test importが0であることを記録する。

- [ ] **Step 8: feature boundaryを人手レビューする**

各featureについて次を記録する。

- UI event入口
- Controller
- Use Case
- Domain
- Port
- concrete adapter
- state owner
- dispose owner
- cross-feature public contract

内部pathのcross-feature import、sharedへのfeature rule漏出、composition root外のconcrete wiringがないことを確認する。

- [ ] **Step 9: handoffを作成する**

`docs/reviews/phase-05d-handoff.md`へ次を記載する。

- commit一覧
- moved/deleted file一覧
- final architecture map
- `App` line count
- legacy facade absence
- architecture checker result
- unit/integration/build/E2E/C108 smoke結果
- storage/GAS/CSV/navigation contract確認
- unresolved risk
- Phase 5Eが利用するpublic feature API
- rollback point

- [ ] **Step 10: Taskとprogressを実態に合わせる**

証拠がある項目だけ`[x]`へ変更する。失敗、未確認、環境不足を成功扱いにしない。

- [ ] **Step 11: final diffを確認する**

```bash
git diff --check
git status --short --branch
git diff --stat
git ls-files
```

- [ ] **Step 12: commit**

```bash
git add docs
git commit -m "docs(phase-5d): verify architecture refactor"
```

## Acceptance Criteria

- clean installから全検証が成功する。
- architecture allowlist、legacy facade、production deep importが存在しない。
- `App` line countと責務がdesign完了条件を満たす。
- existing user flowとdata contractにregressionがない。
- handoffがPhase 5E実装者に必要なfeature public APIを説明する。
- 未確認事項が明示され、Phase完了判定が証拠に基づく。
