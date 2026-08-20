# Phase 8 Task 0: Baseline Verification and Phase 7.6 Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 最新 `main` の実測結果を基準状態として確定し、Phase 7.6 の実装済み内容に対して残っている genuine regression / verification debt / documentation drift だけを閉じ、後続のイベント汎用化Taskへ安全に進める状態を作る。

**Architecture:** このTaskでは新機能も新しい抽象化も追加しない。現行実装を verification target とし、full verification → failure classification → focused reproduction → 最小修正 → full re-verification の順で処理する。外部サービスや人間visual確認が必要な項目は、自動テスト成功と混同せず verification report に別枠で記録する。

**Tech Stack:** Node.js 22.14.0 / npm 10.9.2 / TypeScript / Vitest / Playwright / Vite / Cloudflare Pages Functions / Git。

**Spec:** `docs/plans/phase-07-6/README.md`, `docs/plans/phase-07-6/task-09-close-x-post-lifecycle-and-regression.md`, `docs/reviews/phase-07-5-field-verification.md`。

## Planning snapshot

- 計画作成時の `main`: `2535a30d0b0b0cb99317982e1b25ccd49f0393c2` (`fix(phase-07-6): harden x-post lifecycle state transitions`)。
- 実装開始SHAは上記へ固定しない。Codex実行時に必ず `origin/main` の最新SHAを取得し、そこを実装基準とする。
- Phase 7.6 Task 1〜9に相当する実装コミットは既に `main` に存在する。
- `docs/status/progress.md` は現在も `Phase 7.6 Task 1実装途中` と記載しており、実コード・履歴より古い。
- `docs/reviews/phase-07-5-field-verification.md` の旧FAILは、その後の `83122ab`（candidate detail）、`467ef47` / `4e17de4`（accepted visual baseline）等より前の記録を含む。旧FAIL件数を現在の期待FAILとしてコピーしてはならない。

## Global Constraints

- このTaskで触るrepositoryは `tiga-kk/meirochou` のみ。`tiga-kk/meirochou_wrapper` はTask 2以降まで変更・基準更新しない。
- Phase 8 Task 1以降のevent map汎用化、wrapper pipeline、`BrowserApplication`大規模分割、初回onboardingを先取りしない。
- 新規library、DI container、generic lifecycle bus、Facade/Managerを追加しない。
- test failureを消すためだけにproduction semanticsを変更しない。現行product contractとtest expectationのどちらが正しいかを先に証拠で決める。
- visual snapshotを `--update-snapshots` で一括更新しない。意味的に正しいことを説明できないdiffは人間確認待ちにする。
- 外部Yahoo/X、Cloudflare preview、実GAS、実機確認をfakeして「確認済み」と書かない。
- `npm run test:e2e:ci` がDocker/CI環境不足で実行不能なら、通常の `playwright test` を同等結果として代用しない。`BLOCKED_ENVIRONMENT` と記録する。
- worktreeの `.git` gitfile由来の絶対パスだけを理由にpublic boundaryを弱めない。監査対象とgit metadataの境界を確認してから最小修正する。
- unrelated cleanup、format-all、rename-all、既存architecture整理を行わない。
- 一度に一failure clusterだけ修正し、focused testをGREENにしてから次へ進む。

## File map

### 必ず作成

- `docs/reviews/phase-08-task-00-baseline-verification.md`
  - 実行環境、開始SHA、各command結果、failure分類、修正内容、未完了の外部確認を記録するTask 0のverification report。

### 最終的に変更

- `docs/status/progress.md`
  - 実測結果とPhase 7.6実装履歴に合わせてcurrent stateを更新する。
  - 自動検証または必須manual acceptanceが未完なら、Phase 7.6を「完了」と偽装しない。

### failureが現在HEADで再現した場合だけ変更候補

- `apps/webapp/js/features/route-guidance/ui/dom-route-guidance-view.ts`
- `tests/route-map-candidate-preview.test.ts`
- `tests/e2e/navigation-resume.spec.ts`
- route snapshot/runtime関連の既存file
- `tests/public-boundary.test.mjs`
- `scripts/audit-public-tree.mjs`
- `tests/e2e/webapp.spec.ts`
- `tests/e2e/*-snapshots/*`
- Phase 7.6 Task 9で変更されたX lifecycle / cache / gallery / optimization関連fileとtest

上記候補を事前に全部編集してはならない。full verificationで再現したfailureのownerだけを変更する。

---

### Task 0.1: 実装開始点と再現環境を固定する

**Files:**
- Modify: none

**Interfaces:**
- Consumes: latest `origin/main`, `package.json` toolchain declaration。
- Produces: start SHA、Node/npm version、clean/dirty状態の実測値。

