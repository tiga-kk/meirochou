# Phase 5D Task 10: Verify Apps Refactor and Write Handoff

**Status:** IMPLEMENTED (handoff recorded; Phase exit gate BLOCKED)
**Depends on:** Tasks 1、2、3、3.1、4、5、6、7、8、9 reviewed
**Commit candidate:** `docs(phase-5d): verify apps internal refactor`

## Goal

clean environmentでapps architecture、naming、unit/integration、desktop/mobile操作、C108実地図を検証し、Phase 5Dの完了可否とPhase 5Eが利用するpublic APIsをhandoffへ記録する。本Taskではproduction featureを追加しない。

## Files

### Create

- `docs/reviews/phase-5d-handoff.md`

### Modify

- `docs/plans/phase-05d/README.md`
- all Phase 5D Task documents, including `task-03-1-correct-foundation-review-findings.md`
- `docs/status/progress.md`
- `docs/README.md`
- `docs/plans/roadmap.md`

### Forbidden

- production behavior変更
- failed testのskip化
- focused testだけを根拠にPhase完了とすること
- 理由のないsnapshot更新
- architecture allowlist再作成
- concrete infrastructureのpublic API export
- `tests/`または`docs/`の全面再配置

## Verification procedure

- [ ] **Step 1: branch、worktree、Task commitsを確認する**

```bash
git status --short --branch
git log --oneline --decorate -30
git diff main...HEAD --stat
git diff main...HEAD -- apps/webapp/js package.json scripts tests docs
```

Task外差分、credential、private map source、untracked production fileがあれば停止する。

- [ ] **Step 2: Task sequenceを確認する**

Task 1、2、3、3.1、4、5、6、7、8、9のcommitとreview結果をhandoff draftへ列挙する。Task 3.1がない場合はPhase完了にしない。

- [ ] **Step 3: clean installを実行する**

```bash
rm -rf node_modules
npm ci
```

- [ ] **Step 4: architecture、naming、test registrationを検証する**

```bash
node scripts/check-webapp-architecture.mjs
npx vitest run --root . \
  tests/architecture-boundaries.test.mjs \
  tests/event-day-layer-boundaries.test.mjs \
  tests/legacy-app-files-removed.test.mjs \
  tests/comipath-application-responsibility.test.mjs

npx biome check
npm run check:webapp
git diff --check
```

`package.json`の`test:webapp`にPhase 5Dで追加した全test fileが含まれることをscriptまたはmanual listで確認する。focused-only testを残さない。

- [ ] **Step 5: layer boundaryをgrepで補助監査する**

```bash
rg 'AbortController|AbortSignal|localStorage|fetch|document|window|Worker' \
  apps/webapp/js/features/*/use-cases

rg 'LocalStorage|Http|Browser|WebWorker|Gas[A-Za-z]*Client' \
  apps/webapp/js/features/*/public-api.ts

rg 'features/[^/]+/(domain|use-cases|infrastructure|ui)/' \
  apps/webapp/js/features/*/public-api.ts
```

Expected:

- first command has no direct browser/concrete dependency
- second command has no concrete export
- third command is human review用。export targetがsame feature contractだけであることを確認

- [ ] **Step 6: pending GAS updates single sourceを確認する**

```bash
rg 'gasOutbox' apps/webapp/js
rg 'LocalStoragePendingGasUpdate|pending-gas-update.*storage|pending.*queue.*key' \
  apps/webapp/js
```

Expected:

- `gasOutbox`はevent/day persisted stateとCircle Status featureから扱われる
- separate LocalStorage queue/keyは0

- [ ] **Step 7: lifecycle contractsを検証する**

```bash
npx vitest run --root . \
  tests/browser-application-lifecycle.test.ts \
  tests/comipath-application.test.ts \
  tests/application-assembly.test.ts \
  tests/apps-behavior-characterization.test.ts
```

確認項目:

- DOM準備前stopでpending Promiseがsettle
- pagehide/manual stopがidempotent
- failed instanceをretryしない
- stop後のrequest/timer/Worker callbackがstate/UIを更新しない
- listener二重登録なし

- [ ] **Step 8: unit/integration/build/GASを検証する**

