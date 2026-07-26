# Phase 5C Task 10: Final Verification and Handoff

**Status:** Not started  
**Depends on:** Phase 5C Tasks 1-9  
**Commit candidate:** `docs: complete phase 5c navigation handoff`

## Goal

Phase 5Cをclean installから検証し、schema migration、GAS安全性、Worker、matrix cache、TOPTW、navigation flow、recovery、deletion、mobile accessibilityを確認する。新機能は追加しない。

## Files allowed to change

- Phase 5C計画・Task completion record
- `docs/status/progress.md`
- `docs/reviews/phase-05c-handoff.md`
- 利用者向け案内文書
- 検証で発見したPhase 5C範囲内の欠陥とtest

## Procedure

- [ ] working treeとtracked private fileを確認する。

```bash
git status --short --branch
git diff --check
git ls-files maps
git ls-files '*.py' '*.pyc'
```

- [ ] clean installと全verificationを実行する。

```bash
rm -rf node_modules dist
npm ci
npm run verify
npm run test:e2e
node scripts/audit-public-tree.mjs
```

- [ ] C108実ブラウザsmokeを再実行する。

```bash
RUN_C108_SMOKE=1 npx playwright test tests/c108-map-browser-smoke.spec.ts --project=chromium
RUN_C108_SMOKE=1 npx playwright test tests/c108-map-browser-smoke.spec.ts --project=mobile-chromium
```

- [ ] legacy storage migrationをfixtureで再検証する。
- [ ] GAS offline/timeout/outbox recoveryを再検証する。
- [ ] LocalStorage quota errorを再検証する。
- [ ] Worker cancel/stale messageを再検証する。
- [ ] 5/15/30/60秒設定とdefault 15秒を再検証する。
- [ ] current first leg固定を再検証する。
- [ ] area switch、reload、reset、deleteを再検証する。
- [ ] handoff文書を作る。

`docs/reviews/phase-05c-handoff.md`:

```markdown
# Phase 5C Handoff

## Integrated commit range
## Storage schema version and migration
## Circle state contract
## Navigation state contract
## Worker message contract
## Distance matrix cache key and storage contract
## TOPTW adapter contract
## Optimization time settings
## Arrival and hold behavior
## Per-map behavior
## Reload recovery
## Deletion scopes
## GAS safety verification
## Unit/integration/E2E results
## C108 smoke results
## Accessibility results
## Public boundary result
## Known limitations
## Deferred work
```

- [ ] progressとPhase indexを実態に合わせて更新する。
- [ ] 最終差分、検証結果、提案commit messageをユーザーへ提示する。commit、push、PR、mergeは行わない。

## Acceptance criteria

- clean installから全verificationが成功する。
- migrationとGAS safetyが成功する。
- matrix Worker、TOPTW、cancel、warm start、first-leg lockが成功する。
- mobile E2Eとaccessibilityが成功する。
- C108 4 area smokeが成功する。
- public/private auditが成功する。
- handoffに実際の型名、key、schema version、test結果がある。
- Phase 5Dや外部情報featureを実装していない。
- commit、push、PRを自動実行していない。