- [ ] **Step 1: remoteとworking treeを確認する**

```bash
git fetch origin --prune
git status --short
git rev-parse HEAD
git rev-parse origin/main
git log -1 --oneline origin/main
```

期待:
- unrelatedな未commit変更がない。
- 実装開始SHAとして `origin/main` の最新SHAを記録できる。

plan branchが `origin/main` より古い場合は、working treeがcleanであることを確認してからplan commitを最新 `origin/main` 上へrebaseする。rebase conflictを場当たり的に解消してproduction codeを変更しない。

- [ ] **Step 2: toolchainを確認する**

```bash
node --version
npm --version
```

`package.json` の期待は Node `22.14.0`, npm `10.9.2`。別versionしか使えない場合はverification reportへ実versionを残す。version差を隠すために `package.json` / lockfileを変更しない。

- [ ] **Step 3: dependenciesをlockfileから再現する**

```bash
npm ci
```

`npm ci` 自体が環境要因で失敗した場合は、その時点で `BLOCKED_ENVIRONMENT` として原因を記録し、test failureと混ぜない。

---

### Task 0.2: 最新HEADのfull baselineを先に測定する

**Files:**
- Create: `docs/reviews/phase-08-task-00-baseline-verification.md`
- Modify: none before measurement

**Interfaces:**
- Consumes: Task 0.1 start SHA。
- Produces: current automated failure set。旧Phase 7.5記録ではなく、この結果だけを修正判断の正本とする。

- [ ] **Step 1: verification reportを作る**

`docs/reviews/phase-08-task-00-baseline-verification.md` に次のsectionを作り、Task 0.1で得た実値を直ちに記入する。

```markdown
# Phase 8 Task 0 baseline verification

## Environment

## Initial automated verification

| Command | Result | Failure classification | Action |
|---|---|---|---|

## Focused diagnosis

## Manual / external acceptance

## Final automated verification

## Final verdict
```

`Environment` には最低限 start SHA、`git log -1 --oneline origin/main`、Node version、npm version、実行日を実値で書く。

- [ ] **Step 2: full automated gatesを変更前に実行する**

```bash
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
git diff --check
```

それぞれのexit code、pass/fail/skip数、失敗test名をreportへ記録する。

- [ ] **Step 3: failureを分類する**

failureごとに必ず次のいずれかへ分類する。

```text
CURRENT_PRODUCT_REGRESSION
STALE_TEST_EXPECTATION
ACCEPTED_VISUAL_BASELINE_DRIFT
ENVIRONMENT_FALSE_POSITIVE
EXTERNAL_ACCEPTANCE_REQUIRED
UNKNOWN_NEEDS_DIAGNOSIS
```

分類理由を1〜3文で書く。`既存失敗`だけでは分類理由にならない。

旧 `docs/reviews/phase-07-5-field-verification.md` の件数は比較資料にだけ使い、現在のfailure setへ自動継承しない。

---

### Task 0.3: Phase 7.6 closure用focused regressionを再確認する

**Files:**
- Modify only if a reproduced failure requires it
- Test: existing focused tests

**Interfaces:**
- Consumes: Phase 7.6 Task 9 lifecycle / wall / gallery contracts。
- Produces: Phase 7.6実装がfocused testsでも維持されている証拠。

- [ ] **Step 1: lifecycle/cleanup clusterを実行する**

```bash
npx vitest run --root . \
  tests/x-post-cleanup.test.ts \
  tests/x-post-runtime-lifecycle.test.ts \
  tests/application-assembly.test.ts \
  tests/apps-behavior-characterization.test.ts \
  tests/architecture-boundaries.test.mjs
```

期待: 全PASS。

- [ ] **Step 2: wall / optimization / gallery clusterを実行する**

```bash
npx vitest run --root . \
  tests/wall-circle-classification.test.ts \
  tests/c108-map-assets.test.ts \
  tests/prepare-route-optimization.test.ts \
  tests/optimization-input-adapter.test.ts \
  tests/gallery-view-model.test.ts \
  tests/gallery-ordering.test.ts
```

期待: 全PASS。

- [ ] **Step 3: 旧Phase 7.5 failure probesは現在failureがある場合だけ再実行する**

candidate preview関連failureがcurrent full verificationに出た場合:

```bash
npx vitest run --root . tests/route-map-candidate-preview.test.ts
```

navigation resume関連failureが出た場合:

```bash
npx playwright test tests/e2e/navigation-resume.spec.ts
```

public boundary関連failureが出た場合:

```bash
node --test tests/public-boundary.test.mjs
node scripts/audit-public-tree.mjs
```

ここでPASSするものは「昔失敗していた」という理由だけで変更しない。

---

### Task 0.4: 再現したgenuine failureだけを最小修正する