```bash
npm run test:webapp
npm run build:webapp
npm run verify:webapp:build
npm run verify:gas
```

- [ ] **Step 9: full E2Eを検証する**

```bash
npm run test:e2e
```

desktop、mobile、keyboard、resume、source import、pending GAS updates、event/day switch、local data deletionについてskip増加がないことを確認する。

- [ ] **Step 10: C108 smokeを検証する**

```bash
RUN_C108_SMOKE=1 npx playwright test \
  tests/c108-map-browser-smoke.spec.ts \
  --project=chromium --project=mobile-chromium
```

4 map areas × desktop/mobileを確認する。

- [ ] **Step 11: public boundaryを検証する**

```bash
node scripts/audit-public-tree.mjs
git ls-files
```

raw CSV、GAS URL、sheet内容、external post body、map source、credentialがartifact/public treeへ混入していないことを確認する。

- [ ] **Step 12: legacy absenceとline countを監査する**

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

find apps/webapp/js/features -name index.ts -print
```

Expected:

- all `test ! -e` succeed
- application file <= 200 physical lines
- deleted import search has no results
- feature `index.ts` has no results

曖昧名は単純grepだけでなくarchitecture checkerのtoken-aware resultを正本にする。legacy test description内の単語だけでFAILさせない。

- [ ] **Step 13: feature boundaryをhuman reviewする**

各featureについてhandoffへ次を記録する。

- public API
- Controller
- Use Cases
- Domain owner
- external capability interfaces
- concrete infrastructure
- mutable state owner
- start/stop owner
- cross-feature collaborators
- contract tests

特に次を確認する。

- Repository interfaceとLocalStorage classが別file
- concrete classはassemblyだけが生成
- public APIにconcrete exportなし
- Use Caseにbrowser APIなし
- cross-feature deep importなし

- [ ] **Step 14: user flowをhuman smokeで確認する**

1. initial event/day open
2. CSV preview・apply・cancel
3. Google Sheet sheet list・preview・cancel
4. current locationからroute guidance start
5. destination select・route comparison・confirm
6. purchase・hold・exclude・restore
7. pending GAS updates retry・discard
8. event/day switch
9. reload resume・reset start
10. activity/event-day/all-events deletion
11. request中にsettings close/event-day switch/pagehideしてstale updateがない

- [ ] **Step 15: handoffを作成する**

`docs/reviews/phase-5d-handoff.md`へ次を記録する。

- Task commit list、Task 3.1 review reason
- old→new file map
- final directory tree
- naming glossary
- feature public APIs
- concrete infrastructure listとassembly wiring
- state owners
- cancellation/lifecycle contracts
- `ComiPathApplication` line count
- deleted legacy files
- architecture/naming result
- unit/integration/build/E2E/C108 result
- LocalStorage/GAS/CSV/route guidance contract result
- unresolved risks
- rollback point
- Phase 5E tests/docs refactorで変更してよい範囲

- [ ] **Step 16: Task statusとprogressを証拠に合わせる**

実行証拠があるcheckだけ`[x]`にする。failed、unverified、environment unavailableをPASSにしない。

- [ ] **Step 17: final diffを確認する**

```bash
git diff --check
git status --short --branch
git diff --stat
git ls-files
```

- [ ] **Step 18: commit**

```bash
git add docs
git commit -m "docs(phase-5d): verify apps internal refactor"
```

## Acceptance criteria

- Task 3.1を含む全Taskがreview済みである。
- clean installからall required checksが成功する。
- architecture allowlist、legacy files、deep import、vague new namesが存在しない。
- Use Caseにconcrete/browser dependencyがない。
- public APIにconcrete infrastructure exportがない。
- pending GAS updatesの永続正本が`gasOutbox`だけである。
- browser lifecycle Promiseとstop後stale workのcontractがtestされる。
- application shellのline countと責務がdesignを満たす。
- existing user flowsとdata contractsにregressionがない。
- handoffがPhase 5Eのtests/docs refactorに必要なpublic APIsとtest ownershipを説明する。
- 未確認事項が明示され、Phase完了判定が証拠に基づく。
