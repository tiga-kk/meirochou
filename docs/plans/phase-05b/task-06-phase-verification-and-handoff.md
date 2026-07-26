# Phase 5B Task 6: Final Verification and Phase 5C Handoff

**Status:** Not started  
**Depends on:** Phase 5B Tasks 1-5  
**Commit candidate:** `docs: complete phase 5b handoff`

## Goal

Phase 5B全体をclean installから検証し、公開境界、実地図bundle、C108 production登録、demo fixture、実ブラウザsmoke、benchmark結果を確認する。Phase 5Cが推測なしで開始できるhandoffを作る。

## User-visible result

C108 map bundle統合がPhase単位で完了し、Phase 5Cへ進める状態になる。このTaskで新機能を追加しない。

## Files allowed to change

- `docs/plans/phase-05b/README.md`
- 各Phase 5B Taskのcompletion record
- `docs/status/progress.md`
- `docs/reviews/phase-05b-handoff.md`
- 検証で発見したPhase 5B範囲内の欠陥と、そのtest
- 検証scriptの明白な誤り

## Files forbidden to change

- Phase 5Cの実装
- schema
- Worker
- TOPTW
- navigation UI
- external information feature
- visual redesign

## Procedure

- [ ] **Step 1: clean stateを確認する**

```bash
git status --short --branch
git diff --check
git ls-files maps
git ls-files '*.py' '*.pyc'
```

Expected:

- Task 1-5の承認済み差分だけがある。
- `maps`のtracked fileがない。
- Python地図生成・最適化実装がない。

- [ ] **Step 2: clean install検証を実行する**

```bash
rm -rf node_modules dist
npm ci
npm run verify
```

Expected: PASS。

- [ ] **Step 3: E2Eを実行する**

```bash
npm run test:e2e
RUN_C108_SMOKE=1 npx playwright test tests/c108-map-browser-smoke.spec.ts --project=chromium
RUN_C108_SMOKE=1 npx playwright test tests/c108-map-browser-smoke.spec.ts --project=mobile-chromium
```

Expected:

- fictional E2EがPASS。
- C108 4 area smokeがPASS。

- [ ] **Step 4: public treeとbuild outputをauditする**

```bash
node scripts/audit-public-tree.mjs
npm run build:webapp
npm run verify:webapp:build
find dist -type f | sort
grep -RInE 'maps/C108|/Users/|/home/|[A-Za-z]:\\\\' dist apps/webapp/map-bundles/C108 docs/reviews || true
```

Expected:

- public C108 assetは存在する。
- private path、元地図、Python、中間画像は存在しない。
- registryはC108だけを公開する。

- [ ] **Step 5: manifestとassetの再検証を実行する**

```bash
npx vitest run tests/c108-map-assets.test.ts tests/event-registry.test.ts tests/map-manifest-loader.test.ts tests/public-boundary.test.mjs tests/deployment-build.test.mjs
npm run benchmark:c108-routing
```

Task 5のbenchmarkと大幅な差がある場合、環境差または回帰を記録する。

- [ ] **Step 6: handoff文書を作る**

`docs/reviews/phase-05b-handoff.md`に次を確定値で記録する。

```markdown
# Phase 5B Handoff

## Integrated commit range
## C108 bundle version
## Four area IDs and display names
## Public manifest path
## Production event/day configuration
## Demo fixture location
## Grid value and weight contract
## Validation commands and results
## Reachability results
## Browser smoke results
## Benchmark results
## Largest matrix estimate
## Phase 5C entry facts
## Known limitations
## Files that must remain private
```

「たぶん」「必要に応じて」などの曖昧語を使わない。
未確認項目は`未確認`として理由を書く。

- [ ] **Step 7: progressとPhase indexを更新する**

Phase 5B Task 1-6のstatusを実態に合わせる。
Phase 5Cのentry gateを満たした場合だけ`docs/status/progress.md`をPhase 5C計画レビュー待ちまたはTask 1開始待ちへ更新する。

- [ ] **Step 8: 最終差分を提示する**

```bash
git status --short --branch
git diff --stat
git diff --check
```

commit、push、PRは行わず、差分、検証結果、提案commit messageをユーザーへ提示する。

## Acceptance criteria

- clean installから全verificationが成功する。
- C108実地図smokeがdesktop/mobileで成功する。
- public/private boundary auditが成功する。
- handoffに4 area、bundle version、benchmark、known limitationsがある。
- Phase 5Cが参照すべき実名と計測値が一意である。
- Phase 5C実装を含めていない。
- commit、push、PRを自動実行していない。

## Review checklist

- Task 1-5のacceptance criteriaをすべて再確認したか。
- handoffの数値がTask 5結果と一致するか。
- `docs/status/progress.md`が実態より先へ進んでいないか。
- 実地図のprivate source pathを公開文書へ不要に載せていないか。
- C108だけがproductionに出るか。
- demo-v1 test fixtureが機能するか。

## Completion record

```text
Clean install result:
Unit/integration result:
Fictional E2E result:
C108 desktop smoke:
C108 mobile smoke:
Public audit result:
Handoff path:
Known limitations:
Proposed commit message:
```