**Files:**
- Modify: reproduced failure owner only
- Test: corresponding focused test first

**Interfaces:**
- Consumes: Task 0.2/0.3の再現ログ。
- Produces: focused GREENを持つ最小修正。

- [ ] **Step 1: non-visual failureごとにroot causeをreportへ先に書く**

各failureについて最低限、以下の6項目を実値で記録する。

1. failing test name
2. reproduction command
3. actual behavior
4. expected product contract
5. root cause
6. owner fileと、そのfileが責務ownerである理由

- [ ] **Step 2: CURRENT_PRODUCT_REGRESSIONなら既存testをRED証拠として使う**

既存testがproduct contractを十分固定しているなら新規testを量産しない。必要なedge caseが欠けている場合だけ、同じtest fileへ最小caseを追加する。

実装はfailure ownerだけを変更し、別featureのrefactorを同時に行わない。

- [ ] **Step 3: STALE_TEST_EXPECTATIONならproduction codeをtestへ合わせない**

現行domain/runtime contractと既存unit testsからproduct behaviorが正しいと証明できる場合だけtest expectationを更新する。

特に `optimizationGeneration` のような内部generation値については、永続snapshotの契約として本当に必要かを `route-guidance-types.ts` / snapshot repository / resume use case / runtime controllerから確認する。単一E2E assertionだけを根拠にproduction snapshotへ値を復活させない。

- [ ] **Step 4: public-boundaryがworktree metadataだけで失敗する場合を分離する**

`node scripts/audit-public-tree.mjs` がPASSし、`tests/public-boundary.test.mjs`だけが `.git` gitfileのlocal absolute pathを拾う場合:

1. audit対象がrepository contentなのかgit metadataなのかを確認する。
2. `.git` metadataをpublic artifactとして扱う設計根拠がなければ、test/helper側でgit metadataだけを監査対象外へする最小修正を行う。
3. 任意pathの絶対パス検出を全般的に弱めない。

- [ ] **Step 5: visual failureは自動承認しない**

既存baselineとactualの差分を確認し、次のいずれかへ分類する。

```text
A. Phase 7.5で承認・更新済みの表示と同じで、実行環境差だけが原因
B. Phase 7.6の意図した投稿panel / warning / gallery badgeによる期待差分
C. 意図不明またはlayout regressionの可能性あり
```

A/Bでも、意味的に正しい理由をreportへ記録する。Cはsnapshot更新せず `MANUAL_VISUAL_ACCEPTANCE_REQUIRED` とする。

- [ ] **Step 6: 各修正後にfocused testをGREENにする**

各failureでTask 0.2/0.3の再現commandをそのまま再実行し、PASSを確認してからcommitする。

candidate Escape regressionを修正した場合のcommit message例:

```bash
git commit -m "fix(baseline): restore candidate escape cancel path"
```

navigation resumeのstale expectationだけを修正した場合のcommit message例:

```bash
git commit -m "test(baseline): align navigation resume persistence contract"
```

実際に修正していないcluster名をcommit messageへ使わない。一つのcommitへ無関係なfailure clusterをまとめない。

---

### Task 0.5: manual / external acceptanceを自動結果と分離する

**Files:**
- Modify: `docs/reviews/phase-08-task-00-baseline-verification.md`

**Interfaces:**
- Consumes: Phase 7.6 Task 9 live acceptance requirements、既存Phase 7.5 external GAS debt。
- Produces: 「確認済み」「未確認」「環境不足」が混ざらないmanual checklist。

- [ ] **Step 1: Cloudflare/X live smokeの実行可否を判定する**

既にアクセス可能なpreview/production URLがあり、追加secret変更なしで確認できる場合だけlive smokeする。

最低確認:

```text
- /api/x-posts routeが存在する
- invalid handleで任意Yahoo query proxyにならない
- public X handleでnormalized successまたは観測可能なnormalized errorになる
- X取得失敗でもroute/galleryの主要操作が利用可能
- Pixiv accountはbrowserからX API requestを発生させない
```

認証・deploy権限・preview URLがなければ `EXTERNAL_ACCEPTANCE_REQUIRED`。secret作成、Cloudflare設定変更、production deployはいずれもTask 0では行わない。

- [ ] **Step 2: mobile / 200% zoom / offline項目を記録する**

headless E2Eで証明できる項目と、人間の見た目/gesture確認が必要な項目を分ける。人間確認していないものへ `PASS` を付けない。

- [ ] **Step 3: 既存GAS外部確認残件を保持する**

次の2件はPhase 7.6 X機能とは独立した既存debtとしてreportへ残す。

```text
- 実GASで同一space再送が既存行更新になる証拠
- GAS更新時に対象外の既存Sheet列が保持される証拠
```

