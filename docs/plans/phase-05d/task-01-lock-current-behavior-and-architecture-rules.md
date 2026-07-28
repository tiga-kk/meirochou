# Phase 5D Task 1: Lock Current Behavior and Architecture Rules

**Status:** PLANNED
**Depends on:** Phase 5C completion
**Commit candidate:** `test(architecture): lock apps behavior and boundaries`

## Goal

production codeを変更せず、Phase 5D開始時点の主要behavior、dependency violations、naming violationsを機械的に固定する。以後のTaskで新しい逆依存や曖昧な名前を増やせない状態にする。

## Files

### Create

- `scripts/check-webapp-architecture.mjs`
- `scripts/webapp-architecture-legacy-allowlist.json`
- `tests/architecture-boundaries.test.mjs`
- `tests/apps-behavior-characterization.test.ts`

### Modify

- `package.json`

### Forbidden

- `apps/webapp/js/`のproduction implementation
- LocalStorage schema
- GAS/CSV/navigation contract
- E2E snapshot
- package dependency

## Preflight

```bash
git status --short --branch
git rev-parse HEAD
test -e apps/webapp/js/data/event-day-key.ts
test -e apps/webapp/js/config.ts
test -e apps/webapp/js/ui/navigation-view-model.ts
test ! -e apps/webapp/js/state/event-day-key.ts
test ! -e apps/webapp/js/config.js
test ! -e apps/webapp/js/features/route-guidance/ui/route-guidance-screen-model.ts
npm run test:webapp
npm run check:webapp
npm run build:webapp
```

Expected baseline:

- working tree clean
- 455/455 tests PASS
- typecheck PASS
- build PASS

差異があればTask文書を先に修正し、production codeへ進まない。

## Interfaces

```js
export function scanWebappArchitecture(options = {}) {
  return {
    files: [],
    imports: [],
    violations: [],
  };
}

export function assertWebappArchitecture(options = {}) {
  const result = scanWebappArchitecture(options);
  if (result.violations.length > 0) {
    throw new Error(formatArchitectureViolations(result.violations));
  }
  return result;
}
```

```ts
export interface ArchitectureViolation {
  readonly ruleId: string;
  readonly importer: string;
  readonly imported: string | null;
  readonly message: string;
}
```

allowlist entryは`ruleId`、`importer`、`imported`の完全一致だけを許可する。wildcard、directory単位許可、message文字列だけの許可を使わない。

## Rules introduced

- feature Domainからbrowser technologyへの依存禁止
- feature Use CaseからUIまたはconcrete Infrastructureへの依存禁止
- cross-feature importは`public-api.ts`だけ
- componentsからRepository、Client、Loader、Optimizerへの依存禁止
- application assemblyは`app/assemble-comipath-application.ts`だけ
- new filename/classに`Manager`、`Handler`、`Helper`、`Utils`、`Common`を使うことを禁止
- `index.ts`によるcross-feature barrel export禁止
- non-literal dynamic import禁止
- current legacy violationsはexact allowlistへ固定
- allowlist外の新規違反は即FAIL

## TDD procedure

- [ ] **Step 1: architecture scanner fixtureの失敗testを書く**

```js
it("rejects a use case import from infrastructure", () => {
  const result = scanFixture({
    "features/route-guidance/use-cases/bad.ts":
      'import "../infrastructure/web-worker-route-optimizer";',
  });

  expect(result.violations.map((item) => item.ruleId)).toContain(
    "use-case-imports-infrastructure",
  );
});
```

- [ ] **Step 2: vague nameの失敗testを書く**

```js
it("rejects vague new names", () => {
  const result = scanFixture({
    "features/event-day/use-cases/event-day-manager.ts":
      "export class EventDayManager {}",
  });

  expect(result.violations.map((item) => item.ruleId)).toContain(
    "vague-name",
  );
});
```

- [ ] **Step 3: REDを確認する**

```bash
npx vitest run --root . tests/architecture-boundaries.test.mjs
```

Expected: scanner未実装によりFAIL。

- [ ] **Step 4: Node built-insだけでscannerを実装する**

対象は`apps/webapp/js/**/*.{ts,js,mjs}`。static import、`export ... from`、literal dynamic importを解析する。generated build outputとarchiveは対象外にする。

- [ ] **Step 5: current violationsを手動でallowlistへ記録する**

`app.js`、`data-manager.ts`、`ui-manager.js`、`config.ts`、top-level feature foldersに由来する違反だけを一件ずつ確認する。scannerからallowlistを自動生成してcommitしない。

- [ ] **Step 6: public behavior characterization testを書く**

次をinternal methodではなくcustom event、repository effect、View callで固定する。

- startupでlistenerが一回だけbindされる
- event/day selectがactive stateを切り替える
- CSV previewが保存前にdialogを表示する
- purchaseがstate保存後にpending GAS updateを作る
- route startがcurrent destinationとsnapshotを設定する
- delete requestがconfirmationを検証する
- `dispose()`後にlistener、timer、sender、Workerが残らない

```ts
it("binds each browser event once and releases all bindings", async () => {
  const harness = createAppsCharacterizationHarness();

  await harness.start();

  expect(harness.listenerCount("event-day-select")).toBe(1);
  expect(harness.listenerCount("csv-preview-request")).toBe(1);
  expect(harness.listenerCount("resume-confirm")).toBe(1);
  expect(harness.listenerCount("storage-delete-request")).toBe(1);

  harness.stop();
  expect(harness.totalListenerCount()).toBe(0);
});
```

- [ ] **Step 7: package scriptを追加する**

```json
{
  "scripts": {
    "check:webapp:architecture": "node scripts/check-webapp-architecture.mjs"
  }
}
```

Task 9まではexisting `check:webapp`へ組み込まず、各Taskで明示実行する。

- [ ] **Step 8: focused verificationを実行する**

```bash
npx vitest run --root . tests/architecture-boundaries.test.mjs \
  tests/apps-behavior-characterization.test.ts
node scripts/check-webapp-architecture.mjs
```

- [ ] **Step 9: regressionを実行する**

```bash
npm run test:webapp
npm run check:webapp
npm run build:webapp
git diff --check
git status --short --branch
```

- [ ] **Step 10: commit**

```bash
git add package.json scripts/check-webapp-architecture.mjs \
  scripts/webapp-architecture-legacy-allowlist.json \
  tests/architecture-boundaries.test.mjs \
  tests/apps-behavior-characterization.test.ts
git commit -m "test(architecture): lock apps behavior and boundaries"
```

## Acceptance criteria

- production implementationに差分がない。
- current behaviorがpublic boundaryで固定される。
- current violationsだけがexact allowlistに存在する。
- new reverse dependency、deep import、vague nameがFAILする。
- scanner fixture testとcharacterization testがPASSする。
- 455-test baseline、typecheck、buildが維持される。