Task 0で資格情報がない場合、GAS実装を書き換えて代替しない。Phase 7.6 closure判定とは別欄で `OPEN_EXTERNAL_DEBT` とする。

---

### Task 0.6: final verificationとprogress正本を更新する

**Files:**
- Modify: `docs/reviews/phase-08-task-00-baseline-verification.md`
- Modify: `docs/status/progress.md`

**Interfaces:**
- Consumes: 全focused修正とmanual/external status。
- Produces: 後続Task 1が信頼できるbaseline。

- [ ] **Step 1: final full automated verificationを実行する**

```bash
npm run verify
npm run test:e2e:ci
node scripts/audit-public-tree.mjs
git diff --check
```

期待: 実行可能なautomated gateは全PASS。

`npm run test:e2e:ci` が環境理由で実行不能な場合は、代替commandをPASSとして扱わずreportへ明記する。

- [ ] **Step 2: verification reportを完成させる**

final reportに最低限以下を実値で記録する。

```text
start SHA
final code SHA before docs commit
Node/npm version
initial full verification result
all reproduced failures
classification
root cause
modified files
focused verification
final full verification
manual/live acceptance status
remaining external GAS debt
```

- [ ] **Step 3: `docs/status/progress.md`のstale stateを修正する**

少なくとも次を実コードと一致させる。

```text
- Phase 7.6 Task 1途中という記述を除去
- Task 1〜9の実装履歴を現状に合わせる
- automated verification結果をTask 0 reportへリンク
- manual/live acceptanceが未完なら明示
- Phase 7.6を閉じられる条件を満たした場合だけ完了とする
- GAS 2件は独立external debtとして残す
- Phase 7.6 closure後の次作業をPhase 8 Task 1 event map contract汎用化とする
```

Phase 7.6 manual/live acceptanceが未完の場合、current stateはPhase 7.6 closure verificationのままにする。Phase 8 Task 1開始済みとは書かない。

全条件を満たした場合だけ、current phaseをPhase 8、Task 0完了、nextをTask 1 event map contract汎用化へ進める。

- [ ] **Step 4: docs差分を確認する**

```bash
git diff --check
git diff -- docs/status/progress.md docs/reviews/phase-08-task-00-baseline-verification.md
```

旧 `Phase 7.6 Task 1実装途中` が進捗正本に残っていないことを確認する。

- [ ] **Step 5: docsをproduction/test修正と分離してcommitする**

```bash
git add docs/status/progress.md docs/reviews/phase-08-task-00-baseline-verification.md
git commit -m "docs(baseline): record phase 7.6 closure verification"
```

- [ ] **Step 6: branchをpushする**

```bash
git push origin HEAD
```

mainへmergeしない。ユーザーのレビュー対象としてbranchを残す。

## Acceptance Criteria

- latest `origin/main` を開始点にした実測baselineが残っている。
- Phase 7.5時点の古いFAIL件数を現在FAILとして誤記していない。
- `npm run verify`, `npm run test:e2e:ci`, `node scripts/audit-public-tree.mjs`, `git diff --check` の最新結果がreportにある。
- 再現したnon-visual regressionはfocused testと最小修正で閉じている。
- stale test expectationを満たすためだけのproduction semantics変更がない。
- visual snapshotの無条件更新がない。
- Phase 7.6 Task 9のX lifecycle / cleanup / wall optimization / gallery regressionsがfocused suiteで確認されている。
- manual/live acceptanceの未確認項目を自動PASSと偽装していない。
- 既存GAS 2件はPhase 7.6と分離したexternal debtとして追跡されている。
- `docs/status/progress.md` が実コード・commit履歴・verification結果と一致している。
- `meirochou_wrapper`、event map汎用化、`BrowserApplication`リファクタ、onboardingへ変更が波及していない。
- implementation branchがpushされ、mainへ勝手にmergeされていない。

## Stop Conditions

次の場合は「完了」と書かず、その状態までのcommit/reportをpushして停止する。

1. `npm ci` / E2E container等が実行環境不足で再現不能。
2. visual diffが意味的に正しいか人間判断を要する。
3. Cloudflare/X live smokeに認証・preview URL・deploy操作が必要。
4. manual mobile/gesture確認が必要。
5. genuine regressionの修正がPhase 8 Task 1以降の設計変更を必要とするほど広い。

停止時の最終応答には `BLOCKED_ENVIRONMENT`, `MANUAL_VISUAL_ACCEPTANCE_REQUIRED`, `EXTERNAL_ACCEPTANCE_REQUIRED` 等の該当理由、再現command、残っているfailure名、ユーザーが確認すべき具体項目を示す。推測でPhaseを閉じない。
